function applyLyricVerticalEdgeFade(ctx, W, H, strength, activeLine, lineCount) {
  strength = clampRange(Number(strength) || 0, 0, 1);
  if (!strength || lineCount < 2) return;
  var topBand = clampRange(0.08 + strength * 0.16, 0.06, 0.26);
  var bottomBand = clampRange(0.08 + strength * 0.18, 0.06, 0.28);
  var midBoost = activeLine > 0 && activeLine < lineCount - 1 ? 0.018 * strength : 0;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  var fade = ctx.createLinearGradient(0, 0, 0, H);
  fade.addColorStop(0, 'rgba(255,255,255,0)');
  fade.addColorStop(topBand * 0.45, 'rgba(255,255,255,' + (0.34 + strength * 0.20).toFixed(3) + ')');
  fade.addColorStop(topBand + midBoost, 'rgba(255,255,255,1)');
  fade.addColorStop(1 - bottomBand - midBoost, 'rgba(255,255,255,1)');
  fade.addColorStop(1 - bottomBand * 0.45, 'rgba(255,255,255,' + (0.34 + strength * 0.20).toFixed(3) + ')');
  fade.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function configureLyricTextureSampling(texture) {
  if (!texture) return texture;
  var image = texture.image || {};
  var width = Math.max(1, Math.round(Number(image.width) || 1));
  var height = Math.max(1, Math.round(Number(image.height) || 1));
  var isPowerOfTwo = function (value) { return value > 0 && (value & (value - 1)) === 0; };
  var webgl2 = !!(renderer && renderer.capabilities && renderer.capabilities.isWebGL2);
  var mipmapsAllowed = webgl2 || (isPowerOfTwo(width) && isPowerOfTwo(height));
  var maxAnisotropy = renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy
    ? Math.max(1, Number(renderer.capabilities.getMaxAnisotropy()) || 1) : 1;
  var profile = typeof runtimeHardwareProfile !== 'undefined' ? runtimeHardwareProfile : null;
  var anisotropyBudget = profile && profile.lowSpec ? 4 : (profile && profile.balancedSpec ? 8 : 16);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = mipmapsAllowed && THREE.LinearMipmapLinearFilter != null
    ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.generateMipmaps = mipmapsAllowed;
  texture.anisotropy = Math.min(anisotropyBudget, maxAnisotropy);
  texture.needsUpdate = true;
  texture.userData = texture.userData || {};
  texture.userData.__mineradioLyricMipmapped = mipmapsAllowed;
  return texture;
}

function beginLyricMaskLayoutBuild(input, layoutOverride) {
  layoutOverride = layoutOverride || {};
  var payload = normalizeStageLyricPayload(input);
  if (!payload) payload = { entries: [{ text: '', role: 'current', alpha: 1, scale: 1 }], activeLine: 0, text: '', combinedText: '' };
  var baseCanvasW = 2048;
  var rendererMaxTexture = renderer && renderer.capabilities && renderer.capabilities.maxTextureSize ? renderer.capabilities.maxTextureSize : 4096;
  var maxCanvasW = Math.max(baseCanvasW, Math.min(6144, rendererMaxTexture || 4096));
  var entries = payload && payload.entries && payload.entries.length ? payload.entries : [{ text: '', role: 'current', alpha: 1, scale: 1 }];
  var desiredLines = Math.max(1, entries.length);
  var H = desiredLines > 9 ? 1344 : (desiredLines > 8 ? 1216 : (desiredLines > 7 ? 1088 : (desiredLines > 6 ? 960 : (desiredLines > 5 ? 832 : (desiredLines > 4 ? 704 : (desiredLines > 3 ? 608 : (desiredLines > 2 ? 512 : 384)))))));
  var measureCanvas = document.createElement('canvas');
  var ctx = measureCanvas.getContext('2d');
  var maxLines = Math.max(STAGE_LYRIC_MAX_LINES, entries.length);
  var lockedFontSize = Number(layoutOverride.fontSize);
  var lines = entries.map(function (entry) { return entry.text; });
  var activeLine = Math.max(0, Math.min(lines.length - 1, payload.activeLine || 0));
  var fitMeasureIndexes = [];
  for (var fi = 0; fi < entries.length; fi++) {
    var fitAlpha = entries[fi] && entries[fi].alpha == null ? 1 : Number(entries[fi] && entries[fi].alpha);
    if (payload.activeLayer) {
      if (fi === activeLine) fitMeasureIndexes.push(fi);
    } else if (!isFinite(fitAlpha) || fitAlpha > 0.001) {
      fitMeasureIndexes.push(fi);
    }
  }
  if (!fitMeasureIndexes.length) fitMeasureIndexes.push(activeLine);
  return {
    payload: payload,
    layoutOverride: layoutOverride,
    baseCanvasW: baseCanvasW,
    maxCanvasW: maxCanvasW,
    entries: entries,
    lines: lines,
    activeLine: activeLine,
    canvasHeight: H,
    ctx: ctx,
    maxLines: maxLines,
    lockedFontSize: lockedFontSize,
    fitMeasureIndexes: fitMeasureIndexes,
    layoutMeasureBaseSize: 128,
    layoutBaseWidthCache: {},
    measureCursor: 0,
    completedPhases: 0,
    totalPhases: fitMeasureIndexes.length + 1,
    lastPhase: '',
    result: null,
    done: false
  };
}

function lyricMaskLayoutCacheKey(text, weight) {
  return lyricEntryWeight({ weight: weight }) + '|' + String(text || '');
}

function measureLyricMaskLayoutBaseEntry(state, index) {
  var entry = state.entries[index] || {};
  var text = state.lines[index] || '';
  var weight = lyricEntryWeight(entry);
  var cacheKey = lyricMaskLayoutCacheKey(text, weight);
  var baseWidth = state.layoutBaseWidthCache[cacheKey];
  if (!isFinite(baseWidth)) {
    baseWidth = lyricMeasureTextAtSize(state.ctx, text, state.layoutMeasureBaseSize, weight);
    state.layoutBaseWidthCache[cacheKey] = baseWidth;
  }
  return baseWidth;
}

function scaledLyricMaskLayoutWidth(state, index, size) {
  var entry = state.entries[index] || {};
  var cacheKey = lyricMaskLayoutCacheKey(state.lines[index] || '', lyricEntryWeight(entry));
  var baseWidth = state.layoutBaseWidthCache[cacheKey];
  if (!isFinite(baseWidth)) baseWidth = measureLyricMaskLayoutBaseEntry(state, index);
  return baseWidth * (Math.max(0.01, Number(size) || state.layoutMeasureBaseSize) * (entry.scale || 1) / state.layoutMeasureBaseSize);
}

function finishLyricMaskLayoutBuild(state) {
  if (!state || !state.done) return null;
  return state.result;
}

function finalizeLyricMaskLayoutBuild(state) {
  var layoutOverride = state.layoutOverride;
  var payload = state.payload;
  var entries = state.entries;
  var lines = state.lines;
  var activeLine = state.activeLine;
  var fitMeasureIndexes = state.fitMeasureIndexes;
  var baseCanvasW = state.baseCanvasW;
  var maxCanvasW = state.maxCanvasW;
  var H = state.canvasHeight;
  var ctx = state.ctx;
  var maxWidth = baseCanvasW - 88;
  var fontSize = isFinite(state.lockedFontSize) && state.lockedFontSize > 0 ? clampRange(state.lockedFontSize, 42, 160) : 128;
  var widest = 1;
  function measureWidestAtSize(size) {
    var measured = 1;
    for (var li = 0; li < fitMeasureIndexes.length; li++) {
      measured = Math.max(measured, scaledLyricMaskLayoutWidth(state, fitMeasureIndexes[li], size));
    }
    return measured;
  }
  function lyricMaskLayoutFits(size, measuredWidth) {
    var testLineHeight = size * (lines.length > 1 ? 0.98 : 1.0) * lyricLineHeightFactor();
    var testBlockH = size + (lines.length - 1) * testLineHeight;
    return measuredWidth <= maxWidth && testBlockH <= H - 76;
  }
  if (!isFinite(state.lockedFontSize) || state.lockedFontSize <= 0) {
    var minFont = state.maxLines > 2 ? 46 : 42;
    var fitBaseSize = 128;
    var minimumStepFont = fitBaseSize;
    while (minimumStepFont > minFont) minimumStepFont -= 4;
    var baseWidest = measureWidestAtSize(fitBaseSize);
    var baseLineHeight = fitBaseSize * (lines.length > 1 ? 0.98 : 1.0) * lyricLineHeightFactor();
    var baseBlockH = fitBaseSize + (lines.length - 1) * baseLineHeight;
    var fitRatio = Math.min(1, maxWidth / Math.max(1, baseWidest), (H - 76) / Math.max(1, baseBlockH));
    var estimatedFont = Math.floor((fitBaseSize * Math.max(0.01, fitRatio)) / 4) * 4;
    fontSize = Math.max(minimumStepFont, Math.min(fitBaseSize, estimatedFont || minimumStepFont));
    widest = measureWidestAtSize(fontSize);
    while (fontSize + 4 <= fitBaseSize) {
      var nextFontSize = fontSize + 4;
      var nextWidest = measureWidestAtSize(nextFontSize);
      if (!lyricMaskLayoutFits(nextFontSize, nextWidest)) break;
      fontSize = nextFontSize;
      widest = nextWidest;
    }
    while (fontSize > minimumStepFont && !lyricMaskLayoutFits(fontSize, widest)) {
      fontSize -= 4;
      widest = measureWidestAtSize(fontSize);
    }
  }
  ctx.font = lyricFontCss(fontSize);
  widest = 1;
  var widestMeasureIndex = fitMeasureIndexes[0];
  for (var mi = 0; mi < fitMeasureIndexes.length; mi++) {
    var measureIndex = fitMeasureIndexes[mi];
    var measuredLineWidth = scaledLyricMaskLayoutWidth(state, measureIndex, fontSize);
    if (measuredLineWidth > widest) {
      widest = measuredLineWidth;
      widestMeasureIndex = measureIndex;
    }
  }
  var widestEntry = entries[widestMeasureIndex] || {};
  widest = Math.max(1, lyricMeasureTextAtSize(ctx, lines[widestMeasureIndex] || '', fontSize * (widestEntry.scale || 1), lyricEntryWeight(widestEntry)));
  var canvasWidthPad = Math.max(220, fontSize * 2.2);
  var neededCanvasW = Math.ceil(Math.min(maxCanvasW, Math.max(baseCanvasW, widest + canvasWidthPad)));
  var W = neededCanvasW;
  var drawMaxWidth = W - 48;
  ctx.font = lyricFontCss(fontSize);
  var width = Math.min(drawMaxWidth, widest);
  var fitScaleX = widest > drawMaxWidth ? Math.max(0.01, drawMaxWidth / widest) : 1;
  if (fitScaleX < 1) width = Math.min(drawMaxWidth, widest * fitScaleX);
  var lockedLineHeight = Number(layoutOverride.lineHeight);
  var lineHeight = isFinite(lockedLineHeight) && lockedLineHeight > 0
    ? lockedLineHeight
    : fontSize * (lines.length > 1 ? 0.98 : 1.0) * lyricLineHeightFactor() * (lines.length > 1 ? lyricContextSpreadValue() : 1);
  var activeEntry = entries[activeLine] || {};
  var activeTextWidth = activeLine === widestMeasureIndex
    ? widest
    : Math.max(1, lyricMeasureTextAtSize(ctx, lines[activeLine] || '', fontSize * (activeEntry.scale || 1), lyricEntryWeight(activeEntry)));
  var activeWidth = Math.min(drawMaxWidth, activeTextWidth * fitScaleX);
  var blockH = fontSize + (lines.length - 1) * lineHeight;
  var activeBaseline = H / 2 + fontSize * 0.36;
  var y0 = activeBaseline - activeLine * lineHeight;
  var blockTop = y0 - fontSize * 0.84;
  var blockBottom = y0 + (lines.length - 1) * lineHeight + fontSize * 0.24;
  var padY = 22;
  if (blockTop < padY) y0 += padY - blockTop;
  if (blockBottom > H - padY) y0 -= blockBottom - (H - padY);
  state.result = {
    payload: payload,
    entries: entries,
    lines: lines,
    activeLine: activeLine,
    canvasWidth: W,
    canvasHeight: H,
    fontSize: fontSize,
    lineHeight: lineHeight,
    fitScaleX: fitScaleX,
    textWidth: width,
    activeTextWidth: activeWidth,
    textHeight: blockH,
    lineY0: y0,
    textMin: (W / 2 - activeWidth / 2) / W,
    textMax: (W / 2 + activeWidth / 2) / W
  };
  state.done = true;
  state.lastPhase = 'finalize';
  state.completedPhases += 1;
  return state.result;
}

function stepLyricMaskLayoutBuild(state, maxEntries) {
  if (!state || state.done) return true;
  var limit = Math.max(1, Number(maxEntries) || 1);
  var measured = 0;
  while (state.measureCursor < state.fitMeasureIndexes.length && measured < limit) {
    measureLyricMaskLayoutBaseEntry(state, state.fitMeasureIndexes[state.measureCursor]);
    state.measureCursor += 1;
    state.completedPhases += 1;
    state.lastPhase = 'entry';
    measured += 1;
  }
  if (measured > 0) return false;
  finalizeLyricMaskLayoutBuild(state);
  return true;
}

function measureLyricMaskLayout(input, layoutOverride) {
  var state = beginLyricMaskLayoutBuild(input, layoutOverride);
  while (!stepLyricMaskLayoutBuild(state, 1024)) { /* synchronous compatibility path */ }
  return finishLyricMaskLayoutBuild(state);
}

function lyricMaskLayoutMetricsFromLayout(layout) {
  var payload = layout.payload;
  return {
    texture: null,
    width: layout.canvasWidth,
    height: layout.canvasHeight,
    textWidth: layout.textWidth,
    activeTextWidth: layout.activeTextWidth,
    textHeight: layout.textHeight,
    fontSize: layout.fontSize,
    lineHeight: layout.lineHeight,
    lineY0: layout.lineY0,
    lineCount: layout.lines.length,
    lines: layout.lines,
    entries: layout.entries,
    activeLine: layout.activeLine,
    contextLayer: payload.contextLayer,
    activeLayer: payload.activeLayer,
    fitScaleX: layout.fitScaleX,
    textMin: layout.textMin,
    textMax: layout.textMax
  };
}

function beginLyricMaskLayoutMetricsBuild(input, layoutOverride) {
  return beginLyricMaskLayoutBuild(input, layoutOverride);
}

function stepLyricMaskLayoutMetricsBuild(state, maxEntries) {
  return stepLyricMaskLayoutBuild(state, maxEntries);
}

function finishLyricMaskLayoutMetricsBuild(state) {
  var layout = finishLyricMaskLayoutBuild(state);
  return layout ? lyricMaskLayoutMetricsFromLayout(layout) : null;
}

function makeLyricMaskLayoutMetrics(input, layoutOverride) {
  var state = beginLyricMaskLayoutMetricsBuild(input, layoutOverride);
  while (!stepLyricMaskLayoutMetricsBuild(state, 1024)) { /* synchronous compatibility path */ }
  return finishLyricMaskLayoutMetricsBuild(state);
}

function lyricStableHash(text) {
  text = String(text == null ? '' : text);
  var hash = 2166136261;
  for (var i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function lyricSeededRandom(seed) {
  var state = (Number(seed) >>> 0) || 0x6d2b79f5;
  return function () {
    state += 0x6d2b79f5;
    var value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function lyricMaskStoneSeed(lines, entries, fontSize) {
  var signature = (lines || []).join('\u241e') + '|' + Math.round(Number(fontSize) || 0) + '|';
  for (var i = 0; i < (entries || []).length; i++) {
    var entry = entries[i] || {};
    signature += (entry.translationLine ? 't' : 'p') + ':' + lyricEntryWeight(entry) + ':' + Math.round((Number(entry.scale) || 1) * 1000) + '|';
  }
  return lyricStableHash(signature);
}

function makeLyricMask(input, layoutOverride) {
  var layout = measureLyricMaskLayout(input, layoutOverride);
  var payload = layout.payload;
  var entries = layout.entries;
  var lines = layout.lines;
  var activeLine = layout.activeLine;
  var W = layout.canvasWidth;
  var H = layout.canvasHeight;
  var fontSize = layout.fontSize;
  var lineHeight = layout.lineHeight;
  var fitScaleX = layout.fitScaleX;
  var width = layout.textWidth;
  var activeWidth = layout.activeTextWidth;
  var blockH = layout.textHeight;
  var y0 = layout.lineY0;
  var canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');
  var x = W / 2;
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  for (var di = 0; di < lines.length; di++) {
    var entry = entries[di] || {};
    var lineFontSize = fontSize * (entry.scale || 1);
    ctx.globalAlpha = entry.alpha == null ? 1 : entry.alpha;
    var lineY = y0 + di * lineHeight + lyricEntryLineOffset(entry) * lineHeight;
    ctx.font = lyricFontCss(lineFontSize, lyricEntryWeight(entry));
    if (fitScaleX < 1) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.scale(fitScaleX, 1);
      lyricFillText(ctx, lines[di], 0, lineY, lineFontSize);
      ctx.restore();
    } else {
      lyricFillText(ctx, lines[di], x, lineY, lineFontSize);
    }
  }
  ctx.globalAlpha = 1;
  ctx.font = lyricFontCss(fontSize);
  var stoneSeed = lyricMaskStoneSeed(lines, entries, fontSize);
  applyStonePrintTexture(ctx, W, H, fontSize, lyricSeededRandom(stoneSeed));
  applyLyricVerticalEdgeFade(ctx, W, H, lyricEdgeFadeValue() * (payload.contextLayer ? 1.15 : 0.74), activeLine, lines.length);
  var tex = new THREE.CanvasTexture(canvas);
  tex.userData = tex.userData || {};
  tex.userData.__mineradioLyricOwned = true;
  configureLyricTextureSampling(tex);
  return { texture: tex, width: W, height: H, textWidth: width, activeTextWidth: activeWidth, textHeight: blockH, fontSize: fontSize, lineHeight: lineHeight, lineY0: y0, lineCount: lines.length, lines: lines, entries: entries, activeLine: activeLine, contextLayer: payload.contextLayer, activeLayer: payload.activeLayer, fitScaleX: fitScaleX, textMin: layout.textMin, textMax: layout.textMax, stoneSeed: stoneSeed };
}

function lyricTextureClarityScale() {
  if (typeof normalizeLyricTextureClarity === 'function') return normalizeLyricTextureClarity(fx && fx.lyricTextureClarity);
  var value = Number(fx && fx.lyricTextureClarity);
  if (!isFinite(value)) return 1;
  if (Math.abs(value - 1.25) < 0.001) return 2;
  if (Math.abs(value - 1.5) < 0.001) return 4;
  return clampRange(Math.round(value), 1, 4);
}

function lyricRowTextureWidthBudget() {
  var canvasWidth = renderer && renderer.domElement ? Number(renderer.domElement.width) : 0;
  if (!isFinite(canvasWidth) || canvasWidth <= 0) {
    var dpr = typeof window !== 'undefined' ? Math.max(1, Number(window.devicePixelRatio) || 1) : 1;
    canvasWidth = (typeof window !== 'undefined' ? Math.max(1, Number(window.innerWidth) || 1280) : 1280) * dpr;
  }
  var budget = Math.ceil(clampRange(canvasWidth, 1024, 3072) / 64) * 64;
  var profile = typeof runtimeHardwareProfile !== 'undefined' ? runtimeHardwareProfile : null;
  if (profile && profile.lowSpec) budget = Math.min(budget, 1024);
  else if (profile && profile.balancedSpec) budget = Math.min(budget, 1536);
  var rendererMaxTexture = renderer && renderer.capabilities ? Number(renderer.capabilities.maxTextureSize) : 0;
  if (isFinite(rendererMaxTexture) && rendererMaxTexture > 0) budget = Math.min(budget, rendererMaxTexture);
  return Math.max(768, Math.round(budget));
}

function lyricQualityPoolBudgetBytes(tier) {
  tier = clampRange(Math.round(Number(tier) || 1), 1, 4);
  if (tier <= 1) return 0;
  var profile = typeof runtimeHardwareProfile !== 'undefined' ? runtimeHardwareProfile : null;
  var mib = tier === 2 ? 64 : (tier === 3 ? 128 : 192);
  if (profile && profile.lowSpec) mib = tier === 2 ? 32 : (tier === 3 ? 64 : 96);
  else if (profile && profile.balancedSpec) mib = tier === 2 ? 48 : (tier === 3 ? 96 : 144);
  return mib * 1024 * 1024;
}

function lyricQualityMaxResidentRows() {
  var profile = typeof runtimeHardwareProfile !== 'undefined' ? runtimeHardwareProfile : null;
  return profile && profile.lowSpec ? 4 : (profile && profile.balancedSpec ? 6 : 8);
}

function lyricQualityTargetMetrics(mask, tier) {
  if (!mask) return null;
  tier = clampRange(Math.round(Number(tier) || 1), 1, 4);
  if (tier <= 1) return null;
  var logicalW = Math.max(1, Number(mask.logicalWidth) || Number(mask.width) || 1);
  var logicalH = Math.max(1, Number(mask.logicalHeight) || Number(mask.height) || 1);
  var baseW = Math.max(1, Number(mask.width) || logicalW);
  var baseScale = baseW / logicalW;
  var scale = baseScale * tier;
  var rendererMax = renderer && renderer.capabilities ? Number(renderer.capabilities.maxTextureSize) : 0;
  var maxDimension = Math.min(6144, isFinite(rendererMax) && rendererMax > 0 ? rendererMax : 4096);
  scale = Math.min(scale, maxDimension / logicalW, maxDimension / logicalH);
  var width = Math.max(1, Math.floor(logicalW * scale));
  var height = Math.max(1, Math.floor(logicalH * scale));
  var poolBudget = lyricQualityPoolBudgetBytes(tier);
  var itemBudget = Math.min(64 * 1024 * 1024, poolBudget * 0.55);
  var bytes = Math.ceil(width * height * 8.8);
  if (itemBudget > 0 && bytes > itemBudget) {
    scale *= Math.sqrt(itemBudget / bytes);
    width = Math.max(1, Math.floor(logicalW * scale));
    height = Math.max(1, Math.floor(logicalH * scale));
    bytes = Math.ceil(width * height * 8.8);
  }
  if (width <= baseW + 8 || height <= Math.max(1, Number(mask.height) || logicalH) + 4) return null;
  return { tier: tier, scale: scale, width: width, height: height, bytes: bytes, logicalWidth: logicalW, logicalHeight: logicalH };
}

function makeLyricQualityTexture(mask, tier) {
  var target = lyricQualityTargetMetrics(mask, tier);
  if (!target) return null;
  var lines = Array.isArray(mask.lines) && mask.lines.length ? mask.lines : [''];
  var entries = Array.isArray(mask.entries) ? mask.entries : [];
  var logicalW = target.logicalWidth;
  var logicalH = target.logicalHeight;
  var fontSize = Math.max(1, Number(mask.logicalFontSize) || (Number(mask.fontSize) || 128) / Math.max(0.01, Number(mask.rasterScale) || 1));
  var lineHeight = Math.max(1, Number(mask.logicalLineHeight) || (Number(mask.lineHeight) || fontSize) / Math.max(0.01, Number(mask.rasterScale) || 1));
  var lineY0 = isFinite(Number(mask.logicalLineY0)) ? Number(mask.logicalLineY0) : (Number(mask.lineY0) || logicalH / 2 + fontSize * 0.36) / Math.max(0.01, Number(mask.rasterScale) || 1);
  var fitScaleX = Number(mask.fitScaleX) || 1;
  var activeLine = Math.max(0, Math.min(lines.length - 1, Number(mask.activeLine) || 0));
  var canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(target.scale, 0, 0, target.scale, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  for (var i = 0; i < lines.length; i++) {
    var entry = entries[i] || {};
    var lineFontSize = fontSize * (entry.scale || 1);
    var lineY = lineY0 + i * lineHeight + lyricEntryLineOffset(entry) * lineHeight;
    ctx.globalAlpha = entry.alpha == null ? 1 : entry.alpha;
    ctx.font = lyricFontCss(lineFontSize, lyricEntryWeight(entry));
    if (fitScaleX < 1) {
      ctx.save();
      ctx.translate(logicalW / 2, 0);
      ctx.scale(fitScaleX, 1);
      lyricFillText(ctx, lines[i], 0, lineY, lineFontSize);
      ctx.restore();
    } else {
      lyricFillText(ctx, lines[i], logicalW / 2, lineY, lineFontSize);
    }
  }
  ctx.globalAlpha = 1;
  var stoneSeed = Number(mask.stoneSeed) || lyricMaskStoneSeed(lines, entries, fontSize);
  applyStonePrintTexture(ctx, logicalW, logicalH, fontSize, lyricSeededRandom(stoneSeed));
  applyLyricVerticalEdgeFade(ctx, logicalW, logicalH, lyricEdgeFadeValue() * (mask.contextLayer ? 1.15 : 0.74), activeLine, lines.length);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  var texture = new THREE.CanvasTexture(canvas);
  texture.userData = texture.userData || {};
  texture.userData.__mineradioLyricOwned = true;
  texture.userData.__mineradioLyricQuality = true;
  texture.userData.__mineradioLyricQualityBytes = target.bytes;
  configureLyricTextureSampling(texture);
  return { texture: texture, tier: target.tier, width: target.width, height: target.height, bytes: target.bytes, key: target.tier + 'x|' + target.width + 'x' + target.height + '|' + stoneSeed };
}

function lyricGlowTextureWidthBudget() {
  var canvasWidth = renderer && renderer.domElement ? Number(renderer.domElement.width) : 0;
  if (!isFinite(canvasWidth) || canvasWidth <= 0) {
    var dpr = typeof window !== 'undefined' ? Math.max(1, Number(window.devicePixelRatio) || 1) : 1;
    canvasWidth = (typeof window !== 'undefined' ? Math.max(1, Number(window.innerWidth) || 1280) : 1280) * dpr;
  }
  var profile = typeof runtimeHardwareProfile !== 'undefined' ? runtimeHardwareProfile : null;
  var qualityScale = profile && profile.lowSpec ? 1.00 : (profile && profile.balancedSpec ? 1.12 : 1.25);
  var minimum = profile && profile.lowSpec ? 1536 : (profile && profile.balancedSpec ? 1792 : 2048);
  var maximum = profile && profile.lowSpec ? 2048 : (profile && profile.balancedSpec ? 2560 : 3072);
  var budget = Math.ceil(clampRange(canvasWidth * qualityScale, minimum, maximum) / 64) * 64;
  var rendererMaxTexture = renderer && renderer.capabilities ? Number(renderer.capabilities.maxTextureSize) : 0;
  if (isFinite(rendererMaxTexture) && rendererMaxTexture > 0) budget = Math.min(budget, rendererMaxTexture);
  return Math.max(1024, Math.round(budget));
}

function lyricGlowRasterMetrics(mask) {
  mask = mask || {};
  var sourceScale = clampRange(Number(mask.rasterScale) || 1, 0.01, 1);
  var logicalFontSize = Math.max(1, Number(mask.logicalFontSize) || (Number(mask.fontSize) || 128) / sourceScale);
  var logicalTextWidth = Math.max(1, Number(mask.logicalActiveTextWidth) || Number(mask.logicalTextWidth) || (Number(mask.activeTextWidth) || Number(mask.textWidth) || 1) / sourceScale);
  var logicalLineHeight = Math.max(1, Number(mask.logicalLineHeight) || (Number(mask.lineHeight) || logicalFontSize * lyricLineHeightFactor()) / sourceScale);
  var logicalPadX = Math.max(160, logicalFontSize * 1.45);
  var logicalGlowWidth = logicalTextWidth + logicalPadX * 2;
  var widthBudget = lyricGlowTextureWidthBudget();
  var profile = typeof runtimeHardwareProfile !== 'undefined' ? runtimeHardwareProfile : null;
  // The main text can safely use the low-memory row budget, but a glow made
  // from a 20-40 px glyph raster exposes every glyph as a scalloped light
  // blob when it is expanded back to the logical long-line plane.  Keep the
  // visible glow near screen resolution without restoring every row to 6K.
  var minimumRasterFont = profile && profile.lowSpec ? 64 : (profile && profile.balancedSpec ? 72 : 80);
  var budgetScale = widthBudget / Math.max(1, logicalGlowWidth);
  var fontScale = minimumRasterFont / logicalFontSize;
  var scale = clampRange(Math.max(sourceScale, budgetScale, fontScale), 0.01, 1);
  return {
    scale: scale,
    fontSize: logicalFontSize * scale,
    textWidth: logicalTextWidth * scale,
    lineHeight: logicalLineHeight * scale,
    widthBudget: widthBudget,
    sourceScale: sourceScale
  };
}

function compactLyricLineMaskTexture(mask) {
  if (!mask || !mask.texture || !mask.texture.image) return mask;
  var sourceCanvas = mask.texture.image;
  var sourceWidth = Math.max(1, Number(sourceCanvas.width) || Number(mask.width) || 1);
  var sourceHeight = Math.max(1, Number(sourceCanvas.height) || Number(mask.height) || 1);
  // Raster compaction is only a GPU-memory optimization.  Preserve the
  // pre-compaction layout metrics so later resident rows never inherit an
  // already-downscaled font, and so wider anti-crop canvases do not make the
  // same 128 px lyric glyphs appear physically smaller in world space.
  if (!isFinite(Number(mask.logicalWidth)) || Number(mask.logicalWidth) <= 0) mask.logicalWidth = sourceWidth;
  if (!isFinite(Number(mask.logicalHeight)) || Number(mask.logicalHeight) <= 0) mask.logicalHeight = sourceHeight;
  if (!isFinite(Number(mask.logicalFontSize)) || Number(mask.logicalFontSize) <= 0) mask.logicalFontSize = Number(mask.fontSize) || 128;
  if (!isFinite(Number(mask.logicalLineHeight)) || Number(mask.logicalLineHeight) <= 0) mask.logicalLineHeight = Number(mask.lineHeight) || Number(mask.logicalFontSize) * 1.08;
  if (!isFinite(Number(mask.logicalLineY0))) mask.logicalLineY0 = Number(mask.lineY0) || 0;
  if (!isFinite(Number(mask.logicalTextWidth)) || Number(mask.logicalTextWidth) <= 0) mask.logicalTextWidth = Number(mask.textWidth) || sourceWidth;
  if (!isFinite(Number(mask.logicalActiveTextWidth)) || Number(mask.logicalActiveTextWidth) <= 0) mask.logicalActiveTextWidth = Number(mask.activeTextWidth) || Number(mask.logicalTextWidth);
  if (!isFinite(Number(mask.logicalTextHeight)) || Number(mask.logicalTextHeight) <= 0) mask.logicalTextHeight = Number(mask.textHeight) || Number(mask.logicalFontSize);
  var widthBudget = lyricRowTextureWidthBudget();
  if (sourceWidth <= widthBudget + 8) return mask;
  var scale = widthBudget / sourceWidth;
  var compactCanvas = document.createElement('canvas');
  compactCanvas.width = Math.max(1, Math.round(sourceWidth * scale));
  compactCanvas.height = Math.max(1, Math.round(sourceHeight * scale));
  var compactCtx = compactCanvas.getContext('2d');
  compactCtx.imageSmoothingEnabled = true;
  compactCtx.imageSmoothingQuality = 'high';
  compactCtx.drawImage(sourceCanvas, 0, 0, compactCanvas.width, compactCanvas.height);
  var compactTexture = new THREE.CanvasTexture(compactCanvas);
  compactTexture.userData = compactTexture.userData || {};
  compactTexture.userData.__mineradioLyricOwned = true;
  configureLyricTextureSampling(compactTexture);
  var originalTexture = mask.texture;
  originalTexture.userData = originalTexture.userData || {};
  originalTexture.userData.__mineradioDisposed = true;
  originalTexture.dispose();
  sourceCanvas.width = 1;
  sourceCanvas.height = 1;
  mask.texture = compactTexture;
  mask.width = compactCanvas.width;
  mask.height = compactCanvas.height;
  mask.textWidth *= scale;
  mask.activeTextWidth *= scale;
  mask.textHeight *= scale;
  mask.fontSize *= scale;
  mask.lineHeight *= scale;
  mask.lineY0 *= scale;
  mask.rasterScale = (Number(mask.rasterScale) || 1) * scale;
  return mask;
}

var LYRIC_READABILITY_BUILD_PHASES = 4;
var LYRIC_GLOW_BUILD_PHASES = 12;

function beginLyricReadabilityTextureBuild(mask) {
  var canvas = document.createElement('canvas');
  var W = mask && mask.width || 2048;
  var H = mask && mask.height || 384;
  var fontSize = mask && mask.fontSize || 128;
  var lines = mask && Array.isArray(mask.lines) && mask.lines.length ? mask.lines : [''];
  var entries = mask && Array.isArray(mask.entries) ? mask.entries : [];
  var lineHeight = mask && mask.lineHeight || fontSize * lyricLineHeightFactor();
  var fitScaleX = mask && mask.fitScaleX || 1;
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.font = lyricFontCss(fontSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.miterLimit = 2;
  var activeLine = Math.max(0, Math.min(lines.length - 1, Number(mask && mask.activeLine) || 0));
  var hasLineY0 = mask && isFinite(Number(mask.lineY0));
  var y0 = hasLineY0 ? Number(mask.lineY0) : (H / 2 + fontSize * 0.36 - activeLine * lineHeight);
  return {
    mask: mask,
    canvas: canvas,
    ctx: ctx,
    W: W,
    H: H,
    fontSize: fontSize,
    lines: lines,
    entries: entries,
    lineHeight: lineHeight,
    fitScaleX: fitScaleX,
    activeLine: activeLine,
    y0: y0,
    pixelScale: clampRange(Number(mask && mask.rasterScale) || 1, 0.20, 1),
    phase: 0,
    lastPhase: '',
    texture: null,
    done: false
  };
}

function drawLyricReadabilityStrokeLines(state, dx, dy) {
  var ctx = state.ctx;
  for (var i = 0; i < state.lines.length; i++) {
    var entry = state.entries[i] || {};
    var lineFontSize = state.fontSize * (entry.scale || 1);
    var y = state.y0 + i * state.lineHeight + lyricEntryLineOffset(entry) * state.lineHeight + (dy || 0);
    var prevAlpha = ctx.globalAlpha;
    var prevLineWidth = ctx.lineWidth;
    var alpha = entry.alpha == null ? 1 : clampRange(Number(entry.alpha), entry.translationLine ? 0.10 : 0.22, 1);
    ctx.font = lyricFontCss(lineFontSize, lyricEntryWeight(entry));
    ctx.globalAlpha = prevAlpha * alpha * (entry.translationLine ? 0.62 : 1);
    if (entry.translationLine) ctx.lineWidth = Math.max(1.8 * state.pixelScale, prevLineWidth * 0.52);
    if (state.fitScaleX < 1) {
      ctx.save();
      ctx.translate(state.W / 2 + (dx || 0), 0);
      ctx.scale(state.fitScaleX, 1);
      lyricStrokeText(ctx, state.lines[i], 0, y, lineFontSize);
      ctx.restore();
    } else {
      lyricStrokeText(ctx, state.lines[i], state.W / 2 + (dx || 0), y, lineFontSize);
    }
    ctx.lineWidth = prevLineWidth;
    ctx.globalAlpha = prevAlpha;
  }
}

function stepLyricReadabilityTextureBuild(state) {
  if (!state || state.done) return true;
  var ctx = state.ctx;
  var fontSize = state.fontSize;
  var pixelScale = state.pixelScale;
  // Black/white readability layer: text-shaped only, no rectangular backing.
  if (state.phase === 0) {
    ctx.save();
    ctx.filter = 'blur(' + Math.max(1, 14 * pixelScale).toFixed(2) + 'px)';
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = Math.max(18 * pixelScale, fontSize * 0.16);
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    drawLyricReadabilityStrokeLines(state, 0, fontSize * 0.018);
    ctx.restore();
    state.phase = 1;
    state.lastPhase = 'shadow-wide';
    return false;
  }
  if (state.phase === 1) {
    ctx.save();
    ctx.filter = 'blur(' + Math.max(0.8, 5 * pixelScale).toFixed(2) + 'px)';
    ctx.globalAlpha = 0.32;
    ctx.lineWidth = Math.max(9 * pixelScale, fontSize * 0.075);
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    drawLyricReadabilityStrokeLines(state, 0, fontSize * 0.012);
    ctx.restore();
    state.phase = 2;
    state.lastPhase = 'shadow-mid';
    return false;
  }
  if (state.phase === 2) {
    ctx.save();
    ctx.filter = 'blur(' + Math.max(0.7, 4 * pixelScale).toFixed(2) + 'px)';
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = Math.max(9 * pixelScale, fontSize * 0.070);
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    drawLyricReadabilityStrokeLines(state, 0, 0);
    ctx.restore();
    state.phase = 3;
    state.lastPhase = 'outline-wide';
    return false;
  }
  ctx.save();
  ctx.filter = 'blur(' + Math.max(0.45, 1.2 * pixelScale).toFixed(2) + 'px)';
  ctx.globalAlpha = 0.26;
  ctx.lineWidth = Math.max(3.2 * pixelScale, fontSize * 0.030);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  drawLyricReadabilityStrokeLines(state, 0, 0);
  ctx.restore();
  applyLyricVerticalEdgeFade(ctx, state.W, state.H, lyricEdgeFadeValue() * (state.mask && state.mask.contextLayer ? 1.08 : 0.62), state.activeLine, state.lines.length);
  var tex = new THREE.CanvasTexture(state.canvas);
  tex.userData = tex.userData || {};
  tex.userData.__mineradioLyricOwned = true;
  configureLyricTextureSampling(tex);
  state.texture = tex;
  state.phase = LYRIC_READABILITY_BUILD_PHASES;
  state.lastPhase = 'outline-fine';
  state.done = true;
  return true;
}

function finishLyricReadabilityTextureBuild(state) {
  if (!state) return null;
  while (!stepLyricReadabilityTextureBuild(state)) { /* synchronous compatibility path */ }
  return state.texture;
}

function makeLyricReadabilityTexture(mask) {
  return finishLyricReadabilityTextureBuild(beginLyricReadabilityTextureBuild(mask));
}

function beginLyricGlowTextureBuild(text, fontSize, textWidth, lines, lineHeight, fitScaleX, entries, activeLine, sourceMask, rasterScale) {
  text = String(text || '').replace(/\s+/g, ' ').trim();
  var drawLines = Array.isArray(lines) && lines.length ? lines : [text];
  entries = Array.isArray(entries) ? entries : [];
  var useMaskFrame = !!(sourceMask && isFinite(Number(sourceMask.width)) && isFinite(Number(sourceMask.height)));
  var canvas = document.createElement('canvas');
  var measureCanvas = document.createElement('canvas');
  var measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = lyricFontCss(fontSize);
  fitScaleX = fitScaleX || 1;
  var measuredWidth = Math.max(1, textWidth || lyricMeasureTextAtSize(measureCtx, text, fontSize) * fitScaleX);
  for (var li = 0; li < drawLines.length; li++) {
    var lineFontSize = fontSize * ((entries[li] && entries[li].scale) || 1);
    measuredWidth = Math.max(measuredWidth, lyricMeasureTextAtSize(measureCtx, drawLines[li], lineFontSize, lyricEntryWeight(entries[li])) * fitScaleX);
  }
  var pixelScale = clampRange(Number(sourceMask && sourceMask.rasterScale) || Number(rasterScale) || 1, 0.20, 1);
  var padX = Math.max(160 * pixelScale, fontSize * 1.45);
  var padY = Math.max(86 * pixelScale, fontSize * 0.78);
  var lh = lineHeight || fontSize * 1.04;
  var blockH = fontSize + (drawLines.length - 1) * lh;
  activeLine = Math.max(0, Math.min(drawLines.length - 1, Number(activeLine) || 0));
  var W = useMaskFrame ? Math.round(sourceMask.width) : Math.ceil(measuredWidth + padX * 2);
  var H = useMaskFrame ? Math.round(sourceMask.height) : Math.ceil(blockH + padY * 2);
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = lyricFontCss(fontSize);
  var y0 = useMaskFrame && isFinite(Number(sourceMask.lineY0)) ? Number(sourceMask.lineY0) : (H / 2 + fontSize * 0.36 - activeLine * lh);
  return {
    text: text,
    fontSize: fontSize,
    drawLines: drawLines,
    entries: entries,
    useMaskFrame: useMaskFrame,
    sourceMask: sourceMask,
    canvas: canvas,
    ctx: ctx,
    W: W,
    H: H,
    measuredWidth: measuredWidth,
    lineHeight: lh,
    fitScaleX: fitScaleX,
    activeLine: activeLine,
    y0: y0,
    pixelScale: pixelScale,
    phase: 0,
    lastPhase: '',
    texture: null,
    done: false
  };
}

function drawLyricGlowText(state, dx, dy) {
  var ctx = state.ctx;
  for (var i = 0; i < state.drawLines.length; i++) {
    var entry = state.entries[i] || {};
    var lineFontSize = state.fontSize * (entry.scale || 1);
    var alpha = entry.alpha == null ? 1 : clampRange(Number(entry.alpha), entry.translationLine ? 0.08 : 0.22, 1);
    var y = state.y0 + i * state.lineHeight + lyricEntryLineOffset(entry) * state.lineHeight + (dy || 0);
    var prevAlpha = ctx.globalAlpha;
    var prevLineWidth = ctx.lineWidth;
    var glowFactor = entry.translationLine ? 0.34 : 1;
    ctx.font = lyricFontCss(lineFontSize, lyricEntryWeight(entry));
    ctx.globalAlpha = prevAlpha * alpha * glowFactor;
    if (entry.translationLine) ctx.lineWidth = Math.max(1.8 * state.pixelScale, prevLineWidth * 0.48);
    if (state.fitScaleX < 1) {
      ctx.save();
      ctx.translate(state.W / 2 + (dx || 0), 0);
      ctx.scale(state.fitScaleX, 1);
      if (ctx.lineWidth > 0) lyricStrokeText(ctx, state.drawLines[i], 0, y, lineFontSize);
      lyricFillText(ctx, state.drawLines[i], 0, y, lineFontSize);
      ctx.restore();
    } else {
      if (ctx.lineWidth > 0) lyricStrokeText(ctx, state.drawLines[i], state.W / 2 + (dx || 0), y, lineFontSize);
      lyricFillText(ctx, state.drawLines[i], state.W / 2 + (dx || 0), y, lineFontSize);
    }
    ctx.lineWidth = prevLineWidth;
    ctx.globalAlpha = prevAlpha;
  }
}

function drawLyricGlowBlurPass(state, filter, alpha, lineWidth) {
  var ctx = state.ctx;
  ctx.save();
  ctx.filter = filter;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff';
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = '#fff';
  drawLyricGlowText(state, 0, 0);
  ctx.restore();
}

function drawLyricGlowRadialPass(state, start, end) {
  var ctx = state.ctx;
  var pixelScale = state.pixelScale;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = 'blur(' + Math.max(0.8, 8 * pixelScale).toFixed(2) + 'px)';
  ctx.globalAlpha = 0.26;
  ctx.fillStyle = '#fff';
  for (var ri = start; ri < end; ri++) {
    var ang = ri / 8 * Math.PI * 2;
    drawLyricGlowText(state, Math.cos(ang) * 7 * pixelScale, Math.sin(ang) * 4 * pixelScale);
  }
  ctx.restore();
}

function finishLyricGlowTexturePixels(state) {
  var ctx = state.ctx;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  var xMask = ctx.createLinearGradient(0, 0, state.W, 0);
  xMask.addColorStop(0.00, 'rgba(255,255,255,0)');
  xMask.addColorStop(0.10, 'rgba(255,255,255,1)');
  xMask.addColorStop(0.90, 'rgba(255,255,255,1)');
  xMask.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = xMask;
  ctx.fillRect(0, 0, state.W, state.H);
  var yMask = ctx.createLinearGradient(0, 0, 0, state.H);
  yMask.addColorStop(0.00, 'rgba(255,255,255,0)');
  yMask.addColorStop(0.16, 'rgba(255,255,255,1)');
  yMask.addColorStop(0.84, 'rgba(255,255,255,1)');
  yMask.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = yMask;
  ctx.fillRect(0, 0, state.W, state.H);
  ctx.restore();
  var tex = new THREE.CanvasTexture(state.canvas);
  tex.userData = tex.userData || {};
  tex.userData.__mineradioLyricOwned = true;
  configureLyricTextureSampling(tex);
  Object.assign(tex.userData, {
    width: state.W,
    height: state.H,
    textWidth: state.useMaskFrame ? (state.sourceMask.activeTextWidth || state.sourceMask.textWidth || state.measuredWidth) : state.measuredWidth,
    matchMask: state.useMaskFrame,
    lineY0: state.y0,
    rasterScale: state.pixelScale,
    fontSize: state.fontSize
  });
  state.texture = tex;
  state.done = true;
}

function stepLyricGlowTextureBuild(state) {
  if (!state || state.done) return true;
  var fontSize = state.fontSize;
  var pixelScale = state.pixelScale;
  if (state.phase === 0) {
    drawLyricGlowBlurPass(state, 'blur(' + Math.max(1, 14 * pixelScale).toFixed(2) + 'px)', 0.46, Math.max(10 * pixelScale, fontSize * 0.10));
    state.lastPhase = 'blur-14';
  } else if (state.phase === 1) {
    drawLyricGlowBlurPass(state, 'blur(' + Math.max(1.5, 34 * pixelScale).toFixed(2) + 'px)', 0.34, Math.max(18 * pixelScale, fontSize * 0.18));
    state.lastPhase = 'blur-34';
  } else if (state.phase === 2) {
    drawLyricGlowBlurPass(state, 'blur(' + Math.max(2, 78 * pixelScale).toFixed(2) + 'px)', 0.22, Math.max(28 * pixelScale, fontSize * 0.26));
    state.lastPhase = 'blur-78';
  } else if (state.phase === 3) {
    drawLyricGlowBlurPass(state, 'blur(' + Math.max(3, 116 * pixelScale).toFixed(2) + 'px)', 0.13, Math.max(42 * pixelScale, fontSize * 0.40));
    state.lastPhase = 'blur-116';
  } else {
    var radialIndex = Math.max(0, Math.min(7, state.phase - 4));
    drawLyricGlowRadialPass(state, radialIndex, radialIndex + 1);
    state.lastPhase = 'radial-' + (radialIndex + 1);
    if (state.phase === LYRIC_GLOW_BUILD_PHASES - 1) finishLyricGlowTexturePixels(state);
  }
  state.phase += 1;
  if (state.phase >= LYRIC_GLOW_BUILD_PHASES) state.done = true;
  return state.done;
}

function finishLyricGlowTextureBuild(state) {
  if (!state) return null;
  while (!stepLyricGlowTextureBuild(state)) { /* synchronous compatibility path */ }
  return state.texture;
}

function makeLyricGlowTexture(text, fontSize, textWidth, lines, lineHeight, fitScaleX, entries, activeLine, sourceMask, rasterScale) {
  return finishLyricGlowTextureBuild(beginLyricGlowTextureBuild(text, fontSize, textWidth, lines, lineHeight, fitScaleX, entries, activeLine, sourceMask, rasterScale));
}
