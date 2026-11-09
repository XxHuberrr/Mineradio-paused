const { round, toNumber } = require('./cue-profile');

const TRUSTED_CLIMAX_TYPES = new Set(['hook', 'drop']);

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, toNumber(value)));
}

function profileOf(analysis) {
  return analysis && analysis.cueProfile || {};
}

function structureOf(analysis) {
  return analysis && analysis.structureMap || {};
}

function usableGrid(analysis) {
  const profile = profileOf(analysis);
  const bpm = toNumber(profile.bpm);
  return bpm >= 40 && bpm <= 240
    && toNumber(profile.gridStep) > 0
    && Array.isArray(profile.downbeats)
    && profile.downbeats.length >= 4;
}

function climaxTime(candidate) {
  return toNumber(candidate && (candidate.start ?? candidate.time), NaN);
}

function trustedClimax(analysis) {
  const structure = structureOf(analysis);
  const candidates = (structure.sections || []).concat(structure.entryCandidates || []);
  return candidates
    .filter((candidate) => candidate
      && TRUSTED_CLIMAX_TYPES.has(String(candidate.type || candidate.landingType || '').toLowerCase())
      && toNumber(candidate.confidence) >= 0.72
      && Number.isFinite(climaxTime(candidate)))
    .sort((a, b) => {
      const typeDelta = (String(a.type).toLowerCase() === 'hook' ? 0 : 1) - (String(b.type).toLowerCase() === 'hook' ? 0 : 1);
      return typeDelta || toNumber(b.confidence) - toNumber(a.confidence) || climaxTime(a) - climaxTime(b);
    })[0] || null;
}

function routeOf(directPlan) {
  return String(directPlan && directPlan.policy && directPlan.policy.route || '');
}

function compatibilityOf(directPlan) {
  return String(directPlan && directPlan.policy && directPlan.policy.compatibilityClass || '');
}

function directScore(directPlan) {
  const evaluation = directPlan && directPlan.evaluation || {};
  const score = Number(evaluation.score ?? (directPlan && directPlan.score));
  return Number.isFinite(score) ? clamp(score) : 0;
}

function totalDurationForBars(bars, bpmFrom, bpmTo) {
  const averageBpm = Math.max(40, (bpmFrom + bpmTo) / 2);
  return round(bars * 4 * 60 / averageBpm);
}

function chooseBars(opts) {
  const { route, compatibility, available, bpmFrom, bpmTo } = opts;
  const durations = {
    4: totalDurationForBars(4, bpmFrom, bpmTo),
    8: totalDurationForBars(8, bpmFrom, bpmTo),
    16: totalDurationForBars(16, bpmFrom, bpmTo),
  };
  if (available < durations[4]) return 0;
  if (route === 'terminal-rescue') return 4;
  if (compatibility === 'contrast' && available >= durations[16]) return 16;
  if (available >= durations[8]) return 8;
  return 4;
}

function templateFor(directPlan, lyricLink) {
  const route = routeOf(directPlan);
  const direction = String(directPlan && directPlan.policy && directPlan.policy.contrastDirection || '');
  if (route === 'terminal-rescue') return 'echo-break';
  if (toNumber(lyricLink && lyricLink.score) >= 0.65) return 'loop-rise';
  if (direction === 'rising' || route.includes('rise')) return 'drum-build';
  return 'impact-drop';
}

function chooseExit(fromAnalysis, directPlan, stage1Duration) {
  const structure = structureOf(fromAnalysis);
  const protectedUntil = toNumber(structure.protectedUntil);
  const duration = toNumber(structure.duration, toNumber(profileOf(fromAnalysis).duration));
  const valid = (candidate) => Number.isFinite(toNumber(candidate && candidate.time, NaN))
    && toNumber(candidate.time) >= protectedUntil
    && duration - toNumber(candidate.time) >= Math.min(1.5, stage1Duration * 0.6);
  if (valid(directPlan && directPlan.exit)) return directPlan.exit;
  return (structure.exitCandidates || [])
    .filter(valid)
    .sort((a, b) => toNumber(a.time) - toNumber(b.time))[0] || null;
}

function predictedScore(directPlan, climax, lyricLink) {
  const contrast = compatibilityOf(directPlan) === 'contrast' ? 0.12 : 0;
  return round(clamp(
    0.52
    + toNumber(climax && climax.confidence) * 0.18
    + clamp(lyricLink && lyricLink.score) * 0.15
    + contrast
    + 0.05,
  ));
}

function buildTimeline(plan, fallbackTimeline) {
  const [stage1, stage2, stage3] = plan.stageDurations;
  const bStartT = round(stage1 + stage2);
  const bPlayAt = round(Math.max(0, plan.climax.time - stage3));
  const total = plan.totalDuration;
  const bridgePayload = {
    template: plan.template,
    bars: plan.bars,
    bpmFrom: plan.bpmFrom,
    bpmTo: plan.bpmTo,
    stageDurations: plan.stageDurations.slice(),
  };
  return [
    { t: 0, deck: 'A', op: 'bridge', duration: Math.round(total * 1000), bridge: bridgePayload },
    { t: 0, deck: 'A', op: 'bass', value: 0.18, duration: Math.round(stage1 * 800) },
    { t: 0, deck: 'A', op: 'filter', type: 'highpass', value: 1100, duration: Math.round(stage1 * 900) },
    { t: 0, deck: 'A', op: 'volume', value: 0, duration: Math.round(stage1 * 1000), curve: 'equal-power-out' },
    { t: bStartT, deck: 'B', op: 'play', at: bPlayAt, volume: 0 },
    { t: bStartT, deck: 'B', op: 'filter', type: 'highpass', value: 1200, duration: 0 },
    { t: bStartT, deck: 'B', op: 'bass', value: 0.2, duration: 0 },
    { t: bStartT, deck: 'B', op: 'volume', value: 1, duration: Math.round(stage3 * 1000), curve: 'equal-power-in' },
    { t: bStartT, deck: 'B', op: 'filter', type: 'none', value: 0, duration: Math.round(stage3 * 1000) },
    { t: bStartT, deck: 'B', op: 'bass', value: 1, duration: Math.round(stage3 * 1000) },
    { t: total, deck: 'B', op: 'handoff' },
  ].map((action) => ({ ...action, ...(action.op === 'bridge' ? { fallbackTimeline } : {}) }));
}

function planBridge(opts = {}) {
  const fromAnalysis = opts.fromAnalysis;
  const toAnalysis = opts.toAnalysis;
  const directPlan = opts.directPlan || {};
  if (!usableGrid(fromAnalysis) || !usableGrid(toAnalysis)) return null;
  const climax = trustedClimax(toAnalysis);
  if (!climax) return null;
  const fromProfile = profileOf(fromAnalysis);
  const toProfile = profileOf(toAnalysis);
  const bpmFrom = toNumber(fromProfile.bpm);
  const bpmTo = toNumber(toProfile.bpm);
  const fromStructure = structureOf(fromAnalysis);
  const fromDuration = toNumber(fromStructure.duration, toNumber(fromProfile.duration));
  const protectedUntil = toNumber(fromStructure.protectedUntil);
  const climaxAt = climaxTime(climax);
  const available = Math.max(0, fromDuration - protectedUntil) + Math.max(0, climaxAt);
  const route = routeOf(directPlan);
  const compatibility = compatibilityOf(directPlan);
  const bars = chooseBars({ route, compatibility, available, bpmFrom, bpmTo });
  if (!bars) return null;
  const totalDuration = totalDurationForBars(bars, bpmFrom, bpmTo);
  const stageDurations = [round(totalDuration * 0.25), round(totalDuration * 0.5), round(totalDuration * 0.25)];
  stageDurations[2] = round(totalDuration - stageDurations[0] - stageDurations[1]);
  if (climaxAt < stageDurations[2]) return null;
  const exit = chooseExit(fromAnalysis, directPlan, stageDurations[0]);
  if (!exit) return null;
  const lyricLink = opts.lyricLink || { score: 0, reasons: [] };
  const score = predictedScore(directPlan, climax, lyricLink);
  const improvement = round(score - directScore(directPlan));
  const strongLyric = toNumber(lyricLink.score) >= 0.65;
  const contrastRoute = compatibility === 'contrast' || route === 'terminal-rescue' || route.includes('contrast');
  if (improvement < 0.12 && !contrastRoute && !strongLyric) return null;
  const fallbackTimeline = Array.isArray(directPlan.timeline) ? directPlan.timeline.slice() : [];
  const plan = {
    template: templateFor(directPlan, lyricLink),
    bars,
    bpmFrom: round(bpmFrom, 2),
    bpmTo: round(bpmTo, 2),
    climax: {
      time: round(climaxAt),
      type: String(climax.type || climax.landingType || '').toLowerCase(),
      confidence: round(climax.confidence),
    },
    stageDurations,
    totalDuration,
    mixStart: round(exit.time),
    handoffAt: round(toNumber(exit.time) + totalDuration),
    predictedScore: score,
    improvement,
    lyricLinkScore: round(lyricLink.score),
    reasons: [
      contrastRoute ? 'contrast-route' : 'score-improvement',
      `trusted-${String(climax.type || climax.landingType || '').toLowerCase()}`,
      ...(strongLyric ? ['lyric-link'] : []),
    ],
    fallbackTimeline,
  };
  plan.timeline = buildTimeline(plan, fallbackTimeline);
  return plan;
}

module.exports = {
  planBridge,
  trustedClimax,
};

