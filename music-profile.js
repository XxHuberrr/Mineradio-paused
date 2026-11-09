'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MUSIC_PROFILE_VERSION = 1;
const MUSIC_PROFILE_EVENT_LIMIT = 500;
const PROFILE_READY_SONGS = 5;
const RECOVERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const RECOVERY_CLOCK_SKEW_MS = 60 * 1000;
const REDUCED_TAG_MULTIPLIER = 0.25;

function createMusicProfileState() {
  return {
    version: MUSIC_PROFILE_VERSION,
    enabled: false,
    recommendationMode: false,
    events: [],
    reducedTags: {},
  };
}

function normalizeAllowedValues(value) {
  const values = Array.isArray(value) ? value : [value];
  const seen = new Set();
  return values.reduce((normalized, item) => {
    if (typeof item !== 'string') return normalized;
    const clean = item.trim().toLowerCase();
    if (!clean || seen.has(clean)) return normalized;
    seen.add(clean);
    normalized.push(clean);
    return normalized;
  }, []);
}

function normalizeReleaseDate(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return [];
  const text = String(value).trim();
  const match = text.match(/^(\d{4})(?:-(\d{2})-(\d{2}))?$/);
  if (!match) return [];

  const year = Number(match[1]);
  if (!Number.isInteger(year) || year < 1000 || year > 2999) return [];
  if (match[2]) {
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (month < 1 || month > 12 || day < 1 || date.getUTCFullYear() !== year
      || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return [];
  }
  return [`${Math.floor(year / 10) * 10}s`];
}

function normalizeProfileMetadata(song) {
  const data = song && song.profileMetadata && typeof song.profileMetadata === 'object'
    ? song.profileMetadata : {};
  return {
    styles: normalizeAllowedValues(data.styles),
    languages: normalizeAllowedValues(data.languages),
    eras: normalizeReleaseDate(data.releaseDate || (song && song.releaseDate)),
    isDj: data.isDj === true,
  };
}

function normalizeDimensions(value) {
  const data = value && typeof value === 'object' ? value : {};
  return {
    styles: normalizeAllowedValues(data.styles),
    languages: normalizeAllowedValues(data.languages),
    eras: normalizeAllowedValues(data.eras).filter((era) => /^\d{4}s$/.test(era)),
    isDj: data.isDj === true,
  };
}

function normalizeSongKey(event) {
  if (typeof event.songKey === 'string' && event.songKey.trim()) return event.songKey.trim();
  const song = event.song && typeof event.song === 'object' ? event.song : null;
  if (!song || typeof song.provider !== 'string' || !song.provider.trim()) return '';
  if ((typeof song.id !== 'string' && typeof song.id !== 'number') || String(song.id).trim() === '') return '';
  return `${song.provider.trim().toLowerCase()}:${String(song.id).trim()}`;
}

function normalizeProgress(value) {
  const progress = Number(value);
  return Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
}

function normalizeEventKind(event, dimensions, progress) {
  if (event.kind === 'favorite') return 'favorite';
  if (event.kind === 'listen') return 'listen';
  if (event.kind === 'early-skip') {
    return event.manual === false || progress > 0.15 ? 'skip' : 'early-skip';
  }
  if (event.kind === 'skip' && event.manual === true && progress <= 0.15) return 'early-skip';
  return 'skip';
}

function eventContribution(event) {
  if (!event || typeof event !== 'object') return 0;
  if (event.kind === 'favorite') return 40;
  if (event.kind === 'early-skip') return -50;
  if (event.kind !== 'listen') return 0;
  const threshold = event.dimensions && event.dimensions.isDj ? 0.5 : 0.8;
  return event.progress >= threshold ? 10 : 0;
}

function eventTagKeys(event) {
  const dimensions = event && event.dimensions ? event.dimensions : {};
  return [
    ...normalizeAllowedValues(dimensions.styles).map((value) => `style:${value}`),
    ...normalizeAllowedValues(dimensions.languages).map((value) => `language:${value}`),
    ...normalizeAllowedValues(dimensions.eras).filter((value) => /^\d{4}s$/.test(value)).map((value) => `era:${value}`),
  ];
}

function validTagKey(key) {
  return typeof key === 'string' && /^(style|language|era):[^\s:][^:]*$/.test(key);
}

function applyMusicProfileEvent(state, event) {
  if (!state || state.enabled !== true || !event || typeof event !== 'object') return false;
  const id = typeof event.id === 'string' ? event.id.trim() : '';
  if (!id || state.events.some((item) => item.id === id)) return false;

  const song = event.song && typeof event.song === 'object' ? event.song : {};
  const type = typeof song.type === 'string' ? song.type.trim().toLowerCase() : '';
  if (type === 'local' || type === 'podcast') return false;

  const songKey = normalizeSongKey(event);
  if (!songKey) return false;
  const dimensions = normalizeProfileMetadata(song);
  const progress = normalizeProgress(event.progress);
  const atCandidate = Number(event.at);
  const at = Number.isFinite(atCandidate) ? atCandidate : Date.now();
  const stored = {
    id,
    songKey,
    at,
    kind: normalizeEventKind(event, dimensions, progress),
    progress,
    dimensions,
  };
  state.events.push(stored);
  if (state.events.length > MUSIC_PROFILE_EVENT_LIMIT) {
    state.events.splice(0, state.events.length - MUSIC_PROFILE_EVENT_LIMIT);
  }
  if (at >= Date.now() - RECOVERY_WINDOW_MS && at <= Date.now() + RECOVERY_CLOCK_SKEW_MS) {
    recoverMusicProfileReducedTags(state, at);
  }
  return true;
}

function setMusicProfileEnabled(state, enabled) {
  if (!state || typeof state !== 'object') return createMusicProfileState();
  state.enabled = enabled === true;
  if (!state.enabled) state.recommendationMode = false;
  return state;
}

function setMusicProfileRecommendationMode(state, enabled) {
  if (!state || typeof state !== 'object') return createMusicProfileState();
  state.recommendationMode = enabled === true;
  return state;
}

function setMusicProfileTagReduced(state, tagKey, reduced) {
  if (!state || typeof state !== 'object' || !validTagKey(tagKey)) return state;
  if (!state.reducedTags || typeof state.reducedTags !== 'object') state.reducedTags = {};
  if (reduced === true) {
    state.reducedTags[tagKey] = { reducedAt: Date.now() };
  } else {
    delete state.reducedTags[tagKey];
  }
  return state;
}

function clearMusicProfile() {
  return createMusicProfileState();
}

function normalizeStoredEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const id = typeof event.id === 'string' ? event.id.trim() : '';
  const songKey = typeof event.songKey === 'string' ? event.songKey.trim() : '';
  const at = Number(event.at);
  if (!id || !songKey || !Number.isFinite(at)) return null;
  const kind = ['favorite', 'listen', 'early-skip', 'skip'].includes(event.kind) ? event.kind : 'skip';
  return {
    id,
    songKey,
    at,
    kind,
    progress: normalizeProgress(event.progress),
    dimensions: normalizeDimensions(event.dimensions),
  };
}

function normalizeReducedTags(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce((result, [key, preference]) => {
    if (!validTagKey(key)) return result;
    const reducedAt = preference && typeof preference === 'object' && Number.isFinite(Number(preference.reducedAt))
      ? Number(preference.reducedAt)
      : 0;
    const recoveredAt = preference && typeof preference === 'object' && Number.isFinite(Number(preference.recoveredAt))
      ? Number(preference.recoveredAt)
      : 0;
    const recoveryEvidenceSongs = preference && typeof preference === 'object' && Number.isFinite(Number(preference.recoveryEvidenceSongs))
      ? Math.max(0, Number(preference.recoveryEvidenceSongs))
      : 0;
    result[key] = recoveredAt ? { reducedAt, recoveredAt, recoveryEvidenceSongs } : { reducedAt };
    return result;
  }, {});
}

function normalizeState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createMusicProfileState();
  const events = (Array.isArray(value.events) ? value.events : [])
    .map(normalizeStoredEvent)
    .filter(Boolean)
    .slice(-MUSIC_PROFILE_EVENT_LIMIT);
  return {
    version: MUSIC_PROFILE_VERSION,
    enabled: value.enabled === true,
    recommendationMode: value.recommendationMode === true,
    events,
    reducedTags: normalizeReducedTags(value.reducedTags),
  };
}

function loadMusicProfile(filePath) {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (_) {
    return createMusicProfileState();
  }
}

function saveMusicProfile(filePath, state) {
  const target = String(filePath);
  const temporary = `${target}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temporary, `${JSON.stringify(normalizeState(state), null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, target);
}

function reducedTagPositiveSongKeys(state, tagKey, now, reducedAt) {
  const cutoff = now - RECOVERY_WINDOW_MS;
  const reducedAfter = Number(reducedAt) || 0;
  return new Set(state.events
    .filter((event) => event.at >= cutoff && event.at <= now && event.at >= reducedAfter && eventContribution(event) > 0)
    .filter((event) => eventTagKeys(event).includes(tagKey))
    .map((event) => event.songKey));
}

function recoverMusicProfileReducedTags(state, now) {
  if (!state || !state.reducedTags || typeof state.reducedTags !== 'object') return false;
  let changed = false;
  Object.entries(state.reducedTags).forEach(([key, preference]) => {
    if (!validTagKey(key) || !preference || preference.recoveredAt) return;
    const reducedAt = Number(preference.reducedAt) || 0;
    const positiveSongKeys = reducedTagPositiveSongKeys(state, key, now, reducedAt);
    if (positiveSongKeys.size >= PROFILE_READY_SONGS) {
      preference.recoveredAt = now;
      preference.recoveryEvidenceSongs = positiveSongKeys.size;
      changed = true;
    }
  });
  return changed;
}

function reducedTagRecovery(state, tagKey, now) {
  const preference = state.reducedTags[tagKey];
  if (!preference) return { multiplier: 1, recovered: false };
  if (Number.isFinite(Number(preference.recoveredAt)) && Number(preference.recoveredAt) > 0) {
    return {
      multiplier: 1,
      recovered: true,
      evidenceSongs: Math.max(PROFILE_READY_SONGS, Number(preference.recoveryEvidenceSongs) || 0),
    };
  }
  const reducedAt = Number(preference.reducedAt) || 0;
  const positiveSongKeys = reducedTagPositiveSongKeys(state, tagKey, now, reducedAt);
  return positiveSongKeys.size >= PROFILE_READY_SONGS
    ? { multiplier: 1, recovered: true, evidenceSongs: positiveSongKeys.size }
    : { multiplier: REDUCED_TAG_MULTIPLIER, recovered: false, evidenceSongs: positiveSongKeys.size };
}

function getMusicProfileView(state, now = Date.now()) {
  const normalized = normalizeState(state);
  const distinctSongKeys = new Set(normalized.events
    .filter((event) => eventContribution(event) !== 0)
    .map((event) => event.songKey));
  const rawWeights = new Map();
  const evidenceSongKeys = new Map();

  normalized.events.forEach((event) => {
    const contribution = eventContribution(event);
    if (!contribution) return;
    const dimensions = event.dimensions || {};
    [
      ['style', dimensions.styles],
      ['language', dimensions.languages],
      ['era', dimensions.eras],
    ].forEach(([dimension, values]) => {
      const normalizedValues = normalizeAllowedValues(values)
        .filter((value) => dimension !== 'era' || /^\d{4}s$/.test(value));
      if (!normalizedValues.length) return;
      const share = contribution / normalizedValues.length;
      normalizedValues.forEach((value) => {
        const key = `${dimension}:${value}`;
        rawWeights.set(key, (rawWeights.get(key) || 0) + share);
        if (!evidenceSongKeys.has(key)) evidenceSongKeys.set(key, new Set());
        evidenceSongKeys.get(key).add(event.songKey);
      });
    });
  });

  const recoveredTags = [];
  const tags = Array.from(rawWeights.entries()).map(([key, rawWeight]) => {
    const recovery = reducedTagRecovery(normalized, key, now);
    if (recovery.recovered) {
      recoveredTags.push({
        key,
        evidenceSongs: recovery.evidenceSongs,
        reason: 'Recovered after five different recent positive listens or favorites.',
      });
    }
    const [dimension, value] = key.split(':');
    return {
      key,
      dimension,
      value,
      weight: rawWeight < 0 ? rawWeight / recovery.multiplier : rawWeight * recovery.multiplier,
      rawWeight,
      reduced: recovery.multiplier !== 1,
      evidenceSongs: evidenceSongKeys.get(key).size,
    };
  }).sort((left, right) => right.weight - left.weight || left.key.localeCompare(right.key));

  return {
    enabled: normalized.enabled,
    recommendationMode: normalized.recommendationMode,
    ready: distinctSongKeys.size >= PROFILE_READY_SONGS,
    remainingSongs: Math.max(0, PROFILE_READY_SONGS - distinctSongKeys.size),
    tags,
    recoveredTags,
  };
}

function scoreMusicProfileSong(view, song) {
  if (!view || view.enabled !== true || view.ready !== true || !Array.isArray(view.tags)) return 0;
  const weights = new Map(view.tags
    .filter((tag) => tag && typeof tag.key === 'string' && Number.isFinite(Number(tag.weight)))
    .map((tag) => [tag.key, Number(tag.weight)]));
  const metadata = normalizeProfileMetadata(song);
  return [
    ['style', metadata.styles],
    ['language', metadata.languages],
    ['era', metadata.eras],
  ].reduce((score, [dimension, values]) => {
    if (!values.length) return score;
    const average = values.reduce((sum, value) => sum + (weights.get(`${dimension}:${value}`) || 0), 0) / values.length;
    return score + average;
  }, 0);
}

module.exports = {
  MUSIC_PROFILE_EVENT_LIMIT,
  MUSIC_PROFILE_VERSION,
  applyMusicProfileEvent,
  clearMusicProfile,
  createMusicProfileState,
  getMusicProfileView,
  loadMusicProfile,
  saveMusicProfile,
  scoreMusicProfileSong,
  setMusicProfileEnabled,
  setMusicProfileRecommendationMode,
  setMusicProfileTagReduced,
};
