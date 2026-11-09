var lyricsParticles = null;
var lyricsGeo = null;

// 三个 attribute: 源位置(随机扩散态), 目标位置(组成字), color, brightness
var lyricsAttrTargetA = null;
var lyricsAttrTargetB = null;
var lyricsAttrSeed = null;

function createLyricsParticles() {
  if (stageLyrics.group) {
    ensureLyricStarRiver();
    return;
  }
  stageLyrics.group = new THREE.Group();
  stageLyrics.group.renderOrder = 38;
  scene.add(stageLyrics.group);
  ensureLyricStarRiver();
}

function ensureLyricStarRiver() {
  if (!stageLyrics.group || stageLyrics.starRiver) return stageLyrics.starRiver;
  var count = 420;
  var geo = new THREE.BufferGeometry();
  var seeds = new Float32Array(count);
  var lanes = new Float32Array(count);
  var depths = new Float32Array(count);
  for (var i = 0; i < count; i++) {
    seeds[i] = Math.random() * 1000;
    lanes[i] = Math.random();
    depths[i] = Math.random();
  }
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute('lane', new THREE.BufferAttribute(lanes, 1));
  geo.setAttribute('depthSeed', new THREE.BufferAttribute(depths, 1));
  var mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: dotTexture },
      uTime: uniforms.uTime,
      uPixel: uniforms.uPixel,
      uBass: uniforms.uBass,
      uBeat: uniforms.uBeat,
      uWidth: { value: stageLyrics.starRiverWidth || 4.2 },
      uHeight: { value: stageLyrics.starRiverHeight || 0.58 },
      uOpacity: { value: 0 },
      uColorA: { value: lyricThreeColor(stageLyrics.palette.secondary, '#9cffdf', 0.42) },
      uColorB: { value: lyricThreeColor(stageLyrics.palette.highlight, '#fff7d2', 0.44) }
    },
    vertexShader: [
      'precision highp float;',
      'attribute float seed,lane,depthSeed;',
      'uniform float uTime,uPixel,uBass,uBeat,uWidth,uHeight;',
      'varying float vSeed,vLane,vGlow;',
      'float hash(float n){return fract(sin(n)*43758.5453123);}',
      'void main(){',
      '  float laneBand = floor(lane * 5.0);',
      '  float laneLocal = fract(lane * 5.0);',
      '  float speed = 0.030 + hash(seed * 1.71) * 0.055 + laneBand * 0.005;',
      '  float flow = fract(hash(seed * 2.13) + uTime * speed);',
      '  float x = (flow - 0.5) * uWidth * (1.08 + hash(seed * 5.1) * 0.18);',
      '  float curve = sin(flow * 6.2831853 * (0.92 + hash(seed * 4.0) * 0.46) + seed * 0.071 + uTime * 0.34);',
      '  float breath = sin(uTime * (0.42 + hash(seed * 6.9) * 0.42) + seed * 0.093);',
      '  float y = (laneBand - 2.0) * uHeight * 0.135 + curve * uHeight * (0.20 + hash(seed * 9.0) * 0.18) + (laneLocal - 0.5) * uHeight * 0.16 + breath * uHeight * 0.10;',
      '  float z = -0.08 + (depthSeed - 0.5) * 0.44 + sin(uTime * (0.18 + hash(seed) * 0.24) + seed) * 0.08;',
      '  vec3 pos = vec3(x, y, z);',
      '  float edge = smoothstep(0.0, 0.18, flow) * (1.0 - smoothstep(0.82, 1.0, flow));',
      '  vSeed = seed;',
      '  vLane = lane;',
      '  vGlow = edge * (0.62 + 0.38 * sin(uTime * (0.9 + hash(seed * 8.0) * 0.7) + seed));',
      '  vec4 mv = modelViewMatrix * vec4(pos, 1.0);',
      '  float dist = max(0.45, -mv.z);',
      '  float size = (0.030 + hash(seed * 12.0) * 0.040 + vGlow * 0.024 + uBeat * 0.010) * (1.0 + uBass * 0.18);',
      '  gl_PointSize = clamp(size * uPixel * 120.0 / dist, 1.0, 7.2);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D uMap;',
      'uniform vec3 uColorA,uColorB;',
      'uniform float uOpacity,uTime,uBeat;',
      'varying float vSeed,vLane,vGlow;',
      'void main(){',
      '  vec4 tex = texture2D(uMap, gl_PointCoord);',
      '  if(tex.a < 0.02) discard;',
      '  float tw = pow(0.5 + 0.5 * sin(uTime * (0.55 + fract(vSeed) * 0.35) + vSeed), 4.0);',
      '  vec3 col = mix(uColorA, uColorB, smoothstep(0.12, 0.92, vLane) * 0.45 + tw * 0.42 + vGlow * 0.26);',
      '  float alpha = tex.a * uOpacity * (0.20 + vGlow * 0.78 + tw * 0.32 + uBeat * 0.10);',
      '  gl_FragColor = vec4(col * (0.82 + vGlow * 0.72 + tw * 0.32), alpha);',
      '}'
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });
  var points = new THREE.Points(geo, mat);
  points.renderOrder = 45;
  points.frustumCulled = false;
  points.position.set(0, 0.20, 1.53);
  stageLyrics.group.add(points);
  stageLyrics.starRiver = points;
  return points;
}

function disposeLyricStarRiver() {
  var river = stageLyrics && stageLyrics.starRiver;
  if (!river) return;
  if (river.parent) river.parent.remove(river);
  if (river.geometry) river.geometry.dispose();
  if (river.material) river.material.dispose();
  stageLyrics.starRiver = null;
}

function updateLyricStarRiver(dt) {
  var river = ensureLyricStarRiver();
  if (!river || !river.material || !river.material.uniforms) return;
  var u = river.material.uniforms;
  if (fx && fx.preset === SKULL_PRESET_INDEX) {
    river.visible = false;
    u.uOpacity.value += (0 - u.uOpacity.value) * 0.18;
    return;
  }
  river.visible = true;
  var data = stageLyrics.current && stageLyrics.current.userData ? stageLyrics.current.userData.lyric : null;
  var targetW = data ? clampRange((data.textWorldW || data.worldW || 4.2) * 1.12 + 0.80, 2.25, 7.20) : 3.4;
  var targetH = data ? clampRange((data.textWorldH || data.worldH || 0.58) * 1.85 + 0.18, 0.52, 1.35) : 0.58;
  stageLyrics.starRiverWidth += (targetW - stageLyrics.starRiverWidth) * Math.min(1, dt * 5.2);
  stageLyrics.starRiverHeight += (targetH - stageLyrics.starRiverHeight) * Math.min(1, dt * 4.6);
  u.uWidth.value = stageLyrics.starRiverWidth;
  u.uHeight.value = stageLyrics.starRiverHeight;
  var lyricGlowStrength = fx.lyricGlow ? Math.min(0.85, Math.max(0, fx.lyricGlowStrength)) : 0;
  var targetOpacity = (stageLyrics.current && fx.lyricGlowParticles)
    ? clampRange(0.22 + lyricGlowStrength * 0.58 + stageLyrics.highBloom * 0.16 + stageLyrics.beatGlow * 0.12, 0.16, 0.86)
    : 0;
  u.uOpacity.value += (targetOpacity - u.uOpacity.value) * (targetOpacity > u.uOpacity.value ? 0.10 : 0.055);
  u.uColorA.value.copy(lyricThreeColor(stageLyrics.palette.secondary || stageLyrics.palette.primary, '#9cffdf', 0.42));
  u.uColorB.value.copy(lyricThreeColor(stageLyrics.palette.highlight || stageLyrics.palette.primary, '#fff7d2', 0.46));
  river.visible = u.uOpacity.value > 0.01 || !!stageLyrics.current;
  var t = uniforms.uTime.value;
  river.position.y += ((0.18 + Math.sin(t * 0.44) * 0.035 + Math.sin(t * 0.91 + 1.7) * 0.018) - river.position.y) * 0.08;
  river.position.z += ((1.54 + Math.cos(t * 0.31) * 0.060) - river.position.z) * 0.08;
  river.rotation.z = Math.sin(t * 0.22) * 0.012;
}

var lyricDisposeQueue = [];
var lyricDisposeTimer = 0;

function disposeOwnedLyricTexture(texture) {
  if (!texture || !texture.userData || !texture.userData.__mineradioLyricOwned || texture.userData.__mineradioDisposed) return;
  texture.userData.__mineradioDisposed = true;
  texture.dispose();
}

function disposeLyricMaterial(material) {
  if (!material) return;
  disposeOwnedLyricTexture(material.map);
  if (material.uniforms && material.uniforms.uMap) disposeOwnedLyricTexture(material.uniforms.uMap.value);
  material.dispose();
}

function flushLyricDisposeQueue() {
  lyricDisposeTimer = 0;
  var startedAt = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  var processed = 0;
  while (lyricDisposeQueue.length && processed < 12) {
    var job = lyricDisposeQueue[0];
    if (job.index < job.objects.length) {
      var obj = job.objects[job.index++];
      if (obj && obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(disposeLyricMaterial);
        else disposeLyricMaterial(obj.material);
      }
      if (obj && obj.geometry) obj.geometry.dispose();
      processed += 1;
    } else {
      (job.masks || []).forEach(function (mask) {
        if (mask && mask.texture) disposeOwnedLyricTexture(mask.texture);
      });
      lyricDisposeQueue.shift();
    }
    var now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    if (processed > 0 && now - startedAt >= 4.5) break;
  }
  if (typeof window !== 'undefined') {
    window.__mineradioLyricDisposeStats = {
      pendingMeshes: lyricDisposeQueue.length,
      lastChunkObjects: processed,
      lastChunkMs: Math.max(0, (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - startedAt)
    };
  }
  if (lyricDisposeQueue.length) lyricDisposeTimer = setTimeout(flushLyricDisposeQueue, 8);
}

function disposeLyricMesh(mesh) {
  if (!mesh || mesh.userData && mesh.userData.__mineradioDisposeQueued) return;
  mesh.userData = mesh.userData || {};
  mesh.userData.__mineradioDisposeQueued = true;
  var lyricData = mesh.userData.lyric;
  if (lyricData && typeof disposeLyricQualityOwner === 'function') {
    disposeLyricQualityOwner(lyricData);
  } else if (lyricData && Array.isArray(lyricData.rowLayers) && typeof releaseLyricRowQuality === 'function') {
    lyricData.rowLayers.forEach(function (row) { releaseLyricRowQuality(row, true); });
    if (typeof pruneLyricQualityQueue === 'function') pruneLyricQualityQueue(typeof lyricQualityNowMs === 'function' ? lyricQualityNowMs() : Date.now());
  }
  if (mesh.parent) mesh.parent.remove(mesh);
  var objects = [];
  mesh.traverse(function (obj) { objects.push(obj); });
  lyricDisposeQueue.push({
    objects: objects,
    index: 0,
    masks: lyricData ? [lyricData.mask, lyricData.activeMask, lyricData.contextMask] : []
  });
  if (!lyricDisposeTimer) lyricDisposeTimer = setTimeout(flushLyricDisposeQueue, 0);
}
