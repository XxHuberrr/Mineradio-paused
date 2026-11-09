const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BUILT_IN_PLAYLIST_VERSION = 1;
const BUILT_IN_PLAYLIST_FILE = 'built-in-playlists.json';
const MAX_PLAYLISTS = 100;
const MAX_TRACKS_PER_PLAYLIST = 5000;
const MAX_INDEX_BYTES = 32 * 1024 * 1024;
const MAX_TRACK_BYTES = 48 * 1024;
const ALLOWED_PROVIDERS = new Set(['netease', 'qq', 'kugou', 'qishui', 'local']);

const TRACK_FIELDS = [
  'provider', 'source', 'type', 'id', 'providerSongId', 'provider_song_id', 'trackId', 'track_id',
  'mid', 'songmid', 'mediaMid', 'media_mid', 'qqId',
  'hash', 'fileHash', 'audioHash', 'albumId', 'album_id', 'albumMid', 'albummid',
  'albumAudioId', 'album_audio_id', 'mixSongId', 'mix_song_id', 'hqHash', 'hq_hash',
  'sqHash', 'sq_hash', 'resHash', 'res_hash',
  'name', 'title', 'artist', 'album', 'cover', 'duration', 'durationMs', 'dt',
  'fee', 'Fee', 'playable', 'playbackMode', 'recommendationSource',
  'localKey', 'localFileId', 'localUrl', 'localPath', 'localMissing', 'hasLyric', 'lyricSource',
  'vipRequired', 'needVip', 'onlyVipPlayable', 'only_vip_playable',
  'privilege', 'Privilege', 'mediaPrivilege', 'media_privilege',
];

function cleanText(value, fallback = '', maxLength = 1000) {
  const text = String(value == null ? '' : value).replace(/\0/g, '').trim();
  return (text || String(fallback || '')).slice(0, maxLength);
}

function normalizeProvider(song) {
  const source = cleanText(song && (song.provider || song.source || song.type), '', 32).toLowerCase();
  if (source === 'spotify' || song && (song.spotifyId || song.spotifyUri)) return 'unsupported';
  if (source === 'local' || song && (song.localFileId || song.localKey || song.localUrl)) return 'local';
  if (source === 'qq') return 'qq';
  if (source === 'kugou' || song && (song.hash || song.fileHash || song.audioHash)) return 'kugou';
  if (source === 'qishui') return 'qishui';
  return 'netease';
}

function cleanValue(value, depth = 0) {
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return cleanText(value, '', 4096);
  if (depth >= 2) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => cleanValue(entry, depth + 1)).filter((entry) => entry !== undefined);
  }
  if (typeof value === 'object') {
    const output = {};
    Object.keys(value).slice(0, 24).forEach((key) => {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
      const cleaned = cleanValue(value[key], depth + 1);
      if (cleaned !== undefined) output[key] = cleaned;
    });
    return output;
  }
  return undefined;
}

function trackIdentity(track) {
  const provider = normalizeProvider(track || {});
  let value = '';
  if (provider === 'local') value = track.localFileId || track.localKey || String(track.id || '').replace(/^local:/, '');
  else if (provider === 'qq') value = track.mid || track.songmid || track.id;
  else if (provider === 'kugou') value = track.hash || track.fileHash || track.audioHash || track.id;
  else if (provider === 'qishui') value = track.id || track.providerSongId || track.trackId || track.track_id;
  else value = track.id;
  value = cleanText(value, '', 512);
  return value ? `${provider}:${provider === 'kugou' ? value.toLowerCase() : value}` : '';
}

function sanitizeTrack(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const provider = normalizeProvider(source);
  if (!ALLOWED_PROVIDERS.has(provider)) return null;
  const track = {};
  TRACK_FIELDS.forEach((key) => {
    if (source[key] == null || source[key] === '') return;
    const cleaned = cleanValue(source[key]);
    if (cleaned !== undefined && cleaned !== '') track[key] = cleaned;
  });
  track.provider = provider;
  track.source = provider;
  if (!track.type) track.type = provider === 'local' ? 'local' : (provider === 'qq' ? 'qq' : 'song');
  track.name = cleanText(track.name || track.title, '未知歌曲', 1000);
  track.title = cleanText(track.title || track.name, track.name, 1000);
  track.artist = cleanText(track.artist, provider === 'local' ? '本地文件' : '未知歌手', 1000);
  const identity = trackIdentity(track);
  if (!identity) return null;
  track.builtInIdentity = identity;
  const serialized = JSON.stringify(track);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_TRACK_BYTES) return null;
  return track;
}

function sanitizePlaylist(source) {
  if (!source || typeof source !== 'object') return null;
  const id = cleanText(source.id, '', 64).toLowerCase();
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const tracks = [];
  const seen = new Set();
  for (const item of Array.isArray(source.tracks) ? source.tracks.slice(0, MAX_TRACKS_PER_PLAYLIST) : []) {
    const track = sanitizeTrack(item);
    if (!track || seen.has(track.builtInIdentity)) continue;
    seen.add(track.builtInIdentity);
    tracks.push(track);
  }
  return {
    id,
    name: cleanText(source.name, '未命名歌单', 80),
    createdAt: Math.max(0, Number(source.createdAt) || Date.now()),
    updatedAt: Math.max(0, Number(source.updatedAt) || Date.now()),
    tracks,
  };
}

class BuiltInPlaylistLibrary {
  constructor(options = {}) {
    this.userDataPath = path.resolve(String(options.userDataPath || process.cwd()));
    this.indexPath = path.join(this.userDataPath, BUILT_IN_PLAYLIST_FILE);
    this.playlists = [];
    this.mutation = Promise.resolve();
    this.loadIndex();
  }

  loadIndex() {
    try {
      const stat = fs.statSync(this.indexPath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_INDEX_BYTES) return;
      const parsed = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
      if (!parsed || parsed.version !== BUILT_IN_PLAYLIST_VERSION || !Array.isArray(parsed.playlists)) return;
      const seen = new Set();
      this.playlists = parsed.playlists.slice(0, MAX_PLAYLISTS).map(sanitizePlaylist).filter((playlist) => {
        if (!playlist || seen.has(playlist.id)) return false;
        seen.add(playlist.id);
        return true;
      });
    } catch (_) {}
  }

  summary(playlist) {
    const first = playlist.tracks[0] || {};
    return {
      id: playlist.id,
      provider: 'mineradio',
      source: 'mineradio',
      builtin: true,
      name: playlist.name,
      creator: 'Mineradio',
      trackCount: playlist.tracks.length,
      cover: cleanText(first.cover, '', 4096),
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
      shelfPane: 'mine',
      subscribed: false,
    };
  }

  listSync() {
    return {
      ok: true,
      version: BUILT_IN_PLAYLIST_VERSION,
      count: this.playlists.length,
      playlists: this.playlists.map((playlist) => this.summary(playlist)),
    };
  }

  page(id, options = {}) {
    const playlist = this.playlists.find((item) => item.id === cleanText(id, '', 64).toLowerCase());
    if (!playlist) return { ok: false, error: 'BUILT_IN_PLAYLIST_NOT_FOUND', playlist: null, tracks: [], total: 0, nextOffset: 0, hasMore: false };
    const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
    const limit = Math.max(1, Math.min(500, Math.floor(Number(options.limit) || 96)));
    const tracks = playlist.tracks.slice(offset, offset + limit).map((track) => ({ ...track }));
    const nextOffset = offset + tracks.length;
    return {
      ok: true,
      playlist: this.summary(playlist),
      tracks,
      total: playlist.tracks.length,
      nextOffset,
      hasMore: nextOffset < playlist.tracks.length,
    };
  }

  async persist(playlists) {
    await fs.promises.mkdir(path.dirname(this.indexPath), { recursive: true });
    const payload = { version: BUILT_IN_PLAYLIST_VERSION, updatedAt: Date.now(), playlists };
    const text = JSON.stringify(payload);
    if (Buffer.byteLength(text, 'utf8') > MAX_INDEX_BYTES) {
      const error = new Error('BUILT_IN_PLAYLIST_INDEX_TOO_LARGE');
      error.code = 'BUILT_IN_PLAYLIST_INDEX_TOO_LARGE';
      throw error;
    }
    const temporary = `${this.indexPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.promises.writeFile(temporary, text, 'utf8');
      await fs.promises.rename(temporary, this.indexPath);
    } catch (error) {
      try { fs.unlinkSync(temporary); } catch (_) {}
      throw error;
    }
  }

  mutate(worker) {
    const operation = async () => {
      const next = this.playlists.map((playlist) => ({ ...playlist, tracks: playlist.tracks.slice() }));
      const result = await worker(next);
      await this.persist(next);
      this.playlists = next;
      return { ...this.listSync(), ...(result || {}) };
    };
    const pending = this.mutation.then(operation, operation);
    this.mutation = pending.catch(() => {});
    return pending;
  }

  create(name) {
    return this.mutate((next) => {
      if (next.length >= MAX_PLAYLISTS) throw Object.assign(new Error('BUILT_IN_PLAYLIST_LIMIT_REACHED'), { code: 'BUILT_IN_PLAYLIST_LIMIT_REACHED' });
      const playlist = { id: crypto.randomBytes(12).toString('hex'), name: cleanText(name, '我的歌单', 80), createdAt: Date.now(), updatedAt: Date.now(), tracks: [] };
      next.unshift(playlist);
      return { playlist: this.summary(playlist) };
    });
  }

  rename(id, name) {
    return this.mutate((next) => {
      const playlist = next.find((item) => item.id === cleanText(id, '', 64).toLowerCase());
      if (!playlist) throw Object.assign(new Error('BUILT_IN_PLAYLIST_NOT_FOUND'), { code: 'BUILT_IN_PLAYLIST_NOT_FOUND' });
      playlist.name = cleanText(name, playlist.name, 80);
      playlist.updatedAt = Date.now();
      return { playlist: this.summary(playlist) };
    });
  }

  delete(id) {
    return this.mutate((next) => {
      const index = next.findIndex((item) => item.id === cleanText(id, '', 64).toLowerCase());
      if (index < 0) throw Object.assign(new Error('BUILT_IN_PLAYLIST_NOT_FOUND'), { code: 'BUILT_IN_PLAYLIST_NOT_FOUND' });
      const removed = next.splice(index, 1)[0];
      return { removedId: removed.id };
    });
  }

  addTrack(id, source) {
    const track = sanitizeTrack(source);
    if (!track) return Promise.reject(Object.assign(new Error('BUILT_IN_PLAYLIST_TRACK_INVALID'), { code: 'BUILT_IN_PLAYLIST_TRACK_INVALID' }));
    return this.mutate((next) => {
      const playlist = next.find((item) => item.id === cleanText(id, '', 64).toLowerCase());
      if (!playlist) throw Object.assign(new Error('BUILT_IN_PLAYLIST_NOT_FOUND'), { code: 'BUILT_IN_PLAYLIST_NOT_FOUND' });
      if (playlist.tracks.some((item) => item.builtInIdentity === track.builtInIdentity)) return { playlist: this.summary(playlist), duplicate: true };
      if (playlist.tracks.length >= MAX_TRACKS_PER_PLAYLIST) throw Object.assign(new Error('BUILT_IN_PLAYLIST_TRACK_LIMIT_REACHED'), { code: 'BUILT_IN_PLAYLIST_TRACK_LIMIT_REACHED' });
      playlist.tracks.push(track);
      playlist.updatedAt = Date.now();
      return { playlist: this.summary(playlist), added: true };
    });
  }

  removeTrack(id, index) {
    return this.mutate((next) => {
      const playlist = next.find((item) => item.id === cleanText(id, '', 64).toLowerCase());
      if (!playlist) throw Object.assign(new Error('BUILT_IN_PLAYLIST_NOT_FOUND'), { code: 'BUILT_IN_PLAYLIST_NOT_FOUND' });
      const target = Math.floor(Number(index));
      if (!Number.isFinite(target) || target < 0 || target >= playlist.tracks.length) throw Object.assign(new Error('BUILT_IN_PLAYLIST_TRACK_NOT_FOUND'), { code: 'BUILT_IN_PLAYLIST_TRACK_NOT_FOUND' });
      playlist.tracks.splice(target, 1);
      playlist.updatedAt = Date.now();
      return { playlist: this.summary(playlist), removedIndex: target };
    });
  }

  reorderTrack(id, fromIndex, toIndex) {
    return this.mutate((next) => {
      const playlist = next.find((item) => item.id === cleanText(id, '', 64).toLowerCase());
      if (!playlist) throw Object.assign(new Error('BUILT_IN_PLAYLIST_NOT_FOUND'), { code: 'BUILT_IN_PLAYLIST_NOT_FOUND' });
      const from = Math.floor(Number(fromIndex));
      const to = Math.floor(Number(toIndex));
      if (![from, to].every(Number.isFinite) || from < 0 || from >= playlist.tracks.length || to < 0 || to >= playlist.tracks.length) {
        throw Object.assign(new Error('BUILT_IN_PLAYLIST_TRACK_NOT_FOUND'), { code: 'BUILT_IN_PLAYLIST_TRACK_NOT_FOUND' });
      }
      const track = playlist.tracks.splice(from, 1)[0];
      playlist.tracks.splice(to, 0, track);
      playlist.updatedAt = Date.now();
      return { playlist: this.summary(playlist) };
    });
  }
}

module.exports = {
  BUILT_IN_PLAYLIST_FILE,
  BUILT_IN_PLAYLIST_VERSION,
  BuiltInPlaylistLibrary,
  sanitizeTrack,
  trackIdentity,
};
