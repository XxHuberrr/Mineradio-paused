'use strict';

const LANDING_TOLERANCE_SEC = 0.05;

const OVERLAP_CONTRACTS = Object.freeze({
  'clean-boundary-handoff': Object.freeze({ min: 0, max: 0 }),
  'end-of-track-crossfade': Object.freeze({ min: 0.1, max: 3 }),
  'quick-safe-fade': Object.freeze({ min: 1.2, max: 2.6 }),
  'safety-long-blend': Object.freeze({ min: 3, max: 8 }),
  'filtered-pickup': Object.freeze({ min: 2.5, max: 4.5 }),
  'bass-eq-handoff': Object.freeze({ min: 2.5, max: 4.5 }),
  'intro-outro-long-blend': Object.freeze({ min: 5, max: 9 }),
  'echo-out': Object.freeze({ min: 1.5, max: 3.5 }),
  'spectral-emergence': Object.freeze({ min: 5, max: 7.5 }),
  'harmonic-double-drop': Object.freeze({ min: 1, max: 2.5 }),
  'tease-roll-double-drop': Object.freeze({ min: 0.8, max: 1.6 }),
  'source-loop-roll': Object.freeze({ min: 1.5, max: 3.5 }),
  'hook-teaser': Object.freeze({ min: 2, max: 4 }),
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function fallbackListenFloor(durationSec) {
  const duration = Math.max(0, Number(durationSec) || 0);
  if (duration <= 0) return 0;
  return round(Math.max(0, Math.min(
    duration - 12,
    Math.max(24, Math.min(72, duration * 0.35)),
  )));
}

function resolveListeningFloor(structureMap, durationSec) {
  const map = structureMap || {};
  const duration = Math.max(0, Number(durationSec) || 0);
  const protectedUntil = Number(map.protectedUntil);
  const confidence = Number(map.structureConfidence ?? map.confidence);
  const trustedSource = map.structureSource === 'lyric+beat'
    || map.structureSource === 'beat-only';
  const trusted = trustedSource
    && confidence >= 0.6
    && Number.isFinite(protectedUntil)
    && protectedUntil >= 0
    && protectedUntil <= duration;
  return trusted ? round(protectedUntil) : fallbackListenFloor(duration);
}

function overlapContractFor(recipe) {
  const contract = OVERLAP_CONTRACTS[String(recipe || '')]
    || OVERLAP_CONTRACTS['clean-boundary-handoff'];
  return { min: contract.min, max: contract.max };
}

function scoreOverlapContract(overlapSec, contract) {
  const overlap = Number(overlapSec);
  const min = Number(contract && contract.min);
  const max = Number(contract && contract.max);
  if (!Number.isFinite(overlap)
    || !Number.isFinite(min)
    || !Number.isFinite(max)
    || min < 0
    || max < min) return 0;
  if (overlap >= min && overlap <= max) return 1;
  const distance = overlap < min ? min - overlap : overlap - max;
  const scale = Math.max(0.5, max - min);
  return round(clamp(1 - distance / scale, 0, 1));
}

module.exports = {
  LANDING_TOLERANCE_SEC,
  fallbackListenFloor,
  overlapContractFor,
  resolveListeningFloor,
  scoreOverlapContract,
};

