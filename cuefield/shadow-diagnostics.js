'use strict';

const PHRASE_BAR_COUNTS = [4, 8, 16, 32];

function finite(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, finite(value, 0)));
}

function round(value, digits = 3) {
  const number = finite(value, 0);
  const factor = 10 ** digits;
  const result = Math.round((number + Number.EPSILON) * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function normalizedBars(profile) {
  return (profile && profile.bars || [])
    .map((bar, index) => ({
      index,
      start: finite(bar && bar.start),
      end: finite(bar && bar.end),
      energy: finite(bar && bar.energy, 0),
      bodyDensity: finite(bar && bar.bodyDensity, 0),
      snapDensity: finite(bar && bar.snapDensity, 0),
      beatStability: clamp(bar && bar.beatStability),
    }))
    .filter((bar) => bar.start !== null && bar.end !== null && bar.end > bar.start)
    .sort((a, b) => a.start - b.start);
}

function boundaryLift(previous, current) {
  const energy = Math.max(0, current.energy - previous.energy) * 1.6;
  const body = Math.max(0, current.bodyDensity - previous.bodyDensity) * 0.9;
  const snap = Math.max(0, current.snapDensity - previous.snapDensity) * 0.9;
  return clamp(energy + body + snap);
}

function phraseCandidates(bars) {
  const candidates = [];
  PHRASE_BAR_COUNTS.forEach((barCount) => {
    if (bars.length < barCount * 2) return;
    const maxOffset = Math.min(barCount - 1, bars.length - barCount * 2);
    for (let offsetBars = 0; offsetBars <= maxOffset; offsetBars += 1) {
      const boundaries = [];
      for (let index = offsetBars + barCount; index < bars.length; index += barCount) {
        boundaries.push(boundaryLift(bars[index - 1], bars[index]));
      }
      if (!boundaries.length) continue;
      const completeGroups = Math.floor((bars.length - offsetBars) / barCount);
      const coverage = clamp((completeGroups * barCount) / bars.length);
      const stability = average(bars.slice(offsetBars, offsetBars + completeGroups * barCount)
        .map((bar) => bar.beatStability));
      const evidence = clamp(boundaries.length / 3);
      const novelty = average(boundaries);
      const score = clamp((stability * 0.35 + novelty * 0.45 + coverage * 0.2) * (0.55 + evidence * 0.45));
      candidates.push({
        barCount,
        offsetBars,
        boundaries: boundaries.length,
        stability,
        score,
      });
    }
  });
  return candidates.sort((a, b) => b.score - a.score
    || b.boundaries - a.boundaries
    || a.barCount - b.barCount
    || a.offsetBars - b.offsetBars);
}

function phraseShadow(profile) {
  const bars = normalizedBars(profile);
  const candidates = phraseCandidates(bars);
  const selected = candidates[0];
  if (!selected) {
    return {
      selectedBars: 8,
      offsetBars: 0,
      confidence: 0,
      candidateCount: 0,
      stable: false,
    };
  }
  const confidence = round(selected.score);
  return {
    selectedBars: selected.barCount,
    offsetBars: selected.offsetBars,
    confidence,
    candidateCount: candidates.length,
    stable: selected.boundaries >= 2 && selected.stability >= 0.7 && confidence >= 0.65,
  };
}

function beatIntervals(profile) {
  const times = (profile && profile.beats || [])
    .map((beat) => finite(beat && beat.time))
    .filter((time) => time !== null)
    .sort((a, b) => a - b);
  const intervals = [];
  for (let index = 1; index < times.length; index += 1) {
    const interval = times[index] - times[index - 1];
    if (interval >= 0.15 && interval <= 2) intervals.push(interval);
  }
  return intervals;
}

function tempoShadow(profile) {
  const intervals = beatIntervals(profile);
  const medianStep = median(intervals);
  if (medianStep === null) {
    return {
      medianStep: null,
      localBpm: null,
      driftRatio: null,
      confidence: 0,
      stable: false,
    };
  }
  const deviation = median(intervals.map((interval) => Math.abs(interval - medianStep))) || 0;
  const driftRatio = deviation / medianStep;
  const confidence = clamp((intervals.length / 32) * (1 - clamp(driftRatio * 4)));
  return {
    medianStep: round(medianStep, 6),
    localBpm: round(60 / medianStep, 2),
    driftRatio: round(driftRatio, 6),
    confidence: round(confidence),
    stable: intervals.length >= 16 && driftRatio <= 0.025 && confidence >= 0.65,
  };
}

function downbeatShadow(profile, tempo) {
  const downbeats = (profile && profile.downbeats || [])
    .map((beat) => ({
      time: finite(beat && beat.time),
      confidence: clamp(beat && beat.confidence, 0, 1),
    }))
    .filter((beat) => beat.time !== null)
    .sort((a, b) => a.time - b.time);
  if (tempo.medianStep === null || downbeats.length < 2) {
    return { confidence: 0, phaseErrorMs: null, stable: false };
  }
  const expectedBar = tempo.medianStep * 4;
  const errors = [];
  for (let index = 1; index < downbeats.length; index += 1) {
    const interval = downbeats[index].time - downbeats[index - 1].time;
    const bars = Math.max(1, Math.round(interval / expectedBar));
    errors.push(Math.abs(interval - expectedBar * bars));
  }
  const phaseErrorMs = (median(errors) || 0) * 1000;
  const confidence = clamp(average(downbeats.map((beat) => beat.confidence))
    * clamp((downbeats.length - 1) / 8)
    * (1 - clamp(phaseErrorMs / 120)));
  return {
    confidence: round(confidence),
    phaseErrorMs: round(phaseErrorMs),
    stable: tempo.stable && downbeats.length >= 4 && phaseErrorMs <= 40 && confidence >= 0.65,
  };
}

function loudnessShadow(profile) {
  const metrics = profile && profile.audioMetrics || {};
  const shortTermLufs = finite(metrics.shortTermLufs);
  const truePeakDbtp = finite(metrics.truePeakDbtp);
  const valid = shortTermLufs !== null
    && truePeakDbtp !== null
    && shortTermLufs >= -80 && shortTermLufs <= 6
    && truePeakDbtp >= -80 && truePeakDbtp <= 6;
  return valid ? {
    available: true,
    shortTermLufs: round(shortTermLufs),
    truePeakDbtp: round(truePeakDbtp),
    reason: '',
  } : {
    available: false,
    shortTermLufs: null,
    truePeakDbtp: null,
    reason: 'measurement-unavailable',
  };
}

function buildShadowDiagnostics(profile = {}) {
  const tempo = tempoShadow(profile);
  return {
    schema: 'cuefield-shadow-v1',
    phrase: phraseShadow(profile),
    tempo,
    downbeat: downbeatShadow(profile, tempo),
    loudness: loudnessShadow(profile),
  };
}

module.exports = {
  buildShadowDiagnostics,
};

