function toSeconds(mm, ss, frac) {
  return Number(mm) * 60 + Number(ss) + Number(`0.${frac || '0'}`);
}

function cleanText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLrc(text) {
  const lines = [];
  String(text || '').split(/\n/).forEach((raw) => {
    const match = raw.match(/^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/);
    if (!match) return;
    const lyric = cleanText(match[4]);
    if (!lyric) return;
    lines.push({
      time: toSeconds(match[1], match[2], match[3]),
      text: lyric,
      normalized: normalizeText(lyric),
    });
  });
  return lines.sort((a, b) => a.time - b.time);
}

function repeatedGroups(lines) {
  const groups = new Map();
  lines.forEach((line) => {
    if (!line.normalized || line.normalized.length < 4) return;
    if (!groups.has(line.normalized)) groups.set(line.normalized, []);
    groups.get(line.normalized).push(line);
  });
  return Array.from(groups.values()).filter((group) => group.length >= 2);
}

function findSectionEntry(lines, opts = {}) {
  const candidates = findSectionEntries(lines, opts);
  return candidates[0] || null;
}

function findSectionEntries(lines, opts = {}) {
  const preferAfter = Number.isFinite(Number(opts.preferAfter)) ? Number(opts.preferAfter) : 30;
  const repeated = repeatedGroups(lines)
    .flatMap((group) => group.map((line) => ({
      kind: 'section-entry',
      sectionType: 'repeated-vocal',
      time: line.time,
      text: line.text,
      repeats: group.length,
      score: group.length * 10 + (line.time >= preferAfter ? 3 : 0) + Math.min(4, line.normalized.split(' ').length),
    })))
    .filter((candidate) => candidate.time >= preferAfter);

  const preSections = repeated
    .map((candidate) => {
      const before = lines.filter((line) => line.time < candidate.time && line.time >= candidate.time - 16);
      const anchor = before[before.length - 1];
      if (!anchor) return null;
      return {
        kind: 'section-entry',
        sectionType: 'pre-section',
        time: anchor.time,
        text: anchor.text,
        repeats: candidate.repeats,
        score: candidate.score - 1,
        resolvesTo: {
          time: candidate.time,
          text: candidate.text,
          sectionType: candidate.sectionType,
        },
      };
    })
    .filter(Boolean);

  const candidates = repeated.concat(preSections);
  if (candidates.length) {
    candidates.sort((a, b) => b.score - a.score || a.time - b.time);
    return candidates;
  }

  const fallback = lines.find((line) => line.time >= preferAfter) || lines[0];
  if (!fallback) return [];
  return [{
    kind: 'section-candidate',
    sectionType: 'timed-entry',
    time: fallback.time,
    text: fallback.text,
    repeats: 1,
    score: 0,
  }];
}

function findHookEntry(lines, opts = {}) {
  const entry = findSectionEntry(lines, opts);
  if (!entry) return null;
  return {
    ...entry,
    kind: entry.kind === 'section-entry' ? 'hook' : 'hook-candidate',
  };
}

function findOutgoingPhrase(lines, opts = {}) {
  const before = Number.isFinite(Number(opts.before)) ? Number(opts.before) : Infinity;
  const maxLookback = Number.isFinite(Number(opts.maxLookback)) ? Number(opts.maxLookback) : 24;
  const candidates = lines.filter((line) => line.time <= before && line.time >= before - maxLookback);
  const chosen = candidates[candidates.length - 1] || lines.filter((line) => line.time <= before).at(-1);
  if (!chosen) return null;
  return {
    kind: 'outgoing-phrase',
    time: chosen.time,
    text: chosen.text,
  };
}

module.exports = {
  findHookEntry,
  findOutgoingPhrase,
  findSectionEntries,
  findSectionEntry,
  normalizeText,
  parseLrc,
};
