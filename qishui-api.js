'use strict';

const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const path = require('path');

const QISHUI_API_BASE = (process.env.QISHUI_API_BASE || 'https://open.douyin.com').replace(/\/+$/, '');
const QISHUI_RELATED_MEDIA_PATH = '/api/luna/v1/platform/feed/related-media/';
const QISHUI_FEED_SONG_TAB_PATH = '/api/luna/v1/platform/feed/song-tab/';
const QISHUI_SCOPE = 'luna.openapi.platform.play_core';
const DEFAULT_QISHUI_TOKEN_FILE = path.join(__dirname, '.qishui-token');
const QISHUI_UA = 'Mineradio/2.1.0 (Qishui official OpenAPI bridge)';
const QISHUI_OAUTH_AUTH_URL = (process.env.QISHUI_OAUTH_AUTH_URL || 'https://open.douyin.com/platform/oauth/connect').replace(/\/+$/, '');
const QISHUI_OAUTH_TOKEN_URL = process.env.QISHUI_OAUTH_TOKEN_URL || 'https://open.douyin.com/oauth/access_token/';
const QISHUI_PUBLIC_ENABLED = process.env.QISHUI_PUBLIC_ENABLED !== '0';
const QISHUI_PUBLIC_SEARCH_URL = process.env.QISHUI_PUBLIC_SEARCH_URL || 'https://api-vehicle.volcengine.com/v2/search/type';
const QISHUI_PUBLIC_CONTENTS_URL = process.env.QISHUI_PUBLIC_CONTENTS_URL || 'https://api-vehicle.volcengine.com/v2/custom/contents';
const QISHUI_VIRTUAL_FEED_PLAYLIST_ID = 'qishui-feed';
const QISHUI_WEB_LIKED_PLAYLIST_ID = 'qishui-liked';
const QISHUI_WEB_RECENT_PLAYLIST_ID = 'qishui-recent';
const QISHUI_WEB_API_BASES = (process.env.QISHUI_WEB_API_BASES || 'https://api5-lq.qishui.com,https://api.qishui.com')
  .split(',')
  .map(item => item.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const QISHUI_WEB_PC_API_BASE = (process.env.QISHUI_WEB_PC_API_BASE || 'https://api.qishui.com').replace(/\/+$/, '');
const QISHUI_PUBLIC_HEADERS = {
  'Accept': 'application/json,text/plain,*/*',
  'User-Agent': 'Mineradio/2.1.0 (Qishui public catalog bridge)',
};
const QISHUI_WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SodaMusic/3.1.0 Chrome/136.0.7103.59 Electron/36.4.0-rs.22.release.main.1 TTElectron/36.4.0-rs.22.release.main.1 Safari/537.36';
const QISHUI_PC_APP_UA = 'LunaPC/3.3.0(359450208)';
const QISHUI_WEB_DEFAULT_PARAMS = {
  aid: '386088',
  app_name: 'luna_pc',
  device_platform: 'web',
  channel: 'pc_web',
};
function firstEnv(keys) {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function normalizeQishuiOAuthFileConfig(raw, file) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const oauth = raw.oauth && typeof raw.oauth === 'object' ? raw.oauth : raw;
  return {
    clientKey: String(oauth.clientKey || oauth.client_key || oauth.clientId || oauth.client_id || oauth.key || '').trim(),
    clientSecret: String(oauth.clientSecret || oauth.client_secret || oauth.secret || '').trim(),
    redirectUri: String(oauth.redirectUri || oauth.redirect_uri || oauth.redirectURL || oauth.redirect_url || '').trim(),
    scope: String(oauth.scope || oauth.scopes || '').trim(),
    file,
    source: file ? 'file' : '',
  };
}

function qishuiOAuthConfigFileCandidates() {
  const candidates = [];
  const add = (value) => {
    value = String(value || '').trim();
    if (!value) return;
    const resolved = path.resolve(value);
    if (!candidates.includes(resolved)) candidates.push(resolved);
  };
  add(firstEnv(['QISHUI_OAUTH_CONFIG_FILE', 'DOUYIN_OAUTH_CONFIG_FILE']));
  try { add(path.join(path.dirname(qishuiTokenFile()), '.qishui-oauth.json')); } catch (_) {}
  add(path.join(__dirname, '.qishui-oauth.json'));
  add(path.join(__dirname, 'qishui-oauth.json'));
  return candidates;
}

function readQishuiOAuthFileConfig() {
  const candidates = qishuiOAuthConfigFileCandidates();
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      const config = normalizeQishuiOAuthFileConfig(parsed, file);
      if (config.clientKey || config.clientSecret || config.redirectUri || config.scope) return config;
    } catch (e) {
      console.warn('[QishuiOAuthConfig] ignored invalid config file:', file, e.message);
    }
  }
  return normalizeQishuiOAuthFileConfig(null, candidates[0] || '');
}

function getQishuiOAuthConfig() {
  const fileConfig = readQishuiOAuthFileConfig();
  const clientKey = firstEnv(['QISHUI_OAUTH_CLIENT_KEY', 'QISHUI_CLIENT_KEY', 'DOUYIN_CLIENT_KEY']) || fileConfig.clientKey;
  const clientSecret = firstEnv(['QISHUI_OAUTH_CLIENT_SECRET', 'QISHUI_CLIENT_SECRET', 'DOUYIN_CLIENT_SECRET']) || fileConfig.clientSecret;
  const redirectUri = firstEnv(['QISHUI_OAUTH_REDIRECT_URI', 'QISHUI_REDIRECT_URI', 'DOUYIN_REDIRECT_URI']) || fileConfig.redirectUri;
  const scope = firstEnv(['QISHUI_OAUTH_SCOPE', 'DOUYIN_OAUTH_SCOPE']) || fileConfig.scope || QISHUI_SCOPE;
  const missing = [];
  if (!clientKey) missing.push('QISHUI_OAUTH_CLIENT_KEY');
  if (!clientSecret) missing.push('QISHUI_OAUTH_CLIENT_SECRET');
  if (!redirectUri) missing.push('QISHUI_OAUTH_REDIRECT_URI');
  else if (!/^https:\/\//i.test(redirectUri)) missing.push('QISHUI_OAUTH_REDIRECT_URI(https)');
  return {
    configured: missing.length === 0,
    clientKey,
    clientSecret,
    redirectUri,
    scope,
    authUrl: QISHUI_OAUTH_AUTH_URL,
    tokenUrl: QISHUI_OAUTH_TOKEN_URL,
    missing,
    configFile: fileConfig.file || '',
    configSource: fileConfig.source || (clientKey || clientSecret || redirectUri ? 'env' : ''),
  };
}

function qishuiOAuthConfigError(config) {
  const err = new Error('QISHUI_OAUTH_NOT_CONFIGURED');
  err.code = 'QISHUI_OAUTH_NOT_CONFIGURED';
  err.missing = (config && config.missing) || [];
  err.message = 'QISHUI_OAUTH_NOT_CONFIGURED: ' + err.missing.join(', ');
  return err;
}

function buildQishuiOAuthAuthorizeUrl(state) {
  const config = getQishuiOAuthConfig();
  if (!config.configured) throw qishuiOAuthConfigError(config);
  const url = new URL(config.authUrl);
  url.searchParams.set('client_key', config.clientKey);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scope);
  url.searchParams.set('redirect_uri', config.redirectUri);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

function createTtlCache(maxEntries, defaultTtlMs) {
  const store = new Map();
  const inflight = new Map();
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit || Date.now() - hit.at > hit.ttl) return null;
      return hit.value;
    },
    set(key, value, ttlMs) {
      store.set(key, { at: Date.now(), ttl: ttlMs || defaultTtlMs, value });
      if (store.size > maxEntries) {
        const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest) store.delete(oldest[0]);
      }
    },
    clear() {
      store.clear();
      inflight.clear();
    },
    async wrap(key, ttlMs, fn) {
      const cached = this.get(key);
      if (cached !== null) return cached;
      if (inflight.has(key)) return inflight.get(key);
      const promise = Promise.resolve().then(fn).then((value) => {
        const resolvedTtlMs = typeof ttlMs === 'function' ? ttlMs(value) : ttlMs;
        if (resolvedTtlMs !== 0) this.set(key, value, resolvedTtlMs);
        return value;
      }).finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
    },
  };
}

const qishuiSearchCache = createTtlCache(80, 2 * 60 * 1000);
const qishuiLyricCache = createTtlCache(240, 30 * 60 * 1000);
const qishuiPublicDetailCache = createTtlCache(240, 30 * 60 * 1000);
const qishuiFeedCache = createTtlCache(16, 90 * 1000);
const qishuiWebLibraryCache = createTtlCache(24, 90 * 1000);
const qishuiWebPlaylistCache = createTtlCache(48, 90 * 1000);
const qishuiWebPlaylistCursorCache = new Map();
const qishuiMembershipCache = createTtlCache(24, 60 * 1000);
const qishuiMembershipPositiveHistory = new Map();
const QISHUI_MEMBERSHIP_POSITIVE_CACHE_MS = 10 * 1000;
const QISHUI_MEMBERSHIP_POSITIVE_GRACE_MS = 20 * 1000;
const qishuiTrackMetadataCache = createTtlCache(120, 20 * 1000);
const qishuiPlaybackCache = createTtlCache(120, 4 * 60 * 1000);

function requestText(targetUrl, opts, body) {
  return requestTextWithMeta(targetUrl, opts, body).then(meta => meta.text);
}

async function requestJson(targetUrl, opts, body) {
  const text = await requestText(targetUrl, opts, body);
  if (!text.trim()) {
    const err = new Error('汽水接口暂时返回空响应，请稍后重试。');
    err.code = 'QISHUI_EMPTY_RESPONSE';
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error('Invalid JSON from Qishui OpenAPI');
    err.cause = e;
    err.body = text;
    throw err;
  }
}

function requestJsonWithMeta(targetUrl, opts, body) {
  opts = opts || {};
  return requestTextWithMeta(targetUrl, opts, body).then(meta => {
    try {
      return { json: JSON.parse(meta.text), headers: meta.headers || {}, statusCode: meta.statusCode };
    } catch (e) {
      const err = new Error('Invalid JSON from Qishui API');
      err.cause = e;
      err.body = meta.text;
      err.headers = meta.headers || {};
      throw err;
    }
  });
}

function requestTextWithMeta(targetUrl, opts, body) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const lib = u.protocol === 'https:' ? https : http;
    let deadline;
    const fail = error => {
      clearTimeout(deadline);
      reject(error);
    };
    const req = lib.request(u, {
      method: opts.method || 'GET',
      headers: opts.headers || {},
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', fail);
      response.on('aborted', () => fail(new Error('汽水接口响应中断，请重试。')));
      response.on('end', () => {
        clearTimeout(deadline);
        const text = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode >= 400) {
          const err = new Error('HTTP ' + response.statusCode);
          err.statusCode = response.statusCode;
          err.body = text;
          err.headers = response.headers || {};
          reject(err);
          return;
        }
        resolve({ text, headers: response.headers || {}, statusCode: response.statusCode });
      });
    });
    // A wall-clock deadline also covers DNS/TLS and a response that keeps
    // trickling bytes; socket inactivity alone cannot bound a playback attempt.
    deadline = setTimeout(() => {
      const error = new Error('汽水接口请求超时，请稍后重试。');
      error.code = 'QISHUI_REQUEST_TIMEOUT';
      req.destroy(error);
      fail(error);
    }, Number(opts.timeoutMs) || 7000);
    req.on('error', fail);
    try {
      if (body) req.write(body);
      req.end();
    } catch (error) {
      fail(error);
    }
  });
}

function urlWithParams(baseUrl, params) {
  const u = new URL(baseUrl);
  Object.keys(params || {}).forEach(key => {
    const value = params[key];
    if (value == null || value === '') return;
    u.searchParams.set(key, String(value));
  });
  return u.toString();
}

function qishuiPcUrl(apiPath, params) {
  const target = /^https?:\/\//i.test(apiPath)
    ? apiPath
    : (QISHUI_WEB_PC_API_BASE + apiPath);
  return urlWithParams(target, params || {});
}

function qishuiSessionCookieHeader(cookieText) {
  const normalized = normalizeQishuiCookieInput(cookieText);
  const obj = qishuiCookieObject(normalized);
  if (qishuiCookieHasLogin(normalized)) return normalized;
  const sessionid = normalizeText(obj.sessionid || obj.sessionid_ss || '');
  return sessionid ? ('sessionid=' + sessionid + ';') : normalized;
}

function qishuiHeadersWithCookie(headers, cookieText) {
  const out = Object.assign({}, headers || {});
  const cookie = normalizeQishuiCookieInput(cookieText);
  if (cookie) out.Cookie = cookie;
  return out;
}

function qishuiPcStatusError(payload, fallback) {
  if (!payload || typeof payload !== 'object') return null;
  const code = Number(payload.status_code == null ? payload.error_code : payload.status_code);
  if (!isFinite(code) || code === 0) return null;
  const info = payload.status_info || {};
  const message = normalizeText(info.status_msg || payload.message || payload.status_msg || fallback || 'QISHUI_PC_API_ERROR');
  const err = new Error(message || 'QISHUI_PC_API_ERROR');
  err.code = 'QISHUI_PC_API_' + code;
  err.statusCode = code;
  err.body = payload;
  return err;
}

function qishuiSessionExpired(error) {
  return !!(error && (error.reauthRequired || error.statusCode === 401 ||
    error.code === 'QISHUI_PC_API_1000016' || error.statusCode === 1000016));
}

function qishuiSessionFailure(error, cookieText) {
  const reauthRequired = qishuiSessionExpired(error);
  const status = getQishuiStatus(cookieText);
  return Object.assign(status, qishuiUnknownMembership(error && error.message), {
    loggedIn: false,
    webSession: false,
    sessionValidated: false,
    profileReady: false,
    libraryReady: false,
    stale: !reauthRequired,
    reauthRequired,
    error: reauthRequired ? 'QISHUI_SESSION_EXPIRED' : (error && error.code || 'QISHUI_SESSION_UNVERIFIED'),
    message: reauthRequired
      ? '汽水音乐登录状态已失效，请重新扫码登录。'
      : '汽水音乐暂时无法验证登录状态，请稍后重试。',
    capabilities: Object.assign({}, status.capabilities, {
      playableUrl: false, userPlaylists: false, playlistTracks: false, webSession: false,
      feedSongTab: status.tokenConfigured,
    }),
  });
}

function qishuiTokenFile() {
  return process.env.QISHUI_TOKEN_FILE || DEFAULT_QISHUI_TOKEN_FILE;
}

function normalizeQishuiToken(value) {
  let token = String(value || '').trim();
  token = token.replace(/^bearer\s+/i, '').trim();
  const headerMatch = token.match(/(?:access-token|access_token)\s*[:=]\s*([^;\s]+)/i);
  if (headerMatch) token = headerMatch[1].trim();
  return token;
}

const QISHUI_COOKIE_ATTRIBUTE_NAMES = new Set(['path', 'domain', 'expires', 'max-age', 'samesite', 'secure', 'httponly']);

function collectQishuiCookiePair(picked, key, value) {
  key = String(key || '').trim();
  if (!key || QISHUI_COOKIE_ATTRIBUTE_NAMES.has(key.toLowerCase())) return;
  if (value === null || value === undefined) return;
  picked.set(key, String(value).trim());
}

function collectQishuiCookieInput(input, picked) {
  if (input === null || input === undefined) return;
  if (Array.isArray(input)) {
    input.forEach(item => collectQishuiCookieInput(item, picked));
    return;
  }
  if (typeof input === 'object') {
    if (input.name && Object.prototype.hasOwnProperty.call(input, 'value')) {
      collectQishuiCookiePair(picked, input.name, input.value);
      return;
    }
    Object.keys(input).forEach(key => {
      const value = input[key];
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) {
        collectQishuiCookiePair(picked, key, value.value);
      } else if (typeof value !== 'object') {
        collectQishuiCookiePair(picked, key, value);
      }
    });
    return;
  }
  String(input).split(/\r?\n/).forEach(line => {
    line.split(';').forEach(part => {
      const raw = String(part || '').trim();
      const idx = raw.indexOf('=');
      if (idx <= 0) return;
      collectQishuiCookiePair(picked, raw.slice(0, idx), raw.slice(idx + 1));
    });
  });
}

function normalizeQishuiCookieInput(input) {
  const picked = new Map();
  collectQishuiCookieInput(input, picked);
  return Array.from(picked.entries())
    .filter(([key, value]) => key && value != null && String(value) !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

function qishuiCookieObject(cookieText) {
  const out = {};
  String(cookieText || '').split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = value;
  });
  return out;
}

function qishuiCookieHasLogin(cookieText) {
  return /(?:^|;\s*)(sessionid|sessionid_ss|sid_guard|sid_tt|uid_tt|uid_tt_ss)=/i.test(String(cookieText || ''));
}

function qishuiCookieFingerprint(cookieText) {
  const normalized = normalizeQishuiCookieInput(cookieText);
  return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 16);
}

function qishuiCookieUserId(cookieText) {
  const obj = qishuiCookieObject(cookieText);
  const raw = String(obj.uid_tt || obj.uid_tt_ss || obj.sessionid || obj.sessionid_ss || obj.sid_guard || '').trim();
  if (!raw) return '';
  return 'web:' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12);
}

function clearQishuiRuntimeCaches() {
  qishuiSearchCache.clear && qishuiSearchCache.clear();
  qishuiFeedCache.clear && qishuiFeedCache.clear();
  qishuiWebLibraryCache.clear && qishuiWebLibraryCache.clear();
  qishuiWebPlaylistCache.clear && qishuiWebPlaylistCache.clear();
  qishuiWebPlaylistCursorCache.clear();
  qishuiMembershipCache.clear && qishuiMembershipCache.clear();
  qishuiMembershipPositiveHistory.clear();
  qishuiTrackMetadataCache.clear && qishuiTrackMetadataCache.clear();
  qishuiPlaybackCache.clear && qishuiPlaybackCache.clear();
}

function qishuiAccessTokenInfo() {
  const envKeys = ['QISHUI_ACCESS_TOKEN', 'DOUYIN_ACCESS_TOKEN', 'DOUYIN_OPEN_ACCESS_TOKEN'];
  for (const key of envKeys) {
    const token = normalizeQishuiToken(process.env[key] || '');
    if (token) return { token, source: 'env:' + key, file: qishuiTokenFile() };
  }
  const file = qishuiTokenFile();
  try {
    if (fs.existsSync(file)) {
      const token = normalizeQishuiToken(fs.readFileSync(file, 'utf8'));
      if (token) return { token, source: 'file', file };
    }
  } catch (_) {}
  return { token: '', source: '', file };
}

function qishuiAccessToken() {
  return qishuiAccessTokenInfo().token;
}

function saveQishuiAccessToken(value) {
  const token = normalizeQishuiToken(value);
  if (!token || token.length < 10) {
    const err = new Error('INVALID_QISHUI_TOKEN');
    err.code = 'INVALID_QISHUI_TOKEN';
    throw err;
  }
  const file = qishuiTokenFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, token, 'utf8');
  clearQishuiRuntimeCaches();
  return { ...getQishuiStatus(), saved: true };
}

function clearQishuiAccessToken() {
  const file = qishuiTokenFile();
  try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
  clearQishuiRuntimeCaches();
  return { ...getQishuiStatus(), ok: true };
}

async function exchangeQishuiOAuthCode(code) {
  code = normalizeText(code);
  if (!code) {
    const err = new Error('QISHUI_OAUTH_CODE_REQUIRED');
    err.code = 'QISHUI_OAUTH_CODE_REQUIRED';
    throw err;
  }
  const config = getQishuiOAuthConfig();
  if (!config.configured) throw qishuiOAuthConfigError(config);
  const body = new URLSearchParams();
  body.set('client_key', config.clientKey);
  body.set('client_secret', config.clientSecret);
  body.set('code', code);
  body.set('grant_type', 'authorization_code');
  const bodyText = body.toString();
  const json = await requestJson(config.tokenUrl, {
    method: 'POST',
    timeoutMs: 10000,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(bodyText),
      'User-Agent': QISHUI_UA,
    },
  }, bodyText);
  const data = (json && json.data) || json || {};
  const errCode = Number(data.error_code || data.err_code || json.error_code || json.err_code || 0);
  if (errCode) {
    const err = new Error(String(data.description || data.message || json.description || json.message || 'QISHUI_OAUTH_TOKEN_ERROR'));
    err.code = errCode;
    err.body = json;
    throw err;
  }
  const token = normalizeQishuiToken(data.access_token || json.access_token || '');
  if (!token) {
    const err = new Error('QISHUI_OAUTH_TOKEN_MISSING');
    err.code = 'QISHUI_OAUTH_TOKEN_MISSING';
    err.body = json;
    throw err;
  }
  const status = saveQishuiAccessToken(token);
  return {
    ...status,
    oauth: true,
    openId: data.open_id || data.openid || '',
    scope: data.scope || status.scope,
    expiresIn: data.expires_in || 0,
    refreshExpiresIn: data.refresh_expires_in || 0,
  };
}

function qishuiRestriction(category, message, action, extra) {
  return {
    provider: 'qishui',
    category,
    action: action || '',
    message,
    ...(extra || {}),
  };
}

function qishuiUnavailable(message, category, extra) {
  const restriction = qishuiRestriction(
    category || 'provider_limited',
    message || '汽水音乐开放平台当前没有公开可交给播放器直连的音频 URL，已按匹配源处理。',
    'switch_source',
    { playbackMode: 'recommend-match', scope: QISHUI_SCOPE }
  );
  return Object.assign({
    provider: 'qishui',
    playbackMode: 'recommend-match',
    url: '',
    playable: false,
    trial: false,
    loggedIn: !!qishuiAccessToken(),
    playbackKeyReady: false,
    restriction,
    reason: restriction.category,
    message: restriction.message,
  }, extra || {});
}

function getQishuiStatus(cookieText) {
  const tokenInfo = qishuiAccessTokenInfo();
  const tokenConfigured = !!tokenInfo.token;
  const cookie = normalizeQishuiCookieInput(cookieText);
  const webSession = qishuiCookieHasLogin(cookie);
  const configured = tokenConfigured || webSession;
  const oauthConfig = getQishuiOAuthConfig();
  return {
    provider: 'qishui',
    label: '汽水音乐',
    short: 'QS',
    configured,
    tokenConfigured,
    webSession,
    cookieReady: webSession,
    // Only an authenticated Passport Web session is an account login.
    // A legacy OpenAPI token may still power catalogue/recommendation calls,
    // but must never bypass the official QR login or impersonate a user.
    loggedIn: webSession,
    playbackMode: webSession ? 'direct-url' : 'recommend-match',
    scope: QISHUI_SCOPE,
    userId: webSession ? qishuiCookieUserId(cookie) : '',
    nickname: webSession ? '汽水音乐账号' : '',
    vipType: 0,
    vipLevel: 'none',
    isVip: false,
    isSvip: false,
    vipLabel: '无VIP',
    membershipKnown: false,
    tokenFile: tokenInfo.file,
    tokenSource: tokenInfo.source,
    oauthConfigured: oauthConfig.configured,
    oauthMissing: oauthConfig.missing,
    oauthScope: oauthConfig.scope,
    oauthConfigSource: oauthConfig.configSource,
    // Legacy quick-check guard: search: configured || QISHUI_PUBLIC_ENABLED.
    capabilities: {
      search: tokenConfigured || webSession || QISHUI_PUBLIC_ENABLED,
      relatedMedia: tokenConfigured,
      feedSongTab: tokenConfigured || webSession,
      lyric: true,
      playableUrl: webSession,
      login: true,
      webOAuth: oauthConfig.configured,
      userPlaylists: configured,
      playlistTracks: configured,
      webSession,
    },
    message: webSession
      ? '汽水音乐官方扫码登录已连接，可同步歌单与我的喜欢，并按账号权益播放。'
      : tokenConfigured
      ? '已有旧版开放平台目录授权；账号功能仍需完成官方扫码登录。'
      : (QISHUI_PUBLIC_ENABLED
        ? '请使用抖音 App 扫描 Mineradio 中的汽水官方二维码；未登录时仅保留公开搜索匹配。'
        : '请使用抖音 App 扫描 Mineradio 中的汽水官方二维码完成登录。'),
  };
}

function qishuiUrl(apiPath) {
  return QISHUI_API_BASE + apiPath;
}

async function qishuiPost(apiPath, payload) {
  const token = qishuiAccessToken();
  if (!token) {
    const err = new Error('QISHUI_TOKEN_REQUIRED');
    err.code = 'QISHUI_TOKEN_REQUIRED';
    throw err;
  }
  const body = JSON.stringify(payload || {});
  const json = await requestJson(qishuiUrl(apiPath), {
    method: 'POST',
    timeoutMs: 7000,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent': QISHUI_UA,
      'access-token': token,
    },
  }, body);
  const errCode = Number(json && json.data && (json.data.error_code || json.data.err_code || json.data.code) || json && (json.error_code || json.err_code || json.code) || 0);
  if (errCode) {
    const err = new Error(String((json && json.data && (json.data.description || json.data.message)) || json.description || json.message || 'QISHUI_API_ERROR'));
    err.code = errCode;
    err.body = json;
    throw err;
  }
  return json;
}

function normalizeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function normalizeLyricBody(value) {
  return String(value == null ? '' : value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function qishuiLyricTimestamp(ms) {
  ms = Math.max(0, Number(ms) || 0);
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centiseconds = Math.floor((ms % 1000) / 10);
  return '[' +
    String(minutes).padStart(2, '0') + ':' +
    String(seconds).padStart(2, '0') + '.' +
    String(centiseconds).padStart(2, '0') +
    ']';
}

function qishuiConvertLyric(value) {
  const input = normalizeLyricBody(value);
  if (!input) return { lyric: '', yrc: '' };
  const lrcLines = [];
  const yrcLines = [];
  let converted = false;
  input.split('\n').forEach(rawLine => {
    const line = String(rawLine || '').trim();
    const timed = line.match(/^\[(\d+),(\d+)\](.*)$/);
    if (!timed) return;
    const lineStart = Math.max(0, Number(timed[1]) || 0);
    const lineDuration = Math.max(0, Number(timed[2]) || 0);
    const body = timed[3] || '';
    const wordPattern = /([<(])(\d+),(\d+),(\d+)[>)]([^<(]*)/g;
    let wordMatch;
    let text = '';
    let yrcBody = '';
    while ((wordMatch = wordPattern.exec(body))) {
      const rawStart = Math.max(0, Number(wordMatch[2]) || 0);
      const wordDuration = Math.max(0, Number(wordMatch[3]) || 0);
      const wordText = String(wordMatch[5] || '');
      if (!wordText) continue;
      const absoluteStart = wordMatch[1] === '<'
        ? lineStart + rawStart
        : (rawStart >= Math.max(0, lineStart - 500) ? rawStart : lineStart + rawStart);
      text += wordText;
      yrcBody += '(' + absoluteStart + ',' + wordDuration + ',' + (Number(wordMatch[4]) || 0) + ')' + wordText;
    }
    if (!text) text = body.replace(/[<(]\d+,\d+,\d+[>)]/g, '');
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) return;
    converted = true;
    lrcLines.push(qishuiLyricTimestamp(lineStart) + text);
    yrcLines.push('[' + lineStart + ',' + lineDuration + ']' + (yrcBody || text));
  });
  if (!converted) return { lyric: input, yrc: '' };
  return {
    lyric: lrcLines.join('\n'),
    yrc: yrcLines.join('\n'),
  };
}

function firstUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(firstUrl).find(Boolean) || '';
  if (typeof value === 'object') {
    return firstUrl(value.url_list || value.urls || value.url || value.uri || value.main_url || value.cover_url || value.download_url);
  }
  return '';
}

function qishuiImageUrl(value, suffix) {
  if (!value) return '';
  if (typeof value === 'string') {
    const text = normalizeText(value);
    if (!/^https?:\/\//i.test(text)) return '';
    return suffix && !text.includes('~') ? text + suffix : text;
  }
  if (Array.isArray(value)) return value.map(item => qishuiImageUrl(item, suffix)).find(Boolean) || '';
  if (typeof value !== 'object') return '';
  const cover = normalizeText(firstUrl(value.urls || value.url_list || value.urlList || value.url || value.main_url || value.cover_url || value.image_url || ''));
  const uri = normalizeText(value.uri || value.url_key || value.image_uri || value.cover_uri || '');
  let out = cover;
  if (out && uri && !out.includes(uri)) out += uri;
  if (!out && /^https?:\/\//i.test(uri)) out = uri;
  if (!/^https?:\/\//i.test(out)) return '';
  return suffix && !out.includes('~') ? out + suffix : out;
}

function qishuiFirstImageUrl(suffix) {
  for (let i = 1; i < arguments.length; i++) {
    const url = qishuiImageUrl(arguments[i], suffix);
    if (url) return url;
  }
  return '';
}

function pickObject() {
  for (let i = 0; i < arguments.length; i++) {
    const value = arguments[i];
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  }
  return {};
}

function qishuiProfileFromUser(user) {
  user = user && typeof user === 'object' ? user : {};
  const nickname = normalizeText(
    user.nickname ||
    user.nick_name ||
    user.nickName ||
    user.display_name ||
    user.displayName ||
    user.name ||
    user.public_name ||
    user.publicName ||
    user.douyin_id ||
    ''
  );
  const userId = normalizeText(
    user.id ||
    user.user_id ||
    user.userId ||
    user.uid ||
    user.sec_uid ||
    user.secUid ||
    user.open_id ||
    ''
  );
  const avatar = qishuiFirstImageUrl('~c5_300x300.jpg',
    user.larger_avatar_url,
    user.medium_avatar_url,
    user.avatar_url,
    user.avatarUrl,
    user.avatar,
    user.user_avatar,
    user.pic,
    user.icon
  );
  return {
    userId,
    nickname,
    avatar,
    douyinId: normalizeText(user.douyin_id || user.unique_id || user.short_id || ''),
    profileReady: !!(userId || nickname || avatar),
  };
}

const QISHUI_VIP_NUMBER_KEYS = new Set([
  'viptype', 'viplevel', 'membertype', 'memberlevel', 'musicviptype', 'musicviplevel',
]);
const QISHUI_SVIP_NUMBER_KEYS = new Set([
  'sviptype', 'sviplevel', 'superviptype', 'superviplevel',
]);
const QISHUI_VIP_FLAG_KEYS = new Set([
  'isvip', 'ismember', 'hasvip', 'hasmembership', 'vipactive', 'vipenabled',
]);
const QISHUI_SVIP_FLAG_KEYS = new Set([
  'issvip', 'issupervip', 'hassvip', 'hassupervip', 'svipactive', 'svipenabled',
]);
const QISHUI_MEMBERSHIP_LABEL_KEYS = new Set([
  'viplevelname', 'vipname', 'memberlevelname', 'membername', 'membershiplevel', 'membershiptype',
]);
const QISHUI_VIP_CONTAINER_KEYS = new Set([
  'vipinfo', 'vipdetail', 'vipbenefit', 'vippackage', 'memberinfo', 'memberdetail',
  'memberbenefit', 'memberpackage', 'membershipinfo', 'membershipdetail',
]);
const QISHUI_SVIP_CONTAINER_KEYS = new Set([
  'svipinfo', 'svipdetail', 'svipbenefit', 'svippackage', 'supervipinfo',
  'supervipdetail', 'supervipbenefit', 'supervippackage',
]);
const QISHUI_MEMBERSHIP_STATUS_KEYS = new Set([
  'status', 'state', 'active', 'valid', 'enabled', 'isactive', 'isvalid', 'isenabled',
]);
const QISHUI_MEMBERSHIP_GENERIC_EXPIRY_KEYS = new Set([
  'expiretime', 'expiresat', 'expirationtime', 'expiredat', 'endtime', 'validuntil',
]);
const QISHUI_VIP_EXPIRY_KEYS = new Set([
  'vipexpiretime', 'vipexpiresat', 'vipexpiredat', 'vipendtime',
  'memberexpiretime', 'memberexpiresat', 'memberexpiredat', 'memberendtime',
]);
const QISHUI_SVIP_EXPIRY_KEYS = new Set([
  'svipexpiretime', 'svipexpiresat', 'svipexpiredat', 'svipendtime',
]);

function qishuiNormalizedFieldKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function qishuiExplicitPositive(value) {
  if (value === true) return true;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text) > 0;
  return /^(true|yes|active|valid|enabled|opened|vip|svip|premium|member|会员|已开通|有效)$/.test(text);
}

function qishuiExplicitNegative(value) {
  if (value === false || value === null) return true;
  if (typeof value === 'number') return Number.isFinite(value) && value <= 0;
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text) <= 0;
  return /^(false|no|inactive|invalid|disabled|closed|expired|none|free|normal|ordinary|非会员|普通用户|未开通|无vip|已过期|过期)$/.test(text);
}

function qishuiMembershipLevelValue(value) {
  const text = normalizeText(value).toLowerCase().replace(/[\s_-]+/g, '');
  if (/^(svip|supervip|超级会员|超级vip|豪华会员)$/.test(text)) return 'svip';
  if (/^(vip|premium|member|会员|普通会员)$/.test(text)) return 'vip';
  if (/^(none|free|normal|ordinary|novip|非会员|普通用户|未开通|无vip|已过期|过期)$/.test(text)) return 'none';
  return '';
}

function qishuiMembershipExpiryMillis(value) {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) {
    return number < 100000000000 ? number * 1000 : number;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function qishuiMembershipObjectState(value, level) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { known: false, active: null, expiresAt: 0 };
  }
  let known = false;
  let statusPositive = false;
  let statusNegative = false;
  let genericExpiryKnown = false;
  let genericExpiryExpired = false;
  let genericFutureExpiry = 0;
  let levelExpiryKnown = false;
  let levelExpiryExpired = false;
  let levelFutureExpiry = 0;
  const levelExpiryKeys = level === 'svip'
    ? QISHUI_SVIP_EXPIRY_KEYS
    : (level === 'vip' ? QISHUI_VIP_EXPIRY_KEYS : null);
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = qishuiNormalizedFieldKey(key);
    const isGenericExpiry = QISHUI_MEMBERSHIP_GENERIC_EXPIRY_KEYS.has(normalizedKey);
    const isLevelExpiry = levelExpiryKeys
      ? levelExpiryKeys.has(normalizedKey)
      : (QISHUI_VIP_EXPIRY_KEYS.has(normalizedKey) || QISHUI_SVIP_EXPIRY_KEYS.has(normalizedKey));
    if (isGenericExpiry || isLevelExpiry) {
      const expiresAt = qishuiMembershipExpiryMillis(item);
      const isKnownExpiry = expiresAt > 0 || (
        item !== '' &&
        item !== null &&
        item !== undefined &&
        Number.isFinite(Number(item)) &&
        Number(item) <= 0
      );
      if (!isKnownExpiry) continue;
      known = true;
      if (isLevelExpiry) {
        levelExpiryKnown = true;
        if (expiresAt > Date.now()) {
          levelFutureExpiry = Math.max(levelFutureExpiry, expiresAt);
        } else {
          levelExpiryExpired = true;
        }
      } else {
        genericExpiryKnown = true;
        if (expiresAt > Date.now()) {
          genericFutureExpiry = Math.max(genericFutureExpiry, expiresAt);
        } else {
          genericExpiryExpired = true;
        }
      }
      continue;
    }
    if (!QISHUI_MEMBERSHIP_STATUS_KEYS.has(normalizedKey)) continue;
    if (qishuiExplicitNegative(item)) {
      known = true;
      statusNegative = true;
    } else if (qishuiExplicitPositive(item)) {
      known = true;
      statusPositive = true;
    }
  }
  // Tier-specific expiry is authoritative for that tier. Generic expiry is a
  // fallback only when the object has no expiry for the requested tier. This
  // keeps an expired/zero SVIP field from cancelling a valid VIP, and vice
  // versa, when both tiers are returned in the same official response object.
  const expiryKnown = levelExpiryKnown || genericExpiryKnown;
  const expiryExpired = levelExpiryKnown ? levelExpiryExpired : genericExpiryExpired;
  const futureExpiry = levelExpiryKnown ? levelFutureExpiry : genericFutureExpiry;
  const active = statusNegative || expiryExpired
    ? false
    : (futureExpiry > 0 || (!expiryKnown && statusPositive) ? true : (expiryKnown ? false : null));
  return {
    known,
    active,
    expiresAt: active === true ? futureExpiry : 0,
  };
}

function qishuiMembershipFromData(value) {
  value = value && typeof value === 'object' ? value : {};
  let membershipKnown = false;
  let isVip = false;
  let isSvip = false;
  let vipType = 0;
  let svipType = 0;
  let vipExpiresAt = 0;
  let svipExpiresAt = 0;
  let visited = 0;

  const rememberExpiry = (level, expiresAt) => {
    expiresAt = Number(expiresAt) || 0;
    if (expiresAt <= Date.now()) return;
    if (level === 'svip') {
      if (!svipExpiresAt || expiresAt < svipExpiresAt) svipExpiresAt = expiresAt;
      return;
    }
    if (level === 'vip' && (!vipExpiresAt || expiresAt < vipExpiresAt)) vipExpiresAt = expiresAt;
  };

  const applyLevel = (level, numericValue, active, expiresAt) => {
    if (active === false || !level) return;
    if (level === 'svip') {
      isSvip = true;
      isVip = true;
      svipType = Math.max(svipType, Number(numericValue) || 1);
      rememberExpiry('svip', expiresAt);
      return;
    }
    if (level === 'vip') {
      isVip = true;
      vipType = Math.max(vipType, Number(numericValue) || 1);
      rememberExpiry('vip', expiresAt);
    }
  };

  const visit = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 6 || visited > 600) return;
    visited += 1;
    if (Array.isArray(node)) {
      node.slice(0, 120).forEach(item => visit(item, depth + 1));
      return;
    }
    const vipObjectState = qishuiMembershipObjectState(node, 'vip');
    const svipObjectState = qishuiMembershipObjectState(node, 'svip');
    for (const [key, item] of Object.entries(node).slice(0, 160)) {
      const normalizedKey = qishuiNormalizedFieldKey(key);
      if (QISHUI_SVIP_NUMBER_KEYS.has(normalizedKey)) {
        membershipKnown = true;
        const number = Number(item);
        if (Number.isFinite(number) && number > 0) applyLevel('svip', number, svipObjectState.active, svipObjectState.expiresAt);
      } else if (QISHUI_VIP_NUMBER_KEYS.has(normalizedKey)) {
        membershipKnown = true;
        const number = Number(item);
        if (Number.isFinite(number) && number > 0) applyLevel('vip', number, vipObjectState.active, vipObjectState.expiresAt);
      } else if (QISHUI_SVIP_FLAG_KEYS.has(normalizedKey)) {
        membershipKnown = true;
        if (qishuiExplicitPositive(item)) applyLevel('svip', 1, svipObjectState.active, svipObjectState.expiresAt);
      } else if (QISHUI_VIP_FLAG_KEYS.has(normalizedKey)) {
        membershipKnown = true;
        if (qishuiExplicitPositive(item)) applyLevel('vip', 1, vipObjectState.active, vipObjectState.expiresAt);
      } else if (QISHUI_MEMBERSHIP_LABEL_KEYS.has(normalizedKey)) {
        membershipKnown = true;
        const level = qishuiMembershipLevelValue(item);
        const state = level === 'svip' ? svipObjectState : vipObjectState;
        applyLevel(level, 1, state.active, state.expiresAt);
      } else if (QISHUI_SVIP_CONTAINER_KEYS.has(normalizedKey) || QISHUI_VIP_CONTAINER_KEYS.has(normalizedKey)) {
        membershipKnown = true;
        const level = QISHUI_SVIP_CONTAINER_KEYS.has(normalizedKey) ? 'svip' : 'vip';
        const state = qishuiMembershipObjectState(item, level);
        if (state.active === true) {
          applyLevel(
            level,
            1,
            true,
            state.expiresAt
          );
        }
      }
      if (item && typeof item === 'object') visit(item, depth + 1);
    }
  };

  visit(value, 0);
  if (isSvip) isVip = true;
  const vipLevel = isSvip ? 'svip' : (isVip ? 'vip' : 'none');
  const activeExpiries = [vipExpiresAt, svipExpiresAt].filter(item => item > Date.now());
  return {
    membershipKnown,
    vipType: isSvip ? svipType : vipType,
    vipLevel,
    isVip,
    isSvip,
    vipLabel: vipLevel === 'svip' ? 'SVIP' : (vipLevel === 'vip' ? 'VIP' : '无VIP'),
    expiresAt: activeExpiries.length ? Math.min(...activeExpiries) : 0,
  };
}

function qishuiPlaybackMembershipFromPayload(payload) {
  const data = (payload && payload.data) || payload || {};
  const trustedCandidates = [
    data.user_membership,
    data.userMembership,
    data.account_membership,
    data.accountMembership,
    data.user && data.user.membership,
    data.account && data.account.membership,
    data.me && data.me.membership,
  ].filter(item => item && typeof item === 'object');
  if (trustedCandidates.length) {
    const trusted = qishuiMembershipFromData({ membership_sources: trustedCandidates });
    if (trusted.membershipKnown) return trusted;
  }
  const ambiguousCandidates = [
    data.membership,
    data.membership_info,
    data.membershipInfo,
  ].filter(item => item && typeof item === 'object');
  // Generic membership blocks are ambiguous: track_v2 may use them for the
  // media item's own restriction instead of the current account. Neither a
  // positive nor a negative value here may grant or revoke account rights.
  // Keep the read so future schema diagnostics can distinguish "absent" from
  // "present but untrusted" without changing the authorization boundary.
  void ambiguousCandidates;
  return {
    membershipKnown: false,
    vipType: 0,
    vipLevel: 'none',
    isVip: false,
    isSvip: false,
    vipLabel: '无VIP',
    expiresAt: 0,
  };
}

function qishuiProfileFromMeData(meData) {
  const data = (meData && meData.data) || meData || {};
  const user = pickObject(data.my_info, data.myInfo, data.user, data.user_info, data.userInfo, data.account, data.me, data);
  const profile = qishuiProfileFromUser(user);
  if (!profile.userId) {
    profile.userId = normalizeText(data.user_id || data.userId || data.uid || data.id || '');
  }
  if (!profile.nickname) {
    profile.nickname = normalizeText(data.nickname || data.nick_name || data.name || data.douyin_id || '');
  }
  if (!profile.avatar) {
    profile.avatar = qishuiFirstImageUrl('~c5_300x300.jpg',
      data.larger_avatar_url,
      data.medium_avatar_url,
      data.avatar_url,
      data.avatar,
      data.pic
    );
  }
  Object.assign(profile, qishuiMembershipFromData(data));
  profile.profileReady = !!(profile.userId || profile.nickname || profile.avatar);
  return profile;
}

function pickArray() {
  for (let i = 0; i < arguments.length; i++) {
    const value = arguments[i];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function qishuiObjectString(obj, keys) {
  obj = obj && typeof obj === 'object' ? obj : {};
  for (const key of keys || []) {
    const value = obj[key];
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      const text = value.map(item => normalizeText(item)).find(Boolean);
      if (text) return text;
      continue;
    }
    if (typeof value !== 'object') {
      const text = normalizeText(value);
      if (text) return text;
    }
  }
  return '';
}

function qishuiObjectNumber(obj, keys) {
  const text = qishuiObjectString(obj, keys);
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function qishuiNormalizeDurationSeconds(value) {
  const num = Number(value) || 0;
  if (!num) return 0;
  return num > 1000 ? Math.round(num / 1000) : Math.round(num);
}

function qishuiNormalizeBitrateKbps(value) {
  const num = Number(value) || 0;
  if (!num) return 0;
  return num > 1000 ? Math.round(num / 1000) : Math.round(num);
}

function qishuiBitrateForUi(value) {
  const kbps = qishuiNormalizeBitrateKbps(value);
  return kbps > 0 ? kbps * 1000 : 0;
}

function qishuiQualityRank(quality, format, bitrate) {
  const q = normalizeText(quality).toLowerCase().replace(/[-_\s]/g, '');
  const f = normalizeText(format).toLowerCase();
  const br = qishuiNormalizeBitrateKbps(bitrate);
  const losslessFormat = /flac|alac|wav/.test(f);
  const losslessLabel = /lossless|flac|sq|svip/.test(q);
  const hiresLabel = /hires|master/.test(q);
  if (hiresLabel && (losslessFormat || br >= 900)) return 110;
  if (losslessLabel || losslessFormat || br >= 900) return 100;
  if (hiresLabel) return 90;
  if (/atmos|dolby|spatial/.test(q)) return 88;
  if (/highest|excellent|superhigh|hq/.test(q)) return 80;
  if (/higher|high|320/.test(q) || br >= 320) return 70;
  if (/standard|medium|normal|128/.test(q) || br >= 128) return 50;
  if (/low|preview/.test(q)) return 10;
  return br > 0 ? 20 : 0;
}

function qishuiPlaybackLevel(quality, format, bitrate) {
  const rank = qishuiQualityRank(quality, format, bitrate);
  if (rank >= 100) return 'lossless';
  if (rank >= 80) return 'hires';
  if (rank >= 65) return 'exhigh';
  return 'standard';
}

function qishuiBetterStreamCandidate(a, b) {
  if (!b) return true;
  const ad = qishuiNormalizeDurationSeconds(a && a.duration);
  const bd = qishuiNormalizeDurationSeconds(b && b.duration);
  if (ad > 0 || bd > 0) {
    if (ad > bd + 1) return true;
    if (bd > ad + 1) return false;
  }
  const ar = qishuiQualityRank(a && a.quality, a && a.format, a && a.bitrate);
  const br = qishuiQualityRank(b && b.quality, b && b.format, b && b.bitrate);
  if (ar !== br) return ar > br;
  const ab = qishuiNormalizeBitrateKbps(a && a.bitrate);
  const bb = qishuiNormalizeBitrateKbps(b && b.bitrate);
  if (ab !== bb) return ab > bb;
  return (Number(a && a.size) || 0) > (Number(b && b.size) || 0);
}

function qishuiBestStreamCandidate(candidates) {
  let best = null;
  (candidates || []).forEach(item => {
    if (!item || !item.url) return;
    if (qishuiBetterStreamCandidate(item, best)) best = item;
  });
  return best;
}

const QISHUI_TRACK_VIP_KEYS = new Set([
  'onlyvipplayable', 'viprequired', 'needvip', 'isvip', 'isviponly', 'viponly', 'onlyvip',
  'onlymemberplayable', 'memberrequired', 'needmember', 'payplay',
]);
const QISHUI_TRACK_SVIP_KEYS = new Set([
  'onlysvipplayable', 'sviprequired', 'needsvip', 'issvip', 'issviponly', 'sviponly', 'onlysvip',
  'onlysupervipplayable', 'superviprequired', 'needsupervip', 'issuperviponly', 'superviponly',
]);
const QISHUI_TRACK_ACCOUNT_CONTAINER_KEYS = new Set([
  'membership', 'membershipinfo', 'usermembership', 'accountmembership',
  'account', 'userinfo', 'userprofile', 'me',
]);

function qishuiTrackPlaybackRestriction(value) {
  let vipRequired = false;
  let svipRequired = false;
  let membershipHintKnown = false;
  let visited = 0;
  const evidence = [];
  const visit = (node, depth, pathKeys) => {
    if (!node || typeof node !== 'object' || depth > 7 || visited > 800) return;
    visited += 1;
    if (Array.isArray(node)) {
      node.slice(0, 160).forEach(item => visit(item, depth + 1, pathKeys));
      return;
    }
    for (const [key, item] of Object.entries(node).slice(0, 180)) {
      const normalizedKey = qishuiNormalizedFieldKey(key);
      const nextPath = pathKeys.concat(normalizedKey);
      if (QISHUI_TRACK_ACCOUNT_CONTAINER_KEYS.has(normalizedKey)) continue;
      if (QISHUI_TRACK_SVIP_KEYS.has(normalizedKey)) {
        membershipHintKnown = true;
        if (qishuiExplicitPositive(item)) {
          svipRequired = true;
          vipRequired = true;
          evidence.push(nextPath.join('.'));
        }
      } else if (QISHUI_TRACK_VIP_KEYS.has(normalizedKey)) {
        membershipHintKnown = true;
        if (qishuiExplicitPositive(item)) {
          vipRequired = true;
          evidence.push(nextPath.join('.'));
        }
      } else if (normalizedKey === 'fee') {
        membershipHintKnown = true;
        if (Number(item) === 1) {
          vipRequired = true;
          evidence.push(nextPath.join('.'));
        }
      } else if (normalizedKey === 'privilege') {
        membershipHintKnown = true;
        if (Number(item) >= 9) {
          vipRequired = true;
          evidence.push(nextPath.join('.'));
        }
      }
      if (item && typeof item === 'object') visit(item, depth + 1, nextPath);
    }
  };
  visit(value, 0, []);
  return {
    vipRequired,
    svipRequired,
    requiredTier: svipRequired ? 'svip' : (vipRequired ? 'vip' : 'free'),
    membershipHintKnown,
    evidence,
  };
}

function qishuiTrackRequiresVip(value) {
  return qishuiTrackPlaybackRestriction(value).vipRequired;
}

const QISHUI_TIER_RANK = Object.freeze({ free: 0, vip: 1, svip: 2 });

function qishuiNormalizeRequiredTier(value) {
  const text = normalizeText(value).toLowerCase().replace(/[-_\s]/g, '');
  if (/^(svip|supervip|hires|highres|highresolution|master|atmos|dolby|spatial)$/.test(text)) return 'svip';
  if (/^(vip|member|premium|lossless|sq|flac|exhigh|high|higher|highest|hq|320)$/.test(text)) return 'vip';
  return 'free';
}

function qishuiHigherRequiredTier(a, b) {
  a = qishuiNormalizeRequiredTier(a);
  b = qishuiNormalizeRequiredTier(b);
  return QISHUI_TIER_RANK[b] > QISHUI_TIER_RANK[a] ? b : a;
}

function qishuiStreamRequiredTier(stream) {
  stream = stream && typeof stream === 'object' ? stream : {};
  let requiredTier = qishuiNormalizeRequiredTier(
    stream.requiredTier || stream.required_tier || stream.membershipTier || stream.membership_tier || ''
  );
  const quality = normalizeText(stream.quality || stream.definition || '').toLowerCase().replace(/[-_\s]/g, '');
  const format = normalizeText(stream.format || '').toLowerCase();
  const bitrate = qishuiNormalizeBitrateKbps(stream.bitrate);
  if (/svip|supervip|hires|highres|highresolution|master|atmos|dolby|spatial/.test(quality)) {
    requiredTier = qishuiHigherRequiredTier(requiredTier, 'svip');
  } else if (
    /lossless|flac|sq/.test(quality) ||
    /flac|alac|wav/.test(format) ||
    bitrate >= 900
  ) {
    requiredTier = qishuiHigherRequiredTier(requiredTier, 'vip');
  } else if (
    /highest|excellent|superhigh|higher|high|hq|exhigh|320/.test(quality) ||
    bitrate > 192
  ) {
    requiredTier = qishuiHigherRequiredTier(requiredTier, 'vip');
  }
  return requiredTier;
}

function qishuiMembershipTier(membership) {
  if (!(membership && membership.membershipKnown)) return 'unknown';
  if (membership.isSvip) return 'svip';
  if (membership.isVip) return 'vip';
  return 'free';
}

function qishuiRequiredTierAllowed(requiredTier, membership) {
  requiredTier = qishuiNormalizeRequiredTier(requiredTier);
  if (requiredTier === 'free') return true;
  if (!(membership && membership.membershipKnown)) return false;
  if (requiredTier === 'svip') return !!membership.isSvip;
  return !!membership.isVip;
}

function qishuiStreamAllowedForMembership(stream, membership) {
  if (!stream || !stream.url) return false;
  return qishuiRequiredTierAllowed(qishuiStreamRequiredTier(stream), membership);
}

function qishuiBestStreamCandidateForMembership(candidates, membership) {
  return qishuiBestStreamCandidate((candidates || []).filter(item => qishuiStreamAllowedForMembership(item, membership)));
}

function qishuiStreamUrlFrom(value) {
  return normalizeText(qishuiObjectString(value, [
    'main_play_url', 'MainPlayUrl', 'main_url', 'MainUrl', 'url', 'URL', 'play_url', 'PlayURL',
    'playable_url', 'PlayableUrl', 'playableUrl',
  ]) || qishuiObjectString(value, [
    'backup_play_url', 'BackupPlayUrl', 'backup_url', 'BackupUrl', 'backup_url_1', 'backup_url_2', 'backup_url_3',
  ]) || firstUrl(value && (value.backup_urls || value.backupUrls || value.url_list || value.UrlList)));
}

function qishuiBitrateFromUrl(value) {
  value = normalizeText(value);
  if (!value) return 0;
  try {
    const parsed = new URL(value);
    for (const key of ['br', 'bitrate', 'bit_rate', 'real_bitrate']) {
      const bitrate = Number(parsed.searchParams.get(key)) || 0;
      if (bitrate > 0) return bitrate;
    }
  } catch (_) {}
  const match = value.match(/(?:^|[/_.-])(\d{2,4})(?:k|kbps)(?:[/_.-]|$)/i);
  return match ? Number(match[1]) || 0 : 0;
}

function qishuiBitrateFromSize(size, duration) {
  size = Number(size) || 0;
  duration = qishuiNormalizeDurationSeconds(duration);
  if (size <= 0 || duration <= 0) return 0;
  const bitrate = Math.round((size * 8) / duration);
  return bitrate >= 32000 && bitrate <= 12000000 ? bitrate : 0;
}

function qishuiStreamFromObject(value, inherited) {
  if (!value || typeof value !== 'object') return null;
  const url = qishuiStreamUrlFrom(value);
  if (!url) return null;
  inherited = inherited || {};
  const meta = pickObject(value.video_meta, value.VideoMeta, value.meta, value.Meta);
  const size = qishuiObjectNumber(value, ['size', 'Size', 'file_size', 'FileSize', 'data_size', 'DataSize']) ||
    qishuiObjectNumber(meta, ['size', 'Size', 'file_size', 'FileSize']);
  const duration = qishuiNormalizeDurationSeconds(qishuiObjectNumber(value, ['duration', 'Duration']) || inherited.duration || 0);
  const bitrate = qishuiObjectNumber(value, ['bitrate', 'Bitrate', 'real_bitrate', 'RealBitrate', 'br', 'BR', 'bit_rate', 'BitRate']) ||
    qishuiObjectNumber(meta, ['bitrate', 'Bitrate', 'real_bitrate', 'RealBitrate', 'bit_rate', 'BitRate']) ||
    qishuiBitrateFromUrl(url) ||
    qishuiBitrateFromSize(size, duration);
  const stream = {
    url,
    auth: qishuiObjectString(value, ['play_auth', 'PlayAuth', 'spade_a', 'SpadeA']) || qishuiVideoModelPlayAuth(value) || inherited.auth || '',
    size,
    format: qishuiObjectString(value, ['format', 'Format', 'vtype', 'VType', 'file_format', 'FileFormat']) ||
      qishuiObjectString(meta, ['format', 'Format', 'vtype', 'VType', 'codec_type', 'CodecType']),
    bitrate,
    quality: qishuiObjectString(value, ['quality', 'Quality', 'definition', 'Definition', 'quality_type', 'QualityType']) ||
      qishuiVideoModelQualityHint(qishuiObjectString(value, ['gear_des_key', 'GearDesKey']) || inherited.keyHint || ''),
    duration,
  };
  stream.requiredTier = qishuiStreamRequiredTier(stream);
  return stream;
}

function qishuiMaybeParseJson(value) {
  let text = typeof value === 'string' ? value.trim() : '';
  if (!text) return value;
  for (let i = 0; i < 3 && text.charAt(0) === '"'; i++) {
    try { text = JSON.parse(text); }
    catch (_) { break; }
    if (typeof text !== 'string') return text;
    text = text.trim();
  }
  try { return JSON.parse(text); }
  catch (_) { return value; }
}

function qishuiCollectVideoModelStreams(value, keyHint, inherited, out) {
  value = qishuiMaybeParseJson(value);
  inherited = inherited || {};
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach(item => qishuiCollectVideoModelStreams(item, keyHint, inherited, out));
    return;
  }
  if (typeof value !== 'object') return;
  const ownAuth = qishuiVideoModelPlayAuth(value) || inherited.auth || '';
  const ownDuration = qishuiNormalizeDurationSeconds(qishuiObjectNumber(value, ['video_duration', 'duration', 'Duration'])) || inherited.duration || 0;
  const entry = qishuiStreamFromObject(value, { auth: ownAuth, duration: ownDuration, keyHint });
  if (entry) out.push(entry);
  Object.keys(value).forEach(key => {
    qishuiCollectVideoModelStreams(value[key], key, { auth: ownAuth, duration: ownDuration }, out);
  });
}

function qishuiVideoModelPlayAuth(value) {
  value = value && typeof value === 'object' ? value : {};
  const child = pickObject(value.encrypt_info, value.EncryptInfo, value.encryptInfo);
  return qishuiObjectString(child, ['spade_a', 'SpadeA', 'spadeA', 'play_auth', 'PlayAuth']);
}

function qishuiVideoModelQualityHint(key) {
  const normalized = normalizeText(key).toLowerCase().replace(/[-_\s]/g, '');
  if (!normalized) return '';
  return ['hires', 'lossless', 'sq', 'flac', 'highest', 'higher', 'standard', 'normal'].find(token => normalized.includes(token)) || '';
}

function extractQishuiMediaList(payload) {
  const data = (payload && payload.data) || payload || {};
  const direct = pickArray(
    data.media_resources,
    data.media_list,
    data.related_media,
    data.medias,
    data.media,
    data.tracks,
    data.track_list,
    data.songs,
    data.items,
    data.list,
    data.result,
    data.song_list,
    data.recommend_media_list
  );
  if (direct.length) return direct;
  const candidates = [];
  function walk(node, depth) {
    if (!node || depth > 4) return;
    if (Array.isArray(node)) {
      const mediaLike = node.filter(item => item && typeof item === 'object' && (item.media || item.track_entity || item.entity || item.base_info || item.id || item.media_id));
      if (mediaLike.length > candidates.length) candidates.splice(0, candidates.length, ...mediaLike);
      node.forEach(item => walk(item, depth + 1));
    } else if (typeof node === 'object') {
      Object.keys(node).slice(0, 80).forEach(key => walk(node[key], depth + 1));
    }
  }
  walk(data, 0);
  return candidates;
}

function qishuiArtists(related, base, display, track, media) {
  const links = pickArray(
    related.artist_links,
    related.artists,
    base.artist_links,
    base.artists,
    display.artist_links,
    display.artists,
    track && track.artists,
    media && media.artists
  );
  const out = [];
  links.forEach(item => {
    const name = normalizeText(item && (item.name || item.display_name || item.simple_display_name || item.title || item.artist_name));
    if (!name || out.some(a => a.name === name)) return;
    out.push({
      id: String((item && (item.id || item.artist_id || item.open_id)) || ''),
      name,
      mid: String((item && (item.id || item.artist_id || item.open_id)) || ''),
    });
  });
  const fallback = normalizeText(base.artist_name || display.artist_name || related.artist_name || track && track.artist_name || media && media.artist_name);
  if (fallback && !out.length) {
    fallback.split(/\s*\/\s*|\s*,\s*|\s*&\s*/).forEach(name => {
      name = normalizeText(name);
      if (name) out.push({ id: '', name, mid: '' });
    });
  }
  return out;
}

function qishuiLyricPayload(display, track, base, id) {
  const lyricInfo = pickObject(display.lyric_info, track.lyric_info, base.lyric_info);
  const lyricEntity = pickObject(lyricInfo.lyric_entity, lyricInfo.lyric, lyricInfo.original_lyric);
  const lyric = normalizeLyricBody(lyricEntity.content || lyricInfo.content || lyricInfo.lyric || lyricInfo.lyric_text || '');
  const translations = pickArray(lyricInfo.lang_translations, lyricInfo.translations, lyricInfo.translation);
  let tlyric = '';
  for (const item of translations) {
    const entity = pickObject(item && item.lyric_entity, item);
    const text = normalizeLyricBody(entity.content || item && (item.content || item.lyric || item.lyric_text));
    if (text) {
      tlyric = text;
      break;
    }
  }
  cacheQishuiLyric(id, lyric, tlyric, 'qishui-openapi-cache');
  return { lyric, tlyric };
}

function cacheQishuiLyric(id, lyric, tlyric, source) {
  id = normalizeText(id);
  const primary = qishuiConvertLyric(lyric);
  const translated = qishuiConvertLyric(tlyric);
  lyric = primary.lyric;
  tlyric = translated.lyric;
  if (!id || (!lyric && !tlyric)) return null;
  const payload = {
    provider: 'qishui',
    lyric,
    tlyric,
    yrc: primary.yrc,
    ytlrc: translated.yrc,
    source: source || 'qishui-cache',
    cachedAt: Date.now(),
  };
  qishuiLyricCache.set(id, payload);
  return payload;
}

function mapQishuiMedia(raw, index, query, opts) {
  opts = opts || {};
  raw = raw || {};
  const entity = pickObject(raw.entity, raw.data, raw);
  const media = pickObject(entity.media, raw.media, entity);
  const wrapper = pickObject(entity.track_wrapper, media.track_wrapper, raw.track_wrapper);
  const track = pickObject(wrapper.track, media.track_entity, raw.track_entity, media.track, raw.track, media);
  const base = pickObject(track.base_info, media.base_info, raw.base_info, track);
  const display = pickObject(track.display_info, media.display_info, raw.display_info);
  const related = pickObject(track.related_info, media.related_info, raw.related_info);
  const id = normalizeText(
    base.id || track.id || media.id || raw.id || raw.media_id || raw.item_id || raw.song_id || raw.vid || ('qishui-' + index + '-' + query)
  );
  const name = normalizeText(base.name || base.title || track.name || track.title || media.name || raw.name || raw.title);
  if (!id || !name) return null;
  const artists = qishuiArtists(related, base, display, track, media);
  const artist = artists.map(a => a.name).filter(Boolean).join(' / ') || normalizeText(base.author || raw.author || '');
  const albumLink = pickObject(related.album_link, related.album, base.album, display.album, track.album, media.album);
  const album = normalizeText(albumLink.name || albumLink.title || base.album_name || display.album_name || '');
  const cover = qishuiFirstImageUrl('~c5_375x375.jpg',
    display.cover_url,
    display.url_cover,
    base.cover_url,
    base.url_cover,
    albumLink.cover_url,
    albumLink.url_cover,
    track.url_cover,
    track.cover_url,
    media.cover_url,
    media.url_cover,
    raw.cover_url,
    raw.cover,
    raw.url_cover
  );
  const durationMs = Number(base.duration_ms || base.duration || track.duration_ms || track.duration || media.duration_ms || media.duration || raw.duration || 0) || 0;
  const lyricData = qishuiLyricPayload(display, track, base, id);
  const directPlayable = !!opts.directPlayable;
  return {
    provider: 'qishui',
    source: 'qishui',
    type: 'qishui',
    id,
    providerSongId: id,
    name,
    artist,
    artists,
    album,
    cover,
    duration: qishuiNormalizeDurationSeconds(durationMs),
    popularity: Number(raw.popularity || raw.hot || raw.heat || raw.play_count || raw.playCount || related.play_count || related.playCount || 0) || 0,
    fee: track.label_info && track.label_info.only_vip_playable ? 1 : 0,
    playable: directPlayable,
    playbackMode: directPlayable ? 'direct-url' : 'recommend-match',
    recommendationSource: directPlayable ? 'qishui-pc-session' : 'qishui-openapi',
    qishuiRank: index,
    qishuiQuery: query || '',
    lyric: lyricData.lyric,
    tlyric: lyricData.tlyric,
    restriction: qishuiRestriction('provider_limited', '汽水音乐当前作为推荐/匹配源接入，播放时会自动寻找其它可播版本。', 'switch_source'),
  };
}

function qishuiWebCommonParams(extra, opts) {
  if (opts && opts.noDefaultParams) return Object.assign({}, extra || {});
  return Object.assign({}, QISHUI_WEB_DEFAULT_PARAMS, extra || {});
}

function qishuiPcAppParams(extra) {
  const now = Date.now();
  const deviceId = String(now);
  return Object.assign({
    aid: '386088',
    app_name: 'luna_pc',
    region: 'cn',
    geo_region: 'cn',
    os_region: 'cn',
    sim_region: '',
    device_id: deviceId,
    cdid: '',
    iid: String(now + 1),
    version_name: '3.3.0',
    version_code: '30030000',
    channel: 'official',
    build_mode: 'master',
    network_carrier: '',
    ac: 'wifi',
    tz_name: 'Asia/Shanghai',
    resolution: '',
    device_platform: 'windows',
    device_type: 'Windows',
    os_version: 'Windows 11',
    fp: deviceId,
  }, extra || {});
}

function qishuiWebHeaders(cookieText, opts) {
  const cookie = opts && opts.sessionOnly ? qishuiSessionCookieHeader(cookieText) : normalizeQishuiCookieInput(cookieText);
  const headers = {
    'Accept': 'application/json,text/plain,*/*',
    'Content-Type': 'application/json; charset=utf-8',
    'User-Agent': opts && opts.pcApp ? QISHUI_PC_APP_UA : QISHUI_WEB_UA,
  };
  if (opts && opts.pcApp) {
    headers['x-luna-background-type'] = 'foreground';
    headers['x-luna-is-background-req'] = '0';
    headers['x-luna-is-local-user'] = '1';
  }
  if (cookie) headers.Cookie = cookie;
  return headers;
}

async function qishuiWebRequestJson(apiPath, params, cookieText, opts) {
  opts = opts || {};
  const bases = Array.isArray(opts.bases) && opts.bases.length ? opts.bases : QISHUI_WEB_API_BASES;
  let lastErr = null;
  for (const base of bases) {
    const target = /^https?:\/\//i.test(apiPath) ? apiPath : (String(base || '').replace(/\/+$/, '') + apiPath);
    const targetUrl = urlWithParams(target, qishuiWebCommonParams(params, opts));
    try {
      const json = await requestJson(targetUrl, {
        timeoutMs: opts.timeoutMs || 8000,
        headers: qishuiWebHeaders(cookieText, opts),
      });
      const err = qishuiPcStatusError(json, 'QISHUI_WEB_REQUEST_FAILED');
      if (err) throw err;
      return json;
    } catch (err) {
      lastErr = err;
      if (err && (err.statusCode === 401 || err.statusCode === 403)) break;
    }
  }
  throw lastErr || new Error('QISHUI_WEB_REQUEST_FAILED');
}

async function fetchQishuiPlaybackMembership(cookieText) {
  const cookie = normalizeQishuiCookieInput(cookieText);
  if (!qishuiCookieHasLogin(cookie)) {
    return qishuiUnknownMembership('QISHUI_COOKIE_REQUIRED');
  }
  const cacheKey = 'membership|' + qishuiCookieFingerprint(cookie);
  return qishuiMembershipCache.wrap(cacheKey, qishuiMembershipCacheTtlMs, async () => {
    try {
      const json = await qishuiWebRequestJson('/luna/pc/me', qishuiPcAppParams(), cookie, {
        bases: [QISHUI_WEB_PC_API_BASE],
        noDefaultParams: true,
        sessionOnly: true,
        pcApp: true,
        timeoutMs: 2500,
      });
      const data = (json && json.data) || json || {};
      const profile = qishuiProfileFromMeData(data);
      return qishuiApplyMembershipObservation(cacheKey, {
        membershipKnown: !!profile.membershipKnown,
        vipType: Number(profile.vipType) || 0,
        vipLevel: profile.vipLevel || 'none',
        isVip: !!profile.isVip,
        isSvip: !!profile.isSvip,
        vipLabel: profile.vipLabel || '无VIP',
        expiresAt: Number(profile.expiresAt) || 0,
        sessionValidated: !!profile.profileReady,
        userId: profile.userId || '',
        entitlementSource: 'official-pc-me',
      });
    } catch (err) {
      if (qishuiSessionExpired(err)) {
        qishuiMembershipPositiveHistory.delete(cacheKey);
        return Object.assign(qishuiUnknownMembership(err.message), { reauthRequired: true });
      }
      return qishuiApplyMembershipObservation(
        cacheKey,
        qishuiUnknownMembership(err && err.message || 'QISHUI_MEMBERSHIP_CHECK_FAILED')
      );
    }
  });
}

function qishuiUnknownMembership(error) {
  return {
    membershipKnown: false,
    membershipStatus: 'unknown',
    reason: 'membership_unknown',
    vipType: 0,
    vipLevel: 'unknown',
    isVip: false,
    isSvip: false,
    vipLabel: '未知会员状态',
    expiresAt: 0,
    sessionValidated: false,
    error: normalizeText(error || 'QISHUI_MEMBERSHIP_UNKNOWN'),
  };
}

function qishuiApplyMembershipObservation(historyKey, membership, now) {
  historyKey = normalizeText(historyKey);
  membership = membership && typeof membership === 'object'
    ? Object.assign({}, membership)
    : qishuiUnknownMembership('QISHUI_MEMBERSHIP_UNKNOWN');
  now = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const membershipKnown = !!membership.membershipKnown;
  const expiresAt = Number(membership.expiresAt) || 0;
  const positive = membershipKnown && !!(membership.isVip || membership.isSvip);

  if (membershipKnown) {
    if (historyKey) qishuiMembershipPositiveHistory.delete(historyKey);
    if (positive && expiresAt > now && historyKey) {
      const retainedUntil = Math.min(expiresAt, now + QISHUI_MEMBERSHIP_POSITIVE_GRACE_MS);
      qishuiMembershipPositiveHistory.set(historyKey, {
        membership: Object.assign({}, membership, {
          membershipStatus: membership.isSvip ? 'svip' : 'vip',
        }),
        observedAt: now,
        expiresAt,
        retainedUntil,
      });
      while (qishuiMembershipPositiveHistory.size > 48) {
        const oldestKey = qishuiMembershipPositiveHistory.keys().next().value;
        if (!oldestKey) break;
        qishuiMembershipPositiveHistory.delete(oldestKey);
      }
    }
    return Object.assign(membership, {
      membershipStatus: positive ? (membership.isSvip ? 'svip' : 'vip') : 'free',
    });
  }

  const previous = historyKey ? qishuiMembershipPositiveHistory.get(historyKey) : null;
  if (
    previous &&
    previous.expiresAt > now &&
    previous.retainedUntil > now &&
    previous.membership &&
    previous.membership.membershipKnown
  ) {
    return Object.assign({}, previous.membership, {
      retainedOfficialPositive: true,
      retainedUntil: previous.retainedUntil,
      entitlementSource: 'recent-official-positive',
      membershipCheckError: membership.error || membership.reason || 'membership_unknown',
    });
  }
  if (previous && historyKey) qishuiMembershipPositiveHistory.delete(historyKey);
  return Object.assign(qishuiUnknownMembership(membership.error || membership.reason), membership, {
    membershipKnown: false,
    membershipStatus: 'unknown',
    reason: 'membership_unknown',
    vipType: 0,
    vipLevel: 'unknown',
    isVip: false,
    isSvip: false,
    vipLabel: '未知会员状态',
    expiresAt: 0,
  });
}

function qishuiMembershipCacheTtlMs(membership, now) {
  now = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  if (!(membership && membership.membershipKnown)) return 1;
  if (!(membership.isVip || membership.isSvip)) return QISHUI_MEMBERSHIP_POSITIVE_CACHE_MS;
  const expiresAt = Number(membership && membership.expiresAt) || 0;
  if (expiresAt <= 0) return 1;
  let remainingMs = expiresAt - now;
  const retainedUntil = Number(membership.retainedUntil) || 0;
  if (retainedUntil > 0) remainingMs = Math.min(remainingMs, retainedUntil - now);
  if (remainingMs <= 0) return 1;
  return Math.max(1, Math.min(QISHUI_MEMBERSHIP_POSITIVE_CACHE_MS, remainingMs - 250));
}

async function qishuiPcPostJson(apiPath, payload, cookieText, opts) {
  opts = opts || {};
  const cookie = normalizeQishuiCookieInput(cookieText);
  if (!qishuiCookieHasLogin(cookie)) {
    const err = new Error('QISHUI_COOKIE_REQUIRED');
    err.code = 'QISHUI_COOKIE_REQUIRED';
    throw err;
  }
  const body = JSON.stringify(payload || {});
  const json = await requestJson(qishuiPcUrl(apiPath, qishuiPcAppParams(opts.params)), {
    method: 'POST',
    timeoutMs: opts.timeoutMs || 9000,
    headers: Object.assign(qishuiWebHeaders(cookie, { sessionOnly: true, pcApp: true }), {
      'Content-Length': Buffer.byteLength(body),
      'Referer': 'https://www.qishui.com/',
    }),
  }, body);
  const statusError = qishuiPcStatusError(json, opts.errorCode || 'QISHUI_PC_WRITE_FAILED');
  if (statusError) throw statusError;
  return json;
}

function invalidateQishuiLibraryCaches() {
  qishuiWebLibraryCache.clear();
  qishuiWebPlaylistCache.clear();
  qishuiWebPlaylistCursorCache.clear();
}

function dedupeQishuiSongs(songs) {
  const seen = new Set();
  const out = [];
  (songs || []).forEach(song => {
    if (!song || !song.id) return;
    const key = String(song.providerSongId || song.id);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(song);
  });
  return out;
}

function mapQishuiMediaList(rawItems, query, opts) {
  return dedupeQishuiSongs((rawItems || []).map((item, index) => mapQishuiMedia(item, index, query, opts)).filter(Boolean));
}

function qishuiPlaylistLikeName(name) {
  const text = String(name || '');
  return /喜欢|收藏|favorite|liked/i.test(text) ||
    text.indexOf('\u559c\u6b22') >= 0 ||
    text.indexOf('\u6536\u85cf') >= 0;
}

function qishuiPlaylistPrimaryLikeName(name) {
  const text = String(name || '');
  return /favorite|liked/i.test(text) || text.indexOf('\u559c\u6b22') >= 0;
}

function qishuiPlaylistIdFromItem(item) {
  item = item || {};
  return normalizeText(
    item.playlist_id ||
    item.playlistId ||
    item.collection_id ||
    item.collectionId ||
    item.id ||
    item.item_id ||
    item.resource_id ||
    item.object_id ||
    item.server_id ||
    ''
  );
}

function qishuiPlaylistNameFromItem(item) {
  item = item || {};
  return normalizeText(
    item.title ||
    item.public_title ||
    item.publicTitle ||
    item.name ||
    item.display_title ||
    item.display_name ||
    item.playlist_name ||
    item.collection_name ||
    ''
  );
}

function qishuiPlaylistCoverFromItem(item) {
  item = item || {};
  return qishuiFirstImageUrl('~c5_300x300.jpg',
    item.cover_url,
    item.cover,
    item.cover_uri,
    item.image,
    item.image_url,
    item.url_cover,
    item.icon,
    item.avatar
  );
}

function qishuiPlaylistTrackCountFromItem(item) {
  item = item || {};
  return Number(
    item.count_tracks ||
    item.track_count ||
    item.media_count ||
    item.count ||
    item.total ||
    item.song_count ||
    0
  ) || 0;
}

function extractQishuiPlaylistCards(payload) {
  const data = (payload && payload.data) || payload || {};
  const out = [];
  const seen = new Set();
  function visit(node, depth) {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) {
      node.forEach(item => visit(item, depth + 1));
      return;
    }
    if (typeof node !== 'object') return;
    const candidates = [
      node.playlist,
      node.playlist_info,
      node.collection,
      node.collect_playlist,
      node.fav_playlist,
      node.resource,
      node,
    ].filter(item => item && typeof item === 'object' && !Array.isArray(item));
    candidates.forEach(item => {
      const id = qishuiPlaylistIdFromItem(item);
      const name = qishuiPlaylistNameFromItem(item);
      const count = qishuiPlaylistTrackCountFromItem(item);
      const type = normalizeText(item.type || item.card_type || item.resource_type || node.type || '');
      if (!id || !name) return;
      if (!count && !qishuiPlaylistLikeName(name) && !/playlist|collection|fav|songlist|歌单/i.test(type + ' ' + name)) return;
      const key = id + '|' + name;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        provider: 'qishui',
        source: 'qishui',
        type: 'playlist',
        id,
        name,
        cover: qishuiPlaylistCoverFromItem(item),
        trackCount: count,
        playCount: Number(item.play_count || item.playCount || 0) || 0,
        creator: normalizeText(item.creator_name || item.author_name || item.owner_name || item.owner && (item.owner.nickname || item.owner.public_name) || '汽水音乐'),
        subscribed: true,
        virtual: false,
        webSession: true,
        isLiked: qishuiPlaylistLikeName(name),
        playbackMode: 'recommend-match',
      });
    });
    Object.keys(node).slice(0, 80).forEach(key => visit(node[key], depth + 1));
  }
  visit(data, 0);
  return out;
}

function buildQishuiVirtualPlaylist(id, name, songs, extra) {
  songs = Array.isArray(songs) ? songs : [];
  extra = extra || {};
  return {
    provider: 'qishui',
    source: 'qishui',
    type: 'playlist',
    id,
    name,
    cover: extra.cover || songs.map(song => song && song.cover).find(Boolean) || '',
    trackCount: Number(extra.trackCount || songs.length || 0) || 0,
    playCount: Number(extra.playCount || 0) || 0,
    creator: extra.creator || '汽水音乐',
    subscribed: !!extra.subscribed,
    shelfPane: extra.shelfPane || '',
    owned: !!extra.owned,
    virtual: true,
    webSession: !!extra.webSession,
    playbackMode: 'recommend-match',
  };
}

async function fetchQishuiWebFeedSongs(cookieText, limit) {
  const cookie = normalizeQishuiCookieInput(cookieText);
  if (!qishuiCookieHasLogin(cookie)) return { provider: 'qishui', configured: false, webSession: false, songs: [], error: 'QISHUI_COOKIE_REQUIRED' };
  limit = Math.max(1, Math.min(50, Number(limit) || 8));
  const cacheKey = 'web-feed|' + qishuiCookieFingerprint(cookie) + '|' + limit;
  return qishuiFeedCache.wrap(cacheKey, 90 * 1000, async () => {
    const candidates = [
      { path: '/luna/feed/song-tab', params: { cursor: 0, cnt: limit, count: limit } },
      { path: '/luna/pc/feed/song-tab', params: { cursor: 0, cnt: limit, count: limit } },
    ];
    let lastErr = null;
    for (const item of candidates) {
      try {
        const json = await qishuiWebRequestJson(item.path, item.params, cookie, { timeoutMs: 8000 });
        const rawItems = extractQishuiMediaList(json);
        const songs = mapQishuiMediaList(rawItems, 'web-feed', { directPlayable: true }).slice(0, limit);
        if (songs.length) return { provider: 'qishui', configured: true, webSession: true, songs, rawCount: rawItems.length };
      } catch (err) {
        lastErr = err;
      }
    }
    try {
      const fallback = await fetchQishuiWebLibraryFeedFallback(cookie, limit);
      if (fallback && fallback.songs && fallback.songs.length) return fallback;
    } catch (fallbackErr) {
      lastErr = fallbackErr || lastErr;
    }
    return { provider: 'qishui', configured: true, webSession: true, songs: [], rawCount: 0, error: lastErr && lastErr.message || '' };
  });
}

async function fetchQishuiWebLibraryFeedFallback(cookieText, limit) {
  const cookie = normalizeQishuiCookieInput(cookieText);
  limit = Math.max(1, Math.min(50, Number(limit) || 8));
  const library = await fetchQishuiWebLibrary(cookie);
  let songs = dedupeQishuiSongs([]
    .concat(library.likedTracks || [])
    .concat(library.recentTracks || []));
  const detailCandidates = []
    .concat(library.likedCard ? [library.likedCard] : [])
    .concat((library.playlists || []).filter(pl => pl && pl.id));
  for (let i = 0; songs.length < limit && i < detailCandidates.length && i < 4; i += 1) {
    const pl = detailCandidates[i];
    if (!pl || !pl.id) continue;
    try {
      const detail = await fetchQishuiWebPlaylistTracks(pl.id, cookie, { limit: Math.max(limit, 12), offset: 0 });
      songs = dedupeQishuiSongs(songs.concat(detail && detail.tracks || []));
    } catch (_) {}
  }
  songs = songs.slice(0, limit);
  return {
    provider: 'qishui',
    configured: true,
    webSession: true,
    songs,
    rawCount: songs.length,
    source: 'qishui-web-library-fallback',
    fallback: true,
    error: songs.length ? '' : ((library.errors || []).join('; ') || 'QISHUI_WEB_FEED_EMPTY'),
  };
}

async function fetchQishuiWebLibrary(cookieText) {
  const cookie = normalizeQishuiCookieInput(cookieText);
  if (!qishuiCookieHasLogin(cookie)) {
    return { provider: 'qishui', loggedIn: false, webSession: false, playlists: [], likedTracks: [], recentTracks: [] };
  }
  const cacheKey = 'library|' + qishuiCookieFingerprint(cookie);
  return qishuiWebLibraryCache.wrap(cacheKey, value => value.errors && value.errors.length ? 0 : 90 * 1000, async () => {
    const playlists = [];
    const likedTracks = [];
    const recentTracks = [];
    const cardTracks = [];
    const errors = [];
    const addSongs = (target, songs) => {
      target.push(...dedupeQishuiSongs(songs || []));
    };
    const tryRead = async (label, apiPath, params, requestOpts) => {
      requestOpts = requestOpts || {};
      try {
        const json = await qishuiWebRequestJson(apiPath, params || {}, cookie, Object.assign({
          bases: [QISHUI_WEB_PC_API_BASE],
          noDefaultParams: true,
          sessionOnly: true,
          timeoutMs: 6500,
        }, requestOpts));
        if (/created|collection|collect/i.test(label)) {
          extractQishuiPlaylistCards(json).forEach(pl => {
            const primaryLike = qishuiPlaylistPrimaryLikeName(pl && pl.name);
            if (/created/i.test(label) || primaryLike) {
              pl.shelfPane = 'mine';
              pl.owned = true;
              pl.subscribed = false;
            } else {
              pl.shelfPane = 'fav';
              pl.owned = false;
              pl.subscribed = true;
            }
            playlists.push(pl);
          });
        }
        const songs = mapQishuiMediaList(extractQishuiMediaList(json), label, { directPlayable: true });
        if (/recent/i.test(label)) addSongs(recentTracks, songs);
        else if (/liked|favorite|collect/i.test(label)) addSongs(likedTracks, songs);
        else addSongs(cardTracks, songs);
        return json;
      } catch (err) {
        if (qishuiSessionExpired(err)) throw err;
        errors.push(label + ':' + (err && err.message || 'failed'));
        return null;
      }
    };

    const pcRequestOpts = { pcApp: true };
    // Identity failure must leave this cache rejected; an expired account is
    // not an empty but successfully synchronized library.
    const meJson = await qishuiWebRequestJson('/luna/pc/me', qishuiPcAppParams(), cookie, {
      bases: [QISHUI_WEB_PC_API_BASE], noDefaultParams: true,
      sessionOnly: true, pcApp: true, timeoutMs: 6500,
    });
    const meData = (meJson && meJson.data) || meJson || {};
    const profile = qishuiProfileFromMeData(meData);
    const userId = profile.userId;
    if (!userId) {
      const error = new Error('汽水账号接口未返回可验证的用户身份。');
      error.code = 'QISHUI_PROFILE_INCOMPLETE';
      throw error;
    }

    await Promise.all([
      userId
        ? tryRead('created', '/luna/pc/user/playlist', qishuiPcAppParams({
          user_id: userId,
          cursor: '',
          count: 50,
        }), pcRequestOpts)
        : Promise.resolve(null),
      tryRead('collection', '/luna/pc/me/collection/mixed', qishuiPcAppParams({
        cursor: '',
        count: 50,
      }), Object.assign({ optional: true }, pcRequestOpts)),
      tryRead('recent', '/luna/pc/me/recently-played-media', qishuiPcAppParams({
        cursor: '',
        count: 50,
      }), Object.assign({ optional: true }, pcRequestOpts)),
    ]);
    if (!userId) errors.push('me:missing-user-id');

    const uniquePlaylists = [];
    const seenPlaylists = new Set();
    playlists.forEach(pl => {
      if (!pl || !pl.id || seenPlaylists.has(pl.id)) return;
      seenPlaylists.add(pl.id);
      uniquePlaylists.push(pl);
    });

    const likedCard = uniquePlaylists.find(pl => pl && pl.isLiked && qishuiPlaylistPrimaryLikeName(pl.name)) ||
      uniquePlaylists.find(pl => pl && pl.isLiked);
    return {
      provider: 'qishui',
      loggedIn: true,
      configured: true,
      webSession: true,
      playlists: uniquePlaylists,
      likedCard,
      likedTracks: dedupeQishuiSongs(likedTracks),
      recentTracks: dedupeQishuiSongs(recentTracks),
      profile,
      libraryReady: errors.length === 0,
      errors,
    };
  });
}

async function handleQishuiStatus(cookieText) {
  const status = getQishuiStatus(cookieText);
  if (!status.webSession) return status;
  try {
    const library = await fetchQishuiWebLibrary(cookieText);
    const profile = library && library.profile || {};
    if (profile.profileReady) {
      status.userId = profile.userId || status.userId;
      status.nickname = profile.nickname || status.nickname;
      status.avatar = profile.avatar || status.avatar;
      status.douyinId = profile.douyinId || '';
      status.vipType = profile.vipType || 0;
      status.vipLevel = profile.membershipKnown ? (profile.vipLevel || 'none') : 'unknown';
      status.isVip = !!profile.isVip;
      status.isSvip = !!profile.isSvip;
      status.vipLabel = profile.membershipKnown
        ? (profile.vipLabel || (status.vipLevel === 'svip' ? 'SVIP' : (status.vipLevel === 'vip' ? 'VIP' : '无VIP')))
        : '未知会员状态';
      status.membershipKnown = !!profile.membershipKnown;
      status.profileReady = true;
    }
    status.sessionValidated = !!profile.profileReady;
    status.stale = false;
    status.reauthRequired = false;
    status.libraryReady = !!library.libraryReady;
    status.libraryErrors = library && library.errors || [];
  } catch (err) {
    return qishuiSessionFailure(err, cookieText);
  }
  return status;
}

async function fetchQishuiWebPlaylistTracks(playlistId, cookieText, opts) {
  opts = opts || {};
  const cookie = normalizeQishuiCookieInput(cookieText);
  const id = normalizeText(String(playlistId || '').replace(/^qishui:/i, ''));
  if (!qishuiCookieHasLogin(cookie) || !id) {
    return { provider: 'qishui', configured: false, webSession: false, tracks: [], total: 0, error: 'QISHUI_COOKIE_REQUIRED' };
  }
  const limit = Math.max(1, Math.min(50, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const cacheKey = 'playlist|' + qishuiCookieFingerprint(cookie) + '|' + id + '|' + limit + '|' + offset;
  return qishuiWebPlaylistCache.wrap(cacheKey, 90 * 1000, async () => {
    const targetCount = offset + limit;
    const cursorKey = qishuiCookieFingerprint(cookie) + '|' + id;
    let cursorState = qishuiWebPlaylistCursorCache.get(cursorKey);
    if (!cursorState || Date.now() - cursorState.updatedAt > 10 * 60 * 1000) {
      cursorState = { rawItems: [], cursor: '', hasMore: true, lastJson: null, updatedAt: Date.now(), promise: null };
      qishuiWebPlaylistCursorCache.set(cursorKey, cursorState);
    }
    while (cursorState.rawItems.length < targetCount && cursorState.hasMore) {
      if (!cursorState.promise) {
        cursorState.promise = qishuiWebRequestJson('/luna/pc/playlist/detail', qishuiPcAppParams({
          playlist_id: id,
          cursor: cursorState.cursor,
          count: Math.min(100, Math.max(1, targetCount - cursorState.rawItems.length)),
        }), cookie, {
          bases: [QISHUI_WEB_PC_API_BASE],
          noDefaultParams: true,
          sessionOnly: true,
          pcApp: true,
          timeoutMs: 9000,
        }).then(json => {
          cursorState.lastJson = json;
          const pageRawItems = extractQishuiMediaList(json);
          cursorState.rawItems.push(...pageRawItems);
          const pageData = (json && json.data) || json || {};
          const nextCursor = normalizeText(pageData.next_cursor || pageData.nextCursor || json && json.next_cursor || '');
          cursorState.cursor = nextCursor;
          cursorState.hasMore = !!(pageData.has_more || pageData.hasMore || json && json.has_more) && !!nextCursor;
          cursorState.updatedAt = Date.now();
          if (!pageRawItems.length) cursorState.hasMore = false;
        }).finally(() => { cursorState.promise = null; });
      }
      await cursorState.promise;
    }
    while (qishuiWebPlaylistCursorCache.size > 12) qishuiWebPlaylistCursorCache.delete(qishuiWebPlaylistCursorCache.keys().next().value);
    const allRawItems = cursorState.rawItems;
    const lastJson = cursorState.lastJson;
    const upstreamHasMore = cursorState.hasMore;
    const data = (lastJson && lastJson.data) || lastJson || {};
    const meta = pickObject(data.playlist, lastJson && lastJson.playlist, data.playlist_info, lastJson && lastJson.playlist_info);
    const playlistCover = qishuiPlaylistCoverFromItem(meta);
    const allTracks = mapQishuiMediaList(allRawItems, 'web-playlist', { directPlayable: true })
      .map(song => song && !song.cover && playlistCover ? Object.assign({}, song, { cover: playlistCover }) : song);
    const tracks = allTracks.slice(offset, offset + limit);
    const total = Number(meta.count_tracks || meta.track_count || data.total || data.count || data.total_num || allRawItems.length || allTracks.length) || allTracks.length;
    const playlist = buildQishuiVirtualPlaylist(id, qishuiPlaylistNameFromItem(meta) || '汽水歌单', tracks, {
      cover: playlistCover,
      trackCount: total,
      subscribed: true,
      webSession: true,
    });
    playlist.virtual = false;
    return {
      provider: 'qishui',
      loggedIn: true,
      configured: true,
      webSession: true,
      playlist,
      tracks,
      total,
      offset,
      limit,
      nextOffset: offset + tracks.length,
      hasMore: upstreamHasMore || offset + tracks.length < total,
      rawCount: allRawItems.length,
    };
  });
}

function mapQishuiPublicItem(raw, index, query) {
  raw = raw || {};
  const author = pickObject(raw.author_info, raw.author, raw.artist);
  const album = pickObject(raw.album_info, raw.album);
  const id = normalizeText(raw.item_id || raw.id || raw.song_id || raw.music_id || ('qishui-public-' + index + '-' + query));
  const name = normalizeText(raw.title || raw.name || raw.song_name);
  if (!id || !name) return null;
  const artistName = normalizeText(author.name || raw.author_name || raw.artist_name || raw.singer || '');
  const lyricInfo = pickObject(raw.lyric_info, raw.lyric);
  const lyric = normalizeLyricBody(lyricInfo.lyric_text || lyricInfo.content || lyricInfo.lyric || raw.lyric_text || '');
  cacheQishuiLyric(id, lyric, '', 'qishui-public-search-cache');
  return {
    provider: 'qishui',
    source: 'qishui',
    type: 'qishui',
    id,
    providerSongId: id,
    name,
    artist: artistName,
    artists: artistName ? [{ id: normalizeText(author.id || author.author_id), name: artistName, mid: normalizeText(author.id || author.author_id) }] : [],
    album: normalizeText(album.name || raw.album_name || ''),
    cover: firstUrl(raw.cover_url || raw.cover || raw.artwork || album.cover_url),
    duration: Number(raw.duration || raw.duration_ms || 0) > 10000 ? Math.round(Number(raw.duration || raw.duration_ms) / 1000) : (Number(raw.duration || raw.duration_ms || 0) || 0),
    fee: raw.qishui_label_info && raw.qishui_label_info.only_vip_playable ? 1 : 0,
    playable: false,
    playbackMode: 'recommend-match',
    recommendationSource: 'qishui-public-catalog',
    qishuiRank: index,
    qishuiQuery: query || '',
    lyric,
    tlyric: '',
    restriction: qishuiRestriction('provider_limited', '汽水音乐当前作为搜索/匹配源接入，播放时会自动寻找其它可播版本。', 'switch_source'),
  };
}

function qishuiSearchComparable(value) {
  return normalizeText(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function qishuiPublicSearchScore(song, keywords) {
  song = song || {};
  const query = qishuiSearchComparable(keywords);
  if (!query) return 0;
  const name = qishuiSearchComparable(song.name);
  const artist = qishuiSearchComparable(song.artist);
  const album = qishuiSearchComparable(song.album);
  let score = 0;
  if (name === query) score += 180;
  else if (name.includes(query)) score += 120;
  else if (name && query.includes(name) && name.length >= 2) score += 70;
  if (artist === query) score += 150;
  else if (artist.includes(query)) score += 105;
  if (album === query) score += 80;
  else if (album.includes(query)) score += 45;
  const tokens = normalizeText(keywords).split(/\s+/).map(qishuiSearchComparable).filter(token => token.length >= 2);
  tokens.forEach(token => {
    if (name.includes(token)) score += 28;
    if (artist.includes(token)) score += 22;
    if (album.includes(token)) score += 10;
  });
  return score;
}

function rankQishuiPublicSongs(songs, keywords, limit) {
  const scored = (Array.isArray(songs) ? songs : []).map((song, index) => ({
    song,
    index,
    score: qishuiPublicSearchScore(song, keywords),
  }));
  const matched = scored.filter(item => item.score > 0);
  const source = matched.length ? matched : scored;
  return source
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, Number(limit) || 8))
    .map(item => item.song);
}

async function handleQishuiPublicSearch(keywords, limit, cookieText, offset) {
  offset = Math.max(0, Number(offset) || 0);
  const requestLimit = Math.min(100, Math.max(offset + (Number(limit) * 3 || 0), 36));
  const url = urlWithParams(QISHUI_PUBLIC_SEARCH_URL, {
    keyword: keywords,
    search_type: 'music',
    limit: requestLimit,
    // The public catalogue endpoint currently repeats nearly the same first
    // page for non-zero real_offset. Fetch a bounded candidate window once and
    // paginate the locally ranked set so scroll loading never loops duplicates.
    real_offset: 0,
    search_source: 'qishui',
  });
  const json = await requestJson(url, { timeoutMs: 8000, headers: QISHUI_PUBLIC_HEADERS });
  const list = (json && json.data && Array.isArray(json.data.list)) ? json.data.list : [];
  const mappedSongs = list.map((item, index) => mapQishuiPublicItem(item, index, keywords)).filter(Boolean);
  const rankedSongs = rankQishuiPublicSongs(mappedSongs, keywords, requestLimit);
  const songs = rankedSongs.slice(offset, offset + limit);
  const status = getQishuiStatus(cookieText);
  return {
    provider: 'qishui',
    configured: status.configured,
    loggedIn: status.loggedIn,
    webSession: status.webSession,
    publicCatalog: true,
    songs,
    rawCount: list.length,
    offset,
    limit,
    nextOffset: offset + songs.length,
    hasMore: songs.length >= limit && (offset + songs.length < rankedSongs.length || requestLimit < 100),
    message: songs.length ? '' : '汽水公开搜索暂时没有返回匹配结果。',
  };
}

async function fetchQishuiPublicDetail(id) {
  id = normalizeText(id);
  if (!id) return null;
  return qishuiPublicDetailCache.wrap(id, 30 * 60 * 1000, async () => {
    const url = urlWithParams(QISHUI_PUBLIC_CONTENTS_URL, {
      sources: 'qishui',
      need_author: true,
      need_album: true,
      need_ugc: true,
      need_stat: true,
      item_ids: id,
    });
    const json = await requestJson(url, { timeoutMs: 8000, headers: QISHUI_PUBLIC_HEADERS });
    const item = json && json.data && Array.isArray(json.data.list) ? json.data.list[0] : null;
    if (!item) return null;
    const lyricInfo = pickObject(item.lyric_info, item.lyric);
    const lyric = normalizeLyricBody(
      lyricInfo.lyric_text ||
      lyricInfo.content ||
      lyricInfo.lyric ||
      (lyricInfo.lyric_entity && lyricInfo.lyric_entity.content) ||
      ''
    );
    const tlyric = normalizeLyricBody(lyricInfo.translated_lyric || lyricInfo.translation || lyricInfo.tlyric || '');
    cacheQishuiLyric(id, lyric, tlyric, 'qishui-public-detail');
    return { item, lyric, tlyric };
  });
}

function extractQishuiPcSearchItems(payload) {
  const data = (payload && payload.data) || payload || {};
  const groups = pickArray(
    data.result_groups,
    data.resultGroups,
    data.search_result && data.search_result.result_groups,
    payload && payload.result_groups
  );
  const items = [];
  groups.forEach(group => {
    const groupData = group && (group.data || group.items || group.list || group.result);
    if (Array.isArray(groupData)) items.push(...groupData);
    else items.push(...extractQishuiMediaList(groupData));
  });
  return items.length ? items : extractQishuiMediaList(data);
}

async function handleQishuiPcSearch(keywords, limit, cookieText, offset) {
  const cookie = normalizeQishuiCookieInput(cookieText);
  if (!qishuiCookieHasLogin(cookie)) throw new Error('QISHUI_COOKIE_REQUIRED');
  const requestCount = Math.max(1, Math.min(50, Number(limit) || 8));
  offset = Math.max(0, Number(offset) || 0);
  const json = await qishuiWebRequestJson('/luna/pc/search/track', qishuiPcAppParams({
    q: keywords,
    cursor: String(offset),
    count: requestCount,
    search_method: 'input',
  }), cookie, {
    bases: [QISHUI_WEB_PC_API_BASE],
    noDefaultParams: true,
    sessionOnly: true,
    pcApp: true,
    timeoutMs: 8500,
  });
  const rawItems = extractQishuiPcSearchItems(json);
  const songs = mapQishuiMediaList(rawItems, keywords, { directPlayable: true }).slice(0, limit);
  const data = (json && json.data) || json || {};
  const resultData = pickObject(data.search_result, data.searchResult, data);
  const nextCursor = normalizeText(
    resultData.next_cursor ||
    resultData.nextCursor ||
    data.next_cursor ||
    data.nextCursor ||
    ''
  );
  const hasMoreFlag = resultData.has_more;
  const hasMore = hasMoreFlag != null
    ? (hasMoreFlag === true || hasMoreFlag === 'true' || Number(hasMoreFlag) > 0)
    : (!!nextCursor || songs.length >= limit);
  return {
    provider: 'qishui',
    configured: true,
    loggedIn: true,
    webSession: true,
    source: 'qishui-pc-search',
    songs,
    rawCount: rawItems.length,
    offset,
    limit,
    nextOffset: offset + songs.length,
    nextCursor,
    hasMore,
  };
}

async function handleQishuiSearch(keywords, limit, cookieText, offset) {
  keywords = normalizeText(keywords);
  limit = Math.max(1, Math.min(18, Number(limit) || 8));
  offset = Math.max(0, Number(offset) || 0);
  const status = getQishuiStatus(cookieText);
  if (!keywords) return { provider: 'qishui', songs: [], configured: status.configured, message: status.message };
  if (!status.webSession && !status.tokenConfigured && !QISHUI_PUBLIC_ENABLED) {
    return {
      provider: 'qishui',
      configured: false,
      songs: [],
      error: 'QISHUI_TOKEN_REQUIRED',
      reason: 'missing_access_token',
      message: status.message,
    };
  }
  const cacheKey = keywords.toLowerCase() + '|' + limit + '|' + offset + '|' + (status.webSession ? qishuiCookieFingerprint(cookieText) : (status.tokenConfigured ? 'token' : 'public'));
  return qishuiSearchCache.wrap(cacheKey, value => value.pcSearchError ? 0 : 2 * 60 * 1000, async () => {
    let pcSearchError = '';
    let sessionFailure = null;
    if (status.webSession) {
      try {
        return await handleQishuiPcSearch(keywords, limit, cookieText, offset);
      } catch (err) {
        pcSearchError = err && err.message || String(err);
        if (qishuiSessionExpired(err)) sessionFailure = qishuiSessionFailure(err, cookieText);
        else if (err && err.code === 'QISHUI_EMPTY_RESPONSE') {
          const membership = await fetchQishuiPlaybackMembership(cookieText);
          if (membership.reauthRequired) sessionFailure = qishuiSessionFailure(membership, cookieText);
        }
      }
    }
    if (!status.tokenConfigured || offset > 0) {
      if (!QISHUI_PUBLIC_ENABLED) {
        const err = new Error(pcSearchError || 'QISHUI_SEARCH_UNAVAILABLE');
        err.code = 'QISHUI_SEARCH_UNAVAILABLE';
        throw err;
      }
      const fallback = await handleQishuiPublicSearch(keywords, limit, cookieText, offset);
      if (pcSearchError) fallback.pcSearchError = pcSearchError;
      if (sessionFailure) Object.assign(fallback, {
        loggedIn: false, webSession: false, reauthRequired: sessionFailure.reauthRequired,
        stale: sessionFailure.stale, error: sessionFailure.error, message: sessionFailure.message,
      });
      return fallback;
    }
    const payload = {
      search_query: keywords,
      played_media: [],
      count: limit,
      common_params: {
        trigger_name: 'mineradio_search',
        scene: 'search',
        source: 'mineradio',
      },
    };
    try {
      const json = await qishuiPost(QISHUI_RELATED_MEDIA_PATH, payload);
      const rawItems = extractQishuiMediaList(json);
      const songs = rawItems.map((item, index) => mapQishuiMedia(item, index, keywords)).filter(Boolean).slice(0, limit);
      return {
        provider: 'qishui',
        configured: true,
        songs,
        rawCount: rawItems.length,
        offset,
        limit,
        nextOffset: songs.length,
        hasMore: rawItems.length >= limit,
        pcSearchError,
      };
    } catch (err) {
      if (!QISHUI_PUBLIC_ENABLED) throw err;
      const fallback = await handleQishuiPublicSearch(keywords, limit, cookieText, offset);
      fallback.officialError = err && err.message || String(err);
      if (pcSearchError) fallback.pcSearchError = pcSearchError;
      return fallback;
    }
  });
}

async function fetchQishuiFeedSongs(limit, cookieText) {
  limit = Math.max(1, Math.min(50, Number(limit) || 8));
  const status = getQishuiStatus(cookieText);
  if (!status.tokenConfigured && status.webSession) return fetchQishuiWebFeedSongs(cookieText, limit);
  if (!status.tokenConfigured) return { provider: 'qishui', configured: false, songs: [], error: 'QISHUI_TOKEN_REQUIRED', message: status.message };
  const cacheKey = 'feed|' + limit;
  return qishuiFeedCache.wrap(cacheKey, 90 * 1000, async () => {
    const json = await qishuiPost(QISHUI_FEED_SONG_TAB_PATH, {
      count: limit,
      played_media: [],
      common_params: {
        trigger_name: 'mineradio_feed',
        scene: 'feed',
        source: 'mineradio',
      },
    });
    const rawItems = extractQishuiMediaList(json);
    const songs = rawItems.map((item, index) => mapQishuiMedia(item, index, 'feed')).filter(Boolean).slice(0, limit);
    return { provider: 'qishui', configured: true, songs, rawCount: rawItems.length };
  });
}

async function handleQishuiFeed(limit, cookieText) {
  return fetchQishuiFeedSongs(Math.max(1, Math.min(18, Number(limit) || 8)), cookieText);
}

function buildQishuiFeedPlaylist(songs) {
  songs = Array.isArray(songs) ? songs : [];
  const firstCover = songs.map(song => song && song.cover).find(Boolean) || '';
  return {
    provider: 'qishui',
    source: 'qishui',
    type: 'playlist',
    id: QISHUI_VIRTUAL_FEED_PLAYLIST_ID,
    name: '汽水推荐',
    cover: firstCover,
    trackCount: songs.length,
    playCount: 0,
    creator: '汽水音乐',
    subscribed: false,
    virtual: true,
    playbackMode: 'recommend-match',
  };
}

async function handleQishuiUserPlaylists(cookieText) {
  const status = getQishuiStatus(cookieText);
  if (status.webSession) {
    try {
      const library = await fetchQishuiWebLibrary(cookieText);
      // The recommendation feed is loaded when its virtual playlist opens.
      // Listing an account library must not wait for unrelated feed fallbacks.
      const feed = { songs: [], rawCount: 0 };
      const likedTracks = library.likedTracks || [];
      const likedCard = library.likedCard || {};
      const profile = library.profile || {};
      const recentTracks = library.recentTracks || [];
      const playlists = [
        buildQishuiVirtualPlaylist(QISHUI_WEB_LIKED_PLAYLIST_ID, '汽水我的喜欢', likedTracks, {
          subscribed: false,
          shelfPane: 'mine',
          owned: true,
          webSession: true,
          cover: likedCard.cover,
          trackCount: likedTracks.length || likedCard.trackCount || 0,
          creator: profile.nickname || likedCard.creator,
        }),
      ];
      (library.playlists || []).forEach(pl => {
        if (!pl || !pl.id || playlists.some(item => item.id === pl.id)) return;
        playlists.push(pl);
      });
      if (recentTracks.length) {
        playlists.push(buildQishuiVirtualPlaylist(QISHUI_WEB_RECENT_PLAYLIST_ID, '汽水最近播放', recentTracks, {
          subscribed: false,
          shelfPane: 'mine',
          owned: true,
          webSession: true,
        }));
      }
      playlists.push(buildQishuiFeedPlaylist((feed && feed.songs) || []));
      return {
        provider: 'qishui',
        loggedIn: true,
        configured: true,
        webSession: true,
        playlists,
        tracksPreview: likedTracks.slice(0, 8),
        rawCount: (feed && feed.rawCount) || 0,
        libraryErrors: library.errors || [],
        libraryReady: !!library.libraryReady,
        profile,
        userId: profile.userId || '',
        nickname: profile.nickname || '',
        avatar: profile.avatar || '',
      };
    } catch (err) {
      return Object.assign(qishuiSessionFailure(err, cookieText), { playlists: [] });
    }
  }
  if (!status.configured) {
    return {
      provider: 'qishui',
      loggedIn: false,
      configured: false,
      playlists: [],
      error: 'QISHUI_TOKEN_REQUIRED',
      message: status.message,
    };
  }
  try {
    const feed = await fetchQishuiFeedSongs(24, cookieText);
    const playlist = buildQishuiFeedPlaylist(feed.songs || []);
    return {
      provider: 'qishui',
      loggedIn: false,
      configured: true,
      playlists: [playlist],
      tracksPreview: (feed.songs || []).slice(0, 8),
      rawCount: feed.rawCount || 0,
    };
  } catch (err) {
    return {
      provider: 'qishui',
      loggedIn: false,
      configured: true,
      playlists: [],
      error: err && err.message || 'QISHUI_FEED_FAILED',
      message: '汽水推荐歌单暂时同步失败，请稍后重试。',
    };
  }
}

async function handleQishuiPlaylistTracks(playlistId, opts, cookieText) {
  opts = opts || {};
  const status = getQishuiStatus(cookieText);
  const id = normalizeText(String(playlistId || '').replace(/^qishui:/i, ''));
  const limit = Math.max(1, Math.min(50, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);
  if (status.webSession) {
    if (id === QISHUI_WEB_LIKED_PLAYLIST_ID || id === 'liked' || id === 'favorite') {
      const library = await fetchQishuiWebLibrary(cookieText);
      let allSongs = library.likedTracks || [];
      if (!allSongs.length && library.likedCard && library.likedCard.id) {
        const detail = await fetchQishuiWebPlaylistTracks(library.likedCard.id, cookieText, opts).catch(() => null);
        if (detail && detail.tracks) {
          const playlist = buildQishuiVirtualPlaylist(QISHUI_WEB_LIKED_PLAYLIST_ID, '汽水我的喜欢', detail.tracks, {
            subscribed: false,
            shelfPane: 'mine',
            owned: true,
            webSession: true,
            cover: library.likedCard.cover || detail.playlist && detail.playlist.cover,
            trackCount: detail.total || library.likedCard.trackCount || detail.tracks.length,
            creator: library.profile && library.profile.nickname,
          });
          return {
            provider: 'qishui',
            loggedIn: true,
            configured: true,
            webSession: true,
            playlist,
            tracks: detail.tracks,
            total: detail.total || detail.tracks.length,
            offset,
            limit,
            nextOffset: detail.nextOffset,
            hasMore: !!detail.hasMore,
          };
        }
      }
      const tracks = allSongs.slice(offset, offset + limit);
      const playlist = buildQishuiVirtualPlaylist(QISHUI_WEB_LIKED_PLAYLIST_ID, '汽水我的喜欢', allSongs, {
        subscribed: false,
        shelfPane: 'mine',
        owned: true,
        webSession: true,
        cover: library.likedCard && library.likedCard.cover,
        trackCount: allSongs.length || library.likedCard && library.likedCard.trackCount || 0,
        creator: library.profile && library.profile.nickname,
      });
      return {
        provider: 'qishui',
        loggedIn: true,
        configured: true,
        webSession: true,
        playlist,
        tracks,
        total: allSongs.length,
        offset,
        limit,
        nextOffset: offset + tracks.length,
        hasMore: offset + tracks.length < allSongs.length,
      };
    }
    if (id === QISHUI_WEB_RECENT_PLAYLIST_ID || id === 'recent') {
      const library = await fetchQishuiWebLibrary(cookieText);
      const allSongs = library.recentTracks || [];
      const tracks = allSongs.slice(offset, offset + limit);
      const playlist = buildQishuiVirtualPlaylist(QISHUI_WEB_RECENT_PLAYLIST_ID, '汽水最近播放', allSongs, {
        subscribed: false,
        shelfPane: 'mine',
        owned: true,
        webSession: true,
      });
      return {
        provider: 'qishui',
        loggedIn: true,
        configured: true,
        webSession: true,
        playlist,
        tracks,
        total: allSongs.length,
        offset,
        limit,
        nextOffset: offset + tracks.length,
        hasMore: offset + tracks.length < allSongs.length,
      };
    }
    if (id && id !== QISHUI_VIRTUAL_FEED_PLAYLIST_ID && id !== 'feed') {
      return fetchQishuiWebPlaylistTracks(id, cookieText, opts);
    }
  }
  if (!status.configured) {
    return {
      provider: 'qishui',
      loggedIn: false,
      configured: false,
      playlist: buildQishuiFeedPlaylist([]),
      tracks: [],
      total: 0,
      error: 'QISHUI_TOKEN_REQUIRED',
      message: status.message,
    };
  }
  if (id && id !== QISHUI_VIRTUAL_FEED_PLAYLIST_ID && id !== 'feed') {
    return {
      provider: 'qishui',
      loggedIn: true,
      configured: true,
      playlist: buildQishuiFeedPlaylist([]),
      tracks: [],
      total: 0,
      error: 'QISHUI_PLAYLIST_NOT_FOUND',
      message: '当前汽水接入只支持官方推荐歌单。',
    };
  }
  const fetchCount = Math.max(limit, Math.min(50, offset + limit));
  const feed = await fetchQishuiFeedSongs(fetchCount, cookieText);
  const allSongs = feed.songs || [];
  const tracks = allSongs.slice(offset, offset + limit);
  const playlist = buildQishuiFeedPlaylist(allSongs);
  return {
    provider: 'qishui',
    loggedIn: true,
    configured: true,
    playlist,
    tracks,
    total: allSongs.length,
    offset,
    limit,
    nextOffset: offset + tracks.length,
    hasMore: false,
    rawCount: feed.rawCount || allSongs.length,
  };
}

function qishuiCollectionIds(value) {
  const values = Array.isArray(value) ? value : String(value == null ? '' : value).split(',');
  const seen = new Set();
  const ids = [];
  values.forEach(item => {
    const id = normalizeText(item && typeof item === 'object'
      ? (item.id || item.trackId || item.track_id || item.providerSongId)
      : item);
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

function qishuiWriteEnabled(value) {
  if (value === false || value === 0) return false;
  return !/^(?:false|0|off|no)$/i.test(normalizeText(value));
}

async function handleQishuiCheckTracksLiked(trackIds, cookieText) {
  const ids = qishuiCollectionIds(trackIds);
  if (!ids.length) return { provider: 'qishui', loggedIn: qishuiCookieHasLogin(cookieText), ids: [], liked: {}, complete: true };
  const cookie = normalizeQishuiCookieInput(cookieText);
  if (!qishuiCookieHasLogin(cookie)) {
    return { provider: 'qishui', loggedIn: false, ids, liked: {}, complete: false, error: 'QISHUI_COOKIE_REQUIRED' };
  }
  const library = await fetchQishuiWebLibrary(cookie);
  let knownTracks = dedupeQishuiSongs(library.likedTracks || []);
  let complete = false;
  if (library.likedCard && library.likedCard.id) {
    const detail = await fetchQishuiWebPlaylistTracks(library.likedCard.id, cookie, { limit: 50, offset: 0 }).catch(() => null);
    if (detail && Array.isArray(detail.tracks)) {
      knownTracks = dedupeQishuiSongs(knownTracks.concat(detail.tracks));
      complete = !detail.hasMore;
    } else {
      complete = false;
    }
  }
  const knownLiked = new Set(knownTracks.map(song => String(song.providerSongId || song.id || '')).filter(Boolean));
  const liked = {};
  ids.forEach(id => { liked[id] = knownLiked.has(id); });
  return {
    provider: 'qishui',
    loggedIn: true,
    ids,
    liked,
    complete,
    checkedCount: knownLiked.size,
  };
}

async function handleQishuiSetTrackLiked(trackId, liked, cookieText) {
  const id = normalizeText(trackId);
  if (!id) throw new Error('Missing Qishui track id');
  liked = qishuiWriteEnabled(liked);
  const apiPath = liked
    ? '/luna/pc/me/collection/media'
    : '/luna/pc/me/collection/media/delete';
  await qishuiPcPostJson(apiPath, {
    media: [{ type: 'track', id }],
    scene: '',
  }, cookieText, { errorCode: liked ? 'QISHUI_LIKE_FAILED' : 'QISHUI_UNLIKE_FAILED' });
  invalidateQishuiLibraryCaches();
  return { provider: 'qishui', loggedIn: true, id, liked, ok: true };
}

async function handleQishuiSetPlaylistCollected(playlistId, collected, cookieText) {
  const id = normalizeText(String(playlistId || '').replace(/^qishui:/i, ''));
  if (!id) throw new Error('Missing Qishui playlist id');
  collected = qishuiWriteEnabled(collected);
  await qishuiPcPostJson(
    collected ? '/luna/pc/me/collection/playlist' : '/luna/pc/me/collection/playlist/delete',
    { playlist_ids: [id] },
    cookieText,
    { errorCode: collected ? 'QISHUI_PLAYLIST_COLLECT_FAILED' : 'QISHUI_PLAYLIST_UNCOLLECT_FAILED' }
  );
  invalidateQishuiLibraryCaches();
  return { provider: 'qishui', loggedIn: true, id, collected, ok: true };
}

async function handleQishuiPlaylistAddSong(playlistId, track, cookieText) {
  const playlistIdValue = normalizeText(String(playlistId || '').replace(/^qishui:/i, ''));
  const trackId = normalizeText(track && typeof track === 'object'
    ? (track.providerSongId || track.trackId || track.track_id || track.id)
    : track);
  if (!playlistIdValue || !trackId) throw new Error('Missing Qishui playlist or track id');
  await qishuiPcPostJson('/luna/pc/me/playlist/media/append', {
    playlist_id: playlistIdValue,
    media: [{ id: trackId, type: 'track' }],
  }, cookieText, { errorCode: 'QISHUI_PLAYLIST_ADD_FAILED' });
  invalidateQishuiLibraryCaches();
  return {
    provider: 'qishui',
    loggedIn: true,
    pid: playlistIdValue,
    id: trackId,
    success: true,
    ok: true,
  };
}

async function handleQishuiSetAlbumCollected(albumId, collected, cookieText) {
  const id = normalizeText(albumId);
  if (!id) throw new Error('Missing Qishui album id');
  collected = qishuiWriteEnabled(collected);
  await qishuiPcPostJson(
    collected ? '/luna/pc/me/collection/album' : '/luna/pc/me/collection/album/delete',
    { album_ids: [id] },
    cookieText,
    { errorCode: collected ? 'QISHUI_ALBUM_COLLECT_FAILED' : 'QISHUI_ALBUM_UNCOLLECT_FAILED' }
  );
  invalidateQishuiLibraryCaches();
  return { provider: 'qishui', loggedIn: true, id, collected, ok: true };
}

async function handleQishuiReportRecentlyPlayed(trackId, cookieText) {
  const id = normalizeText(trackId);
  if (!id) throw new Error('Missing Qishui track id');
  await qishuiPcPostJson('/luna/pc/me/recently-played-media', {
    media: [{ type: 'track', id }],
  }, cookieText, { errorCode: 'QISHUI_RECENT_PLAY_REPORT_FAILED', timeoutMs: 6500 });
  qishuiWebLibraryCache.clear();
  return { provider: 'qishui', loggedIn: true, id, reported: true, ok: true };
}

function extractQishuiCommentList(payload) {
  const data = (payload && payload.data) || payload || {};
  return pickArray(
    data.comments,
    data.comment_list,
    data.commentList,
    data.items,
    data.list,
    payload && payload.comments
  );
}

function mapQishuiComment(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const comment = pickObject(raw.comment, raw.comment_info, raw.commentInfo, raw);
  const user = pickObject(
    comment.user,
    comment.user_info,
    comment.userInfo,
    comment.author,
    raw.user,
    raw.user_info,
    raw.author
  );
  const timeRaw = Number(
    comment.create_time ||
    comment.createTime ||
    comment.created_at ||
    comment.createdAt ||
    comment.time ||
    raw.create_time ||
    raw.time ||
    0
  ) || 0;
  return {
    id: normalizeText(comment.id || comment.comment_id || comment.commentId || raw.id || ''),
    content: normalizeLyricBody(comment.text || comment.content || comment.comment_text || comment.commentText || ''),
    likedCount: Number(comment.like_count || comment.likeCount || comment.digg_count || comment.diggCount || comment.liked_count || 0) || 0,
    time: timeRaw && timeRaw < 10000000000 ? timeRaw * 1000 : timeRaw,
    user: {
      id: normalizeText(user.id || user.user_id || user.userId || user.uid || ''),
      nickname: normalizeText(user.nickname || user.nick_name || user.nickName || user.name || ''),
      avatar: qishuiFirstImageUrl('~c5_100x100.jpg',
        user.avatar_url,
        user.avatarUrl,
        user.avatar,
        user.medium_avatar_url,
        user.larger_avatar_url
      ),
    },
  };
}

async function handleQishuiComments(trackId, opts, cookieText) {
  const id = normalizeText(trackId);
  if (!id) return { provider: 'qishui', id: '', comments: [], total: 0, error: 'Missing Qishui track id' };
  const cookie = normalizeQishuiCookieInput(cookieText);
  if (!qishuiCookieHasLogin(cookie)) {
    return { provider: 'qishui', id, loggedIn: false, comments: [], total: 0, error: 'QISHUI_COOKIE_REQUIRED' };
  }
  opts = opts || {};
  const count = Math.max(1, Math.min(50, Number(opts.count || opts.limit) || 20));
  const cursor = normalizeText(opts.cursor != null ? opts.cursor : (opts.offset || ''));
  const json = await qishuiWebRequestJson('/luna/pc/comments', qishuiPcAppParams({
    group_id: id,
    cursor,
    count,
    group_type: 0,
  }), cookie, {
    bases: [QISHUI_WEB_PC_API_BASE],
    noDefaultParams: true,
    sessionOnly: true,
    pcApp: true,
    timeoutMs: 8500,
  });
  const rawComments = extractQishuiCommentList(json);
  const comments = rawComments.map(mapQishuiComment).filter(comment => comment.content);
  const data = (json && json.data) || json || {};
  const nextCursor = normalizeText(data.next_cursor || data.nextCursor || data.cursor || json && (json.next_cursor || json.cursor) || '');
  const total = Number(data.total || data.total_count || data.totalCount || data.count || json && (json.total || json.count) || comments.length) || comments.length;
  return {
    provider: 'qishui',
    id,
    loggedIn: true,
    comments,
    total,
    cursor,
    nextCursor,
    hasMore: !!(data.has_more || data.hasMore || nextCursor),
  };
}

async function handleQishuiCreateComment(trackId, text, cookieText) {
  const id = normalizeText(trackId);
  text = normalizeLyricBody(text);
  if (!id) throw new Error('Missing Qishui track id');
  if (!text) throw new Error('Missing Qishui comment text');
  const json = await qishuiPcPostJson('/luna/pc/comments/create', {
    group_id: id,
    text,
    group_type: 0,
  }, cookieText, { errorCode: 'QISHUI_COMMENT_CREATE_FAILED' });
  const rawComments = extractQishuiCommentList(json);
  const comment = rawComments.length
    ? mapQishuiComment(rawComments[0])
    : mapQishuiComment((json && json.data) || json);
  return {
    provider: 'qishui',
    id,
    loggedIn: true,
    created: true,
    ok: true,
    comment: comment.content ? comment : null,
  };
}

function qishuiLyricTextFromNode(value) {
  value = qishuiMaybeParseJson(value);
  if (typeof value === 'string') {
    const text = normalizeLyricBody(value);
    return /^https?:\/\//i.test(text) ? '' : text;
  }
  if (!value || typeof value !== 'object') return '';
  const entity = pickObject(
    value.lyric_entity,
    value.lyricEntity,
    value.original_lyric,
    value.originalLyric,
    value
  );
  for (const key of ['content', 'lyric_text', 'lyricText', 'text', 'original_content', 'originalContent']) {
    const text = qishuiLyricTextFromNode(entity[key]);
    if (text) return text;
  }
  if (entity !== value) return qishuiLyricTextFromNode(entity);
  return '';
}

function extractQishuiLyrics(payload) {
  const found = { lyric: '', tlyric: '' };
  const seen = new Set();
  let visitedNodes = 0;
  function visit(node, pathText, depth) {
    if (!node || depth > 7 || visitedNodes >= 600 || (found.lyric && found.tlyric)) return;
    node = qishuiMaybeParseJson(node);
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    visitedNodes += 1;
    Object.keys(node).slice(0, 120).forEach(key => {
      const child = node[key];
      const childPath = pathText ? pathText + '.' + key : key;
      if (/lyric|lyrics|tlyric|translation/i.test(key)) {
        const text = qishuiLyricTextFromNode(child);
        if (text) {
          if (/translat|tlyric|lang_translation|translated/i.test(childPath)) {
            if (!found.tlyric) found.tlyric = text;
          } else if (!found.lyric) {
            found.lyric = text;
          }
        }
      }
      if (/^(album_tracks|artist_tracks|chart_tracks|comments|prompts|recommend_media_list)$/i.test(key)) return;
      visit(child, childPath, depth + 1);
    });
  }
  visit(payload, '', 0);
  return found;
}

async function fetchQishuiSeoTrack(trackId) {
  return requestJson(urlWithParams('https://beta-luna.douyin.com/luna/h5/seo_track', {
    track_id: trackId,
    device_platform: 'web',
  }), {
    timeoutMs: 8000,
    headers: {
      'Accept': 'application/json,text/plain,*/*',
      'User-Agent': QISHUI_WEB_UA,
      'Referer': 'https://www.douyin.com/',
    },
  });
}

async function handleQishuiLyric(id, cookieText) {
  id = normalizeText(id);
  if (!id) return { provider: 'qishui', lyric: '', tlyric: '', source: 'none', error: 'Missing Qishui id' };
  const cached = qishuiLyricCache.get(id);
  if (cached) return cached;
  const errors = [];
  try {
    const seoPayload = await fetchQishuiSeoTrack(id);
    const lyrics = extractQishuiLyrics(seoPayload);
    const cachedSeo = cacheQishuiLyric(id, lyrics.lyric, lyrics.tlyric, 'qishui-beta-seo-track');
    if (cachedSeo) return cachedSeo;
  } catch (err) {
    errors.push('seo:' + (err && err.message || String(err)));
  }
  if (qishuiCookieHasLogin(normalizeQishuiCookieInput(cookieText))) {
    try {
      const trackPayload = await fetchQishuiPcTrackV2Get(id, cookieText);
      const lyrics = extractQishuiLyrics(trackPayload);
      const cachedTrack = cacheQishuiLyric(id, lyrics.lyric, lyrics.tlyric, 'qishui-pc-track-v2');
      if (cachedTrack) return cachedTrack;
    } catch (err) {
      errors.push('track-v2:' + (err && err.message || String(err)));
    }
  }
  if (QISHUI_PUBLIC_ENABLED) {
    try {
      const detail = await fetchQishuiPublicDetail(id);
      const fresh = qishuiLyricCache.get(id);
      if (fresh) return fresh;
      if (detail && (detail.lyric || detail.tlyric)) {
        const cachedPublic = cacheQishuiLyric(id, detail.lyric, detail.tlyric, 'qishui-public-detail');
        if (cachedPublic) return cachedPublic;
      }
    } catch (err) {
      errors.push('public:' + (err && err.message || String(err)));
    }
  }
  return {
    provider: 'qishui',
    lyric: '',
    tlyric: '',
    yrc: '',
    ytlrc: '',
    source: 'none',
    error: errors.join('; '),
  };
}

function qishuiPrimaryTrackFromV2(payload) {
  const data = (payload && payload.data) || payload || {};
  return pickObject(data.track, data.track_info, data.trackInfo, payload && payload.track, payload && payload.track_info, payload && payload.trackInfo);
}

function qishuiTrackPlayerFromV2(payload, track) {
  const data = (payload && payload.data) || payload || {};
  return pickObject(
    data.track_player,
    data.trackPlayer,
    payload && payload.track_player,
    payload && payload.trackPlayer,
    track && track.track_player,
    track && track.trackPlayer
  );
}

async function fetchQishuiPcTrackV2Post(trackId, cookieText) {
  const body = JSON.stringify({
    track_id: trackId,
    media_type: 'track',
    queue_type: 'favorite_track_playlist',
    scene_name: 'library',
  });
  const json = await requestJson(qishuiPcUrl('/luna/pc/track_v2', qishuiPcAppParams()), {
    method: 'POST',
    timeoutMs: 3000,
    headers: Object.assign(qishuiWebHeaders(cookieText, { sessionOnly: true, pcApp: true }), {
      'Content-Length': Buffer.byteLength(body),
      'Referer': 'https://www.qishui.com/',
    }),
  }, body);
  const err = qishuiPcStatusError(json, 'QISHUI_PC_TRACK_V2_FAILED');
  if (err) throw err;
  return json;
}

async function fetchQishuiPcTrackV2Get(trackId, cookieText) {
  const json = await requestJson(qishuiPcUrl('/luna/pc/track_v2', qishuiPcAppParams({
    track_id: trackId,
    media_type: 'track',
  })), {
    timeoutMs: 3000,
    headers: Object.assign(qishuiWebHeaders(cookieText, { sessionOnly: true, pcApp: true }), {
      'Referer': 'https://www.qishui.com/',
    }),
  });
  const err = qishuiPcStatusError(json, 'QISHUI_PC_TRACK_V2_GET_FAILED');
  if (err) throw err;
  return json;
}

async function fetchQishuiPcTrackV2(trackId, cookieText) {
  const cookie = normalizeQishuiCookieInput(cookieText);
  const cacheKey = 'track-v2-meta|' + qishuiCookieFingerprint(cookie) + '|' + normalizeText(trackId);
  return qishuiTrackMetadataCache.wrap(cacheKey, 20 * 1000, async () => {
    try {
      return await fetchQishuiPcTrackV2Post(trackId, cookie);
    } catch (postError) {
      try {
        return await fetchQishuiPcTrackV2Get(trackId, cookie);
      } catch (getError) {
        getError.postError = postError && postError.message || String(postError);
        throw getError;
      }
    }
  });
}

async function fetchQishuiPlayerInfo(playerInfoUrl, cookieText, membership) {
  playerInfoUrl = normalizeText(playerInfoUrl);
  if (!/^https?:\/\//i.test(playerInfoUrl)) return null;
  const json = await requestJson(playerInfoUrl, {
    timeoutMs: 3000,
    headers: qishuiHeadersWithCookie({
      'Accept': 'application/json,text/plain,*/*',
      'User-Agent': QISHUI_WEB_UA,
      'Referer': 'https://api.qishui.com/',
    }, cookieText),
  });
  const result = pickObject(json && json.Result, json && json.result);
  const data = pickObject(result.Data, result.data, json && json.Data, json && json.data);
  const list = pickArray(data.PlayInfoList, data.playInfoList, data.play_info_list, json && json.PlayInfoList);
  const streams = list.map(item => qishuiStreamFromObject(item)).filter(Boolean);
  const best = qishuiBestStreamCandidateForMembership(streams, membership);
  if (best) return best;
  // Keep a blocked candidate internal so the caller can report the precise
  // VIP/SVIP boundary without ever exposing its URL in an unavailable result.
  const blocked = qishuiBestStreamCandidate(streams);
  if (blocked) return blocked;
  const error = pickObject(json && json.ResponseMetadata && json.ResponseMetadata.Error, json && json.responseMetadata && json.responseMetadata.error);
  if (error && (error.Message || error.message)) throw new Error(normalizeText(error.Message || error.message));
  return null;
}

function collectQishuiTrackV2Streams(payload) {
  const track = qishuiPrimaryTrackFromV2(payload);
  const player = qishuiTrackPlayerFromV2(payload, track);
  const audioInfo = pickObject(track.audio_info, track.audioInfo, payload && payload.audio_info, payload && payload.audioInfo);
  const playInfoList = pickArray(audioInfo.play_info_list, audioInfo.PlayInfoList, audioInfo.playInfoList);
  const streams = playInfoList.map(item => qishuiStreamFromObject(item)).filter(Boolean);
  const videoModel = player.video_model || player.VideoModel || player.videoModel || track.video_model || track.VideoModel || '';
  qishuiCollectVideoModelStreams(videoModel, '', {}, streams);
  const bitRates = pickArray(
    track.bit_rates,
    track.bitRates,
    audioInfo.bit_rates,
    audioInfo.bitRates,
    payload && payload.bit_rates,
    payload && payload.bitRates
  );
  const fallbackStreams = bitRates.map(item => qishuiStreamFromObject(item)).filter(Boolean);
  return { track, player, streams, fallbackStreams };
}

async function resolveQishuiDownloadInfo(trackId, payload, cookieText, membership) {
  const collected = collectQishuiTrackV2Streams(payload);
  const playerInfoUrl = qishuiObjectString(collected.player, ['url_player_info', 'URLPlayerInfo', 'urlPlayerInfo']);
  if (playerInfoUrl) {
    try {
      const stream = await fetchQishuiPlayerInfo(playerInfoUrl, cookieText, membership);
      if (stream) collected.streams.push(stream);
    } catch (err) {
      collected.playerInfoError = err && err.message || String(err);
    }
  }
  const best = qishuiBestStreamCandidateForMembership(collected.streams, membership) ||
    qishuiBestStreamCandidateForMembership(collected.fallbackStreams, membership);
  if (!best) {
    const unrestricted = qishuiBestStreamCandidate(collected.streams) ||
      qishuiBestStreamCandidate(collected.fallbackStreams);
    const requiredTier = unrestricted ? qishuiStreamRequiredTier(unrestricted) : 'free';
    const entitlementLimited = !!(unrestricted && !qishuiRequiredTierAllowed(requiredTier, membership));
    let errorCode = 'QISHUI_AUDIO_SOURCE_EMPTY';
    if (entitlementLimited && !(membership && membership.membershipKnown)) {
      errorCode = 'QISHUI_MEMBERSHIP_UNKNOWN';
    } else if (entitlementLimited && requiredTier === 'svip') {
      errorCode = 'QISHUI_SVIP_REQUIRED';
    } else if (entitlementLimited && requiredTier === 'vip') {
      errorCode = 'QISHUI_VIP_REQUIRED';
    }
    const err = new Error(errorCode === 'QISHUI_AUDIO_SOURCE_EMPTY'
      ? (collected.playerInfoError || errorCode)
      : errorCode);
    err.code = errorCode;
    err.requiredTier = requiredTier;
    throw err;
  }
  return Object.assign(collected, { best });
}

function qishuiUrlWithAuth(url, auth) {
  url = normalizeText(url);
  auth = normalizeText(auth);
  if (!url || !auth || /#auth=/.test(url)) return url;
  return url + '#auth=' + encodeURIComponent(auth);
}

async function handleQishuiSongUrl(opts, cookieText) {
  opts = opts && typeof opts === 'object' ? opts : { id: opts };
  const id = normalizeText(opts.id || opts.trackId || opts.track_id || '');
  const cookie = normalizeQishuiCookieInput(cookieText || opts.cookie || '');
  if (!id) return qishuiUnavailable('Missing Qishui track id', 'missing_id', { loggedIn: qishuiCookieHasLogin(cookie), playbackKeyReady: false });
  if (!qishuiCookieHasLogin(cookie)) {
    return qishuiUnavailable('Qishui playback requires the local SodaMusic PC login state.', 'login_required', {
      loggedIn: false,
      playbackKeyReady: false,
    });
  }
  const requestedQuality = normalizeText(opts.quality || '');
  let payload;
  try {
    payload = await fetchQishuiPcTrackV2(id, cookie);
  } catch (err) {
    const checked = qishuiSessionExpired(err)
      ? { reauthRequired: true }
      : await fetchQishuiPlaybackMembership(cookie);
    if (checked.reauthRequired) {
      return qishuiUnavailable('汽水音乐登录状态已失效，请重新扫码登录。', 'login_required', {
        loggedIn: false, webSession: false, reauthRequired: true,
        error: 'QISHUI_SESSION_EXPIRED', membershipKnown: false, vipLevel: 'unknown',
      });
    }
    return qishuiUnavailable('Qishui did not return track playback metadata: ' + (err && err.message || String(err)), 'source_unavailable', {
      loggedIn: !!checked.sessionValidated,
      stale: !checked.sessionValidated,
      playbackKeyReady: false,
      membershipKnown: false,
      vipType: 0,
      vipLevel: 'unknown',
      isVip: false,
      isSvip: false,
      vipLabel: '未知会员状态',
      rawError: err && err.message || String(err),
    });
  }
  let membership = qishuiPlaybackMembershipFromPayload(payload);
  if (!membership.membershipKnown) membership = await fetchQishuiPlaybackMembership(cookie);
  if (membership.reauthRequired) {
    return qishuiUnavailable('汽水音乐登录状态已失效，请重新扫码登录。', 'login_required', {
      loggedIn: false, webSession: false, reauthRequired: true,
      error: 'QISHUI_SESSION_EXPIRED', membershipKnown: false, vipLevel: 'unknown',
    });
  }
  const membershipKey = membership.isSvip
    ? 'svip'
    : (membership.isVip ? 'vip' : (membership.membershipKnown ? 'free' : 'unknown'));
  const trackRestriction = qishuiTrackPlaybackRestriction(payload);
  const requestRestriction = qishuiTrackPlaybackRestriction(opts);
  const requiredTier = qishuiHigherRequiredTier(trackRestriction.requiredTier, requestRestriction.requiredTier);
  const cacheKey = 'track-v2|' + qishuiCookieFingerprint(cookie) + '|' + membershipKey + '|' + id + '|' + requestedQuality + '|' + requiredTier;
  return qishuiPlaybackCache.wrap(cacheKey, value => value.playable ? 4 * 60 * 1000 : 0, async () => {
    try {
      if (!qishuiRequiredTierAllowed(requiredTier, membership)) {
        const reason = !membership.membershipKnown
          ? 'membership_unknown'
          : (requiredTier === 'svip' ? 'svip_required' : 'vip_required');
        const message = reason === 'membership_unknown'
          ? '汽水音乐暂时无法验证当前账号的会员状态，请稍后重试。'
          : (reason === 'svip_required'
            ? '该汽水音乐歌曲或音质需要可验证的 SVIP 权益。'
            : '该汽水音乐歌曲或音质需要可验证的 VIP 权益。');
        return qishuiUnavailable(message, reason, {
          loggedIn: true,
          playbackKeyReady: true,
          vipRequired: requiredTier !== 'free',
          svipRequired: requiredTier === 'svip',
          requiredTier,
          membershipKnown: !!membership.membershipKnown,
          vipType: membership.vipType || 0,
          vipLevel: membership.vipLevel || (membership.membershipKnown ? 'none' : 'unknown'),
          isVip: !!membership.isVip,
          isSvip: !!membership.isSvip,
          vipLabel: membership.vipLabel || (membership.membershipKnown ? '无VIP' : '未知会员状态'),
          entitlementEvidence: trackRestriction.evidence.concat(requestRestriction.evidence),
        });
      }
      const resolved = await resolveQishuiDownloadInfo(id, payload, cookie, membership);
      const track = resolved.track || {};
      const stream = resolved.best;
      const duration = stream.duration || qishuiNormalizeDurationSeconds(track.duration_ms || track.duration || 0);
      const level = qishuiPlaybackLevel(stream.quality, stream.format, stream.bitrate);
      const fullDuration = qishuiNormalizeDurationSeconds(track.duration_ms || track.duration || 0);
      const trial = !!(duration > 0 && fullDuration > 0 && duration + 5 < fullDuration);
      return {
        provider: 'qishui',
        playbackMode: 'direct-url',
        url: qishuiUrlWithAuth(stream.url, stream.auth),
        playable: true,
        trial,
        loggedIn: true,
        playbackKeyReady: true,
        membershipKnown: !!membership.membershipKnown,
        vipType: membership.vipType || 0,
        vipLevel: membership.vipLevel || 'none',
        isVip: !!membership.isVip,
        isSvip: !!membership.isSvip,
        vipLabel: membership.vipLabel || (membership.isVip ? 'VIP' : '无VIP'),
        level,
        quality: normalizeText(stream.quality || stream.format || level),
        requiredTier: qishuiStreamRequiredTier(stream),
        br: qishuiBitrateForUi(stream.bitrate),
        size: Number(stream.size) || 0,
        duration,
        requestedQuality,
        source: 'qishui-pc-track-v2',
        encrypted: !!stream.auth,
      };
    } catch (err) {
      const entitlementReason = err && err.code === 'QISHUI_MEMBERSHIP_UNKNOWN'
        ? 'membership_unknown'
        : (err && err.code === 'QISHUI_SVIP_REQUIRED'
          ? 'svip_required'
          : (err && err.code === 'QISHUI_VIP_REQUIRED' ? 'vip_required' : ''));
      const message = entitlementReason === 'membership_unknown'
        ? '汽水音乐暂时无法验证当前账号的会员状态，请稍后重试。'
        : (entitlementReason === 'svip_required'
          ? '汽水音乐仅返回了需要 SVIP 权益的音质。'
          : (entitlementReason === 'vip_required'
            ? '汽水音乐仅返回了需要 VIP 权益的音质。'
            : 'Qishui did not return a playable audio source: ' + (err && err.message || String(err))));
      return qishuiUnavailable(
        message,
        entitlementReason || 'source_unavailable', {
        loggedIn: true,
        playbackKeyReady: true,
        requiredTier: err && err.requiredTier || 'free',
        membershipKnown: !!membership.membershipKnown,
        vipType: membership.vipType || 0,
        vipLevel: membership.vipLevel || 'none',
        isVip: !!membership.isVip,
        isSvip: !!membership.isSvip,
        vipLabel: membership.vipLabel || (membership.isVip ? 'VIP' : '无VIP'),
        rawError: err && err.message || String(err),
      });
    }
  });
}

module.exports = {
  getQishuiStatus,
  handleQishuiStatus,
  normalizeQishuiCookieInput,
  qishuiCookieHasLogin,
  getQishuiOAuthConfig,
  buildQishuiOAuthAuthorizeUrl,
  exchangeQishuiOAuthCode,
  saveQishuiAccessToken,
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
  qishuiUnavailable,
  _test: {
    qishuiPublicSearchScore,
    rankQishuiPublicSongs,
    qishuiConvertLyric,
    extractQishuiLyrics,
    collectQishuiTrackV2Streams,
    qishuiMembershipFromData,
    qishuiPlaybackMembershipFromPayload,
    qishuiMembershipCacheTtlMs,
    qishuiUnknownMembership,
    qishuiApplyMembershipObservation,
    qishuiTrackPlaybackRestriction,
    qishuiTrackRequiresVip,
    qishuiStreamRequiredTier,
    qishuiMembershipTier,
    qishuiRequiredTierAllowed,
    qishuiStreamAllowedForMembership,
    qishuiBestStreamCandidateForMembership,
    clearQishuiRuntimeCaches,
  },
};
