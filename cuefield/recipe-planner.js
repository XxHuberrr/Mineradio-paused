const { round, toNumber } = require('./cue-profile');
const { compareMusicalProfiles } = require('./musical-profile');
const { LANDING_TOLERANCE_SEC, overlapContractFor } = require('./planner-contracts');

// Finite sentinel for invalid timelines with no computable landing equation.
const INVALID_LANDING_ERROR = Number.MAX_SAFE_INTEGER;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, toNumber(value)));
}

function curveGain(progress, curve) {
  const p = clamp(progress);
  if (curve === 'equal-power-in') return Math.sin(p * Math.PI / 2);
  if (curve === 'equal-power-out') return 1 - Math.cos(p * Math.PI / 2);
  return p;
}

function gainAtEnvelope(envelope, time) {
  let segment;
  for (let index = envelope.length - 1; index >= 0; index -= 1) {
    if (envelope[index].start <= time) {
      segment = envelope[index];
      break;
    }
  }
  if (!segment) return 0;
  if (!(segment.end > segment.start) || time >= segment.end) return clamp(segment.gainEnd);
  const progress = (time - segment.start) / (segment.end - segment.start);
  return clamp(segment.gainStart + (segment.gainEnd - segment.gainStart) * curveGain(progress, segment.curve));
}

function buildGainEnvelope(timeline, deck) {
  const baseGain = deck === 'A' ? 1 : 0;
  let envelope = [{ start: -Infinity, end: Infinity, gainStart: baseGain, gainEnd: baseGain }];
  const actions = (Array.isArray(timeline) ? timeline : [])
    .filter((action) => action && action.deck === deck && (action.op === 'play' || action.op === 'volume'))
    .map((action, index) => ({ action, index }))
    .sort((a, b) => toNumber(a.action.t) - toNumber(b.action.t) || a.index - b.index)
    .map(({ action }) => action);
  actions.forEach((action) => {
    const start = toNumber(action.t, NaN);
    if (!Number.isFinite(start)) return;
    const startGain = gainAtEnvelope(envelope, start);
    envelope = envelope
      .filter((segment) => segment.start < start)
      .map((segment) => segment.end > start ? { ...segment, end: start } : segment);
    if (action.op === 'play') {
      const gain = clamp(action.volume);
      envelope.push({ start, end: Infinity, gainStart: gain, gainEnd: gain });
      return;
    }
    const duration = Math.max(0, toNumber(action.duration) / 1000);
    const target = clamp(action.value);
    if (duration > 0) {
      const end = start + duration;
      envelope.push({ start, end, gainStart: startGain, gainEnd: target, curve: action.curve });
      envelope.push({ start: end, end: Infinity, gainStart: target, gainEnd: target });
    } else envelope.push({ start, end: Infinity, gainStart: target, gainEnd: target });
  });
  return envelope.sort((a, b) => a.start - b.start);
}

function measureTimelineWindow(timeline, threshold = 0.08) {
  const actions = Array.isArray(timeline) ? timeline : [];
  const play = actions.find((action) => action && action.deck === 'B' && action.op === 'play');
  const handoffs = actions.filter((action) => action && action.op === 'handoff');
  const handoff = handoffs[handoffs.length - 1];
  const playAt = play ? toNumber(play.t, 0) : 0;
  const handoffAt = handoff ? toNumber(handoff.t, playAt) : playAt;
  const starts = [playAt, handoffAt];
  const ends = [playAt, handoffAt];
  actions.forEach((action) => {
    const start = toNumber(action && action.t, NaN);
    if (!Number.isFinite(start)) return;
    starts.push(start);
    const duration = Math.max(0, toNumber(action.duration) / 1000);
    if (duration > 0) ends.push(start + duration);
  });
  const startTime = Math.min(...starts.filter(Number.isFinite));
  const endTime = Math.max(...ends.filter(Number.isFinite));
  const sampleStep = 0.005;
  const envelopes = {
    A: buildGainEnvelope(actions, 'A'),
    B: buildGainEnvelope(actions, 'B'),
  };
  const intervals = [];
  let activeStart = null;
  for (let time = startTime; time < endTime; time += sampleStep) {
    const start = round(time, 3);
    const end = Math.min(endTime, start + sampleStep);
    const midpoint = start + (end - start) / 2;
    const audible = gainAtEnvelope(envelopes.A, midpoint) >= threshold
      && gainAtEnvelope(envelopes.B, midpoint) >= threshold;
    if (audible && activeStart === null) activeStart = start;
    if (!audible && activeStart !== null) {
      intervals.push({ start: activeStart, end: start });
      activeStart = null;
    }
  }
  if (activeStart !== null) intervals.push({ start: activeStart, end: endTime });
  const longest = intervals
    .sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start)[0];
  const hasAudibleWindow = !!longest;
  const audibleStart = hasAudibleWindow ? longest.start : handoffAt;
  const audibleEnd = hasAudibleWindow ? longest.end : audibleStart;
  const start = hasAudibleWindow ? audibleStart : handoffAt;
  const end = hasAudibleWindow ? audibleEnd : start;
  return {
    preRollDuration: round(Math.max(0, start - playAt)),
    audibleOverlap: round(Math.max(0, end - start)),
    audibleStart: round(start),
    audibleEnd: round(end),
    handoffOffset: handoff ? handoff.t : 0,
  };
}

function landingDiagnostics(timeline, anchors) {
  const actions = Array.isArray(timeline) ? timeline : [];
  const handoffs = actions.filter((action) => action && action.op === 'handoff');
  const handoff = handoffs[handoffs.length - 1];
  const plays = actions.filter((action) => (
    action && action.deck === 'B' && action.op === 'play'
    && (!handoff || toNumber(action.t) <= toNumber(handoff.t))
  ));
  const play = plays[plays.length - 1];
  const requestedLanding = toNumber(anchors && anchors.bAnchor, NaN);
  const bImpactOffset = anchors && Number.isFinite(anchors.bImpactOffset)
    ? anchors.bImpactOffset
    : NaN;
  const landingOffset = Number.isFinite(bImpactOffset)
    ? bImpactOffset
    : toNumber(handoff && handoff.t, NaN);
  const rate = actions
    .filter((action) => (
      action && action.deck === 'B' && action.op === 'rate'
      && toNumber(action.t, Infinity) <= toNumber(play && play.t, -Infinity)
    ))
    .map((action) => toNumber(action.value, 1))
    .at(-1) || 1;
  const actualLanding = Number.isFinite(landingOffset) && play
    ? toNumber(play.at, NaN) + (landingOffset - toNumber(play.t, NaN)) * rate
    : (play && handoff
      ? toNumber(play.at, NaN) + (toNumber(handoff.t, NaN) - toNumber(play.t, NaN))
      : NaN);
  if (!Number.isFinite(requestedLanding) || !Number.isFinite(actualLanding)) {
    return { runwayAvailable: false, landingError: INVALID_LANDING_ERROR };
  }
  const landingError = round(actualLanding - requestedLanding);
  return {
    runwayAvailable: toNumber(play.at, NaN) >= 0
      && Math.abs(landingError) <= LANDING_TOLERANCE_SEC,
    landingError,
  };
}

function naturalEntryDiagnostics(timeline, metadata) {
  const actions = Array.isArray(timeline) ? timeline : [];
  const audibleAt = toNumber(metadata && metadata.naturalEntryAudibleAt, NaN);
  const requested = toNumber(metadata && metadata.naturalEntry, NaN);
  const plays = actions.filter((action) => (
    action && action.deck === 'B' && action.op === 'play'
    && toNumber(action.t, Infinity) <= audibleAt
  ));
  const play = plays[plays.length - 1];
  const rate = actions
    .filter((action) => (
      action && action.deck === 'B' && action.op === 'rate'
      && toNumber(action.t, Infinity) <= toNumber(play && play.t, -Infinity)
    ))
    .map((action) => toNumber(action.value, 1))
    .at(-1) || 1;
  const actual = play && Number.isFinite(audibleAt)
    ? toNumber(play.at, NaN) + (audibleAt - toNumber(play.t, NaN)) * rate
    : NaN;
  if (!Number.isFinite(requested) || !Number.isFinite(actual)) {
    return { runwayAvailable: false, landingError: INVALID_LANDING_ERROR };
  }
  const landingError = round(actual - requested);
  return {
    runwayAvailable: toNumber(play && play.at, NaN) >= 0
      && Math.abs(landingError) <= LANDING_TOLERANCE_SEC,
    landingError,
  };
}

function densityAt(windows, time) {
  const list = Array.isArray(windows) ? windows : [];
  const found = list.find((window) => time >= toNumber(window.start) && time < toNumber(window.end));
  if (found) return clamp(found.value);
  const nearest = list.slice().sort((a, b) => Math.abs(toNumber(a.start) - time) - Math.abs(toNumber(b.start) - time))[0];
  return nearest ? clamp(nearest.value) : 0;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function barsInRange(profile, start, end) {
  const bars = profile && Array.isArray(profile.bars) ? profile.bars : [];
  return bars.filter((bar) => toNumber(bar.end) > start && toNumber(bar.start) < end);
}

function textureAt(profile, start, end) {
  const bars = barsInRange(profile, start, end);
  return {
    energy: clamp(average(bars.map((bar) => toNumber(bar.energy, NaN)))),
    low: clamp(average(bars.map((bar) => toNumber(bar.lowDensity, NaN)))),
    body: clamp(average(bars.map((bar) => toNumber(bar.bodyDensity, NaN)))),
    snap: clamp(average(bars.map((bar) => toNumber(bar.snapDensity, NaN)))),
  };
}

function nearestCandidate(profile, role, time) {
  return (profile.candidates || [])
    .filter((candidate) => candidate && candidate.role === role && Number.isFinite(toNumber(candidate.time, NaN)))
    .sort((a, b) => Math.abs(toNumber(a.time) - time) - Math.abs(toNumber(b.time) - time))[0] || null;
}

function firstCandidate(profile, predicate) {
  return (profile.candidates || [])
    .filter((candidate) => candidate && Number.isFinite(toNumber(candidate.time, NaN)) && predicate(candidate))
    .sort((a, b) => toNumber(b.confidence) - toNumber(a.confidence) || toNumber(a.time) - toNumber(b.time))[0] || null;
}

function nearestDownbeatOffset(profile, time) {
  const offsets = (profile && Array.isArray(profile.downbeats) ? profile.downbeats : [])
    .map((downbeat) => Number(downbeat && typeof downbeat === 'object' ? downbeat.time : downbeat))
    .filter(Number.isFinite)
    .map((downbeat) => Math.abs(downbeat - time));
  return offsets.length ? round(Math.min(...offsets)) : NaN;
}

function barLength(profile) {
  const bars = profile && Array.isArray(profile.bars) ? profile.bars : [];
  const first = bars.find((bar) => toNumber(bar.end) > toNumber(bar.start));
  return first ? round(first.end - first.start) : Math.max(1, toNumber(profile && profile.gridStep, 0.5) * 4);
}

function pickAnchors(fromProfile, toProfile, opts = {}) {
  const sectionChoice = opts.sectionChoice || {};
  const fromCue = fromProfile.cuePoints || {};
  const toCue = toProfile.cuePoints || {};
  const hook = firstCandidate(toProfile, (candidate) => candidate.role === 'entry' && (candidate.type === 'hook' || candidate.type === 'chorus'));
  const intro = firstCandidate(toProfile, (candidate) => candidate.role === 'entry' && candidate.type === 'intro');
  const aExit = round(toNumber(sectionChoice.exit && sectionChoice.exit.time, toNumber(fromCue.outroStart, Math.max(0, fromProfile.duration - 16))));
  const bIntro = round(toNumber(intro && intro.time, toNumber(toCue.introStart, 0)));
  const sectionEntry = sectionChoice.entry || {};
  const bAnchor = round(toNumber(sectionEntry.resolvesTo && sectionEntry.resolvesTo.time, toNumber(sectionEntry.time, toNumber(hook && hook.time, toNumber(toCue.firstStrongDownbeat, bIntro)))));
  const bStart = Math.max(0, Math.min(bIntro, bAnchor));
  const bar = barLength(fromProfile);
  const aDownbeatOffset = nearestDownbeatOffset(fromProfile, aExit);
  const bDownbeatOffset = nearestDownbeatOffset(toProfile, bAnchor);
  const measuredOffsets = [aDownbeatOffset, bDownbeatOffset].filter(Number.isFinite);

  return {
    aExit,
    bStart: round(bStart),
    bAnchor,
    barLength: bar,
    aDownbeatOffset,
    bDownbeatOffset,
    downbeatOffset: measuredOffsets.length === 2 ? Math.max(...measuredOffsets) : NaN,
  };
}

function commonScores(fromProfile, toProfile, anchors) {
  const aEnergy = densityAt(fromProfile.windows && fromProfile.windows.energy, anchors.aExit);
  const bEnergy = densityAt(toProfile.windows && toProfile.windows.energy, anchors.bAnchor);
  const aBass = densityAt(fromProfile.windows && fromProfile.windows.bass, anchors.aExit);
  const bBass = densityAt(toProfile.windows && toProfile.windows.bass, anchors.bStart);
  const tempo = tempoFamilyAssessment(fromProfile.bpm, toProfile.bpm);
  const bpmDiff = tempo.passiveTempoDelta === tempo.tempoFamilyDelta
    ? Math.abs(tempo.bpmA - tempo.normalizedBpmB)
    : Math.abs(tempo.bpmA - tempo.bpmB);
  const beatScore = Number.isFinite(anchors.downbeatOffset)
    ? 1 - Math.min(1, anchors.downbeatOffset / Math.max(anchors.barLength / 2, 0.001))
    : 0.5;
  const energyScore = 1 - Math.min(1, Math.abs(aEnergy - bEnergy) / 0.65);
  const bassScore = 1 - Math.min(1, Math.max(0, aBass + bBass - 0.88) / 0.7);
  const bpmScore = 1 - Math.min(1, bpmDiff / 18);
  const outroTexture = textureAt(fromProfile, anchors.aExit, toNumber(fromProfile.duration, anchors.aExit) + 0.001);
  const introTexture = textureAt(toProfile, anchors.bStart, anchors.bStart + 12);
  const exitCandidate = nearestCandidate(fromProfile, 'exit', anchors.aExit);
  const outroLengthScore = clamp((toNumber(fromProfile.duration) - anchors.aExit) / 16);
  const outroConfidence = clamp(exitCandidate && exitCandidate.confidence, 0, 1);
  const outroCompleteness = clamp(outroLengthScore * 0.45 + outroConfidence * 0.35 + (1 - outroTexture.energy) * 0.2);
  const bIntroAggression = clamp(introTexture.energy * 0.55 + introTexture.low * 0.25 + introTexture.snap * 0.2);
  const styleTextureDistance = clamp(average([
    Math.abs(outroTexture.energy - introTexture.energy),
    Math.abs(outroTexture.low - introTexture.low),
    Math.abs(outroTexture.body - introTexture.body),
    Math.abs(outroTexture.snap - introTexture.snap),
  ]) / 0.7);

  return {
    aEnergy,
    bEnergy,
    aBass,
    bBass,
    beatScore,
    energyScore,
    bassScore,
    bpmScore,
    outroCompleteness,
    bIntroAggression,
    styleTextureDistance,
  };
}

function tempoFamilyAssessment(firstBpm, secondBpm) {
  const bpmA = Math.max(0, toNumber(firstBpm));
  const bpmB = Math.max(0, toNumber(secondBpm));
  if (!(bpmA > 0) || !(bpmB > 0)) {
    return {
      bpmA,
      bpmB,
      normalizedBpmB: bpmB,
      tempoScale: 1,
      tempoFamilyDelta: 1,
      passiveTempoDelta: 1,
      relativeTempoDelta: 1,
      targetPlaybackRate: 1,
      tempoLockAvailable: false,
    };
  }
  const match = [1, 0.5, 2]
    .map((scale) => {
      const normalizedBpmB = bpmB * scale;
      return {
        scale,
        normalizedBpmB,
        delta: Math.abs(bpmA - normalizedBpmB) / Math.max(bpmA, normalizedBpmB),
      };
    })
    .sort((a, b) => a.delta - b.delta || Math.abs(1 - a.scale) - Math.abs(1 - b.scale))[0];
  const requestedRate = bpmA / Math.max(match.normalizedBpmB, 1);
  const tempoLockAvailable = requestedRate >= 0.94 && requestedRate <= 1.06;
  const targetPlaybackRate = tempoLockAvailable ? round(requestedRate) : 1;
  const directTempoDelta = Math.abs(bpmA - bpmB) / Math.max(bpmA, bpmB);
  const passiveTempoDelta = match.scale === 1 || Math.abs(targetPlaybackRate - 1) <= 0.001
    ? match.delta
    : directTempoDelta;
  return {
    bpmA,
    bpmB,
    normalizedBpmB: round(match.normalizedBpmB),
    tempoScale: match.scale,
    tempoFamilyDelta: round(match.delta),
    passiveTempoDelta: round(passiveTempoDelta),
    relativeTempoDelta: round(passiveTempoDelta),
    targetPlaybackRate,
    tempoLockAvailable,
  };
}

function baseCandidate(recipe, score, confidence, reason, risks, anchors, timeline, windowMetadata = {}) {
  const landing = windowMetadata.landingMode === 'natural-entry'
    ? naturalEntryDiagnostics(timeline, windowMetadata)
    : landingDiagnostics(timeline, anchors);
  const measuredWindow = measureTimelineWindow(timeline);
  return {
    recipe,
    score: round(score),
    confidence: round(confidence),
    reason,
    risks,
    anchors,
    timeline,
    window: {
      ...measuredWindow,
      overlapContract: overlapContractFor(recipe),
      ...windowMetadata,
      ...landing,
    },
  };
}

function cleanBoundaryTiming(exit = {}) {
  const type = String(exit.type || '').toLowerCase();
  if (type === 'natural-tail') {
    return { variant: 'a-tail-release', tailSec: 0.6, breathSec: 0 };
  }
  if (type === 'release' || type === 'outro') {
    return { variant: 'a-tail-release', tailSec: 0.45, breathSec: 0 };
  }
  if (type === 'post-hook-boundary') {
    return { variant: 'short-breath', tailSec: 0.08, breathSec: 0.18 };
  }
  return { variant: 'dry-downbeat', tailSec: 0.08, breathSec: 0 };
}

function makeCleanBoundaryHandoff(anchors, scores, sectionChoice = {}) {
  const entry = sectionChoice.entry || {};
  const timing = cleanBoundaryTiming(sectionChoice.exit || {});
  const audibleAt = round(timing.tailSec + timing.breathSec);
  const naturalEntry = Math.max(0, toNumber(entry.playFrom, toNumber(entry.time)));
  const preRoll = Math.min(0.25, audibleAt, naturalEntry);
  const playAt = round(audibleAt - preRoll);
  const sourceAt = round(naturalEntry - preRoll);
  const handoffAt = round(audibleAt + 0.12);
  const timeline = [
    { t: playAt, deck: 'B', op: 'play', at: sourceAt, volume: 0 },
    {
      t: 0,
      deck: 'A',
      op: 'volume',
      value: 0,
      duration: Math.round(timing.tailSec * 1000),
      curve: 'equal-power-out',
    },
    {
      t: audibleAt,
      deck: 'B',
      op: 'volume',
      value: 1,
      duration: 120,
      curve: 'equal-power-in',
    },
    { t: handoffAt, deck: 'B', op: 'handoff' },
  ];
  const candidate = baseCandidate(
    'clean-boundary-handoff',
    0.68 + scores.beatScore * 0.12 + scores.energyScore * 0.08,
    0.88,
    'A completes before B begins at its natural source boundary',
    [],
    { ...anchors, bStart: sourceAt, bAnchor: naturalEntry, lead: 0 },
    timeline,
    {
      transitionStart: 0,
      landingMode: 'natural-entry',
      naturalEntry,
      naturalEntryAudibleAt: audibleAt,
      variant: timing.variant,
      aOnlyTailDuration: timing.tailSec,
      breathDuration: timing.breathSec,
      actualTwoDeckOverlap: 0,
      preRollDuration: round(preRoll),
    },
  );
  return { ...candidate, variant: timing.variant };
}

function alignedBStart(anchors, playAt, handoffAt) {
  return Math.max(0, round(toNumber(anchors && anchors.bAnchor) - (toNumber(handoffAt) - toNumber(playAt))));
}

function makeLongBlend(anchors, scores) {
  const lead = 8;
  const handoffAt = 2.6;
  const bStart = alignedBStart(anchors, -lead, handoffAt);
  const score = 0.28 + scores.beatScore * 0.28 + scores.energyScore * 0.18 + scores.bassScore * 0.18 + scores.bpmScore * 0.08;
  const risks = [];
  if (scores.bassScore < 0.45) risks.push('bass overlap needs eq');
  return baseCandidate(
    'intro-outro-long-blend',
    score,
    Math.min(0.9, score + 0.04),
    ['A outro supports longer bed', 'B intro can enter before anchor'],
    risks,
    { ...anchors, bStart, lead },
    [
      { t: -lead, deck: 'B', op: 'play', at: bStart, volume: 0 },
      { t: -lead, deck: 'B', op: 'volume', value: 0.58, duration: 5200 },
      { t: -4.5, deck: 'B', op: 'filter', type: 'highpass', value: 650, duration: 2600 },
      { t: -2.4, deck: 'A', op: 'volume', value: 0, duration: 4800, curve: 'equal-power-out' },
      { t: -2, deck: 'A', op: 'bass', value: 0.72, duration: 3000 },
      { t: -1.2, deck: 'B', op: 'bass', value: 0.82, duration: 1400 },
      { t: 0, deck: 'B', op: 'filter', type: 'none', value: 0, duration: 900 },
      { t: handoffAt, deck: 'B', op: 'handoff' },
    ],
  );
}

function makeFilteredPickup(anchors, scores, route, assessment) {
  const shortRoute = route === 'late-contrast-rise';
  const lead = shortRoute ? 2.8 : 4;
  const handoffAt = shortRoute ? 0.6 : 2.2;
  const bStart = alignedBStart(anchors, -lead, handoffAt);
  const score = 0.34 + scores.beatScore * 0.3 + scores.energyScore * 0.18 + scores.bassScore * 0.12 + scores.bpmScore * 0.06;
  const risks = [];
  if (scores.energyScore < 0.35) risks.push('noticeable energy change');
  return baseCandidate(
    'filtered-pickup',
    score,
    Math.min(0.92, score + 0.05),
    ['B pickup is filtered before downbeat', 'A low end clears before handoff'],
    risks,
    { ...anchors, bStart: round(bStart), lead },
    shortRoute ? [
      { t: -lead, deck: 'B', op: 'play', at: round(bStart), volume: 0 },
      { t: -lead, deck: 'B', op: 'filter', type: 'highpass', value: 900, duration: 1300 },
      { t: -2.6, deck: 'B', op: 'volume', value: 1, duration: 2500, curve: 'equal-power-in' },
      { t: -1.7, deck: 'A', op: 'bass', value: 0.35, duration: 900 },
      { t: -1.5, deck: 'A', op: 'duck', bpm: assessment.bpmA, depth: 0.32, pulses: 4, beats: 1, attack: 18, hold: 65, release: 130 },
      { t: -0.7, deck: 'A', op: 'volume', value: 0, duration: 1000, curve: 'equal-power-out' },
      { t: -0.6, deck: 'B', op: 'bass', value: 0.8, duration: 700 },
      { t: -0.5, deck: 'B', op: 'filter', type: 'none', value: 0, duration: 800 },
      { t: handoffAt, deck: 'B', op: 'handoff' },
    ] : [
      { t: -lead, deck: 'B', op: 'play', at: round(bStart), volume: 0 },
      { t: -lead, deck: 'B', op: 'filter', type: 'highpass', value: 900, duration: 1800 },
      { t: -3.6, deck: 'B', op: 'volume', value: 0.72, duration: 2600 },
      { t: -2.2, deck: 'A', op: 'bass', value: 0.35, duration: 1300 },
      { t: -2, deck: 'A', op: 'duck', bpm: assessment.bpmA, depth: 0.26, pulses: 4, beats: 1, attack: 18, hold: 65, release: 140 },
      { t: -0.4, deck: 'B', op: 'bass', value: 0.8, duration: 900 },
      { t: 0, deck: 'B', op: 'filter', type: 'none', value: 0, duration: 900 },
      { t: 1.1, deck: 'A', op: 'volume', value: 0, duration: 1000 },
      { t: handoffAt, deck: 'B', op: 'handoff' },
    ],
  );
}

function makeBassHandoff(anchors, scores, assessment) {
  const lead = 5.2;
  const handoffAt = 1.8;
  const bStart = alignedBStart(anchors, -lead, handoffAt);
  const score = 0.3 + scores.beatScore * 0.28 + scores.bassScore * 0.24 + scores.energyScore * 0.12 + scores.bpmScore * 0.06;
  const risks = [];
  if (scores.aBass > 0.65 && scores.bBass > 0.55) risks.push('requires bass swap');
  return baseCandidate(
    'bass-eq-handoff',
    score,
    Math.min(0.88, score + 0.03),
    ['bass is exchanged instead of stacked', 'handoff lands near downbeat'],
    risks,
    { ...anchors, bStart, lead },
    [
      { t: -lead, deck: 'B', op: 'play', at: bStart, volume: 0 },
      { t: -lead, deck: 'B', op: 'bass', value: 0.15, duration: 0 },
      { t: -4.8, deck: 'B', op: 'volume', value: 0.68, duration: 2600 },
      { t: -2.6, deck: 'A', op: 'bass', value: 0.18, duration: 1800 },
      { t: -2.2, deck: 'A', op: 'duck', bpm: assessment.bpmA, depth: 0.3, pulses: 4, beats: 1, attack: 16, hold: 70, release: 145 },
      { t: -1, deck: 'B', op: 'bass', value: 0.92, duration: 1100 },
      { t: 0.3, deck: 'A', op: 'volume', value: 0, duration: 1200 },
      { t: handoffAt, deck: 'B', op: 'handoff' },
    ],
  );
}

function makeSpectralEmergence(anchors, scores, assessment) {
  const playAt = -7.2;
  const handoffAt = 1;
  const rate = assessment.targetPlaybackRate;
  const bStart = Math.max(0, round(anchors.bAnchor - (handoffAt - playAt) * rate));
  const score = 0.44
    + scores.beatScore * 0.12
    + scores.energyScore * 0.08
    + scores.bassScore * 0.08
    + scores.outroCompleteness * 0.08
    + assessment.musicalCompatibility * 0.14
    - scores.styleTextureDistance * 0.05;
  const timeline = [
    { t: playAt, deck: 'B', op: 'rate', value: rate, duration: 0 },
    { t: playAt, deck: 'B', op: 'play', at: bStart, volume: 0 },
    { t: playAt, deck: 'B', op: 'spectrum', low: 0.82, mid: 0.18, high: 0.12, duration: 0 },
    { t: playAt + 0.2, deck: 'B', op: 'volume', value: 0.58, duration: 2400, curve: 'equal-power-in' },
    { t: -4.8, deck: 'B', op: 'spectrum', low: 0.86, mid: 0.58, high: 0.42, duration: 1900 },
    { t: -3.2, deck: 'B', op: 'volume', value: 0.82, duration: 1800, curve: 'equal-power-in' },
    { t: -2.2, deck: 'A', op: 'bass', value: 0.18, duration: 1400 },
    { t: -2, deck: 'A', op: 'duck', bpm: assessment.bpmA, depth: 0.26, pulses: 4, beats: 1, attack: 18, hold: 65, release: 140 },
    { t: -0.8, deck: 'B', op: 'spectrum', low: 1, mid: 1, high: 1, duration: 900 },
    { t: -1.8, deck: 'A', op: 'volume', value: 0, duration: 2800, curve: 'equal-power-out' },
    { t: handoffAt, deck: 'B', op: 'rate', value: 1, duration: 2400 },
    { t: handoffAt, deck: 'B', op: 'handoff' },
  ];
  const candidate = baseCandidate(
    'spectral-emergence',
    score,
    Math.min(0.94, score + 0.06),
    ['B groove emerges before its melody', 'three spectrum stages preserve body before the full reveal'],
    [],
    { ...anchors, ...assessment, bStart, lead: -playAt },
    timeline,
  );
  candidate.fallbackTimeline = safetyFallback(anchors);
  return candidate;
}

function makeQuickFade(anchors, scores) {
  const lead = 2.6;
  const handoffAt = 1;
  const bStart = alignedBStart(anchors, -lead, handoffAt);
  const score = 0.24 + scores.beatScore * 0.32 + scores.energyScore * 0.16 + scores.bpmScore * 0.1;
  return baseCandidate(
    'quick-safe-fade',
    score,
    Math.min(0.78, score),
    ['fallback when longer overlap is risky'],
    ['short transition'],
    { ...anchors, bStart, lead },
    [
      { t: -lead, deck: 'B', op: 'play', at: bStart, volume: 0 },
      { t: -lead, deck: 'B', op: 'volume', value: 0.76, duration: 1800 },
      { t: -0.6, deck: 'A', op: 'volume', value: 0.2, duration: 800 },
      { t: 0.3, deck: 'A', op: 'volume', value: 0, duration: 600 },
      { t: handoffAt, deck: 'B', op: 'handoff' },
    ],
  );
}

function makeEchoOut(anchors, scores, assessment) {
  const playAt = -2.8;
  const handoffAt = 1.8;
  const bStart = alignedBStart(anchors, playAt, handoffAt);
  const fallback = buildSafetyTimelineForAnchors({
    bLandingAt: anchors.bAnchor,
    overlapClass: 'short',
    overlapDuration: 3.4,
  });
  const score = 0.4
    + scores.beatScore * 0.16
    + scores.energyScore * 0.08
    + scores.outroCompleteness * 0.12
    + (1 - scores.styleTextureDistance) * 0.04;
  const candidate = baseCandidate(
    'echo-out',
    score,
    Math.min(0.9, score + 0.08),
    ['A echo tail masks the dry cut', 'B enters on a protected short runway'],
    [],
    { ...anchors, ...assessment, bStart, lead: 2.8 },
    [
      { t: playAt, deck: 'B', op: 'play', at: bStart, volume: 0 },
      { t: playAt, deck: 'B', op: 'bass', value: 0.15, duration: 0 },
      { t: -1.4, deck: 'B', op: 'volume', value: 1, duration: 1600, curve: 'equal-power-in' },
      { t: -2, deck: 'A', op: 'echo', enabled: true, bpm: assessment.bpmA, delayBeats: 0.5, feedback: 0.56, wet: 0.34, duration: 180 },
      { t: -1.4, deck: 'A', op: 'bass', value: 0.45, duration: 600 },
      { t: -1.2, deck: 'A', op: 'volume', value: 0.32, duration: 1400, curve: 'equal-power-out' },
      { t: -0.4, deck: 'B', op: 'bass', value: 1, duration: 800 },
      { t: 0.2, deck: 'A', op: 'volume', value: 0, duration: 1400, curve: 'equal-power-out' },
      { t: 0.7, deck: 'A', op: 'echo', enabled: false, bpm: assessment.bpmA, delayBeats: 0.5, feedback: 0.56, wet: 0.34, duration: 160, tailMs: 1200 },
      { t: handoffAt, deck: 'B', op: 'handoff' },
    ],
  );
  candidate.fallbackTimeline = fallback.timeline;
  return candidate;
}

function safetyFallback(anchors) {
  return buildSafetyTimelineForAnchors({
    bLandingAt: anchors.bAnchor,
    overlapClass: 'short',
    overlapDuration: 3.4,
  }).timeline;
}

function makeSourceLoopRoll(anchors, scores, assessment) {
  const playAt = -3.2;
  const handoffAt = 0.8;
  const bStart = alignedBStart(anchors, playAt, handoffAt);
  const loopStart = Math.max(0, round(anchors.aExit - 4));
  const score = 0.36 + scores.beatScore * 0.18 + scores.energyScore * 0.12 + scores.bpmScore * 0.08;
  const candidate = baseCandidate(
    'source-loop-roll',
    score,
    Math.min(0.86, score + 0.08),
    ['A source phrase tightens over three stages', 'slip release preserves the original song position'],
    ['requires stable source looping'],
    { ...anchors, bStart, lead: 4 },
    [
      { t: -4, deck: 'A', op: 'loop', enabled: true, startAt: loopStart, bpm: assessment.bpmA, loopBeats: 4, slip: true },
      { t: -3.2, deck: 'B', op: 'play', at: bStart, volume: 0 },
      { t: -3.2, deck: 'B', op: 'bass', value: 0.12, duration: 0 },
      { t: -3, deck: 'B', op: 'volume', value: 0.72, duration: 2400, curve: 'equal-power-in' },
      { t: -2.4, deck: 'A', op: 'loop', enabled: true, startAt: loopStart, bpm: assessment.bpmA, loopBeats: 2, slip: true },
      { t: -1.2, deck: 'A', op: 'loop', enabled: true, startAt: loopStart, bpm: assessment.bpmA, loopBeats: 1, slip: true },
      { t: -1, deck: 'A', op: 'duck', bpm: assessment.bpmA, depth: 0.36, pulses: 4, beats: 0.5, attack: 12, hold: 55, release: 100 },
      { t: -0.6, deck: 'A', op: 'loop', enabled: false, slip: true },
      { t: -0.5, deck: 'A', op: 'volume', value: 0, duration: 700, curve: 'equal-power-out' },
      { t: -0.4, deck: 'B', op: 'bass', value: 1, duration: 700 },
      { t: handoffAt, deck: 'B', op: 'handoff' },
    ],
    { audibleStart: -4, preRollDuration: 0 },
  );
  candidate.fallbackTimeline = safetyFallback(anchors);
  return candidate;
}

function makeHookTeaser(anchors, scores, assessment) {
  const finalPlayAt = -3.2;
  const handoffAt = 0.8;
  const bStart = alignedBStart(anchors, finalPlayAt, handoffAt);
  const teaserAt = Math.max(0, round(anchors.bAnchor));
  const score = 0.38
    + scores.beatScore * 0.12
    + scores.energyScore * 0.08
    + assessment.musicalCompatibility * 0.14;
  const candidate = baseCandidate(
    'hook-teaser',
    score,
    Math.min(0.88, score + 0.08),
    ['B hook is previewed before its phrase-aligned landing', 'the teaser clears before the final entry'],
    ['requires a trusted isolated hook'],
    { ...anchors, bStart, lead: 7 },
    [
      { t: -7, deck: 'B', op: 'play', at: teaserAt, volume: 0 },
      { t: -6.8, deck: 'B', op: 'filter', type: 'highpass', value: 1200, duration: 0 },
      { t: -7, deck: 'B', op: 'volume', value: 0.32, duration: 260 },
      { t: -5.8, deck: 'B', op: 'volume', value: 0, duration: 320 },
      { t: -5.4, deck: 'B', op: 'stop' },
      { t: finalPlayAt, deck: 'B', op: 'play', at: bStart, volume: 0 },
      { t: finalPlayAt, deck: 'B', op: 'bass', value: 0.12, duration: 0 },
      { t: -3, deck: 'B', op: 'volume', value: 0.78, duration: 2400, curve: 'equal-power-in' },
      { t: -1.8, deck: 'A', op: 'duck', bpm: assessment.bpmA, depth: 0.28, pulses: 4, beats: 1, attack: 18, hold: 60, release: 130 },
      { t: -0.7, deck: 'A', op: 'bass', value: 0.2, duration: 600 },
      { t: -0.5, deck: 'B', op: 'filter', type: 'none', value: 0, duration: 600 },
      { t: -0.4, deck: 'B', op: 'bass', value: 1, duration: 700 },
      { t: -0.3, deck: 'A', op: 'volume', value: 0, duration: 700, curve: 'equal-power-out' },
      { t: handoffAt, deck: 'B', op: 'handoff' },
    ],
    { audibleStart: -7, preRollDuration: 0 },
  );
  candidate.fallbackTimeline = safetyFallback(anchors);
  return candidate;
}

function makeHarmonicDoubleDrop(anchors, scores, assessment) {
  const playAt = -1.6;
  const handoffAt = 0.6;
  const bStart = alignedBStart(anchors, playAt, handoffAt);
  const score = 0.42
    + scores.beatScore * 0.12
    + scores.energyScore * 0.1
    + assessment.musicalCompatibility * 0.18;
  const candidate = baseCandidate(
    'harmonic-double-drop',
    score,
    Math.min(0.94, score + 0.08),
    ['A and B land together on a tightly matched hook', 'kick ducking protects the double drop'],
    ['high impact recipe'],
    { ...anchors, bStart, lead: 1.6 },
    [
      { t: playAt, deck: 'B', op: 'play', at: bStart, volume: 0 },
      { t: playAt, deck: 'B', op: 'bass', value: 0.08, duration: 0 },
      { t: -1.3, deck: 'B', op: 'volume', value: 0.82, duration: 900, curve: 'equal-power-in' },
      { t: -0.8, deck: 'A', op: 'duck', bpm: assessment.bpmA, depth: 0.42, pulses: 4, beats: 0.5, attack: 10, hold: 55, release: 95 },
      { t: -0.45, deck: 'A', op: 'bass', value: 0.18, duration: 320 },
      { t: -0.2, deck: 'B', op: 'bass', value: 1, duration: 320 },
      { t: 0, deck: 'A', op: 'volume', value: 0, duration: 420, curve: 'equal-power-out' },
      { t: handoffAt, deck: 'B', op: 'handoff' },
    ],
  );
  candidate.fallbackTimeline = safetyFallback(anchors);
  return candidate;
}

function makeTeaseRollDoubleDrop(anchors, scores, assessment) {
  const teaserAt = -7.2;
  const finalPlayAt = -1.6;
  const handoffAt = 0.6;
  const fakeOutMs = 140;
  const fourBeatDuration = 240 / Math.max(assessment.bpmA, 1);
  const loopStart = Math.max(0, round(anchors.aExit - fourBeatDuration));
  const bStart = Math.max(0, round(anchors.bAnchor - (0 - finalPlayAt)));
  const fallbackTimeline = makeBassHandoff(anchors, scores, assessment).timeline
    .map((action) => ({ ...action }));
  const score = 0.44
    + scores.beatScore * 0.14
    + scores.energyScore * 0.1
    + assessment.musicalCompatibility * 0.16;
  const candidate = baseCandidate(
    'tease-roll-double-drop',
    score,
    Math.min(0.96, score + 0.08),
    ['B hook teaser previews the impact', 'A source roll tightens into a protected double drop'],
    ['high impact recipe'],
    {
      ...anchors,
      bStart,
      lead: 7.2,
      fakeOutMs,
      teaserUsed: true,
      bImpactOffset: 0,
    },
    [
      { t: teaserAt, deck: 'B', op: 'play', at: anchors.bAnchor, volume: 0 },
      { t: teaserAt, deck: 'B', op: 'filter', type: 'highpass', value: 1200, duration: 0 },
      { t: teaserAt, deck: 'B', op: 'bass', value: 0.1, duration: 0 },
      { t: -7, deck: 'B', op: 'volume', value: 0.32, duration: 220 },
      { t: -6.1, deck: 'B', op: 'volume', value: 0, duration: 180 },
      { t: -5.8, deck: 'B', op: 'stop' },
      { t: -4, deck: 'A', op: 'loop', enabled: true, startAt: loopStart, bpm: assessment.bpmA, loopBeats: 4, slip: true },
      { t: -2, deck: 'A', op: 'loop', enabled: true, startAt: loopStart, bpm: assessment.bpmA, loopBeats: 2, slip: true },
      { t: finalPlayAt, deck: 'B', op: 'play', at: bStart, volume: 0 },
      { t: finalPlayAt, deck: 'B', op: 'filter', type: 'none', value: 0, duration: 0 },
      { t: finalPlayAt, deck: 'B', op: 'bass', value: 0.08, duration: 0 },
      { t: -1, deck: 'A', op: 'loop', enabled: true, startAt: loopStart, bpm: assessment.bpmA, loopBeats: 1, slip: true },
      { t: -0.5, deck: 'A', op: 'loop', enabled: true, startAt: loopStart, bpm: assessment.bpmA, loopBeats: 0.5, slip: true },
      { t: -0.14, deck: 'A', op: 'loop', enabled: false, slip: true },
      { t: -0.14, deck: 'A', op: 'volume', value: 0.08, duration: 0, optionalWhenLate: true, maxLateMs: 60 },
      { t: 0, deck: 'A', op: 'volume', value: 0, duration: 0 },
      { t: 0, deck: 'B', op: 'filter', type: 'none', value: 0, duration: 0 },
      { t: 0, deck: 'B', op: 'volume', value: 1, duration: 0 },
      { t: 0, deck: 'B', op: 'bass', value: 1, duration: 0 },
      { t: handoffAt, deck: 'B', op: 'handoff' },
    ],
    { audibleStart: teaserAt, preRollDuration: 0 },
  );
  candidate.fallbackTimeline = fallbackTimeline;
  candidate.fallbackRecipe = 'bass-eq-handoff';
  return candidate;
}

function musicalAssessment(fromProfile, toProfile) {
  const first = fromProfile && fromProfile.musicalProfile;
  const second = toProfile && toProfile.musicalProfile;
  const musicalEvidence = !!(
    first && second
    && toNumber(first.confidence) >= 0.55
    && toNumber(second.confidence) >= 0.55
    && toNumber(first.noteCount) >= 12
    && toNumber(second.noteCount) >= 12
  );
  const comparison = musicalEvidence ? compareMusicalProfiles(first, second) : {};
  return {
    musicalEvidence,
    musicalCompatibility: musicalEvidence ? toNumber(comparison.score) : 0,
    harmonicSimilarity: musicalEvidence ? toNumber(comparison.harmonicSimilarity) : 0,
    keyCompatibility: musicalEvidence ? toNumber(comparison.keyCompatibility) : 0,
    melodySimilarity: musicalEvidence ? toNumber(comparison.melodySimilarity) : 0,
    musicalRisks: musicalEvidence && Array.isArray(comparison.risks) ? comparison.risks : [],
  };
}

function safetyAssessment(fromProfile, toProfile, sectionChoice = {}, routePolicy = {}) {
  const entry = sectionChoice.entry || {};
  const exit = sectionChoice.exit || {};
  const exitCandidate = nearestCandidate(fromProfile || {}, 'exit', toNumber(exit.time));
  const entrySource = String(entry.source || 'fallback');
  const entryConfidence = clamp(entry.confidence);
  const entryTrusted = entrySource !== 'fallback' && entryConfidence >= 0.6;
  const exitType = String(exit.type || (exitCandidate && exitCandidate.type) || '');
  const exitSource = String(exit.source || (exitCandidate && exitCandidate.source) || '');
  const exitConfidence = clamp(exit.confidence ?? (exitCandidate && exitCandidate.confidence));
  const exitTrusted = exitConfidence >= 0.72;
  const sourceDuration = Math.max(0, toNumber(fromProfile && fromProfile.duration));
  const sourceRunway = Math.max(0, sourceDuration - toNumber(exit.time, toNumber(exitCandidate && exitCandidate.time)));
  const tempo = tempoFamilyAssessment(fromProfile && fromProfile.bpm, toProfile && toProfile.bpm);
  const { bpmA, bpmB, relativeTempoDelta } = tempo;
  const fromGridQuality = fromProfile && fromProfile.gridQuality || {};
  const toGridQuality = toProfile && toProfile.gridQuality || {};
  const fromDownbeatConfidence = toNumber(fromGridQuality.downbeatConfidence,
    average((fromProfile && fromProfile.downbeats || []).map((beat) => toNumber(beat.confidence, NaN))));
  const toDownbeatConfidence = toNumber(toGridQuality.downbeatConfidence,
    average((toProfile && toProfile.downbeats || []).map((beat) => toNumber(beat.confidence, NaN))));
  const fromBarStability = toNumber(fromGridQuality.beatStability,
    average((fromProfile && fromProfile.bars || []).map((bar) => toNumber(bar.beatStability, NaN))));
  const toBarStability = toNumber(toGridQuality.beatStability,
    average((toProfile && toProfile.bars || []).map((bar) => toNumber(bar.beatStability, NaN))));
  const fromDownbeatCount = toNumber(fromGridQuality.downbeatCount, (fromProfile && fromProfile.downbeats || []).length);
  const toDownbeatCount = toNumber(toGridQuality.downbeatCount, (toProfile && toProfile.downbeats || []).length);
  const fromTimingStability = toNumber(fromGridQuality.timingStability, 1);
  const toTimingStability = toNumber(toGridQuality.timingStability, 1);
  const beatGridTrusted = !!(
    fromProfile && toProfile
    && toNumber(fromProfile.gridStep) > 0
    && toNumber(toProfile.gridStep) > 0
    && fromDownbeatCount >= 4
    && toDownbeatCount >= 4
    && fromDownbeatConfidence >= 0.65
    && toDownbeatConfidence >= 0.65
    && fromBarStability >= 0.35
    && toBarStability >= 0.35
    && fromTimingStability >= 0.85
    && toTimingStability >= 0.85
  );
  let overlapClass = 'short';
  if (entryTrusted && beatGridTrusted && relativeTempoDelta <= 0.08) overlapClass = 'long';
  else if (entryTrusted && relativeTempoDelta <= 0.15) overlapClass = 'medium';
  const route = String(routePolicy.route || '');
  if (route === 'late-contrast-rise' || route === 'terminal-rescue') overlapClass = 'short';
  else if (route === 'late-contrast-release' && overlapClass === 'long') overlapClass = 'medium';
  const overlapDuration = overlapClass === 'long' ? 10.5 : (overlapClass === 'medium' ? 5.6 : 3.4);
  return {
    entrySource,
    entryConfidence: round(entryConfidence),
    entryTrusted,
    exitType,
    exitSource,
    exitConfidence: round(exitConfidence),
    exitTrusted,
    sourceRunway: round(sourceRunway),
    bpmA: round(bpmA),
    bpmB: round(bpmB),
    relativeTempoDelta: round(relativeTempoDelta),
    normalizedBpmB: tempo.normalizedBpmB,
    tempoScale: tempo.tempoScale,
    tempoFamilyDelta: tempo.tempoFamilyDelta,
    passiveTempoDelta: tempo.passiveTempoDelta,
    targetPlaybackRate: tempo.targetPlaybackRate,
    tempoLockAvailable: tempo.tempoLockAvailable,
    beatGridTrusted,
    overlapClass,
    overlapDuration,
    ...musicalAssessment(fromProfile, toProfile),
  };
}

function buildSafetyTimelineForAnchors({ bLandingAt, overlapClass, overlapDuration }) {
  const duration = toNumber(overlapDuration, overlapClass === 'long' ? 10.5 : (overlapClass === 'medium' ? 5.6 : 3.4));
  const handoffAt = overlapClass === 'long' ? 1 : 0.6;
  const playAt = round(handoffAt - duration);
  const requestedLanding = toNumber(bLandingAt);
  const bStart = Math.max(0, round(requestedLanding - duration));
  const actualLanding = round(bStart + (handoffAt - playAt));
  const landingError = round(actualLanding - requestedLanding);
  const runwayAvailable = Math.abs(landingError) <= LANDING_TOLERANCE_SEC;
  if (overlapClass === 'short') {
    return {
      lead: round(-playAt),
      bStart,
      runwayAvailable,
      landingError,
      timeline: [
        { t: playAt, deck: 'B', op: 'play', at: bStart, volume: 0 },
        { t: playAt, deck: 'B', op: 'bass', value: 0.15, duration: 0 },
        { t: playAt, deck: 'B', op: 'volume', value: 1, duration: Math.round(duration * 1000), curve: 'equal-power-in' },
        { t: -1.6, deck: 'A', op: 'bass', value: 0.5, duration: 700 },
        { t: playAt, deck: 'A', op: 'volume', value: 0, duration: Math.round(duration * 1000), curve: 'equal-power-out' },
        { t: -0.8, deck: 'B', op: 'bass', value: 0.85, duration: 700 },
        { t: 0, deck: 'B', op: 'bass', value: 1, duration: 300 },
        { t: handoffAt, deck: 'B', op: 'handoff' },
      ],
    };
  }
  if (overlapClass === 'medium') {
    return {
      lead: round(-playAt),
      bStart,
      runwayAvailable,
      landingError,
      timeline: [
        { t: playAt, deck: 'B', op: 'play', at: bStart, volume: 0 },
        { t: playAt, deck: 'B', op: 'bass', value: 0.12, duration: 0 },
        { t: playAt, deck: 'B', op: 'filter', type: 'highpass', value: 850, duration: 0 },
        { t: playAt + 0.2, deck: 'B', op: 'volume', value: 1, duration: Math.round((duration - 0.2) * 1000), curve: 'equal-power-in' },
        { t: -1.8, deck: 'A', op: 'bass', value: 0.3, duration: 1000 },
        { t: -1.2, deck: 'B', op: 'filter', type: 'none', value: 0, duration: 1000 },
        { t: playAt + 0.2, deck: 'A', op: 'volume', value: 0, duration: Math.round((duration - 0.2) * 1000), curve: 'equal-power-out' },
        { t: -0.8, deck: 'B', op: 'bass', value: 1, duration: 900 },
        { t: handoffAt, deck: 'B', op: 'handoff' },
      ],
    };
  }
  return {
    lead: round(-playAt),
    bStart,
    runwayAvailable,
    landingError,
    timeline: [
      { t: playAt, deck: 'B', op: 'play', at: bStart, volume: 0 },
      { t: playAt, deck: 'B', op: 'bass', value: 0.08, duration: 0 },
      { t: playAt, deck: 'B', op: 'filter', type: 'highpass', value: 1100, duration: 0 },
      { t: playAt + 1, deck: 'B', op: 'volume', value: 1, duration: Math.round((duration - 1) * 1000), curve: 'equal-power-in' },
      { t: -2, deck: 'A', op: 'filter', type: 'highpass', value: 160, duration: 1600 },
      { t: -1.8, deck: 'A', op: 'bass', value: 0.24, duration: 1200 },
      { t: -1.2, deck: 'B', op: 'filter', type: 'none', value: 0, duration: 1100 },
      { t: playAt + 1, deck: 'A', op: 'volume', value: 0, duration: Math.round((duration - 1) * 1000), curve: 'equal-power-out' },
      { t: -0.8, deck: 'B', op: 'bass', value: 1, duration: 900 },
      { t: handoffAt, deck: 'B', op: 'handoff' },
    ],
  };
}

function makeSafetyLongBlend(anchors, scores, sectionChoice = {}, fromProfile = {}, toProfile = {}, routePolicy = {}) {
  const assessment = safetyAssessment(fromProfile, toProfile, sectionChoice, routePolicy);
  const execution = buildSafetyTimelineForAnchors({
    bLandingAt: anchors.bAnchor,
    overlapClass: assessment.overlapClass,
    overlapDuration: assessment.overlapDuration,
  });
  const lead = execution.lead;
  const bStart = execution.bStart;
  const score = 0.48
    + scores.bpmScore * 0.08
    + scores.beatScore * 0.05
    + scores.outroCompleteness * 0.08
    - scores.bIntroAggression * 0.04
    - scores.styleTextureDistance * 0.03;
  const tier = sectionChoice.evaluation && sectionChoice.evaluation.tier || '';
  const risks = ['safety fallback'];
  if (tier === 'reject') risks.push('masked rejected pair');
  if (scores.bassScore < 0.5) risks.push('bass protected');
  if (scores.bIntroAggression > 0.68) risks.push('intro aggression masked');
  if (scores.styleTextureDistance > 0.45) risks.push('texture distance masked');
  if (!execution.runwayAvailable) risks.push('insufficient B runway');
  return baseCandidate(
    'safety-long-blend',
    score,
    0.72,
    [
      'universal conservative blend for weak or rejected pairs',
      'B enters from intro or low-density start instead of hook',
      'low end is delayed to avoid bass collision',
    ],
    risks,
    {
      ...anchors,
      ...assessment,
      bStart,
      lead,
      runwayAvailable: execution.runwayAvailable,
      landingError: execution.landingError,
      safetyFallback: true,
    },
    execution.timeline,
    { runwayAvailable: execution.runwayAvailable, landingError: execution.landingError },
  );
}

function chosenOverlapDiagnostics(candidate, fallback) {
  const timeline = candidate && Array.isArray(candidate.timeline) ? candidate.timeline : [];
  const handoffs = timeline.filter((action) => action && action.op === 'handoff');
  const handoff = handoffs[handoffs.length - 1];
  const plays = timeline.filter((action) => (
    action && action.deck === 'B' && action.op === 'play'
    && (!handoff || toNumber(action.t) <= toNumber(handoff.t))
  ));
  const play = plays[plays.length - 1];
  const duration = play && handoff ? round(toNumber(handoff.t) - toNumber(play.t)) : 0;
  if (!(duration > 0)) return fallback;
  return {
    overlapClass: duration <= 4 ? 'short' : (duration <= 7 ? 'medium' : 'long'),
    overlapDuration: duration,
  };
}

function recipeEligibility(candidate, context) {
  const { assessment, route, scores, severeOverlapRisk, sectionTier } = context;
  if (!candidate.window.runwayAvailable) return { eligible: false, reason: 'insufficient B runway', preference: 0 };
  if (route === 'clean-boundary-handoff' && candidate.recipe !== 'clean-boundary-handoff') {
    return { eligible: false, reason: 'clean route forbids foreground overlap', preference: 0 };
  }
  if (candidate.recipe === 'clean-boundary-handoff') {
    if (route !== 'clean-boundary-handoff') return { eligible: false, reason: 'clean route is not selected', preference: 0 };
    const cleanStructureBoundary = assessment.exitSource === 'structure'
      && assessment.exitConfidence >= 0.55
      && ['cadence-boundary', 'post-hook-boundary', 'phrase-boundary', 'vocal-end-boundary', 'release', 'outro', 'natural-tail']
        .includes(String(assessment.exitType).toLowerCase());
    if (!assessment.entryTrusted || !(assessment.exitTrusted || cleanStructureBoundary)) {
      return { eligible: false, reason: 'entry or exit evidence is not trusted', preference: 0 };
    }
    return { eligible: true, reason: '', preference: 0.5 };
  }
  if (candidate.recipe === 'safety-long-blend') return { eligible: false, reason: 'fallback only', preference: 0 };
  if (candidate.recipe === 'intro-outro-long-blend') {
    if (route && route !== 'structure-mix') return { eligible: false, reason: 'route requires shorter overlap', preference: 0 };
    if (!assessment.entryTrusted) return { eligible: false, reason: 'entry evidence is not trusted', preference: 0 };
    if (!assessment.beatGridTrusted) return { eligible: false, reason: 'beat grid is not trusted', preference: 0 };
    if (assessment.relativeTempoDelta > 0.08) return { eligible: false, reason: 'tempo delta exceeds long blend limit', preference: 0 };
    if (assessment.overlapClass !== 'long') return { eligible: false, reason: 'long overlap is not available', preference: 0 };
    return { eligible: true, reason: '', preference: 0.12 };
  }
  if (candidate.recipe === 'bass-eq-handoff') {
    if (route === 'late-contrast-rise' || route === 'terminal-rescue') return { eligible: false, reason: 'route requires a short protected handoff', preference: 0 };
    if (!assessment.entryTrusted) return { eligible: false, reason: 'entry evidence is not trusted', preference: 0 };
    if (!assessment.beatGridTrusted) return { eligible: false, reason: 'beat grid is not trusted', preference: 0 };
    if (assessment.relativeTempoDelta > 0.12) return { eligible: false, reason: 'tempo delta exceeds bass handoff limit', preference: 0 };
    if (assessment.overlapClass === 'short') return { eligible: false, reason: 'bass handoff needs medium runway', preference: 0 };
    return { eligible: true, reason: '', preference: route === 'late-contrast-release' ? 0.28 : 0.18 };
  }
  if (candidate.recipe === 'spectral-emergence') {
    if (route !== 'structure-mix') return { eligible: false, reason: 'route does not support a staged spectrum reveal', preference: 0 };
    if (!assessment.entryTrusted || !assessment.exitTrusted) return { eligible: false, reason: 'entry or exit evidence is not trusted', preference: 0 };
    if (!['release', 'phrase-boundary', 'outro', 'natural-tail'].includes(assessment.exitType)) return { eligible: false, reason: 'exit is not a spectrum-safe release', preference: 0 };
    if (!assessment.beatGridTrusted || assessment.tempoFamilyDelta > 0.06 || !assessment.tempoLockAvailable) return { eligible: false, reason: 'beat or tempo evidence is unsafe', preference: 0 };
    if (!assessment.musicalEvidence || assessment.musicalCompatibility < 0.68 || assessment.keyCompatibility < 0.58) return { eligible: false, reason: 'musical commonality is not strong enough', preference: 0 };
    if (scores.aBass > 0.5 || scores.bBass < 0.25) return { eligible: false, reason: 'low-first reveal would cause weak or stacked bass', preference: 0 };
    if (severeOverlapRisk) return { eligible: false, reason: 'vocal or style overlap is unsafe', preference: 0 };
    return { eligible: true, reason: '', preference: 0.4 };
  }
  if (candidate.recipe === 'filtered-pickup') {
    if (!assessment.entryTrusted) return { eligible: false, reason: 'entry evidence is not trusted', preference: 0 };
    if (route === 'terminal-rescue' || route === 'late-contrast-release') return { eligible: false, reason: 'route does not support an energy pickup', preference: 0 };
    if (!assessment.beatGridTrusted) return { eligible: false, reason: 'beat grid is not trusted', preference: 0 };
    if (assessment.relativeTempoDelta > 0.1) return { eligible: false, reason: 'tempo delta exceeds filtered pickup limit', preference: 0 };
    const rising = route === 'late-contrast-rise' || scores.bEnergy > scores.aEnergy + 0.08 || scores.bIntroAggression >= 0.58;
    if (!rising) return { eligible: false, reason: 'no controlled energy rise', preference: 0 };
    return { eligible: true, reason: '', preference: route === 'late-contrast-rise' ? 0.35 : 0.08 };
  }
  if (candidate.recipe === 'echo-out') {
    const lateRoute = route === 'late-contrast-rise' || route === 'late-contrast-release' || route === 'terminal-rescue';
    if (!lateRoute && !severeOverlapRisk) return { eligible: false, reason: 'echo is reserved for difficult transitions', preference: 0 };
    return {
      eligible: true,
      reason: '',
      preference: severeOverlapRisk ? 0.7 : (route === 'late-contrast-release' ? 0.22 : 0.08),
    };
  }
  if (candidate.recipe === 'source-loop-roll') {
    if (route !== 'structure-mix' && route !== 'late-contrast-release') return { eligible: false, reason: 'route does not support a loop roll', preference: 0 };
    if (!assessment.entryTrusted || !assessment.exitTrusted) return { eligible: false, reason: 'entry or exit evidence is not trusted', preference: 0 };
    if (!['release', 'phrase-boundary', 'outro', 'natural-tail'].includes(assessment.exitType)) return { eligible: false, reason: 'exit is not a loop-safe phrase', preference: 0 };
    if (!assessment.beatGridTrusted) return { eligible: false, reason: 'beat grid is not trusted', preference: 0 };
    if (assessment.relativeTempoDelta > 0.08) return { eligible: false, reason: 'tempo delta exceeds loop roll limit', preference: 0 };
    if (assessment.sourceRunway < 2) return { eligible: false, reason: 'source runway is too short for loop release', preference: 0 };
    if (severeOverlapRisk) return { eligible: false, reason: 'vocal or style overlap is unsafe', preference: 0 };
    return { eligible: true, reason: '', preference: 0.16 };
  }
  if (candidate.recipe === 'hook-teaser') {
    if (route !== 'structure-mix') return { eligible: false, reason: 'route does not support a hook teaser', preference: 0 };
    if (!assessment.entryTrusted || !['hook', 'chorus', 'drop'].includes(String(context.entryType))) return { eligible: false, reason: 'landing is not a trusted climax', preference: 0 };
    if (!assessment.musicalEvidence || assessment.musicalCompatibility < 0.72 || assessment.melodySimilarity < 0.55) return { eligible: false, reason: 'musical evidence is not compatible enough', preference: 0 };
    if (!assessment.beatGridTrusted || assessment.relativeTempoDelta > 0.1) return { eligible: false, reason: 'beat or tempo evidence is unsafe', preference: 0 };
    if (severeOverlapRisk) return { eligible: false, reason: 'vocal or style overlap is unsafe', preference: 0 };
    return { eligible: true, reason: '', preference: 0.18 };
  }
  if (candidate.recipe === 'harmonic-double-drop') {
    if (route !== 'structure-mix' || sectionTier !== 'magic') return { eligible: false, reason: 'double drop requires a magic structure route', preference: 0 };
    if (!assessment.entryTrusted || !['hook', 'chorus', 'drop'].includes(String(context.entryType))) return { eligible: false, reason: 'landing is not a trusted climax', preference: 0 };
    if (!assessment.musicalEvidence || assessment.musicalCompatibility < 0.78 || assessment.keyCompatibility < 0.72) return { eligible: false, reason: 'harmonic match is not tight enough', preference: 0 };
    if (!assessment.beatGridTrusted || assessment.relativeTempoDelta > 0.06 || scores.energyScore < 0.7) return { eligible: false, reason: 'beat, tempo, or energy match is unsafe', preference: 0 };
    if (severeOverlapRisk) return { eligible: false, reason: 'vocal or style overlap is unsafe', preference: 0 };
    return { eligible: true, reason: '', preference: 0.42 };
  }
  if (candidate.recipe === 'tease-roll-double-drop') {
    if (context.recentRecipes.includes(candidate.recipe)) return { eligible: false, reason: 'impact recipe cooldown', preference: 0 };
    if (route !== 'structure-mix') return { eligible: false, reason: 'route does not support the impact recipe', preference: 0 };
    if (context.sectionRisks.includes('directionality mismatch')) {
      return { eligible: false, reason: 'outgoing phrase direction is not loop-safe', preference: 0 };
    }
    if (assessment.entrySource === 'fallback' || context.entryConfidence < 0.78 || !['hook', 'chorus', 'drop'].includes(String(context.entryType))) {
      return { eligible: false, reason: 'landing is not a trusted climax', preference: 0 };
    }
    if (!assessment.exitTrusted) return { eligible: false, reason: 'entry or exit evidence is not trusted', preference: 0 };
    if (!['release', 'phrase-boundary', 'outro', 'natural-tail'].includes(assessment.exitType)) return { eligible: false, reason: 'exit is not a loop-safe phrase', preference: 0 };
    if (!assessment.beatGridTrusted || assessment.relativeTempoDelta > 0.06) return { eligible: false, reason: 'beat or tempo evidence is unsafe', preference: 0 };
    const musicalClash = assessment.musicalRisks.some((risk) => (
      risk === 'harmonic-clash' || risk === 'melody-contour-contrast'
    ));
    if (!assessment.musicalEvidence || assessment.musicalCompatibility < 0.72 || musicalClash) {
      return { eligible: false, reason: 'musical evidence is not compatible enough', preference: 0 };
    }
    const fourBeatDuration = 240 / Math.max(assessment.bpmA, 1);
    const sourceExit = toNumber(candidate.anchors.aExit, NaN);
    const sourceStart = sourceExit - fourBeatDuration;
    if (!Number.isFinite(sourceStart) || sourceStart < 0 || sourceExit > context.sourceDuration) {
      return { eligible: false, reason: 'source runway is too short for four beats', preference: 0 };
    }
    if (severeOverlapRisk) return { eligible: false, reason: 'vocal or style overlap is unsafe', preference: 0 };
    return { eligible: true, reason: '', preference: 0.56 };
  }
  if (candidate.recipe === 'quick-safe-fade') return { eligible: true, reason: '', preference: 0.04 };
  return { eligible: false, reason: 'unsupported recipe', preference: 0 };
}

function planRecipeCandidates(fromProfile, toProfile, opts = {}) {
  const anchors = pickAnchors(fromProfile || {}, toProfile || {}, opts);
  const scores = commonScores(fromProfile || {}, toProfile || {}, anchors);
  const sectionTier = opts.sectionChoice && opts.sectionChoice.evaluation && opts.sectionChoice.evaluation.tier || '';
  const sectionRisks = opts.sectionChoice && opts.sectionChoice.evaluation && opts.sectionChoice.evaluation.risks || [];
  const needsSafetyFallback = sectionTier === 'weak'
    || sectionTier === 'reject'
    || sectionRisks.includes('directionality mismatch')
    || sectionRisks.includes('style bridge mismatch');
  const routePolicy = opts.routePolicy || {};
  const route = String(routePolicy.route || '');
  const safety = makeSafetyLongBlend(anchors, scores, opts.sectionChoice, fromProfile, toProfile, routePolicy);
  const assessment = safetyAssessment(fromProfile, toProfile, opts.sectionChoice, routePolicy);
  const severeOverlapRisk = sectionRisks.some((risk) => (
    risk === 'style bridge mismatch'
    || risk === 'vocal collision'
    || risk === 'vocal overlap'
  ));
  const candidates = [
    safety,
    route === 'clean-boundary-handoff'
      ? makeCleanBoundaryHandoff(anchors, scores, opts.sectionChoice)
      : null,
    makeLongBlend(anchors, scores),
    makeFilteredPickup(anchors, scores, route, assessment),
    makeBassHandoff(anchors, scores, assessment),
    makeSpectralEmergence(anchors, scores, assessment),
    makeQuickFade(anchors, scores),
    makeEchoOut(anchors, scores, assessment),
    makeSourceLoopRoll(anchors, scores, assessment),
    makeHookTeaser(anchors, scores, assessment),
    makeHarmonicDoubleDrop(anchors, scores, assessment),
    makeTeaseRollDoubleDrop(anchors, scores, assessment),
  ].filter(Boolean).map((candidate) => ({
    ...candidate,
    anchors: { ...candidate.anchors, ...assessment },
  })).sort((a, b) => b.score - a.score || b.confidence - a.confidence);
  const evaluated = candidates.map((candidate) => ({
    candidate,
    eligibility: recipeEligibility(candidate, {
      assessment,
      route,
      scores,
      severeOverlapRisk,
      sectionTier,
      sectionRisks,
      entryType: opts.sectionChoice && opts.sectionChoice.entry && opts.sectionChoice.entry.type,
      entryConfidence: assessment.entryConfidence,
      recentRecipes: Array.isArray(opts.recentRecipes) ? opts.recentRecipes : [],
      sourceDuration: Math.max(0, toNumber(fromProfile && fromProfile.duration)),
    }),
  }));
  const candidatesWithEligibility = evaluated.map((item) => ({
    ...item.candidate,
    eligible: item.eligibility.eligible,
    eligibilityReason: item.eligibility.reason,
    selectionScore: round(item.candidate.score + item.eligibility.preference),
  }));
  const eligible = candidatesWithEligibility
    .filter((candidate) => candidate.eligible)
    .sort((a, b) => (
      b.selectionScore - a.selectionScore
      || b.confidence - a.confidence
    ));
  const safetyCandidate = candidatesWithEligibility.find((candidate) => candidate.recipe === 'safety-long-blend') || safety;
  const preserveUnroutedSafety = route === '' && (needsSafetyFallback || !assessment.entryTrusted);
  const chosen = preserveUnroutedSafety
    ? safetyCandidate
    : (eligible[0] || safetyCandidate);
  const chosenOverlap = chosenOverlapDiagnostics(chosen, {
    overlapClass: safety.anchors.overlapClass,
    overlapDuration: safety.anchors.overlapDuration,
  });

  return {
    chosen,
    candidates: candidatesWithEligibility,
    diagnostics: {
      aEnergy: round(scores.aEnergy),
      bEnergy: round(scores.bEnergy),
      aBass: round(scores.aBass),
      bBass: round(scores.bBass),
      beatScore: round(scores.beatScore),
      aDownbeatOffset: Number.isFinite(safety.anchors.aDownbeatOffset)
        ? round(safety.anchors.aDownbeatOffset)
        : null,
      bDownbeatOffset: Number.isFinite(safety.anchors.bDownbeatOffset)
        ? round(safety.anchors.bDownbeatOffset)
        : null,
      downbeatOffset: Number.isFinite(safety.anchors.downbeatOffset)
        ? round(safety.anchors.downbeatOffset)
        : null,
      energyScore: round(scores.energyScore),
      bassScore: round(scores.bassScore),
      bpmScore: round(scores.bpmScore),
      outroCompleteness: round(scores.outroCompleteness),
      bIntroAggression: round(scores.bIntroAggression),
      styleTextureDistance: round(scores.styleTextureDistance),
      entrySource: safety.anchors.entrySource,
      entryConfidence: safety.anchors.entryConfidence,
      entryTrusted: safety.anchors.entryTrusted,
      exitType: assessment.exitType,
      exitConfidence: assessment.exitConfidence,
      exitTrusted: assessment.exitTrusted,
      sourceRunway: assessment.sourceRunway,
      bpmA: safety.anchors.bpmA,
      bpmB: safety.anchors.bpmB,
      relativeTempoDelta: safety.anchors.relativeTempoDelta,
      normalizedBpmB: safety.anchors.normalizedBpmB,
      tempoScale: safety.anchors.tempoScale,
      tempoFamilyDelta: safety.anchors.tempoFamilyDelta,
      passiveTempoDelta: safety.anchors.passiveTempoDelta,
      targetPlaybackRate: safety.anchors.targetPlaybackRate,
      tempoLockAvailable: safety.anchors.tempoLockAvailable,
      beatGridTrusted: safety.anchors.beatGridTrusted,
      musicalEvidence: assessment.musicalEvidence,
      musicalCompatibility: round(assessment.musicalCompatibility),
      harmonicSimilarity: round(assessment.harmonicSimilarity),
      keyCompatibility: round(assessment.keyCompatibility),
      melodySimilarity: round(assessment.melodySimilarity),
      overlapClass: chosenOverlap.overlapClass,
      overlapDuration: chosenOverlap.overlapDuration,
      runwayAvailable: chosen.window.runwayAvailable,
      landingError: chosen.window.landingError,
      eligibleRecipes: eligible.map((candidate) => candidate.recipe),
      rejectedRecipes: candidatesWithEligibility
        .filter((candidate) => !candidate.eligible)
        .map((candidate) => ({ recipe: candidate.recipe, reason: candidate.eligibilityReason })),
    },
  };
}

module.exports = {
  buildSafetyTimelineForAnchors,
  measureTimelineWindow,
  planRecipeCandidates,
};
