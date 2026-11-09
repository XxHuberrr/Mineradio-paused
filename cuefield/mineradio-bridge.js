const { analyzeSectionCandidates } = require('./section-candidates');
const { normalizeMineradioBeatMap } = require('./adapter-mineradio');
const { buildCueProfile } = require('./cue-profile');
const { parseLrc } = require('./lrc-anchors');
const { buildStructureMap } = require('./structure-map');
const { chooseTransitionWindow } = require('./transition-window-planner');
const { scoreLyricLink } = require('./lyric-link');
const { planBridge, trustedClimax } = require('./bridge-planner');
const { buildTransitionArtifact } = require('./transition-artifact');
const { resolveListeningFloor } = require('./planner-contracts');

function toTrack(entry, fallbackKey) {
  const meta = entry && entry.meta || {};
  return {
    id: entry && entry.key || fallbackKey || '',
    title: meta.title || entry && entry.title || fallbackKey || '',
    artist: meta.artist || entry && entry.artist || '',
    duration: entry && entry.map && entry.map.duration || 0,
  };
}

function entryFromCache(readBeatMapCache, key) {
  const entry = readBeatMapCache(key);
  if (!entry || !entry.map) {
    const err = new Error(`BEATMAP_CACHE_MISS:${key}`);
    err.code = 'BEATMAP_CACHE_MISS';
    throw err;
  }
  return entry;
}

function parseMaybeLrc(value) {
  return value ? parseLrc(String(value)) : [];
}

function normalizedFixture(entry, key) {
  const track = toTrack(entry, key);
  const analysis = normalizeMineradioBeatMap(track, entry.map || {});
  return {
    track,
    map: {
      ...(entry.map || {}),
      duration: analysis.track.duration,
      gridStep: analysis.analysis.gridStep,
      beats: analysis.analysis.beats,
      gridBeats: analysis.analysis.gridBeats,
    },
  };
}

function analyzeCacheEntry(entry, key, lrcText) {
  const fixture = normalizedFixture(entry, key);
  const lrcLines = parseMaybeLrc(lrcText);
  const analysis = analyzeSectionCandidates({
    fixture,
    lrcLines,
  });
  const baseProfile = buildCueProfile({
    track: analysis.track,
    map: fixture.map,
    candidates: analysis.candidates,
  });
  const structureMap = buildStructureMap({ profile: baseProfile, lrcLines });
  const candidates = [
    ...analysis.candidates,
    ...structureMap.exitCandidates,
    ...structureMap.entryCandidates,
  ];
  return {
    ...analysis,
    candidates,
    structureMap,
    musicalProfile: fixture.map.musicalProfile || null,
    cueProfile: buildCueProfile({
      track: analysis.track,
      map: fixture.map,
      candidates,
    }),
  };
}

function credibleFirstHook(structureMap) {
  return (structureMap && structureMap.sections || []).find((section) => (
    section
    && structureMap.structureSource === 'lyric+beat'
    && String(section.type || '').toLowerCase() === 'hook'
    && Number(section.confidence) >= 0.65
  )) || null;
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactString(value, maxLength) {
  const text = String(value == null ? '' : value).trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function compactCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(24, Math.round(number))) : 0;
}

function normalizeRecentRecipes(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((recipe) => typeof recipe === 'string')
    .map((recipe) => compactString(recipe, 80))
    .filter(Boolean)
    .slice(-2);
}

function cachedEdgeEvidence(entry) {
  const map = entry && entry.map || {};
  const source = map.edgeEvidence;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const duration = finiteOrNull(map.duration);
  const audibleStart = finiteOrNull(source.audibleStart);
  const audibleEnd = finiteOrNull(source.audibleEnd);
  const containerEnd = finiteOrNull(source.containerEnd);
  const confidence = finiteOrNull(source.confidence);
  if (duration === null || duration <= 0 || audibleStart === null || audibleEnd === null
      || containerEnd === null || confidence === null) return null;
  if (audibleStart < 0 || audibleStart > 5.05 || audibleEnd < audibleStart
      || containerEnd <= 0 || audibleEnd > containerEnd + 0.05
      || Math.abs(containerEnd - duration) > 0.5 || confidence < 0.5 || confidence > 1) return null;
  return {
    audibleStart,
    audibleEnd: Math.min(audibleEnd, containerEnd, duration),
    containerEnd: Math.min(containerEnd, duration),
    confidence,
  };
}

function buildLiveTailEvidence(fromEntry, toEntry) {
  const from = cachedEdgeEvidence(fromEntry);
  const to = cachedEdgeEvidence(toEntry);
  if (!from || !to) return null;
  return {
    audibleEnd: from.audibleEnd,
    containerEnd: from.containerEnd,
    toAudibleStart: to.audibleStart,
    requestedDuration: 1.6,
    fromVocalState: 'unknown',
    toVocalState: 'unknown',
    confidence: Math.round(Math.min(from.confidence, to.confidence) * 1000) / 1000,
  };
}

function trustedExecutableWindowPlan(windowPlan) {
  const chosen = windowPlan && windowPlan.chosen || {};
  const recipe = String(chosen.recipeCandidate && chosen.recipeCandidate.recipe || '');
  const timeline = Array.isArray(chosen.timeline) ? chosen.timeline : [];
  const tier = String(chosen.sectionChoice && chosen.sectionChoice.evaluation
    && chosen.sectionChoice.evaluation.tier || '');
  const trustedTier = ['magic', 'usable', 'usable_but_not_magic'].includes(tier);
  return chosen.technicalFailure !== true
    && recipe !== ''
    && recipe !== 'technical-failure'
    && recipe !== 'honest-start-fallback'
    && trustedTier
    && timeline.some((action) => action && action.op === 'handoff');
}

function validLiveEndCrossfadeWindow(windowPlan) {
  const chosen = windowPlan && windowPlan.chosen || {};
  const timeline = Array.isArray(chosen.timeline) ? chosen.timeline : [];
  const play = timeline.filter((action) => action && action.deck === 'B' && action.op === 'play');
  const duration = finiteOrNull(chosen.cadenceFallback && chosen.cadenceFallback.crossfadeDuration);
  return chosen.technicalFailure !== true
    && chosen.recipeCandidate && chosen.recipeCandidate.recipe === 'end-of-track-crossfade'
    && play.length === 1
    && finiteOrNull(play[0].at) === 0
    && duration !== null
    && duration > 0
    && finiteOrNull(chosen.mixStart) !== null
    && finiteOrNull(chosen.handoffAt) !== null
    && chosen.handoffAt > chosen.mixStart;
}

const BOUNDARY_SOURCE_LABELS = new Set([
  'audio-envelope',
  'spectral-change',
  'beat-grid',
  'lyric',
  'section',
  'stem',
]);

function compactNumericFields(source, fields) {
  const result = {};
  fields.forEach((field) => {
    const value = finiteOrNull(source && source[field]);
    if (value !== null) result[field] = value;
  });
  return result;
}

function normalizeBoundaryEvidence(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .slice(0, 16)
    .map((item) => ({
      ...compactNumericFields(item, [
        'time',
        'audioBoundaryDistance',
        'barBoundaryDistance',
        'levelBeforeDb',
        'levelAfterDb',
        'levelDropDb',
        'spectralChange',
        'sustainRatio',
        'silenceAfterMs',
        'silenceAfterDb',
        'confidence',
      ]),
      vocalState: ['ended', 'active', 'unknown', 'inactive'].includes(String(item.vocalState))
        ? String(item.vocalState)
        : 'unknown',
      sources: Array.from(new Set((Array.isArray(item.sources) ? item.sources : [])
        .map((source) => String(source || '').trim().toLowerCase())
        .filter((source) => BOUNDARY_SOURCE_LABELS.has(source))))
        .slice(0, 5),
    }));
}

function normalizeTailEvidence(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = compactNumericFields(source, [
    'audibleEnd',
    'containerEnd',
    'toAudibleStart',
    'requestedDuration',
    'confidence',
  ]);
  result.fromVocalState = ['ended', 'active', 'unknown', 'inactive'].includes(String(source.fromVocalState))
    ? String(source.fromVocalState)
    : 'unknown';
  result.toVocalState = ['ended', 'active', 'unknown', 'inactive'].includes(String(source.toVocalState))
    ? String(source.toVocalState)
    : 'unknown';
  return result;
}

function compactCadenceFallback(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    mode: compactString(value.mode, 32),
    confidence: finiteOrNull(value.confidence),
    reasons: Array.isArray(value.reasons)
      ? value.reasons.map((reason) => compactString(reason, 96)).filter(Boolean).slice(0, 4)
      : [],
    crossfadeDuration: finiteOrNull(value.crossfadeDuration),
    audibleEnd: finiteOrNull(value.audibleEnd),
    containerEnd: finiteOrNull(value.containerEnd),
    bSourceAt: finiteOrNull(value.bSourceAt),
    bPreRollDuration: finiteOrNull(value.bPreRollDuration),
  };
}

function compactTrack(track = {}) {
  return {
    id: compactString(track.id, 120),
    title: compactString(track.title, 160),
    artist: compactString(track.artist, 160),
    duration: finiteOrNull(track.duration),
  };
}

function compactStructureMap(structureMap = {}) {
  return {
    structureSource: compactString(structureMap.structureSource, 24),
    structureConfidence: finiteOrNull(structureMap.structureConfidence),
    protectedUntil: finiteOrNull(structureMap.protectedUntil),
    exitCandidateCount: compactCount((structureMap.exitCandidates || []).length),
    entryCandidateCount: compactCount((structureMap.entryCandidates || []).length),
    exitCandidates: compactTransitionCandidates(structureMap.exitCandidates, 8),
    entryCandidates: compactTransitionCandidates(structureMap.entryCandidates, 6),
  };
}

function compactAnalysisSummary(analysis = {}) {
  return {
    track: compactTrack(analysis.track),
    structureMap: compactStructureMap(analysis.structureMap),
  };
}

function compactTransitionPoint(point) {
  if (!point) return null;
  return {
    type: compactString(point.type, 32),
    role: compactString(point.role, 16),
    source: compactString(point.source, 24),
    time: finiteOrNull(point.time),
    confidence: finiteOrNull(point.confidence),
    playFrom: finiteOrNull(point.playFrom),
    landingAt: finiteOrNull(point.landingAt),
    landingType: compactString(point.landingType, 32),
  };
}

function compactTransitionCandidates(candidates, limit) {
  return (Array.isArray(candidates) ? candidates : [])
    .slice(0, limit)
    .map(compactTransitionPoint)
    .filter(Boolean);
}

function compactCleanBoundaryDiagnostics(selected, recipeCandidate) {
  if (!recipeCandidate || recipeCandidate.recipe !== 'clean-boundary-handoff') return null;
  const anchors = recipeCandidate.anchors || {};
  const window = recipeCandidate.window || {};
  const exit = selected && selected.exit || {};
  const entry = selected && selected.entry || {};
  return {
    variant: compactString(recipeCandidate.variant || window.variant, 32),
    outgoingBoundaryType: compactString(exit.type, 32),
    incomingBoundaryType: compactString(entry.landingType || entry.type, 32),
    aDownbeatOffset: finiteOrNull(anchors.aDownbeatOffset),
    bDownbeatOffset: finiteOrNull(anchors.bDownbeatOffset),
    landingError: finiteOrNull(window.landingError),
    aOnlyTailDuration: finiteOrNull(window.aOnlyTailDuration),
    breathDuration: finiteOrNull(window.breathDuration),
    actualTwoDeckOverlap: finiteOrNull(window.actualTwoDeckOverlap),
  };
}

function compactBridgePlan(plan) {
  if (!plan) return null;
  return {
    template: compactString(plan.template, 32),
    bars: finiteOrNull(plan.bars),
    bpmFrom: finiteOrNull(plan.bpmFrom),
    bpmTo: finiteOrNull(plan.bpmTo),
    climax: plan.climax ? {
      time: finiteOrNull(plan.climax.time),
      type: compactString(plan.climax.type, 16),
      confidence: finiteOrNull(plan.climax.confidence),
    } : null,
    stageDurations: Array.isArray(plan.stageDurations) ? plan.stageDurations.slice(0, 3).map(finiteOrNull) : [],
    totalDuration: finiteOrNull(plan.totalDuration),
    predictedScore: finiteOrNull(plan.predictedScore),
    improvement: finiteOrNull(plan.improvement),
    lyricLinkScore: finiteOrNull(plan.lyricLinkScore),
    reasons: Array.isArray(plan.reasons) ? plan.reasons.slice(0, 4).map((reason) => compactString(reason, 40)) : [],
  };
}

function minimumFiniteOrNull(...values) {
  const numbers = values.map(finiteOrNull).filter((value) => value !== null);
  return numbers.length ? Math.min(...numbers) : null;
}

function boundedNumber(value, min, max, fallback = 0) {
  const number = finiteOrNull(value);
  if (number === null) return fallback;
  return Math.max(min, Math.min(max, number));
}

function compactShadowSide(profile) {
  const shadow = profile && profile.shadow || {};
  const phrase = shadow.phrase || {};
  const tempo = shadow.tempo || {};
  const downbeat = shadow.downbeat || {};
  const loudness = shadow.loudness || {};
  const selectedBars = [4, 8, 16, 32].includes(Number(phrase.selectedBars))
    ? Number(phrase.selectedBars)
    : 8;
  return {
    phrase: {
      selectedBars,
      offsetBars: Math.round(boundedNumber(phrase.offsetBars, 0, 31)),
      confidence: boundedNumber(phrase.confidence, 0, 1),
      candidateCount: Math.round(boundedNumber(phrase.candidateCount, 0, 128)),
      stable: phrase.stable === true,
    },
    tempo: {
      medianStep: finiteOrNull(tempo.medianStep),
      localBpm: finiteOrNull(tempo.localBpm),
      driftRatio: finiteOrNull(tempo.driftRatio),
      confidence: boundedNumber(tempo.confidence, 0, 1),
      stable: tempo.stable === true,
    },
    downbeat: {
      confidence: boundedNumber(downbeat.confidence, 0, 1),
      phaseErrorMs: finiteOrNull(downbeat.phaseErrorMs),
      stable: downbeat.stable === true,
    },
    loudness: {
      available: loudness.available === true,
      shortTermLufs: finiteOrNull(loudness.shortTermLufs),
      truePeakDbtp: finiteOrNull(loudness.truePeakDbtp),
      reason: compactString(loudness.reason, 40),
    },
  };
}

function compactShadowPair(from, to) {
  return {
    schema: 'cuefield-shadow-v1',
    from: compactShadowSide(from && from.cueProfile),
    to: compactShadowSide(to && to.cueProfile),
  };
}

function transitionDiagnostics(from, to, windowPlan, chosen, structureSource) {
  const fromStructure = from.structureMap || {};
  const toStructure = to.structureMap || {};
  const fromHook = credibleFirstHook(fromStructure);
  const recipeDiagnostics = windowPlan.diagnostics || {};
  const policy = chosen.policy || windowPlan.policy || {};
  const entry = chosen.entry || {};
  const localMusical = chosen.localMusicalEvidence || null;
  const rawLandingType = String(entry.landingType || entry.type || 'start').toLowerCase();
  const landingType = toStructure.structureSource !== 'lyric+beat' && rawLandingType === 'hook'
    ? (entry.source === 'fallback' ? 'start' : 'drop')
    : rawLandingType;
  return {
    ...recipeDiagnostics,
    structureSource,
    shadow: compactShadowPair(from, to),
    structureConfidence: minimumFiniteOrNull(fromStructure.structureConfidence, toStructure.structureConfidence),
    protectedUntil: finiteOrNull(chosen.protectedUntil),
    firstHookStart: null,
    firstHookEnd: null,
    hookConfidence: null,
    hookEvidence: [],
    ...(fromHook ? {
      firstHookStart: finiteOrNull(fromHook.start),
      firstHookEnd: finiteOrNull(fromHook.end),
      hookConfidence: finiteOrNull(fromHook.confidence),
      ...(fromHook.evidence ? { hookEvidence: fromHook.evidence } : {}),
    } : {}),
    exitType: chosen.exit && chosen.exit.type || '',
    exitConfidence: finiteOrNull(chosen.exit && chosen.exit.confidence),
    exitRatio: finiteOrNull(chosen.exitRatio),
    entryType: landingType,
    entrySource: entry.source || '',
    entryConfidence: finiteOrNull(entry.confidence),
    landingAt: finiteOrNull(entry.landingAt),
    effectiveSourceEnd: finiteOrNull(chosen.effectiveSourceEnd),
    mixStart: finiteOrNull(chosen.mixStart),
    handoffAt: finiteOrNull(chosen.handoffAt),
    audibleOverlap: finiteOrNull(chosen.audibleOverlap),
    preRollDuration: finiteOrNull(chosen.preRollDuration),
    energyContinuity: finiteOrNull(chosen.energyContinuity),
    grooveContinuity: finiteOrNull(chosen.grooveContinuity),
    tempoCompatibility: finiteOrNull(chosen.tempoCompatibility),
    localMusicalEvidence: !!localMusical,
    localMusicalCompatibility: finiteOrNull(localMusical && localMusical.score),
    localHarmonicSimilarity: finiteOrNull(localMusical && localMusical.harmonicSimilarity),
    localKeyCompatibility: finiteOrNull(localMusical && localMusical.keyCompatibility),
    localMelodySimilarity: finiteOrNull(localMusical && localMusical.melodySimilarity),
    localMusicalConfidence: finiteOrNull(localMusical && localMusical.confidence),
    localAWindowStart: finiteOrNull(localMusical && localMusical.aWindowStart),
    localBWindowStart: finiteOrNull(localMusical && localMusical.bWindowStart),
    localAWindowDistance: finiteOrNull(localMusical && localMusical.aDistance),
    localBWindowDistance: finiteOrNull(localMusical && localMusical.bDistance),
    localMusicalRisks: Array.isArray(localMusical && localMusical.risks)
      ? localMusical.risks.filter((risk) => typeof risk === 'string').slice(0, 3)
      : [],
    musicalEvidence: recipeDiagnostics.musicalEvidence === true,
    musicalCompatibility: finiteOrNull(recipeDiagnostics.musicalCompatibility),
    harmonicSimilarity: finiteOrNull(recipeDiagnostics.harmonicSimilarity),
    keyCompatibility: finiteOrNull(recipeDiagnostics.keyCompatibility),
    melodySimilarity: finiteOrNull(recipeDiagnostics.melodySimilarity),
    musicalRisks: Array.isArray(recipeDiagnostics.musicalRisks) ? recipeDiagnostics.musicalRisks.slice(0, 3) : [],
    bpmA: finiteOrNull(from.cueProfile && from.cueProfile.bpm),
    bpmB: finiteOrNull(to.cueProfile && to.cueProfile.bpm),
    windowRejectionReasons: Array.isArray(chosen.rejectionReasons) ? chosen.rejectionReasons.slice() : [],
    route: String(policy.route || ''),
    compatibilityClass: String(policy.compatibilityClass || ''),
    contrastDirection: String(policy.contrastDirection || ''),
    preferredExitRange: Array.isArray(policy.preferredExitRange) ? policy.preferredExitRange.slice(0, 2) : [],
    routeReasons: Array.isArray(policy.reasons) ? policy.reasons.slice(0, 4) : [],
    routeFallbackUsed: chosen.routeFallbackUsed === true,
    terminalRescueClass: compactString(chosen.rescueClass, 1),
    terminalRescueReason: compactString(chosen.rescueReason, 40),
    technicalFailure: chosen.technicalFailure === true,
    errorCode: compactString(chosen.errorCode, 80),
    sourceExitCount: finiteOrNull(recipeDiagnostics.sourceExitCount),
    sourceLandingCount: finiteOrNull(recipeDiagnostics.sourceLandingCount),
    consideredExitCount: finiteOrNull(recipeDiagnostics.consideredExitCount),
    consideredLandingCount: finiteOrNull(recipeDiagnostics.consideredLandingCount),
    exitCandidateCount: finiteOrNull((fromStructure.exitCandidates || []).length),
    entryCandidateCount: finiteOrNull((toStructure.entryCandidates || []).length),
    cleanBoundary: chosen.cleanBoundary || null,
  };
}

function planCuefieldTransitionFromCache(opts = {}) {
  const readBeatMapCache = opts.readBeatMapCache;
  if (typeof readBeatMapCache !== 'function') throw new Error('READ_BEATMAP_CACHE_REQUIRED');
  const fromKey = String(opts.fromKey || '').trim();
  const toKey = String(opts.toKey || '').trim();
  if (!fromKey || !toKey) throw new Error('CUEFIELD_CACHE_KEYS_REQUIRED');

  const fromEntry = entryFromCache(readBeatMapCache, fromKey);
  const toEntry = entryFromCache(readBeatMapCache, toKey);
  const from = analyzeCacheEntry(fromEntry, fromKey, opts.fromLrc);
  const to = analyzeCacheEntry(toEntry, toKey, opts.toLrc);
  const duration = Math.max(0, Number(from.cueProfile && from.cueProfile.duration) || 0);
  const structuralFloor = resolveListeningFloor(from.structureMap, duration);
  const requestedListenFloor = finiteOrNull(opts.minimumListenUntil);
  const listenFloor = requestedListenFloor === null
    ? structuralFloor
    : Math.max(structuralFloor, Math.max(0, Math.min(duration, requestedListenFloor)));
  from.structureMap.protectedUntil = listenFloor;
  const recentRecipes = normalizeRecentRecipes(opts.recentRecipes);
  const cadenceFallbackEnabled = opts.enableCadenceFallback === true;
  const baseWindowOptions = {
    recentRecipes,
    enableCleanBoundary: opts.enableCleanBoundary === true,
    enableCadenceFallback: cadenceFallbackEnabled,
    ...(cadenceFallbackEnabled ? {
      boundaryEvidence: normalizeBoundaryEvidence(opts.boundaryEvidence),
      tailEvidence: normalizeTailEvidence(opts.tailEvidence),
    } : {}),
  };
  let windowPlan = chooseTransitionWindow(from, to, baseWindowOptions);
  let liveEndCrossfadeDiagnostics = null;
  if (opts.enableLiveEndCrossfadeFallback === true && !cadenceFallbackEnabled) {
    if (trustedExecutableWindowPlan(windowPlan)) {
      liveEndCrossfadeDiagnostics = {
        mode: 'preserved-current-plan',
        duration: null,
        preRollDuration: null,
        evidenceConfidence: null,
        failureCode: '',
      };
    } else {
      const tailEvidence = buildLiveTailEvidence(fromEntry, toEntry);
      if (!tailEvidence) {
        liveEndCrossfadeDiagnostics = {
          mode: '',
          duration: null,
          preRollDuration: null,
          evidenceConfidence: null,
          failureCode: 'EDGE_EVIDENCE_UNAVAILABLE',
        };
      } else {
        const fallbackPlan = chooseTransitionWindow(from, to, {
          recentRecipes,
          enableCadenceFallback: true,
          boundaryEvidence: [],
          tailEvidence,
        });
        if (validLiveEndCrossfadeWindow(fallbackPlan)) {
          windowPlan = fallbackPlan;
          liveEndCrossfadeDiagnostics = {
            mode: 'end-of-track-crossfade',
            duration: finiteOrNull(fallbackPlan.chosen.cadenceFallback.crossfadeDuration),
            preRollDuration: finiteOrNull(fallbackPlan.chosen.preRollDuration),
            evidenceConfidence: tailEvidence.confidence,
            failureCode: '',
          };
        } else {
          liveEndCrossfadeDiagnostics = {
            mode: '',
            duration: null,
            preRollDuration: null,
            evidenceConfidence: tailEvidence.confidence,
            failureCode: 'UNEXPECTED_FALLBACK_RECIPE',
          };
        }
      }
    }
  }
  const selected = windowPlan.chosen || {};
  const sectionChoice = selected.sectionChoice || {};
  const recipeCandidate = selected.recipeCandidate || {};
  const policy = windowPlan.policy || selected.policy || {};
  const chosenScore = sectionChoice.score ?? selected.score ?? recipeCandidate.score ?? 0;
  const cleanBoundary = compactCleanBoundaryDiagnostics(selected, recipeCandidate);
  const cadenceFallback = compactCadenceFallback(selected.cadenceFallback);
  let chosen = {
    ...sectionChoice,
    recipe: sectionChoice.recipe || recipeCandidate.recipe || 'honest-start-fallback',
    score: chosenScore,
    evaluation: sectionChoice.evaluation || {
      score: chosenScore,
      tier: 'weak',
      risks: selected.rejectionReasons || [],
    },
    exit: compactTransitionPoint(selected.exit),
    entry: compactTransitionPoint(selected.entry),
    protectedUntil: from.structureMap.protectedUntil,
    transitionRecipe: recipeCandidate.recipe,
    timeline: selected.timeline,
    recipeCandidate,
    effectiveSourceEnd: selected.effectiveSourceEnd,
    mixStart: selected.mixStart,
    handoffAt: selected.handoffAt,
    audibleOverlap: selected.audibleOverlap,
    preRollDuration: selected.preRollDuration,
    exitRatio: selected.exitRatio,
    energyContinuity: selected.energyContinuity,
    grooveContinuity: selected.grooveContinuity,
    tempoCompatibility: selected.tempoCompatibility,
    localMusicalEvidence: selected.localMusicalEvidence || null,
    rejectionReasons: selected.rejectionReasons || [],
    policy: {
      ...policy,
      preferredExitRange: Array.isArray(policy.preferredExitRange) ? policy.preferredExitRange.slice(0, 2) : [],
      reasons: Array.isArray(policy.reasons) ? policy.reasons.slice(0, 4) : [],
      metrics: { ...(policy.metrics || {}) },
    },
    rescueClass: compactString(selected.rescueClass, 1),
    rescueReason: compactString(selected.rescueReason, 40),
    routeFallbackUsed: selected.routeFallbackUsed === true,
    technicalFailure: selected.technicalFailure === true,
    errorCode: compactString(selected.errorCode, 80),
    ...(cleanBoundary ? { cleanBoundary } : {}),
    ...(cadenceFallback ? { cadenceFallback } : {}),
  };
  const fromLrcLines = parseMaybeLrc(opts.fromLrc);
  const toLrcLines = parseMaybeLrc(opts.toLrc);
  const climax = trustedClimax(to);
  const lyricLink = scoreLyricLink({
    fromLines: fromLrcLines,
    toLines: toLrcLines,
    exitTime: chosen.exit && chosen.exit.time,
    climaxTime: climax && (climax.start ?? climax.time),
    vocalOverlapSec: 0,
  });
  const syntheticBridgeEnabled = opts.syntheticBridgeEnabled === true && !cadenceFallbackEnabled;
  const bridge = !syntheticBridgeEnabled || chosen.technicalFailure === true ? null : planBridge({
    fromAnalysis: from,
    toAnalysis: to,
    directPlan: chosen,
    lyricLink,
  });
  if (bridge) {
    const directChosen = chosen;
    const stage3 = bridge.stageDurations[2];
    const entryTime = bridge.climax.time;
    chosen = {
      ...directChosen,
      recipe: 'synthetic-bridge',
      transitionRecipe: 'synthetic-bridge',
      recipeCandidate: {
        recipe: 'synthetic-bridge',
        fallbackTimeline: bridge.fallbackTimeline,
      },
      score: bridge.predictedScore,
      evaluation: {
        score: bridge.predictedScore,
        tier: bridge.predictedScore >= 0.84 ? 'magic' : 'usable',
        risks: [],
      },
      exit: {
        ...(directChosen.exit || {}),
        role: 'exit',
        source: 'structure',
        time: bridge.mixStart,
      },
      entry: {
        type: bridge.climax.type,
        role: 'entry',
        source: 'bridge',
        time: entryTime,
        confidence: bridge.climax.confidence,
        playFrom: Math.max(0, entryTime - stage3),
        landingAt: entryTime,
        landingType: bridge.climax.type,
      },
      timeline: bridge.timeline,
      mixStart: bridge.mixStart,
      handoffAt: bridge.handoffAt,
      audibleOverlap: 0,
      preRollDuration: stage3,
      exitRatio: from.cueProfile.duration > 0 ? bridge.mixStart / from.cueProfile.duration : 0,
      bridgePlan: compactBridgePlan(bridge),
      directTransition: {
        recipe: directChosen.transitionRecipe || directChosen.recipe,
        score: finiteOrNull((directChosen.evaluation && directChosen.evaluation.score) ?? directChosen.score),
      },
      cleanBoundary: undefined,
    };
  }
  const structureSource = from.structureMap.structureSource === 'lyric+beat'
    && to.structureMap.structureSource === 'lyric+beat'
    ? 'lyric+beat'
    : 'beat-only';

  const technicalFailure = chosen.technicalFailure === true;
  const diagnostics = transitionDiagnostics(from, to, windowPlan, chosen, structureSource);
  diagnostics.lyricLinkScore = finiteOrNull(lyricLink.score);
  diagnostics.lyricLinkReasons = Array.isArray(lyricLink.reasons) ? lyricLink.reasons.slice(0, 4) : [];
  diagnostics.bridgeSelected = !!bridge;
  diagnostics.syntheticBridgeEnabled = syntheticBridgeEnabled;
  diagnostics.bridgeTemplate = bridge ? bridge.template : '';
  diagnostics.bridgeBars = bridge ? bridge.bars : null;
  diagnostics.cadenceFallback = cadenceFallback;
  if (liveEndCrossfadeDiagnostics) diagnostics.liveEndCrossfade = liveEndCrossfadeDiagnostics;
  const artifact = buildTransitionArtifact({ from, to, chosen, version: opts.version });
  return {
    ok: !technicalFailure,
    ...(technicalFailure ? { error: chosen.errorCode || 'CUEFIELD_TECHNICAL_FAILURE' } : {}),
    from: compactAnalysisSummary(from),
    to: compactAnalysisSummary(to),
    chosen,
    artifact,
    candidates: windowPlan.candidates,
    rejected: windowPlan.rejected,
    diagnostics,
  };
}

module.exports = {
  buildLiveTailEvidence,
  planCuefieldTransitionFromCache,
};
