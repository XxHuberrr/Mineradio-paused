// ============================================================
function startHeadTracking() { }     // stub: 兼容旧调用
function stopHeadTracking() { }      // stub

var gestureVideo = null, gestureCamera = null, gestureHands = null;
var gestureActive = false;
// 21 个关键点的平滑缓存 (EMA): [{x,y}, ...]
var handLmSmooth = null;
var handLmLastSeen = 0;
// 捏合状态
var pinchState = { active: false, lastX: 0, lastY: 0, lastT: 0 };
// 物理旋转: 给 particles 一个角速度, 每帧衰减
var particleSpin = { vx: 0, vy: 0, damping: 0.90 };
// 手势驱动的总旋转 (累计角度), 输出到 particles
var gestureRotation = { x: 0, y: 0 };
var gestureGrip = { value: 0, target: 0, openness: 1, lastState: 'open', pulse: 0 };
var gestureActionState = {
  candidate: '',
  since: 0,
  fired: false,
  cooldownUntil: 0,
  swipeAnchor: null,
  volumeArmed: false,
  volumeBaseY: 0,
  volumeBaseValue: 0,
  volumeLastApply: 0,
  lastAction: ''
};
var gestureStartEpoch = 0;
var gestureStartPromise = null;
var gestureInferenceBusy = false;
var gestureLastInferenceAt = 0;
var gestureLastInferenceErrorAt = 0;
var gestureInferenceErrorCount = 0;
var gestureLifecycleState = 'off';
var gestureHostResumeTimer = 0;
var gestureLastHudSignature = '';
var gestureLastHudAt = 0;
var PARTICLE_POINTER_SPIN_X = 0.0032;
var PARTICLE_POINTER_SPIN_Y = 0.0034;
var PARTICLE_HAND_SPIN_X = 4.15;
var PARTICLE_HAND_SPIN_Y = 4.30;
var PARTICLE_SPIN_MAX = 6.2;

function clampParticleSpinVelocity(v) {
  if (!isFinite(v)) return 0;
  return Math.max(-PARTICLE_SPIN_MAX, Math.min(PARTICLE_SPIN_MAX, v));
}

function applyParticleSpinDrag(dx, dy, dt) {
  var rx = dy * PARTICLE_POINTER_SPIN_X;
  var ry = dx * PARTICLE_POINTER_SPIN_Y;
  gestureRotation.x += rx;
  gestureRotation.y += ry;
  if (dt > 0) {
    particleSpin.vx = clampParticleSpinVelocity(rx / dt * 0.46);
    particleSpin.vy = clampParticleSpinVelocity(ry / dt * 0.46);
  }
}

function resetParticleRotationTarget(syncVisual) {
  gestureRotation.x = 0;
  gestureRotation.y = 0;
  particleSpin.vx = 0;
  particleSpin.vy = 0;
  if (syncVisual && particles) {
    particles.rotation.set(0, 0, 0);
    if (bloomParticles) bloomParticles.rotation.set(0, 0, 0);
    if (floatGroup) floatGroup.rotation.set(0, 0, 0);
    if (backCoverGroup) backCoverGroup.rotation.set(0, 0, 0);
  }
}

function rebaseParticleRotationAxis(axis) {
  var limit = Math.PI * 10;
  if (Math.abs(gestureRotation[axis]) < limit) return;
  var offset = Math.round(gestureRotation[axis] / (Math.PI * 2)) * Math.PI * 2;
  gestureRotation[axis] -= offset;
  if (particles) particles.rotation[axis] -= offset;
  if (bloomParticles) bloomParticles.rotation[axis] -= offset;
  if (floatGroup) floatGroup.rotation[axis] -= offset;
  if (backCoverGroup) backCoverGroup.rotation[axis] -= offset;
  if (skullParticleGroup) skullParticleGroup.rotation[axis] -= offset;
  if (stageLyrics.group) stageLyrics.group.rotation[axis] -= offset;
}

function rebaseParticleRotationIfNeeded() {
  rebaseParticleRotationAxis('x');
  rebaseParticleRotationAxis('y');
}
// 手骨架 canvas
var handCanvas = null, handCanvasCtx = null;
// 平滑系数 (越小越平滑, 但反应越慢)
var HAND_SMOOTH_ALPHA = 0.35;

function normalizeGestureSensitivity(value) {
  value = String(value || '').trim().toLowerCase();
  return /^(steady|balanced|quick)$/.test(value) ? value : 'balanced';
}

function gestureSensitivityProfile() {
  var mode = normalizeGestureSensitivity(fx && fx.gestureSensitivity);
  if (mode === 'steady') return { hold: 820, volumeHold: 620, swipeDistance: 0.245, swipeWindow: 620, cooldown: 1320 };
  if (mode === 'quick') return { hold: 470, volumeHold: 350, swipeDistance: 0.165, swipeWindow: 520, cooldown: 860 };
  return { hold: 640, volumeHold: 470, swipeDistance: 0.205, swipeWindow: 570, cooldown: 1080 };
}

function gestureLandmarkDistance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function gestureFingerExtended(lm, tipIndex, pipIndex, mcpIndex, palm) {
  var span = Math.max(0.045, gestureLandmarkDistance(lm[5], lm[17]));
  var tipPalm = gestureLandmarkDistance(lm[tipIndex], palm);
  var pipPalm = gestureLandmarkDistance(lm[pipIndex], palm);
  var tipMcp = gestureLandmarkDistance(lm[tipIndex], lm[mcpIndex]);
  var pipMcp = gestureLandmarkDistance(lm[pipIndex], lm[mcpIndex]);
  return tipPalm > pipPalm + span * 0.13 && tipMcp > pipMcp * 1.18;
}

function classifyGesturePlayerPose(lm, palm, pinchDist) {
  var span = Math.max(0.045, gestureLandmarkDistance(lm[5], lm[17]));
  var index = gestureFingerExtended(lm, 8, 6, 5, palm);
  var middle = gestureFingerExtended(lm, 12, 10, 9, palm);
  var ring = gestureFingerExtended(lm, 16, 14, 13, palm);
  var pinky = gestureFingerExtended(lm, 20, 18, 17, palm);
  var thumbReach = gestureLandmarkDistance(lm[4], palm);
  var thumbUp = thumbReach > span * 0.78 && lm[4].y < palm.y - span * 0.52;
  if (thumbUp && !index && !middle && !ring && !pinky) return 'like';
  if (index && middle && !ring && !pinky && gestureLandmarkDistance(lm[8], lm[12]) > span * 0.26) return 'play';
  if (index && middle && ring && !pinky) return 'lyrics';
  if (index && !middle && !ring && !pinky && pinchDist > span * 0.30) return 'volume';
  return '';
}

function resetGesturePlayerActionState(keepCooldown) {
  gestureActionState.candidate = '';
  gestureActionState.since = 0;
  gestureActionState.fired = false;
  gestureActionState.swipeAnchor = null;
  gestureActionState.volumeArmed = false;
  gestureActionState.volumeLastApply = 0;
  if (!keepCooldown) gestureActionState.cooldownUntil = 0;
}

function gesturePlayerActionsAllowed() {
  if (!gestureActive || !fx || fx.gesturePlayerActions === false) return false;
  if (!gestureHostVisible()) return false;
  if (document.body && document.body.classList.contains('desktop-software-locked')) return false;
  if (typeof progressDragState !== 'undefined' && progressDragState && progressDragState.active) return false;
  if (document.querySelector('.modal-mask.show,.modal.show,.login-easter-overlay.show,.login-easter-overlay.active')) return false;
  var active = document.activeElement;
  if (active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable)) return false;
  return true;
}

function setGestureCandidate(candidate, now, holdMs, label, detail) {
  if (gestureActionState.candidate !== candidate) {
    gestureActionState.candidate = candidate;
    gestureActionState.since = now;
    gestureActionState.fired = false;
  }
  var progress = Math.max(0, Math.min(1, (now - gestureActionState.since) / Math.max(1, holdMs)));
  showGestureHUD(label, progress, gestureActionState.fired ? '已执行，松手后可再次触发' : detail);
  return progress;
}

function executeGesturePlayerAction(action, now, cooldownMs) {
  if (gestureActionState.fired || now < gestureActionState.cooldownUntil) return false;
  gestureActionState.fired = true;
  gestureActionState.lastAction = action;
  gestureActionState.cooldownUntil = now + cooldownMs;
  try {
    if (action === 'play') {
      Promise.resolve(togglePlay()).catch(function () { });
      showToast('手势: 播放 / 暂停');
    } else if (action === 'like') {
      if (typeof toggleLikeCurrent === 'function') toggleLikeCurrent();
      showToast('手势: 喜欢当前歌曲');
    } else if (action === 'lyrics') {
      if (typeof setParticleLyricsSilently === 'function') {
        setParticleLyricsSilently(!fx.particleLyrics);
        saveLyricLayout({ user: true, reason: 'gesture-lyrics' });
        showToast(fx.particleLyrics ? '手势: 已显示歌词' : '手势: 已隐藏歌词');
      }
    } else if (action === 'next') {
      nextTrack(true);
      showToast('手势: 下一首');
    } else if (action === 'previous') {
      prevTrack(true);
      showToast('手势: 上一首');
    }
    return true;
  } catch (e) {
    console.warn('[GestureAction]', action, e);
    return false;
  }
}

function updateGestureSwipeAction(palm, openness, now, profile) {
  if (openness < 0.72) {
    gestureActionState.swipeAnchor = null;
    return false;
  }
  var anchor = gestureActionState.swipeAnchor;
  if (!anchor || now - anchor.time > profile.swipeWindow) {
    gestureActionState.swipeAnchor = { x: palm.x, y: palm.y, time: now };
    return false;
  }
  var dx = palm.x - anchor.x;
  var dy = palm.y - anchor.y;
  if (Math.abs(dy) > 0.16 || Math.abs(dx) < profile.swipeDistance || Math.abs(dx) < Math.abs(dy) * 1.65 || now < gestureActionState.cooldownUntil) return false;
  var action = dx < 0 ? 'next' : 'previous';
  gestureActionState.candidate = action;
  gestureActionState.since = now;
  gestureActionState.fired = false;
  gestureActionState.swipeAnchor = null;
  executeGesturePlayerAction(action, now, profile.cooldown);
  showGestureHUD(dx < 0 ? '左滑 · 下一首' : '右滑 · 上一首', 1, '已执行，回到中央后可继续');
  return true;
}

function updateGesturePlayerActions(lm, palm, openness, pinchDist, isPinch, isFist, now) {
  if (!gesturePlayerActionsAllowed()) {
    resetGesturePlayerActionState(true);
    return false;
  }
  var profile = gestureSensitivityProfile();
  if (!isPinch && !isFist && updateGestureSwipeAction(palm, openness, now, profile)) return true;
  if (isPinch || isFist || openness > 0.72) {
    if (openness <= 0.72) gestureActionState.swipeAnchor = null;
    gestureActionState.candidate = '';
    gestureActionState.since = 0;
    gestureActionState.fired = false;
    gestureActionState.volumeArmed = false;
    return false;
  }

  var pose = classifyGesturePlayerPose(lm, palm, pinchDist);
  if (!pose) {
    gestureActionState.candidate = '';
    gestureActionState.since = 0;
    gestureActionState.fired = false;
    gestureActionState.volumeArmed = false;
    return false;
  }
  if (pose === 'volume') {
    var volumeProgress = setGestureCandidate('volume', now, profile.volumeHold, '食指音量', '保持后上下移动调节音量');
    if (volumeProgress >= 1 && !gestureActionState.volumeArmed) {
      gestureActionState.volumeArmed = true;
      gestureActionState.volumeBaseY = palm.y;
      gestureActionState.volumeBaseValue = typeof targetVolume === 'number' ? targetVolume : 0.7;
      gestureActionState.volumeLastApply = 0;
    }
    if (gestureActionState.volumeArmed) {
      var nextVolume = Math.max(0, Math.min(1, gestureActionState.volumeBaseValue + (gestureActionState.volumeBaseY - palm.y) * 1.85));
      if (now - gestureActionState.volumeLastApply >= 80) {
        gestureActionState.volumeLastApply = now;
        if (typeof setVolume === 'function') setVolume(nextVolume, true);
      }
      showGestureHUD('音量 ' + Math.round(nextVolume * 100) + '%', nextVolume, '食指向上增加 · 向下降低');
    }
    return true;
  }

  var labels = {
    play: ['V 手势 · 播放', '保持以播放 / 暂停'],
    like: ['拇指向上 · 喜欢', '保持以收藏 / 取消收藏'],
    lyrics: ['三指 · 歌词', '保持以显示 / 隐藏歌词']
  };
  var progress = setGestureCandidate(pose, now, profile.hold, labels[pose][0], labels[pose][1]);
  if (progress >= 1) executeGesturePlayerAction(pose, now, profile.cooldown);
  return true;
}

function applyGestureSettingsUi() {
  if (!fx) return;
  var actions = document.getElementById('t-gesturePlayerActions');
  if (actions) actions.classList.toggle('on', fx.gesturePlayerActions !== false);
  var overlay = document.getElementById('t-gestureHandOverlay');
  if (overlay) overlay.classList.toggle('on', fx.gestureHandOverlay !== false);
  var mode = normalizeGestureSensitivity(fx.gestureSensitivity);
  document.querySelectorAll('#gesture-sensitivity-seg button').forEach(function (button) {
    button.classList.toggle('active', button.dataset.gestureSensitivity === mode);
  });
  if (handCanvas) handCanvas.classList.toggle('show', gestureActive && fx.gestureHandOverlay !== false);
}

function toggleGesturePlayerActions() {
  fx.gesturePlayerActions = fx.gesturePlayerActions === false;
  resetGesturePlayerActionState(true);
  applyGestureSettingsUi();
  saveLyricLayout({ user: true, reason: 'gesturePlayerActions' });
  showToast(fx.gesturePlayerActions ? '播放器手势已开启' : '仅保留粒子视觉手势');
}

function toggleGestureHandOverlay() {
  fx.gestureHandOverlay = fx.gestureHandOverlay === false;
  applyGestureSettingsUi();
  if (!fx.gestureHandOverlay && handCanvasCtx) handCanvasCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
  saveLyricLayout({ user: true, reason: 'gestureHandOverlay' });
  showToast(fx.gestureHandOverlay ? '手部光迹已显示' : '手部光迹已隐藏，识别继续运行');
}

function setGestureSensitivity(mode) {
  fx.gestureSensitivity = normalizeGestureSensitivity(mode);
  resetGesturePlayerActionState(true);
  applyGestureSettingsUi();
  saveLyricLayout({ user: true, reason: 'gestureSensitivity' });
}

function gestureInferenceIntervalMs() {
  var quality = fx && String(fx.performanceQuality || 'eco');
  if (quality === 'high' || quality === 'ultra') return 42;
  if (quality === 'balanced') return 55;
  return 72;
}

function gestureModelComplexity() {
  // 手势是显式开启的交互能力，识别可靠性优先于模型降档。
  // 帧率仍按性能档限流，低配机不会因此把推理频率拉高。
  return 1;
}

function gestureHostVisible() {
  if (typeof desktopRuntimeState === 'object' && desktopRuntimeState && desktopRuntimeState.desktop) {
    // 完整桌面模式会把同一个 Mineradio HWND 嵌入桌面；此时 Electron
    // 的 isVisible/isMinimized 可能不代表用户肉眼看到的桌面宿主。
    if (desktopRuntimeState.embedded === true || desktopRuntimeState.interactive === true) return true;
    return desktopRuntimeState.minimized !== true && desktopRuntimeState.visible !== false;
  }
  return !document.hidden;
}

function syncGestureCameraUi() {
  if (!fx) return;
  var wantsGesture = fx.cam === 'gesture';
  var starting = wantsGesture && gestureLifecycleState === 'starting';
  var running = wantsGesture && gestureActive && gestureLifecycleState === 'active';
  document.querySelectorAll('#cam-seg button').forEach(function (button) {
    var mode = button.dataset.cam;
    button.classList.toggle('active', mode === 'gesture' ? (running || starting) : !wantsGesture);
    button.classList.toggle('pending', mode === 'gesture' && starting);
    button.setAttribute('aria-busy', mode === 'gesture' && starting ? 'true' : 'false');
    button.setAttribute('aria-pressed', mode === 'gesture' ? String(running) : String(!wantsGesture));
  });
}

function setGestureLifecycleState(state) {
  gestureLifecycleState = String(state || 'off');
  syncGestureCameraUi();
}

function persistGestureCameraDisabled(reason) {
  fx.cam = 'off';
  syncGestureCameraUi();
  try { saveLyricLayout({ user: true, reason: 'cam', syncDisk: true }); } catch (e) { }
  if (reason) console.warn('[GestureCamera] disabled:', reason);
}

function resumeSavedGestureControl(reason) {
  if (!fx || fx.cam !== 'gesture') {
    syncGestureCameraUi();
    return Promise.resolve(false);
  }
  if ((document.body && document.body.classList.contains('splash-active')) || !gestureHostVisible()) {
    setGestureLifecycleState('suspended');
    return Promise.resolve(false);
  }
  return Promise.resolve(startGestureControl()).then(function (started) {
    syncGestureCameraUi();
    return started === true;
  });
}

function syncGestureControlHostVisibility(reason) {
  if (gestureHostResumeTimer) {
    clearTimeout(gestureHostResumeTimer);
    gestureHostResumeTimer = 0;
  }
  if (!fx || fx.cam !== 'gesture') {
    if (gestureActive || gestureStartPromise || gestureVideo || gestureCamera || gestureHands) stopGestureControl();
    else syncGestureCameraUi();
    return;
  }
  if (!gestureHostVisible()) {
    gestureStartEpoch++;
    gestureStartPromise = null;
    if (gestureActive || gestureVideo || gestureCamera || gestureHands) cleanupGestureControlRuntime('suspended');
    else setGestureLifecycleState('suspended');
    return;
  }
  if (document.body && document.body.classList.contains('splash-active')) return;
  gestureHostResumeTimer = setTimeout(function () {
    gestureHostResumeTimer = 0;
    resumeSavedGestureControl(reason || 'host-visible');
  }, 120);
}

async function startGestureControl() {
  if (gestureActive) return true;
  if (gestureStartPromise) return gestureStartPromise;
  var epoch = ++gestureStartEpoch;
  setGestureLifecycleState('starting');
  gestureStartPromise = startGestureControlInternal(epoch);
  try { return await gestureStartPromise; }
  finally {
    if (epoch === gestureStartEpoch) {
      gestureStartPromise = null;
      if (!gestureActive && gestureLifecycleState === 'starting') {
        setGestureLifecycleState(fx && fx.cam === 'gesture' ? 'suspended' : 'off');
      }
    }
  }
}

async function startGestureControlInternal(epoch) {
  showToast('正在加载手势识别…');
  try {
    var desktopApi = typeof getDesktopWindowApi === 'function' ? getDesktopWindowApi() : window.desktopWindow;
    if (desktopApi && typeof desktopApi.requestGestureCameraPermission === 'function') {
      var permissionGrant = await desktopApi.requestGestureCameraPermission();
      if (!permissionGrant || permissionGrant.ok !== true) {
        throw new Error(permissionGrant && permissionGrant.error || 'GESTURE_CAMERA_PERMISSION_GRANT_FAILED');
      }
    }
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
    if (epoch !== gestureStartEpoch || fx.cam !== 'gesture') return false;
    gestureVideo = document.createElement('video');
    gestureVideo.playsInline = true; gestureVideo.muted = true;
    gestureVideo.style.display = 'none';
    document.body.appendChild(gestureVideo);
    gestureHands = new Hands({ locateFile: function (f) { return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + f; } });
    // modelComplexity:1 比 0 更稳定, 但仍流畅. 提高 confidence 减少误检
    gestureHands.setOptions({ maxNumHands: 1, modelComplexity: gestureModelComplexity(), minDetectionConfidence: 0.58, minTrackingConfidence: 0.55 });
    gestureHands.onResults(function (res) {
      if (!gestureActive) return;
      var lm = res.multiHandLandmarks && res.multiHandLandmarks[0];
      if (!lm) { onHandLost(); return; }
      processHandFrame(lm);
    });
    gestureCamera = new Camera(gestureVideo, { onFrame: async function () {
      if (!gestureHands || gestureInferenceBusy || !gestureHostVisible()) return;
      var now = performance.now();
      if (now - gestureLastInferenceAt < gestureInferenceIntervalMs()) return;
      gestureLastInferenceAt = now;
      gestureInferenceBusy = true;
      try {
        await gestureHands.send({ image: gestureVideo });
      } catch (error) {
        // camera_utils 只会在 onFrame Promise resolve 后排下一帧；这里若把
        // 单帧错误继续抛出，整条摄像头 RAF 会永久停止。
        gestureInferenceErrorCount++;
        if (now - gestureLastInferenceErrorAt > 5000) {
          gestureLastInferenceErrorAt = now;
          console.warn('[GestureCamera] inference frame recovered:', error && (error.message || error.name) || error);
        }
        onHandLost();
      }
      finally { gestureInferenceBusy = false; }
    }, width: 480, height: 360 });
    await gestureCamera.start();
    if (epoch !== gestureStartEpoch || fx.cam !== 'gesture') {
      cleanupGestureControlRuntime();
      return false;
    }
    gestureActive = true;
    setGestureLifecycleState('active');
    // 准备 hand canvas
    handCanvas = document.getElementById('hand-canvas');
    handCanvasCtx = handCanvas.getContext('2d');
    resizeHandCanvas();
    handCanvas.classList.toggle('show', fx.gestureHandOverlay !== false);
    applyGestureSettingsUi();
    showToast('手势已开启: 粒子交互 + 播放控制');
    showGestureHUD('待命', 0, '把手放进视野');
    return true;
  } catch (e) {
    if (epoch !== gestureStartEpoch || !fx || fx.cam !== 'gesture') {
      cleanupGestureControlRuntime(fx && fx.cam === 'gesture' ? 'suspended' : 'off');
      return false;
    }
    console.warn('Gesture failed:', e);
    cleanupGestureControlRuntime('error');
    var denied = /NotAllowed|Permission|permission|GESTURE_CAMERA/i.test(String(e && (e.name + ' ' + e.message) || e || ''));
    showToast(denied ? '摄像头权限未开启，请在 Windows 隐私设置中允许桌面应用访问摄像头' : '手势启动失败，请检查摄像头是否被其他程序占用');
    persistGestureCameraDisabled(e && (e.message || e.name) || e || 'startup-failed');
    return false;
  }
}

function cleanupGestureControlRuntime(nextState) {
  try { if (gestureCamera && gestureCamera.stop) gestureCamera.stop(); } catch (e) { }
  try { if (gestureVideo && gestureVideo.srcObject) gestureVideo.srcObject.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { }
  try { if (gestureHands && gestureHands.close) gestureHands.close(); } catch (e) { }
  try { if (gestureVideo) gestureVideo.remove(); } catch (e) { }
  gestureVideo = null; gestureHands = null; gestureCamera = null;
  gestureActive = false;
  gestureInferenceBusy = false;
  gestureLastInferenceAt = 0;
  gestureLastInferenceErrorAt = 0;
  gestureInferenceErrorCount = 0;
  pinchState.active = false;
  handLmSmooth = null;
  uniforms.uHandActive.value = 0;
  if (uniforms.uGestureGrip) uniforms.uGestureGrip.value = 0;
  gestureGrip.value = 0;
  gestureGrip.target = 0;
  gestureGrip.openness = 1;
  resetGesturePlayerActionState(false);
  document.getElementById('gesture-hud').classList.remove('show');
  if (handCanvas) {
    handCanvas.classList.remove('show');
    if (handCanvasCtx) handCanvasCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
  }
  setGestureLifecycleState(nextState || 'off');
}

function stopGestureControl() {
  gestureStartEpoch++;
  gestureStartPromise = null;
  if (!gestureActive && !gestureVideo && !gestureCamera && !gestureHands) return;
  cleanupGestureControlRuntime('off');
}

function resizeHandCanvas() {
  if (!handCanvas) return;
  var eco = fx && fx.performanceQuality === 'eco';
  var dpr = eco ? 1 : Math.min(devicePixelRatio || 1, 2);
  handCanvas.width = innerWidth * dpr;
  handCanvas.height = innerHeight * dpr;
  handCanvas.style.width = innerWidth + 'px';
  handCanvas.style.height = innerHeight + 'px';
  handCanvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeHandCanvas);

function onHandLost() {
  // 平滑淡出, 不立即清零 — 给一点缓冲
  if (pinchState.active) pinchState.active = false;
  gestureGrip.target = 0;
  resetGesturePlayerActionState(true);
  uniforms.uHandActive.value *= 0.9;
  if (uniforms.uHandActive.value < 0.02) uniforms.uHandActive.value = 0;
  if (performance.now() - handLmLastSeen > 600) {
    handLmSmooth = null;
    if (handCanvasCtx) handCanvasCtx.clearRect(0, 0, innerWidth, innerHeight);
    showGestureHUD('待命', 0, '把手放进视野');
  }
}

// 把单帧 21 个 landmark 平滑到 handLmSmooth, 镜像 X (摄像头是反的)
function smoothLandmarks(lm) {
  if (!handLmSmooth) {
    handLmSmooth = lm.map(function (p) { return { x: 1 - p.x, y: p.y, z: p.z || 0 }; });
    return handLmSmooth;
  }
  var a = HAND_SMOOTH_ALPHA;
  for (var i = 0; i < 21; i++) {
    var srcX = 1 - lm[i].x;
    handLmSmooth[i].x += (srcX - handLmSmooth[i].x) * a;
    handLmSmooth[i].y += (lm[i].y - handLmSmooth[i].y) * a;
    handLmSmooth[i].z += ((lm[i].z || 0) - handLmSmooth[i].z) * a;
  }
  return handLmSmooth;
}

// 手掌中心 ≈ wrist(0) 和 mcp 平均 (5,9,13,17 是各指根)
function palmCenter(lm) {
  var px = (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5;
  var py = (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5;
  return { x: px, y: py };
}

function handOpenness(lm, palm) {
  var span = Math.hypot(lm[5].x - lm[17].x, lm[5].y - lm[17].y);
  span = Math.max(0.055, span);
  var tips = [8, 12, 16, 20];
  var avg = 0;
  for (var i = 0; i < tips.length; i++) avg += Math.hypot(lm[tips[i]].x - palm.x, lm[tips[i]].y - palm.y);
  avg /= tips.length;
  return clampRange((avg / span - 0.62) / 0.78, 0, 1);
}

function processHandFrame(rawLm) {
  handLmLastSeen = performance.now();
  var lm = smoothLandmarks(rawLm);

  // 推开粒子位置: 手掌中心 (而非单一食指)
  var palm = palmCenter(lm);
  var openness = handOpenness(lm, palm);
  gestureGrip.openness += (openness - gestureGrip.openness) * 0.28;
  var gripTarget = clampRange(1 - openness, 0, 1);
  gestureGrip.target = gripTarget > 0.55 ? gripTarget : 0;
  var ndcX = palm.x * 2 - 1;
  var ndcY = -(palm.y * 2 - 1);
  var handLocalX = ndcX * PLANE_SIZE * 0.62;
  var handLocalY = ndcY * PLANE_SIZE * 0.62;
  if (particleLocalPointFromNdc(ndcX, ndcY, particlePointerLocalHit)) {
    // 平滑推动 (避免 uHandXY 跳变)
    handLocalX = particlePointerLocalHit.x;
    handLocalY = particlePointerLocalHit.y;
  }
  var cur = uniforms.uHandXY.value;
  cur.x += (handLocalX - cur.x) * 0.48;
  cur.y += (handLocalY - cur.y) * 0.48;
  var tgtActive = 0.44 + openness * 0.56;
  uniforms.uHandActive.value += (tgtActive - uniforms.uHandActive.value) * 0.26;

  // 捏合检测 (拇指 4 与食指 8)
  var pinchDist = Math.hypot(lm[8].x - lm[4].x, lm[8].y - lm[4].y);
  var isPinch = pinchDist < 0.075 && openness > 0.28;
  var isFist = !isPinch && gripTarget > 0.68;
  var playerActionVisible = updateGesturePlayerActions(lm, palm, openness, pinchDist, isPinch, isFist, performance.now());

  if (isPinch && !pinchState.active) {
    unlockCenteredView();
    pinchState.active = true;
    pinchState.lastX = palm.x;
    pinchState.lastY = palm.y;
    pinchState.lastT = performance.now();
    particleSpin.vx = particleSpin.vy = 0;
    gestureGrip.target = Math.min(0.34, gestureGrip.target);
    if (!playerActionVisible) showGestureHUD('捏合拖动', 1, '移动手掌 -> 旋转封面');
  } else if (isPinch && pinchState.active) {
    unlockCenteredView();
    var dx = palm.x - pinchState.lastX;
    var dy = palm.y - pinchState.lastY;
    var nowPinch = performance.now();
    var pinchDt = Math.max(1 / 120, Math.min(0.08, (nowPinch - pinchState.lastT) / 1000 || 1 / 60));
    // v8: 方向修正 - 上下手与封面旋转同向
    var spinY = dx * PARTICLE_HAND_SPIN_Y;
    var spinX = dy * PARTICLE_HAND_SPIN_X;
    gestureRotation.y += spinY;
    gestureRotation.x += spinX;
    particleSpin.vy = clampParticleSpinVelocity(spinY / pinchDt * 0.48);
    particleSpin.vx = clampParticleSpinVelocity(spinX / pinchDt * 0.48);
    pinchState.lastX = palm.x;
    pinchState.lastY = palm.y;
    pinchState.lastT = nowPinch;
    gestureGrip.target = Math.min(0.34, gestureGrip.target);
    if (!playerActionVisible) showGestureHUD('拖动中', 1, '松手后保留惯性');
  } else if (!isPinch && pinchState.active) {
    pinchState.active = false;
    if (!playerActionVisible) showGestureHUD('松开', 0.4, '可继续触碰或捏合');
  } else if (isFist) {
    if (gestureGrip.lastState !== 'fist') {
      gestureGrip.pulse = 1;
      uniforms.uBurstAmt.value = Math.max(uniforms.uBurstAmt.value, 0.26);
    }
    gestureGrip.lastState = 'fist';
    if (!playerActionVisible) showGestureHUD('握拳收束', Math.max(0.55, gripTarget), '粒子向中心收缩');
  } else {
    if (gestureGrip.lastState === 'fist' && openness > 0.58) {
      uniforms.uBurstAmt.value = Math.max(uniforms.uBurstAmt.value, 0.18);
    }
    gestureGrip.lastState = openness > 0.62 ? 'open' : 'hover';
    if (!playerActionVisible) showGestureHUD(openness > 0.62 ? '张开恢复' : '悬停', 0.30 + openness * 0.34, openness > 0.72 ? '快速左右滑动可切歌' : '手掌推开粒子 / 捏合旋转 / 握拳收束');
  }

  if (fx.gestureHandOverlay !== false) drawHandSkeleton(lm, isPinch, openness, isFist);
  else if (handCanvasCtx) handCanvasCtx.clearRect(0, 0, innerWidth, innerHeight);
}

// 画手掌骨架: 连线 + 关节圆点
//   骨架连接表 (MediaPipe 标准)
var HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],        // 拇指
  [0, 5], [5, 6], [6, 7], [7, 8],        // 食指
  [0, 9], [9, 10], [10, 11], [11, 12],   // 中指
  [0, 13], [13, 14], [14, 15], [15, 16], // 无名指
  [0, 17], [17, 18], [18, 19], [19, 20], // 小指
  [5, 9], [9, 13], [13, 17],           // 掌横连
];
function drawHandSkeleton(lm, isPinch, openness, isFist) {
  if (!handCanvasCtx) return;
  var ctx = handCanvasCtx;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  var W = innerWidth, H = innerHeight;
  openness = clampRange(openness == null ? 1 : openness, 0, 1);
  var palm = palmCenter(lm);
  var px = palm.x * W, py = palm.y * H;
  var primary = isFist ? 'rgba(244,210,138,0.92)' : (isPinch ? 'rgba(156,255,223,0.95)' : 'rgba(226,247,255,0.92)');
  var soft = isFist ? 'rgba(244,210,138,0.18)' : (isPinch ? 'rgba(156,255,223,0.20)' : 'rgba(143,233,255,0.18)');
  var coreR = 26 + openness * 34;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  var aura = ctx.createRadialGradient(px, py, 0, px, py, coreR * 2.15);
  aura.addColorStop(0, isFist ? 'rgba(244,210,138,0.26)' : 'rgba(255,255,255,0.22)');
  aura.addColorStop(0.28, soft);
  aura.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(px, py, coreR * 2.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  var ringR = 34 + openness * 48;
  for (var r = 0; r < 3; r++) {
    var alpha = (0.18 - r * 0.045) + (isFist ? 0.08 : 0);
    ctx.strokeStyle = primary.replace(/0\.\d+\)/, alpha.toFixed(3) + ')');
    ctx.lineWidth = 1.2 + r * 0.55;
    ctx.beginPath();
    ctx.arc(px, py, ringR + r * 13 + Math.sin(uniforms.uTime.value * 1.5 + r) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  var tips = [4, 8, 12, 16, 20];
  for (var i = 0; i < tips.length; i++) {
    var p = lm[tips[i]];
    var tx = p.x * W, ty = p.y * H;
    var dx = tx - px, dy = ty - py;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var beamAlpha = clampRange(0.26 - dist / 720, 0.045, 0.18) * (0.55 + openness * 0.45);
    var grad = ctx.createLinearGradient(px, py, tx, ty);
    grad.addColorStop(0, 'rgba(255,255,255,' + (beamAlpha * 0.20).toFixed(3) + ')');
    grad.addColorStop(0.65, 'rgba(255,255,255,' + (beamAlpha * 0.42).toFixed(3) + ')');
    grad.addColorStop(1, primary.replace(/0\.\d+\)/, Math.min(0.72, beamAlpha + 0.14).toFixed(3) + ')'));
    ctx.strokeStyle = grad;
    ctx.lineWidth = tips[i] === 8 || tips[i] === 4 ? 1.7 : 1.05;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + dx * 0.42 - dy * 0.05, py + dy * 0.42 + dx * 0.05, tx, ty);
    ctx.stroke();
    var dotR = (tips[i] === 8 || tips[i] === 4 ? 4.2 : 3.0) + (isFist ? 0.8 : 0);
    var dot = ctx.createRadialGradient(tx, ty, 0, tx, ty, dotR * 4.2);
    dot.addColorStop(0, 'rgba(255,255,255,0.92)');
    dot.addColorStop(0.32, primary);
    dot.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = dot;
    ctx.beginPath();
    ctx.arc(tx, ty, dotR * 4.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(px, py, isFist ? 7.2 : 5.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,' + (isFist ? 0.82 : 0.62).toFixed(3) + ')';
  ctx.fill();

  if (isPinch) {
    var t1 = lm[4], t2 = lm[8];
    ctx.strokeStyle = 'rgba(220,255,241,0.88)';
    ctx.lineWidth = 2.0;
    ctx.shadowColor = 'rgba(126,226,168,0.82)';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(t1.x * W, t1.y * H);
    ctx.lineTo(t2.x * W, t2.y * H);
    ctx.stroke();
  }
  ctx.restore();
}

// 每帧调用 — 应用惯性旋转 + handActive 衰减
function tickGestureRotation(dt) {
  if (Math.abs(particleSpin.vx) > 0.0001 || Math.abs(particleSpin.vy) > 0.0001) {
    var rx = particleSpin.vx * dt;
    var ry = particleSpin.vy * dt;
    gestureRotation.x += rx;
    gestureRotation.y += ry;
    rebaseParticleRotationIfNeeded();
  }
  particleSpin.vx *= Math.pow(particleSpin.damping, dt * 60);
  particleSpin.vy *= Math.pow(particleSpin.damping, dt * 60);
  if (Math.abs(particleSpin.vx) < 0.01) particleSpin.vx = 0;
  if (Math.abs(particleSpin.vy) < 0.01) particleSpin.vy = 0;
  gestureGrip.value += (gestureGrip.target - gestureGrip.value) * (gestureGrip.target > gestureGrip.value ? 0.18 : 0.10);
  gestureGrip.pulse *= Math.pow(0.84, dt * 60);
  if (uniforms.uGestureGrip) uniforms.uGestureGrip.value = clampRange(gestureGrip.value + gestureGrip.pulse * 0.16, 0, 1);
  // hand active 自然衰减 (无手时)
  if (gestureActive && handLmSmooth && performance.now() - handLmLastSeen > 200) {
    uniforms.uHandActive.value *= 0.94;
    gestureGrip.target *= 0.92;
    if (uniforms.uHandActive.value < 0.02) uniforms.uHandActive.value = 0;
  }
}

function showGestureHUD(label, progress, detail) {
  var hud = document.getElementById('gesture-hud');
  if (!hud) return;
  var safeLabel = label || '待命';
  var safeDetail = detail || '将手放进摄像头视野';
  var safeProgress = Math.max(0, Math.min(100, (progress || 0) * 100));
  var signature = safeLabel + '|' + safeDetail + '|' + Math.round(safeProgress / 2);
  var now = performance.now();
  if (signature === gestureLastHudSignature && now - gestureLastHudAt < 100) return;
  gestureLastHudSignature = signature;
  gestureLastHudAt = now;
  document.getElementById('gesture-label').textContent = safeLabel;
  document.getElementById('gesture-confirm').textContent = safeDetail;
  var fill = document.getElementById('gesture-fill');
  if (fill) fill.style.width = safeProgress + '%';
  hud.classList.add('show');
}
function showGestureCursor() { }  // stub: 兼容旧调用
function hideGestureCursor() { }  // stub: 兼容旧调用


// ============================================================
//  Resize / 快捷键
