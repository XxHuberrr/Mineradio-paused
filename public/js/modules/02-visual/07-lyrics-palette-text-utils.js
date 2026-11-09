function uiAccentHex(fallback) {
  var defaultAccent = normalizeHexColor(fxDefaults.uiAccentColor || '#ffffff', '#ffffff');
  var fallbackAccent = normalizeHexColor(fallback || defaultAccent, defaultAccent);
  return normalizeHexColor((fx && fx.uiAccentColor) || fallbackAccent, fallbackAccent);
}
function uiAccentRgba(alpha, fallback) {
  var c = hexToRgb(uiAccentHex(fallback));
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (alpha == null ? 1 : alpha) + ')';
}
function readableInkForHex(hex) {
  var c = hexToRgb(hex || '#00f5d4');
  var lum = (c.r * 0.299 + c.g * 0.587 + c.b * 0.114) / 255;
  return lum > 0.54 ? '#06100f' : '#f8fbff';
}
function lyricHighImpactTextHsl(hsl, opts) {
  opts = opts || {};
  hsl = hsl || { h: 0.52, s: 0.72, l: 0.72 };
  var avgL = opts.avgL == null ? hsl.l : Number(opts.avgL);
  var neutral = hsl.s < (opts.neutralCutoff == null ? 0.035 : opts.neutralCutoff);
  var sampledBright = hsl.l >= 0.62 || avgL >= 0.64 || opts.sampledBright === true;
  var minS = opts.minS == null ? 0.88 : Number(opts.minS);
  var s = neutral ? 0 : (sampledBright
    ? clampRange(Math.max(hsl.s, minS), 0, 1)
    : clampRange(Math.max(hsl.s * 1.20, minS), 0, 1));
  var l = sampledBright
    ? clampRange(Math.max(hsl.l, 0.70), 0.66, 0.94)
    : clampRange(Math.max(hsl.l + 0.30, 0.74), 0.70, 0.90);
  return {
    h: hsl.h,
    s: s,
    l: l,
    neutral: neutral,
    sampledBright: sampledBright
  };
}
function lyricPaletteFromHex(hex) {
  var c = hexToRgb(hex);
  var hsl = rgbToHsl(c.r, c.g, c.b);
  var tone = lyricHighImpactTextHsl(hsl, { minS: 0.86 });
  var primary = hslToRgb(tone.h, tone.s, tone.l);
  var secondary = hslToRgb((tone.h + 0.055) % 1, tone.neutral ? 0 : clampRange(Math.max(tone.s * 0.92, 0.80), 0, 1), clampRange(tone.l - 0.10, 0.58, 0.86));
  var highlight = hslToRgb((tone.h + 0.018) % 1, tone.neutral ? 0 : clampRange(Math.max(tone.s * 0.82, 0.74), 0, 1), clampRange(tone.l + 0.12, 0.80, 0.96));
  return {
    primary: rgbCss(primary),
    secondary: rgbCss(secondary),
    highlight: rgbCss(highlight),
    shadow: 'rgba(0,6,10,0.48)',
    glow: rgbCss(primary, 0.30),
  };
}
function silverBlueLyricPalette() {
  return {
    primary: '#d8f1ff',
    secondary: '#9db8cf',
    highlight: '#eef7ff',
    shadow: 'rgba(0,7,12,0.48)',
    glow: 'rgba(138,190,255,0.26)',
  };
}
function setLyricSparkOpacity(data, value) {
  if (!data || !data.sparkMat) return;
  value = clampRange(Number(value) || 0, 0, 1);
  if (data.sparkMat.uniforms && data.sparkMat.uniforms.uOpacity) data.sparkMat.uniforms.uOpacity.value = value;
  else data.sparkMat.opacity = value;
}
function getLyricSparkOpacity(data) {
  if (!data || !data.sparkMat) return 0;
  if (data.sparkMat.uniforms && data.sparkMat.uniforms.uOpacity) return Number(data.sparkMat.uniforms.uOpacity.value) || 0;
  return Number(data.sparkMat.opacity) || 0;
}
function setLyricSparkSize(data, value) {
  if (!data || !data.sparkMat) return;
  value = Math.max(0.002, Number(value) || 0.035);
  if (data.sparkMat.uniforms && data.sparkMat.uniforms.uSize) data.sparkMat.uniforms.uSize.value = value;
  else data.sparkMat.size = value;
}
function getLyricSparkSize(data) {
  if (!data || !data.sparkMat) return 0.035;
  if (data.sparkMat.uniforms && data.sparkMat.uniforms.uSize) return Number(data.sparkMat.uniforms.uSize.value) || 0.035;
  return Number(data.sparkMat.size) || 0.035;
}
function lyricMultiLineGlowDetached() {
  var displayMode = typeof normalizeLyricDisplayMode === 'function' ? normalizeLyricDisplayMode(fx && fx.lyricDisplayMode) : String(fx && fx.lyricDisplayMode || 'single');
  var translationMode = typeof normalizeLyricTranslationMode === 'function' ? normalizeLyricTranslationMode(fx && fx.lyricTranslationMode) : String(fx && fx.lyricTranslationMode || 'off');
  return displayMode !== 'single' || translationMode === 'multi' || translationMode === 'dual';
}
function lyricDetachedGlowThreeColor(fallback, minLum) {
  return lyricThreeColor((fx && fx.lyricGlowColor) || (fxDefaults && fxDefaults.lyricGlowColor) || '#008aff', fallback || '#008aff', minLum == null ? 0.36 : minLum);
}
function lyricResolvedGlowColor(pal, fallback) {
  pal = pal || {};
  return pal.glowColor || pal.secondary || pal.highlight || pal.primary || fallback || '#9cffdf';
}
function lyricStageGlowThreeColor(pal, fallback, minLum) {
  pal = pal || {};
  return lyricThreeColor(lyricResolvedGlowColor(pal, fallback || '#9cffdf'), fallback || '#9cffdf', minLum == null ? 0.36 : minLum);
}
function lyricBeatGlowThreeColor(pal, fallback, minLum) {
  pal = pal || {};
  return lyricThreeColor(lyricResolvedGlowColor(pal, fallback || '#fff0b8'), fallback || '#fff0b8', minLum == null ? 0.50 : minLum);
}
function lyricRowGlowThreeColor(pal, isTranslation) {
  pal = pal || {};
  if (fx && fx.lyricGlowLinked === false) return lyricDetachedGlowThreeColor(isTranslation ? '#fff2bf' : '#9cffdf', isTranslation ? 0.34 : 0.40);
  return isTranslation
    ? lyricThreeColor(lyricResolvedGlowColor(pal, '#fff2bf'), '#fff2bf', 0.34)
    : lyricThreeColor(lyricResolvedGlowColor(pal, '#9cffdf'), '#9cffdf', 0.40);
}
function setLyricSparkColor(data, color) {
  if (!data || !data.sparkMat) return;
  if (data.sparkMat.uniforms && data.sparkMat.uniforms.uColor) data.sparkMat.uniforms.uColor.value.copy(color);
  else if (data.sparkMat.color) data.sparkMat.color.copy(color);
}
function setLyricMaterialColor(mat, color) {
  if (!mat || !color) return;
  if (mat.uniforms && mat.uniforms.uColor) mat.uniforms.uColor.value.copy(color);
  else if (mat.color) mat.color.copy(color);
  mat.needsUpdate = true;
}
function applyLyricPaletteToMesh(mesh) {
  if (!mesh || !mesh.userData || !mesh.userData.lyric) return;
  var pal = stageLyrics.palette || {};
  var data = mesh.userData.lyric;
  if (data.textMat && data.textMat.uniforms) {
    var u = data.textMat.uniforms;
    if (u.uBaseColor) u.uBaseColor.value.copy(lyricThreeColor(pal.primary, '#d6f8ff', 0.38));
    if (u.uHiColor) u.uHiColor.value.copy(lyricThreeColor(pal.highlight || pal.primary, '#fff0b8', 0.48));
    if (u.uGlowColor) u.uGlowColor.value.copy(lyricStageGlowThreeColor(pal, '#9cffdf', 0.36));
    if (u.uSolarColor) u.uSolarColor.value.copy(lyricBeatGlowThreeColor(pal, '#fff0b8', 0.50));
    if (u.uSolar && !isFinite(u.uSolar.value)) u.uSolar.value = 0;
    if (u.uOpacity && !isFinite(u.uOpacity.value)) u.uOpacity.value = 0;
    data.textMat.needsUpdate = true;
  }
  if (data.glowMat) data.glowMat.color.copy(lyricStageGlowThreeColor(pal, '#9cffdf', 0.36));
  if (data.contextMat) data.contextMat.color.copy(lyricThreeColor(pal.primary || pal.secondary, '#d6f8ff', 0.34));
  if (data.rowLayers) {
    data.rowLayers.forEach(function (row) {
      if (!row || !row.mat) return;
      if (row.glowMat) setLyricMaterialColor(row.glowMat, lyricRowGlowThreeColor(pal, !!row.isTranslation));
      if (row.mat.uniforms) {
        var ru = row.mat.uniforms;
        if (ru.uBaseColor) ru.uBaseColor.value.copy(lyricThreeColor(pal.primary, '#d6f8ff', 0.38));
        if (ru.uHiColor) ru.uHiColor.value.copy(lyricThreeColor(pal.highlight || pal.primary, '#fff0b8', 0.48));
        if (ru.uGlowColor) ru.uGlowColor.value.copy(lyricStageGlowThreeColor(pal, '#9cffdf', 0.36));
        if (ru.uSolarColor) ru.uSolarColor.value.copy(lyricBeatGlowThreeColor(pal, '#fff0b8', 0.50));
        if (ru.uColor) ru.uColor.value.copy(row.isTranslation
          ? lyricThreeColor(pal.highlight || pal.primary, '#eaf6ff', 0.42)
          : lyricThreeColor(pal.primary || pal.secondary, '#d6f8ff', 0.34));
        row.mat.needsUpdate = true;
        return;
      }
      if (row.mat.color) {
        row.mat.color.copy(row.isTranslation
          ? lyricThreeColor(pal.highlight || pal.primary, '#eaf6ff', 0.42)
          : lyricThreeColor(pal.primary || pal.secondary, '#d6f8ff', 0.34));
      }
    });
  }
  if (data.sparkMat) setLyricSparkColor(data, lyricBeatGlowThreeColor(pal, '#fff0b8', 0.46));
  if (data.sunMat) data.sunMat.color.copy(lyricBeatGlowThreeColor(pal, '#fff0b8', 0.50));
}
function effectiveLyricPalette(pal) {
  var src = pal || stageLyrics.coverPalette || stageLyrics.palette || {};
  var out = {
    primary: src.primary || '#d6f8ff',
    secondary: src.secondary || '#9cffdf',
    highlight: src.highlight || '#eef7ff',
    shadow: src.shadow || 'rgba(2,8,12,0.42)',
    glow: src.glow || 'rgba(143,233,255,0.34)'
  };
  if (fx.lyricHighlightMode === 'custom') {
    var hi = lyricPaletteFromHex(fx.lyricHighlightColor);
    out.highlight = hi.primary;
    if (fx.lyricGlowLinked !== false) {
      out.glowColor = hi.secondary || hi.primary;
      out.glow = hi.glow || out.glow;
    }
  }
  if (fx.lyricGlowLinked === false) {
    var glowPal = lyricPaletteFromHex(fx.lyricGlowColor || '#9db8cf');
    out.glowColor = glowPal.primary;
    out.glow = glowPal.glow || out.glow;
  }
  if (!out.glowColor) out.glowColor = out.secondary;
  return out;
}
var lyricPaletteTween = null;
function lerpStageLyricPaletteColor(fromCss, toCss, t, fallback, minLum) {
  var from = lyricThreeColor(fromCss, fallback, minLum);
  var to = lyricThreeColor(toCss, fallback, minLum);
  from.lerp(to, clampRange(Number(t) || 0, 0, 1));
  return '#' + from.getHexString();
}
function mixStageLyricPalette(from, to, t) {
  from = from || {};
  to = to || {};
  return {
    primary: lerpStageLyricPaletteColor(from.primary, to.primary, t, '#d6f8ff', 0.38),
    secondary: lerpStageLyricPaletteColor(from.secondary, to.secondary, t, '#9cffdf', 0.36),
    highlight: lerpStageLyricPaletteColor(from.highlight, to.highlight, t, '#fff0b8', 0.48),
    shadow: t >= 0.999 ? (to.shadow || from.shadow || 'rgba(2,8,12,0.42)') : (from.shadow || to.shadow || 'rgba(2,8,12,0.42)'),
    glow: t >= 0.999 ? (to.glow || from.glow || 'rgba(143,233,255,0.34)') : (from.glow || to.glow || 'rgba(143,233,255,0.34)'),
    glowColor: lerpStageLyricPaletteColor(from.glowColor || from.secondary, to.glowColor || to.secondary, t, '#9cffdf', 0.36)
  };
}
function applyStageLyricPaletteNow(pal) {
  stageLyrics.palette = pal || effectiveLyricPalette(null);
  lyricSunColor.copy(lyricStageGlowThreeColor(stageLyrics.palette, '#ffe6a4', 0.44));
  lyricSunHotColor.copy(lyricBeatGlowThreeColor(stageLyrics.palette, '#fff4cc', 0.54));
  applyLyricPaletteToMesh(stageLyrics.current);
  stageLyrics.outgoing.forEach(applyLyricPaletteToMesh);
  if (typeof stageLyricPrewarm !== 'undefined' && stageLyricPrewarm && stageLyricPrewarm.mesh) {
    applyLyricPaletteToMesh(stageLyricPrewarm.mesh);
  }
  syncSkullParticleColors();
}
function setStageLyricPalette(pal, opts) {
  var target = effectiveLyricPalette(pal);
  var current = effectiveLyricPalette(stageLyrics.palette || target);
  var duration = opts && opts.durationMs != null ? Number(opts.durationMs) : 520;
  var hidden = (typeof isHiddenForBackgroundOptimization === 'function' && isHiddenForBackgroundOptimization()) || (typeof isDeepBackgroundMode === 'function' && isDeepBackgroundMode());
  var hasVisibleLyrics = !!(stageLyrics && (stageLyrics.current || (stageLyrics.outgoing && stageLyrics.outgoing.length)));
  if (lyricPaletteTween && lyricPaletteTween.raf) cancelAnimationFrame(lyricPaletteTween.raf);
  lyricPaletteTween = null;
  if ((opts && opts.immediate) || hidden || !hasVisibleLyrics || duration <= 1) {
    applyStageLyricPaletteNow(target);
    return;
  }
  var start = performance.now();
  duration = clampRange(duration, 120, 1200);
  function step(now) {
    var raw = clampRange((now - start) / duration, 0, 1);
    var eased = (typeof visualEase === 'function') ? visualEase(raw) : (raw * raw * (3 - 2 * raw));
    applyStageLyricPaletteNow(mixStageLyricPalette(current, target, eased));
    if (raw < 1) {
      lyricPaletteTween = { raf: requestAnimationFrame(step) };
    } else {
      applyStageLyricPaletteNow(target);
      lyricPaletteTween = null;
    }
  }
  lyricPaletteTween = { raf: requestAnimationFrame(step) };
}
function lyricTextPaletteFromHsl(hsl, avgL, chroma, opts) {
  opts = opts || {};
  hsl = hsl || { h: 0.52, s: 0, l: 0.7 };
  var sampleChroma = isFinite(Number(chroma)) ? Number(chroma) : 0;
  var avgChroma = isFinite(Number(opts.avgChroma)) ? Number(opts.avgChroma) : sampleChroma;
  var maxChroma = isFinite(Number(opts.maxChroma)) ? Number(opts.maxChroma) : sampleChroma;
  var colorfulRatio = isFinite(Number(opts.colorfulRatio)) ? Number(opts.colorfulRatio) : (sampleChroma > 0.055 ? 1 : 0);
  if (opts.monochrome === true || avgL < 0.16 || sampleChroma < 0.055 || avgChroma < 0.026 || maxChroma < 0.095 || colorfulRatio < 0.014 || hsl.s < 0.060) {
    return silverBlueLyricPalette();
  }
  var hue = hsl.h;
  if (avgL < 0.30 && (hue < 0.06 || hue > 0.86 || (hue > 0.75 && hue < 0.86))) return silverBlueLyricPalette();
  var tone = lyricHighImpactTextHsl(hsl, { avgL: avgL, minS: 0.90, sampledBright: avgL > 0.66 || hsl.l > 0.62 });
  var c1 = hslToRgb(tone.h, tone.s, tone.l);
  var c2 = hslToRgb((tone.h + 0.08) % 1, clampRange(Math.max(tone.s * 0.90, 0.78), 0, 1), clampRange(tone.l - 0.10, 0.58, 0.86));
  return {
    primary: rgbCss(c1),
    secondary: rgbCss(c2),
    highlight: rgbCss(hslToRgb((tone.h + 0.03) % 1, clampRange(Math.max(tone.s * 0.82, 0.72), 0, 1), clampRange(tone.l + 0.12, 0.80, 0.96))),
    shadow: 'rgba(0,6,10,0.48)',
    glow: rgbCss(c1, 0.30),
  };
}
function lyricCoverSampleCss(sample, fallback) {
  if (!sample || !isFinite(Number(sample.score)) || Number(sample.score) < 0) return fallback || '#d6f8ff';
  return rgbCss({
    r: Math.round(clampRange(Number(sample.r) || 0, 0, 255)),
    g: Math.round(clampRange(Number(sample.g) || 0, 0, 255)),
    b: Math.round(clampRange(Number(sample.b) || 0, 0, 255))
  });
}
function lyricCoverSample(r, g, b, score, lum, chroma, hsl) {
  return {
    score: score,
    r: r,
    g: g,
    b: b,
    lum: lum,
    chroma: chroma,
    hsl: hsl || rgbToHsl(r, g, b)
  };
}
function lyricCoverLooksMonochrome(stats) {
  stats = stats || {};
  var avgChroma = Number(stats.avgChroma) || 0;
  var maxChroma = Number(stats.maxChroma) || 0;
  var colorfulRatio = Number(stats.colorfulRatio) || 0;
  var usableColorfulRatio = Number(stats.usableColorfulRatio) || 0;
  return maxChroma < 0.095 || avgChroma < 0.026 || colorfulRatio < 0.014 || usableColorfulRatio < 0.006;
}
function lyricCoverPushUniqueColor(list, value) {
  value = String(value || '').trim();
  if (!value) return;
  var key = value.replace(/\s+/g, '').toLowerCase();
  for (var i = 0; i < list.length; i++) {
    if (String(list[i] || '').replace(/\s+/g, '').toLowerCase() === key) return;
  }
  list.push(value);
}
function lyricCoverAreaDistance(a, b) {
  if (!a || !b) return 1;
  var dr = ((Number(a.r) || 0) - (Number(b.r) || 0)) / 255;
  var dg = ((Number(a.g) || 0) - (Number(b.g) || 0)) / 255;
  var db = ((Number(a.b) || 0) - (Number(b.b) || 0)) / 255;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
function lyricCoverAddAreaBucket(buckets, r, g, b) {
  var step = 24;
  var key = [
    Math.round(r / step),
    Math.round(g / step),
    Math.round(b / step)
  ].join(':');
  var item = buckets[key];
  if (!item) item = buckets[key] = { r: 0, g: 0, b: 0, count: 0 };
  item.r += r;
  item.g += g;
  item.b += b;
  item.count += 1;
}
function lyricCoverAreaBucketList(buckets) {
  return Object.keys(buckets || {}).map(function (key) {
    var item = buckets[key];
    var count = Math.max(1, Number(item.count) || 1);
    var sample = {
      r: Math.round(item.r / count),
      g: Math.round(item.g / count),
      b: Math.round(item.b / count),
      count: count,
      score: count
    };
    sample.lum = (sample.r * 0.299 + sample.g * 0.587 + sample.b * 0.114) / 255;
    sample.hsl = rgbToHsl(sample.r, sample.g, sample.b);
    sample.chroma = (Math.max(sample.r, sample.g, sample.b) - Math.min(sample.r, sample.g, sample.b)) / 255;
    return sample;
  }).sort(function (a, b) {
    if (b.count !== a.count) return b.count - a.count;
    return b.chroma - a.chroma;
  });
}
function lyricCoverPickAreaColor(list, test, fallback, avoid, minDistance) {
  list = Array.isArray(list) ? list : [];
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    if (test && !test(item)) continue;
    if (avoid && lyricCoverAreaDistance(item, avoid) < (minDistance || 0.06)) continue;
    return item;
  }
  return fallback || list[0] || null;
}
function lyricCoverAreaPaletteFromBuckets(buckets) {
  var list = lyricCoverAreaBucketList(buckets);
  if (!list.length) return null;
  var primary = lyricCoverPickAreaColor(list, function (item) {
    return item.lum > 0.035 && item.lum < 0.965;
  }, list[0]);
  var base = lyricCoverPickAreaColor(list, function (item) {
    return item.lum < Math.min(0.46, (primary && primary.lum || 0.5) + 0.10);
  }, primary);
  var warm = lyricCoverPickAreaColor(list, function (item) {
    return item.chroma > 0.055 && item.hsl.s > 0.08 && (item.hsl.h < 0.18 || item.hsl.h > 0.90);
  }, primary);
  var cool = lyricCoverPickAreaColor(list, function (item) {
    return item.chroma > 0.055 && item.hsl.s > 0.08 && item.hsl.h > 0.42 && item.hsl.h < 0.78;
  }, primary, warm, 0.055);
  var light = lyricCoverPickAreaColor(list, function (item) {
    return item.lum > 0.52;
  }, primary);
  var accent = lyricCoverPickAreaColor(list, function (item) {
    return item.chroma > 0.075 && item.hsl.s > 0.10 && item.lum > 0.10 && item.lum < 0.92;
  }, light || primary, primary, 0.075);
  return {
    primary: primary,
    base: base,
    warm: warm,
    cool: cool,
    light: light,
    accent: accent,
    colors: list.slice(0, 10).map(function (item) { return lyricCoverSampleCss(item, ''); }).filter(Boolean)
  };
}
function lyricCurrentCoverPaletteKey() {
  try {
    var song = null;
    if (Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length) song = playQueue[currentIdx];
    else if (Array.isArray(playlist) && currentIdx >= 0 && currentIdx < playlist.length) song = playlist[currentIdx];
    if (!song) return '';
    if (typeof songCoverSrc === 'function') return String(songCoverSrc(song, 400) || song.cover || song.id || '');
    return String(song.cover || song.customCover || song.id || song.name || '');
  } catch (e) {
    return '';
  }
}
function updateLyricPaletteFromCover(coverCanvas) {
  if (!coverCanvas) return;
  try {
    var ctx = coverCanvas.getContext('2d');
    var img = ctx.getImageData(0, 0, coverCanvas.width, coverCanvas.height).data;
    var w = coverCanvas.width, h = coverCanvas.height;
    var sumR = 0, sumG = 0, sumB = 0, count = 0;
    var sumChroma = 0, maxChroma = 0, colorfulCount = 0, usableColorfulCount = 0;
    var best = { score: -1, r: 143, g: 233, b: 255 };
    var warm = { score: -1, r: 203, g: 108, b: 137 };
    var cool = { score: -1, r: 102, g: 217, b: 255 };
    var light = { score: -1, r: 238, g: 247, b: 255 };
    var dark = { score: -1, r: 18, g: 22, b: 30 };
    var accent = { score: -1, r: 255, g: 154, b: 190 };
    var areaBuckets = {};
    for (var y = 0; y < h; y += 8) {
      for (var x = 0; x < w; x += 8) {
        var di = (y * w + x) * 4;
        var r = img[di], g = img[di + 1], b = img[di + 2], a = img[di + 3] / 255;
        if (a < 0.5) continue;
        var lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        var maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
        var chroma = (maxC - minC) / 255;
        var edgePenalty = Math.abs(lum - 0.5);
        var score = chroma * 1.6 + (0.5 - edgePenalty) * 0.45;
        var hsl = rgbToHsl(r, g, b);
        var warmHue = hsl.h < 0.18 || hsl.h > 0.90 ? 1 : Math.max(0, 1 - Math.min(Math.abs(hsl.h - 0.08), Math.abs(hsl.h - 0.98)) / 0.26);
        var coolHue = hsl.h > 0.42 && hsl.h < 0.78 ? 1 : Math.max(0, 1 - Math.abs(hsl.h - 0.58) / 0.30);
        var satScore = chroma * (0.72 + a * 0.28);
        sumR += r; sumG += g; sumB += b; count++;
        sumChroma += chroma;
        if (chroma > maxChroma) maxChroma = chroma;
        if (chroma > 0.055 && hsl.s > 0.075) colorfulCount++;
        if (chroma > 0.080 && hsl.s > 0.10 && lum > 0.08 && lum < 0.92) usableColorfulCount++;
        lyricCoverAddAreaBucket(areaBuckets, r, g, b);
        if (lum > 0.08 && lum < 0.92 && score > best.score) best = lyricCoverSample(r, g, b, score, lum, chroma, hsl);
        if (lum > 0.10 && lum < 0.92 && chroma > 0.045 && score + warmHue * 0.88 + satScore * 0.45 > warm.score) warm = lyricCoverSample(r, g, b, score + warmHue * 0.88 + satScore * 0.45, lum, chroma, hsl);
        if (lum > 0.10 && lum < 0.92 && chroma > 0.045 && score + coolHue * 0.88 + satScore * 0.45 > cool.score) cool = lyricCoverSample(r, g, b, score + coolHue * 0.88 + satScore * 0.45, lum, chroma, hsl);
        if (lum > 0.46 && score + lum * 0.82 + satScore * 0.28 > light.score) light = lyricCoverSample(r, g, b, score + lum * 0.82 + satScore * 0.28, lum, chroma, hsl);
        if (lum < 0.48 && score + (1 - lum) * 0.68 + satScore * 0.24 > dark.score) dark = lyricCoverSample(r, g, b, score + (1 - lum) * 0.68 + satScore * 0.24, lum, chroma, hsl);
        if (lum > 0.12 && lum < 0.88 && chroma > 0.060 && score + satScore * 0.88 > accent.score) accent = lyricCoverSample(r, g, b, score + satScore * 0.88, lum, chroma, hsl);
      }
    }
    if (!count) return;
    var avgR = Math.round(sumR / count);
    var avgG = Math.round(sumG / count);
    var avgB = Math.round(sumB / count);
    var avgL = (sumR / count * 0.299 + sumG / count * 0.587 + sumB / count * 0.114) / 255;
    var avgChroma = sumChroma / count;
    var colorfulRatio = colorfulCount / count;
    var usableColorfulRatio = usableColorfulCount / count;
    var avgSample = lyricCoverSample(avgR, avgG, avgB, count, avgL, avgChroma, rgbToHsl(avgR, avgG, avgB));
    if (best.score < 0) best = avgSample;
    var monoCover = lyricCoverLooksMonochrome({
      avgChroma: avgChroma,
      maxChroma: maxChroma,
      colorfulRatio: colorfulRatio,
      usableColorfulRatio: usableColorfulRatio
    });
    if (monoCover) {
      warm = avgSample;
      cool = avgSample;
      accent = avgSample;
    }
    var hsl = best.hsl || rgbToHsl(best.r, best.g, best.b);
    var palette = lyricTextPaletteFromHsl(hsl, avgL, Math.max(0, best.chroma || 0), {
      avgChroma: avgChroma,
      maxChroma: maxChroma,
      colorfulRatio: colorfulRatio,
      usableColorfulRatio: usableColorfulRatio,
      monochrome: monoCover
    });
    var areaPalette = lyricCoverAreaPaletteFromBuckets(areaBuckets);
    palette.rawPrimary = lyricCoverSampleCss(best, palette.primary);
    palette.rawWarm = lyricCoverSampleCss(warm, palette.secondary);
    palette.rawCool = lyricCoverSampleCss(cool, palette.primary);
    palette.rawLight = lyricCoverSampleCss(light, palette.highlight);
    palette.rawDark = lyricCoverSampleCss(dark, palette.secondary);
    palette.rawAccent = lyricCoverSampleCss(accent, palette.highlight);
    palette.rawAverage = rgbCss(avgSample);
    palette.coverIsMonochrome = monoCover;
    palette.coverAverageChroma = avgChroma;
    palette.coverMaxChroma = maxChroma;
    palette.coverColorfulRatio = colorfulRatio;
    if (areaPalette) {
      palette.rawAreaPrimary = lyricCoverSampleCss(areaPalette.primary, palette.rawPrimary);
      palette.rawAreaBase = lyricCoverSampleCss(areaPalette.base, palette.rawDark || palette.rawAverage);
      palette.rawAreaWarm = lyricCoverSampleCss(areaPalette.warm, palette.rawWarm || palette.rawPrimary);
      palette.rawAreaCool = lyricCoverSampleCss(areaPalette.cool, palette.rawCool || palette.rawPrimary);
      palette.rawAreaLight = lyricCoverSampleCss(areaPalette.light, palette.rawLight || palette.rawPrimary);
      palette.rawAreaAccent = lyricCoverSampleCss(areaPalette.accent, palette.rawAccent || palette.rawLight);
      palette.sonicWorkshopColors = areaPalette.colors || [];
    }
    palette.coverSourceKey = lyricCurrentCoverPaletteKey();
    palette.sonicWorkshopCoverKey = palette.coverSourceKey;
    palette.coverColors = [];
    [
      palette.rawAreaPrimary,
      palette.rawAreaBase,
      palette.rawAreaWarm,
      palette.rawAreaCool,
      palette.rawAreaLight,
      palette.rawAreaAccent,
      palette.rawPrimary,
      palette.rawWarm,
      palette.rawCool,
      palette.rawLight,
      palette.rawDark,
      palette.rawAccent,
      palette.rawAverage,
      palette.primary,
      palette.secondary,
      palette.highlight
    ].forEach(function (color) { lyricCoverPushUniqueColor(palette.coverColors, color); });
    stageLyrics.coverPalette = palette;
    if (fx.lyricColorMode !== 'custom') setStageLyricPalette(stageLyrics.coverPalette);
    if (typeof updateSonicGroundColorControls === 'function') updateSonicGroundColorControls();
    if (typeof updateSonicWorkshopColorControls === 'function') updateSonicWorkshopColorControls();
    if (window.MineradioSonicWorkshop && typeof MineradioSonicWorkshop.pushProperties === 'function') MineradioSonicWorkshop.pushProperties(true);
  } catch (e) { }
}

function wrapLyricText(ctx, text, maxWidth, maxLines, fontSize) {
  text = String(text || '').trim();
  var useWords = /\s/.test(text) && /[A-Za-z0-9]/.test(text);
  var units = useWords ? text.split(/(\s+)/).filter(Boolean) : text.split('');
  var lines = [], line = '';
  for (var i = 0; i < units.length; i++) {
    var test = line + units[i];
    if (lyricMeasureText(ctx, test, fontSize) > maxWidth && line) {
      lines.push(line.trim());
      line = units[i].trimStart ? units[i].trimStart() : units[i].replace(/^\s+/, '');
      if (lines.length >= maxLines) {
        var rest = units.slice(i).join('').trim();
        if (rest) lines[lines.length - 1] = lines[lines.length - 1].replace(/[.。,…，、\s]*$/, '') + '...';
        return lines;
      }
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line.trim());
  return lines.length ? lines : [''];
}

function cssColorToThreeColor(css, fallback) {
  var c = new THREE.Color(fallback || '#d6f8ff');
  var value = String(css || fallback || '#d6f8ff').trim();
  try {
    if (/^#[0-9a-f]{3}$/i.test(value) || /^#[0-9a-f]{6}$/i.test(value)) {
      c.set(normalizeHexColor(value));
      return c;
    }
    var m = value.match(/^rgba?\(\s*([.\d]+)\s*,\s*([.\d]+)\s*,\s*([.\d]+)/i);
    if (m) {
      c.setRGB(
        Math.max(0, Math.min(255, parseFloat(m[1]))) / 255,
        Math.max(0, Math.min(255, parseFloat(m[2]))) / 255,
        Math.max(0, Math.min(255, parseFloat(m[3]))) / 255
      );
      return c;
    }
    c.setStyle(value);
  } catch (e) {
    try { c.set(normalizeHexColor(fallback || '#d6f8ff')); } catch (e2) { }
  }
  return c;
}
function lyricThreeColor(css, fallback, minLum) {
  var c = cssColorToThreeColor(css, fallback || '#d6f8ff');
  var lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
  var floor = minLum == null ? 0.34 : minLum;
  if (lum < floor) {
    var lift = floor - lum;
    c.r = Math.min(1, c.r + lift);
    c.g = Math.min(1, c.g + lift);
    c.b = Math.min(1, c.b + lift);
  }
  return c;
}
