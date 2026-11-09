'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');

const SPOTIFY_ACCOUNTS_BASE = (process.env.SPOTIFY_ACCOUNTS_BASE || 'https://accounts.spotify.com').replace(/\/+$/, '');
const SPOTIFY_API_BASE = (process.env.SPOTIFY_API_BASE || 'https://api.spotify.com/v1').replace(/\/+$/, '');
const DEFAULT_SPOTIFY_MARKET = String(process.env.MINERADIO_SPOTIFY_MARKET || process.env.SPOTIFY_MARKET || 'US').trim().toUpperCase();
const DEFAULT_SPOTIFY_CONFIG_FILE = path.join(__dirname, '.spotify-credentials.json');
const DEFAULT_SPOTIFY_TOKEN_FILE = path.join(__dirname, '.spotify-token.json');
const DEFAULT_SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:43879/callback';
const DEFAULT_SPOTIFY_SCOPES = [
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-library-modify',
  'user-top-read',
  'playlist-modify-private',
  'playlist-modify-public',
];
const SPOTIFY_LIKED_PLAYLIST_ID = 'spotify-liked';
const SPOTIFY_UA = 'Mineradio/2.1.0 (Spotify Web API bridge)';
const SPOTIFY_SEARCH_LIMIT_MAX = 10;
const SPOTIFY_PLAYLIST_PAGE_LIMIT = 50;

let spotifyClientTokenCache = { token: '', expiresAt: 0 };
let spotifyClientTokenRefreshPromise = null;
let spotifyUserTokenRefreshPromise = null;
let spotifyProfileCache = { value: null, at: 0, promise: null };
const spotifySearchCache = new Map();
const spotifySearchInflight = new Map();
const SPOTIFY_PROFILE_CACHE_TTL_MS = 60 * 1000;
const SPOTIFY_SHORT_RATE_LIMIT_WAIT_MAX_MS = 5000;
const SPOTIFY_TRANSIENT_RETRY_DELAYS_MS = [320, 900];

function spotifyClientIdLooksValid(value) {
  return /^[A-Za-z0-9]{16,128}$/.test(normalizeText(value));
}

function inspectSpotifyRedirectUri(value) {
  value = normalizeText(value || DEFAULT_SPOTIFY_REDIRECT_URI);
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const loopback = host === '127.0.0.1' || host === '[::1]' || host === '::1';
    const pathName = (parsed.pathname || '/').replace(/\/+$/, '') || '/';
    return {
      ok: parsed.protocol === 'http:' && loopback && !!parsed.port && pathName === '/callback' && !parsed.username && !parsed.password,
      value: parsed.toString(),
      protocol: parsed.protocol,
      host,
      port: Number(parsed.port || 0),
      path: pathName,
      loopback,
    };
  } catch (err) {
    return { ok: false, value, error: 'SPOTIFY_REDIRECT_URI_INVALID' };
  }
}

function normalizeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function firstEnv(keys) {
  for (const key of keys) {
    const value = normalizeText(process.env[key]);
    if (value) return value;
  }
  return '';
}

function uniqueList(items) {
  const out = [];
  const seen = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    item = normalizeText(item);
    if (!item || seen.has(item)) return;
    seen.add(item);
    out.push(item);
  });
  return out;
}

function normalizeScopes(value) {
  if (Array.isArray(value)) return uniqueList(value);
  return uniqueList(String(value || '').split(/[\s,;]+/));
}

function spotifyConfigFileCandidates() {
  const candidates = [];
  function add(value) {
    value = normalizeText(value);
    if (!value) return;
    const resolved = path.resolve(value);
    if (!candidates.includes(resolved)) candidates.push(resolved);
  }
  add(firstEnv(['SPOTIFY_CONFIG_FILE', 'MINERADIO_SPOTIFY_CONFIG_FILE']));
  add(DEFAULT_SPOTIFY_CONFIG_FILE);
  add(path.join(__dirname, 'spotify-credentials.json'));
  return candidates;
}

function normalizeSpotifyFileConfig(raw, file) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const spotify = raw.spotify && typeof raw.spotify === 'object' ? raw.spotify : raw;
  return {
    clientId: normalizeText(spotify.clientId || spotify.client_id || spotify.id),
    clientSecret: normalizeText(spotify.clientSecret || spotify.client_secret || spotify.secret),
    redirectUri: normalizeText(spotify.redirectUri || spotify.redirect_uri || spotify.callbackUrl || spotify.callback_url),
    scopes: normalizeScopes(spotify.scopes || spotify.scope),
    market: normalizeText(spotify.market || spotify.country || ''),
    file,
    source: file ? 'file' : '',
  };
}

function readSpotifyFileConfig() {
  const candidates = spotifyConfigFileCandidates();
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      const config = normalizeSpotifyFileConfig(parsed, file);
      if (config.clientId || config.clientSecret || config.redirectUri || config.scopes.length || config.market) return config;
    } catch (err) {
      console.warn('[SpotifyConfig] ignored invalid config file:', file, err.message);
    }
  }
  return normalizeSpotifyFileConfig(null, '');
}

function getSpotifyConfigFile() {
  return process.env.SPOTIFY_CONFIG_FILE || process.env.MINERADIO_SPOTIFY_CONFIG_FILE || DEFAULT_SPOTIFY_CONFIG_FILE;
}

function saveSpotifyConfig(input) {
  input = input && typeof input === 'object' ? input : {};
  const clientId = normalizeText(input.clientId || input.client_id || input.id);
  const redirectUri = normalizeText(input.redirectUri || input.redirect_uri || input.callbackUrl || input.callback_url) || DEFAULT_SPOTIFY_REDIRECT_URI;
  const scopes = normalizeScopes(input.scopes || input.scope);
  const market = normalizeText(input.market || input.country || DEFAULT_SPOTIFY_MARKET || 'US').toUpperCase();
  if (!clientId) {
    const err = new Error('SPOTIFY_CLIENT_ID_REQUIRED');
    err.code = 'SPOTIFY_CLIENT_ID_REQUIRED';
    err.missing = ['SPOTIFY_CLIENT_ID'];
    throw err;
  }
  if (!spotifyClientIdLooksValid(clientId)) {
    const err = new Error('SPOTIFY_CLIENT_ID_INVALID');
    err.code = 'SPOTIFY_CLIENT_ID_INVALID';
    throw err;
  }
  const redirectCheck = inspectSpotifyRedirectUri(redirectUri);
  if (!redirectCheck.ok) {
    const err = new Error('SPOTIFY_REDIRECT_URI_INVALID');
    err.code = 'SPOTIFY_REDIRECT_URI_INVALID';
    err.redirectUri = redirectUri;
    throw err;
  }
  const file = getSpotifyConfigFile();
  writeJsonFile(file, {
    spotify: {
      clientId,
      redirectUri,
      scopes: scopes.length ? scopes : DEFAULT_SPOTIFY_SCOPES,
      market,
    },
  });
  return {
    provider: 'spotify',
    ok: true,
    saved: true,
    credentialsFile: file,
    credentialsFileExists: true,
    clientId,
    redirectUri,
    scope: (scopes.length ? scopes : DEFAULT_SPOTIFY_SCOPES).join(' '),
    market,
  };
}

function getSpotifyTokenFile() {
  return process.env.SPOTIFY_TOKEN_FILE || process.env.MINERADIO_SPOTIFY_TOKEN_FILE || DEFAULT_SPOTIFY_TOKEN_FILE;
}

function readStoredSpotifyToken() {
  const file = getSpotifyTokenFile();
  try {
    if (!file || !fs.existsSync(file)) return { file, accessToken: '', refreshToken: '', expiresAt: 0 };
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    return {
      file,
      accessToken: normalizeText(raw.accessToken || raw.access_token),
      refreshToken: normalizeText(raw.refreshToken || raw.refresh_token),
      tokenType: normalizeText(raw.tokenType || raw.token_type || 'Bearer') || 'Bearer',
      scope: normalizeText(raw.scope || (Array.isArray(raw.scopes) ? raw.scopes.join(' ') : '')),
      expiresAt: Number(raw.expiresAt || raw.expires_at || 0) || 0,
      createdAt: Number(raw.createdAt || raw.created_at || 0) || 0,
      authorizedAt: Number(raw.authorizedAt || raw.authorized_at || 0) || 0,
    };
  } catch (err) {
    console.warn('[SpotifyToken] ignored invalid token file:', file, err.message);
    return { file, accessToken: '', refreshToken: '', expiresAt: 0, invalid: true };
  }
}

function writeJsonFile(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
}

function saveSpotifyOAuthToken(payload) {
  payload = payload || {};
  const previous = readStoredSpotifyToken();
  const expiresIn = Math.max(60, Number(payload.expires_in || payload.expiresIn) || 3600);
  const now = Date.now();
  const saved = {
    accessToken: normalizeText(payload.access_token || payload.accessToken),
    refreshToken: normalizeText(payload.refresh_token || payload.refreshToken || previous.refreshToken),
    tokenType: normalizeText(payload.token_type || payload.tokenType || 'Bearer') || 'Bearer',
    scope: normalizeText(payload.scope || previous.scope || DEFAULT_SPOTIFY_SCOPES.join(' ')),
    expiresAt: Number(payload.expiresAt || payload.expires_at) || (now + expiresIn * 1000),
    createdAt: now,
    authorizedAt: payload.newAuthorization || payload.new_authorization
      ? now
      : (Number(payload.authorizedAt || payload.authorized_at || previous.authorizedAt || 0) || now),
  };
  if (!saved.accessToken && !saved.refreshToken) {
    const err = new Error('SPOTIFY_TOKEN_MISSING');
    err.code = 'SPOTIFY_TOKEN_MISSING';
    throw err;
  }
  writeJsonFile(getSpotifyTokenFile(), saved);
  spotifyProfileCache = { value: null, at: 0, promise: null };
  return {
    provider: 'spotify',
    loggedIn: !!saved.accessToken,
    tokenConfigured: !!(saved.accessToken || saved.refreshToken),
    expiresAt: saved.expiresAt,
    scope: saved.scope,
  };
}

function clearSpotifyToken() {
  try {
    const file = getSpotifyTokenFile();
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  } catch (err) {
    console.warn('[SpotifyToken] clear skipped:', err.message);
  }
  spotifyProfileCache = { value: null, at: 0, promise: null };
  return { ok: true, provider: 'spotify', loggedIn: false };
}

function getSpotifyOAuthConfig() {
  const fileConfig = readSpotifyFileConfig();
  const envClientId = firstEnv(['SPOTIFY_CLIENT_ID', 'MINERADIO_SPOTIFY_CLIENT_ID']);
  const envClientSecret = firstEnv(['SPOTIFY_CLIENT_SECRET', 'MINERADIO_SPOTIFY_CLIENT_SECRET']);
  const envRedirectUri = firstEnv(['SPOTIFY_REDIRECT_URI', 'MINERADIO_SPOTIFY_REDIRECT_URI']);
  const envScopes = normalizeScopes(firstEnv(['SPOTIFY_SCOPES', 'SPOTIFY_SCOPE', 'MINERADIO_SPOTIFY_SCOPES']));
  const clientId = envClientId || fileConfig.clientId;
  // Desktop PKCE must not depend on a secret stored in the packaged app or user JSON.
  // A client secret is accepted only from a backend-controlled environment for optional client-credentials requests.
  const clientSecret = envClientSecret;
  const redirectUri = envRedirectUri || fileConfig.redirectUri || DEFAULT_SPOTIFY_REDIRECT_URI;
  // Mineradio owns the OAuth flow, so always include the scopes required by
  // the currently exposed account actions. Existing tokens still need a fresh
  // authorization before these newly requested scopes become effective.
  const configuredScopes = envScopes.length ? envScopes : fileConfig.scopes;
  const scopes = uniqueList(DEFAULT_SPOTIFY_SCOPES.concat(configuredScopes || []));
  const market = (firstEnv(['SPOTIFY_MARKET', 'MINERADIO_SPOTIFY_MARKET']) || fileConfig.market || DEFAULT_SPOTIFY_MARKET || 'US').toUpperCase();
  const missing = [];
  if (!clientId) missing.push('SPOTIFY_CLIENT_ID');
  const clientIdValid = spotifyClientIdLooksValid(clientId);
  const redirectCheck = inspectSpotifyRedirectUri(redirectUri);
  return {
    provider: 'spotify',
    configured: missing.length === 0 && clientIdValid && redirectCheck.ok,
    clientId,
    clientSecret,
    redirectUri,
    clientIdValid,
    redirectValid: redirectCheck.ok,
    redirectCheck,
    scopes,
    scope: scopes.join(' '),
    market,
    credentialsFile: fileConfig.file,
    configSource: envClientId || envClientSecret || envRedirectUri || envScopes.length ? 'env' : (fileConfig.source || (redirectUri === DEFAULT_SPOTIFY_REDIRECT_URI ? 'default' : '')),
    missing,
  };
}

function getSpotifyConfig() {
  const oauth = getSpotifyOAuthConfig();
  const token = readStoredSpotifyToken();
  const tokenFileExists = !!(token.file && fs.existsSync(token.file));
  const credentialsFileExists = !!(oauth.credentialsFile && fs.existsSync(oauth.credentialsFile));
  const clientCredentialsConfigured = !!(oauth.clientId && oauth.clientSecret);
  const oauthConfigured = !!(oauth.clientId && oauth.clientIdValid && oauth.redirectUri && oauth.redirectValid);
  const tokenConfigured = !!(token.accessToken || token.refreshToken);
  const localConfigMissing = !tokenConfigured && !oauth.clientId && !credentialsFileExists;
  const spotifyConfigMessage = clientCredentialsConfigured || tokenConfigured
    ? 'Spotify Web API 已接入；播放仍会按匹配源自动换源。'
    : (localConfigMissing
      ? 'Spotify 未连接：请先粘贴一次 Client ID 保存配置，再打开官方 OAuth 授权。'
      : 'Spotify 已保存 Client ID，可直接打开官方 OAuth 授权；桌面端使用 PKCE，不保存 Client Secret。');
  const missing = [];
  if (!oauth.clientId) missing.push('SPOTIFY_CLIENT_ID');
  const clientCredentialsMissing = [];
  if (!oauth.clientId) clientCredentialsMissing.push('SPOTIFY_CLIENT_ID');
  if (!oauth.clientSecret) clientCredentialsMissing.push('SPOTIFY_CLIENT_SECRET');
  return {
    provider: 'spotify',
    configured: !!(clientCredentialsConfigured || oauthConfigured || tokenConfigured),
    loggedIn: false,
    clientId: oauth.clientId,
    clientSecret: oauth.clientSecret,
    redirectUri: oauth.redirectUri,
    clientIdValid: oauth.clientIdValid,
    redirectValid: oauth.redirectValid,
    scopes: oauth.scopes,
    scope: oauth.scope,
    market: oauth.market,
    clientCredentialsConfigured,
    clientCredentialsMissing,
    oauthConfigured,
    oauthMissing: oauth.missing,
    tokenConfigured,
    tokenFileExists,
    tokenReady: !!(token.accessToken && Date.now() < token.expiresAt - 30000),
    authorizedAt: token.authorizedAt || 0,
    tokenFile: token.file,
    credentialsFile: oauth.credentialsFile,
    credentialsFileExists,
    localConfigMissing,
    configSource: oauth.configSource,
    missing,
    playbackMode: 'recommend-match',
    capabilities: {
      search: clientCredentialsConfigured || tokenConfigured,
      metadata: clientCredentialsConfigured || tokenConfigured,
      lyric: false,
      playableUrl: false,
      userPlaylists: tokenConfigured,
      likedTracks: tokenConfigured,
    },
    message: spotifyConfigMessage,
  };
}

function requestText(targetUrl, opts, body) {
  opts = opts || {};
  const timeoutMs = Number(opts.timeoutMs) || 10000;
  const method = opts.method || (body == null ? 'GET' : 'POST');
  const headers = Object.assign({ 'User-Agent': SPOTIFY_UA }, opts.headers || {});
  return new Promise((resolve, reject) => {
    const req = https.request(targetUrl, { method, headers, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(text);
          return;
        }
        const err = new Error('SPOTIFY_HTTP_' + res.statusCode);
        err.statusCode = res.statusCode;
        err.body = text;
        err.retryAfter = res.headers && res.headers['retry-after'];
        reject(err);
      });
    });
    req.on('timeout', () => req.destroy(new Error('SPOTIFY_REQUEST_TIMEOUT')));
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

async function requestJson(targetUrl, opts, body) {
  const text = await requestText(targetUrl, opts, body);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    err.message = 'SPOTIFY_JSON_PARSE_FAILED: ' + err.message;
    throw err;
  }
}

function spotifyErrorDetails(err) {
  err = err || {};
  let apiMessage = '';
  let apiStatus = '';
  let apiReason = '';
  try {
    const body = err.body ? JSON.parse(String(err.body)) : null;
    if (body && body.error) {
      if (typeof body.error === 'string') {
        apiMessage = body.error_description || body.error;
      } else {
        apiMessage = body.error.message || body.error.reason || '';
        apiStatus = body.error.status || '';
        apiReason = body.error.reason || '';
      }
    }
  } catch (parseErr) { }
  const statusCode = Number(err.statusCode || apiStatus || 0) || 0;
  const oauthCode = normalizeText(spotifyTokenErrorBody(err).error);
  const code = normalizeText(err.code || oauthCode || (statusCode ? ('SPOTIFY_HTTP_' + statusCode) : err.message)) || 'SPOTIFY_ERROR';
  let message = apiMessage || normalizeText(err.message) || 'Spotify 请求失败';
  const reauthRequired = !!err.reauthRequired || code === 'SPOTIFY_REAUTH_REQUIRED' || oauthCode === 'invalid_grant';
  if (reauthRequired || statusCode === 401 || code === 'SPOTIFY_REFRESH_TOKEN_MISSING') {
    message = 'Spotify 登录已过期，请重新连接 Spotify。';
  } else if (statusCode === 429) {
    const seconds = Math.max(1, Math.ceil(Number(err.retryAfterMs || spotifyRetryAfterMs(err)) / 1000));
    message = apiReason === 'QUOTA_EXCEEDED'
      ? 'Spotify 开发者账号的共享 API 配额已用完，请稍后再试。'
      : 'Spotify 请求过于频繁，请约 ' + seconds + ' 秒后重试。';
  } else if (statusCode === 403) {
    message = 'Spotify 拒绝了当前开发应用。请确认 App 所有者是 Premium，并且当前登录账号已加入 Users Management。';
  } else if (statusCode === 404) {
    message = 'Spotify 没找到这个歌单，可能已删除、未公开或当前账号无权访问。';
  } else if (statusCode === 500 || statusCode === 502 || statusCode === 503) {
    message = 'Spotify 服务暂时不可用，Mineradio 已完成有限重试，请稍后再试。';
  } else if (/scope|permission|insufficient/i.test(apiMessage || code)) {
    message = 'Spotify 授权权限不够，请重新连接 Spotify 后再同步歌单。';
  }
  return {
    error: code,
    message,
    statusCode,
    spotifyApiMessage: apiMessage,
    spotifyApiReason: apiReason,
    quotaExceeded: apiReason === 'QUOTA_EXCEEDED',
    retryAfterSeconds: Math.max(0, Math.ceil(Number(err.retryAfterMs || spotifyRetryAfterMs(err)) / 1000)),
    reauthRequired,
  };
}

function spotifyUrl(pathname, params) {
  const cleanPath = String(pathname || '').replace(/^\/+/, '');
  const url = new URL(cleanPath, SPOTIFY_API_BASE + '/');
  Object.keys(params || {}).forEach((key) => {
    const value = params[key];
    if (value == null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function spotifyTokenHeaders(config, useClientSecret) {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
  if (useClientSecret && config && config.clientSecret) {
    headers.Authorization = 'Basic ' + Buffer.from(config.clientId + ':' + config.clientSecret).toString('base64');
  }
  return headers;
}

async function requestSpotifyToken(bodyParams, opts) {
  opts = opts || {};
  const config = getSpotifyOAuthConfig();
  if (!config.clientId) {
    const err = new Error('SPOTIFY_CLIENT_ID_REQUIRED');
    err.code = 'SPOTIFY_CLIENT_ID_REQUIRED';
    err.missing = ['SPOTIFY_CLIENT_ID'];
    throw err;
  }
  bodyParams = Object.assign({ client_id: config.clientId }, bodyParams || {});
  const body = new URLSearchParams(bodyParams).toString();
  return requestJson(SPOTIFY_ACCOUNTS_BASE + '/api/token', {
    method: 'POST',
    timeoutMs: 9000,
    headers: spotifyTokenHeaders(config, !!opts.useClientSecret),
  }, body);
}

async function getSpotifyClientCredentialsAccessToken() {
  const config = getSpotifyOAuthConfig();
  if (!config.clientId || !config.clientSecret) {
    const err = new Error('SPOTIFY_CREDENTIALS_REQUIRED');
    err.status = getSpotifyConfig();
    throw err;
  }
  const now = Date.now();
  if (spotifyClientTokenCache.token && now < spotifyClientTokenCache.expiresAt - 30000) return spotifyClientTokenCache.token;
  if (spotifyClientTokenRefreshPromise) return spotifyClientTokenRefreshPromise;
  spotifyClientTokenRefreshPromise = (async () => {
    const json = await requestSpotifyToken({ grant_type: 'client_credentials' }, { useClientSecret: true });
    const token = normalizeText(json && json.access_token);
    if (!token) throw new Error('SPOTIFY_TOKEN_MISSING');
    const expiresIn = Math.max(60, Number(json.expires_in) || 3600);
    spotifyClientTokenCache = { token, expiresAt: Date.now() + expiresIn * 1000 };
    return token;
  })().finally(() => { spotifyClientTokenRefreshPromise = null; });
  return spotifyClientTokenRefreshPromise;
}

function spotifyTokenErrorBody(err) {
  try { return err && err.body ? JSON.parse(String(err.body)) : {}; } catch (_) { return {}; }
}

function spotifyInvalidGrant(err) {
  const body = spotifyTokenErrorBody(err);
  return normalizeText(body && body.error).toLowerCase() === 'invalid_grant';
}

function invalidateSpotifyAccessToken() {
  const stored = readStoredSpotifyToken();
  if (!stored.refreshToken) return clearSpotifyToken();
  writeJsonFile(getSpotifyTokenFile(), {
    accessToken: '',
    refreshToken: stored.refreshToken,
    tokenType: stored.tokenType || 'Bearer',
    scope: stored.scope || DEFAULT_SPOTIFY_SCOPES.join(' '),
    expiresAt: 0,
    createdAt: stored.createdAt || 0,
    authorizedAt: stored.authorizedAt || 0,
  });
  return { ok: true, provider: 'spotify', loggedIn: false, tokenConfigured: true };
}

async function refreshSpotifyUserToken() {
  if (spotifyUserTokenRefreshPromise) return spotifyUserTokenRefreshPromise;
  spotifyUserTokenRefreshPromise = (async () => {
    const stored = readStoredSpotifyToken();
    if (!stored.refreshToken) {
      const err = new Error('SPOTIFY_REFRESH_TOKEN_MISSING');
      err.code = 'SPOTIFY_REFRESH_TOKEN_MISSING';
      err.reauthRequired = true;
      throw err;
    }
    try {
      const json = await requestSpotifyToken({
        grant_type: 'refresh_token',
        refresh_token: stored.refreshToken,
      });
      const token = normalizeText(json && json.access_token);
      if (!token) throw new Error('SPOTIFY_TOKEN_MISSING');
      saveSpotifyOAuthToken(Object.assign({}, json, {
        refresh_token: json.refresh_token || stored.refreshToken,
        scope: json.scope || stored.scope,
        authorizedAt: stored.authorizedAt || 0,
      }));
      return readStoredSpotifyToken();
    } catch (err) {
      if (spotifyInvalidGrant(err)) {
        clearSpotifyToken();
        err.code = 'SPOTIFY_REAUTH_REQUIRED';
        err.reauthRequired = true;
      }
      throw err;
    }
  })().finally(() => { spotifyUserTokenRefreshPromise = null; });
  return spotifyUserTokenRefreshPromise;
}

async function getSpotifyUserAccessToken() {
  let stored = readStoredSpotifyToken();
  if (stored.accessToken && Date.now() < stored.expiresAt - 30000) return stored.accessToken;
  stored = await refreshSpotifyUserToken();
  if (!stored.accessToken) throw new Error('SPOTIFY_TOKEN_MISSING');
  return stored.accessToken;
}

async function getSpotifyApiAccessToken(opts) {
  opts = opts || {};
  if (opts.preferUser !== false) {
    const stored = readStoredSpotifyToken();
    if (stored.accessToken || stored.refreshToken) {
      try {
        return await getSpotifyUserAccessToken();
      } catch (err) {
        if (!getSpotifyConfig().clientCredentialsConfigured) throw err;
      }
    }
  }
  return getSpotifyClientCredentialsAccessToken();
}

function spotifyDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function spotifyRetryAfterMs(err) {
  const seconds = Number(err && err.retryAfter);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1000) : 0;
}

function spotifyTransientError(err) {
  const status = Number(err && err.statusCode || 0);
  return status === 500 || status === 502 || status === 503 ||
    /SPOTIFY_REQUEST_TIMEOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|ETIMEDOUT/i.test(String(err && (err.code || err.message) || ''));
}

async function spotifyUserRequest(pathname, method, params, payload, opts) {
  opts = opts || {};
  method = String(method || 'GET').toUpperCase();
  let token = normalizeText(opts.accessToken) || await getSpotifyUserAccessToken();
  const explicitToken = normalizeText(opts.accessToken);
  let authRetried = false;
  let transientAttempt = 0;
  const body = payload == null ? null : JSON.stringify(payload);
  while (true) {
    try {
      return await requestJson(spotifyUrl(pathname, params || {}), {
        method,
        timeoutMs: opts.timeoutMs || 9000,
        headers: Object.assign({
          Authorization: 'Bearer ' + token,
          Accept: 'application/json',
        }, body == null ? {} : {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        }),
      }, body);
    } catch (err) {
      const status = Number(err && err.statusCode || 0);
      if (status === 401 && !explicitToken && !authRetried) {
        authRetried = true;
        invalidateSpotifyAccessToken();
        token = await getSpotifyUserAccessToken();
        continue;
      }
      if (status === 429) {
        const waitMs = spotifyRetryAfterMs(err);
        err.retryAfterMs = waitMs;
        if (!opts.noRetry && transientAttempt === 0 && waitMs > 0 && waitMs <= SPOTIFY_SHORT_RATE_LIMIT_WAIT_MAX_MS) {
          transientAttempt += 1;
          await spotifyDelay(waitMs);
          continue;
        }
      } else if (!opts.noRetry && transientAttempt < SPOTIFY_TRANSIENT_RETRY_DELAYS_MS.length && spotifyTransientError(err)) {
        const waitMs = SPOTIFY_TRANSIENT_RETRY_DELAYS_MS[transientAttempt] + Math.floor(Math.random() * 120);
        transientAttempt += 1;
        await spotifyDelay(waitMs);
        continue;
      }
      throw err;
    }
  }
}

async function spotifyGet(pathname, params, opts) {
  opts = opts || {};
  const preferUser = opts.userOnly || opts.preferUser !== false;
  const explicitToken = normalizeText(opts.accessToken);
  let token = explicitToken || (opts.userOnly
    ? await getSpotifyUserAccessToken()
    : await getSpotifyApiAccessToken({ preferUser }));
  let authRetried = false;
  let transientAttempt = 0;
  while (true) {
    try {
      return await requestJson(spotifyUrl(pathname, params || {}), {
        timeoutMs: opts.timeoutMs || 9000,
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json',
        },
      });
    } catch (err) {
      const status = Number(err && err.statusCode || 0);
      if (status === 401 && !explicitToken && !authRetried) {
        authRetried = true;
        const stored = readStoredSpotifyToken();
        if (opts.userOnly || (preferUser && (stored.accessToken || stored.refreshToken))) {
          invalidateSpotifyAccessToken();
          token = await getSpotifyUserAccessToken();
        } else {
          spotifyClientTokenCache = { token: '', expiresAt: 0 };
          token = await getSpotifyClientCredentialsAccessToken();
        }
        continue;
      }
      if (status === 429) {
        const waitMs = spotifyRetryAfterMs(err);
        err.retryAfterMs = waitMs;
        if (!opts.noRetry && transientAttempt === 0 && waitMs > 0 && waitMs <= SPOTIFY_SHORT_RATE_LIMIT_WAIT_MAX_MS) {
          transientAttempt += 1;
          await spotifyDelay(waitMs);
          continue;
        }
      } else if (!opts.noRetry && transientAttempt < SPOTIFY_TRANSIENT_RETRY_DELAYS_MS.length && spotifyTransientError(err)) {
        const waitMs = SPOTIFY_TRANSIENT_RETRY_DELAYS_MS[transientAttempt] + Math.floor(Math.random() * 120);
        transientAttempt += 1;
        await spotifyDelay(waitMs);
        continue;
      }
      throw err;
    }
  }
}

async function spotifyUserGet(pathname, params, opts) {
  opts = opts || {};
  return spotifyGet(pathname, params, Object.assign({}, opts, { userOnly: true, preferUser: true }));
}

function cacheWrap(map, key, ttlMs, loader) {
  const now = Date.now();
  const cached = map.get(key);
  if (cached && now - cached.at < ttlMs) return Promise.resolve(cached.value);
  if (spotifySearchInflight.has(key)) return spotifySearchInflight.get(key);
  const promise = Promise.resolve(loader()).then((value) => {
    map.set(key, { at: Date.now(), value });
    if (map.size > 80) {
      const oldest = [...map.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) map.delete(oldest[0]);
    }
    return value;
  }).finally(() => spotifySearchInflight.delete(key));
  spotifySearchInflight.set(key, promise);
  return promise;
}

function spotifyImage(images) {
  images = Array.isArray(images) ? images.filter(item => item && item.url) : [];
  if (!images.length) return '';
  const sorted = images.slice().sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0));
  return sorted[0].url || '';
}

function mapSpotifyTrack(track, index, query) {
  track = track || {};
  const id = normalizeText(track.id);
  const name = normalizeText(track.name);
  if (!id || !name || track.is_local) return null;
  const album = track.album || {};
  const artists = Array.isArray(track.artists) ? track.artists.map(artist => ({
    id: normalizeText(artist && artist.id),
    name: normalizeText(artist && artist.name),
    mid: normalizeText(artist && artist.id),
    uri: normalizeText(artist && artist.uri),
  })).filter(artist => artist.name) : [];
  const artistText = artists.map(artist => artist.name).join(' / ');
  return {
    provider: 'spotify',
    source: 'spotify',
    type: 'spotify',
    id,
    providerSongId: id,
    spotifyId: id,
    uri: normalizeText(track.uri),
    spotifyUri: normalizeText(track.uri),
    spotifyUrl: track.external_urls && track.external_urls.spotify || '',
    name,
    artist: artistText,
    artists,
    album: normalizeText(album.name),
    albumId: normalizeText(album.id),
    albumUri: normalizeText(album.uri),
    cover: spotifyImage(album.images),
    duration: Math.max(0, Math.round((Number(track.duration_ms) || 0) / 1000)),
    durationMs: Number(track.duration_ms) || 0,
    popularity: Number(track.popularity || 0) || 0,
    explicit: !!track.explicit,
    fee: 0,
    playable: false,
    playbackMode: 'recommend-match',
    recommendationSource: 'spotify-web-api',
    spotifyRank: index,
    spotifyQuery: query || '',
    previewUrl: track.preview_url || '',
    restriction: {
      category: 'provider_limited',
      reason: 'spotify_metadata_only',
      message: 'Spotify 官方 Web API 当前作为搜索/歌单资料源接入，播放会自动寻找其它可播版本。',
      action: 'switch_source',
    },
  };
}

function dedupeSpotifySongs(songs) {
  const out = [];
  const seen = new Set();
  (songs || []).forEach((song) => {
    const key = (song.id || '') + '|' + normalizeText(song.name).toLowerCase() + '|' + normalizeText(song.artist).toLowerCase();
    if (!song || !song.name || seen.has(key)) return;
    seen.add(key);
    out.push(song);
  });
  return out;
}

function normalizeSpotifyProfile(profile) {
  profile = profile || {};
  const product = normalizeText(profile.product || '').toLowerCase();
  const isPremium = product === 'premium';
  return {
    userId: normalizeText(profile.id),
    accountId: normalizeText(profile.account_id),
    nickname: normalizeText(profile.display_name || 'Spotify'),
    avatar: spotifyImage(profile.images),
    country: normalizeText(profile.country),
    product: product || 'unknown',
    vipType: isPremium ? 1 : 0,
    vipLevel: isPremium ? 'vip' : 'none',
    vipLabel: isPremium ? 'Premium' : (product ? product.toUpperCase() : '方案未知'),
    membershipKnown: !!product,
    isVip: isPremium,
    isSvip: false,
  };
}

async function getSpotifyProfile(options) {
  options = options || {};
  const now = Date.now();
  if (!options.force && spotifyProfileCache.value && now - spotifyProfileCache.at < SPOTIFY_PROFILE_CACHE_TTL_MS) {
    return spotifyProfileCache.value;
  }
  if (spotifyProfileCache.promise) return spotifyProfileCache.promise;
  spotifyProfileCache.promise = spotifyUserGet('/me', {}, { timeoutMs: options.timeoutMs || 9000 })
    .then((profile) => {
      spotifyProfileCache.value = profile || {};
      spotifyProfileCache.at = Date.now();
      return spotifyProfileCache.value;
    })
    .finally(() => { spotifyProfileCache.promise = null; });
  return spotifyProfileCache.promise;
}

function buildSpotifyOAuthAuthorizeUrl(options) {
  options = options || {};
  const config = getSpotifyOAuthConfig();
  if (!config.configured) {
    const err = new Error('SPOTIFY_OAUTH_NOT_CONFIGURED');
    err.code = 'SPOTIFY_OAUTH_NOT_CONFIGURED';
    err.missing = config.missing;
    throw err;
  }
  const codeChallenge = normalizeText(options.codeChallenge || options.code_challenge);
  if (!codeChallenge) {
    const err = new Error('SPOTIFY_PKCE_CHALLENGE_REQUIRED');
    err.code = 'SPOTIFY_PKCE_CHALLENGE_REQUIRED';
    throw err;
  }
  const redirectUri = normalizeText(options.redirectUri || config.redirectUri);
  const url = new URL('/authorize', SPOTIFY_ACCOUNTS_BASE + '/');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('scope', normalizeText(options.scope || config.scope || DEFAULT_SPOTIFY_SCOPES.join(' ')));
  if (options.state) url.searchParams.set('state', String(options.state));
  if (options.showDialog) url.searchParams.set('show_dialog', 'true');
  return url.toString();
}

async function exchangeSpotifyOAuthCode(options) {
  options = options || {};
  const config = getSpotifyOAuthConfig();
  if (!config.configured) {
    const err = new Error('SPOTIFY_OAUTH_NOT_CONFIGURED');
    err.code = 'SPOTIFY_OAUTH_NOT_CONFIGURED';
    err.missing = config.missing;
    throw err;
  }
  const code = normalizeText(options.code);
  const codeVerifier = normalizeText(options.codeVerifier || options.code_verifier);
  if (!code) throw new Error('SPOTIFY_OAUTH_CODE_MISSING');
  if (!codeVerifier) throw new Error('SPOTIFY_PKCE_VERIFIER_MISSING');
  const json = await requestSpotifyToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: normalizeText(options.redirectUri || config.redirectUri),
    code_verifier: codeVerifier,
  });
  saveSpotifyOAuthToken(Object.assign({}, json, { newAuthorization: true }));
  return handleSpotifyStatus();
}

async function handleSpotifyStatus() {
  const config = getSpotifyConfig();
  const token = readStoredSpotifyToken();
  let profile = null;
  let profileError = '';
  let profileErrorDetail = null;
  let loggedIn = false;
  if (token.accessToken || token.refreshToken) {
    try {
      profile = await getSpotifyProfile({ timeoutMs: 9000 });
      loggedIn = true;
    } catch (err) {
      profileError = err.message || 'SPOTIFY_PROFILE_FAILED';
      profileErrorDetail = spotifyErrorDetails(err);
    }
  }
  const currentToken = readStoredSpotifyToken();
  const tokenScopes = normalizeScopes(currentToken.scope);
  const missingWriteScopes = [
    'user-library-modify',
    'playlist-modify-private',
    'playlist-modify-public',
  ].filter(scope => !tokenScopes.includes(scope));
  const normalized = normalizeSpotifyProfile(profile);
  return Object.assign({}, config, normalized, {
    clientSecret: '',
    loggedIn,
    configured: !!(config.configured || loggedIn),
    profileReady: loggedIn,
    tokenConfigured: !!(currentToken.accessToken || currentToken.refreshToken),
    tokenReady: !!(currentToken.accessToken && Date.now() < currentToken.expiresAt - 30000),
    authorizedAt: currentToken.authorizedAt || 0,
    stale: !!(!loggedIn && (currentToken.accessToken || currentToken.refreshToken)),
    reauthRequired: !!(profileErrorDetail && profileErrorDetail.reauthRequired),
    error: profileErrorDetail && profileErrorDetail.error || profileError || '',
    errorMessage: profileErrorDetail && profileErrorDetail.message || '',
    capabilities: Object.assign({}, config.capabilities, {
      search: !!(config.clientCredentialsConfigured || loggedIn),
      metadata: !!(config.clientCredentialsConfigured || loggedIn),
      userPlaylists: loggedIn,
      likedTracks: loggedIn,
      likeWrite: loggedIn && tokenScopes.includes('user-library-modify'),
      playlistWrite: loggedIn && (
        tokenScopes.includes('playlist-modify-private') ||
        tokenScopes.includes('playlist-modify-public')
      ),
      lyric: false,
      playableUrl: false,
    }),
    missingWriteScopes,
    accountWriteReady: loggedIn && missingWriteScopes.length === 0,
    message: loggedIn
      ? (missingWriteScopes.length
        ? 'Spotify 已连接；重新授权一次后可写入喜欢和歌单。播放仍会自动换源。'
        : 'Spotify 登录态已保存，可同步会员状态、喜欢和歌单；播放仍会自动换源。')
      : config.message,
  });
}

async function handleSpotifySetupDiagnostics() {
  const config = getSpotifyConfig();
  const token = readStoredSpotifyToken();
  const tokenScopes = normalizeScopes(token.scope);
  const checks = [];
  const push = (id, ok, title, message, extra) => {
    checks.push(Object.assign({ id, ok: !!ok, title, message: normalizeText(message) }, extra || {}));
  };

  push(
    'client',
    !!(config.clientId && config.clientIdValid),
    'Client ID',
    config.clientId && config.clientIdValid ? 'Client ID 格式有效并已安全保存在本机。' : '请粘贴 Spotify Dashboard 中的 Client ID。'
  );
  push(
    'redirect',
    !!config.redirectValid,
    '回调地址',
    config.redirectValid
      ? '回调地址符合 Spotify 的 127.0.0.1 精确匹配规则。'
      : '回调必须使用 Mineradio 显示的 127.0.0.1 地址。',
    { redirectUri: config.redirectUri }
  );
  push(
    'token',
    !!(token.accessToken || token.refreshToken),
    'OAuth 授权',
    token.accessToken || token.refreshToken ? '已取得并保存 PKCE 用户授权。' : '尚未从 Spotify 收到用户授权。'
  );

  let profile = null;
  let profileDetail = null;
  if (token.accessToken || token.refreshToken) {
    try {
      profile = await getSpotifyProfile({ force: true, timeoutMs: 9000 });
      push('profile', true, '账号验证', '已通过 Spotify /me 验证：' + normalizeText(profile.display_name || profile.id || 'Spotify 用户') + '。');
    } catch (err) {
      profileDetail = spotifyErrorDetails(err);
      push('profile', false, '账号验证', profileDetail.message, profileDetail);
    }
  } else {
    push('profile', false, '账号验证', '完成 OAuth 授权后由 Mineradio 自动验证。');
  }

  const requiredReadScopes = ['user-read-private', 'user-library-read', 'playlist-read-private'];
  const missingReadScopes = requiredReadScopes.filter(scope => !tokenScopes.includes(scope));
  push(
    'scopes',
    !!profile && missingReadScopes.length === 0,
    '权限范围',
    !profile
      ? '等待账号验证。'
      : (missingReadScopes.length ? '缺少权限：' + missingReadScopes.join(', ') + '，请重新授权。' : '账号方案、喜欢歌曲和私人歌单权限齐全。'),
    { missingScopes: missingReadScopes }
  );

  let libraryReady = false;
  let playlistsReady = false;
  if (profile && missingReadScopes.length === 0) {
    try {
      await spotifyUserGet('/me/tracks', { limit: 1, offset: 0, market: config.market }, { timeoutMs: 9000 });
      libraryReady = true;
      push('library', true, '喜欢歌曲', 'Liked Songs 接口已接通。');
    } catch (err) {
      const detail = spotifyErrorDetails(err);
      push('library', false, '喜欢歌曲', detail.message, detail);
    }
    try {
      await spotifyUserGet('/me/playlists', { limit: 1, offset: 0 }, { timeoutMs: 9000 });
      playlistsReady = true;
      push('playlists', true, '歌单接口', '个人歌单接口已接通。');
    } catch (err) {
      const detail = spotifyErrorDetails(err);
      push('playlists', false, '歌单接口', detail.message, detail);
    }
  } else {
    push('library', false, '喜欢歌曲', '权限验证通过后自动检测。');
    push('playlists', false, '歌单接口', '权限验证通过后自动检测。');
  }

  const ready = !!(profile && !missingReadScopes.length && libraryReady && playlistsReady);
  return {
    provider: 'spotify',
    ok: ready,
    ready,
    loggedIn: !!profile,
    configured: config.oauthConfigured,
    clientId: config.clientId,
    clientIdValid: config.clientIdValid,
    redirectUri: config.redirectUri,
    redirectValid: config.redirectValid,
    nickname: normalizeText(profile && (profile.display_name || profile.id)),
    product: normalizeText(profile && profile.product).toLowerCase() || 'unknown',
    checks,
    currentStep: !config.oauthConfigured ? 1 : (!(token.accessToken || token.refreshToken) ? 3 : (ready ? 4 : 3)),
    message: ready
      ? 'Spotify 账号、喜欢歌曲和歌单接口均已接通。'
      : (profileDetail && profileDetail.message || '按当前步骤继续，Mineradio 会在每一步自动检测。'),
  };
}

async function handleSpotifySearch(keywords, limit, offset) {
  keywords = normalizeText(keywords);
  limit = Math.max(1, Math.min(20, Number(limit) || 8));
  offset = Math.max(0, Number(offset) || 0);
  const status = getSpotifyConfig();
  if (!keywords) return { provider: 'spotify', configured: status.configured, songs: [], message: status.message };
  if (!status.capabilities.search) {
    return {
      provider: 'spotify',
      configured: status.configured,
      songs: [],
      error: 'SPOTIFY_AUTH_REQUIRED',
      reason: 'missing_spotify_auth',
      message: status.message,
      missing: status.oauthMissing && status.oauthMissing.length ? status.oauthMissing : status.missing,
    };
  }
  const cacheKey = [keywords.toLowerCase(), limit, offset, status.market, status.tokenConfigured ? 'user' : 'client'].join('|');
  return cacheWrap(spotifySearchCache, cacheKey, 2 * 60 * 1000, async () => {
    const pages = [];
    let pageOffset = offset;
    let hasMore = false;
    let total = 0;
    while (pages.length < limit) {
      const pageLimit = Math.min(SPOTIFY_SEARCH_LIMIT_MAX, limit - pages.length);
      const json = await spotifyGet('/search', {
        q: keywords,
        type: 'track',
        market: status.market,
        limit: pageLimit,
        offset: pageOffset,
      }, { timeoutMs: 9000, preferUser: true });
      const items = json && json.tracks && Array.isArray(json.tracks.items) ? json.tracks.items : [];
      pages.push(...items);
      total = Number(json && json.tracks && json.tracks.total) || total;
      hasMore = !!(json && json.tracks && json.tracks.next);
      if (!items.length || !hasMore) break;
      pageOffset += items.length;
    }
    const songs = dedupeSpotifySongs(pages.map((item, index) => mapSpotifyTrack(item, index, keywords)).filter(Boolean)).slice(0, limit);
    return {
      provider: 'spotify',
      configured: true,
      market: status.market,
      songs,
      rawCount: pages.length,
      total,
      offset,
      limit,
      nextOffset: offset + pages.length,
      hasMore,
      message: songs.length ? '' : 'Spotify 没有返回匹配结果。',
    };
  });
}

async function handleSpotifyRecommendations(limit) {
  limit = Math.max(1, Math.min(SPOTIFY_SEARCH_LIMIT_MAX, Number(limit) || 10));
  const status = getSpotifyConfig();
  const token = readStoredSpotifyToken();
  const scopes = normalizeScopes(token.scope);
  if (!token.accessToken && !token.refreshToken) {
    return {
      provider: 'spotify',
      loggedIn: false,
      songs: [],
      mode: 'unavailable',
      provenance: 'spotify-web-api',
      error: 'SPOTIFY_AUTH_REQUIRED',
      message: '连接 Spotify 后显示你的常听歌曲。',
    };
  }
  let items = [];
  let mode = '';
  if (scopes.includes('user-top-read')) {
    try {
      const json = await spotifyUserGet('/me/top/tracks', {
        limit,
        offset: 0,
        time_range: 'medium_term',
      }, { timeoutMs: 9000 });
      items = json && Array.isArray(json.items) ? json.items : [];
      mode = 'personal-top';
    } catch (err) {
      console.warn('[SpotifyRecommendations] top tracks:', err.message);
    }
  }
  if (!items.length && scopes.includes('user-library-read')) {
    try {
      const json = await spotifyUserGet('/me/tracks', {
        limit,
        offset: 0,
        market: status.market,
      }, { timeoutMs: 9000 });
      const rows = json && Array.isArray(json.items) ? json.items : [];
      items = rows.map(row => row && row.track).filter(Boolean);
      mode = 'liked-affinity';
    } catch (err) {
      console.warn('[SpotifyRecommendations] liked tracks:', err.message);
    }
  }
  const songs = dedupeSpotifySongs(items.map((item, index) => mapSpotifyTrack(item, index, 'personal')).filter(Boolean)).slice(0, limit);
  return {
    provider: 'spotify',
    loggedIn: true,
    songs,
    mode: mode || 'unavailable',
    provenance: 'spotify-web-api',
    updatedAt: Date.now(),
    message: songs.length ? '' : '当前授权没有可读取的常听或喜欢歌曲；重新连接 Spotify 可启用个人推荐。',
  };
}

function mapSpotifyPlaylist(item, profile) {
  item = item || {};
  const id = normalizeText(item.id);
  if (!id) return null;
  const owner = item.owner || {};
  const ownerId = normalizeText(owner.id);
  const profileId = normalizeText(profile && profile.id);
  const owned = !!(profileId && ownerId === profileId);
  return {
    provider: 'spotify',
    source: 'spotify',
    id,
    name: normalizeText(item.name || 'Spotify Playlist'),
    cover: spotifyImage(item.images),
    creator: normalizeText(owner.display_name || owner.id || 'Spotify'),
    trackCount: Number(item.items && item.items.total) || Number(item.tracks && item.tracks.total) || 0,
    playCount: 0,
    subscribed: !owned,
    shelfPane: owned ? 'mine' : 'fav',
    public: item.public,
    collaborative: !!item.collaborative,
    spotifyUrl: item.external_urls && item.external_urls.spotify || '',
    spotifyUri: normalizeText(item.uri),
  };
}

async function buildSpotifyLikedPlaylistCard(profile) {
  try {
    const json = await spotifyUserGet('/me/tracks', { limit: 1, offset: 0, market: getSpotifyConfig().market }, { timeoutMs: 9000 });
    const first = json && Array.isArray(json.items) && json.items[0] && json.items[0].track;
    return {
      provider: 'spotify',
      source: 'spotify',
      id: SPOTIFY_LIKED_PLAYLIST_ID,
      virtual: true,
      name: 'Spotify 喜欢的歌曲',
      cover: first ? spotifyImage(first.album && first.album.images) : '',
      creator: normalizeText(profile && (profile.display_name || profile.id)) || 'Spotify',
      trackCount: Number(json && json.total) || 0,
      playCount: 0,
      subscribed: false,
      shelfPane: 'fav',
    };
  } catch (err) {
    const detail = spotifyErrorDetails(err);
    return {
      provider: 'spotify',
      source: 'spotify',
      id: SPOTIFY_LIKED_PLAYLIST_ID,
      virtual: true,
      name: 'Spotify 喜欢的歌曲',
      cover: '',
      creator: normalizeText(profile && (profile.display_name || profile.id)) || 'Spotify',
      trackCount: 0,
      playCount: 0,
      subscribed: false,
      shelfPane: 'fav',
      warning: detail.message,
      error: detail.error,
      message: detail.message,
    };
  }
}

async function handleSpotifyUserPlaylists(options) {
  options = options || {};
  const status = await handleSpotifyStatus();
  if (!status.loggedIn) {
    return { provider: 'spotify', loggedIn: false, playlists: [], message: status.message, error: status.error || '' };
  }
  const profile = await getSpotifyProfile({ timeoutMs: 9000 });
  const maxTotal = Math.max(1, Math.min(500, Number(options.limit) || 300));
  const playlists = [];
  const startOffset = Math.max(0, Number(options.offset) || 0);
  let offset = startOffset;
  let playlistError = null;
  let lastPage = null;
  try {
    while (playlists.length < maxTotal) {
      const pageLimit = Math.min(SPOTIFY_PLAYLIST_PAGE_LIMIT, maxTotal - playlists.length);
      const json = await spotifyUserGet('/me/playlists', { limit: pageLimit, offset }, { timeoutMs: 9000 });
      lastPage = json;
      const items = Array.isArray(json && json.items) ? json.items : [];
      items.forEach((item) => {
        const mapped = mapSpotifyPlaylist(item, profile);
        if (mapped) playlists.push(mapped);
      });
      if (!items.length || !(json && json.next)) break;
      offset += items.length;
    }
  } catch (err) {
    playlistError = spotifyErrorDetails(err);
  }
  const likedCard = await buildSpotifyLikedPlaylistCard(profile);
  const total = Math.max(playlists.length + startOffset, Number(lastPage && lastPage.total) || 0) + 1;
  const nextOffset = startOffset + playlists.length;
  return {
    provider: 'spotify',
    loggedIn: true,
    userId: normalizeText(profile && profile.id),
    playlists: (startOffset === 0 ? [likedCard] : []).concat(playlists),
    total,
    offset: startOffset,
    limit: maxTotal,
    nextOffset,
    hasMore: !!(lastPage && lastPage.next) && nextOffset < total,
    partial: true,
    error: playlistError && playlistError.error || '',
    message: playlistError && playlistError.message || '',
  };
}

async function handleSpotifyPlaylistTracks(playlistId, opts) {
  opts = opts || {};
  playlistId = normalizeText(playlistId);
  const status = await handleSpotifyStatus();
  if (!status.loggedIn) {
    return { provider: 'spotify', loggedIn: false, playlist: { id: playlistId, provider: 'spotify', name: '' }, tracks: [], message: status.message, error: status.error || '' };
  }
  const limit = Math.max(1, Math.min(SPOTIFY_PLAYLIST_PAGE_LIMIT, Number(opts.limit) || 48));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const market = normalizeText(opts.market || status.market || DEFAULT_SPOTIFY_MARKET);
  if (!playlistId || playlistId === SPOTIFY_LIKED_PLAYLIST_ID || playlistId === 'liked') {
    let json = null;
    try {
      json = await spotifyUserGet('/me/tracks', { limit, offset, market }, { timeoutMs: 12000 });
    } catch (err) {
      const detail = spotifyErrorDetails(err);
      return Object.assign({
        provider: 'spotify',
        loggedIn: true,
        playlist: {
          provider: 'spotify',
          id: SPOTIFY_LIKED_PLAYLIST_ID,
          name: 'Spotify 喜欢的歌曲',
          trackCount: 0,
        },
        tracks: [],
        total: 0,
        offset,
        limit,
        nextOffset: offset,
        hasMore: false,
        partial: true,
      }, detail);
    }
    const items = Array.isArray(json && json.items) ? json.items : [];
    const tracks = items.map((item, index) => mapSpotifyTrack(item && item.track, offset + index, 'liked')).filter(Boolean);
    return {
      provider: 'spotify',
      loggedIn: true,
      playlist: {
        provider: 'spotify',
        id: SPOTIFY_LIKED_PLAYLIST_ID,
        name: 'Spotify 喜欢的歌曲',
        trackCount: Number(json && json.total) || tracks.length,
      },
      tracks,
      total: Number(json && json.total) || tracks.length,
      offset,
      limit,
      nextOffset: offset + items.length,
      hasMore: !!(json && json.next),
      partial: true,
    };
  }
  let json = null;
  try {
    json = await spotifyUserGet('/playlists/' + encodeURIComponent(playlistId) + '/items', { limit, offset, market }, { timeoutMs: 12000 });
  } catch (err) {
    const detail = spotifyErrorDetails(err);
    if (detail.statusCode === 403) {
      const storedScopes = normalizeScopes(readStoredSpotifyToken().scope);
      const requiredScopes = ['playlist-read-private', 'playlist-read-collaborative'];
      const missingScopes = requiredScopes.filter(scope => !storedScopes.includes(scope));
      if (missingScopes.length) {
        detail.message = 'Spotify 当前授权缺少歌单读取范围，请在账号页重新授权后再试。';
        detail.error = 'SPOTIFY_PLAYLIST_SCOPE_REQUIRED';
        detail.missingScopes = missingScopes;
      } else {
        detail.message = 'Spotify 当前只允许展开本账号自己创建或参与协作的歌单；关注的他人歌单只能同步名称和封面。';
        detail.error = 'SPOTIFY_PLAYLIST_ITEMS_RESTRICTED';
      }
    }
    return Object.assign({
      provider: 'spotify',
      loggedIn: true,
      playlist: {
        provider: 'spotify',
        id: playlistId,
        name: '',
        trackCount: 0,
      },
      tracks: [],
      total: 0,
      offset,
      limit,
      nextOffset: offset,
      hasMore: false,
      partial: true,
    }, detail);
  }
  const items = Array.isArray(json && json.items) ? json.items : [];
  const tracks = items.map((entry, index) => {
    const item = entry && (entry.item || entry.track);
    if (item && item.type && item.type !== 'track') return null;
    return mapSpotifyTrack(item, offset + index, playlistId);
  }).filter(Boolean);
  return {
    provider: 'spotify',
    loggedIn: true,
    playlist: {
      provider: 'spotify',
      id: playlistId,
      name: '',
      trackCount: Number(json && json.total) || tracks.length,
    },
    tracks,
    total: Number(json && json.total) || tracks.length,
    offset,
    limit,
    nextOffset: offset + items.length,
    hasMore: !!(json && json.next),
    partial: true,
  };
}

async function handleSpotifyAlbumDetail(albumId, opts) {
  opts = opts || {};
  const id = normalizeText(albumId);
  const limit = Math.max(1, Math.min(100, parseInt(opts.limit || '80', 10) || 80));
  const market = normalizeText(opts.market || getSpotifyConfig().market);
  if (!id) return { provider: 'spotify', error: 'MISSING_ALBUM_ID', album: null, songs: [] };
  const params = market ? { market } : {};
  const album = await spotifyGet('/albums/' + encodeURIComponent(id), params, { timeoutMs: 12000 });
  const albumInfo = {
    provider: 'spotify',
    id: normalizeText(album && album.id) || id,
    albumId: normalizeText(album && album.id) || id,
    name: normalizeText(album && album.name),
    artist: Array.isArray(album && album.artists) ? album.artists.map(artist => normalizeText(artist && artist.name)).filter(Boolean).join(' / ') : '',
    artists: Array.isArray(album && album.artists) ? album.artists.map(artist => ({ id: normalizeText(artist && artist.id), name: normalizeText(artist && artist.name), uri: normalizeText(artist && artist.uri) })).filter(artist => artist.name) : [],
    cover: spotifyImage(album && album.images),
    releaseDate: normalizeText(album && album.release_date),
    trackCount: Number(album && album.total_tracks) || 0,
    spotifyUrl: album && album.external_urls && album.external_urls.spotify || '',
    spotifyUri: normalizeText(album && album.uri),
  };
  let items = album && album.tracks && Array.isArray(album.tracks.items) ? album.tracks.items.slice() : [];
  let offset = items.length;
  while (items.length < limit && album && album.tracks && album.tracks.next) {
    const page = await spotifyGet('/albums/' + encodeURIComponent(id) + '/tracks', {
      limit: Math.min(50, limit - items.length),
      offset,
      ...(market ? { market } : {}),
    }, { timeoutMs: 12000 });
    const pageItems = Array.isArray(page && page.items) ? page.items : [];
    items = items.concat(pageItems);
    offset += pageItems.length;
    if (!page || !page.next || !pageItems.length) break;
  }
  const songs = items.slice(0, limit).map((track, index) => {
    if (!track) return null;
    return mapSpotifyTrack(Object.assign({}, track, {
      album: {
        id: albumInfo.albumId,
        name: albumInfo.name,
        uri: albumInfo.spotifyUri,
        images: album && album.images,
      },
    }), index, 'album:' + id);
  }).filter(Boolean);
  return {
    provider: 'spotify',
    album: albumInfo,
    songs,
    total: albumInfo.trackCount || songs.length,
  };
}

function spotifyLibraryUri(type, value) {
  type = normalizeText(type || 'track').toLowerCase();
  value = normalizeText(value && typeof value === 'object'
    ? (value.spotifyUri || value.uri || value.spotifyId || value.providerSongId || value.albumId || value.id)
    : value);
  if (/^spotify:(?:track|album|playlist|episode|show|audiobook|artist|user):[^:]+$/i.test(value)) return value;
  value = value.replace(/^spotify:(?:track|album|playlist):/i, '');
  if (!/^(?:track|album|playlist|episode|show|audiobook|artist|user)$/.test(type) || !value) return '';
  return 'spotify:' + type + ':' + value;
}

function requireSpotifyScopes(required) {
  required = uniqueList(required);
  const granted = normalizeScopes(readStoredSpotifyToken().scope);
  const missing = required.filter(scope => !granted.includes(scope));
  if (!missing.length) return;
  const err = new Error('SPOTIFY_WRITE_SCOPE_REQUIRED');
  err.code = 'SPOTIFY_WRITE_SCOPE_REQUIRED';
  err.statusCode = 403;
  err.missingScopes = missing;
  err.reauthRequired = true;
  throw err;
}

async function handleSpotifyLibraryCheck(type, values) {
  const raw = Array.isArray(values) ? values : String(values == null ? '' : values).split(',');
  const pairs = raw.map(value => ({
    id: normalizeText(value && typeof value === 'object'
      ? (value.spotifyId || value.providerSongId || value.albumId || value.id || value.spotifyUri || value.uri)
      : value),
    uri: spotifyLibraryUri(type, value),
  })).filter(item => item.id && item.uri).slice(0, 40);
  if (!pairs.length) return { provider: 'spotify', ids: [], liked: {} };
  const result = await spotifyUserGet('/me/library/contains', {
    uris: pairs.map(item => item.uri).join(','),
  }, { timeoutMs: 9000 });
  const valuesOut = Array.isArray(result) ? result : [];
  const liked = {};
  pairs.forEach((item, index) => { liked[item.id] = !!valuesOut[index]; });
  return {
    provider: 'spotify',
    loggedIn: true,
    ids: pairs.map(item => item.id),
    liked,
  };
}

async function handleSpotifyLibrarySet(type, value, saved) {
  requireSpotifyScopes(['user-library-modify']);
  const uri = spotifyLibraryUri(type, value);
  if (!uri) {
    const err = new Error('SPOTIFY_ITEM_ID_REQUIRED');
    err.code = 'SPOTIFY_ITEM_ID_REQUIRED';
    throw err;
  }
  await spotifyUserRequest('/me/library', saved === false ? 'DELETE' : 'PUT', { uris: uri }, null, { timeoutMs: 9000 });
  return {
    provider: 'spotify',
    loggedIn: true,
    id: uri.split(':').pop(),
    uri,
    liked: saved !== false,
    saved: saved !== false,
    success: true,
  };
}

async function handleSpotifyPlaylistAddSong(playlistId, song) {
  const tokenScopes = normalizeScopes(readStoredSpotifyToken().scope);
  if (!tokenScopes.includes('playlist-modify-private') && !tokenScopes.includes('playlist-modify-public')) {
    requireSpotifyScopes(['playlist-modify-private']);
  }
  playlistId = normalizeText(playlistId).replace(/^spotify:/i, '');
  const uri = spotifyLibraryUri('track', song);
  if (!playlistId || !uri) {
    const err = new Error('SPOTIFY_PLAYLIST_OR_TRACK_REQUIRED');
    err.code = 'SPOTIFY_PLAYLIST_OR_TRACK_REQUIRED';
    throw err;
  }
  const result = await spotifyUserRequest(
    '/playlists/' + encodeURIComponent(playlistId) + '/items',
    'POST',
    {},
    { uris: [uri] },
    { timeoutMs: 10000 }
  );
  return {
    provider: 'spotify',
    loggedIn: true,
    pid: playlistId,
    id: uri.split(':').pop(),
    uri,
    snapshotId: normalizeText(result && result.snapshot_id),
    success: true,
  };
}

async function handleSpotifyCreatePlaylist(name, opts) {
  opts = opts || {};
  name = normalizeText(name);
  if (!name) {
    const err = new Error('SPOTIFY_PLAYLIST_NAME_REQUIRED');
    err.code = 'SPOTIFY_PLAYLIST_NAME_REQUIRED';
    throw err;
  }
  const isPublic = opts.public === true;
  requireSpotifyScopes([isPublic ? 'playlist-modify-public' : 'playlist-modify-private']);
  const profile = await getSpotifyProfile({ timeoutMs: 9000 });
  const created = await spotifyUserRequest('/me/playlists', 'POST', {}, {
    name,
    public: isPublic,
    collaborative: false,
    description: normalizeText(opts.description || 'Created with Mineradio'),
  }, { timeoutMs: 10000 });
  return {
    provider: 'spotify',
    loggedIn: true,
    playlist: mapSpotifyPlaylist(created, profile),
    body: created,
    success: true,
  };
}

async function handleSpotifySongUrl(track) {
  const id = normalizeText(track && (track.id || track.providerSongId || track.spotifyId));
  return {
    provider: 'spotify',
    id,
    url: '',
    playable: false,
    playbackMode: 'recommend-match',
    reason: 'provider_limited',
    restriction: {
      category: 'provider_limited',
      reason: 'spotify_metadata_only',
      message: 'Spotify 官方 Web API 不提供可交给 Mineradio 播放的音频直链，正在自动换源。',
      action: 'switch_source',
    },
  };
}

async function handleSpotifyLyric(id) {
  return {
    provider: 'spotify',
    id: normalizeText(id),
    lyric: '',
    tlyric: '',
    yrc: '',
    ytlrc: '',
    source: 'none',
    message: 'Spotify Web API 不提供歌词，Mineradio 会沿用跨平台歌词兜底。',
  };
}

function resetSpotifyRuntimeStateForTests() {
  spotifyClientTokenCache = { token: '', expiresAt: 0 };
  spotifyClientTokenRefreshPromise = null;
  spotifyUserTokenRefreshPromise = null;
  spotifyProfileCache = { value: null, at: 0, promise: null };
  spotifySearchCache.clear();
  spotifySearchInflight.clear();
}

module.exports = {
  getSpotifyConfig,
  getSpotifyOAuthConfig,
  saveSpotifyConfig,
  buildSpotifyOAuthAuthorizeUrl,
  exchangeSpotifyOAuthCode,
  saveSpotifyOAuthToken,
  clearSpotifyToken,
  handleSpotifyStatus,
  handleSpotifySetupDiagnostics,
  handleSpotifySearch,
  handleSpotifyRecommendations,
  handleSpotifyUserPlaylists,
  handleSpotifyPlaylistTracks,
  handleSpotifyAlbumDetail,
  handleSpotifyLibraryCheck,
  handleSpotifyLibrarySet,
  handleSpotifyPlaylistAddSong,
  handleSpotifyCreatePlaylist,
  handleSpotifySongUrl,
  handleSpotifyLyric,
  SPOTIFY_SEARCH_LIMIT_MAX,
  SPOTIFY_LIKED_PLAYLIST_ID,
  _test: {
    getSpotifyUserAccessToken,
    spotifyGet,
    spotifyUserGet,
    spotifyUserRequest,
    spotifyLibraryUri,
    requireSpotifyScopes,
    spotifyErrorDetails,
    normalizeSpotifyProfile,
    spotifyClientIdLooksValid,
    inspectSpotifyRedirectUri,
    readStoredSpotifyToken,
    invalidateSpotifyAccessToken,
    resetSpotifyRuntimeStateForTests,
  },
};
