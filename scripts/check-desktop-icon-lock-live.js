#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const port = Number(process.argv[2] || 0);
const leaveEnabled = process.argv.includes('--leave-enabled');
assert(Number.isInteger(port) && port > 0,
  'Usage: node scripts/check-desktop-icon-lock-live.js <remote-debugging-port> [--leave-enabled]');

const RENDERER_BACKGROUND_LAYER_IDS = [
  'custom-bg',
  'wallpaper-engine-layer',
  'album-bg',
  'album-bg-next',
  'sonic-workshop-layer',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'CDP request failed'));
      else pending.resolve(message.result);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CdpClient(socket);
  }

  call(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception && response.exceptionDetails.exception.description
        || response.exceptionDetails.text || 'Renderer evaluation failed');
    }
    return response.result && response.result.value;
  }

  close() {
    try { this.socket.close(); } catch (_) { }
  }
}

async function listCdpTargets() {
  return fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
}

async function mainTarget(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      const targets = await listCdpTargets();
      const target = targets.find((item) => item.type === 'page'
        && /127\.0\.0\.1/.test(String(item.url || ''))
        && !/\/wallpaper\.html(?:[?#]|$)/.test(String(item.url || '')));
      if (target && target.webSocketDebuggerUrl) return target;
    } catch (_) { }
    await sleep(100);
  }
  throw new Error('Mineradio CDP target was not ready');
}

function runPowerShell(script, failureLabel) {
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-Command', script,
  ], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || failureLabel).trim());
  }
  const output = String(result.stdout || '').replace(/^\uFEFF/, '').trim();
  return JSON.parse(output || '{}');
}

function terminalHostSnapshot() {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$items = @(Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'WindowsTerminal.exe' -or $_.Name -eq 'OpenConsole.exe'
} | ForEach-Object {
  [pscustomobject]@{
    processId = [int64]$_.ProcessId
    parentProcessId = [int64]$_.ParentProcessId
    name = [string]$_.Name
    commandLine = [string]$_.CommandLine
  }
})
ConvertTo-Json -InputObject $items -Compress`;
  const parsed = runPowerShell(script, 'Terminal-host process probe failed');
  return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
}

function newTerminalHosts(before, after) {
  const beforeIds = new Set((before || []).map((item) => String(item && item.processId || '')));
  return (after || []).filter((item) => !beforeIds.has(String(item && item.processId || '')));
}

function nativeExplorerSnapshot(expectedHandle = '') {
  const expected = /^\d+$/.test(String(expectedHandle || '')) ? String(expectedHandle) : '0';
  const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class MineradioExplorerUntouchedProbe {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string className, string title);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool IsWindowEnabled(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
  [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW", SetLastError=true)] private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int index);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW", SetLastError=true)] private static extern IntPtr GetWindowLong32(IntPtr hWnd, int index);
  [DllImport("user32.dll", SetLastError=true)] public static extern int GetWindowRgn(IntPtr hWnd, IntPtr region);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool GetLayeredWindowAttributes(IntPtr hWnd, out uint colorKey, out byte alpha, out uint flags);
  [DllImport("user32.dll", SetLastError=true)] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("gdi32.dll")] public static extern IntPtr CreateRectRgn(int left, int top, int right, int bottom);
  [DllImport("gdi32.dll")] public static extern int GetRgnBox(IntPtr region, out RECT rect);
  [DllImport("gdi32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool DeleteObject(IntPtr value);
  public static IntPtr GetWindowLongPtr(IntPtr hWnd, int index) { return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, index) : GetWindowLong32(hWnd, index); }
  public static uint GetWindowLongU32(IntPtr hWnd, int index) { return unchecked((uint)GetWindowLongPtr(hWnd, index).ToInt64()); }
  public static uint IntPtrU32(IntPtr value) { return unchecked((uint)value.ToInt64()); }
  public static string ClassName(IntPtr hWnd) { StringBuilder value = new StringBuilder(160); GetClassName(hWnd, value, value.Capacity); return value.ToString(); }
  public static bool FindDesktop(out IntPtr host, out IntPtr view, out IntPtr list) {
    IntPtr foundHost = IntPtr.Zero, foundView = IntPtr.Zero, foundList = IntPtr.Zero;
    EnumWindows(delegate(IntPtr candidate, IntPtr unused) {
      IntPtr candidateView = FindWindowEx(candidate, IntPtr.Zero, "SHELLDLL_DefView", null);
      if (candidateView == IntPtr.Zero) return true;
      IntPtr candidateList = FindWindowEx(candidateView, IntPtr.Zero, "SysListView32", null);
      if (candidateList == IntPtr.Zero) return true;
      foundHost = candidate; foundView = candidateView; foundList = candidateList;
      return false;
    }, IntPtr.Zero);
    host = foundHost; view = foundView; list = foundList;
    return host != IntPtr.Zero && view != IntPtr.Zero && list != IntPtr.Zero;
  }
}
"@
$previousDpi = [IntPtr]::Zero
$region = [IntPtr]::Zero
try {
  try { $previousDpi = [MineradioExplorerUntouchedProbe]::SetThreadDpiAwarenessContext([IntPtr]::new([Int64]-4)) } catch { }
  $desktopHost = [IntPtr]::Zero
  $view = [IntPtr]::Zero
  $list = [IntPtr]::Zero
  $expected = [IntPtr]::new([Int64]${expected})
  if ($expected -ne [IntPtr]::Zero) {
    if (-not [MineradioExplorerUntouchedProbe]::IsWindow($expected)) { throw 'EXPECTED_EXPLORER_LIST_NOT_FOUND' }
    if ([MineradioExplorerUntouchedProbe]::ClassName($expected) -ne 'SysListView32') { throw 'EXPECTED_EXPLORER_LIST_CLASS_CHANGED' }
    $list = $expected
    $view = [MineradioExplorerUntouchedProbe]::GetParent($list)
    $desktopHost = [MineradioExplorerUntouchedProbe]::GetAncestor($list, 2)
  } elseif (-not [MineradioExplorerUntouchedProbe]::FindDesktop([ref]$desktopHost, [ref]$view, [ref]$list)) {
    throw 'EXPLORER_DESKTOP_LIST_NOT_FOUND'
  }
  if ([MineradioExplorerUntouchedProbe]::ClassName($list) -ne 'SysListView32') { throw 'EXPLORER_DESKTOP_LIST_INVALID' }
  $rect = New-Object MineradioExplorerUntouchedProbe+RECT
  if (-not [MineradioExplorerUntouchedProbe]::GetWindowRect($list, [ref]$rect)) { throw 'EXPLORER_DESKTOP_RECT_FAILED' }
  $region = [MineradioExplorerUntouchedProbe]::CreateRectRgn(0, 0, 0, 0)
  if ($region -eq [IntPtr]::Zero) { throw 'EXPLORER_DESKTOP_REGION_ALLOC_FAILED' }
  $regionType = [MineradioExplorerUntouchedProbe]::GetWindowRgn($list, $region)
  $regionBox = New-Object MineradioExplorerUntouchedProbe+RECT
  $regionBoxType = 0
  if ($regionType -gt 0) { $regionBoxType = [MineradioExplorerUntouchedProbe]::GetRgnBox($region, [ref]$regionBox) }
  [uint32]$layerColorKey = 0
  [byte]$layerAlpha = 0
  [uint32]$layerFlags = 0
  $layerAvailable = [MineradioExplorerUntouchedProbe]::GetLayeredWindowAttributes($list, [ref]$layerColorKey, [ref]$layerAlpha, [ref]$layerFlags)
  $layerError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  [uint32]$processId = 0
  $threadId = [MineradioExplorerUntouchedProbe]::GetWindowThreadProcessId($list, [ref]$processId)
  $style = [MineradioExplorerUntouchedProbe]::GetWindowLongU32($list, -16)
  $exStyle = [MineradioExplorerUntouchedProbe]::GetWindowLongU32($list, -20)
  $backgroundResult = [IntPtr]::Zero
  if ([MineradioExplorerUntouchedProbe]::SendMessageTimeout($list, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero, 0x0002, 500, [ref]$backgroundResult) -eq [IntPtr]::Zero) {
    throw 'EXPLORER_DESKTOP_BACKGROUND_TIMEOUT'
  }
  $background = [MineradioExplorerUntouchedProbe]::IntPtrU32($backgroundResult)
  [pscustomobject]@{
    handle = $list.ToInt64().ToString()
    className = [MineradioExplorerUntouchedProbe]::ClassName($list)
    parentWindowId = $view.ToInt64().ToString()
    parentClassName = [MineradioExplorerUntouchedProbe]::ClassName($view)
    rootWindowId = $desktopHost.ToInt64().ToString()
    rootClassName = [MineradioExplorerUntouchedProbe]::ClassName($desktopHost)
    processId = [int64]$processId
    threadId = [int64]$threadId
    style = $style.ToString()
    exStyle = $exStyle.ToString()
    regionType = $regionType
    regionBoxType = $regionBoxType
    regionBox = [pscustomobject]@{ left = $regionBox.Left; top = $regionBox.Top; right = $regionBox.Right; bottom = $regionBox.Bottom }
    enabled = [MineradioExplorerUntouchedProbe]::IsWindowEnabled($list)
    visible = [MineradioExplorerUntouchedProbe]::IsWindowVisible($list)
    layeredAttributesAvailable = $layerAvailable
    layeredColorKey = $layerColorKey.ToString()
    layeredAlpha = [int]$layerAlpha
    layeredFlags = $layerFlags.ToString()
    layeredLastError = $layerError
    backgroundColor = $background.ToString()
    windowRect = [pscustomobject]@{ left = $rect.Left; top = $rect.Top; right = $rect.Right; bottom = $rect.Bottom }
  } | ConvertTo-Json -Compress
} finally {
  if ($region -ne [IntPtr]::Zero) { [MineradioExplorerUntouchedProbe]::DeleteObject($region) | Out-Null }
  if ($previousDpi -ne [IntPtr]::Zero) { try { [MineradioExplorerUntouchedProbe]::SetThreadDpiAwarenessContext($previousDpi) | Out-Null } catch { } }
}`;
  return runPowerShell(script, 'Explorer native-state probe failed');
}

function windowChainAt(x, y, rootHandle) {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class MineradioDesktopRouteHitTest {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern IntPtr ChildWindowFromPointEx(IntPtr parent, POINT point, uint flags);
  [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool ScreenToClient(IntPtr hwnd, ref POINT point);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
"@
$previousDpi = [IntPtr]::Zero
try {
  try { $previousDpi = [MineradioDesktopRouteHitTest]::SetThreadDpiAwarenessContext([IntPtr]::new([Int64]-4)) } catch { }
  $current = [IntPtr]::new([Int64]${String(rootHandle || '0')})
  $chain = @()
  for ($depth = 0; $current -ne [IntPtr]::Zero -and $depth -lt 12; $depth++) {
    $className = New-Object System.Text.StringBuilder 160
    $title = New-Object System.Text.StringBuilder 260
    [MineradioDesktopRouteHitTest]::GetClassName($current, $className, $className.Capacity) | Out-Null
    [MineradioDesktopRouteHitTest]::GetWindowText($current, $title, $title.Capacity) | Out-Null
    $chain += [pscustomobject]@{ handle = $current.ToInt64().ToString(); className = $className.ToString(); title = $title.ToString() }
    $point = New-Object MineradioDesktopRouteHitTest+POINT
    $point.X = ${Math.round(x)}
    $point.Y = ${Math.round(y)}
    if (-not [MineradioDesktopRouteHitTest]::ScreenToClient($current, [ref]$point)) { break }
    # CWP_SKIPINVISIBLE | CWP_SKIPDISABLED | CWP_SKIPTRANSPARENT. This checks
    # the native pass-through plumbing without synthesizing mouse input.
    $child = [MineradioDesktopRouteHitTest]::ChildWindowFromPointEx($current, $point, 0x0007)
    if ($child -eq [IntPtr]::Zero -or $child -eq $current) { break }
    $current = $child
  }
  $chain | ConvertTo-Json -Compress
} finally {
  if ($previousDpi -ne [IntPtr]::Zero) { try { [MineradioDesktopRouteHitTest]::SetThreadDpiAwarenessContext($previousDpi) | Out-Null } catch { } }
}`;
  const parsed = runPowerShell(script, 'Desktop route hit-test failed');
  return Array.isArray(parsed) ? parsed : [parsed];
}

function nativeFingerprint(snapshot, options = {}) {
  const style = BigInt(String(snapshot.style || '0'));
  const exStyle = BigInt(String(snapshot.exStyle || '0'));
  const styleValue = options.ignoreVisibleStyleBit === true
    ? (style & ~0x10000000n).toString()
    : style.toString();
  const exStyleValue = options.ignoreLayeredState === true
    ? (exStyle & ~0x00080000n).toString()
    : exStyle.toString();
  return {
    handle: snapshot.handle,
    className: snapshot.className,
    parentWindowId: snapshot.parentWindowId,
    parentClassName: snapshot.parentClassName,
    rootWindowId: snapshot.rootWindowId,
    rootClassName: snapshot.rootClassName,
    processId: snapshot.processId,
    threadId: snapshot.threadId,
    style: styleValue,
    exStyle: exStyleValue,
    regionType: snapshot.regionType,
    regionBoxType: snapshot.regionBoxType,
    regionBox: snapshot.regionBox,
    enabled: snapshot.enabled,
    layeredAttributesAvailable: options.ignoreLayeredState === true ? undefined : snapshot.layeredAttributesAvailable,
    layeredColorKey: options.ignoreLayeredState === true ? undefined : snapshot.layeredColorKey,
    layeredAlpha: options.ignoreLayeredState === true ? undefined : snapshot.layeredAlpha,
    layeredFlags: options.ignoreLayeredState === true ? undefined : snapshot.layeredFlags,
    backgroundColor: options.ignoreBackgroundColor === true ? undefined : snapshot.backgroundColor,
    visible: options.ignoreVisibility === true ? undefined : snapshot.visible,
  };
}

function assertExplorerUntouched(baseline, current, label, options = {}) {
  assert.deepEqual(nativeFingerprint(current, options), nativeFingerprint(baseline, options),
    `${label}: Explorer SysListView32 native visual state changed`);
}

function assertExplorerLayeredColorKey(baseline, current, label, options = {}) {
  const stableOptions = { ...options, ignoreLayeredState: true, ignoreBackgroundColor: true };
  assert.deepEqual(nativeFingerprint(current, stableOptions), nativeFingerprint(baseline, stableOptions),
    `${label}: Explorer identity, layout, region, or non-layered state changed`);
  assert.notEqual(BigInt(String(current.exStyle || '0')) & 0x00080000n, 0n,
    `${label}: Explorer SysListView32 is missing WS_EX_LAYERED`);
  assert.equal(current.layeredAttributesAvailable, true,
    `${label}: Explorer layered attributes are unavailable`);
  assert.equal(BigInt(String(current.layeredColorKey || '0')), 0n,
    `${label}: Explorer color key is not pure black`);
  assert.notEqual(BigInt(String(current.layeredFlags || '0')) & 0x1n, 0n,
    `${label}: Explorer layered attributes do not include LWA_COLORKEY`);
  assert.equal(BigInt(String(current.backgroundColor || '0')), 0n,
    `${label}: Explorer background is not the verified color-key surface`);
}

function localPointToPhysical(point, status, viewport) {
  const physical = status.physicalBounds || status.bounds;
  assert(physical && Number(physical.width) > 0 && Number(physical.height) > 0,
    `physical desktop bounds unavailable: ${JSON.stringify(status)}`);
  return {
    x: Number(physical.x) + Number(point.x) * Number(physical.width) / Math.max(1, Number(viewport.width)),
    y: Number(physical.y) + Number(point.y) * Number(physical.height) / Math.max(1, Number(viewport.height)),
  };
}

async function setPointerRoute(client, route) {
  const serialized = JSON.stringify({
    overSoftwareUi: route && route.overSoftwareUi === true,
    overDesktopControls: route && route.overDesktopControls === true,
  });
  return client.evaluate(`(async () => {
    const desired = ${serialized};
    // Keep the renderer's normal 48 ms pointer reporter aligned with this
    // plumbing probe, otherwise it correctly overwrites a direct IPC call
    // from its last real pointer position. This changes no OS cursor state and
    // is never treated as proof of physical mouse behavior.
    if (typeof desktopPointerRouteReporter === 'object' && desktopPointerRouteReporter) {
      if (desktopPointerRouteReporter.timer) {
        clearTimeout(desktopPointerRouteReporter.timer);
        desktopPointerRouteReporter.timer = 0;
      }
      desktopPointerRouteReporter.forcePending = false;
      let target = null;
      if (desired.overDesktopControls) target = document.getElementById('desktop-mode-control-handle');
      else if (desired.overSoftwareUi) target = document.getElementById('bottom-bar');
      if (target) {
        const rect = target.getBoundingClientRect();
        desktopPointerRouteReporter.x = rect.left + rect.width / 2;
        desktopPointerRouteReporter.y = rect.top + rect.height / 2;
        desktopPointerRouteReporter.hasPointer = true;
      } else {
        desktopPointerRouteReporter.hasPointer = false;
      }
      desktopPointerRouteReporter.lastKey = (desired.overSoftwareUi ? '1' : '0')
        + '|' + (desired.overDesktopControls ? '1' : '0');
    }
    desktopWindow.updateDesktopPointerRoute(desired);
    const deadline = performance.now() + 2500;
    let status = null;
    while (performance.now() <= deadline) {
      status = (await desktopWindow.getWallpaperModeStatus()).status || {};
      const route = status.pointerRoute || {};
      if (route.overSoftwareUi === desired.overSoftwareUi
        && route.overDesktopControls === desired.overDesktopControls) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    // Electron updates the HWND hit-test style after setIgnoreMouseEvents;
    // allow that native style transition to settle before Win32 probing.
    await new Promise((resolve) => setTimeout(resolve, 120));
    // UI auto-hide can legitimately schedule one forced route refresh while
    // that native transition settles. Re-assert the probe route once after
    // cancelling only that renderer-owned pending timer, then sample without
    // treating the user's physical cursor as automated test input.
    if (typeof desktopPointerRouteReporter === 'object' && desktopPointerRouteReporter) {
      if (desktopPointerRouteReporter.timer) {
        clearTimeout(desktopPointerRouteReporter.timer);
        desktopPointerRouteReporter.timer = 0;
      }
      desktopPointerRouteReporter.forcePending = false;
      desktopPointerRouteReporter.lastKey = (desired.overSoftwareUi ? '1' : '0')
        + '|' + (desired.overDesktopControls ? '1' : '0');
    }
    desktopWindow.updateDesktopPointerRoute(desired);
    const finalDeadline = performance.now() + 1000;
    while (performance.now() <= finalDeadline) {
      status = (await desktopWindow.getWallpaperModeStatus()).status || status;
      const route = status.pointerRoute || {};
      if (route.overSoftwareUi === desired.overSoftwareUi
        && route.overDesktopControls === desired.overDesktopControls) return status;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return status;
  })()`);
}

async function main() {
  assert.equal(process.platform, 'win32', 'full desktop live QA is Windows-only');
  const target = await mainTarget();
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  await client.call('Runtime.enable');

  let baseline = null;
  let enabledSuccessfully = false;
  let iconsRestored = false;
  let legacyCanvasTargetCount = null;
  let terminalHostsBeforeEnable = [];
  let terminalHostsAfterEnable = [];
  try {
    const normalized = await client.evaluate(`(async () => {
      let status = (await desktopWindow.getWallpaperModeStatus()).status || {};
      if (status.enabled === true || status.active === true || status.attaching === true) {
        fx.wallpaperMode = false;
        updateFxInputs();
        await applyWallpaperModeState(true);
        const deadline = performance.now() + 15000;
        while (performance.now() <= deadline) {
          status = (await desktopWindow.getWallpaperModeStatus()).status || {};
          if (status.enabled !== true && status.active !== true && status.attaching !== true) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      return status;
    })()`);
    assert.equal(normalized && normalized.enabled, false, 'could not establish disabled preflight state');
    assert.equal(normalized && normalized.active, false, 'full desktop remained active during preflight');
    assert.notEqual(normalized && normalized.attaching, true, 'full desktop was still attaching during preflight');

    baseline = nativeExplorerSnapshot();
    assert.equal(baseline.className, 'SysListView32');
    assert.equal(baseline.parentClassName, 'SHELLDLL_DefView');
    terminalHostsBeforeEnable = terminalHostSnapshot();

    const uiPreflight = await client.evaluate(`(async () => {
      const bottomBar = document.getElementById('bottom-bar');
      if (!bottomBar) throw new Error('FULL_DESKTOP_BOTTOM_BAR_MISSING');
      if (typeof setImmersiveMode === 'function') setImmersiveMode(true);
      if (typeof controlsHideTimer !== 'undefined' && controlsHideTimer) {
        clearTimeout(controlsHideTimer);
        controlsHideTimer = null;
      }
      bottomBar.classList.remove('visible', 'soft-hidden');
      if (typeof updateControlsChromeState === 'function') updateControlsChromeState();
      await new Promise((resolve) => setTimeout(resolve, 80));
      return {
        immersive: document.body.classList.contains('immersive-mode'),
        bottomVisible: bottomBar.classList.contains('visible'),
      };
    })()`);
    assert.equal(uiPreflight.immersive, true,
      'could not establish the inherited immersive-mode regression precondition');
    assert.equal(uiPreflight.bottomVisible, false,
      'could not establish the hidden bottom-bar regression precondition');

    const enabled = await client.evaluate(`(async () => {
      fx.wallpaperMode = true;
      updateFxInputs();
      const result = await applyWallpaperModeState(true);
      const deadline = performance.now() + 18000;
      let status = null;
      while (performance.now() <= deadline) {
        status = (await desktopWindow.getWallpaperModeStatus()).status || {};
        if (status.enabled === true && status.active === true && status.interactive === true
          && status.coexisting === true && status.iconLayerMode === 'explorer-layered-colorkey') break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await new Promise((resolve) => setTimeout(resolve, 450));
      if (typeof setDesktopModeControlsOpen === 'function') setDesktopModeControlsOpen(false);
      if (typeof cancelDesktopModeControlHide === 'function') cancelDesktopModeControlHide();
      await new Promise((resolve) => setTimeout(resolve, 230));
      const byId = (id) => document.getElementById(id);
      const dock = byId('desktop-mode-control-dock');
      const handle = byId('desktop-mode-control-handle');
      const panel = byId('desktop-mode-control-panel');
      const softwareLock = byId('desktop-software-lock-toggle');
      const icons = byId('desktop-icons-visible-toggle');
      const shell = byId('desktop-window-shell');
      const titlebar = byId('desktop-titlebar');
      const bottomBar = byId('bottom-bar');
      const bottomHandle = byId('bottom-handle');
      const emptyHome = byId('empty-home');
      if (!dock || !handle || !panel || !softwareLock || !icons || !shell || !titlebar || !bottomBar
        || !bottomHandle || !emptyHome) {
        throw new Error('FULL_DESKTOP_CONTROL_DOM_MISSING');
      }
      const rect = (element) => {
        const value = element.getBoundingClientRect();
        return { x: value.x, y: value.y, left: value.left, top: value.top, right: value.right,
          bottom: value.bottom, width: value.width, height: value.height };
      };
      const visibleSurface = (element) => {
        const style = getComputedStyle(element);
        const value = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden'
          && Number(style.opacity) > 0.05 && style.pointerEvents !== 'none'
          && value.width > 1 && value.height > 1;
      };
      const naturalHud = {
        immersive: document.body.classList.contains('immersive-mode'),
        splash: document.body.classList.contains('splash-active'),
        preload: document.documentElement.classList.contains('startup-fast-skip-preload'),
        bottomVisible: bottomBar.classList.contains('visible')
          && !bottomBar.classList.contains('soft-hidden') && visibleSurface(bottomBar),
        bottomClass: bottomBar.className,
        bottomOpacity: Number(getComputedStyle(bottomBar).opacity),
        bottomPointerEvents: getComputedStyle(bottomBar).pointerEvents,
        homeVisible: document.body.classList.contains('empty-home-active') && visibleSurface(emptyHome),
      };

      // Natural HUD visibility is sampled first. Only a genuinely hidden Home
      // fallback is temporarily revealed for the separate geometry check, and
      // its original class state is restored before returning.
      const originalBottomClass = bottomBar.className;
      const geometryNeedsReveal = !naturalHud.bottomVisible;
      if (geometryNeedsReveal) {
        bottomBar.classList.add('visible');
        bottomBar.classList.remove('soft-hidden');
        if (typeof updateControlsChromeState === 'function') updateControlsChromeState();
      }
      await new Promise((resolve) => setTimeout(resolve, 520));
      const bottomRect = rect(bottomBar);
      if (geometryNeedsReveal) {
        bottomBar.className = originalBottomClass;
        if (typeof updateControlsChromeState === 'function') updateControlsChromeState();
      }
      const bounds = status.bounds || { x: 0, y: 0, width: innerWidth, height: innerHeight };
      const workArea = status.workArea || bounds;
      return {
        result,
        status,
        viewport: { width: innerWidth, height: innerHeight },
        root: {
          htmlClass: document.documentElement.className,
          bodyClass: document.body.className,
          htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          shellBackground: getComputedStyle(shell).backgroundColor,
          maskImage: getComputedStyle(shell).webkitMaskImage || getComputedStyle(shell).maskImage,
          titlebarDisplay: getComputedStyle(titlebar).display,
        },
        dock: { display: getComputedStyle(dock).display, rect: rect(dock) },
        handle: {
          display: getComputedStyle(handle).display,
          hoverGuard: dock.matches(':hover') || handle.matches(':hover'),
          ariaExpanded: handle.getAttribute('aria-expanded'),
          ariaHasPopup: handle.getAttribute('aria-haspopup'),
          rect: rect(handle),
        },
        panel: {
          ariaHidden: panel.getAttribute('aria-hidden'),
          inert: panel.hasAttribute('inert'),
          visibility: getComputedStyle(panel).visibility,
          opacity: getComputedStyle(panel).opacity,
        },
        softwareLock: {
          role: softwareLock.getAttribute('role'),
          ariaChecked: softwareLock.getAttribute('aria-checked'),
          disabled: softwareLock.disabled,
          label: (softwareLock.querySelector('strong') || {}).textContent || '',
          state: (byId('desktop-software-lock-state') || {}).textContent || '',
        },
        icons: {
          role: icons.getAttribute('role'),
          ariaChecked: icons.getAttribute('aria-checked'),
          disabled: icons.disabled,
          label: (icons.querySelector('strong') || {}).textContent || '',
          state: (byId('desktop-icons-visible-state') || {}).textContent || '',
        },
        backgroundLayers: ${JSON.stringify(RENDERER_BACKGROUND_LAYER_IDS)}.map((id) => {
          const element = byId(id);
          if (!element) return { id, missing: true };
          const style = getComputedStyle(element);
          return { id, missing: false, opacity: style.opacity, visibility: style.visibility, background: style.backgroundColor };
        }),
        naturalHud,
        bottomRect,
        bottomHandleRect: rect(bottomHandle),
        localWorkArea: {
          left: workArea.x - bounds.x,
          top: workArea.y - bounds.y,
          right: workArea.x - bounds.x + workArea.width,
          bottom: workArea.y - bounds.y + workArea.height,
        },
        safeCss: ['top', 'right', 'bottom', 'left'].reduce((value, edge) => {
          value[edge] = getComputedStyle(document.documentElement).getPropertyValue('--desktop-safe-' + edge).trim();
          return value;
        }, {}),
      };
    })()`);

    assert.equal(enabled.result && enabled.result.ok, true, JSON.stringify(enabled, null, 2));
    assert.equal(enabled.status && enabled.status.enabled, true);
    assert.equal(enabled.status && enabled.status.active, true);
    assert.equal(enabled.status && enabled.status.interactive, true);
    assert.equal(enabled.status && enabled.status.coexisting, true);
    assert.equal(enabled.status && enabled.status.iconLayerMode, 'explorer-layered-colorkey');
    assert.equal(String(enabled.status && enabled.status.desktopListWindowId), baseline.handle,
      'runtime attached above a different Explorer SysListView32');
    assert.equal(enabled.status && enabled.status.escapeShortcutRegistered, true,
      'direct Escape shortcut is not registered');
    assert.equal(enabled.status && enabled.status.softwareInteractionLocked, false);
    assert.equal(enabled.status && enabled.status.ignoreMouseEvents, false,
      'unlocked complete Mineradio surface is still globally click-through');
    assert.equal(enabled.status && enabled.status.desktopIconsVisible, baseline.visible,
      'entering desktop mode did not adopt the original Explorer icon visibility');
    assert.equal(enabled.naturalHud.immersive, false,
      `full desktop inherited immersive chrome suppression: ${JSON.stringify(enabled.naturalHud)}`);
    assert.equal(enabled.naturalHud.splash, false,
      `full desktop remained behind the startup splash: ${JSON.stringify(enabled.naturalHud)}`);
    assert.equal(enabled.naturalHud.preload, false,
      `full desktop remained behind the preload mask: ${JSON.stringify(enabled.naturalHud)}`);
    assert(enabled.naturalHud.bottomVisible || enabled.naturalHud.homeVisible,
      `full desktop started without a natural Mineradio HUD: ${JSON.stringify(enabled.naturalHud)}`);
    enabledSuccessfully = true;

    const postEnableTargets = await listCdpTargets();
    legacyCanvasTargetCount = postEnableTargets.filter((item) =>
      /\/wallpaper\.html(?:[?#]|$)/.test(String(item && item.url || ''))).length;
    assert.equal(legacyCanvasTargetCount, 0,
      'legacy Canvas wallpaper target was created after full desktop mode enabled');

    assert.match(enabled.root.htmlClass, /(?:^|\s)desktop-explorer-layered-colorkey-root(?:\s|$)/);
    assert.match(enabled.root.bodyClass, /(?:^|\s)desktop-explorer-layered-colorkey(?:\s|$)/);
    assert.doesNotMatch(enabled.root.htmlClass, /(?:^|\s)desktop-explorer-overlay-root(?:\s|$)/);
    assert.doesNotMatch(enabled.root.bodyClass, /(?:^|\s)desktop-explorer-overlay(?:\s|$)/);
    assert.equal(enabled.root.maskImage, 'none');
    assert.equal(enabled.root.titlebarDisplay, 'none');
    const customBackground = enabled.backgroundLayers.find((layer) => layer.id === 'custom-bg');
    assert(customBackground && customBackground.missing !== true, 'renderer-owned particle/album background is missing');
    assert.notEqual(customBackground.visibility, 'hidden',
      'renderer-owned particle/album background was hidden by desktop mode');

    assert.equal(enabled.dock.display, 'block');
    assert.equal(enabled.handle.display, 'flex');
    assert.equal(enabled.handle.ariaHasPopup, 'true');
    if (enabled.handle.ariaExpanded === 'false') {
      assert.equal(enabled.panel.ariaHidden, 'true');
      assert.equal(enabled.panel.inert, true);
      assert.equal(enabled.panel.visibility, 'hidden');
    } else {
      assert.equal(enabled.handle.ariaExpanded, 'true');
      assert.equal(enabled.panel.ariaHidden, 'false');
      assert.equal(enabled.panel.inert, false);
      assert.equal(enabled.panel.visibility, 'visible');
    }
    assert.equal(enabled.softwareLock.role, 'switch');
    assert.equal(enabled.softwareLock.ariaChecked, 'false');
    assert.equal(enabled.softwareLock.disabled, false);
    assert(String(enabled.softwareLock.label).trim().length > 0 && String(enabled.softwareLock.state).trim().length > 0);
    assert.equal(enabled.icons.role, 'switch');
    assert.equal(enabled.icons.ariaChecked, baseline.visible ? 'true' : 'false');
    assert.equal(enabled.icons.disabled, false);
    assert(String(enabled.icons.label).trim().length > 0 && String(enabled.icons.state).trim().length > 0);

    assert(enabled.handle.rect.left >= enabled.localWorkArea.left - 1
      && enabled.handle.rect.right <= enabled.localWorkArea.right + 1
      && enabled.handle.rect.top >= enabled.localWorkArea.top - 1,
    `desktop controller escaped workArea: ${JSON.stringify(enabled.handle.rect)}`);
    assert(enabled.bottomRect.left >= enabled.localWorkArea.left - 1
      && enabled.bottomRect.right <= enabled.localWorkArea.right + 1
      && enabled.bottomRect.bottom <= enabled.localWorkArea.bottom + 1,
    `bottom bar is behind/outside the taskbar workArea: ${JSON.stringify(enabled.bottomRect)}`);
    assert(enabled.bottomHandleRect.left >= enabled.localWorkArea.left - 1
      && enabled.bottomHandleRect.right <= enabled.localWorkArea.right + 1
      && enabled.bottomHandleRect.bottom <= enabled.localWorkArea.bottom + 1,
    `bottom-bar wake handle is behind/outside the taskbar workArea: ${JSON.stringify(enabled.bottomHandleRect)}`);
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      assert.match(enabled.safeCss[edge], /^\d+(?:\.\d+)?px$/,
        `missing renderer work-area inset --desktop-safe-${edge}`);
    }

    const afterEnable = nativeExplorerSnapshot(baseline.handle);
    assertExplorerLayeredColorKey(baseline, afterEnable, 'desktop-mode enable');
    terminalHostsAfterEnable = terminalHostSnapshot();
    assert.deepEqual(newTerminalHosts(terminalHostsBeforeEnable, terminalHostsAfterEnable), [],
      'desktop-mode guardian opened a new Windows Terminal/OpenConsole host');

    const popup = await client.evaluate(`(async () => {
      const dock = document.getElementById('desktop-mode-control-dock');
      const handle = document.getElementById('desktop-mode-control-handle');
      const panel = document.getElementById('desktop-mode-control-panel');
      if (typeof desktopPointerRouteReporter === 'object' && desktopPointerRouteReporter) {
        if (desktopPointerRouteReporter.timer) clearTimeout(desktopPointerRouteReporter.timer);
        desktopPointerRouteReporter.timer = 0;
        desktopPointerRouteReporter.forcePending = false;
        desktopPointerRouteReporter.hasPointer = false;
        desktopPointerRouteReporter.lastKey = '0|0';
      }
      setDesktopModeControlsOpen(false);
      await new Promise((resolve) => setTimeout(resolve, 230));
      const closed = {
        expanded: handle.getAttribute('aria-expanded'),
        hidden: panel.getAttribute('aria-hidden'),
        inert: panel.hasAttribute('inert'),
        visibility: getComputedStyle(panel).visibility,
        opacity: Number(getComputedStyle(panel).opacity),
        transform: getComputedStyle(panel).transform,
      };
      setDesktopModeControlsOpen(true);
      await new Promise((resolve) => setTimeout(resolve, 230));
      const panelStyle = getComputedStyle(panel);
      const opened = {
        dockOpen: dock.classList.contains('is-open'),
        bodyOpen: document.body.classList.contains('desktop-mode-controls-open'),
        expanded: handle.getAttribute('aria-expanded'),
        hidden: panel.getAttribute('aria-hidden'),
        inert: panel.hasAttribute('inert'),
        visibility: panelStyle.visibility,
        opacity: Number(panelStyle.opacity),
        transform: panelStyle.transform,
        transitionProperty: panelStyle.transitionProperty,
        transitionDuration: panelStyle.transitionDuration,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      };
      const softwareLock = document.getElementById('desktop-software-lock-toggle');
      if (softwareLock) softwareLock.focus();
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 40));
      const outsideClick = {
        closed: !dock.classList.contains('is-open'),
        expanded: handle.getAttribute('aria-expanded'),
        hidden: panel.getAttribute('aria-hidden'),
        focusReleased: !panel.contains(document.activeElement),
      };
      const handleRect = handle.getBoundingClientRect();
      desktopPointerRouteReporter.x = handleRect.left + handleRect.width / 2;
      desktopPointerRouteReporter.y = handleRect.top + handleRect.height / 2;
      desktopPointerRouteReporter.hasPointer = true;
      flushDesktopPointerRouteReport(true);
      await new Promise((resolve) => setTimeout(resolve, 40));
      const routeDidNotReopen = !dock.classList.contains('is-open');
      setDesktopModeControlsOpen(true);
      await new Promise((resolve) => setTimeout(resolve, 40));
      if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
      scheduleDesktopModeControlHide(120);
      await new Promise((resolve) => setTimeout(resolve, 260));
      const autoHide = {
        closed: !dock.classList.contains('is-open'),
        hoverGuard: dock.matches(':hover'),
        focusGuard: dock.contains(document.activeElement),
      };
      setDesktopModeControlsOpen(false);
      cancelDesktopModeControlHide();
      return { closed, opened, outsideClick, routeDidNotReopen, autoHide };
    })()`);
    assert.equal(popup.closed.expanded, 'false');
    assert.equal(popup.closed.hidden, 'true');
    assert.equal(popup.closed.inert, true);
    assert.equal(popup.closed.visibility, 'hidden');
    assert.equal(popup.opened.dockOpen, true);
    assert.equal(popup.opened.bodyOpen, true);
    assert.equal(popup.opened.expanded, 'true');
    assert.equal(popup.opened.hidden, 'false');
    assert.equal(popup.opened.inert, false);
    assert.equal(popup.opened.visibility, 'visible');
    assert(popup.opened.opacity > 0.98, `control popup did not become visible: ${JSON.stringify(popup)}`);
    if (!popup.opened.reducedMotion) {
      assert.match(popup.opened.transitionProperty, /opacity/);
      assert.match(popup.opened.transitionProperty, /transform/);
      assert(/[1-9]/.test(popup.opened.transitionDuration), 'control popup has no transition duration');
      assert.notEqual(popup.closed.transform, popup.opened.transform, 'control popup has no transform animation state');
    }
    assert.equal(popup.outsideClick.closed, true, 'clicking outside the desktop controller did not close it');
    assert.equal(popup.outsideClick.expanded, 'false');
    assert.equal(popup.outsideClick.hidden, 'true');
    assert.equal(popup.outsideClick.focusReleased, true, 'outside close left focus trapped inside the inert panel');
    assert.equal(popup.routeDidNotReopen, true, 'pointer routing reopened a controller that the user closed');
    assert(popup.autoHide.closed || popup.autoHide.hoverGuard || popup.autoHide.focusGuard,
      `control popup did not auto-hide: ${JSON.stringify(popup.autoHide)}`);

    const blankLocal = {
      x: Math.max(48, Math.min(enabled.viewport.width - 48, enabled.viewport.width * 0.52)),
      y: Math.max(48, Math.min(enabled.viewport.height - 48, enabled.viewport.height * 0.44)),
    };
    const blankPhysical = localPointToPhysical(blankLocal, enabled.status, enabled.viewport);
    const handlePhysical = localPointToPhysical({
      x: enabled.handle.rect.left + enabled.handle.rect.width / 2,
      y: enabled.handle.rect.top + enabled.handle.rect.height / 2,
    }, enabled.status, enabled.viewport);
    const firstIconRect = Array.isArray(enabled.status.iconRevealRects)
      ? enabled.status.iconRevealRects.find((rect) => rect && rect.width > 8 && rect.height > 8)
      : null;
    assert(firstIconRect, 'native Explorer icon geometry was not exposed by the layered guard');
    const iconPhysical = localPointToPhysical({
      x: Number(firstIconRect.x) + Number(firstIconRect.width) / 2,
      y: Number(firstIconRect.y) + Number(firstIconRect.height) / 2,
    }, enabled.status, enabled.viewport);
    const iconHit = windowChainAt(iconPhysical.x, iconPhysical.y, enabled.status.parentWindowId);
    assert(iconHit.some((item) => item.className === 'SysListView32'),
      `real Explorer icon did not remain above Mineradio: ${JSON.stringify(iconHit)}`);

    const naturalInputStatus = await setPointerRoute(client, { overSoftwareUi: false, overDesktopControls: false });
    assert.deepEqual(naturalInputStatus.pointerRoute, { overSoftwareUi: false, overDesktopControls: false });
    assert.equal(naturalInputStatus.ignoreMouseEvents, false,
      'unlocked blank area incorrectly disabled the complete Mineradio input surface');
    const naturalInputHit = windowChainAt(blankPhysical.x, blankPhysical.y, enabled.status.parentWindowId);
    const controllerStatus = await setPointerRoute(client, { overSoftwareUi: false, overDesktopControls: true });
    assert.deepEqual(controllerStatus.pointerRoute, { overSoftwareUi: false, overDesktopControls: true });
    assert.equal(controllerStatus.ignoreMouseEvents, false);
    const controllerHit = windowChainAt(handlePhysical.x, handlePhysical.y, enabled.status.parentWindowId);
    await setPointerRoute(client, { overSoftwareUi: false, overDesktopControls: false });

    const routeMatrix = [];
    for (const route of [
      { overSoftwareUi: false, overDesktopControls: false },
      { overSoftwareUi: true, overDesktopControls: false },
      { overSoftwareUi: false, overDesktopControls: true },
      { overSoftwareUi: true, overDesktopControls: true },
    ]) {
      const status = await setPointerRoute(client, route);
      assert.deepEqual(status.pointerRoute, route);
      assert.equal(status.softwareInteractionLocked, false);
      assert.equal(status.ignoreMouseEvents, false,
        `desktop pointer route unexpectedly disabled Mineradio input: ${JSON.stringify(route)}`);
      routeMatrix.push({ route, ignoreMouseEvents: status.ignoreMouseEvents });
    }
    await setPointerRoute(client, { overSoftwareUi: false, overDesktopControls: false });

    const lockedSoftware = await client.evaluate(`(async () => {
      const result = await setDesktopSoftwareInteractionLocked(true);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const status = (await desktopWindow.getWallpaperModeStatus()).status || {};
      const button = document.getElementById('desktop-software-lock-toggle');
      return {
        result,
        status,
        ariaChecked: button && button.getAttribute('aria-checked'),
        disabled: !!(button && button.disabled),
        bodyLocked: document.body.classList.contains('desktop-software-locked'),
      };
    })()`);
    assert.equal(lockedSoftware.result && lockedSoftware.result.ok, true, JSON.stringify(lockedSoftware, null, 2));
    assert.equal(lockedSoftware.status.softwareInteractionLocked, true);
    assert.equal(lockedSoftware.status.ignoreMouseEvents, true,
      'software lock did not pass normal desktop areas through to Explorer');
    assert.equal(lockedSoftware.ariaChecked, 'true');
    assert.equal(lockedSoftware.disabled, false, 'software lock disabled its own recovery switch');
    assert.equal(lockedSoftware.bodyLocked, true);

    const lockedController = await setPointerRoute(client, {
      overSoftwareUi: false,
      overDesktopControls: true,
    });
    assert.equal(lockedController.softwareInteractionLocked, true);
    assert.equal(lockedController.ignoreMouseEvents, false,
      'right-top recovery corridor did not restore input to the unlock switch');

    const unlockedSoftware = await client.evaluate(`(async () => {
      const result = await setDesktopSoftwareInteractionLocked(false);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const status = (await desktopWindow.getWallpaperModeStatus()).status || {};
      const button = document.getElementById('desktop-software-lock-toggle');
      return {
        result,
        status,
        ariaChecked: button && button.getAttribute('aria-checked'),
        disabled: !!(button && button.disabled),
        bodyLocked: document.body.classList.contains('desktop-software-locked'),
      };
    })()`);
    assert.equal(unlockedSoftware.result && unlockedSoftware.result.ok, true, JSON.stringify(unlockedSoftware, null, 2));
    assert.equal(unlockedSoftware.status.softwareInteractionLocked, false);
    assert.equal(unlockedSoftware.status.ignoreMouseEvents, false);
    assert.equal(unlockedSoftware.ariaChecked, 'false');
    assert.equal(unlockedSoftware.disabled, false);
    assert.equal(unlockedSoftware.bodyLocked, false);
    const unlockedBlank = await setPointerRoute(client, { overSoftwareUi: false, overDesktopControls: false });
    assert.equal(unlockedBlank.ignoreMouseEvents, false,
      'unlock did not restore natural Mineradio input outside the controller');
    const softwareLockCycle = { lockedSoftware, lockedController, unlockedSoftware, unlockedBlank };

    const hidden = await client.evaluate(`(async () => {
      const result = await setDesktopIconsVisibility(false);
      await new Promise((resolve) => setTimeout(resolve, 160));
      const status = (await desktopWindow.getWallpaperModeStatus()).status || {};
      const button = document.getElementById('desktop-icons-visible-toggle');
      return { result, status, ariaChecked: button.getAttribute('aria-checked'),
        bodyHidden: document.body.classList.contains('desktop-icons-hidden') };
    })()`);
    assert.equal(hidden.result && hidden.result.ok, true, JSON.stringify(hidden, null, 2));
    assert.equal(hidden.status.desktopIconsVisible, false);
    assert.equal(hidden.ariaChecked, 'false');
    assert.equal(hidden.bodyHidden, true);
    const nativeHidden = nativeExplorerSnapshot(baseline.handle);
    assert.equal(nativeHidden.visible, false, 'desktop icon switch did not hide the real Explorer list');
    assertExplorerLayeredColorKey(baseline, nativeHidden, 'desktop icon hide', {
      ignoreVisibility: true,
      ignoreVisibleStyleBit: true,
    });

    const shown = await client.evaluate(`(async () => {
      const result = await setDesktopIconsVisibility(true);
      await new Promise((resolve) => setTimeout(resolve, 160));
      const status = (await desktopWindow.getWallpaperModeStatus()).status || {};
      const button = document.getElementById('desktop-icons-visible-toggle');
      return { result, status, ariaChecked: button.getAttribute('aria-checked'),
        bodyHidden: document.body.classList.contains('desktop-icons-hidden') };
    })()`);
    assert.equal(shown.result && shown.result.ok, true, JSON.stringify(shown, null, 2));
    assert.equal(shown.status.desktopIconsVisible, true);
    assert.equal(shown.ariaChecked, 'true');
    assert.equal(shown.bodyHidden, false);
    const nativeShown = nativeExplorerSnapshot(baseline.handle);
    assert.equal(nativeShown.visible, true, 'desktop icon switch did not show the real Explorer list');
    assertExplorerLayeredColorKey(baseline, nativeShown, 'desktop icon show', {
      ignoreVisibility: baseline.visible !== true,
      ignoreVisibleStyleBit: baseline.visible !== true,
    });

    if (!baseline.visible) {
      const restoreHidden = await client.evaluate(`setDesktopIconsVisibility(false)`);
      assert.equal(restoreHidden && restoreHidden.ok, true, JSON.stringify(restoreHidden, null, 2));
      await sleep(160);
    }
    const restored = nativeExplorerSnapshot(baseline.handle);
    assertExplorerLayeredColorKey(baseline, restored, 'desktop icon visibility restore');
    iconsRestored = true;

    const finalRoute = await setPointerRoute(client, { overSoftwareUi: false, overDesktopControls: false });
    assert.deepEqual(finalRoute.pointerRoute, { overSoftwareUi: false, overDesktopControls: false });
    assert.equal(finalRoute.ignoreMouseEvents, false);

    const persistentHud = await client.evaluate(`(async () => {
      const bar = document.getElementById('bottom-bar');
      const home = document.getElementById('empty-home');
      if (!bar || !home) throw new Error('FULL_DESKTOP_PERSISTENT_HUD_MISSING');
      if (typeof setControlsHidden === 'function') setControlsHidden(true);
      if (typeof scheduleControlsHide === 'function') scheduleControlsHide(0);
      await new Promise((resolve) => setTimeout(resolve, 180));
      const visibleSurface = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden'
          && Number(style.opacity) > 0.05 && style.pointerEvents !== 'none'
          && rect.width > 1 && rect.height > 1;
      };
      return {
        bottomVisible: bar.classList.contains('visible')
          && !bar.classList.contains('soft-hidden') && visibleSurface(bar),
        bottomClass: bar.className,
        bottomOpacity: Number(getComputedStyle(bar).opacity),
        homeVisible: document.body.classList.contains('empty-home-active') && visibleSurface(home),
      };
    })()`);
    assert(persistentHud.bottomVisible || persistentHud.homeVisible,
      `full desktop lost its complete Mineradio HUD after the ordinary auto-hide path: ${JSON.stringify(persistentHud)}`);

    console.log(JSON.stringify({
      ok: true,
      architecture: 'explorer-layered-colorkey',
      explorer: {
        handle: baseline.handle,
        layeredColorKeyAppliedOnEnable: true,
        originalVisibility: baseline.visible,
        visibilityRestored: true,
        fieldsChecked: [
          'style', 'layered exStyle/color-key', 'region', 'enabled',
          'backgroundColor', 'visibility', 'parent', 'process/thread identity',
        ],
      },
      controls: {
        iconSwitchAriaVerified: true,
        softwareLockControlRecoverable: true,
        clickOutsideCloseVerified: true,
        completeRendererBackgroundPreserved: true,
        persistentHudVerified: true,
        workAreaLayoutVerified: true,
        popupAnimationVerified: true,
        autoHideVerifiedOrNativeHoverGuarded: true,
      },
      inputPlumbing: {
        realExplorerIconHit: iconHit,
        unlockedNaturalInputHit: naturalInputHit,
        controllerHit,
        routeMatrix,
        softwareLockCycle,
        syntheticInputUsed: false,
      },
      helperWindowSafety: {
        terminalHostsBeforeEnable,
        terminalHostsAfterEnable,
        newTerminalHosts: newTerminalHosts(terminalHostsBeforeEnable, terminalHostsAfterEnable),
      },
      escapeShortcutRegistered: true,
      legacyCanvasTargetCount,
      manualHardwareChecksStillRequired: [
        'Use the real mouse to open, collapse, and reopen the top-right desktop controller.',
        'Lock Mineradio, move back into the top-right reveal corridor, and use the same switch to unlock it.',
        'Open the controller and click another desktop area to verify the panel closes immediately.',
        'Use the real mouse to toggle desktop icon visibility and verify the player stays operable.',
        'Use the real mouse to verify wallpaper parallax and the unchanged Windows cursor.',
        'Press the physical Esc key to causally verify immediate full-desktop exit.',
        'CDP/DOM evaluation and native hit-testing are plumbing checks, not causal proof of those hardware-input behaviors.',
      ],
      leftEnabled: leaveEnabled,
    }, null, 2));
  } finally {
    try {
      const baselineVisible = baseline ? baseline.visible === true : true;
      const cleanupStatus = await client.evaluate(`(async () => {
        let status = (await desktopWindow.getWallpaperModeStatus()).status || {};
        const active = status.enabled === true || status.active === true || status.attaching === true;
        if (active) {
          try { await setDesktopIconsVisibility(${baselineVisible}); } catch (_) { }
          try { desktopWindow.updateDesktopPointerRoute({ overSoftwareUi: false, overDesktopControls: true }); } catch (_) { }
          try { await desktopWindow.setDesktopSoftwareLocked(false); } catch (_) { }
          try { desktopWindow.updateDesktopPointerRoute({ overSoftwareUi: false, overDesktopControls: false }); } catch (_) { }
          if (!${leaveEnabled}) {
            fx.wallpaperMode = false;
            updateFxInputs();
            try { await applyWallpaperModeState(true); } catch (_) { }
          }
        }
        return (await desktopWindow.getWallpaperModeStatus()).status || {};
      })()`);
      if (leaveEnabled && enabledSuccessfully) {
        assert.equal(cleanupStatus.enabled, true, '--leave-enabled did not preserve full desktop mode');
        assert.equal(cleanupStatus.active, true, '--leave-enabled left an inactive desktop runtime');
      } else if (!leaveEnabled) {
        assert.notEqual(cleanupStatus.enabled, true, 'cleanup did not disable full desktop mode');
        assert.notEqual(cleanupStatus.active, true, 'cleanup left full desktop mode active');
        assert.notEqual(cleanupStatus.attaching, true, 'cleanup left full desktop mode attaching');
      }
      iconsRestored = !!baseline;
    } catch (_) { }

    try {
      if (baseline) {
        try {
          const nativeDeadline = Date.now() + 2400;
          let finalNative = null;
          let finalNativeError = null;
          do {
            await sleep(120);
            finalNative = nativeExplorerSnapshot(baseline.handle);
            try {
              if (leaveEnabled && enabledSuccessfully) {
                assertExplorerLayeredColorKey(baseline, finalNative, 'leave-enabled cleanup');
              } else {
                assertExplorerUntouched(baseline, finalNative, 'desktop-mode cleanup');
              }
              finalNativeError = null;
              break;
            } catch (error) {
              finalNativeError = error;
            }
          } while (Date.now() < nativeDeadline);
          if (finalNativeError) {
            throw finalNativeError;
          }
          iconsRestored = true;
        } catch (error) {
          if (process.exitCode !== 1) throw error;
        }
      }
    } finally {
      client.close();
    }
    void iconsRestored;
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
