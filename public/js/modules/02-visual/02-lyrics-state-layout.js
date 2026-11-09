// ============================================================
var stageLyrics = {
  group: null,
  current: null,
  outgoing: [],
  currentIdx: -1,
  currentText: '',
  highBloom: 0,
  beatGlow: 0,
  glowFollowX: 0,
  glowFollowY: 0,
  glowFollowRoll: 0,
  palette: {
    primary: '#d6f8ff',
    secondary: '#9cffdf',
    highlight: '#eef7ff',
    shadow: 'rgba(2,8,12,0.42)',
    glow: 'rgba(143,233,255,0.34)',
  },
  coverPalette: {
    primary: '#d6f8ff',
    secondary: '#9cffdf',
    highlight: '#eef7ff',
    shadow: 'rgba(2,8,12,0.42)',
    glow: 'rgba(143,233,255,0.34)',
  },
  starRiver: null,
  starRiverWidth: 4.2,
  starRiverHeight: 0.58,
  lockFitScale: 1,
  snapCameraLockFrames: 0,
  transitionLineStep: 0,
  currentDisplayKey: '',
  currentPayload: null,
};
var lyricSunColor = new THREE.Color(0xffe6a4);
var lyricSunHotColor = new THREE.Color(0xfff4cc);
var lyricCameraDir = new THREE.Vector3();
var lyricCameraRight = new THREE.Vector3();
var lyricCameraUp = new THREE.Vector3();
var lyricCameraTarget = new THREE.Vector3();
var lyricLayoutBase = new THREE.Vector3();
var lyricLayoutTarget = new THREE.Vector3();
var lyricCoverWorldPos = new THREE.Vector3();
var lyricCoverWorldQuat = new THREE.Quaternion();
var lyricBaseEuler = new THREE.Euler(0, 0, 0, 'YXZ');
var lyricTiltEuler = new THREE.Euler(0, 0, 0, 'YXZ');
var lyricBaseQuat = new THREE.Quaternion();
var lyricTiltQuat = new THREE.Quaternion();
var lyricTargetQuat = new THREE.Quaternion();
var LYRIC_CAMERA_LOCK_MAX_SCALE = 0.80;
function setStageLyricViewBasisFromCameraOrQuaternion(fallbackQuat) {
  if (fallbackQuat) {
    lyricCameraDir.set(0, 0, 1).applyQuaternion(fallbackQuat);
    lyricCameraRight.set(1, 0, 0).applyQuaternion(fallbackQuat);
    lyricCameraUp.set(0, 1, 0).applyQuaternion(fallbackQuat);
  } else if (camera) {
    camera.getWorldDirection(lyricCameraDir);
    lyricCameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    lyricCameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  } else {
    lyricCameraDir.set(0, 0, 1);
    lyricCameraRight.set(1, 0, 0);
    lyricCameraUp.set(0, 1, 0);
  }
  lyricCameraDir.normalize();
  lyricCameraRight.normalize();
  lyricCameraUp.normalize();
}
function applyStageLyricLayoutOffset(target, x, y, z) {
  return target
    .addScaledVector(lyricCameraRight, x || 0)
    .addScaledVector(lyricCameraUp, y || 0)
    .addScaledVector(lyricCameraDir, z || 0);
}
function stageLyricTargetQuaternion(baseQuat, tiltX, tiltY) {
  lyricTiltEuler.set((tiltX || 0) * Math.PI / 180, (tiltY || 0) * Math.PI / 180, 0, 'YXZ');
  lyricTiltQuat.setFromEuler(lyricTiltEuler);
  return lyricTargetQuat.copy(baseQuat || lyricBaseQuat).multiply(lyricTiltQuat);
}
function getStageLyricLockBounds() {
  var maxW = 0, maxH = 0;
  function take(mesh) {
    if (!mesh || !mesh.userData || !mesh.userData.lyric) return;
    var d = mesh.userData.lyric;
    var meshScale = Math.max(mesh.scale && isFinite(mesh.scale.x) ? mesh.scale.x : 1, mesh.scale && isFinite(mesh.scale.y) ? mesh.scale.y : 1);
    maxW = Math.max(maxW, (d.textWorldW || d.worldW || 6.1) * meshScale);
    maxH = Math.max(maxH, (d.textWorldH || d.worldH || 1.0) * meshScale);
  }
  take(stageLyrics.current);
  for (var i = 0; i < stageLyrics.outgoing.length; i++) take(stageLyrics.outgoing[i]);
  return { w: maxW || 5.4, h: maxH || 0.78 };
}
function lyricCameraLockFit(layoutScale, layoutX, layoutY, distance) {
  if (!camera || !camera.isPerspectiveCamera) return 1;
  layoutScale = Math.max(0.1, layoutScale || 1);
  var fov = (camera.fov || 45) * Math.PI / 180;
  var dist = Math.max(1.4, distance || 4.85);
  var visibleH = 2 * Math.tan(fov * 0.5) * dist;
  var visibleW = visibleH * (camera.aspect || (innerWidth / Math.max(1, innerHeight)) || 1.78);
  var bounds = getStageLyricLockBounds();
  var skullSafe = !!(fx && fx.preset === SKULL_PRESET_INDEX);
  var safeW = Math.max(visibleW * (skullSafe ? 0.36 : 0.42), visibleW * (skullSafe ? 0.70 : 0.84) - Math.abs(layoutX || 0) * (skullSafe ? 1.36 : 1.22));
  var safeH = Math.max(visibleH * (skullSafe ? 0.16 : 0.18), visibleH * (skullSafe ? 0.34 : 0.44) - Math.abs(layoutY || 0) * (skullSafe ? 0.98 : 0.82));
  var scaledW = Math.max(0.01, bounds.w * layoutScale);
  var scaledH = Math.max(0.01, bounds.h * layoutScale);
  var viewportFit = Math.min(1, safeW / scaledW, safeH / scaledH);
  var lockScaleCap = Math.min(1, (skullSafe ? 0.94 : LYRIC_CAMERA_LOCK_MAX_SCALE) / layoutScale);
  return clampRange(Math.min(viewportFit, lockScaleCap), skullSafe ? 0.36 : 0.42, 1);
}
// 兼容旧变量名以便其它代码不破坏
