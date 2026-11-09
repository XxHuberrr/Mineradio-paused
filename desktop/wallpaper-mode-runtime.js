const path = require('path');

const DEFAULT_WALLPAPER_STATE = Object.freeze({
  enabled: false,
  title: 'Mineradio',
  artist: '',
  cover: '',
  playing: false,
  preset: 0,
  opacity: 1,
  frameRate: 30,
  colors: Object.freeze({
    primary: '#d6f8ff',
    secondary: '#9cffdf',
    highlight: '#fff0b8',
    glow: '#9cffdf',
  }),
});

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function normalizeWallpaperFrameRate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 30;
  if (numeric <= 26) return 24;
  if (numeric <= 45) return 30;
  return 60;
}

function normalizeHexColor(value, fallback) {
  let color = String(value || '').trim();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    color = '#' + color.charAt(1) + color.charAt(1)
      + color.charAt(2) + color.charAt(2)
      + color.charAt(3) + color.charAt(3);
  }
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function normalizeWallpaperState(previous, payload, enabledOverride) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const current = previous && typeof previous === 'object' ? previous : DEFAULT_WALLPAPER_STATE;
  const currentColors = current.colors && typeof current.colors === 'object'
    ? current.colors
    : DEFAULT_WALLPAPER_STATE.colors;
  const sourceColors = source.colors && typeof source.colors === 'object' ? source.colors : {};
  const enabled = typeof enabledOverride === 'boolean'
    ? enabledOverride
    : Object.prototype.hasOwnProperty.call(source, 'enabled')
      ? source.enabled === true
      : current.enabled === true;
  return {
    enabled,
    title: String(Object.prototype.hasOwnProperty.call(source, 'title') ? source.title : current.title || 'Mineradio').slice(0, 512),
    artist: String(Object.prototype.hasOwnProperty.call(source, 'artist') ? source.artist : current.artist || '').slice(0, 512),
    cover: String(Object.prototype.hasOwnProperty.call(source, 'cover') ? source.cover : current.cover || ''),
    playing: Object.prototype.hasOwnProperty.call(source, 'playing') ? source.playing === true : current.playing === true,
    preset: Math.round(clampNumber(
      Object.prototype.hasOwnProperty.call(source, 'preset') ? source.preset : current.preset,
      0,
      32,
      0
    )),
    opacity: clampNumber(
      Object.prototype.hasOwnProperty.call(source, 'opacity') ? source.opacity : current.opacity,
      0.35,
      1,
      1
    ),
    frameRate: normalizeWallpaperFrameRate(
      Object.prototype.hasOwnProperty.call(source, 'frameRate') ? source.frameRate : current.frameRate
    ),
    colors: {
      primary: normalizeHexColor(sourceColors.primary || currentColors.primary, DEFAULT_WALLPAPER_STATE.colors.primary),
      secondary: normalizeHexColor(sourceColors.secondary || currentColors.secondary, DEFAULT_WALLPAPER_STATE.colors.secondary),
      highlight: normalizeHexColor(sourceColors.highlight || currentColors.highlight, DEFAULT_WALLPAPER_STATE.colors.highlight),
      glow: normalizeHexColor(sourceColors.glow || currentColors.glow, DEFAULT_WALLPAPER_STATE.colors.glow),
    },
  };
}

function nativeWindowHandleDecimal(win) {
  const handle = win.getNativeWindowHandle();
  if (!Buffer.isBuffer(handle) || handle.length < 4) throw new Error('WALLPAPER_NATIVE_HANDLE_INVALID');
  if (handle.length >= 8 && (process.arch === 'x64' || process.arch === 'arm64')) {
    return handle.readBigUInt64LE(0).toString();
  }
  return String(handle.readUInt32LE(0));
}

function workerWAttachScript(input) {
  const hwnd = String(input.hwnd || '');
  if (!/^\d+$/.test(hwnd)) throw new Error('WALLPAPER_NATIVE_HANDLE_INVALID');
  const x = Math.round(Number(input.x) || 0);
  const y = Math.round(Number(input.y) || 0);
  const width = Math.max(1, Math.round(Number(input.width) || 1));
  const height = Math.max(1, Math.round(Number(input.height) || 1));
  return `
$ErrorActionPreference = "Stop"
if (-not ("MineradioDesktopWallpaperNative" -as [type])) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class MineradioDesktopWallpaperNative {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowName);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr GetParent(IntPtr child);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll", SetLastError=true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool ScreenToClient(IntPtr hWnd, ref POINT point);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW", SetLastError=true)] private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int index);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW", SetLastError=true)] private static extern IntPtr GetWindowLong32(IntPtr hWnd, int index);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW", SetLastError=true)] private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int index, IntPtr value);
  [DllImport("user32.dll", EntryPoint="SetWindowLongW", SetLastError=true)] private static extern IntPtr SetWindowLong32(IntPtr hWnd, int index, IntPtr value);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder value, int maxCount);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);
  public static IntPtr FindWindowByClass(string className) { return FindWindow(className, null); }
  public static IntPtr FindWindowExByClass(IntPtr parent, IntPtr childAfter, string className) { return FindWindowEx(parent, childAfter, className, null); }
  public static IntPtr GetWindowLongPtr(IntPtr hWnd, int index) { return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, index) : GetWindowLong32(hWnd, index); }
  public static IntPtr SetWindowLongPtr(IntPtr hWnd, int index, IntPtr value) { return IntPtr.Size == 8 ? SetWindowLongPtr64(hWnd, index, value) : SetWindowLong32(hWnd, index, value); }
}
"@
}
$previousDpiContext = [IntPtr]::Zero
try { $previousDpiContext = [MineradioDesktopWallpaperNative]::SetThreadDpiAwarenessContext([IntPtr]::new([Int64]-4)) } catch { }
$progman = [MineradioDesktopWallpaperNative]::FindWindowByClass("Progman")
if ($progman -eq [IntPtr]::Zero) { throw "WALLPAPER_PROGMAN_NOT_FOUND" }
$sendResult = [IntPtr]::Zero
[MineradioDesktopWallpaperNative]::SendMessageTimeout($progman, 0x052C, [IntPtr]::Zero, [IntPtr]::Zero, 0, 1000, [ref]$sendResult) | Out-Null
$script:workerw = [IntPtr]::Zero
$callback = [MineradioDesktopWallpaperNative+EnumWindowsProc]{
  param([IntPtr]$top, [IntPtr]$state)
  $shellView = [MineradioDesktopWallpaperNative]::FindWindowExByClass($top, [IntPtr]::Zero, "SHELLDLL_DefView")
  if ($shellView -ne [IntPtr]::Zero) {
    $candidate = [MineradioDesktopWallpaperNative]::FindWindowExByClass([IntPtr]::Zero, $top, "WorkerW")
    if ($candidate -ne [IntPtr]::Zero) { $script:workerw = $candidate }
  }
  return $true
}
[MineradioDesktopWallpaperNative]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null
if ($script:workerw -eq [IntPtr]::Zero) { throw "WALLPAPER_WORKERW_NOT_FOUND" }
$target = [IntPtr]::new([Int64]${hwnd})
if (-not [MineradioDesktopWallpaperNative]::IsWindow($target)) { throw "WALLPAPER_TARGET_NOT_FOUND" }
$GWL_STYLE = -16
$WS_POPUP = [Int64]0x80000000
$WS_CHILD = [Int64]0x40000000
$style = [MineradioDesktopWallpaperNative]::GetWindowLongPtr($target, $GWL_STYLE).ToInt64()
$childStyle = ($style -band (-bnot $WS_POPUP)) -bor $WS_CHILD
[MineradioDesktopWallpaperNative]::SetWindowLongPtr($target, $GWL_STYLE, [IntPtr]::new([Int64]$childStyle)) | Out-Null
$verifiedStyle = [MineradioDesktopWallpaperNative]::GetWindowLongPtr($target, $GWL_STYLE).ToInt64()
if (($verifiedStyle -band $WS_CHILD) -eq 0 -or ($verifiedStyle -band $WS_POPUP) -ne 0) { throw "WALLPAPER_CHILD_STYLE_FAILED" }
[MineradioDesktopWallpaperNative]::SetParent($target, $script:workerw) | Out-Null
$parent = [MineradioDesktopWallpaperNative]::GetParent($target)
if ($parent -ne $script:workerw) { throw "WALLPAPER_WORKERW_ATTACH_FAILED" }
$origin = New-Object MineradioDesktopWallpaperNative+POINT
$origin.X = ${x}
$origin.Y = ${y}
if (-not [MineradioDesktopWallpaperNative]::ScreenToClient($script:workerw, [ref]$origin)) { throw "WALLPAPER_WORKERW_BOUNDS_FAILED" }
$positioned = [MineradioDesktopWallpaperNative]::SetWindowPos($target, [IntPtr]::new([Int64]1), $origin.X, $origin.Y, ${width}, ${height}, 0x0030)
if (-not $positioned) { throw "WALLPAPER_WORKERW_POSITION_FAILED" }
$className = New-Object System.Text.StringBuilder 128
[MineradioDesktopWallpaperNative]::GetClassName($script:workerw, $className, $className.Capacity) | Out-Null
[pscustomobject]@{
  ok = $true
  targetWindowId = $target.ToInt64().ToString()
  parentWindowId = $parent.ToInt64().ToString()
  parentClassName = $className.ToString()
  x = ${x}
  y = ${y}
  width = ${width}
  height = ${height}
} | ConvertTo-Json -Compress
if ($previousDpiContext -ne [IntPtr]::Zero) {
  try { [MineradioDesktopWallpaperNative]::SetThreadDpiAwarenessContext($previousDpiContext) | Out-Null } catch { }
}
`;
}

function parseAttachOutput(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index]);
      if (parsed && parsed.ok === true) return parsed;
    } catch (_) { }
  }
  throw new Error('WALLPAPER_WORKERW_ACK_INVALID');
}

function nativeAttachFailureMessage(error, stderr) {
  const diagnostic = String(stderr || error && error.message || 'WALLPAPER_WORKERW_ATTACH_FAILED');
  const code = diagnostic.match(/WALLPAPER_[A-Z0-9_]+/);
  return code ? code[0] : String(error && error.code || 'WALLPAPER_WORKERW_ATTACH_FAILED');
}

function attachWallpaperWindowToDesktop(options = {}) {
  const execFileImpl = options.execFileImpl;
  if (typeof execFileImpl !== 'function') return Promise.reject(new Error('WALLPAPER_EXEC_UNAVAILABLE'));
  let script;
  try {
    script = workerWAttachScript(options);
  } catch (error) {
    return Promise.reject(error);
  }
  const nativeTempPath = String(options.nativeTempPath || '').trim();
  const env = { ...process.env };
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
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const handleAbort = () => {
      if (settled) return;
      if (child && typeof child.kill === 'function') {
        try { child.kill(); } catch (_) { }
      }
      const failure = new Error('WALLPAPER_NATIVE_ATTACH_ABORTED');
      failure.code = 'WALLPAPER_NATIVE_ATTACH_ABORTED';
      finishReject(failure);
    };
    if (signal && signal.aborted) {
      handleAbort();
      return;
    }
    if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', handleAbort, { once: true });
    try {
      child = execFileImpl('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        windowsHide: true,
        timeout: Math.max(1000, Math.min(10000, Number(options.timeoutMs) || 5000)),
        maxBuffer: 128 * 1024,
        env,
      }, (error, stdout, stderr) => {
        if (settled) return;
        if (error) {
          const failure = new Error(nativeAttachFailureMessage(error, stderr));
          failure.code = failure.message;
          finishReject(failure);
          return;
        }
        try {
          const parsed = parseAttachOutput(stdout);
          settled = true;
          cleanup();
          resolve(parsed);
        } catch (parseError) {
          finishReject(parseError);
        }
      });
    } catch (error) {
      finishReject(error);
    }
  });
}

class DesktopWallpaperRuntime {
  constructor(options = {}) {
    if (typeof options.BrowserWindow !== 'function') throw new Error('WALLPAPER_BROWSER_WINDOW_REQUIRED');
    // Electron's `screen` export is a ready-gated proxy. Even reading one of
    // its methods before app.whenReady() throws, while this runtime is created
    // during main-module evaluation. Keep the proxy now and touch its methods
    // only from start/reconcile, which run after Electron is ready.
    if (!options.screen) throw new Error('WALLPAPER_SCREEN_REQUIRED');
    this.BrowserWindow = options.BrowserWindow;
    this.screen = options.screen;
    this.platform = options.platform || process.platform;
    this.preloadPath = path.resolve(String(options.preloadPath || 'wallpaper-preload.js'));
    this.overlayUrl = typeof options.overlayUrl === 'function' ? options.overlayUrl : () => String(options.overlayUrl || '');
    this.nativeTempPath = String(options.nativeTempPath || '');
    this.logger = options.logger || console;
    this.onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
    this.attachNative = typeof options.attachNative === 'function'
      ? options.attachNative
      : (input) => attachWallpaperWindowToDesktop({
        ...input,
        execFileImpl: options.execFileImpl,
        nativeTempPath: this.nativeTempPath,
        timeoutMs: options.attachTimeoutMs,
      });
    this.window = null;
    this.state = normalizeWallpaperState(DEFAULT_WALLPAPER_STATE, {}, false);
    this.attachment = null;
    this.lastError = '';
    this.operation = 0;
    this.startPromise = null;
    this.stopPromise = null;
    this.attachAbortController = null;
    this.closingWindow = null;
    this.generation = 0;
    this.reconcilePendingReason = '';
    this.reconcileFollowupPromise = null;
  }

  isSupported() {
    return this.platform === 'win32';
  }

  isWindowAlive(win = this.window) {
    return !!(win && typeof win.isDestroyed === 'function' && !win.isDestroyed());
  }

  primaryDisplaySnapshot() {
    const display = this.screen.getPrimaryDisplay();
    const bounds = display && display.bounds || {};
    const normalizedBounds = {
      x: Math.round(Number(bounds.x) || 0),
      y: Math.round(Number(bounds.y) || 0),
      width: Math.max(1, Math.round(Number(bounds.width) || 1)),
      height: Math.max(1, Math.round(Number(bounds.height) || 1)),
    };
    let physicalBounds = { ...normalizedBounds };
    if (this.platform === 'win32' && typeof this.screen.dipToScreenRect === 'function') {
      try {
        const converted = this.screen.dipToScreenRect(null, normalizedBounds);
        if (converted && Number(converted.width) > 0 && Number(converted.height) > 0) {
          physicalBounds = {
            x: Math.round(Number(converted.x) || 0),
            y: Math.round(Number(converted.y) || 0),
            width: Math.max(1, Math.round(Number(converted.width) || 1)),
            height: Math.max(1, Math.round(Number(converted.height) || 1)),
          };
        }
      } catch (_) { }
    }
    return {
      displayId: String(display && display.id != null ? display.id : 'primary'),
      bounds: normalizedBounds,
      physicalBounds,
    };
  }

  getStatus(reason = '') {
    const win = this.isWindowAlive() ? this.window : null;
    let visible = false;
    if (win && typeof win.isVisible === 'function') {
      try { visible = win.isVisible(); } catch (_) { }
    }
    return {
      ok: !this.lastError,
      supported: this.isSupported(),
      active: !!(win && this.state.enabled && this.attachment),
      enabled: this.state.enabled === true,
      visible,
      attaching: !!(this.startPromise && win && this.state.enabled && !this.attachment),
      generation: this.generation,
      windowId: win && typeof win.id !== 'undefined' ? win.id : null,
      nativeWindowId: this.attachment && this.attachment.targetWindowId || '',
      parentWindowId: this.attachment && this.attachment.parentWindowId || '',
      parentClassName: this.attachment && this.attachment.parentClassName || '',
      displayId: this.attachment && this.attachment.displayId || '',
      bounds: this.attachment && this.attachment.bounds || null,
      physicalBounds: this.attachment && this.attachment.physicalBounds || null,
      frameRate: this.state.frameRate,
      lastError: this.lastError,
      reason: String(reason || ''),
    };
  }

  emitStatus(reason) {
    const status = this.getStatus(reason);
    try { this.onStatus(status); } catch (_) { }
    return status;
  }

  positionWindow(win = this.window) {
    if (!this.isWindowAlive(win)) return this.primaryDisplaySnapshot();
    const snapshot = this.primaryDisplaySnapshot();
    win.setBounds(snapshot.bounds, false);
    return snapshot;
  }

  sendState(win = this.window) {
    if (!this.isWindowAlive(win) || !win.webContents || win.webContents.isDestroyed()) return false;
    win.webContents.send('mineradio-wallpaper-state', this.state);
    return true;
  }

  closeWindow(win, timeoutMs = 800) {
    if (!this.isWindowAlive(win)) return Promise.resolve(false);
    this.closingWindow = win;
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        if (typeof win.removeListener === 'function') win.removeListener('closed', handleClosed);
        if (this.closingWindow === win) this.closingWindow = null;
      };
      const finish = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(true);
      };
      const handleClosed = () => finish(null);
      if (typeof win.once === 'function') win.once('closed', handleClosed);
      try {
        win.destroy();
      } catch (error) {
        if (!this.isWindowAlive(win)) finish(null);
        else finish(new Error('WALLPAPER_WINDOW_DESTROY_FAILED:' + String(error && error.message || error)));
        return;
      }
      if (!this.isWindowAlive(win)) {
        finish(null);
        return;
      }
      if (settled) return;
      timer = setTimeout(() => {
        if (!this.isWindowAlive(win)) finish(null);
        else finish(new Error('WALLPAPER_WINDOW_DESTROY_TIMEOUT'));
      }, Math.max(100, Math.min(2000, Number(timeoutMs) || 800)));
    });
  }

  createWindow() {
    const snapshot = this.primaryDisplaySnapshot();
    const win = new this.BrowserWindow({
      ...snapshot.bounds,
      frame: false,
      transparent: false,
      backgroundColor: '#050608',
      hasShadow: false,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      show: false,
      title: 'Mineradio Desktop Wallpaper',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    win.setIgnoreMouseEvents(true);
    if (win.webContents && typeof win.webContents.setWindowOpenHandler === 'function') {
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    }
    if (win.webContents && typeof win.webContents.on === 'function') {
      win.webContents.on('will-navigate', (event, targetUrl) => {
        if (String(targetUrl || '') === String(this.overlayUrl() || '')) return;
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
      });
    }
    win.on('closed', () => {
      if (this.window !== win) return;
      const expected = this.closingWindow === win || this.state.enabled !== true;
      this.window = null;
      this.attachment = null;
      if (!expected) {
        this.state = normalizeWallpaperState(this.state, {}, false);
        this.lastError = 'WALLPAPER_WINDOW_CLOSED';
        this.emitStatus('window-closed-unexpectedly');
      }
    });
    win.webContents.on('render-process-gone', (_event, details) => {
      if (this.window !== win || this.state.enabled !== true) return;
      const failure = 'WALLPAPER_RENDERER_GONE:' + String(details && details.reason || 'unknown');
      this.stop('renderer-gone', { error: failure }).catch(() => {});
    });
    this.window = win;
    return win;
  }

  async attachWindow(win, snapshot, operation) {
    const physicalBounds = snapshot.physicalBounds || snapshot.bounds;
    const controller = new AbortController();
    this.attachAbortController = controller;
    let result;
    try {
      result = await this.attachNative({
        hwnd: nativeWindowHandleDecimal(win),
        x: physicalBounds.x,
        y: physicalBounds.y,
        width: physicalBounds.width,
        height: physicalBounds.height,
        signal: controller.signal,
      });
    } finally {
      if (this.attachAbortController === controller) this.attachAbortController = null;
    }
    if (operation !== this.operation || this.window !== win || !this.isWindowAlive(win)) {
      throw new Error('WALLPAPER_START_SUPERSEDED');
    }
    if (!result || result.ok !== true || !result.parentWindowId) {
      throw new Error('WALLPAPER_WORKERW_ACK_INVALID');
    }
    this.attachment = {
      targetWindowId: String(result.targetWindowId || ''),
      parentWindowId: String(result.parentWindowId || ''),
      parentClassName: String(result.parentClassName || ''),
      displayId: snapshot.displayId,
      bounds: { ...snapshot.bounds },
      physicalBounds: { ...physicalBounds },
      attachedAt: Date.now(),
    };
    return this.attachment;
  }

  async runStart(operation) {
    let win = this.isWindowAlive() ? this.window : null;
    let created = false;
    try {
      if (!win) {
        win = this.createWindow();
        created = true;
        const targetUrl = String(this.overlayUrl() || '');
        if (!targetUrl) throw new Error('WALLPAPER_URL_UNAVAILABLE');
        await win.loadURL(targetUrl);
      }
      if (operation !== this.operation || this.state.enabled !== true || this.window !== win) {
        throw new Error('WALLPAPER_START_SUPERSEDED');
      }
      const snapshot = this.positionWindow(win);
      await this.attachWindow(win, snapshot, operation);
      if (operation !== this.operation || this.state.enabled !== true || this.window !== win) {
        throw new Error('WALLPAPER_START_SUPERSEDED');
      }
      this.lastError = '';
      this.sendState(win);
      if (typeof win.showInactive === 'function') win.showInactive();
      this.generation += 1;
      const status = this.emitStatus(created ? 'started' : 'reconciled');
      return { ok: true, enabled: true, status };
    } catch (error) {
      const superseded = String(error && error.message || '') === 'WALLPAPER_START_SUPERSEDED';
      if (this.window === win) {
        this.window = null;
        this.attachment = null;
      }
      try {
        await this.closeWindow(win);
      } catch (closeError) {
        if (this.isWindowAlive(win) && !this.window) this.window = win;
        if (!superseded && operation === this.operation) {
          error = new Error(String(error && error.message || 'WALLPAPER_START_FAILED') + '|' + String(closeError && closeError.message || closeError));
        }
      }
      if (!superseded && operation === this.operation) {
        this.state = normalizeWallpaperState(this.state, {}, false);
        this.lastError = String(error && error.message || 'WALLPAPER_START_FAILED');
        this.emitStatus('start-failed');
      }
      return {
        ok: false,
        enabled: false,
        stale: superseded,
        error: superseded ? 'WALLPAPER_START_SUPERSEDED' : this.lastError,
        status: this.getStatus(superseded ? 'start-superseded' : 'start-failed'),
      };
    }
  }

  async start(payload = {}) {
    if (this.stopPromise) await this.stopPromise;
    this.state = normalizeWallpaperState(this.state, payload, true);
    if (!this.isSupported()) {
      this.state = normalizeWallpaperState(this.state, {}, false);
      this.lastError = 'WALLPAPER_PLATFORM_UNSUPPORTED';
      return { ok: false, enabled: false, error: this.lastError, status: this.emitStatus('unsupported') };
    }
    if (this.startPromise) {
      const pendingPromise = this.startPromise;
      const pending = await pendingPromise;
      if (this.startPromise === pendingPromise) this.startPromise = null;
      if (this.state.enabled && (!pending.ok || !this.isWindowAlive() || !this.attachment)) {
        return this.start(this.state);
      }
      if (pending.ok && this.state.enabled) this.sendState();
      return pending;
    }
    if (this.isWindowAlive() && this.attachment) {
      this.lastError = '';
      this.sendState();
      return { ok: true, enabled: true, status: this.emitStatus('updated') };
    }
    const operation = ++this.operation;
    const job = this.runStart(operation);
    this.startPromise = job;
    try {
      return await job;
    } finally {
      if (this.startPromise === job) this.startPromise = null;
    }
  }

  async update(payload = {}) {
    const requestedEnabled = Object.prototype.hasOwnProperty.call(payload || {}, 'enabled')
      ? payload.enabled === true
      : this.state.enabled === true;
    this.state = normalizeWallpaperState(this.state, payload, requestedEnabled);
    if (!requestedEnabled) {
      if (this.isWindowAlive() || this.startPromise) return this.stop('update-disabled');
      return { ok: true, enabled: false, status: this.getStatus('updated-disabled') };
    }
    if (!this.isWindowAlive() || !this.attachment) return this.start(this.state);
    this.sendState();
    return { ok: true, enabled: true, status: this.getStatus('updated') };
  }

  queueReconcileFollowup(reason) {
    this.reconcilePendingReason = String(reason || 'display-change');
    if (this.reconcileFollowupPromise) return this.reconcileFollowupPromise;
    const activeJob = this.startPromise;
    const followup = (async () => {
      let result = activeJob ? await Promise.resolve(activeJob).catch((error) => ({
        ok: false,
        enabled: false,
        error: String(error && error.message || error),
        status: this.getStatus('display-followup-wait-failed'),
      })) : null;
      if (this.startPromise === activeJob) this.startPromise = null;
      while (this.reconcilePendingReason && this.state.enabled && this.isWindowAlive()) {
        const nextReason = this.reconcilePendingReason;
        this.reconcilePendingReason = '';
        result = await this.reconcileDisplay(nextReason);
      }
      return result || { ok: true, enabled: false, status: this.getStatus(reason) };
    })();
    const tracked = followup.finally(() => {
      if (this.reconcileFollowupPromise === tracked) this.reconcileFollowupPromise = null;
    });
    this.reconcileFollowupPromise = tracked;
    return tracked;
  }

  async reconcileDisplay(reason = 'display-change') {
    if (!this.state.enabled || !this.isWindowAlive()) return { ok: true, enabled: false, status: this.getStatus(reason) };
    if (this.startPromise) return this.queueReconcileFollowup(reason);
    const operation = ++this.operation;
    const win = this.window;
    const job = (async () => {
      try {
        const snapshot = this.positionWindow(win);
        await this.attachWindow(win, snapshot, operation);
        this.lastError = '';
        this.sendState(win);
        return { ok: true, enabled: true, status: this.emitStatus(reason) };
      } catch (error) {
        if (operation !== this.operation) {
          return { ok: false, enabled: false, stale: true, error: 'WALLPAPER_START_SUPERSEDED', status: this.getStatus(reason) };
        }
        const failure = String(error && error.message || 'WALLPAPER_DISPLAY_RECONCILE_FAILED');
        const stopped = await this.stop('display-reconcile-failed', { error: failure });
        return { ok: false, enabled: false, error: failure, status: stopped.status };
      }
    })();
    this.startPromise = job;
    try {
      return await job;
    } finally {
      if (this.startPromise === job) this.startPromise = null;
    }
  }

  async runStop(reason = 'disabled', options = {}) {
    const preservedError = String(options && options.error || '');
    this.operation += 1;
    const controller = this.attachAbortController;
    this.attachAbortController = null;
    if (controller && typeof controller.abort === 'function') {
      try { controller.abort(); } catch (_) { }
    }
    this.state = normalizeWallpaperState(this.state, {}, false);
    this.attachment = null;
    this.reconcilePendingReason = '';
    const win = this.window;
    if (this.window === win) this.window = null;
    let closeError = '';
    try {
      await this.closeWindow(win);
    } catch (error) {
      closeError = String(error && error.message || 'WALLPAPER_WINDOW_DESTROY_FAILED');
      if (this.isWindowAlive(win) && !this.window) this.window = win;
    }
    this.lastError = preservedError || closeError;
    this.generation += 1;
    return { ok: !closeError, enabled: false, error: closeError, status: this.emitStatus(reason) };
  }

  async stop(reason = 'disabled', options = {}) {
    if (this.stopPromise) return this.stopPromise;
    const job = this.runStop(reason, options);
    this.stopPromise = job;
    try {
      return await job;
    } finally {
      if (this.stopPromise === job) this.stopPromise = null;
    }
  }

  async dispose() {
    const pending = this.startPromise;
    const stopped = await this.stop('dispose');
    if (pending) {
      await Promise.race([
        Promise.resolve(pending).catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    }
    return stopped;
  }
}

module.exports = {
  DEFAULT_WALLPAPER_STATE,
  DesktopWallpaperRuntime,
  attachWallpaperWindowToDesktop,
  nativeWindowHandleDecimal,
  normalizeWallpaperFrameRate,
  normalizeWallpaperState,
  workerWAttachScript,
};
