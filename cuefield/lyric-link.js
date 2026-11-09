function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function round(value) {
  return Math.round(clamp(value) * 1000) / 1000;
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function units(value) {
  const normalized = normalize(value);
  const latin = normalized.match(/[a-z0-9]+/g) || [];
  const cjk = normalized.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || [];
  return Array.from(new Set(latin.concat(cjk)));
}

function lastLineBefore(lines, before) {
  return (lines || [])
    .filter((line) => Number(line && line.time) <= before && normalize(line && (line.normalized || line.text)))
    .sort((a, b) => Number(a.time) - Number(b.time))
    .at(-1) || null;
}

function linesAtClimax(lines, time) {
  const sorted = (lines || [])
    .filter((line) => normalize(line && (line.normalized || line.text)))
    .sort((a, b) => Number(a.time) - Number(b.time));
  const near = sorted.filter((line) => Number(line.time) >= time - 0.75 && Number(line.time) <= time + 12).slice(0, 2);
  if (near.length) return near;
  return sorted.filter((line) => Number(line.time) >= time).slice(0, 2);
}

function containsPronoun(text, values) {
  const normalized = ` ${normalize(text)} `;
  return values.some((value) => value.length === 1 ? normalized.includes(value) : normalized.includes(` ${value} `));
}

function isCallResponse(fromText, toText) {
  const fromFirst = containsPronoun(fromText, ['我', 'i', 'me', 'we', 'us']);
  const fromSecond = containsPronoun(fromText, ['你', 'you']);
  const toFirst = containsPronoun(toText, ['我', 'i', 'me', 'we', 'us']);
  const toSecond = containsPronoun(toText, ['你', 'you']);
  return (fromFirst && toSecond) || (fromSecond && toFirst);
}

function finalUnit(value) {
  const normalized = normalize(value);
  const words = normalized.split(' ').filter(Boolean);
  return words.at(-1) || normalized;
}

function suffixLinked(fromText, toText) {
  const from = finalUnit(fromText);
  const to = finalUnit(toText);
  if (!from || !to || from === to) return false;
  const max = Math.min(4, from.length, to.length);
  for (let length = max; length >= 2; length -= 1) {
    if (from.slice(-length) === to.slice(-length)) return true;
  }
  return false;
}

function scoreLyricLink(opts = {}) {
  const exitTime = Number.isFinite(Number(opts.exitTime)) ? Number(opts.exitTime) : Infinity;
  const climaxTime = Number.isFinite(Number(opts.climaxTime)) ? Number(opts.climaxTime) : 0;
  const outgoing = lastLineBefore(opts.fromLines, exitTime);
  const incomingLines = linesAtClimax(opts.toLines, climaxTime);
  if (!outgoing || !incomingLines.length) return { score: 0, reasons: ['missing-lines'] };

  const fromText = outgoing.normalized || outgoing.text || '';
  const toText = incomingLines.map((line) => line.normalized || line.text || '').join(' ');
  const fromUnits = units(fromText);
  const toUnits = units(toText);
  const toSet = new Set(toUnits);
  const overlap = fromUnits.filter((unit) => toSet.has(unit)).length;
  const overlapRatio = overlap / Math.max(1, Math.min(fromUnits.length, toUnits.length));
  const reasons = [];
  let score = overlapRatio * 0.65;
  if (overlapRatio >= 0.2) reasons.push('token-overlap');
  if (isCallResponse(fromText, toText)) {
    score += 0.18;
    reasons.push('call-response');
  }
  if (suffixLinked(fromText, toText)) {
    score += 0.17;
    reasons.push('suffix-link');
  }
  if (Number(opts.vocalOverlapSec) > 1.5) {
    score -= 0.25;
    reasons.push('vocal-collision');
  }
  if (!reasons.length) reasons.push('no-link');
  return { score: round(score), reasons };
}

module.exports = {
  scoreLyricLink,
};

