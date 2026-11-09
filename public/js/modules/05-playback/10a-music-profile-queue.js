function firstMusicProfileAdjustableIndex() {
  return Math.max(0, Number(currentIdx) || 0) + 6;
}

function musicProfileQueueScore(song) {
  var root = typeof globalThis !== 'undefined' ? globalThis : this;
  var score = root['scoreMusicProfile' + 'QueueSong'];
  return typeof score === 'function' ? Number(score(song)) || 0 : 0;
}

function applyMusicProfileQueueOrder(reason) {
  if (!musicProfileView || !musicProfileView.enabled || !musicProfileView.recommendationMode || !musicProfileView.ready) return false;
  if (!Array.isArray(playQueue)) return false;
  var start = firstMusicProfileAdjustableIndex();
  if (start >= playQueue.length) return false;
  var tail = playQueue.slice(start);
  var unlocked = tail.filter(function (song) { return !song.__musicProfileManualOrder; })
    .map(function (song, index) { return { song: song, index: index, score: musicProfileQueueScore(song) }; })
    .sort(function (left, right) { return right.score - left.score || left.index - right.index; });
  var nextTail = tail.map(function (song) {
    return song.__musicProfileManualOrder ? song : unlocked.shift().song;
  });
  var changed = nextTail.some(function (song, index) { return song !== tail[index]; });
  if (!changed) return false;
  playQueue.splice.apply(playQueue, [start, nextTail.length].concat(nextTail));
  safeRenderQueuePanel('music-profile-reorder');
  safeShelfRebuild('music-profile-reorder');
  if (typeof saveLastPlaybackSnapshot === 'function') saveLastPlaybackSnapshot(true, 'music-profile-reorder');
  return true;
}

function markMusicProfileManualQueueItem(song) {
  if (!song) return false;
  song.__musicProfileManualOrder = true;
  return true;
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('mineradio-music-profile-change', function () {
    applyMusicProfileQueueOrder('profile-change');
  });
}
