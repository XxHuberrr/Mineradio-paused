// ============================================================
var searchTimer = null;
var searchRequestSeq = 0;
var searchLastResultQuery = '';
var searchProviderNotice = '';
var SEARCH_HISTORY_STORE_KEY = 'mineradio-search-history';
var SEARCH_HISTORY_STORE_VERSION = 3;
var SEARCH_HISTORY_MODES = ['song', 'netease', 'qq', 'kugou', 'qishui', 'podcast'];
var MUSIC_SEARCH_INITIAL_VISIBLE = 18;
var MUSIC_SEARCH_APPEND_BATCH = 14;
var MUSIC_SEARCH_MAX_RESULTS = 180;
var searchLoadMoreObserver = null;
var pendingSearchProviderPages = null;
var searchMusicRenderState = {
  key: '',
  query: '',
  mode: 'song',
  songs: [],
  visibleCount: 0,
  appending: false,
  loadingMore: false,
  providerPages: {},
  remoteHasMore: false
};
var $input = document.getElementById('search-input');
var $results = document.getElementById('search-results');
var $loading = document.getElementById('loading-overlay');
function setSearchHistorySurface(on) {
  if ($results) $results.classList.toggle('search-history-surface', !!on);
}
function syncSearchAreaResultState() {
  var searchArea = document.getElementById('search-area');
  if (!searchArea || !$results) return;
  var hasVisibleResults = $results.classList.contains('show') && $results.children.length > 0;
  var hasIntent = !!($input && String($input.value || '').trim()) || searchMode === 'podcast';
  searchArea.classList.toggle('has-results', hasVisibleResults && hasIntent);
}
if (window.MutationObserver && $results) {
  new MutationObserver(syncSearchAreaResultState).observe($results, { childList: true, attributes: true, attributeFilter: ['class'] });
}
function isMusicSearchMode(mode) {
  return mode !== 'podcast';
}
function searchResultKey(q, mode) {
  return (mode || searchMode || 'song') + '|' + String(q || '').trim();
}
function disconnectSearchLoadMoreObserver() {
  if (searchLoadMoreObserver) searchLoadMoreObserver.disconnect();
  searchLoadMoreObserver = null;
}
function resetSearchMusicRenderState() {
  disconnectSearchLoadMoreObserver();
  searchMusicRenderState.key = '';
  searchMusicRenderState.query = '';
  searchMusicRenderState.mode = 'song';
  searchMusicRenderState.songs = [];
  searchMusicRenderState.visibleCount = 0;
  searchMusicRenderState.appending = false;
  searchMusicRenderState.loadingMore = false;
  searchMusicRenderState.providerPages = {};
  searchMusicRenderState.remoteHasMore = false;
  pendingSearchProviderPages = null;
}
function clearSearchResults() {
  searchRequestSeq++;
  searchLastResultQuery = '';
  resetSearchMusicRenderState();
  playlist = [];
  podcastResults = [];
  podcastPrograms = [];
  podcastCurrentRadio = null;
  $results.innerHTML = '';
  $results.classList.remove('show', 'search-history-surface');
}
function emptySearchHistoryState() {
  return { version: SEARCH_HISTORY_STORE_VERSION, items: [] };
}
function normalizeSearchHistoryItems(items) {
  var seen = {};
  return (Array.isArray(items) ? items : []).map(function (value) {
    return String(value || '').trim();
  }).filter(function (value) {
    var key = value.toLowerCase();
    if (!value || seen[key]) return false;
    seen[key] = true;
    return true;
  }).slice(0, 10);
}
function readSearchHistoryState() {
  var state = emptySearchHistoryState();
  try {
    var raw = JSON.parse(localStorage.getItem(SEARCH_HISTORY_STORE_KEY) || '[]');
    if (Array.isArray(raw)) {
      state.items = normalizeSearchHistoryItems(raw);
      return state;
    }
    if (!raw || typeof raw !== 'object') return state;
    if (Array.isArray(raw.items)) {
      state.items = normalizeSearchHistoryItems(raw.items);
      return state;
    }
    var sourceModes = raw.modes && typeof raw.modes === 'object' ? raw.modes : raw;
    var migratedItems = [];
    SEARCH_HISTORY_MODES.forEach(function (mode) {
      migratedItems = migratedItems.concat(Array.isArray(sourceModes[mode]) ? sourceModes[mode] : []);
    });
    state.items = normalizeSearchHistoryItems(migratedItems);
    return state;
  } catch (e) {
    return state;
  }
}
function writeSearchHistoryState(state) {
  var normalized = emptySearchHistoryState();
  normalized.items = normalizeSearchHistoryItems(state && state.items);
  try { localStorage.setItem(SEARCH_HISTORY_STORE_KEY, JSON.stringify(normalized)); } catch (e) { }
}
function readSearchHistory() {
  return readSearchHistoryState().items.slice();
}
function writeSearchHistory(items) {
  writeSearchHistoryState({ items: items });
}
function rememberSearchQuery(q) {
  q = String(q || '').trim();
  if (!q) return;
  var items = readSearchHistory().filter(function (item) { return item.toLowerCase() !== q.toLowerCase(); });
  items.unshift(q);
  writeSearchHistory(items);
}
function renderSearchHistory() {
  resetSearchMusicRenderState();
  var items = readSearchHistory();
  if (!items.length) {
    $results.innerHTML = '';
    $results.classList.remove('show', 'search-history-surface');
    return false;
  }
  $results.innerHTML =
    '<div class="search-history">' +
    '<div class="search-history-head"><span>搜索历史</span><button class="search-history-clear" type="button" data-clear-history="1">清空</button></div>' +
    '<div class="search-history-list">' +
    items.map(function (q) { return '<button class="search-history-chip" type="button" data-history-query="' + escHtml(q) + '">' + escHtml(q) + '</button>'; }).join('') +
    '</div>' +
    '</div>';
  setSearchHistorySurface(true);
  $results.classList.add('show');
  requestAnimationFrame(updateSearchPillGlassDisplacementMap);
  return true;
}
function clearSearchHistory() {
  writeSearchHistory([]);
  if (!renderSearchHistory() && searchMode === 'podcast') loadPodcastHot();
}
function runSearchHistory(q) {
  q = String(q || '').trim();
  if (!q) return;
  $input.value = q;
  setPeek(document.getElementById('search-area'), true, 'search');
  doSearch(q);
  $input.focus();
}
function updateSearchModeTabs() {
  var songBtn = document.getElementById('search-mode-song');
  var neteaseBtn = document.getElementById('search-mode-netease');
  var qqBtn = document.getElementById('search-mode-qq');
  var kugouBtn = document.getElementById('search-mode-kugou');
  var qishuiBtn = document.getElementById('search-mode-qishui');
  var podcastBtn = document.getElementById('search-mode-podcast');
  if (songBtn) {
    songBtn.classList.toggle('active', searchMode === 'song');
    songBtn.setAttribute('aria-selected', searchMode === 'song' ? 'true' : 'false');
  }
  if (neteaseBtn) {
    neteaseBtn.classList.toggle('active', searchMode === 'netease');
    neteaseBtn.setAttribute('aria-selected', searchMode === 'netease' ? 'true' : 'false');
  }
  if (qqBtn) {
    qqBtn.classList.toggle('active', searchMode === 'qq');
    qqBtn.setAttribute('aria-selected', searchMode === 'qq' ? 'true' : 'false');
  }
  if (kugouBtn) {
    kugouBtn.classList.toggle('active', searchMode === 'kugou');
    kugouBtn.setAttribute('aria-selected', searchMode === 'kugou' ? 'true' : 'false');
  }
  if (qishuiBtn) {
    qishuiBtn.classList.toggle('active', searchMode === 'qishui');
    qishuiBtn.setAttribute('aria-selected', searchMode === 'qishui' ? 'true' : 'false');
  }
  if (podcastBtn) {
    podcastBtn.classList.toggle('active', searchMode === 'podcast');
    podcastBtn.setAttribute('aria-selected', searchMode === 'podcast' ? 'true' : 'false');
  }
  if ($input) {
    $input.placeholder = searchMode === 'podcast'
      ? '搜索播客、电台...'
      : (searchMode === 'kugou' ? '搜索酷狗音乐...' : (searchMode === 'qq' ? '搜索 QQ 音乐...' : (searchMode === 'netease' ? '搜索网易云音乐...' : '搜索歌曲、歌手...')));
  }
  if ($input && searchMode === 'qishui') $input.placeholder = '搜索汽水音乐匹配源...';
  requestAnimationFrame(updateSearchPillGlassDisplacementMap);
}
function setSearchMode(mode) {
  mode = (mode === 'podcast' || mode === 'netease' || mode === 'qq' || mode === 'kugou' || mode === 'qishui') ? mode : 'song';
  if (searchMode === mode) return;
  searchMode = mode;
  updateSearchModeTabs();
  clearSearchResults();
  var searchArea = document.getElementById('search-area');
  if (searchArea) setPeek(searchArea, true, 'search');
  var q = $input ? $input.value.trim() : '';
  if (searchMode === 'podcast') {
    if (q) doSearch(q);
    else if (!renderSearchHistory()) loadPodcastHot();
  } else if (q) {
    doSearch(q);
  } else {
    renderSearchHistory();
  }
}
function podcastMetaText(item) {
  item = item || {};
  var bits = [];
  if (item.djName) bits.push(item.djName);
  if (item.programCount) bits.push(item.programCount + ' episodes');
  if (item.subCount) bits.push(Math.round(item.subCount / 1000) + 'k follows');
  return bits.join('  ·  ');
}
function formatProgramTime(sec) {
  sec = Math.max(0, Number(sec) || 0);
  var h = Math.floor(sec / 3600);
  var m = Math.floor((sec % 3600) / 60);
  var s = Math.floor(sec % 60);
  return h ? (h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')) : (m + ':' + String(s).padStart(2, '0'));
}
function programMetaText(item) {
  item = item || {};
  var bits = [];
  if (item.radioName || item.artist) bits.push(item.radioName || item.artist);
  if (item.djName && item.djName !== item.artist) bits.push(item.djName);
  if (item.duration) bits.push(formatProgramTime(Math.round(item.duration / 1000)));
  return bits.join('  ·  ');
}
function searchThumbHtml(src) {
  return src
    ? '<img src="' + coverUrlWithSize(src, 80) + '" alt="" loading="lazy" onerror="this.style.opacity=0.2">'
    : '<div style="width:40px;height:40px;border-radius:6px;background:rgba(255,255,255,0.06);flex-shrink:0"></div>';
}
function renderPodcastRadios(items, label) {
  setSearchHistorySurface(false);
  podcastResults = items || [];
  podcastPrograms = [];
  playlist = [];
  if (!podcastResults.length) {
    $results.innerHTML = '<div class="search-empty">No podcast found</div>';
    $results.classList.add('show');
    return;
  }
  $results.innerHTML = podcastResults.map(function (p, i) {
    return '<div class="search-result">' +
      '<div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0" onclick="openPodcastPrograms(' + i + ')">' +
      searchThumbHtml(p.cover) +
      '<div class="search-result-info">' +
      '<div class="search-result-title">' + escHtml(p.name || '') + '<span class="tag-podcast">Podcast</span></div>' +
      '<div class="search-result-meta">' + escHtml(podcastMetaText(p) || label || 'NetEase Radio') + '</div>' +
      '</div>' +
      '</div>' +
      '<button class="add-btn" title="Open" onclick="event.stopPropagation();openPodcastPrograms(' + i + ')">›</button>' +
      '</div>';
  }).join('');
  $results.classList.add('show');
  if (window.gsap) animateListItems($results, '.search-result', { x: 0, y: 6, stagger: 0.012, duration: 0.18, limit: 18 });
}
async function loadPodcastHot() {
  var requestSeq = ++searchRequestSeq;
  setSearchHistorySurface(false);
  $results.innerHTML = '<div class="search-empty">Loading podcasts...</div>';
  $results.classList.add('show');
  try {
    var data = await apiJson('/api/podcast/hot?limit=18');
    if (requestSeq !== searchRequestSeq || searchMode !== 'podcast') return;
    renderPodcastRadios(data.podcasts || [], 'Hot podcasts');
  } catch (err) {
    console.error('Podcast hot:', err);
    if (requestSeq === searchRequestSeq) $results.innerHTML = '<div class="search-empty">Podcast load failed</div>';
  }
}
async function doPodcastSearch(q) {
  var requestSeq = ++searchRequestSeq;
  try {
    var data = await apiJson('/api/podcast/search?keywords=' + encodeURIComponent(q) + '&limit=18');
    if (requestSeq !== searchRequestSeq || searchMode !== 'podcast' || $input.value.trim() !== q) return;
    var podcasts = data.podcasts || [];
    if (podcasts.length) rememberSearchQuery(q);
    renderPodcastRadios(podcasts, 'Search results');
  } catch (err) {
    console.error('Podcast search:', err);
  }
}
async function openPodcastPrograms(i) {
  var radio = podcastResults[i]; if (!radio) return;
  var requestSeq = ++searchRequestSeq;
  setSearchHistorySurface(false);
  podcastCurrentRadio = radio;
  $results.innerHTML = '<div class="search-empty">Loading episodes...</div>';
  $results.classList.add('show');
  try {
    var data = await apiJson('/api/podcast/programs?id=' + encodeURIComponent(radio.id) + '&limit=' + PLAYLIST_LAZY_BATCH_SIZE);
    if (requestSeq !== searchRequestSeq || searchMode !== 'podcast') return;
    podcastCurrentRadio = Object.assign({}, radio, data.radio || {});
    podcastPrograms = data.programs || [];
    playlist = podcastPrograms;
    renderPodcastPrograms();
  } catch (err) {
    console.error('Podcast programs:', err);
    if (requestSeq === searchRequestSeq) $results.innerHTML = '<div class="search-empty">Episodes load failed</div>';
  }
}
function renderPodcastPrograms() {
  setSearchHistorySurface(false);
  var radio = podcastCurrentRadio || {};
  if (!podcastPrograms.length) {
    $results.innerHTML = '<div class="podcast-result-head"><button class="podcast-back-btn" onclick="event.stopPropagation();renderPodcastRadios(podcastResults)">‹</button><div class="search-result-info"><div class="search-result-title">' + escHtml(radio.name || 'Podcast') + '</div><div class="search-result-meta">No playable episodes</div></div></div>';
    $results.classList.add('show');
    return;
  }
  $results.innerHTML =
    '<div class="podcast-result-head">' +
    '<button class="podcast-back-btn" onclick="event.stopPropagation();renderPodcastRadios(podcastResults)">‹</button>' +
    searchThumbHtml(radio.cover) +
    '<div class="search-result-info"><div class="search-result-title">' + escHtml(radio.name || 'Podcast') + '<span class="tag-podcast">Podcast</span></div><div class="search-result-meta">' + escHtml(radio.djName || (podcastPrograms.length + ' episodes')) + '</div></div>' +
    '</div>' +
    podcastPrograms.map(function (p, i) {
      return '<div class="search-result">' +
        '<div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0" onclick="playPodcastProgram(' + i + ')">' +
        searchThumbHtml(p.cover) +
        '<div class="search-result-info">' +
        '<div class="search-result-title">' + escHtml(p.name || '') + '</div>' +
        '<div class="search-result-meta">' + escHtml(programMetaText(p)) + '</div>' +
        '</div>' +
        '</div>' +
        '<button class="add-btn" title="下一首播放" onclick="event.stopPropagation();queuePodcastProgram(' + i + ')">+</button>' +
        '</div>';
    }).join('');
  $results.classList.add('show');
  if (window.gsap) animateListItems($results, '.search-result', { x: 0, y: 6, stagger: 0.010, duration: 0.18, limit: 18 });
}
function queuePodcastProgram(i) {
  var item = podcastPrograms[i]; if (!item) return;
  queueSongNext(item);
  showToast('已设为下一首: ' + item.name);
}
function playPodcastProgram(i) {
  var item = podcastPrograms[i]; if (!item) return;
  playSearchResult(i);
}

$input.addEventListener('input', function () {
  clearTimeout(searchTimer);
  var q = $input.value.trim();
  searchRequestSeq++;
  searchLastResultQuery = '';
  resetSearchMusicRenderState();
  if (!q) {
    playlist = [];
    if (!renderSearchHistory() && searchMode === 'podcast') loadPodcastHot();
    return;
  }
  if (isMusicSearchMode(searchMode)) {
    setSearchHistorySurface(false);
    $results.innerHTML = '<div class="search-empty">正在搜索 “' + escHtml(q) + '”…</div>';
    $results.classList.add('show');
  }
  searchTimer = setTimeout(function () { doSearch(q); }, 180);
});
$input.addEventListener('focus', function () {
  var searchArea = document.getElementById('search-area');
  if (searchArea) setPeek(searchArea, true, 'search');
  if (!$input.value.trim()) {
    if (!renderSearchHistory() && searchMode === 'podcast') loadPodcastHot();
  } else if ($results.children.length > 0) {
    $results.classList.add('show');
  }
});
var searchBoxEl = document.getElementById('search-box');
if (searchBoxEl) {
  searchBoxEl.addEventListener('click', function () {
    if ($input) $input.focus();
  });
}
$input.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    clearTimeout(searchTimer);
    var q = $input.value.trim();
    if (isMusicSearchMode(searchMode) && q && playlist.length && searchLastResultQuery === searchResultKey(q)) $results.classList.add('show');
    else doSearch(q, { autoPlayFirst: false });
  } else if (e.key === 'Escape') {
    clearTimeout(searchTimer);
    $input.blur();
    clearSearchResults();
    if (!emptyHomeActive) setPeek(document.getElementById('search-area'), false, 'search');
  }
});
$results.addEventListener('click', function (e) {
  var loadMore = e.target && e.target.closest ? e.target.closest('[data-search-load-more]') : null;
  if (loadMore) {
    e.preventDefault();
    e.stopPropagation();
    appendNextSearchResults();
    return;
  }
  var clearBtn = e.target && e.target.closest ? e.target.closest('[data-clear-history]') : null;
  if (clearBtn) {
    e.preventDefault();
    e.stopPropagation();
    clearSearchHistory();
    return;
  }
  var item = e.target && e.target.closest ? e.target.closest('[data-history-query]') : null;
  if (item) {
    e.preventDefault();
    e.stopPropagation();
    runSearchHistory(item.getAttribute('data-history-query') || '');
  }
});
$results.addEventListener('scroll', function () {
  if (!$results.classList.contains('show')) return;
  if ($results.scrollTop + $results.clientHeight >= $results.scrollHeight - 96) appendNextSearchResults();
}, { passive: true });
document.addEventListener('click', function (e) {
  var searchArea = document.getElementById('search-area');
  if (!searchArea.contains(e.target)) {
    $results.classList.remove('show');
    if (!emptyHomeActive) setPeek(searchArea, false, 'search');
  }
});
updateSearchModeTabs();

function songProviderKey(song) {
  if (song && (song.provider === 'spotify' || song.source === 'spotify' || song.type === 'spotify' || song.spotifyId || song.spotifyUri)) return 'spotify';
  if (song && (song.provider === 'qq' || song.source === 'qq' || song.type === 'qq')) return 'qq';
  if (song && (song.provider === 'qishui' || song.source === 'qishui' || song.type === 'qishui')) return 'qishui';
  if (song && (song.provider === 'kugou' || song.source === 'kugou' || song.type === 'kugou' || song.hash || song.audioHash)) return 'kugou';
  return 'netease';
}
function songSourceTagHtml(song, opts) {
  opts = opts || {};
  var rawKey = song && (song.resolvedPlaybackProvider || song.playbackProvider || song.audioProvider || song.providerResolved || '');
  var key = /^(netease|qq|kugou|qishui|spotify)$/.test(String(rawKey || '')) ? String(rawKey) : songProviderKey(song);
  var label = key === 'qq' ? 'QQ' : (key === 'kugou' ? 'KG' : (key === 'qishui' ? 'QS' : (key === 'spotify' ? 'SP' : 'NE')));
  if (opts.switcher) {
    return '<button type="button" class="tag-source ' + key + ' control-source-chip" title="切换音源" aria-haspopup="true" onclick="toggleControlSourceSwitcher(event)">' + label + '</button>';
  }
  return '<span class="tag-source ' + key + '">' + label + '</span>';
}
var controlSourceSwitcherState = { open: false, loading: false, requestId: 0, anchor: null };
function controlSourceProviders() {
  return [
    { key: 'netease', label: 'NE', title: '网易云' },
    { key: 'qq', label: 'QQ', title: 'QQ音乐' },
    { key: 'kugou', label: 'KG', title: '酷狗' },
    { key: 'qishui', label: 'QS', title: '汽水' },
    { key: 'spotify', label: 'SP', title: 'Spotify' }
  ];
}
function controlSourceProviderTitle(provider) {
  var item = controlSourceProviders().filter(function (p) { return p.key === provider; })[0];
  return item ? item.title : provider;
}
function controlSourceSearchUrl(provider, query) {
  if (provider === 'qq') return '/api/qq/search?keywords=' + encodeURIComponent(query) + '&limit=8';
  if (provider === 'kugou') return '/api/kugou/search?keywords=' + encodeURIComponent(query) + '&limit=8';
  if (provider === 'qishui') return '/api/qishui/search?keywords=' + encodeURIComponent(query) + '&limit=8';
  if (provider === 'spotify') return '/api/spotify/search?keywords=' + encodeURIComponent(query) + '&limit=8';
  return '/api/search?keywords=' + encodeURIComponent(query) + '&limit=10';
}
function ensureControlSourceSwitcher() {
  var el = document.getElementById('control-source-switcher');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'control-source-switcher';
  el.className = 'control-source-switcher';
  el.setAttribute('role', 'menu');
  el.addEventListener('click', function (e) { e.stopPropagation(); });
  document.body.appendChild(el);
  return el;
}
function currentControlSong() {
  return Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
}
function controlSourceSwitchQuery(song) {
  song = song || {};
  var artist = String(song.artist || '').split(/\s*\/\s*|\s*,\s*|\s*&\s*/)[0] || '';
  return [song.name || song.title || '', artist].filter(Boolean).join(' ').trim();
}
function controlSourcePositionSwitcher(anchor) {
  var el = ensureControlSourceSwitcher();
  anchor = anchor || controlSourceSwitcherState.anchor;
  if (!anchor || !anchor.getBoundingClientRect) return;
  var rect = anchor.getBoundingClientRect();
  var width = Math.min(276, window.innerWidth - 24);
  var left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
  el.style.width = width + 'px';
  el.style.left = left + 'px';
  el.style.bottom = Math.max(18, window.innerHeight - rect.top + 10) + 'px';
}
function closeControlSourceSwitcher() {
  var el = document.getElementById('control-source-switcher');
  controlSourceSwitcherState.open = false;
  controlSourceSwitcherState.loading = false;
  controlSourceSwitcherState.anchor = null;
  if (el) el.classList.remove('show', 'loading');
}
function controlSourceMatchSong(entry) {
  if (!entry) return null;
  if (entry.song) return entry.song;
  return entry.name ? entry : null;
}
function controlSourceMatchIssue(entry) {
  return entry && entry.issue ? entry.issue : 'no_source';
}
function renderControlSourceSwitcher(matches) {
  var el = ensureControlSourceSwitcher();
  var song = currentControlSong();
  var current = songProviderKey(song);
  matches = matches || {};
  el.classList.toggle('loading', !!controlSourceSwitcherState.loading);
  el.innerHTML =
    '<div class="control-source-switcher-head"><span>切换音源</span><small>' + (controlSourceSwitcherState.loading ? '正在匹配' : '保留当前进度') + '</small></div>' +
    '<div class="control-source-options">' +
    controlSourceProviders().map(function (provider) {
      var entry = matches[provider.key];
      var match = controlSourceMatchSong(entry);
      var issue = controlSourceMatchIssue(entry);
      var active = provider.key === current;
      var ready = active || !!match;
      var providerLimited = !!(match && provider.key === 'spotify' && match.playable === false);
      var cleanStatus = active ? '当前' : (providerLimited ? '匹配源' : (match ? '可切换' : (controlSourceSwitcherState.loading ? '检测中' : controlSourceIssueLabel(issue))));
      var title = active ? '当前音源' : (providerLimited ? (provider.title + ': 播放将自动换源') : (match ? ('切换到 ' + provider.title) : (provider.title + ': ' + controlSourceIssueLabel(issue))));
      var status = active ? '当前' : (providerLimited ? '匹配源' : (match ? '可切换' : (controlSourceSwitcherState.loading ? '检测中' : '无匹配')));
      return '<button type="button" class="control-source-option' + (active ? ' active' : '') + (!ready ? ' disabled' : '') + '" data-source-provider="' + provider.key + '" title="' + escHtml(title) + '" ' + (!ready ? 'disabled ' : '') + 'onclick="switchCurrentSongSource(\'' + provider.key + '\')">' +
        '<span class="tag-source ' + provider.key + '">' + provider.label + '</span>' +
        '<span class="control-source-option-title">' + provider.title + '</span>' +
        '<small>' + cleanStatus + '</small>' +
        '</button>';
    }).join('') +
    '</div>';
  controlSourcePositionSwitcher();
}
async function findControlSourceMatchResult(song, provider) {
  var query = controlSourceSwitchQuery(song);
  if (!query) return { song: null, issue: 'no_source' };
  var data = await apiJson(controlSourceSearchUrl(provider, query), { timeoutMs: 6000 });
  var list = data && (data.songs || data.result || []);
  if (!Array.isArray(list) || !list.length) return { song: null, issue: 'no_source' };
  var best = null;
  var bestScore = -Infinity;
  var bestIssue = 'no_source';
  for (var i = 0; i < list.length; i++) {
    var candidate = list[i];
    var issue = sourceCandidateRejectReason(song, candidate, provider);
    if (issue) {
      if (bestIssue === 'no_source' || issue === 'blocked_artist' || issue === 'artist_extra' || issue === 'artist_mismatch') bestIssue = issue;
      continue;
    }
    var score = typeof scoreSongSearchResult === 'function' ? scoreSongSearchResult(candidate, query, i) : 0;
    if (typeof isSameTitleArtist === 'function' && isSameTitleArtist(song, candidate)) score += 120;
    if (candidate && candidate.playable === false) score -= 18;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best && bestScore >= 24 ? { song: cloneSong(best), issue: '' } : { song: null, issue: bestIssue };
}
async function findControlSourceMatch(song, provider) {
  var strictResult = await findControlSourceMatchResult(song, provider);
  return strictResult && strictResult.song ? strictResult.song : null;
}
async function loadControlSourceMatches(song, requestId) {
  var matches = {};
  var providers = controlSourceProviders();
  await Promise.all(providers.map(async function (provider) {
    if (songProviderKey(song) === provider.key) {
      matches[provider.key] = { song: song, issue: '' };
      return;
    }
    try {
      matches[provider.key] = await findControlSourceMatchResult(song, provider.key);
    } catch (err) {
      console.warn('[SourceSwitchSearch]', provider.key, err);
      matches[provider.key] = { song: null, issue: 'no_source' };
    }
  }));
  if (requestId !== controlSourceSwitcherState.requestId || !controlSourceSwitcherState.open) return;
  controlSourceSwitcherState.loading = false;
  renderControlSourceSwitcher(matches);
  controlSourceSwitcherState.matches = matches;
}
function toggleControlSourceSwitcher(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  var song = currentControlSong();
  if (!song || song.type === 'local' || song.source === 'local' || song.localUrl || song.type === 'podcast') {
    showToast('当前歌曲不支持切换音源');
    return;
  }
  var anchor = e && e.currentTarget ? e.currentTarget : null;
  var el = ensureControlSourceSwitcher();
  if (controlSourceSwitcherState.open && controlSourceSwitcherState.anchor === anchor) {
    closeControlSourceSwitcher();
    return;
  }
  controlSourceSwitcherState.open = true;
  controlSourceSwitcherState.loading = true;
  controlSourceSwitcherState.anchor = anchor;
  controlSourceSwitcherState.requestId++;
  controlSourceSwitcherState.matches = {};
  renderControlSourceSwitcher({ [songProviderKey(song)]: { song: song, issue: '' } });
  controlSourcePositionSwitcher(anchor);
  el.classList.add('show');
  loadControlSourceMatches(song, controlSourceSwitcherState.requestId);
}
async function switchCurrentSongSource(provider) {
  provider = normalizePlaybackProvider(provider);
  var song = currentControlSong();
  if (!song) return;
  var currentProvider = songProviderKey(song);
  var previousSong = cloneSong(song);
  if (provider === currentProvider) {
    closeControlSourceSwitcher();
    return;
  }
  var requestId = ++controlSourceSwitcherState.requestId;
  controlSourceSwitcherState.loading = true;
  renderControlSourceSwitcher(controlSourceSwitcherState.matches || {});
  try {
    var entry = controlSourceSwitcherState.matches && controlSourceSwitcherState.matches[provider];
    var match = controlSourceMatchSong(entry);
    var issue = controlSourceMatchIssue(entry);
    if (!match) {
      var lookup = await findControlSourceMatchResult(song, provider);
      match = lookup && lookup.song ? lookup.song : null;
      issue = lookup && lookup.issue ? lookup.issue : issue;
      if (controlSourceSwitcherState.matches) controlSourceSwitcherState.matches[provider] = lookup || { song: null, issue: issue || 'no_source' };
    }
    if (requestId !== controlSourceSwitcherState.requestId) return;
    if (!match) {
      showSourceFallbackNotice('未找到可切换音源', controlSourceProviderTitle(provider) + ' 暂时没有匹配到同名同歌手版本。');
      showSourceFallbackNotice('该平台无正版音源', controlSourceProviderTitle(provider) + ': ' + controlSourceIssueLabel(issue));
      controlSourceSwitcherState.loading = false;
      renderControlSourceSwitcher(controlSourceSwitcherState.matches || {});
      return;
    }
    match.manualSourceSwitchFrom = currentProvider;
    match.manualSourceSwitchAt = Date.now();
    playQueue[currentIdx] = hydrateCustomCover(match);
    closeControlSourceSwitcher();
    safeRenderQueuePanel('manual-source-switch', { scrollCurrent: miniQueueOpen });
    updateControlTrackInfo(playQueue[currentIdx]);
    showSourceFallbackNotice('正在切换音源', (song.name || '当前歌曲') + ' -> ' + controlSourceProviderTitle(provider));
    await playQueueAt(currentIdx, {
      manual: true,
      resumeAt: currentResumeSeconds(0),
      preserveHomeState: true,
      sourceSwitch: true
    });
  } catch (err) {
    console.warn('[SourceSwitch]', provider, err);
    if (currentIdx >= 0 && currentIdx < playQueue.length) {
      playQueue[currentIdx] = hydrateCustomCover(previousSong);
      safeRenderQueuePanel('manual-source-switch-restore', { scrollCurrent: miniQueueOpen });
      updateControlTrackInfo(playQueue[currentIdx]);
    }
    showSourceFallbackNotice('音源切换失败', '已保留当前播放队列，请稍后再试。');
  } finally {
    controlSourceSwitcherState.loading = false;
    forcePlaybackControlsInteractive();
  }
}
document.addEventListener('click', function (e) {
  var el = document.getElementById('control-source-switcher');
  if (!el || !controlSourceSwitcherState.open) return;
  if (el.contains(e.target)) return;
  if (controlSourceSwitcherState.anchor && controlSourceSwitcherState.anchor.contains && controlSourceSwitcherState.anchor.contains(e.target)) return;
  closeControlSourceSwitcher();
});
window.addEventListener('resize', function () {
  if (controlSourceSwitcherState.open) controlSourcePositionSwitcher();
});
function songRequiresVip(song) {
  song = song || {};
  if (song.fee === 1 || song.vip === true || song.isVip === true || song.isVIP === true) return true;
  if (song.vipRequired === true || song.needVip === true || song.need_vip === true || song.onlyVipPlayable === true || song.only_vip_playable === true) return true;
  if (song.trial === true || song.preview === true) return true;
  var labelInfo = song.label_info || song.labelInfo || {};
  if (labelInfo.only_vip_playable === true || labelInfo.onlyVipPlayable === true || labelInfo.vip === true) return true;
  var restriction = song.restriction || {};
  var text = [
    song.category,
    song.reason,
    song.error,
    song.message,
    restriction.category,
    restriction.reason,
    restriction.error,
    restriction.message,
  ].join(' ');
  return /vip_required|paid_required|trial_only|need_vip|only_vip|vip/i.test(text);
}
function songVipTagHtml(song) {
  return songRequiresVip(song) ? '<span class="tag-vip">VIP</span>' : '';
}
function searchResultMetaText(song) {
  var bits = [];
  if (song.artist) bits.push(song.artist);
  if (song.album) bits.push(song.album);
  if (songProviderKey(song) === 'qq' && !song.playable) bits.push('QQ 播放需会话/授权');
  if (songProviderKey(song) === 'kugou' && !song.playable) bits.push('酷狗播放需会话/授权');
  if (songProviderKey(song) === 'qishui' && !song.playable) bits.push('汽水匹配源，播放会自动换源');
  if (songProviderKey(song) === 'spotify' && !song.playable) bits.push('Spotify 匹配源，播放会自动换源');
  return bits.join('  ·  ') || songSourceLabel(song);
}
function searchResultMetaHtml(song, index) {
  song = song || {};
  var artist = String(song.artist || '').trim();
  var bits = [];
  if (song.album) bits.push(song.album);
  if (songProviderKey(song) === 'qq' && !song.playable) bits.push('QQ 播放需会话/授权');
  if (songProviderKey(song) === 'kugou' && !song.playable) bits.push('酷狗播放需会话/授权');
  if (songProviderKey(song) === 'qishui' && !song.playable) bits.push('汽水匹配源，播放会自动换源');
  if (songProviderKey(song) === 'spotify' && !song.playable) bits.push('Spotify 匹配源，播放会自动换源');
  var tail = bits.length ? (' · ' + escHtml(bits.join('  ·  '))) : '';
  if (!artist) return escHtml(searchResultMetaText(song));
  return '<button class="search-artist-link" type="button" onclick="event.stopPropagation();openSearchResultArtist(' + index + ')">' + escHtml(artist) + '</button>' + tail;
}
function openSearchResultArtist(index) {
  var song = playlist && playlist[index];
  if (!song) return;
  openArtistDetailForSong(song);
}
function searchIntentPrefersQQ(q) {
  q = String(q || '').toLowerCase();
  return /(^|\s)qq($|\s)|qq音乐|qq音樂/.test(q);
}
var MUSIC_SEARCH_PROVIDER_ORDER = ['netease', 'qq', 'kugou', 'qishui'];
function searchProviderStatus(provider) {
  if (typeof platformStatus === 'function') return platformStatus(provider);
  if (provider === 'spotify') return spotifyLoginStatus;
  if (provider === 'qishui') return qishuiLoginStatus;
  if (provider === 'kugou') return kugouLoginStatus;
  if (provider === 'qq') return qqLoginStatus;
  return loginStatus;
}
function searchProviderIsLoggedIn(provider) {
  var st = searchProviderStatus(provider);
  return !!(st && st.loggedIn);
}
function searchProviderCanSearch(provider) {
  var st = searchProviderStatus(provider) || {};
  var capabilities = st.capabilities || {};
  if (st.searchReady === true || st.publicCatalog === true || capabilities.search === true) return true;
  if (provider === 'spotify') return !!(st.loggedIn && !st.reauthRequired);
  // These providers expose public catalogue metadata search. Login still controls
  // private recommendations, collections and playback rights, not discovery.
  return provider === 'netease' || provider === 'qq' || provider === 'kugou' || provider === 'qishui';
}
function searchModeProvider(mode) {
  return mode === 'netease' || mode === 'qq' || mode === 'kugou' || mode === 'qishui' ? mode : '';
}
function activeSearchProvidersForMode(mode) {
  var specific = searchModeProvider(mode);
  if (specific) return searchProviderCanSearch(specific) ? [specific] : [];
  return MUSIC_SEARCH_PROVIDER_ORDER.filter(searchProviderCanSearch);
}
function searchProviderLoginNotice(mode) {
  var specific = searchModeProvider(mode);
  if (specific) {
    var meta = typeof platformMeta === 'function' ? platformMeta(specific) : { label: specific };
    return (meta.label || specific) + ' 搜索能力暂未就绪，请先完成该平台连接';
  }
  return '当前没有可用的音乐目录搜索源';
}
function searchProviderUrl(provider, q, limit, offset) {
  var suffix = '&limit=' + limit + '&offset=' + Math.max(0, Number(offset) || 0);
  if (provider === 'qq') return '/api/qq/search?keywords=' + encodeURIComponent(q) + suffix;
  if (provider === 'kugou') return '/api/kugou/search?keywords=' + encodeURIComponent(q) + suffix;
  if (provider === 'qishui') return '/api/qishui/search?keywords=' + encodeURIComponent(q) + suffix;
  if (provider === 'spotify') return '/api/spotify/search?keywords=' + encodeURIComponent(q) + suffix;
  return '/api/search?keywords=' + encodeURIComponent(q) + suffix;
}
function simpleSearchNorm(text) {
  return String(text || '').toLowerCase()
    .replace(/[（(【\[].*?[）)】\]]/g, '')
    .replace(/[\s·・,，。.!！?？'"“”‘’|\-_/]+/g, '');
}
function searchQueryTokens(text) {
  var source = String(text || '');
  var raw = source.normalize ? source.normalize('NFKC').toLowerCase() : source.toLowerCase();
  return raw.split(/[\s·・，。,.!?！？"“”‘’()（）【】\[\]\-_/]+/).map(function (token) {
    return simpleSearchNorm(token);
  }).filter(function (token, index, all) {
    if (!token || /^(qq|网易云|网易云音乐|酷狗|酷狗音乐|汽水|汽水音乐|spotify)$/.test(token)) return false;
    return all.indexOf(token) === index;
  });
}
function searchVersionSignature(text) {
  var source = String(text || '');
  var raw = source.normalize ? source.normalize('NFKC').toLowerCase() : source.toLowerCase();
  var signatures = [];
  [
    ['live', /\blive\b|现场|演唱会/],
    ['remix', /\bremix\b|\bmix\b|混音|重混|dj版|dj\s+version/],
    ['acoustic', /\bacoustic\b|不插电|木吉他版/],
    ['instrumental', /\binstrumental\b|伴奏|纯音乐/],
    ['cover', /\bcover\b|翻唱|致敬版/],
    ['demo', /\bdemo\b|试听版/],
    ['sped', /sped\s*up|加速版|变速版/],
    ['slowed', /slowed|慢速版/]
  ].forEach(function (entry) {
    if (entry[1].test(raw)) signatures.push(entry[0]);
  });
  return signatures.sort().join('+');
}
function searchTokenCoverage(tokens, song) {
  var name = simpleSearchNorm(song && song.name);
  var artist = simpleSearchNorm(song && song.artist);
  var album = simpleSearchNorm(song && song.album);
  var matched = 0;
  var titleMatched = 0;
  var artistMatched = 0;
  (tokens || []).forEach(function (token) {
    var hitTitle = !!(token && name.indexOf(token) >= 0);
    var hitArtist = !!(token && artist.indexOf(token) >= 0);
    var hitAlbum = !!(token && album.indexOf(token) >= 0);
    if (hitTitle || hitArtist || hitAlbum) matched++;
    if (hitTitle) titleMatched++;
    if (hitArtist) artistMatched++;
  });
  return { total: (tokens || []).length, matched: matched, titleMatched: titleMatched, artistMatched: artistMatched };
}
function searchMentionsKnownArtist(q, artist) {
  var rawQ = String(q || '').toLowerCase();
  var rawArtist = String(artist || '').toLowerCase();
  if (!rawArtist) return false;
  if (/周杰伦|周杰倫|jay\s*chou/.test(rawQ) && /周杰伦|周杰倫|jay\s*chou/.test(rawArtist)) return true;
  var nq = simpleSearchNorm(q);
  var na = simpleSearchNorm(artist);
  return !!(na && na.length >= 2 && nq.indexOf(na) >= 0);
}
function searchLooksLikeDerivative(text) {
  return /(翻唱|cover|伴奏|instrumental|remix|片段|demo|女声|男声|karaoke|完整版\s*cover|抖音版|dj版|合唱版|改编版|赵露思版|超燃|硬曲|剪辑|二创|氛围|浴室|节奏版|进行曲|加速版|慢速版|变速|串烧|tribute|made\s*famous\s*by)/i.test(String(text || ''));
}
var SOURCE_SWITCH_BLOCKED_ARTIST_TOKENS = ['asablue'];
var SOURCE_SWITCH_STRICT_ARTIST_ALIASES = [
  ['周杰伦', 'jaychou', 'zhoujielun']
];
function sourceSwitchArtistParts(song) {
  if (typeof artistNameParts === 'function') return artistNameParts(song);
  var parts = [];
  if (song && Array.isArray(song.artists)) {
    song.artists.forEach(function (a) { if (a && a.name) parts.push(a.name); });
  }
  if (song && song.artist) {
    String(song.artist).split(/\s*\/\s*|\s*,\s*|\s*&\s*| feat\.? | ft\.? /i).forEach(function (name) {
      if (name && name.trim()) parts.push(name.trim());
    });
  }
  return parts.map(simpleSearchNorm).filter(Boolean);
}
function sourceSwitchPartMatches(a, b) {
  return !!(a && b && (a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0));
}
function sourceSwitchPartsOverlap(sourceParts, candidateParts) {
  return sourceParts.some(function (sourcePart) {
    return candidateParts.some(function (candidatePart) { return sourceSwitchPartMatches(sourcePart, candidatePart); });
  });
}
function sourceSwitchSongHasBlockedArtist(song) {
  var raw = String(((song && song.name) || '') + ' ' + ((song && song.artist) || '') + ' ' + ((song && song.album) || '')).toLowerCase();
  var norm = simpleSearchNorm(raw);
  return SOURCE_SWITCH_BLOCKED_ARTIST_TOKENS.some(function (token) {
    return raw.indexOf(token) >= 0 || norm.indexOf(simpleSearchNorm(token)) >= 0;
  });
}
function sourceSwitchStrictArtistRuleForSong(song) {
  var joined = sourceSwitchArtistParts(song).join('|');
  if (!joined) return null;
  for (var i = 0; i < SOURCE_SWITCH_STRICT_ARTIST_ALIASES.length; i++) {
    var aliases = SOURCE_SWITCH_STRICT_ARTIST_ALIASES[i];
    if (aliases.some(function (alias) { return joined.indexOf(simpleSearchNorm(alias)) >= 0; })) return aliases;
  }
  return null;
}
function sourceSwitchCandidateHasUnexpectedArtist(sourceParts, candidateParts) {
  if (!sourceParts.length || !candidateParts.length) return false;
  return candidateParts.some(function (candidatePart) {
    return !sourceParts.some(function (sourcePart) { return sourceSwitchPartMatches(sourcePart, candidatePart); });
  });
}
function sourceCandidateRejectReason(source, candidate, provider) {
  if (!source || !candidate) return 'no_source';
  var sourceTitle = simpleSearchNorm(source.name || source.title || '');
  var candidateTitle = simpleSearchNorm(candidate.name || candidate.title || '');
  if (!sourceTitle || !candidateTitle || sourceTitle !== candidateTitle) return 'title_mismatch';
  if (sourceSwitchSongHasBlockedArtist(candidate)) return 'blocked_artist';
  var raw = String(((candidate && candidate.name) || '') + ' ' + ((candidate && candidate.artist) || '') + ' ' + ((candidate && candidate.album) || '')).toLowerCase();
  if (searchLooksLikeDerivative(raw)) return 'derivative';
  var sourceParts = sourceSwitchArtistParts(source);
  var candidateParts = sourceSwitchArtistParts(candidate);
  if (!sourceParts.length || !candidateParts.length || !sourceSwitchPartsOverlap(sourceParts, candidateParts)) return 'artist_mismatch';
  if (sourceSwitchStrictArtistRuleForSong(source) && sourceSwitchCandidateHasUnexpectedArtist(sourceParts, candidateParts)) return 'artist_extra';
  return '';
}
function controlSourceIssueLabel(issue) {
  if (issue === 'blocked_artist' || issue === 'derivative') return '翻唱禁用';
  if (issue === 'artist_mismatch' || issue === 'artist_extra') return '非原唱版本';
  return '无正版音源';
}
var SEARCH_ORIGINAL_ARTIST_HINTS = [
  { titles: ['日落大道'], artists: ['梁博'] },
  { titles: ['beautyandabeat', 'beauty and a beat'], artists: ['justin bieber', 'nicki minaj'] }
];
function canonicalOriginalArtistsForSearch(q, song) {
  var qNorm = simpleSearchNorm(q);
  var titleNorm = simpleSearchNorm(song && song.name);
  var joined = qNorm + ' ' + titleNorm;
  var artists = [];
  SEARCH_ORIGINAL_ARTIST_HINTS.forEach(function (rule) {
    var matched = (rule.titles || []).some(function (title) {
      var nt = simpleSearchNorm(title);
      var titleMatches = !!(titleNorm && (titleNorm === nt || titleNorm.indexOf(nt) >= 0));
      return !!(nt && (qNorm.indexOf(nt) >= 0 || titleMatches));
    });
    if (matched) {
      (rule.artists || []).forEach(function (artist) {
        if (artists.indexOf(artist) < 0) artists.push(artist);
      });
    }
  });
  return artists;
}
function songArtistMatchesAny(song, artists) {
  var songArtist = simpleSearchNorm(song && song.artist);
  if (!songArtist || !artists || !artists.length) return false;
  return artists.some(function (artist) {
    var na = simpleSearchNorm(artist);
    return !!(na && (songArtist.indexOf(na) >= 0 || na.indexOf(songArtist) >= 0));
  });
}
function searchLooksLikeSameTitleCover(song, nq, name, album, raw, originalArtistMatch, sourceIndex) {
  if (!song || !nq || !name || originalArtistMatch) return false;
  var sameTitle = name === nq || nq.indexOf(name) >= 0 || name.indexOf(nq) === 0;
  if (!sameTitle) return false;
  var selfTitledSingle = !!(album && (album === name || album === nq || album.indexOf(name) >= 0 || name.indexOf(album) >= 0));
  return selfTitledSingle || searchLooksLikeDerivative(raw) || (sourceIndex || 0) > 0;
}
function searchPopularityScore(song, sourceIndex) {
  var hot = Number(song && (song.popularity || song.hot || song.heat || song.hotScore || song.score || song.playCount || song.playcount || song.listenCount || song.rankScore || 0));
  var score = 0;
  if (isFinite(hot) && hot > 0) {
    score += hot <= 100 ? Math.min(12, hot / 8) : Math.min(14, Math.log(hot + 1) * 1.2);
  }
  // Every provider maps a missing rank differently (often to zero), so the
  // actual response position is the only comparable, stable tie-breaker.
  score += Math.max(0, 12 - Math.max(0, Number(sourceIndex) || 0) * 0.55);
  return score;
}
function searchCanonicalSongKey(song) {
  var title = simpleSearchNorm(song && song.name);
  var artists = sourceSwitchArtistParts(song).slice(0, 3).sort();
  if (!title || !artists.length) return '';
  var version = searchVersionSignature(((song && song.name) || '') + ' ' + ((song && song.album) || '')) || 'studio';
  return title + '|' + artists.join('/') + '|' + version;
}
function scoreSongSearchResult(song, q, sourceIndex) {
  var nq = simpleSearchNorm(q);
  var name = simpleSearchNorm(song && song.name);
  var artist = simpleSearchNorm(song && song.artist);
  var album = simpleSearchNorm(song && song.album);
  var raw = String(((song && song.name) || '') + ' ' + ((song && song.artist) || '') + ' ' + ((song && song.album) || '')).toLowerCase();
  var tokens = searchQueryTokens(q);
  var coverage = searchTokenCoverage(tokens, song);
  var queryVersion = searchVersionSignature(q);
  var songVersion = searchVersionSignature(raw);
  var artistMentioned = searchMentionsKnownArtist(q, song && song.artist);
  var score = 0;
  if (name === nq) score += 170;
  else if (name && nq && nq.indexOf(name) >= 0) score += 112;
  else if (name && nq && name.indexOf(nq) === 0) score += 82;
  else if (name && nq && name.indexOf(nq) >= 0) score += 58;
  if (artistMentioned || (artist && nq && nq.indexOf(artist) >= 0)) score += 88;
  else if (artist && nq && artist.indexOf(nq) >= 0) score += 32;
  if (album && nq && (album === nq || nq.indexOf(album) >= 0)) score += 12;
  if (coverage.total) {
    score += coverage.titleMatched * 34 + coverage.artistMatched * 26;
    if (coverage.matched === coverage.total) score += 54;
    else score -= (coverage.total - coverage.matched) * 46;
  }
  if (queryVersion) {
    score += songVersion === queryVersion ? 64 : -72;
  } else if (songVersion) {
    score -= 46;
  } else if (searchLooksLikeDerivative(raw)) {
    score -= 34;
  }
  score += searchPopularityScore(song, sourceIndex);
  if (song && song.playable === false) score -= 6;
  return score;
}
function mergeSongSearchResults(neteaseSongs, qqSongs, kugouSongs, qishuiSongs, spotifySongs, limit, q) {
  var out = [];
  var providerSeen = {};
  var canonicalSeen = {};
  function push(song, sourceIndex) {
    if (!song || !song.name) return;
    var key = songProviderKey(song) + ':' + (song.mid || song.id || (song.name + '|' + song.artist));
    if (providerSeen[key]) return;
    providerSeen[key] = true;
    song._searchScore = scoreSongSearchResult(song, q, sourceIndex);
    var canonicalKey = searchCanonicalSongKey(song);
    if (canonicalKey && canonicalSeen[canonicalKey] != null) {
      var existingIndex = canonicalSeen[canonicalKey];
      if ((song._searchScore || 0) > (out[existingIndex]._searchScore || 0)) out[existingIndex] = song;
      return;
    }
    if (canonicalKey) canonicalSeen[canonicalKey] = out.length;
    out.push(song);
  }
  (neteaseSongs || []).forEach(function (song, i) { push(song, i); });
  (qqSongs || []).forEach(function (song, i) { push(song, i); });
  (kugouSongs || []).forEach(function (song, i) { push(song, i); });
  (qishuiSongs || []).forEach(function (song, i) { push(song, i); });
  (spotifySongs || []).forEach(function (song, i) { push(song, i); });
  out.sort(function (a, b) { return (b._searchScore || 0) - (a._searchScore || 0); });
  return out.slice(0, limit);
}
function searchProviderPagesHaveMore(providerPages) {
  return Object.keys(providerPages || {}).some(function (provider) {
    return !!(providerPages[provider] && providerPages[provider].hasMore);
  });
}
function mergeUniqueSearchSongPools(existing, incoming) {
  var out = [];
  var providerSeen = {};
  var canonicalSeen = {};
  function push(song) {
    if (!song || !song.name || out.length >= MUSIC_SEARCH_MAX_RESULTS) return;
    var providerKey = songProviderKey(song) + ':' + (song.mid || song.id || (song.name + '|' + song.artist));
    var canonicalKey = searchCanonicalSongKey(song);
    if (providerSeen[providerKey] || (canonicalKey && canonicalSeen[canonicalKey])) return;
    providerSeen[providerKey] = true;
    if (canonicalKey) canonicalSeen[canonicalKey] = true;
    out.push(song);
  }
  (existing || []).forEach(push);
  (incoming || []).forEach(push);
  return out;
}
async function fetchMusicSearchResults(q, mode, previousPages) {
  searchProviderNotice = '';
  var providers = activeSearchProvidersForMode(mode);
  if (!providers.length) {
    searchProviderNotice = searchProviderLoginNotice(mode);
    return { songs: [], providerPages: {}, hasMore: false };
  }
  previousPages = previousPages && typeof previousPages === 'object' ? previousPages : null;
  var providerPages = {};
  Object.keys(previousPages || {}).forEach(function (provider) {
    providerPages[provider] = Object.assign({}, previousPages[provider]);
  });
  var pageLimitByProvider = { netease: 18, qq: 12, kugou: 12, qishui: 12, spotify: 10 };
  var fetchProviders = providers.filter(function (provider) {
    return !previousPages || !previousPages[provider] || previousPages[provider].hasMore;
  });
  var result = await Promise.allSettled(fetchProviders.map(function (provider) {
    var previous = previousPages && previousPages[provider];
    var offset = previous ? Math.max(0, Number(previous.nextOffset) || 0) : 0;
    var limit = pageLimitByProvider[provider] || 12;
    return apiJson(searchProviderUrl(provider, q, limit, offset)).then(function (value) {
      return { provider: provider, offset: offset, requestedLimit: limit, value: value || {} };
    });
  }));
  var songsByProvider = { netease: [], qq: [], kugou: [], qishui: [], spotify: [] };
  fetchProviders.forEach(function (provider, index) {
    var entry = result[index];
    if (!entry || entry.status !== 'fulfilled') {
      console.warn(controlSourceProviderTitle(provider) + ' search failed:', entry && entry.reason);
      providerPages[provider] = Object.assign({}, providerPages[provider] || {}, { hasMore: false, failed: true });
      return;
    }
    var response = entry.value || {};
    var value = response.value || {};
    var songs = Array.isArray(value.songs) ? value.songs : [];
    var offset = response.offset;
    var requestedLimit = response.requestedLimit;
    var nextOffset = Number(value.nextOffset);
    if (!isFinite(nextOffset) || nextOffset <= offset) nextOffset = offset + songs.length;
    var hasMore = value.hasMore === true;
    if (value.hasMore == null) hasMore = songs.length >= requestedLimit;
    if (!songs.length || nextOffset <= offset) hasMore = false;
    providerPages[provider] = {
      offset: offset,
      limit: Number(value.limit) || requestedLimit,
      nextOffset: nextOffset,
      hasMore: hasMore,
      total: Number(value.total) || 0,
      failed: false
    };
    songsByProvider[provider] = songs;
    if (value.message && !songs.length && !searchProviderNotice) searchProviderNotice = value.message;
  });
  var songs = mergeSongSearchResults(
    songsByProvider.netease,
    songsByProvider.qq,
    songsByProvider.kugou,
    songsByProvider.qishui,
    songsByProvider.spotify,
    MUSIC_SEARCH_MAX_RESULTS,
    q
  );
  return { songs: songs, providerPages: providerPages, hasMore: searchProviderPagesHaveMore(providerPages) };
}
function searchSongResultHtml(s, i) {
    var vipTag = songVipTagHtml(s);
    var sourceTag = songSourceTagHtml(s);
    var sourceClass = songProviderKey(s) + '-source';
    var thumb = songCoverSrc(s, 80);
    var imgTag = thumb
      ? '<img src="' + thumb + '" alt="" loading="lazy" onerror="this.style.opacity=0.2">'
      : '<div style="width:40px;height:40px;border-radius:6px;background:rgba(255,255,255,0.06);flex-shrink:0"></div>';
    return '<div class="search-result ' + sourceClass + '">' +
      '<div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0" onclick="playSearchResult(' + i + ')">' +
      imgTag +
      '<div class="search-result-info">' +
      '<div class="search-result-title">' + escHtml(s.name) + sourceTag + vipTag + '</div>' +
      '<div class="search-result-meta">' + searchResultMetaHtml(s, i) + '</div>' +
      '</div>' +
      '</div>' +
      '<button class="song-action-btn' + (isSongLiked(s) ? ' liked' : '') + '" data-like-index="' + i + '" title="' + (isSongLiked(s) ? '取消红心' : '红心喜欢') + '" onclick="event.stopPropagation();toggleLikeSearchResult(' + i + ')">' + heartIconSvg() + '</button>' +
      '<button class="song-action-btn" title="收藏到歌单" onclick="event.stopPropagation();collectSearchResult(' + i + ')">' + playlistPlusIconSvg() + '</button>' +
      '<button class="add-btn" title="下一首播放" onclick="event.stopPropagation();queueSearchResult(' + i + ')">+</button>' +
      '</div>';
}
function searchLoadMoreSentinelHtml() {
  var remaining = Math.max(0, searchMusicRenderState.songs.length - searchMusicRenderState.visibleCount);
  if (!remaining && !searchMusicRenderState.remoteHasMore && !searchMusicRenderState.loadingMore) return '';
  var label = searchMusicRenderState.loadingMore
    ? '正在加载更多歌曲…'
    : (remaining ? ('继续滚动加载 · 当前还有 ' + remaining + ' 首') : '继续滚动加载更多歌曲');
  return '<div class="search-empty search-load-more" data-search-load-more="1" role="status">' + label + '</div>';
}
function refreshSearchLoadMoreSentinel() {
  disconnectSearchLoadMoreObserver();
  var sentinel = $results && $results.querySelector('[data-search-load-more]');
  if (sentinel) sentinel.remove();
  var html = searchLoadMoreSentinelHtml();
  if (html && $results) $results.insertAdjacentHTML('beforeend', html);
  observeSearchLoadMoreSentinel();
}
function observeSearchLoadMoreSentinel() {
  disconnectSearchLoadMoreObserver();
  var sentinel = $results && $results.querySelector('[data-search-load-more]');
  if (!sentinel || !window.IntersectionObserver) return;
  var expectedKey = searchMusicRenderState.key;
  searchLoadMoreObserver = new IntersectionObserver(function (entries) {
    if (entries.some(function (entry) { return entry.isIntersecting; })) appendNextSearchResults(expectedKey);
  }, { root: $results, rootMargin: '0px 0px 96px 0px', threshold: 0.01 });
  searchLoadMoreObserver.observe(sentinel);
}
async function loadNextMusicSearchPage(expectedKey) {
  if (!expectedKey || expectedKey !== searchMusicRenderState.key || expectedKey !== searchLastResultQuery) return false;
  if (searchMusicRenderState.loadingMore || !searchMusicRenderState.remoteHasMore) return false;
  if (searchMusicRenderState.songs.length >= MUSIC_SEARCH_MAX_RESULTS) {
    searchMusicRenderState.remoteHasMore = false;
    refreshSearchLoadMoreSentinel();
    return false;
  }
  searchMusicRenderState.loadingMore = true;
  refreshSearchLoadMoreSentinel();
  var requestSeq = searchRequestSeq;
  var q = searchMusicRenderState.query;
  var mode = searchMusicRenderState.mode;
  try {
    var page = await fetchMusicSearchResults(q, mode, searchMusicRenderState.providerPages);
    if (requestSeq !== searchRequestSeq || expectedKey !== searchMusicRenderState.key || expectedKey !== searchLastResultQuery || searchMode !== mode || $input.value.trim() !== q) return false;
    var before = searchMusicRenderState.songs.length;
    var merged = mergeUniqueSearchSongPools(searchMusicRenderState.songs, page.songs || []);
    searchMusicRenderState.providerPages = page.providerPages || {};
    searchMusicRenderState.songs = merged;
    playlist = merged;
    searchMusicRenderState.remoteHasMore = !!page.hasMore && merged.length < MUSIC_SEARCH_MAX_RESULTS;
    if (merged.length === before) searchMusicRenderState.remoteHasMore = false;
    searchMusicRenderState.loadingMore = false;
    if (merged.length > before) return appendNextSearchResults(expectedKey);
    refreshSearchLoadMoreSentinel();
    return false;
  } catch (err) {
    console.warn('[SearchLoadMore]', err);
    if (expectedKey === searchMusicRenderState.key) {
      searchMusicRenderState.loadingMore = false;
      searchMusicRenderState.remoteHasMore = false;
      refreshSearchLoadMoreSentinel();
    }
    return false;
  }
}
function appendNextSearchResults(expectedKey) {
  expectedKey = expectedKey || searchMusicRenderState.key;
  if (!expectedKey || expectedKey !== searchMusicRenderState.key || expectedKey !== searchLastResultQuery) return false;
  if (searchMusicRenderState.appending || searchMusicRenderState.loadingMore) return false;
  if (searchMusicRenderState.visibleCount >= searchMusicRenderState.songs.length) {
    if (searchMusicRenderState.remoteHasMore) {
      loadNextMusicSearchPage(expectedKey);
      return true;
    }
    refreshSearchLoadMoreSentinel();
    return false;
  }
  searchMusicRenderState.appending = true;
  disconnectSearchLoadMoreObserver();
  requestAnimationFrame(function () {
    if (expectedKey !== searchMusicRenderState.key || expectedKey !== searchLastResultQuery) {
      searchMusicRenderState.appending = false;
      return;
    }
    var start = searchMusicRenderState.visibleCount;
    var end = Math.min(searchMusicRenderState.songs.length, start + MUSIC_SEARCH_APPEND_BATCH);
    var html = '';
    for (var i = start; i < end; i++) html += searchSongResultHtml(searchMusicRenderState.songs[i], i);
    searchMusicRenderState.visibleCount = end;
    var sentinel = $results.querySelector('[data-search-load-more]');
    if (sentinel) sentinel.insertAdjacentHTML('beforebegin', html);
    else $results.insertAdjacentHTML('beforeend', html);
    syncLikeStatusForSongs(searchMusicRenderState.songs.slice(start, end));
    searchMusicRenderState.appending = false;
    refreshSearchLoadMoreSentinel();
  });
  return true;
}
function renderSongSearchResults(songs) {
  setSearchHistorySurface(false);
  var plan = pendingSearchProviderPages || {};
  resetSearchMusicRenderState();
  playlist = Array.isArray(songs) ? songs : [];
  searchMusicRenderState.key = plan.key || searchLastResultQuery || searchResultKey($input && $input.value, searchMode);
  searchMusicRenderState.query = plan.query || String($input && $input.value || '').trim();
  searchMusicRenderState.mode = plan.mode || searchMode;
  searchMusicRenderState.providerPages = plan.providerPages || {};
  searchMusicRenderState.remoteHasMore = !!plan.hasMore;
  searchMusicRenderState.songs = playlist;
  searchMusicRenderState.visibleCount = Math.min(playlist.length, MUSIC_SEARCH_INITIAL_VISIBLE);
  var html = '';
  for (var i = 0; i < searchMusicRenderState.visibleCount; i++) html += searchSongResultHtml(playlist[i], i);
  $results.innerHTML = html + searchLoadMoreSentinelHtml();
  $results.classList.add('show');
  syncLikeStatusForSongs(playlist.slice(0, searchMusicRenderState.visibleCount));
  if (window.gsap) animateListItems($results, '.search-result', { x: 0, y: 6, stagger: 0.012, duration: 0.18, limit: 18 });
  observeSearchLoadMoreSentinel();
}

async function doSearch(q, opts) {
  opts = opts || {};
  q = String(q || '').trim();
  if (!q) {
    if (!renderSearchHistory() && searchMode === 'podcast') loadPodcastHot();
    return;
  }
  if (searchMode === 'podcast') {
    doPodcastSearch(q);
    return;
  }
  var requestSeq = ++searchRequestSeq;
  disconnectSearchLoadMoreObserver();
  setSearchHistorySurface(false);
  try {
    var mode = searchMode;
    var searchData = await fetchMusicSearchResults(q, mode);
    var songs = searchData && Array.isArray(searchData.songs) ? searchData.songs : [];
    if (requestSeq !== searchRequestSeq || searchMode !== mode || $input.value.trim() !== q) return;
    if (!songs.length) {
      resetSearchMusicRenderState();
      playlist = [];
      searchLastResultQuery = '';
      $results.innerHTML = '<div class="search-empty">' + escHtml(searchProviderNotice || '没有找到相关歌曲') + '</div>';
      $results.classList.add('show');
      return;
    }
    searchLastResultQuery = searchResultKey(q, mode);
    rememberSearchQuery(q);
    pendingSearchProviderPages = {
      key: searchLastResultQuery,
      query: q,
      mode: mode,
      providerPages: searchData.providerPages || {},
      hasMore: !!searchData.hasMore
    };
    renderSongSearchResults(songs);
    if (opts.autoPlayFirst) playSearchResult(0);
  } catch (err) {
    console.error('Search:', err);
    if (requestSeq === searchRequestSeq) {
      resetSearchMusicRenderState();
      playlist = [];
      searchLastResultQuery = '';
      $results.innerHTML = '<div class="search-empty">搜索暂时失败，请稍后重试</div>';
      $results.classList.add('show');
    }
  }
}

// ============================================================
//  音频上下文 & 频谱分析
