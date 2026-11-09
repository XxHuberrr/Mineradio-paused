const fs = require('fs');
const path = require('path');

const CUEFIELD_VERSION_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function roundNumber(value, digits = 3) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = Math.pow(10, digits);
  return Math.round(n * factor) / factor;
}

function compactString(value, maxLength = 160) {
  const text = String(value == null ? '' : value).trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function compactVersion(version = {}) {
  const source = version && typeof version === 'object' && !Array.isArray(version) ? version : {};
  return {
    buildSha: compactString(source.buildSha, 40) || 'dev',
    plannerVersion: compactString(source.plannerVersion, 48) || 'legacy-planner',
    runtimeVersion: compactString(source.runtimeVersion, 48) || 'legacy-runtime',
    capabilityLevel: compactString(source.capabilityLevel, 40) || 'whole-track-baseline',
    stemAnalyzer: compactString(source.stemAnalyzer, 40),
    stemModelVersion: compactString(source.stemModelVersion, 64),
    auditionCohort: compactString(source.auditionCohort, 48) || 'live',
    variantId: compactString(source.variantId, 48) || 'current',
  };
}

function compactList(value, maxItems = 8) {
  return Array.isArray(value)
    ? value.slice(0, maxItems).map((item) => compactString(item, 80)).filter(Boolean)
    : [];
}

function presentValue(value) {
  if (value == null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

function firstPresent(...values) {
  return values.find(presentValue);
}

function normalizeHookCount(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

function normalizeSustainedEnergy(value) {
  if (typeof value === 'boolean') return value;
  return typeof value === 'number' ? roundNumber(value) : null;
}

function compactRejectionReasons(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((reason) => compactString(reason, 96)).filter(Boolean))).slice(0, 8);
}

function compactRouteReasons(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((reason) => compactString(reason, 96)).filter(Boolean))).slice(0, 4);
}

function compactTerminalRescueClass(value) {
  const normalized = compactString(value, 1).toUpperCase();
  return ['A', 'B', 'C'].includes(normalized) ? normalized : '';
}

function compactPreferredExitRange(value) {
  if (!Array.isArray(value) || value.length !== 2) return [];
  const range = value.map(Number);
  if (!range.every(Number.isFinite)) return [];
  const bounded = range.map((number) => roundNumber(Math.max(0, Math.min(1, number))));
  return [Math.min(...bounded), Math.max(...bounded)];
}

function compactFakeOutMs(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.max(0, Math.min(200, number))) : null;
}

function compactWindow(window = {}) {
  return {
    firstHookStart: roundNumber(window.firstHookStart),
    firstHookEnd: roundNumber(window.firstHookEnd),
    hookConfidence: roundNumber(window.hookConfidence),
    hookEvidence: {
      repeatedLineCount: normalizeHookCount(window.hookEvidence && window.hookEvidence.repeatedLineCount),
      repeatedBlockCount: normalizeHookCount(window.hookEvidence && window.hookEvidence.repeatedBlockCount),
      energyLift: roundNumber(window.hookEvidence && window.hookEvidence.energyLift),
      sustainedEnergy: normalizeSustainedEnergy(window.hookEvidence && window.hookEvidence.sustainedEnergy),
    },
    exitRatio: roundNumber(window.exitRatio),
    effectiveSourceEnd: roundNumber(window.effectiveSourceEnd),
    mixStart: roundNumber(window.mixStart),
    handoffAt: roundNumber(window.handoffAt),
    landingAt: roundNumber(window.landingAt),
    audibleOverlap: roundNumber(window.audibleOverlap),
    preRollDuration: roundNumber(window.preRollDuration),
    energyContinuity: roundNumber(window.energyContinuity),
    grooveContinuity: roundNumber(window.grooveContinuity),
    tempoCompatibility: roundNumber(window.tempoCompatibility),
    rejectionReasons: compactRejectionReasons(window.rejectionReasons != null ? window.rejectionReasons : window.windowRejectionReasons),
  };
}

function normalizeRating(value) {
  const rating = Number(value);
  if (rating !== 1 && rating !== 2 && rating !== 3) {
    const err = new Error('RATING_MUST_BE_1_2_OR_3');
    err.code = 'RATING_MUST_BE_1_2_OR_3';
    throw err;
  }
  return rating;
}

function compactPair(pair = {}) {
  return {
    fromKey: compactString(pair.fromKey, 120),
    toKey: compactString(pair.toKey, 120),
    fromTitle: compactString(pair.fromTitle, 160),
    fromArtist: compactString(pair.fromArtist, 160),
    toTitle: compactString(pair.toTitle, 160),
    toArtist: compactString(pair.toArtist, 160),
  };
}

function boundedRoundedNumber(value, min, max, fallback = null) {
  const rounded = roundNumber(value);
  if (rounded === null) return fallback;
  return Math.max(min, Math.min(max, rounded));
}

function validatedRoundedNumber(value, min, max) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return roundNumber(number);
}

function sanitizeShadowSide(value) {
  const source = isPlainObject(value) ? value : {};
  const phrase = isPlainObject(source.phrase) ? source.phrase : {};
  const tempo = isPlainObject(source.tempo) ? source.tempo : {};
  const downbeat = isPlainObject(source.downbeat) ? source.downbeat : {};
  const loudness = isPlainObject(source.loudness) ? source.loudness : {};
  const selectedBars = [4, 8, 16, 32].includes(Number(phrase.selectedBars))
    ? Number(phrase.selectedBars)
    : 8;
  const shortTermLufs = validatedRoundedNumber(loudness.shortTermLufs, -80, 6);
  const truePeakDbtp = validatedRoundedNumber(loudness.truePeakDbtp, -80, 6);
  const loudnessAvailable = loudness.available === true
    && shortTermLufs !== null
    && truePeakDbtp !== null;

  return {
    phrase: {
      selectedBars,
      offsetBars: Math.round(boundedRoundedNumber(phrase.offsetBars, 0, 31, 0)),
      confidence: boundedRoundedNumber(phrase.confidence, 0, 1, 0),
      candidateCount: Math.round(boundedRoundedNumber(phrase.candidateCount, 0, 128, 0)),
      stable: phrase.stable === true,
    },
    tempo: {
      medianStep: validatedRoundedNumber(tempo.medianStep, 0.1, 4),
      localBpm: validatedRoundedNumber(tempo.localBpm, 20, 400),
      driftRatio: validatedRoundedNumber(tempo.driftRatio, 0, 1),
      confidence: boundedRoundedNumber(tempo.confidence, 0, 1, 0),
      stable: tempo.stable === true,
    },
    downbeat: {
      confidence: boundedRoundedNumber(downbeat.confidence, 0, 1, 0),
      phaseErrorMs: validatedRoundedNumber(downbeat.phaseErrorMs, 0, 5000),
      stable: downbeat.stable === true,
    },
    loudness: {
      available: loudnessAvailable,
      shortTermLufs: loudnessAvailable ? shortTermLufs : null,
      truePeakDbtp: loudnessAvailable ? truePeakDbtp : null,
      reason: compactString(loudness.reason, 40),
    },
  };
}

function sanitizeShadowDiagnostics(value) {
  if (!isPlainObject(value)
    || value.schema !== 'cuefield-shadow-v1'
    || !isPlainObject(value.from)
    || !isPlainObject(value.to)) {
    return null;
  }
  return {
    schema: 'cuefield-shadow-v1',
    from: sanitizeShadowSide(value.from),
    to: sanitizeShadowSide(value.to),
  };
}

function compactDiagnostics(diagnostics = {}) {
  const source = isPlainObject(diagnostics) ? diagnostics : {};
  const compact = {
    outroCompleteness: roundNumber(source.outroCompleteness),
    bIntroAggression: roundNumber(source.bIntroAggression),
    styleTextureDistance: roundNumber(source.styleTextureDistance),
  };
  const shadow = sanitizeShadowDiagnostics(source.shadow);
  if (shadow) compact.shadow = shadow;
  return compact;
}

function compactBridge(transition = {}) {
  return {
    selected: transition.bridgeSelected === true,
    template: compactString(transition.bridgeTemplate, 32),
    bars: [4, 8, 16].includes(Number(transition.bridgeBars)) ? Number(transition.bridgeBars) : null,
    climaxType: compactString(transition.bridgeClimaxType, 16),
    climaxTime: roundNumber(transition.bridgeClimaxTime),
    climaxConfidence: roundNumber(transition.bridgeClimaxConfidence),
    lyricLinkScore: roundNumber(transition.lyricLinkScore),
    lyricLinkReasons: compactList(transition.lyricLinkReasons, 4),
  };
}

function compactMusical(transition = {}) {
  return {
    evidence: transition.musicalEvidence === true,
    compatibility: roundNumber(transition.musicalCompatibility),
    harmonicSimilarity: roundNumber(transition.harmonicSimilarity),
    keyCompatibility: roundNumber(transition.keyCompatibility),
    melodySimilarity: roundNumber(transition.melodySimilarity),
    risks: compactList(transition.musicalRisks, 3),
  };
}

function compactLocalMusical(transition = {}) {
  const local = transition.localMusical || {};
  // Prefer canonical nested records, then migrate interim nested keys, then use flat planner fields.
  const value = (flatField, ...nestedFields) => roundNumber(firstPresent(
    ...nestedFields.map((field) => local[field]),
    transition[flatField],
  ));
  const evidence = firstPresent(local.evidence, transition.localMusicalEvidence);
  const risks = firstPresent(local.risks, transition.localMusicalRisks);
  return {
    evidence: evidence === true,
    compatibility: value('localMusicalCompatibility', 'compatibility'),
    harmonicSimilarity: value('localHarmonicSimilarity', 'harmonicSimilarity'),
    keyCompatibility: value('localKeyCompatibility', 'keyCompatibility'),
    melodySimilarity: value('localMelodySimilarity', 'melodySimilarity'),
    confidence: value('localMusicalConfidence', 'confidence'),
    aWindowStart: value('localAWindowStart', 'aWindowStart'),
    bWindowStart: value('localBWindowStart', 'bWindowStart'),
    aDistance: value('localAWindowDistance', 'aDistance', 'aWindowDistance'),
    bDistance: value('localBWindowDistance', 'bDistance', 'bWindowDistance'),
    risks: compactList(risks, 3),
  };
}

function compactStructure(transition = {}) {
  return {
    source: compactString(transition.structureSource || transition.source, 24),
    confidence: roundNumber(transition.structureConfidence == null ? transition.confidence : transition.structureConfidence),
    protectedUntil: roundNumber(transition.protectedUntil),
    exitType: compactString(transition.exitType, 32),
    exitConfidence: roundNumber(transition.exitConfidence),
    entryType: compactString(transition.entryType, 32),
    entryConfidence: roundNumber(transition.entryConfidence),
    exitCandidateCount: Math.max(0, Math.min(12, Number(transition.exitCandidateCount) || 0)),
    entryCandidateCount: Math.max(0, Math.min(12, Number(transition.entryCandidateCount) || 0)),
  };
}

function compactTransition(transition = {}) {
  const structure = transition.structure || transition;
  return {
    recipe: compactString(transition.recipe, 80),
    transitionRecipe: compactString(transition.transitionRecipe, 80),
    executionMode: compactString(transition.executionMode, 80),
    tier: compactString(transition.tier, 60),
    score: roundNumber(transition.score),
    evalScore: roundNumber(transition.evalScore),
    exitTime: roundNumber(transition.exitTime),
    entryTime: roundNumber(transition.entryTime),
    overlapClass: compactString(transition.overlapClass, 24),
    overlapDuration: roundNumber(transition.overlapDuration),
    entrySource: compactString(transition.entrySource, 24),
    entryConfidence: roundNumber(transition.entryConfidence),
    bpmA: roundNumber(transition.bpmA),
    bpmB: roundNumber(transition.bpmB),
    relativeTempoDelta: roundNumber(transition.relativeTempoDelta),
    beatGridTrusted: transition.beatGridTrusted === true,
    impactEligible: transition.impactEligible === true,
    teaserUsed: transition.teaserUsed === true,
    fakeOutMs: compactFakeOutMs(transition.fakeOutMs),
    impactFallbackRecipe: compactString(transition.impactFallbackRecipe, 80),
    runtimeDowngrade: compactString(transition.runtimeDowngrade, 40),
    setMode: ['sequential', 'smart'].includes(transition.setMode) ? transition.setMode : '',
    minimumListenUntil: roundNumber(transition.minimumListenUntil),
    musical: compactMusical(transition),
    localMusical: compactLocalMusical(transition),
    bridge: compactBridge(transition),
    route: compactString(transition.route, 40),
    compatibilityClass: compactString(transition.compatibilityClass, 40),
    contrastDirection: compactString(transition.contrastDirection, 40),
    preferredExitRange: compactPreferredExitRange(transition.preferredExitRange),
    routeReasons: compactRouteReasons(transition.routeReasons),
    routeFallbackUsed: transition.routeFallbackUsed === true,
    terminalRescueClass: compactTerminalRescueClass(transition.terminalRescueClass),
    terminalRescueReason: compactString(transition.terminalRescueReason, 40),
    diagnostics: compactDiagnostics(transition.diagnostics),
    structure: compactStructure(structure),
    risks: compactList(transition.risks),
    window: compactWindow(transition.window || transition),
  };
}

function safeParseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch (err) {
    return null;
  }
}

function emptyBucket(key) {
  return { key, total: 0, passed: 0, failed: 0, pending: 0, passRate: 0 };
}

function addToBucket(map, key, rating) {
  const bucketKey = compactString(key || 'unknown', 120) || 'unknown';
  if (!map.has(bucketKey)) map.set(bucketKey, emptyBucket(bucketKey));
  const bucket = map.get(bucketKey);
  bucket.total += 1;
  if (rating === 1) bucket.passed += 1;
  else if (rating === 2) bucket.failed += 1;
  else if (rating === 3) bucket.pending += 1;
}

function finalizeBuckets(map) {
  return Array.from(map.values())
    .map((bucket) => ({
      ...bucket,
      passRate: roundNumber(bucket.total ? bucket.passed / bucket.total : 0),
    }))
    .sort((a, b) => b.total - a.total || b.failed - a.failed || a.key.localeCompare(b.key));
}

function isPlainObject(value) {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function feedbackCohort(record) {
  const version = record && record.version;
  if (!record || record.schema !== 'cuefield-feedback-v2' || !isPlainObject(version)
    || typeof version.buildSha !== 'string' || !version.buildSha.trim()
    || typeof version.auditionCohort !== 'string' || !version.auditionCohort.trim()) {
    return 'legacy-unversioned';
  }
  const compacted = compactVersion(version);
  if (!CUEFIELD_VERSION_IDENTIFIER.test(compacted.buildSha)
    || !CUEFIELD_VERSION_IDENTIFIER.test(compacted.auditionCohort)) {
    return 'legacy-unversioned';
  }
  return `${compacted.auditionCohort}@${compacted.buildSha}`;
}

function buildCuefieldFeedbackRecord(input = {}, now = new Date()) {
  return {
    schema: 'cuefield-feedback-v2',
    version: compactVersion(input.version),
    createdAt: now.toISOString(),
    rating: normalizeRating(input.rating),
    note: compactString(input.note, 240),
    pair: compactPair(input.pair),
    transition: compactTransition(input.transition),
  };
}

function appendCuefieldFeedback(filePath, input = {}, now = new Date()) {
  const record = buildCuefieldFeedbackRecord(input, now);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n');
  return record;
}

function readCuefieldFeedbackStats(filePath) {
  const byCohort = new Map();
  const byRecipe = new Map();
  const byTier = new Map();
  const byOverlapClass = new Map();
  const byRisk = new Map();
  const byPair = new Map();
  const ratingCounts = { 1: 0, 2: 0, 3: 0 };
  const failedSamples = [];
  const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const records = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(safeParseJsonLine).filter(Boolean);

  records.forEach((record) => {
    const rating = Number(record.rating);
    if (rating !== 1 && rating !== 2 && rating !== 3) return;
    const pair = record.pair || {};
    const transition = record.transition || {};
    const recipe = transition.transitionRecipe || transition.recipe || transition.executionMode || 'unknown';
    const tier = transition.tier || 'unknown';
    const pairKey = [pair.fromTitle || pair.fromKey || 'A', pair.toTitle || pair.toKey || 'B'].join(' -> ');

    ratingCounts[rating] += 1;
    addToBucket(byCohort, feedbackCohort(record), rating);
    addToBucket(byRecipe, recipe, rating);
    addToBucket(byTier, tier, rating);
    addToBucket(byOverlapClass, transition.overlapClass || 'unknown', rating);
    addToBucket(byPair, pairKey, rating);
    (Array.isArray(transition.risks) && transition.risks.length ? transition.risks : ['none'])
      .forEach((risk) => addToBucket(byRisk, risk, rating));

    if (rating !== 1) {
      failedSamples.push({
        createdAt: compactString(record.createdAt, 40),
        rating,
        note: compactString(record.note, 180),
        pair: compactPair(pair),
        transition: compactTransition(transition),
      });
    }
  });

  const total = ratingCounts[1] + ratingCounts[2] + ratingCounts[3];
  return {
    total,
    allVersions: true,
    ratingCounts,
    passRate: roundNumber(total ? ratingCounts[1] / total : 0),
    byCohort: finalizeBuckets(byCohort),
    byRecipe: finalizeBuckets(byRecipe),
    byTier: finalizeBuckets(byTier),
    byOverlapClass: finalizeBuckets(byOverlapClass),
    byRisk: finalizeBuckets(byRisk),
    byPair: finalizeBuckets(byPair).slice(0, 20),
    failedSamples: failedSamples
      .sort((a, b) => a.rating - b.rating || String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 20),
  };
}

module.exports = {
  appendCuefieldFeedback,
  buildCuefieldFeedbackRecord,
  compactPair,
  compactLocalMusical,
  compactString,
  compactVersion,
  feedbackCohort,
  readCuefieldFeedbackStats,
  sanitizeShadowDiagnostics,
  compactTransition,
};
