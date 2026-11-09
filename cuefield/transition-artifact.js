const crypto = require('node:crypto');

const { compactVersion } = require('./feedback-log');

const ACTION_FIELDS = [
  't', 'deck', 'op', 'at', 'volume', 'value', 'duration', 'curve', 'type',
  'bpm', 'delayBeats', 'feedback', 'wet', 'tailMs', 'depth', 'pulses',
  'beats', 'attack', 'hold', 'release', 'low', 'mid', 'high', 'enabled',
  'startAt', 'loopBeats', 'slip', 'optionalWhenLate', 'maxLateMs',
];

const STRING_LIMIT = 160;
const TIMELINE_LIMIT = 128;
const FALLBACK_LIMIT = 64;
const MAX_FALLBACK_DEPTH = 2;

function compactString(value, maxLength = STRING_LIMIT) {
  if (typeof value === 'string') return value.slice(0, maxLength);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).slice(0, maxLength);
  if (typeof value === 'boolean') return String(value).slice(0, maxLength);
  return '';
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactTrackIdentity(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const track = source.track && typeof source.track === 'object' && !Array.isArray(source.track)
    ? source.track
    : source;
  return {
    key: compactString(track.key ?? track.id ?? source.key ?? source.id, 120),
    title: compactString(track.title),
    artist: compactString(track.artist),
    duration: finiteOrNull(track.duration),
  };
}

function compactPolicy(value = {}) {
  const policy = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    route: compactString(policy.route, 40),
    level: compactString(policy.level || policy.compatibilityClass, 40),
    reasons: Array.isArray(policy.reasons)
      ? policy.reasons.map((reason) => compactString(reason, 96)).filter(Boolean).slice(0, 4)
      : [],
  };
}

function compactCleanBoundary(value = {}) {
  const diagnostics = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    variant: compactString(diagnostics.variant, 32),
    outgoingBoundaryType: compactString(diagnostics.outgoingBoundaryType, 32),
    incomingBoundaryType: compactString(diagnostics.incomingBoundaryType, 32),
    aDownbeatOffset: finiteOrNull(diagnostics.aDownbeatOffset),
    bDownbeatOffset: finiteOrNull(diagnostics.bDownbeatOffset),
    landingError: finiteOrNull(diagnostics.landingError),
    aOnlyTailDuration: finiteOrNull(diagnostics.aOnlyTailDuration),
    breathDuration: finiteOrNull(diagnostics.breathDuration),
    actualTwoDeckOverlap: finiteOrNull(diagnostics.actualTwoDeckOverlap),
  };
}

function compactCadenceFallback(value = {}) {
  const diagnostics = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    mode: compactString(diagnostics.mode, 32),
    confidence: finiteOrNull(diagnostics.confidence),
    reasons: Array.isArray(diagnostics.reasons)
      ? diagnostics.reasons.map((reason) => compactString(reason, 96)).filter(Boolean).slice(0, 4)
      : [],
    crossfadeDuration: finiteOrNull(diagnostics.crossfadeDuration),
    audibleEnd: finiteOrNull(diagnostics.audibleEnd),
    containerEnd: finiteOrNull(diagnostics.containerEnd),
    bSourceAt: finiteOrNull(diagnostics.bSourceAt),
    bPreRollDuration: finiteOrNull(diagnostics.bPreRollDuration),
  };
}

function compactPrimitive(value) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.slice(0, STRING_LIMIT);
  return undefined;
}

function compactTimeline(value, limit, depth) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((action) => compactAction(action, depth));
}

function compactAction(value, depth = 0) {
  const action = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = {};
  ACTION_FIELDS.forEach((key) => {
    if (key === 'deck') {
      if (action.deck === 'A' || action.deck === 'B') result.deck = action.deck;
      return;
    }
    const compacted = compactPrimitive(action[key]);
    if (compacted !== undefined) result[key] = compacted;
  });
  if (depth < MAX_FALLBACK_DEPTH && Array.isArray(action.fallbackTimeline)) {
    result.fallbackTimeline = compactTimeline(action.fallbackTimeline, FALLBACK_LIMIT, depth + 1);
  }
  return result;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function firstFinite(...values) {
  for (const value of values) {
    const number = finiteOrNull(value);
    if (number !== null) return number;
  }
  return null;
}

function stableJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item) ?? 'null').join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => [key, stableJson(value[key])])
      .filter((entry) => entry[1] !== undefined);
    return `{${entries.map(([key, serialized]) => `${JSON.stringify(key)}:${serialized}`).join(',')}}`;
  }
  return undefined;
}

function computeTransitionArtifactId(artifact) {
  const source = artifact && typeof artifact === 'object' && !Array.isArray(artifact) ? artifact : {};
  const payload = { ...source };
  delete payload.artifactId;
  return crypto.createHash('sha256').update(stableJson(payload)).digest('hex');
}

function integrityFailure() {
  const error = new Error('TRANSITION_ARTIFACT_INTEGRITY_FAILED');
  error.code = 'TRANSITION_ARTIFACT_INTEGRITY_FAILED';
  throw error;
}

function verifyTransitionArtifact(artifact) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) integrityFailure();
  const actual = artifact.artifactId;
  if (typeof actual !== 'string' || !/^[a-f0-9]{64}$/.test(actual)) integrityFailure();
  const expected = computeTransitionArtifactId(artifact);
  if (!crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))) {
    integrityFailure();
  }
  return true;
}

function buildTransitionArtifact({ from, to, chosen, version } = {}) {
  const selected = chosen && typeof chosen === 'object' && !Array.isArray(chosen) ? chosen : {};
  const payload = {
    schema: 'cuefield-transition-artifact-v1',
    from: compactTrackIdentity(from),
    to: compactTrackIdentity(to),
    recipe: compactString(selected.transitionRecipe || selected.recipe, 80),
    policy: compactPolicy(selected.policy),
    protectedUntil: finiteOrNull(selected.protectedUntil),
    mixStart: finiteOrNull(selected.mixStart),
    handoffAt: finiteOrNull(selected.handoffAt),
    entryTime: firstFinite(selected.entryTime, selected.entry && selected.entry.time),
    timeline: compactTimeline(selected.timeline, TIMELINE_LIMIT, 0),
    version: compactVersion(version),
    ...(selected.cleanBoundary ? { cleanBoundary: compactCleanBoundary(selected.cleanBoundary) } : {}),
    ...(selected.cadenceFallback ? { cadenceFallback: compactCadenceFallback(selected.cadenceFallback) } : {}),
  };
  const artifactId = computeTransitionArtifactId(payload);
  return deepFreeze({ ...payload, artifactId });
}

module.exports = {
  ACTION_FIELDS,
  buildTransitionArtifact,
  computeTransitionArtifactId,
  verifyTransitionArtifact,
};

