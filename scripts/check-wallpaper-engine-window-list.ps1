[CmdletBinding()]
param(
  [string]$TitlePrefix = 'Mineradio',
  [switch]$Move,
  [int]$X = 192,
  [int]$Y = 132,
  [int]$Width = 1440,
  [int]$Height = 810
)

$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class MineradioWeQaWindowList {
  [StructLayout(LayoutKind.Sequential)]
  private struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] static extern bool MoveWindow(IntPtr hWnd, int x, int y, int width, int height, bool repaint);

  public static object[] Run(string prefix) {
    var results = new List<object>();
    EnumWindows((hWnd, lParam) => {
      int length = GetWindowTextLength(hWnd);
      if (length <= 0) return true;
      var text = new StringBuilder(length + 1);
      GetWindowText(hWnd, text, text.Capacity);
      string title = text.ToString();
      if (!title.StartsWith(prefix ?? "", StringComparison.Ordinal)) return true;
      uint processId;
      GetWindowThreadProcessId(hWnd, out processId);
      RECT rect;
      bool hasRect = GetWindowRect(hWnd, out rect);
      results.Add(new {
        handle = hWnd.ToInt64().ToString(),
        processId = processId,
        visible = IsWindowVisible(hWnd),
        title = title,
        rect = hasRect ? new {
          left = rect.Left,
          top = rect.Top,
          right = rect.Right,
          bottom = rect.Bottom,
          width = Math.Max(0, rect.Right - rect.Left),
          height = Math.Max(0, rect.Bottom - rect.Top)
        } : null
      });
      return true;
    }, IntPtr.Zero);
    return results.ToArray();
  }

  public static int Move(string prefix, int x, int y, int width, int height) {
    int moved = 0;
    EnumWindows((hWnd, lParam) => {
      int length = GetWindowTextLength(hWnd);
      if (length <= 0) return true;
      var text = new StringBuilder(length + 1);
      GetWindowText(hWnd, text, text.Capacity);
      if (text.ToString().StartsWith(prefix ?? "", StringComparison.Ordinal)
          && MoveWindow(hWnd, x, y, width, height, true)) moved += 1;
      return true;
    }, IntPtr.Zero);
    return moved;
  }
}
'@

if ($Move) {
  [MineradioWeQaWindowList]::Move($TitlePrefix, $X, $Y, $Width, $Height) | Out-Null
}
@([MineradioWeQaWindowList]::Run($TitlePrefix)) | ConvertTo-Json -Depth 4
