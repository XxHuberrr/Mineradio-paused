const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

const LOCAL_MUSIC_SCHEME = 'mineradio-local';
const LOCAL_LIBRARY_VERSION = 1;
const LOCAL_LIBRARY_FILE = 'local-music-library.json';
const LOCAL_LIBRARY_DIRECTORY = 'local-music-library';
const LOCAL_COVER_DIRECTORY = 'covers';
const MAX_LIBRARY_INDEX_BYTES = 16 * 1024 * 1024;
const MAX_LYRIC_BYTES = 512 * 1024;
const MAX_COVER_BYTES = 6 * 1024 * 1024;
const MAX_UNKNOWN_DIMENSION_COVER_BYTES = 1024 * 1024;
const MAX_COVER_DIMENSION = 4096;
const MAX_COVER_PIXELS = 12 * 1024 * 1024;
const MAX_IMPORT_FILES = 50000;
const METADATA_CONCURRENCY = 3;

const AUDIO_MIME = new Map([
  ['.mp3', 'audio/mpeg'],
  ['.flac', 'audio/flac'],
  ['.wav', 'audio/wav'],
  ['.ogg', 'audio/ogg'],
  ['.m4a', 'audio/mp4'],
  ['.aac', 'audio/aac'],
  ['.opus', 'audio/ogg'],
]);
const COVER_EXTENSION_BY_MIME = new Map([
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/bmp', '.bmp'],
]);
const COVER_MIME_BY_EXTENSION = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.bmp', 'image/bmp'],
]);

let musicMetadataModulePromise = null;

function registerLocalMusicScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{
    scheme: LOCAL_MUSIC_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  }]);
}

function normalizedAbsoluteFilePath(value) {
  const input = String(value || '').trim();
  if (!input || /^[\\/]{2}/.test(input) || !path.isAbsolute(input)) return '';
  return path.resolve(input);
}

function normalizedPathIdentity(value) {
  const resolved = normalizedAbsoluteFilePath(value);
  if (!resolved) return '';
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function supportedAudioPath(value) {
  const resolved = normalizedAbsoluteFilePath(value);
  return resolved && AUDIO_MIME.has(path.extname(resolved).toLowerCase()) ? resolved : '';
}

function cleanText(value, fallback, maxLength = 1000) {
  const text = String(value == null ? '' : value).replace(/\0/g, '').trim();
  return (text || String(fallback || '')).slice(0, maxLength);
}

function localFileId(filePath) {
  return crypto.createHash('sha256').update(normalizedPathIdentity(filePath)).digest('hex').slice(0, 24);
}

function audioRevision(stat) {
  return `${Math.max(0, Math.round(Number(stat && stat.mtimeMs) || 0)).toString(36)}-${Math.max(0, Number(stat && stat.size) || 0).toString(36)}`;
}

function localMediaUrl(kind, id, revision, capability) {
  const query = new URLSearchParams();
  if (revision) query.set('v', revision);
  if (capability) query.set('cap', capability);
  return `${LOCAL_MUSIC_SCHEME}://${kind}/${encodeURIComponent(id)}${query.size ? `?${query.toString()}` : ''}`;
}

function isPathInside(root, candidate) {
  const rootPath = path.resolve(root);
  const targetPath = path.resolve(candidate);
  const relative = path.relative(rootPath, targetPath);
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function safeUnlink(filePath) {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch (_) {}
}

function embeddedImageDimensions(data, mime) {
  if (!Buffer.isBuffer(data) || data.length < 10) return null;
  const normalizedMime = String(mime || '').toLowerCase();
  if (normalizedMime === 'image/png' && data.length >= 24 && data.toString('ascii', 1, 4) === 'PNG') {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (normalizedMime === 'image/gif') {
    return { width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
  }
  if (normalizedMime === 'image/bmp' && data.length >= 26) {
    return { width: Math.abs(data.readInt32LE(18)), height: Math.abs(data.readInt32LE(22)) };
  }
  if ((normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg') && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) { offset += 1; continue; }
      const marker = data[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const length = data.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > data.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  if (normalizedMime === 'image/webp' && data.length >= 30 && data.toString('ascii', 0, 4) === 'RIFF') {
    const kind = data.toString('ascii', 12, 16);
    if (kind === 'VP8X') {
      return {
        width: 1 + data.readUIntLE(24, 3),
        height: 1 + data.readUIntLE(27, 3),
      };
    }
    if (kind === 'VP8L' && data[20] === 0x2f) {
      const bits = data.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

function coverWithinBudget(data, mime) {
  if (!Buffer.isBuffer(data) || !data.length || data.length > MAX_COVER_BYTES) return false;
  const dimensions = embeddedImageDimensions(data, mime);
  if (!dimensions) return data.length <= MAX_UNKNOWN_DIMENSION_COVER_BYTES;
  const width = Number(dimensions.width) || 0;
  const height = Number(dimensions.height) || 0;
  return width > 0
    && height > 0
    && width <= MAX_COVER_DIMENSION
    && height <= MAX_COVER_DIMENSION
    && width * height <= MAX_COVER_PIXELS;
}

function parseByteRange(value, size) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(text);
  if (!match || (!match[1] && !match[2]) || size <= 0) return { invalid: true };
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return { invalid: true };
    start = Math.max(0, size - Math.floor(suffix));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return { invalid: true };
    start = Math.floor(start);
    end = Math.min(size - 1, Math.floor(end));
  }
  if (start < 0 || end < start || start >= size) return { invalid: true };
  return { start, end };
}

function decodeLyricBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer || []);
  if (!buffer.length) return '';
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8').replace(/\0/g, '').trim();
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le').replace(/\0/g, '').trim();
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length - 2);
    for (let i = 2; i + 1 < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1];
      swapped[i - 1] = buffer[i];
    }
    return swapped.toString('utf16le').replace(/\0/g, '').trim();
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/\0/g, '').trim();
  } catch (_) {
    try {
      return new TextDecoder('gb18030').decode(buffer).replace(/\0/g, '').trim();
    } catch (_) {
      return buffer.toString('utf8').replace(/\0/g, '').trim();
    }
  }
}

function formatLrcTimestamp(timestamp) {
  const totalMs = Math.max(0, Math.round(Number(timestamp) || 0));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}]`;
}

function embeddedLyricText(common) {
  const lyrics = Array.isArray(common && common.lyrics) ? common.lyrics : [];
  for (const item of lyrics) {
    const syncText = Array.isArray(item && item.syncText) ? item.syncText : [];
    if (syncText.length) {
      const lines = syncText
        .filter((line) => line && String(line.text || '').trim())
        .map((line) => `${formatLrcTimestamp(line.timestamp)}${String(line.text || '').trim()}`);
      if (lines.length) return lines.join('\n').slice(0, MAX_LYRIC_BYTES);
    }
    const text = cleanText(item && item.text, '', MAX_LYRIC_BYTES);
    if (text) return text;
  }
  return '';
}

function normalizeImportEntries(input) {
  const entries = [];
  const seen = new Set();
  for (const item of Array.isArray(input) ? input.slice(0, MAX_IMPORT_FILES) : []) {
    const requestedPath = typeof item === 'string' ? item : item && item.path;
    const filePath = supportedAudioPath(requestedPath);
    const identity = normalizedPathIdentity(filePath);
    if (!filePath || !identity || seen.has(identity)) continue;
    seen.add(identity);
    entries.push({
      path: filePath,
      relativePath: cleanText(item && item.relativePath, path.basename(filePath), 2000),
    });
  }
  return entries;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = new Array(Math.min(Math.max(1, limit), items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function defaultParseMetadata(filePath) {
  if (!musicMetadataModulePromise) musicMetadataModulePromise = import('music-metadata');
  const module = await musicMetadataModulePromise;
  return module.parseFile(filePath, { duration: true, skipCovers: false });
}

async function buildLrcSidecarIndex(entries) {
  const directories = Array.from(new Set(entries.map((entry) => path.dirname(entry.path))));
  const maps = new Map();
  await mapWithConcurrency(directories, METADATA_CONCURRENCY, async (directory) => {
    const lookup = new Map();
    try {
      const names = await fs.promises.readdir(directory);
      for (const name of names) {
        if (path.extname(name).toLowerCase() !== '.lrc') continue;
        lookup.set(path.basename(name, path.extname(name)).toLowerCase(), path.join(directory, name));
      }
    } catch (_) {}
    maps.set(normalizedPathIdentity(directory), lookup);
  });
  return maps;
}

class LocalMusicLibrary {
  constructor(options = {}) {
    this.userDataPath = path.resolve(String(options.userDataPath || process.cwd()));
    this.libraryDirectory = path.join(this.userDataPath, LOCAL_LIBRARY_DIRECTORY);
    this.coverDirectory = path.join(this.libraryDirectory, LOCAL_COVER_DIRECTORY);
    this.indexPath = path.join(this.userDataPath, LOCAL_LIBRARY_FILE);
    this.parseMetadata = typeof options.parseMetadata === 'function' ? options.parseMetadata : defaultParseMetadata;
    this.records = new Map();
    this.order = [];
    this.mediaToken = crypto.randomBytes(24).toString('hex');
    this.protocolInstalled = false;
    this.mutation = Promise.resolve();
    this.loadIndex();
  }

  loadIndex() {
    try {
      const stat = fs.statSync(this.indexPath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_LIBRARY_INDEX_BYTES) return;
      const parsed = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
      if (!parsed || parsed.version !== LOCAL_LIBRARY_VERSION || !Array.isArray(parsed.records)) return;
      if (/^[a-f0-9]{48}$/i.test(String(parsed.mediaToken || ''))) this.mediaToken = String(parsed.mediaToken).toLowerCase();
      const nextRecords = new Map();
      const nextOrder = [];
      for (const source of parsed.records.slice(0, MAX_IMPORT_FILES)) {
        const audioPath = supportedAudioPath(source && source.audioPath);
        const id = cleanText(source && source.id, '', 64).toLowerCase();
        if (!audioPath || !/^[a-f0-9]{24}$/.test(id) || id !== localFileId(audioPath) || nextRecords.has(id)) continue;
        let coverPath = normalizedAbsoluteFilePath(source.coverPath);
        if (!coverPath || !isPathInside(this.coverDirectory, coverPath)) coverPath = '';
        const record = {
          id,
          audioPath,
          relativePath: cleanText(source.relativePath, path.basename(audioPath), 2000),
          name: cleanText(source.name, path.basename(audioPath, path.extname(audioPath)), 1000),
          artist: cleanText(source.artist, '本地文件', 1000),
          album: cleanText(source.album, '', 1000),
          duration: Math.max(0, Number(source.duration) || 0),
          size: Math.max(0, Number(source.size) || 0),
          mtimeMs: Math.max(0, Number(source.mtimeMs) || 0),
          revision: cleanText(source.revision, '', 100),
          coverPath,
          coverMime: cleanText(source.coverMime, '', 100),
          lyric: cleanText(source.lyric, '', MAX_LYRIC_BYTES),
          lyricSource: source.lyricSource === 'sidecar' ? 'sidecar' : (source.lyricSource === 'embedded' ? 'embedded' : ''),
          importedAt: Math.max(0, Number(source.importedAt) || 0),
        };
        nextRecords.set(id, record);
        nextOrder.push(id);
      }
      this.records = nextRecords;
      this.order = nextOrder;
    } catch (_) {}
  }

  serializeRecord(record) {
    const coverAvailable = !!record.coverPath;
    return {
      type: 'local',
      source: 'local',
      provider: 'local',
      id: `local:${record.id}`,
      localFileId: record.id,
      localKey: record.id,
      localUrl: localMediaUrl('audio', record.id, record.revision, this.mediaToken),
      localPath: record.relativePath || path.basename(record.audioPath),
      localMissing: false,
      name: record.name,
      title: record.name,
      artist: record.artist || '本地文件',
      album: record.album || '',
      duration: Math.max(0, Number(record.duration) || 0),
      cover: coverAvailable ? localMediaUrl('cover', record.id, record.revision, this.mediaToken) : '',
      hasLyric: !!record.lyric,
      lyricSource: record.lyricSource || '',
    };
  }

  listTracksSync() {
    const tracks = [];
    for (const id of this.order) {
      const record = this.records.get(id);
      if (record) tracks.push(this.serializeRecord(record));
    }
    return { ok: true, version: LOCAL_LIBRARY_VERSION, count: tracks.length, tracks };
  }

  async listTracks() {
    const tracks = [];
    for (let index = 0; index < this.order.length; index += 1) {
      const record = this.records.get(this.order[index]);
      if (record) tracks.push(this.serializeRecord(record));
      if (index > 0 && index % 400 === 0) await new Promise((resolve) => setImmediate(resolve));
    }
    return { ok: true, version: LOCAL_LIBRARY_VERSION, count: tracks.length, tracks };
  }

  lyricForTrack(value) {
    const id = cleanText(value, '', 64).replace(/^local:/, '').toLowerCase();
    if (!/^[a-f0-9]{24}$/.test(id)) return { ok: false, localFileId: '', lyric: '', lyricSource: '', error: 'LOCAL_TRACK_INVALID' };
    const record = this.records.get(id);
    if (!record) return { ok: false, localFileId: id, lyric: '', lyricSource: '', missing: true, error: 'LOCAL_TRACK_MISSING' };
    return {
      ok: true,
      localFileId: id,
      lyric: record.lyric || '',
      lyricSource: record.lyricSource || '',
    };
  }

  async stageSnapshot(order, records) {
    await fs.promises.mkdir(path.dirname(this.indexPath), { recursive: true });
    const payload = {
      version: LOCAL_LIBRARY_VERSION,
      updatedAt: Date.now(),
      mediaToken: this.mediaToken,
      records: order.map((id) => records.get(id)).filter(Boolean),
    };
    const text = JSON.stringify(payload);
    if (Buffer.byteLength(text, 'utf8') > MAX_LIBRARY_INDEX_BYTES) {
      const error = new Error('LOCAL_LIBRARY_INDEX_TOO_LARGE');
      error.code = 'LOCAL_LIBRARY_INDEX_TOO_LARGE';
      throw error;
    }
    const temporary = `${this.indexPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.promises.writeFile(temporary, text, 'utf8');
      return temporary;
    } catch (error) {
      safeUnlink(temporary);
      throw error;
    }
  }

  async persistSnapshot(order, records) {
    const temporary = await this.stageSnapshot(order, records);
    try {
      await fs.promises.rename(temporary, this.indexPath);
    } catch (error) {
      safeUnlink(temporary);
      throw error;
    }
  }

  async stageCover(id, picture, previous) {
    if (!picture) return { path: '', mime: '' };
    const mime = cleanText(picture && picture.format, '', 100).toLowerCase();
    const extension = COVER_EXTENSION_BY_MIME.get(mime);
    const data = picture && picture.data ? Buffer.from(picture.data) : null;
    if (!extension || !coverWithinBudget(data, mime)) {
      return {
        path: previous && previous.coverPath || '',
        mime: previous && previous.coverMime || '',
        rejected: !!(extension && data && data.length),
      };
    }
    await fs.promises.mkdir(this.coverDirectory, { recursive: true });
    const digest = crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
    const target = path.join(this.coverDirectory, `${id}-${digest}${extension}`);
    if (fs.existsSync(target)) return { path: target, mime };
    const temporary = path.join(this.coverDirectory, `.${id}-${digest}.${process.pid}.${Date.now()}.stage`);
    await fs.promises.writeFile(temporary, data);
    return { path: target, mime, stagedPath: temporary };
  }

  async parseEntry(entry, sidecarDirectories) {
    const stat = await fs.promises.stat(entry.path);
    if (!stat.isFile()) {
      const error = new Error('LOCAL_AUDIO_NOT_FILE');
      error.code = 'LOCAL_AUDIO_NOT_FILE';
      throw error;
    }
    const id = localFileId(entry.path);
    const previous = this.records.get(id);
    let metadata = {};
    let metadataError = '';
    try {
      metadata = await this.parseMetadata(entry.path) || {};
    } catch (error) {
      metadataError = String(error && error.message || error || 'METADATA_PARSE_FAILED').slice(0, 500);
    }
    const common = metadata.common || {};
    const format = metadata.format || {};
    const fallbackTitle = path.basename(entry.path, path.extname(entry.path));
    const artists = Array.isArray(common.artists) ? common.artists.filter(Boolean).join(' / ') : '';
    const picture = Array.isArray(common.picture) && common.picture.length ? common.picture[0] : null;
    const cover = metadataError
      ? {
        path: previous && previous.coverPath || '',
        mime: previous && previous.coverMime || '',
      }
      : await this.stageCover(id, picture, previous);
    const directoryLookup = sidecarDirectories.get(normalizedPathIdentity(path.dirname(entry.path)));
    const sidecarPath = directoryLookup && directoryLookup.get(fallbackTitle.toLowerCase());
    let lyric = '';
    let lyricSource = '';
    if (sidecarPath) {
      try {
        const lyricStat = await fs.promises.stat(sidecarPath);
        if (lyricStat.isFile() && lyricStat.size > 0 && lyricStat.size <= MAX_LYRIC_BYTES) {
          lyric = decodeLyricBuffer(await fs.promises.readFile(sidecarPath)).slice(0, MAX_LYRIC_BYTES);
          if (lyric) lyricSource = 'sidecar';
        }
      } catch (_) {}
    }
    if (!lyric) {
      lyric = embeddedLyricText(common);
      if (lyric) lyricSource = 'embedded';
    }
    if (!lyric && metadataError && previous && previous.lyric) {
      lyric = previous.lyric;
      lyricSource = previous.lyricSource || '';
    }
    const relativeDirectory = path.dirname(entry.relativePath || '');
    const fallbackAlbum = relativeDirectory && relativeDirectory !== '.' ? relativeDirectory.split(/[\\/]/).join(' / ') : '';
    return {
      record: {
        id,
        audioPath: entry.path,
        relativePath: entry.relativePath || path.basename(entry.path),
        name: cleanText(common.title, metadataError && previous ? previous.name : fallbackTitle, 1000),
        artist: cleanText(common.artist || artists, metadataError && previous ? previous.artist : '本地文件', 1000),
        album: cleanText(common.album, metadataError && previous ? previous.album : fallbackAlbum, 1000),
        duration: Math.max(0, Number(format.duration) || (metadataError && previous ? Number(previous.duration) : 0) || 0),
        size: Math.max(0, Number(stat.size) || 0),
        mtimeMs: Math.max(0, Number(stat.mtimeMs) || 0),
        revision: audioRevision(stat),
        coverPath: cover.path,
        coverMime: cover.mime,
        lyric,
        lyricSource,
        importedAt: Date.now(),
      },
      metadataError,
      coverWarning: cover.rejected ? 'LOCAL_COVER_REJECTED_BY_BUDGET' : '',
      stagedCoverPath: cover.stagedPath || '',
      previousCoverPath: previous && previous.coverPath || '',
    };
  }

  importFiles(input, options = {}) {
    const entries = normalizeImportEntries(input);
    const replace = options.replace === true;
    const operation = async () => {
      if (!entries.length) return { ok: false, count: 0, tracks: [], failures: [], error: 'NO_SUPPORTED_LOCAL_AUDIO' };
      const sidecarDirectories = await buildLrcSidecarIndex(entries);
      const parsed = await mapWithConcurrency(entries, METADATA_CONCURRENCY, async (entry) => {
        try {
          return await this.parseEntry(entry, sidecarDirectories);
        } catch (error) {
          return {
            failure: {
              name: path.basename(entry.path),
              error: String(error && (error.code || error.message) || error || 'LOCAL_IMPORT_FAILED').slice(0, 500),
            },
          };
        }
      });
      const nextRecords = replace ? new Map() : new Map(this.records);
      const nextOrder = replace ? [] : this.order.slice();
      const failures = [];
      const metadataWarnings = [];
      const stagedCovers = [];
      const cleanupAfterCommit = new Set();
      for (const result of parsed) {
        if (!result || result.failure) {
          if (result && result.failure) failures.push(result.failure);
          continue;
        }
        const record = result.record;
        nextRecords.set(record.id, record);
        const previousIndex = nextOrder.indexOf(record.id);
        if (previousIndex >= 0) nextOrder.splice(previousIndex, 1);
        nextOrder.push(record.id);
        if (result.metadataError) metadataWarnings.push({ name: path.basename(record.audioPath), error: result.metadataError });
        if (result.coverWarning) metadataWarnings.push({ name: path.basename(record.audioPath), error: result.coverWarning });
        if (result.stagedCoverPath) {
          stagedCovers.push({ stagedPath: result.stagedCoverPath, targetPath: record.coverPath });
        }
        if (
          result.previousCoverPath
          && (!record.coverPath || path.resolve(result.previousCoverPath) !== path.resolve(record.coverPath))
        ) {
          cleanupAfterCommit.add(result.previousCoverPath);
        }
      }
      if (!nextOrder.length) {
        for (const cover of stagedCovers) safeUnlink(cover.stagedPath);
        return { ok: false, count: 0, tracks: [], failures, metadataWarnings, error: 'LOCAL_IMPORT_FAILED' };
      }
      const removedRecords = replace
        ? this.order.filter((id) => !nextRecords.has(id)).map((id) => this.records.get(id)).filter(Boolean)
        : [];
      for (const record of removedRecords) if (record.coverPath) cleanupAfterCommit.add(record.coverPath);
      let snapshotTemporary = '';
      const createdCoverTargets = [];
      try {
        snapshotTemporary = await this.stageSnapshot(nextOrder, nextRecords);
        for (const cover of stagedCovers) {
          if (fs.existsSync(cover.targetPath)) {
            safeUnlink(cover.stagedPath);
            continue;
          }
          await fs.promises.rename(cover.stagedPath, cover.targetPath);
          createdCoverTargets.push(cover.targetPath);
        }
        await fs.promises.rename(snapshotTemporary, this.indexPath);
        snapshotTemporary = '';
      } catch (error) {
        safeUnlink(snapshotTemporary);
        for (const cover of stagedCovers) safeUnlink(cover.stagedPath);
        for (const target of createdCoverTargets) safeUnlink(target);
        throw error;
      }
      this.records = nextRecords;
      this.order = nextOrder;
      for (const oldCoverPath of cleanupAfterCommit) safeUnlink(oldCoverPath);
      const snapshot = this.listTracksSync();
      return { ...snapshot, failures, metadataWarnings };
    };
    const pending = this.mutation.then(operation, operation);
    this.mutation = pending.catch(() => {});
    return pending;
  }

  removeTracks(ids) {
    const requested = new Set((Array.isArray(ids) ? ids : [ids])
      .map((id) => cleanText(id, '', 64).replace(/^local:/, '').toLowerCase())
      .filter((id) => /^[a-f0-9]{24}$/.test(id)));
    const operation = async () => {
      if (!requested.size) return this.listTracksSync();
      const nextRecords = new Map(this.records);
      const removed = [];
      for (const id of requested) {
        const record = nextRecords.get(id);
        if (record) removed.push(record);
        nextRecords.delete(id);
      }
      const nextOrder = this.order.filter((id) => nextRecords.has(id));
      await this.persistSnapshot(nextOrder, nextRecords);
      this.records = nextRecords;
      this.order = nextOrder;
      for (const record of removed) safeUnlink(record.coverPath);
      return this.listTracksSync();
    };
    const pending = this.mutation.then(operation, operation);
    this.mutation = pending.catch(() => {});
    return pending;
  }

  recordForRequest(requestUrl) {
    try {
      const url = new URL(requestUrl);
      const kind = url.hostname === 'audio' ? 'audio' : (url.hostname === 'cover' ? 'cover' : '');
      const id = decodeURIComponent(url.pathname.replace(/^\/+/, '')).toLowerCase();
      if (!kind || !/^[a-f0-9]{24}$/.test(id) || url.searchParams.get('cap') !== this.mediaToken) return null;
      const record = this.records.get(id);
      if (!record) return null;
      const filePath = kind === 'audio' ? record.audioPath : record.coverPath;
      if (!filePath) return null;
      if (kind === 'audio' && !supportedAudioPath(filePath)) return null;
      if (kind === 'cover' && (!isPathInside(this.coverDirectory, filePath) || !COVER_MIME_BY_EXTENSION.has(path.extname(filePath).toLowerCase()))) return null;
      return { record, kind, filePath };
    } catch (_) {
      return null;
    }
  }

  async mediaResponse(request) {
    const method = String(request && request.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD', 'X-Content-Type-Options': 'nosniff' },
      });
    }
    const target = this.recordForRequest(request && request.url);
    if (!target) return new Response('Not found', { status: 404, headers: { 'X-Content-Type-Options': 'nosniff' } });
    let stat;
    try {
      stat = await fs.promises.stat(target.filePath);
      if (!stat.isFile()) throw new Error('NOT_FILE');
    } catch (_) {
      return new Response('Not found', { status: 404, headers: { 'X-Content-Type-Options': 'nosniff' } });
    }
    const size = Math.max(0, Number(stat.size) || 0);
    const rangeHeader = request.headers && request.headers.get ? request.headers.get('range') : '';
    const range = rangeHeader ? parseByteRange(rangeHeader, size) : null;
    if (range && range.invalid) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}`, 'X-Content-Type-Options': 'nosniff' },
      });
    }
    const start = range ? range.start : 0;
    const end = range ? range.end : Math.max(0, size - 1);
    const extension = path.extname(target.filePath).toLowerCase();
    const contentType = target.kind === 'audio'
      ? (AUDIO_MIME.get(extension) || 'application/octet-stream')
      : (target.record.coverMime || COVER_MIME_BY_EXTENSION.get(extension) || 'application/octet-stream');
    const headers = {
      'Content-Type': contentType,
      'Content-Length': String(size ? end - start + 1 : 0),
      'Accept-Ranges': 'bytes',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    };
    const origin = request.headers && request.headers.get ? String(request.headers.get('origin') || '') : '';
    if (/^http:\/\/127\.0\.0\.1:\d+$/i.test(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers.Vary = 'Origin';
    }
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    if (method === 'HEAD' || !size) return new Response(null, { status: range ? 206 : 200, headers });
    const stream = fs.createReadStream(target.filePath, { start, end });
    return new Response(Readable.toWeb(stream), { status: range ? 206 : 200, headers });
  }

  async installProtocol(protocol) {
    if (this.protocolInstalled) return;
    await protocol.handle(LOCAL_MUSIC_SCHEME, (request) => this.mediaResponse(request));
    this.protocolInstalled = true;
  }
}

module.exports = {
  AUDIO_MIME,
  LOCAL_MUSIC_SCHEME,
  LocalMusicLibrary,
  coverWithinBudget,
  decodeLyricBuffer,
  embeddedImageDimensions,
  embeddedLyricText,
  localFileId,
  parseByteRange,
  registerLocalMusicScheme,
};
