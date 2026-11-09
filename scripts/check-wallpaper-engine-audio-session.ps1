[CmdletBinding()]
param(
  [ValidateRange(1, 120)]
  [int]$DurationSeconds = 6,

  [ValidateRange(20, 5000)]
  [int]$IntervalMilliseconds = 100,

  [string[]]$ProcessName = @('wallpaper32', 'wallpaper64'),

  [int[]]$ProcessId = @(),

  [switch]$RequireSession,

  # Leave below zero to report only. A non-negative value makes excessive
  # endpoint output fail the check without changing any Windows audio state.
  [double]$MaxPeak = -1
)

$ErrorActionPreference = 'Stop'

# This probe is intentionally read-only. It never calls ISimpleAudioVolume
# setters, endpoint volume setters, Wallpaper Engine's global mute command, or
# any persisted Wallpaper Engine preference API.
$coreAudioSource = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Mineradio.CoreAudioReadOnly {
  enum EDataFlow { Render = 0, Capture = 1, All = 2 }
  enum AudioSessionState { Inactive = 0, Active = 1, Expired = 2 }

  [ComImport]
  [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  class MMDeviceEnumeratorComObject { }

  [ComImport]
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(EDataFlow dataFlow, uint stateMask, out IMMDeviceCollection devices);
    [PreserveSig] int GetDefaultAudioEndpoint(EDataFlow dataFlow, int role, out IMMDevice endpoint);
    [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
    [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
  }

  [ComImport]
  [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceCollection {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int Item(uint index, out IMMDevice device);
  }

  [ComImport]
  [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, uint classContext, IntPtr activationParameters, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
    [PreserveSig] int OpenPropertyStore(uint access, out IntPtr properties);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetState(out uint state);
  }

  [ComImport]
  [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    [PreserveSig] int GetAudioSessionControl(ref Guid sessionGuid, uint streamFlags, out IntPtr sessionControl);
    [PreserveSig] int GetSimpleAudioVolume(ref Guid sessionGuid, uint streamFlags, out IntPtr audioVolume);
    [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessionEnumerator);
    [PreserveSig] int RegisterSessionNotification(IntPtr notification);
    [PreserveSig] int UnregisterSessionNotification(IntPtr notification);
    [PreserveSig] int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionId, IntPtr notification);
    [PreserveSig] int UnregisterDuckNotification(IntPtr notification);
  }

  [ComImport]
  [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int GetSession(int index, out IAudioSessionControl session);
  }

  [ComImport]
  [Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl {
    [PreserveSig] int GetState(out AudioSessionState state);
    [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid eventContext);
    [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
    [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid eventContext);
    [PreserveSig] int GetGroupingParam(out Guid groupingId);
    [PreserveSig] int SetGroupingParam(ref Guid groupingId, ref Guid eventContext);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr notification);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr notification);
  }

  [ComImport]
  [Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 : IAudioSessionControl {
    [PreserveSig] new int GetState(out AudioSessionState state);
    [PreserveSig] new int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    [PreserveSig] new int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid eventContext);
    [PreserveSig] new int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
    [PreserveSig] new int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid eventContext);
    [PreserveSig] new int GetGroupingParam(out Guid groupingId);
    [PreserveSig] new int SetGroupingParam(ref Guid groupingId, ref Guid eventContext);
    [PreserveSig] new int RegisterAudioSessionNotification(IntPtr notification);
    [PreserveSig] new int UnregisterAudioSessionNotification(IntPtr notification);
    [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string sessionIdentifier);
    [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string sessionInstanceIdentifier);
    [PreserveSig] int GetProcessId(out uint processId);
    [PreserveSig] int IsSystemSoundsSession();
    [PreserveSig] int SetDuckingPreference([MarshalAs(UnmanagedType.Bool)] bool optOut);
  }

  [ComImport]
  [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    // Setter slots must remain in the COM vtable but are never invoked.
    [PreserveSig] int ReservedSetterSlot0(float level, ref Guid eventContext);
    [PreserveSig] int GetMasterVolume(out float level);
    [PreserveSig] int ReservedSetterSlot1([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid eventContext);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }

  [ComImport]
  [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioMeterInformation {
    [PreserveSig] int GetPeakValue(out float peak);
    [PreserveSig] int GetMeteringChannelCount(out uint channelCount);
    [PreserveSig] int GetChannelsPeakValues(uint channelCount, [Out, MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 0)] float[] peaks);
    [PreserveSig] int QueryHardwareSupport(out uint hardwareSupportMask);
  }

  public sealed class AudioSessionSnapshot {
    public string EndpointId { get; set; }
    public int ProcessId { get; set; }
    public string ProcessName { get; set; }
    public string ProcessPath { get; set; }
    public string State { get; set; }
    public string SessionIdentifier { get; set; }
    public string SessionInstanceIdentifier { get; set; }
    public float Volume { get; set; }
    public bool Muted { get; set; }
    public float Peak { get; set; }
  }

  public static class AudioSessionInspector {
    const uint DEVICE_STATE_ACTIVE = 0x00000001;
    const uint CLSCTX_ALL = 0x00000017;

    static void ThrowForHR(int result, string operation) {
      if (result < 0) Marshal.ThrowExceptionForHR(result, new IntPtr(-1));
    }

    public static AudioSessionSnapshot[] ReadAllRenderSessions() {
      var snapshots = new List<AudioSessionSnapshot>();
      var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
      IMMDeviceCollection devices = null;
      try {
        ThrowForHR(enumerator.EnumAudioEndpoints(EDataFlow.Render, DEVICE_STATE_ACTIVE, out devices), "EnumAudioEndpoints");
        uint deviceCount;
        ThrowForHR(devices.GetCount(out deviceCount), "IMMDeviceCollection.GetCount");
        for (uint deviceIndex = 0; deviceIndex < deviceCount; deviceIndex++) {
          IMMDevice device = null;
          object managerObject = null;
          IAudioSessionEnumerator sessions = null;
          try {
            ThrowForHR(devices.Item(deviceIndex, out device), "IMMDeviceCollection.Item");
            string endpointId;
            ThrowForHR(device.GetId(out endpointId), "IMMDevice.GetId");
            var managerId = typeof(IAudioSessionManager2).GUID;
            ThrowForHR(device.Activate(ref managerId, CLSCTX_ALL, IntPtr.Zero, out managerObject), "IMMDevice.Activate");
            var manager = (IAudioSessionManager2)managerObject;
            ThrowForHR(manager.GetSessionEnumerator(out sessions), "IAudioSessionManager2.GetSessionEnumerator");
            int sessionCount;
            ThrowForHR(sessions.GetCount(out sessionCount), "IAudioSessionEnumerator.GetCount");
            for (int sessionIndex = 0; sessionIndex < sessionCount; sessionIndex++) {
              IAudioSessionControl control = null;
              try {
                if (sessions.GetSession(sessionIndex, out control) < 0 || control == null) continue;
                var control2 = control as IAudioSessionControl2;
                var volume = control as ISimpleAudioVolume;
                var meter = control as IAudioMeterInformation;
                if (control2 == null || volume == null || meter == null) continue;
                uint rawProcessId;
                if (control2.GetProcessId(out rawProcessId) < 0 || rawProcessId == 0) continue;
                AudioSessionState state;
                control2.GetState(out state);
                float level = 0;
                bool muted = false;
                float peak = 0;
                volume.GetMasterVolume(out level);
                volume.GetMute(out muted);
                meter.GetPeakValue(out peak);
                string sessionIdentifier = "";
                string sessionInstanceIdentifier = "";
                control2.GetSessionIdentifier(out sessionIdentifier);
                control2.GetSessionInstanceIdentifier(out sessionInstanceIdentifier);
                string processName = "";
                string processPath = "";
                try {
                  using (var process = Process.GetProcessById((int)rawProcessId)) {
                    processName = process.ProcessName;
                    try { processPath = process.MainModule.FileName; } catch { }
                  }
                } catch { }
                snapshots.Add(new AudioSessionSnapshot {
                  EndpointId = endpointId ?? "",
                  ProcessId = (int)rawProcessId,
                  ProcessName = processName ?? "",
                  ProcessPath = processPath ?? "",
                  State = state.ToString(),
                  SessionIdentifier = sessionIdentifier ?? "",
                  SessionInstanceIdentifier = sessionInstanceIdentifier ?? "",
                  Volume = level,
                  Muted = muted,
                  Peak = peak
                });
              } catch { }
              finally {
                if (control != null && Marshal.IsComObject(control)) Marshal.FinalReleaseComObject(control);
              }
            }
          } finally {
            if (sessions != null && Marshal.IsComObject(sessions)) Marshal.FinalReleaseComObject(sessions);
            if (managerObject != null && Marshal.IsComObject(managerObject)) Marshal.FinalReleaseComObject(managerObject);
            if (device != null && Marshal.IsComObject(device)) Marshal.FinalReleaseComObject(device);
          }
        }
      } finally {
        if (devices != null && Marshal.IsComObject(devices)) Marshal.FinalReleaseComObject(devices);
        if (enumerator != null && Marshal.IsComObject(enumerator)) Marshal.FinalReleaseComObject(enumerator);
      }
      return snapshots.ToArray();
    }
  }
}
'@

if (-not ([System.Management.Automation.PSTypeName]'Mineradio.CoreAudioReadOnly.AudioSessionInspector').Type) {
  Add-Type -TypeDefinition $coreAudioSource -Language CSharp
}

$nameSet = @{}
foreach ($name in $ProcessName) {
  $normalized = [IO.Path]::GetFileNameWithoutExtension([string]$name).Trim().ToLowerInvariant()
  if ($normalized) { $nameSet[$normalized] = $true }
}
$pidSet = @{}
foreach ($id in $ProcessId) {
  if ($id -gt 0) { $pidSet[[int]$id] = $true }
}

$aggregates = @{}
$deadline = [DateTime]::UtcNow.AddSeconds($DurationSeconds)
$sampleNumber = 0
do {
  $sampleNumber += 1
  $sessions = @([Mineradio.CoreAudioReadOnly.AudioSessionInspector]::ReadAllRenderSessions())
  foreach ($session in $sessions) {
    $normalizedName = [string]$session.ProcessName
    $normalizedName = $normalizedName.Trim().ToLowerInvariant()
    $matchesName = $nameSet.Count -eq 0 -or $nameSet.ContainsKey($normalizedName)
    $matchesPid = $pidSet.Count -eq 0 -or $pidSet.ContainsKey([int]$session.ProcessId)
    if (-not ($matchesName -and $matchesPid)) { continue }
    $key = '{0}|{1}|{2}' -f $session.EndpointId, $session.ProcessId, $session.SessionInstanceIdentifier
    if (-not $aggregates.ContainsKey($key)) {
      $aggregates[$key] = [ordered]@{
        endpointId = [string]$session.EndpointId
        processId = [int]$session.ProcessId
        processName = [string]$session.ProcessName
        processPath = [string]$session.ProcessPath
        sessionIdentifier = [string]$session.SessionIdentifier
        sessionInstanceIdentifier = [string]$session.SessionInstanceIdentifier
        sampleCount = 0
        activeSampleCount = 0
        mutedSampleCount = 0
        minVolume = [double]::PositiveInfinity
        maxVolume = 0.0
        maxPeak = 0.0
        peakSum = 0.0
      }
    }
    $aggregate = $aggregates[$key]
    $aggregate.sampleCount += 1
    if ([string]$session.State -eq 'Active') { $aggregate.activeSampleCount += 1 }
    if ([bool]$session.Muted) { $aggregate.mutedSampleCount += 1 }
    $aggregate.minVolume = [Math]::Min([double]$aggregate.minVolume, [double]$session.Volume)
    $aggregate.maxVolume = [Math]::Max([double]$aggregate.maxVolume, [double]$session.Volume)
    $aggregate.maxPeak = [Math]::Max([double]$aggregate.maxPeak, [double]$session.Peak)
    $aggregate.peakSum += [double]$session.Peak
  }
  if ([DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds $IntervalMilliseconds }
} while ([DateTime]::UtcNow -lt $deadline)

$results = @($aggregates.Values | ForEach-Object {
  [pscustomobject][ordered]@{
    endpointId = $_.endpointId
    processId = $_.processId
    processName = $_.processName
    processPath = $_.processPath
    sessionIdentifier = $_.sessionIdentifier
    sessionInstanceIdentifier = $_.sessionInstanceIdentifier
    sampleCount = $_.sampleCount
    activeSampleCount = $_.activeSampleCount
    mutedSampleCount = $_.mutedSampleCount
    minVolume = if ([double]::IsPositiveInfinity($_.minVolume)) { 0.0 } else { [Math]::Round($_.minVolume, 6) }
    maxVolume = [Math]::Round($_.maxVolume, 6)
    maxPeak = [Math]::Round($_.maxPeak, 8)
    averagePeak = if ($_.sampleCount -gt 0) { [Math]::Round($_.peakSum / $_.sampleCount, 8) } else { 0.0 }
  }
})

$failures = New-Object System.Collections.Generic.List[string]
if ($RequireSession -and $results.Count -eq 0) {
  $failures.Add('NO_MATCHING_AUDIO_SESSION')
}
if ($MaxPeak -ge 0) {
  foreach ($result in $results) {
    if ([double]$result.maxPeak -gt $MaxPeak) {
      $failures.Add(('AUDIO_PEAK_EXCEEDED:{0}:{1}:{2}' -f $result.processName, $result.processId, $result.maxPeak))
    }
  }
}

$report = [pscustomobject][ordered]@{
  ok = $failures.Count -eq 0
  readOnly = $true
  durationSeconds = $DurationSeconds
  intervalMilliseconds = $IntervalMilliseconds
  requestedProcessNames = @($nameSet.Keys | Sort-Object)
  requestedProcessIds = @($pidSet.Keys | Sort-Object)
  sessionCount = $results.Count
  sessions = $results
  failures = @($failures)
}
$report | ConvertTo-Json -Depth 8
if ($failures.Count -gt 0) { exit 1 }
