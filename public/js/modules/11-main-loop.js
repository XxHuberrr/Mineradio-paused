// ============================================================
var prevTime = performance.now();
var renderPerfState = {
  mode: 'vsync',
  fps: 0,
  frames: 0,
  skipped: 0,
  longFrames: 0,
  targetFps: 0,
  displayHz: 60,
  adaptiveDivisor: 1,
  adaptiveKind: '',
  adaptivePressure: 0,
  adaptiveFrameCostMs: 0,
  adaptiveCadenceTick: 0,
  lastRenderAt: 0,
  lastSampleAt: performance.now()
};
window.__mineradioRenderPerf = renderPerfState;
if (window.__mineradioPerf && typeof window.__mineradioPerf.registerRenderState === 'function') {
  window.__mineradioPerf.registerRenderState(renderPerfState);
} else {
  window.__mineradioPerf = renderPerfState;
}
var splashWarmRenderLast = 0;
var fixedRenderCadenceState = {
  key: '',
  lastCheckAt: 0,
  phase: 0
};
function resetFixedRenderCadenceState() {
  fixedRenderCadenceState.key = '';
  fixedRenderCadenceState.lastCheckAt = 0;
  fixedRenderCadenceState.phase = 0;
}
function shouldSkipFixedRenderCadenceFrame(state, now, fps, displayHz, key) {
  if (!state) return false;
  now = Number(now);
  fps = Math.max(1, Number(fps) || 1);
  displayHz = Math.max(1, Number(displayHz) || 60);
  key = String(key || fps);
  if (!isFinite(now)) now = performance.now();
  var lastCheckAt = Number(state.lastCheckAt) || 0;
  var elapsedMs = Math.max(0, now - lastCheckAt);
  var stallResetMs = Math.max(50, (1000 / displayHz) * 4);
  if (state.key !== key || !lastCheckAt || now < lastCheckAt || elapsedMs > stallResetMs) {
    state.key = key;
    state.lastCheckAt = now;
    state.phase = 0;
    return false;
  }
  state.lastCheckAt = now;
  // Accumulate target-frame credit instead of anchoring the phase to the last
  // rendered rAF.  This avoids 45 -> 30 on 60 Hz and 60 -> 48 on 144 Hz.
  // At or above the display rate every VSync is already the strict upper cap;
  // this also absorbs the tiny 59.94/60 and 119.88/120 rAF timing mismatch.
  if (fps >= displayHz * 0.98) {
    state.phase = 0;
    return false;
  }
  state.phase = Math.max(0, Number(state.phase) || 0) + elapsedMs * fps / 1000;
  if (state.phase < 1) return true;
  state.phase = Math.max(0, state.phase - 1);
  return false;
}
function isMainSceneCoveredBySplash() {
  return document.body.classList.contains('splash-active') && !document.body.classList.contains('splash-revealing');
}
function currentRenderAdaptiveContext(now) {
  var tier = (typeof getRenderLoadTier === 'function') ? getRenderLoadTier() : 0;
  if (typeof isRenderInteractionActive === 'function' && isRenderInteractionActive(now)) {
    return { kind: 'interaction', tier: tier };
  }
  var activePlayback = !!(playing && audio && !audio.paused);
  return { kind: activePlayback ? 'playback' : 'idle', tier: tier };
}
function resolveAdaptiveRenderCadence(now, mode) {
  if (isDeepBackgroundMode()) return null;
  mode = mode || ((typeof normalizeForegroundFpsMode === 'function') ? normalizeForegroundFpsMode(fx && fx.foregroundFpsMode) : 'adaptive');
  if (mode !== 'adaptive' || RENDER_VISIBLE_VSYNC || typeof selectAdaptiveRenderCadence !== 'function') return null;
  var context = currentRenderAdaptiveContext(now);
  return selectAdaptiveRenderCadence(context.kind, context.tier);
}
function getAdaptiveRenderFps(now) {
  if (isDeepBackgroundMode()) return 1;
  var mode = (typeof normalizeForegroundFpsMode === 'function') ? normalizeForegroundFpsMode(fx && fx.foregroundFpsMode) : 'adaptive';
  var fixedFps = (typeof foregroundFixedFpsForMode === 'function') ? foregroundFixedFpsForMode(mode) : null;
  if (fixedFps !== null) return fixedFps;
  if (RENDER_VISIBLE_VSYNC) return 0;
  var cadence = resolveAdaptiveRenderCadence(now, mode);
  if (cadence) return cadence.fps;
  var context = currentRenderAdaptiveContext(now);
  var tier = context.tier;
  if (context.kind === 'interaction') {
    if (tier >= 2) return RENDER_INTERACTION_HUGE_FPS;
    if (tier >= 1) return RENDER_INTERACTION_LARGE_FPS;
    return RENDER_INTERACTION_FPS;
  }
  var activePlayback = context.kind === 'playback';
  if (!activePlayback) {
    if (tier >= 2) return RENDER_IDLE_HUGE_FPS;
    if (tier >= 1) return RENDER_IDLE_LARGE_FPS;
    return RENDER_IDLE_FPS;
  }
  if (tier >= 2) return RENDER_HUGE_FPS;
  if (tier >= 1) return RENDER_LARGE_FPS;
  return RENDER_ACTIVE_FPS;
}
function shouldSkipAdaptiveRenderFrame(now) {
  if (typeof sampleDisplayRefreshHz === 'function') sampleDisplayRefreshHz(now);
  var mode = (typeof normalizeForegroundFpsMode === 'function') ? normalizeForegroundFpsMode(fx && fx.foregroundFpsMode) : 'adaptive';
  var cadence = resolveAdaptiveRenderCadence(now, mode);
  var fps = cadence ? cadence.fps : getAdaptiveRenderFps(now);
  var displayHz = (typeof estimatedDisplayRefreshHz === 'function') ? estimatedDisplayRefreshHz() : 60;
  renderPerfState.displayHz = Math.round(displayHz * 10) / 10;
  renderPerfState.mode = cadence
    ? ('adaptive-' + cadence.fps + 'fps/' + cadence.divisor + 'x')
    : (fps ? (mode === 'adaptive' ? ('adaptive-' + fps + 'fps') : (fps + 'fps')) : 'vsync');
  renderPerfState.targetFps = fps;
  renderPerfState.foregroundFpsMode = mode;
  renderPerfState.interactionBoost = (typeof isRenderInteractionActive === 'function') ? isRenderInteractionActive(now) : false;
  if (cadence) {
    resetFixedRenderCadenceState();
    var prevDivisor = renderPerfState.adaptiveDivisor;
    var prevKind = renderPerfState.adaptiveKind;
    renderPerfState.adaptiveDivisor = cadence.divisor;
    renderPerfState.adaptiveKind = cadence.kind;
    renderPerfState.adaptivePressure = cadence.pressure;
    if (prevDivisor !== cadence.divisor || prevKind !== cadence.kind) renderPerfState.adaptiveCadenceTick = 0;
    renderPerfState.adaptiveCadenceTick += 1;
    if (cadence.divisor > 1 && (renderPerfState.adaptiveCadenceTick - 1) % cadence.divisor !== 0) {
      renderPerfState.skipped += 1;
      if (window.__mineradioPerf && window.__mineradioPerf.count) window.__mineradioPerf.count('frame.skipped');
      return true;
    }
    renderPerfState.lastRenderAt = now;
    return false;
  }
  renderPerfState.adaptiveDivisor = 0;
  renderPerfState.adaptiveKind = '';
  if (!fps) {
    resetFixedRenderCadenceState();
    renderPerfState.lastRenderAt = now;
    return false;
  }
  var fixedCadenceKey = mode + ':' + fps;
  if (shouldSkipFixedRenderCadenceFrame(fixedRenderCadenceState, now, fps, displayHz, fixedCadenceKey)) {
    renderPerfState.skipped += 1;
    if (window.__mineradioPerf && window.__mineradioPerf.count) window.__mineradioPerf.count('frame.skipped');
    return true;
  }
  renderPerfState.lastRenderAt = now;
  return false;
}
function sampleRenderPerf(now, dt) {
  renderPerfState.frames += 1;
  if (dt > 0.034) renderPerfState.longFrames += 1;
  if (now - renderPerfState.lastSampleAt >= 1000) {
    renderPerfState.fps = Math.round(renderPerfState.frames * 1000 / Math.max(1, now - renderPerfState.lastSampleAt));
    renderPerfState.frames = 0;
    renderPerfState.lastSampleAt = now;
  }
  maybeTrimRuntimeCaches(now);
}
var mainFrameGates = {
  audio: createFrameGate('main.audio', 60),
  shelf: createFrameGate('main.shelf', 30),
  lyricsParticles: createFrameGate('main.lyricsParticles', 45),
  stageLyrics: createFrameGate('main.stageLyrics', 45),
  skullParticles: createFrameGate('main.skullParticles', 45),
  homeAudio: createFrameGate('main.homeAudio', 15),
  desktopOverlay: createFrameGate('main.desktopOverlay', 12)
};
window.__mineradioMainFrameGates = mainFrameGates;
var mainLoopBackgroundTimer = 0;
var mainLoopAnimationRequested = false;
function mainLoopDeepBackgroundSleeping() {
  return typeof isDeepBackgroundMode === 'function'
    && isDeepBackgroundMode()
    && !(typeof isLiveBackgroundKeepMode === 'function' && isLiveBackgroundKeepMode());
}
function mainLoopBackgroundDelayMs() {
  if (!mainLoopDeepBackgroundSleeping()) return 0;
  if (fx && (fx.desktopLyrics || fx.wallpaperMode)) return 250;
  if (typeof isBackgroundReleaseMode === 'function' && isBackgroundReleaseMode()) return 1500;
  return 1000;
}
function requestMainLoopAnimationFrame() {
  if (mainLoopAnimationRequested) return;
  mainLoopAnimationRequested = true;
  requestAnimationFrame(animate);
}
function scheduleNextMainLoopFrame() {
  var delay = mainLoopBackgroundDelayMs();
  if (delay > 0) {
    if (mainLoopBackgroundTimer) return;
    mainLoopBackgroundTimer = setTimeout(function () {
      mainLoopBackgroundTimer = 0;
      requestMainLoopAnimationFrame();
    }, delay);
    return;
  }
  requestMainLoopAnimationFrame();
}
function wakeMainLoopFromBackground() {
  if (mainLoopBackgroundTimer) {
    clearTimeout(mainLoopBackgroundTimer);
    mainLoopBackgroundTimer = 0;
  }
  requestMainLoopAnimationFrame();
}
function tickDeepBackgroundFrame(now, dt) {
  sampleRenderPerf(now, dt);
  if (fx && (fx.desktopLyrics || fx.wallpaperMode) && typeof syncDesktopOverlayState === 'function') {
    syncDesktopOverlayState();
  }
}
document.addEventListener('visibilitychange', function () {
  if (!mainLoopDeepBackgroundSleeping()) wakeMainLoopFromBackground();
});
window.addEventListener('focus', wakeMainLoopFromBackground);
function mainLoopInteractionActive(now) {
  return (typeof isRenderInteractionActive === 'function') && isRenderInteractionActive(now);
}
function visibleMotionFollowVsync(now) {
  if (isDeepBackgroundMode()) return false;
  var mode = (typeof normalizeForegroundFpsMode === 'function')
    ? normalizeForegroundFpsMode(fx && fx.foregroundFpsMode)
    : 'vsync';
  if (mode !== 'vsync') return false;
  if (typeof isProgressDragPreviewActive === 'function' && isProgressDragPreviewActive()) return true;
  if (mainLoopInteractionActive(now)) return true;
  return !!(playing && audio && !audio.paused);
}
function capMainLoopFpsToDisplay(fps) {
  var hz = (typeof estimatedDisplayRefreshHz === 'function') ? estimatedDisplayRefreshHz() : 60;
  return Math.max(1, Math.min(Number(fps) || 60, Math.max(48, hz)));
}
function capMainLoopFpsForBudget(fps, minFps) {
  var scale = (typeof runtimePerfScale === 'function') ? runtimePerfScale() : 1;
  var target = Math.round((Number(fps) || 60) * scale);
  return Math.max(minFps || 1, capMainLoopFpsToDisplay(target));
}
function targetMainAudioFps(now) {
  if (isDeepBackgroundMode()) return 1;
  var scale = (typeof runtimeAudioAnalysisScale === 'function') ? runtimeAudioAnalysisScale() : 1;
  if (playing && audio && !audio.paused) {
    var base = mainLoopInteractionActive(now) ? 72 : 54;
    return capMainLoopFpsToDisplay(Math.max(30, Math.round(base * scale)));
  }
  return mainLoopInteractionActive(now) ? 30 : 24;
}
function targetMainShelfFps(now) {
  if (isDeepBackgroundMode()) return 1;
  if (!fx || fx.shelf === 'off') return 12;
  if (mainLoopInteractionActive(now)) return 0;
  if (shelfManager && shelfManager.hasOpenContent && shelfManager.hasOpenContent()) return 0;
  if (typeof shelfPreviewIsVisible === 'function' && shelfPreviewIsVisible()) return 0;
  if (shelfPinnedOpen || (typeof shelfAlwaysVisible === 'function' && shelfAlwaysVisible())) return 0;
  return capMainLoopFpsForBudget(mainLoopInteractionActive(now) ? 72 : 38, 18);
}
function targetMainLyricsParticleFps(now) {
  if (isDeepBackgroundMode()) return 1;
  if (!fx || fx.particleLyrics === false) return 12;
  if (visibleMotionFollowVsync(now)) return 0;
  if (mainLoopInteractionActive(now)) return capMainLoopFpsForBudget(120, 72);
  return (playing && audio && !audio.paused) ? capMainLoopFpsForBudget(60, 48) : 24;
}
function targetMainStageLyricsFps(now) {
  if (isDeepBackgroundMode()) return 1;
  if (!fx || fx.particleLyrics === false) return 12;
  if (visibleMotionFollowVsync(now)) return 0;
  if (mainLoopInteractionActive(now)) return capMainLoopFpsForBudget(120, 72);
  return (playing && audio && !audio.paused) ? capMainLoopFpsForBudget(60, 48) : 24;
}
function targetMainSkullParticleFps(now) {
  if (isDeepBackgroundMode()) return 1;
  if (!fx || fx.preset !== SKULL_PRESET_INDEX) return 10;
  if (visibleMotionFollowVsync(now)) return 0;
  if (mainLoopInteractionActive(now)) return capMainLoopFpsForBudget(120, 72);
  return (playing && audio && !audio.paused) ? capMainLoopFpsForBudget(60, 45) : 24;
}
function targetMainHomeAudioFps(now) {
  if (isDeepBackgroundMode()) return 1;
  if (!emptyHomeActive) return 6;
  return mainLoopInteractionActive(now) ? 30 : 15;
}
function targetMainDesktopOverlayFps(now) {
  if (isDeepBackgroundMode()) return 1;
  if (fx && (fx.desktopLyrics || fx.wallpaperMode)) {
    if (fx.desktopLyricsFps === 0 || mainLoopInteractionActive(now)) return 0;
    return Math.max(24, Math.min(120, Number(fx.desktopLyricsFps) || 60));
  }
  return 6;
}
function animate() {
  mainLoopAnimationRequested = false;
  scheduleNextMainLoopFrame();
  var perfProbe = window.__mineradioPerf;
  var framePerfStart = performance.now();
  var now = performance.now();
  if (mainLoopDeepBackgroundSleeping()) {
    var deepDt = Math.min((now - prevTime) / 1000, 0.25);
    prevTime = now;
    tickDeepBackgroundFrame(now, deepDt);
    return;
  }
  if (shouldSkipAdaptiveRenderFrame(now)) return;
  var dt = Math.min((now - prevTime) / 1000, 0.05);
  prevTime = now;
  sampleRenderPerf(now, dt);
  uniforms.uTime.value += dt;
  if (isMainSceneCoveredBySplash()) {
    var splashWorkshopActive = window.MineradioSonicWorkshop && MineradioSonicWorkshop.isActive(fx);
    if (window.MineradioSonicWorkshop) {
      MineradioSonicWorkshop.update(dt, {
        scene: scene,
        fx: fx,
        time: uniforms.uTime.value,
        audio: { bass: smoothBass, mid: smoothMid, treble: smoothTreb, beat: beatPulse, energy: smoothEnergy }
      });
    }
    if (splashWorkshopActive) {
      if (particles) particles.visible = false;
      if (bloomParticles) bloomParticles.visible = false;
      if (floatGroup) floatGroup.visible = false;
      if (backCoverGroup) backCoverGroup.visible = false;
    }
    if (now - splashWarmRenderLast > 520) {
      splashWarmRenderLast = now;
      var splashRenderPerfStart = performance.now();
      renderer.render(scene, camera);
      if (perfProbe && perfProbe.markSince) perfProbe.markSince('renderer.render.splash', splashRenderPerfStart);
    }
    var splashFrameCostMs = performance.now() - framePerfStart;
    if (typeof sampleAdaptiveFrameCost === 'function') {
      var splashFrameLoad = sampleAdaptiveFrameCost(splashFrameCostMs, renderPerfState.targetFps || renderPerfState.displayHz || 60);
      if (splashFrameLoad) {
        renderPerfState.adaptiveFrameCostMs = splashFrameLoad.avgMs;
        renderPerfState.adaptivePressure = splashFrameLoad.level;
      }
    }
    if (perfProbe && perfProbe.mark) perfProbe.mark('frame.total', splashFrameCostMs);
    return;
  }
  pointerParallax.x += (pointerTarget.x - pointerParallax.x) * 0.040;
  pointerParallax.y += (pointerTarget.y - pointerParallax.y) * 0.040;

  // 频谱分析 — v7.1: 真正分离 kick 和人声
  // bin = sampleRate / fftSize = 44100/2048 ≈ 21.5Hz
  // kick 60-150Hz → bin 3-7 (用前 5 个 bin)
  // vocal 200-3000Hz → bin 9-140 (尽量不计入 bass/mid 的"鼓点"判断)
  // 真正的 mid 乐器/和声: 3000-6000Hz → bin 140-280
  // treble: 6000Hz+ → bin 280+
  var audioPerfStart = performance.now();
  beatOnsetFlag = false;
  var audioStepDt = consumeFrameGate(mainFrameGates.audio, now, dt, targetMainAudioFps(now), false, 'audio-analysis');
  var sonicAudioFrame = fx && fx.sonicAudioMonitorEnabled !== false && typeof getSonicAudioMonitorSnapshot === 'function'
    ? getSonicAudioMonitorSnapshot().frame
    : null;
  if (audioStepDt > 0) {
  if (analyser && playing && audio && !audio.paused) {
    if (audioCtx && audioCtx.state === 'suspended') resumeAudioAnalysis();
    analyser.getByteFrequencyData(frequencyData);
    analyser.getByteTimeDomainData(timeDomainData);
    var len = frequencyData.length;
    // 精确频段
    var kickEnd = 7;                          // 60-150 Hz, 鼓 kick
    var vocalEnd = Math.min(len, 140);         // 200-3000 Hz, 人声主体
    var midEnd = Math.min(len, 280);         // 3-6 kHz, 中高乐器
    // 累积
    var bKick = 0, mInst = 0, tHigh = 0, voc = 0, rms = 0;
    var timeStride = (typeof runtimeAnalysisStride === 'function') ? runtimeAnalysisStride('time', timeDomainData.length) : 1;
    var rmsCount = 0;
    for (var j = 0; j < timeDomainData.length; j += timeStride) {
      var tv = (timeDomainData[j] - 128) / 128;
      rms += tv * tv;
      rmsCount++;
    }
    rms = Math.sqrt(rms / Math.max(1, rmsCount));
    var analysisSampleRate = (audioCtx && audioCtx.sampleRate) || 44100;
    var analysisFftSize = (analyser && analyser.fftSize) || len * 2;
    if (typeof beatBandRms === 'function') {
      var subKick = beatBandRms(frequencyData, analysisSampleRate, analysisFftSize, 38, 74);
      var kickCore = beatBandRms(frequencyData, analysisSampleRate, analysisFftSize, 52, 165);
      var kickBody = beatBandRms(frequencyData, analysisSampleRate, analysisFftSize, 165, 420);
      bKick = Math.min(1, kickCore * 0.86 + subKick * 0.42 + kickBody * 0.10);
      voc = beatBandRms(frequencyData, analysisSampleRate, analysisFftSize, 420, 2600);
      mInst = beatBandRms(frequencyData, analysisSampleRate, analysisFftSize, 2600, 6200);
      tHigh = beatBandRms(frequencyData, analysisSampleRate, analysisFftSize, 6200, Math.min(16000, analysisSampleRate / 2));
    }

    // 动态峰值跟踪
    bassPeak = Math.max(bassPeak * 0.994, bKick, 0.030);
    midPeak = Math.max(midPeak * 0.993, mInst, 0.026);
    treblePeak = Math.max(treblePeak * 0.992, tHigh, 0.018);
    energyPeak = Math.max(energyPeak * 0.995, rms, 0.030);

    var rb = Math.min(1, Math.pow(bKick / Math.max(0.038, bassPeak * 0.66), 0.78));
    var rm = Math.min(1, Math.pow(mInst / Math.max(0.025, midPeak * 0.70), 0.86));
    var rt = Math.min(1, Math.pow(tHigh / Math.max(0.020, treblePeak * 0.74), 0.92));
    var re = Math.min(1, Math.pow(rms / Math.max(0.034, energyPeak * 0.68), 0.82));

    var bassOnset = Math.max(0, rb - smoothBass);
    var energyOnset = Math.max(0, re - prevEnergy);
    prevEnergy = prevEnergy * 0.88 + re * 0.12;

    var realtimeBeat = processRealtimeBeatEngine(audioStepDt);
    if (realtimeBeat && realtimeBeat.hit) {
      var dj = djMode.active;
      var djMapCoversCurrentTime = !dj || !currentDjBeatMap || !currentDjBeatMap.partialUntilSec || !audio || (audio.currentTime || 0) <= currentDjBeatMap.partialUntilSec - 1.25;
      var djBeatMapReadyForCamera = dj && currentDjBeatMap && currentDjBeatMap.cameraBeats && currentDjBeatMap.cameraBeats.length >= 4 && djMapCoversCurrentTime;
      var beatMapReadyForCamera = dj ? djBeatMapReadyForCamera : (currentBeatMap && currentBeatMap.cameraBeats && currentBeatMap.cameraBeats.length >= 4);
      var waitingForBeatMap = dj ? !djBeatMapReadyForCamera : (!beatMapReadyForCamera && (!!beatMapBusy || !!beatAnalysisTimer || ((audio && audio.currentTime) || 0) < 18));
      var liveKickFrame = dj
        ? (realtimeBeat.low > 0.42 && rb > 0.32 && bassOnset > 0.040 && energyOnset > 0.006 && (realtimeBeat.lowDominance || 0) > 0.72)
        : (realtimeBeat.low > 0.42 && rb > 0.34 && bassOnset > 0.048 && energyOnset > 0.008);
      var liveStrongHit = dj
        ? (realtimeBeat.confidence > 0.52 && realtimeBeat.strength > 0.48 && realtimeBeat.score > 0.42 && liveKickFrame)
        : (realtimeBeat.confidence > 0.62 && realtimeBeat.strength > 0.54 && realtimeBeat.score > 0.44 && liveKickFrame);
      var liveTempoHit = dj
        ? (realtimeBeat.tempoAssist && realtimeBeat.confidence > 0.50 && realtimeBeat.strength > 0.46 && realtimeBeat.low > 0.40 && (liveKickFrame || bassOnset > 0.034))
        : (realtimeBeat.tempoAssist && realtimeBeat.confidence > 0.62 && realtimeBeat.strength > 0.50 && realtimeBeat.low > 0.40 && bassOnset > 0.036);
      var liveFallbackOk = dj
        ? (liveStrongHit || liveTempoHit)
        : (waitingForBeatMap
          ? (liveStrongHit || liveTempoHit)
          : (realtimeBeat.confidence > 0.68 && realtimeBeat.strength > 0.62 && realtimeBeat.low > 0.44 && (liveKickFrame || realtimeBeat.score > 0.52)));
      if (!beatMapReadyForCamera && liveFallbackOk) {
        scheduleBeatCamera({
          time: realtimeBeat.time,
          strength: realtimeBeat.strength,
          confidence: realtimeBeat.confidence,
          low: realtimeBeat.low,
          body: realtimeBeat.body,
          snap: realtimeBeat.snap,
          mass: realtimeBeat.mass,
          sharpness: realtimeBeat.sharpness,
          combo: realtimeBeat.combo,
          impact: clamp01(realtimeBeat.strength * 0.46 + realtimeBeat.confidence * 0.20 + realtimeBeat.low * 0.28),
          preview: waitingForBeatMap,
          primary: true,
          dj: dj
        }, 'live');
      }
      if (!beatMapReadyForCamera && liveFallbackOk) {
        var previewPulseScale = waitingForBeatMap && !dj ? 0.68 : 1;
        var rtPulse = Math.min(dj ? 0.42 : (waitingForBeatMap ? 0.56 : 0.76), realtimeBeat.strength * (realtimeBeat.tempoAssist ? (dj ? 0.54 : 0.76) : (dj ? 0.62 : 0.84)) * previewPulseScale);
        if (rtPulse > beatPulse + 0.09) beatOnsetFlag = true;
        beatPulse = Math.max(beatPulse, rtPulse);
      }
    } else if (bassOnset > 0.075 && rb > 0.32 && energyOnset > 0.020) {
      beatPulse = Math.max(beatPulse, Math.min(0.12, bassOnset * 0.18));
    }
    beatPulse *= Math.pow(0.36, audioStepDt);

    // v7.2+: 预解析 beatmap 只在实时引擎暂时没锁住时补位.
    tickPodcastDjBeatMap();
    tickBeatMap();
    if (scheduledBeatFlag) {
      beatOnsetFlag = true;
      scheduledBeatFlag = false;
    }
    // scheduledBeatPulse 衰减并合并到 beatPulse
    if (scheduledBeatPulse > beatPulse) beatPulse = scheduledBeatPulse;
    scheduledBeatPulse *= Math.pow(0.32, audioStepDt);
    if (typeof stepSonicAudioMonitor === 'function') {
      var sonicMonitorFrame = stepSonicAudioMonitor(frequencyData, audioStepDt, {
        fx: fx,
        playing: true,
        beat: beatPulse,
        sampleRate: analysisSampleRate,
        fftSize: analysisFftSize,
        currentTime: audio.currentTime || 0
      });
      if (fx && fx.sonicAudioMonitorEnabled !== false) sonicAudioFrame = sonicMonitorFrame;
    }

    function env(prev, next, attack, release) {
      var k = next > prev ? attack : release;
      return prev + (next - prev) * k;
    }
    // smoothBass 主要由 kick 驱动 (不被人声干扰)
    smoothBass = env(smoothBass, Math.min(0.82, rb * 0.78 + re * 0.025), 0.28, 0.075);
    // smoothMid 用 中高乐器, 不再混入人声
    smoothMid = env(smoothMid, Math.min(0.68, rm * 0.64 + re * 0.025), 0.18, 0.060);
    smoothTreb = env(smoothTreb, Math.min(0.56, rt * 0.54), 0.18, 0.055);
    smoothEnergy = env(smoothEnergy, Math.min(0.72, re), 0.16, 0.055);
    var cinemaProfileSample = { energy: re, low: rb, vocal: voc, melody: rm, lowOnset: bassOnset, energyOnset: energyOnset };
    if (sonicAudioFrame && sonicAudioFrame.sonicDetailed) {
      var sonicLowDrive = clamp01((Number(sonicAudioFrame.subBass) || 0) * 0.58
        + (Number(sonicAudioFrame.bass) || 0) * 0.78
        + (Number(sonicAudioFrame.lowMid) || 0) * 0.26
        + (Number(sonicAudioFrame.kickEnvelope) || 0) * 0.24);
      var sonicLowOnset = clampRange((Number(sonicAudioFrame.kickFlux) || 0) * 0.14
        + (Number(sonicAudioFrame.kickOnset) || 0) * 0.065
        + (Number(sonicAudioFrame.triggerPulse) || 0) * 0.085, 0, 0.18);
      var sonicEnergyDrive = clamp01((Number(sonicAudioFrame.energy) || 0) * 0.88 + sonicLowOnset * 0.74);
      cinemaProfileSample.energy = Math.max(cinemaProfileSample.energy, sonicEnergyDrive);
      cinemaProfileSample.low = Math.max(cinemaProfileSample.low, sonicLowDrive);
      cinemaProfileSample.lowOnset = Math.max(cinemaProfileSample.lowOnset, sonicLowOnset);
      cinemaProfileSample.energyOnset = Math.max(cinemaProfileSample.energyOnset, sonicLowOnset * 0.62);
    }
    updateCinemaDynamics(Math.max(re, cinemaProfileSample.energy * 0.92), Math.max(rb, cinemaProfileSample.low * 0.90));
    updateCinemaTrackProfile(cinemaProfileSample);
    // 歌词阳光溢光: 独立于律动强度, 看持续能量 + 中高频抬升, 更像副歌/高音段落而不是单个鼓点.
    var sunEnergy = clamp01((smoothEnergy - 0.18) / 0.38);
    var sunVoice = clamp01((voc - 0.11) / 0.34);
    var sunMelody = clamp01((smoothMid - 0.16) / 0.27);
    var sunAir = clamp01((smoothTreb - 0.105) / 0.17);
    var sunRaw = clamp01(sunEnergy * 0.36 + sunVoice * 0.18 + sunMelody * 0.26 + sunAir * 0.20);
    sunRaw = sunRaw * sunRaw * (3 - 2 * sunRaw);
    lyricSunAvg += (sunRaw - lyricSunAvg) * 0.006;
    lyricSunPeak = Math.max(0.48, lyricSunPeak * 0.9985, sunRaw);
    var sunThreshold = Math.max(0.78, lyricSunAvg + 0.20, lyricSunPeak * 0.74);
    var sunGate = clamp01((sunRaw - sunThreshold) / Math.max(0.08, 1.0 - sunThreshold));
    sunGate = sunGate * sunGate * (3 - 2 * sunGate);
    lyricSunHold += (sunGate - lyricSunHold) * (sunGate > lyricSunHold ? 0.035 : 0.014);
    lyricSunTarget = lyricSunHold > 0.16 ? clamp01((lyricSunHold - 0.16) / 0.84) : 0;
    lyricSunEnergy += (lyricSunTarget - lyricSunEnergy) * (lyricSunTarget > lyricSunEnergy ? 0.075 : 0.030);
  } else {
    var audioIdleDecay = Math.max(1, audioStepDt * 60);
    if (typeof stepSonicAudioMonitor === 'function') stepSonicAudioMonitor(null, audioStepDt, { fx: fx, playing: false });
    smoothBass *= Math.pow(0.91, audioIdleDecay); smoothMid *= Math.pow(0.91, audioIdleDecay); smoothTreb *= Math.pow(0.91, audioIdleDecay); smoothEnergy *= Math.pow(0.91, audioIdleDecay); beatPulse *= Math.pow(0.82, audioIdleDecay);
    liveCamAvg *= Math.pow(0.94, audioIdleDecay);
    liveCamPeak = Math.max(0.28, liveCamPeak * Math.pow(0.98, audioIdleDecay));
    liveCamLastRaw *= Math.pow(0.80, audioIdleDecay);
    lyricSunTarget = 0;
    lyricSunHold *= Math.pow(0.90, audioIdleDecay);
    lyricSunEnergy *= Math.pow(0.92, audioIdleDecay);
    lyricSunAvg *= Math.pow(0.995, audioIdleDecay);
    lyricSunPeak = Math.max(0.48, lyricSunPeak * Math.pow(0.997, audioIdleDecay));
  }
  }
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('audio.analysis', audioPerfStart);
  audioEnergy = Math.max(smoothEnergy, beatPulse * 0.30);
  bass = Math.min(0.90, smoothBass * 1.05 + beatPulse * 0.18) * fx.intensity;
  mid = Math.min(0.72, smoothMid * 1.12) * fx.intensity;
  treble = Math.min(0.62, smoothTreb * 1.20) * fx.intensity;
  if (fx.preset >= 4) {
    var wallpaperAudio = fx.preset === 5;
    var authoredParticles = fx.preset >= 9 && fx.preset <= 12;
    var ringBassGain = wallpaperAudio ? 1.10 : (authoredParticles ? 1.32 : 1.58);
    var ringMidGain = wallpaperAudio ? 1.16 : (authoredParticles ? 1.48 : 1.82);
    var ringTrebleGain = wallpaperAudio ? 1.34 : (authoredParticles ? 1.72 : 2.28);
    var ringBeatGain = wallpaperAudio ? 0.18 : (authoredParticles ? 0.31 : 0.42);
    var ringBass = smoothBass * ringBassGain + beatPulse * ringBeatGain - smoothMid * 0.16 - smoothTreb * 0.06;
    var ringMid = smoothMid * ringMidGain - smoothBass * 0.14 - smoothTreb * 0.07;
    var ringTreble = smoothTreb * ringTrebleGain - smoothMid * 0.10 - smoothBass * 0.05;
    bass = Math.pow(clamp01((ringBass - 0.050) / 0.58), 0.72) * fx.intensity;
    mid = Math.pow(clamp01((ringMid - 0.045) / 0.46), 0.78) * fx.intensity;
    treble = Math.pow(clamp01((ringTreble - 0.030) / 0.34), 0.84) * fx.intensity;
    if (wallpaperAudio) {
      bass = Math.min(bass, 0.46 * fx.intensity);
      mid = Math.min(mid, 0.40 * fx.intensity);
      treble = Math.min(treble, 0.36 * fx.intensity);
      beatPulse *= 0.34;
    } else if (authoredParticles) {
      bass = Math.min(bass, 0.72 * fx.intensity);
      mid = Math.min(mid, 0.62 * fx.intensity);
      treble = Math.min(treble, 0.58 * fx.intensity);
      beatPulse *= 0.72;
    }
  }
  if (djMode.active) {
    bass = Math.min(1.00, bass * 1.06 + beatPulse * 0.085);
    mid = Math.min(0.76, mid * 1.00 + clamp01(djMode.sectionChange * 1.6) * 0.020);
    treble = Math.min(0.66, treble * 0.98);
    audioEnergy = Math.max(audioEnergy, beatPulse * 0.38, djMode.sectionEnergy * 0.54);
  }

  var vinylSpeedMul = isFinite(fx.speed) ? Math.max(0.05, fx.speed) : 1;
  var vinylSpinSpeed = (0.40 + smoothBass * 0.09) * vinylSpeedMul;
  uniforms.uVinylSpin.value = (uniforms.uVinylSpin.value + dt * vinylSpinSpeed) % (Math.PI * 2);

  var visualUniformPerfStart = performance.now();
  updateParticlePointerFrame();
  uniforms.uBass.value = bass;
  uniforms.uMid.value = mid;
  uniforms.uTreble.value = treble;
  uniforms.uBeat.value = beatPulse;
  uniforms.uEnergy.value = audioEnergy;
  uniforms.uMouseXY.value.set(mouseWorld.x, mouseWorld.y);
  uniforms.uMouseActive.value = mouseActive ? 1 : 0;
  var sonicPresetActiveEarly = window.MineradioSonicTopography && MineradioSonicTopography.isActive(fx);
  var sonicWorkshopActiveEarly = window.MineradioSonicWorkshop && MineradioSonicWorkshop.isActive(fx);
  var skullBackdropDim = fx && fx.preset === SKULL_PRESET_INDEX ? 0.58 : (sonicPresetActiveEarly || sonicWorkshopActiveEarly ? 0.82 : 1);
  var shelfDimTarget = shouldDimWallpaperForShelf() ? 0.48 : skullBackdropDim;
  var shelfDimEase = shelfDimTarget < uniforms.uParticleDim.value ? 0.18 : 0.10;
  uniforms.uParticleDim.value += (shelfDimTarget - uniforms.uParticleDim.value) * Math.min(1, shelfDimEase * Math.max(1, dt * 60));
  if (typeof updateBackgroundStarRiverState === 'function') updateBackgroundStarRiverState(dt, false);

  // 通用转场脉冲: 只作为切换预设时的短促提亮。
  uniforms.uBurstAmt.value *= 0.90;
  tickPresetTransition();
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.uniforms-preset', visualUniformPerfStart);

  var coverLayerPerfStart = performance.now();
  updateRipples(dt);
  updateFloatLayer(dt);
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.cover-layers', coverLayerPerfStart);
  var shelfPerfStart = performance.now();
  var shelfStepDt = consumeFrameGate(mainFrameGates.shelf, now, dt, targetMainShelfFps(now), false, 'shelf-manager');
  if (shelfStepDt > 0 && shelfManager) shelfManager.update(shelfStepDt);
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.shelf-manager', shelfPerfStart);
  var lyricsParticlePerfStart = performance.now();
  var lyricsParticleStepDt = consumeFrameGate(mainFrameGates.lyricsParticles, now, dt, targetMainLyricsParticleFps(now), false, 'lyrics-particles');
  if (lyricsParticleStepDt > 0) tickLyricsParticles();
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.lyrics-particles', lyricsParticlePerfStart);
  var homeAudioPerfStart = performance.now();
  var homeAudioStepDt = consumeFrameGate(mainFrameGates.homeAudio, now, dt, targetMainHomeAudioFps(now), false, 'home-audio');
  if (homeAudioStepDt > 0) updateHomeAudioVisual(homeAudioStepDt);
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.home-audio', homeAudioPerfStart);

  // 电影镜头
  var cameraPerfStart = performance.now();
  updateCinema(dt);
  updateFreeCamera(dt);
  updateCamera();
  applySkullCameraPose(dt);
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('camera.update', cameraPerfStart);

  // v7.2 旋转 = 头部+眼球追踪 + 鼠标/手势拖动 + 惯性
  tickGestureRotation(dt);
  var skullPresetActive = fx && fx.preset === SKULL_PRESET_INDEX;
  var workshopPresetActive = window.MineradioSonicWorkshop && MineradioSonicWorkshop.isActive(fx);
  var presetUsesStarRiverParticles = fx && (Number(fx.preset) === 5 || (typeof SONIC_PRESET_INDEX !== 'undefined' && Number(fx.preset) === SONIC_PRESET_INDEX));
  var presetStarRiverMuted = presetUsesStarRiverParticles && fx.backgroundStarRiver === false;
  particles.visible = !skullPresetActive && !workshopPresetActive && !presetStarRiverMuted;
  if (bloomParticles) bloomParticles.visible = !skullPresetActive && !workshopPresetActive && !presetStarRiverMuted && fx.bloom && fx.bloomStrength > 0.01;
  if (floatGroup) floatGroup.visible = !skullPresetActive && !workshopPresetActive;
  if (backCoverGroup) backCoverGroup.visible = !skullPresetActive && !workshopPresetActive;
  var targetRotY = orbit.centerLocked ? 0 : (headParallax.active ? headParallax.x * 0.5 : 0) + gestureRotation.y;
  var targetRotX = orbit.centerLocked ? 0 : (headParallax.active ? -headParallax.y * 0.35 : 0) + gestureRotation.x;
  particles.rotation.y += (targetRotY - particles.rotation.y) * 0.055;
  particles.rotation.x += (targetRotX - particles.rotation.x) * 0.055;
  if (bloomParticles) {
    bloomParticles.rotation.copy(particles.rotation);
  }
  // 同步给背面粒子层
  if (floatGroup) {
    floatGroup.rotation.copy(particles.rotation);
  }
  if (backCoverGroup) {
    backCoverGroup.rotation.copy(particles.rotation);
  }
  var skullPerfStart = performance.now();
  var skullStepDt = consumeFrameGate(mainFrameGates.skullParticles, now, dt, targetMainSkullParticleFps(now), false, 'skull-particles');
  if (skullStepDt > 0) updateSkullParticleLayer(skullStepDt);
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.skull-particles', skullPerfStart);
  var sonicPerfStart = performance.now();
  if (window.MineradioSonicTopography) {
    MineradioSonicTopography.update(dt, {
      scene: scene,
      fx: fx,
      time: uniforms.uTime.value,
      screenHeight: window.innerHeight,
      dpr: renderer.getPixelRatio ? renderer.getPixelRatio() : (window.devicePixelRatio || 1),
      visualRotation: particles && particles.rotation ? particles.rotation : null,
      visualRotationActive: !!(orbit && orbit.rotating),
      audio: sonicAudioFrame || { bass: bass, mid: mid, treble: treble, beat: beatPulse, energy: audioEnergy }
    });
  }
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.sonic-topography', sonicPerfStart);
  var sonicWorkshopPerfStart = performance.now();
  if (window.MineradioSonicWorkshop) {
    MineradioSonicWorkshop.update(dt, {
      scene: scene,
      fx: fx,
      time: uniforms.uTime.value,
      audio: { bass: bass, mid: mid, treble: treble, beat: beatPulse, energy: audioEnergy }
    });
  }
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.sonic-workshop', sonicWorkshopPerfStart);
  var stageLyricsPerfStart = performance.now();
  var stageLyricsStepDt = consumeFrameGate(mainFrameGates.stageLyrics, now, dt, targetMainStageLyricsFps(now), false, 'stage-lyrics');
  if (stageLyricsStepDt > 0) updateStageLyrics3D(stageLyricsStepDt);
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('visual.stage-lyrics', stageLyricsPerfStart);
  var desktopOverlayPerfStart = performance.now();
  var desktopOverlayStepDt = consumeFrameGate(mainFrameGates.desktopOverlay, now, dt, targetMainDesktopOverlayFps(now), false, 'desktop-overlay');
  if (desktopOverlayStepDt > 0) syncDesktopOverlayState();
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('desktop.overlay-sync', desktopOverlayPerfStart);

  // 缩略图脉动
  if (currentIdx >= 0) {
    var s = 1 + bass * 0.08;
    var thumbCoverEl = document.getElementById('thumb-cover');
    if (thumbCoverEl) thumbCoverEl.style.transform = 'scale(' + s + ')';
  }

  var rendererPerfStart = performance.now();
  renderer.render(scene, camera);
  if (perfProbe && perfProbe.markSince) perfProbe.markSince('renderer.render', rendererPerfStart);
  var frameCostMs = performance.now() - framePerfStart;
  if (typeof sampleAdaptiveFrameCost === 'function') {
    var frameLoad = sampleAdaptiveFrameCost(frameCostMs, renderPerfState.targetFps || renderPerfState.displayHz || 60);
    if (frameLoad) {
      renderPerfState.adaptiveFrameCostMs = frameLoad.avgMs;
      renderPerfState.adaptivePressure = frameLoad.level;
    }
  }
  if (perfProbe && perfProbe.mark) perfProbe.mark('frame.total', frameCostMs);
}
requestMainLoopAnimationFrame();
