var musicProfileView = null;

function musicProfileSetView(result) {
  if (!result || result.ok !== true || !result.profile) return null;
  musicProfileView = result.profile;
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('mineradio-music-profile-change', { detail: musicProfileView }));
  }
  return musicProfileView;
}
function musicProfileRequest(path, body) {
  if (typeof apiJson !== 'function') return Promise.resolve(null);
  var options = { timeoutMs: 2400 };
  if (body !== undefined) {
    options.method = 'POST';
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  try {
    return Promise.resolve(apiJson(path, options)).then(function (result) {
      return musicProfileSetView(result);
    }).catch(function () { return null; });
  } catch (e) {
    return Promise.resolve(null);
  }
}
function musicProfileActionRequest(path, body, failureMessage) {
  return musicProfileRequest(path, body).then(function (profile) {
    if (!profile && typeof showToast === 'function') showToast(failureMessage || '音乐画像操作失败');
    return profile;
  });
}
function loadMusicProfile() {
  return musicProfileRequest('/api/music-profile');
}
function setMusicProfileEnabled(enabled) {
  return musicProfileActionRequest('/api/music-profile/enable', { enabled: enabled === true }, '音乐画像启用失败');
}
function setMusicProfileRecommendationMode(enabled) {
  return musicProfileActionRequest('/api/music-profile/recommendation-mode', { enabled: enabled === true }, '音乐画像推荐模式切换失败');
}
function clearMusicProfile() {
  return musicProfileActionRequest('/api/music-profile/clear', {}, '音乐画像清除失败');
}
function setMusicProfileTagReduced(key, reduced) {
  return musicProfileActionRequest('/api/music-profile/tag-preference', { key: key, reduced: reduced === true }, '音乐画像标签调整失败');
}
function musicProfileSongId(song) {
  var values = [song && song.id, song && song.providerSongId, song && song.spotifyId, song && song.mid, song && song.mediaMid, song && song.hash];
  for (var i = 0; i < values.length; i++) {
    if (values[i] != null && String(values[i]).trim()) return String(values[i]).trim();
  }
  return '';
}
function musicProfileValues(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(function (item) { return typeof item === 'string' && item.trim(); })
    .map(function (item) { return item.trim().toLowerCase(); });
}
function musicProfileEra(value) {
  var match = String(value == null ? '' : value).trim().match(/^(\d{4})/);
  return match ? String(Math.floor(Number(match[1]) / 10) * 10) + 's' : '';
}
function musicProfileMetadata(song) {
  var raw = song && song.profileMetadata && typeof song.profileMetadata === 'object' ? song.profileMetadata : {};
  var metadata = {};
  var styles = musicProfileValues(raw.styles);
  var languages = musicProfileValues(raw.languages);
  var releaseDate = typeof raw.releaseDate === 'string' ? raw.releaseDate.trim() : (typeof song.releaseDate === 'string' ? song.releaseDate.trim() : '');
  if (styles.length) metadata.styles = styles;
  if (languages.length) metadata.languages = languages;
  if (releaseDate) metadata.releaseDate = releaseDate;
  if (raw.isDj === true || song.isDj === true) metadata.isDj = true;
  return metadata;
}
function musicProfileSongPayload(song) {
  song = song || {};
  var type = String(song.type || 'song').trim().toLowerCase();
  if (song.type === 'local' || song.type === 'podcast' || type === 'local' || type.indexOf('podcast') === 0) return null;
  var queueKey = queueItemKey(song);
  var provider = String(song.provider || song.source || song.sourceKey || '').trim().toLowerCase();
  var id = musicProfileSongId(song);
  if (!queueKey || !provider || !id) return null;
  var payload = { provider: provider, id: id, type: type || 'song' };
  var releaseDate = typeof song.releaseDate === 'string' ? song.releaseDate.trim() : '';
  var metadata = musicProfileMetadata(song);
  if (releaseDate) payload.releaseDate = releaseDate;
  if (Object.keys(metadata).length) payload.profileMetadata = metadata;
  return payload;
}
function musicProfileDurationMs(song) {
  var duration = Number(song && (song.durationMs || song.duration));
  if (!isFinite(duration) || duration <= 0) return 0;
  return Math.round(duration > 10000 ? duration : duration * 1000);
}
function musicProfileProgress(session, completed) {
  var song = session && session.song || {};
  var listenMs = Math.max(0, Number(session && session.listenMs) || 0);
  var duration = musicProfileDurationMs(song);
  var observed = Math.max(0, Math.min(1, Number(session && session.maxProgress) || 0));
  var measured = duration ? Math.max(0, Math.min(1, listenMs / duration)) : 0;
  return completed ? 1 : Math.max(observed, measured);
}
function reportMusicProfileSession(session, completed, userSkip) {
  var song = session && session.song;
  var payloadSong = musicProfileSongPayload(song);
  if (!payloadSong) return Promise.resolve(null);
  var progress = musicProfileProgress(session, completed);
  var isDj = payloadSong.profileMetadata && payloadSong.profileMetadata.isDj === true;
  var kind = userSkip === true
    ? (isDj && progress >= 0.5 ? 'listen' : (progress <= 0.15 ? 'early-skip' : 'skip'))
    : 'listen';
  var sessionId = String(session && session.sessionId || queueItemKey(song));
  return musicProfileRequest('/api/music-profile/event', {
    id: sessionId + ':' + kind,
    kind: kind,
    progress: progress,
    at: Date.now(),
    song: payloadSong,
  });
}
function musicProfileFavoriteActionId(payloadSong, actionId) {
  var explicit = String(actionId == null ? '' : actionId).trim();
  if (explicit) return explicit;
  var session = typeof listenSession === 'undefined' ? null : listenSession;
  var sessionSong = session && session.song ? musicProfileSongPayload(session.song) : null;
  if (session && session.sessionId && sessionSong && sessionSong.provider === payloadSong.provider && sessionSong.id === payloadSong.id) {
    return 'session:' + session.sessionId;
  }
  return 'song:' + payloadSong.provider + ':' + payloadSong.id;
}
function reportMusicProfileFavorite(song, actionId) {
  var payloadSong = musicProfileSongPayload(song);
  if (!payloadSong) return Promise.resolve(null);
  var favoriteActionId = musicProfileFavoriteActionId(payloadSong, actionId);
  return musicProfileRequest('/api/music-profile/event', {
    id: 'favorite:' + favoriteActionId + ':' + payloadSong.provider + ':' + payloadSong.id,
    kind: 'favorite',
    progress: 0,
    at: Date.now(),
    song: payloadSong,
  });
}
function scoreMusicProfileQueueSong(song) {
  if (!musicProfileView || musicProfileView.enabled !== true || musicProfileView.ready !== true || !Array.isArray(musicProfileView.tags)) return 0;
  if (!musicProfileSongPayload(song)) return 0;
  var metadata = musicProfileMetadata(song);
  var dimensions = [
    ['style', metadata.styles || []],
    ['language', metadata.languages || []],
    ['era', musicProfileEra(metadata.releaseDate)],
  ];
  return dimensions.reduce(function (score, dimension) {
    var values = Array.isArray(dimension[1]) ? dimension[1] : (dimension[1] ? [dimension[1]] : []);
    if (!values.length) return score;
    var total = values.reduce(function (sum, value) {
      var tag = musicProfileView.tags.find(function (item) { return item && item.key === dimension[0] + ':' + value; });
      return sum + (tag && isFinite(Number(tag.weight)) ? Number(tag.weight) : 0);
    }, 0);
    return score + total / values.length;
  }, 0);
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('mineradio-playback-snapshot-restored', function () {
    if (typeof applyMusicProfileQueueOrder === 'function') applyMusicProfileQueueOrder('snapshot-restored');
  });
}

loadMusicProfile();
