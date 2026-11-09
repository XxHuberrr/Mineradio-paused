'use strict';

const KNOWN_VOCAL_STATES = new Set(['ended', 'active', 'unknown', 'inactive']);

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

function sourceFamily(value) {
  const source = String(value || '').trim().toLowerCase();
  if (['lyric', 'lyrics', 'lrc'].includes(source)) return 'lyric';
  if (['audio-envelope', 'rms', 'level'].includes(source)) return 'audio-envelope';
  if (['spectral-change', 'spectrum'].includes(source)) return 'spectral-change';
  if (['beat-grid', 'bar', 'downbeat'].includes(source)) return 'beat-grid';
  if (['section', 'structure'].includes(source)) return 'section';
  if (['stem', 'vocal-stem', 'accompaniment-stem'].includes(source)) return 'stem';
  return '';
}

function evidenceFamilies(value) {
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map(sourceFamily)
    .filter(Boolean)));
}

function normalizedVocalState(value) {
  const state = String(value || '').trim().toLowerCase();
  return KNOWN_VOCAL_STATES.has(state) ? state : 'unknown';
}

function evaluateCadenceBoundary(evidence = {}, context = {}) {
  const reasons = [];
  const confidence = finiteOrNull(evidence.confidence);
  const audioDistance = finiteOrNull(evidence.audioBoundaryDistance);
  const barDistance = finiteOrNull(evidence.barBoundaryDistance);
  const before = finiteOrNull(evidence.levelBeforeDb);
  const after = finiteOrNull(evidence.levelAfterDb);
  const spectralChange = finiteOrNull(evidence.spectralChange);
  const silenceAfterMs = finiteOrNull(evidence.silenceAfterMs);
  const silenceAfterDb = finiteOrNull(evidence.silenceAfterDb);
  const vocalState = normalizedVocalState(evidence.vocalState);
  const families = evidenceFamilies(evidence.sources);
  const supportFamilies = families.filter((family) => family !== 'lyric');
  const hasAudio = families.some((family) => (
    family === 'audio-envelope' || family === 'spectral-change' || family === 'stem'
  ));
  const hasBar = families.includes('beat-grid');

  if (!hasAudio || audioDistance === null || audioDistance > 0.1) {
    reasons.push('audio-boundary-missing');
  }
  if (!hasBar || barDistance === null || barDistance > 0.1) {
    reasons.push('bar-boundary-missing');
  }
  if (supportFamilies.length < 2) reasons.push('evidence-consensus-missing');
  if (confidence === null || confidence < 0.72) reasons.push('boundary-confidence-low');
  if (vocalState === 'active') reasons.push('vocal-active');
  if (vocalState === 'unknown' && context.timedVocalSection === true) {
    const measuredSilence = silenceAfterMs !== null
      && silenceAfterMs >= 120
      && silenceAfterDb !== null
      && silenceAfterDb <= -45;
    if (!measuredSilence) reasons.push('vocal-state-unknown');
  }

  const levelDrop = before === null || after === null ? null : before - after;
  const strongSectionChange = spectralChange !== null
    && spectralChange >= 0.65
    && families.includes('section');
  if (levelDrop === null || (levelDrop < 3 && !strongSectionChange)) {
    reasons.push('post-boundary-energy-continues');
  }

  return {
    eligible: reasons.length === 0,
    confidence: confidence === null ? 0 : round(Math.max(0, Math.min(1, confidence))),
    reasons: Array.from(new Set(reasons)).slice(0, 8),
  };
}

function chooseEndCrossfadeDuration(options = {}) {
  const fromAvailable = Math.max(0, finiteOrNull(options.fromAvailable) || 0);
  const toDuration = Math.max(0, finiteOrNull(options.toDuration) || 0);
  const fromVocalState = normalizedVocalState(options.fromVocalState);
  const toVocalState = normalizedVocalState(options.toVocalState);
  const foregroundSafe = fromVocalState === 'inactive' && toVocalState === 'inactive';
  const requested = finiteOrNull(options.requestedDuration);
  const target = foregroundSafe
    ? Math.max(0.8, Math.min(3, requested === null ? 2 : requested))
    : Math.max(0.8, Math.min(1.6, requested === null ? 0.8 : requested));
  return round(Math.min(target, fromAvailable, toDuration));
}

module.exports = {
  evaluateCadenceBoundary,
  chooseEndCrossfadeDuration,
};

