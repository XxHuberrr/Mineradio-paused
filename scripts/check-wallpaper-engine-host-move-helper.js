'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');

const port = Number(process.argv[2] || 9231);
const hostPid = Number(process.argv[3] || 0);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  assert(Number.isInteger(hostPid) && hostPid > 0, 'A Mineradio host PID is required');
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const target = targets.find((item) => item.type === 'page' && /127\.0\.0\.1/.test(item.url || ''));
  assert(target && target.webSocketDebuggerUrl, 'Mineradio renderer target was not found');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let requestId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data || '{}'));
    if (!message.id || !pending.has(message.id)) return;
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message || 'CDP request failed'));
    else entry.resolve(message.result || {});
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Renderer evaluation failed');
    return response.result?.value;
  };
  await call('Runtime.enable');

  const readState = () => evaluate(`(async () => {
    const api = wallpaperEngineDesktopApi();
    const runtime = api && typeof api.getWallpaperEngineRuntimeStatus === 'function'
      ? await api.getWallpaperEngineRuntimeStatus({})
      : null;
    return {
      active: document.body.classList.contains('wallpaper-engine-active'),
      selectionActive: !!wallpaperEngineSelection.active,
      kind: wallpaperEngineSelection.kind,
      sessionId: String(wallpaperEngineNativeSessionId || ''),
      runtime,
    };
  })()`);
  const waitForState = async (predicate, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    let state = null;
    while (Date.now() < deadline) {
      state = await readState();
      if (predicate(state)) return state;
      await sleep(180);
    }
    throw new Error(`Timed out waiting for Wallpaper Engine state: ${JSON.stringify(state)}`);
  };

  const before = await waitForState((state) => state.active
    && /^[a-f0-9]{24}$/.test(state.sessionId)
    && state.runtime
    && state.runtime.active === true
    && state.runtime.sourceWindowAligned === true, 45000);

  const script = `
$ErrorActionPreference='Stop'
$env:TEMP='D:\\MineradioCache\\native-helper-temp'
$env:TMP=$env:TEMP
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MineradioQaHostMove {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
'@
$app=Get-Process -Id ${hostPid} -ErrorAction Stop
$rect=New-Object MineradioQaHostMove+RECT
if (-not [MineradioQaHostMove]::GetWindowRect($app.MainWindowHandle,[ref]$rect)) { throw 'GetWindowRect failed' }
if (-not [MineradioQaHostMove]::SetWindowPos($app.MainWindowHandle,[IntPtr]::Zero,$rect.Left+80,$rect.Top+40,0,0,0x0015)) { throw 'SetWindowPos failed' }
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const moved = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
    env: {
      ...process.env,
      TEMP: 'D:\\MineradioCache\\native-helper-temp',
      TMP: 'D:\\MineradioCache\\native-helper-temp',
    },
  });
  assert.strictEqual(moved.status, 0, moved.stderr || moved.stdout || 'Host move failed');

  const after = await waitForState((state) => state.active
    && state.kind === 'engine'
    && /^[a-f0-9]{24}$/.test(state.sessionId)
    && state.sessionId !== before.sessionId
    && state.runtime
    && state.runtime.active === true
    && state.runtime.sessionId === state.sessionId
    && state.runtime.sourceWindowAligned === true, 45000);
  socket.close();
  console.log(JSON.stringify({
    ok: true,
    beforeSessionId: before.sessionId,
    afterSessionId: after.sessionId,
    sourceWindowRect: after.runtime.sourceWindowRect,
    hostWindowRect: after.runtime.hostWindowRect,
    audioMuted: after.runtime.audioMuted,
  }));
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
