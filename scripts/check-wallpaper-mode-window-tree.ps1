[CmdletBinding()]
param(
  [string]$Title = 'Mineradio Desktop Wallpaper'
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class MineradioWallpaperModeWindowTree {
  [StructLayout(LayoutKind.Sequential)]
  private struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] private static extern IntPtr GetParent(IntPtr hWnd);
  [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int index);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")] private static extern IntPtr GetWindowLong32(IntPtr hWnd, int index);

  private static IntPtr GetWindowLongPtr(IntPtr hWnd, int index) {
    return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, index) : GetWindowLong32(hWnd, index);
  }

  private static string WindowText(IntPtr hWnd) {
    var text = new StringBuilder(512);
    GetWindowText(hWnd, text, text.Capacity);
    return text.ToString();
  }

  private static string ClassName(IntPtr hWnd) {
    var text = new StringBuilder(256);
    GetClassName(hWnd, text, text.Capacity);
    return text.ToString();
  }

  public static object[] Run(string expectedTitle) {
    var rows = new List<object>();
    var visited = new HashSet<long>();
    Action<IntPtr> inspect = hWnd => {
      long handle = hWnd.ToInt64();
      if (!visited.Add(handle)) return;
      string title = WindowText(hWnd);
      if (!String.Equals(title, expectedTitle ?? "", StringComparison.Ordinal)) return;
      uint processId;
      GetWindowThreadProcessId(hWnd, out processId);
      IntPtr parent = GetParent(hWnd);
      RECT rect;
      bool hasRect = GetWindowRect(hWnd, out rect);
      long style = GetWindowLongPtr(hWnd, -16).ToInt64();
      const long WS_CHILD = 0x40000000L;
      const long WS_POPUP = 0x80000000L;
      rows.Add(new {
        handle = handle.ToString(),
        processId = processId,
        title = title,
        className = ClassName(hWnd),
        visible = IsWindowVisible(hWnd),
        parentHandle = parent.ToInt64().ToString(),
        parentClassName = parent == IntPtr.Zero ? "" : ClassName(parent),
        childStyle = (style & WS_CHILD) != 0,
        popupStyle = (style & WS_POPUP) != 0,
        rect = hasRect ? new {
          left = rect.Left,
          top = rect.Top,
          right = rect.Right,
          bottom = rect.Bottom,
          width = Math.Max(0, rect.Right - rect.Left),
          height = Math.Max(0, rect.Bottom - rect.Top)
        } : null
      });
    };

    EnumWindows((top, state) => {
      inspect(top);
      EnumChildWindows(top, (child, childState) => {
        inspect(child);
        return true;
      }, IntPtr.Zero);
      return true;
    }, IntPtr.Zero);
    return rows.ToArray();
  }
}
'@

$rows = @([MineradioWallpaperModeWindowTree]::Run($Title))
ConvertTo-Json -InputObject $rows -Depth 5
