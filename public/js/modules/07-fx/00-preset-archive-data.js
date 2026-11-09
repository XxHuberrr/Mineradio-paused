// ============================================================
var presetMeta = [
  { name: 'emily专辑封面', desc: '封面粒子 · 快速入场' },
  { name: '滚筒', desc: '隧道 · 沉浸感' },
  { name: '星球', desc: '星球 · 雕塑感' },
  { name: '虚空', desc: '无粒子 · 自定义背景' },
  { name: '唱片', desc: '唱片 · 圆形封面' },
  { name: '星河', desc: '壁纸粒子 · 音乐律动' },
  { name: '安魂', desc: '骷髅·YUI7W', descHtml: '骷髅·<span class="pc-yui7w">YUI7W</span>' },
  { name: '音域回响', nameHtml: '音域回响 <span class="pc-name-en">Sonic-Topography</span>', desc: '作者 Ajin', descHtml: '作者 <span class="pc-author-ajin">Ajin</span>' },
  { name: '音域回响', nameHtml: '音域回响 <span class="pc-name-en">Wallpaper Engine</span>', desc: '作者 CmzYa' },
  { name: '月蚀圣环', nameHtml: '月蚀圣环 <span class="pc-name-en">ECLIPSE HALO</span>', desc: '黑曜轨道 · 冷金日冕', premiumVisual: true, accent: '#e8c98d', accent2: '#8fd8ff' },
  { name: '雨幕霓虹', nameHtml: '雨幕霓虹 <span class="pc-name-en">NEON DRIZZLE</span>', desc: '城市雨丝 · 色谱残光', premiumVisual: true, accent: '#67efff', accent2: '#ff6bb5' },
  { name: '折光蝶群', nameHtml: '折光蝶群 <span class="pc-name-en">PRISM FLOCK</span>', desc: '折纸翼阵 · 光谱迁徙', premiumVisual: true, accent: '#f0d7ff', accent2: '#75e6d1' },
  { name: '深海绽放', nameHtml: '深海绽放 <span class="pc-name-en">ABYSSAL BLOOM</span>', desc: '生物荧光 · 潮汐花冠', premiumVisual: true, accent: '#75f0d0', accent2: '#8178ff' },
];
var presetIcons = [
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 14c3-2 5-2 8 0s5 2 8 0M3 10c3-2 5-2 8 0s5 2 8 0M3 18c3-2 5-2 8 0s5 2 8 0"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/><path d="M5 12a7 7 0 0 0 14 0"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="7"/><path d="M8.8 8.8l6.4 6.4"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.4"/><path d="M16.5 5.2c2.1.9 3.4 2.4 4 4.5"/><path d="M18.8 3.2l1.5 4.8"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 15c2.2-4.4 4.4-4.4 6.6 0s4.4 4.4 6.6 0S20.6 10.6 23 15"/><path d="M3 9c2.2 2.2 4.4 2.2 6.6 0s4.4-2.2 6.6 0S20.6 11.2 23 9"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.2h4v6.2h4.2v3.8H14v7.6h-4v-7.6H5.8V9.4H10z"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/><path d="M3 12c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0"/><path d="M3 6c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><circle cx="18" cy="5" r="1.2" fill="currentColor"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18h18"/><path d="M5 15c1.4-4 2.8-4 4.2 0s2.8 4 4.2 0 2.8-4 4.6 0"/><path d="M4 10c2-2 4-2 6 0s4 2 6 0 3-2 4 0"/><path d="M7 6h10"/><circle cx="18.2" cy="5.8" r="1.35" fill="currentColor"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45"><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(-18 12 12)"/><ellipse cx="12" cy="12" rx="6.3" ry="2.2" transform="rotate(24 12 12)"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"><path d="M5 3v8M9 2v15M13 5v8M17 2v18M21 6v9"/><path d="M4 19c4-3 8 3 16-1" opacity=".7"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"><path d="M12 12 3 6l3 9 6-3 6 3 3-9-9 6Z"/><path d="M12 12V4M6 15l3 4 3-7 3 7 3-4"/></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"><path d="M12 20c-1-5-7-5-7-10 4 0 6 2 7 5 1-3 3-5 7-5 0 5-6 5-7 10Z"/><path d="M12 15c-3-3-2-7 0-11 2 4 3 8 0 11Z"/><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>',
];
var presetDisplayOrder = [0, 9, 10, 11, 12, 6, 7, 8, 5, 4, 2, 1, 3];
var lyricColorPresets = [
  { name: '雾蓝', color: '#a9b8c8' },
  { name: '银蓝', color: '#9db8cf' },
  { name: '冰川', color: '#7ec8d8' },
  { name: '青绿', color: '#66d2b5' },
  { name: '松针', color: '#7fa894' },
  { name: '月白', color: '#d7d2c4' },
  { name: '岩金', color: '#c3ae7c' },
  { name: '琥珀', color: '#d9a45f' },
  { name: '暮粉', color: '#c78aa4' },
  { name: '玫红', color: '#d76a8d' },
  { name: '烟紫', color: '#9b83d3' },
  { name: '电紫', color: '#8d70ff' },
  { name: '靛蓝', color: '#5e78d8' },
  { name: '海蓝', color: '#3c9fe0' },
  { name: '霓青', color: '#28c5c3' },
  { name: '夜绿', color: '#245c49' },
  { name: '酒红', color: '#6d1f35' },
  { name: '墨黑', color: '#111318' },
];
var USER_FX_ARCHIVE_STORE_KEY = 'mineradio-user-fx-archives-v1';
var USER_FX_ARCHIVE_EXPORT_TYPE = 'mineradio-user-fx-archive';
var USER_FX_ARCHIVE_SCHEMA = 1;
var USER_FX_SHARE_PREFIX = 'MR2';
var USER_FX_SHARE_VERSION = 1;
var USER_FX_SHARE_PAYLOAD_TYPE = 'ufa';
var USER_FX_SHARE_CODEC_GZIP = 'G';
var USER_FX_SHARE_CODEC_JSON = 'J';
var USER_FX_SHARE_COMPACT_DELTA = 'd';
var USER_FX_SHARE_COMPACT_FULL = 'f';
var USER_FX_SHARE_KEYS = [
  'visualPresetSchema',
  'preset',
  'intensity',
  'cinemaShake',
  'depth',
  'coverResolution',
  'point',
  'speed',
  'twist',
  'color',
  'scatter',
  'bgFade',
  'bloomStrength',
  'lyricGlowStrength',
  'lyricBackgroundAdapt',
  'lyricScale',
  'lyricOffsetX',
  'lyricOffsetY',
  'lyricOffsetZ',
  'lyricTiltX',
  'lyricTiltY',
  'lyricCameraLock',
  'lyricColorMode',
  'lyricColor',
  'lyricHighlightMode',
  'lyricHighlightColor',
  'lyricGlowLinked',
  'lyricGlowColor',
  'lyricDisplayMode',
  'lyricTranslationMode',
  'lyricMotionStyle',
  'lyricCustomLineCount',
  'lyricGlitchCameraBind',
  'lyricGlitchIntensity',
  'lyricGlitchSlice',
  'lyricGlitchChroma',
  'lyricGlitchRate',
  'lyricGlitchJitter',
  'lyricContextOpacity',
  'lyricContextSpread',
  'lyricTranslationGap',
  'lyricTranslationScale',
  'lyricTranslationOpacity',
  'lyricEdgeFade',
  'lyricMotionSoftness',
  'lyricFont',
  'lyricLetterSpacing',
  'lyricLineHeight',
  'lyricWeight',
  'visualTintMode',
  'visualTintColor',
  'uiAccentColor',
  'homeAccentColor',
  'homeIconColor',
  'visualIconColor',
  'backgroundColorMode',
  'backgroundColor',
  'backgroundOpacity',
  'backgroundAlbumCover',
  'backgroundMediaCropX',
  'backgroundMediaCropY',
  'backgroundMediaZoom',
  'controlGlassChromaticOffset',
  'playlistPanelGlassBlur',
  'playlistPanelGlassDensity',
  'playlistPanelOpenDuration',
  'playlistPanelCloseDuration',
  'backgroundColorCustom',
  'floatLayer',
  'cinema',
  'edge',
  'aiDepth',
  'bloom',
  'lyricGlow',
  'lyricGlowBeat',
  'lyricGlowParticles',
  'lyricVerticalFloat',
  'lyricPauseHold',
  'desktopLyrics',
  'desktopLyricsSize',
  'desktopLyricsOpacity',
  'desktopLyricsY',
  'desktopLyricsClickThrough',
  'desktopLyricsCinema',
  'desktopLyricsHighlight',
  'desktopLyricsFps',
  'performanceBackground',
  'performanceQuality',
  'foregroundFpsMode',
  'memoryAutoTrimApp',
  'memoryAutoTrimOnBackground',
  'memoryAutoSystemTrim',
  'memorySystemAutoElevate',
  'memorySystemIntervalMin',
  'memorySystemThresholdPercent',
  'memorySystemMask',
  'memorySafetyRevision',
  'liveBackgroundKeep',
  'sonicGroundAmplitude',
  'sonicGroundMotionSpeed',
  'sonicGroundDensity',
  'sonicGroundRange',
  'sonicGroundLower',
  'sonicGroundDepth',
  'sonicGroundAutoRotate',
  'sonicGroundColorMode',
  'sonicGroundBaseColor',
  'sonicGroundCoolColor',
  'sonicGroundWarmColor',
  'sonicGroundAccentColor',
  'sonicGroundGlow',
  'sonicGroundSubBass',
  'sonicGroundBass',
  'sonicGroundLowMid',
  'sonicGroundMid',
  'sonicGroundHighMid',
  'sonicGroundPresence',
  'sonicGroundBrilliance',
  'sonicGroundAir',
  'sonicGroundFloatingEnabled',
  'sonicGroundFloatingIntensity',
  'sonicGroundFloatingMinSize',
  'sonicGroundFloatingMaxSize',
  'sonicGroundFloatingSpeed',
  'sonicGroundFloatingCount',
  'sonicAudioMonitorEnabled',
  'sonicAudioAutoTrack',
  'sonicAudioSensitivity',
  'sonicAudioBandStart',
  'sonicAudioBandEnd',
  'sonicAudioThreshold',
  'sonicAudioPulseStrength',
  'sonicWorkshopInputGain',
  'sonicWorkshopAudioIntensity',
  'sonicWorkshopResponseRange',
  'sonicWorkshopPeakIntensity',
  'sonicWorkshopColorMode',
  'sonicWorkshopTheme',
  'sonicWorkshopCustomColor',
  'sonicWorkshopBaseColorMode',
  'sonicWorkshopBaseColor',
  'sonicWorkshopWarmColorMode',
  'sonicWorkshopWarmColor',
  'sonicWorkshopCoolColorMode',
  'sonicWorkshopCoolColor',
  'sonicWorkshopRippleColorMode',
  'sonicWorkshopRippleColor',
  'sonicWorkshopPeakColorMode',
  'sonicWorkshopPeakColor',
  'particleLyrics',
  'backCover',
  'shelf',
  'shelfPinnedOpen',
  'shelfCameraMode',
  'shelfPresence',
  'shelfShowPodcasts',
  'shelfMergeCollections',
  'shelfSize',
  'shelfOffsetX',
  'shelfOffsetY',
  'shelfOffsetZ',
  'shelfAngleY',
  'shelfAngleYManual',
  'shelfOpacity',
  'shelfBgOpacity',
  'shelfAccentColor',
  'shelfDetailOffsetX',
  'shelfDetailOffsetY',
  'shelfDetailOffsetZ',
  'shelfDetailScale',
  'shelfDetailAngleX',
  'shelfDetailAngleY',
  'shelfDetailRowGap',
  'shelfDetailOpenDuration',
  'shelfDetailCloseDuration',
  'shelfDetailRowDuration',
  'shelfDetailIntroStrength',
  'shelfDetailParallax',
  'shelfSummonOpenDuration',
  'shelfSummonCloseDuration',
  'shelfSummonSlide',
  'shelfSummonStagger',
  'shelfSummonScale',
  'shelfSummonParallax',
  'shelfCameraEnterSpeed',
  'shelfCameraExitSpeed',
  'cam',
  'cameraViewSaved',
  'cameraViewMode',
  'cameraOrbitTheta',
  'cameraOrbitPhi',
  'cameraOrbitRadius',
  'cameraFreePositionX',
  'cameraFreePositionY',
  'cameraFreePositionZ',
  'cameraFreeYaw',
  'cameraFreePitch',
  'cameraFreeRoll',
  'cameraFreeFov',
  'visualRotationSaved',
  'visualRotationX',
  'visualRotationY',
  'windowBackgroundOpacity',
  'backgroundGlassOpacity',
  'backgroundStarRiver',
  'lyricTextureClarity',
  // Append-only: preserve every existing MR2 field index.
  'lyricLiveViewportFit',
  'lyricContextHighQuality',
  'lyricBackdropAdapt',
  'coverBackdropAdapt',
  'gesturePlayerActions',
  'gestureHandOverlay',
  'gestureSensitivity'
];
function defaultUserFxArchiveName(index) {
  return '存档 ' + (index + 1);
}
function normalizeUserFxArchiveName(name, index) {
  name = String(name || '').replace(/\s+/g, ' ').trim();
  if (!name) name = defaultUserFxArchiveName(index);
  return name.slice(0, 18);
}
function archiveNumber(raw, key, fallback, min, max) {
  var value = raw && raw[key] != null ? Number(raw[key]) : fallback;
  if (!isFinite(value)) value = fallback;
  return clampRange(value, min, max);
}
function archiveMode(raw, key, pattern, fallback) {
  var value = String(raw && raw[key] != null ? raw[key] : fallback);
  return pattern.test(value) ? value : fallback;
}
function archiveHasCameraState(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.cameraViewSaved === true) return true;
  var keys = [
    'cameraViewMode',
    'cameraOrbitTheta',
    'cameraOrbitPhi',
    'cameraOrbitRadius',
    'cameraFreePositionX',
    'cameraFreePositionY',
    'cameraFreePositionZ',
    'cameraFreeYaw',
    'cameraFreePitch',
    'cameraFreeRoll',
    'cameraFreeFov'
  ];
  return keys.some(function (key) { return raw[key] != null; });
}
function archiveHasVisualRotationState(raw) {
  if (!raw || typeof raw !== 'object') return false;
  return raw.visualRotationSaved === true || raw.visualRotationX != null || raw.visualRotationY != null;
}
function isCameraArchiveKey(key) {
  return /^camera(View|Orbit|Free)/.test(String(key || '')) || /^visualRotation/.test(String(key || ''));
}
function normalizeFxArchiveSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var savedPreset = clampRange(Number(raw.preset) || 0, 0, presetMeta.length - 1);
  if (savedPreset === 3 && raw.visualPresetSchema !== VISUAL_PRESET_SCHEMA) savedPreset = 5;
  var archiveShelfMode = archiveMode(raw, 'shelf', /^(off|side|stage)$/, fxDefaults.shelf);
  var archiveShelfPresence = archiveShelfMode === 'off' ? 'auto' : archiveMode(raw, 'shelfPresence', /^(auto|always)$/, fxDefaults.shelfPresence);
  var archiveShelfPinnedOpen = archiveShelfMode === 'side' && archiveShelfPresence === 'always' && raw.shelfPinnedOpen === true;
  var archiveCameraSaved = archiveHasCameraState(raw);
  var archiveVisualRotationSaved = archiveHasVisualRotationState(raw);
  return {
    visualPresetSchema: VISUAL_PRESET_SCHEMA,
    preset: savedPreset,
    intensity: archiveNumber(raw, 'intensity', fxDefaults.intensity, 0.2, 1.6),
    cinemaShake: archiveNumber(raw, 'cinemaShake', fxDefaults.cinemaShake, 0, 1.8),
    depth: archiveNumber(raw, 'depth', fxDefaults.depth, 0.2, 1.8),
    coverResolution: normalizeCoverResolution(raw.coverResolution),
    point: archiveNumber(raw, 'point', fxDefaults.point, 0.5, 2.2),
    speed: archiveNumber(raw, 'speed', fxDefaults.speed, 0.2, 2.5),
    twist: archiveNumber(raw, 'twist', fxDefaults.twist, 0, 0.6),
    color: archiveNumber(raw, 'color', fxDefaults.color, 0.5, 2.0),
    scatter: archiveNumber(raw, 'scatter', fxDefaults.scatter, 0, 0.5),
    bgFade: archiveNumber(raw, 'bgFade', fxDefaults.bgFade, 0, 1.2),
    bloomStrength: archiveNumber(raw, 'bloomStrength', fxDefaults.bloomStrength, 0, 1.6),
    lyricGlowStrength: archiveNumber(raw, 'lyricGlowStrength', fxDefaults.lyricGlowStrength, 0, 0.85),
    lyricBackgroundAdapt: archiveNumber(raw, 'lyricBackgroundAdapt', fxDefaults.lyricBackgroundAdapt, 0, 1),
    lyricScale: archiveNumber(raw, 'lyricScale', fxDefaults.lyricScale, 0.35, 1.65),
    lyricOffsetX: archiveNumber(raw, 'lyricOffsetX', fxDefaults.lyricOffsetX, -4.0, 4.0),
    lyricOffsetY: archiveNumber(raw, 'lyricOffsetY', fxDefaults.lyricOffsetY, -2.4, 2.7),
    lyricOffsetZ: archiveNumber(raw, 'lyricOffsetZ', fxDefaults.lyricOffsetZ, -3.2, 3.2),
    lyricTiltX: archiveNumber(raw, 'lyricTiltX', fxDefaults.lyricTiltX, -84, 84),
    lyricTiltY: archiveNumber(raw, 'lyricTiltY', fxDefaults.lyricTiltY, -84, 84),
    lyricCameraLock: !!raw.lyricCameraLock,
    lyricColorMode: raw.lyricColorMode === 'custom' ? 'custom' : 'auto',
    lyricColor: normalizeHexColor(raw.lyricColor || fxDefaults.lyricColor),
    lyricHighlightMode: raw.lyricHighlightMode === 'custom' ? 'custom' : 'auto',
    lyricHighlightColor: normalizeHexColor(raw.lyricHighlightColor || fxDefaults.lyricHighlightColor),
    lyricGlowLinked: raw.lyricGlowLinked !== false,
    lyricGlowColor: normalizeHexColor(raw.lyricGlowColor || fxDefaults.lyricGlowColor),
    lyricDisplayMode: normalizeLyricDisplayMode(raw.lyricDisplayMode || fxDefaults.lyricDisplayMode),
    lyricTranslationMode: normalizeLyricTranslationMode(raw.lyricTranslationMode || fxDefaults.lyricTranslationMode),
    lyricMotionStyle: normalizeLyricMotionStyle(raw.lyricMotionStyle || fxDefaults.lyricMotionStyle),
    lyricCustomLineCount: archiveNumber(raw, 'lyricCustomLineCount', fxDefaults.lyricCustomLineCount, 1, 10),
    lyricGlitchCameraBind: !!raw.lyricGlitchCameraBind,
    lyricGlitchIntensity: archiveNumber(raw, 'lyricGlitchIntensity', fxDefaults.lyricGlitchIntensity, 0, 1.5),
    lyricGlitchSlice: archiveNumber(raw, 'lyricGlitchSlice', fxDefaults.lyricGlitchSlice, 0, 1.4),
    lyricGlitchChroma: archiveNumber(raw, 'lyricGlitchChroma', fxDefaults.lyricGlitchChroma, 0, 1.6),
    lyricGlitchRate: archiveNumber(raw, 'lyricGlitchRate', fxDefaults.lyricGlitchRate, 0.45, 2.2),
    lyricGlitchJitter: archiveNumber(raw, 'lyricGlitchJitter', fxDefaults.lyricGlitchJitter, 0, 1.8),
    lyricContextOpacity: archiveNumber(raw, 'lyricContextOpacity', fxDefaults.lyricContextOpacity, 0.25, 1),
    lyricContextSpread: archiveNumber(raw, 'lyricContextSpread', fxDefaults.lyricContextSpread, 0.60, 2.40),
    lyricTranslationGap: archiveNumber(raw, 'lyricTranslationGap', fxDefaults.lyricTranslationGap, 0.28, 2.20),
    lyricTranslationScale: archiveNumber(raw, 'lyricTranslationScale', fxDefaults.lyricTranslationScale, 0.46, 1.12),
    lyricTranslationOpacity: archiveNumber(raw, 'lyricTranslationOpacity', fxDefaults.lyricTranslationOpacity, 0.20, 1),
    lyricEdgeFade: archiveNumber(raw, 'lyricEdgeFade', fxDefaults.lyricEdgeFade, 0, 1),
    lyricMotionSoftness: archiveNumber(raw, 'lyricMotionSoftness', fxDefaults.lyricMotionSoftness, 0.15, 1.2),
    lyricFont: normalizeLyricFontKey(raw.lyricFont),
    lyricLetterSpacing: archiveNumber(raw, 'lyricLetterSpacing', fxDefaults.lyricLetterSpacing, -0.04, 0.18),
    lyricLineHeight: archiveNumber(raw, 'lyricLineHeight', fxDefaults.lyricLineHeight, 0.72, 1.80),
    lyricWeight: archiveNumber(raw, 'lyricWeight', fxDefaults.lyricWeight, 500, 900),
    lyricTextureClarity: normalizeLyricTextureClarity(raw.lyricTextureClarity),
    lyricLiveViewportFit: raw.lyricLiveViewportFit !== false,
    lyricContextHighQuality: raw.lyricContextHighQuality !== false,
    lyricBackdropAdapt: raw.lyricBackdropAdapt !== false,
    coverBackdropAdapt: raw.coverBackdropAdapt !== false,
    visualTintMode: raw.visualTintMode === 'custom' ? 'custom' : 'auto',
    visualTintColor: normalizeHexColor(raw.visualTintColor || fxDefaults.visualTintColor),
    uiAccentColor: normalizeHexColor(raw.uiAccentColor || fxDefaults.uiAccentColor, fxDefaults.uiAccentColor),
    homeAccentColor: normalizeHexColor(raw.homeAccentColor || fxDefaults.homeAccentColor, fxDefaults.homeAccentColor),
    homeIconColor: normalizeHexColor(raw.homeIconColor || fxDefaults.homeIconColor, fxDefaults.homeIconColor),
    visualIconColor: normalizeHexColor(raw.visualIconColor || fxDefaults.visualIconColor, fxDefaults.visualIconColor),
    backgroundColorMode: raw.backgroundColorMode === 'custom' || raw.backgroundColorCustom ? 'custom' : 'cover',
    backgroundColor: normalizeHexColor(raw.backgroundColor || fxDefaults.backgroundColor, fxDefaults.backgroundColor),
    backgroundOpacity: archiveNumber(raw, 'backgroundOpacity', fxDefaults.backgroundOpacity, 0, 1),
    backgroundAlbumCover: raw.backgroundAlbumCover === true,
    backgroundMediaCropX: archiveNumber(raw, 'backgroundMediaCropX', fxDefaults.backgroundMediaCropX, 0, 100),
    backgroundMediaCropY: archiveNumber(raw, 'backgroundMediaCropY', fxDefaults.backgroundMediaCropY, 0, 100),
    backgroundMediaZoom: archiveNumber(raw, 'backgroundMediaZoom', fxDefaults.backgroundMediaZoom, 1, 2.8),
    windowBackgroundOpacity: archiveNumber(raw, 'windowBackgroundOpacity', fxDefaults.windowBackgroundOpacity, 0, 1),
    backgroundGlassOpacity: archiveNumber(raw, 'backgroundGlassOpacity', fxDefaults.backgroundGlassOpacity, 0, 1),
    controlGlassChromaticOffset: archiveNumber(raw, 'controlGlassChromaticOffset', fxDefaults.controlGlassChromaticOffset, 30, 140),
    playlistPanelGlassBlur: archiveNumber(raw, 'playlistPanelGlassBlur', fxDefaults.playlistPanelGlassBlur, 14, 60),
    playlistPanelGlassDensity: archiveNumber(raw, 'playlistPanelGlassDensity', fxDefaults.playlistPanelGlassDensity, 0.55, 1),
    playlistPanelOpenDuration: archiveNumber(raw, 'playlistPanelOpenDuration', fxDefaults.playlistPanelOpenDuration, 0.08, 0.72),
    playlistPanelCloseDuration: archiveNumber(raw, 'playlistPanelCloseDuration', fxDefaults.playlistPanelCloseDuration, 0.06, 0.48),
    backgroundColorCustom: raw.backgroundColorMode === 'custom' || !!raw.backgroundColorCustom,
    floatLayer: !!raw.floatLayer,
    cinema: raw.cinema !== false,
    edge: !!raw.edge,
    aiDepth: !!raw.aiDepth,
    bloom: !!raw.bloom,
    lyricGlow: raw.lyricGlow !== false,
    lyricGlowBeat: raw.lyricGlowBeat !== false,
    lyricGlowParticles: !!raw.lyricGlowParticles,
    lyricVerticalFloat: raw.lyricVerticalFloat !== false,
    backgroundStarRiver: raw.backgroundStarRiver !== false,
    lyricPauseHold: raw.lyricPauseHold !== false,
    desktopLyrics: !!raw.desktopLyrics,
    desktopLyricsSize: archiveNumber(raw, 'desktopLyricsSize', fxDefaults.desktopLyricsSize, 0.72, 1.55),
    desktopLyricsOpacity: archiveNumber(raw, 'desktopLyricsOpacity', fxDefaults.desktopLyricsOpacity, 0.28, 1),
    desktopLyricsY: archiveNumber(raw, 'desktopLyricsY', fxDefaults.desktopLyricsY, 0.08, 0.92),
    desktopLyricsClickThrough: raw.desktopLyricsClickThrough === true,
    desktopLyricsCinema: raw.desktopLyricsCinema !== false,
    desktopLyricsHighlight: raw.desktopLyricsHighlight === true,
    desktopLyricsFps: normalizeDesktopLyricsFps(Object.prototype.hasOwnProperty.call(raw, 'desktopLyricsFps') ? raw.desktopLyricsFps : fxDefaults.desktopLyricsFps),
    performanceBackground: normalizePerformanceBackgroundMode(raw.performanceBackground, raw.liveBackgroundKeep === true),
    performanceQuality: normalizePerformanceQuality(raw.performanceQuality),
    foregroundFpsMode: normalizeForegroundFpsMode(raw.foregroundFpsMode === 'adaptive' ? 'vsync' : raw.foregroundFpsMode),
    memoryAutoTrimApp: raw.memoryAutoTrimApp !== false,
    memoryAutoTrimOnBackground: raw.memoryAutoTrimOnBackground !== false,
    memoryAutoSystemTrim: raw.memoryAutoSystemTrim === true,
    memorySystemAutoElevate: raw.memorySystemAutoElevate === true,
    memorySystemIntervalMin: archiveNumber(raw, 'memorySystemIntervalMin', fxDefaults.memorySystemIntervalMin, 5, 180),
    memorySystemThresholdPercent: archiveNumber(raw, 'memorySystemThresholdPercent', fxDefaults.memorySystemThresholdPercent, 50, 98),
    memorySystemMask: archiveNumber(raw, 'memorySystemMask', fxDefaults.memorySystemMask, 1, 29),
    memorySafetyRevision: fxDefaults.memorySafetyRevision,
    liveBackgroundKeep: normalizePerformanceBackgroundMode(raw.performanceBackground, raw.liveBackgroundKeep === true) === 'keep',
    sonicGroundAmplitude: archiveNumber(raw, 'sonicGroundAmplitude', fxDefaults.sonicGroundAmplitude, 0, 100),
    sonicGroundMotionSpeed: archiveNumber(raw, 'sonicGroundMotionSpeed', fxDefaults.sonicGroundMotionSpeed, 0, 100),
    sonicGroundDensity: archiveNumber(raw, 'sonicGroundDensity', fxDefaults.sonicGroundDensity, 0, 100),
    sonicGroundRange: archiveNumber(raw, 'sonicGroundRange', fxDefaults.sonicGroundRange, 0, 100),
    sonicGroundLower: archiveNumber(raw, 'sonicGroundLower', fxDefaults.sonicGroundLower, 0, 100),
    sonicGroundDepth: archiveNumber(raw, 'sonicGroundDepth', fxDefaults.sonicGroundDepth, 0, 100),
    sonicGroundAutoRotate: archiveNumber(raw, 'sonicGroundAutoRotate', fxDefaults.sonicGroundAutoRotate, 0, 100),
    sonicGroundColorMode: raw.sonicGroundColorMode === 'custom' ? 'custom' : 'cover',
    sonicGroundBaseColor: normalizeHexColor(raw.sonicGroundBaseColor || fxDefaults.sonicGroundBaseColor, fxDefaults.sonicGroundBaseColor),
    sonicGroundCoolColor: normalizeHexColor(raw.sonicGroundCoolColor || fxDefaults.sonicGroundCoolColor, fxDefaults.sonicGroundCoolColor),
    sonicGroundWarmColor: normalizeHexColor(raw.sonicGroundWarmColor || fxDefaults.sonicGroundWarmColor, fxDefaults.sonicGroundWarmColor),
    sonicGroundAccentColor: normalizeHexColor(raw.sonicGroundAccentColor || fxDefaults.sonicGroundAccentColor, fxDefaults.sonicGroundAccentColor),
    sonicGroundGlow: archiveNumber(raw, 'sonicGroundGlow', fxDefaults.sonicGroundGlow, 0, 100),
    sonicGroundSubBass: archiveNumber(raw, 'sonicGroundSubBass', fxDefaults.sonicGroundSubBass, 0, 100),
    sonicGroundBass: archiveNumber(raw, 'sonicGroundBass', fxDefaults.sonicGroundBass, 0, 100),
    sonicGroundLowMid: archiveNumber(raw, 'sonicGroundLowMid', fxDefaults.sonicGroundLowMid, 0, 100),
    sonicGroundMid: archiveNumber(raw, 'sonicGroundMid', fxDefaults.sonicGroundMid, 0, 100),
    sonicGroundHighMid: archiveNumber(raw, 'sonicGroundHighMid', fxDefaults.sonicGroundHighMid, 0, 100),
    sonicGroundPresence: archiveNumber(raw, 'sonicGroundPresence', fxDefaults.sonicGroundPresence, 0, 100),
    sonicGroundBrilliance: archiveNumber(raw, 'sonicGroundBrilliance', fxDefaults.sonicGroundBrilliance, 0, 100),
    sonicGroundAir: archiveNumber(raw, 'sonicGroundAir', fxDefaults.sonicGroundAir, 0, 100),
    sonicGroundFloatingEnabled: raw.sonicGroundFloatingEnabled !== false,
    sonicGroundFloatingIntensity: archiveNumber(raw, 'sonicGroundFloatingIntensity', fxDefaults.sonicGroundFloatingIntensity, 0, 100),
    sonicGroundFloatingMinSize: archiveNumber(raw, 'sonicGroundFloatingMinSize', fxDefaults.sonicGroundFloatingMinSize, 0, 100),
    sonicGroundFloatingMaxSize: archiveNumber(raw, 'sonicGroundFloatingMaxSize', fxDefaults.sonicGroundFloatingMaxSize, 0, 100),
    sonicGroundFloatingSpeed: archiveNumber(raw, 'sonicGroundFloatingSpeed', fxDefaults.sonicGroundFloatingSpeed, 0, 100),
    sonicGroundFloatingCount: archiveNumber(raw, 'sonicGroundFloatingCount', fxDefaults.sonicGroundFloatingCount, 0, 100),
    sonicAudioMonitorEnabled: raw.sonicAudioMonitorEnabled !== false,
    sonicAudioAutoTrack: raw.sonicAudioAutoTrack !== false,
    sonicAudioSensitivity: archiveNumber(raw, 'sonicAudioSensitivity', fxDefaults.sonicAudioSensitivity, 0, 100),
    sonicAudioBandStart: archiveNumber(raw, 'sonicAudioBandStart', fxDefaults.sonicAudioBandStart, 0, 510),
    sonicAudioBandEnd: archiveNumber(raw, 'sonicAudioBandEnd', fxDefaults.sonicAudioBandEnd, 2, 512),
    sonicAudioThreshold: archiveNumber(raw, 'sonicAudioThreshold', fxDefaults.sonicAudioThreshold, 0, 100),
    sonicAudioPulseStrength: archiveNumber(raw, 'sonicAudioPulseStrength', fxDefaults.sonicAudioPulseStrength, 0, 100),
    sonicWorkshopInputGain: archiveNumber(raw, 'sonicWorkshopInputGain', fxDefaults.sonicWorkshopInputGain, 40, 100),
    sonicWorkshopAudioIntensity: archiveNumber(raw, 'sonicWorkshopAudioIntensity', fxDefaults.sonicWorkshopAudioIntensity, 0.3, 2.5),
    sonicWorkshopResponseRange: archiveNumber(raw, 'sonicWorkshopResponseRange', fxDefaults.sonicWorkshopResponseRange, 0.3, 2),
    sonicWorkshopPeakIntensity: archiveNumber(raw, 'sonicWorkshopPeakIntensity', fxDefaults.sonicWorkshopPeakIntensity, 0, 1.4),
    sonicWorkshopColorMode: raw.sonicWorkshopColorMode === 'custom' ? 'custom' : 'cover',
    sonicWorkshopTheme: archiveMode(raw, 'sonicWorkshopTheme', /^(coral-mirage|ocean-deep|arctic-blue|arctic-aurora|emerald-forest|cyber-forest|minimal-mono|minimal-monochrome|neon-tokyo|golden-hour|ember-fire|crimson|crimson-sunset|aurora|violet-dream)$/, fxDefaults.sonicWorkshopTheme),
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
    particleLyrics: raw.particleLyrics !== false,
    backCover: !!raw.backCover,
    shelf: archiveShelfMode,
    shelfPinnedOpen: archiveShelfPinnedOpen,
    shelfCameraMode: archiveMode(raw, 'shelfCameraMode', /^(dynamic|static)$/, fxDefaults.shelfCameraMode),
    shelfPresence: archiveShelfPresence,
    shelfShowPodcasts: raw.shelfShowPodcasts !== false,
    shelfMergeCollections: raw.shelfMergeCollections === true,
    shelfSize: archiveNumber(raw, 'shelfSize', fxDefaults.shelfSize, 0.65, 1.45),
    shelfOffsetX: archiveNumber(raw, 'shelfOffsetX', fxDefaults.shelfOffsetX, -1.2, 1.2),
    shelfOffsetY: archiveNumber(raw, 'shelfOffsetY', fxDefaults.shelfOffsetY, -0.9, 0.9),
    shelfOffsetZ: archiveNumber(raw, 'shelfOffsetZ', fxDefaults.shelfOffsetZ, -0.9, 0.9),
    shelfAngleY: archiveNumber(raw, 'shelfAngleY', fxDefaults.shelfAngleY, -30, 30),
    shelfAngleYManual: raw.shelfAngleYManual === true,
    shelfOpacity: archiveNumber(raw, 'shelfOpacity', fxDefaults.shelfOpacity, 0.25, 1),
    shelfBgOpacity: archiveNumber(raw, 'shelfBgOpacity', fxDefaults.shelfBgOpacity, 0.25, 0.98),
    shelfAccentColor: normalizeHexColor(raw.shelfAccentColor || fxDefaults.shelfAccentColor, fxDefaults.shelfAccentColor),
    shelfDetailOffsetX: archiveNumber(raw, 'shelfDetailOffsetX', fxDefaults.shelfDetailOffsetX, -4.8, 4.8),
    shelfDetailOffsetY: archiveNumber(raw, 'shelfDetailOffsetY', fxDefaults.shelfDetailOffsetY, -3.6, 3.6),
    shelfDetailOffsetZ: archiveNumber(raw, 'shelfDetailOffsetZ', fxDefaults.shelfDetailOffsetZ, -3.6, 3.6),
    shelfDetailScale: archiveNumber(raw, 'shelfDetailScale', fxDefaults.shelfDetailScale, 0.72, 1.35),
    shelfDetailAngleX: archiveNumber(raw, 'shelfDetailAngleX', fxDefaults.shelfDetailAngleX, -24, 24),
    shelfDetailAngleY: archiveNumber(raw, 'shelfDetailAngleY', fxDefaults.shelfDetailAngleY, -28, 28),
    shelfDetailRowGap: archiveNumber(raw, 'shelfDetailRowGap', fxDefaults.shelfDetailRowGap, 0.72, 1.32),
    shelfDetailOpenDuration: archiveNumber(raw, 'shelfDetailOpenDuration', fxDefaults.shelfDetailOpenDuration, 0.12, 1.2),
    shelfDetailCloseDuration: archiveNumber(raw, 'shelfDetailCloseDuration', fxDefaults.shelfDetailCloseDuration, 0.08, 0.8),
    shelfDetailRowDuration: archiveNumber(raw, 'shelfDetailRowDuration', fxDefaults.shelfDetailRowDuration, 0.16, 1.6),
    shelfDetailIntroStrength: archiveNumber(raw, 'shelfDetailIntroStrength', fxDefaults.shelfDetailIntroStrength, 0, 1.8),
    shelfDetailParallax: archiveNumber(raw, 'shelfDetailParallax', fxDefaults.shelfDetailParallax, 0, 1.8),
    shelfSummonOpenDuration: archiveNumber(raw, 'shelfSummonOpenDuration', fxDefaults.shelfSummonOpenDuration, 0.08, 2),
    shelfSummonCloseDuration: archiveNumber(raw, 'shelfSummonCloseDuration', fxDefaults.shelfSummonCloseDuration, 0.08, 1.6),
    shelfSummonSlide: archiveNumber(raw, 'shelfSummonSlide', fxDefaults.shelfSummonSlide, 0, 4),
    shelfSummonStagger: archiveNumber(raw, 'shelfSummonStagger', fxDefaults.shelfSummonStagger, 0, 3),
    shelfSummonScale: archiveNumber(raw, 'shelfSummonScale', fxDefaults.shelfSummonScale, 0, 3),
    shelfSummonParallax: archiveNumber(raw, 'shelfSummonParallax', fxDefaults.shelfSummonParallax, 0, 2.5),
    shelfCameraEnterSpeed: archiveNumber(raw, 'shelfCameraEnterSpeed', fxDefaults.shelfCameraEnterSpeed, 0.2, 1.5),
    shelfCameraExitSpeed: archiveNumber(raw, 'shelfCameraExitSpeed', fxDefaults.shelfCameraExitSpeed, 0.2, 1.5),
    cam: archiveMode(raw, 'cam', /^(off|gesture)$/, fxDefaults.cam),
    gesturePlayerActions: raw.gesturePlayerActions !== false,
    gestureHandOverlay: raw.gestureHandOverlay !== false,
    gestureSensitivity: archiveMode(raw, 'gestureSensitivity', /^(steady|balanced|quick)$/, fxDefaults.gestureSensitivity),
    cameraViewSaved: archiveCameraSaved,
    cameraViewMode: archiveMode(raw, 'cameraViewMode', /^(orbit|free)$/, 'orbit'),
    cameraOrbitTheta: archiveNumber(raw, 'cameraOrbitTheta', 0, -Math.PI * 8, Math.PI * 8),
    cameraOrbitPhi: archiveNumber(raw, 'cameraOrbitPhi', 0.08, -Math.PI * 0.45, Math.PI * 0.45),
    cameraOrbitRadius: archiveNumber(raw, 'cameraOrbitRadius', 6.6, 2.4, 14.0),
    cameraFreePositionX: archiveNumber(raw, 'cameraFreePositionX', 0, -80, 80),
    cameraFreePositionY: archiveNumber(raw, 'cameraFreePositionY', 0, -80, 80),
    cameraFreePositionZ: archiveNumber(raw, 'cameraFreePositionZ', 6.6, -80, 80),
    cameraFreeYaw: archiveNumber(raw, 'cameraFreeYaw', 0, -Math.PI * 8, Math.PI * 8),
    cameraFreePitch: archiveNumber(raw, 'cameraFreePitch', 0, -Math.PI * 0.49, Math.PI * 0.49),
    cameraFreeRoll: archiveNumber(raw, 'cameraFreeRoll', 0, -Math.PI, Math.PI),
    cameraFreeFov: archiveNumber(raw, 'cameraFreeFov', BASE_FOV, 26, 72),
    visualRotationSaved: archiveVisualRotationSaved,
    visualRotationX: archiveNumber(raw, 'visualRotationX', 0, -Math.PI * 8, Math.PI * 8),
    visualRotationY: archiveNumber(raw, 'visualRotationY', 0, -Math.PI * 8, Math.PI * 8)
  };
}
function readUserFxArchives() {
  var raw = [];
  try {
    raw = JSON.parse(localStorage.getItem(USER_FX_ARCHIVE_STORE_KEY) || '[]') || [];
  } catch (e) {
    raw = [];
  }
  if (!Array.isArray(raw)) raw = [];
  return raw.map(function (slot, index) {
    slot = slot && typeof slot === 'object' ? slot : {};
    var snapshot = normalizeFxArchiveSnapshot(slot.snapshot);
    return {
      name: normalizeUserFxArchiveName(slot.name, index),
      createdAt: Number(slot.createdAt) || (snapshot ? (Number(slot.savedAt) || Date.now()) : 0),
      savedAt: snapshot ? (Number(slot.savedAt) || Date.now()) : 0,
      snapshot: snapshot
    };
  }).filter(function (slot) {
    return !!(slot.snapshot || slot.savedAt || slot.createdAt);
  });
}
function saveUserFxArchives() {
  try {
    localStorage.setItem(USER_FX_ARCHIVE_STORE_KEY, JSON.stringify(userFxArchives));
  } catch (e) {
    showToast('用户存档保存失败，本地存储空间可能不足');
  }
}
function hasStoredUserFxArchives() {
  try {
    return localStorage.getItem(USER_FX_ARCHIVE_STORE_KEY) != null;
  } catch (e) {
    return true;
  }
}
function createPackagedDefaultUserFxArchiveSlot() {
  return {
    name: normalizeUserFxArchiveName(PACKAGED_DEFAULT_USER_FX_ARCHIVE_NAME, 0),
    createdAt: PACKAGED_DEFAULT_USER_FX_ARCHIVE_EXPORTED_AT,
    savedAt: PACKAGED_DEFAULT_USER_FX_ARCHIVE_SAVED_AT,
    snapshot: normalizeFxArchiveSnapshot(clonePackagedDefaultFxSnapshot())
  };
}
function formatUserArchiveTime(ts) {
  ts = Number(ts) || 0;
  if (!ts) return '空槽位';
  var diff = Date.now() - ts;
  if (diff < 60000) return '刚刚保存';
  if (diff < 3600000) return Math.max(1, Math.round(diff / 60000)) + ' 分钟前';
  var d = new Date(ts);
  function pad(v) { return String(v).padStart(2, '0'); }
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function captureCameraArchiveState() {
  var useFree = !!(typeof freeCamera !== 'undefined' && freeCamera && (freeCamera.active || freeCamera.locked));
  var visualRotX = typeof particles !== 'undefined' && particles && particles.rotation ? Number(particles.rotation.x) || 0 : (typeof gestureRotation !== 'undefined' && gestureRotation ? Number(gestureRotation.x) || 0 : 0);
  var visualRotY = typeof particles !== 'undefined' && particles && particles.rotation ? Number(particles.rotation.y) || 0 : (typeof gestureRotation !== 'undefined' && gestureRotation ? Number(gestureRotation.y) || 0 : 0);
  var out = {
    cameraViewSaved: true,
    cameraViewMode: useFree ? 'free' : 'orbit',
    cameraOrbitTheta: orbit && isFinite(orbit.userTheta) ? orbit.userTheta : 0,
    cameraOrbitPhi: orbit && isFinite(orbit.userPhi) ? orbit.userPhi : 0.08,
    cameraOrbitRadius: orbit && isFinite(orbit.userRadius) ? orbit.userRadius : 6.6,
    cameraFreePositionX: 0,
    cameraFreePositionY: 0,
    cameraFreePositionZ: 6.6,
    cameraFreeYaw: 0,
    cameraFreePitch: 0,
    cameraFreeRoll: 0,
    cameraFreeFov: typeof BASE_FOV === 'number' ? BASE_FOV : 45,
    visualRotationSaved: true,
    visualRotationX: visualRotX,
    visualRotationY: visualRotY
  };
  if (typeof freeCamera !== 'undefined' && freeCamera) {
    if (freeCamera.position) {
      out.cameraFreePositionX = Number(freeCamera.position.x) || 0;
      out.cameraFreePositionY = Number(freeCamera.position.y) || 0;
      out.cameraFreePositionZ = Number(freeCamera.position.z) || 6.6;
    }
    out.cameraFreeYaw = Number(freeCamera.yaw) || 0;
    out.cameraFreePitch = Number(freeCamera.pitch) || 0;
    out.cameraFreeRoll = Number(freeCamera.roll) || 0;
    out.cameraFreeFov = Number(freeCamera.fov) || out.cameraFreeFov;
  }
  return out;
}
function applyVisualRotationArchiveState(data) {
  if (!data || data.visualRotationSaved !== true) return false;
  var rx = Number(data.visualRotationX) || 0;
  var ry = Number(data.visualRotationY) || 0;
  if (typeof gestureRotation !== 'undefined' && gestureRotation) {
    gestureRotation.x = rx;
    gestureRotation.y = ry;
  }
  if (typeof particleSpin !== 'undefined' && particleSpin) {
    particleSpin.vx = 0;
    particleSpin.vy = 0;
  }
  if (typeof particles !== 'undefined' && particles && particles.rotation) particles.rotation.set(rx, ry, 0);
  if (typeof bloomParticles !== 'undefined' && bloomParticles && bloomParticles.rotation) bloomParticles.rotation.set(rx, ry, 0);
  if (typeof floatGroup !== 'undefined' && floatGroup && floatGroup.rotation) floatGroup.rotation.set(rx, ry, 0);
  if (typeof backCoverGroup !== 'undefined' && backCoverGroup && backCoverGroup.rotation) backCoverGroup.rotation.set(rx, ry, 0);
  if (typeof orbit !== 'undefined' && orbit && (Math.abs(rx) > 0.0001 || Math.abs(ry) > 0.0001)) {
    orbit.centerLocked = false;
    orbit.recentering = false;
  }
  return true;
}
function applyCameraArchiveState(data) {
  if (!data || data.cameraViewSaved !== true) return false;
  if (typeof freeCamera !== 'undefined' && freeCamera) {
    freeCamera.active = false;
    freeCamera.resetTween = null;
    freeCamera.keys = {};
    if (freeCamera.velocity) freeCamera.velocity.set(0, 0, 0);
    if (typeof releaseFreeCameraPointerLock === 'function') releaseFreeCameraPointerLock();
  }
  if (data.cameraViewMode === 'free' && typeof freeCamera !== 'undefined' && freeCamera) {
    if (!freeCamera.position) freeCamera.position = new THREE.Vector3();
    freeCamera.position.set(data.cameraFreePositionX, data.cameraFreePositionY, data.cameraFreePositionZ);
    freeCamera.yaw = data.cameraFreeYaw;
    freeCamera.pitch = data.cameraFreePitch;
    freeCamera.roll = data.cameraFreeRoll;
    freeCamera.fov = data.cameraFreeFov;
    freeCamera.locked = true;
    if (typeof saveFreeCameraState === 'function') saveFreeCameraState();
    if (typeof updateFreeCameraHint === 'function') updateFreeCameraHint();
    return true;
  }
  if (typeof freeCamera !== 'undefined' && freeCamera) {
    freeCamera.locked = false;
    if (typeof saveFreeCameraState === 'function') saveFreeCameraState();
    if (typeof updateFreeCameraHint === 'function') updateFreeCameraHint();
  }
  if (typeof orbit !== 'undefined' && orbit) {
    orbit.userTheta = data.cameraOrbitTheta;
    orbit.userPhi = clampRange(data.cameraOrbitPhi, orbit.minPhi, orbit.maxPhi);
    orbit.userRadius = clampRange(data.cameraOrbitRadius, orbit.minRadius, orbit.maxRadius);
    orbit.baselineTheta = orbit.userTheta;
    orbit.baselinePhi = orbit.userPhi;
    orbit.baselineRadius = orbit.userRadius;
    orbit.theta = orbit.userTheta;
    orbit.phi = orbit.userPhi;
    orbit.radius = orbit.userRadius;
    orbit.centerLocked = true;
    orbit.recentering = false;
    if (orbit.lookAt) orbit.lookAt.set(0, 0, 0);
    if (orbit.focus) {
      orbit.focus.active = false;
      orbit.focus.type = null;
    }
    if (typeof clearCenteredViewOffsets === 'function') clearCenteredViewOffsets();
    if (typeof requestStageLyricCameraSnap === 'function') requestStageLyricCameraSnap(12);
    return true;
  }
  return false;
}
function captureFxArchiveSnapshot() {
  return normalizeFxArchiveSnapshot(Object.assign({ visualPresetSchema: VISUAL_PRESET_SCHEMA }, fx, captureCameraArchiveState()));
}
function applySavedLyricPaletteState() {
  if (!stageLyrics) return;
  setStageLyricPalette(fx.lyricColorMode === 'custom'
    ? lyricPaletteFromHex(fx.lyricColor)
    : (stageLyrics.coverPalette || stageLyrics.palette));
  updateLyricColorControls();
  updateLyricHighlightControls();
  updateLyricGlowControls();
}
function applyFxArchiveSnapshot(snapshot) {
  var data = normalizeFxArchiveSnapshot(snapshot);
  if (!data) return false;
  var targetPreset = data.preset;
  Object.keys(data).forEach(function (key) {
    if (key === 'visualPresetSchema' || key === 'preset') return;
    if (isCameraArchiveKey(key)) return;
    fx[key] = data[key];
  });
  if (fx.backgroundAlbumCover === true) {
    fx.backgroundMedia = null;
    fx.backgroundImage = '';
  }
  normalizeDevelopmentLockedFxState();
  setPreset(targetPreset, { silent: true, preserveCamera: false, skipTransition: false, noSave: true, commitPlaybackPreset: true });
  applyCameraArchiveState(data);
  applyVisualRotationArchiveState(data);
  applyCoverParticleResolution(fx.coverResolution, { reload: true });
  if (fx.floatLayer) createFloatLayer(); else destroyFloatLayer();
  setParticleLyricsSilently(fx.particleLyrics);
  if (fx.backCover) createBackCoverLayer(); else destroyBackCoverLayer();
  if (fx.aiDepth) {
    aiDepthFailUntil = 0;
    queueAIDepthForCurrentCover(true);
  }
  setShelfMode(fx.shelf);
  if (fx.shelf === 'side') setShelfPinnedOpen(!!fx.shelfPinnedOpen, true, false);
  if (shelfManager && shelfManager.rebuild) shelfManager.rebuild(true);
  if (shelfManager && shelfManager.refreshTheme) shelfManager.refreshTheme();
  setCamMode(fx.cam);
  updateFxInputs();
  applySavedLyricPaletteState();
  refreshCurrentLyricStyle();
  applyDesktopLyricsState(true);
  applyWallpaperModeState(true);
  updateRenderPowerClasses();
  applyRendererPowerMode();
  saveLyricLayout({ user: true, reason: 'archiveApply' });
  return true;
}
var hadStoredUserFxArchives = hasStoredUserFxArchives();
var userFxArchives = readUserFxArchives();
if (!hadStoredUserFxArchives) {
  userFxArchives = [createPackagedDefaultUserFxArchiveSlot()];
  saveUserFxArchives();
}
var userFxArchiveEditing = -1;
var userFxArchiveShareDraft = '';
function renderUserFxArchives() {
  var grid = document.getElementById('user-archive-grid');
  if (!grid) return;
  grid.innerHTML = userFxArchives.map(function (slot, index) {
    var hasSave = !!slot.snapshot;
    var editing = userFxArchiveEditing === index;
    var nameHtml = editing
      ? '<input class="user-archive-input" id="user-archive-input-' + index + '" type="text" maxlength="18" value="' + escHtml(slot.name) + '" onkeydown="handleUserFxArchiveRenameKey(event,' + index + ')">'
      : '<div class="user-archive-name" title="' + escHtml(slot.name) + '">' + escHtml(slot.name) + '</div>';
    var actionsHtml = editing
      ? '<button type="button" onclick="commitUserFxArchiveRename(' + index + ')">确定</button>' +
      '<button type="button" onclick="cancelUserFxArchiveRename()">取消</button>'
      : '<button type="button" onclick="applyUserFxArchive(' + index + ')"' + (hasSave ? '' : ' disabled') + '>应用</button>' +
      '<button type="button" onclick="saveUserFxArchive(' + index + ')">保存</button>' +
      '<button type="button" onclick="renameUserFxArchive(' + index + ')">命名</button>';
    return '<div class="user-archive-slot' + (hasSave ? ' has-save' : '') + '" data-slot="' + index + '">' +
      nameHtml +
      '<div class="user-archive-meta">' + formatUserArchiveTime(slot.savedAt) + '</div>' +
      '<div class="user-archive-actions">' +
      actionsHtml +
      '</div>' +
      '</div>';
  }).join('');
  if (userFxArchiveEditing >= 0) {
    setTimeout(function () {
      var input = document.getElementById('user-archive-input-' + userFxArchiveEditing);
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }
}
function saveUserFxArchive(index) {
  index = clampRange(Number(index) || 0, 0, Math.max(0, userFxArchives.length - 1));
  userFxArchives[index].snapshot = captureFxArchiveSnapshot();
  userFxArchives[index].savedAt = Date.now();
  userFxArchives[index].name = normalizeUserFxArchiveName(userFxArchives[index].name, index);
  saveUserFxArchives();
  renderUserFxArchives();
  showToast('已保存到 ' + userFxArchives[index].name);
}
function applyUserFxArchive(index) {
  index = clampRange(Number(index) || 0, 0, Math.max(0, userFxArchives.length - 1));
  var slot = userFxArchives[index];
  if (!slot || !slot.snapshot) {
    showToast('这个用户存档还是空的');
    return;
  }
  if (applyFxArchiveSnapshot(slot.snapshot)) {
    showToast('已应用 ' + slot.name);
  }
}
function renameUserFxArchive(index) {
  index = clampRange(Number(index) || 0, 0, Math.max(0, userFxArchives.length - 1));
  userFxArchiveEditing = index;
  renderUserFxArchives();
}
function commitUserFxArchiveRename(index) {
  index = clampRange(Number(index) || 0, 0, Math.max(0, userFxArchives.length - 1));
  var input = document.getElementById('user-archive-input-' + index);
  userFxArchives[index].name = normalizeUserFxArchiveName(input && input.value, index);
  userFxArchiveEditing = -1;
  saveUserFxArchives();
  renderUserFxArchives();
  showToast('已命名为 ' + userFxArchives[index].name);
}
function cancelUserFxArchiveRename() {
  userFxArchiveEditing = -1;
  renderUserFxArchives();
}
function handleUserFxArchiveRenameKey(e, index) {
  if (e.key === 'Enter') {
    e.preventDefault();
    commitUserFxArchiveRename(index);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancelUserFxArchiveRename();
  }
}

function defaultUserFxArchiveName(index) {
  return '用户存档 ' + (Number(index) + 1);
}
function normalizeUserFxArchiveName(name, index) {
  name = String(name || '').replace(/\s+/g, ' ').trim();
  if (!name) name = defaultUserFxArchiveName(index);
  return name.slice(0, 28);
}
function userFxArchiveAt(index) {
  index = Number(index);
  if (!isFinite(index)) return null;
  index = Math.floor(index);
  return index >= 0 && index < userFxArchives.length ? userFxArchives[index] : null;
}
function userFxShareChecksum(text) {
  text = String(text || '');
  var hash = 2166136261;
  for (var i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, '0');
}
function bytesToBase64Url(bytes) {
  var binary = '';
  for (var i = 0; i < bytes.length; i += 0x8000) {
    var chunk = bytes.subarray(i, Math.min(i + 0x8000, bytes.length));
    for (var j = 0; j < chunk.length; j++) binary += String.fromCharCode(chunk[j]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function base64UrlToBytes(text) {
  text = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
  while (text.length % 4) text += '=';
  var binary = atob(text);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function gzipUserFxShareText(text) {
  if (typeof CompressionStream !== 'function') return null;
  var stream = new Blob([String(text || '')]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzipUserFxShareText(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('NO_DECOMPRESSION_STREAM');
  var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}
function userFxShareBaselineSnapshot() {
  var raw = null;
  try {
    raw = typeof clonePackagedDefaultFxSnapshot === 'function'
      ? clonePackagedDefaultFxSnapshot()
      : Object.assign({ visualPresetSchema: VISUAL_PRESET_SCHEMA }, fxDefaults || {});
  } catch (e) {
    raw = Object.assign({ visualPresetSchema: VISUAL_PRESET_SCHEMA }, fxDefaults || {});
  }
  return normalizeFxArchiveSnapshot(raw) || {};
}
function userFxShareValueEqual(a, b) {
  if (typeof a === 'number' || typeof b === 'number') {
    var na = Number(a);
    var nb = Number(b);
    return isFinite(na) && isFinite(nb) && Math.abs(na - nb) < 0.000001;
  }
  return a === b;
}
function compactUserFxArchiveSnapshot(snapshot) {
  var data = normalizeFxArchiveSnapshot(snapshot);
  if (!data) return null;
  var full = USER_FX_SHARE_KEYS.map(function (key) { return data[key]; });
  var base = userFxShareBaselineSnapshot();
  var delta = [];
  USER_FX_SHARE_KEYS.forEach(function (key, index) {
    if (!userFxShareValueEqual(data[key], base[key])) delta.push(index, data[key]);
  });
  var compactDelta = [USER_FX_SHARE_COMPACT_DELTA, delta];
  var compactFull = [USER_FX_SHARE_COMPACT_FULL, full];
  return JSON.stringify(compactDelta).length <= JSON.stringify(compactFull).length ? compactDelta : compactFull;
}
function expandUserFxArchiveSnapshot(compact) {
  if (!Array.isArray(compact)) return null;
  var mode = typeof compact[0] === 'string' ? compact[0] : USER_FX_SHARE_COMPACT_FULL;
  var values = typeof compact[0] === 'string' ? compact[1] : compact;
  if (!Array.isArray(values)) return null;
  var raw = mode === USER_FX_SHARE_COMPACT_DELTA ? userFxShareBaselineSnapshot() : {};
  if (mode === USER_FX_SHARE_COMPACT_DELTA) {
    for (var i = 0; i < values.length - 1; i += 2) {
      var deltaIndex = Math.floor(Number(values[i]));
      if (deltaIndex >= 0 && deltaIndex < USER_FX_SHARE_KEYS.length) raw[USER_FX_SHARE_KEYS[deltaIndex]] = values[i + 1];
    }
  } else {
    USER_FX_SHARE_KEYS.forEach(function (key, index) {
      if (index < values.length) raw[key] = values[index];
    });
  }
  return normalizeFxArchiveSnapshot(raw);
}
async function encodeUserFxArchiveShareCode(slot) {
  if (!slot || !slot.snapshot) throw new Error('EMPTY_ARCHIVE');
  var compact = compactUserFxArchiveSnapshot(slot.snapshot);
  if (!compact) throw new Error('INVALID_ARCHIVE');
  var payload = [USER_FX_ARCHIVE_SCHEMA, compact];
  var json = JSON.stringify(payload);
  var rawBytes = new TextEncoder().encode(json);
  var body = USER_FX_SHARE_CODEC_JSON + bytesToBase64Url(rawBytes);
  try {
    var zipped = await gzipUserFxShareText(json);
    if (zipped) {
      var zippedBody = USER_FX_SHARE_CODEC_GZIP + bytesToBase64Url(zipped);
      if (zippedBody.length < body.length) body = zippedBody;
    }
  } catch (e) {
  }
  var version = String(USER_FX_SHARE_VERSION);
  return USER_FX_SHARE_PREFIX + ':' + version + '.' + body + '.' + userFxShareChecksum(version + '.' + body);
}
function extractUserFxShareCode(text) {
  text = String(text || '').trim();
  var direct = text.replace(/\s+/g, '');
  if (/^MR2:[0-9]+\.[A-Za-z][A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(direct)) return direct;
  var match = text.match(/MR2:[0-9]+\.[A-Za-z][A-Za-z0-9_-]+\.[A-Za-z0-9]+/);
  return match ? match[0] : '';
}
function looksLikeUserFxShareCode(text) {
  return !!extractUserFxShareCode(text);
}
async function decodeUserFxArchiveShareCode(text) {
  var code = extractUserFxShareCode(text);
  if (!code) throw new Error('INVALID_SHARE_CODE');
  var parts = code.slice((USER_FX_SHARE_PREFIX + ':').length).split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) throw new Error('INVALID_SHARE_CODE');
  var version = parts[0];
  var body = parts[1];
  var checksum = parts[2].toUpperCase();
  if (version !== String(USER_FX_SHARE_VERSION)) throw new Error('UNSUPPORTED_SHARE_VERSION');
  if (userFxShareChecksum(version + '.' + body) !== checksum) throw new Error('BAD_SHARE_CHECKSUM');
  var codec = body.charAt(0);
  var bytes = base64UrlToBytes(body.slice(1));
  var json = '';
  if (codec === USER_FX_SHARE_CODEC_GZIP) {
    json = await gunzipUserFxShareText(bytes);
  } else if (codec === USER_FX_SHARE_CODEC_JSON) {
    json = new TextDecoder().decode(bytes);
  } else {
    throw new Error('UNSUPPORTED_SHARE_CODEC');
  }
  var payload = JSON.parse(json);
  var archiveSchema = 0;
  var archiveName = '';
  var archiveSavedAt = Date.now();
  var compactSnapshot = null;
  if (Array.isArray(payload)) {
    archiveSchema = Number(payload[0]);
    if (Array.isArray(payload[1])) {
      compactSnapshot = payload[1];
    } else {
      archiveName = payload[1];
      compactSnapshot = payload[2];
    }
  } else if (payload && typeof payload === 'object') {
    archiveSchema = Number(payload.s);
    archiveName = payload.n;
    archiveSavedAt = Number(payload.a) || Date.now();
    compactSnapshot = payload.v;
  }
  if (!payload || archiveSchema !== USER_FX_ARCHIVE_SCHEMA) {
    throw new Error('INVALID_SHARE_PAYLOAD');
  }
  var snapshot = expandUserFxArchiveSnapshot(compactSnapshot);
  if (!snapshot) throw new Error('INVALID_SHARE_SNAPSHOT');
  return {
    name: normalizeUserFxArchiveName(archiveName || '短代码存档', userFxArchives.length),
    createdAt: Date.now(),
    savedAt: archiveSavedAt,
    snapshot: snapshot
  };
}
function addImportedUserFxArchiveSlot(slot, toastLabel) {
  if (!slot || !slot.snapshot) return false;
  userFxArchives.push(slot);
  saveUserFxArchives();
  renderUserFxArchives();
  showToast((toastLabel || '已导入 ') + slot.name);
  return true;
}
function getArchiveClipboardApi() {
  return typeof getDesktopWindowApi === 'function' ? getDesktopWindowApi() : null;
}
async function writeUserFxArchiveClipboard(text) {
  var api = getArchiveClipboardApi();
  if (api && typeof api.copyText === 'function') {
    var res = await Promise.resolve(api.copyText(text));
    if (!res || res.ok !== false) return true;
  }
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return true;
  }
  var area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', 'readonly');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(area);
  return ok;
}
async function readUserFxArchiveClipboard() {
  var api = getArchiveClipboardApi();
  if (api && typeof api.readText === 'function') {
    var res = await Promise.resolve(api.readText());
    if (res && res.ok !== false) return String(res.text || '');
  }
  if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
    return await navigator.clipboard.readText();
  }
  return '';
}
async function copyUserFxArchiveShareCode(index) {
  var slot = userFxArchiveAt(index);
  if (!slot || !slot.snapshot) {
    showToast('空白存档不能复制短码');
    return;
  }
  try {
    var code = await encodeUserFxArchiveShareCode(slot);
    var copied = await writeUserFxArchiveClipboard(code);
    if (copied) {
      showToast(code.length > 12000 ? '完整短码已复制，配置较长' : '用户存档短码已复制');
    } else {
      window.prompt('复制这段 MR2 短代码', code);
      showToast('已打开完整短码');
    }
  } catch (e) {
    showToast('短码生成失败');
  }
}
async function importUserFxArchiveShareCodeText(text) {
  try {
    var slot = await decodeUserFxArchiveShareCode(text);
    return addImportedUserFxArchiveSlot(slot, '已导入短码 ');
  } catch (e) {
    showToast(e && e.message === 'BAD_SHARE_CHECKSUM' ? '短码校验失败，未导入' : '短码无效，未导入');
    return false;
  }
}
function userFxArchiveShareInput() {
  return document.getElementById('user-archive-share-input');
}
function updateUserFxArchiveShareDraft(value) {
  userFxArchiveShareDraft = String(value || '');
}
function focusUserFxArchiveShareInput(selectAll) {
  var input = userFxArchiveShareInput();
  if (!input) return;
  input.focus();
  if (selectAll) input.select();
}
async function pasteUserFxArchiveShareCodeToBox() {
  var text = '';
  try {
    text = await readUserFxArchiveClipboard();
  } catch (e) {
    text = '';
  }
  text = String(text || '').trim();
  if (!text) {
    showToast('剪贴板里没有可粘贴的存档码');
    focusUserFxArchiveShareInput(false);
    return false;
  }
  userFxArchiveShareDraft = text;
  var input = userFxArchiveShareInput();
  if (input) {
    input.value = userFxArchiveShareDraft;
    input.focus();
  }
  showToast(looksLikeUserFxShareCode(text) ? '短码已粘到输入框' : '已粘到输入框，可尝试作为旧 JSON 导入');
  return true;
}
async function importUserFxArchiveShareCodeFromBox() {
  var input = userFxArchiveShareInput();
  var text = input ? input.value : userFxArchiveShareDraft;
  userFxArchiveShareDraft = String(text || '');
  if (!userFxArchiveShareDraft.trim()) {
    showToast('先把 MR2 短码粘到输入框');
    focusUserFxArchiveShareInput(false);
    return false;
  }
  var ok = await importUserFxArchiveText(userFxArchiveShareDraft, '短代码');
  if (ok) {
    userFxArchiveShareDraft = '';
    renderUserFxArchives();
  }
  return ok;
}
function clearUserFxArchiveShareCodeBox() {
  userFxArchiveShareDraft = '';
  var input = userFxArchiveShareInput();
  if (input) {
    input.value = '';
    input.focus();
  }
}
function handleUserFxArchiveShareInputKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    importUserFxArchiveShareCodeFromBox();
  }
}
async function importUserFxArchiveFromShareCodePrompt() {
  return pasteUserFxArchiveShareCodeToBox();
}
function renderUserFxArchives() {
  var grid = document.getElementById('user-archive-grid');
  if (!grid) return;
  var toolbar =
    '<div class="user-archive-toolbar">' +
    '<div class="user-archive-note">主入口使用 MR2 短代码复制/粘贴；旧 JSON 仍可拖拽或作为兼容备份导入。</div>' +
    '<div class="user-archive-tools">' +
    '<button class="fx-mini-btn ghost" type="button" onclick="createUserFxArchive()">新建</button>' +
    '<button class="fx-mini-btn ghost" type="button" onclick="importUserFxArchiveFromShareCodePrompt()">粘贴码</button>' +
    '<button class="fx-mini-btn ghost" type="button" onclick="importUserFxArchiveFromDialog()">导入 JSON</button>' +
    '</div>' +
    '</div>';
  var shareBox =
    '<div class="user-archive-share-panel">' +
    '<textarea id="user-archive-share-input" class="user-archive-share-input" spellcheck="false" placeholder="把 MR2 短代码粘到这里，也兼容旧 JSON 存档" oninput="updateUserFxArchiveShareDraft(this.value)" onkeydown="handleUserFxArchiveShareInputKey(event)">' + escHtml(userFxArchiveShareDraft) + '</textarea>' +
    '<div class="user-archive-share-actions">' +
    '<button type="button" onclick="pasteUserFxArchiveShareCodeToBox()">从剪贴板粘贴</button>' +
    '<button type="button" onclick="importUserFxArchiveShareCodeFromBox()">导入短码</button>' +
    '<button type="button" onclick="clearUserFxArchiveShareCodeBox()">清空</button>' +
    '</div>' +
    '</div>';
  var cards = userFxArchives.map(function (slot, index) {
    var hasSave = !!slot.snapshot;
    var editing = userFxArchiveEditing === index;
    var nameHtml = editing
      ? '<input class="user-archive-input" id="user-archive-input-' + index + '" type="text" maxlength="28" value="' + escHtml(slot.name) + '" onkeydown="handleUserFxArchiveRenameKey(event,' + index + ')">'
      : '<div class="user-archive-name" title="' + escHtml(slot.name) + '">' + escHtml(slot.name) + '</div>';
    var actionsHtml = editing
      ? '<button type="button" onclick="commitUserFxArchiveRename(' + index + ')">确定</button>' +
      '<button type="button" onclick="cancelUserFxArchiveRename()">取消</button>'
      : '<button type="button" onclick="applyUserFxArchive(' + index + ')"' + (hasSave ? '' : ' disabled') + '>应用</button>' +
      '<button type="button" onclick="saveUserFxArchive(' + index + ')">保存</button>' +
      '<button type="button" onclick="copyUserFxArchiveShareCode(' + index + ')"' + (hasSave ? '' : ' disabled') + '>复制码</button>' +
      '<button type="button" onclick="renameUserFxArchive(' + index + ')">命名</button>' +
      '<button type="button" onclick="exportUserFxArchive(' + index + ')"' + (hasSave ? '' : ' disabled') + '>文件</button>' +
      '<button type="button" onclick="removeUserFxArchive(' + index + ')">删除</button>';
    return '<div class="user-archive-slot' + (hasSave ? ' has-save' : '') + '" data-slot="' + index + '">' +
      nameHtml +
      '<div class="user-archive-meta">' + (hasSave ? formatUserArchiveTime(slot.savedAt) : '空白存档，点击保存写入当前视觉') + '</div>' +
      '<div class="user-archive-actions">' + actionsHtml + '</div>' +
      '</div>';
  }).join('');
  var addCard = '<button class="user-archive-slot is-new" type="button" onclick="createUserFxArchive()"><strong>＋ 新建空白存档</strong><span class="user-archive-meta">可继续创建，不限制 4 个</span></button>';
  grid.innerHTML = toolbar + shareBox + cards + addCard;
  bindUserFxArchiveDrop();
  if (userFxArchiveEditing >= 0) {
    setTimeout(function () {
      var input = document.getElementById('user-archive-input-' + userFxArchiveEditing);
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }
}
function createUserFxArchive() {
  var index = userFxArchives.length;
  userFxArchives.push({
    name: normalizeUserFxArchiveName('', index),
    createdAt: Date.now(),
    savedAt: 0,
    snapshot: null
  });
  userFxArchiveEditing = index;
  saveUserFxArchives();
  renderUserFxArchives();
  showToast('已新建空白用户存档');
}
function saveUserFxArchive(index) {
  var slot = userFxArchiveAt(index);
  if (!slot) return;
  slot.snapshot = captureFxArchiveSnapshot();
  slot.savedAt = Date.now();
  slot.createdAt = slot.createdAt || slot.savedAt;
  slot.name = normalizeUserFxArchiveName(slot.name, index);
  saveUserFxArchives();
  renderUserFxArchives();
  showToast('已保存到 ' + slot.name);
}
function applyUserFxArchive(index) {
  var slot = userFxArchiveAt(index);
  if (!slot || !slot.snapshot) {
    showToast('这个用户存档还是空白');
    return;
  }
  if (applyFxArchiveSnapshot(slot.snapshot)) showToast('已应用 ' + slot.name);
}
function renameUserFxArchive(index) {
  if (!userFxArchiveAt(index)) return;
  userFxArchiveEditing = Math.floor(Number(index) || 0);
  renderUserFxArchives();
}
function commitUserFxArchiveRename(index) {
  var slot = userFxArchiveAt(index);
  if (!slot) return;
  var input = document.getElementById('user-archive-input-' + index);
  slot.name = normalizeUserFxArchiveName(input && input.value, index);
  slot.createdAt = slot.createdAt || Date.now();
  userFxArchiveEditing = -1;
  saveUserFxArchives();
  renderUserFxArchives();
  showToast('已命名为 ' + slot.name);
}
function cancelUserFxArchiveRename() {
  userFxArchiveEditing = -1;
  renderUserFxArchives();
}
function removeUserFxArchive(index) {
  if (!userFxArchiveAt(index)) return;
  userFxArchives.splice(index, 1);
  userFxArchiveEditing = -1;
  saveUserFxArchives();
  renderUserFxArchives();
  showToast('已删除用户存档');
}
function userFxArchiveExportPayload(slot) {
  return {
    type: USER_FX_ARCHIVE_EXPORT_TYPE,
    schema: USER_FX_ARCHIVE_SCHEMA,
    exportedAt: Date.now(),
    name: slot.name,
    savedAt: slot.savedAt,
    snapshot: slot.snapshot
  };
}
function safeArchiveFileName(name) {
  return String(name || 'Mineradio 用户存档').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 48) + '.json';
}
function exportUserFxArchive(index) {
  var slot = userFxArchiveAt(index);
  if (!slot || !slot.snapshot) {
    showToast('空白存档不能导出');
    return;
  }
  var payload = userFxArchiveExportPayload(slot);
  var text = JSON.stringify(payload, null, 2);
  var api = getDesktopWindowApi && getDesktopWindowApi();
  if (api && typeof api.exportJsonFile === 'function') {
    api.exportJsonFile({ defaultName: safeArchiveFileName(slot.name), text: text }).then(function (res) {
      if (res && res.ok) showToast('用户存档已导出');
      else if (!res || !res.canceled) showToast('用户存档导出失败');
    }).catch(function () { showToast('用户存档导出失败'); });
    return;
  }
  var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = safeArchiveFileName(slot.name);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}
function normalizeImportedFxArchivePayload(payload, fileName) {
  if (!payload || typeof payload !== 'object') return null;
  var snapshot = payload.snapshot ? normalizeFxArchiveSnapshot(payload.snapshot) : normalizeFxArchiveSnapshot(payload);
  if (!snapshot) return null;
  var baseName = String(fileName || '').split(/[\\/]/).pop().replace(/\.json$/i, '');
  return {
    name: normalizeUserFxArchiveName(payload.name || baseName, userFxArchives.length),
    createdAt: Date.now(),
    savedAt: Number(payload.savedAt) || Date.now(),
    snapshot: snapshot
  };
}
async function importUserFxArchiveText(text, fileName) {
  if (looksLikeUserFxShareCode(text)) return importUserFxArchiveShareCodeText(text);
  var payload = null;
  try { payload = JSON.parse(String(text || '')); } catch (e) { }
  var slot = normalizeImportedFxArchivePayload(payload, fileName);
  if (!slot) {
    showToast('导入失败，文件不是有效的用户存档');
    return false;
  }
  return addImportedUserFxArchiveSlot(slot, '已导入 ');
}
function importUserFxArchiveFromDialog() {
  var api = getDesktopWindowApi && getDesktopWindowApi();
  if (api && typeof api.importJsonFile === 'function') {
    api.importJsonFile().then(function (res) {
      if (res && res.ok) importUserFxArchiveText(res.text, res.filePath || '用户存档.json');
      else if (!res || !res.canceled) showToast('导入失败');
    }).catch(function () { showToast('导入失败'); });
    return;
  }
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = function () {
    var file = input.files && input.files[0];
    if (file) readUserFxArchiveImportFile(file);
  };
  input.click();
}
function readUserFxArchiveImportFile(file) {
  if (!file || !/\.json$/i.test(file.name || '')) {
    showToast('请导入 JSON 用户存档');
    return;
  }
  var reader = new FileReader();
  reader.onload = function (e) { importUserFxArchiveText(e.target && e.target.result, file.name); };
  reader.onerror = function () { showToast('导入失败'); };
  reader.readAsText(file, 'utf-8');
}
function bindUserFxArchiveDrop() {
  var grid = document.getElementById('user-archive-grid');
  if (!grid || grid._archiveDropBound) return;
  grid._archiveDropBound = true;
  grid.addEventListener('dragover', function (e) {
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    grid.classList.add('dragover');
  });
  grid.addEventListener('dragleave', function (e) {
    if (!grid.contains(e.relatedTarget)) grid.classList.remove('dragover');
  });
  grid.addEventListener('drop', function (e) {
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    grid.classList.remove('dragover');
    Array.prototype.forEach.call(e.dataTransfer.files, readUserFxArchiveImportFile);
  });
}
