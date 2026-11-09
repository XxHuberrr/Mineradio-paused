var lyricSunBloomTexture = null;
function getLyricSunBloomTexture() {
  if (lyricSunBloomTexture) return lyricSunBloomTexture;
  var canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  var cx = canvas.width * 0.50, cy = canvas.height * 0.50;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(2.05, 1);
  var radial = ctx.createRadialGradient(0, 0, 0, 0, 0, canvas.height * 0.43);
  radial.addColorStop(0.00, 'rgba(255,246,186,0.92)');
  radial.addColorStop(0.18, 'rgba(255,219,126,0.44)');
  radial.addColorStop(0.46, 'rgba(255,186,82,0.15)');
  radial.addColorStop(1.00, 'rgba(255,186,82,0)');
  ctx.fillStyle = radial;
  ctx.fillRect(-canvas.width, -canvas.height, canvas.width * 2, canvas.height * 2);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = 'blur(34px)';
  ctx.fillStyle = 'rgba(255,235,168,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, canvas.width * 0.33, canvas.height * 0.14, -0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = 'blur(58px)';
  ctx.fillStyle = 'rgba(255,214,122,0.11)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, canvas.width * 0.45, canvas.height * 0.19, -0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = 'blur(18px)';
  var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, canvas.width * 0.16);
  core.addColorStop(0.00, 'rgba(255,252,220,0.38)');
  core.addColorStop(0.34, 'rgba(255,230,158,0.20)');
  core.addColorStop(1.00, 'rgba(255,210,116,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  var xMask = ctx.createLinearGradient(0, 0, canvas.width, 0);
  xMask.addColorStop(0.00, 'rgba(255,255,255,0)');
  xMask.addColorStop(0.11, 'rgba(255,255,255,1)');
  xMask.addColorStop(0.89, 'rgba(255,255,255,1)');
  xMask.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = xMask;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  var yMask = ctx.createLinearGradient(0, 0, 0, canvas.height);
  yMask.addColorStop(0.00, 'rgba(255,255,255,0)');
  yMask.addColorStop(0.18, 'rgba(255,255,255,1)');
  yMask.addColorStop(0.82, 'rgba(255,255,255,1)');
  yMask.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = yMask;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  lyricSunBloomTexture = new THREE.CanvasTexture(canvas);
  lyricSunBloomTexture.minFilter = THREE.LinearFilter;
  lyricSunBloomTexture.magFilter = THREE.LinearFilter;
  lyricSunBloomTexture.generateMipmaps = false;
  return lyricSunBloomTexture;
}

function makeLyricShaderMaterial(mask, pal, motionProfile) {
  motionProfile = motionProfile || lyricMotionProfile();
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: mask.texture },
      uTime: uniforms.uTime,
      uProgress: { value: 0 },
      uTextMin: { value: mask.textMin },
      uTextMax: { value: mask.textMax },
      uOpacity: { value: 0 },
      uBaseColor: { value: lyricThreeColor(pal.primary, '#d6f8ff', 0.38) },
      uHiColor: { value: lyricThreeColor(pal.highlight || pal.primary, '#fff0b8', 0.48) },
      uGlowColor: { value: lyricStageGlowThreeColor(pal, '#9cffdf', 0.36) },
      uSolarColor: { value: lyricBeatGlowThreeColor(pal, '#fff0b8', 0.50) },
      uFeather: { value: lyricsHasNativeKaraoke ? 0.030 : 0.055 },
      uSolar: { value: 0 },
      uSweep: { value: motionProfile.sweep || 0 },
      uShimmer: { value: motionProfile.shimmer || 0 },
      uGlitch: { value: motionProfile.glitch || 0 },
      uGlitchSlice: { value: motionProfile.glitchSlice || 0 },
      uGlitchChroma: { value: motionProfile.glitchChroma || 0 },
      uGlitchRate: { value: motionProfile.glitchRate || 1 },
      uGlitchSeed: { value: Math.random() * 997.0 },
      uGlitchBurst: { value: 0 },
      uEdgeBoost: { value: motionProfile.edgeBoost || 1 },
      uActiveMix: { value: 1 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D uMap;',
      'uniform float uTime,uProgress,uTextMin,uTextMax,uOpacity,uFeather,uSolar,uSweep,uShimmer,uGlitch,uGlitchSlice,uGlitchChroma,uGlitchRate,uGlitchSeed,uGlitchBurst,uEdgeBoost,uActiveMix;',
      'uniform vec3 uBaseColor,uHiColor,uGlowColor,uSolarColor;',
      'varying vec2 vUv;',
      'float hash(float n){ return fract(sin(n) * 43758.5453123); }',
      'float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }',
      'void main(){',
      '  vec2 uv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);',
      '  float sliceRows = mix(16.0, 38.0, clamp(uGlitchSlice / 1.4, 0.0, 1.0));',
      '  float row = floor((uv.y + hash(uGlitchSeed) * 0.035) * sliceRows);',
      '  float timeSlot = floor(uTime * mix(7.0, 24.0, clamp(uGlitchRate / 2.2, 0.0, 1.0)) + hash(uGlitchSeed * 1.37) * 5.0);',
      '  float rowRnd = hash2(vec2(row + uGlitchSeed, timeSlot));',
      '  float phaseRnd = hash2(vec2(timeSlot + uGlitchSeed * 0.71, row * 3.17));',
      '  float glitchGate = smoothstep(0.74, 0.99, rowRnd + uGlitchBurst * 0.28) * step(0.001, uGlitch);',
      '  float glitchDir = hash2(vec2(row * 5.11, timeSlot + uGlitchSeed)) < 0.5 ? -1.0 : 1.0;',
      '  float micro = hash2(vec2(floor(uv.x * 19.0) + row, timeSlot * 1.31 + uGlitchSeed));',
      '  float glitchWave = (phaseRnd * 2.0 - 1.0) * (0.55 + micro * 0.95);',
      '  float glitchWidth = (0.0020 + rowRnd * rowRnd * 0.0085) * (0.55 + uGlitchBurst * 1.85);',
      '  vec2 sampleUv = uv + vec2(glitchGate * glitchDir * glitchWave * uGlitch * uGlitchSlice * glitchWidth, 0.0);',
      '  float mask = texture2D(uMap, sampleUv).a;',
      '  if(mask < 0.01) discard;',
      '  float activeMix = clamp(uActiveMix, 0.0, 1.0);',
      '  float denom = max(0.001, uTextMax - uTextMin);',
      '  float p = clamp((uv.x - uTextMin) / denom, 0.0, 1.0);',
      '  float filled = (1.0 - smoothstep(uProgress, uProgress + uFeather, p)) * activeMix;',
      '  float edge = (1.0 - smoothstep(0.0, uFeather * 2.8, abs(p - uProgress))) * activeMix;',
      '  float sweepPhase = fract(uTime * (0.28 + uSweep * 0.10));',
      '  float sweepLine = (1.0 - smoothstep(0.0, 0.080, abs((uv.x + uv.y * 0.42) - (sweepPhase * 1.42 - 0.18)))) * activeMix;',
      '  float fineLine = pow(max(0.0, sin((uv.x - uv.y * 0.18 + uTime * 0.82) * 42.0)), 24.0) * uShimmer * activeMix;',
      '  float chromaOffset = (0.0028 + phaseRnd * 0.0048 + uGlitchBurst * 0.0038) * uGlitch * uGlitchChroma;',
      '  float chromaR = texture2D(uMap, sampleUv + vec2(chromaOffset * glitchDir, 0.0)).a;',
      '  float chromaB = texture2D(uMap, sampleUv - vec2(chromaOffset * glitchDir, 0.0)).a;',
      '  vec3 color = mix(uBaseColor, uHiColor, filled * 0.88);',
      '  color += uGlowColor * edge * 0.14 * uEdgeBoost;',
      '  color += uSolarColor * sweepLine * uSweep * (0.12 + filled * 0.30);',
      '  color += uGlowColor * fineLine * (0.08 + filled * 0.18);',
      '  color += vec3(chromaR, mask * 0.18, chromaB) * glitchGate * uGlitch * uGlitchChroma * activeMix * (0.20 + uGlitchBurst * 0.22);',
      '  vec3 solar = uSolarColor;',
      '  color = mix(color, color + solar * 0.34, uSolar * activeMix * (0.25 + filled * 0.45));',
      '  color += solar * edge * uSolar * 0.22;',
      '  float lum = dot(color, vec3(0.299, 0.587, 0.114));',
      '  color += vec3(max(0.0, 0.30 - lum));',
      '  float alpha = max(mask, max(chromaR, chromaB) * glitchGate * uGlitch * (0.30 + uGlitchBurst * 0.32));',
      '  gl_FragColor = vec4(color, alpha * uOpacity);',
      '}',
    ].join('\n'),
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
  });
}
