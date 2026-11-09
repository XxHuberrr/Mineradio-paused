'use strict';

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { PassThrough } = require('stream');
const { desktopIconProbeScript } = require('./desktop-icon-shape-runtime');

const DEFAULT_COMMAND_TIMEOUT_MS = 2400;

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
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.ceil(x + width);
  const bottom = Math.ceil(y + height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function nativeIconLayerGuardCSharpSource() {
  return String.raw`
public static class MineradioDesktopNativeIconLayerGuard {
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
  private const uint EVENT_OBJECT_DESTROY = 0x8001;
  private const uint EVENT_OBJECT_REORDER = 0x8004;
  private const uint EVENT_OBJECT_LOCATIONCHANGE = 0x800B;
  private const uint WINEVENT_OUTOFCONTEXT = 0x0000;
  private const uint WINEVENT_SKIPOWNPROCESS = 0x0002;
  private const uint WM_TIMER = 0x0113;
  private const uint WM_QUIT = 0x0012;
  private const uint PM_NOREMOVE = 0x0000;
  private const uint GA_ROOT = 2;
  private const int SW_HIDE = 0;
  private const int SW_SHOW = 5;
  private const int GWL_EXSTYLE = -20;
  private const uint WS_EX_LAYERED = 0x00080000;
  private const uint LWA_COLORKEY = 0x00000001;
  private const uint LVM_GETBKCOLOR = 0x1000;
  private const uint LVM_SETBKCOLOR = 0x1001;
  private const uint SMTO_ABORTIFHUNG = 0x0002;
  private const uint DESKTOP_LAYER_COLOR_KEY = 0x00000000;
  private const uint SWP_NOSIZE = 0x0001;
  private const uint SWP_NOMOVE = 0x0002;
  private const uint SWP_NOACTIVATE = 0x0010;
  private const uint RDW_INVALIDATE = 0x0001;
  private const uint RDW_ERASE = 0x0004;
  private const uint RDW_ALLCHILDREN = 0x0080;
  private const uint RDW_UPDATENOW = 0x0100;
  private static readonly IntPtr HWND_BOTTOM = new IntPtr(1);

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
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool IsWindow(IntPtr hWnd);

  [DllImport("user32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool ShowWindow(IntPtr hWnd, int command);

  [DllImport("user32.dll", SetLastError=true)]
  private static extern IntPtr GetParent(IntPtr hWnd);

  [DllImport("user32.dll", SetLastError=true)]
  private static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);

  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  private static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder text, int count);

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

  [DllImport("user32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y,
    int width, int height, uint flags);

  [DllImport("user32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool SetLayeredWindowAttributes(IntPtr hWnd, uint colorKey, byte alpha, uint flags);

  [DllImport("user32.dll", SetLastError=true)]
  private static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam,
    uint flags, uint timeout, out IntPtr result);

  [DllImport("user32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool GetLayeredWindowAttributes(IntPtr hWnd, out uint colorKey, out byte alpha, out uint flags);

  [DllImport("user32.dll", EntryPoint="GetWindowLongPtr", SetLastError=true)]
  private static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);

  [DllImport("user32.dll", EntryPoint="SetWindowLongPtr", SetLastError=true)]
  private static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int index, IntPtr value);

  [DllImport("user32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool RedrawWindow(IntPtr hWnd, IntPtr updateRect, IntPtr updateRegion, uint flags);

  private static readonly object StateLock = new object();
  private static readonly WinEventDelegate EventCallback = HandleWinEvent;
  private static IntPtr _topLevelHost = IntPtr.Zero;
  private static IntPtr _iconHost = IntPtr.Zero;
  private static IntPtr _listView = IntPtr.Zero;
  private static IntPtr _expectedIconHost = IntPtr.Zero;
  private static IntPtr _expectedListView = IntPtr.Zero;
  private static IntPtr _mainWindow = IntPtr.Zero;
  private static IntPtr _rangeHook = IntPtr.Zero;
  private static IntPtr _locationHook = IntPtr.Zero;
  private static long _originalListViewExStyle;
  private static bool _originalListViewWasLayered;
  private static bool _originalLayeredAttributesReadable;
  private static uint _originalLayeredColorKey;
  private static byte _originalLayeredAlpha;
  private static uint _originalLayeredFlags;
  private static bool _transparencySnapshotCaptured;
  private static bool _transparencyApplied;
  private static uint _originalListViewBackgroundColor;
  private static bool _backgroundSnapshotCaptured;
  private static bool _backgroundApplied;
  private static uint _explorerProcessId;
  private static uint _explorerThreadId;
  private static uint _iconHostProcessId;
  private static uint _iconHostThreadId;
  private static uint _topLevelHostProcessId;
  private static uint _topLevelHostThreadId;
  private static uint _mainProcessId;
  private static uint _mainThreadId;
  private static uint _ownerThreadId;
  private static int _ownerProcessId;
  private static string _topLevelHostClass = "";
  private static string _mainWindowClass = "";
  private static int _debounceMs = 140;
  private static long _dueAt;
  private static bool _pending;
  private static bool _locked;
  private static bool _appliedLocked;
  private static long _controlSequence;
  private static long _appliedControlSequence;
  private static bool _visibilitySnapshotCaptured;
  private static bool _originalListViewVisible;
  private static bool _desktopIconsVisible;
  private static bool _requestedIconsVisible;
  private static bool _visibilityRequestPending;
  private static long _visibilityRequestSequence;
  private static volatile bool _boundTargetDestroyed;
  private static string _lastEmittedKey = "";
  private static string _lastError = "";
  private static System.IO.TextReader _input = Console.In;
  private static System.IO.TextWriter _output = Console.Out;

  private static long NowMs() {
    return DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond;
  }

  private static string ClassName(IntPtr hWnd) {
    System.Text.StringBuilder text = new System.Text.StringBuilder(128);
    GetClassName(hWnd, text, text.Capacity);
    return text.ToString();
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

  private static long CurrentListViewExStyle() {
    return GetWindowLongPtr(_listView, GWL_EXSTYLE).ToInt64();
  }

  private static void RefreshListViewComposition() {
    uint flags = RDW_INVALIDATE | RDW_ERASE | RDW_ALLCHILDREN | RDW_UPDATENOW;
    RedrawWindow(_listView, IntPtr.Zero, IntPtr.Zero, flags);
    if (_iconHost != IntPtr.Zero && IsWindow(_iconHost))
      RedrawWindow(_iconHost, IntPtr.Zero, IntPtr.Zero, flags);
  }

  private static void SnapshotOriginalListViewTransparency() {
    if (!BoundTargetIdentityMatches())
      throw new InvalidOperationException("DESKTOP_ICON_LAYER_IDENTITY_UNCERTAIN");
    _transparencySnapshotCaptured = false;
    _originalListViewExStyle = CurrentListViewExStyle();
    _originalListViewWasLayered = (_originalListViewExStyle & (long)WS_EX_LAYERED) != 0;
    _originalLayeredAttributesReadable = false;
    _originalLayeredColorKey = 0;
    _originalLayeredAlpha = 0;
    _originalLayeredFlags = 0;
    if (_originalListViewWasLayered) {
      _originalLayeredAttributesReadable = GetLayeredWindowAttributes(_listView,
        out _originalLayeredColorKey, out _originalLayeredAlpha, out _originalLayeredFlags);
      if (!_originalLayeredAttributesReadable)
        throw new InvalidOperationException("DESKTOP_ICON_LAYER_ORIGINAL_ATTRS_UNREADABLE");
    }
    _transparencySnapshotCaptured = true;
  }

  private static IntPtr SendListViewMessage(uint message, IntPtr wParam, IntPtr lParam, string timeoutCode) {
    IntPtr result;
    if (SendMessageTimeout(_listView, message, wParam, lParam,
        SMTO_ABORTIFHUNG, 500, out result) == IntPtr.Zero)
      throw new InvalidOperationException(timeoutCode);
    return result;
  }

  private static uint CurrentListViewBackgroundColor() {
    return unchecked((uint)SendListViewMessage(LVM_GETBKCOLOR, IntPtr.Zero, IntPtr.Zero,
      "DESKTOP_ICON_LAYER_BACKGROUND_QUERY_TIMEOUT").ToInt64());
  }

  private static void SnapshotOriginalListViewBackground() {
    if (!BoundTargetIdentityMatches())
      throw new InvalidOperationException("DESKTOP_ICON_LAYER_IDENTITY_UNCERTAIN");
    _backgroundSnapshotCaptured = false;
    _originalListViewBackgroundColor = CurrentListViewBackgroundColor();
    _backgroundSnapshotCaptured = true;
  }

  private static void ApplyListViewTransparency() {
    if (!_transparencySnapshotCaptured || !BoundTargetIdentityMatches())
      throw new InvalidOperationException("DESKTOP_ICON_LAYER_IDENTITY_UNCERTAIN");
    long desiredStyle = _originalListViewExStyle | (long)WS_EX_LAYERED;
    if (CurrentListViewExStyle() != desiredStyle) {
      SetWindowLongPtr(_listView, GWL_EXSTYLE, new IntPtr(desiredStyle));
      if (CurrentListViewExStyle() != desiredStyle)
        throw new InvalidOperationException("DESKTOP_ICON_LAYER_STYLE_APPLY_FAILED");
    }
    if (!SetLayeredWindowAttributes(_listView, DESKTOP_LAYER_COLOR_KEY, 255, LWA_COLORKEY))
      throw new InvalidOperationException("DESKTOP_ICON_LAYER_COLORKEY_APPLY_FAILED");
    uint colorKey;
    byte alpha;
    uint flags;
    if (!GetLayeredWindowAttributes(_listView, out colorKey, out alpha, out flags)
        || colorKey != DESKTOP_LAYER_COLOR_KEY || (flags & LWA_COLORKEY) == 0)
      throw new InvalidOperationException("DESKTOP_ICON_LAYER_COLORKEY_VERIFY_FAILED");
    _transparencyApplied = true;
    RefreshListViewComposition();
  }

  private static void ApplyListViewBackgroundKey() {
    if (!_backgroundSnapshotCaptured || !BoundTargetIdentityMatches())
      throw new InvalidOperationException("DESKTOP_ICON_LAYER_IDENTITY_UNCERTAIN");
    if (CurrentListViewBackgroundColor() != DESKTOP_LAYER_COLOR_KEY) {
      SendListViewMessage(LVM_SETBKCOLOR, IntPtr.Zero,
        new IntPtr(unchecked((int)DESKTOP_LAYER_COLOR_KEY)),
        "DESKTOP_ICON_LAYER_BACKGROUND_APPLY_TIMEOUT");
      if (CurrentListViewBackgroundColor() != DESKTOP_LAYER_COLOR_KEY)
        throw new InvalidOperationException("DESKTOP_ICON_LAYER_BACKGROUND_APPLY_FAILED");
    }
    _backgroundApplied = true;
    RefreshListViewComposition();
  }

  private static void RestoreCurrentListViewBackground() {
    if (!_backgroundSnapshotCaptured) return;
    if (BoundTargetWasDestroyed()) {
      _backgroundSnapshotCaptured = false;
      _backgroundApplied = false;
      return;
    }
    if (!BoundTargetIdentityMatches())
      throw new InvalidOperationException("DESKTOP_ICON_LAYER_IDENTITY_UNCERTAIN");
    SendListViewMessage(LVM_SETBKCOLOR, IntPtr.Zero,
      new IntPtr(unchecked((int)_originalListViewBackgroundColor)),
      "DESKTOP_ICON_LAYER_BACKGROUND_RESTORE_TIMEOUT");
    if (CurrentListViewBackgroundColor() != _originalListViewBackgroundColor)
      throw new InvalidOperationException("DESKTOP_ICON_LAYER_BACKGROUND_RESTORE_FAILED");
    RefreshListViewComposition();
    _backgroundSnapshotCaptured = false;
    _backgroundApplied = false;
  }

  private static void RestoreCurrentListViewTransparency() {
    if (!_transparencySnapshotCaptured) return;
    if (BoundTargetWasDestroyed()) {
      _transparencySnapshotCaptured = false;
      _transparencyApplied = false;
      return;
    }
    if (!BoundTargetIdentityMatches())
      throw new InvalidOperationException("DESKTOP_ICON_LAYER_IDENTITY_UNCERTAIN");
    SetWindowLongPtr(_listView, GWL_EXSTYLE, new IntPtr(_originalListViewExStyle));
    if (CurrentListViewExStyle() != _originalListViewExStyle)
      throw new InvalidOperationException("DESKTOP_ICON_LAYER_STYLE_RESTORE_FAILED");
    if (_originalListViewWasLayered) {
      if (!_originalLayeredAttributesReadable || !SetLayeredWindowAttributes(_listView,
          _originalLayeredColorKey, _originalLayeredAlpha, _originalLayeredFlags))
        throw new InvalidOperationException("DESKTOP_ICON_LAYER_ATTRS_RESTORE_FAILED");
    }
    RefreshListViewComposition();
    _transparencySnapshotCaptured = false;
    _transparencyApplied = false;
  }

  private static bool FindTarget(out IntPtr topLevelHost, out IntPtr iconHost, out IntPtr listView,
      out uint processId, out uint threadId, out uint iconHostProcessId, out uint iconHostThreadId,
      out uint topLevelHostProcessId, out uint topLevelHostThreadId) {
    iconHost = _expectedIconHost;
    listView = _expectedListView;
    topLevelHost = GetAncestor(iconHost, GA_ROOT);
    processId = 0;
    threadId = 0;
    iconHostProcessId = 0;
    iconHostThreadId = 0;
    topLevelHostProcessId = 0;
    topLevelHostThreadId = 0;
    if (topLevelHost == IntPtr.Zero || iconHost == IntPtr.Zero || listView == IntPtr.Zero
        || !IsWindow(topLevelHost) || !IsWindow(iconHost) || !IsWindow(listView)) return false;
    if (!String.Equals(ClassName(iconHost), "SHELLDLL_DefView", StringComparison.Ordinal)
        || !String.Equals(ClassName(listView), "SysListView32", StringComparison.Ordinal)
        || GetParent(listView) != iconHost) return false;
    threadId = GetWindowThreadProcessId(listView, out processId);
    iconHostThreadId = GetWindowThreadProcessId(iconHost, out iconHostProcessId);
    topLevelHostThreadId = GetWindowThreadProcessId(topLevelHost, out topLevelHostProcessId);
    return processId != 0 && threadId != 0 && iconHostProcessId != 0 && iconHostThreadId != 0
      && topLevelHostProcessId != 0 && topLevelHostThreadId != 0;
  }

  private static void SnapshotOriginalListViewVisibility() {
    if (!BoundTargetIdentityMatches())
      throw new InvalidOperationException("DESKTOP_ICON_VISIBILITY_IDENTITY_UNCERTAIN");
    _originalListViewVisible = IsWindowVisible(_listView);
    _desktopIconsVisible = _originalListViewVisible;
    _requestedIconsVisible = _originalListViewVisible;
    _visibilitySnapshotCaptured = true;
  }

  private static void BindExpectedTarget() {
    IntPtr topLevelHost;
    IntPtr iconHost;
    IntPtr listView;
    uint processId;
    uint threadId;
    uint iconHostProcessId;
    uint iconHostThreadId;
    uint topLevelHostProcessId;
    uint topLevelHostThreadId;
    if (!FindTarget(out topLevelHost, out iconHost, out listView, out processId, out threadId,
        out iconHostProcessId, out iconHostThreadId, out topLevelHostProcessId, out topLevelHostThreadId))
      throw new InvalidOperationException("DESKTOP_ICON_LISTVIEW_NOT_FOUND");
    if (iconHost != _expectedIconHost || listView != _expectedListView)
      throw new InvalidOperationException("DESKTOP_ICON_HOST_CHANGED");
    _topLevelHost = topLevelHost;
    _iconHost = iconHost;
    _listView = listView;
    _explorerProcessId = processId;
    _explorerThreadId = threadId;
    _iconHostProcessId = iconHostProcessId;
    _iconHostThreadId = iconHostThreadId;
    _topLevelHostProcessId = topLevelHostProcessId;
    _topLevelHostThreadId = topLevelHostThreadId;
    _topLevelHostClass = ClassName(topLevelHost);
    _mainThreadId = GetWindowThreadProcessId(_mainWindow, out _mainProcessId);
    _mainWindowClass = ClassName(_mainWindow);
    if (String.IsNullOrEmpty(_topLevelHostClass) || _mainWindow == IntPtr.Zero
        || !IsWindow(_mainWindow) || _mainThreadId == 0
        || _mainProcessId != (uint)_ownerProcessId || String.IsNullOrEmpty(_mainWindowClass)
        || GetParent(_mainWindow) != _iconHost || GetAncestor(_mainWindow, GA_ROOT) != _topLevelHost)
      throw new InvalidOperationException("DESKTOP_ICON_LAYER_MAIN_WINDOW_CHANGED");
    _boundTargetDestroyed = false;
    SnapshotOriginalListViewVisibility();
    SnapshotOriginalListViewTransparency();
    SnapshotOriginalListViewBackground();
    _rangeHook = SetWinEventHook(EVENT_OBJECT_CREATE, EVENT_OBJECT_REORDER, IntPtr.Zero,
      EventCallback, processId, threadId, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
    _locationHook = SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_LOCATIONCHANGE, IntPtr.Zero,
      EventCallback, processId, threadId, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
    if (_rangeHook == IntPtr.Zero || _locationHook == IntPtr.Zero)
      throw new InvalidOperationException("DESKTOP_ICON_EVENT_HOOK_FAILED");
  }

  private static bool MainWindowIdentityMatches() {
    if (_mainWindow == IntPtr.Zero || !IsWindow(_mainWindow)
        || GetParent(_mainWindow) != _iconHost || GetAncestor(_mainWindow, GA_ROOT) != _topLevelHost
        || !String.Equals(ClassName(_mainWindow), _mainWindowClass, StringComparison.Ordinal)) return false;
    uint processId;
    uint threadId = GetWindowThreadProcessId(_mainWindow, out processId);
    return processId == _mainProcessId && threadId == _mainThreadId && processId == (uint)_ownerProcessId;
  }

  private static bool BoundTargetIdentityMatches() {
    if (_boundTargetDestroyed) return false;
    IntPtr topLevelHost;
    IntPtr iconHost;
    IntPtr listView;
    uint processId;
    uint threadId;
    uint iconHostProcessId;
    uint iconHostThreadId;
    uint topLevelHostProcessId;
    uint topLevelHostThreadId;
    if (!FindTarget(out topLevelHost, out iconHost, out listView, out processId, out threadId,
        out iconHostProcessId, out iconHostThreadId, out topLevelHostProcessId, out topLevelHostThreadId)) return false;
    return topLevelHost == _topLevelHost && iconHost == _iconHost && listView == _listView
      && String.Equals(ClassName(topLevelHost), _topLevelHostClass, StringComparison.Ordinal)
      && processId == _explorerProcessId && threadId == _explorerThreadId
      && iconHostProcessId == _iconHostProcessId && iconHostThreadId == _iconHostThreadId
      && topLevelHostProcessId == _topLevelHostProcessId && topLevelHostThreadId == _topLevelHostThreadId;
  }

  private static bool BoundTargetWasDestroyed() {
    return _boundTargetDestroyed || _topLevelHost == IntPtr.Zero || _iconHost == IntPtr.Zero
      || _listView == IntPtr.Zero || !IsWindow(_topLevelHost) || !IsWindow(_iconHost) || !IsWindow(_listView);
  }

  private static bool ExpectedTargetStillAlive() {
    return BoundTargetIdentityMatches() && MainWindowIdentityMatches();
  }

  private static bool OwnerProcessAlive() {
    try {
      System.Diagnostics.Process owner = System.Diagnostics.Process.GetProcessById(_ownerProcessId);
      return !owner.HasExited;
    } catch { return false; }
  }

  private static void HandleWinEvent(IntPtr hook, uint eventType, IntPtr hWnd,
      int objectId, int childId, uint eventThread, uint eventTime) {
    if (eventType == EVENT_OBJECT_DESTROY
        && (hWnd == _listView || hWnd == _iconHost || hWnd == _topLevelHost)) {
      lock (StateLock) {
        _boundTargetDestroyed = true;
        _pending = true;
        _dueAt = NowMs();
      }
      return;
    }
    if (hWnd != _listView && hWnd != _iconHost && (_listView == IntPtr.Zero || !IsChild(_listView, hWnd))) return;
    lock (StateLock) {
      _pending = true;
      _dueAt = NowMs() + _debounceMs;
    }
  }

  private static string ControlKey() {
    System.Text.StringBuilder key = new System.Text.StringBuilder();
    lock (StateLock) {
      key.Append(_appliedControlSequence).Append('|').Append(_appliedLocked ? '1' : '0')
        .Append('|').Append(_desktopIconsVisible ? '1' : '0');
    }
    return key.ToString();
  }

  private static string LayoutKey(MineradioDesktopIconShapeNative.ProbeResult result) {
    System.Text.StringBuilder key = new System.Text.StringBuilder();
    key.Append(result.topLevelHostWindowId).Append('|').Append(result.iconHostWindowId)
      .Append('|').Append(result.listViewWindowId).Append('|').Append(ControlKey());
    if (result.icons != null) {
      foreach (MineradioDesktopIconShapeNative.IconRect icon in result.icons) {
        key.Append('|').Append(icon.x).Append(',').Append(icon.y).Append(',')
          .Append(icon.width).Append(',').Append(icon.height);
      }
    }
    return key.ToString();
  }

  private static void KeepMainAtBottom() {
    if (!BoundTargetIdentityMatches() || !MainWindowIdentityMatches())
      throw new InvalidOperationException("DESKTOP_ICON_LAYER_MAIN_WINDOW_CHANGED");
    if (!SetWindowPos(_mainWindow, HWND_BOTTOM, 0, 0, 0, 0,
        SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE))
      throw new InvalidOperationException("DESKTOP_ICON_LAYER_ZORDER_FAILED");
  }

  private static void ApplyPendingControls() {
    bool visibilityPending;
    bool desiredIconsVisible;
    long visibilitySequence;
    bool requestedLocked;
    long sequence;
    lock (StateLock) {
      visibilityPending = _visibilityRequestPending;
      desiredIconsVisible = _requestedIconsVisible;
      visibilitySequence = _visibilityRequestSequence;
      requestedLocked = _locked;
      sequence = _controlSequence;
    }
    if (!BoundTargetIdentityMatches())
      throw new InvalidOperationException("DESKTOP_ICON_HOST_CHANGED");
    if (visibilityPending && IsWindowVisible(_listView) != desiredIconsVisible) {
      ShowWindow(_listView, desiredIconsVisible ? SW_SHOW : SW_HIDE);
      if (IsWindowVisible(_listView) != desiredIconsVisible)
        throw new InvalidOperationException("DESKTOP_ICON_VISIBILITY_APPLY_FAILED");
    }
    bool actualIconsVisible = IsWindowVisible(_listView);
    lock (StateLock) {
      if (visibilityPending && _visibilityRequestSequence == visibilitySequence)
        _visibilityRequestPending = false;
      _desktopIconsVisible = actualIconsVisible;
      _appliedLocked = requestedLocked;
      _appliedControlSequence = Math.Max(_appliedControlSequence, sequence);
    }
  }

  private static void Emit(MineradioDesktopIconShapeNative.ProbeResult result, bool force) {
    string key = LayoutKey(result);
    if (!force && key == _lastEmittedKey) return;
    _lastEmittedKey = key;
    _lastError = "";
    bool locked;
    long sequence;
    bool desktopIconsVisible;
    lock (StateLock) {
      locked = _appliedLocked;
      sequence = _appliedControlSequence;
      desktopIconsVisible = _desktopIconsVisible;
    }
    System.Text.StringBuilder json = new System.Text.StringBuilder();
    json.Append("{\"ok\":true,\"watcher\":true,\"nativeLayerApplied\":")
      .Append(_transparencyApplied ? "true" : "false")
      .Append(",\"nativeBackgroundKeyApplied\":").Append(_backgroundApplied ? "true" : "false")
      .Append(",\"compositionMode\":\"layered-color-key\"")
      .Append(",\"nativeLayerLocked\":").Append(locked ? "true" : "false")
      .Append(",\"desktopIconsVisible\":").Append(desktopIconsVisible ? "true" : "false")
      .Append(",\"controlSequence\":").Append(sequence)
      .Append(",\"shieldWindowId\":\"0\"")
      .Append(",\"iconHostWindowId\":\"").Append(result.iconHostWindowId)
      .Append("\",\"listViewWindowId\":\"").Append(result.listViewWindowId)
      .Append("\",\"topLevelHostWindowId\":\"").Append(result.topLevelHostWindowId)
      .Append("\",\"processId\":").Append(result.processId)
      .Append(",\"physicalPixels\":true,\"icons\":[");
    if (result.icons != null) {
      for (int index = 0; index < result.icons.Length; index++) {
        if (index > 0) json.Append(',');
        MineradioDesktopIconShapeNative.IconRect icon = result.icons[index];
        json.Append("{\"x\":").Append(icon.x).Append(",\"y\":").Append(icon.y)
          .Append(",\"width\":").Append(icon.width).Append(",\"height\":").Append(icon.height).Append('}');
      }
    }
    json.Append("]}");
    _output.WriteLine(json.ToString());
    _output.Flush();
  }

  private static void EmitError(string code) {
    if (code == _lastError) return;
    _lastError = code;
    _output.WriteLine("{\"ok\":false,\"watcher\":true,\"error\":\"" + code + "\"}");
    _output.Flush();
  }

  private static void EmitTerminal(bool restored, string code) {
    string safeCode = String.IsNullOrEmpty(code) ? "" : code.Replace("\\", "_").Replace("\"", "_");
    _output.WriteLine("{\"ok\":" + (restored ? "true" : "false")
      + ",\"watcher\":true,\"terminal\":true,\"restored\":" + (restored ? "true" : "false")
      + (String.IsNullOrEmpty(safeCode) ? "" : ",\"error\":\"" + safeCode + "\"") + "}");
    _output.Flush();
  }

  private static void ApplyAndEmit(bool force) {
    ApplyPendingControls();
    MineradioDesktopIconShapeNative.ProbeResult result = MineradioDesktopIconShapeNative.Probe();
    if (String.IsNullOrEmpty(result.iconHostWindowId) || String.IsNullOrEmpty(result.listViewWindowId)
        || result.topLevelHostWindowId != _topLevelHost.ToInt64().ToString()
        || result.iconHostWindowId != _iconHost.ToInt64().ToString()
        || result.listViewWindowId != _listView.ToInt64().ToString()
        || unchecked((uint)result.processId) != _explorerProcessId)
      throw new InvalidOperationException("DESKTOP_ICON_HOST_CHANGED");
    ApplyListViewTransparency();
    ApplyListViewBackgroundKey();
    KeepMainAtBottom();
    Emit(result, force);
  }

  private static void QueueRefresh() {
    lock (StateLock) {
      _pending = true;
      _dueAt = NowMs();
    }
  }

  private static void ReadCommands() {
    try {
      while (true) {
        string line = _input.ReadLine();
        if (line == null || String.Equals(line.Trim(), "Q", StringComparison.OrdinalIgnoreCase)) {
          PostThreadMessage(_ownerThreadId, WM_QUIT, UIntPtr.Zero, IntPtr.Zero);
          return;
        }
        string[] fields = line.Split(new char[] { '|' }, 3);
        if (fields.Length < 2) continue;
        long sequence;
        if (!Int64.TryParse(fields[1], out sequence)) continue;
        if (String.Equals(fields[0], "L", StringComparison.OrdinalIgnoreCase)) {
          bool locked = fields.Length > 2 && fields[2] == "1";
          lock (StateLock) { _locked = locked; _controlSequence = Math.Max(_controlSequence, sequence); }
          QueueRefresh();
        } else if (String.Equals(fields[0], "Z", StringComparison.OrdinalIgnoreCase)) {
          lock (StateLock) { _controlSequence = Math.Max(_controlSequence, sequence); }
          QueueRefresh();
        } else if (String.Equals(fields[0], "V", StringComparison.OrdinalIgnoreCase)) {
          bool visible = fields.Length > 2 && fields[2] == "1";
          lock (StateLock) {
            _requestedIconsVisible = visible;
            _visibilityRequestPending = true;
            _visibilityRequestSequence = sequence;
            _controlSequence = Math.Max(_controlSequence, sequence);
          }
          QueueRefresh();
        }
      }
    } catch {
      PostThreadMessage(_ownerThreadId, WM_QUIT, UIntPtr.Zero, IntPtr.Zero);
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
    try { ApplyAndEmit(false); }
    catch (Exception error) {
      EmitError(error.Message.StartsWith("DESKTOP_") ? error.Message : "DESKTOP_ICON_LAYER_APPLY_FAILED");
      throw;
    }
  }

  private static void RestoreOriginalListViewVisibility() {
    if (!_visibilitySnapshotCaptured) return;
    if (BoundTargetWasDestroyed()) {
      _visibilitySnapshotCaptured = false;
      return;
    }
    if (!BoundTargetIdentityMatches())
      throw new InvalidOperationException("DESKTOP_ICON_VISIBILITY_IDENTITY_UNCERTAIN");
    if (IsWindowVisible(_listView) != _originalListViewVisible) {
      ShowWindow(_listView, _originalListViewVisible ? SW_SHOW : SW_HIDE);
      if (IsWindowVisible(_listView) != _originalListViewVisible)
        throw new InvalidOperationException("DESKTOP_ICON_VISIBILITY_RESTORE_FAILED");
    }
    _desktopIconsVisible = _originalListViewVisible;
    _visibilitySnapshotCaptured = false;
  }

  public static void Run(int debounceMs, int rebindMs, int ownerProcessId,
      long expectedIconHost, long expectedListView, long mainWindow,
      int targetX, int targetY, int targetWidth, int targetHeight,
      System.IO.TextReader input, System.IO.TextWriter output) {
    _debounceMs = Math.Max(100, Math.Min(180, debounceMs));
    int safeRebindMs = Math.Max(1000, Math.Min(10000, rebindMs));
    _ownerProcessId = ownerProcessId;
    _expectedIconHost = new IntPtr(expectedIconHost);
    _expectedListView = new IntPtr(expectedListView);
    _mainWindow = new IntPtr(mainWindow);
    _input = input ?? Console.In;
    _output = output ?? Console.Out;
    _ownerThreadId = GetCurrentThreadId();
    MSG unused;
    PeekMessage(out unused, IntPtr.Zero, 0, 0, PM_NOREMOVE);

    System.Threading.Thread inputThread = new System.Threading.Thread(ReadCommands);
    inputThread.IsBackground = true;
    inputThread.Name = "Mineradio native desktop icon layer input";
    inputThread.Start();

    UIntPtr timerId = UIntPtr.Zero;
    Exception runFailure = null;
    Exception backgroundRestoreFailure = null;
    Exception transparencyRestoreFailure = null;
    Exception visibilityRestoreFailure = null;
    try {
      BindExpectedTarget();
      ApplyAndEmit(true);
      timerId = SetTimer(IntPtr.Zero, new UIntPtr(1), 50, IntPtr.Zero);
      if (timerId == UIntPtr.Zero) throw new InvalidOperationException("DESKTOP_ICON_WATCHER_TIMER_FAILED");
      long nextRebindAt = NowMs() + safeRebindMs;
      long nextOwnerCheckAt = NowMs() + 500;
      MSG message;
      while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0) {
        if (message.message == WM_TIMER) {
          long now = NowMs();
          if (now >= nextOwnerCheckAt) {
            nextOwnerCheckAt = now + 500;
            if (!OwnerProcessAlive()) break;
          }
          if (now >= nextRebindAt) {
            nextRebindAt = now + safeRebindMs;
            if (!ExpectedTargetStillAlive()) {
              EmitError("DESKTOP_ICON_HOST_CHANGED");
              break;
            }
          }
          EmitPendingLayout();
        }
        TranslateMessage(ref message);
        DispatchMessage(ref message);
      }
    } catch (Exception error) {
      runFailure = error;
    } finally {
      if (timerId != UIntPtr.Zero) KillTimer(IntPtr.Zero, timerId);
      try { RestoreCurrentListViewBackground(); }
      catch (Exception error) { backgroundRestoreFailure = error; }
      // If Explorer did not accept its original background, retaining the
      // colour-key is safer than exposing an opaque black ListView over the
      // whole desktop. Report an unconfirmed restore and let recovery retry.
      if (backgroundRestoreFailure == null) {
        try { RestoreCurrentListViewTransparency(); }
        catch (Exception error) { transparencyRestoreFailure = error; }
      }
      try { RestoreOriginalListViewVisibility(); }
      catch (Exception error) { visibilityRestoreFailure = error; }
      RemoveHooks();
      _topLevelHost = IntPtr.Zero;
      _iconHost = IntPtr.Zero;
      _listView = IntPtr.Zero;
    }
    Exception restoreFailure = backgroundRestoreFailure ?? transparencyRestoreFailure ?? visibilityRestoreFailure;
    bool restored = restoreFailure == null;
    string terminalCode = restoreFailure != null
      ? restoreFailure.Message
      : (runFailure != null ? runFailure.Message : "");
    EmitTerminal(restored, terminalCode);
    if (restoreFailure != null) throw restoreFailure;
    if (runFailure != null) throw runFailure;
  }
}
`;
}

function nativeIconLayerGuardScript(options = {}) {
  const bounds = normalizeRect(options.physicalBounds || options.targetPhysicalBounds)
    || { x: 0, y: 0, width: 1, height: 1 };
  const iconHostWindowId = String(options.iconHostWindowId || '');
  const listViewWindowId = String(options.listViewWindowId || '');
  const mainWindowId = String(options.mainWindowId || '');
  if (!/^\d+$/.test(iconHostWindowId) || iconHostWindowId === '0') {
    throw new Error('DESKTOP_ICON_LAYER_HOST_INVALID');
  }
  if (!/^\d+$/.test(listViewWindowId) || listViewWindowId === '0') {
    throw new Error('DESKTOP_ICON_LAYER_LIST_INVALID');
  }
  if (!/^\d+$/.test(mainWindowId) || mainWindowId === '0') {
    throw new Error('DESKTOP_ICON_LAYER_MAIN_INVALID');
  }
  const debounceMs = Math.max(100, Math.min(180, Math.round(finiteNumber(options.debounceMs, 140))));
  const rebindMs = Math.max(1000, Math.min(10000, Math.round(finiteNumber(options.rebindMs, 2000))));
  const ownerProcessId = Math.max(1, Math.round(finiteNumber(options.ownerProcessId, process.pid)));
  const inputExpression = options.namedPipeIo === true ? '$reader' : '[Console]::In';
  const outputExpression = options.namedPipeIo === true ? '$writer' : '[Console]::Out';
  return `${desktopIconProbeScript({ invoke: false, extraCSharp: nativeIconLayerGuardCSharpSource() })}
[MineradioDesktopNativeIconLayerGuard]::Run(${debounceMs}, ${rebindMs}, ${ownerProcessId}, [Int64]${iconHostWindowId}, [Int64]${listViewWindowId}, [Int64]${mainWindowId}, ${bounds.x}, ${bounds.y}, ${bounds.width}, ${bounds.height}, ${inputExpression}, ${outputExpression})
`;
}

function nativeIconLayerNamedPipeScript(options = {}) {
  const rawBody = nativeIconLayerGuardScript({ ...options, namedPipeIo: true });
  const invocationMarker = '\n[MineradioDesktopNativeIconLayerGuard]::Run(';
  const invocationIndex = rawBody.lastIndexOf(invocationMarker);
  if (invocationIndex < 0) throw new Error('DESKTOP_ICON_LAYER_GUARD_SCRIPT_INVALID');
  const compileBody = rawBody.slice(0, invocationIndex);
  const invocationBody = rawBody.slice(invocationIndex);
  return `param(
  [Parameter(Mandatory=$true)][string]$InputPipeName,
  [Parameter(Mandatory=$true)][string]$OutputPipeName
)
$ErrorActionPreference = "Stop"
$inputPipe = New-Object System.IO.Pipes.NamedPipeClientStream('.', $InputPipeName, [System.IO.Pipes.PipeDirection]::In)
$outputPipe = New-Object System.IO.Pipes.NamedPipeClientStream('.', $OutputPipeName, [System.IO.Pipes.PipeDirection]::Out)
try {
  $inputPipe.Connect(5000)
  $outputPipe.Connect(5000)
  $encoding = New-Object System.Text.UTF8Encoding($false)
  $reader = New-Object System.IO.StreamReader($inputPipe, $encoding, $false, 4096, $true)
  $writer = New-Object System.IO.StreamWriter($outputPipe, $encoding, 4096, $true)
  $writer.AutoFlush = $true
  $writer.WriteLine('{"ok":true,"watcher":true,"transportConnected":true}')
  $writer.Flush()
  try {
${compileBody}
  $writer.WriteLine('{"ok":true,"watcher":true,"transportCompiled":true}')
  $writer.Flush()
${invocationBody}
  } catch {
    $diagnostic = [string]$_
    $match = [regex]::Match($diagnostic, 'DESKTOP_[A-Z0-9_]+')
    $message = if ($match.Success) { $match.Value } else { 'DESKTOP_ICON_LAYER_EXTERNAL_FAILED' }
    $writer.WriteLine(([pscustomobject]@{ ok = $false; watcher = $true; error = $message } | ConvertTo-Json -Compress))
    $writer.Flush()
    throw
  }
} finally {
  if ($inputPipe) { try { $inputPipe.Dispose() } catch { } }
  if ($outputPipe) { try { $outputPipe.Dispose() } catch { } }
}
`;
}

function powershellSingleQuoted(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

function externalGuardTransport(options = {}) {
  const transport = new EventEmitter();
  transport.stdout = new PassThrough();
  transport.stderr = new PassThrough();
  let inputSocket = null;
  let outputSocket = null;
  let inputServer = null;
  let outputServer = null;
  let bootstrap = null;
  let exited = false;
  let connected = false;
  let cancelled = false;
  let guardPid = 0;
  let bootstrapOutput = '';
  const connectTimeoutMs = Math.max(2000, Math.min(20000, finiteNumber(options.connectTimeoutMs, 12000)));
  let connectTimer = null;
  const pipeBase = `MineradioNativeIconLayer-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inputPipeName = `${pipeBase}-input`;
  const outputPipeName = `${pipeBase}-output`;
  const inputPipePath = `\\\\.\\pipe\\${inputPipeName}`;
  const outputPipePath = `\\\\.\\pipe\\${outputPipeName}`;
  const closeServers = () => {
    try { if (inputServer) inputServer.close(); } catch (_) { }
    try { if (outputServer) outputServer.close(); } catch (_) { }
  };
  const emitExit = (code, signalName = '') => {
    if (exited) return;
    exited = true;
    if (connectTimer) clearTimeout(connectTimer);
    closeServers();
    transport.emit('exit', code, signalName);
  };
  const markConnected = () => {
    if (!inputSocket || inputSocket.destroyed || !outputSocket || outputSocket.destroyed) return;
    connected = true;
    if (connectTimer) clearTimeout(connectTimer);
    closeServers();
  };
  transport.stdin = {
    write(value) {
      if (!inputSocket || inputSocket.destroyed) throw new Error('DESKTOP_ICON_LAYER_PIPE_NOT_CONNECTED');
      return inputSocket.write(value);
    },
  };
  transport.kill = () => {
    cancelled = true;
    try { if (inputSocket && !inputSocket.destroyed) inputSocket.destroy(); } catch (_) { }
    closeServers();
    if (!connected) {
      try { if (outputSocket && !outputSocket.destroyed) outputSocket.destroy(); } catch (_) { }
      emitExit(null, 'CANCELLED');
    }
    return true;
  };
  transport.getGuardPid = () => guardPid;
  const handleServerError = (error) => {
    transport.emit('error', error);
    emitExit(null, 'PIPE_ERROR');
  };
  inputServer = net.createServer((candidate) => {
    if (cancelled || (inputSocket && !inputSocket.destroyed)) {
      candidate.destroy();
      return;
    }
    inputSocket = candidate;
    candidate.on('error', (error) => transport.stderr.write(String(error && error.stack || error)));
    markConnected();
  });
  outputServer = net.createServer((candidate) => {
    if (cancelled || (outputSocket && !outputSocket.destroyed)) {
      candidate.destroy();
      return;
    }
    outputSocket = candidate;
    candidate.on('data', (chunk) => transport.stdout.write(chunk));
    candidate.on('error', (error) => transport.stderr.write(String(error && error.stack || error)));
    candidate.on('close', () => emitExit(0, ''));
    markConnected();
  });
  inputServer.on('error', handleServerError);
  outputServer.on('error', handleServerError);
  let listeningServers = 0;
  const launchGuard = () => {
    listeningServers += 1;
    if (listeningServers !== 2 || cancelled || exited) return;
    const powershellPath = String(options.powershellPath || 'powershell.exe');
    const windowsRoot = String(process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows');
    const conhostPath = path.join(windowsRoot, 'System32', 'conhost.exe');
    const commandLine = `"${conhostPath.replace(/"/g, '""')}" --headless "${powershellPath.replace(/"/g, '""')}" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${String(options.scriptPath).replace(/"/g, '""')}" -InputPipeName "${inputPipeName}" -OutputPipeName "${outputPipeName}"`;
    const bootstrapScript = `$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = ${powershellSingleQuoted(commandLine)} }
if (-not $result -or [int]$result.ReturnValue -ne 0 -or [int]$result.ProcessId -le 0) { throw 'DESKTOP_ICON_LAYER_EXTERNAL_LAUNCH_FAILED' }
$result.ProcessId`;
    try {
      bootstrap = (options.bootstrapSpawnImpl || spawn)(
        powershellPath,
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', bootstrapScript],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      if (bootstrap.stderr && typeof bootstrap.stderr.on === 'function') {
        bootstrap.stderr.on('data', (chunk) => transport.stderr.write(chunk));
      }
      if (bootstrap.stdout && typeof bootstrap.stdout.on === 'function') {
        bootstrap.stdout.on('data', (chunk) => {
          bootstrapOutput += String(chunk || '');
          const match = bootstrapOutput.match(/\b(\d+)\b/);
          if (match) guardPid = Math.max(0, Number(match[1]) || 0);
        });
      }
      bootstrap.on('error', (error) => {
        if (!connected) transport.emit('error', error);
      });
      bootstrap.on('exit', (code) => {
        if (code !== 0 && !connected) {
          const error = new Error('DESKTOP_ICON_LAYER_EXTERNAL_LAUNCH_FAILED');
          transport.emit('error', error);
          emitExit(code, '');
        }
      });
    } catch (error) {
      transport.emit('error', error);
      emitExit(null, '');
    }
  };
  inputServer.listen(inputPipePath, launchGuard);
  outputServer.listen(outputPipePath, launchGuard);
  connectTimer = setTimeout(() => {
    if (connected || exited) return;
    cancelled = true;
    const error = new Error('DESKTOP_ICON_LAYER_PIPE_CONNECT_TIMEOUT');
    transport.emit('error', error);
    try { if (inputSocket && !inputSocket.destroyed) inputSocket.destroy(); } catch (_) { }
    try { if (outputSocket && !outputSocket.destroyed) outputSocket.destroy(); } catch (_) { }
    closeServers();
    emitExit(null, 'TIMEOUT');
  }, connectTimeoutMs);
  if (connectTimer && typeof connectTimer.unref === 'function') connectTimer.unref();
  if (typeof inputServer.unref === 'function') inputServer.unref();
  if (typeof outputServer.unref === 'function') outputServer.unref();
  return transport;
}

function parseNativeIconLayerLayout(line) {
  const raw = typeof line === 'string' ? JSON.parse(line) : line;
  if (!raw || raw.ok !== true || raw.nativeLayerApplied !== true
      || raw.nativeBackgroundKeyApplied !== true
      || raw.compositionMode !== 'layered-color-key'
      || typeof raw.desktopIconsVisible !== 'boolean'
      || !/^\d+$/.test(String(raw.iconHostWindowId || ''))
      || !/^\d+$/.test(String(raw.listViewWindowId || ''))
      || !/^\d+$/.test(String(raw.topLevelHostWindowId || ''))
      || raw.physicalPixels !== true) {
    throw new Error('DESKTOP_ICON_LAYER_ACK_INVALID');
  }
  return {
    ok: true,
    watcher: true,
    nativeLayerApplied: true,
    nativeBackgroundKeyApplied: true,
    compositionMode: 'layered-color-key',
    nativeLayerLocked: raw.nativeLayerLocked === true,
    desktopIconsVisible: raw.desktopIconsVisible === true,
    controlSequence: Math.max(0, Math.round(finiteNumber(raw.controlSequence, 0))),
    shieldWindowId: String(raw.shieldWindowId || '0'),
    iconHostWindowId: String(raw.iconHostWindowId),
    listViewWindowId: String(raw.listViewWindowId),
    topLevelHostWindowId: String(raw.topLevelHostWindowId),
    processId: Math.max(0, Math.round(finiteNumber(raw.processId, 0))),
    physicalPixels: true,
    icons: (Array.isArray(raw.icons) ? raw.icons : []).map(normalizeRect).filter(Boolean),
  };
}

function startNativeDesktopIconLayer(options = {}) {
  const spawnImpl = options.spawnImpl;
  if (spawnImpl != null && typeof spawnImpl !== 'function') throw new Error('DESKTOP_ICON_LAYER_SPAWN_UNAVAILABLE');
  const env = { ...process.env };
  const nativeTempPath = String(options.nativeTempPath || '').trim();
  if (nativeTempPath) {
    env.TEMP = nativeTempPath;
    env.TMP = nativeTempPath;
  }
  const scriptDirectory = nativeTempPath || os.tmpdir();
  fs.mkdirSync(scriptDirectory, { recursive: true });
  const scriptPath = path.join(
    scriptDirectory,
    `mineradio-native-icon-layer-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`
  );
  const useExternalGuard = typeof spawnImpl !== 'function';
  fs.writeFileSync(scriptPath, useExternalGuard
    ? nativeIconLayerNamedPipeScript(options)
    : nativeIconLayerGuardScript(options), 'utf8');
  let child;
  try {
    child = useExternalGuard
      ? externalGuardTransport({ ...options, scriptPath })
      : spawnImpl(
        String(options.powershellPath || 'powershell.exe'),
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env }
      );
  } catch (error) {
    try { fs.unlinkSync(scriptPath); } catch (_) { }
    throw error;
  }
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let exited = false;
  let exitCode = null;
  let exitNotified = false;
  let stopPromise = null;
  let lastLayout = null;
  let nextControlSequence = 0;
  let readySettled = false;
  let restoredConfirmed = false;
  let terminalError = '';
  let stopFinish = null;
  let resolveReady;
  let rejectReady;
  const controlWaiters = new Map();
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const readyTimeoutMs = Math.max(3000, Math.min(30000, finiteNumber(options.readyTimeoutMs, 18000)));
  const readyTimer = setTimeout(() => {
    if (readySettled) return;
    reportError(new Error('DESKTOP_ICON_LAYER_READY_TIMEOUT'));
  }, readyTimeoutMs);
  if (readyTimer && typeof readyTimer.unref === 'function') readyTimer.unref();

  const reportError = (value) => {
    if (!readySettled) {
      readySettled = true;
      clearTimeout(readyTimer);
      rejectReady(value instanceof Error ? value : new Error(String(value || 'DESKTOP_ICON_LAYER_FAILED')));
    }
    if (typeof options.onError === 'function') {
      try { options.onError(value); } catch (_) { }
    }
  };
  const rejectWaiters = (error) => {
    for (const waiter of controlWaiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    controlWaiters.clear();
  };
  const acknowledgeControls = (layout) => {
    for (const [sequence, waiter] of controlWaiters) {
      if (sequence > layout.controlSequence) continue;
      clearTimeout(waiter.timer);
      controlWaiters.delete(sequence);
      waiter.resolve(layout);
    }
  };
  const notifyExit = (details) => {
    if (exitNotified) return;
    exitNotified = true;
    const error = new Error(`DESKTOP_ICON_LAYER_EXIT_${details && details.code == null ? 'UNKNOWN' : details.code}`);
    if (!readySettled) {
      readySettled = true;
      clearTimeout(readyTimer);
      rejectReady(error);
    }
    rejectWaiters(error);
    if (typeof options.onExit === 'function') {
      try {
        options.onExit({
          ...details,
          restored: restoredConfirmed,
          terminalError: String(terminalError || ''),
        });
      } catch (_) { }
    }
    try { fs.unlinkSync(scriptPath); } catch (_) { }
  };
  const consumeLine = (line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed) return;
    try {
      const raw = JSON.parse(trimmed);
      if (raw && raw.terminal === true) {
        restoredConfirmed = raw.ok === true && raw.restored === true;
        terminalError = String(raw.error || '');
        if (typeof stopFinish === 'function') stopFinish(restoredConfirmed ? 0 : -1);
        if (!restoredConfirmed) reportError(new Error(terminalError || 'DESKTOP_ICON_LAYER_RESTORE_FAILED'));
        return;
      }
      if (raw && raw.ok === false) {
        const diagnosticError = String(raw.error || 'DESKTOP_ICON_LAYER_FAILED');
        if (!terminalError) terminalError = diagnosticError;
        reportError(diagnosticError);
        return;
      }
      const layout = parseNativeIconLayerLayout(raw);
      lastLayout = layout;
      if (!readySettled) {
        readySettled = true;
        clearTimeout(readyTimer);
        resolveReady(layout);
      }
      acknowledgeControls(layout);
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
      if (!terminalError) terminalError = String(error && error.message || 'DESKTOP_ICON_LAYER_CHILD_ERROR');
      reportError(error);
      if (exited) return;
      exited = true;
      notifyExit({ code: null, signal: '', stderr: stderrBuffer, error, terminalError: String(terminalError || '') });
    });
    child.on('exit', (code, signalName) => {
      if (exited && exitNotified) return;
      exited = true;
      exitCode = code;
      if (stdoutBuffer.trim()) consumeLine(stdoutBuffer);
      stdoutBuffer = '';
      if (!restoredConfirmed) {
        if (!terminalError) terminalError = 'DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED';
        reportError(new Error(terminalError));
      } else if (code !== 0 && code != null) {
        const exitError = String(stderrBuffer.match(/DESKTOP_ICON_[A-Z0-9_]+/) || '')
          || `DESKTOP_ICON_LAYER_EXIT_${code}`;
        if (!terminalError) terminalError = exitError;
        reportError(exitError);
      }
      notifyExit({ code, signal: signalName || '', stderr: stderrBuffer, terminalError: String(terminalError || '') });
    });
  }

  const sendControl = (kind, payload = '', timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) => {
    if (exited || !child.stdin || typeof child.stdin.write !== 'function') {
      return Promise.reject(new Error('DESKTOP_ICON_LAYER_NOT_RUNNING'));
    }
    const sequence = ++nextControlSequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        controlWaiters.delete(sequence);
        reject(new Error('DESKTOP_ICON_LAYER_COMMAND_TIMEOUT'));
      }, Math.max(500, Math.min(5000, finiteNumber(timeoutMs, DEFAULT_COMMAND_TIMEOUT_MS))));
      if (timer && typeof timer.unref === 'function') timer.unref();
      controlWaiters.set(sequence, { resolve, reject, timer });
      try { child.stdin.write(`${kind}|${sequence}|${payload}\n`); }
      catch (error) {
        clearTimeout(timer);
        controlWaiters.delete(sequence);
        reject(error);
      }
    });
  };

  const updateShields = () => lastLayout ? Promise.resolve(lastLayout) : ready;
  const setLocked = (value, timeoutMs) => sendControl('L', value === true ? '1' : '0', timeoutMs);
  const setIconsVisible = (value, timeoutMs) => sendControl('V', value === true ? '1' : '0', timeoutMs);
  const ensureOrder = (timeoutMs) => sendControl('Z', '', timeoutMs);
  const stop = (timeoutMs = 2200) => {
    if (stopPromise) return stopPromise;
    stopPromise = new Promise((resolve) => {
      if (exited) {
        resolve({ ok: restoredConfirmed, code: exitCode, restored: restoredConfirmed,
          error: restoredConfirmed ? '' : (terminalError || 'DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED'),
          terminalError: String(terminalError || '') });
        return;
      }
      let settled = false;
      let timer = null;
      const finish = (code) => {
        if (settled) return;
        settled = true;
        stopFinish = null;
        if (timer) clearTimeout(timer);
        resolve({
          ok: restoredConfirmed,
          code,
          restored: restoredConfirmed,
          error: restoredConfirmed ? '' : (terminalError || 'DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED'),
          terminalError: String(terminalError || ''),
        });
      };
      stopFinish = finish;
      if (typeof child.once === 'function') child.once('exit', (code) => finish(code));
      try { child.stdin.write('Q\n'); }
      catch (error) {
        terminalError = String(error && error.message || 'DESKTOP_ICON_LAYER_PIPE_NOT_CONNECTED');
        try { if (typeof child.kill === 'function') child.kill(); } catch (_) { }
        finish(exitCode == null ? -1 : exitCode);
      }
      timer = setTimeout(() => finish(exitCode == null ? -1 : exitCode),
        Math.max(500, Math.min(5000, finiteNumber(timeoutMs, 2200))));
      if (timer && typeof timer.unref === 'function') timer.unref();
    });
    return stopPromise;
  };

  return {
    child,
    ready,
    stop,
    dispose: stop,
    updateShields,
    setLocked,
    setIconsVisible,
    ensureOrder,
    getLastLayout: () => lastLayout,
    isRunning: () => !exited,
  };
}

module.exports = {
  nativeIconLayerGuardCSharpSource,
  nativeIconLayerGuardScript,
  nativeIconLayerNamedPipeScript,
  parseNativeIconLayerLayout,
  startNativeDesktopIconLayer,
};
