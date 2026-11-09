var SONIC_AUDIO_BASE_BINS = 512;
var SONIC_AUDIO_MAX_BAND_START = SONIC_AUDIO_BASE_BINS - 2;
var SONIC_AUDIO_MAX_BAND_END = SONIC_AUDIO_BASE_BINS;
var SONIC_AUDIO_AUTO_TRACK_SCAN_BINS = 192;
var SONIC_AUDIO_DEFAULT_SAMPLE_RATE = 44100;

var sonicAudioMonitorState = {
  raw: new Uint8Array(SONIC_AUDIO_BASE_BINS),
  prev: new Float32Array(SONIC_AUDIO_BASE_BINS),
  smooth: {},
  beat: null,
  kick: { noiseFloor: 0, kickLevel: 0, kickOnset: 0, kickEnvelope: 0 },
  trigger: {
    smoothedFlux: 0,
    previousSmoothedFlux: 0,
    history: new Array(40).fill(0),
    historyIndex: 0,
    beatHold: 0,
    cooldownRemaining: 0,
    lastEnergy: 0,
    lastThreshold: 0,
    pulse: 0
  },
  autoTrack: {
    frames: [],
    lastAt: 0,
    start: 1,
    end: 2,
    windowIndex: 1,
    hzStart: 52,
    hzEnd: 165,
    sensitivity: 0.85
  },
  meta: null,
  frame: null,
  panelOpen: false,
  raf: 0,
  lastDrawAt: 0,
  lastOnsetAt: 0,
  lastAudioTime: 0
};

var SONIC_AUDIO_BAND_EDGES = [
  ['subBass', 32, 58],
  ['bass', 58, 118],
  ['lowMid', 118, 260],
  ['mid', 260, 720],
  ['highMid', 720, 1800],
  ['presence', 1800, 4200],
  ['brilliance', 4200, 9000],
  ['air', 9000, 16000]
];
var SONIC_AUDIO_BEAT_WINDOWS = [
  { name: 'Deep', startHz: 36, endHz: 82, bias: 1.04 },
  { name: 'Club', startHz: 46, endHz: 118, bias: 1.22 },
  { name: 'Kick', startHz: 54, endHz: 142, bias: 1.16 },
  { name: 'Punch', startHz: 68, endHz: 156, bias: 1.02 },
  { name: 'Body', startHz: 86, endHz: 190, bias: 0.86 },
  { name: 'Wide', startHz: 38, endHz: 155, bias: 0.78 }
];

function sonicAudioClamp(value, min, max) {
  value = Number(value);
  if (!isFinite(value)) value = min;
  return Math.max(min, Math.min(max, value));
}

function sonicAudioClamp01(value) {
  return sonicAudioClamp(value, 0, 1);
}

function sonicAudioBlendForRate(rate, dt) {
  return sonicAudioClamp(1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt || 0)), 0, 1);
}

function sonicAudioScaleBin(baseBin, len) {
  len = Math.max(1, Math.round(Number(len) || 1));
  return Math.max(0, Math.min(len - 1, Math.round((Number(baseBin) || 0) * len / SONIC_AUDIO_BASE_BINS)));
}

function sonicAudioResolveAnalysisMeta(data, opts) {
  opts = opts || {};
  var len = Math.max(1, data && data.length ? data.length : SONIC_AUDIO_BASE_BINS);
  var sampleRate = Number(opts.sampleRate)
    || (typeof audioCtx !== 'undefined' && audioCtx && Number(audioCtx.sampleRate))
    || SONIC_AUDIO_DEFAULT_SAMPLE_RATE;
  var fftSize = Number(opts.fftSize)
    || (typeof analyser !== 'undefined' && analyser && Number(analyser.fftSize))
    || len * 2;
  if (!isFinite(sampleRate) || sampleRate < 8000) sampleRate = SONIC_AUDIO_DEFAULT_SAMPLE_RATE;
  if (!isFinite(fftSize) || fftSize < len * 2) fftSize = len * 2;
  return {
    len: len,
    sampleRate: sampleRate,
    fftSize: fftSize,
    nyquist: sampleRate / 2,
    binHz: sampleRate / fftSize
  };
}

function sonicAudioHzToBin(meta, hz, mode) {
  meta = meta || sonicAudioResolveAnalysisMeta(null, null);
  var raw = (Number(hz) || 0) / Math.max(0.001, meta.binHz || 1);
  var bin = mode === 'ceil' ? Math.ceil(raw) : (mode === 'floor' ? Math.floor(raw) : Math.round(raw));
  return Math.max(1, Math.min(Math.max(1, meta.len - 1), bin));
}

function sonicAudioHzToBase(meta, hz) {
  meta = meta || sonicAudioResolveAnalysisMeta(null, null);
  var base = (Number(hz) || 0) / Math.max(1, meta.nyquist || SONIC_AUDIO_DEFAULT_SAMPLE_RATE / 2) * SONIC_AUDIO_BASE_BINS;
  return Math.round(sonicAudioClamp(base, 0, SONIC_AUDIO_MAX_BAND_END));
}

function sonicAudioBaseRangeToHz(meta, baseStart, baseEnd) {
  meta = meta || sonicAudioResolveAnalysisMeta(null, null);
  var nyquist = Math.max(1, meta.nyquist || SONIC_AUDIO_DEFAULT_SAMPLE_RATE / 2);
  var startHz = sonicAudioClamp(baseStart, 0, SONIC_AUDIO_MAX_BAND_END) / SONIC_AUDIO_BASE_BINS * nyquist;
  var endHz = sonicAudioClamp(baseEnd, 0, SONIC_AUDIO_MAX_BAND_END) / SONIC_AUDIO_BASE_BINS * nyquist;
  return {
    startHz: Math.min(startHz, endHz),
    endHz: Math.max(startHz, endHz)
  };
}

function sonicAudioBaseBinValue(data, baseBin) {
  if (!data || !data.length) return 0;
  return (data[sonicAudioScaleBin(baseBin, data.length)] || 0) / 255;
}

function sonicAudioRangeAverage(data, baseStart, baseEnd, weighted) {
  if (!data || !data.length) return 0;
  baseStart = Math.max(0, Math.round(Number(baseStart) || 0));
  baseEnd = Math.max(baseStart, Math.round(Number(baseEnd) || baseStart));
  var start = sonicAudioScaleBin(baseStart, data.length);
  var end = sonicAudioScaleBin(baseEnd, data.length);
  if (end < start) {
    var tmp = start;
    start = end;
    end = tmp;
  }
  var sum = 0;
  var total = 0;
  var center = (start + end) / 2;
  var half = Math.max(1, (end - start + 1) / 2);
  for (var i = start; i <= end; i++) {
    var weight = 1;
    if (weighted) {
      var distance = Math.abs(i - center);
      weight = 0.35 + 0.65 * (1 - Math.min(1, distance / half));
    }
    sum += ((data[i] || 0) / 255) * weight;
    total += weight;
  }
  return total > 0 ? sum / total : 0;
}

function sonicAudioHzRangeAverage(data, meta, hzStart, hzEnd, weighted) {
  if (!data || !data.length) return 0;
  meta = meta || sonicAudioResolveAnalysisMeta(data, null);
  var start = sonicAudioHzToBin(meta, Math.min(hzStart, hzEnd), 'floor');
  var end = sonicAudioHzToBin(meta, Math.max(hzStart, hzEnd), 'ceil');
  if (end < start) {
    var tmp = start;
    start = end;
    end = tmp;
  }
  var sum = 0;
  var total = 0;
  var center = (start + end) / 2;
  var half = Math.max(1, (end - start + 1) / 2);
  for (var i = start; i <= end; i++) {
    var weight = 1;
    if (weighted) {
      var distance = Math.abs(i - center);
      weight = 0.38 + 0.62 * (1 - Math.min(1, distance / half));
    }
    var v = (data[i] || 0) / 255;
    sum += v * v * weight;
    total += weight;
  }
  return total > 0 ? Math.sqrt(sum / total) : 0;
}

function sonicAudioFollowValue(previous, next, attackRate, releaseRate, dt) {
  previous = Number(previous) || 0;
  next = sonicAudioClamp01(next);
  var rate = next > previous ? attackRate : releaseRate;
  return previous + (next - previous) * sonicAudioBlendForRate(rate, dt || 1 / 60);
}

function sonicAudioComputeHzBands(data, meta) {
  var values = {};
  var energySum = 0;
  for (var b = 0; b < SONIC_AUDIO_BAND_EDGES.length; b++) {
    var band = SONIC_AUDIO_BAND_EDGES[b];
    var value = sonicAudioHzRangeAverage(data, meta, band[1], band[2], false);
    values[band[0]] = value;
    energySum += value;
  }
  values.kickSub = sonicAudioHzRangeAverage(data, meta, 38, 78, true);
  values.kickCore = sonicAudioHzRangeAverage(data, meta, 52, 165, true);
  values.kickPunch = sonicAudioHzRangeAverage(data, meta, 72, 190, true);
  values.kickWide = sonicAudioHzRangeAverage(data, meta, 38, 220, true);
  values.body = sonicAudioHzRangeAverage(data, meta, 165, 420, true);
  values.vocal = sonicAudioHzRangeAverage(data, meta, 420, 2600, false);
  values.snap = sonicAudioHzRangeAverage(data, meta, 1800, 9200, false);
  values.lowDrive = sonicAudioClamp01(values.kickCore * 0.86 + values.kickSub * 0.42 + values.body * 0.10);
  values.lowDominance = values.lowDrive / Math.max(0.001, values.vocal * 0.72 + values.body * 0.34 + values.snap * 0.12);
  values.energy = sonicAudioClamp01((energySum / SONIC_AUDIO_BAND_EDGES.length) * 0.82 + values.lowDrive * 0.18);
  return values;
}

function sonicAudioEnsureBuffers(len) {
  len = Math.max(1, Math.round(Number(len) || 512));
  if (!sonicAudioMonitorState.raw || sonicAudioMonitorState.raw.length !== len) {
    sonicAudioMonitorState.raw = new Uint8Array(len);
    sonicAudioMonitorState.prev = new Float32Array(len);
  }
}

function sonicAudioResetTransientState(meta) {
  sonicAudioMonitorState.beat = createSonicBeatState();
  sonicAudioMonitorState.kick = { noiseFloor: 0, kickLevel: 0, kickOnset: 0, kickEnvelope: 0 };
  sonicAudioMonitorState.trigger = {
    smoothedFlux: 0,
    previousSmoothedFlux: 0,
    history: new Array(40).fill(0),
    historyIndex: 0,
    beatHold: 0,
    cooldownRemaining: 0,
    lastEnergy: 0,
    lastThreshold: 0,
    pulse: 0
  };
  sonicAudioMonitorState.autoTrack.frames = [];
  sonicAudioMonitorState.autoTrack.lastAt = 0;
  sonicAudioMonitorState.autoTrack.windowIndex = 1;
  sonicAudioMonitorState.autoTrack.hzStart = 46;
  sonicAudioMonitorState.autoTrack.hzEnd = 118;
  if (meta) {
    sonicAudioMonitorState.autoTrack.start = sonicAudioHzToBase(meta, 46);
    sonicAudioMonitorState.autoTrack.end = sonicAudioHzToBase(meta, 118);
  } else {
    sonicAudioMonitorState.autoTrack.start = 1;
    sonicAudioMonitorState.autoTrack.end = 3;
  }
}

function normalizeSonicAudioSettings(sourceFx) {
  var f = sourceFx || (typeof fx !== 'undefined' ? fx : {}) || {};
  var start = Math.round(sonicAudioClamp(f.sonicAudioBandStart == null ? 1 : f.sonicAudioBandStart, 0, SONIC_AUDIO_MAX_BAND_START));
  var end = Math.round(sonicAudioClamp(f.sonicAudioBandEnd == null ? 4 : f.sonicAudioBandEnd, 2, SONIC_AUDIO_MAX_BAND_END));
  if (end < start + 1) end = Math.min(SONIC_AUDIO_MAX_BAND_END, start + 1);
  return {
    enabled: f.sonicAudioMonitorEnabled !== false,
    autoTrack: f.sonicAudioAutoTrack !== false,
    sensitivity: Math.round(sonicAudioClamp(f.sonicAudioSensitivity == null ? 100 : f.sonicAudioSensitivity, 0, 100)),
    bandStart: start,
    bandEnd: end,
    threshold: Math.round(sonicAudioClamp(f.sonicAudioThreshold == null ? 32 : f.sonicAudioThreshold, 0, 100)),
    pulseStrength: Math.round(sonicAudioClamp(f.sonicAudioPulseStrength == null ? 62 : f.sonicAudioPulseStrength, 0, 100))
  };
}

function sonicAudioNormalizeFx(sourceFx) {
  var f = sourceFx || (typeof fx !== 'undefined' ? fx : null);
  if (!f) return;
  var next = normalizeSonicAudioSettings(f);
  f.sonicAudioMonitorEnabled = next.enabled;
  f.sonicAudioAutoTrack = next.autoTrack;
  f.sonicAudioSensitivity = next.sensitivity;
  f.sonicAudioBandStart = next.bandStart;
  f.sonicAudioBandEnd = next.bandEnd;
  f.sonicAudioThreshold = next.threshold;
  f.sonicAudioPulseStrength = next.pulseStrength;
}

function sonicAudioBeatParams(sensitivity) {
  sensitivity = sonicAudioClamp(sensitivity, 0, 100);
  var lower = sensitivity <= 50 ? sensitivity / 50 : 1;
  var upper = sensitivity > 50 ? (sensitivity - 50) / 50 : 0;
  var strict = { thresholdStdDevGain: 2.6, thresholdFloor: 0.05, minTriggerFlux: 0.07 };
  var normal = { thresholdStdDevGain: 1.8, thresholdFloor: 0.028, minTriggerFlux: 0.045 };
  var sensitive = { thresholdStdDevGain: 1.1, thresholdFloor: 0.016, minTriggerFlux: 0.025 };
  var mid = {
    thresholdStdDevGain: strict.thresholdStdDevGain + (normal.thresholdStdDevGain - strict.thresholdStdDevGain) * lower,
    thresholdFloor: strict.thresholdFloor + (normal.thresholdFloor - strict.thresholdFloor) * lower,
    minTriggerFlux: strict.minTriggerFlux + (normal.minTriggerFlux - strict.minTriggerFlux) * lower
  };
  return {
    thresholdStdDevGain: mid.thresholdStdDevGain + (sensitive.thresholdStdDevGain - mid.thresholdStdDevGain) * upper,
    thresholdFloor: mid.thresholdFloor + (sensitive.thresholdFloor - mid.thresholdFloor) * upper,
    minTriggerFlux: mid.minTriggerFlux + (sensitive.minTriggerFlux - mid.minTriggerFlux) * upper
  };
}

function createSonicBeatState() {
  return {
    activeWindowIndex: 1,
    windowScores: new Array(SONIC_AUDIO_BEAT_WINDOWS.length).fill(0),
    previousWindowLevels: new Array(SONIC_AUDIO_BEAT_WINDOWS.length).fill(0),
    fluxHistory: new Array(90).fill(0),
    fluxHistoryIndex: 0,
    smoothedFlux: 0,
    previousSmoothedFlux: 0,
    cooldownRemaining: 0
  };
}

function sonicAudioFluxStats(history) {
  var sum = 0;
  var i;
  for (i = 0; i < history.length; i++) sum += history[i] || 0;
  var avg = sum / Math.max(1, history.length);
  var variance = 0;
  for (i = 0; i < history.length; i++) variance += Math.pow((history[i] || 0) - avg, 2);
  variance /= Math.max(1, history.length);
  return { avg: avg, stdDev: Math.sqrt(variance) };
}

function sonicAudioStepKickEnvelope(rawKickLevel, onset, dt) {
  var k = sonicAudioMonitorState.kick;
  var safeRaw = sonicAudioClamp01(rawKickLevel);
  var floorRate = safeRaw > k.noiseFloor ? 1.15 : 0.35;
  var noiseFloor = k.noiseFloor + (safeRaw - k.noiseFloor) * sonicAudioBlendForRate(floorRate, dt);
  var kickLevel = sonicAudioClamp01(safeRaw - noiseFloor - 0.025);
  var breathTarget = Math.min(0.11, kickLevel * 0.18);
  var onsetTarget = onset ? Math.max(0.48, kickLevel * 0.95) : 0;
  var targetEnvelope = Math.max(breathTarget, onsetTarget);
  var envelopeRate = targetEnvelope > k.kickEnvelope ? 42 : 11.5;
  var kickEnvelope = Math.max(breathTarget, k.kickEnvelope + (targetEnvelope - k.kickEnvelope) * sonicAudioBlendForRate(envelopeRate, dt));
  sonicAudioMonitorState.kick = {
    noiseFloor: noiseFloor,
    kickLevel: kickLevel,
    kickOnset: onset ? 1 : 0,
    kickEnvelope: sonicAudioClamp01(kickEnvelope)
  };
  return sonicAudioMonitorState.kick;
}

function sonicAudioStepBeatDetector(data, dt, settings, meta, bands) {
  if (!sonicAudioMonitorState.beat) sonicAudioMonitorState.beat = createSonicBeatState();
  var s = sonicAudioMonitorState.beat;
  var params = sonicAudioBeatParams(settings.sensitivity);
  var windowLevels = SONIC_AUDIO_BEAT_WINDOWS.map(function (win) {
    return sonicAudioHzRangeAverage(data, meta, win.startHz, win.endHz, true);
  });
  var nextScores = s.windowScores.map(function (score, index) {
    var fluxValue = Math.max(0, windowLevels[index] - (s.previousWindowLevels[index] || 0));
    var win = SONIC_AUDIO_BEAT_WINDOWS[index];
    var dominanceBoost = sonicAudioClamp((bands && bands.lowDominance) || 0, 0.65, 2.25) / 2.25;
    return score * 0.945 + fluxValue * (win.bias || 1) * (0.70 + dominanceBoost * 0.70);
  });
  var activeWindowIndex = settings.autoTrack && sonicAudioMonitorState.autoTrack.windowIndex != null
    ? sonicAudioMonitorState.autoTrack.windowIndex
    : (s.activeWindowIndex || 0);
  for (var i = 0; i < nextScores.length; i++) {
    if (nextScores[i] > nextScores[activeWindowIndex] * 1.10) activeWindowIndex = i;
  }
  var rawFlux = Math.max(0, windowLevels[activeWindowIndex] - (s.previousWindowLevels[activeWindowIndex] || 0));
  var smoothedFlux = s.smoothedFlux + (rawFlux - s.smoothedFlux) * 0.46;
  var stats = sonicAudioFluxStats(s.fluxHistory);
  var threshold = Math.max(params.thresholdFloor, stats.avg + stats.stdDev * params.thresholdStdDevGain);
  var cooldownRemaining = Math.max(0, s.cooldownRemaining - Math.max(0, dt || 0));
  var lowDominance = (bands && bands.lowDominance) || 0;
  var lowGate = (bands && bands.lowDrive) || windowLevels[activeWindowIndex] || 0;
  var vocalMask = bands ? (bands.vocal * 0.62 + bands.snap * 0.16) : 0;
  var drumGate = lowGate > 0.045 && (lowDominance > 0.78 || lowGate > vocalMask * 1.04 || ((bands && bands.kickSub) || 0) > 0.085);
  var instantRise = rawFlux > threshold && rawFlux >= params.minTriggerFlux;
  var peakConfirm = s.previousSmoothedFlux > threshold && s.previousSmoothedFlux >= smoothedFlux && s.previousSmoothedFlux >= params.minTriggerFlux * 0.86;
  var onset = cooldownRemaining <= 0 && drumGate && (instantRise || peakConfirm);
  var displayedFlux = instantRise ? rawFlux : (onset ? Math.max(s.previousSmoothedFlux, smoothedFlux) : smoothedFlux);
  var nextHistory = s.fluxHistory.slice();
  nextHistory[s.fluxHistoryIndex] = smoothedFlux;
  var nextHistoryIndex = (s.fluxHistoryIndex + 1) % nextHistory.length;
  var kickLevel = Math.max(windowLevels[activeWindowIndex], (bands && bands.lowDrive) || 0);
  var kick = sonicAudioStepKickEnvelope(kickLevel, onset, dt || 1 / 60);
  s.activeWindowIndex = activeWindowIndex;
  s.windowScores = nextScores;
  s.previousWindowLevels = windowLevels;
  s.fluxHistory = nextHistory;
  s.fluxHistoryIndex = nextHistoryIndex;
  s.smoothedFlux = smoothedFlux;
  s.previousSmoothedFlux = smoothedFlux;
  s.cooldownRemaining = onset ? 0.12 : cooldownRemaining;
  if (onset) sonicAudioMonitorState.lastOnsetAt = performance.now();
  var activeWindow = SONIC_AUDIO_BEAT_WINDOWS[activeWindowIndex];
  return {
    kickLevel: kick.kickLevel,
    kickFlux: displayedFlux,
    kickThreshold: threshold,
    kickOnset: onset ? 1 : 0,
    kickEnvelope: kick.kickEnvelope,
    kickConfidence: sonicAudioClamp(displayedFlux / Math.max(0.001, threshold * 1.85), 0, 1),
    kickLowDominance: sonicAudioClamp(lowDominance / 1.8, 0, 1),
    kickWindowName: activeWindow.name,
    kickWindowStart: sonicAudioHzToBase(meta, activeWindow.startHz),
    kickWindowEnd: sonicAudioHzToBase(meta, activeWindow.endHz),
    kickHzStart: activeWindow.startHz,
    kickHzEnd: activeWindow.endHz
  };
}

function sonicAudioTrackAutoPulse(data, now, meta, bands) {
  var tracker = sonicAudioMonitorState.autoTrack;
  var levels = SONIC_AUDIO_BEAT_WINDOWS.map(function (win) {
    return sonicAudioHzRangeAverage(data, meta, win.startHz, win.endHz, true);
  });
  tracker.frames.push({
    time: now,
    levels: levels,
    lowDominance: (bands && bands.lowDominance) || 0,
    body: (bands && bands.body) || 0,
    vocal: (bands && bands.vocal) || 0,
    snap: (bands && bands.snap) || 0
  });
  while (tracker.frames.length && now - tracker.frames[0].time > 1450) tracker.frames.shift();
  if (now - tracker.lastAt <= 360 || tracker.frames.length < 8) return;
  tracker.lastAt = now;
  var scores = new Array(SONIC_AUDIO_BEAT_WINDOWS.length);
  for (var b = 0; b < scores.length; b++) scores[b] = { index: b, avg: 0, max: 0, score: 0 };
  for (var f = 1; f < tracker.frames.length; f++) {
    var cur = tracker.frames[f];
    var prev = tracker.frames[f - 1];
    var highMask = cur.vocal * 0.58 + cur.snap * 0.22 + cur.body * 0.18;
    var dominance = sonicAudioClamp(cur.lowDominance, 0.65, 2.20) / 2.20;
    for (var k = 0; k < scores.length; k++) {
      var diff = Math.max(0, cur.levels[k] - prev.levels[k]);
      var win = SONIC_AUDIO_BEAT_WINDOWS[k];
      var width = Math.max(1, win.endHz - win.startHz);
      var widthPenalty = sonicAudioClamp(Math.sqrt(82 / width), 0.68, 1.16);
      var bodyPenalty = win.endHz > 160 ? 1 / (1 + cur.body * 0.42 + highMask * 0.22) : 1;
      var weighted = diff * (win.bias || 1) * widthPenalty * bodyPenalty * (0.72 + dominance * 0.60) / (1 + highMask * 0.78);
      scores[k].avg += weighted;
      scores[k].max = Math.max(scores[k].max, weighted);
    }
  }
  scores.forEach(function (item) {
    item.avg /= Math.max(1, tracker.frames.length - 1);
    item.score = item.max * 0.70 + item.avg * 0.30;
  });
  scores.sort(function (a, b2) {
    if (Math.abs(b2.score - a.score) > 0.003) return b2.score - a.score;
    var aw = SONIC_AUDIO_BEAT_WINDOWS[a.index];
    var bw = SONIC_AUDIO_BEAT_WINDOWS[b2.index];
    return (aw.endHz - bw.endHz) || ((aw.endHz - aw.startHz) - (bw.endHz - bw.startHz));
  });
  if (!scores.length || scores[0].score < 0.010) return;
  var best = SONIC_AUDIO_BEAT_WINDOWS[scores[0].index];
  tracker.windowIndex = scores[0].index;
  tracker.hzStart = best.startHz;
  tracker.hzEnd = best.endHz;
  tracker.start = Math.round(sonicAudioClamp(sonicAudioHzToBase(meta, best.startHz), 0, SONIC_AUDIO_MAX_BAND_START));
  tracker.end = Math.round(sonicAudioClamp(sonicAudioHzToBase(meta, best.endHz), tracker.start + 1, SONIC_AUDIO_MAX_BAND_END));
  tracker.sensitivity = sonicAudioClamp(0.72 + Math.min(0.24, scores[0].score * 2.8), 0.72, 0.96);
}

function sonicAudioEvaluateSelectedTrigger(data, settings, dt, meta, beatData) {
  var trigger = sonicAudioMonitorState.trigger;
  var start = settings.autoTrack ? sonicAudioMonitorState.autoTrack.start : settings.bandStart;
  var end = settings.autoTrack ? sonicAudioMonitorState.autoTrack.end : settings.bandEnd;
  start = Math.round(sonicAudioClamp(start, 0, SONIC_AUDIO_MAX_BAND_START));
  end = Math.round(sonicAudioClamp(end, start + 1, SONIC_AUDIO_MAX_BAND_END));
  var manualHz = sonicAudioBaseRangeToHz(meta, start, end);
  var hzStart = settings.autoTrack ? sonicAudioMonitorState.autoTrack.hzStart : manualHz.startHz;
  var hzEnd = settings.autoTrack ? sonicAudioMonitorState.autoTrack.hzEnd : manualHz.endHz;
  var energy = settings.autoTrack && beatData ? beatData.kickLevel : sonicAudioHzRangeAverage(data, meta, hzStart, hzEnd, false);
  var startBin = sonicAudioHzToBin(meta, hzStart, 'floor');
  var endBin = sonicAudioHzToBin(meta, hzEnd, 'ceil');
  var flux = 0;
  var count = 0;
  for (var i = Math.min(startBin, endBin); i <= Math.max(startBin, endBin); i++) {
    var val = (data[i] || 0) / 255;
    var diff = val - (sonicAudioMonitorState.prev[i] || 0);
    if (diff > 0.01) flux += diff;
    count++;
  }
  flux /= Math.max(1, count);
  var triggered = false;
  var strength = 0;
  if (settings.autoTrack) {
    flux = Math.max(flux, beatData ? beatData.kickFlux * 0.72 : 0);
    trigger.smoothedFlux += (flux - trigger.smoothedFlux) * 0.48;
    trigger.history[trigger.historyIndex] = trigger.smoothedFlux;
    trigger.historyIndex = (trigger.historyIndex + 1) % trigger.history.length;
    var stats = sonicAudioFluxStats(trigger.history);
    var thresholdMultiplier = Math.max(0.1, 5.0 - sonicAudioMonitorState.autoTrack.sensitivity * 4.0);
    var adaptiveThreshold = Math.max(0.01, stats.avg + stats.stdDev * thresholdMultiplier);
    var isPeak = (beatData && beatData.kickOnset > 0) || (flux > adaptiveThreshold && flux > trigger.previousSmoothedFlux * 1.04);
    if (trigger.beatHold > 0) trigger.beatHold--;
    else if (isPeak) {
      triggered = true;
      trigger.beatHold = Math.max(3, Math.round(8 + (1 - settings.pulseStrength / 100) * 10));
      strength = sonicAudioClamp01(Math.max(flux * 24, (beatData ? beatData.kickConfidence : 0) * 0.68 + energy * 0.32) * (settings.pulseStrength / 100));
    }
    trigger.lastEnergy = Math.max(energy, trigger.smoothedFlux * 8);
    trigger.lastThreshold = adaptiveThreshold * 8;
    trigger.previousSmoothedFlux = trigger.smoothedFlux;
  } else {
    trigger.cooldownRemaining = Math.max(0, trigger.cooldownRemaining - Math.max(0, dt || 0));
    var threshold = settings.threshold / 100;
    if (trigger.cooldownRemaining <= 0 && energy > threshold) {
      triggered = true;
      trigger.cooldownRemaining = 0.18;
      strength = sonicAudioClamp01((energy - threshold) / Math.max(0.05, 1 - threshold) + settings.pulseStrength / 220);
    }
    trigger.lastEnergy = energy;
    trigger.lastThreshold = threshold;
  }
  trigger.pulse = Math.max(trigger.pulse * Math.pow(0.10, Math.max(0.001, dt || 1 / 60)), triggered ? strength : 0);
  return {
    triggerBandStart: start,
    triggerBandEnd: end,
    triggerHzStart: hzStart,
    triggerHzEnd: hzEnd,
    triggerEnergy: trigger.lastEnergy,
    triggerThreshold: trigger.lastThreshold,
    triggerPulse: trigger.pulse,
    triggerOnset: triggered ? 1 : 0
  };
}

function sonicAudioCopyRawAndPrevious(data) {
  var len = data.length;
  sonicAudioEnsureBuffers(len);
  sonicAudioMonitorState.raw.set(data);
}

function sonicAudioCommitPrevious(data) {
  for (var i = 0; i < data.length; i++) sonicAudioMonitorState.prev[i] = (data[i] || 0) / 255;
}

function sonicAudioDecayFrame(dt) {
  var frame = sonicAudioMonitorState.frame;
  var decay = Math.pow(0.08, Math.max(0.001, dt || 1 / 60));
  if (!frame) return null;
  [
    'subBass', 'bass', 'lowMid', 'mid', 'highMid', 'presence', 'brilliance', 'air',
    'body', 'vocal', 'snap', 'lowDrive', 'treble', 'energy', 'kickEnvelope', 'kickLevel',
    'kickFlux', 'kickOnset', 'kickConfidence', 'kickLowDominance', 'triggerEnergy', 'triggerPulse', 'beat'
  ].forEach(function (key) {
    frame[key] = sonicAudioClamp01((Number(frame[key]) || 0) * decay);
  });
  sonicAudioMonitorState.trigger.pulse = frame.triggerPulse || 0;
  return frame;
}

function stepSonicAudioMonitor(rawData, dt, opts) {
  opts = opts || {};
  var settings = normalizeSonicAudioSettings(opts.fx || (typeof fx !== 'undefined' ? fx : null));
  var playing = opts.playing !== false && rawData && rawData.length && settings.enabled;
  if (!playing) return sonicAudioDecayFrame(dt);
  var data = rawData;
  var meta = sonicAudioResolveAnalysisMeta(data, opts);
  sonicAudioMonitorState.meta = meta;
  sonicAudioEnsureBuffers(data.length);
  var currentTime = Number(opts.currentTime);
  if (isFinite(currentTime)) {
    if (sonicAudioMonitorState.lastAudioTime > 0 && currentTime + 0.30 < sonicAudioMonitorState.lastAudioTime) {
      sonicAudioResetTransientState(meta);
      if (sonicAudioMonitorState.prev && sonicAudioMonitorState.prev.fill) sonicAudioMonitorState.prev.fill(0);
      sonicAudioMonitorState.smooth = {};
    }
    sonicAudioMonitorState.lastAudioTime = currentTime;
  }
  sonicAudioCopyRawAndPrevious(data);
  var now = performance.now();
  var values = sonicAudioComputeHzBands(data, meta);
  if (settings.autoTrack) sonicAudioTrackAutoPulse(data, now, meta, values);
  var lowSum = values.subBass + values.bass + values.lowMid + values.mid * 0.42;
  var midSum = values.mid * 0.58 + values.highMid + values.presence * 0.26;
  var highSum = values.presence * 0.74 + values.brilliance + values.air;
  var totalTone = Math.max(0.001, lowSum + midSum + highSum);
  var legacyBass = values.lowDrive;
  var legacyMid = sonicAudioClamp01(values.mid * 0.58 + values.highMid * 0.42);
  var legacyTreble = sonicAudioClamp01(values.presence * 0.42 + values.brilliance * 0.38 + values.air * 0.20);
  var energy = values.energy;
  var warmth = lowSum / totalTone;
  var brightness = highSum / totalTone;
  var smooth = sonicAudioMonitorState.smooth;
  Object.keys(values).forEach(function (key) {
    smooth[key] = sonicAudioFollowValue(smooth[key], values[key], 34, 10, dt || 1 / 60);
  });
  smooth.bass = (smooth.bass || 0);
  smooth.treble = sonicAudioFollowValue(smooth.treble, legacyTreble, 30, 9, dt || 1 / 60);
  smooth.energy = sonicAudioFollowValue(smooth.energy, energy, 28, 8, dt || 1 / 60);
  var beatData = sonicAudioStepBeatDetector(data, dt || 1 / 60, settings, meta, values);
  var triggerData = sonicAudioEvaluateSelectedTrigger(data, settings, dt || 1 / 60, meta, beatData);
  sonicAudioCommitPrevious(data);
  var kickEnvelope = sonicAudioClamp01(Math.max(beatData.kickEnvelope, triggerData.triggerPulse, Number(opts.beat) || 0));
  var frame = Object.assign({
    sonicDetailed: true,
    sonicHzDetailed: true,
    bass: smooth.bass || values.bass,
    mid: smooth.mid || values.mid,
    treble: smooth.treble || legacyTreble,
    energy: smooth.energy || energy,
    beat: kickEnvelope,
    warmth: warmth,
    brightness: brightness,
    sharpness: sonicAudioClamp01(brightness * 0.42 + values.snap * 0.14 + beatData.kickOnset * 0.28),
    smoothness: sonicAudioClamp01(1 - legacyTreble * 0.32 + legacyMid * 0.12),
    density: sonicAudioClamp01(0.40 + legacyTreble * 0.24 + values.vocal * 0.12 + kickEnvelope * 0.16)
  }, smooth, beatData, triggerData);
  frame.kickEnvelope = kickEnvelope;
  sonicAudioMonitorState.frame = frame;
  return frame;
}

function getSonicAudioMonitorSnapshot() {
  var frame = sonicAudioMonitorState.frame || {};
  return {
    frame: Object.assign({}, frame),
    panelOpen: !!sonicAudioMonitorState.panelOpen,
    rawLength: sonicAudioMonitorState.raw ? sonicAudioMonitorState.raw.length : 0,
    baseBins: SONIC_AUDIO_BASE_BINS,
    sampleRate: sonicAudioMonitorState.meta ? sonicAudioMonitorState.meta.sampleRate : 0,
    fftSize: sonicAudioMonitorState.meta ? sonicAudioMonitorState.meta.fftSize : 0,
    autoBandStart: sonicAudioMonitorState.autoTrack.start,
    autoBandEnd: sonicAudioMonitorState.autoTrack.end,
    lastOnsetAt: sonicAudioMonitorState.lastOnsetAt || 0
  };
}

function drawSonicAudioMonitorPanel() {
  var panel = document.getElementById('sonic-audio-monitor-panel');
  var canvas = document.getElementById('sonic-audio-monitor-canvas');
  var meter = document.getElementById('sonic-audio-meter-fill');
  var label = document.getElementById('sonic-audio-monitor-label');
  if (!canvas || !panel || !sonicAudioMonitorState.panelOpen) {
    sonicAudioMonitorState.raf = 0;
    return;
  }
  var now = performance.now();
  if (now - sonicAudioMonitorState.lastDrawAt < 48) {
    sonicAudioMonitorState.raf = requestAnimationFrame(drawSonicAudioMonitorPanel);
    return;
  }
  sonicAudioMonitorState.lastDrawAt = now;
  var ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  var w = canvas.width;
  var h = canvas.height;
  var raw = sonicAudioMonitorState.raw || [];
  var frame = sonicAudioMonitorState.frame || {};
  var start = frame.triggerBandStart == null ? 1 : frame.triggerBandStart;
  var end = frame.triggerBandEnd == null ? 4 : frame.triggerBandEnd;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(5,8,14,0.92)';
  ctx.fillRect(0, 0, w, h);
  var startX = sonicAudioClamp(start, 0, SONIC_AUDIO_MAX_BAND_END) / SONIC_AUDIO_BASE_BINS * w;
  var endX = sonicAudioClamp(end, 0, SONIC_AUDIO_MAX_BAND_END) / SONIC_AUDIO_BASE_BINS * w;
  ctx.fillStyle = 'rgba(244,210,138,0.14)';
  ctx.fillRect(Math.min(startX, endX), 0, Math.max(2, Math.abs(endX - startX)), h);
  var bars = Math.min(160, raw.length || 0);
  for (var i = 0; i < bars; i++) {
    var ratio = bars <= 1 ? 0 : i / (bars - 1);
    var idx = Math.min((raw.length || 1) - 1, Math.round(Math.pow(ratio, 1.24) * ((raw.length || 1) - 1)));
    var v = (raw[idx] || 0) / 255;
    var x = i / bars * w;
    var bw = Math.max(1, w / bars - 1);
    var bh = Math.max(1, v * (h - 14));
    var hue = 194 + ratio * 120;
    ctx.fillStyle = 'hsla(' + hue + ', 92%, ' + Math.round(54 + v * 18) + '%, 0.86)';
    ctx.fillRect(x, h - bh, bw, bh);
  }
  var threshold = sonicAudioClamp01(Number(frame.triggerThreshold) || 0);
  var energy = sonicAudioClamp01(Number(frame.triggerEnergy) || 0);
  var thresholdY = h - threshold * h;
  var energyY = h - energy * h;
  ctx.strokeStyle = 'rgba(255,255,255,0.34)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, thresholdY);
  ctx.lineTo(w, thresholdY);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,85,88,0.95)';
  ctx.beginPath();
  ctx.arc(Math.max(8, Math.min(w - 8, (startX + endX) / 2)), Math.max(8, Math.min(h - 8, energyY)), 4.5, 0, Math.PI * 2);
  ctx.fill();
  if (meter) meter.style.transform = 'scaleX(' + sonicAudioClamp01(frame.kickEnvelope || 0).toFixed(3) + ')';
  if (label) {
    var mode = (typeof fx !== 'undefined' && fx && fx.sonicAudioAutoTrack !== false) ? 'AUTO' : 'MANUAL';
    var hzStart = Math.round(Number(frame.triggerHzStart) || Number(frame.kickHzStart) || 0);
    var hzEnd = Math.round(Number(frame.triggerHzEnd) || Number(frame.kickHzEnd) || 0);
    var hzText = hzStart && hzEnd ? (' ' + hzStart + '-' + hzEnd + 'Hz') : (' ' + start + '-' + end);
    label.textContent = mode + hzText + ' / ' + (frame.kickWindowName || 'Classic');
  }
  sonicAudioMonitorState.raf = requestAnimationFrame(drawSonicAudioMonitorPanel);
}

function setSonicAudioMonitorPanelOpen(open) {
  sonicAudioMonitorState.panelOpen = !!open;
  var panel = document.getElementById('sonic-audio-monitor-panel');
  var btn = document.getElementById('sonic-audio-monitor-toggle');
  if (panel) panel.classList.toggle('open', sonicAudioMonitorState.panelOpen);
  if (btn) btn.classList.toggle('active', sonicAudioMonitorState.panelOpen);
  if (sonicAudioMonitorState.panelOpen && !sonicAudioMonitorState.raf) {
    sonicAudioMonitorState.raf = requestAnimationFrame(drawSonicAudioMonitorPanel);
  }
}

function toggleSonicAudioMonitorPanel(force) {
  setSonicAudioMonitorPanelOpen(force == null ? !sonicAudioMonitorState.panelOpen : !!force);
}

function refreshSonicAudioMonitorUi() {
  sonicAudioNormalizeFx();
  var monitorToggle = document.getElementById('t-sonicAudioMonitorEnabled');
  var autoToggle = document.getElementById('t-sonicAudioAutoTrack');
  if (monitorToggle && typeof fx !== 'undefined') monitorToggle.classList.toggle('on', fx.sonicAudioMonitorEnabled !== false);
  if (autoToggle && typeof fx !== 'undefined') autoToggle.classList.toggle('on', fx.sonicAudioAutoTrack !== false);
  if (sonicAudioMonitorState.panelOpen && !sonicAudioMonitorState.raf) {
    sonicAudioMonitorState.raf = requestAnimationFrame(drawSonicAudioMonitorPanel);
  }
}

function bindSonicAudioMonitorControls() {
  var btn = document.getElementById('sonic-audio-monitor-toggle');
  if (btn && !btn._sonicAudioMonitorBound) {
    btn._sonicAudioMonitorBound = true;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      toggleSonicAudioMonitorPanel();
    });
  }
  refreshSonicAudioMonitorUi();
}

if (typeof window !== 'undefined') {
  window.stepSonicAudioMonitor = stepSonicAudioMonitor;
  window.getSonicAudioMonitorSnapshot = getSonicAudioMonitorSnapshot;
  window.toggleSonicAudioMonitorPanel = toggleSonicAudioMonitorPanel;
  window.refreshSonicAudioMonitorUi = refreshSonicAudioMonitorUi;
  document.addEventListener('DOMContentLoaded', bindSonicAudioMonitorControls);
}
