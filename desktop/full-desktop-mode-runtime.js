'use strict';

const { execFile } = require('child_process');
const {
  attachWallpaperWindowToDesktop,
  nativeWindowHandleDecimal,
} = require('./wallpaper-mode-runtime');
const {
  applyDesktopIconShape,
  clearDesktopIconShape,
  physicalIconRectsToDisplayDip,
  probeDesktopIcons,
} = require('./desktop-icon-shape-runtime');
const { startNativeDesktopIconLayer } = require('./desktop-native-icon-layer-runtime');

const ICON_HOST_RECOVERY_CIRCUIT_WINDOW_MS = 12000;
const ICON_HOST_RECOVERY_CIRCUIT_LIMIT = 2;
const ICON_HOST_RECOVERY_STABLE_MS = 10000;

function normalizeBounds(value, fallback = {}) {
  const source = value && typeof value === 'object' ? value : fallback;
  return {
    x: Math.round(Number(source.x) || 0),
    y: Math.round(Number(source.y) || 0),
    width: Math.max(1, Math.round(Number(source.width) || 1)),
    height: Math.max(1, Math.round(Number(source.height) || 1)),
  };
}

function workAreaSafeInsets(boundsValue, workAreaValue) {
  const bounds = normalizeBounds(boundsValue);
  const workArea = normalizeBounds(workAreaValue, bounds);
  return {
    top: Math.max(0, workArea.y - bounds.y),
    right: Math.max(0, bounds.x + bounds.width - workArea.x - workArea.width),
    bottom: Math.max(0, bounds.y + bounds.height - workArea.y - workArea.height),
    left: Math.max(0, workArea.x - bounds.x),
  };
}

function safeCall(target, method, fallback, ...args) {
  if (!target || typeof target[method] !== 'function') return fallback;
  try {
    const value = target[method](...args);
    return typeof value === 'undefined' ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function desktopWindowDetachScript(input = {}) {
  const hwnd = String(input.hwnd || '');
  if (!/^\d+$/.test(hwnd)) throw new Error('FULL_DESKTOP_NATIVE_HANDLE_INVALID');
  const x = Math.round(Number(input.x) || 0);
  const y = Math.round(Number(input.y) || 0);
  const width = Math.max(1, Math.round(Number(input.width) || 1));
  const height = Math.max(1, Math.round(Number(input.height) || 1));
  return `
$ErrorActionPreference = "Stop"
if (-not ("MineradioFullDesktopNative" -as [type])) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class MineradioFullDesktopNative {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr GetParent(IntPtr child);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW", SetLastError=true)] private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int index);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW", SetLastError=true)] private static extern IntPtr GetWindowLong32(IntPtr hWnd, int index);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW", SetLastError=true)] private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int index, IntPtr value);
  [DllImport("user32.dll", EntryPoint="SetWindowLongW", SetLastError=true)] private static extern IntPtr SetWindowLong32(IntPtr hWnd, int index, IntPtr value);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);
  public static IntPtr GetWindowLongPtr(IntPtr hWnd, int index) { return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, index) : GetWindowLong32(hWnd, index); }
  public static IntPtr SetWindowLongPtr(IntPtr hWnd, int index, IntPtr value) { return IntPtr.Size == 8 ? SetWindowLongPtr64(hWnd, index, value) : SetWindowLong32(hWnd, index, value); }
}
"@
}
$previousDpiContext = [IntPtr]::Zero
try {
  try { $previousDpiContext = [MineradioFullDesktopNative]::SetThreadDpiAwarenessContext([IntPtr]::new([Int64]-4)) } catch { }
  $target = [IntPtr]::new([Int64]${hwnd})
  if (-not [MineradioFullDesktopNative]::IsWindow($target)) { throw "FULL_DESKTOP_TARGET_NOT_FOUND" }
  [MineradioFullDesktopNative]::SetParent($target, [IntPtr]::Zero) | Out-Null
  $GWL_STYLE = -16
  $WS_POPUP = [Int64]0x80000000
  $WS_CHILD = [Int64]0x40000000
  $style = [MineradioFullDesktopNative]::GetWindowLongPtr($target, $GWL_STYLE).ToInt64()
  $topLevelStyle = ($style -band (-bnot $WS_CHILD)) -bor $WS_POPUP
  [MineradioFullDesktopNative]::SetWindowLongPtr($target, $GWL_STYLE, [IntPtr]::new([Int64]$topLevelStyle)) | Out-Null
  $verifiedStyle = [MineradioFullDesktopNative]::GetWindowLongPtr($target, $GWL_STYLE).ToInt64()
  if (($verifiedStyle -band $WS_CHILD) -ne 0 -or ($verifiedStyle -band $WS_POPUP) -eq 0) { throw "FULL_DESKTOP_TOPLEVEL_STYLE_FAILED" }
  # SetParent(NULL) temporarily reports the desktop HWND while WS_CHILD is
  # still set. Validate the parent only after converting to WS_POPUP.
  $parent = [MineradioFullDesktopNative]::GetParent($target)
  if ($parent -ne [IntPtr]::Zero) { throw "FULL_DESKTOP_DETACH_FAILED" }
  if (-not [MineradioFullDesktopNative]::SetWindowPos($target, [IntPtr]::Zero, ${x}, ${y}, ${width}, ${height}, 0x0030)) { throw "FULL_DESKTOP_POSITION_FAILED" }
  $rect = New-Object MineradioFullDesktopNative+RECT
  if (-not [MineradioFullDesktopNative]::GetWindowRect($target, [ref]$rect)) { throw "FULL_DESKTOP_BOUNDS_ACK_FAILED" }
  $actualWidth = $rect.Right - $rect.Left
  $actualHeight = $rect.Bottom - $rect.Top
  if ($actualWidth -le 0 -or $actualHeight -le 0) { throw "FULL_DESKTOP_BOUNDS_ACK_FAILED" }
  if ([Math]::Abs($actualWidth - ${width}) -gt 16 -or [Math]::Abs($actualHeight - ${height}) -gt 16) { throw "FULL_DESKTOP_BOUNDS_ACK_FAILED" }
  [pscustomobject]@{
    ok = $true
    targetWindowId = $target.ToInt64().ToString()
    parentWindowId = "0"
    parentClassName = ""
    style = $verifiedStyle.ToString()
    child = $false
    popup = $true
    x = ${x}
    y = ${y}
    width = ${width}
    height = ${height}
    actualBounds = [pscustomobject]@{ x = $rect.Left; y = $rect.Top; width = $actualWidth; height = $actualHeight }
  } | ConvertTo-Json -Compress
} finally {
  if ($previousDpiContext -ne [IntPtr]::Zero) {
    try { [MineradioFullDesktopNative]::SetThreadDpiAwarenessContext($previousDpiContext) | Out-Null } catch { }
  }
}
`;
}

function desktopWindowCoexistAttachScript(input = {}) {
  const hwnd = String(input.hwnd || '');
  if (!/^\d+$/.test(hwnd)) throw new Error('FULL_DESKTOP_NATIVE_HANDLE_INVALID');
  const x = Math.round(Number(input.x) || 0);
  const y = Math.round(Number(input.y) || 0);
  const width = Math.max(1, Math.round(Number(input.width) || 1));
  const height = Math.max(1, Math.round(Number(input.height) || 1));
  return `
$ErrorActionPreference = "Stop"
if (-not ("MineradioDesktopCoexistNative" -as [type])) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class MineradioDesktopCoexistNative {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr GetParent(IntPtr child);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string className, string title);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW", SetLastError=true)] private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int index);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW", SetLastError=true)] private static extern IntPtr GetWindowLong32(IntPtr hWnd, int index);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW", SetLastError=true)] private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int index, IntPtr value);
  [DllImport("user32.dll", EntryPoint="SetWindowLongW", SetLastError=true)] private static extern IntPtr SetWindowLong32(IntPtr hWnd, int index, IntPtr value);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);
  public static IntPtr GetWindowLongPtr(IntPtr hWnd, int index) { return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, index) : GetWindowLong32(hWnd, index); }
  public static IntPtr SetWindowLongPtr(IntPtr hWnd, int index, IntPtr value) { return IntPtr.Size == 8 ? SetWindowLongPtr64(hWnd, index, value) : SetWindowLong32(hWnd, index, value); }
  public static bool FindDesktopIconHost(out IntPtr host, out IntPtr defView, out IntPtr listView, out string hostClass) {
    IntPtr foundHost = IntPtr.Zero;
    IntPtr foundDefView = IntPtr.Zero;
    IntPtr foundList = IntPtr.Zero;
    string foundClass = "";
    EnumWindows(delegate(IntPtr candidate, IntPtr unused) {
      IntPtr view = FindWindowEx(candidate, IntPtr.Zero, "SHELLDLL_DefView", null);
      if (view == IntPtr.Zero) return true;
      IntPtr list = FindWindowEx(view, IntPtr.Zero, "SysListView32", null);
      if (list == IntPtr.Zero) return true;
      StringBuilder className = new StringBuilder(128);
      GetClassName(candidate, className, className.Capacity);
      foundHost = candidate;
      foundDefView = view;
      foundList = list;
      foundClass = className.ToString();
      return false;
    }, IntPtr.Zero);
    host = foundHost;
    defView = foundDefView;
    listView = foundList;
    hostClass = foundClass;
    return host != IntPtr.Zero && defView != IntPtr.Zero && listView != IntPtr.Zero;
  }
}
"@
}
$previousDpiContext = [IntPtr]::Zero
try {
  try { $previousDpiContext = [MineradioDesktopCoexistNative]::SetThreadDpiAwarenessContext([IntPtr]::new([Int64]-4)) } catch { }
  $target = [IntPtr]::new([Int64]${hwnd})
  if (-not [MineradioDesktopCoexistNative]::IsWindow($target)) { throw "FULL_DESKTOP_TARGET_NOT_FOUND" }
  $iconHost = [IntPtr]::Zero
  $defView = [IntPtr]::Zero
  $listView = [IntPtr]::Zero
  $hostClass = ""
  if (-not [MineradioDesktopCoexistNative]::FindDesktopIconHost([ref]$iconHost, [ref]$defView, [ref]$listView, [ref]$hostClass)) {
    throw "FULL_DESKTOP_ICON_HOST_NOT_FOUND"
  }
  $parentRect = New-Object MineradioDesktopCoexistNative+RECT
  if (-not [MineradioDesktopCoexistNative]::GetWindowRect($defView, [ref]$parentRect)) { throw "FULL_DESKTOP_ICON_HOST_BOUNDS_FAILED" }
  $GWL_STYLE = -16
  $WS_POPUP = [Int64]0x80000000
  $WS_CHILD = [Int64]0x40000000
  $style = [MineradioDesktopCoexistNative]::GetWindowLongPtr($target, $GWL_STYLE).ToInt64()
  $childStyle = ($style -band (-bnot $WS_POPUP)) -bor $WS_CHILD
  [MineradioDesktopCoexistNative]::SetWindowLongPtr($target, $GWL_STYLE, [IntPtr]::new([Int64]$childStyle)) | Out-Null
  [MineradioDesktopCoexistNative]::SetParent($target, $defView) | Out-Null
  $verifiedStyle = [MineradioDesktopCoexistNative]::GetWindowLongPtr($target, $GWL_STYLE).ToInt64()
  if (($verifiedStyle -band $WS_CHILD) -eq 0 -or ($verifiedStyle -band $WS_POPUP) -ne 0) { throw "FULL_DESKTOP_ICON_HOST_STYLE_FAILED" }
  if ([MineradioDesktopCoexistNative]::GetParent($target) -ne $defView) { throw "FULL_DESKTOP_ICON_HOST_ATTACH_FAILED" }
  $localX = ${x} - $parentRect.Left
  $localY = ${y} - $parentRect.Top
  # Keep the one complete Mineradio surface below Explorer's real SysListView32.
  # The native icon layer makes Explorer's black background transparent while
  # retaining the real icon pixels and their native hit testing above Mineradio.
  if (-not [MineradioDesktopCoexistNative]::SetWindowPos($target, [IntPtr]::new(1), $localX, $localY, ${width}, ${height}, 0x0030)) {
    throw "FULL_DESKTOP_ICON_HOST_POSITION_FAILED"
  }
  $rect = New-Object MineradioDesktopCoexistNative+RECT
  if (-not [MineradioDesktopCoexistNative]::GetWindowRect($target, [ref]$rect)) { throw "FULL_DESKTOP_ICON_HOST_BOUNDS_ACK_FAILED" }
  $actualWidth = $rect.Right - $rect.Left
  $actualHeight = $rect.Bottom - $rect.Top
  if ([Math]::Abs($rect.Left - ${x}) -gt 16 -or [Math]::Abs($rect.Top - ${y}) -gt 16 -or [Math]::Abs($actualWidth - ${width}) -gt 16 -or [Math]::Abs($actualHeight - ${height}) -gt 16) {
    throw "FULL_DESKTOP_ICON_HOST_BOUNDS_ACK_FAILED"
  }
  [pscustomobject]@{
    ok = $true
    coexist = $true
    targetWindowId = $target.ToInt64().ToString()
    parentWindowId = $defView.ToInt64().ToString()
    parentClassName = "SHELLDLL_DefView"
    topLevelHostWindowId = $iconHost.ToInt64().ToString()
    desktopViewWindowId = $defView.ToInt64().ToString()
    desktopListWindowId = $listView.ToInt64().ToString()
    style = $verifiedStyle.ToString()
    child = $true
    popup = $false
    actualBounds = [pscustomobject]@{ x = $rect.Left; y = $rect.Top; width = $actualWidth; height = $actualHeight }
  } | ConvertTo-Json -Compress
} finally {
  if ($previousDpiContext -ne [IntPtr]::Zero) {
    try { [MineradioDesktopCoexistNative]::SetThreadDpiAwarenessContext($previousDpiContext) | Out-Null } catch { }
  }
}
`;
}

function parseDesktopCoexistAck(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index]);
      const actual = value && value.actualBounds;
      if (value && value.ok === true && value.coexist === true
        && /^\d+$/.test(String(value.parentWindowId || '')) && String(value.parentWindowId) !== '0'
        && /^\d+$/.test(String(value.desktopViewWindowId || '')) && String(value.desktopViewWindowId) !== '0'
        && /^\d+$/.test(String(value.desktopListWindowId || ''))
        && /^\d+$/.test(String(value.topLevelHostWindowId || '')) && String(value.topLevelHostWindowId) !== '0'
        && value.child === true && value.popup === false
        && actual && Number(actual.width) > 0 && Number(actual.height) > 0) return value;
    } catch (_) { }
  }
  throw new Error('FULL_DESKTOP_ICON_HOST_ACK_INVALID');
}

function parseDesktopNativeAck(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index]);
      const actual = value && value.actualBounds;
      if (value && value.ok === true && String(value.parentWindowId) === '0'
        && value.child === false && value.popup === true
        && actual && Number(actual.width) > 0 && Number(actual.height) > 0) return value;
    } catch (_) { }
  }
  throw new Error('FULL_DESKTOP_DETACH_ACK_INVALID');
}

function nativeFailureCode(error, stderr, fallback) {
  const diagnostic = String(stderr || error && error.message || fallback);
  const code = diagnostic.match(/(?:FULL_DESKTOP|WALLPAPER)_[A-Z0-9_]+/);
  if (code) return code[0];
  const processCode = String(error && error.code || '');
  return /^(?:FULL_DESKTOP|WALLPAPER)_[A-Z0-9_]+$/.test(processCode) ? processCode : String(fallback);
}

function attachDesktopWindowForCoexistence(options = {}) {
  const execFileImpl = options.execFileImpl;
  if (typeof execFileImpl !== 'function') return Promise.reject(new Error('FULL_DESKTOP_EXEC_UNAVAILABLE'));
  let script;
  try {
    script = desktopWindowCoexistAttachScript(options);
  } catch (error) {
    return Promise.reject(error);
  }
  const env = { ...process.env };
  const nativeTempPath = String(options.nativeTempPath || '').trim();
  if (nativeTempPath) {
    env.TEMP = nativeTempPath;
    env.TMP = nativeTempPath;
  }
  return new Promise((resolve, reject) => {
    const signal = options.signal;
    let child = null;
    let settled = false;
    const cleanup = () => {
      if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', handleAbort);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const handleAbort = () => {
      if (settled) return;
      try { if (child && typeof child.kill === 'function') child.kill(); } catch (_) { }
      const error = new Error('FULL_DESKTOP_ICON_HOST_ATTACH_ABORTED');
      error.code = error.message;
      fail(error);
    };
    if (signal && signal.aborted) return handleAbort();
    if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', handleAbort, { once: true });
    try {
      child = execFileImpl('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        windowsHide: true,
        timeout: Math.max(1000, Math.min(15000, Number(options.timeoutMs) || 5000)),
        maxBuffer: 128 * 1024,
        env,
      }, (error, stdout, stderr) => {
        if (settled) return;
        if (error) {
          const failure = new Error(nativeFailureCode(error, stderr, 'FULL_DESKTOP_ICON_HOST_ATTACH_FAILED'));
          failure.code = failure.message;
          fail(failure);
          return;
        }
        try {
          const ack = parseDesktopCoexistAck(stdout);
          if (String(ack.targetWindowId) !== String(options.hwnd)) throw new Error('FULL_DESKTOP_ICON_HOST_ACK_INVALID');
          settled = true;
          cleanup();
          resolve(ack);
        } catch (parseError) {
          fail(parseError);
        }
      });
    } catch (error) {
      fail(error);
    }
  });
}

function detachDesktopWindowToTopLevel(options = {}) {
  const execFileImpl = options.execFileImpl;
  if (typeof execFileImpl !== 'function') return Promise.reject(new Error('FULL_DESKTOP_EXEC_UNAVAILABLE'));
  let script;
  try {
    script = desktopWindowDetachScript(options);
  } catch (error) {
    return Promise.reject(error);
  }
  const env = { ...process.env };
  const nativeTempPath = String(options.nativeTempPath || '').trim();
  if (nativeTempPath) {
    env.TEMP = nativeTempPath;
    env.TMP = nativeTempPath;
  }
  return new Promise((resolve, reject) => {
    const signal = options.signal;
    let child = null;
    let settled = false;
    const cleanup = () => {
      if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', handleAbort);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const handleAbort = () => {
      if (settled) return;
      try { if (child && typeof child.kill === 'function') child.kill(); } catch (_) { }
      const error = new Error('FULL_DESKTOP_NATIVE_DETACH_ABORTED');
      error.code = error.message;
      fail(error);
    };
    if (signal && signal.aborted) return handleAbort();
    if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', handleAbort, { once: true });
    try {
      child = execFileImpl('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        windowsHide: true,
        timeout: Math.max(1000, Math.min(15000, Number(options.timeoutMs) || 5000)),
        maxBuffer: 128 * 1024,
        env,
      }, (error, stdout, stderr) => {
        if (settled) return;
        if (error) {
          const failure = new Error(nativeFailureCode(error, stderr, 'FULL_DESKTOP_DETACH_FAILED'));
          failure.code = failure.message;
          fail(failure);
          return;
        }
        try {
          const ack = parseDesktopNativeAck(stdout);
          if (String(ack.targetWindowId) !== String(options.hwnd)) throw new Error('FULL_DESKTOP_DETACH_ACK_INVALID');
          settled = true;
          cleanup();
          resolve(ack);
        } catch (parseError) {
          fail(parseError);
        }
      });
    } catch (error) {
      fail(error);
    }
  });
}

function captureBrowserWindowState(win, screen) {
  const rawBounds = normalizeBounds(safeCall(win, 'getBounds', null));
  const normalValue = safeCall(win, 'getNormalBounds', null);
  const bounds = normalValue && Number(normalValue.width) > 0 && Number(normalValue.height) > 0
    ? normalizeBounds(normalValue, rawBounds)
    : rawBounds;
  let display = null;
  try {
    if (screen && typeof screen.getDisplayMatching === 'function') display = screen.getDisplayMatching(bounds);
    if (!display && screen && typeof screen.getPrimaryDisplay === 'function') display = screen.getPrimaryDisplay();
  } catch (_) { }
  let physicalBounds = { ...bounds };
  try {
    if (screen && typeof screen.dipToScreenRect === 'function') physicalBounds = normalizeBounds(screen.dipToScreenRect(null, bounds), bounds);
  } catch (_) { }
  return {
    bounds,
    rawBounds,
    physicalBounds,
    displayId: String(display && display.id != null ? display.id : ''),
    maximized: safeCall(win, 'isMaximized', false) === true,
    fullScreen: safeCall(win, 'isFullScreen', false) === true,
    minimized: safeCall(win, 'isMinimized', false) === true,
    visible: safeCall(win, 'isVisible', true) !== false,
    focused: safeCall(win, 'isFocused', false) === true,
    resizable: safeCall(win, 'isResizable', true) !== false,
    movable: safeCall(win, 'isMovable', true) !== false,
    focusable: safeCall(win, 'isFocusable', true) !== false,
    hasShadow: safeCall(win, 'hasShadow', true) !== false,
    backgroundThrottling: safeCall(win && win.webContents, 'getBackgroundThrottling', true) !== false,
    minimumSize: safeCall(win, 'getMinimumSize', null),
    maximumSize: safeCall(win, 'getMaximumSize', null),
  };
}

class FullDesktopModeRuntime {
  constructor(options = {}) {
    if (!options.screen) throw new Error('FULL_DESKTOP_SCREEN_REQUIRED');
    this.screen = options.screen;
    this.platform = options.platform || process.platform;
    this.execFileImpl = options.execFileImpl || execFile;
    this.nativeTempPath = String(options.nativeTempPath || '');
    this.attachTimeoutMs = options.attachTimeoutMs;
    this.detachTimeoutMs = options.detachTimeoutMs;
    this.attachNative = typeof options.attachNative === 'function'
      ? options.attachNative
      : (input) => attachWallpaperWindowToDesktop({
        ...input,
        execFileImpl: this.execFileImpl,
        nativeTempPath: this.nativeTempPath,
        timeoutMs: this.attachTimeoutMs,
      });
    this.attachCoexistNative = typeof options.attachCoexistNative === 'function'
      ? options.attachCoexistNative
      : (input) => attachDesktopWindowForCoexistence({
        ...input,
        execFileImpl: this.execFileImpl,
        nativeTempPath: this.nativeTempPath,
        timeoutMs: this.attachTimeoutMs,
      });
    this.detachNative = typeof options.detachNative === 'function'
      ? options.detachNative
      : (input) => detachDesktopWindowToTopLevel({
        ...input,
        execFileImpl: this.execFileImpl,
        nativeTempPath: this.nativeTempPath,
        timeoutMs: this.detachTimeoutMs,
      });
    this.beforePassive = typeof options.beforePassive === 'function'
      ? options.beforePassive
      : null;
    this.requestReconcile = typeof options.requestReconcile === 'function'
      ? options.requestReconcile
      : null;
    this.probeDesktopIconsImpl = typeof options.probeDesktopIcons === 'function'
      ? options.probeDesktopIcons
      : (input) => probeDesktopIcons({
        ...input,
        execFileImpl: this.execFileImpl,
        nativeTempPath: this.nativeTempPath,
      });
    this.startDesktopIconWatcherImpl = typeof options.startDesktopIconWatcher === 'function'
      ? options.startDesktopIconWatcher
      : (input) => startNativeDesktopIconLayer({
        ...input,
        nativeTempPath: this.nativeTempPath,
      });
    this.applyDesktopIconShapeImpl = typeof options.applyDesktopIconShape === 'function'
      ? options.applyDesktopIconShape
      : applyDesktopIconShape;
    this.clearDesktopIconShapeImpl = typeof options.clearDesktopIconShape === 'function'
      ? options.clearDesktopIconShape
      : clearDesktopIconShape;
    this.listeners = new Set();
    if (typeof options.onStatus === 'function') this.listeners.add(options.onStatus);
    this.window = null;
    this.nativeWindowId = '';
    this.snapshot = null;
    this.attachment = null;
    this.enabled = false;
    this.interactive = false;
    this.disposed = false;
    this.busy = false;
    this.phase = 'disabled';
    this.lastError = '';
    this.generation = 0;
    this.disposeRequested = false;
    this.queue = Promise.resolve();
    this.nativeAbortController = null;
    this.iconShapeActive = false;
    this.iconShapeCount = 0;
    this.iconShapeRectCount = 0;
    this.iconShapeError = '';
    this.iconShapeLayout = null;
    this.iconRevealRects = [];
    this.iconLayerMode = '';
    this.iconShieldWindowId = '0';
    this.iconShapeShields = [];
    this.iconShapeShieldViewport = null;
    this.iconShapeWatcher = null;
    this.iconShapeStopRequested = new WeakSet();
    this.iconLayerRestoreUnconfirmed = false;
    this.iconShapeProbeAbortController = null;
    this.iconShapeReconcileQueued = false;
    this.iconShapeReconcileTimer = null;
    this.iconHostRecoveryEvents = [];
    this.iconHostRecoveryStableTimer = null;
    this.softwareInteractionLocked = false;
    this.iconInteractionLocked = false;
    this.iconInteractionLockError = '';
    this.desktopIconsVisible = true;
    this.desktopIconsVisibilityExplicit = false;
    this.pointerRoute = {
      overSoftwareUi: false,
      overDesktopControls: false,
    };
    this.pointerIgnoreMouseEvents = null;
  }

  isSupported() {
    return this.platform === 'win32';
  }

  isEnabled() {
    return this.enabled === true;
  }

  isInteractive() {
    return this.enabled === true && this.interactive === true;
  }

  isWindowAlive(win = this.window) {
    return !!(win && (typeof win.isDestroyed !== 'function' || !win.isDestroyed()));
  }

  onStatus(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(reason = '') {
    return {
      ok: !this.lastError,
      supported: this.isSupported(),
      enabled: this.enabled === true,
      active: this.enabled === true && this.isWindowAlive(),
      embedded: this.enabled === true && this.interactive !== true && !!this.attachment,
      coexisting: this.enabled === true && this.interactive === true
        && !!this.attachment && this.attachment.kind === 'icon-host',
      interactive: this.enabled === true && this.interactive === true,
      nativeStateKnown: this.phase !== 'error-unknown-native-state'
        && this.iconLayerRestoreUnconfirmed !== true,
      busy: this.busy,
      attaching: this.phase === 'enabling' || this.phase === 'attaching'
        || this.phase === 'detaching' || this.phase === 'disabling',
      phase: this.phase,
      generation: this.generation,
      windowId: this.window && typeof this.window.id !== 'undefined' ? this.window.id : null,
      nativeWindowId: this.nativeWindowId || this.attachment && this.attachment.targetWindowId || '',
      parentWindowId: this.attachment && this.attachment.parentWindowId || '',
      parentClassName: this.attachment && this.attachment.parentClassName || '',
      displayId: this.attachment && this.attachment.displayId || this.snapshot && this.snapshot.displayId || '',
      bounds: this.attachment && this.attachment.bounds || null,
      physicalBounds: this.attachment && this.attachment.physicalBounds || null,
      workArea: this.attachment && this.attachment.workArea || null,
      safeInsets: this.attachment && this.attachment.safeInsets || null,
      desktopViewWindowId: this.attachment && this.attachment.desktopViewWindowId || '',
      desktopListWindowId: this.attachment && this.attachment.desktopListWindowId || '',
      iconLayerMode: this.iconLayerMode || '',
      iconShieldWindowId: this.iconShieldWindowId || '0',
      iconShapeActive: this.iconShapeActive === true,
      iconCount: Math.max(0, Number(this.iconShapeCount) || 0),
      iconShapeRectCount: Math.max(0, Number(this.iconShapeRectCount) || 0),
      iconShapeError: String(this.iconShapeError || ''),
      iconLayerRestoreUnconfirmed: this.iconLayerRestoreUnconfirmed === true,
      softwareInteractionLocked: this.softwareInteractionLocked === true,
      iconInteractionLocked: this.softwareInteractionLocked === true,
      iconInteractionLockError: String(this.iconInteractionLockError || ''),
      softwareInteractionLockError: String(this.iconInteractionLockError || ''),
      desktopIconsVisible: this.desktopIconsVisible !== false,
      ignoreMouseEvents: this.pointerIgnoreMouseEvents === true,
      pointerRoute: { ...this.pointerRoute },
      iconRevealRects: this.iconRevealRects.map((rect) => ({ ...rect })),
      lastError: this.lastError,
      reason: String(reason || ''),
    };
  }

  emitStatus(reason) {
    const status = this.getStatus(reason);
    for (const listener of this.listeners) {
      try { listener(status); } catch (_) { }
    }
    return status;
  }

  enqueue(label, job) {
    const run = async () => {
      this.busy = true;
      try {
        return await job();
      } catch (error) {
        this.lastError = String(error && error.message || 'FULL_DESKTOP_OPERATION_FAILED');
        this.phase = 'error';
        return { ok: false, enabled: this.enabled, interactive: this.interactive, error: this.lastError, status: this.emitStatus(label + '-failed') };
      } finally {
        this.busy = false;
      }
    };
    const pending = this.queue.then(run, run);
    this.queue = pending.catch(() => {});
    return pending;
  }

  abortNative() {
    const controller = this.nativeAbortController;
    if (controller && typeof controller.abort === 'function') {
      try { controller.abort(); } catch (_) { }
    }
  }

  abortIconShapeProbe() {
    const controller = this.iconShapeProbeAbortController;
    this.iconShapeProbeAbortController = null;
    if (controller && typeof controller.abort === 'function') {
      try { controller.abort(); } catch (_) { }
    }
  }

  requestIconShapeWatcherStop() {
    // disable()/dispose() call this before entering the serialized queue. If
    // enable is still waiting for the external watcher ACK, request its exact
    // visibility restore immediately so Escape is not trapped behind the full
    // ready timeout.
    const watcher = this.iconShapeWatcher;
    if (watcher && typeof watcher.stop === 'function') {
      this.iconShapeStopRequested.add(watcher);
      try {
        Promise.resolve(watcher.stop(2200)).catch(() => {});
      } catch (_) { }
    }
  }

  clearIconShapeState(win = this.window, options = {}) {
    const shouldClearWindow = options.clearWindow !== false;
    const needsNativeClear = shouldClearWindow && this.isWindowAlive(win)
      && (this.iconShapeActive === true || options.forceWindow === true);
    const result = needsNativeClear
      ? this.clearDesktopIconShapeImpl(win)
      : { ok: true, cleared: false };
    if (!result || result.ok !== true) {
      this.iconShapeError = String(result && result.error || 'DESKTOP_ICON_SHAPE_CLEAR_FAILED');
      return result || { ok: false, cleared: false, error: this.iconShapeError };
    }
    this.iconShapeActive = false;
    this.iconShapeCount = 0;
    this.iconShapeRectCount = 0;
    this.iconShapeLayout = null;
    this.iconRevealRects = [];
    this.iconLayerMode = '';
    this.iconShieldWindowId = '0';
    if (options.preserveShields !== true) {
      this.iconShapeShields = [];
      this.iconShapeShieldViewport = null;
    }
    if (options.preserveDesktopIconsVisible !== true) {
      this.desktopIconsVisible = true;
      this.desktopIconsVisibilityExplicit = false;
    }
    if (options.keepError !== true && !this.iconLayerRestoreUnconfirmed) this.iconShapeError = '';
    return result;
  }

  async stopIconShapeWatcher() {
    this.abortIconShapeProbe();
    this.cancelIconHostReconcile();
    const watcher = this.iconShapeWatcher;
    if (!watcher) {
      if (this.iconLayerRestoreUnconfirmed) {
        throw new Error('DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED');
      }
      return { ok: true, stopped: false, restored: true };
    }
    this.iconShapeStopRequested.add(watcher);
    try {
      const result = typeof watcher.stop === 'function'
        ? await watcher.stop(2200)
        : (typeof watcher.dispose === 'function' ? await watcher.dispose(2200) : null);
      if (!result || result.ok !== true || result.restored !== true) {
        const error = String(result && result.error || 'DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED');
        this.markIconLayerRestoreUnconfirmed(error);
        throw new Error(error);
      }
      if (this.iconShapeWatcher === watcher) this.iconShapeWatcher = null;
      this.iconShapeStopRequested.delete(watcher);
      this.clearIconLayerRestoreUnconfirmed();
      return result;
    } catch (error) {
      if (!this.iconShapeWatcher) this.iconShapeWatcher = watcher;
      const code = String(error && error.message || error || 'DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED');
      this.markIconLayerRestoreUnconfirmed(code);
      throw new Error(code);
    }
  }

  cancelIconHostReconcile() {
    if (this.iconShapeReconcileTimer) clearTimeout(this.iconShapeReconcileTimer);
    this.iconShapeReconcileTimer = null;
    this.iconShapeReconcileQueued = false;
  }

  clearIconLayerRestoreUnconfirmed() {
    const wasUnconfirmed = this.iconLayerRestoreUnconfirmed === true;
    const restoreError = String(this.iconShapeError || '');
    this.iconLayerRestoreUnconfirmed = false;
    if (wasUnconfirmed) {
      this.iconShapeError = '';
      if (this.lastError === restoreError) this.lastError = '';
      if (this.phase === 'error-unknown-native-state') {
        this.phase = this.enabled ? (this.interactive ? 'interactive' : 'passive') : 'disabled';
      }
    }
  }

  markIconLayerRestoreUnconfirmed(value = 'DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED') {
    const code = String(value || 'DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED');
    this.cancelIconHostReconcile();
    this.iconLayerRestoreUnconfirmed = true;
    this.iconShapeError = code;
    this.lastError = code;
    this.phase = 'error-unknown-native-state';
    if (this.isWindowAlive()) {
      safeCall(this.window, 'hide', null);
      safeCall(this.window, 'setIgnoreMouseEvents', null, true, { forward: false });
      safeCall(this.window, 'setFocusable', null, false);
    }
  }

  clearExitedIconLayerState(options = {}) {
    this.iconShapeActive = false;
    this.iconShapeCount = 0;
    this.iconShapeRectCount = 0;
    this.iconShapeLayout = null;
    this.iconRevealRects = [];
    this.iconLayerMode = '';
    this.iconShieldWindowId = '0';
    if (options.preserveShields !== true) {
      this.iconShapeShields = [];
      this.iconShapeShieldViewport = null;
    }
    if (options.preserveDesktopIconsVisible !== true) {
      this.desktopIconsVisible = true;
      this.desktopIconsVisibilityExplicit = false;
    }
  }

  shapeDisplayForWindow(win = this.window) {
    try { return this.displaySnapshot(win); } catch (_) { return null; }
  }

  physicalIconShieldsForDisplay(display) {
    if (!display || !display.bounds || !display.physicalBounds) return [];
    const viewport = this.iconShapeShieldViewport || display.bounds;
    const viewportWidth = Math.max(1, Number(viewport.width) || display.bounds.width);
    const viewportHeight = Math.max(1, Number(viewport.height) || display.bounds.height);
    const dipScaleX = display.bounds.width / viewportWidth;
    const dipScaleY = display.bounds.height / viewportHeight;
    const physicalScaleX = display.physicalBounds.width / Math.max(1, display.bounds.width);
    const physicalScaleY = display.physicalBounds.height / Math.max(1, display.bounds.height);
    return this.iconShapeShields.map((shield) => {
      const dipLeft = display.bounds.x + shield.x * dipScaleX;
      const dipTop = display.bounds.y + shield.y * dipScaleY;
      const dipRight = dipLeft + shield.width * dipScaleX;
      const dipBottom = dipTop + shield.height * dipScaleY;
      const left = Math.floor(display.physicalBounds.x + (dipLeft - display.bounds.x) * physicalScaleX);
      const top = Math.floor(display.physicalBounds.y + (dipTop - display.bounds.y) * physicalScaleY);
      const right = Math.ceil(display.physicalBounds.x + (dipRight - display.bounds.x) * physicalScaleX);
      const bottom = Math.ceil(display.physicalBounds.y + (dipBottom - display.bounds.y) * physicalScaleY);
      if (right <= left || bottom <= top) return null;
      return { x: left, y: top, width: right - left, height: bottom - top };
    }).filter(Boolean);
  }

  applyIconShapeLayout(win, display, layout, reason = 'icon-layout', strict = false) {
    if (this.iconLayerRestoreUnconfirmed) {
      const error = 'DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED';
      this.iconShapeError = error;
      if (strict) throw new Error(error);
      return { ok: false, applied: false, error };
    }
    if (!this.isWindowAlive(win) || !display || !layout || layout.ok !== true) {
      const error = 'DESKTOP_ICON_LAYOUT_INVALID';
      this.iconShapeError = error;
      if (strict) throw new Error(error);
      return { ok: false, applied: false, error };
    }
    const attachment = this.attachment;
    const expectedHost = String(attachment && attachment.topLevelHostWindowId || '');
    const actualHost = String(layout.topLevelHostWindowId || '');
    const expectedList = String(attachment && attachment.desktopListWindowId || '');
    const actualList = String(layout.listViewWindowId || '');
    if (!expectedHost || layout.nativeLayerApplied !== true
      || layout.nativeBackgroundKeyApplied !== true
      || layout.compositionMode !== 'layered-color-key'
      || (actualHost && actualHost !== expectedHost)
      || (expectedList && actualList && actualList !== expectedList)) {
      const error = 'DESKTOP_ICON_HOST_CHANGED';
      this.iconShapeError = error;
      if (strict) throw new Error(error);
      return { ok: false, applied: false, rebind: true, error };
    }
    let iconRects;
    try {
      iconRects = physicalIconRectsToDisplayDip(layout.icons || [], {
        bounds: display.bounds,
        physicalBounds: display.physicalBounds,
        paddingDip: 0,
        rounding: 'inward',
      });
    } catch (error) {
      const code = String(error && error.message || error || 'DESKTOP_ICON_SCALE_FAILED');
      this.iconShapeError = code;
      if (strict) throw error;
      return { ok: false, applied: false, error: code };
    }
    this.iconShapeLayout = layout;
    this.iconRevealRects = iconRects.map((rect) => ({
      x: rect.x - display.bounds.x,
      y: rect.y - display.bounds.y,
      width: rect.width,
      height: rect.height,
    }));
    this.iconShapeActive = true;
    this.iconShapeCount = iconRects.length;
    this.iconShapeRectCount = iconRects.length;
    this.iconLayerMode = 'explorer-layered-colorkey';
    this.iconShieldWindowId = String(layout.shieldWindowId || '0');
    if (typeof layout.desktopIconsVisible === 'boolean') {
      this.desktopIconsVisible = layout.desktopIconsVisible;
    } else if (typeof layout.iconsVisible === 'boolean') {
      this.desktopIconsVisible = layout.iconsVisible;
    }
    this.iconShapeError = '';
    return {
      ok: true,
      applied: true,
      iconCount: this.iconShapeCount,
      rectCount: this.iconShapeRectCount,
      reason: String(reason || ''),
    };
  }

  scheduleIconHostReconcile(reason = 'desktop-icon-host-changed') {
    if (this.iconShapeReconcileQueued || this.iconLayerRestoreUnconfirmed
      || !this.enabled || !this.interactive || this.disposeRequested) return;
    this.iconShapeReconcileQueued = true;
    this.iconShapeReconcileTimer = setTimeout(() => {
      this.iconShapeReconcileTimer = null;
      this.iconShapeReconcileQueued = false;
      if (this.iconLayerRestoreUnconfirmed || !this.enabled || !this.interactive || this.disposeRequested) return;
      const operation = this.requestReconcile
        ? this.requestReconcile(reason)
        : this.reconcile(reason);
      Promise.resolve(operation).catch(() => {});
    }, 180);
  }

  cancelIconHostReconcile() {
    if (this.iconShapeReconcileTimer) {
      clearTimeout(this.iconShapeReconcileTimer);
      this.iconShapeReconcileTimer = null;
    }
    this.iconShapeReconcileQueued = false;
  }

  cancelIconHostRecoveryStableTimer() {
    if (this.iconHostRecoveryStableTimer) {
      clearTimeout(this.iconHostRecoveryStableTimer);
      this.iconHostRecoveryStableTimer = null;
    }
  }

  clearIconHostRecoveryEvents() {
    this.iconHostRecoveryEvents = [];
  }

  recordIconHostRecoveryEvent(now = Date.now()) {
    const cutoff = now - ICON_HOST_RECOVERY_CIRCUIT_WINDOW_MS;
    this.iconHostRecoveryEvents = this.iconHostRecoveryEvents.filter((time) => time >= cutoff);
    this.iconHostRecoveryEvents.push(now);
    return this.iconHostRecoveryEvents.length;
  }

  armIconHostRecoveryStableTimer(watcher) {
    this.cancelIconHostRecoveryStableTimer();
    this.iconHostRecoveryStableTimer = setTimeout(() => {
      this.iconHostRecoveryStableTimer = null;
      if (this.iconShapeWatcher !== watcher || !this.enabled || !this.interactive || this.disposeRequested) return;
      if (watcher && typeof watcher.isRunning === 'function' && !watcher.isRunning()) return;
      this.clearIconHostRecoveryEvents();
    }, ICON_HOST_RECOVERY_STABLE_MS);
    if (this.iconHostRecoveryStableTimer && typeof this.iconHostRecoveryStableTimer.unref === 'function') {
      this.iconHostRecoveryStableTimer.unref();
    }
  }

  openIconHostRecoveryCircuit(reason = 'desktop-icon-watcher-restarted') {
    this.cancelIconHostReconcile();
    this.cancelIconHostRecoveryStableTimer();
    this.iconShapeError = 'DESKTOP_ICON_RECOVERY_CIRCUIT_OPEN';
    this.lastError = this.iconShapeError;
    this.phase = 'recovering-icon-layer';
    if (this.isWindowAlive()) safeCall(this.window, 'showInactive', null);
    this.generation += 1;
    this.emitStatus(reason + '-circuit-open');
    Promise.resolve().then(() => {
      this.disable(reason + '-circuit-open', this.iconShapeError).catch(() => {});
    });
  }

  handleWatchedIconLayout(layout) {
    if (this.iconLayerRestoreUnconfirmed || !this.enabled || !this.interactive || !this.isWindowAlive()) return;
    const display = this.shapeDisplayForWindow();
    const result = this.applyIconShapeLayout(this.window, display, layout, 'desktop-icons-changed', false);
    if (result && result.rebind === true) {
      return;
    }
    if (result && result.ok === true) {
      this.generation += 1;
      this.emitStatus('desktop-icons-changed');
    }
  }

  startIconShapeWatcher(display = this.shapeDisplayForWindow()) {
    if (this.iconLayerRestoreUnconfirmed) {
      throw new Error('DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED');
    }
    if (this.iconShapeWatcher || !this.enabled || !this.interactive) return this.iconShapeWatcher;
    if (!display || !this.attachment || !this.attachment.desktopViewWindowId
      || !this.attachment.desktopListWindowId) return null;
    let watcher = null;
    let watcherFailureCode = '';
    watcher = this.startDesktopIconWatcherImpl({
      debounceMs: 140,
      rebindMs: 2000,
      ownerProcessId: process.pid,
      physicalBounds: display.physicalBounds,
      iconHostWindowId: this.attachment.desktopViewWindowId,
      listViewWindowId: this.attachment.desktopListWindowId,
      mainWindowId: this.nativeWindowId || nativeWindowHandleDecimal(this.window),
      onLayout: (layout) => {
        if (this.iconShapeWatcher !== watcher) return;
        this.handleWatchedIconLayout(layout);
      },
      onError: (error) => {
        if (this.iconShapeWatcher !== watcher) return;
        this.iconShapeError = String(error && error.message || error || 'DESKTOP_ICON_WATCHER_FAILED');
        if (/DESKTOP_ICON_HOST_CHANGED/.test(this.iconShapeError)) watcherFailureCode = 'DESKTOP_ICON_HOST_CHANGED';
      },
      onExit: (details = {}) => {
        if (this.iconShapeWatcher !== watcher) return;
        this.cancelIconHostRecoveryStableTimer();
        const stopRequested = this.iconShapeStopRequested.has(watcher);
        if (details.restored !== true) {
          this.iconShapeStopRequested.delete(watcher);
          this.markIconLayerRestoreUnconfirmed('DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED');
          this.generation += 1;
          this.emitStatus('desktop-icon-layer-restore-unconfirmed');
          return;
        }
        this.iconShapeWatcher = null;
        this.iconShapeStopRequested.delete(watcher);
        this.clearIconLayerRestoreUnconfirmed();
        const shouldRebind = !stopRequested;
        this.clearExitedIconLayerState({
          preserveShields: shouldRebind,
          preserveDesktopIconsVisible: shouldRebind,
        });
        if (stopRequested) {
          // A requested native guard stop has already restored Explorer. The
          // child-process exit may race the stop() terminal ACK, so it must not
          // publish a synthetic error after an intentional transition.
          return;
        }
        if (!this.enabled || !this.interactive || this.disposeRequested) return;
        if (shouldRebind) {
          const recoveryReason = watcherFailureCode === 'DESKTOP_ICON_HOST_CHANGED'
            ? 'desktop-icon-host-changed'
            : 'desktop-icon-watcher-restarted';
          const recoveryEvents = this.recordIconHostRecoveryEvent();
          this.iconShapeError = watcherFailureCode || 'DESKTOP_ICON_WATCHER_EXITED';
          this.lastError = this.iconShapeError;
          this.phase = 'recovering-icon-layer';
          // Do not leave enabled=true/interative=true paired with a hidden
          // Mineradio HWND. Explorer has confirmed restoration, so keep the
          // existing renderer visible while the serialized rebind is queued.
          if (this.isWindowAlive()) safeCall(this.window, 'showInactive', null);
          this.generation += 1;
          if (recoveryEvents >= ICON_HOST_RECOVERY_CIRCUIT_LIMIT) {
            this.openIconHostRecoveryCircuit(recoveryReason);
            return;
          }
          this.emitStatus(recoveryReason + '-queued');
          this.scheduleIconHostReconcile(recoveryReason);
          return;
        }
      },
    });
    this.iconShapeWatcher = watcher;
    this.armIconHostRecoveryStableTimer(watcher);
    return watcher;
  }

  async enableIconShape(win, display, reason = 'desktop-coexist', options = {}) {
    if (!win || typeof win.setShape !== 'function') throw new Error('DESKTOP_ICON_LAYER_UNAVAILABLE');
    await this.stopIconShapeWatcher();
    // prepareWindow() clears the legacy BrowserWindow shape before SetParent.
    // Calling setShape([]) again after the HWND is already a DefView child can
    // make Electron recreate its top-level region/parent and invalidates the
    // exact main-window identity before the native color-key guard binds.
    const cleared = this.clearIconShapeState(win, {
      preserveShields: options.preserveShields === true,
      preserveDesktopIconsVisible: options.preserveDesktopIconsVisible === true,
      clearWindow: false,
    });
    if (!cleared || cleared.ok !== true) throw new Error(String(cleared && cleared.error || 'DESKTOP_ICON_SHAPE_CLEAR_FAILED'));
    const watcher = this.startIconShapeWatcher(display);
    if (!watcher || !watcher.ready || typeof watcher.ready.then !== 'function') {
      throw new Error('DESKTOP_ICON_LAYER_WATCHER_UNAVAILABLE');
    }
    let layout = await watcher.ready;
    if (this.disposeRequested || !this.isWindowAlive(win) || this.iconShapeWatcher !== watcher) {
      throw new Error('DESKTOP_ICON_LAYER_SUPERSEDED');
    }
    if (typeof watcher.setIconsVisible !== 'function') {
      throw new Error('DESKTOP_ICON_VISIBILITY_CONTROL_UNAVAILABLE');
    }
    const initiallyVisible = layout && typeof layout.desktopIconsVisible === 'boolean'
      ? layout.desktopIconsVisible
      : (layout && typeof layout.iconsVisible === 'boolean' ? layout.iconsVisible : true);
    if (this.desktopIconsVisibilityExplicit !== true) this.desktopIconsVisible = initiallyVisible;
    const desiredIconsVisible = this.desktopIconsVisible !== false;
    if (initiallyVisible !== desiredIconsVisible) layout = await watcher.setIconsVisible(desiredIconsVisible);
    const acknowledgedIconsVisible = layout && typeof layout.desktopIconsVisible === 'boolean'
      ? layout.desktopIconsVisible
      : (layout && typeof layout.iconsVisible === 'boolean' ? layout.iconsVisible : desiredIconsVisible);
    if (acknowledgedIconsVisible !== desiredIconsVisible) {
      throw new Error('DESKTOP_ICON_VISIBILITY_ACK_INVALID');
    }
    return this.applyIconShapeLayout(win, display, layout || watcher.getLastLayout(), reason, true);
  }

  async ensureIconLayerOrder() {
    if (this.iconLayerRestoreUnconfirmed) {
      throw new Error('DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED');
    }
    const watcher = this.iconShapeWatcher;
    if (!watcher || typeof watcher.ensureOrder !== 'function') {
      throw new Error('DESKTOP_ICON_LAYER_ZORDER_UNAVAILABLE');
    }
    const layout = await watcher.ensureOrder();
    const display = this.shapeDisplayForWindow();
    const result = this.applyIconShapeLayout(this.window, display, layout, 'icon-layer-zorder', true);
    return result;
  }

  updateIconShields(rects = [], viewport = {}) {
    if (this.iconLayerRestoreUnconfirmed) {
      return {
        ok: false,
        applied: false,
        error: 'DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED',
        status: this.getStatus('icon-shields-restore-unconfirmed'),
      };
    }
    if (!this.enabled || !this.interactive || !this.isWindowAlive()
      || !this.attachment || this.attachment.kind !== 'icon-host') {
      this.iconShapeShields = [];
      this.iconShapeShieldViewport = null;
      return { ok: true, applied: false, status: this.getStatus('icon-shields-inactive') };
    }
    const display = this.shapeDisplayForWindow();
    if (!display) return { ok: false, applied: false, error: 'DESKTOP_ICON_DISPLAY_UNAVAILABLE' };
    const viewportWidth = Math.max(1, Number(viewport && viewport.width) || display.bounds.width);
    const viewportHeight = Math.max(1, Number(viewport && viewport.height) || display.bounds.height);
    this.iconShapeShields = (Array.isArray(rects) ? rects : []).slice(0, 64).map((value) => {
      const x = Math.max(0, Math.min(viewportWidth, Number(value && value.x) || 0));
      const y = Math.max(0, Math.min(viewportHeight, Number(value && value.y) || 0));
      const right = Math.max(x, Math.min(viewportWidth, x + Math.max(0, Number(value && value.width) || 0)));
      const bottom = Math.max(y, Math.min(viewportHeight, y + Math.max(0, Number(value && value.height) || 0)));
      if (right <= x || bottom <= y) return null;
      return {
        x,
        y,
        width: right - x,
        height: bottom - y,
      };
    }).filter(Boolean);
    this.iconShapeShieldViewport = { width: viewportWidth, height: viewportHeight };
    const watcher = this.iconShapeWatcher;
    if (!this.iconShapeLayout || !watcher || typeof watcher.updateShields !== 'function') {
      return { ok: true, applied: false, status: this.getStatus('icon-shields-cached') };
    }
    Promise.resolve(watcher.updateShields(this.physicalIconShieldsForDisplay(display))).catch((error) => {
      if (this.iconShapeWatcher !== watcher) return;
      this.iconShapeError = String(error && error.message || error || 'DESKTOP_ICON_LAYER_SHIELDS_FAILED');
      this.generation += 1;
      this.emitStatus('icon-shields-failed');
    });
    return { ok: true, applied: true, pending: true, status: this.getStatus('icon-shields-updated') };
  }

  applyInteractivePointerRoute(win = this.window, options = {}) {
    if (!this.isWindowAlive(win)) return null;
    // A locked desktop surface passes normal Mineradio areas through to
    // Explorer, but forwarded move events keep the renderer informed. The
    // right-top controller is the permanent recovery island: entering its
    // reveal corridor immediately restores native input so the same switch can
    // always unlock the software again.
    const ignoreMouseEvents = this.softwareInteractionLocked === true
      && this.pointerRoute.overDesktopControls !== true;
    if (options.force === true || this.pointerIgnoreMouseEvents !== ignoreMouseEvents) {
      if (ignoreMouseEvents) safeCall(win, 'setIgnoreMouseEvents', null, true, { forward: true });
      else safeCall(win, 'setIgnoreMouseEvents', null, false);
      this.pointerIgnoreMouseEvents = ignoreMouseEvents;
    }
    return ignoreMouseEvents;
  }

  updatePointerRoute(route = {}, reason = 'desktop-pointer-route') {
    this.pointerRoute = {
      overSoftwareUi: route && route.overSoftwareUi === true,
      overDesktopControls: route && route.overDesktopControls === true,
    };
    const active = this.enabled && this.interactive && !this.iconLayerRestoreUnconfirmed
      && this.isWindowAlive() && this.attachment && this.attachment.kind === 'icon-host';
    const ignoreMouseEvents = active ? this.applyInteractivePointerRoute(this.window) : null;
    return {
      ok: true,
      applied: active,
      ignoreMouseEvents,
      pointerRoute: { ...this.pointerRoute },
      status: this.getStatus(reason),
    };
  }

  requestKeyboardFocus(reason = 'desktop-keyboard-focus') {
    const win = this.window;
    const webContents = win && win.webContents;
    const active = this.enabled === true && this.interactive === true
      && this.softwareInteractionLocked !== true
      && this.pointerIgnoreMouseEvents !== true
      && !this.iconLayerRestoreUnconfirmed
      && this.isWindowAlive(win)
      && this.attachment && this.attachment.kind === 'icon-host';
    if (!active || !webContents || typeof webContents.focus !== 'function') {
      return {
        ok: false,
        focused: false,
        error: this.softwareInteractionLocked === true
          ? 'DESKTOP_SOFTWARE_LOCKED'
          : 'DESKTOP_KEYBOARD_FOCUS_INACTIVE',
        status: this.getStatus(reason + '-rejected'),
      };
    }

    // This HWND is a DefView child. BrowserWindow.focus()/show()/moveTop()
    // can disturb Explorer/ListView/DWM ordering, so a real renderer click may
    // only restore Chromium's web-content focus here.
    safeCall(win, 'setFocusable', null, true);
    safeCall(webContents, 'focus', null);
    return {
      ok: true,
      focused: safeCall(webContents, 'isFocused', true) !== false,
      error: '',
      status: this.getStatus(reason),
    };
  }

  setSoftwareInteractionLocked(value, reason = 'desktop-software-lock-changed') {
    return this.enqueue('set-software-interaction-lock', async () => {
      const desired = value === true;
      if (!this.enabled || !this.interactive || !this.isWindowAlive()
        || !this.attachment || this.attachment.kind !== 'icon-host'
        || this.iconLayerRestoreUnconfirmed) {
        return {
          ok: false,
          enabled: this.enabled,
          interactive: this.interactive,
          locked: this.softwareInteractionLocked === true,
          softwareInteractionLocked: this.softwareInteractionLocked === true,
          ignoreMouseEvents: this.pointerIgnoreMouseEvents === true,
          error: 'DESKTOP_SOFTWARE_LOCK_INACTIVE',
          status: this.getStatus(reason + '-inactive'),
        };
      }
      this.softwareInteractionLocked = desired;
      this.iconInteractionLocked = desired;
      this.iconInteractionLockError = '';
      if (desired) {
        safeCall(this.window && this.window.webContents, 'blur', null);
        safeCall(this.window, 'blur', null);
        safeCall(this.window, 'setFocusable', null, false);
      } else {
        // Unlock only makes the child eligible for focus. A subsequent real
        // pointerdown restores web-content focus without stealing it here.
        safeCall(this.window, 'setFocusable', null, true);
      }
      const ignoreMouseEvents = this.applyInteractivePointerRoute(this.window, { force: true });
      this.generation += 1;
      return {
        ok: true,
        enabled: this.enabled,
        interactive: this.interactive,
        locked: desired,
        softwareInteractionLocked: desired,
        ignoreMouseEvents,
        error: '',
        status: this.emitStatus(reason),
      };
    });
  }

  setIconInteractionLocked(value, reason = 'desktop-icons-lock-changed') {
    return this.setSoftwareInteractionLocked(value, reason);
  }

  setDesktopIconsVisible(value, reason = 'desktop-icons-visibility-changed') {
    return this.enqueue('set-desktop-icons-visible', async () => {
      const desired = value !== false;
      if (this.iconLayerRestoreUnconfirmed) {
        throw new Error('DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED');
      }
      if (!this.enabled || !this.interactive || !this.isWindowAlive()
        || !this.attachment || this.attachment.kind !== 'icon-host'
        || !this.iconShapeLayout) {
        return {
          ok: false,
          enabled: this.enabled,
          interactive: this.interactive,
          desktopIconsVisible: this.desktopIconsVisible,
          error: 'DESKTOP_ICON_VISIBILITY_INACTIVE',
          status: this.getStatus(reason + '-inactive'),
        };
      }
      const previous = this.desktopIconsVisible !== false;
      const previousExplicit = this.desktopIconsVisibilityExplicit === true;
      const watcher = this.iconShapeWatcher;
      if (!watcher || typeof watcher.setIconsVisible !== 'function') {
        return {
          ok: false,
          enabled: true,
          interactive: true,
          desktopIconsVisible: previous,
          error: 'DESKTOP_ICON_VISIBILITY_CONTROL_UNAVAILABLE',
          status: this.emitStatus(reason + '-failed'),
        };
      }
      const display = this.shapeDisplayForWindow();
      let failure = null;
      try {
        const layout = await watcher.setIconsVisible(desired);
        if (this.iconShapeWatcher !== watcher) throw new Error('DESKTOP_ICON_LAYER_SUPERSEDED');
        this.desktopIconsVisible = desired;
        this.desktopIconsVisibilityExplicit = true;
        const result = this.applyIconShapeLayout(this.window, display, layout, reason, false);
        if (!result || result.ok !== true || this.desktopIconsVisible !== desired) {
          throw new Error(String(result && result.error || 'DESKTOP_ICON_VISIBILITY_ACK_INVALID'));
        }
      } catch (error) {
        failure = error;
      }
      if (failure) {
        this.desktopIconsVisible = previous;
        this.desktopIconsVisibilityExplicit = previousExplicit;
        if (this.iconShapeWatcher === watcher) {
          try {
            const rollbackLayout = await watcher.setIconsVisible(previous);
            this.applyIconShapeLayout(this.window, display, rollbackLayout, reason + '-rollback', false);
          } catch (_) { }
        }
        this.desktopIconsVisible = previous;
        this.desktopIconsVisibilityExplicit = previousExplicit;
        this.iconShapeError = String(failure && failure.message || failure || 'DESKTOP_ICON_VISIBILITY_FAILED');
        this.generation += 1;
        return {
          ok: false,
          enabled: true,
          interactive: true,
          desktopIconsVisible: previous,
          error: this.iconShapeError,
          status: this.emitStatus(reason + '-failed'),
        };
      }
      this.iconShapeError = '';
      this.generation += 1;
      return {
        ok: true,
        enabled: true,
        interactive: true,
        desktopIconsVisible: desired,
        status: this.emitStatus(reason),
      };
    });
  }

  displaySnapshot(win = this.window) {
    let display = null;
    const canEnumerateDisplays = !!(this.screen && typeof this.screen.getAllDisplays === 'function');
    const displays = canEnumerateDisplays ? (safeCall(this.screen, 'getAllDisplays', []) || []) : [];
    let savedDisplayMissing = false;
    if (this.snapshot && this.snapshot.displayId) {
      display = displays.find((entry) => String(entry && entry.id) === String(this.snapshot.displayId)) || null;
      savedDisplayMissing = canEnumerateDisplays && displays.length > 0 && !display;
    }
    if (!display) {
      const current = normalizeBounds(safeCall(win, 'getBounds', this.snapshot && this.snapshot.bounds));
      display = safeCall(this.screen, 'getDisplayMatching', null, current);
    }
    if (!display) display = safeCall(this.screen, 'getPrimaryDisplay', null);
    if (!display) throw new Error('FULL_DESKTOP_DISPLAY_UNAVAILABLE');
    const bounds = normalizeBounds(display.bounds);
    let physicalBounds = { ...bounds };
    if (this.platform === 'win32') {
      const converted = safeCall(this.screen, 'dipToScreenRect', null, null, bounds);
      if (converted) physicalBounds = normalizeBounds(converted, bounds);
    }
    const workArea = normalizeBounds(display.workArea || display.bounds, bounds);
    const result = {
      displayId: String(display.id != null ? display.id : ''),
      bounds,
      physicalBounds,
      workArea,
      safeInsets: workAreaSafeInsets(bounds, workArea),
    };
    if (savedDisplayMissing) this.rebaseRestoreSnapshot(result);
    return result;
  }

  rebaseRestoreSnapshot(display) {
    if (!this.snapshot || !display) return null;
    const original = normalizeBounds(this.snapshot.bounds);
    const area = normalizeBounds(display.workArea || display.bounds, display.bounds);
    const width = Math.max(1, Math.min(original.width, area.width));
    const height = Math.max(1, Math.min(original.height, area.height));
    const bounds = {
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
      width,
      height,
    };
    let physicalBounds = { ...bounds };
    if (this.platform === 'win32') {
      const converted = safeCall(this.screen, 'dipToScreenRect', null, null, bounds);
      if (converted) physicalBounds = normalizeBounds(converted, bounds);
    }
    this.snapshot = {
      ...this.snapshot,
      bounds,
      rawBounds: { ...bounds },
      physicalBounds,
      displayId: String(display.displayId || ''),
    };
    return this.snapshot;
  }

  async nativeCall(handler, payload) {
    const controller = new AbortController();
    this.nativeAbortController = controller;
    try {
      return await handler({ ...payload, signal: controller.signal });
    } finally {
      if (this.nativeAbortController === controller) this.nativeAbortController = null;
    }
  }

  async preparePassive(win, display, reason) {
    if (!this.beforePassive) return { ok: true, skipped: true };
    const result = await this.beforePassive({
      win,
      display,
      reason: String(reason || 'passive'),
      status: this.getStatus('before-passive'),
    });
    if (result && typeof result === 'object' && result.ok === false) {
      throw new Error(String(result.error || 'FULL_DESKTOP_PASSIVE_PREPARE_FAILED'));
    }
    return result && typeof result === 'object' ? result : { ok: true };
  }

  async attach(win, display) {
    const bounds = display.physicalBounds;
    const result = await this.nativeCall(this.attachNative, {
      hwnd: nativeWindowHandleDecimal(win),
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
    if (!result || result.ok !== true || !result.parentWindowId || String(result.parentWindowId) === '0') {
      throw new Error('WALLPAPER_WORKERW_ACK_INVALID');
    }
    this.attachment = {
      kind: 'passive-workerw',
      targetWindowId: String(result.targetWindowId || ''),
      parentWindowId: String(result.parentWindowId || ''),
      parentClassName: String(result.parentClassName || ''),
      displayId: display.displayId,
      bounds: { ...display.bounds },
      physicalBounds: { ...display.physicalBounds },
      workArea: { ...display.workArea },
      safeInsets: { ...display.safeInsets },
    };
    return this.attachment;
  }

  async attachCoexist(win, display) {
    const bounds = display.physicalBounds;
    const result = await this.nativeCall(this.attachCoexistNative, {
      hwnd: nativeWindowHandleDecimal(win),
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
    if (!result || result.ok !== true || result.coexist !== true
      || !result.parentWindowId || String(result.parentWindowId) === '0'
      || !result.desktopViewWindowId || !result.desktopListWindowId
      || !result.topLevelHostWindowId) {
      throw new Error('FULL_DESKTOP_ICON_HOST_ACK_INVALID');
    }
    this.attachment = {
      kind: 'icon-host',
      targetWindowId: String(result.targetWindowId || ''),
      parentWindowId: String(result.parentWindowId || ''),
      parentClassName: String(result.parentClassName || ''),
      topLevelHostWindowId: String(result.topLevelHostWindowId || ''),
      desktopViewWindowId: String(result.desktopViewWindowId || ''),
      desktopListWindowId: String(result.desktopListWindowId || ''),
      displayId: display.displayId,
      bounds: { ...display.bounds },
      physicalBounds: { ...display.physicalBounds },
      workArea: { ...display.workArea },
      safeInsets: { ...display.safeInsets },
    };
    return this.attachment;
  }

  async detach(win, physicalBounds) {
    const bounds = normalizeBounds(physicalBounds);
    const result = await this.nativeCall(this.detachNative, {
      hwnd: nativeWindowHandleDecimal(win),
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
    if (!result || result.ok !== true
      || (Object.prototype.hasOwnProperty.call(result, 'parentWindowId') && String(result.parentWindowId) !== '0')
      || result.child === true || result.popup === false) throw new Error('FULL_DESKTOP_DETACH_ACK_INVALID');
    this.attachment = null;
    return result;
  }

  async recoverAfterDetachFailure(win, display, snapshot, originalError, reason) {
    const originalMessage = String(originalError && originalError.message || originalError || 'FULL_DESKTOP_DETACH_FAILED');
    await this.stopIconShapeWatcher();
    safeCall(win, 'hide', null);
    const cleared = this.clearIconShapeState(win, { clearWindow: false });
    if (!cleared || cleared.ok !== true) {
      this.lastError = `${originalMessage}|${String(cleared && cleared.error || 'DESKTOP_ICON_SHAPE_CLEAR_FAILED')}`;
      if (this.interactive === true && this.attachment && this.attachment.kind === 'icon-host' && this.iconShapeActive === true) {
        this.phase = 'interactive';
        this.startIconShapeWatcher();
        this.applyInteractive(win, this.attachment.bounds || display && display.bounds);
        this.generation += 1;
        return {
          ok: false,
          enabled: true,
          interactive: true,
          recovered: 'interactive',
          error: this.lastError,
          status: this.emitStatus(reason + '-shape-clear-recovered'),
        };
      }
      this.phase = 'error-unknown-native-state';
      this.generation += 1;
      return {
        ok: false,
        enabled: this.enabled,
        interactive: this.interactive,
        recovered: 'hidden-unknown',
        nativeStateKnown: false,
        error: this.lastError,
        status: this.emitStatus(reason + '-shape-clear-failed'),
      };
    }
    this.attachment = null;

    let resolvedDisplay = display || null;
    try {
      if (!resolvedDisplay) resolvedDisplay = this.displaySnapshot(win);
      await this.preparePassive(win, resolvedDisplay, reason + '-recovery');
      await this.attach(win, resolvedDisplay);
      this.enabled = true;
      this.interactive = false;
      this.phase = 'passive';
      this.lastError = originalMessage;
      this.applyPassive(win);
      this.generation += 1;
      return {
        ok: false,
        enabled: true,
        interactive: false,
        recovered: 'passive',
        error: this.lastError,
        status: this.emitStatus(reason + '-recovered-passive'),
      };
    } catch (attachError) {
      this.attachment = null;
      const attachMessage = String(attachError && attachError.message || attachError || 'FULL_DESKTOP_PASSIVE_RECOVERY_FAILED');
      const restoreSnapshot = snapshot || this.snapshot;
      const fallbackBounds = restoreSnapshot && (restoreSnapshot.physicalBounds || restoreSnapshot.bounds)
        || resolvedDisplay && (resolvedDisplay.physicalBounds || resolvedDisplay.bounds)
        || safeCall(win, 'getBounds', null);
      try {
        await this.detach(win, fallbackBounds);
        if (restoreSnapshot) this.restoreWindow(win, restoreSnapshot);
        this.enabled = false;
        this.interactive = false;
        this.window = null;
        this.nativeWindowId = '';
        this.snapshot = null;
        this.attachment = null;
        this.phase = 'disabled';
        this.lastError = originalMessage + '|' + attachMessage;
        this.generation += 1;
        return {
          ok: false,
          enabled: false,
          interactive: false,
          recovered: 'disabled',
          error: this.lastError,
          status: this.emitStatus(reason + '-failed-closed'),
        };
      } catch (detachError) {
        const detachMessage = String(detachError && detachError.message || detachError || 'FULL_DESKTOP_FAIL_CLOSED_DETACH_FAILED');
        safeCall(win, 'hide', null);
        safeCall(win, 'setIgnoreMouseEvents', null, true);
        safeCall(win, 'setFocusable', null, false);
        safeCall(win, 'setResizable', null, false);
        safeCall(win, 'setMovable', null, false);
        this.enabled = true;
        this.interactive = false;
        this.attachment = null;
        this.phase = 'error-unknown-native-state';
        this.lastError = originalMessage + '|' + attachMessage + '|' + detachMessage;
        this.generation += 1;
        return {
          ok: false,
          enabled: true,
          interactive: false,
          recovered: 'hidden-unknown',
          nativeStateKnown: false,
          error: this.lastError,
          status: this.emitStatus(reason + '-native-state-unknown'),
        };
      }
    }
  }

  prepareWindow(win, bounds, options = {}) {
    if (options.hide !== false) safeCall(win, 'hide', null);
    // The visual HWND remains one continuous Mineradio surface below Explorer's
    // color-keyed icon layer. Clear legacy BrowserWindow holes before reparenting.
    safeCall(win, 'setShape', null, []);
    safeCall(win, 'setHasShadow', null, false);
    if (safeCall(win, 'isMinimized', false)) safeCall(win, 'restore', null);
    if (safeCall(win, 'isFullScreen', false)) safeCall(win, 'setFullScreen', null, false);
    if (safeCall(win, 'isMaximized', false)) safeCall(win, 'unmaximize', null);
    safeCall(win, 'setBounds', null, bounds, false);
    safeCall(win, 'setResizable', null, false);
    safeCall(win, 'setMovable', null, false);
  }

  applyPassive(win) {
    // Do not forward synthetic pointer events: the real Windows cursor and
    // desktop icons remain authoritative in passive mode.
    safeCall(win, 'setIgnoreMouseEvents', null, true);
    this.pointerIgnoreMouseEvents = null;
    safeCall(win && win.webContents, 'setBackgroundThrottling', null, false);
    safeCall(win, 'setFocusable', null, false);
    safeCall(win, 'setResizable', null, false);
    safeCall(win, 'setMovable', null, false);
    safeCall(win, 'showInactive', null);
  }

  applyInteractive(win, bounds) {
    if (!this.attachment || this.attachment.kind !== 'icon-host') {
      safeCall(win, 'setBounds', null, bounds, false);
    }
    safeCall(win && win.webContents, 'setBackgroundThrottling', null, false);
    safeCall(win, 'setFocusable', null, true);
    safeCall(win, 'setResizable', null, false);
    safeCall(win, 'setMovable', null, false);
    this.applyInteractivePointerRoute(win, { force: true });
    safeCall(win, 'showInactive', null);
  }

  restoreWindow(win, snapshot) {
    if (!this.isWindowAlive(win) || !snapshot) return;
    safeCall(win, 'setIgnoreMouseEvents', null, false);
    this.pointerIgnoreMouseEvents = null;
    safeCall(win && win.webContents, 'setBackgroundThrottling', null, snapshot.backgroundThrottling);
    safeCall(win, 'setFocusable', null, snapshot.focusable);
    safeCall(win, 'setFullScreen', null, false);
    safeCall(win, 'unmaximize', null);
    if (safeCall(win, 'isMinimized', false)) safeCall(win, 'restore', null);
    if (Array.isArray(snapshot.minimumSize)) safeCall(win, 'setMinimumSize', null, snapshot.minimumSize[0], snapshot.minimumSize[1]);
    if (Array.isArray(snapshot.maximumSize)) safeCall(win, 'setMaximumSize', null, snapshot.maximumSize[0], snapshot.maximumSize[1]);
    safeCall(win, 'setBounds', null, snapshot.bounds, false);
    safeCall(win, 'setResizable', null, snapshot.resizable);
    safeCall(win, 'setMovable', null, snapshot.movable);
    safeCall(win, 'setHasShadow', null, snapshot.hasShadow);
    if (snapshot.maximized) safeCall(win, 'maximize', null);
    if (snapshot.fullScreen) safeCall(win, 'setFullScreen', null, true);
    if (snapshot.minimized) safeCall(win, 'minimize', null);
    if (snapshot.visible) safeCall(win, 'show', null);
    else safeCall(win, 'hide', null);
    if (snapshot.visible && snapshot.focused && !snapshot.minimized) safeCall(win, 'focus', null);
  }

  async rollback(win, snapshot, reason, originalError) {
    try {
      this.cancelIconHostReconcile();
      this.cancelIconHostRecoveryStableTimer();
      await this.stopIconShapeWatcher();
      safeCall(win, 'hide', null);
      const cleared = this.clearIconShapeState(win, { clearWindow: false });
      if (!cleared || cleared.ok !== true) throw new Error(String(cleared && cleared.error || 'DESKTOP_ICON_SHAPE_CLEAR_FAILED'));
      if (this.isWindowAlive(win)) await this.detach(win, snapshot.physicalBounds || snapshot.bounds);
      this.restoreWindow(win, snapshot);
      this.enabled = false;
      this.interactive = false;
      this.window = null;
      this.nativeWindowId = '';
      this.snapshot = null;
      this.attachment = null;
      this.softwareInteractionLocked = false;
      this.iconInteractionLocked = false;
      this.iconInteractionLockError = '';
      this.desktopIconsVisible = true;
      this.desktopIconsVisibilityExplicit = false;
      this.pointerRoute = { overSoftwareUi: false, overDesktopControls: false };
      this.pointerIgnoreMouseEvents = null;
      this.phase = 'disabled';
      this.lastError = String(originalError && originalError.message || originalError || 'FULL_DESKTOP_ENABLE_FAILED');
      this.generation += 1;
      return { ok: false, enabled: false, interactive: false, error: this.lastError, status: this.emitStatus(reason) };
    } catch (cleanupError) {
      const combinedError = new Error(
        String(originalError && originalError.message || originalError || 'FULL_DESKTOP_ENABLE_FAILED')
        + '|' + String(cleanupError && cleanupError.message || cleanupError)
      );
      let display = null;
      try { display = this.displaySnapshot(win); } catch (_) { }
      return this.recoverAfterDetachFailure(win, display, snapshot, combinedError, reason + '-cleanup-failed');
    }
  }

  enable(win, options = {}) {
    return this.enqueue('enable', async () => {
      if (this.disposed || this.disposeRequested) throw new Error('FULL_DESKTOP_DISPOSED');
      if (!this.isSupported()) throw new Error('FULL_DESKTOP_PLATFORM_UNSUPPORTED');
      if (!this.isWindowAlive(win)) throw new Error('FULL_DESKTOP_WINDOW_UNAVAILABLE');
      const interactive = !options || options.interactive !== false;
      const reason = String(options && options.reason || 'enabled');
      if (this.enabled) {
        if (win !== this.window) throw new Error('FULL_DESKTOP_WINDOW_MISMATCH');
        return this.setInteractiveInternal(interactive, reason);
      }
      this.clearIconHostRecoveryEvents();
      this.cancelIconHostRecoveryStableTimer();
      this.window = win;
      this.nativeWindowId = nativeWindowHandleDecimal(win);
      this.snapshot = captureBrowserWindowState(win, this.screen);
      this.phase = 'enabling';
      const display = this.displaySnapshot(win);
      try {
        if (!interactive) await this.preparePassive(win, display, reason);
        if (this.disposed || this.disposeRequested || this.window !== win || !this.isWindowAlive(win)) {
          throw new Error('FULL_DESKTOP_PASSIVE_PREPARE_SUPERSEDED');
        }
        // The coexistence state is re-parented inside DefView below the real
        // icon ListView. Keep it hidden until the native color-key ACK.
        this.prepareWindow(win, display.bounds, { hide: true });
        if (interactive) {
          await this.attachCoexist(win, display);
          this.enabled = true;
          this.interactive = true;
          await this.enableIconShape(win, display, reason);
          this.applyInteractive(win, display.bounds);
          await this.ensureIconLayerOrder();
        } else {
          await this.attach(win, display);
          this.enabled = true;
          this.interactive = false;
          this.applyPassive(win);
        }
        this.phase = this.interactive ? 'interactive' : 'passive';
        this.lastError = '';
        this.generation += 1;
        return { ok: true, enabled: true, interactive: this.interactive, status: this.emitStatus(reason) };
      } catch (error) {
        return this.rollback(win, this.snapshot, 'enable-failed', error);
      }
    });
  }

  interactiveBindingHealthy() {
    const visible = !this.isWindowAlive(this.window)
      ? false
      : (typeof this.window.isVisible !== 'function' || this.window.isVisible());
    return this.enabled === true
      && this.interactive === true
      && this.phase === 'interactive'
      && visible
      && !!this.attachment
      && this.attachment.kind === 'icon-host'
      && !!this.iconShapeWatcher
      && this.iconShapeActive === true
      && this.iconLayerMode === 'explorer-layered-colorkey'
      && this.pointerIgnoreMouseEvents === (this.softwareInteractionLocked === true
        && this.pointerRoute.overDesktopControls !== true);
  }

  async reconcileInteractiveInternal(reason = 'interactive-reconcile') {
    const display = this.displaySnapshot(this.window);
    try {
      await this.stopIconShapeWatcher();
      safeCall(this.window, 'hide', null);
      const cleared = this.clearIconShapeState(this.window, {
        preserveShields: true,
        preserveDesktopIconsVisible: true,
        clearWindow: false,
      });
      if (!cleared || cleared.ok !== true) {
        this.phase = 'interactive';
        this.lastError = String(cleared && cleared.error || 'DESKTOP_ICON_SHAPE_CLEAR_FAILED');
        this.startIconShapeWatcher();
        this.applyInteractive(this.window, display.bounds);
        this.generation += 1;
        return {
          ok: false,
          enabled: true,
          interactive: true,
          error: this.lastError,
          status: this.emitStatus(reason + '-shape-clear-failed'),
        };
      }
      await this.attachCoexist(this.window, display);
      await this.enableIconShape(this.window, display, reason, {
        preserveShields: true,
        preserveDesktopIconsVisible: true,
      });
      this.applyInteractive(this.window, display.bounds);
      await this.ensureIconLayerOrder();
      this.phase = 'interactive';
      this.lastError = '';
      this.generation += 1;
      return { ok: true, enabled: true, interactive: true, status: this.emitStatus(reason) };
    } catch (error) {
      // A failed repair must restore a normal visible window; never leave the
      // WE base alive behind enabled=true plus a hidden Mineradio HWND.
      return this.disableInternal(reason + '-failed', error);
    }
  }

  async setInteractiveInternal(value, reason) {
    if (this.disposeRequested) throw new Error('FULL_DESKTOP_DISPOSED');
    if (!this.enabled) {
      return {
        ok: false,
        enabled: false,
        interactive: false,
        error: 'FULL_DESKTOP_NOT_ENABLED',
        status: this.getStatus(reason || 'interaction-inactive'),
      };
    }
    if (!this.isWindowAlive()) throw new Error('FULL_DESKTOP_WINDOW_UNAVAILABLE');
    if (this.iconLayerRestoreUnconfirmed) {
      throw new Error('DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED');
    }
    const desired = value === true;
    if (desired === this.interactive) {
      if (desired && !this.interactiveBindingHealthy()) {
        return this.reconcileInteractiveInternal(reason || 'interactive-repair');
      }
      this.lastError = '';
      return { ok: true, enabled: true, interactive: desired, status: this.emitStatus(reason || 'interaction-unchanged') };
    }
    const win = this.window;
    const display = this.displaySnapshot(win);
    this.phase = desired ? 'detaching' : 'attaching';
    if (desired) {
      try {
        await this.detach(win, display.physicalBounds);
        safeCall(win, 'hide', null);
        await this.attachCoexist(win, display);
        this.interactive = true;
        await this.enableIconShape(win, display, reason || 'interactive');
        this.applyInteractive(win, display.bounds);
        await this.ensureIconLayerOrder();
        this.phase = 'interactive';
        this.lastError = '';
        this.generation += 1;
        return { ok: true, enabled: true, interactive: true, status: this.emitStatus(reason || 'interactive') };
      } catch (error) {
        return this.recoverAfterDetachFailure(
          win,
          display,
          this.snapshot,
          error,
          'interactive-failed'
        );
      }
    }
    try {
      await this.preparePassive(win, display, reason || 'passive');
      if (this.disposed || this.disposeRequested || this.window !== win
        || !this.isWindowAlive(win) || !this.enabled || this.interactive !== true) {
        throw new Error('FULL_DESKTOP_PASSIVE_PREPARE_SUPERSEDED');
      }
    } catch (error) {
      this.phase = 'interactive';
      this.lastError = String(error && error.message || error || 'FULL_DESKTOP_PASSIVE_PREPARE_FAILED');
      this.generation += 1;
      return {
        ok: false,
        enabled: true,
        interactive: true,
        error: this.lastError,
        status: this.emitStatus('passive-prepare-failed'),
      };
    }
    safeCall(win, 'hide', null);
    await this.stopIconShapeWatcher();
    const cleared = this.clearIconShapeState(win, { clearWindow: false });
    if (!cleared || cleared.ok !== true) {
      this.phase = 'interactive';
      this.lastError = String(cleared && cleared.error || 'DESKTOP_ICON_SHAPE_CLEAR_FAILED');
      this.startIconShapeWatcher();
      this.applyInteractive(win, display.bounds);
      this.generation += 1;
      return {
        ok: false,
        enabled: true,
        interactive: true,
        error: this.lastError,
        status: this.emitStatus('passive-shape-clear-failed'),
      };
    }
    try {
      // Interactive coexistence is a DefView child. Normalize through the
      // verified top-level state before moving it to the separate passive
      // WorkerW; a direct child-to-child SetParent can be reverted by later
      // Electron window calls back to the cached DefView parent.
      await this.detach(win, display.physicalBounds);
      await this.attach(win, display);
      this.applyPassive(win);
      this.interactive = false;
      this.phase = 'passive';
      this.lastError = '';
      this.generation += 1;
      return { ok: true, enabled: true, interactive: false, status: this.emitStatus(reason || 'passive') };
    } catch (error) {
      return this.disableInternal('passive-attach-failed', error);
    }
  }

  setInteractive(value, reason = 'interaction-changed') {
    return this.enqueue('set-interactive', () => this.setInteractiveInternal(value, reason));
  }

  toggleInteractive(reason = 'interaction-toggled') {
    return this.enqueue('toggle-interactive', () => this.setInteractiveInternal(!this.interactive, reason));
  }

  reconcile(reason = 'display-change') {
    return this.enqueue('reconcile', async () => {
      if (this.disposeRequested) return { ok: false, enabled: this.enabled, interactive: this.interactive, error: 'FULL_DESKTOP_DISPOSED', status: this.getStatus(reason) };
      if (!this.enabled) return { ok: true, enabled: false, interactive: false, status: this.getStatus(reason) };
      if (!this.isWindowAlive()) throw new Error('FULL_DESKTOP_WINDOW_UNAVAILABLE');
      const display = this.displaySnapshot(this.window);
      if (this.interactive) {
        return this.reconcileInteractiveInternal(reason);
      } else {
        try {
          await this.attach(this.window, display);
          this.applyPassive(this.window);
        } catch (error) {
          return this.disableInternal('reconcile-failed', error);
        }
      }
      this.phase = this.interactive ? 'interactive' : 'passive';
      this.lastError = '';
      this.generation += 1;
      return { ok: true, enabled: true, interactive: this.interactive, status: this.emitStatus(reason) };
    });
  }

  async disableInternal(reason = 'disabled', preservedError = null) {
    this.cancelIconHostReconcile();
    this.cancelIconHostRecoveryStableTimer();
    await this.stopIconShapeWatcher();
    if (!this.enabled && !this.snapshot) {
      this.clearIconShapeState(this.window, { clearWindow: this.isWindowAlive(this.window) });
      this.phase = 'disabled';
      return { ok: true, enabled: false, interactive: false, status: this.getStatus(reason) };
    }
    const win = this.window;
    let snapshot = this.snapshot;
    if (!this.isWindowAlive(win)) {
      this.clearIconShapeState(win, { clearWindow: false });
      this.enabled = false;
      this.interactive = false;
      this.window = null;
      this.nativeWindowId = '';
      this.snapshot = null;
      this.attachment = null;
      this.softwareInteractionLocked = false;
      this.iconInteractionLocked = false;
      this.iconInteractionLockError = '';
      this.desktopIconsVisible = true;
      this.desktopIconsVisibilityExplicit = false;
      this.pointerRoute = { overSoftwareUi: false, overDesktopControls: false };
      this.pointerIgnoreMouseEvents = null;
      this.phase = 'disabled';
      this.lastError = String(preservedError && preservedError.message || preservedError || '');
      return { ok: true, enabled: false, interactive: false, status: this.emitStatus(reason) };
    }
    safeCall(win, 'hide', null);
    const cleared = this.clearIconShapeState(win, { clearWindow: false });
    if (!cleared || cleared.ok !== true) {
      this.phase = this.interactive ? 'interactive' : 'passive';
      this.lastError = String(cleared && cleared.error || 'DESKTOP_ICON_SHAPE_CLEAR_FAILED');
      if (this.interactive && this.attachment && this.attachment.kind === 'icon-host' && this.iconShapeActive) {
        this.startIconShapeWatcher();
        this.applyInteractive(win, this.attachment.bounds || snapshot.bounds);
      }
      this.generation += 1;
      return {
        ok: false,
        enabled: true,
        interactive: this.interactive,
        error: this.lastError,
        status: this.emitStatus(reason + '-shape-clear-failed'),
      };
    }
    const knownInteractiveTopLevel = this.interactive === true
      && !this.attachment
      && this.phase === 'interactive';
    this.phase = 'disabling';
    let display = null;
    try {
      display = this.displaySnapshot(win);
      snapshot = this.snapshot || snapshot;
    } catch (_) { }
    if (!knownInteractiveTopLevel) {
      try {
        await this.detach(win, snapshot.physicalBounds || snapshot.bounds);
      } catch (error) {
        return this.recoverAfterDetachFailure(win, display, snapshot, error, reason + '-detach-failed');
      }
    }
    this.restoreWindow(win, snapshot);
    this.enabled = false;
    this.interactive = false;
    this.window = null;
    this.nativeWindowId = '';
    this.snapshot = null;
    this.attachment = null;
    this.softwareInteractionLocked = false;
    this.iconInteractionLocked = false;
    this.iconInteractionLockError = '';
    this.desktopIconsVisible = true;
    this.desktopIconsVisibilityExplicit = false;
    this.pointerRoute = { overSoftwareUi: false, overDesktopControls: false };
    this.pointerIgnoreMouseEvents = null;
    this.phase = 'disabled';
    this.lastError = String(preservedError && preservedError.message || preservedError || '');
    this.generation += 1;
    return { ok: !this.lastError, enabled: false, interactive: false, error: this.lastError, status: this.emitStatus(reason) };
  }

  disable(reason = 'disabled', preservedError = null) {
    this.abortNative();
    this.abortIconShapeProbe();
    this.requestIconShapeWatcherStop();
    return this.enqueue('disable', () => this.disableInternal(reason, preservedError));
  }

  dispose(reason = 'dispose') {
    this.disposeRequested = true;
    this.abortNative();
    this.abortIconShapeProbe();
    this.requestIconShapeWatcherStop();
    return this.enqueue('dispose', async () => {
      const result = await this.disableInternal(reason);
      if (result.ok === true) this.disposed = true;
      return result;
    });
  }
}

module.exports = {
  FullDesktopModeRuntime,
  attachDesktopWindowForCoexistence,
  captureBrowserWindowState,
  desktopWindowCoexistAttachScript,
  desktopWindowDetachScript,
  detachDesktopWindowToTopLevel,
  parseDesktopCoexistAck,
  parseDesktopNativeAck,
};
