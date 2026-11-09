const { round, toNumber } = require('./cue-profile');
const { planRecipeCandidates } = require('./recipe-planner');
const { scoreCandidatePair } = require('./section-candidates');
const { classifyTransitionRoute } = require('./transition-router');
const { compareLocalMusicalWindows, compareMusicalProfiles } = require('./musical-profile');
const { LANDING_TOLERANCE_SEC, scoreOverlapContract } = require('./planner-contracts');
const { evaluateCadenceBoundary, chooseEndCrossfadeDuration } = require('./boundary-evidence');

const MINIMUM_TERMINAL_OVERLAP = 2.2;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, toNumber(value)));
}

function ceilMillisecond(value) {
  return Math.ceil(toNumber(value) * 1000 - 0.000001) / 1000;
}

function floorMillisecond(value) {
  return Math.floor(toNumber(value) * 1000 + 0.000001) / 1000;
}

// Neutral policy: absent, NaN, null, and negative infinity mean no penalty.
function normalizePenalty(value) {
  if (value === Infinity) return 1;
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(1, value);
}

function normalizeRecentRecipes(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((recipe) => typeof recipe === 'string')
    .map((recipe) => recipe.trim().slice(0, 80))
    .filter(Boolean)
    .slice(-2);
}

function profileOf(analysis) {
  return analysis && analysis.cueProfile || analysis || {};
}

function musicalEvidenceFor(fromAnalysis, toAnalysis) {
  const first = fromAnalysis && fromAnalysis.musicalProfile;
  const second = toAnalysis && toAnalysis.musicalProfile;
  const reliable = (profile) => profile
    && toNumber(profile.confidence) >= 0.55
    && toNumber(profile.noteCount) >= 12;
  return reliable(first) && reliable(second) ? compareMusicalProfiles(first, second) : null;
}

function localMusicalEvidenceFor(fromAnalysis, toAnalysis, exit, entry) {
  if (!exit || !entry) return null;
  return compareLocalMusicalWindows(
    fromAnalysis && fromAnalysis.musicalProfile,
    toAnalysis && toAnalysis.musicalProfile,
    toNumber(exit.time, NaN),
    toNumber(entry.playFrom, toNumber(entry.landingAt, NaN)),
  );
}

function hasReliableLocalMusicalClash(evidence) {
  return !!(evidence
    && toNumber(evidence.confidence) >= 0.55
    && (toNumber(evidence.score, 0.5) < 0.42 || toNumber(evidence.harmonicSimilarity, 0.5) < 0.4));
}

function landingKind(entry) {
  const explicit = String(entry && entry.landingType || '').toLowerCase();
  if (explicit) return explicit;
  const type = String(entry && entry.type || 'start').toLowerCase();
  if (type === 'pre-hook' || type === 'hook' || type === 'chorus') return 'hook';
  if (type === 'low-density-start') return 'start';
  if (type === 'intro' || type === 'drop' || type === 'start') return type;
  return entry && entry.source === 'fallback' ? 'start' : type;
}

function normalizeEntry(candidate) {
  const landingType = landingKind(candidate);
  const landingAt = toNumber(candidate && candidate.landingAt, toNumber(candidate && candidate.resolvesTo && candidate.resolvesTo.time, toNumber(candidate && candidate.time)));
  const playFrom = toNumber(candidate && candidate.playFrom, toNumber(candidate && candidate.time, landingAt));
  return {
    ...candidate,
    time: toNumber(candidate && candidate.time, landingAt),
    playFrom,
    landingAt,
    landingType,
  };
}

function credibleHookEvidence(candidate) {
  const evidence = candidate && candidate.evidence || candidate || {};
  return toNumber(evidence.repeatedLineCount) >= 2
    && toNumber(evidence.repeatedBlockCount) >= 2
    && evidence.sustainedEnergy === true;
}

function landingTime(candidate) {
  const values = [
    candidate && candidate.landingAt,
    candidate && candidate.resolvesTo && candidate.resolvesTo.time,
    candidate && candidate.time,
    candidate && candidate.start,
  ];
  const value = values.find((item) => Number.isFinite(Number(item)));
  return value === undefined ? null : Number(value);
}

function sameLanding(first, second) {
  const firstTime = landingTime(first);
  const secondTime = landingTime(second);
  return firstTime !== null && secondTime !== null && Math.abs(firstTime - secondTime) < 1.5;
}

function trustedStructureHookEntries(structure) {
  if (!structure || structure.structureSource !== 'lyric+beat') return [];
  const sections = (structure.sections || []).filter((section) => (
    section
    && ['hook', 'chorus'].includes(String(section.type || '').toLowerCase())
    && toNumber(section.confidence) >= 0.65
    && credibleHookEvidence(section)
  ));
  const entries = (structure.entryCandidates || []).filter((candidate) => candidate && candidate.role === 'entry');
  const directHooks = entries.filter((candidate) => (
    ['hook', 'chorus'].includes(String(candidate.type || '').toLowerCase())
    && landingKind(candidate) === 'hook'
    && toNumber(candidate.confidence) >= 0.65
    && credibleHookEvidence(candidate)
    && sections.some((section) => sameLanding(candidate, section))
  ));
  const preHooks = entries.filter((candidate) => (
    String(candidate.type || '').toLowerCase() === 'pre-hook'
    && landingKind(candidate) === 'hook'
    && toNumber(candidate.confidence) >= 0.65
    && candidate.resolvesTo
    && ['hook', 'chorus'].includes(String(candidate.resolvesTo.type || '').toLowerCase())
    && directHooks.some((hook) => sameLanding(candidate.resolvesTo, hook) && sameLanding(candidate, hook))
  ));
  return [...directHooks, ...preHooks];
}

function naturalLanding(candidate) {
  if (!candidate || candidate.role !== 'entry' || String(candidate.source || '').toLowerCase() === 'lyric') return false;
  const type = String(candidate.type || '').toLowerCase();
  if (['hook', 'chorus', 'pre-hook', 'pre-section'].includes(type)) return false;
  return ['start', 'intro', 'drop'].includes(landingKind(candidate));
}

function sourceLandings(analysis) {
  const structure = analysis && analysis.structureMap || {};
  const structureEntries = (structure.entryCandidates || []).filter((candidate) => naturalLanding(candidate));
  const supplementalEntries = (analysis && analysis.candidates || []).filter((candidate) => naturalLanding(candidate));
  return [
    ...structureEntries,
    ...trustedStructureHookEntries(structure),
    ...supplementalEntries,
  ];
}

function landingOptions(analysis) {
  const candidates = sourceLandings(analysis)
    .map(normalizeEntry)
    .sort((a, b) => toNumber(b.confidence) - toNumber(a.confidence) || a.time - b.time);
  const unique = [];
  candidates.forEach((candidate) => {
    if (!unique.some((item) => item.landingType === candidate.landingType && Math.abs(item.landingAt - candidate.landingAt) < 1.5)) {
      unique.push(candidate);
    }
  });
  return unique.slice(0, 6);
}

function exitSourceCandidates(analysis) {
  const structure = analysis && analysis.structureMap || {};
  const source = structure.exitCandidates && structure.exitCandidates.length
    ? structure.exitCandidates
    : (analysis && analysis.candidates || []).filter((candidate) => candidate && candidate.role === 'exit');
  return source.filter((candidate) => candidate && candidate.role === 'exit');
}

function sourceExits(analysis, protectedUntil) {
  return exitSourceCandidates(analysis)
    .filter((candidate) => toNumber(candidate.time) >= protectedUntil);
}

function scoreWindowExit(candidate) {
  let score = clamp(candidate && candidate.confidence);
  if (candidate && candidate.type === 'release') score += 0.18;
  if (toNumber(candidate && candidate.energyAfter) < toNumber(candidate && candidate.energyBefore)) score += 0.08;
  return clamp(score - normalizePenalty(candidate && candidate.latePenalty));
}

function activeVocalWindow(windows, time) {
  return (Array.isArray(windows) ? windows : []).find((window) => (
    toNumber(window && window.start) + LANDING_TOLERANCE_SEC < time
    && toNumber(window && window.end) > time
  )) || null;
}

function completeCleanExit(candidate, vocalWindows, duration) {
  const time = toNumber(candidate && candidate.time);
  const active = activeVocalWindow(vocalWindows, time);
  if (!active) return candidate;
  const completedAt = round(toNumber(active.end));
  return {
    ...candidate,
    type: 'vocal-end-boundary',
    time: completedAt,
    exitRatio: duration > 0 ? round(completedAt / duration) : 0,
  };
}

function restoreCleanEntry(candidate, vocalWindows) {
  const playFrom = toNumber(candidate && candidate.playFrom, toNumber(candidate && candidate.time));
  const active = activeVocalWindow(vocalWindows, playFrom);
  return active ? { ...candidate, playFrom: round(toNumber(active.start)) } : candidate;
}

function exitsForPolicy(exits, duration, policy) {
  const range = Array.isArray(policy && policy.preferredExitRange) ? policy.preferredExitRange : [];
  const minRatio = toNumber(range[0], NaN);
  const maxRatio = toNumber(range[1], NaN);
  if (!Number.isFinite(minRatio) || !Number.isFinite(maxRatio)) return exits;
  const inRange = exits.filter((candidate) => {
    const ratio = toNumber(candidate.time) / Math.max(1, toNumber(duration));
    return ratio >= minRatio && ratio <= maxRatio;
  });
  if (inRange.length || !policy || policy.route === 'structure-mix') return inRange.length ? inRange : exits;
  return [];
}

function exitOptions(analysis, protectedUntil, policy) {
  const duration = profileOf(analysis).duration;
  const vocalWindows = analysis && analysis.structureMap && analysis.structureMap.vocalWindows;
  const exits = exitsForPolicy(sourceExits(analysis, protectedUntil), duration, policy);
  const completed = policy && policy.route === 'clean-boundary-handoff'
    ? exits.map((candidate) => completeCleanExit(candidate, vocalWindows, duration))
    : exits;
  return completed
    .slice()
    .sort((a, b) => scoreWindowExit(b) - scoreWindowExit(a) || toNumber(a.time) - toNumber(b.time))
    .slice(0, 8);
}

function trustedGrid(from, to, diagnostics) {
  if (diagnostics && typeof diagnostics.beatGridTrusted === 'boolean') return diagnostics.beatGridTrusted;
  return !!(from && to && toNumber(from.gridStep) > 0 && toNumber(to.gridStep) > 0
    && (from.downbeats || []).length >= 4 && (to.downbeats || []).length >= 4);
}

function nearbyBar(profile, time) {
  const bars = profile && profile.bars || [];
  return bars.slice().sort((a, b) => Math.abs(toNumber(a.start) - time) - Math.abs(toNumber(b.start) - time))[0] || {};
}

function grooveContinuity(from, to, exit, entry, diagnostics) {
  if (!trustedGrid(from, to, diagnostics)) return 0.35;
  const a = nearbyBar(from, toNumber(exit && exit.time));
  const b = nearbyBar(to, toNumber(entry && entry.landingAt));
  const differences = [
    Math.abs(toNumber(a.beatStability) - toNumber(b.beatStability)),
    Math.abs(toNumber(a.snapDensity) - toNumber(b.snapDensity)),
    Math.abs(toNumber(a.bodyDensity) - toNumber(b.bodyDensity)),
  ];
  return round(clamp(1 - differences.reduce((sum, value) => sum + value, 0) / differences.length));
}

function recipeSectionEntry(entry) {
  return {
    ...entry,
    time: entry.landingAt,
    resolvesTo: entry.landingType === 'hook' && entry.playFrom < entry.landingAt
      ? { type: 'hook', time: entry.landingAt }
      : entry.resolvesTo,
  };
}

function isAnchoredLandingDiagnosticValid(entry, window) {
  if (!['hook', 'intro', 'drop'].includes(landingKind(entry))) return true;
  const landingError = window && window.landingError;
  return Number.isFinite(landingError) && Math.abs(landingError) <= LANDING_TOLERANCE_SEC;
}

function transitionStartOffset(window) {
  const explicit = toNumber(window && window.transitionStart, NaN);
  return Number.isFinite(explicit) ? explicit : toNumber(window && window.audibleStart);
}

function rejectionReasons({ protectedUntil, sourceDuration, exit, entry, recipeCandidate, diagnostics, vocalWindows, incomingVocalWindows, musicalEvidence, localMusicalEvidence }) {
  const reasons = [];
  const window = recipeCandidate.window || {};
  const mixStart = toNumber(exit.time) + transitionStartOffset(window);
  const handoffAt = toNumber(exit.time) + toNumber(window.handoffOffset);
  const cleanTail = toNumber(window.aOnlyTailDuration, NaN);
  const outgoingAudibleEnd = recipeCandidate.recipe === 'clean-boundary-handoff' && Number.isFinite(cleanTail)
    ? mixStart + cleanTail
    : handoffAt;
  const anchored = ['hook', 'intro', 'drop'].includes(landingKind(entry));
  if (mixStart < protectedUntil) reasons.push('mix start precedes protected section');
  if ((vocalWindows || []).some((vocal) => (
    toNumber(vocal && vocal.end) > mixStart
    && toNumber(vocal && vocal.start) < outgoingAudibleEnd
  ))) reasons.push('outgoing vocal phrase incomplete');
  if (recipeCandidate.recipe === 'clean-boundary-handoff') {
    const entryStart = toNumber(entry && entry.playFrom, toNumber(entry && entry.time));
    if ((incomingVocalWindows || []).some((vocal) => (
      toNumber(vocal && vocal.start) + LANDING_TOLERANCE_SEC < entryStart
      && toNumber(vocal && vocal.end) > entryStart
    ))) reasons.push('incoming vocal phrase already active');
  }
  if (musicalEvidence && toNumber(musicalEvidence.score) < 0.45) {
    if (!['release', 'outro', 'natural-tail'].includes(String(exit && exit.type || '').toLowerCase())) {
      reasons.push('musical mismatch needs release exit');
    } else if (toNumber(exit && exit.time) / Math.max(1, toNumber(sourceDuration)) < 0.72) {
      reasons.push('musical mismatch needs late release');
    } else if (toNumber(window.audibleOverlap) > 3.5) {
      reasons.push('musical mismatch needs short overlap');
    }
  }
  if (hasReliableLocalMusicalClash(localMusicalEvidence)) {
    if (recipeCandidate.recipe === 'harmonic-double-drop') {
      reasons.push('local musical clash forbids harmonic double drop');
    } else if (toNumber(window.audibleOverlap) > 3.5) {
      reasons.push('local musical clash needs short overlap');
    }
  }
  if (anchored && window.runwayAvailable === false) reasons.push('landing has no runway');
  if (anchored && !Number.isFinite(window.landingError)) reasons.push('landing diagnostic unavailable');
  else if (anchored && !isAnchoredLandingDiagnosticValid(entry, window)) reasons.push('landing error exceeds .05');
  if (landingKind(entry) === 'hook' && entry.playFrom === entry.landingAt && toNumber(diagnostics.relativeTempoDelta) > 0.15) {
    reasons.push('direct hook has no compatible runway');
  }
  if (toNumber(exit.time) + toNumber(window.handoffOffset) > toNumber(sourceDuration) + 0.000001) {
    reasons.push('handoff exceeds source duration');
  }
  if (!Array.isArray(recipeCandidate.timeline) || !recipeCandidate.timeline.length) reasons.push('missing executable timeline');
  return reasons;
}

function rangeDistancePenalty(exitRatio, policy) {
  const range = Array.isArray(policy && policy.preferredExitRange) ? policy.preferredExitRange : [];
  const minRatio = toNumber(range[0], NaN);
  const maxRatio = toNumber(range[1], NaN);
  if (!Number.isFinite(minRatio) || !Number.isFinite(maxRatio) || minRatio > maxRatio) return 0;
  const distance = exitRatio < minRatio ? minRatio - exitRatio : (exitRatio > maxRatio ? exitRatio - maxRatio : 0);
  return clamp(distance / Math.max(0.04, maxRatio - minRatio));
}

function entryPolicyPenalty(entry, policy) {
  if (!policy || policy.route !== 'late-contrast-rise') return 0;
  const type = String(entry && entry.type || '').toLowerCase();
  return landingKind(entry) === 'hook' && type !== 'pre-hook' ? 0.18 : 0;
}

function recipeCandidateAllowedByRoute(candidate, policy) {
  if (candidate && candidate.eligible === false) return false;
  const route = policy && policy.route;
  const overlap = toNumber(candidate && candidate.window && candidate.window.audibleOverlap);
  if (route === 'clean-boundary-handoff') return candidate.recipe === 'clean-boundary-handoff';
  if (route === 'late-contrast-rise') {
    return [
      'filtered-pickup',
      'echo-out',
      'quick-safe-fade',
      'safety-long-blend',
    ].includes(candidate.recipe) && overlap <= 3.5;
  }
  if (route === 'late-contrast-release') return overlap <= 6;
  return true;
}

function rankWindow({ exit, entry, sectionChoice, recipeCandidate, diagnostics, fromProfile, toProfile, policy, musicalEvidence, localMusicalEvidence }) {
  const energyContinuity = clamp(diagnostics.energyScore);
  const tempoCompatibility = clamp(diagnostics.bpmScore);
  const groove = grooveContinuity(fromProfile, toProfile, exit, entry, diagnostics);
  const continuity = clamp((energyContinuity + groove + tempoCompatibility + clamp(diagnostics.bassScore)) / 4);
  const suppliedExitRatio = clamp(exit.exitRatio);
  const exitRatio = suppliedExitRatio || clamp(toNumber(exit.time) / Math.max(1, toNumber(fromProfile.duration)));
  const latePenalty = Math.max(normalizePenalty(exit.latePenalty), policy && policy.route === 'structure-mix' && exitRatio > 0.78 ? 0.45 : 0);
  const routePenalty = rangeDistancePenalty(exitRatio, policy) + entryPolicyPenalty(entry, policy);
  const musicalAdjustment = musicalEvidence ? (toNumber(musicalEvidence.score, 0.5) - 0.5) * 0.12 : 0;
  const localMusicalAdjustment = localMusicalEvidence
    ? Math.max(-0.08, Math.min(0.08, (toNumber(localMusicalEvidence.score, 0.5) - 0.5) * 0.16))
    : 0;
  const rawRecipeSelectionScore = toNumber(
    recipeCandidate.selectionScore == null ? recipeCandidate.score : recipeCandidate.selectionScore,
  );
  const recipeSelectionScore = Math.max(0, Math.min(
    recipeCandidate.recipe === 'tease-roll-double-drop' ? 1.7 : 1,
    rawRecipeSelectionScore,
  ));
  const overlapFit = scoreOverlapContract(
    recipeCandidate.window.audibleOverlap,
    recipeCandidate.window.overlapContract,
  );
  const score = clamp(clamp(sectionChoice.score) * 0.34
    + recipeSelectionScore * 0.2
    + ((clamp(exit.confidence) + clamp(entry.confidence)) / 2) * 0.16
    + overlapFit * 0.12
    + continuity * 0.18
    - latePenalty
    - routePenalty
    + musicalAdjustment
    + localMusicalAdjustment);
  return {
    exit,
    entry,
    sectionChoice,
    recipeCandidate,
    timeline: recipeCandidate.timeline,
    mixStart: round(toNumber(exit.time) + transitionStartOffset(recipeCandidate.window)),
    handoffAt: round(toNumber(exit.time) + toNumber(recipeCandidate.window.handoffOffset)),
    audibleOverlap: toNumber(recipeCandidate.window.audibleOverlap),
    preRollDuration: toNumber(recipeCandidate.window.preRollDuration),
    exitRatio: round(clamp(exitRatio)),
    energyContinuity: round(energyContinuity),
    grooveContinuity: groove,
    tempoCompatibility: round(tempoCompatibility),
    overlapFit: round(overlapFit),
    localMusicalEvidence,
    score: round(score),
    rejectionReasons: [],
  };
}

function compactLocalMusicalEvidence(evidence) {
  if (!evidence) return null;
  const scalar = (value) => Number.isFinite(toNumber(value, NaN)) ? toNumber(value) : null;
  return {
    score: scalar(evidence.score),
    harmonicSimilarity: scalar(evidence.harmonicSimilarity),
    keyCompatibility: scalar(evidence.keyCompatibility),
    melodySimilarity: scalar(evidence.melodySimilarity),
    confidence: scalar(evidence.confidence),
    aWindowStart: scalar(evidence.aWindowStart),
    bWindowStart: scalar(evidence.bWindowStart),
    aDistance: scalar(evidence.aDistance),
    bDistance: scalar(evidence.bDistance),
    risks: Array.isArray(evidence.risks) ? evidence.risks.filter((risk) => typeof risk === 'string').slice(0, 4) : [],
  };
}

function compactWindow(window) {
  return {
    exit: {
      type: window.exit && window.exit.type,
      time: window.exit && window.exit.time,
      exitRatio: window.exitRatio,
    },
    entry: {
      type: window.entry && window.entry.type,
      source: window.entry && window.entry.source,
      landingType: window.entry && window.entry.landingType,
      landingAt: window.entry && window.entry.landingAt,
    },
    recipe: window.recipeCandidate && window.recipeCandidate.recipe,
    score: clamp(window.score),
    audibleOverlap: toNumber(window.audibleOverlap),
    mixStart: window.mixStart,
    handoffAt: window.handoffAt,
    localMusicalEvidence: compactLocalMusicalEvidence(window.localMusicalEvidence),
    rejectionReasons: Array.isArray(window.rejectionReasons) ? window.rejectionReasons.slice() : [],
  };
}

function terminalRescuePolicy(policy, fromProfile, protectedUntil) {
  const duration = Math.max(1, toNumber(fromProfile && fromProfile.duration));
  const protectedRatio = clamp(toNumber(protectedUntil) / duration);
  return {
    ...policy,
    route: 'terminal-rescue',
    compatibilityClass: 'uncertain',
    contrastDirection: 'unknown',
    preferredExitRange: [Math.max(0.88, protectedRatio), Math.max(0.96, protectedRatio)],
    entryPolicy: 'start-or-downbeat',
    overlapClass: 'short',
    recipe: 'terminal-rescue',
    reasons: [...(policy && policy.reasons || []), 'no-valid-window'].slice(0, 4),
  };
}

function technicalFailure(errorCode, rejected = []) {
  const entry = {
    type: 'start',
    role: 'entry',
    source: 'fallback',
    time: 0,
    playFrom: 0,
    landingAt: 0,
    landingType: 'start',
    confidence: 0.35,
  };
  return {
    exit: null,
    entry,
    sectionChoice: null,
    recipeCandidate: {
      recipe: 'technical-failure',
      score: 0,
      timeline: [],
      window: {
        audibleStart: null,
        audibleEnd: null,
        audibleOverlap: null,
        preRollDuration: null,
        handoffOffset: null,
        runwayAvailable: false,
        landingError: null,
      },
    },
    timeline: [],
    mixStart: null,
    handoffAt: null,
    audibleOverlap: null,
    preRollDuration: null,
    exitRatio: null,
    energyContinuity: null,
    grooveContinuity: null,
    tempoCompatibility: null,
    localMusicalEvidence: null,
    score: 0,
    rejectionReasons: ['no valid complete transition window', ...(rejected.length ? ['structural windows rejected'] : [])],
    errorCode,
    technicalFailure: true,
    routeFallbackUsed: false,
  };
}

function terminalStartAfterVocal(windows, requested, duration) {
  let candidate = toNumber(requested);
  (windows || []).slice().sort((a, b) => toNumber(a && a.start) - toNumber(b && b.start)).forEach((window) => {
    const start = toNumber(window && window.start, NaN);
    const end = toNumber(window && window.end, NaN);
    if (Number.isFinite(start) && Number.isFinite(end) && end > candidate && start < candidate + 0.6) {
      candidate = end + 0.12;
    }
  });
  return duration - candidate >= MINIMUM_TERMINAL_OVERLAP
    ? ceilMillisecond(candidate)
    : ceilMillisecond(requested);
}

function effectiveSourceEnd(profile) {
  const duration = Math.max(0, toNumber(profile && profile.duration));
  const energy = (profile && profile.windows && profile.windows.energy || [])
    .map((window) => ({
      start: toNumber(window && window.start, NaN),
      end: toNumber(window && window.end, NaN),
      value: toNumber(window && window.value, NaN),
    }))
    .filter((window) => Number.isFinite(window.start)
      && Number.isFinite(window.end)
      && Number.isFinite(window.value)
      && window.end > window.start)
    .sort((a, b) => a.start - b.start);
  if (!energy.length || energy.at(-1).end < duration - 0.25) return duration;

  let lastAudibleIndex = energy.length - 1;
  while (lastAudibleIndex >= 0 && energy[lastAudibleIndex].value <= 0.001) lastAudibleIndex -= 1;
  if (lastAudibleIndex < 0 || lastAudibleIndex === energy.length - 1) return duration;

  const trailingStart = energy[lastAudibleIndex + 1].start;
  return duration - trailingStart >= MINIMUM_TERMINAL_OVERLAP ? floorMillisecond(trailingStart) : duration;
}

function classCIntroTrim(toAnalysis, toProfile, overlapDuration) {
  const bars = (toProfile && toProfile.bars || [])
    .filter((bar) => Number.isFinite(Number(bar && bar.start)) && Number.isFinite(Number(bar && bar.end)))
    .slice()
    .sort((a, b) => toNumber(a.start) - toNumber(b.start));
  const current = bars.find((bar) => toNumber(bar.start) <= overlapDuration && toNumber(bar.end) > overlapDuration);
  const next = bars.find((bar) => toNumber(bar.start) > overlapDuration && toNumber(bar.start) <= overlapDuration + 1.5);
  if (!current || !next) return 0;

  const vocals = toAnalysis && toAnalysis.structureMap && toAnalysis.structureMap.vocalWindows || [];
  const firstVocalStart = vocals
    .map((window) => toNumber(window && window.start, NaN))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  if (!Number.isFinite(firstVocalStart) || firstVocalStart < toNumber(next.start) + 0.5) return 0;

  const energySafe = toNumber(next.energy) >= toNumber(current.energy) * 0.98;
  const bodyLift = toNumber(next.bodyDensity) >= Math.max(toNumber(current.bodyDensity) + 0.04, toNumber(current.bodyDensity) * 1.5);
  const snapLift = toNumber(next.snapDensity) >= Math.max(toNumber(current.snapDensity) + 0.02, toNumber(current.snapDensity) * 1.5);
  return energySafe && (bodyLift || snapLift)
    ? round(toNumber(next.start) - overlapDuration)
    : 0;
}

function terminalRescueMode(windows, mixStart, overlapDuration, policy) {
  const vocalConflict = (windows || []).some((window) => {
    const start = toNumber(window && window.start, NaN);
    const end = toNumber(window && window.end, NaN);
    return Number.isFinite(start)
      && Number.isFinite(end)
      && end > mixStart + 0.05
      && start < mixStart + overlapDuration;
  });
  if (vocalConflict) {
    return { rescueClass: 'A', variant: 'vocal-release', reason: 'outgoing-vocal-conflict' };
  }
  const energyContrastReasons = new Set([
    'snap-rise',
    'snap-release',
    'energy-tempo-rise',
    'energy-tempo-release',
    'style-bridge-mismatch',
  ]);
  if ((policy && policy.reasons || []).some((reason) => energyContrastReasons.has(reason))) {
    return { rescueClass: 'B', variant: 'staged-energy-bridge', reason: 'energy-contrast' };
  }
  return { rescueClass: 'C', variant: 'limited-window-crossfade', reason: 'limited-transition-window' };
}

function terminalRescueTimeline(mode, opts) {
  const {
    bStart,
    landingOffset,
    overlapDuration,
    aFadeAt = 0,
  } = opts;
  const handoff = { t: overlapDuration, deck: 'B', op: 'handoff' };
  const play = { t: 0, deck: 'B', op: 'play', at: bStart, volume: 0 };

  if (mode.rescueClass === 'A') {
    const bRiseAt = 0;
    const bRiseDuration = Math.round(Math.max(0.8, landingOffset) * 1000);
    const aFadeDuration = bRiseDuration;
    return {
      aFadeDuration,
      bRiseAt,
      bRiseDuration,
      timeline: [
        play,
        { t: aFadeAt, deck: 'A', op: 'volume', value: 0, duration: aFadeDuration, curve: 'equal-power-out' },
        { t: bRiseAt, deck: 'B', op: 'volume', value: 1, duration: bRiseDuration, curve: 'equal-power-in' },
        handoff,
      ],
    };
  }

  if (mode.rescueClass === 'B') {
    const aFadeDuration = Math.round(overlapDuration * 1000);
    const bRiseAt = round(Math.min(0.35, landingOffset * 0.14));
    const bRiseDuration = Math.round(Math.max(0.8, landingOffset - bRiseAt) * 1000);
    const stageAt = round(Math.min(0.35, landingOffset * 0.16));
    const finalAt = round(Math.max(stageAt + 0.9, overlapDuration * 0.5));
    const stageDuration = Math.round(Math.max(0.2, finalAt - stageAt) * 1000);
    const finalDuration = Math.round(Math.max(0.2, overlapDuration - finalAt) * 1000);
    return {
      aFadeDuration,
      bRiseAt,
      bRiseDuration,
      timeline: [
        play,
        { t: 0, deck: 'B', op: 'bass', value: 0.25, duration: 0 },
        { t: 0, deck: 'B', op: 'filter', type: 'highpass', value: 900, duration: 0 },
        { t: 0, deck: 'A', op: 'bass', value: 0.82, duration: Math.round(overlapDuration * 1000) },
        { t: aFadeAt, deck: 'A', op: 'volume', value: 0, duration: aFadeDuration, curve: 'equal-power-out' },
        { t: bRiseAt, deck: 'B', op: 'volume', value: 1, duration: bRiseDuration, curve: 'equal-power-in' },
        { t: stageAt, deck: 'B', op: 'filter', type: 'highpass', value: 450, duration: stageDuration },
        { t: stageAt, deck: 'B', op: 'bass', value: 0.55, duration: stageDuration },
        { t: finalAt, deck: 'B', op: 'filter', type: 'none', value: 0, duration: finalDuration },
        { t: finalAt, deck: 'B', op: 'bass', value: 1, duration: finalDuration },
        handoff,
      ],
    };
  }

  const aFadeDuration = Math.round(Math.max(0.2, overlapDuration - aFadeAt) * 1000);
  const bRiseAt = 0;
  const bRiseDuration = Math.round(landingOffset * 1000);
  return {
    aFadeDuration,
    bRiseAt,
    bRiseDuration,
    timeline: [
      play,
      { t: aFadeAt, deck: 'A', op: 'volume', value: 0, duration: aFadeDuration, curve: 'equal-power-out' },
      { t: bRiseAt, deck: 'B', op: 'volume', value: 1, duration: bRiseDuration, curve: 'equal-power-in' },
      handoff,
    ],
  };
}

function terminalRescue(fromAnalysis, toAnalysis, fromProfile, toProfile, protectedUntil, policy, rejected, entries = []) {
  const duration = Math.max(0, toNumber(fromProfile && fromProfile.duration));
  const sourceEnd = effectiveSourceEnd(fromProfile);
  const targetDuration = Math.max(0, toNumber(toProfile && toProfile.duration));
  const protectedBoundary = toNumber(protectedUntil);
  if (!(duration > 0)) return technicalFailure('TERMINAL_RESCUE_INVALID_DURATION', rejected);
  if (!(targetDuration > 0)) return technicalFailure('TERMINAL_RESCUE_INVALID_TARGET_DURATION', rejected);
  if (targetDuration < MINIMUM_TERMINAL_OVERLAP - 0.000001) {
    return technicalFailure('TERMINAL_RESCUE_INSUFFICIENT_TARGET_RUNWAY', rejected);
  }
  if (sourceEnd - protectedBoundary < MINIMUM_TERMINAL_OVERLAP - 0.000001) {
    return technicalFailure('TERMINAL_RESCUE_INSUFFICIENT_POST_PROTECTION_RUNWAY', rejected);
  }
  const [minRatio, maxRatio] = policy.preferredExitRange || [];
  const rangeExits = sourceExits(fromAnalysis, protectedUntil)
    .filter((candidate) => {
      const time = toNumber(candidate.time, NaN);
      const ratio = time / Math.max(1, duration);
      return Number.isFinite(time)
        && ratio >= minRatio
        && ratio <= maxRatio
        && sourceEnd - time >= MINIMUM_TERMINAL_OVERLAP - 0.000001;
    })
    .sort((a, b) => toNumber(b.time) - toNumber(a.time));
  const selectedExit = rangeExits[0] || null;
  const preferredStart = selectedExit
    ? toNumber(selectedExit.time)
    : Math.max(toNumber(protectedUntil), Math.min(sourceEnd - 3.6, duration * 0.92));
  const requestedMixStart = selectedExit
    ? ceilMillisecond(Math.max(protectedBoundary, toNumber(selectedExit.time)))
    : ceilMillisecond(Math.max(
      protectedBoundary,
      Math.min(sourceEnd - MINIMUM_TERMINAL_OVERLAP, preferredStart),
    ));
  const safeMixStart = terminalStartAfterVocal(
    fromAnalysis && fromAnalysis.structureMap && fromAnalysis.structureMap.vocalWindows,
    requestedMixStart,
    duration,
  );
  const safeOverlapDuration = floorMillisecond(Math.max(0, Math.min(3.4, sourceEnd - safeMixStart, targetDuration)));
  const mode = terminalRescueMode(
    fromAnalysis && fromAnalysis.structureMap && fromAnalysis.structureMap.vocalWindows,
    safeMixStart,
    safeOverlapDuration,
    policy,
  );
  const vocalBedLead = round(Math.max(0, safeMixStart - requestedMixStart));
  const useVocalBed = mode.rescueClass === 'C'
    && vocalBedLead >= 0.5
    && sourceEnd - requestedMixStart >= 4.6
    && targetDuration >= 4.6;
  const mixStart = useVocalBed ? requestedMixStart : safeMixStart;
  const overlapDuration = floorMillisecond(Math.max(0, Math.min(useVocalBed ? 5.8 : 3.4, sourceEnd - mixStart, targetDuration)));
  const aFadeAt = useVocalBed ? vocalBedLead : 0;
  const landingOffset = round(Math.max(1.65, Math.min(overlapDuration - 0.35, overlapDuration * 0.72)));
  const fallbackIntroTrim = mode.rescueClass === 'C' && !useVocalBed
    ? classCIntroTrim(toAnalysis, toProfile, overlapDuration)
    : 0;
  const trustedEntry = entries.find((candidate) => (
    ['hook', 'drop'].includes(landingKind(candidate))
    && toNumber(candidate.confidence) >= 0.6
    && toNumber(candidate.landingAt) >= landingOffset
    && toNumber(candidate.landingAt) + overlapDuration - landingOffset <= targetDuration
  ));
  const requestedLanding = trustedEntry ? toNumber(trustedEntry.landingAt) : landingOffset + fallbackIntroTrim;
  const bStart = round(Math.max(0, requestedLanding - landingOffset));
  const actualLanding = round(bStart + landingOffset);
  const entry = trustedEntry ? {
    ...trustedEntry,
    playFrom: bStart,
    landingAt: requestedLanding,
  } : {
    type: 'start',
    role: 'entry',
    source: 'fallback',
    time: 0,
    playFrom: bStart,
    landingAt: actualLanding,
    landingType: 'start',
    confidence: 0.35,
  };
  const execution = terminalRescueTimeline(mode, {
    bStart,
    landingOffset,
    overlapDuration,
    aFadeAt,
  });
  const { aFadeDuration, bRiseAt, bRiseDuration, timeline } = execution;
  const fallbackTimeline = [
    { t: 0, deck: 'B', op: 'play', at: bStart, volume: 0 },
    { t: aFadeAt, deck: 'A', op: 'volume', value: 0, duration: aFadeDuration, curve: 'equal-power-out' },
    { t: bRiseAt, deck: 'B', op: 'volume', value: 1, duration: bRiseDuration, curve: 'equal-power-in' },
    { t: overlapDuration, deck: 'B', op: 'handoff' },
  ];
  const audibleStart = bRiseAt + (bRiseDuration / 1000) * (Math.asin(0.08) / (Math.PI / 2));
  const audibleEnd = aFadeAt + (aFadeDuration / 1000) * (Math.acos(0.08) / (Math.PI / 2));
  const audibleOverlap = round(Math.max(0, audibleEnd - audibleStart));
  const exit = selectedExit ? { ...selectedExit, time: mixStart } : {
    type: 'terminal-boundary',
    role: 'exit',
    source: 'fallback',
    time: mixStart,
  };
  return {
    exit,
    entry,
    sectionChoice: null,
    recipeCandidate: {
      recipe: 'terminal-rescue',
      variant: mode.variant,
      rescueClass: mode.rescueClass,
      rescueReason: mode.reason,
      score: 0,
      timeline,
      fallbackTimeline,
      window: { audibleStart: 0, audibleEnd: round(audibleEnd), audibleOverlap, preRollDuration: round(audibleStart), handoffOffset: overlapDuration, runwayAvailable: true, landingError: round(actualLanding - requestedLanding) },
    },
    timeline,
    rescueClass: mode.rescueClass,
    rescueReason: mode.reason,
    effectiveSourceEnd: sourceEnd,
    mixStart,
    handoffAt: round(mixStart + overlapDuration),
    audibleOverlap,
    preRollDuration: round(audibleStart),
    exitRatio: round(mixStart / Math.max(1, duration)),
    energyContinuity: 0.35,
    grooveContinuity: 0.35,
    tempoCompatibility: 0,
    localMusicalEvidence: localMusicalEvidenceFor(fromAnalysis, toAnalysis, exit, entry),
    score: 0,
    rejectionReasons: ['no valid complete transition window', ...(rejected.length ? ['structural windows rejected'] : [])],
    routeFallbackUsed: true,
  };
}

function evidenceForTime(records, time) {
  return (Array.isArray(records) ? records : []).find((record) => (
    Number.isFinite(Number(record && record.time))
    && Math.abs(Number(record.time) - time) <= LANDING_TOLERANCE_SEC
  )) || null;
}

function overlapsWindow(windows, start, end) {
  return (Array.isArray(windows) ? windows : []).some((window) => (
    toNumber(window && window.end, NaN) > start
    && toNumber(window && window.start, NaN) < end
  ));
}

function cadencePolicy(protectedUntil, duration) {
  return {
    route: 'clean-boundary-handoff',
    compatibilityClass: 'conservative',
    contrastDirection: 'unknown',
    preferredExitRange: [
      clamp(toNumber(protectedUntil) / Math.max(1, duration)),
      1,
    ],
    entryPolicy: 'natural-entry',
    overlapClass: 'none',
    recipe: 'clean-boundary-handoff',
    reasons: ['cadence-evidence-verified'],
  };
}

function strictFallbackPolicy(reasons) {
  return {
    route: 'cadence-fallback',
    compatibilityClass: 'conservative',
    contrastDirection: 'unknown',
    preferredExitRange: [0.8, 1],
    entryPolicy: 'source-zero',
    overlapClass: 'short',
    recipe: 'end-of-track-crossfade',
    reasons: Array.from(new Set(reasons)).slice(0, 4),
  };
}

function cadenceCompleteResult(fromAnalysis, toAnalysis, fromProfile, toProfile, protectedUntil, exits, entries, decisions, recentRecipes) {
  const accepted = decisions
    .filter((decision) => decision.result.eligible)
    .sort((a, b) => a.exit.time - b.exit.time);
  const entry = entries.find((candidate) => (
    ['start', 'intro', 'drop'].includes(landingKind(candidate))
    && toNumber(candidate.confidence) >= 0.65
  ));
  if (!accepted.length || !entry) return null;

  for (const decision of accepted) {
    const exit = {
      ...decision.exit,
      type: 'cadence-boundary',
      originalType: decision.exit.type,
      confidence: Math.min(toNumber(decision.exit.confidence, 1), decision.result.confidence),
    };
    const policy = cadencePolicy(protectedUntil, toNumber(fromProfile.duration));
    const scored = scoreCandidatePair(exit, entry, fromAnalysis, toAnalysis, scoreWindowExit, exits);
    const sectionChoice = { ...scored, score: clamp(scored.score), entry: recipeSectionEntry(entry) };
    const recipePlan = planRecipeCandidates(fromProfile, toProfile, {
      sectionChoice,
      routePolicy: policy,
      recentRecipes,
    });
    const recipeCandidate = (recipePlan.candidates || []).find((candidate) => (
      candidate.recipe === 'clean-boundary-handoff' && candidate.eligible !== false
    ));
    if (!recipeCandidate) continue;
    const localMusicalEvidence = localMusicalEvidenceFor(fromAnalysis, toAnalysis, exit, entry);
    const chosen = rankWindow({
      exit,
      entry,
      sectionChoice,
      recipeCandidate,
      diagnostics: recipePlan.diagnostics || {},
      fromProfile,
      toProfile,
      policy,
      musicalEvidence: musicalEvidenceFor(fromAnalysis, toAnalysis),
      localMusicalEvidence,
    });
    chosen.cadenceFallback = {
      mode: 'cadence-complete',
      confidence: decision.result.confidence,
      reasons: [],
      crossfadeDuration: 0,
      audibleEnd: null,
      containerEnd: toNumber(fromProfile.duration),
      bSourceAt: toNumber(entry.playFrom, toNumber(entry.time)),
    };
    chosen.routeFallbackUsed = false;
    chosen.policy = policy;
    return { chosen, policy };
  }
  return null;
}

function trustedFullOutroIntro(fromAnalysis, toAnalysis, fromProfile, toProfile, protectedUntil, exits, entries, cadenceReasons, tailEvidence) {
  const sourceDuration = Math.max(0, toNumber(fromProfile && fromProfile.duration));
  const targetDuration = Math.max(0, toNumber(toProfile && toProfile.duration));
  const measuredEnd = toNumber(tailEvidence && tailEvidence.audibleEnd, NaN);
  const audibleEnd = Number.isFinite(measuredEnd)
    ? Math.max(0, Math.min(sourceDuration, measuredEnd))
    : sourceDuration;
  const outgoing = exits
    .filter((candidate) => (
      ['outro', 'natural-tail'].includes(String(candidate && candidate.type || '').toLowerCase())
      && toNumber(candidate.confidence) >= 0.65
      && toNumber(candidate.time) >= protectedUntil
    ))
    .sort((a, b) => toNumber(a.time) - toNumber(b.time))[0];
  const incoming = entries.find((candidate) => {
    const playFrom = toNumber(candidate && candidate.playFrom, toNumber(candidate && candidate.time));
    const landingAt = toNumber(candidate && candidate.landingAt, toNumber(candidate && candidate.time));
    return String(candidate && candidate.type || '').toLowerCase() === 'intro'
      && toNumber(candidate.confidence) >= 0.65
      && Math.abs(playFrom) <= 0.001
      && landingAt >= 0.8
      && landingAt <= 6
      && landingAt <= targetDuration;
  });
  if (!outgoing || !incoming) return null;

  const introDuration = toNumber(incoming.landingAt, toNumber(incoming.time));
  const mixStart = round(audibleEnd - introDuration);
  if (mixStart < toNumber(outgoing.time) || mixStart < protectedUntil) return null;
  const outgoingVocals = fromAnalysis && fromAnalysis.structureMap && fromAnalysis.structureMap.vocalWindows;
  const incomingVocals = toAnalysis && toAnalysis.structureMap && toAnalysis.structureMap.vocalWindows;
  if (overlapsWindow(outgoingVocals, mixStart, audibleEnd)
    || overlapsWindow(incomingVocals, 0, introDuration)) return null;

  const fadeMs = Math.round(introDuration * 1000);
  const timeline = [
    { t: 0, deck: 'B', op: 'play', at: 0, volume: 0 },
    { t: 0, deck: 'A', op: 'volume', value: 0, duration: fadeMs, curve: 'equal-power-out' },
    { t: 0, deck: 'B', op: 'volume', value: 1, duration: fadeMs, curve: 'equal-power-in' },
    { t: introDuration, deck: 'B', op: 'handoff' },
  ];
  const policy = {
    ...strictFallbackPolicy(cadenceReasons),
    entryPolicy: 'full-intro',
    overlapClass: 'medium',
    recipe: 'intro-outro-long-blend',
  };
  const entry = { ...incoming, playFrom: 0 };
  const chosen = {
    exit: { ...outgoing, time: mixStart },
    entry,
    sectionChoice: null,
    recipeCandidate: {
      recipe: 'intro-outro-long-blend',
      score: 0,
      timeline,
      window: {
        audibleStart: 0,
        audibleEnd: introDuration,
        audibleOverlap: introDuration,
        preRollDuration: 0,
        handoffOffset: introDuration,
        runwayAvailable: true,
        landingError: 0,
        overlapContract: { min: 5, max: 9 },
      },
    },
    timeline,
    effectiveSourceEnd: audibleEnd,
    mixStart,
    handoffAt: audibleEnd,
    audibleOverlap: introDuration,
    preRollDuration: 0,
    exitRatio: round(mixStart / Math.max(1, sourceDuration)),
    energyContinuity: 0.5,
    grooveContinuity: 0.5,
    tempoCompatibility: 0.5,
    score: 0,
    rejectionReasons: cadenceReasons.slice(0, 4),
    routeFallbackUsed: true,
    cadenceFallback: {
      mode: 'full-outro-intro',
      confidence: Math.min(toNumber(outgoing.confidence), toNumber(incoming.confidence)),
      reasons: cadenceReasons.slice(0, 4),
      crossfadeDuration: introDuration,
      audibleEnd,
      containerEnd: sourceDuration,
      bSourceAt: 0,
    },
    policy,
  };
  return { chosen, policy };
}

function endOfTrackCrossfade(fromProfile, toProfile, protectedUntil, cadenceReasons, tailEvidence) {
  const sourceDuration = Math.max(0, toNumber(fromProfile && fromProfile.duration));
  const targetDuration = Math.max(0, toNumber(toProfile && toProfile.duration));
  const measuredEnd = toNumber(tailEvidence && tailEvidence.audibleEnd, NaN);
  const audibleEnd = Number.isFinite(measuredEnd)
    ? Math.max(0, Math.min(sourceDuration, measuredEnd))
    : sourceDuration;
  const fadeSec = chooseEndCrossfadeDuration({
    fromAvailable: audibleEnd,
    toDuration: targetDuration,
    requestedDuration: tailEvidence && tailEvidence.requestedDuration,
    fromVocalState: tailEvidence && tailEvidence.fromVocalState,
    toVocalState: tailEvidence && tailEvidence.toVocalState,
  });
  const bPreRollDuration = round(Math.max(0, Math.min(
    5,
    targetDuration,
    toNumber(tailEvidence && tailEvidence.toAudibleStart, 0),
  )));
  const mixStart = round(Math.max(0, audibleEnd - fadeSec));
  const fadeMs = Math.round(fadeSec * 1000);
  const bPlayAt = bPreRollDuration > 0 ? -bPreRollDuration : 0;
  const timeline = [
    { t: bPlayAt, deck: 'B', op: 'play', at: 0, volume: 0 },
    { t: 0, deck: 'A', op: 'volume', value: 0, duration: fadeMs, curve: 'equal-power-out' },
    { t: 0, deck: 'B', op: 'volume', value: 1, duration: fadeMs, curve: 'equal-power-in' },
    { t: fadeSec, deck: 'B', op: 'handoff' },
  ];
  const reasons = Array.from(new Set([...cadenceReasons, 'outro-or-intro-untrusted'])).slice(0, 4);
  const policy = strictFallbackPolicy(reasons);
  const exit = { type: 'terminal-boundary', role: 'exit', source: 'fallback', time: mixStart, confidence: 1 };
  const entry = {
    type: 'start',
    role: 'entry',
    source: 'fallback',
    time: 0,
    playFrom: 0,
    landingAt: 0,
    landingType: 'start',
    confidence: 1,
  };
  const chosen = {
    exit,
    entry,
    sectionChoice: null,
    recipeCandidate: {
      recipe: 'end-of-track-crossfade',
      score: 0,
      timeline,
      window: {
        audibleStart: 0,
        audibleEnd: fadeSec,
        audibleOverlap: fadeSec,
        preRollDuration: bPreRollDuration,
        handoffOffset: fadeSec,
        runwayAvailable: fadeSec > 0,
        landingError: 0,
        overlapContract: { min: 0.1, max: 3 },
      },
    },
    timeline,
    effectiveSourceEnd: audibleEnd,
    mixStart,
    handoffAt: audibleEnd,
    audibleOverlap: fadeSec,
    preRollDuration: bPreRollDuration,
    exitRatio: round(mixStart / Math.max(1, sourceDuration)),
    energyContinuity: 0.5,
    grooveContinuity: 0.5,
    tempoCompatibility: 0.5,
    score: 0,
    rejectionReasons: reasons,
    routeFallbackUsed: true,
    cadenceFallback: {
      mode: 'end-of-track-crossfade',
      confidence: 1,
      reasons,
      crossfadeDuration: fadeSec,
      audibleEnd,
      containerEnd: sourceDuration,
      bSourceAt: 0,
      bPreRollDuration,
    },
    policy,
  };
  return { chosen, policy };
}

function chooseCadenceFallbackWindow(fromAnalysis, toAnalysis, opts, fromProfile, toProfile, protectedUntil, sourceExitOptions, entries, recentRecipes) {
  const decisions = sourceExitOptions.map((exit) => {
    const evidence = evidenceForTime(opts.boundaryEvidence, toNumber(exit.time));
    const timedVocalSection = overlapsWindow(
      fromAnalysis && fromAnalysis.structureMap && fromAnalysis.structureMap.vocalWindows,
      toNumber(exit.time) - LANDING_TOLERANCE_SEC,
      toNumber(exit.time) + LANDING_TOLERANCE_SEC,
    );
    return {
      exit,
      result: evaluateCadenceBoundary(evidence || {}, { timedVocalSection }),
    };
  });
  const cadenceRejected = decisions
    .filter((decision) => !decision.result.eligible)
    .map((decision) => ({ time: toNumber(decision.exit.time), reasons: decision.result.reasons.slice(0, 4) }));
  const cadenceReasons = Array.from(new Set(cadenceRejected.flatMap((item) => item.reasons))).slice(0, 4);
  const cadence = cadenceCompleteResult(
    fromAnalysis,
    toAnalysis,
    fromProfile,
    toProfile,
    protectedUntil,
    sourceExitOptions,
    entries,
    decisions,
    recentRecipes,
  );
  const selected = cadence
    || trustedFullOutroIntro(
      fromAnalysis,
      toAnalysis,
      fromProfile,
      toProfile,
      protectedUntil,
      sourceExitOptions,
      entries,
      cadenceReasons,
      opts.tailEvidence,
    )
    || endOfTrackCrossfade(fromProfile, toProfile, protectedUntil, cadenceReasons, opts.tailEvidence);
  return {
    chosen: selected.chosen,
    candidates: [],
    rejected: [],
    diagnostics: {
      protectedUntil,
      sourceExitCount: exitSourceCandidates(fromAnalysis).length,
      sourceLandingCount: sourceLandings(toAnalysis).length,
      consideredExitCount: sourceExitOptions.length,
      consideredLandingCount: entries.length,
      cadenceRejected,
      cadenceFallbackMode: selected.chosen.cadenceFallback.mode,
    },
    policy: selected.policy,
  };
}

function representativeRelationshipRisks(fromAnalysis, toAnalysis, exits, entries) {
  const exit = exits.slice()
    .sort((a, b) => scoreWindowExit(b) - scoreWindowExit(a) || toNumber(a.time) - toNumber(b.time))[0];
  const entry = entries[0];
  if (!exit || !entry) return [];
  const scored = scoreCandidatePair(exit, entry, fromAnalysis, toAnalysis, scoreWindowExit, exits);
  return Array.from(new Set((scored.evaluation && scored.evaluation.risks || [])
    .filter((risk) => typeof risk === 'string' && risk))).slice(0, 4);
}

function positiveOverlapEvidence(fromAnalysis, toAnalysis, fromProfile, toProfile, protectedUntil, exits, entries, risks, musicalEvidence) {
  const reasons = [];
  if (!musicalEvidence || toNumber(musicalEvidence.score) < 0.72) reasons.push('musical-evidence');
  if (musicalEvidence && (musicalEvidence.risks || []).length) reasons.push('musical-risk');
  if ((risks || []).some((risk) => [
    'vocal collision',
    'vocal overlap',
    'style bridge mismatch',
  ].includes(risk))) reasons.push('relationship-risk');
  if (!trustedGrid(fromProfile, toProfile)) reasons.push('beat-grid');

  const trustedExit = (exits || []).some((exit) => (
    exit && exit.source !== 'fallback'
    && toNumber(exit.confidence) >= 0.6
    && toNumber(exit.time) >= protectedUntil
  ));
  if (!trustedExit) reasons.push('outgoing-boundary');

  const toStructure = toAnalysis && toAnalysis.structureMap || {};
  const vocalWindows = Array.isArray(toStructure.vocalWindows) ? toStructure.vocalWindows : [];
  const vocalEvidenceAvailable = toStructure.structureSource === 'lyric+beat' && vocalWindows.length > 0;
  const instrumentalRunway = vocalEvidenceAvailable && (entries || []).some((entry) => {
    const type = String(entry && entry.type || '').toLowerCase();
    const playFrom = toNumber(entry && entry.playFrom, NaN);
    const landingAt = toNumber(entry && entry.landingAt, NaN);
    if (!entry || entry.source === 'fallback' || toNumber(entry.confidence) < 0.72) return false;
    if (!['intro', 'pre-hook'].includes(type) || !(playFrom < landingAt)) return false;
    return !vocalWindows.some((window) => (
      toNumber(window && window.end) > playFrom
      && toNumber(window && window.start) < landingAt
    ));
  });
  if (!instrumentalRunway) reasons.push('instrumental-runway');

  return {
    safe: reasons.length === 0,
    reasons: reasons.slice(0, 4),
  };
}

function chooseTransitionWindow(fromAnalysis = {}, toAnalysis = {}, opts = {}) {
  const fromProfile = profileOf(fromAnalysis);
  const toProfile = profileOf(toAnalysis);
  const recentRecipes = normalizeRecentRecipes(opts.recentRecipes);
  const protectedUntil = toNumber(fromAnalysis.structureMap && fromAnalysis.structureMap.protectedUntil);
  const sourceExitOptions = sourceExits(fromAnalysis, protectedUntil);
  const entries = landingOptions(toAnalysis);
  if (opts.enableCadenceFallback === true) {
    return chooseCadenceFallbackWindow(
      fromAnalysis,
      toAnalysis,
      opts,
      fromProfile,
      toProfile,
      protectedUntil,
      sourceExitOptions,
      entries,
      recentRecipes,
    );
  }
  const musicalEvidence = musicalEvidenceFor(fromAnalysis, toAnalysis);
  const risks = representativeRelationshipRisks(fromAnalysis, toAnalysis, sourceExitOptions, entries);
  const overlapEvidence = positiveOverlapEvidence(
    fromAnalysis,
    toAnalysis,
    fromProfile,
    toProfile,
    protectedUntil,
    sourceExitOptions,
    entries,
    risks,
    musicalEvidence,
  );
  const policy = classifyTransitionRoute({
    fromProfile,
    toProfile,
    protectedUntil,
    exits: sourceExitOptions,
    entries,
    risks,
    enableCleanBoundary: opts.enableCleanBoundary === true,
    overlapEvidence,
  });
  const exits = exitOptions(fromAnalysis, protectedUntil, policy);
  const plannedEntries = policy.route === 'clean-boundary-handoff'
    ? entries.map((candidate) => restoreCleanEntry(
      candidate,
      toAnalysis && toAnalysis.structureMap && toAnalysis.structureMap.vocalWindows,
    ))
    : entries;
  const diagnostics = {
    protectedUntil,
    sourceExitCount: exitSourceCandidates(fromAnalysis).length,
    sourceLandingCount: sourceLandings(toAnalysis).length,
    consideredExitCount: exits.length,
    consideredLandingCount: plannedEntries.length,
    exitCount: exits.length,
    landingCount: plannedEntries.length,
    recipeCandidatesConsidered: 0,
    musicalEvidence: !!musicalEvidence,
    musicalCompatibility: musicalEvidence ? musicalEvidence.score : null,
    harmonicSimilarity: musicalEvidence ? musicalEvidence.harmonicSimilarity : null,
    keyCompatibility: musicalEvidence ? musicalEvidence.keyCompatibility : null,
    melodySimilarity: musicalEvidence ? musicalEvidence.melodySimilarity : null,
    musicalRisks: musicalEvidence ? musicalEvidence.risks : [],
    overlapEvidence: overlapEvidence.safe,
    overlapEvidenceReasons: overlapEvidence.reasons,
  };

  if (policy.route === 'terminal-rescue') {
    const chosen = terminalRescue(fromAnalysis, toAnalysis, fromProfile, toProfile, protectedUntil, policy, [], plannedEntries);
    chosen.policy = policy;
    return {
      chosen,
      candidates: [],
      rejected: [],
      diagnostics,
      policy,
    };
  }

  const candidateWindows = [];
  const rejected = [];

  exits.forEach((exit) => {
    plannedEntries.forEach((entry) => {
      const scoredSectionChoice = scoreCandidatePair(exit, entry, fromAnalysis, toAnalysis, scoreWindowExit, exits);
      const sectionChoice = { ...scoredSectionChoice, score: clamp(scoredSectionChoice.score) };
      const localMusicalEvidence = localMusicalEvidenceFor(fromAnalysis, toAnalysis, exit, entry);
      const recipePlan = planRecipeCandidates(fromProfile, toProfile, {
        sectionChoice: { ...sectionChoice, entry: recipeSectionEntry(entry) },
        routePolicy: policy,
        recentRecipes,
      });
      (recipePlan.candidates || []).filter((candidate) => recipeCandidateAllowedByRoute(candidate, policy)).forEach((candidate) => {
        const recipeCandidate = { ...candidate, score: clamp(candidate.score) };
        diagnostics.recipeCandidatesConsidered += 1;
        const reasons = rejectionReasons({
          protectedUntil,
          sourceDuration: fromProfile.duration,
          exit,
          entry,
          recipeCandidate,
          diagnostics: recipePlan.diagnostics || {},
          vocalWindows: fromAnalysis.structureMap && fromAnalysis.structureMap.vocalWindows,
          incomingVocalWindows: toAnalysis.structureMap && toAnalysis.structureMap.vocalWindows,
          musicalEvidence,
          localMusicalEvidence,
        });
        const window = rankWindow({ exit, entry, sectionChoice, recipeCandidate, diagnostics: recipePlan.diagnostics || {}, fromProfile, toProfile, policy, musicalEvidence, localMusicalEvidence });
        if (reasons.length) rejected.push({ ...window, rejectionReasons: reasons });
        else candidateWindows.push(window);
      });
    });
  });
  candidateWindows.sort((a, b) => {
    const impactSelectionScore = (window) => (
      window.recipeCandidate && window.recipeCandidate.recipe === 'tease-roll-double-drop'
        ? toNumber(window.recipeCandidate.selectionScore)
        : 0
    );
    return b.score - a.score
      || impactSelectionScore(b) - impactSelectionScore(a)
      || a.exit.time - b.exit.time
      || a.entry.landingAt - b.entry.landingAt;
  });
  const selectedPolicy = candidateWindows.length ? policy : terminalRescuePolicy(policy, fromProfile, protectedUntil);
  const chosen = candidateWindows[0] || terminalRescue(fromAnalysis, toAnalysis, fromProfile, toProfile, protectedUntil, selectedPolicy, rejected, plannedEntries);
  chosen.policy = selectedPolicy;
  if (!chosen.routeFallbackUsed) chosen.routeFallbackUsed = false;
  return {
    chosen,
    candidates: candidateWindows.slice(1).map(compactWindow),
    rejected: rejected.map(compactWindow),
    diagnostics,
    policy: selectedPolicy,
  };
}

module.exports = { chooseTransitionWindow, isAnchoredLandingDiagnosticValid };
