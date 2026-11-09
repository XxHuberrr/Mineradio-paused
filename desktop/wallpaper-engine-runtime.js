'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { discoverSteamLibraries: defaultDiscoverSteamLibraries } = require('./wallpaper-engine-library');

const SIGNER_PATTERN = /\bSkutta Software\b/i;
const MIN_WIDTH = 64;
const MAX_WIDTH = 7680;
const MIN_HEIGHT = 64;
const MAX_HEIGHT = 4320;
const MIN_FPS = 15;
const MAX_FPS = 240;
const MIN_POSITION = -32000;
const MAX_POSITION = 32000;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_FPS = 60;
const DEFAULT_X = 0;
const DEFAULT_Y = 0;
const DEFAULT_SOURCE_TIMEOUT_MS = 15000;
const DEFAULT_SOURCE_POLL_MS = 60;
const DEFAULT_REFRESH_SOURCE_TIMEOUT_MS = 1200;
const DEFAULT_REFRESH_SOURCE_POLL_MS = 80;
const ENGINE_BOOTSTRAP_TIMEOUT_MS = 20000;
const ENGINE_PROCESS_POLL_MS = 120;
const ENGINE_PROCESS_STABLE_MS = 720;
const ENGINE_READY_POLL_MS = 180;
const ENGINE_READY_SUCCESS_COUNT = 2;
const ENGINE_READY_CACHE_MS = 2500;
const INITIAL_MUTE_RETRY_DELAYS_MS = Object.freeze([0, 120, 320, 700, 1300, 2200]);
const INITIAL_MUTE_RETRY_DEADLINE_MS = 8000;
const MUTE_REASSERT_DELAYS_MS = Object.freeze([80, 220, 650, 1500, 3200, 6500, 10000]);
const SAFE_PROPERTY_KEY = /^[a-z0-9_.-]{1,128}$/i;
const BLOCKED_PROPERTY_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const WALLPAPER_PACKAGE_INDEX_MAX_BYTES = 16 * 1024 * 1024;
const WALLPAPER_PACKAGE_SCENE_MAX_BYTES = 32 * 1024 * 1024;
const WALLPAPER_PACKAGE_ENTRY_MAX_COUNT = 32768;
const WALLPAPER_PACKAGE_ENTRY_NAME_MAX_BYTES = 4096;
const MUTED_SCENE_PACKAGE_CACHE_VERSION = 1;
const POINTER_RELAY_MAX_FPS = 120;
const POINTER_RELAY_START_TIMEOUT_MS = 5000;
const POINTER_RELAY_STOP_TIMEOUT_MS = 400;
const POINTER_RELAY_RETRY_DELAYS_MS = Object.freeze([360, 1200, 3000]);
const DWM_SURFACE_START_TIMEOUT_MS = 6000;
const DWM_SURFACE_STOP_TIMEOUT_MS = 600;
const DWM_SURFACE_RETRY_DELAY_MS = 650;

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function safeRuntimeOptions(options = {}) {
  return {
    width: clampInteger(options.width, MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH),
    height: clampInteger(options.height, MIN_HEIGHT, MAX_HEIGHT, DEFAULT_HEIGHT),
    fps: clampInteger(options.fps, MIN_FPS, MAX_FPS, DEFAULT_FPS),
    x: clampInteger(options.x, MIN_POSITION, MAX_POSITION, DEFAULT_X),
    y: clampInteger(options.y, MIN_POSITION, MAX_POSITION, DEFAULT_Y),
    sourceTimeoutMs: clampInteger(options.sourceTimeoutMs, 500, 30000, DEFAULT_SOURCE_TIMEOUT_MS),
    sourcePollMs: clampInteger(options.sourcePollMs, 50, 1000, DEFAULT_SOURCE_POLL_MS),
  };
}

function runtimeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalizeEngineProcessState(value) {
  if (value === true) return { ok: true, running: true, matching: true, executable: '', matchingPids: [] };
  if (value === false) return { ok: true, running: false, matching: false, executable: '', matchingPids: [] };
  if (!value || typeof value !== 'object') {
    return { ok: false, running: false, matching: false, executable: '', matchingPids: [] };
  }
  return {
    ok: value.ok !== false,
    running: value.running === true,
    matching: value.matching === true,
    executable: String(value.executable || ''),
    matchingPids: Array.isArray(value.matchingPids)
      ? value.matchingPids.map((entry) => Number(entry) || 0).filter(Boolean)
      : [],
  };
}

function engineProcessPidKey(state) {
  return Array.isArray(state && state.matchingPids)
    ? state.matchingPids.map((value) => Number(value) || 0).filter(Boolean).sort((a, b) => a - b).join(',')
    : '';
}

function sanitizeMuteProperties(value) {
  const output = Object.create(null);
  output.volume = 0;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...output };
  let count = 0;
  for (const [rawKey, rawValue] of Object.entries(value)) {
    if (count >= 32) break;
    const key = String(rawKey || '').trim();
    if (!SAFE_PROPERTY_KEY.test(key) || BLOCKED_PROPERTY_KEYS.has(key.toLowerCase())) continue;
    if (key.toLowerCase() === 'volume') continue;
    if (typeof rawValue === 'boolean') output[key] = rawValue;
    else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) output[key] = rawValue;
    else if (typeof rawValue === 'string' && /^[a-z0-9_.-]{1,64}$/i.test(rawValue.trim())) {
      output[key] = rawValue.trim();
    }
    else continue;
    count += 1;
  }
  return { ...output };
}

async function statFile(target) {
  try {
    const stat = await fs.promises.stat(target);
    return stat.isFile() ? stat : null;
  } catch (_) {
    return null;
  }
}

async function readFileHandleRange(handle, length, position) {
  const buffer = Buffer.allocUnsafe(length);
  let offset = 0;
  while (offset < length) {
    const result = await handle.read(buffer, offset, length - offset, position + offset);
    if (!result || result.bytesRead <= 0) throw runtimeError('WALLPAPER_SCENE_PACKAGE_INVALID');
    offset += result.bytesRead;
  }
  return buffer;
}

function readPackageUInt32(buffer, state) {
  if (!buffer || !state || state.offset < 0 || state.offset + 4 > buffer.length) {
    throw runtimeError('WALLPAPER_SCENE_PACKAGE_INDEX_INVALID');
  }
  const value = buffer.readUInt32LE(state.offset);
  state.offset += 4;
  return value;
}

function readPackageString(buffer, state, maximumLength) {
  const length = readPackageUInt32(buffer, state);
  if (length <= 0 || length > maximumLength || state.offset + length > buffer.length) {
    throw runtimeError('WALLPAPER_SCENE_PACKAGE_INDEX_INVALID');
  }
  const value = buffer.subarray(state.offset, state.offset + length).toString('utf8');
  state.offset += length;
  return value;
}

async function readWallpaperPackageScene(scenePackage) {
  const packageStat = await statFile(scenePackage);
  if (!packageStat || packageStat.size < 32) throw runtimeError('WALLPAPER_SCENE_PACKAGE_INVALID');
  const handle = await fs.promises.open(scenePackage, 'r');
  try {
    const indexLength = Math.min(packageStat.size, WALLPAPER_PACKAGE_INDEX_MAX_BYTES);
    const indexBuffer = await readFileHandleRange(handle, indexLength, 0);
    const state = { offset: 0 };
    const header = readPackageString(indexBuffer, state, 32);
    if (!/^PKGV\d{4}$/i.test(header)) throw runtimeError('WALLPAPER_SCENE_PACKAGE_FORMAT_UNSUPPORTED');
    const entryCount = readPackageUInt32(indexBuffer, state);
    if (entryCount <= 0 || entryCount > WALLPAPER_PACKAGE_ENTRY_MAX_COUNT) {
      throw runtimeError('WALLPAPER_SCENE_PACKAGE_INDEX_INVALID');
    }
    let sceneEntry = null;
    for (let index = 0; index < entryCount; index += 1) {
      const name = readPackageString(indexBuffer, state, WALLPAPER_PACKAGE_ENTRY_NAME_MAX_BYTES);
      const offset = readPackageUInt32(indexBuffer, state);
      const length = readPackageUInt32(indexBuffer, state);
      if (name.replace(/\\/g, '/').toLowerCase() === 'scene.json') sceneEntry = { offset, length };
    }
    if (!sceneEntry || sceneEntry.length <= 0 || sceneEntry.length > WALLPAPER_PACKAGE_SCENE_MAX_BYTES) {
      throw runtimeError('WALLPAPER_SCENE_PACKAGE_SCENE_INVALID');
    }
    const dataOffset = state.offset + sceneEntry.offset;
    if (!Number.isSafeInteger(dataOffset)
      || dataOffset < state.offset
      || dataOffset + sceneEntry.length > packageStat.size) {
      throw runtimeError('WALLPAPER_SCENE_PACKAGE_SCENE_INVALID');
    }
    const sceneBuffer = await readFileHandleRange(handle, sceneEntry.length, dataOffset);
    let scene;
    try {
      scene = JSON.parse(sceneBuffer.toString('utf8').replace(/^\uFEFF/, ''));
    } catch (_) {
      throw runtimeError('WALLPAPER_SCENE_PACKAGE_SCENE_INVALID');
    }
    if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
      throw runtimeError('WALLPAPER_SCENE_PACKAGE_SCENE_INVALID');
    }
    return {
      header,
      dataOffset,
      sceneLength: sceneEntry.length,
      scene,
      packageSize: packageStat.size,
      packageMtimeMs: Number(packageStat.mtimeMs) || 0,
    };
  } finally {
    await handle.close();
  }
}

function visitSceneAudioObjects(scene, visitor) {
  let audioObjectCount = 0;
  let visited = 0;
  const walk = (value, depth) => {
    if (!value || typeof value !== 'object' || depth > 128) return;
    visited += 1;
    if (visited > 250000) throw runtimeError('WALLPAPER_SCENE_PACKAGE_SCENE_TOO_COMPLEX');
    if (Object.prototype.hasOwnProperty.call(value, 'sound')
      && (typeof value.sound === 'string' || Array.isArray(value.sound))) {
      audioObjectCount += 1;
      visitor(value);
    }
    for (const child of Object.values(value)) walk(child, depth + 1);
  };
  walk(scene, 0);
  return audioObjectCount;
}

function forceSceneAudioSilent(scene) {
  return visitSceneAudioObjects(scene, (value) => {
    value.startsilent = true;
    value.volume = 0;
  });
}

function inspectSceneAudioSilence(scene) {
  let allSilent = true;
  const audioObjectCount = visitSceneAudioObjects(scene, (value) => {
    if (value.startsilent !== true || value.volume !== 0) allSilent = false;
  });
  return { audioObjectCount, allSilent };
}

async function validateMutedScenePackage(scenePackage, expectedPackageSize, expectedAudioObjectCount) {
  try {
    const cached = await readWallpaperPackageScene(scenePackage);
    if (cached.packageSize !== expectedPackageSize) return false;
    const inspection = inspectSceneAudioSilence(cached.scene);
    return inspection.allSilent && inspection.audioObjectCount === expectedAudioObjectCount;
  } catch (_) {
    return false;
  }
}

function encodePatchedScene(scene, originalLength) {
  const encoded = Buffer.from(JSON.stringify(scene), 'utf8');
  if (encoded.length > originalLength) throw runtimeError('WALLPAPER_SCENE_PACKAGE_PATCH_TOO_LARGE');
  const output = Buffer.alloc(originalLength, 0x20);
  encoded.copy(output);
  return output;
}

function signatureScript() {
  const source = [
    "$ErrorActionPreference = 'Stop'",
    "$target = [Environment]::GetEnvironmentVariable('MINERADIO_WE_SIGNATURE_TARGET', 'Process')",
    'if ([string]::IsNullOrWhiteSpace($target)) { throw \'Missing signature target\' }',
    '$signature = Get-AuthenticodeSignature -LiteralPath $target',
    '[pscustomobject]@{',
    '  status = [string]$signature.Status',
    '  subject = if ($signature.SignerCertificate) { [string]$signature.SignerCertificate.Subject } else { \'\' }',
    '} | ConvertTo-Json -Compress',
  ].join('\r\n');
  return Buffer.from(source, 'utf16le').toString('base64');
}

function engineProcessProbeScript() {
  const source = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$target = [Environment]::GetEnvironmentVariable('MINERADIO_WE_ENGINE_TARGET', 'Process')
$expected = ''
try { if (-not [string]::IsNullOrWhiteSpace($target)) { $expected = [IO.Path]::GetFullPath($target) } } catch { $expected = '' }
$expectedRoot = ''
try { if ($expected) { $expectedRoot = [IO.Path]::GetDirectoryName($expected) } } catch { $expectedRoot = '' }
$processes = @(Get-Process -Name 'wallpaper32','wallpaper64' -ErrorAction SilentlyContinue)
$matching = @()
foreach ($process in $processes) {
  $candidate = ''
  try { $candidate = [IO.Path]::GetFullPath([string]$process.Path) } catch { $candidate = '' }
  $candidateRoot = ''
  try { if ($candidate) { $candidateRoot = [IO.Path]::GetDirectoryName($candidate) } } catch { $candidateRoot = '' }
  if ($expectedRoot -and $candidateRoot -and [string]::Equals($candidateRoot, $expectedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    $matching += [pscustomobject]@{ process = $process; path = $candidate }
  }
}
$preferred = @($matching | Where-Object { [string]::Equals([string]$_.path, $expected, [StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1)
$selected = if ($preferred.Count -gt 0) { $preferred[0] } elseif ($matching.Count -gt 0) { $matching[0] } else { $null }
[pscustomobject]@{
  running = $processes.Count -gt 0
  matching = $matching.Count -gt 0
  executable = if ($selected) { [string]$selected.path } else { '' }
  matchingPids = @($matching | ForEach-Object { [int]$_.process.Id })
} | ConvertTo-Json -Compress
`.trim();
  return Buffer.from(source, 'utf16le').toString('base64');
}

function controlBrokerScript() {
  const source = String.raw`
$ErrorActionPreference = 'Stop'
$target = [Environment]::GetEnvironmentVariable('MINERADIO_WE_CONTROL_TARGET', 'Process')
$commandLine = [Environment]::GetEnvironmentVariable('MINERADIO_WE_CONTROL_COMMAND_LINE', 'Process')
$waitForExit = [Environment]::GetEnvironmentVariable('MINERADIO_WE_CONTROL_WAIT', 'Process') -eq '1'
$waitTimeout = 10000
try { $waitTimeout = [Math]::Max(1000, [Math]::Min(20000, [int][Environment]::GetEnvironmentVariable('MINERADIO_WE_CONTROL_WAIT_TIMEOUT', 'Process'))) } catch { $waitTimeout = 10000 }
if ([string]::IsNullOrWhiteSpace($target) -or -not [IO.File]::Exists($target)) { throw 'Missing Wallpaper Engine control target' }
if ([string]::IsNullOrWhiteSpace($commandLine)) { throw 'Missing Wallpaper Engine control command line' }
$source = @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class MineradioExplorerParentLauncher {
  const uint PROCESS_CREATE_PROCESS = 0x0080;
  const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
  const uint TOKEN_QUERY = 0x0008;
  const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
  const int TOKEN_INTEGRITY_LEVEL = 25;
  const int SECURITY_MANDATORY_MEDIUM_RID = 0x2000;
  const int SECURITY_MANDATORY_HIGH_RID = 0x3000;
  const uint WAIT_OBJECT_0 = 0x00000000;
  static readonly IntPtr PROC_THREAD_ATTRIBUTE_PARENT_PROCESS = new IntPtr(0x00020000);

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct STARTUPINFO {
    public int cb;
    public string lpReserved;
    public string lpDesktop;
    public string lpTitle;
    public int dwX;
    public int dwY;
    public int dwXSize;
    public int dwYSize;
    public int dwXCountChars;
    public int dwYCountChars;
    public int dwFillAttribute;
    public int dwFlags;
    public short wShowWindow;
    public short cbReserved2;
    public IntPtr lpReserved2;
    public IntPtr hStdInput;
    public IntPtr hStdOutput;
    public IntPtr hStdError;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct PROCESS_INFORMATION {
    public IntPtr hProcess;
    public IntPtr hThread;
    public int dwProcessId;
    public int dwThreadId;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct STARTUPINFOEX {
    public STARTUPINFO StartupInfo;
    public IntPtr lpAttributeList;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct SID_AND_ATTRIBUTES {
    public IntPtr Sid;
    public uint Attributes;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct TOKEN_MANDATORY_LABEL {
    public SID_AND_ATTRIBUTES Label;
  }

  [DllImport("user32.dll")]
  static extern IntPtr GetShellWindow();

  [DllImport("user32.dll", SetLastError = true)]
  static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern IntPtr OpenProcess(uint access, bool inheritHandle, int processId);

  [DllImport("advapi32.dll", SetLastError = true)]
  static extern bool OpenProcessToken(IntPtr processHandle, uint desiredAccess, out IntPtr tokenHandle);

  [DllImport("advapi32.dll", SetLastError = true)]
  static extern bool GetTokenInformation(IntPtr tokenHandle, int tokenInformationClass, IntPtr tokenInformation, int tokenInformationLength, out int returnLength);

  [DllImport("advapi32.dll")]
  static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);

  [DllImport("advapi32.dll")]
  static extern IntPtr GetSidSubAuthority(IntPtr sid, uint subAuthority);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool InitializeProcThreadAttributeList(IntPtr attributeList, int attributeCount, uint flags, ref IntPtr size);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool UpdateProcThreadAttribute(IntPtr attributeList, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previousValue, IntPtr returnSize);

  [DllImport("kernel32.dll")]
  static extern void DeleteProcThreadAttributeList(IntPtr attributeList);

  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool CreateProcessW(string applicationName, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint creationFlags, IntPtr environment, string currentDirectory, ref STARTUPINFOEX startupInfo, out PROCESS_INFORMATION processInformation);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool TerminateProcess(IntPtr process, uint exitCode);

  [DllImport("kernel32.dll")]
  static extern bool CloseHandle(IntPtr handle);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

  static int GetIntegrityRid(IntPtr token) {
    int length = 0;
    GetTokenInformation(token, TOKEN_INTEGRITY_LEVEL, IntPtr.Zero, 0, out length);
    if (length <= 0) throw new Win32Exception(Marshal.GetLastWin32Error());
    IntPtr buffer = Marshal.AllocHGlobal(length);
    try {
      if (!GetTokenInformation(token, TOKEN_INTEGRITY_LEVEL, buffer, length, out length)) {
        throw new Win32Exception(Marshal.GetLastWin32Error());
      }
      TOKEN_MANDATORY_LABEL label = (TOKEN_MANDATORY_LABEL)Marshal.PtrToStructure(buffer, typeof(TOKEN_MANDATORY_LABEL));
      IntPtr countPointer = GetSidSubAuthorityCount(label.Label.Sid);
      if (countPointer == IntPtr.Zero) throw new InvalidOperationException("Desktop Shell token has no integrity SID");
      byte count = Marshal.ReadByte(countPointer);
      if (count == 0) throw new InvalidOperationException("Desktop Shell token integrity SID is empty");
      IntPtr ridPointer = GetSidSubAuthority(label.Label.Sid, (uint)(count - 1));
      if (ridPointer == IntPtr.Zero) throw new InvalidOperationException("Desktop Shell token integrity RID is missing");
      return Marshal.ReadInt32(ridPointer);
    } finally {
      Marshal.FreeHGlobal(buffer);
    }
  }

  public static int Launch(string application, string commandLine, string currentDirectory, bool waitForExit, int waitTimeout) {
    Process explorer = null;
    IntPtr explorerProcess = IntPtr.Zero;
    IntPtr explorerToken = IntPtr.Zero;
    IntPtr childToken = IntPtr.Zero;
    IntPtr attributeList = IntPtr.Zero;
    IntPtr parentValue = IntPtr.Zero;
    bool attributeListInitialized = false;
    PROCESS_INFORMATION processInformation = new PROCESS_INFORMATION();
    try {
      IntPtr shellWindow = GetShellWindow();
      if (shellWindow == IntPtr.Zero) throw new InvalidOperationException("Desktop Shell window not found");
      uint shellProcessId;
      if (GetWindowThreadProcessId(shellWindow, out shellProcessId) == 0 || shellProcessId == 0) {
        throw new Win32Exception(Marshal.GetLastWin32Error());
      }
      explorer = Process.GetProcessById((int)shellProcessId);
      if (explorer.SessionId != Process.GetCurrentProcess().SessionId) {
        throw new InvalidOperationException("Desktop Shell belongs to a different session");
      }
      explorerProcess = OpenProcess(PROCESS_CREATE_PROCESS | PROCESS_QUERY_LIMITED_INFORMATION, false, explorer.Id);
      if (explorerProcess == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
      if (!OpenProcessToken(explorerProcess, TOKEN_QUERY, out explorerToken)) {
        throw new Win32Exception(Marshal.GetLastWin32Error());
      }
      int integrityRid = GetIntegrityRid(explorerToken);
      if (integrityRid < SECURITY_MANDATORY_MEDIUM_RID || integrityRid >= SECURITY_MANDATORY_HIGH_RID) {
        throw new InvalidOperationException("Desktop Shell token is not medium integrity");
      }
      IntPtr attributeSize = IntPtr.Zero;
      InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeSize);
      if (attributeSize == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
      attributeList = Marshal.AllocHGlobal(attributeSize);
      if (!InitializeProcThreadAttributeList(attributeList, 1, 0, ref attributeSize)) {
        throw new Win32Exception(Marshal.GetLastWin32Error());
      }
      attributeListInitialized = true;
      parentValue = Marshal.AllocHGlobal(IntPtr.Size);
      Marshal.WriteIntPtr(parentValue, explorerProcess);
      if (!UpdateProcThreadAttribute(attributeList, 0, PROC_THREAD_ATTRIBUTE_PARENT_PROCESS, parentValue, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero)) {
        throw new Win32Exception(Marshal.GetLastWin32Error());
      }
      STARTUPINFOEX startupInfo = new STARTUPINFOEX();
      startupInfo.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
      startupInfo.StartupInfo.lpDesktop = @"winsta0\default";
      startupInfo.lpAttributeList = attributeList;
      StringBuilder mutableCommandLine = new StringBuilder(commandLine);
      if (!CreateProcessW(application, mutableCommandLine, IntPtr.Zero, IntPtr.Zero, false, EXTENDED_STARTUPINFO_PRESENT, IntPtr.Zero, currentDirectory, ref startupInfo, out processInformation)) {
        throw new Win32Exception(Marshal.GetLastWin32Error());
      }
      // PROC_THREAD_ATTRIBUTE_PARENT_PROCESS makes Windows inherit Explorer's
      // process token. Verify that contract immediately and fail closed if a
      // future Windows/runtime change ever produces a high-integrity child.
      if (!OpenProcessToken(processInformation.hProcess, TOKEN_QUERY, out childToken)) {
        TerminateProcess(processInformation.hProcess, 1);
        throw new Win32Exception(Marshal.GetLastWin32Error());
      }
      int childIntegrityRid = GetIntegrityRid(childToken);
      if (childIntegrityRid < SECURITY_MANDATORY_MEDIUM_RID || childIntegrityRid >= SECURITY_MANDATORY_HIGH_RID) {
        TerminateProcess(processInformation.hProcess, 1);
        throw new InvalidOperationException("Wallpaper Engine child is not medium integrity");
      }
      if (waitForExit) {
        uint waitResult = WaitForSingleObject(processInformation.hProcess, (uint)Math.Max(1000, waitTimeout));
        if (waitResult != WAIT_OBJECT_0) throw new TimeoutException("Wallpaper Engine control command did not exit in time");
        uint exitCode;
        if (!GetExitCodeProcess(processInformation.hProcess, out exitCode)) throw new Win32Exception(Marshal.GetLastWin32Error());
        if (exitCode != 0) throw new InvalidOperationException("Wallpaper Engine control command failed with exit code " + exitCode);
      }
      return processInformation.dwProcessId;
    } finally {
      if (processInformation.hThread != IntPtr.Zero) CloseHandle(processInformation.hThread);
      if (processInformation.hProcess != IntPtr.Zero) CloseHandle(processInformation.hProcess);
      if (childToken != IntPtr.Zero) CloseHandle(childToken);
      if (attributeListInitialized && attributeList != IntPtr.Zero) DeleteProcThreadAttributeList(attributeList);
      if (parentValue != IntPtr.Zero) Marshal.FreeHGlobal(parentValue);
      if (attributeList != IntPtr.Zero) Marshal.FreeHGlobal(attributeList);
      if (explorerToken != IntPtr.Zero) CloseHandle(explorerToken);
      if (explorerProcess != IntPtr.Zero) CloseHandle(explorerProcess);
      if (explorer != null) explorer.Dispose();
    }
  }
}

'@
Add-Type -TypeDefinition $source -Language CSharp
$workingDirectory = [IO.Path]::GetDirectoryName($target)
[void][MineradioExplorerParentLauncher]::Launch($target, $commandLine, $workingDirectory, $waitForExit, $waitTimeout)
`.trim();
  return Buffer.from(source, 'utf16le').toString('base64');
}

function nativeWindowControlScript() {
  const source = String.raw`
$ErrorActionPreference = 'Stop'
$action = [Environment]::GetEnvironmentVariable('MINERADIO_WE_WINDOW_ACTION', 'Process')
$sourceId = [Environment]::GetEnvironmentVariable('MINERADIO_WE_WINDOW_SOURCE_ID', 'Process')
$expectedTitle = [Environment]::GetEnvironmentVariable('MINERADIO_WE_WINDOW_TITLE', 'Process')
$expectedExecutable = [Environment]::GetEnvironmentVariable('MINERADIO_WE_WINDOW_EXECUTABLE', 'Process')
$hostWindowId = [Environment]::GetEnvironmentVariable('MINERADIO_WE_HOST_WINDOW_ID', 'Process')
$hostExecutable = [Environment]::GetEnvironmentVariable('MINERADIO_WE_HOST_EXECUTABLE', 'Process')
$hostCornerRadius = [Environment]::GetEnvironmentVariable('MINERADIO_WE_HOST_CORNER_RADIUS', 'Process')
if ([string]::IsNullOrWhiteSpace($action) -or [string]::IsNullOrWhiteSpace($sourceId)) { throw 'Missing window control input' }
$source = @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public sealed class MineradioWeWindowResult {
  public bool ok { get; set; }
  public bool missing { get; set; }
  public bool moved { get; set; }
  public bool embedded { get; set; }
  public bool parked { get; set; }
  public bool aligned { get; set; }
  public bool rounded { get; set; }
  public bool closePosted { get; set; }
  public bool closed { get; set; }
  public long left { get; set; }
  public long top { get; set; }
  public long right { get; set; }
  public long bottom { get; set; }
  public long visibleWidth { get; set; }
  public long visibleHeight { get; set; }
  public uint processId { get; set; }
  public long hostLeft { get; set; }
  public long hostTop { get; set; }
  public long hostRight { get; set; }
  public long hostBottom { get; set; }
}

public static class MineradioWeWindowControl {
  const uint WM_CLOSE = 0x0010;
  const int SM_XVIRTUALSCREEN = 76;
  const int SM_YVIRTUALSCREEN = 77;
  const int SM_CXVIRTUALSCREEN = 78;
  const int SM_CYVIRTUALSCREEN = 79;

  [StructLayout(LayoutKind.Sequential)]
  struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll", SetLastError=true)] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", SetLastError=true)] static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", SetLastError=true)] static extern bool PostMessageW(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", SetLastError=true)] static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);
  [DllImport("gdi32.dll", SetLastError=true)] static extern IntPtr CreateRoundRectRgn(int left, int top, int right, int bottom, int widthEllipse, int heightEllipse);
  [DllImport("user32.dll", SetLastError=true)] static extern int SetWindowRgn(IntPtr hWnd, IntPtr region, bool redraw);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr handle);

  static IntPtr ParseHandle(string sourceId) {
    string[] parts = (sourceId ?? "").Split(':');
    if (parts.Length != 3 || !String.Equals(parts[0], "window", StringComparison.Ordinal)) throw new InvalidOperationException("Invalid capture source id");
    ulong raw;
    if (!UInt64.TryParse(parts[1], out raw) || raw == 0) throw new InvalidOperationException("Invalid capture window handle");
    return IntPtr.Size == 8 ? new IntPtr(unchecked((long)raw)) : new IntPtr(unchecked((int)raw));
  }

  static IntPtr ParseRawHandle(string rawHandle) {
    ulong raw;
    if (!UInt64.TryParse(rawHandle ?? "", out raw) || raw == 0) throw new InvalidOperationException("Invalid host window handle");
    return IntPtr.Size == 8 ? new IntPtr(unchecked((long)raw)) : new IntPtr(unchecked((int)raw));
  }

  static string WindowTitle(IntPtr hWnd) {
    StringBuilder text = new StringBuilder(1024);
    GetWindowTextW(hWnd, text, text.Capacity);
    return text.ToString();
  }

  static MineradioWeWindowResult Snapshot(IntPtr hWnd, uint processId) {
    RECT rect;
    if (!GetWindowRect(hWnd, out rect)) throw new Win32Exception(Marshal.GetLastWin32Error());
    int virtualLeft = GetSystemMetrics(SM_XVIRTUALSCREEN);
    int virtualTop = GetSystemMetrics(SM_YVIRTUALSCREEN);
    int virtualRight = virtualLeft + Math.Max(1, GetSystemMetrics(SM_CXVIRTUALSCREEN));
    int virtualBottom = virtualTop + Math.Max(1, GetSystemMetrics(SM_CYVIRTUALSCREEN));
    long visibleWidth = Math.Max(0, Math.Min(rect.Right, virtualRight) - Math.Max(rect.Left, virtualLeft));
    long visibleHeight = Math.Max(0, Math.Min(rect.Bottom, virtualBottom) - Math.Max(rect.Top, virtualTop));
    return new MineradioWeWindowResult {
      ok = true,
      left = rect.Left,
      top = rect.Top,
      right = rect.Right,
      bottom = rect.Bottom,
      visibleWidth = visibleWidth,
      visibleHeight = visibleHeight,
      processId = processId
    };
  }

  static uint ValidateProcess(IntPtr hWnd, string expectedExecutable) {
    uint processId;
    if (GetWindowThreadProcessId(hWnd, out processId) == 0 || processId == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
    Process process = Process.GetProcessById((int)processId);
    try {
      string actual = Path.GetFullPath(process.MainModule.FileName);
      string expected = Path.GetFullPath(expectedExecutable ?? "");
      if (!String.Equals(actual, expected, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Window process mismatch");
    } finally { process.Dispose(); }
    return processId;
  }

  static bool ApplyCornerRegion(IntPtr hWnd, RECT rect, string rawRadius) {
    int radius;
    if (!Int32.TryParse(rawRadius ?? "", out radius)) radius = 0;
    radius = Math.Max(0, Math.Min(512, radius));
    if (radius <= 0) {
      SetWindowRgn(hWnd, IntPtr.Zero, true);
      return false;
    }
    int width = Math.Max(1, rect.Right - rect.Left);
    int height = Math.Max(1, rect.Bottom - rect.Top);
    IntPtr region = CreateRoundRectRgn(0, 0, width + 1, height + 1, radius * 2, radius * 2);
    if (region == IntPtr.Zero) return false;
    if (SetWindowRgn(hWnd, region, true) == 0) {
      DeleteObject(region);
      return false;
    }
    // SetWindowRgn owns the region after success.
    return true;
  }

  static MineradioWeWindowResult RunDpiAware(string action, string sourceId, string expectedTitle, string expectedExecutable, string hostWindowId, string hostExecutable, string hostCornerRadius) {
    IntPtr hWnd = ParseHandle(sourceId);
    if (!IsWindow(hWnd)) return new MineradioWeWindowResult { ok = true, missing = true };
    if (!String.Equals(WindowTitle(hWnd), expectedTitle ?? "", StringComparison.Ordinal)) throw new InvalidOperationException("Capture window title mismatch");
    uint processId = ValidateProcess(hWnd, expectedExecutable);

    if (String.Equals(action, "close", StringComparison.OrdinalIgnoreCase)) {
      MineradioWeWindowResult closeResult = Snapshot(hWnd, processId);
      closeResult.closePosted = PostMessageW(hWnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
      if (!closeResult.closePosted) throw new Win32Exception(Marshal.GetLastWin32Error());
      Stopwatch closeWait = Stopwatch.StartNew();
      while (IsWindow(hWnd) && closeWait.ElapsedMilliseconds < 1800) Thread.Sleep(40);
      closeResult.closed = !IsWindow(hWnd);
      closeResult.missing = closeResult.closed;
      return closeResult;
    }
    if (String.Equals(action, "park", StringComparison.OrdinalIgnoreCase)) {
      RECT currentRect;
      if (!GetWindowRect(hWnd, out currentRect)) throw new Win32Exception(Marshal.GetLastWin32Error());
      int width = Math.Max(1, currentRect.Right - currentRect.Left);
      int height = Math.Max(1, currentRect.Bottom - currentRect.Top);
      int virtualRight = GetSystemMetrics(SM_XVIRTUALSCREEN) + Math.Max(1, GetSystemMetrics(SM_CXVIRTUALSCREEN));
      int virtualBottom = GetSystemMetrics(SM_YVIRTUALSCREEN) + Math.Max(1, GetSystemMetrics(SM_CYVIRTUALSCREEN));
      const uint SWP_NOZORDER = 0x0004;
      const uint SWP_NOACTIVATE = 0x0010;
      const uint SWP_NOOWNERZORDER = 0x0200;
      const uint SWP_NOSENDCHANGING = 0x0400;
      if (!SetWindowPos(hWnd, IntPtr.Zero, virtualRight - 1, virtualBottom - 1, width, height,
          SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_NOSENDCHANGING)) {
        throw new Win32Exception(Marshal.GetLastWin32Error());
      }
      MineradioWeWindowResult parkResult = Snapshot(hWnd, processId);
      parkResult.moved = true;
      parkResult.parked = parkResult.visibleWidth <= 1 && parkResult.visibleHeight <= 1;
      if (!parkResult.parked) throw new InvalidOperationException("Capture source window did not enter the parking strip");
      return parkResult;
    }
    if (!String.Equals(action, "embed", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Unsupported window control action");
    IntPtr hostHWnd = ParseRawHandle(hostWindowId);
    if (!IsWindow(hostHWnd)) throw new InvalidOperationException("Host window is missing");
    ValidateProcess(hostHWnd, hostExecutable);
    RECT hostRect;
    if (!GetWindowRect(hostHWnd, out hostRect)) throw new Win32Exception(Marshal.GetLastWin32Error());
    RECT sourceRect;
    if (!GetWindowRect(hWnd, out sourceRect)) throw new Win32Exception(Marshal.GetLastWin32Error());
    bool rounded = ApplyCornerRegion(hWnd, sourceRect, hostCornerRadius);
    const int tolerance = 2;
    bool aligned = !(Math.Abs(sourceRect.Left - hostRect.Left) > tolerance
      || Math.Abs(sourceRect.Top - hostRect.Top) > tolerance
      || Math.Abs(sourceRect.Right - hostRect.Right) > tolerance
      || Math.Abs(sourceRect.Bottom - hostRect.Bottom) > tolerance);
    MineradioWeWindowResult result = Snapshot(hWnd, processId);
    result.moved = false;
    result.embedded = true;
    result.aligned = aligned;
    result.rounded = rounded;
    result.hostLeft = hostRect.Left;
    result.hostTop = hostRect.Top;
    result.hostRight = hostRect.Right;
    result.hostBottom = hostRect.Bottom;
    return result;
  }

  public static MineradioWeWindowResult Run(string action, string sourceId, string expectedTitle, string expectedExecutable, string hostWindowId, string hostExecutable, string hostCornerRadius) {
    IntPtr previousDpiContext = IntPtr.Zero;
    try {
      // powershell.exe has no PMv2 manifest, so GetWindowRect otherwise returns
      // DPI-virtualized DIPs and can approve a 1536x960 source for a 1920x1200 host.
      previousDpiContext = SetThreadDpiAwarenessContext(new IntPtr(-4));
    } catch { }
    try {
      return RunDpiAware(action, sourceId, expectedTitle, expectedExecutable, hostWindowId, hostExecutable, hostCornerRadius);
    } finally {
      if (previousDpiContext != IntPtr.Zero) {
        try { SetThreadDpiAwarenessContext(previousDpiContext); } catch { }
      }
    }
  }
}
'@
Add-Type -TypeDefinition $source -Language CSharp
[MineradioWeWindowControl]::Run($action, $sourceId, $expectedTitle, $expectedExecutable, $hostWindowId, $hostExecutable, $hostCornerRadius) | ConvertTo-Json -Compress
`.trim();
  return Buffer.from(source, 'utf16le').toString('base64');
}

function nativeParallaxPointerRelayScript() {
  const source = String.raw`
$ErrorActionPreference = 'Stop'
$sourceId = [Environment]::GetEnvironmentVariable('MINERADIO_WE_POINTER_SOURCE_ID', 'Process')
$expectedTitle = [Environment]::GetEnvironmentVariable('MINERADIO_WE_POINTER_SOURCE_TITLE', 'Process')
$expectedExecutable = [Environment]::GetEnvironmentVariable('MINERADIO_WE_POINTER_SOURCE_EXECUTABLE', 'Process')
$hostWindowId = [Environment]::GetEnvironmentVariable('MINERADIO_WE_POINTER_HOST_WINDOW_ID', 'Process')
$hostExecutable = [Environment]::GetEnvironmentVariable('MINERADIO_WE_POINTER_HOST_EXECUTABLE', 'Process')
$sessionId = [Environment]::GetEnvironmentVariable('MINERADIO_WE_POINTER_SESSION_ID', 'Process')
if ([string]::IsNullOrWhiteSpace($sourceId) -or [string]::IsNullOrWhiteSpace($expectedTitle) -or
    [string]::IsNullOrWhiteSpace($expectedExecutable) -or [string]::IsNullOrWhiteSpace($hostWindowId) -or
    [string]::IsNullOrWhiteSpace($hostExecutable) -or [string]::IsNullOrWhiteSpace($sessionId)) {
  throw 'Missing native parallax pointer relay input'
}
$source = @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public static class MineradioWeParallaxPointerRelay {
  const uint WM_MOUSEMOVE = 0x0200;
  const uint GA_ROOT = 2;

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [DllImport("user32.dll")]
  static extern bool IsWindow(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int maxCount);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetClassNameW(IntPtr hWnd, StringBuilder text, int maxCount);

  [DllImport("user32.dll")]
  static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr lParam);

  [DllImport("user32.dll")]
  static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);

  [DllImport("user32.dll", SetLastError = true)]
  static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll", SetLastError = true)]
  static extern bool GetClientRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll", SetLastError = true)]
  static extern bool PostMessageW(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);

  [DllImport("user32.dll")]
  static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);

  static IntPtr ParseSourceHandle(string sourceId) {
    string[] parts = (sourceId ?? "").Split(':');
    if (parts.Length != 3 || !String.Equals(parts[0], "window", StringComparison.Ordinal)) {
      throw new InvalidOperationException("Invalid capture source id");
    }
    ulong raw;
    if (!UInt64.TryParse(parts[1], out raw) || raw == 0) {
      throw new InvalidOperationException("Invalid capture source window handle");
    }
    return IntPtr.Size == 8 ? new IntPtr(unchecked((long)raw)) : new IntPtr(unchecked((int)raw));
  }

  static IntPtr ParseRawHandle(string rawHandle) {
    ulong raw;
    if (!UInt64.TryParse(rawHandle ?? "", out raw) || raw == 0) {
      throw new InvalidOperationException("Invalid host window handle");
    }
    return IntPtr.Size == 8 ? new IntPtr(unchecked((long)raw)) : new IntPtr(unchecked((int)raw));
  }

  static string WindowTitle(IntPtr hWnd) {
    StringBuilder text = new StringBuilder(1024);
    GetWindowTextW(hWnd, text, text.Capacity);
    return text.ToString();
  }

  static string WindowClass(IntPtr hWnd) {
    StringBuilder text = new StringBuilder(256);
    GetClassNameW(hWnd, text, text.Capacity);
    return text.ToString();
  }

  static uint ValidateProcess(IntPtr hWnd, string expectedExecutable) {
    if (!IsWindow(hWnd)) throw new InvalidOperationException("Pointer relay window is missing");
    uint processId;
    if (GetWindowThreadProcessId(hWnd, out processId) == 0 || processId == 0) {
      throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    Process process = Process.GetProcessById((int)processId);
    try {
      string actual = Path.GetFullPath(process.MainModule.FileName);
      string expected = Path.GetFullPath(expectedExecutable ?? "");
      if (!String.Equals(actual, expected, StringComparison.OrdinalIgnoreCase)) {
        throw new InvalidOperationException("Pointer relay window process mismatch");
      }
    } finally {
      process.Dispose();
    }
    return processId;
  }

  static void ValidateBoundWindow(IntPtr hWnd, uint expectedProcessId) {
    if (!IsWindow(hWnd)) throw new InvalidOperationException("Pointer relay window disappeared");
    uint processId;
    if (GetWindowThreadProcessId(hWnd, out processId) == 0 || processId != expectedProcessId) {
      throw new InvalidOperationException("Pointer relay window identity changed");
    }
  }

  static IntPtr FindSceneInputWindow(IntPtr source, uint sourceProcessId) {
    List<IntPtr> candidates = new List<IntPtr>();
    EnumChildWindows(source, (hWnd, lParam) => {
      uint processId;
      GetWindowThreadProcessId(hWnd, out processId);
      if (processId == sourceProcessId
          && String.Equals(WindowClass(hWnd), "WPEDesktopDX11Window", StringComparison.Ordinal)
          && String.Equals(WindowTitle(hWnd), "WPELiveWallpaper", StringComparison.Ordinal)
          && GetAncestor(hWnd, GA_ROOT) == source) {
        candidates.Add(hWnd);
      }
      return true;
    }, IntPtr.Zero);
    if (candidates.Count != 1) {
      throw new InvalidOperationException("Expected one WPE Scene input window, found " + candidates.Count);
    }
    return candidates[0];
  }

  static void ValidateSceneInputWindow(IntPtr sceneInput, IntPtr source, uint sourceProcessId) {
    ValidateBoundWindow(sceneInput, sourceProcessId);
    if (GetAncestor(sceneInput, GA_ROOT) != source
        || !String.Equals(WindowClass(sceneInput), "WPEDesktopDX11Window", StringComparison.Ordinal)
        || !String.Equals(WindowTitle(sceneInput), "WPELiveWallpaper", StringComparison.Ordinal)) {
      throw new InvalidOperationException("Pointer relay Scene input window identity changed");
    }
  }

  static int MapCoordinate(int value, int sourceSize, int targetSize) {
    if (sourceSize <= 1 || targetSize <= 1) return 0;
    value = Math.Max(0, Math.Min(sourceSize - 1, value));
    return (int)Math.Max(0, Math.Min(targetSize - 1,
      ((long)value * (long)(targetSize - 1) + (sourceSize - 1) / 2) / (sourceSize - 1)));
  }

  static bool ForwardPointer(IntPtr source, uint sourceProcessId, string expectedTitle,
      IntPtr sceneInput, IntPtr host, uint hostProcessId, int xUnit, int yUnit) {
    ValidateBoundWindow(source, sourceProcessId);
    ValidateSceneInputWindow(sceneInput, source, sourceProcessId);
    ValidateBoundWindow(host, hostProcessId);
    if (!String.Equals(WindowTitle(source), expectedTitle ?? "", StringComparison.Ordinal)) {
      throw new InvalidOperationException("Pointer relay capture window title changed");
    }
    RECT sceneRect;
    if (!GetClientRect(sceneInput, out sceneRect)) {
      throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    int sceneWidth = Math.Max(1, sceneRect.Right - sceneRect.Left);
    int sceneHeight = Math.Max(1, sceneRect.Bottom - sceneRect.Top);
    int mappedX = MapCoordinate(xUnit, 65536, sceneWidth);
    int mappedY = MapCoordinate(yUnit, 65536, sceneHeight);
    int packed = unchecked((mappedY << 16) | (mappedX & 0xffff));
    if (!PostMessageW(sceneInput, WM_MOUSEMOVE, IntPtr.Zero, new IntPtr(packed))) {
      throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    return true;
  }

  public static void Run(string sourceId, string expectedTitle, string expectedExecutable,
      string hostWindowId, string hostExecutable, string sessionId) {
    IntPtr previousDpiContext = IntPtr.Zero;
    try {
      previousDpiContext = SetThreadDpiAwarenessContext(new IntPtr(-4));
    } catch { }
    try {
      IntPtr source = ParseSourceHandle(sourceId);
      IntPtr host = ParseRawHandle(hostWindowId);
      uint sourceProcessId = ValidateProcess(source, expectedExecutable);
      uint hostProcessId = ValidateProcess(host, hostExecutable);
      if (!String.Equals(WindowTitle(source), expectedTitle ?? "", StringComparison.Ordinal)) {
        throw new InvalidOperationException("Pointer relay capture window title mismatch");
      }
      IntPtr sceneInput = FindSceneInputWindow(source, sourceProcessId);
      Console.WriteLine("{\"ok\":true,\"ready\":true,\"sourceProcessId\":" + sourceProcessId
        + ",\"hostProcessId\":" + hostProcessId
        + ",\"sceneInputWindowHandle\":" + sceneInput.ToInt64() + "}");
      Console.Out.Flush();

      string line;
      while ((line = Console.ReadLine()) != null) {
        line = line.Trim();
        if (String.Equals(line, "Q", StringComparison.Ordinal)) break;
        string[] command = line.Split(':');
        if (command.Length != 3 || !String.Equals(command[0], "M", StringComparison.Ordinal)) continue;
        int xUnit;
        int yUnit;
        if (!Int32.TryParse(command[1], out xUnit) || !Int32.TryParse(command[2], out yUnit)
            || xUnit < 0 || xUnit > 65535 || yUnit < 0 || yUnit > 65535) continue;
        ForwardPointer(source, sourceProcessId, expectedTitle, sceneInput, host, hostProcessId, xUnit, yUnit);
      }
    } finally {
      if (previousDpiContext != IntPtr.Zero) {
        try { SetThreadDpiAwarenessContext(previousDpiContext); } catch { }
      }
    }
  }
}
'@
Add-Type -TypeDefinition $source -Language CSharp
[MineradioWeParallaxPointerRelay]::Run($sourceId, $expectedTitle, $expectedExecutable, $hostWindowId, $hostExecutable, $sessionId)
`.trim();
  return Buffer.from(source, 'utf16le').toString('base64');
}

function nativeDwmThumbnailSurfaceScript() {
  const source = String.raw`
$ErrorActionPreference = 'Stop'
$sourceId = [Environment]::GetEnvironmentVariable('MINERADIO_WE_DWM_SOURCE_ID', 'Process')
$expectedTitle = [Environment]::GetEnvironmentVariable('MINERADIO_WE_DWM_SOURCE_TITLE', 'Process')
$expectedExecutable = [Environment]::GetEnvironmentVariable('MINERADIO_WE_DWM_SOURCE_EXECUTABLE', 'Process')
$hostWindowId = [Environment]::GetEnvironmentVariable('MINERADIO_WE_DWM_HOST_WINDOW_ID', 'Process')
$hostExecutable = [Environment]::GetEnvironmentVariable('MINERADIO_WE_DWM_HOST_EXECUTABLE', 'Process')
$hostCornerRadius = [Environment]::GetEnvironmentVariable('MINERADIO_WE_DWM_HOST_CORNER_RADIUS', 'Process')
$desktopIconLayering = [Environment]::GetEnvironmentVariable('MINERADIO_WE_DWM_DESKTOP_ICON_LAYERING', 'Process')
$visualOpacity = [Environment]::GetEnvironmentVariable('MINERADIO_WE_DWM_VISUAL_OPACITY', 'Process')
$visualPositionX = [Environment]::GetEnvironmentVariable('MINERADIO_WE_DWM_VISUAL_POSITION_X', 'Process')
$visualPositionY = [Environment]::GetEnvironmentVariable('MINERADIO_WE_DWM_VISUAL_POSITION_Y', 'Process')
$visualScale = [Environment]::GetEnvironmentVariable('MINERADIO_WE_DWM_VISUAL_SCALE', 'Process')
$sessionId = [Environment]::GetEnvironmentVariable('MINERADIO_WE_DWM_SESSION_ID', 'Process')
if ([string]::IsNullOrWhiteSpace($sourceId) -or [string]::IsNullOrWhiteSpace($expectedTitle) -or
    [string]::IsNullOrWhiteSpace($expectedExecutable) -or [string]::IsNullOrWhiteSpace($hostWindowId) -or
    [string]::IsNullOrWhiteSpace($hostExecutable) -or [string]::IsNullOrWhiteSpace($sessionId)) {
  throw 'Missing DWM surface host input'
}
$source = @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

public sealed class MineradioWeDwmSurfaceHost : Form {
  [StructLayout(LayoutKind.Sequential)]
  struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  struct MONITORINFO {
    public int cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public uint dwFlags;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct DWM_THUMBNAIL_PROPERTIES {
    public uint dwFlags;
    public RECT rcDestination;
    public RECT rcSource;
    public byte opacity;
    [MarshalAs(UnmanagedType.Bool)] public bool fVisible;
    [MarshalAs(UnmanagedType.Bool)] public bool fSourceClientAreaOnly;
  }

  const uint DWM_TNP_RECTDESTINATION = 0x00000001;
  const uint DWM_TNP_OPACITY = 0x00000004;
  const uint DWM_TNP_VISIBLE = 0x00000008;
  const uint DWM_TNP_SOURCECLIENTAREAONLY = 0x00000010;
  const uint SWP_NOACTIVATE = 0x0010;
  const uint SWP_SHOWWINDOW = 0x0040;
  const int WM_NCHITTEST = 0x0084;
  const int HTTRANSPARENT = -1;
  const uint GA_ROOT = 2;
  const uint MONITOR_DEFAULTTONEAREST = 2;

  [ComImport, Guid("56FDF342-FD6D-11d0-958A-006097C9A090"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ITaskbarList {
    void HrInit();
    void AddTab(IntPtr hWnd);
    void DeleteTab(IntPtr hWnd);
    void ActivateTab(IntPtr hWnd);
    void SetActiveAlt(IntPtr hWnd);
  }

  [ComImport, Guid("56FDF344-FD6D-11d0-958A-006097C9A090"), ClassInterface(ClassInterfaceType.None)]
  class TaskbarList { }

  [DllImport("user32.dll")]
  static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);

  [DllImport("user32.dll")]
  static extern bool IsWindow(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int maxCount);

  [DllImport("user32.dll", SetLastError = true)]
  static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll", SetLastError = true)]
  static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll", SetLastError = true)]
  static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter,
    int x, int y, int width, int height, uint flags);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter,
    string className, string windowName);

  [DllImport("user32.dll")]
  static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);

  [DllImport("user32.dll")]
  static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);

  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);

  [DllImport("gdi32.dll", SetLastError = true)]
  static extern IntPtr CreateRoundRectRgn(int left, int top, int right, int bottom,
    int widthEllipse, int heightEllipse);

  [DllImport("user32.dll", SetLastError = true)]
  static extern int SetWindowRgn(IntPtr hWnd, IntPtr region, bool redraw);

  [DllImport("gdi32.dll")]
  static extern bool DeleteObject(IntPtr handle);

  [DllImport("dwmapi.dll")]
  static extern int DwmRegisterThumbnail(IntPtr destination, IntPtr source, out IntPtr thumbnail);

  [DllImport("dwmapi.dll")]
  static extern int DwmUpdateThumbnailProperties(IntPtr thumbnail,
    ref DWM_THUMBNAIL_PROPERTIES properties);

  [DllImport("dwmapi.dll")]
  static extern int DwmUnregisterThumbnail(IntPtr thumbnail);

  readonly IntPtr hostWindow;
  readonly IntPtr sourceWindow;
  readonly string sourceTitle;
  readonly int windowCornerRadius;
  bool desktopIconLayeringEnabled;
  readonly System.Windows.Forms.Timer followTimer;
  IntPtr thumbnail = IntPtr.Zero;
  int lastWidth = -1;
  int lastHeight = -1;
  int lastRadius = -1;
  int consecutiveFollowFailures = 0;
  IntPtr desktopIconHost = IntPtr.Zero;
  int visualOpacity = 255;
  int visualPositionX = 0;
  int visualPositionY = 0;
  int visualScale = 1080000;

  MineradioWeDwmSurfaceHost(IntPtr host, IntPtr source, string expectedTitle, int cornerRadius,
      bool enableDesktopIconLayering, int initialOpacity, int initialPositionX,
      int initialPositionY, int initialScale) {
    hostWindow = host;
    sourceWindow = source;
    sourceTitle = expectedTitle ?? "";
    windowCornerRadius = Math.Max(0, Math.Min(512, cornerRadius));
    desktopIconLayeringEnabled = enableDesktopIconLayering;
    visualOpacity = Math.Max(38, Math.Min(255, initialOpacity));
    visualPositionX = Math.Max(-500000, Math.Min(500000, initialPositionX));
    visualPositionY = Math.Max(-500000, Math.Min(500000, initialPositionY));
    visualScale = Math.Max(1000000, Math.Min(1600000, initialScale));
    FormBorderStyle = FormBorderStyle.None;
    // A normal top-level style lets Electron obtain an exact WGC source for
    // the SVG sampler. DeleteTab below keeps this implementation surface out
    // of the user's taskbar without adding a second visible glass layer.
    ShowInTaskbar = true;
    StartPosition = FormStartPosition.Manual;
    BackColor = Color.Black;
    Text = "Mineradio WE DWM Surface";
    followTimer = new System.Windows.Forms.Timer();
    followTimer.Interval = 60;
    followTimer.Tick += delegate {
      try { FollowHost(); }
      catch (Exception error) {
        Console.Error.WriteLine(error.Message);
        Console.Error.Flush();
        bool identityValid = IsWindow(hostWindow) && IsWindow(sourceWindow)
          && String.Equals(WindowTitle(sourceWindow), sourceTitle, StringComparison.Ordinal);
        consecutiveFollowFailures += 1;
        // Explorer reparenting and DPI changes can make one FollowHost tick
        // fail transiently. Keep the one DWM helper alive for a short bounded
        // window; invalid HWND/title identity still closes immediately.
        if (!identityValid || consecutiveFollowFailures >= 8) Close();
      }
    };
  }

  protected override bool ShowWithoutActivation { get { return true; } }

  protected override void WndProc(ref Message message) {
    if (message.Msg == WM_NCHITTEST) {
      message.Result = new IntPtr(HTTRANSPARENT);
      return;
    }
    base.WndProc(ref message);
  }

  protected override void OnShown(EventArgs eventArgs) {
    base.OnShown(eventArgs);
    FollowHost();
    followTimer.Start();
    Thread inputThread = new Thread(delegate() {
      try {
        string line;
        while ((line = Console.ReadLine()) != null) {
          string command = line.Trim();
          if (String.Equals(command, "Q", StringComparison.Ordinal)) break;
          if (String.Equals(command, "D", StringComparison.Ordinal)) {
            try {
              if (!IsDisposed && IsHandleCreated) BeginInvoke(new Action(delegate() {
                ActivateThumbnail();
                Console.WriteLine("{\"ok\":true,\"dwm\":true,\"active\":true,\"surfaceWindowHandle\":"
                  + Handle.ToInt64() + "}");
                Console.Out.Flush();
              }));
            } catch { }
            continue;
          }
          if (command.StartsWith("I|", StringComparison.Ordinal)) {
            string value = command.Substring(2);
            if (!String.Equals(value, "0", StringComparison.Ordinal)
                && !String.Equals(value, "1", StringComparison.Ordinal)) continue;
            bool enabled = String.Equals(value, "1", StringComparison.Ordinal);
            try {
              if (!IsDisposed && IsHandleCreated) BeginInvoke(new Action(delegate() {
                desktopIconLayeringEnabled = enabled;
                if (!enabled) desktopIconHost = IntPtr.Zero;
                FollowHost();
                Console.WriteLine("{\"ok\":true,\"iconLayering\":true,\"enabled\":"
                  + (enabled ? "true" : "false") + "}");
                Console.Out.Flush();
              }));
            } catch { }
            continue;
          }
          if (command.StartsWith("V|", StringComparison.Ordinal)) {
            string[] values = command.Split('|');
            int nextOpacity, nextPositionX, nextPositionY, nextScale;
            if (values.Length != 5
                || !Int32.TryParse(values[1], out nextOpacity)
                || !Int32.TryParse(values[2], out nextPositionX)
                || !Int32.TryParse(values[3], out nextPositionY)
                || !Int32.TryParse(values[4], out nextScale)) continue;
            try {
              if (!IsDisposed && IsHandleCreated) BeginInvoke(new Action(delegate() {
                visualOpacity = Math.Max(38, Math.Min(255, nextOpacity));
                visualPositionX = Math.Max(-500000, Math.Min(500000, nextPositionX));
                visualPositionY = Math.Max(-500000, Math.Min(500000, nextPositionY));
                visualScale = Math.Max(1000000, Math.Min(1600000, nextScale));
                FollowHost();
                Console.WriteLine("{\"ok\":true,\"visual\":true,\"opacity\":" + visualOpacity
                  + ",\"positionX\":" + visualPositionX + ",\"positionY\":" + visualPositionY
                  + ",\"scale\":" + visualScale + "}");
                Console.Out.Flush();
              }));
            } catch { }
            continue;
          }
        }
      } catch { }
      try {
        if (!IsDisposed && IsHandleCreated) BeginInvoke(new Action(Close));
      } catch { }
    });
    inputThread.IsBackground = true;
    inputThread.Start();
    Console.WriteLine("{\"ok\":true,\"ready\":true,\"hostWindowHandle\":"
      + hostWindow.ToInt64() + ",\"sourceWindowHandle\":" + sourceWindow.ToInt64()
      + ",\"surfaceWindowHandle\":" + Handle.ToInt64() + ",\"desktopIconLayering\":"
      + (desktopIconLayeringEnabled ? "true" : "false") + "}");
    Console.Out.Flush();
  }

  protected override void OnFormClosed(FormClosedEventArgs eventArgs) {
    followTimer.Stop();
    if (thumbnail != IntPtr.Zero) {
      DwmUnregisterThumbnail(thumbnail);
      thumbnail = IntPtr.Zero;
    }
    base.OnFormClosed(eventArgs);
  }

  static IntPtr ParseSourceHandle(string sourceId) {
    string[] parts = (sourceId ?? "").Split(':');
    if (parts.Length != 3 || !String.Equals(parts[0], "window", StringComparison.Ordinal)) {
      throw new InvalidOperationException("Invalid DWM source id");
    }
    return ParseRawHandle(parts[1]);
  }

  static IntPtr ParseRawHandle(string rawHandle) {
    ulong raw;
    if (!UInt64.TryParse(rawHandle ?? "", out raw) || raw == 0) {
      throw new InvalidOperationException("Invalid DWM window handle");
    }
    return IntPtr.Size == 8 ? new IntPtr(unchecked((long)raw)) : new IntPtr(unchecked((int)raw));
  }

  static string WindowTitle(IntPtr hWnd) {
    StringBuilder text = new StringBuilder(1024);
    GetWindowTextW(hWnd, text, text.Capacity);
    return text.ToString();
  }

  static uint ValidateProcess(IntPtr hWnd, string expectedExecutable) {
    if (!IsWindow(hWnd)) throw new InvalidOperationException("DWM window is missing");
    uint processId;
    if (GetWindowThreadProcessId(hWnd, out processId) == 0 || processId == 0) {
      throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    using (Process process = Process.GetProcessById((int)processId)) {
      string actual = Path.GetFullPath(process.MainModule.FileName);
      string expected = Path.GetFullPath(expectedExecutable ?? "");
      if (!String.Equals(actual, expected, StringComparison.OrdinalIgnoreCase)) {
        throw new InvalidOperationException("DWM window process mismatch");
      }
    }
    return processId;
  }

  static bool RectMatches(RECT first, RECT second) {
    const int tolerance = 2;
    return Math.Abs(first.Left - second.Left) <= tolerance
      && Math.Abs(first.Top - second.Top) <= tolerance
      && Math.Abs(first.Right - second.Right) <= tolerance
      && Math.Abs(first.Bottom - second.Bottom) <= tolerance;
  }

  static bool ContainsDesktopIconView(IntPtr candidate) {
    return candidate != IntPtr.Zero && IsWindow(candidate)
      && FindWindowEx(candidate, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero;
  }

  static IntPtr FindDesktopIconHost() {
    IntPtr progman = FindWindowEx(IntPtr.Zero, IntPtr.Zero, "Progman", null);
    if (ContainsDesktopIconView(progman)) return progman;

    IntPtr worker = IntPtr.Zero;
    while ((worker = FindWindowEx(IntPtr.Zero, worker, "WorkerW", null)) != IntPtr.Zero) {
      if (ContainsDesktopIconView(worker)) return worker;
    }
    return IntPtr.Zero;
  }

  IntPtr ResolveDesktopIconHost() {
    if (!ContainsDesktopIconView(desktopIconHost)) desktopIconHost = FindDesktopIconHost();
    return desktopIconHost;
  }

  int ResolveCornerRadius(RECT hostRect) {
    IntPtr monitor = MonitorFromWindow(hostWindow, MONITOR_DEFAULTTONEAREST);
    if (monitor != IntPtr.Zero) {
      MONITORINFO info = new MONITORINFO();
      info.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
      if (GetMonitorInfo(monitor, ref info)
          && (RectMatches(hostRect, info.rcMonitor) || RectMatches(hostRect, info.rcWork))) return 0;
    }
    return windowCornerRadius;
  }

  static void ApplyCornerRegion(IntPtr hWnd, int width, int height, int radius) {
    if (radius <= 0) {
      SetWindowRgn(hWnd, IntPtr.Zero, true);
      return;
    }
    IntPtr region = CreateRoundRectRgn(0, 0, width + 1, height + 1, radius * 2, radius * 2);
    if (region == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    if (SetWindowRgn(hWnd, region, true) == 0) {
      DeleteObject(region);
      throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    // SetWindowRgn owns the region after a successful call.
  }

  void ActivateThumbnail() {
    if (thumbnail != IntPtr.Zero) return;
    int result = DwmRegisterThumbnail(Handle, sourceWindow, out thumbnail);
    if (result != 0 || thumbnail == IntPtr.Zero) {
      throw new InvalidOperationException("DwmRegisterThumbnail failed: 0x" + result.ToString("X8"));
    }
    FollowHost();
    // Keep the priming HWND a normal Shell capture target until WGC is already
    // live. Removing the taskbar tab earlier makes CreateForWindow reject it.
    try {
      ITaskbarList taskbar = (ITaskbarList)new TaskbarList();
      taskbar.HrInit();
      taskbar.DeleteTab(Handle);
      Marshal.FinalReleaseComObject(taskbar);
    } catch { }
  }

  void FollowHost() {
    if (!IsWindow(hostWindow) || !IsWindow(sourceWindow)) {
      Close();
      return;
    }
    if (!String.Equals(WindowTitle(sourceWindow), sourceTitle, StringComparison.Ordinal)) {
      throw new InvalidOperationException("DWM source window identity changed");
    }
    RECT hostRect;
    if (!GetWindowRect(hostWindow, out hostRect)) throw new Win32Exception(Marshal.GetLastWin32Error());
    int width = Math.Max(1, hostRect.Right - hostRect.Left);
    int height = Math.Max(1, hostRect.Bottom - hostRect.Top);
    int radius = ResolveCornerRadius(hostRect);

    // There is deliberately no second native glass window. The single base
    // DWM surface is captured directly and cropped by Chromium only inside the
    // existing control bar, avoiding an extra transparent layer in the UI.
    // In desktop coexistence the authoritative Electron HWND is a shaped child
    // above DefView inside Explorer's icon WorkerW. Keep that same icon host
    // between Mineradio and the one base DWM surface. Normal top-level windows
    // may opt in too; unrelated WorkerW children retain the exact fallback.
    IntPtr hostRoot = GetAncestor(hostWindow, GA_ROOT);
    // A hot flag change may overlap the native reparenting transition by one
    // follow tick. Resolve the real icon host whenever the authoritative host
    // is currently a child, so a top-level surface is never ordered relative
    // to a non-sibling child HWND. Explicit opt-in still handles the preflight
    // while the Electron host is top-level.
    IntPtr iconHost = (desktopIconLayeringEnabled || hostRoot != hostWindow)
      ? ResolveDesktopIconHost() : IntPtr.Zero;
    if (iconHost != IntPtr.Zero && hostRoot != hostWindow && hostRoot != iconHost) iconHost = IntPtr.Zero;
    IntPtr hostLayer = hostRoot != IntPtr.Zero && hostRoot != hostWindow ? hostRoot : hostWindow;
    IntPtr surfaceInsertAfter = iconHost != IntPtr.Zero ? iconHost : hostLayer;
    if (thumbnail != IntPtr.Zero) {
      if (!SetWindowPos(Handle, surfaceInsertAfter, hostRect.Left, hostRect.Top, width, height,
          SWP_NOACTIVATE | SWP_SHOWWINDOW)) throw new Win32Exception(Marshal.GetLastWin32Error());
      if (!SetWindowPos(sourceWindow, Handle, hostRect.Left, hostRect.Top, width, height,
          SWP_NOACTIVATE | SWP_SHOWWINDOW)) throw new Win32Exception(Marshal.GetLastWin32Error());
    } else {
      // Until WGC has primed the SVG sampler, show the real source above the
      // empty DWM destination so startup never flashes a black base frame.
      if (!SetWindowPos(sourceWindow, surfaceInsertAfter, hostRect.Left, hostRect.Top, width, height,
          SWP_NOACTIVATE | SWP_SHOWWINDOW)) throw new Win32Exception(Marshal.GetLastWin32Error());
      if (!SetWindowPos(Handle, sourceWindow, hostRect.Left, hostRect.Top, width, height,
          SWP_NOACTIVATE | SWP_SHOWWINDOW)) throw new Win32Exception(Marshal.GetLastWin32Error());
    }

    if (width != lastWidth || height != lastHeight || radius != lastRadius) {
      ApplyCornerRegion(Handle, width, height, radius);
      ApplyCornerRegion(sourceWindow, width, height, radius);
      lastWidth = width;
      lastHeight = height;
      lastRadius = radius;
    }

    if (thumbnail != IntPtr.Zero) {
      DWM_THUMBNAIL_PROPERTIES properties = new DWM_THUMBNAIL_PROPERTIES();
      properties.dwFlags = DWM_TNP_RECTDESTINATION | DWM_TNP_OPACITY
        | DWM_TNP_VISIBLE | DWM_TNP_SOURCECLIENTAREAONLY;
      double positionX = visualPositionX / 500000.0;
      double positionY = visualPositionY / 500000.0;
      double requestedScale = visualScale / 1000000.0;
      double automaticOverscan = 1.0 + Math.Max(Math.Abs(positionX), Math.Abs(positionY)) * 0.18;
      double appliedScale = Math.Max(requestedScale, automaticOverscan);
      int destinationWidth = Math.Max(width, (int)Math.Round(width * appliedScale));
      int destinationHeight = Math.Max(height, (int)Math.Round(height * appliedScale));
      int travelX = Math.Max(0, (destinationWidth - width) / 2);
      int travelY = Math.Max(0, (destinationHeight - height) / 2);
      int destinationLeft = -travelX + (int)Math.Round(travelX * positionX);
      int destinationTop = -travelY + (int)Math.Round(travelY * positionY);
      properties.rcDestination = new RECT {
        Left = destinationLeft,
        Top = destinationTop,
        Right = destinationLeft + destinationWidth,
        Bottom = destinationTop + destinationHeight
      };
      properties.opacity = (byte)visualOpacity;
      properties.fVisible = true;
      properties.fSourceClientAreaOnly = true;
      int result = DwmUpdateThumbnailProperties(thumbnail, ref properties);
      if (result != 0) {
        throw new InvalidOperationException("DwmUpdateThumbnailProperties failed: 0x" + result.ToString("X8"));
      }
    }
    consecutiveFollowFailures = 0;
  }

  public static void Run(string sourceId, string expectedTitle, string expectedExecutable,
      string hostWindowId, string hostExecutable, string rawCornerRadius, string rawDesktopIconLayering,
      string rawOpacity, string rawPositionX, string rawPositionY, string rawScale) {
    SetProcessDpiAwarenessContext(new IntPtr(-4));
    IntPtr source = ParseSourceHandle(sourceId);
    IntPtr host = ParseRawHandle(hostWindowId);
    ValidateProcess(source, expectedExecutable);
    ValidateProcess(host, hostExecutable);
    if (!String.Equals(WindowTitle(source), expectedTitle ?? "", StringComparison.Ordinal)) {
      throw new InvalidOperationException("DWM source title mismatch");
    }
    int cornerRadius;
    if (!Int32.TryParse(rawCornerRadius ?? "", out cornerRadius)) cornerRadius = 0;
    bool enableDesktopIconLayering = String.Equals(rawDesktopIconLayering, "1", StringComparison.Ordinal);
    int initialOpacity, initialPositionX, initialPositionY, initialScale;
    if (!Int32.TryParse(rawOpacity ?? "", out initialOpacity)) initialOpacity = 255;
    if (!Int32.TryParse(rawPositionX ?? "", out initialPositionX)) initialPositionX = 0;
    if (!Int32.TryParse(rawPositionY ?? "", out initialPositionY)) initialPositionY = 0;
    if (!Int32.TryParse(rawScale ?? "", out initialScale)) initialScale = 1080000;
    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);
    Application.Run(new MineradioWeDwmSurfaceHost(host, source, expectedTitle, cornerRadius,
      enableDesktopIconLayering, initialOpacity, initialPositionX, initialPositionY, initialScale));
  }
}
'@
Add-Type -ReferencedAssemblies @('System.Windows.Forms', 'System.Drawing') -TypeDefinition $source -Language CSharp
try {
  [MineradioWeDwmSurfaceHost]::Run($sourceId, $expectedTitle, $expectedExecutable, $hostWindowId, $hostExecutable, $hostCornerRadius, $desktopIconLayering, $visualOpacity, $visualPositionX, $visualPositionY, $visualScale)
} catch {
  [Console]::Error.WriteLine($_.Exception.ToString())
  if ($_.Exception.InnerException) { [Console]::Error.WriteLine($_.Exception.InnerException.ToString()) }
  [Console]::Error.Flush()
  exit 1
}
`.trim();
  return source;
}

function quoteWindowsArgument(value) {
  const text = String(value == null ? '' : value);
  if (text && !/[\s"]/.test(text)) return text;
  return `"${text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}

function wallpaperRawPropertiesIndex(args) {
  if (!Array.isArray(args)) return -1;
  const optionIndex = args.findIndex((value) => String(value || '').toLowerCase() === '-properties');
  const rawIndex = optionIndex >= 0 ? optionIndex + 1 : -1;
  if (rawIndex <= 0 || rawIndex >= args.length) return -1;
  const raw = String(args[rawIndex] || '');
  if (!raw.startsWith('RAW~(') || !raw.endsWith(')~END') || /[\u0000\r\n]/.test(raw)) return -1;
  try {
    const parsed = JSON.parse(raw.slice(5, -5));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return -1;
  } catch (_) {
    return -1;
  }
  return rawIndex;
}

function verbatimWallpaperControlArguments(args) {
  const rawIndex = wallpaperRawPropertiesIndex(args);
  if (rawIndex < 0) return null;
  return args.map((value, index) => index === rawIndex
    ? String(value)
    : quoteWindowsArgument(value));
}

function wallpaperControlCommandLine(executable, args) {
  const verbatimArgs = verbatimWallpaperControlArguments(args);
  const argumentLine = (verbatimArgs || (Array.isArray(args) ? args : []).map(quoteWindowsArgument)).join(' ');
  return `${quoteWindowsArgument(executable)}${argumentLine ? ` ${argumentLine}` : ''}`;
}

function defaultEngineProcessProbe(powerShellExecutable, nativeTempPath, expectedExecutable) {
  return new Promise((resolve) => {
    childProcess.execFile(powerShellExecutable || 'powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      engineProcessProbeScript(),
    ], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 3500,
      maxBuffer: 16 * 1024,
      shell: false,
      env: {
        ...process.env,
        TEMP: nativeTempPath,
        TMP: nativeTempPath,
        MINERADIO_NATIVE_TEMP_DIR: nativeTempPath,
        MINERADIO_WE_ENGINE_TARGET: String(expectedExecutable || ''),
      },
    }, (error, stdout) => {
      if (error) {
        resolve({ ok: false, running: false, matching: false, executable: '', matchingPids: [] });
        return;
      }
      const jsonLine = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).reverse().find((line) => /^\{.*\}$/.test(line));
      try {
        const result = jsonLine ? JSON.parse(jsonLine) : null;
        if (!result
          || typeof result !== 'object'
          || typeof result.running !== 'boolean'
          || typeof result.matching !== 'boolean') {
          throw new Error('Wallpaper Engine process probe returned invalid data');
        }
        resolve({
          ok: true,
          running: result && result.running === true,
          matching: result && result.matching === true,
          executable: String(result && result.executable || ''),
          matchingPids: Array.isArray(result && result.matchingPids)
            ? result.matchingPids.map((value) => Number(value) || 0).filter(Boolean)
            : [],
        });
      } catch (_) {
        resolve({ ok: false, running: false, matching: false, executable: '', matchingPids: [] });
      }
    });
  });
}

function defaultDesktopCapturer() {
  try {
    return require('electron').desktopCapturer;
  } catch (_) {
    return null;
  }
}

class WallpaperEngineRuntime {
  constructor(options = {}) {
    this.library = options.library || null;
    this.desktopCapturer = options.desktopCapturer || defaultDesktopCapturer();
    this.discoverSteamLibraries = options.discoverSteamLibraries || defaultDiscoverSteamLibraries;
    this.execFile = options.execFile || childProcess.execFile;
    this.controlExecFile = options.controlExecFile || childProcess.execFile;
    this.spawn = options.spawn || childProcess.spawn;
    this.platform = options.platform || process.platform;
    this.arch = options.arch || process.arch;
    this.sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.nativeSleep = options.nativeSleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = options.now || Date.now;
    this.wallNow = options.wallNow || Date.now;
    this.powerShellExecutable = options.powerShellExecutable || 'powershell.exe';
    this.nativeTempPath = path.resolve(String(
      options.nativeTempPath
      || process.env.MINERADIO_NATIVE_TEMP_DIR
      || path.join(process.env.LOCALAPPDATA || process.env.APPDATA || process.cwd(), 'Mineradio', 'native-helper-temp')
    ));
    fs.mkdirSync(this.nativeTempPath, { recursive: true });
    this.nativeExecFile = options.nativeExecFile || childProcess.execFile;
    this.pointerRelaySpawn = options.pointerRelaySpawn || childProcess.spawn;
    this.dwmSurfaceSpawn = options.dwmSurfaceSpawn || childProcess.spawn;
    this.dwmSurfaceStartTimeoutMs = clampInteger(
      options.dwmSurfaceStartTimeoutMs,
      10,
      30000,
      DWM_SURFACE_START_TIMEOUT_MS
    );
    this.pointerRelayStartTimeoutMs = clampInteger(
      options.pointerRelayStartTimeoutMs,
      10,
      30000,
      POINTER_RELAY_START_TIMEOUT_MS
    );
    this.pointerRelayRetryDelaysMs = Array.isArray(options.pointerRelayRetryDelaysMs)
      ? options.pointerRelayRetryDelaysMs
        .map((value) => clampInteger(value, 1, 30000, 0))
        .filter((value) => value > 0)
        .slice(0, POINTER_RELAY_RETRY_DELAYS_MS.length)
      : [...POINTER_RELAY_RETRY_DELAYS_MS];
    if (!this.pointerRelayRetryDelaysMs.length) {
      this.pointerRelayRetryDelaysMs = [...POINTER_RELAY_RETRY_DELAYS_MS];
    }
    this.windowController = typeof options.windowController === 'function'
      ? options.windowController
      : ((action, details) => this._nativeWindowControl(action, details));
    this.engineProcessProbe = options.engineProcessProbe
      || ((expectedExecutable) => defaultEngineProcessProbe(
        this.powerShellExecutable,
        this.nativeTempPath,
        expectedExecutable
      ));
    this.engineReadyProbe = typeof options.engineReadyProbe === 'function'
      ? options.engineReadyProbe
      : ((executable) => this._runTransientControl(executable, [
        '-control',
        'getWallpaper',
        '-monitor',
        '0',
      ]));
    this.useDesktopShellBroker = this.platform === 'win32' && options.useDesktopShellBroker !== false;
    this.hostElevationProbe = typeof options.hostElevationProbe === 'function'
      ? options.hostElevationProbe
      : (async () => null);
    this.hostElevationCache = null;
    this.signatureCache = new Map();
    this.executableCache = null;
    this.executableDiscoveryPromise = null;
    this.engineBootstrapPromise = null;
    this.engineBootstrapExecutable = '';
    this.engineReadyExecutable = '';
    this.engineReadyAt = 0;
    this.engineReadyPidsKey = '';
    this.active = null;
    this.pending = null;
    this.generation = 0;
    this.disposed = false;
  }

  _publicSession(session) {
    if (!session) return null;
    return {
      ok: true,
      active: true,
      id: session.id,
      sessionId: session.sessionId,
      sourceId: session.sourceId,
      width: session.width,
      height: session.height,
      fps: session.fps,
      embeddedBackend: true,
      captureMode: 'dwm-thumbnail',
      sourceWindowEmbedded: !!(session.windowEmbedding && session.windowEmbedding.embedded),
      sourceWindowAligned: !!(session.windowEmbedding && session.windowEmbedding.aligned),
      sourceWindowRounded: !!(session.windowEmbedding && session.windowEmbedding.rounded),
      sourceWindowParked: !!(session.windowParking && session.windowParking.parked),
      sourceWindowVisibleWidth: Math.max(0, Number(session.windowEmbedding && session.windowEmbedding.visibleWidth) || 0),
      sourceWindowVisibleHeight: Math.max(0, Number(session.windowEmbedding && session.windowEmbedding.visibleHeight) || 0),
      sourceWindowRect: session.windowEmbedding ? {
        left: Number(session.windowEmbedding.left) || 0,
        top: Number(session.windowEmbedding.top) || 0,
        right: Number(session.windowEmbedding.right) || 0,
        bottom: Number(session.windowEmbedding.bottom) || 0,
      } : null,
      hostWindowRect: session.windowEmbedding ? {
        left: Number(session.windowEmbedding.hostLeft) || 0,
        top: Number(session.windowEmbedding.hostTop) || 0,
        right: Number(session.windowEmbedding.hostRight) || 0,
        bottom: Number(session.windowEmbedding.hostBottom) || 0,
      } : null,
      sourceWindowParkingRect: session.windowParking ? {
        left: Number(session.windowParking.left) || 0,
        top: Number(session.windowParking.top) || 0,
        right: Number(session.windowParking.right) || 0,
        bottom: Number(session.windowParking.bottom) || 0,
        visibleWidth: Math.max(0, Number(session.windowParking.visibleWidth) || 0),
        visibleHeight: Math.max(0, Number(session.windowParking.visibleHeight) || 0),
      } : null,
      dwmSurfaceActive: session.dwmSurfaceActive === true,
      dwmSurfaceReady: session.dwmSurfaceReady === true,
      dwmSurfaceHelperPid: Math.max(0, Number(session.dwmSurfaceHelperPid) || 0),
      dwmSurfaceWindowId: Math.max(0, Number(session.dwmSurfaceWindowId) || 0),
      dwmDesktopIconLayering: session.dwmDesktopIconLayering === true,
      dwmVisualOpacity: Math.max(0.15, Math.min(1, Number(session.dwmVisualOpacity) || 1)),
      dwmVisualPositionX: Math.max(-0.5, Math.min(0.5, Number(session.dwmVisualPositionX) || 0)),
      dwmVisualPositionY: Math.max(-0.5, Math.min(0.5, Number(session.dwmVisualPositionY) || 0)),
      dwmVisualScale: Math.max(1, Math.min(1.6, Number(session.dwmVisualScale) || 1.08)),
      dwmGlassSurfaceReady: session.dwmGlassSurfaceReady === true,
      dwmGlassSurfaceActive: session.dwmGlassSurfaceActive === true,
      dwmGlassSurfaceWindowId: Math.max(0, Number(session.dwmGlassSurfaceWindowId) || 0),
      // Compatibility fields: these now describe the DOM sampler and alias the
      // one base DWM HWND. They no longer represent a second native window.
      dwmGlassSurfaceSampleMode: 'single-dwm-svg-sampler',
      dwmGlassSurfaceGeometry: session.dwmGlassSurfaceGeometry ? { ...session.dwmGlassSurfaceGeometry } : null,
      parallaxPointerRelayActive: session.parallaxPointerRelayActive === true,
      parallaxPointerRelayReady: session.parallaxPointerRelayReady === true,
      parallaxPointerRelayHelperPid: Math.max(0, Number(session.parallaxPointerRelayHelperPid) || 0),
      parallaxPointerRelayTargetWindowId: Math.max(0, Number(session.parallaxPointerRelayTargetWindowId) || 0),
      parallaxPointerRelayTargetClass: String(session.parallaxPointerRelayTargetClass || ''),
      parallaxPointerRelayTargetTitle: String(session.parallaxPointerRelayTargetTitle || ''),
      parallaxPointerRelayQueued: Math.max(0, Number(session.parallaxPointerRelayQueued) || 0),
      parallaxPointerRelayCoalesced: Math.max(0, Number(session.parallaxPointerRelayCoalesced) || 0),
      parallaxPointerRelayPosted: Math.max(0, Number(session.parallaxPointerRelayPosted) || 0),
      parallaxPointerRelayLatestX: typeof session.parallaxPointerRelayLatestX === 'number'
        && Number.isFinite(session.parallaxPointerRelayLatestX)
        ? Math.max(0, Math.min(65535, Math.round(session.parallaxPointerRelayLatestX))) : null,
      parallaxPointerRelayLatestY: typeof session.parallaxPointerRelayLatestY === 'number'
        && Number.isFinite(session.parallaxPointerRelayLatestY)
        ? Math.max(0, Math.min(65535, Math.round(session.parallaxPointerRelayLatestY))) : null,
      audioMuted: session.audioMuted === true,
      audioPropertySuppressed: session.audioPropertySuppressed === true,
      audioMuteCommandCount: Math.max(0, Number(session.audioMuteCommandCount) || 0),
      silentStageApplied: Math.max(0, Number(session.stagedAudioPropertyCount) || 0) > 0,
      stagedAudioPropertyCount: Math.max(0, Number(session.stagedAudioPropertyCount) || 0),
      sceneAudioPatched: Math.max(0, Number(session.patchedSceneAudioObjectCount) || 0) > 0,
      patchedSceneAudioObjectCount: Math.max(0, Number(session.patchedSceneAudioObjectCount) || 0),
    };
  }

  getStatus() {
    const current = this.active;
    return current ? this._publicSession(current) : {
      ok: true,
      active: false,
      id: '',
      sessionId: '',
      sourceId: '',
    };
  }

  async _execFileText(file, args, options = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (error, stdout) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve(String(stdout || ''));
      };
      try {
        this.execFile(file, args, options, done);
      } catch (error) {
        done(error);
      }
    });
  }

  _powerShellEnv(extra = {}) {
    fs.mkdirSync(this.nativeTempPath, { recursive: true });
    return {
      ...process.env,
      TEMP: this.nativeTempPath,
      TMP: this.nativeTempPath,
      MINERADIO_NATIVE_TEMP_DIR: this.nativeTempPath,
      ...extra,
    };
  }

  _stopSessionDwmSurface(session) {
    if (!session) return false;
    if (session.dwmSurfaceRetryTimer) clearTimeout(session.dwmSurfaceRetryTimer);
    session.dwmSurfaceRetryTimer = null;
    const child = session.dwmSurfaceProcess;
    const stdin = child && child.stdin;
    session.dwmSurfaceProcess = null;
    session.dwmSurfaceReady = false;
    session.dwmSurfaceActive = false;
    session.dwmSurfaceHelperPid = 0;
    session.dwmSurfaceWindowId = 0;
    session.dwmDesktopIconLayering = false;
    session.dwmDesktopIconLayeringAckToken = (Number(session.dwmDesktopIconLayeringAckToken) || 0) + 1;
    session.dwmGlassSurfaceReady = false;
    session.dwmGlassSurfaceActive = false;
    session.dwmGlassSurfaceWindowId = 0;
    session.dwmGlassSurfaceGeometry = null;
    session.dwmGlassSurfaceGeometryKey = '';
    if (!child) return false;
    let trackedStop = null;
    const pendingStop = new Promise((resolve) => {
      let settled = false;
      let killTimer = null;
      let settleTimer = null;
      const finish = (exited) => {
        if (settled) return;
        settled = true;
        if (killTimer) clearTimeout(killTimer);
        if (settleTimer) clearTimeout(settleTimer);
        resolve(exited === true);
      };
      if (child.exitCode != null || child.signalCode != null) {
        finish(true);
        return;
      }
      if (typeof child.once === 'function') child.once('exit', () => finish(true));
      try {
        if (stdin && stdin.destroyed !== true && stdin.writableEnded !== true) {
          stdin.write('Q\n', 'ascii');
          stdin.end();
        }
      } catch (_) { }
      killTimer = setTimeout(() => {
        if (settled || typeof child.kill !== 'function') return;
        try { child.kill(); } catch (_) { }
      }, DWM_SURFACE_STOP_TIMEOUT_MS);
      settleTimer = setTimeout(() => finish(false), DWM_SURFACE_STOP_TIMEOUT_MS + 500);
      if (killTimer && typeof killTimer.unref === 'function') killTimer.unref();
      if (settleTimer && typeof settleTimer.unref === 'function') settleTimer.unref();
    });
    trackedStop = pendingStop.finally(() => {
      if (session.dwmSurfaceStopPromise === trackedStop) session.dwmSurfaceStopPromise = null;
    });
    session.dwmSurfaceStopPromise = trackedStop;
    return true;
  }

  async _waitForSessionDwmSurfaceStop(session) {
    const pending = session && session.dwmSurfaceStopPromise;
    if (!pending || typeof pending.then !== 'function') return true;
    return pending;
  }

  _scheduleSessionDwmSurfaceRetry(session) {
    if (!session || this.platform !== 'win32' || this.disposed || this.active !== session
      || session.stopping === true || !session.windowEmbedding || session.windowEmbedding.aligned !== true
      || session.dwmSurfaceRetryTimer || session.dwmSurfaceReady === true) return false;
    session.dwmSurfaceRetryTimer = setTimeout(() => {
      session.dwmSurfaceRetryTimer = null;
      if (this.disposed || this.active !== session || session.stopping === true) return;
      this._startSessionDwmSurface(session).then((ready) => {
        if (!ready) this._scheduleSessionDwmSurfaceRetry(session);
      }).catch(() => this._scheduleSessionDwmSurfaceRetry(session));
    }, DWM_SURFACE_RETRY_DELAY_MS);
    if (session.dwmSurfaceRetryTimer && typeof session.dwmSurfaceRetryTimer.unref === 'function') {
      session.dwmSurfaceRetryTimer.unref();
    }
    return true;
  }

  async _startSessionDwmSurface(session) {
    if (!session || this.platform !== 'win32' || this.disposed || this.active !== session
      || session.stopping === true || !session.windowEmbedding || session.windowEmbedding.aligned !== true) return false;
    if (session.dwmSurfaceReady === true && session.dwmSurfaceProcess) {
      return true;
    }
    if (session.dwmSurfaceStartPromise) return session.dwmSurfaceStartPromise;

    const sourceId = String(session.windowSourceId || session.sourceId || '');
    const hostWindowId = String(session.dwmSurfaceHostWindowId || '');
    const hostExecutable = String(session.dwmSurfaceHostExecutable || '');
    if (!/^window:\d+:\d+$/.test(sourceId) || !/^\d+$/.test(hostWindowId)
      || !session.locationTitle || !session.executable || !hostExecutable) return false;

    const operation = (async () => {
      let child;
      try {
        const helperSource = nativeDwmThumbnailSurfaceScript();
        const helperDigest = crypto.createHash('sha256').update(helperSource).digest('hex').slice(0, 20);
        const helperFile = path.join(this.nativeTempPath, `wallpaper-engine-dwm-surface-${helperDigest}.ps1`);
        if (!fs.existsSync(helperFile)) {
          fs.writeFileSync(helperFile, `\uFEFF${helperSource}`, 'utf8');
        }
        child = this.dwmSurfaceSpawn(this.powerShellExecutable, [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-STA',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          helperFile,
        ], {
          windowsHide: true,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: this._powerShellEnv({
            MINERADIO_WE_DWM_SOURCE_ID: sourceId,
            MINERADIO_WE_DWM_SOURCE_TITLE: session.locationTitle,
            MINERADIO_WE_DWM_SOURCE_EXECUTABLE: session.executable,
            MINERADIO_WE_DWM_HOST_WINDOW_ID: hostWindowId,
            MINERADIO_WE_DWM_HOST_EXECUTABLE: hostExecutable,
            MINERADIO_WE_DWM_HOST_CORNER_RADIUS: String(session.dwmSurfaceHostCornerRadius || 0),
            MINERADIO_WE_DWM_DESKTOP_ICON_LAYERING: session.dwmSurfaceDesktopIconLayering === true ? '1' : '0',
            MINERADIO_WE_DWM_VISUAL_OPACITY: String(Math.round(Math.max(0.15, Math.min(1, Number(session.dwmVisualOpacity) || 1)) * 255)),
            MINERADIO_WE_DWM_VISUAL_POSITION_X: String(Math.round(Math.max(-0.5, Math.min(0.5, Number(session.dwmVisualPositionX) || 0)) * 1000000)),
            MINERADIO_WE_DWM_VISUAL_POSITION_Y: String(Math.round(Math.max(-0.5, Math.min(0.5, Number(session.dwmVisualPositionY) || 0)) * 1000000)),
            MINERADIO_WE_DWM_VISUAL_SCALE: String(Math.round(Math.max(1, Math.min(1.6, Number(session.dwmVisualScale) || 1.08)) * 1000000)),
            MINERADIO_WE_DWM_SESSION_ID: session.sessionId,
          }),
        });
      } catch (_) {
        return false;
      }
      if (!child || !child.stdin || !child.stdout || typeof child.stdout.on !== 'function') {
        try { if (child && typeof child.kill === 'function') child.kill(); } catch (_) { }
        return false;
      }

      session.dwmSurfaceProcess = child;
      session.dwmSurfaceHelperPid = Math.max(0, Number(child.pid) || 0);
      session.dwmSurfaceReady = false;
      session.dwmSurfaceActive = false;
      session.dwmGlassSurfaceReady = false;
      session.dwmGlassSurfaceActive = false;
      session.dwmGlassSurfaceWindowId = 0;
      let stdout = '';
      let stderr = '';
      let settled = false;
      const ready = await new Promise((resolve) => {
        let timeout = null;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          if (timeout) clearTimeout(timeout);
          resolve(value === true);
        };
        timeout = setTimeout(() => finish(false), this.dwmSurfaceStartTimeoutMs);
        if (child.stdout && typeof child.stdout.setEncoding === 'function') child.stdout.setEncoding('utf8');
        if (child.stderr && typeof child.stderr.setEncoding === 'function') child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
          stdout = `${stdout}${String(chunk || '')}`.slice(-8192);
          const lines = stdout.split(/\r?\n/);
          stdout = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!/^\{.*\}$/.test(trimmed)) continue;
            try {
              const result = JSON.parse(trimmed);
              if (result && result.ok === true && result.dwm === true
                && result.active === true && session.dwmSurfaceProcess === child
                && Number(result.surfaceWindowHandle) === Number(session.dwmSurfaceWindowId)) {
                session.dwmSurfaceActive = true;
              }
              if (result && result.ok === true && result.iconLayering === true
                && typeof result.enabled === 'boolean' && session.dwmSurfaceProcess === child) {
                session.dwmDesktopIconLayering = result.enabled === true;
                session.dwmDesktopIconLayeringAckToken = (Number(session.dwmDesktopIconLayeringAckToken) || 0) + 1;
              }
              if (result && result.ok === true && result.ready === true
                && String(result.hostWindowHandle || '') === hostWindowId
                && Number(result.sourceWindowHandle) > 0
                && Number(result.surfaceWindowHandle) > 0) {
                session.dwmSurfaceWindowId = Math.max(0, Number(result.surfaceWindowHandle) || 0);
                session.dwmGlassSurfaceWindowId = session.dwmSurfaceWindowId;
                session.dwmGlassSurfaceReady = session.dwmGlassSurfaceWindowId > 0;
                session.dwmDesktopIconLayering = result.desktopIconLayering === true;
                finish(true);
                return;
              }
            } catch (_) { }
          }
        });
        if (child.stderr && typeof child.stderr.on === 'function') {
          child.stderr.on('data', (chunk) => {
            if (stderr.length < 4096) stderr = `${stderr}${String(chunk || '')}`.slice(0, 4096);
          });
        }
        if (typeof child.once === 'function') {
          child.once('error', () => finish(false));
          child.once('exit', () => finish(false));
        }
      });

      if (!ready || this.active !== session || this.disposed || session.stopping === true
        || session.dwmSurfaceProcess !== child) {
        if (!ready && stderr.trim()) {
          console.warn(`[Wallpaper Engine] DWM surface unavailable: ${stderr.trim().replace(/\s+/g, ' ').slice(0, 400)}`);
        }
        if (session.dwmSurfaceProcess === child) this._stopSessionDwmSurface(session);
        return false;
      }

      session.dwmSurfaceReady = true;
      // The source window itself stays directly behind Electron until the
      // renderer has opened a cursor-free capture of this plain helper HWND.
      // Only then does activateDwmSurface() register the DWM thumbnail.
      session.dwmSurfaceActive = false;
      session.windowParking = null;
      if (typeof child.once === 'function') {
        child.once('exit', () => {
          if (session.dwmSurfaceProcess !== child) return;
          session.dwmSurfaceProcess = null;
          session.dwmSurfaceReady = false;
          session.dwmSurfaceActive = false;
          session.dwmSurfaceHelperPid = 0;
          session.dwmSurfaceWindowId = 0;
          session.dwmDesktopIconLayering = false;
          session.dwmDesktopIconLayeringAckToken = (Number(session.dwmDesktopIconLayeringAckToken) || 0) + 1;
          session.dwmGlassSurfaceReady = false;
          session.dwmGlassSurfaceActive = false;
          session.dwmGlassSurfaceWindowId = 0;
          session.dwmGlassSurfaceGeometry = null;
          session.dwmGlassSurfaceGeometryKey = '';
          this._scheduleSessionDwmSurfaceRetry(session);
        });
      }
      return true;
    })();
    session.dwmSurfaceStartPromise = operation;
    try {
      return await operation;
    } finally {
      if (session.dwmSurfaceStartPromise === operation) session.dwmSurfaceStartPromise = null;
    }
  }

  updateGlassSurface(expectedSessionId = '', geometry = {}) {
    if (expectedSessionId && typeof expectedSessionId === 'object') {
      geometry = expectedSessionId;
      expectedSessionId = geometry.sessionId || '';
    }
    const session = this.active;
    expectedSessionId = String(expectedSessionId || '');
    if (!session || (expectedSessionId && session.sessionId !== expectedSessionId)) {
      return { ok: false, error: 'WALLPAPER_ENGINE_SESSION_MISMATCH' };
    }
    if (!session.dwmSurfaceReady || !session.dwmGlassSurfaceReady
      || Number(session.dwmSurfaceWindowId) <= 0
      || Number(session.dwmGlassSurfaceWindowId) !== Number(session.dwmSurfaceWindowId)) {
      return { ok: false, error: 'WALLPAPER_ENGINE_DWM_GLASS_SURFACE_UNAVAILABLE' };
    }

    const viewportWidth = Number(geometry && geometry.viewportWidth);
    const viewportHeight = Number(geometry && geometry.viewportHeight);
    const left = Number(geometry && geometry.left);
    const top = Number(geometry && geometry.top);
    const width = Number(geometry && geometry.width);
    const height = Number(geometry && geometry.height);
    const radius = Number(geometry && geometry.radius);
    if (![viewportWidth, viewportHeight, left, top, width, height, radius].every(Number.isFinite)
      || viewportWidth < 2 || viewportHeight < 2 || width < 0 || height < 0) {
      return { ok: false, error: 'WALLPAPER_ENGINE_DWM_GLASS_GEOMETRY_INVALID' };
    }
    const normalized = (value, extent, min, max) => Math.max(min, Math.min(max,
      Math.round((value / extent) * 1000000)));
    const xUnit = normalized(left, viewportWidth, -2000000, 3000000);
    const yUnit = normalized(top, viewportHeight, -2000000, 3000000);
    const widthUnit = normalized(width, viewportWidth, 0, 3000000);
    const heightUnit = normalized(height, viewportHeight, 0, 3000000);
    const radiusUnit = normalized(radius, viewportWidth, 0, 1000000);
    const active = geometry.active === true && width >= 2 && height >= 2;
    const key = [xUnit, yUnit, widthUnit, heightUnit, radiusUnit, active ? 1 : 0].join('|');
    if (key === session.dwmGlassSurfaceGeometryKey) {
      return { ok: true, updated: false, ...this._publicSession(session) };
    }
    // Geometry is consumed only by the clipped renderer sampler. The native
    // helper intentionally receives no glass command and owns no second layer.
    session.dwmGlassSurfaceGeometryKey = key;
    session.dwmGlassSurfaceGeometry = {
      active,
      left,
      top,
      width,
      height,
      radius,
      viewportWidth,
      viewportHeight,
    };
    session.dwmGlassSurfaceActive = active;
    return { ok: true, updated: true, ...this._publicSession(session) };
  }

  async activateDwmSurface(expectedSessionId = '') {
    const session = this.active;
    expectedSessionId = String(expectedSessionId || '');
    if (!session || (expectedSessionId && session.sessionId !== expectedSessionId)) {
      throw runtimeError('WALLPAPER_ENGINE_SESSION_MISMATCH');
    }
    if (session.dwmSurfaceReady !== true || !session.dwmSurfaceProcess
      || !session.dwmSurfaceProcess.stdin) {
      throw runtimeError('WALLPAPER_ENGINE_DWM_SURFACE_FAILED');
    }
    if (session.dwmSurfaceActive === true) return this._publicSession(session);
    const child = session.dwmSurfaceProcess;
    const stdin = child.stdin;
    if (stdin.destroyed === true || stdin.writableEnded === true) {
      throw runtimeError('WALLPAPER_ENGINE_DWM_SURFACE_FAILED');
    }
    try { stdin.write('D\n', 'ascii'); }
    catch (_) { throw runtimeError('WALLPAPER_ENGINE_DWM_SURFACE_FAILED'); }
    const deadline = this.now() + 2200;
    while (this.now() <= deadline) {
      if (this.disposed || this.active !== session || session.stopping === true
        || session.dwmSurfaceProcess !== child) {
        throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
      }
      if (session.dwmSurfaceActive === true) return this._publicSession(session);
      await this.sleep(20);
    }
    throw runtimeError('WALLPAPER_ENGINE_DWM_SURFACE_FAILED');
  }

  async updateDwmDesktopIconLayering(expectedSessionId = '', enabled = false) {
    const session = this.active;
    expectedSessionId = String(expectedSessionId || '');
    enabled = enabled === true;
    if (!session || (expectedSessionId && session.sessionId !== expectedSessionId)) return false;
    // Latch the latest desired order even while the helper is between retries.
    // _startSessionDwmSurface() replays this field into the next helper env.
    session.dwmSurfaceDesktopIconLayering = enabled;
    if (session.dwmSurfaceReady !== true || !session.dwmSurfaceProcess
      || !session.dwmSurfaceProcess.stdin) return false;
    if (session.dwmDesktopIconLayering === enabled) {
      // A helper ACK may arrive just after a caller's timeout rollback. Keep
      // the desired restart state aligned with the now-observed helper state.
      session.dwmSurfaceDesktopIconLayering = enabled;
      return true;
    }

    const child = session.dwmSurfaceProcess;
    const stdin = child.stdin;
    if (stdin.destroyed === true || stdin.writableEnded === true) return false;
    const ackToken = Number(session.dwmDesktopIconLayeringAckToken) || 0;
    try { stdin.write(`I|${enabled ? 1 : 0}\n`, 'ascii'); }
    catch (_) { return false; }

    const deadline = this.now() + 2200;
    while (this.now() <= deadline) {
      if (this.disposed || this.active !== session || session.stopping === true
        || session.dwmSurfaceProcess !== child) return false;
      if ((Number(session.dwmDesktopIconLayeringAckToken) || 0) > ackToken
        && session.dwmDesktopIconLayering === enabled) return true;
      await this.sleep(20);
    }
    if (this.active === session && session.dwmSurfaceProcess === child) {
      if (enabled === false) {
        // Leaving Explorer coexistence must never keep an unresponsive helper
        // below the desktop icon host. Retire that single DWM surface and let
        // the normal retry path recreate it with ordinary top-level ordering.
        session.dwmSurfaceDesktopIconLayering = false;
        this._stopSessionDwmSurface(session);
        this._scheduleSessionDwmSurfaceRetry(session);
      }
    }
    return false;
  }

  updateDwmVisualSettings(expectedSessionId = '', settings = {}) {
    const session = this.active;
    expectedSessionId = String(expectedSessionId || '');
    if (!session || (expectedSessionId && session.sessionId !== expectedSessionId)) return false;
    const opacity = Math.max(0.15, Math.min(1, Number(settings.opacity) || 1));
    const positionX = Math.max(-0.5, Math.min(0.5, Number(settings.positionX) || 0));
    const positionY = Math.max(-0.5, Math.min(0.5, Number(settings.positionY) || 0));
    const scale = Math.max(1, Math.min(1.6, Number(settings.scale) || 1.08));
    session.dwmVisualOpacity = opacity;
    session.dwmVisualPositionX = positionX;
    session.dwmVisualPositionY = positionY;
    session.dwmVisualScale = scale;
    const child = session.dwmSurfaceProcess;
    const stdin = child && child.stdin;
    if (session.dwmSurfaceReady !== true || !stdin || stdin.destroyed === true || stdin.writableEnded === true) return false;
    try {
      stdin.write(`V|${Math.round(opacity * 255)}|${Math.round(positionX * 1000000)}|${Math.round(positionY * 1000000)}|${Math.round(scale * 1000000)}\n`, 'ascii');
      return true;
    } catch (_) {
      return false;
    }
  }

  async getDwmGlassCaptureSource(expectedSessionId = '', options = {}) {
    if (!this.desktopCapturer || typeof this.desktopCapturer.getSources !== 'function') {
      throw runtimeError('WALLPAPER_ENGINE_CAPTURE_UNAVAILABLE');
    }
    const session = this.active;
    expectedSessionId = String(expectedSessionId || '');
    if (!session || (expectedSessionId && session.sessionId !== expectedSessionId)) {
      throw runtimeError('WALLPAPER_ENGINE_SESSION_MISMATCH');
    }
    const expectedWindowId = String(Math.max(0, Number(session.dwmSurfaceWindowId) || 0));
    if (session.dwmSurfaceReady !== true || session.dwmGlassSurfaceReady !== true
      || session.dwmGlassSurfaceActive !== true || !/^\d+$/.test(expectedWindowId)
      || expectedWindowId === '0'
      || Number(session.dwmGlassSurfaceWindowId) !== Number(session.dwmSurfaceWindowId)) {
      throw runtimeError('WALLPAPER_ENGINE_DWM_GLASS_SURFACE_UNAVAILABLE');
    }
    if (options.allowDirectSourceId === true) {
      return {
        id: `window:${expectedWindowId}:0`,
        name: 'Mineradio WE DWM Surface',
        directWindowSource: true,
      };
    }
    const timeoutMs = Math.max(200, Math.min(5000, Number(options.timeoutMs) || 1800));
    const pollMs = Math.max(20, Math.min(250, Number(options.pollIntervalMs) || 60));
    const deadline = this.now() + timeoutMs;
    while (this.now() <= deadline) {
      if (this.disposed || this.active !== session || session.stopping === true
        || session.dwmGlassSurfaceReady !== true
        || String(Math.max(0, Number(session.dwmGlassSurfaceWindowId) || 0)) !== expectedWindowId) {
        throw runtimeError('WALLPAPER_ENGINE_REFRESH_SUPERSEDED');
      }
      let sources = [];
      try {
        sources = await this.desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 0, height: 0 },
          fetchWindowIcons: false,
        });
      } catch (_) { }
      if (!Array.isArray(sources)) sources = [];
      const matched = sources.find((source) => {
        const match = /^window:(\d+):\d+$/.exec(String(source && source.id || ''));
        return !!match && match[1] === expectedWindowId
          && String(source && source.name || '') === 'Mineradio WE DWM Surface';
      });
      if (matched) return matched;
      await this.sleep(pollMs);
    }
    throw runtimeError('WALLPAPER_ENGINE_DWM_GLASS_CAPTURE_SOURCE_TIMEOUT');
  }

  _sessionPointerRelayCanPost(session) {
    return !!(session
      && this.platform === 'win32'
      && !this.disposed
      && this.active === session
      && session.stopping !== true
      && session.windowParking
      && session.windowParking.parked === true
      && session.parallaxPointerRelayReady === true
      && session.parallaxPointerRelayActive === true
      && session.parallaxPointerRelayProcess
      && session.parallaxPointerRelayProcess.stdin
      && session.parallaxPointerRelayProcess.stdin.destroyed !== true);
  }

  _clearSessionPointerRelayTimer(session) {
    if (!session) return;
    if (session.parallaxPointerRelayTimer) clearTimeout(session.parallaxPointerRelayTimer);
    session.parallaxPointerRelayTimer = null;
    session.parallaxPointerRelayPending = false;
  }

  _clearSessionPointerRelayRetries(session, ready = false) {
    if (!session || !session.parallaxPointerRelayRetryTimers) return;
    for (const timer of session.parallaxPointerRelayRetryTimers) clearTimeout(timer);
    session.parallaxPointerRelayRetryTimers.clear();
    const resolve = session.parallaxPointerRelayRetryResolve;
    if (typeof resolve === 'function') {
      resolve(ready === true);
      return;
    }
    session.parallaxPointerRelayRetryResolve = null;
    session.parallaxPointerRelayRetryPromise = null;
  }

  _scheduleSessionPointerRelayRetries(session) {
    if (!session || this.platform !== 'win32' || this.disposed || this.active !== session
      || session.stopping === true || !session.windowParking || session.windowParking.parked !== true
      || !session.parallaxPointerRelayRetryTimers) return Promise.resolve(false);
    if (session.parallaxPointerRelayReady === true && session.parallaxPointerRelayProcess) {
      return Promise.resolve(true);
    }
    if (session.parallaxPointerRelayRetryPromise) return session.parallaxPointerRelayRetryPromise;

    let settle = null;
    const operation = new Promise((resolve) => { settle = resolve; });
    session.parallaxPointerRelayRetryPromise = operation;
    session.parallaxPointerRelayRetryResolve = (ready) => {
      if (session.parallaxPointerRelayRetryPromise !== operation) return;
      for (const timer of session.parallaxPointerRelayRetryTimers) clearTimeout(timer);
      session.parallaxPointerRelayRetryTimers.clear();
      session.parallaxPointerRelayRetryResolve = null;
      session.parallaxPointerRelayRetryPromise = null;
      settle(ready === true);
    };

    const scheduleAttempt = (index) => {
      const finish = session.parallaxPointerRelayRetryResolve;
      if (typeof finish !== 'function') return;
      if (this.disposed || this.active !== session || session.stopping === true
        || !session.windowParking || session.windowParking.parked !== true) {
        finish(false);
        return;
      }
      if (session.parallaxPointerRelayReady === true && session.parallaxPointerRelayProcess) {
        finish(true);
        return;
      }
      if (index >= this.pointerRelayRetryDelaysMs.length) {
        finish(false);
        return;
      }
      const delay = this.pointerRelayRetryDelaysMs[index];
      const timer = setTimeout(() => {
        session.parallaxPointerRelayRetryTimers.delete(timer);
        if (this.disposed || this.active !== session || session.stopping === true
          || !session.windowParking || session.windowParking.parked !== true) {
          const cancel = session.parallaxPointerRelayRetryResolve;
          if (typeof cancel === 'function') cancel(false);
          return;
        }
        this._startSessionPointerRelay(session).then((ready) => {
          const finishAttempt = session.parallaxPointerRelayRetryResolve;
          if (typeof finishAttempt !== 'function') return;
          if (ready) finishAttempt(true);
          else scheduleAttempt(index + 1);
        }).catch(() => scheduleAttempt(index + 1));
      }, delay);
      session.parallaxPointerRelayRetryTimers.add(timer);
    };
    scheduleAttempt(0);
    return operation;
  }

  _stopSessionPointerRelay(session, options = {}) {
    if (!session) return false;
    if (options.clearRetries !== false) this._clearSessionPointerRelayRetries(session);
    this._clearSessionPointerRelayTimer(session);
    const child = session.parallaxPointerRelayProcess;
    const stdin = child && child.stdin;
    if (stdin && session.parallaxPointerRelayDrainListener
      && typeof stdin.removeListener === 'function') {
      stdin.removeListener('drain', session.parallaxPointerRelayDrainListener);
    }
    session.parallaxPointerRelayDrainListener = null;
    session.parallaxPointerRelayBackpressured = false;
    session.parallaxPointerRelayReady = false;
    session.parallaxPointerRelayActive = false;
    session.parallaxPointerRelayProcess = null;
    session.parallaxPointerRelayHelperPid = 0;
    session.parallaxPointerRelayTargetWindowId = 0;
    session.parallaxPointerRelayTargetClass = '';
    session.parallaxPointerRelayTargetTitle = '';
    session.parallaxPointerRelayLastPostedAt = 0;
    session.parallaxPointerRelayLatestX = null;
    session.parallaxPointerRelayLatestY = null;
    if (!child) return false;

    try {
      if (stdin && stdin.destroyed !== true && stdin.writableEnded !== true) {
        stdin.write('Q\n', 'ascii');
        stdin.end();
      }
    } catch (_) { }
    let exited = false;
    const markExited = () => { exited = true; };
    if (typeof child.once === 'function') child.once('exit', markExited);
    const killTimer = setTimeout(() => {
      if (exited || typeof child.kill !== 'function') return;
      try { child.kill(); } catch (_) { }
    }, POINTER_RELAY_STOP_TIMEOUT_MS);
    if (killTimer && typeof killTimer.unref === 'function') killTimer.unref();
    if (typeof child.once === 'function') child.once('exit', () => clearTimeout(killTimer));
    return true;
  }

  async _startSessionPointerRelay(session) {
    if (!session || this.platform !== 'win32' || this.disposed || this.active !== session
      || session.stopping === true || !session.windowParking || session.windowParking.parked !== true) return false;
    if (session.parallaxPointerRelayReady === true && session.parallaxPointerRelayProcess) {
      session.parallaxPointerRelayActive = true;
      this._clearSessionPointerRelayRetries(session, true);
      return true;
    }
    if (session.parallaxPointerRelayStartPromise) return session.parallaxPointerRelayStartPromise;

    const sourceId = String(session.windowSourceId || session.sourceId || '');
    const hostWindowId = String(session.parallaxPointerHostWindowId || '');
    const hostExecutable = String(session.parallaxPointerHostExecutable || '');
    if (!/^window:\d+:\d+$/.test(sourceId) || !/^\d+$/.test(hostWindowId)
      || !session.locationTitle || !session.executable || !hostExecutable) return false;

    const operation = (async () => {
      let child;
      try {
        child = this.pointerRelaySpawn(this.powerShellExecutable, [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          nativeParallaxPointerRelayScript(),
        ], {
          windowsHide: true,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: this._powerShellEnv({
            MINERADIO_WE_POINTER_SOURCE_ID: sourceId,
            MINERADIO_WE_POINTER_SOURCE_TITLE: session.locationTitle,
            MINERADIO_WE_POINTER_SOURCE_EXECUTABLE: session.executable,
            MINERADIO_WE_POINTER_HOST_WINDOW_ID: hostWindowId,
            MINERADIO_WE_POINTER_HOST_EXECUTABLE: hostExecutable,
            MINERADIO_WE_POINTER_SESSION_ID: session.sessionId,
          }),
        });
      } catch (_) {
        return false;
      }
      if (!child || !child.stdin || !child.stdout || typeof child.stdout.on !== 'function') {
        try { if (child && typeof child.kill === 'function') child.kill(); } catch (_) { }
        return false;
      }

      session.parallaxPointerRelayProcess = child;
      session.parallaxPointerRelayHelperPid = Math.max(0, Number(child.pid) || 0);
      session.parallaxPointerRelayReady = false;
      session.parallaxPointerRelayActive = false;
      let stdout = '';
      let stderr = '';
      let settled = false;
      const ready = await new Promise((resolve) => {
        let timeout = null;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          if (timeout) clearTimeout(timeout);
          resolve(value === true);
        };
        timeout = setTimeout(() => finish(false), this.pointerRelayStartTimeoutMs);
        if (child.stdout && typeof child.stdout.setEncoding === 'function') child.stdout.setEncoding('utf8');
        if (child.stderr && typeof child.stderr.setEncoding === 'function') child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
          if (settled) return;
          stdout = `${stdout}${String(chunk || '')}`.slice(-8192);
          const lines = stdout.split(/\r?\n/);
          stdout = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!/^\{.*\}$/.test(trimmed)) continue;
            try {
              const result = JSON.parse(trimmed);
              if (result && result.ok === true && result.ready === true
                && Number(result.sourceProcessId) > 0 && Number(result.hostProcessId) > 0
                && Number(result.sceneInputWindowHandle) > 0) {
                session.parallaxPointerRelayTargetWindowId = Math.max(0,
                  Number(result.sceneInputWindowHandle) || 0);
                session.parallaxPointerRelayTargetClass = 'WPEDesktopDX11Window';
                session.parallaxPointerRelayTargetTitle = 'WPELiveWallpaper';
                finish(true);
                return;
              }
            } catch (_) { }
          }
        });
        if (child.stderr && typeof child.stderr.on === 'function') {
          child.stderr.on('data', (chunk) => {
            if (stderr.length < 2048) stderr = `${stderr}${String(chunk || '')}`.slice(0, 2048);
          });
        }
        if (typeof child.once === 'function') {
          child.once('error', () => finish(false));
          child.once('exit', () => finish(false));
        }
      });

      if (!ready || this.active !== session || this.disposed || session.stopping === true
        || !session.windowParking || session.windowParking.parked !== true
        || session.parallaxPointerRelayProcess !== child) {
        if (!ready && stderr.trim()) {
          console.warn(`[Wallpaper Engine] native parallax pointer relay unavailable: ${stderr.trim().replace(/\s+/g, ' ').slice(0, 300)}`);
        }
        if (session.parallaxPointerRelayProcess === child) {
          this._stopSessionPointerRelay(session, { clearRetries: false });
        }
        return false;
      }

      session.parallaxPointerRelayReady = true;
      session.parallaxPointerRelayActive = true;
      this._clearSessionPointerRelayRetries(session, true);
      if (typeof child.once === 'function') {
        child.once('exit', () => {
          if (session.parallaxPointerRelayProcess !== child) return;
          this._clearSessionPointerRelayTimer(session);
          session.parallaxPointerRelayProcess = null;
          session.parallaxPointerRelayHelperPid = 0;
          session.parallaxPointerRelayReady = false;
          session.parallaxPointerRelayActive = false;
          session.parallaxPointerRelayBackpressured = false;
          session.parallaxPointerRelayDrainListener = null;
          this._scheduleSessionPointerRelayRetries(session).catch(() => false);
        });
      }
      return true;
    })();
    session.parallaxPointerRelayStartPromise = operation;
    try {
      return await operation;
    } finally {
      if (session.parallaxPointerRelayStartPromise === operation) {
        session.parallaxPointerRelayStartPromise = null;
      }
    }
  }

  _scheduleSessionPointerRelayFlush(session) {
    if (!this._sessionPointerRelayCanPost(session)
      || session.parallaxPointerRelayBackpressured === true
      || session.parallaxPointerRelayTimer) return false;
    const targetFps = Math.max(MIN_FPS, Math.min(POINTER_RELAY_MAX_FPS, Number(session.fps) || DEFAULT_FPS));
    const interval = 1000 / targetFps;
    const now = Number(this.now()) || Date.now();
    const delay = Math.max(0, Number(session.parallaxPointerRelayLastPostedAt) + interval - now);
    if (delay <= 0) return this._flushSessionPointerRelay(session);
    session.parallaxPointerRelayTimer = setTimeout(() => {
      session.parallaxPointerRelayTimer = null;
      this._flushSessionPointerRelay(session);
    }, Math.max(1, Math.ceil(delay)));
    if (session.parallaxPointerRelayTimer && typeof session.parallaxPointerRelayTimer.unref === 'function') {
      session.parallaxPointerRelayTimer.unref();
    }
    return true;
  }

  _flushSessionPointerRelay(session) {
    if (!this._sessionPointerRelayCanPost(session) || session.parallaxPointerRelayPending !== true) {
      if (session) session.parallaxPointerRelayPending = false;
      return false;
    }
    const child = session.parallaxPointerRelayProcess;
    const stdin = child && child.stdin;
    session.parallaxPointerRelayPending = false;
    try {
      const xUnit = Math.max(0, Math.min(65535, Math.round(Number(session.parallaxPointerRelayLatestX))));
      const yUnit = Math.max(0, Math.min(65535, Math.round(Number(session.parallaxPointerRelayLatestY))));
      const writable = stdin.write(`M:${xUnit}:${yUnit}\n`, 'ascii');
      session.parallaxPointerRelayPosted += 1;
      session.parallaxPointerRelayLastPostedAt = Number(this.now()) || Date.now();
      if (writable === false) {
        session.parallaxPointerRelayBackpressured = true;
        const drain = () => {
          if (session.parallaxPointerRelayDrainListener !== drain) return;
          session.parallaxPointerRelayDrainListener = null;
          session.parallaxPointerRelayBackpressured = false;
          if (session.parallaxPointerRelayPending) this._scheduleSessionPointerRelayFlush(session);
        };
        session.parallaxPointerRelayDrainListener = drain;
        if (typeof stdin.once === 'function') stdin.once('drain', drain);
      }
      return true;
    } catch (_) {
      this._stopSessionPointerRelay(session);
      return false;
    }
  }

  noteHostPointerActivity(expectedSessionId = '', coordinates = null) {
    if (expectedSessionId && typeof expectedSessionId === 'object') {
      coordinates = expectedSessionId;
      expectedSessionId = coordinates.sessionId || '';
    }
    const session = this.active;
    expectedSessionId = String(expectedSessionId || '');
    coordinates = coordinates && typeof coordinates === 'object' ? coordinates : null;
    const rawXUnit = coordinates && coordinates.xUnit;
    const rawYUnit = coordinates && coordinates.yUnit;
    const xUnit = Math.round(rawXUnit);
    const yUnit = Math.round(rawYUnit);
    if (!this._sessionPointerRelayCanPost(session)
      || !expectedSessionId
      || session.sessionId !== expectedSessionId
      || typeof rawXUnit !== 'number' || typeof rawYUnit !== 'number'
      || !Number.isFinite(xUnit) || !Number.isFinite(yUnit)
      || xUnit < 0 || xUnit > 65535 || yUnit < 0 || yUnit > 65535) return false;
    session.parallaxPointerRelayLatestX = xUnit;
    session.parallaxPointerRelayLatestY = yUnit;
    session.parallaxPointerRelayQueued += 1;
    if (session.parallaxPointerRelayPending === true
      || session.parallaxPointerRelayTimer
      || session.parallaxPointerRelayBackpressured === true) {
      session.parallaxPointerRelayCoalesced += 1;
    }
    session.parallaxPointerRelayPending = true;
    this._scheduleSessionPointerRelayFlush(session);
    return true;
  }

  async _nativeWindowControl(action, details = {}) {
    const sourceId = String(details.sourceId || '');
    if (!/^window:\d+:\d+$/.test(sourceId)) throw runtimeError('WALLPAPER_ENGINE_WINDOW_SOURCE_INVALID');
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, stdout, stderr) => {
        if (settled) return;
        settled = true;
        if (error) {
          const detail = String(stderr || error.message || error || '').trim().slice(0, 500);
          if (detail) console.warn(`[Wallpaper Engine] source window ${action} failed: ${detail}`);
          reject(runtimeError(action === 'close'
            ? 'WALLPAPER_ENGINE_WINDOW_CLOSE_FAILED'
            : 'WALLPAPER_ENGINE_WINDOW_ISOLATION_FAILED'));
          return;
        }
        try {
          const jsonLine = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).reverse().find((line) => /^\{.*\}$/.test(line));
          const result = jsonLine ? JSON.parse(jsonLine) : null;
          if (!result || result.ok !== true) throw new Error('invalid native window result');
          resolve(result);
        } catch (_) {
          reject(runtimeError(action === 'close'
            ? 'WALLPAPER_ENGINE_WINDOW_CLOSE_FAILED'
            : 'WALLPAPER_ENGINE_WINDOW_ISOLATION_FAILED'));
        }
      };
      try {
        this.nativeExecFile(this.powerShellExecutable, [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          nativeWindowControlScript(),
        ], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 15000,
          maxBuffer: 128 * 1024,
          shell: false,
          env: this._powerShellEnv({
            MINERADIO_WE_WINDOW_ACTION: String(action || ''),
            MINERADIO_WE_WINDOW_SOURCE_ID: sourceId,
            MINERADIO_WE_WINDOW_TITLE: String(details.locationTitle || ''),
            MINERADIO_WE_WINDOW_EXECUTABLE: String(details.executable || ''),
            MINERADIO_WE_HOST_WINDOW_ID: String(details.hostWindowId || ''),
            MINERADIO_WE_HOST_EXECUTABLE: String(details.hostExecutable || ''),
            MINERADIO_WE_HOST_CORNER_RADIUS: String(Math.max(0, Math.min(512, Number(details.cornerRadius) || 0))),
          }),
        }, finish);
      } catch (error) {
        finish(error);
      }
    });
  }

  async _controlSessionWindow(action, session, sourceId = '', host = {}) {
    if (!session || !session.executable || !session.locationTitle) {
      throw runtimeError('WALLPAPER_ENGINE_WINDOW_SESSION_INVALID');
    }
    const effectiveSourceId = String(sourceId || session.windowSourceId || session.sourceId || '');
    const result = await this.windowController(action, {
      sourceId: effectiveSourceId,
      locationTitle: session.locationTitle,
      executable: session.executable,
      hostWindowId: String(host.hostWindowId || ''),
      hostExecutable: String(host.hostExecutable || ''),
      cornerRadius: Math.max(0, Math.min(512, Number(host.cornerRadius) || 0)),
    });
    if (!result || result.ok !== true) throw runtimeError(action === 'close'
      ? 'WALLPAPER_ENGINE_WINDOW_CLOSE_FAILED'
      : 'WALLPAPER_ENGINE_WINDOW_ISOLATION_FAILED');
    if (action === 'embed') {
      if (result.missing === true || result.embedded !== true) {
        throw runtimeError('WALLPAPER_ENGINE_WINDOW_ISOLATION_FAILED');
      }
      session.windowSourceId = effectiveSourceId;
      session.windowEmbedding = result;
      session.windowParking = null;
    } else if (action === 'park') {
      if (result.missing === true || result.parked !== true) {
        throw runtimeError('WALLPAPER_ENGINE_WINDOW_ISOLATION_FAILED');
      }
      session.windowSourceId = effectiveSourceId;
      session.windowParking = result;
    }
    return result;
  }

  async _runTransientControl(executable, args) {
    if (this.useDesktopShellBroker && await this._hostIsElevated()) {
      return this._spawnControlViaDesktopShell(executable, args, { waitForExit: true });
    }
    return new Promise((resolve, reject) => {
      try {
        const verbatimArgs = verbatimWallpaperControlArguments(args);
        const controlExecutable = verbatimArgs ? path.basename(executable) : executable;
        const controlArgs = verbatimArgs || args;
        this.controlExecFile(controlExecutable, controlArgs, {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 3500,
          maxBuffer: 32 * 1024,
          shell: false,
          windowsVerbatimArguments: !!verbatimArgs,
          ...(verbatimArgs ? { cwd: path.dirname(executable) } : {}),
        }, (error, _stdout, stderr) => {
          if (error) {
            const action = String(args && args[1] || 'control').replace(/[^a-z0-9_-]/gi, '').slice(0, 48) || 'control';
            const detail = String(stderr || error.message || error || '').trim().replace(/\s+/g, ' ').slice(0, 500);
            console.warn(`[Wallpaper Engine] ${action} command failed${detail ? `: ${detail}` : ''}`);
            reject(runtimeError('WALLPAPER_ENGINE_CONTROL_FAILED'));
          }
          else resolve();
        });
      } catch (_) {
        reject(runtimeError('WALLPAPER_ENGINE_CONTROL_FAILED'));
      }
    });
  }

  async _prepareSilentLaunchFile(session, projectFile, scenePackage) {
    if (!session || !projectFile || !scenePackage) return projectFile || scenePackage;
    let project;
    try {
      const stat = await fs.promises.stat(projectFile);
      if (!stat.isFile() || stat.size <= 0 || stat.size > 1024 * 1024) {
        throw runtimeError('WALLPAPER_ENGINE_SILENT_STAGE_FAILED');
      }
      const raw = await fs.promises.readFile(projectFile, 'utf8');
      project = JSON.parse(raw.replace(/^\uFEFF/, ''));
    } catch (error) {
      if (error && error.code === 'WALLPAPER_ENGINE_SILENT_STAGE_FAILED') throw error;
      throw runtimeError('WALLPAPER_ENGINE_SILENT_STAGE_FAILED');
    }
    if (!project || typeof project !== 'object' || Array.isArray(project)
      || String(project.type || '').trim().toLowerCase() !== 'scene') {
      throw runtimeError('WALLPAPER_ENGINE_SILENT_STAGE_FAILED');
    }
    const properties = project.general && project.general.properties;
    const muteProperties = sanitizeMuteProperties(session.muteProperties);
    let stagedPropertyCount = 0;
    if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
      for (const [key, value] of Object.entries(muteProperties)) {
        if (key.toLowerCase() === 'volume' || !Object.prototype.hasOwnProperty.call(properties, key)) continue;
        const property = properties[key];
        if (!property || typeof property !== 'object' || Array.isArray(property)) continue;
        property.value = value;
        stagedPropertyCount += 1;
      }
    }

    let stagedScenePackage = scenePackage;
    try {
      stagedScenePackage = await this._prepareMutedScenePackage(session, scenePackage);
    } catch (error) {
      console.warn('[Wallpaper Engine] cached Scene audio patch unavailable, using property-only suppression:', error && (error.code || error.message) || error);
      session.patchedSceneAudioObjectCount = 0;
      session.mutedScenePackageCacheFile = '';
    }
    if (!stagedPropertyCount && stagedScenePackage === scenePackage) return projectFile;

    const nativeVolume = path.parse(path.resolve(this.nativeTempPath)).root.toLowerCase();
    const packageVolume = path.parse(path.resolve(scenePackage)).root.toLowerCase();
    const preferredStageRoot = nativeVolume === packageVolume
      ? path.resolve(this.nativeTempPath, 'wallpaper-engine-scene-stage')
      : path.resolve(path.parse(scenePackage).root, 'MineradioCache', 'wallpaper-engine-scene-stage');
    let stageRoot = preferredStageRoot;
    try {
      await fs.promises.mkdir(stageRoot, { recursive: true });
    } catch (_) {
      stageRoot = path.resolve(path.dirname(scenePackage), '.mineradio-scene-stage');
      await fs.promises.mkdir(stageRoot, { recursive: true });
    }
    const stageDirectory = path.resolve(stageRoot, session.sessionId);
    const relative = path.relative(stageRoot, stageDirectory);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw runtimeError('WALLPAPER_ENGINE_SILENT_STAGE_FAILED');
    }
    await fs.promises.rm(stageDirectory, { recursive: true, force: true });
    await fs.promises.mkdir(stageDirectory, { recursive: true });
    const manifestFile = String(project.file || '').replace(/\\/g, '/');
    const manifestPackageName = /(?:^|\/)([^/]+\.(?:pkg|pak))$/i.exec(manifestFile);
    const stagedPackageName = manifestPackageName && /^[a-z0-9_. -]{1,180}\.(?:pkg|pak)$/i.test(manifestPackageName[1])
      ? manifestPackageName[1]
      : 'scene.pkg';
    if (manifestPackageName) project.file = stagedPackageName;
    const stagedPackageFile = path.join(stageDirectory, stagedPackageName);
    const stagedProjectFile = path.join(stageDirectory, 'project.json');
    const temporaryFile = stagedProjectFile + '.tmp';
    try {
      try {
        await fs.promises.link(stagedScenePackage, stagedPackageFile);
      } catch (_) {
        await fs.promises.copyFile(stagedScenePackage, stagedPackageFile);
      }
      await fs.promises.writeFile(temporaryFile, JSON.stringify(project), 'utf8');
      await fs.promises.rename(temporaryFile, stagedProjectFile);
    } catch (error) {
      try { await fs.promises.rm(stageDirectory, { recursive: true, force: true }); } catch (_) { }
      console.warn('[Wallpaper Engine] silent Scene staging unavailable, using original project:', error && error.message || error);
      session.stagedAudioPropertyCount = 0;
      session.patchedSceneAudioObjectCount = 0;
      session.mutedScenePackageCacheFile = '';
      return projectFile;
    }
    session.stagedProjectRoot = stageDirectory;
    session.stagedProjectBaseRoot = stageRoot;
    session.stagedProjectFile = stagedProjectFile;
    session.stagedAudioPropertyCount = stagedPropertyCount;
    return stagedProjectFile;
  }

  async _prepareMutedScenePackage(session, scenePackage) {
    const source = await readWallpaperPackageScene(scenePackage);
    const patchedScene = JSON.parse(JSON.stringify(source.scene));
    const audioObjectCount = forceSceneAudioSilent(patchedScene);
    if (!audioObjectCount) return scenePackage;
    const patchedBuffer = encodePatchedScene(patchedScene, source.sceneLength);
    const cacheRoot = path.resolve(this.nativeTempPath, 'wallpaper-engine-muted-package-cache');
    await fs.promises.mkdir(cacheRoot, { recursive: true });
    const sourceIdentity = crypto.createHash('sha256')
      .update(String(MUTED_SCENE_PACKAGE_CACHE_VERSION))
      .update('\0')
      .update(path.resolve(scenePackage).toLowerCase())
      .update('\0')
      .update(String(source.packageSize))
      .update('\0')
      .update(String(Math.round(source.packageMtimeMs)))
      .digest('hex');
    const cachedFile = path.join(cacheRoot, `${sourceIdentity}.pkg`);
    const cachedStat = await statFile(cachedFile);
    const cachedPackageIsValid = !!cachedStat
      && cachedStat.size === source.packageSize
      && await validateMutedScenePackage(cachedFile, source.packageSize, audioObjectCount);
    if (!cachedPackageIsValid) {
      if (cachedStat) await fs.promises.rm(cachedFile, { force: true });
      const temporaryFile = path.join(cacheRoot, `${sourceIdentity}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
      try {
        await fs.promises.copyFile(scenePackage, temporaryFile);
        const handle = await fs.promises.open(temporaryFile, 'r+');
        try {
          let offset = 0;
          while (offset < patchedBuffer.length) {
            const result = await handle.write(patchedBuffer, offset, patchedBuffer.length - offset, source.dataOffset + offset);
            if (!result || result.bytesWritten <= 0) throw runtimeError('WALLPAPER_SCENE_PACKAGE_PATCH_FAILED');
            offset += result.bytesWritten;
          }
          await handle.sync();
        } finally {
          await handle.close();
        }
        try {
          await fs.promises.rename(temporaryFile, cachedFile);
        } catch (error) {
          const concurrentPackageIsValid = await validateMutedScenePackage(
            cachedFile,
            source.packageSize,
            audioObjectCount
          );
          if (concurrentPackageIsValid) {
            await fs.promises.rm(temporaryFile, { force: true });
          } else {
            await fs.promises.rm(cachedFile, { force: true });
            await fs.promises.rename(temporaryFile, cachedFile);
          }
        }
      } catch (error) {
        try { await fs.promises.rm(temporaryFile, { force: true }); } catch (_) { }
        throw error;
      }
      const rebuiltPackageIsValid = await validateMutedScenePackage(
        cachedFile,
        source.packageSize,
        audioObjectCount
      );
      if (!rebuiltPackageIsValid) {
        await fs.promises.rm(cachedFile, { force: true });
        throw runtimeError('WALLPAPER_SCENE_PACKAGE_PATCH_FAILED');
      }
    }
    session.patchedSceneAudioObjectCount = audioObjectCount;
    session.mutedScenePackageCacheFile = cachedFile;
    return cachedFile;
  }

  async _cleanupStagedProject(session) {
    if (!session || !session.stagedProjectRoot || !session.stagedProjectBaseRoot) return;
    const stageRoot = path.resolve(session.stagedProjectBaseRoot || '');
    const stageDirectory = path.resolve(session.stagedProjectRoot);
    const relative = path.relative(stageRoot, stageDirectory);
    session.stagedProjectRoot = '';
    session.stagedProjectBaseRoot = '';
    session.stagedProjectFile = '';
    session.stagedAudioPropertyCount = 0;
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return;
    try {
      await fs.promises.rm(stageDirectory, { recursive: true, force: true });
    } catch (error) {
      console.warn('[Wallpaper Engine] silent Scene stage cleanup deferred:', error && error.message || error);
    }
  }

  _sessionIsCurrent(session) {
    return !!session
      && !this.disposed
      && session.stopping !== true
      && (this.pending === session || this.active === session);
  }

  _clearSessionMuteReassertions(session) {
    if (!session || !session.muteReassertTimers) return;
    for (const timer of session.muteReassertTimers) clearTimeout(timer);
    session.muteReassertTimers.clear();
  }

  async _applySessionMute(session) {
    if (!this._sessionIsCurrent(session) || !session.executable || !session.locationTitle) return false;
    if (session.muteApplyPromise) return session.muteApplyPromise;
    const operation = (async () => {
      const properties = sanitizeMuteProperties(session.muteProperties);
      await this._runTransientControl(session.executable, [
        '-control',
        'applyProperties',
        '-properties',
        `RAW~(${JSON.stringify(properties)})~END`,
        '-location',
        session.locationTitle,
      ]);
      if (!this._sessionIsCurrent(session)) return false;
      session.audioMuteCommandCount = Math.max(0, Number(session.audioMuteCommandCount) || 0) + 1;
      session.audioMuteLastAt = this.now();
      // This flag means the unique-location property command was acknowledged.
      // It deliberately does not mutate Windows' persistent Core Audio state.
      session.audioPropertySuppressed = true;
      session.audioMuted = true;
      return true;
    })();
    session.muteApplyPromise = operation;
    try {
      return await operation;
    } finally {
      if (session.muteApplyPromise === operation) session.muteApplyPromise = null;
    }
  }

  _scheduleSessionMuteReassertions(session) {
    this._clearSessionMuteReassertions(session);
    if (!this._sessionIsCurrent(session)) return;
    for (const delay of MUTE_REASSERT_DELAYS_MS) {
      const timer = setTimeout(() => {
        if (session.muteReassertTimers) session.muteReassertTimers.delete(timer);
        if (!this._sessionIsCurrent(session)) return;
        this._applySessionMute(session).catch((error) => {
          console.warn('[Wallpaper Engine] location-scoped audio suppression retry failed:', error && error.message || error);
        });
      }, delay);
      if (timer && typeof timer.unref === 'function') timer.unref();
      session.muteReassertTimers.add(timer);
    }
  }

  async _muteSession(session, muteProperties) {
    const properties = sanitizeMuteProperties(muteProperties);
    session.muteProperties = properties;
    session.audioMuted = false;
    this._clearSessionMuteReassertions(session);
    const deadline = this.wallNow() + INITIAL_MUTE_RETRY_DEADLINE_MS;
    let lastError = null;
    let applied = false;
    for (const delay of INITIAL_MUTE_RETRY_DELAYS_MS) {
      if (delay > 0) await this.nativeSleep(delay);
      if (!this._sessionIsCurrent(session)) throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
      if (this.wallNow() > deadline) break;
      try {
        applied = await this._applySessionMute(session);
        if (applied) break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!applied) {
      if (!this._sessionIsCurrent(session)) throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
      throw lastError || runtimeError('WALLPAPER_ENGINE_AUDIO_SUPPRESSION_FAILED');
    }
    await this.nativeSleep(80);
    this._scheduleSessionMuteReassertions(session);
  }

  async confirmCaptureReady(expectedSessionId = '') {
    const session = this.active;
    expectedSessionId = String(expectedSessionId || '');
    if (!session || (expectedSessionId && session.sessionId !== expectedSessionId)) return false;
    const muted = await this._applySessionMute(session);
    if (!muted || this.active !== session || session.stopping === true) return false;
    if (!session.windowEmbedding || session.windowEmbedding.aligned !== true) return false;
    // Keep the native WE source physically aligned behind Mineradio so the
    // engine continues to read the real Windows cursor. DWM mirrors that live
    // surface into a click-through helper directly beneath the transparent
    // Electron host; unlike Chromium window capture, it does not bake a second
    // delayed cursor into the picture.
    const surfaceReady = await this._startSessionDwmSurface(session).catch(() => false);
    if (!surfaceReady || this.active !== session || session.stopping === true
      || session.dwmSurfaceReady !== true) return false;
    this._stopSessionPointerRelay(session);
    session.windowParking = null;
    this._scheduleSessionMuteReassertions(session);
    return true;
  }

  _openControlArgs(session) {
    return [
      '-control',
      'openWallpaper',
      '-file',
      session.launchFile,
      '-playInWindow',
      session.locationTitle,
      '-width',
      String(session.launchWidth),
      '-height',
      String(session.launchHeight),
      '-x',
      String(session.launchX),
      '-y',
      String(session.launchY),
      '-borderless',
    ];
  }

  async _openInitialSessionWindow(session, expectedGeneration) {
    if (!session || !session.executable || !session.launchFile) {
      throw runtimeError('WALLPAPER_ENGINE_WINDOW_SESSION_INVALID');
    }
    if (session.initialOpenIssued === true) {
      throw runtimeError('WALLPAPER_ENGINE_INITIAL_OPEN_DUPLICATE');
    }
    session.initialOpenIssued = true;
    const operation = (async () => {
      if (expectedGeneration !== this.generation || this.disposed || this.pending !== session) {
        throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
      }
      await this._spawnControl(session.executable, this._openControlArgs(session), {
        isCurrent: () => expectedGeneration === this.generation
          && !this.disposed
          && this.pending === session,
      });
      session.launched = true;
    })();
    session.initialOpenPromise = operation;
    try {
      await operation;
    } finally {
      if (session.initialOpenPromise === operation) session.initialOpenPromise = null;
    }
    if (expectedGeneration !== this.generation || this.disposed || this.pending !== session) {
      throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
    }
  }

  async _relaunchSessionWindow(session, launchWidth, launchHeight, launchX, launchY) {
    const generation = this.generation;
    const isCurrent = () => generation === this.generation
      && !this.disposed
      && session.stopping !== true
      && this.active === session;
    if (!isCurrent()) throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
    const previousSourceId = String(session.windowSourceId || session.sourceId || '');
    if (!previousSourceId) throw runtimeError('WALLPAPER_ENGINE_WINDOW_CLOSE_FAILED');
    try {
      await this._spawnControl(session.executable, [
        '-control',
        'closeWallpaper',
        '-location',
        session.locationTitle,
      ], { isCurrent });
    } catch (error) {
      if (!isCurrent()) throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
      if (error && error.code === 'WALLPAPER_ENGINE_START_SUPERSEDED') throw error;
    }
    if (!isCurrent()) throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
    let closeResult = null;
    try {
      closeResult = await this._controlSessionWindow('close', session, previousSourceId);
    } catch (_) { }
    if (!isCurrent()) throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
    if (!closeResult || (closeResult.closed !== true && closeResult.missing !== true)) {
      throw runtimeError('WALLPAPER_ENGINE_WINDOW_CLOSE_FAILED');
    }
    this._stopSessionPointerRelay(session);
    this._stopSessionDwmSurface(session);
    await this.nativeSleep(180);
    if (!isCurrent()) throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
    session.launchWidth = clampInteger(launchWidth, MIN_WIDTH, MAX_WIDTH, session.launchWidth);
    session.launchHeight = clampInteger(launchHeight, MIN_HEIGHT, MAX_HEIGHT, session.launchHeight);
    session.launchX = clampInteger(launchX, MIN_POSITION, MAX_POSITION, session.launchX);
    session.launchY = clampInteger(launchY, MIN_POSITION, MAX_POSITION, session.launchY);
    session.windowEmbedding = null;
    session.windowParking = null;
    session.captureAttached = false;
    await this._spawnControl(session.executable, this._openControlArgs(session), { isCurrent });
    session.launched = true;
    if (!isCurrent()) throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
    let earlyMuteError = null;
    const earlyMutePromise = this._muteSession(session, session.muteProperties)
      .then(() => true)
      .catch((error) => {
        earlyMuteError = error;
        return false;
      });
    await this.nativeSleep(240);
    const captureSource = await this._findWindowSource(
      session.locationTitle,
      generation,
      session.runtimeOptions,
      {
        exactTitleOnly: true,
        returnSource: true,
        isCurrent,
        supersededCode: 'WALLPAPER_ENGINE_START_SUPERSEDED',
      }
    );
    if (!isCurrent()) throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
    session.sourceId = String(captureSource && captureSource.id || '');
    session.windowSourceId = session.sourceId;
    const mutedBeforeCapture = await earlyMutePromise;
    if (!mutedBeforeCapture) {
      if (!isCurrent()) throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
      await this._muteSession(session, session.muteProperties).catch(() => { throw earlyMuteError; });
    }
  }

  async _verifyExecutableSignature(executable, stat) {
    const key = path.resolve(executable).toLowerCase();
    const stamp = `${Number(stat.size) || 0}:${Math.round(Number(stat.mtimeMs) || 0)}`;
    const cached = this.signatureCache.get(key);
    if (cached && cached.stamp === stamp) return cached.valid;

    let valid = false;
    try {
      const output = await this._execFileText(this.powerShellExecutable, [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        signatureScript(),
      ], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 7000,
        maxBuffer: 64 * 1024,
        shell: false,
        env: this._powerShellEnv({
          MINERADIO_WE_SIGNATURE_TARGET: executable,
        }),
      });
      const jsonLine = output.split(/\r?\n/).map((line) => line.trim()).reverse().find((line) => /^\{.*\}$/.test(line));
      const signature = jsonLine ? JSON.parse(jsonLine) : null;
      valid = !!signature
        && String(signature.status || '').toLowerCase() === 'valid'
        && SIGNER_PATTERN.test(String(signature.subject || ''));
    } catch (_) {
      valid = false;
    }
    this.signatureCache.set(key, { stamp, valid });
    return valid;
  }

  _candidateExecutables(libraries) {
    const names = this.arch === 'x64'
      ? ['wallpaper64.exe', 'wallpaper32.exe']
      : ['wallpaper32.exe', 'wallpaper64.exe'];
    const seen = new Set();
    const output = [];
    for (const library of Array.isArray(libraries) ? libraries : []) {
      const rawRoot = String(library || '').trim();
      if (!rawRoot) continue;
      const root = path.resolve(rawRoot);
      for (const name of names) {
        const executable = path.join(root, 'steamapps', 'common', 'wallpaper_engine', name);
        const key = executable.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        output.push(executable);
      }
    }
    return output;
  }

  async _discoverExecutable(force = false) {
    if (this.platform !== 'win32') return { available: false, reason: 'WALLPAPER_ENGINE_WINDOWS_ONLY' };
    if (force) {
      this.executableCache = null;
      this.signatureCache.clear();
    }
    if (this.executableCache) {
      const stat = await statFile(this.executableCache.executable);
      if (stat && await this._verifyExecutableSignature(this.executableCache.executable, stat)) {
        return this.executableCache;
      }
      this.executableCache = null;
    }
    if (this.executableDiscoveryPromise && !force) return this.executableDiscoveryPromise;

    const discovery = (async () => {
      let libraries = [];
      try { libraries = await this.discoverSteamLibraries(); } catch (_) { libraries = []; }
      let unsignedInstallationFound = false;
      for (const executable of this._candidateExecutables(libraries)) {
        const stat = await statFile(executable);
        if (!stat) continue;
        if (!await this._verifyExecutableSignature(executable, stat)) {
          unsignedInstallationFound = true;
          continue;
        }
        const found = {
          available: true,
          executable,
          executableName: path.basename(executable),
        };
        this.executableCache = found;
        return found;
      }
      return {
        available: false,
        reason: unsignedInstallationFound
          ? 'WALLPAPER_ENGINE_SIGNATURE_INVALID'
          : 'WALLPAPER_ENGINE_NOT_INSTALLED',
      };
    })();
    this.executableDiscoveryPromise = discovery;
    try {
      return await discovery;
    } finally {
      if (this.executableDiscoveryPromise === discovery) this.executableDiscoveryPromise = null;
    }
  }

  async probe(force = false) {
    if (force && typeof force === 'object') force = force.force === true;
    const result = await this._discoverExecutable(force === true);
    return result.available ? {
      ok: true,
      available: true,
      executable: result.executableName,
    } : {
      ok: true,
      available: false,
      reason: result.reason || 'WALLPAPER_ENGINE_NOT_INSTALLED',
    };
  }

  async revealWorkshop(workshopId) {
    workshopId = String(workshopId || '').trim();
    if (!/^\d{5,32}$/.test(workshopId)) throw runtimeError('WALLPAPER_ENGINE_WORKSHOP_ID_INVALID');
    if (this.disposed) throw runtimeError('WALLPAPER_ENGINE_RUNTIME_DISPOSED');
    const installation = await this._discoverExecutable(false);
    if (!installation.available || !installation.executable) {
      throw runtimeError(installation.reason || 'WALLPAPER_ENGINE_NOT_INSTALLED');
    }
    const executable = await this._ensureEngineReady(installation.executable);
    await this._runTransientControl(executable, [
      '-control',
      'revealWallpaper',
      '-id',
      workshopId,
    ]);
    return { ok: true, workshopId };
  }

  async _spawnControl(executable, args, options = {}) {
    const isCurrent = typeof options.isCurrent === 'function' ? options.isCurrent : null;
    const elevated = this.useDesktopShellBroker && await this._hostIsElevated();
    if (isCurrent && !isCurrent()) throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
    if (elevated) {
      return this._spawnControlViaDesktopShell(executable, args);
    }
    return new Promise((resolve, reject) => {
      let child;
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        if (error && error.code === 'WALLPAPER_ENGINE_START_SUPERSEDED') reject(error);
        else if (error) reject(runtimeError('WALLPAPER_ENGINE_CONTROL_FAILED'));
        else resolve();
      };
      try {
        if (isCurrent && !isCurrent()) {
          finish(runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED'));
          return;
        }
        child = this.spawn(executable, args, {
          windowsHide: true,
          stdio: 'ignore',
          detached: false,
          shell: false,
        });
      } catch (error) {
        finish(error);
        return;
      }
      if (!child || typeof child.once !== 'function') {
        finish(new Error('spawn failed'));
        return;
      }
      child.once('error', finish);
      child.once('spawn', () => {
        try { if (typeof child.unref === 'function') child.unref(); } catch (_) { }
        finish();
      });
    });
  }

  async _hostIsElevated() {
    if (this.hostElevationCache !== null) return this.hostElevationCache;
    try {
      this.hostElevationCache = await this.hostElevationProbe() !== false;
    } catch (_) {
      this.hostElevationCache = true;
    }
    return this.hostElevationCache;
  }

  async _spawnControlViaDesktopShell(executable, args, options = {}) {
    const commandLine = wallpaperControlCommandLine(executable, args);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, _stdout, stderr) => {
        if (settled) return;
        settled = true;
        if (error) {
          const detail = String(stderr || error.message || error || '').trim().slice(0, 500);
          if (detail) console.warn(`[Wallpaper Engine] desktop-token launch failed: ${detail}`);
          reject(runtimeError('WALLPAPER_ENGINE_CONTROL_FAILED'));
        }
        else resolve();
      };
      try {
        this.controlExecFile(this.powerShellExecutable, [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          controlBrokerScript(),
        ], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 20000,
          maxBuffer: 32 * 1024,
          shell: false,
          env: this._powerShellEnv({
            MINERADIO_WE_CONTROL_TARGET: executable,
            MINERADIO_WE_CONTROL_COMMAND_LINE: commandLine,
            MINERADIO_WE_CONTROL_WAIT: options.waitForExit === true ? '1' : '0',
            MINERADIO_WE_CONTROL_WAIT_TIMEOUT: options.waitForExit === true ? '10000' : '0',
          }),
        }, finish);
      } catch (error) {
        finish(error);
      }
    });
  }

  async _probeEngineProcess(expectedExecutable) {
    try {
      return normalizeEngineProcessState(await this.engineProcessProbe(expectedExecutable));
    } catch (_) {
      return normalizeEngineProcessState(null);
    }
  }

  async _waitForKnownEngineState(expectedExecutable, deadline) {
    while (this.wallNow() <= deadline) {
      if (this.disposed) throw runtimeError('WALLPAPER_ENGINE_RUNTIME_DISPOSED');
      const state = await this._probeEngineProcess(expectedExecutable);
      if (state.ok) return state;
      if (this.wallNow() > deadline) break;
      await this.nativeSleep(ENGINE_PROCESS_POLL_MS);
    }
    throw runtimeError('WALLPAPER_ENGINE_PROCESS_PROBE_FAILED');
  }

  async _trustedRunningExecutable(requestedExecutable, state) {
    if (!state || state.matching !== true) {
      throw runtimeError(state && state.running
        ? 'WALLPAPER_ENGINE_PROCESS_PATH_MISMATCH'
        : 'WALLPAPER_ENGINE_NOT_RUNNING');
    }
    const requestedRoot = path.dirname(path.resolve(requestedExecutable));
    const effectiveExecutable = path.resolve(String(state.executable || requestedExecutable));
    if (path.dirname(effectiveExecutable).toLowerCase() !== requestedRoot.toLowerCase()) {
      throw runtimeError('WALLPAPER_ENGINE_PROCESS_PATH_MISMATCH');
    }
    const name = path.basename(effectiveExecutable).toLowerCase();
    if (name !== 'wallpaper32.exe' && name !== 'wallpaper64.exe') {
      throw runtimeError('WALLPAPER_ENGINE_PROCESS_PATH_MISMATCH');
    }
    const stat = await statFile(effectiveExecutable);
    if (!stat || !await this._verifyExecutableSignature(effectiveExecutable, stat)) {
      throw runtimeError('WALLPAPER_ENGINE_SIGNATURE_INVALID');
    }
    return effectiveExecutable;
  }

  async _waitForEngineProcess(requestedExecutable, deadline) {
    let stableObservations = 0;
    let stableSince = 0;
    let effectiveExecutable = '';
    let stablePidsKey = '';
    let observedKnownState = false;
    while (this.wallNow() <= deadline) {
      if (this.disposed) throw runtimeError('WALLPAPER_ENGINE_RUNTIME_DISPOSED');
      const state = await this._probeEngineProcess(requestedExecutable);
      if (!state.ok) {
        effectiveExecutable = '';
        stablePidsKey = '';
        stableObservations = 0;
        stableSince = 0;
        if (this.wallNow() > deadline) break;
        await this.nativeSleep(ENGINE_PROCESS_POLL_MS);
        continue;
      }
      observedKnownState = true;
      if (state.running && !state.matching) {
        throw runtimeError('WALLPAPER_ENGINE_PROCESS_PATH_MISMATCH');
      }
      if (state.matching) {
        const currentExecutable = await this._trustedRunningExecutable(requestedExecutable, state);
        const currentPidsKey = engineProcessPidKey(state);
        if (effectiveExecutable
          && currentExecutable.toLowerCase() === effectiveExecutable.toLowerCase()
          && currentPidsKey === stablePidsKey) {
          effectiveExecutable = currentExecutable;
          stableObservations += 1;
        } else {
          effectiveExecutable = currentExecutable;
          stablePidsKey = currentPidsKey;
          stableObservations = 1;
          stableSince = this.wallNow();
        }
        if (stableObservations >= 2 && this.wallNow() - stableSince >= ENGINE_PROCESS_STABLE_MS) {
          return { executable: effectiveExecutable, state };
        }
      } else {
        effectiveExecutable = '';
        stablePidsKey = '';
        stableObservations = 0;
        stableSince = 0;
      }
      if (this.wallNow() > deadline) break;
      await this.nativeSleep(ENGINE_PROCESS_POLL_MS);
    }
    throw runtimeError(observedKnownState
      ? 'WALLPAPER_ENGINE_BOOTSTRAP_TIMEOUT'
      : 'WALLPAPER_ENGINE_PROCESS_PROBE_FAILED');
  }

  async _waitForEngineControlReady(executable, deadline) {
    let consecutiveSuccesses = 0;
    let readyPidsKey = '';
    while (this.wallNow() <= deadline) {
      if (this.disposed) throw runtimeError('WALLPAPER_ENGINE_RUNTIME_DISPOSED');
      const state = await this._probeEngineProcess(executable);
      if (!state.ok) {
        consecutiveSuccesses = 0;
        readyPidsKey = '';
        if (this.wallNow() > deadline) break;
        await this.nativeSleep(ENGINE_READY_POLL_MS);
        continue;
      }
      if (state.running && !state.matching) {
        throw runtimeError('WALLPAPER_ENGINE_PROCESS_PATH_MISMATCH');
      }
      if (!state.matching) {
        consecutiveSuccesses = 0;
        readyPidsKey = '';
      } else {
        const currentPidsKey = engineProcessPidKey(state);
        if (currentPidsKey !== readyPidsKey) {
          consecutiveSuccesses = 0;
          readyPidsKey = currentPidsKey;
        }
        try {
          const acknowledged = await this.engineReadyProbe(executable);
          consecutiveSuccesses = acknowledged === false ? 0 : consecutiveSuccesses + 1;
          if (consecutiveSuccesses >= ENGINE_READY_SUCCESS_COUNT) {
            this.engineReadyExecutable = path.resolve(executable);
            this.engineReadyAt = this.now();
            this.engineReadyPidsKey = currentPidsKey;
            return true;
          }
        } catch (_) {
          consecutiveSuccesses = 0;
        }
      }
      if (this.wallNow() > deadline) break;
      await this.nativeSleep(ENGINE_READY_POLL_MS);
    }
    throw runtimeError('WALLPAPER_ENGINE_CONTROL_NOT_READY');
  }

  async _ensureEngineReady(requestedExecutable) {
    const requested = path.resolve(requestedExecutable);
    if (this.engineBootstrapPromise) {
      if (this.engineBootstrapExecutable.toLowerCase() !== requested.toLowerCase()) {
        throw runtimeError('WALLPAPER_ENGINE_BOOTSTRAP_CONFLICT');
      }
      return this.engineBootstrapPromise;
    }

    const operation = (async () => {
      const deadline = this.wallNow() + ENGINE_BOOTSTRAP_TIMEOUT_MS;
      let state = await this._waitForKnownEngineState(requested, deadline);
      if (state.running && !state.matching) {
        throw runtimeError('WALLPAPER_ENGINE_PROCESS_PATH_MISMATCH');
      }

      let effectiveExecutable = '';
      let effectiveState = state;
      if (state.matching) {
        effectiveExecutable = await this._trustedRunningExecutable(requested, state);
      } else {
        const executableName = path.basename(requested).toLowerCase();
        if (executableName !== 'wallpaper32.exe' && executableName !== 'wallpaper64.exe') {
          throw runtimeError('WALLPAPER_ENGINE_EXECUTABLE_INVALID');
        }
        const executableStat = await statFile(requested);
        if (!executableStat || !await this._verifyExecutableSignature(requested, executableStat)) {
          throw runtimeError('WALLPAPER_ENGINE_SIGNATURE_INVALID');
        }
        // Wallpaper Engine explicitly supports launching the main executable
        // directly from its installation directory. This keeps the core quiet
        // even when its Steam launcher wants to show crash-recovery/browse UI.
        // No -control command is sent until the process and IPC channel are
        // independently confirmed ready below.
        await this._spawnControl(requested, []);
        const running = await this._waitForEngineProcess(requested, deadline);
        effectiveExecutable = running.executable;
        effectiveState = running.state;
      }

      const cacheAge = this.now() - Number(this.engineReadyAt || 0);
      const effectivePidsKey = engineProcessPidKey(effectiveState);
      const cacheMatches = this.engineReadyExecutable
        && this.engineReadyExecutable.toLowerCase() === effectiveExecutable.toLowerCase()
        && this.engineReadyPidsKey === effectivePidsKey
        && cacheAge >= 0
        && cacheAge <= ENGINE_READY_CACHE_MS;
      if (!cacheMatches) await this._waitForEngineControlReady(effectiveExecutable, deadline);
      return effectiveExecutable;
    })();

    this.engineBootstrapExecutable = requested;
    this.engineBootstrapPromise = operation;
    try {
      return await operation;
    } finally {
      if (this.engineBootstrapPromise === operation) {
        this.engineBootstrapPromise = null;
        this.engineBootstrapExecutable = '';
      }
    }
  }

  async _findWindowSource(locationTitle, generation, options, constraints = {}) {
    if (!this.desktopCapturer || typeof this.desktopCapturer.getSources !== 'function') {
      throw runtimeError('WALLPAPER_ENGINE_CAPTURE_UNAVAILABLE');
    }
    const exactTitleOnly = constraints.exactTitleOnly === true;
    const isCurrent = typeof constraints.isCurrent === 'function'
      ? constraints.isCurrent
      : null;
    const supersededCode = String(constraints.supersededCode || 'WALLPAPER_ENGINE_START_SUPERSEDED');
    const returnSource = constraints.returnSource === true;
    const acceptSource = typeof constraints.acceptSource === 'function'
      ? constraints.acceptSource
      : null;
    const assertCurrent = () => {
      if (generation !== this.generation || this.disposed || (isCurrent && !isCurrent())) {
        throw runtimeError(supersededCode);
      }
    };
    const deadline = this.now() + options.sourceTimeoutMs;
    while (this.now() <= deadline) {
      assertCurrent();
      let sources = [];
      try {
        sources = await this.desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 0, height: 0 },
          fetchWindowIcons: false,
        });
      } catch (_) { }
      assertCurrent();
      if (!Array.isArray(sources)) sources = [];
      const exact = sources.find((source) => String(source && source.name || '') === locationTitle
        && (!acceptSource || acceptSource(source)));
      const matched = exactTitleOnly
        ? exact
        : exact || sources.find((source) => String(source && source.name || '').includes(locationTitle)
          && (!acceptSource || acceptSource(source)));
      if (matched && matched.id) {
        return returnSource ? matched : String(matched.id);
      }
      assertCurrent();
      await this.sleep(options.sourcePollMs);
    }
    throw runtimeError('WALLPAPER_ENGINE_WINDOW_TIMEOUT');
  }

  async refreshActiveSource(expectedSessionId = '', options = {}) {
    if (expectedSessionId && typeof expectedSessionId === 'object') {
      options = expectedSessionId;
      expectedSessionId = options.sessionId || '';
    }
    if (!options || typeof options !== 'object') options = {};
    if (this.disposed) throw runtimeError('WALLPAPER_ENGINE_RUNTIME_DISPOSED');

    const session = this.active;
    if (!session) throw runtimeError('WALLPAPER_ENGINE_NOT_ACTIVE');
    expectedSessionId = String(expectedSessionId || '');
    if (expectedSessionId && session.sessionId !== expectedSessionId) {
      throw runtimeError('WALLPAPER_ENGINE_SESSION_MISMATCH');
    }
    this._stopSessionPointerRelay(session);
    this._stopSessionDwmSurface(session);

    const generation = this.generation;
    const sessionId = session.sessionId;
    const locationTitle = session.locationTitle;
    const refreshToken = (Number(session.sourceRefreshToken) || 0) + 1;
    session.sourceRefreshToken = refreshToken;
    const runtimeOptions = safeRuntimeOptions({
      ...options,
      sourceTimeoutMs: options.sourceTimeoutMs == null
        ? (options.timeoutMs == null ? DEFAULT_REFRESH_SOURCE_TIMEOUT_MS : options.timeoutMs)
        : options.sourceTimeoutMs,
      sourcePollMs: options.sourcePollMs == null
        ? (options.pollIntervalMs == null
          ? (options.pollMs == null ? DEFAULT_REFRESH_SOURCE_POLL_MS : options.pollMs)
          : options.pollIntervalMs)
        : options.sourcePollMs,
    });
    const isCurrent = () => this.active === session
      && session.sessionId === sessionId
      && session.sourceRefreshToken === refreshToken;

    const captureSource = await this._findWindowSource(
      locationTitle,
      generation,
      runtimeOptions,
      {
        exactTitleOnly: true,
        returnSource: true,
        isCurrent,
        supersededCode: 'WALLPAPER_ENGINE_REFRESH_SUPERSEDED',
      }
    );
    if (generation !== this.generation || this.disposed || !isCurrent()) {
      throw runtimeError('WALLPAPER_ENGINE_REFRESH_SUPERSEDED');
    }
    const refreshedSourceId = String(captureSource && captureSource.id || '');
    const previousHandle = (/^window:(\d+):\d+$/.exec(String(session.sourceId || '')) || [])[1] || '';
    const refreshedHandle = (/^window:(\d+):\d+$/.exec(refreshedSourceId) || [])[1] || '';
    const sameWindow = !!previousHandle && previousHandle === refreshedHandle;
    session.sourceId = refreshedSourceId;
    session.windowSourceId = refreshedSourceId;
    if (!sameWindow) {
      session.windowEmbedding = null;
      session.windowParking = null;
    }
    session.captureAttached = false;
    const result = this._publicSession(session);
    if (options.includeSource === true) result.captureSource = captureSource;
    return result;
  }

  async embedActiveWindow(expectedSessionId = '', host = {}) {
    const session = this.active;
    if (!session) throw runtimeError('WALLPAPER_ENGINE_NOT_ACTIVE');
    expectedSessionId = String(expectedSessionId || '');
    if (expectedSessionId && session.sessionId !== expectedSessionId) {
      throw runtimeError('WALLPAPER_ENGINE_SESSION_MISMATCH');
    }
    if (session.embedPromise) return session.embedPromise;
    const generation = this.generation;
    const operation = (async () => {
      let embedding = await this._controlSessionWindow('embed', session, String(session.sourceId || ''), host);
      for (let attempt = 0; attempt < 3 && embedding.aligned !== true; attempt += 1) {
        const hostWidth = Math.max(1, Number(embedding.hostRight) - Number(embedding.hostLeft));
        const hostHeight = Math.max(1, Number(embedding.hostBottom) - Number(embedding.hostTop));
        const sourceWidth = Math.max(1, Number(embedding.right) - Number(embedding.left));
        const sourceHeight = Math.max(1, Number(embedding.bottom) - Number(embedding.top));
        const scaleX = Math.max(0.5, Math.min(4, Number(session.width) / hostWidth));
        const scaleY = Math.max(0.5, Math.min(4, Number(session.height) / hostHeight));
        const correctedWidth = Math.round(Number(session.launchWidth) - (sourceWidth - hostWidth) * scaleX);
        const correctedHeight = Math.round(Number(session.launchHeight) - (sourceHeight - hostHeight) * scaleY);
        const correctedX = Math.round(Number(session.launchX) + (Number(embedding.hostLeft) - Number(embedding.left)) * scaleX);
        const correctedY = Math.round(Number(session.launchY) + (Number(embedding.hostTop) - Number(embedding.top)) * scaleY);
        if (correctedWidth === session.launchWidth
          && correctedHeight === session.launchHeight
          && correctedX === session.launchX
          && correctedY === session.launchY) break;
        await this._relaunchSessionWindow(session, correctedWidth, correctedHeight, correctedX, correctedY);
        embedding = await this._controlSessionWindow('embed', session, String(session.sourceId || ''), host);
      }
      if (embedding.aligned !== true) throw runtimeError('WALLPAPER_ENGINE_WINDOW_ISOLATION_FAILED');
      if (generation !== this.generation || this.disposed || this.active !== session || session.stopping === true) {
        throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
      }
      session.parallaxPointerHostWindowId = String(host.hostWindowId || '');
      session.parallaxPointerHostExecutable = String(host.hostExecutable || '');
      session.dwmSurfaceHostWindowId = String(host.hostWindowId || '');
      session.dwmSurfaceHostExecutable = String(host.hostExecutable || '');
      session.dwmSurfaceHostCornerRadius = clampInteger(host.cornerRadius, 0, 512, 0);
      session.dwmSurfaceDesktopIconLayering = host.desktopIconLayering === true;
      session.captureAttached = true;
      return this._publicSession(session);
    })();
    session.embedPromise = operation;
    try {
      return await operation;
    } finally {
      if (session.embedPromise === operation) session.embedPromise = null;
    }
  }

  async parkActiveWindow(expectedSessionId = '') {
    const session = this.active;
    if (!session) throw runtimeError('WALLPAPER_ENGINE_NOT_ACTIVE');
    expectedSessionId = String(expectedSessionId || '');
    if (expectedSessionId && session.sessionId !== expectedSessionId) {
      throw runtimeError('WALLPAPER_ENGINE_SESSION_MISMATCH');
    }
    if (session.windowParking && session.windowParking.parked === true) {
      return this._publicSession(session);
    }
    if (session.parkPromise) return session.parkPromise;
    const generation = this.generation;
    const operation = (async () => {
      const parking = await this._controlSessionWindow('park', session, String(session.sourceId || ''));
      if (generation !== this.generation || this.disposed || this.active !== session || session.stopping === true) {
        throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
      }
      if (!parking || parking.parked !== true) throw runtimeError('WALLPAPER_ENGINE_WINDOW_ISOLATION_FAILED');
      return this._publicSession(session);
    })();
    session.parkPromise = operation;
    try {
      return await operation;
    } finally {
      if (session.parkPromise === operation) session.parkPromise = null;
    }
  }

  async _closeSession(session) {
    if (!session) return false;
    if (!session.executable || !session.locationTitle) {
      this._stopSessionPointerRelay(session);
      this._stopSessionDwmSurface(session);
      await this._waitForSessionDwmSurfaceStop(session);
      this._clearSessionMuteReassertions(session);
      if (!session.launched) await this._cleanupStagedProject(session);
      return false;
    }
    if (session.closePromise) return session.closePromise;
    const operation = (async () => {
      if (session.initialOpenPromise) {
        try { await session.initialOpenPromise; } catch (_) { }
      }
      if (!session.launched) {
        this._stopSessionPointerRelay(session);
        this._stopSessionDwmSurface(session);
        await this._waitForSessionDwmSurfaceStop(session);
        this._clearSessionMuteReassertions(session);
        await this._cleanupStagedProject(session);
        return false;
      }
      let closeRequested = false;
      const sourceId = String(session.windowSourceId || session.sourceId || '');
      let windowClosed = false;
      try {
        await this._spawnControl(session.executable, [
          '-control',
          'closeWallpaper',
          '-location',
          session.locationTitle,
        ]);
        closeRequested = true;
      } catch (_) { }
      if (sourceId) {
        try {
          const fallback = await this._controlSessionWindow('close', session, sourceId);
          windowClosed = !!(fallback && (fallback.closed === true || fallback.missing === true));
        } catch (_) { }
      }
      await this.nativeSleep(180);
      if (!windowClosed && closeRequested && !sourceId && this.desktopCapturer
        && typeof this.desktopCapturer.getSources === 'function') {
        try {
          const sources = await this.desktopCapturer.getSources({
            types: ['window'],
            thumbnailSize: { width: 0, height: 0 },
            fetchWindowIcons: false,
          });
          windowClosed = !sources.some((source) => String(source && source.name || '') === session.locationTitle);
        } catch (_) { }
      }
      if (!windowClosed) return false;
      this._stopSessionPointerRelay(session);
      this._stopSessionDwmSurface(session);
      await this._waitForSessionDwmSurfaceStop(session);
      this._clearSessionMuteReassertions(session);
      session.windowSourceId = '';
      session.sourceId = '';
      session.windowEmbedding = null;
      session.windowParking = null;
      session.captureAttached = false;
      session.launched = false;
      await this._cleanupStagedProject(session);
      return true;
    })();
    session.closePromise = operation;
    try {
      return await operation;
    } finally {
      if (session.closePromise === operation) session.closePromise = null;
    }
  }

  async start(id, options = {}) {
    if (id && typeof id === 'object') {
      options = id;
      id = options.id;
    }
    if (this.disposed) throw runtimeError('WALLPAPER_ENGINE_RUNTIME_DISPOSED');
    if (!this.library || typeof this.library.getNativeSceneTarget !== 'function') {
      throw runtimeError('WALLPAPER_ENGINE_LIBRARY_UNAVAILABLE');
    }

    const generation = ++this.generation;
    const runtimeOptions = safeRuntimeOptions(options);
    const sessionId = crypto.randomBytes(12).toString('hex');
    const session = {
      id: String(id || '').toLowerCase(),
      sessionId,
      locationTitle: `Mineradio Wallpaper ${sessionId}`,
      sourceId: '',
      windowSourceId: '',
      windowEmbedding: null,
      windowParking: null,
      width: runtimeOptions.width,
      height: runtimeOptions.height,
      fps: runtimeOptions.fps,
      executable: '',
      launched: false,
      initialOpenIssued: false,
      initialOpenPromise: null,
      sourceRefreshToken: 0,
      audioMuted: false,
      audioPropertySuppressed: false,
      captureAttached: false,
      launchFile: '',
      stagedProjectRoot: '',
      stagedProjectBaseRoot: '',
      stagedProjectFile: '',
      stagedAudioPropertyCount: 0,
      patchedSceneAudioObjectCount: 0,
      mutedScenePackageCacheFile: '',
      launchWidth: runtimeOptions.width,
      launchHeight: runtimeOptions.height,
      launchX: runtimeOptions.x,
      launchY: runtimeOptions.y,
      runtimeOptions,
      muteProperties: sanitizeMuteProperties(null),
      muteReassertTimers: new Set(),
      audioMuteCommandCount: 0,
      audioMuteLastAt: 0,
      muteApplyPromise: null,
      embedPromise: null,
      parkPromise: null,
      dwmSurfaceHostWindowId: '',
      dwmSurfaceHostExecutable: '',
      dwmSurfaceHostCornerRadius: 0,
      dwmSurfaceDesktopIconLayering: false,
      dwmSurfaceProcess: null,
      dwmSurfaceStartPromise: null,
      dwmSurfaceReady: false,
      dwmSurfaceActive: false,
      dwmSurfaceHelperPid: 0,
      dwmSurfaceWindowId: 0,
      dwmSurfaceRetryTimer: null,
      dwmDesktopIconLayering: false,
      dwmDesktopIconLayeringAckToken: 0,
      dwmVisualOpacity: 1,
      dwmVisualPositionX: 0,
      dwmVisualPositionY: 0,
      dwmVisualScale: 1.08,
      dwmGlassSurfaceReady: false,
      dwmGlassSurfaceActive: false,
      dwmGlassSurfaceWindowId: 0,
      dwmGlassSurfaceGeometry: null,
      dwmGlassSurfaceGeometryKey: '',
      parallaxPointerHostWindowId: '',
      parallaxPointerHostExecutable: '',
      parallaxPointerRelayProcess: null,
      parallaxPointerRelayStartPromise: null,
      parallaxPointerRelayReady: false,
      parallaxPointerRelayActive: false,
      parallaxPointerRelayHelperPid: 0,
      parallaxPointerRelayTargetWindowId: 0,
      parallaxPointerRelayTargetClass: '',
      parallaxPointerRelayTargetTitle: '',
      parallaxPointerRelayQueued: 0,
      parallaxPointerRelayCoalesced: 0,
      parallaxPointerRelayPosted: 0,
      parallaxPointerRelayPending: false,
      parallaxPointerRelayTimer: null,
      parallaxPointerRelayLastPostedAt: 0,
      parallaxPointerRelayBackpressured: false,
      parallaxPointerRelayDrainListener: null,
      parallaxPointerRelayRetryTimers: new Set(),
      parallaxPointerRelayRetryPromise: null,
      parallaxPointerRelayRetryResolve: null,
      parallaxPointerRelayLatestX: null,
      parallaxPointerRelayLatestY: null,
      closePromise: null,
      stopping: false,
    };
    this.pending = session;
    let startStage = 'discover-target';

    try {
      const [installation, target] = await Promise.all([
        this._discoverExecutable(false),
        this.library.getNativeSceneTarget(session.id),
      ]);
      if (generation !== this.generation || this.disposed) throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
      if (!installation.available || !installation.executable) {
        throw runtimeError(installation.reason || 'WALLPAPER_ENGINE_NOT_INSTALLED');
      }
      const projectFile = target && target.projectFile;
      const scenePackage = target && target.scenePackage;
      const projectStat = projectFile && path.isAbsolute(projectFile) && path.extname(projectFile).toLowerCase() === '.json'
        ? await statFile(projectFile)
        : null;
      const sceneExtension = path.extname(String(scenePackage || '')).toLowerCase();
      const targetStat = scenePackage && path.isAbsolute(scenePackage) && (sceneExtension === '.pkg' || sceneExtension === '.pak')
        ? await statFile(scenePackage)
        : null;
      if (!targetStat || !target || String(target.id || '').toLowerCase() !== session.id) {
        throw runtimeError('WALLPAPER_SCENE_PACKAGE_INVALID');
      }
      if (generation !== this.generation || this.disposed) throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');

      startStage = 'ensure-engine-ready';
      session.executable = await this._ensureEngineReady(installation.executable);
      if (generation !== this.generation || this.disposed || this.pending !== session) {
        throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
      }
      session.muteProperties = sanitizeMuteProperties(target && target.muteProperties);
      startStage = 'prepare-silent-project';
      session.launchFile = projectStat
        ? await this._prepareSilentLaunchFile(session, projectFile, scenePackage)
        : scenePackage;
      const previous = this.active;
      if (previous && previous.sessionId !== session.sessionId) {
        startStage = 'close-previous-window';
        const stoppedPrevious = await this.stop(previous.sessionId);
        if (!stoppedPrevious || stoppedPrevious.stopped !== true) {
          throw runtimeError(stoppedPrevious && stoppedPrevious.reason || 'WALLPAPER_ENGINE_WINDOW_CLOSE_FAILED');
        }
        if (generation !== this.generation || this.disposed || this.pending !== session) {
          throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
        }
      }
      startStage = 'open-initial-window';
      await this._openInitialSessionWindow(session, generation);
      if (generation !== this.generation || this.disposed) throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
      let earlyMuteError = null;
      const earlyMutePromise = this._muteSession(session, session.muteProperties)
        .then(() => true)
        .catch((error) => {
          earlyMuteError = error;
          return false;
        });
      startStage = 'find-initial-source';
      const captureSource = await this._findWindowSource(
        session.locationTitle,
        generation,
        runtimeOptions,
        {
          exactTitleOnly: true,
          returnSource: true,
          isCurrent: () => this.pending === session,
        }
      );
      if (generation !== this.generation || this.disposed) throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
      session.sourceId = String(captureSource && captureSource.id || '');
      session.windowSourceId = session.sourceId;
      startStage = 'apply-location-audio-properties';
      const mutedBeforeCapture = await earlyMutePromise;
      if (!mutedBeforeCapture) {
        if (generation !== this.generation || this.disposed || this.pending !== session) {
          throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
        }
        await this._muteSession(session, target && target.muteProperties).catch(() => { throw earlyMuteError; });
      }
      if (generation !== this.generation || this.disposed || this.pending !== session) {
        throw runtimeError('WALLPAPER_ENGINE_START_SUPERSEDED');
      }

      this.active = session;
      if (this.pending === session) this.pending = null;
      return this._publicSession(session);
    } catch (error) {
      console.warn(`[Wallpaper Engine] native Scene start failed at ${startStage}:`, error && (error.code || error.message) || error);
      if (this.pending === session) this.pending = null;
      if (session.launched && (!this.active || this.active.sessionId !== session.sessionId)) {
        await this._closeSession(session);
      } else if (!session.launched) {
        await this._cleanupStagedProject(session);
      }
      if (error && error.code) throw error;
      throw runtimeError('WALLPAPER_ENGINE_START_FAILED');
    }
  }

  async stop(expectedSessionId = '') {
    if (expectedSessionId && typeof expectedSessionId === 'object') {
      expectedSessionId = expectedSessionId.sessionId || '';
    }
    expectedSessionId = String(expectedSessionId || '');
    const matchesPending = !!(this.pending && this.pending.sessionId === expectedSessionId);
    const matchesActive = !!(this.active && this.active.sessionId === expectedSessionId);
    if (expectedSessionId && !matchesPending && !matchesActive) {
      return { ok: true, stopped: false, reason: 'WALLPAPER_ENGINE_SESSION_MISMATCH' };
    }

    const sessions = [];
    if (expectedSessionId) {
      if (matchesPending) {
        sessions.push(this.pending);
      }
      if (matchesActive) {
        if (!sessions.length || sessions[0].sessionId !== this.active.sessionId) sessions.push(this.active);
      }
    } else {
      if (this.pending) sessions.push(this.pending);
      if (this.active && (!this.pending || this.active.sessionId !== this.pending.sessionId)) sessions.push(this.active);
    }
    if (!sessions.length) return { ok: true, stopped: false, active: !!this.active, sessionId: this.active ? this.active.sessionId : '' };
    // A targeted stop of the old active session must not supersede a newer
    // pending start. The per-session stopping flag is enough to cancel any
    // relaunch work for that active session. Pending/global cancellation still
    // advances the generation so their startup work cannot escape later.
    if (!expectedSessionId || matchesPending) this.generation += 1;
    for (const session of sessions) session.stopping = true;
    let allStopped = true;
    for (const session of sessions) {
      const closed = await this._closeSession(session);
      const safelyCancelled = !session.launched && !session.initialOpenPromise;
      if (closed || safelyCancelled) {
        if (this.pending === session) this.pending = null;
        if (this.active === session) this.active = null;
      } else {
        allStopped = false;
        session.stopping = false;
        if (this.active === session) {
          this._scheduleSessionMuteReassertions(session);
          if (session.windowEmbedding && session.windowEmbedding.aligned === true
            && (session.dwmSurfaceReady !== true || !session.dwmSurfaceProcess)) {
            this._scheduleSessionDwmSurfaceRetry(session);
          }
        }
      }
    }
    return {
      ok: true,
      stopped: allStopped,
      active: !!this.active,
      sessionId: this.active ? this.active.sessionId : '',
      reason: allStopped ? '' : 'WALLPAPER_ENGINE_WINDOW_CLOSE_FAILED',
    };
  }

  async dispose() {
    if (this.disposed) {
      return {
        ok: !this.active && !this.pending,
        stopped: !this.active && !this.pending,
        active: !!this.active,
        sessionId: this.active ? this.active.sessionId : '',
        reason: this.active || this.pending ? 'WALLPAPER_ENGINE_WINDOW_CLOSE_FAILED' : '',
      };
    }
    this.disposed = true;
    const isClean = () => !this.active && !this.pending;
    let result = await this.stop();
    if ((!result || result.stopped !== true) && !isClean()) {
      await this.nativeSleep(180);
      result = await this.stop();
    }
    if ((!result || result.stopped !== true) && !isClean()) {
      const leftovers = [];
      if (this.pending) leftovers.push(this.pending);
      if (this.active && (!this.pending || this.active.sessionId !== this.pending.sessionId)) leftovers.push(this.active);
      for (const session of leftovers) {
        this._stopSessionPointerRelay(session);
        this._stopSessionDwmSurface(session);
        await this._waitForSessionDwmSurfaceStop(session);
        this._clearSessionMuteReassertions(session);
      }
      result = {
        ok: false,
        stopped: false,
        active: !!this.active,
        sessionId: this.active ? this.active.sessionId : '',
        reason: 'WALLPAPER_ENGINE_WINDOW_CLOSE_FAILED',
      };
    } else {
      result = {
        ...(result || {}),
        ok: true,
        stopped: true,
        active: false,
        sessionId: '',
        reason: '',
      };
    }
    this.signatureCache.clear();
    this.executableCache = null;
    return result;
  }
}

module.exports = {
  WallpaperEngineRuntime,
  safeRuntimeOptions,
  readWallpaperPackageScene,
  forceSceneAudioSilent,
  nativeDwmThumbnailSurfaceScript,
};
