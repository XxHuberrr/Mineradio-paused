function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const MINERADIO_BEAT_COMBOS = ['', 'downbeat', 'push', 'drop', 'rebound', 'accent'];

function clamp01(value) {
  return Math.max(0, Math.min(1, toNumber(value, 0)));
}

function median(values) {
  const list = (values || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!list.length) return 0;
  const middle = Math.floor(list.length / 2);
  return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
}

function normalizeBeatEvent(raw, index, gridStep) {
  if (Array.isArray(raw)) {
    const time = toNumber(raw[0], 0);
    const flags = Math.max(0, Math.round(toNumber(raw[8], 0)));
    const combo = MINERADIO_BEAT_COMBOS[Math.max(0, Math.round(toNumber(raw[7], 0)))] || '';
    return {
      time,
      index,
      strength: toNumber(raw[1], 0.5),
      confidence: toNumber(raw[2], 0.5),
      impact: toNumber(raw[3], toNumber(raw[1], 0.25)),
      low: toNumber(raw[4], toNumber(raw[9], 0)),
      body: toNumber(raw[5], 0),
      snap: toNumber(raw[6], toNumber(raw[10], 0)),
      combo,
      downbeat: combo === 'downbeat',
      primary: !!(flags & 1),
      camera: !!(flags & 2),
      pulse: !!(flags & 4),
      dj: !!(flags & 8),
      grid: !!(flags & 16),
      kickOnly: !!(flags & 32),
      mass: toNumber(raw[9], 0),
      sharpness: toNumber(raw[10], 0),
      step: toNumber(raw[11], gridStep || 0),
    };
  }
  const time = typeof raw === 'number' ? raw : toNumber(raw && raw.time, 0);
  return {
    time,
    index,
    strength: toNumber(raw && raw.strength, 0.5),
    confidence: toNumber(raw && raw.confidence, 0.5),
    impact: toNumber(raw && raw.impact, 0.25),
    low: toNumber(raw && raw.low, 0),
    body: toNumber(raw && raw.body, 0),
    snap: toNumber(raw && raw.snap, 0),
    combo: String(raw && raw.combo || ''),
    downbeat: !!(raw && raw.downbeat) || String(raw && raw.combo || '') === 'downbeat',
    phrase: !!(raw && raw.phrase),
    primary: raw && raw.primary !== false,
    camera: raw && raw.camera !== false,
    pulse: raw && raw.pulse !== false,
    dj: !!(raw && raw.dj),
    grid: !!(raw && raw.grid),
    kickOnly: !!(raw && raw.kickOnly),
    mass: toNumber(raw && raw.mass, 0),
    sharpness: toNumber(raw && raw.sharpness, 0),
    step: toNumber(raw && raw.step, gridStep || 0),
  };
}

function beatGridQuality(beats, gridStep, downbeats, map) {
  const intervals = [];
  for (let i = 1; i < beats.length; i += 1) {
    const delta = beats[i].time - beats[i - 1].time;
    if (delta > 0.18 && delta < 1.8) intervals.push(delta);
  }
  const step = gridStep > 0 ? gridStep : median(intervals);
  const deviations = intervals.map((value) => Math.abs(value - step));
  const relativeMad = step > 0 ? median(deviations) / step : 1;
  const tempoStability = clamp01(1 - relativeMad / 0.12);
  const confidence = clamp01(beats.length
    ? beats.reduce((sum, beat) => sum + clamp01(beat.confidence), 0) / beats.length
    : 0);
  const downbeatIntervals = [];
  for (let i = 1; i < downbeats.length; i += 1) {
    const delta = downbeats[i].time - downbeats[i - 1].time;
    if (delta > 0) downbeatIntervals.push(delta);
  }
  const expectedBar = step > 0 ? step * 4 : 0;
  const downbeatError = expectedBar && downbeatIntervals.length
    ? median(downbeatIntervals.map((value) => Math.abs(value - expectedBar) / expectedBar))
    : 1;
  const downbeatStability = clamp01(1 - downbeatError / 0.18);
  const enoughBeats = clamp01(beats.length / 48);
  const rangeValid = step >= 0.3 && step <= 1 ? 1 : 0;
  const partialPenalty = map && map.partial ? 0.72 : 1;
  return {
    step,
    tempoStability,
    beatConfidence: confidence,
    downbeatStability,
    dataConfidence: clamp01((tempoStability * 0.36 + confidence * 0.22 + downbeatStability * 0.24 + enoughBeats * 0.18) * rangeValid * partialPenalty),
  };
}

function normalizeWindows(windows) {
  if (!Array.isArray(windows)) return [];
  return windows
    .map((w) => ({
      start: Math.max(0, toNumber(w && w.start, 0)),
      end: Math.max(0, toNumber(w && w.end, 0)),
    }))
    .filter((w) => w.end > w.start)
    .sort((a, b) => a.start - b.start);
}

function normalizeMineradioBeatMap(track, map, extra = {}) {
  const gridStep = toNumber(map && map.gridStep, 0);
  const rawBeats = (map && (map.cameraBeats || map.beats || map.kicks)) || [];
  const rawGridBeats = (map && (map.pulseBeats || map.beats || map.cameraBeats || map.kicks)) || [];
  const beats = rawBeats
    .map((beat, index) => normalizeBeatEvent(beat, index, gridStep))
    .filter((beat) => Number.isFinite(beat.time))
    .sort((a, b) => a.time - b.time);
  const gridBeats = rawGridBeats
    .map((beat, index) => normalizeBeatEvent(beat, index, gridStep))
    .filter((beat) => Number.isFinite(beat.time))
    .sort((a, b) => a.time - b.time);
  const duration = toNumber(track && track.duration, toNumber(map && map.duration, beats.length ? beats[beats.length - 1].time : 0));
  const hasExplicitMeter = beats.some((beat) => beat.downbeat || beat.phrase || !!beat.combo);
  const downbeats = beats.filter((beat, index) => {
    if (beat.downbeat || beat.phrase || beat.combo === 'downbeat') return true;
    return !hasExplicitMeter && gridStep > 0 && index % 4 === 0;
  });
  const gridHasExplicitMeter = gridBeats.some((beat) => beat.downbeat || beat.phrase || !!beat.combo);
  const gridDownbeats = gridBeats.filter((beat, index) => {
    if (beat.downbeat || beat.phrase || beat.combo === 'downbeat') return true;
    return !gridHasExplicitMeter && gridStep > 0 && index % 4 === 0;
  });
  const quality = beatGridQuality(beats, gridStep, downbeats, map);
  const phraseBoundaries = downbeats.map((beat) => ({
    time: beat.time,
    confidence: Math.max(beat.confidence, beat.strength),
  }));
  const hasKeyData = !!extra.camelot || !!extra.key;
  const hasVocalData = Array.isArray(extra.vocalWindows);

  return {
    track: {
      id: track && track.id || '',
      title: track && (track.title || track.name) || '',
      artist: track && track.artist || '',
      duration,
    },
    analysis: {
      source: 'mineradio',
      beats,
      downbeats,
      gridBeats,
      gridDownbeats,
      phraseBoundaries,
      energyCurve: beats.map((beat) => ({ time: beat.time, value: Math.max(0, Math.min(1, beat.impact || beat.strength || 0)) })),
      lowBand: beats.map((beat) => ({ time: beat.time, value: beat.low })),
      bodyBand: beats.map((beat) => ({ time: beat.time, value: beat.body })),
      snapBand: beats.map((beat) => ({ time: beat.time, value: beat.snap })),
      sections: [],
      gridStep: quality.step || gridStep,
      bpm: (quality.step || gridStep) > 0 ? 60 / (quality.step || gridStep) : 0,
      camelot: extra.camelot || '',
      key: extra.key || '',
      vocalWindows: normalizeWindows(extra.vocalWindows),
      hasKeyData,
      hasVocalData,
      tempoStability: quality.tempoStability,
      beatConfidence: quality.beatConfidence,
      downbeatStability: quality.downbeatStability,
      dataConfidence: quality.dataConfidence,
      musicalProfile: map && map.musicalProfile || extra.musicalProfile || null,
      audioMetrics: map && map.audioMetrics || extra.audioMetrics || null,
    },
  };
}

module.exports = {
  normalizeMineradioBeatMap,
};
