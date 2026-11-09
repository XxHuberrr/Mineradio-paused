/**
 * Sonic Topography visual preset for Mineradio.
 * Visual algorithm ported from yin-yizhen/sonic-topography 1.1.1 (commit 3ff303e).
 * Only the visual layer is embedded here; player, login and server logic stay Mineradio-native.
 */
(function (global) {
  'use strict';

  var INDEX = 7;
  var RIPPLE_MAX = 10;
  var RIPPLE_LIFETIME = 4.8;
  var RIPPLE_SOFT_FADE_START = 2.1;
  var METEOR_MAX = 20;
  var TRAIL_MAX = 200;
  var DEFAULT_FLOATING_BLOCK_COUNT = 80;
  var FLOATING_BLOCK_MIN_COUNT = 0;
  var FLOATING_BLOCK_MAX_COUNT = 100;
  var DEFAULT_GROUND_MOTION_SPEED = 50;
  var DEFAULT_GROUND_AMPLITUDE = 50;
  var DEFAULT_TERRAIN_DENSITY = 46;
  var DEFAULT_GROUND_RANGE = 82;
  var DEFAULT_GROUND_LOWER = 68;
  var DEFAULT_GROUND_DEPTH = 62;
  var DEFAULT_GROUND_AUTO_ROTATE = 50;
  var DEFAULT_GROUND_GLOW = 68;
  var DEFAULT_GROUND_BASE_COLOR = '#05070c';
  var DEFAULT_GROUND_COOL_COLOR = '#0066ff';
  var DEFAULT_GROUND_WARM_COLOR = '#ff3c19';
  var DEFAULT_GROUND_ACCENT_COLOR = '#33e6ff';
  var TERRAIN_BASE_SIZE = 168;
  var TERRAIN_MIN_GRID_SIZE = 96;
  var TERRAIN_MAX_GRID_SIZE = 224;
  var QUALITY_GRID_CAP = { eco: 112, balanced: 160, high: 192, ultra: 224 };
  var DEFAULT_FLOATING_BLOCK_INTENSITY = 55;
  var DEFAULT_FLOATING_BLOCK_MIN_SIZE = 9;
  var DEFAULT_FLOATING_BLOCK_MAX_SIZE = 26;
  var DEFAULT_FLOATING_BLOCK_SPEED = 77;
  var MAX_SHADER_SUB_BASS = 1.2;
  var MAX_SHADER_BASS = 1.15;
  var MAX_KICK_DEFORM = 0.75;
  var GROUND_BAND_KEYS = [
    'sonicGroundSubBass',
    'sonicGroundBass',
    'sonicGroundLowMid',
    'sonicGroundMid',
    'sonicGroundHighMid',
    'sonicGroundPresence',
    'sonicGroundBrilliance',
    'sonicGroundAir'
  ];
  var DEFAULT_GROUND_BANDS = [90, 92, 50, 50, 50, 50, 50, 48];

  var state = {
    root: null,
    terrain: null,
    terrainMat: null,
    floatingBlocks: null,
    floatingMat: null,
    meteors: null,
    meteorMat: null,
    trails: null,
    trailMat: null,
    scene: null,
    opacity: 0,
    gridSize: 0,
    gridSpacing: 0,
    floatingCount: DEFAULT_FLOATING_BLOCK_COUNT,
    initialized: false,
    sonicTime: 0,
    autoYaw: 0,
    manualYaw: 0,
    boundRotX: 0,
    boundRotY: 0,
    lastOrbitTheta: 0,
    orbitThetaReady: false,
    ripples: [],
    rippleIdx: 0,
    meteorsData: [],
    meteorIdx: 0,
    lastMeteorAt: -999,
    trailsData: [],
    trailIdx: 0,
    floatingData: [],
    floatingPulse: 0,
    lastKickActive: false,
    lastSnareActive: false,
    smoothAudio: {
      subBass: 0,
      bass: 0,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      presence: 0,
      brilliance: 0,
      air: 0
    },
    dummyPos: null,
    dummyQuat: null,
    dummyScale: null,
    dummyMat4: null,
    dummyEuler: null,
    dummyObj: null
  };

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function clamp01(v) {
    return clamp(Number.isFinite(v) ? v : 0, 0, 1);
  }

  function smoothstep01(v) {
    var t = clamp01(v);
    return t * t * (3 - 2 * t);
  }

  function blend01(value) {
    return clamp(Number.isFinite(value) ? value : 0, 0, 1);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function sonicNumber(fx, key, fallback, min, max) {
    var value = fx && fx[key] != null ? Number(fx[key]) : fallback;
    if (!Number.isFinite(value)) value = fallback;
    return clamp(value, min, max);
  }

  function sonicHex(fx, key, fallback) {
    var value = fx && fx[key] != null ? String(fx[key]).trim() : fallback;
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) value = fallback;
    return value;
  }

  function sonicPaletteHex(value, fallback) {
    if (typeof global.lyricPaletteColorToHex === 'function') {
      return global.lyricPaletteColorToHex(value, fallback, 0.42);
    }
    value = value == null ? '' : String(value).trim();
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    if (/^#[0-9a-fA-F]{3}$/.test(value)) {
      return '#' + value.slice(1).split('').map(function (c) { return c + c; }).join('');
    }
    var rgb = value.match(/^rgba?\(\s*([.\d]+)\s*,\s*([.\d]+)\s*,\s*([.\d]+)/i);
    if (rgb) {
      return '#' + [rgb[1], rgb[2], rgb[3]].map(function (part) {
        return Math.round(clamp(Number(part) || 0, 0, 255)).toString(16).padStart(2, '0');
      }).join('');
    }
    return fallback;
  }

  function sonicUsesCustomGroundColors(fx) {
    return !!(fx && fx.sonicGroundColorMode === 'custom');
  }

  function sonicCoverGroundTheme(fx) {
    var stage = global.stageLyrics || {};
    var palette = stage.coverPalette || stage.palette || {};
    var tint = sonicHex(fx, 'visualTintColor', '#62d6ff');
    var primaryHex = sonicPaletteHex(palette.primary, tint);
    var secondaryHex = sonicPaletteHex(palette.secondary, DEFAULT_GROUND_COOL_COLOR);
    var highlightHex = sonicPaletteHex(palette.highlight, DEFAULT_GROUND_ACCENT_COLOR);
    var primary = new THREE.Color(primaryHex);
    var secondary = new THREE.Color(secondaryHex);
    var highlight = new THREE.Color(highlightHex);
    var base1 = primary.clone().lerp(new THREE.Color(DEFAULT_GROUND_BASE_COLOR), 0.84);
    var base2 = base1.clone().lerp(highlight, 0.14);
    var coolCore = primary.clone().lerp(new THREE.Color('#ffffff'), 0.08);
    var warmCore = secondary.clone().lerp(new THREE.Color('#ffb15a'), 0.18);
    var ripple = highlight.clone().lerp(new THREE.Color('#ffffff'), 0.10);
    return { base1: base1, base2: base2, coolCore: coolCore, warmCore: warmCore, ripple: ripple };
  }

  function sonicCustomGroundTheme(fx) {
    var tint = new THREE.Color((fx && fx.visualTintColor) || '#62d6ff');
    var base1 = new THREE.Color(sonicHex(fx, 'sonicGroundBaseColor', DEFAULT_GROUND_BASE_COLOR));
    return {
      base1: base1,
      base2: base1.clone().lerp(new THREE.Color('#ffffff'), 0.12),
      coolCore: new THREE.Color(sonicHex(fx, 'sonicGroundCoolColor', DEFAULT_GROUND_COOL_COLOR)).lerp(tint, fx && fx.visualTintMode === 'custom' ? 0.08 : 0.0),
      warmCore: new THREE.Color(sonicHex(fx, 'sonicGroundWarmColor', DEFAULT_GROUND_WARM_COLOR)).lerp(tint, fx && fx.visualTintMode === 'custom' ? 0.05 : 0.0),
      ripple: new THREE.Color(sonicHex(fx, 'sonicGroundAccentColor', DEFAULT_GROUND_ACCENT_COLOR))
    };
  }

  function floatingBlockCountForFx(fx) {
    return Math.round(sonicNumber(fx, 'sonicGroundFloatingCount', DEFAULT_FLOATING_BLOCK_COUNT, FLOATING_BLOCK_MIN_COUNT, FLOATING_BLOCK_MAX_COUNT));
  }

  function deriveGroundLayoutSettings(fx) {
    var range = sonicNumber(fx, 'sonicGroundRange', DEFAULT_GROUND_RANGE, 0, 100);
    var lower = sonicNumber(fx, 'sonicGroundLower', DEFAULT_GROUND_LOWER, 0, 100);
    var depth = sonicNumber(fx, 'sonicGroundDepth', DEFAULT_GROUND_DEPTH, 0, 100);
    return {
      scale: 0.096 + range * 0.00072,
      y: -4.05 - lower * 0.034,
      z: -4.20 - depth * 0.055
    };
  }

  function readBands(fx) {
    var bands = [];
    for (var i = 0; i < GROUND_BAND_KEYS.length; i++) {
      bands.push(sonicNumber(fx, GROUND_BAND_KEYS[i], DEFAULT_GROUND_BANDS[i], 0, 100));
    }
    return bands;
  }

  function applyGroundEqBandValue(value, bands, index, max) {
    var eq = Number(bands[index]);
    if (!Number.isFinite(eq)) eq = 50;
    var delta = (eq - 50) / 50;
    if (delta >= 0) return clamp(value * (1 + delta * 1.8), 0, max == null ? 1 : max);
    var dullness = Math.abs(delta);
    return clamp(Math.max(0, value - dullness * 0.35) * (1 - dullness * 0.35), 0, max == null ? 1 : max);
  }

  function deriveTerrainGridSettings(fx) {
    var density = sonicNumber(fx, 'sonicGroundDensity', DEFAULT_TERRAIN_DENSITY, 0, 100);
    var raw = TERRAIN_MIN_GRID_SIZE + ((TERRAIN_MAX_GRID_SIZE - TERRAIN_MIN_GRID_SIZE) * density) / 100;
    var cap = QUALITY_GRID_CAP[(fx && fx.performanceQuality) || 'balanced'] || QUALITY_GRID_CAP.balanced;
    var gridSize = clamp(Math.round(raw / 4) * 4, TERRAIN_MIN_GRID_SIZE, cap);
    var spacing = TERRAIN_BASE_SIZE / gridSize;
    return {
      gridSize: gridSize,
      spacing: spacing,
      boxWidth: spacing * (0.9 / 1.05),
      instanceCount: gridSize * gridSize,
      floatingCount: floatingBlockCountForFx(fx)
    };
  }

  function readMineradioAudio(raw) {
    raw = raw || {};
    if (raw.sonicDetailed || raw.subBass != null || raw.lowMid != null || raw.highMid != null) {
      var detailedTreble = clamp01(Number(raw.treble) || Number(raw.brilliance) || Number(raw.air) || 0);
      var detailedEnergy = clamp01(Number(raw.energy) || 0);
      var detailedKick = clamp01(raw.kickEnvelope != null ? Number(raw.kickEnvelope) : (raw.beat != null ? Number(raw.beat) : 0));
      return {
        subBass: clamp01(Number(raw.subBass) || 0),
        bass: clamp01(Number(raw.bass) || 0),
        lowMid: clamp01(Number(raw.lowMid) || 0),
        mid: clamp01(Number(raw.mid) || 0),
        highMid: clamp01(Number(raw.highMid) || 0),
        presence: clamp01(Number(raw.presence) || 0),
        brilliance: clamp01(Number(raw.brilliance) || 0),
        air: clamp01(Number(raw.air) || 0),
        treble: detailedTreble,
        kickEnvelope: detailedKick,
        energy: detailedEnergy,
        sharpness: clamp01(Number(raw.sharpness) || detailedTreble * 0.70 + detailedKick * 0.20),
        smoothness: clamp01(raw.smoothness == null ? (1.0 - detailedTreble * 0.42 + clamp01(Number(raw.mid) || 0) * 0.14) : Number(raw.smoothness)),
        density: clamp01(raw.density == null ? (0.45 + detailedTreble * 0.35 + detailedKick * 0.10) : Number(raw.density))
      };
    }
    var bass = clamp01(Number(raw.bass) || 0);
    var mid = clamp01(Number(raw.mid) || 0);
    var treble = clamp01(Number(raw.treble) || 0);
    var beat = clamp01(Number(raw.beat) || 0);
    var energy = clamp01(Number(raw.energy) || 0);
    return {
      subBass: clamp01(bass * 0.58 + beat * 0.48),
      bass: clamp01(bass * 0.76 + beat * 0.26),
      lowMid: clamp01(mid * 0.54 + bass * 0.16 + energy * 0.08),
      mid: clamp01(mid * 0.86 + energy * 0.08),
      highMid: clamp01(treble * 0.48 + mid * 0.22),
      presence: clamp01(treble * 0.62 + beat * 0.10),
      brilliance: clamp01(treble * 0.74 + energy * 0.06),
      air: clamp01(treble * 0.45 + energy * 0.10),
      treble: treble,
      kickEnvelope: beat,
      energy: energy,
      sharpness: clamp01(treble * 0.70 + beat * 0.20),
      smoothness: clamp01(1.0 - treble * 0.42 + mid * 0.14),
      density: clamp01(0.45 + treble * 0.35 + beat * 0.10)
    };
  }

  function deriveKickFollowLowBands(data, bands) {
    var safeKick = clamp(Number.isFinite(data.kickEnvelope) ? data.kickEnvelope : 0, 0, MAX_KICK_DEFORM);
    var normalizedKick = safeKick / MAX_KICK_DEFORM;
    var subBassInput = clamp01(data.subBass) * 0.22 + normalizedKick * 1.28;
    var bassInput = clamp01(data.bass) * 0.20 + normalizedKick * 1.15;
    return {
      subBass: applyGroundEqBandValue(subBassInput, bands, 0, MAX_SHADER_SUB_BASS),
      bass: applyGroundEqBandValue(bassInput, bands, 1, MAX_SHADER_BASS)
    };
  }

  function smoothGroundAudio(target, fx, dt) {
    var motionSpeed = sonicNumber(fx, 'sonicGroundMotionSpeed', DEFAULT_GROUND_MOTION_SPEED, 0, 100);
    var responseRate = lerp(2.2, 60, motionSpeed / 100);
    var responseBlend = blend01(1 - Math.exp(-responseRate * Math.max(0.001, dt || 1 / 60)));
    var s = state.smoothAudio;
    s.subBass += (target.subBass - s.subBass) * responseBlend;
    s.bass += (target.bass - s.bass) * responseBlend;
    s.lowMid += (target.lowMid - s.lowMid) * responseBlend;
    s.mid += (target.mid - s.mid) * responseBlend;
    s.highMid += (target.highMid - s.highMid) * responseBlend;
    s.presence += (target.presence - s.presence) * responseBlend;
    s.brilliance += (target.brilliance - s.brilliance) * responseBlend;
    s.air += (target.air - s.air) * responseBlend;
    return s;
  }

  function buildTerrainVertexShader() {
    return [
      'precision highp float;',
      'uniform float uTime;',
      'uniform float uSubBass;',
      'uniform float uBass;',
      'uniform float uLowMid;',
      'uniform float uMid;',
      'uniform float uHighMid;',
      'uniform float uSmoothness;',
      'uniform float uDensity;',
      'uniform float uEnergy;',
      'uniform float uAmplitude;',
      'uniform vec4 uRipples[' + RIPPLE_MAX + '];',
      'varying vec2 vUv;',
      'varying float vElevation;',
      'varying float vDistance;',
      'varying vec2 vRippleAnim;',
      'varying vec3 vNormal;',
      'varying float vRelativeY;',
      'varying vec2 vInstancePos;',
      'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
      'vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}',
      'vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}',
      'float snoise(vec2 v){',
      '  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);',
      '  vec2 i=floor(v+dot(v,C.yy));',
      '  vec2 x0=v-i+dot(i,C.xx);',
      '  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);',
      '  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;',
      '  i=mod289(i);',
      '  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));',
      '  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);',
      '  m=m*m; m=m*m;',
      '  vec3 x=2.0*fract(p*C.www)-1.0;',
      '  vec3 h=abs(x)-0.5;',
      '  vec3 ox=floor(x+0.5);',
      '  vec3 a0=x-ox;',
      '  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);',
      '  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;',
      '  return 130.0*dot(m,g);',
      '}',
      'float random(vec2 st){return fract(sin(dot(st.xy,vec2(12.9898,78.233)))*43758.5453123);}',
      'void main(){',
      '  vUv=uv;',
      '  vNormal=normal;',
      '  vec4 instancePos=instanceMatrix*vec4(0.0,0.0,0.0,1.0);',
      '  vec2 pos2D=instancePos.xz;',
      '  vInstancePos=pos2D;',
      '  float centerDist=length(pos2D);',
      '  vDistance=centerDist;',
      '  float rnd=random(pos2D);',
      '  vec2 movingPos=pos2D*0.05+vec2(uTime*0.1,uTime*0.05);',
      '  float baseNoise=(snoise(movingPos)+1.0)*0.5;',
      '  float wave=sin(pos2D.x*0.15+pos2D.y*0.1-uTime*0.6)*0.5+0.5;',
      '  float globalFalloff=smoothstep(60.0,30.0,centerDist);',
      '  float idleElevation=mix(baseNoise,wave,uSmoothness*0.5+0.2)*0.8*globalFalloff;',
      '  float subRegion=smoothstep(25.0,0.0,centerDist);',
      '  float subLift=uSubBass*subRegion*5.0;',
      '  float bassNoise=snoise(pos2D*0.1-vec2(0.0,uTime*0.2));',
      '  float bassRegion=smoothstep(35.0,5.0,centerDist+bassNoise*5.0);',
      '  float bassLift=uBass*bassRegion*(smoothstep(0.0,1.0,rnd+uDensity*0.5))*4.0;',
      '  float lowMidNoise=snoise(pos2D*0.05+vec2(uTime*0.1,0.0));',
      '  float lowMidLift=uLowMid*(lowMidNoise*0.5+0.5)*2.5;',
      '  float riverFlow=sin(pos2D.x*0.2+pos2D.y*0.2+snoise(pos2D*0.1)*2.0-uTime*2.0);',
      '  float midLift=uMid*max(0.0,riverFlow)*3.0;',
      '  float highMidRegion=smoothstep(10.0,45.0,centerDist);',
      '  float highMidLift=0.0;',
      '  if(fract(rnd*13.3)>0.8){highMidLift=uHighMid*highMidRegion*fract(rnd*7.7)*2.5;}',
      '  float audioElevation=subLift+bassLift+lowMidLift+midLift+highMidLift;',
      '  if(rnd>0.99){audioElevation+=uEnergy*5.0;}',
      '  audioElevation*=globalFalloff;',
      '  audioElevation=max(0.0,audioElevation-0.2);',
      '  audioElevation*=uAmplitude;',
      '  float elevation=idleElevation+audioElevation;',
      '  float rippleElevation=0.0;',
      '  float rippleIntensityNormal=0.0;',
      '  float rippleIntensityWhite=0.0;',
      '  for(int i=0;i<' + RIPPLE_MAX + ';i++){',
      '    vec4 rd=uRipples[i];',
      '    if(rd.w!=0.0){',
      '      float strength=abs(rd.w);',
      '      bool whiteRipple=rd.w<0.0;',
      '      float dist=length(pos2D-rd.xy);',
      '      float timeSince=uTime-rd.z;',
      '      float curSpeed=whiteRipple?18.0:13.0;',
      '      float curWidth=whiteRipple?1.35:5.5;',
      '      float curFadeDist=whiteRipple?12.0:26.0;',
      '      float elevationScale=whiteRipple?1.15:3.35;',
      '      float waveRadius=timeSince*curSpeed;',
      '      float d=dist-waveRadius;',
      '      float rippleWave=exp(-d*d/curWidth);',
      '      float fade=exp(-waveRadius/curFadeDist);',
      '      float lifeFade=1.0-smoothstep(2.10,4.80,timeSince);',
      '      float rPulse=rippleWave*fade*lifeFade*strength;',
      '      rippleElevation+=rPulse*elevationScale;',
      '      if(whiteRipple){rippleIntensityWhite+=rPulse;}else{rippleIntensityNormal+=rPulse;}',
      '    }',
      '  }',
      '  elevation+=rippleElevation;',
      '  vRippleAnim=vec2(clamp(rippleIntensityNormal,0.0,1.0),clamp(rippleIntensityWhite,0.0,1.0));',
      '  vElevation=elevation;',
      '  float yPos=position.y+0.5;',
      '  vRelativeY=yPos;',
      '  float totalHeight=1.0+elevation;',
      '  vec3 pos=position;',
      '  pos.y=-0.5+yPos*totalHeight;',
      '  vec4 worldPosition=modelMatrix*instanceMatrix*vec4(pos,1.0);',
      '  gl_Position=projectionMatrix*viewMatrix*worldPosition;',
      '}'
    ].join('\n');
  }

  function buildTerrainFragmentShader() {
    return [
      'precision highp float;',
      'uniform float uTime;',
      'uniform float uPresence;',
      'uniform float uBrilliance;',
      'uniform float uAir;',
      'uniform float uWarmth;',
      'uniform float uBrightness;',
      'uniform float uSharpness;',
      'uniform vec3 uBaseColor1;',
      'uniform vec3 uBaseColor2;',
      'uniform vec3 uFogColor;',
      'uniform vec3 uCoolCore;',
      'uniform vec3 uCoolEdge;',
      'uniform vec3 uWarmCore;',
      'uniform vec3 uWarmEdge;',
      'uniform vec3 uRippleColor;',
      'uniform float uGlowIntensity;',
      'varying vec2 vUv;',
      'varying float vElevation;',
      'varying float vDistance;',
      'varying vec2 vRippleAnim;',
      'varying vec3 vNormal;',
      'varying float vRelativeY;',
      'varying vec2 vInstancePos;',
      'float random(vec2 st){return fract(sin(dot(st.xy,vec2(12.9898,78.233)))*43758.5453123);}',
      'void main(){',
      '  bool isTop=vNormal.y>0.5;',
      '  float distFromTop=1.0-vRelativeY;',
      '  float rnd=random(vInstancePos);',
      '  float centerDist=length(vInstancePos);',
      '  float normElevation=clamp(vElevation/8.0,0.0,1.0);',
      '  vec3 cBase1=uBaseColor1;',
      '  vec3 cBase2=uBaseColor2;',
      '  float warmBlend=smoothstep(0.0,1.0,uWarmth*1.5+(0.5-centerDist/80.0));',
      '  vec3 zoneCore=mix(uCoolCore,uWarmCore,warmBlend);',
      '  vec3 zoneEdge=mix(uCoolEdge,uWarmEdge,warmBlend);',
      '  vec3 targetGlow=mix(zoneCore,zoneEdge,fract(rnd*11.0));',
      '  float distFade=1.0-smoothstep(40.0,75.0,centerDist);',
      '  vec3 brightCool=mix(uCoolCore,vec3(1.0),0.24);',
      '  targetGlow=mix(targetGlow,brightCool,uBrightness*0.6);',
      '  vec3 currentGlow=mix(cBase2,targetGlow,normElevation)*uGlowIntensity*distFade;',
      '  currentGlow=mix(currentGlow,uRippleColor,clamp(vRippleAnim.x*0.82,0.0,0.72));',
      '  currentGlow=mix(currentGlow,vec3(1.0),vRippleAnim.y);',
      '  vec3 bodyColor=mix(cBase1,cBase2,vRelativeY*distFade);',
      '  vec3 finalColor;',
      '  if(isTop){',
      '    float topIntensity=smoothstep(0.0,0.4,normElevation);',
      '    float twinkleDistFalloff=smoothstep(60.0,30.0,centerDist);',
      '    float twinkleMultiplier=mix(twinkleDistFalloff,1.0,smoothstep(0.01,0.1,normElevation));',
      '    if(fract(rnd*31.0)>0.95&&normElevation<0.1){topIntensity+=uAir*2.0*twinkleMultiplier;}',
      '    finalColor=mix(cBase2,currentGlow,topIntensity);',
      '    float edgeX=smoothstep(0.05,0.01,vUv.x)+smoothstep(0.95,0.99,vUv.x);',
      '    float edgeY=smoothstep(0.05,0.01,vUv.y)+smoothstep(0.95,0.99,vUv.y);',
      '    float edge=min(edgeX+edgeY,1.0);',
      '    finalColor+=currentGlow*edge*0.8*(topIntensity+0.3);',
      '    float flashChance=smoothstep(0.3,1.0,uPresence);',
      '    if(fract(rnd*53.0)>0.98-flashChance*0.1){',
      '      float flashSync=sin(uTime*40.0+rnd*100.0)*0.5+0.5;',
      '      finalColor+=mix(vec3(1.0),vec3(0.5,1.0,1.0),rnd)*flashSync*uPresence*(1.0+uSharpness*2.0)*twinkleMultiplier;',
      '    }',
      '    if(edge>0.5&&fract(rnd*89.0+uTime*2.0)>0.98){finalColor+=vec3(1.0)*uBrilliance*3.0*twinkleMultiplier;}',
      '  }else{',
      '    float verticalFalloff=mix(1.0,3.0,uSharpness);',
      '    float sideGlow=smoothstep(0.5/verticalFalloff,0.0,distFromTop)*normElevation;',
      '    if(normElevation<0.02)sideGlow=0.0;',
      '    finalColor=mix(bodyColor,currentGlow,sideGlow*1.5);',
      '    float rimGlow=smoothstep(0.03,0.0,distFromTop)*normElevation;',
      '    finalColor+=currentGlow*rimGlow;',
      '  }',
      '  finalColor+=uRippleColor*vRippleAnim.x*0.86;',
      '  finalColor+=vec3(1.0)*vRippleAnim.y*1.2;',
      '  float aerialFog=smoothstep(30.0,65.0,vDistance);',
      '  vec3 atmosphericColor=mix(cBase1,cBase2,0.4);',
      '  finalColor=mix(finalColor,atmosphericColor,aerialFog*0.35);',
      '  float alphaFade=1.0-smoothstep(55.0,78.0,vDistance);',
      '  float alphaBlend=1.0-alphaFade;',
      '  finalColor=mix(finalColor,uFogColor,alphaBlend*0.45);',
      '  gl_FragColor=vec4(finalColor,alphaFade);',
      '}'
    ].join('\n');
  }

  function buildFloatingVertexShader() {
    return [
      'precision highp float;',
      'uniform float uPulse;',
      'varying vec2 vUv;',
      'varying float vElevation;',
      'varying float vDistance;',
      'varying vec2 vRippleAnim;',
      'varying vec3 vNormal;',
      'varying float vRelativeY;',
      'varying vec2 vInstancePos;',
      'void main(){',
      '  vUv=uv;',
      '  vNormal=normal;',
      '  vec4 instancePos=instanceMatrix*vec4(0.0,0.0,0.0,1.0);',
      '  vec2 pos2D=instancePos.xz;',
      '  vInstancePos=pos2D;',
      '  vDistance=length(pos2D);',
      '  vRippleAnim=vec2(uPulse*0.8,uPulse*0.3);',
      '  vElevation=uPulse*20.0;',
      '  vRelativeY=position.y+0.5;',
      '  vec4 worldPosition=modelMatrix*instanceMatrix*vec4(position,1.0);',
      '  gl_Position=projectionMatrix*viewMatrix*worldPosition;',
      '}'
    ].join('\n');
  }

  function buildFloatingFragmentShader() {
    return buildTerrainFragmentShader();
  }

  function makeRippleUniforms() {
    var arr = [];
    for (var i = 0; i < RIPPLE_MAX; i++) arr.push(new THREE.Vector4(0, 0, -100, 0));
    return arr;
  }

  function makeTerrainUniforms() {
    return {
      uTime: { value: 0 },
      uSubBass: { value: 0 },
      uBass: { value: 0 },
      uLowMid: { value: 0 },
      uMid: { value: 0 },
      uHighMid: { value: 0 },
      uPresence: { value: 0 },
      uBrilliance: { value: 0 },
      uAir: { value: 0 },
      uWarmth: { value: 0 },
      uBrightness: { value: 0 },
      uSharpness: { value: 0 },
      uSmoothness: { value: 0 },
      uDensity: { value: 0 },
      uEnergy: { value: 0 },
      uAmplitude: { value: 1 },
      uRipples: { value: makeRippleUniforms() },
      uBaseColor1: { value: new THREE.Color(0.01, 0.02, 0.04) },
      uBaseColor2: { value: new THREE.Color(0.03, 0.05, 0.09) },
      uFogColor: { value: new THREE.Color(0.01, 0.02, 0.04) },
      uCoolCore: { value: new THREE.Color(0.0, 0.3, 1.0) },
      uCoolEdge: { value: new THREE.Color(0.6, 0.2, 1.0) },
      uWarmCore: { value: new THREE.Color(1.0, 0.2, 0.1) },
      uWarmEdge: { value: new THREE.Color(1.0, 0.6, 0.0) },
      uRippleColor: { value: new THREE.Color(0.2, 0.9, 1.0) },
      uGlowIntensity: { value: 1 }
    };
  }

  function makeFloatingUniforms() {
    var uniforms = makeTerrainUniforms();
    uniforms.uPulse = { value: 0 };
    return uniforms;
  }

  function initData(floatingCount) {
    var i;
    state.ripples = [];
    for (i = 0; i < RIPPLE_MAX; i++) state.ripples.push({ x: 0, z: 0, start: -100, strength: 0, white: false });
    state.meteorsData = [];
    for (i = 0; i < METEOR_MAX; i++) state.meteorsData.push({ active: false, x: 0, y: -1000, z: 0, speed: 0, strength: 0 });
    state.trailsData = [];
    for (i = 0; i < TRAIL_MAX; i++) {
      state.trailsData.push({ active: false, x: 0, y: -1000, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, scale: 1 });
    }
    state.floatingData = [];
    floatingCount = Math.max(0, Math.round(Number(floatingCount) || 0));
    for (i = 0; i < floatingCount; i++) {
      var ring = i / Math.max(1, floatingCount);
      var angle = ring * Math.PI * 2 * 5.0 + Math.sin(i * 12.9898) * 0.7;
      var radius = 14 + ((i * 37) % 62);
      var height = 6 + ((i * 17) % 19);
      state.floatingData.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        y: height,
        baseScale: 0.75 + ((i * 11) % 9) * 0.05,
        phase: i * 0.73,
        rotationSpeed: 0.18 + ((i * 7) % 10) * 0.035
      });
    }
  }

  function buildTerrainMesh(settings) {
    var geo = new THREE.BoxGeometry(settings.boxWidth, 1, settings.boxWidth);
    var mat = new THREE.ShaderMaterial({
      uniforms: makeTerrainUniforms(),
      vertexShader: buildTerrainVertexShader(),
      fragmentShader: buildTerrainFragmentShader(),
      transparent: true,
      depthWrite: true,
      depthTest: true
    });
    var mesh = new THREE.InstancedMesh(geo, mat, settings.instanceCount);
    mesh.frustumCulled = false;
    var offset = (settings.gridSize * settings.spacing) / 2;
    var n = 0;
    for (var x = 0; x < settings.gridSize; x++) {
      for (var z = 0; z < settings.gridSize; z++) {
        state.dummyMat4.makeTranslation(x * settings.spacing - offset, 0.5, z * settings.spacing - offset);
        mesh.setMatrixAt(n++, state.dummyMat4);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  function buildFloatingBlocksMesh(count) {
    count = Math.max(0, Math.round(Number(count) || 0));
    var geo = new THREE.BoxGeometry(1, 1, 1);
    var mat = new THREE.ShaderMaterial({
      uniforms: makeFloatingUniforms(),
      vertexShader: buildFloatingVertexShader(),
      fragmentShader: buildFloatingFragmentShader(),
      transparent: true,
      depthWrite: false,
      depthTest: true
    });
    var mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    return mesh;
  }

  function buildSimpleInstanced(count, size, color, opacity) {
    var geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    var mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity == null ? 1 : opacity,
      depthWrite: false,
      toneMapped: false
    });
    var mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    for (var i = 0; i < count; i++) {
      state.dummyScale.set(0, 0, 0);
      state.dummyMat4.compose(state.dummyPos.set(0, -1000, 0), state.dummyQuat, state.dummyScale);
      mesh.setMatrixAt(i, state.dummyMat4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  function applyLayout(fx) {
    if (!state.root) return;
    var layout = deriveGroundLayoutSettings(fx || {});
    state.root.rotation.x = state.boundRotX;
    state.root.rotation.y = state.boundRotY + state.autoYaw;
    state.root.rotation.z = 0;
    state.root.position.set(0, layout.y, layout.z);
    state.root.scale.setScalar(layout.scale);
  }

  function bindVisualRotation(ctx) {
    var src = ctx && ctx.visualRotation;
    if (!src && typeof particles !== 'undefined' && particles && particles.rotation) src = particles.rotation;
    state.boundRotX = src && Number.isFinite(Number(src.x)) ? Number(src.x) : 0;
    state.boundRotY = src && Number.isFinite(Number(src.y)) ? Number(src.y) : 0;
  }

  function updateSonicRotation(fx, dt, ctx) {
    bindVisualRotation(ctx);
    var autoRotate = sonicNumber(fx, 'sonicGroundAutoRotate', DEFAULT_GROUND_AUTO_ROTATE, 0, 100);
    var speed = lerp(0, 0.30, autoRotate / 100) * clamp((fx && fx.speed) || 1, 0.35, 1.8);
    state.manualYaw *= Math.pow(0.001, Math.max(0.001, dt || 1 / 60));
    if (typeof orbit !== 'undefined' && orbit) {
      if (orbit.rotating || (ctx && ctx.visualRotationActive)) speed *= 0.35;
    }
    state.autoYaw += dt * speed;
  }

  function ensureLayer(scene, fx) {
    var settings = deriveTerrainGridSettings(fx);
    if (state.initialized && state.gridSize === settings.gridSize && state.floatingCount === settings.floatingCount) return;
    clearLayer();
    state.scene = scene;
    state.gridSize = settings.gridSize;
    state.gridSpacing = settings.spacing;
    state.floatingCount = settings.floatingCount;
    state.dummyObj = new THREE.Object3D();
    state.dummyPos = new THREE.Vector3();
    state.dummyQuat = new THREE.Quaternion();
    state.dummyScale = new THREE.Vector3();
    state.dummyMat4 = new THREE.Matrix4();
    state.dummyEuler = new THREE.Euler();
    initData(settings.floatingCount);
    state.root = new THREE.Group();
    state.root.name = 'sonic-topography-root';
    state.terrain = buildTerrainMesh(settings);
    state.terrainMat = state.terrain.material;
    state.root.add(state.terrain);
    state.floatingBlocks = buildFloatingBlocksMesh(settings.floatingCount);
    state.floatingMat = state.floatingBlocks.material;
    state.root.add(state.floatingBlocks);
    state.meteors = buildSimpleInstanced(METEOR_MAX, [0.4, 1.2, 0.4], 0xffffff, 1);
    state.meteorMat = state.meteors.material;
    state.root.add(state.meteors);
    state.trails = buildSimpleInstanced(TRAIL_MAX, [0.8, 0.8, 0.8], 0xa8ecff, 0.6);
    state.trailMat = state.trails.material;
    state.root.add(state.trails);
    state.root.visible = false;
    applyLayout(fx);
    scene.add(state.root);
    state.initialized = true;
  }

  function colorUniformLerp(uniform, target, alpha) {
    if (!uniform || !uniform.value) return;
    uniform.value.lerp(target, alpha);
  }

  function syncTheme(mat, fx, audio, dt) {
    if (!mat) return;
    var u = mat.uniforms;
    var lerpSpeed = blend01(3.0 * Math.max(0.001, dt || 1 / 60));
    var theme = sonicUsesCustomGroundColors(fx) ? sonicCustomGroundTheme(fx) : sonicCoverGroundTheme(fx);
    var base1 = theme.base1;
    var base2 = theme.base2;
    var coolCore = theme.coolCore;
    var coolEdge = coolCore.clone().lerp(base1, 0.34);
    var warmCore = theme.warmCore;
    var warmEdge = warmCore.clone().lerp(base1, 0.26);
    var ripple = theme.ripple;
    colorUniformLerp(u.uBaseColor1, base1, lerpSpeed);
    colorUniformLerp(u.uBaseColor2, base2, lerpSpeed);
    colorUniformLerp(u.uFogColor, base1, lerpSpeed);
    colorUniformLerp(u.uCoolCore, coolCore, lerpSpeed);
    colorUniformLerp(u.uCoolEdge, coolEdge, lerpSpeed);
    colorUniformLerp(u.uWarmCore, warmCore, lerpSpeed);
    colorUniformLerp(u.uWarmEdge, warmEdge, lerpSpeed);
    colorUniformLerp(u.uRippleColor, ripple, lerpSpeed);
    var glow = sonicNumber(fx, 'sonicGroundGlow', DEFAULT_GROUND_GLOW, 0, 100);
    u.uGlowIntensity.value = lerp(u.uGlowIntensity.value, clamp(0.55 + glow * 0.014 + ((fx && fx.bloomStrength) || 0) * 0.22, 0.45, 2.2), lerpSpeed);
    var low = audio.subBass + audio.bass + audio.lowMid + audio.mid;
    var high = audio.presence + audio.brilliance + audio.air;
    var sum = Math.max(0.001, low + high);
    u.uWarmth.value = clamp(low / sum, 0, 1);
    u.uBrightness.value = clamp(high / sum, 0, 1);
    u.uSharpness.value = audio.sharpness;
    u.uSmoothness.value = audio.smoothness;
    u.uDensity.value = audio.density;
    if (state.meteorMat) state.meteorMat.color.copy(warmCore).lerp(new THREE.Color(0xffffff), 0.7);
    if (state.trailMat) state.trailMat.color.copy(ripple);
  }

  function syncTerrainUniforms(fx, audio, dt, time) {
    if (!state.terrainMat) return;
    var bands = readBands(fx);
    var kickLow = deriveKickFollowLowBands(audio, bands);
    var target = {
      subBass: kickLow.subBass,
      bass: kickLow.bass,
      lowMid: applyGroundEqBandValue(audio.lowMid, bands, 2, 1),
      mid: applyGroundEqBandValue(audio.mid, bands, 3, 1),
      highMid: applyGroundEqBandValue(audio.highMid, bands, 4, 1),
      presence: applyGroundEqBandValue(audio.presence, bands, 5, 1),
      brilliance: applyGroundEqBandValue(audio.brilliance, bands, 6, 1),
      air: applyGroundEqBandValue(audio.air, bands, 7, 1)
    };
    var smoothed = smoothGroundAudio(target, fx, dt);
    var u = state.terrainMat.uniforms;
    var eqAverage = bands.reduce(function (sum, value) { return sum + value; }, 0) / Math.max(1, bands.length);
    var eqEnergy = clamp(audio.energy * (0.25 + (eqAverage / 50) * 0.75), 0, 1);
    var amplitude = sonicNumber(fx, 'sonicGroundAmplitude', DEFAULT_GROUND_AMPLITUDE, 0, 100);
    var ampMul = amplitude <= 50 ? amplitude / 50 : 1 + Math.pow((amplitude - 50) / 50, 2) * 14;
    u.uTime.value = time;
    u.uSubBass.value = smoothed.subBass;
    u.uBass.value = smoothed.bass;
    u.uLowMid.value = smoothed.lowMid;
    u.uMid.value = smoothed.mid;
    u.uHighMid.value = smoothed.highMid;
    u.uPresence.value = smoothed.presence;
    u.uBrilliance.value = smoothed.brilliance;
    u.uAir.value = smoothed.air;
    u.uEnergy.value = eqEnergy;
    u.uAmplitude.value = ampMul;
    syncTheme(state.terrainMat, fx, {
      subBass: smoothed.subBass,
      bass: smoothed.bass,
      lowMid: smoothed.lowMid,
      mid: smoothed.mid,
      presence: smoothed.presence,
      brilliance: smoothed.brilliance,
      air: smoothed.air,
      sharpness: audio.sharpness,
      smoothness: audio.smoothness,
      density: audio.density
    }, dt);
    syncRippleUniforms(time);
    if (state.floatingMat) {
      syncTheme(state.floatingMat, fx, {
        subBass: smoothed.subBass,
        bass: smoothed.bass,
        lowMid: smoothed.lowMid,
        mid: smoothed.mid,
        presence: smoothed.presence,
        brilliance: smoothed.brilliance,
        air: smoothed.air,
        sharpness: audio.sharpness,
        smoothness: audio.smoothness,
        density: audio.density
      }, dt);
      state.floatingMat.uniforms.uTime.value = time;
      state.floatingMat.uniforms.uPulse.value = state.floatingPulse;
    }
  }

  function syncRippleUniforms(time) {
    if (!state.terrainMat) return;
    var arr = state.terrainMat.uniforms.uRipples.value;
    for (var i = 0; i < RIPPLE_MAX; i++) {
      var r = state.ripples[i];
      var age = time - r.start;
      var active = r.strength > 0.001 && age >= 0 && age < RIPPLE_LIFETIME;
      if (!active) {
        arr[i].set(0, 0, -100, 0);
        if (r.strength > 0) r.strength = 0;
        continue;
      }
      var fade = 1 - smoothstep01((age - RIPPLE_SOFT_FADE_START) / (RIPPLE_LIFETIME - RIPPLE_SOFT_FADE_START));
      var strength = r.strength * fade;
      arr[i].set(r.x, r.z, r.start, r.white ? -strength : strength);
    }
  }

  function addRipple(x, z, strength, white) {
    var idx = state.rippleIdx;
    var r = state.ripples[idx];
    r.x = x;
    r.z = z;
    r.start = state.sonicTime;
    r.strength = clamp(strength, 0.1, 3.0);
    r.white = !!white;
    state.rippleIdx = (idx + 1) % RIPPLE_MAX;
  }

  function addMeteor(strength) {
    var now = state.sonicTime;
    if (now - state.lastMeteorAt < 0.55) return;
    state.lastMeteorAt = now;
    var idx = state.meteorIdx;
    var angle = Math.random() * Math.PI * 2;
    var dist = Math.random() * 25;
    var m = state.meteorsData[idx];
    m.active = true;
    m.x = Math.cos(angle) * dist;
    m.z = Math.sin(angle) * dist;
    m.y = 30 + Math.random() * 10;
    m.speed = 1.0 + Math.random() * 0.5 + strength * 1.5;
    m.strength = strength;
    state.meteorIdx = (idx + 1) % METEOR_MAX;
  }

  function spawnTrail(x, y, z, speedMul) {
    var idx = state.trailIdx;
    var p = state.trailsData[idx];
    p.active = true;
    p.x = x + (Math.random() - 0.5) * 1.5;
    p.y = y + (Math.random() - 0.5) * 1.5;
    p.z = z + (Math.random() - 0.5) * 1.5;
    p.vx = (Math.random() - 0.5) * 2.0;
    p.vy = Math.random() * 2.0 + speedMul * 10.0;
    p.vz = (Math.random() - 0.5) * 2.0;
    p.life = 0;
    p.maxLife = 0.5 + Math.random() * 0.5;
    p.scale = Math.random() * 0.6 + 0.2;
    state.trailIdx = (idx + 1) % TRAIL_MAX;
  }

  function updateAudioTriggers(audio) {
    var kickActive = audio.kickEnvelope > 0.58;
    if (kickActive && !state.lastKickActive) {
      var angle = Math.random() * Math.PI * 2;
      var dist = Math.random() * 20;
      addRipple(Math.cos(angle) * dist, Math.sin(angle) * dist, Math.min(audio.kickEnvelope * 2.0, 3.0), false);
    }
    state.lastKickActive = audio.kickEnvelope > 0.32;
    var snareActive = audio.presence > 0.52 || audio.brilliance > 0.56;
    if (snareActive && !state.lastSnareActive && Math.random() < 0.55) {
      var angle2 = Math.random() * Math.PI * 2;
      var dist2 = 10 + Math.random() * 35;
      addRipple(Math.cos(angle2) * dist2, Math.sin(angle2) * dist2, Math.min((audio.presence + audio.brilliance) * 1.2, 3.0), true);
    }
    state.lastSnareActive = audio.presence > 0.38 || audio.brilliance > 0.42;
    if (audio.kickEnvelope > 0.62 && Math.random() < 0.045) addMeteor(clamp(audio.kickEnvelope, 0.28, 0.9));
  }

  function updateFloatingBlocks(fx, audio, dt, time) {
    if (!state.floatingBlocks) return;
    var enabledScale = fx && fx.sonicGroundFloatingEnabled === false ? 0 : 1;
    var intensity = sonicNumber(fx, 'sonicGroundFloatingIntensity', DEFAULT_FLOATING_BLOCK_INTENSITY, 0, 100) / 100;
    var minSize = sonicNumber(fx, 'sonicGroundFloatingMinSize', DEFAULT_FLOATING_BLOCK_MIN_SIZE, 0, 100);
    var maxSize = Math.max(minSize, sonicNumber(fx, 'sonicGroundFloatingMaxSize', DEFAULT_FLOATING_BLOCK_MAX_SIZE, 0, 100));
    var speed = sonicNumber(fx, 'sonicGroundFloatingSpeed', DEFAULT_FLOATING_BLOCK_SPEED, 0, 100);
    var speedRate = lerp(3.0, 36.0, speed / 100);
    var pulseBlend = blend01(1 - Math.exp(-speedRate * Math.max(0.001, dt || 1 / 60)));
    state.floatingPulse += (clamp01(audio.kickEnvelope) - state.floatingPulse) * pulseBlend;
    var pulse = state.floatingPulse;
    var minVisualScale = lerp(0.12, 0.75, minSize / 100);
    var maxVisualScale = Math.max(minVisualScale + 0.05, lerp(0.45, 3.2, maxSize / 100));
    var sizeMix = clamp(pulse * (0.5 + intensity * 1.7), 0, 1);
    var pulseScale = lerp(minVisualScale, maxVisualScale, sizeMix);
    for (var i = 0; i < state.floatingData.length; i++) {
      var b = state.floatingData[i];
      var bob = Math.sin(time * (0.55 + b.rotationSpeed) + b.phase) * 0.45;
      state.dummyPos.set(b.x, b.y + bob + pulse * intensity * 1.4, b.z);
      state.dummyEuler.set(
        time * b.rotationSpeed + b.phase,
        time * b.rotationSpeed * 0.7 + b.phase,
        time * b.rotationSpeed * 0.45
      );
      state.dummyQuat.setFromEuler(state.dummyEuler);
      var scale = b.baseScale * pulseScale * enabledScale;
      state.dummyScale.set(scale, scale, scale);
      state.dummyMat4.compose(state.dummyPos, state.dummyQuat, state.dummyScale);
      state.floatingBlocks.setMatrixAt(i, state.dummyMat4);
    }
    state.floatingBlocks.instanceMatrix.needsUpdate = true;
  }

  function updateMeteorsAndTrails(dt) {
    if (!state.meteors || !state.trails) return;
    var i;
    for (i = 0; i < METEOR_MAX; i++) {
      var m = state.meteorsData[i];
      if (!m.active) {
        state.dummyPos.set(0, -1000, 0);
        state.dummyScale.set(0, 0, 0);
      } else {
        m.y -= m.speed * 60 * dt;
        if (m.y <= 0) {
          m.active = false;
          addRipple(m.x, m.z, Math.min(m.strength, 1.2), true);
          for (var t = 0; t < 10; t++) spawnTrail(m.x, 0.5, m.z, m.speed * 1.5);
          state.dummyPos.set(0, -1000, 0);
          state.dummyScale.set(0, 0, 0);
        } else {
          if (Math.random() > 0.3) spawnTrail(m.x, m.y, m.z, m.speed * 0.2);
          state.dummyPos.set(m.x, Math.max(0, m.y), m.z);
          state.dummyScale.set(1.5, 1.5, 1.5);
        }
      }
      state.dummyQuat.identity();
      state.dummyMat4.compose(state.dummyPos, state.dummyQuat, state.dummyScale);
      state.meteors.setMatrixAt(i, state.dummyMat4);
    }
    state.meteors.instanceMatrix.needsUpdate = true;
    for (i = 0; i < TRAIL_MAX; i++) {
      var p = state.trailsData[i];
      if (!p.active) {
        state.dummyPos.set(0, -1000, 0);
        state.dummyScale.set(0, 0, 0);
      } else {
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          state.dummyScale.set(0, 0, 0);
        } else {
          p.x += p.vx * dt * 10;
          p.y += p.vy * dt * 10;
          p.z += p.vz * dt * 10;
          var s = p.scale * (1.0 - p.life / p.maxLife);
          state.dummyPos.set(p.x, p.y, p.z);
          state.dummyScale.set(s, s, s);
        }
      }
      state.dummyQuat.identity();
      state.dummyMat4.compose(state.dummyPos, state.dummyQuat, state.dummyScale);
      state.trails.setMatrixAt(i, state.dummyMat4);
    }
    state.trails.instanceMatrix.needsUpdate = true;
  }

  function clearLayer() {
    if (state.root && state.scene) state.scene.remove(state.root);
    if (state.terrain) {
      state.terrain.geometry.dispose();
      state.terrain.material.dispose();
    }
    if (state.floatingBlocks) {
      state.floatingBlocks.geometry.dispose();
      state.floatingBlocks.material.dispose();
    }
    if (state.meteors) {
      state.meteors.geometry.dispose();
      state.meteors.material.dispose();
    }
    if (state.trails) {
      state.trails.geometry.dispose();
      state.trails.material.dispose();
    }
    state.root = null;
    state.terrain = null;
    state.terrainMat = null;
    state.floatingBlocks = null;
    state.floatingMat = null;
    state.meteors = null;
    state.trails = null;
    state.initialized = false;
    state.orbitThetaReady = false;
    state.opacity = 0;
    state.floatingCount = DEFAULT_FLOATING_BLOCK_COUNT;
  }

  function isActive(fx) {
    return !!(fx && Number(fx.preset) === INDEX);
  }

  function pointerRipple(worldX, worldZ, strength) {
    addRipple(worldX, worldZ, strength || 1.2, false);
  }

  function update(dt, ctx) {
    ctx = ctx || {};
    var fx = ctx.fx || {};
    var scene = ctx.scene;
    var active = isActive(fx);
    var target = active ? 1 : 0;
    state.opacity += (target - state.opacity) * Math.min(1, dt * (active ? 3.0 : 2.2));
    if (!active && state.opacity < 0.01) {
      if (state.root) state.root.visible = false;
      return;
    }
    ensureLayer(scene, fx);
    if (!state.root) return;
    updateSonicRotation(fx, dt, ctx);
    applyLayout(fx);
    state.root.visible = true;
    state.sonicTime += dt * (0.45 + sonicNumber(fx, 'sonicGroundMotionSpeed', DEFAULT_GROUND_MOTION_SPEED, 0, 100) * 0.017);
    var time = state.sonicTime || (ctx.time != null ? ctx.time : 0);
    var audio = readMineradioAudio(ctx.audio || {});
    syncTerrainUniforms(fx, audio, dt, time);
    if (active) updateAudioTriggers(audio);
    updateFloatingBlocks(fx, audio, dt, time);
    updateMeteorsAndTrails(dt);
    state.root.visible = state.opacity > 0.02;
  }

  function onPresetChange(prev, next, ctx) {
    if (prev === INDEX && next !== INDEX) clearLayer();
    if (next === INDEX && ctx && ctx.scene) {
      if (state.initialized) clearLayer();
      ensureLayer(ctx.scene, ctx.fx || {});
      applyLayout(ctx.fx || {});
    }
  }

  global.MineradioSonicTopography = {
    INDEX: INDEX,
    isActive: isActive,
    update: update,
    clear: clearLayer,
    onPresetChange: onPresetChange,
    pointerRipple: pointerRipple
  };
})(typeof window !== 'undefined' ? window : globalThis);
