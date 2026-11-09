var playlistPanelDetailState = { key: '', loading: false, loadingMore: false, playlist: null, tracks: [], token: 0, total: 0, nextOffset: 0, hasMore: false, scrollTop: 0, controller: null, warmTimer: 0, renderLimit: PLAYLIST_DETAIL_INITIAL_RENDER, error: '', message: '' };
function queueVirtualSpacerHtml(height) {
  height = Math.max(0, Math.round(Number(height) || 0));
  return height ? '<div class="queue-virtual-spacer" aria-hidden="true" style="height:' + height + 'px"></div>' : '';
}
function queuePanelVirtualWindow(list, scroller, total, selfScroll, forceIndex) {
  total = Math.max(0, Number(total) || 0);
  if (!total) return { start: 0, end: 0, top: 0, bottom: 0 };
  var rowStep = QUEUE_VIRTUAL_ROW_STEP;
  var viewport = Math.max(rowStep * 4, Number(scroller && scroller.clientHeight) || rowStep * 9);
  var visibleRows = Math.max(4, Math.ceil(viewport / rowStep));
  var start = 0;
  if (forceIndex != null && forceIndex >= 0 && forceIndex < total) {
    start = Math.max(0, Math.floor(forceIndex - visibleRows * 0.42) - QUEUE_VIRTUAL_OVERSCAN);
  } else if (selfScroll) {
    start = Math.max(0, Math.floor((Number(scroller && scroller.scrollTop) || 0) / rowStep) - QUEUE_VIRTUAL_OVERSCAN);
  } else if (list && scroller && list.getBoundingClientRect && scroller.getBoundingClientRect) {
    var listRect = list.getBoundingClientRect();
    var scrollerRect = scroller.getBoundingClientRect();
    var visibleTop = Math.max(0, scrollerRect.top - listRect.top);
    start = Math.max(0, Math.floor(visibleTop / rowStep) - QUEUE_VIRTUAL_OVERSCAN);
  }
  var maxRows = visibleRows + QUEUE_VIRTUAL_OVERSCAN * 2;
  var end = Math.min(total, start + maxRows);
  start = Math.max(0, Math.min(start, Math.max(0, total - maxRows)));
  end = Math.min(total, Math.max(end, start + maxRows));
  return { start: start, end: end, top: start * rowStep, bottom: Math.max(0, total - end) * rowStep };
}
function scheduleQueuePanelVirtualRender() {
  if (queuePanelVirtualState.raf) return;
  queuePanelVirtualState.raf = requestAnimationFrame(function () {
    queuePanelVirtualState.raf = 0;
    if (miniQueueOpen) renderMiniQueuePanel({ animate: false, scrollCurrent: false });
    if (queueViewTab === 'queue' && isPlaylistPanelVisibleForRender()) {
      renderQueuePanel({ animate: false, scrollCurrent: false });
    }
  });
}
function maybeRequestPlaylistQueuePageFromScroller(scroller) {
  if (!scroller || typeof requestPlaylistQueueHydrationForBrowse !== 'function') return false;
  if (scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - QUEUE_VIRTUAL_ROW_STEP * 6) return false;
  return requestPlaylistQueueHydrationForBrowse();
}
function queuePanelItemKey(song, fallback) {
  try {
    if (typeof queueItemKey === 'function') return queueItemKey(song) || fallback;
  } catch (e) { }
  return song && (song.id || song.mid || song.localKey || song.name) || fallback;
}
function queuePanelListKey() {
  var total = playQueue && playQueue.length || 0;
  if (!total) return '0';
  return [
    total,
    queuePanelItemKey(playQueue[0], 'first'),
    queuePanelItemKey(playQueue[Math.max(0, total - 1)], 'last')
  ].join('|');
}
function resetQueuePanelRenderLimit() {
  queuePanelRenderLimit = QUEUE_PANEL_BATCH_SIZE;
  queuePanelRenderKey = queuePanelListKey();
}
function queuePanelVisibleLimit(total) {
  total = Math.max(0, Number(total) || 0);
  if (!total) {
    queuePanelRenderLimit = QUEUE_PANEL_BATCH_SIZE;
    queuePanelRenderKey = '0';
    return 0;
  }
  var key = queuePanelListKey();
  if (key !== queuePanelRenderKey) {
    queuePanelRenderKey = key;
    queuePanelRenderLimit = QUEUE_PANEL_BATCH_SIZE;
  }
  var base = Math.max(QUEUE_PANEL_BATCH_SIZE, queuePanelRenderLimit || QUEUE_PANEL_BATCH_SIZE);
  if (currentIdx >= 0 && currentIdx < total) {
    base = Math.max(base, Math.ceil((currentIdx + 1) / QUEUE_PANEL_BATCH_SIZE) * QUEUE_PANEL_BATCH_SIZE);
  }
  queuePanelRenderLimit = Math.min(total, base);
  return queuePanelRenderLimit;
}
function growQueuePanelRenderLimit(amount) {
  if (!playQueue.length) return false;
  var total = playQueue.length;
  var current = queuePanelVisibleLimit(total);
  var next = Math.min(total, current + (amount || QUEUE_PANEL_BATCH_SIZE));
  if (next <= current) return false;
  var panel = document.getElementById('playlist-panel');
  var keepTop = panel ? panel.scrollTop : 0;
  var miniList = document.getElementById('mini-queue-list');
  var keepMiniTop = miniList ? miniList.scrollTop : 0;
  queuePanelRenderLimit = next;
  renderQueuePanel({ animate: true, scrollCurrent: false });
  if (panel) panel.scrollTop = keepTop;
  if (miniList) {
    miniList = document.getElementById('mini-queue-list');
    if (miniList) miniList.scrollTop = keepMiniTop;
  }
  return true;
}
function maybeGrowQueuePanelRenderLimit() {
  var panel = document.getElementById('playlist-panel');
  if (!panel || queueViewTab !== 'queue' || !playQueue.length) return;
  if (queuePanelVisibleLimit(playQueue.length) >= playQueue.length) return;
  if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 220) growQueuePanelRenderLimit();
}
function bindMiniQueueLazyRender() {
  var list = document.getElementById('mini-queue-list');
  if (!list || miniQueueLazyBound) return;
  miniQueueLazyBound = true;
  list.addEventListener('scroll', function () {
    if (!miniQueueOpen) return;
    scheduleQueuePanelVirtualRender();
    maybeRequestPlaylistQueuePageFromScroller(list);
  }, { passive: true });
}
function normalizePlaylistProvider(provider) {
  if (provider === 'mineradio') return 'mineradio';
  if (provider === 'qq' || provider === 'kugou' || provider === 'qishui' || provider === 'spotify') return provider;
  return 'netease';
}
function playlistProviderLabel(provider) {
  provider = normalizePlaylistProvider(provider);
  if (provider === 'mineradio') return 'MR';
  return provider === 'qq' ? 'QQ' : (provider === 'kugou' ? 'KG' : (provider === 'qishui' ? 'QS' : (provider === 'spotify' ? 'SP' : 'NE')));
}
function playlistProviderName(provider) {
  provider = normalizePlaylistProvider(provider);
  if (provider === 'mineradio') return 'Mineradio 内置歌单';
  if (provider === 'spotify') return 'Spotify';
  return provider === 'qq' ? 'QQ 音乐' : (provider === 'kugou' ? '酷狗音乐' : (provider === 'qishui' ? '汽水音乐' : '网易云音乐'));
}
function playlistPanelKey(provider, id) {
  provider = normalizePlaylistProvider(provider);
  return provider + ':' + String(id || '');
}
function playlistPanelProviderId(provider, id) {
  provider = normalizePlaylistProvider(provider);
  if (provider === 'mineradio') return 'mineradio:' + id;
  if (provider === 'qq') return 'qq:' + id;
  if (provider === 'kugou') return 'kugou:' + id;
  if (provider === 'qishui') return 'qishui:' + id;
  if (provider === 'spotify') return 'spotify:' + id;
  return id;
}
function playlistCardPriority(pl) {
  if (!pl) return 10;
  if (pl.virtual || String(pl.id || '') === 'spotify-liked' || Number(pl.specialType || 0) === 5) return 0;
  return 1;
}
function prioritizePlaylistGroupItems(items) {
  return (items || []).map(function (pl, idx) {
    return { pl: pl, idx: idx, priority: playlistCardPriority(pl) };
  }).sort(function (a, b) {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.idx - b.idx;
  }).map(function (entry) { return entry.pl; });
}
function playlistPanelNoticeHtml(text, isError) {
  text = String(text || '').trim();
  if (!text) text = '歌单暂无可播放歌曲';
  return '<div style="text-align:center;padding:14px 10px;color:' + (isError ? 'rgba(255,180,160,.82)' : 'rgba(255,255,255,.30)') + ';font-size:11.5px;line-height:1.55">' + escHtml(text) + '</div>';
}
function playlistPanelDetailRowsHtml(options) {
  options = options || {};
  var st = playlistPanelDetailState;
  var tracks = st.tracks || [];
  if (st.loading && !tracks.length) {
    return '<div class="pl-detail-row pl-detail-loading-row"><span class="queue-hydration-spinner spinning"></span><div style="flex:1;min-width:0"><div class="pl-detail-row-title">正在载入首批歌曲</div><div class="pl-detail-row-artist">首批完成后即可浏览和播放</div></div></div>';
  }
  if (!tracks.length) return playlistPanelNoticeHtml(st.message || st.error || '', !!st.error);
  var viewport = Math.max(280, Number(options.viewport) || Math.min(620, Math.round((window.innerHeight || 800) * 0.72)));
  var localScrollTop = Math.max(0, Number(options.scrollTop) || 0);
  var start = Math.max(0, Math.floor(localScrollTop / PLAYLIST_DETAIL_ROW_STEP) - PLAYLIST_DETAIL_VIRTUAL_OVERSCAN);
  var maxRows = Math.ceil(viewport / PLAYLIST_DETAIL_ROW_STEP) + PLAYLIST_DETAIL_VIRTUAL_OVERSCAN * 2;
  var end = Math.min(tracks.length, start + maxRows);
  start = Math.max(0, Math.min(start, Math.max(0, tracks.length - maxRows)));
  end = Math.min(tracks.length, Math.max(end, start + maxRows));
  var rows = '<div class="pl-detail-virtual-spacer" aria-hidden="true" style="height:' + (start * PLAYLIST_DETAIL_ROW_STEP) + 'px"></div>';
  rows += tracks.slice(start, end).map(function (song, localIndex) {
    var i = start + localIndex;
    var thumb = songCoverSrc(song, 60);
    var imgTag = thumb ? '<img src="' + escHtml(thumb) + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div style="width:34px;height:34px;border-radius:7px;background:rgba(255,255,255,.06);flex:0 0 auto"></div>';
    var removeButton = normalizePlaylistProvider((st.key || '').split(':')[0]) === 'mineradio'
      ? '<button type="button" class="pl-detail-remove" data-pl-detail-remove="' + i + '" title="从内置歌单移除" aria-label="从内置歌单移除">×</button>'
      : '';
    return '<div class="pl-detail-row" data-pl-detail-row="' + i + '">' +
      imgTag +
      '<div style="flex:1;min-width:0"><div class="pl-detail-row-title">' + escHtml(song.name || '') + '</div>' +
      '<button type="button" class="pl-detail-row-artist" data-pl-detail-artist="' + i + '">' + escHtml(song.artist || '未知歌手') + '</button></div>' + removeButton +
      '</div>';
  }).join('');
  rows += '<div class="pl-detail-virtual-spacer" aria-hidden="true" style="height:' + (Math.max(0, tracks.length - end) * PLAYLIST_DETAIL_ROW_STEP) + 'px"></div>';
  if (st.error) {
    rows += '<div class="pl-detail-progress">后续歌曲载入失败，重新打开歌单可继续</div>';
  } else if (st.hasMore || st.loadingMore) {
    rows += '<div class="pl-detail-progress"><span class="queue-hydration-spinner' + (st.loadingMore ? ' spinning' : '') + '"></span><span>' +
      (st.loadingMore ? '正在预载后续歌曲 ' : '继续滚动加载 ') + tracks.length + (st.total ? '/' + st.total : '') + '</span></div>';
  } else if (tracks.length > PLAYLIST_DETAIL_INITIAL_RENDER) {
    rows += '<div class="pl-detail-progress">已加载全部 ' + tracks.length + ' 首</div>';
  }
  return rows;
}
var PLAYLIST_REORDER_STORE_KEY = 'mineradio-playlist-reorder-v1';
function playlistReorderKey(pl) {
  if (!pl) return '';
  return playlistPanelKey(normalizePlaylistProvider(pl.provider), pl.id);
}
function readPlaylistReorderKeys() {
  try {
    var raw = localStorage.getItem(PLAYLIST_REORDER_STORE_KEY);
    var keys = raw ? JSON.parse(raw) : [];
    return Array.isArray(keys) ? keys.filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}
function savePlaylistReorderKeys() {
  try {
    localStorage.setItem(PLAYLIST_REORDER_STORE_KEY, JSON.stringify(userPlaylists.map(playlistReorderKey).filter(Boolean)));
  } catch (e) { }
}
function applyUserPlaylistOrder() {
  if (!userPlaylists || !userPlaylists.length) return false;
  var keys = readPlaylistReorderKeys();
  if (!keys.length) return false;
  var rank = {};
  keys.forEach(function (key, idx) {
    if (rank[key] == null) rank[key] = idx;
  });
  userPlaylists = userPlaylists.map(function (pl, idx) {
    return { pl: pl, idx: idx, rank: rank[playlistReorderKey(pl)] };
  }).sort(function (a, b) {
    var ar = a.rank;
    var br = b.rank;
    var ah = ar != null;
    var bh = br != null;
    if (ah && bh) return ar - br;
    if (ah) return -1;
    if (bh) return 1;
    return a.idx - b.idx;
  }).map(function (entry) { return entry.pl; });
  return true;
}
function moveUserPlaylistIndex(fromIdx, toIdx, opts) {
  opts = opts || {};
  fromIdx = Math.round(Number(fromIdx));
  toIdx = Math.round(Number(toIdx));
  if (!userPlaylists || !userPlaylists.length) return false;
  if (!isFinite(fromIdx) || !isFinite(toIdx)) return false;
  if (fromIdx < 0 || fromIdx >= userPlaylists.length) return false;
  toIdx = Math.max(0, Math.min(userPlaylists.length - 1, toIdx));
  if (fromIdx === toIdx) return false;
  var item = userPlaylists.splice(fromIdx, 1)[0];
  userPlaylists.splice(toIdx, 0, item);
  playlistCatalogRevision += 1;
  savePlaylistReorderKeys();
  if (opts.renderPanel !== false) renderUserPlaylistsList({ animate: false });
  if (opts.rebuildShelf !== false) safeShelfRebuild('playlist-reorder', true);
  return true;
}
function playlistTracksEndpoint(provider, id, params) {
  provider = normalizePlaylistProvider(provider);
  var query = 'id=' + encodeURIComponent(id);
  if (params) {
    Object.keys(params).forEach(function (key) {
      if (params[key] == null || params[key] === '') return;
      query += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
    });
  }
  if (provider === 'qq') return '/api/qq/playlist/tracks?' + query;
  if (provider === 'kugou') return '/api/kugou/playlist/tracks?' + query;
  if (provider === 'qishui') return '/api/qishui/playlist/tracks?' + query;
  if (provider === 'spotify') return '/api/spotify/playlist/tracks?' + query;
  return '/api/playlist/tracks?' + query;
}
function fetchPlaylistTracksPage(provider, id, params, requestOptions) {
  provider = normalizePlaylistProvider(provider);
  if (provider === 'mineradio') return builtInPlaylistTracksPage(id, params || {});
  return apiJson(playlistTracksEndpoint(provider, id, params), requestOptions || {});
}
function playlistPanelDetailHtml(pl, provider, detailWindow) {
  provider = normalizePlaylistProvider(provider);
  var key = playlistPanelKey(provider, pl && pl.id);
  if (playlistPanelDetailState.key !== key) return '';
  var tracks = playlistPanelDetailState.tracks || [];
  var loading = playlistPanelDetailState.loading;
  var cover = pl && pl.cover ? (provider === 'netease' ? (pl.cover + '?param=96y96') : pl.cover) : '';
  var img = cover ? '<img class="pl-detail-cover" src="' + escHtml(cover) + '" alt="" decoding="async" onerror="this.style.opacity=0.2">' : '<div class="pl-detail-cover"></div>';
  var expectedTotal = Math.max(tracks.length, Number(playlistPanelDetailState.total) || Number(pl.trackCount) || 0);
  var rows = playlistPanelDetailRowsHtml(detailWindow);
  var canUncollect = !!(pl && pl.subscribed && !pl.virtual && (provider === 'netease' || provider === 'qishui' || provider === 'spotify'));
  var collectionButton = canUncollect
    ? '<button class="fx-mini-btn ghost pl-detail-top-btn" type="button" data-pl-detail-collection="0">取消收藏</button>'
    : '';
  var builtInActions = provider === 'mineradio'
    ? '<button class="fx-mini-btn ghost pl-detail-top-btn" type="button" data-pl-detail-rename="1">重命名</button><button class="fx-mini-btn ghost pl-detail-top-btn danger" type="button" data-pl-detail-delete="1">删除</button>'
    : '';
  var topButton = provider === 'mineradio' ? '' : '<button class="fx-mini-btn ghost pl-detail-top-btn" type="button" data-pl-detail-top="1">回到顶部</button>';
  return '<div class="pl-inline-detail" data-pl-detail="' + escHtml(key) + '" style="height:' + playlistPanelDetailShellHeight() + 'px">' +
    '<div class="pl-detail-sticky">' +
    '<div class="pl-detail-head">' + img + '<div style="flex:1;min-width:0"><div class="pl-detail-title">' + escHtml(pl.name || '歌单详情') + '</div><div class="pl-detail-sub">' + escHtml((expectedTotal || tracks.length || 0) + ' 首 · ' + (pl.creator || playlistProviderName(provider))) + '</div></div><div class="pl-detail-count">' + (loading && !tracks.length ? '载入中' : (tracks.length + (expectedTotal > tracks.length ? '/' + expectedTotal : ''))) + '</div></div>' +
    '<div class="pl-detail-actions"><button class="pl-detail-play" type="button" data-pl-detail-play="' + escHtml(key) + '"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>播放歌单</button>' + collectionButton + builtInActions + topButton + '</div>' +
    '</div>' +
    '<div class="pl-detail-list" data-pl-detail-scroll="' + escHtml(key) + '">' + rows + '</div>' +
    '</div>';
}
function renderPlaylistPanelDetailState() {
  renderUserPlaylistsList();
}
function scrollPlaylistPanelToTop() {
  var panel = document.getElementById('playlist-panel');
  if (!panel) return;
  try { panel.scrollTo({ top: 0, behavior: 'smooth' }); }
  catch (e) { panel.scrollTop = 0; }
}
function scrollPlaylistPanelDetailIntoView(key) {
  var panel = document.getElementById('playlist-panel');
  if (!panel || !key) return;
  requestAnimationFrame(function () {
    var detail = null;
    Array.prototype.some.call(panel.querySelectorAll('[data-pl-detail]'), function (node) {
      if (node.getAttribute('data-pl-detail') === key) {
        detail = node;
        return true;
      }
      return false;
    });
    if (!detail) return;
    var anchor = detail.previousElementSibling || detail;
    var toolbar = panel.querySelector('.queue-toolbar');
    var safeOffset = 126;
    if (toolbar) {
      var toolbarTop = 82;
      try { toolbarTop = parseFloat(getComputedStyle(toolbar).top) || toolbarTop; } catch (e) { }
      safeOffset = Math.max(safeOffset, toolbarTop + toolbar.offsetHeight + 12);
    }
    var top = Math.max(0, anchor.offsetTop - safeOffset);
    try { panel.scrollTo({ top: top, behavior: 'smooth' }); }
    catch (e) { panel.scrollTop = top; }
  });
}
function cancelPlaylistPanelDetailRequest() {
  if (playlistPanelDetailState.warmTimer) clearTimeout(playlistPanelDetailState.warmTimer);
  playlistPanelDetailState.warmTimer = 0;
  if (playlistPanelDetailState.controller) {
    try { playlistPanelDetailState.controller.abort(); } catch (e) { }
  }
  playlistPanelDetailState.controller = null;
}
function appendPlaylistPanelDetailTracks(target, incoming) {
  var seen = Object.create(null);
  (target || []).forEach(function (song, index) { seen[queuePanelItemKey(song, 'old:' + index)] = true; });
  var added = 0;
  (incoming || []).forEach(function (song, index) {
    var key = queuePanelItemKey(song, 'new:' + index);
    if (!song || seen[key]) return;
    seen[key] = true;
    target.push(song);
    added += 1;
  });
  return added;
}
function renderPlaylistPanelDetailRows() {
  if (!playlistPanelDetailState.key) return;
  renderUserPlaylistsList({ animate: false, preserveScroll: true });
}
function bindPlaylistPanelDetailScroller() {
  // 歌单详情与左栏共用 #playlist-panel 的单一滚动轴；行窗口由外层滚动位置驱动。
}
async function loadMorePlaylistPanelDetailTracks(reason) {
  var st = playlistPanelDetailState;
  if (!st.key || st.loadingMore || (reason !== 'initial' && !st.hasMore)) return false;
  var parts = st.key.split(':');
  var provider = normalizePlaylistProvider(parts[0]);
  var pid = parts.slice(1).join(':');
  var offset = reason === 'initial' ? 0 : Math.max(0, Number(st.nextOffset) || st.tracks.length);
  var token = st.token;
  var controller = window.AbortController ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, 12000) : 0;
  st.controller = controller;
  st.loadingMore = reason !== 'initial';
  if (st.loadingMore) renderPlaylistPanelDetailRows();
  try {
    var r = await fetchPlaylistTracksPage(provider, pid, { limit: PLAYLIST_DETAIL_BATCH_SIZE, offset: offset }, controller ? { signal: controller.signal } : { timeoutMs: 12000 });
    if (playlistPanelDetailState.token !== token || playlistPanelDetailState.key !== st.key) return false;
    var rawTracks = r && r.tracks || [];
    if (r && r.error && !rawTracks.length) throw new Error(r.message || r.error);
    var mapped = rawTracks.map(cloneSong);
    var added = appendPlaylistPanelDetailTracks(st.tracks, mapped);
    var responseTotal = Number(r && (r.total || (r.playlist && r.playlist.trackCount))) || 0;
    st.total = Math.max(st.total || 0, responseTotal, st.tracks.length);
    st.nextOffset = Math.max(offset + rawTracks.length, Number(r && r.nextOffset) || 0);
    st.hasMore = !!(r && r.hasMore);
    if (!rawTracks.length || (!added && st.nextOffset <= offset)) st.hasMore = false;
    st.loading = false;
    st.loadingMore = false;
    st.error = (r && r.error) || '';
    st.message = (r && (r.message || r.warning)) || '';
    if (r && r.playlist) st.playlist = Object.assign({}, st.playlist || {}, r.playlist);
    if (reason === 'initial') {
      renderPlaylistPanelDetailState();
      scrollPlaylistPanelDetailIntoView(st.key);
      if (st.hasMore) {
        st.warmTimer = setTimeout(function () {
          st.warmTimer = 0;
          if (playlistPanelDetailState.token === token && playlistPanelDetailState.key === st.key) loadMorePlaylistPanelDetailTracks('warm');
        }, 320);
      }
    } else {
      renderPlaylistPanelDetailRows();
    }
    return added > 0;
  } catch (e) {
    if (playlistPanelDetailState.token !== token || (e && e.name === 'AbortError')) return false;
    console.warn('[PlaylistPanelDetailPage]', pid, reason, e);
    st.loading = false;
    st.loadingMore = false;
    st.hasMore = false;
    st.error = 'PLAYLIST_DETAIL_PAGE_FAILED';
    st.message = st.tracks.length ? '后续歌曲载入失败，可继续滚动重试' : '歌单详情加载失败，请稍后重试';
    if (reason === 'initial') renderPlaylistPanelDetailState();
    else renderPlaylistPanelDetailRows();
    return false;
  } finally {
    if (timer) clearTimeout(timer);
    if (playlistPanelDetailState.token === token && playlistPanelDetailState.controller === controller) playlistPanelDetailState.controller = null;
  }
}
async function openPlaylistPanelDetail(provider, pid, title) {
  if (!pid) return;
  provider = normalizePlaylistProvider(provider);
  var key = playlistPanelKey(provider, pid);
  var pl = userPlaylists.find(function (item) { return playlistPanelKey(normalizePlaylistProvider(item.provider), item.id) === key; }) || { id: pid, provider: provider, name: title || '歌单详情' };
  if (playlistPanelDetailState.key === key) {
    cancelPlaylistPanelDetailRequest();
    playlistPanelDetailState.key = '';
    playlistPanelDetailState.tracks = [];
    playlistPanelDetailState.playlist = null;
    playlistPanelDetailState.renderLimit = PLAYLIST_DETAIL_INITIAL_RENDER;
    playlistPanelDetailState.error = '';
    playlistPanelDetailState.message = '';
    renderPlaylistPanelDetailState();
    return;
  }
  cancelPlaylistPanelDetailRequest();
  var token = ++playlistPanelDetailState.token;
  playlistPanelDetailState = { key: key, loading: true, loadingMore: false, playlist: pl, tracks: [], token: token, total: Number(pl.trackCount) || 0, nextOffset: 0, hasMore: true, scrollTop: 0, controller: null, warmTimer: 0, renderLimit: PLAYLIST_DETAIL_INITIAL_RENDER, error: '', message: '' };
  renderPlaylistPanelDetailState();
  scrollPlaylistPanelDetailIntoView(key);
  await loadMorePlaylistPanelDetailTracks('initial');
}
function playPlaylistPanelDetail() {
  var st = playlistPanelDetailState;
  if (!st || !st.key) return;
  var parts = st.key.split(':');
  var provider = normalizePlaylistProvider(parts[0]);
  var pid = parts.slice(1).join(':');
  loadPlaylistIntoQueueById(playlistPanelProviderId(provider, pid), true, st.playlist && st.playlist.name || '');
}
async function togglePlaylistPanelCollection(collected) {
  var state = playlistPanelDetailState;
  if (!state || !state.key || !state.playlist) return;
  var parts = state.key.split(':');
  var provider = normalizePlaylistProvider(parts[0]);
  var id = parts.slice(1).join(':');
  var endpoint = provider === 'netease'
    ? '/api/playlist/subscribe'
    : (provider === 'qishui'
      ? '/api/qishui/playlist/collect'
      : (provider === 'spotify' ? '/api/spotify/playlist/collect' : ''));
  if (!endpoint) {
    showToast(playlistProviderName(provider) + '暂不支持写回歌单收藏');
    return;
  }
  try {
    var result = await apiJson(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: id,
        playlistId: id,
        subscribed: !!collected,
        collected: !!collected,
        spotifyUri: state.playlist.spotifyUri || '',
      })
    });
    if (!result || result.error || result.success === false) throw new Error(result && (result.message || result.error) || 'PLAYLIST_COLLECTION_FAILED');
    showToast(collected ? '歌单已收藏' : '已取消收藏歌单');
    cancelPlaylistPanelDetailRequest();
    playlistPanelDetailState.key = '';
    playlistPanelDetailState.tracks = [];
    playlistPanelDetailState.playlist = null;
    await refreshUserPlaylists(true);
    renderPlaylistPanelDetailState();
  } catch (err) {
    showToast(/SCOPE|PERMISSION/i.test(String(err && err.message || ''))
      ? '请重新授权后再修改歌单收藏'
      : '歌单收藏操作失败');
  }
}
function playPlaylistPanelDetailTrack(index) {
  var tracks = playlistPanelDetailState.tracks || [];
  if (!tracks[index]) return;
  var parts = playlistPanelDetailState.key.split(':');
  var provider = normalizePlaylistProvider(parts[0]);
  var pid = parts.slice(1).join(':');
  loadPlaylistIntoQueueById(playlistPanelProviderId(provider, pid), true, playlistPanelDetailState.playlist && playlistPanelDetailState.playlist.name || '', {
    seedTracks: tracks,
    startIndex: index,
    total: playlistPanelDetailState.total,
    nextOffset: playlistPanelDetailState.nextOffset,
    hasMore: playlistPanelDetailState.hasMore,
    preserveHomeState: true
  });
}
function openPlaylistPanelDetailArtist(index) {
  var song = playlistPanelDetailState.tracks && playlistPanelDetailState.tracks[index];
  if (song) openArtistDetailForSong(song);
}
function growPlaylistPanelDetailRenderLimit(amount) {
  return loadMorePlaylistPanelDetailTracks('manual');
}
function maybeGrowPlaylistPanelDetailRenderLimit() {
  var panel = document.getElementById('playlist-panel');
  var detail = panel && panel.querySelector('.pl-inline-detail[data-pl-detail]');
  if (!panel || !detail || !playlistPanelDetailState.hasMore || playlistPanelDetailState.loadingMore) return;
  var panelRect = panel.getBoundingClientRect();
  var detailRect = detail.getBoundingClientRect();
  if (detailRect.bottom <= panelRect.bottom + PLAYLIST_DETAIL_ROW_STEP * 8) loadMorePlaylistPanelDetailTracks('scroll');
}
function resetPlaylistPanelRenderLimit() {
  playlistPanelRenderLimit = PLAYLIST_PANEL_BATCH_SIZE;
}
var playlistPanelVirtualCache = { revision: -1, detailKey: '', detailSig: '', entries: [], offsets: [0], totalHeight: 0, raf: 0 };
function playlistPanelDetailShellHeight() {
  var st = playlistPanelDetailState || {};
  var rows = Math.max(st.loading && !(st.tracks && st.tracks.length) ? 1 : 0, st.tracks && st.tracks.length || 0);
  var noticeHeight = rows ? 0 : 74;
  var footerHeight = st.error || st.hasMore || st.loadingMore || rows > PLAYLIST_DETAIL_INITIAL_RENDER ? PLAYLIST_DETAIL_OUTER_FOOTER_HEIGHT : 12;
  return PLAYLIST_DETAIL_OUTER_CHROME_HEIGHT + rows * PLAYLIST_DETAIL_ROW_STEP + noticeHeight + footerHeight;
}
function playlistPanelGroupKey(pl) {
  return normalizePlaylistProvider(pl && pl.provider);
}
function playlistPanelBuildVirtualEntries() {
  var detailSig = [
    playlistPanelDetailState.key || '',
    playlistPanelDetailState.loading ? 1 : 0,
    playlistPanelDetailState.loadingMore ? 1 : 0,
    playlistPanelDetailState.tracks && playlistPanelDetailState.tracks.length || 0,
    playlistPanelDetailState.total || 0,
    playlistPanelDetailState.hasMore ? 1 : 0,
    playlistPanelDetailState.error || ''
  ].join('|');
  if (playlistPanelVirtualCache.revision === playlistCatalogRevision &&
      playlistPanelVirtualCache.detailKey === playlistPanelDetailState.key &&
      playlistPanelVirtualCache.detailSig === detailSig) return playlistPanelVirtualCache;
  var labels = { mineradio: 'Mineradio 内置歌单', netease: '网易云歌单', qq: 'QQ 音乐歌单', kugou: '酷狗音乐歌单', qishui: '汽水音乐歌单', spotify: 'Spotify 歌单' };
  var order = ['mineradio', 'netease', 'qq', 'kugou', 'qishui', 'spotify'];
  var groups = { mineradio: [], netease: [], qq: [], kugou: [], qishui: [], spotify: [] };
  userPlaylists.forEach(function (pl, sourceIndex) {
    var key = playlistPanelGroupKey(pl);
    if (!groups[key]) groups[key] = [];
    groups[key].push({ pl: pl, sourceIndex: sourceIndex });
  });
  var entries = [];
  order.forEach(function (key) {
    var items = (groups[key] || []).sort(function (a, b) {
      var priority = playlistCardPriority(a.pl) - playlistCardPriority(b.pl);
      return priority || (a.sourceIndex - b.sourceIndex);
    });
    if (!items.length) return;
    entries.push({ type: 'label', key: key, label: labels[key] || key, height: 31 });
    items.forEach(function (entry) {
      entries.push({ type: 'card', pl: entry.pl, sourceIndex: entry.sourceIndex, height: 69 });
      var cardKey = playlistPanelKey(normalizePlaylistProvider(entry.pl.provider), entry.pl.id);
      if (playlistPanelDetailState.key === cardKey) {
        entries.push({ type: 'detail', pl: entry.pl, provider: normalizePlaylistProvider(entry.pl.provider), height: playlistPanelDetailShellHeight() });
      }
    });
  });
  var offsets = [0];
  entries.forEach(function (entry) { offsets.push(offsets[offsets.length - 1] + entry.height); });
  playlistPanelVirtualCache = {
    revision: playlistCatalogRevision,
    detailKey: playlistPanelDetailState.key,
    detailSig: detailSig,
    entries: entries,
    offsets: offsets,
    totalHeight: offsets[offsets.length - 1] || 0,
    raf: playlistPanelVirtualCache.raf || 0
  };
  return playlistPanelVirtualCache;
}
function playlistPanelOffsetIndex(offsets, value) {
  var lo = 0, hi = Math.max(0, offsets.length - 1);
  while (lo < hi) {
    var mid = Math.floor((lo + hi + 1) / 2);
    if (offsets[mid] <= value) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, Math.min(offsets.length - 2, lo));
}
function playlistCatalogFooterHtml() {
  var state = playlistCatalogSyncState || {};
  var providerStates = state.providers || {};
  var totals = Object.keys(providerStates).reduce(function (acc, key) {
    var item = providerStates[key] || {};
    acc.loaded += Number(item.loaded) || 0;
    acc.total += Math.max(Number(item.total) || 0, Number(item.loaded) || 0);
    if (item.hasMore || item.loading) acc.pending = true;
    return acc;
  }, { loaded: 0, total: 0, pending: !!state.loading });
  if (!totals.pending && !state.error) return '';
  var label = state.error
    ? ('部分歌单载入失败 · 已显示 ' + userPlaylists.length + ' 个')
    : ('正在后台载入歌单 · ' + totals.loaded + (totals.total ? '/' + totals.total : ''));
  return '<div class="playlist-catalog-status"><span class="queue-hydration-spinner spinning"></span><span>' + label + '</span></div>';
}
function schedulePlaylistPanelVirtualRender() {
  if (playlistPanelVirtualCache.raf) return;
  playlistPanelVirtualCache.raf = requestAnimationFrame(function () {
    playlistPanelVirtualCache.raf = 0;
    if (queueViewTab !== 'playlists') return;
    renderUserPlaylistsList({ animate: false, preserveScroll: true });
  });
}
function bindPlaylistPanelLazyRender() {
  var panel = document.getElementById('playlist-panel');
  bindMiniQueueLazyRender();
  if (!panel || playlistPanelLazyBound) return;
  playlistPanelLazyBound = true;
  panel.addEventListener('scroll', function () {
    if (queueViewTab === 'queue') {
      scheduleQueuePanelVirtualRender();
      maybeRequestPlaylistQueuePageFromScroller(panel);
    }
    if (queueViewTab === 'playlists') {
      schedulePlaylistPanelVirtualRender();
      maybeGrowPlaylistPanelDetailRenderLimit();
    }
  }, { passive: true });
}
function renderUserPlaylistsList(opts) {
  opts = opts || {};
  var $pl = document.getElementById('pl-list');
  var seq = ++playlistRenderSeq;
  if (!userPlaylists.length) {
    $pl.innerHTML = playlistCatalogSyncState && playlistCatalogSyncState.loading
      ? miniQueueSkeleton() + playlistCatalogFooterHtml()
      : '<div style="text-align:center;padding:24px 0;color:rgba(255,255,255,.32);font-size:11.5px">未找到歌单</div>';
    return;
  }
  var panel = document.getElementById('playlist-panel');
  var keepTop = panel ? panel.scrollTop : 0;
  function playlistCardHtml(pl, sourceIndex) {
    var provider = normalizePlaylistProvider(pl.provider);
    var providerLabel = playlistProviderLabel(provider);
    var thumb = pl.cover ? (provider === 'netease' ? (pl.cover + '?param=88y88') : pl.cover) : '';
    var imgTag = thumb ? '<img src="' + thumb + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : (provider === 'mineradio' ? '<div class="pl-built-in-placeholder">MR</div>' : '<div style="width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,.06);flex-shrink:0"></div>');
    var key = playlistPanelKey(provider, pl.id);
    var isExpanded = playlistPanelDetailState.key === key;
    var expanded = isExpanded ? ' expanded' : '';
    return '<div class="pl-card' + expanded + '" aria-expanded="' + (isExpanded ? 'true' : 'false') + '" data-playlist-provider="' + provider + '" data-playlist-id="' + escHtml(String(pl.id || '')) + '" data-playlist-title="' + escHtml(pl.name || '') + '" data-playlist-index="' + sourceIndex + '">' +
      imgTag +
      '<div style="flex:1;min-width:0"><div class="pl-name">' + escHtml(pl.name) + '<span class="tag-source ' + provider + '" style="margin-left:6px;vertical-align:1px">' + providerLabel + '</span></div><div class="pl-sub">' + pl.trackCount + ' 首 · ' + escHtml(pl.creator || '') + '</div></div>' +
      '</div>';
  }
  var cache = playlistPanelBuildVirtualEntries();
  var listRect = $pl.getBoundingClientRect();
  var panelRect = panel && panel.getBoundingClientRect ? panel.getBoundingClientRect() : { top: 0 };
  var visibleTop = panel ? Math.max(0, panelRect.top - listRect.top) : 0;
  var viewport = Math.max(420, Number(panel && panel.clientHeight) || 620);
  var start = playlistPanelOffsetIndex(cache.offsets, Math.max(0, visibleTop - PLAYLIST_CARD_VIRTUAL_OVERSCAN_PX));
  var end = Math.min(cache.entries.length, playlistPanelOffsetIndex(cache.offsets, visibleTop + viewport + PLAYLIST_CARD_VIRTUAL_OVERSCAN_PX) + 1);
  var topHeight = cache.offsets[start] || 0;
  var bottomHeight = Math.max(0, cache.totalHeight - (cache.offsets[end] || cache.totalHeight));
  var html = '<div class="playlist-virtual-spacer" aria-hidden="true" style="height:' + Math.round(topHeight) + 'px"></div>';
  for (var entryIndex = start; entryIndex < end; entryIndex++) {
    var entry = cache.entries[entryIndex];
    if (entry.type === 'label') html += '<div class="pl-section-label">' + entry.label + '</div>';
    else if (entry.type === 'card') html += playlistCardHtml(entry.pl, entry.sourceIndex);
    else if (entry.type === 'detail') {
      var entryTop = cache.offsets[entryIndex] || 0;
      var detailRowScrollTop = Math.max(0, visibleTop - entryTop - PLAYLIST_DETAIL_OUTER_CHROME_HEIGHT);
      html += playlistPanelDetailHtml(entry.pl, entry.provider, { scrollTop: detailRowScrollTop, viewport: viewport });
    }
  }
  html += '<div class="playlist-virtual-spacer" aria-hidden="true" style="height:' + Math.round(bottomHeight) + 'px"></div>' + playlistCatalogFooterHtml();
  $pl.innerHTML = html;
  if (panel && opts.preserveScroll) panel.scrollTop = keepTop;
  bindPlaylistPanelDetailScroller();
  if (typeof requestNextPlaylistCatalogPage === 'function' && end >= cache.entries.length - 8) requestNextPlaylistCatalogPage('panel-near-end');
  if (opts.animate && seq === playlistRenderSeq) animateVisiblePanelList($pl, '.pl-card', document.getElementById('playlist-panel'));
}
function renderMyPodcastCollections(opts) {
  opts = opts || {};
  var $pod = document.getElementById('podcast-list');
  if (!$pod) return;
  if (!loginStatus.loggedIn) {
    $pod.innerHTML = '<div style="text-align:center;padding:14px 0;color:rgba(255,255,255,.28);font-size:11.5px">登录后显示我的播客</div>';
    return;
  }
  var items = myPodcastCollections || [];
  if (!items.length) {
    $pod.innerHTML = '<div style="text-align:center;padding:14px 0;color:rgba(255,255,255,.28);font-size:11.5px">暂无播客数据</div>';
    return;
  }
  $pod.innerHTML = items.map(function (pc) {
    var thumb = pc.cover ? coverUrlWithSize(pc.cover, 88) : '';
    var imgTag = thumb ? '<img src="' + thumb + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div style="width:44px;height:44px;border-radius:8px;background:rgba(0,245,212,.07);flex-shrink:0"></div>';
    return '<div class="pl-card podcast-card" data-podcast-key="' + escHtml(pc.key || '') + '" data-podcast-title="' + escHtml(pc.title || '') + '">' +
      imgTag +
      '<div style="flex:1;min-width:0"><div class="pl-name">' + escHtml(pc.title || '') + '</div><div class="pl-sub">' + (pc.count || 0) + ' 项 · ' + escHtml(pc.sub || '') + '</div></div>' +
      '</div>';
  }).join('');
  if (opts.animate) animateVisiblePanelList($pod, '.pl-card', document.getElementById('playlist-panel'));
}
document.getElementById('pl-list').addEventListener('click', function (e) {
  var loadMore = e.target && e.target.closest ? e.target.closest('[data-pl-load-more]') : null;
  if (loadMore) {
    e.preventDefault();
    e.stopPropagation();
    growPlaylistPanelRenderLimit();
    return;
  }
  var detailLoadMore = e.target && e.target.closest ? e.target.closest('[data-pl-detail-load-more]') : null;
  if (detailLoadMore) {
    e.preventDefault();
    e.stopPropagation();
    growPlaylistPanelDetailRenderLimit();
    return;
  }
  var detailTop = e.target && e.target.closest ? e.target.closest('[data-pl-detail-top]') : null;
  if (detailTop) {
    e.preventDefault();
    e.stopPropagation();
    scrollPlaylistPanelToTop();
    return;
  }
  var playDetail = e.target && e.target.closest ? e.target.closest('[data-pl-detail-play]') : null;
  if (playDetail) {
    e.preventDefault();
    e.stopPropagation();
    playPlaylistPanelDetail();
    return;
  }
  var collection = e.target && e.target.closest ? e.target.closest('[data-pl-detail-collection]') : null;
  if (collection) {
    e.preventDefault();
    e.stopPropagation();
    togglePlaylistPanelCollection(collection.getAttribute('data-pl-detail-collection') === '1');
    return;
  }
  var rename = e.target && e.target.closest ? e.target.closest('[data-pl-detail-rename]') : null;
  if (rename) {
    e.preventDefault();
    e.stopPropagation();
    if (playlistPanelDetailState.playlist) renameBuiltInPlaylist(playlistPanelDetailState.playlist.id, playlistPanelDetailState.playlist.name);
    return;
  }
  var removePlaylist = e.target && e.target.closest ? e.target.closest('[data-pl-detail-delete]') : null;
  if (removePlaylist) {
    e.preventDefault();
    e.stopPropagation();
    if (playlistPanelDetailState.playlist) deleteBuiltInPlaylist(playlistPanelDetailState.playlist.id, playlistPanelDetailState.playlist.name);
    return;
  }
  var removeTrack = e.target && e.target.closest ? e.target.closest('[data-pl-detail-remove]') : null;
  if (removeTrack) {
    e.preventDefault();
    e.stopPropagation();
    var detailParts = String(playlistPanelDetailState.key || '').split(':');
    if (normalizePlaylistProvider(detailParts[0]) === 'mineradio') removeTrackFromBuiltInPlaylist(detailParts.slice(1).join(':'), Number(removeTrack.getAttribute('data-pl-detail-remove')));
    return;
  }
  var artist = e.target && e.target.closest ? e.target.closest('[data-pl-detail-artist]') : null;
  if (artist) {
    e.preventDefault();
    e.stopPropagation();
    openPlaylistPanelDetailArtist(Number(artist.getAttribute('data-pl-detail-artist')));
    return;
  }
  var row = e.target && e.target.closest ? e.target.closest('[data-pl-detail-row]') : null;
  if (row) {
    e.preventDefault();
    e.stopPropagation();
    playPlaylistPanelDetailTrack(Number(row.getAttribute('data-pl-detail-row')));
    return;
  }
  var card = e.target && e.target.closest ? e.target.closest('.pl-card') : null;
  if (!card) return;
  var provider = card.getAttribute('data-playlist-provider') || 'netease';
  var pid = card.getAttribute('data-playlist-id') || '';
  openPlaylistPanelDetail(provider, pid, card.getAttribute('data-playlist-title') || '');
});
