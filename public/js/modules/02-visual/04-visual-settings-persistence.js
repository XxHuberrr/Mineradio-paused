function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h, s: s, l: l };
}
function hslToRgb(h, s, l) {
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  var r, g, b;
  if (s === 0) r = g = b = l;
  else {
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}
function rgbCss(c, a) {
  if (a == null) return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
}
function clampRange(v, min, max) { return Math.max(min, Math.min(max, v)); }
function normalizeCoverResolution(v) {
  return clampRange(Number(v) || 1, 0.75, 1.55);
}
function normalizePerformanceBackgroundMode(v, liveKeepFallback) {
  var value = String(v || '');
  if (value === 'keep' || liveKeepFallback === true) return 'keep';
  if (value === 'release') return 'release';
  return 'auto';
}
function normalizePerformanceQuality(v) {
  var value = String(v || '');
  return /^(eco|balanced|high|ultra)$/.test(value) ? value : fxDefaults.performanceQuality;
}
function normalizeLyricTextureClarity(v) {
  var value = Number(v);
  if (!isFinite(value)) value = Number(fxDefaults.lyricTextureClarity) || 1;
  // Compatibility with the short-lived 1 / 1.25 / 1.5 experiment.  New
  // archives store the user-facing raster multiplier directly as 1..4.
  if (Math.abs(value - 1.25) < 0.001) return 2;
  if (Math.abs(value - 1.5) < 0.001) return 4;
  return clampRange(Math.round(value), 1, 4);
}
function layoutNumber(value, fallback, min, max) {
  var n = Number(value);
  if (!isFinite(n)) n = Number(fallback);
  if (!isFinite(n)) n = min;
  return clampRange(n, min, max);
}
function layoutInteger(value, fallback, min, max) {
  return Math.round(layoutNumber(value, fallback, min, max));
}
function coverParticleGridForResolution(v) {
  var grid = Math.round(118 * normalizeCoverResolution(v));
  grid = Math.max(88, Math.min(183, grid));
  return grid % 2 ? grid : grid + 1;
}
function coverParticleCountLabel(v) {
  var grid = coverParticleGridForResolution(v);
  return grid + 'x' + grid;
}
function coverTextureSizeForResolution(v) {
  v = normalizeCoverResolution(v);
  if (v >= 1.32) return 512;
  if (v >= 1.10) return 384;
  return 256;
}
var currentFxAutosaveDiskTimer = null;
var currentFxAutosaveDiskPayload = null;
var currentFxAutosaveBootAt = Date.now();
var currentFxAutosaveUserDirty = false;
var currentFxAutosaveLastUserReason = '';
function plainCurrentFxAutosavePayload(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function currentFxAutosaveTimestamp(raw) {
  raw = plainCurrentFxAutosavePayload(raw);
  if (!raw) return 0;
  var n = Number(raw.autosavedAt || raw.savedAt || 0);
  return isFinite(n) ? n : 0;
}
function parseCurrentFxAutosaveText(rawText) {
  if (!rawText) return null;
  try {
    return plainCurrentFxAutosavePayload(JSON.parse(rawText));
  } catch (e) {
    return null;
  }
}
function repairCurrentFxAutosaveLocalMirror(payload) {
  payload = plainCurrentFxAutosavePayload(payload);
  if (!payload) return;
  try {
    localStorage.setItem(CURRENT_FX_AUTOSAVE_STORE_KEY, JSON.stringify(payload));
    try { localStorage.removeItem(LYRIC_LAYOUT_STORE_KEY); } catch (cleanupError) { }
  } catch (e) { }
}
function readDesktopCurrentFxAutosaveRaw() {
  try {
    var bridge = window.desktopWindow;
    if (!bridge || typeof bridge.readCurrentFxAutosaveSync !== 'function') return null;
    var result = bridge.readCurrentFxAutosaveSync();
    return plainCurrentFxAutosavePayload(result && result.payload);
  } catch (e) {
    console.warn('[FxAutosave] desktop read failed:', e);
    return null;
  }
}
function chooseCurrentFxAutosaveRaw(localRaw, diskRaw) {
  if (localRaw && diskRaw) {
    var localHasUserVisual = currentFxAutosaveHasUserVisualState(localRaw);
    var diskHasUserVisual = currentFxAutosaveHasUserVisualState(diskRaw);
    if (diskHasUserVisual && !localHasUserVisual) {
      repairCurrentFxAutosaveLocalMirror(diskRaw);
      return diskRaw;
    }
    if (localHasUserVisual && !diskHasUserVisual) return localRaw;
    if (currentFxAutosaveTimestamp(diskRaw) >= currentFxAutosaveTimestamp(localRaw)) {
      repairCurrentFxAutosaveLocalMirror(diskRaw);
      return diskRaw;
    }
    return localRaw;
  }
  if (diskRaw) {
    repairCurrentFxAutosaveLocalMirror(diskRaw);
    return diskRaw;
  }
  return localRaw;
}
function readCurrentFxAutosaveStorageRaw() {
  var localRaw = null;
  try {
    var rawText = localStorage.getItem(CURRENT_FX_AUTOSAVE_STORE_KEY);
    if (!rawText) rawText = localStorage.getItem(LYRIC_LAYOUT_STORE_KEY);
    localRaw = parseCurrentFxAutosaveText(rawText);
  } catch (e) { }
  var diskRaw = readDesktopCurrentFxAutosaveRaw();
  return chooseCurrentFxAutosaveRaw(localRaw, diskRaw);
}
function readCurrentFxAutosaveRaw() {
  var storedRaw = readCurrentFxAutosaveStorageRaw();
  if (storedRaw) return storedRaw;
  return packagedDefaultLyricLayoutRaw();
}
function normalizeSavedLyricDisplayMode(mode) {
  mode = String(mode || 'single');
  return /^(single|dual|triple|cinema|custom)$/.test(mode) ? mode : 'single';
}
function normalizeSavedLyricTranslationMode(mode) {
  mode = String(mode || 'off');
  return /^(off|current|dual|multi)$/.test(mode) ? mode : 'off';
}
function normalizeSavedLyricMotionStyle(style) {
  style = String(style || 'float');
  return /^(glass|smooth|float|quick|shine|glitch)$/.test(style) ? style : 'float';
}
function readSavedLyricLayoutCriticalFallback(raw, err) {
  raw = plainCurrentFxAutosavePayload(raw);
  if (err) {
    try {
      console.warn('[FxAutosave] startup layout read fallback:', err);
    } catch (logError) { }
  }
  if (!raw) return {};
  return {
    lyricColorMode: raw.lyricColorMode === 'custom' ? 'custom' : 'auto',
    lyricColor: normalizeHexColor(raw.lyricColor || fxDefaults.lyricColor || '#a9b8c8', fxDefaults.lyricColor || '#a9b8c8'),
    lyricHighlightMode: raw.lyricHighlightMode === 'custom' ? 'custom' : 'auto',
    lyricHighlightColor: normalizeHexColor(raw.lyricHighlightColor || fxDefaults.lyricHighlightColor || '#fac900', fxDefaults.lyricHighlightColor || '#fac900'),
    lyricGlowLinked: raw.lyricGlowLinked !== false,
    lyricGlowColor: normalizeHexColor(raw.lyricGlowColor || fxDefaults.lyricGlowColor || '#008aff', fxDefaults.lyricGlowColor || '#008aff'),
    lyricDisplayMode: normalizeSavedLyricDisplayMode(raw.lyricDisplayMode || fxDefaults.lyricDisplayMode),
    lyricTranslationMode: normalizeSavedLyricTranslationMode(raw.lyricTranslationMode || fxDefaults.lyricTranslationMode),
    lyricMotionStyle: normalizeSavedLyricMotionStyle(raw.lyricMotionStyle || fxDefaults.lyricMotionStyle),
    lyricVerticalFloat: raw.lyricVerticalFloat !== false,
    lyricCustomLineCount: layoutInteger(raw.lyricCustomLineCount, fxDefaults.lyricCustomLineCount, 1, 10),
    controlGlassChromaticOffset: layoutNumber(raw.controlGlassChromaticOffset, fxDefaults.controlGlassChromaticOffset, 30, 140)
  };
}
function readSavedLyricLayout() {
  var raw = null;
  try {
    raw = readCurrentFxAutosaveRaw();
    var savedPreset = clampRange(Number(raw.preset) || 0, 0, MAX_VISUAL_PRESET_INDEX);
    if (savedPreset === 3 && raw.visualPresetSchema !== VISUAL_PRESET_SCHEMA) {
      savedPreset = 5;
    }
    var savedBgColor = normalizeHexColor(raw.backgroundColor || '#000000', '#000000');
    var savedBgOpacity = clampRange(raw.backgroundOpacity == null ? fxDefaults.backgroundOpacity : Number(raw.backgroundOpacity), 0, 1);
    var savedWindowBgOpacity = clampRange(raw.windowBackgroundOpacity == null ? fxDefaults.windowBackgroundOpacity : Number(raw.windowBackgroundOpacity), 0, 1);
    var savedBgGlassOpacity = clampRange(raw.backgroundGlassOpacity == null ? fxDefaults.backgroundGlassOpacity : Number(raw.backgroundGlassOpacity), 0, 1);
    var savedBgCropX = layoutNumber(raw.backgroundMediaCropX, fxDefaults.backgroundMediaCropX, 0, 100);
    var savedBgCropY = layoutNumber(raw.backgroundMediaCropY, fxDefaults.backgroundMediaCropY, 0, 100);
    var savedBgZoom = layoutNumber(raw.backgroundMediaZoom, fxDefaults.backgroundMediaZoom, 1, 2.8);
    var savedGlassOffset = layoutNumber(raw.controlGlassChromaticOffset, fxDefaults.controlGlassChromaticOffset, 30, 140);
    var savedPlaylistPanelGlassBlur = clampRange(raw.playlistPanelGlassBlur == null ? fxDefaults.playlistPanelGlassBlur : Number(raw.playlistPanelGlassBlur), 14, 60);
    var savedPlaylistPanelGlassDensity = clampRange(raw.playlistPanelGlassDensity == null ? fxDefaults.playlistPanelGlassDensity : Number(raw.playlistPanelGlassDensity), 0.55, 1);
    var savedPlaylistPanelOpenDuration = clampRange(raw.playlistPanelOpenDuration == null ? fxDefaults.playlistPanelOpenDuration : Number(raw.playlistPanelOpenDuration), 0.08, 0.72);
    var savedPlaylistPanelCloseDuration = clampRange(raw.playlistPanelCloseDuration == null ? fxDefaults.playlistPanelCloseDuration : Number(raw.playlistPanelCloseDuration), 0.06, 0.48);
    var savedBgMode = /^(cover|custom)$/.test(String(raw.backgroundColorMode || '')) ? String(raw.backgroundColorMode) : '';
    var savedBgCustom = savedBgMode
      ? savedBgMode === 'custom'
      : (raw.backgroundColorCustom === true || (raw.backgroundColorCustom !== false && savedBgColor !== '#000000') || savedBgOpacity < 1);
    var savedBgMedia = normalizeCustomBackgroundMedia(raw.backgroundMedia || raw.backgroundImage);
    var savedBgAlbumCover = raw.backgroundAlbumCover === true || !!(savedBgMedia && savedBgMedia.type === 'album');
    var desktopLyricsSchemaReady = raw.desktopLyricsSchema === 'desktop-lyrics-v3';
    var savedShelfCameraMode = normalizeShelfCameraMode(raw.shelfCameraMode || fxDefaults.shelfCameraMode);
    var savedShelfAngleManual = raw.shelfAngleYManual === true;
    var savedShelfAngle = savedShelfAngleManual
      ? clampRange(raw.shelfAngleY == null ? shelfDefaultAngleForCameraMode(savedShelfCameraMode) : Number(raw.shelfAngleY), -30, 30)
      : shelfDefaultAngleForCameraMode(savedShelfCameraMode);
    var savedShelfMode = /^(off|side|stage)$/.test(String(raw.shelf || '')) ? raw.shelf : fxDefaults.shelf;
    var savedShelfPresence = savedShelfMode === 'off' ? 'auto' : normalizeShelfPresence(raw.shelfPresence || fxDefaults.shelfPresence);
    var savedShelfPinnedOpen = savedShelfMode === 'side' && savedShelfPresence === 'always' && raw.shelfPinnedOpen === true;
    return {
      preset: savedPreset,
      intensity: layoutNumber(raw.intensity, fxDefaults.intensity, 0.2, 1.6),
      cinemaShake: layoutNumber(raw.cinemaShake, fxDefaults.cinemaShake, 0, 1.8),
      depth: layoutNumber(raw.depth, fxDefaults.depth, 0.2, 1.8),
      point: layoutNumber(raw.point, fxDefaults.point, 0.5, 2.2),
      speed: layoutNumber(raw.speed, fxDefaults.speed, 0.2, 2.5),
      twist: layoutNumber(raw.twist, fxDefaults.twist, 0, 0.6),
      color: layoutNumber(raw.color, fxDefaults.color, 0.5, 2.0),
      scatter: layoutNumber(raw.scatter, fxDefaults.scatter, 0, 0.5),
      bgFade: layoutNumber(raw.bgFade, fxDefaults.bgFade, 0, 1.2),
      bloomStrength: layoutNumber(raw.bloomStrength, fxDefaults.bloomStrength, 0, 1.6),
      lyricGlowStrength: layoutNumber(raw.lyricGlowStrength, fxDefaults.lyricGlowStrength, 0, 0.85),
      lyricBackgroundAdapt: layoutNumber(raw.lyricBackgroundAdapt, fxDefaults.lyricBackgroundAdapt, 0, 1),
      lyricScale: layoutNumber(raw.lyricScale, 1, 0.35, 1.65),
      lyricOffsetX: layoutNumber(raw.lyricOffsetX, 0, -4.0, 4.0),
      lyricOffsetY: layoutNumber(raw.lyricOffsetY, 0, -2.4, 2.7),
      lyricOffsetZ: layoutNumber(raw.lyricOffsetZ, 0, -3.2, 3.2),
      lyricTiltX: layoutNumber(raw.lyricTiltX, 0, -84, 84),
      lyricTiltY: layoutNumber(raw.lyricTiltY, 0, -84, 84),
      lyricCameraLock: !!raw.lyricCameraLock,
      lyricColorMode: raw.lyricColorMode === 'custom' ? 'custom' : 'auto',
      lyricColor: normalizeHexColor(raw.lyricColor || '#a9b8c8'),
      lyricHighlightMode: raw.lyricHighlightMode === 'custom' ? 'custom' : 'auto',
      lyricHighlightColor: normalizeHexColor(raw.lyricHighlightColor || '#fff0b8'),
      lyricGlowLinked: raw.lyricGlowLinked !== false,
      lyricGlowColor: normalizeHexColor(raw.lyricGlowColor || '#9db8cf'),
      lyricDisplayMode: normalizeSavedLyricDisplayMode(raw.lyricDisplayMode || fxDefaults.lyricDisplayMode),
      lyricTranslationMode: normalizeSavedLyricTranslationMode(raw.lyricTranslationMode || fxDefaults.lyricTranslationMode),
      lyricMotionStyle: normalizeSavedLyricMotionStyle(raw.lyricMotionStyle || fxDefaults.lyricMotionStyle),
      lyricVerticalFloat: raw.lyricVerticalFloat !== false,
      lyricCustomLineCount: layoutInteger(raw.lyricCustomLineCount, fxDefaults.lyricCustomLineCount, 1, 10),
      lyricGlitchCameraBind: !!raw.lyricGlitchCameraBind,
      lyricGlitchIntensity: layoutNumber(raw.lyricGlitchIntensity, fxDefaults.lyricGlitchIntensity, 0, 1.5),
      lyricGlitchSlice: layoutNumber(raw.lyricGlitchSlice, fxDefaults.lyricGlitchSlice, 0, 1.4),
      lyricGlitchChroma: layoutNumber(raw.lyricGlitchChroma, fxDefaults.lyricGlitchChroma, 0, 1.6),
      lyricGlitchRate: layoutNumber(raw.lyricGlitchRate, fxDefaults.lyricGlitchRate, 0.45, 2.2),
      lyricGlitchJitter: layoutNumber(raw.lyricGlitchJitter, fxDefaults.lyricGlitchJitter, 0, 1.8),
      lyricContextOpacity: layoutNumber(raw.lyricContextOpacity, fxDefaults.lyricContextOpacity, 0.25, 1),
      lyricContextSpread: layoutNumber(raw.lyricContextSpread, fxDefaults.lyricContextSpread, 0.60, 2.40),
      lyricTranslationGap: layoutNumber(raw.lyricTranslationGap, fxDefaults.lyricTranslationGap, 0.28, 2.20),
      lyricTranslationScale: layoutNumber(raw.lyricTranslationScale, fxDefaults.lyricTranslationScale, 0.46, 1.12),
      lyricTranslationOpacity: layoutNumber(raw.lyricTranslationOpacity, fxDefaults.lyricTranslationOpacity, 0.20, 1),
      lyricEdgeFade: layoutNumber(raw.lyricEdgeFade, fxDefaults.lyricEdgeFade, 0, 1),
      lyricMotionSoftness: layoutNumber(raw.lyricMotionSoftness, fxDefaults.lyricMotionSoftness, 0.15, 1.2),
      lyricFont: normalizeLyricFontKey(raw.lyricFont),
      lyricLetterSpacing: layoutNumber(raw.lyricLetterSpacing, 0, -0.04, 0.18),
      lyricLineHeight: layoutNumber(raw.lyricLineHeight, 1, 0.72, 1.80),
      lyricWeight: layoutInteger(raw.lyricWeight, 900, 500, 900),
      lyricTextureClarity: normalizeLyricTextureClarity(raw.lyricTextureClarity),
      lyricGlow: raw.lyricGlow !== false,
      lyricGlowBeat: raw.lyricGlowBeat !== false,
      lyricGlowParticles: !!raw.lyricGlowParticles,
      lyricVerticalFloat: raw.lyricVerticalFloat !== false,
      backgroundStarRiver: raw.backgroundStarRiver !== false,
      lyricPauseHold: raw.lyricPauseHold !== false,
      floatLayer: raw.floatLayer === true,
      cinema: raw.cinema !== false,
      bloom: raw.bloom === true,
      edge: raw.edge === true,
      aiDepth: raw.aiDepth === true,
      particleLyrics: raw.particleLyrics !== false,
      backCover: raw.backCover === true,
      visualTintMode: raw.visualTintMode === 'custom' ? 'custom' : 'auto',
      visualTintColor: normalizeHexColor(raw.visualTintColor || '#9db8cf'),
      uiAccentColor: normalizeHexColor(
        raw.uiAccentColor || fxDefaults.uiAccentColor || '#ffffff',
        fxDefaults.uiAccentColor || '#ffffff'
      ),
      homeAccentColor: normalizeHexColor(raw.homeAccentColor || '#00f5d4'),
      homeIconColor: normalizeHexColor(raw.homeIconColor || fxDefaults.homeIconColor || '#f4d28a', '#f4d28a'),
      visualIconColor: normalizeHexColor(raw.visualIconColor || fxDefaults.visualIconColor || '#7fd8ff', '#7fd8ff'),
      backgroundColorMode: savedBgCustom ? 'custom' : 'cover',
      backgroundColor: savedBgColor,
      backgroundOpacity: savedBgOpacity,
      windowBackgroundOpacity: savedWindowBgOpacity,
      backgroundGlassOpacity: savedBgGlassOpacity,
      controlGlassChromaticOffset: savedGlassOffset,
      playlistPanelGlassBlur: savedPlaylistPanelGlassBlur,
      playlistPanelGlassDensity: savedPlaylistPanelGlassDensity,
      playlistPanelOpenDuration: savedPlaylistPanelOpenDuration,
      playlistPanelCloseDuration: savedPlaylistPanelCloseDuration,
      backgroundColorCustom: savedBgCustom,
      backgroundImage: savedBgAlbumCover ? '' : normalizeCustomBackgroundImage(raw.backgroundImage),
      backgroundMedia: savedBgAlbumCover ? null : savedBgMedia,
      backgroundAlbumCover: savedBgAlbumCover,
      backgroundMediaCropX: savedBgCropX,
      backgroundMediaCropY: savedBgCropY,
      backgroundMediaZoom: savedBgZoom,
      desktopLyrics: raw.desktopLyrics === true,
      desktopLyricsSize: clampRange(Number(raw.desktopLyricsSize) || fxDefaults.desktopLyricsSize, 0.72, 1.55),
      desktopLyricsOpacity: clampRange(raw.desktopLyricsOpacity == null ? fxDefaults.desktopLyricsOpacity : Number(raw.desktopLyricsOpacity), 0.28, 1),
      desktopLyricsY: clampRange(raw.desktopLyricsY == null ? fxDefaults.desktopLyricsY : Number(raw.desktopLyricsY), 0.08, 0.92),
      desktopLyricsClickThrough: desktopLyricsSchemaReady ? raw.desktopLyricsClickThrough === true : fxDefaults.desktopLyricsClickThrough,
      desktopLyricsCinema: desktopLyricsSchemaReady ? raw.desktopLyricsCinema !== false : fxDefaults.desktopLyricsCinema,
      desktopLyricsHighlight: desktopLyricsSchemaReady ? raw.desktopLyricsHighlight === true : fxDefaults.desktopLyricsHighlight,
      desktopLyricsFps: desktopLyricsSchemaReady ? normalizeDesktopLyricsFps(raw.desktopLyricsFps) : fxDefaults.desktopLyricsFps,
      performanceBackground: normalizePerformanceBackgroundMode(raw.performanceBackground, raw.liveBackgroundKeep === true),
      performanceQuality: normalizePerformanceQuality(raw.performanceQuality),
      foregroundFpsMode: normalizeForegroundFpsMode(raw.foregroundFpsMode === 'adaptive' ? 'vsync' : raw.foregroundFpsMode),
      memoryAutoTrimApp: raw.memoryAutoTrimApp !== false,
      memoryAutoTrimOnBackground: raw.memoryAutoTrimOnBackground !== false,
      memoryAutoSystemTrim: raw.memoryAutoSystemTrim === true,
      memorySystemAutoElevate: raw.memorySystemAutoElevate === true,
      memorySystemIntervalMin: clampRange(Math.round(raw.memorySystemIntervalMin == null ? fxDefaults.memorySystemIntervalMin : Number(raw.memorySystemIntervalMin)), 5, 180),
      memorySystemThresholdPercent: clampRange(Math.round(raw.memorySystemThresholdPercent == null ? fxDefaults.memorySystemThresholdPercent : Number(raw.memorySystemThresholdPercent)), 50, 98),
      memorySystemMask: clampRange(Math.round(raw.memorySystemMask == null ? fxDefaults.memorySystemMask : Number(raw.memorySystemMask)), 1, 29),
      memorySafetyRevision: fxDefaults.memorySafetyRevision,
      liveBackgroundKeep: normalizePerformanceBackgroundMode(raw.performanceBackground, raw.liveBackgroundKeep === true) === 'keep',
      sonicGroundAmplitude: clampRange(raw.sonicGroundAmplitude == null ? fxDefaults.sonicGroundAmplitude : Number(raw.sonicGroundAmplitude), 0, 100),
      sonicGroundMotionSpeed: clampRange(raw.sonicGroundMotionSpeed == null ? fxDefaults.sonicGroundMotionSpeed : Number(raw.sonicGroundMotionSpeed), 0, 100),
      sonicGroundDensity: clampRange(raw.sonicGroundDensity == null ? fxDefaults.sonicGroundDensity : Number(raw.sonicGroundDensity), 0, 100),
      sonicGroundRange: clampRange(raw.sonicGroundRange == null ? fxDefaults.sonicGroundRange : Number(raw.sonicGroundRange), 0, 100),
      sonicGroundLower: clampRange(raw.sonicGroundLower == null ? fxDefaults.sonicGroundLower : Number(raw.sonicGroundLower), 0, 100),
      sonicGroundDepth: clampRange(raw.sonicGroundDepth == null ? fxDefaults.sonicGroundDepth : Number(raw.sonicGroundDepth), 0, 100),
      sonicGroundAutoRotate: clampRange(raw.sonicGroundAutoRotate == null ? fxDefaults.sonicGroundAutoRotate : Number(raw.sonicGroundAutoRotate), 0, 100),
      sonicGroundColorMode: raw.sonicGroundColorMode === 'custom' ? 'custom' : 'cover',
      sonicGroundBaseColor: normalizeHexColor(raw.sonicGroundBaseColor || fxDefaults.sonicGroundBaseColor, fxDefaults.sonicGroundBaseColor),
      sonicGroundCoolColor: normalizeHexColor(raw.sonicGroundCoolColor || fxDefaults.sonicGroundCoolColor, fxDefaults.sonicGroundCoolColor),
      sonicGroundWarmColor: normalizeHexColor(raw.sonicGroundWarmColor || fxDefaults.sonicGroundWarmColor, fxDefaults.sonicGroundWarmColor),
      sonicGroundAccentColor: normalizeHexColor(raw.sonicGroundAccentColor || fxDefaults.sonicGroundAccentColor, fxDefaults.sonicGroundAccentColor),
      sonicGroundGlow: clampRange(raw.sonicGroundGlow == null ? fxDefaults.sonicGroundGlow : Number(raw.sonicGroundGlow), 0, 100),
      sonicGroundSubBass: clampRange(raw.sonicGroundSubBass == null ? fxDefaults.sonicGroundSubBass : Number(raw.sonicGroundSubBass), 0, 100),
      sonicGroundBass: clampRange(raw.sonicGroundBass == null ? fxDefaults.sonicGroundBass : Number(raw.sonicGroundBass), 0, 100),
      sonicGroundLowMid: clampRange(raw.sonicGroundLowMid == null ? fxDefaults.sonicGroundLowMid : Number(raw.sonicGroundLowMid), 0, 100),
      sonicGroundMid: clampRange(raw.sonicGroundMid == null ? fxDefaults.sonicGroundMid : Number(raw.sonicGroundMid), 0, 100),
      sonicGroundHighMid: clampRange(raw.sonicGroundHighMid == null ? fxDefaults.sonicGroundHighMid : Number(raw.sonicGroundHighMid), 0, 100),
      sonicGroundPresence: clampRange(raw.sonicGroundPresence == null ? fxDefaults.sonicGroundPresence : Number(raw.sonicGroundPresence), 0, 100),
      sonicGroundBrilliance: clampRange(raw.sonicGroundBrilliance == null ? fxDefaults.sonicGroundBrilliance : Number(raw.sonicGroundBrilliance), 0, 100),
      sonicGroundAir: clampRange(raw.sonicGroundAir == null ? fxDefaults.sonicGroundAir : Number(raw.sonicGroundAir), 0, 100),
      sonicGroundFloatingEnabled: raw.sonicGroundFloatingEnabled !== false,
      sonicGroundFloatingIntensity: clampRange(raw.sonicGroundFloatingIntensity == null ? fxDefaults.sonicGroundFloatingIntensity : Number(raw.sonicGroundFloatingIntensity), 0, 100),
      sonicGroundFloatingMinSize: clampRange(raw.sonicGroundFloatingMinSize == null ? fxDefaults.sonicGroundFloatingMinSize : Number(raw.sonicGroundFloatingMinSize), 0, 100),
      sonicGroundFloatingMaxSize: clampRange(raw.sonicGroundFloatingMaxSize == null ? fxDefaults.sonicGroundFloatingMaxSize : Number(raw.sonicGroundFloatingMaxSize), 0, 100),
      sonicGroundFloatingSpeed: clampRange(raw.sonicGroundFloatingSpeed == null ? fxDefaults.sonicGroundFloatingSpeed : Number(raw.sonicGroundFloatingSpeed), 0, 100),
      sonicGroundFloatingCount: clampRange(raw.sonicGroundFloatingCount == null ? fxDefaults.sonicGroundFloatingCount : Number(raw.sonicGroundFloatingCount), 0, 100),
      sonicAudioMonitorEnabled: raw.sonicAudioMonitorEnabled !== false,
      sonicAudioAutoTrack: raw.sonicAudioAutoTrack !== false,
      sonicAudioSensitivity: clampRange(raw.sonicAudioSensitivity == null ? fxDefaults.sonicAudioSensitivity : Number(raw.sonicAudioSensitivity), 0, 100),
      sonicAudioBandStart: clampRange(raw.sonicAudioBandStart == null ? fxDefaults.sonicAudioBandStart : Number(raw.sonicAudioBandStart), 0, 510),
      sonicAudioBandEnd: clampRange(raw.sonicAudioBandEnd == null ? fxDefaults.sonicAudioBandEnd : Number(raw.sonicAudioBandEnd), 2, 512),
      sonicAudioThreshold: clampRange(raw.sonicAudioThreshold == null ? fxDefaults.sonicAudioThreshold : Number(raw.sonicAudioThreshold), 0, 100),
      sonicAudioPulseStrength: clampRange(raw.sonicAudioPulseStrength == null ? fxDefaults.sonicAudioPulseStrength : Number(raw.sonicAudioPulseStrength), 0, 100),
      sonicWorkshopInputGain: clampRange(raw.sonicWorkshopInputGain == null ? fxDefaults.sonicWorkshopInputGain : Number(raw.sonicWorkshopInputGain), 40, 100),
      sonicWorkshopAudioIntensity: clampRange(raw.sonicWorkshopAudioIntensity == null ? fxDefaults.sonicWorkshopAudioIntensity : Number(raw.sonicWorkshopAudioIntensity), 0.3, 2.5),
      sonicWorkshopResponseRange: clampRange(raw.sonicWorkshopResponseRange == null ? fxDefaults.sonicWorkshopResponseRange : Number(raw.sonicWorkshopResponseRange), 0.3, 2),
      sonicWorkshopPeakIntensity: clampRange(raw.sonicWorkshopPeakIntensity == null ? fxDefaults.sonicWorkshopPeakIntensity : Number(raw.sonicWorkshopPeakIntensity), 0, 1.4),
      sonicWorkshopColorMode: raw.sonicWorkshopColorMode === 'custom' ? 'custom' : 'cover',
      sonicWorkshopTheme: /^(coral-mirage|ocean-deep|arctic-blue|arctic-aurora|emerald-forest|cyber-forest|minimal-mono|minimal-monochrome|neon-tokyo|golden-hour|ember-fire|crimson|crimson-sunset|aurora|violet-dream)$/.test(String(raw.sonicWorkshopTheme || '')) ? raw.sonicWorkshopTheme : fxDefaults.sonicWorkshopTheme,
      sonicWorkshopCustomColor: normalizeHexColor(raw.sonicWorkshopCustomColor || fxDefaults.sonicWorkshopCustomColor || '#cb6c89', fxDefaults.sonicWorkshopCustomColor || '#cb6c89'),
      sonicWorkshopBaseColorMode: raw.sonicWorkshopBaseColorMode === 'custom' ? 'custom' : 'cover',
      sonicWorkshopBaseColor: normalizeHexColor(raw.sonicWorkshopBaseColor || fxDefaults.sonicWorkshopBaseColor || '#16060f', fxDefaults.sonicWorkshopBaseColor || '#16060f'),
      sonicWorkshopWarmColorMode: raw.sonicWorkshopWarmColorMode === 'custom' ? 'custom' : 'cover',
      sonicWorkshopWarmColor: normalizeHexColor(raw.sonicWorkshopWarmColor || fxDefaults.sonicWorkshopWarmColor || '#cb6c89', fxDefaults.sonicWorkshopWarmColor || '#cb6c89'),
      sonicWorkshopCoolColorMode: raw.sonicWorkshopCoolColorMode === 'custom' ? 'custom' : 'cover',
      sonicWorkshopCoolColor: normalizeHexColor(raw.sonicWorkshopCoolColor || fxDefaults.sonicWorkshopCoolColor || '#99c4ff', fxDefaults.sonicWorkshopCoolColor || '#99c4ff'),
      sonicWorkshopRippleColorMode: raw.sonicWorkshopRippleColorMode === 'custom' ? 'custom' : 'cover',
      sonicWorkshopRippleColor: normalizeHexColor(raw.sonicWorkshopRippleColor || fxDefaults.sonicWorkshopRippleColor || '#f8d8ff', fxDefaults.sonicWorkshopRippleColor || '#f8d8ff'),
      sonicWorkshopPeakColorMode: raw.sonicWorkshopPeakColorMode === 'custom' ? 'custom' : 'cover',
      sonicWorkshopPeakColor: normalizeHexColor(raw.sonicWorkshopPeakColor || fxDefaults.sonicWorkshopPeakColor || '#99c4ff', fxDefaults.sonicWorkshopPeakColor || '#99c4ff'),
      wallpaperMode: false,
      wallpaperOpacity: clampRange(raw.wallpaperOpacity == null ? fxDefaults.wallpaperOpacity : Number(raw.wallpaperOpacity), 0.35, 1),
      wallpaperFps: normalizeWallpaperFps(raw.wallpaperFps),
      coverResolution: normalizeCoverResolution(raw.coverResolution),
      shelf: savedShelfMode,
      shelfPinnedOpen: savedShelfPinnedOpen,
      shelfCameraMode: savedShelfCameraMode,
      shelfPresence: savedShelfPresence,
      shelfShowPodcasts: raw.shelfShowPodcasts !== false,
      shelfMergeCollections: raw.shelfMergeCollections === true,
      shelfSize: clampRange(raw.shelfSize == null ? fxDefaults.shelfSize : Number(raw.shelfSize), 0.65, 1.45),
      shelfOffsetX: clampRange(raw.shelfOffsetX == null ? fxDefaults.shelfOffsetX : Number(raw.shelfOffsetX), -1.2, 1.2),
      shelfOffsetY: clampRange(raw.shelfOffsetY == null ? fxDefaults.shelfOffsetY : Number(raw.shelfOffsetY), -0.9, 0.9),
      shelfOffsetZ: clampRange(raw.shelfOffsetZ == null ? fxDefaults.shelfOffsetZ : Number(raw.shelfOffsetZ), -0.9, 0.9),
      shelfAngleY: savedShelfAngle,
      shelfAngleYManual: savedShelfAngleManual,
      shelfOpacity: clampRange(raw.shelfOpacity == null ? fxDefaults.shelfOpacity : Number(raw.shelfOpacity), 0.25, 1),
      shelfBgOpacity: clampRange(raw.shelfBgOpacity == null ? fxDefaults.shelfBgOpacity : Number(raw.shelfBgOpacity), 0.25, 0.98),
      shelfAccentColor: normalizeHexColor(raw.shelfAccentColor || fxDefaults.shelfAccentColor, fxDefaults.shelfAccentColor),
      shelfDetailOffsetX: clampRange(raw.shelfDetailOffsetX == null ? fxDefaults.shelfDetailOffsetX : Number(raw.shelfDetailOffsetX), -4.8, 4.8),
      shelfDetailOffsetY: clampRange(raw.shelfDetailOffsetY == null ? fxDefaults.shelfDetailOffsetY : Number(raw.shelfDetailOffsetY), -3.6, 3.6),
      shelfDetailOffsetZ: clampRange(raw.shelfDetailOffsetZ == null ? fxDefaults.shelfDetailOffsetZ : Number(raw.shelfDetailOffsetZ), -3.6, 3.6),
      shelfDetailScale: clampRange(raw.shelfDetailScale == null ? fxDefaults.shelfDetailScale : Number(raw.shelfDetailScale), 0.72, 1.35),
      shelfDetailAngleX: clampRange(raw.shelfDetailAngleX == null ? fxDefaults.shelfDetailAngleX : Number(raw.shelfDetailAngleX), -24, 24),
      shelfDetailAngleY: clampRange(raw.shelfDetailAngleY == null ? fxDefaults.shelfDetailAngleY : Number(raw.shelfDetailAngleY), -28, 28),
      shelfDetailRowGap: clampRange(raw.shelfDetailRowGap == null ? fxDefaults.shelfDetailRowGap : Number(raw.shelfDetailRowGap), 0.72, 1.32),
      shelfDetailOpenDuration: clampRange(raw.shelfDetailOpenDuration == null ? fxDefaults.shelfDetailOpenDuration : Number(raw.shelfDetailOpenDuration), 0.12, 1.2),
      shelfDetailCloseDuration: clampRange(raw.shelfDetailCloseDuration == null ? fxDefaults.shelfDetailCloseDuration : Number(raw.shelfDetailCloseDuration), 0.08, 0.8),
      shelfDetailRowDuration: clampRange(raw.shelfDetailRowDuration == null ? fxDefaults.shelfDetailRowDuration : Number(raw.shelfDetailRowDuration), 0.16, 1.6),
      shelfDetailIntroStrength: clampRange(raw.shelfDetailIntroStrength == null ? fxDefaults.shelfDetailIntroStrength : Number(raw.shelfDetailIntroStrength), 0, 1.8),
      shelfDetailParallax: clampRange(raw.shelfDetailParallax == null ? fxDefaults.shelfDetailParallax : Number(raw.shelfDetailParallax), 0, 1.8),
      shelfSummonOpenDuration: clampRange(raw.shelfSummonOpenDuration == null ? fxDefaults.shelfSummonOpenDuration : Number(raw.shelfSummonOpenDuration), 0.08, 2),
      shelfSummonCloseDuration: clampRange(raw.shelfSummonCloseDuration == null ? fxDefaults.shelfSummonCloseDuration : Number(raw.shelfSummonCloseDuration), 0.08, 1.6),
      shelfSummonSlide: clampRange(raw.shelfSummonSlide == null ? fxDefaults.shelfSummonSlide : Number(raw.shelfSummonSlide), 0, 4),
      shelfSummonStagger: clampRange(raw.shelfSummonStagger == null ? fxDefaults.shelfSummonStagger : Number(raw.shelfSummonStagger), 0, 3),
      shelfSummonScale: clampRange(raw.shelfSummonScale == null ? fxDefaults.shelfSummonScale : Number(raw.shelfSummonScale), 0, 3),
      shelfSummonParallax: clampRange(raw.shelfSummonParallax == null ? fxDefaults.shelfSummonParallax : Number(raw.shelfSummonParallax), 0, 2.5),
      shelfCameraEnterSpeed: clampRange(raw.shelfCameraEnterSpeed == null ? fxDefaults.shelfCameraEnterSpeed : Number(raw.shelfCameraEnterSpeed), 0.2, 1.5),
      shelfCameraExitSpeed: clampRange(raw.shelfCameraExitSpeed == null ? fxDefaults.shelfCameraExitSpeed : Number(raw.shelfCameraExitSpeed), 0.2, 1.5),
      cam: /^(off|gesture)$/.test(String(raw.cam || '')) ? raw.cam : fxDefaults.cam,
      gesturePlayerActions: raw.gesturePlayerActions !== false,
      gestureHandOverlay: raw.gestureHandOverlay !== false,
      gestureSensitivity: /^(steady|balanced|quick)$/.test(String(raw.gestureSensitivity || '')) ? raw.gestureSensitivity : fxDefaults.gestureSensitivity
    };
  } catch (e) {
    return readSavedLyricLayoutCriticalFallback(raw, e);
  }
}
function persistCurrentFxAutosaveDisk(payload, syncDisk) {
  try {
    var bridge = window.desktopWindow;
    if (!bridge) return;
    if (syncDisk && typeof bridge.saveCurrentFxAutosaveSync === 'function') {
      bridge.saveCurrentFxAutosaveSync(payload);
      return;
    }
    if (typeof bridge.saveCurrentFxAutosave === 'function') {
      bridge.saveCurrentFxAutosave(payload).catch(function (e) {
        console.warn('[FxAutosave] async disk write failed:', e);
      });
    }
  } catch (e) {
    console.warn('[FxAutosave] disk write failed:', e);
  }
}
function queueCurrentFxAutosaveDiskWrite(payload) {
  currentFxAutosaveDiskPayload = payload;
  if (currentFxAutosaveDiskTimer) clearTimeout(currentFxAutosaveDiskTimer);
  currentFxAutosaveDiskTimer = setTimeout(function () {
    currentFxAutosaveDiskTimer = null;
    var next = currentFxAutosaveDiskPayload;
    currentFxAutosaveDiskPayload = null;
    if (next) persistCurrentFxAutosaveDisk(next, false);
  }, 220);
}
function writeCurrentFxAutosavePayload(payload, opts) {
  opts = opts || {};
  payload = plainCurrentFxAutosavePayload(payload);
  if (!payload) return false;
  var localOk = true;
  try {
    localStorage.setItem(CURRENT_FX_AUTOSAVE_STORE_KEY, JSON.stringify(payload));
    try { localStorage.removeItem(LYRIC_LAYOUT_STORE_KEY); } catch (cleanupError) { }
  } catch (localError) {
    localOk = false;
    console.warn('[FxAutosave] localStorage write failed, disk mirror will be used:', localError);
  }
  if (opts.syncDisk) {
    if (currentFxAutosaveDiskTimer) {
      clearTimeout(currentFxAutosaveDiskTimer);
      currentFxAutosaveDiskTimer = null;
    }
    currentFxAutosaveDiskPayload = null;
    persistCurrentFxAutosaveDisk(payload, true);
  } else {
    queueCurrentFxAutosaveDiskWrite(payload);
  }
  return localOk;
}
function markCurrentFxAutosaveUserDirty(reason) {
  currentFxAutosaveUserDirty = true;
  currentFxAutosaveLastUserReason = String(reason || currentFxAutosaveLastUserReason || 'user');
}
function currentFxAutosaveSaveReason(opts, fallback) {
  opts = opts || {};
  if (opts.reason) return String(opts.reason).slice(0, 80);
  if (opts.user === true && currentFxAutosaveLastUserReason) return String(currentFxAutosaveLastUserReason).slice(0, 80);
  return String(fallback || 'save').slice(0, 80);
}
function currentFxAutosaveTouchedKeys(reason, payload) {
  reason = String(reason || '').trim();
  payload = plainCurrentFxAutosavePayload(payload) || {};
  var map = {
    archiveApply: null,
    resetFx: null,
    preset: ['preset'],
    lyricFont: ['lyricFont'],
    lyricFontRemove: ['lyricFont'],
    lyricColorAuto: ['lyricColorMode', 'lyricColor'],
    lyricColorCustom: ['lyricColorMode', 'lyricColor'],
    lyricHighlightAuto: ['lyricHighlightMode', 'lyricHighlightColor'],
    lyricHighlightCustom: ['lyricHighlightMode', 'lyricHighlightColor'],
    lyricGlowLinked: ['lyricGlowLinked', 'lyricGlowColor'],
    lyricGlowColor: ['lyricGlowLinked', 'lyricGlowColor'],
    lyricDisplayMode: ['lyricDisplayMode'],
    lyricTranslationMode: ['lyricTranslationMode'],
    lyricMotionStyle: ['lyricMotionStyle'],
    lyricVerticalFloat: ['lyricVerticalFloat'],
    lyricGlitchCameraBind: ['lyricGlitchCameraBind'],
    backgroundColor: ['backgroundColorMode', 'backgroundColor', 'backgroundColorCustom'],
    backgroundColorCover: ['backgroundColorMode', 'backgroundColor', 'backgroundColorCustom'],
    backgroundOpacity: ['backgroundOpacity', 'backgroundColorMode', 'backgroundColorCustom'],
    windowBackgroundOpacity: ['windowBackgroundOpacity'],
    backgroundGlassOpacity: ['backgroundGlassOpacity'],
    backgroundImage: ['backgroundImage', 'backgroundMedia', 'backgroundAlbumCover'],
    backgroundMedia: ['backgroundImage', 'backgroundMedia', 'backgroundAlbumCover'],
    backgroundAlbumCover: ['backgroundAlbumCover', 'backgroundImage', 'backgroundMedia'],
    backgroundMediaCrop: ['backgroundMediaCropX', 'backgroundMediaCropY', 'backgroundMediaZoom'],
    visualTintAuto: ['visualTintMode', 'visualTintColor'],
    visualTintReset: ['visualTintMode', 'visualTintColor'],
    visualTintColor: ['visualTintMode', 'visualTintColor'],
    uiAccentColor: ['uiAccentColor'],
    homeAccentColor: ['homeAccentColor'],
    homeIconColor: ['homeIconColor'],
    visualIconColor: ['visualIconColor'],
    sonicGroundColorAuto: ['sonicGroundColorMode', 'sonicGroundBaseColor', 'sonicGroundCoolColor', 'sonicGroundWarmColor', 'sonicGroundAccentColor'],
    sonicGroundBaseColor: ['sonicGroundColorMode', 'sonicGroundBaseColor'],
    sonicGroundCoolColor: ['sonicGroundColorMode', 'sonicGroundCoolColor'],
    sonicGroundWarmColor: ['sonicGroundColorMode', 'sonicGroundWarmColor'],
    sonicGroundAccentColor: ['sonicGroundColorMode', 'sonicGroundAccentColor'],
    sonicWorkshopColorMode: ['sonicWorkshopColorMode', 'sonicWorkshopTheme', 'sonicWorkshopCustomColor'],
    sonicWorkshopTheme: ['sonicWorkshopColorMode', 'sonicWorkshopTheme', 'sonicWorkshopCustomColor'],
    sonicWorkshopCustomColor: ['sonicWorkshopColorMode', 'sonicWorkshopTheme', 'sonicWorkshopCustomColor'],
    sonicWorkshopRegionColors: ['sonicWorkshopColorMode', 'sonicWorkshopTheme', 'sonicWorkshopCustomColor', 'sonicWorkshopBaseColorMode', 'sonicWorkshopBaseColor', 'sonicWorkshopWarmColorMode', 'sonicWorkshopWarmColor', 'sonicWorkshopCoolColorMode', 'sonicWorkshopCoolColor', 'sonicWorkshopRippleColorMode', 'sonicWorkshopRippleColor', 'sonicWorkshopPeakColorMode', 'sonicWorkshopPeakColor'],
    sonicWorkshopBaseColor: ['sonicWorkshopBaseColorMode', 'sonicWorkshopBaseColor'],
    sonicWorkshopWarmColor: ['sonicWorkshopWarmColorMode', 'sonicWorkshopWarmColor'],
    sonicWorkshopCoolColor: ['sonicWorkshopCoolColorMode', 'sonicWorkshopCoolColor'],
    sonicWorkshopRippleColor: ['sonicWorkshopRippleColorMode', 'sonicWorkshopRippleColor'],
    sonicWorkshopPeakColor: ['sonicWorkshopPeakColorMode', 'sonicWorkshopPeakColor'],
    shelfMode: ['shelf', 'shelfPinnedOpen', 'shelfPresence'],
    shelfPinnedOpen: ['shelfPinnedOpen', 'shelfPresence'],
    shelfCameraMode: ['shelfCameraMode', 'shelfAngleY', 'shelfAngleYManual'],
    shelfPresence: ['shelfPresence', 'shelfPinnedOpen'],
    shelfAccentColor: ['shelfAccentColor'],
    desktopLyrics: ['desktopLyrics'],
    desktopLyricsClickThrough: ['desktopLyricsClickThrough'],
    desktopLyricsFps: ['desktopLyricsFps'],
    performanceBackground: ['performanceBackground', 'liveBackgroundKeep'],
    performanceQuality: ['performanceQuality'],
    liveBackgroundKeep: ['performanceBackground', 'liveBackgroundKeep'],
    memorySystemMask: ['memorySystemMask'],
    memorySystemIntervalMin: ['memorySystemIntervalMin'],
    memorySystemThresholdPercent: ['memorySystemThresholdPercent']
  };
  if (Object.prototype.hasOwnProperty.call(map, reason)) return map[reason];
  if (reason.indexOf('reset:') === 0) {
    var resetKey = reason.slice(6);
    if (resetKey === 'shelfAngleY') return ['shelfAngleY', 'shelfAngleYManual'];
    return Object.prototype.hasOwnProperty.call(payload, resetKey) ? [resetKey] : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, reason)) {
    if (reason === 'lyricCustomLineCount') return ['lyricCustomLineCount', 'lyricDisplayMode'];
    if (reason === 'backgroundOpacity') return map.backgroundOpacity;
    if (reason === 'controlGlassChromaticOffset') return ['controlGlassChromaticOffset'];
    return [reason];
  }
  return null;
}
function scopeCurrentFxAutosavePayload(payload, opts) {
  opts = opts || {};
  payload = plainCurrentFxAutosavePayload(payload);
  if (!payload || opts.user !== true || opts.force === true) return payload;
  var keys = currentFxAutosaveTouchedKeys(currentFxAutosaveSaveReason(opts, ''), payload);
  if (!keys || !keys.length) return payload;
  var base = plainCurrentFxAutosavePayload(readCurrentFxAutosaveStorageRaw()) || {};
  var scoped = Object.assign({}, base, {
    currentAutosaveSchema: CURRENT_FX_AUTOSAVE_SCHEMA,
    autosavedAt: payload.autosavedAt || Date.now(),
    autosaveUser: true,
    autosaveReason: payload.autosaveReason || currentFxAutosaveSaveReason(opts, 'scoped'),
    visualPresetSchema: payload.visualPresetSchema || base.visualPresetSchema || VISUAL_PRESET_SCHEMA,
    desktopLyricsSchema: payload.desktopLyricsSchema || base.desktopLyricsSchema || 'desktop-lyrics-v3'
  });
  keys.forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) scoped[key] = payload[key];
  });
  return scoped;
}
function currentFxAutosaveHasUserVisualState(raw) {
  raw = plainCurrentFxAutosavePayload(raw);
  if (!raw) return false;
  if (raw.autosaveUser === true) return true;
  if (raw.lyricColorMode === 'custom' || raw.lyricHighlightMode === 'custom') return true;
  if (raw.lyricGlowLinked === false) return true;
  if (normalizeHexColor(raw.lyricColor || fxDefaults.lyricColor, fxDefaults.lyricColor) !== normalizeHexColor(fxDefaults.lyricColor, '#a9b8c8')) return true;
  if (normalizeHexColor(raw.lyricHighlightColor || fxDefaults.lyricHighlightColor, fxDefaults.lyricHighlightColor) !== normalizeHexColor(fxDefaults.lyricHighlightColor, '#fac900')) return true;
  if (normalizeHexColor(raw.lyricGlowColor || fxDefaults.lyricGlowColor, fxDefaults.lyricGlowColor) !== normalizeHexColor(fxDefaults.lyricGlowColor, '#008aff')) return true;
  if (layoutNumber(raw.controlGlassChromaticOffset, fxDefaults.controlGlassChromaticOffset, 30, 140) !== layoutNumber(fxDefaults.controlGlassChromaticOffset, 90, 30, 140)) return true;
  return false;
}
function currentFxAutosavePayloadLooksDefaultCritical(payload) {
  payload = plainCurrentFxAutosavePayload(payload);
  if (!payload) return true;
  return (payload.lyricColorMode !== 'custom')
    && (payload.lyricHighlightMode !== 'custom')
    && payload.lyricGlowLinked !== false
    && normalizeHexColor(payload.lyricColor || fxDefaults.lyricColor, fxDefaults.lyricColor) === normalizeHexColor(fxDefaults.lyricColor, '#a9b8c8')
    && normalizeHexColor(payload.lyricHighlightColor || fxDefaults.lyricHighlightColor, fxDefaults.lyricHighlightColor) === normalizeHexColor(fxDefaults.lyricHighlightColor, '#fac900')
    && normalizeHexColor(payload.lyricGlowColor || fxDefaults.lyricGlowColor, fxDefaults.lyricGlowColor) === normalizeHexColor(fxDefaults.lyricGlowColor, '#008aff')
    && layoutNumber(payload.controlGlassChromaticOffset, fxDefaults.controlGlassChromaticOffset, 30, 140) === layoutNumber(fxDefaults.controlGlassChromaticOffset, 90, 30, 140);
}
function shouldSkipCurrentFxAutosaveWrite(payload, opts) {
  opts = opts || {};
  if (opts.force === true || opts.user === true) return false;
  var storedRaw = readCurrentFxAutosaveStorageRaw();
  if (currentFxAutosaveHasUserVisualState(storedRaw) && currentFxAutosavePayloadLooksDefaultCritical(payload)) return true;
  if (currentFxAutosaveUserDirty) return false;
  return Date.now() - currentFxAutosaveBootAt < 7000;
}
function saveCurrentFxAutosavePatch(patch, opts) {
  opts = opts || {};
  patch = plainCurrentFxAutosavePayload(patch);
  if (!patch) return false;
  if (opts.user === true) markCurrentFxAutosaveUserDirty(opts.reason || 'patch');
  var base = readCurrentFxAutosaveRaw();
  var payload = Object.assign({}, plainCurrentFxAutosavePayload(base) || {}, patch, {
    currentAutosaveSchema: CURRENT_FX_AUTOSAVE_SCHEMA,
    autosavedAt: Date.now(),
    autosaveUser: opts.user === true,
    autosaveReason: currentFxAutosaveSaveReason(opts, 'patch')
  });
  if (!payload.visualPresetSchema) payload.visualPresetSchema = VISUAL_PRESET_SCHEMA;
  if (!payload.desktopLyricsSchema) payload.desktopLyricsSchema = 'desktop-lyrics-v3';
  payload = scopeCurrentFxAutosavePayload(payload, opts);
  if (shouldSkipCurrentFxAutosaveWrite(payload, opts)) return false;
  return writeCurrentFxAutosavePayload(payload, opts);
}
function currentFxAutosaveCriticalPatch() {
  if (!fx) return {};
  return {
    lyricColorMode: fx.lyricColorMode === 'custom' ? 'custom' : 'auto',
    lyricColor: normalizeHexColor(fx.lyricColor || '#a9b8c8'),
    lyricHighlightMode: fx.lyricHighlightMode === 'custom' ? 'custom' : 'auto',
    lyricHighlightColor: normalizeHexColor(fx.lyricHighlightColor || '#fff0b8'),
    lyricGlowLinked: fx.lyricGlowLinked !== false,
    lyricGlowColor: normalizeHexColor(fx.lyricGlowColor || '#9db8cf'),
    lyricDisplayMode: normalizeSavedLyricDisplayMode(fx.lyricDisplayMode || fxDefaults.lyricDisplayMode),
    lyricTranslationMode: normalizeSavedLyricTranslationMode(fx.lyricTranslationMode || fxDefaults.lyricTranslationMode),
    lyricMotionStyle: normalizeSavedLyricMotionStyle(fx.lyricMotionStyle || fxDefaults.lyricMotionStyle),
    lyricCustomLineCount: layoutInteger(fx.lyricCustomLineCount, fxDefaults.lyricCustomLineCount, 1, 10),
    lyricGlitchCameraBind: !!fx.lyricGlitchCameraBind,
    lyricGlitchIntensity: layoutNumber(fx.lyricGlitchIntensity, fxDefaults.lyricGlitchIntensity, 0, 1.5),
    lyricGlitchSlice: layoutNumber(fx.lyricGlitchSlice, fxDefaults.lyricGlitchSlice, 0, 1.4),
    lyricGlitchChroma: layoutNumber(fx.lyricGlitchChroma, fxDefaults.lyricGlitchChroma, 0, 1.6),
    lyricGlitchRate: layoutNumber(fx.lyricGlitchRate, fxDefaults.lyricGlitchRate, 0.45, 2.2),
    lyricGlitchJitter: layoutNumber(fx.lyricGlitchJitter, fxDefaults.lyricGlitchJitter, 0, 1.8),
    lyricContextOpacity: layoutNumber(fx.lyricContextOpacity, fxDefaults.lyricContextOpacity, 0.25, 1),
    lyricContextSpread: layoutNumber(fx.lyricContextSpread, fxDefaults.lyricContextSpread, 0.60, 2.40),
    lyricTranslationGap: layoutNumber(fx.lyricTranslationGap, fxDefaults.lyricTranslationGap, 0.28, 2.20),
    lyricTranslationScale: layoutNumber(fx.lyricTranslationScale, fxDefaults.lyricTranslationScale, 0.46, 1.12),
    lyricTranslationOpacity: layoutNumber(fx.lyricTranslationOpacity, fxDefaults.lyricTranslationOpacity, 0.20, 1),
    lyricEdgeFade: layoutNumber(fx.lyricEdgeFade, fxDefaults.lyricEdgeFade, 0, 1),
    lyricMotionSoftness: layoutNumber(fx.lyricMotionSoftness, fxDefaults.lyricMotionSoftness, 0.15, 1.2),
    lyricFont: normalizeLyricFontKey(fx.lyricFont),
    lyricLetterSpacing: layoutNumber(fx.lyricLetterSpacing, 0, -0.04, 0.18),
    lyricLineHeight: layoutNumber(fx.lyricLineHeight, 1, 0.72, 1.80),
    lyricWeight: layoutInteger(fx.lyricWeight, 900, 500, 900),
    lyricTextureClarity: normalizeLyricTextureClarity(fx.lyricTextureClarity),
    foregroundFpsMode: normalizeForegroundFpsMode(fx.foregroundFpsMode),
    lyricGlow: !!fx.lyricGlow,
    lyricGlowBeat: !!fx.lyricGlowBeat,
    lyricGlowParticles: !!fx.lyricGlowParticles,
    lyricVerticalFloat: fx.lyricVerticalFloat !== false,
    lyricPauseHold: fx.lyricPauseHold !== false,
    controlGlassChromaticOffset: layoutNumber(fx.controlGlassChromaticOffset, fxDefaults.controlGlassChromaticOffset, 30, 140),
    shelf: /^(off|side|stage)$/.test(String(fx.shelf || '')) ? fx.shelf : fxDefaults.shelf,
    shelfPinnedOpen: fx.shelf === 'side' && normalizeShelfPresence(fx.shelfPresence || fxDefaults.shelfPresence) === 'always' && fx.shelfPinnedOpen === true,
    shelfCameraMode: normalizeShelfCameraMode(fx.shelfCameraMode || fxDefaults.shelfCameraMode),
    shelfPresence: fx.shelf === 'off' ? 'auto' : normalizeShelfPresence(fx.shelfPresence || fxDefaults.shelfPresence),
    shelfShowPodcasts: fx.shelfShowPodcasts !== false,
    shelfMergeCollections: fx.shelfMergeCollections === true,
    shelfSize: clampRange(fx.shelfSize == null ? fxDefaults.shelfSize : Number(fx.shelfSize), 0.65, 1.45),
    shelfOffsetX: clampRange(fx.shelfOffsetX == null ? fxDefaults.shelfOffsetX : Number(fx.shelfOffsetX), -1.2, 1.2),
    shelfOffsetY: clampRange(fx.shelfOffsetY == null ? fxDefaults.shelfOffsetY : Number(fx.shelfOffsetY), -0.9, 0.9),
    shelfOffsetZ: clampRange(fx.shelfOffsetZ == null ? fxDefaults.shelfOffsetZ : Number(fx.shelfOffsetZ), -0.9, 0.9),
    shelfAngleY: clampRange(fx.shelfAngleY == null ? fxDefaults.shelfAngleY : Number(fx.shelfAngleY), -30, 30),
    shelfAngleYManual: fx.shelfAngleYManual === true,
    shelfOpacity: clampRange(fx.shelfOpacity == null ? fxDefaults.shelfOpacity : Number(fx.shelfOpacity), 0.25, 1),
    shelfBgOpacity: clampRange(fx.shelfBgOpacity == null ? fxDefaults.shelfBgOpacity : Number(fx.shelfBgOpacity), 0.25, 0.98),
    shelfAccentColor: normalizeHexColor(fx.shelfAccentColor || fxDefaults.shelfAccentColor, fxDefaults.shelfAccentColor)
  };
}
function saveLyricLayout(opts) {
  opts = opts || {};
  if (opts.user === true) markCurrentFxAutosaveUserDirty(opts.reason || 'layout');
  try {
    if (lyricLayoutSaveTimer) {
      clearTimeout(lyricLayoutSaveTimer);
      lyricLayoutSaveTimer = null;
      lyricLayoutSaveOpts = null;
    }
    var presetForSave = startupVisualPreviewActive && !playing && currentIdx < 0
      ? playbackVisualPreset
      : clampRange(Number(fx.preset) || 0, 0, presetMeta.length - 1);
    var autosavePayload = {
      currentAutosaveSchema: CURRENT_FX_AUTOSAVE_SCHEMA,
      autosavedAt: Date.now(),
      autosaveUser: opts.user === true,
      autosaveReason: currentFxAutosaveSaveReason(opts, 'layout'),
      visualPresetSchema: VISUAL_PRESET_SCHEMA,
      desktopLyricsSchema: 'desktop-lyrics-v3',
      preset: presetForSave,
      intensity: layoutNumber(fx.intensity, fxDefaults.intensity, 0.2, 1.6),
      cinemaShake: layoutNumber(fx.cinemaShake, fxDefaults.cinemaShake, 0, 1.8),
      depth: layoutNumber(fx.depth, fxDefaults.depth, 0.2, 1.8),
      point: layoutNumber(fx.point, fxDefaults.point, 0.5, 2.2),
      speed: layoutNumber(fx.speed, fxDefaults.speed, 0.2, 2.5),
      twist: layoutNumber(fx.twist, fxDefaults.twist, 0, 0.6),
      color: layoutNumber(fx.color, fxDefaults.color, 0.5, 2.0),
      scatter: layoutNumber(fx.scatter, fxDefaults.scatter, 0, 0.5),
      bgFade: layoutNumber(fx.bgFade, fxDefaults.bgFade, 0, 1.2),
      bloomStrength: layoutNumber(fx.bloomStrength, fxDefaults.bloomStrength, 0, 1.6),
      lyricGlowStrength: layoutNumber(fx.lyricGlowStrength, fxDefaults.lyricGlowStrength, 0, 0.85),
      lyricBackgroundAdapt: layoutNumber(fx.lyricBackgroundAdapt, fxDefaults.lyricBackgroundAdapt, 0, 1),
      lyricScale: layoutNumber(fx.lyricScale, 1, 0.35, 1.65),
      lyricOffsetX: layoutNumber(fx.lyricOffsetX, 0, -4.0, 4.0),
      lyricOffsetY: layoutNumber(fx.lyricOffsetY, 0, -2.4, 2.7),
      lyricOffsetZ: layoutNumber(fx.lyricOffsetZ, 0, -3.2, 3.2),
      lyricTiltX: layoutNumber(fx.lyricTiltX, 0, -84, 84),
      lyricTiltY: layoutNumber(fx.lyricTiltY, 0, -84, 84),
      lyricCameraLock: !!fx.lyricCameraLock,
      lyricColorMode: fx.lyricColorMode === 'custom' ? 'custom' : 'auto',
      lyricColor: normalizeHexColor(fx.lyricColor || '#a9b8c8'),
      lyricHighlightMode: fx.lyricHighlightMode === 'custom' ? 'custom' : 'auto',
      lyricHighlightColor: normalizeHexColor(fx.lyricHighlightColor || '#fff0b8'),
      lyricGlowLinked: fx.lyricGlowLinked !== false,
      lyricGlowColor: normalizeHexColor(fx.lyricGlowColor || '#9db8cf'),
      lyricDisplayMode: normalizeSavedLyricDisplayMode(fx.lyricDisplayMode || fxDefaults.lyricDisplayMode),
      lyricTranslationMode: normalizeSavedLyricTranslationMode(fx.lyricTranslationMode || fxDefaults.lyricTranslationMode),
      lyricMotionStyle: normalizeSavedLyricMotionStyle(fx.lyricMotionStyle || fxDefaults.lyricMotionStyle),
      lyricCustomLineCount: layoutInteger(fx.lyricCustomLineCount, fxDefaults.lyricCustomLineCount, 1, 10),
      lyricGlitchCameraBind: !!fx.lyricGlitchCameraBind,
      lyricGlitchIntensity: layoutNumber(fx.lyricGlitchIntensity, fxDefaults.lyricGlitchIntensity, 0, 1.5),
      lyricGlitchSlice: layoutNumber(fx.lyricGlitchSlice, fxDefaults.lyricGlitchSlice, 0, 1.4),
      lyricGlitchChroma: layoutNumber(fx.lyricGlitchChroma, fxDefaults.lyricGlitchChroma, 0, 1.6),
      lyricGlitchRate: layoutNumber(fx.lyricGlitchRate, fxDefaults.lyricGlitchRate, 0.45, 2.2),
      lyricGlitchJitter: layoutNumber(fx.lyricGlitchJitter, fxDefaults.lyricGlitchJitter, 0, 1.8),
      lyricContextOpacity: layoutNumber(fx.lyricContextOpacity, fxDefaults.lyricContextOpacity, 0.25, 1),
      lyricContextSpread: layoutNumber(fx.lyricContextSpread, fxDefaults.lyricContextSpread, 0.60, 2.40),
      lyricTranslationGap: layoutNumber(fx.lyricTranslationGap, fxDefaults.lyricTranslationGap, 0.28, 2.20),
      lyricTranslationScale: layoutNumber(fx.lyricTranslationScale, fxDefaults.lyricTranslationScale, 0.46, 1.12),
      lyricTranslationOpacity: layoutNumber(fx.lyricTranslationOpacity, fxDefaults.lyricTranslationOpacity, 0.20, 1),
      lyricEdgeFade: layoutNumber(fx.lyricEdgeFade, fxDefaults.lyricEdgeFade, 0, 1),
      lyricMotionSoftness: layoutNumber(fx.lyricMotionSoftness, fxDefaults.lyricMotionSoftness, 0.15, 1.2),
      lyricFont: normalizeLyricFontKey(fx.lyricFont),
      lyricLetterSpacing: layoutNumber(fx.lyricLetterSpacing, 0, -0.04, 0.18),
      lyricLineHeight: layoutNumber(fx.lyricLineHeight, 1, 0.72, 1.80),
      lyricWeight: layoutInteger(fx.lyricWeight, 900, 500, 900),
      lyricTextureClarity: normalizeLyricTextureClarity(fx.lyricTextureClarity),
      lyricGlow: !!fx.lyricGlow,
      lyricGlowBeat: !!fx.lyricGlowBeat,
      lyricGlowParticles: !!fx.lyricGlowParticles,
      lyricVerticalFloat: fx.lyricVerticalFloat !== false,
      backgroundStarRiver: fx.backgroundStarRiver !== false,
      lyricPauseHold: fx.lyricPauseHold !== false,
      floatLayer: !!fx.floatLayer,
      cinema: !!fx.cinema,
      bloom: !!fx.bloom,
      edge: !!fx.edge,
      aiDepth: !!fx.aiDepth,
      particleLyrics: fx.particleLyrics !== false,
      backCover: !!fx.backCover,
      visualTintMode: fx.visualTintMode === 'custom' ? 'custom' : 'auto',
      visualTintColor: normalizeHexColor(fx.visualTintColor || '#9db8cf'),
      uiAccentColor: normalizeHexColor(
        fx.uiAccentColor || fxDefaults.uiAccentColor || '#ffffff',
        fxDefaults.uiAccentColor || '#ffffff'
      ),
      homeAccentColor: normalizeHexColor(fx.homeAccentColor || '#00f5d4'),
      homeIconColor: normalizeHexColor(fx.homeIconColor || '#f4d28a', '#f4d28a'),
      visualIconColor: normalizeHexColor(fx.visualIconColor || '#7fd8ff', '#7fd8ff'),
      backgroundColorMode: fx.backgroundColorMode === 'custom' || fx.backgroundColorCustom ? 'custom' : 'cover',
      backgroundColor: normalizeHexColor(fx.backgroundColor || '#000000', '#000000'),
      backgroundOpacity: clampRange(fx.backgroundOpacity == null ? fxDefaults.backgroundOpacity : Number(fx.backgroundOpacity), 0, 1),
      windowBackgroundOpacity: clampRange(fx.windowBackgroundOpacity == null ? fxDefaults.windowBackgroundOpacity : Number(fx.windowBackgroundOpacity), 0, 1),
      backgroundGlassOpacity: clampRange(fx.backgroundGlassOpacity == null ? fxDefaults.backgroundGlassOpacity : Number(fx.backgroundGlassOpacity), 0, 1),
      controlGlassChromaticOffset: layoutNumber(fx.controlGlassChromaticOffset, fxDefaults.controlGlassChromaticOffset, 30, 140),
      playlistPanelGlassBlur: clampRange(fx.playlistPanelGlassBlur == null ? fxDefaults.playlistPanelGlassBlur : Number(fx.playlistPanelGlassBlur), 14, 60),
      playlistPanelGlassDensity: clampRange(fx.playlistPanelGlassDensity == null ? fxDefaults.playlistPanelGlassDensity : Number(fx.playlistPanelGlassDensity), 0.55, 1),
      playlistPanelOpenDuration: clampRange(fx.playlistPanelOpenDuration == null ? fxDefaults.playlistPanelOpenDuration : Number(fx.playlistPanelOpenDuration), 0.08, 0.72),
      playlistPanelCloseDuration: clampRange(fx.playlistPanelCloseDuration == null ? fxDefaults.playlistPanelCloseDuration : Number(fx.playlistPanelCloseDuration), 0.06, 0.48),
      backgroundColorCustom: fx.backgroundColorMode === 'custom' || !!fx.backgroundColorCustom,
      backgroundImage: fx.backgroundAlbumCover === true ? '' : normalizeCustomBackgroundImage(fx.backgroundImage),
      backgroundMedia: fx.backgroundAlbumCover === true ? null : normalizeCustomBackgroundMedia(fx.backgroundMedia || fx.backgroundImage),
      backgroundAlbumCover: fx.backgroundAlbumCover === true,
      backgroundMediaCropX: clampRange(fx.backgroundMediaCropX == null ? fxDefaults.backgroundMediaCropX : Number(fx.backgroundMediaCropX), 0, 100),
      backgroundMediaCropY: clampRange(fx.backgroundMediaCropY == null ? fxDefaults.backgroundMediaCropY : Number(fx.backgroundMediaCropY), 0, 100),
      backgroundMediaZoom: clampRange(fx.backgroundMediaZoom == null ? fxDefaults.backgroundMediaZoom : Number(fx.backgroundMediaZoom), 1, 2.8),
      desktopLyrics: !!fx.desktopLyrics,
      desktopLyricsSize: clampRange(Number(fx.desktopLyricsSize) || fxDefaults.desktopLyricsSize, 0.72, 1.55),
      desktopLyricsOpacity: clampRange(fx.desktopLyricsOpacity == null ? fxDefaults.desktopLyricsOpacity : Number(fx.desktopLyricsOpacity), 0.28, 1),
      desktopLyricsY: clampRange(fx.desktopLyricsY == null ? fxDefaults.desktopLyricsY : Number(fx.desktopLyricsY), 0.08, 0.92),
      desktopLyricsClickThrough: fx.desktopLyricsClickThrough === true,
      desktopLyricsCinema: fx.desktopLyricsCinema !== false,
      desktopLyricsHighlight: fx.desktopLyricsHighlight === true,
      desktopLyricsFps: normalizeDesktopLyricsFps(fx.desktopLyricsFps),
      performanceBackground: normalizePerformanceBackgroundMode(fx.performanceBackground, fx.liveBackgroundKeep === true),
      performanceQuality: normalizePerformanceQuality(fx.performanceQuality),
      foregroundFpsMode: normalizeForegroundFpsMode(fx.foregroundFpsMode),
      memoryAutoTrimApp: fx.memoryAutoTrimApp !== false,
      memoryAutoTrimOnBackground: fx.memoryAutoTrimOnBackground !== false,
      memoryAutoSystemTrim: fx.memoryAutoSystemTrim === true,
      memorySystemAutoElevate: fx.memorySystemAutoElevate === true,
      memorySystemIntervalMin: clampRange(Math.round(fx.memorySystemIntervalMin == null ? fxDefaults.memorySystemIntervalMin : Number(fx.memorySystemIntervalMin)), 5, 180),
      memorySystemThresholdPercent: clampRange(Math.round(fx.memorySystemThresholdPercent == null ? fxDefaults.memorySystemThresholdPercent : Number(fx.memorySystemThresholdPercent)), 50, 98),
      memorySystemMask: clampRange(Math.round(fx.memorySystemMask == null ? fxDefaults.memorySystemMask : Number(fx.memorySystemMask)), 1, 29),
      memorySafetyRevision: fxDefaults.memorySafetyRevision,
      liveBackgroundKeep: normalizePerformanceBackgroundMode(fx.performanceBackground, fx.liveBackgroundKeep === true) === 'keep',
      sonicGroundAmplitude: clampRange(fx.sonicGroundAmplitude == null ? fxDefaults.sonicGroundAmplitude : Number(fx.sonicGroundAmplitude), 0, 100),
      sonicGroundMotionSpeed: clampRange(fx.sonicGroundMotionSpeed == null ? fxDefaults.sonicGroundMotionSpeed : Number(fx.sonicGroundMotionSpeed), 0, 100),
      sonicGroundDensity: clampRange(fx.sonicGroundDensity == null ? fxDefaults.sonicGroundDensity : Number(fx.sonicGroundDensity), 0, 100),
      sonicGroundRange: clampRange(fx.sonicGroundRange == null ? fxDefaults.sonicGroundRange : Number(fx.sonicGroundRange), 0, 100),
      sonicGroundLower: clampRange(fx.sonicGroundLower == null ? fxDefaults.sonicGroundLower : Number(fx.sonicGroundLower), 0, 100),
      sonicGroundDepth: clampRange(fx.sonicGroundDepth == null ? fxDefaults.sonicGroundDepth : Number(fx.sonicGroundDepth), 0, 100),
      sonicGroundAutoRotate: clampRange(fx.sonicGroundAutoRotate == null ? fxDefaults.sonicGroundAutoRotate : Number(fx.sonicGroundAutoRotate), 0, 100),
      sonicGroundColorMode: fx.sonicGroundColorMode === 'custom' ? 'custom' : 'cover',
      sonicGroundBaseColor: normalizeHexColor(fx.sonicGroundBaseColor || fxDefaults.sonicGroundBaseColor, fxDefaults.sonicGroundBaseColor),
      sonicGroundCoolColor: normalizeHexColor(fx.sonicGroundCoolColor || fxDefaults.sonicGroundCoolColor, fxDefaults.sonicGroundCoolColor),
      sonicGroundWarmColor: normalizeHexColor(fx.sonicGroundWarmColor || fxDefaults.sonicGroundWarmColor, fxDefaults.sonicGroundWarmColor),
      sonicGroundAccentColor: normalizeHexColor(fx.sonicGroundAccentColor || fxDefaults.sonicGroundAccentColor, fxDefaults.sonicGroundAccentColor),
      sonicGroundGlow: clampRange(fx.sonicGroundGlow == null ? fxDefaults.sonicGroundGlow : Number(fx.sonicGroundGlow), 0, 100),
      sonicGroundSubBass: clampRange(fx.sonicGroundSubBass == null ? fxDefaults.sonicGroundSubBass : Number(fx.sonicGroundSubBass), 0, 100),
      sonicGroundBass: clampRange(fx.sonicGroundBass == null ? fxDefaults.sonicGroundBass : Number(fx.sonicGroundBass), 0, 100),
      sonicGroundLowMid: clampRange(fx.sonicGroundLowMid == null ? fxDefaults.sonicGroundLowMid : Number(fx.sonicGroundLowMid), 0, 100),
      sonicGroundMid: clampRange(fx.sonicGroundMid == null ? fxDefaults.sonicGroundMid : Number(fx.sonicGroundMid), 0, 100),
      sonicGroundHighMid: clampRange(fx.sonicGroundHighMid == null ? fxDefaults.sonicGroundHighMid : Number(fx.sonicGroundHighMid), 0, 100),
      sonicGroundPresence: clampRange(fx.sonicGroundPresence == null ? fxDefaults.sonicGroundPresence : Number(fx.sonicGroundPresence), 0, 100),
      sonicGroundBrilliance: clampRange(fx.sonicGroundBrilliance == null ? fxDefaults.sonicGroundBrilliance : Number(fx.sonicGroundBrilliance), 0, 100),
      sonicGroundAir: clampRange(fx.sonicGroundAir == null ? fxDefaults.sonicGroundAir : Number(fx.sonicGroundAir), 0, 100),
      sonicGroundFloatingEnabled: fx.sonicGroundFloatingEnabled !== false,
      sonicGroundFloatingIntensity: clampRange(fx.sonicGroundFloatingIntensity == null ? fxDefaults.sonicGroundFloatingIntensity : Number(fx.sonicGroundFloatingIntensity), 0, 100),
      sonicGroundFloatingMinSize: clampRange(fx.sonicGroundFloatingMinSize == null ? fxDefaults.sonicGroundFloatingMinSize : Number(fx.sonicGroundFloatingMinSize), 0, 100),
      sonicGroundFloatingMaxSize: clampRange(fx.sonicGroundFloatingMaxSize == null ? fxDefaults.sonicGroundFloatingMaxSize : Number(fx.sonicGroundFloatingMaxSize), 0, 100),
      sonicGroundFloatingSpeed: clampRange(fx.sonicGroundFloatingSpeed == null ? fxDefaults.sonicGroundFloatingSpeed : Number(fx.sonicGroundFloatingSpeed), 0, 100),
      sonicGroundFloatingCount: clampRange(fx.sonicGroundFloatingCount == null ? fxDefaults.sonicGroundFloatingCount : Number(fx.sonicGroundFloatingCount), 0, 100),
      sonicAudioMonitorEnabled: fx.sonicAudioMonitorEnabled !== false,
      sonicAudioAutoTrack: fx.sonicAudioAutoTrack !== false,
      sonicAudioSensitivity: clampRange(fx.sonicAudioSensitivity == null ? fxDefaults.sonicAudioSensitivity : Number(fx.sonicAudioSensitivity), 0, 100),
      sonicAudioBandStart: clampRange(fx.sonicAudioBandStart == null ? fxDefaults.sonicAudioBandStart : Number(fx.sonicAudioBandStart), 0, 510),
      sonicAudioBandEnd: clampRange(fx.sonicAudioBandEnd == null ? fxDefaults.sonicAudioBandEnd : Number(fx.sonicAudioBandEnd), 2, 512),
      sonicAudioThreshold: clampRange(fx.sonicAudioThreshold == null ? fxDefaults.sonicAudioThreshold : Number(fx.sonicAudioThreshold), 0, 100),
      sonicAudioPulseStrength: clampRange(fx.sonicAudioPulseStrength == null ? fxDefaults.sonicAudioPulseStrength : Number(fx.sonicAudioPulseStrength), 0, 100),
      sonicWorkshopInputGain: clampRange(fx.sonicWorkshopInputGain == null ? fxDefaults.sonicWorkshopInputGain : Number(fx.sonicWorkshopInputGain), 40, 100),
      sonicWorkshopAudioIntensity: clampRange(fx.sonicWorkshopAudioIntensity == null ? fxDefaults.sonicWorkshopAudioIntensity : Number(fx.sonicWorkshopAudioIntensity), 0.3, 2.5),
      sonicWorkshopResponseRange: clampRange(fx.sonicWorkshopResponseRange == null ? fxDefaults.sonicWorkshopResponseRange : Number(fx.sonicWorkshopResponseRange), 0.3, 2),
      sonicWorkshopPeakIntensity: clampRange(fx.sonicWorkshopPeakIntensity == null ? fxDefaults.sonicWorkshopPeakIntensity : Number(fx.sonicWorkshopPeakIntensity), 0, 1.4),
      sonicWorkshopColorMode: fx.sonicWorkshopColorMode === 'custom' ? 'custom' : 'cover',
      sonicWorkshopTheme: /^(coral-mirage|ocean-deep|arctic-blue|arctic-aurora|emerald-forest|cyber-forest|minimal-mono|minimal-monochrome|neon-tokyo|golden-hour|ember-fire|crimson|crimson-sunset|aurora|violet-dream)$/.test(String(fx.sonicWorkshopTheme || '')) ? fx.sonicWorkshopTheme : fxDefaults.sonicWorkshopTheme,
      sonicWorkshopCustomColor: normalizeHexColor(fx.sonicWorkshopCustomColor || fxDefaults.sonicWorkshopCustomColor || '#cb6c89', fxDefaults.sonicWorkshopCustomColor || '#cb6c89'),
      sonicWorkshopBaseColorMode: fx.sonicWorkshopBaseColorMode === 'custom' ? 'custom' : 'cover',
      sonicWorkshopBaseColor: normalizeHexColor(fx.sonicWorkshopBaseColor || fxDefaults.sonicWorkshopBaseColor || '#16060f', fxDefaults.sonicWorkshopBaseColor || '#16060f'),
      sonicWorkshopWarmColorMode: fx.sonicWorkshopWarmColorMode === 'custom' ? 'custom' : 'cover',
      sonicWorkshopWarmColor: normalizeHexColor(fx.sonicWorkshopWarmColor || fxDefaults.sonicWorkshopWarmColor || '#cb6c89', fxDefaults.sonicWorkshopWarmColor || '#cb6c89'),
      sonicWorkshopCoolColorMode: fx.sonicWorkshopCoolColorMode === 'custom' ? 'custom' : 'cover',
      sonicWorkshopCoolColor: normalizeHexColor(fx.sonicWorkshopCoolColor || fxDefaults.sonicWorkshopCoolColor || '#99c4ff', fxDefaults.sonicWorkshopCoolColor || '#99c4ff'),
      sonicWorkshopRippleColorMode: fx.sonicWorkshopRippleColorMode === 'custom' ? 'custom' : 'cover',
      sonicWorkshopRippleColor: normalizeHexColor(fx.sonicWorkshopRippleColor || fxDefaults.sonicWorkshopRippleColor || '#f8d8ff', fxDefaults.sonicWorkshopRippleColor || '#f8d8ff'),
      sonicWorkshopPeakColorMode: fx.sonicWorkshopPeakColorMode === 'custom' ? 'custom' : 'cover',
      sonicWorkshopPeakColor: normalizeHexColor(fx.sonicWorkshopPeakColor || fxDefaults.sonicWorkshopPeakColor || '#99c4ff', fxDefaults.sonicWorkshopPeakColor || '#99c4ff'),
      wallpaperMode: false,
      wallpaperOpacity: clampRange(fx.wallpaperOpacity == null ? fxDefaults.wallpaperOpacity : Number(fx.wallpaperOpacity), 0.35, 1),
      wallpaperFps: normalizeWallpaperFps(fx.wallpaperFps),
      coverResolution: normalizeCoverResolution(fx.coverResolution),
      shelf: /^(off|side|stage)$/.test(String(fx.shelf || '')) ? fx.shelf : fxDefaults.shelf,
      shelfPinnedOpen: fx.shelf === 'side' && normalizeShelfPresence(fx.shelfPresence || fxDefaults.shelfPresence) === 'always' && fx.shelfPinnedOpen === true,
      shelfCameraMode: normalizeShelfCameraMode(fx.shelfCameraMode || fxDefaults.shelfCameraMode),
      shelfPresence: fx.shelf === 'off' ? 'auto' : normalizeShelfPresence(fx.shelfPresence || fxDefaults.shelfPresence),
      shelfShowPodcasts: fx.shelfShowPodcasts !== false,
      shelfMergeCollections: fx.shelfMergeCollections === true,
      shelfSize: clampRange(fx.shelfSize == null ? fxDefaults.shelfSize : Number(fx.shelfSize), 0.65, 1.45),
      shelfOffsetX: clampRange(fx.shelfOffsetX == null ? fxDefaults.shelfOffsetX : Number(fx.shelfOffsetX), -1.2, 1.2),
      shelfOffsetY: clampRange(fx.shelfOffsetY == null ? fxDefaults.shelfOffsetY : Number(fx.shelfOffsetY), -0.9, 0.9),
      shelfOffsetZ: clampRange(fx.shelfOffsetZ == null ? fxDefaults.shelfOffsetZ : Number(fx.shelfOffsetZ), -0.9, 0.9),
      shelfAngleY: clampRange(fx.shelfAngleY == null ? fxDefaults.shelfAngleY : Number(fx.shelfAngleY), -30, 30),
      shelfAngleYManual: fx.shelfAngleYManual === true,
      shelfOpacity: clampRange(fx.shelfOpacity == null ? fxDefaults.shelfOpacity : Number(fx.shelfOpacity), 0.25, 1),
      shelfBgOpacity: clampRange(fx.shelfBgOpacity == null ? fxDefaults.shelfBgOpacity : Number(fx.shelfBgOpacity), 0.25, 0.98),
      shelfAccentColor: normalizeHexColor(fx.shelfAccentColor || fxDefaults.shelfAccentColor, fxDefaults.shelfAccentColor),
      shelfDetailOffsetX: clampRange(fx.shelfDetailOffsetX == null ? fxDefaults.shelfDetailOffsetX : Number(fx.shelfDetailOffsetX), -4.8, 4.8),
      shelfDetailOffsetY: clampRange(fx.shelfDetailOffsetY == null ? fxDefaults.shelfDetailOffsetY : Number(fx.shelfDetailOffsetY), -3.6, 3.6),
      shelfDetailOffsetZ: clampRange(fx.shelfDetailOffsetZ == null ? fxDefaults.shelfDetailOffsetZ : Number(fx.shelfDetailOffsetZ), -3.6, 3.6),
      shelfDetailScale: clampRange(fx.shelfDetailScale == null ? fxDefaults.shelfDetailScale : Number(fx.shelfDetailScale), 0.72, 1.35),
      shelfDetailAngleX: clampRange(fx.shelfDetailAngleX == null ? fxDefaults.shelfDetailAngleX : Number(fx.shelfDetailAngleX), -24, 24),
      shelfDetailAngleY: clampRange(fx.shelfDetailAngleY == null ? fxDefaults.shelfDetailAngleY : Number(fx.shelfDetailAngleY), -28, 28),
      shelfDetailRowGap: clampRange(fx.shelfDetailRowGap == null ? fxDefaults.shelfDetailRowGap : Number(fx.shelfDetailRowGap), 0.72, 1.32),
      shelfDetailOpenDuration: clampRange(fx.shelfDetailOpenDuration == null ? fxDefaults.shelfDetailOpenDuration : Number(fx.shelfDetailOpenDuration), 0.12, 1.2),
      shelfDetailCloseDuration: clampRange(fx.shelfDetailCloseDuration == null ? fxDefaults.shelfDetailCloseDuration : Number(fx.shelfDetailCloseDuration), 0.08, 0.8),
      shelfDetailRowDuration: clampRange(fx.shelfDetailRowDuration == null ? fxDefaults.shelfDetailRowDuration : Number(fx.shelfDetailRowDuration), 0.16, 1.6),
      shelfDetailIntroStrength: clampRange(fx.shelfDetailIntroStrength == null ? fxDefaults.shelfDetailIntroStrength : Number(fx.shelfDetailIntroStrength), 0, 1.8),
      shelfDetailParallax: clampRange(fx.shelfDetailParallax == null ? fxDefaults.shelfDetailParallax : Number(fx.shelfDetailParallax), 0, 1.8),
      shelfSummonOpenDuration: clampRange(fx.shelfSummonOpenDuration == null ? fxDefaults.shelfSummonOpenDuration : Number(fx.shelfSummonOpenDuration), 0.08, 2),
      shelfSummonCloseDuration: clampRange(fx.shelfSummonCloseDuration == null ? fxDefaults.shelfSummonCloseDuration : Number(fx.shelfSummonCloseDuration), 0.08, 1.6),
      shelfSummonSlide: clampRange(fx.shelfSummonSlide == null ? fxDefaults.shelfSummonSlide : Number(fx.shelfSummonSlide), 0, 4),
      shelfSummonStagger: clampRange(fx.shelfSummonStagger == null ? fxDefaults.shelfSummonStagger : Number(fx.shelfSummonStagger), 0, 3),
      shelfSummonScale: clampRange(fx.shelfSummonScale == null ? fxDefaults.shelfSummonScale : Number(fx.shelfSummonScale), 0, 3),
      shelfSummonParallax: clampRange(fx.shelfSummonParallax == null ? fxDefaults.shelfSummonParallax : Number(fx.shelfSummonParallax), 0, 2.5),
      shelfCameraEnterSpeed: clampRange(fx.shelfCameraEnterSpeed == null ? fxDefaults.shelfCameraEnterSpeed : Number(fx.shelfCameraEnterSpeed), 0.2, 1.5),
      shelfCameraExitSpeed: clampRange(fx.shelfCameraExitSpeed == null ? fxDefaults.shelfCameraExitSpeed : Number(fx.shelfCameraExitSpeed), 0.2, 1.5),
      cam: /^(off|gesture)$/.test(String(fx.cam || '')) ? fx.cam : fxDefaults.cam,
      gesturePlayerActions: fx.gesturePlayerActions !== false,
      gestureHandOverlay: fx.gestureHandOverlay !== false,
      gestureSensitivity: /^(steady|balanced|quick)$/.test(String(fx.gestureSensitivity || '')) ? fx.gestureSensitivity : fxDefaults.gestureSensitivity
    };
    autosavePayload = scopeCurrentFxAutosavePayload(autosavePayload, opts);
    if (shouldSkipCurrentFxAutosaveWrite(autosavePayload, opts)) return;
    writeCurrentFxAutosavePayload(autosavePayload, opts);
  } catch (e) {
    console.warn('[FxAutosave] full save failed:', e);
    try {
      saveCurrentFxAutosavePatch(currentFxAutosaveCriticalPatch(), { syncDisk: opts.syncDisk === true, user: opts.user === true, reason: currentFxAutosaveSaveReason(opts, 'fallback') });
    } catch (fallbackError) {
      console.warn('[FxAutosave] fallback save failed:', fallbackError);
    }
  }
}
var lyricLayoutSaveTimer = null;
var lyricLayoutSaveOpts = null;
function flushLyricLayoutSave(reason) {
  var pendingOpts = lyricLayoutSaveOpts ? Object.assign({}, lyricLayoutSaveOpts) : {};
  try {
    saveLyricLayout(Object.assign({}, pendingOpts, {
      syncDisk: true,
      reason: pendingOpts.reason || String(reason || 'flush')
    }));
  } catch (e) { }
}
function scheduleLyricLayoutSave(delay, opts) {
  delay = Math.max(80, Math.round(Number(delay) || 280));
  opts = opts || {};
  lyricLayoutSaveOpts = Object.assign({}, lyricLayoutSaveOpts || {}, opts);
  if (lyricLayoutSaveTimer) clearTimeout(lyricLayoutSaveTimer);
  lyricLayoutSaveTimer = setTimeout(function () {
    lyricLayoutSaveTimer = null;
    var nextOpts = lyricLayoutSaveOpts || {};
    lyricLayoutSaveOpts = null;
    saveLyricLayout(nextOpts);
  }, delay);
}
window.addEventListener('beforeunload', flushLyricLayoutSave);
window.addEventListener('pagehide', flushLyricLayoutSave);
document.addEventListener('visibilitychange', function () {
  if (document.hidden) flushLyricLayoutSave();
});
function normalizeHexColor(value, fallback) {
  var hex = String(value || '').trim();
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    hex = '#' + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2) + hex.charAt(3) + hex.charAt(3);
  }
  fallback = /^#[0-9a-f]{6}$/i.test(String(fallback || '')) ? String(fallback).toLowerCase() : '#a9b8c8';
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : fallback;
}
function normalizeDesktopLyricsFps(value) {
  var n = Number(value);
  if (!isFinite(n) || n <= 0) return 0;
  if (n <= 26) return 24;
  if (n <= 45) return 30;
  if (n <= 90) return 60;
  return 120;
}
function normalizeShelfCameraMode(value) {
  return String(value || '') === 'static' ? 'static' : 'dynamic';
}
function shelfDefaultAngleForCameraMode(mode) {
  return normalizeShelfCameraMode(mode) === 'static' ? -15 : 0;
}
function applyShelfCameraDefaultAngle(force) {
  if (!fx) return;
  fx.shelfCameraMode = normalizeShelfCameraMode(fx.shelfCameraMode || fxDefaults.shelfCameraMode);
  if (force || fx.shelfAngleYManual !== true) {
    fx.shelfAngleYManual = false;
    fx.shelfAngleY = shelfDefaultAngleForCameraMode(fx.shelfCameraMode);
  } else {
    fx.shelfAngleY = Math.round(clampRange(Number(fx.shelfAngleY) || 0, -30, 30));
  }
}
function normalizeShelfPresence(value) {
  return String(value || '') === 'always' ? 'always' : 'auto';
}
function normalizedShelfNumber(key, fallback, min, max) {
  var value = fx && fx[key] != null ? Number(fx[key]) : fallback;
  if (!isFinite(value)) value = fallback;
  return clampRange(value, min, max);
}
function shelfDetailSettings() {
  return {
    x: normalizedShelfNumber('shelfDetailOffsetX', fxDefaults.shelfDetailOffsetX, -4.8, 4.8),
    y: normalizedShelfNumber('shelfDetailOffsetY', fxDefaults.shelfDetailOffsetY, -3.6, 3.6),
    z: normalizedShelfNumber('shelfDetailOffsetZ', fxDefaults.shelfDetailOffsetZ, -3.6, 3.6),
    scale: normalizedShelfNumber('shelfDetailScale', fxDefaults.shelfDetailScale, 0.72, 1.35),
    rx: normalizedShelfNumber('shelfDetailAngleX', fxDefaults.shelfDetailAngleX, -24, 24) * Math.PI / 180,
    ry: normalizedShelfNumber('shelfDetailAngleY', fxDefaults.shelfDetailAngleY, -28, 28) * Math.PI / 180,
    rowGap: normalizedShelfNumber('shelfDetailRowGap', fxDefaults.shelfDetailRowGap, 0.72, 1.32),
    openDuration: normalizedShelfNumber('shelfDetailOpenDuration', fxDefaults.shelfDetailOpenDuration, 0.12, 1.2),
    closeDuration: normalizedShelfNumber('shelfDetailCloseDuration', fxDefaults.shelfDetailCloseDuration, 0.08, 0.8),
    rowDuration: normalizedShelfNumber('shelfDetailRowDuration', fxDefaults.shelfDetailRowDuration, 0.16, 1.6),
    intro: normalizedShelfNumber('shelfDetailIntroStrength', fxDefaults.shelfDetailIntroStrength, 0, 1.8),
    parallax: normalizedShelfNumber('shelfDetailParallax', fxDefaults.shelfDetailParallax, 0, 1.8)
  };
}
function shelfSummonSettings() {
  return {
    openDuration: normalizedShelfNumber('shelfSummonOpenDuration', fxDefaults.shelfSummonOpenDuration, 0.08, 2),
    closeDuration: normalizedShelfNumber('shelfSummonCloseDuration', fxDefaults.shelfSummonCloseDuration, 0.08, 1.6),
    slide: normalizedShelfNumber('shelfSummonSlide', fxDefaults.shelfSummonSlide, 0, 4),
    stagger: normalizedShelfNumber('shelfSummonStagger', fxDefaults.shelfSummonStagger, 0, 3),
    scale: normalizedShelfNumber('shelfSummonScale', fxDefaults.shelfSummonScale, 0, 3),
    parallax: normalizedShelfNumber('shelfSummonParallax', fxDefaults.shelfSummonParallax, 0, 2.5),
    cameraEnterSpeed: normalizedShelfNumber('shelfCameraEnterSpeed', fxDefaults.shelfCameraEnterSpeed, 0.2, 1.5),
    cameraExitSpeed: normalizedShelfNumber('shelfCameraExitSpeed', fxDefaults.shelfCameraExitSpeed, 0.2, 1.5)
  };
}
function durationEaseFactor(seconds, dt) {
  seconds = Math.max(0.016, Number(seconds) || 0.016);
  dt = Math.max(1 / 240, Number(dt) || 1 / 60);
  return clampRange(1 - Math.exp(-dt / seconds), 0.001, 1);
}
function shelfSettings() {
  var angleDeg = fx && fx.shelfAngleYManual === true
    ? normalizedShelfNumber('shelfAngleY', shelfDefaultAngleForCameraMode(fx.shelfCameraMode), -30, 30)
    : shelfDefaultAngleForCameraMode(fx && fx.shelfCameraMode);
  return {
    size: normalizedShelfNumber('shelfSize', fxDefaults.shelfSize, 0.65, 1.45),
    x: normalizedShelfNumber('shelfOffsetX', fxDefaults.shelfOffsetX, -1.2, 1.2),
    y: normalizedShelfNumber('shelfOffsetY', fxDefaults.shelfOffsetY, -0.9, 0.9),
    z: normalizedShelfNumber('shelfOffsetZ', fxDefaults.shelfOffsetZ, -0.9, 0.9),
    angle: angleDeg * Math.PI / 180,
    opacity: normalizedShelfNumber('shelfOpacity', fxDefaults.shelfOpacity, 0.25, 1),
    bgOpacity: normalizedShelfNumber('shelfBgOpacity', fxDefaults.shelfBgOpacity, 0.25, 0.98),
    accent: normalizeHexColor((fx && fx.shelfAccentColor) || fxDefaults.shelfAccentColor, fxDefaults.shelfAccentColor)
  };
}
function shelfAlwaysVisible() {
  return !!(fx && normalizeShelfPresence(fx.shelfPresence) === 'always');
}
function shouldUseShelfDynamicCamera(type) {
  if (!/^shelf-/.test(String(type || ''))) return true;
  return !(fx && normalizeShelfCameraMode(fx.shelfCameraMode) === 'static');
}
function shelfAccentHex() {
  return normalizeHexColor((fx && fx.shelfAccentColor) || fxDefaults.shelfAccentColor, fxDefaults.shelfAccentColor);
}
function shelfAccentRgba(alpha, fallback) {
  var rgb = hexToRgb(shelfAccentHex());
  if (!rgb) return fallback || 'rgba(244,210,138,' + alpha + ')';
  return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
}
function rgbToHexColor(r, g, b) {
  function part(v) {
    return Math.max(0, Math.min(255, Math.round(v || 0))).toString(16).padStart(2, '0');
  }
  return '#' + part(r) + part(g) + part(b);
}
