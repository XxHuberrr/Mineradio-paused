function currentCoverSong() {
  if (currentIdx >= 0 && playQueue[currentIdx]) return playQueue[currentIdx];
  return currentLocalSong || null;
}
function songDurationLabel(song) {
  var sec = playbackDurationFromSong(song);
  if (!sec && audio && isFinite(audio.duration) && audio.duration > 0) sec = audio.duration;
  if (!sec) return '未知';
  return formatProgramTime(sec);
}
function songSourceLabel(song) {
  if (!song) return '未知';
  if (song.provider === 'spotify' || song.source === 'spotify' || song.type === 'spotify' || song.spotifyId || song.spotifyUri) return 'Spotify';
  if (song.provider === 'qq' || song.source === 'qq' || song.type === 'qq') return 'QQ 音乐';
  if (song.provider === 'qishui' || song.source === 'qishui' || song.type === 'qishui') return '汽水音乐';
  if (song.provider === 'kugou' || song.source === 'kugou' || song.type === 'kugou' || song.hash || song.audioHash) return '酷狗音乐';
  if (song.type === 'local') return '本地上传';
  if (song.type === 'podcast' || song.source === 'podcast') return '网易云播客';
  return '网易云音乐';
}
function detailRow(label, value) {
  value = value == null || value === '' ? '未知' : value;
  return '<div class="detail-k">' + escHtml(label) + '</div><div class="detail-v">' + escHtml(String(value)) + '</div>';
}
function currentArtistNames(song) {
  var text = String((song && song.artist) || '').trim();
  if (!text) return [];
  return text.split(/\s*\/\s*|\s*,\s*|、/).map(function (s) { return s.trim(); }).filter(Boolean);
}
var trackDetailSeq = 0;
var detailArtistSongs = [];
var detailAlbumSongs = [];
var detailAlbumContext = null;
var detailAlbumGaplessEnabled = true;
var detailAlbumGaplessUserTouched = false;
var detailAlbumCollectionState = Object.create(null);
var detailCommentSong = null;
var detailCommentSubmitBusy = false;
function normalizeArtistNameForMatch(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[\s·・,，、/\\|&＋+_-]+/g, '')
    .replace(/[()（）\[\]【】"'“”‘’]/g, '');
}
function artistNameMatches(expectedNames, actualName) {
  var actual = normalizeArtistNameForMatch(actualName);
  if (!actual) return false;
  return (expectedNames || []).some(function (name) {
    var expected = normalizeArtistNameForMatch(name);
    return expected && (expected === actual || expected.indexOf(actual) >= 0 || actual.indexOf(expected) >= 0);
  });
}
function currentArtistId(song) {
  if (!song) return '';
  if (!isCloudSong(song)) return '';
  if (song.artistId) return String(song.artistId);
  var artists = song.artists || [];
  for (var i = 0; i < artists.length; i++) {
    if (artists[i] && artists[i].id) return String(artists[i].id);
  }
  return '';
}
function currentQQArtistMid(song) {
  if (!song || songProviderKey(song) !== 'qq') return '';
  if (song.artistMid) return String(song.artistMid);
  if (song.singerMid) return String(song.singerMid);
  if (song.artistId && !/^\d+$/.test(String(song.artistId))) return String(song.artistId);
  var artists = song.artists || [];
  for (var i = 0; i < artists.length; i++) {
    if (artists[i] && artists[i].mid) return String(artists[i].mid);
    if (artists[i] && artists[i].id && !/^\d+$/.test(String(artists[i].id))) return String(artists[i].id);
  }
  return '';
}
function currentAlbumKey(song) {
  if (!song) return '';
  var provider = songProviderKey(song);
  if (provider === 'qq') {
    var qqAlbumMid = song.albumMid || song.albummid || song.album_mid || '';
    return qqAlbumMid ? 'qq:' + qqAlbumMid : '';
  }
  if (provider === 'spotify') {
    var spotifyAlbumId = song.albumId || song.spotifyAlbumId || '';
    return spotifyAlbumId ? 'spotify:' + spotifyAlbumId : '';
  }
  if (provider === 'netease') {
    var albumId = song.albumId || song.album_id || '';
    return albumId ? 'netease:' + albumId : '';
  }
  if (provider === 'kugou') {
    var kugouAlbumId = song.albumId || song.album_id || '';
    return kugouAlbumId ? 'kugou:' + kugouAlbumId : '';
  }
  if (provider === 'qishui') {
    var qishuiAlbumId = song.albumId || song.album_id || '';
    return qishuiAlbumId ? 'qishui:' + qishuiAlbumId : '';
  }
  return '';
}
function albumDetailUrlForSong(song) {
  var provider = songProviderKey(song);
  if (provider === 'qq') {
    var qqAlbumMid = song && (song.albumMid || song.albummid || song.album_mid || '');
    return qqAlbumMid ? '/api/qq/album/detail?mid=' + encodeURIComponent(qqAlbumMid) + '&limit=120' : '';
  }
  if (provider === 'spotify') {
    var spotifyAlbumId = song && (song.albumId || song.spotifyAlbumId || '');
    return spotifyAlbumId ? '/api/spotify/album/detail?id=' + encodeURIComponent(spotifyAlbumId) + '&limit=100' : '';
  }
  if (provider === 'netease') {
    var albumId = song && (song.albumId || song.album_id || '');
    return albumId ? '/api/album/detail?id=' + encodeURIComponent(albumId) + '&limit=120' : '';
  }
  return '';
}
function albumDetailMissingText(song) {
  var provider = songProviderKey(song);
  if (provider === 'kugou') return '当前酷狗歌曲缺少稳定专辑详情接口，暂不能按当前音源打开专辑。';
  if (provider === 'qishui') return '汽水当前作为匹配源接入，暂不能按当前音源打开专辑详情。';
  return '当前歌曲缺少可用专辑 ID，重新搜索或播放新版结果后再打开专辑。';
}
function albumCollectionConfig(song) {
  var provider = songProviderKey(song);
  var albumId = song && (song.albumId || song.album_id || song.spotifyAlbumId || '');
  if (!albumId) return null;
  if (provider === 'netease') return { provider: provider, id: String(albumId), endpoint: '/api/album/subscribe', field: 'subscribed', label: '网易云' };
  if (provider === 'spotify') return { provider: provider, id: String(albumId), endpoint: '/api/spotify/album/like', field: 'like', label: 'Spotify' };
  if (provider === 'qishui') return { provider: provider, id: String(albumId), endpoint: '/api/qishui/album/collect', field: 'collected', label: '汽水音乐' };
  return null;
}
function albumCollectionKey(song) {
  var config = albumCollectionConfig(song);
  return config ? (config.provider + ':' + config.id) : '';
}
function renderAlbumCollectionButton(song) {
  var config = albumCollectionConfig(song);
  if (!config) return '';
  var key = albumCollectionKey(song);
  var collected = !!detailAlbumCollectionState[key];
  return '<button id="album-collection-toggle" class="detail-action-toggle' + (collected ? ' on' : '') + '" type="button" onclick="toggleAlbumCollection()">' +
    (collected ? '已收藏专辑' : '收藏专辑') +
    '</button>';
}
function syncAlbumCollectionButton(song) {
  song = song || detailCommentSong || currentCoverSong();
  var btn = document.getElementById('album-collection-toggle');
  if (!btn) return;
  var collected = !!detailAlbumCollectionState[albumCollectionKey(song)];
  btn.classList.toggle('on', collected);
  btn.textContent = collected ? '已收藏专辑' : '收藏专辑';
}
function syncAlbumCollectionState(song) {
  var config = albumCollectionConfig(song);
  if (!config || !isSongAccountLoggedIn(config.provider)) return;
  var url = '';
  var responseField = '';
  if (config.provider === 'netease') {
    url = '/api/album/subscribe/check?ids=' + encodeURIComponent(config.id);
    responseField = 'subscribed';
  } else if (config.provider === 'spotify') {
    url = '/api/spotify/album/like/check?ids=' + encodeURIComponent(config.id);
    responseField = 'liked';
  }
  if (!url) return;
  apiJson(url).then(function (result) {
    if (!result || result.error || !result[responseField]) return;
    detailAlbumCollectionState[albumCollectionKey(song)] = !!result[responseField][config.id];
    syncAlbumCollectionButton(song);
  }).catch(function () {});
}
async function toggleAlbumCollection() {
  var song = detailCommentSong || currentCoverSong();
  var config = albumCollectionConfig(song);
  if (!config) { showToast('当前平台暂不支持收藏专辑'); return; }
  if (!ensureLoggedInForAction(config.provider)) return;
  var key = albumCollectionKey(song);
  var next = !detailAlbumCollectionState[key];
  var payload = { id: config.id, albumId: config.id };
  payload[config.field] = next;
  var btn = document.getElementById('album-collection-toggle');
  if (btn) btn.classList.add('busy');
  try {
    var result = await apiJson(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!result || result.error || result.success === false) throw new Error(result && (result.message || result.error) || 'ALBUM_COLLECTION_FAILED');
    detailAlbumCollectionState[key] = next;
    syncAlbumCollectionButton(song);
    showToast(next ? '专辑已收藏到' + config.label : '已取消收藏专辑');
  } catch (err) {
    showToast(/SCOPE|PERMISSION/i.test(String(err && err.message || ''))
      ? '请重新授权后再收藏专辑'
      : '专辑收藏操作失败');
  } finally {
    if (btn) btn.classList.remove('busy');
  }
}
function renderAlbumGaplessButton() {
  return '<button id="album-gapless-toggle" class="detail-action-toggle' + (detailAlbumGaplessEnabled ? ' on' : '') + '" type="button" onclick="toggleAlbumGaplessPlayback()">' +
    (detailAlbumGaplessEnabled ? '无缝衔接 开' : '无缝衔接 关') +
    '</button>';
}
function syncAlbumGaplessButton() {
  var btn = document.getElementById('album-gapless-toggle');
  if (!btn) return;
  btn.classList.toggle('on', detailAlbumGaplessEnabled);
  btn.textContent = detailAlbumGaplessEnabled ? '无缝衔接 开' : '无缝衔接 关';
}
function toggleAlbumGaplessPlayback() {
  detailAlbumGaplessUserTouched = true;
  detailAlbumGaplessEnabled = !detailAlbumGaplessEnabled;
  if (typeof setAlbumGaplessPlaybackContext === 'function') {
    setAlbumGaplessPlaybackContext(detailAlbumGaplessEnabled, detailAlbumContext, { userToggle: true });
  }
  syncAlbumGaplessButton();
  showToast(detailAlbumGaplessEnabled ? '专辑无缝衔接已开启' : '专辑无缝衔接已关闭');
}
function tagAlbumSongsForGapless(songs, context) {
  var albumKey = context && context.albumKey || '';
  return (songs || []).map(function (song, i) {
    var copy = cloneSong(song);
    copy.__albumGaplessKey = albumKey;
    copy.__albumTrackIndex = i;
    return copy;
  });
}
function renderAlbumSongList(songs) {
  detailAlbumSongs = (songs || []).map(cloneSong);
  if (!detailAlbumSongs.length) return '<div class="detail-empty">暂无专辑曲目</div>';
  return '<div class="detail-scroll">' + detailAlbumSongs.map(function (s, i) {
    var cover = songCoverSrc(s, 80);
    var coverHtml = cover ? '<img class="artist-song-cover" src="' + escHtml(cover) + '" alt="" onerror="this.style.opacity=0.18">' : '<div class="artist-song-cover"></div>';
    var actionsHtml = '<div class="artist-song-actions">' +
      '<button class="artist-song-action collect" type="button" title="收藏到歌单" aria-label="收藏到歌单" onclick="event.stopPropagation();collectAlbumDetailSong(' + i + ')">' + artistCollectTrayIconSvg() + '</button>' +
      '<button class="artist-song-action next" type="button" title="下一首播放" aria-label="下一首播放" onclick="event.stopPropagation();queueAlbumDetailSongNext(' + i + ')">' + artistNextPlusIconSvg() + '</button>' +
      '</div>';
    return '<div class="artist-song-item" onclick="playAlbumDetailSong(' + i + ')">' +
      '<div class="artist-song-rank">' + String(i + 1).padStart(2, '0') + '</div>' +
      coverHtml +
      '<div class="artist-song-main"><div class="artist-song-name">' + escHtml(s.name || '') + '</div>' +
      '<div class="artist-song-meta">' + escHtml((s.artist || '未知歌手') + (s.duration ? (' · ' + songDurationLabel(s)) : '')) + '</div></div>' +
      actionsHtml +
      '</div>';
  }).join('') + '</div>';
}
function playAlbumDetailSong(i) {
  var song = detailAlbumSongs[i];
  if (!song) return;
  var taggedSongs = tagAlbumSongsForGapless(detailAlbumSongs, detailAlbumContext);
  playQueue = taggedSongs;
  currentIdx = i;
  if (typeof setAlbumGaplessPlaybackContext === 'function') {
    setAlbumGaplessPlaybackContext(detailAlbumGaplessEnabled, detailAlbumContext);
  }
  safeRenderQueuePanel('album-detail-play');
  safeShelfRebuild('album-detail-play', true);
  closeTrackDetailModal();
  playQueueAt(i, { skipShuffleOrder: true }).catch(function (e) { console.warn('[AlbumDetailPlay]', e); });
}
function collectAlbumDetailSong(i) {
  var song = detailAlbumSongs[i];
  if (!song) return;
  collectDetailSong(song);
}
function queueAlbumDetailSongNext(i) {
  var song = detailAlbumSongs[i];
  if (!song) return;
  queueDetailSongNext(song);
}
function commentTimeLabel(ms) {
  var t = Number(ms) || 0;
  if (!t) return '';
  try {
    return new Date(t).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch (e) {
    return '';
  }
}
function renderDetailComments(comments) {
  if (!comments || !comments.length) return '<div class="detail-empty">暂无评论</div>';
  return '<div class="detail-scroll">' + comments.map(function (c) {
    var user = c.user || {};
    var avatar = user.avatar ? coverUrlWithSize(user.avatar, 64) : '';
    return '<div class="comment-item">' +
      (avatar ? '<img class="comment-avatar" src="' + avatar + '" alt="">' : '<div class="comment-avatar"></div>') +
      '<div class="comment-main"><div class="comment-meta">' + escHtml(user.nickname || '音乐用户') + (c.likedCount ? (' · ' + c.likedCount + ' 赞') : '') + (c.time ? (' · ' + escHtml(commentTimeLabel(c.time))) : '') + '</div>' +
      '<div class="comment-text">' + escHtml(c.content || '') + '</div></div>' +
      '</div>';
  }).join('') + '</div>';
}
function detailCommentsConfig(song) {
  var provider = songProviderKey(song);
  if (provider === 'qq') {
    var qqId = song.qqId || '';
    var qqMid = song.mid || song.songmid || song.id || '';
    return {
      provider: 'qq',
      title: 'QQ 音乐评论',
      readUrl: '/api/qq/song/comments?id=' + encodeURIComponent(qqId) + '&mid=' + encodeURIComponent(qqMid) + '&limit=18',
      writeUrl: '',
      canWrite: false,
    };
  }
  if (provider === 'qishui') {
    var qishuiId = song.providerSongId || song.trackId || song.id || '';
    return qishuiId ? {
      provider: 'qishui',
      title: '汽水音乐评论',
      readUrl: '/api/qishui/song/comments?id=' + encodeURIComponent(qishuiId) + '&limit=18',
      writeUrl: '/api/qishui/song/comments?id=' + encodeURIComponent(qishuiId),
      canWrite: true,
      id: qishuiId,
    } : null;
  }
  if (provider === 'netease' && song.id) {
    return {
      provider: 'netease',
      title: '网易云评论',
      readUrl: '/api/song/comments?id=' + encodeURIComponent(song.id) + '&limit=18',
      writeUrl: '/api/song/comments?id=' + encodeURIComponent(song.id),
      canWrite: true,
      id: song.id,
    };
  }
  return null;
}
function renderDetailCommentComposer(config) {
  if (!config || !config.canWrite) return '';
  return '<div class="detail-comment-compose">' +
    '<input id="detail-comment-input" type="text" maxlength="280" autocomplete="off" placeholder="写下你的评论">' +
    '<button id="detail-comment-submit" type="button" onclick="submitDetailComment()">发送</button>' +
    '</div>';
}
function loadDetailComments(song, seq) {
  var config = detailCommentsConfig(song);
  var target = document.getElementById('song-comments');
  if (!config || !config.readUrl) {
    if (target) target.innerHTML = '<div class="detail-empty">当前平台暂无评论接口</div>';
    return Promise.resolve();
  }
  if (target) target.innerHTML = '<div class="detail-loading">正在载入评论...</div>';
  return apiJson(config.readUrl).then(function (result) {
    if (seq !== trackDetailSeq) return;
    var nextTarget = document.getElementById('song-comments');
    if (nextTarget) nextTarget.innerHTML = result && !result.error
      ? renderDetailComments(result.comments || [])
      : '<div class="detail-empty">评论加载失败</div>';
    bindTrackDetailScrollers();
  }).catch(function () {
    var nextTarget = document.getElementById('song-comments');
    if (seq === trackDetailSeq && nextTarget) nextTarget.innerHTML = '<div class="detail-empty">评论加载失败</div>';
    bindTrackDetailScrollers();
  });
}
async function submitDetailComment() {
  if (detailCommentSubmitBusy || !detailCommentSong) return;
  var config = detailCommentsConfig(detailCommentSong);
  if (!config || !config.canWrite || !config.writeUrl) {
    showToast('当前平台评论只读');
    return;
  }
  if (!ensureLoggedInForAction(config.provider)) return;
  var input = document.getElementById('detail-comment-input');
  var content = String(input && input.value || '').trim();
  if (!content) { showToast('先输入评论内容'); return; }
  detailCommentSubmitBusy = true;
  var button = document.getElementById('detail-comment-submit');
  if (button) { button.disabled = true; button.textContent = '发送中'; }
  try {
    var result = await apiJson(config.writeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: config.id, content: content })
    });
    if (!result || result.error || result.success === false || result.created === false) {
      throw new Error(result && (result.message || result.error) || 'COMMENT_CREATE_FAILED');
    }
    if (input) input.value = '';
    showToast('评论已发布');
    await loadDetailComments(detailCommentSong, trackDetailSeq);
  } catch (err) {
    showToast('评论发布失败' + (err && err.message ? ': ' + err.message : ''));
  } finally {
    detailCommentSubmitBusy = false;
    if (button) { button.disabled = false; button.textContent = '发送'; }
  }
}
function renderArtistSongList(songs) {
  detailArtistSongs = (songs || []).map(cloneSong);
  if (!detailArtistSongs.length) return '<div class="detail-empty">暂无热门歌曲</div>';
  return '<div class="detail-scroll">' + detailArtistSongs.map(function (s, i) {
    var cover = songCoverSrc(s, 80);
    var coverHtml = cover ? '<img class="artist-song-cover" src="' + escHtml(cover) + '" alt="" onerror="this.style.opacity=0.18">' : '<div class="artist-song-cover"></div>';
    var actionsHtml = '<div class="artist-song-actions">' +
      '<button class="artist-song-action collect" type="button" title="收藏到歌单" aria-label="收藏到歌单" onclick="event.stopPropagation();collectArtistDetailSong(' + i + ')">' + artistCollectTrayIconSvg() + '</button>' +
      '<button class="artist-song-action next" type="button" title="下一首播放" aria-label="下一首播放" onclick="event.stopPropagation();queueArtistDetailSongNext(' + i + ')">' + artistNextPlusIconSvg() + '</button>' +
      '</div>';
    return '<div class="artist-song-item" onclick="playArtistDetailSong(' + i + ')">' +
      '<div class="artist-song-rank">' + String(i + 1).padStart(2, '0') + '</div>' +
      coverHtml +
      '<div class="artist-song-main"><div class="artist-song-name">' + escHtml(s.name || '') + '</div>' +
      '<div class="artist-song-meta">' + escHtml((s.album || '未知专辑') + (s.duration ? (' · ' + songDurationLabel(s)) : '')) + '</div></div>' +
      actionsHtml +
      '</div>';
  }).join('') + '</div>';
}
function playArtistDetailSong(i) {
  var song = detailArtistSongs[i];
  if (!song) return;
  playQueue = detailArtistSongs.map(cloneSong);
  currentIdx = i;
  safeRenderQueuePanel('artist-detail-play');
  safeShelfRebuild('artist-detail-play', true);
  closeTrackDetailModal();
  playQueueAt(i).catch(function (e) { console.warn('[ArtistDetailPlay]', e); });
}
function collectArtistDetailSong(i) {
  var song = detailArtistSongs[i];
  if (!song) return;
  collectDetailSong(song);
}
function queueArtistDetailSongNext(i) {
  var song = detailArtistSongs[i];
  if (!song) return;
  queueDetailSongNext(song);
}
function bindTrackDetailScrollers() {
  var body = document.getElementById('track-detail-body');
  bindSmoothWheelScroll(body);
  if (body) body.querySelectorAll('.detail-scroll').forEach(bindSmoothWheelScroll);
}
function closeTrackDetailModal() {
  closeGsapModal(document.getElementById('track-detail-modal'), function () {
    detailCommentSong = null;
    detailCommentSubmitBusy = false;
  });
}
function openTrackDetailModal(type, songOverride) {
  var song = songOverride || currentCoverSong();
  if (!song) { showToast('先播放或选择一首歌'); return; }
  if (immersiveMode) setImmersiveMode(false);
  var heading = document.getElementById('track-detail-heading');
  var body = document.getElementById('track-detail-body');
  if (!heading || !body) return;
  var cover = songCoverSrc(song, 180);
  var coverHtml = cover ? '<img class="detail-cover" src="' + cover + '" alt="">' : '<div class="detail-cover"></div>';
  var title = song.name || '当前歌曲';
  var artists = currentArtistNames(song);
  var seq = ++trackDetailSeq;
  detailCommentSong = song;
  if (type === 'album') {
    var albumUrl = albumDetailUrlForSong(song);
    var albumTitle = song.album || (song.type === 'podcast' ? (song.radioName || 'Podcast') : '未知专辑');
    var albumKey = currentAlbumKey(song);
    detailAlbumGaplessUserTouched = false;
    detailAlbumGaplessEnabled = typeof albumGaplessDefaultEnabledForContext === 'function'
      ? albumGaplessDefaultEnabledForContext({ albumKey: albumKey })
      : true;
    detailAlbumSongs = [];
    detailAlbumContext = {
      provider: songProviderKey(song),
      albumKey: albumKey,
      album: { name: albumTitle, cover: cover, artist: song.artist || '', id: song.albumId || song.album_id || '', albumMid: song.albumMid || song.albummid || '' },
      songs: [],
    };
    heading.textContent = '专辑详情';
    body.innerHTML =
      '<div class="detail-hero">' + coverHtml +
      '<div style="min-width:0;flex:1"><div class="detail-title" id="album-detail-title">' + escHtml(albumTitle) + '</div>' +
      '<div class="detail-sub" id="album-detail-sub">' + escHtml(song.artist || '未知歌手') + ' · ' + escHtml(songSourceLabel(song)) + '</div></div>' +
      '</div>' +
      '<div class="detail-grid">' +
      detailRow('当前歌曲', title) +
      detailRow('专辑', albumTitle) +
      detailRow('歌手', song.artist || '未知歌手') +
      detailRow('来源', songSourceLabel(song)) +
      '</div>' +
      '<div class="detail-chip-row">' +
      '<span class="detail-chip">' + escHtml(songSourceLabel(song)) + '</span>' +
      '<span class="detail-chip">按专辑顺序播放</span>' +
      '</div>' +
      '<div class="detail-section"><div class="detail-section-head"><div class="detail-section-title">专辑曲目</div><div class="detail-section-actions">' + renderAlbumCollectionButton(song) + renderAlbumGaplessButton() + '</div></div><div id="album-song-list">' +
      (albumUrl ? '<div class="detail-loading">正在载入专辑曲目...</div>' : '<div class="detail-empty">' + escHtml(albumDetailMissingText(song)) + '</div>') +
      '</div></div>';
    syncAlbumCollectionState(song);
    if (albumUrl) {
      apiJson(albumUrl).then(function (r) {
        if (seq !== trackDetailSeq) return;
        var target = document.getElementById('album-song-list');
        if (!r || r.error) {
          if (target) target.innerHTML = '<div class="detail-empty">专辑详情加载失败</div>';
          bindTrackDetailScrollers();
          return;
        }
        var albumInfo = r.album || {};
        var songs = (r.songs || []).map(cloneSong);
        detailAlbumContext = {
          provider: r.provider || songProviderKey(song),
          albumKey: albumKey || currentAlbumKey(songs[0]) || currentAlbumKey(song),
          album: albumInfo,
          songs: songs,
        };
        if (!detailAlbumContext.albumKey && albumInfo) {
          detailAlbumContext.albumKey = (r.provider || songProviderKey(song)) + ':' + (albumInfo.albumId || albumInfo.id || albumInfo.albumMid || albumInfo.mid || albumTitle);
        }
        if (!detailAlbumGaplessUserTouched && typeof albumGaplessDefaultEnabledForContext === 'function') {
          detailAlbumGaplessEnabled = albumGaplessDefaultEnabledForContext(detailAlbumContext);
        }
        if (detailAlbumGaplessEnabled && typeof setAlbumGaplessPlaybackContext === 'function') {
          setAlbumGaplessPlaybackContext(true, detailAlbumContext);
        }
        var titleEl = document.getElementById('album-detail-title');
        var subEl = document.getElementById('album-detail-sub');
        if (titleEl && albumInfo.name) titleEl.textContent = albumInfo.name;
        if (subEl) subEl.textContent = (albumInfo.artist || song.artist || '未知歌手') + ' · ' + songSourceLabel(song);
        var detailCover = body.querySelector('.detail-cover');
        var albumCover = albumInfo.cover || (songs[0] && songs[0].cover) || cover;
        if (detailCover && albumCover) {
          if (detailCover.tagName === 'IMG') detailCover.src = coverUrlWithSize(albumCover, 180);
          else {
            detailCover.style.backgroundImage = 'url("' + coverUrlWithSize(albumCover, 180).replace(/"/g, '\\"') + '")';
            detailCover.style.backgroundSize = 'cover';
            detailCover.style.backgroundPosition = 'center';
          }
        }
        if (target) target.innerHTML = renderAlbumSongList(songs);
        syncAlbumGaplessButton();
        bindTrackDetailScrollers();
      }).catch(function () {
        var target = document.getElementById('album-song-list');
        if (seq === trackDetailSeq && target) target.innerHTML = '<div class="detail-empty">专辑详情加载失败</div>';
        bindTrackDetailScrollers();
      });
    }
  } else if (type === 'artist') {
    var artistId = currentArtistId(song);
    var qqArtistMid = currentQQArtistMid(song);
    var artistDetailUrl = artistId
      ? ('/api/artist/detail?id=' + encodeURIComponent(artistId) + '&limit=36')
      : (qqArtistMid ? ('/api/qq/artist/detail?mid=' + encodeURIComponent(qqArtistMid) + '&limit=36') : '');
    var artistName = artists.join(' / ') || song.artist || '未知歌手';
    var artistNamesForMatch = artists.length ? artists : (song.artist ? [song.artist] : []);
    var artistInitial = artistName && artistName !== '未知歌手' ? artistName.slice(0, 1) : '歌';
    var artistCoverHtml = '<div id="artist-detail-cover" class="detail-cover detail-artist-avatar">' + escHtml(artistInitial) + '</div>';
    var artistEmptyText = songProviderKey(song) === 'qq'
      ? '当前 QQ 歌曲缺少 singerMid，无法打开 QQ 歌手主页。'
      : '当前歌曲缺少可用的歌手主页信息';
    var artistLoadingText = songProviderKey(song) === 'qq' ? '正在载入 QQ 歌手主页...' : '正在载入歌手主页...';
    heading.textContent = '歌手详情';
    body.innerHTML =
      '<div class="detail-hero">' + artistCoverHtml +
      '<div style="min-width:0;flex:1"><div class="detail-title">' + escHtml(artistName) + '</div>' +
      '<div class="detail-sub">来自当前播放 · ' + escHtml(title) + '</div></div>' +
      '</div>' +
      '<div class="detail-grid">' +
      detailRow('当前歌曲', title) +
      detailRow('关联歌手', artistName) +
      detailRow('所属专辑', song.album || (song.type === 'podcast' ? (song.radioName || 'Podcast') : '未知')) +
      detailRow('来源', songSourceLabel(song)) +
      '</div>' +
      '<div class="detail-chip-row">' + (artists.length ? artists.map(function (name) { return '<span class="detail-chip">' + escHtml(name) + '</span>'; }).join('') : '<span class="detail-chip">未知歌手</span>') + '</div>' +
      '<div class="detail-section"><div class="detail-section-head"><div class="detail-section-title">热门歌曲</div></div><div id="artist-hot-songs">' + (artistDetailUrl ? '<div class="detail-loading">' + escHtml(artistLoadingText) + '</div>' : '<div class="detail-empty">' + escHtml(artistEmptyText) + '</div>') + '</div></div>';
    if (artistDetailUrl) {
      apiJson(artistDetailUrl).then(function (r) {
        if (seq !== trackDetailSeq) return;
        var returnedName = r && r.artist && r.artist.name;
        var target = document.getElementById('artist-hot-songs');
        if (returnedName && artistNamesForMatch.length && !artistNameMatches(artistNamesForMatch, returnedName)) {
          if (target) target.innerHTML = '<div class="detail-empty">歌手资料与当前歌曲不匹配，已停止展示错误主页。</div>';
          bindTrackDetailScrollers();
          return;
        }
        if (returnedName) {
          var titleEl = body.querySelector('.detail-title');
          if (titleEl) titleEl.textContent = r.artist.name;
        }
        if (r && r.artist && r.artist.avatar) {
          var avatarEl = document.getElementById('artist-detail-cover');
          if (avatarEl) {
            avatarEl.textContent = '';
            avatarEl.style.backgroundImage = 'url("' + coverUrlWithSize(r.artist.avatar, 180).replace(/"/g, '\\"') + '")';
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.style.backgroundPosition = 'center';
          }
        }
        if (target) target.innerHTML = r && !r.error ? renderArtistSongList(r.songs || []) : '<div class="detail-empty">歌手主页加载失败</div>';
        bindTrackDetailScrollers();
      }).catch(function () {
        var target = document.getElementById('artist-hot-songs');
        if (seq === trackDetailSeq && target) target.innerHTML = '<div class="detail-empty">歌手主页加载失败</div>';
        bindTrackDetailScrollers();
      });
    }
  } else {
    heading.textContent = '歌曲详情';
    var commentConfig = detailCommentsConfig(song);
    var detailCommentTitle = commentConfig ? commentConfig.title : (songSourceLabel(song) + '评论');
    var detailCanLoadComments = !!(commentConfig && commentConfig.readUrl);
    var detailEmptyText = detailCanLoadComments ? '暂无评论' : '当前平台暂无评论接口';
    body.innerHTML =
      '<div class="detail-hero">' + coverHtml +
      '<div style="min-width:0;flex:1"><div class="detail-title">' + escHtml(title) + '</div>' +
      '<div class="detail-sub">' + escHtml(song.artist || (song.type === 'local' ? '本地文件' : '未知歌手')) + '</div></div>' +
      '</div>' +
      '<div class="detail-grid">' +
      detailRow('歌曲名', title) +
      detailRow('歌手', song.artist || '未知歌手') +
      detailRow('专辑', song.album || (song.type === 'podcast' ? (song.radioName || 'Podcast') : '未知')) +
      detailRow('时长', songDurationLabel(song)) +
      detailRow('来源', songSourceLabel(song)) +
      detailRow('歌词源', lyricSourceMode === 'custom' ? '自定义歌词' : (lyricsTimingSource === 'fallback' ? '占位歌词' : '原词')) +
      '</div>' +
      '<div class="detail-chip-row">' +
      '<span class="detail-chip">' + escHtml(songSourceLabel(song)) + '</span>' +
      (isSongLiked(song) ? '<span class="detail-chip">红心喜欢</span>' : '') +
      (getCustomCoverForSong(song) ? '<span class="detail-chip">自定义封面</span>' : '') +
      (hasCustomLyricForSong(song) ? '<span class="detail-chip">自定义歌词</span>' : '') +
      '</div>' +
      '<div class="detail-section"><div class="detail-section-head"><div class="detail-section-title">' + detailCommentTitle + '</div></div>' +
      renderDetailCommentComposer(commentConfig) +
      '<div id="song-comments">' + (detailCanLoadComments ? '<div class="detail-loading">正在载入评论...</div>' : '<div class="detail-empty">' + detailEmptyText + '</div>') + '</div></div>';
    if (detailCanLoadComments) {
      loadDetailComments(song, seq);
    }
  }
  bindTrackDetailScrollers();
  openGsapModal(document.getElementById('track-detail-modal'));
}
function openArtistDetailForSong(song) {
  if (!song) { showToast('未找到歌手信息'); return; }
  if (currentArtistId(song) || currentQQArtistMid(song)) {
    openTrackDetailModal('artist', song);
    return;
  }
  var artist = String(song.artist || '').split(/\s*\/\s*|\s*,\s*|、|&| feat\.? | ft\.? /i).filter(Boolean)[0] || '';
  if (artist) {
    resolveArtistSongForDetail(song, artist).then(function (found) {
      openTrackDetailModal('artist', found || Object.assign({}, song, { artist: artist }));
    }).catch(function () {
      openTrackDetailModal('artist', Object.assign({}, song, { artist: artist }));
    });
    showToast('正在查找歌手主页: ' + artist);
  } else {
    showToast('当前歌曲缺少歌手主页信息');
  }
}
function resolveArtistSongForDetail(song, artist) {
  var provider = songProviderKey(song) === 'qq' ? 'qq' : 'netease';
  var url = provider === 'qq'
    ? '/api/qq/search?keywords=' + encodeURIComponent(artist) + '&limit=8'
    : '/api/search?keywords=' + encodeURIComponent(artist) + '&limit=10';
  return apiJson(url).then(function (r) {
    var songs = (r && r.songs) || [];
    for (var i = 0; i < songs.length; i++) {
      var candidate = songs[i];
      if (!candidate) continue;
      if (!artistNameMatches([artist], candidate.artist || '')) continue;
      if (currentArtistId(candidate) || currentQQArtistMid(candidate)) return candidate;
    }
    return null;
  });
}
function setCustomCoverForCurrent(dataUrl, opts) {
  if (!dataUrl) return;
  var song = currentCoverSong();
  var saved = false;
  var hasKey = false;
  if (song) {
    var key = songCustomCoverKey(song);
    song.customCover = dataUrl;
    if (key) {
      hasKey = true;
      customCoverMap[key] = dataUrl;
      saved = saveCustomCoverMap();
      for (var i = 0; i < playQueue.length; i++) {
        if (songCustomCoverKey(playQueue[i]) === key) playQueue[i].customCover = dataUrl;
      }
      if (currentLocalSong && songCustomCoverKey(currentLocalSong) === key) currentLocalSong.customCover = dataUrl;
    }
  }
  applyCoverDataUrl(dataUrl, opts);
  safeRenderQueuePanel('custom-cover-apply', { scrollCurrent: miniQueueOpen });
  safeShelfRebuild('custom-cover-apply');
  updateCustomCoverButton();
  showToast(song ? (!hasKey ? '封面已应用' : (saved ? '封面已保存' : '封面已应用，存储空间不足')) : '已应用临时封面');
}
function updateCustomCoverButton() {
  var btn = document.getElementById('clear-cover-btn');
  var hasCover = !!getCustomCoverForSong(currentCoverSong());
  var area = document.getElementById('search-area');
  if (area) area.classList.toggle('has-cover-action', hasCover);
  if (!btn) return;
  btn.classList.toggle('has-cover', hasCover);
  btn.title = hasCover ? '取消自定义封面' : '当前没有自定义封面';
  btn.setAttribute('aria-label', btn.title);
}
function clearCustomCoverForCurrent() {
  var song = currentCoverSong();
  if (!song) {
    showToast('先播放或选择一首歌');
    updateCustomCoverButton();
    return;
  }
  var custom = getCustomCoverForSong(song);
  if (!custom) {
    showToast('当前没有自定义封面');
    updateCustomCoverButton();
    return;
  }
  var key = songCustomCoverKey(song);
  if (key && customCoverMap[key]) {
    delete customCoverMap[key];
    saveCustomCoverMap();
  }
  delete playlistCoverCache[custom];
  delete song.customCover;
  if (key) {
    for (var i = 0; i < playQueue.length; i++) {
      if (songCustomCoverKey(playQueue[i]) === key) delete playQueue[i].customCover;
    }
  }
  if (key && currentLocalSong && songCustomCoverKey(currentLocalSong) === key) delete currentLocalSong.customCover;
  if (currentIdx >= 0 && playQueue[currentIdx] && playQueue[currentIdx].cover) loadCoverFromUrl(coverUrlWithSize(playQueue[currentIdx].cover, 400));
  else loadCoverFromUrl('');
  safeRenderQueuePanel('custom-cover-clear', { scrollCurrent: miniQueueOpen });
  safeShelfRebuild('custom-cover-clear');
  updateCustomCoverButton();
  showToast('已恢复默认封面');
}
function readCustomLyricMap() {
  try {
    var raw = JSON.parse(localStorage.getItem(CUSTOM_LYRIC_STORE_KEY) || '{}') || {};
    var out = {};
    Object.keys(raw).forEach(function (key) {
      var item = raw[key];
      if (typeof item === 'string') out[key] = { text: item, updatedAt: 0 };
      else if (item && typeof item.text === 'string') out[key] = { text: item.text, updatedAt: item.updatedAt || 0 };
    });
    return out;
  } catch (e) {
    return {};
  }
}
function saveCustomLyricMap() {
  try {
    localStorage.setItem(CUSTOM_LYRIC_STORE_KEY, JSON.stringify(customLyricMap || {}));
    return true;
  } catch (e) {
    console.warn('custom lyric save failed:', e);
    return false;
  }
}
function readCustomLyricPrefs() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_LYRIC_PREF_STORE_KEY) || '{}') || {}; }
  catch (e) { return {}; }
}
function saveCustomLyricPrefs() {
  try { localStorage.setItem(CUSTOM_LYRIC_PREF_STORE_KEY, JSON.stringify(customLyricPrefs || {})); } catch (e) { }
}
function songCustomLyricKey(song) {
  return songCustomCoverKey(song);
}
function currentLyricSong() {
  if (currentIdx >= 0 && playQueue[currentIdx]) return playQueue[currentIdx];
  return currentLocalSong || null;
}
function getCustomLyricEntry(song) {
  var key = songCustomLyricKey(song);
  return key && customLyricMap[key] ? customLyricMap[key] : null;
}
function hasCustomLyricForSong(song) {
  var entry = getCustomLyricEntry(song);
  return !!(entry && String(entry.text || '').trim());
}
function cloneLyricLine(line) {
  var copy = Object.assign({}, line || {});
  if (line && Array.isArray(line.words)) copy.words = line.words.map(function (w) { return Object.assign({}, w); });
  return copy;
}
function cloneLyricLines(lines) {
  return (Array.isArray(lines) ? lines : []).map(cloneLyricLine);
}
function lyricLineSignaturePart(line) {
  line = line || {};
  var words = Array.isArray(line.words) ? line.words : [];
  var firstWord = words[0] || {};
  var lastWord = words[words.length - 1] || {};
  return [
    Math.round((Number(line.t) || 0) * 1000),
    Math.round((Number(line.duration) || 0) * 1000),
    String(line.text || ''),
    line.fallback ? 1 : 0,
    String(line.source || ''),
    words.length,
    Math.round((Number(firstWord.t) || 0) * 1000),
    Math.round((Number(firstWord.d) || 0) * 1000),
    Math.round((Number(lastWord.t) || 0) * 1000),
    Math.round((Number(lastWord.d) || 0) * 1000),
    String(line.translation || '')
  ].join('\u001f');
}
function lyricLinesSignature(lines) {
  return (Array.isArray(lines) ? lines : []).map(lyricLineSignaturePart).join('\u001e');
}
function currentAppliedLyricRenderSignature() {
  var song = typeof currentLyricSong === 'function' ? currentLyricSong() : null;
  var songKey = songCustomLyricKey(song) || (song && (song.provider || song.source || '') + ':' + (song.id || song.mid || song.hash || song.name || '')) || '';
  return [
    songKey,
    lyricSourceMode || 'original',
    lyricsHasNativeKaraoke ? 1 : 0,
    lyricsTimingSource || '',
    lyricsTranslationSource || '',
    lyricLinesSignature(lyricsLines),
    lyricLinesSignature(lyricsTranslationLines)
  ].join('\u001d');
}
function preparedLyricStateForApply(lines, hasNativeKaraoke, timingSource, translationLines, translationSource) {
  var nextLines = Array.isArray(lines) ? lines : [];
  var nextTranslations = Array.isArray(translationLines) ? translationLines : [];
  var nextTiming = timingSource || 'fallback';
  var nextTranslationSource = translationSource || (nextTranslations.length ? 'translation' : 'none');
  if (!nextLines.length) nextLines = withLyricFallback([]);
  if (nextLines.length && nextLines[0].fallback) nextTiming = 'fallback';
  return {
    lines: nextLines,
    hasNativeKaraoke: !!hasNativeKaraoke,
    timingSource: nextTiming,
    translationLines: nextTranslations,
    translationSource: nextTranslationSource,
    signature: lyricStateRenderSignature(nextLines, hasNativeKaraoke, nextTiming, nextTranslations, nextTranslationSource)
  };
}
function lyricStateRenderSignature(lines, hasNativeKaraoke, timingSource, translationLines, translationSource) {
  var song = typeof currentLyricSong === 'function' ? currentLyricSong() : null;
  var songKey = songCustomLyricKey(song) || (song && (song.provider || song.source || '') + ':' + (song.id || song.mid || song.hash || song.name || '')) || '';
  return [
    songKey,
    lyricSourceMode || 'original',
    hasNativeKaraoke ? 1 : 0,
    timingSource || '',
    translationSource || '',
    lyricLinesSignature(lines),
    lyricLinesSignature(translationLines)
  ].join('\u001d');
}
function skipSameLyricStateRender(prepared, renderOptions, reason) {
  if (!renderOptions || !renderOptions.preserveSame || !prepared || !prepared.signature) return false;
  if (prepared.signature !== currentAppliedLyricRenderSignature()) return false;
  if (typeof markStageLyricsPlaybackResume === 'function') markStageLyricsPlaybackResume(renderOptions.reason || reason || 'same-lyrics-state');
  return true;
}
function setOriginalLyricsState(lines, hasNativeKaraoke, timingSource, translationLines, translationSource) {
  originalLyricsState = {
    lines: cloneLyricLines(lines || []),
    hasNativeKaraoke: !!hasNativeKaraoke,
    timingSource: timingSource || 'fallback',
    translationLines: cloneLyricLines(translationLines || []),
    translationSource: translationSource || 'none'
  };
}
function applyLyricsState(lines, hasNativeKaraoke, timingSource, translationLines, translationSource, renderOptions) {
  var prepared = preparedLyricStateForApply(lines, hasNativeKaraoke, timingSource, translationLines, translationSource);
  if (skipSameLyricStateRender(prepared, renderOptions, 'applyLyricsState')) {
    updateCustomLyricControls();
    return;
  }
  lyricsHasNativeKaraoke = prepared.hasNativeKaraoke;
  lyricsTimingSource = prepared.timingSource;
  lyricsTranslationLines = cloneLyricLines(prepared.translationLines);
  lyricsTranslationSource = prepared.translationSource;
  lyricsLines = cloneLyricLines(prepared.lines);
  renderLyrics(renderOptions || {});
  updateCustomLyricControls();
}
function applyOriginalLyricsState(renderOptions) {
  lyricSourceMode = 'original';
  applyLyricsState(originalLyricsState.lines, originalLyricsState.hasNativeKaraoke, originalLyricsState.timingSource, originalLyricsState.translationLines, originalLyricsState.translationSource, renderOptions);
}
function parseCustomLyricText(text) {
  var raw = String(text || '').trim();
  if (!raw) return [];
  var lrcLines = parseLyricText(raw);
  if (lrcLines.length && !lrcLines.every(function (line) { return isNoLyricText(line.text); })) {
    return lrcLines.map(function (line) {
      var copy = cloneLyricLine(line);
      copy.source = 'custom-lrc';
      return copy;
    });
  }
  var rows = raw.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(function (line) { return line && !isNoLyricText(line); });
  if (!rows.length) return [];
  var duration = audio && isFinite(audio.duration) && audio.duration > 8 ? audio.duration : 0;
  var gap = duration ? Math.max(2.8, Math.min(7.2, duration / Math.max(1, rows.length))) : 4.8;
  return finalizeLyricLineDurations(rows.map(function (line, i) {
    return { t: i * gap, duration: gap, text: line, source: 'custom-text', charCount: Math.max(1, line.length) };
  }));
}
function applyCustomLyricState(song, silent, renderOptions) {
  song = song || currentLyricSong();
  var entry = getCustomLyricEntry(song);
  if (!entry || !String(entry.text || '').trim()) {
    if (!silent) openCustomLyricModal();
    updateCustomLyricControls();
    return false;
  }
  var lines = parseCustomLyricText(entry.text);
  if (!lines.length) {
    if (!silent) showToast('自定义歌词内容为空');
    updateCustomLyricControls();
    return false;
  }
  lyricSourceMode = 'custom';
  var prepared = preparedLyricStateForApply(lines, false, lines[0] && lines[0].source === 'custom-lrc' ? 'custom-lrc' : 'custom-text', [], 'none');
  if (skipSameLyricStateRender(prepared, renderOptions, 'applyCustomLyricState')) {
    updateCustomLyricControls();
    return true;
  }
  lyricsHasNativeKaraoke = prepared.hasNativeKaraoke;
  lyricsTimingSource = prepared.timingSource;
  lyricsTranslationLines = cloneLyricLines(prepared.translationLines);
  lyricsTranslationSource = prepared.translationSource;
  lyricsLines = cloneLyricLines(prepared.lines);
  renderLyrics(renderOptions || {});
  updateCustomLyricControls();
  return true;
}
function preferredLyricSourceForSong(song) {
  var key = songCustomLyricKey(song);
  var hasCustom = hasCustomLyricForSong(song);
  if (!hasCustom) return 'original';
  var pref = key ? customLyricPrefs[key] : '';
  if (pref === 'custom') return 'custom';
  if (pref === 'original') return 'original';
  return originalLyricsState.timingSource === 'fallback' ? 'custom' : 'original';
}
function applyPreferredLyricsForCurrent(silent) {
  var song = currentLyricSong();
  var renderOptions = { preserveSame: true, reason: 'applyPreferredLyricsForCurrent' };
  if (preferredLyricSourceForSong(song) === 'custom' && applyCustomLyricState(song, true, renderOptions)) return;
  applyOriginalLyricsState(renderOptions);
  if (!silent) updateCustomLyricControls();
}
function setLyricSourceMode(mode, silent) {
  var song = currentLyricSong();
  var key = songCustomLyricKey(song);
  mode = mode === 'custom' ? 'custom' : 'original';
  if (mode === 'custom') {
    if (!applyCustomLyricState(song, true)) {
      if (!silent) openCustomLyricModal();
      return false;
    }
    if (!silent) openCustomLyricModal();
  } else {
    applyOriginalLyricsState();
  }
  if (key) {
    customLyricPrefs[key] = mode;
    saveCustomLyricPrefs();
  }
  if (!silent) showToast(mode === 'custom' ? '已切换到自定义歌词' : '已切换到原歌词');
  updateCustomLyricControls();
  return true;
}
function updateCustomLyricControls() {
  var song = currentLyricSong();
  var hasCustom = hasCustomLyricForSong(song);
  var originalBtn = document.getElementById('lyric-source-original');
  var customBtn = document.getElementById('lyric-source-custom');
  if (originalBtn) {
    originalBtn.classList.toggle('active', lyricSourceMode !== 'custom');
    originalBtn.title = '使用网易云或本地解析歌词';
  }
  if (customBtn) {
    customBtn.classList.toggle('active', lyricSourceMode === 'custom');
    customBtn.classList.toggle('has-custom', hasCustom);
    customBtn.title = hasCustom ? '打开并编辑自定义歌词' : '新增自定义歌词';
  }
}
function updateLyricDisplayModeControls() {
  var mode = normalizeLyricDisplayMode(fx && fx.lyricDisplayMode);
  document.querySelectorAll('#lyric-display-mode-seg button').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}
function updateLyricTranslationModeControls() {
  var mode = normalizeLyricTranslationMode(fx && fx.lyricTranslationMode);
  document.querySelectorAll('#lyric-translation-mode-seg button').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.translation === mode);
  });
}
function updateLyricMotionStyleControls() {
  var style = normalizeLyricMotionStyle(fx && fx.lyricMotionStyle);
  var seg = document.getElementById('lyric-motion-style-seg');
  if (seg) seg.classList.toggle('glitch-selected', style === 'glitch');
  document.querySelectorAll('#lyric-motion-style-seg button').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.motion === style);
  });
  updateLyricGlitchControls();
}
function updateLyricGlitchControls() {
  var style = normalizeLyricMotionStyle(fx && fx.lyricMotionStyle);
  var panel = document.getElementById('lyric-glitch-controls');
  if (panel) panel.classList.toggle('show', style === 'glitch');
  var bindBtn = document.getElementById('lyric-glitch-camera-bind');
  if (bindBtn) {
    bindBtn.classList.toggle('active', !!(fx && fx.lyricGlitchCameraBind));
    bindBtn.textContent = fx && fx.lyricGlitchCameraBind ? '已跟随鼓点故障' : '跟随鼓点故障';
  }
}
function toggleLyricGlitchCameraBind() {
  fx.lyricGlitchCameraBind = !fx.lyricGlitchCameraBind;
  updateLyricGlitchControls();
  refreshStageLyricDisplayMode();
  saveLyricLayout({ user: true, reason: 'lyricGlitchCameraBind' });
  showToast(fx.lyricGlitchCameraBind ? '故障歌词已跟随鼓点' : '故障歌词已取消鼓点跟随');
}
function refreshStageLyricDisplayMode() {
  refreshCurrentLyricStyle();
}
function refreshStageLyricVisualOptions() {
  refreshStageLyricDisplayMode();
  pushDesktopLyricsState(true);
}
function setLyricDisplayMode(mode) {
  fx.lyricDisplayMode = normalizeLyricDisplayMode(mode);
  updateLyricDisplayModeControls();
  refreshStageLyricDisplayMode();
  saveLyricLayout({ user: true, reason: 'lyricDisplayMode' });
  showToast('歌词行数已切换');
}
function setLyricTranslationMode(mode) {
  fx.lyricTranslationMode = normalizeLyricTranslationMode(mode);
  updateLyricTranslationModeControls();
  refreshStageLyricDisplayMode();
  saveLyricLayout({ user: true, reason: 'lyricTranslationMode' });
  showToast('双语翻译已切换');
}
function setLyricMotionStyle(style) {
  fx.lyricMotionStyle = normalizeLyricMotionStyle(style);
  updateLyricMotionStyleControls();
  refreshStageLyricDisplayMode();
  saveLyricLayout({ user: true, reason: 'lyricMotionStyle' });
  showToast('歌词动画已切换');
}
function setCustomLyricStatus(text, tone) {
  var el = document.getElementById('custom-lyric-status');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('good', tone === 'good');
  el.classList.toggle('fail', tone === 'fail');
}
function openCustomLyricModal() {
  var song = currentLyricSong();
  if (!song) {
    showToast('先播放或选择一首歌');
    return;
  }
  if (immersiveMode) setImmersiveMode(false);
  var entry = getCustomLyricEntry(song);
  var title = document.getElementById('custom-lyric-title');
  var sub = document.getElementById('custom-lyric-sub');
  var input = document.getElementById('custom-lyric-input');
  if (title) title.textContent = song.name || '当前歌曲';
  if (sub) sub.textContent = (song.artist || (song.type === 'podcast' ? 'Podcast' : '')) + (entry ? ' · 已保存自定义歌词' : ' · 可粘贴 LRC 或逐行输入');
  if (input) input.value = entry ? (entry.text || '') : '';
  setCustomLyricStatus(entry ? '已读取本地自定义歌词' : '提示：带 [00:12.00] 时间轴会更精准；纯文本会自动铺开', entry ? 'good' : '');
  openGsapModal(document.getElementById('custom-lyric-modal'));
  setTimeout(function () { if (input) input.focus(); }, 120);
}
function closeCustomLyricModal() {
  closeGsapModal(document.getElementById('custom-lyric-modal'));
}
function saveCustomLyricForCurrent() {
  var song = currentLyricSong();
  var key = songCustomLyricKey(song);
  var input = document.getElementById('custom-lyric-input');
  var text = input ? String(input.value || '').trim() : '';
  if (!song || !key) {
    setCustomLyricStatus('请先播放或选择一首歌', 'fail');
    showToast('先播放或选择一首歌');
    return;
  }
  if (!text) {
    setCustomLyricStatus('请输入歌词内容', 'fail');
    return;
  }
  var lines = parseCustomLyricText(text);
  if (!lines.length) {
    setCustomLyricStatus('没有识别到可显示的歌词行', 'fail');
    return;
  }
  customLyricMap[key] = { text: text, updatedAt: Date.now() };
  customLyricPrefs[key] = 'custom';
  var saved = saveCustomLyricMap();
  saveCustomLyricPrefs();
  applyCustomLyricState(song, true);
  setCustomLyricStatus(saved ? ('已保存 ' + lines.length + ' 行，并切换为自定义歌词') : '已应用，但本地存储空间不足', saved ? 'good' : 'fail');
  showToast(saved ? '自定义歌词已保存' : '自定义歌词已应用');
  setTimeout(function () { closeCustomLyricModal(); }, 520);
}
function deleteCustomLyricForCurrent() {
  var song = currentLyricSong();
  var key = songCustomLyricKey(song);
  if (!song || !key) {
    setCustomLyricStatus('请先播放或选择一首歌', 'fail');
    return;
  }
  if (!customLyricMap[key]) {
    setCustomLyricStatus('当前歌曲没有自定义歌词', 'fail');
    return;
  }
  delete customLyricMap[key];
  delete customLyricPrefs[key];
  saveCustomLyricMap();
  saveCustomLyricPrefs();
  applyOriginalLyricsState();
  var input = document.getElementById('custom-lyric-input');
  if (input) input.value = '';
  setCustomLyricStatus('已删除，恢复原歌词', 'good');
  showToast('已恢复原歌词');
}
var QISHUI_LIKE_ACCOUNT_ACTIONS_ENABLED = true;
var QISHUI_PLAYLIST_WRITE_ACTIONS_ENABLED = true;
var SONG_ACCOUNT_ACTION_ADAPTERS = {
  netease: {
    provider: 'netease',
    label: '网易云音乐',
    like: true,
    collect: true,
    createPlaylist: true,
    likeCheckUrl: '/api/song/like/check',
    likeCheckParam: 'ids',
    likeUrl: '/api/song/like',
    playlistAddUrl: '/api/playlist/add-song',
    playlistCreateUrl: '/api/playlist/create',
    playlistTracksUrl: '/api/playlist/tracks'
  },
  kugou: {
    provider: 'kugou',
    label: '酷狗音乐',
    like: true,
    collect: true,
    createPlaylist: false,
    likeCheckUrl: '/api/kugou/song/like/check',
    likeCheckParam: 'hashes',
    likeUrl: '/api/kugou/song/like',
    playlistAddUrl: '/api/kugou/playlist/add-song',
    playlistCreateUrl: '',
    playlistTracksUrl: '/api/kugou/playlist/tracks'
  },
  spotify: {
    provider: 'spotify',
    label: 'Spotify',
    like: true,
    collect: true,
    createPlaylist: true,
    likeCheckUrl: '/api/spotify/song/like/check',
    likeCheckParam: 'ids',
    likeUrl: '/api/spotify/song/like',
    playlistAddUrl: '/api/spotify/playlist/add-song',
    playlistCreateUrl: '/api/spotify/playlist/create',
    playlistTracksUrl: '/api/spotify/playlist/tracks'
  },
  qishui: {
    provider: 'qishui',
    label: '汽水音乐',
    like: QISHUI_LIKE_ACCOUNT_ACTIONS_ENABLED,
    collect: QISHUI_PLAYLIST_WRITE_ACTIONS_ENABLED,
    createPlaylist: false,
    likeCheckUrl: QISHUI_LIKE_ACCOUNT_ACTIONS_ENABLED ? '/api/qishui/song/like/check' : '',
    likeCheckParam: 'ids',
    likeUrl: QISHUI_LIKE_ACCOUNT_ACTIONS_ENABLED ? '/api/qishui/song/like' : '',
    playlistAddUrl: QISHUI_PLAYLIST_WRITE_ACTIONS_ENABLED ? '/api/qishui/playlist/add-song' : '',
    playlistCreateUrl: '',
    playlistTracksUrl: '/api/qishui/playlist/tracks'
  },
  qq: {
    provider: 'qq',
    label: 'QQ 音乐',
    like: false,
    collect: false,
    createPlaylist: false,
    readOnly: true
  }
};
function songAccountProvider(song) {
  if (!song || song.type === 'local' || song.type === 'podcast' || song.source === 'podcast') return 'local';
  if (typeof songProviderKey === 'function') return songProviderKey(song);
  if (song.provider === 'spotify' || song.source === 'spotify' || song.type === 'spotify' || song.spotifyId || song.spotifyUri) return 'spotify';
  if (song.provider === 'qq' || song.source === 'qq' || song.type === 'qq') return 'qq';
  if (song.provider === 'qishui' || song.source === 'qishui' || song.type === 'qishui') return 'qishui';
  if (song.provider === 'kugou' || song.source === 'kugou' || song.type === 'kugou' || song.hash || song.audioHash) return 'kugou';
  return 'netease';
}
function songAccountAdapter(songOrProvider) {
  var provider = typeof songOrProvider === 'string' ? songOrProvider : songAccountProvider(songOrProvider);
  return SONG_ACCOUNT_ACTION_ADAPTERS[provider] || null;
}
function songAccountIdentityValues(song, provider) {
  song = song || {};
  provider = provider || songAccountProvider(song);
  var raw = [];
  if (provider === 'kugou') {
    raw = [song.hash, song.audioHash, song.fileHash, song.providerSongId, song.id];
  } else if (provider === 'spotify') {
    raw = [song.spotifyId, song.providerSongId, song.id];
    var uri = String(song.spotifyUri || song.uri || '');
    if (/^spotify:track:/i.test(uri)) raw.push(uri.split(':').pop());
  } else if (provider === 'qishui') {
    raw = [song.providerSongId, song.trackId, song.track_id, song.id];
  } else {
    raw = [song.id];
  }
  var seen = Object.create(null);
  return raw.map(function (value) {
    var normalized = String(value == null ? '' : value).trim();
    return provider === 'kugou' ? normalized.toLowerCase() : normalized;
  }).filter(function (value) {
    if (!value || seen[value]) return false;
    seen[value] = true;
    return true;
  });
}
function songAccountId(song, provider) {
  return songAccountIdentityValues(song, provider)[0] || '';
}
function songAccountStateKey(song) {
  var provider = songAccountProvider(song);
  var id = songAccountId(song, provider);
  return provider && id ? (provider + ':' + id) : '';
}
function playlistAccountProvider(playlist) {
  var provider = String(playlist && (playlist.provider || playlist.source) || '').toLowerCase();
  return /^(mineradio|netease|qq|kugou|qishui|spotify)$/.test(provider) ? provider : 'netease';
}
function songAccountLoginStatus(provider) {
  if (provider === 'spotify') return spotifyLoginStatus || {};
  if (provider === 'qishui') return qishuiLoginStatus || {};
  if (provider === 'kugou') return kugouLoginStatus || {};
  if (provider === 'qq') return qqLoginStatus || {};
  return loginStatus || {};
}
function isSongAccountLoggedIn(provider) {
  var status = songAccountLoginStatus(provider);
  if (provider === 'kugou') return !!(status.loggedIn && status.playbackKeyReady);
  if (provider === 'qishui') return !!(status.loggedIn && (status.webSession || status.cookieReady));
  return !!status.loggedIn;
}
function songAccountUnsupportedMessage(provider, action) {
  var adapter = songAccountAdapter(provider);
  if (adapter && adapter.readOnly) return adapter.label + '当前仅支持读取账号收藏，暂不支持写回';
  if (provider === 'qishui') return '汽水音乐当前会话暂不支持此账号操作';
  if (provider === 'local') return '本地文件暂不支持同步' + (action === 'collect' ? '到歌单' : '红心');
  return (adapter && adapter.label || '当前平台') + '暂不支持此操作';
}
function isCloudSong(song) {
  return !!(song && song.id && songAccountProvider(song) === 'netease');
}
function isSongLiked(song) {
  var key = songAccountStateKey(song);
  return !!(key && likedSongMap[key]);
}
function ensureLoggedInForAction(provider) {
  provider = provider || 'netease';
  if (isSongAccountLoggedIn(provider)) return true;
  var adapter = songAccountAdapter(provider);
  showToast('登录' + (adapter && adapter.label || '对应平台') + '后可同步账号收藏');
  showLoginModal({ provider: provider });
  return false;
}
function updateLikeButtons(song) {
  song = song || currentCoverSong();
  var liked = isSongLiked(song);
  var stateKey = songAccountStateKey(song);
  var busy = !!(stateKey && likeBusyMap[stateKey]);
  var btn = document.getElementById('heart-btn');
  if (btn) {
    btn.classList.toggle('liked', liked);
    btn.classList.toggle('busy', busy);
    btn.title = liked ? '取消红心' : '红心喜欢';
  }
  var collectBtn = document.getElementById('collect-btn');
  if (collectBtn) collectBtn.classList.toggle('busy', collectBusy);
}
function heartIconSvg() {
  return '<svg class="heart-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.45c-.32 0-.62-.12-.86-.34l-1.23-1.12C5.54 16.03 2.25 13.05 2.25 8.9 2.25 5.48 4.88 2.9 8.28 2.9c1.7 0 3.35.72 4.52 1.96C13.97 3.62 15.62 2.9 17.32 2.9c3.4 0 6.03 2.58 6.03 6 0 4.15-3.29 7.13-7.66 11.09l-1.23 1.12c-.24.22-.54.34-.86.34z"/></svg>';
}
function playlistPlusIconSvg() {
  return '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10"/><path d="M4 11h10"/><path d="M4 16h7"/><path d="M18 14v6"/><path d="M15 17h6"/></svg>';
}
function artistCollectTrayIconSvg() {
  return '<svg fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v9"/><path d="M7.5 9.5h9"/><path d="M4.5 12.5v6h15v-6"/></svg>';
}
function artistNextPlusIconSvg() {
  return '<svg fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5v13"/><path d="M5.5 12h13"/></svg>';
}
function songActionHtml(kind, source, index, song) {
  var liked = isSongLiked(song);
  if (kind === 'like') {
    return '<button class="song-action-btn' + (liked ? ' liked' : '') + '" title="' + (liked ? '取消红心' : '红心喜欢') + '" onclick="event.stopPropagation();toggleLike' + source + '(' + index + ')">' + heartIconSvg() + '</button>';
  }
  return '<button class="song-action-btn" title="收藏到歌单" onclick="event.stopPropagation();collect' + source + '(' + index + ')">' + playlistPlusIconSvg() + '</button>';
}
function syncLikeStatusForSongs(songs) {
  if (!songs || !songs.length) return;
  var groups = Object.create(null);
  songs.forEach(function (song) {
    var provider = songAccountProvider(song);
    var adapter = songAccountAdapter(provider);
    var id = songAccountId(song, provider);
    if (!adapter || !adapter.like || !adapter.likeCheckUrl || !id || !isSongAccountLoggedIn(provider)) return;
    if (!groups[provider]) groups[provider] = { adapter: adapter, ids: [], seen: Object.create(null) };
    if (groups[provider].seen[id]) return;
    groups[provider].seen[id] = true;
    groups[provider].ids.push(id);
  });
  var providers = Object.keys(groups);
  if (!providers.length) return;
  var token = ++likeStatusToken;
  var requests = [];
  providers.forEach(function (provider) {
    var group = groups[provider];
    var batchSize = provider === 'spotify' || provider === 'qishui' ? 40 : (provider === 'kugou' ? 50 : 200);
    for (var offset = 0; offset < group.ids.length; offset += batchSize) {
      (function (batchIds) {
        var url = group.adapter.likeCheckUrl + '?' + group.adapter.likeCheckParam + '=' + encodeURIComponent(batchIds.join(','));
        requests.push(apiJson(url).then(function (r) {
          if (token < likeStatusToken - 3 || !r || !r.liked) return;
          var responseLiked = r.liked || {};
          batchIds.forEach(function (id) {
            var responseId = provider === 'kugou' ? String(id).toLowerCase() : String(id);
            var liked = responseLiked[responseId];
            if (liked == null) liked = responseLiked[id];
            if (liked == null) return;
            if (provider === 'qishui' && r.complete === false && !liked) return;
            likedSongMap[provider + ':' + responseId] = !!liked;
          });
        }).catch(function (err) {
          console.warn(provider + ' like check failed:', err);
        }));
      })(group.ids.slice(offset, offset + batchSize));
    }
  });
  Promise.all(requests).then(function () {
    if (token < likeStatusToken - 3) return;
    safeRenderQueuePanel('like-status-sync', { scrollCurrent: miniQueueOpen });
    if ($results && $results.classList.contains('show')) refreshSearchResultActionStates();
    updateLikeButtons();
  });
}
function syncLikeStatusForSong(song) {
  var adapter = songAccountAdapter(song);
  if (!adapter || !adapter.like) { updateLikeButtons(song); return; }
  syncLikeStatusForSongs([song]);
}
function isLikedPlaylistContext(id, title, meta) {
  var rawId = String(id || '');
  var idParts = rawId.match(/^(netease|qq|kugou|qishui|spotify):(.*)$/);
  var provider = idParts ? idParts[1] : playlistAccountProvider(meta);
  var sid = idParts ? idParts[2] : rawId;
  var text = String(title || (meta && meta.name) || '').trim();
  var hit = userPlaylists.find(function (pl) {
    return playlistAccountProvider(pl) === provider && String(pl.id || '') === sid;
  });
  if (hit) {
    if (Number(hit.specialType || 0) === 5) return true;
    text = text || hit.name || '';
  }
  return /我喜欢|喜欢的音乐|liked/i.test(text);
}
function markSongsLiked(songs, liked) {
  (songs || []).forEach(function (song) {
    var key = songAccountStateKey(song);
    if (key) likedSongMap[key] = !!liked;
  });
}
function refreshSearchResultActionStates() {
  if (!playlist || !$results || !$results.children.length) return;
  Array.prototype.forEach.call($results.querySelectorAll('[data-like-index]'), function (btn) {
    var i = Number(btn.getAttribute('data-like-index'));
    var song = playlist[i];
    var liked = isSongLiked(song);
    btn.classList.toggle('liked', liked);
    btn.title = liked ? '取消红心' : '红心喜欢';
  });
}
async function toggleLikeSong(song) {
  var provider = songAccountProvider(song);
  var adapter = songAccountAdapter(provider);
  if (!adapter || !adapter.like || !adapter.likeUrl) {
    showToast(songAccountUnsupportedMessage(provider, 'like'));
    return;
  }
  if (!ensureLoggedInForAction(provider)) return;
  var id = songAccountId(song, provider);
  var stateKey = songAccountStateKey(song);
  if (!id || !stateKey) {
    showToast('当前歌曲缺少' + adapter.label + '歌曲标识');
    return;
  }
  if (likeBusyMap[stateKey]) return;
  var next = !likedSongMap[stateKey];
  likeBusyMap[stateKey] = true;
  likedSongMap[stateKey] = next;
  updateLikeButtons(song);
  safeRenderQueuePanel('like-toggle-optimistic', { scrollCurrent: miniQueueOpen });
  refreshSearchResultActionStates();
  try {
    var r = await apiJson(adapter.likeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, like: next, song: song })
    });
    if (r && (r.error || r.success === false)) throw new Error(r.error || r.message || 'LIKE_FAILED');
    likedSongMap[stateKey] = r && r.liked != null ? !!r.liked : next;
    showToast(next ? '已加入红心喜欢' : '已取消红心');
  } catch (err) {
    likedSongMap[stateKey] = !next;
    var errorText = String(err && err.message || '');
    if (/SCOPE|PERMISSION/i.test(errorText)) {
      showToast('当前授权缺少收藏写入权限，请重新授权');
    } else if (/LOGIN_REQUIRED|AUTH_REQUIRED/i.test(errorText)) {
      showToast(adapter.label + '登录状态已失效，请重新登录');
    } else {
      showToast(errorText ? ('红心操作失败: ' + errorText) : '红心操作失败');
    }
  } finally {
    delete likeBusyMap[stateKey];
    updateLikeButtons(song);
    safeRenderQueuePanel('like-toggle-final', { scrollCurrent: miniQueueOpen });
    refreshSearchResultActionStates();
  }
}
function toggleLikeCurrent() { toggleLikeSong(currentCoverSong()); }
function toggleLikeSearchResult(i) { if (playlist[i]) toggleLikeSong(playlist[i]); }
function toggleLikeQueueIndex(i) { if (playQueue[i]) toggleLikeSong(playQueue[i]); }
function toggleLikeDetailSong(song) { toggleLikeSong(song); }
function openCollectModal(song) {
  if (!song) return;
  collectTargetSong = song;
  renderCollectModal();
  openGsapModal(document.getElementById('collect-modal'));
  var provider = songAccountProvider(song);
  var refresh = isSongAccountLoggedIn(provider) && typeof refreshUserPlaylists === 'function'
    ? refreshUserPlaylists(true)
    : (typeof refreshBuiltInPlaylists === 'function' ? refreshBuiltInPlaylists(true) : Promise.resolve());
  Promise.resolve(refresh).then(function () { renderCollectModal(); }).catch(function () { renderCollectModal(); });
}
function openCollectModalForCurrent() { openCollectModal(currentCoverSong()); }
function collectSearchResult(i) { if (playlist[i]) openCollectModal(playlist[i]); }
function collectQueueIndex(i) { if (playQueue[i]) openCollectModal(playQueue[i]); }
function collectDetailSong(song) { openCollectModal(song); }
function closeCollectModal() {
  closeGsapModal(document.getElementById('collect-modal'), function () {
    collectTargetSong = null;
    var input = document.getElementById('collect-new-name');
    if (input) input.value = '';
  });
}
function renderCollectModal() {
  var current = document.getElementById('collect-current');
  var list = document.getElementById('collect-list');
  if (!current || !list) return;
  var song = collectTargetSong || {};
  var cover = songCoverSrc(song, 80);
  current.innerHTML = (cover ? '<img src="' + cover + '" alt="">' : '<div class="cover-placeholder"></div>') +
    '<div style="min-width:0"><div class="collect-title">' + escHtml(song.name || '当前歌曲') + '</div><div class="collect-sub">' + escHtml(song.artist || '') + '</div></div>';
  var provider = songAccountProvider(song);
  var adapter = songAccountAdapter(provider);
  var localRows = (builtInPlaylists || []).map(function (pl) {
    var thumb = pl.cover ? coverUrlWithSize(pl.cover, 80) : '';
    return '<div class="collect-item" data-collect-key="builtin:' + escHtml(String(pl.id || '')) + '" onclick="addCollectTargetToBuiltInPlaylist(this.getAttribute(\'data-built-in-pid\'))" data-built-in-pid="' + escHtml(String(pl.id || '')) + '">' +
      (thumb ? '<img src="' + thumb + '" alt="">' : '<div class="cover-placeholder built-in">MR</div>') +
      '<div style="min-width:0"><div class="collect-title">' + escHtml(pl.name || '') + '</div><div class="collect-sub">' + (pl.trackCount || 0) + ' 首 · 可混合全部平台</div></div>' +
      '</div>';
  }).join('');
  var html = '<div class="collect-section-title"><span>Mineradio 内置歌单</span><small>保存在本机，不受平台账号限制</small></div>' +
    (localRows || '<div class="collect-empty compact">还没有内置歌单，在上方输入名称即可创建</div>');
  var canWritePlatform = !!(adapter && adapter.collect && adapter.playlistAddUrl && isSongAccountLoggedIn(provider));
  if (canWritePlatform) {
    var mine = userPlaylists.filter(function (pl) {
      return playlistAccountProvider(pl) === provider && !pl.subscribed && !pl.virtual;
    });
    if (mine.length) {
      html += '<div class="collect-section-title secondary"><span>同步到' + escHtml(adapter.label) + '</span><small>写入当前平台账号</small></div>' + mine.map(function (pl) {
        var thumb = pl.cover ? coverUrlWithSize(pl.cover, 80) : '';
        return '<div class="collect-item" data-collect-key="platform:' + escHtml(String(pl.id || '')) + '" data-collect-pid="' + escHtml(String(pl.id || '')) + '" onclick="addCollectTargetToPlaylist(this.getAttribute(\'data-collect-pid\'))">' +
          (thumb ? '<img src="' + thumb + '" alt="">' : '<div class="cover-placeholder"></div>') +
          '<div style="min-width:0"><div class="collect-title">' + escHtml(pl.name || '') + '</div><div class="collect-sub">' + (pl.trackCount || 0) + ' 首</div></div>' +
          '</div>';
      }).join('');
    }
  }
  list.innerHTML = html;
  if (window.gsap) animateListItems(list, '.collect-item', { x: 0, y: 6, stagger: 0.012, duration: 0.18, limit: 18 });
}
function setCollectBusyPid(pid, busy, kind) {
  var list = document.getElementById('collect-list');
  if (!list) return;
  var key = (kind || 'platform') + ':' + String(pid);
  list.querySelectorAll('.collect-item').forEach(function (item) {
    item.classList.toggle('busy', !!busy && item.getAttribute('data-collect-key') === key);
  });
}
async function createPlaylistFromCollect() {
  var input = document.getElementById('collect-new-name');
  var name = input ? input.value.trim() : '';
  if (!name) { showToast('先输入歌单名称'); return; }
  try {
    var created = await createBuiltInPlaylist(name, collectTargetSong);
    if (!created) return;
    if (input) input.value = '';
    closeCollectModal();
  } catch (err) {
    console.warn('[BuiltInPlaylistCreateCollect]', err);
    showToast('创建内置歌单失败');
  }
}
async function addCollectTargetToBuiltInPlaylist(pid) {
  if (collectBusy || !collectTargetSong || !pid) return;
  collectBusy = true;
  setCollectBusyPid(pid, true, 'builtin');
  try {
    var added = await addTrackToBuiltInPlaylist(pid, collectTargetSong);
    if (added) closeCollectModal();
  } catch (err) {
    console.warn('[BuiltInPlaylistCollect]', err);
    showToast('加入内置歌单失败');
  } finally {
    collectBusy = false;
    setCollectBusyPid(pid, false, 'builtin');
  }
}
function collectResultMessage(r) {
  if (!r) return '收藏失败';
  var msg = r.error || r.message || r.msg || '';
  if (/LOGIN_REQUIRED|AUTH_REQUIRED/i.test(String(msg))) return '平台登录状态已失效，请重新登录';
  if (/SCOPE|PERMISSION/i.test(String(msg))) return '当前授权缺少收藏写入权限，请重新授权';
  if (/exist|重复|已存在|already/i.test(String(msg))) return '歌曲已在歌单中';
  return msg ? ('收藏失败: ' + msg) : '收藏失败';
}
function playlistTracksPageUrl(adapter, pid, offset, limit) {
  var url = adapter.playlistTracksUrl + '?id=' + encodeURIComponent(pid);
  if (limit) url += '&limit=' + encodeURIComponent(String(limit));
  if (offset) url += '&offset=' + encodeURIComponent(String(offset));
  return url;
}
function playlistContainsAccountSong(tracks, song, provider) {
  var expected = songAccountIdentityValues(song, provider);
  if (!expected.length) return false;
  var expectedSet = Object.create(null);
  expected.forEach(function (id) { expectedSet[id] = true; });
  return (tracks || []).some(function (track) {
    return songAccountIdentityValues(track, provider).some(function (id) { return !!expectedSet[id]; });
  });
}
async function verifySongInPlaylist(pid, song) {
  var provider = songAccountProvider(song);
  var adapter = songAccountAdapter(provider);
  if (!pid || !adapter || !adapter.playlistTracksUrl || !songAccountId(song, provider)) return false;
  var pageLimit = provider === 'spotify' || provider === 'qishui' ? 50 : 200;
  for (var attempt = 0; attempt < 3; attempt++) {
    if (attempt) {
      await new Promise(function (resolve) { setTimeout(resolve, attempt === 1 ? 360 : 820); });
    }
    try {
      var detail = await apiJson(playlistTracksPageUrl(adapter, pid, 0, pageLimit));
      var tracks = (detail && detail.tracks) || [];
      if (playlistContainsAccountSong(tracks, song, provider)) return true;
      var total = Math.max(0, Number(detail && (detail.total || (detail.playlist && detail.playlist.trackCount))) || 0);
      var lastOffset = total > pageLimit ? Math.max(0, total - pageLimit) : 0;
      if (lastOffset) {
        var lastPage = await apiJson(playlistTracksPageUrl(adapter, pid, lastOffset, pageLimit));
        if (playlistContainsAccountSong((lastPage && lastPage.tracks) || [], song, provider)) return true;
      }
    } catch (e) {
      console.warn(provider + ' collect verify failed:', e);
    }
  }
  return false;
}
async function addCollectTargetToPlaylist(pid) {
  if (collectBusy || !collectTargetSong || !pid) return;
  var targetSong = collectTargetSong;
  var provider = songAccountProvider(targetSong);
  var adapter = songAccountAdapter(provider);
  if (!adapter || !adapter.collect || !adapter.playlistAddUrl) {
    showToast(songAccountUnsupportedMessage(provider, 'collect'));
    return;
  }
  if (!ensureLoggedInForAction(provider)) return;
  collectBusy = true;
  setCollectBusyPid(pid, true);
  updateLikeButtons();
  showToast('正在收藏到歌单...');
  try {
    var songId = songAccountId(targetSong, provider);
    if (!songId) throw new Error('当前歌曲缺少' + adapter.label + '歌曲标识');
    var r = await apiJson(adapter.playlistAddUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid: pid, id: songId, song: targetSong })
    });
    if (!r || r.error || r.success === false) throw new Error(collectResultMessage(r));
    showToast('已收藏到歌单');
    closeCollectModal();
    refreshUserPlaylists(true);
    setTimeout(function () {
      verifySongInPlaylist(pid, targetSong).then(function (ok) {
        if (!ok) console.warn(provider + ' collect submitted but verify did not find song yet:', pid, songId);
      });
    }, 900);
  } catch (err) {
    showToast(err && err.message ? err.message : '收藏失败');
  } finally {
    collectBusy = false;
    setCollectBusyPid(pid, false);
    updateLikeButtons();
  }
}
function cloneSong(song) { return hydrateCustomCover(Object.assign({}, song)); }
function avatarSrc(url) {
  if (!url) return '';
  return coverProxySrc(url, true);
}

// ============================================================
//  搜索
