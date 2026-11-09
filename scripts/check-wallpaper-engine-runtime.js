'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const {
  WallpaperEngineRuntime,
  safeRuntimeOptions,
  readWallpaperPackageScene,
} = require('../desktop/wallpaper-engine-runtime');

function writeScenePackage(file, scene, extension = '.pkg') {
  assert(['.pkg', '.pak'].includes(extension));
  const header = Buffer.from('PKGV0024', 'ascii');
  const name = Buffer.from('scene.json', 'utf8');
  const sceneBuffer = Buffer.from(JSON.stringify(scene, null, 2), 'utf8');
  const index = Buffer.alloc(4 + header.length + 4 + 4 + name.length + 4 + 4);
  let offset = 0;
  index.writeUInt32LE(header.length, offset); offset += 4;
  header.copy(index, offset); offset += header.length;
  index.writeUInt32LE(1, offset); offset += 4;
  index.writeUInt32LE(name.length, offset); offset += 4;
  name.copy(index, offset); offset += name.length;
  index.writeUInt32LE(0, offset); offset += 4;
  index.writeUInt32LE(sceneBuffer.length, offset);
  fs.writeFileSync(file, Buffer.concat([index, sceneBuffer]));
}

async function overwritePackageScene(file, scene) {
  const packageScene = await readWallpaperPackageScene(file);
  const encoded = Buffer.from(JSON.stringify(scene), 'utf8');
  assert(encoded.length <= packageScene.sceneLength, 'replacement scene fixture must fit the existing package entry');
  const replacement = Buffer.alloc(packageScene.sceneLength, 0x20);
  encoded.copy(replacement);
  const handle = await fs.promises.open(file, 'r+');
  try {
    await handle.write(replacement, 0, replacement.length, packageScene.dataOffset);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function makeSpawnRecorder(records) {
  return (file, args, options) => {
    records.push({ file, args: [...args], options: { ...options } });
    const child = new EventEmitter();
    child.unref = () => { child.unrefCalled = true; };
    queueMicrotask(() => child.emit('spawn'));
    return child;
  };
}

function makePointerRelaySpawn(records, commands, options = {}) {
  let nextPid = Math.max(10000, Number(options.firstPid) || 31000);
  return (file, args, spawnOptions) => {
    const child = new EventEmitter();
    child.pid = nextPid++;
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.unref = () => { child.unrefCalled = true; };
    let exited = false;
    const emitExit = (code = 0) => {
      if (exited) return;
      exited = true;
      queueMicrotask(() => child.emit('exit', code, null));
    };
    child.kill = () => {
      child.killCalled = true;
      emitExit(1);
      return true;
    };
    let stdinBuffer = '';
    child.stdin.setEncoding('utf8');
    child.stdin.on('data', (chunk) => {
      stdinBuffer += String(chunk || '');
      const lines = stdinBuffer.split(/\r?\n/);
      stdinBuffer = lines.pop() || '';
      for (const line of lines) {
        const command = line.trim();
        if (!command) continue;
        commands.push({ pid: child.pid, command });
        if (command === 'Q') emitExit(0);
      }
    });
    child.stdin.once('finish', () => emitExit(0));
    records.push({
      file,
      args: [...args],
      options: { ...spawnOptions, env: { ...spawnOptions.env } },
      child,
    });
    queueMicrotask(() => {
      child.emit('spawn');
      if (options.hang === true) return;
      if (options.fail === true) {
        child.stderr.write('synthetic pointer relay startup failure\n');
        child.emit('error', new Error('synthetic pointer relay startup failure'));
        return;
      }
      child.stdout.write(`${JSON.stringify({
        ok: true,
        ready: true,
        sourceProcessId: 4242,
        hostProcessId: 31337,
        sceneInputWindowHandle: 5252,
      })}\n`);
    });
    return child;
  };
}

function makeDwmSurfaceSpawn(records, commands, options = {}) {
  let nextPid = Math.max(10000, Number(options.firstPid) || 41000);
  return (file, args, spawnOptions) => {
    const child = new EventEmitter();
    child.pid = nextPid++;
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    let exited = false;
    const emitExit = (code = 0) => {
      if (exited) return;
      exited = true;
      queueMicrotask(() => child.emit('exit', code, null));
    };
    child.kill = () => {
      child.killCalled = true;
      emitExit(1);
      return true;
    };
    let stdinBuffer = '';
    child.stdin.setEncoding('utf8');
    child.stdin.on('data', (chunk) => {
      stdinBuffer += String(chunk || '');
      const lines = stdinBuffer.split(/\r?\n/);
      stdinBuffer = lines.pop() || '';
      for (const line of lines) {
        const command = line.trim();
        if (!command) continue;
        commands.push({ pid: child.pid, command });
        if (command === 'Q') {
          emitExit(0);
        } else if (command === 'D') {
          child.stdout.write(`${JSON.stringify({
            ok: true,
            dwm: true,
            active: true,
            surfaceWindowHandle: 6262,
          })}\n`);
        } else if (/^I\|[01]$/.test(command)) {
          child.stdout.write(`${JSON.stringify({
            ok: true,
            iconLayering: true,
            enabled: command === 'I|1',
          })}\n`);
        }
      }
    });
    child.stdin.once('finish', () => emitExit(0));
    records.push({
      file,
      args: [...args],
      options: { ...spawnOptions, env: { ...spawnOptions.env } },
      child,
    });
    queueMicrotask(() => {
      if (options.hang === true) return;
      if (options.fail === true) {
        child.stderr.write('synthetic DWM surface startup failure\n');
        child.emit('error', new Error('synthetic DWM surface startup failure'));
        return;
      }
      const sourceHandle = Number(String(spawnOptions.env.MINERADIO_WE_DWM_SOURCE_ID || '').split(':')[1]) || 4242;
      child.stdout.write(`${JSON.stringify({
        ok: true,
        ready: true,
        hostWindowHandle: Number(spawnOptions.env.MINERADIO_WE_DWM_HOST_WINDOW_ID) || 31337,
        sourceWindowHandle: sourceHandle,
        surfaceWindowHandle: 6262,
        desktopIconLayering: spawnOptions.env.MINERADIO_WE_DWM_DESKTOP_ICON_LAYERING === '1',
      })}\n`);
    });
    return child;
  };
}

async function waitFor(predicate, message, timeoutMs = 2000, pollMs = 10) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  assert.fail(message);
}

function validSignatureExec(records, subject = 'CN=Skutta Software, O=Skutta Software') {
  return (file, args, options, callback) => {
    records.push({ file, args: [...args], options: { ...options } });
    queueMicrotask(() => callback(null, JSON.stringify({ status: 'Valid', subject }), ''));
    return new EventEmitter();
  };
}

function makeTransientControlRecorder(records = []) {
  return (file, args, options, callback) => {
    records.push({ file, args: [...args], options: { ...options } });
    queueMicrotask(() => callback(null, '', ''));
    return new EventEmitter();
  };
}

function makeWindowController(records = []) {
  return async (action, details) => {
    records.push({ action, details: { ...details } });
    return {
      ok: true,
      moved: action === 'embed' || action === 'park',
      embedded: action === 'embed',
      parked: action === 'park',
      aligned: action === 'embed',
      closePosted: action === 'close',
      closed: action === 'close',
      missing: action === 'close',
      rounded: action === 'embed' && Number(details.cornerRadius) > 0,
      visibleWidth: action === 'embed' ? 1280 : (action === 'park' ? 1 : 0),
      visibleHeight: action === 'embed' ? 720 : (action === 'park' ? 1 : 0),
    };
  };
}

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-we-runtime-'));
  const steamLibrary = path.join(temp, 'SteamLibrary');
  const engineRoot = path.join(steamLibrary, 'steamapps', 'common', 'wallpaper_engine');
  const executable = path.join(engineRoot, 'wallpaper64.exe');
  const projectRoot = path.join(temp, 'project');
  const projectFile = path.join(projectRoot, 'project.json');
  const scenePackage = path.join(projectRoot, 'scene.pkg');
  fs.mkdirSync(engineRoot, { recursive: true });
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(executable, 'signed fixture', 'utf8');
  fs.writeFileSync(projectFile, JSON.stringify({
    type: 'scene',
    file: 'scene.json',
    general: {
      properties: {
        newproperty: { type: 'slider', min: 0, max: 1, value: 0.75 },
      },
    },
  }), 'utf8');
  writeScenePackage(scenePackage, {
    objects: [{
      name: 'BGM',
      sound: ['sounds/bgm.mp3'],
      startsilent: false,
      volume: { user: 'newproperty', value: 0.75 },
    }],
  });

  const signatureCalls = [];
  const spawnCalls = [];
  const transientControlCalls = [];
  const libraryCalls = [];
  const windowControlCalls = [];
  const pointerRelaySpawns = [];
  const pointerRelayCommands = [];
  const pointerRelaySpawn = makePointerRelaySpawn(pointerRelaySpawns, pointerRelayCommands);
  const dwmSurfaceSpawns = [];
  const dwmSurfaceCommands = [];
  const dwmSurfaceSpawn = makeDwmSurfaceSpawn(dwmSurfaceSpawns, dwmSurfaceCommands);
  let firstTransientCallback = null;
  let notifyFirstTransient;
  const firstTransientStarted = new Promise((resolve) => { notifyFirstTransient = resolve; });
  let captureCalls = 0;
  let captureSourceId = 'window:4242:0';
  let partialTitleOnlyPolls = 0;
  let exposeGlassCaptureSource = false;
  const runtime = new WallpaperEngineRuntime({
    platform: 'win32',
    arch: 'x64',
    discoverSteamLibraries: async () => [steamLibrary],
    engineProcessProbe: async () => true,
    engineReadyProbe: async () => true,
    useDesktopShellBroker: false,
    nativeTempPath: path.join(temp, 'native'),
    windowController: makeWindowController(windowControlCalls),
    execFile: validSignatureExec(signatureCalls),
    controlExecFile: (file, args, options, callback) => {
      transientControlCalls.push({ file, args: [...args], options: { ...options } });
      if (!firstTransientCallback) {
        firstTransientCallback = callback;
        notifyFirstTransient();
      } else {
        queueMicrotask(() => callback(null, '', ''));
      }
      return new EventEmitter();
    },
    spawn: makeSpawnRecorder(spawnCalls),
    pointerRelaySpawn,
    dwmSurfaceSpawn,
    pointerRelayStartTimeoutMs: 100,
    pointerRelayRetryDelaysMs: [5, 10, 15],
    sleep: async () => {},
    nativeSleep: async () => {},
    library: {
      async getNativeSceneTarget(id) {
        libraryCalls.push(id);
        return {
          id,
          projectFile,
          scenePackage,
          muteProperties: {
            volume: 0,
            newproperty: 0,
            safeCombo: 'quiet_mode',
            maliciousCombo: '0)~END -location Other',
          },
        };
      },
    },
    desktopCapturer: {
      async getSources(options) {
        captureCalls += 1;
        assert.deepStrictEqual(options.types, ['window']);
        const open = spawnCalls.find((call) => call.args[1] === 'openWallpaper');
        if (!open || captureCalls === 1) return [];
        const title = open.args[open.args.indexOf('-playInWindow') + 1];
        if (partialTitleOnlyPolls > 0) {
          partialTitleOnlyPolls -= 1;
          return [{ id: 'window:lookalike:0', name: `${title} preview` }];
        }
        const sources = [{ id: captureSourceId, name: title }];
        if (exposeGlassCaptureSource) {
          sources.push({ id: 'window:6262:0', name: 'Mineradio WE DWM Surface' });
        }
        return sources;
      },
    },
  });

  let stalledLayeringClock = 0;
  const stalledLayeringCommands = [];
  const stalledLayeringChild = new EventEmitter();
  stalledLayeringChild.stdin = {
    destroyed: false,
    writableEnded: false,
    write(value) { stalledLayeringCommands.push(String(value || '').trim()); return true; },
    end() { this.writableEnded = true; },
  };
  stalledLayeringChild.kill = () => true;
  const stalledLayeringRuntime = new WallpaperEngineRuntime({
    platform: 'win32',
    now: () => stalledLayeringClock,
    sleep: async (milliseconds) => { stalledLayeringClock += Number(milliseconds) || 0; },
  });
  const stalledLayeringSession = {
    sessionId: 'eeeeeeeeeeeeeeeeeeeeeeee',
    stopping: false,
    windowEmbedding: { aligned: true },
    dwmSurfaceReady: true,
    dwmSurfaceActive: true,
    dwmSurfaceProcess: stalledLayeringChild,
    dwmDesktopIconLayering: true,
    dwmDesktopIconLayeringAckToken: 0,
    dwmSurfaceDesktopIconLayering: true,
  };
  stalledLayeringRuntime.active = stalledLayeringSession;
  assert.strictEqual(await stalledLayeringRuntime.updateDwmDesktopIconLayering(stalledLayeringSession.sessionId, false), false,
    'an unacknowledged ordinary-layer restore should report the failed hot switch');
  assert.strictEqual(stalledLayeringSession.dwmSurfaceDesktopIconLayering, false,
    'the retry state must still be pinned to ordinary top-level ordering');
  assert.strictEqual(stalledLayeringSession.dwmSurfaceProcess, null,
    'an unresponsive icon-layer helper must be retired before leaving coexistence');
  assert(stalledLayeringCommands.includes('I|0') && stalledLayeringCommands.includes('Q'),
    'the fallback must request ordinary ordering and stop only the Mineradio DWM helper');
  if (stalledLayeringSession.dwmSurfaceRetryTimer) clearTimeout(stalledLayeringSession.dwmSurfaceRetryTimer);
  stalledLayeringSession.dwmSurfaceRetryTimer = null;
  stalledLayeringChild.emit('exit', 0, null);
  stalledLayeringRuntime.active = null;

  const spacedControlCalls = [];
  const spacedControlRuntime = new WallpaperEngineRuntime({
    platform: 'win32',
    useDesktopShellBroker: false,
    controlExecFile: makeTransientControlRecorder(spacedControlCalls),
  });
  await spacedControlRuntime._runTransientControl('C:\\Program Files\\Wallpaper Engine\\wallpaper64.exe', [
    '-control',
    'applyProperties',
    '-properties',
    'RAW~({"volume":0})~END',
    '-location',
    'Mineradio Wallpaper spaced-path-test',
  ]);
  assert.strictEqual(spacedControlCalls.length, 1);
  assert.strictEqual(spacedControlCalls[0].file, 'wallpaper64.exe');
  assert.strictEqual(spacedControlCalls[0].options.cwd, 'C:\\Program Files\\Wallpaper Engine');
  assert(spacedControlCalls[0].args.includes('RAW~({"volume":0})~END'));
  assert(spacedControlCalls[0].args.includes('"Mineradio Wallpaper spaced-path-test"'));
  assert.strictEqual(spacedControlCalls[0].options.shell, false);
  assert.strictEqual(spacedControlCalls[0].options.windowsVerbatimArguments, true);
  await spacedControlRuntime.dispose();

  try {
    const normalized = safeRuntimeOptions({ width: 99999, height: 1, fps: 999, x: -25000, y: 25000 });
    assert.deepStrictEqual(normalized, {
      width: 7680,
      height: 64,
      fps: 240,
      x: -25000,
      y: 25000,
      sourceTimeoutMs: 15000,
      sourcePollMs: 60,
    });

    const probe = await runtime.probe();
    assert.deepStrictEqual(probe, { ok: true, available: true, executable: 'wallpaper64.exe' });
    assert.strictEqual(signatureCalls.length, 1, 'signature verification should run once');
    assert.strictEqual(signatureCalls[0].file, 'powershell.exe');
    assert(signatureCalls[0].args.includes('-EncodedCommand'));
    assert(!signatureCalls[0].args.some((arg) => String(arg).includes(executable)), 'signature target must not be interpolated into the PowerShell command');
    assert.strictEqual(signatureCalls[0].options.env.MINERADIO_WE_SIGNATURE_TARGET, executable);
    assert.strictEqual(signatureCalls[0].options.shell, false);

    const startedPromise = runtime.start('0123456789abcdef01234567', {
      width: 99999,
      height: 1,
      fps: 999,
      x: -25000,
      y: 25000,
      sourceTimeoutMs: 500,
      sourcePollMs: 50,
      file: path.join(temp, 'must-not-be-used.exe'),
    });
    await firstTransientStarted;
    assert(runtime.pending, 'the session should remain pending until the targeted transient control completes');
    assert.strictEqual(runtime.pending.audioMuted, false, 'audioMuted must stay false before the transient control callback succeeds');
    assert.strictEqual(runtime.pending.audioMuteCommandCount, 0, 'an unconfirmed transient control must not increment the mute command count');
    firstTransientCallback(null, '', '');
    const started = await startedPromise;
    assert.strictEqual(libraryCalls.length, 1);
    assert.strictEqual(started.active, true);
    assert.strictEqual(started.sourceId, 'window:4242:0');
    assert.strictEqual(started.width, 7680);
    assert.strictEqual(started.height, 64);
    assert.strictEqual(started.fps, 240);
    assert.strictEqual(started.audioMuted, true, 'audioMuted should become true after the transient control callback succeeds');
    assert.strictEqual(started.audioMuteCommandCount, 1, 'startup must suppress the unique location only after the source window appears');
    assert(/^[a-f0-9]{24}$/.test(started.sessionId));
    assert(!JSON.stringify(started).includes(temp), 'public start result must not expose absolute paths');
    assert(!JSON.stringify(runtime.getStatus()).includes(temp), 'public status must not expose absolute paths');
    assert.strictEqual(signatureCalls.length, 1, 'valid signature result should be cached');
    const embeddedStarted = await runtime.embedActiveWindow(started.sessionId, {
      hostWindowId: '31337',
      hostExecutable: executable,
      cornerRadius: 28,
    });
    assert.strictEqual(embeddedStarted.sourceWindowEmbedded, true);
    assert.strictEqual(embeddedStarted.sourceWindowRounded, true, 'the public session should report the native rounded source window');
    assert.strictEqual(embeddedStarted.audioMuted, true);
    assert.strictEqual(windowControlCalls[0].action, 'embed');
    assert.strictEqual(windowControlCalls[0].details.sourceId, 'window:4242:0');
    assert.strictEqual(windowControlCalls[0].details.executable, executable);
    assert.strictEqual(windowControlCalls[0].details.cornerRadius, 28, 'the host corner radius must be forwarded to the native window controller');
    assert.strictEqual(await runtime.updateDwmDesktopIconLayering(started.sessionId, true), false,
      'desktop icon layering must latch while the DWM helper is not ready');

    const muteCallsBeforeCaptureReady = transientControlCalls.length;
    assert.strictEqual(await runtime.confirmCaptureReady(started.sessionId), true);
    assert.strictEqual(runtime.getStatus().sourceWindowParked, false,
      'DWM composition must keep the real WE source aligned instead of parking it away from the Windows cursor');
    assert.strictEqual(runtime.getStatus().sourceWindowAligned, true);
    assert.strictEqual(windowControlCalls.length, 1, 'DWM readiness must not issue the retired 1x1 parking action');
    assert.strictEqual(transientControlCalls.length, muteCallsBeforeCaptureReady + 1, 'capture readiness must immediately reassert the location-scoped mute');
    assert.strictEqual(dwmSurfaceSpawns.length, 1, 'capture readiness must start one persistent DWM surface helper');
    const firstDwmSurface = dwmSurfaceSpawns[0];
    assert.strictEqual(firstDwmSurface.file, 'powershell.exe');
    assert(firstDwmSurface.args.includes('-File'));
    assert(!firstDwmSurface.args.includes('-EncodedCommand'), 'the large DWM helper must launch from a hashed UTF-8 script file');
    assert.deepStrictEqual(firstDwmSurface.options.stdio, ['pipe', 'pipe', 'pipe']);
    assert.strictEqual(firstDwmSurface.options.shell, false);
    assert.strictEqual(firstDwmSurface.options.env.MINERADIO_WE_DWM_SOURCE_ID, 'window:4242:0');
    assert.strictEqual(firstDwmSurface.options.env.MINERADIO_WE_DWM_HOST_WINDOW_ID, '31337');
    assert.strictEqual(firstDwmSurface.options.env.MINERADIO_WE_DWM_SOURCE_EXECUTABLE, executable);
    assert.strictEqual(firstDwmSurface.options.env.MINERADIO_WE_DWM_HOST_EXECUTABLE, executable);
    assert.strictEqual(firstDwmSurface.options.env.MINERADIO_WE_DWM_DESKTOP_ICON_LAYERING, '1',
      'a desktop-icon layering request made while the helper is down must replay into its next start');
    assert.strictEqual(firstDwmSurface.options.env.MINERADIO_WE_DWM_SESSION_ID, started.sessionId);
    const helperFile = firstDwmSurface.args[firstDwmSurface.args.indexOf('-File') + 1];
    const dwmHelperSource = fs.readFileSync(helperFile, 'utf8');
    assert(dwmHelperSource.includes('DwmRegisterThumbnail'));
    assert(!dwmHelperSource.includes('DwmQueryThumbnailSourceSize'));
    assert(!dwmHelperSource.includes('GlassRefractionSurface'));
    assert(!dwmHelperSource.includes('Mineradio WE Glass Refraction'));
    assert(!dwmHelperSource.includes('command.StartsWith("G|"'),
      'the native helper must not retain a second glass-layer geometry protocol');
    assert(dwmHelperSource.includes('message.Result = new IntPtr(HTTRANSPARENT)'),
      'the one base surface must stay click-through without capture-hostile extended styles');
    assert(dwmHelperSource.includes('command.StartsWith("I|", StringComparison.Ordinal)')
      && dwmHelperSource.includes('\\"iconLayering\\":true'),
      'the existing DWM helper must acknowledge hot desktop-icon layer switches');
    assert(dwmHelperSource.indexOf('taskbar.DeleteTab(Handle)') > dwmHelperSource.indexOf('void ActivateThumbnail()'),
      'the base HWND must remain a normal Shell capture target until WGC is primed');
    assert(!/const double zoom|1\.105/.test(dwmHelperSource),
      'the native helper must stay 1:1; the saved SVG filter owns liquid displacement and chromatic dispersion');
    assert(!/GetCursorPos|ScreenToClient|SetCursorPos|SendInput|ShowCursor|SetSystemCursor|SetWindowsHookEx/.test(dwmHelperSource),
      'DWM composition must never read, alter, hide, replace, or hook the real Windows cursor');
    const initialDwmStatus = runtime.getStatus();
    assert.strictEqual(initialDwmStatus.dwmSurfaceReady, true);
    assert.strictEqual(initialDwmStatus.dwmSurfaceActive, false,
      'DWM thumbnail activation must wait until the cursor-free SVG sampler capture is primed');
    assert.strictEqual(initialDwmStatus.dwmSurfaceHelperPid, firstDwmSurface.child.pid);
    assert.strictEqual(initialDwmStatus.dwmSurfaceWindowId, 6262);
    assert.strictEqual(initialDwmStatus.dwmDesktopIconLayering, true);
    assert.strictEqual(initialDwmStatus.dwmGlassSurfaceReady, true);
    assert.strictEqual(initialDwmStatus.dwmGlassSurfaceWindowId, 6262);
    assert.strictEqual(initialDwmStatus.dwmGlassSurfaceSampleMode, 'single-dwm-svg-sampler');
    assert.strictEqual(initialDwmStatus.dwmGlassSurfaceActive, false);
    assert.strictEqual(pointerRelaySpawns.length, 0, 'aligned DWM composition must not create the retired synthetic WM_MOUSEMOVE relay');
    assert.strictEqual(runtime.noteHostPointerActivity({ sessionId: started.sessionId, xUnit: 1000, yUnit: 2000 }), false,
      'real-cursor DWM composition must not accept a synthetic pointer packet');
    assert.strictEqual(await runtime.updateDwmDesktopIconLayering(started.sessionId, true), true);
    assert.strictEqual(runtime.getStatus().dwmDesktopIconLayering, true);
    assert.strictEqual(dwmSurfaceCommands.filter((entry) => entry.command === 'I|1').length, 0,
      'a helper that started with the latched icon-layer state must not receive a redundant hot switch');
    assert.strictEqual(await runtime.updateDwmDesktopIconLayering(started.sessionId, false), true);
    assert.strictEqual(runtime.getStatus().dwmDesktopIconLayering, false);
    assert.strictEqual(dwmSurfaceCommands.filter((entry) => entry.command === 'I|0').length, 1,
      'the same DWM helper must restore ordinary host/surface/source ordering');

    const glassGeometry = {
      active: true,
      left: 36,
      top: 528,
      width: 1080,
      height: 102,
      radius: 50,
      viewportWidth: 1152,
      viewportHeight: 648,
    };
    assert.strictEqual(runtime.updateGlassSurface('ffffffffffffffffffffffff', glassGeometry).ok, false);
    assert.strictEqual(runtime.updateGlassSurface(started.sessionId, { ...glassGeometry, viewportWidth: 0 }).ok, false);
    const glassUpdate = runtime.updateGlassSurface(started.sessionId, glassGeometry);
    assert.strictEqual(glassUpdate.ok, true);
    assert.strictEqual(glassUpdate.updated, true);
    assert.strictEqual(dwmSurfaceCommands.filter((entry) => entry.command.startsWith('G|')).length, 0,
      'control-console geometry must stay renderer-only and never create a native glass layer');
    const glassStatus = runtime.getStatus();
    assert.strictEqual(glassStatus.dwmGlassSurfaceActive, true);
    assert.deepStrictEqual(glassStatus.dwmGlassSurfaceGeometry, glassGeometry);
    exposeGlassCaptureSource = true;
    const glassCaptureSource = await runtime.getDwmGlassCaptureSource(started.sessionId, {
      timeoutMs: 300,
      pollIntervalMs: 20,
    });
    assert.deepStrictEqual(glassCaptureSource, {
      id: 'window:6262:0',
      name: 'Mineradio WE DWM Surface',
    });
    const activatedDwm = await runtime.activateDwmSurface(started.sessionId);
    assert.strictEqual(activatedDwm.dwmSurfaceActive, true);
    assert.strictEqual(dwmSurfaceCommands.filter((entry) => entry.command === 'D').length, 1,
      'the base DWM thumbnail must activate only after the sampler source was obtained');
    await assert.rejects(
      () => runtime.getDwmGlassCaptureSource('ffffffffffffffffffffffff'),
      (error) => error && error.code === 'WALLPAPER_ENGINE_SESSION_MISMATCH'
    );
    assert.strictEqual(runtime.updateGlassSurface(started.sessionId, glassGeometry).updated, false,
      'unchanged control-console geometry must not write another native command');
    assert.strictEqual(await runtime.confirmCaptureReady('ffffffffffffffffffffffff'), false);
    assert.strictEqual(transientControlCalls.length, muteCallsBeforeCaptureReady + 1, 'a stale capture-ready confirmation must not target the active location');
    await new Promise((resolve) => setTimeout(resolve, 260));
    assert(transientControlCalls.length >= muteCallsBeforeCaptureReady + 2, 'the delayed mute reassertion should issue another transient control');

    captureSourceId = 'window:4242:1';
    partialTitleOnlyPolls = 1;
    const captureCallsBeforeRefresh = captureCalls;
    const refreshed = await runtime.refreshActiveSource(started.sessionId, {
      timeoutMs: 500,
      pollIntervalMs: 50,
      includeSource: true,
    });
    assert.strictEqual(refreshed.active, true);
    assert.strictEqual(refreshed.sessionId, started.sessionId);
    assert.strictEqual(refreshed.sourceId, 'window:4242:1', 'refresh must publish the current desktopCapturer source id');
    assert.strictEqual(refreshed.captureSource && refreshed.captureSource.id, 'window:4242:1', 'main-process capture preparation must reuse the exact refreshed source object');
    assert.strictEqual(runtime.getStatus().sourceId, 'window:4242:1');
    assert.strictEqual(runtime.getStatus().dwmSurfaceReady, false, 'source refresh must retire the DWM helper bound to the previous HWND');
    const embeddedRefreshed = await runtime.embedActiveWindow(started.sessionId, {
      hostWindowId: '31337',
      hostExecutable: executable,
      desktopIconLayering: true,
    });
    assert.strictEqual(embeddedRefreshed.sourceWindowEmbedded, true);
    assert.strictEqual(await runtime.confirmCaptureReady(started.sessionId), true);
    assert.strictEqual(runtime.getStatus().dwmSurfaceReady, true, 'the refreshed source must receive a new session-bound DWM helper');
    assert.strictEqual(dwmSurfaceSpawns.length, 2);
    assert.strictEqual(dwmSurfaceSpawns[1].options.env.MINERADIO_WE_DWM_SOURCE_ID, 'window:4242:1');
    assert.strictEqual(dwmSurfaceSpawns[1].options.env.MINERADIO_WE_DWM_DESKTOP_ICON_LAYERING, '1',
      'full-desktop coexistence must opt into Explorer icon-host z-order explicitly');
    assert.strictEqual(runtime.getStatus().dwmDesktopIconLayering, true,
      'the helper ready acknowledgement must expose its initial icon-layer state');
    assert.strictEqual(captureCalls - captureCallsBeforeRefresh, 2, 'refresh must ignore partial-title lookalikes and wait for the exact location title');
    await assert.rejects(
      () => runtime.refreshActiveSource('ffffffffffffffffffffffff'),
      (error) => error && error.code === 'WALLPAPER_ENGINE_SESSION_MISMATCH'
    );

    const open = spawnCalls[0];
    assert.strictEqual(open.file, executable);
    assert.deepStrictEqual(open.args.slice(0, 3), ['-control', 'openWallpaper', '-file']);
    const stagedProjectFile = open.args[3];
    assert.notStrictEqual(stagedProjectFile, projectFile, 'a Scene with an audio property must launch through a silent cache manifest');
    assert.strictEqual(path.dirname(path.dirname(stagedProjectFile)), path.join(temp, 'native', 'wallpaper-engine-scene-stage'));
    const stagedProject = JSON.parse(fs.readFileSync(stagedProjectFile, 'utf8'));
    assert.strictEqual(stagedProject.file, 'scene.json');
    assert.strictEqual(stagedProject.general.properties.newproperty.value, 0);
    const stagedPackageFile = path.join(path.dirname(stagedProjectFile), 'scene.pkg');
    assert.strictEqual(fs.statSync(stagedPackageFile).size, fs.statSync(scenePackage).size);
    const originalPackageScene = await readWallpaperPackageScene(scenePackage);
    const stagedPackageScene = await readWallpaperPackageScene(stagedPackageFile);
    assert.strictEqual(originalPackageScene.scene.objects[0].startsilent, false, 'the Workshop source package must stay untouched');
    assert.deepStrictEqual(originalPackageScene.scene.objects[0].volume, { user: 'newproperty', value: 0.75 });
    assert.strictEqual(stagedPackageScene.scene.objects[0].startsilent, true, 'the cached package copy must start embedded BGM silently');
    assert.strictEqual(stagedPackageScene.scene.objects[0].volume, 0, 'the cached package copy must hard-zero the embedded sound object');
    assert.strictEqual(started.sceneAudioPatched, true);
    assert.strictEqual(started.patchedSceneAudioObjectCount, 1);
    assert.strictEqual(open.args[open.args.indexOf('-width') + 1], '7680');
    assert.strictEqual(open.args[open.args.indexOf('-height') + 1], '64');
    assert(!open.args.includes('-fps'), 'only documented Wallpaper Engine control arguments should be used');
    assert.strictEqual(open.args[open.args.indexOf('-x') + 1], '-25000');
    assert.strictEqual(open.args[open.args.indexOf('-y') + 1], '25000');
    assert(open.args.includes('-borderless'));
    assert(!open.args.some((arg) => /must-not-be-used\.exe/i.test(arg)));
    assert.strictEqual(open.options.shell, false);
    assert.strictEqual(open.options.stdio, 'ignore');
    const locationTitle = open.args[open.args.indexOf('-playInWindow') + 1];

    const staleStop = await runtime.stop('ffffffffffffffffffffffff');
    assert.strictEqual(staleStop.stopped, false);
    assert.strictEqual(staleStop.reason, 'WALLPAPER_ENGINE_SESSION_MISMATCH');
    assert.strictEqual(spawnCalls.length, 1, 'a stale renderer session must not close the current scene');

    const muteCallsBeforeStop = transientControlCalls.length;
    const stopped = await runtime.stop(started.sessionId);
    assert.strictEqual(stopped.stopped, true);
    assert.strictEqual(spawnCalls.length, 2);
    await new Promise((resolve) => setTimeout(resolve, 460));
    assert.strictEqual(transientControlCalls.length, muteCallsBeforeStop, 'stopping a session must cancel its remaining delayed mute reassertions');
    const muteCalls = transientControlCalls.filter((call) => call.args[1] === 'applyProperties');
    assert(muteCalls.length >= 3, 'startup, capture-ready, and delayed retries must all issue targeted mute controls');
    muteCalls.forEach((mute) => {
      assert.strictEqual(mute.file, path.basename(executable));
      assert.strictEqual(mute.options.cwd, path.dirname(executable));
      assert.strictEqual(mute.args[mute.args.indexOf('-location') + 1].replace(/^\"|\"$/g, ''), locationTitle, 'every mute control must use the unique Mineradio location');
      assert.deepStrictEqual(JSON.parse(mute.args[mute.args.indexOf('-properties') + 1].slice(5, -5)), {
        volume: 0,
        newproperty: 0,
        safeCombo: 'quiet_mode',
      });
      assert.strictEqual(mute.options.shell, false);
      assert.strictEqual(mute.options.windowsVerbatimArguments, true, 'RAW wallpaper JSON must reach Wallpaper Engine without Node quote escaping');
    });
    const close = spawnCalls[1];
    assert.deepStrictEqual(close.args, ['-control', 'closeWallpaper', '-location', locationTitle]);
    assert(!close.args.includes('-file'));
    assert(!close.args.includes(scenePackage));
    assert.strictEqual(close.options.shell, false);
    assert.strictEqual(runtime.getStatus().active, false);
    assert.strictEqual(runtime.noteHostPointerActivity({ sessionId: started.sessionId, xUnit: 100, yUnit: 200 }), false, 'a stopped session must reject late host pointer messages');
    assert(dwmSurfaceCommands.filter((entry) => entry.command === 'Q').length >= 2,
      'refresh and stop must both close their exact DWM surface helpers');
    assert.strictEqual(fs.existsSync(stagedProjectFile), false, 'the silent cache manifest must be removed after the exact WE window closes');
    const mutedPackageCache = path.join(temp, 'native', 'wallpaper-engine-muted-package-cache');
    const mutedPackageFiles = fs.readdirSync(mutedPackageCache).filter((name) => /\.pkg$/i.test(name));
    assert.strictEqual(mutedPackageFiles.length, 1, 'the patched package must remain cached for the next load');
    const mutedPackageFile = path.join(mutedPackageCache, mutedPackageFiles[0]);
    const mutedPackageSize = fs.statSync(mutedPackageFile).size;
    await overwritePackageScene(mutedPackageFile, originalPackageScene.scene);
    assert.strictEqual(fs.statSync(mutedPackageFile).size, mutedPackageSize, 'the invalid-cache fixture must preserve file size');
    const invalidCachedScene = await readWallpaperPackageScene(mutedPackageFile);
    assert.strictEqual(invalidCachedScene.scene.objects[0].startsilent, false, 'the invalid-cache fixture must be parseable but audible');
    const repairedCacheSession = {
      patchedSceneAudioObjectCount: 99,
      mutedScenePackageCacheFile: 'stale-cache-path',
    };
    const repairedPackageFile = await runtime._prepareMutedScenePackage(repairedCacheSession, scenePackage);
    assert.strictEqual(repairedPackageFile, mutedPackageFile, 'an audible same-size cache entry must be rebuilt at the stable cache path');
    const repairedCachedScene = await readWallpaperPackageScene(repairedPackageFile);
    assert.strictEqual(repairedCachedScene.scene.objects[0].startsilent, true, 'a rebuilt cache entry must be validated as startsilent');
    assert.strictEqual(repairedCachedScene.scene.objects[0].volume, 0, 'a rebuilt cache entry must be validated at zero volume');
    assert.strictEqual(repairedCacheSession.patchedSceneAudioObjectCount, 1);
    assert.strictEqual(repairedCacheSession.mutedScenePackageCacheFile, mutedPackageFile);
    await overwritePackageScene(mutedPackageFile, {
      objects: [{ name: 'BGM', startsilent: true, volume: 0 }],
    });
    const missingAudioObjectCache = await readWallpaperPackageScene(mutedPackageFile);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(missingAudioObjectCache.scene.objects[0], 'sound'), false);
    const countRepairSession = {
      patchedSceneAudioObjectCount: 0,
      mutedScenePackageCacheFile: '',
    };
    await runtime._prepareMutedScenePackage(countRepairSession, scenePackage);
    const countRepairedScene = await readWallpaperPackageScene(mutedPackageFile);
    assert.deepStrictEqual(countRepairedScene.scene.objects[0].sound, ['sounds/bgm.mp3'], 'a cache with the wrong sound-object count must be rebuilt');
    assert.strictEqual(countRepairSession.patchedSceneAudioObjectCount, 1);
    const sourceAfterCacheRepair = await readWallpaperPackageScene(scenePackage);
    assert.strictEqual(sourceAfterCacheRepair.scene.objects[0].startsilent, false, 'cache repair must not modify the Workshop package');

    const failedStageSession = {
      sessionId: 'stagefailure000000000000',
      muteProperties: { volume: 0, newproperty: 0 },
      stagedAudioPropertyCount: 0,
      patchedSceneAudioObjectCount: 0,
      mutedScenePackageCacheFile: '',
    };
    const originalWriteFile = fs.promises.writeFile;
    fs.promises.writeFile = async (target, ...args) => {
      if (/wallpaper-engine-scene-stage[\\/].+[\\/]project\.json\.tmp$/i.test(String(target))) {
        throw new Error('synthetic staged manifest write failure');
      }
      return originalWriteFile.call(fs.promises, target, ...args);
    };
    try {
      const failedStageLaunchFile = await runtime._prepareSilentLaunchFile(failedStageSession, projectFile, scenePackage);
      assert.strictEqual(failedStageLaunchFile, projectFile, 'a final staging failure must fall back to the original project');
      assert.strictEqual(failedStageSession.stagedAudioPropertyCount, 0);
      assert.strictEqual(failedStageSession.patchedSceneAudioObjectCount, 0, 'a staging fallback must not report an unused package patch');
      assert.strictEqual(failedStageSession.mutedScenePackageCacheFile, '', 'a staging fallback must clear the unused muted cache path');
    } finally {
      fs.promises.writeFile = originalWriteFile;
    }
    assert.deepStrictEqual(windowControlCalls.map((call) => call.action), ['embed', 'embed', 'close']);
    await runtime.revealWorkshop('3715870843');
    const revealCall = transientControlCalls[transientControlCalls.length - 1];
    assert.deepStrictEqual(revealCall.args, ['-control', 'revealWallpaper', '-id', '3715870843']);
    await assert.rejects(
      () => runtime.revealWorkshop('not-an-id'),
      (error) => error && error.code === 'WALLPAPER_ENGINE_WORKSHOP_ID_INVALID'
    );

    const failedDwmSpawns = [];
    const failedDwmCommands = [];
    const failedDwmRuntimeSpawns = [];
    const failedDwmRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      arch: 'x64',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => true,
      engineReadyProbe: async () => true,
      useDesktopShellBroker: false,
      nativeTempPath: path.join(temp, 'failed-dwm-native'),
      windowController: makeWindowController(),
      execFile: validSignatureExec([]),
      controlExecFile: makeTransientControlRecorder(),
      spawn: makeSpawnRecorder(failedDwmRuntimeSpawns),
      dwmSurfaceSpawn: makeDwmSurfaceSpawn(failedDwmSpawns, failedDwmCommands, {
        fail: true,
        firstPid: 58080,
      }),
      dwmSurfaceStartTimeoutMs: 100,
      sleep: async () => {},
      nativeSleep: async () => {},
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage }) },
      desktopCapturer: {
        async getSources() {
          const openCall = failedDwmRuntimeSpawns
            .filter((call) => call.args[1] === 'openWallpaper')
            .slice(-1)[0];
          if (!openCall) return [];
          const title = openCall.args[openCall.args.indexOf('-playInWindow') + 1];
          return [{ id: 'window:5808:0', name: title }];
        },
      },
    });
    const failedDwmStarted = await failedDwmRuntime.start('585858585858585858585858', { sourceTimeoutMs: 500 });
    try {
      await failedDwmRuntime.embedActiveWindow(failedDwmStarted.sessionId, {
        hostWindowId: '5808',
        hostExecutable: executable,
        cornerRadius: 24,
      });
      assert.strictEqual(await failedDwmRuntime.confirmCaptureReady(failedDwmStarted.sessionId), false,
        'capture readiness must reject a session whose native DWM surface cannot start');
      assert.strictEqual(failedDwmSpawns.length, 1);
      const failedStatus = failedDwmRuntime.getStatus();
      assert.strictEqual(failedStatus.sourceWindowAligned, true,
        'a DWM helper failure must not move or park the source window');
      assert.strictEqual(failedStatus.sourceWindowParked, false);
      assert.strictEqual(failedStatus.dwmSurfaceReady, false);
      assert.strictEqual(failedStatus.dwmSurfaceActive, false);
      assert.strictEqual(failedStatus.dwmGlassSurfaceReady, false);
      assert.strictEqual(failedDwmRuntime.noteHostPointerActivity({
        sessionId: failedDwmStarted.sessionId,
        xUnit: 1000,
        yUnit: 2000,
      }), false, 'failed DWM composition must not fall back to a synthetic pointer relay');
      assert.strictEqual((await failedDwmRuntime.stop(failedDwmStarted.sessionId)).stopped, true);
      assert(failedDwmCommands.some((entry) => entry.command === 'Q'),
        'a failed DWM helper must still receive an exact quit command');
    } finally {
      await failedDwmRuntime.stop();
      await failedDwmRuntime.dispose();
    }

    const coldSpawns = [];
    const coldTransientControls = [];
    let coldClock = 0;
    let coldProcessProbeCalls = 0;
    let coldReadyProbeCalls = 0;
    let coldSourcePolls = 0;
    let coldTransientBeforeSource = null;
    const coldRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      arch: 'x64',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => {
        coldProcessProbeCalls += 1;
        if (coldProcessProbeCalls === 1) {
          return { running: false, matching: false, executable: '', matchingPids: [] };
        }
        return { running: true, matching: true, executable, matchingPids: [4242] };
      },
      engineReadyProbe: async (targetExecutable) => {
        assert.strictEqual(targetExecutable, executable);
        coldReadyProbeCalls += 1;
        return coldReadyProbeCalls >= 2;
      },
      useDesktopShellBroker: false,
      windowController: makeWindowController(),
      execFile: validSignatureExec([]),
      controlExecFile: makeTransientControlRecorder(coldTransientControls),
      spawn: makeSpawnRecorder(coldSpawns),
      now: () => coldClock,
      sleep: async (milliseconds) => { coldClock += Number(milliseconds) || 0; },
      nativeSleep: async (milliseconds) => { coldClock += Number(milliseconds) || 0; },
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage }) },
      desktopCapturer: {
        async getSources() {
          coldSourcePolls += 1;
          const open = coldSpawns.find((call) => call.args[1] === 'openWallpaper');
          if (!open || coldSourcePolls < 8) return [];
          coldTransientBeforeSource = coldTransientControls.length;
          const title = open.args[open.args.indexOf('-playInWindow') + 1];
          return [{ id: 'window:cold-delayed:0', name: title }];
        },
      },
    });
    const coldStarted = await coldRuntime.start('666666666666666666666666', {
      sourceTimeoutMs: 6000,
      sourcePollMs: 500,
    });
    const coldOpens = coldSpawns.filter((call) => call.args[1] === 'openWallpaper');
    const coldEngineStarts = coldSpawns.filter((call) => call.file === executable && call.args.length === 0);
    assert.strictEqual(coldStarted.sourceId, 'window:cold-delayed:0');
    assert.strictEqual(coldEngineStarts.length, 1, 'cold startup must start the signed Wallpaper Engine executable exactly once');
    assert.deepStrictEqual(coldEngineStarts[0].args, [], 'cold startup must launch the engine with no browse or control arguments');
    assert.strictEqual(coldOpens.length, 1, 'cold startup must issue exactly one initial open command');
    assert(coldProcessProbeCalls >= 9, 'cold startup must observe a stable process and keep probing it while control readiness settles');
    assert.strictEqual(coldReadyProbeCalls, 3, 'control readiness must require two consecutive acknowledgements after an initial miss');
    assert.strictEqual(coldSourcePolls, 8, 'the delayed source fixture must cross the former replay window without another open');
    assert.strictEqual(coldTransientBeforeSource, 1, 'location-scoped audio suppression must begin immediately after open, before capture discovery finishes');
    assert.strictEqual(coldTransientControls.filter((call) => call.args[1] === 'applyProperties').length, 1, 'early audio suppression must not duplicate the initial location-scoped command after capture discovery');
    await coldRuntime.stop(coldStarted.sessionId);
    const coldLocation = coldOpens[0].args[coldOpens[0].args.indexOf('-playInWindow') + 1];
    assert.strictEqual(coldSpawns.filter((call) => call.args[1] === 'closeWallpaper'
      && call.args[call.args.indexOf('-location') + 1] === coldLocation).length, 1, 'the single cold-start location must close once');
    await coldRuntime.dispose();

    const timeoutSpawns = [];
    const timeoutTransientControls = [];
    let timeoutClock = 0;
    let timeoutProcessProbeCalls = 0;
    const timeoutRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      arch: 'x64',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => {
        timeoutProcessProbeCalls += 1;
        if (timeoutProcessProbeCalls === 1) {
          return { running: false, matching: false, executable: '', matchingPids: [] };
        }
        return { running: true, matching: true, executable, matchingPids: [4343] };
      },
      engineReadyProbe: async () => true,
      useDesktopShellBroker: false,
      windowController: makeWindowController(),
      execFile: validSignatureExec([]),
      controlExecFile: makeTransientControlRecorder(timeoutTransientControls),
      spawn: makeSpawnRecorder(timeoutSpawns),
      now: () => timeoutClock,
      sleep: async (milliseconds) => { timeoutClock += Number(milliseconds) || 0; },
      nativeSleep: async (milliseconds) => { timeoutClock += Number(milliseconds) || 0; },
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage }) },
      desktopCapturer: { getSources: async () => [] },
    });
    await assert.rejects(
      () => timeoutRuntime.start('676767676767676767676767', { sourceTimeoutMs: 500, sourcePollMs: 100 }),
      (error) => error && error.code === 'WALLPAPER_ENGINE_WINDOW_TIMEOUT'
    );
    const timeoutOpen = timeoutSpawns.find((call) => call.args[1] === 'openWallpaper');
    assert(timeoutOpen, 'a ready cold engine must receive one initial open before source polling');
    assert.strictEqual(timeoutSpawns.filter((call) => call.file === executable && call.args.length === 0).length, 1, 'timeout cleanup must not relaunch the engine');
    assert.strictEqual(timeoutSpawns.filter((call) => call.args[1] === 'openWallpaper').length, 1, 'source timeout must not replay the open command');
    assert.strictEqual(timeoutTransientControls.length, 1, 'source timeout may issue only its immediate location-scoped audio suppression attempt before cleanup');
    const timeoutLocation = timeoutOpen.args[timeoutOpen.args.indexOf('-playInWindow') + 1];
    assert.strictEqual(timeoutSpawns.filter((call) => call.args[1] === 'closeWallpaper'
      && call.args[call.args.indexOf('-location') + 1] === timeoutLocation).length, 1, 'source timeout must close its single pending location');
    await timeoutRuntime.dispose();

    const probeFailureSpawns = [];
    let probeFailureWallClock = 0;
    let probeFailureCalls = 0;
    const probeFailureSleepRequests = [];
    const probeFailureRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      arch: 'x64',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => {
        probeFailureCalls += 1;
        return { ok: false, running: false, matching: false, executable: '', matchingPids: [] };
      },
      engineReadyProbe: async () => { throw new Error('an unknown process state must never reach readiness probing'); },
      useDesktopShellBroker: false,
      windowController: makeWindowController(),
      execFile: validSignatureExec([]),
      controlExecFile: makeTransientControlRecorder(),
      spawn: makeSpawnRecorder(probeFailureSpawns),
      now: () => probeFailureWallClock,
      wallNow: () => probeFailureWallClock,
      sleep: async () => { throw new Error('an unknown process state must never poll a window source'); },
      nativeSleep: async (milliseconds) => {
        probeFailureSleepRequests.push(Number(milliseconds) || 0);
        // Simulate a heavily delayed machine: the real wall deadline must win
        // instead of multiplying a fixed attempt count by this scheduling lag.
        probeFailureWallClock += 1000;
      },
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage }) },
      desktopCapturer: { getSources: async () => [] },
    });
    await assert.rejects(
      () => probeFailureRuntime.start('686868686868686868686868'),
      (error) => error && error.code === 'WALLPAPER_ENGINE_PROCESS_PROBE_FAILED'
    );
    assert.strictEqual(probeFailureSpawns.length, 0, 'an unknown process state must never be treated as an absent engine or start the engine');
    assert(probeFailureWallClock >= 20000 && probeFailureWallClock < 22000, `process probing must stop at the shared real-time bootstrap deadline (wall=${probeFailureWallClock}, probes=${probeFailureCalls})`);
    assert(probeFailureCalls < 25, 'a delayed scheduler must not multiply the timeout through a fixed probe-attempt budget');
    assert(probeFailureSleepRequests.every((milliseconds) => milliseconds > 0), 'unknown-state retries must use bounded native sleeps');
    await probeFailureRuntime.dispose();

    const cachePidSpawns = [];
    const cachePidReadyObservations = [];
    let cachePid = 5101;
    const cachePidRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      arch: 'x64',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => ({
        ok: true,
        running: true,
        matching: true,
        executable,
        matchingPids: [cachePid],
      }),
      engineReadyProbe: async (targetExecutable) => {
        assert.strictEqual(targetExecutable, executable);
        cachePidReadyObservations.push(cachePid);
        return true;
      },
      useDesktopShellBroker: false,
      windowController: makeWindowController(),
      execFile: validSignatureExec([]),
      controlExecFile: makeTransientControlRecorder(),
      spawn: makeSpawnRecorder(cachePidSpawns),
      now: () => 1000,
      wallNow: () => 1000,
      sleep: async () => {},
      nativeSleep: async () => {},
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage }) },
      desktopCapturer: {
        async getSources() {
          const openCall = cachePidSpawns.filter((call) => call.args[1] === 'openWallpaper').slice(-1)[0];
          if (!openCall) return [];
          const title = openCall.args[openCall.args.indexOf('-playInWindow') + 1];
          return [{ id: `window:cache-pid-${cachePid}:0`, name: title }];
        },
      },
    });
    const cachePidFirst = await cachePidRuntime.start('696969696969696969696969', { sourceTimeoutMs: 500 });
    assert.deepStrictEqual(cachePidReadyObservations, [5101, 5101], 'the first PID must earn readiness through two consecutive probes');
    await cachePidRuntime.stop(cachePidFirst.sessionId);
    const cachePidSame = await cachePidRuntime.start('707070707070707070707070', { sourceTimeoutMs: 500 });
    assert.deepStrictEqual(cachePidReadyObservations, [5101, 5101], 'a fresh cache may be reused only while the matching PID set is unchanged');
    await cachePidRuntime.stop(cachePidSame.sessionId);
    cachePid = 5202;
    const cachePidChanged = await cachePidRuntime.start('717171717171717171717171', { sourceTimeoutMs: 500 });
    assert.deepStrictEqual(cachePidReadyObservations, [5101, 5101, 5202, 5202], 'a changed matching PID set must invalidate readiness and probe the new process twice');
    await cachePidRuntime.stop(cachePidChanged.sessionId);
    await cachePidRuntime.dispose();

    const lateOpenSpawns = [];
    const lateOpenBrokerCalls = [];
    let releaseLateElevation;
    let notifyLateElevation;
    let lateElevationProbeCalls = 0;
    const lateElevationStarted = new Promise((resolve) => { notifyLateElevation = resolve; });
    const lateElevationGate = new Promise((resolve) => { releaseLateElevation = () => resolve(false); });
    const lateOpenRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      arch: 'x64',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => ({
        ok: true,
        running: true,
        matching: true,
        executable,
        matchingPids: [5303],
      }),
      engineReadyProbe: async () => true,
      hostElevationProbe: async () => {
        lateElevationProbeCalls += 1;
        notifyLateElevation();
        return lateElevationGate;
      },
      windowController: makeWindowController(),
      execFile: validSignatureExec([]),
      controlExecFile: makeTransientControlRecorder(lateOpenBrokerCalls),
      spawn: makeSpawnRecorder(lateOpenSpawns),
      sleep: async () => {},
      nativeSleep: async () => {},
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage }) },
      desktopCapturer: { getSources: async () => [] },
    });
    const lateStartOutcome = lateOpenRuntime.start('727272727272727272727272', { sourceTimeoutMs: 500 })
      .then((value) => ({ value }), (error) => ({ error }));
    await lateElevationStarted;
    const lateSessionId = lateOpenRuntime.pending && lateOpenRuntime.pending.sessionId;
    assert(lateSessionId, 'the delayed initial open must remain addressable as the pending session');
    assert(lateOpenRuntime.pending.initialOpenPromise, 'the delayed initial open promise must be registered before stop can observe the pending session');
    let lateStopResolved = false;
    const lateStopPromise = lateOpenRuntime.stop(lateSessionId).then((result) => {
      assert.strictEqual(lateOpenSpawns.length, 0, 'stop must not resolve until the stale initial open has been suppressed');
      assert.strictEqual(lateOpenBrokerCalls.length, 0, 'the stale initial open must not escape through the desktop-token broker');
      lateStopResolved = true;
      return result;
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(lateStopResolved, false, 'stop must wait while the initial open is still blocked by elevation detection');
    assert.strictEqual(lateOpenSpawns.length, 0, 'the delayed initial open must not spawn before elevation detection settles');
    releaseLateElevation();
    const lateStopResult = await lateStopPromise;
    const lateStartResult = await lateStartOutcome;
    assert.strictEqual(lateStopResult.stopped, true, 'canceling a pending initial open must report the session as stopped');
    assert.strictEqual(lateStartResult.error && lateStartResult.error.code, 'WALLPAPER_ENGINE_START_SUPERSEDED');
    assert.strictEqual(lateElevationProbeCalls, 1, 'the delayed host elevation result must settle before cancellation completes');
    assert.strictEqual(lateOpenSpawns.filter((call) => call.args[1] === 'openWallpaper').length, 0, 'a superseded startup must never emit its delayed initial open');
    assert.strictEqual(lateOpenSpawns.filter((call) => call.args[1] === 'closeWallpaper').length, 0, 'a suppressed initial open must not emit a compensating close');
    await lateOpenRuntime.dispose();

    const closeFalseSpawns = [];
    let closeFalseEmbedCalls = 0;
    let closeFalseNativeCloseCalls = 0;
    const closeFalseRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      arch: 'x64',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => ({
        ok: true,
        running: true,
        matching: true,
        executable,
        matchingPids: [5404],
      }),
      engineReadyProbe: async () => true,
      useDesktopShellBroker: false,
      windowController: async (action) => {
        if (action === 'close') {
          closeFalseNativeCloseCalls += 1;
          if (closeFalseNativeCloseCalls === 1) {
            return { ok: true, closePosted: true, closed: false, missing: false };
          }
          return { ok: true, closePosted: true, closed: true, missing: true };
        }
        closeFalseEmbedCalls += 1;
        if (closeFalseEmbedCalls === 1) {
          return {
            ok: true,
            embedded: true,
            aligned: false,
            rounded: true,
            left: 10,
            top: 10,
            right: 1010,
            bottom: 710,
            hostLeft: 0,
            hostTop: 0,
            hostRight: 1280,
            hostBottom: 720,
            visibleWidth: 1000,
            visibleHeight: 700,
          };
        }
        return {
          ok: true,
          embedded: true,
          aligned: true,
          rounded: true,
          left: 0,
          top: 0,
          right: 1280,
          bottom: 720,
          hostLeft: 0,
          hostTop: 0,
          hostRight: 1280,
          hostBottom: 720,
          visibleWidth: 1280,
          visibleHeight: 720,
        };
      },
      execFile: validSignatureExec([]),
      controlExecFile: makeTransientControlRecorder(),
      spawn: makeSpawnRecorder(closeFalseSpawns),
      sleep: async () => {},
      nativeSleep: async () => {},
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage }) },
      desktopCapturer: {
        async getSources() {
          const openCall = closeFalseSpawns.filter((call) => call.args[1] === 'openWallpaper').slice(-1)[0];
          if (!openCall) return [];
          const title = openCall.args[openCall.args.indexOf('-playInWindow') + 1];
          return [{ id: 'window:close-false:0', name: title }];
        },
      },
    });
    const closeFalseSession = await closeFalseRuntime.start('757575757575757575757575', { sourceTimeoutMs: 500 });
    try {
      const closeFalseInitialOpenCount = closeFalseSpawns.filter((call) => call.args[1] === 'openWallpaper').length;
      const closeFalseEmbedOutcome = await closeFalseRuntime.embedActiveWindow(closeFalseSession.sessionId, {
        hostWindowId: '5404',
        hostExecutable: executable,
        cornerRadius: 24,
      }).then((value) => ({ value }), (error) => ({ error }));
      assert.strictEqual(closeFalseEmbedOutcome.error && closeFalseEmbedOutcome.error.code, 'WALLPAPER_ENGINE_WINDOW_CLOSE_FAILED', 'closed:false must abort relaunch with a retryable close failure');
      assert.strictEqual(closeFalseSpawns.filter((call) => call.args[1] === 'openWallpaper').length, closeFalseInitialOpenCount, 'closed:false must never be followed by a reopen');
      assert.strictEqual(closeFalseNativeCloseCalls, 1, 'the failed relaunch must perform only one native close attempt');
      const closeFalseStatus = closeFalseRuntime.getStatus();
      assert.strictEqual(closeFalseStatus.active, true, 'a close failure must preserve the active session for retry');
      assert.strictEqual(closeFalseStatus.sessionId, closeFalseSession.sessionId, 'a close failure must preserve the same retryable session');
      assert.strictEqual(closeFalseStatus.sourceId, closeFalseSession.sourceId, 'a close failure must preserve the last known source');
    } finally {
      await closeFalseRuntime.stop(closeFalseSession.sessionId);
      await closeFalseRuntime.dispose();
    }

    const relaunchElevationSpawns = [];
    const relaunchElevationBrokerCalls = [];
    let relaunchElevationRuntime;
    let relaunchElevationProbeCalls = 0;
    let relaunchElevationCloseArmed = false;
    let notifyRelaunchElevation;
    let releaseRelaunchElevation;
    let relaunchElevationReleased = false;
    const relaunchElevationStarted = new Promise((resolve) => { notifyRelaunchElevation = resolve; });
    const relaunchElevationGate = new Promise((resolve) => {
      releaseRelaunchElevation = () => {
        if (relaunchElevationReleased) return;
        relaunchElevationReleased = true;
        resolve(false);
      };
    });
    const relaunchElevationSpawn = (file, args, options) => {
      relaunchElevationSpawns.push({ file, args: [...args], options: { ...options } });
      if (relaunchElevationCloseArmed && args[1] === 'closeWallpaper') {
        relaunchElevationCloseArmed = false;
        relaunchElevationRuntime.hostElevationCache = null;
      }
      const child = new EventEmitter();
      child.unref = () => { child.unrefCalled = true; };
      queueMicrotask(() => child.emit('spawn'));
      return child;
    };
    let relaunchElevationEmbedCalls = 0;
    relaunchElevationRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      arch: 'x64',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => ({
        ok: true,
        running: true,
        matching: true,
        executable,
        matchingPids: [5505],
      }),
      engineReadyProbe: async () => true,
      hostElevationProbe: async () => {
        relaunchElevationProbeCalls += 1;
        if (relaunchElevationProbeCalls === 1) return false;
        notifyRelaunchElevation();
        return relaunchElevationGate;
      },
      windowController: async (action) => {
        if (action === 'close') return { ok: true, closePosted: true, closed: true, missing: true };
        relaunchElevationEmbedCalls += 1;
        if (relaunchElevationEmbedCalls === 1) {
          return {
            ok: true,
            embedded: true,
            aligned: false,
            rounded: true,
            left: 12,
            top: 8,
            right: 1012,
            bottom: 708,
            hostLeft: 0,
            hostTop: 0,
            hostRight: 1280,
            hostBottom: 720,
            visibleWidth: 1000,
            visibleHeight: 700,
          };
        }
        return {
          ok: true,
          embedded: true,
          aligned: true,
          rounded: true,
          left: 0,
          top: 0,
          right: 1280,
          bottom: 720,
          hostLeft: 0,
          hostTop: 0,
          hostRight: 1280,
          hostBottom: 720,
          visibleWidth: 1280,
          visibleHeight: 720,
        };
      },
      execFile: validSignatureExec([]),
      controlExecFile: makeTransientControlRecorder(relaunchElevationBrokerCalls),
      spawn: relaunchElevationSpawn,
      sleep: async () => {},
      nativeSleep: async () => {},
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage }) },
      desktopCapturer: {
        async getSources() {
          const opens = relaunchElevationSpawns.filter((call) => call.args[1] === 'openWallpaper');
          const openCall = opens[opens.length - 1];
          if (!openCall) return [];
          const title = openCall.args[openCall.args.indexOf('-playInWindow') + 1];
          return [{ id: `window:relaunch-elevation-${opens.length}:0`, name: title }];
        },
      },
    });
    const relaunchElevationSession = await relaunchElevationRuntime.start('767676767676767676767676', { sourceTimeoutMs: 500 });
    try {
      relaunchElevationBrokerCalls.length = 0;
      relaunchElevationCloseArmed = true;
      const relaunchElevationOutcome = relaunchElevationRuntime.embedActiveWindow(relaunchElevationSession.sessionId, {
        hostWindowId: '5505',
        hostExecutable: executable,
        cornerRadius: 24,
      }).then((value) => ({ value }), (error) => ({ error }));
      await relaunchElevationStarted;
      assert.strictEqual(relaunchElevationSpawns.filter((call) => call.args[1] === 'openWallpaper').length, 1, 'the relaunch open must still be blocked while elevation detection is pending');
      const relaunchElevationStopPromise = relaunchElevationRuntime.stop(relaunchElevationSession.sessionId);
      await Promise.resolve();
      releaseRelaunchElevation();
      const [relaunchElevationStop, relaunchElevationResult] = await Promise.all([
        relaunchElevationStopPromise,
        relaunchElevationOutcome,
      ]);
      assert.strictEqual(relaunchElevationStop.stopped, true, 'stop must retire the active session while relaunch is blocked');
      assert.strictEqual(relaunchElevationResult.error && relaunchElevationResult.error.code, 'WALLPAPER_ENGINE_START_SUPERSEDED');
      assert.strictEqual(relaunchElevationSpawns.filter((call) => call.args[1] === 'openWallpaper').length, 1, 'releasing elevation after stop must not emit a stale relaunch open');
      assert.strictEqual(relaunchElevationBrokerCalls.length, 0, 'the stale relaunch open must not escape through the desktop-token broker');
    } finally {
      releaseRelaunchElevation();
      await relaunchElevationRuntime.stop();
      await relaunchElevationRuntime.dispose();
    }

    const singleFlightSpawns = [];
    let singleFlightEmbedCalls = 0;
    let singleFlightGateReleased = false;
    let notifySingleFlightEmbed;
    let releaseSingleFlightEmbed;
    const singleFlightEmbedStarted = new Promise((resolve) => { notifySingleFlightEmbed = resolve; });
    const singleFlightEmbedGate = new Promise((resolve) => { releaseSingleFlightEmbed = resolve; });
    const singleFlightRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      arch: 'x64',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => ({
        ok: true,
        running: true,
        matching: true,
        executable,
        matchingPids: [5606],
      }),
      engineReadyProbe: async () => true,
      useDesktopShellBroker: false,
      windowController: async (action) => {
        if (action === 'close') return { ok: true, closePosted: true, closed: true, missing: true };
        singleFlightEmbedCalls += 1;
        if (!singleFlightGateReleased) {
          notifySingleFlightEmbed();
          await singleFlightEmbedGate;
          return {
            ok: true,
            embedded: true,
            aligned: false,
            rounded: true,
            left: 10,
            top: 10,
            right: 1010,
            bottom: 710,
            hostLeft: 0,
            hostTop: 0,
            hostRight: 1280,
            hostBottom: 720,
            visibleWidth: 1000,
            visibleHeight: 700,
          };
        }
        return {
          ok: true,
          embedded: true,
          aligned: true,
          rounded: true,
          left: 0,
          top: 0,
          right: 1280,
          bottom: 720,
          hostLeft: 0,
          hostTop: 0,
          hostRight: 1280,
          hostBottom: 720,
          visibleWidth: 1280,
          visibleHeight: 720,
        };
      },
      execFile: validSignatureExec([]),
      controlExecFile: makeTransientControlRecorder(),
      spawn: makeSpawnRecorder(singleFlightSpawns),
      sleep: async () => {},
      nativeSleep: async () => {},
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage }) },
      desktopCapturer: {
        async getSources() {
          const opens = singleFlightSpawns.filter((call) => call.args[1] === 'openWallpaper');
          const openCall = opens[opens.length - 1];
          if (!openCall) return [];
          const title = openCall.args[openCall.args.indexOf('-playInWindow') + 1];
          return [{ id: `window:single-flight-${opens.length}:0`, name: title }];
        },
      },
    });
    const singleFlightSession = await singleFlightRuntime.start('777777777777777777777778', { sourceTimeoutMs: 500 });
    try {
      const singleFlightInitialOpenCount = singleFlightSpawns.filter((call) => call.args[1] === 'openWallpaper').length;
      const firstEmbed = singleFlightRuntime.embedActiveWindow(singleFlightSession.sessionId, {
        hostWindowId: '5606',
        hostExecutable: executable,
        cornerRadius: 24,
      });
      await singleFlightEmbedStarted;
      const secondEmbed = singleFlightRuntime.embedActiveWindow(singleFlightSession.sessionId, {
        hostWindowId: '5606',
        hostExecutable: executable,
        cornerRadius: 24,
      });
      await Promise.resolve();
      await Promise.resolve();
      singleFlightGateReleased = true;
      releaseSingleFlightEmbed();
      const singleFlightResults = await Promise.allSettled([firstEmbed, secondEmbed]);
      assert.strictEqual(singleFlightSpawns.filter((call) => call.args[1] === 'closeWallpaper').length, 1, 'concurrent embed requests must share at most one relaunch close');
      assert.strictEqual(singleFlightSpawns.filter((call) => call.args[1] === 'openWallpaper').length, singleFlightInitialOpenCount + 1, 'concurrent embed requests must share at most one relaunch open');
      assert(singleFlightResults.every((result) => result.status === 'fulfilled'), 'both concurrent embed callers must receive the shared successful result');
      assert(singleFlightResults.every((result) => result.value.sessionId === singleFlightSession.sessionId));
    } finally {
      singleFlightGateReleased = true;
      releaseSingleFlightEmbed();
      await singleFlightRuntime.stop(singleFlightSession.sessionId);
      await singleFlightRuntime.dispose();
    }

    const invalidColdEngineSteamLibrary = path.join(temp, 'InvalidColdEngineSteam');
    const invalidColdEngineRoot = path.join(invalidColdEngineSteamLibrary, 'steamapps', 'common', 'wallpaper_engine');
    const invalidColdEngineExecutable = path.join(invalidColdEngineRoot, 'wallpaper64.exe');
    fs.mkdirSync(invalidColdEngineRoot, { recursive: true });
    fs.writeFileSync(invalidColdEngineExecutable, 'untrusted engine fixture', 'utf8');
    const invalidColdEngineSignatureCalls = [];
    const invalidColdEngineSpawns = [];
    const invalidColdEngineRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      arch: 'x64',
      discoverSteamLibraries: async () => [invalidColdEngineSteamLibrary],
      engineProcessProbe: async () => ({ ok: true, running: false, matching: false, executable: '', matchingPids: [] }),
      engineReadyProbe: async () => { throw new Error('an invalid engine must never reach readiness probing'); },
      useDesktopShellBroker: false,
      windowController: makeWindowController(),
      execFile: (file, args, options, callback) => {
        const target = String(options && options.env && options.env.MINERADIO_WE_SIGNATURE_TARGET || '');
        invalidColdEngineSignatureCalls.push({ file, args: [...args], options: { ...options }, target });
        queueMicrotask(() => callback(null, JSON.stringify({ status: 'NotSigned', subject: '' }), ''));
        return new EventEmitter();
      },
      controlExecFile: makeTransientControlRecorder(),
      spawn: makeSpawnRecorder(invalidColdEngineSpawns),
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage }) },
      desktopCapturer: { getSources: async () => [] },
    });
    await assert.rejects(
      () => invalidColdEngineRuntime.start('747474747474747474747474'),
      (error) => error && error.code === 'WALLPAPER_ENGINE_SIGNATURE_INVALID'
    );
    assert(invalidColdEngineSignatureCalls.some((call) => call.target === invalidColdEngineExecutable), 'the direct cold-start executable must pass signature verification');
    assert.strictEqual(invalidColdEngineSpawns.length, 0, 'an invalid engine signature must fail closed before any spawn');
    await invalidColdEngineRuntime.dispose();

    const coldFirstSuccessSpawns = [];
    let coldFirstProcessProbeCalls = 0;
    const coldFirstSuccessRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      arch: 'x64',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => {
        coldFirstProcessProbeCalls += 1;
        if (coldFirstProcessProbeCalls === 1) {
          return { running: false, matching: false, executable: '', matchingPids: [] };
        }
        return { running: true, matching: true, executable, matchingPids: [4444] };
      },
      engineReadyProbe: async () => true,
      useDesktopShellBroker: false,
      windowController: makeWindowController(),
      execFile: validSignatureExec([]),
      controlExecFile: makeTransientControlRecorder(),
      spawn: makeSpawnRecorder(coldFirstSuccessSpawns),
      sleep: async () => { throw new Error('a visible first window should not wait for replay'); },
      nativeSleep: async () => {},
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage }) },
      desktopCapturer: {
        async getSources() {
          const openCall = coldFirstSuccessSpawns.find((call) => call.args[1] === 'openWallpaper');
          if (!openCall) return [];
          const title = openCall.args[openCall.args.indexOf('-playInWindow') + 1];
          return [{ id: 'window:cold-first:0', name: title }];
        },
      },
    });
    const coldFirstStarted = await coldFirstSuccessRuntime.start('777777777777777777777777', { sourceTimeoutMs: 500 });
    assert.strictEqual(coldFirstSuccessSpawns[0].file, executable);
    assert.deepStrictEqual(coldFirstSuccessSpawns[0].args, [], 'a first-frame cold start must launch the signed engine directly with no arguments');
    assert.strictEqual(coldFirstSuccessSpawns.filter((call) => call.args[1] === 'openWallpaper').length, 1, 'cold detection must not duplicate an already-created pop-out');
    await coldFirstSuccessRuntime.stop(coldFirstStarted.sessionId);
    await coldFirstSuccessRuntime.dispose();

    const scenePak = path.join(projectRoot, 'scene.pak');
    writeScenePackage(scenePak, { objects: [] }, '.pak');
    const pakSpawns = [];
    const pakRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => true,
      engineReadyProbe: async () => true,
      useDesktopShellBroker: false,
      windowController: makeWindowController(),
      execFile: validSignatureExec([]),
      controlExecFile: makeTransientControlRecorder(),
      spawn: makeSpawnRecorder(pakSpawns),
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage: scenePak }) },
      desktopCapturer: {
        async getSources() {
          const openCall = pakSpawns.find((call) => call.args[1] === 'openWallpaper');
          if (!openCall) return [];
          const title = openCall.args[openCall.args.indexOf('-playInWindow') + 1];
          return [{ id: 'window:pak:0', name: title }];
        },
      },
    });
    const pakStarted = await pakRuntime.start('888888888888888888888888', { sourceTimeoutMs: 500 });
    const pakOpen = pakSpawns.find((call) => call.args[1] === 'openWallpaper');
    assert.deepStrictEqual(pakOpen.args.slice(0, 4), ['-control', 'openWallpaper', '-file', scenePak]);
    await pakRuntime.stop(pakStarted.sessionId);
    await pakRuntime.dispose();

    const manifestPakRoot = path.join(temp, 'manifest-pak-project');
    const manifestPakProject = path.join(manifestPakRoot, 'project.json');
    const manifestPakPackage = path.join(manifestPakRoot, 'scene.pak');
    fs.mkdirSync(manifestPakRoot, { recursive: true });
    fs.writeFileSync(manifestPakProject, JSON.stringify({
      type: 'scene',
      file: 'packages/scene.pak',
      general: { properties: { music_enabled: { type: 'bool', value: true } } },
    }), 'utf8');
    writeScenePackage(manifestPakPackage, {
      objects: [{ sound: ['sounds/music.ogg'], startsilent: false, volume: 1 }],
    }, '.pak');
    const manifestPakSpawns = [];
    const manifestPakRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => true,
      engineReadyProbe: async () => true,
      useDesktopShellBroker: false,
      nativeTempPath: path.join(temp, 'manifest-pak-native'),
      windowController: makeWindowController(),
      execFile: validSignatureExec([]),
      controlExecFile: makeTransientControlRecorder(),
      spawn: makeSpawnRecorder(manifestPakSpawns),
      library: {
        getNativeSceneTarget: async (id) => ({
          id,
          projectFile: manifestPakProject,
          scenePackage: manifestPakPackage,
          muteProperties: { volume: 0, music_enabled: false },
        }),
      },
      desktopCapturer: {
        async getSources() {
          const openCall = manifestPakSpawns.find((call) => call.args[1] === 'openWallpaper');
          if (!openCall) return [];
          const title = openCall.args[openCall.args.indexOf('-playInWindow') + 1];
          return [{ id: 'window:manifest-pak:0', name: title }];
        },
      },
    });
    const manifestPakStarted = await manifestPakRuntime.start('898989898989898989898989', { sourceTimeoutMs: 500 });
    const manifestPakOpen = manifestPakSpawns.find((call) => call.args[1] === 'openWallpaper');
    const manifestPakStagedProject = manifestPakOpen.args[manifestPakOpen.args.indexOf('-file') + 1];
    assert.notStrictEqual(manifestPakStagedProject, manifestPakProject);
    assert.strictEqual(JSON.parse(fs.readFileSync(manifestPakStagedProject, 'utf8')).file, 'scene.pak', 'a nested package reference must be safely rebased inside the isolated stage');
    assert.strictEqual(fs.existsSync(path.join(path.dirname(manifestPakStagedProject), 'scene.pak')), true, 'a manifest that references scene.pak must keep that exact staged package name');
    assert.strictEqual(manifestPakStarted.sceneAudioPatched, true);
    await manifestPakRuntime.stop(manifestPakStarted.sessionId);
    await manifestPakRuntime.dispose();

    const muteRetrySpawns = [];
    const muteRetryControls = [];
    let muteRetryClock = 0;
    let muteRetryAttempts = 0;
    const muteRetryRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => true,
      engineReadyProbe: async () => true,
      useDesktopShellBroker: false,
      windowController: makeWindowController(),
      execFile: validSignatureExec([]),
      controlExecFile: (file, args, options, callback) => {
        const call = { file, args: [...args], options: { ...options } };
        muteRetryControls.push(call);
        if (args[1] === 'applyProperties') {
          muteRetryAttempts += 1;
          if (muteRetryAttempts === 1) {
            queueMicrotask(() => callback(new Error('synthetic first location mute failure'), '', ''));
            return new EventEmitter();
          }
        }
        queueMicrotask(() => callback(null, '', ''));
        return new EventEmitter();
      },
      spawn: makeSpawnRecorder(muteRetrySpawns),
      now: () => muteRetryClock,
      wallNow: () => muteRetryClock,
      sleep: async (milliseconds) => { muteRetryClock += Number(milliseconds) || 0; },
      nativeSleep: async (milliseconds) => { muteRetryClock += Number(milliseconds) || 0; },
      library: {
        getNativeSceneTarget: async (id) => ({
          id,
          scenePackage: scenePak,
          muteProperties: { volume: 0, newproperty: 0 },
        }),
      },
      desktopCapturer: {
        async getSources() {
          const openCall = muteRetrySpawns.find((call) => call.args[1] === 'openWallpaper');
          if (!openCall) return [];
          const title = openCall.args[openCall.args.indexOf('-playInWindow') + 1];
          return [{ id: 'window:mute-retry:0', name: title }];
        },
      },
    });
    const muteRetryStarted = await muteRetryRuntime.start('898989898989898989898989', { sourceTimeoutMs: 500 });
    try {
      assert.strictEqual(muteRetryStarted.active, true, 'a successful second location-mute attempt must allow startup to become active');
      assert.strictEqual(muteRetryStarted.audioMuted, true, 'the acknowledged retry must publish audioMuted=true');
      assert.strictEqual(muteRetryStarted.audioPropertySuppressed, true);
      assert.strictEqual(muteRetryStarted.audioMuteCommandCount, 1, 'only the acknowledged location-mute command may increment the public count');
      const muteRetryOpens = muteRetrySpawns.filter((call) => call.args[1] === 'openWallpaper');
      assert.strictEqual(muteRetryOpens.length, 1, 'a location-mute retry must not reopen the PAK or create another window');
      assert.strictEqual(muteRetryOpens[0].args[muteRetryOpens[0].args.indexOf('-file') + 1], scenePak);
      const muteRetryLocation = muteRetryOpens[0].args[muteRetryOpens[0].args.indexOf('-playInWindow') + 1];
      assert(/^Mineradio Wallpaper [a-f0-9]{24}$/.test(muteRetryLocation));
      const muteRetryPropertyCalls = muteRetryControls.filter((call) => call.args[1] === 'applyProperties');
      assert.strictEqual(muteRetryPropertyCalls.length, 2, 'the first CONTROL_FAILED must be retried once before startup succeeds');
      muteRetryPropertyCalls.forEach((call) => {
        assert.strictEqual(call.file, path.basename(executable));
        assert.strictEqual(call.options.cwd, path.dirname(executable));
        assert.strictEqual(call.args[call.args.indexOf('-location') + 1].replace(/^"|"$/g, ''), muteRetryLocation, 'every retry must stay scoped to the same unique location');
        assert(!/\s-control\s+mute(?:\s|$)/.test(` ${call.args.join(' ')} `), 'a retry must never fall back to global mute');
      });
      assert.strictEqual(muteRetryRuntime.getStatus().sessionId, muteRetryStarted.sessionId);
    } finally {
      await muteRetryRuntime.stop(muteRetryStarted.sessionId);
      await muteRetryRuntime.dispose();
    }

    const brokerCalls = [];
    const brokerDirectSpawns = [];
    let elevationProbeCalls = 0;
    const brokerRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => true,
      engineReadyProbe: async () => true,
      hostElevationProbe: async () => {
        elevationProbeCalls += 1;
        return true;
      },
      windowController: makeWindowController(),
      execFile: validSignatureExec([]),
      controlExecFile: (file, args, options, callback) => {
        brokerCalls.push({ file, args: [...args], options: { ...options, env: { ...options.env } } });
        queueMicrotask(() => callback(null, '', ''));
        return new EventEmitter();
      },
      spawn: makeSpawnRecorder(brokerDirectSpawns),
      library: { getNativeSceneTarget: async (id) => ({ id, projectFile, scenePackage }) },
      desktopCapturer: {
        async getSources() {
          const openCall = brokerCalls.find((call) => /\bopenWallpaper\b/.test(call.options.env.MINERADIO_WE_CONTROL_COMMAND_LINE || ''));
          if (!openCall) return [];
          const match = /-playInWindow\s+"([^"]+)"/.exec(openCall.options.env.MINERADIO_WE_CONTROL_COMMAND_LINE || '');
          return match ? [{ id: 'window:broker:0', name: match[1] }] : [];
        },
      },
    });
    const brokerStarted = await brokerRuntime.start('999999999999999999999999', { sourceTimeoutMs: 500 });
    assert.strictEqual(brokerStarted.sourceId, 'window:broker:0');
    await brokerRuntime.stop(brokerStarted.sessionId);
    assert.strictEqual(elevationProbeCalls, 1, 'host elevation should be probed once and cached');
    assert.strictEqual(brokerDirectSpawns.length, 0, 'an elevated host must not directly spawn Wallpaper Engine');
    assert.strictEqual(brokerCalls.length, 3, 'open, post-source targeted suppression, and close controls must all use the desktop-token broker');
    const brokerOpen = brokerCalls[0];
    assert.strictEqual(brokerOpen.file, 'powershell.exe');
    assert(brokerOpen.args.includes('-EncodedCommand'));
    assert(!brokerOpen.args.some((arg) => String(arg).includes(executable) || String(arg).includes(projectFile)), 'trusted paths must not be interpolated into PowerShell arguments');
    assert.strictEqual(brokerOpen.options.shell, false);
    assert(brokerOpen.options.timeout >= 15000, 'desktop-token broker needs a low-spec-safe compile timeout');
    assert.strictEqual(brokerOpen.options.env.MINERADIO_WE_CONTROL_TARGET, executable);
    assert.strictEqual(brokerOpen.options.env.TEMP, brokerOpen.options.env.MINERADIO_NATIVE_TEMP_DIR, 'Add-Type helpers must use the stable native temp directory');
    assert.strictEqual(brokerOpen.options.env.TMP, brokerOpen.options.env.MINERADIO_NATIVE_TEMP_DIR, 'PowerShell TMP must match the stable native temp directory');
    assert(/\bopenWallpaper\b/.test(brokerOpen.options.env.MINERADIO_WE_CONTROL_COMMAND_LINE));
    assert(/wallpaper-engine-scene-stage/i.test(brokerOpen.options.env.MINERADIO_WE_CONTROL_COMMAND_LINE), 'an embedded sound package must launch through the cached silent Scene manifest');
    const decodedBroker = Buffer.from(brokerOpen.args[brokerOpen.args.indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le');
    assert(decodedBroker.includes('GetShellWindow'));
    assert(decodedBroker.includes('GetIntegrityRid'));
    assert(decodedBroker.includes('PROC_THREAD_ATTRIBUTE_PARENT_PROCESS'), 'the broker must assign Explorer as the child parent');
    assert(/\bCreateProcessW\b/.test(decodedBroker), 'the broker must create the child with the Explorer parent attribute');
    assert(decodedBroker.includes('childIntegrityRid'), 'the broker must verify the created child integrity level');
    assert(decodedBroker.includes('TerminateProcess'), 'the broker must terminate a child that did not inherit medium integrity');
    assert(!decodedBroker.includes(executable) && !decodedBroker.includes(projectFile));
    brokerCalls.slice(1, 2).forEach((call) => {
      assert(/\bapplyProperties\b/.test(call.options.env.MINERADIO_WE_CONTROL_COMMAND_LINE));
      assert(/-location\s+"Mineradio Wallpaper [a-f0-9]{24}"/.test(call.options.env.MINERADIO_WE_CONTROL_COMMAND_LINE), 'audio suppression must target only the Mineradio pop-out location');
      assert(call.options.env.MINERADIO_WE_CONTROL_COMMAND_LINE.includes('RAW~({"volume":0})~END'), 'the broker must preserve Wallpaper Engine RAW JSON without backslash escaping');
      assert(!/\s-control\s+mute(?:\s|$)/.test(call.options.env.MINERADIO_WE_CONTROL_COMMAND_LINE), 'global Wallpaper Engine mute must never be used');
    });
    assert(/\bcloseWallpaper\b/.test(brokerCalls[2].options.env.MINERADIO_WE_CONTROL_COMMAND_LINE));
    await brokerRuntime._runTransientControl(executable, ['-control', 'getWallpaper', '-monitor', '0']);
    assert.strictEqual(brokerCalls.length, 4, 'the elevated readiness probe must use the desktop-token broker');
    const readyBroker = brokerCalls[3];
    assert(/\bgetWallpaper\b/.test(readyBroker.options.env.MINERADIO_WE_CONTROL_COMMAND_LINE));
    assert.strictEqual(readyBroker.options.env.MINERADIO_WE_CONTROL_WAIT, '1', 'the readiness broker must wait for the control process to exit');
    assert.strictEqual(readyBroker.options.env.MINERADIO_WE_CONTROL_WAIT_TIMEOUT, '10000');
    const decodedReadyBroker = Buffer.from(readyBroker.args[readyBroker.args.indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le');
    assert(decodedReadyBroker.includes('WaitForSingleObject'));
    assert(decodedReadyBroker.includes('GetExitCodeProcess'));
    const runtimeSourceText = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'wallpaper-engine-runtime.js'), 'utf8');
    assert(runtimeSourceText.includes('closeWait.ElapsedMilliseconds < 1800'), 'native close must wait for the exact HWND to disappear');
    assert(runtimeSourceText.includes('closeResult.closed = !IsWindow(hWnd)'), 'native close must report observed window disappearance');
    assert(runtimeSourceText.includes('await this._spawnControl(requested, []);'), 'cold startup must launch the signed Wallpaper Engine executable directly with empty arguments');
    assert(runtimeSourceText.includes('WALLPAPER_ENGINE_INITIAL_OPEN_DUPLICATE'), 'the runtime must guard the one permitted initial open');
    assert(!runtimeSourceText.includes('coldStartReplayed'), 'the obsolete delayed replay state must stay removed');
    assert(!runtimeSourceText.includes('COLD_START_REPLAY'), 'the obsolete replay timer must stay removed');
    assert(!runtimeSourceText.includes('onSourceMiss'), 'source polling must never trigger another open command');
    assert(runtimeSourceText.includes('FindWindowEx(IntPtr.Zero, IntPtr.Zero, "Progman", null)'),
      'the DWM helper must locate the top-level Progman desktop icon host without mutating Explorer');
    assert(runtimeSourceText.includes('"SHELLDLL_DefView"') && runtimeSourceText.includes('"WorkerW"'),
      'the DWM helper must recognize both Progman and WorkerW desktop icon hosts');
    assert(runtimeSourceText.includes('hostRoot != hostWindow && hostRoot != iconHost'),
      'desktop icon z-order must accept the shaped Electron child of the real icon host but reject unrelated WorkerW children');
    assert(runtimeSourceText.includes('desktopIconLayeringEnabled || hostRoot != hostWindow')
      && runtimeSourceText.includes('iconHost != IntPtr.Zero ? iconHost : hostLayer'),
    'the DWM surface must survive a hot flag transition by ordering against a top-level host layer, never a child HWND');
    assert(runtimeSourceText.includes('session.dwmDesktopIconLayering === enabled) {')
      && runtimeSourceText.includes('session.dwmSurfaceDesktopIconLayering = enabled;'),
    'a late helper ACK must also repair the desired desktop-icon state used by a later DWM helper restart');
    assert(runtimeSourceText.includes('SetWindowPos(Handle, surfaceInsertAfter')
      && runtimeSourceText.includes('SetWindowPos(sourceWindow, Handle'),
      'the unique DWM surface must remain above its exact Wallpaper Engine source');
    assert(runtimeSourceText.includes('SetWindowPos(sourceWindow, surfaceInsertAfter')
      && runtimeSourceText.includes('SetWindowPos(Handle, sourceWindow'),
      'before thumbnail activation the exact source must remain above the empty DWM destination to prevent a black startup frame');
    assert(!runtimeSourceText.includes('SetWindowPos(hostWindow'),
      'the 60ms DWM follow timer must never promote or otherwise reorder the Electron main window');
    await brokerRuntime.dispose();

    const conservativeBrokerCalls = [];
    const conservativeDirectSpawns = [];
    const conservativeRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => true,
      engineReadyProbe: async () => true,
      hostElevationProbe: async () => { throw new Error('probe unavailable'); },
      windowController: makeWindowController(),
      execFile: validSignatureExec([]),
      controlExecFile: (file, args, options, callback) => {
        conservativeBrokerCalls.push({ file, args: [...args], options: { ...options } });
        queueMicrotask(() => callback(new Error('expected broker failure'), '', 'expected broker failure'));
        return new EventEmitter();
      },
      spawn: makeSpawnRecorder(conservativeDirectSpawns),
      library: { getNativeSceneTarget: async (id) => ({ id, projectFile, scenePackage }) },
      desktopCapturer: { getSources: async () => [] },
    });
    await assert.rejects(
      () => conservativeRuntime.start('aaaaaaaaaaaaaaaaaaaaaaaa'),
      (error) => error && error.code === 'WALLPAPER_ENGINE_CONTROL_FAILED'
    );
    assert.strictEqual(conservativeBrokerCalls.length, 1, 'an uncertain elevation probe must still use the safe broker');
    assert.strictEqual(conservativeDirectSpawns.length, 0, 'an uncertain elevation probe must never fail open to direct spawn');
    await conservativeRuntime.dispose();

    const badSignatureCalls = [];
    const blockedSpawns = [];
    const invalidSignerRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => true,
      engineReadyProbe: async () => true,
      useDesktopShellBroker: false,
      windowController: makeWindowController(),
      execFile: validSignatureExec(badSignatureCalls, 'CN=Untrusted Wallpaper Runner'),
      spawn: makeSpawnRecorder(blockedSpawns),
      desktopCapturer: { getSources: async () => [] },
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage }) },
    });
    const blockedProbe = await invalidSignerRuntime.probe();
    assert.deepStrictEqual(blockedProbe, { ok: true, available: false, reason: 'WALLPAPER_ENGINE_SIGNATURE_INVALID' });
    await assert.rejects(
      () => invalidSignerRuntime.start('0123456789abcdef01234567'),
      (error) => error && error.code === 'WALLPAPER_ENGINE_SIGNATURE_INVALID'
    );
    assert.strictEqual(badSignatureCalls.length, 1, 'invalid signature status should be cached between probe and start');
    assert.strictEqual(blockedSpawns.length, 0, 'an untrusted executable must never be started');

    const executableTargetRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => true,
      engineReadyProbe: async () => true,
      useDesktopShellBroker: false,
      windowController: makeWindowController(),
      execFile: validSignatureExec([]),
      spawn: makeSpawnRecorder(blockedSpawns),
      desktopCapturer: { getSources: async () => [] },
      library: {
        getNativeSceneTarget: async (id) => ({ id, scenePackage: path.join(temp, 'imported-wallpaper.exe') }),
      },
    });
    fs.writeFileSync(path.join(temp, 'imported-wallpaper.exe'), 'must not run', 'utf8');
    await assert.rejects(
      () => executableTargetRuntime.start('0123456789abcdef01234567'),
      (error) => error && error.code === 'WALLPAPER_SCENE_PACKAGE_INVALID'
    );
    assert.strictEqual(blockedSpawns.length, 0, 'imported application executables must never be launched');

    const concurrentSpawns = [];
    let releaseFirstSleep;
    let notifyFirstPoll;
    let firstPollNotified = false;
    const firstSleep = new Promise((resolve) => { releaseFirstSleep = resolve; });
    const firstPoll = new Promise((resolve) => { notifyFirstPoll = resolve; });
    const concurrentRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => true,
      engineReadyProbe: async () => true,
      useDesktopShellBroker: false,
      windowController: makeWindowController(),
      execFile: validSignatureExec([]),
      controlExecFile: makeTransientControlRecorder(),
      spawn: makeSpawnRecorder(concurrentSpawns),
      sleep: async () => firstSleep,
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage }) },
      desktopCapturer: {
        async getSources() {
          const opens = concurrentSpawns.filter((call) => call.args[1] === 'openWallpaper');
          if (opens.length < 2) {
            if (!firstPollNotified) {
              firstPollNotified = true;
              notifyFirstPoll();
            }
            return [];
          }
          const newestOpen = opens[opens.length - 1];
          const title = newestOpen.args[newestOpen.args.indexOf('-playInWindow') + 1];
          return [{ id: 'window:newest:0', name: title }];
        },
      },
    });
    const oldStartOutcome = concurrentRuntime.start('111111111111111111111111', { sourceTimeoutMs: 500 })
      .then((value) => ({ value }), (error) => ({ error }));
    await firstPoll;
    const newest = await concurrentRuntime.start('222222222222222222222222', { sourceTimeoutMs: 500 });
    releaseFirstSleep();
    const oldOutcome = await oldStartOutcome;
    assert.strictEqual(oldOutcome.error && oldOutcome.error.code, 'WALLPAPER_ENGINE_START_SUPERSEDED');
    assert.strictEqual(newest.sourceId, 'window:newest:0');
    assert.strictEqual(concurrentRuntime.getStatus().sessionId, newest.sessionId, 'superseded startup must not replace the newest session');
    const closedLocations = concurrentSpawns
      .filter((call) => call.args[1] === 'closeWallpaper')
      .map((call) => call.args[call.args.indexOf('-location') + 1]);
    const newestOpen = concurrentSpawns.filter((call) => call.args[1] === 'openWallpaper').slice(-1)[0];
    const newestTitle = newestOpen.args[newestOpen.args.indexOf('-playInWindow') + 1];
    assert(!closedLocations.includes(newestTitle), 'superseded startup cleanup must not close the newest session');
    await concurrentRuntime.stop(newest.sessionId);
    await concurrentRuntime.dispose();

    const switchSpawns = [];
    const switchWindowCalls = [];
    const switchRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => true,
      engineReadyProbe: async () => true,
      useDesktopShellBroker: false,
      windowController: makeWindowController(switchWindowCalls),
      execFile: validSignatureExec([]),
      controlExecFile: makeTransientControlRecorder(),
      spawn: makeSpawnRecorder(switchSpawns),
      sleep: async () => {},
      nativeSleep: async () => {},
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage }) },
      desktopCapturer: {
        async getSources() {
          const opens = switchSpawns.filter((call) => call.args[1] === 'openWallpaper');
          const currentOpen = opens[opens.length - 1];
          if (!currentOpen) return [];
          const title = currentOpen.args[currentOpen.args.indexOf('-playInWindow') + 1];
          return [{ id: `window:${5900 + opens.length}:0`, name: title }];
        },
      },
    });
    const switchFirst = await switchRuntime.start('333333333333333333333333', { sourceTimeoutMs: 500 });
    const switchFirstOpen = switchSpawns.find((call) => call.args[1] === 'openWallpaper');
    const switchFirstTitle = switchFirstOpen.args[switchFirstOpen.args.indexOf('-playInWindow') + 1];
    const switchSecond = await switchRuntime.start('444444444444444444444444', { sourceTimeoutMs: 500 });
    assert(switchSecond && switchSecond.active, 'automatic targeted cleanup must preserve the replacement start');
    assert.notStrictEqual(switchSecond.sessionId, switchFirst.sessionId);
    assert.strictEqual(switchRuntime.getStatus().sessionId, switchSecond.sessionId);
    const switchLifecycleCalls = switchSpawns.filter((call) => call.args[1] === 'openWallpaper'
      || call.args[1] === 'closeWallpaper');
    assert.deepStrictEqual(switchLifecycleCalls.slice(0, 3).map((call) => call.args[1]), [
      'openWallpaper',
      'closeWallpaper',
      'openWallpaper',
    ], 'a consecutive start must close the old location before issuing the replacement open');
    const switchOldCloseIndex = switchSpawns.findIndex((call) => call.args[1] === 'closeWallpaper'
      && call.args[call.args.indexOf('-location') + 1] === switchFirstTitle);
    const switchSecondOpenIndex = switchSpawns.findIndex((call) => call.args[1] === 'openWallpaper'
      && call.args[call.args.indexOf('-playInWindow') + 1] !== switchFirstTitle);
    assert(switchOldCloseIndex > switchSpawns.indexOf(switchFirstOpen),
      'the old location close must follow its own initial open');
    assert(switchSecondOpenIndex > switchOldCloseIndex,
      'the old closeWallpaper command must be recorded strictly before the second openWallpaper command');
    assert.strictEqual(switchSpawns.filter((call) => call.args[1] === 'openWallpaper').length, 2,
      'two consecutive starts must create exactly two unique locations');
    assert.strictEqual(switchSpawns.filter((call) => call.args[1] === 'closeWallpaper').length, 1,
      'the replacement must close only the old location before it becomes active');
    assert.strictEqual(switchWindowCalls.filter((call) => call.action === 'close').length, 1,
      'the old exact HWND must receive one native close confirmation before replacement');
    assert.strictEqual(switchWindowCalls.find((call) => call.action === 'close').details.sourceId, switchFirst.sourceId);
    await switchRuntime.stop();
    assert.strictEqual(switchRuntime.getStatus().active, false, 'global hidden cleanup must stop the surviving replacement session');
    const switchOpenTitles = switchSpawns
      .filter((call) => call.args[1] === 'openWallpaper')
      .map((call) => call.args[call.args.indexOf('-playInWindow') + 1]);
    const switchClosedTitles = switchSpawns
      .filter((call) => call.args[1] === 'closeWallpaper')
      .map((call) => call.args[call.args.indexOf('-location') + 1]);
    assert.strictEqual(new Set(switchOpenTitles).size, 2, 'each consecutive start must keep a unique location title');
    assert.strictEqual(switchClosedTitles.length, 2, 'old and replacement locations must each close exactly once');
    assert.strictEqual(new Set(switchClosedTitles).size, 2, 'cleanup must not close either unique location twice');
    switchOpenTitles.forEach((title) => assert(switchClosedTitles.includes(title), 'every opened switch location must be closed'));
    await switchRuntime.dispose();

    const replacementCloseFailureSpawns = [];
    const replacementCloseFailureWindowCalls = [];
    const replacementCloseFailureDwmSpawns = [];
    const replacementCloseFailureDwmCommands = [];
    let replacementCloseAttempts = 0;
    const replacementCloseFailureRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => true,
      engineReadyProbe: async () => true,
      useDesktopShellBroker: false,
      nativeTempPath: path.join(temp, 'replacement-close-failure-native'),
      windowController: async (action, details) => {
        replacementCloseFailureWindowCalls.push({ action, details: { ...details } });
        if (action === 'close') {
          replacementCloseAttempts += 1;
          const closed = replacementCloseAttempts > 1;
          return { ok: true, closePosted: true, closed, missing: closed };
        }
        return {
          ok: true,
          moved: action === 'embed' || action === 'park',
          embedded: action === 'embed',
          parked: action === 'park',
          aligned: action === 'embed',
          rounded: action === 'embed',
          sourceWindowId: details.sourceId,
          sourceProcessId: 6006,
          hostProcessId: 31337,
        };
      },
      execFile: validSignatureExec([]),
      controlExecFile: makeTransientControlRecorder(),
      spawn: makeSpawnRecorder(replacementCloseFailureSpawns),
      dwmSurfaceSpawn: makeDwmSurfaceSpawn(
        replacementCloseFailureDwmSpawns,
        replacementCloseFailureDwmCommands,
        { firstPid: 60060 }
      ),
      sleep: async () => {},
      nativeSleep: async () => {},
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage }) },
      desktopCapturer: {
        async getSources() {
          const openCall = replacementCloseFailureSpawns
            .filter((call) => call.args[1] === 'openWallpaper')
            .slice(-1)[0];
          if (!openCall) return [];
          const title = openCall.args[openCall.args.indexOf('-playInWindow') + 1];
          return [{ id: 'window:6006:0', name: title }];
        },
      },
    });
    const replacementCloseFailureOld = await replacementCloseFailureRuntime.start(
      '606060606060606060606060',
      { sourceTimeoutMs: 500 }
    );
    try {
      await replacementCloseFailureRuntime.embedActiveWindow(replacementCloseFailureOld.sessionId, {
        hostWindowId: '31337',
        hostExecutable: executable,
        cornerRadius: 24,
      });
      assert.strictEqual(await replacementCloseFailureRuntime.confirmCaptureReady(replacementCloseFailureOld.sessionId), true);
      await replacementCloseFailureRuntime.activateDwmSurface(replacementCloseFailureOld.sessionId);
      const replacementOldSession = replacementCloseFailureRuntime.active;
      const replacementOldHelper = replacementOldSession.dwmSurfaceProcess;
      const replacementOldHelperPid = replacementCloseFailureRuntime.getStatus().dwmSurfaceHelperPid;
      assert(replacementOldHelper && replacementOldHelperPid > 0, 'the rollback fixture must begin with an active helper');
      assert(replacementOldSession.muteReassertTimers.size > 0, 'the rollback fixture must begin with mute reassertions');
      const replacementInitialOpenCount = replacementCloseFailureSpawns
        .filter((call) => call.args[1] === 'openWallpaper').length;
      const replacementOldOpen = replacementCloseFailureSpawns.find((call) => call.args[1] === 'openWallpaper');
      const replacementOldTitle = replacementOldOpen.args[replacementOldOpen.args.indexOf('-playInWindow') + 1];
      const replacementFailedStart = await replacementCloseFailureRuntime.start(
        '616161616161616161616161',
        { sourceTimeoutMs: 500 }
      ).then((value) => ({ value }), (error) => ({ error }));
      assert.strictEqual(replacementFailedStart.error && replacementFailedStart.error.code,
        'WALLPAPER_ENGINE_WINDOW_CLOSE_FAILED',
        'closed:false must fail the replacement start with the retryable exact-window close code');
      assert.strictEqual(replacementCloseFailureSpawns.filter((call) => call.args[1] === 'openWallpaper').length,
        replacementInitialOpenCount,
        'closed:false must keep the replacement open count at zero');
      assert.strictEqual(replacementCloseAttempts, 1,
        'the failed replacement start must perform exactly one native close attempt');
      const replacementFailedCloseCall = replacementCloseFailureWindowCalls.filter((call) => call.action === 'close')[0];
      assert(replacementFailedCloseCall, 'the replacement must attempt one exact native close');
      assert.strictEqual(replacementFailedCloseCall.details.sourceId, replacementCloseFailureOld.sourceId,
        'the failed close must remain bound to the old active source HWND');
      const replacementPreservedStatus = replacementCloseFailureRuntime.getStatus();
      assert.strictEqual(replacementPreservedStatus.active, true,
        'closed:false must preserve the old active session instead of publishing the replacement');
      assert.strictEqual(replacementPreservedStatus.sessionId, replacementCloseFailureOld.sessionId);
      assert.strictEqual(replacementPreservedStatus.sourceId, replacementCloseFailureOld.sourceId);
      assert.strictEqual(replacementCloseFailureRuntime.active.stopping, false,
        'a failed close must leave the old active session retryable');
      assert.strictEqual(replacementCloseFailureRuntime.pending, null,
        'the rejected replacement must not remain as a stale pending session');
      assert.strictEqual(replacementPreservedStatus.dwmSurfaceReady, true,
        'closed:false must keep the old DWM helper Ready');
      assert.strictEqual(replacementPreservedStatus.dwmSurfaceActive, true,
        'closed:false must keep the old DWM helper Active');
      assert.strictEqual(replacementPreservedStatus.dwmSurfaceHelperPid, replacementOldHelperPid,
        'closed:false must preserve the exact old helper process');
      assert.strictEqual(replacementCloseFailureRuntime.active.dwmSurfaceProcess, replacementOldHelper);
      assert(replacementCloseFailureRuntime.active.muteReassertTimers.size > 0,
        'closed:false must rebuild the old location mute reassertions');
      assert.strictEqual(replacementCloseFailureRuntime.noteHostPointerActivity({
        sessionId: replacementCloseFailureOld.sessionId,
        xUnit: 12345,
        yUnit: 23456,
      }), false, 'the preserved aligned DWM session must continue using only the real Windows cursor');
      const replacementExactRetry = await replacementCloseFailureRuntime.stop(replacementCloseFailureOld.sessionId);
      assert.strictEqual(replacementExactRetry.stopped, true,
        'the preserved old active session must accept an exact-session close retry');
      assert.strictEqual(replacementCloseAttempts, 2);
      assert.strictEqual(replacementCloseFailureRuntime.getStatus().active, false);
      const replacementCloseCommands = replacementCloseFailureSpawns
        .filter((call) => call.args[1] === 'closeWallpaper');
      assert.strictEqual(replacementCloseCommands.length, 2,
        'the exact retry must issue one new close command after the failed attempt');
      replacementCloseCommands.forEach((call) => {
        assert.strictEqual(call.args[call.args.indexOf('-location') + 1], replacementOldTitle,
          'every failed/retried close must target only the preserved old location');
      });
      assert(replacementCloseFailureDwmCommands.some((entry) => entry.command === 'Q'),
        'the helper may be retired only after the exact retry confirms the old window closed');
    } finally {
      await replacementCloseFailureRuntime.stop();
      await replacementCloseFailureRuntime.dispose();
    }

    const refreshRaceSpawns = [];
    let releaseRefreshPoll;
    let notifyRefreshPoll;
    let refreshPollNotified = false;
    let refreshRaceStarted = false;
    const refreshPollGate = new Promise((resolve) => { releaseRefreshPoll = resolve; });
    const refreshPollStarted = new Promise((resolve) => { notifyRefreshPoll = resolve; });
    const refreshRaceRuntime = new WallpaperEngineRuntime({
      platform: 'win32',
      discoverSteamLibraries: async () => [steamLibrary],
      engineProcessProbe: async () => true,
      engineReadyProbe: async () => true,
      useDesktopShellBroker: false,
      windowController: makeWindowController(),
      execFile: validSignatureExec([]),
      controlExecFile: makeTransientControlRecorder(),
      spawn: makeSpawnRecorder(refreshRaceSpawns),
      sleep: async () => {
        if (!refreshRaceStarted) return;
        await refreshPollGate;
      },
      library: { getNativeSceneTarget: async (id) => ({ id, scenePackage }) },
      desktopCapturer: {
        async getSources() {
          const open = refreshRaceSpawns.find((call) => call.args[1] === 'openWallpaper');
          if (!open) return [];
          const title = open.args[open.args.indexOf('-playInWindow') + 1];
          if (!refreshRaceStarted) return [{ id: 'window:refresh-active:0', name: title }];
          if (!refreshPollNotified) {
            refreshPollNotified = true;
            notifyRefreshPoll();
          }
          return [];
        },
      },
    });
    const refreshRaceSession = await refreshRaceRuntime.start('555555555555555555555555', { sourceTimeoutMs: 500 });
    refreshRaceStarted = true;
    const staleRefreshOutcome = refreshRaceRuntime.refreshActiveSource(refreshRaceSession.sessionId, {
      sourceTimeoutMs: 500,
      sourcePollMs: 50,
    }).then((value) => ({ value }), (error) => ({ error }));
    await refreshPollStarted;
    await refreshRaceRuntime.stop(refreshRaceSession.sessionId);
    releaseRefreshPoll();
    const staleRefresh = await staleRefreshOutcome;
    assert.strictEqual(staleRefresh.error && staleRefresh.error.code, 'WALLPAPER_ENGINE_REFRESH_SUPERSEDED');
    assert.strictEqual(refreshRaceRuntime.getStatus().active, false, 'a stale refresh must not restore a stopped session');
    await refreshRaceRuntime.dispose();

    console.log(JSON.stringify({
      ok: true,
      sourceId: refreshed.sourceId,
      signatureChecks: signatureCalls.length,
      controlCalls: spawnCalls.length,
      captureCalls,
      dynamicSourceRefresh: true,
      exactCaptureSourceReuse: true,
      coldStartSingleOpen: true,
      coldStartSourceTimeoutCleanup: true,
      processProbeDeadlineGuard: true,
      readyCachePidBound: true,
      initialOpenStopRaceGuard: true,
      relaunchCloseFailureGuard: true,
      relaunchStopRaceGuard: true,
      embedSingleFlightGuard: true,
      engineSignatureGuard: true,
      projectManifestLaunch: true,
      pkgPakLaunch: true,
      mutedSceneCacheContentGuard: true,
      silentStageFallbackStatusGuard: true,
      workshopScenePackageImmutable: true,
      locationMuteRetryGuard: true,
      transientMuteAcknowledged: true,
      locationScopedMuteReassertion: true,
      captureReadyMuteReassertion: true,
      stoppedMuteTimersCleared: true,
      nativeCornerRadiusForwarded: true,
      elevatedExplorerParentBroker: true,
      elevatedReadinessWait: true,
      conservativeElevationFallback: true,
      strictRefreshTitle: true,
      refreshGenerationGuard: true,
      generationGuard: true,
      activePendingStopGuard: true,
      consecutiveStartCloseOrderGuard: true,
      replacementCloseFailureRetryGuard: true,
      dwmSurfaceReadinessGuard: true,
      dwmGlassGeometryGuard: true,
      dwmGlassSvgSamplerGuard: true,
      dwmSurfaceFailureCleanupGuard: true,
      realCursorNoSyntheticRelayGuard: true,
      publicPathLeak: false,
    }));
  } finally {
    await runtime.dispose();
    const resolved = path.resolve(temp);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(resolved, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
