// ====================================================================
//  kugou-lite.js — 酷狗音乐概念版（lite）API 内嵌调用层
//  - 直接加载 kugou-server（KuGouMusicApi，EchoMusic 同源）的模块
//  - 设备注册 / 签名 / 请求全部复用 kugou-server 的 util
//  - 提供搜索 / 歌词 / 播放URL / 用户信息 / VIP 的概念版实现
// ====================================================================
'use strict';

process.env.platform = 'lite'; // 必须最先设置：util/index.js 加载时读取

const path = require('path');
const fs = require('fs');

const KUGOU_SERVER_DIR = path.join(__dirname, 'kugou-server');

let _requestFactory = null;
let _crypto = null;
let _util = null;
let _cachedModules = Object.create(null);

function loadCore() {
  if (_requestFactory) return;
  _crypto = require(path.join(KUGOU_SERVER_DIR, 'util', 'crypto'));
  _util = require(path.join(KUGOU_SERVER_DIR, 'util', 'util'));
  const { createRequest } = require(path.join(KUGOU_SERVER_DIR, 'util', 'request'));
  _requestFactory = createRequest;
}

function loadModule(name) {
  if (_cachedModules[name]) return _cachedModules[name];
  const mod = require(path.join(KUGOU_SERVER_DIR, 'module', name + '.js'));
  _cachedModules[name] = mod;
  return mod;
}

// ---------- 设备状态（持久化，参照 EchoMusic server.ts 的 deviceStore）----------
// 关键：设备身份（guid/mid/dev/mac/webgl/dfid）必须跨启动稳定，否则 dfid 反复注册、
// 酷狗侧设备列表漂移（也会影响扫码/风控）。EchoMusic 会把 guid/mac 落盘并复用真实网卡 MAC。
let _device = null;
let _deviceStore = null;

function deviceStoreFile() {
  if (process.env.MINERADIO_KUGOU_DEVICE_STORE) return process.env.MINERADIO_KUGOU_DEVICE_STORE;
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'kugou-device.json');
    }
  } catch (_) { /* 非 Electron 环境（如独立 node 调用）走下面的兜底路径 */ }
  const base = process.env.XDG_CONFIG_HOME || path.join(require('os').homedir(), '.config');
  return path.join(base, 'Mineradio', 'kugou-device.json');
}

function loadDeviceStore() {
  if (_deviceStore) return _deviceStore;
  _deviceStore = {};
  try {
    const file = deviceStoreFile();
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (raw && typeof raw === 'object') _deviceStore = raw;
    }
  } catch (e) {
    console.warn('[KugouLite] device store read failed:', e && e.message);
  }
  return _deviceStore;
}

function saveDeviceStore() {
  try {
    const file = deviceStoreFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(_deviceStore, null, 2), { mode: 0o600 });
  } catch (e) {
    console.warn('[KugouLite] device store write failed:', e && e.message);
  }
}

// 取真实网卡 MAC（EchoMusic getRealMacAddress 同思路），失败退回固定占位
function realMacAddress() {
  try {
    const nets = require('os').networkInterfaces();
    const names = Object.keys(nets).sort();
    for (const name of names) {
      for (const entry of nets[name] || []) {
        if (!entry || entry.internal) continue;
        const mac = String(entry.mac || '').trim().toUpperCase();
        if (/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac) && mac !== '00:00:00:00:00:00') return mac;
      }
    }
  } catch (_) {}
  return '02:00:00:00:00:00';
}

function deviceState() {
  if (_device) return _device;
  loadCore();
  const store = loadDeviceStore();
  const guid = typeof store.guid === 'string' && /^[a-f0-9]{32}$/.test(store.guid) ? store.guid : cryptoRandomGuid();
  const mid = typeof store.mid === 'string' && store.mid ? store.mid : _util.calculateMid(guid);
  const dev = typeof store.dev === 'string' && store.dev ? store.dev : _util.randomString(10).toUpperCase();
  const mac = typeof store.mac === 'string' && store.mac ? store.mac : realMacAddress();
  const webgl = typeof store.webgl === 'string' && store.webgl ? store.webgl : _util.generateWebGLHash();
  _device = { guid, mid, dev, mac, webgl };
  const changed = store.guid !== guid || store.mid !== mid || store.dev !== dev || store.mac !== mac || store.webgl !== webgl;
  if (changed) {
    Object.assign(store, _device);
    saveDeviceStore();
  }
  return _device;
}

function cryptoRandomGuid() {
  return _crypto.cryptoMd5(_util.getGuid());
}

function deviceCookie(extra) {
  const d = deviceState();
  return Object.assign({
    KUGOU_API_MID: d.mid,
    KUGOU_API_GUID: d.guid,
    KUGOU_API_DEV: d.dev,
    KUGOU_API_MAC: d.mac,
    KUGOU_API_WEBGL: d.webgl,
    KUGOU_API_PLATFORM: 'lite',
  }, extra || {});
}

// ---------- dfid 注册（落盘缓存，避免每次启动重新注册） ----------
let _dfid = null;
let _dfidPromise = null;

function ensureDfid() {
  if (_dfid) return Promise.resolve(_dfid);
  const store = loadDeviceStore();
  if (typeof store.dfid === 'string' && store.dfid) {
    _dfid = store.dfid;
    return Promise.resolve(_dfid);
  }
  if (_dfidPromise) return _dfidPromise;
  _dfidPromise = (async () => {
    const res = await callModule('register_dev', {}, deviceCookie());
    const dfid = res && res.body && res.body.data && res.body.data.dfid;
    if (!dfid) throw new Error('register_dev failed: no dfid');
    _dfid = dfid;
    store.dfid = dfid;
    saveDeviceStore();
    return dfid;
  })().catch((e) => {
    _dfidPromise = null;
    throw e;
  });
  return _dfidPromise;
}

// ---------- 通用模块调用 ----------
// 与 EchoMusic handleApiRequest 对齐：params + cookie 合并后交给 module
function callModule(name, params, cookie) {
  const mod = loadModule(name);
  return mod(Object.assign({}, params || {}, { cookie: cookie || {} }), (config) => {
    config.ip = '';
    return _requestFactory(config);
  });
}

// 概念版专用 cookie：设备标识 + 用户登录态 + dfid
function buildLiteCookie(kugouCookie) {
  const base = deviceCookie();
  const extra = { userid: '0', token: '' };
  if (kugouCookie) {
    const text = String(kugouCookie || '');
    // 兼容 token=xxx;userid=xxx 或 KuGoo=... 复合 cookie
    const parts = text.split(/;\s*/);
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq < 1) continue;
      const key = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (!key || !value) continue;
      if (key === 'token' || key === 'Token') extra.token = value;
      else if (/^userid$/i.test(key)) extra.userid = value;
      else if (key === 'dfid' || key === 'kg_dfid') base.dfid = value;
    }
    // 从 KuGoo 复合字段也尝试提取
    const kuGoo = text.match(/KuGoo=([^;]+)/);
    if (kuGoo && kuGoo[1]) {
      const t = kuGoo[1].match(/\bt=([^&]+)/);
      if (t && !extra.token) extra.token = decodeURIComponent(t[1]);
      const uid = kuGoo[1].match(/KugooID=([^&]+)/);
      if (uid && (!extra.userid || extra.userid === '0')) extra.userid = decodeURIComponent(uid[1]);
    }
  }
  return Object.assign({}, base, extra);
}

// 每次调用都确保 dfid（未注册时先注册）
async function liteCall(name, params, kugouCookie) {
  loadCore();
  const dfid = await ensureDfid();
  const cookie = buildLiteCookie(kugouCookie);
  cookie.dfid = dfid;
  return callModule(name, params, cookie);
}

// ====================================================================
//  业务封装（返回值对齐 Mineradio 现有格式，尽量复用 kugou-api 转换）
// ====================================================================

const kugouApi = require('./kugou-api');

// 搜索：概念版返回 data.lists → mapKugouSearchItem（字段完全兼容）
async function liteSearch(keywords, limit, kugouCookie, offset) {
  const kw = String(keywords || '').trim();
  if (!kw) return [];
  const lim = Math.max(1, Math.min(Number(limit) || 10, 20));
  const start = Math.max(0, Number(offset) || 0);
  const pageSize = lim;
  const page = Math.floor(start / pageSize) + 1;
  const res = await liteCall('search', {
    keywords: kw,
    type: 'song',
    page,
    pagesize: pageSize,
  }, kugouCookie);
  const body = res && res.body;
  const lists = body && body.data && Array.isArray(body.data.lists) ? body.data.lists : [];
  return lists
    .map((item) => {
      // 概念版返回 FileName="歌手 - 歌名"，SongName 为空；补 OriSongName 到 SongName 让转换层取到纯歌名
      if (item && !item.SongName && item.OriSongName) item.SongName = item.OriSongName;
      return typeof kugouApi.mapKugouSearchItem === 'function' ? kugouApi.mapKugouSearchItem(item) : item;
    })
    .filter((s) => s && s.name && (s.hash || s.id));
}

// 歌词：search/lyric → candidates[0] → lyric(fmt=lrc, decode)
async function liteLyric(hash, albumAudioId, durationSec, kugouCookie) {
  const fileHash = String(hash || '').trim();
  if (!fileHash) return { provider: 'kugou', error: 'Missing Kugou hash', lyric: '' };
  const durationMs = Math.max(0, Number(durationSec) || 0) * 1000;
  try {
    const searchRes = await liteCall('search_lyric', {
      hash: fileHash,
      duration: durationMs || 0,
      album_audio_id: String(albumAudioId || 0),
      man: 'no',
    }, kugouCookie);
    const candidates = (searchRes.body && searchRes.body.candidates) || [];
    const cand = candidates[0];
    if (!cand || !cand.id) return { provider: 'kugou', hash: fileHash, lyric: '', trans: '' };
    const lyricRes = await liteCall('lyric', {
      id: cand.id,
      accesskey: cand.accesskey || '',
      fmt: 'lrc',
      decode: 'true',
    }, kugouCookie);
    const content = lyricRes.body && lyricRes.body.content;
    let lyric = '';
    if (content) {
      try { lyric = Buffer.from(String(content), 'base64').toString('utf8').replace(/^\uFEFF/, ''); } catch (_) { lyric = ''; }
    }
    return { provider: 'kugou', hash: fileHash, lyric, trans: '' };
  } catch (e) {
    console.warn('[KugouLiteLyric]', e && (e.message || e));
    return { provider: 'kugou', hash: fileHash, lyric: '', trans: '' };
  }
}

// 播放 URL：概念版 /song/url（encryptKey 签名音源）
async function liteSongUrl(params, kugouCookie) {
  params = params || {};
  const hash = String(params.hash || params.fileHash || params.id || '').trim();
  if (!hash) return { provider: 'kugou', url: '', playable: false, error: 'MISSING_HASH' };
  // 音质映射：Mineradio 的 jymaster/hires/lossless/exhigh/standard → 概念版参数
  // 注意：概念版无 Hi-Res/至臻档位 → 归一化到 FLAC
  const requestedQuality = String(params.quality || '').trim() || 'standard';
  let liteQuality = '128';
  let qualityLevel = 'standard';
  const q = requestedQuality.toLowerCase();
  if (q === 'jymaster' || q === 'hires' || q === 'lossless' || q === 'sq') {
    liteQuality = 'flac';
    qualityLevel = 'lossless';
  } else if (q === 'exhigh' || q === '320') {
    liteQuality = '320';
    qualityLevel = 'exhigh';
  }
  // 按音质选择对应 hash（hq/sq/res），否则用主 hash
  let playHash = hash;
  if (qualityLevel === 'jymaster') playHash = params.resHash || params.sqHash || params.hqHash || hash;
  else if (qualityLevel === 'hires' || qualityLevel === 'lossless') playHash = params.sqHash || params.resHash || params.hqHash || hash;
  else if (qualityLevel === 'exhigh') playHash = params.hqHash || params.sqHash || params.resHash || hash;

  const albumId = String(params.albumId || params.album_id || 0);
  const albumAudioId = String(params.albumAudioId || params.album_audio_id || params.mixSongId || 0);

  // 单次请求：返回 { url, body }（body 保留原始返回，供失败分类）
  const requestLiteUrl = async (h, quality) => {
    const res = await liteCall('song_url', { hash: h, quality, album_id: albumId, album_audio_id: albumAudioId, ppage_id: '' }, kugouCookie);
    const body = res && res.body;
    let url = '';
    if (body && Number(body.status) === 1 && body.url) {
      // 概念版返回逗号分隔的多地址（主+备用），前端代理只接受单个 URL，取第一个
      const rawUrls = String(body.url).split(',').map(s => s.trim()).filter(Boolean);
      url = rawUrls[0] || '';
    }
    return { url, body };
  };
  // 失败分类：概念版「畅听VIP」（每日一日VIP）只覆盖标准音质，
  // 无损/320 需要豪华VIP套餐（fail_process 里的 pkg/buy 即权限拒绝原因）
  const classifyFail = (body) => {
    const fails = body && Array.isArray(body.fail_process) ? body.fail_process.map(String) : [];
    const msg = String((body && (body.error_msg || body.msg)) || '');
    if (fails.indexOf('buy') >= 0) return { reason: 'vip_required', message: '这首歌需要购买专辑/单曲后才能播放（概念版无此权限）' };
    if (fails.indexOf('pkg') >= 0 || Number(body && body.status) === 2 || /会员|vip|付费|权限/i.test(msg) || Number(body && body.error_code) === 20010) {
      return { reason: 'vip_required', message: msg || '需要酷狗豪华VIP才能播放该音质' };
    }
    return { reason: 'url_unavailable', message: msg || '概念版未返回播放地址' };
  };

  try {
    const first = await requestLiteUrl(playHash, liteQuality);
    if (first.url) {
      return {
        provider: 'kugou',
        url: first.url,
        playable: true,
        level: qualityLevel,
        quality: qualityLevel,
        requestedQuality,
        source: 'kugou-lite',
        hash: playHash,
      };
    }
    // 自动降级：高档位被权限拒绝时退回标准音质（主 hash + 128）再试一次，
    // 与概念版 App 行为一致；返回 level:'standard' 让前端记录本首歌的音质上限。
    if (liteQuality !== '128') {
      const fb = await requestLiteUrl(hash, '128');
      if (fb.url) {
        return {
          provider: 'kugou',
          url: fb.url,
          playable: true,
          level: 'standard',
          quality: 'standard',
          degraded: true,
          requestedQuality,
          source: 'kugou-lite',
          hash,
        };
      }
      const f = classifyFail(fb.body);
      return { provider: 'kugou', url: '', playable: false, reason: f.reason, message: f.message, status: fb.body && fb.body.status, requestedQuality, level: 'standard' };
    }
    const f = classifyFail(first.body);
    return { provider: 'kugou', url: '', playable: false, reason: f.reason, message: f.message, status: first.body && first.body.status, requestedQuality, level: qualityLevel };
  } catch (e) {
    console.warn('[KugouLiteSongUrl]', e && (e.message || e));
    return { provider: 'kugou', url: '', playable: false, error: (e && e.message) || 'LITE_SONG_URL_FAILED', requestedQuality, level: qualityLevel };
  }
}

// 用户信息（概念版 /user/detail）
async function liteUserDetail(kugouCookie) {
  try {
    const res = await liteCall('user_detail', {}, kugouCookie);
    const body = res && res.body;
    if (body && Number(body.status) === 1 && body.data) {
      const d = body.data;
      return {
        ok: true,
        userid: String(d.userid || d.kugouid || d.user_id || ''),
        nickname: String(d.nickname || d.user_name || d.name || ''),
        avatar: String(d.avatar || d.head_img || d.pic || ''),
        gender: d.gender,
      };
    }
    return { ok: false, error_code: body && body.error_code };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'USER_DETAIL_FAILED' };
  }
}

// VIP 信息（概念版 /user/vip/detail）
async function liteVipDetail(kugouCookie) {
  try {
    const res = await liteCall('user_vip_detail', {}, kugouCookie);
    const body = res && res.body;
    if (body && Number(body.status) === 1 && body.data) {
      const d = body.data;
      // 顶层字段 + busi_vip 数组（每日畅听会员/概念版会员在 busi_vip 里）
      const busiVips = Array.isArray(d.busi_vip) ? d.busi_vip : [];
      const anyBusiVip = busiVips.some((b) => b && (Number(b.is_vip) === 1 || Number(b.is_paid_vip) === 1));
      const anyBusiSvip = busiVips.some((b) => b && Number(b.is_vip) === 1 && /svip/i.test(String(b.product_type || '')));
      const topVip = Number(d.is_vip || d.vip_type || 0) > 0;
      const topSvip = Number(d.svip_type || d.svip_level || 0) > 0;
      const isVip = topVip || anyBusiVip;
      const isSvip = topSvip || anyBusiSvip;
      return {
        ok: true,
        isVip,
        isSvip,
        vipLevel: isSvip ? 'svip' : (isVip ? 'vip' : 'none'),
        expireAt: d.vip_end_time || (busiVips[0] && busiVips[0].vip_end_time) || '',
        raw: d,
      };
    }
    return { ok: false, error_code: body && body.error_code };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'VIP_DETAIL_FAILED' };
  }
}

// 用户歌单（概念版 /user/playlist）
async function liteUserPlaylists(kugouCookie) {
  try {
    const res = await liteCall('user_playlist', { page: 1, pagesize: 50 }, kugouCookie);
    const body = res && res.body;
    const data = body && body.data;
    // 概念版返回 data.info（数组），兼容 data.list / data.lists
    const lists = (data && (data.info || data.list || data.lists)) || [];
    if (!Array.isArray(lists)) return { ok: false, playlists: [] };
    // 只保留本人创建的歌单：list_create_userid === 当前 userid（收藏的他人歌单 type=1/source=2 不展示）
    const myUserId = String(kugouCookie ? extractLiteUserid(kugouCookie) : '');
    const playlists = lists
      .filter((item) => {
        if (!item) return false;
        const ownerId = String(item.list_create_userid || item.user_id || '');
        if (myUserId && ownerId && ownerId !== myUserId) return false;
        return true;
      })
      .map((item) => {
        const pid = String(item.global_collection_id || item.specialid || item.listid || item.id || '');
        if (!pid) return null;
        return {
          id: pid,
          globalCollectionId: String(item.global_collection_id || ''),
          name: String(item.specialname || item.list_name || item.name || item.list_create_name || '未命名歌单'),
          cover: String(item.img || item.pic || item.cover || item.create_user_pic || ''),
          count: Number(item.songcount || item.count || item.song_count || item.per_num || item.m_count || 0) || 0,
          creator: String(item.username || item.nickname || item.list_create_username || ''),
          provider: 'kugou',
        };
      })
      .filter(Boolean);
    return { ok: true, playlists };
  } catch (e) {
    console.warn('[KugouLitePlaylists]', e && (e.message || e));
    return { ok: false, playlists: [] };
  }
}
function extractLiteUserid(cookieText) {
  const text = String(cookieText || '');
  const m = text.match(/userid=(\d+)/i);
  return m ? m[1] : '';
}

// 歌单曲目（概念版 /playlist/track/all）
async function litePlaylistTracks(playlistId, kugouCookie) {
  const pid = String(playlistId || '').trim();
  if (!pid) return { ok: false, songs: [] };
  try {
    const res = await liteCall('playlist_track_all', { id: pid, page: 1, pagesize: 50 }, kugouCookie);
    const body = res && res.body;
    const data = body && body.data;
    // 概念版返回 data.songs（数组），兼容 plist/list/lists
    const lists = (data && (data.songs || data.plist || data.list || data.lists)) || [];
    if (!Array.isArray(lists)) return { ok: false, songs: [] };
    const songs = lists
      .map((item) => {
        // 概念版 songs 元素字段：name/hash/mixsongid/album_id/timelen/relate_goods
        const norm = Object.assign({}, item);
        // 歌单接口 name 是"歌手 - 歌名"格式，拆出纯歌名（搜索接口有 OriSongName 但歌单没有）
        if (norm.name && !norm.SongName) {
          const rawName = String(norm.name);
          const m = rawName.match(/^(.*?)\s*[-–—]\s*(.+)$/);
          if (m) {
            norm.SongName = m[2].trim();
            if (!norm.singerinfo && !norm.SingerName) norm.SingerName = m[1].trim();
          } else {
            norm.SongName = rawName;
          }
        }
        if (norm.hash && !norm.FileHash) norm.FileHash = norm.hash;
        if (norm.singerinfo && Array.isArray(norm.singerinfo)) {
          norm.Singers = norm.singerinfo.map((s) => ({ name: s.singer_name || s.name || '', id: s.singer_id || s.id || '' }));
        }
        if (norm.album_id != null && !norm.AlbumID) norm.AlbumID = norm.album_id;
        if (norm.mixsongid != null && !norm.MixSongID) norm.MixSongID = norm.mixsongid;
        if (norm.timelen != null && !norm.Duration) norm.Duration = Math.round(Number(norm.timelen) / 1000);
        if (norm.privilege != null && !norm.Privilege) norm.Privilege = norm.privilege;
        // relate_goods 里有高音质 hash
        if (Array.isArray(norm.relate_goods)) {
          for (const g of norm.relate_goods) {
            if (!g || !g.hash) continue;
            const bitrate = Number(g.bitrate) || 0;
            if (bitrate >= 320 && !norm.HQFileHash) norm.HQFileHash = g.hash;
            if (bitrate >= 800 && !norm.SQFileHash) norm.SQFileHash = g.hash;
          }
        }
        return typeof kugouApi.mapKugouSearchItem === 'function' ? kugouApi.mapKugouSearchItem(norm) : norm;
      })
      .filter((s) => s && s.name && (s.hash || s.id));
    return { ok: true, songs };
  } catch (e) {
    console.warn('[KugouLitePlaylistTracks]', e && (e.message || e));
    return { ok: false, songs: [] };
  }
}

// ====================================================================
//  扫码登录（概念版 QR，进程内调用；不再依赖 :9488 子进程）
// ====================================================================
// login_qr_key 走 web 加密，不需要 dfid；用设备 cookie 即可（与原先经 HTTP 服务调用一致）
function qrCookie() {
  return Object.assign({}, deviceCookie(), { userid: '0', token: '' });
}

// 官方二维码 key：/v2/qrcode → body.data.{qrcode, qrcode_img, url}
async function liteQrKey() {
  const res = await callModule('login_qr_key', { type: 'android' }, qrCookie());
  return (res && res.body && res.body.data) || {};
}

// 自拼 URL 二维码（官方 qrcode_img 缺失时的兜底；注意此码 App 可能识别不了）
async function liteQrCreate(key) {
  const res = await callModule('login_qr_create', { key: String(key || ''), qrimg: '1' }, qrCookie());
  return (res && res.body && res.body.data) || {};
}

// 扫码状态：body.data.{status,token,userid,nickname}，status 0过期/1待扫/2待确认/4成功
async function liteQrCheck(key) {
  const res = await callModule('login_qr_check', { key: String(key || '') }, qrCookie());
  return (res && res.body && res.body.data) || {};
}

// ====================================================================
//  概念版 VIP 奖励（每日领取一天 VIP / 听歌奖励上报 / 到期查询）
// ====================================================================
// 服务端业务码（实测 + 对照 echomusic-kugou-reward 插件）：
//   130012 听歌奖励「今日已领取」
//   131001 每日 VIP「今日已领取」（无 error_msg）
//   304001 receive_day 日期格式错误；304003 日期不能小于今天
//   20006  err signature（receive_day 缺失时出现）
const VIP_ALREADY_CODE = 130012;
const VIP_DAILY_ALREADY_CODES = [130012, 131001];
const VIP_CODE_TEXT = {
  130012: '今日已领取',
  131001: '今日已领取',
  20006: '签名校验失败（receive_day 等必选参数缺失）',
  304001: '日期格式错误（应为 YYYY-MM-DD）',
  304003: '日期不能小于今天',
};

function vipRewardOutcome(res, extra, alreadyCodes) {
  // createRequest 对非 2xx 会 reject，抛出对象形如 { status: 502, body: {...业务码...} }，
  // 所以这里既接受成功响应，也接受抛出的错误对象（业务码都在 body 里）
  const body = (res && res.body) || (res && (res.error_code !== undefined || res.status) ? res : {}) || {};
  const code = Number(body.error_code || body.err_code || body.code || 0);
  const status = Number(body.status);
  const codes = Array.isArray(alreadyCodes) ? alreadyCodes : [VIP_ALREADY_CODE];
  const already = codes.indexOf(code) >= 0;
  const message = String(body.error_msg || body.error_message || body.msg || body.message || VIP_CODE_TEXT[code] || '');
  const ok = already || status === 1 || (code === 0 && !!body.data);
  return Object.assign({ ok, already, code, status, message, data: body.data || null, raw: body }, extra || {});
}

function localDateKey(ts) {
  const d = ts ? new Date(ts) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// 每日奖励：领取一天概念版 VIP
// POST /youth/v1/recharge/receive_vip_listen_song
// ⚠️ receive_day 是**必选**参数且必须是 `YYYY-MM-DD` 本地日期：
//    缺参数 → 20006 err signature；格式不对 → 304001 日期格式错误；
//    领过当天 → 131001（无 error_msg）；日期早于今天 → 304003。
async function liteDailyVipClaim(kugouCookie, receiveDay) {
  const day = String(receiveDay || '').trim() || localDateKey();
  let last = null;
  for (const sourceId of [90139, 90137]) {
    let res = null;
    let err = null;
    try {
      res = await liteCall('youth_day_vip', { source_id: sourceId, receive_day: day }, kugouCookie);
    } catch (e) {
      err = e;
    }
    const outcome = vipRewardOutcome(err || res, { sourceId, receiveDay: day }, VIP_DAILY_ALREADY_CODES);
    if (outcome.ok || outcome.already) return outcome;
    last = outcome;
  }
  return last || { ok: false, already: false, message: 'DAILY_VIP_CLAIM_FAILED' };
}

// 当月已领取 VIP 天数（GET /youth/month/vip/record）
async function liteMonthVipRecord(kugouCookie) {
  try {
    const res = await liteCall('youth_month_vip_record', {}, kugouCookie);
    const body = (res && res.body) || {};
    return { ok: Number(body.status) === 1 || !!body.data, data: body.data || null, code: Number(body.error_code || 0), message: body.error_msg || '' };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'MONTH_VIP_RECORD_FAILED' };
  }
}

// 听歌奖励：上报一首歌（POST /youth/v2/report/listen_song），必须传真实 mixsongid
async function liteListenSongReport(mixsongid, kugouCookie) {
  const id = Number(mixsongid);
  if (!id || !Number.isFinite(id)) return { ok: false, already: false, message: 'MIXSONGID_REQUIRED' };
  let res = null;
  let err = null;
  try {
    res = await liteCall('youth_listen_song', { mixsongid: id }, kugouCookie);
  } catch (e) {
    err = e;
  }
  return vipRewardOutcome(err || res, { mixsongid: id });
}

// 升级每日概念会员（POST /youth/v1/listen_song/upgrade_vip_reward）
async function liteDailyVipUpgrade(kugouCookie) {
  let res = null;
  let err = null;
  try {
    res = await liteCall('youth_day_vip_upgrade', {}, kugouCookie);
  } catch (e) {
    err = e;
  }
  return vipRewardOutcome(err || res);
}

// 广告奖励：上报一条激励广告播放（领取概念版 VIP 时长）
// POST /youth/v1/ad/play_report → data.{total,done,remain,remain_vip_hour,award_vip_hour}
// 次数用尽 → 业务码 30002（每天上限 8 次，每次约 +3 小时 VIP）
async function liteAdPlayReport(kugouCookie, options) {
  const opts = options || {};
  const end = Number(opts.playEnd) || Date.now();
  const start = Number(opts.playStart) || end - 30000; // 默认上报一次 30 秒广告播放
  let res = null;
  let err = null;
  try {
    res = await liteCall('youth_ad_play_report', { ad_id: opts.adId || undefined, play_start: start, play_end: end }, kugouCookie);
  } catch (e) {
    err = e;
  }
  const outcome = vipRewardOutcome(err || res, { playStart: start, playEnd: end }, [30002]);
  const data = outcome.data || {};
  return Object.assign(outcome, {
    done: Number(data.done) || 0,
    total: Number(data.total) || 0,
    remain: Number(data.remain) || 0,
    remainVipHour: Number(data.remain_vip_hour) || 0,
    awardVipHour: Number(data.award_vip_hour) || 0,
    exhausted: outcome.already || Number(outcome.code) === 30002,
  });
}

// 概念版 VIP 到期时间（GET https://kugouvip.kugou.com/v1/get_union_vip）
async function liteUnionVip(kugouCookie) {
  try {
    const res = await liteCall('youth_union_vip', {}, kugouCookie);
    const body = (res && res.body) || {};
    return { ok: Number(body.status) === 1 || !!body.data, data: body.data || null, raw: body };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'UNION_VIP_FAILED' };
  }
}

// 已购内容（数字单曲 / 数字专辑）：用来区分「你没买」与「买了但接口没给地址」
// 注意：这是标准版接口，概念版 token 亦可用（实测 status=1 返回 {total, goods}）
async function litePurchased(type, kugouCookie, page, pagesize) {
  const kind = String(type || 'songs').toLowerCase() === 'albums' ? 'albums' : 'songs';
  try {
    const res = await liteCall(kind === 'albums' ? 'user_purchased_albums' : 'user_purchased_songs', {
      page: Number(page) || 1,
      pagesize: Math.max(1, Math.min(Number(pagesize) || 100, 200)),
    }, kugouCookie);
    const body = (res && res.body) || {};
    const data = body.data || {};
    const goods = Array.isArray(data.goods) ? data.goods : [];
    return { ok: Number(body.status) === 1, type: kind, total: Number(data.total) || 0, goods, code: Number(body.error_code) || 0, message: body.error_msg || body.message || '' };
  } catch (e) {
    return { ok: false, type: kind, total: 0, goods: [], error: (e && e.body && e.body.error_msg) || (e && e.message) || 'PURCHASED_FAILED' };
  }
}


// 重置设备身份（显式动作，非登出）：清内存与落盘，下次启动重新生成 guid/mid/dev/mac/webgl
// 注意：退出登录/会话过期不应调用它 —— 设备身份要保持稳定（EchoMusic 同策略）
function resetDevice() {
  _dfid = null;
  _dfidPromise = null;
  _device = null;
  _cachedModules = Object.create(null);
  try {
    const file = deviceStoreFile();
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (e) {
    console.warn('[KugouLite] device store clear failed:', e && e.message);
  }
  _deviceStore = null;
}

module.exports = {
  liteSearch,
  liteLyric,
  liteSongUrl,
  liteUserDetail,
  liteVipDetail,
  liteUserPlaylists,
  litePlaylistTracks,
  liteQrKey,
  liteQrCreate,
  liteQrCheck,
  liteDailyVipClaim,
  liteListenSongReport,
  liteDailyVipUpgrade,
  liteAdPlayReport,
  litePurchased,
  liteUnionVip,
  liteMonthVipRecord,
  resetDevice,
  _test: { buildLiteCookie, deviceCookie, ensureDfid },
};
