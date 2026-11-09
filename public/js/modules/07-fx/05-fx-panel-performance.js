var homeWaveTrackState = { bars: 0, smooth: [] };
function ensureHomeWaveTrackBars() {
  var el = document.getElementById('home-wave-track');
  if (!el) return;
  var count = 24;
  if (homeWaveTrackState.bars === count && el.children.length === count) return;
  homeWaveTrackState.bars = count;
  homeWaveTrackState.smooth = new Array(count).fill(0);
  el.innerHTML = new Array(count + 1).join('<span></span>');
}
function updateHomeAudioVisual(dt) {
  if (!emptyHomeActive) return;
  var wave = document.getElementById('home-wave-track');
  if (!wave) return;
  var nowMs = performance.now();
  if (homeWaveTrackState.lastAt && nowMs - homeWaveTrackState.lastAt < 80) return;
  homeWaveTrackState.lastAt = nowMs;
  ensureHomeWaveTrackBars();
  var bars = wave.children;
  var nowT = uniforms && uniforms.uTime ? uniforms.uTime.value : performance.now() / 1000;
  for (var i = 0; i < bars.length; i++) {
    var ratio = bars.length > 1 ? i / (bars.length - 1) : 0;
    var bin = 0;
    if (frequencyData && frequencyData.length) {
      bin = (frequencyData[Math.min(frequencyData.length - 1, Math.floor(Math.pow(ratio, 1.2) * (frequencyData.length - 1)))] || 0) / 255;
    } else {
      bin = 0.16 + Math.sin(nowT * 1.4 + i * 0.34) * 0.06;
    }
    var target = clampRange(Math.max(bin, smoothBass * 0.35 + smoothMid * 0.18 + beatPulse * 0.24), 0.03, 1);
    var prev = homeWaveTrackState.smooth[i] || 0;
    prev += (target - prev) * (target > prev ? 0.34 : 0.12);
    homeWaveTrackState.smooth[i] = prev;
    bars[i].style.height = Math.max(4, prev * 18) + 'px';
    bars[i].style.opacity = String(clampRange(0.36 + prev * 0.68, 0.32, 1));
  }
}
function setRange(id, value) {
  var el = document.getElementById(id);
  if (!el) return;
  if (id === 'fx-lyricglow') value = Math.min(0.85, Math.max(0, value));
  if (id === 'fx-lyricbgadapt') value = Math.min(1, Math.max(0, value));
  if (id === 'fx-coverres') value = normalizeCoverResolution(value);
  if (id === 'fx-glassaberration') value = normalizeControlGlassChromaticOffset(value);
  if (id === 'fx-lyriccustomlines') value = lyricCustomLineCountValue();
  if (id === 'fx-memory-interval' || id === 'fx-memory-threshold' || id === 'fx-bgcropx' || id === 'fx-bgcropy' || /^fx-sonic(?!we)/.test(id) || id === 'fx-sonicwegain') value = Math.round(Number(value) || 0);
  el.value = value;
  var out = el.parentElement.querySelector('output');
  if (out) out.textContent = id === 'fx-coverres'
    ? coverParticleCountLabel(value)
    : (id === 'fx-lyricweight' || id === 'fx-lyriccustomlines' || id === 'fx-glassaberration' || id === 'fx-playlistblur' || id === 'fx-bgcropx' || id === 'fx-bgcropy' || id === 'fx-lyrictiltx' || id === 'fx-lyrictilty' || id === 'fx-shelfangle' || id === 'fx-shelfdetailanglex' || id === 'fx-shelfdetailangley' || id === 'fx-memory-interval' || id === 'fx-memory-threshold' || /^fx-sonic(?!we)/.test(id) || id === 'fx-sonicwegain' ? String(Math.round(Number(value) || 0)) : Number(value).toFixed(id === 'fx-lyricspacing' ? 3 : 2));
}
function updateDevelopmentFxControls() {
  [
    ['desktopLyrics', 't-desktopLyrics', '全屏幕置顶歌词'],
    ['desktopLyricsClickThrough', 't-desktopLyricsClickThrough', '锁定后防误触；鼠标移到桌面歌词上按中键可锁定/解锁'],
    ['desktopLyricsCinema', 't-desktopLyricsCinema', '桌面歌词绑定鼓点电影震动，基础漂浮始终保留'],
    ['desktopLyricsHighlight', 't-desktopLyricsHighlight', '桌面歌词按播放进度高亮'],
    ['wallpaperMode', 't-wallpaperMode', '把完整 Mineradio 放到 Windows 桌面；右上控制器可显示、隐藏桌面图标；Esc 退出；重启默认关闭']
  ].forEach(function (item) {
    var runtimeUnavailable = item[0] === 'wallpaperMode'
      && typeof desktopWallpaperRuntimeState !== 'undefined'
      && desktopWallpaperRuntimeState.supported === false;
    var locked = isDevelopmentLockedFx(item[0]) || runtimeUnavailable;
    var el = document.getElementById(item[1]);
    if (!el) return;
    el.classList.toggle('dev-locked', locked);
    if (locked) {
      el.classList.remove('on');
      el.setAttribute('aria-disabled', 'true');
      el.title = runtimeUnavailable ? '当前系统不支持桌面壁纸模式' : '开发中，暂不可用';
    } else {
      el.removeAttribute('aria-disabled');
      el.title = item[2];
    }
  });
  [
    ['desktopLyrics', 'fx-desktoplyricssize'],
    ['desktopLyrics', 'fx-desktoplyricsopacity'],
    ['desktopLyrics', 'fx-desktoplyricsy'],
    ['wallpaperMode', 'fx-wallpaperopacity']
  ].forEach(function (item) {
    var runtimeUnavailable = item[0] === 'wallpaperMode'
      && typeof desktopWallpaperRuntimeState !== 'undefined'
      && desktopWallpaperRuntimeState.supported === false;
    var locked = isDevelopmentLockedFx(item[0]) || runtimeUnavailable;
    var input = document.getElementById(item[1]);
    if (!input) return;
    input.disabled = locked;
    var row = input.closest && input.closest('.fx-slider');
    if (row) row.classList.toggle('dev-locked', locked);
  });
  var wallpaperFpsLocked = isDevelopmentLockedFx('wallpaperMode')
    || (typeof desktopWallpaperRuntimeState !== 'undefined' && desktopWallpaperRuntimeState.supported === false);
  document.querySelectorAll('#wallpaper-fps-seg [data-wallpaper-fps]').forEach(function (btn) {
    btn.disabled = wallpaperFpsLocked;
  });
}
function updateDesktopLyricsFpsControls() {
  var fps = normalizeDesktopLyricsFps(fx.desktopLyricsFps);
  document.querySelectorAll('#desktop-lyrics-fps-seg [data-desktop-lyrics-fps]').forEach(function (btn) {
    btn.classList.toggle('active', normalizeDesktopLyricsFps(btn.getAttribute('data-desktop-lyrics-fps')) === fps);
  });
}
function updateWallpaperFpsControls() {
  fx.wallpaperFps = normalizeWallpaperFps(fx.wallpaperFps);
  document.querySelectorAll('#wallpaper-fps-seg [data-wallpaper-fps]').forEach(function (btn) {
    var active = normalizeWallpaperFps(btn.getAttribute('data-wallpaper-fps')) === fx.wallpaperFps;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}
function updateLyricTextureClarityControls() {
  fx.lyricTextureClarity = normalizeLyricTextureClarity(fx.lyricTextureClarity);
  document.querySelectorAll('#lyric-texture-quality-seg [data-lyric-texture-clarity]').forEach(function (btn) {
    var active = normalizeLyricTextureClarity(btn.getAttribute('data-lyric-texture-clarity')) === fx.lyricTextureClarity;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}
function lyricTextureClarityLabel(value) {
  var tier = normalizeLyricTextureClarity(value);
  return tier === 4 ? '4× 极致' : (tier === 3 ? '3× 超清' : (tier === 2 ? '2× 高清' : '1× 标清'));
}
function setLyricTextureClarity(value, silent) {
  var next = normalizeLyricTextureClarity(value);
  var changed = next !== normalizeLyricTextureClarity(fx.lyricTextureClarity);
  fx.lyricTextureClarity = next;
  updateLyricTextureClarityControls();
  if (!changed) return;
  if (typeof invalidateLyricQualityTextures === 'function') invalidateLyricQualityTextures('texture-clarity-change', { release: next <= 1 });
  saveLyricLayout({ user: true, reason: 'lyricTextureClarity' });
  if (!silent) showToast('歌词清晰度: ' + lyricTextureClarityLabel(next));
}
function updatePerformanceControls() {
  fx.performanceBackground = normalizePerformanceBackgroundMode(fx.performanceBackground, fx.liveBackgroundKeep === true);
  fx.liveBackgroundKeep = fx.performanceBackground === 'keep';
  fx.performanceQuality = normalizePerformanceQuality(fx.performanceQuality);
  fx.foregroundFpsMode = normalizeForegroundFpsMode(fx.foregroundFpsMode);
  document.querySelectorAll('#performance-background-seg [data-performance-background]').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-performance-background') === fx.performanceBackground);
  });
  document.querySelectorAll('#performance-quality-seg [data-performance-quality]').forEach(function (btn) {
    var active = btn.getAttribute('data-performance-quality') === fx.performanceQuality;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  document.querySelectorAll('#foreground-fps-seg [data-foreground-fps]').forEach(function (btn) {
    var active = normalizeForegroundFpsMode(btn.getAttribute('data-foreground-fps')) === fx.foregroundFpsMode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  var liveBackgroundKeepToggle = document.getElementById('t-liveBackgroundKeep');
  if (liveBackgroundKeepToggle) liveBackgroundKeepToggle.classList.toggle('on', fx.liveBackgroundKeep === true);
}
var SONIC_ORIGINAL_FX_CONTROL_IDS = [
  'fx-sonic-ground-section', 'fx-sonicamp', 'fx-sonicspeed', 'fx-sonicdensity', 'fx-sonicrange', 'fx-soniclower', 'fx-sonicdepth', 'fx-sonicautorotate',
  'fx-sonic-audio-section', 'sonic-audio-toggle-grid', 'sonic-audio-monitor', 'fx-sonicaudiosensitivity', 'fx-sonicaudiobandstart', 'fx-sonicaudiobandend', 'fx-sonicaudiothreshold', 'fx-sonicaudiopulse',
  'fx-sonicsubbass', 'fx-sonicbass', 'fx-soniclowmid', 'fx-sonicmid', 'fx-sonichighmid', 'fx-sonicpresence', 'fx-sonicbrilliance', 'fx-sonicair',
  'fx-sonic-color-section', 'sonic-ground-base-row', 'sonic-ground-cool-row', 'sonic-ground-warm-row', 'sonic-ground-accent-row', 'fx-sonicglow',
  'fx-sonic-floating-section', 'sonic-floating-toggle-grid', 'fx-sonicfloatcount', 'fx-sonicfloatintensity', 'fx-sonicfloatmin', 'fx-sonicfloatmax', 'fx-sonicfloatspeed'
];
var SONIC_WORKSHOP_FX_CONTROL_IDS = [
  'fx-sonic-workshop-section', 'fx-sonicwegain', 'fx-sonicweaudio', 'fx-sonicwerange', 'fx-sonicwepeak',
  'sonic-workshop-color-row', 'sonic-workshop-base-row', 'sonic-workshop-warm-row', 'sonic-workshop-cool-row',
  'sonic-workshop-ripple-row', 'sonic-workshop-peak-row', 'sonic-workshop-theme-seg'
];
function fxPanelControlBlockById(id) {
  var el = document.getElementById(id);
  if (!el) return null;
  if (el.classList && (el.classList.contains('fx-section-label') || el.classList.contains('fx-slider') || el.classList.contains('fx-toggle-grid') || el.classList.contains('sonic-audio-monitor') || el.classList.contains('lyric-color-row') || el.classList.contains('fx-seg'))) return el;
  return el.closest ? el.closest('.fx-slider,.fx-toggle-grid,.sonic-audio-monitor,.lyric-color-row,.fx-seg,.fx-section-label') : null;
}
function setFxPanelControlsHidden(ids, hidden) {
  ids.forEach(function (id) {
    var node = fxPanelControlBlockById(id);
    if (node) node.classList.toggle('fx-sonic-hidden', !!hidden);
  });
}
function updateSonicSeriesControlVisibility() {
  var preset = Number(fx && fx.preset) || 0;
  var original = preset === 7;
  var workshop = preset === 8;
  setFxPanelControlsHidden(SONIC_ORIGINAL_FX_CONTROL_IDS, !original);
  setFxPanelControlsHidden(SONIC_WORKSHOP_FX_CONTROL_IDS, !workshop);
  setFxPanelControlsHidden(['fx-lyricbgadapt-row', 'fx-lyricbgadapt'], false);
}
function setPerformanceBackgroundMode(mode, silent) {
  var next = normalizePerformanceBackgroundMode(mode, false);
  fx.performanceBackground = next;
  fx.liveBackgroundKeep = next === 'keep';
  updatePerformanceControls();
  saveLyricLayout({ user: true, reason: 'performanceBackground' });
  updateRenderPowerClasses();
  applyRendererPowerMode();
  if (next === 'keep') recoverVisualsAfterBackground('performance-background-keep');
  else if (next === 'release' && isDeepBackgroundMode()) trimRuntimeCaches('performance-release', true);
  if (!silent) {
    showToast(next === 'keep' ? '后台策略: 保持运行' : (next === 'release' ? '后台策略: 停止并释放' : '后台策略: 自动优化'));
  }
}
function setPerformanceQualityMode(mode, silent) {
  var next = normalizePerformanceQuality(mode);
  fx.performanceQuality = next;
  updatePerformanceControls();
  applyRendererPowerMode();
  saveLyricLayout({ user: true, reason: 'performanceQuality' });
  if (!silent) {
    var label = next === 'eco' ? '低' : (next === 'balanced' ? '中' : (next === 'ultra' ? '超高' : '高'));
    showToast('画质档位: ' + label);
  }
}
function setForegroundFpsMode(mode, silent) {
  var next = normalizeForegroundFpsMode(mode);
  fx.foregroundFpsMode = next;
  updatePerformanceControls();
  saveLyricLayout({ user: true, reason: 'foregroundFpsMode' });
  if (typeof wakeMainLoopFromBackground === 'function') wakeMainLoopFromBackground();
  if (typeof syncWallpaperEngineCaptureFrameRate === 'function') {
    Promise.resolve(syncWallpaperEngineCaptureFrameRate()).catch(function () { });
  }
  if (!silent) showToast(next === 'vsync' ? '前台帧率: 跟随屏幕垂直同步' : ('前台帧率上限: ' + next + ' FPS'));
}
function updateFxInputs() {
  normalizeDevelopmentLockedFxState();
  applyShelfCameraDefaultAngle(false);
  setRange('fx-intensity', fx.intensity);
  setRange('fx-cineshake', fx.cinemaShake);
  setRange('fx-depth', fx.depth);
  setRange('fx-coverres', fx.coverResolution);
  setRange('fx-lyricglow', fx.lyricGlowStrength);
  setRange('fx-lyricbgadapt', fx.lyricBackgroundAdapt);
  setRange('fx-sonicamp', fx.sonicGroundAmplitude);
  setRange('fx-sonicspeed', fx.sonicGroundMotionSpeed);
  setRange('fx-sonicdensity', fx.sonicGroundDensity);
  setRange('fx-sonicrange', fx.sonicGroundRange);
  setRange('fx-soniclower', fx.sonicGroundLower);
  setRange('fx-sonicdepth', fx.sonicGroundDepth);
  setRange('fx-sonicautorotate', fx.sonicGroundAutoRotate);
  setRange('fx-sonicaudiosensitivity', fx.sonicAudioSensitivity);
  setRange('fx-sonicaudiobandstart', fx.sonicAudioBandStart);
  setRange('fx-sonicaudiobandend', fx.sonicAudioBandEnd);
  setRange('fx-sonicaudiothreshold', fx.sonicAudioThreshold);
  setRange('fx-sonicaudiopulse', fx.sonicAudioPulseStrength);
  setRange('fx-sonicwegain', fx.sonicWorkshopInputGain);
  setRange('fx-sonicweaudio', fx.sonicWorkshopAudioIntensity);
  setRange('fx-sonicwerange', fx.sonicWorkshopResponseRange);
  setRange('fx-sonicwepeak', fx.sonicWorkshopPeakIntensity);
  setRange('fx-sonicsubbass', fx.sonicGroundSubBass);
  setRange('fx-sonicbass', fx.sonicGroundBass);
  setRange('fx-soniclowmid', fx.sonicGroundLowMid);
  setRange('fx-sonicmid', fx.sonicGroundMid);
  setRange('fx-sonichighmid', fx.sonicGroundHighMid);
  setRange('fx-sonicpresence', fx.sonicGroundPresence);
  setRange('fx-sonicbrilliance', fx.sonicGroundBrilliance);
  setRange('fx-sonicair', fx.sonicGroundAir);
  setRange('fx-sonicglow', fx.sonicGroundGlow);
  setRange('fx-sonicfloatcount', fx.sonicGroundFloatingCount);
  setRange('fx-sonicfloatintensity', fx.sonicGroundFloatingIntensity);
  setRange('fx-sonicfloatmin', fx.sonicGroundFloatingMinSize);
  setRange('fx-sonicfloatmax', fx.sonicGroundFloatingMaxSize);
  setRange('fx-sonicfloatspeed', fx.sonicGroundFloatingSpeed);
  setRange('fx-bgopacity', fx.backgroundOpacity == null ? 1 : fx.backgroundOpacity);
  setRange('fx-bgcropx', fx.backgroundMediaCropX == null ? fxDefaults.backgroundMediaCropX : fx.backgroundMediaCropX);
  setRange('fx-bgcropy', fx.backgroundMediaCropY == null ? fxDefaults.backgroundMediaCropY : fx.backgroundMediaCropY);
  setRange('fx-bgzoom', fx.backgroundMediaZoom == null ? fxDefaults.backgroundMediaZoom : fx.backgroundMediaZoom);
  setRange('fx-windowbgopacity', fx.windowBackgroundOpacity == null ? fxDefaults.windowBackgroundOpacity : fx.windowBackgroundOpacity);
  setRange('fx-bgglassopacity', fx.backgroundGlassOpacity == null ? fxDefaults.backgroundGlassOpacity : fx.backgroundGlassOpacity);
  setRange('fx-glassaberration', fx.controlGlassChromaticOffset);
  setRange('fx-playlistblur', fx.playlistPanelGlassBlur);
  setRange('fx-playlistdensity', fx.playlistPanelGlassDensity);
  setRange('fx-playlistopen', fx.playlistPanelOpenDuration);
  setRange('fx-playlistclose', fx.playlistPanelCloseDuration);
  setRange('fx-desktoplyricssize', fx.desktopLyricsSize);
  setRange('fx-desktoplyricsopacity', fx.desktopLyricsOpacity);
  setRange('fx-desktoplyricsy', fx.desktopLyricsY);
  setRange('fx-wallpaperopacity', fx.wallpaperOpacity);
  setRange('fx-shelfsize', fx.shelfSize);
  setRange('fx-shelfx', fx.shelfOffsetX);
  setRange('fx-shelfy', fx.shelfOffsetY);
  setRange('fx-shelfz', fx.shelfOffsetZ);
  setRange('fx-shelfangle', fx.shelfAngleY);
  setRange('fx-shelfopacity', fx.shelfOpacity);
  setRange('fx-shelfbgalpha', fx.shelfBgOpacity);
  setRange('fx-shelfdetailx', fx.shelfDetailOffsetX);
  setRange('fx-shelfdetaily', fx.shelfDetailOffsetY);
  setRange('fx-shelfdetailz', fx.shelfDetailOffsetZ);
  setRange('fx-shelfdetailscale', fx.shelfDetailScale);
  setRange('fx-shelfdetailanglex', fx.shelfDetailAngleX);
  setRange('fx-shelfdetailangley', fx.shelfDetailAngleY);
  setRange('fx-shelfdetailrowgap', fx.shelfDetailRowGap);
  setRange('fx-shelfdetailopen', fx.shelfDetailOpenDuration);
  setRange('fx-shelfdetailclose', fx.shelfDetailCloseDuration);
  setRange('fx-shelfdetailrowtime', fx.shelfDetailRowDuration);
  setRange('fx-shelfdetailintro', fx.shelfDetailIntroStrength);
  setRange('fx-shelfdetailparallax', fx.shelfDetailParallax);
  setRange('fx-shelfsummonopen', fx.shelfSummonOpenDuration);
  setRange('fx-shelfsummonclose', fx.shelfSummonCloseDuration);
  setRange('fx-shelfsummonslide', fx.shelfSummonSlide);
  setRange('fx-shelfsummonstagger', fx.shelfSummonStagger);
  setRange('fx-shelfsummonscale', fx.shelfSummonScale);
  setRange('fx-shelfsummonparallax', fx.shelfSummonParallax);
  setRange('fx-shelfcamenter', fx.shelfCameraEnterSpeed);
  setRange('fx-shelfcamexit', fx.shelfCameraExitSpeed);
  setRange('fx-lyricspacing', fx.lyricLetterSpacing);
  setRange('fx-lyriclineheight', fx.lyricLineHeight);
  setRange('fx-lyricweight', fx.lyricWeight);
  setRange('fx-lyriccustomlines', fx.lyricCustomLineCount);
  setRange('fx-lyricglitchintensity', fx.lyricGlitchIntensity);
  setRange('fx-lyricglitchslice', fx.lyricGlitchSlice);
  setRange('fx-lyricglitchchroma', fx.lyricGlitchChroma);
  setRange('fx-lyricglitchrate', fx.lyricGlitchRate);
  setRange('fx-lyricglitchjitter', fx.lyricGlitchJitter);
  setRange('fx-lyriccontextopacity', fx.lyricContextOpacity);
  setRange('fx-lyriccontextspread', fx.lyricContextSpread);
  setRange('fx-lyrictranslationgap', fx.lyricTranslationGap);
  setRange('fx-lyrictranslationscale', fx.lyricTranslationScale);
  setRange('fx-lyrictranslationopacity', fx.lyricTranslationOpacity);
  setRange('fx-lyricedgefade', fx.lyricEdgeFade);
  setRange('fx-lyricmotionsoftness', fx.lyricMotionSoftness);
  setRange('fx-lyricscale', fx.lyricScale);
  setRange('fx-lyricx', fx.lyricOffsetX);
  setRange('fx-lyricy', fx.lyricOffsetY);
  setRange('fx-lyricz', fx.lyricOffsetZ);
  setRange('fx-lyrictiltx', fx.lyricTiltX);
  setRange('fx-lyrictilty', fx.lyricTiltY);
  setRange('fx-point', fx.point);
  setRange('fx-speed', fx.speed);
  setRange('fx-twist', fx.twist);
  setRange('fx-color', fx.color);
  setRange('fx-bloom', fx.bloomStrength);
  setRange('fx-scatter', fx.scatter);
  setRange('fx-bgfade', fx.bgFade);
  updateLyricGlowControls();
  applyPlaylistPanelFxSettings();
  // 同步开关
  document.getElementById('t-float').classList.toggle('on', fx.floatLayer);
  var floatToggle = document.getElementById('t-float');
  if (floatToggle) floatToggle.classList.toggle('on', fx.floatLayer);
  document.getElementById('t-cinema').classList.toggle('on', fx.cinema);
  var lyricGlowToggle = document.getElementById('t-lyricGlow');
  if (lyricGlowToggle) lyricGlowToggle.classList.toggle('on', fx.lyricGlow);
  var lyricGlowBeatToggle = document.getElementById('t-lyricGlowBeat');
  if (lyricGlowBeatToggle) lyricGlowBeatToggle.classList.toggle('on', fx.lyricGlowBeat);
  var lyricGlowEnableBtn = document.getElementById('lyric-glow-enable-btn');
  if (lyricGlowEnableBtn) lyricGlowEnableBtn.classList.toggle('active', fx.lyricGlow);
  var lyricGlowBeatBtn = document.getElementById('lyric-glow-beat-btn');
  if (lyricGlowBeatBtn) lyricGlowBeatBtn.classList.toggle('active', fx.lyricGlowBeat);
  var lyricGlowParticlesToggle = document.getElementById('t-lyricGlowParticles');
  if (lyricGlowParticlesToggle) lyricGlowParticlesToggle.classList.toggle('on', fx.lyricGlowParticles);
  var backgroundStarRiverToggle = document.getElementById('t-backgroundStarRiver');
  if (backgroundStarRiverToggle) backgroundStarRiverToggle.classList.toggle('on', fx.backgroundStarRiver !== false);
  var lyricVerticalFloatToggle = document.getElementById('t-lyricVerticalFloat');
  if (lyricVerticalFloatToggle) lyricVerticalFloatToggle.classList.toggle('on', fx.lyricVerticalFloat !== false);
  var lyricLiveViewportFitToggle = document.getElementById('t-lyricLiveViewportFit');
  if (lyricLiveViewportFitToggle) lyricLiveViewportFitToggle.classList.toggle('on', fx.lyricLiveViewportFit !== false);
  var lyricContextHighQualityToggle = document.getElementById('t-lyricContextHighQuality');
  if (lyricContextHighQualityToggle) lyricContextHighQualityToggle.classList.toggle('on', fx.lyricContextHighQuality !== false);
  var lyricBackdropAdaptToggle = document.getElementById('t-lyricBackdropAdapt');
  if (lyricBackdropAdaptToggle) lyricBackdropAdaptToggle.classList.toggle('on', fx.lyricBackdropAdapt !== false);
  var coverBackdropAdaptToggle = document.getElementById('t-coverBackdropAdapt');
  if (coverBackdropAdaptToggle) coverBackdropAdaptToggle.classList.toggle('on', fx.coverBackdropAdapt !== false);
  var lyricPauseHoldToggle = document.getElementById('t-lyricPauseHold');
  if (lyricPauseHoldToggle) lyricPauseHoldToggle.classList.toggle('on', fx.lyricPauseHold !== false);
  var lyricCameraLockToggle = document.getElementById('t-lyricCameraLock');
  if (lyricCameraLockToggle) lyricCameraLockToggle.classList.toggle('on', fx.lyricCameraLock);
  document.getElementById('t-bloom').classList.toggle('on', fx.bloom);
  document.getElementById('t-edge').classList.toggle('on', fx.edge);
  var desktopLyricsToggle = document.getElementById('t-desktopLyrics');
  if (desktopLyricsToggle) desktopLyricsToggle.classList.toggle('on', fx.desktopLyrics);
  var desktopLyricsClickToggle = document.getElementById('t-desktopLyricsClickThrough');
  if (desktopLyricsClickToggle) desktopLyricsClickToggle.classList.toggle('on', fx.desktopLyricsClickThrough !== false);
  var desktopLyricsCinemaToggle = document.getElementById('t-desktopLyricsCinema');
  if (desktopLyricsCinemaToggle) desktopLyricsCinemaToggle.classList.toggle('on', fx.desktopLyricsCinema !== false);
  var desktopLyricsHighlightToggle = document.getElementById('t-desktopLyricsHighlight');
  if (desktopLyricsHighlightToggle) desktopLyricsHighlightToggle.classList.toggle('on', fx.desktopLyricsHighlight === true);
  updateDesktopLyricsFpsControls();
  updateWallpaperFpsControls();
  var wallpaperModeToggle = document.getElementById('t-wallpaperMode');
  if (wallpaperModeToggle) wallpaperModeToggle.classList.toggle('on', fx.wallpaperMode);
  var shelfPodcastsToggle = document.getElementById('t-shelfShowPodcasts');
  if (shelfPodcastsToggle) shelfPodcastsToggle.classList.toggle('on', fx.shelfShowPodcasts !== false);
  var shelfMergeToggle = document.getElementById('t-shelfMergeCollections');
  if (shelfMergeToggle) shelfMergeToggle.classList.toggle('on', fx.shelfMergeCollections === true);
  var liveBackgroundKeepToggle = document.getElementById('t-liveBackgroundKeep');
  if (liveBackgroundKeepToggle) liveBackgroundKeepToggle.classList.toggle('on', fx.liveBackgroundKeep === true);
  var sonicFloatingToggle = document.getElementById('t-sonicGroundFloatingEnabled');
  if (sonicFloatingToggle) sonicFloatingToggle.classList.toggle('on', fx.sonicGroundFloatingEnabled !== false);
  var sonicAudioToggle = document.getElementById('t-sonicAudioMonitorEnabled');
  if (sonicAudioToggle) sonicAudioToggle.classList.toggle('on', fx.sonicAudioMonitorEnabled !== false);
  var sonicAudioAutoToggle = document.getElementById('t-sonicAudioAutoTrack');
  if (sonicAudioAutoToggle) sonicAudioAutoToggle.classList.toggle('on', fx.sonicAudioAutoTrack !== false);
  if (typeof refreshSonicAudioMonitorUi === 'function') refreshSonicAudioMonitorUi();
  applyStartupAutoplayUi();
  updatePerformanceControls();
  if (typeof updateMemoryControls === 'function') updateMemoryControls();
  updateDevelopmentFxControls();
  var aiDepthToggle = document.getElementById('t-aidepth');
  if (aiDepthToggle) aiDepthToggle.classList.toggle('on', fx.aiDepth);
  // 三态
  document.querySelectorAll('#shelf-seg button').forEach(function (b) { b.classList.toggle('active', b.dataset.shelf === fx.shelf); });
  updateShelfControlUi();
  if (typeof syncGestureCameraUi === 'function') syncGestureCameraUi();
  else document.querySelectorAll('#cam-seg button').forEach(function (b) { b.classList.toggle('active', b.dataset.cam === fx.cam); });
  if (typeof applyGestureSettingsUi === 'function') applyGestureSettingsUi();
  refreshPresetGrid();
  updateLyricColorControls();
  updateLyricHighlightControls();
  updateLyricGlowControls();
  updateLyricDisplayModeControls();
  updateLyricTranslationModeControls();
  updateLyricMotionStyleControls();
  updateLyricFontControls();
  updateLyricTextureClarityControls();
  updateUiAccentControls();
  updateHomeAccentControls();
  updateIconAccentControls();
  updateCustomBackgroundControls();
  updateVisualTintControls();
  if (typeof updateSonicGroundColorControls === 'function') updateSonicGroundColorControls();
  if (typeof updateSonicWorkshopColorControls === 'function') updateSonicWorkshopColorControls();
  updateSonicSeriesControlVisibility();
  applyControlGlassChromaticOffset();
  syncFxUniforms();
}
function animateFxResetButton(btn) {
  if (!btn || !window.gsap) return;
  window.gsap.fromTo(btn, { rotate: -120, scale: 0.88 }, { rotate: 0, scale: 1, duration: 0.48, ease: 'expo.out', overwrite: true });
  window.gsap.fromTo(btn, { boxShadow: '0 0 0 0 rgba(244,210,138,.38)' }, { boxShadow: '0 0 0 8px rgba(244,210,138,0)', duration: 0.55, ease: 'sine.out', overwrite: true });
}
function isStageLyricRealtimeFxKey(key) {
  return key === 'lyricLetterSpacing'
    || key === 'lyricLineHeight'
    || key === 'lyricWeight'
    || key === 'lyricCustomLineCount'
    || key === 'lyricContextOpacity'
    || key === 'lyricContextSpread'
    || key === 'lyricTranslationGap'
    || key === 'lyricTranslationScale'
    || key === 'lyricTranslationOpacity'
    || key === 'lyricEdgeFade'
    || key === 'lyricMotionSoftness'
    || key === 'lyricBackgroundAdapt'
    || /^lyricGlitch/.test(key);
}
function isDesktopLyricRealtimeFxKey(key) {
  return isStageLyricRealtimeFxKey(key)
    || key === 'lyricScale'
    || key === 'lyricGlowStrength';
}
var lyricRealtimeRefreshTimer = null;
var lyricRealtimeLastRefreshAt = 0;
function flushStageLyricRealtimeRefresh() {
  if (lyricRealtimeRefreshTimer) {
    clearTimeout(lyricRealtimeRefreshTimer);
    lyricRealtimeRefreshTimer = null;
  }
  lyricRealtimeLastRefreshAt = window.performance && performance.now ? performance.now() : Date.now();
  refreshStageLyricDisplayMode();
}
function scheduleStageLyricRealtimeRefresh(deferred) {
  if (!deferred) {
    flushStageLyricRealtimeRefresh();
    return;
  }
  var now = window.performance && performance.now ? performance.now() : Date.now();
  var wait = Math.max(0, 120 - (now - lyricRealtimeLastRefreshAt));
  if (wait <= 0) {
    flushStageLyricRealtimeRefresh();
    return;
  }
  if (lyricRealtimeRefreshTimer) clearTimeout(lyricRealtimeRefreshTimer);
  lyricRealtimeRefreshTimer = setTimeout(flushStageLyricRealtimeRefresh, wait);
}
function syncLyricRealtimeFxChange(key, opts) {
  opts = opts || {};
  if (key === 'lyricCustomLineCount') updateLyricDisplayModeControls();
  if (key === 'lyricMotionSoftness' || /^lyricGlitch/.test(key)) updateLyricMotionStyleControls();
  if (isStageLyricRealtimeFxKey(key)) scheduleStageLyricRealtimeRefresh(!!opts.deferred);
  else if (key === 'lyricLetterSpacing' || key === 'lyricLineHeight' || key === 'lyricWeight') refreshCurrentLyricStyle();
  if (isDesktopLyricRealtimeFxKey(key)) pushDesktopLyricsState(true);
}
function resetFxSliderValue(id, key, btn) {
  if (!Object.prototype.hasOwnProperty.call(fxDefaults, key)) return;
  if (key === 'shelfAngleY') {
    fx.shelfAngleYManual = false;
    fx.shelfAngleY = shelfDefaultAngleForCameraMode(fx.shelfCameraMode);
  } else {
    fx[key] = fxDefaults[key];
  }
  setRange(id, fx[key]);
  if (key === 'coverResolution') applyCoverParticleResolution(fx[key], { reload: true });
  if (key === 'backgroundOpacity' || key === 'windowBackgroundOpacity' || key === 'backgroundGlassOpacity' || key === 'backgroundMediaCropX' || key === 'backgroundMediaCropY' || key === 'backgroundMediaZoom') updateCustomBackgroundControls();
  if (key === 'controlGlassChromaticOffset') applyControlGlassChromaticOffset();
  if (/^playlistPanel/.test(key)) applyPlaylistPanelFxSettings();
  syncFxUniforms();
  if (/^shelf/.test(key) && shelfManager && shelfManager.refreshTheme) shelfManager.refreshTheme();
  syncLyricRealtimeFxChange(key);
  saveLyricLayout({ syncDisk: key === 'controlGlassChromaticOffset', user: true, reason: 'reset:' + key });
  animateFxResetButton(btn);
  showToast('已恢复默认数值');
}
function ensureFxSliderResetButton(id, key) {
  var el = document.getElementById(id);
  if (!el || !el.parentElement || el.parentElement.querySelector('.fx-reset-one')) return;
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fx-reset-one';
  btn.title = '恢复当前滑条默认值';
  btn.setAttribute('aria-label', '恢复当前滑条默认值');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    resetFxSliderValue(id, key, btn);
  });
  el.parentElement.appendChild(btn);
}
var fxPanelTab = 'home';
var fxPanelTabScroll = {};
function setFxPanelTab(tab) {
  var allowed = { home: 1, interface: 1, lyrics: 1, motion: 1, shelf: 1, system: 1 };
  var panel = document.getElementById('fx-panel');
  var nextTab = allowed[tab] ? tab : 'home';
  var previousTab = fxPanelTab;
  if (panel && previousTab !== nextTab && panel.getAttribute('data-console-layout') === 'task-first-v2') {
    fxPanelTabScroll[previousTab] = panel.scrollTop;
  }
  fxPanelTab = nextTab;
  if (panel) panel.setAttribute('data-active-tab', fxPanelTab);
  document.querySelectorAll('#fx-panel-tabs [data-fx-tab]').forEach(function (btn) {
    var active = btn.getAttribute('data-fx-tab') === fxPanelTab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.setAttribute('tabindex', active ? '0' : '-1');
    if (active && previousTab !== fxPanelTab) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  document.querySelectorAll('#fx-panel .fx-tab-page').forEach(function (page) {
    var active = page.getAttribute('data-fx-page') === fxPanelTab;
    page.classList.toggle('active', active);
    page.setAttribute('aria-hidden', active ? 'false' : 'true');
  });
  if (panel && previousTab !== fxPanelTab && panel.getAttribute('data-console-layout') === 'task-first-v2') {
    requestAnimationFrame(function () {
      panel.scrollTop = Object.prototype.hasOwnProperty.call(fxPanelTabScroll, fxPanelTab) ? fxPanelTabScroll[fxPanelTab] : 0;
    });
  }
  repositionFxFloatingPanels();
}
function fxPanelInputId(node) {
  var input = node && node.querySelector ? node.querySelector('input[id]') : null;
  return input ? input.id : '';
}
function fxPanelTargetForNode(node, current) {
  if (!node) return current || 'presets';
  var id = node.id || '';
  var inputId = fxPanelInputId(node);
  if (id === 'preset-grid' || id === 'user-archive-grid') return 'presets';
  if (id === 'fx-lyric-fold') return 'lyrics';
  if (id === 'fx-overlay-fold' || id === 'fx-stage-fold') return 'motion';
  if (id === 'fx-advanced' || node.classList.contains('fx-actions')) return 'advanced';
  if (node.classList.contains('lyric-color-row') || node.classList.contains('cover-color-pop') || node.classList.contains('color-lab-pop') || node.classList.contains('cover-color-loupe')) return 'appearance';
  if (inputId === 'fx-bgopacity' || inputId === 'fx-bgcropx' || inputId === 'fx-bgcropy' || inputId === 'fx-bgzoom' || inputId === 'fx-windowbgopacity' || inputId === 'fx-bgglassopacity' || inputId === 'fx-glassaberration' || /^fx-playlist/.test(inputId)) return 'appearance';
  if (inputId === 'fx-lyricglow' || inputId === 'fx-lyricbgadapt') return 'lyrics';
  if (/^fx-sonic/.test(inputId)) return 'motion';
  if (/^fx-(intensity|depth|coverres|cineshake|shelf)/.test(inputId)) return 'motion';
  return current || 'presets';
}
function organizeFxPanel() {
  if (typeof organizeFxConsoleWorkspace === 'function') {
    organizeFxConsoleWorkspace();
    return;
  }
  var panel = document.getElementById('fx-panel');
  if (!panel) return;
  if (panel._fxPanelOrganized) {
    setFxPanelTab(fxPanelTab);
    return;
  }
  var head = panel.querySelector('.fx-head');
  var tabMeta = [
    ['presets', '\u9884\u8bbe'],
    ['appearance', '\u5916\u89c2'],
    ['lyrics', '\u6b4c\u8bcd'],
    ['motion', '\u52a8\u6001'],
    ['advanced', '\u9ad8\u7ea7']
  ];
  var tabs = document.createElement('div');
  tabs.className = 'fx-panel-tabs';
  tabs.id = 'fx-panel-tabs';
  tabMeta.forEach(function (meta) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-fx-tab', meta[0]);
    btn.textContent = meta[1];
    tabs.appendChild(btn);
  });
  if (head && head.nextSibling) panel.insertBefore(tabs, head.nextSibling);
  else panel.insertBefore(tabs, panel.firstChild);
  var pages = {};
  var insertAfter = tabs;
  tabMeta.forEach(function (meta) {
    var page = document.createElement('div');
    page.className = 'fx-tab-page';
    page.setAttribute('data-fx-page', meta[0]);
    insertAfter.parentNode.insertBefore(page, insertAfter.nextSibling);
    insertAfter = page;
    pages[meta[0]] = page;
  });
  var original = Array.prototype.slice.call(panel.children).filter(function (child) {
    return child !== head && child !== tabs && !child.classList.contains('fx-tab-page');
  });
  var current = 'presets';
  original.forEach(function (node, idx) {
    var target;
    if (node.classList.contains('fx-section-label')) {
      target = fxPanelTargetForNode(original[idx + 1], current);
      current = target;
    } else {
      target = fxPanelTargetForNode(node, current);
      current = target;
    }
    (pages[target] || pages.presets).appendChild(node);
  });
  ['fx-lyric-fold', 'fx-overlay-fold', 'fx-stage-fold', 'fx-advanced'].forEach(function (id) {
    var fold = document.getElementById(id);
    if (fold) fold.classList.add('open');
  });
  tabs.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-fx-tab]') : null;
    if (!btn) return;
    setFxPanelTab(btn.getAttribute('data-fx-tab'));
  });
  panel._fxPanelOrganized = true;
  setFxPanelTab(fxPanelTab);
}

function fxControlBlock(id) {
  var el = document.getElementById(id);
  if (!el) return null;
  return el.closest('.fx-slider,.lyric-color-row,.lyric-color-grid,.fx-seg,.preset-grid,.user-archive-grid,.fx-font-grid') || el;
}
function setFxSectionBefore(id, text) {
  var block = fxControlBlock(id);
  if (!block || !block.parentNode) return;
  var prev = block.previousElementSibling;
  if (!prev || !prev.classList || !prev.classList.contains('fx-section-label')) {
    prev = document.createElement('div');
    prev.className = 'fx-section-label';
    block.parentNode.insertBefore(prev, block);
  }
  prev.textContent = text;
}
function setFxSliderLabel(id, text) {
  var block = fxControlBlock(id);
  var label = block && block.querySelector ? block.querySelector('label') : null;
  if (label) label.textContent = text;
}
function setFxSectionBeforeNode(node, text) {
  if (!node || !node.parentNode) return;
  var prev = node.previousElementSibling;
  if (!prev || !prev.classList || !prev.classList.contains('fx-section-label')) {
    prev = document.createElement('div');
    prev.className = 'fx-section-label';
    node.parentNode.insertBefore(prev, node);
  }
  prev.textContent = text;
}
function moveToggleToGrid(toggleId, grid) {
  var node = document.getElementById(toggleId);
  if (!node || !grid || node.parentNode === grid) return;
  grid.appendChild(node);
}
function ensureFxRangeControl(anchorId, id, label, min, max, step) {
  var existing = document.getElementById(id);
  if (existing) {
    existing.min = String(min);
    existing.max = String(max);
    existing.step = String(step);
    return;
  }
  var anchor = fxControlBlock(anchorId);
  if (!anchor || !anchor.parentNode) return;
  var block = document.createElement('div');
  block.className = 'fx-slider';
  var lab = document.createElement('label');
  lab.textContent = label;
  var input = document.createElement('input');
  input.id = id;
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  var output = document.createElement('output');
  block.appendChild(lab);
  block.appendChild(input);
  block.appendChild(output);
  anchor.parentNode.insertBefore(block, anchor.nextSibling);
}
function ensureLyricPrimaryControls() {
  var body = document.querySelector('#fx-lyric-fold .fx-fold-body');
  if (!body) return;
  var grid = document.getElementById('fx-lyric-primary-controls');
  if (!grid) {
    var label = document.createElement('div');
    label.className = 'fx-section-label';
    label.id = 'fx-lyric-primary-label';
    label.textContent = '歌词开关';
    grid = document.createElement('div');
    grid.className = 'fx-toggle-grid lyric-primary-toggle-grid';
    grid.id = 'fx-lyric-primary-controls';
    body.insertBefore(grid, body.firstChild);
    body.insertBefore(label, grid);
  }
  [
    't-desktopLyrics',
    't-desktopLyricsClickThrough',
    't-desktopLyricsCinema',
    't-desktopLyricsHighlight',
    't-lyricCameraLock',
    't-lyricGlow',
    't-lyricGlowBeat',
    't-lyricGlowParticles',
    't-backgroundStarRiver',
    't-lyricVerticalFloat',
    't-lyricPauseHold'
  ].forEach(function (id) { moveToggleToGrid(id, grid); });
}
function applyBackgroundMediaHint() {
  var value = document.getElementById('bg-image-value');
  if (value && !value.dataset.mediaHint) {
    value.dataset.mediaHint = '1';
    value.title = '支持封面原图、图片 / 视频上传，已设置媒体可重复裁切';
  }
  if (value) value.title = '\u652f\u6301\u5c01\u9762\u539f\u56fe\u3001\u56fe\u7247 / \u89c6\u9891\u4e0a\u4f20\uff0c\u5df2\u8bbe\u7f6e\u5a92\u4f53\u53ef\u91cd\u590d\u88c1\u5207';
  var label = value && value.closest ? value.closest('.fx-color-row-label') : null;
  if (label && !document.getElementById('bg-media-hint')) {
    var hint = document.createElement('small');
    hint.id = 'bg-media-hint';
    hint.textContent = '\u5c01\u9762\u539f\u56fe / \u56fe\u7247 / \u89c6\u9891';
    label.appendChild(hint);
  }
}
function relabelFxPanelControls() {
  setFxSliderLabel('fx-windowbgopacity', '\u7a97\u53e3\u80cc\u666f\u900f\u660e');
  setFxSliderLabel('fx-bgglassopacity', '\u6bdb\u73bb\u7483\u900f\u660e');
  setFxSliderLabel('fx-bgcropx', '\u88c1\u5207\u5de6\u53f3');
  setFxSliderLabel('fx-bgcropy', '\u88c1\u5207\u4e0a\u4e0b');
  setFxSliderLabel('fx-bgzoom', '\u88c1\u5207\u7f29\u653e');
  var title = document.querySelector('#fx-panel .fx-title');
  if (title) title.textContent = '视觉控制台';
  ensureLyricPrimaryControls();
  ensureFxRangeControl('fx-lyrictranslationgap', 'fx-lyrictranslationscale', '译文字号', 0.46, 1.12, 0.01);
  ensureFxRangeControl('fx-lyrictranslationscale', 'fx-lyrictranslationopacity', '译文透明', 0.20, 1, 0.01);
  applyBackgroundMediaHint();
  var overlayGrid = document.getElementById('t-cinema');
  overlayGrid = overlayGrid && overlayGrid.closest('.fx-toggle-grid');
  setFxSectionBeforeNode(overlayGrid, '镜头与叠加');
  setFxSectionBefore('preset-grid', '预设与存档');
  setFxSectionBefore('user-archive-grid', '用户存档');
  setFxSectionBefore('ui-accent-picker', '界面与背景');
  setFxSectionBefore('fx-intensity', '画面基础');
  setFxSectionBefore('fx-lyricglow', '歌词溢光强度');
  setFxSectionBefore('lyric-color-grid', '文字颜色');
  setFxSectionBefore('lyric-highlight-picker', '跟唱高亮');
  setFxSectionBefore('lyric-glow-row', '歌词溢光颜色');
  setFxSectionBefore('lyric-source-seg', '歌词来源');
  setFxSectionBefore('lyric-display-mode-seg', '歌词行数');
  setFxSectionBefore('lyric-motion-style-seg', '歌词动画');
  setFxSectionBefore('lyric-font-grid', '字体与字距');
  setFxSectionBefore('fx-lyricscale', '位置与角度');
  setFxSectionBefore('fx-desktoplyricssize', '桌面歌词');
  setFxSectionBefore('desktop-lyrics-fps-seg', '桌面歌词帧率');
  setFxSectionBefore('wallpaper-fps-seg', '壁纸帧率');
  setFxSectionBefore('close-behavior-seg', '关闭窗口');
  setFxSectionBefore('t-startupAutoplay', '启动播放');
  setFxSectionBefore('fx-playlistblur', '左侧歌单栏');
  setFxSectionBefore('shelf-seg', '3D 歌单架');
  setFxSectionBefore('shelf-camera-seg', '歌单架镜头');
  setFxSectionBefore('shelf-presence-seg', '歌单架显示');
  setFxSectionBefore('shelf-accent-picker', '歌单架外观');
  setFxSectionBefore('fx-shelfsize', '歌单架参数');
  setFxSectionBefore('fx-shelfdetailx', '歌单详情页位置');
  setFxSectionBefore('fx-shelfdetailopen', '歌单详情页动画');
  setFxSectionBefore('fx-shelfsummonopen', '歌单架唤出动画');
  setFxSectionBefore('cam-seg', '摄像头交互');
  setFxSectionBefore('fx-point', '粒子高级参数');
  setFxSliderLabel('fx-intensity', '律动强度');
  setFxSliderLabel('fx-depth', '画面景深');
  setFxSliderLabel('fx-coverres', '封面清晰度');
  setFxSliderLabel('fx-cineshake', '电影镜头');
  setFxSliderLabel('fx-lyricglow', '溢光强度');
  setFxSliderLabel('fx-bgopacity', '背景透明度');
  setFxSliderLabel('fx-glassaberration', '玻璃色差');
  setFxSliderLabel('fx-playlistblur', '左栏雾面');
  setFxSliderLabel('fx-playlistdensity', '左栏遮挡');
  setFxSliderLabel('fx-playlistopen', '左栏唤出秒数');
  setFxSliderLabel('fx-playlistclose', '左栏收起秒数');
  setFxSliderLabel('fx-lyricspacing', '字间距');
  setFxSliderLabel('fx-lyriclineheight', '行距');
  setFxSliderLabel('fx-lyricweight', '字重');
  setFxSliderLabel('fx-lyriccustomlines', '显示行数');
  setFxSliderLabel('fx-lyricglitchintensity', '故障强度');
  setFxSliderLabel('fx-lyricglitchslice', '切片幅度');
  setFxSliderLabel('fx-lyricglitchchroma', '色散强度');
  setFxSliderLabel('fx-lyricglitchrate', '触发速度');
  setFxSliderLabel('fx-lyricglitchjitter', '抖动幅度');
  setFxSliderLabel('fx-lyriccontextopacity', '上下句清晰');
  setFxSliderLabel('fx-lyriccontextspread', '上下句间距');
  setFxSliderLabel('fx-lyrictranslationgap', '译文间距');
  setFxSliderLabel('fx-lyrictranslationscale', '译文字号');
  setFxSliderLabel('fx-lyrictranslationopacity', '译文透明');
  setFxSliderLabel('fx-lyricedgefade', '边缘渐隐');
  setFxSliderLabel('fx-lyricmotionsoftness', '动画柔顺');
  setFxSliderLabel('fx-lyricscale', '歌词大小');
  setFxSliderLabel('fx-lyricx', '左右位置');
  setFxSliderLabel('fx-lyricy', '上下位置');
  setFxSliderLabel('fx-lyricz', '前后景深');
  setFxSliderLabel('fx-lyrictiltx', '上下旋转');
  setFxSliderLabel('fx-lyrictilty', '左右旋转');
  setFxSliderLabel('fx-desktoplyricssize', '桌面歌词大小');
  setFxSliderLabel('fx-desktoplyricsopacity', '桌面歌词透明度');
  setFxSliderLabel('fx-desktoplyricsy', '桌面歌词高度');
  setFxSliderLabel('fx-wallpaperopacity', '壁纸透明度');
  setFxSliderLabel('fx-shelfsize', '歌单架大小');
  setFxSliderLabel('fx-shelfx', '左右位置');
  setFxSliderLabel('fx-shelfy', '上下位置');
  setFxSliderLabel('fx-shelfz', '前后景深');
  setFxSliderLabel('fx-shelfangle', '侧向角度');
  setFxSliderLabel('fx-shelfopacity', '整体透明度');
  setFxSliderLabel('fx-shelfbgalpha', '背景透明度');
  setFxSliderLabel('fx-shelfdetailx', '详情左右');
  setFxSliderLabel('fx-shelfdetaily', '详情上下');
  setFxSliderLabel('fx-shelfdetailz', '详情前后');
  setFxSliderLabel('fx-shelfdetailscale', '详情大小');
  setFxSliderLabel('fx-shelfdetailanglex', '详情俯仰');
  setFxSliderLabel('fx-shelfdetailangley', '详情侧旋');
  setFxSliderLabel('fx-shelfdetailrowgap', '详情行间距');
  setFxSliderLabel('fx-shelfdetailopen', '展开秒数');
  setFxSliderLabel('fx-shelfdetailclose', '关闭秒数');
  setFxSliderLabel('fx-shelfdetailrowtime', '行入场秒数');
  setFxSliderLabel('fx-shelfdetailintro', '展开位移');
  setFxSliderLabel('fx-shelfdetailparallax', '悬浮视差');
  setFxSliderLabel('fx-shelfsummonopen', '唤出秒数');
  setFxSliderLabel('fx-shelfsummonclose', '收起秒数');
  setFxSliderLabel('fx-shelfsummonslide', '唤出位移');
  setFxSliderLabel('fx-shelfsummonstagger', '卡片错层');
  setFxSliderLabel('fx-shelfsummonscale', '唤出缩放');
  setFxSliderLabel('fx-shelfsummonparallax', '唤出视差');
  setFxSliderLabel('fx-shelfcamenter', '镜头进入速度');
  setFxSliderLabel('fx-shelfcamexit', '镜头离开速度');
  setFxSliderLabel('fx-point', '粒子尺寸');
  setFxSliderLabel('fx-speed', '运动速度');
  setFxSliderLabel('fx-twist', '粒子扭曲');
  setFxSliderLabel('fx-color', '色彩张力');
  setFxSliderLabel('fx-bloom', '光晕强度');
  setFxSliderLabel('fx-scatter', '离散感');
  setFxSliderLabel('fx-bgfade', '背景压暗');
}
