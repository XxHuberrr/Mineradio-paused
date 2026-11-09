function normalizeBuiltInPlaylistRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(function (playlist) {
    return Object.assign({}, playlist, {
      provider: 'mineradio',
      source: 'mineradio',
      builtin: true,
      creator: playlist.creator || 'Mineradio',
      shelfPane: 'mine',
      subscribed: false
    });
  }).filter(function (playlist) { return !!playlist.id; });
}

function applyBuiltInPlaylistSnapshot(result, opts) {
  opts = opts || {};
  if (!result || result.ok !== true) return false;
  builtInPlaylists = normalizeBuiltInPlaylistRows(result.playlists);
  if (typeof rebuildUserPlaylistsFromCatalog === 'function') {
    rebuildUserPlaylistsFromCatalog({
      animate: !!opts.animate,
      preserveScroll: opts.preserveScroll !== false,
      reason: opts.reason || 'built-in-playlists'
    });
  } else {
    userPlaylists = builtInPlaylists.concat(neteasePlaylists, qqPlaylists, kugouPlaylists, qishuiPlaylists, spotifyPlaylists);
    playlistCatalogRevision += 1;
  }
  return true;
}

function builtInPlaylistApiAvailable() {
  return !!(window.desktopWindow && typeof window.desktopWindow.listBuiltInPlaylists === 'function');
}

function builtInPlaylistErrorMessage(result, fallback) {
  var code = String(result && result.error || '');
  if (code === 'BUILT_IN_PLAYLIST_LIMIT_REACHED') return '内置歌单数量已达到上限';
  if (code === 'BUILT_IN_PLAYLIST_TRACK_LIMIT_REACHED') return '这个内置歌单已经装满了';
  if (code === 'BUILT_IN_PLAYLIST_INDEX_TOO_LARGE') return '内置歌单数据已达到存储上限';
  if (code === 'BUILT_IN_PLAYLIST_TRACK_INVALID') return '这首歌缺少可保存的音源标识';
  if (code === 'BUILT_IN_PLAYLIST_NOT_FOUND') return '内置歌单已不存在';
  return fallback || '内置歌单操作失败';
}

function refreshBuiltInPlaylists(force) {
  if (!builtInPlaylistApiAvailable()) return Promise.resolve(false);
  if (builtInPlaylistLoadPromise && !force) return builtInPlaylistLoadPromise;
  var request = window.desktopWindow.listBuiltInPlaylists().then(function (result) {
    if (!result || result.ok !== true) throw new Error(result && result.error || 'BUILT_IN_PLAYLIST_READ_FAILED');
    applyBuiltInPlaylistSnapshot(result, { preserveScroll: true, reason: 'built-in-playlists-refresh' });
    return true;
  }).catch(function (error) {
    console.warn('[BuiltInPlaylists]', error);
    return false;
  }).finally(function () {
    if (builtInPlaylistLoadPromise === request) builtInPlaylistLoadPromise = null;
  });
  builtInPlaylistLoadPromise = request;
  return request;
}

async function builtInPlaylistTracksPage(id, options) {
  if (!builtInPlaylistApiAvailable() || typeof window.desktopWindow.readBuiltInPlaylist !== 'function') {
    return { ok: false, playlist: null, tracks: [], total: 0, hasMore: false, error: 'BUILT_IN_PLAYLIST_UNAVAILABLE' };
  }
  return window.desktopWindow.readBuiltInPlaylist(String(id || ''), options || {});
}

async function createBuiltInPlaylist(name, initialTrack) {
  name = String(name || '').trim();
  if (!name) {
    if (typeof showToast === 'function') showToast('先输入内置歌单名称');
    return null;
  }
  if (!builtInPlaylistApiAvailable() || typeof window.desktopWindow.createBuiltInPlaylist !== 'function') {
    if (typeof showToast === 'function') showToast('当前环境无法保存内置歌单');
    return null;
  }
  var result = await window.desktopWindow.createBuiltInPlaylist(name);
  if (!result || result.ok !== true || !result.playlist) {
    if (typeof showToast === 'function') showToast(builtInPlaylistErrorMessage(result, '创建内置歌单失败'));
    return null;
  }
  applyBuiltInPlaylistSnapshot(result, { animate: true, reason: 'built-in-playlist-create' });
  if (initialTrack) {
    var added = await addTrackToBuiltInPlaylist(result.playlist.id, initialTrack, { silentSuccess: true });
    if (!added) return result.playlist;
  }
  if (typeof showToast === 'function') showToast('内置歌单已创建');
  return result.playlist;
}

function promptCreateBuiltInPlaylist() {
  var name = window.prompt('新建 Mineradio 内置歌单', '我的歌单');
  if (name == null) return;
  createBuiltInPlaylist(name).catch(function (error) {
    console.warn('[BuiltInPlaylistCreate]', error);
    if (typeof showToast === 'function') showToast('创建内置歌单失败');
  });
}

async function addTrackToBuiltInPlaylist(id, track, opts) {
  opts = opts || {};
  if (!builtInPlaylistApiAvailable() || typeof window.desktopWindow.addBuiltInPlaylistTrack !== 'function') return false;
  var result = await window.desktopWindow.addBuiltInPlaylistTrack(String(id || ''), track || {});
  if (!result || result.ok !== true) {
    if (typeof showToast === 'function') showToast(builtInPlaylistErrorMessage(result, '加入内置歌单失败'));
    return false;
  }
  applyBuiltInPlaylistSnapshot(result, { preserveScroll: true, reason: 'built-in-playlist-add-track' });
  if (typeof showToast === 'function' && !opts.silentSuccess) showToast(result.duplicate ? '歌曲已在这个内置歌单中' : '已加入内置歌单');
  return result.duplicate ? 'duplicate' : true;
}

async function removeTrackFromBuiltInPlaylist(id, index) {
  if (!builtInPlaylistApiAvailable() || typeof window.desktopWindow.removeBuiltInPlaylistTrack !== 'function') return false;
  var result = await window.desktopWindow.removeBuiltInPlaylistTrack(String(id || ''), Number(index));
  if (!result || result.ok !== true) {
    if (typeof showToast === 'function') showToast(builtInPlaylistErrorMessage(result, '移除歌曲失败'));
    return false;
  }
  if (playlistPanelDetailState && playlistPanelDetailState.key === 'mineradio:' + String(id || '')) {
    playlistPanelDetailState.tracks.splice(Number(index), 1);
    playlistPanelDetailState.total = Math.max(0, playlistPanelDetailState.tracks.length);
    playlistPanelDetailState.nextOffset = playlistPanelDetailState.tracks.length;
    playlistPanelDetailState.hasMore = false;
  }
  applyBuiltInPlaylistSnapshot(result, { preserveScroll: true, reason: 'built-in-playlist-remove-track' });
  if (typeof showToast === 'function') showToast('已从内置歌单移除');
  return true;
}

async function renameBuiltInPlaylist(id, currentName) {
  var name = window.prompt('重命名内置歌单', String(currentName || ''));
  if (name == null || !String(name).trim()) return false;
  var result = await window.desktopWindow.renameBuiltInPlaylist(String(id || ''), String(name).trim());
  if (!result || result.ok !== true) {
    if (typeof showToast === 'function') showToast(builtInPlaylistErrorMessage(result, '重命名失败'));
    return false;
  }
  if (playlistPanelDetailState && playlistPanelDetailState.key === 'mineradio:' + String(id || '') && playlistPanelDetailState.playlist) {
    playlistPanelDetailState.playlist.name = String(name).trim();
  }
  applyBuiltInPlaylistSnapshot(result, { preserveScroll: true, reason: 'built-in-playlist-rename' });
  if (typeof showToast === 'function') showToast('内置歌单已重命名');
  return true;
}

async function deleteBuiltInPlaylist(id, currentName) {
  if (!window.confirm('删除内置歌单“' + String(currentName || '未命名歌单') + '”？\n只删除歌单，不会删除平台或本地歌曲。')) return false;
  var result = await window.desktopWindow.deleteBuiltInPlaylist(String(id || ''));
  if (!result || result.ok !== true) {
    if (typeof showToast === 'function') showToast(builtInPlaylistErrorMessage(result, '删除内置歌单失败'));
    return false;
  }
  if (playlistPanelDetailState && playlistPanelDetailState.key === 'mineradio:' + String(id || '')) {
    cancelPlaylistPanelDetailRequest();
    playlistPanelDetailState.key = '';
    playlistPanelDetailState.tracks = [];
    playlistPanelDetailState.playlist = null;
  }
  applyBuiltInPlaylistSnapshot(result, { preserveScroll: true, reason: 'built-in-playlist-delete' });
  if (typeof showToast === 'function') showToast('内置歌单已删除');
  return true;
}
