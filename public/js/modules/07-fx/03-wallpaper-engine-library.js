var WALLPAPER_ENGINE_SELECTION_STORE_KEY = 'mineradio-wallpaper-engine-selection-v1';
var WALLPAPER_ENGINE_HIDDEN_STORE_KEY = 'mineradio-wallpaper-engine-hidden-v1';
var WALLPAPER_ENGINE_FAVORITE_STORE_KEY = 'mineradio-wallpaper-engine-favorites-v1';
var wallpaperEngineProjects = [];
var wallpaperEngineLibrarySnapshot = null;
var wallpaperEngineMediaToken = '';
var wallpaperEngineLibraryBusy = false;
var wallpaperEngineLayerToken = 0;
var wallpaperEnginePreviewObserver = null;
var wallpaperEngineSearchRenderTimer = 0;
var wallpaperEnginePreviewScrollTimer = 0;
var wallpaperEngineSwitchTimer = 0;
var wallpaperEngineVideoRetryTimer = 0;
var wallpaperEngineFirstFrameWait = null;
var wallpaperEngineCaptureStream = null;
var wallpaperEnginePreparedCaptureStreams = new Map();
var wallpaperEngineGlassCaptureStream = null;
var wallpaperEnginePreparedGlassCaptureStreams = new Map();
var wallpaperEngineGlassCaptureToken = 0;
var wallpaperEngineGlassCaptureRetryTimer = 0;
var wallpaperEngineGlassCaptureRetryAttempt = 0;
var wallpaperEngineCaptureMode = '';
var wallpaperEngineNativeSessionId = '';
var wallpaperEngineHostBoundsRestartTimer = 0;
var wallpaperEngineHostBoundsUnsubscribe = null;
var wallpaperEngineHostBoundsPreparing = false;
var wallpaperEngineDesktopPreviewActive = false;
var wallpaperEngineDesktopPreviewUsesAsset = false;
var wallpaperEngineHostRecoveryInFlight = false;
var wallpaperEngineHostRecoveryAttempt = 0;
var wallpaperEngineHostRecoveryRetryTimer = 0;
var wallpaperEngineFreezeReleaseTimer = 0;
var wallpaperEngineFreezeGeneration = 0;
var wallpaperEngineFreezeVisible = false;
var wallpaperEngineCaptureViewportScaleX = 1;
var wallpaperEngineCaptureViewportScaleY = 1;
var wallpaperEnginePointerActivityTimer = 0;
var wallpaperEnginePointerActivityLastSentAt = 0;
var wallpaperEnginePointerActivityLatestX = 32768;
var wallpaperEnginePointerActivityLatestY = 32768;
var wallpaperEnginePointerActivityHasPoint = false;
var wallpaperEngineRenderLimit = 240;
var wallpaperEngineRuntimeError = '';
var wallpaperEngineProjectDetailsId = '';
var wallpaperEngineVisualSettingsTimer = 0;
var WALLPAPER_ENGINE_SWITCH_FADE_MS = 440;
var WALLPAPER_ENGINE_RENDER_BATCH = 240;
var WALLPAPER_ENGINE_PREPARED_STREAM_TTL_MS = 12000;
var WALLPAPER_ENGINE_FIRST_FRAME_TIMEOUT_MS = 8000;
var WALLPAPER_ENGINE_FREEZE_FADE_MS = 180;
var WALLPAPER_ENGINE_HOST_RECOVERY_MAX_ATTEMPTS = 3;
var WALLPAPER_ENGINE_POINTER_ACTIVITY_INTERVAL_MS = 8;

function cancelWallpaperEnginePointerActivity() {
  if (wallpaperEnginePointerActivityTimer) clearTimeout(wallpaperEnginePointerActivityTimer);
  wallpaperEnginePointerActivityTimer = 0;
  wallpaperEnginePointerActivityLastSentAt = 0;
}

function wallpaperEnginePointerActivityReady() {
  // A native WE source is briefly aligned over the Electron host while the
  // capture stream is prepared. Chromium can keep Page Visibility hidden
  // after that source is parked even though the real Mineradio window is
  // visible. Desktop sessions therefore trust the main-process window state;
  // browser fallback still resolves to document.hidden.
  if (!wallpaperEngineDesktopHostIsVisible()
    || wallpaperEngineHostBoundsPreparing
    || !wallpaperEngineSelection.active
    || wallpaperEngineSelection.kind !== 'engine'
    || !/^[a-f0-9]{24}$/i.test(String(wallpaperEngineNativeSessionId || ''))
    || !wallpaperEngineCaptureStream) return false;
  var layer = document.getElementById('wallpaper-engine-layer');
  return !!(layer && layer.classList.contains('engine-ready'));
}

function flushWallpaperEnginePointerActivity() {
  wallpaperEnginePointerActivityTimer = 0;
  if (!wallpaperEnginePointerActivityHasPoint || !wallpaperEnginePointerActivityReady()) return;
  var api = wallpaperEngineDesktopApi();
  if (!api || typeof api.reportWallpaperEnginePointerActivity !== 'function') return;
  wallpaperEnginePointerActivityLastSentAt = typeof performance !== 'undefined' && performance.now
    ? performance.now() : Date.now();
  try {
    api.reportWallpaperEnginePointerActivity({
      sessionId: String(wallpaperEngineNativeSessionId || ''),
      xUnit: wallpaperEnginePointerActivityLatestX,
      yUnit: wallpaperEnginePointerActivityLatestY
    });
  } catch (e) { }
}

function rememberWallpaperEnginePointerPosition(event) {
  if (!event || !Number.isFinite(Number(event.clientX)) || !Number.isFinite(Number(event.clientY))) return;
  var width = Math.max(1, Number(document.documentElement && document.documentElement.clientWidth) || Number(window.innerWidth) || 1);
  var height = Math.max(1, Number(document.documentElement && document.documentElement.clientHeight) || Number(window.innerHeight) || 1);
  var xRatio = Math.max(0, Math.min(1, Number(event.clientX) / Math.max(1, width - 1)));
  var yRatio = Math.max(0, Math.min(1, Number(event.clientY) / Math.max(1, height - 1)));
  wallpaperEnginePointerActivityLatestX = Math.round(xRatio * 65535);
  wallpaperEnginePointerActivityLatestY = Math.round(yRatio * 65535);
  wallpaperEnginePointerActivityHasPoint = true;
}

function queueWallpaperEnginePointerActivity(event) {
  rememberWallpaperEnginePointerPosition(event);
  if (!wallpaperEnginePointerActivityHasPoint || !wallpaperEnginePointerActivityReady() || wallpaperEnginePointerActivityTimer) return;
  var now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  var delay = Math.max(0, WALLPAPER_ENGINE_POINTER_ACTIVITY_INTERVAL_MS - Math.max(0, now - wallpaperEnginePointerActivityLastSentAt));
  wallpaperEnginePointerActivityTimer = setTimeout(flushWallpaperEnginePointerActivity, delay);
}

function cancelWallpaperEngineHostRecovery(resetAttempts) {
  if (wallpaperEngineHostRecoveryRetryTimer) clearTimeout(wallpaperEngineHostRecoveryRetryTimer);
  wallpaperEngineHostRecoveryRetryTimer = 0;
  wallpaperEngineHostRecoveryInFlight = false;
  if (resetAttempts !== false) wallpaperEngineHostRecoveryAttempt = 0;
}

function wallpaperEngineDesktopHostIsVisible() {
  if (!wallpaperEngineUsesDesktopHostLifecycle()) return !document.hidden;
  try {
    if (typeof desktopRuntimeState === 'object' && desktopRuntimeState) {
      return desktopRuntimeState.visible !== false && desktopRuntimeState.minimized !== true;
    }
  } catch (e) { }
  return true;
}

function readWallpaperEngineIdSet(key) {
  try {
    var raw = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set((Array.isArray(raw) ? raw : []).map(String).filter(function (id) { return /^[a-f0-9]{24}$/i.test(id); }));
  } catch (e) {
    return new Set();
  }
}

var hiddenWallpaperEngineIds = readWallpaperEngineIdSet(WALLPAPER_ENGINE_HIDDEN_STORE_KEY);
var favoriteWallpaperEngineIds = readWallpaperEngineIdSet(WALLPAPER_ENGINE_FAVORITE_STORE_KEY);

function saveWallpaperEngineIdSet(key, values) {
  try { localStorage.setItem(key, JSON.stringify(Array.from(values))); } catch (e) { }
}

function normalizeWallpaperEngineSelection(value) {
  value = value && typeof value === 'object' ? value : {};
  var id = String(value.id || '').replace(/[^a-f0-9]/gi, '').slice(0, 24);
  return {
    version: 1,
    active: value.active === true && id.length === 24,
    id: id,
    title: String(value.title || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160),
    kind: value.kind === 'engine' ? 'engine' : (value.kind === 'media' ? 'media' : 'preview'),
    mediaType: value.mediaType === 'video' ? 'video' : 'image',
    mediaAnimated: value.mediaAnimated === true,
    projectType: String(value.projectType || 'unknown').slice(0, 32),
    hasPreview: value.hasPreview === true,
    previewAnimated: value.previewAnimated === true,
    visualOpacity: Math.max(0.15, Math.min(1, Number(value.visualOpacity) || 1)),
    visualPositionX: Math.max(-0.5, Math.min(0.5, Number(value.visualPositionX) || 0)),
    visualPositionY: Math.max(-0.5, Math.min(0.5, Number(value.visualPositionY) || 0)),
    visualScale: Math.max(1, Math.min(1.6, Number(value.visualScale) || 1.08)),
    updatedAt: Math.max(0, Number(value.updatedAt) || 0)
  };
}

function readWallpaperEngineSelection() {
  try { return normalizeWallpaperEngineSelection(JSON.parse(localStorage.getItem(WALLPAPER_ENGINE_SELECTION_STORE_KEY) || '{}')); }
  catch (e) { return normalizeWallpaperEngineSelection({}); }
}

var wallpaperEngineSelection = readWallpaperEngineSelection();

function wallpaperEngineVisualSettings() {
  return {
    opacity: Math.max(0.15, Math.min(1, Number(wallpaperEngineSelection.visualOpacity) || 1)),
    positionX: Math.max(-0.5, Math.min(0.5, Number(wallpaperEngineSelection.visualPositionX) || 0)),
    positionY: Math.max(-0.5, Math.min(0.5, Number(wallpaperEngineSelection.visualPositionY) || 0)),
    scale: Math.max(1, Math.min(1.6, Number(wallpaperEngineSelection.visualScale) || 1.08))
  };
}

function syncWallpaperEngineVisualControls() {
  var settings = wallpaperEngineVisualSettings();
  var controls = [
    ['wallpaper-engine-opacity', settings.opacity, Math.round(settings.opacity * 100) + '%'],
    ['wallpaper-engine-position-x', settings.positionX * 100, Math.round(settings.positionX * 100) + '%'],
    ['wallpaper-engine-position-y', settings.positionY * 100, Math.round(settings.positionY * 100) + '%'],
    ['wallpaper-engine-scale', settings.scale, settings.scale.toFixed(2) + '×']
  ];
  controls.forEach(function (entry) {
    var input = document.getElementById(entry[0]);
    if (!input) return;
    input.value = String(entry[1]);
    var output = input.parentElement && input.parentElement.querySelector('output');
    if (output) output.textContent = entry[2];
  });
}

function flushWallpaperEngineVisualSettings() {
  wallpaperEngineVisualSettingsTimer = 0;
  var api = wallpaperEngineDesktopApi();
  var sessionId = String(wallpaperEngineNativeSessionId || '');
  if (!api || typeof api.updateWallpaperEngineVisualSettings !== 'function'
    || !/^[a-f0-9]{24}$/i.test(sessionId)) return;
  try { api.updateWallpaperEngineVisualSettings(Object.assign({ sessionId: sessionId }, wallpaperEngineVisualSettings())); }
  catch (e) { }
}

function applyWallpaperEngineVisualSettings(immediate) {
  var settings = wallpaperEngineVisualSettings();
  var layer = document.getElementById('wallpaper-engine-layer');
  if (layer) {
    layer.style.setProperty('--wallpaper-engine-visual-opacity', settings.opacity.toFixed(3));
    layer.style.setProperty('--wallpaper-engine-visual-position-x', (settings.positionX * 100).toFixed(2) + '%');
    layer.style.setProperty('--wallpaper-engine-visual-position-y', (settings.positionY * 100).toFixed(2) + '%');
    layer.style.setProperty('--wallpaper-engine-visual-scale', settings.scale.toFixed(3));
  }
  syncWallpaperEngineVisualControls();
  if (wallpaperEngineVisualSettingsTimer) clearTimeout(wallpaperEngineVisualSettingsTimer);
  if (immediate === true) flushWallpaperEngineVisualSettings();
  else wallpaperEngineVisualSettingsTimer = setTimeout(flushWallpaperEngineVisualSettings, 42);
}

function setWallpaperEngineVisualSetting(name, rawValue) {
  var value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  if (name === 'opacity') wallpaperEngineSelection.visualOpacity = Math.max(0.15, Math.min(1, value));
  else if (name === 'positionX') wallpaperEngineSelection.visualPositionX = Math.max(-0.5, Math.min(0.5, value / 100));
  else if (name === 'positionY') wallpaperEngineSelection.visualPositionY = Math.max(-0.5, Math.min(0.5, value / 100));
  else if (name === 'scale') wallpaperEngineSelection.visualScale = Math.max(1, Math.min(1.6, value));
  else return;
  saveWallpaperEngineSelection();
  applyWallpaperEngineVisualSettings(false);
}

function saveWallpaperEngineSelection() {
  try { localStorage.setItem(WALLPAPER_ENGINE_SELECTION_STORE_KEY, JSON.stringify(normalizeWallpaperEngineSelection(wallpaperEngineSelection))); }
  catch (e) { }
}

function wallpaperEngineDesktopApi() {
  try {
    if (typeof getDesktopWindowApi === 'function') return getDesktopWindowApi();
    return window.desktopWindow || null;
  } catch (e) {
    return null;
  }
}

function wallpaperEngineUsesDesktopHostLifecycle() {
  var api = wallpaperEngineDesktopApi();
  return !!(api && typeof api.onWallpaperEngineHostBoundsChanged === 'function');
}

function wallpaperEngineNativeHostUnavailable() {
  return wallpaperEngineHostBoundsPreparing
    || (!wallpaperEngineUsesDesktopHostLifecycle() && document.hidden);
}

function normalizeWallpaperEngineProject(item) {
  item = item && typeof item === 'object' ? item : {};
  var id = String(item.id || '').replace(/[^a-f0-9]/gi, '').slice(0, 24);
  if (id.length !== 24) return null;
  var projectType = String(item.projectType || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'unknown';
  var mediaType = item.mediaType === 'video' ? 'video' : (item.mediaType === 'image' ? 'image' : '');
  return {
    id: id,
    title: String(item.title || 'Wallpaper Engine').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Wallpaper Engine',
    projectType: projectType,
    mediaType: mediaType,
    mediaAnimated: item.mediaAnimated === true,
    playable: item.playable === true && !!mediaType,
    enginePlayable: item.enginePlayable === true && projectType === 'scene',
    previewOnly: item.previewOnly === true || (item.playable !== true && item.enginePlayable !== true),
    hasPreview: item.hasPreview === true,
    previewAnimated: item.previewAnimated === true,
    source: String(item.source || '').slice(0, 32),
    sourceLabel: String(item.sourceLabel || '本地项目').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80),
    workshopId: String(item.workshopId || '').replace(/\D/g, '').slice(0, 32),
    propertyCount: Math.max(0, Math.min(256, Number(item.propertyCount) || 0)),
    audioPropertyCount: Math.max(0, Math.min(256, Number(item.audioPropertyCount) || 0)),
    mutedAudioPropertyCount: Math.max(0, Math.min(256, Number(item.mutedAudioPropertyCount) || 0)),
    updatedAt: Math.max(0, Number(item.updatedAt) || 0),
    safetyMode: item.safetyMode === 'native-engine' ? 'native-engine' : (item.safetyMode === 'direct-media' ? 'direct-media' : 'preview-only')
  };
}

function wallpaperEngineProjectById(id) {
  id = String(id || '');
  for (var i = 0; i < wallpaperEngineProjects.length; i++) {
    if (wallpaperEngineProjects[i].id === id) return wallpaperEngineProjects[i];
  }
  return null;
}

function wallpaperEngineMediaUrl(item, kind) {
  item = item || {};
  kind = kind === 'media' ? 'media' : 'preview';
  return 'mineradio-wallpaper://' + kind + '/' + encodeURIComponent(item.id || '') + '?v=' + encodeURIComponent(String(item.updatedAt || 0)) + '&token=' + encodeURIComponent(wallpaperEngineMediaToken);
}

function wallpaperEngineProjectLabel(item) {
  item = item || {};
  if (item.playable && item.mediaType === 'video') return 'Video · 动态播放';
  if (item.playable && item.mediaType === 'image') return '图片 · 原图显示';
  if (item.projectType === 'scene' && item.enginePlayable) return 'Scene · Wallpaper Engine 原生实时运行';
  if (item.projectType === 'scene') return 'Scene · 预览（未找到有效 PKGV 场景包）';
  if (item.projectType === 'web') return 'Web · 安全预览（未执行 HTML）';
  if (item.projectType === 'application') return 'Application · 安全预览（未运行程序）';
  return '本地项目 · 安全预览';
}

function updateWallpaperEngineEntryUi(message) {
  var value = document.getElementById('wallpaper-engine-value');
  var restore = document.getElementById('wallpaper-engine-restore-btn');
  var active = !!wallpaperEngineSelection.active;
  if (value) {
    if (message) value.textContent = message;
    else if (active && wallpaperEngineRuntimeError) value.textContent = wallpaperEngineRuntimeError + ' · 已显示原背景';
    else if (active && wallpaperEngineSelection.kind === 'engine' && wallpaperEngineDesktopPreviewActive) {
      value.textContent = (wallpaperEngineSelection.title || '已选择')
        + (wallpaperEngineDesktopPreviewUsesAsset ? ' · 桌面被动模式 · 项目预览' : ' · 桌面被动模式 · 原背景');
    }
    else if (active && wallpaperEngineSelection.kind === 'engine') value.textContent = (wallpaperEngineSelection.title || '已选择') + ' · WE 引擎实时运行';
    else if (active) value.textContent = (wallpaperEngineSelection.title || '已选择') + ' · 原背景保留';
    else value.textContent = '未启用 · 原背景保留';
  }
  if (restore) restore.disabled = !active;
}

function cancelWallpaperEngineSwitchTimer() {
  if (wallpaperEngineSwitchTimer) clearTimeout(wallpaperEngineSwitchTimer);
  wallpaperEngineSwitchTimer = 0;
}

function cancelWallpaperEngineVideoRetry() {
  if (wallpaperEngineVideoRetryTimer) clearTimeout(wallpaperEngineVideoRetryTimer);
  wallpaperEngineVideoRetryTimer = 0;
}

function cancelWallpaperEngineFirstFrameWait() {
  var wait = wallpaperEngineFirstFrameWait;
  wallpaperEngineFirstFrameWait = null;
  if (!wait) return;
  if (wait.timer) clearTimeout(wait.timer);
  if (wait.video && wait.callbackId && typeof wait.video.cancelVideoFrameCallback === 'function') {
    try { wait.video.cancelVideoFrameCallback(wait.callbackId); } catch (e) { }
  }
  if (wait.video && wait.loadedDataHandler) {
    try { wait.video.removeEventListener('loadeddata', wait.loadedDataHandler); } catch (e2) { }
  }
  if (wait.raf1 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(wait.raf1);
  if (wait.raf2 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(wait.raf2);
}

function resetWallpaperEngineCaptureViewport(video) {
  wallpaperEngineCaptureViewportScaleX = 1;
  wallpaperEngineCaptureViewportScaleY = 1;
  video = video || document.getElementById('wallpaper-engine-video');
  if (video) {
    video.style.removeProperty('transform');
    video.style.removeProperty('transform-origin');
  }
  var layer = document.getElementById('wallpaper-engine-layer');
  if (layer) {
    delete layer.dataset.captureScaleX;
    delete layer.dataset.captureScaleY;
  }
}

function wallpaperEngineCaptureContentSize(runtime) {
  runtime = runtime && typeof runtime === 'object' ? runtime : {};
  var host = runtime.hostWindowRect && typeof runtime.hostWindowRect === 'object'
    ? runtime.hostWindowRect
    : null;
  var width = host ? Math.abs((Number(host.right) || 0) - (Number(host.left) || 0)) : 0;
  var height = host ? Math.abs((Number(host.bottom) || 0) - (Number(host.top) || 0)) : 0;
  if (!(width > 0)) width = Number(runtime.sourceWindowVisibleWidth) || 0;
  if (!(height > 0)) height = Number(runtime.sourceWindowVisibleHeight) || 0;
  return { width: width, height: height };
}

function calibrateWallpaperEngineCaptureViewport(video, runtime) {
  if (!video || !runtime || runtime.sourceWindowAligned !== true) {
    resetWallpaperEngineCaptureViewport(video);
    return { scaleX: 1, scaleY: 1 };
  }
  var content = wallpaperEngineCaptureContentSize(runtime);
  var frameWidth = Number(video.videoWidth) || Number(runtime.width) || 0;
  var frameHeight = Number(video.videoHeight) || Number(runtime.height) || 0;
  var rawScaleX = content.width > 0 ? frameWidth / content.width : 1;
  var rawScaleY = content.height > 0 ? frameHeight / content.height : 1;
  var scaleX = rawScaleX > 1.015 && rawScaleX < 4.01 ? rawScaleX : 1;
  var scaleY = rawScaleY > 1.015 && rawScaleY < 4.01 ? rawScaleY : 1;
  // Wallpaper Engine's play-in-window surface is reported in Windows DIPs,
  // while desktopCapturer exposes a physical-pixel frame on scaled displays.
  // Crop the padded right/bottom portion by enlarging only the captured layer.
  if (scaleX !== 1 && scaleY !== 1 && Math.abs(scaleX - scaleY) <= 0.035) {
    var uniformScale = (scaleX + scaleY) / 2;
    scaleX = uniformScale;
    scaleY = uniformScale;
  }
  wallpaperEngineCaptureViewportScaleX = scaleX;
  wallpaperEngineCaptureViewportScaleY = scaleY;
  video.style.transformOrigin = '0 0';
  video.style.transform = (scaleX === 1 && scaleY === 1)
    ? ''
    : 'scale3d(' + scaleX.toFixed(6) + ',' + scaleY.toFixed(6) + ',1)';
  var layer = document.getElementById('wallpaper-engine-layer');
  if (layer) {
    layer.dataset.captureScaleX = scaleX.toFixed(6);
    layer.dataset.captureScaleY = scaleY.toFixed(6);
  }
  return { scaleX: scaleX, scaleY: scaleY };
}

function captureWallpaperEngineFreezeFrame() {
  var layer = document.getElementById('wallpaper-engine-layer');
  var canvas = document.getElementById('wallpaper-engine-freeze');
  var video = document.getElementById('wallpaper-engine-video');
  if (!layer || !canvas || !video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return false;
  if (wallpaperEngineFreezeReleaseTimer) clearTimeout(wallpaperEngineFreezeReleaseTimer);
  wallpaperEngineFreezeReleaseTimer = 0;
  ++wallpaperEngineFreezeGeneration;
  try {
    var freezeScale = Math.min(1, 3840 / Math.max(1, video.videoWidth), 2160 / Math.max(1, video.videoHeight));
    var width = Math.max(1, Math.round(video.videoWidth * freezeScale));
    var height = Math.max(1, Math.round(video.videoHeight * freezeScale));
    var sourceWidth = Math.max(1, Math.min(video.videoWidth, Math.round(video.videoWidth / Math.max(1, wallpaperEngineCaptureViewportScaleX))));
    var sourceHeight = Math.max(1, Math.min(video.videoHeight, Math.round(video.videoHeight / Math.max(1, wallpaperEngineCaptureViewportScaleY))));
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d');
    if (!context) return false;
    context.globalCompositeOperation = 'copy';
    context.drawImage(video, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
  } catch (error) {
    return false;
  }
  wallpaperEngineFreezeVisible = true;
  layer.classList.add('ready', 'video-ready', 'engine-ready', 'freeze-ready');
  document.body.classList.add('wallpaper-engine-active');
  return true;
}

function clearWallpaperEngineFreezeFrame(immediate) {
  var layer = document.getElementById('wallpaper-engine-layer');
  var canvas = document.getElementById('wallpaper-engine-freeze');
  if (wallpaperEngineFreezeReleaseTimer) clearTimeout(wallpaperEngineFreezeReleaseTimer);
  wallpaperEngineFreezeReleaseTimer = 0;
  var generation = ++wallpaperEngineFreezeGeneration;
  wallpaperEngineFreezeVisible = false;
  if (layer) layer.classList.remove('freeze-ready');
  function releaseCanvas() {
    if (generation !== wallpaperEngineFreezeGeneration || wallpaperEngineFreezeVisible || !canvas) return;
    canvas.width = 1;
    canvas.height = 1;
  }
  if (immediate) releaseCanvas();
  else wallpaperEngineFreezeReleaseTimer = setTimeout(function () {
    wallpaperEngineFreezeReleaseTimer = 0;
    releaseCanvas();
  }, WALLPAPER_ENGINE_FREEZE_FADE_MS + 30);
}

function stopWallpaperEngineMediaStream(stream) {
  if (!stream || !stream.getTracks) return;
  stream.getTracks().forEach(function (track) {
    try { track.stop(); } catch (e) { }
  });
}

function stopWallpaperEnginePreparedCaptureStreams(sessionId) {
  var expected = String(sessionId || '');
  wallpaperEnginePreparedCaptureStreams.forEach(function (entry, id) {
    if (expected && id !== expected) return;
    if (entry && entry.timer) clearTimeout(entry.timer);
    stopWallpaperEngineMediaStream(entry && entry.stream);
    wallpaperEnginePreparedCaptureStreams.delete(id);
  });
}

function stopWallpaperEnginePreparedGlassCaptureStreams(sessionId) {
  var expected = String(sessionId || '');
  wallpaperEnginePreparedGlassCaptureStreams.forEach(function (entry, id) {
    if (expected && id !== expected) return;
    if (entry && entry.timer) clearTimeout(entry.timer);
    stopWallpaperEngineMediaStream(entry && entry.stream);
    wallpaperEnginePreparedGlassCaptureStreams.delete(id);
  });
}

function storeWallpaperEnginePreparedCaptureStream(sessionId, stream) {
  sessionId = String(sessionId || '');
  stopWallpaperEnginePreparedCaptureStreams(sessionId);
  var entry = { stream: stream, timer: 0 };
  entry.timer = setTimeout(function () {
    if (wallpaperEnginePreparedCaptureStreams.get(sessionId) !== entry) return;
    wallpaperEnginePreparedCaptureStreams.delete(sessionId);
    stopWallpaperEngineMediaStream(stream);
  }, WALLPAPER_ENGINE_PREPARED_STREAM_TTL_MS);
  wallpaperEnginePreparedCaptureStreams.set(sessionId, entry);
}

function takeWallpaperEnginePreparedCaptureStream(sessionId) {
  sessionId = String(sessionId || '');
  var entry = wallpaperEnginePreparedCaptureStreams.get(sessionId);
  if (!entry) return null;
  wallpaperEnginePreparedCaptureStreams.delete(sessionId);
  if (entry.timer) clearTimeout(entry.timer);
  return entry.stream || null;
}

function storeWallpaperEnginePreparedGlassCaptureStream(sessionId, stream) {
  sessionId = String(sessionId || '');
  stopWallpaperEnginePreparedGlassCaptureStreams(sessionId);
  var entry = { stream: stream, timer: 0 };
  entry.timer = setTimeout(function () {
    if (wallpaperEnginePreparedGlassCaptureStreams.get(sessionId) !== entry) return;
    wallpaperEnginePreparedGlassCaptureStreams.delete(sessionId);
    stopWallpaperEngineMediaStream(stream);
  }, WALLPAPER_ENGINE_PREPARED_STREAM_TTL_MS);
  wallpaperEnginePreparedGlassCaptureStreams.set(sessionId, entry);
}

function takeWallpaperEnginePreparedGlassCaptureStream(sessionId) {
  sessionId = String(sessionId || '');
  var entry = wallpaperEnginePreparedGlassCaptureStreams.get(sessionId);
  if (!entry) return null;
  wallpaperEnginePreparedGlassCaptureStreams.delete(sessionId);
  if (entry.timer) clearTimeout(entry.timer);
  return entry.stream || null;
}

function stopWallpaperEngineGlassCaptureStream(keepPreparedStreams) {
  ++wallpaperEngineGlassCaptureToken;
  if (wallpaperEngineGlassCaptureRetryTimer) clearTimeout(wallpaperEngineGlassCaptureRetryTimer);
  wallpaperEngineGlassCaptureRetryTimer = 0;
  wallpaperEngineGlassCaptureRetryAttempt = 0;
  if (!keepPreparedStreams) stopWallpaperEnginePreparedGlassCaptureStreams();
  var stream = wallpaperEngineGlassCaptureStream;
  wallpaperEngineGlassCaptureStream = null;
  stopWallpaperEngineMediaStream(stream);
  var video = document.getElementById('wallpaper-engine-glass-sampler-video');
  if (video) {
    video.onloadeddata = null;
    video.onerror = null;
    try { video.pause(); } catch (e) { }
    if (video.srcObject) {
      try { video.srcObject = null; } catch (e2) { }
    }
  }
  document.body.classList.remove('wallpaper-engine-glass-sampler-ready');
}

function stopWallpaperEngineCaptureStream(keepPreparedStreams) {
  cancelWallpaperEngineFirstFrameWait();
  cancelWallpaperEnginePointerActivity();
  if (!keepPreparedStreams) stopWallpaperEnginePreparedCaptureStreams();
  var stream = wallpaperEngineCaptureStream;
  wallpaperEngineCaptureStream = null;
  wallpaperEngineCaptureMode = '';
  stopWallpaperEngineMediaStream(stream);
  stopWallpaperEngineGlassCaptureStream(keepPreparedStreams);
  var video = document.getElementById('wallpaper-engine-video');
  resetWallpaperEngineCaptureViewport(video);
  if (video && video.srcObject) {
    try { video.srcObject = null; } catch (e2) { }
  }
}

async function hardenWallpaperEngineCaptureStream(stream) {
  if (!stream) return stream;
  var audioTracks = stream.getAudioTracks ? stream.getAudioTracks() : [];
  audioTracks.forEach(function (track) {
    try { if (stream.removeTrack) stream.removeTrack(track); } catch (e) { }
    try { track.stop(); } catch (e2) { }
  });
  var tracks = stream.getVideoTracks ? stream.getVideoTracks() : [];
  var cursorResults = await Promise.all(tracks.map(function (track) {
    if (!track || typeof track.applyConstraints !== 'function') return Promise.resolve(false);
    return Promise.resolve(track.applyConstraints({ cursor: 'never' })).then(function () {
      try {
        var settings = typeof track.getSettings === 'function' ? track.getSettings() : null;
        // Chromium's legacy chromeMediaSource path can resolve applyConstraints
        // while silently omitting the cursor setting and continuing to bake a
        // delayed software pointer into the captured frame. Only an explicit
        // `never` acknowledgement counts as verified suppression.
        if (!settings || settings.cursor !== 'never') return false;
      } catch (e3) { return false; }
      return true;
    }).catch(function () { return false; });
  }));
  try {
    stream.__mineradioCursorSuppressed = !!tracks.length && cursorResults.every(function (value) { return value === true; });
  } catch (e4) { }
  return stream;
}

function wallpaperEngineCaptureFpsPreference() {
  var mode = typeof normalizeForegroundFpsMode === 'function'
    ? normalizeForegroundFpsMode(fx && fx.foregroundFpsMode)
    : 'vsync';
  var fixed = typeof foregroundFixedFpsForMode === 'function'
    ? foregroundFixedFpsForMode(mode)
    : (/^(45|60|75|90|120)$/.test(String(mode)) ? Number(mode) : 0);
  return Number(fixed) > 0 ? Math.max(24, Math.min(240, Math.round(Number(fixed)))) : 0;
}

function wallpaperEngineResolvedCaptureFps(value) {
  var fps = Number(value);
  if (!(fps > 0)) {
    fps = typeof estimatedDisplayRefreshHz === 'function' ? estimatedDisplayRefreshHz() : 60;
  }
  return Math.max(24, Math.min(240, Math.round(Number(fps) || 60)));
}

function wallpaperEngineRuntimeCaptureFps() {
  var preferred = wallpaperEngineCaptureFpsPreference();
  return preferred > 0 ? preferred : wallpaperEngineResolvedCaptureFps(0);
}

async function syncWallpaperEngineCaptureFrameRate() {
  var stream = wallpaperEngineCaptureStream;
  var track = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
  if (!track || typeof track.applyConstraints !== 'function') return { ok: false, skipped: true };
  var target = wallpaperEngineRuntimeCaptureFps();
  try {
    var capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : null;
    var range = capabilities && capabilities.frameRate;
    if (range && Number(range.min) > 0) target = Math.max(Number(range.min), target);
    if (range && Number(range.max) > 0) target = Math.min(Number(range.max), target);
  } catch (e) { }
  try {
    await track.applyConstraints({ frameRate: { ideal: target, max: target } });
    try { track.contentHint = 'motion'; } catch (e2) { }
    return { ok: true, fps: target };
  } catch (error) {
    return { ok: false, error: String(error && (error.message || error.name) || error || 'FRAME_RATE_CONSTRAINT_FAILED').slice(0, 240) };
  }
}

window.__mineradioSyncWallpaperEngineCaptureFrameRate = syncWallpaperEngineCaptureFrameRate;

function stopWallpaperEngineNativeSession(sessionId) {
  var api = wallpaperEngineDesktopApi();
  var stopAll = arguments.length === 0;
  var expected = String(sessionId || wallpaperEngineNativeSessionId || '');
  if (stopAll || !sessionId || expected === wallpaperEngineNativeSessionId) wallpaperEngineNativeSessionId = '';
  if (!api || typeof api.stopWallpaperEngineScene !== 'function') return Promise.resolve({ ok: true });
  return Promise.resolve(api.stopWallpaperEngineScene({ sessionId: expected, all: stopAll })).catch(function () {
    return { ok: false };
  });
}

async function openWallpaperEngineCaptureStream(sessionId, fps, sourceId, options) {
  if (!navigator.mediaDevices || !/^[a-f0-9]{24}$/i.test(String(sessionId || ''))) {
    throw new Error('WALLPAPER_CAPTURE_UNSUPPORTED');
  }
  options = options && typeof options === 'object' ? options : {};
  sourceId = String(sourceId || '');
  var maxFrameRate = wallpaperEngineResolvedCaptureFps(fps);
  var diagnostics = {
    sessionId: String(sessionId || ''),
    sourceId: sourceId,
    maxFrameRate: maxFrameRate,
    attempts: [],
    selectedPath: '',
    purpose: options.purpose === 'dwm-glass' ? 'dwm-glass' : 'scene',
    sourceIdOnly: options.sourceIdOnly === true,
    trustedCursorFreeSurface: options.trustedCursorFreeSurface === true
  };
  try {
    if (diagnostics.purpose === 'dwm-glass') window.__mineradioWallpaperEngineGlassCaptureDiagnostics = diagnostics;
    else window.__mineradioWallpaperEngineCaptureDiagnostics = diagnostics;
  } catch (e) { }
  function recordAttempt(path, stream, error) {
    var track = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
    var entry = {
      path: path,
      ok: !!track,
      cursorSuppressed: !!(stream && stream.__mineradioCursorSuppressed),
      settings: null,
      constraints: null,
      error: error ? String(error && (error.message || error.name) || error).slice(0, 500) : ''
    };
    try { entry.settings = track && typeof track.getSettings === 'function' ? track.getSettings() : null; } catch (e2) { }
    try { entry.constraints = track && typeof track.getConstraints === 'function' ? track.getConstraints() : null; } catch (e3) { }
    diagnostics.attempts.push(entry);
    return entry;
  }
  // The exact desktop-source path is the only built-in Chromium route that may
  // omit the captured cursor while keeping the real WE window under the host.
  // Use it only when the video track explicitly acknowledges cursor: never.
  // A resolved request without that acknowledgement is stopped immediately.
  var sourceError = null;
  if (/^window:\d+:\d+$/.test(sourceId) && typeof navigator.mediaDevices.getUserMedia === 'function') {
    try {
      var sourceStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          cursor: { exact: 'never' },
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxFrameRate: maxFrameRate
          }
        }
      });
      if (sourceStream && sourceStream.getVideoTracks && sourceStream.getVideoTracks().length) {
        var hardenedSourceStream = await hardenWallpaperEngineCaptureStream(sourceStream);
        try { hardenedSourceStream.__mineradioCapturePath = 'source-id-media'; } catch (e4) { }
        var sourceAttempt = recordAttempt('source-id-media', hardenedSourceStream, null);
        if (sourceAttempt.cursorSuppressed || options.trustedCursorFreeSurface === true
          || window.__mineradioAllowUnverifiedSourceCapture === true) {
          try { hardenedSourceStream.__mineradioUnverifiedCursorCapture = !sourceAttempt.cursorSuppressed; } catch (e5) { }
          diagnostics.selectedPath = 'source-id-media';
          return hardenedSourceStream;
        }
        stopWallpaperEngineMediaStream(hardenedSourceStream);
        sourceError = new Error('WALLPAPER_CAPTURE_CURSOR_SUPPRESSION_UNVERIFIED');
      } else {
        stopWallpaperEngineMediaStream(sourceStream);
        throw new Error('WALLPAPER_CAPTURE_STREAM_EMPTY');
      }
    } catch (error) {
      sourceError = error;
      recordAttempt('source-id-media', null, error);
    }
  }
  var displayError = null;
  if (options.sourceIdOnly === true) {
    displayError = new Error('DISPLAY_MEDIA_FALLBACK_DISABLED');
    recordAttempt('display-media-disabled', null, displayError);
  }
  // Electron still grants only the exact WE source here. On current Chromium,
  // getDisplayMedia can report cursor: always even when never was requested;
  // retain it as the visual compatibility fallback and record that fact rather
  // than treating the requested constraint as proof of cursor suppression.
  if (options.sourceIdOnly !== true && typeof navigator.mediaDevices.getDisplayMedia === 'function') {
    try {
      var displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: { frameRate: { ideal: maxFrameRate, max: maxFrameRate }, displaySurface: 'window', cursor: 'never' }
      });
      if (displayStream && displayStream.getVideoTracks && displayStream.getVideoTracks().length) {
        var hardenedDisplayStream = await hardenWallpaperEngineCaptureStream(displayStream);
        try { hardenedDisplayStream.__mineradioCapturePath = 'display-media'; } catch (e6) { }
        recordAttempt('display-media', hardenedDisplayStream, null);
        diagnostics.selectedPath = 'display-media';
        return hardenedDisplayStream;
      }
      stopWallpaperEngineMediaStream(displayStream);
      throw new Error('WALLPAPER_CAPTURE_STREAM_EMPTY');
    } catch (error) {
      displayError = error;
      recordAttempt('display-media', null, error);
    }
  }
  var displayName = String(displayError && displayError.name || 'Error');
  var displayMessage = String(displayError && displayError.message || displayError || 'display-media unavailable');
  var sourceMessage = String(sourceError && (sourceError.message || sourceError.name) || 'source-id-media unavailable');
  throw new Error('WALLPAPER_CAPTURE_FAILED: ' + displayName + ': ' + displayMessage + ' (source: ' + sourceMessage + ')');
}

window.__mineradioPrepareWallpaperEngineCapture = async function (sessionId, fps, sourceId) {
  sessionId = String(sessionId || '');
  if (!/^[a-f0-9]{24}$/i.test(sessionId)) return { ok: false, error: 'WALLPAPER_ENGINE_SESSION_INVALID' };
  try {
    var stream = await openWallpaperEngineCaptureStream(sessionId, fps, sourceId, {
      sourceIdOnly: true,
      purpose: 'scene'
    });
    storeWallpaperEnginePreparedCaptureStream(sessionId, stream);
    return { ok: true };
  } catch (error) {
    stopWallpaperEnginePreparedCaptureStreams(sessionId);
    return {
      ok: false,
      error: String(error && (error.message || error.name) || error || 'WALLPAPER_CAPTURE_PREPARE_FAILED').slice(0, 500)
    };
  }
};

window.__mineradioPrepareWallpaperEngineGlassCapture = async function (sessionId, fps, sourceId) {
  sessionId = String(sessionId || '');
  if (!/^[a-f0-9]{24}$/i.test(sessionId)) return { ok: false, error: 'WALLPAPER_ENGINE_SESSION_INVALID' };
  try {
    var stream = await openWallpaperEngineCaptureStream(sessionId, fps, sourceId, {
      sourceIdOnly: true,
      purpose: 'dwm-glass',
      // The exact granted source is the helper's own DWM thumbnail surface.
      // It has no cursor-rendering path, so a Chromium track reporting
      // `cursor: always` cannot bake the user's Windows cursor into its pixels.
      trustedCursorFreeSurface: true
    });
    storeWallpaperEnginePreparedGlassCaptureStream(sessionId, stream);
    return { ok: true };
  } catch (error) {
    stopWallpaperEnginePreparedGlassCaptureStreams(sessionId);
    return {
      ok: false,
      error: String(error && (error.message || error.name) || error || 'WALLPAPER_GLASS_CAPTURE_PREPARE_FAILED').slice(0, 500)
    };
  }
};

window.__mineradioPrepareWallpaperEngineHostBoundsChange = function (sessionId, reason) {
  sessionId = String(sessionId || '');
  reason = String(reason || '').slice(0, 80);
  if (!wallpaperEngineSelection.active || wallpaperEngineSelection.kind !== 'engine') {
    return { ok: true, frozen: false, skipped: true };
  }
  // A Promise.race timeout in main cannot cancel executeJavaScript. Requiring an
  // exact live session here makes a late ACK harmless after a switch/restart.
  if (sessionId && sessionId !== wallpaperEngineNativeSessionId) {
    return { ok: false, frozen: false, error: 'WALLPAPER_ENGINE_SESSION_MISMATCH' };
  }
  var suspendingHost = /(?:^|[-_])(hidden|hide|minimize|minimized|tray|document-hidden)(?:$|[-_])/i.test(reason)
    || /^(hidden|hide|minimize|minimized|tray|document-hidden)$/i.test(reason);
  if (suspendingHost) {
    cancelWallpaperEngineHostRecovery(true);
    wallpaperEngineHostBoundsPreparing = true;
    cancelWallpaperEngineSwitchTimer();
    cancelWallpaperEngineVideoRetry();
    cancelWallpaperEngineFirstFrameWait();
    if (wallpaperEngineHostBoundsRestartTimer) {
      clearTimeout(wallpaperEngineHostBoundsRestartTimer);
      wallpaperEngineHostBoundsRestartTimer = 0;
    }
    ++wallpaperEngineLayerToken;
    wallpaperEngineNativeSessionId = '';
    wallpaperEngineCaptureMode = '';
    restoreOriginalBackgroundAfterWallpaperEngine();
    clearWallpaperEngineFreezeFrame(true);
    clearWallpaperEngineLayerMedia(0);
    return { ok: true, frozen: false, suspended: true, reason: reason };
  }
  if (wallpaperEngineHostBoundsPreparing) {
    return {
      ok: wallpaperEngineFreezeVisible === true,
      frozen: wallpaperEngineFreezeVisible === true,
      error: wallpaperEngineFreezeVisible ? '' : 'WALLPAPER_BOUNDS_FREEZE_UNAVAILABLE'
    };
  }
  var frozen = captureWallpaperEngineFreezeFrame();
  // Keep the current capture and native source alive when no real frame could
  // be copied. Stopping here would recreate the black gap we are avoiding.
  if (!frozen) {
    return { ok: false, frozen: false, error: 'WALLPAPER_BOUNDS_FREEZE_UNAVAILABLE' };
  }
  wallpaperEngineHostBoundsPreparing = true;
  // The OS hardware cursor remains authoritative while native title-bar
  // dragging pauses renderer events.
  cancelWallpaperEngineSwitchTimer();
  cancelWallpaperEngineVideoRetry();
  cancelWallpaperEngineFirstFrameWait();
  if (wallpaperEngineHostBoundsRestartTimer) {
    clearTimeout(wallpaperEngineHostBoundsRestartTimer);
    wallpaperEngineHostBoundsRestartTimer = 0;
  }
  ++wallpaperEngineLayerToken;
  stopWallpaperEngineCaptureStream();
  wallpaperEngineNativeSessionId = '';
  wallpaperEngineCaptureMode = '';
  return { ok: true, frozen: true, reason: reason };
};

window.__mineradioPrepareWallpaperEngineDesktopPreview = function (sessionId, reason) {
  sessionId = String(sessionId || '');
  reason = String(reason || 'full-desktop-passive').slice(0, 80);
  if (!wallpaperEngineSelection.active || wallpaperEngineSelection.kind !== 'engine') {
    return Promise.resolve({ ok: true, preview: false, selectedEngine: false, skipped: true });
  }
  if (sessionId && sessionId !== String(wallpaperEngineNativeSessionId || '')) {
    return Promise.resolve({
      ok: false,
      preview: false,
      selectedEngine: true,
      error: 'WALLPAPER_ENGINE_SESSION_MISMATCH'
    });
  }

  var item = wallpaperEngineProjectById(wallpaperEngineSelection.id);
  wallpaperEngineDesktopPreviewActive = true;
  wallpaperEngineDesktopPreviewUsesAsset = false;
  cancelWallpaperEngineHostRecovery(true);
  wallpaperEngineHostBoundsPreparing = true;
  cancelWallpaperEngineSwitchTimer();
  cancelWallpaperEngineVideoRetry();
  cancelWallpaperEngineFirstFrameWait();
  if (wallpaperEngineHostBoundsRestartTimer) {
    clearTimeout(wallpaperEngineHostBoundsRestartTimer);
    wallpaperEngineHostBoundsRestartTimer = 0;
  }
  var token = ++wallpaperEngineLayerToken;
  stopWallpaperEngineCaptureStream();
  wallpaperEngineNativeSessionId = '';
  wallpaperEngineCaptureMode = '';
  restoreOriginalBackgroundAfterWallpaperEngine();
  clearWallpaperEngineFreezeFrame(true);
  clearWallpaperEngineLayerMedia(0);

  if (!item || !item.hasPreview) {
    updateWallpaperEngineEntryUi('桌面被动模式 · 已显示原背景');
    return Promise.resolve({
      ok: true,
      preview: false,
      selectedEngine: true,
      fallback: true,
      reason: reason
    });
  }

  var layer = document.getElementById('wallpaper-engine-layer');
  var image = document.getElementById('wallpaper-engine-image');
  if (!layer || !image) {
    updateWallpaperEngineEntryUi('桌面被动模式 · 已显示原背景');
    return Promise.resolve({
      ok: true,
      preview: false,
      selectedEngine: true,
      fallback: true,
      reason: reason
    });
  }

  updateWallpaperEngineEntryUi('正在准备桌面壁纸预览…');
  return new Promise(function (resolve) {
    var settled = false;
    var timer = 0;
    function finish(result) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      timer = 0;
      image.onload = null;
      image.onerror = null;
      resolve(result);
    }
    function fallback(error) {
      if (token !== wallpaperEngineLayerToken) {
        finish({
          ok: false,
          preview: false,
          selectedEngine: true,
          error: 'WALLPAPER_DESKTOP_PREVIEW_SUPERSEDED'
        });
        return;
      }
      restoreOriginalBackgroundAfterWallpaperEngine();
      clearWallpaperEngineLayerMedia(0);
      updateWallpaperEngineEntryUi('桌面被动模式 · 已显示原背景');
      finish({
        ok: true,
        preview: false,
        selectedEngine: true,
        fallback: true,
        reason: reason,
        error: String(error || '')
      });
    }
    image.onload = function () {
      if (token !== wallpaperEngineLayerToken
        || !wallpaperEngineSelection.active
        || wallpaperEngineSelection.kind !== 'engine'
        || wallpaperEngineSelection.id !== item.id) {
        finish({
          ok: false,
          preview: false,
          selectedEngine: true,
          error: 'WALLPAPER_DESKTOP_PREVIEW_SUPERSEDED'
        });
        return;
      }
      wallpaperEngineDesktopPreviewUsesAsset = true;
      wallpaperEngineLayerReady('image', token);
      updateWallpaperEngineEntryUi('桌面被动模式 · 项目预览');
      finish({
        ok: true,
        preview: true,
        selectedEngine: true,
        reason: reason
      });
    };
    image.onerror = function () { fallback('WALLPAPER_DESKTOP_PREVIEW_LOAD_FAILED'); };
    timer = setTimeout(function () { fallback('WALLPAPER_DESKTOP_PREVIEW_LOAD_TIMEOUT'); }, 5000);
    image.src = wallpaperEngineMediaUrl(item, 'preview');
  });
};

function reportWallpaperEngineCaptureResult(sessionId, ok) {
  var api = wallpaperEngineDesktopApi();
  if (!api || typeof api.reportWallpaperEngineCaptureResult !== 'function') return Promise.resolve({ ok: false });
  return Promise.resolve(api.reportWallpaperEngineCaptureResult({ sessionId: String(sessionId || ''), ok: ok === true })).catch(function () {
    return { ok: false };
  });
}

function waitForWallpaperEngineVideoFirstFrame(video, item, token, sessionId, runtime) {
  cancelWallpaperEngineFirstFrameWait();
  var wait = {
    video: video,
    callbackId: 0,
    loadedDataHandler: null,
    timer: 0,
    raf1: 0,
    raf2: 0
  };
  wallpaperEngineFirstFrameWait = wait;

  function releaseWait() {
    if (wallpaperEngineFirstFrameWait !== wait) return false;
    wallpaperEngineFirstFrameWait = null;
    if (wait.timer) clearTimeout(wait.timer);
    wait.timer = 0;
    if (wait.video && wait.loadedDataHandler) {
      try { wait.video.removeEventListener('loadeddata', wait.loadedDataHandler); } catch (e) { }
    }
    if (wait.raf1 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(wait.raf1);
    if (wait.raf2 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(wait.raf2);
    wait.raf1 = 0;
    wait.raf2 = 0;
    wait.loadedDataHandler = null;
    return true;
  }

  function firstFrameReady() {
    if (!releaseWait()) return;
    if (!wallpaperEngineNativeStartIsCurrent(item, token)
      || wallpaperEngineNativeSessionId !== sessionId
      || wallpaperEngineCaptureStream !== video.srcObject) return;
    reportWallpaperEngineCaptureResult(sessionId, true).then(function (acknowledgement) {
      if (!wallpaperEngineNativeStartIsCurrent(item, token)
        || wallpaperEngineNativeSessionId !== sessionId
        || wallpaperEngineCaptureStream !== video.srcObject) return;
      if (!acknowledgement
        || acknowledgement.ok !== true
        || acknowledgement.accepted !== true
        || acknowledgement.captureReady !== true) {
        wallpaperEngineRuntimeError = String(acknowledgement && acknowledgement.error || 'WALLPAPER_CAPTURE_CONFIRMATION_FAILED');
        wallpaperEngineLayerFailed(item, 'engine', token);
        return;
      }
      calibrateWallpaperEngineCaptureViewport(video, runtime);
      wallpaperEngineLayerReady('video', token);
      clearWallpaperEngineFreezeFrame(false);
    });
  }

  function firstFrameTimedOut() {
    if (!releaseWait()) return;
    if (!wallpaperEngineNativeStartIsCurrent(item, token) || wallpaperEngineNativeSessionId !== sessionId) return;
    wallpaperEngineLayerFailed(item, 'engine', token);
  }

  wait.timer = setTimeout(firstFrameTimedOut, WALLPAPER_ENGINE_FIRST_FRAME_TIMEOUT_MS);
  if (typeof video.requestVideoFrameCallback === 'function') {
    wait.callbackId = video.requestVideoFrameCallback(function () { firstFrameReady(); });
  } else {
    wait.loadedDataHandler = function () {
      // loadeddata can reflect the reused video element's previous source.
      // Two paints after this session's event ensure its new pixels presented.
      wait.raf1 = requestAnimationFrame(function () {
        wait.raf2 = requestAnimationFrame(function () { firstFrameReady(); });
      });
    };
    video.addEventListener('loadeddata', wait.loadedDataHandler, { once: true });
  }
}

function wallpaperEngineNativeStartIsCurrent(item, token) {
  return token === wallpaperEngineLayerToken
    && wallpaperEngineSelection.active
    && wallpaperEngineSelection.id === item.id
    && !wallpaperEngineNativeHostUnavailable();
}

function wallpaperEngineGlassSamplerIsCurrent(sessionId, layerToken, captureToken) {
  return captureToken === wallpaperEngineGlassCaptureToken
    && layerToken === wallpaperEngineLayerToken
    && String(wallpaperEngineNativeSessionId || '') === String(sessionId || '')
    && wallpaperEngineSelection.active
    && wallpaperEngineSelection.kind === 'engine'
    && wallpaperEngineCaptureMode === 'dwm-thumbnail'
    && document.body.classList.contains('wallpaper-engine-dwm-active');
}

function waitForWallpaperEngineGlassSamplerFrame(video, stream, timeoutMs) {
  return new Promise(function (resolve) {
    var settled = false;
    var timer = 0;
    var pollTimer = 0;
    function finish(ok) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (pollTimer) clearTimeout(pollTimer);
      resolve(ok === true);
    }
    function ready() {
      var track = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
      return !!(video && video.srcObject === stream && track && track.readyState === 'live'
        && video.readyState >= 2 && video.videoWidth >= 2 && video.videoHeight >= 2);
    }
    function poll() {
      if (ready()) { finish(true); return; }
      pollTimer = setTimeout(poll, 40);
    }
    timer = setTimeout(function () { finish(false); }, Math.max(1000, Number(timeoutMs) || 5000));
    poll();
  });
}

function sampleWallpaperEngineGlassSamplerPixels(video) {
  if (!video || video.readyState < 2 || video.videoWidth < 2 || video.videoHeight < 2) return null;
  try {
    var canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 14;
    var context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    var rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    var rgb = new Uint8Array(canvas.width * canvas.height * 3);
    for (var sourceIndex = 0, targetIndex = 0; sourceIndex < rgba.length; sourceIndex += 4) {
      rgb[targetIndex++] = rgba[sourceIndex];
      rgb[targetIndex++] = rgba[sourceIndex + 1];
      rgb[targetIndex++] = rgba[sourceIndex + 2];
    }
    return rgb;
  } catch (e) {
    return null;
  }
}

function wallpaperEngineGlassSamplerPixelDifference(first, second) {
  if (!first || !second || first.length !== second.length || !first.length) return 0;
  var difference = 0;
  for (var index = 0; index < first.length; index += 1) {
    difference += Math.abs(first[index] - second[index]);
  }
  return difference / first.length;
}

function waitForWallpaperEngineGlassSamplerPixelChange(video, stream, baseline, timeoutMs) {
  return new Promise(function (resolve) {
    var settled = false;
    var pollTimer = 0;
    var deadline = performance.now() + Math.max(800, Number(timeoutMs) || 3200);
    function finish(result) {
      if (settled) return;
      settled = true;
      if (pollTimer) clearTimeout(pollTimer);
      resolve(result || null);
    }
    function poll() {
      var track = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
      if (!video || video.srcObject !== stream || !track || track.readyState !== 'live') {
        finish(null);
        return;
      }
      var current = sampleWallpaperEngineGlassSamplerPixels(video);
      var difference = wallpaperEngineGlassSamplerPixelDifference(baseline, current);
      if (current && (!baseline || difference >= 1.25)) {
        finish({ pixels: current, meanAbsoluteRgb: difference });
        return;
      }
      if (performance.now() >= deadline) { finish(null); return; }
      pollTimer = setTimeout(poll, 45);
    }
    pollTimer = setTimeout(poll, 80);
  });
}

function scheduleWallpaperEngineGlassSamplerCapture(sessionId, layerToken, attempt) {
  if (wallpaperEngineGlassCaptureRetryTimer) clearTimeout(wallpaperEngineGlassCaptureRetryTimer);
  wallpaperEngineGlassCaptureRetryTimer = 0;
  attempt = Math.max(0, Number(attempt) || 0);
  wallpaperEngineGlassCaptureRetryAttempt = attempt;
  if (attempt > 4 || layerToken !== wallpaperEngineLayerToken
    || String(wallpaperEngineNativeSessionId || '') !== String(sessionId || '')) return false;
  wallpaperEngineGlassCaptureRetryTimer = setTimeout(function () {
    wallpaperEngineGlassCaptureRetryTimer = 0;
    ensureWallpaperEngineGlassSamplerCapture(sessionId, layerToken, attempt);
  }, attempt === 0 ? 90 : Math.min(2400, 260 * Math.pow(1.8, attempt)));
  return true;
}

async function ensureWallpaperEngineGlassSamplerCapture(sessionId, layerToken, attempt) {
  sessionId = String(sessionId || '');
  attempt = Math.max(0, Number(attempt) || 0);
  var api = wallpaperEngineDesktopApi();
  var video = document.getElementById('wallpaper-engine-glass-sampler-video');
  if (!api || typeof api.prepareWallpaperEngineGlassCapture !== 'function' || !video
    || !/^[a-f0-9]{24}$/i.test(sessionId)
    || layerToken !== wallpaperEngineLayerToken
    || sessionId !== String(wallpaperEngineNativeSessionId || '')
    || wallpaperEngineCaptureMode !== 'dwm-thumbnail') return false;
  var activeTrack = wallpaperEngineGlassCaptureStream && wallpaperEngineGlassCaptureStream.getVideoTracks
    ? wallpaperEngineGlassCaptureStream.getVideoTracks()[0] : null;
  if (activeTrack && activeTrack.readyState === 'live'
    && String(video.dataset.wallpaperEngineSession || '') === sessionId) {
    document.body.classList.add('wallpaper-engine-glass-sampler-ready');
    return true;
  }
  if (typeof syncWallpaperEngineControlGlassSurface === 'function') {
    syncWallpaperEngineControlGlassSurface(true);
  }
  stopWallpaperEngineGlassCaptureStream(false);
  var captureToken = ++wallpaperEngineGlassCaptureToken;
  try {
    await new Promise(function (resolve) { setTimeout(resolve, 90); });
    if (!wallpaperEngineGlassSamplerIsCurrent(sessionId, layerToken, captureToken)) return false;
    var prepared = await api.prepareWallpaperEngineGlassCapture({
      sessionId: sessionId,
      fps: Math.min(60, wallpaperEngineRuntimeCaptureFps())
    });
    if (!wallpaperEngineGlassSamplerIsCurrent(sessionId, layerToken, captureToken)) {
      stopWallpaperEnginePreparedGlassCaptureStreams(sessionId);
      return false;
    }
    if (!prepared || prepared.ok !== true || prepared.capturePrepared !== true) {
      throw new Error(prepared && prepared.error || 'WALLPAPER_GLASS_CAPTURE_PREPARE_FAILED');
    }
    var stream = takeWallpaperEnginePreparedGlassCaptureStream(sessionId);
    var track = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
    if (!track) {
      stopWallpaperEngineMediaStream(stream);
      throw new Error('WALLPAPER_GLASS_CAPTURE_PREPARED_STREAM_MISSING');
    }
    wallpaperEngineGlassCaptureStream = stream;
    video.dataset.wallpaperEngineSession = sessionId;
    video.muted = true;
    video.loop = false;
    video.playsInline = true;
    video.srcObject = stream;
    try { track.contentHint = 'motion'; } catch (e) { }
    var playResult = video.play();
    if (playResult && typeof playResult.catch === 'function') await playResult.catch(function () { return null; });
    var frameReady = await waitForWallpaperEngineGlassSamplerFrame(video, stream, 5000);
    if (!frameReady || !wallpaperEngineGlassSamplerIsCurrent(sessionId, layerToken, captureToken)
      || video.srcObject !== stream) {
      throw new Error('WALLPAPER_GLASS_CAPTURE_FIRST_FRAME_TIMEOUT');
    }
    var primingPixels = sampleWallpaperEngineGlassSamplerPixels(video);
    if (typeof api.activateWallpaperEngineDwmSurface !== 'function') {
      throw new Error('WALLPAPER_ENGINE_DWM_ACTIVATE_HANDLER_MISSING');
    }
    var activated = await api.activateWallpaperEngineDwmSurface({ sessionId: sessionId });
    if (!activated || activated.ok !== true || activated.active !== true
      || !wallpaperEngineGlassSamplerIsCurrent(sessionId, layerToken, captureToken)) {
      throw new Error(activated && activated.error || 'WALLPAPER_ENGINE_DWM_SURFACE_FAILED');
    }
    // The capture session was opened while the helper HWND was a plain black
    // surface. Confirm its pixels changed after DWM activation before exposing
    // the clipped sampler beneath the saved SVG glass. This remains reliable
    // even when Chromium marks the transparent host as document.hidden.
    var livePixels = await waitForWallpaperEngineGlassSamplerPixelChange(video, stream, primingPixels, 3600);
    if (!livePixels || !wallpaperEngineGlassSamplerIsCurrent(sessionId, layerToken, captureToken)) {
      throw new Error('WALLPAPER_GLASS_CAPTURE_LIVE_PIXELS_TIMEOUT');
    }
    wallpaperEngineGlassCaptureRetryAttempt = 0;
    document.body.classList.add('wallpaper-engine-glass-sampler-ready');
    try {
      window.__mineradioWallpaperEngineGlassSamplerState = {
        ok: true,
        sessionId: sessionId,
        captureMode: 'dwm-glass-svg-sampler',
        videoWidth: Number(video.videoWidth) || 0,
        videoHeight: Number(video.videoHeight) || 0,
        meanAbsoluteRgbFromPriming: Number(livePixels.meanAbsoluteRgb) || 0,
        trackSettings: typeof track.getSettings === 'function' ? track.getSettings() : null
      };
    } catch (e2) { }
    track.addEventListener('ended', function () {
      if (!wallpaperEngineGlassSamplerIsCurrent(sessionId, layerToken, captureToken)) return;
      stopWallpaperEngineGlassCaptureStream(false);
      scheduleWallpaperEngineGlassSamplerCapture(sessionId, layerToken, 1);
    }, { once: true });
    video.onerror = function () {
      if (!wallpaperEngineGlassSamplerIsCurrent(sessionId, layerToken, captureToken)) return;
      stopWallpaperEngineGlassCaptureStream(false);
      scheduleWallpaperEngineGlassSamplerCapture(sessionId, layerToken, 1);
    };
    return true;
  } catch (error) {
    if (captureToken === wallpaperEngineGlassCaptureToken) {
      try {
        window.__mineradioWallpaperEngineGlassSamplerState = {
          ok: false,
          sessionId: sessionId,
          captureMode: 'dwm-glass-svg-sampler',
          error: String(error && (error.message || error.name) || error || 'WALLPAPER_GLASS_CAPTURE_FAILED').slice(0, 500)
        };
      } catch (e3) { }
      stopWallpaperEngineGlassCaptureStream(false);
      scheduleWallpaperEngineGlassSamplerCapture(sessionId, layerToken, attempt + 1);
    }
    return false;
  }
}

async function startWallpaperEngineNativeBackground(item, token) {
  var api = wallpaperEngineDesktopApi();
  if (!api || typeof api.startWallpaperEngineScene !== 'function') throw new Error('WALLPAPER_ENGINE_RUNTIME_UNAVAILABLE');
  if (!wallpaperEngineNativeStartIsCurrent(item, token)) throw new Error('WALLPAPER_ENGINE_START_SUPERSEDED');
  var result = await api.startWallpaperEngineScene({
    id: item.id,
    width: Math.max(640, Math.min(3840, Math.round(window.innerWidth || 1920))),
    height: Math.max(360, Math.min(2160, Math.round(window.innerHeight || 1080))),
    fps: wallpaperEngineCaptureFpsPreference()
  });
  if (!result || result.ok === false) {
    var failedSessionId = String(result && result.sessionId || '');
    if (/^[a-f0-9]{24}$/i.test(failedSessionId)) {
      stopWallpaperEnginePreparedCaptureStreams(failedSessionId);
      await reportWallpaperEngineCaptureResult(failedSessionId, false);
      await stopWallpaperEngineNativeSession(failedSessionId);
    }
    throw new Error(result && result.error || 'WALLPAPER_ENGINE_SCENE_START_FAILED');
  }
  var sessionId = String(result.sessionId || '');
  if (!/^[a-f0-9]{24}$/i.test(sessionId)) throw new Error('WALLPAPER_ENGINE_SESSION_INVALID');
  if (!wallpaperEngineNativeStartIsCurrent(item, token)) {
    stopWallpaperEnginePreparedCaptureStreams(sessionId);
    await reportWallpaperEngineCaptureResult(sessionId, false);
    await stopWallpaperEngineNativeSession(sessionId);
    throw new Error('WALLPAPER_ENGINE_START_SUPERSEDED');
  }
  if (result.captureMode === 'dwm-thumbnail') {
    stopWallpaperEnginePreparedCaptureStreams();
    stopWallpaperEnginePreparedGlassCaptureStreams();
    stopWallpaperEngineCaptureStream(false);
    wallpaperEngineCaptureMode = 'dwm-thumbnail';
    wallpaperEngineNativeSessionId = sessionId;
    applyWallpaperEngineVisualSettings(true);
    var dwmAcknowledgement = await reportWallpaperEngineCaptureResult(sessionId, true);
    if (!wallpaperEngineNativeStartIsCurrent(item, token)
      || wallpaperEngineNativeSessionId !== sessionId) return;
    if (!dwmAcknowledgement
      || dwmAcknowledgement.ok !== true
      || dwmAcknowledgement.accepted !== true
      || dwmAcknowledgement.captureReady !== true) {
      wallpaperEngineRuntimeError = String(dwmAcknowledgement && dwmAcknowledgement.error
        || 'WALLPAPER_ENGINE_DWM_SURFACE_FAILED');
      wallpaperEngineLayerFailed(item, 'engine', token);
      return;
    }
    wallpaperEngineLayerReady('dwm', token);
    clearWallpaperEngineFreezeFrame(false);
    return;
  }
  stopWallpaperEngineGlassCaptureStream(false);
  var stream = takeWallpaperEnginePreparedCaptureStream(sessionId);
  if (!stream) {
    await reportWallpaperEngineCaptureResult(sessionId, false);
    await stopWallpaperEngineNativeSession(sessionId);
    throw new Error(result.captureError || 'WALLPAPER_CAPTURE_PREPARED_STREAM_MISSING');
  }
  if (!wallpaperEngineNativeStartIsCurrent(item, token)) {
    stopWallpaperEngineMediaStream(stream);
    await reportWallpaperEngineCaptureResult(sessionId, false);
    await stopWallpaperEngineNativeSession(sessionId);
    throw new Error('WALLPAPER_ENGINE_START_SUPERSEDED');
  }
  var video = document.getElementById('wallpaper-engine-video');
  if (!video) {
    stopWallpaperEngineMediaStream(stream);
    await reportWallpaperEngineCaptureResult(sessionId, false);
    await stopWallpaperEngineNativeSession(sessionId);
    throw new Error('WALLPAPER_ENGINE_VIDEO_LAYER_MISSING');
  }
  stopWallpaperEngineCaptureStream(true);
  wallpaperEngineCaptureStream = stream;
  wallpaperEngineCaptureMode = result.captureMode === 'main-prepared' ? 'main-prepared' : 'renderer-prepared';
  wallpaperEngineNativeSessionId = sessionId;
  video.muted = true;
  video.loop = false;
  video.playsInline = true;
  video.onloadedmetadata = function () {
    if (token !== wallpaperEngineLayerToken) return;
    calibrateWallpaperEngineCaptureViewport(video, result);
    requestWallpaperEngineVideoPlayback(video, item, 'engine', token, false, 0);
  };
  video.srcObject = stream;
  waitForWallpaperEngineVideoFirstFrame(video, item, token, sessionId, result);
  var track = stream.getVideoTracks && stream.getVideoTracks()[0];
  if (track) {
    try { track.contentHint = 'motion'; } catch (e2) { }
    track.addEventListener('ended', function () {
      if (token !== wallpaperEngineLayerToken || wallpaperEngineNativeHostUnavailable()) return;
      wallpaperEngineLayerFailed(item, 'engine', token);
    }, { once: true });
  }
  video.onerror = function () { wallpaperEngineLayerFailed(item, 'engine', token); };
  requestWallpaperEngineVideoPlayback(video, item, 'engine', token, false, 0);
}

function wallpaperEnginePlayWasInterrupted(error) {
  var name = String(error && error.name || '');
  var message = String(error && error.message || error || '');
  return name === 'AbortError' || /interrupted|pause\(\)|new load request/i.test(message);
}

function wallpaperEngineRuntimeErrorText(error) {
  var code = String(error && (error.code || error.message) || error || '');
  if (/WALLPAPER_ENGINE_HOST_ELEVATED/.test(code)) return 'Mineradio 正以管理员身份运行，无法捕获 WE 实时窗口；请取消“以管理员身份运行”后重启播放器';
  if (/WALLPAPER_ENGINE_NOT_INSTALLED/.test(code)) return '未找到 Wallpaper Engine 本体';
  if (/WALLPAPER_ENGINE_SIGNATURE_INVALID/.test(code)) return 'Wallpaper Engine 运行时签名无效';
  if (/WALLPAPER_ENGINE_WINDOW_CLOSE_FAILED/.test(code)) return '上一次 Mineradio 实时壁纸窗口仍在收尾，请稍后重试；Wallpaper Engine 本体会保留';
  if (/WALLPAPER_ENGINE_DWM_SURFACE_FAILED|WALLPAPER_ENGINE_PARALLAX_RELAY_FAILED/.test(code)) return 'WE 原生鼠标视差连接失败，本次会话已关闭；请再次点击重连';
  if (/WALLPAPER_ENGINE_CONTROL_FAILED/.test(code)) return 'WE 场景控制暂时未就绪，请稍后重试';
  if (/WALLPAPER_ENGINE_WINDOW_TIMEOUT/.test(code)) return 'WE 场景窗口启动超时';
  if (/WALLPAPER_ENGINE_CAPTURE_UNAVAILABLE|WALLPAPER_CAPTURE_UNSUPPORTED/.test(code)) return '当前系统不支持实时窗口捕获';
  if (/InvalidStateError/.test(code)) return 'WE 实时画面连接需要 Mineradio 保持在前台';
  if (/NotAllowedError|Permission denied|PermissionDismissed/i.test(code)) return 'WE 实时画面捕获权限被拒绝';
  if (/NotReadableError/.test(code)) return 'WE 实时捕获通道暂时忙，已清理本次会话；请再次点击重连';
  if (/WALLPAPER_ENGINE_REFRESH_SUPERSEDED/.test(code)) return 'WE 实时窗口正在切换，请重试';
  if (/WALLPAPER_CAPTURE_PREPARE_TIMEOUT/.test(code)) return 'WE 实时画面连接超时';
  if (/WALLPAPER_CAPTURE_PREPARE_HANDLER_MISSING|WALLPAPER_CAPTURE_PREPARED_STREAM_MISSING/.test(code)) return 'WE 实时画面连接尚未准备完成';
  if (/WALLPAPER_CAPTURE_FAILED|WALLPAPER_CAPTURE_STREAM_EMPTY/.test(code)) return 'WE 实时画面连接失败';
  if (/WALLPAPER_SCENE_PACKAGE_INVALID/.test(code)) return '所选 .pkg/.pak 不是有效的 Wallpaper Engine PKGV 场景包';
  if (/WALLPAPER_SCENE_MANIFEST_INVALID/.test(code)) return '该场景缺少有效的 project.json';
  if (/WALLPAPER_SCENE_NOT_FOUND/.test(code)) return '没有找到该项目的有效场景包';
  return 'WE 引擎运行失败';
}

function requestWallpaperEngineVideoPlayback(video, item, kind, token, revealLayer, attempt) {
  cancelWallpaperEngineVideoRetry();
  if (!video || token !== wallpaperEngineLayerToken || !wallpaperEngineSelection.active) return;
  var hostUnavailable = kind === 'engine' ? wallpaperEngineNativeHostUnavailable() : document.hidden;
  if (hostUnavailable) {
    try { video.pause(); } catch (e) { }
    if (revealLayer) wallpaperEngineLayerReady('video', token);
    return;
  }
  var promise;
  try {
    promise = video.play();
  } catch (error) {
    handleWallpaperEngineVideoPlayFailure(error, video, item, kind, token, revealLayer, attempt);
    return;
  }
  if (!promise || !promise.then) {
    if (revealLayer) wallpaperEngineLayerReady('video', token);
    return;
  }
  promise.then(function () {
    if (token !== wallpaperEngineLayerToken || !wallpaperEngineSelection.active) return;
    if (revealLayer) wallpaperEngineLayerReady('video', token);
  }).catch(function (error) {
    handleWallpaperEngineVideoPlayFailure(error, video, item, kind, token, revealLayer, attempt);
  });
}

function handleWallpaperEngineVideoPlayFailure(error, video, item, kind, token, revealLayer, attempt) {
  if (token !== wallpaperEngineLayerToken || !wallpaperEngineSelection.active) return;
  var hostUnavailable = kind === 'engine' ? wallpaperEngineNativeHostUnavailable() : document.hidden;
  var interrupted = hostUnavailable || wallpaperEnginePlayWasInterrupted(error);
  if (!interrupted) {
    wallpaperEngineLayerFailed(item, kind, token);
    return;
  }
  if (revealLayer) wallpaperEngineLayerReady('video', token);
  if (hostUnavailable || Number(attempt) >= 2) return;
  wallpaperEngineVideoRetryTimer = setTimeout(function () {
    wallpaperEngineVideoRetryTimer = 0;
    requestWallpaperEngineVideoPlayback(video, item, kind, token, false, Number(attempt) + 1);
  }, 160);
}

function clearWallpaperEngineLayerMedia(delay) {
  cancelWallpaperEngineVideoRetry();
  cancelWallpaperEngineFirstFrameWait();
  var token = wallpaperEngineLayerToken;
  var layer = document.getElementById('wallpaper-engine-layer');
  var image = document.getElementById('wallpaper-engine-image');
  var video = document.getElementById('wallpaper-engine-video');
  function release() {
    if (token !== wallpaperEngineLayerToken) return;
    if (layer) layer.classList.remove('ready', 'image-ready', 'video-ready', 'engine-ready', 'freeze-ready');
    clearWallpaperEngineFreezeFrame(true);
    if (image) {
      image.onload = null;
      image.onerror = null;
      image.removeAttribute('src');
    }
    if (video) {
      video.onloadeddata = null;
      video.onerror = null;
      try { video.pause(); } catch (e) { }
      if (video.srcObject) {
        try { video.srcObject = null; } catch (e2) { }
      }
      video.removeAttribute('poster');
      video.removeAttribute('src');
      try { video.load(); } catch (e3) { }
    }
    stopWallpaperEngineCaptureStream();
  }
  if (delay) setTimeout(release, delay);
  else release();
}

function restoreOriginalBackgroundAfterWallpaperEngine() {
  document.body.classList.remove('wallpaper-engine-active', 'wallpaper-engine-dwm-active');
  stopWallpaperEngineGlassCaptureStream(false);
  if (typeof syncWallpaperEngineControlGlassSurface === 'function') {
    syncWallpaperEngineControlGlassSurface(true);
  }
  try {
    if (typeof applyCustomBackground === 'function') applyCustomBackground();
  } catch (e) { }
}

function suspendOriginalBackgroundForWallpaperEngine() {
  var video = document.getElementById('custom-bg-video');
  if (video) {
    try { video.pause(); } catch (e) { }
  }
}

function wallpaperEngineLayerReady(kind, token) {
  if (token !== wallpaperEngineLayerToken || !wallpaperEngineSelection.active) return;
  cancelWallpaperEngineHostRecovery(true);
  var layer = document.getElementById('wallpaper-engine-layer');
  if (!layer) return;
  layer.classList.remove('ready', 'image-ready', 'video-ready', 'engine-ready', 'freeze-ready');
  document.body.classList.toggle('wallpaper-engine-dwm-active', kind === 'dwm');
  if (kind !== 'dwm') {
    stopWallpaperEngineGlassCaptureStream(false);
    layer.classList.add(kind === 'video' ? 'video-ready' : 'image-ready', 'ready');
    if (kind === 'video' && wallpaperEngineSelection.kind === 'engine') layer.classList.add('engine-ready');
    if (kind === 'video' && wallpaperEngineSelection.kind === 'engine') queueWallpaperEnginePointerActivity();
  }
  document.body.classList.add('wallpaper-engine-active');
  applyWallpaperEngineVisualSettings(true);
  if (kind === 'dwm' && typeof animateWallpaperEngineControlGlassSurface === 'function') {
    animateWallpaperEngineControlGlassSurface(560);
  }
  if (kind === 'dwm') {
    scheduleWallpaperEngineGlassSamplerCapture(String(wallpaperEngineNativeSessionId || ''), token, 0);
  }
  suspendOriginalBackgroundForWallpaperEngine();
  wallpaperEngineRuntimeError = '';
  updateWallpaperEngineEntryUi();
  renderWallpaperEngineLibrary();
}

function wallpaperEngineLayerFailed(item, attemptedKind, token) {
  if (token !== wallpaperEngineLayerToken) return;
  var nativeStopPromise = Promise.resolve({ ok: true });
  if (attemptedKind === 'engine') {
    cancelWallpaperEngineFirstFrameWait();
    var failedSessionId = String(wallpaperEngineNativeSessionId || '');
    if (/^[a-f0-9]{24}$/i.test(failedSessionId)) reportWallpaperEngineCaptureResult(failedSessionId, false);
    stopWallpaperEngineCaptureStream();
    nativeStopPromise = stopWallpaperEngineNativeSession();
    if (wallpaperEngineHostRecoveryInFlight
      && wallpaperEngineHostRecoveryAttempt < WALLPAPER_ENGINE_HOST_RECOVERY_MAX_ATTEMPTS
      && wallpaperEngineDesktopHostIsVisible()) {
      wallpaperEngineHostBoundsPreparing = true;
      wallpaperEngineRuntimeError = '';
      restoreOriginalBackgroundAfterWallpaperEngine();
      clearWallpaperEngineLayerMedia(0);
      updateWallpaperEngineEntryUi('正在恢复 ' + (item && item.title || 'Wallpaper Engine') + '…');
      Promise.resolve(nativeStopPromise).finally(function () {
        if (!wallpaperEngineHostRecoveryInFlight || wallpaperEngineHostRecoveryRetryTimer) return;
        wallpaperEngineHostRecoveryRetryTimer = setTimeout(function () {
          wallpaperEngineHostRecoveryRetryTimer = 0;
          if (!wallpaperEngineHostRecoveryInFlight
            || !wallpaperEngineSelection.active
            || wallpaperEngineSelection.kind !== 'engine'
            || !wallpaperEngineDesktopHostIsVisible()) return;
          wallpaperEngineHostBoundsPreparing = false;
          restartWallpaperEngineAfterHostBoundsChange();
        }, 650);
      });
      return;
    }
    cancelWallpaperEngineHostRecovery(true);
  }
  if ((attemptedKind === 'media' || attemptedKind === 'engine') && item && item.hasPreview) {
    wallpaperEngineSelection.kind = 'preview';
    wallpaperEngineSelection.mediaType = 'image';
    showToast(attemptedKind === 'engine' ? ((wallpaperEngineRuntimeError || 'Wallpaper Engine 实时运行失败') + '，已切换到项目预览；再次点击可重试') : '动态媒体解码失败，已切换到安全预览');
    applyWallpaperEngineBackground(item, true);
    return;
  }
  wallpaperEngineRuntimeError = attemptedKind === 'engine' ? 'WE 引擎运行失败' : '媒体不可用';
  restoreOriginalBackgroundAfterWallpaperEngine();
  clearWallpaperEngineLayerMedia(0);
  updateWallpaperEngineEntryUi();
  showToast('壁纸媒体不可用，已恢复原背景');
}

function applyWallpaperEngineBackground(item, quiet) {
  item = item || wallpaperEngineProjectById(wallpaperEngineSelection.id);
  if (!item || !wallpaperEngineSelection.active) {
    wallpaperEngineRuntimeError = item ? '' : '项目离线';
    restoreOriginalBackgroundAfterWallpaperEngine();
    clearWallpaperEngineLayerMedia(0);
    updateWallpaperEngineEntryUi(item ? '' : '项目离线 · 已显示原背景');
    return false;
  }
  var kind = wallpaperEngineSelection.kind === 'engine' && item.enginePlayable
    ? 'engine'
    : (wallpaperEngineSelection.kind === 'media' && item.playable ? 'media' : 'preview');
  if (kind === 'preview' && !item.hasPreview) {
    wallpaperEngineLayerFailed(item, kind, wallpaperEngineLayerToken);
    return false;
  }
  var layer = document.getElementById('wallpaper-engine-layer');
  var image = document.getElementById('wallpaper-engine-image');
  var video = document.getElementById('wallpaper-engine-video');
  var preserveOutgoingFrame = !!(layer && (layer.classList.contains('ready') || wallpaperEngineSwitchTimer));
  cancelWallpaperEngineSwitchTimer();
  var token = ++wallpaperEngineLayerToken;
  if (kind !== 'engine') stopWallpaperEngineNativeSession();
  restoreOriginalBackgroundAfterWallpaperEngine();
  if (!layer || !image || !video) return false;
  updateWallpaperEngineEntryUi('正在加载 ' + (item.title || '壁纸') + '…');

  function beginWallpaperEngineMediaLoad() {
    if (token !== wallpaperEngineLayerToken || !wallpaperEngineSelection.active || wallpaperEngineSelection.id !== item.id) return;
    if (kind === 'engine' && wallpaperEngineNativeHostUnavailable()) return;
    clearWallpaperEngineLayerMedia(0);
    if (kind === 'engine') {
      startWallpaperEngineNativeBackground(item, token).catch(function (error) {
        if (token !== wallpaperEngineLayerToken) return;
        if (wallpaperEngineNativeHostUnavailable() || /WALLPAPER_ENGINE_START_SUPERSEDED/.test(String(error && (error.code || error.message) || error || ''))) return;
        console.warn('[Wallpaper Engine Scene]', error);
        wallpaperEngineRuntimeError = wallpaperEngineRuntimeErrorText(error);
        wallpaperEngineLayerFailed(item, kind, token);
      });
    } else if (kind === 'media' && item.mediaType === 'video') {
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      if (item.hasPreview) video.poster = wallpaperEngineMediaUrl(item, 'preview');
      video.onloadeddata = function () {
        if (token !== wallpaperEngineLayerToken) return;
        requestWallpaperEngineVideoPlayback(video, item, kind, token, true, 0);
      };
      video.onerror = function () { wallpaperEngineLayerFailed(item, kind, token); };
      video.src = wallpaperEngineMediaUrl(item, 'media');
      video.load();
    } else {
      image.onload = function () { wallpaperEngineLayerReady('image', token); };
      image.onerror = function () { wallpaperEngineLayerFailed(item, kind, token); };
      image.src = wallpaperEngineMediaUrl(item, kind === 'media' ? 'media' : 'preview');
    }
  }

  if (preserveOutgoingFrame) {
    clearWallpaperEngineLayerMedia(WALLPAPER_ENGINE_SWITCH_FADE_MS);
    wallpaperEngineSwitchTimer = setTimeout(function () {
      wallpaperEngineSwitchTimer = 0;
      beginWallpaperEngineMediaLoad();
    }, WALLPAPER_ENGINE_SWITCH_FADE_MS + 20);
  } else {
    clearWallpaperEngineLayerMedia(0);
    beginWallpaperEngineMediaLoad();
  }
  if (!quiet) showToast(kind === 'engine' ? '正在用 Wallpaper Engine 原生引擎载入 Scene…' : (kind === 'media' ? 'Wallpaper Engine 壁纸已启用' : '已启用安全预览，原背景仍保留'));
  return true;
}

function activateWallpaperEngineItem(id) {
  var item = wallpaperEngineProjectById(id);
  if (!item || (!item.playable && !item.enginePlayable && !item.hasPreview)) {
    showToast('该项目没有可安全导入的媒体');
    return;
  }
  wallpaperEngineSelection = normalizeWallpaperEngineSelection({
    active: true,
    id: item.id,
    title: item.title,
    kind: item.enginePlayable ? 'engine' : (item.playable ? 'media' : 'preview'),
    mediaType: item.enginePlayable ? 'video' : (item.playable ? item.mediaType : 'image'),
    mediaAnimated: item.mediaAnimated,
    projectType: item.projectType,
    hasPreview: item.hasPreview,
    previewAnimated: item.previewAnimated,
    visualOpacity: wallpaperEngineSelection.visualOpacity,
    visualPositionX: wallpaperEngineSelection.visualPositionX,
    visualPositionY: wallpaperEngineSelection.visualPositionY,
    visualScale: wallpaperEngineSelection.visualScale,
    updatedAt: item.updatedAt
  });
  wallpaperEngineDesktopPreviewActive = false;
  wallpaperEngineDesktopPreviewUsesAsset = false;
  cancelWallpaperEngineHostRecovery(true);
  saveWallpaperEngineSelection();
  wallpaperEngineRuntimeError = '';
  applyWallpaperEngineBackground(item, false);
  closeWallpaperEngineLibrary();
}

function deactivateWallpaperEngineBackground(quiet) {
  cancelWallpaperEngineHostRecovery(true);
  wallpaperEngineDesktopPreviewActive = false;
  wallpaperEngineDesktopPreviewUsesAsset = false;
  wallpaperEngineSelection.active = false;
  if (wallpaperEngineHostBoundsRestartTimer) {
    clearTimeout(wallpaperEngineHostBoundsRestartTimer);
    wallpaperEngineHostBoundsRestartTimer = 0;
  }
  saveWallpaperEngineSelection();
  wallpaperEngineRuntimeError = '';
  cancelWallpaperEngineSwitchTimer();
  cancelWallpaperEngineVideoRetry();
  cancelWallpaperEngineFirstFrameWait();
  wallpaperEngineHostBoundsPreparing = false;
  stopWallpaperEngineCaptureStream();
  stopWallpaperEngineNativeSession();
  ++wallpaperEngineLayerToken;
  restoreOriginalBackgroundAfterWallpaperEngine();
  clearWallpaperEngineFreezeFrame(true);
  clearWallpaperEngineLayerMedia(0);
  updateWallpaperEngineEntryUi();
  renderWallpaperEngineLibrary();
  if (!quiet) showToast('已恢复原背景媒体，原设置没有被覆盖');
}

function restartWallpaperEngineAfterHostBoundsChange() {
  if (!wallpaperEngineSelection.active || wallpaperEngineSelection.kind !== 'engine' || wallpaperEngineNativeHostUnavailable()) return;
  var item = wallpaperEngineProjectById(wallpaperEngineSelection.id);
  if (!item || !item.enginePlayable) {
    clearWallpaperEngineFreezeFrame(false);
    return;
  }
  cancelWallpaperEngineSwitchTimer();
  cancelWallpaperEngineVideoRetry();
  cancelWallpaperEngineFirstFrameWait();
  if (wallpaperEngineHostBoundsRestartTimer) {
    clearTimeout(wallpaperEngineHostBoundsRestartTimer);
    wallpaperEngineHostBoundsRestartTimer = 0;
  }
  var token = ++wallpaperEngineLayerToken;
  wallpaperEngineHostRecoveryInFlight = true;
  wallpaperEngineHostRecoveryAttempt += 1;
  wallpaperEngineRuntimeError = '';
  updateWallpaperEngineEntryUi('正在恢复 ' + (item.title || 'Wallpaper Engine') + '…');
  startWallpaperEngineNativeBackground(item, token).catch(function (error) {
    if (token !== wallpaperEngineLayerToken) return;
    if (wallpaperEngineNativeHostUnavailable() || /WALLPAPER_ENGINE_START_SUPERSEDED/.test(String(error && (error.code || error.message) || error || ''))) return;
    console.warn('[Wallpaper Engine Scene bounds restart]', error);
    wallpaperEngineRuntimeError = wallpaperEngineRuntimeErrorText(error);
    wallpaperEngineLayerFailed(item, 'engine', token);
  });
}

function handleWallpaperEngineHostBoundsChange(payload) {
  var phase = String(payload && payload.phase || 'restart');
  if (phase === 'resident') {
    var residentSessionId = String(payload && payload.sessionId || '');
    if (!wallpaperEngineSelection.active
      || wallpaperEngineSelection.kind !== 'engine'
      || wallpaperEngineCaptureMode !== 'dwm-thumbnail'
      || residentSessionId !== String(wallpaperEngineNativeSessionId || '')) return;
    // Minimize no longer destroys the native DWM base. Restore only the
    // renderer-side visual state and, if Chromium ended it in the background,
    // reacquire the narrow glass sampler without restarting the Scene.
    wallpaperEngineHostBoundsPreparing = false;
    wallpaperEngineDesktopPreviewActive = false;
    wallpaperEngineDesktopPreviewUsesAsset = false;
    applyWallpaperEngineVisualSettings(true);
    clearWallpaperEngineFreezeFrame(false);
    if (!wallpaperEngineCaptureStream
      || !wallpaperEngineCaptureStream.getVideoTracks
      || !wallpaperEngineCaptureStream.getVideoTracks().some(function (track) { return track && track.readyState === 'live'; })) {
      scheduleWallpaperEngineGlassSamplerCapture(residentSessionId, wallpaperEngineLayerToken, 0);
    }
    updateWallpaperEngineEntryUi();
    return;
  }
  if (phase === 'restart') {
    if (!wallpaperEngineHostBoundsPreparing && !wallpaperEngineDesktopPreviewActive) return;
    // BrowserWindow.show()/restore can fire before Chromium has published the
    // visible document state. Keep the session suspended until visibilitychange
    // confirms that capture can be created without an immediate preview fallback.
    if (document.hidden && !(payload && payload.forceVisibleHost === true)) return;
    wallpaperEngineDesktopPreviewActive = false;
    wallpaperEngineDesktopPreviewUsesAsset = false;
    wallpaperEngineHostBoundsPreparing = false;
    restartWallpaperEngineAfterHostBoundsChange();
    return;
  }
  if (phase === 'prepare' && typeof window.__mineradioPrepareWallpaperEngineHostBoundsChange === 'function') {
    window.__mineradioPrepareWallpaperEngineHostBoundsChange(payload && payload.sessionId, payload && payload.reason);
  }
}

function wallpaperEngineFilteredProjects() {
  var search = document.getElementById('wallpaper-engine-search');
  var query = String(search && search.value || '').trim().toLowerCase();
  return wallpaperEngineProjects.filter(function (item) {
    if (hiddenWallpaperEngineIds.has(item.id)) return false;
    if (!query) return true;
    return (item.title + ' ' + item.projectType + ' ' + item.sourceLabel + ' ' + item.workshopId).toLowerCase().indexOf(query) >= 0;
  }).sort(function (a, b) {
    var activeA = wallpaperEngineSelection.active && wallpaperEngineSelection.id === a.id ? 1 : 0;
    var activeB = wallpaperEngineSelection.active && wallpaperEngineSelection.id === b.id ? 1 : 0;
    var favA = favoriteWallpaperEngineIds.has(a.id) ? 1 : 0;
    var favB = favoriteWallpaperEngineIds.has(b.id) ? 1 : 0;
    return activeB - activeA || favB - favA || Number(b.playable) - Number(a.playable) || Number(b.enginePlayable) - Number(a.enginePlayable) || a.title.localeCompare(b.title, 'zh-CN');
  });
}

function disconnectWallpaperEnginePreviewObserver() {
  if (wallpaperEnginePreviewObserver) wallpaperEnginePreviewObserver.disconnect();
  wallpaperEnginePreviewObserver = null;
}

function loadWallpaperEnginePreviewsNearViewport() {
  var grid = document.getElementById('wallpaper-engine-grid');
  var modal = document.getElementById('wallpaper-engine-modal');
  if (!grid || (modal && !modal.classList.contains('show'))) return;
  var viewport = grid.getBoundingClientRect();
  grid.querySelectorAll('img[data-src]').forEach(function (image) {
    var rect = image.getBoundingClientRect();
    var nearby = rect.bottom >= viewport.top - 220 && rect.top <= viewport.bottom + 220;
    if (nearby) {
      if (!image.getAttribute('src')) image.src = image.dataset.src || '';
    } else if (image.dataset.animated === '1') {
      image.removeAttribute('src');
      image.classList.remove('loaded');
    }
  });
}

function extendWallpaperEngineLibraryNearEnd() {
  var grid = document.getElementById('wallpaper-engine-grid');
  if (!grid || !grid.querySelector('[data-wallpaper-action="load-more"]')) return;
  var remaining = grid.scrollHeight - grid.scrollTop - grid.clientHeight;
  if (remaining > Math.max(280, grid.clientHeight * 0.7)) return;
  wallpaperEngineRenderLimit += WALLPAPER_ENGINE_RENDER_BATCH;
  renderWallpaperEngineLibrary(true);
}

function scheduleWallpaperEnginePreviewViewportUpdate() {
  if (wallpaperEnginePreviewObserver) {
    extendWallpaperEngineLibraryNearEnd();
    return;
  }
  if (wallpaperEnginePreviewScrollTimer) return;
  wallpaperEnginePreviewScrollTimer = setTimeout(function () {
    wallpaperEnginePreviewScrollTimer = 0;
    loadWallpaperEnginePreviewsNearViewport();
    extendWallpaperEngineLibraryNearEnd();
  }, 60);
}

function observeWallpaperEnginePreviews() {
  disconnectWallpaperEnginePreviewObserver();
  var grid = document.getElementById('wallpaper-engine-grid');
  if (!grid || typeof IntersectionObserver === 'undefined') {
    if (grid) {
      grid.querySelectorAll('img[data-src]').forEach(function (img) {
        img.onload = function () { img.classList.add('loaded'); };
      });
      loadWallpaperEnginePreviewsNearViewport();
    }
    return;
  }
  wallpaperEnginePreviewObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var img = entry.target;
      if (entry.isIntersecting) {
        if (!img.getAttribute('src')) img.src = img.dataset.src || '';
      } else if (img.dataset.animated === '1') {
        img.removeAttribute('src');
        img.classList.remove('loaded');
      }
    });
  }, { root: grid, rootMargin: '220px 0px', threshold: 0.01 });
  grid.querySelectorAll('img[data-src]').forEach(function (img) {
    img.onload = function () { img.classList.add('loaded'); };
    wallpaperEnginePreviewObserver.observe(img);
  });
  loadWallpaperEnginePreviewsNearViewport();
}

function renderWallpaperEngineManualRoots() {
  var host = document.getElementById('wallpaper-engine-manual-roots');
  if (!host) return;
  var roots = wallpaperEngineLibrarySnapshot && Array.isArray(wallpaperEngineLibrarySnapshot.manualRoots)
    ? wallpaperEngineLibrarySnapshot.manualRoots : [];
  host.innerHTML = roots.map(function (root) {
    return '<span class="wallpaper-engine-root-chip"><span title="手动导入目录">' + escHtml(root.name || '导入目录') + '</span>' +
      '<button type="button" data-wallpaper-action="remove-root" data-root-id="' + escHtml(root.id || '') + '" title="移除此索引目录">×</button></span>';
  }).join('');
}

function renderWallpaperEngineLibrary(preserveRenderLimit) {
  var grid = document.getElementById('wallpaper-engine-grid');
  if (!grid) return;
  var modal = document.getElementById('wallpaper-engine-modal');
  if (modal && !modal.classList.contains('show')) {
    disconnectWallpaperEnginePreviewObserver();
    return;
  }
  if (!preserveRenderLimit) wallpaperEngineRenderLimit = WALLPAPER_ENGINE_RENDER_BATCH;
  disconnectWallpaperEnginePreviewObserver();
  if (wallpaperEngineLibraryBusy) {
    grid.innerHTML = '<div class="wallpaper-engine-empty">正在读取 project.json 元数据，不扫描 94GB 素材文件…</div>';
    return;
  }
  var items = wallpaperEngineFilteredProjects();
  if (!items.length) {
    grid.innerHTML = '<div class="wallpaper-engine-empty">' + (wallpaperEngineProjects.length ? '没有符合筛选条件的壁纸' : '没有识别到 Wallpaper Engine 项目<br>可以点击“导入目录”手动选择项目或素材库') + '</div>';
    return;
  }
  var visibleItems = items.slice(0, wallpaperEngineRenderLimit);
  grid.innerHTML = visibleItems.map(function (item) {
    var favorite = favoriteWallpaperEngineIds.has(item.id);
    var active = wallpaperEngineSelection.active && wallpaperEngineSelection.id === item.id;
    var preview = item.hasPreview ? wallpaperEngineMediaUrl(item, 'preview') : '';
    return '<article class="wallpaper-engine-card' + (favorite ? ' favorite' : '') + (active ? ' active' : '') + '" tabindex="0" role="button" data-wallpaper-id="' + item.id + '">' +
      (preview ? '<img class="wallpaper-engine-card-preview" data-src="' + escHtml(preview) + '" data-animated="' + (item.previewAnimated ? '1' : '0') + '" alt="" loading="lazy" decoding="async">' : '<div class="wallpaper-engine-card-placeholder"></div>') +
      '<button class="wallpaper-engine-card-star' + (favorite ? ' active' : '') + '" type="button" data-wallpaper-action="favorite" data-wallpaper-id="' + item.id + '" title="' + (favorite ? '取消星标' : '星标并置顶') + '">' + (favorite ? '★' : '☆') + '</button>' +
      '<button class="wallpaper-engine-card-settings" type="button" data-wallpaper-action="details" data-wallpaper-id="' + item.id + '" title="读取项目设置">⚙</button>' +
      '<button class="wallpaper-engine-card-hide" type="button" data-wallpaper-action="hide" data-wallpaper-id="' + item.id + '" title="从列表隐藏">×</button>' +
      '<div class="wallpaper-engine-card-meta">' + escHtml(item.title) + '<small>' + escHtml(wallpaperEngineProjectLabel(item)) + '</small></div>' +
      '</article>';
  }).join('') + (visibleItems.length < items.length
    ? '<button type="button" class="wallpaper-engine-load-more" data-wallpaper-action="load-more">继续加载 ' + visibleItems.length + ' / ' + items.length + '</button>'
    : '');
  observeWallpaperEnginePreviews();
}

function normalizeWallpaperEngineProjectDetails(details) {
  details = details && typeof details === 'object' ? details : {};
  var id = String(details.id || '').replace(/[^a-f0-9]/gi, '').slice(0, 24);
  if (id.length !== 24) return null;
  var properties = Array.isArray(details.properties) ? details.properties.slice(0, 256).map(function (property) {
    property = property && typeof property === 'object' ? property : {};
    var key = String(property.key || '').replace(/[^a-z0-9_.-]/gi, '').slice(0, 128);
    if (!key) return null;
    var value = property.value;
    if (typeof value !== 'boolean' && typeof value !== 'number' && typeof value !== 'string') value = null;
    if (typeof value === 'string') value = value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 512);
    var options = Array.isArray(property.options) ? property.options.slice(0, 64).map(function (option) {
      option = option && typeof option === 'object' ? option : {};
      var optionValue = option.value;
      if (typeof optionValue !== 'boolean' && typeof optionValue !== 'number' && typeof optionValue !== 'string') return null;
      return {
        label: String(option.label || '选项').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160),
        value: optionValue
      };
    }).filter(Boolean) : [];
    return {
      key: key,
      label: String(property.label || key).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || key,
      type: String(property.type || 'unknown').replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'unknown',
      value: value,
      options: options,
      audio: property.audio === true,
      autoMuted: property.autoMuted === true
    };
  }).filter(Boolean) : [];
  return {
    id: id,
    title: String(details.title || 'Wallpaper Engine').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Wallpaper Engine',
    projectType: String(details.projectType || 'unknown').replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'unknown',
    workshopId: String(details.workshopId || '').replace(/\D/g, '').slice(0, 32),
    propertyCount: Math.max(0, Math.min(256, Number(details.propertyCount) || properties.length)),
    audioPropertyCount: Math.max(0, Math.min(256, Number(details.audioPropertyCount) || 0)),
    mutedAudioPropertyCount: Math.max(0, Math.min(256, Number(details.mutedAudioPropertyCount) || 0)),
    properties: properties
  };
}

function wallpaperEnginePropertyValueLabel(property) {
  if (property.options && property.options.length) {
    var selected = property.options.find(function (option) { return String(option.value) === String(property.value); });
    if (selected) return selected.label;
  }
  if (typeof property.value === 'boolean') return property.value ? '开启' : '关闭';
  if (typeof property.value === 'number') return String(Math.round(property.value * 1000) / 1000);
  if (typeof property.value === 'string' && property.value) return property.value;
  return '未设置';
}

function renderWallpaperEngineProjectDetails(details, error) {
  var drawer = document.getElementById('wallpaper-engine-details-drawer');
  var title = document.getElementById('wallpaper-engine-details-title');
  var summary = document.getElementById('wallpaper-engine-details-summary');
  var properties = document.getElementById('wallpaper-engine-details-properties');
  var weButton = document.getElementById('wallpaper-engine-details-we');
  var workshopButton = document.getElementById('wallpaper-engine-details-workshop');
  if (!drawer || !title || !summary || !properties) return;
  drawer.classList.add('show');
  drawer.setAttribute('aria-hidden', 'false');
  if (error) {
    title.textContent = '项目设置';
    summary.textContent = error;
    properties.innerHTML = '<div class="wallpaper-engine-details-empty">无法读取此项目的 project.json 设置。</div>';
    if (weButton) weButton.disabled = true;
    if (workshopButton) workshopButton.disabled = true;
    return;
  }
  if (!details) {
    title.textContent = '正在读取项目设置…';
    summary.textContent = '只读取 project.json 元数据，不解包大型 Scene 文件。';
    properties.innerHTML = '<div class="wallpaper-engine-details-empty">读取中…</div>';
    if (weButton) weButton.disabled = true;
    if (workshopButton) workshopButton.disabled = true;
    return;
  }
  title.textContent = details.title;
  summary.textContent = '已读取 ' + details.propertyCount + ' 项设置 · 检测到 ' + details.audioPropertyCount +
    ' 项音频控制 · 每次加载自动静音 ' + details.mutedAudioPropertyCount + ' 项';
  properties.innerHTML = details.properties.length ? details.properties.map(function (property) {
    var badge = property.audio
      ? '<span class="wallpaper-engine-property-badge' + (property.autoMuted ? '' : ' warning') + '">' + (property.autoMuted ? '加载时静音' : '音频相关') + '</span>'
      : '';
    return '<div class="wallpaper-engine-property-row">' +
      '<div class="wallpaper-engine-property-copy"><strong>' + escHtml(property.label) + '</strong><small>' +
      escHtml(property.key + ' · ' + property.type) + '</small></div>' +
      badge + '<span class="wallpaper-engine-property-value">' + escHtml(wallpaperEnginePropertyValueLabel(property)) + '</span></div>';
  }).join('') : '<div class="wallpaper-engine-details-empty">这个项目没有声明可调整的用户属性。</div>';
  var canOpen = /^\d{5,32}$/.test(details.workshopId);
  if (weButton) weButton.disabled = !canOpen;
  if (workshopButton) workshopButton.disabled = !canOpen;
}

async function showWallpaperEngineProjectDetails(id) {
  id = String(id || '');
  var api = wallpaperEngineDesktopApi();
  wallpaperEngineProjectDetailsId = id;
  renderWallpaperEngineProjectDetails(null, '');
  if (!api || typeof api.getWallpaperEngineProjectDetails !== 'function') {
    renderWallpaperEngineProjectDetails(null, '当前环境不支持读取 Wallpaper Engine 项目设置');
    return;
  }
  try {
    var response = await api.getWallpaperEngineProjectDetails(id);
    if (wallpaperEngineProjectDetailsId !== id) return;
    if (!response || response.ok === false) throw new Error(response && response.error || '读取失败');
    var details = normalizeWallpaperEngineProjectDetails(response);
    if (!details) throw new Error('项目设置格式无效');
    renderWallpaperEngineProjectDetails(details, '');
  } catch (error) {
    if (wallpaperEngineProjectDetailsId === id) renderWallpaperEngineProjectDetails(null, error.message || '读取失败');
  }
}

function closeWallpaperEngineProjectDetails() {
  wallpaperEngineProjectDetailsId = '';
  var drawer = document.getElementById('wallpaper-engine-details-drawer');
  if (drawer) {
    drawer.classList.remove('show');
    drawer.setAttribute('aria-hidden', 'true');
  }
}

async function launchWallpaperEngineProjectDetails(target) {
  var id = wallpaperEngineProjectDetailsId;
  var api = wallpaperEngineDesktopApi();
  if (!id || !api || typeof api.openWallpaperEngineProjectDetails !== 'function') return;
  try {
    var response = await api.openWallpaperEngineProjectDetails(id, target === 'workshop' ? 'workshop' : 'we');
    if (!response || response.ok === false) throw new Error(response && response.error || '打开失败');
    if (response.opened === 'wallpaper-engine') showToast('已在 Wallpaper Engine 中定位此壁纸；可打开项目设置栏调整');
    else if (response.fallback) showToast('当前 WE 版本无法直接定位，已打开创意工坊详情');
    else showToast('已打开创意工坊详情');
  } catch (error) {
    showToast(error.message === 'WALLPAPER_ENGINE_WORKSHOP_DETAILS_UNAVAILABLE'
      ? '手动导入项目没有 Workshop ID，暂时无法在 WE 中定位'
      : (error.message || '无法打开 Wallpaper Engine 项目详情'));
  }
}

function scheduleWallpaperEngineLibraryRender() {
  clearTimeout(wallpaperEngineSearchRenderTimer);
  wallpaperEngineSearchRenderTimer = setTimeout(function () {
    wallpaperEngineSearchRenderTimer = 0;
    renderWallpaperEngineLibrary();
  }, 90);
}

function updateWallpaperEngineLibraryStatus(snapshot, error) {
  var status = document.getElementById('wallpaper-engine-library-status');
  if (!status) return;
  status.classList.toggle('loading', wallpaperEngineLibraryBusy);
  if (wallpaperEngineLibraryBusy) {
    status.textContent = '正在识别 Steam 创意工坊与本地项目…';
  } else if (error) {
    status.textContent = '识别失败：' + error;
  } else if (snapshot) {
    var runtimeText = snapshot.runtime && snapshot.runtime.available === false ? ' · 未找到可用的 Wallpaper Engine 本体' : '';
    status.textContent = '已识别 ' + (snapshot.count || 0) + ' 个项目 · ' + (snapshot.dynamicCount || 0) + ' 个媒体动态 · ' +
      (snapshot.enginePlayableCount || 0) + ' 个 Scene 原生运行 · ' + (snapshot.previewOnlyCount || 0) + ' 个安全预览 · 用时 ' + (snapshot.elapsedMs || 0) + 'ms' + runtimeText;
  } else {
    status.textContent = '等待识别本机 Wallpaper Engine 库';
  }
}

function consumeWallpaperEngineSnapshot(snapshot) {
  wallpaperEngineLibrarySnapshot = snapshot || null;
  wallpaperEngineMediaToken = /^[a-f0-9]{48}$/i.test(String(snapshot && snapshot.mediaToken || ''))
    ? String(snapshot.mediaToken).toLowerCase() : '';
  wallpaperEngineProjects = snapshot && Array.isArray(snapshot.projects)
    ? snapshot.projects.map(normalizeWallpaperEngineProject).filter(Boolean)
    : [];
  renderWallpaperEngineManualRoots();
  updateWallpaperEngineLibraryStatus(snapshot, '');
  renderWallpaperEngineLibrary();
  if (wallpaperEngineSelection.active) {
    var selected = wallpaperEngineProjectById(wallpaperEngineSelection.id);
    if (selected) {
      wallpaperEngineSelection = normalizeWallpaperEngineSelection(Object.assign({}, wallpaperEngineSelection, {
        title: selected.title,
        kind: wallpaperEngineSelection.kind === 'engine' && !selected.enginePlayable ? (selected.playable ? 'media' : 'preview') : wallpaperEngineSelection.kind,
        mediaType: wallpaperEngineSelection.kind === 'engine' && selected.enginePlayable ? 'video' : (wallpaperEngineSelection.kind === 'media' ? selected.mediaType : 'image'),
        mediaAnimated: selected.mediaAnimated,
        projectType: selected.projectType,
        hasPreview: selected.hasPreview,
        previewAnimated: selected.previewAnimated,
        updatedAt: selected.updatedAt
      }));
      saveWallpaperEngineSelection();
    }
  }
}

async function loadWallpaperEngineLibrary(force, showNotice) {
  var api = wallpaperEngineDesktopApi();
  if (!api || typeof api.listWallpaperEngineProjects !== 'function') {
    updateWallpaperEngineLibraryStatus(null, '仅桌面版支持本地壁纸识别');
    if (showNotice) showToast('当前环境不支持 Wallpaper Engine 本地识别');
    return [];
  }
  if (wallpaperEngineLibraryBusy) return wallpaperEngineProjects;
  wallpaperEngineLibraryBusy = true;
  var failure = '';
  updateWallpaperEngineLibraryStatus(null, '');
  renderWallpaperEngineLibrary();
  try {
    var snapshot = await api.listWallpaperEngineProjects({ force: force === true });
    if (!snapshot || snapshot.ok === false) throw new Error(snapshot && snapshot.error || '扫描失败');
    consumeWallpaperEngineSnapshot(snapshot);
    if (showNotice) showToast(snapshot.count ? ('已识别 ' + snapshot.count + ' 个 Wallpaper Engine 项目') : '没有识别到 Wallpaper Engine 项目');
    return wallpaperEngineProjects;
  } catch (e) {
    failure = e.message || '扫描失败';
    wallpaperEngineProjects = [];
    wallpaperEngineLibrarySnapshot = null;
    wallpaperEngineMediaToken = '';
    if (showNotice) showToast('Wallpaper Engine 识别失败');
    return [];
  } finally {
    wallpaperEngineLibraryBusy = false;
    updateWallpaperEngineLibraryStatus(wallpaperEngineLibrarySnapshot, failure);
    renderWallpaperEngineLibrary();
  }
}

async function openWallpaperEngineLibrary() {
  var modal = document.getElementById('wallpaper-engine-modal');
  if (modal) modal.classList.add('show');
  if (!wallpaperEngineLibrarySnapshot) await loadWallpaperEngineLibrary(false, false);
  else renderWallpaperEngineLibrary();
}

function closeWallpaperEngineLibrary() {
  closeWallpaperEngineProjectDetails();
  var modal = document.getElementById('wallpaper-engine-modal');
  if (modal) modal.classList.remove('show');
  clearTimeout(wallpaperEngineSearchRenderTimer);
  wallpaperEngineSearchRenderTimer = 0;
  clearTimeout(wallpaperEnginePreviewScrollTimer);
  wallpaperEnginePreviewScrollTimer = 0;
  disconnectWallpaperEnginePreviewObserver();
  document.querySelectorAll('#wallpaper-engine-grid img[data-animated="1"]').forEach(function (image) {
    image.removeAttribute('src');
    image.classList.remove('loaded');
  });
}

async function refreshWallpaperEngineLibrary() {
  await loadWallpaperEngineLibrary(true, true);
}

async function chooseWallpaperEngineDirectory() {
  var api = wallpaperEngineDesktopApi();
  if (!api || typeof api.chooseWallpaperEngineDirectory !== 'function') {
    showToast('当前环境不支持目录导入');
    return;
  }
  if (wallpaperEngineLibraryBusy) return;
  wallpaperEngineLibraryBusy = true;
  var failure = '';
  updateWallpaperEngineLibraryStatus(null, '');
  renderWallpaperEngineLibrary();
  try {
    var snapshot = await api.chooseWallpaperEngineDirectory();
    if (snapshot && snapshot.canceled) return;
    if (!snapshot || snapshot.ok === false) throw new Error(snapshot && snapshot.error || '导入失败');
    consumeWallpaperEngineSnapshot(snapshot);
    showToast('目录已加入壁纸索引，共识别 ' + (snapshot.count || 0) + ' 个项目');
  } catch (e) {
    failure = e.message || '导入失败';
    showToast(e.message || 'Wallpaper Engine 目录导入失败');
  } finally {
    wallpaperEngineLibraryBusy = false;
    updateWallpaperEngineLibraryStatus(wallpaperEngineLibrarySnapshot, failure);
    renderWallpaperEngineLibrary();
  }
}

async function chooseWallpaperEngineProjectFile() {
  var api = wallpaperEngineDesktopApi();
  if (!api || typeof api.chooseWallpaperEngineProjectFile !== 'function') {
    showToast('当前环境不支持 Wallpaper Engine 场景包导入');
    return;
  }
  if (wallpaperEngineLibraryBusy) return;
  wallpaperEngineLibraryBusy = true;
  var failure = '';
  updateWallpaperEngineLibraryStatus(null, '');
  renderWallpaperEngineLibrary();
  try {
    var snapshot = await api.chooseWallpaperEngineProjectFile();
    if (snapshot && snapshot.canceled) return;
    if (!snapshot || snapshot.ok === false) throw new Error(snapshot && snapshot.error || '导入失败');
    consumeWallpaperEngineSnapshot(snapshot);
    showToast('Wallpaper Engine 项目已加入索引；Scene 将由本机官方引擎实时运行');
  } catch (e) {
    failure = e.message || '项目文件导入失败';
    showToast(failure);
  } finally {
    wallpaperEngineLibraryBusy = false;
    updateWallpaperEngineLibraryStatus(wallpaperEngineLibrarySnapshot, failure);
    renderWallpaperEngineLibrary();
  }
}

async function removeWallpaperEngineDirectory(rootId) {
  var api = wallpaperEngineDesktopApi();
  if (!api || typeof api.removeWallpaperEngineDirectory !== 'function') return;
  if (wallpaperEngineLibraryBusy) return;
  wallpaperEngineLibraryBusy = true;
  updateWallpaperEngineLibraryStatus(null, '');
  renderWallpaperEngineLibrary();
  var failure = '';
  try {
    var snapshot = await api.removeWallpaperEngineDirectory(rootId);
    if (!snapshot || snapshot.ok === false) throw new Error(snapshot && snapshot.error || '移除失败');
    consumeWallpaperEngineSnapshot(snapshot);
    showToast('已移除手动导入目录，Steam 自动识别不受影响');
  } catch (e) {
    failure = e.message || '目录移除失败';
    showToast(e.message || '目录移除失败');
  } finally {
    wallpaperEngineLibraryBusy = false;
    updateWallpaperEngineLibraryStatus(wallpaperEngineLibrarySnapshot, failure);
    renderWallpaperEngineLibrary();
  }
}

function toggleFavoriteWallpaperEngineItem(id) {
  id = String(id || '');
  if (favoriteWallpaperEngineIds.has(id)) favoriteWallpaperEngineIds.delete(id);
  else favoriteWallpaperEngineIds.add(id);
  saveWallpaperEngineIdSet(WALLPAPER_ENGINE_FAVORITE_STORE_KEY, favoriteWallpaperEngineIds);
  renderWallpaperEngineLibrary();
}

function hideWallpaperEngineItem(id) {
  id = String(id || '');
  hiddenWallpaperEngineIds.add(id);
  saveWallpaperEngineIdSet(WALLPAPER_ENGINE_HIDDEN_STORE_KEY, hiddenWallpaperEngineIds);
  renderWallpaperEngineLibrary();
}

function restoreHiddenWallpaperEngineItems() {
  if (!hiddenWallpaperEngineIds.size) {
    showToast('没有已隐藏的壁纸');
    return;
  }
  hiddenWallpaperEngineIds.clear();
  saveWallpaperEngineIdSet(WALLPAPER_ENGINE_HIDDEN_STORE_KEY, hiddenWallpaperEngineIds);
  renderWallpaperEngineLibrary();
  showToast('已恢复全部隐藏壁纸');
}

function bindWallpaperEngineLibraryEvents() {
  var desktopApi = wallpaperEngineDesktopApi();
  if (!wallpaperEngineHostBoundsUnsubscribe && desktopApi && typeof desktopApi.onWallpaperEngineHostBoundsChanged === 'function') {
    wallpaperEngineHostBoundsUnsubscribe = desktopApi.onWallpaperEngineHostBoundsChanged(function (payload) {
      handleWallpaperEngineHostBoundsChange(payload || {});
    });
  }
  var grid = document.getElementById('wallpaper-engine-grid');
  if (grid && !grid._wallpaperEngineBound) {
    grid._wallpaperEngineBound = true;
    grid.addEventListener('scroll', scheduleWallpaperEnginePreviewViewportUpdate, { passive: true });
    grid.addEventListener('click', function (event) {
      var action = event.target && event.target.closest ? event.target.closest('[data-wallpaper-action]') : null;
      if (action) {
        event.preventDefault();
        event.stopPropagation();
        var actionName = action.getAttribute('data-wallpaper-action');
        var id = action.getAttribute('data-wallpaper-id');
        if (actionName === 'favorite') toggleFavoriteWallpaperEngineItem(id);
        else if (actionName === 'hide') hideWallpaperEngineItem(id);
        else if (actionName === 'details') showWallpaperEngineProjectDetails(id);
        else if (actionName === 'load-more') {
          wallpaperEngineRenderLimit += WALLPAPER_ENGINE_RENDER_BATCH;
          renderWallpaperEngineLibrary(true);
        }
        return;
      }
      var card = event.target && event.target.closest ? event.target.closest('[data-wallpaper-id]') : null;
      if (card) activateWallpaperEngineItem(card.getAttribute('data-wallpaper-id'));
    });
    grid.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target && event.target.closest && event.target.closest('[data-wallpaper-action]')) return;
      var card = event.target && event.target.closest ? event.target.closest('.wallpaper-engine-card[data-wallpaper-id]') : null;
      if (!card || event.target !== card) return;
      event.preventDefault();
      activateWallpaperEngineItem(card.getAttribute('data-wallpaper-id'));
    });
  }
  var roots = document.getElementById('wallpaper-engine-manual-roots');
  if (roots && !roots._wallpaperEngineBound) {
    roots._wallpaperEngineBound = true;
    roots.addEventListener('click', function (event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-wallpaper-action="remove-root"]') : null;
      if (button) removeWallpaperEngineDirectory(button.getAttribute('data-root-id'));
    });
  }
  if (!document._wallpaperEngineKeyBound) {
    document._wallpaperEngineKeyBound = true;
    document.addEventListener('pointermove', queueWallpaperEnginePointerActivity, { passive: true, capture: true });
    document.addEventListener('mousemove', queueWallpaperEnginePointerActivity, { passive: true, capture: true });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        var drawer = document.getElementById('wallpaper-engine-details-drawer');
        if (drawer && drawer.classList.contains('show')) closeWallpaperEngineProjectDetails();
        else closeWallpaperEngineLibrary();
      }
    });
    document.addEventListener('visibilitychange', function () {
      var video = document.getElementById('wallpaper-engine-video');
      if (!wallpaperEngineSelection.active) return;
      var item = wallpaperEngineProjectById(wallpaperEngineSelection.id);
      if (wallpaperEngineSelection.kind === 'engine') {
        if (wallpaperEngineDesktopPreviewActive) return;
        if (wallpaperEngineUsesDesktopHostLifecycle()) {
          if (!document.hidden && item && wallpaperEngineHostBoundsPreparing) {
            wallpaperEngineHostBoundsPreparing = false;
            restartWallpaperEngineAfterHostBoundsChange();
          }
          return;
        }
        if (document.hidden) {
          window.__mineradioPrepareWallpaperEngineHostBoundsChange(wallpaperEngineNativeSessionId, 'document-hidden');
          stopWallpaperEngineNativeSession();
        } else if (item && wallpaperEngineHostBoundsPreparing) {
          wallpaperEngineHostBoundsPreparing = false;
          restartWallpaperEngineAfterHostBoundsChange();
        }
        return;
      }
      if (wallpaperEngineSelection.mediaType === 'video') {
        if (!video) return;
        if (document.hidden) {
          cancelWallpaperEngineVideoRetry();
          try { video.pause(); } catch (e) { }
        } else if (document.body.classList.contains('wallpaper-engine-active')) {
          var token = wallpaperEngineLayerToken;
          requestWallpaperEngineVideoPlayback(video, item, 'media', token, false, 0);
        }
        return;
      }
      var animatedImage = wallpaperEngineSelection.kind === 'preview'
        ? wallpaperEngineSelection.previewAnimated : wallpaperEngineSelection.mediaAnimated;
      if (!animatedImage || !item) return;
      if (document.hidden) {
        ++wallpaperEngineLayerToken;
        clearWallpaperEngineLayerMedia(0);
      } else {
        applyWallpaperEngineBackground(item, true);
      }
    });
    window.addEventListener('pagehide', function () {
      if (typeof wallpaperEngineHostBoundsUnsubscribe === 'function') {
        try { wallpaperEngineHostBoundsUnsubscribe(); } catch (e) { }
        wallpaperEngineHostBoundsUnsubscribe = null;
      }
      cancelWallpaperEngineSwitchTimer();
      cancelWallpaperEngineVideoRetry();
      cancelWallpaperEngineFirstFrameWait();
      cancelWallpaperEnginePointerActivity();
      ++wallpaperEngineLayerToken;
      stopWallpaperEngineCaptureStream();
      clearWallpaperEngineFreezeFrame(true);
    });
  }
}

function initializeWallpaperEngineLibrary() {
  bindWallpaperEngineLibraryEvents();
  applyWallpaperEngineVisualSettings(false);
  updateWallpaperEngineEntryUi();
  if (!wallpaperEngineSelection.active) return;
  setTimeout(function () {
    loadWallpaperEngineLibrary(false, false).then(function () {
      var item = wallpaperEngineProjectById(wallpaperEngineSelection.id);
      if (item) applyWallpaperEngineBackground(item, true);
      else {
        wallpaperEngineRuntimeError = '项目离线';
        updateWallpaperEngineEntryUi('项目离线 · 已显示原背景');
      }
    });
  }, 120);
}

initializeWallpaperEngineLibrary();
