#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const portArgument = process.argv.find((value) => /^--port=\d+$/.test(value));
const workshopArgument = process.argv.find((value) => /^--workshop=\d+$/.test(value));
const repeatArgument = process.argv.find((value) => /^--repeat=\d+$/.test(value));
const port = Math.max(1, Math.min(65535, Number(portArgument && portArgument.split('=')[1]) || 9333));
const requestedWorkshopId = workshopArgument ? workshopArgument.split('=')[1] : '3715870843';
const repeat = Math.max(1, Math.min(10, Number(repeatArgument && repeatArgument.split('=')[1]) || 3));
const closeApp = process.argv.includes('--close-app');
const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${process.pid}-${Math.random().toString(16).slice(2, 10)}`;
const outputRoot = path.join('D:\\MineradioCache\\we-normal-user-qa', runId);
const resultPath = path.join(outputRoot, 'result.json');
const windowListScript = path.join(__dirname, 'check-wallpaper-engine-window-list.ps1');

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    this.consoleMessages = [];
    this.closed = false;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data || '{}'));
      if (message.method === 'Runtime.consoleAPICalled') {
        this.consoleMessages.push({
          type: message.params && message.params.type,
          args: ((message.params && message.params.args) || []).map((item) => item.value || item.description || item.type),
        });
        this.consoleMessages = this.consoleMessages.slice(-80);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.consoleMessages.push({
          type: 'exception',
          args: [message.params && message.params.exceptionDetails
            && (message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)],
        });
        this.consoleMessages = this.consoleMessages.slice(-80);
        return;
      }
      if (!message.id || !this.pending.has(message.id)) return;
      const waiter = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message || 'CDP request failed'));
      else waiter.resolve(message.result || {});
    });
    socket.addEventListener('close', () => {
      this.closed = true;
      for (const waiter of this.pending.values()) waiter.reject(new Error('CDP connection closed'));
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    const client = new CdpClient(socket);
    await client.call('Runtime.enable');
    await client.call('Page.enable');
    return client;
  }

  call(method, params = {}) {
    if (this.closed) return Promise.reject(new Error('CDP connection is closed'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, userGesture = true) {
    const response = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description
        || response.exceptionDetails.text
        || 'Renderer evaluation failed');
    }
    return response.result?.value;
  }

  close() {
    if (!this.closed) this.socket.close();
  }
}

async function waitForCdpTarget(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find((item) => item.type === 'page' && /127\.0\.0\.1/.test(item.url || ''));
      if (target && target.webSocketDebuggerUrl) return target;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for Mineradio CDP on ${port}: ${lastError && lastError.message || 'no page target'}`);
}

const STATE_EXPRESSION = `(async () => {
  const api = wallpaperEngineDesktopApi();
  const runtime = api && typeof api.getWallpaperEngineRuntimeStatus === 'function'
    ? await api.getWallpaperEngineRuntimeStatus({})
    : null;
  const video = document.getElementById('wallpaper-engine-video');
  const layer = document.getElementById('wallpaper-engine-layer');
  const bar = document.getElementById('bottom-bar');
  const glassSampler = document.getElementById('wallpaper-engine-glass-sampler');
  const glassVideo = document.getElementById('wallpaper-engine-glass-sampler-video');
  const stream = video && video.srcObject;
  const videoTrack = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
  const glassStream = typeof wallpaperEngineGlassCaptureStream !== 'undefined'
    ? wallpaperEngineGlassCaptureStream : null;
  const glassTrack = glassStream && glassStream.getVideoTracks ? glassStream.getVideoTracks()[0] : null;
  const barRect = bar ? bar.getBoundingClientRect() : null;
  const barStyle = bar ? getComputedStyle(bar) : null;
  const samplerRect = glassSampler ? glassSampler.getBoundingClientRect() : null;
  const glassVideoRect = glassVideo ? glassVideo.getBoundingClientRect() : null;
  const bodyDwmActive = document.body.classList.contains('wallpaper-engine-dwm-active');
  const controlGlassVisible = !!(bodyDwmActive && bar && barRect && barStyle
    && bar.classList.contains('visible')
    && !bar.classList.contains('soft-hidden')
    && !document.body.classList.contains('home-controls-locked')
    && barStyle.display !== 'none'
    && barStyle.visibility !== 'hidden'
    && Number(barStyle.opacity || 0) > 0.01
    && barRect.right > 0 && barRect.bottom > 0
    && barRect.left < window.innerWidth && barRect.top < window.innerHeight);
  return {
    documentHidden: document.hidden,
    selectionActive: !!wallpaperEngineSelection.active,
    kind: String(wallpaperEngineSelection.kind || ''),
    selectionId: String(wallpaperEngineSelection.id || ''),
    sessionId: String(wallpaperEngineNativeSessionId || ''),
    captureMode: String(typeof wallpaperEngineCaptureMode !== 'undefined' ? wallpaperEngineCaptureMode || '' : ''),
    bodyActive: document.body.classList.contains('wallpaper-engine-active'),
    bodyDwmActive,
    runtimeError: String(wallpaperEngineRuntimeError || ''),
    hasStream: !!stream,
    videoWidth: Number(video && video.videoWidth) || 0,
    videoHeight: Number(video && video.videoHeight) || 0,
    videoTrackState: String(videoTrack && videoTrack.readyState || ''),
    audioTrackCount: stream && stream.getAudioTracks ? stream.getAudioTracks().length : 0,
    innerWidth: Number(window.innerWidth) || 0,
    innerHeight: Number(window.innerHeight) || 0,
    freezeReady: !!(layer && layer.classList.contains('freeze-ready')),
    cursorProxyPresent: !!document.getElementById('wallpaper-engine-cursor-proxy'),
    cursorProxyActive: document.body.classList.contains('wallpaper-engine-cursor-proxy-active'),
    controlGlass: barRect && barStyle ? {
      active: controlGlassVisible,
      left: barRect.left,
      top: barRect.top,
      width: barRect.width,
      height: barRect.height,
      radius: parseFloat(barStyle.borderRadius) || Math.min(barRect.height / 2, 50),
      opacity: Number(barStyle.opacity || 0),
      backdropFilter: String(barStyle.backdropFilter || barStyle.webkitBackdropFilter || ''),
    } : null,
    glassSampler: samplerRect ? {
      ready: document.body.classList.contains('wallpaper-engine-glass-sampler-ready'),
      visible: glassSampler.classList.contains('bar-visible'),
      hasStream: !!glassStream,
      trackState: String(glassTrack && glassTrack.readyState || ''),
      audioTrackCount: glassStream && glassStream.getAudioTracks ? glassStream.getAudioTracks().length : 0,
      videoWidth: Number(glassVideo && glassVideo.videoWidth) || 0,
      videoHeight: Number(glassVideo && glassVideo.videoHeight) || 0,
      left: samplerRect.left,
      top: samplerRect.top,
      width: samplerRect.width,
      height: samplerRect.height,
      videoLeft: glassVideoRect && glassVideoRect.left,
      videoTop: glassVideoRect && glassVideoRect.top,
      videoCssWidth: glassVideoRect && glassVideoRect.width,
      videoCssHeight: glassVideoRect && glassVideoRect.height,
    } : null,
    runtime,
  };
})()`;

async function readState(client) {
  return client.evaluate(STATE_EXPRESSION, false);
}

async function waitForState(client, label, predicate, timeoutMs = 70000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await readState(client);
    if (predicate(last)) return last;
    await sleep(220);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

function listWindows(titlePrefix) {
  const result = spawnSync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    windowListScript,
    '-TitlePrefix',
    titlePrefix,
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout || 'Wallpaper window enumeration failed');
  const text = String(result.stdout || '').trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);
}

function listExactSourceWindows() {
  return listWindows('Mineradio Wallpaper ');
}

function listDwmSurfaceWindows() {
  return listWindows('Mineradio WE ');
}

async function waitForExactSourceWindowCount(expected, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let windows = [];
  while (Date.now() < deadline) {
    windows = listExactSourceWindows();
    if (windows.length === expected) return windows;
    await sleep(250);
  }
  throw new Error(`Exact Mineradio Wallpaper window count stayed ${windows.length}, expected ${expected}`);
}

function numberNear(actual, expected, tolerance, label) {
  assert(Number.isFinite(Number(actual)), `${label}: actual value is not finite`);
  assert(Number.isFinite(Number(expected)), `${label}: expected value is not finite`);
  assert(Math.abs(Number(actual) - Number(expected)) <= tolerance,
    `${label}: ${actual} differs from ${expected} by more than ${tolerance}`);
}

function assertRectNear(actual, expected, tolerance, label) {
  assert(actual && expected, `${label}: rectangle is missing`);
  for (const key of ['left', 'top', 'right', 'bottom', 'width', 'height']) {
    if (Object.prototype.hasOwnProperty.call(actual, key)
      && Object.prototype.hasOwnProperty.call(expected, key)) {
      numberNear(actual[key], expected[key], tolerance, `${label}.${key}`);
    }
  }
}

function assertControlGlassGeometry(state, nativeWindows, round) {
  const geometry = state.runtime && state.runtime.dwmGlassSurfaceGeometry;
  const bar = state.controlGlass;
  const sampler = state.glassSampler;
  assert(bar && bar.active, `round ${round}: the existing control glass is not visible`);
  assert(sampler && sampler.ready && sampler.visible, `round ${round}: SVG wallpaper sampler is not visible`);
  assert(sampler.hasStream && sampler.trackState === 'live', `round ${round}: SVG wallpaper sampler stream is not live`);
  assert.strictEqual(sampler.audioTrackCount, 0, `round ${round}: SVG wallpaper sampler contains audio`);
  assert(sampler.videoWidth >= 2 && sampler.videoHeight >= 2,
    `round ${round}: SVG wallpaper sampler has no decoded frame`);
  assert(/url\(["']?#mineradio-control-glass-filter["']?\)/.test(bar.backdropFilter),
    `round ${round}: the saved control-console SVG filter is not active`);
  assert(geometry, `round ${round}: SVG sampler geometry is missing`);
  if (Object.prototype.hasOwnProperty.call(geometry, 'active')) {
    assert.strictEqual(geometry.active, true, `round ${round}: SVG sampler geometry is inactive`);
  }
  for (const key of ['left', 'top', 'width', 'height', 'radius']) {
    numberNear(geometry[key], bar[key], 1.5, `round ${round}: sampler geometry ${key}`);
  }
  numberNear(geometry.viewportWidth, state.innerWidth, 1, `round ${round}: sampler viewport width`);
  numberNear(geometry.viewportHeight, state.innerHeight, 1, `round ${round}: sampler viewport height`);
  for (const key of ['left', 'top', 'width', 'height']) {
    numberNear(sampler[key], bar[key], 1.5, `round ${round}: clipped sampler ${key}`);
  }
  numberNear(sampler.videoLeft, 0, 1.5, `round ${round}: full-frame sampler video left`);
  numberNear(sampler.videoTop, 0, 1.5, `round ${round}: full-frame sampler video top`);
  numberNear(sampler.videoCssWidth, state.innerWidth, 1.5, `round ${round}: full-frame sampler video width`);
  numberNear(sampler.videoCssHeight, state.innerHeight, 1.5, `round ${round}: full-frame sampler video height`);

  const base = nativeWindows.find((item) => item.title === 'Mineradio WE DWM Surface');
  assert(base && base.rect && base.visible, `round ${round}: base DWM window is missing or hidden`);
  assert(!nativeWindows.some((item) => item.title === 'Mineradio WE Glass Refraction'),
    `round ${round}: the removed second transparent native layer is still present`);
}

function assertActiveState(state, previousSessionId, round) {
  assert(state && state.selectionActive, `round ${round}: selection is not active`);
  assert.strictEqual(state.kind, 'engine', state.runtimeError || `round ${round}: selection is not native engine mode`);
  assert.strictEqual(state.bodyActive, true, state.runtimeError || `round ${round}: wallpaper layer is not active`);
  assert.strictEqual(state.bodyDwmActive, true, state.runtimeError || `round ${round}: DWM wallpaper mode is not active`);
  assert.strictEqual(state.captureMode, 'dwm-thumbnail', `round ${round}: renderer is not using DWM composition`);
  assert.strictEqual(state.hasStream, false, `round ${round}: obsolete Chromium capture stream is still attached`);
  assert.strictEqual(state.videoTrackState, '', `round ${round}: obsolete capture video track is still live`);
  assert.strictEqual(state.audioTrackCount, 0, `round ${round}: renderer contains an audio capture track`);
  assert(/^[a-f0-9]{24}$/.test(state.sessionId), `round ${round}: session id is missing`);
  if (previousSessionId) assert.notStrictEqual(state.sessionId, previousSessionId, `round ${round}: session was reused`);
  assert(state.runtime && state.runtime.active === true, `round ${round}: runtime is inactive`);
  assert.strictEqual(state.runtime.sessionId, state.sessionId, `round ${round}: renderer/main session mismatch`);
  assert.strictEqual(state.runtime.captureMode, 'dwm-thumbnail', `round ${round}: main runtime is not using DWM composition`);
  assert.strictEqual(state.runtime.sourceWindowAligned, true, `round ${round}: source is not aligned with the host`);
  assert.strictEqual(state.runtime.sourceWindowParked, false, `round ${round}: source was parked and would lose native cursor parallax`);
  assert.strictEqual(state.runtime.dwmSurfaceReady, true, `round ${round}: base DWM surface is not ready`);
  assert.strictEqual(state.runtime.dwmSurfaceActive, true, `round ${round}: base DWM surface is not active`);
  assert(Number(state.runtime.dwmSurfaceHelperPid) > 0, `round ${round}: DWM helper pid is missing`);
  assert(Number(state.runtime.dwmSurfaceWindowId) > 0, `round ${round}: base DWM HWND is missing`);
  assert.strictEqual(state.runtime.dwmGlassSurfaceReady, true, `round ${round}: SVG sampler source is not ready`);
  assert.strictEqual(state.runtime.dwmGlassSurfaceActive, true, `round ${round}: SVG sampler geometry is not active`);
  assert.strictEqual(String(state.runtime.dwmGlassSurfaceWindowId), String(state.runtime.dwmSurfaceWindowId),
    `round ${round}: SVG sampler must alias the single base DWM HWND`);
  assert.strictEqual(state.runtime.dwmGlassSurfaceSampleMode, 'single-dwm-svg-sampler',
    `round ${round}: an obsolete native refraction sampler is active`);
  assert.strictEqual(state.runtime.audioMuted, true, `round ${round}: source mute is inactive`);
  assert.strictEqual(state.runtime.audioPropertySuppressed, true, `round ${round}: wallpaper audio properties were not suppressed`);
  assert.strictEqual(state.runtime.parallaxPointerRelayReady, false, `round ${round}: obsolete synthetic pointer relay is ready`);
  assert.strictEqual(state.runtime.parallaxPointerRelayActive, false, `round ${round}: obsolete synthetic pointer relay is active`);
  assert.strictEqual(Number(state.runtime.parallaxPointerRelayHelperPid) || 0, 0,
    `round ${round}: obsolete synthetic pointer helper exists`);
  assert.strictEqual(Number(state.runtime.parallaxPointerRelayPosted) || 0, 0,
    `round ${round}: synthetic WM_MOUSEMOVE messages were posted`);
  assert.strictEqual(state.freezeReady, false, `round ${round}: freeze frame covers the live DWM surface`);
  assert.strictEqual(state.cursorProxyPresent, false, `round ${round}: DOM cursor proxy exists`);
  assert.strictEqual(state.cursorProxyActive, false, `round ${round}: DOM cursor proxy is active`);
}

function assertNativeWindows(state, round) {
  const exactWindows = listExactSourceWindows();
  assert.strictEqual(exactWindows.length, 1,
    `round ${round}: expected one exact source window, found ${exactWindows.length}`);
  assert.strictEqual(exactWindows[0].title, `Mineradio Wallpaper ${state.sessionId}`,
    `round ${round}: old source window survived replacement`);
  assert(exactWindows[0].visible && exactWindows[0].rect,
    `round ${round}: exact Wallpaper Engine source is missing or hidden`);

  const dwmWindows = listDwmSurfaceWindows();
  const baseWindows = dwmWindows.filter((item) => item.title === 'Mineradio WE DWM Surface');
  const glassWindows = dwmWindows.filter((item) => item.title === 'Mineradio WE Glass Refraction');
  assert.strictEqual(baseWindows.length, 1, `round ${round}: expected one base DWM surface, found ${baseWindows.length}`);
  assert.strictEqual(glassWindows.length, 0, `round ${round}: removed transparent native layer count is ${glassWindows.length}`);
  const base = baseWindows[0];
  assert.strictEqual(String(base.handle), String(state.runtime.dwmSurfaceWindowId),
    `round ${round}: base DWM HWND does not match runtime status`);
  assert.strictEqual(String(base.handle), String(state.runtime.dwmGlassSurfaceWindowId),
    `round ${round}: SVG sampler source does not alias the base DWM HWND`);
  assert.strictEqual(Number(base.processId), Number(state.runtime.dwmSurfaceHelperPid),
    `round ${round}: base DWM process does not match helper pid`);
  assertRectNear(exactWindows[0].rect, base.rect, 2, `round ${round}: source/base alignment`);
  assertControlGlassGeometry(state, dwmWindows, round);
  return { exactWindows, dwmWindows };
}

async function snapshotSelection(client) {
  return client.evaluate(`(async () => {
    await loadWallpaperEngineLibrary(true, false);
    const raw = localStorage.getItem(WALLPAPER_ENGINE_SELECTION_STORE_KEY);
    return {
      raw,
      selection: normalizeWallpaperEngineSelection(raw ? JSON.parse(raw) : {}),
      runtimeState: await ${STATE_EXPRESSION},
    };
  })()`, false);
}

async function restoreSelection(client, snapshot, applyRuntime) {
  const raw = snapshot && snapshot.raw == null ? null : String(snapshot.raw);
  return client.evaluate(`(async () => {
    const waitFor = async (predicate, timeoutMs = 15000) => {
      const deadline = performance.now() + timeoutMs;
      while (performance.now() < deadline) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      return false;
    };
    deactivateWallpaperEngineBackground(true);
    await waitFor(() => !wallpaperEngineNativeSessionId && !document.body.classList.contains('wallpaper-engine-active'));
    const raw = ${JSON.stringify(raw)};
    if (raw === null) localStorage.removeItem(WALLPAPER_ENGINE_SELECTION_STORE_KEY);
    else localStorage.setItem(WALLPAPER_ENGINE_SELECTION_STORE_KEY, raw);
    let restored = normalizeWallpaperEngineSelection({});
    try { restored = normalizeWallpaperEngineSelection(raw ? JSON.parse(raw) : {}); } catch (_) { }
    wallpaperEngineSelection = restored;
    wallpaperEngineRuntimeError = '';
    updateWallpaperEngineEntryUi();
    renderWallpaperEngineLibrary();
    if (${applyRuntime ? 'true' : 'false'} && restored.active) {
      await loadWallpaperEngineLibrary(true, false);
      const item = wallpaperEngineProjectById(restored.id);
      if (item) applyWallpaperEngineBackground(item, true);
      await waitFor(() => document.body.classList.contains('wallpaper-engine-active') || !!wallpaperEngineRuntimeError, 70000);
    }
    return {
      raw: localStorage.getItem(WALLPAPER_ENGINE_SELECTION_STORE_KEY),
      selection: normalizeWallpaperEngineSelection(wallpaperEngineSelection),
      bodyActive: document.body.classList.contains('wallpaper-engine-active'),
      runtimeError: String(wallpaperEngineRuntimeError || ''),
    };
  })()`, false);
}

async function showControlGlassAndSync(client) {
  return client.evaluate(`(() => {
    try {
      if (typeof controlsHideTimer !== 'undefined' && controlsHideTimer) {
        clearTimeout(controlsHideTimer);
        controlsHideTimer = null;
      }
      if (typeof controlsHovering !== 'undefined') controlsHovering = true;
      if (typeof setControlsHidden === 'function') setControlsHidden(false);
      if (typeof syncWallpaperEngineControlGlassSurface === 'function') {
        controlGlassState.dwmGeometryKey = '';
        syncWallpaperEngineControlGlassSurface(true);
      }
      const bar = document.getElementById('bottom-bar');
      const rect = bar && bar.getBoundingClientRect();
      const style = bar && getComputedStyle(bar);
      if (bar && rect && style && window.desktopWindow
        && typeof desktopWindow.updateWallpaperEngineGlassSurface === 'function') {
        desktopWindow.updateWallpaperEngineGlassSurface({
          sessionId: String(wallpaperEngineNativeSessionId || ''),
          active: true,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          radius: parseFloat(style.borderRadius) || Math.min(rect.height / 2, 50),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        });
      }
      return { ok: true, hasSync: typeof syncWallpaperEngineControlGlassSurface === 'function' };
    } catch (_) {
      return { ok: false, error: String(_ && _.message || _) };
    }
  })()`, false);
}

async function releaseControlGlassTestHold(client) {
  try {
    await client.evaluate(`(() => {
      if (typeof controlsHovering !== 'undefined') controlsHovering = false;
      return true;
    })()`, false);
  } catch (_) { }
}

async function main() {
  assert(process.platform === 'win32', 'Normal-user Wallpaper Engine QA is Windows-only');
  fs.mkdirSync(outputRoot, { recursive: true });
  const evidence = {
    ok: false,
    runId,
    outputRoot,
    resultPath,
    port,
    requestedWorkshopId,
    repeat,
    closeApp,
    startedAt: new Date().toISOString(),
    compositionAcceptance: 'single-native-dwm-base-plus-clipped-svg-wallpaper-sampler',
    parallaxAcceptance: 'requires-real-windows-cursor-visual-check',
    parallaxReason: 'CDP or DOM mouse injection does not move the real Windows cursor and is not causal proof for Wallpaper Engine Scene parallax.',
    realWindowsCursorTouched: false,
    syntheticPointerRelayUsed: false,
    windowsBefore: {
      source: listExactSourceWindows(),
      dwm: listDwmSurfaceWindows(),
    },
    rounds: [],
  };
  let client = null;
  let snapshot = null;
  let testError = null;
  try {
    const target = await waitForCdpTarget();
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await client.evaluate(`(async () => {
      if (window.desktopWindow && typeof desktopWindow.restore === 'function') {
        if (typeof desktopWindow.minimize === 'function') {
          await desktopWindow.minimize();
          await new Promise((resolve) => setTimeout(resolve, 320));
        }
        await desktopWindow.restore();
        await new Promise((resolve) => setTimeout(resolve, 480));
      }
      return true;
    })()`, false);
    await client.call('Page.bringToFront');
    snapshot = await snapshotSelection(client);
    evidence.originalSelection = snapshot;
    // Persist the user's exact pre-test value before the first activation so a
    // forced QA interruption still leaves a byte-for-byte recovery record.
    fs.writeFileSync(resultPath, JSON.stringify(evidence, null, 2), 'utf8');
    const selected = await client.evaluate(`(async () => {
      await loadWallpaperEngineLibrary(true, false);
      const item = wallpaperEngineProjects.find((project) => project.enginePlayable
        && String(project.workshopId || '') === ${JSON.stringify(requestedWorkshopId)});
      if (!item) throw new Error('NO_NATIVE_SCENE_PROJECT');
      return { id: item.id, title: item.title, workshopId: item.workshopId };
    })()`, false);
    evidence.selected = selected;

    let previousSessionId = '';
    for (let index = 0; index < repeat; index += 1) {
      const round = index + 1;
      await client.call('Page.bringToFront');
      await client.evaluate(`activateWallpaperEngineItem(${JSON.stringify(selected.id)})`);
      await waitForState(client, `normal-user round ${round} base DWM surface`, (next) => (
        next.bodyActive && next.bodyDwmActive && !next.hasStream
        && /^[a-f0-9]{24}$/.test(next.sessionId)
        && next.sessionId !== previousSessionId
        && next.runtime && next.runtime.active
        && next.runtime.captureMode === 'dwm-thumbnail'
        && next.runtime.dwmSurfaceReady === true
        && next.runtime.dwmSurfaceActive === true
        && next.runtime.dwmGlassSurfaceReady === true
        && next.glassSampler && next.glassSampler.ready
        && next.glassSampler.hasStream && next.glassSampler.trackState === 'live'
      ));
      const glassSync = await showControlGlassAndSync(client);
      const state = await waitForState(client, `normal-user round ${round} SVG glass sampler`, (next) => (
        next.bodyActive && next.bodyDwmActive && next.controlGlass && next.controlGlass.active
        && next.runtime && next.runtime.dwmGlassSurfaceReady === true
        && next.runtime.dwmGlassSurfaceActive === true
        && next.runtime.dwmGlassSurfaceGeometry
        && next.glassSampler && next.glassSampler.ready && next.glassSampler.visible
        && next.glassSampler.hasStream && next.glassSampler.trackState === 'live'
      ), 20000);
      assertActiveState(state, previousSessionId, round);
      const nativeWindows = assertNativeWindows(state, round);
      await sleep(650);
      const finalState = await readState(client);
      assertActiveState(finalState, previousSessionId, round);
      assertControlGlassGeometry(finalState, listDwmSurfaceWindows(), round);
      evidence.rounds.push({
        round,
        sessionId: state.sessionId,
        nativeWindows,
        glassSync,
        state,
        finalState,
        parallaxVisualCheckRequired: true,
      });
      fs.writeFileSync(resultPath, JSON.stringify(evidence, null, 2), 'utf8');
      previousSessionId = state.sessionId;
    }

    evidence.uniqueSessions = [...new Set(evidence.rounds.map((entry) => entry.sessionId))];
    assert.strictEqual(evidence.uniqueSessions.length, repeat, 'Consecutive loads did not create unique sessions');
    evidence.ok = true;
  } catch (error) {
    testError = error;
    evidence.error = String(error && error.stack || error);
  } finally {
    if (client) await releaseControlGlassTestHold(client);
    if (client && snapshot) {
      try {
        evidence.restoredSelection = await restoreSelection(client, snapshot, !closeApp);
        assert.strictEqual(evidence.restoredSelection.raw, snapshot.raw,
          'Wallpaper Engine selection storage was not restored byte-for-byte');
      } catch (error) {
        evidence.restoreError = String(error && error.stack || error);
        if (!testError) testError = error;
      }
    }
    if (client && !client.closed) {
      try {
        evidence.windowsAfterTestStop = closeApp
          ? {
            source: await waitForExactSourceWindowCount(0),
            dwm: listDwmSurfaceWindows(),
          }
          : {
            source: listExactSourceWindows(),
            dwm: listDwmSurfaceWindows(),
          };
        if (closeApp) {
          await client.evaluate(`(() => { setTimeout(() => desktopWindow.close('exit'), 100); return true; })()`, false);
        }
      } catch (_) { }
      evidence.rendererConsole = client.consoleMessages.slice(-80);
      client.close();
    }
    if (testError) evidence.ok = false;
    evidence.finishedAt = new Date().toISOString();
    fs.writeFileSync(resultPath, JSON.stringify(evidence, null, 2), 'utf8');
  }

  if (testError) throw testError;
  console.log(JSON.stringify({
    ok: true,
    resultPath,
    selected: evidence.selected,
    sessions: evidence.uniqueSessions,
    compositionAcceptance: evidence.compositionAcceptance,
    parallaxAcceptance: evidence.parallaxAcceptance,
    realWindowsCursorTouched: evidence.realWindowsCursorTouched,
    syntheticPointerRelayUsed: evidence.syntheticPointerRelayUsed,
    restoredSelection: evidence.restoredSelection && evidence.restoredSelection.selection,
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
