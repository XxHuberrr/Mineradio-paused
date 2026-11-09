var podcastListEl = document.getElementById('podcast-list');
if (podcastListEl) {
  podcastListEl.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('[data-podcast-back]')) {
      renderMyPodcastCollections({ animate: true });
      return;
    }
    var radioCard = e.target && e.target.closest ? e.target.closest('[data-podcast-radio-id]') : null;
    if (radioCard) {
      loadPodcastRadioIntoQueue(radioCard.getAttribute('data-podcast-radio-id'), true, radioCard.getAttribute('data-podcast-title') || '');
      return;
    }
    var card = e.target && e.target.closest ? e.target.closest('[data-podcast-key]') : null;
    if (!card) return;
    openMyPodcastCollection(card.getAttribute('data-podcast-key'), card.getAttribute('data-podcast-title') || '');
  });
}
function renderMyPodcastRadioItems(key, title, items) {
  var $pod = document.getElementById('podcast-list');
  if (!$pod) return;
  if (!items.length) {
    $pod.innerHTML = '<div class="podcast-inline-head"><div class="pl-section-label">' + escHtml(title || '我的播客') + '</div><button class="fx-mini-btn ghost" data-podcast-back="1" style="height:24px;padding:0 9px;font-size:10.5px">返回</button></div>' +
      '<div style="text-align:center;padding:14px 0;color:rgba(255,255,255,.28);font-size:11.5px">暂无内容</div>';
    return;
  }
  $pod.innerHTML = '<div class="podcast-inline-head"><div class="pl-section-label">' + escHtml(title || '我的播客') + '</div><button class="fx-mini-btn ghost" data-podcast-back="1" style="height:24px;padding:0 9px;font-size:10.5px">返回</button></div>' +
    items.map(function (r) {
      var thumb = r.cover ? coverUrlWithSize(r.cover, 88) : '';
      var imgTag = thumb ? '<img src="' + thumb + '" alt="" loading="lazy" decoding="async" onerror="this.style.opacity=0.2">' : '<div style="width:44px;height:44px;border-radius:8px;background:rgba(0,245,212,.07);flex-shrink:0"></div>';
      return '<div class="pl-card podcast-card podcast-child" data-podcast-radio-id="' + escHtml(String(r.id || r.radioId || '')) + '" data-podcast-title="' + escHtml(r.name || '') + '">' +
        imgTag +
        '<div style="flex:1;min-width:0"><div class="pl-name">' + escHtml(r.name || '') + '</div><div class="pl-sub">' + escHtml((r.djName || r.artist || 'Podcast') + (r.programCount ? (' · ' + r.programCount + ' 集') : '')) + '</div></div>' +
        '</div>';
    }).join('');
  animateVisiblePanelList($pod, '.pl-card', document.getElementById('playlist-panel'));
}
async function openMyPodcastCollection(key, title) {
  if (!key) return;
  showLoading();
  try {
    var r = await apiJson('/api/podcast/my/items?key=' + encodeURIComponent(key) + '&limit=' + PLAYLIST_LAZY_BATCH_SIZE);
    if (r && r.loggedIn === false) { showLoginModal(); return; }
    var items = r.items || [];
    myPodcastItems[key] = items;
    if (!items.length) {
      showToast('暂无内容: ' + (title || key));
      renderMyPodcastRadioItems(key, title, []);
      return;
    }
    if (r.itemType === 'voice' || (items[0] && items[0].type === 'podcast')) {
      playQueue = items.map(cloneSong);
      currentIdx = 0;
      safeRenderQueuePanel('podcast-collection-voice');
      safeSwitchPlaylistTab('queue', 'podcast-collection-voice');
      safeShelfRebuild('podcast-collection-voice', true);
      forcePlaybackControlsInteractive();
      await playQueueAt(0);
      showToast('载入: ' + (title || '喜欢的声音'));
      return;
    }
    renderMyPodcastRadioItems(key, title, items);
  } catch (e) {
    console.warn(e);
    showToast('播客加载失败');
  } finally {
    hideLoading();
  }
}
async function loadPodcastRadioIntoQueue(id, autoplay, title) {
  if (!id) return;
  showLoading();
  try {
    var r = await apiJson('/api/podcast/programs?id=' + encodeURIComponent(id) + '&limit=' + PLAYLIST_LAZY_BATCH_SIZE);
    if (r.error) { showToast('播客加载失败: ' + r.error); return; }
    if (!r.programs || !r.programs.length) { showToast('播客暂无可播放节目'); return; }
    playQueue = r.programs.map(cloneSong);
    currentIdx = 0;
    safeRenderQueuePanel('podcast-radio');
    safeSwitchPlaylistTab('queue', 'podcast-radio');
    safeShelfRebuild('podcast-radio', true);
    forcePlaybackControlsInteractive();
    if (autoplay) await playQueueAt(0);
    showToast('载入: ' + (title || '播客'));
  } catch (e) {
    console.warn(e);
    showToast('播客加载失败');
  } finally {
    hideLoading();
  }
}
function playlistQueueSource(id) {
  var raw = String(id || '');
  if (raw.indexOf('mineradio:') === 0) return { provider: 'mineradio', id: raw.slice(10), requestId: raw };
  if (raw.indexOf('qq:') === 0) return { provider: 'qq', id: raw.slice(3), requestId: raw };
  if (raw.indexOf('kugou:') === 0) return { provider: 'kugou', id: raw.slice(6), requestId: raw };
  if (raw.indexOf('qishui:') === 0) return { provider: 'qishui', id: raw.slice(7), requestId: raw };
  if (raw.indexOf('spotify:') === 0) return { provider: 'spotify', id: raw.slice(8), requestId: raw };
  return { provider: 'netease', id: raw, requestId: raw };
}
function playlistQueuePageSize(provider, initial) {
  if (initial) return provider === 'kugou' || provider === 'qishui' ? 50 : (provider === 'spotify' ? 96 : PLAYLIST_QUEUE_INITIAL_BATCH_SIZE);
  if (provider === 'kugou' || provider === 'qishui') return 50;
  if (provider === 'spotify') return 100;
  if (provider === 'qq') return 96;
  return PLAYLIST_QUEUE_BACKGROUND_BATCH_SIZE;
}
function playlistQueuePageUrl(source, offset, limit) {
  return playlistTracksEndpoint(source.provider, source.id, { offset: Math.max(0, offset || 0), limit: Math.max(1, limit || PLAYLIST_QUEUE_INITIAL_BATCH_SIZE) });
}
function cancelPlaylistQueueHydration(reason) {
  var previous = queueHydrationState;
  if (previous && previous.timer) clearTimeout(previous.timer);
  if (previous) {
    previous.token += 1;
    previous.active = false;
    previous.loading = false;
    previous.promise = null;
    previous.timer = 0;
    previous.pausedForBuffer = false;
  }
  return reason || '';
}
function playlistQueueHydrationValid(state, token) {
  return !!(state && queueHydrationState === state && state.token === token && state.queueRef === playQueue);
}
function schedulePlaylistQueueHydration(delay, reason) {
  var state = queueHydrationState;
  if (!state || !state.active || state.error || state.queueRef !== playQueue) return false;
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(function () {
    state.timer = 0;
    hydratePlaylistQueueNextPage(reason || 'background');
  }, Math.max(0, Number(delay) || 0));
  return true;
}
async function hydratePlaylistQueueNextPage(reason) {
  var state = queueHydrationState;
  if (!state || !state.active || state.error || state.queueRef !== playQueue) return false;
  if (state.loading && state.promise) return state.promise;
  var token = state.token;
  var source = { provider: state.provider, id: state.sourceId, requestId: state.playlistId };
  var offset = Math.max(0, Number(state.nextOffset) || playQueue.length);
  var limit = playlistQueuePageSize(state.provider, false);
  state.loading = true;
  state.pausedForBuffer = false;
    state.promise = fetchPlaylistTracksPage(source.provider, source.id, { offset: offset, limit: limit }, { timeoutMs: 16000 }).then(function (r) {
    if (!playlistQueueHydrationValid(state, token)) return false;
    var rawTracks = r && r.tracks || [];
    if (r && r.error && !rawTracks.length) throw new Error(r.message || r.error);
    var pageTracks = rawTracks.map(cloneSong);
    if (state.liked) markSongsLiked(pageTracks, true);
    if (playMode === 'shuffle' && pageTracks.length > 1) shuffleArrayInPlace(pageTracks);
    if (pageTracks.length) Array.prototype.push.apply(playQueue, pageTracks);
    state.loaded = playQueue.length;
    state.total = Math.max(state.total || 0, Number(r && (r.total || (r.playlist && r.playlist.trackCount))) || 0, state.loaded);
    state.nextOffset = Math.max(Number(r && r.nextOffset) || 0, offset + rawTracks.length);
    state.hasMore = !!(r && r.hasMore);
    if (!rawTracks.length || state.nextOffset <= offset) state.hasMore = false;
    state.active = state.hasMore || (!!state.total && state.nextOffset < state.total);
    state.pausedForBuffer = state.active;
    safeRenderQueuePanel('playlist-queue-hydrate', { animate: false, scrollCurrent: false });
    if (!state.active) {
      state.loading = false;
      state.promise = null;
      state.pausedForBuffer = false;
      safeRenderQueuePanel('playlist-queue-hydrate-complete', { animate: false, scrollCurrent: false });
    }
    return pageTracks.length > 0;
  }).catch(function (e) {
    if (!playlistQueueHydrationValid(state, token)) return false;
    console.warn('[PlaylistQueueHydration]', state.playlistId, reason || '', e);
    state.error = e && e.message || 'PLAYLIST_QUEUE_PAGE_FAILED';
    state.active = false;
    state.pausedForBuffer = false;
    safeRenderQueuePanel('playlist-queue-hydrate-error', { animate: false, scrollCurrent: false });
    return false;
  }).finally(function () {
    if (!playlistQueueHydrationValid(state, token)) return;
    state.loading = false;
    state.promise = null;
  });
  safeRenderQueuePanel('playlist-queue-hydrate-start', { animate: false, scrollCurrent: false });
  return state.promise;
}
function retryPlaylistQueueHydration() {
  var state = queueHydrationState;
  if (!state || state.queueRef !== playQueue) return false;
  state.error = '';
  state.active = state.hasMore || !state.total || state.nextOffset < state.total;
  if (!state.active) return false;
  state.pausedForBuffer = false;
  hydratePlaylistQueueNextPage('retry');
  return true;
}
function ensurePlaylistQueueHydratedAhead(index) {
  var state = queueHydrationState;
  if (!state || state.queueRef !== playQueue || !state.active || state.error) return false;
  if (playQueue.length - Math.max(0, Number(index) || 0) <= PLAYLIST_QUEUE_PLAYBACK_AHEAD_THRESHOLD) {
    state.pausedForBuffer = false;
    return schedulePlaylistQueueHydration(0, 'playback-ahead');
  }
  return false;
}
function requestPlaylistQueueHydrationForBrowse() {
  var state = queueHydrationState;
  if (!state || state.queueRef !== playQueue || !state.active || state.loading || state.error) return false;
  state.pausedForBuffer = false;
  return schedulePlaylistQueueHydration(0, 'queue-browse-tail');
}
async function loadPlaylistIntoQueueById(id, autoplay, title, opts) {
  if (!id) return false;
  opts = opts || {};
  if (!opts.preserveHomeState) {
    homeForcedOpen = false;
    homeSuppressed = false;
    updateEmptyHomeVisibility();
  }
  showLoading();
  cancelPlaylistQueueHydration('new-playlist');
  var source = playlistQueueSource(id);
  var token = (queueHydrationState && queueHydrationState.token || 0) + 1;
  var r = null;
  var seedTracks = Array.isArray(opts.seedTracks) && opts.seedTracks.length ? opts.seedTracks.map(cloneSong) : [];
  try {
    if (!seedTracks.length) {
      r = await fetchPlaylistTracksPage(source.provider, source.id, { offset: 0, limit: playlistQueuePageSize(source.provider, true) }, { timeoutMs: 16000 });
      seedTracks = (r && r.tracks || []).map(cloneSong);
    } else {
      r = {
        playlist: opts.playlist || null,
        tracks: seedTracks,
        total: opts.total,
        nextOffset: opts.nextOffset,
        hasMore: opts.hasMore
      };
    }
  } catch (e) {
    console.warn('[PlaylistLoadFirstPage]', id, e);
    showToast('歌单首批加载失败');
    hideLoading();
    return false;
  }
  try {
    if (!seedTracks.length) {
      showToast(r && (r.message || r.error) || '歌单为空');
      return false;
    }
    playQueue = seedTracks;
    var catalogPlaylist = userPlaylists.find(function (pl) {
      return normalizePlaylistProvider(pl && pl.provider) === source.provider && String(pl && pl.id || '') === String(source.id || '');
    });
    var total = Math.max(playQueue.length, Number(r && (r.total || (r.playlist && r.playlist.trackCount))) || Number(opts.total) || Number(catalogPlaylist && catalogPlaylist.trackCount) || 0);
    var nextOffset = Math.max(Number(r && r.nextOffset) || Number(opts.nextOffset) || playQueue.length, playQueue.length);
    var hasMore = opts.hasMore != null ? !!opts.hasMore : !!(r && r.hasMore);
    if (total > nextOffset) hasMore = true;
    var liked = isLikedPlaylistContext(id, title, r && r.playlist);
    if (liked) markSongsLiked(playQueue, true);
    else if (source.provider === 'netease') syncLikeStatusForSongs(playQueue);
    queueHydrationState = {
      token: token,
      active: hasMore,
      loading: false,
      provider: source.provider,
      playlistId: source.requestId,
      sourceId: source.id,
      title: title || (r && r.playlist && r.playlist.name) || '',
      total: total,
      nextOffset: nextOffset,
      hasMore: hasMore,
      loaded: playQueue.length,
      error: '',
      promise: null,
      timer: 0,
      queueRef: playQueue,
      liked: liked,
      warmPagesRemaining: hasMore ? 1 : 0,
      pausedForBuffer: false
    };
    currentIdx = Math.max(0, Math.min(playQueue.length - 1, Number(opts.startIndex) || 0));
    safeRenderQueuePanel('playlist-load-first-page', { animate: true, scrollCurrent: true, deferWhenHidden: false });
    safeSwitchPlaylistTab('queue', 'playlist-load-first-page');
    safeShelfRebuild('playlist-load-first-page', true);
    forcePlaybackControlsInteractive();
    hideLoading();
    if (autoplay) {
      try {
        await playQueueAt(currentIdx, { preserveHomeState: !!opts.preserveHomeState });
      } catch (playErr) {
        console.warn('[PlaylistAutoplay]', id, playErr);
        showToast('歌单已载入，播放启动失败');
      }
    }
    forcePlaybackControlsInteractive();
    if (queueHydrationState.active) {
      showToast('已开始播放，后续歌曲会按需流式加入队列');
      if (queueHydrationState.warmPagesRemaining > 0) {
        queueHydrationState.warmPagesRemaining -= 1;
        schedulePlaylistQueueHydration(180, 'initial-warm-page');
      }
    } else {
      showToast('载入: ' + (title || ('歌单 ' + id)));
    }
    return true;
  } catch (e) {
    console.warn('[PlaylistLoadState]', id, e);
    forcePlaybackControlsInteractive();
    showToast('歌单已载入，界面刷新失败');
    return false;
  } finally {
    hideLoading();
  }
}

// 进度条
