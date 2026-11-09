// ============================================================
function medianGap(times, minGap, maxGap) {
  if (!times || times.length < 2) return 0;
  var gaps = [];
  for (var i = 1; i < times.length; i++) {
    var gap = times[i] - times[i - 1];
    if (gap >= minGap && gap <= maxGap) gaps.push(gap);
  }
  gaps.sort(function (a, b) { return a - b; });
  return gaps.length ? gaps[Math.floor(gaps.length * 0.5)] : 0;
}

function normalizeMusicTempoBeats(times, duration) {
  if (!times || !times.length) return [];
  var sorted = times
    .filter(function (t) { return isFinite(t) && t >= 0.05 && (!duration || t < duration - 0.05); })
    .sort(function (a, b) { return a - b; });
  if (sorted.length < 4) return sorted;
  var gap = medianGap(sorted, 0.20, 1.20);
  var minMainGap = gap && gap < 0.42 ? Math.min(0.44, gap * 1.65) : 0.36;
  var out = [];
  var last = -10;
  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i] - last >= minMainGap) {
      out.push(sorted[i]);
      last = sorted[i];
    }
  }
  return out;
}

function estimateTempoPhaseOffset(tempoBeats, beatCandidates, step, duration) {
  if (!tempoBeats || tempoBeats.length < 8 || !beatCandidates || beatCandidates.length < 4 || !step) return 0;
  var maxOffset = Math.min(0.26, Math.max(0.12, step * 0.58));
  var binSize = 0.025;
  var bins = {};
  var samples = [];
  var totalWeight = 0;
  var ti = 0;
  for (var i = 0; i < beatCandidates.length; i++) {
    var b = beatCandidates[i];
    if (!b || !isFinite(b.time)) continue;
    if (duration && (b.time < 1.0 || b.time > duration - 0.5)) continue;
    var strength = Math.max(0, Math.min(1, b.strength || 0));
    if (!b.camera && strength < 0.54) continue;
    if (b.low != null && b.low < 0.18 && strength < 0.66) continue;
    while (ti < tempoBeats.length - 1 && Math.abs(tempoBeats[ti + 1] - b.time) <= Math.abs(tempoBeats[ti] - b.time)) ti++;
    var base = tempoBeats[ti];
    var offset = b.time - base;
    if (!isFinite(offset) || Math.abs(offset) > maxOffset) continue;
    var weight = 0.20 + strength * strength * 1.35;
    if (b.primary) weight *= 1.35;
    if (b.camera) weight *= 1.18;
    if (b.mass != null) weight *= 0.82 + Math.max(0, Math.min(1, b.mass)) * 0.42;
    if (Math.abs(offset) < 0.025) weight *= 0.72;
    var key = Math.round(offset / binSize);
    bins[key] = (bins[key] || 0) + weight;
    samples.push({ offset: offset, weight: weight, key: key });
    totalWeight += weight;
  }
  if (samples.length < 4 || totalWeight <= 0) return 0;
  var bestKey = null;
  var bestWeight = 0;
  Object.keys(bins).forEach(function (k) {
    var key = parseInt(k, 10);
    var w = (bins[key] || 0) + (bins[key - 1] || 0) * 0.72 + (bins[key + 1] || 0) * 0.72;
    if (w > bestWeight) {
      bestWeight = w;
      bestKey = key;
    }
  });
  if (bestKey == null || bestWeight < totalWeight * 0.26) return 0;
  var sum = 0;
  var wsum = 0;
  for (var si = 0; si < samples.length; si++) {
    var s = samples[si];
    if (Math.abs(s.key - bestKey) <= 1) {
      sum += s.offset * s.weight;
      wsum += s.weight;
    }
  }
  if (wsum <= 0) return 0;
  var offsetOut = sum / wsum;
  return Math.abs(offsetOut) >= 0.045 ? Math.max(-maxOffset, Math.min(maxOffset, offsetOut)) : 0;
}

var musicTempoLoadPromise = null;
var QUEUE_BEAT_AUDIO_PREFETCH_ENABLED = false;
function ensureMusicTempo() {
  if (window.MusicTempo) return Promise.resolve(window.MusicTempo);
  if (musicTempoLoadPromise) return musicTempoLoadPromise;
  musicTempoLoadPromise = fetch('/vendor/music-tempo.min.js')
    .then(function (resp) {
      if (!resp.ok) throw new Error('music-tempo load failed: ' + resp.status);
      return resp.text();
    })
    .then(function (code) {
      (0, eval)(code);
      return window.MusicTempo || null;
    })
    .catch(function (err) {
      console.warn('music-tempo dynamic load failed:', err);
      return null;
    });
  return musicTempoLoadPromise;
}

var musicTempoWorkerUrl = null;
function getMusicTempoWorkerUrl() {
  if (musicTempoWorkerUrl) return musicTempoWorkerUrl;
  var code = [
    'self.onmessage=function(e){',
    'var d=e.data||{};',
    'try{',
    'importScripts(d.scriptUrl||"/vendor/music-tempo.min.js");',
    'var C=self.MusicTempo||(typeof MusicTempo!=="undefined"?MusicTempo:null);',
    'if(!C)throw new Error("MusicTempo unavailable");',
    'var mono=new Float32Array(d.mono);',
    'var mt=new C(mono,{bufferSize:2048,hopSize:Math.max(128,Math.round(d.sampleRate*0.010)),timeStep:0.010,minBeatInterval:0.36,maxBeatInterval:0.95,expiryTime:8});',
    'self.postMessage({ok:true,tempo:mt.tempo||0,beats:mt.beats||[]});',
    '}catch(err){self.postMessage({ok:false,error:(err&&err.message)||String(err)});}',
    '};'
  ].join('');
  musicTempoWorkerUrl = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
  return musicTempoWorkerUrl;
}

async function analyzeMusicTempoInWorker(buffer, token) {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return null;
  try {
    showBeatChip('后台锁定电影主拍…');
    await yieldToIdle(isHiddenForBackgroundOptimization() ? 20 : 180);
    if (token !== beatMapToken) return null;
    var channels = buffer.numberOfChannels;
    var len = buffer.length;
    var mono = new Float32Array(len);
    var chDataList = [];
    for (var ch = 0; ch < channels; ch++) chDataList.push(buffer.getChannelData(ch));
    var chScale = 1 / Math.max(1, channels);
    var monoChunk = Math.max(4096, Math.floor(buffer.sampleRate * 0.70));
    for (var monoStart = 0; monoStart < len; monoStart += monoChunk) {
      var monoEnd = Math.min(len, monoStart + monoChunk);
      for (var mi = monoStart; mi < monoEnd; mi++) {
        var sum = 0;
        for (var ci = 0; ci < channels; ci++) sum += chDataList[ci][mi] * chScale;
        mono[mi] = sum;
      }
      if ((monoStart / monoChunk) % 2 === 1) {
        await yieldToIdle(isHiddenForBackgroundOptimization() ? 10 : 60);
        if (token !== beatMapToken) return null;
      }
    }
    var worker = new Worker(getMusicTempoWorkerUrl());
    return await new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        worker.terminate();
        resolve(null);
      }, 16000);
      worker.onmessage = function (ev) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker.terminate();
        var data = ev.data || {};
        if (!data.ok) {
          console.warn('music-tempo worker failed:', data.error);
          resolve(null);
          return;
        }
        resolve(data);
      };
      worker.onerror = function (err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker.terminate();
        console.warn('music-tempo worker error:', err && err.message ? err.message : err);
        resolve(null);
      };
      worker.postMessage({
        mono: mono.buffer,
        sampleRate: buffer.sampleRate,
        scriptUrl: location.origin + '/vendor/music-tempo.min.js'
      }, [mono.buffer]);
    });
  } catch (err) {
    console.warn('music-tempo worker setup failed:', err);
    return null;
  }
}

function scheduleBeatAnalysis(songId, audioUrl, token, song) {
  if (!songId || !audioUrl) return;
  if (djMode.active) {
    cancelBeatAnalysisTimer();
    beatAnalysisStartedAt = 0;
    hideBeatChip();
    return;
  }
  cancelBeatAnalysisTimer();
  beatAnalysisStartedAt = 0;
  hideBeatChip();
  var analysisAttempts = 0;
  function queueCurrentTrackAnalysis(delay) {
    if (token !== beatMapToken || beatMapCache[songId]) return;
    if (beatAnalysisTimer) clearTimeout(beatAnalysisTimer);
    beatAnalysisTimer = setTimeout(waitForQuietStart, Math.max(120, Number(delay) || 0));
  }
  function waitForQuietStart() {
    beatAnalysisTimer = null;
    if (token !== beatMapToken || beatMapCache[songId]) return;
    if (!audio || audio.paused) {
      queueCurrentTrackAnalysis(620);
      return;
    }
    var current = audio.currentTime || 0;
    if (current < beatAnalysisConfig.minPlaybackSec) {
      queueCurrentTrackAnalysis(Math.max(500, (beatAnalysisConfig.minPlaybackSec - current) * 1000));
      return;
    }
    var startAnalysis = async function () {
      if (token !== beatMapToken || beatMapCache[songId]) return;
      if (!audio || audio.paused) {
        queueCurrentTrackAnalysis(620);
        return;
      }
      var diskMap = await readBeatDiskCache(songId);
      if (diskMap) {
        applyBeatMapCacheForCurrent(songId, diskMap, token, 'D盘节拍缓存命中:');
        return;
      }
      if (token !== beatMapToken || !audio || audio.paused || beatMapCache[songId]) return;
      if (beatMapBusy) {
        queueCurrentTrackAnalysis(420);
        return;
      }
      analysisAttempts++;
      beatAnalysisStartedAt = performance.now();
      analyzeAudioBeats(audioUrl, null, token, {
        skipMusicTempo: beatAnalysisConfig.skipMusicTempoWhilePlaying && !audio.paused,
        background: true,
        song: song || null
      }).then(function (map) {
        if (token !== beatMapToken) return;
        if (!map) {
          if (analysisAttempts < 3) queueCurrentTrackAnalysis(1200 + analysisAttempts * 600);
          return;
        }
        smoothBeatMapHandoff(songId, map, token, song || null);
      }).catch(function (err) {
        console.warn('scheduled beat analysis failed:', err);
        hideBeatChip();
        if (token === beatMapToken && analysisAttempts < 3) queueCurrentTrackAnalysis(1200 + analysisAttempts * 600);
      });
    };
    scheduleAnalysisTask(startAnalysis, beatAnalysisConfig.idleTimeout);
  }
  queueCurrentTrackAnalysis(beatAnalysisConfig.delayMs);
}

function beatMapSongKey(song) {
  if (!song) return '';
  if (song.type === 'local' && song.localKey) return 'local:' + song.localKey;
  var provider = songProviderKey(song) || 'netease';
  if (provider === 'qq') return 'qq:' + (song.mid || song.songmid || song.id || (song.name + '|' + song.artist));
  var id = song.hash || song.fileHash || song.spotifyId || song.providerSongId || song.id;
  if (id != null && id !== '') {
    if (provider === 'netease') return 'song:' + id;
    var duration = Math.max(0, Number(song.duration || song.dt) || 0);
    if (duration > 10000) duration /= 1000;
    return provider + ':' + id + ':' + Math.round(duration);
  }
  return '';
}

function localBeatDiskKey(localKey, mode) {
  if (!localKey) return '';
  return 'local:' + localKey + ':' + (mode === 'dj' ? 'dj' : 'mr');
}

function updateBeatDiskCacheStatus(data) {
  if (!data) return;
  beatDiskCacheStatus.checked = true;
  beatDiskCacheStatus.enabled = !!data.enabled || data.mode === 'disk';
  beatDiskCacheStatus.mode = data.mode || (beatDiskCacheStatus.enabled ? 'disk' : 'memory-only');
  beatDiskCacheStatus.reason = data.reason || '';
  if (!beatDiskCacheStatus.enabled && !beatDiskCacheNoticeLogged) {
    beatDiskCacheNoticeLogged = true;
    console.log('节拍磁盘缓存不可用，已降级为本次运行内存缓存:', beatDiskCacheStatus.reason || 'unknown');
  }
}

async function ensureBeatDiskCacheStatus() {
  if (beatDiskCacheStatus.checked) return beatDiskCacheStatus;
  try {
    updateBeatDiskCacheStatus(await apiJson('/api/beatmap/cache/status?t=' + Date.now()));
  } catch (e) {
    updateBeatDiskCacheStatus({ enabled: false, mode: 'memory-only', reason: 'STATUS_FAILED' });
  }
  return beatDiskCacheStatus;
}

async function readBeatDiskCache(key) {
  if (!key || beatMapCache[key]) return beatMapCache[key] || null;
  var st = await ensureBeatDiskCacheStatus();
  if (!st.enabled) return null;
  try {
    var r = await apiJson('/api/beatmap/cache?key=' + encodeURIComponent(key) + '&t=' + Date.now());
    if (r && r.enabled === false) updateBeatDiskCacheStatus(r);
    if (!r || !r.hit || !r.map) return null;
    var map = unpackLocalBeatMap(r.map);
    if (!map) return null;
    beatMapCache[key] = map;
    return map;
  } catch (e) {
    console.warn('beat disk cache read failed:', e);
    return null;
  }
}

async function writeBeatDiskCache(key, map, song, mode) {
  if (!key || !map) return false;
  var st = await ensureBeatDiskCacheStatus();
  if (!st.enabled) return false;
  try {
    var packed = packLocalBeatMap(map);
    if (!packed) return false;
    var r = await apiJson('/api/beatmap/cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: key,
        mode: mode || 'mr',
        provider: songProviderKey(song),
        title: song && song.name,
        artist: song && song.artist,
        map: packed
      })
    });
    if (r && r.enabled === false) updateBeatDiskCacheStatus(r);
    return !!(r && r.ok);
  } catch (e) {
    console.warn('beat disk cache write failed:', e);
    return false;
  }
}

function isBeatPrefetchCandidate(song) {
  if (!song || isPodcastSong(song) || song.type === 'local' || song.localUrl) return false;
  return !!beatMapSongKey(song);
}

function findNextBeatPrefetchIndex(fromIdx, seen) {
  if (!playQueue.length) return -1;
  seen = seen || {};
  var total = playQueue.length;
  for (var step = 1; step < total; step++) {
    var idx = (fromIdx + step + total) % total;
    if (idx === currentIdx) continue;
    var song = playQueue[idx];
    if (!isBeatPrefetchCandidate(song)) continue;
    var key = beatMapSongKey(song);
    if (!key || beatMapCache[key] || seen[key]) continue;
    return idx;
  }
  return -1;
}

function normalizeBeatPrefetchState(state) {
  state = state || {};
  return {
    keys: Object.assign({}, state.keys || state),
    count: Math.max(0, Number(state.count) || 0)
  };
}

async function fetchBeatPrefetchAudioUrl(song) {
  if (!song) return null;
  if (typeof resolveAlbumGaplessPlaybackData === 'function') {
    var resolved = await resolveAlbumGaplessPlaybackData(song);
    if (!resolved || !resolved.url || resolved.trial) return null;
    return '/api/audio?url=' + encodeURIComponent(resolved.url);
  }
  var isQQ = songProviderKey(song) === 'qq';
  var requestedQuality = normalizePlaybackQualityForProvider(getPlaybackQualityForSong(song), isQQ ? 'qq' : 'netease');
  if (!isQQ && requestedQuality === 'jymaster' && !hasProviderSvip('netease', loginStatus)) requestedQuality = 'hires';
  var runtimeQualityCap = playbackQualityCapValue(song, isQQ ? 'qq' : 'netease');
  if (playbackQualityAboveCap(requestedQuality, isQQ ? 'qq' : 'netease', runtimeQualityCap)) requestedQuality = runtimeQualityCap;
  var qualityParam = '&quality=' + encodeURIComponent(requestedQuality);
  var neteaseMatchQuery = typeof neteasePlaybackMatchQuery === 'function' ? neteasePlaybackMatchQuery(song) : '';
  var data = isQQ
    ? await apiJson('/api/qq/song/url?mid=' + encodeURIComponent(song.mid || song.songmid || song.id || '') + '&mediaMid=' + encodeURIComponent(song.mediaMid || song.media_mid || '') + qualityParam, { timeoutMs: 15000 })
    : await apiJson('/api/song/url?id=' + encodeURIComponent(song.id) + neteaseMatchQuery + qualityParam, { timeoutMs: 14000 });
  if (!data || !data.url || data.trial) return null;
  return '/api/audio?url=' + encodeURIComponent(data.url);
}

function scheduleQueueBeatPrefetch(fromIdx, delayMs, state) {
  cancelBeatPrefetchTimer();
  if (!QUEUE_BEAT_AUDIO_PREFETCH_ENABLED) return;
  if (!playQueue.length || beatPrefetchBusy || localBeatAnalysis.active) return;
  var prefetchState = normalizeBeatPrefetchState(state);
  if (prefetchState.count >= BEAT_PREFETCH_LIMIT) return;
  var token = beatMapToken;
  var seq = ++beatPrefetchToken;
  var startIdx = isFinite(fromIdx) ? fromIdx : currentIdx;
  var waitMs = delayMs == null ? 1800 : delayMs;
  if (typeof isRenderInteractionActive === 'function' && isRenderInteractionActive()) waitMs = Math.max(waitMs, 2200);
  beatPrefetchTimer = setTimeout(function () {
    beatPrefetchTimer = null;
    runQueueBeatPrefetch(startIdx, token, seq, prefetchState);
  }, waitMs);
}

async function runQueueBeatPrefetch(fromIdx, token, seq, state) {
  if (!QUEUE_BEAT_AUDIO_PREFETCH_ENABLED) return;
  if (token !== beatMapToken || seq !== beatPrefetchToken || beatPrefetchBusy || !playQueue.length) return;
  if (audio && audio.paused) return;
  state = normalizeBeatPrefetchState(state);
  if (state.count >= BEAT_PREFETCH_LIMIT) return;
  var idx = findNextBeatPrefetchIndex(fromIdx, state.keys);
  if (idx < 0) return;
  var song = hydrateCustomCover(playQueue[idx]);
  var key = beatMapSongKey(song);
  if (!key) return;
  state.keys[key] = true;
  state.count++;
  beatPrefetchBusy = true;
  beatPrefetchLastKey = key;
  try {
    if (token !== beatMapToken || seq !== beatPrefetchToken) return;
    var diskMap = await readBeatDiskCache(key);
    if (diskMap) {
      console.log('队列节奏D盘缓存命中:', song.name || key, diskMap.visualBeatCount || 0);
      return;
    }
    var audioUrl = await fetchBeatPrefetchAudioUrl(song);
    if (token !== beatMapToken || seq !== beatPrefetchToken || !audioUrl || beatMapCache[key]) return;
    while (typeof isRenderInteractionActive === 'function' && isRenderInteractionActive() && token === beatMapToken && seq === beatPrefetchToken) {
      await yieldToIdle(isHiddenForBackgroundOptimization() ? 30 : 320);
    }
    if (token !== beatMapToken || seq !== beatPrefetchToken || beatMapCache[key]) return;
    while (beatMapBusy && token === beatMapToken && seq === beatPrefetchToken) {
      await yieldToIdle(isHiddenForBackgroundOptimization() ? 30 : 240);
    }
    if (token !== beatMapToken || seq !== beatPrefetchToken || beatMapCache[key]) return;
    var map = await analyzeAudioBeats(audioUrl, null, token, {
      background: true,
      prefetch: true,
      song: song
    });
    if (token !== beatMapToken || seq !== beatPrefetchToken || !map) return;
    beatMapCache[key] = map;
    writeBeatDiskCache(key, map, song, 'mr');
    console.log('队列节奏预热完成:', song.name || key, map.visualBeatCount || 0);
  } catch (err) {
    console.warn('queue beat prefetch failed:', err && err.message ? err.message : err);
  } finally {
    beatPrefetchBusy = false;
    if (state.count < BEAT_PREFETCH_LIMIT && token === beatMapToken && seq === beatPrefetchToken && playQueue.length && !(audio && audio.paused)) {
      scheduleQueueBeatPrefetch(idx, 1600, state);
    }
  }
}
