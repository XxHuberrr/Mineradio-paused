#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { PNG } = require('pngjs');

const QA_PARENT = 'D:\\MineradioCache\\we-lifecycle-qa';
const DEFAULT_EXE = path.resolve(__dirname, '..', '..', '..', 'Mineradio.exe');
const workshopArgument = process.argv.find((value) => /^--workshop=\d+$/.test(value));
const executableArgument = process.argv.find((value) => /^--exe=.+/.test(value));
const requestedWorkshopId = workshopArgument ? workshopArgument.slice('--workshop='.length) : '';
const cursorUiQa = process.argv.includes('--cursor-ui-qa');
const productionThrottling = process.argv.includes('--production-throttling');
const cursorUiHoldArgument = process.argv.find((argument) => argument.startsWith('--cursor-ui-hold-ms='));
const cursorUiHoldMs = Math.max(0, Math.min(120000, Number(cursorUiHoldArgument?.split('=')[1]) || 15000));
const executablePath = executableArgument
  ? path.resolve(executableArgument.slice('--exe='.length))
  : DEFAULT_EXE;
const keepData = process.argv.includes('--keep-data');
const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${process.pid}-${Math.random().toString(16).slice(2, 10)}`;
const runtimeName = `Mineradio-WE-Lifecycle-QA-${runId}`;
const qaRoot = path.join(QA_PARENT, runId);
const appDataRoot = path.join(qaRoot, 'appdata');
const localAppDataRoot = path.join(qaRoot, 'localappdata');
const cacheRoot = path.join(qaRoot, 'cache');
const tempRoot = path.join(qaRoot, 'temp');
const linkedUserDataTarget = path.join(appDataRoot, runtimeName);
const systemAppDataRoot = path.resolve(process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming'));
const systemUserDataPath = path.join(systemAppDataRoot, runtimeName);
const resultPath = path.join(qaRoot, 'result.json');
const logPath = path.join(qaRoot, 'mineradio.log');

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function ensureQaDirectories() {
  for (const directory of [qaRoot, appDataRoot, localAppDataRoot, cacheRoot, tempRoot]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.mkdirSync(linkedUserDataTarget, { recursive: true });
  fs.writeFileSync(path.join(linkedUserDataTarget, 'cache-settings.json'), JSON.stringify({
    version: 1,
    rootPath: cacheRoot,
  }, null, 2), 'utf8');
  assert(path.dirname(systemUserDataPath) === systemAppDataRoot, 'System QA userData path escaped the appData root');
  assert(/^Mineradio-WE-Lifecycle-QA-[A-Za-z0-9-]+$/.test(path.basename(systemUserDataPath)), 'System QA userData name is not unique and safe');
  if (path.resolve(systemUserDataPath) !== path.resolve(linkedUserDataTarget)) {
    assert(!fs.existsSync(systemUserDataPath), `Unique QA system userData path unexpectedly exists: ${systemUserDataPath}`);
    fs.symlinkSync(linkedUserDataTarget, systemUserDataPath, 'junction');
  }
}

function removeSystemUserDataJunction() {
  if (path.resolve(systemUserDataPath) === path.resolve(linkedUserDataTarget)) return;
  assert(path.dirname(systemUserDataPath) === systemAppDataRoot, 'Refusing to remove a userData path outside the system appData root');
  assert(/^Mineradio-WE-Lifecycle-QA-[A-Za-z0-9-]+$/.test(path.basename(systemUserDataPath)), 'Refusing to remove a non-QA system userData path');
  let stat;
  try { stat = fs.lstatSync(systemUserDataPath); } catch (error) {
    if (error && error.code === 'ENOENT') return;
    throw error;
  }
  assert(stat.isSymbolicLink(), 'Refusing to remove a real system userData directory; expected the QA junction');
  fs.unlinkSync(systemUserDataPath);
}

function safelyRemoveQaDirectory(directory) {
  const resolvedParent = path.resolve(QA_PARENT);
  const resolvedRoot = path.resolve(qaRoot);
  const resolved = path.resolve(directory);
  const rootRelative = path.relative(resolvedParent, resolvedRoot);
  const relative = path.relative(resolvedRoot, resolved);
  assert(rootRelative && !rootRelative.startsWith('..') && !path.isAbsolute(rootRelative), 'QA root escaped the D-drive lifecycle parent');
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Refusing to remove a path outside the current QA root');
  fs.rmSync(resolved, { recursive: true, force: true });
}

function cleanupHeavyQaData() {
  if (keepData) return;
  for (const directory of [appDataRoot, localAppDataRoot, cacheRoot, tempRoot]) {
    safelyRemoveQaDirectory(directory);
  }
}

function powershellEncoded(script, extraEnv = {}, timeout = 15000) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    encoded,
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout,
    env: {
      ...process.env,
      TEMP: tempRoot,
      TMP: tempRoot,
      ...extraEnv,
    },
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout || 'PowerShell helper failed');
  return String(result.stdout || '').trim();
}

const WINDOW_NATIVE_SOURCE = String.raw`
$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class MineradioWeLifecycleWindows {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint attach, uint attachTo, bool value);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool PostMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
}
'@
`;

function exactWindowsByTitle(title) {
  const output = powershellEncoded(`${WINDOW_NATIVE_SOURCE}
$expected=[Environment]::GetEnvironmentVariable('MINERADIO_QA_WINDOW_TITLE')
$items=[Collections.Generic.List[object]]::new()
$callback=[MineradioWeLifecycleWindows+EnumWindowsProc]{
  param([IntPtr]$handle,[IntPtr]$state)
  $length=[MineradioWeLifecycleWindows]::GetWindowTextLength($handle)
  if ($length -gt 0) {
    $text=[Text.StringBuilder]::new($length+1)
    [void][MineradioWeLifecycleWindows]::GetWindowText($handle,$text,$text.Capacity)
    if ($text.ToString() -ceq $expected) {
      [uint32]$ownerPid=0
      [void][MineradioWeLifecycleWindows]::GetWindowThreadProcessId($handle,[ref]$ownerPid)
      $items.Add([pscustomobject]@{
        handle=$handle.ToInt64().ToString()
        pid=[int]$ownerPid
        visible=[MineradioWeLifecycleWindows]::IsWindowVisible($handle)
        title=$text.ToString()
      })
    }
  }
  return $true
}
[void][MineradioWeLifecycleWindows]::EnumWindows($callback,[IntPtr]::Zero)
ConvertTo-Json -Compress -InputObject @($items)
`, { MINERADIO_QA_WINDOW_TITLE: String(title || '') });
  if (!output) return [];
  const value = JSON.parse(output.split(/\r?\n/).filter(Boolean).slice(-1)[0]);
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function topLevelWindowsByPid(processId) {
  const output = powershellEncoded(`${WINDOW_NATIVE_SOURCE}
$expected=[uint32][Environment]::GetEnvironmentVariable('MINERADIO_QA_PROCESS_ID')
$items=[Collections.Generic.List[object]]::new()
$callback=[MineradioWeLifecycleWindows+EnumWindowsProc]{
  param([IntPtr]$handle,[IntPtr]$state)
  [uint32]$ownerPid=0
  [void][MineradioWeLifecycleWindows]::GetWindowThreadProcessId($handle,[ref]$ownerPid)
  if ($ownerPid -eq $expected) {
    $length=[MineradioWeLifecycleWindows]::GetWindowTextLength($handle)
    $text=[Text.StringBuilder]::new([Math]::Max(1,$length+1))
    if ($length -gt 0) { [void][MineradioWeLifecycleWindows]::GetWindowText($handle,$text,$text.Capacity) }
    $items.Add([pscustomobject]@{
      handle=$handle.ToInt64().ToString()
      pid=[int]$ownerPid
      visible=[MineradioWeLifecycleWindows]::IsWindowVisible($handle)
      title=$text.ToString()
    })
  }
  return $true
}
[void][MineradioWeLifecycleWindows]::EnumWindows($callback,[IntPtr]::Zero)
ConvertTo-Json -Compress -InputObject @($items)
`, { MINERADIO_QA_PROCESS_ID: String(processId || 0) });
  if (!output) return [];
  const value = JSON.parse(output.split(/\r?\n/).filter(Boolean).slice(-1)[0]);
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function windowHandleExists(handle) {
  const output = powershellEncoded(`${WINDOW_NATIVE_SOURCE}
$handle=[IntPtr]::new([long][Environment]::GetEnvironmentVariable('MINERADIO_QA_HOST_HANDLE'))
if ([MineradioWeLifecycleWindows]::IsWindow($handle)) { '1' } else { '0' }
`, { MINERADIO_QA_HOST_HANDLE: String(handle || '') });
  return output.split(/\r?\n/).filter(Boolean).slice(-1)[0] === '1';
}

function restoreExactHostWindow(handle) {
  powershellEncoded(`${WINDOW_NATIVE_SOURCE}
$handle=[IntPtr]::new([long][Environment]::GetEnvironmentVariable('MINERADIO_QA_HOST_HANDLE'))
if (-not [MineradioWeLifecycleWindows]::IsWindow($handle)) { throw 'QA host window no longer exists' }
$foreground=[MineradioWeLifecycleWindows]::GetForegroundWindow()
[uint32]$foregroundPid=0
$foregroundThread=if ($foreground -ne [IntPtr]::Zero) { [MineradioWeLifecycleWindows]::GetWindowThreadProcessId($foreground,[ref]$foregroundPid) } else { 0 }
$currentThread=[MineradioWeLifecycleWindows]::GetCurrentThreadId()
$attached=$false
if ($foregroundThread -gt 0 -and $foregroundThread -ne $currentThread) {
  $attached=[MineradioWeLifecycleWindows]::AttachThreadInput($currentThread,$foregroundThread,$true)
}
try {
  [void][MineradioWeLifecycleWindows]::ShowWindowAsync($handle,9)
  [void][MineradioWeLifecycleWindows]::SetWindowPos($handle,[IntPtr]::new(-1),0,0,0,0,0x43)
  [void][MineradioWeLifecycleWindows]::BringWindowToTop($handle)
  [void][MineradioWeLifecycleWindows]::SetForegroundWindow($handle)
  [void][MineradioWeLifecycleWindows]::SetWindowPos($handle,[IntPtr]::new(-2),0,0,0,0,0x43)
  Start-Sleep -Milliseconds 120
} finally {
  if ($attached) { [void][MineradioWeLifecycleWindows]::AttachThreadInput($currentThread,$foregroundThread,$false) }
}
`, { MINERADIO_QA_HOST_HANDLE: String(handle || '') });
}

function closeExactQaWindow(title) {
  if (!title) return;
  powershellEncoded(`${WINDOW_NATIVE_SOURCE}
$expected=[Environment]::GetEnvironmentVariable('MINERADIO_QA_WINDOW_TITLE')
$callback=[MineradioWeLifecycleWindows+EnumWindowsProc]{
  param([IntPtr]$handle,[IntPtr]$state)
  $length=[MineradioWeLifecycleWindows]::GetWindowTextLength($handle)
  if ($length -gt 0) {
    $text=[Text.StringBuilder]::new($length+1)
    [void][MineradioWeLifecycleWindows]::GetWindowText($handle,$text,$text.Capacity)
    if ($text.ToString() -ceq $expected) {
      [void][MineradioWeLifecycleWindows]::PostMessage($handle,0x0010,[IntPtr]::Zero,[IntPtr]::Zero)
    }
  }
  return $true
}
[void][MineradioWeLifecycleWindows]::EnumWindows($callback,[IntPtr]::Zero)
`, { MINERADIO_QA_WINDOW_TITLE: String(title) });
}

function listWallpaperEngineProcesses() {
  const output = powershellEncoded(`
$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$items=Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^wallpaper(?:32|64)\\.exe$' } | ForEach-Object {
  [pscustomobject]@{ pid=[int]$_.ProcessId; name=$_.Name; parentPid=[int]$_.ParentProcessId }
}
ConvertTo-Json -Compress -InputObject @($items)
`);
  if (!output) return [];
  const value = JSON.parse(output.split(/\r?\n/).filter(Boolean).slice(-1)[0]);
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

async function findFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  assert(Number.isInteger(port) && port > 0, 'Could not reserve a CDP port');
  return port;
}

async function waitForCdpTarget(port, child, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Mineradio exited before CDP became ready (${child.exitCode})`);
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
  throw new Error(`Timed out waiting for Mineradio CDP: ${lastError && lastError.message || 'no page target'}`);
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
          args: [message.params && message.params.exceptionDetails && (message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)],
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
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Renderer evaluation failed');
    }
    return response.result?.value;
  }

  close() {
    if (!this.closed) this.socket.close();
  }
}

const STATE_EXPRESSION = `(async () => {
  const api = wallpaperEngineDesktopApi();
  const runtime = api && typeof api.getWallpaperEngineRuntimeStatus === 'function'
    ? await api.getWallpaperEngineRuntimeStatus({})
    : null;
  const video = document.getElementById('wallpaper-engine-video');
  const layer = document.getElementById('wallpaper-engine-layer');
  const freeze = document.getElementById('wallpaper-engine-freeze');
  const stream = video && video.srcObject;
  const videoTrack = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
  let videoTrackSettings = null;
  try {
    const settings = videoTrack && typeof videoTrack.getSettings === 'function' ? videoTrack.getSettings() : null;
    if (settings && typeof settings === 'object') {
      videoTrackSettings = {
        width: Number(settings.width) || 0,
        height: Number(settings.height) || 0,
        frameRate: Number(settings.frameRate) || 0,
        displaySurface: typeof settings.displaySurface === 'string' ? settings.displaySurface : '',
        cursor: typeof settings.cursor === 'string' ? settings.cursor : '',
        resizeMode: typeof settings.resizeMode === 'string' ? settings.resizeMode : '',
      };
    }
  } catch (_) { }
  const rectOf = (node) => {
    if (!node || typeof node.getBoundingClientRect !== 'function') return null;
    const rect = node.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
  };
  return {
    documentHidden: document.hidden,
    selectionActive: !!wallpaperEngineSelection.active,
    kind: String(wallpaperEngineSelection.kind || ''),
    selectionId: String(wallpaperEngineSelection.id || ''),
    sessionId: String(wallpaperEngineNativeSessionId || ''),
    hostPreparing: !!wallpaperEngineHostBoundsPreparing,
    bodyActive: document.body.classList.contains('wallpaper-engine-active'),
    runtimeError: String(wallpaperEngineRuntimeError || ''),
    hasStream: !!stream,
    videoWidth: Number(video && video.videoWidth) || 0,
    videoHeight: Number(video && video.videoHeight) || 0,
    videoTrackState: String(videoTrack && videoTrack.readyState || ''),
    videoTrackSettings,
    capturePath: stream && typeof stream.__mineradioCapturePath === 'string'
      ? stream.__mineradioCapturePath
      : '',
    cursorSuppressed: stream && typeof stream.__mineradioCursorSuppressed === 'boolean'
      ? stream.__mineradioCursorSuppressed
      : null,
    audioTrackCount: stream && stream.getAudioTracks ? stream.getAudioTracks().length : -1,
    innerWidth: Number(window.innerWidth) || 0,
    innerHeight: Number(window.innerHeight) || 0,
    devicePixelRatio: Number(window.devicePixelRatio) || 1,
    captureScaleX: Number(layer && layer.dataset.captureScaleX) || 1,
    captureScaleY: Number(layer && layer.dataset.captureScaleY) || 1,
    layerClassName: String(layer && layer.className || ''),
    freezeReady: !!(layer && layer.classList.contains('freeze-ready')),
    freezeOpacity: freeze ? String(getComputedStyle(freeze).opacity || '') : '',
    freezeVisibility: freeze ? String(getComputedStyle(freeze).visibility || '') : '',
    cursorProxyPresent: !!document.getElementById('wallpaper-engine-cursor-proxy'),
    cursorProxyActive: document.body.classList.contains('wallpaper-engine-cursor-proxy-active'),
    rects: {
      html: rectOf(document.documentElement),
      body: rectOf(document.body),
      layer: rectOf(layer),
      video: rectOf(video),
      freeze: rectOf(freeze),
    },
    runtime,
  };
})()`;

async function readState(client) {
  return client.evaluate(STATE_EXPRESSION, false);
}

async function waitForState(client, label, predicate, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await readState(client);
    if (predicate(last)) {
      // A MediaStream can be attached a few paints before loadedmetadata makes
      // the physical video dimensions observable. Do not let an active phase
      // pass in that half-ready interval; suspended phases have no stream and
      // are intentionally unaffected.
      if (last.hasStream && last.runtime && last.runtime.active && last.runtime.sourceWindowParked !== true) {
        await sleep(80);
        continue;
      }
      if (!last.hasStream || (last.videoWidth > 0 && last.videoHeight > 0 && last.videoTrackState === 'live')) return last;
    }
    await sleep(220);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

function approximatelyEqual(actual, expected, tolerance, label) {
  assert(
    Number.isFinite(Number(actual)) && Math.abs(Number(actual) - Number(expected)) <= tolerance,
    `${label}: ${actual} vs ${expected} (tolerance ${tolerance})`
  );
}

function physicalSceneSummary(state) {
  const runtime = state && state.runtime || {};
  const hostRect = runtime.hostWindowRect || {};
  const sourceRect = runtime.sourceWindowRect || {};
  const parkingRect = runtime.sourceWindowParkingRect || {};
  return {
    cssViewport: {
      width: Number(state && state.innerWidth) || 0,
      height: Number(state && state.innerHeight) || 0,
    },
    devicePixelRatio: Number(state && state.devicePixelRatio) || 1,
    expectedPhysical: {
      width: Math.max(1, Math.round((Number(state && state.innerWidth) || 0) * (Number(state && state.devicePixelRatio) || 1))),
      height: Math.max(1, Math.round((Number(state && state.innerHeight) || 0) * (Number(state && state.devicePixelRatio) || 1))),
    },
    runtime: {
      width: Number(runtime.width) || 0,
      height: Number(runtime.height) || 0,
    },
    video: {
      width: Number(state && state.videoWidth) || 0,
      height: Number(state && state.videoHeight) || 0,
    },
    host: {
      left: Number(hostRect.left) || 0,
      top: Number(hostRect.top) || 0,
      right: Number(hostRect.right) || 0,
      bottom: Number(hostRect.bottom) || 0,
      width: Math.max(0, (Number(hostRect.right) || 0) - (Number(hostRect.left) || 0)),
      height: Math.max(0, (Number(hostRect.bottom) || 0) - (Number(hostRect.top) || 0)),
    },
    source: {
      left: Number(sourceRect.left) || 0,
      top: Number(sourceRect.top) || 0,
      right: Number(sourceRect.right) || 0,
      bottom: Number(sourceRect.bottom) || 0,
      width: Math.max(0, (Number(sourceRect.right) || 0) - (Number(sourceRect.left) || 0)),
      height: Math.max(0, (Number(sourceRect.bottom) || 0) - (Number(sourceRect.top) || 0)),
    },
    parking: {
      left: Number(parkingRect.left) || 0,
      top: Number(parkingRect.top) || 0,
      right: Number(parkingRect.right) || 0,
      bottom: Number(parkingRect.bottom) || 0,
      visibleWidth: Math.max(0, Number(parkingRect.visibleWidth) || 0),
      visibleHeight: Math.max(0, Number(parkingRect.visibleHeight) || 0),
    },
    rounded: runtime.sourceWindowRounded === true,
    captureScale: {
      x: Number(state && state.captureScaleX) || 1,
      y: Number(state && state.captureScaleY) || 1,
    },
  };
}

function assertActiveState(state, previousSessionId = '', options = {}) {
  const phase = String(options.phase || 'active');
  assert(state && state.selectionActive, 'Wallpaper Engine selection was not preserved');
  assert.strictEqual(state.kind, 'engine', state.runtimeError || 'Wallpaper Engine selection is not native engine mode');
  assert.strictEqual(state.bodyActive, true, state.runtimeError || 'Wallpaper Engine layer is not active');
  assert.strictEqual(state.hasStream, true, 'Wallpaper Engine capture stream is missing');
  assert.strictEqual(state.videoTrackState, 'live', 'Wallpaper Engine capture track is not live');
  assert.strictEqual(state.audioTrackCount, 0, 'Wallpaper Engine capture contains an audio track');
  assert.strictEqual(state.capturePath, 'display-media', 'Wallpaper Engine did not use the exact display-capture path');
  assert(/^[a-f0-9]{24}$/.test(state.sessionId), 'Wallpaper Engine session id is missing');
  if (previousSessionId) assert.notStrictEqual(state.sessionId, previousSessionId, 'Visible host did not create a new Wallpaper Engine session');
  assert(state.runtime && state.runtime.active === true, 'Wallpaper Engine runtime is not active');
  assert.strictEqual(state.runtime.sessionId, state.sessionId, 'Renderer and main-process session ids differ');
  assert.strictEqual(state.runtime.sourceWindowAligned, true, 'Wallpaper Engine source is not pixel-aligned');
  assert.strictEqual(state.runtime.sourceWindowParked, true, 'Wallpaper Engine source was not parked after capture attachment');
  assert.strictEqual(state.runtime.parallaxPointerRelayReady, true, `${phase} native parallax pointer relay is not ready`);
  assert.strictEqual(state.runtime.parallaxPointerRelayActive, true, `${phase} native parallax pointer relay is not active`);
  assert(Number(state.runtime.parallaxPointerRelayHelperPid) > 0, `${phase} native parallax pointer relay helper pid is missing`);
  for (const field of ['parallaxPointerRelayQueued', 'parallaxPointerRelayCoalesced', 'parallaxPointerRelayPosted']) {
    assert(Number.isFinite(Number(state.runtime[field])) && Number(state.runtime[field]) >= 0,
      `${phase} ${field} telemetry is invalid`);
  }
  assert(state.cursorSuppressed === true || state.runtime.sourceWindowParked === true,
    'Wallpaper Engine has no verified cursor suppression or isolated source parking');
  assert.strictEqual(state.runtime.audioMuted, true, 'Wallpaper Engine source mute properties are not active');
  assert(state.videoWidth > 0 && state.videoHeight > 0, 'Wallpaper Engine video dimensions are empty');
  assert(state.runtime.hostWindowRect, 'Wallpaper Engine host bounds are unavailable');
  assert(state.runtime.sourceWindowRect, 'Wallpaper Engine source bounds are unavailable');
  const physical = physicalSceneSummary(state);
  const hostWidth = Math.max(1, physical.host.width);
  const hostHeight = Math.max(1, physical.host.height);
  approximatelyEqual(hostWidth, physical.expectedPhysical.width, 2, `${phase} host physical width is not innerWidth * DPR`);
  approximatelyEqual(hostHeight, physical.expectedPhysical.height, 2, `${phase} host physical height is not innerHeight * DPR`);
  approximatelyEqual(state.runtime.width, physical.expectedPhysical.width, 2, `${phase} runtime width is not physical`);
  approximatelyEqual(state.runtime.height, physical.expectedPhysical.height, 2, `${phase} runtime height is not physical`);
  approximatelyEqual(state.videoWidth, physical.expectedPhysical.width, 2, `${phase} capture video width is not physical`);
  approximatelyEqual(state.videoHeight, physical.expectedPhysical.height, 2, `${phase} capture video height is not physical`);
  approximatelyEqual(physical.source.width, physical.expectedPhysical.width, 2, `${phase} source window width is not physical`);
  approximatelyEqual(physical.source.height, physical.expectedPhysical.height, 2, `${phase} source window height is not physical`);
  approximatelyEqual(physical.source.left, physical.host.left, 2, `${phase} source left edge is not host-aligned`);
  approximatelyEqual(physical.source.top, physical.host.top, 2, `${phase} source top edge is not host-aligned`);
  approximatelyEqual(physical.source.right, physical.host.right, 2, `${phase} source right edge is not host-aligned`);
  approximatelyEqual(physical.source.bottom, physical.host.bottom, 2, `${phase} source bottom edge is not host-aligned`);
  assert(physical.parking.visibleWidth <= 1 && physical.parking.visibleHeight <= 1,
    `${phase} parked source is still exposed inside the interactive screen (${physical.parking.visibleWidth}x${physical.parking.visibleHeight})`);
  if (typeof options.rounded === 'boolean') {
    assert.strictEqual(
      state.runtime.sourceWindowRounded,
      options.rounded,
      `${phase} source window rounded state must be ${options.rounded}`
    );
  }
  const expectedScaleX = state.videoWidth / hostWidth;
  const expectedScaleY = state.videoHeight / hostHeight;
  const calibratedScaleX = expectedScaleX > 1.015 ? expectedScaleX : 1;
  const calibratedScaleY = expectedScaleY > 1.015 ? expectedScaleY : 1;
  assert(Math.abs(state.captureScaleX - calibratedScaleX) <= 0.035, `Wallpaper Engine horizontal DPI crop is stale: ${state.captureScaleX} vs ${calibratedScaleX}`);
  assert(Math.abs(state.captureScaleY - calibratedScaleY) <= 0.035, `Wallpaper Engine vertical DPI crop is stale: ${state.captureScaleY} vs ${calibratedScaleY}`);
  assert.strictEqual(state.cursorProxyPresent, false, 'Wallpaper Engine DOM cursor proxy must not exist');
  assert.strictEqual(state.cursorProxyActive, false, 'Wallpaper Engine DOM cursor proxy must stay disabled');
  assert.strictEqual(state.freezeReady, false, `${phase} freeze canvas is covering the live Wallpaper Engine video`);
  return state;
}

function assertSuspendedState(state) {
  assert(state && state.selectionActive, 'Hidden lifecycle must preserve the Wallpaper Engine selection');
  assert.strictEqual(state.kind, 'engine');
  assert.strictEqual(state.hasStream, false, 'Hidden lifecycle retained a capture stream');
  assert.strictEqual(state.sessionId, '', 'Hidden lifecycle retained a renderer session id');
  assert(!state.runtime || state.runtime.active === false, 'Hidden lifecycle retained an active native runtime');
  assert(!state.runtime || !state.runtime.sessionId, 'Hidden lifecycle retained a native runtime session id');
  assert(!state.runtime || state.runtime.parallaxPointerRelayReady !== true, 'Hidden lifecycle retained a ready parallax pointer relay');
  assert(!state.runtime || state.runtime.parallaxPointerRelayActive !== true, 'Hidden lifecycle retained an active parallax pointer relay');
  assert(!state.runtime || !(Number(state.runtime.parallaxPointerRelayHelperPid) > 0), 'Hidden lifecycle retained a parallax pointer relay helper pid');
}

async function sampleFrames(client, durationMs = 1300) {
  return client.evaluate(`(async () => {
    const video = document.getElementById('wallpaper-engine-video');
    if (!video || !video.srcObject || typeof video.requestVideoFrameCallback !== 'function') return { frames: 0 };
    let frames = 0;
    let active = true;
    const count = () => {
      if (!active) return;
      frames += 1;
      if (frames < 180 && video.srcObject) video.requestVideoFrameCallback(count);
    };
    video.requestVideoFrameCallback(count);
    await new Promise((resolve) => setTimeout(resolve, ${Math.max(500, Math.min(5000, Number(durationMs) || 1300))}));
    active = false;
    return { frames, currentTime: Number(video.currentTime) || 0 };
  })()`, false);
}

async function captureWallpaperEngineEmbeddedFrame(client, outputPath) {
  const dataUrl = await client.evaluate(`(() => {
    const video = document.getElementById('wallpaper-engine-video');
    if (!video || !video.videoWidth || !video.videoHeight) return '';
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return '';
    context.drawImage(video, 0, 0);
    return canvas.toDataURL('image/png');
  })()`, false);
  assert(/^data:image\/png;base64,/.test(dataUrl), 'Embedded Wallpaper Engine video frame could not be captured');
  fs.writeFileSync(outputPath, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  return outputPath;
}

function compareEmbeddedPngFrames(leftPath, rightPath) {
  const left = PNG.sync.read(fs.readFileSync(leftPath));
  const right = PNG.sync.read(fs.readFileSync(rightPath));
  assert.strictEqual(left.width, right.width, 'Parallax endpoint frame widths differ');
  assert.strictEqual(left.height, right.height, 'Parallax endpoint frame heights differ');
  const pixels = Math.max(1, left.width * left.height);
  let absoluteRgbDifference = 0;
  let changedPixelsAt12 = 0;
  for (let offset = 0; offset < left.data.length; offset += 4) {
    const red = Math.abs(left.data[offset] - right.data[offset]);
    const green = Math.abs(left.data[offset + 1] - right.data[offset + 1]);
    const blue = Math.abs(left.data[offset + 2] - right.data[offset + 2]);
    absoluteRgbDifference += red + green + blue;
    if (Math.max(red, green, blue) >= 12) changedPixelsAt12 += 1;
  }
  return {
    width: left.width,
    height: left.height,
    meanAbsoluteRgb: absoluteRgbDifference / (pixels * 3),
    changedPixelRatioAt12: changedPixelsAt12 / pixels,
  };
}

async function dispatchRendererMouseMove(client, state, ratioX, ratioY) {
  const width = Math.max(1, Number(state && state.innerWidth) || 1);
  const height = Math.max(1, Number(state && state.innerHeight) || 1);
  const clientX = Math.max(0, Math.min(width - 1, (width - 1) * ratioX));
  const clientY = Math.max(0, Math.min(height - 1, (height - 1) * ratioY));
  await client.call('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: clientX,
    y: clientY,
    button: 'none',
    buttons: 0,
    pointerType: 'mouse',
  });
}

async function dispatchHostPointerAndWaitForRelay(client, state, ratioX, ratioY, label) {
  const runtime = state && state.runtime || {};
  const sessionId = String(state && state.sessionId || '');
  const postedBefore = Math.max(0, Number(runtime.parallaxPointerRelayPosted) || 0);
  const expectedXUnit = Math.round(Math.max(0, Math.min(1, ratioX)) * 65535);
  const expectedYUnit = Math.round(Math.max(0, Math.min(1, ratioY)) * 65535);
  await dispatchRendererMouseMove(client, state, ratioX, ratioY);
  const relayed = await waitForState(client, `${label} pointer relay`, (next) => (
    next && next.sessionId === sessionId
    && next.runtime && next.runtime.active === true
    && next.runtime.parallaxPointerRelayReady === true
    && next.runtime.parallaxPointerRelayActive === true
    && Number(next.runtime.parallaxPointerRelayPosted) > postedBefore
    && Math.abs(Number(next.runtime.parallaxPointerRelayLatestX) - expectedXUnit) <= 128
    && Math.abs(Number(next.runtime.parallaxPointerRelayLatestY) - expectedYUnit) <= 128
  ), 8000);
  await sleep(500);
  const settled = await readState(client);
  assert.strictEqual(settled.sessionId, sessionId, `${label} changed Wallpaper Engine session while checking parallax`);
  return {
    input: { ok: true, method: 'cdp-dom-mousemove', ratioX, ratioY, expectedXUnit, expectedYUnit },
    postedBefore,
    postedAfter: Math.max(Number(relayed.runtime.parallaxPointerRelayPosted) || 0, Number(settled.runtime && settled.runtime.parallaxPointerRelayPosted) || 0),
    queuedAfter: Math.max(0, Number(settled.runtime && settled.runtime.parallaxPointerRelayQueued) || 0),
    coalescedAfter: Math.max(0, Number(settled.runtime && settled.runtime.parallaxPointerRelayCoalesced) || 0),
    state: settled,
  };
}

async function waitForExactWindowCount(title, expected, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let windows = [];
  while (Date.now() < deadline) {
    windows = exactWindowsByTitle(title);
    if (windows.length === expected) return windows;
    await sleep(250);
  }
  throw new Error(`Exact QA window count for ${title} stayed ${windows.length}, expected ${expected}`);
}

async function waitForHostWindow(processId, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let windows = [];
  while (Date.now() < deadline) {
    windows = topLevelWindowsByPid(processId);
    const visible = windows.find((item) => item.visible && /^\d+$/.test(String(item.handle || '')));
    if (visible) return visible;
    await sleep(250);
  }
  throw new Error(`QA Mineradio host window was not found for PID ${processId}: ${JSON.stringify(windows)}`);
}

async function waitForProcessExit(child, timeoutMs = 20000) {
  if (child.exitCode != null) return { code: child.exitCode, signal: child.signalCode || '' };
  return Promise.race([
    new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal: signal || '' }))),
    sleep(timeoutMs).then(() => null),
  ]);
}

async function main() {
  assert(process.platform === 'win32', 'Wallpaper Engine lifecycle QA is Windows-only');
  assert(fs.existsSync(executablePath), `Mineradio executable not found: ${executablePath}`);
  assert(path.parse(qaRoot).root.toUpperCase() === 'D:\\', 'Lifecycle QA data must stay on D:');
  ensureQaDirectories();

  const port = await findFreePort();
  const knownSessionTitles = new Set();
  const evidence = {
    ok: false,
    runId,
    runtimeName,
    qaRoot,
    executablePath,
    requestedWorkshopId,
    productionThrottling,
    cdpPort: port,
    startedAt: new Date().toISOString(),
    wallpaperProcessesBefore: listWallpaperEngineProcesses(),
    phases: {},
  };
  let child = null;
  let client = null;
  let hostHandle = '';
  let cleanExit = false;
  let logStream = null;

  try {
    logStream = fs.createWriteStream(logPath, { flags: 'a' });
    const env = {
      ...process.env,
      APPDATA: appDataRoot,
      LOCALAPPDATA: localAppDataRoot,
      TEMP: tempRoot,
      TMP: tempRoot,
      MINERADIO_RUNTIME_NAME: runtimeName,
      MINERADIO_APP_USER_MODEL_ID: `com.mineradio.we-lifecycle-qa.${runId}`,
      MINERADIO_NO_DESKTOP_SHORTCUT: '1',
      MINERADIO_CREATE_DESKTOP_SHORTCUT: '0',
      ...(productionThrottling ? {} : { MINERADIO_KEEP_BACKGROUND_RENDERING: '1' }),
    };
    child = spawn(executablePath, [`--remote-debugging-port=${port}`], {
      cwd: path.dirname(executablePath),
      env,
      windowsHide: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => logStream.write(chunk));
    child.stderr.on('data', (chunk) => logStream.write(chunk));
    evidence.hostPid = child.pid;

    const target = await waitForCdpTarget(port, child);
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await client.call('Page.enable');
    await client.call('Page.bringToFront');
    const hostWindow = await waitForHostWindow(child.pid, 15000);
    hostHandle = String(hostWindow.handle || '');
    assert(/^\d+$/.test(hostHandle), 'Could not identify the exact QA host HWND');
    evidence.hostWindow = hostWindow;
    await client.evaluate(`desktopWindow.restore()`, false);
    let visibleBeforeActivation = null;
    for (let focusAttempt = 0; focusAttempt < 4; focusAttempt += 1) {
      restoreExactHostWindow(hostHandle);
      await client.call('Page.bringToFront');
      await sleep(220);
      visibleBeforeActivation = await readState(client);
      if (!visibleBeforeActivation.documentHidden) break;
    }
    assert(visibleBeforeActivation && !visibleBeforeActivation.documentHidden,
      'QA host stayed document-hidden after native foreground recovery');
    evidence.phases.visibleBeforeActivation = { state: visibleBeforeActivation };
    const cacheSnapshot = await client.evaluate(`desktopWindow.getCacheSettings()`, false);
    const actualUserDataPath = String(cacheSnapshot && cacheSnapshot.settings && cacheSnapshot.settings.userDataPath || '');
    const actualSessionDataPath = String(cacheSnapshot && cacheSnapshot.settings && cacheSnapshot.settings.activeChromiumPath || '');
    const actualNativePath = String(cacheSnapshot && cacheSnapshot.settings && cacheSnapshot.settings.activeNativePath || '');
    const actualWallpaperCachePath = String(cacheSnapshot && cacheSnapshot.settings && cacheSnapshot.settings.activeWallpaperEnginePath || '');
    assert(actualUserDataPath && fs.existsSync(actualUserDataPath), 'QA userData path was not reported by Mineradio');
    assert.strictEqual(path.resolve(fs.realpathSync(actualUserDataPath)), path.resolve(fs.realpathSync(linkedUserDataTarget)), 'QA userData is not physically redirected to D:');
    assert(path.resolve(actualSessionDataPath).startsWith(path.resolve(cacheRoot) + path.sep), 'QA Chromium session data is not isolated under the D-drive run root');
    assert(path.resolve(actualNativePath).startsWith(path.resolve(cacheRoot) + path.sep), 'QA WE/native cache is not isolated under the configured D-drive run root');
    assert(path.resolve(actualWallpaperCachePath).startsWith(path.resolve(actualNativePath) + path.sep), 'QA WE muted package cache is not nested under the configured native cache path');
    evidence.paths = {
      reportedUserDataPath: actualUserDataPath,
      resolvedUserDataPath: fs.realpathSync(actualUserDataPath),
      reportedSessionDataPath: actualSessionDataPath,
      reportedNativePath: actualNativePath,
      reportedWallpaperCachePath: actualWallpaperCachePath,
      cacheRoot,
      systemJunctionPath: systemUserDataPath,
    };

    const selected = await client.evaluate(`(async () => {
      await loadWallpaperEngineLibrary(true, false);
      const requestedWorkshopId = ${JSON.stringify(requestedWorkshopId)};
      const item = requestedWorkshopId
        ? wallpaperEngineProjects.find((project) => project.enginePlayable && String(project.workshopId || '') === requestedWorkshopId)
        : wallpaperEngineProjects.find((project) => project.enginePlayable);
      if (!item) throw new Error('NO_NATIVE_SCENE_PROJECT');
      activateWallpaperEngineItem(item.id);
      return { id: item.id, title: item.title, workshopId: item.workshopId };
    })()`);
    evidence.selected = selected;

    const initial = assertActiveState(await waitForState(client, 'initial native scene', (state) => (
      state.bodyActive && state.hasStream && /^[a-f0-9]{24}$/.test(state.sessionId)
      && state.runtime && state.runtime.active && state.runtime.sourceWindowAligned
      && state.runtime.parallaxPointerRelayReady && state.runtime.parallaxPointerRelayActive
    ), 70000), '', { phase: 'initial windowed', rounded: true });
    const initialPhysical = physicalSceneSummary(initial);
    const initialTitle = `Mineradio Wallpaper ${initial.sessionId}`;
    knownSessionTitles.add(initialTitle);
    const initialWindows = await waitForExactWindowCount(initialTitle, 1);
    const initialFrames = await sampleFrames(client);
    assert(initialFrames.frames >= 2, `Initial Scene did not advance frames (${initialFrames.frames})`);
    const leftPointerEmbeddedFramePath = path.join(qaRoot, 'parallax-pointer-left-embedded-frame.png');
    const rightPointerEmbeddedFramePath = path.join(qaRoot, 'parallax-pointer-right-embedded-frame.png');
    const pointerParallaxEvidence = {
      realWindowsCursorTouched: false,
      left: null,
      right: null,
      leftEmbeddedFramePath: leftPointerEmbeddedFramePath,
      rightEmbeddedFramePath: rightPointerEmbeddedFramePath,
    };
    // Exercise the production DOM mousemove listener through CDP input. CDP
    // does not move, hide or replace the user's real Windows cursor.
    restoreExactHostWindow(hostHandle);
    await client.call('Page.bringToFront');
    pointerParallaxEvidence.left = await dispatchHostPointerAndWaitForRelay(client, initial, 0.10, 0.50, 'left parallax endpoint');
    await captureWallpaperEngineEmbeddedFrame(client, leftPointerEmbeddedFramePath);
    pointerParallaxEvidence.right = await dispatchHostPointerAndWaitForRelay(
      client,
      pointerParallaxEvidence.left.state,
      0.90,
      0.50,
      'right parallax endpoint'
    );
    await captureWallpaperEngineEmbeddedFrame(client, rightPointerEmbeddedFramePath);
    pointerParallaxEvidence.embeddedDifference = compareEmbeddedPngFrames(
      leftPointerEmbeddedFramePath,
      rightPointerEmbeddedFramePath
    );
    assert(pointerParallaxEvidence.embeddedDifference.meanAbsoluteRgb >= 2,
      `Embedded Wallpaper Engine parallax movement is too small (MAE ${pointerParallaxEvidence.embeddedDifference.meanAbsoluteRgb.toFixed(3)})`);
    assert(pointerParallaxEvidence.embeddedDifference.changedPixelRatioAt12 >= 0.03,
      `Embedded Wallpaper Engine parallax changed too few pixels (${(pointerParallaxEvidence.embeddedDifference.changedPixelRatioAt12 * 100).toFixed(3)}%)`);
    if (cursorUiQa) {
      process.stdout.write(`${JSON.stringify({
        event: 'cursor-ui-qa-ready',
        holdMs: cursorUiHoldMs,
        hostWindow: evidence.hostWindow,
        wallpaperWindow: initialWindows[0] || null,
        leftEmbeddedFramePath: leftPointerEmbeddedFramePath,
        rightEmbeddedFramePath: rightPointerEmbeddedFramePath,
      })}\n`);
      await sleep(cursorUiHoldMs);
    }
    evidence.phases.pointerParallax = pointerParallaxEvidence;
    const cursorMoveRequested = !!(pointerParallaxEvidence.left && pointerParallaxEvidence.left.input.ok
      && pointerParallaxEvidence.right && pointerParallaxEvidence.right.input.ok);
    await sleep(450);
    const initialScreenshotPath = path.join(qaRoot, 'initial-active.png');
    const initialScreenshot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(initialScreenshotPath, Buffer.from(initialScreenshot.data, 'base64'));
    const embeddedFramePath = path.join(qaRoot, 'initial-embedded-frame.png');
    await captureWallpaperEngineEmbeddedFrame(client, embeddedFramePath);
    evidence.phases.initial = {
      state: initial,
      physical: initialPhysical,
      exactWindows: initialWindows,
      frames: initialFrames,
      cursorMoveRequested,
      pointerParallax: pointerParallaxEvidence,
      screenshotPath: initialScreenshotPath,
      embeddedFramePath,
    };

    // The lifecycle test is driven from Codex/PowerShell, so another desktop
    // window can legitimately steal focus while the initial source is sampled.
    // Capture preparation requires a fully visible Chromium document. Restore
    // the exact QA HWND before exercising the synthetic stop-all/start race;
    // otherwise the test measures its own background focus, not app behavior.
    restoreExactHostWindow(hostHandle);
    await client.call('Page.bringToFront');
    const visibleBeforeStopAll = await waitForState(client, 'visible host before stop-all restart', (state) => !state.documentHidden, 10000);
    evidence.phases.visibleBeforeStopAll = { state: visibleBeforeStopAll };

    const stopAllImmediateStart = await client.evaluate(`(async () => {
      const api = wallpaperEngineDesktopApi();
      const item = wallpaperEngineProjectById(wallpaperEngineSelection.id);
      if (!api || !item || typeof api.stopWallpaperEngineScene !== 'function') throw new Error('STOP_ALL_RACE_PREREQUISITE_MISSING');
      cancelWallpaperEngineSwitchTimer();
      cancelWallpaperEngineVideoRetry();
      stopWallpaperEngineCaptureStream();
      wallpaperEngineNativeSessionId = '';
      wallpaperEngineCaptureMode = '';
      wallpaperEngineRuntimeError = '';
      const layer = document.getElementById('wallpaper-engine-layer');
      if (layer) layer.classList.remove('ready', 'image-ready', 'video-ready', 'engine-ready');
      const stopPromise = api.stopWallpaperEngineScene({ all: true });
      const applied = applyWallpaperEngineBackground(item, true);
      return { applied, stopResult: await stopPromise };
    })()`);
    assert.strictEqual(stopAllImmediateStart.applied, true, 'Immediate restart was not scheduled after stop-all');
    assert(stopAllImmediateStart.stopResult && stopAllImmediateStart.stopResult.ok !== false, 'stop-all request failed before immediate restart');
    const afterStopAllRace = assertActiveState(await waitForState(client, 'stop-all immediate restart', (state) => (
      state.bodyActive && state.hasStream && /^[a-f0-9]{24}$/.test(state.sessionId)
      && state.sessionId !== initial.sessionId
      && state.runtime && state.runtime.active && state.runtime.sessionId === state.sessionId
      && state.runtime.sourceWindowAligned
      && state.runtime.parallaxPointerRelayReady && state.runtime.parallaxPointerRelayActive
    ), 70000), initial.sessionId, { phase: 'stop-all windowed restart', rounded: true });
    const stopAllRaceTitle = `Mineradio Wallpaper ${afterStopAllRace.sessionId}`;
    knownSessionTitles.add(stopAllRaceTitle);
    const stopAllRaceWindows = await waitForExactWindowCount(stopAllRaceTitle, 1);
    await waitForExactWindowCount(initialTitle, 0);
    const stopAllRaceFrames = await sampleFrames(client);
    assert(stopAllRaceFrames.frames >= 2, `Scene after stop-all immediate restart did not advance frames (${stopAllRaceFrames.frames})`);
    evidence.phases.stopAllImmediateStart = {
      request: stopAllImmediateStart,
      state: afterStopAllRace,
      physical: physicalSceneSummary(afterStopAllRace),
      exactWindows: stopAllRaceWindows,
      oldExactWindowCount: 0,
      frames: stopAllRaceFrames,
    };

    await client.evaluate(`desktopWindow.minimize()`);
    const minimized = await waitForState(client, 'minimized suspension', (state) => (
      state.selectionActive && state.hostPreparing && !state.hasStream && !state.sessionId
      && (!state.runtime || state.runtime.active === false)
    ), 30000);
    assertSuspendedState(minimized);
    await waitForExactWindowCount(stopAllRaceTitle, 0);
    evidence.phases.minimized = { state: minimized, oldExactWindowCount: 0 };

    await client.evaluate(`desktopWindow.restore()`, false);
    const restoredFromMinimize = assertActiveState(await waitForState(client, 'restore after minimize', (state) => (
      state.bodyActive && state.hasStream
      && /^[a-f0-9]{24}$/.test(state.sessionId) && state.sessionId !== afterStopAllRace.sessionId
      && state.runtime && state.runtime.active && state.runtime.sourceWindowAligned
      && state.runtime.parallaxPointerRelayReady && state.runtime.parallaxPointerRelayActive
    ), 70000), afterStopAllRace.sessionId, { phase: 'minimize windowed restore', rounded: true });
    const minimizeRestoreTitle = `Mineradio Wallpaper ${restoredFromMinimize.sessionId}`;
    knownSessionTitles.add(minimizeRestoreTitle);
    const minimizeRestoreWindows = await waitForExactWindowCount(minimizeRestoreTitle, 1);
    await waitForExactWindowCount(stopAllRaceTitle, 0);
    const minimizeRestoreFrames = await sampleFrames(client);
    assert(minimizeRestoreFrames.frames >= 2, `Restored Scene after minimize did not advance frames (${minimizeRestoreFrames.frames})`);
    evidence.phases.restoredFromMinimize = {
      state: restoredFromMinimize,
      physical: physicalSceneSummary(restoredFromMinimize),
      exactWindows: minimizeRestoreWindows,
      frames: minimizeRestoreFrames,
    };

    await client.evaluate(`(async () => {
      await desktopWindow.setCloseBehavior('tray');
      desktopWindow.close('tray');
      return true;
    })()`);
    const hidden = await waitForState(client, 'tray-hidden suspension', (state) => (
      state.selectionActive && state.hostPreparing && !state.hasStream && !state.sessionId
      && (!state.runtime || state.runtime.active === false)
    ), 30000);
    assertSuspendedState(hidden);
    await waitForExactWindowCount(minimizeRestoreTitle, 0);
    evidence.phases.hiddenToTray = { state: hidden, oldExactWindowCount: 0 };

    await client.evaluate(`desktopWindow.restore()`, false);
    const restoredFromHide = assertActiveState(await waitForState(client, 'restore after tray hide', (state) => (
      state.bodyActive && state.hasStream
      && /^[a-f0-9]{24}$/.test(state.sessionId) && state.sessionId !== restoredFromMinimize.sessionId
      && state.runtime && state.runtime.active && state.runtime.sourceWindowAligned
      && state.runtime.parallaxPointerRelayReady && state.runtime.parallaxPointerRelayActive
    ), 70000), restoredFromMinimize.sessionId, { phase: 'tray windowed restore', rounded: true });
    const restoredFromHidePhysical = physicalSceneSummary(restoredFromHide);
    const hideRestoreTitle = `Mineradio Wallpaper ${restoredFromHide.sessionId}`;
    knownSessionTitles.add(hideRestoreTitle);
    const hideRestoreWindows = await waitForExactWindowCount(hideRestoreTitle, 1);
    await waitForExactWindowCount(minimizeRestoreTitle, 0);
    const hideRestoreFrames = await sampleFrames(client);
    assert(hideRestoreFrames.frames >= 2, `Restored Scene after tray hide did not advance frames (${hideRestoreFrames.frames})`);
    evidence.phases.restoredFromHide = {
      state: restoredFromHide,
      physical: restoredFromHidePhysical,
      exactWindows: hideRestoreWindows,
      frames: hideRestoreFrames,
    };

    await client.evaluate(`desktopWindow.toggleFullscreen()`, false);
    const fullscreen = assertActiveState(await waitForState(client, 'fullscreen restart', (state) => (
      state.bodyActive && state.hasStream
      && /^[a-f0-9]{24}$/.test(state.sessionId) && state.sessionId !== restoredFromHide.sessionId
      && state.runtime && state.runtime.active && state.runtime.sourceWindowAligned
      && state.runtime.parallaxPointerRelayReady && state.runtime.parallaxPointerRelayActive
    ), 70000), restoredFromHide.sessionId, { phase: 'native fullscreen', rounded: false });
    const fullscreenPhysical = physicalSceneSummary(fullscreen);
    const fullscreenTitle = `Mineradio Wallpaper ${fullscreen.sessionId}`;
    knownSessionTitles.add(fullscreenTitle);
    const fullscreenWindows = await waitForExactWindowCount(fullscreenTitle, 1);
    await waitForExactWindowCount(hideRestoreTitle, 0);
    const fullscreenFrames = await sampleFrames(client);
    assert(fullscreenFrames.frames >= 2, `Fullscreen Scene did not advance frames (${fullscreenFrames.frames})`);
    assert(fullscreenPhysical.expectedPhysical.width > restoredFromHidePhysical.expectedPhysical.width, 'Fullscreen Scene width did not grow to the physical display');
    assert(fullscreenPhysical.expectedPhysical.height > restoredFromHidePhysical.expectedPhysical.height, 'Fullscreen Scene height did not grow to the physical display');
    const fullscreenFrameDataUrl = await client.evaluate(`(() => {
      const video = document.getElementById('wallpaper-engine-video');
      if (!video || !video.videoWidth || !video.videoHeight) return '';
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d', { alpha: false });
      context.drawImage(video, 0, 0);
      return canvas.toDataURL('image/png');
    })()`, false);
    const fullscreenEmbeddedFramePath = path.join(qaRoot, 'fullscreen-embedded-frame.png');
    assert(/^data:image\/png;base64,/.test(fullscreenFrameDataUrl), 'Fullscreen embedded Wallpaper Engine frame could not be captured');
    fs.writeFileSync(fullscreenEmbeddedFramePath, Buffer.from(fullscreenFrameDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    evidence.phases.fullscreen = {
      state: fullscreen,
      physical: fullscreenPhysical,
      exactWindows: fullscreenWindows,
      frames: fullscreenFrames,
      embeddedFramePath: fullscreenEmbeddedFramePath,
    };

    await client.evaluate(`desktopWindow.exitFullscreenWindowed()`, false);
    const restoredFromFullscreen = assertActiveState(await waitForState(client, 'windowed restart after fullscreen', (state) => (
      state.bodyActive && state.hasStream
      && /^[a-f0-9]{24}$/.test(state.sessionId) && state.sessionId !== fullscreen.sessionId
      && state.runtime && state.runtime.active && state.runtime.sourceWindowAligned
      && state.runtime.parallaxPointerRelayReady && state.runtime.parallaxPointerRelayActive
    ), 70000), fullscreen.sessionId, { phase: 'windowed restore after fullscreen', rounded: true });
    const restoredFromFullscreenPhysical = physicalSceneSummary(restoredFromFullscreen);
    assert.strictEqual(
      restoredFromFullscreenPhysical.expectedPhysical.width,
      initialPhysical.expectedPhysical.width,
      'Windowed restore width did not return to the initial physical size'
    );
    assert.strictEqual(
      restoredFromFullscreenPhysical.expectedPhysical.height,
      initialPhysical.expectedPhysical.height,
      'Windowed restore height did not return to the initial physical size'
    );
    const fullscreenRestoreTitle = `Mineradio Wallpaper ${restoredFromFullscreen.sessionId}`;
    knownSessionTitles.add(fullscreenRestoreTitle);
    const fullscreenRestoreWindows = await waitForExactWindowCount(fullscreenRestoreTitle, 1);
    await waitForExactWindowCount(fullscreenTitle, 0);
    const fullscreenRestoreFrames = await sampleFrames(client);
    assert(fullscreenRestoreFrames.frames >= 2, `Windowed Scene after fullscreen did not advance frames (${fullscreenRestoreFrames.frames})`);
    evidence.phases.restoredFromFullscreen = {
      state: restoredFromFullscreen,
      physical: restoredFromFullscreenPhysical,
      exactWindows: fullscreenRestoreWindows,
      frames: fullscreenRestoreFrames,
    };

    const quitStartedAt = Date.now();
    try {
      await client.evaluate(`desktopWindow.close('exit')`);
    } catch (error) {
      if (!/closed|Target|context|session/i.test(String(error && error.message || error))) throw error;
    }
    const exit = await waitForProcessExit(child, 20000);
    assert(exit, 'QA Mineradio did not exit within 20 seconds');
    cleanExit = true;
    evidence.phases.fastExit = {
      exit,
      elapsedMs: Date.now() - quitStartedAt,
      activeSessionIdAtRequest: restoredFromFullscreen.sessionId,
    };
    for (const title of knownSessionTitles) await waitForExactWindowCount(title, 0, 20000);
    const hostGoneDeadline = Date.now() + 10000;
    while (Date.now() < hostGoneDeadline && windowHandleExists(hostHandle)) await sleep(250);
    assert.strictEqual(windowHandleExists(hostHandle), false, 'QA Mineradio host window survived process exit');
    evidence.phases.fastExit.orphanExactWindowCount = 0;
    evidence.wallpaperProcessesAfter = listWallpaperEngineProcesses();
    evidence.ok = true;
    evidence.finishedAt = new Date().toISOString();
    fs.writeFileSync(resultPath, JSON.stringify(evidence, null, 2), 'utf8');
    console.log(JSON.stringify({
      ok: true,
      resultPath,
      logPath,
      qaRoot,
      selected,
      sessions: [...knownSessionTitles],
      stopAllImmediateStartFrames: stopAllRaceFrames.frames,
      minimizeFrames: minimizeRestoreFrames.frames,
      hideFrames: hideRestoreFrames.frames,
      physicalLifecycle: {
        initial: initialPhysical,
        fullscreen: fullscreenPhysical,
        restoredFromFullscreen: restoredFromFullscreenPhysical,
      },
      fullscreenFrames: fullscreenFrames.frames,
      fullscreenRestoreFrames: fullscreenRestoreFrames.frames,
      quitElapsedMs: evidence.phases.fastExit.elapsedMs,
      orphanExactWindowCount: 0,
    }, null, 2));
  } catch (error) {
    if (client) evidence.rendererConsole = client.consoleMessages.slice(-80);
    evidence.error = String(error && error.stack || error);
    evidence.finishedAt = new Date().toISOString();
    try { fs.writeFileSync(resultPath, JSON.stringify(evidence, null, 2), 'utf8'); } catch (_) { }
    throw error;
  } finally {
    if (client && !client.closed && !cleanExit) {
      try { await client.evaluate(`deactivateWallpaperEngineBackground(true)`); } catch (_) { }
      try { await client.evaluate(`desktopWindow.close('exit')`); } catch (_) { }
    }
    if (client) client.close();
    if (child && child.exitCode == null) {
      const exited = await waitForProcessExit(child, 5000);
      if (!exited) {
        try { process.kill(child.pid); } catch (_) { }
        await waitForProcessExit(child, 5000);
      }
    }
    for (const title of knownSessionTitles) {
      try {
        if (exactWindowsByTitle(title).length) closeExactQaWindow(title);
      } catch (_) { }
    }
    if (logStream) {
      await new Promise((resolve) => logStream.end(resolve));
    }
    try { removeSystemUserDataJunction(); } catch (error) {
      console.error(`QA userData junction cleanup failed: ${error && error.message || error}`);
      process.exitCode = 1;
    }
    if (evidence.ok) cleanupHeavyQaData();
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
