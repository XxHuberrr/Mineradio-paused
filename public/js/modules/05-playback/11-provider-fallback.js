var firstPlayDone = false;

function playbackProviderLabel(song) {
  var provider = songProviderKey(song);
  if (provider === 'qq') return 'QQ 音乐';
  if (provider === 'kugou') return '酷狗音乐';
  if (provider === 'qishui') return '汽水音乐';
  if (provider === 'spotify') return 'Spotify';
  return '网易云';
}
function playbackLoginProvider(song) {
  return normalizePlaybackProvider(songProviderKey(song));
}
function playbackRestrictionRawCategory(song, data) {
  data = data || {};
  var restriction = data.restriction || {};
  return data.reason || data.category || data.errorCategory || restriction.category || restriction.reason || '';
}
function playbackRestrictionLooksVipLocked(song, data) {
  data = data || {};
  var restriction = data.restriction || {};
  if (typeof songRequiresVip === 'function' && songRequiresVip(Object.assign({}, song || {}, data || {}))) return true;
  if (data.trial || data.needVip || data.need_vip || data.vipRequired || data.onlyVipPlayable || data.only_vip_playable) return true;
  var text = [
    data.error,
    data.message,
    data.reason,
    data.category,
    restriction.category,
    restriction.reason,
    restriction.message,
    data.rawMessage,
    restriction.rawMessage
  ].map(function (value) { return String(value || '').toLowerCase(); }).join(' ');
  return /vip_required|paid_required|trial_only|need_vip|only_vip|member|vip|会员|付费|购买|数字专辑|专辑/.test(text);
}
function playbackRestrictionMissingPlaybackKey(data) {
  data = data || {};
  var restriction = data.restriction || {};
  return !!(data.missingPlaybackKey || restriction.missingPlaybackKey);
}
function playbackRestrictionCategory(song, data) {
  var category = playbackRestrictionRawCategory(song, data);
  var provider = playbackLoginProvider(song);
  var status = platformStatus(provider) || {};
  var mergedStatus = Object.assign({}, status, data || {}, data && data.restriction || {});
  var loggedIn = !!(status.loggedIn || data && data.loggedIn);
  var vipLevel = typeof providerVipLevel === 'function' ? providerVipLevel(provider, mergedStatus) : 'none';
  var membershipUnknown = !!(
    provider === 'qq'
    && loggedIn
    && (
      status.membershipKnown === false
      || status.membershipStale
      || status.authorizationIncomplete
      || status.vipSyncState === 'unknown'
    )
  );
  var vipLocked = playbackRestrictionLooksVipLocked(song, data);
  if (vipLocked && !playbackRestrictionMissingPlaybackKey(data)) {
    if (category === 'login_required' && loggedIn && vipLevel === 'none' && !membershipUnknown) return 'vip_required';
    if (!category || category === 'url_unavailable' || category === 'copyright_unavailable') {
      if (loggedIn && vipLevel === 'none' && !membershipUnknown) return 'vip_required';
    }
  }
  if (!category && data && data.error && /401|403|login_required|auth|cookie|credential|unauthorized|forbidden/i.test(String(data.error))) return loggedIn && vipLocked ? 'vip_required' : 'login_required';
  if (!category && data && data.error && /vip|member|paid|trial|会员|付费|购买/i.test(String(data.error))) return loggedIn ? 'vip_required' : 'login_required';
  return category || 'url_unavailable';
}
function playbackProviderMembershipText(provider, data) {
  var status = platformStatus(provider) || {};
  var mergedStatus = Object.assign({}, status, data || {}, data && data.restriction || {});
  var level = typeof providerVipLevel === 'function' ? providerVipLevel(provider, mergedStatus) : 'none';
  if (level === 'svip') return 'SVIP';
  if (level === 'vip') return provider === 'spotify' ? 'Premium' : 'VIP';
  if (
    provider === 'qq'
    && status.loggedIn
    && (
      status.membershipKnown === false
      || status.membershipStale
      || status.authorizationIncomplete
      || status.vipSyncState === 'unknown'
    )
  ) return '会员待同步';
  return '普通账号';
}
function playbackRestrictionNotice(song, data) {
  data = data || {};
  var restriction = data.restriction || {};
  var category = playbackRestrictionCategory(song, data);
  var provider = playbackProviderLabel(song);
  var providerKey = playbackLoginProvider(song);
  var status = platformStatus(providerKey) || {};
  var loggedIn = !!(status.loggedIn || data.loggedIn);
  var membershipPending = !!(
    providerKey === 'qq'
    && loggedIn
    && (
      status.membershipKnown === false
      || status.membershipStale
      || status.authorizationIncomplete
      || status.vipSyncState === 'unknown'
    )
  );
  var membership = playbackProviderMembershipText(providerKey, data);
  var message = data.message || restriction.message || '';
  if (category === 'vip_required' || category === 'paid_required' || category === 'trial_only') {
    var needText = category === 'paid_required' ? '购买、数字专辑或更高权限' : (category === 'trial_only' ? '完整播放权限' : '会员权限');
    var title = membershipPending ? 'QQ 会员状态待同步' : (loggedIn ? '当前平台没有会员状态' : '当前平台未登录会员');
    var body = message || (provider + ' 已识别为会员/付费曲目，当前状态是 ' + membership + '，缺少' + needText + '。');
    if (loggedIn && body.indexOf('当前状态') < 0) body += ' 当前状态是 ' + membership + '。';
    return { category: category, title: title, body: body + ' 可以登录会员账号、降低音质或切换到其它音源。', action: 'upgrade', toast: title };
  }
  if (category === 'login_required') {
    if (loggedIn && playbackRestrictionMissingPlaybackKey(data)) {
      return {
        category: category,
        title: '平台播放授权未完成',
        body: message || (provider + ' 已登录，但还缺少播放授权，请重新打开官方登录窗口完成授权。'),
        action: 'login',
        toast: '播放授权未完成'
      };
    }
    return {
      category: category,
      title: '当前平台未登录',
      body: (message || (provider + ' 需要登录后才能获取播放地址。')) + ' 正在打开对应登录入口。',
      action: 'login',
      toast: '当前平台未登录'
    };
  }
  if (category === 'provider_limited') {
    return {
      category: category,
      title: '平台仅作为匹配源',
      body: message || (provider + ' 当前只提供搜索/匹配信息，播放会自动寻找其它可播版本。'),
      action: 'switch_source',
      toast: '正在自动换源'
    };
  }
  if (category === 'copyright_unavailable') {
    return {
      category: category,
      title: '当前平台版权不可播',
      body: (message || (provider + ' 当前版权暂不可播。')) + ' 可以换一个平台版本。',
      action: 'switch_source',
      toast: '版权不可播'
    };
  }
  return {
    category: category,
    title: '当前平台没有可用音源',
    body: (message || (provider + ' 没有返回可播放地址。')) + ' 可能是版权、地区、会员或网络限制，可以换源或稍后重试。',
    action: 'switch_source',
    toast: '当前平台没有可用音源'
  };
}
function playbackRestrictionMessage(song, data) {
  var notice = playbackRestrictionNotice(song, data);
  return notice.body || notice.title;
  data = data || {};
  var restriction = data.restriction || {};
  var category = data.reason || restriction.category || '';
  var provider = playbackProviderLabel(song);
  var message = data.message || restriction.message || '';
  if (!message) {
    if (category === 'login_required') message = provider + '需要登录后再尝试播放';
    else if (category === 'vip_required') message = provider + '歌曲需要会员权限';
    else if (category === 'paid_required') message = provider + '歌曲需要购买或更高权限';
    else if (category === 'trial_only') message = provider + '仅返回试听片段';
    else if (category === 'copyright_unavailable') message = provider + '版权暂不可播';
    else if (category === 'provider_limited') message = provider + '当前只作为匹配源，正在寻找其它可播版本';
    else message = provider + '没有返回可播放地址';
  }
  if (category === 'login_required') return message + ' · 正在打开登录';
  if (category === 'provider_limited') return message + ' · 可以自动换源';
  if (category === 'copyright_unavailable' || category === 'url_unavailable') return message + ' · 可以试试另一个平台版本';
  return message;
}
function qqPlaybackRetryQualities(requestedQuality, resolvedLevel) {
  requestedQuality = normalizePlaybackQualityForProvider(requestedQuality || getProviderPlaybackQuality('qq'), 'qq');
  resolvedLevel = String(resolvedLevel || '').toLowerCase();
  var pool = [];
  if (requestedQuality === 'jymaster' || requestedQuality === 'hires' || requestedQuality === 'lossless' || resolvedLevel === 'hires' || resolvedLevel === 'lossless') {
    pool = ['exhigh', 'standard'];
  } else if (requestedQuality === 'exhigh' || resolvedLevel === 'exhigh') {
    pool = ['standard'];
  }
  return pool.filter(function (q) { return q !== requestedQuality; });
}
async function retryQQPlaybackWithCompatibleQuality(song, idx, token, opts, data, requestedQuality) {
  opts = opts || {};
  if (playbackRestrictionCategory(song, data) === 'login_required' || playbackRestrictionMissingPlaybackKey(data)) return false;
  var tried = Array.isArray(opts.qqQualityTried) ? opts.qqQualityTried.slice() : [];
  [requestedQuality, data && data.level].forEach(function (q) {
    q = normalizePlaybackQuality(q || '');
    if (q && tried.indexOf(q) < 0) tried.push(q);
  });
  var candidates = qqPlaybackRetryQualities(requestedQuality, data && data.level).filter(function (q) { return tried.indexOf(q) < 0; });
  if (!candidates.length || token !== trackSwitchToken) return false;
  var nextQuality = candidates[0];
  var resolvedQuality = normalizePlaybackQuality(data && data.level);
  markPlaybackQualityRuntimeCap(song, 'qq', nextQuality, 'qq-url-unavailable');
  if (!opts.startupAutoplay) showSourceFallbackNotice('QQ 音质自动兼容', '当前音质启动失败，正在切到 ' + playbackQualityLabel(nextQuality, 'qq') + '。');
  var retryResumeAt = opts.resumeAt;
  if (retryResumeAt == null && opts.startupAutoplay && pendingPlaybackResumeAt > 0) retryResumeAt = pendingPlaybackResumeAt;
  var retryStarted = await playQueueAt(idx, Object.assign({}, opts, {
    qualityOverride: nextQuality,
    qqQualityTried: tried,
    resumeAt: retryResumeAt,
  }));
  return retryStarted === true;
}
var sourceFallbackNoticeTimer = null;
function closeSourceFallbackNotice() {
  var notice = document.getElementById('source-fallback-notice');
  if (sourceFallbackNoticeTimer) { clearTimeout(sourceFallbackNoticeTimer); sourceFallbackNoticeTimer = null; }
  if (notice) notice.classList.remove('show');
  var stack = document.getElementById('source-fallback-stack');
  if (stack) Array.prototype.slice.call(stack.children || []).forEach(removeSourceFallbackCard);
}
function ensureSourceFallbackStack() {
  var stack = document.getElementById('source-fallback-stack');
  if (stack) return stack;
  stack = document.createElement('div');
  stack.id = 'source-fallback-stack';
  stack.setAttribute('aria-live', 'polite');
  document.body.appendChild(stack);
  return stack;
}
function removeSourceFallbackCard(card) {
  if (!card) return;
  card.classList.add('leaving');
  setTimeout(function () {
    if (card.parentNode) card.parentNode.removeChild(card);
  }, 260);
}
function showSourceFallbackNotice(title, body) {
  var stack = ensureSourceFallbackStack();
  if (stack) {
    var card = document.createElement('div');
    card.className = 'source-fallback-card';
    var head = document.createElement('div');
    head.className = 'source-fallback-head';
    var titleElNew = document.createElement('div');
    titleElNew.className = 'source-fallback-title';
    titleElNew.textContent = title || '自动换源';
    var close = document.createElement('button');
    close.className = 'source-fallback-close';
    close.type = 'button';
    close.textContent = '×';
    close.onclick = function () { removeSourceFallbackCard(card); };
    var bodyElNew = document.createElement('div');
    bodyElNew.className = 'source-fallback-body';
    bodyElNew.textContent = body || '';
    head.appendChild(titleElNew);
    head.appendChild(close);
    card.appendChild(head);
    card.appendChild(bodyElNew);
    stack.insertBefore(card, stack.firstChild || null);
    while (stack.children.length > 4) removeSourceFallbackCard(stack.lastElementChild);
    requestAnimationFrame(function () { card.classList.add('show'); });
    setTimeout(function () { removeSourceFallbackCard(card); }, 5600);
    return;
  }
  var notice = document.getElementById('source-fallback-notice');
  var titleEl = document.getElementById('source-fallback-title');
  var bodyEl = document.getElementById('source-fallback-body');
  if (!notice || !titleEl || !bodyEl) return;
  titleEl.textContent = title || '自动换源';
  bodyEl.textContent = body || '';
  notice.classList.add('show');
  if (sourceFallbackNoticeTimer) clearTimeout(sourceFallbackNoticeTimer);
  sourceFallbackNoticeTimer = setTimeout(closeSourceFallbackNotice, 5000);
}
function normalizeMatchText(text) {
  return String(text || '').toLowerCase()
    .replace(/[（(【\[].*?[）)】\]]/g, '')
    .replace(/[\s·・\-—_.,，。:：'"“”‘’/\\|]+/g, '');
}
function artistNameParts(song) {
  var parts = [];
  if (song && Array.isArray(song.artists)) {
    song.artists.forEach(function (a) { if (a && a.name) parts.push(a.name); });
  }
  if (song && song.artist) {
    String(song.artist).split(/\s*\/\s*|\s*,\s*|、|&| feat\.? | ft\.? /i).forEach(function (name) {
      if (name && name.trim()) parts.push(name.trim());
    });
  }
  return parts.map(normalizeMatchText).filter(Boolean);
}
function isSameTitleArtist(source, candidate) {
  if (!source || !candidate) return false;
  if (normalizeMatchText(source.name || source.title) !== normalizeMatchText(candidate.name || candidate.title)) return false;
  var a = artistNameParts(source);
  var b = artistNameParts(candidate);
  if (!a.length || !b.length) return false;
  return a.some(function (name) { return b.indexOf(name) >= 0; });
}
var SOURCE_FALLBACK_SEARCH_TIMEOUT_MS = 6500;
var SOURCE_FALLBACK_DIRECT_PROVIDERS = ['netease', 'qq', 'kugou'];
var SOURCE_FALLBACK_RECOVERY_TIMEOUT_MS = 20000;
var SOURCE_FALLBACK_MAX_QUEUE_ADVANCES = 2;
var SOURCE_FALLBACK_MAX_PROVIDER_ATTEMPTS = 4;
var sourceFallbackRecoverySerial = 0;
var activeSourceFallbackRecovery = null;
var sourceFallbackBudgetTimeoutResult = {};

function sourceFallbackRecoveryContentKey(song) {
  if (!song) return '';
  var title = normalizeMatchText(song.name || song.title || '');
  var artists = artistNameParts(song).sort().join(',');
  if (title && artists) return title + '|' + artists;
  return sourceFallbackSongKey(song);
}
function sourceFallbackRecoveryFromOptions(opts) {
  if (!opts) return null;
  return opts.sourceFallbackRecovery
    || (opts.playbackOpts && opts.playbackOpts.sourceFallbackRecovery)
    || null;
}
function sourceFallbackRecoveryIdentityActive(recovery) {
  return !!(
    recovery
    && activeSourceFallbackRecovery === recovery
    && !recovery.terminal
    && !recovery.cancelled
    && !recovery.completed
  );
}
function sourceFallbackRecoveryRemainingMs(recovery) {
  if (!sourceFallbackRecoveryIdentityActive(recovery)) return 0;
  return Math.max(0, Number(recovery.deadlineAt) - Date.now());
}
function sourceFallbackRecoveryCanContinue(recovery) {
  return sourceFallbackRecoveryRemainingMs(recovery) > 0;
}
function cancelSourceFallbackRecovery(reason) {
  var recovery = activeSourceFallbackRecovery;
  if (!recovery || recovery.terminal || recovery.completed) return false;
  recovery.cancelled = true;
  recovery.cancelReason = String(reason || 'superseded');
  activeSourceFallbackRecovery = null;
  return true;
}
function completeSourceFallbackRecovery(recovery) {
  if (!recovery || recovery.terminal || recovery.cancelled) return false;
  recovery.completed = true;
  if (activeSourceFallbackRecovery === recovery) activeSourceFallbackRecovery = null;
  return true;
}
function beginSourceFallbackPlaybackInvocation(opts) {
  var recovery = sourceFallbackRecoveryFromOptions(opts);
  if (!recovery) {
    cancelSourceFallbackRecovery('new-root-playback');
    return true;
  }
  return sourceFallbackRecoveryCanContinue(recovery);
}
function ensureSourceFallbackRecovery(opts, song, idx, token) {
  var recovery = sourceFallbackRecoveryFromOptions(opts);
  if (recovery) return sourceFallbackRecoveryIdentityActive(recovery) ? recovery : null;
  cancelSourceFallbackRecovery('new-recovery');
  recovery = {
    id: 'source-fallback-' + Date.now() + '-' + (++sourceFallbackRecoverySerial),
    startedAt: Date.now(),
    deadlineAt: Date.now() + SOURCE_FALLBACK_RECOVERY_TIMEOUT_MS,
    rootIndex: idx,
    rootToken: token,
    queueAdvances: 0,
    providerAttempts: 0,
    silent: !!(opts && opts.startupAutoplay),
    visitedSongKeys: Object.create(null),
    attemptedProviderKeys: Object.create(null),
    terminal: false,
    cancelled: false,
    completed: false
  };
  var songKey = sourceFallbackRecoveryContentKey(song);
  if (songKey) recovery.visitedSongKeys[songKey] = true;
  activeSourceFallbackRecovery = recovery;
  return recovery;
}
function sourceFallbackQueuePlaybackOptions(opts, recovery) {
  var next = Object.assign({}, opts || {});
  delete next.fallbackOriginalSong;
  delete next.fallbackCandidateSong;
  delete next.preResolvedPlaybackData;
  delete next.preloadedAudio;
  delete next.preloadedData;
  delete next.preloadedProxyAudioUrl;
  next.fallbackDepth = 0;
  next.sourceFallbackRecovery = recovery;
  return next;
}
function sourceFallbackRecoveryFailureOptions(opts) {
  var recovery = sourceFallbackRecoveryFromOptions(opts);
  if (!recovery) return null;
  return {
    silent: !!recovery.silent,
    playbackOpts: sourceFallbackQueuePlaybackOptions(opts, recovery),
    sourceFallbackRecovery: recovery
  };
}
function settleExpiredSourceFallbackPlayback(idx, token, opts, message) {
  var recovery = sourceFallbackRecoveryFromOptions(opts);
  if (!sourceFallbackRecoveryIdentityActive(recovery)) return false;
  if (opts && opts.fallbackOriginalSong && opts.fallbackCandidateSong) {
    restoreSourceFallbackQueueItem(idx, opts.fallbackOriginalSong, opts.fallbackCandidateSong, token);
  }
  return settleSourceFallbackTerminal(
    currentIdx,
    trackSwitchToken,
    message || '自动恢复已达到时间上限，请稍后手动重试。',
    sourceFallbackRecoveryFailureOptions(opts) || { sourceFallbackRecovery: recovery }
  );
}
function sourceFallbackProviderAttemptKey(recovery, song, provider) {
  return (sourceFallbackRecoveryContentKey(song) || sourceFallbackSongKey(song)) + '|' + normalizePlaybackProvider(provider);
}
function beginSourceFallbackProviderAttempt(recovery, song, provider) {
  if (!sourceFallbackRecoveryCanContinue(recovery)) return false;
  var key = sourceFallbackProviderAttemptKey(recovery, song, provider);
  if (recovery.attemptedProviderKeys[key]) return false;
  if (recovery.providerAttempts >= SOURCE_FALLBACK_MAX_PROVIDER_ATTEMPTS) return false;
  recovery.attemptedProviderKeys[key] = true;
  recovery.providerAttempts++;
  return true;
}
function awaitSourceFallbackBudget(promise, recovery) {
  if (!recovery) return Promise.resolve(promise);
  var remaining = sourceFallbackRecoveryRemainingMs(recovery);
  if (remaining <= 0) return Promise.resolve(sourceFallbackBudgetTimeoutResult);
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      resolve(sourceFallbackBudgetTimeoutResult);
    }, remaining);
    Promise.resolve(promise).then(function (value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }, function (error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

function sourceFallbackProviderTitle(provider) {
  if (provider === 'qq') return 'QQ 音乐';
  if (provider === 'kugou') return '酷狗音乐';
  return '网易云';
}
function sourceFallbackProviderReady(provider) {
  provider = normalizePlaybackProvider(provider);
  if (SOURCE_FALLBACK_DIRECT_PROVIDERS.indexOf(provider) < 0) return false;
  var status = typeof platformStatus === 'function' ? platformStatus(provider) : null;
  if (!status || !status.loggedIn) return false;
  if (provider === 'qq' || provider === 'kugou') return status.playbackKeyReady === true;
  return true;
}
function alternatePlaybackProviders(song) {
  var currentProvider = normalizePlaybackProvider(songProviderKey(song));
  var ordered = typeof accountProviderOrder === 'function'
    ? accountProviderOrder()
    : SOURCE_FALLBACK_DIRECT_PROVIDERS.slice();
  var seen = {};
  var providers = [];
  ordered.concat(SOURCE_FALLBACK_DIRECT_PROVIDERS).forEach(function (provider) {
    provider = normalizePlaybackProvider(provider);
    if (seen[provider] || provider === currentProvider || !sourceFallbackProviderReady(provider)) return;
    seen[provider] = true;
    providers.push(provider);
  });
  return providers;
}
function alternatePlaybackProvider(song) {
  return alternatePlaybackProviders(song)[0] || '';
}
async function searchAlternatePlatformSong(song, requestedTarget, recovery) {
  var target = requestedTarget || alternatePlaybackProvider(song);
  if (!target || !sourceFallbackProviderReady(target)) return null;
  if (recovery && !sourceFallbackRecoveryCanContinue(recovery)) return null;
  var artist = artistNameParts(song)[0] || '';
  var query = [song.name || song.title || '', song.artist || artist].filter(Boolean).join(' ').trim();
  if (!query) return null;
  var url = target === 'qq'
    ? '/api/qq/search?keywords=' + encodeURIComponent(query) + '&limit=8'
    : (target === 'kugou'
      ? '/api/kugou/search?keywords=' + encodeURIComponent(query) + '&limit=8'
      : '/api/search?keywords=' + encodeURIComponent(query) + '&limit=12');
  var data = await awaitSourceFallbackBudget(
    apiJson(url, { timeoutMs: SOURCE_FALLBACK_SEARCH_TIMEOUT_MS }),
    recovery
  );
  if (data === sourceFallbackBudgetTimeoutResult || (recovery && !sourceFallbackRecoveryCanContinue(recovery))) return null;
  var list = data && (data.songs || data.result || []);
  for (var i = 0; i < list.length; i++) {
    if (typeof sourceCandidateRejectReason === 'function' && sourceCandidateRejectReason(song, list[i], target)) continue;
    if (isSameTitleArtist(song, list[i])) return cloneSong(list[i]);
  }
  return null;
}
function sourceFallbackSongKey(song) {
  if (!song) return '';
  if (typeof queueItemKey === 'function') return queueItemKey(song);
  return [songProviderKey(song), song.id || song.mid || song.hash || '', song.name || song.title || '', song.artist || ''].join(':');
}
function restoreSourceFallbackQueueItem(idx, originalSong, candidateSong, expectedToken) {
  if (!originalSong || idx < 0 || idx >= playQueue.length) return false;
  if (expectedToken != null && expectedToken !== trackSwitchToken) return false;
  if (currentIdx !== idx || sourceFallbackSongKey(playQueue[idx]) !== sourceFallbackSongKey(candidateSong)) return false;
  playQueue[idx] = hydrateCustomCover(originalSong);
  if (typeof updateControlTrackInfo === 'function') updateControlTrackInfo(playQueue[idx]);
  var title = document.getElementById('thumb-title');
  var artist = document.getElementById('thumb-artist');
  if (title) title.textContent = playQueue[idx].name || playQueue[idx].title || '';
  if (artist) artist.textContent = playQueue[idx].artist || '';
  safeRenderQueuePanel('source-fallback-rollback', { scrollCurrent: miniQueueOpen });
  safeShelfRebuild('source-fallback-rollback');
  return true;
}
function settleSourceFallbackTerminal(idx, token, message, opts) {
  opts = opts || {};
  var recovery = sourceFallbackRecoveryFromOptions(opts);
  if (token !== trackSwitchToken || currentIdx !== idx) return false;
  if (recovery) {
    if (!sourceFallbackRecoveryIdentityActive(recovery)) return false;
    recovery.terminal = true;
    recovery.terminalAt = Date.now();
    if (activeSourceFallbackRecovery === recovery) activeSourceFallbackRecovery = null;
  }
  hideLoading();
  forcePlaybackControlsInteractive();
  playToggleBusy = false;
  markQueueItemPlaybackFailed(idx, recovery);
  if (typeof clearAlbumGaplessPreload === 'function') clearAlbumGaplessPreload('source-fallback-terminal');
  if (typeof resetCuefieldAutoMix === 'function') resetCuefieldAutoMix('source-fallback-terminal');
  if (typeof clearPlaybackResumeWatchdogs === 'function') clearPlaybackResumeWatchdogs();
  if (typeof playbackResumeRecovery !== 'undefined' && playbackResumeRecovery) {
    playbackResumeRecovery.serial = (Number(playbackResumeRecovery.serial) || 0) + 1;
    playbackResumeRecovery.pending = false;
  }
  if (audio) {
    try {
      audioFadeSerial++;
      clearAudioFadeTimers();
      audio.onended = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.__mineradioQueueItemKey = '';
      audio.__mineradioTrackSwitchToken = 0;
      audio.load();
    } catch (e) { }
  }
  playing = false;
  setPlayIcon(false);
  if (typeof syncPlaybackStateFromAudioEvent === 'function') syncPlaybackStateFromAudioEvent('source-fallback-terminal');
  if (!opts.silent) showSourceFallbackNotice('当前没有可用音源', message || '当前歌曲不可播放，并且没有其它已登录、已授权的音源可接管。');
  return false;
}
function markQueueItemPlaybackFailed(idx, recovery) {
  if (!playQueue[idx]) return;
  playQueue[idx]._lastPlaybackFailAt = Date.now();
  playQueue[idx]._lastPlaybackFailRecoveryId = recovery && recovery.id ? recovery.id : '';
}
var MAX_RECENT_AUTO_QUEUE_FAILURES = 12;
function recentQueuePlaybackFailureCount(recovery) {
  var now = Date.now();
  var count = 0;
  for (var index = 0; index < playQueue.length; index++) {
    var failedAt = Number(playQueue[index] && playQueue[index]._lastPlaybackFailAt) || 0;
    if (recovery && playQueue[index] && playQueue[index]._lastPlaybackFailRecoveryId !== recovery.id) continue;
    if (failedAt && now - failedAt <= 18000) {
      count++;
      if (count >= MAX_RECENT_AUTO_QUEUE_FAILURES) break;
    }
  }
  return count;
}
function nextUnblockedQueueIndex(idx, recovery) {
  var now = Date.now();
  for (var step = 1; step < playQueue.length; step++) {
    var nextIdx = (idx + step) % playQueue.length;
    var failedAt = Number(playQueue[nextIdx] && playQueue[nextIdx]._lastPlaybackFailAt) || 0;
    var recoveryKey = sourceFallbackRecoveryContentKey(playQueue[nextIdx]);
    if (recovery && recoveryKey && recovery.visitedSongKeys[recoveryKey]) continue;
    var failedInRecovery = !recovery
      || (playQueue[nextIdx] && playQueue[nextIdx]._lastPlaybackFailRecoveryId === recovery.id);
    if (!failedInRecovery || !failedAt || now - failedAt > 18000) return nextIdx;
  }
  return -1;
}
function isQueueItemRecentlyPlaybackFailed(idx) {
  var failedAt = Number(playQueue[idx] && playQueue[idx]._lastPlaybackFailAt) || 0;
  return !!(failedAt && Date.now() - failedAt <= 18000);
}
async function skipFailedQueueItem(idx, token, message, opts) {
  opts = opts || {};
  if (token !== trackSwitchToken) return false;
  var recovery = ensureSourceFallbackRecovery(opts, playQueue[idx], idx, token);
  if (!recovery) return false;
  var terminalOpts = Object.assign({}, opts, { sourceFallbackRecovery: recovery });
  if (!sourceFallbackRecoveryCanContinue(recovery)) {
    return settleSourceFallbackTerminal(idx, token, '自动恢复已达到时间上限，请稍后手动重试。', terminalOpts);
  }
  hideLoading();
  markQueueItemPlaybackFailed(idx, recovery);
  var currentRecoveryKey = sourceFallbackRecoveryContentKey(playQueue[idx]);
  if (currentRecoveryKey) recovery.visitedSongKeys[currentRecoveryKey] = true;
  if (playQueue.length <= 1) {
    return settleSourceFallbackTerminal(idx, token, message || '当前歌曲不可播放，队列里没有其他歌曲。', terminalOpts);
  }
  if (recentQueuePlaybackFailureCount(recovery) >= Math.min(MAX_RECENT_AUTO_QUEUE_FAILURES, playQueue.length)) {
    return settleSourceFallbackTerminal(idx, token, '', terminalOpts);
  }
  if (recovery.queueAdvances >= SOURCE_FALLBACK_MAX_QUEUE_ADVANCES) {
    return settleSourceFallbackTerminal(idx, token, '已停止自动切换，避免无可用音源时反复扫描整条队列。', terminalOpts);
  }
  var nextIdx = nextUnblockedQueueIndex(idx, recovery);
  if (nextIdx < 0) {
    return settleSourceFallbackTerminal(idx, token, '已尝试绕开受限歌曲，当前队列没有新的可播放项。', terminalOpts);
  }
  if (!opts.silent) showSourceFallbackNotice('已跳过受限歌曲', message || '未找到同名同歌手的另一个平台版本，正在播放下一首。');
  recovery.queueAdvances++;
  var nextRecoveryKey = sourceFallbackRecoveryContentKey(playQueue[nextIdx]);
  if (nextRecoveryKey) recovery.visitedSongKeys[nextRecoveryKey] = true;
  var nextPlaybackOpts = Object.assign(
    {},
    sourceFallbackQueuePlaybackOptions(opts.playbackOpts || {}, recovery),
    { skipShuffleOrder: true }
  );
  var nextStarted = await playQueueAt(nextIdx, nextPlaybackOpts);
  if (nextStarted === true) completeSourceFallbackRecovery(recovery);
  else if (sourceFallbackRecoveryIdentityActive(recovery) && !sourceFallbackRecoveryCanContinue(recovery)) {
    return settleSourceFallbackTerminal(currentIdx, trackSwitchToken, '自动恢复已达到时间上限，请稍后手动重试。', terminalOpts);
  }
  return nextStarted === true;
}
async function tryAutoPlaybackFallback(song, data, idx, token, opts) {
  opts = opts || {};
  if (opts.fallbackDepth > 0) {
    if (opts.fallbackOriginalSong && opts.fallbackCandidateSong) {
      restoreSourceFallbackQueueItem(idx, opts.fallbackOriginalSong, opts.fallbackCandidateSong, token);
    }
    return false;
  }
  if (!song || song.type === 'local' || song.type === 'podcast' || song.source === 'podcast') return null;
  var category = playbackRestrictionCategory(song, data);
  var fromLabel = playbackProviderLabel(song);
  var alternateProviders = alternatePlaybackProviders(song);
  if (!alternateProviders.length && category === 'login_required') return null;
  var recovery = ensureSourceFallbackRecovery(opts, song, idx, token);
  if (!recovery) return false;
  opts = Object.assign({}, opts, { sourceFallbackRecovery: recovery });
  var skipPlaybackOpts = sourceFallbackQueuePlaybackOptions(opts, recovery);
  skipPlaybackOpts.startupAutoplay = true;
  if (opts.resumeAt != null) skipPlaybackOpts.resumeAt = opts.resumeAt;
  var skipOpts = {
    silent: !!recovery.silent,
    playbackOpts: skipPlaybackOpts,
    sourceFallbackRecovery: recovery
  };
  if (!sourceFallbackRecoveryCanContinue(recovery)) {
    return settleSourceFallbackTerminal(idx, token, '自动恢复已达到时间上限，请稍后手动重试。', skipOpts);
  }
  if (!alternateProviders.length) {
    return await skipFailedQueueItem(idx, token, '当前歌曲不可播放，且没有其它已登录、已授权的音乐平台可接管。', skipOpts);
  }
  if (!opts.startupAutoplay) {
    showSourceFallbackNotice('正在自动换源', fromLabel + ' 当前不可播，正在检查 ' + alternateProviders.map(sourceFallbackProviderTitle).join('、') + ' 的同名同歌手版本。');
  }
  for (var providerIndex = 0; providerIndex < alternateProviders.length; providerIndex++) {
    var alternateProvider = alternateProviders[providerIndex];
    if (!beginSourceFallbackProviderAttempt(recovery, song, alternateProvider)) {
      if (!sourceFallbackRecoveryCanContinue(recovery)) {
        return settleSourceFallbackTerminal(idx, token, '自动恢复已达到时间上限，请稍后手动重试。', skipOpts);
      }
      continue;
    }
    var targetLabel = sourceFallbackProviderTitle(alternateProvider);
    try {
      var alternate = await searchAlternatePlatformSong(song, alternateProvider, recovery);
      if (token !== trackSwitchToken) return false;
      if (!sourceFallbackRecoveryCanContinue(recovery)) {
        return settleSourceFallbackTerminal(idx, token, '自动恢复已达到时间上限，请稍后手动重试。', skipOpts);
      }
      if (!alternate) continue;
      var alternateData = typeof resolveAlbumGaplessPlaybackData === 'function'
        ? await awaitSourceFallbackBudget(resolveAlbumGaplessPlaybackData(alternate), recovery)
        : null;
      if (token !== trackSwitchToken) return false;
      if (alternateData === sourceFallbackBudgetTimeoutResult || !sourceFallbackRecoveryCanContinue(recovery)) {
        return settleSourceFallbackTerminal(idx, token, '自动恢复已达到时间上限，请稍后手动重试。', skipOpts);
      }
      if (!alternateData || !alternateData.url) continue;
      var originalSong = playQueue[idx];
      alternate.autoFallbackFrom = songProviderKey(song);
      var committedCandidate = hydrateCustomCover(alternate);
      playQueue[idx] = committedCandidate;
      safeRenderQueuePanel('source-fallback-provisional', { scrollCurrent: miniQueueOpen });
      safeShelfRebuild('source-fallback-provisional');
      var fallbackPlaybackOpts = {
        fallbackDepth: 1,
        startupAutoplay: !!opts.startupAutoplay,
        preserveHomeState: !!opts.preserveHomeState,
        suppressPlayFailureNotice: true,
        preResolvedPlaybackData: alternateData,
        fallbackOriginalSong: originalSong,
        fallbackCandidateSong: committedCandidate,
        sourceFallbackRecovery: recovery,
        qqQualityTried: ['hires', 'lossless', 'exhigh', 'standard']
      };
      if (opts.resumeAt != null) fallbackPlaybackOpts.resumeAt = opts.resumeAt;
      var fallbackPromise = playQueueAt(idx, fallbackPlaybackOpts);
      var fallbackToken = trackSwitchToken;
      var fallbackStarted = await fallbackPromise;
      if (fallbackToken !== trackSwitchToken) return false;
      if (fallbackStarted === true) {
        completeSourceFallbackRecovery(recovery);
        if (!opts.startupAutoplay) showSourceFallbackNotice('已自动切换音源', (song.name || '当前歌曲') + ' 已从 ' + fromLabel + ' 切到 ' + targetLabel + '。');
        return true;
      }
      restoreSourceFallbackQueueItem(idx, originalSong, committedCandidate, fallbackToken);
      token = fallbackToken;
      if (!sourceFallbackRecoveryCanContinue(recovery)) {
        return settleSourceFallbackTerminal(idx, token, '自动恢复已达到时间上限，请稍后手动重试。', skipOpts);
      }
    } catch (e) {
      if (token !== trackSwitchToken) return false;
      if (!sourceFallbackRecoveryCanContinue(recovery)) {
        return settleSourceFallbackTerminal(idx, token, '自动恢复已达到时间上限，请稍后手动重试。', skipOpts);
      }
      console.warn('[SourceFallback]', alternateProvider, e && (e.message || e));
    }
  }
  return await skipFailedQueueItem(idx, token, '没有找到可播放的已登录平台版本，正在播放下一首。', skipOpts);
}
function handlePlaybackUnavailable(song, data) {
  hideLoading();
  forcePlaybackControlsInteractive();
  var provider = playbackLoginProvider(song);
  var notice = playbackRestrictionNotice(song, data);
  var category = notice.category;
  showToast(notice.toast || notice.title || playbackRestrictionMessage(song, data));
  showSourceFallbackNotice(notice.title, notice.body);
  if (category === 'login_required') {
    setTimeout(function () {
      var modal = document.getElementById('login-modal');
      if (!modal || modal.classList.contains('show')) return;
      openProviderLogin(provider);
    }, 520);
  }
}
