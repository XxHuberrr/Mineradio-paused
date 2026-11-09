'use strict';

const { app, desktopCapturer } = require('electron');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const outputArgument = process.argv.find((value) => /^--output=/.test(value));
const outputDirectory = path.resolve(outputArgument
  ? outputArgument.slice('--output='.length)
  : path.join(os.tmpdir(), `mineradio-we-pointer-target-${Date.now()}`));
const titleArgument = process.argv.find((value) => /^--source-title=/.test(value));
const sourceTitle = titleArgument
  ? titleArgument.slice('--source-title='.length)
  : '';
const settleArgument = process.argv.find((value) => /^--settle=\d+$/.test(value));
const settleMs = Math.max(250, Math.min(3000,
  Number(settleArgument && settleArgument.split('=')[1]) || 1100));

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encodedPowerShell(source) {
  return Buffer.from(String(source || ''), 'utf16le').toString('base64');
}

function pointerTargetProbeScript() {
  return String.raw`
$ErrorActionPreference = 'Stop'
$expectedTitle = [Environment]::GetEnvironmentVariable('MINERADIO_WE_DIAG_SOURCE_TITLE', 'Process')
$targetMode = [Environment]::GetEnvironmentVariable('MINERADIO_WE_DIAG_TARGET', 'Process')
$xUnit = [int][Environment]::GetEnvironmentVariable('MINERADIO_WE_DIAG_X', 'Process')
$yUnit = [int][Environment]::GetEnvironmentVariable('MINERADIO_WE_DIAG_Y', 'Process')
$source = @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class MineradioWePointerTargetProbe {
  const uint WM_MOUSEMOVE = 0x0200;
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }

  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassNameW(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", SetLastError=true)] static extern bool PostMessageW(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);

  static string Text(IntPtr hWnd) {
    var text = new StringBuilder(1024);
    GetWindowTextW(hWnd, text, text.Capacity);
    return text.ToString();
  }

  static string ClassName(IntPtr hWnd) {
    var text = new StringBuilder(256);
    GetClassNameW(hWnd, text, text.Capacity);
    return text.ToString();
  }

  static int Map(int value, int targetSize) {
    value = Math.Max(0, Math.Min(65535, value));
    if (targetSize <= 1) return 0;
    return (int)(((long)value * (targetSize - 1) + 32767L) / 65535L);
  }

  public static object Run(string expectedTitle, string targetMode, int xUnit, int yUnit) {
    IntPtr previous = IntPtr.Zero;
    try { previous = SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { }
    try {
      IntPtr source = IntPtr.Zero;
      EnumWindows((hWnd, _) => {
        if (String.Equals(Text(hWnd), expectedTitle ?? "", StringComparison.Ordinal)) {
          source = hWnd;
          return false;
        }
        return true;
      }, IntPtr.Zero);
      if (source == IntPtr.Zero) throw new InvalidOperationException("Source window not found");
      uint sourcePid;
      GetWindowThreadProcessId(source, out sourcePid);
      var candidates = new List<IntPtr>();
      EnumChildWindows(source, (hWnd, _) => {
        uint pid;
        GetWindowThreadProcessId(hWnd, out pid);
        if (pid == sourcePid
            && String.Equals(ClassName(hWnd), "WPEDesktopDX11Window", StringComparison.Ordinal)
            && String.Equals(Text(hWnd), "WPELiveWallpaper", StringComparison.Ordinal)) {
          candidates.Add(hWnd);
        }
        return true;
      }, IntPtr.Zero);
      if (candidates.Count != 1) throw new InvalidOperationException("Expected one WPE Scene render child, found " + candidates.Count);
      IntPtr target = String.Equals(targetMode, "child", StringComparison.OrdinalIgnoreCase)
        ? candidates[0] : source;
      RECT rect;
      if (!GetClientRect(target, out rect)) throw new Win32Exception(Marshal.GetLastWin32Error());
      int width = Math.Max(1, rect.Right - rect.Left);
      int height = Math.Max(1, rect.Bottom - rect.Top);
      int x = Map(xUnit, width);
      int y = Map(yUnit, height);
      int packed = unchecked((y << 16) | (x & 0xffff));
      for (int index = 0; index < 8; index += 1) {
        if (!PostMessageW(target, WM_MOUSEMOVE, IntPtr.Zero, new IntPtr(packed))) {
          throw new Win32Exception(Marshal.GetLastWin32Error());
        }
        Thread.Sleep(12);
      }
      return new {
        ok = true,
        targetMode = targetMode,
        sourceHandle = source.ToInt64(),
        childHandle = candidates[0].ToInt64(),
        targetHandle = target.ToInt64(),
        targetClass = ClassName(target),
        targetTitle = Text(target),
        width = width,
        height = height,
        mappedX = x,
        mappedY = y
      };
    } finally {
      if (previous != IntPtr.Zero) {
        try { SetThreadDpiAwarenessContext(previous); } catch { }
      }
    }
  }
}
'@
Add-Type -TypeDefinition $source -Language CSharp
[MineradioWePointerTargetProbe]::Run($expectedTitle, $targetMode, $xUnit, $yUnit) | ConvertTo-Json -Compress
`.trim();
}

function postPointer(target, xUnit, yUnit) {
  const stdout = execFileSync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    encodedPowerShell(pointerTargetProbeScript()),
  ], {
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      MINERADIO_WE_DIAG_SOURCE_TITLE: sourceTitle,
      MINERADIO_WE_DIAG_TARGET: target,
      MINERADIO_WE_DIAG_X: String(xUnit),
      MINERADIO_WE_DIAG_Y: String(yUnit),
    },
  });
  return JSON.parse(String(stdout || '').trim());
}

async function captureMineradio(label) {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 1440, height: 810 },
    fetchWindowIcons: false,
  });
  const matches = sources.filter((source) => source.name === 'Mineradio');
  if (matches.length !== 1) {
    throw new Error(`Expected one Mineradio window capture source, found ${matches.length}`);
  }
  const image = matches[0].thumbnail;
  const size = image.getSize();
  const pngPath = path.join(outputDirectory, `${label}.png`);
  fs.writeFileSync(pngPath, image.toPNG());
  return {
    label,
    pngPath,
    width: size.width,
    height: size.height,
    bitmap: Buffer.from(image.toBitmap()),
  };
}

function meanAbsoluteRgb(first, second) {
  if (!first || !second || first.bitmap.length !== second.bitmap.length) return null;
  let total = 0;
  let count = 0;
  for (let index = 0; index + 3 < first.bitmap.length; index += 4) {
    total += Math.abs(first.bitmap[index] - second.bitmap[index]);
    total += Math.abs(first.bitmap[index + 1] - second.bitmap[index + 1]);
    total += Math.abs(first.bitmap[index + 2] - second.bitmap[index + 2]);
    count += 3;
  }
  return count ? total / count : 0;
}

async function captureAfter(target, side, xUnit) {
  const posted = postPointer(target, xUnit, 32768);
  await wait(settleMs);
  const capture = await captureMineradio(`${target}-${side}`);
  return { posted, capture };
}

async function run() {
  if (!sourceTitle) throw new Error('Pass --source-title with the exact Mineradio Wallpaper session title');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const baseline = await captureMineradio('baseline');
  const parentLeft = await captureAfter('parent', 'left', 4096);
  const parentRight = await captureAfter('parent', 'right', 61439);
  const childLeft = await captureAfter('child', 'left', 4096);
  const childRight = await captureAfter('child', 'right', 61439);
  const result = {
    ok: true,
    sourceTitle,
    settleMs,
    outputDirectory,
    baseline: { pngPath: baseline.pngPath, width: baseline.width, height: baseline.height },
    parent: {
      left: parentLeft.posted,
      right: parentRight.posted,
      meanAbsoluteRgb: meanAbsoluteRgb(parentLeft.capture, parentRight.capture),
      images: [parentLeft.capture.pngPath, parentRight.capture.pngPath],
    },
    child: {
      left: childLeft.posted,
      right: childRight.posted,
      meanAbsoluteRgb: meanAbsoluteRgb(childLeft.capture, childRight.capture),
      images: [childLeft.capture.pngPath, childRight.capture.pngPath],
    },
  };
  fs.writeFileSync(path.join(outputDirectory, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
}

app.whenReady().then(run).then(() => app.quit()).catch((error) => {
  const message = String(error && error.stack || error);
  try {
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(path.join(outputDirectory, 'error.log'), `${message}\n`);
  } catch (_) { }
  console.error(message);
  app.exit(1);
});
