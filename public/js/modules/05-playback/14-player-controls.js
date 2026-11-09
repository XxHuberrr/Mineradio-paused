function waitForAudioReadyToPlay(media, timeoutMs) {
  if (!media) return Promise.resolve(false);
  if (media.readyState >= 2) return Promise.resolve(true);
  return new Promise(function (resolve) {
    var done = false;
    var timer = null;
    function cleanup() {
      if (timer) clearTimeout(timer);
      media.removeEventListener('canplay', onReady);
      media.removeEventListener('loadeddata', onReady);
      media.removeEventListener('error', onError);
    }
    function finish(ok) {
      if (done) return;
      done = true;
      cleanup();
      resolve(!!ok);
    }
    function onReady() { finish(true); }
    function onError() { finish(false); }
    media.addEventListener('canplay', onReady, { once: true });
    media.addEventListener('loadeddata', onReady, { once: true });
    media.addEventListener('error', onError, { once: true });
    timer = setTimeout(function () { finish(media.readyState >= 2); }, timeoutMs || 1000);
  });
}

function isSameAudioPlaybackTarget(media, src) {
  return !!(audio && media && audio === media && (audio.currentSrc || audio.src || '') === src);
}

function clearPlaybackResumeWatchdogs() {
  if (!playbackResumeRecovery || !Array.isArray(playbackResumeRecovery.timerIds)) return;
  playbackResumeRecovery.timerIds.forEach(function (timerId) { clearTimeout(timerId); });
  playbackResumeRecovery.timerIds = [];
}

function clearPlaybackResumePauseMarker() {
  if (!playbackResumeRecovery) return;
  playbackResumeRecovery.pausedAt = 0;
  playbackResumeRecovery.pausedSongKey = '';
  playbackResumeRecovery.pausedSrc = '';
  playbackResumeRecovery.pausedPosition = 0;
}

function updatePlaybackResumePauseMarker(reason) {
  if (!playbackResumeRecovery) return;
  if (reason === 'pause' || reason === 'manual-pause') {
    var song = playQueue && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
    var src = audio && (audio.currentSrc || audio.src || '') || '';
    if (!song || !src || !audio || audio.ended) {
      clearPlaybackResumePauseMarker();
      return;
    }
    playbackResumeRecovery.pausedAt = Date.now();
    playbackResumeRecovery.pausedSongKey = typeof queueItemKey === 'function' ? queueItemKey(song) : '';
    playbackResumeRecovery.pausedSrc = src;
    playbackResumeRecovery.pausedPosition = isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0;
    return;
  }
  if (reason === 'play' || reason === 'playing' || reason === 'ended' || reason === 'emptied' || reason === 'abort' || reason === 'error' || reason === 'track-switch') {
    clearPlaybackResumePauseMarker();
  }
}

function currentResumeSeconds(fallback) {
  if (audio && isFinite(audio.currentTime) && audio.currentTime > 0) return audio.currentTime;
  if (typeof getPlaybackCurrentSeconds === 'function') {
    var current = getPlaybackCurrentSeconds();
    if (isFinite(current) && current > 0) return current;
  }
  return Math.max(0, Number(fallback) || 0);
}

function canRefreshCurrentPlaybackUrlForResume(song) {
  if (!song || song.type === 'local' || song.source === 'local' || song.localUrl) return false;
  var provider = normalizePlaybackProvider(songProviderKey(song));
  return provider === 'netease' || provider === 'qq' || provider === 'kugou' || provider === 'qishui';
}

function playbackResumeProvider(song) {
  return song ? normalizePlaybackProvider(songProviderKey(song)) : '';
}

function playbackResumeLongPauseThresholdMs(song) {
  var provider = playbackResumeProvider(song);
  var providerMs = PLAYBACK_RESUME_LONG_PAUSE_PROVIDER_MS && PLAYBACK_RESUME_LONG_PAUSE_PROVIDER_MS[provider];
  return Math.max(30000, Number(providerMs || PLAYBACK_RESUME_LONG_PAUSE_MS || 0) || (8 * 60 * 1000));
}

function playbackResumePausedLongEnough(song) {
  if (!playbackResumeRecovery || !playbackResumeRecovery.pausedAt) return false;
  if (!song || !canRefreshCurrentPlaybackUrlForResume(song)) return false;
  var markerKey = playbackResumeRecovery.pausedSongKey || '';
  var currentKey = typeof queueItemKey === 'function' ? queueItemKey(song) : '';
  if (markerKey && currentKey && markerKey !== currentKey) return false;
  var markerSrc = playbackResumeRecovery.pausedSrc || '';
  var currentSrc = audio && (audio.currentSrc || audio.src || '') || '';
  if (markerSrc && currentSrc && markerSrc !== currentSrc) return false;
  return Date.now() - playbackResumeRecovery.pausedAt >= playbackResumeLongPauseThresholdMs(song);
}

function trackSwitchStallRecoveryAllowed(song, opts) {
  opts = opts || {};
  if (!opts.trackSwitch || opts.resumeRecovery) return true;
  return playbackResumeProvider(song) === 'qishui';
}

function isQishuiTrackStartStalled(song, opts, media, startTime, current) {
  opts = opts || {};
  if (!(opts.trackSwitch || opts.manual || opts.fastResume) || opts.resumeRecovery) return false;
  if (playbackResumeProvider(song) !== 'qishui') return false;
  if (!media || media.seeking || media.ended) return false;
  var start = Math.max(0, Number(startTime) || 0);
  var now = Math.max(0, Number(current) || 0);
  return start < 0.18 && now < 0.24;
}

function qishuiTrackStartNudgeSeconds(media) {
  var target = 0.22;
  var duration = media && isFinite(media.duration) ? Number(media.duration) : 0;
  if (duration > 0) target = Math.min(target, Math.max(0.05, duration - 0.75));
  return Math.max(0.05, target);
}

async function nudgeQishuiTrackStart(media, src, token) {
  if (!isSameAudioPlaybackTarget(media, src) || token !== trackSwitchToken || media.paused || media.ended) return false;
  var current = isFinite(media.currentTime) ? media.currentTime : 0;
  if (current >= 0.24) return false;
  try {
    if (media.readyState < 1) await waitForAudioReadyToPlay(media, 700);
    if (!isSameAudioPlaybackTarget(media, src) || token !== trackSwitchToken || media.paused || media.ended) return false;
    var target = qishuiTrackStartNudgeSeconds(media);
    media.currentTime = target;
    if (typeof syncBeatMapPlaybackCursor === 'function') syncBeatMapPlaybackCursor(target, true);
    if (typeof syncPodcastDjMapCursor === 'function') syncPodcastDjMapCursor(target, true);
    updatePlaybackProgressUi();
    await media.play();
    return isSameAudioPlaybackTarget(media, src) && token === trackSwitchToken && !media.paused && !media.ended;
  } catch (err) {
    console.warn('[PlaybackResumeRecovery] qishui start nudge failed:', err && (err.message || err));
    return false;
  }
}

function qishuiTrackStartResumeSeconds(media, current, startTime) {
  var target = Math.max(Number(current) || 0, Number(startTime) || 0, qishuiTrackStartNudgeSeconds(media));
  var duration = media && isFinite(media.duration) ? Number(media.duration) : 0;
  if (duration > 0) target = Math.min(target, Math.max(0, duration - 0.75));
  return Math.max(0, target);
}

function showQishuiTrackStartStallNotice() {
  var now = performance.now();
  if (now - (playbackResumeRecovery.lastQishuiStartNoticeAt || 0) < 8000) return;
  playbackResumeRecovery.lastQishuiStartNoticeAt = now;
  var title = '汽水播放未响应';
  var body = '音频开头解码卡住，已尝试重新接入；如果仍不播放，请拖动一下进度或切换音质。';
  if (typeof showSourceFallbackNotice === 'function') showSourceFallbackNotice(title, body);
  else if (typeof showToast === 'function') showToast(title + '：' + body);
}

function playbackFreshUrlRecoverySongKey(song) {
  if (typeof queueItemKey === 'function') return queueItemKey(song);
  return song ? [songProviderKey(song), song.id || song.mid || song.hash || ''].join(':') : '';
}

function resetPlaybackFreshUrlRecoveryBudget(song) {
  if (!playbackResumeRecovery) return;
  playbackResumeRecovery.freshUrlSongKey = playbackFreshUrlRecoverySongKey(song);
  playbackResumeRecovery.freshUrlAttemptCount = 0;
}

function playbackStallRecoveryTransaction(song, opts) {
  opts = opts || {};
  var recovery = typeof sourceFallbackRecoveryFromOptions === 'function'
    ? sourceFallbackRecoveryFromOptions(opts)
    : null;
  var recoverySongKey = typeof sourceFallbackRecoveryContentKey === 'function'
    ? sourceFallbackRecoveryContentKey(song)
    : '';
  if (
    !recovery
    && typeof sourceFallbackRecoveryIdentityActive === 'function'
    && sourceFallbackRecoveryIdentityActive(activeSourceFallbackRecovery)
    && (!recoverySongKey || activeSourceFallbackRecovery.visitedSongKeys[recoverySongKey])
  ) {
    recovery = activeSourceFallbackRecovery;
  }
  if (!recovery && typeof ensureSourceFallbackRecovery === 'function') {
    recovery = ensureSourceFallbackRecovery({}, song, currentIdx, trackSwitchToken);
  }
  return recovery;
}

async function recoverCurrentTrackPlaybackFromFreshUrl(reason, opts) {
  opts = opts || {};
  if (!playQueue.length || currentIdx < 0 || currentIdx >= playQueue.length) return false;
  var song = playQueue[currentIdx];
  if (!canRefreshCurrentPlaybackUrlForResume(song)) return false;
  var songKey = playbackFreshUrlRecoverySongKey(song);
  if (playbackResumeRecovery.freshUrlSongKey !== songKey) resetPlaybackFreshUrlRecoveryBudget(song);
  var now = performance.now();
  if (playbackResumeRecovery.pending || now - (playbackResumeRecovery.lastAttemptAt || 0) < 1200) return false;
  var recovery = playbackStallRecoveryTransaction(song, opts);
  if (!recovery) return false;
  if ((Number(playbackResumeRecovery.freshUrlAttemptCount) || 0) >= 1) {
    return settleSourceFallbackTerminal(
      currentIdx,
      trackSwitchToken,
      '当前歌曲重新取链后仍无法播放，已停止自动重试。',
      { silent: !!opts.silent, sourceFallbackRecovery: recovery }
    );
  }
  playbackResumeRecovery.freshUrlAttemptCount = (Number(playbackResumeRecovery.freshUrlAttemptCount) || 0) + 1;
  playbackResumeRecovery.pending = true;
  playbackResumeRecovery.lastAttemptAt = now;
  playbackResumeRecovery.lastReason = reason || 'resume-recovery';
  playbackResumeRecovery.serial++;
  clearPlaybackResumeWatchdogs();
  var resumeAt = currentResumeSeconds(opts.resumeAt);
  try {
    if (!opts.silent && typeof showSourceFallbackNotice === 'function') {
      showSourceFallbackNotice('播放恢复保护', '旧播放链接可能已失效，正在重新取链并回到原进度。');
    }
    var recovered = await playQueueAt(currentIdx, {
      manual: true,
      resumeAt: resumeAt,
      preserveHomeState: true,
      suppressPlayFailureNotice: true,
      resumeRecovery: true,
      sourceFallbackRecovery: recovery
    });
    if (recovered === true) return true;
    if (sourceFallbackRecoveryIdentityActive(recovery)) {
      return settleSourceFallbackTerminal(
        currentIdx,
        trackSwitchToken,
        '当前歌曲重新取链后仍无法播放，已停止自动重试。',
        { silent: !!opts.silent, sourceFallbackRecovery: recovery }
      );
    }
    return false;
  } catch (recoveryErr) {
    console.warn('[PlaybackResumeRecovery]', reason, recoveryErr);
    if (sourceFallbackRecoveryIdentityActive(recovery)) {
      settleSourceFallbackTerminal(
        currentIdx,
        trackSwitchToken,
        '当前歌曲恢复失败，已停止自动重试。',
        { silent: !!opts.silent, sourceFallbackRecovery: recovery }
      );
    }
    return false;
  } finally {
    playbackResumeRecovery.pending = false;
    forcePlaybackControlsInteractive();
  }
}

function playbackStallRecoveryOwnerStillCurrent(media, src, token, recoverySerial, queueKey) {
  if (!isSameAudioPlaybackTarget(media, src)) return false;
  if (token !== trackSwitchToken || recoverySerial !== playbackResumeRecovery.serial) return false;
  if (media.paused || media.ended || media.seeking) return false;
  if (queueKey && String(media.__mineradioQueueItemKey || '') !== queueKey) return false;
  if (typeof playbackMediaMatchesCurrentQueueItem === 'function' && !playbackMediaMatchesCurrentQueueItem(media)) return false;
  return true;
}

function schedulePlaybackStallRecovery(reason, opts) {
  opts = opts || {};
  var media = opts.ownerMedia || audio;
  if (!media || media !== audio || !media.src) return;
  if (opts.ownerToken != null && Number(opts.ownerToken) !== Number(trackSwitchToken)) return;
  var queueKey = String(opts.ownerQueueItemKey || media.__mineradioQueueItemKey || '');
  if (queueKey && String(media.__mineradioQueueItemKey || '') !== queueKey) return;
  if (typeof playbackMediaMatchesCurrentQueueItem === 'function' && !playbackMediaMatchesCurrentQueueItem(media)) return;
  var song = playQueue[currentIdx];
  if (!trackSwitchStallRecoveryAllowed(song, opts)) return;
  if (!canRefreshCurrentPlaybackUrlForResume(song)) return;
  clearPlaybackResumeWatchdogs();
  playbackResumeRecovery.serial = (Number(playbackResumeRecovery.serial) || 0) + 1;
  var src = media.currentSrc || media.src || '';
  var token = trackSwitchToken;
  var startTime = isFinite(media.currentTime) ? media.currentTime : 0;
  var recoverySerial = playbackResumeRecovery.serial;
  PLAYBACK_RESUME_STALL_DELAYS.forEach(function (delayMs) {
    var timerId = setTimeout(async function () {
      if (!playbackStallRecoveryOwnerStillCurrent(media, src, token, recoverySerial, queueKey)) return;
      var current = isFinite(media.currentTime) ? media.currentTime : 0;
      var minAdvance = delayMs > 2000 ? 0.28 : 0.08;
      if (current >= startTime + minAdvance) return;
      var qishuiStartStall = isQishuiTrackStartStalled(song, opts, media, startTime, current);
      if (qishuiStartStall && delayMs < 3000) {
        try {
          await ensurePlaybackAudioGraph('qishui-start-stall-before-nudge');
          ensureAudiblePlaybackGain('qishui-start-stall-before-nudge');
        } catch (nudgeGraphErr) {
          console.warn('[PlaybackResumeRecovery] qishui graph precheck failed:', nudgeGraphErr);
        }
        if (!playbackStallRecoveryOwnerStillCurrent(media, src, token, recoverySerial, queueKey)) return;
        if (await nudgeQishuiTrackStart(media, src, token)) return;
        return;
      }
      if (delayMs < 3000 && media.readyState >= 2 && media.networkState !== media.NETWORK_NO_SOURCE) return;
      try {
        await ensurePlaybackAudioGraph('resume-stall-before-refresh');
        ensureAudiblePlaybackGain('resume-stall-before-refresh');
      } catch (graphErr) {
        console.warn('[PlaybackResumeRecovery] graph precheck failed:', graphErr);
      }
      if (!playbackStallRecoveryOwnerStillCurrent(media, src, token, recoverySerial, queueKey)) return;
      current = isFinite(media.currentTime) ? media.currentTime : 0;
      if (current >= startTime + minAdvance) return;
      qishuiStartStall = isQishuiTrackStartStalled(song, opts, media, startTime, current);
      var recovered = await recoverCurrentTrackPlaybackFromFreshUrl(qishuiStartStall ? 'qishui-track-start-stalled' : (reason || 'resume-stalled'), {
        resumeAt: qishuiStartStall ? qishuiTrackStartResumeSeconds(media, current, startTime) : (current || startTime),
        silent: opts.silent
      });
      if (!playbackStallRecoveryOwnerStillCurrent(media, src, token, recoverySerial, queueKey)) return;
      if (!recovered && qishuiStartStall) showQishuiTrackStartStallNotice();
    }, delayMs);
    playbackResumeRecovery.timerIds.push(timerId);
  });
}

function playbackAttemptStillCurrent(media, token) {
  return !!(media && audio === media && token === trackSwitchToken);
}
var AUDIO_PLAY_REQUEST_TIMEOUT_MS = 9000;
function awaitMediaPlayWithTimeout(media, playPromise, token, timeoutMs) {
  timeoutMs = Math.max(1000, Number(timeoutMs) || AUDIO_PLAY_REQUEST_TIMEOUT_MS);
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      if (playbackAttemptStillCurrent(media, token)) {
        try { media.pause(); } catch (e) { }
      }
      var timeoutError = new Error('AUDIO_PLAY_TIMEOUT: media.play() did not start within ' + timeoutMs + 'ms');
      timeoutError.code = 'AUDIO_PLAY_TIMEOUT';
      reject(timeoutError);
    }, timeoutMs);
    Promise.resolve(playPromise).then(function (value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }, function (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}
function playbackMediaMatchesCurrentQueueItem(media) {
  if (!media || !media.src || currentIdx < 0 || currentIdx >= playQueue.length) return false;
  var song = playQueue[currentIdx];
  var expectedKey = typeof queueItemKey === 'function' ? queueItemKey(song) : '';
  var mediaKey = String(media.__mineradioQueueItemKey || '');
  return !!(expectedKey && mediaKey && expectedKey === mediaKey);
}

async function completeAudioPlayStart(opts, reason, expectedMedia, expectedToken) {
  opts = opts || {};
  if (!playbackAttemptStillCurrent(expectedMedia, expectedToken)) return false;
  await ensurePlaybackAudioGraph(reason || 'playback-started');
  if (!playbackAttemptStillCurrent(expectedMedia, expectedToken)) return false;
  switchPlaybackVisualToEmily();
  playing = true; setPlayIcon(true);
  if (typeof markStageLyricsPlaybackResume === 'function') markStageLyricsPlaybackResume(reason || 'playback-started');
  if (opts.trackSwitch) primeCinemaAfterTrackStart(reason || 'track-switch');
  if (opts.trackSwitch && !opts.resumeRecovery && typeof resetPlaybackFreshUrlRecoveryBudget === 'function') {
    var startedSong = playQueue && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
    resetPlaybackFreshUrlRecoveryBudget(startedSong);
  }
  schedulePlaybackAnalyserRecovery(reason || 'playback-started');
  if (opts.fade !== false) startPlaybackFadeIn();
  else if (!opts.preserveGain) restorePlaybackGain();
  schedulePlaybackStallRecovery(reason || 'playback-started', opts);
  forcePlaybackControlsInteractive();
  hideLoading();
  return true;
}

function canResumePausedAudioFast(opts) {
  opts = opts || {};
  return !!(
    opts.manual &&
    !opts.trackSwitch &&
    !opts.resumeRecovery &&
    audio &&
    audio.src &&
    playbackMediaMatchesCurrentQueueItem(audio) &&
    audio.paused &&
    !audio.ended
  );
}

function schedulePausedAudioResumeMaintenance(media, src, token, reason, opts) {
  opts = opts || {};
  setTimeout(async function () {
    if (!isSameAudioPlaybackTarget(media, src) || token !== trackSwitchToken || media.paused || media.ended) return;
    try {
      await applyAudioOutputDevice(media);
      await ensurePlaybackAudioGraph((reason || 'manual-resume-fast') + '-deferred-graph');
      ensureAudiblePlaybackGain((reason || 'manual-resume-fast') + '-deferred-gain');
    } catch (err) {
      console.warn('[PlaybackResumeFast] deferred maintenance failed:', err);
    }
    if (!isSameAudioPlaybackTarget(media, src) || token !== trackSwitchToken || media.paused || media.ended) return;
    schedulePlaybackAnalyserRecovery(reason || 'manual-resume-fast');
    schedulePlaybackStallRecovery(reason || 'manual-resume-fast', opts);
  }, 48);
}

async function resumePausedAudioFast(opts) {
  opts = opts || {};
  if (!canResumePausedAudioFast(opts)) return null;
  var media = audio;
  var src = media.currentSrc || media.src || '';
  var token = trackSwitchToken;
  try {
    restorePlaybackGain();
    await awaitMediaPlayWithTimeout(media, media.play(), token);
    if (!isSameAudioPlaybackTarget(media, src) || token !== trackSwitchToken) return false;
    switchPlaybackVisualToEmily();
    playing = true; setPlayIcon(true);
    if (typeof markStageLyricsPlaybackResume === 'function') {
      setTimeout(function () {
        if (isSameAudioPlaybackTarget(media, src) && token === trackSwitchToken && !media.paused && !media.ended) {
          markStageLyricsPlaybackResume('manual-resume-fast');
        }
      }, 0);
    }
    forcePlaybackControlsInteractive();
    hideLoading();
    schedulePausedAudioResumeMaintenance(media, src, token, 'manual-resume-fast', { manual: true, silent: true, fastResume: true });
    return true;
  } catch (err) {
    console.warn('[PlaybackResumeFast]', err && (err.message || err));
    return null;
  }
}

async function retryTrackSwitchAudioPlayOnce(opts, originalErr, expectedMedia, expectedToken) {
  var retryAudio = expectedMedia;
  var retrySrc = retryAudio && (retryAudio.currentSrc || retryAudio.src || '');
  if (!retryAudio || !retrySrc) throw originalErr;
  await waitForAudioReadyToPlay(retryAudio, opts.manual ? 650 : 900);
  if (!playbackAttemptStillCurrent(retryAudio, expectedToken) || !isSameAudioPlaybackTarget(retryAudio, retrySrc)) return null;
  if (retryAudio.readyState === 0 || retryAudio.networkState === retryAudio.NETWORK_EMPTY) {
    try { retryAudio.load(); } catch (e) { }
  }
  if (!audioGraphHealthy()) initAudio();
  await applyAudioOutputDevice(retryAudio);
  if (!playbackAttemptStillCurrent(retryAudio, expectedToken)) return null;
  await ensurePlaybackAudioGraph('track-switch-retry-before-play');
  if (!playbackAttemptStillCurrent(retryAudio, expectedToken)) return null;
  var retryPlay = retryAudio.play();
  await ensurePlaybackAudioGraph('track-switch-retry-after-play-request');
  await awaitMediaPlayWithTimeout(retryAudio, retryPlay, expectedToken);
  if (!playbackAttemptStillCurrent(retryAudio, expectedToken)) return null;
  return await completeAudioPlayStart(opts, 'track-switch-retry-started', retryAudio, expectedToken);
}

async function attemptAudioPlay(opts) {
  opts = opts || {};
  var expectedMedia = opts.expectedMedia || audio;
  var expectedToken = opts.expectedToken == null ? trackSwitchToken : Number(opts.expectedToken);
  try {
    if (!playbackAttemptStillCurrent(expectedMedia, expectedToken)) return false;
    var currentSongForResume = playQueue && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
    if (opts.manual && !opts.trackSwitch && !opts.resumeRecovery && audio && audio.src && audio.paused && !audio.ended && playbackResumePausedLongEnough(currentSongForResume)) {
      var staleResumeAt = currentResumeSeconds(playbackResumeRecovery && playbackResumeRecovery.pausedPosition);
      var refreshedResume = await recoverCurrentTrackPlaybackFromFreshUrl('long-pause-stale-source', {
        resumeAt: staleResumeAt,
        silent: opts.silent !== false
      });
      if (refreshedResume) return true;
    }
    if (!playbackAttemptStillCurrent(expectedMedia, expectedToken)) return false;
    var fastResume = await resumePausedAudioFast(opts);
    if (fastResume === true) return true;
    if (!playbackAttemptStillCurrent(expectedMedia, expectedToken)) return false;
    if (!audioGraphHealthy()) initAudio();
    if (opts.fade !== false) preparePlaybackFadeIn();
    if (opts.manual || opts.trackSwitch) {
      var directPlay = expectedMedia.play();
      await applyAudioOutputDevice(expectedMedia);
      if (!playbackAttemptStillCurrent(expectedMedia, expectedToken)) {
        Promise.resolve(directPlay).catch(function () { });
        return false;
      }
      await ensurePlaybackAudioGraph(opts.manual ? 'manual-after-play-request' : 'track-switch-after-play-request');
      await awaitMediaPlayWithTimeout(expectedMedia, directPlay, expectedToken);
    } else {
      await applyAudioOutputDevice(expectedMedia);
      if (!playbackAttemptStillCurrent(expectedMedia, expectedToken)) return false;
      await ensurePlaybackAudioGraph(opts.startupAutoplay ? 'startup-before-play' : 'auto-before-play');
      if (!playbackAttemptStillCurrent(expectedMedia, expectedToken)) return false;
      var autoPlay = expectedMedia.play();
      await ensurePlaybackAudioGraph(opts.startupAutoplay ? 'startup-after-play-request' : 'auto-after-play-request');
      await awaitMediaPlayWithTimeout(expectedMedia, autoPlay, expectedToken);
    }
    if (!playbackAttemptStillCurrent(expectedMedia, expectedToken)) return false;
    return await completeAudioPlayStart(opts, 'playback-started', expectedMedia, expectedToken);
  } catch (err) {
    if (!playbackAttemptStillCurrent(expectedMedia, expectedToken)) return false;
    if (opts.trackSwitch && expectedMedia && expectedMedia.src) {
      try {
        var recovered = await retryTrackSwitchAudioPlayOnce(opts, err, expectedMedia, expectedToken);
        if (recovered) return true;
        return false;
      } catch (retryErr) {
        err = retryErr;
      }
    }
    console.warn('Audio play blocked:', err && (err.message || err));
    if (!opts.trackSwitch && !opts.resumeRecovery) {
      var resumed = await recoverCurrentTrackPlaybackFromFreshUrl('play-rejected', { originalError: err, silent: opts.silent });
      if (resumed) return true;
    }
    if (!playbackAttemptStillCurrent(expectedMedia, expectedToken)) return false;
    restorePlaybackGain();
    playing = false; setPlayIcon(false);
    hideLoading();
    forcePlaybackControlsInteractive();
    if (!opts.silent && !opts.trackSwitch) showToast(opts.manual ? '播放启动失败, 请重新选择歌曲' : '播放被系统拦截, 请点击播放按钮');
    return false;
  }
}
async function playAudio(opts) {
  opts = opts || {};
  return attemptAudioPlay({ manual: !!opts.manual, silent: !!opts.silent || !!opts.startupAutoplay || !!opts.trackSwitch, startupAutoplay: !!opts.startupAutoplay, fade: opts.fade, preserveGain: !!opts.preserveGain, trackSwitch: !!opts.trackSwitch, resumeRecovery: !!opts.resumeRecovery, expectedMedia: opts.expectedMedia || audio, expectedToken: opts.expectedToken == null ? trackSwitchToken : opts.expectedToken });
}
async function togglePlay() {
  if (playToggleBusy) return;
  playToggleBusy = true;
  try {
    forcePlaybackControlsInteractive();
    if ((!audio || !audio.src) && playQueue.length && currentIdx >= 0) {
      await playQueueAt(currentIdx, { manual: true });
      return;
    }
    if (audio && audio.src && playQueue.length && currentIdx >= 0 && !playbackMediaMatchesCurrentQueueItem(audio)) {
      await playQueueAt(currentIdx, { manual: true, suppressPlayFailureNotice: true });
      return;
    }
    if ((!audio || !audio.src) && currentLocalSong && (currentLocalSong.localMissing || !currentLocalSong.localUrl)) {
      showToast('上次播放的是本地文件，请重新导入后继续');
      return;
    }
    if (!audio) return;
    if (audio.paused || audio.ended) {
      await attemptAudioPlay({ manual: true });
    } else {
      if (typeof cuefieldAutoMixExecuting !== 'undefined' && cuefieldAutoMixExecuting && typeof resetCuefieldAutoMix === 'function') {
        resetCuefieldAutoMix('manual-pause');
      }
      if (
        typeof albumGaplessState !== 'undefined'
        && albumGaplessState
        && albumGaplessState.preload
        && (albumGaplessState.preload.mixPending || albumGaplessState.preload.mixStarted)
        && typeof clearAlbumGaplessPreload === 'function'
      ) clearAlbumGaplessPreload('manual-pause');
      await fadeOutAndPauseAudio();
      playing = false;
      setPlayIcon(false);
      hideLoading();
      safePlaybackStep('listen-stats-pause', function () { updateListenStatsTick(true); });
      forcePlaybackControlsInteractive();
      safePlaybackStep('sync-pause-state', function () { syncPlaybackStateFromAudioEvent('manual-pause'); });
      safePlaybackStep('pause-controls-hide', function () { scheduleControlsHide(520); });
    }
  } catch (err) {
    console.warn('[TogglePlay]', err);
    playing = !!(audio && !audio.paused);
    setPlayIcon(playing);
    hideLoading();
    forcePlaybackControlsInteractive();
    if (!audio || !audio.src) showToast('播放控制失败');
  } finally {
    playToggleBusy = false;
  }
}
function setPlayIcon(p) {
  document.getElementById('play-icon').innerHTML = p
    ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
    : '<path d="M8 5v14l11-7z"/>';
}
function shuffleArrayInPlace(items) {
  for (var i = items.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}
function reorderQueueForShufflePlaybackOrder(startIdx, opts) {
  opts = opts || {};
  if (!playQueue.length) return -1;
  startIdx = Math.round(Number(startIdx));
  if (!isFinite(startIdx) || startIdx < 0 || startIdx >= playQueue.length) {
    startIdx = currentIdx >= 0 && currentIdx < playQueue.length ? currentIdx : 0;
  }
  if (playQueue.length > 1) {
    var currentSong = playQueue[startIdx];
    var upcoming = [];
    for (var i = 0; i < playQueue.length; i++) {
      if (i !== startIdx) upcoming.push(playQueue[i]);
    }
    shuffleArrayInPlace(upcoming);
    playQueue.length = 0;
    playQueue.push(currentSong);
    for (var j = 0; j < upcoming.length; j++) playQueue.push(upcoming[j]);
  }
  currentIdx = 0;
  if (opts.renderPanel !== false) safeRenderQueuePanel(opts.reason || 'shuffle-playback-order', { animate: false, scrollCurrent: false, deferWhenHidden: false });
  if (opts.rebuildShelf !== false) safeShelfRebuild(opts.reason || 'shuffle-playback-order', true);
  if (opts.persistSnapshot !== false && typeof saveLastPlaybackSnapshot === 'function') saveLastPlaybackSnapshot(true, opts.reason || 'shuffle-playback-order');
  return currentIdx;
}
function nextTrack(userInitiated) {
  if (!playQueue.length) return;
  playToggleBusy = false;
  forcePlaybackControlsInteractive();
  if (currentIdx >= playQueue.length - 1 && queueHydrationState && queueHydrationState.queueRef === playQueue && (queueHydrationState.active || queueHydrationState.loading) && !queueHydrationState.error) {
    var previousTail = currentIdx;
    Promise.resolve(hydratePlaylistQueueNextPage('queue-tail')).then(function () {
      if (playQueue.length <= previousTail + 1 && queueHydrationState && queueHydrationState.error) {
        showToast('后续歌曲载入失败，当前歌曲保持不变');
        return false;
      }
      currentIdx = playQueue.length > previousTail + 1 ? previousTail + 1 : 0;
      var tailOpts = userInitiated ? { manual: true, suppressPlayFailureNotice: true } : { suppressPlayFailureNotice: true };
      if (playMode === 'shuffle') tailOpts.skipShuffleOrder = true;
      return playQueueAt(currentIdx, tailOpts);
    }).finally(forcePlaybackControlsInteractive);
    return;
  }
  if (playMode === 'shuffle') currentIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % playQueue.length;
  else currentIdx = (currentIdx + 1) % playQueue.length;
  var opts = userInitiated ? { manual: true, suppressPlayFailureNotice: true } : { suppressPlayFailureNotice: true };
  if (playMode === 'shuffle') opts.skipShuffleOrder = true;
  Promise.resolve(playQueueAt(currentIdx, opts)).finally(forcePlaybackControlsInteractive);
}
function prevTrack(userInitiated) {
  if (!playQueue.length) return;
  playToggleBusy = false;
  forcePlaybackControlsInteractive();
  currentIdx = (currentIdx - 1 + playQueue.length) % playQueue.length;
  var opts = userInitiated ? { manual: true, suppressPlayFailureNotice: true } : { suppressPlayFailureNotice: true };
  if (playMode === 'shuffle') opts.skipShuffleOrder = true;
  Promise.resolve(playQueueAt(currentIdx, opts)).finally(forcePlaybackControlsInteractive);
}
function shuffleQueue() {
  reorderQueueForShufflePlaybackOrder(currentIdx, { reason: 'shuffle-queue' });
  showToast('队列已随机');
}
function clearQueue() {
  if (typeof cancelPlaylistQueueHydration === 'function') cancelPlaylistQueueHydration('clear-queue');
  playQueue = []; currentIdx = -1;
  currentLocalSong = null;
  startupRestoreHomePending = false;
  pendingPlaybackResumeAt = 0;
  restoredLastPlaybackSnapshot = null;
  try { localStorage.removeItem(LAST_PLAYBACK_STORE_KEY); } catch (e) { }
  safeRenderQueuePanel('clear-queue');
  safeShelfRebuild('clear-queue');
  updateCustomCoverButton();
  updateCustomLyricControls();
  updateEmptyHomeVisibility({ forceLoad: false });
}
function removeFromQueue(idx) {
  if (idx < 0 || idx >= playQueue.length) return;
  playQueue.splice(idx, 1);
  if (currentIdx >= playQueue.length) currentIdx = playQueue.length - 1;
  safeRenderQueuePanel('remove-queue-item');
  safeShelfRebuild('remove-queue-item');
  updateCustomCoverButton();
  updateCustomLyricControls();
  updateEmptyHomeVisibility({ forceLoad: false });
}
function playModeLabel(mode) {
  return { loop: '顺序循环', shuffle: '随机播放', single: '单曲循环' }[mode] || '顺序循环';
}

function playModeIconMarkup(mode) {
  if (mode === 'shuffle') {
    return '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>';
  }
  if (mode === 'single') {
    return '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><path d="M12 9v6"/><path d="M10.5 10.5 12 9l1.5 1.5"/>';
  }
  return '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>';
}

function updatePlayModeButton(animate) {
  var label = playModeLabel(playMode);
  var chip = document.getElementById('play-mode-chip');
  var btn = document.getElementById('play-mode-btn');
  var icon = document.getElementById('play-mode-icon');
  if (chip) chip.textContent = label;
  if (btn) {
    btn.dataset.mode = playMode;
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.classList.toggle('active', playMode !== 'loop');
  }
  if (icon) icon.innerHTML = playModeIconMarkup(playMode);
  if (!animate || !btn) return;
  if (window.gsap) {
    window.gsap.killTweensOf(btn);
    if (icon) window.gsap.killTweensOf(icon);
    window.gsap.timeline({ defaults: { overwrite: true } })
      .fromTo(btn, { scale: 0.86, rotate: -8 }, { scale: 1.12, rotate: 4, duration: 0.16, ease: 'power2.out' })
      .to(btn, { scale: 1, rotate: 0, duration: 0.34, ease: 'back.out(2.1)' });
    window.gsap.fromTo(btn,
      { boxShadow: '0 0 0 0 rgba(255,63,85,.36)' },
      { boxShadow: '0 0 0 14px rgba(255,63,85,0)', duration: 0.58, ease: 'sine.out', overwrite: false, onComplete: function () { window.gsap.set(btn, { clearProps: 'boxShadow' }); } }
    );
    if (icon) window.gsap.fromTo(icon, { y: 4, autoAlpha: 0.32, rotate: -22, scale: 0.74 }, { y: 0, autoAlpha: 1, rotate: 0, scale: 1, duration: 0.42, ease: 'expo.out', overwrite: true });
  } else {
    btn.classList.remove('mode-switching');
    void btn.offsetWidth;
    btn.classList.add('mode-switching');
    setTimeout(function () { btn.classList.remove('mode-switching'); }, 460);
  }
}

function cyclePlayMode() {
  var modes = ['loop', 'shuffle', 'single'];
  var idx = modes.indexOf(playMode);
  var prevMode = playMode;
  playMode = modes[(idx + 1) % modes.length];
  if (playMode === 'shuffle' && prevMode !== 'shuffle') {
    reorderQueueForShufflePlaybackOrder(currentIdx, { reason: 'play-mode-shuffle' });
  }
  if (typeof syncActiveAudioRepeatMode === 'function') syncActiveAudioRepeatMode(audio);
  if (playMode === 'single' && prevMode !== 'single') {
    if (typeof clearAlbumGaplessPreload === 'function') clearAlbumGaplessPreload('play-mode-single');
    if (typeof resetCuefieldAutoMix === 'function') resetCuefieldAutoMix('play-mode-single');
  }
  updatePlayModeButton(true);
  showToast('播放模式: ' + playModeLabel(playMode));
}
updatePlayModeButton(false);
