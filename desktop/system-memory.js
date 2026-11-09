'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const isWin = process.platform === 'win32';
const SYSTEM_PURGE_AVAILABLE = isWin && process.env.MINERADIO_DISABLE_SYSTEM_MEMORY_PURGE !== '1';
const SYSTEM_PURGE_ENABLED = SYSTEM_PURGE_AVAILABLE && process.env.MINERADIO_DISABLE_AUTOMATIC_SYSTEM_MEMORY_PURGE !== '1';

const MEMORY_MASK = {
  workingSet: 1,
  modifiedList: 4,
  standbyList: 8,
  standbyLow: 16,
};

const MEMORY_MASK_DEFAULT = MEMORY_MASK.workingSet | MEMORY_MASK.modifiedList | MEMORY_MASK.standbyList | MEMORY_MASK.standbyLow;

const MEMORY_CMD = {
  emptyWorkingSets: 2,
  flushModifiedList: 3,
  purgeStandbyList: 4,
  purgeStandbyLow: 5,
};

const STATUS_SUCCESS = 0;
const STATUS_ACCESS_DENIED = -1073741790;
const STATUS_PRIVILEGE_NOT_HELD = -1073741718;

const NATIVE_TYPE_BLOCK = [
  'Add-Type @\'',
  'using System;',
  'using System.Runtime.InteropServices;',
  'public struct MEMORYSTATUSEX {',
  '  public uint dwLength; public uint dwMemoryLoad; public ulong ullTotalPhys; public ulong ullAvailPhys;',
  '  public ulong ullTotalPageFile; public ulong ullAvailPageFile; public ulong ullTotalVirtual; public ulong ullAvailVirtual; public ulong ullAvailExtendedVirtual;',
  '}',
  '[StructLayout(LayoutKind.Sequential)]',
  'public struct SYSTEM_FILECACHE_INFORMATION {',
  '  public IntPtr CurrentSize; public IntPtr PeakSize; public uint PageFaultCount;',
  '  public IntPtr MinimumWorkingSet; public IntPtr MaximumWorkingSet;',
  '  public IntPtr CurrentSizeIncludingTransitionInPages; public IntPtr PeakSizeIncludingTransitionInPages;',
  '  public uint TransitionRePurposeCount; public uint Flags;',
  '}',
  'public static class MineradioMemNative {',
  '  const int SystemMemoryListInformation = 0x50;',
  '  const int SystemFileCacheInformationEx = 0x51;',
  '  const uint SE_PRIVILEGE_ENABLED = 2;',
  '  const int TOKEN_ADJUST_PRIVILEGES = 0x0020;',
  '  const int TOKEN_QUERY = 0x0008;',
  '  [StructLayout(LayoutKind.Sequential)] struct LUID { public uint LowPart; public int HighPart; }',
  '  [StructLayout(LayoutKind.Sequential)] struct TOKEN_PRIVILEGES { public uint PrivilegeCount; public LUID Luid; public uint Attributes; }',
  '  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr h, int access, out IntPtr token);',
  '  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool LookupPrivilegeValue(string sys, string name, out LUID luid);',
  '  [DllImport("advapi32.dll", SetLastError=true)] static extern bool AdjustTokenPrivileges(IntPtr token, bool disableAll, ref TOKEN_PRIVILEGES tp, int len, IntPtr prev, IntPtr retLen);',
  '  [DllImport("ntdll.dll")] static extern int NtSetSystemInformation(int cls, IntPtr info, int len);',
  '  [DllImport("kernel32.dll")] static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);',
  '  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();',
  '  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);',
  '  [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr token, int cls, ref int info, int len, out int ret);',
  '  static bool EnablePrivilege(string name) {',
  '    IntPtr token;',
  '    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, out token)) return false;',
  '    try {',
  '      LUID luid;',
  '      if (!LookupPrivilegeValue(null, name, out luid)) return false;',
  '      TOKEN_PRIVILEGES tp = new TOKEN_PRIVILEGES();',
  '      tp.PrivilegeCount = 1; tp.Luid = luid; tp.Attributes = SE_PRIVILEGE_ENABLED;',
  '      AdjustTokenPrivileges(token, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);',
  '      return Marshal.GetLastWin32Error() == 0;',
  '    } finally { CloseHandle(token); }',
  '  }',
  '  public static void PreparePrivileges() {',
  '    EnablePrivilege("SeProfileSingleProcessPrivilege");',
  '    EnablePrivilege("SeIncreaseQuotaPrivilege");',
  '  }',
  '  public static int PurgeList(int cmd) {',
  '    IntPtr p = Marshal.AllocHGlobal(4);',
  '    try { Marshal.WriteInt32(p, cmd); return NtSetSystemInformation(SystemMemoryListInformation, p, 4); }',
  '    finally { Marshal.FreeHGlobal(p); }',
  '  }',
  '  public static int FlushSystemFileCache() {',
  '    SYSTEM_FILECACHE_INFORMATION f = new SYSTEM_FILECACHE_INFORMATION();',
  '    f.MinimumWorkingSet = (IntPtr)(-1); f.MaximumWorkingSet = (IntPtr)(-1);',
  '    int size = Marshal.SizeOf(typeof(SYSTEM_FILECACHE_INFORMATION));',
  '    IntPtr p = Marshal.AllocHGlobal(size);',
  '    try { Marshal.StructureToPtr(f, p, false); return NtSetSystemInformation(SystemFileCacheInformationEx, p, size); }',
  '    finally { Marshal.FreeHGlobal(p); }',
  '  }',
  '  public static ulong GetAvailPhys() {',
  '    MEMORYSTATUSEX s = new MEMORYSTATUSEX(); s.dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));',
  '    GlobalMemoryStatusEx(ref s); return s.ullAvailPhys;',
  '  }',
  '  public static uint GetMemoryLoad() {',
  '    MEMORYSTATUSEX s = new MEMORYSTATUSEX(); s.dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));',
  '    GlobalMemoryStatusEx(ref s); return s.dwMemoryLoad;',
  '  }',
  '  public static ulong GetTotalPhys() {',
  '    MEMORYSTATUSEX s = new MEMORYSTATUSEX(); s.dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));',
  '    GlobalMemoryStatusEx(ref s); return s.ullTotalPhys;',
  '  }',
  '  public static ulong GetUsedPhys() {',
  '    MEMORYSTATUSEX s = new MEMORYSTATUSEX(); s.dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));',
  '    GlobalMemoryStatusEx(ref s);',
  '    return s.ullTotalPhys > s.ullAvailPhys ? s.ullTotalPhys - s.ullAvailPhys : 0;',
  '  }',
  '  public static bool IsTokenElevated() {',
  '    IntPtr token;',
  '    if (!OpenProcessToken(GetCurrentProcess(), 0x0008, out token)) return false;',
  '    try {',
  '      int elev = 0, ret = 0;',
  '      if (!GetTokenInformation(token, 20, ref elev, 4, out ret)) return false;',
  '      return elev != 0;',
  '    } finally { CloseHandle(token); }',
  '  }',
  '}',
  '\'@',
].join('\r\n');

let extendedCache = { at: 0, data: null };
let nativeTempPath = '';

function defaultNativeTempPath() {
  const configured = String(process.env.MINERADIO_NATIVE_TEMP_DIR || '').trim();
  if (configured) return path.resolve(configured);
  const localRoot = String(process.env.LOCALAPPDATA || process.env.APPDATA || os.tmpdir()).trim();
  return path.join(localRoot, 'Mineradio', 'native-helper-temp');
}

function setNativeTempPath(value) {
  const candidate = String(value || '').trim();
  nativeTempPath = candidate ? path.resolve(candidate) : defaultNativeTempPath();
  fs.mkdirSync(nativeTempPath, { recursive: true });
  return nativeTempPath;
}

function ensureNativeTempPath() {
  if (!nativeTempPath) nativeTempPath = defaultNativeTempPath();
  fs.mkdirSync(nativeTempPath, { recursive: true });
  return nativeTempPath;
}

function getMemorySnapshot() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total > free ? total - free : 0;
  const usage = process.memoryUsage();
  return {
    platform: process.platform,
    totalBytes: total,
    freeBytes: free,
    usedBytes: used,
    totalMB: Math.round(total / 1048576),
    freeMB: Math.round(free / 1048576),
    usedMB: Math.round(used / 1048576),
    usedPercent: total > 0 ? Math.round(used * 100 / total) : 0,
    process: {
      rssMB: Math.round(usage.rss / 1048576),
      heapMB: Math.round(usage.heapUsed / 1048576),
    },
  };
}

function normalizeMask(mask) {
  let value = Number(mask);
  if (!Number.isFinite(value) || value <= 0) value = MEMORY_MASK_DEFAULT;
  return value & MEMORY_MASK_DEFAULT;
}

function maskNeedsAdmin(mask) {
  return (normalizeMask(mask) & MEMORY_MASK_DEFAULT) !== 0;
}

function makeTempPath(label, ext) {
  return path.join(ensureNativeTempPath(), 'mineradio-' + label + '-' + process.pid + '-' + Date.now() + '.' + ext);
}

function safeUnlink(filePath) {
  try { if (filePath) fs.unlinkSync(filePath); } catch (e) {}
}

function writeTempScript(label, lines) {
  const scriptPath = makeTempPath(label, 'ps1');
  const content = Array.isArray(lines) ? lines.join('\r\n') : String(lines || '');
  fs.writeFileSync(scriptPath, content, 'utf8');
  return scriptPath;
}

function escapePowerShellLiteral(value) {
  return String(value || '').replace(/'/g, "''");
}

function runPowerShellFile(scriptPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      windowsHide: true,
      timeout: timeoutMs || 60000,
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        TEMP: ensureNativeTempPath(),
        TMP: ensureNativeTempPath(),
        MINERADIO_NATIVE_TEMP_DIR: ensureNativeTempPath(),
      },
    }, (error, stdout, stderr) => {
      const text = String(stdout || '').replace(/^\uFEFF/, '').trim();
      if (text) {
        try {
          resolve(JSON.parse(text));
          return;
        } catch (parseError) {
          if (!error) {
            reject(new Error('invalid powershell json: ' + text.slice(0, 320)));
            return;
          }
        }
      }
      if (error) {
        reject(new Error(String(stderr || error.message || 'powershell failed')));
        return;
      }
      resolve(null);
    });
  });
}

function buildPurgeScript(mask, resultPath) {
  const m = normalizeMask(mask);
  const lines = [
    NATIVE_TYPE_BLOCK,
    '[MineradioMemNative]::PreparePrivileges() | Out-Null',
    '$mask = ' + m,
    '$before = [MineradioMemNative]::GetUsedPhys()',
    '$loadBefore = [MineradioMemNative]::GetMemoryLoad()',
    '$steps = @()',
  ];

  if ((m & MEMORY_MASK.workingSet) !== 0) {
    lines.push('$steps += @{ id="workingSet"; status=[MineradioMemNative]::PurgeList(' + MEMORY_CMD.emptyWorkingSets + ') }');
    lines.push('$steps += @{ id="systemFileCache"; status=[MineradioMemNative]::FlushSystemFileCache() }');
  }
  if ((m & MEMORY_MASK.modifiedList) !== 0) {
    lines.push('$steps += @{ id="modifiedList"; status=[MineradioMemNative]::PurgeList(' + MEMORY_CMD.flushModifiedList + ') }');
  }
  if ((m & MEMORY_MASK.standbyList) !== 0) {
    lines.push('$steps += @{ id="standbyList"; status=[MineradioMemNative]::PurgeList(' + MEMORY_CMD.purgeStandbyList + ') }');
  }
  if ((m & MEMORY_MASK.standbyLow) !== 0) {
    lines.push('$steps += @{ id="standbyLow"; status=[MineradioMemNative]::PurgeList(' + MEMORY_CMD.purgeStandbyLow + ') }');
  }

  lines.push('$after = [MineradioMemNative]::GetUsedPhys()');
  lines.push('$loadAfter = [MineradioMemNative]::GetMemoryLoad()');
  lines.push('$obj = @{ ok=$true; beforeBytes=$before; afterBytes=$after; freedBytes=($before-$after); loadBefore=$loadBefore; loadAfter=$loadAfter; steps=$steps }');
  lines.push('$json = $obj | ConvertTo-Json -Compress -Depth 5');
  if (resultPath) {
    lines.push("Set-Content -LiteralPath '" + escapePowerShellLiteral(resultPath) + "' -Value $json -Encoding UTF8");
  } else {
    lines.push('Write-Output $json');
  }
  return lines.join('\r\n');
}

function stepNeedsAdmin(step) {
  const id = step && step.id;
  return id === 'workingSet' || id === 'systemFileCache' || id === 'modifiedList' || id === 'standbyList' || id === 'standbyLow';
}

function parsePurgeResult(data) {
  data = data || {};
  const steps = Array.isArray(data.steps) ? data.steps : (data.steps ? [data.steps] : []);
  const freedBytes = Number(data.freedBytes || 0);
  const denied = steps.some((step) => {
    const status = Number(step && step.status);
    return status === STATUS_ACCESS_DENIED || status === STATUS_PRIVILEGE_NOT_HELD;
  });
  const succeeded = steps.some((step) => Number(step && step.status) === STATUS_SUCCESS);
  if (denied && !succeeded && freedBytes <= 0) {
    return { ok: false, needAdmin: true, message: 'Need administrator permission for full system memory purge.', steps };
  }
  if (freedBytes > 0 || succeeded) {
    const failedSteps = steps.filter((step) => Number(step && step.status) !== STATUS_SUCCESS);
    const partial = failedSteps.length > 0;
    return {
      ok: true,
      beforeMB: Math.round(Number(data.beforeBytes || 0) / 1048576),
      afterMB: Math.round(Number(data.afterBytes || 0) / 1048576),
      freedMB: Math.max(0, Math.round(freedBytes / 1048576)),
      loadBefore: Number(data.loadBefore || 0),
      loadAfter: Number(data.loadAfter || 0),
      steps,
      partial,
      needAdmin: partial && failedSteps.some(stepNeedsAdmin),
      message: partial ? 'Partial purge completed; full result requires administrator permission.' : '',
    };
  }
  if (steps.length) {
    const codes = steps.map((step) => Number(step && step.status)).filter((n) => Number.isFinite(n)).join(', ');
    return { ok: false, needAdmin: maskNeedsAdmin(MEMORY_MASK_DEFAULT), message: 'System memory API failed: ' + (codes || 'unknown'), steps };
  }
  return { ok: false, message: 'No system memory purge result was returned.' };
}

function readJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim();
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function probeProcessElevation() {
  if (!isWin) return Promise.resolve(false);
  const scriptPath = writeTempScript('elev-check', [
    NATIVE_TYPE_BLOCK,
    'Write-Output ([MineradioMemNative]::IsTokenElevated() | ConvertTo-Json -Compress)',
  ]);
  return runPowerShellFile(scriptPath, 10000).then((value) => {
    if (typeof value !== 'boolean') throw new Error('PROCESS_ELEVATION_PROBE_INVALID');
    return value;
  }).finally(() => safeUnlink(scriptPath));
}

function isProcessElevated() {
  return probeProcessElevation().catch(() => false);
}

function purgeSystemMemory(mask, options) {
  options = options || {};
  if (!SYSTEM_PURGE_AVAILABLE) {
    return Promise.resolve({
      ok: false,
      disabled: true,
      message: 'System memory purge is unavailable on this machine or disabled by environment.',
    });
  }
  if (!SYSTEM_PURGE_ENABLED && options.manual !== true) {
    return Promise.resolve({
      ok: false,
      disabled: true,
      message: 'Automatic system memory purge is disabled by default to avoid foreground CPU spikes.',
    });
  }
  if (!isWin) {
    return Promise.resolve({ ok: false, unsupported: true, message: 'System memory purge is Windows-only.' });
  }
  const scriptPath = writeTempScript('mem-purge', buildPurgeScript(mask, ''));
  return runPowerShellFile(scriptPath, 90000)
    .then(parsePurgeResult)
    .catch((error) => ({ ok: false, message: String(error && error.message || error || 'SYSTEM_MEMORY_PURGE_FAILED') }))
    .finally(() => safeUnlink(scriptPath));
}

function purgeSystemMemoryElevated(mask, options) {
  options = options || {};
  if (!SYSTEM_PURGE_AVAILABLE || (!SYSTEM_PURGE_ENABLED && options.manual !== true)) {
    return Promise.resolve({
      ok: false,
      disabled: true,
      needAdmin: false,
      message: 'Elevated memory purge is disabled by default; Mineradio will not open administrator PowerShell windows.',
    });
  }
  if (!isWin) {
    return Promise.resolve({ ok: false, unsupported: true, message: 'System memory purge is Windows-only.' });
  }
  const resultPath = makeTempPath('mem-result', 'json');
  const scriptPath = writeTempScript('mem-purge-elevated', [
    '#requires -RunAsAdministrator',
    buildPurgeScript(mask, resultPath),
  ].join('\r\n'));
  const launcherPath = writeTempScript('mem-launcher', [
    '$ErrorActionPreference = "Stop"',
    "$scriptPath = '" + escapePowerShellLiteral(scriptPath) + "'",
    "$resultPath = '" + escapePowerShellLiteral(resultPath) + "'",
    'Start-Process -FilePath powershell.exe -Verb RunAs -Wait -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-File",$scriptPath) | Out-Null',
    'if (Test-Path -LiteralPath $resultPath) { @{ ok=$true } | ConvertTo-Json -Compress } else { @{ ok=$false; needAdmin=$true; message="User cancelled or denied administrator permission." } | ConvertTo-Json -Compress }',
  ]);
  return runPowerShellFile(launcherPath, 120000).then((launcherResult) => {
    const data = readJsonFile(resultPath);
    if (data) return parsePurgeResult(data);
    if (launcherResult && launcherResult.needAdmin) return launcherResult;
    return { ok: false, needAdmin: true, message: 'User cancelled or denied administrator permission.' };
  }).catch((error) => {
    return { ok: false, needAdmin: true, message: String(error && error.message || error || 'ELEVATED_MEMORY_PURGE_FAILED') };
  }).finally(() => {
    safeUnlink(scriptPath);
    safeUnlink(launcherPath);
    safeUnlink(resultPath);
  });
}

async function purgeSystemMemorySmart(mask, options) {
  options = options || {};
  if (!SYSTEM_PURGE_AVAILABLE) return purgeSystemMemory(mask, options);
  if (!SYSTEM_PURGE_ENABLED && options.manual !== true) return purgeSystemMemory(mask, options);
  const autoElevate = options.autoElevate === true;
  const elevated = await isProcessElevated();
  if (autoElevate && !elevated) return purgeSystemMemoryElevated(mask, options);
  return purgeSystemMemory(mask, options);
}

function queryExtendedMemoryStats() {
  if (!isWin) return Promise.resolve(null);
  const now = Date.now();
  if (extendedCache.data && now - extendedCache.at < 8000) return Promise.resolve(extendedCache.data);
  const scriptPath = writeTempScript('mem-stats', [
    NATIVE_TYPE_BLOCK,
    '$total = [MineradioMemNative]::GetTotalPhys()',
    '$avail = [MineradioMemNative]::GetAvailPhys()',
    '$load = [MineradioMemNative]::GetMemoryLoad()',
    '$used = if ($total -gt $avail) { $total - $avail } else { 0 }',
    '@{ totalBytes=$total; freeBytes=$avail; usedBytes=$used; loadPercent=$load } | ConvertTo-Json -Compress',
  ]);
  return runPowerShellFile(scriptPath, 15000).then((data) => {
    if (!data) return null;
    const total = Number(data.totalBytes || 0);
    const free = Number(data.freeBytes || 0);
    const used = Number(data.usedBytes || 0);
    const snap = {
      totalMB: Math.round(total / 1048576),
      freeMB: Math.round(free / 1048576),
      usedMB: Math.round(used / 1048576),
      usedPercent: Number(data.loadPercent || 0) || (total > 0 ? Math.round(used * 100 / total) : 0),
      source: 'GlobalMemoryStatusEx',
    };
    extendedCache = { at: now, data: snap };
    return snap;
  }).catch(() => null).finally(() => safeUnlink(scriptPath));
}

async function getMemorySnapshotExtended() {
  const base = getMemorySnapshot();
  if (!isWin || !SYSTEM_PURGE_AVAILABLE) return base;
  const ext = await queryExtendedMemoryStats();
  if (!ext || !ext.totalMB) return base;
  return Object.assign({}, base, ext, {
    totalBytes: ext.totalMB * 1048576,
    freeBytes: ext.freeMB * 1048576,
    usedBytes: ext.usedMB * 1048576,
  });
}

function trimAppWorkingSets(pids) {
  if (!isWin) return Promise.resolve({ ok: true, trimmed: 0, unsupported: true, scope: 'app' });
  const list = Array.isArray(pids)
    ? pids.filter((pid) => Number.isFinite(Number(pid)) && Number(pid) > 0).map((pid) => Math.round(Number(pid)))
    : [];
  const pidLiteral = (list.length ? Array.from(new Set(list)) : [process.pid]).join(',');
  const scriptPath = writeTempScript('mem-trim', [
    'Add-Type @\'',
    'using System; using System.Runtime.InteropServices;',
    'public static class MineradioTrim {',
    '  [DllImport("psapi.dll")] public static extern bool EmptyWorkingSet(IntPtr h);',
    '  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(int a, bool i, int pid);',
    '  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);',
    '  public static int TrimMany(int[] pids) {',
    '    int n = 0; foreach (int pid in pids) {',
    '      IntPtr h = OpenProcess(0x0500, false, pid);',
    '      if (h == IntPtr.Zero) continue;',
    '      try { if (EmptyWorkingSet(h)) n++; } finally { CloseHandle(h); }',
    '    } return n; }',
    '}',
    '\'@',
    '$pids = @(' + pidLiteral + ')',
    '$trimmed = [MineradioTrim]::TrimMany([int[]]$pids)',
    'Write-Output (@{ ok=$true; trimmed=$trimmed; scope="app"; pids=$pids } | ConvertTo-Json -Compress)',
  ]);
  return runPowerShellFile(scriptPath, 20000)
    .then((data) => data || { ok: true, trimmed: 0, scope: 'app' })
    .catch((error) => ({ ok: false, error: String(error && error.message || error || 'APP_MEMORY_TRIM_FAILED'), scope: 'app' }))
    .finally(() => safeUnlink(scriptPath));
}

module.exports = {
  MEMORY_MASK,
  MEMORY_MASK_DEFAULT,
  MEMORY_CMD,
  SYSTEM_PURGE_AVAILABLE,
  SYSTEM_PURGE_ENABLED,
  setNativeTempPath,
  getMemorySnapshot,
  getMemorySnapshotExtended,
  normalizeMask,
  maskNeedsAdmin,
  probeProcessElevation,
  isProcessElevated,
  purgeSystemMemory,
  purgeSystemMemoryElevated,
  purgeSystemMemorySmart,
  trimAppWorkingSets,
};
