function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const {
  evaluateTransitionPair,
  inferStyleCompatibility,
  isClosedOutgoingPhrase,
} = require('./transition-evaluator');

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value) * factor) / factor;
}

function beatEnergy(beat) {
  if (!beat) return 0;
  return Math.max(
    toNumber(beat.low),
    toNumber(beat.body),
    toNumber(beat.snap),
    toNumber(beat.impact),
    toNumber(beat.strength),
  );
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function windowBeats(beats, start, duration) {
  return beats.filter((beat) => beat.time >= start && beat.time < start + duration);
}

function windowStats(beats, start, duration) {
  const window = windowBeats(beats, start, duration);
  const energy = average(window.map(beatEnergy));
  return {
    energy: round(energy),
    lowDensity: round(average(window.map((beat) => toNumber(beat.low)))),
    vocalDensity: 0,
    beatStability: round(window.length ? window.filter((beat) => toNumber(beat.confidence, 0.8) >= 0.75).length / window.length : 0),
  };
}

function candidateMetric(beats, time) {
  const before = windowStats(beats, Math.max(0, time - 8), 8);
  const after = windowStats(beats, time, 8);
  return {
    energyBefore: before.energy,
    energyAfter: after.energy,
    vocalDensity: 0,
    lowDensity: after.lowDensity,
    beatStability: after.beatStability,
  };
}

function uniqueCandidates(candidates) {
  const out = [];
  candidates
    .filter((candidate) => Number.isFinite(candidate.time))
    .sort((a, b) => {
      const roleOrder = { exit: 0, entry: 1, 'avoid-exit': 2 };
      return (roleOrder[a.role] ?? 5) - (roleOrder[b.role] ?? 5)
        || b.confidence - a.confidence
        || a.time - b.time;
    })
    .forEach((candidate) => {
      const duplicate = out.find((item) => item.type === candidate.type && Math.abs(item.time - candidate.time) < 1.5);
      if (!duplicate) out.push(candidate);
    });
  return out;
}

function repeatedLyricGroups(lines) {
  const groups = new Map();
  (lines || []).forEach((line) => {
    if (!line.normalized || line.normalized.length < 4) return;
    if (!groups.has(line.normalized)) groups.set(line.normalized, []);
    groups.get(line.normalized).push(line);
  });
  return Array.from(groups.values()).filter((group) => group.length >= 2);
}

function addLyricCandidates(candidates, lines, beats) {
  repeatedLyricGroups(lines).forEach((group) => {
    group.forEach((line) => {
      const metrics = candidateMetric(beats, line.time);
      const type = metrics.energyAfter >= metrics.energyBefore ? 'chorus' : 'hook';
      candidates.push({
        type,
        role: 'entry',
        source: 'lyric',
        time: round(line.time),
        confidence: round(Math.min(0.95, 0.56 + group.length * 0.08 + Math.max(0, metrics.energyAfter - metrics.energyBefore) * 0.5)),
        text: line.text,
        repeats: group.length,
        ...metrics,
      });

      const before = (lines || []).filter((item) => item.time < line.time && item.time >= line.time - 10).at(-1);
      if (before) {
        candidates.push({
          type: 'pre-section',
          role: 'entry',
          source: 'lyric',
          time: round(before.time),
          confidence: round(Math.min(0.9, 0.5 + group.length * 0.07)),
          text: before.text,
          resolvesTo: {
            type,
            time: round(line.time),
            text: line.text,
          },
          ...candidateMetric(beats, before.time),
        });
      }
    });
  });

  const lastLyric = (lines || []).at(-1);
  if (lastLyric) {
    candidates.push({
      type: 'outro',
      role: 'exit',
      time: round(lastLyric.time),
      confidence: 0.62,
      text: lastLyric.text,
      ...candidateMetric(beats, lastLyric.time),
    });
  }
}

function addEnergyCandidates(candidates, beats, duration) {
  if (!beats.length) return;
  const step = Math.max(toNumber(beats[0].step, 0), 0.5);
  const scanStep = Math.max(step * 8, 4);
  const windows = [];
  for (let time = 0; time < duration - 8; time += scanStep) {
    windows.push({
      time: round(time),
      energy: windowStats(beats, time, 8).energy,
    });
  }
  if (!windows.length) return;

  const earlyWindows = windows.filter((window) => window.time <= Math.min(24, duration - 8));
  const rise = earlyWindows.find((window, index) => {
    if (index === 0) return false;
    const prior = earlyWindows.slice(0, index).sort((a, b) => a.energy - b.energy)[0];
    const stats = windowStats(beats, window.time, 8);
    const next = earlyWindows[index + 1];
    return prior
      && window.energy - prior.energy >= 0.12
      && stats.beatStability >= 0.35
      && (!next || next.energy >= window.energy - 0.04);
  });
  if (rise) {
    const lowWindow = earlyWindows
      .filter((window) => window.time < rise.time)
      .sort((a, b) => a.energy - b.energy || a.time - b.time)[0];
    if (lowWindow) {
      const contrast = rise.energy - lowWindow.energy;
      candidates.push({
        type: 'intro',
        role: 'entry',
        source: 'energy',
        time: lowWindow.time,
        confidence: round(Math.min(0.9, 0.58 + contrast * 0.4)),
        resolvesTo: { type: 'strong-entry', time: round(rise.time + 4) },
        ...candidateMetric(beats, lowWindow.time),
      });
    }
  }

  const sorted = windows.slice().sort((a, b) => b.energy - a.energy);
  const peak = sorted[0];
  candidates.push({
    type: 'peak',
    role: 'avoid-exit',
    time: peak.time,
    confidence: round(Math.min(0.95, 0.55 + peak.energy * 0.4)),
    ...candidateMetric(beats, peak.time),
  });

  const release = windows
    .filter((window) => window.time > peak.time + 8 && window.energy <= peak.energy * 0.82)
    .sort((a, b) => a.time - b.time)[0];
  if (release) {
    candidates.push({
      type: 'release',
      role: 'exit',
      time: release.time,
      confidence: round(Math.min(0.92, 0.5 + Math.max(0, peak.energy - release.energy) * 0.6)),
      ...candidateMetric(beats, release.time),
    });
  }

  const tailStart = Math.max(0, duration - 16);
  candidates.push({
    type: 'outro',
    role: 'exit',
    time: round(tailStart),
    confidence: 0.58,
    ...candidateMetric(beats, tailStart),
  });
}

function analyzeSectionCandidates(opts = {}) {
  const fixture = opts.fixture || {};
  const map = fixture.map || {};
  const beats = (map.beats || []).slice().sort((a, b) => a.time - b.time);
  const duration = Math.max(
    toNumber(fixture.track && fixture.track.duration),
    toNumber(map.duration),
    beats.length ? beats[beats.length - 1].time : 0,
  );
  const candidates = [];

  addEnergyCandidates(candidates, beats, duration);
  addLyricCandidates(candidates, opts.lrcLines || [], beats);

  return {
    track: fixture.track || {},
    duration: round(duration),
    candidates: uniqueCandidates(candidates),
  };
}

function scoreExit(candidate) {
  if (!candidate || candidate.role !== 'exit') return 0;
  let score = candidate.confidence || 0;
  if (candidate.type === 'release') score += 0.18;
  if (candidate.type === 'outro') score += 0.12;
  if (candidate.energyAfter < candidate.energyBefore) score += 0.08;
  return score;
}

function scoreLateExit(candidate, duration) {
  if (!candidate || candidate.role !== 'exit') return 0;
  const lateRatio = duration > 0 ? Math.max(0, Math.min(1, candidate.time / duration)) : 0;
  let score = scoreExit(candidate) + lateRatio * 0.42;
  if (candidate.type === 'outro') score += 0.26;
  return score;
}

function scoreEntry(candidate) {
  if (!candidate || candidate.role !== 'entry') return 0;
  let score = candidate.confidence || 0;
  if (candidate.type === 'pre-section') score += 0.2;
  if (candidate.type === 'chorus' || candidate.type === 'hook') score += 0.1;
  if (candidate.resolvesTo && (candidate.resolvesTo.type === 'chorus' || candidate.resolvesTo.type === 'hook')) score += 0.08;
  return score;
}

function hasNearbyClosedOutgoingPhrase(exit, exits) {
  if (!exit || exit.text) return false;
  return (exits || []).some((candidate) => (
    candidate
    && candidate.text
    && Math.abs(toNumber(candidate.time) - toNumber(exit.time)) <= 8
    && isClosedOutgoingPhrase(candidate.text)
  ));
}

function scoreCandidatePair(exit, entry, fromAnalysis, toAnalysis, exitScore, exits = []) {
  const baseScore = (exitScore(exit) * 0.5) + (scoreEntry(entry) * 0.5);
  const evaluation = evaluateTransitionPair({
    exit,
    entry,
    fromDuration: toNumber(fromAnalysis && fromAnalysis.duration),
    toDuration: toNumber(toAnalysis && toAnalysis.duration),
    styleCompatibility: inferStyleCompatibility(fromAnalysis, toAnalysis),
  });
  const nearClosedPhrase = hasNearbyClosedOutgoingPhrase(exit, exits);
  let pairScore = (baseScore * 0.7) + (evaluation.score * 0.3);
  if (evaluation.recipe === 'lyric-handoff') pairScore += 0.22;
  else if (evaluation.recipe === 'instrumental-outro-to-vocal-hook') pairScore += 0.07;
  if (evaluation.risks.includes('closed outgoing phrase')) pairScore = Math.min(pairScore, 0.74);
  if (nearClosedPhrase) {
    pairScore = Math.min(pairScore, 0.74);
    evaluation.risks = Array.from(new Set([...(evaluation.risks || []), 'near closed outgoing phrase']));
  }
  return {
    exit,
    entry,
    recipe: evaluation.recipe || (entry && entry.type === 'pre-section' ? 'outro-to-chorus' : 'section-jump'),
    score: round(Math.min(0.99, pairScore)),
    evaluation,
    baseScore,
  };
}

function chooseTransitionCandidates(fromAnalysis, toAnalysis, opts = {}) {
  const exitScore = opts.exitBias === 'late'
    ? (candidate) => scoreLateExit(candidate, toNumber(fromAnalysis && fromAnalysis.duration))
    : scoreExit;
  const fromStructure = fromAnalysis.structureMap || {};
  const toStructure = toAnalysis.structureMap || {};
  const protectedUntil = toNumber(fromStructure.protectedUntil, 0);
  const sourceExits = fromStructure.exitCandidates && fromStructure.exitCandidates.length
    ? fromStructure.exitCandidates
    : (fromAnalysis.candidates || []).filter((candidate) => candidate.role === 'exit');
  const sourceEntries = toStructure.entryCandidates && toStructure.entryCandidates.length
    ? toStructure.entryCandidates
    : (toAnalysis.candidates || []).filter((candidate) => candidate.role === 'entry');
  const exits = sourceExits.filter((candidate) => candidate.role === 'exit' && toNumber(candidate.time) >= protectedUntil)
    .sort((a, b) => exitScore(b) - exitScore(a) || (opts.exitBias === 'late' ? b.time - a.time : a.time - b.time));
  const entries = sourceEntries.filter((candidate) => candidate.role === 'entry')
    .sort((a, b) => scoreEntry(b) - scoreEntry(a) || a.time - b.time);
  const pairs = [];
  const consideredExits = exits.slice(0, 6);
  const consideredEntries = entries.slice(0, 6);
  consideredExits.forEach((exit) => {
    consideredEntries.forEach((entry) => {
      pairs.push(scoreCandidatePair(exit, entry, fromAnalysis, toAnalysis, exitScore, exits));
    });
  });
  pairs.sort((a, b) => (
    b.score - a.score
    || b.evaluation.dimensions.lyricHandoff - a.evaluation.dimensions.lyricHandoff
    || exitScore(b.exit) - exitScore(a.exit)
    || scoreEntry(b.entry) - scoreEntry(a.entry)
  ));
  const chosen = pairs[0] || scoreCandidatePair(exits[0] || null, entries[0] || null, fromAnalysis, toAnalysis, exitScore, exits);
  return {
    recipe: chosen.recipe,
    exit: chosen.exit,
    entry: chosen.entry,
    score: chosen.score,
    evaluation: chosen.evaluation,
    protectedUntil,
    exitCandidateCount: exits.length,
    entryCandidateCount: entries.length,
  };
}

module.exports = {
  analyzeSectionCandidates,
  chooseTransitionCandidates,
  scoreExit,
  scoreEntry,
  scoreCandidatePair,
};
