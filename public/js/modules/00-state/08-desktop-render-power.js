function pulseObjectValue(target, key, amount, duration) {
  if (!target) return;
  target[key] = Math.max(target[key] || 0, amount || 1);
  if (window.gsap) {
    window.gsap.killTweensOf(target, key);
    var vars = { duration: duration || 0.42, ease: 'power3.out' };
    vars[key] = 0;
    window.gsap.to(target, vars);
  } else {
    setTimeout(function () { if (target) target[key] = 0; }, (duration || 0.42) * 1000);
  }
}

var desktopRuntimeState = {
  desktop: !!window.desktopWindow,
  minimized: false,
  visible: true,
  focused: true,
  fullscreen: false,
  embedded: false,
  interactive: false
};
var renderPowerState = { mode: '', width: 0, height: 0, pixelRatio: 0 };
var backgroundCacheTrimTimer = 0;
var backgroundAppMemoryTrimTimer = 0;
var backgroundAppMemoryTrimInFlight = false;
var runtimePerfState = {
  lastCacheTrimAt: 0,
  lastAppMemoryTrimAt: 0,
  lastAppMemoryTrimReason: '',
  lastAppMemoryTrimResult: null,
  cacheTrimCount: 0,
  lastCacheTrimReason: '',
  lastHeapSampleAt: 0,
  heapMB: 0,
  cacheCounts: {}
};
var runtimeGpuDiagnostics = null;
var runtimeGpuDiagnosticsError = '';
var runtimeHardwareProfile = detectRuntimeHardwareProfile();
function detectRuntimeHardwareProfile() {
  var nav = window.navigator || {};
  var cores = Number(nav.hardwareConcurrency) || 0;
  var memory = Number(nav.deviceMemory) || 0;
  var dpr = Number(window.devicePixelRatio) || 1;
  var cssPixels = Math.max(1, (Number(window.innerWidth) || 1) * (Number(window.innerHeight) || 1));
  var renderPixels = cssPixels * dpr * dpr;
  var lowCore = cores > 0 && cores <= 4;
  var lowMemory = memory > 0 && memory <= 4;
  var largeSurface = renderPixels >= 4200000;
  var veryLargeSurface = renderPixels >= 7200000;
  var lowSpec = lowCore || lowMemory || (cores > 0 && cores <= 6 && veryLargeSurface);
  var balancedSpec = lowSpec || (cores > 0 && cores <= 8) || largeSurface;
  return {
    cores: cores,
    deviceMemoryGB: memory,
    devicePixelRatio: dpr,
    cssPixels: cssPixels,
    renderPixels: Math.round(renderPixels),
    lowCore: lowCore,
    lowMemory: lowMemory,
    largeSurface: largeSurface,
    veryLargeSurface: veryLargeSurface,
    lowSpec: lowSpec,
    balancedSpec: balancedSpec
  };
}
function refreshRuntimeHardwareSurfaceProfile() {
  var next = detectRuntimeHardwareProfile();
  runtimeHardwareProfile.devicePixelRatio = next.devicePixelRatio;
  runtimeHardwareProfile.cssPixels = next.cssPixels;
  runtimeHardwareProfile.renderPixels = next.renderPixels;
  runtimeHardwareProfile.largeSurface = next.largeSurface;
  runtimeHardwareProfile.veryLargeSurface = next.veryLargeSurface;
  runtimeHardwareProfile.lowSpec = runtimeHardwareProfile.lowCore || runtimeHardwareProfile.lowMemory || (runtimeHardwareProfile.cores > 0 && runtimeHardwareProfile.cores <= 6 && next.veryLargeSurface);
  runtimeHardwareProfile.balancedSpec = runtimeHardwareProfile.lowSpec || (runtimeHardwareProfile.cores > 0 && runtimeHardwareProfile.cores <= 8) || next.largeSurface;
  return runtimeHardwareProfile;
}
function performanceQualityRank() {
  var quality = (typeof normalizePerformanceQuality === 'function')
    ? normalizePerformanceQuality(fx && fx.performanceQuality)
    : String(fx && fx.performanceQuality || 'balanced');
  if (quality === 'eco') return 0;
  if (quality === 'balanced') return 1;
  if (quality === 'ultra') return 3;
  return 2;
}
function runtimePerfBudgetLevel() {
  var rank = performanceQualityRank();
  var profile = runtimeHardwareProfile || detectRuntimeHardwareProfile();
  if (rank <= 0) return 0;
  if (profile.lowSpec && rank <= 2) return 0;
  if (rank <= 1 || (profile.balancedSpec && rank <= 2)) return 1;
  if (rank >= 3 && !profile.lowSpec) return 3;
  return 2;
}
function runtimePerfScale() {
  var level = runtimePerfBudgetLevel();
  return level <= 0 ? 0.72 : (level === 1 ? 0.84 : (level >= 3 ? 1.08 : 1.0));
}
function runtimeAudioAnalysisScale() {
  if (isDeepBackgroundMode()) return 0.18;
  var level = runtimePerfBudgetLevel();
  var profile = runtimeHardwareProfile || detectRuntimeHardwareProfile();
  if (level <= 0) return profile.lowMemory ? 0.62 : 0.68;
  if (level === 1) return 0.78;
  if (level >= 3) return 1.0;
  return 0.90;
}
function runtimeAnalysisStride(kind, length) {
  length = Math.max(1, Number(length) || 1);
  var level = runtimePerfBudgetLevel();
  if (kind === 'time') {
    if (level <= 0) return Math.max(2, Math.floor(length / 512));
    if (level === 1) return Math.max(1, Math.floor(length / 768));
    return 1;
  }
  if (kind === 'wide-band') {
    if (level <= 0) return 3;
    if (level === 1) return 2;
    return 1;
  }
  return 1;
}
function isDeepBackgroundMode() {
  if (isLiveBackgroundKeepMode()) return false;
  // Electron may briefly leave document.hidden stale after a tray restore.
  // The native BrowserWindow state is authoritative for desktop power policy;
  // browser-only builds still use the Page Visibility API.
  if (desktopRuntimeState.desktop) {
    return !!(desktopRuntimeState.minimized || desktopRuntimeState.visible === false);
  }
  return !!document.hidden;
}
function currentPerformanceBackgroundMode() {
  return normalizePerformanceBackgroundMode(fx && fx.performanceBackground, fx && fx.liveBackgroundKeep === true);
}
function isLiveBackgroundKeepMode() {
  return currentPerformanceBackgroundMode() === 'keep';
}
function isBackgroundReleaseMode() {
  return currentPerformanceBackgroundMode() === 'release';
}
function isHiddenForBackgroundOptimization() {
  return !!(document.hidden && !isLiveBackgroundKeepMode());
}
function isVisibleBackgroundMode() {
  return false;
}
function updateRenderPowerClasses() {
  document.body.classList.toggle('render-deep-sleep', isDeepBackgroundMode());
  document.body.classList.toggle('render-background-eco', isVisibleBackgroundMode());
}
function safeObjectKeys(obj) {
  try { return obj ? Object.keys(obj) : []; } catch (e) { return []; }
}
function markProtectedKey(map, key) {
  if (key) map[String(key)] = true;
}
function collectProtectedCoverUrls() {
  var keep = Object.create(null);
  function mark(url) { if (url) keep[String(url)] = true; }
  try {
    var song = (typeof currentCoverSong === 'function') ? currentCoverSong() : (playQueue && currentIdx >= 0 ? playQueue[currentIdx] : null);
    if (song) {
      mark(song.cover);
      if (typeof songCoverSrc === 'function') {
        mark(songCoverSrc(song, 60));
        mark(songCoverSrc(song, 360));
        mark(songCoverSrc(song, 400));
      }
    }
    if (typeof currentCoverSource !== 'undefined' && currentCoverSource && currentCoverSource.src) mark(currentCoverSource.src);
    if (typeof playlistPanelDetailState !== 'undefined' && playlistPanelDetailState && playlistPanelDetailState.playlist) {
      var cover = playlistPanelDetailState.playlist.cover;
      mark(cover);
      if (typeof coverUrlWithSize === 'function') {
        mark(coverUrlWithSize(cover, 88));
        mark(coverUrlWithSize(cover, 96));
      }
    }
    if (shelfManager && shelfManager.getCards) {
      shelfManager.getCards().forEach(function (card) {
        if (card && card.item) mark(card.item.cover);
      });
    }
  } catch (e) { }
  return keep;
}
function collectProtectedBeatMapKeys() {
  var keep = Object.create(null);
  try {
    if (typeof beatMapSongKey === 'function' && playQueue && playQueue.length) {
      var start = Math.max(0, currentIdx - 5);
      var end = Math.min(playQueue.length - 1, currentIdx + 5);
      for (var i = start; i <= end; i++) markProtectedKey(keep, beatMapSongKey(playQueue[i]));
    }
    if (typeof beatPrefetchLastKey !== 'undefined') markProtectedKey(keep, beatPrefetchLastKey);
    if (typeof djMode !== 'undefined' && djMode && djMode.songKey) markProtectedKey(keep, djMode.songKey);
    if (typeof localBeatAnalysis !== 'undefined' && localBeatAnalysis && localBeatAnalysis.song && typeof beatMapSongKey === 'function') {
      markProtectedKey(keep, beatMapSongKey(localBeatAnalysis.song));
    }
  } catch (e) { }
  return keep;
}
function collectProtectedCoverDepthIds() {
  var keep = Object.create(null);
  try {
    if (typeof coverDepthCacheId !== 'function') return keep;
    var candidates = [];
    if (typeof currentCoverSource !== 'undefined' && currentCoverSource && currentCoverSource.src) candidates.push(currentCoverSource.src);
    var song = (typeof currentCoverSong === 'function') ? currentCoverSong() : null;
    if (song && typeof songCoverSrc === 'function') {
      candidates.push(songCoverSrc(song, 360));
      candidates.push(songCoverSrc(song, 400));
    }
    var texImg = (typeof coverTex !== 'undefined' && coverTex && coverTex.image) ? coverTex.image : null;
    var w = texImg && texImg.width ? texImg.width : 0;
    var h = texImg && texImg.height ? texImg.height : 0;
    candidates.forEach(function (src) {
      if (src) markProtectedKey(keep, coverDepthCacheId(src + '|tex=' + w + 'x' + h));
    });
  } catch (e) { }
  return keep;
}
function trimObjectCache(cache, keep, protectedKeys, skipRecord) {
  var keys = safeObjectKeys(cache);
  if (!cache || keys.length <= keep) return 0;
  var drop = keys.length - keep;
  var dropped = 0;
  for (var i = 0; i < keys.length && drop > 0; i++) {
    var key = keys[i];
    if (protectedKeys && protectedKeys[key]) continue;
    var rec = cache[key];
    if (skipRecord && skipRecord(rec, key)) continue;
    delete cache[key];
    drop--;
    dropped++;
  }
  return dropped;
}
function trimCoverDepthCache(keep, protectedKeys) {
  if (!coverDepthCache || !coverDepthCacheKeys) return 0;
  var keys = coverDepthCacheKeys.filter(function (key) { return !!coverDepthCache[key]; });
  if (keys.length <= keep) {
    coverDepthCacheKeys = keys;
    return 0;
  }
  var keepSet = Object.create(null);
  var count = 0;
  for (var i = keys.length - 1; i >= 0 && count < keep; i--) {
    keepSet[keys[i]] = true;
    count++;
  }
  Object.keys(protectedKeys || {}).forEach(function (key) { keepSet[key] = true; });
  var dropped = 0;
  keys.forEach(function (key) {
    if (keepSet[key]) return;
    delete coverDepthCache[key];
    dropped++;
  });
  coverDepthCacheKeys = keys.filter(function (key) { return !!coverDepthCache[key]; });
  return dropped;
}
function collectRuntimePerfSnapshot(now) {
  now = now || performance.now();
  runtimePerfState.cacheCounts = {
    playlistCovers: safeObjectKeys(playlistCoverCache).length,
    coverDepth: coverDepthCacheKeys ? coverDepthCacheKeys.length : 0,
    beatMaps: safeObjectKeys(beatMapCache).length,
    djBeatMaps: safeObjectKeys(djBeatMapCache).length,
    stageLyricTrack: (typeof stageLyricTrackCache !== 'undefined' && stageLyricTrackCache && stageLyricTrackCache.entries) ? stageLyricTrackCache.entries.length : 0
  };
  if (performance && performance.memory && now - runtimePerfState.lastHeapSampleAt > 12000) {
    runtimePerfState.lastHeapSampleAt = now;
    runtimePerfState.heapMB = Math.round((performance.memory.usedJSHeapSize || 0) / 1048576);
  }
  return {
    render: (typeof renderPerfState !== 'undefined') ? {
      mode: renderPerfState.mode,
      fps: renderPerfState.fps,
      targetFps: renderPerfState.targetFps,
      displayHz: renderPerfState.displayHz,
      adaptiveDivisor: renderPerfState.adaptiveDivisor,
      adaptiveKind: renderPerfState.adaptiveKind,
      adaptivePressure: renderPerfState.adaptivePressure,
      adaptiveFrameCostMs: renderPerfState.adaptiveFrameCostMs,
      foregroundFpsMode: renderPerfState.foregroundFpsMode,
      interactionBoost: renderPerfState.interactionBoost,
      skipped: renderPerfState.skipped,
      longFrames: renderPerfState.longFrames
    } : null,
    runtime: runtimePerfState,
    gpu: runtimeGpuDiagnostics || (runtimeGpuDiagnosticsError ? { error: runtimeGpuDiagnosticsError } : null),
    hardware: refreshRuntimeHardwareSurfaceProfile(),
    budget: {
      qualityRank: performanceQualityRank(),
      level: runtimePerfBudgetLevel(),
      perfScale: runtimePerfScale(),
      audioScale: runtimeAudioAnalysisScale()
    },
    renderer: (typeof renderer !== 'undefined' && renderer && renderer.info) ? {
      geometries: renderer.info.memory && renderer.info.memory.geometries,
      textures: renderer.info.memory && renderer.info.memory.textures,
      calls: renderer.info.render && renderer.info.render.calls,
      triangles: renderer.info.render && renderer.info.render.triangles
    } : null,
    viewport: (typeof renderer !== 'undefined' && renderer && renderer.domElement) ? {
      width: innerWidth,
      height: innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      renderPixelRatio: renderer.getPixelRatio ? Number(renderer.getPixelRatio().toFixed(3)) : 0,
      canvasWidth: renderer.domElement.width || 0,
      canvasHeight: renderer.domElement.height || 0,
      renderPixels: (renderer.domElement.width || 0) * (renderer.domElement.height || 0),
      targetFps: (typeof getAdaptiveRenderFps === 'function') ? getAdaptiveRenderFps(now) : 0,
      displayHz: (typeof estimatedDisplayRefreshHz === 'function') ? Math.round(estimatedDisplayRefreshHz() * 10) / 10 : 0,
      adaptiveLoad: (typeof adaptiveFrameLoadSnapshot === 'function') ? adaptiveFrameLoadSnapshot() : null,
      foregroundFpsMode: (typeof normalizeForegroundFpsMode === 'function') ? normalizeForegroundFpsMode(fx && fx.foregroundFpsMode) : '',
      interactionBoost: (typeof isRenderInteractionActive === 'function') ? isRenderInteractionActive() : false,
      interactionReason: (typeof renderInteractionReason !== 'undefined') ? renderInteractionReason : ''
    } : null,
    frameGates: (typeof collectFrameGateSnapshot === 'function' && typeof mainFrameGates !== 'undefined')
      ? collectFrameGateSnapshot(mainFrameGates)
      : null,
    deepSleep: isDeepBackgroundMode(),
    probe: (window.__mineradioPerf && window.__mineradioPerf.summary)
      ? window.__mineradioPerf.summary()
      : null
  };
}
window.__mineradioPerfSnapshot = collectRuntimePerfSnapshot;

function requestBackgroundAppMemoryTrim(reason, delayMs) {
  if (!window.desktopWindow || typeof window.desktopWindow.trimAppMemory !== 'function') return;
  if (!isDeepBackgroundMode() || isLiveBackgroundKeepMode()) return;
  if (fx && fx.memoryAutoTrimApp === false) return;
  if (fx && fx.memoryAutoTrimOnBackground === false) return;
  var now = performance.now();
  if (backgroundAppMemoryTrimInFlight || now - runtimePerfState.lastAppMemoryTrimAt < 30000) return;
  if (backgroundAppMemoryTrimTimer) clearTimeout(backgroundAppMemoryTrimTimer);
  backgroundAppMemoryTrimTimer = setTimeout(function () {
    backgroundAppMemoryTrimTimer = 0;
    if (!isDeepBackgroundMode() || isLiveBackgroundKeepMode() || backgroundAppMemoryTrimInFlight) return;
    if (fx && fx.memoryAutoTrimApp === false) return;
    if (fx && fx.memoryAutoTrimOnBackground === false) return;
    if (fx && fx.memoryAutoSystemTrim && typeof configureMemoryReductFromFx === 'function') {
      configureMemoryReductFromFx('deep-background', true);
    }
    backgroundAppMemoryTrimInFlight = true;
    runtimePerfState.lastAppMemoryTrimAt = performance.now();
    runtimePerfState.lastAppMemoryTrimReason = reason || 'deep-background';
    window.desktopWindow.trimAppMemory({ reason: runtimePerfState.lastAppMemoryTrimReason }).then(function (result) {
      runtimePerfState.lastAppMemoryTrimResult = result || null;
    }).catch(function (error) {
      runtimePerfState.lastAppMemoryTrimResult = { ok: false, error: String(error && error.message || error || 'APP_MEMORY_TRIM_FAILED') };
    }).finally(function () {
      backgroundAppMemoryTrimInFlight = false;
    });
  }, Math.max(500, delayMs || 1800));
}

function trimRuntimeCaches(reason, aggressive) {
  var protectedCovers = collectProtectedCoverUrls();
  var protectedBeats = collectProtectedBeatMapKeys();
  var dropped = 0;
  dropped += trimObjectCache(playlistCoverCache, aggressive ? 72 : 180, protectedCovers, function (rec) {
    return rec && rec.loading;
  });
  dropped += trimCoverDepthCache(aggressive ? 4 : 10, collectProtectedCoverDepthIds());
  dropped += trimObjectCache(beatMapCache, aggressive ? 12 : 36, protectedBeats);
  dropped += trimObjectCache(djBeatMapCache, aggressive ? 4 : 12, protectedBeats);
  if (aggressive && typeof stageLyricTrackCache !== 'undefined' && stageLyricTrackCache) {
    stageLyricTrackCache = { key: '', entries: null, lineMap: null, start: 0, end: -1 };
  }
  if (aggressive && typeof renderer !== 'undefined' && renderer && renderer.renderLists && renderer.renderLists.dispose) {
    try { renderer.renderLists.dispose(); } catch (e) { }
  }
  runtimePerfState.lastCacheTrimAt = performance.now();
  runtimePerfState.cacheTrimCount += 1;
  runtimePerfState.lastCacheTrimReason = reason || (aggressive ? 'deep' : 'active');
  collectRuntimePerfSnapshot(runtimePerfState.lastCacheTrimAt);
  return dropped;
}
function trimVisualCachesForBackground() {
  if (!isDeepBackgroundMode()) return;
  trimRuntimeCaches('deep-background', true);
  requestBackgroundAppMemoryTrim('deep-background', isBackgroundReleaseMode() ? 900 : 1800);
}
function scheduleBackgroundCacheTrim() {
  if (!isDeepBackgroundMode()) return;
  if (backgroundCacheTrimTimer) clearTimeout(backgroundCacheTrimTimer);
  backgroundCacheTrimTimer = setTimeout(function () {
    backgroundCacheTrimTimer = 0;
    trimVisualCachesForBackground();
  }, 900);
}
function maybeTrimRuntimeCaches(now) {
  now = now || performance.now();
  var deep = isDeepBackgroundMode();
  var gap = deep ? (isBackgroundReleaseMode() ? 3600 : 7000) : 45000;
  if (!deep && now < 30000) return;
  if (now - runtimePerfState.lastCacheTrimAt < gap) return;
  trimRuntimeCaches(deep ? (isBackgroundReleaseMode() ? 'release-frame' : 'deep-frame') : 'active-frame', deep);
}
function applyRendererPowerMode() {
  if (typeof renderer === 'undefined' || !renderer) return;
  var deep = isDeepBackgroundMode();
  var width = deep ? 4 : Math.max(1, innerWidth);
  var height = deep ? 4 : Math.max(1, innerHeight);
  var pixelRatio = getRenderPixelRatio();
  var mode = deep ? 'sleep' : 'active';
  if (renderPowerState.mode === mode && renderPowerState.width === width && renderPowerState.height === height && Math.abs(renderPowerState.pixelRatio - pixelRatio) < 0.001) return;
  renderPowerState = { mode: mode, width: width, height: height, pixelRatio: pixelRatio };
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  if (typeof uniforms !== 'undefined' && uniforms && uniforms.uPixel) uniforms.uPixel.value = renderer.getPixelRatio();
  if (deep) {
    if (renderer.renderLists && renderer.renderLists.dispose) renderer.renderLists.dispose();
    scheduleBackgroundCacheTrim();
    requestBackgroundAppMemoryTrim('renderer-deep-sleep', isBackgroundReleaseMode() ? 900 : 2200);
  }
}
function updateDesktopRuntimeState(state) {
  state = state || {};
  var wasFullscreen = desktopRuntimeState.fullscreen;
  var wasDeep = isDeepBackgroundMode();
  desktopRuntimeState.desktop = !!window.desktopWindow;
  desktopRuntimeState.minimized = !!state.isMinimized;
  desktopRuntimeState.visible = state.isVisible !== false;
  desktopRuntimeState.focused = state.isFocused !== false;
  desktopRuntimeState.fullscreen = !!(state.isFullScreen || state.isNativeFullScreen || state.isHtmlFullScreen || state.isWindowFullScreen);
  desktopRuntimeState.embedded = state.isDesktopEmbedded === true;
  desktopRuntimeState.interactive = state.isDesktopInteractive === true;
  updateRenderPowerClasses();
  applyRendererPowerMode();
  if (typeof syncGestureControlHostVisibility === 'function') syncGestureControlHostVisibility('desktop-runtime-state');
  if ((desktopRuntimeState.minimized || !desktopRuntimeState.visible) && typeof flushLyricLayoutSave === 'function') {
    flushLyricLayoutSave();
  }
  if (fx && (fx.desktopLyrics || fx.wallpaperMode)) setTimeout(syncDesktopOverlayState, 0);
  if (wasDeep && !isDeepBackgroundMode()) recoverVisualsAfterBackground('desktop-runtime-state');
  if (desktopRuntimeState.fullscreen !== wasFullscreen) scheduleMainRendererViewportRefresh('desktop-runtime-state');
}
function installRenderPowerHooks() {
  updateRenderPowerClasses();
  if (window.desktopWindow && typeof window.desktopWindow.getGpuDiagnostics === 'function') {
    window.desktopWindow.getGpuDiagnostics().then(function (info) {
      runtimeGpuDiagnostics = info || null;
      runtimeGpuDiagnosticsError = '';
    }).catch(function (error) {
      runtimeGpuDiagnosticsError = String(error && error.message || error || 'GPU_DIAGNOSTICS_FAILED');
    });
  }
  document.addEventListener('visibilitychange', function () {
    updateRenderPowerClasses();
    applyRendererPowerMode();
    if (typeof syncGestureControlHostVisibility === 'function') syncGestureControlHostVisibility('visibilitychange');
    if (!isDeepBackgroundMode()) recoverVisualsAfterBackground('visibilitychange');
  });
  window.addEventListener('focus', function () {
    desktopRuntimeState.focused = true;
    updateRenderPowerClasses();
    applyRendererPowerMode();
    if (typeof syncGestureControlHostVisibility === 'function') syncGestureControlHostVisibility('focus');
    if (!isDeepBackgroundMode()) recoverVisualsAfterBackground('focus');
  });
  window.addEventListener('blur', function () {
    desktopRuntimeState.focused = false;
    updateRenderPowerClasses();
    applyRendererPowerMode();
  });
  if (window.desktopWindow && typeof window.desktopWindow.onStateChange === 'function') {
    window.desktopWindow.onStateChange(updateDesktopRuntimeState);
    if (typeof window.desktopWindow.getState === 'function') {
      window.desktopWindow.getState().then(updateDesktopRuntimeState).catch(function () { });
    }
  }
}

// ============================================================
//  Three.js 场景
