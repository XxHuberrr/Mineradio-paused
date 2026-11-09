function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function firstFinite(...values) {
  for (const value of values) {
    const number = finiteOrNull(value);
    if (number !== null) return number;
  }
  return null;
}

function barTime(bar) {
  return firstFinite(bar && bar.start, bar && bar.time);
}

function nearestBar(profile, target) {
  const time = finiteOrNull(target);
  const bars = Array.isArray(profile && profile.bars)
    ? profile.bars.filter((bar) => barTime(bar) !== null)
    : [];
  if (time === null || !bars.length) return null;

  return bars.reduce((nearest, bar) => {
    if (!nearest) return bar;
    const distance = Math.abs(barTime(bar) - time);
    const nearestDistance = Math.abs(barTime(nearest) - time);
    return distance < nearestDistance ? bar : nearest;
  }, null);
}

function chooseExit(exits) {
  return exits.reduce((best, exit) => {
    if (exit && exit.source === 'fallback') return best;
    const time = finiteOrNull(exit && exit.time);
    if (time === null) return best;
    const type = String(exit.type || '').toLowerCase();
    const confidence = firstFinite(exit.confidence) ?? 0;
    const latePenalty = firstFinite(exit.latePenalty) ?? 0;
    const sourceScore = exit.source === 'fallback' ? 0 : 100;
    const score = sourceScore + (type === 'release' ? 10 : 0) + confidence - latePenalty;
    if (!best || score > best.score) return { value: exit, time, score };
    return best;
  }, null);
}

function chooseEntry(entries) {
  return entries.reduce((best, entry) => {
    if (entry && entry.source === 'fallback') return best;
    const time = firstFinite(entry && entry.landingAt, entry && entry.time);
    if (time === null) return best;
    const confidence = firstFinite(entry.confidence) ?? 0;
    const sourceScore = entry.source === 'fallback' ? 0 : 100;
    const score = sourceScore + confidence;
    if (!best || score > best.score) return { value: entry, time, score };
    return best;
  }, null);
}

function preferredExitRange(baseMin, baseMax, protectedRatio) {
  const lower = Math.max(baseMin, protectedRatio);
  return [lower, Math.max(baseMax, lower)];
}

function terminalPolicy(protectedRatio, reasons, metrics) {
  return {
    route: 'terminal-rescue',
    compatibilityClass: 'uncertain',
    contrastDirection: 'unknown',
    preferredExitRange: preferredExitRange(0.88, 0.96, protectedRatio),
    entryPolicy: 'start-or-downbeat',
    overlapClass: 'short',
    recipe: 'terminal-rescue',
    reasons: reasons.slice(0, 4),
    metrics,
  };
}

function classifyTransitionRoute(opts = {}) {
  const fromProfile = opts.fromProfile || {};
  const toProfile = opts.toProfile || {};
  const exits = Array.isArray(opts.exits) ? opts.exits : [];
  const entries = Array.isArray(opts.entries) ? opts.entries : [];
  const risks = Array.isArray(opts.risks) ? opts.risks : [];
  const directionalityMismatch = risks.includes('directionality mismatch') ? 1 : 0;
  const styleBridgeMismatch = risks.includes('style bridge mismatch');
  const durationA = finiteOrNull(fromProfile.duration);
  const durationB = finiteOrNull(toProfile.duration);
  const bpmA = finiteOrNull(fromProfile.bpm);
  const bpmB = finiteOrNull(toProfile.bpm);
  const tempoKnown = bpmA !== null && bpmB !== null && bpmA > 0 && bpmB > 0 ? 1 : 0;
  const tempoDelta = tempoKnown ? Math.abs(bpmA - bpmB) / Math.max(bpmA, bpmB) : 1;
  const protectedRatio = clamp(
    (finiteOrNull(opts.protectedUntil) ?? 0) / Math.max(1, durationA ?? 0),
    0,
    1,
  );
  const baseMetrics = {
    fromSnap: 0,
    toSnap: 0,
    snapDelta: 0,
    energyDelta: 0,
    tempoDelta,
    tempoKnown,
    directionalityMismatch,
  };

  if (durationA === null || durationA <= 0 || durationB === null || durationB <= 0) {
    return terminalPolicy(protectedRatio, ['invalid-duration'], baseMetrics);
  }
  if (!tempoKnown) {
    return terminalPolicy(protectedRatio, ['invalid-bpm'], baseMetrics);
  }

  const exit = chooseExit(exits);
  const entry = chooseEntry(entries);
  if (!exit || !entry) {
    return terminalPolicy(protectedRatio, ['missing-structure'], baseMetrics);
  }

  const fromBar = nearestBar(fromProfile, exit.time);
  const toBar = nearestBar(toProfile, entry.time);
  const fromSnap = firstFinite(fromBar && fromBar.snapDensity, fromBar && fromBar.snap);
  const toSnap = firstFinite(toBar && toBar.snapDensity, toBar && toBar.snap);
  const fromEnergy = finiteOrNull(fromBar && fromBar.energy);
  const toEnergy = finiteOrNull(toBar && toBar.energy);
  if (fromBar === null || toBar === null || fromSnap === null || toSnap === null || fromEnergy === null || toEnergy === null) {
    return terminalPolicy(protectedRatio, ['missing-analysis'], baseMetrics);
  }

  const snapDelta = toSnap - fromSnap;
  const energyDelta = toEnergy - fromEnergy;
  const metrics = {
    fromSnap,
    toSnap,
    snapDelta,
    energyDelta,
    tempoDelta,
    tempoKnown,
    directionalityMismatch,
  };
  const reasons = directionalityMismatch ? ['directionality-mismatch'] : [];
  if (styleBridgeMismatch && tempoDelta >= 0.18) {
    return terminalPolicy(protectedRatio, reasons.concat('style-bridge-mismatch'), metrics);
  }

  const urgentRise = toSnap >= 0.42 && snapDelta >= 0.18;
  const urgentRelease = fromSnap >= 0.42 && snapDelta <= -0.18;
  const secondaryRise = energyDelta >= 0.25
    && tempoDelta >= 0.08
    && (directionalityMismatch === 1 || snapDelta > 0);
  const secondaryRelease = energyDelta <= -0.25
    && tempoDelta >= 0.08
    && (directionalityMismatch === 1 || snapDelta < 0);

  if (urgentRise || secondaryRise) {
    return {
      route: 'late-contrast-rise',
      compatibilityClass: 'contrast',
      contrastDirection: 'rising',
      preferredExitRange: preferredExitRange(0.75, 0.9, protectedRatio),
      entryPolicy: 'filtered-runway',
      overlapClass: 'short',
      recipe: 'late-contrast-rise',
      reasons: reasons.concat(urgentRise ? ['snap-rise'] : ['energy-tempo-rise']).slice(0, 4),
      metrics,
    };
  }

  if (urgentRelease || secondaryRelease) {
    return {
      route: 'late-contrast-release',
      compatibilityClass: 'contrast',
      contrastDirection: 'falling',
      preferredExitRange: preferredExitRange(0.72, 0.9, protectedRatio),
      entryPolicy: 'quiet-runway',
      overlapClass: 'short-or-medium',
      recipe: 'late-contrast-release',
      reasons: reasons.concat(urgentRelease ? ['snap-release'] : ['energy-tempo-release']).slice(0, 4),
      metrics,
    };
  }

  if (opts.enableCleanBoundary === true && !(opts.overlapEvidence && opts.overlapEvidence.safe === true)) {
    return {
      route: 'clean-boundary-handoff',
      compatibilityClass: 'conservative',
      contrastDirection: 'balanced',
      preferredExitRange: preferredExitRange(0.32, 0.78, protectedRatio),
      entryPolicy: 'natural-boundary',
      overlapClass: 'none',
      recipe: 'clean-boundary-handoff',
      reasons: reasons.concat('overlap-evidence-absent').slice(0, 4),
      metrics,
    };
  }

  return {
    route: 'structure-mix',
    compatibilityClass: 'compatible',
    contrastDirection: 'balanced',
    preferredExitRange: preferredExitRange(0.32, 0.78, protectedRatio),
    entryPolicy: 'best-supported',
    overlapClass: 'adaptive',
    recipe: 'structure-window',
    reasons,
    metrics,
  };
}

module.exports = { classifyTransitionRoute };

