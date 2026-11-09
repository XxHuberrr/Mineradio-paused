// ====================================================================
//  粒子音乐可视化播放器 — Server v2
//  - 网易云搜索 / 歌曲URL / 封面/音频代理
//  - 扫码登录 (login_qr_*) + cookie 持久化 (./.cookie)
//  - 试听检测 (freeTrialInfo) + 全 quality 探测
//  - 所有受保护 API 都会带上已登录用户的 cookie
// ====================================================================
const {
  search,
  cloudsearch,
  song_detail,
  song_url,
  song_url_v1,
  login_qr_key,
  login_qr_create,
  login_qr_check,
  login_status,
  vip_info,
  vip_info_v2,
  logout,
  user_account,
  user_playlist,
  comment_music,
  album,
  artist_detail,
  artist_top_song,
  artist_songs,
  like: like_song,
  likelist,
  song_like_check,
  album_sub,
  album_sublist,
  playlist_subscribe,
  comment,
  comment_like,
  scrobble,
  listen_data_total,
  playlist_tracks,
  playlist_track_add,
  playlist_create,
  playlist_detail,
  playlist_track_all,
  personalized,
  recommend_resource,
  recommend_songs,
  dj_detail,
  dj_program,
  dj_hot,
  dj_sublist,
  user_audio,
  dj_paygift,
  record_recent_voice,
  sati_resource_sub_list,
  lyric,
  lyric_new,
} = require('NeteaseCloudMusicApi');
const http = require('http');
const https = require('https');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const tls = require('tls');
const { fileURLToPath } = require('url');
const { analyzePodcastDjStream, analyzePodcastDjIntro } = require('./dj-analyzer');
const { TrackDecryptor } = require('./qishui-audio-decryptor/track-decryptor');
const {
  normalizeQQVipPayload: normalizeQQVipPayloadStrict,
  resolveQQVipFromProbes,
  qqVipSessionCacheKey,
  qqVipCacheTtlMs,
  qqVipEntitlementRights,
  preserveQQVipStalePositive,
  qqVipObjectLooksExpired: qqVipObjectLooksExpiredStrict,
} = require('./qq-vip-api');
const {
  handleKugouSearch,
  handleKugouSongUrl,
  handleKugouLyric,
  handleKugouGuessLike,
  handleKugouUserPlaylists,
  handleKugouPlaylistTracks,
  handleKugouLikeCheck,
  handleKugouLikeToggle,
  handleKugouPlaylistAddSong,
  getKugouLoginInfo,
  normalizeKugouCookieInput,
  clearKugouSessionCaches,
  kugouCookieHasPlayback,
  extractKugouAuth,
  kugouAudioReferer,
} = require('./kugou-api');
const {
  getQishuiStatus,
  handleQishuiStatus,
  normalizeQishuiCookieInput,
  qishuiCookieHasLogin,
  clearQishuiAccessToken,
  handleQishuiSearch,
  handleQishuiFeed,
  handleQishuiUserPlaylists,
  handleQishuiPlaylistTracks,
  handleQishuiCheckTracksLiked,
  handleQishuiSetTrackLiked,
  handleQishuiSetPlaylistCollected,
  handleQishuiPlaylistAddSong,
  handleQishuiSetAlbumCollected,
  handleQishuiReportRecentlyPlayed,
  handleQishuiComments,
  handleQishuiCreateComment,
  handleQishuiLyric,
  handleQishuiSongUrl,
} = require('./qishui-api');
const qishuiQrLogin = require('./qishui-qr-login');
const { clearSpotifyToken } = require('./spotify-api');
const {
  appendCuefieldFeedback,
  readCuefieldFeedbackStats,
} = require('./cuefield/feedback-log');
const { planCuefieldTransitionFromCache } = require('./cuefield/mineradio-bridge');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const LOGIN_EASTER_EGG_GATE_FILE = String(process.env.MINERADIO_LOGIN_EASTER_EGG_GATE_FILE || '');
const LOGIN_EASTER_EGG_GATE_VERSION = String(process.env.MINERADIO_LOGIN_EASTER_EGG_GATE_VERSION || 'world-peace-v1');
const LOGIN_EASTER_EGG_PROTECTED_ROUTES = new Set([
  '/api/login/cookie',
  '/api/login/qr/key',
  '/api/login/qr/create',
  '/api/login/qr/check',
  '/api/qq/login/cookie',
  '/api/kugou/login/cookie',
  '/api/qishui/login/qrcode',
  '/api/qishui/login/check',
]);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_COOKIE_FILE = path.join(__dirname, '.cookie');
const DEFAULT_QQ_COOKIE_FILE = path.join(__dirname, '.qq-cookie');
const DEFAULT_KUGOU_COOKIE_FILE = path.join(__dirname, '.kugou-cookie');
const DEFAULT_QISHUI_COOKIE_FILE = path.join(__dirname, '.qishui-cookie');
const BEATMAP_CACHE_DIR = process.env.MINERADIO_BEAT_CACHE_DIR || 'D:\\MineradioCache\\beatmaps';
const CUEFIELD_FEEDBACK_FILE = process.env.CUEFIELD_FEEDBACK_FILE || path.join(__dirname, 'data', 'cuefield-feedback.jsonl');
const LISTEN_SYNC_JOURNAL_FILE = process.env.MINERADIO_LISTEN_SYNC_FILE || path.join(__dirname, 'data', 'listen-sync-journal.json');
const LISTEN_SYNC_JOURNAL_LIMIT = 600;
const APP_PACKAGE = readPackageInfo();
const APP_VERSION = process.env.MINERADIO_VERSION || APP_PACKAGE.version || '2.2.0';
const UPDATE_CONFIG = readUpdateConfig(APP_PACKAGE);
const qishuiAudioDecryptor = new TrackDecryptor();
const qishuiAudioDecryptCache = new Map();
const QISHUI_AUDIO_DECRYPT_CACHE_MAX_BYTES = 96 * 1024 * 1024;
let qishuiAudioDecryptCacheBytes = 0;
const UPDATE_FALLBACK_NOTES = [
  '本次下载入口已更换，请使用公告中的新网盘链接，并更新旧收藏。',
  '修复音乐接口的登录、账号识别与播放稳定性问题。',
];
const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_IP_LOCATION_URL = 'http://ip-api.com/json/';
const WEATHER_DEFAULT_LOCATION = {
  name: '上海',
  country: 'China',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai',
};

function loadListenSyncJournal() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LISTEN_SYNC_JOURNAL_FILE, 'utf8'));
    const entries = parsed && parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
    return { version: 1, entries };
  } catch (_) {
    return { version: 1, entries: {} };
  }
}

let listenSyncJournal = loadListenSyncJournal();

function listenSyncAccountKey(provider, credential) {
  return String(provider || '') + ':' + crypto.createHash('sha256').update(String(credential || '')).digest('hex').slice(0, 16);
}

function listenSyncJournalKey(provider, credential, sessionId) {
  return listenSyncAccountKey(provider, credential) + ':' + String(sessionId || '');
}

function persistListenSyncJournal() {
  const entries = Object.entries(listenSyncJournal.entries || {})
    .sort((a, b) => Number(b[1] && b[1].submittedAt || 0) - Number(a[1] && a[1].submittedAt || 0))
    .slice(0, LISTEN_SYNC_JOURNAL_LIMIT);
  listenSyncJournal.entries = Object.fromEntries(entries);
  const dir = path.dirname(LISTEN_SYNC_JOURNAL_FILE);
  const temp = LISTEN_SYNC_JOURNAL_FILE + '.tmp-' + process.pid;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(temp, JSON.stringify(listenSyncJournal, null, 2), 'utf8');
  fs.renameSync(temp, LISTEN_SYNC_JOURNAL_FILE);
}

function rememberListenSyncSubmission(key, result) {
  listenSyncJournal.entries[key] = {
    provider: result.provider,
    songId: String(result.songId || ''),
    submittedAt: Date.now(),
    accountDurationSync: result.accountDurationSync || 'unsupported',
    historySynced: !!result.historySynced,
  };
  try {
    persistListenSyncJournal();
  } catch (err) {
    console.warn('[ListenSyncJournal]', err.message);
  }
}

function applySystemCertificateAuthorities() {
  try {
    if (typeof tls.getCACertificates !== 'function' || typeof tls.setDefaultCACertificates !== 'function') return;
    const bundled = tls.getCACertificates('default') || [];
    const system = tls.getCACertificates('system') || [];
    if (!system.length) return;
    const seen = new Set();
    const merged = [];
    bundled.concat(system).forEach(cert => {
      if (!cert || seen.has(cert)) return;
      seen.add(cert);
      merged.push(cert);
    });
    if (merged.length > bundled.length) tls.setDefaultCACertificates(merged);
  } catch (e) {
    console.warn('[TLS] system CA merge skipped:', e.message);
  }
}

applySystemCertificateAuthorities();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
};

// ---------- Cookie 持久化 ----------
const COOKIE_ATTRIBUTE_NAMES = new Set(['path', 'domain', 'expires', 'max-age', 'samesite', 'secure', 'httponly']);
function collectCookiePair(picked, key, value) {
  key = String(key || '').trim();
  if (!key || COOKIE_ATTRIBUTE_NAMES.has(key.toLowerCase())) return;
  if (value === null || value === undefined) return;
  picked.set(key, String(value).trim());
}
function collectCookieInput(input, picked) {
  if (input === null || input === undefined) return;
  if (Array.isArray(input)) {
    input.forEach(item => collectCookieInput(item, picked));
    return;
  }
  if (typeof input === 'object') {
    if (input.name && Object.prototype.hasOwnProperty.call(input, 'value')) {
      collectCookiePair(picked, input.name, input.value);
      return;
    }
    Object.keys(input).forEach(key => {
      const value = input[key];
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) {
        collectCookiePair(picked, key, value.value);
      } else if (typeof value !== 'object') {
        collectCookiePair(picked, key, value);
      }
    });
    return;
  }
  String(input).split(/\r?\n/).forEach(line => {
    line.split(';').forEach(part => {
      const raw = String(part || '').trim();
      const idx = raw.indexOf('=');
      if (idx <= 0) return;
      collectCookiePair(picked, raw.slice(0, idx), raw.slice(idx + 1));
    });
  });
}
function normalizeCookieHeader(input) {
  const picked = new Map();
  collectCookieInput(input, picked);
  return Array.from(picked.entries())
    .filter(([key, value]) => key && value != null && String(value) !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}
function rawCookieFallback(input) {
  if (typeof input === 'string') return input.trim();
  if (Array.isArray(input) && input.every(item => typeof item === 'string')) return input.join('; ').trim();
  return '';
}
function getCookieFile() {
  return process.env.COOKIE_FILE || DEFAULT_COOKIE_FILE;
}
function getQQCookieFile() {
  return process.env.QQ_COOKIE_FILE || DEFAULT_QQ_COOKIE_FILE;
}
function getKugouCookieFile() {
  return process.env.KUGOU_COOKIE_FILE || DEFAULT_KUGOU_COOKIE_FILE;
}
function getQishuiCookieFile() {
  return process.env.QISHUI_COOKIE_FILE || DEFAULT_QISHUI_COOKIE_FILE;
}
function readConfiguredCookieFile(file) {
  try {
    if (file && fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  } catch (_) {}
  return '';
}
function writeConfiguredCookieFile(file, value) {
  try {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, String(value || ''), 'utf8');
  } catch (_) {}
}
const configuredCookieStores = {
  netease: { file: '', value: '', getFile: getCookieFile },
  qq: { file: '', value: '', getFile: getQQCookieFile },
  kugou: { file: '', value: '', getFile: getKugouCookieFile },
  qishui: { file: '', value: '', getFile: getQishuiCookieFile },
};
function refreshConfiguredCookieStore(store, force) {
  const file = store.getFile();
  if (force || store.file !== file) {
    store.file = file;
    store.value = readConfiguredCookieFile(file);
  }
  return store.value;
}
function saveConfiguredCookieStore(store, value) {
  const file = store.getFile();
  store.file = file;
  store.value = String(value || '');
  writeConfiguredCookieFile(file, store.value);
  return store.value;
}
let userCookie = '';
function saveCookie(c) {
  userCookie = saveConfiguredCookieStore(configuredCookieStores.netease, normalizeCookieHeader(c) || rawCookieFallback(c));
  clearNeteaseLoginInfoCache();
}

let qqCookie = '';
function saveQQCookie(c) {
  qqCookie = saveConfiguredCookieStore(configuredCookieStores.qq, normalizeCookieHeader(c) || rawCookieFallback(c));
  qqVipInfoCache.clear();
  clearQQLikedPlaylistCoverCache();
}

let kugouCookie = '';
function saveKugouCookie(c) {
  kugouCookie = saveConfiguredCookieStore(configuredCookieStores.kugou, normalizeCookieHeader(c) || rawCookieFallback(c));
  clearKugouSessionCaches();
}

let qishuiCookie = '';
function saveQishuiCookie(c) {
  qishuiCookie = saveConfiguredCookieStore(configuredCookieStores.qishui, normalizeQishuiCookieInput(c) || normalizeCookieHeader(c) || rawCookieFallback(c));
}
function refreshConfiguredCookieStores(force) {
  userCookie = refreshConfiguredCookieStore(configuredCookieStores.netease, force);
  qqCookie = refreshConfiguredCookieStore(configuredCookieStores.qq, force);
  kugouCookie = refreshConfiguredCookieStore(configuredCookieStores.kugou, force);
  qishuiCookie = refreshConfiguredCookieStore(configuredCookieStores.qishui, force);
}
function refreshQQConfiguredCookieStore(force) {
  qqCookie = refreshConfiguredCookieStore(configuredCookieStores.qq, force);
  return qqCookie;
}
refreshConfiguredCookieStores(true);

function clearAllRuntimeLoginCredentials(reason) {
  userCookie = '';
  qqCookie = '';
  kugouCookie = '';
  qishuiCookie = '';
  Object.keys(configuredCookieStores).forEach((key) => {
    configuredCookieStores[key].value = '';
  });
  clearNeteaseLoginInfoCache();
  qqVipInfoCache.clear();
  clearQQLikedPlaylistCoverCache();
  clearKugouSessionCaches();
  const qishui = clearQishuiAccessToken();
  clearSpotifyToken();
  return {
    ok: true,
    reason: String(reason || 'login-reset'),
    qishui: !qishui || qishui.ok !== false,
  };
}

// ---------- 工具 ----------
function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'text/plain',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.end(data);
  });
}
function sendJSON(res, data, status) {
  res.writeHead(status || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.end(JSON.stringify(data));
}
function readPackageInfo() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}
function parseGitHubRepository(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const direct = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (direct) return { owner: direct[1], repo: direct[2].replace(/\.git$/i, '') };
  const github = raw.match(/github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[#/?].*)?$/i);
  if (github) return { owner: github[1], repo: github[2].replace(/\.git$/i, '') };
  return null;
}
function readUpdateConfig(pkg) {
  const local = (pkg && pkg.mineradio && pkg.mineradio.update) || {};
  const disabled = local.disabled === true || local.provider === 'none';
  if (disabled) {
    return {
      provider: local.provider || 'none',
      owner: '',
      repo: '',
      configured: false,
      disabled: true,
      preview: false,
      preferMirrors: false,
      mirrors: [],
      manifest: '',
    };
  }
  const repoHint = process.env.MINERADIO_UPDATE_REPOSITORY
    || process.env.GITHUB_REPOSITORY
    || local.repository
    || local.github
    || (pkg && pkg.repository && (pkg.repository.url || pkg.repository))
    || '';
  const parsed = parseGitHubRepository(repoHint) || {};
  const owner = process.env.MINERADIO_UPDATE_OWNER || local.owner || parsed.owner || '';
  const repo = process.env.MINERADIO_UPDATE_REPO || local.repo || parsed.repo || '';
  return {
    provider: local.provider || 'github',
    owner,
    repo,
    configured: !!(owner && repo),
    disabled: false,
    preview: local.preview !== false,
    preferMirrors: local.preferMirrors !== false,
    mirrors: readUpdateMirrors(local),
    manifest: process.env.MINERADIO_UPDATE_MANIFEST
      || process.env.MINERADIO_UPDATE_MANIFEST_URL
      || process.env.MINERADIO_UPDATE_MANIFEST_FILE
      || '',
  };
}
function parseUpdateMirrorList(value) {
  if (Array.isArray(value)) return value;
  return String(value || '').split(/[\n,;]/);
}
function readUpdateMirrors(local) {
  const envMirrors = process.env.MINERADIO_UPDATE_MIRRORS || process.env.MINERADIO_UPDATE_MIRROR || '';
  const raw = envMirrors
    ? parseUpdateMirrorList(envMirrors)
    : parseUpdateMirrorList(local.mirrors || local.downloadMirrors || []);
  const seen = new Set();
  const mirrors = [];
  raw.forEach(item => {
    const url = String(item || '').trim();
    if (!/^https?:\/\//i.test(url)) return;
    const key = url.replace(/\/+$/, '').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    mirrors.push(url);
  });
  return mirrors.slice(0, 6);
}
function buildMirrorUrl(originalUrl, mirror) {
  const source = String(originalUrl || '').trim();
  const base = String(mirror || '').trim();
  if (!/^https?:\/\//i.test(source) || !/^https?:\/\//i.test(base)) return '';
  if (base.includes('{encodedUrl}')) return base.replace(/\{encodedUrl\}/g, encodeURIComponent(source));
  if (base.includes('{url}')) return base.replace(/\{url\}/g, source);
  return base.replace(/\/+$/, '/') + source;
}
function uniqueDownloadCandidates(urls, opts) {
  opts = opts || {};
  const directUrls = (Array.isArray(urls) ? urls : [urls])
    .map(url => String(url || '').trim())
    .filter(url => /^https?:\/\//i.test(url));
  const directSet = new Set(directUrls.map(url => url.toLowerCase()));
  const mirrors = opts.useMirrors === false ? [] : (UPDATE_CONFIG.mirrors || []);
  const mirrored = [];
  directUrls.forEach(source => {
    mirrors.forEach((mirror, index) => {
      const url = buildMirrorUrl(source, mirror);
      if (url) mirrored.push({
        url,
        label: '国内加速线路 ' + (index + 1),
        mirrored: true,
      });
    });
  });
  const direct = directUrls.map(url => ({
    url,
    label: directSet.has(url.toLowerCase()) ? 'GitHub 直连' : '下载线路',
    mirrored: false,
  }));
  const ordered = UPDATE_CONFIG.preferMirrors === false ? direct.concat(mirrored) : mirrored.concat(direct);
  const seen = new Set();
  return ordered.filter(item => {
    const key = item.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '').replace(/[+].*$/, '').replace(/-.+$/, '');
}
function compareVersions(a, b) {
  const aa = normalizeVersion(a).split('.').map(n => parseInt(n, 10) || 0);
  const bb = normalizeVersion(b).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(aa.length, bb.length, 3);
  for (let i = 0; i < len; i++) {
    const left = aa[i] || 0;
    const right = bb[i] || 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}
function cleanReleaseLine(line) {
  return String(line || '')
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/^\s*[-*]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim();
}
function extractReleaseNotes(body) {
  const notes = [];
  String(body || '').split(/\r?\n/).forEach(line => {
    if (/<!--[\s\S]*?-->/i.test(line)) return;
    const text = cleanReleaseLine(line);
    if (!text) return;
    if (/^(what'?s changed|changes|changelog|full changelog|更新日志|更新内容)$/i.test(text)) return;
    if (/https?:\/\//i.test(text)) return;
    if (/^(下载|网盘|夸克盘|百度(?:云|网盘)|蓝奏(?:云|网盘)|安装包)/i.test(text)) return;
    if (text.length > 72) return;
    notes.push(text);
  });
  return notes.slice(0, 4);
}
function safeExternalUpdateUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 2048) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch (_) {
    return '';
  }
}
function normalizeUpdateDownloadPages(values, fallbackLabel) {
  const source = Array.isArray(values) ? values : (values ? [values] : []);
  const seen = new Set();
  const pages = [];
  source.forEach((value, index) => {
    const item = value && typeof value === 'object' ? value : { url: value };
    const url = safeExternalUpdateUrl(item.url || item.href || item.downloadPageUrl || item.externalUrl || '');
    if (!url || seen.has(url)) return;
    const label = cleanReleaseLine(item.label || item.name || fallbackLabel || `下载线路 ${index + 1}`)
      .replace(/[<>|]/g, '')
      .slice(0, 24)
      .trim() || `下载线路 ${index + 1}`;
    seen.add(url);
    pages.push({ label, url });
  });
  return pages.slice(0, 6);
}
function extractReleaseDownloadPages(body) {
  const raw = String(body || '');
  const pages = [];
  const hiddenPattern = /<!--\s*mineradio-download-page\s*:\s*(?:([^|<>\r\n]{1,32})\s*\|\s*)?(https:\/\/[^\s<>]+)\s*-->/gi;
  let hidden = null;
  while ((hidden = hiddenPattern.exec(raw))) {
    pages.push({
      label: String(hidden[1] || '').trim(),
      url: hidden[2],
    });
  }
  if (pages.length) return normalizeUpdateDownloadPages(pages);
  const visiblePattern = /^\s*[-*]?\s*(夸克盘|百度(?:云|网盘)|蓝奏(?:云|网盘)|网盘|下载(?:地址|页面|链接)?)\s*[:：]\s*(?:\[[^\]]*]\()?(https:\/\/[^\s<>)\]]+)/gmi;
  let visible = null;
  while ((visible = visiblePattern.exec(raw))) {
    pages.push({ label: visible[1], url: visible[2] });
  }
  return normalizeUpdateDownloadPages(pages);
}
function extractReleaseDownloadPage(body) {
  const pages = extractReleaseDownloadPages(body);
  return pages.length ? pages[0].url : '';
}
function normalizeManifestUpdateInfo(data) {
  data = data || {};
  const release = data.release || {};
  const latestVersion = normalizeVersion(
    data.latestVersion
    || data.version
    || release.version
    || release.tagName
    || release.tag_name
    || release.name
    || APP_VERSION
  ) || APP_VERSION;
  const htmlUrl = safeExternalUpdateUrl(release.htmlUrl || release.html_url || data.htmlUrl || '');
  const legacyExternalUrl = safeExternalUpdateUrl(
    release.downloadPageUrl
    || release.externalUrl
    || data.downloadPageUrl
    || data.externalUrl
    || release.downloadUrl
    || data.downloadUrl
    || ''
  );
  const explicitPages = Array.isArray(release.downloadPages)
    ? release.downloadPages
    : (Array.isArray(data.downloadPages) ? data.downloadPages : null);
  const downloadPages = normalizeUpdateDownloadPages(explicitPages || [], '网盘下载');
  if (explicitPages === null && legacyExternalUrl) {
    downloadPages.unshift({ label: '网盘下载', url: legacyExternalUrl });
  }
  const externalUrl = downloadPages.length ? downloadPages[0].url : '';
  const downloadPageUrl = externalUrl || htmlUrl;
  const notes = Array.isArray(release.notes) && release.notes.length
    ? release.notes.slice(0, 4).map(cleanReleaseLine).filter(Boolean)
    : (extractReleaseNotes(release.body || data.body).length ? extractReleaseNotes(release.body || data.body) : UPDATE_FALLBACK_NOTES);
  return {
    configured: true,
    preview: false,
    updateAvailable: data.updateAvailable != null ? !!data.updateAvailable : compareVersions(latestVersion, APP_VERSION) > 0,
    currentVersion: APP_VERSION,
    latestVersion,
    release: {
      tagName: release.tagName || release.tag_name || data.tagName || ('v' + latestVersion),
      name: release.name || data.name || ('Mineradio v' + latestVersion),
      version: latestVersion,
      publishedAt: release.publishedAt || release.published_at || data.publishedAt || '',
      htmlUrl,
      externalUrl,
      downloadPageUrl,
      downloadPages,
      downloadUrl: externalUrl,
      asset: null,
      patch: null,
      patchAvailable: false,
      summary: release.summary || data.summary || notes[0] || '发现新版本，建议更新。',
      notes,
    },
    source: 'manifest',
  };
}
async function readUpdateManifest(ref) {
  const value = String(ref || '').trim();
  if (!value) throw new Error('UPDATE_MANIFEST_MISSING');
  if (/^https?:\/\//i.test(value)) {
    const resp = await fetch(value, {
      headers: { 'User-Agent': `Mineradio/${APP_VERSION}` },
    });
    if (!resp.ok) throw new Error('Update manifest ' + resp.status);
    return resp.json();
  }
  const file = /^file:/i.test(value) ? fileURLToPath(value) : path.resolve(value);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
async function fetchManifestUpdateInfo(ref) {
  try {
    const data = await readUpdateManifest(ref);
    return normalizeManifestUpdateInfo(data);
  } catch (err) {
    return localUpdateFallback(err.message || 'Update manifest failed', { configured: true });
  }
}
function beatCacheRootInfo() {
  const dir = path.resolve(BEATMAP_CACHE_DIR);
  const root = path.parse(dir).root;
  const drive = root ? root.replace(/[\\\/]+$/, '').toUpperCase() : '';
  const allowed = !!root && !/^C:$/i.test(drive);
  const available = allowed && fs.existsSync(root);
  return { dir, root, drive, allowed, available };
}
function ensureBeatMapCacheDir() {
  const info = beatCacheRootInfo();
  if (!info.allowed) {
    const err = new Error('BEAT_CACHE_ON_C_DRIVE_DISABLED');
    err.code = 'BEAT_CACHE_ON_C_DRIVE_DISABLED';
    err.info = info;
    throw err;
  }
  if (!info.available) {
    const err = new Error('BEAT_CACHE_DRIVE_UNAVAILABLE');
    err.code = 'BEAT_CACHE_DRIVE_UNAVAILABLE';
    err.info = info;
    throw err;
  }
  fs.mkdirSync(info.dir, { recursive: true });
  return info.dir;
}
function safeBeatMapCacheFile(key) {
  const raw = String(key || '').trim();
  if (!raw || raw.length > 240) return null;
  const hash = crypto.createHash('sha1').update(raw).digest('hex');
  const label = raw.replace(/[^a-z0-9_.-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'beatmap';
  return path.join(ensureBeatMapCacheDir(), `${label}-${hash}.json`);
}
function compactBeatMapCachePayload(body) {
  const key = String(body && body.key || '').trim();
  const map = body && body.map;
  if (!key || !map || typeof map !== 'object') return null;
  return {
    v: 1,
    key,
    savedAt: Date.now(),
    meta: {
      provider: String(body.provider || '').slice(0, 32),
      title: String(body.title || '').slice(0, 160),
      artist: String(body.artist || '').slice(0, 160),
      mode: String(body.mode || 'mr').slice(0, 32),
    },
    map,
  };
}
function readBeatMapCache(key) {
  const file = safeBeatMapCacheFile(key);
  if (!file || !fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return raw && raw.map ? raw : null;
}
function writeBeatMapCache(body) {
  const payload = compactBeatMapCachePayload(body);
  if (!payload) return { ok: false, error: 'INVALID_BEATMAP_CACHE_PAYLOAD' };
  const file = safeBeatMapCacheFile(payload.key);
  if (!file) return { ok: false, error: 'INVALID_BEATMAP_CACHE_KEY' };
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload));
  fs.renameSync(tmp, file);
  return { ok: true, key: payload.key, savedAt: payload.savedAt, dir: path.dirname(file) };
}
function localUpdateFallback(reason, opts) {
  opts = opts || {};
  const configured = !!(opts.configured != null ? opts.configured : false);
  return {
    configured,
    preview: UPDATE_CONFIG.preview,
    updateAvailable: false,
    currentVersion: APP_VERSION,
    latestVersion: APP_VERSION,
    release: {
      tagName: 'v' + APP_VERSION,
      name: 'Mineradio v' + APP_VERSION,
      version: APP_VERSION,
      htmlUrl: '',
      externalUrl: '',
      downloadPageUrl: '',
      downloadPages: [],
      downloadUrl: '',
      asset: null,
      patch: null,
      patchAvailable: false,
      summary: '当前版本，更新检测已就绪。',
      notes: UPDATE_FALLBACK_NOTES,
    },
    reason: reason || '',
  };
}
function updateError(code, message, cause) {
  const err = new Error(message || code);
  err.code = code;
  if (cause) err.cause = cause;
  return err;
}
function classifyUpdateError(err) {
  const code = String(err && err.code || '').trim();
  const message = String(err && err.message || err || '').trim();
  const detail = message || code || '未知错误';
  if (/HASH|DIGEST|CHECKSUM/i.test(code + ' ' + message)) {
    return { code: code || 'UPDATE_HASH_MISMATCH', reason: '文件校验失败，可能是线路缓存异常，已拦截该安装包。', detail };
  }
  if (/SIZE_MISMATCH|content length/i.test(code + ' ' + message)) {
    return { code: code || 'UPDATE_SIZE_MISMATCH', reason: '下载文件大小不一致，可能是网络中断或线路缓存不完整。', detail };
  }
  if (/AbortError|TIMEOUT|ETIMEDOUT|timeout/i.test(code + ' ' + message)) {
    return { code: code || 'UPDATE_TIMEOUT', reason: '连接超时，当前网络到更新线路不稳定。', detail };
  }
  if (/ENOTFOUND|EAI_AGAIN|DNS|fetch failed|getaddrinfo/i.test(code + ' ' + message)) {
    return { code: code || 'UPDATE_DNS_FAILED', reason: '域名解析失败，可能是当前网络无法连接该更新线路。', detail };
  }
  if (/ECONNRESET|ECONNREFUSED|socket|network/i.test(code + ' ' + message)) {
    return { code: code || 'UPDATE_NETWORK_FAILED', reason: '网络连接被中断，已尝试切换更新线路。', detail };
  }
  const http = message.match(/\bHTTP[_\s-]?(\d{3})\b/i) || message.match(/\b(\d{3})\b/);
  if (http) {
    const status = Number(http[1]);
    if (status === 403) return { code: code || 'UPDATE_HTTP_403', reason: '更新线路返回 403，可能被限流或拦截。', detail };
    if (status === 404) return { code: code || 'UPDATE_HTTP_404', reason: '更新文件不存在，可能 release 资源还没有同步完成。', detail };
    if (status >= 500) return { code: code || 'UPDATE_HTTP_5XX', reason: '更新线路服务器异常，请稍后重试。', detail };
    return { code: code || ('UPDATE_HTTP_' + status), reason: '更新线路返回 HTTP ' + status + '。', detail };
  }
  return { code: code || 'UPDATE_FAILED', reason: '更新失败：' + detail, detail };
}
async function fetchWithTimeout(url, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 12000);
  try {
    return await fetch(url, Object.assign({}, opts || {}, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}
function promiseWithTimeout(promise, timeoutMs, code) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(code || 'PROVIDER_REQUEST_TIMEOUT');
        err.code = code || 'PROVIDER_REQUEST_TIMEOUT';
        reject(err);
      }, Math.max(250, Number(timeoutMs) || 5000));
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
async function readStreamChunkWithTimeout(reader, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error('UPSTREAM_STREAM_IDLE_TIMEOUT');
          err.code = 'UPSTREAM_STREAM_IDLE_TIMEOUT';
          reject(err);
        }, timeoutMs || 12000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function fetchTextFromCandidates(candidates, timeoutMs) {
  const list = Array.isArray(candidates) && candidates.length ? candidates : [];
  const failures = [];
  for (let i = 0; i < list.length; i++) {
    const candidate = list[i];
    try {
      const resp = await fetchWithTimeout(candidate.url, {
        headers: { 'User-Agent': `Mineradio/${APP_VERSION}` },
      }, timeoutMs || 6500);
      if (!resp.ok) throw updateError('HTTP_' + resp.status, 'HTTP ' + resp.status);
      return { text: await resp.text(), candidate };
    } catch (err) {
      const info = classifyUpdateError(err);
      failures.push(candidate.label + ': ' + info.reason);
    }
  }
  throw updateError('UPDATE_ALL_LINES_FAILED', failures.join('；') || 'All update lines failed');
}
function yamlScalar(text, key) {
  const pattern = new RegExp('^\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*(.+?)\\s*$', 'm');
  const match = String(text || '').match(pattern);
  if (!match) return '';
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}
function parseLatestYmlUpdateInfo(text, reason) {
  const latestVersion = normalizeVersion(yamlScalar(text, 'version') || APP_VERSION) || APP_VERSION;
  const releaseDate = yamlScalar(text, 'releaseDate');
  const htmlUrl = `https://github.com/${UPDATE_CONFIG.owner}/${UPDATE_CONFIG.repo}/releases/tag/v${latestVersion}`;
  return {
    configured: true,
    preview: false,
    updateAvailable: compareVersions(latestVersion, APP_VERSION) > 0,
    currentVersion: APP_VERSION,
    latestVersion,
    release: {
      tagName: 'v' + latestVersion,
      name: 'Mineradio v' + latestVersion,
      version: latestVersion,
      publishedAt: releaseDate,
      htmlUrl,
      externalUrl: '',
      downloadPageUrl: htmlUrl,
      downloadPages: [],
      downloadUrl: '',
      asset: null,
      patch: null,
      patchAvailable: false,
      summary: '发现新版本，请前往发布页面获取安装包。',
      notes: ['更新入口已改为浏览器外部下载', 'Mineradio 不再在本地下载或应用补丁'],
    },
    source: 'latest-yml',
    reason: reason || '',
  };
}
async function fetchLatestYmlUpdateInfo(reason) {
  if (!UPDATE_CONFIG.configured || UPDATE_CONFIG.provider !== 'github') throw updateError('UPDATE_REPOSITORY_NOT_CONFIGURED');
  const latestYmlUrl = `https://github.com/${encodeURIComponent(UPDATE_CONFIG.owner)}/${encodeURIComponent(UPDATE_CONFIG.repo)}/releases/latest/download/latest.yml`;
  const candidates = uniqueDownloadCandidates(latestYmlUrl);
  const result = await fetchTextFromCandidates(candidates, 6500);
  return parseLatestYmlUpdateInfo(result.text, reason);
}
async function fetchLatestUpdateInfo() {
  if (UPDATE_CONFIG.manifest) return fetchManifestUpdateInfo(UPDATE_CONFIG.manifest);
  if (!UPDATE_CONFIG.configured || UPDATE_CONFIG.provider !== 'github') return localUpdateFallback();
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(UPDATE_CONFIG.owner)}/${encodeURIComponent(UPDATE_CONFIG.repo)}/releases/latest`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500);
  try {
    const resp = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': `Mineradio/${APP_VERSION}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    if (!resp.ok) {
      try { return await fetchLatestYmlUpdateInfo('GitHub Releases ' + resp.status); }
      catch (_) { return localUpdateFallback('GitHub Releases ' + resp.status, { configured: true }); }
    }
    const data = await resp.json();
    const latestVersion = normalizeVersion(data.tag_name || data.name || APP_VERSION) || APP_VERSION;
    const htmlUrl = safeExternalUpdateUrl(data.html_url || '');
    const downloadPages = extractReleaseDownloadPages(data.body);
    const externalUrl = downloadPages.length ? downloadPages[0].url : '';
    const downloadPageUrl = externalUrl || htmlUrl;
    const notes = extractReleaseNotes(data.body).length ? extractReleaseNotes(data.body) : UPDATE_FALLBACK_NOTES;
    return {
      configured: true,
      preview: false,
      updateAvailable: compareVersions(latestVersion, APP_VERSION) > 0,
      currentVersion: APP_VERSION,
      latestVersion,
      release: {
        tagName: data.tag_name || ('v' + latestVersion),
        name: data.name || ('Mineradio v' + latestVersion),
        version: latestVersion,
        publishedAt: data.published_at || '',
        htmlUrl,
        externalUrl,
        downloadPageUrl,
        downloadPages,
        downloadUrl: externalUrl,
        asset: null,
        patch: null,
        patchAvailable: false,
        summary: notes[0] || '发现新版本，建议更新。',
        notes,
      },
    };
  } catch (err) {
    const reason = err && err.message || 'Update check failed';
    try { return await fetchLatestYmlUpdateInfo(reason); }
    catch (fallbackErr) { return localUpdateFallback((fallbackErr && fallbackErr.message) || reason, { configured: true }); }
  } finally {
    clearTimeout(timer);
  }
}
function readRequestBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 8 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); }
      catch (e) {
        const params = new URLSearchParams(raw);
        const out = {};
        params.forEach((v, k) => { out[k] = v; });
        resolve(out);
      }
    });
    req.on('error', () => resolve({}));
  });
}
function normalizeApiCode(payload) {
  const body = payload && (payload.body || payload);
  return Number((body && body.code) || (body && body.body && body.body.code) || (payload && payload.status) || 0);
}
function normalizeApiMessage(payload) {
  const body = payload && (payload.body || payload);
  return (body && (body.message || body.msg || body.error)) || (body && body.body && (body.body.message || body.body.msg || body.body.error)) || '';
}
function parseCookieString(cookieText) {
  const out = {};
  String(cookieText || '').split(';').forEach(part => {
    const raw = String(part || '').trim();
    if (!raw) return;
    const idx = raw.indexOf('=');
    if (idx <= 0) return;
    const key = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trim();
    if (key) out[key] = value;
  });
  return out;
}
function serializeCookieObject(obj) {
  return Object.keys(obj || {})
    .filter(k => obj[k] != null && String(obj[k]) !== '')
    .map(k => k + '=' + String(obj[k]))
    .join('; ');
}
function qqCookieObject() {
  return parseCookieString(qqCookie);
}
function normalizeQQUin(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.replace(/^0+/, '') || digits;
}
function qqCookieUin(obj) {
  obj = obj || qqCookieObject();
  const isWechat = !!obj.wxopenid || Number(obj.login_type) === 2;
  const raw = isWechat ? (obj.wxuin || obj.uin || obj.p_uin) : (obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin);
  return normalizeQQUin(raw);
}
function qqCookieMusicKey(obj) {
  obj = obj || qqCookieObject();
  return obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.p_skey || obj.skey ||
    obj.psrf_qqaccess_token || obj.psrf_qqrefresh_token || obj.wxrefresh_token || obj.wxskey || '';
}
function qqCookiePlaybackKey(obj) {
  obj = obj || qqCookieObject();
  return obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || '';
}
function decodeQQCookieValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const candidates = [raw];
  if (/^(?:[0-9a-fA-F]{2}){2,}$/.test(raw)) {
    try {
      const decodedHex = Buffer.from(raw, 'hex').toString('utf8').trim();
      if (decodedHex && /[^\x20-\x7e]/.test(decodedHex)) candidates.push(decodedHex);
    } catch (e) {}
  }
  const plusSafe = raw.replace(/\+/g, '%20');
  try { candidates.push(decodeURIComponent(plusSafe).trim()); } catch (e) {}
  const percentBytes = [];
  let hasPercentBytes = false;
  for (let i = 0; i < plusSafe.length; i += 1) {
    const ch = plusSafe[i];
    const hex = plusSafe.slice(i + 1, i + 3);
    if (ch === '%' && /^[0-9a-fA-F]{2}$/.test(hex)) {
      percentBytes.push(parseInt(hex, 16));
      hasPercentBytes = true;
      i += 2;
    } else {
      const text = ch === '+' ? ' ' : ch;
      for (const byte of Buffer.from(text, 'utf8')) percentBytes.push(byte);
    }
  }
  if (hasPercentBytes && percentBytes.length) {
    const buf = Buffer.from(percentBytes);
    try { candidates.push(new TextDecoder('gb18030').decode(buf).trim()); } catch (e) {}
    try { candidates.push(buf.toString('utf8').trim()); } catch (e) {}
  }
  for (const item of candidates.slice()) {
    if (!item) continue;
    if (/\\u[0-9a-fA-F]{4}/.test(item)) {
      try { candidates.push(JSON.parse('"' + item.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\\\\u/g, '\\u') + '"').trim()); } catch (e) {}
    }
    if (/[ÃÂ]|[\u00c0-\u00ff][\u0080-\u00bf]/.test(item)) {
      try { candidates.push(Buffer.from(item, 'latin1').toString('utf8').trim()); } catch (e) {}
    }
  }
  function score(text) {
    text = String(text || '').trim();
    if (!text) return 1e9;
    let s = 0;
    s += (text.match(/\uFFFD/g) || []).length * 80;
    s += (text.match(/%[0-9a-fA-F]{2}/g) || []).length * 10;
    s += (text.match(/\\u[0-9a-fA-F]{4}/g) || []).length * 8;
    s += (text.match(/[ÃÂ]/g) || []).length * 34;
    s += (text.match(/[\u0080-\u009f]/g) || []).length * 42;
    s += (text.match(/[\x00-\x08\x0e-\x1f\x7f]/g) || []).length * 50;
    s -= (text.match(/[\u4e00-\u9fff]/g) || []).length * 2;
    return s + Math.min(text.length, 80) * 0.02;
  }
  return candidates
    .filter(Boolean)
    .sort((a, b) => score(a) - score(b))[0]
    .trim();
}
function qqCookieNickname(obj, uin) {
  obj = obj || qqCookieObject();
  uin = normalizeQQUin(uin || qqCookieUin(obj));
  const padded = uin ? '0' + uin : '';
  const keys = [
    uin && ('ptnick_' + uin),
    padded && ('ptnick_' + padded),
    'ptnick',
    'nick',
    'nickname',
    'qq_nickname'
  ].filter(Boolean);
  for (const key of keys) {
    if (obj[key]) {
      const nick = decodeQQCookieValue(obj[key]);
      if (nick) return nick;
    }
  }
  const ptnickKey = Object.keys(obj).find(key => /^ptnick_/i.test(key) && obj[key]);
  return ptnickKey ? decodeQQCookieValue(obj[ptnickKey]) : '';
}
function qqCookieAvatar(obj, uin) {
  obj = obj || qqCookieObject();
  const direct = obj.qqmusic_avatar || obj.avatar || obj.avatarUrl || obj.headpic || '';
  if (direct) return decodeQQCookieValue(direct);
  uin = normalizeQQUin(uin || qqCookieUin(obj));
  return uin ? `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(uin)}&s=100` : '';
}
function normalizeQQCookieInput(cookieText) {
  const obj = parseCookieString(cookieText);
  if ((obj.wxopenid || Number(obj.login_type) === 2) && obj.wxuin) obj.uin = obj.wxuin;
  if (!obj.uin && (obj.qqmusic_uin || obj.p_uin)) obj.uin = obj.qqmusic_uin || obj.p_uin;
  if (obj.uin) obj.uin = normalizeQQUin(obj.uin);
  return serializeCookieObject(obj);
}
function playbackRestriction(provider, category, message, action, extra) {
  return {
    provider,
    category,
    action: action || '',
    message,
    ...(extra || {}),
  };
}
function classifyNeteasePlaybackRestriction(lastData, loginInfo) {
  const loggedIn = !!(loginInfo && loginInfo.loggedIn);
  const vipReady = !!(loginInfo && (loginInfo.isVip || loginInfo.isSvip || loginInfo.vipLevel === 'vip' || loginInfo.vipLevel === 'svip' || Number(loginInfo.vipType || 0) > 0));
  const fee = Number(lastData && lastData.fee);
  const code = Number(lastData && lastData.code);
  const freeTrial = lastData && lastData.freeTrialInfo;
  if (!loggedIn) {
    return playbackRestriction('netease', 'login_required', '网易云需要登录后尝试获取完整播放地址', 'login', { code, fee });
  }
  if (freeTrial) {
    return playbackRestriction('netease', 'trial_only', '网易云仅返回试听片段，完整播放需要会员或购买', 'upgrade', { code, fee });
  }
  if (fee === 1) {
    if (vipReady) {
      return playbackRestriction('netease', 'copyright_unavailable', '当前会员状态下仍未取得可播放地址，已尝试在网易云内匹配同一录音版本', 'switch_source', { code, fee });
    }
    return playbackRestriction('netease', 'vip_required', '网易云歌曲需要 VIP 权限，当前无法获取完整播放地址', 'upgrade', { code, fee });
  }
  if (fee === 4) {
    return playbackRestriction('netease', 'paid_required', '网易云歌曲需要单曲、专辑购买或更高权限', 'purchase', { code, fee });
  }
  if (fee === 8) {
    return playbackRestriction('netease', 'copyright_unavailable', '当前网易云版本没有返回完整音源，已尝试匹配站内同一录音版本', 'switch_source', { code, fee });
  }
  if (code === 404 || code === 403) {
    return playbackRestriction('netease', 'copyright_unavailable', '网易云版权暂不可播，换源或稍后重试会更稳', 'switch_source', { code, fee });
  }
  return playbackRestriction('netease', 'url_unavailable', '网易云没有返回可播放地址，可能是版权、会员或地区限制', loggedIn ? 'switch_source' : 'login', { code, fee });
}
function classifyQQPlaybackRestriction(info, session) {
  const hasSession = typeof session === 'object' ? !!session.hasSession : !!session;
  const hasPlaybackKey = typeof session === 'object' ? !!session.hasPlaybackKey : hasSession;
  const rawMsg = String((info && (info.msg || info.tips || info.errmsg || info.message)) || '').trim();
  const code = Number((info && (info.result || info.code || info.errtype)) || 0);
  const lower = rawMsg.toLowerCase();
  if (!hasSession) {
    return playbackRestriction('qq', 'login_required', 'QQ 音乐需要登录或授权后才能获取播放地址', 'login', { code, rawMessage: rawMsg });
  }
  if (!hasPlaybackKey && code === 104003) {
    return playbackRestriction('qq', 'login_required', 'QQ 音乐当前只拿到了网页登录状态，还缺少播放授权，请重新打开官方 QQ 音乐登录窗口完成授权', 'login', { code, rawMessage: rawMsg, missingPlaybackKey: true });
  }
  if (code === 104003) {
    return playbackRestriction('qq', 'copyright_unavailable', 'QQ 音乐没有给当前版本返回播放地址，通常是版权、会员或官方版本限制，可以换一个搜索结果或切到网易云源', 'switch_source', { code, rawMessage: rawMsg });
  }
  if (/vip|会员|付费|购买|数字专辑|专辑|pay/.test(lower + rawMsg)) {
    return playbackRestriction('qq', 'paid_required', 'QQ 音乐歌曲需要会员、购买或数字专辑权限', 'upgrade', { code, rawMessage: rawMsg });
  }
  if (code && code !== 0) {
    return playbackRestriction('qq', 'copyright_unavailable', rawMsg || 'QQ 音乐版权暂不可播或仅官方客户端可播', 'switch_source', { code, rawMessage: rawMsg });
  }
  return playbackRestriction('qq', 'url_unavailable', 'QQ 音乐没有返回播放地址，可能受版权、会员或官方客户端限制', 'switch_source', { code, rawMessage: rawMsg });
}
const NETEASE_QUALITY_CANDIDATES = [
  { level: 'jymaster', br: 1999000, label: '超清母带', svip: true },
  { level: 'hires',    br: 1999000, label: '高清臻音' },
  { level: 'lossless', br: 1411000, label: '无损' },
  { level: 'exhigh',   br: 999000,  label: '极高' },
  { level: 'standard', br: 128000,  label: '标准' },
];
const NETEASE_DIRECT_RESOLVE_BUDGET_MS = 4800;
const NETEASE_SOURCE_MATCH_TOTAL_BUDGET_MS = 8000;
const NETEASE_SOURCE_MATCH_LOOKUP_BUDGET_MS = 4800;
const NETEASE_SONG_URL_TOTAL_BUDGET_MS = 12000;
const QQ_QUALITY_CANDIDATE_TEMPLATES = [
  { prefix: 'RS01', ext: '.flac', level: 'hires', label: 'Hi-Res FLAC' },
  { prefix: 'F000', ext: '.flac', level: 'lossless', label: '无损 FLAC' },
  { prefix: 'M800', ext: '.mp3', level: 'exhigh', label: '320k MP3' },
  { prefix: 'M500', ext: '.mp3', level: 'standard', label: '128k MP3' },
  { prefix: 'C400', ext: '.m4a', level: 'aac', label: 'AAC/M4A' },
];
function normalizeQualityPreference(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (['jymaster', 'master', 'studio', 'svip'].includes(raw)) return 'jymaster';
  if (['hires', 'hi-res', 'highres', 'zhenyin', 'spatial'].includes(raw)) return 'hires';
  if (['lossless', 'flac', 'sq'].includes(raw)) return 'lossless';
  if (['exhigh', 'high', '320', '320k', 'hq'].includes(raw)) return 'exhigh';
  if (['standard', 'normal', '128', '128k', 'std'].includes(raw)) return 'standard';
  return 'hires';
}
function qualityCandidatesFrom(target, candidates) {
  target = normalizeQualityPreference(target);
  let start = candidates.findIndex(item => item.level === target);
  if (start < 0) start = 0;
  return candidates.slice(start);
}
function hasNeteaseSvip(loginInfo) {
  return !!(loginInfo && loginInfo.loggedIn && (loginInfo.vipLevel === 'svip' || loginInfo.isSvip));
}
function mapArtists(raw) {
  return (raw || [])
    .map(a => ({ id: a && a.id, name: (a && a.name) || '' }))
    .filter(a => a.name);
}
function mapSongRecord(s) {
  s = s || {};
  const artists = mapArtists(s.ar || s.artists);
  const album = s.al || s.album || {};
  return {
    provider: 'netease',
    source: 'netease',
    type: 'song',
    id: s.id,
    name: s.name,
    artist: artists.map(a => a.name).join(' / '),
    artists,
    artistId: artists[0] && artists[0].id,
    album: album.name || '',
    albumId: album.id || '',
    cover: album.picUrl || album.coverUrl || '',
    duration: s.dt || s.duration || 0,
    popularity: Number(s.pop || s.popularity || s.score || s.hotScore || 0) || 0,
    searchRank: s.rank === null || s.rank === undefined || s.rank === '' ? null : Number(s.rank),
    fee: s.fee,
  };
}
function mapDiscoverPlaylist(pl, tag) {
  pl = pl || {};
  const creator = pl.creator || pl.user || {};
  const id = pl.id || pl.resourceId || pl.creativeId;
  return {
    provider: 'netease',
    source: 'netease',
    type: 'playlist',
    id,
    name: pl.name || pl.title || '',
    cover: pl.picUrl || pl.coverImgUrl || pl.coverUrl || pl.uiElement && pl.uiElement.image && pl.uiElement.image.imageUrl || '',
    trackCount: pl.trackCount || pl.songCount || pl.programCount || 0,
    playCount: pl.playCount || pl.playcount || 0,
    creator: creator.nickname || creator.name || '',
    tag: tag || pl.alg || '',
  };
}

function lowSignalText(value) {
  return String(value || '').trim().toLowerCase();
}

function isLowSignalPodcastItem(item) {
  const name = lowSignalText(item && (item.name || item.title || item.radioName));
  const sub = lowSignalText(item && (item.djName || item.category || item.desc || item.sub));
  const text = name + ' ' + sub;
  return /购买播客|付费精品|qzone|空间背景音乐|背景音乐|四只烤翅|试纸烤翅/i.test(text);
}

const QQ_LIKED_PLAYLIST_ID = 'liked';
const QQ_LIKED_DIRID = 201;
const QQ_LIKED_PLAYLIST_NAME = 'QQ 音乐·我的喜欢';
const QQ_LIKED_PLAYLIST_COVER = 'https://y.gtimg.cn/mediastyle/global/img/cover_like.png';
const QQ_LIKED_AUTH_MESSAGE = 'QQ 音乐“我的喜欢”需要完整 QQ 音乐授权。请重新打开官方 QQ 音乐登录窗口，等待进入播放器页后再关闭。';
const qqLikedPlaylistCoverByUser = new Map();

function qqLikedPlaylistUserKey(info) {
  return String(info && (info.userId || info.uin) || '').trim();
}

function getCachedQQLikedPlaylistCover(info) {
  const key = qqLikedPlaylistUserKey(info);
  return key ? String(qqLikedPlaylistCoverByUser.get(key) || '') : '';
}

function rememberQQLikedPlaylistCover(info, cover) {
  const key = qqLikedPlaylistUserKey(info);
  cover = String(cover || '').trim();
  if (key && cover) qqLikedPlaylistCoverByUser.set(key, cover);
  else if (key) qqLikedPlaylistCoverByUser.delete(key);
  return cover;
}

function clearQQLikedPlaylistCoverCache() {
  qqLikedPlaylistCoverByUser.clear();
}

function isQQLikedPlaylistId(id) {
  const value = String(id || '').trim().toLowerCase();
  return value === QQ_LIKED_PLAYLIST_ID || value === 'qq-liked' || value === String(QQ_LIKED_DIRID);
}

function isQQFavoritePlaylist(pl) {
  if (pl && (isQQLikedPlaylistId(pl.id) || Number(pl.dirid || 0) === QQ_LIKED_DIRID)) return true;
  const name = String(pl && pl.name || pl && pl.diss_name || '').trim();
  const normalizedName = name.replace(/[·•・_\-\s]+/g, '').toLowerCase();
  return [
    '我喜欢',
    '我的喜欢',
    '喜欢的音乐',
    'qq音乐我喜欢',
    'qq音乐我的喜欢',
    'qq音乐喜欢的音乐',
  ].includes(normalizedName);
}

function isQzoneBackgroundPlaylist(pl) {
  const text = String((pl && pl.name || '') + ' ' + (pl && pl.creator || '')).toLowerCase();
  return /qzone|空间|背景音乐/i.test(text);
}
async function requireLogin(res) {
  const info = await getLoginInfo();
  if (!info.loggedIn || !info.userId) {
    sendJSON(res, { error: 'LOGIN_REQUIRED', loggedIn: false }, 401);
    return null;
  }
  return info;
}

// ---------- 业务: 搜索 ----------
//   优先用 cloudsearch (新接口, 字段更全, picUrl 更稳定)
//   对于仍然缺失封面的歌曲, 用 song_detail 批量补齐
async function handleSearch(keywords, limit, offset) {
  limit = Math.max(1, Math.min(50, Number(limit) || 20));
  offset = Math.max(0, Number(offset) || 0);
  console.log('[Search]', keywords, 'limit:', limit, 'offset:', offset);
  const result = await cloudsearch({ keywords, limit, offset, cookie: userCookie });
  const songs = result.body && result.body.result && result.body.result.songs ? result.body.result.songs : [];

  let mapped = songs.map(s => {
    return mapSongRecord(s);
  });

  // 兜底: 补齐缺失的封面
  const missing = mapped.filter(s => !s.cover).map(s => s.id);
  if (missing.length) {
    try {
      console.log('[Search] backfilling covers for', missing.length, 'songs');
      const dd = await song_detail({ ids: missing.join(','), cookie: userCookie });
      const songsArr = (dd.body && dd.body.songs) || [];
      const idToPic = {};
      songsArr.forEach(s => {
        const pic = (s.al && s.al.picUrl) || (s.album && s.album.picUrl) || '';
        if (pic) idToPic[s.id] = pic;
      });
      mapped = mapped.map(s => s.cover ? s : { ...s, cover: idToPic[s.id] || '' });
    } catch (e) { console.warn('[Search] backfill failed:', e.message); }
  }

  return mapped;
}

const NETEASE_SOURCE_MATCH_POSITIVE_TTL_MS = 12 * 60 * 60 * 1000;
const NETEASE_SOURCE_MATCH_NEGATIVE_TTL_MS = 5 * 60 * 1000;
const NETEASE_SOURCE_MATCH_MAX_CANDIDATES = 4;
const neteaseSourceMatchCache = new Map();

function neteaseSourceMatchText(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[（(【\[].*?[）)】\]]/g, '')
    .replace(/[\s·・\-—_.,，。:：'"“”‘’/\\|!?！？]+/g, '');
}
function neteaseSourceMatchDurationMs(value) {
  let duration = Number(value) || 0;
  if (duration > 0 && duration < 10000) duration *= 1000;
  return Math.max(0, duration);
}
function neteaseSourceMatchArtists(song) {
  const list = song && (song.ar || song.artists) || [];
  return (Array.isArray(list) ? list : []).map(artist => ({
    id: String(artist && artist.id || ''),
    name: neteaseSourceMatchText(artist && artist.name || ''),
  })).filter(artist => artist.id || artist.name);
}
function neteaseSourceMatchVersionTokens(song) {
  const aliases = song && (song.alia || song.alias) || [];
  const text = String((song && song.name || '') + ' ' + (Array.isArray(aliases) ? aliases.join(' ') : aliases || '')).toLowerCase();
  const rules = [
    ['live', /\blive\b|现场|演唱会/],
    ['cover', /\bcover\b|翻唱/],
    ['remix', /\bremix\b|\b(?:pop |radio |club |digital dog )?mix\b|mix版/],
    ['remaster', /\bremaster(?:ed)?\b|重制/],
    ['rerecord', /\bre[ -]?record(?:ed|ing)?\b|重录/],
    ['named-version', /taylor['’]?s version|\bversion\b|\bver\.?\b|版本/],
    ['edit', /\bradio edit\b|\bedit\b|剪辑版/],
    ['alternate-cut', /\bstripped\b|\bmono\b|\bstereo\b|\bcommentary\b/],
    ['instrumental', /\binstrumental\b|伴奏|\bkaraoke\b/],
    ['acoustic', /\bacoustic\b|不插电/],
    ['speed', /\bnightcore\b|\bsped up\b|\bslowed(?: and reverb)?\b|加速|慢速|变速/],
    ['dj', /\bdj\b|dj版/],
    ['demo', /\bdemo\b|试听版/],
  ];
  return rules.filter(rule => rule[1].test(text)).map(rule => rule[0]);
}
function neteaseSourceMatchMediaProfiles(song) {
  const profiles = [];
  ['h', 'm', 'l', 'sq', 'hr', 'hMusic', 'mMusic', 'lMusic', 'sqMusic', 'hrMusic'].forEach(key => {
    const item = song && song[key];
    if (!item) return;
    const profile = {
      br: Number(item.br || item.bitrate || 0) || 0,
      size: Number(item.size || 0) || 0,
      duration: Number(item.playTime || item.playtime || item.duration || 0) || 0,
      sr: Number(item.sr || item.sampleRate || 0) || 0,
    };
    if (profile.br || profile.size) profiles.push(profile);
  });
  return profiles;
}
function neteaseSourceMatchFingerprintCount(source, candidate) {
  const sourceProfiles = neteaseSourceMatchMediaProfiles(source);
  const candidateProfiles = neteaseSourceMatchMediaProfiles(candidate);
  let matches = 0;
  sourceProfiles.forEach(left => {
    if (candidateProfiles.some(right =>
      left.br && left.br === right.br &&
      left.size && left.size === right.size &&
      (!left.duration || !right.duration || Math.abs(left.duration - right.duration) <= 10) &&
      (!left.sr || !right.sr || left.sr === right.sr)
    )) matches++;
  });
  return matches;
}
function neteaseSourceMatchArtistSetEqual(sourceArtists, candidateArtists) {
  const sourceIds = [...new Set(sourceArtists.map(artist => artist.id).filter(Boolean))].sort();
  const candidateIds = [...new Set(candidateArtists.map(artist => artist.id).filter(Boolean))].sort();
  if (sourceIds.length && candidateIds.length) {
    return sourceIds.length === candidateIds.length && sourceIds.every((id, index) => id === candidateIds[index]);
  }
  const sourceNames = [...new Set(sourceArtists.map(artist => artist.name).filter(Boolean))].sort();
  const candidateNames = [...new Set(candidateArtists.map(artist => artist.name).filter(Boolean))].sort();
  return sourceNames.length > 0 && sourceNames.length === candidateNames.length && sourceNames.every((name, index) => name === candidateNames[index]);
}
function neteaseSourceMatchCandidateScore(source, candidate) {
  if (!source || !candidate || String(source.id || '') === String(candidate.id || '')) return -1;
  if (neteaseSourceMatchText(source.name) !== neteaseSourceMatchText(candidate.name)) return -1;
  const sourceVersions = neteaseSourceMatchVersionTokens(source);
  const candidateVersions = neteaseSourceMatchVersionTokens(candidate);
  if (sourceVersions.join('|') !== candidateVersions.join('|')) return -1;
  const sourceArtists = neteaseSourceMatchArtists(source);
  const candidateArtists = neteaseSourceMatchArtists(candidate);
  const sourceIds = sourceArtists.map(artist => artist.id).filter(Boolean);
  const candidateIds = candidateArtists.map(artist => artist.id).filter(Boolean);
  const artistIdMatch = sourceIds.length && candidateIds.length && sourceIds.some(id => candidateIds.indexOf(id) >= 0);
  const artistNameMatch = sourceArtists.some(left => candidateArtists.some(right => left.name && right.name && left.name === right.name));
  const artistSetMatch = neteaseSourceMatchArtistSetEqual(sourceArtists, candidateArtists);
  if (!artistIdMatch && !artistNameMatch) return -1;
  const sourceDuration = neteaseSourceMatchDurationMs(source.dt || source.duration);
  const candidateDuration = neteaseSourceMatchDurationMs(candidate.dt || candidate.duration);
  const durationDiff = sourceDuration && candidateDuration ? Math.abs(sourceDuration - candidateDuration) : 0;
  const durationLimit = sourceDuration ? Math.max(1800, sourceDuration * 0.012) : 0;
  if (durationLimit && durationDiff > durationLimit) return -1;
  const fingerprintMatches = neteaseSourceMatchFingerprintCount(source, candidate);
  const officialRecommendation = !!candidate.__officialSourceMatch;
  if (!fingerprintMatches && (!artistSetMatch || !sourceDuration || !candidateDuration || durationDiff > (officialRecommendation ? 1800 : 600))) return -1;
  const privilege = candidate.__privilege || candidate.privilege || {};
  let score = fingerprintMatches * 120;
  if (artistIdMatch) score += 70;
  else if (artistNameMatch) score += 42;
  if (artistSetMatch) score += 18;
  if (officialRecommendation) score += 240;
  if (sourceDuration && candidateDuration) score += Math.max(0, 45 - durationDiff / 100);
  if (Number(privilege.pl || 0) > 0 && String(privilege.plLevel || '').toLowerCase() !== 'none') score += 22;
  score += Math.min(20, Number(candidate.pop || candidate.popularity || candidate.score || 0) / 5 || 0);
  return score;
}
function neteaseSourceMatchCacheKey(id, hints) {
  hints = hints || {};
  return [
    String(id || ''),
    neteaseSourceMatchText(hints.name || hints.title),
    neteaseSourceMatchText(hints.artist),
    Math.round(neteaseSourceMatchDurationMs(hints.duration) / 1000),
  ].join('|');
}
function readNeteaseSourceMatchCache(key) {
  const entry = neteaseSourceMatchCache.get(key);
  if (!entry) return null;
  const ttl = entry.candidates && entry.candidates.length ? NETEASE_SOURCE_MATCH_POSITIVE_TTL_MS : NETEASE_SOURCE_MATCH_NEGATIVE_TTL_MS;
  if (Date.now() - entry.at > ttl) {
    neteaseSourceMatchCache.delete(key);
    return null;
  }
  return entry.candidates;
}
function writeNeteaseSourceMatchCache(key, candidates) {
  neteaseSourceMatchCache.set(key, { at: Date.now(), candidates: candidates || [] });
  while (neteaseSourceMatchCache.size > 256) neteaseSourceMatchCache.delete(neteaseSourceMatchCache.keys().next().value);
}
function neteaseSourceMatchHintArtists(hints) {
  hints = hints || {};
  const ids = String(hints.artistIds || hints.artistId || '').split(',').map(value => value.trim()).filter(Boolean);
  let names = String(hints.artistNames || '').split('\u001f').map(value => value.trim()).filter(Boolean);
  if (!names.length && String(hints.artist || '').trim()) names = [String(hints.artist).trim()];
  const count = Math.max(ids.length, names.length);
  const artists = [];
  for (let index = 0; index < count; index++) {
    const id = ids[index] || '';
    const name = names[index] || (count === 1 ? String(hints.artist || '').trim() : '');
    if (id || name) artists.push({ id, name });
  }
  return artists;
}
function mergeNeteaseSourceMatchSong(detailSong, searchSong, hints) {
  const detail = detailSong || {};
  const searchItem = searchSong || {};
  const merged = { ...searchItem, ...detail };
  const rawDetailArtists = detail.ar || detail.artists || [];
  const rawSearchArtists = searchItem.ar || searchItem.artists || [];
  const detailArtists = (Array.isArray(rawDetailArtists) ? rawDetailArtists : []).filter(artist => artist && (artist.id || String(artist.name || '').trim()));
  const searchArtists = (Array.isArray(rawSearchArtists) ? rawSearchArtists : []).filter(artist => artist && (artist.id || String(artist.name || '').trim()));
  const hintArtists = neteaseSourceMatchHintArtists(hints);
  const artists = (Array.isArray(detailArtists) && detailArtists.length)
    ? detailArtists
    : ((Array.isArray(searchArtists) && searchArtists.length) ? searchArtists : hintArtists);
  const detailAlbum = detail.al || detail.album || {};
  const searchAlbum = searchItem.al || searchItem.album || {};
  const album = { ...searchAlbum, ...detailAlbum };
  album.name = String(detailAlbum.name || '').trim() || String(searchAlbum.name || '').trim() || hints && hints.album || '';
  merged.id = detail.id || searchItem.id || hints && hints.id || '';
  merged.name = String(detail.name || '').trim() || String(searchItem.name || '').trim() || hints && (hints.name || hints.title) || '';
  merged.ar = artists;
  merged.artists = artists;
  merged.al = album;
  merged.album = album;
  merged.dt = detail.dt || detail.duration || searchItem.dt || searchItem.duration || neteaseSourceMatchDurationMs(hints && hints.duration);
  ['h', 'm', 'l', 'sq', 'hr', 'hMusic', 'mMusic', 'lMusic', 'sqMusic', 'hrMusic'].forEach(key => {
    if (!merged[key] && searchItem[key]) merged[key] = searchItem[key];
  });
  return merged;
}
async function findNeteaseSameTrackCandidates(id, hints, lookupDeadline) {
  hints = hints || {};
  const deadline = Number(lookupDeadline) > 0 ? Number(lookupDeadline) : Date.now() + NETEASE_SOURCE_MATCH_LOOKUP_BUDGET_MS;
  const sourceId = String(id || '').trim();
  const title = String(hints.name || hints.title || '').trim();
  const artist = String(hints.artist || '').trim();
  if (!sourceId || !title || !artist) return [];
  const cacheKey = neteaseSourceMatchCacheKey(sourceId, hints);
  const cached = readNeteaseSourceMatchCache(cacheKey);
  if (cached) return cached;
  const query = [title, artist].filter(Boolean).join(' ');
  let searchSongs = [];
  try {
    const searchBudget = Math.min(3000, Math.max(500, deadline - Date.now()));
    const result = await promiseWithTimeout(cloudsearch({ keywords: query, type: 1, limit: 16, cookie: userCookie }), searchBudget, 'NETEASE_SOURCE_SEARCH_TIMEOUT');
    searchSongs = result.body && result.body.result && Array.isArray(result.body.result.songs) ? result.body.result.songs : [];
  } catch (err) {
    console.warn('[NeteaseSourceMatch] search failed:', err.code || err.message);
    return [];
  }
  const searchById = new Map(searchSongs.map(song => [String(song && song.id || ''), song]));
  const detailIds = [sourceId].concat(searchSongs.slice(0, 12).map(song => String(song && song.id || '')).filter(Boolean));
  let detailSongs = [];
  let privileges = [];
  try {
    const detailBudget = Math.min(2000, Math.max(500, deadline - Date.now()));
    const detail = await promiseWithTimeout(song_detail({ ids: [...new Set(detailIds)].join(','), cookie: userCookie }), detailBudget, 'NETEASE_SOURCE_DETAIL_TIMEOUT');
    detailSongs = detail.body && Array.isArray(detail.body.songs) ? detail.body.songs : [];
    privileges = detail.body && Array.isArray(detail.body.privileges) ? detail.body.privileges : [];
  } catch (err) {
    console.warn('[NeteaseSourceMatch] detail failed:', err.code || err.message);
  }
  const privilegeById = new Map(privileges.map(item => [String(item && item.id || ''), item]));
  const detailById = new Map(detailSongs.map(song => [String(song && song.id || ''), song]));
  const sourceDetail = detailById.get(sourceId) || searchById.get(sourceId) || null;
  const officialRecommendationId = String(sourceDetail && sourceDetail.noCopyrightRcmd && sourceDetail.noCopyrightRcmd.songId || '');
  if (officialRecommendationId && !detailById.has(officialRecommendationId) && !searchById.has(officialRecommendationId) && deadline - Date.now() >= 500) {
    try {
      const officialDetail = await promiseWithTimeout(song_detail({ ids: officialRecommendationId, cookie: userCookie }), Math.min(1000, Math.max(500, deadline - Date.now())), 'NETEASE_OFFICIAL_MATCH_DETAIL_TIMEOUT');
      const officialSongs = officialDetail.body && Array.isArray(officialDetail.body.songs) ? officialDetail.body.songs : [];
      const officialPrivileges = officialDetail.body && Array.isArray(officialDetail.body.privileges) ? officialDetail.body.privileges : [];
      officialSongs.forEach(song => detailById.set(String(song && song.id || ''), song));
      officialPrivileges.forEach(item => privilegeById.set(String(item && item.id || ''), item));
    } catch (err) {
      console.warn('[NeteaseSourceMatch] official alternate detail failed:', err.code || err.message);
    }
  }
  const source = mergeNeteaseSourceMatchSong(detailById.get(sourceId), searchById.get(sourceId), {
    ...hints,
    id: sourceId,
    name: title,
    artist,
  });
  const ranked = [];
  const candidateSeeds = searchSongs.slice();
  if (officialRecommendationId && !candidateSeeds.some(song => String(song && song.id || '') === officialRecommendationId)) {
    const officialSeed = detailById.get(officialRecommendationId) || { id: officialRecommendationId, name: title, ar: neteaseSourceMatchHintArtists(hints), dt: neteaseSourceMatchDurationMs(hints.duration) };
    candidateSeeds.unshift(officialSeed);
  }
  candidateSeeds.forEach(searchSong => {
    const candidateId = String(searchSong && searchSong.id || '');
    if (!candidateId || candidateId === sourceId) return;
    const candidate = mergeNeteaseSourceMatchSong(detailById.get(candidateId), searchSong, {});
    candidate.__privilege = privilegeById.get(candidateId) || searchSong.privilege || {};
    candidate.__officialSourceMatch = !!(officialRecommendationId && candidateId === officialRecommendationId);
    const score = neteaseSourceMatchCandidateScore(source, candidate);
    if (score < 0) return;
    ranked.push({
      song: mapSongRecord(candidate),
      score,
      fingerprintMatches: neteaseSourceMatchFingerprintCount(source, candidate),
      officialRecommendation: !!candidate.__officialSourceMatch,
      durationDiff: Math.abs(neteaseSourceMatchDurationMs(source.dt || source.duration) - neteaseSourceMatchDurationMs(candidate.dt || candidate.duration)),
    });
  });
  ranked.sort((a, b) => b.score - a.score || a.durationDiff - b.durationDiff || Number(b.song.popularity || 0) - Number(a.song.popularity || 0));
  const candidates = ranked.slice(0, NETEASE_SOURCE_MATCH_MAX_CANDIDATES);
  writeNeteaseSourceMatchCache(cacheKey, candidates);
  return candidates;
}

async function handleNeteaseAlbumDetail(id, limit) {
  const albumId = String(id || '').trim();
  const num = Math.max(10, Math.min(120, parseInt(limit || '80', 10) || 80));
  if (!albumId) return { provider: 'netease', error: 'MISSING_ALBUM_ID', album: null, songs: [] };
  const result = await album({ id: albumId, cookie: userCookie, timestamp: Date.now() });
  const body = result.body || result || {};
  const info = body.album || body.data && (body.data.album || body.data) || {};
  const rawSongs = Array.isArray(body.songs) ? body.songs : (Array.isArray(info.songs) ? info.songs : []);
  const artists = mapArtists(info.artists || info.ar || []);
  const songs = rawSongs
    .slice(0, num)
    .map(song => mapSongRecord(song))
    .filter(song => song && song.id);
  return {
    provider: 'netease',
    album: {
      provider: 'netease',
      id: info.id || albumId,
      albumId: info.id || albumId,
      name: info.name || '',
      artist: artists.map(a => a.name).join(' / ') || info.artist && info.artist.name || (songs[0] && songs[0].artist) || '',
      artists,
      cover: info.picUrl || info.coverUrl || '',
      releaseDate: info.publishTime || info.publishTime === 0 ? info.publishTime : '',
      trackCount: Number(info.size || info.trackCount || rawSongs.length) || songs.length,
    },
    songs,
    total: Number(info.size || info.trackCount || rawSongs.length) || songs.length,
  };
}

function mapDailyRecommendationSongs(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map(mapSongRecord)
    .filter(song => song && song.id && song.name);
}

async function handleDiscoverHome() {
  const info = await getLoginInfo();
  const loggedIn = !!(info && info.loggedIn);
  if (!loggedIn) {
    return {
      loggedIn: false,
      user: null,
      dailySongs: [],
      dailySongTotal: 0,
      dailySongsComplete: true,
      playlists: [],
      podcasts: [],
      mode: 'starter',
      updatedAt: Date.now(),
    };
  }
  const tasks = [
    personalized({ limit: 8, cookie: userCookie, timestamp: Date.now() }),
    recommend_resource({ cookie: userCookie, timestamp: Date.now() }),
    recommend_songs({ cookie: userCookie, timestamp: Date.now() }),
  ];
  const result = await Promise.allSettled(tasks);

  const personalizedBody = result[0].status === 'fulfilled' && result[0].value && result[0].value.body || {};
  const publicPlaylists = (personalizedBody.result || personalizedBody.data || [])
    .map(pl => mapDiscoverPlaylist(pl, '推荐歌单'))
    .filter(pl => pl.id && pl.name)
    .slice(0, 8);

  let privatePlaylists = [];
  if (result[1].status === 'fulfilled' && result[1].value) {
    const body = result[1].value.body || {};
    const raw = body.recommend || body.data || [];
    privatePlaylists = (Array.isArray(raw) ? raw : [])
      .map(pl => mapDiscoverPlaylist(pl, '私人推荐'))
      .filter(pl => pl.id && pl.name)
      .slice(0, 6);
  }

  let dailySongs = [];
  if (result[2].status === 'fulfilled' && result[2].value) {
    const body = result[2].value.body || {};
    const raw = body.data && (body.data.dailySongs || body.data.recommend) || body.recommend || [];
    dailySongs = mapDailyRecommendationSongs(raw);
  }

  return {
    loggedIn,
    user: loggedIn ? { userId: info.userId, nickname: info.nickname || '', avatar: info.avatar || '' } : null,
    dailySongs,
    dailySongTotal: dailySongs.length,
    dailySongsComplete: true,
    playlists: privatePlaylists.concat(publicPlaylists).slice(0, 10),
    podcasts: [],
    updatedAt: Date.now(),
  };
}

const QQ_MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const QQ_SMARTBOX_URL = 'https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg';
const QQ_HEADERS = {
  Referer: 'https://y.qq.com/',
  'User-Agent': UA,
};
const QQ_VIP_INFO_CACHE_TTL_MS = 2 * 60 * 1000;
const qqVipInfoCache = new Map();

function requestText(targetUrl, opts, body) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, {
      method: opts.method || 'GET',
      headers: opts.headers || {},
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode >= 400) {
          const err = new Error('HTTP ' + response.statusCode);
          err.statusCode = response.statusCode;
          err.body = text;
          reject(err);
          return;
        }
        resolve(text);
      });
    });
    req.setTimeout(opts.timeoutMs || 10000, () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function requestJson(targetUrl, opts, body) {
  const text = await requestText(targetUrl, opts, body);
  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error('Invalid JSON from ' + targetUrl);
    err.cause = e;
    throw err;
  }
}

function clampNumber(value, min, max, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function openMeteoWeatherLabel(code) {
  code = Number(code);
  if (code === 0) return '晴';
  if (code === 1 || code === 2) return '少云';
  if (code === 3) return '阴';
  if (code === 45 || code === 48) return '雾';
  if (code === 51 || code === 53 || code === 55) return '毛毛雨';
  if (code === 56 || code === 57) return '冻雨';
  if (code === 61 || code === 63 || code === 65) return '雨';
  if (code === 66 || code === 67) return '冻雨';
  if (code === 71 || code === 73 || code === 75 || code === 77) return '雪';
  if (code === 80 || code === 81 || code === 82) return '阵雨';
  if (code === 85 || code === 86) return '阵雪';
  if (code === 95 || code === 96 || code === 99) return '雷雨';
  return '天气';
}

function buildWeatherMood(weather, date) {
  const now = date || new Date();
  const hour = now.getHours();
  const code = Number(weather && weather.weatherCode);
  const temp = Number(weather && weather.temperature);
  const apparent = Number(weather && weather.apparentTemperature);
  const rain = Number(weather && weather.precipitation) || 0;
  const humidity = Number(weather && weather.humidity) || 0;
  const wind = Number(weather && weather.windSpeed) || 0;
  const isNight = weather && weather.isDay === 0 || hour < 6 || hour >= 20;
  const isMorning = hour >= 5 && hour < 11;
  const isDusk = hour >= 17 && hour < 20;
  const isRain = rain > 0 || [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
  const isSnow = [71, 73, 75, 77, 85, 86].includes(code);
  const isCloud = [2, 3, 45, 48].includes(code);
  const isStorm = [95, 96, 99].includes(code);
  const feels = Number.isFinite(apparent) ? apparent : temp;

  let mood = {
    key: 'clear',
    title: '晴朗电台',
    tagline: '让节奏亮一点，像窗边的光',
    energy: 0.62,
    warmth: 0.58,
    focus: 0.48,
    melancholy: 0.24,
    keywords: ['轻快 华语', 'city pop', 'indie pop', 'chill pop', '阳光 歌单'],
  };
  if (isStorm) {
    mood = {
      key: 'storm',
      title: '雷雨电台',
      tagline: '低频更厚，适合把世界关小一点',
      energy: 0.46,
      warmth: 0.34,
      focus: 0.66,
      melancholy: 0.62,
      keywords: ['暗色 R&B', 'trip hop', '夜晚 电子', '氛围 摇滚', '雨夜 歌单'],
    };
  } else if (isRain) {
    mood = {
      key: 'rain',
      title: '雨天电台',
      tagline: '留一点潮湿的空间给旋律',
      energy: 0.38,
      warmth: 0.42,
      focus: 0.64,
      melancholy: 0.66,
      keywords: ['雨天 R&B', 'lofi rainy', '华语 慢歌', 'dream pop', '雨夜 歌单'],
    };
  } else if (isSnow || feels <= 3) {
    mood = {
      key: 'snow',
      title: '冷空气电台',
      tagline: '干净、慢速、带一点冬天的颗粒感',
      energy: 0.34,
      warmth: 0.28,
      focus: 0.72,
      melancholy: 0.54,
      keywords: ['冬天 民谣', 'ambient piano', '日系 冬天', 'indie folk', '安静 歌单'],
    };
  } else if (feels >= 31 || humidity >= 78) {
    mood = {
      key: 'humid',
      title: '闷热电台',
      tagline: '降低密度，留出一点呼吸',
      energy: 0.48,
      warmth: 0.76,
      focus: 0.46,
      melancholy: 0.30,
      keywords: ['夏日 chill', 'bossa nova', 'city pop 夏天', '轻电子', '海边 歌单'],
    };
  } else if (isCloud) {
    mood = {
      key: 'cloudy',
      title: '阴天电台',
      tagline: '不急着明亮，先让声音变软',
      energy: 0.40,
      warmth: 0.46,
      focus: 0.58,
      melancholy: 0.52,
      keywords: ['阴天 华语', 'indie rock mellow', 'neo soul', 'chillhop', '独立 民谣'],
    };
  }

  if (isNight) {
    mood.key += '-night';
    mood.title = mood.key.startsWith('clear') ? '夜色电台' : mood.title.replace('电台', '夜听');
    mood.tagline = '音量放低一点，让夜色参与编曲';
    mood.energy = Math.min(mood.energy, 0.42);
    mood.focus = Math.max(mood.focus, 0.68);
    mood.melancholy = Math.max(mood.melancholy, 0.52);
    mood.keywords = ['夜晚 R&B', 'late night jazz', 'ambient', 'lofi sleep', '夜跑 歌单'].concat(mood.keywords.slice(0, 3));
  } else if (isMorning) {
    mood.title = mood.key.startsWith('rain') ? '雨晨电台' : '早晨电台';
    mood.energy = Math.max(mood.energy, 0.52);
    mood.keywords = ['早晨 通勤', 'morning acoustic', '清晨 indie', '轻快 华语'].concat(mood.keywords.slice(0, 3));
  } else if (isDusk) {
    mood.title = mood.key.startsWith('rain') ? '黄昏雨声' : '黄昏电台';
    mood.melancholy = Math.max(mood.melancholy, 0.48);
    mood.keywords = ['黄昏 city pop', '日落 歌单', '落日飞车', 'soul pop'].concat(mood.keywords.slice(0, 3));
  }

  if (wind >= 28) {
    mood.energy = Math.max(mood.energy, 0.56);
    mood.keywords = ['公路 摇滚', 'windy day playlist'].concat(mood.keywords.slice(0, 4));
  }
  mood.keywords = Array.from(new Set(mood.keywords)).slice(0, 7);
  return mood;
}

async function resolveOpenMeteoLocation(query) {
  const raw = String(query || '').trim();
  if (!raw) return WEATHER_DEFAULT_LOCATION;
  const u = new URL(OPEN_METEO_GEOCODE_URL);
  u.searchParams.set('name', raw);
  u.searchParams.set('count', '1');
  u.searchParams.set('language', 'zh');
  u.searchParams.set('format', 'json');
  const body = await requestJson(u.toString(), { headers: { 'User-Agent': UA } });
  const first = body && Array.isArray(body.results) && body.results[0];
  if (!first) return { ...WEATHER_DEFAULT_LOCATION, query: raw, fallback: true };
  return {
    name: first.name || raw,
    country: first.country || '',
    admin1: first.admin1 || '',
    latitude: first.latitude,
    longitude: first.longitude,
    timezone: first.timezone || 'auto',
  };
}

async function fetchOpenMeteoWeather(params) {
  params = params || {};
  let location;
  const lat = clampNumber(params.lat, -90, 90, NaN);
  const lon = clampNumber(params.lon, -180, 180, NaN);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    location = {
      name: String(params.city || params.name || '当前位置').trim() || '当前位置',
      country: '',
      latitude: lat,
      longitude: lon,
      timezone: params.timezone || 'auto',
    };
  } else {
    location = await resolveOpenMeteoLocation(params.city || params.q || params.location);
  }
  const u = new URL(OPEN_METEO_FORECAST_URL);
  u.searchParams.set('latitude', String(location.latitude));
  u.searchParams.set('longitude', String(location.longitude));
  u.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m');
  u.searchParams.set('hourly', 'precipitation_probability,weather_code,temperature_2m');
  u.searchParams.set('forecast_days', '1');
  u.searchParams.set('timezone', location.timezone || 'auto');
  const body = await requestJson(u.toString(), { headers: { 'User-Agent': UA } });
  const cur = body && body.current || {};
  const weather = {
    provider: 'open-meteo',
    location: {
      name: location.name,
      country: location.country || '',
      admin1: location.admin1 || '',
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: body.timezone || location.timezone || '',
      fallback: !!location.fallback,
    },
    label: openMeteoWeatherLabel(cur.weather_code),
    weatherCode: Number(cur.weather_code),
    temperature: Number(cur.temperature_2m),
    apparentTemperature: Number(cur.apparent_temperature),
    humidity: Number(cur.relative_humidity_2m),
    precipitation: Number(cur.precipitation || cur.rain || cur.showers || cur.snowfall || 0),
    cloudCover: Number(cur.cloud_cover),
    windSpeed: Number(cur.wind_speed_10m),
    windGusts: Number(cur.wind_gusts_10m),
    isDay: Number(cur.is_day),
    time: cur.time || '',
    updatedAt: Date.now(),
  };
  weather.mood = buildWeatherMood(weather);
  return weather;
}

async function fetchIpWeatherLocation() {
  const u = new URL(WEATHER_IP_LOCATION_URL);
  u.searchParams.set('fields', 'status,message,country,regionName,city,lat,lon,timezone,query');
  u.searchParams.set('lang', 'zh-CN');
  const body = await requestJson(u.toString(), { headers: { 'User-Agent': UA } });
  if (!body || body.status !== 'success' || !Number.isFinite(Number(body.lat)) || !Number.isFinite(Number(body.lon))) {
    const err = new Error(body && body.message || 'IP_LOCATION_FAILED');
    err.body = body;
    throw err;
  }
  return {
    provider: 'ip-api',
    city: body.city || WEATHER_DEFAULT_LOCATION.name,
    region: body.regionName || '',
    country: body.country || '',
    latitude: Number(body.lat),
    longitude: Number(body.lon),
    timezone: body.timezone || 'auto',
    ip: body.query || '',
  };
}

function weatherRadioSeedQueries(mood) {
  const key = String(mood && mood.key || '');
  if (key.includes('rain') || key.includes('storm')) return ['陈奕迅 阴天快乐', '周杰伦 雨下一整晚', '孙燕姿 遇见', '林宥嘉 说谎', '毛不易 消愁'];
  if (key.includes('snow') || key.includes('cloudy')) return ['陈奕迅 好久不见', '莫文蔚 阴天', '李健 贝加尔湖畔', '朴树 平凡之路', '蔡健雅 达尔文'];
  if (key.includes('humid')) return ['落日飞车 My Jinji', '告五人 爱人错过', '夏日入侵企画 想去海边', '陈绮贞 旅行的意义', '王若琳 Lost in Paradise'];
  if (key.includes('night')) return ['方大同 特别的人', '陶喆 爱很简单', 'Frank Ocean Pink + White', '林忆莲 夜太黑', "Norah Jones Don't Know Why"];
  return ['孙燕姿 天黑黑', '周杰伦 晴天', '五月天 温柔', '陈奕迅 稳稳的幸福', '王菲'];
}

function fallbackWeatherForRadio(params, err) {
  params = params || {};
  const name = String(params.city || params.q || params.location || WEATHER_DEFAULT_LOCATION.name).trim() || WEATHER_DEFAULT_LOCATION.name;
  return {
    provider: 'open-meteo',
    location: {
      name,
      country: '',
      admin1: '',
      latitude: null,
      longitude: null,
      timezone: params.timezone || WEATHER_DEFAULT_LOCATION.timezone,
      fallback: true,
    },
    label: '天气暂不可用',
    weatherCode: null,
    temperature: null,
    apparentTemperature: null,
    humidity: null,
    precipitation: null,
    cloudCover: null,
    windSpeed: null,
    windGusts: null,
    isDay: null,
    time: '',
    updatedAt: Date.now(),
    error: err && err.message || '',
    mood: {
      key: 'fallback',
      title: '临时电台',
      tagline: '天气暂时没有回来，先放一组稳妥的歌',
      energy: 0.54,
      warmth: 0.55,
      focus: 0.55,
      melancholy: 0.35,
      keywords: ['华语 流行', 'indie pop', 'city pop', '轻快 歌单', 'chill pop'],
    },
  };
}

function uniqueSongsByKey(songs) {
  const seen = new Set();
  const out = [];
  (songs || []).forEach(song => {
    const key = String(song && (song.id || song.name + '|' + song.artist) || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(song);
  });
  return out;
}

function tagWeatherPoolSongs(songs, source) {
  return (songs || []).map(song => ({ ...song, weatherSource: source }));
}

async function fetchWeatherPlaylistSongs(playlist, limit) {
  const id = playlist && playlist.id;
  if (!id) return [];
  let rawTracks = [];
  try {
    if (typeof playlist_track_all === 'function') {
      const all = await playlist_track_all({ id, limit: limit || 36, offset: 0, cookie: userCookie, timestamp: Date.now() });
      rawTracks = (all.body && (all.body.songs || all.body.tracks)) || [];
    }
  } catch (e) {
    console.warn('[WeatherRadio] playlist_track_all failed:', playlist && playlist.name, e.message);
  }
  if (!rawTracks.length && typeof playlist_detail === 'function') {
    try {
      const detail = await playlist_detail({ id, s: 0, cookie: userCookie, timestamp: Date.now() });
      const pl = (detail.body && detail.body.playlist) || {};
      rawTracks = pl.tracks || [];
    } catch (e) {
      console.warn('[WeatherRadio] playlist_detail failed:', playlist && playlist.name, e.message);
    }
  }
  return rawTracks.map(mapSongRecord).filter(song => song.id && song.name).slice(0, limit || 36);
}

const NETEASE_PLAYLIST_SYNC_PAGE_SIZE = 200;
const NETEASE_PLAYLIST_SYNC_MAX_PAGES = 80;
const NETEASE_TRACK_SYNC_PAGE_SIZE = 500;
const NETEASE_TRACK_SYNC_MAX_PAGES = 80;
const NETEASE_TRACK_STREAM_PAGE_SIZE = 200;
const NETEASE_PLAYLIST_TRACK_INDEX_TTL_MS = 10 * 60 * 1000;
const NETEASE_PLAYLIST_TRACK_INDEX_MAX_ENTRIES = 8;
const neteasePlaylistTrackIndexCache = new Map();
const neteasePlaylistTrackIndexInflight = new Map();

function mapNeteasePlaylistMeta(pl, fallbackId) {
  pl = pl || {};
  return {
    id: pl.id || fallbackId,
    name: pl.name || '',
    cover: pl.coverImgUrl || pl.cover || '',
    trackCount: pl.trackCount || pl.track_count || 0,
    playCount: pl.playCount || pl.play_count || 0,
    creator: (pl.creator && pl.creator.nickname) || pl.creatorNickname || '',
    subscribed: !!pl.subscribed,
    specialType: pl.specialType || 0,
  };
}

function mergeUniqueNeteasePlaylists(target, incoming, seen) {
  (incoming || []).forEach(pl => {
    const id = String(pl && pl.id || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    target.push(pl);
  });
}

async function fetchAllNeteaseUserPlaylists(uid, maxItems) {
  const playlists = [];
  const seen = new Set();
  let offset = 0;
  let total = 0;
  for (let page = 0; page < NETEASE_PLAYLIST_SYNC_MAX_PAGES; page += 1) {
    const r = await user_playlist({
      uid,
      limit: NETEASE_PLAYLIST_SYNC_PAGE_SIZE,
      offset,
      cookie: userCookie,
      timestamp: Date.now(),
    });
    const body = r.body || r || {};
    const raw = Array.isArray(body.playlist) ? body.playlist : [];
    total = Number(body.total || body.count || total) || total;
    mergeUniqueNeteasePlaylists(playlists, raw, seen);
    if (maxItems && playlists.length >= maxItems) break;
    if (!raw.length || raw.length < NETEASE_PLAYLIST_SYNC_PAGE_SIZE) break;
    if (total && playlists.length >= total) break;
    offset += NETEASE_PLAYLIST_SYNC_PAGE_SIZE;
  }
  return maxItems ? playlists.slice(0, maxItems) : playlists;
}

async function fetchNeteaseUserPlaylistsPage(uid, limit, offset) {
  limit = Math.max(1, Math.min(NETEASE_PLAYLIST_SYNC_PAGE_SIZE, parseInt(limit || '48', 10) || 48));
  offset = Math.max(0, parseInt(offset || '0', 10) || 0);
  const r = await user_playlist({
    uid,
    limit,
    offset,
    cookie: userCookie,
    timestamp: Date.now(),
  });
  const body = r.body || r || {};
  const playlists = Array.isArray(body.playlist) ? body.playlist : [];
  const total = Math.max(Number(body.total || body.count || 0) || 0, offset + playlists.length);
  const nextOffset = offset + playlists.length;
  return {
    playlists,
    total,
    offset,
    limit,
    nextOffset,
    hasMore: total ? nextOffset < total : playlists.length >= limit,
  };
}

function neteaseRawTrackKey(track, fallback) {
  track = track || {};
  const privilege = track.privilege || {};
  const album = track.al || track.album || {};
  return String(
    track.id ||
    track.songId ||
    track.resourceId ||
    privilege.id ||
    ((track.name || '') + '|' + (album.id || album.name || '') + '|' + fallback)
  );
}

function mergeUniqueNeteaseTracks(target, incoming, seen) {
  let added = 0;
  (incoming || []).forEach((track, index) => {
    const key = neteaseRawTrackKey(track, target.length + ':' + index);
    if (!key || seen.has(key)) return;
    seen.add(key);
    target.push(track);
    added += 1;
  });
  return added;
}

async function fetchNeteasePlaylistDetailMeta(id) {
  if (typeof playlist_detail !== 'function') return { playlistMeta: { id, name: '', cover: '', trackCount: 0 }, tracks: [] };
  const detail = await playlist_detail({ id, s: 0, cookie: userCookie, timestamp: Date.now() });
  const pl = (detail.body && detail.body.playlist) || {};
  return { playlistMeta: mapNeteasePlaylistMeta(pl, id), tracks: Array.isArray(pl.tracks) ? pl.tracks : [] };
}

function pruneNeteasePlaylistTrackIndexCache() {
  const now = Date.now();
  for (const [key, entry] of neteasePlaylistTrackIndexCache.entries()) {
    if (!entry || now - entry.updatedAt > NETEASE_PLAYLIST_TRACK_INDEX_TTL_MS) {
      neteasePlaylistTrackIndexCache.delete(key);
    }
  }
  while (neteasePlaylistTrackIndexCache.size > NETEASE_PLAYLIST_TRACK_INDEX_MAX_ENTRIES) {
    const oldestKey = neteasePlaylistTrackIndexCache.keys().next().value;
    if (oldestKey == null) break;
    neteasePlaylistTrackIndexCache.delete(oldestKey);
  }
}

function invalidateNeteasePlaylistTrackIndex(id) {
  const key = String(id || '');
  if (key) neteasePlaylistTrackIndexCache.delete(key);
}

async function fetchNeteasePlaylistTrackIndex(id) {
  const key = String(id || '');
  if (!key || typeof playlist_detail !== 'function') return null;
  pruneNeteasePlaylistTrackIndexCache();
  const cached = neteasePlaylistTrackIndexCache.get(key);
  if (cached && Date.now() - cached.updatedAt <= NETEASE_PLAYLIST_TRACK_INDEX_TTL_MS) {
    neteasePlaylistTrackIndexCache.delete(key);
    neteasePlaylistTrackIndexCache.set(key, cached);
    return cached;
  }
  if (neteasePlaylistTrackIndexInflight.has(key)) return neteasePlaylistTrackIndexInflight.get(key);
  const pending = (async () => {
    const detail = await playlist_detail({ id, s: 0, cookie: userCookie, timestamp: Date.now() });
    const pl = (detail.body && detail.body.playlist) || {};
    const rawIds = Array.isArray(pl.trackIds) && pl.trackIds.length ? pl.trackIds : (pl.tracks || []);
    const trackIds = rawIds.map(item => item && (item.id || item.songId || item.trackId)).filter(Boolean);
    const entry = {
      playlistMeta: mapNeteasePlaylistMeta(pl, id),
      trackIds,
      updatedAt: Date.now(),
    };
    if (!entry.playlistMeta.trackCount) entry.playlistMeta.trackCount = trackIds.length;
    neteasePlaylistTrackIndexCache.set(key, entry);
    pruneNeteasePlaylistTrackIndexCache();
    return entry;
  })().finally(() => {
    neteasePlaylistTrackIndexInflight.delete(key);
  });
  neteasePlaylistTrackIndexInflight.set(key, pending);
  return pending;
}

async function fetchAllNeteasePlaylistTracks(id) {
  let playlistMeta = { id, name: '', cover: '', trackCount: 0 };
  let detailTracks = [];
  try {
    const detail = await fetchNeteasePlaylistDetailMeta(id);
    playlistMeta = detail.playlistMeta || playlistMeta;
    detailTracks = detail.tracks || [];
  } catch (err) {
    console.warn('[PlaylistTracks] playlist_detail meta failed:', err.message);
  }

  const rawTracks = [];
  const seen = new Set();
  const expectedTotal = Number(playlistMeta.trackCount || 0) || 0;

  if (typeof playlist_track_all === 'function') {
    let offset = 0;
    for (let page = 0; page < NETEASE_TRACK_SYNC_MAX_PAGES; page += 1) {
      try {
        const all = await playlist_track_all({
          id,
          limit: NETEASE_TRACK_SYNC_PAGE_SIZE,
          offset,
          cookie: userCookie,
          timestamp: Date.now(),
        });
        const body = all.body || all || {};
        const rows = (body.songs || body.tracks || []);
        const added = mergeUniqueNeteaseTracks(rawTracks, rows, seen);
        if (!rows.length || !added) break;
        if (expectedTotal && rawTracks.length >= expectedTotal) break;
        if (!expectedTotal && rows.length < NETEASE_TRACK_SYNC_PAGE_SIZE) break;
        offset += NETEASE_TRACK_SYNC_PAGE_SIZE;
      } catch (err) {
        console.warn('[PlaylistTracks] playlist_track_all page failed:', id, offset, err.message);
        break;
      }
    }
  }

  if (!rawTracks.length && detailTracks.length) {
    mergeUniqueNeteaseTracks(rawTracks, detailTracks, seen);
  }

  return { playlistMeta, rawTracks };
}

async function fetchNeteasePlaylistTracksPage(id, limit, offset) {
  limit = Math.max(1, Math.min(NETEASE_TRACK_STREAM_PAGE_SIZE, parseInt(limit || '48', 10) || 48));
  offset = Math.max(0, parseInt(offset || '0', 10) || 0);
  let rawTracks = [];
  let playlistMeta = { id, name: '', cover: '', trackCount: 0 };
  let total = 0;
  let requestedCount = 0;
  try {
    const index = await fetchNeteasePlaylistTrackIndex(id);
    if (index && index.trackIds && index.trackIds.length) {
      playlistMeta = index.playlistMeta || playlistMeta;
      total = index.trackIds.length;
      const pageIds = index.trackIds.slice(offset, offset + limit);
      requestedCount = pageIds.length;
      if (pageIds.length) {
        const detail = await song_detail({ ids: pageIds.join(','), cookie: userCookie, timestamp: Date.now() });
        const body = detail.body || detail || {};
        const rows = body.songs || body.tracks || [];
        const byId = new Map(rows.map(track => [String(track && track.id || ''), track]));
        rawTracks = pageIds.map(trackId => byId.get(String(trackId))).filter(Boolean);
      }
    }
  } catch (err) {
    console.warn('[PlaylistTracks] cached track index failed:', id, offset, err.message);
  }
  if (!requestedCount && !rawTracks.length && typeof playlist_track_all === 'function') {
    const page = await playlist_track_all({ id, limit, offset, cookie: userCookie, timestamp: Date.now() });
    const body = page.body || page || {};
    rawTracks = body.songs || body.tracks || [];
    requestedCount = rawTracks.length;
    total = Number(body.total || body.count || body.songCount || body.trackCount || 0) || 0;
  }
  if (!rawTracks.length && !requestedCount && typeof playlist_detail === 'function') {
    try {
      const detail = await fetchNeteasePlaylistDetailMeta(id);
      playlistMeta = detail.playlistMeta || playlistMeta;
      total = Math.max(total, Number(playlistMeta.trackCount || 0) || 0);
      if (!rawTracks.length) rawTracks = (detail.tracks || []).slice(offset, offset + limit);
    } catch (err) {
      console.warn('[PlaylistTracks] paged metadata failed:', id, err.message);
    }
  }
  if (!playlistMeta.trackCount && total) playlistMeta.trackCount = total;
  const nextOffset = offset + Math.max(requestedCount, rawTracks.length);
  return {
    playlistMeta,
    rawTracks,
    total,
    offset,
    limit,
    nextOffset,
    hasMore: total ? nextOffset < total : rawTracks.length >= limit,
  };
}

async function filterLikelyPlayableWeatherSongs(songs) {
  const source = uniqueSongsByKey(songs)
    .filter(song => song && song.name && song.id && !isLowSignalWeatherSong(song))
    .slice(0, 24);
  const playable = [];
  const fallback = source.slice(0, 24);
  for (let i = 0; i < source.length; i += 4) {
    const chunk = source.slice(i, i + 4);
    const settled = await Promise.allSettled(chunk.map(async song => {
      const info = await handleSongUrl(song.id, { loggedIn: !!userCookie }, 'standard');
      return info && info.url ? song : null;
    }));
    settled.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) playable.push(result.value);
      else if (result.status === 'rejected') console.warn('[WeatherRadio] playable probe failed:', chunk[idx] && chunk[idx].name, result.reason && result.reason.message);
    });
    if (playable.length >= 12) break;
  }
  return (playable.length ? playable : fallback).slice(0, 24);
}

function isLowSignalWeatherSong(song) {
  const text = String([
    song && song.name,
    song && song.artist,
    song && song.album,
  ].filter(Boolean).join(' ')).toLowerCase();
  if (!text) return true;
  if (/(^|[\s\-_/（(])ai(?:\s*(歌|歌曲|音乐|cover|翻唱|生成|作曲|演唱|女声|男声)|$|[\s\-_/）)])/i.test(text)) return true;
  if (/suno|udio|人工智能|生成歌曲|ai歌曲|虚拟歌手|测试音频|demo|beat\s*maker/i.test(text)) return true;
  if (/翻自|翻唱|cover|remix|伴奏|纯音乐|钢琴|dj|live\s*版|live版|唯美钢琴|karaoke|instrumental/i.test(text)) return true;
  if (/白噪音|雨声|睡眠|助眠|冥想|疗愈频率|环境音|自然声音|asmr/i.test(text)) return true;
  if (/[（(](r&b|lofi|jazz|dj|edm|trap|remix|伴奏|纯音乐|钢琴|电子|治愈|古风|女声|男声|英文|中文版|抖音|ai)[）)]/i.test(text)) return true;
  if (/^(纯音乐|轻音乐|治愈系|放松|睡眠|雨天|阴天|夜晚|夏日|海边)$/i.test(String(song.name || '').trim())) return true;
  return false;
}

function scoreWeatherSong(song, mood) {
  const text = String((song && song.name || '') + ' ' + (song && song.artist || '') + ' ' + (song && song.album || '')).toLowerCase();
  let score = 0;
  if (song && song.cover) score += 4;
  if (song && song.duration) score += 2;
  if (song && song.weatherSource === 'daily') score += 6;
  if (song && song.weatherSource === 'private') score += 4;
  if (/周杰伦|陈奕迅|孙燕姿|五月天|王菲|陶喆|方大同|林宥嘉|蔡健雅|莫文蔚|李健|毛不易|告五人|落日飞车|陈绮贞|朴树/.test(text)) score += 10;
  const key = String(mood && mood.key || '');
  if (key.includes('rain') && /雨|阴|夜|慢|r&b|soul|陈奕迅|林宥嘉|孙燕姿/.test(text)) score += 5;
  if (key.includes('humid') && /夏|海|city|pop|落日|告五人|方大同|陶喆/.test(text)) score += 5;
  if (key.includes('night') && /夜|moon|jazz|soul|r&b|方大同|陶喆|王菲/.test(text)) score += 5;
  if (key.includes('cloudy') && /阴|民谣|indie|陈绮贞|朴树|李健/.test(text)) score += 5;
  return score;
}

function weatherArtistKey(song) {
  const raw = String(song && song.artist || song && song.name || '').split(/\s*\/\s*|、|,|&/)[0] || '';
  return raw.trim().toLowerCase() || 'unknown';
}

function weatherTitleKey(song) {
  return String(song && song.name || '')
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[\s._\-·'’"“”「」《》:：/\\|]+/g, '')
    .trim();
}

function uniqueWeatherTitles(sorted) {
  const seen = new Set();
  const out = [];
  (sorted || []).forEach(song => {
    const key = weatherTitleKey(song);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    out.push(song);
  });
  return out;
}

function diversifyWeatherSongs(sorted, artistLimit) {
  const primary = [];
  const deferred = [];
  const counts = new Map();
  (sorted || []).forEach(song => {
    const key = weatherArtistKey(song);
    const count = counts.get(key) || 0;
    if (count < artistLimit) {
      primary.push(song);
      counts.set(key, count + 1);
    } else {
      deferred.push(song);
    }
  });
  return primary.length >= 8 ? primary : primary.concat(deferred.slice(0, 8 - primary.length));
}

function orderWeatherSongs(songs, mood) {
  const sorted = uniqueSongsByKey(songs)
    .filter(song => song && song.name && song.id && !isLowSignalWeatherSong(song))
    .sort((a, b) => scoreWeatherSong(b, mood) - scoreWeatherSong(a, mood));
  return diversifyWeatherSongs(uniqueWeatherTitles(sorted), 2);
}

async function buildWeatherRadio(params) {
  let weather;
  try {
    weather = await fetchOpenMeteoWeather(params);
  } catch (e) {
    console.warn('[WeatherRadio] weather provider failed, using fallback radio:', e.message);
    weather = fallbackWeatherForRadio(params, e);
  }
  const queries = weatherRadioSeedQueries(weather.mood);
  let songs = [];
  const settled = await Promise.allSettled(queries.slice(0, 4).map(q => handleSearch(q, 6)));
  settled.forEach(result => {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) songs = songs.concat(result.value);
  });
  if (songs.length < 10 && weather.mood && Array.isArray(weather.mood.keywords)) {
    const more = await Promise.allSettled(weather.mood.keywords.slice(0, 2).map(q => handleSearch(q, 6)));
    more.forEach(result => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) songs = songs.concat(result.value);
    });
  }
  songs = orderWeatherSongs(songs, weather.mood);
  return {
    ok: true,
    weather,
    radio: {
      title: weather.mood.title,
      subtitle: weather.mood.tagline,
      seedQueries: queries.slice(0, 4),
      songs: songs.slice(0, 18),
      updatedAt: Date.now(),
    },
  };
}

function parseJSONText(text) {
  const raw = String(text || '').trim();
  const json = raw.replace(/^callback\(([\s\S]*)\);?$/, '$1');
  return JSON.parse(json);
}

async function qqMusicRequest(payload, opts) {
  opts = opts || {};
  const body = JSON.stringify(payload);
  const headers = {
    ...QQ_HEADERS,
    'Content-Type': 'application/json;charset=UTF-8',
    'Content-Length': Buffer.byteLength(body),
  };
  if (opts.cookie && qqCookie) headers.Cookie = qqCookie;
  const text = await requestText(QQ_MUSICU_URL, {
    method: 'POST',
    headers,
    timeoutMs: opts.timeoutMs,
  }, body);
  return parseJSONText(text);
}

function qqVipObjectLooksExpired(obj) {
  return qqVipObjectLooksExpiredStrict(obj);
}

function normalizeQQVipPayload(payload, fallback) {
  return normalizeQQVipPayloadStrict(payload, fallback || {});
}

function withQQVipSyncState(info, probeAvailable) {
  info = info || {};
  const authIncomplete = !!(info.loggedIn && !info.playbackKeyReady);
  const membershipUnknown = !!(info.loggedIn && info.membershipKnown !== true);
  const stalePositive = !!(info.loggedIn && info.membershipStale && info.isVip);
  const membershipStale = !!(info.loggedIn && (
    authIncomplete
    || membershipUnknown
    || stalePositive
    || (info.profileUnavailable && !probeAvailable)
  ));
  const normalized = {
    ...info,
    membershipStale,
    authorizationIncomplete: authIncomplete,
    vipSyncState: authIncomplete
      ? 'authorization_incomplete'
      : (stalePositive ? 'stale_positive' : (membershipUnknown ? 'unknown' : (probeAvailable ? 'checked' : (membershipStale ? 'stale' : 'profile')))),
  };
  return {
    ...normalized,
    membershipRights: qqVipEntitlementRights(normalized),
  };
}

function mergeQQVipStatus(info, vip, source) {
  info = info || {};
  const profilePositive = !!(
    info.isVip ||
    info.isSvip ||
    info.vipLevel === 'vip' ||
    info.vipLevel === 'svip' ||
    Number(info.vipType || 0) > 0 ||
    Number(info.svipType || 0) > 0
  );
  const probeKnown = !!(vip && vip.resolved && vip.membershipKnown !== false);
  if (!probeKnown) {
    return withQQVipSyncState({
      ...info,
      vipCheckedAt: Date.now(),
      vipProbeAvailable: false,
      vipSource: info.vipSource || 'profile',
    }, false);
  }
  // A profile positive only survives an incomplete/conflicting probe. A
  // current-account negative quorum is authoritative and must downgrade now.
  if (profilePositive && !vip.isVip && vip.authoritativeNegative !== true) {
    return withQQVipSyncState({
      ...info,
      membershipKnown: true,
      vipCheckedAt: Date.now(),
      vipProbeAvailable: true,
      vipEvidenceConflict: true,
      vipSource: info.vipSource || 'qq-profile-vip',
    }, true);
  }
  if (info.loggedIn && info.playbackKeyReady === false && !vip.isVip) {
    return withQQVipSyncState({
      ...info,
      vipCheckedAt: Date.now(),
      vipProbeAvailable: false,
      vipSource: source || vip.vipSource || info.vipSource || 'qq-vip-probe-untrusted',
    }, false);
  }
  return withQQVipSyncState({
    ...info,
    vipType: vip.vipType || 0,
    svipType: vip.svipType || 0,
    vipLevel: vip.vipLevel || 'none',
    isVip: !!vip.isVip,
    isSvip: !!vip.isSvip,
    vipLabel: vip.vipLabel || (vip.isVip ? 'VIP' : '无VIP'),
    membershipKnown: true,
    membershipStale: !!vip.membershipStale,
    vipEvidenceConflict: !!vip.vipEvidenceConflict,
    probeDecision: vip.probeDecision || '',
    authoritativeNegative: vip.authoritativeNegative === true,
    probeIncomplete: vip.probeIncomplete === true,
    negativeProbeCount: Math.max(0, Number(vip.negativeProbeCount) || 0),
    negativeQuorum: Math.max(0, Number(vip.negativeQuorum) || 0),
    staleUntil: Number(vip.staleUntil) || 0,
    expiresAt: Number(vip.expiresAt) || 0,
    vipCheckedAt: Date.now(),
    vipProbeAvailable: true,
    vipSource: source || vip.vipSource || 'qq-vip-probe',
  }, true);
}

async function fetchQQVipStatus(cookieObj, opts) {
  opts = opts || {};
  cookieObj = cookieObj || qqCookieObject();
  const uin = qqCookieUin(cookieObj);
  const musicKey = qqCookiePlaybackKey(cookieObj);
  if (!uin || !musicKey) return null;
  const cacheKey = qqVipSessionCacheKey(uin, musicKey, cookieObj);
  const cached = cacheKey ? qqVipInfoCache.get(cacheKey) : null;
  if (!opts.force && cached && Date.now() < cached.expiresAt) return cached.value;
  const comm = { uin, format: 'json', ct: 24, cv: 0 };
  if (musicKey) comm.authst = musicKey;
  const probes = [
    {
      source: 'qq-vip-query-v2-list',
      responseKey: 'req_1',
      uin: String(uin),
      body: {
        comm,
        req_1: {
          module: 'userInfo.VipQueryServer',
          method: 'SRFVipQuery_V2',
          param: { uin_list: [String(uin)] },
        },
      },
    },
    {
      source: 'qq-vip-query-v1-list',
      responseKey: 'req_1',
      uin: String(uin),
      body: {
        comm,
        req_1: {
          module: 'userInfo.VipQueryServer',
          method: 'SRFVipQuery',
          param: { uin_list: [String(uin)] },
        },
      },
    },
    {
      source: 'qq-vip-query-v2-single',
      responseKey: 'vip',
      uin: String(uin),
      body: {
        comm,
        vip: {
          module: 'userInfo.VipQueryServer',
          method: 'SRFVipQuery_V2',
          param: { uin: String(uin), uin_list: [String(uin)] },
        },
      },
    },
  ];
  const value = await resolveQQVipFromProbes(probes, async probe => {
    return qqMusicRequest(probe.body, { cookie: true, timeoutMs: 4200 });
  });
  const now = Date.now();
  const stableValue = preserveQQVipStalePositive(cached, value, { now });
  if (stableValue && stableValue.membershipStale) {
    return stableValue;
  }
  if (value && value.resolved) {
    const ttlMs = qqVipCacheTtlMs(value, {
      positiveTtlMs: QQ_VIP_INFO_CACHE_TTL_MS,
      negativeTtlMs: 30 * 1000,
    });
    if (cacheKey && ttlMs > 0) {
      qqVipInfoCache.set(cacheKey, {
        expiresAt: now + ttlMs,
        staleUntil: value.isVip
          ? Math.min(
            now + ttlMs + 10 * 60 * 1000,
            Number(value.expiresAt) > 0 ? Number(value.expiresAt) : Number.MAX_SAFE_INTEGER
          )
          : 0,
        value,
      });
    }
    return value;
  }
  if (opts.force && value && value.errorCount) {
    console.warn('[QQLogin] VIP probe incomplete:', value.errorCount + '/' + probes.length);
  }
  return null;
}

function normalizeQQProfile(body, cookieObj) {
  cookieObj = cookieObj || qqCookieObject();
  const uin = qqCookieUin(cookieObj);
  const data = (body && (body.data || body.profile || body.creator || body.result)) || {};
  const creator = (data.creator || data.user || data.profile || data) || {};
  const vipInfo = data.vipInfo || data.vipinfo || data.vip || creator.vipInfo || creator.vipinfo || {};
  const profileNick = decodeQQCookieValue(creator.nick || creator.nickname || creator.name || creator.hostname || creator.title || '');
  const profileAvatar = creator.headpic || creator.avatar || creator.avatarUrl || creator.logo || '';
  const cookieNick = qqCookieNickname(cookieObj, uin);
  const nick = profileNick || cookieNick || '';
  const avatar = profileAvatar || qqCookieAvatar(cookieObj, uin);
  // Cookie labels may survive a membership downgrade, so only current
  // official profile fields are allowed to become profile membership proof.
  const profileVip = normalizeQQVipPayload({ data, creator, vipInfo }, {});
  return {
    provider: 'qq',
    loggedIn: !!(uin && qqCookieMusicKey(cookieObj)),
    preview: false,
    userId: uin,
    nickname: nick || (uin ? ('QQ ' + uin) : 'QQ 音乐'),
    avatar,
    vipType: profileVip.vipType || 0,
    svipType: profileVip.svipType || 0,
    vipLevel: profileVip.vipLevel || 'none',
    isVip: !!profileVip.isVip,
    isSvip: !!profileVip.isSvip,
    vipLabel: profileVip.vipLabel || '无VIP',
    membershipKnown: !!profileVip.membershipKnown,
    expiresAt: Number(profileVip.expiresAt) || 0,
    hasCookie: !!qqCookie,
    playbackKeyReady: !!qqCookiePlaybackKey(cookieObj),
    profileSource: profileNick || profileAvatar ? 'qq-profile' : (cookieNick || avatar ? 'cookie' : 'fallback'),
    vipSource: profileVip.resolved ? 'qq-profile-vip' : 'profile',
  };
}

async function getQQLoginInfo(options) {
  options = options || {};
  if (options.forceCookie) refreshQQConfiguredCookieStore(true);
  const cookieObj = qqCookieObject();
  const uin = qqCookieUin(cookieObj);
  const musicKey = qqCookieMusicKey(cookieObj);
  if (!uin || !musicKey) return { provider: 'qq', loggedIn: false, hasCookie: !!qqCookie };
  const fallback = normalizeQQProfile(null, cookieObj);
  const vipProbePromise = fetchQQVipStatus(cookieObj, { force: !!options.forceVip }).catch(e => {
    if (options.forceVip) console.warn('[QQLogin] VIP probe skipped:', e.message);
    return null;
  });
  try {
    const u = new URL('https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg');
    u.searchParams.set('cid', '205360838');
    u.searchParams.set('userid', uin);
    u.searchParams.set('reqfrom', '1');
    u.searchParams.set('g_tk', '5381');
    u.searchParams.set('loginUin', uin);
    u.searchParams.set('hostUin', '0');
    u.searchParams.set('format', 'json');
    u.searchParams.set('inCharset', 'utf8');
    u.searchParams.set('outCharset', 'utf-8');
    u.searchParams.set('notice', '0');
    u.searchParams.set('platform', 'yqq.json');
    u.searchParams.set('needNewCode', '0');
    const text = await requestText(u.toString(), {
      headers: { ...QQ_HEADERS, Cookie: qqCookie },
      timeoutMs: options.forceVip ? 6500 : 10000,
    });
    const body = parseJSONText(text);
    const info = normalizeQQProfile(body, cookieObj);
    const vipProbe = await vipProbePromise;
    if (body && (body.code === 1000 || body.result === 301)) {
      return mergeQQVipStatus({ ...fallback, profileUnavailable: true }, vipProbe, vipProbe && vipProbe.vipSource);
    }
    return mergeQQVipStatus(info, vipProbe, vipProbe && vipProbe.vipSource);
  } catch (e) {
    console.warn('[QQLogin] profile check failed:', e.message);
    const vipProbe = await vipProbePromise;
    return mergeQQVipStatus({ ...fallback, profileUnavailable: true }, vipProbe, vipProbe && vipProbe.vipSource);
  }
}

async function qqGetJSON(targetUrl, params, opts) {
  opts = opts || {};
  const u = new URL(targetUrl);
  Object.keys(params || {}).forEach(k => {
    if (params[k] != null) u.searchParams.set(k, String(params[k]));
  });
  const headers = { ...QQ_HEADERS, ...(opts.headers || {}) };
  if (opts.cookie !== false && qqCookie) headers.Cookie = qqCookie;
  const text = await requestText(u.toString(), { headers });
  return parseJSONText(text);
}

function audioProxyHeadersFor(audioUrl, range) {
  const headers = { 'User-Agent': UA, Referer: 'https://music.163.com/' };
  try {
    const host = new URL(audioUrl).hostname.toLowerCase();
    if (host.includes('qq.com') || host.includes('qpic.cn')) headers.Referer = 'https://y.qq.com/';
    if (host.includes('qishui.com') || host.includes('byteimg.com') || host.includes('douyin')) headers.Referer = 'https://www.qishui.com/';
    const kugouReferer = kugouAudioReferer(audioUrl);
    if (kugouReferer) headers.Referer = kugouReferer;
  } catch (e) {}
  if (range) headers.Range = range;
  return headers;
}

function qishuiAudioAuthFromUrl(audioUrl) {
  const text = String(audioUrl || '');
  const idx = text.indexOf('#auth=');
  if (idx < 0) return { cleanUrl: text, auth: '' };
  const authRaw = text.slice(idx + 6);
  let auth = authRaw;
  try { auth = decodeURIComponent(authRaw); } catch (_) {}
  return { cleanUrl: text.slice(0, idx), auth };
}

function qishuiAudioCacheKey(cleanUrl, auth) {
  return crypto.createHash('sha1').update(String(cleanUrl || '') + '\n' + String(auth || '')).digest('hex');
}

function rememberQishuiDecryptedAudio(key, payload) {
  if (!payload || !Buffer.isBuffer(payload.buffer)) return;
  qishuiAudioDecryptCache.set(key, Object.assign({ at: Date.now() }, payload));
  qishuiAudioDecryptCacheBytes += payload.buffer.length;
  while (qishuiAudioDecryptCacheBytes > QISHUI_AUDIO_DECRYPT_CACHE_MAX_BYTES && qishuiAudioDecryptCache.size > 1) {
    const oldest = [...qishuiAudioDecryptCache.entries()].sort((a, b) => (a[1].at || 0) - (b[1].at || 0))[0];
    if (!oldest) break;
    qishuiAudioDecryptCache.delete(oldest[0]);
    qishuiAudioDecryptCacheBytes -= oldest[1].buffer.length;
  }
}

async function getQishuiDecryptedAudio(audioUrl) {
  const parsed = qishuiAudioAuthFromUrl(audioUrl);
  if (!parsed.auth) return null;
  const key = qishuiAudioCacheKey(parsed.cleanUrl, parsed.auth);
  const cached = qishuiAudioDecryptCache.get(key);
  if (cached) {
    cached.at = Date.now();
    return cached;
  }
  const up = await fetch(parsed.cleanUrl, { headers: audioProxyHeadersFor(parsed.cleanUrl, '') });
  if (!up.ok) throw new Error('Qishui encrypted audio fetch failed: HTTP ' + up.status);
  const encryptedBuffer = Buffer.from(await up.arrayBuffer());
  const result = qishuiAudioDecryptor.decrypt({ encryptedBuffer, spadeA: parsed.auth });
  const payload = {
    buffer: result.buffer,
    contentType: result.extension === '.flac' ? 'audio/flac' : 'audio/mp4',
    extension: result.extension,
  };
  rememberQishuiDecryptedAudio(key, payload);
  return payload;
}

function sendAudioBuffer(res, buffer, contentType, range) {
  const total = buffer.length;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(range || ''));
  if (match) {
    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : total - 1;
    if (!Number.isFinite(start) || start < 0) start = 0;
    if (!Number.isFinite(end) || end >= total) end = total - 1;
    if (start > end || start >= total) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + total });
      res.end();
      return;
    }
    res.writeHead(206, {
      'Content-Type': contentType || 'audio/mp4',
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
    });
    res.end(buffer.subarray(start, end + 1));
    return;
  }
  res.writeHead(200, {
    'Content-Type': contentType || 'audio/mp4',
    'Access-Control-Allow-Origin': '*',
    'Accept-Ranges': 'bytes',
    'Content-Length': total,
  });
  res.end(buffer);
}

function audioContentTypeForUrl(audioUrl, upstreamType) {
  let pathname = '';
  try { pathname = new URL(audioUrl).pathname.toLowerCase(); } catch (e) {}
  if (/\.flac$/.test(pathname)) return 'audio/flac';
  if (/\.mp3$/.test(pathname)) return 'audio/mpeg';
  if (/\.(m4a|mp4)$/.test(pathname)) return 'audio/mp4';
  if (/\.ogg$/.test(pathname)) return 'audio/ogg';
  if (/\.wav$/.test(pathname)) return 'audio/wav';
  return upstreamType || 'audio/mpeg';
}

function mapQQPlaylist(pl, kind) {
  pl = pl || {};
  const dirid = pl.dirid || pl.dir_id || '';
  const liked = Number(dirid || 0) === QQ_LIKED_DIRID || isQQFavoritePlaylist(pl);
  const id = liked ? QQ_LIKED_PLAYLIST_ID : (pl.dissid || pl.tid || dirid || pl.id || pl.diss_id);
  const rawName = pl.diss_name || pl.name || pl.title || '';
  return {
    provider: 'qq',
    source: 'qq',
    id: id ? String(id) : '',
    dirid: dirid ? String(dirid) : '',
    virtual: liked,
    name: liked ? QQ_LIKED_PLAYLIST_NAME : (decodeQQCookieValue(rawName) || rawName),
    cover: liked ? QQ_LIKED_PLAYLIST_COVER : (pl.diss_cover || pl.logo || pl.picurl || pl.cover || ''),
    trackCount: pl.song_cnt || pl.songnum || pl.total_song_num || pl.song_count || 0,
    playCount: pl.listen_num || pl.visitnum || pl.play_count || 0,
    creator: pl.hostname || pl.nick || pl.creator || 'QQ 音乐',
    subscribed: kind === 'collect',
    specialType: liked ? 5 : 0,
    requiresPlaybackKey: false,
  };
}

function mapQQPlaylistTrack(raw) {
  raw = raw || {};
  const track = raw.songid || raw.songmid || raw.mid || raw.name ? raw : (raw.track_info || raw.songInfo || raw.songinfo || raw.song || {});
  const album = track.album || {};
  const artists = mapQQArtists(track.singer || track.singers || []);
  const mid = track.mid || track.songmid || raw.mid || raw.songmid || '';
  const albumMid = album.mid || track.albummid || raw.albummid || '';
  return {
    provider: 'qq',
    source: 'qq',
    type: 'qq',
    id: mid || String(track.id || track.songid || raw.id || raw.songid || ''),
    qqId: track.id || track.songid || raw.id || raw.songid || '',
    mid,
    songmid: mid,
    mediaMid: (track.file && track.file.media_mid) || track.strMediaMid || track.media_mid || raw.strMediaMid || '',
    name: track.name || track.songname || raw.songname || '',
    artist: artists.map(a => a.name).join(' / ') || track.singername || raw.singername || '',
    artists,
    artistId: artists[0] && (artists[0].id || artists[0].mid),
    artistMid: artists[0] && artists[0].mid,
    album: album.name || album.title || track.albumname || raw.albumname || '',
    albumMid,
    cover: qqAlbumCover(albumMid, 300),
    duration: (Number(track.interval || raw.interval) || 0) * 1000,
    fee: track.pay && Number(track.pay.pay_play) ? 1 : 0,
    playable: false,
  };
}

const QQ_PLAYLIST_SYNC_PAGE_SIZE = 200;
const QQ_PLAYLIST_SYNC_MAX_PAGES = 25;

async function fetchQQCreatedPlaylists(uin) {
  const out = [];
  for (let page = 0; page < QQ_PLAYLIST_SYNC_MAX_PAGES; page += 1) {
    const sin = page * QQ_PLAYLIST_SYNC_PAGE_SIZE;
    const body = await qqGetJSON('https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss', {
      hostUin: 0,
      hostuin: uin,
      sin,
      size: QQ_PLAYLIST_SYNC_PAGE_SIZE,
      g_tk: 5381,
      loginUin: uin,
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: 0,
      platform: 'yqq.json',
      needNewCode: 0,
    }, { headers: { Referer: 'https://y.qq.com/portal/profile.html' } });
    const rows = body && body.data && Array.isArray(body.data.disslist) ? body.data.disslist : [];
    out.push.apply(out, rows);
    if (rows.length < QQ_PLAYLIST_SYNC_PAGE_SIZE) break;
  }
  return out;
}

async function fetchQQCollectedPlaylists(uin) {
  const out = [];
  for (let page = 0; page < QQ_PLAYLIST_SYNC_MAX_PAGES; page += 1) {
    const sin = page * QQ_PLAYLIST_SYNC_PAGE_SIZE;
    const body = await qqGetJSON('https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg', {
      ct: 20,
      cid: 205360956,
      userid: uin,
      reqtype: 3,
      sin,
      ein: sin + QQ_PLAYLIST_SYNC_PAGE_SIZE - 1,
    }, { headers: { Referer: 'https://y.qq.com/portal/profile.html' } });
    const rows = body && body.data && Array.isArray(body.data.cdlist) ? body.data.cdlist : [];
    out.push.apply(out, rows);
    if (rows.length < QQ_PLAYLIST_SYNC_PAGE_SIZE) break;
  }
  return out;
}

async function fetchQQLikedPlaylistPage(opts) {
  opts = opts || {};
  const limit = Math.max(1, Math.min(100, parseInt(opts.limit || '48', 10) || 48));
  const offset = Math.max(0, parseInt(opts.offset || '0', 10) || 0);
  const body = await qqMusicRequest({
    comm: { ct: 24, cv: 0 },
    req_0: {
      module: 'music.srfDissInfo.DissInfo',
      method: 'CgiGetDiss',
      param: {
        disstid: 0,
        dirid: QQ_LIKED_DIRID,
        tag: 1,
        song_begin: offset,
        song_num: limit,
        userinfo: 1,
        orderlist: 1,
      },
    },
  }, { cookie: true, timeoutMs: 10000 });
  const block = body && body.req_0;
  const data = block && block.data || {};
  const code = Number(body && body.code) || Number(block && block.code) || Number(data.code) || Number(data.subcode) || 0;
  if (!block || code !== 0) {
    const err = new Error('QQ_LIKED_SYNC_FAILED_' + code);
    err.code = [1000, 10004, 104003, 301, -100008].includes(code)
      ? 'QQ_LIKED_REQUIRES_PLAYBACK_LOGIN'
      : 'QQ_LIKED_SYNC_FAILED';
    err.qqCode = code;
    throw err;
  }
  const rawTracks = Array.isArray(data.songlist) ? data.songlist : [];
  const tracks = rawTracks.map(mapQQPlaylistTrack).filter(song => song.name && (song.mid || song.id));
  const pageSpan = Math.max(Number(data.songlist_size) || 0, rawTracks.length);
  const upstreamTotal = Math.max(0, Number(data.total_song_num) || 0);
  const total = upstreamTotal || offset + pageSpan;
  const nextOffset = offset + pageSpan;
  return {
    tracks,
    total,
    offset,
    limit,
    pageSpan,
    nextOffset,
    hasMore: !!Number(data.hasmore) || nextOffset < total,
    dirinfo: data.dirinfo || {},
  };
}

function buildQQLikedPlaylistCard(info, likedPage, warning) {
  const tracks = likedPage && likedPage.tracks || [];
  const firstTrack = tracks[0] || null;
  const pageOffset = Math.max(0, Number(likedPage && likedPage.offset) || 0);
  if (likedPage && pageOffset === 0) rememberQQLikedPlaylistCover(info, firstTrack && firstTrack.cover);
  const stableCover = getCachedQQLikedPlaylistCover(info);
  const count = Number(likedPage && likedPage.total) || tracks.length || 0;
  return {
    provider: 'qq',
    source: 'qq',
    id: QQ_LIKED_PLAYLIST_ID,
    dirid: String(QQ_LIKED_DIRID),
    virtual: true,
    name: QQ_LIKED_PLAYLIST_NAME,
    cover: stableCover || (pageOffset === 0 && firstTrack && firstTrack.cover) || QQ_LIKED_PLAYLIST_COVER,
    trackCount: count,
    playCount: 0,
    creator: info && (info.nickname || info.userId) || 'QQ 音乐',
    subscribed: false,
    specialType: 5,
    requiresPlaybackKey: warning === 'QQ_LIKED_REQUIRES_PLAYBACK_LOGIN',
    warning: warning || '',
  };
}

async function getQQLikedPlaylistCard(info) {
  if (!info || !info.playbackKeyReady) {
    return buildQQLikedPlaylistCard(info, null, 'QQ_LIKED_REQUIRES_PLAYBACK_LOGIN');
  }
  try {
    const likedPage = await fetchQQLikedPlaylistPage({ limit: 1, offset: 0 });
    return buildQQLikedPlaylistCard(info, likedPage, '');
  } catch (err) {
    return buildQQLikedPlaylistCard(info, null, err.code || err.message || 'QQ_LIKED_UNAVAILABLE');
  }
}

async function handleQQLikedPlaylistTracks(info, opts) {
  const pageLimit = Math.max(0, Math.min(500, parseInt(opts && opts.limit || '0', 10) || 0));
  const pageOffset = Math.max(0, parseInt(opts && opts.offset || '0', 10) || 0);
  if (!info || !info.playbackKeyReady) {
    return {
      loggedIn: true,
      provider: 'qq',
      playlist: buildQQLikedPlaylistCard(info, null, 'QQ_LIKED_REQUIRES_PLAYBACK_LOGIN'),
      tracks: [],
      error: 'QQ_LIKED_REQUIRES_PLAYBACK_LOGIN',
      message: QQ_LIKED_AUTH_MESSAGE,
      requiresPlaybackKey: true,
    };
  }
  let likedPage = null;
  const coverWarmup = pageOffset > 0 && !getCachedQQLikedPlaylistCover(info)
    ? getQQLikedPlaylistCard(info)
    : null;
  try {
    likedPage = await fetchQQLikedPlaylistPage({ limit: pageLimit || 48, offset: pageOffset });
    if (coverWarmup) await coverWarmup;
  } catch (err) {
    const requiresPlaybackKey = err && err.code === 'QQ_LIKED_REQUIRES_PLAYBACK_LOGIN';
    return {
      loggedIn: true,
      provider: 'qq',
      playlist: buildQQLikedPlaylistCard(info, null, err.code || err.message || 'QQ_LIKED_UNAVAILABLE'),
      tracks: [],
      error: err.code || err.message || 'QQ_LIKED_UNAVAILABLE',
      message: requiresPlaybackKey ? QQ_LIKED_AUTH_MESSAGE : 'QQ 音乐“我的喜欢”同步失败，请稍后刷新重试。',
      requiresPlaybackKey,
    };
  }
  return {
    loggedIn: true,
    provider: 'qq',
    playlist: buildQQLikedPlaylistCard(info, likedPage, ''),
    tracks: likedPage.tracks,
    total: likedPage.total,
    offset: pageOffset,
    limit: likedPage.limit,
    nextOffset: likedPage.nextOffset,
    hasMore: likedPage.hasMore,
    partial: !!pageLimit,
  };
}

async function handleQQUserPlaylists() {
  const info = await getQQLoginInfo();
  if (!info.loggedIn || !info.userId) return { loggedIn: false, provider: 'qq', playlists: [] };
  const uin = info.userId;
  const createdReq = fetchQQCreatedPlaylists(uin);
  const collectReq = fetchQQCollectedPlaylists(uin);
  const likedReq = getQQLikedPlaylistCard(info);
  const [createdRaw, collectRaw, likedRaw] = await Promise.allSettled([createdReq, collectReq, likedReq]);
  const created = createdRaw.status === 'fulfilled' && Array.isArray(createdRaw.value)
    ? createdRaw.value.map(pl => mapQQPlaylist(pl, 'created')) : [];
  const collected = collectRaw.status === 'fulfilled' && Array.isArray(collectRaw.value)
    ? collectRaw.value.map(pl => mapQQPlaylist(pl, 'collect')) : [];
  const likedCard = likedRaw.status === 'fulfilled' ? likedRaw.value : buildQQLikedPlaylistCard(info, null, 'QQ_LIKED_UNAVAILABLE');
  const seen = new Set();
  const base = created.concat(collected).filter(pl => !isQQFavoritePlaylist(pl));
  base.unshift(likedCard);
  const playlists = base.filter(pl => {
    if (!pl.id || !pl.name || seen.has(pl.id)) return false;
    if (isQzoneBackgroundPlaylist(pl)) return false;
    seen.add(pl.id);
    return true;
  }).sort((a, b) => Number(isQQFavoritePlaylist(b)) - Number(isQQFavoritePlaylist(a)));
  return { loggedIn: true, provider: 'qq', userId: uin, playlists };
}

async function handleQQPlaylistTracks(id, opts) {
  opts = opts || {};
  const info = await getQQLoginInfo();
  if (!info.loggedIn || !info.userId) return { loggedIn: false, provider: 'qq', tracks: [] };
  const pid = String(id || '').trim();
  if (!pid) return { loggedIn: true, provider: 'qq', error: 'Missing QQ playlist id', tracks: [] };
  if (isQQLikedPlaylistId(pid)) return handleQQLikedPlaylistTracks(info, opts);
  const pageLimit = Math.max(0, Math.min(500, parseInt(opts.limit || '0', 10) || 0));
  const pageOffset = Math.max(0, parseInt(opts.offset || '0', 10) || 0);
  const result = await qqGetJSON('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg', {
    type: 1,
    utf8: 1,
    disstid: pid,
    song_begin: pageOffset,
    song_num: pageLimit || undefined,
    loginUin: info.userId,
    format: 'json',
    inCharset: 'utf8',
    outCharset: 'utf-8',
    notice: 0,
    platform: 'yqq.json',
    needNewCode: 0,
  }, { headers: { Referer: 'https://y.qq.com/n/yqq/playlist' } });
  const detail = result && result.cdlist && result.cdlist[0] ? result.cdlist[0] : {};
  let rawTracks = Array.isArray(detail.songlist) ? detail.songlist : [];
  const totalHint = Number(detail.total_song_num || detail.songnum || detail.song_cnt || detail.song_count || 0) || 0;
  if (pageLimit && rawTracks.length > pageLimit) {
    rawTracks = totalHint && rawTracks.length < totalHint
      ? rawTracks.slice(0, pageLimit)
      : rawTracks.slice(pageOffset, pageOffset + pageLimit);
  }
  const tracks = rawTracks.map(mapQQPlaylistTrack).filter(s => s.name && (s.mid || s.id));
  const total = totalHint || tracks.length;
  const playlist = {
    provider: 'qq',
    id: pid,
    name: detail.dissname || detail.diss_name || detail.name || '',
    cover: detail.logo || detail.diss_cover || '',
    trackCount: total,
  };
  return {
    loggedIn: true,
    provider: 'qq',
    playlist,
    tracks,
    offset: pageOffset,
    limit: pageLimit || tracks.length,
    nextOffset: pageOffset + tracks.length,
    hasMore: pageLimit ? (pageOffset + tracks.length < total || tracks.length >= pageLimit) : false,
    partial: !!pageLimit,
    total,
  };
}

function qqAlbumCover(albumMid, size) {
  if (!albumMid) return '';
  const px = size || 300;
  return 'https://y.qq.com/music/photo_new/T002R' + px + 'x' + px + 'M000' + albumMid + '.jpg?max_age=2592000';
}

function qqSingerAvatar(singerMid, size) {
  if (!singerMid) return '';
  const px = size || 300;
  return 'https://y.qq.com/music/photo_new/T001R' + px + 'x' + px + 'M000' + singerMid + '.jpg?max_age=2592000';
}

function mapQQArtists(raw) {
  return (raw || [])
    .map(a => ({
      id: a && a.id,
      mid: a && a.mid,
      name: (a && (a.name || a.title)) || '',
    }))
    .filter(a => a.name);
}

function mapQQSmartSong(item) {
  item = item || {};
  const mid = item.mid || item.songmid || item.id || '';
  return {
    provider: 'qq',
    source: 'qq',
    type: 'qq',
    id: mid,
    qqId: item.id || item.docid || '',
    mid,
    songmid: mid,
    name: item.name || item.title || '',
    artist: item.singer || '',
    artists: item.singer ? [{ name: item.singer }] : [],
    album: '',
    cover: '',
    duration: 0,
    fee: 0,
    playable: false,
  };
}

function mapQQTrack(track, fallback) {
  track = track || {};
  fallback = fallback || {};
  const album = track.album || {};
  const artists = mapQQArtists(track.singer || []);
  const mid = track.mid || fallback.mid || fallback.songmid || '';
  const albumMid = album.mid || album.pmid || '';
  return {
    provider: 'qq',
    source: 'qq',
    type: 'qq',
    id: mid,
    qqId: track.id || fallback.qqId || fallback.id || '',
    mid,
    songmid: mid,
    mediaMid: track.file && track.file.media_mid,
    name: track.name || track.title || fallback.name || '',
    artist: artists.map(a => a.name).join(' / ') || fallback.artist || '',
    artists: artists.length ? artists : (fallback.artists || []),
    artistId: artists[0] && (artists[0].id || artists[0].mid),
    artistMid: artists[0] && artists[0].mid,
    album: album.name || album.title || fallback.album || '',
    albumMid,
    cover: qqAlbumCover(albumMid, 300) || fallback.cover || '',
    duration: (Number(track.interval) || 0) * 1000,
    fee: track.pay && Number(track.pay.pay_play) ? 1 : 0,
    playable: false,
  };
}

async function qqSmartboxSearch(keywords, limit) {
  const u = new URL(QQ_SMARTBOX_URL);
  u.searchParams.set('format', 'json');
  u.searchParams.set('key', keywords);
  u.searchParams.set('g_tk', '5381');
  u.searchParams.set('loginUin', '0');
  u.searchParams.set('hostUin', '0');
  u.searchParams.set('inCharset', 'utf8');
  u.searchParams.set('outCharset', 'utf-8');
  u.searchParams.set('notice', '0');
  u.searchParams.set('platform', 'yqq.json');
  u.searchParams.set('needNewCode', '0');
  const text = await requestText(u.toString(), { headers: QQ_HEADERS });
  const json = parseJSONText(text);
  const items = json && json.data && json.data.song && json.data.song.itemlist;
  return (Array.isArray(items) ? items : []).slice(0, Math.max(1, Math.min(limit || 6, 10))).map(mapQQSmartSong);
}

function qqSearchSign(text) {
  const hash = crypto.createHash('sha1').update(text).digest('hex');
  const part1 = [23, 14, 6, 36, 16, 40, 7, 19].map(index => hash[index]).join('');
  const part2 = [16, 1, 32, 12, 19, 27, 8, 5].map(index => hash[index]).join('');
  const scramble = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179];
  const bytes = scramble.map((value, index) => value ^ parseInt(hash.slice(index * 2, index * 2 + 2), 16));
  const middle = Buffer.from(bytes).toString('base64').replace(/[\\/+=]/g, '');
  return `zzc${part1}${middle}${part2}`.toLowerCase();
}

async function qqFullSongSearch(keywords, limit, offset) {
  limit = Math.max(1, Math.min(30, Number(limit) || 12));
  offset = Math.max(0, Number(offset) || 0);
  const pageNumber = Math.floor(offset / limit) + 1;
  const payload = {
    comm: {
      ct: '11', cv: '14090508', v: '14090508', tmeAppID: 'qqmusic',
      phonetype: 'EBG-AN10', os_ver: '12', OpenUDID: '0', QIMEI36: '0',
      udid: '0', chid: '0', aid: '0', oaid: '0', taid: '0', tid: '0',
      wid: '0', uid: '0', sid: '0', modeSwitch: '6', teenMode: '0',
      ui_mode: '2', nettype: '1020',
    },
    req: {
      module: 'music.search.SearchCgiService',
      method: 'DoSearchForQQMusicMobile',
      param: {
        search_type: 0,
        searchid: String(Date.now()) + String(Math.random()).slice(2, 8),
        query: keywords,
        page_num: pageNumber,
        num_per_page: limit,
        highlight: 0,
        nqc_flag: 0,
        multi_zhida: 0,
        cat: 2,
        grp: 1,
        sin: offset,
        sem: 0,
      },
    },
  };
  const bodyText = JSON.stringify(payload);
  const json = await requestJson(
    'https://u.y.qq.com/cgi-bin/musics.fcg?sign=' + qqSearchSign(bodyText),
    {
      method: 'POST',
      timeoutMs: 10000,
      headers: {
        'User-Agent': 'QQMusic 14090508(android 12)',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyText),
      },
    },
    bodyText
  );
  const data = json && json.req && json.req.data;
  const body = data && (data.body || data);
  const items = body && (body.item_song || body.song && body.song.list || body.list);
  return (Array.isArray(items) ? items : [])
    .map(item => mapQQTrack(item && (item.track_info || item.songInfo || item.songinfo || item.song) || item, {}))
    .filter(song => song && song.name && (song.mid || song.id));
}

async function qqSongDetail(mid, fallback) {
  if (!mid) return fallback;
  const json = await qqMusicRequest({
    comm: { ct: 24, cv: 0 },
    songinfo: {
      module: 'music.pf_song_detail_svr',
      method: 'get_song_detail_yqq',
      param: { song_mid: mid },
    },
  });
  const data = json && json.songinfo && json.songinfo.data;
  return mapQQTrack(data && data.track_info, fallback);
}

async function handleQQArtistDetail(mid, limit) {
  const singerMid = String(mid || '').trim();
  const num = Math.max(10, Math.min(80, parseInt(limit || '36', 10) || 36));
  if (!singerMid) return { provider: 'qq', error: 'MISSING_SINGER_MID', artist: null, songs: [] };
  const json = await qqMusicRequest({
    comm: { ct: 24, cv: 0 },
    singer: {
      module: 'music.web_singer_info_svr',
      method: 'get_singer_detail_info',
      param: { sort: 5, singermid: singerMid, sin: 0, num },
    },
  }, { cookie: true });
  const block = json && json.singer;
  if (!block || Number(block.code || 0) !== 0) {
    return { provider: 'qq', error: block && (block.message || block.msg || block.code) || 'QQ_ARTIST_DETAIL_FAILED', artist: null, songs: [] };
  }
  const data = block.data || {};
  const info = data.singer_info || data.singerInfo || {};
  const rawSongs = Array.isArray(data.songlist) ? data.songlist : [];
  const songs = rawSongs
    .map(raw => mapQQTrack(raw && (raw.track_info || raw.songInfo || raw.songinfo || raw.song) || raw, {}))
    .filter(song => song && song.name && (song.mid || song.id));
  const matchedSongArtist = songs[0] && (songs[0].artists || []).find(a => a && a.mid === singerMid);
  const artistMid = info.mid || singerMid;
  const artistName = info.name || info.title || (matchedSongArtist && matchedSongArtist.name) || '';
  const totalSong = Number(data.total_song || data.song_count || 0) || songs.length;
  return {
    provider: 'qq',
    artist: {
      provider: 'qq',
      id: info.id || '',
      mid: artistMid,
      name: artistName,
      avatar: info.pic || info.avatar || qqSingerAvatar(artistMid, 300),
      fans: Number(info.fans || 0) || 0,
      musicSize: totalSong,
      albumSize: Number(data.total_album || 0) || 0,
      mvSize: Number(data.total_mv || 0) || 0,
    },
    total: totalSong,
    songs,
  };
}

async function handleQQAlbumDetail(mid, limit) {
  const albumMid = String(mid || '').trim();
  const num = Math.max(10, Math.min(120, parseInt(limit || '80', 10) || 80));
  if (!albumMid) return { provider: 'qq', error: 'MISSING_ALBUM_MID', album: null, songs: [] };
  const body = await qqGetJSON('https://c.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg', {
    albummid: albumMid,
    g_tk: 5381,
    loginUin: '0',
    hostUin: '0',
    format: 'json',
    inCharset: 'utf8',
    outCharset: 'utf-8',
    notice: 0,
    platform: 'yqq.json',
    needNewCode: 0,
  }, { headers: { Referer: 'https://y.qq.com/n/ryqq/albumDetail/' + encodeURIComponent(albumMid) } });
  const data = body && body.data || {};
  const rawSongs = Array.isArray(data.list) ? data.list : (Array.isArray(data.songlist) ? data.songlist : []);
  const songs = rawSongs
    .slice(0, num)
    .map(raw => {
      const song = mapQQPlaylistTrack(Object.assign({}, raw, {
        albummid: raw.albummid || albumMid,
        albumname: raw.albumname || data.name || data.title || data.albumname || '',
      }));
      if (song && !song.cover) song.cover = qqAlbumCover(albumMid, 300);
      if (song && !song.albumMid) song.albumMid = albumMid;
      return song;
    })
    .filter(song => song && song.name && (song.mid || song.id));
  const singerName = data.singername || data.singerName || data.singer_name || (songs[0] && songs[0].artist) || '';
  return {
    provider: 'qq',
    album: {
      provider: 'qq',
      mid: albumMid,
      albumMid,
      id: data.id || data.albumid || '',
      name: data.name || data.title || data.albumname || '',
      artist: singerName,
      cover: qqAlbumCover(albumMid, 300),
      releaseDate: data.aDate || data.publictime || data.pub_time || '',
      trackCount: Number(data.total_song_num || data.total || data.songnum || rawSongs.length) || songs.length,
    },
    songs,
    total: Number(data.total_song_num || data.total || data.songnum || rawSongs.length) || songs.length,
  };
}

async function handleQQSearch(keywords, limit, offset) {
  const kw = String(keywords || '').trim();
  if (!kw) return [];
  limit = Math.max(1, Math.min(30, Number(limit) || 12));
  offset = Math.max(0, Number(offset) || 0);
  console.log('[QQSearch]', kw, 'limit:', limit, 'offset:', offset);
  let base = [];
  try {
    base = await qqFullSongSearch(kw, limit, offset);
  } catch (err) {
    console.warn('[QQSearch] full search failed:', err.message);
  }
  if (!base.length && offset === 0) base = await qqSmartboxSearch(kw, limit);
  const detailed = await Promise.all(base.map(async item => {
    try { return await qqSongDetail(item.mid, item); }
    catch (e) {
      console.warn('[QQSearch] detail failed:', item.mid, e.message);
      return item;
    }
  }));
  const seen = new Set();
  return detailed.filter(song => {
    const key = song && (song.mid || song.id || (song.name + '|' + song.artist));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return !!song.name;
  });
}

function truthyQQPlaybackHint(value) {
  const text = String(value == null ? '' : value).trim().toLowerCase();
  return value === true || text === '1' || text === 'true' || text === 'yes' || text === 'vip';
}

function qqPlaybackMemberHints(hints) {
  hints = hints || {};
  const fee = Number(hints.fee || hints.Fee || 0) || 0;
  const privilege = Number(hints.privilege || hints.Privilege || hints.mediaPrivilege || hints.media_privilege || 0) || 0;
  return !!(
    truthyQQPlaybackHint(hints.vipRequired) ||
    truthyQQPlaybackHint(hints.needVip) ||
    truthyQQPlaybackHint(hints.onlyVipPlayable) ||
    truthyQQPlaybackHint(hints.only_vip_playable) ||
    fee > 0 ||
    privilege >= 9
  );
}

// Keep the complete vkey + media verification path below the renderer's
// 15-second QQ request deadline (6.0s + 6.2s, with ~2.8s response margin).
const QQ_VKEY_REQUEST_TIMEOUT_MS = 6000;
const QQ_AUDIO_PROBE_TOTAL_MS = 6200;
const QQ_AUDIO_PROBE_ATTEMPT_MS = 2000;
const AUDIO_URL_PROBE_BYTES = 8192;
function audioProbeMagic(buffer) {
  if (!buffer || !buffer.length) return '';
  if (buffer.length >= 3 && buffer.subarray(0, 3).toString('ascii') === 'ID3') return 'mp3-id3';
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'fLaC') return 'flac';
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'OggS') return 'ogg';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE') return 'wave';
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') return 'mp4';
  const scan = Math.min(buffer.length - 1, 2048);
  for (let i = 0; i < scan; i++) {
    if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0) return 'mpeg-frame';
  }
  return '';
}
async function probePlaybackAudioUrl(audioUrl, timeoutMs) {
  try {
    const probeStartedAt = Date.now();
    const probeBudgetMs = Math.max(800, Number(timeoutMs) || QQ_AUDIO_PROBE_ATTEMPT_MS);
    const resp = await fetchWithTimeout(audioUrl, {
      headers: audioProxyHeadersFor(audioUrl, 'bytes=0-' + (AUDIO_URL_PROBE_BYTES - 1)),
    }, probeBudgetMs);
    const status = Number(resp.status) || 0;
    const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
    const chunks = [];
    let bytes = 0;
    if (resp.body && (status === 200 || status === 206)) {
      const reader = resp.body.getReader();
      const deadline = probeStartedAt + probeBudgetMs;
      try {
        while (bytes < AUDIO_URL_PROBE_BYTES && Date.now() < deadline) {
          const chunk = await readStreamChunkWithTimeout(reader, Math.max(50, deadline - Date.now()));
          if (chunk.done) break;
          const buf = Buffer.from(chunk.value || []);
          if (!buf.length) continue;
          chunks.push(buf);
          bytes += buf.length;
        }
      } finally {
        try { await reader.cancel(); } catch (_) {}
      }
    } else {
      try { if (resp.body && typeof resp.body.cancel === 'function') await resp.body.cancel(); } catch (_) {}
    }
    const sample = chunks.length ? Buffer.concat(chunks, bytes).subarray(0, AUDIO_URL_PROBE_BYTES) : Buffer.alloc(0);
    const magic = audioProbeMagic(sample);
    const contentLooksText = /text\/html|application\/(json|xml)|text\/plain/.test(contentType);
    return {
      ok: (status === 200 || status === 206) && sample.length >= 512 && !contentLooksText && !!magic,
      status,
      bytes: sample.length,
      contentType,
      magic,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      reason: err && err.name === 'AbortError' ? 'timeout' : 'network',
    };
  }
}
async function probeQQAudioUrl(audioUrl, timeoutMs) {
  return probePlaybackAudioUrl(audioUrl, timeoutMs || QQ_AUDIO_PROBE_ATTEMPT_MS);
}

async function handleQQSongUrl(mid, mediaMid, qualityPreference, playbackHints) {
  const songmid = String(mid || '').trim();
  if (!songmid) return { provider: 'qq', url: '', error: 'MISSING_MID', message: 'Missing QQ song mid' };
  const guid = String(10000000 + Math.floor(Math.random() * 90000000));
  const cookieObj = qqCookieObject();
  const uin = qqCookieUin(cookieObj) || '0';
  const playbackKey = qqCookiePlaybackKey(cookieObj);
  const musicKey = playbackKey;
  const fileMediaMid = String(mediaMid || '').trim();
  const requestedQuality = normalizeQualityPreference(qualityPreference);
  const memberTrackHint = qqPlaybackMemberHints(playbackHints);
  const hasQQPlaybackSession = !!(uin && uin !== '0' && musicKey);
  const mediaIds = [];
  if (fileMediaMid) mediaIds.push(fileMediaMid);
  if (songmid && !mediaIds.includes(songmid)) mediaIds.push(songmid);
  const fileCandidates = mediaIds.flatMap(mediaId =>
    qualityCandidatesFrom(requestedQuality, QQ_QUALITY_CANDIDATE_TEMPLATES)
      .map(item => ({ ...item, mediaId, filename: item.prefix + mediaId + item.ext }))
  );
  const filenames = fileCandidates.map(item => item.filename);
  const param = {
    guid,
    songmid: filenames.length ? filenames.map(() => songmid) : [songmid],
    songtype: filenames.length ? filenames.map(() => 0) : [0],
    uin,
    loginflag: 1,
    platform: '20',
  };
  if (filenames.length) param.filename = filenames;
  const comm = { uin, format: 'json', ct: musicKey ? 19 : 24, cv: 0 };
  if (musicKey) comm.authst = musicKey;
  const json = await qqMusicRequest({
    comm,
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param,
    },
  }, { cookie: true, timeoutMs: QQ_VKEY_REQUEST_TIMEOUT_MS });
  const data = json && json.req_0 && json.req_0.data;
  const infos = (data && Array.isArray(data.midurlinfo)) ? data.midurlinfo : [];
  const purlInfos = infos.filter(item => item && item.purl);
  const sips = (data && Array.isArray(data.sip) && data.sip.length ? data.sip : ['https://ws.stream.qqmusic.qq.com/']).filter(Boolean);
  const probeDeadline = Date.now() + QQ_AUDIO_PROBE_TOTAL_MS;
  const probeFailures = [];
  let playableInfo = null;
  let playableUrl = '';
  for (let infoIndex = 0; infoIndex < purlInfos.length && !playableUrl; infoIndex++) {
    const candidateInfo = purlInfos[infoIndex];
    for (let sipIndex = 0; sipIndex < sips.length && !playableUrl; sipIndex++) {
      const remainingMs = probeDeadline - Date.now();
      if (remainingMs < 300) break;
      const candidateUrl = String(sips[sipIndex] || '') + String(candidateInfo.purl || '');
      const probe = await probeQQAudioUrl(candidateUrl, Math.min(QQ_AUDIO_PROBE_ATTEMPT_MS, remainingMs));
      if (probe.ok) {
        playableInfo = candidateInfo;
        playableUrl = candidateUrl;
        break;
      }
      const probeMeta = fileCandidates.find(item => item.filename === candidateInfo.filename) || {};
      probeFailures.push((probeMeta.label || candidateInfo.filename || 'unknown') + ':' + (probe.status || probe.reason || 'failed'));
    }
  }
  const info = playableInfo || purlInfos[0] || infos[0];
  if (playableUrl && playableInfo) {
    const info = playableInfo;
    const fileMeta = fileCandidates.find(item => item.filename === info.filename) || {};
    return {
      provider: 'qq',
      url: playableUrl,
      trial: false,
      playable: true,
      playbackReady: true,
      loggedIn: hasQQPlaybackSession,
      userId: hasQQPlaybackSession ? uin : '',
      playbackKeyReady: !!(uin && playbackKey),
      vipRequired: memberTrackHint,
      level: fileMeta.level || info.filename || '',
      quality: fileMeta.label || info.filename || '',
      filename: info.filename || '',
      probeFailures: probeFailures.slice(0, 12),
      requestedQuality,
    };
  }
  const restriction = classifyQQPlaybackRestriction(info, {
    hasSession: !!(uin && musicKey),
    hasPlaybackKey: !!(uin && playbackKey),
  });
  return {
    provider: 'qq',
    url: '',
    playable: false,
    error: 'QQ_URL_UNAVAILABLE',
    loggedIn: hasQQPlaybackSession,
    playbackKeyReady: !!(uin && playbackKey),
    userId: hasQQPlaybackSession ? uin : '',
    vipRequired: memberTrackHint,
    restriction,
    reason: restriction.category,
    message: restriction.message,
    qqCode: info && (info.result || info.code || info.errtype),
    rawMessage: info && (info.msg || info.tips || info.errmsg || ''),
    tried: fileCandidates.map(item => item.label + ' · ' + item.filename),
    probeFailures: probeFailures.slice(0, 12),
    requestedQuality,
  };
}

function mapQQComment(raw) {
  raw = raw || {};
  const user = raw.user || raw.uin || {};
  const nickname = raw.nick || raw.nickname || raw.encrypt_uin || user.nick || user.nickname || user.name || 'QQ 音乐用户';
  const avatar = raw.avatarurl || raw.avatar || user.avatarurl || user.avatar || '';
  const timeRaw = Number(raw.time || raw.commenttime || raw.createTime || 0) || 0;
  return {
    id: raw.commentid || raw.commentId || raw.id || '',
    content: raw.rootcommentcontent || raw.content || raw.comment || '',
    likedCount: Number(raw.praisenum || raw.praise_num || raw.likedCount || 0) || 0,
    time: timeRaw && timeRaw < 10000000000 ? timeRaw * 1000 : timeRaw,
    user: {
      id: raw.encrypt_uin || raw.uin || user.uin || '',
      nickname,
      avatar,
    },
  };
}

async function handleQQSongComments(id, mid, limit, offset) {
  let topid = String(id || '').replace(/\D/g, '');
  if (!topid && mid) {
    try {
      const detail = await qqSongDetail(mid, { mid });
      topid = String((detail && (detail.qqId || detail.id)) || '').replace(/\D/g, '');
    } catch (e) {
      console.warn('[QQComments] detail fallback failed:', e.message);
    }
  }
  if (!topid) return { provider: 'qq', error: 'Missing QQ song id', comments: [] };
  const page = Math.max(0, Math.floor((offset || 0) / Math.max(1, limit || 20)));
  const uin = qqCookieUin() || '0';
  const body = await qqGetJSON('https://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg', {
    g_tk: '5381',
    loginUin: uin,
    hostUin: '0',
    format: 'json',
    inCharset: 'utf8',
    outCharset: 'utf-8',
    notice: '0',
    platform: 'yqq.json',
    needNewCode: '0',
    cid: '205360772',
    reqtype: '2',
    biztype: '1',
    topid,
    cmd: '8',
    needmusiccrit: '0',
    pagenum: String(page),
    pagesize: String(limit || 20),
  }, { headers: { Referer: 'https://y.qq.com/n/ryqq/songDetail/' + encodeURIComponent(mid || topid) } });
  const hotList = body && body.hot_comment && body.hot_comment.commentlist;
  const normalList = body && body.comment && body.comment.commentlist;
  const raw = (offset === 0 && Array.isArray(hotList) && hotList.length) ? hotList : (normalList || []);
  const comments = (raw || []).map(mapQQComment).filter(c => c.content);
  const total = Number(body && body.comment && (body.comment.commenttotal || body.comment.comment_total)) || comments.length;
  return { provider: 'qq', id: topid, total, comments, hot: !!(offset === 0 && Array.isArray(hotList) && hotList.length) };
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

function decodeQQLyricText(text) {
  let raw = decodeHtmlEntities(String(text || '').trim());
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '');
  const looksBase64 = compact.length >= 8 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
  if (looksBase64 && !/^\s*\[/.test(raw)) {
    try {
      const decoded = Buffer.from(compact, 'base64').toString('utf8').replace(/^\uFEFF/, '');
      if (decoded && (decoded.includes('[') || /[\u4e00-\u9fa5]/.test(decoded))) raw = decoded;
    } catch (e) {
      console.warn('[QQLyric] base64 decode failed:', e.message);
    }
  }
  return decodeHtmlEntities(raw).replace(/\r\n/g, '\n').trim();
}

function normalizeQQSongId(id) {
  const n = String(id || '').replace(/\D/g, '');
  return n ? Number(n) : 0;
}

async function handleQQLyric(mid, id) {
  const songMID = String(mid || '').trim();
  const songID = normalizeQQSongId(id);
  if (!songMID && !songID) return { provider: 'qq', error: 'Missing QQ song mid or id', lyric: '' };

  let lyricText = '';
  let transText = '';
  let qrcText = '';
  let romaText = '';
  let source = 'qq-musicu';

  try {
    const param = {};
    if (songMID) param.songMID = songMID;
    if (songID) param.songID = songID;
    const json = await qqMusicRequest({
      comm: { ct: 24, cv: 0 },
      lyric: {
        module: 'music.musichallSong.PlayLyricInfo',
        method: 'GetPlayLyricInfo',
        param,
      },
    }, { cookie: true });
    const data = json && json.lyric && json.lyric.data;
    lyricText = decodeQQLyricText(data && data.lyric);
    transText = decodeQQLyricText(data && data.trans);
    qrcText = decodeQQLyricText(data && data.qrc);
    romaText = decodeQQLyricText(data && data.roma);
  } catch (e) {
    console.warn('[QQLyric] musicu failed:', e.message);
  }

  if (!lyricText && songMID) {
    try {
      const body = await qqGetJSON('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg', {
        songmid: songMID,
        songtype: '0',
        format: 'json',
        nobase64: '1',
        g_tk: '5381',
        loginUin: qqCookieUin() || '0',
        hostUin: '0',
        inCharset: 'utf8',
        outCharset: 'utf-8',
        notice: '0',
        platform: 'yqq.json',
        needNewCode: '0',
      }, { headers: { Referer: 'https://y.qq.com/portal/player.html' } });
      lyricText = decodeQQLyricText(body && body.lyric);
      transText = decodeQQLyricText(body && (body.trans || body.tlyric)) || transText;
      source = 'qq-legacy';
    } catch (e) {
      console.warn('[QQLyric] legacy failed:', e.message);
    }
  }

  return {
    provider: 'qq',
    id: songID || '',
    mid: songMID,
    lyric: lyricText,
    tlyric: transText,
    yrc: '',
    qrc: qrcText,
    roma: romaText,
    source: lyricText ? source : 'qq-empty',
  };
}

function mapPodcastRadio(r) {
  r = r || {};
  const dj = r.dj || r.djSimple || r.djUser || r.creator || {};
  const id = r.id || r.rid || r.radioId;
  return {
    id,
    rid: id,
    name: r.name || r.radioName || '',
    cover: r.picUrl || r.picURL || r.coverUrl || r.coverImgUrl || r.avatarUrl || '',
    desc: r.desc || r.description || r.rcmdText || '',
    djName: dj.nickname || r.djName || r.nickname || '',
    category: r.category || r.categoryName || '',
    programCount: r.programCount || r.programNum || r.programCnt || 0,
    subCount: r.subCount || r.subedCount || r.subscriberCount || 0,
  };
}

function mapPodcastProgram(p, fallbackRadio) {
  p = p || {};
  const mainSong = p.mainSong || p.song || p.mainTrack || {};
  const radio = p.radio || fallbackRadio || {};
  const mappedRadio = mapPodcastRadio(radio);
  const artists = mapArtists(mainSong.ar || mainSong.artists || []);
  const album = mainSong.al || mainSong.album || {};
  const dj = p.dj || radio.dj || {};
  const playableId = mainSong.id || p.mainSongId || p.songId;
  return {
    type: 'podcast',
    source: 'podcast',
    id: playableId,
    programId: p.id || p.programId,
    radioId: mappedRadio.id,
    name: p.name || mainSong.name || '',
    artist: mappedRadio.name || dj.nickname || artists.map(a => a.name).join(' / ') || mappedRadio.djName || '',
    artists,
    artistId: artists[0] && artists[0].id,
    album: mappedRadio.name || album.name || 'Podcast',
    cover: p.coverUrl || p.cover || p.blurCoverUrl || mappedRadio.cover || album.picUrl || '',
    duration: p.duration || mainSong.dt || mainSong.duration || 0,
    fee: mainSong.fee,
    djName: mappedRadio.djName || dj.nickname || '',
    radioName: mappedRadio.name || '',
    desc: p.description || p.desc || '',
    createTime: p.createTime || 0,
    serialNum: p.serialNum || p.serial || 0,
  };
}

function firstArrayFrom(obj, keys) {
  obj = obj || {};
  for (const key of keys) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.list)) return value.list;
    if (value && Array.isArray(value.data)) return value.data;
    if (value && Array.isArray(value.resources)) return value.resources;
  }
  return [];
}

function mapPodcastVoice(v) {
  v = v || {};
  const raw = v.resource || v.voice || v.data || v.program || v;
  const mainSong = raw.mainSong || raw.song || raw.track || {};
  const radio = raw.radio || raw.djRadio || raw.voiceList || raw.podcast || {};
  const playableId = raw.trackId || raw.songId || raw.mainSongId || mainSong.id || raw.id;
  return {
    type: 'podcast',
    source: 'podcast',
    sourceType: 'podcast-voice',
    id: playableId,
    programId: raw.programId || raw.voiceId || raw.id,
    radioId: radio.id || radio.radioId || radio.voiceListId || raw.radioId || raw.voiceListId,
    name: raw.name || raw.songName || raw.title || mainSong.name || '',
    artist: (radio.name || radio.radioName || radio.voiceListName || raw.podcastName || raw.djName || 'Voice'),
    album: radio.name || radio.radioName || raw.podcastName || 'Podcast',
    cover: raw.coverUrl || raw.cover || raw.picUrl || raw.coverImgUrl || radio.picUrl || radio.coverUrl || '',
    duration: raw.duration || raw.durationMs || mainSong.dt || mainSong.duration || 0,
    djName: raw.djName || (radio.dj && radio.dj.nickname) || '',
    radioName: radio.name || radio.radioName || raw.podcastName || '',
    desc: raw.desc || raw.description || '',
  };
}

function mapPodcastCollectionRadio(r, key) {
  const radio = mapPodcastRadio(r);
  return {
    ...radio,
    type: 'podcast-radio',
    sourceType: 'podcast-radio',
    collectionKey: key || '',
    radioId: radio.id,
    name: radio.name,
    artist: radio.djName || radio.category || 'Podcast',
    album: radio.category || 'Podcast',
  };
}

function podcastCollectionMeta(key, items) {
  const meta = {
    collect: { key: 'collect', title: '收藏播客', sub: '你收藏的播客', itemType: 'radio' },
    created: { key: 'created', title: '创建播客', sub: '你创建的播客', itemType: 'radio' },
    liked: { key: 'liked', title: '喜欢的声音', sub: '收藏或最近喜欢的声音', itemType: 'voice' },
  }[key] || { key, title: key, sub: '', itemType: 'radio' };
  const first = (items || [])[0] || {};
  return {
    ...meta,
    count: (items || []).length,
    cover: first.cover || first.picUrl || first.coverUrl || '',
  };
}

async function fetchMyPodcastItems(key, info, limit, offset) {
  limit = Math.max(8, Math.min(60, Number(limit) || 30));
  offset = Math.max(0, Number(offset) || 0);
  if (key === 'collect') {
    const r = await dj_sublist({ limit, offset, cookie: userCookie, timestamp: Date.now() });
    const raw = firstArrayFrom(r.body, ['djRadios', 'djradios', 'radios', 'data']);
    return { itemType: 'radio', items: raw.map(x => mapPodcastCollectionRadio(x, key)).filter(x => x.id) };
  }
  if (key === 'created') {
    const r = await user_audio({ uid: info.userId, cookie: userCookie, timestamp: Date.now() });
    const raw = firstArrayFrom(r.body, ['data', 'djRadios', 'djradios', 'radios']);
    return { itemType: 'radio', items: raw.map(x => mapPodcastCollectionRadio(x, key)).filter(x => x.id) };
  }
  if (key === 'paid') {
    const r = await dj_paygift({ limit, offset, cookie: userCookie, timestamp: Date.now() });
    const raw = firstArrayFrom(r.body, ['data', 'djRadios', 'djradios', 'radios']);
    return { itemType: 'radio', items: raw.map(x => mapPodcastCollectionRadio(x, key)).filter(x => x.id) };
  }
  if (key === 'liked') {
    let raw = [];
    try {
      const sati = await sati_resource_sub_list({ cookie: userCookie, timestamp: Date.now() });
      raw = firstArrayFrom(sati.body, ['data', 'resources', 'list']);
    } catch (e) {
      console.warn('[MyPodcastLiked] sati sub list failed:', e.message);
    }
    if (!raw.length) {
      try {
        const recent = await record_recent_voice({ limit, cookie: userCookie, timestamp: Date.now() });
        raw = firstArrayFrom(recent.body, ['data', 'list', 'resources']);
      } catch (e) {
        console.warn('[MyPodcastLiked] recent voice fallback failed:', e.message);
      }
    }
    return { itemType: 'voice', items: raw.map(mapPodcastVoice).filter(x => x.id && x.name) };
  }
  return { itemType: 'radio', items: [] };
}

// ---------- 业务: 取歌曲URL (探测试听) ----------
//   返回 { url, trial, level, br }
//   trial=true 表示这是试听片段 (freeTrialInfo 非空)
async function resolveNeteaseDirectSongUrl(id, loginInfo, qualityPreference) {
  console.log('[SongUrl] id:', id, 'logged-in:', !!userCookie);
  const resolveDeadline = Date.now() + NETEASE_DIRECT_RESOLVE_BUDGET_MS;
  const requestedQuality = normalizeQualityPreference(qualityPreference);
  const svipReady = hasNeteaseSvip(loginInfo);
  const qualities = qualityCandidatesFrom(requestedQuality, NETEASE_QUALITY_CANDIDATES)
    .filter(q => !q.svip || svipReady);

  let trialFallback = null; // 兜底: 即使是试听也要能播
  let lastData = null;
  let lastError = null;
  const probeFailures = [];
  const probeCache = new Map();

  for (const q of qualities) {
    if (resolveDeadline - Date.now() < 500) break;
    try {
      // 优先用 v1 接口 (支持更高音质 level 字段)
      let result;
      try {
        result = await promiseWithTimeout(
          song_url_v1({ id, level: q.level, cookie: userCookie }),
          Math.min(2600, Math.max(500, resolveDeadline - Date.now())),
          'NETEASE_DIRECT_URL_TIMEOUT'
        );
      } catch (e) {
        lastError = e;
        if (resolveDeadline - Date.now() < 500) throw e;
        result = await promiseWithTimeout(
          song_url({ id, br: q.br, cookie: userCookie }),
          Math.min(2200, Math.max(500, resolveDeadline - Date.now())),
          'NETEASE_LEGACY_URL_TIMEOUT'
        );
      }
      const d = result.body && result.body.data && result.body.data[0];
      if (d) lastData = d;
      const url = d && d.url;
      const freeTrial = d && d.freeTrialInfo;
      console.log('[SongUrl]', q.level, '->', url ? 'OK' : 'no url', freeTrial ? '(TRIAL)' : '');
      let probe = null;
      if (url) {
        probe = probeCache.get(url);
        if (!probe) {
          probe = await probePlaybackAudioUrl(url, Math.min(2500, Math.max(600, resolveDeadline - Date.now())));
          probeCache.set(url, probe);
        }
        if (!probe.ok || !probe.magic) {
          probeFailures.push(q.level + ':' + (probe.status || probe.reason || 'invalid-audio'));
          continue;
        }
      }
      if (url && !freeTrial && probe && probe.ok) {
        return {
          provider: 'netease',
          source: 'netease',
          url,
          trial: false,
          playable: true,
          level: q.level,
          quality: q.label,
          br: d.br,
          requestedQuality,
          probeStatus: probe.status,
          probeBytes: probe.bytes,
          probeMagic: probe.magic,
        };
      }
      if (url && freeTrial && probe && probe.ok && !trialFallback) {
        trialFallback = {
          provider: 'netease',
          source: 'netease',
          url,
          trial: true,
          playable: true,
          level: q.level,
          quality: q.label,
          br: d.br,
          requestedQuality,
          trialInfo: freeTrial,
          restriction: classifyNeteasePlaybackRestriction(d, loginInfo),
          probeStatus: probe.status,
          probeBytes: probe.bytes,
          probeMagic: probe.magic,
        };
      }
    } catch (err) {
      lastError = err;
      console.log('[SongUrl]', q.level, 'failed:', err.message);
    }
  }
  if (trialFallback) return trialFallback;
  const restriction = classifyNeteasePlaybackRestriction(lastData, loginInfo);
  return {
    provider: 'netease',
    source: 'netease',
    url: null,
    trial: false,
    playable: false,
    reason: restriction.category,
    message: restriction.message,
    restriction,
    lastCode: lastData && lastData.code,
    fee: lastData && lastData.fee,
    error: lastError && lastError.message,
    probeFailures: probeFailures.slice(0, 12),
    requestedQuality,
  };
}

async function resolveNeteaseSameTrackPlayback(id, loginInfo, qualityPreference, matchHints, requestDeadline) {
  const ownDeadline = Date.now() + NETEASE_SOURCE_MATCH_TOTAL_BUDGET_MS;
  const deadline = Number(requestDeadline) > 0 ? Math.min(ownDeadline, Number(requestDeadline)) : ownDeadline;
  let candidates = [];
  try {
    const lookupBudget = Math.min(NETEASE_SOURCE_MATCH_LOOKUP_BUDGET_MS, Math.max(500, deadline - Date.now()));
    candidates = await promiseWithTimeout(
      findNeteaseSameTrackCandidates(id, matchHints, Date.now() + lookupBudget),
      lookupBudget,
      'NETEASE_SOURCE_MATCH_LOOKUP_TIMEOUT'
    );
  } catch (err) {
    console.warn('[NeteaseSourceMatch] lookup failed:', err.code || err.message);
    return null;
  }
  const excludedIds = new Set(String(matchHints && matchHints.excludeIds || '')
    .split(',')
    .map(value => String(value || '').trim())
    .filter(Boolean));
  const attemptedIds = [...excludedIds];
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const candidateId = String(candidate && candidate.song && candidate.song.id || '');
    if (!candidateId || excludedIds.has(candidateId)) continue;
    attemptedIds.push(candidateId);
    try {
      const remainingMs = deadline - Date.now();
      if (remainingMs < 800) break;
      const playback = await promiseWithTimeout(
        resolveNeteaseDirectSongUrl(candidate.song.id, loginInfo, qualityPreference),
        Math.min(NETEASE_DIRECT_RESOLVE_BUDGET_MS, remainingMs),
        'NETEASE_SOURCE_MATCH_PLAYBACK_TIMEOUT'
      );
      if (!playback || !playback.url || playback.trial) continue;
      return { candidate, playback, triedIds: attemptedIds.slice() };
    } catch (err) {
      console.warn('[NeteaseSourceMatch] candidate failed:', candidate.song && candidate.song.id, err.code || err.message);
    }
  }
  return null;
}

async function handleSongUrl(id, loginInfo, qualityPreference, matchHints) {
  const hints = matchHints || {};
  const requestDeadline = Date.now() + NETEASE_SONG_URL_TOTAL_BUDGET_MS;
  let direct = null;
  if (!hints.skipDirect) {
    try {
      direct = await promiseWithTimeout(
        resolveNeteaseDirectSongUrl(id, loginInfo, qualityPreference),
        Math.min(NETEASE_DIRECT_RESOLVE_BUDGET_MS + 300, Math.max(500, requestDeadline - Date.now())),
        'NETEASE_DIRECT_RESOLVE_TIMEOUT'
      );
    } catch (err) {
      const restriction = playbackRestriction('netease', 'url_unavailable', '网易云音源请求超时，已继续尝试站内同一录音版本', 'retry', { code: err.code || 'NETEASE_DIRECT_RESOLVE_TIMEOUT' });
      direct = {
        provider: 'netease',
        source: 'netease',
        url: null,
        trial: false,
        playable: false,
        reason: restriction.category,
        message: restriction.message,
        restriction,
        error: err.code || err.message,
      };
    }
  } else {
    const restriction = playbackRestriction('netease', 'url_unavailable', '正在继续尝试网易云站内的其它同曲版本', 'retry', { code: 'NETEASE_DIRECT_SKIPPED_AFTER_MATCH_FAILURE' });
    direct = {
      provider: 'netease',
      source: 'netease',
      url: null,
      trial: false,
      playable: false,
      reason: restriction.category,
      message: restriction.message,
      restriction,
      error: 'NETEASE_DIRECT_SKIPPED_AFTER_MATCH_FAILURE',
    };
  }
  if (direct && direct.url && !direct.trial) return direct;
  const sourceMatchAttempted = !!(String(hints.name || hints.title || '').trim() && String(hints.artist || '').trim());
  const matched = await resolveNeteaseSameTrackPlayback(id, loginInfo, qualityPreference, hints, requestDeadline);
  if (!matched) return { ...direct, sourceMatchAttempted };
  return {
    ...matched.playback,
    provider: 'netease',
    source: 'netease-same-track',
    sourceMatch: true,
    matchKind: matched.candidate.fingerprintMatches > 0
      ? 'netease_same_recording'
      : (matched.candidate.officialRecommendation ? 'netease_official_alternate' : 'netease_same_track_metadata'),
    matchedFromId: String(id || ''),
    requestedSongId: String(id || ''),
    resolvedNeteaseId: String(matched.candidate.song.id || ''),
    resolvedSongId: String(matched.candidate.song.id || ''),
    matchedSong: matched.candidate.song,
    matchScore: Math.round(matched.candidate.score || 0),
    fingerprintMatches: matched.candidate.fingerprintMatches || 0,
    sourceMatchTriedIds: matched.triedIds || [String(matched.candidate.song.id || '')],
    originalRestriction: direct && direct.restriction || null,
  };
}

// ---------- 业务: 登录态/用户信息 ----------
function readCookieFromResponse(resp) {
  const candidates = [
    resp && resp.cookie,
    resp && resp.body && resp.body.cookie,
    resp && resp.body && resp.body.data && resp.body.data.cookie,
    resp && resp.body && resp.body.data && resp.body.data.cookies,
  ];
  for (const candidate of candidates) {
    const cookie = normalizeCookieHeader(candidate);
    if (cookie) return cookie;
  }
  return '';
}
function firstPositiveNumberFrom(objects, keys) {
  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    for (const key of keys) {
      const value = Number(obj[key]);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  return 0;
}
function collectStringValues(value, out, depth) {
  if (depth > 4 || value == null) return out;
  if (typeof value === 'string') {
    if (value) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectStringValues(item, out, depth + 1));
    return out;
  }
  if (typeof value === 'object') {
    Object.keys(value).forEach(key => collectStringValues(value[key], out, depth + 1));
  }
  return out;
}
function collectVipStringValues(value, out, depth) {
  if (depth > 4 || value == null) return out;
  if (Array.isArray(value)) {
    value.forEach(item => collectVipStringValues(item, out, depth + 1));
    return out;
  }
  if (typeof value !== 'object') return out;
  Object.keys(value).forEach(key => {
    const child = value[key];
    if (/vip|svip|member|associator|privilege|right|level|package|label|title|type/i.test(key)) {
      collectStringValues(child, out, depth + 1);
    } else if (child && typeof child === 'object') {
      collectVipStringValues(child, out, depth + 1);
    }
  });
  return out;
}
const neteaseVipInfoCache = new Map();
function activeNeteaseVipPackage(pkg) {
  if (!pkg || typeof pkg !== 'object') return false;
  const expire = Number(pkg.expireTime || pkg.expire_time || pkg.expire || pkg.endTime || 0) || 0;
  if (expire && expire < Date.now()) return false;
  return firstPositiveNumberFrom([pkg], ['vipLevel', 'vip_level', 'level', 'vipType', 'vip_type', 'vipCode', 'vip_code', 'status']) > 0;
}
async function fetchNeteaseVipInfo(userId) {
  userId = String(userId || '').trim();
  if (!userId || !userCookie) return null;
  const cached = neteaseVipInfoCache.get(userId);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.value;
  let body = null;
  try {
    const r = await vip_info_v2({ uid: userId, cookie: userCookie, timestamp: Date.now() });
    body = r && r.body ? r.body : r;
  } catch (e) {
    try {
      const r = await vip_info({ uid: userId, cookie: userCookie, timestamp: Date.now() });
      body = r && r.body ? r.body : r;
    } catch (err) {
      console.warn('[Login] vip_info failed:', err.message);
    }
  }
  if (body) neteaseVipInfoCache.set(userId, { at: Date.now(), value: body });
  return body;
}
function normalizeNeteaseVip(profile, account, extra) {
  profile = profile || {};
  account = account || {};
  extra = extra || {};
  const vipInfo = profile.vipInfo || profile.vipinfo || account.vipInfo || account.vipinfo || extra.vipInfo || extra.vipinfo || {};
  const vipExtra = extra.vipExtra || extra.vip_info || extra.vipInfoV2 || {};
  const vipData = vipExtra.data || vipExtra;
  const objects = [account, profile, vipInfo, extra, vipData];
  const vipType = firstPositiveNumberFrom(objects, [
    'vipType', 'vip_type', 'viptype', 'musicVipType', 'music_vip_type',
    'musicVipLevel', 'music_vip_level', 'redVipLevel', 'red_vip_level',
    'blackVipLevel', 'black_vip_level', 'luxuryVipLevel', 'luxury_vip_level',
  ]);
  const text = collectVipStringValues({ account, profile, vipInfo, extra, vipData }, [], 0).join(' ').toLowerCase();
  const redplus = vipData.redplus || vipData.redPlus || vipInfo.redplus || vipInfo.redPlus || extra.redplus || extra.redPlus;
  const associator = vipData.associator || vipInfo.associator || extra.associator;
  const musicPackage = vipData.musicPackage || vipData.music_package || vipInfo.musicPackage || vipInfo.music_package || extra.musicPackage || extra.music_package;
  const svipType = firstPositiveNumberFrom(objects, [
    'svipType', 'svip_type', 'superVipLevel', 'super_vip_level', 'superVipType', 'super_vip_type',
  ]);
  const svipFlag = objects.some(obj => obj && (
    obj.isSvip === true || obj.is_svip === true || obj.svip === true ||
    Number(obj.isSvip || obj.is_svip || obj.svip || obj.svipType || obj.svip_type || obj.superVipLevel || obj.super_vip_level || 0) > 0
  )) || /svip|supervip|super_vip|黑胶svip|超级会员/.test(text);
  const vipFlag = objects.some(obj => obj && (
    obj.isVip === true || obj.is_vip === true || obj.vip === true ||
    Number(obj.isVip || obj.is_vip || obj.vip || obj.vipFlag || obj.vipflag || 0) > 0
  )) || /vip|黑胶|会员/.test(text);
  const svipResolved = svipFlag || svipType > 0 || activeNeteaseVipPackage(redplus);
  const vipResolved = vipFlag || activeNeteaseVipPackage(associator) || activeNeteaseVipPackage(musicPackage);
  const isSvip = svipResolved;
  const isVip = isSvip || vipResolved || vipType > 0;
  const vipLevel = isSvip ? 'svip' : (isVip ? 'vip' : 'none');
  return {
    vipType,
    vipLevel,
    isVip,
    isSvip,
    vipLabel: vipLevel === 'svip' ? 'SVIP' : (vipLevel === 'vip' ? 'VIP' : '无VIP'),
  };
}
function normalizeLoginInfo(profile, account, extra) {
  profile = profile || {};
  account = account || {};
  const userId = profile.userId || profile.user_id || profile.id || account.userId || account.id || '';
  if (!(userId || userId === 0)) return { loggedIn: false };
  const vip = normalizeNeteaseVip(profile, account, extra);
  return {
    loggedIn: true,
    userId,
    nickname: profile.nickname || profile.userName || '网易云用户',
    avatar: profile.avatarUrl || profile.avatar || '',
    ...vip,
  };
}
async function enrichNeteaseLoginInfo(info, profile, account, extra) {
  if (!info || !info.loggedIn || !info.userId) return info;
  let vipExtra = null;
  try {
    vipExtra = await promiseWithTimeout(fetchNeteaseVipInfo(info.userId), 1800, 'NETEASE_VIP_INFO_TIMEOUT');
  } catch (err) {
    console.warn('[Login] vip info timeout:', err.code || err.message);
  }
  if (!vipExtra) return info;
  const vip = normalizeNeteaseVip(profile, account, { ...(extra || {}), vipExtra });
  return { ...info, ...vip };
}
function isNeteaseAuthInvalidPayload(payload) {
  const code = normalizeApiCode(payload);
  if (code === 301 || code === 401) return true;
  const msg = normalizeApiMessage(payload);
  return /未登录|需要登录|请先登录|login/i.test(msg) && code >= 300;
}
async function fetchNeteaseLoginInfo() {
  if (!userCookie) return { loggedIn: false, vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, vipLabel: '无VIP' };

  // login_status 对二维码 cookie 的资料刷新通常更及时；失败时再降级到 user_account。
  try {
    const st = await promiseWithTimeout(login_status({ cookie: userCookie, timestamp: Date.now() }), 2400, 'NETEASE_LOGIN_STATUS_TIMEOUT');
    const body = st.body || {};
    const data = body.data || body;
    const profile = data.profile || body.profile;
    const account = data.account || body.account;
    const info = normalizeLoginInfo(profile, account, data);
    if (info.loggedIn) return await enrichNeteaseLoginInfo(info, profile, account, data);
  } catch (e) {
    console.warn('[Login] login_status failed:', e.message);
  }

  try {
    const acc = await promiseWithTimeout(user_account({ cookie: userCookie, timestamp: Date.now() }), 2400, 'NETEASE_ACCOUNT_STATUS_TIMEOUT');
    const body = acc.body || {};
    const info = normalizeLoginInfo(body.profile, body.account, body);
    if (info.loggedIn) return await enrichNeteaseLoginInfo(info, body.profile, body.account, body);
    if (isNeteaseAuthInvalidPayload(acc)) saveCookie('');
    return { loggedIn: false, hasCookie: !!userCookie, vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, vipLabel: '无VIP' };
  } catch (e) {
    console.warn('[Login] account check failed:', e.message);
    return { loggedIn: false, hasCookie: !!userCookie, vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, vipLabel: '无VIP' };
  }
}
const NETEASE_LOGIN_INFO_CACHE_TTL_MS = 30 * 1000;
let neteaseLoginInfoCache = { cookie: '', at: 0, value: null, promise: null };
function clearNeteaseLoginInfoCache() {
  neteaseLoginInfoCache = { cookie: '', at: 0, value: null, promise: null };
}
async function getLoginInfo() {
  if (!userCookie) return { loggedIn: false, vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, vipLabel: '无VIP' };
  const cookieKey = userCookie;
  if (neteaseLoginInfoCache.cookie === cookieKey && neteaseLoginInfoCache.value && Date.now() - neteaseLoginInfoCache.at < NETEASE_LOGIN_INFO_CACHE_TTL_MS) {
    return neteaseLoginInfoCache.value;
  }
  if (neteaseLoginInfoCache.cookie === cookieKey && neteaseLoginInfoCache.promise) return neteaseLoginInfoCache.promise;
  const request = fetchNeteaseLoginInfo().then(info => {
    if (userCookie === cookieKey) {
      neteaseLoginInfoCache.cookie = cookieKey;
      neteaseLoginInfoCache.at = Date.now();
      neteaseLoginInfoCache.value = info;
    }
    return info;
  }).finally(() => {
    if (neteaseLoginInfoCache.cookie === cookieKey) neteaseLoginInfoCache.promise = null;
  });
  neteaseLoginInfoCache.cookie = cookieKey;
  neteaseLoginInfoCache.promise = request;
  return request;
}
async function getPlaybackLoginInfo() {
  try {
    return await promiseWithTimeout(getLoginInfo(), 800, 'NETEASE_PLAYBACK_LOGIN_INFO_TIMEOUT');
  } catch (err) {
    const stale = neteaseLoginInfoCache.cookie === userCookie && neteaseLoginInfoCache.value;
    if (stale) return stale;
    return { loggedIn: !!userCookie, hasCookie: !!userCookie, vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, vipLabel: '无VIP', statusPending: true };
  }
}

function normalizeListenReportProvider(value) {
  value = String(value || '').trim().toLowerCase();
  if (value === 'qq' || value === 'kugou' || value === 'qishui' || value === 'spotify') return value;
  return value === 'netease' || value === 'cloud' || value === 'song' ? 'netease' : '';
}

function listenReportSongId(provider, song) {
  song = song && typeof song === 'object' ? song : {};
  if (provider === 'qq') return String(song.qqId || song.mid || song.mediaMid || song.id || '');
  if (provider === 'kugou') return String(song.hash || song.mixSongId || song.providerSongId || song.id || '');
  if (provider === 'qishui') return String(song.providerSongId || song.trackId || song.id || '');
  if (provider === 'spotify') return String(song.spotifyId || song.providerSongId || song.id || '').replace(/^spotify:track:/i, '');
  return String(song.id || song.providerSongId || '');
}

function validateListenReport(body) {
  body = body && typeof body === 'object' ? body : {};
  const song = body.song && typeof body.song === 'object' ? body.song : {};
  const provider = normalizeListenReportProvider(
    body.provider || song.provider || song.source || song.sourceKey || song.type || song.resolvedPlaybackProvider
  );
  const songId = listenReportSongId(provider, song);
  const sessionId = String(body.sessionId || '').trim().slice(0, 160);
  const listenMs = Math.max(0, Math.min(12 * 60 * 60 * 1000, Math.round(Number(body.listenMs) || 0)));
  const durationMs = Math.max(0, Math.min(12 * 60 * 60 * 1000, Math.round(Number(body.durationMs) || 0)));
  const cappedListenMs = durationMs > 0 ? Math.min(listenMs, durationMs + 2500) : listenMs;
  const requiredMs = durationMs > 0
    ? (durationMs <= 30000 ? durationMs * 0.8 : Math.min(30000, durationMs * 0.5))
    : 30000;
  const eligible = !!(
    provider &&
    songId &&
    sessionId.length >= 8 &&
    cappedListenMs >= Math.max(5000, requiredMs) &&
    song.type !== 'local' &&
    song.type !== 'podcast' &&
    song.source !== 'podcast' &&
    !song.trial
  );
  return {
    provider,
    song,
    songId,
    sessionId,
    listenMs: cappedListenMs,
    durationMs,
    requiredMs: Math.ceil(requiredMs),
    eligible,
    context: body.context && typeof body.context === 'object' ? body.context : {},
  };
}

async function handlePlatformListenReport(body) {
  const report = validateListenReport(body);
  const base = {
    provider: report.provider || 'unknown',
    songId: report.songId,
    sessionId: report.sessionId,
    listenMs: report.listenMs,
    durationMs: report.durationMs,
    eligible: report.eligible,
    localRecorded: true,
    platformSubmitted: false,
    historySynced: false,
    accountDurationSync: 'unsupported',
  };
  if (!report.eligible) {
    return Object.assign(base, {
      accepted: false,
      reason: 'LISTEN_REPORT_NOT_ELIGIBLE',
      requiredMs: report.requiredMs,
    });
  }

  let credential = '';
  if (report.provider === 'netease') credential = userCookie;
  else if (report.provider === 'qishui') credential = qishuiCookie;
  const journalKey = listenSyncJournalKey(report.provider, credential, report.sessionId);
  const previous = listenSyncJournal.entries[journalKey];
  if (previous) {
    return Object.assign(base, previous, {
      accepted: true,
      duplicate: true,
      platformSubmitted: true,
    });
  }

  if (report.provider === 'netease') {
    const info = await getLoginInfo();
    if (!info.loggedIn || !userCookie) {
      return Object.assign(base, { accepted: true, reason: 'NETEASE_LOGIN_REQUIRED' });
    }
    const rawSourceId = report.context.playlistId || report.context.id || report.context.sourceId || 0;
    const sourceId = /^\d+$/.test(String(rawSourceId || '')) ? String(rawSourceId) : 0;
    const result = await scrobble({
      id: report.songId,
      sourceid: sourceId,
      time: Math.max(1, Math.floor(report.listenMs / 1000)),
      cookie: userCookie,
      timestamp: Date.now(),
    });
    const code = normalizeApiCode(result);
    if (code !== 200) {
      const err = new Error(normalizeApiMessage(result) || 'NETEASE_SCROBBLE_FAILED');
      err.code = 'NETEASE_SCROBBLE_FAILED';
      err.statusCode = code;
      throw err;
    }
    const submitted = Object.assign(base, {
      accepted: true,
      platformSubmitted: true,
      accountDurationSync: 'submitted_unverified',
      platformCode: code,
    });
    rememberListenSyncSubmission(journalKey, submitted);
    return submitted;
  }

  if (report.provider === 'qishui') {
    if (!qishuiCookieHasLogin(qishuiCookie)) {
      return Object.assign(base, { accepted: true, reason: 'QISHUI_LOGIN_REQUIRED' });
    }
    await handleQishuiReportRecentlyPlayed(report.songId, qishuiCookie);
    const submitted = Object.assign(base, {
      accepted: true,
      platformSubmitted: true,
      historySynced: true,
      accountDurationSync: 'unsupported',
      note: 'Qishui accepted a recent-play item, but its PC endpoint carries no listening duration.',
    });
    rememberListenSyncSubmission(journalKey, submitted);
    return submitted;
  }

  return Object.assign(base, {
    accepted: true,
    reason: 'PLATFORM_DURATION_WRITE_UNAVAILABLE',
  });
}

// ====================================================================
//  HTTP Server
// ====================================================================
function loginEasterEggGateUnlocked() {
  if (!LOGIN_EASTER_EGG_GATE_FILE) return true;
  try {
    const state = JSON.parse(fs.readFileSync(LOGIN_EASTER_EGG_GATE_FILE, 'utf8')) || {};
    return state.gateVersion === LOGIN_EASTER_EGG_GATE_VERSION &&
      state.cookieResetVersion === LOGIN_EASTER_EGG_GATE_VERSION &&
      state.resetComplete === true &&
      state.unlocked === true;
  } catch (_) {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  refreshConfiguredCookieStores(false);
  const url = new URL(req.url, 'http://localhost:' + PORT);
  const pn = url.pathname;

  if (pn === '/api/spotify' || pn.indexOf('/api/spotify/') === 0) {
    sendJSON(res, { ok: false, error: 'PROVIDER_REMOVED', message: '该平台接口已从 Mineradio 移除。' }, 404);
    return;
  }

  if (LOGIN_EASTER_EGG_PROTECTED_ROUTES.has(pn) && !loginEasterEggGateUnlocked()) {
    sendJSON(res, {
      ok: false,
      unlocked: false,
      error: 'LOGIN_EASTER_EGG_LOCKED',
      message: '请先完成登录彩蛋解锁。',
    }, 423);
    return;
  }

  if (pn === '/api/app/version') {
    sendJSON(res, {
      name: APP_PACKAGE.name || 'mineradio',
      productName: APP_PACKAGE.productName || 'Mineradio',
      version: APP_VERSION,
      update: {
        provider: UPDATE_CONFIG.provider,
        configured: UPDATE_CONFIG.configured,
        owner: UPDATE_CONFIG.owner,
        repo: UPDATE_CONFIG.repo,
        preview: UPDATE_CONFIG.preview,
        manifestOverride: !!UPDATE_CONFIG.manifest,
      },
    });
    return;
  }

  if (pn === '/api/platform/capabilities') {
    sendJSON(res, {
      netease: {
        playlists: true, likeRead: true, likeWrite: true, albumRead: true,
        albumCollect: true, commentsRead: true, commentsWrite: true,
        listenReport: 'experimental-unverified',
      },
      qq: {
        playlists: true, likeRead: true, likeWrite: false, albumRead: true,
        albumCollect: false, commentsRead: true, commentsWrite: false,
        listenReport: false,
      },
      kugou: {
        playlists: true, likeRead: true, likeWrite: true, albumRead: false,
        albumCollect: false, commentsRead: false, commentsWrite: false,
        listenReport: false,
      },
      qishui: {
        playlists: true, likeRead: true, likeWrite: qishuiCookieHasLogin(qishuiCookie),
        albumRead: false, albumCollect: qishuiCookieHasLogin(qishuiCookie),
        commentsRead: qishuiCookieHasLogin(qishuiCookie), commentsWrite: qishuiCookieHasLogin(qishuiCookie),
        recentPlayReport: qishuiCookieHasLogin(qishuiCookie), listenReport: false,
      },
    });
    return;
  }

  if (pn === '/api/listen/report') {
    try {
      if (req.method !== 'POST') {
        sendJSON(res, { accepted: false, error: 'METHOD_NOT_ALLOWED' }, 405);
        return;
      }
      const body = await readRequestBody(req);
      sendJSON(res, await handlePlatformListenReport(body));
    } catch (err) {
      console.error('[ListenReport]', err);
      sendJSON(res, {
        accepted: false,
        platformSubmitted: false,
        error: err.code || err.message,
        message: err.message,
      }, Number(err.statusCode) === 401 ? 401 : 502);
    }
    return;
  }

  if (pn === '/api/listen/total') {
    try {
      const provider = normalizeListenReportProvider(url.searchParams.get('provider') || 'netease');
      if (provider !== 'netease') {
        sendJSON(res, { provider, supported: false, accountDurationSync: 'unsupported' });
        return;
      }
      const info = await requireLogin(res);
      if (!info) return;
      const result = await listen_data_total({ cookie: userCookie, timestamp: Date.now() });
      sendJSON(res, {
        provider: 'netease',
        supported: true,
        readOnly: true,
        body: result.body || result,
      });
    } catch (err) {
      console.error('[ListenTotal]', err);
      sendJSON(res, { provider: 'netease', supported: true, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/update/latest') {
    try {
      sendJSON(res, await fetchLatestUpdateInfo());
    } catch (err) {
      sendJSON(res, {
        ...localUpdateFallback(err.message || 'Update check failed', { configured: UPDATE_CONFIG.configured }),
        error: err.message || 'Update check failed',
      });
    }
    return;
  }

  if (
    pn === '/api/update/download'
    || pn === '/api/update/download/status'
    || pn === '/api/update/patch'
    || pn === '/api/update/patch/status'
  ) {
    sendJSON(res, {
      ok: false,
      externalOnly: true,
      error: 'UPDATE_EXTERNAL_ONLY',
      message: 'Mineradio 已停用客户端本地下载与快速补丁，请使用外部下载页面。',
    }, 410);
    return;
  }

  if (pn === '/api/beatmap/cache/status') {
    const info = beatCacheRootInfo();
    sendJSON(res, {
      enabled: info.allowed && info.available,
      dir: info.dir,
      drive: info.drive,
      reason: !info.allowed ? 'C_DRIVE_DISABLED' : (!info.available ? 'TARGET_DRIVE_UNAVAILABLE' : ''),
      mode: info.allowed && info.available ? 'disk' : 'memory-only',
    });
    return;
  }

  // Cuefield only consumes Mineradio's existing local beat-map cache. It never
  // receives account cookies, song files, or playback URLs on this route.
  if (pn === '/api/cuefield/transition') {
    if (req.method !== 'POST') {
      sendJSON(res, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
      return;
    }
    try {
      const body = await readRequestBody(req);
      const plan = planCuefieldTransitionFromCache({
        fromKey: body.fromKey,
        toKey: body.toKey,
        fromLrc: body.fromLrc,
        toLrc: body.toLrc,
        exitBias: body.exitBias || 'late',
        maxEntryTime: Math.max(8, Math.min(32, Number(body.maxEntryTime) || 32)),
        recentRecipes: Array.isArray(body.recentRecipes) ? body.recentRecipes.slice(-2) : [],
        minimumListenUntil: body.minimumListenUntil,
        enableLiveEndCrossfadeFallback: body.enableLiveEndCrossfadeFallback === true,
        enableCadenceFallback: body.enableCadenceFallback === true,
        boundaryEvidence: body.boundaryEvidence,
        tailEvidence: body.tailEvidence,
        readBeatMapCache,
      });
      sendJSON(res, plan);
    } catch (err) {
      sendJSON(res, {
        ok: false,
        error: err && (err.code || err.message) || 'CUEFIELD_TRANSITION_FAILED',
      }, 400);
    }
    return;
  }

  // Feedback remains on this computer under Electron userData. The fan project's
  // optional remote-feedback module is intentionally not wired into Mineradio.
  if (pn === '/api/cuefield/feedback') {
    if (req.method === 'GET') {
      try {
        sendJSON(res, { ok: true, stats: readCuefieldFeedbackStats(CUEFIELD_FEEDBACK_FILE) });
      } catch (err) {
        sendJSON(res, { ok: false, error: err.message || 'CUEFIELD_FEEDBACK_READ_FAILED' }, 500);
      }
      return;
    }
    if (req.method === 'POST') {
      try {
        const body = await readRequestBody(req);
        const record = appendCuefieldFeedback(CUEFIELD_FEEDBACK_FILE, body);
        sendJSON(res, { ok: true, record });
      } catch (err) {
        sendJSON(res, { ok: false, error: err.code || err.message || 'CUEFIELD_FEEDBACK_SAVE_FAILED' }, 400);
      }
      return;
    }
    sendJSON(res, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    return;
  }

  if (pn === '/api/beatmap/cache') {
    if (req.method === 'GET') {
      const key = url.searchParams.get('key') || '';
      try {
        const entry = readBeatMapCache(key);
        sendJSON(res, entry
          ? { ok: true, hit: true, key: entry.key || key, map: entry.map, meta: entry.meta || {}, savedAt: entry.savedAt || 0 }
          : { ok: true, hit: false, key });
      } catch (err) {
        const info = err.info || beatCacheRootInfo();
        sendJSON(res, {
          ok: false,
          hit: false,
          enabled: false,
          mode: 'memory-only',
          key,
          reason: err.code || err.message || 'BEAT_CACHE_READ_FAILED',
          dir: info.dir,
        });
      }
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = await readRequestBody(req);
        sendJSON(res, writeBeatMapCache(body));
      } catch (err) {
        const info = err.info || beatCacheRootInfo();
        sendJSON(res, {
          ok: false,
          enabled: false,
          mode: 'memory-only',
          reason: err.code || err.message || 'BEAT_CACHE_WRITE_FAILED',
          dir: info.dir,
        });
      }
      return;
    }

    sendJSON(res, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    return;
  }

  if (pn === '/api/discover/home') {
    try {
      sendJSON(res, await handleDiscoverHome());
    } catch (err) {
      console.error('[DiscoverHome]', err);
      sendJSON(res, { error: err.message, loggedIn: false, dailySongs: [], playlists: [], podcasts: [] }, 500);
    }
    return;
  }

  if (pn === '/api/weather/radio') {
    try {
      const data = await buildWeatherRadio({
        city: url.searchParams.get('city') || url.searchParams.get('q') || '',
        lat: url.searchParams.get('lat'),
        lon: url.searchParams.get('lon'),
        timezone: url.searchParams.get('timezone') || '',
      });
      sendJSON(res, data);
    } catch (err) {
      console.error('[WeatherRadio]', err);
      sendJSON(res, {
        ok: false,
        error: err.message,
        weather: null,
        radio: { title: '天气电台', subtitle: '天气暂时没有回来，可以先听今日推荐。', seedQueries: [], songs: [] },
      }, 500);
    }
    return;
  }

  if (pn === '/api/weather/ip-location') {
    try {
      sendJSON(res, { ok: true, location: await fetchIpWeatherLocation() });
    } catch (err) {
      console.error('[WeatherIpLocation]', err);
      sendJSON(res, { ok: false, error: err.message, location: null }, 500);
    }
    return;
  }

  // ---------- 搜索 ----------
  if (pn === '/api/search') {
    try {
      const kw    = url.searchParams.get('keywords') || '';
      const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get('limit') || '20', 10) || 20));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const songs = await handleSearch(kw, limit, offset);
      sendJSON(res, { songs, offset, limit, nextOffset: offset + songs.length, hasMore: songs.length >= limit });
    } catch (err) { console.error('[Search]', err); sendJSON(res, { error: err.message, songs: [] }, 500); }
    return;
  }

  if (pn === '/api/qq/search') {
    try {
      const kw = url.searchParams.get('keywords') || '';
      const limit = Math.max(4, Math.min(30, parseInt(url.searchParams.get('limit') || '12', 10) || 12));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const songs = await handleQQSearch(kw, limit, offset);
      sendJSON(res, { provider: 'qq', songs, offset, limit, nextOffset: offset + songs.length, hasMore: songs.length >= limit });
    } catch (err) {
      console.error('[QQSearch]', err);
      sendJSON(res, { provider: 'qq', error: err.message, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/search') {
    try {
      const kw = url.searchParams.get('keywords') || '';
      const limit = Math.max(4, Math.min(20, parseInt(url.searchParams.get('limit') || '12', 10) || 12));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const songs = await handleKugouSearch(kw, limit, kugouCookie, offset);
      sendJSON(res, { provider: 'kugou', songs, offset, limit, nextOffset: offset + songs.length, hasMore: songs.length >= limit });
    } catch (err) {
      console.error('[KugouSearch]', err);
      sendJSON(res, { provider: 'kugou', error: err.message, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/recommendations') {
    try {
      const limit = Math.max(4, Math.min(20, parseInt(url.searchParams.get('limit') || '12', 10) || 12));
      sendJSON(res, await handleKugouGuessLike(kugouCookie, limit));
    } catch (err) {
      console.error('[KugouRecommendations]', err);
      sendJSON(res, { provider: 'kugou', error: err.message, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/status') {
    try {
      sendJSON(res, await handleSpotifyStatus());
    } catch (err) {
      console.error('[SpotifyStatus]', err);
      sendJSON(res, { provider: 'spotify', configured: false, loggedIn: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/setup/diagnostics') {
    try {
      sendJSON(res, await handleSpotifySetupDiagnostics());
    } catch (err) {
      console.error('[SpotifySetupDiagnostics]', err);
      sendJSON(res, {
        provider: 'spotify',
        ok: false,
        ready: false,
        error: err.code || err.message,
        message: err.message || 'Spotify 接口体检失败',
        checks: [],
      }, Number(err.statusCode) || 500);
    }
    return;
  }

  if (pn === '/api/spotify/config') {
    try {
      if (req.method !== 'POST') {
        sendJSON(res, { provider: 'spotify', ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
        return;
      }
      const body = await readRequestBody(req);
      const saved = saveSpotifyConfig(body);
      const status = await handleSpotifyStatus();
      sendJSON(res, Object.assign({}, status, saved, {
        ok: true,
        configured: true,
        oauthConfigured: true,
        message: status.loggedIn
          ? status.message
          : 'Spotify Client ID 已保存，可打开官方 OAuth 授权。'
      }));
    } catch (err) {
      console.error('[SpotifyConfig]', err);
      const missing = err && err.missing || [];
      sendJSON(res, {
        provider: 'spotify',
        ok: false,
        configured: getSpotifyConfig().configured,
        loggedIn: false,
        error: err.code || err.message,
        message: err.code === 'SPOTIFY_CLIENT_ID_REQUIRED' || err.message === 'SPOTIFY_CLIENT_ID_REQUIRED'
          ? '请先粘贴 Spotify Client ID。'
          : (err.code === 'SPOTIFY_CLIENT_ID_INVALID'
            ? 'Client ID 格式不正确，请只复制 Spotify Dashboard 中的 Client ID。'
            : (err.code === 'SPOTIFY_REDIRECT_URI_INVALID'
              ? '回调地址无效，请使用 Mineradio 显示的 127.0.0.1 回调地址。'
              : err.message)),
        missing,
      }, err && /^SPOTIFY_(?:CLIENT_ID|REDIRECT_URI)_/.test(String(err.code || '')) ? 400 : 500);
    }
    return;
  }

  if (pn === '/api/spotify/logout') {
    try {
      sendJSON(res, clearSpotifyToken());
    } catch (err) {
      console.error('[SpotifyLogout]', err);
      sendJSON(res, { provider: 'spotify', ok: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/user/playlists') {
    try {
      const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '300', 10) || 300));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      sendJSON(res, await handleSpotifyUserPlaylists({ limit, offset }));
    } catch (err) {
      console.error('[SpotifyUserPlaylists]', err);
      sendJSON(res, { provider: 'spotify', loggedIn: false, error: err.message, playlists: [] }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/song/like/check') {
    try {
      const ids = String(url.searchParams.get('ids') || url.searchParams.get('id') || '')
        .split(',').map(value => value.trim()).filter(Boolean);
      sendJSON(res, await handleSpotifyLibraryCheck('track', ids));
    } catch (err) {
      console.error('[SpotifyLikeCheck]', err);
      sendJSON(res, { provider: 'spotify', liked: {}, error: err.code || err.message, message: err.message }, Number(err.statusCode) || 500);
    }
    return;
  }

  if (pn === '/api/spotify/song/like') {
    try {
      const body = req.method === 'POST' ? await readRequestBody(req) : {};
      const song = body.song || {
        id: body.id || url.searchParams.get('id') || '',
        spotifyId: body.spotifyId || url.searchParams.get('spotifyId') || '',
        spotifyUri: body.spotifyUri || body.uri || url.searchParams.get('uri') || '',
      };
      const liked = String(body.like != null ? body.like : (url.searchParams.get('like') || 'true')) !== 'false';
      sendJSON(res, await handleSpotifyLibrarySet('track', song, liked));
    } catch (err) {
      console.error('[SpotifyLike]', err);
      sendJSON(res, {
        provider: 'spotify',
        success: false,
        error: err.code || err.message,
        message: err.code === 'SPOTIFY_WRITE_SCOPE_REQUIRED'
          ? '请在账号面板重新连接 Spotify，授予资料库写入权限。'
          : err.message,
        missingScopes: err.missingScopes || [],
      }, Number(err.statusCode) || 500);
    }
    return;
  }

  if (pn === '/api/spotify/album/like/check') {
    try {
      const ids = String(url.searchParams.get('ids') || url.searchParams.get('id') || '')
        .split(',').map(value => value.trim()).filter(Boolean);
      sendJSON(res, await handleSpotifyLibraryCheck('album', ids));
    } catch (err) {
      console.error('[SpotifyAlbumLikeCheck]', err);
      sendJSON(res, { provider: 'spotify', liked: {}, error: err.code || err.message, message: err.message }, Number(err.statusCode) || 500);
    }
    return;
  }

  if (pn === '/api/spotify/album/like') {
    try {
      const body = req.method === 'POST' ? await readRequestBody(req) : {};
      const album = body.album || {
        id: body.id || body.albumId || url.searchParams.get('id') || '',
        albumId: body.albumId || '',
        spotifyUri: body.spotifyUri || body.uri || '',
      };
      const liked = String(body.like != null ? body.like : (url.searchParams.get('like') || 'true')) !== 'false';
      sendJSON(res, await handleSpotifyLibrarySet('album', album, liked));
    } catch (err) {
      console.error('[SpotifyAlbumLike]', err);
      sendJSON(res, { provider: 'spotify', success: false, error: err.code || err.message, message: err.message, missingScopes: err.missingScopes || [] }, Number(err.statusCode) || 500);
    }
    return;
  }

  if (pn === '/api/spotify/playlist/add-song') {
    try {
      if (req.method !== 'POST') {
        sendJSON(res, { provider: 'spotify', success: false, error: 'METHOD_NOT_ALLOWED' }, 405);
        return;
      }
      const body = await readRequestBody(req);
      sendJSON(res, await handleSpotifyPlaylistAddSong(body.pid || body.playlistId || '', body.song || body));
    } catch (err) {
      console.error('[SpotifyPlaylistAddSong]', err);
      sendJSON(res, {
        provider: 'spotify',
        success: false,
        error: err.code || err.message,
        message: err.code === 'SPOTIFY_WRITE_SCOPE_REQUIRED'
          ? '请重新连接 Spotify，授予歌单写入权限。'
          : err.message,
        missingScopes: err.missingScopes || [],
      }, Number(err.statusCode) || 500);
    }
    return;
  }

  if (pn === '/api/spotify/playlist/create') {
    try {
      if (req.method !== 'POST') {
        sendJSON(res, { provider: 'spotify', success: false, error: 'METHOD_NOT_ALLOWED' }, 405);
        return;
      }
      const body = await readRequestBody(req);
      sendJSON(res, await handleSpotifyCreatePlaylist(body.name || '', {
        public: body.public === true,
        description: body.description || '',
      }));
    } catch (err) {
      console.error('[SpotifyPlaylistCreate]', err);
      sendJSON(res, { provider: 'spotify', success: false, error: err.code || err.message, message: err.message, missingScopes: err.missingScopes || [] }, Number(err.statusCode) || 500);
    }
    return;
  }

  if (pn === '/api/spotify/playlist/collect') {
    try {
      if (req.method !== 'POST') {
        sendJSON(res, { provider: 'spotify', success: false, error: 'METHOD_NOT_ALLOWED' }, 405);
        return;
      }
      const body = await readRequestBody(req);
      const collected = String(body.collected != null ? body.collected : 'true') !== 'false';
      const result = await handleSpotifyLibrarySet('playlist', {
        id: body.id || body.playlistId || '',
        spotifyUri: body.spotifyUri || body.uri || '',
      }, collected);
      sendJSON(res, Object.assign({ collected, success: true }, result));
    } catch (err) {
      console.error('[SpotifyPlaylistCollect]', err);
      sendJSON(res, { provider: 'spotify', success: false, error: err.code || err.message, message: err.message, missingScopes: err.missingScopes || [] }, Number(err.statusCode) || 500);
    }
    return;
  }

  if (pn === '/api/spotify/playlist/tracks') {
    try {
      const id = url.searchParams.get('id') || url.searchParams.get('playlistId') || '';
      const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '48', 10) || 48));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      sendJSON(res, await handleSpotifyPlaylistTracks(id, { limit, offset, market: url.searchParams.get('market') || '' }));
    } catch (err) {
      console.error('[SpotifyPlaylistTracks]', err);
      sendJSON(res, { provider: 'spotify', error: err.message, tracks: [] }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/album/detail') {
    try {
      const id = url.searchParams.get('id') || url.searchParams.get('albumId') || '';
      const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '80', 10) || 80));
      sendJSON(res, await handleSpotifyAlbumDetail(id, { limit, market: url.searchParams.get('market') || '' }));
    } catch (err) {
      console.error('[SpotifyAlbumDetail]', err);
      sendJSON(res, { provider: 'spotify', error: err.message, album: null, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/search') {
    try {
      const kw = url.searchParams.get('keywords') || '';
      const limit = Math.max(4, Math.min(20, parseInt(url.searchParams.get('limit') || '10', 10) || 10));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      sendJSON(res, await handleSpotifySearch(kw, limit, offset));
    } catch (err) {
      console.error('[SpotifySearch]', err);
      sendJSON(res, { provider: 'spotify', configured: getSpotifyConfig().configured, error: err.message, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/recommendations') {
    try {
      const limit = Math.max(4, Math.min(10, parseInt(url.searchParams.get('limit') || '10', 10) || 10));
      sendJSON(res, await handleSpotifyRecommendations(limit));
    } catch (err) {
      console.error('[SpotifyRecommendations]', err);
      sendJSON(res, { provider: 'spotify', error: err.message, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/song/url') {
    try {
      sendJSON(res, await handleSpotifySongUrl({
        id: url.searchParams.get('id') || '',
        providerSongId: url.searchParams.get('providerSongId') || '',
        spotifyId: url.searchParams.get('spotifyId') || '',
        uri: url.searchParams.get('uri') || '',
      }));
    } catch (err) {
      console.error('[SpotifySongUrl]', err);
      sendJSON(res, { provider: 'spotify', url: '', playable: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/spotify/lyric') {
    try {
      const id = url.searchParams.get('id') || '';
      sendJSON(res, await handleSpotifyLyric(id));
    } catch (err) {
      console.error('[SpotifyLyric]', err);
      sendJSON(res, { provider: 'spotify', error: err.message, lyric: '', tlyric: '', yrc: '', ytlrc: '' }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/login/qrcode') {
    try {
      const result = await qishuiQrLogin.createQrCode();
      const data = result && result.data || {};
      sendJSON(res, {
        provider: 'qishui',
        token: String(data.token || ''),
        qrcode: String(data.qrcode || ''),
        qrcodeIndexUrl: String(data.qrcode_index_url || ''),
        expireTime: Number(data.expire_time || 0),
        message: '请使用抖音 App 扫码并确认登录',
      });
    } catch (err) {
      console.error('[QishuiQRCode]', err);
      sendJSON(res, {
        provider: 'qishui',
        token: '',
        qrcode: '',
        error: err && err.code || 'QISHUI_QR_CREATE_FAILED',
        message: err && err.message || '汽水音乐二维码生成失败',
      }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/login/check') {
    try {
      const token = String(url.searchParams.get('token') || '').trim();
      if (!token) {
        sendJSON(res, {
          provider: 'qishui',
          loggedIn: false,
          status: 'missing_token',
          error: 'QISHUI_QR_TOKEN_REQUIRED',
          message: '二维码登录 token 缺失',
        }, 400);
        return;
      }
      const result = await qishuiQrLogin.checkQrConnect(token);
      const data = result && result.data || {};
      const errorCode = Number(data.error_code || 0);
      const bridgeStatus = qishuiQrLogin.getStatus();
      if (data.confirmed === true && errorCode === 0 && bridgeStatus.loggedIn) {
        const cookie = qishuiQrLogin.getCookie();
        if (!qishuiCookieHasLogin(cookie)) throw new Error('QISHUI_QR_SESSION_COOKIE_MISSING');
        const status = await handleQishuiStatus(cookie);
        if (status.reauthRequired) {
          sendJSON(res, { ...status, ok: false, status: 'reauth_required' });
          return;
        }
        if (status.loggedIn !== true) {
          sendJSON(res, { ...status, ok: false, status: 'verifying' });
          return;
        }
        saveQishuiCookie(cookie);
        sendJSON(res, {
          ...status,
          provider: 'qishui',
          ok: true,
          loggedIn: true,
          webSession: true,
          cookieReady: true,
          status: 'confirmed',
          errorCode: 0,
          error_code: 0,
          message: '登录成功',
        });
        return;
      }
      let status = String(data.status || '').trim();
      if (errorCode === 2) status = 'expired';
      else if (errorCode === 7) status = 'rate_limited';
      else if (status === '2') status = 'scanned';
      else if (!status || status === '1') status = 'waiting';
      sendJSON(res, {
        provider: 'qishui',
        loggedIn: false,
        status,
        errorCode,
        error_code: errorCode,
        retryAfterMs: errorCode === 7 ? 60000 : 0,
        message: result && result.message || data.description || '',
      });
    } catch (err) {
      console.error('[QishuiLoginCheck]', err);
      const cancelled = err && err.code === 'QISHUI_MFA_CANCELLED';
      sendJSON(res, {
        provider: 'qishui',
        loggedIn: false,
        status: cancelled ? 'mfa_cancelled' : 'error',
        error: err && err.code || 'QISHUI_QR_CHECK_FAILED',
        message: err && err.message || '汽水音乐登录状态检查失败',
      }, cancelled ? 409 : 500);
    }
    return;
  }

  if (pn === '/api/qishui/status' || pn === '/api/qishui/login/status') {
    try {
      sendJSON(res, await handleQishuiStatus(qishuiCookie));
    } catch (err) {
      console.error('[QishuiStatus]', err);
      sendJSON(res, { provider: 'qishui', configured: false, loggedIn: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/logout') {
    try {
      await qishuiQrLogin.clear();
      saveQishuiCookie('');
      sendJSON(res, { ...clearQishuiAccessToken(), webSession: false, cookieReady: false, configured: getQishuiStatus('').configured, loggedIn: getQishuiStatus('').loggedIn });
    } catch (err) {
      console.error('[QishuiLogout]', err);
      sendJSON(res, { provider: 'qishui', ok: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/search') {
    try {
      const kw = url.searchParams.get('keywords') || '';
      const limit = Math.max(4, Math.min(20, parseInt(url.searchParams.get('limit') || '12', 10) || 12));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      sendJSON(res, await handleQishuiSearch(kw, limit, qishuiCookie, offset));
    } catch (err) {
      console.error('[QishuiSearch]', err);
      sendJSON(res, { provider: 'qishui', configured: getQishuiStatus(qishuiCookie).configured, error: err.message, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/feed') {
    try {
      const limit = Math.max(4, Math.min(12, parseInt(url.searchParams.get('limit') || '8', 10) || 8));
      sendJSON(res, await handleQishuiFeed(limit, qishuiCookie));
    } catch (err) {
      console.error('[QishuiFeed]', err);
      sendJSON(res, { provider: 'qishui', configured: getQishuiStatus(qishuiCookie).configured, error: err.message, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/user/playlists') {
    try {
      sendJSON(res, await handleQishuiUserPlaylists(qishuiCookie));
    } catch (err) {
      console.error('[QishuiUserPlaylists]', err);
      sendJSON(res, { provider: 'qishui', loggedIn: getQishuiStatus(qishuiCookie).configured, configured: getQishuiStatus(qishuiCookie).configured, error: err.message, playlists: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/playlist/tracks') {
    try {
      const id = url.searchParams.get('id') || 'qishui-feed';
      const limit = parseInt(url.searchParams.get('limit') || '0', 10) || 0;
      const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;
      sendJSON(res, await handleQishuiPlaylistTracks(id, limit || offset ? { limit: limit || 50, offset } : {}, qishuiCookie));
    } catch (err) {
      console.error('[QishuiPlaylistTracks]', err);
      sendJSON(res, { provider: 'qishui', configured: getQishuiStatus(qishuiCookie).configured, error: err.message, tracks: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/song/like/check') {
    try {
      const ids = String(url.searchParams.get('ids') || url.searchParams.get('id') || '')
        .split(',').map(value => value.trim()).filter(Boolean);
      sendJSON(res, await handleQishuiCheckTracksLiked(ids, qishuiCookie));
    } catch (err) {
      console.error('[QishuiLikeCheck]', err);
      sendJSON(res, { provider: 'qishui', liked: {}, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/song/like') {
    try {
      if (req.method !== 'POST') {
        sendJSON(res, { provider: 'qishui', success: false, error: 'METHOD_NOT_ALLOWED' }, 405);
        return;
      }
      const body = await readRequestBody(req);
      const song = body.song || body;
      const id = song.providerSongId || song.trackId || song.id || '';
      const liked = String(body.like != null ? body.like : 'true') !== 'false';
      const result = await handleQishuiSetTrackLiked(id, liked, qishuiCookie);
      sendJSON(res, Object.assign({ success: true }, result));
    } catch (err) {
      console.error('[QishuiLike]', err);
      sendJSON(res, { provider: 'qishui', success: false, error: err.message }, /COOKIE_REQUIRED|login/i.test(String(err.message)) ? 401 : 500);
    }
    return;
  }

  if (pn === '/api/qishui/playlist/collect') {
    try {
      if (req.method !== 'POST') {
        sendJSON(res, { provider: 'qishui', success: false, error: 'METHOD_NOT_ALLOWED' }, 405);
        return;
      }
      const body = await readRequestBody(req);
      const collected = String(body.collected != null ? body.collected : 'true') !== 'false';
      const result = await handleQishuiSetPlaylistCollected(body.id || body.playlistId || '', collected, qishuiCookie);
      sendJSON(res, Object.assign({ success: true }, result));
    } catch (err) {
      console.error('[QishuiPlaylistCollect]', err);
      sendJSON(res, { provider: 'qishui', success: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/playlist/add-song') {
    try {
      if (req.method !== 'POST') {
        sendJSON(res, { provider: 'qishui', success: false, error: 'METHOD_NOT_ALLOWED' }, 405);
        return;
      }
      const body = await readRequestBody(req);
      sendJSON(res, await handleQishuiPlaylistAddSong(body.pid || body.playlistId || '', body.song || body, qishuiCookie));
    } catch (err) {
      console.error('[QishuiPlaylistAddSong]', err);
      sendJSON(res, { provider: 'qishui', success: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/album/collect') {
    try {
      if (req.method !== 'POST') {
        sendJSON(res, { provider: 'qishui', success: false, error: 'METHOD_NOT_ALLOWED' }, 405);
        return;
      }
      const body = await readRequestBody(req);
      const collected = String(body.collected != null ? body.collected : 'true') !== 'false';
      const result = await handleQishuiSetAlbumCollected(body.id || body.albumId || '', collected, qishuiCookie);
      sendJSON(res, Object.assign({ success: true }, result));
    } catch (err) {
      console.error('[QishuiAlbumCollect]', err);
      sendJSON(res, { provider: 'qishui', success: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/song/comments') {
    try {
      const id = url.searchParams.get('id') || url.searchParams.get('trackId') || '';
      if (req.method === 'POST') {
        const body = await readRequestBody(req);
        sendJSON(res, await handleQishuiCreateComment(id || body.id || body.trackId || '', body.content || body.text || '', qishuiCookie));
      } else {
        const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get('limit') || '18', 10) || 18));
        sendJSON(res, await handleQishuiComments(id, {
          limit,
          cursor: url.searchParams.get('cursor') || '',
        }, qishuiCookie));
      }
    } catch (err) {
      console.error('[QishuiComments]', err);
      sendJSON(res, { provider: 'qishui', comments: [], error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/song/url') {
    try {
      sendJSON(res, await handleQishuiSongUrl({
        id: url.searchParams.get('id') || url.searchParams.get('trackId') || '',
        quality: url.searchParams.get('quality') || '',
        vipRequired: url.searchParams.get('vipRequired') || '',
        needVip: url.searchParams.get('needVip') || url.searchParams.get('need_vip') || '',
        onlyVipPlayable: url.searchParams.get('onlyVipPlayable') || url.searchParams.get('only_vip_playable') || '',
        privilege: url.searchParams.get('privilege') || url.searchParams.get('mediaPrivilege') || url.searchParams.get('media_privilege') || '',
        fee: url.searchParams.get('fee') || '',
      }, qishuiCookie));
    } catch (err) {
      console.error('[QishuiSongUrl]', err);
      sendJSON(res, { provider: 'qishui', url: '', playable: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qishui/lyric') {
    try {
      const id = url.searchParams.get('id') || url.searchParams.get('trackId') || '';
      sendJSON(res, await handleQishuiLyric(id, qishuiCookie));
    } catch (err) {
      console.error('[QishuiLyric]', err);
      sendJSON(res, { provider: 'qishui', error: err.message, lyric: '', tlyric: '' }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/song/url') {
    try {
      const info = await handleKugouSongUrl({
        hash: url.searchParams.get('hash') || url.searchParams.get('id') || '',
        albumId: url.searchParams.get('albumId') || url.searchParams.get('album_id') || '',
        albumAudioId: url.searchParams.get('albumAudioId') || url.searchParams.get('album_audio_id') || url.searchParams.get('mixSongId') || '',
        mixSongId: url.searchParams.get('mixSongId') || url.searchParams.get('albumAudioId') || url.searchParams.get('album_audio_id') || '',
        hqHash: url.searchParams.get('hqHash') || url.searchParams.get('hq_hash') || '',
        sqHash: url.searchParams.get('sqHash') || url.searchParams.get('sq_hash') || '',
        resHash: url.searchParams.get('resHash') || url.searchParams.get('res_hash') || '',
        quality: url.searchParams.get('quality') || '',
        vipRequired: url.searchParams.get('vipRequired') || '',
        needVip: url.searchParams.get('needVip') || url.searchParams.get('need_vip') || '',
        onlyVipPlayable: url.searchParams.get('onlyVipPlayable') || url.searchParams.get('only_vip_playable') || '',
        privilege: url.searchParams.get('privilege') || url.searchParams.get('mediaPrivilege') || url.searchParams.get('media_privilege') || '',
        fee: url.searchParams.get('fee') || '',
      }, kugouCookie);
      sendJSON(res, info);
    } catch (err) {
      console.error('[KugouSongUrl]', err);
      sendJSON(res, { provider: 'kugou', url: '', playable: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/lyric') {
    try {
      const hash = url.searchParams.get('hash') || url.searchParams.get('id') || '';
      const albumAudioId = url.searchParams.get('albumAudioId') || url.searchParams.get('album_audio_id') || '';
      const duration = url.searchParams.get('duration') || '';
      if (!hash) { sendJSON(res, { provider: 'kugou', error: 'Missing Kugou hash', lyric: '' }, 400); return; }
      const data = await handleKugouLyric(hash, albumAudioId, duration);
      sendJSON(res, data);
    } catch (err) {
      console.error('[KugouLyric]', err);
      sendJSON(res, { provider: 'kugou', error: err.message, lyric: '' }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/login/status') {
    try {
      sendJSON(res, await getKugouLoginInfo(kugouCookie));
    } catch (err) {
      console.error('[KugouLoginStatus]', err);
      sendJSON(res, { provider: 'kugou', loggedIn: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/login/cookie') {
    try {
      const body = await readRequestBody(req);
      const raw = body.cookie || body.data || body.text || '';
      const normalized = normalizeKugouCookieInput(raw);
      const auth = extractKugouAuth(normalized);
      if (!auth.loggedIn && !parseCookieString(normalized).kg_mid) {
        sendJSON(res, { provider: 'kugou', loggedIn: false, error: 'INVALID_KUGOU_COOKIE', message: '酷狗 cookie 无效或缺少登录标识' }, 400);
        return;
      }
      saveKugouCookie(normalized);
      const info = await getKugouLoginInfo(kugouCookie);
      sendJSON(res, { ...info, saved: true, partial: auth.loggedIn && !auth.playbackReady });
    } catch (err) {
      console.error('[KugouLoginCookie]', err);
      sendJSON(res, { provider: 'kugou', loggedIn: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/logout') {
    saveKugouCookie('');
    sendJSON(res, { provider: 'kugou', loggedIn: false, ok: true });
    return;
  }

  if (pn === '/api/kugou/user/playlists') {
    try {
      sendJSON(res, await handleKugouUserPlaylists(kugouCookie));
    } catch (err) {
      console.error('[KugouUserPlaylists]', err);
      sendJSON(res, { provider: 'kugou', loggedIn: false, error: err.message, playlists: [] }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/playlist/tracks') {
    try {
      const id = url.searchParams.get('id') || url.searchParams.get('global_collection_id') || '';
      const paged = url.searchParams.has('limit') || url.searchParams.has('offset');
      const limit = Math.max(10, Math.min(50, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      sendJSON(res, await handleKugouPlaylistTracks(id, kugouCookie, paged ? { limit, offset, paged: true } : {}));
    } catch (err) {
      console.error('[KugouPlaylistTracks]', err);
      sendJSON(res, { provider: 'kugou', error: err.message, tracks: [] }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/song/like/check') {
    try {
      if (!kugouCookieHasPlayback(kugouCookie)) {
        sendJSON(res, { provider: 'kugou', loggedIn: false, liked: {}, error: 'KUGOU_AUTH_REQUIRED' });
        return;
      }
      const hashes = url.searchParams.get('hashes') || url.searchParams.get('hash') || '';
      sendJSON(res, await handleKugouLikeCheck({ hashes }, kugouCookie));
    } catch (err) {
      console.error('[KugouLikeCheck]', err);
      sendJSON(res, { provider: 'kugou', liked: {}, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/song/like') {
    try {
      if (!kugouCookieHasPlayback(kugouCookie)) {
        sendJSON(res, { provider: 'kugou', success: false, error: 'KUGOU_AUTH_REQUIRED' }, 401);
        return;
      }
      const body = req.method === 'POST' ? await readRequestBody(req) : {};
      const song = body.song || {};
      const like = String(body.like != null ? body.like : (url.searchParams.get('like') || 'true')) !== 'false';
      sendJSON(res, await handleKugouLikeToggle(song, like, kugouCookie));
    } catch (err) {
      console.error('[KugouLike]', err);
      sendJSON(res, { provider: 'kugou', success: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/kugou/playlist/add-song') {
    try {
      if (!kugouCookieHasPlayback(kugouCookie)) {
        sendJSON(res, { provider: 'kugou', success: false, error: 'KUGOU_AUTH_REQUIRED' }, 401);
        return;
      }
      const body = req.method === 'POST' ? await readRequestBody(req) : {};
      const pid = body.pid || url.searchParams.get('pid') || '';
      const song = body.song || body;
      if (!pid) { sendJSON(res, { provider: 'kugou', success: false, error: 'Missing playlist id' }, 400); return; }
      sendJSON(res, await handleKugouPlaylistAddSong(pid, song, kugouCookie));
    } catch (err) {
      console.error('[KugouPlaylistAddSong]', err);
      sendJSON(res, { provider: 'kugou', success: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qq/song/url') {
    try {
      const mid = url.searchParams.get('mid') || url.searchParams.get('id') || '';
      const mediaMid = url.searchParams.get('mediaMid') || url.searchParams.get('media_mid') || '';
      const quality = url.searchParams.get('quality') || '';
      const playbackHints = {
        vipRequired: url.searchParams.get('vipRequired') || '',
        needVip: url.searchParams.get('needVip') || url.searchParams.get('need_vip') || '',
        onlyVipPlayable: url.searchParams.get('onlyVipPlayable') || url.searchParams.get('only_vip_playable') || '',
        privilege: url.searchParams.get('privilege') || url.searchParams.get('mediaPrivilege') || url.searchParams.get('media_privilege') || '',
        fee: url.searchParams.get('fee') || ''
      };
      const info = await handleQQSongUrl(mid, mediaMid, quality, playbackHints);
      sendJSON(res, info);
    } catch (err) {
      console.error('[QQSongUrl]', err);
      sendJSON(res, { provider: 'qq', url: '', playable: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qq/lyric') {
    try {
      const mid = url.searchParams.get('mid') || url.searchParams.get('songmid') || '';
      const id = url.searchParams.get('id') || url.searchParams.get('qqId') || '';
      if (!mid && !id) { sendJSON(res, { provider: 'qq', error: 'Missing QQ song mid or id', lyric: '' }, 400); return; }
      const data = await handleQQLyric(mid, id);
      sendJSON(res, data);
    } catch (err) {
      console.error('[QQLyric]', err);
      sendJSON(res, { provider: 'qq', error: err.message, lyric: '' }, 500);
    }
    return;
  }

  // ---------- 歌曲URL ----------
  if (pn === '/api/qq/login/status') {
    try {
      const forceVip = /^(1|true|yes)$/i.test(String(url.searchParams.get('forceVip') || url.searchParams.get('force') || ''));
      const info = await getQQLoginInfo({ forceVip, forceCookie: forceVip });
      sendJSON(res, info);
    } catch (err) {
      console.error('[QQLoginStatus]', err);
      sendJSON(res, { provider: 'qq', loggedIn: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qq/login/cookie') {
    try {
      const body = await readRequestBody(req);
      const raw = body.cookie || body.data || body.text || '';
      const normalized = normalizeQQCookieInput(raw);
      const obj = parseCookieString(normalized);
      if (!qqCookieUin(obj) || !qqCookiePlaybackKey(obj)) {
        const hasWebSession = !!(qqCookieUin(obj) && qqCookieMusicKey(obj));
        sendJSON(res, {
          provider: 'qq',
          loggedIn: false,
          partial: hasWebSession,
          error: hasWebSession ? 'QQ_PLAYBACK_AUTH_INCOMPLETE' : 'INVALID_QQ_COOKIE',
          message: hasWebSession
            ? 'QQ 账号验证已完成，但 QQ 音乐播放授权尚未生成，请重新打开官方登录窗口完成授权'
            : 'QQ cookie 缺少 uin 或有效 QQ 音乐播放票据',
        }, 400);
        return;
      }
      saveQQCookie(normalized);
      const info = await getQQLoginInfo({ forceVip: true, forceCookie: true });
      sendJSON(res, { ...info, saved: true });
    } catch (err) {
      console.error('[QQLoginCookie]', err);
      sendJSON(res, { provider: 'qq', loggedIn: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/qq/logout') {
    saveQQCookie('');
    sendJSON(res, { provider: 'qq', ok: true, loggedIn: false });
    return;
  }

  if (pn === '/api/qq/user/playlists') {
    try {
      const data = await handleQQUserPlaylists();
      sendJSON(res, data);
    } catch (err) {
      console.error('[QQUserPlaylists]', err);
      sendJSON(res, { provider: 'qq', loggedIn: false, error: err.message, playlists: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qq/playlist/tracks') {
    try {
      const id = url.searchParams.get('id') || url.searchParams.get('disstid') || '';
      const data = await handleQQPlaylistTracks(id, {
        limit: url.searchParams.get('limit') || '',
        offset: url.searchParams.get('offset') || '0',
      });
      sendJSON(res, data);
    } catch (err) {
      console.error('[QQPlaylistTracks]', err);
      sendJSON(res, { provider: 'qq', error: err.message, tracks: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qq/artist/detail') {
    try {
      const mid = url.searchParams.get('mid') || url.searchParams.get('singermid') || '';
      const limit = Math.max(10, Math.min(80, parseInt(url.searchParams.get('limit') || '36', 10) || 36));
      if (!mid) {
        sendJSON(res, { provider: 'qq', error: 'MISSING_SINGER_MID', artist: null, songs: [] }, 400);
        return;
      }
      const data = await handleQQArtistDetail(mid, limit);
      sendJSON(res, data);
    } catch (err) {
      console.error('[QQArtistDetail]', err);
      sendJSON(res, { provider: 'qq', error: err.message, artist: null, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qq/album/detail') {
    try {
      const mid = url.searchParams.get('mid') || url.searchParams.get('albummid') || url.searchParams.get('albumMid') || '';
      const limit = Math.max(10, Math.min(120, parseInt(url.searchParams.get('limit') || '80', 10) || 80));
      if (!mid) {
        sendJSON(res, { provider: 'qq', error: 'MISSING_ALBUM_MID', album: null, songs: [] }, 400);
        return;
      }
      sendJSON(res, await handleQQAlbumDetail(mid, limit));
    } catch (err) {
      console.error('[QQAlbumDetail]', err);
      sendJSON(res, { provider: 'qq', error: err.message, album: null, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/qq/song/comments') {
    try {
      const id = url.searchParams.get('id') || url.searchParams.get('qqId') || '';
      const mid = url.searchParams.get('mid') || url.searchParams.get('songmid') || '';
      const limit = Math.max(6, Math.min(50, parseInt(url.searchParams.get('limit') || '20', 10) || 20));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const data = await handleQQSongComments(id, mid, limit, offset);
      sendJSON(res, data);
    } catch (err) {
      console.error('[QQSongComments]', err);
      sendJSON(res, { provider: 'qq', error: err.message, comments: [] }, 500);
    }
    return;
  }

  if (pn === '/api/podcast/search') {
    try {
      const kw = String(url.searchParams.get('keywords') || '').trim();
      const limit = Math.max(6, Math.min(30, parseInt(url.searchParams.get('limit') || '18', 10) || 18));
      if (!kw) { sendJSON(res, { podcasts: [] }); return; }
      const r = await cloudsearch({ keywords: kw, type: 1009, limit, cookie: userCookie, timestamp: Date.now() });
      const result = (r.body && r.body.result) || {};
      const raw = result.djRadios || result.djradios || result.radios || [];
      const podcasts = raw.map(mapPodcastRadio).filter(p => p.id);
      sendJSON(res, { podcasts, total: result.djRadiosCount || result.djradiosCount || podcasts.length });
    } catch (err) {
      console.error('[PodcastSearch]', err);
      sendJSON(res, { error: err.message, podcasts: [] }, 500);
    }
    return;
  }

  if (pn === '/api/podcast/hot') {
    try {
      const limit = Math.max(6, Math.min(30, parseInt(url.searchParams.get('limit') || '18', 10) || 18));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const r = await dj_hot({ limit, offset, cookie: userCookie, timestamp: Date.now() });
      const body = r.body || {};
      const raw = body.djRadios || body.djradios || body.radios || body.data || [];
      const podcasts = (Array.isArray(raw) ? raw : []).map(mapPodcastRadio).filter(p => p.id);
      sendJSON(res, { podcasts, more: !!body.hasMore });
    } catch (err) {
      console.error('[PodcastHot]', err);
      sendJSON(res, { error: err.message, podcasts: [] }, 500);
    }
    return;
  }

  if (pn === '/api/podcast/detail') {
    try {
      const rid = url.searchParams.get('id') || url.searchParams.get('rid');
      if (!rid) { sendJSON(res, { error: 'Missing podcast id' }, 400); return; }
      const r = await dj_detail({ rid, cookie: userCookie, timestamp: Date.now() });
      const body = r.body || {};
      const radio = mapPodcastRadio(body.data || body.djRadio || body.radio || body);
      sendJSON(res, { podcast: radio });
    } catch (err) {
      console.error('[PodcastDetail]', err);
      sendJSON(res, { error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/podcast/programs') {
    try {
      const rid = url.searchParams.get('id') || url.searchParams.get('rid');
      if (!rid) { sendJSON(res, { error: 'Missing podcast id', programs: [] }, 400); return; }
      const limit = Math.max(10, Math.min(60, parseInt(url.searchParams.get('limit') || '30', 10) || 30));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const r = await dj_program({ rid, limit, offset, asc: false, cookie: userCookie, timestamp: Date.now() });
      const body = r.body || {};
      const raw = body.programs || (body.data && (body.data.list || body.data.programs)) || [];
      const radio = raw[0] && raw[0].radio ? mapPodcastRadio(raw[0].radio) : { id: rid, rid };
      const programs = (Array.isArray(raw) ? raw : [])
        .map(p => mapPodcastProgram(p, radio))
        .filter(p => p.id && p.name);
      sendJSON(res, { radio, programs, more: !!body.more, total: body.count || programs.length });
    } catch (err) {
      console.error('[PodcastPrograms]', err);
      sendJSON(res, { error: err.message, programs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/podcast/my') {
    try {
      const info = await getLoginInfo();
      if (!info.loggedIn || !info.userId) {
        const empty = ['collect', 'created', 'liked'].map(k => podcastCollectionMeta(k, []));
        sendJSON(res, { loggedIn: false, collections: empty });
        return;
      }
      const keys = ['collect', 'created', 'liked'];
      const collections = await Promise.all(keys.map(async key => {
        try {
          const data = await fetchMyPodcastItems(key, info, 12, 0);
          return podcastCollectionMeta(key, data.items || []);
        } catch (e) {
          console.warn('[MyPodcast]', key, e.message);
          return podcastCollectionMeta(key, []);
        }
      }));
      sendJSON(res, { loggedIn: true, collections });
    } catch (err) {
      console.error('[MyPodcast]', err);
      sendJSON(res, { error: err.message, collections: [] }, 500);
    }
    return;
  }

  if (pn === '/api/podcast/my/items') {
    try {
      const info = await getLoginInfo();
      if (!info.loggedIn || !info.userId) { sendJSON(res, { loggedIn: false, items: [] }); return; }
      const key = String(url.searchParams.get('key') || 'collect');
      const limit = parseInt(url.searchParams.get('limit') || '48', 10) || 48;
      const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;
      const data = await fetchMyPodcastItems(key, info, limit, offset);
      sendJSON(res, { loggedIn: true, key, ...podcastCollectionMeta(key, data.items || []), itemType: data.itemType, items: data.items || [] });
    } catch (err) {
      console.error('[MyPodcastItems]', err);
      sendJSON(res, { error: err.message, items: [] }, 500);
    }
    return;
  }

  if (pn === '/api/album/detail') {
    try {
      const id = url.searchParams.get('id') || url.searchParams.get('albumId') || '';
      const limit = Math.max(10, Math.min(120, parseInt(url.searchParams.get('limit') || '80', 10) || 80));
      if (!id) {
        sendJSON(res, { provider: 'netease', error: 'Missing album id', album: null, songs: [] }, 400);
        return;
      }
      sendJSON(res, await handleNeteaseAlbumDetail(id, limit));
    } catch (err) {
      console.error('[AlbumDetail]', err);
      sendJSON(res, { provider: 'netease', error: err.message, album: null, songs: [] }, 500);
    }
    return;
  }

  if (pn === '/api/album/subscribe') {
    try {
      const info = await requireLogin(res);
      if (!info) return;
      const body = req.method === 'POST' ? await readRequestBody(req) : {};
      const id = body.id || body.albumId || url.searchParams.get('id') || '';
      const subscribed = String(body.subscribed != null ? body.subscribed : (url.searchParams.get('subscribed') || 'true')) !== 'false';
      if (!id) { sendJSON(res, { success: false, error: 'Missing album id' }, 400); return; }
      const result = await album_sub({ id, t: subscribed ? 1 : 0, cookie: userCookie, timestamp: Date.now() });
      const code = normalizeApiCode(result);
      sendJSON(res, { provider: 'netease', id, subscribed, success: code === 200, code, body: result.body || result });
    } catch (err) {
      console.error('[AlbumSubscribe]', err);
      sendJSON(res, { provider: 'netease', success: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/album/subscribe/check') {
    try {
      const info = await requireLogin(res);
      if (!info) return;
      const ids = String(url.searchParams.get('ids') || url.searchParams.get('id') || '')
        .split(',').map(value => value.trim()).filter(Boolean);
      if (!ids.length) { sendJSON(res, { provider: 'netease', subscribed: {} }); return; }
      const wanted = new Set(ids);
      const found = new Set();
      let offset = 0;
      for (let page = 0; page < 8 && found.size < wanted.size; page++) {
        const result = await album_sublist({ limit: 50, offset, cookie: userCookie, timestamp: Date.now() });
        const body = result.body || result || {};
        const rows = Array.isArray(body.data) ? body.data : (body.albums || []);
        rows.forEach(item => {
          const id = String(item && item.id || '');
          if (wanted.has(id)) found.add(id);
        });
        if (!body.hasMore || rows.length < 50) break;
        offset += rows.length;
      }
      const subscribed = {};
      ids.forEach(id => { subscribed[id] = found.has(id); });
      sendJSON(res, { provider: 'netease', ids, subscribed });
    } catch (err) {
      console.error('[AlbumSubscribeCheck]', err);
      sendJSON(res, { provider: 'netease', subscribed: {}, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/playlist/subscribe') {
    try {
      const info = await requireLogin(res);
      if (!info) return;
      const body = req.method === 'POST' ? await readRequestBody(req) : {};
      const id = body.id || body.playlistId || url.searchParams.get('id') || '';
      const subscribed = String(body.subscribed != null ? body.subscribed : (url.searchParams.get('subscribed') || 'true')) !== 'false';
      if (!id) { sendJSON(res, { success: false, error: 'Missing playlist id' }, 400); return; }
      const result = await playlist_subscribe({ id, t: subscribed ? 1 : 0, cookie: userCookie, timestamp: Date.now() });
      const code = normalizeApiCode(result);
      sendJSON(res, { provider: 'netease', id, subscribed, success: code === 200, code, body: result.body || result });
    } catch (err) {
      console.error('[PlaylistSubscribe]', err);
      sendJSON(res, { provider: 'netease', success: false, error: err.message }, 500);
    }
    return;
  }

  if (pn === '/api/song/url') {
    try {
      const sid = url.searchParams.get('id');
      const quality = url.searchParams.get('quality') || '';
      const matchHints = {
        name: url.searchParams.get('name') || '',
        artist: url.searchParams.get('artist') || '',
        artistId: url.searchParams.get('artistId') || '',
        artistIds: url.searchParams.get('artistIds') || '',
        artistNames: url.searchParams.get('artistNames') || '',
        album: url.searchParams.get('album') || '',
        duration: url.searchParams.get('duration') || '',
        excludeIds: url.searchParams.get('excludeIds') || '',
        skipDirect: url.searchParams.get('skipDirect') === '1',
      };
      const loginInfo = await getPlaybackLoginInfo();
      const info = await handleSongUrl(sid, loginInfo, quality, matchHints);
      sendJSON(res, {
        ...info,
        loggedIn: loginInfo.loggedIn,
        vipType: loginInfo.vipType || 0,
        vipLevel: loginInfo.vipLevel || 'none',
        isVip: !!loginInfo.isVip,
        isSvip: !!loginInfo.isSvip,
        vipLabel: loginInfo.vipLabel || '无VIP',
      });
    } catch (err) { console.error('[SongUrl]', err); sendJSON(res, { error: err.message }, 500); }
    return;
  }

  if (pn === '/api/login/cookie') {
    try {
      const body = await readRequestBody(req);
      const raw = body.cookie || body.data || body.text || '';
      const normalized = normalizeCookieHeader(raw);
      const obj = parseCookieString(normalized);
      if (!obj.MUSIC_U) {
        sendJSON(res, { loggedIn: false, error: 'INVALID_NETEASE_COOKIE', message: '网易云 cookie 缺少 MUSIC_U' }, 400);
        return;
      }
      saveCookie(normalized);
      let info = await getLoginInfo();
      if (!info.loggedIn && userCookie) {
        info = {
          loggedIn: true,
          pendingProfile: true,
          nickname: '网易云用户',
          avatar: '',
          vipType: 0,
          vipLevel: 'none',
          isVip: false,
          isSvip: false,
          vipLabel: '无VIP',
        };
      }
      sendJSON(res, { ...info, saved: true, hasCookie: !!userCookie });
    } catch (err) {
      console.error('[LoginCookie]', err);
      sendJSON(res, { loggedIn: false, error: err.message }, 500);
    }
    return;
  }

  // ---------- 登录: QR Key ----------
  // ---------- 播客 DJ 长音频后端离线锁拍 ----------
  if (pn === '/api/podcast/dj-beatmap') {
    try {
      const audioUrl = url.searchParams.get('url');
      const durationSec = Math.max(0, Number(url.searchParams.get('duration') || 0) || 0);
      if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) {
        sendJSON(res, { error: 'Invalid audio url' }, 400);
        return;
      }
      console.log('[PodcastDjBeatmap] start', Math.round(durationSec || 0) + 's');
      const started = Date.now();
      const introSec = Math.max(0, Number(url.searchParams.get('intro') || 0) || 0);
      const map = introSec
        ? await analyzePodcastDjIntro(audioUrl, { durationSec, introSec, userAgent: UA })
        : await analyzePodcastDjStream(audioUrl, { durationSec, userAgent: UA });
      console.log('[PodcastDjBeatmap] done beats:', map.visualBeatCount || 0, 'ms:', Date.now() - started, 'decode:', map.decode || {});
      sendJSON(res, { ok: true, map });
    } catch (err) {
      console.error('[PodcastDjBeatmap]', err);
      sendJSON(res, { ok: false, error: err.message || String(err) }, 500);
    }
    return;
  }

  if (pn === '/api/login/qr/key') {
    try {
      const r = await login_qr_key({ timestamp: Date.now() });
      const key = r.body && r.body.data && r.body.data.unikey;
      sendJSON(res, { key });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
    return;
  }

  // ---------- 登录: QR 二维码图片 ----------
  if (pn === '/api/login/qr/create') {
    try {
      const key = url.searchParams.get('key');
      const r = await login_qr_create({ key, qrimg: true, timestamp: Date.now() });
      const d = r.body && r.body.data;
      sendJSON(res, { img: d && d.qrimg, url: d && d.qrurl });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
    return;
  }

  // ---------- 登录: 轮询扫码状态 ----------
  if (pn === '/api/login/qr/check') {
    try {
      const key = url.searchParams.get('key');
      let r = await login_qr_check({ key, noCookie: true, timestamp: Date.now() });
      let body = r.body || {};
      let code = Number(body.code || r.code);
      let msg  = body.message || r.message || '';
      let cookie = readCookieFromResponse(r);
      if (code === 803 && !cookie) {
        try {
          const retry = await login_qr_check({ key, timestamp: Date.now() });
          const retryCookie = readCookieFromResponse(retry);
          if (retryCookie) {
            r = retry;
            body = retry.body || body;
            code = Number(body.code || retry.code || code);
            msg = body.message || retry.message || msg;
            cookie = retryCookie;
          }
        } catch (retryErr) {
          console.warn('[Login] qr cookie retry failed:', retryErr.message);
        }
      }
      // 803 = 授权成功, 802 = 已扫待确认, 801 = 等待扫码, 800 = 二维码过期
      if (code === 803) {
        if (cookie) saveCookie(cookie);
        let info = await getLoginInfo();
        if (!info.loggedIn) {
          const profile = body.profile || (body.data && body.data.profile) || {};
          const account = body.account || (body.data && body.data.account);
          const extra = body.data || body;
          info = normalizeLoginInfo(profile, account, extra);
          if (info.loggedIn) info = await enrichNeteaseLoginInfo(info, profile, account, extra);
        }
        if (!info.loggedIn && cookie) {
          info = {
            loggedIn: true,
            pendingProfile: true,
            nickname: (body.nickname || (body.profile && body.profile.nickname) || '网易云用户'),
            avatar: body.avatarUrl || (body.profile && body.profile.avatarUrl) || '',
            vipType: 0,
            vipLevel: 'none',
            isVip: false,
            isSvip: false,
            vipLabel: '无VIP',
          };
        }
        sendJSON(res, { code, message: msg, ...info, hasCookie: !!cookie });
        return;
      }
      sendJSON(res, { code, message: msg, nickname: body.nickname, avatar: body.avatarUrl });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
    return;
  }

  // ---------- 登录态查询 ----------
  if (pn === '/api/login/status') {
    const info = await getLoginInfo();
    sendJSON(res, info);
    return;
  }

  // ---------- 登出 ----------
  if (pn === '/api/logout') {
    try { await logout({ cookie: userCookie }); } catch (e) {}
    saveCookie('');
    sendJSON(res, { ok: true });
    return;
  }

  // ---------- 用户歌单 ----------
  if (pn === '/api/user/playlists') {
    try {
      const info = await getLoginInfo();
      if (!info.loggedIn || !info.userId) { sendJSON(res, { loggedIn: false, playlists: [] }); return; }
      const requestedLimit = Math.max(0, parseInt(url.searchParams.get('limit') || '0', 10) || 0);
      const requestedOffset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      if (requestedLimit || requestedOffset || url.searchParams.has('paged')) {
        const pageData = await fetchNeteaseUserPlaylistsPage(info.userId, requestedLimit || 48, requestedOffset);
        const pageList = pageData.playlists.map(pl => mapNeteasePlaylistMeta(pl, pl && pl.id));
        sendJSON(res, {
          loggedIn: true,
          userId: info.userId,
          playlists: pageList,
          total: pageData.total,
          offset: pageData.offset,
          limit: pageData.limit,
          nextOffset: pageData.nextOffset,
          hasMore: pageData.hasMore,
          partial: true,
        });
        return;
      }
      const rawPlaylists = await fetchAllNeteaseUserPlaylists(info.userId, requestedLimit);
      const list = rawPlaylists.map(pl => mapNeteasePlaylistMeta(pl, pl && pl.id));
      sendJSON(res, { loggedIn: true, userId: info.userId, playlists: list });
    } catch (err) {
      console.error('[UserPlaylists]', err);
      sendJSON(res, { error: err.message, loggedIn: false, playlists: [] }, 500);
    }
    return;
  }

  // ---------- 红心状态 ----------
  if (pn === '/api/song/like/check') {
    try {
      const info = await requireLogin(res);
      if (!info) return;
      const ids = String(url.searchParams.get('ids') || url.searchParams.get('id') || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (!ids.length) { sendJSON(res, { error: 'Missing song id', liked: {}, ids: [] }, 400); return; }
      let likedIds = [];
      try {
        if (typeof song_like_check === 'function') {
          const checked = await song_like_check({ ids: JSON.stringify(ids.map(Number).filter(Boolean)), cookie: userCookie, timestamp: Date.now() });
          const data = (checked.body && (checked.body.data || checked.body.ids)) || checked.body || {};
          if (Array.isArray(data)) likedIds = data.map(String);
          else if (data && typeof data === 'object') {
            ids.forEach(id => {
              if (data[id] || data[String(id)] || data[Number(id)]) likedIds.push(String(id));
            });
          }
        }
      } catch (e) {
        console.warn('[LikeCheck] direct check failed:', e.message);
      }
      if (!likedIds.length) {
        const r = await likelist({ uid: info.userId, cookie: userCookie, timestamp: Date.now() });
        likedIds = ((r.body && r.body.ids) || []).map(String);
      }
      const set = new Set(likedIds);
      const liked = {};
      ids.forEach(id => { liked[id] = set.has(String(id)); });
      sendJSON(res, { loggedIn: true, ids, liked });
    } catch (err) {
      console.error('[LikeCheck]', err);
      sendJSON(res, { error: err.message }, 500);
    }
    return;
  }

  // ---------- 红心/取消红心 ----------
  if (pn === '/api/song/like') {
    try {
      const info = await requireLogin(res);
      if (!info) return;
      const body = req.method === 'POST' ? await readRequestBody(req) : {};
      const id = body.id || url.searchParams.get('id');
      const nextLike = String(body.like != null ? body.like : (url.searchParams.get('like') || 'true')) !== 'false';
      if (!id) { sendJSON(res, { error: 'Missing song id' }, 400); return; }
      const r = await like_song({ id, like: String(nextLike), cookie: userCookie, timestamp: Date.now() });
      const code = (r.body && r.body.code) || r.code || 200;
      sendJSON(res, { loggedIn: true, id, liked: nextLike, code, body: r.body || r });
    } catch (err) {
      console.error('[Like]', err);
      sendJSON(res, { error: err.message }, 500);
    }
    return;
  }

  // ---------- 创建歌单 ----------
  if (pn === '/api/playlist/create') {
    try {
      const info = await requireLogin(res);
      if (!info) return;
      const body = req.method === 'POST' ? await readRequestBody(req) : {};
      const name = String(body.name || url.searchParams.get('name') || '').trim();
      const privacy = String(body.privacy || url.searchParams.get('privacy') || '0');
      if (!name) { sendJSON(res, { error: 'Missing playlist name' }, 400); return; }
      const r = await playlist_create({ name, privacy, cookie: userCookie, timestamp: Date.now() });
      const created = (r.body && (r.body.playlist || r.body.data)) || {};
      sendJSON(res, { loggedIn: true, playlist: created, body: r.body || r });
    } catch (err) {
      console.error('[PlaylistCreate]', err);
      sendJSON(res, { error: err.message }, 500);
    }
    return;
  }

  // ---------- 收藏歌曲到歌单 ----------
  if (pn === '/api/playlist/add-song') {
    try {
      const info = await requireLogin(res);
      if (!info) return;
      const body = req.method === 'POST' ? await readRequestBody(req) : {};
      const pid = body.pid || url.searchParams.get('pid');
      const id = body.id || body.ids || url.searchParams.get('id') || url.searchParams.get('ids');
      if (!pid || !id) { sendJSON(res, { error: 'Missing playlist id or song id' }, 400); return; }
      const attempts = [];
      let finalBody = null;
      let finalCode = 0;
      let finalMessage = '';
      let success = false;

      const primary = await playlist_tracks({ op: 'add', pid, tracks: String(id), cookie: userCookie, timestamp: Date.now() });
      finalBody = primary.body || primary;
      finalCode = normalizeApiCode(primary);
      finalMessage = normalizeApiMessage(primary);
      success = finalCode === 200 && !(finalBody && finalBody.error);
      attempts.push({ api: 'playlist_tracks', code: finalCode, message: finalMessage, body: finalBody });

      if (!success && typeof playlist_track_add === 'function') {
        try {
          const fallback = await playlist_track_add({ pid, ids: String(id), cookie: userCookie, timestamp: Date.now() });
          finalBody = fallback.body || fallback;
          finalCode = normalizeApiCode(fallback);
          finalMessage = normalizeApiMessage(fallback);
          success = finalCode === 200 && !(finalBody && finalBody.error);
          attempts.push({ api: 'playlist_track_add', code: finalCode, message: finalMessage, body: finalBody });
        } catch (fallbackErr) {
          const errBody = fallbackErr.body || fallbackErr.response || {};
          finalBody = errBody;
          finalCode = normalizeApiCode(errBody);
          finalMessage = normalizeApiMessage(errBody) || fallbackErr.message || '';
          attempts.push({ api: 'playlist_track_add', code: finalCode, message: finalMessage, body: errBody });
        }
      }

      if (!success) {
        sendJSON(res, { loggedIn: true, pid, id, success: false, code: finalCode, error: finalMessage || 'PLAYLIST_ADD_FAILED', attempts }, finalCode === 401 ? 401 : 409);
        return;
      }
      invalidateNeteasePlaylistTrackIndex(pid);
      sendJSON(res, { loggedIn: true, pid, id, success: true, code: finalCode, body: finalBody, attempts });
    } catch (err) {
      console.error('[PlaylistAddSong]', err);
      sendJSON(res, { error: err.message }, 500);
    }
    return;
  }

  // ---------- 歌词 ----------
  function lyricNodeText(body, key) {
    return body && body[key] && typeof body[key].lyric === 'string' ? body[key].lyric : '';
  }

  function lyricBodyHasPrimary(body) {
    return !!(lyricNodeText(body, 'lrc') || lyricNodeText(body, 'yrc'));
  }

  function lyricBodyHasTranslation(body) {
    return !!(lyricNodeText(body, 'tlyric') || lyricNodeText(body, 'ytlrc'));
  }

  function mergeLyricBodies(primary, fallback) {
    const merged = Object.assign({}, fallback || {}, primary || {});
    ['lrc', 'tlyric', 'yrc', 'ytlrc', 'romalrc', 'yromalrc', 'klyric'].forEach((key) => {
      if (!lyricNodeText(merged, key) && fallback && fallback[key]) merged[key] = fallback[key];
    });
    return merged;
  }

  if (pn === '/api/lyric') {
    try {
      const id = url.searchParams.get('id');
      if (!id) { sendJSON(res, { error: 'Missing song id', lyric: '' }, 400); return; }
      let body = {};
      let source = 'lyric';
      try {
        if (typeof lyric_new === 'function') {
          const nr = await lyric_new({ id, cookie: userCookie, timestamp: Date.now() });
          body = nr.body || {};
          source = 'lyric_new';
        }
      } catch (errNew) {
        console.warn('[LyricNew]', errNew.message);
      }
      if (!lyricBodyHasPrimary(body) || !lyricBodyHasTranslation(body)) {
        const r = await lyric({ id, cookie: userCookie, timestamp: Date.now() });
        body = mergeLyricBodies(body, r.body || {});
        source = source === 'lyric_new' ? 'lyric_new+lyric' : 'lyric';
      }
      sendJSON(res, {
        lyric: (body.lrc && body.lrc.lyric) || '',
        tlyric: (body.tlyric && body.tlyric.lyric) || '',
        yrc: (body.yrc && body.yrc.lyric) || '',
        ytlrc: (body.ytlrc && body.ytlrc.lyric) || '',
        romalrc: (body.romalrc && body.romalrc.lyric) || '',
        yromalrc: (body.yromalrc && body.yromalrc.lyric) || '',
        source,
      });
    } catch (err) {
      console.error('[Lyric]', err);
      sendJSON(res, { error: err.message, lyric: '' }, 500);
    }
    return;
  }

  // ---------- 歌曲评论 ----------
  if (pn === '/api/song/comments') {
    try {
      const requestBody = req.method === 'POST' ? await readRequestBody(req) : {};
      const id = requestBody.id || url.searchParams.get('id');
      if (req.method === 'POST') {
        const info = await requireLogin(res);
        if (!info) return;
        const content = String(requestBody.content || requestBody.text || '').trim();
        if (!id || !content) { sendJSON(res, { created: false, error: 'Missing song id or comment content' }, 400); return; }
        const result = await comment({
          t: requestBody.replyTo ? 2 : 1,
          type: 0,
          id,
          commentId: requestBody.replyTo || '',
          content,
          cookie: userCookie,
          timestamp: Date.now(),
        });
        const code = normalizeApiCode(result);
        sendJSON(res, { provider: 'netease', id, created: code === 200, success: code === 200, code, body: result.body || result });
        return;
      }
      const limit = Math.max(6, Math.min(50, parseInt(url.searchParams.get('limit') || '20', 10) || 20));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      if (!id) { sendJSON(res, { error: 'Missing song id', comments: [] }, 400); return; }
      const r = await comment_music({ id, limit, offset, cookie: userCookie, timestamp: Date.now() });
      const body = r.body || r || {};
      const raw = body.hotComments && offset === 0 ? body.hotComments : (body.comments || []);
      const comments = (raw || []).map(c => ({
        id: c.commentId,
        content: c.content || '',
        likedCount: c.likedCount || 0,
        time: c.time || 0,
        user: c.user ? { id: c.user.userId, nickname: c.user.nickname || '', avatar: c.user.avatarUrl || '' } : null,
      })).filter(c => c.content);
      sendJSON(res, { id, total: body.total || 0, comments, hot: !!(body.hotComments && offset === 0), body });
    } catch (err) {
      console.error('[SongComments]', err);
      sendJSON(res, { error: err.message, comments: [] }, 500);
    }
    return;
  }

  if (pn === '/api/song/comments/like') {
    try {
      const info = await requireLogin(res);
      if (!info) return;
      const body = req.method === 'POST' ? await readRequestBody(req) : {};
      const id = body.id || url.searchParams.get('id') || '';
      const cid = body.commentId || body.cid || url.searchParams.get('commentId') || '';
      const liked = String(body.liked != null ? body.liked : (url.searchParams.get('liked') || 'true')) !== 'false';
      if (!id || !cid) { sendJSON(res, { success: false, error: 'Missing song id or comment id' }, 400); return; }
      const result = await comment_like({ type: 0, id, cid, t: liked ? 1 : 0, cookie: userCookie, timestamp: Date.now() });
      const code = normalizeApiCode(result);
      sendJSON(res, { provider: 'netease', id, commentId: cid, liked, success: code === 200, code, body: result.body || result });
    } catch (err) {
      console.error('[SongCommentLike]', err);
      sendJSON(res, { provider: 'netease', success: false, error: err.message }, 500);
    }
    return;
  }

  // ---------- 歌手主页 / 热门歌曲 ----------
  if (pn === '/api/artist/detail') {
    try {
      const id = url.searchParams.get('id');
      const limit = Math.max(10, Math.min(80, parseInt(url.searchParams.get('limit') || '30', 10) || 30));
      if (!id) { sendJSON(res, { error: 'Missing artist id', songs: [] }, 400); return; }
      let detailBody = {};
      try {
        const detail = await artist_detail({ id, cookie: userCookie, timestamp: Date.now() });
        detailBody = detail.body || detail || {};
      } catch (e) {
        console.warn('[ArtistDetail] detail failed:', e.message);
      }
      let rawSongs = [];
      try {
        const list = await artist_songs({ id, order: 'hot', limit, offset: 0, cookie: userCookie, timestamp: Date.now() });
        const b = list.body || list || {};
        rawSongs = (b.songs || (b.data && b.data.songs) || []);
      } catch (e) {
        console.warn('[ArtistSongs] hot failed:', e.message);
      }
      if (!rawSongs.length) {
        const top = await artist_top_song({ id, cookie: userCookie, timestamp: Date.now() });
        const b = top.body || top || {};
        rawSongs = b.songs || [];
      }
      const artist = detailBody.artist || (detailBody.data && (detailBody.data.artist || detailBody.data)) || {};
      const songs = rawSongs.map(mapSongRecord).filter(s => s.id).slice(0, limit);
      sendJSON(res, {
        id,
        artist: {
          id: artist.id || id,
          name: artist.name || artist.artistName || '',
          avatar: artist.avatar || artist.cover || artist.picUrl || artist.img1v1Url || '',
          brief: artist.briefDesc || artist.description || artist.desc || '',
          musicSize: artist.musicSize || artist.songSize || 0,
          albumSize: artist.albumSize || 0,
        },
        songs,
        body: detailBody,
      });
    } catch (err) {
      console.error('[ArtistDetail]', err);
      sendJSON(res, { error: err.message, songs: [] }, 500);
    }
    return;
  }

  // ---------- 歌单曲目详情 ----------
  if (pn === '/api/playlist/tracks') {
    try {
      const id = url.searchParams.get('id');
      if (!id) { sendJSON(res, { error: 'Missing playlist id', tracks: [] }, 400); return; }

      const pageLimit = parseInt(url.searchParams.get('limit') || '0', 10) || 0;
      const pageOffset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;
      if (pageLimit || pageOffset) {
        const pageData = await fetchNeteasePlaylistTracksPage(id, pageLimit || 48, pageOffset);
        const pageTracks = (pageData.rawTracks || []).map(mapSongRecord).filter(t => t.id);
        sendJSON(res, {
          playlist: pageData.playlistMeta || { id, name: '', cover: '', trackCount: 0 },
          tracks: pageTracks,
          offset: pageData.offset,
          limit: pageData.limit,
          nextOffset: pageData.nextOffset,
          hasMore: pageData.hasMore,
          total: pageData.total || Number(pageData.playlistMeta && pageData.playlistMeta.trackCount) || 0,
          partial: true,
        });
        return;
      }

      const syncedData = await fetchAllNeteasePlaylistTracks(id);
      const syncedPlaylistMeta = syncedData.playlistMeta || { id, name: '', cover: '', trackCount: 0 };
      const syncedRawTracks = syncedData.rawTracks || [];
      const syncedTracks = syncedRawTracks.map(mapSongRecord).filter(t => t.id);
      if (!syncedPlaylistMeta.trackCount) syncedPlaylistMeta.trackCount = syncedTracks.length;
      sendJSON(res, { playlist: syncedPlaylistMeta, tracks: syncedTracks });
      return;

    } catch (err) {
      console.error('[PlaylistTracks]', err);
      sendJSON(res, { error: err.message, tracks: [] }, 500);
    }
    return;
  }

  // ---------- 封面代理 (带 CORS 头, 给 canvas 提取像素用) ----------
  if (pn === '/api/cover') {
    try {
      const coverUrl = url.searchParams.get('url');
      // URL 校验: 必须是 http(s) 开头, 否则直接 404 (不要让 fetch 抛错)
      if (!coverUrl || !/^https?:\/\//i.test(coverUrl)) {
        res.writeHead(400, { 'Access-Control-Allow-Origin': '*' });
        res.end('Invalid cover url');
        return;
      }
      const resp = await fetch(coverUrl, { headers: { 'User-Agent': UA, 'Referer': 'https://music.163.com/' } });
      const ct  = resp.headers.get('content-type') || 'image/jpeg';
      const cl  = resp.headers.get('content-length');
      const hdr = {
        'Content-Type': ct,
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'public, max-age=86400',
      };
      if (cl) hdr['Content-Length'] = cl;
      res.writeHead(resp.status, hdr);
      const reader = resp.body.getReader();
      while (true) { const c = await reader.read(); if (c.done) break; res.write(c.value); }
      res.end();
    } catch (err) { console.error('[Cover]', err); res.writeHead(500); res.end(); }
    return;
  }

  // ---------- 音频代理 (支持 Range) ----------
  if (pn === '/api/audio') {
    try {
      const audioUrl = url.searchParams.get('url');
      if (!audioUrl) { res.writeHead(400); res.end('Missing url'); return; }
      const range = req.headers.range || '';
      if (audioUrl.includes('#auth=')) {
        const decrypted = await getQishuiDecryptedAudio(audioUrl);
        if (decrypted && decrypted.buffer) {
          sendAudioBuffer(res, decrypted.buffer, decrypted.contentType, range);
          return;
        }
      }
      const hdr = audioProxyHeadersFor(audioUrl, range);
      const up = await fetchWithTimeout(audioUrl, { headers: hdr }, 9000);
      const out = {
        'Content-Type': audioContentTypeForUrl(audioUrl, up.headers.get('content-type')),
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      };
      const cl = up.headers.get('content-length'); if (cl) out['Content-Length'] = cl;
      const cr = up.headers.get('content-range');  if (cr) out['Content-Range']  = cr;
      res.writeHead(up.status, out);
      if (!up.body) { res.end(); return; }
      const reader = up.body.getReader();
      let clientClosed = false;
      const closeReader = () => {
        clientClosed = true;
        try { Promise.resolve(reader.cancel()).catch(() => {}); } catch (_) {}
      };
      res.once('close', closeReader);
      try {
        while (!clientClosed) {
          const c = await readStreamChunkWithTimeout(reader, 12000);
          if (c.done) break;
          res.write(c.value);
        }
      } finally {
        res.removeListener('close', closeReader);
        if (clientClosed) {
          try { await reader.cancel(); } catch (_) {}
        }
      }
      if (clientClosed) return;
      res.end();
    } catch (err) {
      console.error('[Audio]', err && (err.code || err.name || err.message || 'AUDIO_PROXY_FAILED'));
      if (res.headersSent) {
        try { res.destroy(); } catch (_) {}
      } else {
        res.writeHead(err && err.name === 'AbortError' ? 504 : 502, { 'Cache-Control': 'no-store' });
        res.end();
      }
    }
    return;
  }

  // ---------- 静态资源 ----------
  if (pn === '/favicon.ico') {
    serveStatic(res, path.join(__dirname, 'build', 'icon.ico'));
    return;
  }

  let filePath = pn === '/' ? '/index.html' : pn;
  filePath = path.join(__dirname, 'public', filePath);
  serveStatic(res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log('======================================================');
  console.log(' 粒子音乐可视化 v2  →  http://localhost:' + PORT);
  console.log(' 登录态: ' + (userCookie ? '已登录(cookie已加载)' : '未登录'));
  console.log('======================================================');
});

server.clearAllLoginCredentials = clearAllRuntimeLoginCredentials;

module.exports = server;
