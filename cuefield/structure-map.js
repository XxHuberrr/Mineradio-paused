const { round, toNumber } = require('./cue-profile');

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function repeatedLyricTimes(lines) {
  const groups = new Map();
  for (const line of lines || []) {
    const key = String(line && line.normalized || '').trim();
    if (key.length < 4) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(toNumber(line.time));
  }
  return Array.from(groups.values())
    .filter((times) => times.length >= 2)
    .flat()
    .sort((a, b) => a - b);
}

function repeatedLyricBlocks(lines) {
  const unique = new Map();
  for (const line of lines || []) {
    const normalized = String(line && line.normalized || '').trim();
    const time = toNumber(line && line.time, NaN);
    if (normalized.length < 4 || !Number.isFinite(time)) continue;
    const key = `${normalized}\u0000${time}`;
    if (!unique.has(key)) unique.set(key, { ...line, normalized, time });
  }
  const sorted = Array.from(unique.values()).sort((a, b) => a.time - b.time);
  const pairs = new Map();
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const first = String(sorted[index] && sorted[index].normalized || '').trim();
    const second = String(sorted[index + 1] && sorted[index + 1].normalized || '').trim();
    if (first.length < 4 || second.length < 4 || first === second) continue;
    const key = `${first}\u0000${second}`;
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(index);
  }
  const repeated = Array.from(pairs.values()).filter((indexes) => indexes.length >= 2);
  return repeated
    .flatMap((indexes) => indexes.map((firstIndex) => ({
      lines: sorted.slice(firstIndex, firstIndex + 2),
      occurrences: indexes.length,
      firstTime: toNumber(sorted[firstIndex].time),
    })))
    .sort((a, b) => a.firstTime - b.firstTime);
}

function phraseForTime(phrases, time) {
  return phrases.find((phrase) => time >= toNumber(phrase.start) && time < toNumber(phrase.end)) || null;
}

function signaturePhrase(profile, lrcLines) {
  const phrases = profile.phrases || [];
  const mean = average(phrases.map((phrase) => toNumber(phrase.energy, NaN)));
  const blocks = repeatedLyricBlocks(lrcLines);
  for (const block of blocks) {
    const blockPhrases = block.lines.map((line) => phraseForTime(phrases, line.time)).filter(Boolean);
    const firstPhrase = blockPhrases[0];
    const lastPhrase = blockPhrases[blockPhrases.length - 1];
    const sustainedEnergy = blockPhrases.length === block.lines.length
      && blockPhrases.every((phrase) => toNumber(phrase.energy) >= mean * 0.95);
    if (firstPhrase && lastPhrase && sustainedEnergy) {
      const energyLift = average(blockPhrases.map((phrase) => toNumber(phrase.energy))) - mean;
      return {
        phrase: firstPhrase,
        end: lastPhrase.end,
        source: 'lyric+beat',
        confidence: 0.88,
        repeatedLineCount: block.lines.length,
        repeatedBlockCount: block.occurrences,
        energyLift,
        sustainedEnergy,
      };
    }
  }

  const repeatedTimes = repeatedLyricTimes(lrcLines);
  const lyricPhrase = repeatedTimes
    .map((time) => phraseForTime(phrases, time))
    .find((phrase) => phrase && toNumber(phrase.energy) >= mean * 0.95);
  if (lyricPhrase) return {
    phrase: lyricPhrase,
    source: 'lyric+beat',
    type: 'hook-candidate',
    confidence: 0.5,
  };

  const sustained = phrases.find((phrase, index) => (
    index > 0
    && toNumber(phrase.energy) >= mean * 1.05
    && phrases[index + 1]
    && toNumber(phrases[index + 1].energy) >= mean * 0.95
  ));
  const fallback = sustained
    || phrases.slice(1).sort((a, b) => toNumber(b.energy) - toNumber(a.energy))[0]
    || phrases[0]
    || null;
  return { phrase: fallback, source: 'beat-only', type: 'drop', confidence: sustained ? 0.62 : 0.42 };
}

function latePenalty(exitRatio) {
  if (exitRatio <= 0.65) return 0;
  if (exitRatio <= 0.78) return round((exitRatio - 0.65) / 0.13 * 0.25);
  return round(0.45 + Math.min(0.2, (exitRatio - 0.78) * 0.5));
}

function buildVocalWindows(lines, duration) {
  const seen = new Set();
  const timed = (lines || [])
    .filter((line) => String(line && (line.normalized || line.text) || '').trim())
    .map((line) => toNumber(line && line.time, NaN))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
    .filter((time) => {
      const key = round(time);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return timed.map((start, index) => {
    const next = timed[index + 1];
    const estimatedEnd = Number.isFinite(next)
      ? Math.min(start + 6.5, Math.max(start + 0.8, next - 0.18))
      : start + 4.5;
    return {
      start: round(start),
      end: round(Math.min(Math.max(start, toNumber(duration, estimatedEnd)), estimatedEnd)),
    };
  }).filter((window) => window.end > window.start);
}

function buildExitCandidates(profile, protectedUntil) {
  const phrases = profile.phrases || [];
  const duration = toNumber(profile.duration);
  const searchStart = protectedUntil;
  const searchEnd = Math.max(searchStart, duration - 8);
  const candidates = [];

  phrases.forEach((phrase, index) => {
    const time = toNumber(phrase.end);
    if (time < searchStart || time > searchEnd) return;
    const next = phrases[index + 1];
    const before = toNumber(phrase.energy);
    const after = next ? toNumber(next.energy) : before;
    const delta = after - before;
    const exitRatio = duration > 0 ? round(time / duration) : 0;
    candidates.push({
      type: time === protectedUntil ? 'post-hook-boundary' : (delta <= -0.08 ? 'release' : 'phrase-boundary'),
      role: 'exit',
      source: 'structure',
      time: round(time),
      confidence: round(Math.max(0.35, Math.min(0.9, 0.58 - delta * 0.5))),
      energyBefore: round(before),
      energyAfter: round(after),
      beatStability: 0,
      lowDensity: 0,
      vocalDensity: 0,
      exitRatio,
      latePenalty: latePenalty(exitRatio),
    });
  });

  if (!candidates.length && duration > protectedUntil) {
    candidates.push({
      type: 'natural-tail',
      role: 'exit',
      source: 'structure',
      time: round(Math.max(protectedUntil, duration - 2)),
      confidence: 0.35,
      energyBefore: 0,
      energyAfter: 0,
      beatStability: 0,
      lowDensity: 0,
      vocalDensity: 0,
      exitRatio: duration > 0 ? round(Math.max(protectedUntil, duration - 2) / duration) : 0,
      latePenalty: duration > 0 ? latePenalty(Math.max(protectedUntil, duration - 2) / duration) : 0,
    });
  }
  return candidates;
}

function buildStructureMap(opts = {}) {
  const profile = opts.profile || {};
  const phrases = profile.phrases || [];
  const signature = signaturePhrase(profile, opts.lrcLines || []);
  const protectedUntil = round(signature.phrase
    ? (signature.end || signature.phrase.end)
    : Math.min(toNumber(profile.duration), 32));
  const fallbackEntry = {
    type: 'start',
    role: 'entry',
    source: 'fallback',
    time: 0,
    confidence: 0.35,
    energyBefore: 0,
    energyAfter: 0,
    vocalDensity: 0,
    lowDensity: 0,
    beatStability: 0,
    playFrom: 0,
    landingAt: 0,
    landingType: 'start',
  };
  const signatureType = signature.source === 'lyric+beat' ? (signature.type || 'hook') : (signature.type || 'drop');
  const signatureEntry = signature.phrase && signature.confidence >= 0.6 ? {
    type: signatureType,
    role: 'entry',
    source: signature.source,
    time: round(signature.phrase.start),
    confidence: signature.confidence,
    energyBefore: 0,
    energyAfter: round(signature.phrase.energy),
    vocalDensity: signature.source === 'lyric+beat' ? 0.7 : 0,
    lowDensity: 0,
    beatStability: 0,
    playFrom: round(signature.phrase.start),
    landingAt: round(signature.phrase.start),
    landingType: signatureType,
    ...(signature.repeatedLineCount ? {
      repeatedLineCount: signature.repeatedLineCount,
      repeatedBlockCount: signature.repeatedBlockCount,
      energyLift: round(signature.energyLift),
      sustainedEnergy: signature.sustainedEnergy,
      evidence: {
        repeatedLineCount: signature.repeatedLineCount,
        repeatedBlockCount: signature.repeatedBlockCount,
        energyLift: round(signature.energyLift),
        sustainedEnergy: signature.sustainedEnergy,
      },
    } : {}),
  } : null;
  const signatureIndex = signature.phrase ? phrases.indexOf(signature.phrase) : -1;
  const priorPhrase = signatureIndex > 0 ? phrases[signatureIndex - 1] : null;
  const preHookEntry = signatureEntry && priorPhrase ? {
    type: 'pre-hook',
    role: 'entry',
    source: signature.source,
    time: round(priorPhrase.start),
    confidence: round(Math.max(0.35, signature.confidence - 0.08)),
    resolvesTo: { type: signatureEntry.type, time: signatureEntry.time },
    energyBefore: round(priorPhrase.energy),
    energyAfter: round(signature.phrase.energy),
    vocalDensity: 0,
    lowDensity: 0,
    beatStability: 0,
    playFrom: round(priorPhrase.start),
    landingAt: signatureEntry.landingAt,
    landingType: signatureEntry.landingType,
  } : null;
  const sections = [];
  if (priorPhrase && preHookEntry) sections.push({
    ...priorPhrase,
    type: 'pre-hook',
    confidence: preHookEntry.confidence,
    source: signature.source,
    ...(signature.repeatedLineCount ? {
      repeatedLineCount: signature.repeatedLineCount,
      repeatedBlockCount: signature.repeatedBlockCount,
      energyLift: round(signature.energyLift),
      sustainedEnergy: signature.sustainedEnergy,
      evidence: {
        repeatedLineCount: signature.repeatedLineCount,
        repeatedBlockCount: signature.repeatedBlockCount,
        energyLift: round(signature.energyLift),
        sustainedEnergy: signature.sustainedEnergy,
      },
    } : {}),
  });
  if (signature.phrase) sections.push({
    ...signature.phrase,
    ...(signature.end ? { end: signature.end } : {}),
    type: signatureType,
    confidence: signature.confidence,
    source: signature.source,
    ...(signature.repeatedLineCount ? {
      repeatedLineCount: signature.repeatedLineCount,
      repeatedBlockCount: signature.repeatedBlockCount,
      energyLift: round(signature.energyLift),
      sustainedEnergy: signature.sustainedEnergy,
      evidence: {
        repeatedLineCount: signature.repeatedLineCount,
        repeatedBlockCount: signature.repeatedBlockCount,
        energyLift: round(signature.energyLift),
        sustainedEnergy: signature.sustainedEnergy,
      },
    } : {}),
  });

  return {
    duration: round(profile.duration),
    structureSource: signature.source,
    structureConfidence: signature.confidence,
    protectedUntil,
    sections,
    vocalWindows: buildVocalWindows(opts.lrcLines || [], profile.duration),
    exitCandidates: buildExitCandidates(profile, protectedUntil),
    entryCandidates: [fallbackEntry, preHookEntry, signatureEntry].filter(Boolean),
  };
}

module.exports = {
  buildStructureMap,
};

