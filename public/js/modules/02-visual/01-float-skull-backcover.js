// ============================================================
var FLOAT_COUNT = 1300;
var floatGroup = null;
var floatPositionsArr = null, floatBaseArr = null, floatPhaseArr = null, floatColorArr = null;

function createFloatLayer() {
  fx.floatLayer = false;
  uniforms.uFloatAlpha.value = 0;
  if (floatGroup) destroyFloatLayer();
  return;
  if (floatGroup) return;
  var fgeo = new THREE.BufferGeometry();
  floatPositionsArr = new Float32Array(FLOAT_COUNT * 3);
  floatBaseArr = new Float32Array(FLOAT_COUNT * 3);  // 基准位置
  floatPhaseArr = new Float32Array(FLOAT_COUNT * 3);  // 每粒子相位 (0..2π)
  floatColorArr = new Float32Array(FLOAT_COUNT * 3);
  var floatRandArr = new Float32Array(FLOAT_COUNT);
  var floatAmpArr = new Float32Array(FLOAT_COUNT);      // 漂移幅度 (0.15-0.45)
  for (var i = 0; i < FLOAT_COUNT; i++) {
    var halo = i < FLOAT_COUNT * 0.76;
    var bx, by, bz;
    if (halo) {
      var a = Math.random() * Math.PI * 2;
      var r = 0.62 + Math.pow(Math.random(), 0.72) * 2.75;
      var lane = (Math.random() - 0.5) * 0.62;
      bx = Math.cos(a) * r;
      by = Math.sin(a) * r * 0.54 + lane;
      bz = (Math.random() - 0.5) * 2.4 - 0.25;
    } else {
      bx = (Math.random() - 0.5) * 8.4;
      by = (Math.random() - 0.5) * 5.8;
      bz = (Math.random() - 0.5) * 5.6;
    }
    floatBaseArr[i * 3] = bx; floatBaseArr[i * 3 + 1] = by; floatBaseArr[i * 3 + 2] = bz;
    floatPositionsArr[i * 3] = bx;
    floatPositionsArr[i * 3 + 1] = by;
    floatPositionsArr[i * 3 + 2] = bz;
    floatPhaseArr[i * 3] = Math.random() * Math.PI * 2;
    floatPhaseArr[i * 3 + 1] = Math.random() * Math.PI * 2;
    floatPhaseArr[i * 3 + 2] = Math.random() * Math.PI * 2;
    floatAmpArr[i] = 0.15 + Math.random() * 0.35;
    var white = 0.88 + Math.random() * 0.12;
    floatColorArr[i * 3] = white;
    floatColorArr[i * 3 + 1] = white;
    floatColorArr[i * 3 + 2] = white;
    floatRandArr[i] = Math.random();
  }
  fgeo.setAttribute('position', new THREE.BufferAttribute(floatPositionsArr, 3));
  fgeo.setAttribute('aColor', new THREE.BufferAttribute(floatColorArr, 3));
  fgeo.setAttribute('aRand', new THREE.BufferAttribute(floatRandArr, 1));

  // 把 amp + phase 存到 attribute 让 shader 端做漂移 (避免 JS 每帧改 buffer)
  fgeo.setAttribute('aAmp', new THREE.BufferAttribute(floatAmpArr, 1));
  fgeo.setAttribute('aPhase', new THREE.BufferAttribute(floatPhaseArr, 3));

  var fvs = `
precision highp float;
uniform float uTime, uBass, uPixel, uFloatAlpha;
attribute vec3 aColor;
attribute vec3 aPhase;
attribute float aRand, aAmp;
varying vec3 vC;
varying float vA;
void main(){
  vec3 pos = position;
  float orbit = uTime * (0.030 + aRand * 0.034);
  float cs = cos(orbit), sn = sin(orbit);
  pos.xy = mat2(cs, -sn, sn, cs) * pos.xy;
  float breathe = 1.0 + sin(uTime * 0.34 + aPhase.x) * 0.045;
  pos.xy *= breathe;
  pos.x += sin(uTime * (0.18 + aRand * 0.05) + aPhase.x) * aAmp * 0.34;
  pos.y += cos(uTime * (0.15 + aRand * 0.06) + aPhase.y) * aAmp * 0.30;
  pos.z += sin(uTime * (0.11 + aRand * 0.04) + aPhase.z) * aAmp * 0.68 + uBass * 0.10 * sin(aRand * 12.0);
  vC = aColor;
  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  float dist = -mvPos.z;
  float twinkle = 0.62 + 0.38 * sin(uTime * (0.42 + aRand * 0.34) + aPhase.z);
  vA = clamp(0.22 + (5.0 - dist) * 0.10, 0.055, 0.58) * twinkle;
  float sz = clamp(40.0 / max(0.5, dist), 1.3, 4.1);
  gl_PointSize = sz * uPixel;
  gl_Position = projectionMatrix * mvPos;
}
  `;
  var ffs = `
precision highp float;
uniform sampler2D uDotTex;
uniform float uFloatAlpha;
varying vec3 vC;
varying float vA;
void main(){
  vec4 tex = texture2D(uDotTex, gl_PointCoord);
  if (tex.a < 0.02) discard;
  gl_FragColor = vec4(vC, tex.a * vA * uFloatAlpha);
}
  `;
  var fmat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uBass: uniforms.uBass,
      uPixel: uniforms.uPixel,
      uDotTex: uniforms.uDotTex,
      uFloatAlpha: uniforms.uFloatAlpha,
    },
    vertexShader: fvs, fragmentShader: ffs,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  floatGroup = new THREE.Points(fgeo, fmat);
  floatGroup.frustumCulled = false;
  scene.add(floatGroup);
}
function destroyFloatLayer() {
  if (!floatGroup) return;
  scene.remove(floatGroup);
  floatGroup.geometry.dispose(); floatGroup.material.dispose();
  floatGroup = null;
}

// ============================================================
//  安魂 — 3D 粒子建模层
// ============================================================
var SKULL_PRESET_INDEX = 6;
var SKULL_MODEL_BASE_ROTATION_X = -0.26;
var SKULL_MODEL_BASE_ROTATION_Y = 0.00;
var SKULL_MODEL_SCALE = 2.34;
var SKULL_MODEL_BASE_POSITION = { x: 0, y: 0.22, z: 0.10 };
var skullAmpPulse = 0;
var skullBeatFlash = 0;
var skullJawOpen = 0;
var skullCameraBlend = 0;
var skullWheelZoom = 0;
var skullWheelZoomTarget = 0;
var skullCameraTargetPos = new THREE.Vector3();
var skullCameraTargetLook = new THREE.Vector3();
var skullCameraBasePos = new THREE.Vector3();
var skullCameraBaseLook = new THREE.Vector3();
var skullCameraShelfPos = new THREE.Vector3();
var skullCameraShelfLook = new THREE.Vector3();
var skullCameraMixedLook = new THREE.Vector3();
var skullCameraCinemaRight = new THREE.Vector3();
var skullCameraCinemaUp = new THREE.Vector3();
var skullCameraCinemaForward = new THREE.Vector3();
var skullShelfCameraMix = 0;
var skullLyricMouthLocal = new THREE.Vector3(0.025, -0.72, 0.62);
var skullLyricMouthTarget = new THREE.Vector3();
var skullLyricMouthForward = new THREE.Vector3();
var skullLyricMouthQuat = new THREE.Quaternion();
var skullLyricReadableQuat = new THREE.Quaternion();
var skullParticleGroup = null;
var skullParticleOpacity = 0;
var skullParticleAsset = { data: null, promise: null, failed: false };
var skullBaseColors = {
  boneA: new THREE.Color('#b8ae98'),
  boneB: new THREE.Color('#fff4d8'),
  shadow: new THREE.Color('#100d0d'),
  light: new THREE.Color('#ffe3a0'),
  neutralBoneA: new THREE.Color('#9fb7c8'),
  neutralBoneB: new THREE.Color('#eef9ff'),
  neutralShadow: new THREE.Color('#070b12'),
  neutralLight: new THREE.Color('#d6f3ff')
};
var skullTintScratch = {
  tint: new THREE.Color(),
  soft: new THREE.Color(),
  bright: new THREE.Color(),
  dark: new THREE.Color(),
  boneA: new THREE.Color(),
  boneB: new THREE.Color(),
  shadow: new THREE.Color(),
  light: new THREE.Color()
};

function effectiveSkullVisualTint() {
  var pal = stageLyrics && (stageLyrics.coverPalette || stageLyrics.palette) || {};
  var custom = fx && fx.visualTintMode === 'custom';
  var color = custom
    ? fx.visualTintColor
    : (pal.secondary || pal.primary || fx.visualTintColor || fxDefaults.visualTintColor || '#9db8cf');
  color = normalizeHexColor(color || '#9db8cf', '#9db8cf');
  var strength = custom ? 0.98 : (pal && (pal.secondary || pal.primary) ? 0.30 : 0.14);
  return { color: color, strength: strength, custom: custom };
}

function syncSkullParticleColors() {
  if (!skullParticleGroup || !skullParticleGroup.material || !skullParticleGroup.material.uniforms) return;
  var u = skullParticleGroup.material.uniforms;
  var tint = effectiveSkullVisualTint();
  var custom = !!tint.custom;
  var strength = clampRange(Number(tint.strength) || 0, 0, custom ? 0.99 : 0.78);
  skullTintScratch.tint.set(tint.color);
  skullTintScratch.soft.copy(skullTintScratch.tint).lerp(new THREE.Color('#e8f5ff'), custom ? 0.05 : 0.28);
  skullTintScratch.bright.copy(skullTintScratch.tint).lerp(new THREE.Color(custom ? '#f6fbff' : '#fff7d6'), custom ? 0.14 : 0.46);
  skullTintScratch.dark.copy(skullTintScratch.tint).lerp(new THREE.Color('#05070c'), custom ? 0.74 : 0.72);
  skullTintScratch.boneA.copy(custom ? skullBaseColors.neutralBoneA : skullBaseColors.boneA).lerp(skullTintScratch.soft, strength * (custom ? 0.99 : 0.64));
  skullTintScratch.boneB.copy(custom ? skullBaseColors.neutralBoneB : skullBaseColors.boneB).lerp(skullTintScratch.bright, strength * (custom ? 0.94 : 0.46));
  skullTintScratch.shadow.copy(custom ? skullBaseColors.neutralShadow : skullBaseColors.shadow).lerp(skullTintScratch.dark, strength * (custom ? 0.72 : 0.42));
  skullTintScratch.light.copy(custom ? skullBaseColors.neutralLight : skullBaseColors.light).lerp(skullTintScratch.bright, strength * (custom ? 0.98 : 0.76));
  if (u.uColorA) u.uColorA.value.copy(skullTintScratch.boneA);
  if (u.uColorB) u.uColorB.value.copy(skullTintScratch.boneB);
  if (u.uShadow) u.uShadow.value.copy(skullTintScratch.shadow);
  if (u.uLight) u.uLight.value.copy(skullTintScratch.light);
}

function buildSkullParticleGeometryFromAsset(points) {
  var count = Math.floor((points && points.length || 0) / 5);
  var geo = new THREE.BufferGeometry();
  var positions = new Float32Array(count * 3);
  var seeds = new Float32Array(count);
  var kinds = new Float32Array(count);
  for (var i = 0; i < count; i++) {
    positions[i * 3] = points[i * 5];
    positions[i * 3 + 1] = points[i * 5 + 1];
    positions[i * 3 + 2] = points[i * 5 + 2];
    kinds[i] = points[i * 5 + 3];
    seeds[i] = points[i * 5 + 4];
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute('kind', new THREE.BufferAttribute(kinds, 1));
  return geo;
}

function loadSkullParticleAsset() {
  if (skullParticleAsset.data || skullParticleAsset.promise || skullParticleAsset.failed) return skullParticleAsset.promise || Promise.resolve(skullParticleAsset.data);
  if (typeof fetch !== 'function') {
    skullParticleAsset.failed = true;
    return Promise.resolve(null);
  }
  skullParticleAsset.promise = fetch('assets/skull-decimation-points.bin?v=regular-surface-teeth-soften-20260621', { cache: 'reload' })
    .then(function (res) {
      if (!res.ok) throw new Error('skull asset ' + res.status);
      return res.arrayBuffer();
    })
    .then(function (buf) {
      if (!buf || buf.byteLength < 20 || buf.byteLength % 20 !== 0) throw new Error('invalid skull asset');
      skullParticleAsset.data = new Float32Array(buf);
      skullParticleAsset.promise = null;
      return skullParticleAsset.data;
    })
    .catch(function (err) {
      console.warn('skull particle asset load failed:', err);
      skullParticleAsset.failed = true;
      skullParticleAsset.promise = null;
      return null;
    });
  return skullParticleAsset.promise;
}

function skullPushPoint(pos, seed, kind, x, y, z, k) {
  pos.push(x, y, z);
  seed.push(Math.random() * 1000);
  kind.push(k == null ? 0 : k);
}
function skullPushCurve(pos, seed, kind, count, fn, k, jitter) {
  jitter = jitter == null ? 0.012 : jitter;
  for (var i = 0; i < count; i++) {
    var t = count > 1 ? i / (count - 1) : 0;
    var p = fn(t);
    skullPushPoint(pos, seed, kind, p.x + (Math.random() - 0.5) * jitter, p.y + (Math.random() - 0.5) * jitter, p.z + (Math.random() - 0.5) * jitter, k);
  }
}
function createSkullParticleLayer() {
  if (skullParticleGroup) return skullParticleGroup;
  var asset = skullParticleAsset.data;
  if (!asset) return null;
  var pos = [];
  var seed = [];
  var kind = [];
  if (!asset) {

    function rotate2(x, y, a) {
      var c = Math.cos(a), s = Math.sin(a);
      return { x: x * c - y * s, y: x * s + y * c };
    }
    function eyeCut(x, y, z, side) {
      if (z < 0.16) return false;
      var p = rotate2(x - side * 0.38, y - 0.02, side * 0.10);
      var almond = Math.pow(Math.abs(p.x) / 0.34, 1.70) + Math.pow(Math.abs(p.y) / 0.215, 1.34);
      var slantGate = p.y < 0.22 - Math.abs(p.x) * 0.12 && p.y > -0.24 + Math.abs(p.x) * 0.10;
      return almond < 1.0 && slantGate;
    }
    function noseCut(x, y, z) {
      if (z < 0.20 || y > -0.12 || y < -0.62) return false;
      var t = clampRange((-0.12 - y) / 0.50, 0, 1);
      var half = 0.050 + t * 0.185;
      return Math.abs(x) < half && z > 0.38 + t * 0.18;
    }
    function mouthGap(x, y, z) {
      return z > 0.18 && y < -0.66 && y > -1.03 && Math.abs(x) < 0.30;
    }
    function addEllipsoidSurface(count, cx, cy, cz, rx, ry, rz, yMin, yMax, k, frontBias) {
      var made = 0, guard = 0;
      while (made < count && guard < count * 8) {
        guard++;
        var theta = frontBias
          ? (-Math.PI * 0.07 + Math.random() * Math.PI * 1.14)
          : (Math.random() * Math.PI * 2);
        var phi = Math.acos(1 - Math.random() * 2);
        var sx = Math.sin(phi) * Math.cos(theta);
        var sy = Math.cos(phi);
        var sz = Math.sin(phi) * Math.sin(theta);
        var x = cx + sx * rx * (0.96 + Math.max(0, -sy) * 0.12);
        var y = cy + sy * ry;
        var z = cz + sz * rz;
        if (y < yMin || y > yMax) continue;
        if (eyeCut(x, y, z, -1) || eyeCut(x, y, z, 1) || noseCut(x, y, z) || mouthGap(x, y, z)) continue;
        var cheekCarve = z > 0.18 && y < -0.18 && y > -0.66 && Math.abs(x) > 0.26 && Math.abs(x) < 0.58 && Math.random() < 0.36;
        if (cheekCarve) continue;
        skullPushPoint(pos, seed, kind, x, y, z, k + Math.random() * 0.08);
        made++;
      }
    }

    addEllipsoidSurface(3150, 0, 0.46, 0.00, 0.93, 0.88, 0.58, -0.16, 1.35, 0.055, true);
    addEllipsoidSurface(2100, 0, -0.34, 0.10, 0.70, 0.66, 0.46, -0.95, 0.14, 0.10, true);
    for (var j = 0; j < 1450; j++) {
      var a = Math.random() * Math.PI * 2;
      var v = Math.random();
      var y = -1.16 + v * 0.48;
      var taper = clampRange((y + 1.16) / 0.48, 0, 1);
      var rx = 0.32 + taper * 0.31;
      var rz = 0.22 + taper * 0.18;
      var x = Math.cos(a) * rx;
      var z = 0.22 + Math.sin(a) * rz;
      if (mouthGap(x, y, z)) continue;
      if (y > -0.94 && Math.abs(x) < 0.22 && z > 0.18) continue;
      skullPushPoint(pos, seed, kind, x, y, z, 0.15 + Math.random() * 0.10);
    }

    [-1, 1].forEach(function (side) {
      var cx = side * 0.38;
      skullPushCurve(pos, seed, kind, 520, function (t) {
        var a = t * Math.PI * 2;
        var px = Math.cos(a) * (0.345 + Math.sin(a * 2.0) * 0.012);
        var py = Math.sin(a) * (0.205 + Math.cos(a * 2.0) * 0.010);
        var r = rotate2(px, py, -side * 0.10);
        return {
          x: cx + r.x,
          y: 0.02 + r.y - Math.max(0, Math.cos(a)) * 0.018,
          z: 0.72 + Math.sin(a * 2.0) * 0.030
        };
      }, 0.96, 0.010);
      skullPushCurve(pos, seed, kind, 330, function (t) {
        var x = side * (0.13 + t * 0.58);
        var y = 0.245 - t * 0.085 + Math.sin(t * Math.PI) * 0.055;
        return { x: x, y: y, z: 0.66 + Math.sin(t * Math.PI) * 0.055 };
      }, 0.98, 0.010);
      skullPushCurve(pos, seed, kind, 300, function (t) {
        return {
          x: side * (0.30 + t * 0.47),
          y: -0.18 - t * 0.25 + Math.sin(t * Math.PI) * 0.070,
          z: 0.69 - t * 0.095
        };
      }, 0.84, 0.012);
      skullPushCurve(pos, seed, kind, 330, function (t) {
        return {
          x: side * (0.62 - t * 0.20),
          y: -0.28 - t * 0.55 + Math.sin(t * Math.PI) * 0.065,
          z: 0.50 + Math.sin(t * Math.PI) * 0.070
        };
      }, 0.72, 0.014);
    });

    skullPushCurve(pos, seed, kind, 360, function (t) {
      var x = -0.72 + t * 1.44;
      return { x: x, y: 0.235 - Math.abs(x) * 0.055 + Math.sin(t * Math.PI) * 0.035, z: 0.62 + Math.sin(t * Math.PI) * 0.040 };
    }, 0.86, 0.012);
    [-1, 1].forEach(function (side) {
      skullPushCurve(pos, seed, kind, 260, function (t) {
        return { x: side * (0.035 + t * 0.205), y: -0.15 - t * 0.43, z: 0.79 - t * 0.035 };
      }, 0.98, 0.007);
    });
    skullPushCurve(pos, seed, kind, 240, function (t) {
      var x = -0.25 + t * 0.50;
      return { x: x, y: -0.62 + Math.sin(t * Math.PI) * 0.030, z: 0.70 };
    }, 0.86, 0.008);
    skullPushCurve(pos, seed, kind, 420, function (t) {
      var a = Math.PI + t * Math.PI;
      return { x: Math.cos(a) * 0.50, y: -0.98 + Math.sin(a) * 0.205, z: 0.46 + Math.sin(t * Math.PI) * 0.075 };
    }, 0.82, 0.014);
    skullPushCurve(pos, seed, kind, 360, function (t) {
      var x = -0.39 + t * 0.78;
      return { x: x, y: -0.70 + Math.sin(t * Math.PI) * 0.018, z: 0.73 };
    }, 0.96, 0.006);
    skullPushCurve(pos, seed, kind, 320, function (t) {
      var x = -0.36 + t * 0.72;
      return { x: x, y: -1.005 - Math.sin(t * Math.PI) * 0.018, z: 0.70 };
    }, 0.78, 0.008);
    for (var tooth = -4; tooth <= 4; tooth++) {
      var tx = tooth * 0.082;
      var height = tooth === 0 ? 0.30 : (0.25 + (4 - Math.abs(tooth)) * 0.012);
      skullPushCurve(pos, seed, kind, 58, function (t) {
        return { x: tx + Math.sin(t * Math.PI) * 0.006, y: -0.715 - t * height, z: 0.735 - t * 0.020 };
      }, 0.94, 0.004);
    }
    skullPushCurve(pos, seed, kind, 520, function (t) {
      var a = Math.PI * 0.12 + t * Math.PI * 0.76;
      return { x: Math.cos(a) * 0.98, y: 0.42 + Math.sin(a) * 0.92, z: 0.48 + Math.sin(t * Math.PI) * 0.10 };
    }, 0.70, 0.012);
    skullPushCurve(pos, seed, kind, 360, function (t) {
      var a = t * Math.PI * 2;
      return { x: Math.cos(a) * 0.52, y: -1.19 + Math.sin(a) * 0.082, z: 0.24 + Math.sin(a * 2.0) * 0.028 };
    }, 0.72, 0.010);
  }

  var geo = asset ? buildSkullParticleGeometryFromAsset(asset) : new THREE.BufferGeometry();
  if (!asset) {
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(new Float32Array(seed), 1));
    geo.setAttribute('kind', new THREE.BufferAttribute(new Float32Array(kind), 1));
  }
  var mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: dotTexture },
      uTime: uniforms.uTime,
      uPixel: uniforms.uPixel,
      uBass: uniforms.uBass,
      uMid: uniforms.uMid,
      uTreble: uniforms.uTreble,
      uBeat: uniforms.uBeat,
      uJawOpen: { value: 0 },
      uSkullFlash: { value: 0 },
      uPointScale: uniforms.uPointScale,
      uBloomStrength: uniforms.uBloomStrength,
      uColorBoost: uniforms.uColorBoost,
      uOpacity: { value: 0 },
      uColorA: { value: new THREE.Color('#b8ae98') },
      uColorB: { value: new THREE.Color('#fff4d8') },
      uShadow: { value: new THREE.Color('#100d0d') },
      uLight: { value: new THREE.Color('#ffe3a0') }
    },
    vertexShader: [
      'precision highp float;',
      'attribute float seed,kind;',
      'uniform float uTime,uPixel,uPointScale,uBloomStrength,uColorBoost;',
      'uniform float uBass,uMid,uTreble,uBeat,uJawOpen,uSkullFlash;',
      'varying float vKind,vLight,vRim,vAmp,vDensity,vFlash;',
      'void main(){',
      '  vec3 pos = position;',
      '  float jawGroup = step(1.0, kind);',
      '  float boneKind = fract(kind);',
      '  vKind = boneKind;',
      '  vec3 n = normalize(vec3(position.x * 0.82, position.y * 0.68, position.z * 1.22 + 0.16));',
      '  float toothBand = smoothstep(0.48, 0.70, position.z) * (1.0 - smoothstep(0.27, 0.48, abs(position.x))) * (1.0 - smoothstep(0.18, 0.46, abs(position.y + 0.72)));',
      '  float toothNoise = fract(sin(seed * 21.731 + floor((position.x + 0.52) * 21.0) * 5.137) * 43758.5453);',
      '  pos.y += toothBand * (toothNoise - 0.5) * 0.020;',
      '  pos.z += toothBand * (fract(sin(seed * 17.923 + position.y * 31.0) * 24634.6345) - 0.5) * 0.012;',
      '  float jawSidePull = jawGroup * smoothstep(-0.42, -1.06, position.y) * smoothstep(0.24, 0.62, abs(position.x)) * (1.0 - smoothstep(0.78, 1.04, abs(position.x))) * smoothstep(0.16, 0.70, position.z);',
      '  pos.x *= 1.0 - jawSidePull * 0.10;',
      '  float fallbackJaw = smoothstep(-0.48, -0.90, position.y) * smoothstep(0.08, 0.52, position.z) * (1.0 - smoothstep(0.62, 0.96, abs(position.x)));',
      '  float jawMask = jawGroup;',
      '  float jawSideAnchor = smoothstep(0.36, 0.66, abs(position.x)) * (1.0 - smoothstep(0.78, 0.98, abs(position.x))) * smoothstep(-0.34, -0.74, position.y) * (1.0 - smoothstep(0.62, 0.86, position.z));',
      '  float jawMotion = jawMask * (1.0 - jawSideAnchor * 0.32);',
      '  vec2 jawHinge = vec2(-0.45, 0.18);',
      '  float jawAngle = uJawOpen * 0.52 * jawMotion;',
      '  float jc = cos(jawAngle);',
      '  float js = sin(jawAngle);',
      '  vec2 jr = pos.yz - jawHinge;',
      '  vec2 openedJaw = vec2(jr.x * jc - jr.y * js, jr.x * js + jr.y * jc) + jawHinge;',
      '  pos.yz = mix(pos.yz, openedJaw, jawMotion);',
      '  float jawDrop = jawMotion * smoothstep(-0.32, -0.88, position.y) * (0.58 + smoothstep(0.18, 0.62, abs(position.x)) * 0.04);',
      '  float openDrive = clamp(uJawOpen, 0.0, 1.25);',
      '  pos.y -= jawDrop * (0.038 + openDrive * 0.100);',
      '  pos.z += jawDrop * (0.003 + openDrive * 0.014);',
      '  float ampDrive = smoothstep(0.20, 0.82, uBass * 0.44 + uMid * 0.22 + uBeat * 0.72);',
      '  float ampPhase = 0.50 + 0.50 * sin(uTime * (1.05 + uMid * 0.30) + seed * 6.2831);',
      '  vFlash = clamp(uSkullFlash * (0.68 + ampPhase * 0.32), 0.0, 1.0);',
      '  vAmp = clamp(ampDrive * 0.045 + vFlash * 0.92 + uTreble * 0.012, 0.0, 1.0);',
      '  vec4 mv = modelViewMatrix * vec4(pos, 1.0);',
      '  float dist = max(0.55, -mv.z);',
      '  vec3 vn = normalize(normalMatrix * n);',
      '  vec3 keyDir = normalize(vec3(-0.48, 0.64, 0.60));',
      '  vec3 lowDir = normalize(vec3(-0.10, -0.78, 0.34));',
      '  vec3 fillDir = normalize(vec3(0.36, -0.04, 0.64));',
      '  vec3 rimDir = normalize(vec3(0.88, 0.18, -0.44));',
      '  float key = pow(max(dot(vn, keyDir), 0.0), 1.18);',
      '  float low = pow(max(dot(vn, lowDir), 0.0), 1.34) * 0.10;',
      '  float fill = max(dot(vn, fillDir), 0.0) * 0.055;',
      '  float gothicShadow = smoothstep(-0.10, 0.36, dot(vn, normalize(vec3(0.44, -0.06, -0.58))));',
      '  float dentalLift = smoothstep(0.48, 0.72, position.z) * (1.0 - smoothstep(0.30, 0.54, abs(position.x))) * (1.0 - smoothstep(0.18, 0.48, abs(position.y + 0.70))) * (0.62 + toothNoise * 0.20);',
      '  vRim = pow(max(dot(vn, rimDir), 0.0), 2.50) * (0.24 + uBloomStrength * 0.08 + vFlash * 0.62);',
      '  float dust = fract(sin(seed * 13.871 + position.x * 19.7 + position.y * 7.1) * 43758.5453);',
      '  vDensity = clamp(0.30 + key * 0.70 + vRim * 0.24 - gothicShadow * 0.24 + dust * 0.025 + vFlash * 0.08, 0.16, 1.20);',
      '  vLight = clamp(0.115 + key * 1.02 + low + fill + dentalLift * 0.20 + boneKind * 0.070 + vAmp * 0.56 - gothicShadow * 0.08, 0.035, 1.72);',
      '  float scaleCtl = clamp(uPointScale, 0.48, 2.35);',
      '  float size = (0.035 + boneKind * 0.026) * (0.84 + vDensity * 0.22 + vLight * 0.13 + uBloomStrength * 0.030 + vFlash * 0.18);',
      '  gl_PointSize = clamp(size * uPixel * scaleCtl * 128.0 / dist, 0.95, 7.60);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D uMap;',
      'uniform vec3 uColorA,uColorB,uShadow,uLight;',
      'uniform float uOpacity,uBloomStrength,uColorBoost;',
      'varying float vKind,vLight,vRim,vAmp,vDensity,vFlash;',
      'void main(){',
      '  vec4 tex = texture2D(uMap, gl_PointCoord);',
      '  if(tex.a < 0.070) discard;',
      '  float contrast = clamp(uColorBoost, 0.50, 2.00);',
      '  float lit = clamp(pow(vLight, mix(1.18, 0.74, (contrast - 0.50) / 1.50)), 0.0, 1.28);',
      '  vec3 bone = mix(uColorA, uColorB, clamp((vKind - 0.34) * 2.0 + lit * 0.18, 0.0, 1.0));',
      '  vec3 col = mix(uShadow, bone, clamp(lit, 0.0, 1.0));',
      '  col = mix(col, uLight, clamp(vRim * (0.14 + uBloomStrength * 0.035 + vFlash * 0.40), 0.0, 0.54));',
      '  col = mix(col, uLight, clamp(vAmp * (0.09 + uBloomStrength * 0.025) + vFlash * 0.56, 0.0, 0.68));',
      '  float alpha = tex.a * uOpacity * clamp(0.20 + lit * 0.44 + vDensity * 0.40 + vRim * 0.10 + vFlash * 0.46, 0.12, 1.56);',
      '  gl_FragColor = vec4(col, alpha);',
      '}'
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending
  });
  skullParticleGroup = new THREE.Points(geo, mat);
  skullParticleGroup.frustumCulled = false;
  skullParticleGroup.visible = false;
  skullParticleGroup.userData.source = asset ? 'asset' : 'fallback';
  skullParticleGroup.position.set(SKULL_MODEL_BASE_POSITION.x, SKULL_MODEL_BASE_POSITION.y, SKULL_MODEL_BASE_POSITION.z);
  skullParticleGroup.scale.setScalar(SKULL_MODEL_SCALE);
  skullParticleGroup.rotation.x = SKULL_MODEL_BASE_ROTATION_X;
  skullParticleGroup.rotation.y = SKULL_MODEL_BASE_ROTATION_Y;
  skullParticleGroup.renderOrder = 32;
  syncSkullParticleColors();
  scene.add(skullParticleGroup);
  return skullParticleGroup;
}
function isSkullShelfCompositionActive() {
  if (!(fx && fx.preset === SKULL_PRESET_INDEX)) return false;
  if (!shelfManager || !shelfManager.getMode || shelfManager.getMode() !== 'side') return false;
  if (shelfPinnedOpen || shelfVisibility > 0.18) return true;
  return !!(shelfManager.hasOpenContent && shelfManager.hasOpenContent());
}
function clearSkullPresetResidue() {
  skullParticleOpacity = 0;
  skullAmpPulse = 0;
  skullBeatFlash = 0;
  skullJawOpen = 0;
  skullCameraBlend = 0;
  if (!skullParticleGroup) return;
  skullParticleGroup.visible = false;
  if (skullParticleGroup.material && skullParticleGroup.material.uniforms) {
    if (skullParticleGroup.material.uniforms.uOpacity) skullParticleGroup.material.uniforms.uOpacity.value = 0;
    if (skullParticleGroup.material.uniforms.uJawOpen) skullParticleGroup.material.uniforms.uJawOpen.value = 0;
    if (skullParticleGroup.material.uniforms.uSkullFlash) skullParticleGroup.material.uniforms.uSkullFlash.value = 0;
  }
}
function resetSkullPresetView(immediate, opts) {
  opts = opts || {};
  if (!(fx && fx.preset === SKULL_PRESET_INDEX)) return;
  skullWheelZoomTarget = 0;
  if (!opts.smooth) skullWheelZoom = 0;
  skullCameraBlend = Math.max(skullCameraBlend, 1);
  if (!opts.keepLyricLock && typeof stageLyrics !== 'undefined' && stageLyrics && stageLyrics.group && stageLyrics.group.userData) stageLyrics.group.userData.skullMouthLocked = false;
  if (!opts.keepLyricLock && typeof requestStageLyricCameraSnap === 'function') requestStageLyricCameraSnap(10);
  if (!immediate || !skullParticleGroup) return;
  var shelfComposition = isSkullShelfCompositionActive();
  skullShelfCameraMix = shelfComposition ? 1 : 0;
  skullParticleGroup.position.set(shelfComposition ? -1.18 : SKULL_MODEL_BASE_POSITION.x, shelfComposition ? 0.32 : SKULL_MODEL_BASE_POSITION.y, SKULL_MODEL_BASE_POSITION.z);
  skullParticleGroup.scale.setScalar(shelfComposition ? 3.02 : SKULL_MODEL_SCALE);
  skullParticleGroup.rotation.set(SKULL_MODEL_BASE_ROTATION_X, SKULL_MODEL_BASE_ROTATION_Y, 0);
  skullParticleGroup.updateMatrixWorld(true);
  if (camera && typeof setSkullCameraTargetVectors === 'function') {
    var portrait = innerHeight > innerWidth * 1.08;
    setSkullCameraTargetVectors(skullCameraTargetPos, skullCameraTargetLook, portrait, shelfComposition, 0);
    camera.position.copy(skullCameraTargetPos);
    skullCameraMixedLook.copy(skullCameraTargetLook);
    camera.lookAt(skullCameraMixedLook);
    camera.updateProjectionMatrix();
  }
}
function skullBreathOffset(t, shelfComposition) {
  var strength = shelfComposition ? 0.70 : 1.0;
  return {
    x: strength * (Math.sin(t * 0.33 + 1.7) * 0.028 + Math.sin(t * 0.61 + 0.4) * 0.010),
    y: strength * (Math.sin(t * 0.38 + 0.2) * 0.036 + Math.sin(t * 0.83 + 2.1) * 0.012),
    z: strength * (Math.sin(t * 0.24 + 2.6) * 0.026)
  };
}
function setSkullCameraTargetVectors(pos, look, portrait, shelfComposition, zoom) {
  zoom = Number(zoom) || 0;
  if (shelfComposition) {
    pos.set(portrait ? -0.06 : 0.00, portrait ? -2.36 : -2.50, (portrait ? 4.88 : 4.96) + zoom * 0.78);
    look.set(portrait ? -0.04 : 0.00, portrait ? -0.26 : -0.20, 0.03);
    return;
  }
  pos.set(0.00, portrait ? -2.38 : -2.52, (portrait ? 4.92 : 4.98) + zoom);
  look.set(0.00, portrait ? -0.28 : -0.20, 0.02);
}
function applySkullCameraCinemaMotion(portrait, shelfComposition) {
  if (!camera || !fx || !fx.cinema) return;
  var shake = clampRange(Number(fx.cinemaShake) || 0, 0, 1.8);
  if (shake <= 0.001) return;
  var shelfDamp = shelfComposition ? 0.52 : 1.0;
  var idleDamp = (orbit && orbit.rotating ? 0.24 : 1.0) * shelfDamp * shake;
  var beatDamp = shelfDamp * shake;
  skullCameraCinemaRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  skullCameraCinemaUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
  camera.getWorldDirection(skullCameraCinemaForward).normalize();
  var lateral = Math.sin(cinemaT * 0.08) * 0.030 * idleDamp + beatCam.thetaKick * 0.78 * beatDamp;
  var vertical = Math.sin(cinemaT * 0.06 + 1.0) * 0.024 * idleDamp + beatCam.phiKick * 0.68 * beatDamp;
  var depth = Math.sin(cinemaT * 0.04 + 2.0) * 0.075 * idleDamp - beatCam.radiusKick * 0.58 * beatDamp;
  if (portrait) {
    lateral *= 0.72;
    vertical *= 0.88;
  }
  camera.position.addScaledVector(skullCameraCinemaRight, lateral);
  camera.position.addScaledVector(skullCameraCinemaUp, vertical);
  camera.position.addScaledVector(skullCameraCinemaForward, depth);
  camera.lookAt(skullCameraMixedLook);
  camera.rotation.z += beatCam.rollKick * beatDamp * (shelfComposition ? 0.42 : 0.70);
}
function applySkullCameraPose(dt) {
  if (freeCamera && (freeCamera.active || freeCamera.locked || freeCamera.resetTween)) return;
  var active = fx && fx.preset === SKULL_PRESET_INDEX;
  skullCameraBlend += ((active ? 1 : 0) - skullCameraBlend) * Math.min(1, dt * (active ? 4.8 : 7.2));
  if (skullCameraBlend < 0.002) return;
  skullWheelZoom += (skullWheelZoomTarget - skullWheelZoom) * Math.min(1, dt * 8.0);
  var portrait = innerHeight > innerWidth * 1.08;
  var shelfComposition = isSkullShelfCompositionActive();
  var shelfMixTarget = shelfComposition ? 1 : 0;
  skullShelfCameraMix += (shelfMixTarget - skullShelfCameraMix) * Math.min(1, dt * (shelfMixTarget > skullShelfCameraMix ? 4.6 : 5.8));
  if (Math.abs(skullShelfCameraMix - shelfMixTarget) < 0.002) skullShelfCameraMix = shelfMixTarget;
  setSkullCameraTargetVectors(skullCameraBasePos, skullCameraBaseLook, portrait, false, skullWheelZoom);
  setSkullCameraTargetVectors(skullCameraShelfPos, skullCameraShelfLook, portrait, true, skullWheelZoom);
  skullCameraTargetPos.copy(skullCameraBasePos).lerp(skullCameraShelfPos, skullShelfCameraMix);
  skullCameraTargetLook.copy(skullCameraBaseLook).lerp(skullCameraShelfLook, skullShelfCameraMix);
  camera.position.lerp(skullCameraTargetPos, skullCameraBlend);
  skullCameraMixedLook.set(orbit.lookAt.x, orbit.lookAt.y, orbit.lookAt.z).lerp(skullCameraTargetLook, skullCameraBlend);
  camera.lookAt(skullCameraMixedLook);
  applySkullCameraCinemaMotion(portrait, shelfComposition);
  camera.updateProjectionMatrix();
}
function updateSkullParticleLayer(dt) {
  var active = fx && fx.preset === SKULL_PRESET_INDEX;
  if (active && !skullParticleAsset.data && !skullParticleAsset.failed) {
    loadSkullParticleAsset();
    return;
  }
  if (active && !skullParticleAsset.data) return;
  if (active) createSkullParticleLayer();
  if (!skullParticleGroup) return;
  var target = active ? 1 : 0;
  skullParticleOpacity += (target - skullParticleOpacity) * Math.min(1, dt * (active ? 3.2 : 2.4));
  if (skullParticleOpacity < 0.006 && !active) {
    skullParticleGroup.visible = false;
    return;
  }
  skullParticleGroup.visible = true;
  skullParticleGroup.material.uniforms.uOpacity.value = skullParticleOpacity * clampRange(0.78 + (fx.intensity || 0.85) * 0.18, 0.56, 1.0);
  var beatTransient = clampRange(Math.max(0, beatPulse - 0.16) / 0.84, 0, 1.35);
  var flashTarget = clampRange(Math.pow(beatTransient, 1.34) * 1.08 + Math.max(0, bass - 0.60) * 0.18 * beatTransient, 0, 1);
  skullBeatFlash += (flashTarget - skullBeatFlash) * Math.min(1, dt * (flashTarget > skullBeatFlash ? 24.0 : 6.2));
  if (skullParticleGroup.material.uniforms.uSkullFlash) skullParticleGroup.material.uniforms.uSkullFlash.value = skullBeatFlash;
  var jawTarget = clampRange(0.60 + (0.5 + 0.5 * Math.sin(uniforms.uTime.value * 0.50)) * 0.050 + bass * 0.060 + skullBeatFlash * 0.090, 0.52, 0.88);
  skullJawOpen += (jawTarget - skullJawOpen) * Math.min(1, dt * (jawTarget > skullJawOpen ? 7.8 : 3.4));
  if (skullParticleGroup.material.uniforms.uJawOpen) skullParticleGroup.material.uniforms.uJawOpen.value = skullJawOpen;
  var shelfComposition = isSkullShelfCompositionActive();
  var shelfMix = clampRange(skullShelfCameraMix || (shelfComposition ? 1 : 0), 0, 1);
  var drift = skullBreathOffset(uniforms.uTime.value, shelfComposition);
  var ampTarget = clampRange(bass * 0.006 + mid * 0.004 + skullBeatFlash * 0.070, 0, 0.090);
  skullAmpPulse += (ampTarget - skullAmpPulse) * Math.min(1, dt * (ampTarget > skullAmpPulse ? 11.0 : 4.0));
  var shelfScale = 3.02;
  var targetScale = (SKULL_MODEL_SCALE + (shelfScale - SKULL_MODEL_SCALE) * shelfMix) * (1 + skullAmpPulse) * clampRange(1 - skullWheelZoom * 0.055, 0.92, 1.08);
  var shelfX = -1.18;
  var shelfY = 0.32;
  var targetX = (SKULL_MODEL_BASE_POSITION.x + (shelfX - SKULL_MODEL_BASE_POSITION.x) * shelfMix) + drift.x;
  var targetY = (SKULL_MODEL_BASE_POSITION.y + (shelfY - SKULL_MODEL_BASE_POSITION.y) * shelfMix) + drift.y;
  var targetZ = SKULL_MODEL_BASE_POSITION.z + drift.z;
  skullParticleGroup.position.x += (targetX - skullParticleGroup.position.x) * Math.min(1, dt * 4.2);
  skullParticleGroup.position.y += (targetY - skullParticleGroup.position.y) * Math.min(1, dt * 4.8);
  skullParticleGroup.position.z += (targetZ - skullParticleGroup.position.z) * Math.min(1, dt * 4.2);
  skullParticleGroup.scale.x += (targetScale - skullParticleGroup.scale.x) * Math.min(1, dt * 4.6);
  skullParticleGroup.scale.y = skullParticleGroup.scale.x;
  skullParticleGroup.scale.z = skullParticleGroup.scale.x;
  var targetRotY = SKULL_MODEL_BASE_ROTATION_Y + (orbit.centerLocked ? 0 : (headParallax.active ? headParallax.x * 0.5 : 0) + gestureRotation.y);
  var targetRotX = SKULL_MODEL_BASE_ROTATION_X + (orbit.centerLocked ? 0 : (headParallax.active ? -headParallax.y * 0.35 : 0) + gestureRotation.x);
  var rotEase = Math.min(1, dt * 7.4);
  skullParticleGroup.rotation.y += (targetRotY - skullParticleGroup.rotation.y) * rotEase;
  skullParticleGroup.rotation.x += (targetRotX - skullParticleGroup.rotation.x) * rotEase;
  skullParticleGroup.rotation.z += (0 - skullParticleGroup.rotation.z) * Math.min(1, dt * 6.0);
}

// ============================================================
//  封面背面粒子层 (v7.2)
//   - 独立 Points, 放在 z=-1.5 (主封面平面背面)
//   - 颜色取自封面镜像 UV
//   - 慢呼吸 + 小幅 noise 漂移
//   - 跟主粒子同步旋转 (在主循环里赋值)
//   - 视角转到背面才能看到 — 不需要手动控制 visible
// ============================================================
var BACK_COVER_COUNT = 3000;
var backCoverGroup = null;
var backCoverColorArr = null;

function createBackCoverLayer() {
  if (backCoverGroup) return;
  var bg = new THREE.BufferGeometry();
  var bp = new Float32Array(BACK_COVER_COUNT * 3);
  var bc = new Float32Array(BACK_COVER_COUNT * 3);
  var br = new Float32Array(BACK_COVER_COUNT);
  var bu = new Float32Array(BACK_COVER_COUNT * 2);  // 镜像 UV 用于采样封面
  for (var i = 0; i < BACK_COVER_COUNT; i++) {
    var u = Math.random();
    var v = Math.random();
    // 在 PLANE_SIZE 范围内分布
    bp[i * 3] = (u - 0.5) * PLANE_SIZE;
    bp[i * 3 + 1] = (v - 0.5) * PLANE_SIZE;
    bp[i * 3 + 2] = -1.5 - Math.random() * 0.4;  // 在主平面后方
    bu[i * 2] = 1.0 - u;  // 镜像 X
    bu[i * 2 + 1] = v;
    br[i] = Math.random();
    bc[i * 3] = 0.7; bc[i * 3 + 1] = 0.6; bc[i * 3 + 2] = 0.8;  // 占位
  }
  bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
  bg.setAttribute('aColor', new THREE.BufferAttribute(bc, 3));
  bg.setAttribute('aRand', new THREE.BufferAttribute(br, 1));
  bg.setAttribute('aUv', new THREE.BufferAttribute(bu, 2));

  var vs = `
precision highp float;
uniform float uTime, uBass, uPixel, uAlpha;
attribute vec3 aColor;
attribute vec2 aUv;
attribute float aRand;
varying vec3 vC;
varying float vA;
void main(){
  vec3 pos = position;
  // 缓慢呼吸
  pos.x += sin(uTime * 0.20 + aRand * 8.0) * 0.20;
  pos.y += cos(uTime * 0.18 + aRand * 6.0) * 0.22;
  pos.z += sin(uTime * 0.12 + aRand * 5.0) * 0.18 + uBass * 0.12 * sin(aRand * 11.0);
  vC = aColor;
  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  float dist = -mvPos.z;
  vA = clamp(0.30 + 0.4 * sin(uTime * 0.6 + aRand * 5.0), 0.10, 0.65);
  float sz = clamp(46.0 / max(0.5, dist), 1.4, 4.5);
  gl_PointSize = sz * uPixel;
  gl_Position = projectionMatrix * mvPos;
}
  `;
  var fs = `
precision highp float;
uniform sampler2D uDotTex;
uniform float uAlpha;
varying vec3 vC;
varying float vA;
void main(){
  vec4 tex = texture2D(uDotTex, gl_PointCoord);
  if (tex.a < 0.02) discard;
  gl_FragColor = vec4(vC, tex.a * vA * uAlpha);
}
  `;
  var mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uBass: uniforms.uBass,
      uPixel: uniforms.uPixel,
      uDotTex: uniforms.uDotTex,
      uAlpha: uniforms.uAlpha,
    },
    vertexShader: vs, fragmentShader: fs,
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
  });
  backCoverGroup = new THREE.Points(bg, mat);
  backCoverGroup.frustumCulled = false;
  backCoverColorArr = bc;
  scene.add(backCoverGroup);
}

function destroyBackCoverLayer() {
  if (!backCoverGroup) return;
  scene.remove(backCoverGroup);
  backCoverGroup.geometry.dispose(); backCoverGroup.material.dispose();
  backCoverGroup = null; backCoverColorArr = null;
}

function refreshBackCoverColorsFromCanvas(coverCanvas) {
  if (!backCoverGroup || !coverCanvas || !backCoverColorArr) return;
  var ctx = coverCanvas.getContext('2d');
  var img = ctx.getImageData(0, 0, coverCanvas.width, coverCanvas.height).data;
  var w = coverCanvas.width, h = coverCanvas.height;
  var attr = backCoverGroup.geometry.attributes;
  var uvA = attr.aUv.array;
  for (var i = 0; i < BACK_COVER_COUNT; i++) {
    var u = uvA[i * 2], v = uvA[i * 2 + 1];
    var sx = Math.floor(u * w);
    var sy = Math.floor(v * h);
    var di = (sy * w + sx) * 4;
    backCoverColorArr[i * 3] = img[di] / 255 * 0.85;
    backCoverColorArr[i * 3 + 1] = img[di + 1] / 255 * 0.85;
    backCoverColorArr[i * 3 + 2] = img[di + 2] / 255 * 0.85;
  }
  attr.aColor.needsUpdate = true;
}
function updateFloatLayer(dt) {
  // 漂移已在 shader 中完成, JS 不需要每帧改 buffer
}
function refreshFloatColorsFromCover(coverCanvas) {
  if (!floatGroup || !coverCanvas) return;
  var ctx = coverCanvas.getContext('2d');
  var img = ctx.getImageData(0, 0, coverCanvas.width, coverCanvas.height).data;
  var w = coverCanvas.width, h = coverCanvas.height;
  for (var i = 0; i < FLOAT_COUNT; i++) {
    var sx = Math.floor(Math.random() * w);
    var sy = Math.floor(Math.random() * h);
    var di = (sy * w + sx) * 4;
    floatColorArr[i * 3] = img[di] / 255 * 0.95;
    floatColorArr[i * 3 + 1] = img[di + 1] / 255 * 0.95;
    floatColorArr[i * 3 + 2] = img[di + 2] / 255 * 0.95;
  }
  floatGroup.geometry.attributes.aColor.needsUpdate = true;
}
function resetFloatColorsToIdle() {
  if (!floatGroup || !floatColorArr) return;
  for (var i = 0; i < FLOAT_COUNT; i++) {
    var white = 0.88 + (i % 17) / 17 * 0.12;
    floatColorArr[i * 3] = white;
    floatColorArr[i * 3 + 1] = white;
    floatColorArr[i * 3 + 2] = white;
  }
  floatGroup.geometry.attributes.aColor.needsUpdate = true;
}

// ============================================================
//  舞台歌词系统 v9 — Three.js 文字平面, 跟随专辑粒子 3D 运动
