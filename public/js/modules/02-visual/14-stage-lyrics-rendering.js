var stageLyricPrewarm = { timer: 0, workTimer: 0, workRaf: 0, build: null, mesh: null, key: '', token: 0, targetIndex: null, lightweight: false, dueAt: 0 };
var stageLyricSingleLinePrewarm = { items: {}, order: [], max: 10 };
var stageLyricWarmup = { until: 0, reason: '' };
var stageLyricRestoreWarmup = { time: 0, token: 0, until: 0, reason: '' };
var stageLyricFullTrackWarmupTimer = 0;
var stageLyricFullTrackWarmupTargetAt = 0;
var stageLyricFullTrackWarmupIdle = 0;
var stageLyricPlaybackWarmupLastAt = 0;
var stageLyricPlaybackWarmupLastIndex = -1;
var stageLyricResumeWarmupLastAt = 0;
var stageLyricResumeWarmupLastIndex = -1;
var stageLyricResumeUpgradeDeferUntil = 0;
var stageLyricLightweightUpgradeLastAt = 0;
var stageLyricTextLoadCache = { key: '', info: null };
var stageLyricTrackSwitchBootstrapUntil = 0;
var stageLyricResidentBuild = { job: null, timer: 0, raf: 0, token: 0 };
var stageLyricResidentDemand = { timer: 0, mesh: null, targetIndex: -1, options: null };
var stageLyricTrackGeneration = 0;

function stageLyricColorSignature(value) {
  if (!value) return '';
  if (value.getHexString) return value.getHexString();
  return String(value);
}

function stageLyricPrewarmStyleKey(options) {
  var pal = stageLyrics && stageLyrics.palette || {};
  var parts = [
    normalizeLyricDisplayMode(fx && fx.lyricDisplayMode),
    normalizeLyricTranslationMode(fx && fx.lyricTranslationMode),
    Math.round(lyricContextSpreadValue() * 1000),
    Math.round(lyricContextOpacityValue() * 1000),
    Math.round(lyricTranslationGapValue() * 1000),
    Math.round(lyricTranslationScaleValue() * 1000),
    Math.round(lyricTranslationOpacityValue() * 1000),
    Math.round((Number(fx && fx.lyricLineHeight) || 1) * 1000),
    Math.round((Number(fx && fx.lyricLetterSpacing) || 0) * 1000),
    Math.round((Number(fx && fx.lyricWeight) || 700) * 10),
    Math.round((Number(fx && fx.lyricCustomLineCount) || 0) * 10),
    fx && fx.lyricMotionStyle || '',
    fx && fx.lyricColorMode || '',
    fx && fx.lyricColor || '',
    fx && fx.lyricHighlightMode || '',
    fx && fx.lyricHighlightColor || '',
    fx && fx.lyricGlowLinked !== false ? 'glow-linked' : 'glow-detached',
    fx && fx.lyricGlowColor || ''
  ];
  if (!options || !options.omitLivePalette) {
    parts.push(
      stageLyricColorSignature(pal.primary),
      stageLyricColorSignature(pal.secondary),
      stageLyricColorSignature(pal.highlight),
      stageLyricColorSignature(pal.glowColor)
    );
  }
  return parts.join('|');
}

function stageLyricPrewarmBuildGuardKey() {
  return stageLyricPrewarmStyleKey({ omitLivePalette: true });
}

function stageLyricPreparedKey(payload) {
  payload = normalizeStageLyricPayload(payload);
  if (!payload || !payload.key) return '';
  return [
    payload.key,
    payload.trackKey || '',
    payload.trackStart == null ? '' : payload.trackStart,
    payload.trackEnd == null ? '' : payload.trackEnd,
    payload.trackLightweight ? 'light' : 'full',
    Array.isArray(payload.trackEntries) ? payload.trackEntries.length : 0,
    stageLyricPrewarmStyleKey()
  ].join('::');
}

function stageLyricRenderSignatureForCurrentState() {
  var lyricSignature = typeof currentAppliedLyricRenderSignature === 'function' ? currentAppliedLyricRenderSignature() : '';
  if (!lyricSignature) return '';
  return lyricSignature + '::style::' + stageLyricPrewarmStyleKey();
}

function stageLyricCanPreserveSameRender(signature) {
  if (!signature || !stageLyrics || stageLyrics.renderSignature !== signature) return false;
  if (stageLyrics.current || stageLyrics.currentPayload || stageLyrics.currentDisplayKey) return true;
  return !!(stageLyricPrewarm && (stageLyricPrewarm.mesh || stageLyricPrewarm.timer || stageLyricPrewarm.workTimer || stageLyricPrewarm.workRaf || stageLyricPrewarm.build));
}

function stageLyricPrewarmPayload() {
  return stageLyricPrewarm && stageLyricPrewarm.mesh && stageLyricPrewarm.mesh.userData
    ? stageLyricPrewarm.mesh.userData.payload
    : null;
}

function stageLyricLightPrewarmReason(reason) {
  return /^(intro-first-line|renderLyrics|renderLyrics-title|toggleLyricsPanel|setParticleLyricsSilently|track-demand-light|startup-restore|startup-restore-lyrics|playback-resume|playback-started)$/.test(String(reason || ''))
    || /^quality-switch/i.test(String(reason || ''));
}

function clearStageLyricFullTrackWarmup() {
  if (stageLyricFullTrackWarmupTimer) {
    clearTimeout(stageLyricFullTrackWarmupTimer);
    stageLyricFullTrackWarmupTimer = 0;
  }
  if (stageLyricFullTrackWarmupIdle && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(stageLyricFullTrackWarmupIdle);
  }
  stageLyricFullTrackWarmupIdle = 0;
  stageLyricFullTrackWarmupTargetAt = 0;
}

function cancelStageLyricPrewarmBuildOnly() {
  if (stageLyricPrewarm.workTimer) {
    clearTimeout(stageLyricPrewarm.workTimer);
    stageLyricPrewarm.workTimer = 0;
  }
  if (stageLyricPrewarm.workRaf) {
    cancelAnimationFrame(stageLyricPrewarm.workRaf);
    stageLyricPrewarm.workRaf = 0;
  }
  if (stageLyricPrewarm.build && stageLyricPrewarm.build.state && typeof cancelCooperativeLyricMeshBuild === 'function') {
    cancelCooperativeLyricMeshBuild(stageLyricPrewarm.build.state);
  }
  stageLyricPrewarm.build = null;
  if (typeof window !== 'undefined' && window.__mineradioLyricBuildStats) {
    window.__mineradioLyricBuildStats.active = false;
  }
}

function disposeStageLyricPrewarmMesh() {
  if (stageLyricPrewarm.timer) {
    clearTimeout(stageLyricPrewarm.timer);
    stageLyricPrewarm.timer = 0;
  }
  cancelStageLyricPrewarmBuildOnly();
  if (stageLyricPrewarm.mesh) {
    disposeLyricMesh(stageLyricPrewarm.mesh);
    stageLyricPrewarm.mesh = null;
  }
  stageLyricPrewarm.key = '';
  stageLyricPrewarm.targetIndex = null;
  stageLyricPrewarm.lightweight = false;
  stageLyricPrewarm.dueAt = 0;
}

function clearStageLyricSingleLinePrewarmItem(key) {
  if (!stageLyricSingleLinePrewarm || !stageLyricSingleLinePrewarm.items || !key) return;
  var item = stageLyricSingleLinePrewarm.items[key];
  if (!item) return;
  if (item.timer) clearTimeout(item.timer);
  if (item.mesh) disposeLyricMesh(item.mesh);
  delete stageLyricSingleLinePrewarm.items[key];
  stageLyricSingleLinePrewarm.order = (stageLyricSingleLinePrewarm.order || []).filter(function (entryKey) { return entryKey !== key; });
}

function clearStageLyricSingleLinePrewarmCache() {
  if (!stageLyricSingleLinePrewarm || !stageLyricSingleLinePrewarm.items) return;
  Object.keys(stageLyricSingleLinePrewarm.items).forEach(clearStageLyricSingleLinePrewarmItem);
  stageLyricSingleLinePrewarm.order = [];
}

function trimStageLyricSingleLinePrewarmCache() {
  if (!stageLyricSingleLinePrewarm) return;
  var maxItems = Math.max(1, Number(stageLyricSingleLinePrewarm.max) || 4);
  while ((stageLyricSingleLinePrewarm.order || []).length > maxItems) {
    clearStageLyricSingleLinePrewarmItem(stageLyricSingleLinePrewarm.order[0]);
  }
}

function stageLyricNowMs() {
  return window.performance && performance.now ? performance.now() : Date.now();
}

function stageLyricTextLoadInfo() {
  var mode = normalizeLyricDisplayMode(fx && fx.lyricDisplayMode);
  var translationMode = normalizeLyricTranslationMode(fx && fx.lyricTranslationMode);
  var key = stageLyricTrackKeyForMode(mode) + '|native=' + (lyricsHasNativeKaraoke ? 1 : 0);
  if (stageLyricTextLoadCache && stageLyricTextLoadCache.key === key && stageLyricTextLoadCache.info) return stageLyricTextLoadCache.info;
  var total = lyricsLines && lyricsLines.length ? lyricsLines.length : 0;
  var charTotal = 0;
  var cjkTotal = 0;
  var nativeWordLines = 0;
  var translationLines = 0;
  for (var i = 0; i < total; i++) {
    var line = lyricsLines[i] || {};
    var text = normalizeStageLyricText(line.text);
    var translation = normalizeLyricTranslationText(line.translation);
    if (text) {
      charTotal += Array.from(text).length;
      cjkTotal += (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
    }
    if (translation) {
      translationLines += 1;
      charTotal += Array.from(translation).length;
      cjkTotal += (translation.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
    }
    if (line.words && line.words.length) nativeWordLines += 1;
  }
  var cjkRatio = charTotal > 0 ? cjkTotal / charTotal : 0;
  var multiLineLoad = mode !== 'single';
  var denseCjk = cjkTotal >= 24 && cjkRatio >= 0.18;
  var layeredRows = total * (translationMode !== 'off' ? 2 : 1);
  var preferLightweight = !!(multiLineLoad && denseCjk && (total >= 12 || nativeWordLines >= 4 || layeredRows >= 20));
  var info = {
    total: total,
    cjkTotal: cjkTotal,
    cjkRatio: cjkRatio,
    nativeWordLines: nativeWordLines,
    translationLines: translationLines,
    preferLightweight: preferLightweight
  };
  stageLyricTextLoadCache = { key: key, info: info };
  return info;
}

function stageLyricPreferLightweightTrack() {
  var info = stageLyricTextLoadInfo();
  return !!(info && info.preferLightweight);
}

function stageLyricShouldSkipFullTrackWarmup(reason) {
  if (!stageLyricPreferLightweightTrack()) return false;
  return false;
}

function clearStageLyricRestoreWarmup() {
  stageLyricRestoreWarmup.time = 0;
  stageLyricRestoreWarmup.token = 0;
  stageLyricRestoreWarmup.until = 0;
  stageLyricRestoreWarmup.reason = '';
}

function stageLyricRestoreWarmupSeconds() {
  var seconds = Number(stageLyricRestoreWarmup && stageLyricRestoreWarmup.time) || 0;
  if (seconds < 0.35) return null;
  if (stageLyricRestoreWarmup.token && typeof trackSwitchToken !== 'undefined' && stageLyricRestoreWarmup.token !== trackSwitchToken) {
    clearStageLyricRestoreWarmup();
    return null;
  }
  if ((Number(stageLyricRestoreWarmup.until) || 0) < stageLyricNowMs()) {
    clearStageLyricRestoreWarmup();
    return null;
  }
  var actual = audio && isFinite(Number(audio.currentTime)) ? Math.max(0, Number(audio.currentTime) || 0) : 0;
  if (actual > 0.35 && Math.abs(actual - seconds) <= 1.25) {
    return actual;
  }
  if (actual > seconds + 2.5) {
    clearStageLyricRestoreWarmup();
    return actual;
  }
  return seconds;
}

function stageLyricIndexForSeconds(seconds) {
  if (!lyricsLines || !lyricsLines.length) return -1;
  var lyricT = typeof getAdjustedLyricPlaybackTime === 'function' ? getAdjustedLyricPlaybackTime(seconds) : seconds;
  var idx = findStageLyricIndexAtTime(lyricT);
  if (idx < 0) idx = 0;
  return Math.max(0, Math.min(lyricsLines.length - 1, idx));
}

function scheduleStageLyricRestorePrewarm(reason, delay) {
  var seconds = stageLyricRestoreWarmupSeconds();
  if (seconds == null) return false;
  var idx = stageLyricIndexForSeconds(seconds);
  if (idx < 0) return false;
  scheduleStageLyricPrewarmForIndex(idx, reason || 'startup-restore', delay == null ? 16 : delay);
  return true;
}

function requestStageLyricRestoreWarmup(seconds, token, reason) {
  seconds = Math.max(0, Number(seconds) || 0);
  if (seconds < 0.35) return false;
  stageLyricRestoreWarmup.time = seconds;
  stageLyricRestoreWarmup.token = Number(token) || 0;
  stageLyricRestoreWarmup.until = stageLyricNowMs() + 18000;
  stageLyricRestoreWarmup.reason = reason || 'startup-restore';
  requestStageLyricWarmup(stageLyricRestoreWarmup.reason, 220);
  scheduleStageLyricRestorePrewarm(stageLyricRestoreWarmup.reason, 16);
  if (typeof scheduleStageLyricFullTrackWarmup === 'function') scheduleStageLyricFullTrackWarmup('track-ready-fast', 140);
  return true;
}

function requestStageLyricWarmup(reason, ms) {
  var duration = clampRange(Number(ms) || 120, 24, 900);
  stageLyricWarmup.until = Math.max(Number(stageLyricWarmup.until) || 0, stageLyricNowMs() + duration);
  stageLyricWarmup.reason = reason || '';
}

function clearStageLyricWarmup() {
  stageLyricWarmup.until = 0;
  stageLyricWarmup.reason = '';
}

function invalidateStageLyricPayloadForNewLyrics(reason) {
  stageLyricTrackGeneration += 1;
  if (typeof invalidateLyricQualityTextures === 'function') invalidateLyricQualityTextures(reason || 'new-lyrics');
  cancelStageLyricResidentBuild();
  clearStageLyricFullTrackWarmup();
  disposeStageLyricPrewarmMesh();
  clearStageLyricSingleLinePrewarmCache();
  if (/track-switch-pending/i.test(String(reason || ''))) {
    stageLyricTrackSwitchBootstrapUntil = stageLyricNowMs() + 4800;
  }
  stageLyricTextLoadCache = { key: '', info: null };
  if (typeof stageLyricTrackCache !== 'undefined' && stageLyricTrackCache) {
    stageLyricTrackCache = { key: '', entries: null, lineMap: null, start: 0, end: -1 };
  }
  if (!stageLyrics) return;
  if (stageLyrics.currentIdx >= 0) {
    stageLyrics.currentIdx = -1;
    stageLyrics.currentDisplayKey = '';
    stageLyrics.currentPayload = null;
  }
  stageLyrics.renderSignature = '';
  stageLyricWarmup.reason = reason || stageLyricWarmup.reason || '';
}

function stageLyricWarmupPending() {
  if (stageLyricPrewarm.mesh) return false;
  if (stageLyricPrewarm.timer || stageLyricPrewarm.workTimer || stageLyricPrewarm.workRaf || stageLyricPrewarm.build) return true;
  if (normalizeLyricDisplayMode(fx && fx.lyricDisplayMode) === 'single') {
    var singleLineIndex = stageLyricSingleLineBootstrapIndex();
    if (singleLineIndex >= 0 && stageLyricSingleLineIndexPrewarmReady(singleLineIndex)) return false;
  }
  return (Number(stageLyricWarmup.until) || 0) > stageLyricNowMs();
}

function stageLyricPayloadIsSingleLine(payload) {
  if (!payload) return false;
  return normalizeLyricDisplayMode(payload.mode || (fx && fx.lyricDisplayMode)) === 'single';
}

function lyricVerticalFloatEnabled() {
  return !fx || fx.lyricVerticalFloat !== false;
}

function stageLyricSingleLineTrackStub(index) {
  var idx = Math.max(0, Math.round(Number(index) || 0));
  return { entries: [], activeLine: 0, start: idx, end: idx, lightweight: false };
}

function stageLyricSingleLineNextIndex(index) {
  if (!lyricsLines || !lyricsLines.length || normalizeLyricDisplayMode(fx && fx.lyricDisplayMode) !== 'single') return -1;
  var start = Math.max(0, Math.round(Number(index) || 0)) + 1;
  for (var i = start; i < lyricsLines.length; i++) {
    if (lyricLineDisplayTextAt(i)) return i;
  }
  return -1;
}

function stageLyricSingleLineNextPrewarmReady(currentIndex) {
  var nextIndex = stageLyricSingleLineNextIndex(currentIndex);
  return stageLyricSingleLineIndexPrewarmReady(nextIndex);
}

function stageLyricSingleLineIndexPrewarmReady(index) {
  if (index < 0) return true;
  var payload = buildStageLyricDisplayPayload(index);
  if (!payload) return false;
  if (stageLyricSingleLinePrewarmCanServePayload(payload)) return true;
  if (!stageLyricPrewarm || stageLyricPrewarm.targetIndex !== index) return false;
  return !!(payload && stageLyricPrewarmCanServePayload(payload));
}

function stageLyricSingleLineUpcomingIndexes(index, count) {
  var out = [];
  var cursor = Math.max(0, Math.round(Number(index) || 0));
  var limit = Math.max(1, Number(count) || 4);
  while (out.length < limit) {
    cursor = stageLyricSingleLineNextIndex(cursor);
    if (cursor < 0) break;
    out.push(cursor);
  }
  return out;
}

function stageLyricSingleLinePrewarmDelay(currentIndex, targetIndex, lyricTime, slot) {
  var currentLine = lyricsLines && lyricsLines[currentIndex];
  var targetLine = lyricsLines && lyricsLines[targetIndex];
  var baseTime = Number(lyricTime || (currentLine && currentLine.t) || 0);
  var secondsUntil = targetLine && isFinite(Number(targetLine.t))
    ? Math.max(0, Number(targetLine.t) - baseTime)
    : 0;
  if (slot <= 0) return secondsUntil > 2.0 ? 32 : (secondsUntil > 1.0 ? 8 : 0);
  if (secondsUntil < 1.2) return slot * 18;
  if (secondsUntil < 2.4) return 36 + slot * 34;
  return Math.min(180, 52 + slot * 46);
}

function stageLyricSingleLinePrewarmCanServePayload(payload) {
  if (!stageLyricPayloadIsSingleLine(payload)) return false;
  var key = stageLyricPreparedKey(payload);
  var item = key && stageLyricSingleLinePrewarm && stageLyricSingleLinePrewarm.items
    ? stageLyricSingleLinePrewarm.items[key]
    : null;
  return !!(item && item.mesh);
}

function takeStageLyricSingleLinePrewarmMesh(payload) {
  if (!stageLyricPayloadIsSingleLine(payload)) return null;
  var key = stageLyricPreparedKey(payload);
  var item = key && stageLyricSingleLinePrewarm && stageLyricSingleLinePrewarm.items
    ? stageLyricSingleLinePrewarm.items[key]
    : null;
  if (!item || !item.mesh) return null;
  var mesh = item.mesh;
  item.mesh = null;
  if (item.timer) clearTimeout(item.timer);
  delete stageLyricSingleLinePrewarm.items[key];
  stageLyricSingleLinePrewarm.order = (stageLyricSingleLinePrewarm.order || []).filter(function (entryKey) { return entryKey !== key; });
  return mesh;
}

function scheduleStageLyricSingleLineCachePrewarm(index, reason, delay) {
  if (!fx || !fx.particleLyrics || !lyricsLines || !lyricsLines.length) return false;
  var payload = buildStageLyricDisplayPayload(index);
  if (!stageLyricPayloadIsSingleLine(payload)) return false;
  var key = stageLyricPreparedKey(payload);
  if (!key) return false;
  if (stageLyricPrewarmCanServePayload(payload)) return true;
  var wait = Math.max(0, Number(delay) || 0);
  var dueAt = stageLyricNowMs() + wait;
  var item = stageLyricSingleLinePrewarm.items[key];
  if (item) {
    if (item.mesh) return true;
    if (item.timer && (!item.dueAt || dueAt >= item.dueAt - 8)) return true;
    if (item.timer) clearTimeout(item.timer);
  } else {
    item = { mesh: null, timer: 0, targetIndex: index, dueAt: 0 };
    stageLyricSingleLinePrewarm.items[key] = item;
    stageLyricSingleLinePrewarm.order = (stageLyricSingleLinePrewarm.order || []).filter(function (entryKey) { return entryKey !== key; });
    stageLyricSingleLinePrewarm.order.push(key);
  }
  item.targetIndex = index;
  item.dueAt = dueAt;
  item.timer = setTimeout(function () {
    item.timer = 0;
    item.dueAt = 0;
    if (!fx || !fx.particleLyrics || !lyricsLines || !lyricsLines.length) {
      clearStageLyricSingleLinePrewarmItem(key);
      return;
    }
    if (item.mesh || stageLyricPrewarmCanServePayload(payload)) return;
    try {
      var mesh = buildLyricMesh(payload);
      primeLyricMeshOpacity(mesh, 0);
      mesh.visible = false;
      item.mesh = mesh;
      item.payload = payload;
      trimStageLyricSingleLinePrewarmCache();
    } catch (e) {
      clearStageLyricSingleLinePrewarmItem(key);
    }
  }, wait);
  trimStageLyricSingleLinePrewarmCache();
  return true;
}

function scheduleStageLyricSingleLineNextPrewarm(currentIndex, lyricTime, reason) {
  if (!fx || !fx.particleLyrics) return false;
  var upcoming = stageLyricSingleLineUpcomingIndexes(currentIndex, 6);
  if (!upcoming.length) return false;
  var allReady = true;
  for (var i = 0; i < upcoming.length; i++) {
    var targetIndex = upcoming[i];
    if (stageLyricSingleLineIndexPrewarmReady(targetIndex)) continue;
    allReady = false;
    var delay = stageLyricSingleLinePrewarmDelay(currentIndex, targetIndex, lyricTime, i);
    var prewarmReason = i === 0 ? (reason || 'single-line-next') : ('single-line-lookahead-' + (i + 1));
    scheduleStageLyricSingleLineCachePrewarm(targetIndex, prewarmReason, delay);
  }
  return allReady || stageLyricSingleLineNextPrewarmReady(currentIndex);
}

function scheduleStageLyricSingleLineBootstrapPrewarm(reason, delay) {
  if (!fx || !fx.particleLyrics || !lyricsLines || !lyricsLines.length) return false;
  if (normalizeLyricDisplayMode(fx && fx.lyricDisplayMode) !== 'single') return false;
  var currentIndex = stageLyricSingleLineBootstrapIndex();
  if (currentIndex < 0) return false;
  var wait = Math.max(0, Number(delay) || 0);
  var currentCoveredBySharedPrewarm = !!(
    stageLyricPrewarm &&
    stageLyricPrewarm.targetIndex === currentIndex &&
    (stageLyricPrewarm.timer || stageLyricPrewarm.mesh)
  );
  if (!currentCoveredBySharedPrewarm && !stageLyricSingleLineIndexPrewarmReady(currentIndex)) {
    scheduleStageLyricSingleLineCachePrewarm(currentIndex, (reason || 'single-line-bootstrap') + '-current', Math.min(wait, 8));
  }
  var upcoming = stageLyricSingleLineUpcomingIndexes(currentIndex, 6);
  for (var i = 0; i < upcoming.length; i++) {
    if (stageLyricSingleLineIndexPrewarmReady(upcoming[i])) continue;
    scheduleStageLyricSingleLineCachePrewarm(upcoming[i], (reason || 'single-line-bootstrap') + '-lookahead-' + (i + 1), Math.max(0, Math.min(wait + 8 + i * 18, 96)));
  }
  return true;
}

function resetPreparedStageLyricMesh(mesh, payload, lineStep) {
  if (!mesh) return null;
  payload = normalizeStageLyricPayload(payload);
  if (mesh.parent) mesh.parent.remove(mesh);
  var singleLineSwap = payload && normalizeLyricDisplayMode(payload.mode) === 'single';
  var enterDir = singleLineSwap ? 0 : (lineStep > 0 ? -1 : (lineStep < 0 ? 1 : 0));
  mesh.visible = true;
  var singleLineStartX = singleLineSwap ? 0 : (Math.random() - 0.5) * 0.045;
  mesh.position.set(singleLineStartX, 0.20, 1.46 - Math.abs(enterDir) * 0.055);
  mesh.scale.setScalar(0.96);
  mesh.userData = mesh.userData || {};
  mesh.userData.age = 0;
  mesh.userData.state = 'in';
  mesh.userData.lastLyricProgress = -1;
  mesh.userData.targetLyricProgress = 0;
  mesh.userData.shownLyricProgress = 0;
  mesh.userData.enterDirection = enterDir;
  mesh.userData.exitDirection = 0;
  mesh.userData.glitchBurst = 0;
  mesh.userData.glitchHold = 0;
  mesh.userData.progressPreviewMotionLocked = false;
  mesh.userData.progressPreviewMotionBlend = 1;
  delete mesh.userData.progressPreviewHoldX;
  delete mesh.userData.progressPreviewHoldY;
  delete mesh.userData.progressPreviewHoldZ;
  delete mesh.userData.progressPreviewHoldScale;
  delete mesh.userData.progressPreviewHoldRotationZ;
  mesh.userData.displayKey = payload ? payload.key : '';
  mesh.userData.payload = payload;
  var data = mesh.userData.lyric || {};
  if (data.context && data.context.userData) {
    data.context.userData.progressPreviewMotionLocked = false;
    data.context.userData.progressPreviewMotionBlend = 1;
  }
  var lineWorldStep = clampRange(Number(data.lineWorldStep) || 0.38, 0.20, 0.94);
  if (!singleLineSwap) mesh.position.y += enterDir * lineWorldStep;
  if (data && isFinite(Number(data.trackTargetVirtualIndex))) {
    data.trackScrollOffset = Number(data.trackTargetVirtualIndex);
    data.trackScrollPrimed = true;
    data.trackScrollSnapUntil = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) + 120;
  }
  primeLyricMeshOpacity(mesh, 0);
  updateLyricMeshProgress(mesh, 0);
  return mesh;
}

function takeStageLyricPrewarmMesh(payload) {
  var key = stageLyricPreparedKey(payload);
  if (!key || !stageLyricPrewarm.mesh) return null;
  if (stageLyricPrewarm.key === key) {
    var exactMesh = stageLyricPrewarm.mesh;
    stageLyricPrewarm.mesh = null;
    stageLyricPrewarm.key = '';
    stageLyricPrewarm.targetIndex = null;
    stageLyricPrewarm.dueAt = 0;
    return exactMesh;
  }
  var data = stageLyricPrewarm.mesh.userData && stageLyricPrewarm.mesh.userData.lyric;
  var targetLineIndex = payload && payload.trackIndex != null ? Number(payload.trackIndex) : NaN;
  if (
    data && data.usesTrack && payload && payload.trackKey && data.trackKey === payload.trackKey &&
    isFinite(targetLineIndex) &&
    data.trackStart != null && data.trackEnd != null &&
    targetLineIndex >= Number(data.trackStart) && targetLineIndex <= Number(data.trackEnd) &&
    setLyricTrackTarget(stageLyricPrewarm.mesh, payload)
  ) {
    var trackMesh = stageLyricPrewarm.mesh;
    stageLyricPrewarm.mesh = null;
    stageLyricPrewarm.key = '';
    stageLyricPrewarm.targetIndex = null;
    stageLyricPrewarm.dueAt = 0;
    return trackMesh;
  }
  if (stageLyricPrewarm.key !== key) {
    if (stageLyricPrewarm.mesh) disposeStageLyricPrewarmMesh();
    return null;
  }
  return null;
}

function stageLyricMeshCanServePayload(mesh, payload) {
  if (!mesh || !mesh.userData || !mesh.userData.lyric || !payload) return false;
  var data = mesh.userData.lyric;
  if (!data.usesTrack || !data.rowLayers || !data.rowLayers.length) return false;
  if (!payload.trackLightweight && data.trackLightweight) return false;
  if (!payload.trackKey || data.trackKey !== payload.trackKey) return false;
  if (payload.trackIndex == null || !isFinite(Number(payload.trackIndex))) return false;
  var targetLineIndex = Number(payload.trackIndex);
  if (data.trackStart != null && isFinite(Number(data.trackStart)) && targetLineIndex < Number(data.trackStart)) return false;
  if (data.trackEnd != null && isFinite(Number(data.trackEnd)) && targetLineIndex > Number(data.trackEnd)) return false;
  return true;
}

function stageLyricPrewarmCanServePayload(payload) {
  if (stageLyricSingleLinePrewarmCanServePayload(payload)) return true;
  var key = stageLyricPreparedKey(payload);
  if (!key || !stageLyricPrewarm.mesh) return false;
  return stageLyricPrewarm.key === key || stageLyricMeshCanServePayload(stageLyricPrewarm.mesh, payload);
}

function stageLyricCurrentMeshAlreadyPreparedForPayload(payload) {
  if (!stageLyrics || !stageLyrics.current || !payload) return false;
  if (payload.trackKey && payload.trackIndex != null) {
    return stageLyricMeshCanServePayload(stageLyrics.current, payload);
  }
  return !!(stageLyrics.currentDisplayKey === payload.key);
}

function stageLyricPreparedFullPayloadForIndex(index) {
  var prepared = stageLyricPrewarmPayload();
  if (!prepared || prepared.trackLightweight || !prepared.trackKey || !stageLyricPrewarm.mesh) return null;
  if (!lyricsLines || !lyricsLines.length) return null;
  index = Math.max(0, Math.min(lyricsLines.length - 1, Math.round(Number(index) || 0)));
  var payload = buildStageLyricDisplayPayload(index);
  if (!payload || payload.trackLightweight) return null;
  return stageLyricMeshCanServePayload(stageLyricPrewarm.mesh, payload) ? payload : null;
}

function stageLyricPrewarmFullCanServeIndex(index) {
  return !!stageLyricPreparedFullPayloadForIndex(index);
}

function shouldDeferStageLyricSyncBuild(payload, redrawOnly) {
  if (redrawOnly || !payload || !lyricsLines || !lyricsLines.length) return false;
  if (stageLyricPayloadIsSingleLine(payload)) return false;
  if (payload.trackLightweight) return false;
  var multiLineLoad = stageLyricMultiLineWarmupLoad();
  if (!multiLineLoad && lyricsLines.length < 24) return false;
  if (payload.trackIndex == null || !payload.trackKey) return false;
  if (stageLyrics.current && stageLyricMeshCanServePayload(stageLyrics.current, payload)) return false;
  if (stageLyricPrewarmCanServePayload(payload)) return false;
  return true;
}

function requestStageLyricDemandPrewarm(payload) {
  if (!payload) return;
  requestStageLyricWarmup('track-demand', 180);
  var singleLineDemand = stageLyricPayloadIsSingleLine(payload);
  var reason = singleLineDemand ? 'single-line-demand' : (payload.trackLightweight ? 'track-demand-light' : 'track-demand');
  var delay = singleLineDemand ? 0 : 16;
  if (payload.trackIndex != null && isFinite(Number(payload.trackIndex))) {
    if (singleLineDemand) scheduleStageLyricSingleLineCachePrewarm(Number(payload.trackIndex), reason, delay);
    else scheduleStageLyricPrewarmForIndex(Number(payload.trackIndex), reason, delay);
  } else {
    scheduleStageLyricPrewarm(reason, delay);
  }
  if (payload.trackLightweight && typeof scheduleStageLyricFullTrackWarmup === 'function') {
    scheduleStageLyricFullTrackWarmup('lightweight-upgrade', 120);
  }
}

function ensureStageLyricPlaybackWarmup(reason, delay) {
  if (!fx || !fx.particleLyrics || !lyricsLines || !lyricsLines.length) return false;
  var idx = stageLyrics && stageLyrics.currentIdx >= 0 ? stageLyrics.currentIdx : chooseStageLyricPrewarmIndex();
  if (idx < 0) return false;
  var now = stageLyricNowMs();
  if (
    stageLyricPlaybackWarmupLastIndex === idx &&
    now - stageLyricPlaybackWarmupLastAt < 680 &&
    (stageLyricPrewarm.timer || stageLyricPrewarm.workTimer || stageLyricPrewarm.workRaf || stageLyricPrewarm.build || stageLyricPrewarm.mesh || stageLyricFullTrackWarmupTimer)
  ) {
    return true;
  }
  stageLyricPlaybackWarmupLastAt = now;
  stageLyricPlaybackWarmupLastIndex = idx;
  requestStageLyricWarmup(reason || 'playback-resume', 220);
  scheduleStageLyricPrewarmForIndex(idx, reason || 'playback-resume', delay == null ? 16 : delay);
  if (typeof scheduleStageLyricFullTrackWarmup === 'function') scheduleStageLyricFullTrackWarmup('track-ready-fast', 96);
  return true;
}

function requestStageLyricLightweightUpgrade(reason, delay) {
  if (!fx || !fx.particleLyrics || !lyricsLines || !lyricsLines.length) return false;
  var now = stageLyricNowMs();
  if (
    now - stageLyricLightweightUpgradeLastAt < 900 &&
    (stageLyricFullTrackWarmupTimer || stageLyricPrewarm.timer || stageLyricPrewarm.workTimer || stageLyricPrewarm.workRaf || stageLyricPrewarm.build || stageLyricPrewarm.mesh)
  ) {
    return true;
  }
  stageLyricLightweightUpgradeLastAt = now;
  if (typeof scheduleStageLyricFullTrackWarmup === 'function') {
    scheduleStageLyricFullTrackWarmup(reason || 'lightweight-upgrade', delay == null ? 132 : delay);
    return true;
  }
  return ensureStageLyricPlaybackWarmup(reason || 'lightweight-upgrade', delay == null ? 32 : delay);
}

function stageLyricCurrentUsesPersistentTrack() {
  var data = stageLyrics && stageLyrics.current && stageLyrics.current.userData && stageLyrics.current.userData.lyric;
  return !!(data && data.trackPersistent);
}

function stageLyricResidentRowKey(row) {
  if (!row) return '';
  var lineIndex = row.isTranslation
    ? (row.parentIndex != null ? Number(row.parentIndex) : Number(row.lineIndex))
    : Number(row.lineIndex);
  if (!isFinite(lineIndex)) return '';
  return Math.round(lineIndex) + '|' + (row.isTranslation ? 'translation' : 'primary');
}

function updateStageLyricPersistentResidentBounds(data) {
  if (!data || !Array.isArray(data.rowLayers)) return;
  var start = Infinity;
  var end = -Infinity;
  var count = 0;
  for (var i = 0; i < data.rowLayers.length; i++) {
    var row = data.rowLayers[i];
    if (!row || !row.isPrimary || row.lineIndex == null || !isFinite(Number(row.lineIndex))) continue;
    var lineIndex = Math.round(Number(row.lineIndex));
    start = Math.min(start, lineIndex);
    end = Math.max(end, lineIndex);
    count += 1;
  }
  data.trackResidentStart = isFinite(start) ? start : 0;
  data.trackResidentEnd = isFinite(end) ? end : -1;
  data.trackResidentPrimaryCount = count;
}

function cancelStageLyricResidentBuild() {
  cancelStageLyricResidentDemand();
  if (stageLyricResidentBuild.timer) clearTimeout(stageLyricResidentBuild.timer);
  if (stageLyricResidentBuild.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(stageLyricResidentBuild.raf);
  stageLyricResidentBuild.timer = 0;
  stageLyricResidentBuild.raf = 0;
  stageLyricResidentBuild.token += 1;
  var job = stageLyricResidentBuild.job;
  stageLyricResidentBuild.job = null;
  if (job && job.state) {
    if (typeof cancelLyricRowLayerGroupBuild === 'function') cancelLyricRowLayerGroupBuild(job.state);
    else if (job.state.root) disposeLyricMesh(job.state.root);
  }
  if (typeof window !== 'undefined' && window.__mineradioLyricResidentStats) {
    window.__mineradioLyricResidentStats.active = false;
  }
}

function cancelStageLyricResidentDemand() {
  if (stageLyricResidentDemand.timer) clearTimeout(stageLyricResidentDemand.timer);
  stageLyricResidentDemand.timer = 0;
  stageLyricResidentDemand.mesh = null;
  stageLyricResidentDemand.targetIndex = -1;
  stageLyricResidentDemand.options = null;
}

function scheduleStageLyricResidentDemand(mesh, targetIndex, options) {
  stageLyricResidentDemand.mesh = mesh;
  stageLyricResidentDemand.targetIndex = targetIndex;
  stageLyricResidentDemand.options = options || {};
  if (stageLyricProgressPreviewActive()) stageLyricResidentDemand.options.interactive = true;
  if (stageLyricResidentDemand.timer) return true;
  stageLyricResidentDemand.timer = setTimeout(function () {
    var demandMesh = stageLyricResidentDemand.mesh;
    var demandTarget = stageLyricResidentDemand.targetIndex;
    var demandOptions = stageLyricResidentDemand.options || {};
    var coalescedOptions = {};
    for (var optionKey in demandOptions) coalescedOptions[optionKey] = demandOptions[optionKey];
    coalescedOptions.urgent = false;
    coalescedOptions.coalesced = true;
    cancelStageLyricResidentDemand();
    ensureStageLyricPersistentTrackRows(demandMesh, demandTarget, coalescedOptions);
  }, 48);
  return true;
}

function buildStageLyricResidentPayload(index, start, end, options) {
  options = options || {};
  if (!lyricsLines || !lyricsLines.length) return null;
  var mode = normalizeLyricDisplayMode(fx && fx.lyricDisplayMode);
  var last = lyricsLines.length - 1;
  start = Math.max(0, Math.min(last, Math.round(Number(start) || 0)));
  end = Math.max(start, Math.min(last, Math.round(Number(end) || start)));
  index = Math.max(start, Math.min(end, Math.round(Number(index) || start)));
  var entries = [];
  var activeLine = 0;
  for (var i = start; i <= end; i++) {
    var entry = stageLyricTrackBaseEntry(i);
    if (!entry) continue;
    if (i === index) activeLine = entries.length;
    entries.push(entry);
  }
  if (!entries.length) return null;
  var translated = applyLyricTranslationModeToTrackEntries(entries, activeLine, entries.length * 2 + 2);
  return {
    mode: mode,
    key: 'resident|' + stageLyricTrackKeyForMode(mode) + '|' + start + '-' + end + '|' + index,
    activeLine: translated.activeLine,
    entries: translated.entries,
    trackIndex: index,
    trackKey: stageLyricTrackKeyForMode(mode),
    trackEntries: translated.entries,
    trackStart: start,
    trackEnd: end,
    trackLightweight: true,
    trackTextOnly: options.textOnly === true
  };
}

function disposeStageLyricResidentRow(row) {
  if (!row) return;
  if (typeof releaseLyricRowQuality === 'function') releaseLyricRowQuality(row, true);
  if (row.mesh) disposeLyricMesh(row.mesh);
  if (row.readability) disposeLyricMesh(row.readability);
  if (row.glow) disposeLyricMesh(row.glow);
}

function alignStageLyricResidentEffectToRow(row, effect, zOffset) {
  if (!row || !row.mesh || !effect) return;
  effect.position.copy(row.mesh.position);
  effect.position.z += Number(zOffset) || 0;
  effect.scale.copy(row.mesh.scale);
}

function stageLyricResidentDisplayedScrollOffset(data, fallbackOffset) {
  if (!data || !Array.isArray(data.rowLayers) || !data.rowLayers.length) return fallbackOffset;
  var lineStepWorld = clampRange(Number(data.lineWorldStep) || 0.38, 0.20, 0.94);
  var samples = [];
  for (var i = 0; i < data.rowLayers.length; i++) {
    var row = data.rowLayers[i];
    if (!row || !row.isPrimary || !row.mesh || !isFinite(Number(row.virtualIndex)) || !isFinite(Number(row.mesh.position.y))) continue;
    var visualOffset = Number(row.virtualIndex) + Number(row.mesh.position.y) / lineStepWorld;
    if (isFinite(visualOffset)) samples.push(visualOffset);
  }
  if (!samples.length) return fallbackOffset;
  samples.sort(function (a, b) { return a - b; });
  var middle = Math.floor(samples.length / 2);
  return samples.length % 2 ? samples[middle] : (samples[middle - 1] + samples[middle]) * 0.5;
}

function stageLyricResidentTransformSnapshot(data) {
  data = data || {};
  var previewMotionLock = typeof stageLyricProgressPreviewActive === 'function' && stageLyricProgressPreviewActive();
  var pendingLineIndex = data.trackPendingPayload && isFinite(Number(data.trackPendingPayload.trackIndex))
    ? Number(data.trackPendingPayload.trackIndex)
    : null;
  var targetLineIndex = previewMotionLock && pendingLineIndex != null
    ? pendingLineIndex
    : (isFinite(Number(data.trackTargetLineIndex)) ? Number(data.trackTargetLineIndex) : 0);
  var targetVirtualIndex = previewMotionLock
    ? lyricPrimaryVirtualIndex(targetLineIndex)
    : (isFinite(Number(data.trackTargetVirtualIndex)) ? Number(data.trackTargetVirtualIndex) : lyricPrimaryVirtualIndex(targetLineIndex));
  var sharedScrollOffset = isFinite(Number(data.trackScrollOffset)) ? Number(data.trackScrollOffset) : targetVirtualIndex;
  var displayedScrollOffset = stageLyricResidentDisplayedScrollOffset(data, sharedScrollOffset);
  return {
    previewMotionLock: previewMotionLock,
    targetLineIndex: targetLineIndex,
    targetVirtualIndex: targetVirtualIndex,
    // Resident rows join the coordinate system that is on screen *now*.
    // Pending/final targets only choose what to build; using them as the
    // birth coordinate makes late rows fly in from another scroll phase.
    scrollOffset: displayedScrollOffset
  };
}

function primeStageLyricResidentRowTransform(data, row, transformSnapshot) {
  if (!data || !row || !row.mesh) return;
  var snapshot = transformSnapshot || stageLyricResidentTransformSnapshot(data);
  var targetLineIndex = Number(snapshot.targetLineIndex) || 0;
  var targetVirtualIndex = isFinite(Number(snapshot.targetVirtualIndex)) ? Number(snapshot.targetVirtualIndex) : lyricPrimaryVirtualIndex(targetLineIndex);
  var scrollOffset = isFinite(Number(snapshot.scrollOffset)) ? Number(snapshot.scrollOffset) : targetVirtualIndex;
  var lineStepWorld = clampRange(Number(data.lineWorldStep) || 0.38, 0.20, 0.94);
  var translationLineStepWorld = clampRange(Number(data.translationLineStepWorld) || lineStepWorld, 0.20, 0.78);
  var rowVirtualIndex = isFinite(Number(row.virtualIndex)) ? Number(row.virtualIndex) : targetVirtualIndex;
  var rowLineIndex = isFinite(Number(row.lineIndex)) ? Number(row.lineIndex) : null;
  var isActive = !!row.isPrimary && rowLineIndex === targetLineIndex;
  var parentIndex = row.isTranslation
    ? (isFinite(Number(row.parentIndex)) ? Number(row.parentIndex) : rowLineIndex)
    : null;
  var currentTranslation = row.isTranslation && parentIndex === targetLineIndex;
  var visibilityAbs = row.isTranslation && parentIndex != null
    ? Math.abs(lyricPrimaryVirtualIndex(parentIndex) - scrollOffset)
    : Math.abs(rowVirtualIndex - scrollOffset);
  var yTarget = -(rowVirtualIndex - scrollOffset) * lineStepWorld;
  if (row.isTranslation) {
    yTarget = lyricTranslationAnchoredY(row, rowVirtualIndex, targetVirtualIndex, lineStepWorld, translationLineStepWorld, scrollOffset, 0, currentTranslation, true);
  }
  var zTarget = 0.055 - Math.pow(Math.min(5.5, visibilityAbs), 1.06) * 0.145 + (currentTranslation ? 0.065 : 0);
  var scaleDistance = isActive || currentTranslation ? 0 : visibilityAbs;
  var scaleTarget = clampRange(1 - Math.min(5.5, scaleDistance) * 0.026, 0.84, 1.02);
  if (row.isTranslation) {
    scaleTarget *= clampRange(Number(row.fontScale) || 1, 0.72, 1.34);
    if (currentTranslation) scaleTarget *= 1.16;
  }
  row.mesh.position.set(0, yTarget, zTarget);
  row.mesh.scale.setScalar(scaleTarget);
  alignStageLyricResidentEffectToRow(row, row.readability, -0.012);
  alignStageLyricResidentEffectToRow(row, row.glow, -0.030);
}

function mergeStageLyricResidentBundle(mesh, bundle) {
  var data = mesh && mesh.userData && mesh.userData.lyric;
  if (!data || !bundle || !Array.isArray(bundle.rows)) return 0;
  var existing = {};
  for (var i = 0; i < data.rowLayers.length; i++) {
    var existingKey = stageLyricResidentRowKey(data.rowLayers[i]);
    if (existingKey) existing[existingKey] = data.rowLayers[i];
  }
  var added = 0;
  var textParent = data.contextGroup || data.rowLayerGroup;
  var effectParent = data.readabilityGroup || data.rowLayerGroup;
  var transformSnapshot = stageLyricResidentTransformSnapshot(data);
  for (var ri = 0; ri < bundle.rows.length; ri++) {
    var row = bundle.rows[ri];
    var key = stageLyricResidentRowKey(row);
    var existingRow = key ? existing[key] : null;
    if (existingRow) {
      if (!existingRow.readability && row.readability) {
        if (row.readability.parent) row.readability.parent.remove(row.readability);
        effectParent.add(row.readability);
        existingRow.readability = row.readability;
        existingRow.readabilityMat = row.readabilityMat;
        existingRow.renderReadabilityUploaded = false;
        alignStageLyricResidentEffectToRow(existingRow, existingRow.readability, -0.012);
        row.readability = null;
        row.readabilityMat = null;
      }
      if (!existingRow.glow && row.glow) {
        if (row.glow.parent) row.glow.parent.remove(row.glow);
        effectParent.add(row.glow);
        existingRow.glow = row.glow;
        existingRow.glowMat = row.glowMat;
        existingRow.renderGlowUploaded = false;
        alignStageLyricResidentEffectToRow(existingRow, existingRow.glow, -0.030);
        row.glow = null;
        row.glowMat = null;
      }
      disposeStageLyricResidentRow(row);
      continue;
    }
    if (!key) {
      disposeStageLyricResidentRow(row);
      continue;
    }
    existing[key] = row;
    if (row.mesh) {
      if (row.mesh.parent) row.mesh.parent.remove(row.mesh);
      textParent.add(row.mesh);
    }
    if (row.readability) {
      if (row.readability.parent) row.readability.parent.remove(row.readability);
      effectParent.add(row.readability);
    }
    if (row.glow) {
      if (row.glow.parent) row.glow.parent.remove(row.glow);
      effectParent.add(row.glow);
    }
    row.renderWindowActive = false;
    row.renderRevealAt = 0;
    primeStageLyricResidentRowTransform(data, row, transformSnapshot);
    data.rowLayers.push(row);
    added += 1;
  }
  data.rowLayers.sort(function (a, b) {
    var av = isFinite(Number(a && a.virtualIndex)) ? Number(a.virtualIndex) : 0;
    var bv = isFinite(Number(b && b.virtualIndex)) ? Number(b.virtualIndex) : 0;
    return av - bv;
  });
  if (bundle.group) disposeLyricMesh(bundle.group);
  updateStageLyricPersistentResidentBounds(data);
  return added;
}

function finishStageLyricResidentBuild(job) {
  if (!job || stageLyricResidentBuild.job !== job) return;
  stageLyricResidentBuild.job = null;
  stageLyricResidentBuild.timer = 0;
  stageLyricResidentBuild.raf = 0;
  var bundle = finishLyricRowLayerGroupBuild(job.state);
  var data = job.mesh && job.mesh.userData && job.mesh.userData.lyric;
  if (!bundle || !data || !data.trackPersistent || stageLyrics.current !== job.mesh || data.trackKey !== job.trackKey) {
    if (bundle && bundle.group) disposeLyricMesh(bundle.group);
    return;
  }
  var added = mergeStageLyricResidentBundle(job.mesh, bundle);
  var demandIndex = data.trackPendingPayload && data.trackPendingPayload.trackIndex != null
    ? Number(data.trackPendingPayload.trackIndex)
    : Number(data.trackTargetLineIndex);
  if (!data.trackPendingPayload) trimStageLyricPersistentTrackRows(job.mesh, demandIndex);
  else if (job.interactive && job.textOnly && stageLyricProgressPreviewActive()) {
    // A long pointer drag can finish several now-stale text-only windows before
    // the newest demand is ready. Keep the committed window plus the newest
    // preview window, instead of retaining every row crossed by the pointer.
    trimStageLyricPersistentTrackRows(job.mesh, demandIndex, {
      interactive: true,
      preserveTargetIndex: data.trackTargetLineIndex
    });
  }
  // Keep extending the cheap text runway first.  Once it is complete,
  // ensureStageLyricPersistentTrackRows schedules effects only for the visible
  // window, so effect work can never split the continuous scrolling track.
  ensureStageLyricPersistentTrackRows(job.mesh, demandIndex, {
    reason: 'persistent-track-continue',
    urgent: !!data.trackPendingPayload,
    interactive: !!(job.interactive || stageLyricProgressPreviewActive())
  });
  if (typeof window !== 'undefined') {
    window.__mineradioLyricResidentStats = {
      active: !!stageLyricResidentBuild.job,
      rootId: job.mesh.id,
      trackKey: data.trackKey,
      residentStart: data.trackResidentStart,
      residentEnd: data.trackResidentEnd,
      residentPrimaryCount: data.trackResidentPrimaryCount,
      residentRows: data.rowLayers.length,
      lastAddedRows: added,
      lastBuildMs: Math.max(0, stageLyricNowMs() - job.startedAt)
    };
  }
}

function runStageLyricResidentBuild(job) {
  stageLyricResidentBuild.timer = 0;
  stageLyricResidentBuild.raf = 0;
  if (!job || stageLyricResidentBuild.job !== job || job.token !== stageLyricResidentBuild.token) return;
  var data = job.mesh && job.mesh.userData && job.mesh.userData.lyric;
  if (!data || !data.trackPersistent || stageLyrics.current !== job.mesh || data.trackKey !== job.trackKey) {
    cancelStageLyricResidentBuild();
    return;
  }
  if (stageLyricShouldYieldToPendingInput() && !job.interactive && !job.textOnly) {
    scheduleStageLyricResidentBuildWork(job, 12);
    return;
  }
  var startedAt = stageLyricNowMs();
  var phaseLimit = job.textOnly ? 8 : (job.interactive ? 5 : 2);
  var phaseBudget = job.textOnly ? 2.8 : (job.interactive ? 3.4 : 4.2);
  var done = stepLyricRowLayerGroupBuild(job.state, phaseLimit, phaseBudget);
  var chunkMs = stageLyricNowMs() - startedAt;
  job.maxChunkMs = Math.max(job.maxChunkMs, chunkMs);
  if (done) {
    finishStageLyricResidentBuild(job);
    return;
  }
  scheduleStageLyricResidentBuildWork(job, chunkMs >= 4.2 ? 8 : 0);
}

function scheduleStageLyricResidentBuildWork(job, delay) {
  if (!job || stageLyricResidentBuild.job !== job) return;
  delay = Math.max(0, Number(delay) || 0);
  var queue = function () {
    stageLyricResidentBuild.timer = 0;
    if (!job || stageLyricResidentBuild.job !== job) return;
    if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      stageLyricResidentBuild.raf = requestAnimationFrame(function () {
        stageLyricResidentBuild.raf = 0;
        runStageLyricResidentBuild(job);
      });
    } else {
      stageLyricResidentBuild.timer = setTimeout(function () { runStageLyricResidentBuild(job); }, 12);
    }
  };
  if (delay > 0) stageLyricResidentBuild.timer = setTimeout(queue, delay);
  else queue();
}

function startStageLyricResidentBuild(mesh, targetIndex, start, end, options) {
  options = options || {};
  var data = mesh && mesh.userData && mesh.userData.lyric;
  if (!data || !data.trackPersistent) return false;
  cancelStageLyricResidentBuild();
  var payload = buildStageLyricResidentPayload(targetIndex, start, end, { textOnly: options.textOnly === true });
  if (!payload) return false;
  var maskLayout = data.persistentMaskLayout || { fontSize: 128, lineHeight: 138 };
  var state = beginLyricRowLayerGroupBuild(payload, maskLayout, Number(data.worldW) || 6.10, Number(data.worldH) || 1.2, stageLyrics.palette, lyricMotionProfile());
  // Resident chunks are extensions of one continuous track.  Reuse the
  // original track spacing instead of recalculating it from a compact raster.
  if (state && isFinite(Number(data.lineWorldStep))) state.lineStepWorld = Number(data.lineWorldStep);
  if (state && isFinite(Number(data.translationLineStepWorld))) state.translationLineStepWorld = Number(data.translationLineStepWorld);
  var job = {
    mesh: mesh,
    trackKey: data.trackKey,
    targetIndex: targetIndex,
    start: start,
    end: end,
    reason: options.reason || '',
    textOnly: options.textOnly === true,
    effectsOnly: options.effectsOnly === true,
    interactive: options.interactive === true,
    state: state,
    token: stageLyricResidentBuild.token,
    startedAt: stageLyricNowMs(),
    maxChunkMs: 0
  };
  stageLyricResidentBuild.job = job;
  if (typeof window !== 'undefined') {
    window.__mineradioLyricResidentStats = {
      active: true,
      rootId: mesh.id,
      trackKey: data.trackKey,
      buildStart: start,
      buildEnd: end,
      reason: job.reason,
      residentPrimaryCount: data.trackResidentPrimaryCount,
      residentRows: data.rowLayers.length
    };
  }
  scheduleStageLyricResidentBuildWork(job, 0);
  return true;
}

function stageLyricPersistentPrimaryMap(data) {
  var map = {};
  if (!data || !Array.isArray(data.rowLayers)) return map;
  for (var i = 0; i < data.rowLayers.length; i++) {
    var row = data.rowLayers[i];
    if (row && row.isPrimary && row.lineIndex != null && isFinite(Number(row.lineIndex))) map[Math.round(Number(row.lineIndex))] = true;
  }
  return map;
}

function stageLyricPersistentResidentRowMap(data) {
  var map = {};
  if (!data || !Array.isArray(data.rowLayers)) return map;
  for (var i = 0; i < data.rowLayers.length; i++) {
    var row = data.rowLayers[i];
    var key = stageLyricResidentRowKey(row);
    if (key) map[key] = row;
  }
  return map;
}

function stageLyricPersistentLineRowsResident(data, lineIndex, rowMap) {
  lineIndex = Math.round(Number(lineIndex));
  if (!isFinite(lineIndex) || !lyricsLines || lineIndex < 0 || lineIndex >= lyricsLines.length) return true;
  var entry = stageLyricTrackBaseEntry(lineIndex);
  if (!entry) return true;
  rowMap = rowMap || stageLyricPersistentResidentRowMap(data);
  if (!rowMap[lineIndex + '|primary']) return false;
  if (
    normalizeLyricTranslationMode(fx && fx.lyricTranslationMode) !== 'off' &&
    makeStageLyricTranslationEntry(entry, false) &&
    !rowMap[lineIndex + '|translation']
  ) return false;
  return true;
}

function stageLyricPersistentLineEffectsResident(data, lineIndex, rowMap) {
  lineIndex = Math.round(Number(lineIndex));
  if (!isFinite(lineIndex) || !lyricsLines || lineIndex < 0 || lineIndex >= lyricsLines.length) return true;
  var entry = stageLyricTrackBaseEntry(lineIndex);
  if (!entry) return true;
  rowMap = rowMap || stageLyricPersistentResidentRowMap(data);
  var primary = rowMap[lineIndex + '|primary'];
  if (!primary || !primary.readability || !primary.glow) return false;
  if (normalizeLyricTranslationMode(fx && fx.lyricTranslationMode) !== 'off' && makeStageLyricTranslationEntry(entry, false)) {
    var translation = rowMap[lineIndex + '|translation'];
    if (!translation || !translation.readability || !translation.glow) return false;
  }
  return true;
}

function stageLyricPersistentTargetRowsReady(mesh, targetIndex, options) {
  options = options || {};
  var data = mesh && mesh.userData && mesh.userData.lyric;
  if (!data || !data.trackPersistent || !lyricsLines || !lyricsLines.length) return false;
  targetIndex = Math.max(0, Math.min(lyricsLines.length - 1, Math.round(Number(targetIndex) || 0)));
  var offsets = lyricDisplayOffsetsForMode(data.displayMode || (fx && fx.lyricDisplayMode));
  var required = {};
  for (var oi = 0; oi < offsets.length; oi++) {
    var lineIndex = targetIndex + Math.round(Number(offsets[oi]) || 0);
    if (lineIndex < 0 || lineIndex >= lyricsLines.length) continue;
    var entry = stageLyricTrackBaseEntry(lineIndex);
    if (!entry) continue;
    required[lineIndex + '|primary'] = true;
    if (normalizeLyricTranslationMode(fx && fx.lyricTranslationMode) !== 'off' && makeStageLyricTranslationEntry(entry, lineIndex === targetIndex)) {
      required[lineIndex + '|translation'] = true;
    }
  }
  var requiredKeys = Object.keys(required);
  if (!requiredKeys.length) return false;
  var rows = stageLyricPersistentResidentRowMap(data);
  for (var ki = 0; ki < requiredKeys.length; ki++) {
    var requiredRow = rows[requiredKeys[ki]];
    if (!requiredRow || !requiredRow.mesh || !requiredRow.renderLineUploaded) return false;
    if (options.effects === true) {
      if (!requiredRow.readability || !requiredRow.renderReadabilityUploaded) return false;
      if (!requiredRow.glow || !requiredRow.renderGlowUploaded) return false;
    }
  }
  return true;
}

function stageLyricPersistentTargetEffectsReady(mesh, targetIndex) {
  return stageLyricPersistentTargetRowsReady(mesh, targetIndex, { effects: true });
}

function stageLyricPersistentNextTextRunwayRange(data, targetIndex, rowMap) {
  if (!data || !lyricsLines || !lyricsLines.length) return null;
  var last = lyricsLines.length - 1;
  targetIndex = Math.max(0, Math.min(last, Math.round(Number(targetIndex) || 0)));
  rowMap = rowMap || stageLyricPersistentResidentRowMap(data);
  var nextIndex = -1;
  var previousIndex = -1;
  for (var next = targetIndex; next <= last; next++) {
    if (lyricLineDisplayTextAt(next) && !stageLyricPersistentLineRowsResident(data, next, rowMap)) {
      nextIndex = next;
      break;
    }
  }
  for (var previous = targetIndex - 1; previous >= 0; previous--) {
    if (lyricLineDisplayTextAt(previous) && !stageLyricPersistentLineRowsResident(data, previous, rowMap)) {
      previousIndex = previous;
      break;
    }
  }
  if (nextIndex < 0 && previousIndex < 0) {
    data.trackTextRunwayComplete = true;
    data.trackTextRunwayReadyAt = stageLyricNowMs();
    return null;
  }
  data.trackTextRunwayComplete = false;
  var preferPrevious = data.trackTextRunwayDirection === 'previous';
  var usePrevious = previousIndex >= 0 && (nextIndex < 0 || preferPrevious);
  data.trackTextRunwayDirection = usePrevious ? 'next' : 'previous';
  var chunkSize = normalizeLyricTranslationMode(fx && fx.lyricTranslationMode) === 'off' ? 36 : 24;
  if (usePrevious) {
    return {
      start: Math.max(0, previousIndex - chunkSize + 1),
      end: previousIndex
    };
  }
  return {
    start: nextIndex,
    end: Math.min(last, nextIndex + chunkSize - 1)
  };
}

function commitStageLyricPersistentPendingTarget(mesh) {
  var data = mesh && mesh.userData && mesh.userData.lyric;
  var payload = data && data.trackPendingPayload;
  if (!payload || payload.trackIndex == null || !stageLyricPersistentTargetRowsReady(mesh, payload.trackIndex)) return false;
  return setLyricTrackTarget(mesh, payload);
}

function ensureStageLyricPersistentTrackRows(mesh, targetIndex, options) {
  options = options || {};
  var data = mesh && mesh.userData && mesh.userData.lyric;
  if (!data || !data.trackPersistent || !lyricsLines || !lyricsLines.length || stageLyrics.current !== mesh) return false;
  var last = lyricsLines.length - 1;
  targetIndex = Math.max(0, Math.min(last, Math.round(Number(targetIndex) || 0)));
  var residentRowMap = stageLyricPersistentResidentRowMap(data);
  var offsets = lyricDisplayOffsetsForMode(data.displayMode || (fx && fx.lyricDisplayMode));
  var minOffset = 0;
  var maxOffset = 0;
  for (var oi = 0; oi < offsets.length; oi++) {
    minOffset = Math.min(minOffset, Math.round(Number(offsets[oi]) || 0));
    maxOffset = Math.max(maxOffset, Math.round(Number(offsets[oi]) || 0));
  }
  var interactivePreview = !!(options.interactive || stageLyricProgressPreviewActive());
  // Normal playback keeps a long, text-only runway similar to the private
  // build's continuous track, without paying its 200+ row startup cost.
  var desiredStart = Math.max(0, targetIndex + minOffset - (interactivePreview ? 4 : 6));
  var desiredEnd = Math.min(last, targetIndex + maxOffset + (interactivePreview ? 10 : 24));
  var visibleStart = Math.max(0, targetIndex + minOffset);
  var visibleEnd = Math.min(last, targetIndex + maxOffset);
  var targetMissing = !stageLyricPersistentLineRowsResident(data, targetIndex, residentRowMap);
  var firstVisibleMissing = -1;
  for (var visibleIndex = visibleStart; visibleIndex <= visibleEnd; visibleIndex++) {
    if (lyricLineDisplayTextAt(visibleIndex) && !stageLyricPersistentLineRowsResident(data, visibleIndex, residentRowMap)) { firstVisibleMissing = visibleIndex; break; }
  }
  var firstMissing = firstVisibleMissing;
  if (firstMissing < 0) {
    for (var i = desiredStart; i <= desiredEnd; i++) {
      if (lyricLineDisplayTextAt(i) && !stageLyricPersistentLineRowsResident(data, i, residentRowMap)) { firstMissing = i; break; }
    }
  }
  if (firstMissing < 0) {
    var firstEffectsMissing = -1;
    for (var effectIndex = visibleStart; effectIndex <= visibleEnd; effectIndex++) {
      if (lyricLineDisplayTextAt(effectIndex) && !stageLyricPersistentLineEffectsResident(data, effectIndex, residentRowMap)) {
        firstEffectsMissing = effectIndex;
        break;
      }
    }
    cancelStageLyricResidentDemand();
    if (firstEffectsMissing >= 0) {
      var effectJob = stageLyricResidentBuild.job;
      if (effectJob && effectJob.mesh === mesh) {
        if (!effectJob.textOnly && effectJob.start <= visibleStart && effectJob.end >= visibleEnd) return true;
        cancelStageLyricResidentBuild();
      }
      return startStageLyricResidentBuild(mesh, targetIndex, visibleStart, visibleEnd, {
        reason: options.reason || 'persistent-track-visible-effects',
        effectsOnly: true,
        interactive: interactivePreview
      });
    }
    // Once the visible window is complete, keep extending the cheap text-only
    // track in the background until the whole song is resident.  This restores
    // the private build's one-piece scroll without paying for off-screen glow
    // and readability layers.
    if (!interactivePreview && !data.trackPendingPayload) {
      var activeRunwayJob = stageLyricResidentBuild.job;
      if (activeRunwayJob && activeRunwayJob.mesh === mesh) return true;
      var runwayRange = stageLyricPersistentNextTextRunwayRange(data, targetIndex, residentRowMap);
      if (runwayRange) {
        return startStageLyricResidentBuild(mesh, targetIndex, runwayRange.start, runwayRange.end, {
          reason: options.reason || 'persistent-track-full-text-runway',
          textOnly: true,
          interactive: false
        });
      }
    }
    trimStageLyricPersistentTrackRows(mesh, targetIndex);
    return true;
  }
  if (options.urgent && !options.coalesced && stageLyricProgressPreviewActive()) {
    return scheduleStageLyricResidentDemand(mesh, targetIndex, options);
  }
  cancelStageLyricResidentDemand();
  var buildStart = firstVisibleMissing >= 0 ? visibleStart : firstMissing;
  var buildEnd = firstVisibleMissing >= 0 ? visibleEnd : buildStart;
  var usable = 0;
  for (var initialIndex = buildStart; initialIndex <= buildEnd; initialIndex++) {
    if (lyricLineDisplayTextAt(initialIndex) && !stageLyricPersistentLineRowsResident(data, initialIndex, residentRowMap)) usable += 1;
  }
  var chunkLimit = interactivePreview ? Math.max(8, offsets.length) : Math.max(28, offsets.length);
  if (!interactivePreview || firstVisibleMissing < 0) {
    while (buildEnd < desiredEnd && usable < chunkLimit) {
      buildEnd += 1;
      if (lyricLineDisplayTextAt(buildEnd) && !stageLyricPersistentLineRowsResident(data, buildEnd, residentRowMap)) usable += 1;
    }
  }
  buildEnd = Math.max(buildStart, Math.min(last, buildEnd));
  var activeJob = stageLyricResidentBuild.job;
  if (activeJob && activeJob.mesh === mesh) {
    var activeCoversVisibleWindow = activeJob.start <= visibleStart && activeJob.end >= visibleEnd;
    if (firstVisibleMissing >= 0 && activeCoversVisibleWindow && (!interactivePreview || activeJob.textOnly)) return true;
    if (firstVisibleMissing < 0 && !targetMissing) return true;
    cancelStageLyricResidentBuild();
  }
  return startStageLyricResidentBuild(mesh, targetIndex, buildStart, buildEnd, {
    reason: options.reason || (targetMissing ? 'persistent-track-demand' : 'persistent-track-ahead'),
    textOnly: true,
    interactive: interactivePreview
  });
}

function trimStageLyricPersistentTrackRows(mesh, targetIndex, options) {
  options = options || {};
  var data = mesh && mesh.userData && mesh.userData.lyric;
  if (!data || !data.trackPersistent || !Array.isArray(data.rowLayers) || !data.rowLayers.length || !lyricsLines || !lyricsLines.length) return false;
  targetIndex = Math.max(0, Math.min((lyricsLines && lyricsLines.length ? lyricsLines.length - 1 : 0), Math.round(Number(targetIndex) || 0)));
  var offsets = lyricDisplayOffsetsForMode(data.displayMode || (fx && fx.lyricDisplayMode));
  var minOffset = 0;
  var maxOffset = 0;
  for (var oi = 0; oi < offsets.length; oi++) {
    minOffset = Math.min(minOffset, Math.round(Number(offsets[oi]) || 0));
    maxOffset = Math.max(maxOffset, Math.round(Number(offsets[oi]) || 0));
  }
  var interactive = options.interactive === true;
  var keepStart = Math.max(0, targetIndex + minOffset - (interactive ? 3 : 6));
  var keepEnd = Math.min(lyricsLines.length - 1, targetIndex + maxOffset + (interactive ? 5 : 24));
  var preserveTargetIndex = Number(options.preserveTargetIndex);
  var preserveStart = Infinity;
  var preserveEnd = -Infinity;
  if (interactive && isFinite(preserveTargetIndex)) {
    preserveTargetIndex = Math.max(0, Math.min(lyricsLines.length - 1, Math.round(preserveTargetIndex)));
    preserveStart = Math.max(0, preserveTargetIndex + minOffset - 2);
    preserveEnd = Math.min(lyricsLines.length - 1, preserveTargetIndex + maxOffset + 2);
  }
  var releasedEffects = 0;
  for (var i = 0; i < data.rowLayers.length; i++) {
    var row = data.rowLayers[i];
    var lineIndex = row && row.isTranslation
      ? (row.parentIndex != null ? Number(row.parentIndex) : Number(row.lineIndex))
      : Number(row && row.lineIndex);
    var roundedLineIndex = isFinite(lineIndex) ? Math.round(lineIndex) : null;
    var keepForTarget = roundedLineIndex != null && roundedLineIndex >= keepStart && roundedLineIndex <= keepEnd;
    var keepForCommittedWindow = roundedLineIndex != null && roundedLineIndex >= preserveStart && roundedLineIndex <= preserveEnd;
    var keepEffects = roundedLineIndex == null || keepForTarget || keepForCommittedWindow ||
      roundedLineIndex === targetIndex || roundedLineIndex === preserveTargetIndex;
    if (keepEffects) continue;
    // Text rows are the continuous whole-song runway.  Only their expensive
    // off-screen effect layers are evicted; deleting the text row itself would
    // reintroduce the load/merge break the user sees while seeking.
    if (row.readability) {
      disposeLyricMesh(row.readability);
      row.readability = null;
      row.readabilityMat = null;
      row.renderReadabilityUploaded = false;
      releasedEffects += 1;
    }
    if (row.glow) {
      disposeLyricMesh(row.glow);
      row.glow = null;
      row.glowMat = null;
      row.renderGlowUploaded = false;
      releasedEffects += 1;
    }
  }
  updateStageLyricPersistentResidentBounds(data);
  return releasedEffects > 0;
}

function initializeStageLyricPersistentTrack(mesh, payload) {
  var data = mesh && mesh.userData && mesh.userData.lyric;
  var mode = normalizeLyricDisplayMode(payload && payload.mode || data && data.displayMode || (fx && fx.lyricDisplayMode));
  if (!data || !data.usesTrack || mode === 'single' || !lyricsLines || !lyricsLines.length) return false;
  if (!data.trackPersistent) {
    data.trackPersistent = true;
    data.trackLightweight = false;
    data.trackStart = 0;
    data.trackEnd = lyricsLines.length - 1;
    data.trackScrollWindowKey = data.trackKey || (payload && payload.trackKey) || '';
    if (!isFinite(Number(data.trackScrollOffset))) {
      data.trackScrollOffset = isFinite(Number(data.trackTargetVirtualIndex))
        ? Number(data.trackTargetVirtualIndex)
        : lyricPrimaryVirtualIndex(Number(data.trackTargetLineIndex) || 0);
    }
    data.trackScrollPrimed = true;
    data.trackTextRunwayComplete = false;
    data.trackTextRunwayReadyAt = 0;
    data.trackTextRunwayDirection = 'next';
    var layoutMask = data.activeMask || data.mask || {};
    var stableLayout = typeof stableStageLyricRowMaskLayout === 'function'
      ? stableStageLyricRowMaskLayout()
      : { fontSize: 128, lineHeight: 138 };
    data.persistentMaskLayout = {
      fontSize: Number(layoutMask.logicalFontSize) || Number(stableLayout.fontSize) || 128,
      lineHeight: Number(layoutMask.logicalLineHeight) || Number(stableLayout.lineHeight) || (Number(stableLayout.fontSize) || 128) * 1.08
    };
    data.activeMask = null;
    if (mesh.userData.payload) {
      mesh.userData.payload.trackStart = 0;
      mesh.userData.payload.trackEnd = lyricsLines.length - 1;
      mesh.userData.payload.trackLightweight = false;
    }
    updateStageLyricPersistentResidentBounds(data);
  }
  clearStageLyricFullTrackWarmup();
  ensureStageLyricPersistentTrackRows(mesh, payload && payload.trackIndex != null ? payload.trackIndex : data.trackTargetLineIndex, { reason: 'persistent-track-bootstrap' });
  return true;
}

function stageLyricCurrentUsesLightweightTrack() {
  var data = stageLyrics && stageLyrics.current && stageLyrics.current.userData && stageLyrics.current.userData.lyric;
  return !!(data && data.trackLightweight);
}

function stageLyricTrackRevealReady(mesh) {
  var data = mesh && mesh.userData && mesh.userData.lyric;
  if (!data || !data.usesTrack) return true;
  if (data.renderInitialTextReady !== true) return false;
  var readyAt = Number(data.renderInitialTextReadyAt) || 0;
  return !readyAt || stageLyricNowMs() - readyAt >= 48;
}

function stageLyricShouldHoldOutgoingForReveal(current, incoming) {
  var currentData = current && current.userData && current.userData.lyric;
  var incomingData = incoming && incoming.userData && incoming.userData.lyric;
  return !!(
    currentData && incomingData && currentData.usesTrack && incomingData.usesTrack &&
    currentData.trackKey && currentData.trackKey === incomingData.trackKey &&
    incomingData.renderInitialTextReady !== true
  );
}

function releaseStageLyricRevealHoldsForSuccessor(successor) {
  if (!successor || !stageLyrics || !stageLyrics.outgoing) return;
  for (var i = 0; i < stageLyrics.outgoing.length; i++) {
    var outgoing = stageLyrics.outgoing[i];
    if (!outgoing || !outgoing.userData || outgoing.userData.lyricRevealSuccessor !== successor) continue;
    outgoing.userData.lyricRevealSuccessor = null;
    outgoing.userData.age = 0;
  }
}

function stageLyricLightweightPrewarmAwaitingTakeover() {
  if (!stageLyricPrewarm) return false;
  if (stageLyricPrewarm.build && stageLyricPrewarm.build.lightweight) return true;
  if (
    stageLyricPrewarm.lightweight &&
    (stageLyricPrewarm.timer || stageLyricPrewarm.workTimer || stageLyricPrewarm.workRaf)
  ) return true;
  var prepared = stageLyricPrewarmPayload();
  return !!(
    stageLyricPrewarm.mesh && prepared && prepared.trackLightweight &&
    (!stageLyrics || Number(stageLyrics.currentIdx) < 0)
  );
}

function stageLyricCurrentCanResumeWithoutWarmup() {
  if (!stageLyrics || !stageLyrics.current || !stageLyrics.currentPayload || stageLyrics.currentIdx < 0) return false;
  return !stageLyricCurrentUsesLightweightTrack();
}

function upgradeCurrentStageLyricFromPreparedTrack(reason) {
  if (!stageLyrics || !stageLyrics.current || stageLyrics.currentIdx < 0 || !stageLyricMultiLineWarmupLoad()) return false;
  if (stageLyricPayloadIsSingleLine(stageLyrics.currentPayload)) return false;
  var data = stageLyrics.current.userData && stageLyrics.current.userData.lyric;
  if (!data || !data.trackLightweight) return false;
  var idx = Number(stageLyrics.currentIdx);
  if (!isFinite(idx)) return false;
  var payload = stageLyricPreparedFullPayloadForIndex(idx);
  if (!payload) {
    if ((Number(stageLyricResumeUpgradeDeferUntil) || 0) > stageLyricNowMs()) return false;
    requestStageLyricLightweightUpgrade(reason || 'lightweight-upgrade', 132);
    return false;
  }
  var progress = stageLyrics.current.userData ? (stageLyrics.current.userData.lastLyricProgress || 0) : 0;
  stageLyrics.transitionLineStep = 0;
  if (!showStageLine(payload, false)) return false;
  stageLyrics.currentPayload = payload;
  stageLyrics.currentDisplayKey = payload.key;
  updateLyricMeshProgress(stageLyrics.current, progress);
  if (stageLyrics.current && stageLyrics.current.userData) {
    stageLyrics.current.userData.age = Math.max(Number(stageLyrics.current.userData.age) || 0, 0.36);
  }
  return true;
}

function stageLyricProgressPreviewActive() {
  return typeof isProgressDragPreviewActive === 'function' && isProgressDragPreviewActive();
}
function stageLyricPlaybackSeconds() {
  var preview = typeof getProgressDragPreviewSeconds === 'function' ? getProgressDragPreviewSeconds() : null;
  if (preview != null && isFinite(Number(preview))) return Math.max(0, Number(preview));
  var restoreSeconds = stageLyricRestoreWarmupSeconds();
  if (restoreSeconds != null) return restoreSeconds;
  return audio && isFinite(Number(audio.currentTime)) ? Math.max(0, Number(audio.currentTime)) : 0;
}
function stageLyricProgressSeekVisualReady(seconds) {
  if (!lyricsLines || !lyricsLines.length || !stageLyrics || !stageLyrics.current) return false;
  var t = Math.max(0, Number(seconds) || 0);
  var lyricT = typeof getAdjustedLyricPlaybackTime === 'function' ? getAdjustedLyricPlaybackTime(t) : t;
  var targetIndex = findStageLyricIndexAtTime(lyricT);
  if (targetIndex < 0) return stageLyrics.currentIdx === -2;
  if (Number(stageLyrics.currentIdx) !== Number(targetIndex)) return false;
  var data = stageLyrics.current.userData && stageLyrics.current.userData.lyric;
  if (!data || !data.trackPersistent) return true;
  if (Number(data.trackTargetLineIndex) !== Number(targetIndex)) return false;
  if (data.trackPendingPayload) return false;
  return stageLyricPersistentTargetRowsReady(stageLyrics.current, targetIndex);
}
function chooseStageLyricPrewarmIndex() {
  if (!lyricsLines || !lyricsLines.length) return -1;
  if (
    (Number(stageLyricTrackSwitchBootstrapUntil) || 0) > stageLyricNowMs() &&
    (!stageLyrics || stageLyrics.currentIdx < 0)
  ) {
    return 0;
  }
  var idx = -1;
  try {
    var t = stageLyricPlaybackSeconds();
    var lyricT = typeof getAdjustedLyricPlaybackTime === 'function' ? getAdjustedLyricPlaybackTime(t) : t;
    idx = findStageLyricIndexAtTime(lyricT);
  } catch (e) {
    idx = -1;
  }
  if (idx < 0) idx = 0;
  return Math.max(0, Math.min(lyricsLines.length - 1, idx));
}

function stageLyricSingleLineBootstrapIndex() {
  if (!lyricsLines || !lyricsLines.length) return -1;
  if (normalizeLyricDisplayMode(fx && fx.lyricDisplayMode) !== 'single') return -1;
  if (stageLyrics && stageLyrics.currentIdx >= 0) return Math.max(0, Math.min(lyricsLines.length - 1, stageLyrics.currentIdx));
  return chooseStageLyricPrewarmIndex();
}

function stageLyricShouldBuildCooperatively(payload) {
  return !!(
    payload && normalizeLyricDisplayMode(payload.mode) !== 'single' &&
    Array.isArray(payload.trackEntries) && payload.trackEntries.length > 2 &&
    typeof beginCooperativeLyricMeshBuild === 'function' &&
    typeof stepCooperativeLyricMeshBuild === 'function' &&
    typeof finishCooperativeLyricMeshBuild === 'function'
  );
}

function updateStageLyricBuildStats(job, active, chunkMs) {
  if (typeof window === 'undefined') return;
  var stats = window.__mineradioLyricBuildStats || {};
  var buildState = job && job.state;
  var rowState = job && job.state && job.state.rowState;
  var phase = job && job.lastPhase || buildState && buildState.lastPhase || '';
  stats.active = !!active;
  stats.reason = job && job.reason || stats.reason || '';
  stats.lightweight = !!(job && job.lightweight);
  stats.totalRows = buildState ? Number(buildState.totalRows) || 0 : Number(stats.totalRows) || 0;
  stats.builtRows = rowState ? Number(rowState.cursor) || 0 : (active ? Number(stats.builtRows) || 0 : Number(stats.totalRows) || 0);
  stats.totalPhases = buildState ? Number(buildState.totalPhases) || 0 : Number(stats.totalPhases) || 0;
  stats.builtPhases = buildState ? Number(buildState.completedPhases) || 0 : Number(stats.builtPhases) || 0;
  stats.lastPhase = phase || stats.lastPhase || '';
  stats.lastChunkMs = Number(chunkMs) || 0;
  stats.maxChunkMs = Math.max(Number(stats.maxChunkMs) || 0, Number(chunkMs) || 0);
  stats.phaseMaxMs = stats.phaseMaxMs || {};
  if (phase) stats.phaseMaxMs[phase] = Math.max(Number(stats.phaseMaxMs[phase]) || 0, Number(chunkMs) || 0);
  if (job && job.startedAt) stats.elapsedMs = Math.max(0, stageLyricNowMs() - job.startedAt);
  if (!active && job && job.startedAt) stats.lastBuildMs = Math.max(0, stageLyricNowMs() - job.startedAt);
  window.__mineradioLyricBuildStats = stats;
}

function finishStageLyricCooperativePrewarm(job) {
  if (!job || stageLyricPrewarm.build !== job) return;
  var startedAt = stageLyricNowMs();
  var mesh = null;
  try {
    mesh = finishCooperativeLyricMeshBuild(job.state);
  } catch (e) {
    cancelStageLyricPrewarmBuildOnly();
    return;
  }
  stageLyricPrewarm.build = null;
  stageLyricPrewarm.workTimer = 0;
  stageLyricPrewarm.workRaf = 0;
  job.lastPhase = 'mesh-finalize';
  if (
    !mesh || job.token !== stageLyricPrewarm.token || !fx || !fx.particleLyrics ||
    !lyricsLines || !lyricsLines.length || stageLyricPrewarmBuildGuardKey() !== job.guardKey
  ) {
    if (mesh) disposeLyricMesh(mesh);
    updateStageLyricBuildStats(job, false, stageLyricNowMs() - startedAt);
    return;
  }
  if (typeof applyLyricPaletteToMesh === 'function') applyLyricPaletteToMesh(mesh);
  var finalKey = stageLyricPreparedKey(job.payload);
  if (!finalKey) {
    disposeLyricMesh(mesh);
    updateStageLyricBuildStats(job, false, stageLyricNowMs() - startedAt);
    return;
  }
  if (stageLyricPrewarm.mesh && stageLyricPrewarm.mesh !== mesh) disposeLyricMesh(stageLyricPrewarm.mesh);
  primeLyricMeshOpacity(mesh, 0);
  mesh.visible = false;
  stageLyricPrewarm.mesh = mesh;
  stageLyricPrewarm.key = finalKey;
  stageLyricPrewarm.lightweight = job.lightweight;
  clearStageLyricWarmup();
  if (!job.lightweight && stageLyricCurrentUsesPersistentTrack()) {
    disposeStageLyricPrewarmMesh();
    ensureStageLyricPersistentTrackRows(stageLyrics.current, stageLyrics.currentIdx, { reason: 'discard-full-track-takeover' });
  } else if (!job.lightweight && stageLyricCurrentUsesLightweightTrack()) {
    upgradeCurrentStageLyricFromPreparedTrack(job.reason || 'full-prewarm-ready');
  }
  updateStageLyricBuildStats(job, false, stageLyricNowMs() - startedAt);
}

function stageLyricShouldYieldToPendingInput() {
  try {
    return !!(
      typeof navigator !== 'undefined' && navigator.scheduling && typeof navigator.scheduling.isInputPending === 'function' &&
      navigator.scheduling.isInputPending({ includeContinuous: true })
    );
  } catch (e) {
    return false;
  }
}

function stageLyricCooperativeNextDelay(job, chunkMs) {
  chunkMs = Math.max(0, Number(chunkMs) || 0);
  if (chunkMs >= 8) return 24;
  if (chunkMs >= 5) return 14;
  if (chunkMs >= 3.5) return 8;
  return job && job.lightweight ? 0 : 6;
}

function scheduleStageLyricCooperativeWork(job, delay) {
  if (!job || stageLyricPrewarm.build !== job) return;
  delay = Math.max(0, Number(delay) || 0);
  function runAfterPaint() {
    stageLyricPrewarm.workTimer = 0;
    if (!job || stageLyricPrewarm.build !== job) return;
    var canFrameAlign = typeof document !== 'undefined' && document.visibilityState === 'visible' && typeof requestAnimationFrame === 'function';
    if (!canFrameAlign) {
      stageLyricPrewarm.workTimer = setTimeout(function () {
        stageLyricPrewarm.workTimer = 0;
        runStageLyricCooperativePrewarm(job);
      }, 12);
      return;
    }
    stageLyricPrewarm.workRaf = requestAnimationFrame(function () {
      stageLyricPrewarm.workRaf = 0;
      if (!job || stageLyricPrewarm.build !== job) return;
      stageLyricPrewarm.workTimer = setTimeout(function () {
        stageLyricPrewarm.workTimer = 0;
        runStageLyricCooperativePrewarm(job);
      }, 0);
    });
  }
  if (delay > 0) stageLyricPrewarm.workTimer = setTimeout(runAfterPaint, delay);
  else runAfterPaint();
}

function runStageLyricCooperativePrewarm(job) {
  stageLyricPrewarm.workTimer = 0;
  if (!job || stageLyricPrewarm.build !== job) return;
  if (
    job.token !== stageLyricPrewarm.token || !fx || !fx.particleLyrics ||
    !lyricsLines || !lyricsLines.length || stageLyricPrewarmBuildGuardKey() !== job.guardKey
  ) {
    cancelStageLyricPrewarmBuildOnly();
    return;
  }
  if (stageLyricShouldYieldToPendingInput()) {
    scheduleStageLyricCooperativeWork(job, 16);
    return;
  }
  if (job.readyToFinish) {
    finishStageLyricCooperativePrewarm(job);
    return;
  }
  var startedAt = stageLyricNowMs();
  var done = false;
  try {
    done = stepCooperativeLyricMeshBuild(job.state, 1, 4.2);
  } catch (e) {
    cancelStageLyricPrewarmBuildOnly();
    return;
  }
  var chunkMs = stageLyricNowMs() - startedAt;
  job.lastPhase = job.state && job.state.lastPhase || '';
  updateStageLyricBuildStats(job, true, chunkMs);
  if (done) {
    job.readyToFinish = true;
    scheduleStageLyricCooperativeWork(job, stageLyricCooperativeNextDelay(job, chunkMs));
    return;
  }
  scheduleStageLyricCooperativeWork(job, stageLyricCooperativeNextDelay(job, chunkMs));
}

function startStageLyricCooperativePrewarm(payload, key, token, lightweight, reason) {
  cancelStageLyricPrewarmBuildOnly();
  var state = beginCooperativeLyricMeshBuild(payload);
  var job = {
    state: state,
    payload: payload,
    key: key,
    guardKey: stageLyricPrewarmBuildGuardKey(),
    token: token,
    lightweight: !!lightweight,
    reason: reason || '',
    startedAt: stageLyricNowMs(),
    lastPhase: 'queued',
    readyToFinish: false
  };
  stageLyricPrewarm.build = job;
  if (typeof window !== 'undefined') {
    window.__mineradioLyricBuildStats = {
      active: true,
      reason: job.reason,
      lightweight: job.lightweight,
      totalRows: Number(state.totalRows) || 0,
      builtRows: 0,
      totalPhases: Number(state.totalPhases) || 0,
      builtPhases: 0,
      lastPhase: 'queued',
      lastChunkMs: 0,
      maxChunkMs: 0,
      phaseMaxMs: {},
      elapsedMs: 0,
      lastBuildMs: 0
    };
  }
  scheduleStageLyricCooperativeWork(job, 0);
}

function scheduleStageLyricPrewarmForIndex(targetIndex, reason, delay) {
  var hasTarget = targetIndex != null && isFinite(Number(targetIndex));
  var prewarmIndex = hasTarget ? Math.round(Number(targetIndex)) : null;
  if (hasTarget && lyricsLines && lyricsLines.length) prewarmIndex = Math.max(0, Math.min(lyricsLines.length - 1, prewarmIndex));
  var lightweight = stageLyricLightPrewarmReason(reason);
  var wait = delay == null ? 90 : Number(delay);
  if (!isFinite(wait)) wait = 90;
  wait = Math.max(0, wait);
  if (lightweight && stageLyricPrewarm.mesh) {
    var guardIndex = prewarmIndex != null ? prewarmIndex : chooseStageLyricPrewarmIndex();
    if (stageLyricPrewarmFullCanServeIndex(guardIndex)) {
      upgradeCurrentStageLyricFromPreparedTrack(reason || 'full-prewarm-before-light');
      return;
    }
  }
  if (!lightweight && stageLyricLightweightPrewarmAwaitingTakeover()) {
    queueStageLyricFullTrackWarmupRetry(reason || 'track-ready', Math.max(96, wait));
    return;
  }
  var dueAt = stageLyricNowMs() + wait;
  if (stageLyricPrewarm.timer && stageLyricPrewarm.targetIndex === prewarmIndex && stageLyricPrewarm.lightweight === lightweight) {
    var existingDueAt = Number(stageLyricPrewarm.dueAt) || 0;
    if (!existingDueAt || dueAt >= existingDueAt - 8) return;
  }
  if (stageLyricPrewarm.build && stageLyricPrewarm.targetIndex === prewarmIndex && stageLyricPrewarm.lightweight === lightweight) return;
  if (stageLyricPrewarm.timer) clearTimeout(stageLyricPrewarm.timer);
  stageLyricPrewarm.timer = 0;
  cancelStageLyricPrewarmBuildOnly();
  stageLyricPrewarm.token += 1;
  stageLyricPrewarm.targetIndex = prewarmIndex;
  stageLyricPrewarm.lightweight = lightweight;
  stageLyricPrewarm.dueAt = dueAt;
  var token = stageLyricPrewarm.token;
  if (!fx || !fx.particleLyrics || !lyricsLines || !lyricsLines.length) {
    disposeStageLyricPrewarmMesh();
    return;
  }
  stageLyricPrewarm.timer = setTimeout(function () {
    stageLyricPrewarm.timer = 0;
    stageLyricPrewarm.dueAt = 0;
    if (token !== stageLyricPrewarm.token) return;
    if (!fx || !fx.particleLyrics || !lyricsLines || !lyricsLines.length) return;
    var idx = prewarmIndex != null ? prewarmIndex : chooseStageLyricPrewarmIndex();
    if (idx < 0) return;
    if (lightweight && stageLyricPrewarm.mesh && stageLyricPrewarmFullCanServeIndex(idx)) {
      upgradeCurrentStageLyricFromPreparedTrack(reason || 'full-prewarm-before-light');
      return;
    }
    var payload = buildStageLyricDisplayPayload(idx, { lightweightTrack: lightweight });
    var key = stageLyricPreparedKey(payload);
    if (!key || stageLyricCurrentMeshAlreadyPreparedForPayload(payload)) {
      if (stageLyricPrewarm.mesh) disposeStageLyricPrewarmMesh();
      return;
    }
    if (stageLyricPrewarm.mesh && stageLyricPrewarm.key !== key) {
      disposeLyricMesh(stageLyricPrewarm.mesh);
      stageLyricPrewarm.mesh = null;
      stageLyricPrewarm.key = '';
    }
    if (stageLyricPrewarm.mesh && stageLyricPrewarm.key === key) return;
    try {
      if (stageLyricShouldBuildCooperatively(payload)) {
        startStageLyricCooperativePrewarm(payload, key, token, lightweight, reason);
        return;
      }
      var mesh = buildLyricMesh(payload);
      primeLyricMeshOpacity(mesh, 0);
      mesh.visible = false;
      stageLyricPrewarm.mesh = mesh;
      stageLyricPrewarm.key = key;
      stageLyricPrewarm.lightweight = lightweight;
      clearStageLyricWarmup();
      if (!lightweight && stageLyricCurrentUsesPersistentTrack()) {
        disposeStageLyricPrewarmMesh();
        ensureStageLyricPersistentTrackRows(stageLyrics.current, stageLyrics.currentIdx, { reason: 'discard-full-track-takeover' });
      } else if (!lightweight && stageLyricCurrentUsesLightweightTrack()) {
        upgradeCurrentStageLyricFromPreparedTrack(reason || 'full-prewarm-ready');
      }
    } catch (e) {
      disposeStageLyricPrewarmMesh();
    }
  }, wait);
}
function scheduleStageLyricPrewarm(reason, delay) {
  var singleLineIndex = stageLyricSingleLineBootstrapIndex();
  scheduleStageLyricPrewarmForIndex(singleLineIndex >= 0 ? singleLineIndex : null, reason, delay);
}
function stageLyricMultiLineWarmupLoad() {
  var mode = normalizeLyricDisplayMode(fx && fx.lyricDisplayMode);
  return mode !== 'single';
}
function stageLyricFullTrackWarmupDelay(delay, reason) {
  var base = Math.max(64, Number(delay) || 180);
  if (!stageLyricMultiLineWarmupLoad()) return base;
  var reasonText = String(reason || '');
  if (/lyrics-ready-preload/i.test(reasonText)) return Math.max(base, 24);
  if (/lightweight-upgrade|track-ready-fast|playback-resume|playback-started|startup-restore/i.test(reasonText)) return Math.max(base, 420);
  if (/track-demand/i.test(reasonText)) return Math.max(base, 260);
  var total = lyricsLines && lyricsLines.length ? lyricsLines.length : 0;
  var mode = normalizeLyricDisplayMode(fx && fx.lyricDisplayMode);
  var lineCount = lyricDisplayLineCountForMode(mode);
  var translationMode = normalizeLyricTranslationMode(fx && fx.lyricTranslationMode);
  var extra = Math.min(1200, total * (translationMode === 'off' ? 3.0 : 4.8));
  return Math.max(base, 760 + extra + lineCount * 38 + (translationMode === 'multi' ? 260 : 0));
}

function queueStageLyricFullTrackWarmupRetry(reason, delay) {
  var retryDelay = clampRange(Number(delay) || 140, 96, 420);
  var targetAt = stageLyricNowMs() + retryDelay;
  if (
    stageLyricFullTrackWarmupTimer && stageLyricFullTrackWarmupTargetAt &&
    targetAt >= stageLyricFullTrackWarmupTargetAt - 8
  ) return true;
  if (stageLyricFullTrackWarmupTimer) clearTimeout(stageLyricFullTrackWarmupTimer);
  stageLyricFullTrackWarmupTargetAt = targetAt;
  stageLyricFullTrackWarmupTimer = setTimeout(function () {
    stageLyricFullTrackWarmupTimer = 0;
    stageLyricFullTrackWarmupTargetAt = 0;
    runStageLyricFullTrackWarmup(reason || 'track-ready');
  }, retryDelay);
  return true;
}

function runStageLyricFullTrackWarmup(reason) {
  if (stageLyricCurrentUsesPersistentTrack()) {
    ensureStageLyricPersistentTrackRows(stageLyrics.current, stageLyrics.currentIdx, { reason: reason || 'persistent-track-warmup' });
    return true;
  }
  if (stageLyricLightweightPrewarmAwaitingTakeover()) {
    queueStageLyricFullTrackWarmupRetry(reason || 'track-ready', 140);
    return false;
  }
  var run = function () {
    if (stageLyricLightweightPrewarmAwaitingTakeover()) {
      queueStageLyricFullTrackWarmupRetry(reason || 'track-ready', 140);
      return;
    }
    scheduleStageLyricPrewarm(reason || 'track-ready', stageLyricMultiLineWarmupLoad() ? 96 : 24);
  };
  if (stageLyricMultiLineWarmupLoad() && window.requestIdleCallback) {
    stageLyricFullTrackWarmupIdle = window.requestIdleCallback(function () {
      stageLyricFullTrackWarmupIdle = 0;
      run();
    }, { timeout: 1500 });
  } else run();
  return true;
}

function scheduleStageLyricFullTrackWarmup(reason, delay) {
  if (stageLyricCurrentUsesPersistentTrack()) {
    ensureStageLyricPersistentTrackRows(stageLyrics.current, stageLyrics.currentIdx, { reason: reason || 'persistent-track-warmup' });
    return true;
  }
  if (stageLyricShouldSkipFullTrackWarmup(reason)) return false;
  if (stageLyricFullTrackWarmupIdle) return true;
  if (stageLyricPrewarm.build && !stageLyricPrewarm.build.lightweight) return true;
  var prepared = stageLyricPrewarmPayload();
  if (prepared && !prepared.trackLightweight) return true;
  var warmupDelay = stageLyricFullTrackWarmupDelay(delay, reason);
  var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  var targetAt = now + warmupDelay;
  if (stageLyricFullTrackWarmupTimer && stageLyricFullTrackWarmupTargetAt && targetAt >= stageLyricFullTrackWarmupTargetAt - 8) return;
  if (stageLyricFullTrackWarmupTimer) clearTimeout(stageLyricFullTrackWarmupTimer);
  stageLyricFullTrackWarmupTargetAt = targetAt;
  stageLyricFullTrackWarmupTimer = setTimeout(function () {
    stageLyricFullTrackWarmupTimer = 0;
    stageLyricFullTrackWarmupTargetAt = 0;
    runStageLyricFullTrackWarmup(reason || 'track-ready');
  }, warmupDelay);
  return true;
}

function showStageLine(text, redrawOnly, options) {
  options = options || {};
  createLyricsParticles();
  if (!stageLyrics.group) return false;
  var payload = normalizeStageLyricPayload(text);
  if (!payload) { clearStageLyrics(); return false; }
  var lineStep = clampRange(Number(stageLyrics.transitionLineStep) || 0, -2, 2);
  var exitDir = lineStep > 0 ? 1 : (lineStep < 0 ? -1 : 0);
  if (!redrawOnly && stageLyrics.current && setLyricTrackTarget(stageLyrics.current, payload)) {
    stageLyrics.currentText = payload.text;
    stageLyrics.currentDisplayKey = payload.key;
    stageLyrics.currentPayload = payload;
    stageLyrics.current.userData.enterDirection = lineStep > 0 ? -1 : (lineStep < 0 ? 1 : 0);
    stageLyrics.current.userData.lastTrackSwitchAt = uniforms && uniforms.uTime ? uniforms.uTime.value : 0;
    return true;
  }
  if (options.noSyncBuild && shouldDeferStageLyricSyncBuild(payload, redrawOnly)) {
    requestStageLyricDemandPrewarm(payload);
    return false;
  }
  var singleLinePayload = stageLyricPayloadIsSingleLine(payload);
  var mesh = takeStageLyricSingleLinePrewarmMesh(payload) || takeStageLyricPrewarmMesh(payload);
  if (!mesh) {
    var singleLineBoundaryNoSyncBuild = options.noSyncBuild && singleLinePayload && !redrawOnly && stageLyrics.current;
    if (singleLineBoundaryNoSyncBuild) {
      requestStageLyricDemandPrewarm(payload);
      return false;
    }
    if (options.noSyncBuild) {
      requestStageLyricDemandPrewarm(payload);
      return false;
    }
    mesh = buildLyricMesh(payload);
  }
  if (!redrawOnly && singleLinePayload && typeof markRenderInteraction === 'function') {
    markRenderInteraction('lyric-swap', 360);
  }
  var outgoingMesh = stageLyrics.current;
  var holdOutgoingForReveal = !redrawOnly && stageLyricShouldHoldOutgoingForReveal(outgoingMesh, mesh);
  releaseStageLyricRevealHoldsForSuccessor(outgoingMesh);
  if (redrawOnly && stageLyrics.current) {
    disposeLyricMesh(stageLyrics.current);
    stageLyrics.current = null;
  } else if (stageLyrics.current) {
    stageLyrics.current.userData.state = 'out';
    stageLyrics.current.userData.age = 0;
    stageLyrics.current.userData.exitDirection = exitDir;
    stageLyrics.current.userData.lyricRevealSuccessor = holdOutgoingForReveal ? mesh : null;
    stageLyrics.outgoing.push(stageLyrics.current);
  }
  stageLyrics.currentText = payload.text;
  stageLyrics.currentDisplayKey = payload.key;
  stageLyrics.currentPayload = payload;
  resetPreparedStageLyricMesh(mesh, payload, lineStep);
  mesh.userData.enterDirection = lineStep > 0 ? -1 : (lineStep < 0 ? 1 : 0);
  if (!redrawOnly) {
    var primeAmount = singleLinePayload ? 0 : (Math.abs(lineStep) > 0 ? 0.34 : 0.24);
    primeLyricMeshOpacity(mesh, primeAmount);
  }
  stageLyrics.group.add(mesh);
  stageLyrics.current = mesh;
  initializeStageLyricPersistentTrack(mesh, payload);
  return true;
}

function refreshCurrentLyricStyle() {
  cancelStageLyricResidentBuild();
  clearStageLyricSingleLinePrewarmCache();
  disposeStageLyricPrewarmMesh();
  if (!stageLyrics || !stageLyrics.currentText || !stageLyrics.current) return;
  var progress = stageLyrics.current.userData ? (stageLyrics.current.userData.lastLyricProgress || 0) : 0;
  stageLyrics.transitionLineStep = 0;
  var redrawPayload = stageLyrics.currentPayload || stageLyrics.currentText;
  if (stageLyrics.currentIdx >= 0 && stageLyricMultiLineWarmupLoad()) {
    redrawPayload = buildStageLyricDisplayPayload(stageLyrics.currentIdx, { lightweightTrack: true }) || redrawPayload;
  }
  showStageLine(redrawPayload, true);
  updateLyricMeshProgress(stageLyrics.current, progress);
  if (stageLyrics.current && stageLyrics.current.userData) stageLyrics.current.userData.age = 0.48;
}

function clearStageLyrics() {
  if (typeof invalidateLyricQualityTextures === 'function') invalidateLyricQualityTextures('clear-stage-lyrics');
  cancelStageLyricResidentBuild();
  clearStageLyricFullTrackWarmup();
  disposeStageLyricPrewarmMesh();
  clearStageLyricSingleLinePrewarmCache();
  clearStageLyricWarmup();
  disposeLyricMesh(stageLyrics.current);
  stageLyrics.current = null;
  stageLyrics.currentIdx = -1;
  stageLyrics.currentText = '';
  stageLyrics.currentDisplayKey = '';
  stageLyrics.currentPayload = null;
  stageLyrics.renderSignature = '';
  stageLyrics.transitionLineStep = 0;
  while (stageLyrics.outgoing.length) disposeLyricMesh(stageLyrics.outgoing.pop());
}

function stageLyricUsesSingleLineSwap(mesh) {
  if (!mesh || !mesh.userData) return false;
  var data = mesh.userData.lyric || {};
  var payload = mesh.userData.payload || null;
  var mode = normalizeLyricDisplayMode(data.displayMode || (payload && payload.mode) || (fx && fx.lyricDisplayMode));
  return mode === 'single' && !data.usesTrack;
}

function updateStageLyrics3D(dt) {
  if (!stageLyrics.group) return;
  if (!fx.particleLyrics && !stageLyrics.current && (!stageLyrics.outgoing || !stageLyrics.outgoing.length)) return;
  resetLyricRenderUploadFrameBudget(true);
  if (!isFinite(stageLyrics.highBloom)) stageLyrics.highBloom = 0;
  if (!isFinite(stageLyrics.beatGlow)) stageLyrics.beatGlow = 0;
  if (!isFinite(stageLyrics.glowFollowX)) stageLyrics.glowFollowX = 0;
  if (!isFinite(stageLyrics.glowFollowY)) stageLyrics.glowFollowY = 0;
  if (!isFinite(stageLyrics.glowFollowRoll)) stageLyrics.glowFollowRoll = 0;
  var t = uniforms.uTime.value;
  var lyricMotion = lyricMotionProfile();
  var previewMotionLock = stageLyricProgressPreviewActive();
  var verticalFloatOn = !previewMotionLock && lyricVerticalFloatEnabled();
  var lyricFloatAmp = verticalFloatOn ? (lyricMotion.floatAmp || 1) : 0;
  var lyricGlowStrength = fx.lyricGlow ? Math.min(0.85, Math.max(0, fx.lyricGlowStrength)) : 0;
  var glowDrive = Math.min(1.7, Math.max(0, lyricGlowStrength / 0.50));
  var glowBreath = lyricGlowStrength > 0 ? (0.5 + 0.5 * Math.sin(t * 1.05)) : 0;
  var musicBloom = Math.max(lyricSunEnergy, beatPulse * 0.10);
  var beatGlowRaw = fx.lyricGlowBeat && lyricGlowStrength > 0
    ? Math.max(beatPulse * 1.22, beatCam.punch * 0.86 + beatCam.radiusKick * 1.85)
    : 0;
  stageLyrics.beatGlow += (beatGlowRaw - stageLyrics.beatGlow) * (beatGlowRaw > stageLyrics.beatGlow ? 0.32 : 0.10);
  if (!isFinite(stageLyrics.beatGlow)) stageLyrics.beatGlow = 0;
  var skullLyricPreset = !!(fx && fx.preset === SKULL_PRESET_INDEX);
  var sonicLyricPreset = !!(typeof SONIC_PRESET_INDEX !== 'undefined' && fx && fx.preset === SONIC_PRESET_INDEX);
  var solarBloom = lyricGlowStrength > 0 ? (0.18 + glowBreath * 0.16 + musicBloom * 0.90 + stageLyrics.beatGlow * 1.18 + Math.sin(t * 0.37 + 1.2) * 0.035) * glowDrive : 0;
  if (skullLyricPreset && lyricGlowStrength > 0) {
    solarBloom = (0.035 + glowBreath * 0.030 + musicBloom * 0.11 + Math.pow(Math.max(0, stageLyrics.beatGlow), 1.26) * 1.45 + Math.pow(Math.max(0, skullBeatFlash || 0), 1.08) * 1.18) * glowDrive;
  }
  solarBloom = Math.max(0, Math.min(1.45, solarBloom));
  stageLyrics.highBloom += (solarBloom - stageLyrics.highBloom) * (solarBloom > stageLyrics.highBloom ? (skullLyricPreset ? 0.22 : 0.075) : (skullLyricPreset ? 0.070 : 0.050));
  if (!isFinite(stageLyrics.highBloom)) stageLyrics.highBloom = 0;
  updateLyricStarRiver(dt);
  var followDrive = fx.lyricGlowBeat && lyricGlowStrength > 0 ? Math.min(1.35, stageLyrics.beatGlow) : 0;
  var followXTarget = followDrive * (beatCam.thetaKick * 34 + beatCam.rollKick * 8);
  var followYTarget = followDrive * (beatCam.phiKick * 42 - beatCam.radiusKick * 0.48);
  var followRollTarget = followDrive * (beatCam.rollKick * 22 + beatCam.thetaKick * 10);
  stageLyrics.glowFollowX += (followXTarget - stageLyrics.glowFollowX) * 0.26;
  stageLyrics.glowFollowY += (followYTarget - stageLyrics.glowFollowY) * 0.24;
  stageLyrics.glowFollowRoll += (followRollTarget - stageLyrics.glowFollowRoll) * 0.22;
  stageLyrics.glowFollowX *= 0.92;
  stageLyrics.glowFollowY *= 0.92;
  stageLyrics.glowFollowRoll *= 0.90;
  var layoutScale = clampRange(Number(fx.lyricScale) || 1, 0.35, 1.65);
  var layoutX = clampRange(Number(fx.lyricOffsetX) || 0, -4.0, 4.0);
  var layoutY = clampRange(Number(fx.lyricOffsetY) || 0, -2.4, 2.7);
  var layoutZ = clampRange(Number(fx.lyricOffsetZ) || 0, -3.2, 3.2);
  var layoutTiltX = clampRange(Number(fx.lyricTiltX) || 0, -84, 84);
  var layoutTiltY = clampRange(Number(fx.lyricTiltY) || 0, -84, 84);
  var skullMouthLyrics = !!(camera && fx && fx.preset === SKULL_PRESET_INDEX && skullParticleGroup && skullParticleGroup.visible);
  var shelfDetailOpen = !!(shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent());
  var skullShelfDetailOpen = !!(fx && fx.preset === SKULL_PRESET_INDEX && shelfDetailOpen);
  var normalShelfDetailOpen = !!(shelfDetailOpen && !skullShelfDetailOpen);
  var multiLayerLyricsActive = normalizeLyricDisplayMode(fx && fx.lyricDisplayMode) !== 'single' || normalizeLyricTranslationMode(fx && fx.lyricTranslationMode) !== 'off';
  var stageLyricRenderBase = shelfDetailOpen ? 24 : 260;
  stageLyrics.group.renderOrder = stageLyricRenderBase;
  var shelfDetailLyricProfile = shelfDetailOpen ? {
    opacity: skullShelfDetailOpen ? 0.30 : 0.38,
    readability: skullShelfDetailOpen ? 0.20 : 0.26,
    bloom: skullShelfDetailOpen ? 0.20 : 0.24,
    glowCap: skullShelfDetailOpen ? 0.050 : 0.070,
    outgoing: skullShelfDetailOpen ? 0.34 : 0.42,
    easeDown: 0.34
  } : {
    opacity: 0.96,
    readability: 0.86,
    bloom: 1,
    glowCap: 1.0,
    outgoing: 1,
    easeDown: 0.16
  };
  var shelfLyricAvoid = shouldAvoidStageLyricsForShelf();
  var wallpaperLyricLock = shouldUseWallpaperLyricCameraLock();
  var wallpaperShelfLyrics = wallpaperLyricLock && shouldDimWallpaperForShelf();
  if (wallpaperLyricLock) {
    layoutScale *= wallpaperShelfLyrics ? 0.60 : 0.84;
    layoutX = clampRange(layoutX + (wallpaperShelfLyrics ? -1.34 : 0), -4.0, 4.0);
    layoutY = clampRange(layoutY + (wallpaperShelfLyrics ? -0.04 : 0.08), -2.4, 2.7);
    layoutZ = clampRange(layoutZ + (wallpaperShelfLyrics ? 1.02 : 1.15), -3.2, 3.2);
  } else if (!skullMouthLyrics && shelfLyricAvoid && fx.lyricCameraLock) {
    layoutScale *= 0.72;
    layoutX = clampRange(layoutX - 1.36, -4.0, 4.0);
    layoutY = clampRange(layoutY + 0.06, -2.4, 2.7);
    layoutZ = clampRange(layoutZ + 0.72, -3.2, 3.2);
  } else if (!skullMouthLyrics && shouldOffsetLyricsForShelfDetail()) {
    layoutScale *= normalShelfDetailOpen ? 0.56 : 0.70;
    layoutX = clampRange(layoutX - (normalShelfDetailOpen ? 1.78 : 1.58), -4.0, 4.0);
    layoutY = clampRange(layoutY + (normalShelfDetailOpen ? 0.18 : 0.08), -2.4, 2.7);
    layoutZ = clampRange(layoutZ + 0.84, -3.2, 3.2);
  }
  if (skullMouthLyrics) {
    layoutScale *= skullShelfDetailOpen ? 0.52 : (shelfLyricAvoid ? 0.58 : 0.66);
    if (shelfLyricAvoid && !skullShelfDetailOpen) {
      layoutX = clampRange(layoutX - 0.36, -4.0, 4.0);
      layoutY = clampRange(layoutY + 0.02, -2.4, 2.7);
      layoutZ = clampRange(layoutZ + 0.18, -3.2, 3.2);
    }
  }
  if (sonicLyricPreset && !fx.lyricCameraLock && !wallpaperLyricLock && !skullMouthLyrics) {
    layoutY = clampRange(layoutY - 0.34, -2.4, 2.7);
    layoutZ = clampRange(layoutZ + 0.16, -3.2, 3.2);
  }
  var lockBaseDistance = wallpaperShelfLyrics ? 5.58 : 4.85;
  var lockDistance = lockBaseDistance + layoutZ;
  var cameraLockedLyrics = (fx.lyricCameraLock || wallpaperLyricLock) && camera;
  var skullLyricEdgeGuard = !!(fx && fx.preset === SKULL_PRESET_INDEX && (orbit.centerLocked || orbit.recentering));
  var lockFit = (cameraLockedLyrics || skullLyricEdgeGuard || skullMouthLyrics) ? lyricCameraLockFit(layoutScale, layoutX, layoutY, skullMouthLyrics ? Math.max(2.2, 4.4 + layoutZ) : lockDistance) : 1;
  if (skullMouthLyrics) lockFit = Math.min(lockFit, 1.12);
  if (!isFinite(stageLyrics.lockFitScale)) stageLyrics.lockFitScale = 1;
  stageLyrics.lockFitScale += (lockFit - stageLyrics.lockFitScale) * (lockFit < stageLyrics.lockFitScale ? 0.18 : 0.10);
  stageLyrics.group.scale.setScalar(layoutScale * stageLyrics.lockFitScale);
  if (skullMouthLyrics) {
    stageLyrics.snapCameraLockFrames = 0;
    skullParticleGroup.updateMatrixWorld(true);
    skullLyricMouthTarget.copy(skullLyricMouthLocal).applyMatrix4(skullParticleGroup.matrixWorld);
    skullParticleGroup.getWorldQuaternion(skullLyricMouthQuat);
    skullLyricMouthForward.set(0, 0, 1).applyQuaternion(skullLyricMouthQuat);
    skullLyricMouthTarget.addScaledVector(skullLyricMouthForward, 0.020);
    skullLyricReadableQuat.copy(skullLyricMouthQuat);
    setStageLyricViewBasisFromCameraOrQuaternion(skullLyricMouthQuat);
    lyricLayoutTarget.copy(skullLyricMouthTarget);
    applyStageLyricLayoutOffset(lyricLayoutTarget, layoutX, layoutY, layoutZ);
    stageLyricTargetQuaternion(skullLyricReadableQuat, layoutTiltX, layoutTiltY);
    stageLyrics.group.userData = stageLyrics.group.userData || {};
    if (!stageLyrics.group.userData.skullMouthLocked) {
      stageLyrics.group.position.copy(lyricLayoutTarget);
      stageLyrics.group.quaternion.copy(lyricTargetQuat);
      stageLyrics.group.userData.skullMouthLocked = true;
    } else {
      stageLyrics.group.position.lerp(lyricLayoutTarget, 0.26);
      stageLyrics.group.quaternion.slerp(lyricTargetQuat, 0.30);
    }
  } else if (cameraLockedLyrics) {
    if (stageLyrics.group.userData) stageLyrics.group.userData.skullMouthLocked = false;
    setStageLyricViewBasisFromCameraOrQuaternion(null);
    lyricLayoutBase.copy(camera.position).addScaledVector(lyricCameraDir, lockBaseDistance);
    lyricCameraTarget.copy(lyricLayoutBase);
    applyStageLyricLayoutOffset(lyricCameraTarget, layoutX, layoutY, layoutZ);
    stageLyricTargetQuaternion(camera.quaternion, layoutTiltX, layoutTiltY);
    if (stageLyrics.snapCameraLockFrames > 0) {
      stageLyrics.group.position.copy(lyricCameraTarget);
      stageLyrics.group.quaternion.copy(lyricTargetQuat);
      if (stageLyrics.snapCameraLockFrames > 0) stageLyrics.snapCameraLockFrames -= 1;
    } else {
      var lockPosEase = wallpaperLyricLock ? (wallpaperShelfLyrics ? 0.42 : 0.34) : 0.24;
      var lockQuatEase = wallpaperLyricLock ? (wallpaperShelfLyrics ? 0.44 : 0.36) : 0.22;
      stageLyrics.group.position.lerp(lyricCameraTarget, lockPosEase);
      stageLyrics.group.quaternion.slerp(lyricTargetQuat, lockQuatEase);
    }
  } else {
    if (stageLyrics.group.userData) stageLyrics.group.userData.skullMouthLocked = false;
    stageLyrics.snapCameraLockFrames = 0;
    if (particles) {
      particles.updateMatrixWorld(true);
      particles.getWorldPosition(lyricCoverWorldPos);
      particles.getWorldQuaternion(lyricCoverWorldQuat);
    } else {
      lyricCoverWorldPos.set(0, 0, 0);
      lyricCoverWorldQuat.identity();
    }
    setStageLyricViewBasisFromCameraOrQuaternion(lyricCoverWorldQuat);
    lyricLayoutBase.copy(lyricCoverWorldPos);
    lyricLayoutTarget.copy(lyricLayoutBase);
    applyStageLyricLayoutOffset(lyricLayoutTarget, layoutX, layoutY, layoutZ);
    stageLyrics.group.position.copy(lyricLayoutTarget);
    stageLyricTargetQuaternion(lyricCoverWorldQuat, layoutTiltX, layoutTiltY);
    stageLyrics.group.quaternion.copy(lyricTargetQuat);
  }
  function tickMesh(mesh, isCurrent) {
    if (!mesh) return false;
    var holdingForLyricReveal = false;
    if (!isCurrent && mesh.userData && mesh.userData.lyricRevealSuccessor) {
      var revealSuccessor = mesh.userData.lyricRevealSuccessor;
      if (stageLyrics.current !== revealSuccessor || !revealSuccessor.parent || stageLyricTrackRevealReady(revealSuccessor)) {
        mesh.userData.lyricRevealSuccessor = null;
        mesh.userData.age = 0;
      } else {
        holdingForLyricReveal = true;
        mesh.userData.age = 0;
      }
    }
    if (!holdingForLyricReveal) mesh.userData.age += dt;
    var a = Math.min(1, mesh.userData.age / (isCurrent ? lyricMotion.enter : lyricMotion.exit));
    a = a * a * (3 - 2 * a);
    var data = mesh.userData.lyric || {};
    if (previewMotionLock) {
      if (!mesh.userData.progressPreviewMotionLocked) {
        mesh.userData.progressPreviewHoldX = Number(mesh.position.x) || 0;
        mesh.userData.progressPreviewHoldY = Number(mesh.position.y) || 0;
        mesh.userData.progressPreviewHoldZ = Number(mesh.position.z) || 0;
        mesh.userData.progressPreviewHoldScale = Number(mesh.scale.x) || 1;
        mesh.userData.progressPreviewHoldRotationZ = Number(mesh.rotation.z) || 0;
        mesh.userData.progressPreviewMotionLocked = true;
      }
      mesh.userData.progressPreviewMotionBlend = 0;
    } else {
      if (mesh.userData.progressPreviewMotionLocked) {
        mesh.userData.progressPreviewMotionLocked = false;
        mesh.userData.progressPreviewMotionBlend = 0;
      }
      if (isFinite(Number(mesh.userData.progressPreviewMotionBlend)) && Number(mesh.userData.progressPreviewMotionBlend) < 1) {
        mesh.userData.progressPreviewMotionBlend = Math.min(1, Number(mesh.userData.progressPreviewMotionBlend) + dt / 0.32);
      } else {
        mesh.userData.progressPreviewMotionBlend = 1;
      }
    }
    var previewMotionBlend = previewMotionLock ? 0 : clampRange(Number(mesh.userData.progressPreviewMotionBlend), 0, 1);
    if (isCurrent && data.trackPersistent && data.trackPendingPayload && stageLyricPersistentTargetRowsReady(mesh, data.trackPendingPayload.trackIndex)) {
      commitStageLyricPersistentPendingTarget(mesh);
    }
    var lineStepWorld = clampRange(Number(data.lineWorldStep) || lyricMotion.slide, 0.20, 0.94);
    var singleLineSwap = stageLyricUsesSingleLineSwap(mesh);
    var style = mesh.userData.motionStyle || lyricMotion.style;
    var seed = mesh.userData.floatSeed || 0;
    var glitchAmount = !previewMotionLock && style === 'glitch' ? clampRange(Number(lyricMotion.glitch) || 0, 0, 1.5) : 0;
    var glitchSlice = style === 'glitch' ? clampRange(Number(lyricMotion.glitchSlice) || 0, 0, 1.4) : 0;
    var glitchRate = style === 'glitch' ? clampRange(Number(lyricMotion.glitchRate) || 1, 0.45, 2.2) : 1;
    var glitchJitter = style === 'glitch' ? clampRange(Number(lyricMotion.glitchJitter) || 0, 0, 1.8) : 0;
    var glitchCameraDrive = 0;
    var glitchPulse = 0;
    if (glitchAmount > 0) {
      var beatShake = clampRange(Math.abs(beatCam.rollKick) * 1.5 + Math.abs(beatCam.thetaKick) * 0.8 + Math.abs(beatCam.radiusKick) * 1.25 + beatCam.punch * 1.05, 0, 1.35);
      var rawBeatDrive = clampRange(Math.max(beatPulse * 1.12, stageLyrics.beatGlow * 0.86, beatShake) * (0.86 + clampRange(Number(fx && fx.cinemaShake) || 0, 0, 1.8) * 0.10), 0, 1.55);
      var beatFollowDrive = lyricMotion.glitchCameraBind ? rawBeatDrive : 0;
      var rhythmGate = lyricMotion.glitchCameraBind ? clampRange((beatFollowDrive - 0.14) / 0.58, 0, 1) : 1;
      glitchCameraDrive = beatFollowDrive;
      if (!isFinite(mesh.userData.glitchNextAt) || mesh.userData.glitchNextAt <= 0) {
        mesh.userData.glitchNextAt = t + (0.09 + Math.random() * 0.34) / (0.62 + glitchRate * 0.42);
      }
      if (lyricMotion.glitchCameraBind && beatFollowDrive > 0.22 && t - (mesh.userData.glitchLastBeatAt || -10) > 0.055) {
        mesh.userData.glitchBurst = Math.max(mesh.userData.glitchBurst || 0, beatFollowDrive * rhythmGate * (0.52 + glitchJitter * 0.18 + Math.random() * 0.58));
        mesh.userData.glitchHold = Math.max(mesh.userData.glitchHold || 0, (0.014 + Math.random() * 0.060) * (0.75 + glitchJitter * 0.20));
        mesh.userData.glitchSeed = Math.random() * 997;
        mesh.userData.glitchLastBeatAt = t;
        mesh.userData.glitchNextAt = Math.min(mesh.userData.glitchNextAt, t + (0.055 + Math.random() * 0.16));
      }
      if (t >= mesh.userData.glitchNextAt) {
        if (!lyricMotion.glitchCameraBind || beatFollowDrive > 0.30) {
          var randomBurst = 0.12 + Math.pow(Math.random(), 0.52) * (lyricMotion.glitchCameraBind ? 0.48 : 0.66);
          randomBurst *= lyricMotion.glitchCameraBind ? rhythmGate : 1;
          mesh.userData.glitchBurst = Math.max(mesh.userData.glitchBurst || 0, randomBurst);
          mesh.userData.glitchHold = Math.max(mesh.userData.glitchHold || 0, (0.010 + Math.random() * 0.076) * (0.80 + glitchJitter * 0.18));
          mesh.userData.glitchSeed = Math.random() * 997;
        }
        mesh.userData.glitchNextAt = t + (lyricMotion.glitchCameraBind ? (0.14 + Math.random() * 0.55) : (0.075 + Math.random() * 0.52)) / (0.58 + glitchRate * 0.46);
      }
      mesh.userData.glitchHold = Math.max(0, (mesh.userData.glitchHold || 0) - dt);
      var decay = mesh.userData.glitchHold > 0 ? Math.pow(0.22, dt) : Math.pow(0.018, dt);
      mesh.userData.glitchBurst = Math.max(0, (mesh.userData.glitchBurst || 0) * decay);
      glitchPulse = clampRange(((mesh.userData.glitchBurst || 0) * rhythmGate + beatFollowDrive * (0.16 + glitchJitter * 0.045)) * glitchAmount, 0, 1.95);
    }
    if (data.textMat && data.textMat.uniforms) {
      if (data.textMat.uniforms.uGlitchBurst) data.textMat.uniforms.uGlitchBurst.value = glitchPulse;
      if (data.textMat.uniforms.uGlitchSeed) data.textMat.uniforms.uGlitchSeed.value = mesh.userData.glitchSeed || seed || 0;
    }
    var glitchJitterSeed = mesh.userData.glitchSeed || seed;
    var jitterScale = 0.50 + glitchJitter * 0.62;
    var textJitterX = glitchPulse ? Math.sin(t * (61.0 + glitchRate * 26.0) + glitchJitterSeed) * (0.011 + glitchSlice * 0.023) * (0.65 + glitchPulse * 0.55) * jitterScale : 0;
    var textJitterY = glitchPulse ? Math.cos(t * (37.0 + glitchRate * 15.0) + glitchJitterSeed * 1.7) * (0.003 + glitchSlice * 0.005) * (0.55 + glitchPulse * 0.45) * jitterScale : 0;
    var shownProgress = mesh.userData.shownLyricProgress || 0;
    if (isCurrent && data.textMat && data.textMat.uniforms && data.textMat.uniforms.uProgress) {
      var targetProgress = clampRange(Number(mesh.userData.targetLyricProgress) || 0, 0, 1);
      shownProgress = clampRange(Number(data.textMat.uniforms.uProgress.value) || 0, 0, 1);
      if (mesh.userData.nativeKaraokeProgress) {
        shownProgress = targetProgress;
      } else {
        var progressDiff = targetProgress - shownProgress;
        var progressEase = Math.abs(progressDiff) > 0.42 ? Math.max(0.52, lyricMotion.progressEase * 1.55) : lyricMotion.progressEase;
        if (mesh.userData.age < 0.16) progressEase = Math.max(progressEase, 0.28);
        shownProgress = clampRange(shownProgress + progressDiff * progressEase, 0, 1);
      }
      data.textMat.uniforms.uProgress.value = shownProgress;
      mesh.userData.shownLyricProgress = shownProgress;
    }
    var followMix = isCurrent ? 1.0 : 0.64;
    var glowX = stageLyrics.glowFollowX * followMix;
    var glowY = stageLyrics.glowFollowY * followMix;
    var glowRoll = stageLyrics.glowFollowRoll * followMix;
    if (data.textMesh) {
      data.textMesh.position.x += (textJitterX - data.textMesh.position.x) * (glitchPulse ? 0.74 : 0.22);
      data.textMesh.position.y += (textJitterY - data.textMesh.position.y) * (glitchPulse ? 0.74 : 0.22);
    }
    if (data.readability) {
      data.readability.position.x += (textJitterX * 0.46 - data.readability.position.x) * (glitchPulse ? 0.58 : 0.18);
      data.readability.position.y += (textJitterY * 0.40 - data.readability.position.y) * (glitchPulse ? 0.58 : 0.18);
    }
    if (data.context) {
      data.context.position.x += (textJitterX * 0.28 - data.context.position.x) * (glitchPulse ? 0.44 : 0.12);
    }
    if (data.glow) {
      var glowFollowX = data.glowFrameLocked ? 0.045 : 0.14;
      var glowFollowY = data.glowFrameLocked ? 0.040 : 0.12;
      data.glow.visible = !data.suppressStaticGlow;
      if (!data.suppressStaticGlow) {
        data.glow.position.set(glowX * glowFollowX + textJitterX * 0.32, glowY * glowFollowY + textJitterY * 0.36, -0.006);
        data.glow.rotation.z = glowRoll * 0.30;
      }
    }
    if (data.sun) {
      data.sun.visible = !data.suppressStaticGlow;
      if (!data.suppressStaticGlow) {
        data.sun.position.set(glowX * 0.42, 0.02 + glowY * 0.34, -0.035);
        data.sun.rotation.z = glowRoll * 0.36;
      }
    }
    if (data.sparks) {
      data.sparks.position.set(glowX * 0.24, glowY * 0.22, 0.010);
      data.sparks.rotation.z = glowRoll * 0.22;
    }
    var opacity = 0;
    if (isCurrent) {
      var shelfDetailLyricDim = shelfDetailLyricProfile.bloom;
      var lyricOpacityTarget = shelfDetailLyricProfile.opacity;
      if (!isFinite(Number(data.globalOpacity))) data.globalOpacity = data.textMat && data.textMat.uniforms && data.textMat.uniforms.uOpacity ? Number(data.textMat.uniforms.uOpacity.value) || 0 : 0;
      var currentOpacity = data.globalOpacity;
      var opacityEase = shelfDetailOpen && currentOpacity > lyricOpacityTarget ? shelfDetailLyricProfile.easeDown : 0.16;
      opacity = clampRange(currentOpacity + (lyricOpacityTarget - currentOpacity) * opacityEase, 0, 1);
      data.globalOpacity = opacity;
      if (data.textMat) data.textMat.uniforms.uOpacity.value = opacity;
      if (data.readabilityMat) {
        var readabilityTarget = opacity * shelfDetailLyricProfile.readability;
        var readabilityEase = shelfDetailOpen && data.readabilityMat.opacity > readabilityTarget ? 0.28 : 0.16;
        data.readabilityMat.opacity += (readabilityTarget - data.readabilityMat.opacity) * readabilityEase;
      }
      var contextIntro = clampRange((mesh.userData.age - 0.04) / 0.48, 0, 1);
      contextIntro = contextIntro * contextIntro * (3 - 2 * contextIntro);
      if (data.contextMat) {
        var contextTarget = opacity * shelfDetailLyricProfile.readability * clampRange(0.74 + lyricContextOpacityValue() * 0.24, 0.78, 0.98) * contextIntro;
        data.contextMat.opacity += (contextTarget - data.contextMat.opacity) * (contextTarget > data.contextMat.opacity ? 0.11 : 0.075);
        if (data.context) {
          data.context.userData = data.context.userData || {};
          if (previewMotionLock) {
            if (!data.context.userData.progressPreviewMotionLocked) {
              data.context.userData.progressPreviewHoldY = Number(data.context.position.y) || 0;
              data.context.userData.progressPreviewHoldScale = Number(data.context.scale.x) || 1;
              data.context.userData.progressPreviewMotionLocked = true;
            }
            data.context.position.y = data.context.userData.progressPreviewHoldY;
            data.context.scale.setScalar(data.context.userData.progressPreviewHoldScale);
          } else {
            data.context.userData.progressPreviewMotionLocked = false;
            var contextY = ((0.5 - shownProgress) * lyricMotion.contextDrift + (style === 'float' && verticalFloatOn ? Math.sin(t * 0.84 + seed) * 0.016 : 0)) * previewMotionBlend + (mesh.userData.enterDirection || 0) * (1 - a) * lineStepWorld * 0.12;
            var contextScale = 1.0 + (verticalFloatOn ? Math.sin(t * 0.72 + seed) * (style === 'float' ? 0.014 : (style === 'smooth' ? 0.002 : 0.005)) * previewMotionBlend : 0);
            data.context.position.y += (contextY - data.context.position.y) * 0.11;
            data.context.scale.setScalar(previewMotionBlend < 1 ? data.context.scale.x + (contextScale - data.context.scale.x) * 0.06 : contextScale);
          }
        }
      }
      var solar = stageLyrics.highBloom * shelfDetailLyricDim;
      var lyricBeatGlow = fx.lyricGlowBeat ? stageLyrics.beatGlow : 0;
      var currentLineGlow = lyricGlowStrength > 0
        ? Math.min(shelfDetailLyricProfile.glowCap * 1.05, (0.10 + solar * 0.40 + lyricBeatGlow * 0.24 * shelfDetailLyricDim + beatPulse * 0.08) * Math.min(2.4, glowDrive) * (lyricMotion.glowLift || 1))
        : 0;
      updateLyricRowLayers(data, {
        opacity: opacity,
        readability: shelfDetailLyricProfile.readability,
        contextIntro: contextIntro,
        shownProgress: shownProgress,
        contextDrift: lyricMotion.contextDrift + Math.abs(lineStepWorld) * 0.030,
        style: style,
        time: t,
        seed: seed,
        jitterX: textJitterX,
        jitterY: textJitterY,
        glitchPulse: glitchPulse,
        targetIndex: data.trackTargetIndex,
        targetLineIndex: data.trackTargetLineIndex,
        targetVirtualIndex: data.trackTargetVirtualIndex,
        rowGlow: currentLineGlow,
        rowGlowBeat: lyricBeatGlow,
        renderBase: stageLyricRenderBase,
        qualityRootPriority: isCurrent ? 0 : 1000,
        deltaTime: dt,
        previewMotionLock: previewMotionLock,
        motionBlend: previewMotionBlend,
        ease: contextIntro < 0.98 ? 0.19 : 0.135
      });
      if (data.textMat && data.textMat.uniforms.uSolar) {
        var solarTarget = stageLyrics.highBloom * shelfDetailLyricDim;
        var solarEase = shelfDetailOpen && data.textMat.uniforms.uSolar.value > solarTarget ? 0.26 : 0.12;
        data.textMat.uniforms.uSolar.value += (solarTarget - data.textMat.uniforms.uSolar.value) * solarEase;
      }
      solar = stageLyrics.highBloom * shelfDetailLyricDim;
      var warmth = Math.max(0, Math.min(1, solar * 1.10));
      if (data.glowMat) {
        var glowTarget = lyricGlowStrength > 0 ? Math.min(shelfDetailLyricProfile.glowCap, (0.075 + solar * 0.34 + stageLyrics.beatGlow * 0.16 * shelfDetailLyricDim) * Math.min(3.0, glowDrive) * (lyricMotion.glowLift || 1)) : 0;
        if (data.suppressStaticGlow) glowTarget = 0;
        data.glowMat.opacity += (glowTarget - data.glowMat.opacity) * (glowTarget > data.glowMat.opacity ? 0.095 : (shelfDetailOpen ? 0.20 : 0.055));
        data.glowMat.color.copy(lyricStageGlowThreeColor(stageLyrics.palette, '#9cffdf', 0.36)).lerp(lyricSunHotColor, warmth);
      }
      if (data.sparkMat) {
        var sparkTarget = lyricGlowStrength > 0 && fx.lyricGlowParticles && !shelfDetailOpen ? Math.min(0.42, (0.10 + solar * 0.14 + stageLyrics.beatGlow * 0.10) * Math.min(1.6, glowDrive)) : 0;
        var sparkOpacity = getLyricSparkOpacity(data);
        sparkOpacity += (sparkTarget - sparkOpacity) * (sparkTarget > sparkOpacity ? 0.13 : (shelfDetailOpen ? 0.22 : 0.075));
        setLyricSparkOpacity(data, sparkOpacity);
        var sparkSizeTarget = fx.lyricGlowParticles && !shelfDetailOpen ? (0.050 + solar * 0.016 + stageLyrics.beatGlow * 0.026 + bass * 0.008) : 0.035;
        setLyricSparkSize(data, getLyricSparkSize(data) + (sparkSizeTarget - getLyricSparkSize(data)) * 0.12);
        var sparkColor = lyricSunHotColor.clone().lerp(lyricSunColor, 0.22 + solar * 0.18);
        setLyricSparkColor(data, sparkColor);
      }
      if (data.sunMat) {
        var sunTarget = lyricGlowStrength > 0 && !shelfDetailOpen ? Math.min(0.88, (Math.pow(Math.min(1.35, solar), 1.08) * 0.28 + stageLyrics.beatGlow * 0.20) * Math.min(2.4, glowDrive) * (style === 'shine' ? 1.18 : 1)) : 0;
        if (data.suppressStaticGlow) sunTarget = 0;
        data.sunMat.opacity += (sunTarget - data.sunMat.opacity) * (shelfDetailOpen ? 0.18 : 0.055);
        data.sunMat.color.copy(lyricSunColor).lerp(lyricSunHotColor, solar * 0.55);
      }
      if (data.sun) {
        var sunPulse = solar;
        var beatScale = fx.lyricGlowBeat ? stageLyrics.beatGlow * 0.24 : 0;
        data.sun.scale.set(0.82 + sunPulse * 0.36 + beatScale + Math.sin(t * 1.6) * sunPulse * 0.018, 0.60 + sunPulse * 0.34 + beatScale * 0.72 + Math.cos(t * 1.25) * sunPulse * 0.020, 1);
        data.sun.rotation.z += Math.sin(t * 0.32 + seed) * 0.010 * sunPulse;
      }
      var breathe = (Math.sin(t * 0.92 + seed) * 0.050 + Math.sin(t * 0.41 + seed * 0.7) * 0.028) * lyricFloatAmp * previewMotionBlend;
      if (previewMotionLock) {
        mesh.position.set(
          Number(mesh.userData.progressPreviewHoldX) || 0,
          Number(mesh.userData.progressPreviewHoldY) || 0,
          Number(mesh.userData.progressPreviewHoldZ) || 0
        );
        mesh.scale.setScalar(Number(mesh.userData.progressPreviewHoldScale) || 1);
        mesh.rotation.z = Number(mesh.userData.progressPreviewHoldRotationZ) || 0;
      } else if (skullMouthLyrics) {
        var mouthMeshY = -0.070 + (Math.sin(t * 0.50 + seed) * 0.018 + Math.sin(t * 1.12 + seed) * 0.006) * previewMotionBlend;
        var mouthMeshZ = 0.018 + Math.cos(t * 0.46 + seed) * 0.007 * previewMotionBlend;
        var mouthMeshScale = 1.08 + a * 0.040 + breathe * 0.12 + bass * 0.024 + beatPulse * 0.014;
        if (!mesh.userData.skullMouthMeshLocked) {
          mesh.position.set(0, mouthMeshY, mouthMeshZ);
          mesh.userData.skullMouthMeshLocked = true;
        } else {
          mesh.position.x += (0 - mesh.position.x) * 0.18;
          mesh.position.y += (mouthMeshY - mesh.position.y) * 0.16;
          mesh.position.z += (mouthMeshZ - mesh.position.z) * 0.18;
        }
        mesh.scale.setScalar(previewMotionBlend < 1 ? mesh.scale.x + (mouthMeshScale - mesh.scale.x) * 0.06 : mouthMeshScale);
        var mouthRotationTarget = (Math.sin(t * 0.30 + seed) * 0.010 + textJitterX * 0.20 + glitchCameraDrive * glitchAmount * 0.012) * previewMotionBlend;
        mesh.rotation.z = previewMotionBlend < 1 ? mesh.rotation.z + (mouthRotationTarget - mesh.rotation.z) * 0.18 : mouthRotationTarget;
      } else {
        mesh.userData.skullMouthMeshLocked = false;
        var rootScaleTarget = 0.96 + a * 0.055 + breathe + bass * 0.038 + beatPulse * 0.014;
        mesh.scale.setScalar(previewMotionBlend < 1 ? mesh.scale.x + (rootScaleTarget - mesh.scale.x) * 0.06 : rootScaleTarget);
        if (singleLineSwap) {
          mesh.position.y += ((0.18 + (verticalFloatOn ? (Math.sin(t * 0.55 + seed) * 0.055 + Math.sin(t * 1.35 + seed) * 0.014) * previewMotionBlend : 0)) - mesh.position.y) * 0.075;
          mesh.position.z += ((1.48 + (verticalFloatOn ? Math.cos(t * 0.48 + seed) * 0.080 * previewMotionBlend : 0)) - mesh.position.z) * 0.080;
        } else {
          var enterDir = mesh.userData.enterDirection || 0;
          var enterOffsetY = enterDir * lineStepWorld * (1 - a);
          var progressLift = -shownProgress * 0.026;
          mesh.position.y += ((0.20 + enterOffsetY + progressLift + (verticalFloatOn ? (Math.sin(t * 0.55 + seed) * 0.046 + Math.sin(t * 1.35 + seed) * 0.012) * previewMotionBlend : 0)) - mesh.position.y) * (enterDir ? 0.115 : 0.080);
          mesh.position.z += ((1.48 - Math.abs(enterDir) * 0.045 * (1 - a) + (verticalFloatOn ? Math.cos(t * 0.48 + seed) * 0.070 * previewMotionBlend : 0)) - mesh.position.z) * 0.090;
        }
        var rootRotationTarget = (Math.sin(t * 0.34 + seed) * (style === 'smooth' ? 0.006 : (style === 'float' ? 0.026 : 0.018)) + textJitterX * 0.18 + glitchCameraDrive * glitchAmount * 0.014) * previewMotionBlend;
        mesh.rotation.z = previewMotionBlend < 1 ? mesh.rotation.z + (rootRotationTarget - mesh.rotation.z) * 0.18 : rootRotationTarget;
      }
      if (data.sparks && data.sparkMat) data.sparks.visible = fx.lyricGlowParticles || getLyricSparkOpacity(data) > 0.015;
      if (data.sparks && data.basePositions) {
        var pos = data.sparks.geometry.attributes.position;
        var arr = pos.array, base = data.basePositions;
        data.sparks.rotation.z += ((fx.lyricGlowParticles ? 0.0009 : 0.00025) + stageLyrics.beatGlow * 0.0007) * (dt * 60);
        data.sparks.rotation.x = Math.sin(t * 0.12 + seed) * 0.012;
        for (var si = 0; si < arr.length / 3; si++) {
          var s = si * 12.989 + seed;
          var particleBeat = fx.lyricGlowParticles ? stageLyrics.beatGlow : 0;
          var dustBreath = fx.lyricGlowParticles ? (0.62 + 0.38 * Math.sin(t * (0.32 + (si % 7) * 0.025) + s)) : 0.18;
          var drift = fx.lyricGlowParticles ? 1 : 0.30;
          arr[si * 3] = base[si * 3] + Math.sin(t * (0.18 + (si % 5) * 0.025) + s) * (0.045 + bass * 0.030 + particleBeat * 0.052) * drift + Math.cos(t * 0.11 + s) * 0.018 * dustBreath;
          arr[si * 3 + 1] = base[si * 3 + 1] + Math.cos(t * (0.16 + (si % 6) * 0.024) + s) * (0.042 + mid * 0.026 + particleBeat * 0.046) * drift + Math.sin(t * 0.13 + s) * 0.016 * dustBreath;
          arr[si * 3 + 2] = base[si * 3 + 2] + Math.sin(t * (0.24 + (si % 4) * 0.035) + s) * (0.036 + particleBeat * 0.028) * drift;
        }
        pos.needsUpdate = true;
      }
      return true;
    }
    opacity = holdingForLyricReveal
      ? clampRange(Number(data.globalOpacity) || shelfDetailLyricProfile.opacity, 0, 1)
      : (1 - a) * 0.72 * shelfDetailLyricProfile.outgoing;
    if (data.textMat) data.textMat.uniforms.uOpacity.value = opacity;
    if (data.readabilityMat) data.readabilityMat.opacity = opacity * (shelfDetailOpen ? shelfDetailLyricProfile.readability : 0.58);
    if (data.contextMat) data.contextMat.opacity = opacity * (shelfDetailOpen ? shelfDetailLyricProfile.readability * 0.72 : clampRange(0.46 + lyricContextOpacityValue() * 0.26, 0.54, 0.76));
    updateLyricRowLayers(data, {
      opacity: opacity,
      readability: shelfDetailOpen ? shelfDetailLyricProfile.readability : 0.58,
      contextIntro: 1,
      shownProgress: shownProgress,
      contextDrift: lyricMotion.contextDrift * 0.42,
      style: style,
      time: t,
      seed: seed,
      jitterX: textJitterX,
      jitterY: textJitterY,
      glitchPulse: glitchPulse,
      targetIndex: data.trackTargetIndex,
      renderBase: stageLyricRenderBase,
      qualityRootPriority: isCurrent ? 0 : 1000,
      deltaTime: dt,
      previewMotionLock: previewMotionLock,
      motionBlend: previewMotionBlend,
      ease: 0.22
    });
    if (data.textMat && data.textMat.uniforms.uSolar) data.textMat.uniforms.uSolar.value *= shelfDetailOpen ? 0.72 : 0.86;
    if (data.glowMat) data.glowMat.opacity = (!data.suppressStaticGlow && lyricGlowStrength > 0) ? (shelfDetailOpen ? Math.min(shelfDetailLyricProfile.glowCap * 0.40, opacity * 0.05 * lyricGlowStrength) : opacity * 0.08 * lyricGlowStrength) : 0;
    if (data.sparkMat) {
      var outgoingSpark = lyricGlowStrength > 0 && fx.lyricGlowParticles && !shelfDetailOpen ? Math.max(opacity * 0.24 * lyricGlowStrength, (1 - a) * 0.18 * lyricGlowStrength) : 0;
      setLyricSparkOpacity(data, outgoingSpark);
      setLyricSparkSize(data, 0.046 + (1 - a) * 0.020);
    }
    if (data.sunMat) data.sunMat.opacity = (!data.suppressStaticGlow && lyricGlowStrength > 0 && !shelfDetailOpen) ? opacity * 0.08 * lyricGlowStrength : 0;
    if (previewMotionLock) {
      mesh.position.set(
        Number(mesh.userData.progressPreviewHoldX) || 0,
        Number(mesh.userData.progressPreviewHoldY) || 0,
        Number(mesh.userData.progressPreviewHoldZ) || 0
      );
      mesh.scale.setScalar(Number(mesh.userData.progressPreviewHoldScale) || 1);
      mesh.rotation.z = Number(mesh.userData.progressPreviewHoldRotationZ) || 0;
      return true;
    }
    if (holdingForLyricReveal) return true;
    if (singleLineSwap) {
      mesh.position.z -= dt * 0.26;
      mesh.position.y += dt * 0.08;
      mesh.scale.setScalar(0.98 - a * 0.06);
      return a < 1;
    }
    if (!isFinite(mesh.userData.exitStartY)) mesh.userData.exitStartY = mesh.position.y;
    if (!isFinite(mesh.userData.exitStartZ)) mesh.userData.exitStartZ = mesh.position.z;
    var exitDir = mesh.userData.exitDirection || 0;
    mesh.position.y += ((mesh.userData.exitStartY + exitDir * lineStepWorld * 1.02 * a + 0.050 * a) - mesh.position.y) * (lyricMotion.style === 'quick' ? 0.24 : 0.18);
    mesh.position.z += ((mesh.userData.exitStartZ - 0.24 * a) - mesh.position.z) * 0.16;
    mesh.scale.setScalar(0.98 - a * 0.06);
    return a < 1;
  }
  tickMesh(stageLyrics.current, true);
  for (var i = stageLyrics.outgoing.length - 1; i >= 0; i--) {
    if (!tickMesh(stageLyrics.outgoing[i], false)) {
      disposeLyricMesh(stageLyrics.outgoing[i]);
      stageLyrics.outgoing.splice(i, 1);
    }
  }
  if (typeof finalizeLyricQualitySelectionFrame === 'function') finalizeLyricQualitySelectionFrame();
}

var lyricKaraokeMeasureCanvas = null;
function lyricKaraokeMeasureContext() {
  if (!lyricKaraokeMeasureCanvas) lyricKaraokeMeasureCanvas = document.createElement('canvas');
  return lyricKaraokeMeasureCanvas.getContext('2d');
}
function lyricKaraokeMetricsKey(line) {
  return [
    line && line.text || '',
    line && line.words && line.words.length || 0,
    normalizeLyricFontKey(fx && fx.lyricFont),
    Math.round(lyricFontWeightValue()),
    Math.round((Number(fx && fx.lyricLetterSpacing) || 0) * 10000)
  ].join('|');
}
function lyricKaraokeWordRanges(line) {
  if (!line || !line.words || !line.words.length || !line.text) return null;
  var key = lyricKaraokeMetricsKey(line);
  if (line._karaokeMetricKey === key && Array.isArray(line._karaokeWordRanges)) return line._karaokeWordRanges;
  var ctx = lyricKaraokeMeasureContext();
  var text = String(line.text || '');
  var fontSize = 128;
  var fullWidth = Math.max(1, lyricMeasureTextAtSize(ctx, text, fontSize, lyricFontWeightValue()));
  var ranges = line.words.map(function (w) {
    var c0 = Math.max(0, Math.min(text.length, Math.floor(Number(w.c0) || 0)));
    var c1 = Math.max(c0, Math.min(text.length, Math.ceil(Number(w.c1) || c0)));
    var p0 = lyricMeasureTextAtSize(ctx, text.slice(0, c0), fontSize, lyricFontWeightValue()) / fullWidth;
    var p1 = lyricMeasureTextAtSize(ctx, text.slice(0, c1), fontSize, lyricFontWeightValue()) / fullWidth;
    if (!isFinite(p0)) p0 = c0 / Math.max(1, line.charCount || text.length);
    if (!isFinite(p1)) p1 = c1 / Math.max(1, line.charCount || text.length);
    return {
      p0: clampRange(p0, 0, 1),
      p1: clampRange(Math.max(p1, p0), 0, 1)
    };
  });
  line._karaokeMetricKey = key;
  line._karaokeWordRanges = ranges;
  return ranges;
}
function lyricLineHasNativeKaraoke(line) {
  return !!(line && Array.isArray(line.words) && line.words.length && Number(line.charCount) > 0);
}
function getLyricLineProgress(line, nextLine, now) {
  if (!line) return 0;
  if (lyricLineHasNativeKaraoke(line)) {
    now = Math.max(0, Number(now) || 0);
    var ranges = lyricKaraokeWordRanges(line);
    var lastP = 0;
    for (var i = 0; i < line.words.length; i++) {
      var w = line.words[i];
      var ws = w.t;
      var we = w.t + Math.max(0.08, w.d || 0.24);
      if (now < ws) return lastP;
      var local = now >= we ? 1 : (now - ws) / Math.max(0.08, we - ws);
      local = Math.max(0, Math.min(1, local));
      var range = ranges && ranges[i] || null;
      var p0 = range ? range.p0 : ((w.c0 || 0) / line.charCount);
      var p1 = range ? range.p1 : ((w.c1 || 0) / line.charCount);
      var p = p0 + (p1 - p0) * local;
      lastP = Math.max(lastP, p);
      if (now < we) return lastP;
    }
    return 1;
  }
  now += 0.020;
  var nextT = nextLine && nextLine.t > line.t ? nextLine.t : Math.min((audio && audio.duration) || now + 4, line.t + (line.duration || 4.8));
  var span = Math.max(0.75, nextT - line.t);
  var prog = Math.max(0, Math.min(1, (now - line.t) / span));
  return prog * prog * (3 - 2 * prog);
}

function lyricLineDisplayTextAt(index) {
  var line = lyricsLines && lyricsLines[index];
  return normalizeStageLyricText(line && line.text);
}
function lyricLineTranslationTextAt(index) {
  var line = lyricsLines && lyricsLines[index];
  return normalizeLyricTranslationText(line && line.translation);
}
function stageLyricContextEntry(index, currentIndex) {
  var line = lyricsLines && lyricsLines[index];
  var text = lyricLineDisplayTextAt(index);
  if (!text) return null;
  var delta = index - currentIndex;
  var abs = Math.abs(delta);
  var translation = normalizeLyricTranslationText(line && line.translation);
  if (delta === 0) return { text: text, role: 'current', alpha: 1, scale: 1, translation: translation, lineIndex: index, virtualIndex: lyricPrimaryVirtualIndex(index) };
  var mode = normalizeLyricDisplayMode(fx && fx.lyricDisplayMode);
  var contextOpacity = lyricContextOpacityValue();
  var nearAlpha = mode === 'cinema' ? contextOpacity : contextOpacity * 0.92;
  var farAlpha = mode === 'cinema' ? contextOpacity * 0.64 : contextOpacity * 0.52;
  var nearScale = mode === 'cinema' ? 0.90 : 0.88;
  var farScale = mode === 'cinema' ? 0.82 : 0.78;
  return {
    text: text,
    role: delta < 0 ? 'prev' : 'next',
    alpha: clampRange(abs > 1 ? farAlpha : nearAlpha, 0.18, 0.92),
    scale: abs > 1 ? farScale : nearScale,
    translation: translation,
    lineIndex: index,
    virtualIndex: lyricPrimaryVirtualIndex(index)
  };
}
function makeStageLyricTranslationEntry(entry, isCurrent) {
  var text = normalizeLyricTranslationText(entry && entry.translation);
  if (!text) return null;
  var parentRole = entry.role || 'context';
  var scale = lyricTranslationScaleValue();
  var parentIndex = entry && entry.lineIndex != null
    ? Number(entry.lineIndex)
    : (entry && entry.parentIndex != null
      ? Number(entry.parentIndex)
      : (entry && entry.virtualIndex != null ? Number(entry.virtualIndex) : 0));
  var baseAlpha = entry.alpha == null ? (isCurrent ? 1 : 0.58) : entry.alpha;
  return {
    text: text,
    role: 'translation',
    parentRole: parentRole,
    translationLine: true,
    alpha: isCurrent ? clampRange(lyricTranslationOpacityValue() + 0.08, 0.48, 1) : clampRange(baseAlpha * 0.62, 0.24, 0.60),
    scale: isCurrent ? clampRange(scale * 1.08, 0.70, 1.12) : clampRange(scale * 0.92, 0.50, 0.96),
    weight: 650,
    lineOffset: 0,
    parentIndex: parentIndex,
    lineIndex: entry && entry.lineIndex != null ? Number(entry.lineIndex) : undefined,
    virtualIndex: lyricTranslationVirtualIndex(parentIndex)
  };
}
function applyLyricTranslationModeToEntries(entries, activeLine, maxRowsOverride) {
  entries = Array.isArray(entries) ? entries : [];
  activeLine = Math.max(0, Math.min(entries.length - 1, activeLine || 0));
  var mode = normalizeLyricTranslationMode(fx && fx.lyricTranslationMode);
  if (mode === 'off' || !entries.length) return { entries: entries, activeLine: activeLine };
  var activeEntry = entries[activeLine];
  var activeTranslation = makeStageLyricTranslationEntry(activeEntry, true);
  if (!activeTranslation) return { entries: entries, activeLine: activeLine };
  if (mode === 'dual') {
    if (entries.length <= 1) return { entries: [activeEntry, activeTranslation], activeLine: 0 };
    var dualOut = [];
    var dualActiveLine = 0;
    for (var di = 0; di < entries.length; di++) {
      var dualEntry = entries[di];
      if (di === activeLine) dualActiveLine = dualOut.length;
      dualOut.push(dualEntry);
      if (di === activeLine) {
        dualOut.push(activeTranslation);
      } else if (di === activeLine + 1) {
        var nextTranslation = makeStageLyricTranslationEntry(dualEntry, false);
        if (nextTranslation) dualOut.push(nextTranslation);
      }
    }
    return { entries: dualOut, activeLine: dualActiveLine };
  }
  var out = [];
  var nextActiveLine = 0;
  var maxRows = Math.max(1, Math.round(Number(maxRowsOverride) || 10));
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (out.length >= maxRows) break;
    if (i === activeLine) nextActiveLine = out.length;
    out.push(entry);
    var shouldTranslate = i === activeLine || mode === 'multi';
    if (shouldTranslate && out.length < maxRows) {
      var tr = makeStageLyricTranslationEntry(entry, i === activeLine);
      if (tr) out.push(tr);
    }
  }
  return { entries: out.length ? out : entries, activeLine: nextActiveLine };
}
function applyLyricTranslationModeToTrackEntries(entries, activeLine, maxRowsOverride) {
  entries = Array.isArray(entries) ? entries : [];
  activeLine = Math.max(0, Math.min(entries.length - 1, activeLine || 0));
  var mode = normalizeLyricTranslationMode(fx && fx.lyricTranslationMode);
  if (mode === 'off' || !entries.length) return { entries: entries, activeLine: activeLine };
  var maxRows = Math.max(1, Math.round(Number(maxRowsOverride) || 24));
  var out = [];
  var nextActiveLine = 0;
  for (var i = 0; i < entries.length && out.length < maxRows; i++) {
    var entry = entries[i];
    var isCurrentEntry = i === activeLine;
    if (isCurrentEntry) nextActiveLine = out.length;
    var rowEntry = isCurrentEntry
      ? cloneStageLyricEntryForLayer(entry, { role: 'current', alpha: 1, scale: 1 })
      : entry;
    out.push(rowEntry);
    var shouldTranslate = mode !== 'off';
    if (shouldTranslate && out.length < maxRows) {
      var tr = makeStageLyricTranslationEntry(rowEntry, isCurrentEntry);
      if (tr) out.push(tr);
    }
  }
  return { entries: out.length ? out : entries, activeLine: nextActiveLine };
}
function stageLyricTrackKeyForMode(mode) {
  mode = normalizeLyricDisplayMode(mode);
  var first = lyricsLines && lyricsLines[0];
  var last = lyricsLines && lyricsLines.length ? lyricsLines[lyricsLines.length - 1] : null;
  var song = Array.isArray(playQueue) && currentIdx >= 0 && playQueue[currentIdx] ? playQueue[currentIdx] : null;
  var songKey = song ? (typeof songProviderKey === 'function' ? songProviderKey(song) : String(song.id || song.mid || song.name || '')) : '';
  return [
    'track',
    songKey,
    stageLyricTrackGeneration,
    mode,
    normalizeLyricTranslationMode(fx && fx.lyricTranslationMode),
    lyricDisplayLineCountForMode(mode),
    Math.round(lyricContextOpacityValue() * 100),
    Math.round(lyricTranslationGapValue() * 100),
    Math.round(lyricTranslationScaleValue() * 100),
    Math.round(lyricTranslationOpacityValue() * 100),
    lyricsLines ? lyricsLines.length : 0,
    first ? Math.round((first.t || 0) * 1000) : 0,
    last ? Math.round((last.t || 0) * 1000) : 0,
    first ? normalizeStageLyricText(first.text).slice(0, 16) : '',
    last ? normalizeStageLyricText(last.text).slice(0, 16) : '',
    lyricsTranslationLines ? lyricsTranslationLines.length : 0,
    first ? normalizeLyricTranslationText(first.translation).slice(0, 16) : '',
    last ? normalizeLyricTranslationText(last.translation).slice(0, 16) : ''
  ].join('|');
}
var stageLyricTrackCache = { key: '', entries: null, lineMap: null, start: 0, end: -1 };
function stageLyricTrackBaseEntry(index) {
  var line = lyricsLines && lyricsLines[index];
  var text = lyricLineDisplayTextAt(index);
  if (!text) return null;
  return {
    text: text,
    role: 'context',
    alpha: clampRange(lyricContextOpacityValue(), 0.18, 0.92),
    scale: 0.88,
    translation: normalizeLyricTranslationText(line && line.translation),
    lineIndex: index,
    virtualIndex: lyricPrimaryVirtualIndex(index)
  };
}
function lyricMeshTrackWindow(index, mode, options) {
  options = options || {};
  var last = lyricsLines && lyricsLines.length ? lyricsLines.length - 1 : -1;
  if (last < 0) return { start: 0, end: -1 };
  var idx = Math.max(0, Math.min(last, Math.round(Number(index) || 0)));
  mode = normalizeLyricDisplayMode(mode);
  var lineCount = lyricDisplayLineCountForMode(mode);
  var translationMode = normalizeLyricTranslationMode(fx && fx.lyricTranslationMode);
  var hasTranslations = translationMode !== 'off';
  var total = last + 1;
  var lightweightTrack = !!options.lightweightTrack;
  if (lightweightTrack) {
    var denseMultiLine = mode !== 'single' || translationMode === 'multi' || translationMode === 'dual';
    var lightFullTrackLimit = hasTranslations ? (denseMultiLine ? 6 : 10) : (denseMultiLine ? 10 : 14);
    if (total <= lightFullTrackLimit) return { start: 0, end: last, lightweight: true };
    var lightPageSize = Math.ceil(lineCount * (hasTranslations ? (denseMultiLine ? 0.88 : 1.22) : (denseMultiLine ? 0.96 : 1.12))) + (hasTranslations ? (denseMultiLine ? 4 : 5) : (denseMultiLine ? 5 : 6));
    if (mode === 'cinema' || mode === 'custom') lightPageSize += Math.ceil(lineCount * 0.30);
    var lightMin = denseMultiLine ? Math.max(lineCount + 2, hasTranslations ? 8 : 9) : (hasTranslations ? 9 : 10);
    var lightMax = denseMultiLine ? Math.max(lightMin, hasTranslations ? lineCount + 4 : lineCount + 6) : (hasTranslations ? 18 : 24);
    lightPageSize = Math.max(lightMin, Math.min(total, lightPageSize));
    lightPageSize = Math.min(lightPageSize, lightMax);
    var lightOverlap = Math.max(2, Math.ceil(lineCount * (hasTranslations ? (denseMultiLine ? 0.30 : 0.45) : (denseMultiLine ? 0.26 : 0.35))) + 2);
    lightOverlap = Math.min(Math.floor(lightPageSize * 0.30), lightOverlap);
    var lightStep = Math.max(5, lightPageSize - lightOverlap);
    var lightStart = Math.floor(idx / lightStep) * lightStep - lightOverlap;
    lightStart = Math.max(0, lightStart);
    var lightEnd = Math.min(last, lightStart + lightPageSize - 1);
    if (lightEnd - lightStart + 1 < lightPageSize && lightStart > 0) lightStart = Math.max(0, lightEnd - lightPageSize + 1);
    return { start: lightStart, end: lightEnd, lightweight: true };
  }
  var denseFullMultiLine = mode !== 'single' || translationMode === 'multi' || translationMode === 'dual';
  var fullTrackLimit = hasTranslations ? (denseFullMultiLine ? 180 : 220) : (denseFullMultiLine ? 260 : 320);
  if (total <= fullTrackLimit) return { start: 0, end: last };
  var pageSize = hasTranslations ? (denseFullMultiLine ? 180 : 152) : (denseFullMultiLine ? 260 : 216);
  if (mode === 'cinema' || mode === 'custom') pageSize += Math.ceil(lineCount * 2.2);
  pageSize = Math.max(pageSize, Math.ceil(lineCount * (hasTranslations ? 7.2 : 6.2)) + (hasTranslations ? 42 : 52));
  pageSize = Math.max(denseFullMultiLine ? 160 : 96, Math.min(total, pageSize));
  var overlap = Math.max(denseFullMultiLine ? 64 : 36, Math.ceil(lineCount * (hasTranslations ? 3.4 : 2.8)) + 22);
  overlap = Math.min(Math.floor(pageSize * 0.58), overlap);
  var step = Math.max(48, pageSize - overlap);
  var start = Math.floor(idx / step) * step - overlap;
  start = Math.max(0, start);
  var end = Math.min(last, start + pageSize - 1);
  if (end - start + 1 < pageSize && start > 0) start = Math.max(0, end - pageSize + 1);
  return { start: start, end: end };
}
function buildStageLyricMeshTrackEntries(index, mode, options) {
  mode = normalizeLyricDisplayMode(mode);
  if (!lyricsLines || !lyricsLines.length || index < 0) return { entries: [], activeLine: 0, start: 0, end: -1 };
  var windowInfo = lyricMeshTrackWindow(index, mode, options);
  var start = windowInfo.start;
  var end = windowInfo.end;
  var entries = [];
  var activeLine = 0;
  for (var i = start; i <= end; i++) {
    var entry = stageLyricTrackBaseEntry(i);
    if (!entry) continue;
    if (i === index) activeLine = entries.length;
    entries.push(entry);
  }
  if (!entries.length) return { entries: [], activeLine: 0, start: start, end: end };
  var translated = applyLyricTranslationModeToTrackEntries(entries, activeLine, entries.length * 2 + 2);
  var lineMap = {};
  for (var ri = 0; ri < translated.entries.length; ri++) {
    var row = translated.entries[ri];
    if (row && !row.translationLine && row.lineIndex != null && isFinite(Number(row.lineIndex))) lineMap[Number(row.lineIndex)] = ri;
  }
  return {
    entries: translated.entries,
    activeLine: isFinite(Number(lineMap[Math.max(0, Math.round(Number(index) || 0))])) ? Number(lineMap[Math.max(0, Math.round(Number(index) || 0))]) : translated.activeLine,
    start: start,
    end: end,
    lightweight: !!windowInfo.lightweight
  };
}
function lyricBufferedTrackWindow(index, mode) {
  var last = lyricsLines && lyricsLines.length ? lyricsLines.length - 1 : -1;
  if (last < 0) return { start: 0, end: -1 };
  // The steady multi-line path must be one mesh for the entire song.  The
  // lightweight first paint is still allowed to use a small page, but once
  // this cooperative build takes over, changing lyric lines must only move
  // the existing scroll target rather than swapping in a new page.
  return { start: 0, end: last };
}
function buildStageLyricTrackEntries(index, mode) {
  mode = normalizeLyricDisplayMode(mode);
  if (!lyricsLines || !lyricsLines.length || index < 0) return { entries: [], activeLine: 0, start: 0, end: -1 };
  var windowInfo = lyricBufferedTrackWindow(index, mode);
  var cacheKey = stageLyricTrackKeyForMode(mode) + '|win=' + windowInfo.start + '-' + windowInfo.end;
  if (stageLyricTrackCache && stageLyricTrackCache.key === cacheKey && Array.isArray(stageLyricTrackCache.entries)) {
    var cachedLine = stageLyricTrackCache.lineMap && stageLyricTrackCache.lineMap[Math.max(0, Math.round(Number(index) || 0))];
    return {
      entries: stageLyricTrackCache.entries,
      activeLine: isFinite(Number(cachedLine)) ? Number(cachedLine) : 0,
      start: stageLyricTrackCache.start,
      end: stageLyricTrackCache.end,
      lightweight: !!stageLyricTrackCache.lightweight
    };
  }
  var start = windowInfo.start;
  var end = windowInfo.end;
  var entries = [];
  var activeLine = 0;
  for (var i = start; i <= end; i++) {
    var entry = stageLyricTrackBaseEntry(i);
    if (!entry) continue;
    if (i === index) activeLine = entries.length;
    entries.push(entry);
  }
  if (!entries.length) return { entries: [], activeLine: 0, start: start, end: end };
  var translated = applyLyricTranslationModeToTrackEntries(entries, activeLine, entries.length * 2 + 2);
  var lineMap = {};
  for (var ri = 0; ri < translated.entries.length; ri++) {
    var row = translated.entries[ri];
    if (row && !row.translationLine && row.lineIndex != null && isFinite(Number(row.lineIndex))) lineMap[Number(row.lineIndex)] = ri;
  }
  stageLyricTrackCache = { key: cacheKey, entries: translated.entries, lineMap: lineMap, start: start, end: end, lightweight: false };
  return {
    entries: translated.entries,
    activeLine: isFinite(Number(lineMap[Math.max(0, Math.round(Number(index) || 0))])) ? Number(lineMap[Math.max(0, Math.round(Number(index) || 0))]) : translated.activeLine,
    start: start,
    end: end,
    lightweight: false
  };
}
function buildStageLyricDisplayPayload(index, options) {
  options = options || {};
  var mode = normalizeLyricDisplayMode(fx && fx.lyricDisplayMode);
  var current = stageLyricContextEntry(index, index);
  if (!current) return null;
  if (mode === 'single') {
    var singleTrack = stageLyricSingleLineTrackStub(index);
    var singleTranslated = applyLyricTranslationModeToEntries([current], 0);
    return {
      mode: mode,
      key: 'single|' + index + '|' + singleTranslated.entries.map(function (entry) { return entry.role + ':' + entry.text; }).join('\n'),
      activeLine: singleTranslated.activeLine,
      entries: singleTranslated.entries,
      trackIndex: index,
      trackKey: '',
      trackEntries: singleTrack.entries,
      trackStart: singleTrack.start,
      trackEnd: singleTrack.end,
      trackLightweight: false
    };
  }
  var track = options.lightweightTrack
    ? buildStageLyricMeshTrackEntries(index, mode, options)
    : buildStageLyricTrackEntries(index, mode);
  var offsets = lyricDisplayOffsetsForMode(mode);
  var entries = [];
  var activeLine = 0;
  for (var i = 0; i < offsets.length; i++) {
    var offset = offsets[i];
    var entry = stageLyricContextEntry(index + offset, index);
    if (!entry) continue;
    if (offset === 0) activeLine = entries.length;
    entries.push(entry);
  }
  if (mode === 'dual' && entries.length < 2) {
    var prev = stageLyricContextEntry(index - 1, index);
    if (prev) {
      entries.unshift(prev);
      activeLine += 1;
    }
  }
  if (!entries.length) entries = [current];
  activeLine = Math.max(0, Math.min(entries.length - 1, activeLine));
  var translated = applyLyricTranslationModeToEntries(entries, activeLine, entries.length * 2 + 2);
  entries = translated.entries;
  activeLine = translated.activeLine;
  return {
    mode: mode,
    key: mode + '|' + index + '|' + activeLine + '|' + entries.map(function (entry) { return entry.role + ':' + entry.text; }).join('\n'),
    activeLine: activeLine,
    entries: entries,
    trackIndex: index,
    trackKey: stageLyricTrackKeyForMode(mode),
    trackEntries: track.entries,
    trackStart: track.start,
    trackEnd: track.end,
    trackLightweight: !!track.lightweight
  };
}
function buildStageLyricPlaybackPayload(index) {
  var needsFirstLineTakeover = stageLyrics && stageLyrics.currentIdx < 0;
  var multiLineWarmup = stageLyricMultiLineWarmupLoad();
  var shouldStartLightweight = needsFirstLineTakeover && multiLineWarmup;
  if (multiLineWarmup) {
    var currentData = stageLyrics && stageLyrics.current && stageLyrics.current.userData && stageLyrics.current.userData.lyric;
    var currentIsLightweight = !!(currentData && currentData.trackLightweight);
    var lightweightPayload = buildStageLyricDisplayPayload(index, { lightweightTrack: true });
    if (needsFirstLineTakeover && (shouldStartLightweight || stageLyricPrewarmCanServePayload(lightweightPayload))) return lightweightPayload;
    if (currentIsLightweight && lightweightPayload && stageLyricMeshCanServePayload(stageLyrics.current, lightweightPayload)) return lightweightPayload;
    var fullPayload = buildStageLyricDisplayPayload(index);
    if (currentIsLightweight && fullPayload && !stageLyricPrewarmCanServePayload(fullPayload) && lightweightPayload) return lightweightPayload;
    return fullPayload;
  }
  return buildStageLyricDisplayPayload(index);
}

function findStageLyricIndexAtTime(t) {
  if (!lyricsLines || !lyricsLines.length) return -1;
  var target = (Number(t) || 0) + 0.05;
  var lo = 0;
  var hi = lyricsLines.length - 1;
  var ans = -1;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    var lineTime = Number(lyricsLines[mid] && lyricsLines[mid].t) || 0;
    if (lineTime <= target) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

function retireCurrentStageLyricForIdle() {
  if (stageLyrics.current) {
    stageLyrics.current.userData.state = 'out';
    stageLyrics.current.userData.age = 0;
    stageLyrics.outgoing.push(stageLyrics.current);
    stageLyrics.current = null;
    stageLyrics.currentIdx = -1;
    stageLyrics.currentText = '';
    stageLyrics.currentDisplayKey = '';
    stageLyrics.currentPayload = null;
  }
}

function resetStageLyricResumeFrameGates() {
  var now = stageLyricNowMs();
  if (typeof resetFrameGate === 'function' && typeof mainFrameGates !== 'undefined' && mainFrameGates) {
    resetFrameGate(mainFrameGates.lyricsParticles, now);
    resetFrameGate(mainFrameGates.stageLyrics, now);
  }
}

function markStageLyricsPlaybackResume(reason) {
  reason = reason || 'playback-resume';
  stageLyricTrackSwitchBootstrapUntil = 0;
  if (stageLyrics.current && stageLyrics.current.userData) {
    stageLyrics.current.userData.state = 'in';
    stageLyrics.current.userData.age = Math.max(Number(stageLyrics.current.userData.age) || 0, 0.18);
  }
  stageLyrics.lastPlaybackResumeReason = reason;
  var canResumeWithoutWarmup = stageLyricCurrentCanResumeWithoutWarmup();
  var currentIsLightweight = stageLyricCurrentUsesLightweightTrack();
  var now = stageLyricNowMs();
  var idx = stageLyrics && stageLyrics.currentIdx >= 0 ? stageLyrics.currentIdx : chooseStageLyricPrewarmIndex();
  var repeatedResume = idx >= 0 && idx === stageLyricResumeWarmupLastIndex && now - stageLyricResumeWarmupLastAt < 760;
  stageLyricResumeWarmupLastAt = now;
  stageLyricResumeWarmupLastIndex = idx;
  if (canResumeWithoutWarmup) {
    resetStageLyricResumeFrameGates();
    return;
  }
  if (currentIsLightweight) {
    stageLyricResumeUpgradeDeferUntil = Math.max(Number(stageLyricResumeUpgradeDeferUntil) || 0, now + 520);
    if (!repeatedResume) requestStageLyricLightweightUpgrade(reason, 520);
  } else if (!repeatedResume) {
    ensureStageLyricPlaybackWarmup(reason, 96);
  }
  scheduleStageLyricSingleLineBootstrapPrewarm(reason || 'playback-resume', 24);
  resetStageLyricResumeFrameGates();
}

function tickLyricsParticles() {
  if (!fx.particleLyrics) {
    if (stageLyrics.current || stageLyrics.currentText || (stageLyrics.outgoing && stageLyrics.outgoing.length)) clearStageLyrics();
    return;
  }
  var previewingSeek = stageLyricProgressPreviewActive();
  var holdLyricsOnPause = !fx || fx.lyricPauseHold !== false;
  var pausedWithTrack = !!(holdLyricsOnPause && audio && audio.src && audio.paused && !audio.ended && lyricsLines && lyricsLines.length);
  if (!audio || !lyricsLines.length || (audio && audio.ended)) {
    retireCurrentStageLyricForIdle();
    return;
  }
  if (!playing && !previewingSeek) {
    if (pausedWithTrack) {
      if (stageLyrics.current && stageLyrics.current.userData) {
        stageLyrics.current.userData.state = 'in';
        stageLyrics.current.userData.age = Math.max(Number(stageLyrics.current.userData.age) || 0, 0.18);
      }
      return;
    }
    retireCurrentStageLyricForIdle();
    return;
  }
  var t = stageLyricPlaybackSeconds();
  var lyricT = typeof getAdjustedLyricPlaybackTime === 'function' ? getAdjustedLyricPlaybackTime(t) : t;
  var newIdx = findStageLyricIndexAtTime(lyricT);
  if (newIdx < 0) {
    var introText = currentLyricFallbackText();
    if (!introText) {
      clearStageLyrics();
      return;
    }
    if (stageLyrics.currentIdx !== -2 || stageLyrics.currentText !== introText) {
      stageLyrics.currentIdx = -2;
      stageLyrics.transitionLineStep = 0;
      if (previewingSeek && stageLyrics.current) {
        if (lyricsLines && lyricsLines.length) {
          requestStageLyricWarmup('intro-first-line', 100);
          scheduleStageLyricPrewarmForIndex(0, 'intro-first-line', 24);
        }
        return;
      }
      showStageLine(introText);
      if (lyricsLines && lyricsLines.length) {
        requestStageLyricWarmup('intro-first-line', 140);
        scheduleStageLyricPrewarmForIndex(0, 'intro-first-line', 24);
        if (typeof scheduleStageLyricFullTrackWarmup === 'function') scheduleStageLyricFullTrackWarmup('track-ready', 180);
      }
    }
    if (stageLyrics.current) {
      var firstLine = lyricsLines[0];
      var introEnd = firstLine && firstLine.t > 0 ? firstLine.t : Math.min((audio && audio.duration) || 4.8, 4.8);
      var introLine = { t: 0, text: introText, duration: Math.max(0.8, introEnd), charCount: Math.max(1, introText.length), fallback: true };
      updateLyricMeshProgress(stageLyrics.current, getLyricLineProgress(introLine, null, lyricT));
    }
    return;
  }
  if ((stageLyrics.currentIdx < 0 || !stageLyrics.current) && stageLyricWarmupPending()) {
    return;
  }
  var displayPayload = null;
  if (newIdx === stageLyrics.currentIdx && stageLyrics.current && stageLyrics.currentPayload) {
    displayPayload = stageLyrics.currentPayload;
    upgradeCurrentStageLyricFromPreparedTrack('same-line-upgrade');
  } else {
    displayPayload = buildStageLyricPlaybackPayload(newIdx);
  }
  if (!displayPayload) {
    clearStageLyrics();
    return;
  }
  var displayedNewLine = false;
  if (newIdx !== stageLyrics.currentIdx || stageLyrics.currentDisplayKey !== displayPayload.key) {
    stageLyrics.transitionLineStep = stageLyrics.currentIdx >= 0 && newIdx >= 0
      ? clampRange(newIdx - stageLyrics.currentIdx, -2, 2)
      : 0;
    var displayed = showStageLine(displayPayload, false, { noSyncBuild: true });
    if (!displayed && displayPayload && !displayPayload.trackLightweight && stageLyricMultiLineWarmupLoad()) {
      requestStageLyricDemandPrewarm(displayPayload);
      var lightweightFallback = buildStageLyricDisplayPayload(newIdx, { lightweightTrack: true });
      if (lightweightFallback) {
        displayed = showStageLine(lightweightFallback, false, { noSyncBuild: true });
        if (displayed) {
          displayPayload = lightweightFallback;
          if (typeof scheduleStageLyricFullTrackWarmup === 'function') scheduleStageLyricFullTrackWarmup('lightweight-upgrade', 96);
        }
      }
    }
    if (!displayed) {
      requestStageLyricDemandPrewarm(displayPayload);
      return;
    }
    if (displayPayload.trackLightweight && typeof scheduleStageLyricFullTrackWarmup === 'function') {
      scheduleStageLyricFullTrackWarmup('lightweight-upgrade', 96);
    }
    stageLyrics.currentIdx = newIdx;
    displayedNewLine = true;
  }
  if (stageLyrics.current) {
    var curLine = lyricsLines[newIdx] || { t: lyricT };
    var nextLine = lyricsLines[newIdx + 1];
    var progress = getLyricLineProgress(curLine, nextLine, lyricT);
    updateLyricMeshProgress(stageLyrics.current, progress, { nativeKaraoke: lyricLineHasNativeKaraoke(curLine) });
    if (stageLyricPayloadIsSingleLine(displayPayload) && (displayedNewLine || progress > 0.35)) {
      scheduleStageLyricSingleLineNextPrewarm(newIdx, lyricT, displayedNewLine ? 'single-line-next' : 'single-line-tail');
    }
  }
}

function disposeLyricsParticles() {
  clearStageLyrics();
  if (stageLyrics.starRiver) {
    if (stageLyrics.starRiver.parent) stageLyrics.starRiver.parent.remove(stageLyrics.starRiver);
    if (stageLyrics.starRiver.geometry) stageLyrics.starRiver.geometry.dispose();
    if (stageLyrics.starRiver.material) stageLyrics.starRiver.material.dispose();
    stageLyrics.starRiver = null;
  }
  if (stageLyrics.group) {
    scene.remove(stageLyrics.group);
    stageLyrics.group = null;
  }
}

// ============================================================
//  涟漪触发系统 — 3×3 九宫格 + bass 上升沿
