'use strict';

(function (global) {
  var INDEX = 8;
  var BRIDGE_SRC = 'vendor/sonic-workshop/mineradio-bridge.html';
  var MOUNT_ID = 'sonic-workshop-layer';
  var AUDIO_PUSH_INTERVAL_MS = 33;
  var MEDIA_PUSH_INTERVAL_MS = 250;
  var PROPERTIES_PUSH_INTERVAL_MS = 1000;
  var WORKSHOP_THEME_TRANSITION_MS = 1280;
  var WORKSHOP_AUDIO_TARGET_MAX_SAMPLE = 0.52;
  var WORKSHOP_AUDIO_BODY_GAIN = 0.33;
  var WORKSHOP_AUDIO_PEAK_GAIN = 0.12;
  var WORKSHOP_AUDIO_GAMMA = 1.55;
  var WORKSHOP_AUDIO_MIN_FLOOR = 0.035;
  var WORKSHOP_AUDIO_LOW_LIFT = 0.035;
  var WORKSHOP_AUDIO_PAUSED_GAIN = 0.12;
  var WORKSHOP_DEFAULT_PROPERTIES = {
    schemecolor: '0.3333333333333333 0.0196078431372549 0.3333333333333333',
    theme: 'coral-mirage',
    mineradioCustomTheme: null,
    themeCycleInterval: 50,
    peakColorEnabled: true,
    peakColorIntensity: 0.62,
    gridSize: 320,
    audioIntensity: 1.15,
    responseRange: 1.3,
    pulseEnabled: true,
    pulseSensitivity: 0.05,
    pulseCooldown: 0,
    meteorEnabled: true,
    meteorSensitivity: 0.3,
    meteorCooldown: 60,
    meteorClickEnabled: true,
    idleWaveEnabled: true,
    idleWaveDebounce: 1,
    idleWaveFadeDuration: 1,
    cameraDistance: 80,
    autoRotateEnabled: true,
    autoRotateSpeed: 7,
    cameraAngleX: 150,
    cameraAngleY: 30,
    showPlayerController: false,
    showAlbumCover: true,
    controllerSize: 'large',
    controllerX: 2,
    controllerY: 3
  };

  var zeroSamples = new Array(512).fill(0);
  var state = {
    layer: null,
    iframe: null,
    active: false,
    ready: false,
    opacity: 0,
    lastAudioAt: 0,
    lastMediaAt: 0,
    lastPropertiesAt: 0,
    lastMediaKey: '',
    lastPropertiesKey: '',
    samples: zeroSamples.slice(),
    media: null,
    displayedTheme: null,
    themeTransition: null,
    themeTransitionRaf: 0
  };

  function nowMs() {
    return global.performance && performance.now ? performance.now() : Date.now();
  }

  function clamp(value, min, max) {
    value = Number(value);
    if (!isFinite(value)) value = min;
    return Math.max(min, Math.min(max, value));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function isActive(fx) {
    return !!(fx && Number(fx.preset) === INDEX);
  }

  function currentSong() {
    if (Array.isArray(global.playQueue) && global.currentIdx >= 0 && global.currentIdx < global.playQueue.length) return global.playQueue[global.currentIdx];
    if (Array.isArray(global.playlist) && global.currentIdx >= 0 && global.currentIdx < global.playlist.length) return global.playlist[global.currentIdx];
    return null;
  }

  function normalizeHex(value, fallback) {
    value = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    if (/^#[0-9a-fA-F]{3}$/.test(value)) {
      return '#' + value.slice(1).split('').map(function (c) { return c + c; }).join('');
    }
    return fallback || '#ffffff';
  }

  function cssColorToHex(value, fallback) {
    value = String(value || '').trim();
    if (/^#[0-9a-fA-F]{3,6}$/.test(value)) return normalizeHex(value, fallback);
    var m = value.match(/^rgba?\(\s*([.\d]+)\s*,\s*([.\d]+)\s*,\s*([.\d]+)/i);
    if (m) {
      var r = Math.max(0, Math.min(255, Math.round(parseFloat(m[1]) || 0)));
      var g = Math.max(0, Math.min(255, Math.round(parseFloat(m[2]) || 0)));
      var b = Math.max(0, Math.min(255, Math.round(parseFloat(m[3]) || 0)));
      return '#' + [r, g, b].map(function (n) { return n.toString(16).padStart(2, '0'); }).join('');
    }
    return fallback || '#ffffff';
  }

  function hexRgb(hex, fallback) {
    hex = normalizeHex(hex || fallback || '#ffffff', fallback || '#ffffff').slice(1);
    var n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHslLocal(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: h, s: s, l: l };
  }

  function hslToRgbLocal(h, s, l) {
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var r, g, b;
    h = ((Number(h) || 0) % 1 + 1) % 1;
    s = clamp01(Number(s) || 0);
    l = clamp01(Number(l) || 0);
    if (s === 0) {
      r = g = b = l;
    } else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  function rgbToHexLocal(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      return Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
    }).join('');
  }

  function mixHex(a, b, t) {
    var ca = hexRgb(a, '#000000');
    var cb = hexRgb(b, '#ffffff');
    t = clamp01(t);
    return rgbToHexLocal(
      ca.r + (cb.r - ca.r) * t,
      ca.g + (cb.g - ca.g) * t,
      ca.b + (cb.b - ca.b) * t
    );
  }

  function hexToSchemeColor(hex) {
    var rgb = hexRgb(hex, '#cb6c89');
    return [rgb.r / 255, rgb.g / 255, rgb.b / 255].map(function (v) {
      return String(clamp(v, 0, 1));
    }).join(' ');
  }

  var WORKSHOP_THEME_ALIASES = {
    'minimal-mono': 'minimal-monochrome',
    'arctic-blue': 'arctic-aurora',
    'emerald-forest': 'cyber-forest',
    crimson: 'crimson-sunset',
    aurora: 'arctic-aurora',
    'violet-dream': 'neon-tokyo'
  };
  var WORKSHOP_THEME_COLORS = {
    nocturnal: '#7d3fff',
    'ocean-deep': '#1b6fb8',
    'arctic-aurora': '#79e1c4',
    'cyber-forest': '#3fc78a',
    'golden-hour': '#e8b44c',
    'ember-fire': '#f27a28',
    'crimson-sunset': '#d84252',
    'coral-mirage': '#cb6c89',
    'neon-tokyo': '#ff4fb8',
    'minimal-monochrome': '#d9dde3'
  };

  function workshopCoverHex(role) {
    var pal = global.stageLyrics && (global.stageLyrics.coverPalette || global.stageLyrics.palette) || {};
    role = String(role || 'primary');
    var fallback = role === 'base' ? '#16060f' : (role === 'cool' || role === 'peak' ? '#99c4ff' : (role === 'ripple' ? '#f8d8ff' : '#cb6c89'));
    var value = pal.rawAreaPrimary || pal.rawPrimary || pal.primary || pal.highlight || pal.secondary;
    if (role === 'base') value = pal.rawAreaBase || pal.rawDark || pal.rawAverage || pal.secondary || pal.rawAreaPrimary || pal.rawPrimary || pal.primary;
    else if (role === 'warm') value = pal.rawAreaWarm || pal.rawAreaPrimary || pal.rawWarm || pal.rawPrimary || pal.secondary || pal.primary || pal.highlight;
    else if (role === 'cool') value = pal.rawAreaCool || pal.rawAreaLight || pal.rawCool || pal.rawLight || pal.highlight || pal.rawAreaPrimary || pal.rawPrimary || pal.primary;
    else if (role === 'ripple') value = pal.rawAreaLight || pal.rawAreaAccent || pal.rawLight || pal.rawAccent || pal.rawAreaCool || pal.rawCool || pal.highlight || pal.primary;
    else if (role === 'peak') value = pal.rawAreaAccent || pal.rawAreaCool || pal.rawAreaLight || pal.rawCool || pal.rawAccent || pal.rawLight || pal.highlight || pal.primary;
    return cssColorToHex(value, fallback);
  }

  function colorDistance(a, b) {
    var ca = hexRgb(a, '#000000');
    var cb = hexRgb(b, '#000000');
    var dr = (ca.r - cb.r) / 255;
    var dg = (ca.g - cb.g) / 255;
    var db = (ca.b - cb.b) / 255;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function workshopPaletteHexesFromCover() {
    var pal = global.stageLyrics && (global.stageLyrics.coverPalette || global.stageLyrics.palette) || {};
    var values = [];
    if (Array.isArray(pal.sonicWorkshopColors)) values = values.concat(pal.sonicWorkshopColors);
    if (Array.isArray(pal.coverColors)) values = values.concat(pal.coverColors);
    [
      pal.rawAreaPrimary,
      pal.rawAreaBase,
      pal.rawAreaWarm,
      pal.rawAreaCool,
      pal.rawAreaLight,
      pal.rawAreaAccent,
      pal.rawPrimary,
      pal.rawWarm,
      pal.rawCool,
      pal.rawLight,
      pal.rawDark,
      pal.rawAccent,
      pal.rawAverage,
      pal.primary,
      pal.secondary,
      pal.highlight,
      pal.glowColor
    ].forEach(function (value) { if (value) values.push(value); });
    var out = [];
    values.forEach(function (value) {
      var hex = cssColorToHex(value, '');
      if (!hex) return;
      var key = hex.toLowerCase();
      for (var i = 0; i < out.length; i++) {
        if (out[i].toLowerCase() === key || colorDistance(out[i], hex) < 0.035) return;
      }
      out.push(hex);
    });
    if (!out.length) out.push('#cb6c89');
    return out.slice(0, 8);
  }

  function workshopHexInfo(hex) {
    var rgb = hexRgb(hex, '#cb6c89');
    var hsl = rgbToHslLocal(rgb.r, rgb.g, rgb.b);
    var lum = (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114) / 255;
    return { hex: normalizeHex(hex, '#cb6c89'), rgb: rgb, hsl: hsl, lum: lum, chroma: hsl.s };
  }

  function workshopHueBandScore(h, center, width) {
    var d = Math.abs((((h - center) % 1) + 1) % 1);
    d = Math.min(d, 1 - d);
    return Math.max(0, 1 - d / width);
  }

  function workshopPickPaletteHex(hexes, kind, fallback, avoidHex) {
    var best = null;
    var bestScore = -Infinity;
    (hexes && hexes.length ? hexes : [fallback || '#cb6c89']).forEach(function (hex) {
      var info = workshopHexInfo(hex);
      var h = info.hsl.h;
      var score = 0;
      if (kind === 'dark') score = (1 - info.lum) * 1.20 + info.chroma * 0.34;
      else if (kind === 'light') score = info.lum * 1.18 + info.chroma * 0.34;
      else if (kind === 'warm') score = Math.max(workshopHueBandScore(h, 0.06, 0.22), workshopHueBandScore(h, 0.98, 0.16)) * 1.05 + info.chroma * 0.62 + info.lum * 0.10;
      else if (kind === 'cool') score = workshopHueBandScore(h, 0.56, 0.30) * 1.08 + info.chroma * 0.58 + info.lum * 0.10;
      else if (kind === 'accent') score = info.chroma * 0.95 + Math.min(0.42, Math.abs(info.lum - 0.50)) * 0.20 + (avoidHex ? colorDistance(info.hex, avoidHex) * 0.36 : 0);
      else score = info.chroma * 0.88 + (0.50 - Math.abs(info.lum - 0.56)) * 0.34;
      if (score > bestScore) {
        best = info.hex;
        bestScore = score;
      }
    });
    return best || fallback || '#cb6c89';
  }

  function workshopThemeForColor(hex) {
    var rgb = hexRgb(hex, '#cb6c89');
    var hsl = rgbToHslLocal(rgb.r, rgb.g, rgb.b);
    if (hsl.s < 0.08) return 'minimal-monochrome';
    if (hsl.h < 0.035 || hsl.h >= 0.94) return 'crimson-sunset';
    if (hsl.h < 0.10) return 'coral-mirage';
    if (hsl.h < 0.14) return 'ember-fire';
    if (hsl.h < 0.18) return 'golden-hour';
    if (hsl.h < 0.42) return 'cyber-forest';
    if (hsl.h < 0.66) return 'arctic-aurora';
    if (hsl.h < 0.74) return 'ocean-deep';
    return 'neon-tokyo';
  }

  function normalizeWorkshopTheme(theme) {
    theme = String(theme || '');
    theme = WORKSHOP_THEME_ALIASES[theme] || theme;
    return /^(nocturnal|coral-mirage|ocean-deep|arctic-aurora|cyber-forest|minimal-monochrome|neon-tokyo|golden-hour|ember-fire|crimson-sunset)$/.test(theme) ? theme : 'coral-mirage';
  }

  function workshopThemeColor(theme) {
    return WORKSHOP_THEME_COLORS[normalizeWorkshopTheme(theme)] || '#cb6c89';
  }

  function workshopCustomThemeForColor(hex) {
    hex = normalizeHex(hex, '#cb6c89');
    var rgb = hexRgb(hex, '#cb6c89');
    var hsl = rgbToHslLocal(rgb.r, rgb.g, rgb.b);
    var peakRgb = hslToRgbLocal(hsl.h + 0.54, clamp(0.62 + hsl.s * 0.28, 0.62, 0.92), clamp(0.54 + hsl.l * 0.14, 0.50, 0.72));
    var peak = rgbToHexLocal(peakRgb.r, peakRgb.g, peakRgb.b);
    var glow = clamp(0.62 + hsl.s * 0.20 + hsl.l * 0.10, 0.62, 0.98);
    return {
      name: 'Mineradio Custom',
      id: 'mineradio-custom',
      __primaryColor: hex,
      uBaseColor1: mixHex('#000000', hex, 0.075),
      uBaseColor2: mixHex('#000000', hex, 0.18),
      uCoolCore: hex,
      uCoolEdge: mixHex('#000000', hex, 0.46),
      uWarmCore: hex,
      uWarmEdge: mixHex('#000000', hex, 0.58),
      uRippleColor: hex,
      uPeakColor: peak,
      uGlowIntensity: Number(glow.toFixed(3))
    };
  }

  function workshopCustomThemeForPalette(hexes, fallbackHex) {
    hexes = Array.isArray(hexes) ? hexes.slice() : [];
    fallbackHex = normalizeHex(fallbackHex || hexes[0] || '#cb6c89', '#cb6c89');
    if (hexes.length <= 1) return workshopCustomThemeForColor(fallbackHex);
    var primary = workshopPickPaletteHex(hexes, 'primary', fallbackHex);
    var dark = workshopPickPaletteHex(hexes, 'dark', primary);
    var warm = workshopPickPaletteHex(hexes, 'warm', primary, primary);
    var cool = workshopPickPaletteHex(hexes, 'cool', primary, warm);
    var light = workshopPickPaletteHex(hexes, 'light', primary);
    var accent = workshopPickPaletteHex(hexes, 'accent', light, primary);
    return workshopCustomThemeForRegions({
      primary: primary,
      base: dark,
      warm: warm,
      cool: cool,
      ripple: light,
      peak: colorDistance(cool, warm) > 0.14 ? cool : accent
    });
  }

  function workshopCustomThemeForRegions(regions) {
    regions = regions || {};
    var primary = normalizeHex(regions.primary || '#cb6c89', '#cb6c89');
    var base = normalizeHex(regions.base || mixHex('#000000', primary, 0.16), '#16060f');
    var warm = normalizeHex(regions.warm || primary, primary);
    var cool = normalizeHex(regions.cool || '#99c4ff', '#99c4ff');
    var ripple = normalizeHex(regions.ripple || regions.peak || cool, '#f8d8ff');
    var peak = normalizeHex(regions.peak || cool, '#99c4ff');
    var info = workshopHexInfo(primary);
    var coolInfo = workshopHexInfo(cool);
    var peakInfo = workshopHexInfo(peak);
    var glow = clamp(0.62 + info.chroma * 0.10 + Math.max(coolInfo.chroma, peakInfo.chroma) * 0.08 + Math.max(0, info.lum - 0.38) * 0.06, 0.62, 0.96);
    return {
      name: 'Mineradio Region Palette',
      id: 'mineradio-custom',
      __primaryColor: primary,
      uBaseColor1: mixHex('#000000', base, 0.20),
      uBaseColor2: mixHex(base, primary, 0.22),
      uCoolCore: cool,
      uCoolEdge: mixHex('#000000', cool, 0.48),
      uWarmCore: warm,
      uWarmEdge: mixHex('#000000', warm, 0.56),
      uRippleColor: ripple,
      uPeakColor: peak,
      uGlowIntensity: Number(glow.toFixed(3))
    };
  }

  function workshopRegionHex(fx, role, colorKey, modeKey, fallback) {
    fallback = normalizeHex(fallback || '#cb6c89', '#cb6c89');
    if (fx && fx[modeKey] === 'custom') return cssColorToHex(fx[colorKey] || fallback, fallback);
    return workshopCoverHex(role) || fallback;
  }

  function workshopRegionsFromFx(fx) {
    fx = fx || {};
    var customTheme = normalizeWorkshopTheme(fx.sonicWorkshopTheme);
    var themeHex = workshopThemeColor(customTheme);
    var primary = fx.sonicWorkshopColorMode === 'custom'
      ? cssColorToHex(fx.sonicWorkshopCustomColor || themeHex, themeHex)
      : workshopCoverHex('primary');
    primary = normalizeHex(primary, '#cb6c89');
    return {
      primary: primary,
      base: workshopRegionHex(fx, 'base', 'sonicWorkshopBaseColor', 'sonicWorkshopBaseColorMode', mixHex('#000000', primary, 0.12)),
      warm: workshopRegionHex(fx, 'warm', 'sonicWorkshopWarmColor', 'sonicWorkshopWarmColorMode', primary),
      cool: workshopRegionHex(fx, 'cool', 'sonicWorkshopCoolColor', 'sonicWorkshopCoolColorMode', '#99c4ff'),
      ripple: workshopRegionHex(fx, 'ripple', 'sonicWorkshopRippleColor', 'sonicWorkshopRippleColorMode', '#f8d8ff'),
      peak: workshopRegionHex(fx, 'peak', 'sonicWorkshopPeakColor', 'sonicWorkshopPeakColorMode', '#99c4ff')
    };
  }

  var WORKSHOP_THEME_COLOR_KEYS = ['uBaseColor1', 'uBaseColor2', 'uCoolCore', 'uCoolEdge', 'uWarmCore', 'uWarmEdge', 'uRippleColor', 'uPeakColor'];

  function workshopThemeSignature(theme) {
    theme = theme || {};
    return JSON.stringify(WORKSHOP_THEME_COLOR_KEYS.map(function (key) {
      return normalizeHex(theme[key] || '#000000', '#000000');
    }).concat([Number(theme.uGlowIntensity) || 1, normalizeHex(theme.__primaryColor || '#cb6c89', '#cb6c89')]));
  }

  function cloneWorkshopTheme(theme) {
    theme = theme || workshopCustomThemeForColor('#cb6c89');
    var out = {
      name: theme.name || 'Mineradio Region Palette',
      id: theme.id || 'mineradio-custom',
      __primaryColor: normalizeHex(theme.__primaryColor || '#cb6c89', '#cb6c89'),
      uGlowIntensity: Number(theme.uGlowIntensity) || 1
    };
    WORKSHOP_THEME_COLOR_KEYS.forEach(function (key) {
      out[key] = normalizeHex(theme[key] || '#000000', '#000000');
    });
    return out;
  }

  function mixWorkshopTheme(from, to, t) {
    from = cloneWorkshopTheme(from);
    to = cloneWorkshopTheme(to);
    t = clamp01(t);
    var out = {
      name: to.name || from.name || 'Mineradio Region Palette',
      id: to.id || from.id || 'mineradio-custom',
      __primaryColor: mixHex(from.__primaryColor, to.__primaryColor, t),
      uGlowIntensity: Number((from.uGlowIntensity + (to.uGlowIntensity - from.uGlowIntensity) * t).toFixed(3))
    };
    WORKSHOP_THEME_COLOR_KEYS.forEach(function (key) {
      out[key] = mixHex(from[key], to[key], t);
    });
    return out;
  }

  function workshopEase(t) {
    t = clamp01(t);
    return 0.5 - Math.cos(Math.PI * t) * 0.5;
  }

  function scheduleWorkshopThemeTransition() {
    if (!state.themeTransition || state.themeTransitionRaf) return;
    var raf = global.requestAnimationFrame || function (fn) { return setTimeout(function () { fn(nowMs()); }, 33); };
    state.themeTransitionRaf = raf(function () {
      state.themeTransitionRaf = 0;
      if (state.themeTransition) pushProperties(true);
    });
  }

  function applyWorkshopThemeTransition(props) {
    if (!props || !props.mineradioCustomTheme) return props;
    var target = cloneWorkshopTheme(props.mineradioCustomTheme);
    state.displayedTheme = target;
    state.themeTransition = null;
    props.mineradioCustomTheme = target;
    props.schemecolor = hexToSchemeColor(target.__primaryColor);
    return props;
  }

  function buildMediaState() {
    var song = currentSong();
    var cover = '';
    if (song && typeof global.songCoverSrc === 'function') cover = global.songCoverSrc(song, 512) || '';
    if (!cover && song && song.cover) {
      cover = typeof global.coverUrlWithSize === 'function' ? global.coverUrlWithSize(song.cover, 512) : song.cover;
    }
    var pal = global.stageLyrics && (global.stageLyrics.coverPalette || global.stageLyrics.palette) || {};
    var duration = global.audio && isFinite(global.audio.duration) ? Number(global.audio.duration) : Number(song && (song.duration || song.durationSec || 0)) || 0;
    if (duration > 10000) duration /= 1000;
    return {
      title: String((song && (song.name || song.title)) || ''),
      artist: String((song && (song.artist || song.ar || song.author)) || ''),
      thumbnail: cover || '',
      primaryColor: cssColorToHex(pal.primary || pal.secondary || pal.highlight, '#6bd9ff'),
      textColor: cssColorToHex(pal.highlight || pal.primary, '#f8fbff'),
      isPlaying: !!(global.playing && global.audio && !global.audio.paused),
      position: global.audio && isFinite(global.audio.currentTime) ? Number(global.audio.currentTime) : 0,
      duration: duration
    };
  }

  function postMessage(type, payload) {
    var frame = state.iframe && state.iframe.contentWindow;
    if (!frame) return;
    try {
      if (type === 'mineradio-sonic-workshop-audio' && typeof frame.__mineradioApplyAudio === 'function') {
        frame.__mineradioApplyAudio(payload.samples);
        return;
      }
      if (type === 'mineradio-sonic-workshop-media' && typeof frame.__mineradioApplyMedia === 'function') {
        frame.__mineradioApplyMedia(payload.media);
        return;
      }
      if (type === 'mineradio-sonic-workshop-properties' && typeof frame.__mineradioApplyProperties === 'function') {
        frame.__mineradioApplyProperties(payload.properties);
        return;
      }
    } catch (e) {}
    try { frame.postMessage(Object.assign({ type: type }, payload), '*'); } catch (e2) {}
  }

  function ensureLayer() {
    if (state.layer && state.iframe) return;
    var layer = document.getElementById(MOUNT_ID);
    if (!layer) {
      layer = document.createElement('div');
      layer.id = MOUNT_ID;
      layer.setAttribute('aria-hidden', 'true');
      layer.setAttribute('inert', '');
      layer.tabIndex = -1;
      layer.style.pointerEvents = 'none';
      layer.style.userSelect = 'none';
      layer.style.webkitUserSelect = 'none';
      var canvasAnchor = document.getElementById('canvas-container');
      if (canvasAnchor && canvasAnchor.parentNode) canvasAnchor.parentNode.insertBefore(layer, canvasAnchor);
      else document.body.insertBefore(layer, document.body.firstChild);
    }
    layer.style.opacity = '0';
    layer.style.pointerEvents = 'none';
    layer.setAttribute('inert', '');
    var iframe = layer.querySelector('iframe');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.setAttribute('title', 'Sonic Workshop Visual');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('tabindex', '-1');
      iframe.setAttribute('inert', '');
      iframe.setAttribute('allow', 'autoplay');
      iframe.setAttribute('frameborder', '0');
      iframe.draggable = false;
      iframe.tabIndex = -1;
      iframe.style.pointerEvents = 'none';
      iframe.style.userSelect = 'none';
      iframe.style.webkitUserSelect = 'none';
      iframe.src = BRIDGE_SRC;
      layer.appendChild(iframe);
    }
    iframe.style.pointerEvents = 'none';
    iframe.setAttribute('inert', '');
    iframe.onload = function () {
      state.ready = true;
      pushProperties(true);
      pushMedia(true);
      pushAudio(true);
    };
    state.layer = layer;
    state.iframe = iframe;
  }

  function removeLayer() {
    if (state.themeTransitionRaf) {
      try {
        if (global.cancelAnimationFrame) global.cancelAnimationFrame(state.themeTransitionRaf);
        else clearTimeout(state.themeTransitionRaf);
      } catch (e) {}
    }
    if (state.layer && state.layer.parentNode) state.layer.parentNode.removeChild(state.layer);
    state.layer = null;
    state.iframe = null;
    state.ready = false;
    state.lastMediaKey = '';
    state.lastPropertiesKey = '';
    state.displayedTheme = null;
    state.themeTransition = null;
    state.themeTransitionRaf = 0;
  }

  function bodyClass(active) {
    if (document && document.body) document.body.classList.toggle('sonic-workshop-active', !!active);
  }

  function deriveProperties(fx) {
    fx = fx || {};
    var coverHexes = workshopPaletteHexesFromCover();
    var props = Object.assign({}, WORKSHOP_DEFAULT_PROPERTIES);
    props.audioIntensity = clamp(fx.sonicWorkshopAudioIntensity == null ? props.audioIntensity : Number(fx.sonicWorkshopAudioIntensity), 0.3, 2.5);
    props.responseRange = clamp(fx.sonicWorkshopResponseRange == null ? props.responseRange : Number(fx.sonicWorkshopResponseRange), 0.3, 2);
    props.peakColorIntensity = clamp(fx.sonicWorkshopPeakIntensity == null ? props.peakColorIntensity : Number(fx.sonicWorkshopPeakIntensity), 0, 1.4);
    var customTheme = normalizeWorkshopTheme(fx.sonicWorkshopTheme);
    var regions = workshopRegionsFromFx(fx);
    var colorHex = normalizeHex(regions.primary, '#cb6c89');
    var paletteHexes = [
      regions.primary,
      regions.base,
      regions.warm,
      regions.cool,
      regions.ripple,
      regions.peak
    ];
    coverHexes.forEach(function (hex) {
      if (!hex) return;
      var key = hex.toLowerCase();
      for (var i = 0; i < paletteHexes.length; i++) {
        if (paletteHexes[i] && paletteHexes[i].toLowerCase() === key) return;
      }
      paletteHexes.push(hex);
    });
    props.theme = 'mineradio-custom';
    props.mineradioCustomTheme = workshopCustomThemeForRegions(regions);
    props.schemecolor = hexToSchemeColor(colorHex);
    props.__mineradioColorHex = colorHex;
    props.__mineradioPaletteHexes = paletteHexes.join(',');
    props.__mineradioNearestTheme = fx.sonicWorkshopColorMode === 'custom' ? customTheme : workshopThemeForColor(colorHex);
    return props;
  }

  function pushProperties(force) {
    if (!state.iframe) return;
    var props = applyWorkshopThemeTransition(deriveProperties(global.fx || {}));
    var key = JSON.stringify(props);
    var now = nowMs();
    if (!force && key === state.lastPropertiesKey && now - state.lastPropertiesAt < PROPERTIES_PUSH_INTERVAL_MS) return;
    state.lastPropertiesKey = key;
    state.lastPropertiesAt = now;
    postMessage('mineradio-sonic-workshop-properties', { properties: props });
  }

  function pushMedia(force) {
    if (!state.iframe) return;
    var media = buildMediaState();
    var key = [
      media.title,
      media.artist,
      media.thumbnail,
      media.primaryColor,
      media.textColor,
      media.isPlaying ? 1 : 0,
      Math.round(media.duration || 0),
      Math.floor((media.position || 0) * 2) / 2
    ].join('|');
    var now = nowMs();
    if (!force && key === state.lastMediaKey && now - state.lastMediaAt < MEDIA_PUSH_INTERVAL_MS) return;
    state.lastMediaKey = key;
    state.lastMediaAt = now;
    state.media = media;
    postMessage('mineradio-sonic-workshop-media', { media: media });
  }

  function rawAudioArray() {
    if (global.frequencyData && global.frequencyData.length) return global.frequencyData;
    return null;
  }

  function frameValue(audioFrame, key) {
    return audioFrame && isFinite(audioFrame[key]) ? Number(audioFrame[key]) : 0;
  }

  function rawBinValue(raw, idx) {
    var value = Number(raw[idx]) || 0;
    return clamp01(value > 1 ? value / 255 : value);
  }

  function workshopAudioFrameStats(raw) {
    var len = raw && raw.length || 0;
    var sum = 0;
    var max = 0;
    if (!len) return { mean: 0, max: 0, floor: WORKSHOP_AUDIO_MIN_FLOOR, peakFloor: 0.38, bodyGain: WORKSHOP_AUDIO_BODY_GAIN };
    for (var i = 0; i < 512; i++) {
      var idx = Math.min(len - 1, Math.floor(i * len / 512));
      var v = rawBinValue(raw, idx);
      sum += v;
      if (v > max) max = v;
    }
    var mean = sum / 512;
    return {
      mean: mean,
      max: max,
      floor: clamp(Math.max(WORKSHOP_AUDIO_MIN_FLOOR, mean * 0.48), WORKSHOP_AUDIO_MIN_FLOOR, 0.20),
      peakFloor: clamp(Math.max(0.38, mean * 1.72), 0.38, 0.76),
      bodyGain: clamp(WORKSHOP_AUDIO_BODY_GAIN - mean * 0.10, 0.28, WORKSHOP_AUDIO_BODY_GAIN)
    };
  }

  function shapeWorkshopAudioValue(value, i, stats, beat, bassDrive) {
    var floor = stats && isFinite(stats.floor) ? stats.floor : WORKSHOP_AUDIO_MIN_FLOOR;
    var body = Math.pow(clamp01((value - floor) / Math.max(0.001, 1 - floor)), WORKSHOP_AUDIO_GAMMA);
    var peakFloor = stats && isFinite(stats.peakFloor) ? stats.peakFloor : 0.38;
    var peak = Math.pow(clamp01((value - peakFloor) / Math.max(0.001, 1 - peakFloor)), 1.08);
    var lowLift = i < 36 ? (1 - i / 36) * (beat * WORKSHOP_AUDIO_LOW_LIFT + bassDrive * 0.022) : 0;
    var shaped = body * (stats && stats.bodyGain || WORKSHOP_AUDIO_BODY_GAIN) + peak * WORKSHOP_AUDIO_PEAK_GAIN + lowLift;
    return clamp(shaped, 0, WORKSHOP_AUDIO_TARGET_MAX_SAMPLE);
  }

  function buildAudioSamples(audioFrame) {
    var raw = rawAudioArray();
    var out = new Array(512);
    var inputGainValue = global.fx && global.fx.sonicWorkshopInputGain != null ? Number(global.fx.sonicWorkshopInputGain) : 82;
    var inputGain = clamp(inputGainValue, 40, 100) / 100;
    var beat = Math.max(frameValue(audioFrame, 'beat'), frameValue(audioFrame, 'kickEnvelope'), frameValue(audioFrame, 'triggerPulse'));
    var bassDrive = Math.max(frameValue(audioFrame, 'subBass'), frameValue(audioFrame, 'bass'));
    if (raw && raw.length) {
      var len = raw.length;
      var stats = workshopAudioFrameStats(raw);
      for (var i = 0; i < 512; i++) {
        var idx = Math.min(len - 1, Math.floor(i * len / 512));
        out[i] = shapeWorkshopAudioValue(rawBinValue(raw, idx), i, stats, beat, bassDrive) * inputGain;
      }
    } else {
      var bands = [
        frameValue(audioFrame, 'subBass') || frameValue(audioFrame, 'bass'),
        frameValue(audioFrame, 'bass'),
        frameValue(audioFrame, 'lowMid') || frameValue(audioFrame, 'mid'),
        frameValue(audioFrame, 'mid'),
        frameValue(audioFrame, 'highMid') || frameValue(audioFrame, 'treble'),
        frameValue(audioFrame, 'presence') || frameValue(audioFrame, 'treble'),
        frameValue(audioFrame, 'brilliance') || frameValue(audioFrame, 'treble'),
        frameValue(audioFrame, 'air') || frameValue(audioFrame, 'treble')
      ];
      for (var j = 0; j < 512; j++) {
        var bandPos = j / 511 * (bands.length - 1);
        var bandIndex = Math.floor(bandPos);
        var mix = bandPos - bandIndex;
        var a = bands[bandIndex] || 0;
        var b = bands[Math.min(bands.length - 1, bandIndex + 1)] || a;
        var v = a + (b - a) * mix;
        var fallbackLift = j < 36 ? beat * (1 - j / 36) * WORKSHOP_AUDIO_LOW_LIFT : 0;
        out[j] = clamp(Math.pow(clamp01(v), 1.35) * 0.30 + fallbackLift, 0, WORKSHOP_AUDIO_TARGET_MAX_SAMPLE) * inputGain;
      }
    }
    if (!(global.playing && global.audio && !global.audio.paused)) {
      for (var k = 0; k < out.length; k++) out[k] = out[k] * WORKSHOP_AUDIO_PAUSED_GAIN;
    }
    state.samples = out;
    return out;
  }

  function pushAudio(force, audioFrame) {
    if (!state.iframe) return;
    var now = nowMs();
    if (!force && now - state.lastAudioAt < AUDIO_PUSH_INTERVAL_MS) return;
    state.lastAudioAt = now;
    postMessage('mineradio-sonic-workshop-audio', { samples: buildAudioSamples(audioFrame || {}) });
  }

  function update(dt, ctx) {
    ctx = ctx || {};
    var targetActive = isActive(ctx.fx || global.fx);
    state.active = targetActive;
    bodyClass(targetActive || state.opacity > 0.02);
    if (targetActive) ensureLayer();
    var targetOpacity = targetActive ? 1 : 0;
    var rate = targetOpacity > state.opacity ? 7.5 : 5.0;
    state.opacity += (targetOpacity - state.opacity) * clamp(1 - Math.exp(-rate * Math.max(0.001, dt || 1 / 60)), 0, 1);
    if (state.layer) state.layer.style.opacity = state.opacity.toFixed(3);
    if (targetActive) {
      pushProperties(false);
      pushMedia(false);
      pushAudio(false, ctx.audio);
    } else if (state.layer && state.opacity <= 0.01) {
      removeLayer();
      bodyClass(false);
    }
  }

  function clear() {
    state.active = false;
    state.opacity = 0;
    bodyClass(false);
    removeLayer();
  }

  function onPresetChange(prev, next, opts) {
    if (Number(next) === INDEX) {
      ensureLayer();
      state.opacity = Math.max(state.opacity, 0.001);
      bodyClass(true);
      pushProperties(true);
      pushMedia(true);
      pushAudio(true, opts && opts.audio);
    } else if (Number(prev) === INDEX) {
      state.active = false;
      bodyClass(true);
    }
  }

  global.addEventListener && global.addEventListener('message', function (event) {
    var data = event && event.data || {};
    if (data.type === 'mineradio-sonic-workshop-ready') {
      state.ready = true;
      pushProperties(true);
      pushMedia(true);
      pushAudio(true);
    }
  });

  global.MineradioSonicWorkshop = {
    INDEX: INDEX,
    isActive: isActive,
    update: update,
    clear: clear,
    pushProperties: function (force) { pushProperties(force === true); },
    onPresetChange: onPresetChange
  };
})(window);
