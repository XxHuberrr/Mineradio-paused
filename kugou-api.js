'use strict';

const crypto = require('crypto');
const http = require('http');
const https = require('https');

const KUGOU_SEARCH_URL = 'https://songsearch.kugou.com/song_search_v2';
const KUGOU_PLAY_MOBILE = 'https://m.kugou.com/app/i/getSongInfo.php';
// The official playbyAudio.js now signs /play/songinfo with infSign's H5 contract.
const KUGOU_PLAY_WEB = 'https://wwwapi.kugou.com/play/songinfo';
const KUGOU_PLAY_WEB_RETRY = 'https://wwwapiretry.kugou.com/play/songinfo';
const KUGOU_PLAY_ATTEMPT_MS = 2500;
const KUGOU_PLAY_BUDGET_MS = 9000;
const KUGOU_LYRIC_SEARCH = 'https://krcs.kugou.com/search';
const KUGOU_LYRIC_DOWNLOAD = 'https://krcs.kugou.com/download';
const KUGOU_HEADERS = {
  Referer: 'https://www.kugou.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};
const KUGOU_GATEWAY = 'https://gateway.kugou.com';
const KUGOU_APPID = 1005;
const KUGOU_WEB_APPID = 1014;
const KUGOU_CLIENTVER = 20489;
const KUGOU_ANDROID_SALT = 'OIlwieks28dk2k092lksi2UIkp';
const KUGOU_H5_SALT = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt';
const KUGOU_H5_SRC_APPID = '2919';
const KUGOU_H5_CLIENTVER = '20000';
const KUGOU_SIGN_KEY_SALT = '57ae12eb6890223e355ccfcb74edf70d';
const KUGOU_GATEWAY_UA = 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi';
const KUGOU_VIP_ROLEINFO_URL = 'https://vip.kugou.com/recharge/roleinfo';

function createKugouTtlCache(maxEntries, defaultTtlMs) {
  const store = new Map();
  const inflight = new Map();
  let generation = 0;
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
    async wrap(key, ttlMs, fn) {
      const cached = this.get(key);
      if (cached !== null) return cached;
      if (inflight.has(key)) return inflight.get(key);
      const startGeneration = generation;
      let promise;
      promise = Promise.resolve().then(fn).then((value) => {
        const resolvedTtl = typeof ttlMs === 'function' ? ttlMs(value) : ttlMs;
        if (startGeneration === generation) this.set(key, value, resolvedTtl);
        return value;
      }).finally(() => {
        if (inflight.get(key) === promise) inflight.delete(key);
      });
      inflight.set(key, promise);
      return promise;
    },
    clear() {
      generation += 1;
      store.clear();
      inflight.clear();
    },
  };
}

const kugouSearchCache = createKugouTtlCache(120, 2 * 60 * 1000);
const kugouSongUrlCache = createKugouTtlCache(240, 15 * 60 * 1000);
const kugouPlaylistTracksCache = createKugouTtlCache(24, 5 * 60 * 1000);
const kugouProfileCache = createKugouTtlCache(24, 5 * 60 * 1000);
const kugouVipCache = createKugouTtlCache(24, 5 * 60 * 1000);
const kugouVerifiedVipHistory = new Map();
const KUGOU_VIP_STALE_POSITIVE_GRACE_MS = 10 * 60 * 1000;
const KUGOU_H5_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function clearKugouSessionCaches() {
  kugouSearchCache.clear();
  kugouSongUrlCache.clear();
  kugouPlaylistTracksCache.clear();
  kugouProfileCache.clear();
  kugouVipCache.clear();
  kugouVerifiedVipHistory.clear();
}

const KUGOU_QUALITY_CHAIN = [
  { key: 'jymaster', label: 'Hi-Res', field: 'ResFileHash' },
  { key: 'hires', label: 'Hi-Res', field: 'ResFileHash' },
  { key: 'lossless', label: '无损', field: 'SQFileHash' },
  { key: 'exhigh', label: '极高', field: 'HQFileHash' },
  { key: 'standard', label: '标准', field: 'FileHash' },
];

function requestText(targetUrl, opts, body) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const lib = u.protocol === 'https:' ? https : http;
    let deadline;
    const finish = (error, value) => {
      clearTimeout(deadline);
      if (error) reject(error);
      else resolve(value);
    };
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
          finish(err);
          return;
        }
        finish(null, text);
      });
      response.on('error', error => finish(error));
      response.on('aborted', () => finish(new Error('Response aborted')));
    });
    const timeoutMs = Math.max(250, Number(opts.timeoutMs) || 12000);
    deadline = setTimeout(() => req.destroy(new Error('Request timeout')), timeoutMs);
    if (typeof deadline.unref === 'function') deadline.unref();
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Request timeout')));
    req.on('error', error => finish(error));
    if (body) req.write(body);
    req.end();
  });
}

async function requestJson(targetUrl, opts, body) {
  const text = await requestText(targetUrl, opts, body);
  return JSON.parse(text);
}

function createKugouMid(seed) {
  const raw = String(seed || Date.now()) + Math.random();
  return crypto.createHash('md5').update(raw).digest('hex');
}

function kugouCloudKey(hash) {
  return crypto.createHash('md5').update(String(hash || '') + 'kgcloud').digest('hex');
}

function stripKugouHtml(text) {
  return decodeKugouDisplayText(String(text || '').replace(/<[^>]+>/g, '').trim());
}

function decodeKugouDisplayText(text) {
  let raw = String(text || '').trim();
  if (!raw) return '';
  if (/%u[0-9a-fA-F]{4}/.test(raw)) {
    raw = raw.replace(/%u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  if (/%[0-9a-fA-F]{2}/.test(raw) && !/[\u3400-\u9fff]/.test(raw)) {
    try { raw = decodeURIComponent(raw.replace(/\+/g, ' ')); } catch (_) {}
  }
  return raw.trim();
}

function stripKugouFileName(raw, fallbackArtist) {
  let name = stripKugouHtml(raw || '');
  name = name.replace(/\.(mp3|flac|m4a|wav|ape|ogg)$/i, '').trim();
  const artist = stripKugouHtml(fallbackArtist || '');
  if (artist && name.indexOf(artist) === 0) {
    name = name.slice(artist.length).replace(/^[\s\-–—]+/, '').trim();
  }
  return name || stripKugouHtml(raw || '');
}

function resolveKugouAlbumAudioId(params) {
  params = params || {};
  const candidates = [params.mixSongId, params.mixsongid, params.albumAudioId, params.album_audio_id];
  for (const raw of candidates) {
    const text = String(raw || '').trim();
    if (/^\d+$/.test(text)) return Number(text);
  }
  return 0;
}

function pickKugouPlayUrl(json) {
  if (!json) return '';
  const pick = (val) => {
    if (Array.isArray(val)) return val.map(pick).find(Boolean) || '';
    const candidate = typeof val === 'string' ? val.replace(/\\\//g, '/').trim() : '';
    return /^https?:\/\/[^\s,]+$/i.test(candidate) ? candidate : '';
  };
  const data = json.data || {};
  return String(
    pick(json.url) || pick(json.play_url) || pick(json.backupUrl) || pick(json.backup_url) || pick(json.play_backup_url) ||
    pick(data.url) || pick(data.play_url) || pick(data.backupUrl) || pick(data.backup_url) || pick(data.play_backup_url) || ''
  ).replace(/\\\//g, '/').trim();
}

function kugouPlaybackTrial(json) {
  const data = json && json.data && typeof json.data === 'object' ? json.data : json || {};
  return [json || {}, data].some(value =>
    ['is_free_part', 'isFreePart', 'trial', 'is_trial', 'isTrial'].some(key => truthyParam(value[key]))
  );
}

function kugouPlaybackRestriction(json, auth) {
  const data = json && json.data && typeof json.data === 'object' ? json.data : {};
  const code = Number(json && (json.err_code || json.error_code || json.errcode || json.errno)) || 0;
  const rawMessage = String(json && (json.error || json.errmsg || json.msg || json.message || json.show_tips) || data.msg || data.show_tips || '');
  let category = 'url_unavailable';
  let message = '酷狗暂未返回播放地址，请稍后重试';
  if (code === 30020) {
    category = 'verification_required';
    message = '酷狗需要官方安全验证，请打开酷狗官方登录窗口完成验证';
  } else if (code === 30022) {
    category = 'client_only';
    message = '该酷狗歌曲仅支持官方客户端播放';
  } else if (/登录|token|login|会话|凭证/i.test(rawMessage)) {
    category = 'login_required';
    message = '酷狗播放登录态需要重新验证，请重新打开官方登录窗口';
  } else if (/付费|会员|vip|购买/i.test(rawMessage)) {
    category = auth && auth.playbackReady ? 'vip_required' : 'login_required';
    message = '该酷狗歌曲需要有效会员或已购买权限';
  }
  return { restricted: true, category, message, upstreamCode: code || undefined };
}

function kugouCoverUrl(raw, size) {
  const url = String(raw || '').trim();
  if (!url) return '';
  const px = size || 240;
  return url.replace(/\{size\}/g, String(px));
}

function parseCookieString(cookie) {
  const out = {};
  String(cookie || '').split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = value;
  });
  return out;
}

function kugouCookieObject(cookie) {
  return parseCookieString(normalizeKugouCookieInput(cookie));
}

function parseKuGooCompound(raw) {
  const out = {};
  let text = String(raw || '').trim();
  if (!text) return out;
  try { text = decodeURIComponent(text); } catch (_) {}
  text.split('&').forEach(part => {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = value;
  });
  return out;
}

function firstPositiveKugouNumber(objects, keys) {
  for (const obj of objects || []) {
    if (!obj || typeof obj !== 'object') continue;
    for (const key of keys || []) {
      const raw = obj[key];
      const value = Number(raw);
      if (Number.isFinite(value) && value > 0) return value;
      if (raw === true || /^(true|yes|active|valid|enabled|vip|svip|premium|member)$/i.test(String(raw || '').trim())) {
        return 1;
      }
    }
  }
  return 0;
}

const KUGOU_VIP_SIGNAL_KEYS = new Set([
  'vip', 'viptype', 'isvip', 'viplevel', 'vipstatus', 'membertype', 'memberlevel',
  'musicviplevel', 'mtype', 'ptype', 'vipytype', 'unionviptype', 'userviptype',
]);
const KUGOU_WEB_MEMBERSHIP_SIGNAL_KEYS = new Set([
  'role', 'producttype', 'usertype', 'userytype', 'ytype',
]);
const KUGOU_SVIP_SIGNAL_KEYS = new Set([
  'svip', 'sviptype', 'issvip', 'sviplevel', 'svipstatus', 'supervip',
  'superviplevel', 'superviptype', 'luxuryviptype', 'vipluxurytype',
]);
const KUGOU_VIP_EXPIRY_KEYS = new Set([
  'vipendtime', 'vipexpiretime', 'vipexpire', 'musicvipendtime', 'rawvipendtime',
  'musicendtime', 'rawmusicendtime',
  'svipendtime', 'svipexpiretime', 'supervipendtime', 'luxuryvipendtime',
]);

function normalizeKugouMembershipKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function kugouObjectHasMembershipSignal(value, allowWebSignals) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).some(([key, item]) => {
    if (item && typeof item === 'object') return false;
    const normalizedKey = normalizeKugouMembershipKey(key);
    return KUGOU_VIP_SIGNAL_KEYS.has(normalizedKey) ||
      KUGOU_SVIP_SIGNAL_KEYS.has(normalizedKey) ||
      KUGOU_VIP_EXPIRY_KEYS.has(normalizedKey) ||
      (allowWebSignals === true && KUGOU_WEB_MEMBERSHIP_SIGNAL_KEYS.has(normalizedKey));
  });
}

function kugouMembershipTime(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(text)) return 0;
  const parsed = Date.parse(text.replace(' ', 'T'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function kugouTimeState(objects, keys) {
  const nowSec = Math.floor(Date.now() / 1000);
  const nowMs = Date.now();
  let present = false;
  let valid = false;
  let invalid = false;
  let future = false;
  let expiresAt = 0;
  for (const obj of objects || []) {
    if (!obj || typeof obj !== 'object') continue;
    for (const key of keys || []) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      const raw = obj[key];
      if (raw == null || String(raw).trim() === '' || Number(raw) === 0) continue;
      present = true;
      const value = kugouMembershipTime(raw);
      if (!isFinite(value) || value <= 0) {
        invalid = true;
        continue;
      }
      if (value > 100000000000) {
        valid = true;
        if (value > nowMs) {
          future = true;
          expiresAt = Math.max(expiresAt, value);
        }
      } else if (value > 1000000000) {
        valid = true;
        if (value > nowSec) {
          future = true;
          expiresAt = Math.max(expiresAt, value * 1000);
        }
      } else {
        invalid = true;
      }
    }
  }
  return { present, valid, invalid, future, expiresAt };
}

function kugouObjectUserId(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return String(value.userid || value.user_id || value.userId || value.uid || value.KugooID || '')
    .replace(/\D/g, '');
}

function collectKugouVipObjects(value, out, depth, expectedUserId, inheritedUserId) {
  if (depth > 6 || value == null) return out;
  if (Array.isArray(value)) {
    value.forEach(item => collectKugouVipObjects(item, out, depth + 1, expectedUserId, inheritedUserId));
    return out;
  }
  if (typeof value !== 'object') return out;
  const objectUserId = kugouObjectUserId(value);
  const scopedUserId = objectUserId || inheritedUserId || '';
  if (expectedUserId && scopedUserId && scopedUserId !== expectedUserId) return out;
  out.push(value);
  Object.keys(value).forEach(key => {
    const child = value[key];
    if (child && typeof child === 'object') {
      const mapUserId = /^\d{4,}$/.test(String(key)) ? String(key) : '';
      if (expectedUserId && mapUserId && mapUserId !== expectedUserId) return;
      collectKugouVipObjects(
        child,
        out,
        depth + 1,
        expectedUserId,
        mapUserId || scopedUserId
      );
    }
  });
  return out;
}

const KUGOU_VIP_TYPE_KEYS = [
  'vipType', 'vip_type', 'VIPType', 'isVIP', 'isVip', 'is_vip', 'vip_level', 'vipLevel',
  'music_vip_level', 'musicVipLevel', 'm_type', 'p_type', 'vip_y_type', 'union_vip_type',
  'user_vip_type', 'vip_status', 'member_type', 'member_level', 'vip'
];
const KUGOU_SVIP_TYPE_KEYS = [
  'svipType', 'svip_type', 'SVIPType', 'isSVIP', 'isSvip', 'is_svip', 'superVip', 'super_vip',
  'superVipLevel', 'super_vip_level', 'super_vip_type', 'luxury_vip_type', 'vip_luxury_type',
  'svip_level', 'svip_status', 'svip'
];
const KUGOU_VIP_EXPIRY_SOURCE_KEYS = [
  'vip_end_time', 'vipEndTime', 'vip_expire_time', 'vipExpireTime', 'vip_expire', 'vipExpire',
  'music_vip_end_time', 'musicVipEndTime', 'raw_vip_end_time', 'rawVipEndTime', 'rawvipendtime'
];
const KUGOU_SVIP_EXPIRY_SOURCE_KEYS = [
  'svip_end_time', 'svipEndTime', 'svip_expire_time', 'svipExpireTime',
  'super_vip_end_time', 'superVipEndTime', 'luxury_vip_end_time', 'luxuryVipEndTime'
];
const KUGOU_MUSIC_PACKAGE_EXPIRY_SOURCE_KEYS = [
  'music_end_time', 'musicEndTime', 'music_expire_time', 'musicExpireTime',
  'raw_music_end_time', 'rawMusicEndTime', 'rawmusicendtime',
];

const KUGOU_WEB_ROLE_KEYS = [
  'role', 'user_type', 'userType', 'usertype',
  'user_y_type', 'userYType', 'userytype', 'y_type', 'yType', 'ytype',
];
const KUGOU_WEB_VIP_ROLES = new Set([1, 2]);
const KUGOU_WEB_SVIP_ROLES = new Set([6, 11, 13]);
const KUGOU_WEB_MUSIC_PACKAGE_ROLES = new Set([31, 33]);

function kugouNumberFieldState(objects, keys) {
  for (const obj of objects || []) {
    if (!obj || typeof obj !== 'object') continue;
    for (const key of keys || []) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      const raw = obj[key];
      if (raw == null || String(raw).trim() === '') continue;
      const value = Number(raw);
      return {
        present: true,
        valid: Number.isFinite(value) && value >= 0,
        value: Number.isFinite(value) && value >= 0 ? value : 0,
      };
    }
  }
  return { present: false, valid: false, value: 0 };
}

function kugouMembershipRecordState(value, options) {
  options = options || {};
  const allowWebRole = options.allowWebRole === true;
  const known = kugouObjectHasMembershipSignal(value, allowWebRole);
  const vipType = firstPositiveKugouNumber([value], KUGOU_VIP_TYPE_KEYS);
  const svipType = firstPositiveKugouNumber([value], KUGOU_SVIP_TYPE_KEYS);
  const vipExpiry = kugouTimeState([value], KUGOU_VIP_EXPIRY_SOURCE_KEYS);
  const svipExpiry = kugouTimeState([value], KUGOU_SVIP_EXPIRY_SOURCE_KEYS);
  const musicPackageExpiry = kugouTimeState([value], KUGOU_MUSIC_PACKAGE_EXPIRY_SOURCE_KEYS);
  const webRoleState = allowWebRole
    ? kugouNumberFieldState([value], KUGOU_WEB_ROLE_KEYS)
    : { present: false, valid: false, value: 0 };
  if (webRoleState.present) {
    const webRole = webRoleState.value;
    const roleIsVip = webRoleState.valid && KUGOU_WEB_VIP_ROLES.has(webRole);
    const roleIsSvip = webRoleState.valid && KUGOU_WEB_SVIP_ROLES.has(webRole);
    const roleHasMusicPackage = webRoleState.valid && KUGOU_WEB_MUSIC_PACKAGE_ROLES.has(webRole);
    const roleExpiryCurrent = !vipExpiry.present || (vipExpiry.valid && vipExpiry.future);
    const musicPackageExpiryCurrent = !musicPackageExpiry.present ||
      (musicPackageExpiry.valid && musicPackageExpiry.future);
    const isSvip = roleIsSvip && roleExpiryCurrent;
    const isVip = (roleIsVip || roleIsSvip) && roleExpiryCurrent;
    const hasMusicPackage = roleHasMusicPackage && musicPackageExpiryCurrent;
    return {
      known: true,
      isVip,
      isSvip,
      vipType: isVip ? webRole : 0,
      svipType: isSvip ? webRole : 0,
      webRole,
      webRoleKnown: true,
      hasMusicPackage,
      musicPackageType: hasMusicPackage ? webRole : 0,
      musicPackageExpiresAt: hasMusicPackage ? musicPackageExpiry.expiresAt || 0 : 0,
      membershipTier: isSvip ? 'svip' : (isVip ? 'vip' : (hasMusicPackage ? 'music-package' : 'none')),
      expiresAt: isVip ? vipExpiry.expiresAt || 0 : 0,
    };
  }
  const isSvip = svipExpiry.future || (svipType > 0 && !svipExpiry.present) ||
    (value && value.isSvip === true && !svipExpiry.present);
  const isVip = isSvip || vipExpiry.future || (vipType > 0 && !vipExpiry.present) ||
    (value && value.isVip === true && !vipExpiry.present);
  return {
    known,
    isVip,
    isSvip,
    vipType,
    svipType,
    webRole: 0,
    webRoleKnown: false,
    hasMusicPackage: false,
    musicPackageType: 0,
    musicPackageExpiresAt: 0,
    membershipTier: isSvip ? 'svip' : (isVip ? 'vip' : 'none'),
    expiresAt: Math.max(
      isVip ? vipExpiry.expiresAt || 0 : 0,
      isSvip ? svipExpiry.expiresAt || 0 : 0
    ),
  };
}

function normalizeKugouVipPayloadV2(payload, fallback) {
  fallback = fallback || {};
  const data = payload && (payload.data || payload.result || payload.vip || payload) || {};
  const membershipStale = !!(payload && payload.__kugouMembershipStale);
  const membershipOrigin = String(payload && payload.__kugouMembershipOrigin || '');
  const isWebRolePayload = membershipOrigin === 'kugou-web-roleinfo';
  const expectedUserId = String(fallback.userid || fallback.userId || '').replace(/\D/g, '');
  const payloadObjects = collectKugouVipObjects(data, [], 0, expectedUserId, '');
  let apiStates = payloadObjects
    .map(value => kugouMembershipRecordState(value, { allowWebRole: isWebRolePayload }))
    .filter(state => state.known);
  const authoritativeWebRoleStates = isWebRolePayload
    ? apiStates.filter(state => state.webRoleKnown)
    : [];
  if (authoritativeWebRoleStates.length) apiStates = authoritativeWebRoleStates;
  const apiMembershipKnown = apiStates.length > 0;
  const fallbackMembershipKnown = fallback.membershipKnown === true;
  const fallbackState = fallbackMembershipKnown ? kugouMembershipRecordState(fallback) : null;
  const states = apiMembershipKnown ? apiStates : [];
  const membershipKnown = apiMembershipKnown;
  const activeStates = states.filter(state => state.isVip);
  const isSvip = activeStates.some(state => state.isSvip);
  const isVip = isSvip || activeStates.length > 0;
  const vipType = activeStates.reduce((max, state) => Math.max(max, state.vipType || 0), 0);
  const svipType = activeStates.reduce((max, state) => Math.max(max, state.svipType || 0), 0);
  const musicPackageType = states.reduce((max, state) => Math.max(max, state.musicPackageType || 0), 0);
  const hasMusicPackage = musicPackageType > 0;
  const musicPackageExpiries = states
    .map(state => Number(state.musicPackageExpiresAt) || 0)
    .filter(Boolean);
  const webRole = states.reduce((max, state) => Math.max(max, state.webRole || 0), 0);
  const activeExpiries = activeStates.map(state => Number(state.expiresAt) || 0).filter(Boolean);
  const vipLevel = isSvip ? 'svip' : (isVip ? 'vip' : 'none');
  const freshMembershipSource = isWebRolePayload ? 'kugou-web-roleinfo' : 'kugou-vip-api';
  const staleMembershipSource = isWebRolePayload ? 'kugou-web-roleinfo-stale' : 'kugou-vip-api-stale';
  return {
    vipType: isSvip ? Math.max(vipType, svipType) : vipType,
    svipType,
    vipLevel,
    isVip,
    isSvip,
    webRole,
    hasMusicPackage,
    musicPackageType,
    musicPackageExpiresAt: musicPackageExpiries.length ? Math.min(...musicPackageExpiries) : 0,
    membershipTier: isSvip ? 'svip' : (isVip ? 'vip' : (hasMusicPackage ? 'music-package' : 'none')),
    membershipKnown,
    membershipVerified: apiMembershipKnown && !membershipStale,
    membershipStale,
    vipSyncState: membershipStale
      ? 'stale_positive'
      : (membershipKnown ? 'checked' : 'unknown'),
    membershipSource: apiMembershipKnown
      ? (membershipStale ? staleMembershipSource : freshMembershipSource)
      : (fallbackMembershipKnown ? 'kugou-cookie-hint' : 'none'),
    expiresAt: activeExpiries.length ? Math.min(...activeExpiries) : 0,
    membershipHintLevel: fallbackState && fallbackState.isSvip
      ? 'svip'
      : (fallbackState && fallbackState.isVip ? 'vip' : (fallbackMembershipKnown ? 'none' : 'unknown')),
  };
}

function kugouMembershipRights(status) {
  status = status || {};
  const isSvip = !!status.isSvip || status.vipLevel === 'svip';
  const isVip = isSvip || !!status.isVip || status.vipLevel === 'vip';
  const hasMusicPackage = status.hasMusicPackage === true || Number(status.musicPackageType) > 0;
  const membershipKnown = status.membershipKnown === true;
  const verified = status.membershipVerified === true;
  const stale = status.membershipStale === true ||
    status.vipSyncState === 'stale_positive' ||
    /-stale$/.test(String(status.membershipSource || ''));
  const expiresAt = Number(status.expiresAt) || 0;
  const musicPackageExpiresAt = Number(status.musicPackageExpiresAt) || 0;
  const playbackReady = status.playbackReady === true || status.playbackKeyReady === true;
  // A fresh, account-scoped official response is authoritative even when a
  // particular Kugou endpoint omits the expiry field. Missing expiry only
  // prevents stale retention; it must not demote a real member immediately.
  const entitlementCurrent = verified && !stale && playbackReady &&
    (expiresAt <= 0 || expiresAt > Date.now());
  const entitledSvip = entitlementCurrent && isSvip;
  const entitledVip = entitlementCurrent && isVip;
  const entitledMusicPackage = verified && !stale && playbackReady && hasMusicPackage &&
    (musicPackageExpiresAt <= 0 || musicPackageExpiresAt > Date.now());
  return {
    level: isSvip ? 'svip' : (isVip ? 'vip' : 'none'),
    membershipTier: isSvip ? 'svip' : (isVip ? 'vip' : (hasMusicPackage ? 'music-package' : 'none')),
    hasMusicPackage,
    membershipKnown,
    verified,
    stale,
    expiresAt,
    musicPackageExpiresAt,
    syncState: status.vipSyncState || (membershipKnown ? 'checked' : 'unknown'),
    canPlayVipTracks: entitledVip,
    canPlaySvipTracks: entitledSvip,
    canPlayMusicPackageTracks: entitledMusicPackage,
    maxQuality: entitledSvip ? 'hires' : (entitledVip ? 'lossless' : 'standard'),
  };
}

function kugouEffectiveQuality(requestedQuality, membership) {
  const requested = normalizeQualityPreference(requestedQuality);
  const rights = kugouMembershipRights(membership);
  if (rights.canPlaySvipTracks) return requested;
  if (!rights.canPlayVipTracks) return 'standard';
  return requested === 'jymaster' || requested === 'hires' ? 'lossless' : requested;
}

function extractKugouAuth(cookie) {
  const obj = kugouCookieObject(cookie);
  const kugoo = parseKuGooCompound(obj.KuGoo || obj.kugou || obj.Kugou || '');
  const userid = String(
    obj.userid || obj.UserId || obj.KugooID || obj.kugouID ||
    kugoo.KugooID || kugoo.kugouID || kugoo.userid || kugoo.uid || ''
  ).replace(/\D/g, '');
  const token = String(obj.token || obj.Token || obj.t || obj.T || kugoo.t || kugoo.token || '').trim();
  const fallbackMid = crypto.createHash('md5')
    .update('mineradio-kugou:' + String(userid || token || obj.KuGoo || obj.kugou || 'guest'))
    .digest('hex');
  const mid = String(obj.kg_mid || obj.KG_MID || obj.KUGOU_API_MID || obj.mid || fallbackMid).trim();
  const dfid = String(obj.kg_dfid || obj.KG_DFID || obj.dfid || obj.DFID || '-').trim();
  const nickname = decodeKugouDisplayText(
    kugoo.NickName || kugoo.nickname || obj.NickName || obj.nickname || obj.UserName || obj.username || ''
  );
  const avatar = String(kugoo.Pic || kugoo.pic || obj.Pic || obj.avatar || '').trim();
  const vipType = firstPositiveKugouNumber([kugoo, obj], [
    'isVIP', 'isVip', 'is_vip', 'vip_type', 'VIPType', 'vipLevel', 'vip_level',
    'vip_status', 'member_type', 'member_level', 'vip',
  ]);
  const svipType = firstPositiveKugouNumber([kugoo, obj], [
    'isSVIP', 'isSvip', 'is_svip', 'svip_type', 'SVIPType', 'superVip', 'super_vip',
    'svip_level', 'svip_status', 'svip',
  ]);
  const membershipKnown = [obj, kugoo].some(kugouObjectHasMembershipSignal);
  const isSvip = svipType > 0;
  const isVip = isSvip || vipType > 0;
  const vipLevel = isSvip ? 'svip' : (isVip ? 'vip' : 'none');
  const loggedIn = !!(userid && userid !== '0') || !!(obj.KuGoo || obj.kugou || obj.Kugou);
  const playbackReady = !!(userid && userid !== '0' && token);
  return {
    userid,
    token,
    mid,
    dfid,
    nickname,
    avatar,
    vipType,
    svipType,
    vipLevel,
    isVip,
    isSvip,
    membershipKnown,
    loggedIn,
    playbackReady,
  };
}

function kugouCookieUserId(obj) {
  return extractKugouAuth(typeof obj === 'string' ? obj : kugouCookieObject(obj)).userid;
}

function kugouCookieNickname(obj) {
  return extractKugouAuth(typeof obj === 'string' ? obj : kugouCookieObject(obj)).nickname;
}

function kugouCookieHasLogin(input) {
  const auth = extractKugouAuth(typeof input === 'string' ? input : kugouCookieObject(input));
  return auth.loggedIn;
}

function kugouCookieHasPlayback(input) {
  return extractKugouAuth(typeof input === 'string' ? input : kugouCookieObject(input)).playbackReady;
}

function truthyParam(value) {
  const text = String(value == null ? '' : value).trim().toLowerCase();
  return text === '1' || text === 'true' || text === 'yes' || text === 'vip' || text === 'svip';
}

function kugouPlaybackParamsRequireVip(params) {
  params = params || {};
  const privilege = Number(params.privilege || params.Privilege || params.mediaPrivilege || params.media_privilege || 0) || 0;
  const fee = Number(params.fee || params.Fee || 0) || 0;
  return truthyParam(params.vipRequired) || truthyParam(params.needVip) || truthyParam(params.onlyVipPlayable) || fee > 0 || privilege >= 9;
}

function kugouPlaybackCacheScope(auth, membership) {
  auth = auth || {};
  const rights = kugouMembershipRights(membership);
  const identity = [
    String(auth.userid || 'guest'),
    String(auth.token || ''),
    String(auth.mid || ''),
    rights.canPlaySvipTracks
      ? 'svip'
      : (rights.canPlayVipTracks ? 'vip' : (rights.canPlayMusicPackageTracks ? 'music-package' : 'none')),
  ].join('|');
  return crypto.createHash('sha256').update(identity).digest('hex').slice(0, 20);
}

function kugouVipCacheKey(auth) {
  auth = auth || {};
  const identity = [
    String(auth.userid || '0'),
    String(auth.token || ''),
    String(auth.mid || ''),
    String(auth.dfid || ''),
  ].join('\n');
  return 'vip|' + crypto.createHash('sha256').update(identity).digest('hex');
}

function stabilizeKugouVipProbe(cacheKey, payload, auth, now) {
  now = Number(now) || Date.now();
  const parsed = normalizeKugouVipPayloadV2(payload, { userid: auth && auth.userid });
  if (parsed.membershipVerified && parsed.membershipKnown) {
    if (!parsed.isVip) {
      kugouVerifiedVipHistory.delete(cacheKey);
      return payload;
    }
    const entitlementExpiry = Number(parsed.expiresAt) || 0;
    if (entitlementExpiry <= now) {
      kugouVerifiedVipHistory.delete(cacheKey);
      return payload;
    }
    const staleUntil = Math.min(
      now + KUGOU_VIP_STALE_POSITIVE_GRACE_MS,
      entitlementExpiry
    );
    kugouVerifiedVipHistory.set(cacheKey, { payload, staleUntil, at: now });
    while (kugouVerifiedVipHistory.size > 24) {
      const oldest = [...kugouVerifiedVipHistory.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!oldest) break;
      kugouVerifiedVipHistory.delete(oldest[0]);
    }
    return payload;
  }
  const previous = kugouVerifiedVipHistory.get(cacheKey);
  if (
    payload && payload.__kugouMembershipUnknown
    && previous && previous.payload
    && now < previous.staleUntil
  ) {
    return Object.assign({}, previous.payload, {
      __kugouMembershipStale: true,
      __kugouMembershipStaleUntil: previous.staleUntil,
    });
  }
  if (previous && now >= previous.staleUntil) kugouVerifiedVipHistory.delete(cacheKey);
  return payload;
}

function attachKugouPlaybackStatus(payload, cookie, auth, membership) {
  auth = auth || extractKugouAuth(cookie);
  const vip = membership || normalizeKugouVipPayloadV2(null, auth);
  return Object.assign({}, payload, {
    loggedIn: auth.loggedIn,
    playbackReady: auth.playbackReady,
    playbackKeyReady: auth.playbackReady,
    vipType: vip.vipType,
    svipType: vip.svipType,
    vipLevel: vip.vipLevel,
    isVip: vip.isVip,
    isSvip: vip.isSvip,
    hasMusicPackage: !!vip.hasMusicPackage,
    musicPackageType: Number(vip.musicPackageType) || 0,
    musicPackageExpiresAt: Number(vip.musicPackageExpiresAt) || 0,
    membershipTier: vip.membershipTier || vip.vipLevel || 'none',
    vipLabel: vip.isSvip ? 'SVIP' : (vip.isVip ? 'VIP' : 'No VIP'),
    membershipKnown: !!vip.membershipKnown,
    membershipVerified: !!vip.membershipVerified,
    membershipStale: !!vip.membershipStale,
    vipSyncState: vip.vipSyncState || (vip.membershipKnown ? 'checked' : 'unknown'),
    membershipSource: vip.membershipSource || 'none',
    membershipRights: kugouMembershipRights(Object.assign({}, vip, {
      playbackReady: auth.playbackReady,
    })),
  });
}

function signatureAndroidParams(params, data) {
  const paramsString = Object.keys(params).sort()
    .map(key => `${key}=${typeof params[key] === 'object' ? JSON.stringify(params[key]) : params[key]}`)
    .join('');
  return crypto.createHash('md5').update(`${KUGOU_ANDROID_SALT}${paramsString}${data || ''}${KUGOU_ANDROID_SALT}`).digest('hex');
}

function signatureH5Params(params, bodyObj) {
  const parts = Object.keys(params).sort().map(key => `${key}=${params[key]}`);
  if (bodyObj && typeof bodyObj === 'object') parts.push(JSON.stringify(bodyObj));
  return crypto.createHash('md5').update(`${KUGOU_H5_SALT}${parts.join('')}${KUGOU_H5_SALT}`).digest('hex');
}

function buildKugouH5Params(auth, extra) {
  auth = auth || {};
  const now = Date.now();
  return Object.assign({
    srcappid: KUGOU_H5_SRC_APPID,
    clientver: KUGOU_H5_CLIENTVER,
    clienttime: now,
    mid: auth.mid || createKugouMid('gateway'),
    uuid: now,
    dfid: auth.dfid || '-',
    appid: KUGOU_WEB_APPID,
    token: auth.token || '',
    userid: auth.userid ? Number(auth.userid) : 0,
  }, extra || {});
}

async function kugouH5GatewayRequest(path, opts) {
  opts = opts || {};
  const auth = extractKugouAuth(opts.cookie || '');
  if (!auth.playbackReady) throw new Error('KUGOU_AUTH_REQUIRED');
  const bodyObj = opts.body == null ? null : (typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body);
  const bodyText = bodyObj == null ? '' : JSON.stringify(bodyObj);
  const params = buildKugouH5Params(auth, opts.params || {});
  params.signature = signatureH5Params(params, bodyObj);
  const u = new URL(path, opts.baseURL || KUGOU_GATEWAY);
  Object.keys(params).forEach(key => u.searchParams.set(key, String(params[key])));
  const headers = Object.assign({}, KUGOU_HEADERS, {
    'User-Agent': KUGOU_H5_UA,
    Cookie: buildKugouRequestCookie(opts.cookie || ''),
  }, opts.headers || {});
  if (opts.router) headers['x-router'] = opts.router;
  if (bodyObj != null) headers['Content-Type'] = 'application/json';
  const json = await requestJson(u.toString(), { method: opts.method || (bodyObj == null ? 'GET' : 'POST'), headers, timeoutMs: opts.timeoutMs }, bodyText || undefined);
  if (json && Number(json.status) === 0) {
    const err = new Error(json.error || json.msg || json.message || 'KUGOU_GATEWAY_FAILED');
    err.body = json;
    err.upstreamCode = Number(json.error_code || json.err_code || json.errcode || json.errno) || undefined;
    throw err;
  }
  return json;
}

function parseKugouListId(playlistId) {
  const id = String(playlistId || '').trim();
  if (!id) return '';
  if (/^\d+$/.test(id)) return id;
  if (id.indexOf('collection_') === 0) {
    const parts = id.split('_');
    if (parts.length >= 5 && parts[3]) return parts[3];
  }
  const matched = id.match(/collection_\d+_\d+_(\d+)_\d+/);
  return matched ? matched[1] : id;
}

function signKey(hash, mid, userid, appid) {
  return crypto.createHash('md5').update(`${hash}${KUGOU_SIGN_KEY_SALT}${appid || KUGOU_APPID}${mid}${userid || 0}`).digest('hex');
}

function buildKugouGatewayParams(auth, extra) {
  auth = auth || {};
  const clienttime = Math.floor(Date.now() / 1000);
  return Object.assign({
    dfid: auth.dfid || '-',
    mid: auth.mid || createKugouMid('gateway'),
    uuid: '-',
    appid: KUGOU_APPID,
    clientver: KUGOU_CLIENTVER,
    clienttime,
    token: auth.token || '',
    userid: auth.userid || 0,
  }, extra || {});
}

async function kugouGatewayRequest(path, opts) {
  opts = opts || {};
  const auth = extractKugouAuth(opts.cookie || '');
  if (!auth.playbackReady) throw new Error('KUGOU_AUTH_REQUIRED');
  const body = opts.body == null ? '' : (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
  const params = buildKugouGatewayParams(auth, opts.params || {});
  if (!opts.skipSignature) params.signature = signatureAndroidParams(params, body);
  const u = new URL(path, opts.baseURL || KUGOU_GATEWAY);
  Object.keys(params).forEach(key => u.searchParams.set(key, String(params[key])));
  const headers = Object.assign({}, KUGOU_HEADERS, {
    'User-Agent': KUGOU_GATEWAY_UA,
    dfid: auth.dfid || '-',
    mid: auth.mid,
    clienttime: String(params.clienttime),
    'kg-rc': '1',
    'kg-thash': '5d816a0',
    'kg-rec': '1',
    'kg-rf': 'B9EDA08A64250DEFFBCADDEE00F8F25F',
    Cookie: buildKugouRequestCookie(opts.cookie || ''),
  }, opts.headers || {});
  if (opts.router) headers['x-router'] = opts.router;
  if (body) headers['Content-Type'] = 'application/json';
  const json = await requestJson(u.toString(), { method: opts.method || 'GET', headers }, body || undefined);
  if (json && Number(json.status) === 0) {
    const err = new Error(json.error || json.msg || json.message || 'KUGOU_GATEWAY_FAILED');
    err.body = json;
    throw err;
  }
  return json;
}

function normalizeKugouCookieInput(input) {
  if (typeof input === 'string') return input.trim();
  if (Array.isArray(input)) return input.filter(Boolean).join('; ').trim();
  if (input && typeof input === 'object') {
    return Object.keys(input).map(k => `${k}=${input[k]}`).join('; ');
  }
  return '';
}

function buildKugouRequestCookie(cookie) {
  const obj = kugouCookieObject(cookie);
  const mid = obj.kg_mid || obj.KG_MID || extractKugouAuth(cookie).mid;
  const dfid = obj.kg_dfid || obj.KG_DFID || '-';
  const parts = [];
  if (cookie) parts.push(String(cookie).trim());
  if (!obj.kg_mid && !obj.KG_MID) parts.push('kg_mid=' + mid);
  if (!obj.kg_dfid && !obj.KG_DFID) parts.push('kg_dfid=' + dfid);
  const merged = {};
  parts.join('; ').split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    merged[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  });
  return Object.keys(merged).map(k => `${k}=${merged[k]}`).join('; ');
}

function mapKugouArtists(item) {
  item = item || {};
  const singers = Array.isArray(item.Singers) ? item.Singers : [];
  if (singers.length) {
    return singers.map(s => ({
      id: s.id || s.SingerId,
      name: stripKugouHtml(s.name || s.SingerName || ''),
    })).filter(a => a.name);
  }
  const names = String(item.SingerName || '').split(/、|\/|,| feat\.? /i).map(stripKugouHtml).filter(Boolean);
  const ids = Array.isArray(item.SingerId) ? item.SingerId : [];
  return names.map((name, i) => ({ id: ids[i] || '', name }));
}

function mapKugouSearchItem(item) {
  item = item || {};
  const artists = mapKugouArtists(item);
  const hash = item.FileHash || '';
  const albumId = item.AlbumID != null ? String(item.AlbumID) : '';
  const mixSongId = item.MixSongID != null ? String(item.MixSongID) : (item.mixsongid != null ? String(item.mixsongid) : '');
  const albumAudioIdRaw = item.EMixSongID || item.AlbumAudioID || item.album_audio_id || '';
  const albumAudioId = (/^\d+$/.test(mixSongId) ? mixSongId : '') || albumAudioIdRaw || mixSongId;
  const name = stripKugouHtml(item.SongName || item.FileName || item.OriSongName || '');
  const artist = artists.map(a => a.name).join(' / ') || stripKugouHtml(item.SingerName || '');
  const privilege = Number(item.Privilege || 0) || 0;
  return {
    provider: 'kugou',
    source: 'kugou',
    type: 'kugou',
    id: hash || mixSongId || albumAudioId,
    hash,
    fileHash: hash,
    albumId,
    album_id: albumId,
    mixSongId,
    albumAudioId,
    album_audio_id: albumAudioId,
    audioId: item.Audioid || item.Scid || '',
    name,
    artist,
    artists,
    artistId: artists[0] && artists[0].id,
    album: stripKugouHtml(item.AlbumName || ''),
    cover: kugouCoverUrl(
      item.Image || item.AlbumImage || item.cover || item.img || item.album_cover || item.album_img || item.pic ||
      (item.albuminfo && (item.albuminfo.img || item.albuminfo.cover || item.albuminfo.sizable_cover)) ||
      (item.trans_param && item.trans_param.union_cover) || '', 240
    ),
    duration: (Number(item.Duration) || 0) * 1000,
    popularity: Number(item.Heat || item.heat || item.Hot || item.hot || item.Score || item.score || 0) || 0,
    kugouRank: item.rank === null || item.rank === undefined || item.rank === ''
      ? (item.Rank === null || item.Rank === undefined || item.Rank === '' ? null : Number(item.Rank))
      : Number(item.rank),
    fee: privilege >= 10 ? 1 : 0,
    privilege,
    playable: privilege <= 8,
    hqHash: item.HQFileHash || '',
    sqHash: item.SQFileHash || '',
    resHash: item.ResFileHash || '',
  };
}

async function kugouSearch(keywords, limit, cookie, offset) {
  const auth = extractKugouAuth(cookie);
  offset = Math.max(0, Number(offset) || 0);
  const pageSize = Math.max(1, Math.min(limit || 8, 20));
  const u = new URL(KUGOU_SEARCH_URL);
  u.searchParams.set('keyword', keywords);
  u.searchParams.set('page', String(Math.floor(offset / pageSize) + 1));
  u.searchParams.set('pagesize', String(pageSize));
  u.searchParams.set('userid', auth.userid || '-1');
  u.searchParams.set('clientver', '2000');
  u.searchParams.set('platform', 'WebFilter');
  u.searchParams.set('tag', 'em');
  u.searchParams.set('filter', '2');
  u.searchParams.set('iscorrection', '1');
  u.searchParams.set('privilege_filter', '0');
  u.searchParams.set('filter_ver', '2');
  u.searchParams.set('appid', String(KUGOU_WEB_APPID));
  u.searchParams.set('token', auth.token || '');
  u.searchParams.set('mid', auth.mid);
  const json = await requestJson(u.toString(), {
    headers: { ...KUGOU_HEADERS, Cookie: buildKugouRequestCookie(cookie) },
  });
  if (!json || Number(json.status) !== 1 || !json.data || !Array.isArray(json.data.lists)) {
    const error = new Error('酷狗搜索服务暂时不可用，请稍后重试');
    error.code = 'KUGOU_SEARCH_UNAVAILABLE';
    throw error;
  }
  const list = json.data.lists;
  return list.map(mapKugouSearchItem).filter(s => s.name && (s.hash || s.id));
}

async function kugouPlayViaMobile(hash, albumId, cookie, membership, timeoutMs) {
  const auth = extractKugouAuth(cookie);
  membership = membership || normalizeKugouVipPayloadV2(null, auth);
  const key = kugouCloudKey(hash);
  const u = new URL(KUGOU_PLAY_MOBILE);
  u.searchParams.set('cmd', 'playInfo');
  u.searchParams.set('hash', hash);
  u.searchParams.set('key', key);
  u.searchParams.set('album_id', albumId || '0');
  u.searchParams.set('pid', '1');
  u.searchParams.set('forceDown', '0');
  u.searchParams.set('vip', membership.isVip ? '1' : '65530');
  if (auth.userid) u.searchParams.set('userid', auth.userid);
  if (auth.token) u.searchParams.set('token', auth.token);
  const json = await requestJson(u.toString(), {
    timeoutMs,
    headers: { ...KUGOU_HEADERS, Referer: 'https://m.kugou.com/', Cookie: buildKugouRequestCookie(cookie) },
  });
  const url = pickKugouPlayUrl(json);
  if (json && Number(json.status) === 1 && url) {
    return { url, level: 'standard', quality: '标准', trial: kugouPlaybackTrial(json), source: 'mobile' };
  }
  return kugouPlaybackRestriction(json, auth);
}

async function kugouPlayViaWeb(hash, albumId, albumAudioId, cookie, timeoutMs, retry) {
  const auth = extractKugouAuth(cookie);
  const params = buildKugouH5Params(auth, {
    uuid: auth.mid,
    platid: 4,
    hash,
    album_id: albumId || '0',
  });
  if (albumAudioId) params.album_audio_id = albumAudioId;
  params.signature = signatureH5Params(params, null);
  const u = new URL(retry ? KUGOU_PLAY_WEB_RETRY : KUGOU_PLAY_WEB);
  Object.keys(params).forEach(key => u.searchParams.set(key, String(params[key])));
  const json = await requestJson(u.toString(), {
    timeoutMs,
    headers: { ...KUGOU_HEADERS, Cookie: buildKugouRequestCookie(cookie) },
  });
  const data = json && json.data || {};
  const url = pickKugouPlayUrl(json);
  if (json && Number(json.status) === 1 && url) {
    const bitrate = Number(data.bitrate) || 0;
    const kbps = bitrate >= 10000 ? bitrate / 1000 : bitrate;
    const level = kbps >= 900 ? 'lossless' : (kbps >= 300 ? 'exhigh' : 'standard');
    return { url, level, quality: data.quality || level, trial: kugouPlaybackTrial(json), source: 'web' };
  }
  return kugouPlaybackRestriction(json, auth);
}

async function kugouPlayViaH5(hash, albumId, albumAudioId, cookie, requestedQuality, membership, timeoutMs) {
  const auth = extractKugouAuth(cookie);
  membership = membership || normalizeKugouVipPayloadV2(null, auth);
  if (!auth.playbackReady) return null;
  const quality = kugouQualityParam(requestedQuality);
  const fileHash = String(hash || '').toLowerCase();
  const params = buildKugouH5Params(auth, {
    album_id: Number(albumId || 0),
    area_code: 1,
    hash: fileHash,
    ssa_flag: 'is_fromtrack',
    version: 11430,
    quality,
    album_audio_id: Number(albumAudioId || 0),
    behavior: 'play',
    pid: 2,
    cmd: 26,
    pidversion: 3001,
    IsFreePart: membership.isVip ? 0 : 1,
    cdnBackup: 1,
    module: '',
  });
  params.key = signKey(fileHash, auth.mid, auth.userid, KUGOU_WEB_APPID);
  params.signature = signatureH5Params(params, null);
  const u = new URL('/v5/url', KUGOU_GATEWAY);
  Object.keys(params).forEach(key => u.searchParams.set(key, String(params[key])));
  const json = await requestJson(u.toString(), {
    timeoutMs,
    headers: {
      ...KUGOU_HEADERS,
      'User-Agent': KUGOU_H5_UA,
      'x-router': 'trackercdn.kugou.com',
      Cookie: buildKugouRequestCookie(cookie),
    },
  });
  const url = pickKugouPlayUrl(json);
  if (json && Number(json.status) === 1 && url) {
    const level = kugouQualityFromParam(quality, requestedQuality);
    return { url, level, quality: level, trial: kugouPlaybackTrial(json), source: 'h5' };
  }
  return kugouPlaybackRestriction(json, auth);
}

async function kugouPlayViaGateway(hash, albumId, albumAudioId, cookie, requestedQuality, membership, timeoutMs) {
  const auth = extractKugouAuth(cookie);
  membership = membership || normalizeKugouVipPayloadV2(null, auth);
  if (!auth.playbackReady) return null;
  const quality = kugouQualityParam(requestedQuality);
  const clienttime = Math.floor(Date.now() / 1000);
  const params = {
    dfid: auth.dfid || '-',
    mid: auth.mid,
    uuid: '-',
    appid: KUGOU_APPID,
    clientver: KUGOU_CLIENTVER,
    clienttime,
    token: auth.token,
    userid: auth.userid,
    album_id: Number(albumId || 0),
    area_code: 1,
    hash: String(hash || '').toLowerCase(),
    ssa_flag: 'is_fromtrack',
    version: 11430,
    quality,
    album_audio_id: Number(albumAudioId || 0),
    behavior: 'play',
    pid: 2,
    cmd: 26,
    pidversion: 3001,
    IsFreePart: membership.isVip ? 0 : 1,
    cdnBackup: 1,
    module: '',
  };
  params.key = signKey(params.hash, auth.mid, auth.userid, KUGOU_APPID);
  const u = new URL('/v5/url', KUGOU_GATEWAY);
  Object.keys(params).forEach(key => u.searchParams.set(key, String(params[key])));
  const json = await requestJson(u.toString(), {
    timeoutMs,
    headers: {
      ...KUGOU_HEADERS,
      'User-Agent': KUGOU_GATEWAY_UA,
      dfid: auth.dfid || '-',
      mid: auth.mid,
      clienttime: String(clienttime),
      'x-router': 'trackercdn.kugou.com',
      Cookie: buildKugouRequestCookie(cookie),
    },
  });
  const url = pickKugouPlayUrl(json);
  if (json && Number(json.status) === 1 && url) {
    const level = kugouQualityFromParam(quality, requestedQuality);
    return { url, level, quality: level, trial: kugouPlaybackTrial(json), source: 'gateway' };
  }
  return kugouPlaybackRestriction(json, auth);
}

function normalizeQualityPreference(q) {
  q = String(q || 'standard').toLowerCase();
  if (['jymaster', 'hires', 'lossless', 'exhigh', 'standard'].includes(q)) return q;
  return 'standard';
}

function kugouQualityParam(requestedQuality) {
  const level = normalizeQualityPreference(requestedQuality);
  if (level === 'jymaster') return 'viper_tape';
  if (level === 'hires') return 'hires';
  if (level === 'lossless') return 'flac';
  if (level === 'exhigh') return 320;
  return 128;
}

function kugouQualityFromParam(param, fallbackLevel) {
  const raw = param;
  const text = String(raw == null ? '' : raw).toLowerCase();
  if (text === 'viper_tape' || text === 'jymaster') return 'jymaster';
  if (text === 'hires' || text === 'hi_res') return 'hires';
  if (text === 'flac' || text === 'lossless' || text === 'sq') return 'lossless';
  if (Number(raw) >= 320 || text === '320' || text === 'exhigh' || text === 'hq') return 'exhigh';
  if (Number(raw) >= 192) return 'exhigh';
  return normalizeQualityPreference(fallbackLevel || 'standard');
}

function hashCandidatesFromSong(song, requestedQuality) {
  song = song || {};
  const requested = normalizeQualityPreference(requestedQuality);
  const startIdx = Math.max(0, KUGOU_QUALITY_CHAIN.findIndex(item => item.key === requested));
  const chain = KUGOU_QUALITY_CHAIN.slice(startIdx);
  const out = [];
  const seen = new Set();
  chain.forEach(item => {
    const hash = song[item.field] || (item.field === 'FileHash' ? song.hash : '');
    if (!hash || seen.has(hash)) return;
    seen.add(hash);
    out.push({ hash, level: item.key, label: item.label });
  });
  if (song.hash && !seen.has(song.hash)) out.push({ hash: song.hash, level: 'standard', label: '标准' });
  return out;
}

async function handleKugouSearch(keywords, limit, cookie, offset) {
  const kw = String(keywords || '').trim();
  const lim = Math.max(1, Math.min(Math.floor(Number(limit) || 10), 20));
  const start = Math.max(0, Math.floor(Number(offset) || 0));
  if (!kw) return [];
  const cacheKey = kugouVipCacheKey(extractKugouAuth(cookie)) + ':' + kw.toLowerCase() + ':' + lim + ':' + start;
  return kugouSearchCache.wrap(cacheKey, null, async () => {
    console.log('[KugouSearch]', kw, 'limit:', lim, 'offset:', start);
    const skip = start % lim;
    const first = await kugouSearch(kw, lim, cookie, start - skip);
    if (!skip || first.length < lim) return first.slice(skip);
    const next = await kugouSearch(kw, lim, cookie, start - skip + lim);
    return first.concat(next).slice(skip, skip + lim);
  });
}

async function handleKugouSongUrl(params, cookie) {
  params = params || {};
  const auth = extractKugouAuth(cookie);
  const hash = String(params.hash || params.fileHash || params.id || '').trim();
  const albumId = String(params.albumId || params.album_id || '').trim();
  const albumAudioId = resolveKugouAlbumAudioId(params);
  const requestedQuality = normalizeQualityPreference(params.quality);
  if (!hash) {
    return { provider: 'kugou', url: '', playable: false, error: 'MISSING_HASH', message: '缺少酷狗歌曲 hash' };
  }
  const vipProbe = auth.playbackReady ? await fetchKugouVipInfo(cookie, auth).catch(() => null) : null;
  const membership = normalizeKugouVipPayloadV2(vipProbe, auth);
  const rightsMembership = Object.assign({}, membership, {
    playbackReady: auth.playbackReady,
    playbackKeyReady: auth.playbackReady,
  });
  const membershipRights = kugouMembershipRights(rightsMembership);
  const playbackMembership = Object.assign({}, membership, {
    isVip: membershipRights.canPlayVipTracks || membershipRights.canPlayMusicPackageTracks,
    isSvip: membershipRights.canPlaySvipTracks,
    vipLevel: membershipRights.canPlaySvipTracks
      ? 'svip'
      : (membershipRights.canPlayVipTracks ? 'vip' : 'none'),
  });
  const memberTrack = kugouPlaybackParamsRequireVip(params);
  const canAttemptMemberTrack = membershipRights.canPlayVipTracks ||
    membershipRights.canPlayMusicPackageTracks;
  if (memberTrack && !canAttemptMemberTrack) {
    const membershipPending = auth.playbackReady && (!membership.membershipKnown || !membership.membershipVerified || membership.membershipStale);
    const category = membershipPending ? 'membership_unknown' : (auth.playbackReady ? 'vip_required' : 'login_required');
    const message = membershipPending
      ? '酷狗会员权益暂未完成同步，请稍后重试或重新登录'
      : (auth.playbackReady ? '该酷狗歌曲需要有效会员或已购买权限' : '该酷狗歌曲需要先登录并验证播放权益');
    return attachKugouPlaybackStatus({
      provider: 'kugou',
      url: '',
      playable: false,
      reason: category,
      message,
      restriction: { category, message },
      requestedQuality,
      hash,
    }, cookie, auth, membership);
  }
  const effectiveQuality = kugouEffectiveQuality(requestedQuality, rightsMembership);
  const cacheKey = [
    kugouPlaybackCacheScope(auth, rightsMembership),
    hash.toLowerCase(),
    albumId,
    albumAudioId,
    effectiveQuality,
  ].join(':');
  const cached = kugouSongUrlCache.get(cacheKey);
  if (cached) {
    return attachKugouPlaybackStatus(cached, cookie, auth, membership);
  }
  console.log('[KugouSongUrl] hash:', hash, 'album:', albumId, 'mix:', albumAudioId, 'auth:', auth.playbackReady ? 'ready' : 'guest', 'tier:', membership.vipLevel);

  const candidates = hashCandidatesFromSong({
    FileHash: hash,
    HQFileHash: params.hqHash || params.hq_hash || '',
    SQFileHash: params.sqHash || params.sq_hash || '',
    ResFileHash: params.resHash || params.res_hash || '',
  }, effectiveQuality);
  if (!candidates.length) candidates.push({ hash, level: 'standard', label: '标准' });

  function rememberKugouSongUrl(payload) {
    if (!payload || !payload.url) return null;
    const resolvedLevel = normalizeQualityPreference(payload.level || payload.__candidate && payload.__candidate.level || 'standard');
    if (!membershipRights.canPlayVipTracks && resolvedLevel !== 'standard') return null;
    if (membershipRights.canPlayVipTracks && !membershipRights.canPlaySvipTracks &&
        (resolvedLevel === 'jymaster' || resolvedLevel === 'hires')) return null;
    payload = Object.assign({}, payload, {
      requestedQuality,
      effectiveQuality,
      qualityDowngraded: requestedQuality !== resolvedLevel,
    });
    if (payload) delete payload.__candidate;
    kugouSongUrlCache.set(cacheKey, payload);
    return attachKugouPlaybackStatus(payload, cookie, auth, membership);
  }

  let lastRestriction = null;
  let trialCandidate = null;
  const deadline = Date.now() + KUGOU_PLAY_BUDGET_MS;
  const rememberRestriction = value => {
    if (!value || !value.restricted) return;
    if (!lastRestriction || value.category !== 'url_unavailable') lastRestriction = value;
  };
  for (const item of candidates) {
    const attempts = [
      timeout => kugouPlayViaH5(item.hash, albumId, albumAudioId, cookie, item.level, playbackMembership, timeout),
      timeout => kugouPlayViaWeb(item.hash, albumId, albumAudioId, cookie, timeout),
      timeout => kugouPlayViaMobile(item.hash, albumId, cookie, playbackMembership, timeout),
      timeout => kugouPlayViaGateway(item.hash, albumId, albumAudioId, cookie, item.level, playbackMembership, timeout),
      timeout => kugouPlayViaWeb(item.hash, albumId, albumAudioId, cookie, timeout, true),
    ];
    for (const run of attempts) {
      const remaining = deadline - Date.now();
      if (remaining < 250) break;
      let result;
      try {
        result = await run(Math.min(KUGOU_PLAY_ATTEMPT_MS, remaining));
      } catch (_) {
        // One unavailable endpoint must not prevent the remaining official routes.
        rememberRestriction({ restricted: true, category: 'url_unavailable', message: '酷狗播放接口暂时不可用，请稍后重试' });
        continue;
      }
      if (result && result.url) {
        const payload = {
          provider: 'kugou',
          url: result.url,
          playable: true,
          trial: !!result.trial,
          level: result.level || item.level,
          quality: result.quality || item.label,
          requestedQuality,
          hash: item.hash,
          playbackSource: result.source,
          __candidate: item,
        };
        // Keep an official preview as a preview while checking for a full authorized stream.
        if (payload.trial) {
          if (!trialCandidate) trialCandidate = payload;
          continue;
        }
        const accepted = rememberKugouSongUrl(payload);
        if (accepted) return accepted;
        rememberRestriction({ restricted: true, category: 'vip_required', message: '当前酷狗账号没有该音质的播放权限' });
      }
      rememberRestriction(result);
    }
    if (Date.now() >= deadline) break;
  }
  if (trialCandidate) {
    const accepted = rememberKugouSongUrl(trialCandidate);
    if (accepted) return accepted;
  }
  const restriction = lastRestriction || {
    category: 'url_unavailable',
    message: '酷狗暂未返回播放地址，请稍后重试',
  };
  return attachKugouPlaybackStatus({
    provider: 'kugou',
    url: '',
    playable: false,
    reason: restriction.category,
    message: restriction.message,
    restriction: { category: restriction.category, message: restriction.message },
    requestedQuality,
    effectiveQuality,
    qualityDowngraded: requestedQuality !== effectiveQuality,
    hash,
  }, cookie, auth, membership);
}

function decodeKugouLyricContent(content) {
  const raw = String(content || '').trim();
  if (!raw) return '';
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8').replace(/^\uFEFF/, '');
    if (decoded && (decoded.includes('[') || /[\u4e00-\u9fa5]/.test(decoded))) return decoded;
  } catch (_) {}
  return raw;
}

async function handleKugouLyric(hash, albumAudioId, durationSec) {
  const fileHash = String(hash || '').trim();
  if (!fileHash) return { provider: 'kugou', error: 'Missing Kugou hash', lyric: '' };
  const u = new URL(KUGOU_LYRIC_SEARCH);
  u.searchParams.set('ver', '1');
  u.searchParams.set('man', 'yes');
  u.searchParams.set('client', 'pc');
  u.searchParams.set('keyword', '');
  u.searchParams.set('duration', String(Math.max(0, Number(durationSec) || 0)));
  u.searchParams.set('hash', fileHash);
  if (albumAudioId) u.searchParams.set('album_audio_id', albumAudioId);
  const search = await requestJson(u.toString(), { headers: KUGOU_HEADERS });
  const candidate = search && Array.isArray(search.candidates) && search.candidates[0];
  if (!candidate || !candidate.id) {
    return { provider: 'kugou', hash: fileHash, lyric: '', trans: '' };
  }
  const dl = new URL(KUGOU_LYRIC_DOWNLOAD);
  dl.searchParams.set('ver', '1');
  dl.searchParams.set('client', 'pc');
  dl.searchParams.set('id', String(candidate.id));
  dl.searchParams.set('accesskey', candidate.accesskey || '');
  dl.searchParams.set('fmt', 'lrc');
  dl.searchParams.set('charset', 'utf8');
  const lyricJson = await requestJson(dl.toString(), { headers: KUGOU_HEADERS });
  const lyric = decodeKugouLyricContent(lyricJson && lyricJson.content);
  return { provider: 'kugou', hash: fileHash, lyric, trans: '' };
}

function kugouUnknownWebMembershipPayload() {
  return {
    __kugouMembershipUnknown: true,
    __kugouMembershipOrigin: 'kugou-web-roleinfo',
  };
}

function normalizeKugouWebRoleInfoPayload(payload, auth) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return kugouUnknownWebMembershipPayload();
  }
  const data = payload.data || payload.result || payload;
  const errorObjects = [payload, data].filter(value => value && typeof value === 'object');
  const hasErrorCode = errorObjects.some(value => [
    value.errno,
    value.error_code,
    value.errorCode,
    value.errcode,
    value.err_code,
  ].some(code => Number.isFinite(Number(code)) && Number(code) > 0));
  const explicitlyFailed = errorObjects.some(value =>
    value.success === false ||
    (Object.prototype.hasOwnProperty.call(value, 'status') && Number(value.status) === 0) ||
    /^(-1|false|fail|failed|error)$/i.test(String(value.status == null ? '' : value.status).trim()) ||
    (typeof value.error === 'string' && value.error.trim() !== '')
  );
  if (hasErrorCode || explicitlyFailed) return kugouUnknownWebMembershipPayload();

  const expectedUserId = String(auth && auth.userid || '').replace(/\D/g, '');
  const objects = collectKugouVipObjects(payload, [], 0, expectedUserId, '');
  const roleInfoRecord = objects.find(value =>
    kugouNumberFieldState([value], KUGOU_WEB_ROLE_KEYS).present
  ) || objects.find(value => kugouObjectHasMembershipSignal(value, true));
  if (!roleInfoRecord) return kugouUnknownWebMembershipPayload();
  return {
    data: Object.assign({}, roleInfoRecord),
    __kugouMembershipOrigin: 'kugou-web-roleinfo',
  };
}

async function fetchKugouWebVipInfo(cookie, auth) {
  auth = auth || extractKugouAuth(cookie);
  if (!auth.loggedIn || !cookie) return kugouUnknownWebMembershipPayload();
  const url = new URL(KUGOU_VIP_ROLEINFO_URL);
  url.searchParams.set('n', String(Date.now()));
  let timer = null;
  try {
    const payload = await Promise.race([
      requestJson(url.toString(), {
        timeoutMs: 2500,
        headers: {
          Accept: 'application/json, text/javascript, */*; q=0.01',
          Referer: 'https://vip.kugou.com/',
          'User-Agent': KUGOU_H5_UA,
          'X-Requested-With': 'XMLHttpRequest',
          Cookie: buildKugouRequestCookie(cookie),
        },
      }).catch(() => null),
      new Promise(resolve => {
        timer = setTimeout(() => resolve(null), 2500);
        if (typeof timer.unref === 'function') timer.unref();
      }),
    ]);
    return normalizeKugouWebRoleInfoPayload(payload, auth);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchKugouVipInfo(cookie, auth) {
  auth = auth || extractKugouAuth(cookie);
  if (!auth.loggedIn) return null;
  const cacheKey = kugouVipCacheKey(auth);
  return kugouVipCache.wrap(cacheKey, (value) => {
    const staleUntil = Number(value && value.__kugouMembershipStaleUntil) || 0;
    if (staleUntil > 0) return Math.max(1000, Math.min(30 * 1000, staleUntil - Date.now()));
    if (value && value.__kugouMembershipUnknown) return 10 * 1000;
    const parsed = normalizeKugouVipPayloadV2(value, { userid: auth.userid });
    return parsed.isVip ? 5 * 60 * 1000 : 60 * 1000;
  }, async () => {
    const webRoleInfo = await fetchKugouWebVipInfo(cookie, auth).catch(() => kugouUnknownWebMembershipPayload());
    const webMembership = normalizeKugouVipPayloadV2(webRoleInfo, { userid: auth.userid });
    if (webMembership.membershipKnown) {
      return stabilizeKugouVipProbe(cacheKey, webRoleInfo, auth);
    }
    if (!auth.playbackReady) {
      return stabilizeKugouVipProbe(cacheKey, webRoleInfo, auth);
    }

    const attempts = [
      () => kugouGatewayRequest('/v1/get_union_vip', {
        method: 'GET',
        cookie,
        params: { busi_type: 'concept' },
        headers: { Referer: 'https://vip.kugou.com/' },
      }),
      () => kugouGatewayRequest('/v1/vipuser_sub', {
        method: 'GET',
        cookie,
        params: { busi_type: 'concept' },
        headers: { Referer: 'https://vip.kugou.com/' },
      }),
      () => kugouGatewayRequest('/kugouvip/v2/batch_union_vipinfo', {
        method: 'GET',
        cookie,
        params: { busi_type: 'concept', userids: auth.userid },
        headers: { Referer: 'https://vip.kugou.com/' },
      }),
      () => kugouGatewayRequest('/kugouvip/v1/batch_union_vipinfo', {
        method: 'GET',
        cookie,
        params: { busi_type: 'concept', userids: auth.userid },
        headers: { Referer: 'https://vip.kugou.com/' },
      }),
      () => kugouGatewayRequest('/mobile/vipinfo', {
        method: 'GET',
        cookie,
        params: { plat: 0 },
        headers: { Referer: 'https://vip.kugou.com/' },
      }),
      () => kugouGatewayRequest('/v1/get_union_vip', {
        method: 'GET',
        cookie,
        baseURL: 'https://kugouvip.kugou.com',
        params: { busi_type: 'concept' },
        headers: { Referer: 'https://vip.kugou.com/' },
      }),
    ];
    const primary = await Promise.race([
      Promise.resolve().then(attempts[0]).catch(() => null),
      new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), 1500);
        if (typeof timer.unref === 'function') timer.unref();
      }),
    ]);
    const primaryMembership = normalizeKugouVipPayloadV2(primary, { userid: auth.userid });
    if (primaryMembership.isVip) return stabilizeKugouVipProbe(cacheKey, primary, auth);

    const result = await new Promise(resolve => {
      let settled = false;
      const fallbackAttempts = attempts.slice(1);
      let pending = fallbackAttempts.length;
      let knownNonMember = primaryMembership.membershipKnown ? primary : null;
      let allCompletedAreKnownOrdinary = !!primaryMembership.membershipKnown;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value || { __kugouMembershipUnknown: true });
      };
      const timer = setTimeout(() => finish(null), 5000);
      if (typeof timer.unref === 'function') timer.unref();
      fallbackAttempts.forEach(run => {
        Promise.resolve().then(run).then(data => {
          const parsed = normalizeKugouVipPayloadV2(data, { userid: auth.userid });
          if (parsed.membershipKnown) {
            if (parsed.isVip) {
              finish(data);
              return;
            }
            if (!knownNonMember) knownNonMember = data;
          } else {
            allCompletedAreKnownOrdinary = false;
          }
          pending -= 1;
          if (pending <= 0) finish(allCompletedAreKnownOrdinary ? knownNonMember : null);
        }).catch(() => {
          allCompletedAreKnownOrdinary = false;
          pending -= 1;
          if (pending <= 0) finish(null);
        });
      });
    });
    return stabilizeKugouVipProbe(cacheKey, result, auth);
  });
}

async function getKugouLoginInfo(cookie) {
  const auth = extractKugouAuth(cookie);
  const [profile, vipProbe] = await Promise.all([
    (!auth.nickname || !auth.avatar) ? fetchKugouProfileFromPlaylists(cookie, auth).catch(() => ({})) : {},
    fetchKugouVipInfo(cookie, auth).catch(() => null),
  ]);
  const vip = normalizeKugouVipPayloadV2(vipProbe, auth);
  const nickname = auth.nickname || profile.nickname || (auth.loggedIn ? ('酷狗 ' + (auth.userid || '用户')) : '酷狗音乐');
  return {
    provider: 'kugou',
    loggedIn: auth.loggedIn,
    playbackReady: auth.playbackReady,
    playbackKeyReady: auth.playbackReady,
    userId: auth.userid,
    nickname,
    avatar: auth.avatar || profile.avatar || '',
    vipType: vip.vipType,
    svipType: vip.svipType,
    vipLevel: vip.vipLevel,
    isVip: vip.isVip,
    isSvip: vip.isSvip,
    hasMusicPackage: !!vip.hasMusicPackage,
    musicPackageType: Number(vip.musicPackageType) || 0,
    musicPackageExpiresAt: Number(vip.musicPackageExpiresAt) || 0,
    membershipTier: vip.membershipTier || vip.vipLevel || 'none',
    vipLabel: vip.vipLevel === 'svip' ? 'SVIP' : (vip.vipLevel === 'vip' ? 'VIP' : '无VIP'),
    membershipKnown: !!vip.membershipKnown,
    membershipVerified: !!vip.membershipVerified,
    membershipStale: !!vip.membershipStale,
    vipSyncState: vip.vipSyncState || (vip.membershipKnown ? 'checked' : 'unknown'),
    membershipSource: vip.membershipSource || 'none',
    membershipRights: kugouMembershipRights(Object.assign({}, vip, {
      playbackReady: auth.playbackReady,
    })),
    expiresAt: Number(vip.expiresAt) || 0,
    hasCookie: !!cookie,
    hasToken: !!auth.token,
  };
}

function kugouProfileCacheKey(auth) {
  auth = auth || {};
  return 'profile|' + kugouVipCacheKey(auth);
}

function pickKugouProfileFromLists(lists, auth) {
  auth = auth || {};
  lists = Array.isArray(lists) ? lists : [];
  let selected = null;
  for (const item of lists) {
    if (!item || typeof item !== 'object') continue;
    const itemUserId = String(item.list_create_userid || item.userid || item.user_id || item.owner_id || '').replace(/\D/g, '');
    if (auth.userid && itemUserId && itemUserId === auth.userid) {
      selected = item;
      break;
    }
    if (!selected) selected = item;
  }
  if (!selected) return {};
  const nickname = stripKugouHtml(
    selected.nickname ||
    selected.username ||
    selected.user_name ||
    selected.list_create_username ||
    selected.owner_name ||
    ''
  );
  const avatar = kugouCoverUrl(
    selected.create_user_pic ||
    selected.user_pic ||
    selected.avatar ||
    selected.pic ||
    selected.img ||
    selected.imgurl ||
    '',
    120
  );
  return { nickname, avatar };
}

async function fetchKugouProfileFromPlaylists(cookie, auth) {
  auth = auth || extractKugouAuth(cookie);
  if (!auth.playbackReady) return {};
  const cacheKey = kugouProfileCacheKey(auth);
  return kugouProfileCache.wrap(cacheKey, 5 * 60 * 1000, async () => {
    const json = await kugouH5GatewayRequest('/v7/get_all_list', {
      method: 'POST',
      timeoutMs: 2500,
      cookie,
      router: 'cloudlist.service.kugou.com',
      params: { plat: 1 },
      body: {
        userid: Number(auth.userid),
        token: auth.token,
        total_ver: 979,
        type: 2,
        page: 1,
        pagesize: 20,
      },
    });
    const data = (json && json.data) || {};
    return pickKugouProfileFromLists(extractKugouGatewayPlaylistLists(data), auth);
  });
}

function mapKugouPlaylistItem(item) {
  item = item || {};
  const id = item.global_collection_id || item.specialid || item.listid || item.list_id || item.id || '';
  const listId = item.list_create_listid || item.listid || parseKugouListId(id) || '';
  return {
    provider: 'kugou',
    source: 'kugou',
    id: String(id || listId),
    listId: String(listId || ''),
    name: stripKugouHtml(item.name || item.listname || item.specialname || item.title || '酷狗歌单'),
    cover: kugouCoverUrl(item.pic || item.img || item.imgurl || item.sizable_cover || item.create_user_pic || '', 240),
    trackCount: Number(item.count || item.m_count || item.song_count || item.total || item.list_count || 0) || 0,
    creator: stripKugouHtml(item.nickname || item.username || item.user_name || item.list_create_username || ''),
  };
}

function mapKugouPlaylistTrack(item) {
  item = item || {};
  const singers = Array.isArray(item.singerinfo) ? item.singerinfo : (Array.isArray(item.Singers) ? item.Singers : []);
  const artistLabel = singers.map(s => s.name || s.SingerName).filter(Boolean).join(' / ');
  const mixSongId = item.mixsongid != null ? String(item.mixsongid) : (item.MixSongID != null ? String(item.MixSongID) : (item.album_audio_id != null ? String(item.album_audio_id) : ''));
  const mapped = mapKugouSearchItem(Object.assign({}, item, {
    FileHash: item.hash || item.FileHash,
    SongName: stripKugouFileName(item.name || item.SongName || item.filename, artistLabel),
    SingerName: item.SingerName || artistLabel,
    Singers: singers,
    AlbumID: (item.albuminfo && item.albuminfo.id) || item.album_id || item.AlbumID,
    MixSongID: mixSongId,
    EMixSongID: (/^\d+$/.test(mixSongId) ? mixSongId : '') || item.album_audio_id || item.EMixSongID,
    AlbumName: (item.albuminfo && item.albuminfo.name) || item.album_name || item.AlbumName,
    Image: item.cover || item.img || item.Image || (item.trans_param && item.trans_param.union_cover),
    Duration: item.duration || (item.timelen ? Math.round(Number(item.timelen) / 1000) : 0) || item.Duration,
    Privilege: item.media_privilege != null ? item.media_privilege : (item.privilege != null ? item.privilege : item.Privilege),
  }));
  if (!mapped.hash && item.hash) mapped.hash = item.hash;
  if (!mapped.albumAudioId && item.album_audio_id) mapped.albumAudioId = String(item.album_audio_id);
  if (!mapped.albumId && item.album_id) mapped.albumId = String(item.album_id);
  if (item.fileid != null || item.file_id != null) mapped.fileId = String(item.fileid != null ? item.fileid : item.file_id);
  return mapped;
}

async function handleKugouUserPlaylists(cookie) {
  const auth = extractKugouAuth(cookie);
  if (!auth.playbackReady) {
    return { provider: 'kugou', loggedIn: auth.loggedIn, playbackReady: false, playlists: [], error: 'KUGOU_AUTH_REQUIRED', message: '酷狗登录未完成，请重新网页登录' };
  }
  try {
    const json = await kugouH5GatewayRequest('/v7/get_all_list', {
      method: 'POST',
      cookie,
      router: 'cloudlist.service.kugou.com',
      params: { plat: 1 },
      body: {
        userid: Number(auth.userid),
        token: auth.token,
        total_ver: 979,
        type: 2,
        page: 1,
        pagesize: 50,
      },
    });
    const data = (json && json.data) || {};
    const info = data.info || data;
    const hasListShape = [data.info, data.list, info.collect, info.love, info.self, info.list].some(Array.isArray);
    if (Number(json && json.status) !== 1 || !hasListShape) throw new Error('KUGOU_PLAYLIST_RESPONSE_INVALID');
    const lists = extractKugouGatewayPlaylistLists(data);
    const profile = pickKugouProfileFromLists(lists, auth);
    if (profile.nickname || profile.avatar) kugouProfileCache.set(kugouProfileCacheKey(auth), profile, 5 * 60 * 1000);
    const playlists = lists.map(mapKugouPlaylistItem).filter(pl => pl.id && pl.name);
    return {
      provider: 'kugou',
      loggedIn: true,
      playbackReady: true,
      libraryReady: true,
      userId: auth.userid,
      nickname: auth.nickname || profile.nickname || '',
      avatar: auth.avatar || profile.avatar || '',
      playlists,
    };
  } catch (err) {
    return {
      provider: 'kugou',
      loggedIn: true,
      playbackReady: true,
      libraryReady: false,
      playlists: [],
      error: err.message || 'KUGOU_PLAYLIST_FAILED',
      upstreamCode: err.upstreamCode,
      message: '酷狗歌单加载失败，请稍后重试',
    };
  }
}

async function handleKugouPlaylistTracks(playlistId, cookie, opts = {}) {
  const auth = extractKugouAuth(cookie);
  if (!auth.playbackReady) {
    return { provider: 'kugou', tracks: [], total: 0, error: 'KUGOU_AUTH_REQUIRED', message: '酷狗登录未完成' };
  }
  const listid = parseKugouListId(playlistId);
  if (!listid) return { provider: 'kugou', tracks: [], total: 0, error: 'MISSING_PLAYLIST_ID' };
  const paged = !!opts.paged;
  const pagesize = Math.max(1, Math.min(50, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const cacheKey = String(listid) + ':' + String(auth.userid || '0');
  async function fetchPage(pageNo, baseOffset) {
    baseOffset = baseOffset || 0;
    const json = await kugouH5GatewayRequest('/v4/get_list_all_file', {
      method: 'POST',
      cookie,
      router: 'cloudlist.service.kugou.com',
      params: { plat: 1 },
      body: {
        listid: Number(listid) || listid,
        userid: Number(auth.userid),
        area_code: 1,
        show_relate_goods: 0,
        pagesize,
        allplatform: 1,
        show_cover: 1,
        type: 0,
        token: auth.token,
        page: pageNo,
      },
    });
    const data = (json && json.data) || {};
    const chunk = data.info || data.songs || data.lists || data.file || [];
    if (Number(json && json.status) !== 1 || ![data.info, data.songs, data.lists, data.file, chunk.file].some(Array.isArray)) {
      throw new Error('KUGOU_PLAYLIST_TRACKS_RESPONSE_INVALID');
    }
    const list = Array.isArray(chunk) ? chunk : (Array.isArray(chunk.file) ? chunk.file : []);
    const tracks = list.map((item, index) => {
      const mapped = mapKugouPlaylistTrack(item);
      mapped.addedAt = Number(item.addtime || item.add_time || item.collect_time || item.ctime || item.belong_cd_addtime || 0) || 0;
      mapped.playlistIndex = baseOffset + index;
      return mapped;
    }).filter(s => s.name && (s.hash || s.id));
    const total = Number(data.count || 0) || tracks.length;
    return { tracks, total };
  }
  async function fetchOrigRange(origStart, count) {
    const out = [];
    let remaining = count;
    let pos = origStart;
    while (remaining > 0) {
      const pageNo = Math.floor(pos / pagesize) + 1;
      const baseOffset = (pageNo - 1) * pagesize;
      const chunk = await fetchPage(pageNo, baseOffset);
      if (!chunk.tracks.length) break;
      const inPage = pos - baseOffset;
      const take = Math.min(remaining, chunk.tracks.length - inPage);
      if (take <= 0) break;
      out.push(...chunk.tracks.slice(inPage, inPage + take));
      remaining -= take;
      pos += take;
    }
    return out;
  }
  function reverseKugouTracks(tracks, listOffset) {
    tracks.reverse();
    tracks.forEach(function (t, i) {
      t.playlistIndex = listOffset + i;
    });
    return tracks;
  }
  try {
    if (paged) {
      const probe = await fetchPage(1, 0);
      const total = probe.total || probe.tracks.length;
      if (!total) {
        return {
          provider: 'kugou',
          id: String(playlistId || listid),
          tracks: reverseKugouTracks(probe.tracks.slice(), offset),
          total: probe.tracks.length,
          offset,
          limit: pagesize,
          hasMore: false,
        };
      }
      var origStart = Math.max(0, total - offset - pagesize);
      var origEnd = total - offset;
      var count = Math.min(pagesize, Math.max(0, origEnd - origStart));
      if (count <= 0) {
        return {
          provider: 'kugou',
          id: String(playlistId || listid),
          tracks: [],
          total,
          offset,
          limit: pagesize,
          hasMore: false,
        };
      }
      var pageTracks = reverseKugouTracks(await fetchOrigRange(origStart, count), offset);
      return {
        provider: 'kugou',
        id: String(playlistId || listid),
        tracks: pageTracks,
        total,
        offset,
        limit: pagesize,
        hasMore: offset + pageTracks.length < total,
      };
    }
    return await kugouPlaylistTracksCache.wrap(cacheKey, null, async () => {
      const tracks = [];
      let total = 0;
      for (let round = 0; round < 500; round++) {
        const chunk = await fetchPage(round + 1, tracks.length);
        total = chunk.total || total;
        if (!chunk.tracks.length) break;
        tracks.push(...chunk.tracks);
        if (chunk.tracks.length < pagesize || (total && tracks.length >= total)) break;
      }
      reverseKugouTracks(tracks, 0);
      return { provider: 'kugou', id: String(playlistId || listid), tracks, total: total || tracks.length };
    });
  } catch (err) {
    return {
      provider: 'kugou',
      id: String(playlistId || listid),
      tracks: [],
      total: 0,
      error: err.message || 'KUGOU_PLAYLIST_TRACKS_FAILED',
      upstreamCode: err.upstreamCode,
      message: '酷狗歌单歌曲加载失败',
    };
  }
}

function kugouAudioReferer(audioUrl) {
  try {
    const host = new URL(audioUrl).hostname.toLowerCase();
    if (host.includes('kugou.com')) return 'https://www.kugou.com/';
  } catch (_) {}
  return '';
}

let kugouFavoriteListCache = { listId: '', userId: '', at: 0 };
const kugouLikeFileIdByHash = new Map();

function extractKugouGatewayPlaylistLists(data) {
  data = (data && data.data) || data || {};
  if (Array.isArray(data.info)) return data.info;
  const info = data.info || data;
  return []
    .concat(Array.isArray(info.collect) ? info.collect : [])
    .concat(Array.isArray(info.love) ? info.love : [])
    .concat(Array.isArray(info.self) ? info.self : [])
    .concat(Array.isArray(info.list) ? info.list : [])
    .concat(Array.isArray(data.list) ? data.list : []);
}

function isKugouFavoritePlaylistName(name) {
  return /我喜欢|我的收藏|favorite|liked/i.test(String(name || '').trim());
}

function isKugouPrimaryFavoritePlaylistName(name) {
  return /我喜欢|liked music|my favorites?/i.test(String(name || '').trim());
}

function kugouPlaylistDisplayName(item) {
  item = item || {};
  return String(item.name || item.listname || item.specialname || '').trim();
}

function pickKugouFavoritePlaylist(lists) {
  lists = Array.isArray(lists) ? lists : [];
  let fav = lists.find(item => isKugouPrimaryFavoritePlaylistName(kugouPlaylistDisplayName(item)));
  if (!fav) fav = lists.find(item => Number(item.type) === 0 && isKugouPrimaryFavoritePlaylistName(kugouPlaylistDisplayName(item)));
  if (!fav) fav = lists.find(item => isKugouFavoritePlaylistName(kugouPlaylistDisplayName(item)));
  if (!fav) fav = lists.find(item => Number(item.is_default) === 1 || Number(item.default) === 1);
  return fav || null;
}

function resolveKugouFavoriteListIdFromItem(item) {
  if (!item) return '';
  return String(item.list_create_listid || item.listid || item.list_id || parseKugouListId(item.global_collection_id) || item.id || '').trim();
}

async function resolveKugouFavoriteListId(cookie) {
  const auth = extractKugouAuth(cookie);
  if (!auth.playbackReady) return '';
  if (kugouFavoriteListCache.listId && kugouFavoriteListCache.userId === auth.userid && Date.now() - kugouFavoriteListCache.at < 300000) {
    return kugouFavoriteListCache.listId;
  }
  const json = await kugouH5GatewayRequest('/v7/get_all_list', {
    method: 'POST',
    cookie,
    router: 'cloudlist.service.kugou.com',
    params: { plat: 1 },
    body: {
      userid: Number(auth.userid),
      token: auth.token,
      total_ver: 979,
      type: 2,
      page: 1,
      pagesize: 50,
    },
  });
  const lists = extractKugouGatewayPlaylistLists(json);
  const fav = pickKugouFavoritePlaylist(lists);
  const listId = resolveKugouFavoriteListIdFromItem(fav);
  if (listId) kugouFavoriteListCache = { listId, userId: auth.userid, at: Date.now() };
  return listId;
}

function buildKugouSongResource(song) {
  song = song || {};
  const hash = String(song.hash || song.fileHash || song.id || '').trim().toLowerCase();
  const name = String(song.name || song.title || '').trim();
  const albumId = Number(song.albumId || song.album_id || 0) || 0;
  const mixsongid = resolveKugouAlbumAudioId(song) || 0;
  const durationMs = Number(song.duration || 0) || 0;
  return {
    number: 1,
    name,
    hash,
    size: 0,
    sort: 0,
    timelen: durationMs > 1000 ? Math.round(durationMs) : Math.round(durationMs * 1000),
    bitrate: 0,
    album_id: albumId,
    mixsongid: Number(mixsongid) || 0,
  };
}

async function fetchKugouFavoriteHashSet(cookie, hashSet, maxPages) {
  const listId = await resolveKugouFavoriteListId(cookie);
  const liked = {};
  if (!listId || !hashSet || !hashSet.size) return { listId, liked };
  maxPages = Math.max(1, Math.min(16, Number(maxPages) || 8));
  const first = await handleKugouPlaylistTracks(listId, cookie, { limit: 50, offset: 0, paged: true });
  const total = Math.max(Number(first.total || 0), (first.tracks || []).length);
  const totalPages = Math.max(1, Math.ceil(total / 50));
  const pageOrder = [];
  for (let page = totalPages; page >= 1 && pageOrder.length < maxPages; page -= 1) pageOrder.push(page);
  for (let page = 1; page <= totalPages && pageOrder.length < maxPages * 2; page += 1) {
    if (pageOrder.indexOf(page) < 0) pageOrder.push(page);
  }
  for (let i = 0; i < pageOrder.length; i += 1) {
    const page = pageOrder[i];
    const chunk = page === 1 && (first.tracks || []).length
      ? first
      : await handleKugouPlaylistTracks(listId, cookie, { limit: 50, offset: (page - 1) * 50, paged: true });
    const tracks = chunk.tracks || [];
    if (!tracks.length) continue;
    tracks.forEach(track => {
      const hash = String(track.hash || track.fileHash || '').toLowerCase();
      if (!hash || !hashSet.has(hash)) return;
      liked[hash] = true;
      if (track.fileId) kugouLikeFileIdByHash.set(hash, String(track.fileId));
    });
    if (Object.keys(liked).length >= hashSet.size) break;
  }
  return { listId, liked };
}

async function handleKugouLikeCheck(params, cookie) {
  const raw = String((params && (params.hashes || params.hash)) || '').trim();
  const hashes = raw.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  if (!hashes.length) return { provider: 'kugou', liked: {} };
  const auth = extractKugouAuth(cookie);
  if (!auth.playbackReady) return { provider: 'kugou', liked: {}, error: 'KUGOU_AUTH_REQUIRED' };
  const hashSet = new Set(hashes);
  const { liked, listId, error } = await fetchKugouFavoriteHashSet(cookie, hashSet, 6).catch(err => ({ liked: {}, listId: '', error: err.message }));
  if (error && !listId) return { provider: 'kugou', liked: {}, error };
  return { provider: 'kugou', liked, listId };
}

async function handleKugouAddSongToList(listId, song, cookie) {
  const auth = extractKugouAuth(cookie);
  if (!auth.playbackReady) return { provider: 'kugou', success: false, error: 'KUGOU_AUTH_REQUIRED' };
  const targetListId = String(listId || '').trim() || await resolveKugouFavoriteListId(cookie);
  if (!targetListId) return { provider: 'kugou', success: false, error: 'KUGOU_FAVORITE_LIST_NOT_FOUND' };
  const resource = buildKugouSongResource(song);
  const body = {
    userid: Number(auth.userid),
    token: auth.token,
    listid: Number(targetListId) || targetListId,
    list_ver: 0,
    type: 0,
    slow_upload: 1,
    scene: 'false;null',
    data: [resource],
  };
  const json = await kugouH5GatewayRequest('/v6/add_song', {
    method: 'POST',
    cookie,
    router: 'cloudlist.service.kugou.com',
    params: {
      last_time: Math.floor(Date.now() / 1000),
      last_area: 'gztx',
      userid: auth.userid,
      token: auth.token,
    },
    body,
  });
  if (resource.hash) kugouLikeFileIdByHash.delete(resource.hash);
  return { provider: 'kugou', success: true, liked: true, listId: targetListId, body: json };
}

async function findKugouFavoriteFileId(song, cookie, listId) {
  const hash = String((song && (song.hash || song.fileHash || song.id)) || '').trim().toLowerCase();
  if (!hash) return '';
  if (kugouLikeFileIdByHash.has(hash)) return kugouLikeFileIdByHash.get(hash);
  listId = String(listId || '').trim() || await resolveKugouFavoriteListId(cookie);
  if (!listId) return '';
  for (let page = 1; page <= 6; page += 1) {
    const chunk = await handleKugouPlaylistTracks(listId, cookie, { limit: 50, offset: (page - 1) * 50, paged: true });
    const tracks = chunk.tracks || [];
    for (let i = 0; i < tracks.length; i += 1) {
      const track = tracks[i];
      const trackHash = String(track.hash || track.fileHash || '').toLowerCase();
      if (trackHash !== hash) continue;
      if (track.fileId) {
        kugouLikeFileIdByHash.set(hash, String(track.fileId));
        return String(track.fileId);
      }
    }
    if (!tracks.length || tracks.length < 50) break;
  }
  return '';
}

async function handleKugouRemoveSongFromList(listId, song, cookie) {
  const auth = extractKugouAuth(cookie);
  if (!auth.playbackReady) return { provider: 'kugou', success: false, error: 'KUGOU_AUTH_REQUIRED' };
  const targetListId = String(listId || '').trim() || await resolveKugouFavoriteListId(cookie);
  if (!targetListId) return { provider: 'kugou', success: false, error: 'KUGOU_FAVORITE_LIST_NOT_FOUND' };
  const fileId = await findKugouFavoriteFileId(song, cookie, targetListId);
  if (!fileId) return { provider: 'kugou', success: false, error: 'KUGOU_SONG_NOT_IN_LIST' };
  const body = {
    listid: Number(targetListId) || targetListId,
    userid: Number(auth.userid),
    token: auth.token,
    type: 0,
    list_ver: 0,
    data: [{ fileid: Number(fileId) || fileId }],
  };
  const json = await kugouH5GatewayRequest('/v4/delete_songs', {
    method: 'POST',
    cookie,
    router: 'cloudlist.service.kugou.com',
    body,
  });
  const hash = String((song && (song.hash || song.fileHash || song.id)) || '').trim().toLowerCase();
  if (hash) kugouLikeFileIdByHash.delete(hash);
  return { provider: 'kugou', success: true, liked: false, listId: targetListId, body: json };
}

async function handleKugouLikeToggle(song, like, cookie) {
  if (like) return handleKugouAddSongToList('', song, cookie);
  return handleKugouRemoveSongFromList('', song, cookie);
}

async function handleKugouPlaylistAddSong(listId, song, cookie) {
  return handleKugouAddSongToList(listId, song, cookie);
}

function kugouSignParamsKey(clienttime) {
  return crypto.createHash('md5').update(`${KUGOU_APPID}${KUGOU_CLIENTVER}${clienttime}${KUGOU_ANDROID_SALT}`).digest('hex');
}

function extractKugouGuessSongList(json) {
  const data = json && json.data;
  const candidates = [
    data && data.info,
    data && data.song_list,
    data && data.songs,
    data && data.list,
    data && data.songlist,
    json && json.info,
    json && json.list,
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (Array.isArray(candidates[i]) && candidates[i].length) return candidates[i];
  }
  return [];
}

async function handleKugouGuessLike(cookie, limit) {
  limit = Math.max(1, Math.min(Number(limit) || 12, 20));
  const auth = extractKugouAuth(cookie);
  if (!auth.playbackReady) {
    return { provider: 'kugou', loggedIn: false, songs: [], error: 'KUGOU_AUTH_REQUIRED' };
  }
  const clienttime = Date.now();
  const payload = {
    appid: KUGOU_APPID,
    area_code: 1,
    clienttime,
    clientver: KUGOU_CLIENTVER,
    data: [{ fmid: '0', fmtype: 2, offset: -1, size: limit, singername: '' }],
    get_tracker: 1,
    key: kugouSignParamsKey(clienttime),
    mid: auth.mid,
    uid: Number(auth.userid || 0),
  };
  try {
    const json = await kugouGatewayRequest('/v1/app_song_list_offset', {
      cookie,
      method: 'POST',
      body: payload,
      router: 'fm.service.kugou.com',
    });
    const songs = extractKugouGuessSongList(json).map(mapKugouPlaylistTrack).filter(s => s.name && (s.hash || s.id));
    if (songs.length) {
      return { provider: 'kugou', loggedIn: true, songs: songs.slice(0, limit), updatedAt: Date.now() };
    }
  } catch (e) {
    console.warn('[KugouGuessLike] fm:', e.message);
  }
  return { provider: 'kugou', loggedIn: true, songs: [], error: 'KUGOU_GUESS_EMPTY', updatedAt: Date.now() };
}

module.exports = {
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
  kugouCookieObject,
  kugouCookieHasLogin,
  kugouCookieHasPlayback,
  kugouCookieUserId,
  extractKugouAuth,
  buildKugouRequestCookie,
  kugouAudioReferer,
  mapKugouSearchItem,
  _test: {
    pickKugouPlayUrl,
    kugouPlaybackTrial,
    normalizeKugouVipPayloadV2,
    normalizeKugouWebRoleInfoPayload,
    fetchKugouWebVipInfo,
    fetchKugouVipInfo,
    kugouMembershipTime,
    kugouPlaybackParamsRequireVip,
    kugouPlaybackCacheScope,
    kugouMembershipRights,
    kugouEffectiveQuality,
    kugouVipCacheKey,
    stabilizeKugouVipProbe,
    clearKugouSessionCaches,
    extractKugouAuth,
  },
};
