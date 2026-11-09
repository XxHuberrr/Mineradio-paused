function unlockCenteredView() {
  orbit.centerLocked = false;
}

function clearCenteredViewOffsets() {
  pointerTarget.x = 0;
  pointerTarget.y = 0;
  pointerParallax.x = 0;
  pointerParallax.y = 0;
  mouseWorld.set(-999, -999, 0);
  mouseActive = false;
  headParallax.x = 0;
  headParallax.y = 0;
  headParallax.active = false;
  headNeutral = null;
  if (typeof gestureRotation !== 'undefined') {
    gestureRotation.x = 0;
    gestureRotation.y = 0;
  }
  if (typeof particleSpin !== 'undefined') {
    particleSpin.vx = 0;
    particleSpin.vy = 0;
  }
  if (typeof pinchState !== 'undefined') pinchState.active = false;
  if (typeof particlePointerSpin !== 'undefined') particlePointerSpin.active = false;
  if (typeof resetParticleRotationTarget === 'function') resetParticleRotationTarget(false);
  if (typeof uniforms !== 'undefined' && uniforms.uHandActive) {
    uniforms.uHandActive.value = 0;
    uniforms.uHandXY.value.set(-999, -999);
    if (uniforms.uGestureGrip) uniforms.uGestureGrip.value = 0;
  }
}

function updateCamera() {
  if (applyFreeCameraToCamera()) return;
  if (orbit.recentering) {
    var recenterThetaDelta = shortestAngleDelta(orbit.userTheta, orbit.baselineTheta);
    var recenterPhiDelta = orbit.baselinePhi - orbit.userPhi;
    var recenterRadiusDelta = orbit.baselineRadius - orbit.userRadius;
    var recenterDistance = Math.sqrt(
      recenterThetaDelta * recenterThetaDelta +
      recenterPhiDelta * recenterPhiDelta +
      Math.pow(recenterRadiusDelta / Math.max(1, orbit.baselineRadius), 2)
    );
    var recenterEase = clampRange(0.050 + recenterDistance * 0.080, 0.052, 0.135);
    orbit.userTheta += recenterThetaDelta * recenterEase;
    orbit.userPhi += recenterPhiDelta * recenterEase;
    orbit.userRadius += recenterRadiusDelta * recenterEase;
    var visualThetaTarget = orbit.baselineTheta + orbit.cineTheta;
    var visualPhiTarget = Math.max(orbit.minPhi, Math.min(orbit.maxPhi, orbit.baselinePhi + orbit.cinePhi));
    var visualRadiusTarget = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.baselineRadius + orbit.cineRadius));
    var visualSettled = Math.abs(shortestAngleDelta(orbit.theta, visualThetaTarget)) < 0.0016 &&
      Math.abs(orbit.phi - visualPhiTarget) < 0.0016 &&
      Math.abs(orbit.radius - visualRadiusTarget) < 0.018;
    var recenterTimedOut = orbit.recenterStartedAt && performance.now() - orbit.recenterStartedAt > 1800;
    if (Math.abs(recenterThetaDelta) < 0.0012 &&
      Math.abs(recenterPhiDelta) < 0.0012 &&
      Math.abs(recenterRadiusDelta) < 0.014 &&
      (visualSettled || recenterTimedOut)) {
      settleOrbitRecenterTarget();
    }
  }

  // v8: focus 优先, 否则用 user + cine 复合姿态
  var fa = orbit.focus.active;
  var fa = orbit.focus.active;
  var targetTheta, targetPhi, targetRadius, tLookAt;
  if (fa) {
    targetTheta = orbit.focus.theta;
    targetPhi = orbit.focus.phi;
    targetRadius = orbit.focus.radius;
    tLookAt = orbit.focus.lookAt;
  } else if (orbit.centerLocked) {
    targetTheta = orbit.baselineTheta + orbit.cineTheta;
    targetPhi = Math.max(orbit.minPhi, Math.min(orbit.maxPhi, orbit.baselinePhi + orbit.cinePhi));
    targetRadius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.baselineRadius + orbit.cineRadius));
    tLookAt = ZERO_VEC;
  } else {
    targetTheta = orbit.userTheta + orbit.cineTheta;
    targetPhi = Math.max(orbit.minPhi, Math.min(orbit.maxPhi, orbit.userPhi + orbit.cinePhi));
    targetRadius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.userRadius + orbit.cineRadius));
    tLookAt = ZERO_VEC;
  }
  // 丝滑变速: 线性 lerp 自然给出 "快→慢" 缓出曲线
  var focusEase = fa ? 0.16 : 0.10;
  var radiusEase = fa ? 0.12 : 0.07;
  var shelfFocusType = /^shelf-/.test(String(orbit.focus.type || ''));
  if (beatCam.punch > 0.01) {
    focusEase = Math.max(focusEase, 0.12 + beatCam.punch * 0.12);
    radiusEase = Math.max(radiusEase, 0.09 + beatCam.punch * 0.12);
  }
  if (!fa && !shelfFocusType && typeof readSonicLyricLookAtTarget === 'function' && typeof SONIC_CAMERA_LYRIC_LOOK_AT !== 'undefined' && readSonicLyricLookAtTarget(SONIC_CAMERA_LYRIC_LOOK_AT)) {
    tLookAt = SONIC_CAMERA_LYRIC_LOOK_AT;
    focusEase = Math.max(focusEase, 0.115);
    radiusEase = Math.max(radiusEase, 0.082);
  }
  if (shelfFocusType) {
    var shelfFocusWanted = typeof focusHover !== 'undefined' && focusHover ? focusHover.wantType : null;
    var shelfFocusMovingIn = fa;
    var shelfFocusMovingOut = !fa && !shelfFocusWanted;
    if (shelfFocusMovingIn || shelfFocusMovingOut) {
      var shelfMotion = shelfSummonSettings();
      var shelfCameraSpeed = shelfFocusMovingIn ? shelfMotion.cameraEnterSpeed : shelfMotion.cameraExitSpeed;
      focusEase = clampRange(focusEase * shelfCameraSpeed, 0.018, 0.42);
      radiusEase = clampRange(radiusEase * shelfCameraSpeed, 0.014, 0.36);
    }
  }
  orbit.theta += (targetTheta - orbit.theta) * focusEase;
  orbit.phi += (targetPhi - orbit.phi) * focusEase;
  orbit.radius += (targetRadius - orbit.radius) * radiusEase;
  orbit.lookAt.x += (tLookAt.x - orbit.lookAt.x) * focusEase;
  orbit.lookAt.y += (tLookAt.y - orbit.lookAt.y) * focusEase;
  orbit.lookAt.z += (tLookAt.z - orbit.lookAt.z) * focusEase;
  if (shelfFocusType && !fa) {
    var shelfFocusLookDx = tLookAt.x - orbit.lookAt.x;
    var shelfFocusLookDy = tLookAt.y - orbit.lookAt.y;
    var shelfFocusLookDz = tLookAt.z - orbit.lookAt.z;
    if (Math.abs(shortestAngleDelta(orbit.theta, targetTheta)) < 0.003 &&
      Math.abs(orbit.phi - targetPhi) < 0.003 &&
      Math.abs(orbit.radius - targetRadius) < 0.030 &&
      shelfFocusLookDx * shelfFocusLookDx + shelfFocusLookDy * shelfFocusLookDy + shelfFocusLookDz * shelfFocusLookDz < 0.0009) {
      orbit.focus.type = null;
    }
  }

  var cy = Math.cos(orbit.phi), sy = Math.sin(orbit.phi);
  var ct = Math.cos(orbit.theta), st = Math.sin(orbit.theta);
  camera.position.set(
    orbit.lookAt.x + orbit.radius * cy * st,
    orbit.lookAt.y + orbit.radius * sy,
    orbit.lookAt.z + orbit.radius * cy * ct
  );
  camera.lookAt(orbit.lookAt);
  var cameraShake = clampRange(Number(fx.cinemaShake) || 0, 0, 1.8);
  camera.rotation.z += beatCam.rollKick * cameraShake;

  var cameraPunch = Math.max(camPunch * 0.55, beatCam.punch * 0.54 + beatCam.radiusKick * 0.16) * cameraShake;
  var targetFOV = BASE_FOV - cameraPunch * (djMode.active ? 2.62 : 2.35);
  var fovEase = targetFOV < camera.fov ? 0.24 : 0.12;
  camera.fov += (targetFOV - camera.fov) * fovEase;
  camera.updateProjectionMatrix();
  camPunch *= 0.86;
}

// 焦点跟拍 (hover 0.5s 后镜头移到目标)
var focusHover = { wantType: null, pendingTimer: null, exitTimer: null };
function shouldUseWallpaperSafeShelfCamera() {
  return !!(fx && Number(fx.preset) === 5);
}
function shouldUseSkullSafeShelfCamera() {
  return !!(fx && Number(fx.preset) === SKULL_PRESET_INDEX);
}
function shouldUseWallpaperLyricCameraLock() {
  return !!(fx && Number(fx.preset) === 5 && fx.lyricCameraLock);
}
function requestStageLyricCameraSnap(frames) {
  if (typeof stageLyrics === 'undefined' || !stageLyrics) return;
  stageLyrics.snapCameraLockFrames = Math.max(stageLyrics.snapCameraLockFrames || 0, frames || 8);
}
function shouldDimWallpaperForShelf() {
  if (!shouldUseWallpaperSafeShelfCamera()) return false;
  if (!shelfManager || !shelfManager.getMode || shelfManager.getMode() !== 'side') return false;
  if (shelfPinnedOpen) return true;
  return !!(shelfManager.hasOpenContent && shelfManager.hasOpenContent());
}
function shouldOffsetLyricsForShelfDetail() {
  if (!shelfManager || !shelfManager.getMode || shelfManager.getMode() !== 'side') return false;
  return !!(shelfManager.hasOpenContent && shelfManager.hasOpenContent());
}
function shouldAvoidStageLyricsForShelf() {
  if (!shelfManager || !shelfManager.getMode || shelfManager.getMode() !== 'side') return false;
  if (shelfAlwaysVisible()) return true;
  if (shelfPinnedOpen) return true;
  if (shelfManager.hasOpenContent && shelfManager.hasOpenContent()) return true;
  return !!(shelfVisibility > 0.24 || (shelfHoverCue && shelfHoverCue.value > 0.28));
}
function activateFocusZone(type) {
  unlockCenteredView();
  orbit.focus.active = true;
  orbit.focus.type = type;
  var shelfProfile = shelfLayoutProfile();
  if (type === 'shelf-side') {
    if (shouldUseWallpaperSafeShelfCamera()) {
      orbit.focus.theta = shelfProfile.portrait ? 0.18 : 0.24;
      orbit.focus.phi = shelfProfile.portrait ? 0.00 : 0.02;
      orbit.focus.radius = shelfProfile.portrait ? 5.74 : 5.32;
      orbit.focus.lookAt.set(shelfProfile.portrait ? 1.04 : 2.24, -0.08, 0.78);
      camPunch = Math.max(camPunch, 0.28);
      requestStageLyricCameraSnap(10);
    } else {
      // 侧栏 (右): 近一点、侧一点，让歌单架打开时有明确的镜头推近。
      orbit.focus.theta = shelfProfile.portrait ? 0.24 : 0.42;
      orbit.focus.phi = shelfProfile.portrait ? -0.06 : -0.12;
      orbit.focus.radius = shelfProfile.portrait ? 5.28 : 4.20;
      orbit.focus.lookAt.set(shelfProfile.portrait ? 1.08 : 2.32, shelfProfile.portrait ? -0.18 : -0.10, 0.72);
      camPunch = Math.max(camPunch, 0.82);
    }
  } else if (type === 'shelf-detail') {
    if (shouldUseWallpaperSafeShelfCamera()) {
      orbit.focus.theta = shelfProfile.portrait ? 0.16 : 0.26;
      orbit.focus.phi = shelfProfile.portrait ? -0.02 : 0.02;
      orbit.focus.radius = shelfProfile.portrait ? 5.88 : 5.18;
      orbit.focus.lookAt.set(shelfProfile.portrait ? 0.72 : 2.28, shelfProfile.portrait ? -0.36 : -0.32, 0.84);
      camPunch = Math.max(camPunch, 0.30);
      requestStageLyricCameraSnap(10);
    } else {
      orbit.focus.theta = shelfProfile.portrait ? 0.16 : 0.34;
      orbit.focus.phi = shelfProfile.portrait ? -0.03 : -0.06;
      orbit.focus.radius = shelfProfile.portrait ? 5.90 : 4.86;
      orbit.focus.lookAt.set(shelfProfile.portrait ? 0.62 : 1.74, shelfProfile.portrait ? -0.08 : 0.02, 0.82);
      camPunch = Math.max(camPunch, 0.38);
    }
  } else if (type === 'shelf-stage') {
    // 舞台: 居中仰拍
    orbit.focus.theta = 0.0;
    orbit.focus.phi = shelfProfile.portrait ? -0.24 : -0.32;
    orbit.focus.radius = shelfProfile.portrait ? 4.8 : 3.8;
    orbit.focus.lookAt.set(0, shelfProfile.portrait ? -1.86 : -1.7, 0.8);
  } else if (type === 'queue') {
    // 队列在左侧 HTML 面板, 相机微微左移 + 抬升
    orbit.focus.theta = 0.40;
    orbit.focus.phi = 0.05;
    orbit.focus.radius = 5.8;
    orbit.focus.lookAt.set(-1.2, 0, 0);
  }
}
function setFocusZone(type, immediate) {
  if (type && !shouldUseShelfDynamicCamera(type)) {
    if (/^shelf-/.test(String(orbit.focus.type || ''))) orbit.focus.active = false;
    type = null;
  }
  if (focusHover.wantType === type) {
    if (type === 'queue' && immediate) {
      if (focusHover.exitTimer) { clearTimeout(focusHover.exitTimer); focusHover.exitTimer = null; }
      if (focusHover.pendingTimer) { clearTimeout(focusHover.pendingTimer); focusHover.pendingTimer = null; }
      if (!orbit.focus.active || orbit.focus.type !== type) activateFocusZone(type);
    }
    return;
  }
  focusHover.wantType = type;
  if (focusHover.pendingTimer) { clearTimeout(focusHover.pendingTimer); focusHover.pendingTimer = null; }
  if (focusHover.exitTimer) { clearTimeout(focusHover.exitTimer); focusHover.exitTimer = null; }
  if (!type) {
    // 立刻退出 focus, 让相机回主姿态 (但插值是平滑的)
    var exitDelay = orbit.focus.type === 'queue' ? PEEK_HIDE_DELAY : 120;
    focusHover.exitTimer = setTimeout(function () {
      focusHover.exitTimer = null;
      if (!focusHover.wantType) orbit.focus.active = false;
    }, exitDelay);
    return;
  }
  if (immediate) {
    activateFocusZone(type);
    return;
  }
  // 延迟 500ms 激活
  focusHover.pendingTimer = setTimeout(function () {
    focusHover.pendingTimer = null;
    if (focusHover.wantType !== type) return;
    activateFocusZone(type);
  }, 260);
}

// 电影镜头 v8: 振幅大幅减小, 节拍 punch 加冷却 + 强度门槛
//   - cineTheta/Phi 是非常缓慢的低频漂移, 不再让人 motion sick
//   - punch zoom 只在 真·强主拍 触发, 至少间隔 0.45s, 振幅 ×0.5
var lastCamPunchAt = -10;
var CAM_PUNCH_MIN_INTERVAL = 0.45;     // 秒
var CAM_PUNCH_BEAT_THRESHOLD = 0.55;   // 必须够强才触发
function updateCinema(dt) {
  cinemaT += dt;
  updateBeatCamera(dt);
  if (!fx.cinema) {
    orbit.cineTheta *= 0.95;
    orbit.cinePhi *= 0.95;
    orbit.cineRadius *= 0.95;
    return;
  }
  var damp = orbit.rotating ? 0.25 : 1.0;
  // v8: 振幅减半, 周期更长 (更优雅)
  var dj = djMode.active;
  var shake = clampRange(Number(fx.cinemaShake) || 0, 0, 1.8);
  var beatDamp = (orbit.focus.active ? (dj ? 0.66 : 0.55) : (dj ? 1.12 : 1.0)) * shake;
  var idleDamp = damp * (dj ? 0.72 : 1.0) * shake;
  orbit.cineTheta = Math.sin(cinemaT * 0.08) * 0.012 * idleDamp + beatCam.thetaKick * beatDamp;
  orbit.cinePhi = Math.sin(cinemaT * 0.06 + 1.0) * 0.010 * idleDamp + beatCam.phiKick * beatDamp;
  orbit.cineRadius = Math.sin(cinemaT * 0.04 + 2.0) * 0.080 * idleDamp - beatCam.radiusKick * beatDamp * (dj ? 1.22 : 1.18);
}
updateCamera();

function recenterCamera() {
  orbit.centerLocked = true;
  orbit.recentering = true;
  orbit.recenterStartedAt = performance.now();
  dampCameraImpulseForRecenter(0.32);
  clearCenteredViewOffsets();
  if (typeof skullWheelZoomTarget !== 'undefined') {
    skullWheelZoomTarget = 0;
    if (!(fx && fx.preset === SKULL_PRESET_INDEX)) skullWheelZoom = 0;
  }
  // 同时解除任何镜头跟拍
  if (focusHover) {
    focusHover.wantType = null;
    if (focusHover.pendingTimer) { clearTimeout(focusHover.pendingTimer); focusHover.pendingTimer = null; }
    if (focusHover.exitTimer) { clearTimeout(focusHover.exitTimer); focusHover.exitTimer = null; }
  }
  orbit.focus.active = false;
  if (fx && fx.preset === SKULL_PRESET_INDEX) {
    resetSkullPresetView(false, { smooth: true, keepLyricLock: true });
  } else {
    resetSkullPresetView(true);
  }
  if (!(fx && fx.preset === SKULL_PRESET_INDEX) && ((fx && fx.lyricCameraLock) || shouldUseWallpaperLyricCameraLock())) requestStageLyricCameraSnap(14);
  showToast('视角回正');
}
