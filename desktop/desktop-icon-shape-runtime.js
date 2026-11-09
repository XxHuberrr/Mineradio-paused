'use strict';

const { execFile, spawn } = require('child_process');

const DEFAULT_PROBE_TIMEOUT_MS = 5000;
const DEFAULT_MAX_SHAPE_RECTS = 1024;
const HARD_MAX_SHAPE_RECTS = 4096;

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeRect(value) {
  if (!value || typeof value !== 'object') return null;
  const x = finiteNumber(value.x, NaN);
  const y = finiteNumber(value.y, NaN);
  const width = finiteNumber(value.width, NaN);
  const height = finiteNumber(value.height, NaN);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function outwardIntegerRect(value) {
  const rect = normalizeRect(value);
  if (!rect) return null;
  const left = Math.floor(rect.x);
  const top = Math.floor(rect.y);
  const right = Math.ceil(rect.x + rect.width);
  const bottom = Math.ceil(rect.y + rect.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function inwardIntegerRect(value) {
  const rect = normalizeRect(value);
  if (!rect) return null;
  const left = Math.ceil(rect.x);
  const top = Math.ceil(rect.y);
  const right = Math.floor(rect.x + rect.width);
  const bottom = Math.floor(rect.y + rect.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function clipRect(value, bounds) {
  const rect = normalizeRect(value);
  const limit = normalizeRect(bounds);
  if (!rect || !limit) return null;
  const left = Math.max(rect.x, limit.x);
  const top = Math.max(rect.y, limit.y);
  const right = Math.min(rect.x + rect.width, limit.x + limit.width);
  const bottom = Math.min(rect.y + rect.height, limit.y + limit.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function desktopIconProbeScript(options = {}) {
  const extraCSharp = String(options.extraCSharp || '');
  const invocation = options.invoke === false
    ? ''
    : '[MineradioDesktopIconShapeNative]::Probe() | ConvertTo-Json -Compress -Depth 5';
  return `
$ErrorActionPreference = "Stop"
if (-not ("MineradioDesktopIconShapeNative" -as [type])) {
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class MineradioDesktopIconShapeNative {
  public sealed class IconRect {
    public int x;
    public int y;
    public int width;
    public int height;
  }

  public sealed class ProbeResult {
    public bool ok;
    public string iconHostWindowId;
    public string listViewWindowId;
    public string topLevelHostWindowId;
    public int processId;
    public bool physicalPixels;
    public IconRect[] icons;
  }

  [StructLayout(LayoutKind.Sequential)] private struct POINT {
    public int X;
    public int Y;
  }

  private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  private const uint PROCESS_VM_OPERATION = 0x0008;
  private const uint PROCESS_VM_READ = 0x0010;
  private const uint PROCESS_VM_WRITE = 0x0020;
  private const uint MEM_COMMIT = 0x1000;
  private const uint MEM_RESERVE = 0x2000;
  private const uint MEM_RELEASE = 0x8000;
  private const uint PAGE_READWRITE = 0x04;
  private const uint LVM_FIRST = 0x1000;
  private const uint LVM_GETITEMCOUNT = LVM_FIRST + 4;
  private const uint LVM_GETITEMRECT = LVM_FIRST + 14;
  private const uint SMTO_ABORTIFHUNG = 0x0002;

  [DllImport("user32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr state);

  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowName);

  [DllImport("user32.dll", SetLastError=true)]
  private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll", SetLastError=true)]
  private static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam,
    uint flags, uint timeout, out IntPtr result);

  [DllImport("user32.dll", SetLastError=true)]
  private static extern int MapWindowPoints(IntPtr from, IntPtr to, ref POINT point, uint pointCount);

  [DllImport("user32.dll")]
  private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);

  [DllImport("kernel32.dll", SetLastError=true)]
  private static extern IntPtr OpenProcess(uint access, [MarshalAs(UnmanagedType.Bool)] bool inheritHandle, uint processId);

  [DllImport("kernel32.dll", SetLastError=true)]
  private static extern IntPtr VirtualAllocEx(IntPtr process, IntPtr address, UIntPtr size, uint allocationType, uint protect);

  [DllImport("kernel32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool VirtualFreeEx(IntPtr process, IntPtr address, UIntPtr size, uint freeType);

  [DllImport("kernel32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool WriteProcessMemory(IntPtr process, IntPtr address, byte[] buffer,
    UIntPtr size, out UIntPtr written);

  [DllImport("kernel32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] buffer,
    UIntPtr size, out UIntPtr read);

  [DllImport("kernel32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool CloseHandle(IntPtr handle);

  public static void FindDesktopListView(out IntPtr topLevelHost, out IntPtr iconHost, out IntPtr listView) {
    topLevelHost = IntPtr.Zero;
    iconHost = IntPtr.Zero;
    listView = IntPtr.Zero;
    IntPtr foundTop = IntPtr.Zero;
    IntPtr foundHost = IntPtr.Zero;
    IntPtr foundList = IntPtr.Zero;
    EnumWindowsProc callback = delegate(IntPtr top, IntPtr state) {
      IntPtr host = FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
      if (host == IntPtr.Zero) return true;
      IntPtr list = FindWindowEx(host, IntPtr.Zero, "SysListView32", null);
      if (list == IntPtr.Zero) return true;
      foundTop = top;
      foundHost = host;
      foundList = list;
      return false;
    };
    EnumWindows(callback, IntPtr.Zero);
    topLevelHost = foundTop;
    iconHost = foundHost;
    listView = foundList;
  }

  public static ProbeResult Probe() {
    IntPtr previousDpiContext = IntPtr.Zero;
    IntPtr process = IntPtr.Zero;
    IntPtr remoteRect = IntPtr.Zero;
    try {
      try { previousDpiContext = SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { }

      IntPtr topLevelHost;
      IntPtr iconHost;
      IntPtr listView;
      FindDesktopListView(out topLevelHost, out iconHost, out listView);
      if (listView == IntPtr.Zero) throw new InvalidOperationException("DESKTOP_ICON_LISTVIEW_NOT_FOUND");

      uint processId;
      if (GetWindowThreadProcessId(listView, out processId) == 0 || processId == 0)
        throw new InvalidOperationException("DESKTOP_ICON_PROCESS_NOT_FOUND");

      process = OpenProcess(PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE, false, processId);
      if (process == IntPtr.Zero) throw new InvalidOperationException("DESKTOP_ICON_PROCESS_OPEN_FAILED");

      const int rectBytes = 16;
      remoteRect = VirtualAllocEx(process, IntPtr.Zero, new UIntPtr(rectBytes),
        MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
      if (remoteRect == IntPtr.Zero) throw new InvalidOperationException("DESKTOP_ICON_REMOTE_ALLOC_FAILED");

      IntPtr countValue;
      if (SendMessageTimeout(listView, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero,
          SMTO_ABORTIFHUNG, 500, out countValue) == IntPtr.Zero)
        throw new InvalidOperationException("DESKTOP_ICON_COUNT_TIMEOUT");
      int count = Math.Max(0, Math.Min(4096, countValue.ToInt32()));
      List<IconRect> icons = new List<IconRect>(count);

      // LVIR_ICON + LVIR_LABEL avoid exposing the empty rectangular space in
      // LVIR_BOUNDS, which otherwise shows Explorer's dark cell background.
      int[] visibleParts = new int[] { 1, 2 };
      for (int index = 0; index < count; index++) {
        foreach (int visiblePart in visibleParts) {
          byte[] request = new byte[rectBytes];
          Buffer.BlockCopy(BitConverter.GetBytes(visiblePart), 0, request, 0, 4);
          UIntPtr transferred;
          if (!WriteProcessMemory(process, remoteRect, request, new UIntPtr(rectBytes), out transferred)
              || transferred.ToUInt64() != rectBytes) continue;

          IntPtr itemResult;
          if (SendMessageTimeout(listView, LVM_GETITEMRECT, new IntPtr(index), remoteRect,
              SMTO_ABORTIFHUNG, 500, out itemResult) == IntPtr.Zero || itemResult == IntPtr.Zero) continue;

          byte[] response = new byte[rectBytes];
          if (!ReadProcessMemory(process, remoteRect, response, new UIntPtr(rectBytes), out transferred)
              || transferred.ToUInt64() != rectBytes) continue;

          int left = BitConverter.ToInt32(response, 0);
          int top = BitConverter.ToInt32(response, 4);
          int right = BitConverter.ToInt32(response, 8);
          int bottom = BitConverter.ToInt32(response, 12);
          if (right <= left || bottom <= top) continue;

          POINT screenTopLeft = new POINT { X = left, Y = top };
          POINT screenBottomRight = new POINT { X = right, Y = bottom };
          MapWindowPoints(listView, IntPtr.Zero, ref screenTopLeft, 1);
          MapWindowPoints(listView, IntPtr.Zero, ref screenBottomRight, 1);
          if (screenBottomRight.X <= screenTopLeft.X || screenBottomRight.Y <= screenTopLeft.Y) continue;
          icons.Add(new IconRect {
            x = screenTopLeft.X,
            y = screenTopLeft.Y,
            width = screenBottomRight.X - screenTopLeft.X,
            height = screenBottomRight.Y - screenTopLeft.Y
          });
        }
      }

      return new ProbeResult {
        ok = true,
        iconHostWindowId = iconHost.ToInt64().ToString(),
        listViewWindowId = listView.ToInt64().ToString(),
        topLevelHostWindowId = topLevelHost.ToInt64().ToString(),
        processId = unchecked((int)processId),
        physicalPixels = true,
        icons = icons.ToArray()
      };
    } finally {
      if (remoteRect != IntPtr.Zero && process != IntPtr.Zero)
        VirtualFreeEx(process, remoteRect, UIntPtr.Zero, MEM_RELEASE);
      if (process != IntPtr.Zero) CloseHandle(process);
      if (previousDpiContext != IntPtr.Zero) {
        try { SetThreadDpiAwarenessContext(previousDpiContext); } catch { }
      }
    }
  }
}
${extraCSharp}
"@
}
${invocation}
`;
}

function desktopIconWatcherCSharpSource() {
  return `
public static class MineradioDesktopIconShapeWatcherNative {
  [StructLayout(LayoutKind.Sequential)] private struct MSG {
    public IntPtr hwnd;
    public uint message;
    public UIntPtr wParam;
    public IntPtr lParam;
    public uint time;
    public int x;
    public int y;
  }

  private delegate void WinEventDelegate(IntPtr hook, uint eventType, IntPtr hWnd,
    int objectId, int childId, uint eventThread, uint eventTime);

  private const uint EVENT_OBJECT_CREATE = 0x8000;
  private const uint EVENT_OBJECT_REORDER = 0x8004;
  private const uint EVENT_OBJECT_LOCATIONCHANGE = 0x800B;
  private const uint WINEVENT_OUTOFCONTEXT = 0x0000;
  private const uint WINEVENT_SKIPOWNPROCESS = 0x0002;
  private const uint WM_TIMER = 0x0113;
  private const uint WM_QUIT = 0x0012;
  private const uint PM_NOREMOVE = 0x0000;

  [DllImport("user32.dll", SetLastError=true)]
  private static extern IntPtr SetWinEventHook(uint eventMin, uint eventMax, IntPtr module,
    WinEventDelegate callback, uint processId, uint threadId, uint flags);

  [DllImport("user32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool UnhookWinEvent(IntPtr hook);

  [DllImport("user32.dll", SetLastError=true)]
  private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool IsChild(IntPtr parent, IntPtr child);

  [DllImport("user32.dll", SetLastError=true)]
  private static extern UIntPtr SetTimer(IntPtr hWnd, UIntPtr id, uint interval, IntPtr callback);

  [DllImport("user32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool KillTimer(IntPtr hWnd, UIntPtr id);

  [DllImport("user32.dll")]
  private static extern int GetMessage(out MSG message, IntPtr hWnd, uint min, uint max);

  [DllImport("user32.dll")]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool PeekMessage(out MSG message, IntPtr hWnd, uint min, uint max, uint remove);

  [DllImport("user32.dll")]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool TranslateMessage(ref MSG message);

  [DllImport("user32.dll")]
  private static extern IntPtr DispatchMessage(ref MSG message);

  [DllImport("user32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool PostThreadMessage(uint threadId, uint message, UIntPtr wParam, IntPtr lParam);

  [DllImport("kernel32.dll")]
  private static extern uint GetCurrentThreadId();

  private static readonly object StateLock = new object();
  private static readonly WinEventDelegate EventCallback = HandleWinEvent;
  private static IntPtr _topLevelHost = IntPtr.Zero;
  private static IntPtr _iconHost = IntPtr.Zero;
  private static IntPtr _listView = IntPtr.Zero;
  private static IntPtr _rangeHook = IntPtr.Zero;
  private static IntPtr _locationHook = IntPtr.Zero;
  private static uint _explorerProcessId;
  private static uint _explorerThreadId;
  private static int _debounceMs = 140;
  private static long _dueAt;
  private static bool _pending;
  private static string _lastLayoutKey = "";
  private static string _lastError = "";

  private static long NowMs() {
    return DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond;
  }

  private static void HandleWinEvent(IntPtr hook, uint eventType, IntPtr hWnd,
      int objectId, int childId, uint eventThread, uint eventTime) {
    if (hWnd != _listView && hWnd != _iconHost && (_listView == IntPtr.Zero || !IsChild(_listView, hWnd))) return;
    lock (StateLock) {
      _pending = true;
      _dueAt = NowMs() + _debounceMs;
    }
  }

  private static void RemoveHooks() {
    if (_rangeHook != IntPtr.Zero) {
      UnhookWinEvent(_rangeHook);
      _rangeHook = IntPtr.Zero;
    }
    if (_locationHook != IntPtr.Zero) {
      UnhookWinEvent(_locationHook);
      _locationHook = IntPtr.Zero;
    }
  }

  private static string LayoutKey(MineradioDesktopIconShapeNative.ProbeResult result) {
    System.Text.StringBuilder key = new System.Text.StringBuilder();
    key.Append(result.topLevelHostWindowId).Append('|').Append(result.iconHostWindowId)
      .Append('|').Append(result.listViewWindowId);
    if (result.icons != null) {
      foreach (MineradioDesktopIconShapeNative.IconRect icon in result.icons) {
        key.Append('|').Append(icon.x).Append(',').Append(icon.y).Append(',')
          .Append(icon.width).Append(',').Append(icon.height);
      }
    }
    return key.ToString();
  }

  private static void Emit(MineradioDesktopIconShapeNative.ProbeResult result, bool force) {
    string key = LayoutKey(result);
    if (!force && key == _lastLayoutKey) return;
    _lastLayoutKey = key;
    _lastError = "";
    System.Text.StringBuilder json = new System.Text.StringBuilder();
    json.Append("{\\\"ok\\\":true,\\\"watcher\\\":true,\\\"iconHostWindowId\\\":\\\"")
      .Append(result.iconHostWindowId).Append("\\\",\\\"listViewWindowId\\\":\\\"")
      .Append(result.listViewWindowId).Append("\\\",\\\"topLevelHostWindowId\\\":\\\"")
      .Append(result.topLevelHostWindowId).Append("\\\",\\\"processId\\\":")
      .Append(result.processId).Append(",\\\"physicalPixels\\\":true,\\\"icons\\\":[");
    if (result.icons != null) {
      for (int index = 0; index < result.icons.Length; index++) {
        if (index > 0) json.Append(',');
        MineradioDesktopIconShapeNative.IconRect icon = result.icons[index];
        json.Append("{\\\"x\\\":").Append(icon.x).Append(",\\\"y\\\":").Append(icon.y)
          .Append(",\\\"width\\\":").Append(icon.width).Append(",\\\"height\\\":").Append(icon.height).Append('}');
      }
    }
    json.Append("]}");
    Console.Out.WriteLine(json.ToString());
    Console.Out.Flush();
  }

  private static void EmitError(string code) {
    if (code == _lastError) return;
    _lastError = code;
    Console.Out.WriteLine("{\\\"ok\\\":false,\\\"watcher\\\":true,\\\"error\\\":\\\"" + code + "\\\"}");
    Console.Out.Flush();
  }

  private static bool FindTarget(out IntPtr topLevelHost, out IntPtr iconHost, out IntPtr listView,
      out uint processId, out uint threadId) {
    MineradioDesktopIconShapeNative.FindDesktopListView(out topLevelHost, out iconHost, out listView);
    processId = 0;
    threadId = 0;
    if (listView == IntPtr.Zero) return false;
    threadId = GetWindowThreadProcessId(listView, out processId);
    return processId != 0 && threadId != 0;
  }

  private static void RebindIfNeeded(bool forceSnapshot) {
    IntPtr topLevelHost;
    IntPtr iconHost;
    IntPtr listView;
    uint processId;
    uint threadId;
    if (!FindTarget(out topLevelHost, out iconHost, out listView, out processId, out threadId)) {
      RemoveHooks();
      _topLevelHost = IntPtr.Zero;
      _iconHost = IntPtr.Zero;
      _listView = IntPtr.Zero;
      _explorerProcessId = 0;
      _explorerThreadId = 0;
      EmitError("DESKTOP_ICON_LISTVIEW_NOT_FOUND");
      return;
    }
    bool changed = topLevelHost != _topLevelHost || listView != _listView
      || processId != _explorerProcessId || threadId != _explorerThreadId
      || _rangeHook == IntPtr.Zero || _locationHook == IntPtr.Zero;
    if (changed) {
      RemoveHooks();
      _topLevelHost = topLevelHost;
      _iconHost = iconHost;
      _listView = listView;
      _explorerProcessId = processId;
      _explorerThreadId = threadId;
      _rangeHook = SetWinEventHook(EVENT_OBJECT_CREATE, EVENT_OBJECT_REORDER, IntPtr.Zero,
        EventCallback, processId, threadId, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
      _locationHook = SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_LOCATIONCHANGE, IntPtr.Zero,
        EventCallback, processId, threadId, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
      if (_rangeHook == IntPtr.Zero || _locationHook == IntPtr.Zero) {
        EmitError("DESKTOP_ICON_EVENT_HOOK_FAILED");
        return;
      }
    }
    if (changed || forceSnapshot) {
      try { Emit(MineradioDesktopIconShapeNative.Probe(), changed || forceSnapshot); }
      catch { EmitError("DESKTOP_ICON_PROBE_FAILED"); }
    }
  }

  private static void EmitPendingLayout() {
    bool ready = false;
    lock (StateLock) {
      if (_pending && NowMs() >= _dueAt) {
        _pending = false;
        ready = true;
      }
    }
    if (!ready) return;
    try { Emit(MineradioDesktopIconShapeNative.Probe(), false); }
    catch { EmitError("DESKTOP_ICON_PROBE_FAILED"); }
  }

  public static void Run(int debounceMs, int rebindMs) {
    _debounceMs = Math.Max(100, Math.Min(180, debounceMs));
    int safeRebindMs = Math.Max(1000, Math.Min(10000, rebindMs));
    uint ownerThreadId = GetCurrentThreadId();
    MSG unused;
    PeekMessage(out unused, IntPtr.Zero, 0, 0, PM_NOREMOVE);
    System.Threading.Thread inputThread = new System.Threading.Thread(delegate() {
      try {
        while (true) {
          string line = Console.In.ReadLine();
          if (line == null || String.Equals(line.Trim(), "Q", StringComparison.OrdinalIgnoreCase)) {
            PostThreadMessage(ownerThreadId, WM_QUIT, UIntPtr.Zero, IntPtr.Zero);
            return;
          }
        }
      } catch {
        PostThreadMessage(ownerThreadId, WM_QUIT, UIntPtr.Zero, IntPtr.Zero);
      }
    });
    inputThread.IsBackground = true;
    inputThread.Name = "Mineradio desktop icon watcher input";
    inputThread.Start();

    UIntPtr timerId = UIntPtr.Zero;
    try {
      RebindIfNeeded(true);
      timerId = SetTimer(IntPtr.Zero, new UIntPtr(1), 50, IntPtr.Zero);
      if (timerId == UIntPtr.Zero) throw new InvalidOperationException("DESKTOP_ICON_WATCHER_TIMER_FAILED");
      long nextRebindAt = NowMs() + safeRebindMs;
      MSG message;
      while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0) {
        if (message.message == WM_TIMER) {
          long now = NowMs();
          if (now >= nextRebindAt) {
            nextRebindAt = now + safeRebindMs;
            RebindIfNeeded(false);
          }
          EmitPendingLayout();
        }
        TranslateMessage(ref message);
        DispatchMessage(ref message);
      }
    } finally {
      if (timerId != UIntPtr.Zero) KillTimer(IntPtr.Zero, timerId);
      RemoveHooks();
      _topLevelHost = IntPtr.Zero;
      _iconHost = IntPtr.Zero;
      _listView = IntPtr.Zero;
    }
  }
}
`;
}

function desktopIconWatcherScript(options = {}) {
  const debounceMs = Math.max(100, Math.min(180, Math.round(finiteNumber(options.debounceMs, 140))));
  const rebindMs = Math.max(1000, Math.min(10000, Math.round(finiteNumber(options.rebindMs, 2000))));
  return `${desktopIconProbeScript({ invoke: false, extraCSharp: desktopIconWatcherCSharpSource() })}
[MineradioDesktopIconShapeWatcherNative]::Run(${debounceMs}, ${rebindMs})
`;
}

function parseDesktopIconProbeOutput(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index]);
      if (!value || value.ok !== true || !/^\d+$/.test(String(value.iconHostWindowId || ''))
        || !/^\d+$/.test(String(value.listViewWindowId || ''))
        || !/^\d+$/.test(String(value.topLevelHostWindowId || ''))
        || String(value.topLevelHostWindowId) === '0' || value.physicalPixels !== true) continue;
      const icons = Array.isArray(value.icons) ? value.icons : [];
      return {
        ok: true,
        iconHostWindowId: String(value.iconHostWindowId),
        listViewWindowId: String(value.listViewWindowId),
        topLevelHostWindowId: String(value.topLevelHostWindowId || ''),
        processId: Math.max(0, Math.round(finiteNumber(value.processId, 0))),
        physicalPixels: true,
        icons: icons.map(outwardIntegerRect).filter(Boolean),
      };
    } catch (_) { }
  }
  throw new Error('DESKTOP_ICON_PROBE_ACK_INVALID');
}

function probeFailureCode(error, stderr) {
  const diagnostic = String(stderr || error && error.message || 'DESKTOP_ICON_PROBE_FAILED');
  const match = diagnostic.match(/DESKTOP_ICON_[A-Z0-9_]+/);
  return match ? match[0] : String(error && error.code || 'DESKTOP_ICON_PROBE_FAILED');
}

function probeDesktopIcons(options = {}) {
  const execFileImpl = options.execFileImpl || execFile;
  if (typeof execFileImpl !== 'function') return Promise.reject(new Error('DESKTOP_ICON_EXEC_UNAVAILABLE'));
  const script = desktopIconProbeScript();
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
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const handleAbort = () => {
      try { if (child && typeof child.kill === 'function') child.kill(); } catch (_) { }
      const failure = new Error('DESKTOP_ICON_PROBE_ABORTED');
      failure.code = failure.message;
      finish(reject, failure);
    };
    if (signal && signal.aborted) return handleAbort();
    if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', handleAbort, { once: true });
    try {
      child = execFileImpl(
        String(options.powershellPath || 'powershell.exe'),
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
        {
          windowsHide: true,
          timeout: Math.max(1000, Math.min(15000, finiteNumber(options.timeoutMs, DEFAULT_PROBE_TIMEOUT_MS))),
          maxBuffer: 1024 * 1024,
          env,
        },
        (error, stdout, stderr) => {
          if (settled) return;
          if (error) {
            const failure = new Error(probeFailureCode(error, stderr));
            failure.code = failure.message;
            finish(reject, failure);
            return;
          }
          try {
            finish(resolve, parseDesktopIconProbeOutput(stdout));
          } catch (parseError) {
            finish(reject, parseError);
          }
        }
      );
    } catch (error) {
      const failure = new Error(probeFailureCode(error, ''));
      failure.code = failure.message;
      finish(reject, failure);
    }
  });
}

function startDesktopIconWatcher(options = {}) {
  const spawnImpl = options.spawnImpl || spawn;
  if (typeof spawnImpl !== 'function') throw new Error('DESKTOP_ICON_WATCHER_SPAWN_UNAVAILABLE');
  const env = { ...process.env };
  const nativeTempPath = String(options.nativeTempPath || '').trim();
  if (nativeTempPath) {
    env.TEMP = nativeTempPath;
    env.TMP = nativeTempPath;
  }
  const child = spawnImpl(
    String(options.powershellPath || 'powershell.exe'),
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', desktopIconWatcherScript(options)],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env }
  );
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let exited = false;
  let exitCode = null;
  let exitNotified = false;
  let stopPromise = null;
  let lastLayout = null;
  const signal = options.signal;
  const reportError = (value) => {
    if (typeof options.onError === 'function') {
      try { options.onError(value); } catch (_) { }
    }
  };
  const notifyExit = (details) => {
    if (exitNotified) return;
    exitNotified = true;
    if (typeof options.onExit === 'function') {
      try { options.onExit(details); } catch (_) { }
    }
  };
  const consumeLine = (line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed) return;
    try {
      const raw = JSON.parse(trimmed);
      if (raw && raw.ok === false) {
        reportError(String(raw.error || 'DESKTOP_ICON_WATCHER_FAILED'));
        return;
      }
      const layout = parseDesktopIconProbeOutput(trimmed);
      lastLayout = layout;
      if (typeof options.onLayout === 'function') {
        try { options.onLayout(layout); } catch (error) { reportError(error); }
      }
    } catch (_) {
      if (typeof options.onDiagnostic === 'function') {
        try { options.onDiagnostic(trimmed); } catch (_) { }
      }
    }
  };
  const consumeStdout = (chunk) => {
    stdoutBuffer += String(chunk || '');
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';
    for (const line of lines) consumeLine(line);
  };
  const consumeStderr = (chunk) => {
    stderrBuffer = (stderrBuffer + String(chunk || '')).slice(-32768);
  };
  if (child.stdout && typeof child.stdout.on === 'function') child.stdout.on('data', consumeStdout);
  if (child.stderr && typeof child.stderr.on === 'function') child.stderr.on('data', consumeStderr);
  if (typeof child.on === 'function') {
    child.on('error', (error) => {
      reportError(error);
      if (exited) return;
      exited = true;
      exitCode = null;
      notifyExit({ code: null, signal: '', stderr: stderrBuffer, error });
    });
    child.on('exit', (code, signalName) => {
      if (exited && exitNotified) return;
      exited = true;
      exitCode = code;
      if (stdoutBuffer.trim()) consumeLine(stdoutBuffer);
      stdoutBuffer = '';
      if (code !== 0 && code != null) {
        reportError(String(stderrBuffer.match(/DESKTOP_ICON_[A-Z0-9_]+/) || '') || `DESKTOP_ICON_WATCHER_EXIT_${code}`);
      }
      notifyExit({ code, signal: signalName || '', stderr: stderrBuffer });
    });
  }
  const stop = (timeoutMs = 1500) => {
    if (stopPromise) return stopPromise;
    stopPromise = new Promise((resolve) => {
      if (exited) {
        resolve({ ok: exitCode === 0 || exitCode == null, code: exitCode });
        return;
      }
      let settled = false;
      let timer = null;
      const finish = (code) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve({ ok: code === 0 || code == null, code });
      };
      if (typeof child.once === 'function') child.once('exit', finish);
      try {
        if (child.stdin && typeof child.stdin.write === 'function') child.stdin.write('Q\n');
        else if (typeof child.kill === 'function') child.kill();
      } catch (_) {
        try { if (typeof child.kill === 'function') child.kill(); } catch (_) { }
      }
      timer = setTimeout(() => {
        try { if (!exited && typeof child.kill === 'function') child.kill(); } catch (_) { }
        finish(exitCode);
      }, Math.max(250, Math.min(5000, finiteNumber(timeoutMs, 1500))));
      if (timer && typeof timer.unref === 'function') timer.unref();
    });
    return stopPromise;
  };
  const handleAbort = () => { stop().catch(() => { }); };
  if (signal) {
    if (signal.aborted) handleAbort();
    else if (typeof signal.addEventListener === 'function') signal.addEventListener('abort', handleAbort, { once: true });
  }
  return {
    child,
    stop,
    dispose: stop,
    getLastLayout: () => lastLayout,
    isRunning: () => !exited,
  };
}

function physicalIconRectsToDisplayDip(physicalRects, target = {}) {
  const dipBounds = normalizeRect(target.bounds || target.dipBounds);
  const physicalBounds = normalizeRect(target.physicalBounds);
  if (!dipBounds || !physicalBounds) throw new Error('DESKTOP_ICON_DISPLAY_BOUNDS_INVALID');
  const scaleX = physicalBounds.width / dipBounds.width;
  const scaleY = physicalBounds.height / dipBounds.height;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    throw new Error('DESKTOP_ICON_DISPLAY_SCALE_INVALID');
  }
  const padding = Math.max(0, Math.min(48, finiteNumber(target.paddingDip, 0)));
  return (Array.isArray(physicalRects) ? physicalRects : []).map((value) => {
    const clipped = clipRect(value, physicalBounds);
    if (!clipped) return null;
    const left = dipBounds.x + (clipped.x - physicalBounds.x) / scaleX - padding;
    const top = dipBounds.y + (clipped.y - physicalBounds.y) / scaleY - padding;
    const right = dipBounds.x + (clipped.x + clipped.width - physicalBounds.x) / scaleX + padding;
    const bottom = dipBounds.y + (clipped.y + clipped.height - physicalBounds.y) / scaleY + padding;
    const mapped = { x: left, y: top, width: right - left, height: bottom - top };
    return target.rounding === 'inward' ? inwardIntegerRect(mapped) : outwardIntegerRect(mapped);
  }).filter(Boolean).map((rect) => clipRect(rect, outwardIntegerRect(dipBounds))).filter(Boolean);
}

function mergeIntervals(intervals, left, right) {
  const ordered = intervals.map((interval) => ({
    start: Math.max(left, interval.start),
    end: Math.min(right, interval.end),
  })).filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const interval of ordered) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

function subtractIntervals(left, right, holes) {
  const result = [];
  let cursor = left;
  for (const hole of mergeIntervals(holes, left, right)) {
    if (hole.start > cursor) result.push({ start: cursor, end: hole.start });
    cursor = Math.max(cursor, hole.end);
  }
  if (cursor < right) result.push({ start: cursor, end: right });
  return result;
}

function coalesceShapeRects(rects) {
  let current = rects.slice();
  let changed = true;
  for (let pass = 0; changed && pass < 4; pass += 1) {
    changed = false;
    const horizontal = [];
    current.sort((a, b) => a.y - b.y || a.height - b.height || a.x - b.x);
    for (const rect of current) {
      const previous = horizontal[horizontal.length - 1];
      if (previous && previous.y === rect.y && previous.height === rect.height
        && rect.x <= previous.x + previous.width) {
        previous.width = Math.max(previous.x + previous.width, rect.x + rect.width) - previous.x;
        changed = true;
      } else horizontal.push({ ...rect });
    }
    const vertical = [];
    horizontal.sort((a, b) => a.x - b.x || a.width - b.width || a.y - b.y);
    for (const rect of horizontal) {
      const previous = vertical[vertical.length - 1];
      if (previous && previous.x === rect.x && previous.width === rect.width
        && rect.y <= previous.y + previous.height) {
        previous.height = Math.max(previous.y + previous.height, rect.y + rect.height) - previous.y;
        changed = true;
      } else vertical.push({ ...rect });
    }
    current = vertical;
  }
  return current.sort((a, b) => a.y - b.y || a.x - b.x || a.height - b.height || a.width - b.width);
}

function computeDesktopShapeRects(options = {}) {
  const full = outwardIntegerRect(options.bounds || options.fullBounds);
  if (!full) throw new Error('DESKTOP_ICON_SHAPE_BOUNDS_INVALID');
  const holes = (Array.isArray(options.iconRects) ? options.iconRects : options.holes || [])
    .map(outwardIntegerRect).map((rect) => clipRect(rect, full)).filter(Boolean);
  const shieldsInput = options.protectedShields || options.shields || options.protectedRects || [];
  const shields = (Array.isArray(shieldsInput) ? shieldsInput : [])
    .map(outwardIntegerRect).map((rect) => clipRect(rect, full)).filter(Boolean);
  const maxRects = Math.max(1, Math.min(
    HARD_MAX_SHAPE_RECTS,
    Math.round(finiteNumber(options.maxRects, DEFAULT_MAX_SHAPE_RECTS))
  ));

  const top = full.y;
  const bottom = full.y + full.height;
  const left = full.x;
  const right = full.x + full.width;
  const yStops = new Set([top, bottom]);
  for (const rect of holes.concat(shields)) {
    yStops.add(rect.y);
    yStops.add(rect.y + rect.height);
  }
  const bands = [...yStops].sort((a, b) => a - b);
  const finished = [];
  let active = new Map();

  for (let index = 0; index < bands.length - 1; index += 1) {
    const bandTop = bands[index];
    const bandBottom = bands[index + 1];
    if (bandBottom <= bandTop) continue;
    const holeIntervals = holes.filter((rect) => rect.y < bandBottom && rect.y + rect.height > bandTop)
      .map((rect) => ({ start: rect.x, end: rect.x + rect.width }));
    const shieldIntervals = shields.filter((rect) => rect.y < bandBottom && rect.y + rect.height > bandTop)
      .map((rect) => ({ start: rect.x, end: rect.x + rect.width }));
    const included = mergeIntervals(subtractIntervals(left, right, holeIntervals).concat(shieldIntervals), left, right);
    const nextActive = new Map();
    for (const interval of included) {
      const localX = interval.start - full.x;
      const localY = bandTop - full.y;
      const width = interval.end - interval.start;
      const height = bandBottom - bandTop;
      const key = `${localX}:${width}`;
      const previous = active.get(key);
      if (previous && previous.y + previous.height === localY) {
        previous.height += height;
        nextActive.set(key, previous);
      } else {
        const rect = { x: localX, y: localY, width, height };
        nextActive.set(key, rect);
      }
    }
    for (const [key, rect] of active) {
      if (!nextActive.has(key) || nextActive.get(key) !== rect) finished.push(rect);
    }
    active = nextActive;
  }
  finished.push(...active.values());
  const result = coalesceShapeRects(finished).filter((rect) => rect.width > 0 && rect.height > 0);
  if (result.length > maxRects) {
    const failure = new Error('DESKTOP_ICON_SHAPE_TOO_COMPLEX');
    failure.code = failure.message;
    failure.rectCount = result.length;
    failure.maxRects = maxRects;
    throw failure;
  }
  return result;
}

function applyDesktopIconShape(win, options = {}) {
  if (!win || typeof win.setShape !== 'function') {
    return { ok: false, applied: false, error: 'DESKTOP_ICON_SHAPE_UNAVAILABLE', rects: [] };
  }
  let rects;
  try {
    rects = Array.isArray(options) ? options : options.rects || computeDesktopShapeRects(options);
    const normalized = rects.map(outwardIntegerRect).filter(Boolean);
    win.setShape(normalized);
    return { ok: true, applied: true, rectCount: normalized.length, rects: normalized };
  } catch (error) {
    return {
      ok: false,
      applied: false,
      error: String(error && error.code || error && error.message || error || 'DESKTOP_ICON_SHAPE_APPLY_FAILED'),
      rects: [],
    };
  }
}

function clearDesktopIconShape(win) {
  if (!win || typeof win.setShape !== 'function') {
    return { ok: false, cleared: false, error: 'DESKTOP_ICON_SHAPE_UNAVAILABLE' };
  }
  try {
    win.setShape([]);
    return { ok: true, cleared: true };
  } catch (error) {
    return {
      ok: false,
      cleared: false,
      error: String(error && error.message || error || 'DESKTOP_ICON_SHAPE_CLEAR_FAILED'),
    };
  }
}

module.exports = {
  DEFAULT_MAX_SHAPE_RECTS,
  applyDesktopIconShape,
  clearDesktopIconShape,
  computeDesktopShapeRects,
  desktopIconProbeScript,
  desktopIconWatcherScript,
  parseDesktopIconProbeOutput,
  physicalIconRectsToDisplayDip,
  probeDesktopIcons,
  startDesktopIconWatcher,
};
