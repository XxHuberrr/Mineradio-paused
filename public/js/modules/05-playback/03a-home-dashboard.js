var homeDashboardReviewOffset = 0;
var homeDashboardHeroFingerprint = '';
var homeDashboardQuickFingerprint = '';
var homeDashboardDiscoveryFingerprint = '';
var homeDashboardDiscoveryCache = [];
var homeDashboardRefreshTimer = null;
var HOME_DASHBOARD_VIDEO_DB_NAME = 'mineradio-home-dashboard-video-v1';
var HOME_DASHBOARD_VIDEO_STORE = 'media';
var HOME_DASHBOARD_VIDEO_BLOB_ID = 'home-hero-video';
var HOME_DASHBOARD_VIDEO_META_KEY = 'mineradio-home-dashboard-video-meta-v1';
var HOME_DASHBOARD_VIDEO_MAX_BYTES = 300 * 1024 * 1024;
var homeDashboardVideoDbPromise = null;
var homeDashboardVideoObjectUrl = '';
var homeDashboardVideoLoadToken = 0;
var homeDashboardVideoAttachBusy = false;
var homeDashboardVideoDecodeFailed = false;
var homeDashboardVideoPowerObserver = null;
var homeDashboardVideoControlsBound = false;
var homePlatformRecommendationControlsBound = false;
var homePlatformRecommendationDailyRenderRaf = 0;
var HOME_PLATFORM_DAILY_ROW_HEIGHT = 84;
var HOME_PLATFORM_DAILY_OVERSCAN_ROWS = 3;
var HOME_PLATFORM_DAILY_MAX_RENDERED_CARDS = 24;
var homePlatformRecommendationState = {
  open: false,
  source: 'netease',
  previousFocus: null,
  neteaseLoading: false,
  feeds: {
    qishui: { loading: false, loaded: false, songs: [], error: '', message: '', mode: '', source: '', fallback: false, provenance: '' },
    kugou: { loading: false, loaded: false, songs: [], error: '', message: '', mode: '', source: '', fallback: false, provenance: '' },
  },
};

var HOME_DASHBOARD_REVIEW_DEFAULTS = [
  { text: '有些歌不是突然好听，而是终于听懂了。', source: '每日热评' },
  { text: '慢一点没关系，重要的是一直在向喜欢的生活靠近。', source: '每日热评' },
  { text: '错过落日余晖，还会有满天星辰。', source: '每日热评' },
  { text: '保持热爱，奔赴下一场山海。', source: '每日热评' },
  { text: '答案在路上，自由在风里。', source: '每日热评' },
  { text: '让今天的声音，从你喜欢的地方开始。', source: 'Mineradio' },
];

function homeDashboardSvgText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function homeDashboardCoverInitials(text) {
  var raw = String(text || '音乐').replace(/\s+/g, '').trim();
  var chars = Array.from(raw || '音乐');
  return chars.slice(0, Math.min(2, chars.length)).join('');
}

function homeDashboardGeneratedCover(title, label, tone) {
  var palettes = {
    search: ['#9db8cf', '#f8f4ee', '#00f5d4'],
    playlist: ['#9db8cf', '#00f5d4', '#2442ff'],
    library: ['#00f5d4', '#f8f4ee', '#2442ff'],
    mix: ['#f8f4ee', '#00f5d4', '#2442ff'],
  };
  var palette = palettes[tone] || palettes.playlist;
  var letters = homeDashboardSvgText(homeDashboardCoverInitials(title || label));
  var sub = homeDashboardSvgText(String(label || 'MINERADIO').toUpperCase().slice(0, 14));
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' + palette[0] + '"/><stop offset=".52" stop-color="' + palette[1] + '"/>' +
    '<stop offset="1" stop-color="' + palette[2] + '"/></linearGradient>' +
    '<radialGradient id="r" cx="34%" cy="24%" r="72%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/>' +
    '<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
    '<rect width="320" height="320" rx="54" fill="#080a10"/>' +
    '<rect width="320" height="320" rx="54" fill="url(#g)" opacity=".84"/>' +
    '<circle cx="242" cy="66" r="98" fill="url(#r)"/>' +
    '<circle cx="112" cy="214" r="84" fill="#05060a" opacity=".34"/>' +
    '<circle cx="112" cy="214" r="52" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2"/>' +
    '<circle cx="112" cy="214" r="22" fill="#fff" opacity=".18"/>' +
    '<path d="M222 118v98c0 19-16 34-39 34-20 0-35-11-35-27 0-17 16-29 38-29 7 0 14 1 20 4v-90l72-18v30z" fill="#fff" opacity=".32"/>' +
    '<text x="28" y="72" fill="#fff" opacity=".72" font-size="18" font-family="Arial,Microsoft YaHei,sans-serif" font-weight="800" letter-spacing="2">' + sub + '</text>' +
    '<text x="28" y="148" fill="#fff" font-size="58" font-family="Arial,Microsoft YaHei,sans-serif" font-weight="900">' + letters + '</text>' +
    '<rect x="0" y="0" width="320" height="320" rx="54" fill="none" stroke="#fff" stroke-opacity=".20"/>' +
    '</svg>';
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

function homeDashboardReadReviews() {
  try {
    var saved = JSON.parse(localStorage.getItem('mineradio-daily-review-quotes-v1') || '[]');
    if (Array.isArray(saved) && saved.length) {
      var normalized = saved.map(function (item) {
        if (typeof item === 'string') return { text: item.trim(), source: '我的热评' };
        return {
          text: String(item && item.text || '').trim(),
          source: String(item && item.source || '我的热评').trim(),
        };
      }).filter(function (item) { return item.text; });
      if (normalized.length) return normalized;
    }
  } catch (_error) { }
  return HOME_DASHBOARD_REVIEW_DEFAULTS.slice();
}

function homeDashboardDayNumber() {
  var now = new Date();
  return Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86400000);
}

function homeDashboardSelectedReview() {
  var reviews = homeDashboardReadReviews();
  if (!reviews.length) return { text: '让今天的声音，从你喜欢的地方开始。', source: 'Mineradio' };
  var index = ((homeDashboardDayNumber() + homeDashboardReviewOffset) % reviews.length + reviews.length) % reviews.length;
  return reviews[index];
}

function homeDashboardUpdateClock() {
  var time = document.getElementById('daily-review-time');
  var date = document.getElementById('daily-review-date');
  if (!time || !date) return;
  var now = new Date();
  time.textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  date.textContent = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

function homeDashboardNotify(message) {
  if (typeof showToast === 'function') showToast(message);
  else console.info('[HomeDashboard]', message);
}

function homeDashboardOpenVideoDb() {
  if (homeDashboardVideoDbPromise) return homeDashboardVideoDbPromise;
  homeDashboardVideoDbPromise = new Promise(function (resolve, reject) {
    if (!window.indexedDB) {
      reject(new Error('INDEXEDDB_UNAVAILABLE'));
      return;
    }
    var request = window.indexedDB.open(HOME_DASHBOARD_VIDEO_DB_NAME, 1);
    request.onupgradeneeded = function () {
      var db = request.result;
      if (!db.objectStoreNames.contains(HOME_DASHBOARD_VIDEO_STORE)) {
        db.createObjectStore(HOME_DASHBOARD_VIDEO_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () {
      homeDashboardVideoDbPromise = null;
      reject(request.error || new Error('HOME_VIDEO_DB_OPEN_FAILED'));
    };
  });
  return homeDashboardVideoDbPromise;
}

async function homeDashboardPutVideoBlob(blob, meta) {
  var db = await homeDashboardOpenVideoDb();
  return new Promise(function (resolve, reject) {
    var transaction = db.transaction(HOME_DASHBOARD_VIDEO_STORE, 'readwrite');
    transaction.objectStore(HOME_DASHBOARD_VIDEO_STORE).put({
      id: HOME_DASHBOARD_VIDEO_BLOB_ID,
      blob: blob,
      meta: meta,
    });
    transaction.oncomplete = function () { resolve(); };
    transaction.onerror = function () { reject(transaction.error || new Error('HOME_VIDEO_SAVE_FAILED')); };
    transaction.onabort = function () { reject(transaction.error || new Error('HOME_VIDEO_SAVE_ABORTED')); };
  });
}

async function homeDashboardGetVideoBlob() {
  var db = await homeDashboardOpenVideoDb();
  return new Promise(function (resolve, reject) {
    var transaction = db.transaction(HOME_DASHBOARD_VIDEO_STORE, 'readonly');
    var request = transaction.objectStore(HOME_DASHBOARD_VIDEO_STORE).get(HOME_DASHBOARD_VIDEO_BLOB_ID);
    request.onsuccess = function () { resolve(request.result || null); };
    request.onerror = function () { reject(request.error || new Error('HOME_VIDEO_READ_FAILED')); };
  });
}

async function homeDashboardDeleteVideoBlob() {
  var db = await homeDashboardOpenVideoDb();
  return new Promise(function (resolve, reject) {
    var transaction = db.transaction(HOME_DASHBOARD_VIDEO_STORE, 'readwrite');
    transaction.objectStore(HOME_DASHBOARD_VIDEO_STORE).delete(HOME_DASHBOARD_VIDEO_BLOB_ID);
    transaction.oncomplete = function () { resolve(); };
    transaction.onerror = function () { reject(transaction.error || new Error('HOME_VIDEO_DELETE_FAILED')); };
    transaction.onabort = function () { reject(transaction.error || new Error('HOME_VIDEO_DELETE_ABORTED')); };
  });
}

function homeDashboardReadVideoMeta() {
  try {
    var meta = JSON.parse(localStorage.getItem(HOME_DASHBOARD_VIDEO_META_KEY) || 'null');
    if (!meta || meta.version !== 1 || !/\.mp4$/i.test(String(meta.name || ''))) return null;
    if (meta.type && String(meta.type).toLowerCase() !== 'video/mp4') return null;
    return meta;
  } catch (_error) {
    return null;
  }
}

function homeDashboardIsMp4File(file) {
  if (!file || !/\.mp4$/i.test(String(file.name || ''))) return false;
  var type = String(file.type || '').toLowerCase();
  return !type || type === 'video/mp4';
}

function homeDashboardVideoShouldPlay() {
  return !document.hidden
    && typeof emptyHomeActive !== 'undefined'
    && !!emptyHomeActive
    && !!document.body
    && document.body.classList.contains('empty-home-active');
}

function homeDashboardReleaseVideoSource(removeElement) {
  homeDashboardVideoLoadToken += 1;
  var video = document.querySelector('#empty-home .home-dashboard-video');
  if (video) {
    try { video.pause(); } catch (_error) { }
    try {
      video.removeAttribute('src');
      video.load();
    } catch (_error) { }
    if (removeElement !== false && video.parentNode) video.parentNode.removeChild(video);
  }
  if (homeDashboardVideoObjectUrl) {
    try { URL.revokeObjectURL(homeDashboardVideoObjectUrl); } catch (_error) { }
    homeDashboardVideoObjectUrl = '';
  }
}

async function homeDashboardAttachVideo() {
  var meta = homeDashboardReadVideoMeta();
  if (!meta || !homeDashboardVideoShouldPlay() || homeDashboardVideoDecodeFailed) {
    homeDashboardReleaseVideoSource(true);
    return;
  }
  var card = document.querySelector('#empty-home .daily-review-card');
  if (!card) return;
  var currentVideo = card.querySelector('.home-dashboard-video');
  if (currentVideo && homeDashboardVideoObjectUrl) {
    currentVideo.play().catch(function () { });
    return;
  }
  if (homeDashboardVideoAttachBusy) return;

  homeDashboardVideoAttachBusy = true;
  homeDashboardReleaseVideoSource(true);
  var token = homeDashboardVideoLoadToken;
  var shouldRetry = false;
  try {
    var record = await homeDashboardGetVideoBlob();
    if (token !== homeDashboardVideoLoadToken || !homeDashboardVideoShouldPlay()) {
      shouldRetry = homeDashboardVideoShouldPlay();
      return;
    }
    var blob = record && record.blob;
    if (!blob) {
      localStorage.removeItem(HOME_DASHBOARD_VIDEO_META_KEY);
      homeDashboardRenderVideoActions();
      return;
    }
    var objectUrl = URL.createObjectURL(blob);
    if (token !== homeDashboardVideoLoadToken || !homeDashboardVideoShouldPlay()) {
      URL.revokeObjectURL(objectUrl);
      shouldRetry = homeDashboardVideoShouldPlay();
      return;
    }
    var video = document.createElement('video');
    video.className = 'home-dashboard-video';
    video.setAttribute('aria-hidden', 'true');
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'metadata';
    video.src = objectUrl;
    video.addEventListener('error', function () {
      if (token !== homeDashboardVideoLoadToken || !video.getAttribute('src')) return;
      homeDashboardVideoDecodeFailed = true;
      homeDashboardReleaseVideoSource(true);
      homeDashboardNotify('这个 MP4 无法解码，请换成 H.264 编码的 MP4');
    }, { once: true });
    homeDashboardVideoObjectUrl = objectUrl;
    card.insertBefore(video, card.firstChild);
    video.play().catch(function () { });
  } catch (error) {
    console.warn('[HomeDashboardVideo]', error);
    homeDashboardReleaseVideoSource(true);
    homeDashboardNotify('主页 MP4 读取失败，请重新选择');
  } finally {
    homeDashboardVideoAttachBusy = false;
    if (shouldRetry && !homeDashboardVideoDecodeFailed) {
      setTimeout(function () { homeDashboardUpdateVideoPower(); }, 0);
    }
  }
}

function homeDashboardRenderVideoActions() {
  var hasVideo = !!homeDashboardReadVideoMeta();
  var choose = document.getElementById('home-dashboard-video-choose');
  var clear = document.getElementById('home-dashboard-video-clear');
  if (choose) choose.textContent = hasVideo ? '更换 MP4' : '选择 MP4';
  if (clear) clear.hidden = !hasVideo;
}

function homeDashboardUpdateVideoPower() {
  if (!homeDashboardVideoShouldPlay() || !homeDashboardReadVideoMeta()) {
    homeDashboardReleaseVideoSource(true);
    return;
  }
  var video = document.querySelector('#empty-home .home-dashboard-video');
  if (video && homeDashboardVideoObjectUrl) video.play().catch(function () { });
  else homeDashboardAttachVideo();
}

function openHomeDashboardVideoPicker() {
  var input = document.getElementById('home-dashboard-video-input');
  if (input) input.click();
}

async function handleHomeDashboardVideoFile(file) {
  if (!homeDashboardIsMp4File(file)) {
    homeDashboardNotify('这里只能选择 .mp4 文件');
    return;
  }
  if (Number(file.size) > HOME_DASHBOARD_VIDEO_MAX_BYTES) {
    homeDashboardNotify('MP4 不能超过 300 MB');
    return;
  }
  var meta = {
    version: 1,
    name: String(file.name || 'home.mp4'),
    type: 'video/mp4',
    size: Number(file.size) || 0,
    savedAt: Date.now(),
  };
  try {
    await homeDashboardPutVideoBlob(file, meta);
    localStorage.setItem(HOME_DASHBOARD_VIDEO_META_KEY, JSON.stringify(meta));
    homeDashboardVideoDecodeFailed = false;
    homeDashboardReleaseVideoSource(true);
    homeDashboardRenderVideoActions();
    homeDashboardUpdateVideoPower();
    homeDashboardNotify('主页 MP4 已保存');
  } catch (error) {
    console.warn('[HomeDashboardVideoSave]', error);
    homeDashboardNotify('主页 MP4 保存失败');
  }
}

async function clearHomeDashboardVideo() {
  localStorage.removeItem(HOME_DASHBOARD_VIDEO_META_KEY);
  homeDashboardVideoDecodeFailed = false;
  homeDashboardReleaseVideoSource(true);
  homeDashboardRenderVideoActions();
  try {
    await homeDashboardDeleteVideoBlob();
  } catch (error) {
    console.warn('[HomeDashboardVideoDelete]', error);
  }
  homeDashboardNotify('已恢复主页默认动画');
}

function bindHomeDashboardVideoControls() {
  if (homeDashboardVideoControlsBound) return;
  homeDashboardVideoControlsBound = true;
  var input = document.getElementById('home-dashboard-video-input');
  if (input) {
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (file) handleHomeDashboardVideoFile(file);
    });
  }
  if (window.MutationObserver && document.body) {
    homeDashboardVideoPowerObserver = new MutationObserver(function () {
      homeDashboardUpdateVideoPower();
    });
    homeDashboardVideoPowerObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  window.addEventListener('pagehide', function () { homeDashboardReleaseVideoSource(true); });
}

function renderHomeDashboardHero() {
  var hero = document.querySelector('#empty-home .home-hero');
  if (!hero) return;
  var review = homeDashboardSelectedReview();
  var fingerprint = homeDashboardDayNumber() + '|' + homeDashboardReviewOffset + '|' + review.text + '|' + review.source;
  if (!hero.querySelector('.daily-review-card')) {
    hero.innerHTML = '<div class="daily-review-card">' +
      '<div id="daily-review-date" class="daily-review-date"></div>' +
      '<div id="daily-review-time" class="daily-review-time">--:--</div>' +
      '<div class="daily-review-quote"></div>' +
      '<div class="daily-review-source"></div>' +
      '<div class="daily-review-actions">' +
      '<button type="button" onclick="homeDashboardNextReview()">换一条</button>' +
      '<button id="home-dashboard-video-choose" type="button" onclick="openHomeDashboardVideoPicker()">选择 MP4</button>' +
      '<button id="home-dashboard-video-clear" type="button" onclick="clearHomeDashboardVideo()" hidden>移除视频</button>' +
      '<button type="button" onclick="openHomePlayerConsole()">展开播放器控制台</button>' +
      '</div></div>' +
      '<input id="home-dashboard-video-input" type="file" accept=".mp4,video/mp4" hidden aria-hidden="true">';
    homeDashboardVideoControlsBound = false;
    bindHomeDashboardVideoControls();
  }
  if (fingerprint !== homeDashboardHeroFingerprint) {
    homeDashboardHeroFingerprint = fingerprint;
    var quote = hero.querySelector('.daily-review-quote');
    var source = hero.querySelector('.daily-review-source');
    if (quote) quote.textContent = '“' + review.text + '”';
    if (source) source.textContent = '— ' + (review.source || '每日热评');
  }
  homeDashboardRenderVideoActions();
  homeDashboardUpdateVideoPower();
  homeDashboardUpdateClock();
}

function homeDashboardNextReview() {
  homeDashboardReviewOffset += 1;
  renderHomeDashboardHero();
}

function homeDashboardCurrentSong() {
  try {
    return typeof currentCoverSong === 'function' ? currentCoverSong() : null;
  } catch (_error) {
    return null;
  }
}

function homeDashboardSubtitle(song) {
  if (!song) return '';
  try {
    return song.artist || song.singer || song.album || songSourceLabel(song) || '';
  } catch (_error) {
    return song.artist || song.singer || song.source || '';
  }
}

function homeDashboardSongCover(song, size) {
  if (!song) return '';
  try {
    return songCoverSrc(song, size || 320) || song.cover || song.picUrl || '';
  } catch (_error) {
    return song.cover || song.picUrl || '';
  }
}

function homeDashboardLocalSongs() {
  var pool = [];
  if (Array.isArray(playQueue)) pool = pool.concat(playQueue);
  if (Array.isArray(playlist)) pool = pool.concat(playlist);
  if (Array.isArray(userPlaylists)) {
    userPlaylists.forEach(function (item) {
      if (item && Array.isArray(item.songs)) pool = pool.concat(item.songs);
    });
  }
  var seen = Object.create(null);
  return pool.filter(function (song) {
    if (!song || song.type !== 'local') return false;
    var key = '';
    try { key = queueItemKey(song); } catch (_error) { }
    key = key || song.localPath || song.id || ((song.name || song.title || '') + '|' + (song.artist || ''));
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function homeDashboardSetStableBackgroundImage(element, src) {
  if (!element) return;
  src = String(src || '');
  if (element.__homeDashboardRequestedBackground === src) return;
  element.__homeDashboardRequestedBackground = src;
  if (!src) {
    element.__homeDashboardBackground = '';
    element.style.backgroundImage = '';
    return;
  }
  var image = new Image();
  image.decoding = 'async';
  function commit() {
    if (!element.isConnected || element.__homeDashboardRequestedBackground !== src) return;
    element.__homeDashboardBackground = src;
    element.style.backgroundImage = 'url("' + cssImageUrl(src) + '")';
  }
  image.onload = function () {
    if (typeof image.decode === 'function') image.decode().catch(function () { }).then(commit);
    else commit();
  };
  image.onerror = function () { };
  image.src = src;
}

function homeDashboardCardHtml(card) {
  var cover = card.cover || homeDashboardGeneratedCover(card.title, card.label, card.tone);
  var artStyle = cover ? ' style="background-image:url(&quot;' + escHtml(cssImageUrl(cover)) + '&quot;)"' : '';
  return '<button class="home-card ' + escHtml(card.className || '') + '" data-home-tone="' + escHtml(card.tone || 'playlist') + '"' +
    ' type="button" onclick="' + card.action + '">' +
    '<div class="home-card-label">' + escHtml(card.label || '') + '</div>' +
    '<div class="home-card-title">' + escHtml(card.title || '') + '</div>' +
    '<div class="home-card-sub">' + escHtml(card.sub || '') + '</div>' +
    '<div class="home-card-art has-cover"' + artStyle + '></div>' +
    '</button>';
}

function homeDashboardPatchCard(button, card) {
  if (!button || !card) return;
  var className = 'home-card' + (card.className ? ' ' + card.className : '');
  var displayCover = card.cover || homeDashboardGeneratedCover(card.title, card.label, card.tone);
  if (button.className !== className) button.className = className;
  if (button.getAttribute('data-home-tone') !== card.tone) button.setAttribute('data-home-tone', card.tone);
  if (button.getAttribute('onclick') !== card.action) button.setAttribute('onclick', card.action);
  var label = button.querySelector('.home-card-label');
  var title = button.querySelector('.home-card-title');
  var sub = button.querySelector('.home-card-sub');
  var art = button.querySelector('.home-card-art');
  if (label && label.textContent !== card.label) label.textContent = card.label;
  if (title && title.textContent !== card.title) title.textContent = card.title;
  if (sub && sub.textContent !== card.sub) sub.textContent = card.sub;
  if (art) {
    art.className = 'home-card-art' + (displayCover ? ' has-cover' : '');
    homeDashboardSetStableBackgroundImage(art, displayCover);
  }
}

function renderHomeDashboardQuickCards() {
  var grid = document.querySelector('#empty-home .home-grid');
  if (!grid) return;
  var summary = typeof homeListenSummary === 'function' ? homeListenSummary() : {};
  var recent = summary && summary.recent || null;
  var current = homeDashboardCurrentSong();
  var daily = homeDiscoverState && homeDiscoverState.songs && homeDiscoverState.songs[0] || null;
  var continueItem = current || recent;
  var localSongs = homeDashboardLocalSongs();
  var localCount = localSongs.length;
  var accountPlaylistCount = homeDiscoverState && Array.isArray(homeDiscoverState.playlists) ? homeDiscoverState.playlists.length : 0;
  var ownPlaylistCount = Array.isArray(userPlaylists) ? userPlaylists.length : 0;
  var libraryCount = localCount + accountPlaylistCount + ownPlaylistCount;
  var cards = [
    {
      label: 'CONTINUE',
      title: continueItem && (continueItem.name || continueItem.title) || '开始听歌',
      sub: continueItem ? (homeDashboardSubtitle(continueItem) || recent && (recent.artist || recent.source) || '继续当前队列') : '从音乐库或每日推荐开始',
      cover: homeDashboardSongCover(current, 360) || recent && recent.cover || '',
      action: 'resumeHomeDashboardPlayback()',
      tone: 'search',
      className: 'home-card-featured',
    },
    {
      label: 'LIBRARY',
      title: '音乐库',
      sub: libraryCount ? (libraryCount + ' 项内容 · 本地音乐与歌单') : '歌单、本地音乐和已登录平台',
      cover: localSongs[0] ? homeDashboardSongCover(localSongs[0], 260) : '',
      action: 'openHomeDashboardLibrary()',
      tone: 'library',
      className: 'home-card-quick',
    },
    {
      label: 'DAILY MIX',
      title: '每日推荐',
      sub: daily ? ((daily.name || daily.title || '今日歌曲') + (homeDashboardSubtitle(daily) ? ' · ' + homeDashboardSubtitle(daily) : '')) : '使用当前 Mineradio 推荐数据',
      cover: homeDashboardSongCover(daily, 260),
      action: 'playHomeDaily()',
      tone: 'mix',
      className: 'home-card-quick',
    },
    {
      label: 'RECENT',
      title: '最近播放',
      sub: recent ? ((recent.name || '最近一首') + (recent.artist ? ' · ' + recent.artist : '')) : '播放过的歌曲会出现在这里',
      cover: recent && recent.cover || '',
      action: 'playHomeRecent()',
      tone: 'playlist',
      className: 'home-card-quick',
    },
  ];
  var fingerprint = cards.map(function (card) {
    return [card.title, card.sub, card.cover, card.action].join('|');
  }).join('||');
  if (fingerprint === homeDashboardQuickFingerprint && grid.classList.contains('home-quick-grid')) return;
  homeDashboardQuickFingerprint = fingerprint;
  grid.classList.add('home-quick-grid');
  var existingCards = Array.prototype.slice.call(grid.children).filter(function (node) {
    return node && node.classList && node.classList.contains('home-card');
  });
  if (existingCards.length !== cards.length) {
    grid.innerHTML = cards.map(homeDashboardCardHtml).join('');
    existingCards = Array.prototype.slice.call(grid.querySelectorAll('.home-card'));
  }
  cards.forEach(function (card, index) {
    homeDashboardPatchCard(existingCards[index], card);
  });
}

function resumeHomeDashboardPlayback() {
  homeForcedOpen = false;
  homeSuppressed = false;
  if (typeof setHomeControlsLocked === 'function') setHomeControlsLocked(false);
  if (playQueue && playQueue.length && currentIdx >= 0 && playQueue[currentIdx]) {
    if (typeof forcePlaybackControlsInteractive === 'function') forcePlaybackControlsInteractive();
    if (typeof updateEmptyHomeVisibility === 'function') updateEmptyHomeVisibility();
    if (playing || audio && !audio.paused) return;
    if (typeof togglePlay === 'function') {
      Promise.resolve(togglePlay()).catch(function (error) { console.warn('[HomeDashboardResume]', error); });
    }
    return;
  }
  var recent = typeof homeListenSummary === 'function' ? homeListenSummary().recent : null;
  if (recent && typeof playHomeRecent === 'function') {
    Promise.resolve(playHomeRecent(recent)).catch(function (error) { console.warn('[HomeDashboardRecent]', error); });
    return;
  }
  if (typeof playHomeDaily === 'function') playHomeDaily();
}

function homeDashboardDayKey(timestamp) {
  var date = new Date(Number(timestamp) || Date.now());
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function homeDashboardTodayListenMetrics() {
  var now = Date.now();
  var today = new Date(now);
  today.setHours(0, 0, 0, 0);
  var todayStart = today.getTime();
  var history = listenStatsState && Array.isArray(listenStatsState.history) ? listenStatsState.history : [];
  var records = history.filter(function (record) {
    return record && Number(record.playedAt) >= todayStart;
  });
  var keys = Object.create(null);
  var artists = Object.create(null);
  var listenMs = 0;
  records.forEach(function (record) {
    var key = String(record.key || record.id || (record.name || '') + '|' + (record.artist || ''));
    if (key) keys[key] = true;
    listenMs += Math.max(0, Number(record.listenMs) || 0);
    String(record.artist || '').split(/\s*\/\s*|\s*,\s*|、|&/).forEach(function (name) {
      name = name.trim();
      if (!name) return;
      artists[name] = (artists[name] || 0) + Math.max(1, Number(record.listenMs) || 1);
    });
  });
  if (listenSession && Number(listenSession.startedAt) >= todayStart) {
    listenMs += Math.max(0, Number(listenSession.listenMs) || 0);
    if (listenSession.key) keys[listenSession.key] = true;
  }
  var topArtist = Object.keys(artists).sort(function (a, b) { return artists[b] - artists[a]; })[0] || '';
  var dayMap = Object.create(null);
  history.forEach(function (record) {
    if (record && record.playedAt) dayMap[homeDashboardDayKey(record.playedAt)] = true;
  });
  if (records.length || listenSession) dayMap[homeDashboardDayKey(now)] = true;
  var streak = 0;
  var cursor = new Date(todayStart);
  if (!dayMap[homeDashboardDayKey(cursor.getTime())]) cursor.setDate(cursor.getDate() - 1);
  while (dayMap[homeDashboardDayKey(cursor.getTime())]) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    listenMs: listenMs,
    songCount: Object.keys(keys).length,
    topArtist: topArtist,
    streak: streak,
  };
}

function homeDashboardListenDurationText(milliseconds) {
  var minutes = Math.floor(Math.max(0, Number(milliseconds) || 0) / 60000);
  if (minutes < 60) return minutes + ' 分钟';
  var hours = Math.floor(minutes / 60);
  var rest = minutes % 60;
  return hours + ' 小时' + (rest ? rest + ' 分' : '');
}

function homeDashboardNextQueueInfo() {
  if (playQueue && playQueue.length) {
    var index = currentIdx >= 0 ? (currentIdx + 1) % playQueue.length : 0;
    return { song: playQueue[index], index: index, queued: true };
  }
  var discoverSong = homeDiscoverState && homeDiscoverState.songs && homeDiscoverState.songs[0] || null;
  var localSong = homeDashboardLocalSongs()[0] || null;
  return { song: discoverSong || localSong || null, index: 0, queued: false };
}

function homeDashboardSongKey(song) {
  if (!song) return '';
  try {
    var queueKey = typeof queueItemKey === 'function' ? queueItemKey(song) : '';
    if (queueKey) return String(queueKey);
  } catch (_error) { }
  var provider = song.provider || song.source || song.type || '';
  var id = song.id || song.mid || song.songmid || song.mediaMid || song.localPath || song.url || '';
  if (id) return provider + '|' + id;
  return provider + '|' + (song.name || song.title || '') + '|' + homeDashboardSubtitle(song);
}

function homeDashboardDiscoverySongs() {
  var candidates = [];
  var seen = Object.create(null);
  function addSongs(songs) {
    (Array.isArray(songs) ? songs : []).forEach(function (song) {
      if (!song) return;
      var key = homeDashboardSongKey(song);
      if (!key || seen[key]) return;
      seen[key] = true;
      candidates.push(song);
    });
  }

  addSongs(homeDiscoverState && homeDiscoverState.songs);
  addSongs(playQueue);
  if (Array.isArray(userPlaylists)) {
    userPlaylists.forEach(function (item) { addSongs(item && item.songs); });
  }
  addSongs(playlist);
  addSongs(homeDashboardLocalSongs());

  if (candidates.length <= 3) return candidates.slice();
  var day = homeDashboardDayNumber();
  var step = Math.max(1, Math.floor(candidates.length / 3));
  var picked = [];
  var pickedKeys = Object.create(null);
  for (var index = 0; index < candidates.length && picked.length < 3; index += 1) {
    var candidate = candidates[(day * 17 + index * step + index * 7) % candidates.length];
    var candidateKey = homeDashboardSongKey(candidate);
    if (!candidateKey || pickedKeys[candidateKey]) continue;
    pickedKeys[candidateKey] = true;
    picked.push(candidate);
  }
  return picked;
}

function renderHomeDashboardDiscovery() {
  var root = document.getElementById('home-discovery-list');
  if (!root) return;
  homeDashboardDiscoveryCache = homeDashboardDiscoverySongs();
  var fingerprint = homeDashboardDiscoveryCache.map(function (song) {
    return [homeDashboardSongKey(song), song.name || song.title || '', homeDashboardSubtitle(song), homeDashboardSongCover(song, 180)].join('|');
  }).join('||');
  if (!fingerprint) fingerprint = 'empty';
  if (fingerprint === homeDashboardDiscoveryFingerprint) return;
  homeDashboardDiscoveryFingerprint = fingerprint;
  root.classList.toggle('is-empty', !homeDashboardDiscoveryCache.length);
  if (!homeDashboardDiscoveryCache.length) {
    root.innerHTML = '<button class="home-discovery-empty" type="button" onclick="openHomeDashboardLibrary()">' +
      '<strong>等待你的音乐</strong><span>登录平台或导入本地音乐后生成推荐</span></button>';
    return;
  }
  root.innerHTML = homeDashboardDiscoveryCache.map(function (song, index) {
    var cover = homeDashboardSongCover(song, 180);
    var coverStyle = cover ? ' style="background-image:url(&quot;' + escHtml(cssImageUrl(cover)) + '&quot;)"' : '';
    return '<button class="home-discovery-song" type="button" onclick="playHomeDashboardDiscoverySong(' + index + ')">' +
      '<span class="home-discovery-cover"' + coverStyle + '></span>' +
      '<span class="home-discovery-song-copy"><span class="home-discovery-song-name">' + escHtml(song.name || song.title || '未知歌曲') + '</span>' +
      '<span class="home-discovery-song-artist">' + escHtml(homeDashboardSubtitle(song) || 'Mineradio 推荐') + '</span></span></button>';
  }).join('');
}

function playHomeDashboardDiscoverySong(index) {
  if (!homeDashboardDiscoveryCache.length) homeDashboardDiscoveryCache = homeDashboardDiscoverySongs();
  if (!homeDashboardDiscoveryCache.length) {
    openHomeDashboardLibrary();
    return;
  }
  playQueue = homeDashboardDiscoveryCache.map(function (song) { return cloneSong(song); });
  currentIdx = Math.max(0, Math.min(playQueue.length - 1, Number(index) || 0));
  homeForcedOpen = false;
  homeSuppressed = false;
  if (typeof setHomeControlsLocked === 'function') setHomeControlsLocked(false);
  if (typeof safeRenderQueuePanel === 'function') safeRenderQueuePanel('home-dashboard-discovery', { scrollCurrent: true });
  if (typeof safeShelfRebuild === 'function') safeShelfRebuild('home-dashboard-discovery', true);
  if (typeof forcePlaybackControlsInteractive === 'function') forcePlaybackControlsInteractive();
  Promise.resolve(playQueueAt(currentIdx, {
    manual: true,
    context: { type: 'home-discovery', playlistName: '为你挑选' },
  })).catch(function (error) { console.warn('[HomeDashboardDiscovery]', error); });
}

function renderHomeInsightDock() {
  if (!document.getElementById('home-insight-dock')) return;
  var metrics = homeDashboardTodayListenMetrics();
  var time = document.getElementById('home-today-time');
  var count = document.getElementById('home-today-count');
  var artist = document.getElementById('home-today-artist');
  var streak = document.getElementById('home-today-streak');
  if (time) time.textContent = homeDashboardListenDurationText(metrics.listenMs);
  if (count) count.textContent = metrics.songCount + ' 首';
  if (artist) artist.textContent = metrics.topArtist || '等待记录';
  if (streak) streak.textContent = metrics.streak ? ('连续聆听 ' + metrics.streak + ' 天') : '开始播放后生成';

  var next = homeDashboardNextQueueInfo();
  var song = next.song;
  var title = document.getElementById('home-next-title');
  var sub = document.getElementById('home-next-sub');
  var cover = document.getElementById('home-next-cover');
  var card = document.getElementById('home-next-card');
  if (title) title.textContent = song ? (song.name || song.title || '未知歌曲') : '队列里还没有歌曲';
  if (sub) sub.textContent = song ? (homeDashboardSubtitle(song) || '点击播放') : '点击打开音乐库';
  var coverUrl = homeDashboardSongCover(song, 220);
  if (cover) homeDashboardSetStableBackgroundImage(cover, coverUrl);
  if (card) card.setAttribute('aria-label', song ? ('播放下一首：' + (song.name || song.title || '未知歌曲')) : '打开音乐库');
  renderHomeDashboardDiscovery();
}

function playHomeNextFromDock() {
  var next = homeDashboardNextQueueInfo();
  if (next.song && next.queued) {
    homeForcedOpen = false;
    homeSuppressed = false;
    if (typeof setHomeControlsLocked === 'function') setHomeControlsLocked(false);
    if (typeof forcePlaybackControlsInteractive === 'function') forcePlaybackControlsInteractive();
    Promise.resolve(playQueueAt(next.index, {
      manual: true,
      context: { type: 'home-next', playlistName: '接下来播放' },
    })).catch(function (error) { console.warn('[HomeDashboardNext]', error); });
    return;
  }
  if (next.song) {
    playQueue = [cloneSong(next.song)];
    currentIdx = 0;
    if (typeof safeRenderQueuePanel === 'function') safeRenderQueuePanel('home-dashboard-next');
    if (typeof safeShelfRebuild === 'function') safeShelfRebuild('home-dashboard-next', true);
    if (typeof forcePlaybackControlsInteractive === 'function') forcePlaybackControlsInteractive();
    Promise.resolve(playQueueAt(0, {
      manual: true,
      context: { type: 'home-next', playlistName: '首页推荐' },
    })).catch(function (error) { console.warn('[HomeDashboardStart]', error); });
    return;
  }
  openHomeDashboardLibrary();
}

function openHomeDashboardLibrary() {
  var loggedIn = typeof hasAnyPlatformLogin === 'function' && hasAnyPlatformLogin()
    || homeDiscoverState && homeDiscoverState.loggedIn;
  if (loggedIn && typeof openHomeLibrary === 'function') {
    openHomeLibrary();
    return;
  }
  homeForcedOpen = false;
  homeSuppressed = false;
  if (typeof setHomeControlsLocked === 'function') setHomeControlsLocked(false);
  if (typeof updateEmptyHomeVisibility === 'function') updateEmptyHomeVisibility();
  if (typeof openUploadPanel === 'function') openUploadPanel();
}

function openHomeDashboardCharts() {
  openHomePlatformRecommendations('netease');
}

function homePlatformRecommendationSourceLabel(source) {
  return {
    netease: '网易云',
    qishui: '汽水',
    qq: 'QQ 音乐',
    kugou: '酷狗音乐',
  }[source] || '当前平台';
}

function homePlatformRecommendationFeedConfig(source) {
  return {
    qishui: {
      endpoint: '/api/qishui/feed?limit=12',
      sectionTitle: '推荐 Feed',
      cardLabel: '汽水推荐 Feed',
      readyText: '来自汽水推荐 Feed',
      playlistName: '汽水推荐 Feed',
    },
    kugou: {
      endpoint: '/api/kugou/recommendations?limit=12',
      sectionTitle: '推荐 FM',
      cardLabel: '酷狗推荐 FM',
      readyText: '来自酷狗 FM 推荐',
      playlistName: '酷狗推荐 FM',
    },
  }[source] || null;
}

function homePlatformRecommendationCard(kind, index, item, label) {
  item = item || {};
  var title = item.name || item.title || '未命名内容';
  var sub = '';
  if (kind === 'netease-playlist') sub = (item.trackCount ? item.trackCount + ' 首' : '推荐歌单') + (item.playCount ? ' · ' + compactHomeCount(item.playCount) + ' 播放' : '');
  else sub = homeDashboardSubtitle(item) || label;
  var cover = item.cover || item.picUrl || homeDashboardSongCover(item, 180) || '';
  var coverStyle = cover ? ' style="background-image:url(&quot;' + escHtml(cssImageUrl(cover)) + '&quot;)"' : '';
  return '<button class="home-platform-recommend-card" type="button" data-home-recommend-kind="' + kind + '" data-home-recommend-index="' + index + '">' +
    '<span class="home-platform-recommend-cover"' + coverStyle + '></span>' +
    '<span class="home-platform-recommend-copy"><span class="home-platform-recommend-label">' + escHtml(label) + '</span>' +
    '<strong>' + escHtml(title) + '</strong><small>' + escHtml(sub) + '</small></span>' +
    '<span class="home-platform-recommend-arrow" aria-hidden="true">›</span></button>';
}

function homePlatformRecommendationDailyRange(total, columns, scrollTop, viewportHeight, gridOffsetTop) {
  total = Math.max(0, Number(total) || 0);
  columns = Math.max(1, Number(columns) || 1);
  var totalRows = Math.ceil(total / columns);
  if (!totalRows) return { start: 0, end: 0, topRows: 0, bottomRows: 0 };
  var localScrollTop = Math.max(0, (Number(scrollTop) || 0) - (Number(gridOffsetTop) || 0));
  var firstVisibleRow = Math.floor(localScrollTop / HOME_PLATFORM_DAILY_ROW_HEIGHT);
  var visibleRows = Math.max(1, Math.ceil((Number(viewportHeight) || 500) / HOME_PLATFORM_DAILY_ROW_HEIGHT));
  var maxRows = Math.max(1, Math.floor(HOME_PLATFORM_DAILY_MAX_RENDERED_CARDS / columns));
  var startRow = Math.max(0, firstVisibleRow - HOME_PLATFORM_DAILY_OVERSCAN_ROWS);
  var renderRows = Math.min(maxRows, visibleRows + HOME_PLATFORM_DAILY_OVERSCAN_ROWS * 2);
  var endRow = Math.min(totalRows, startRow + renderRows);
  if (endRow === totalRows) startRow = Math.max(0, endRow - renderRows);
  return {
    start: startRow * columns,
    end: Math.min(total, endRow * columns),
    topRows: startRow,
    bottomRows: Math.max(0, totalRows - endRow),
  };
}

function homePlatformRecommendationGridColumns(grid) {
  if (!grid) return 1;
  try {
    var template = window.getComputedStyle(grid).gridTemplateColumns;
    var columns = String(template || '').trim().split(/\s+/).filter(Boolean).length;
    if (columns > 0) return columns;
  } catch (_error) { }
  return grid.clientWidth > 560 ? 2 : 1;
}

function homePlatformRecommendationSpacer(rows, position) {
  if (!rows) return '';
  var height = Math.max(0, rows * HOME_PLATFORM_DAILY_ROW_HEIGHT - 8);
  return '<span class="home-platform-recommend-spacer" data-home-recommend-spacer="' + position +
    '" aria-hidden="true" style="grid-column:1/-1;height:' + height + 'px"></span>';
}

function renderHomePlatformDailyWindow(force) {
  if (homePlatformRecommendationState.source !== 'netease') return;
  var list = document.getElementById('home-platform-recommend-list');
  var grid = document.getElementById('home-platform-daily-grid');
  if (!list || !grid) return;
  var songs = Array.isArray(homeDiscoverState.songs) ? homeDiscoverState.songs : [];
  var columns = homePlatformRecommendationGridColumns(grid);
  var range = homePlatformRecommendationDailyRange(
    songs.length,
    columns,
    list.scrollTop,
    list.clientHeight,
    grid.offsetTop
  );
  var signature = songs.length + '|' + columns + '|' + range.start + '|' + range.end;
  if (!force && grid.getAttribute('data-render-window') === signature) return;
  var html = [homePlatformRecommendationSpacer(range.topRows, 'top')];
  for (var index = range.start; index < range.end; index += 1) {
    html.push(homePlatformRecommendationCard('netease-song', index, songs[index], '网易云每日推荐'));
  }
  html.push(homePlatformRecommendationSpacer(range.bottomRows, 'bottom'));
  grid.innerHTML = html.join('');
  grid.setAttribute('data-render-window', signature);
  grid.setAttribute('aria-label', '全部每日推荐，共 ' + songs.length + ' 首');
  var count = document.getElementById('home-platform-daily-count');
  if (count) {
    count.textContent = songs.length
      ? ' · ' + (range.start + 1) + '–' + range.end + ' / ' + songs.length
      : '';
  }
}

function scheduleHomePlatformDailyWindowRender() {
  if (homePlatformRecommendationDailyRenderRaf) return;
  var run = function () {
    homePlatformRecommendationDailyRenderRaf = 0;
    renderHomePlatformDailyWindow(false);
  };
  if (typeof requestAnimationFrame === 'function') {
    homePlatformRecommendationDailyRenderRaf = requestAnimationFrame(run);
  } else {
    homePlatformRecommendationDailyRenderRaf = setTimeout(run, 16);
  }
}

function homePlatformRecommendationEmptyHtml(source, message) {
  return '<div class="home-platform-recommend-empty"><strong>' + escHtml(homePlatformRecommendationSourceLabel(source)) + ' 暂无可用推荐</strong>' +
    '<span>' + escHtml(message || '当前版本没有可验证的平台推荐接口，未使用关键词搜索替代。') + '</span></div>';
}

function renderHomePlatformRecommendations() {
  var mask = document.getElementById('home-platform-recommend-mask');
  var list = document.getElementById('home-platform-recommend-list');
  var status = document.getElementById('home-platform-recommend-status');
  if (!mask || !list || !status) return;
  var source = homePlatformRecommendationState.source;
  var tabs = document.querySelectorAll('[data-home-recommend-source]');
  Array.prototype.forEach.call(tabs, function (tab) {
    var selected = tab.getAttribute('data-home-recommend-source') === source;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.classList.toggle('active', selected);
  });
  status.classList.remove('is-error');

  if (source === 'netease') {
    if (homeDiscoverState.loading || homePlatformRecommendationState.neteaseLoading) {
      status.textContent = '正在读取网易云平台推荐…';
      list.innerHTML = '<div class="home-platform-recommend-loading">正在同步推荐内容</div>';
      return;
    }
    var sections = [];
    var playlists = Array.isArray(homeDiscoverState.playlists) ? homeDiscoverState.playlists.slice(0, 6) : [];
    var songs = Array.isArray(homeDiscoverState.songs) ? homeDiscoverState.songs : [];
    if (playlists.length) {
      sections.push('<section><h3>推荐歌单</h3><div class="home-platform-recommend-grid">' + playlists.map(function (item, index) {
        return homePlatformRecommendationCard('netease-playlist', index, item, '网易云推荐歌单');
      }).join('') + '</div></section>');
    }
    if (songs.length) {
      sections.push('<section><h3>每日推荐<span id="home-platform-daily-count"></span></h3>' +
        '<div id="home-platform-daily-grid" class="home-platform-recommend-grid" role="list" aria-label="全部每日推荐"></div></section>');
    }
    if (sections.length) {
      status.textContent = songs.length
        ? '已读取全部 ' + songs.length + ' 首每日推荐；滚动时仅渲染视窗附近歌曲'
        : '来自网易云推荐歌单';
      list.innerHTML = sections.join('');
      if (songs.length) renderHomePlatformDailyWindow(true);
    } else {
      status.textContent = homeDiscoverState.error ? '网易云推荐读取失败' : '网易云暂未返回推荐内容';
      status.classList.toggle('is-error', !!homeDiscoverState.error);
      list.innerHTML = homePlatformRecommendationEmptyHtml('netease', homeDiscoverState.loggedIn
        ? '平台本次没有返回推荐内容，未使用搜索结果补位。'
        : '登录网易云后可读取推荐歌单与每日推荐，未使用关键词搜索替代。');
    }
    return;
  }

  var feedConfig = homePlatformRecommendationFeedConfig(source);
  var feedState = homePlatformRecommendationState.feeds[source];
  if (feedConfig && feedState) {
    var sourceLabel = homePlatformRecommendationSourceLabel(source);
    if (feedState.loading) {
      status.textContent = '正在读取' + sourceLabel + '平台推荐…';
      list.innerHTML = '<div class="home-platform-recommend-loading">正在同步推荐内容</div>';
      return;
    }
    if (feedState.songs.length) {
      var sectionTitle = feedConfig.sectionTitle;
      var cardLabel = feedConfig.cardLabel;
      var readyText = feedConfig.readyText;
      if (source === 'qishui' && feedState.fallback) {
        sectionTitle = '你的音乐';
        cardLabel = '汽水喜欢 / 最近播放';
        readyText = '汽水推荐 Feed 暂不可用，当前显示你的喜欢与最近播放';
      } else if (source === 'spotify' && feedState.mode === 'liked-affinity') {
        sectionTitle = '你的喜欢';
        cardLabel = 'Spotify 喜欢的歌曲';
        readyText = '来自 Spotify Web API 的喜欢歌曲';
      } else if (source === 'spotify' && feedState.mode === 'personal-top') {
        sectionTitle = '你的常听';
        cardLabel = 'Spotify 常听歌曲';
        readyText = '来自 Spotify Web API 的个人常听';
      }
      status.textContent = readyText;
      list.innerHTML = '<section><h3>' + escHtml(sectionTitle) + '</h3><div class="home-platform-recommend-grid">' + feedState.songs.map(function (item, index) {
        return homePlatformRecommendationCard(source + '-song', index, item, cardLabel);
      }).join('') + '</div></section>';
    } else {
      var authRequired = /(?:AUTH|LOGIN)_REQUIRED|NOT_CONFIGURED/i.test(feedState.error);
      var feedFailed = !!feedState.error && !authRequired;
      status.textContent = feedFailed ? sourceLabel + '推荐读取失败' : sourceLabel + '暂未返回推荐内容';
      status.classList.toggle('is-error', feedFailed);
      list.innerHTML = homePlatformRecommendationEmptyHtml(source, feedState.message || (feedFailed
        ? '推荐接口当前不可用，未使用关键词搜索补位。'
        : '连接' + sourceLabel + '后可读取平台推荐，未使用关键词搜索替代。'));
    }
    return;
  }

  status.textContent = homePlatformRecommendationSourceLabel(source) + ' 暂无平台推荐接口';
  list.innerHTML = homePlatformRecommendationEmptyHtml(source);
}

async function loadHomePlatformNeteaseRecommendations(force) {
  if (homePlatformRecommendationState.neteaseLoading) return;
  homePlatformRecommendationState.neteaseLoading = true;
  renderHomePlatformRecommendations();
  try {
    if (homeDiscoverState.loading && typeof waitForHomeDiscoverIdle === 'function') await waitForHomeDiscoverIdle(2600);
    if (force || !homeDiscoverState.loaded) await loadHomeDiscover(!!force);
    if (homeDiscoverState.loading && typeof waitForHomeDiscoverIdle === 'function') await waitForHomeDiscoverIdle(2600);
    if (force || !Array.isArray(homeDiscoverState.podcasts) || !homeDiscoverState.podcasts.length) {
      var podcastData = await apiJson('/api/podcast/hot?limit=8&t=' + Date.now(), { timeoutMs: 12000 });
      var hotPodcasts = podcastData && Array.isArray(podcastData.podcasts) ? podcastData.podcasts : [];
      if (hotPodcasts.length) homeDiscoverState.podcasts = hotPodcasts;
    }
  } catch (error) {
    console.warn('[HomePlatformNetease]', error);
  } finally {
    homePlatformRecommendationState.neteaseLoading = false;
    renderHomePlatformRecommendations();
  }
}

async function loadHomePlatformQishuiRecommendations(force) {
  return loadHomePlatformFeedRecommendations('qishui', force);
}

async function loadHomePlatformFeedRecommendations(source, force) {
  var config = homePlatformRecommendationFeedConfig(source);
  var feedState = homePlatformRecommendationState.feeds[source];
  if (!config || !feedState || feedState.loading) return;
  if (feedState.loaded && !force) return;
  feedState.loading = true;
  feedState.error = '';
  feedState.message = '';
  renderHomePlatformRecommendations();
  try {
    var separator = config.endpoint.indexOf('?') >= 0 ? '&' : '?';
    var data = await apiJson(config.endpoint + separator + 't=' + Date.now(), { timeoutMs: 14000 });
    var rawSongs = data && (data.songs || data.tracks || data.items || data.recommendations);
    feedState.songs = (Array.isArray(rawSongs) ? rawSongs : []).map(cloneSong);
    feedState.error = data && data.error ? String(data.error) : '';
    feedState.message = data && data.message ? String(data.message) : '';
    feedState.mode = data && data.mode ? String(data.mode) : '';
    feedState.source = data && data.source ? String(data.source) : '';
    feedState.fallback = !!(data && data.fallback);
    feedState.provenance = data && data.provenance ? String(data.provenance) : '';
    feedState.loaded = true;
  } catch (error) {
    console.warn('[HomePlatformFeed:' + source + ']', error);
    feedState.songs = [];
    feedState.error = String(error && error.message || 'PLATFORM_FEED_FAILED');
    feedState.message = '';
    feedState.loaded = true;
  } finally {
    feedState.loading = false;
    renderHomePlatformRecommendations();
  }
}

async function loadHomePlatformRecommendations(source, force) {
  homePlatformRecommendationState.source = source || 'netease';
  renderHomePlatformRecommendations();
  try {
    if (homePlatformRecommendationState.source === 'netease') {
      await loadHomePlatformNeteaseRecommendations(force);
    } else if (homePlatformRecommendationFeedConfig(homePlatformRecommendationState.source)) {
      await loadHomePlatformFeedRecommendations(homePlatformRecommendationState.source, force);
    }
  } catch (error) {
    console.warn('[HomePlatformRecommendations]', error);
  }
  renderHomePlatformRecommendations();
}

function playHomePlatformFeedSong(source, index) {
  var config = homePlatformRecommendationFeedConfig(source);
  var feedState = homePlatformRecommendationState.feeds[source];
  var songs = feedState && feedState.songs || [];
  if (!config || !songs.length) return;
  playQueue = songs.map(cloneSong);
  currentIdx = Math.max(0, Math.min(playQueue.length - 1, Number(index) || 0));
  homeForcedOpen = false;
  homeSuppressed = false;
  if (typeof setHomeControlsLocked === 'function') setHomeControlsLocked(false);
  if (typeof safeRenderQueuePanel === 'function') safeRenderQueuePanel('home-platform-' + source, { scrollCurrent: true });
  if (typeof safeShelfRebuild === 'function') safeShelfRebuild('home-platform-' + source, true);
  if (typeof forcePlaybackControlsInteractive === 'function') forcePlaybackControlsInteractive();
  Promise.resolve(playQueueAt(currentIdx, {
    manual: true,
    context: { type: 'home-platform-recommendation', playlistName: config.playlistName },
  })).catch(function (error) { console.warn('[HomePlatformFeedPlay:' + source + ']', error); });
}

function closeHomePlatformRecommendations() {
  var mask = document.getElementById('home-platform-recommend-mask');
  if (!mask) return;
  mask.classList.remove('show');
  mask.setAttribute('aria-hidden', 'true');
  homePlatformRecommendationState.open = false;
  var focusTarget = homePlatformRecommendationState.previousFocus;
  homePlatformRecommendationState.previousFocus = null;
  if (focusTarget && typeof focusTarget.focus === 'function') {
    setTimeout(function () { focusTarget.focus(); }, 0);
  }
}

function bindHomePlatformRecommendationControls() {
  if (homePlatformRecommendationControlsBound) return;
  homePlatformRecommendationControlsBound = true;
  var mask = document.getElementById('home-platform-recommend-mask');
  var tabs = document.getElementById('home-platform-recommend-tabs');
  var list = document.getElementById('home-platform-recommend-list');
  var close = document.getElementById('home-platform-recommend-close');
  var done = document.getElementById('home-platform-recommend-done');
  var refresh = document.getElementById('home-platform-recommend-refresh');
  if (tabs) tabs.addEventListener('click', function (event) {
    var tab = event.target.closest('[data-home-recommend-source]');
    if (!tab || !tabs.contains(tab)) return;
    loadHomePlatformRecommendations(tab.getAttribute('data-home-recommend-source'), false);
  });
  if (list) list.addEventListener('click', function (event) {
    var card = event.target.closest('[data-home-recommend-kind]');
    if (!card || !list.contains(card)) return;
    var kind = card.getAttribute('data-home-recommend-kind');
    var index = Number(card.getAttribute('data-home-recommend-index')) || 0;
    closeHomePlatformRecommendations();
    if (kind === 'netease-playlist' && typeof openHomePlaylist === 'function') openHomePlaylist(index);
    else if (kind === 'netease-song' && typeof playHomeSong === 'function') playHomeSong(index);
    else if (/^(qishui|kugou|spotify)-song$/.test(kind)) playHomePlatformFeedSong(kind.replace(/-song$/, ''), index);
  });
  if (list) list.addEventListener('scroll', scheduleHomePlatformDailyWindowRender, { passive: true });
  window.addEventListener('resize', scheduleHomePlatformDailyWindowRender, { passive: true });
  if (close) close.addEventListener('click', closeHomePlatformRecommendations);
  if (done) done.addEventListener('click', closeHomePlatformRecommendations);
  if (refresh) refresh.addEventListener('click', function () {
    loadHomePlatformRecommendations(homePlatformRecommendationState.source, true);
  });
  if (mask) mask.addEventListener('click', function (event) {
    if (event.target === mask) closeHomePlatformRecommendations();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && homePlatformRecommendationState.open) closeHomePlatformRecommendations();
  });
}

function openHomePlatformRecommendations(preferredSource) {
  bindHomePlatformRecommendationControls();
  var mask = document.getElementById('home-platform-recommend-mask');
  if (!mask) return;
  homePlatformRecommendationState.previousFocus = document.activeElement;
  homePlatformRecommendationState.open = true;
  mask.classList.add('show');
  mask.setAttribute('aria-hidden', 'false');
  var defaultSource = loginStatus && loginStatus.loggedIn
    ? 'netease'
    : (qishuiLoginStatus && (qishuiLoginStatus.loggedIn || qishuiLoginStatus.configured)
      ? 'qishui'
      : (kugouLoginStatus && kugouLoginStatus.loggedIn ? 'kugou' : 'netease'));
  var source = /^(netease|qishui|qq|kugou)$/.test(String(preferredSource || '')) ? preferredSource : defaultSource;
  loadHomePlatformRecommendations(source, false);
  setTimeout(function () {
    var activeTab = mask.querySelector('[data-home-recommend-source="' + source + '"]');
    if (activeTab) activeTab.focus();
  }, 0);
}

function openHomeDashboardRadio() {
  openHomePlatformRecommendations();
}

function scheduleHomeDashboardRefresh() {
  if (homeDashboardRefreshTimer) {
    clearTimeout(homeDashboardRefreshTimer);
    homeDashboardRefreshTimer = null;
  }
  if (!emptyHomeActive || document.hidden) return;
  homeDashboardRefreshTimer = setTimeout(function () {
    homeDashboardRefreshTimer = null;
    if (!emptyHomeActive || document.hidden) return;
    homeDashboardUpdateClock();
    renderHomeInsightDock();
    scheduleHomeDashboardRefresh();
  }, 15000);
}

function renderHomeDashboard() {
  renderHomeDashboardHero();
  renderHomeDashboardQuickCards();
  renderHomeInsightDock();
  scheduleHomeDashboardRefresh();
}

var homeDashboardBaseRenderHomeDiscover = typeof renderHomeDiscover === 'function' ? renderHomeDiscover : null;
if (homeDashboardBaseRenderHomeDiscover) {
  renderHomeDiscover = function () {
    var result = homeDashboardBaseRenderHomeDiscover.apply(this, arguments);
    renderHomeDashboard();
    return result;
  };
}

document.addEventListener('visibilitychange', function () {
  if (!document.hidden && emptyHomeActive) renderHomeDashboard();
  else scheduleHomeDashboardRefresh();
  homeDashboardUpdateVideoPower();
});

bindHomeDashboardVideoControls();
bindHomePlatformRecommendationControls();
renderHomeDashboard();
