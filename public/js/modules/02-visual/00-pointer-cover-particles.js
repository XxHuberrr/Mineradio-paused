// ============================================================
var mouseWorld = new THREE.Vector3(-999, -999, 0);
var mouseActive = false;
var mouseDownAt = { x: 0, y: 0, t: 0, hadDrag: false };
var particlePointerSpin = { active: false, lastX: 0, lastY: 0, lastT: 0 };
var particlePointerRay = new THREE.Raycaster();
var particlePointerNdc = new THREE.Vector2();
var particlePointerPlane = new THREE.Plane();
var particlePointerPlanePoint = new THREE.Vector3();
var particlePointerPlaneNormal = new THREE.Vector3();
var particlePointerWorldHit = new THREE.Vector3();
var particlePointerLocalHit = new THREE.Vector3();
var particlePointerQuat = new THREE.Quaternion();
var particlePointerFrame = { dirty: false, ndcX: 0, ndcY: 0 };
var CLICK_THRESHOLD = 6;  // 像素, 拖动 > 6px 视为 drag
var UI_HIT_SELECTOR = '#search-area,#upload-panel,#top-right,#fullscreen-diy-zone,#fx-panel,#fx-fab,#fx-fab-hide-btn,#playlist-panel,#bottom-bar,#thumb-wrap,#empty-home,#visual-guide,#trial-banner,#source-fallback-notice,.modal-mask,#toast,#ai-depth-chip,#beat-chip,#drop-overlay';

function isPointerOverUi(e) {
  if (!e) return false;
  var el = document.elementFromPoint(e.clientX, e.clientY);
  return !!(el && el.closest && el.closest(UI_HIT_SELECTOR));
}

function particleLocalPointFromNdc(ndcX, ndcY, out) {
  particlePointerNdc.set(ndcX, ndcY);
  particlePointerRay.setFromCamera(particlePointerNdc, camera);
  if (particles) {
    particles.updateMatrixWorld(true);
    particles.getWorldPosition(particlePointerPlanePoint);
    particles.getWorldQuaternion(particlePointerQuat);
    particlePointerPlaneNormal.set(0, 0, 1).applyQuaternion(particlePointerQuat).normalize();
    if (Math.abs(particlePointerPlaneNormal.dot(particlePointerRay.ray.direction)) < 0.16) return false;
    particlePointerPlane.setFromNormalAndCoplanarPoint(particlePointerPlaneNormal, particlePointerPlanePoint);
    if (particlePointerRay.ray.intersectPlane(particlePointerPlane, particlePointerWorldHit)) {
      out.copy(particlePointerWorldHit);
      particles.worldToLocal(out);
      return isFinite(out.x) && isFinite(out.y) && Math.abs(out.x) < 8.5 && Math.abs(out.y) < 8.5;
    }
  }
  particlePointerPlaneNormal.set(0, 0, 1);
  particlePointerPlane.set(particlePointerPlaneNormal, 0);
  if (particlePointerRay.ray.intersectPlane(particlePointerPlane, particlePointerWorldHit)) {
    out.copy(particlePointerWorldHit);
    return isFinite(out.x) && isFinite(out.y) && Math.abs(out.x) < 8.5 && Math.abs(out.y) < 8.5;
  }
  return false;
}

function queueParticlePointerFrame(clientX, clientY) {
  var mx = (clientX / innerWidth) * 2 - 1;
  var my = -(clientY / innerHeight) * 2 + 1;
  pointerTarget.x = mx; pointerTarget.y = my;
  particlePointerFrame.ndcX = mx;
  particlePointerFrame.ndcY = my;
  particlePointerFrame.dirty = true;
}

function updateParticlePointerFrame() {
  if (!particlePointerFrame.dirty) return;
  particlePointerFrame.dirty = false;
  if (particleLocalPointFromNdc(particlePointerFrame.ndcX, particlePointerFrame.ndcY, particlePointerLocalHit)) {
    mouseWorld.x = particlePointerLocalHit.x;
    mouseWorld.y = particlePointerLocalHit.y;
    mouseActive = true;
  } else {
    mouseWorld.set(-999, -999, 0);
    mouseActive = false;
  }
}

function beginParticlePointerDrag(e) {
  if (e.button === 2) return;
  if (isPointerOverUi(e)) return;
  markRenderInteraction('canvas-drag', 1200);
  idleGuidePointerDown(e);
  orbit.rotating = true; orbit.last.x = e.clientX; orbit.last.y = e.clientY;
  particlePointerSpin.active = true;
  particlePointerSpin.lastX = e.clientX;
  particlePointerSpin.lastY = e.clientY;
  particlePointerSpin.lastT = performance.now();
  if (typeof particleSpin !== 'undefined') particleSpin.vx = particleSpin.vy = 0;
  mouseDownAt.x = e.clientX; mouseDownAt.y = e.clientY;
  mouseDownAt.t = performance.now(); mouseDownAt.hadDrag = false;
}
renderer.domElement.addEventListener('mousedown', function (e) {
  if (freeCamera && freeCamera.active) {
    if (typeof requestFreeCameraPointerLock === 'function') requestFreeCameraPointerLock('canvas-mousedown');
    e.preventDefault();
    return;
  }
  beginParticlePointerDrag(e);
});
window.addEventListener('mousedown', function (e) {
  if (!(fx && fx.preset === SKULL_PRESET_INDEX)) return;
  if (orbit.rotating || e.target === renderer.domElement) return;
  beginParticlePointerDrag(e);
}, true);
window.addEventListener('mousemove', function (e) {
  updateControlsAutoHideFromPointer(e.clientX, e.clientY);
  idleGuidePointerMove(e);
  if (freeCamera && freeCamera.active) {
    markRenderInteraction('free-camera', 900);
    var pointerLocked = typeof freeCameraPointerLockActive === 'function' && freeCameraPointerLockActive();
    if (!pointerLocked && typeof requestFreeCameraPointerLock === 'function') requestFreeCameraPointerLock('mousemove');
    var mdx = e.movementX || 0;
    var mdy = e.movementY || 0;
    if (!pointerLocked && (!mdx && !mdy) && freeCameraPointer.seen) {
      mdx = e.clientX - freeCameraPointer.x;
      mdy = e.clientY - freeCameraPointer.y;
    }
    freeCameraPointer.x = e.clientX;
    freeCameraPointer.y = e.clientY;
    freeCameraPointer.seen = true;
    freeCamera.yaw -= mdx * 0.00125;
    freeCamera.pitch = clampRange(freeCamera.pitch - mdy * 0.00125, -Math.PI * 0.49, Math.PI * 0.49);
    return;
  }
  if (isPointerOverUi(e) && !orbit.rotating) { mouseActive = false; return; }
  if (orbit.rotating) {
    markRenderInteraction('canvas-drag', 900);
    unlockCenteredView();
    var dx = e.clientX - orbit.last.x, dy = e.clientY - orbit.last.y;
    if (particlePointerSpin.active) {
      var nowSpin = performance.now();
      var spinDt = Math.max(1 / 120, Math.min(0.08, (nowSpin - particlePointerSpin.lastT) / 1000 || 1 / 60));
      applyParticleSpinDrag(dx, dy, spinDt);
      particlePointerSpin.lastX = e.clientX;
      particlePointerSpin.lastY = e.clientY;
      particlePointerSpin.lastT = nowSpin;
    }
    orbit.last.x = e.clientX; orbit.last.y = e.clientY;
    // drag 距离判断
    var totalDx = e.clientX - mouseDownAt.x, totalDy = e.clientY - mouseDownAt.y;
    if (Math.sqrt(totalDx * totalDx + totalDy * totalDy) > CLICK_THRESHOLD) mouseDownAt.hadDrag = true;
    if (orbit.recentering) orbit.recentering = false;
  }
  queueParticlePointerFrame(e.clientX, e.clientY);
});
window.addEventListener('mouseup', function (e) {
  orbit.rotating = false;
  particlePointerSpin.active = false;
  idleGuidePointerUp();
  if (window.MineradioSonicTopography && MineradioSonicTopography.isActive(fx) && !mouseDownAt.hadDrag && !isPointerOverUi(e)) {
    var pressMs = Math.max(0, performance.now() - (mouseDownAt.t || 0));
    var strength = Math.min(0.25 + (pressMs / 1000) * 2.6, 3.0);
    var nx = (e.clientX / Math.max(1, innerWidth) - 0.5) * 34;
    var nz = (0.5 - e.clientY / Math.max(1, innerHeight)) * 34;
    MineradioSonicTopography.pointerRipple(nx, nz, strength);
  }
});
renderer.domElement.addEventListener('mouseleave', function () {
  particlePointerFrame.dirty = false;
  mouseWorld.set(-999, -999, 0);
  mouseActive = false;
  idleGuidePointerLeave();
});
renderer.domElement.addEventListener('wheel', function (e) {
  if (isPointerOverUi(e)) return;
  e.preventDefault();
  markRenderInteraction('canvas-wheel', 900);
  if (freeCamera && freeCamera.active) {
    freeCamera.fov = clampRange((freeCamera.fov || BASE_FOV) + e.deltaY * 0.018, 26, 72);
    saveFreeCameraState();
    return;
  }
  if (fx && fx.preset === SKULL_PRESET_INDEX && typeof skullWheelZoomTarget !== 'undefined') {
    skullWheelZoomTarget = clampRange(skullWheelZoomTarget + e.deltaY * 0.00155, -0.95, 1.28);
    return;
  }
  idleGuideWheel(e);
  unlockCenteredView();
  orbit.userRadius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.userRadius + e.deltaY * 0.005));
  if (orbit.recentering) orbit.recentering = false;
}, { passive: false });

// 双击屏幕回正 — 不命中卡片时
renderer.domElement.addEventListener('dblclick', function (e) {
  if (isPointerOverUi(e)) return;
  if (freeCamera && freeCamera.locked) {
    resetFreeCameraToDefault();
    resetSkullPresetView(false, { smooth: true, keepLyricLock: true });
    return;
  }
  if (shelfManager && shelfManager.getMode() !== 'off') {
    var mx = (e.clientX / innerWidth) * 2 - 1;
    var my = -(e.clientY / innerHeight) * 2 + 1;
    var rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(mx, my), camera);
    if (shelfManager.raycastCards(rc)) return;
  }
  recenterCamera();
});

// ============================================================
//  粒子点纹理 (干净圆点, 无 glow)
// ============================================================
function makeDotTexture() {
  var cv = document.createElement('canvas'); cv.width = cv.height = 64;
  var ctx = cv.getContext('2d');
  var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
  g.addColorStop(0.00, 'rgba(255,255,255,0.96)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.78)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.22)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  var tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  return tex;
}
var dotTexture = makeDotTexture();

// ============================================================
//  主粒子系统
//   - 5 个 preset, 每个预设走完全不同的 pos 计算
//   - 共享: 封面色采样, 鼠标交互, 粒子大小限制
// ============================================================
var PLANE_SIZE = 4.8;
var RIPPLE_MAX = 12;

var GRID_X = coverParticleGridForResolution(fx.coverResolution), GRID_Y = GRID_X;
var PCOUNT = GRID_X * GRID_Y;
var positions = null, uvs = null, aRand = null;
var coverResolutionReloadTimer = null;
var currentCoverSource = null;
var coverPickerCanvas = null;

function buildCoverParticleGeometry(grid) {
  grid = coverParticleGridForResolution(grid / 118);
  var count = grid * grid;
  var nextGeo = new THREE.BufferGeometry();
  var nextPositions = new Float32Array(count * 3);
  var nextUvs = new Float32Array(count * 2);
  var nextRand = new Float32Array(count);
  var texelStep = 1 / grid;
  for (var i = 0; i < count; i++) {
    var gx = i % grid, gy = Math.floor(i / grid);
    var u = (gx + 0.5) * texelStep, v = (gy + 0.5) * texelStep;
    var px = gx / (grid - 1), py = gy / (grid - 1);
    nextPositions[i * 3] = (px - 0.5) * PLANE_SIZE;
    nextPositions[i * 3 + 1] = (py - 0.5) * PLANE_SIZE;
    nextPositions[i * 3 + 2] = 0;
    nextUvs[i * 2] = u;
    nextUvs[i * 2 + 1] = v;
    nextRand[i] = Math.random();
  }
  nextGeo.setAttribute('position', new THREE.BufferAttribute(nextPositions, 3));
  nextGeo.setAttribute('aUv', new THREE.BufferAttribute(nextUvs, 2));
  nextGeo.setAttribute('aRand', new THREE.BufferAttribute(nextRand, 1));
  nextGeo.userData.grid = grid;
  nextGeo.userData.count = count;
  positions = nextPositions;
  uvs = nextUvs;
  aRand = nextRand;
  return nextGeo;
}

var geo = buildCoverParticleGeometry(GRID_X);

function applyCoverParticleResolution(value, opts) {
  opts = opts || {};
  fx.coverResolution = normalizeCoverResolution(value);
  var grid = coverParticleGridForResolution(fx.coverResolution);
  if (grid === GRID_X && geo && geo.userData && geo.userData.grid === grid) return;
  var oldGeo = geo;
  var nextGeo = buildCoverParticleGeometry(grid);
  geo = nextGeo;
  GRID_X = GRID_Y = grid;
  PCOUNT = grid * grid;
  if (particles) particles.geometry = nextGeo;
  if (bloomParticles) bloomParticles.geometry = nextGeo;
  if (oldGeo && oldGeo !== nextGeo) oldGeo.dispose();
  uniforms.uBurstAmt.value = Math.max(uniforms.uBurstAmt.value, 0.18);
  if (opts.reload !== false) scheduleCoverResolutionReload();
}

function scheduleCoverResolutionReload() {
  if (!currentCoverSource || !currentCoverSource.src) return;
  if (coverResolutionReloadTimer) clearTimeout(coverResolutionReloadTimer);
  coverResolutionReloadTimer = setTimeout(function () {
    coverResolutionReloadTimer = null;
    if (!currentCoverSource || !currentCoverSource.src) return;
    if (currentCoverSource.kind === 'url') {
      loadCoverFromUrl(currentCoverSource.src, { trackToken: trackSwitchToken, fromResolutionChange: true });
    } else if (currentCoverSource.kind === 'data') {
      applyCoverDataUrl(currentCoverSource.src, { trackToken: trackSwitchToken, fromResolutionChange: true });
    }
  }, 260);
}

// 涟漪数据纹理 (1×N, RGBA: x, y, age, str)
var rippleData = new Float32Array(RIPPLE_MAX * 4);
var rippleTex = new THREE.DataTexture(rippleData, 1, RIPPLE_MAX, THREE.RGBAFormat, THREE.FloatType);
rippleTex.magFilter = THREE.NearestFilter; rippleTex.minFilter = THREE.NearestFilter;
var ripples = [];
for (var ri = 0; ri < RIPPLE_MAX; ri++) ripples.push({ x: 0, y: 0, age: -10, str: 0 });

// 封面纹理 + 边缘/深度纹理
var coverTex = new THREE.Texture();
coverTex.minFilter = THREE.LinearFilter; coverTex.magFilter = THREE.LinearFilter;
coverTex.wrapS = THREE.ClampToEdgeWrapping; coverTex.wrapT = THREE.ClampToEdgeWrapping;

var coverEdgeTex = new THREE.Texture();  // R=depth, G=edge, B=fg-mask, A=lum
coverEdgeTex.minFilter = THREE.LinearFilter; coverEdgeTex.magFilter = THREE.LinearFilter;

// 初始 1×1 像素
(function () {
  var c = document.createElement('canvas'); c.width = c.height = 4;
  var x = c.getContext('2d'); x.fillStyle = '#1c1c28'; x.fillRect(0, 0, 4, 4);
  coverTex.image = c; coverTex.needsUpdate = true;
  var d = document.createElement('canvas'); d.width = d.height = 4;
  var dx = d.getContext('2d'); dx.fillStyle = 'rgba(128,0,0,255)'; dx.fillRect(0, 0, 4, 4);
  coverEdgeTex.image = d; coverEdgeTex.needsUpdate = true;
})();

// 前一首封面纹理 (用于切歌渐变)
var prevCoverTex = new THREE.Texture();
prevCoverTex.minFilter = THREE.LinearFilter; prevCoverTex.magFilter = THREE.LinearFilter;
(function () {
  var c = document.createElement('canvas'); c.width = c.height = 4;
  var x = c.getContext('2d'); x.fillStyle = '#1c1c28'; x.fillRect(0, 0, 4, 4);
  prevCoverTex.image = c; prevCoverTex.needsUpdate = true;
})();

var uniforms = {
  uTime: { value: 0 },
  uBass: { value: 0 },
  uMid: { value: 0 },
  uTreble: { value: 0 },
  uBeat: { value: 0 },
  uEnergy: { value: 0 },
  uBurstAmt: { value: 0 },          // 通用预设切换脉冲 0..1
  uVinylSpin: { value: 0 },
  uPreset: { value: 0 },
  uIntensity: { value: 0.85 },
  uDepth: { value: 1.0 },
  uPointScale: { value: 1.0 },
  uSpeed: { value: 1.0 },
  uTwist: { value: 0 },
  uColorBoost: { value: 1.1 },
  uScatter: { value: 0 },
  uCoverRes: { value: 1.0 },
  uBgFade: { value: 0.20 },
  uBloomStrength: { value: 0.62 },
  uBloomSize: { value: 2.65 },
  uTintColor: { value: new THREE.Color('#9db8cf') },
  uTintStrength: { value: 0 },
  uCoverTex: { value: coverTex },
  uPrevCoverTex: { value: prevCoverTex },
  uColorMixT: { value: 1.0 },        // 0=显示旧封面 → 1=显示新封面
  uEdgeTex: { value: coverEdgeTex },
  uRippleTex: { value: rippleTex },
  uRippleCount: { value: 0 },
  uDotTex: { value: dotTexture },
  uHasCover: { value: 0 },
  uHasDepth: { value: 0 },
  uEdgeEnabled: { value: 1 },
  uAiBoost: { value: 0 },          // AI 深度增益, 当 AI 接管时升至 1
  uMouseXY: { value: new THREE.Vector2(-999, -999) },
  uMouseActive: { value: 0 },
  uHandXY: { value: new THREE.Vector2(-999, -999) },
  uHandActive: { value: 0 },
  uGestureGrip: { value: 0 },
  uPixel: { value: renderer.getPixelRatio() },
  uAlpha: { value: 0 },          // 整体粒子透明度 (启动 fade-in)
  uParticleDim: { value: 1 },          // 覆盖层打开时只压低粒子背景, 不影响 3D 卡片
  uBackdropAdapt: { value: 0.72 },     // 与歌词共用亮底避光强度
  uFloatAlpha: { value: 0 },          // 空场/浮空粒子透明度
  uLoading: { value: 0 },          // 加载动画混合度 0..1 (1 = 完全聚成圆环)
};
installRenderPowerHooks();
applyRendererPowerMode();

// ----- 顶点 Shader -----
//   v7.1: 律动幅度 ×2.5, Tunnel 自旋, 虚空预设, 切歌颜色渐变
var vs = `
precision highp float;
uniform float uTime, uBass, uMid, uTreble, uBeat, uEnergy, uBurstAmt;
uniform float uPreset, uIntensity, uDepth, uPointScale, uSpeed, uTwist;
uniform float uVinylSpin;
uniform float uColorBoost, uScatter, uCoverRes, uBgFade;
uniform float uHasCover, uHasDepth, uEdgeEnabled, uAiBoost;
uniform float uMouseActive, uPixel, uColorMixT, uLoading;
uniform sampler2D uCoverTex, uPrevCoverTex, uEdgeTex, uRippleTex;
uniform int uRippleCount;
uniform vec2 uMouseXY, uHandXY;
uniform float uHandActive, uGestureGrip;
uniform vec3 uTintColor;
uniform float uTintStrength;
attribute vec2 aUv;
attribute float aRand;
varying vec3 vColor;
varying float vBright, vRipple, vEdgeBoost, vAlpha, vSourceLum;

#define PI 3.14159265359

vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289v(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 perm(vec4 x){return mod289v(((x*34.0)+1.0)*x);}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=perm(perm(perm(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=inversesqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

float hash11(float p) {
  return fract(sin(p * 127.1) * 43758.5453123);
}

vec2 safeCoverUv(vec2 uv) {
  return clamp(uv, vec2(0.0012), vec2(0.9988));
}

vec3 sampleNewCoverColor(vec2 uv) {
  return texture2D(uCoverTex, safeCoverUv(uv)).rgb;
}

vec3 samplePrevCoverColor(vec2 uv) {
  return texture2D(uPrevCoverTex, safeCoverUv(uv)).rgb;
}

vec4 sampleEdgeColor(vec2 uv) {
  return texture2D(uEdgeTex, safeCoverUv(uv));
}

float rippleSumAt(vec2 p, out float maxAmp) {
  float sum = 0.0; maxAmp = 0.0;
  for (int ri = 0; ri < 12; ri++) {
if (ri >= uRippleCount) break;
float vCoord = (float(ri) + 0.5) / 12.0;
vec4 rd = texture2D(uRippleTex, vec2(0.5, vCoord));
float age = rd.z; float str = rd.w;
if (str < 0.005 || age < 0.0 || age > 2.0) continue;
float dx = p.x - rd.x, dy = p.y - rd.y;
float dist = sqrt(dx*dx + dy*dy);
float lifeN = age / 2.0;
float fadeIn  = smoothstep(0.0, 0.06, age);
float fadeOut = 1.0 - smoothstep(0.7, 1.0, lifeN);
float env = fadeIn * fadeOut;
// v7.1: 把幅度放大 — 中心凸起更高更宽
float bulgeW = 0.55 + age * 0.80;
float bulge  = exp(-dist*dist / (2.0 * bulgeW * bulgeW)) * (1.0 - smoothstep(0.0, 0.55, lifeN));
float waveR  = age * 2.10;
float ringW  = 0.40 + age * 0.22;
float ring   = exp(-pow((dist - waveR) / ringW, 2.0));
// v7.1: 提升整体幅度 ×2
float local  = (bulge * 2.4 + ring * 1.30) * env * str;
sum += local;
maxAmp = max(maxAmp, abs(local));
  }
  return sum;
}

void main(){
  float t = uTime * uSpeed;
  vec3 pos;
  vec2 sampleUv = safeCoverUv(aUv);
  // 切歌颜色渐变: 在新旧封面间 mix
  vec3 newCol = sampleNewCoverColor(sampleUv);
  vec3 prevCol = samplePrevCoverColor(sampleUv);
  vec3 coverColor = mix(prevCol, newCol, clamp(uColorMixT, 0.0, 1.0));
  vec4 edge = sampleEdgeColor(sampleUv);
  float depthVal = edge.r;
  float edgeVal  = edge.g;
  float fgMask   = edge.b;
  float lumVal   = edge.a;
  float maxRippleAmp = 0.0;
  float rippleZ = 0.0;

  vec3 defaultColor = mix(
vec3(0.36, 0.28, 0.72),
mix(vec3(0.85, 0.55, 0.95), vec3(0.45, 0.78, 0.95), aUv.x),
aUv.y
  );
  vColor = mix(defaultColor, coverColor, uHasCover);
  vAlpha = 1.0;

  // 律动强度的真实倍数 (放大 intensity 滑块的影响)
  float K = uIntensity * 1.6;   // 滑块 1.0 → K=1.6, 滑块 1.6 → K=2.56

  // ====================================================
  //  Preset 0: SILK — 丝绸 (xy 平面, z 涟漪)
  //  v7.1: 全部位移 ×2.5
  // ====================================================
  if (uPreset < 0.5) {
pos = position;
rippleZ = rippleSumAt(pos.xy, maxRippleAmp);

float midN = snoise(vec3(pos.x*1.4, pos.y*1.4, t*0.55)) * 0.6
           + snoise(vec3(pos.x*2.8+5.0, pos.y*2.8-3.0, t*0.85)) * 0.4;
float midMask = 0.55 + 0.45 * snoise(vec3(pos.x*0.4, pos.y*0.4, t*0.18));
float midDisp = midN * uMid * 0.55 * midMask * K;       // 0.20 → 0.55

float trebleJ = snoise(vec3(pos.x*6.5, pos.y*6.5, t*3.5 + aRand*4.0)) * uTreble * 0.18 * K;  // 0.06→0.18
float bassBreath = snoise(vec3(pos.x*0.35, pos.y*0.35, t*0.4)) * uBass * 0.42 * K;          // 0.14→0.42

// AI 深度: 显著强化 (0.85 → 1.4)
float depthZ = (depthVal - 0.5) * uAiBoost * uDepth * 1.40 * uHasDepth;

pos.z = rippleZ * 1.30 + midDisp + trebleJ + bassBreath + depthZ;
  }

  // ====================================================
  //  Preset 1: TUNNEL — 隧道 + 自旋
  // ====================================================
  else if (uPreset < 1.5) {
// v7.1: 整体自旋 — 整管缓慢绕 Z 轴
float spin = t * 0.12;
float angle = aUv.x * 2.0 * PI + spin;
float flow = aUv.y - t * 0.08 * (1.0 + uBass * 0.55);
flow = fract(flow);
float zPos = (flow - 0.5) * 9.0;
float baseR = 2.0 - uBass * 0.28 * K;                  // bass 收缩更明显
float ripG  = sin(angle * 5.0 + zPos * 1.4 + t * 2.2) * 0.10 * (uMid + uTreble) * K;   // 0.04→0.10
float r = baseR + ripG;
pos.x = cos(angle) * r;
pos.y = sin(angle) * r;
pos.z = zPos;

sampleUv = vec2(aUv.x, flow);
sampleUv = safeCoverUv(sampleUv);
newCol = sampleNewCoverColor(sampleUv);
prevCol = samplePrevCoverColor(sampleUv);
coverColor = mix(prevCol, newCol, clamp(uColorMixT, 0.0, 1.0));
vColor = mix(defaultColor, coverColor, uHasCover);

float depthFade = smoothstep(-4.5, 4.5, zPos);
vColor *= 0.4 + depthFade * 0.7;
  }

  // ====================================================
  //  Preset 2: ORBIT — 星球 (保留自转)
  //  v7.1: 律动幅度加大
  // ====================================================
  else if (uPreset < 2.5) {
float theta = aUv.x * 2.0 * PI;
float phi   = (aUv.y - 0.5) * PI;
float baseR = 2.2;
float trebFlare = snoise(vec3(theta * 1.5, phi * 1.5, t * 0.7)) * uTreble * 0.85 * K;   // 0.40→0.85
float bassExpand = uBass * 0.35 * K;                                                      // 0.18→0.35
float r = baseR * (1.0 + bassExpand) + trebFlare;

pos.x = r * cos(phi) * cos(theta);
pos.y = r * sin(phi);
pos.z = r * cos(phi) * sin(theta);

float yaw = t * 0.18;
float cy = cos(yaw), sy = sin(yaw);
pos.xz = mat2(cy, -sy, sy, cy) * pos.xz;
  }

  // ====================================================
  //  Preset 3: VOID — 虚空 (无粒子, 适合自定义背景)
  // ====================================================
  else if (uPreset < 3.5) {
pos = vec3((aUv.x - 0.5) * 0.01, (aUv.y - 0.5) * 0.01, -90.0);
vAlpha = 0.0;
vColor = vec3(0.0);
maxRippleAmp = 0.0;
  }

  // ====================================================
  //  Preset 4: VINYL RECORD
  //  A real record layout: circular album cover in the center, black vinyl
  //  grooves outside, and a complete white particle rim.
  // ====================================================
  else if (uPreset < 4.5) {
float bassDrive = smoothstep(0.08, 0.78, uBass + uBeat * 0.82);
float highDrive = smoothstep(0.05, 0.46, uTreble);
float hiResGuard = smoothstep(1.08, 1.55, uCoverRes);
float edgeGuard = mix(1.0, 0.38, hiResGuard);
float depthGuard = mix(1.0, 0.44, hiResGuard);
float grooveGuard = mix(1.0, 0.48, hiResGuard);
float beatGuard = mix(1.0, 0.36, hiResGuard);

vec2 p = (aUv - 0.5) * 5.12;
float spin = uVinylSpin;
float cs = cos(spin), sn = sin(spin);
vec2 rp = mat2(cs, -sn, sn, cs) * p;
float d = length(p);
float angle0 = atan(p.y, p.x);
float recordR = 2.46;
float coverR = 1.18;
float recordAlpha = 1.0 - smoothstep(recordR - 0.02, recordR + 0.05, d);
float coverMask = 1.0 - smoothstep(coverR - 0.012, coverR + 0.018, d);
float border = exp(-pow((d - coverR) / 0.064, 2.0)) * edgeGuard;
float outerRim = exp(-pow((d - (recordR - 0.050)) / 0.055, 2.0)) * edgeGuard;
float vinylN = clamp((d - coverR) / max(0.001, recordR - coverR), 0.0, 1.0);

pos = vec3(rp * (1.0 + bassDrive * 0.012 * beatGuard + uBeat * 0.026 * beatGuard), 0.0);
vAlpha = recordAlpha;

if (coverMask > 0.02) {
  vec2 coverUv = p / (coverR * 2.0) + 0.5;
  newCol = sampleNewCoverColor(coverUv);
  prevCol = samplePrevCoverColor(coverUv);
  coverColor = mix(prevCol, newCol, clamp(uColorMixT, 0.0, 1.0));
  if (hiResGuard > 0.001) {
    vec2 sx = vec2(0.0026, 0.0);
    vec2 sy = vec2(0.0, 0.0026);
    vec3 softNew = (sampleNewCoverColor(coverUv + sx) + sampleNewCoverColor(coverUv - sx) + sampleNewCoverColor(coverUv + sy) + sampleNewCoverColor(coverUv - sy)) * 0.25;
    vec3 softPrev = (samplePrevCoverColor(coverUv + sx) + samplePrevCoverColor(coverUv - sx) + samplePrevCoverColor(coverUv + sy) + samplePrevCoverColor(coverUv - sy)) * 0.25;
    coverColor = mix(coverColor, mix(softPrev, softNew, clamp(uColorMixT, 0.0, 1.0)), hiResGuard * 0.42);
  }
  vColor = mix(defaultColor, coverColor, uHasCover);
  float coverShade = 1.02 + 0.10 * (1.0 - smoothstep(0.0, coverR, d));
  vColor *= coverShade;
  vColor = mix(vColor, vec3(1.0), border * 0.54);
  pos.z = 0.040 + border * 0.026 * depthGuard + uBeat * 0.018 * beatGuard;
  maxRippleAmp = max(maxRippleAmp, border * 0.30 + bassDrive * 0.075 * beatGuard + uBeat * 0.075 * beatGuard);
} else {
  float groove = 0.5 + 0.5 * sin((d - coverR) * mix(98.0, 58.0, hiResGuard));
  float fineGroove = 0.5 + 0.5 * sin((d - coverR) * mix(170.0, 92.0, hiResGuard) + aRand * 3.0);
  float tick = smoothstep(0.82, 0.995, hash11(floor((angle0 + PI) * 38.0) + floor(d * 72.0) * 2.1));
  vec3 vinyl = vec3(0.052, 0.054, 0.058) + vec3(0.052 * grooveGuard) * groove + vec3(0.026 * grooveGuard) * fineGroove;
  vinyl = mix(vinyl, coverColor * 0.32, 0.18 * (1.0 - vinylN));
  float whiteRing = max(border * 0.92, outerRim * 0.26);
  vColor = mix(vinyl, vec3(0.92, 0.94, 0.94), whiteRing);
  vColor = mix(vColor, vec3(1.0), tick * highDrive * (0.06 + border * 0.12) * grooveGuard);
  pos.z = groove * 0.010 * grooveGuard + border * 0.024 * depthGuard + bassDrive * vinylN * 0.016 * K * beatGuard + tick * highDrive * 0.010 * grooveGuard;
  maxRippleAmp = max(maxRippleAmp, border * 0.32 + outerRim * 0.12 + bassDrive * vinylN * 0.11 * beatGuard + tick * highDrive * 0.10 * grooveGuard + uBeat * vinylN * 0.08 * beatGuard);
}
  }

  // ====================================================
  //  Preset 5: WALLPAPER PULSE
  //  Layered music-particle wallpaper: aurora ribbons, depth sparks,
  //  and cover-colored audio flow.
  // ====================================================
  else if (uPreset < 8.5) {
float bassGlow = smoothstep(0.07, 0.78, uBass) * 0.34 + uBeat * 0.014;
float midGlow = smoothstep(0.07, 0.62, uMid) * 0.42;
float highGlow = smoothstep(0.04, 0.46, uTreble) * 0.46;
float lane = aUv.y;
float transition = clamp(uBurstAmt, 0.0, 1.0);

if (lane < 0.80) {
  float laneWarp = snoise(vec3(aUv.x * 0.42, lane * 1.7, t * 0.026)) * 0.11 + (hash11(aRand * 73.1) - 0.5) * 0.045;
  float warpedLane = clamp(lane + laneWarp, 0.0, 0.80);
  float bandCoord = warpedLane / 0.80 * 5.65 + snoise(vec3(aUv.x * 0.82, lane * 2.25, t * 0.032)) * 0.62;
  float band = floor(bandCoord);
  float local = fract(bandCoord + hash11(band * 9.13 + aRand * 2.4) * 0.18);
  float bandN = clamp((band + 0.5) / 5.65, 0.0, 1.0);
  float seed = hash11(band * 19.17 + aRand * 31.0);
  float flow = fract(aUv.x + t * (0.0034 + bandN * 0.0038 + seed * 0.0022) + seed * 0.53);
  float arc = (flow - 0.5) * PI * (1.35 + bandN * 0.72 + seed * 0.24);
  float armCurve = sin(arc + bandN * 2.2 + seed * 5.3);
  float spiralRadius = 9.2 + bandN * 11.8 + seed * 6.0 + local * 2.9;
  float x = cos(arc * 0.72 + bandN * 0.92 + seed * 1.3) * spiralRadius + (flow - 0.5) * (13.5 + bandN * 9.5);
  float ribbonPhase = flow * PI * 2.0 * (0.55 + bandN * 0.24 + seed * 0.10) + t * (0.010 + bandN * 0.007) + seed * 5.7;
  float broadWave = sin(ribbonPhase) * 0.92;
  float fineWave = sin(ribbonPhase * (1.36 + seed * 0.62) - t * 0.044 + seed * 5.0) * 0.045;
  float yBase = (bandN - 0.5) * 13.2 + armCurve * (2.3 + bandN * 1.6) + (seed - 0.5) * 1.85 + snoise(vec3(bandN * 2.0, flow * 0.62, seed)) * 0.92;
  float ridgeCenter = 0.43 + (seed - 0.5) * 0.18;
  float ridge = exp(-pow((local - ridgeCenter) / (0.25 + seed * 0.04), 2.0));
  float softMask = smoothstep(0.010, 0.12, lane) * (1.0 - smoothstep(0.72, 0.81, lane));
  float ribbonNoise = snoise(vec3(flow * 1.18 + seed, bandN * 2.0, t * 0.018)) * 0.74;
  float zLayer = mix(-23.5, 15.5, bandN) + (seed - 0.5) * 6.0;

  pos.x = x + ribbonNoise * 1.40 + sin(t * 0.012 + seed * 8.0) * 0.22;
  pos.y = yBase + broadWave + fineWave + (local - 0.5) * (0.58 + ridge * 0.14);
  pos.z = zLayer + broadWave * 1.35 + ribbonNoise * 1.85;

  float pulseLine = 0.5 + 0.5 * sin(ribbonPhase * (1.7 + seed * 0.9) - t * 0.32 + seed * 6.0);
  vec3 aurora = mix(vec3(0.52, 0.86, 1.0), vec3(0.70, 0.58, 1.0), bandN);
  aurora = mix(aurora, vec3(0.96, 0.98, 0.92), bassGlow * 0.05);
  vAlpha = (0.18 + ridge * 0.78 + pulseLine * highGlow * 0.035 + bassGlow * 0.025) * softMask * (0.96 + transition * 0.02);
  vColor = mix(coverColor, aurora, 0.62 + ridge * 0.22) * (0.76 + ridge * 0.86 + pulseLine * highGlow * 0.05 + bassGlow * 0.04);
  maxRippleAmp = max(maxRippleAmp, ridge * (0.12 + midGlow * 0.05) + pulseLine * highGlow * 0.045 + bassGlow * 0.030);
} else {
  float q = (lane - 0.80) / 0.20;
  float seed = hash11(aRand * 917.0 + floor(q * 130.0));
  float depth = mix(-32.0, 18.0, seed);
  float drift = fract(aUv.x + t * (0.0014 + seed * 0.0048) + seed * 0.63);
  float cluster = snoise(vec3(seed * 2.0, q * 3.2, t * 0.007));
  float x = (drift - 0.5) * (45.0 + seed * 22.0) + cluster * 3.4;
  float y = (hash11(aRand * 331.0 + seed * 5.0) - 0.5) * 22.0 + sin(t * (0.018 + seed * 0.028) + seed * 7.0) * 0.86;
  float z = depth + sin(t * (0.020 + seed * 0.032) + aRand * 8.0) * 1.05;
  float twinkle = pow(0.5 + 0.5 * sin(t * (0.24 + seed * 0.42) + aRand * 17.0), 5.0);
  float dust = smoothstep(0.22, 0.98, hash11(aRand * 661.0 + floor(q * 160.0)));

  pos = vec3(x, y, z);
  vAlpha = dust * (0.16 + twinkle * 0.46 + highGlow * 0.025 + bassGlow * 0.018) * (1.0 - q * 0.06);
  vColor = mix(coverColor, vec3(0.92, 0.97, 1.0), 0.62 + twinkle * 0.14) * (0.72 + twinkle * 0.62 + bassGlow * 0.025);
  maxRippleAmp = max(maxRippleAmp, twinkle * highGlow * 0.055 + dust * bassGlow * 0.030);
}

if (transition > 0.001) {
  float bloom = smoothstep(0.0, 1.0, transition);
  vec2 burstVec = pos.xy + vec2(hash11(aRand * 31.0) - 0.5, hash11(aRand * 47.0) - 0.5) * 0.75;
  vec2 burstDir = burstVec / max(length(burstVec), 0.001);
  pos.xy += burstDir * bloom * 0.026;
  pos.xy += vec2(snoise(vec3(aRand, t * 0.014, 1.0)), snoise(vec3(aRand, t * 0.014, 5.0))) * bloom * 0.06;
  pos.xy *= 1.0 + bloom * 0.014;
  pos.z += (hash11(aRand * 123.0) - 0.5) * bloom * 0.18;
  vAlpha *= 0.86 + bloom * 0.22;
  maxRippleAmp = max(maxRippleAmp, bloom * 0.10);
}
  }

  // ====================================================
  //  Preset 9: ECLIPSE HALO — obsidian orbital reliquary
  // ====================================================
  else if (uPreset < 9.5) {
float ringIndex = floor(aUv.y * 8.0);
float ringLocal = fract(aUv.y * 8.0);
float ringN = (ringIndex + 0.5) / 8.0;
float ringSeed = hash11(ringIndex * 19.73 + 2.1);
float theta = aUv.x * 2.0 * PI + ringIndex * 0.47 + t * (0.035 + ringN * 0.026);
float eclipseDrive = smoothstep(0.06, 0.76, uBass) * 0.17 + uBeat * 0.08;
float ridge = exp(-pow((ringLocal - 0.5) / (0.17 + ringSeed * 0.045), 2.0));
float radius = 0.92 + ringN * 3.18 + (ringLocal - 0.5) * 0.24 + eclipseDrive * (0.18 + ringN * 0.34);
float eccentric = 0.49 + ringN * 0.20;
float xh = cos(theta) * radius * (1.18 + ringN * 0.10);
float yh = sin(theta) * radius * eccentric;
float zh = (ringN - 0.5) * 1.34 + sin(theta * 2.0 + ringSeed * 6.0) * (0.10 + ringN * 0.09);
float tilt = -0.34 + ringN * 0.72;
float ct = cos(tilt), st = sin(tilt);
pos = vec3(xh, yh * ct - zh * st, yh * st + zh * ct);

vec3 coldRim = vec3(0.48, 0.82, 1.0);
vec3 antiqueGold = vec3(0.93, 0.72, 0.38);
vec3 haloColor = mix(coldRim, antiqueGold, smoothstep(0.18, 0.84, ringN + sin(theta) * 0.08));
haloColor = mix(haloColor, vec3(0.98, 0.96, 0.88), ridge * (0.28 + uTreble * 0.18));
vColor = mix(coverColor * 0.72, haloColor, 0.62 + ridge * 0.20);
float corona = pow(0.5 + 0.5 * sin(theta * (13.0 + ringIndex) - t * 0.52 + ringSeed * 9.0), 8.0);
vAlpha = (0.18 + ridge * 0.74 + corona * (0.08 + uTreble * 0.18)) * smoothstep(0.02, 0.14, aUv.y) * (1.0 - smoothstep(0.93, 1.0, aUv.y));
maxRippleAmp = max(maxRippleAmp, ridge * (0.12 + eclipseDrive * 0.20) + corona * uTreble * 0.13);
  }

  // ====================================================
  //  Preset 10: NEON DRIZZLE — refracted city rain
  // ====================================================
  else if (uPreset < 10.5) {
float column = floor(aUv.x * 52.0);
float columnN = (column + 0.5) / 52.0;
float columnLocal = fract(aUv.x * 52.0);
float rainSeed = hash11(column * 41.17 + floor(columnLocal * 5.0) * 7.9);
float rainSpeed = 0.026 + rainSeed * 0.052 + smoothstep(0.08, 0.76, uBass) * 0.014;
float fall = fract(1.0 - aUv.y + t * rainSpeed + rainSeed * 0.87);
float xRain = (columnN - 0.5) * 11.8 + (columnLocal - 0.5) * 0.11;
float yRain = (0.5 - fall) * 8.8;
float cityDepth = mix(-3.8, 2.6, hash11(column * 11.3 + 0.7));
float wind = sin(t * 0.17 + column * 0.63 + fall * 3.4) * (0.08 + rainSeed * 0.12);
float perspective = 0.76 + smoothstep(-3.8, 2.6, cityDepth) * 0.34;
pos = vec3((xRain + wind) * perspective, yRain, cityDepth + sin(fall * PI * 2.0 + rainSeed * 7.0) * 0.05);

float dash = pow(0.5 + 0.5 * sin(fall * (52.0 + rainSeed * 38.0) - t * 0.32), 10.0);
float dropHead = pow(0.5 + 0.5 * sin(fall * 17.0 + rainSeed * 12.0), 18.0);
vec3 neonA = vec3(0.20, 0.88, 1.0);
vec3 neonB = vec3(1.0, 0.26, 0.63);
vec3 neonC = vec3(1.0, 0.72, 0.30);
vec3 rainColor = mix(neonA, neonB, smoothstep(0.18, 0.78, rainSeed));
rainColor = mix(rainColor, neonC, smoothstep(0.84, 0.99, rainSeed));
vColor = mix(coverColor * 0.82, rainColor, 0.58 + dash * 0.18);
vAlpha = 0.09 + dash * 0.40 + dropHead * (0.22 + uTreble * 0.30);
vAlpha *= 0.58 + perspective * 0.42;
pos.x += dropHead * sin(t * 0.8 + rainSeed * 8.0) * uTreble * 0.055;
maxRippleAmp = max(maxRippleAmp, dash * uMid * 0.10 + dropHead * (0.10 + uTreble * 0.22));
  }

  // ====================================================
  //  Preset 11: PRISM FLOCK — folded spectral migration
  // ====================================================
  else if (uPreset < 11.5) {
float flockIndex = floor(aUv.y * 12.0);
float wingY = fract(aUv.y * 12.0) * 2.0 - 1.0;
float wingX = aUv.x * 2.0 - 1.0;
float flockSeed = hash11(flockIndex * 23.73 + 4.0);
float gx = mod(flockIndex, 4.0) - 1.5;
float gy = floor(flockIndex / 4.0) - 1.0;
float migrate = t * (0.018 + flockSeed * 0.018);
vec2 flockCenter = vec2(gx * 2.42 + sin(migrate + flockSeed * 8.0) * 0.48,
                        gy * 2.10 + cos(migrate * 0.83 + flockSeed * 9.0) * 0.36);
float ax = abs(wingX);
float wingMask = 1.0 - smoothstep(0.72, 1.18, abs(wingY) + ax * 0.38);
float bodyMask = exp(-pow(wingX / 0.075, 2.0)) * (1.0 - smoothstep(0.62, 1.0, abs(wingY)));
float flap = sin(t * (0.72 + flockSeed * 0.35) + flockIndex * 1.7) * (0.34 + uMid * 0.42 + uBeat * 0.16);
float lx = sign(wingX) * (0.12 + pow(ax, 0.76) * 0.88);
float ly = wingY * (0.48 + (1.0 - ax) * 0.22);
float lz = ax * (0.42 + flap) + (1.0 - abs(wingY)) * 0.08;
float heading = -0.20 + (flockSeed - 0.5) * 0.70;
float ch = cos(heading), sh = sin(heading);
vec2 folded = mat2(ch, -sh, sh, ch) * vec2(lx, ly);
pos = vec3(flockCenter + folded, (flockSeed - 0.5) * 3.4 + lz);

vec3 prismLeft = vec3(0.42, 0.94, 0.82);
vec3 prismRight = vec3(0.96, 0.62, 0.92);
vec3 prism = mix(prismLeft, prismRight, smoothstep(-0.8, 0.8, wingX));
prism = mix(prism, vec3(1.0, 0.91, 0.64), smoothstep(0.72, 1.0, ax));
vColor = mix(coverColor * 0.78, prism, 0.60 + wingMask * 0.18);
vAlpha = wingMask * (0.22 + (1.0 - ax) * 0.42 + uTreble * 0.16) + bodyMask * 0.68;
maxRippleAmp = max(maxRippleAmp, wingMask * (0.07 + abs(flap) * 0.12) + bodyMask * uBass * 0.12);
  }

  // ====================================================
  //  Preset 12: ABYSSAL BLOOM — bioluminescent tide crown
  // ====================================================
  else {
float bloomR = pow(aUv.y, 0.72);
float bloomTheta = aUv.x * 2.0 * PI + bloomR * 0.72 + t * 0.018;
float petalWave = 0.5 + 0.5 * cos(bloomTheta * 9.0 - bloomR * 3.8);
float bloomDrive = smoothstep(0.06, 0.74, uBass) * 0.26 + uBeat * 0.10;
float radiusBloom = bloomR * (3.30 + bloomDrive) * (0.78 + petalWave * 0.34);
float petalFold = sin(bloomTheta * 9.0 - bloomR * 5.4 + t * 0.13);
float bowl = (1.0 - bloomR) * 1.12 - bloomR * bloomR * 0.52;
pos.x = cos(bloomTheta) * radiusBloom;
pos.y = sin(bloomTheta) * radiusBloom * 0.82;
pos.z = bowl + petalFold * (0.13 + bloomR * 0.47) + sin(bloomTheta * 3.0 + t * 0.07) * 0.08;
float bloomTilt = -0.30;
float cb = cos(bloomTilt), sb = sin(bloomTilt);
pos.yz = mat2(cb, -sb, sb, cb) * pos.yz;

vec3 abyss = vec3(0.12, 0.58, 0.56);
vec3 violet = vec3(0.38, 0.32, 0.95);
vec3 pearl = vec3(0.82, 1.0, 0.94);
vec3 bloomColor = mix(abyss, violet, smoothstep(0.18, 0.88, bloomR + petalWave * 0.10));
float luminousEdge = smoothstep(0.64, 0.98, bloomR) * (0.55 + petalWave * 0.45);
bloomColor = mix(bloomColor, pearl, luminousEdge * (0.32 + uTreble * 0.22));
vColor = mix(coverColor * 0.72, bloomColor, 0.68);
float filament = pow(0.5 + 0.5 * sin(bloomTheta * 18.0 + bloomR * 19.0 - t * 0.26), 7.0);
vAlpha = (0.16 + petalWave * 0.31 + filament * 0.26 + luminousEdge * 0.30) * smoothstep(0.01, 0.10, bloomR);
maxRippleAmp = max(maxRippleAmp, petalWave * bloomDrive * 0.18 + filament * uTreble * 0.17 + luminousEdge * uMid * 0.09);
  }

  // ====================================================
  //  鼠标交互 (仅 SILK)
  // ====================================================
  if (uMouseActive > 0.5 && uPreset < 0.5) {
float mdx = pos.x - uMouseXY.x;
float mdy = pos.y - uMouseXY.y;
float md = sqrt(mdx*mdx + mdy*mdy);
if (md < 1.0) {
  float push = (1.0 - md) * (1.0 - md);
  pos.z += push * 0.55;
}
  }

  // ====================================================
  //  v8 手势遮挡 — uHandActive 是 0..1 平滑过渡, 大半径推开
  // ====================================================
  if (uHandActive > 0.01) {
float hdx = pos.x - uHandXY.x;
float hdy = pos.y - uHandXY.y;
float hd = sqrt(hdx*hdx + hdy*hdy);
float rad = 1.55;
if (hd < rad) {
  float push = (rad - hd) / rad;
  push = push * push * uHandActive;
  pos.z += push * 1.10;
  vec2 outDir = vec2(hdx, hdy) / max(0.001, hd);
  pos.xy += outDir * push * 0.28;
}
  }
  if (uGestureGrip > 0.001) {
float grip = clamp(uGestureGrip, 0.0, 1.0);
float gripWave = 0.5 + 0.5 * sin(uTime * 2.2 + aRand * 6.2831);
pos.xy *= mix(1.0, 0.66 + gripWave * 0.035, grip);
pos.z += grip * (0.18 + uBass * 0.22 + gripWave * 0.10);
  }

  // ====================================================
  //  通用: 离散感 / 扭曲
  // ====================================================
  if (uScatter > 0.001) {
vec2 jdir = vec2(cos(aRand * 6.2831), sin(aRand * 6.2831));
pos.xy += jdir * uScatter * (0.05 + uTreble * 0.10);
  }
  if (uTwist > 0.001 && uPreset < 0.5) {
float ta = uTwist * pos.z * 0.6;
float cs = cos(ta), sn = sin(ta);
pos.xy = mat2(cs, -sn, sn, cs) * pos.xy;
  }

  // 颜色
  float vinylHiResGuard = smoothstep(1.08, 1.55, uCoverRes) * step(3.5, uPreset) * (1.0 - step(4.5, uPreset));
  float edgeBoost = uEdgeEnabled * edgeVal * mix(1.0, 0.42, vinylHiResGuard);
  vSourceLum = dot(max(vColor, vec3(0.0)), vec3(0.299, 0.587, 0.114));
  float blackParticleGuard = 1.0 - smoothstep(0.025, 0.115, vSourceLum);
  vEdgeBoost = edgeBoost * (uPreset > 3.5 ? 0.22 : 1.0) * (1.0 - blackParticleGuard);
  vColor = pow(max(vColor, vec3(0.0)), vec3(1.0 / max(0.35, uColorBoost)));
  float edgeColorMix = edgeBoost * (uPreset > 3.5 ? 0.20 : 0.50) * (1.0 - blackParticleGuard);
  vColor = mix(vColor, vColor + vec3(0.20), edgeColorMix);
  float tintLum = max(max(vColor.r, vColor.g), vColor.b);
  vec3 tintedColor = uTintColor * max(0.24, tintLum * 1.12);
  vColor = mix(vColor, tintedColor, clamp(uTintStrength, 0.0, 1.0) * (1.0 - blackParticleGuard));

  vBright = 0.82 + maxRippleAmp * 0.55 + uBass * 0.10 + edgeBoost * 0.30 + uEnergy * 0.05 + uBurstAmt * 0.40;
  if (uPreset > 4.5) {
vBright = 0.94 + maxRippleAmp * 0.34 + uBass * 0.020 + uEnergy * 0.026 + uBurstAmt * 0.025;
if (uPreset > 8.5) vBright = 0.86 + maxRippleAmp * 0.52 + uEnergy * 0.045 + uBeat * 0.055;
  } else if (uPreset > 3.5) {
vBright = 0.94 + maxRippleAmp * 0.64 + uBass * 0.08 + edgeBoost * 0.12 + uEnergy * 0.05 + uBeat * 0.16 + uBurstAmt * 0.16;
  }
  vRipple = clamp(maxRippleAmp * 1.5, 0.0, 1.0);

  if (uHasDepth > 0.5 && uPreset < 0.5) {
float bgMul = mix(1.0, 0.55, uBgFade * (1.0 - fgMask));
vBright *= bgMul;
  }
  vBright += uGestureGrip * 0.22;
  float loadingMistSize = 1.0;

  // 加载形态: 雾状微尘流，避免廉价旋转圆环
  if (uLoading > 0.001) {
float mistSeed = hash11(aRand * 931.7);
float mistLayer = floor(mistSeed * 4.0);
float layerN = (mistLayer + 0.5) / 4.0;
float mistAngle = aRand * 6.2831 + uTime * (0.16 + mistSeed * 0.18) + snoise(vec3(aRand * 2.1, uTime * 0.24, 2.0)) * 1.85;
float mistR = mix(1.35, 3.15, sqrt(hash11(aRand * 127.3))) * (1.0 + sin(uTime * 0.42 + aRand * 7.0) * 0.13);
vec2 mistCurl = vec2(
  snoise(vec3(aRand * 4.1, uTime * 0.32, 3.0)),
  snoise(vec3(aRand * 4.7, uTime * 0.30, 8.0))
);
float mistBreath = 0.5 + 0.5 * sin(uTime * (0.82 + mistSeed * 0.55) + aRand * 17.0);
float mistRibbon = sin(mistAngle * (1.35 + layerN * 0.55) + uTime * 0.34 + mistSeed * 4.0);
float glowPick = smoothstep(0.88, 0.997, hash11(aRand * 1501.0 + mistLayer * 17.0));
float dustPick = 0.34 + glowPick * 0.66;
vec3 mistPos = vec3(
  cos(mistAngle) * mistR * (1.24 + mistCurl.x * 0.16) + mistCurl.x * 0.72,
  sin(mistAngle * 0.82 + mistRibbon * 0.25) * mistR * (0.56 + layerN * 0.10) + mistCurl.y * 0.62,
  (layerN - 0.5) * 4.85 + mistCurl.x * 0.56 + mistBreath * 0.36 + mistRibbon * 0.24
);
vec3 mistCol = mix(vec3(0.62, 0.86, 0.84), vec3(0.36, 0.46, 0.78), mistSeed);
mistCol = mix(mistCol, vec3(0.94, 1.0, 0.97), glowPick * (0.45 + mistBreath * 0.35));
vColor = mix(vColor, mistCol, uLoading * 0.78);
vBright = mix(vBright, 0.20 + mistBreath * 0.18 + abs(mistCurl.x) * 0.06 + glowPick * (0.72 + abs(mistRibbon) * 0.24), uLoading);
vAlpha = mix(vAlpha, 0.08 + mistBreath * 0.11 + dustPick * 0.11 + glowPick * 0.30, uLoading);
pos = mix(pos, mistPos, uLoading);
loadingMistSize = 1.26 + mistBreath * 0.24 + abs(mistRibbon) * 0.14 + glowPick * 0.78;
  }

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  float depthSize = 36.0 / max(0.5, -mvPos.z);
  float audioBoost = 1.0 + maxRippleAmp * 0.7 + edgeBoost * 0.55 + uBeat * 0.30 + uBurstAmt * 0.5;
  float sz = clamp(depthSize * audioBoost, 1.05, 4.95);
  if (uPreset > 4.5) {
float flowDrive = uBass * 0.070 + uMid * 0.046 + uTreble * 0.060 + uBurstAmt * 0.090 + uBeat * 0.055;
sz = clamp(depthSize * (1.05 + flowDrive), 1.00, 5.45);
if (uPreset > 8.5) {
  float authoredDrive = uBass * 0.10 + uMid * 0.08 + uTreble * 0.12 + uBeat * 0.10;
  sz = clamp(depthSize * (0.98 + authoredDrive), 1.00, 4.85);
}
  } else if (uPreset > 3.5) {
float ringDrive = uBass * 0.30 + uMid * 0.18 + uTreble * 0.22 + uBeat * 0.30;
sz = clamp(depthSize * (0.90 + ringDrive * 0.62), 1.05, 3.90);
  }
  // 加载态下粒子稍大
  sz = mix(sz, sz * loadingMistSize, uLoading);
  gl_PointSize = sz * uPixel * uPointScale;
  gl_Position = projectionMatrix * mvPos;
}
`;

// ----- 片元 Shader -----
var fs = `
precision highp float;
uniform sampler2D uDotTex;
uniform float uAlpha, uPreset, uParticleDim, uBackdropAdapt;
varying vec3 vColor;
varying float vBright, vRipple, vEdgeBoost, vAlpha, vSourceLum;

void main(){
  vec4 tex = texture2D(uDotTex, gl_PointCoord);
  if (tex.a < 0.02) discard;
  vec3 col = vColor * vBright;
  col = mix(col, col * 1.3 + vec3(0.05), vEdgeBoost * 0.35);
  col = mix(col, col * 1.2, vRipple * 0.4);
  float keepBlack = 1.0 - smoothstep(0.025, 0.115, vSourceLum);
  float nonBlack = 1.0 - keepBlack;
  float dotDist = length(gl_PointCoord - vec2(0.5)) * 2.0;
  float readableRim = smoothstep(0.44, 0.94, dotDist) * (1.0 - smoothstep(0.94, 1.08, dotDist)) * tex.a;
  float outLum = dot(col, vec3(0.299, 0.587, 0.114));
  float lightParticle = smoothstep(0.50, 0.82, outLum) * nonBlack;
  float darkParticle = (1.0 - smoothstep(0.20, 0.50, outLum)) * nonBlack;
  float backdropAdapt = clamp(uBackdropAdapt, 0.0, 1.0);
  if (backdropAdapt > 0.001) {
    col = mix(col, vec3(0.0), readableRim * lightParticle * (0.38 + backdropAdapt * 0.30));
    col = mix(col, vec3(1.0), readableRim * darkParticle * (0.20 + backdropAdapt * 0.12));
  }
  col = clamp(col, vec3(0.0), vec3(1.6));
  gl_FragColor = vec4(col, tex.a * uAlpha * uParticleDim * vAlpha);
}
`;

var material = new THREE.ShaderMaterial({
  uniforms: uniforms, vertexShader: vs, fragmentShader: fs,
  transparent: true, depthWrite: false, blending: THREE.NormalBlending,
});

var bloomVs = vs
  .replace('uniform float uMouseActive, uPixel, uColorMixT, uLoading;', 'uniform float uMouseActive, uPixel, uColorMixT, uLoading, uBloomSize;')
  .replace('gl_PointSize = sz * uPixel * uPointScale;', 'gl_PointSize = sz * uPixel * uPointScale * uBloomSize;');
var bloomFs = `
precision highp float;
uniform sampler2D uDotTex;
uniform float uAlpha, uBloomStrength, uPreset, uParticleDim, uBackdropAdapt;
varying vec3 vColor;
varying float vBright, vRipple, vEdgeBoost, vAlpha, vSourceLum;

void main(){
  vec4 tex = texture2D(uDotTex, gl_PointCoord);
  if (tex.a < 0.01) discard;
  float soft = tex.a * tex.a;
  vec3 col = vColor * (0.55 + vBright * 0.62);
  col = mix(col, col + vec3(0.22, 0.18, 0.10), vEdgeBoost * 0.35);
  col = clamp(col, vec3(0.0), vec3(1.8));
  float pulse = 1.0 + vRipple * 0.65;
  float keepBlack = 1.0 - smoothstep(0.025, 0.115, vSourceLum);
  float bloomKeep = 1.0 - keepBlack * 0.92;
  float outLum = dot(col, vec3(0.299, 0.587, 0.114));
  float backdropAdapt = clamp(uBackdropAdapt, 0.0, 1.0);
  if (backdropAdapt > 0.001) {
    float brightAvoid = smoothstep(0.48, 0.84, outLum) * backdropAdapt;
    bloomKeep *= 1.0 - brightAvoid * 0.34;
  }
  gl_FragColor = vec4(col, soft * uAlpha * uBloomStrength * uParticleDim * pulse * 0.55 * vAlpha * bloomKeep);
}
`;
var bloomMaterial = new THREE.ShaderMaterial({
  uniforms: uniforms, vertexShader: bloomVs, fragmentShader: bloomFs,
  transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
});
var bloomParticles = new THREE.Points(geo, bloomMaterial);
bloomParticles.frustumCulled = false;
bloomParticles.renderOrder = 0;
scene.add(bloomParticles);
var particles = new THREE.Points(geo, material);
particles.frustumCulled = false;
particles.renderOrder = 1;
scene.add(particles);

var BACKGROUND_STAR_RIVER_COUNT = 1400;

function buildBackgroundStarRiverGeometry(count) {
  var bgGeo = new THREE.BufferGeometry();
  var seeds = new Float32Array(count);
  var lanes = new Float32Array(count);
  var depths = new Float32Array(count);
  for (var i = 0; i < count; i++) {
    seeds[i] = Math.random() * 1000 + i * 0.37;
    lanes[i] = Math.random();
    depths[i] = Math.random();
  }
  bgGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  bgGeo.setAttribute('aLane', new THREE.BufferAttribute(lanes, 1));
  bgGeo.setAttribute('aDepthSeed', new THREE.BufferAttribute(depths, 1));
  return bgGeo;
}

var backgroundStarRiverUniforms = {
  uDotTex: uniforms.uDotTex,
  uTime: uniforms.uTime,
  uBass: uniforms.uBass,
  uTreble: uniforms.uTreble,
  uBeat: uniforms.uBeat,
  uEnergy: uniforms.uEnergy,
  uPixel: uniforms.uPixel,
  uPointScale: uniforms.uPointScale,
  uParticleDim: uniforms.uParticleDim,
  uTintColor: uniforms.uTintColor,
  uAlpha: { value: 0 }
};

var backgroundStarRiverVs = `
precision highp float;
attribute float aSeed, aLane, aDepthSeed;
uniform float uTime, uBass, uTreble, uBeat, uEnergy, uPixel, uPointScale, uAlpha, uParticleDim;
uniform vec3 uTintColor;
varying vec3 vColor;
varying float vAlpha, vTwinkle;

float hash11(float p){ return fract(sin(p * 127.1) * 43758.5453123); }

void main(){
  float band = floor(aLane * 6.0);
  float local = fract(aLane * 6.0);
  float bandN = (band + 0.5) / 6.0;
  float seed = aSeed + band * 19.17;
  float flow = fract(hash11(seed * 2.13) + uTime * (0.0022 + bandN * 0.0028 + hash11(seed * 5.1) * 0.0034));
  float arc = (flow - 0.5) * 6.2831853 * (0.68 + bandN * 0.46) + bandN * 2.4 + hash11(seed) * 6.2831853;
  float wave = sin(arc * (1.18 + bandN * 0.28) + uTime * (0.014 + bandN * 0.012) + seed * 0.07);
  float radius = 7.2 + bandN * 15.8 + hash11(seed * 3.7) * 6.2 + local * 1.8;
  vec3 pos;
  pos.x = cos(arc * 0.76 + bandN * 0.84) * radius + (flow - 0.5) * (18.0 + bandN * 14.0);
  pos.y = (bandN - 0.5) * 13.2 + wave * (1.5 + bandN * 1.4) + (local - 0.5) * 1.2;
  pos.z = mix(-31.0, -4.8, aDepthSeed) + wave * 1.2 + sin(uTime * (0.018 + hash11(seed) * 0.032) + seed) * 1.0;

  float twinkle = pow(0.5 + 0.5 * sin(uTime * (0.22 + hash11(seed * 4.0) * 0.44) + seed * 9.0), 5.0);
  float ridge = exp(-pow((local - (0.42 + hash11(seed * 6.0) * 0.16)) / (0.22 + hash11(seed * 7.0) * 0.10), 2.0));
  float dust = smoothstep(0.20, 0.98, hash11(seed * 8.0 + band));
  vec3 cool = mix(vec3(0.34, 0.76, 1.0), vec3(0.60, 0.44, 1.0), bandN);
  vec3 warm = vec3(1.0, 0.78, 0.58);
  vec3 tint = max(uTintColor, vec3(0.08));
  vColor = mix(cool, warm, ridge * 0.35 + uBass * 0.06);
  vColor = mix(vColor, tint, 0.22);
  vTwinkle = twinkle;
  vAlpha = uAlpha * uParticleDim * dust * (0.10 + ridge * 0.52 + twinkle * 0.32 + uBeat * 0.05) * (0.88 + uEnergy * 0.18);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  float depthSize = 30.0 / max(0.65, -mv.z);
  float size = 1.10 + ridge * 2.40 + twinkle * 2.80 + uTreble * 0.80 + uBeat * 0.50;
  gl_PointSize = clamp(size * depthSize * uPixel * uPointScale, 0.75, 5.60);
  gl_Position = projectionMatrix * mv;
}
`;

var backgroundStarRiverFs = `
precision highp float;
uniform sampler2D uDotTex;
varying vec3 vColor;
varying float vAlpha, vTwinkle;

void main(){
  vec4 tex = texture2D(uDotTex, gl_PointCoord);
  if (tex.a < 0.02) discard;
  vec3 col = clamp(vColor * (0.66 + vTwinkle * 0.72), vec3(0.0), vec3(1.45));
  gl_FragColor = vec4(col, tex.a * vAlpha);
}
`;

var backgroundStarRiverMaterial = new THREE.ShaderMaterial({
  uniforms: backgroundStarRiverUniforms,
  vertexShader: backgroundStarRiverVs,
  fragmentShader: backgroundStarRiverFs,
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: THREE.AdditiveBlending
});
var backgroundStarRiverParticles = new THREE.Points(buildBackgroundStarRiverGeometry(BACKGROUND_STAR_RIVER_COUNT), backgroundStarRiverMaterial);
backgroundStarRiverParticles.frustumCulled = false;
backgroundStarRiverParticles.renderOrder = -2;
scene.add(backgroundStarRiverParticles);

function backgroundStarRiverTargetAlpha() {
  if (!fx || fx.backgroundStarRiver === false) return 0;
  if (Number(fx.preset) === 5) return 0;
  if (typeof SONIC_PRESET_INDEX !== 'undefined' && Number(fx.preset) === SONIC_PRESET_INDEX) return 0;
  if (typeof SONIC_WORKSHOP_PRESET_INDEX !== 'undefined' && Number(fx.preset) === SONIC_WORKSHOP_PRESET_INDEX) return 0.28;
  if (typeof SKULL_PRESET_INDEX !== 'undefined' && Number(fx.preset) === SKULL_PRESET_INDEX) return 0.38;
  if (Number(fx.preset) === 9) return 0.12;
  if (Number(fx.preset) === 10) return 0.18;
  if (Number(fx.preset) === 11) return 0.10;
  if (Number(fx.preset) === 12) return 0.16;
  return 0.34;
}

function updateBackgroundStarRiverState(dt, immediate) {
  if (!backgroundStarRiverParticles || !backgroundStarRiverUniforms) return;
  var target = backgroundStarRiverTargetAlpha();
  if (immediate) {
    backgroundStarRiverUniforms.uAlpha.value = target;
  } else {
    var ease = target > backgroundStarRiverUniforms.uAlpha.value ? 0.085 : 0.16;
    backgroundStarRiverUniforms.uAlpha.value += (target - backgroundStarRiverUniforms.uAlpha.value) * Math.min(1, ease * Math.max(1, (dt || 0.016) * 60));
  }
  backgroundStarRiverParticles.visible = backgroundStarRiverUniforms.uAlpha.value > 0.006;
}
console.log('v7 shell loaded, JS pending');

// ============================================================
//  浮空粒子层 (独立 Points)
//   v7.1: 速度大幅放慢, 改用 sin/cos 长周期漂移 (优雅而非乱飞)
