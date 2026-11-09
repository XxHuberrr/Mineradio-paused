const { round, toNumber } = require('./cue-profile');

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR_TEMPLATE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_TEMPLATE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, toNumber(value)));
}

function normalize(values) {
  const total = values.reduce((sum, value) => sum + Math.max(0, toNumber(value)), 0);
  return total > 0 ? values.map((value) => round(Math.max(0, toNumber(value)) / total, 6)) : values.map(() => 0);
}

function cosine(first, second) {
  let dot = 0;
  let a = 0;
  let b = 0;
  for (let index = 0; index < Math.min(first.length, second.length); index += 1) {
    dot += toNumber(first[index]) * toNumber(second[index]);
    a += toNumber(first[index]) ** 2;
    b += toNumber(second[index]) ** 2;
  }
  return a > 0 && b > 0 ? clamp(dot / Math.sqrt(a * b)) : 0;
}

function normalizeNote(note) {
  const pitch = toNumber(note && (note.pitchMidi ?? note.pitch_midi), NaN);
  const start = toNumber(note && (note.startTimeSeconds ?? note.start_time ?? note.start), NaN);
  const duration = toNumber(note && (note.durationSeconds ?? note.duration), NaN);
  const amplitude = clamp(note && (note.amplitude ?? note.confidence ?? note.velocity), 0, 1);
  if (![pitch, start, duration].every(Number.isFinite)) return null;
  return { pitch: Math.round(pitch), start, duration, amplitude };
}

function estimateKey(profile) {
  const candidates = [];
  [
    ['major', MAJOR_TEMPLATE],
    ['minor', MINOR_TEMPLATE],
  ].forEach(([mode, template]) => {
    for (let root = 0; root < 12; root += 1) {
      const rotated = profile.map((_, pitchClass) => template[(pitchClass - root + 12) % 12]);
      candidates.push({ root, mode, score: cosine(profile, rotated) });
    }
  });
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] || { root: 0, mode: 'major', score: 0 };
  const second = candidates[1] || { score: 0 };
  return {
    root: best.root,
    mode: best.mode,
    name: `${NOTE_NAMES[best.root]} ${best.mode}`,
    confidence: round(clamp((best.score - second.score) * 4)),
  };
}

function melodyContour(notes, frameSize) {
  if (!notes.length) return { intervalProfile: Array(25).fill(0), contour: [], pitchRange: 0 };
  const end = Math.max(...notes.map((note) => note.start + note.duration));
  const contour = [];
  for (let time = 0; time <= end; time += frameSize) {
    const active = notes.filter((note) => note.start <= time && note.start + note.duration > time);
    if (!active.length) continue;
    active.sort((a, b) => (b.amplitude * Math.sqrt(b.duration)) - (a.amplitude * Math.sqrt(a.duration)) || b.pitch - a.pitch);
    const pitch = active[0].pitch;
    if (contour[contour.length - 1] !== pitch) contour.push(pitch);
  }
  const intervals = Array(25).fill(0);
  for (let index = 1; index < contour.length; index += 1) {
    const interval = Math.max(-12, Math.min(12, contour[index] - contour[index - 1]));
    intervals[interval + 12] += 1;
  }
  return {
    intervalProfile: normalize(intervals),
    contour: contour.slice(0, 64),
    pitchRange: contour.length ? Math.max(...contour) - Math.min(...contour) : 0,
  };
}

function buildMusicalProfile(noteEvents, options = {}) {
  const minimumDuration = toNumber(options.minimumDuration, 0.08);
  const minimumAmplitude = toNumber(options.minimumAmplitude, 0.25);
  const minimumPitch = toNumber(options.minimumPitch, 36);
  const maximumPitch = toNumber(options.maximumPitch, 96);
  const notes = (Array.isArray(noteEvents) ? noteEvents : [])
    .map(normalizeNote)
    .filter((note) => note
      && note.duration >= minimumDuration
      && note.amplitude >= minimumAmplitude
      && note.pitch >= minimumPitch
      && note.pitch <= maximumPitch)
    .sort((a, b) => a.start - b.start || b.amplitude - a.amplitude);
  const pitchClasses = Array(12).fill(0);
  notes.forEach((note) => {
    pitchClasses[((note.pitch % 12) + 12) % 12] += note.duration * note.amplitude;
  });
  const pitchClassProfile = normalize(pitchClasses);
  const contour = melodyContour(notes, toNumber(options.frameSize, 0.25));
  const duration = notes.length ? Math.max(...notes.map((note) => note.start + note.duration)) : 0;
  return {
    source: 'basic-pitch',
    noteCount: notes.length,
    noteDensity: round(duration > 0 ? notes.length / duration : 0),
    pitchClassProfile,
    key: estimateKey(pitchClassProfile),
    intervalProfile: contour.intervalProfile,
    melodyContour: contour.contour,
    pitchRange: contour.pitchRange,
    confidence: round(clamp(notes.length / 24)),
  };
}

function keyCompatibility(first, second) {
  if (!first || !second || !Number.isFinite(first.root) || !Number.isFinite(second.root)) return 0.5;
  const distance = Math.min((first.root - second.root + 12) % 12, (second.root - first.root + 12) % 12);
  if (first.root === second.root && first.mode === second.mode) return 1;
  const relative = (first.mode === 'major' && second.mode === 'minor' && second.root === (first.root + 9) % 12)
    || (first.mode === 'minor' && second.mode === 'major' && second.root === (first.root + 3) % 12);
  if (relative) return 0.94;
  if (first.root === second.root) return 0.78;
  if (distance === 5) return first.mode === second.mode ? 0.86 : 0.72;
  if (distance === 2) return first.mode === second.mode ? 0.68 : 0.58;
  if (distance === 1) return 0.42;
  if (distance === 6) return 0.18;
  return 0.5;
}

function compareMusicalProfiles(first = {}, second = {}) {
  const harmonicSimilarity = cosine(first.pitchClassProfile || [], second.pitchClassProfile || []);
  const keyScore = keyCompatibility(first.key, second.key);
  const melodySimilarity = cosine(first.intervalProfile || [], second.intervalProfile || []);
  const score = clamp(harmonicSimilarity * 0.45 + keyScore * 0.35 + melodySimilarity * 0.2);
  const risks = [];
  if (harmonicSimilarity < 0.62 && keyScore < 0.5) risks.push('harmonic-clash');
  if (melodySimilarity < 0.28) risks.push('melody-contour-contrast');
  return {
    score: round(score),
    harmonicSimilarity: round(harmonicSimilarity),
    keyCompatibility: round(keyScore),
    melodySimilarity: round(melodySimilarity),
    risks,
  };
}

function distanceToWindow(time, window) {
  const start = toNumber(window && window.start, NaN);
  const duration = toNumber(window && window.duration, NaN);
  if (!Number.isFinite(time) || !Number.isFinite(start) || !Number.isFinite(duration) || duration < 0) return Infinity;
  const end = start + duration;
  if (time < start) return start - time;
  if (time > end) return time - end;
  return 0;
}

function nearestReliableWindow(profile, time) {
  return (Array.isArray(profile && profile.windows) ? profile.windows : [])
    .filter((window) => toNumber(window && window.confidence) >= 0.55 && toNumber(window && window.noteCount) >= 12)
    .map((window) => ({ window, distance: distanceToWindow(time, window) }))
    .filter((match) => match.distance <= Math.max(2, toNumber(match.window.duration, 0) * 1.5))
    .sort((a, b) => a.distance - b.distance || toNumber(b.window.confidence) - toNumber(a.window.confidence))[0] || null;
}

function compareLocalMusicalWindows(first, second, firstTime, secondTime) {
  const a = nearestReliableWindow(first, firstTime);
  const b = nearestReliableWindow(second, secondTime);
  if (!a || !b) return null;
  const comparison = compareMusicalProfiles(a.window, b.window);
  return {
    ...comparison,
    confidence: round(Math.min(toNumber(a.window.confidence), toNumber(b.window.confidence))),
    aWindowStart: round(toNumber(a.window.start)),
    bWindowStart: round(toNumber(b.window.start)),
    aDistance: round(a.distance),
    bDistance: round(b.distance),
  };
}

module.exports = {
  buildMusicalProfile,
  compareMusicalProfiles,
  compareLocalMusicalWindows,
  distanceToWindow,
  estimateKey,
  keyCompatibility,
  nearestReliableWindow,
};

