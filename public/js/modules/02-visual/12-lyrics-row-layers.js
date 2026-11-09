function lyricLineCenterWorldY(mask, entry, lineIndex, worldH) {
  mask = mask || {};
  entry = entry || {};
  var h = Math.max(1, Number(mask.height) || 384);
  var fontSize = Number(mask.fontSize) || 128;
  var lineHeight = Number(mask.lineHeight) || fontSize;
  var lineFontSize = fontSize * (entry.scale || 1);
  var y0 = isFinite(Number(mask.lineY0)) ? Number(mask.lineY0) : (h / 2 + fontSize * 0.36);
  var baseline = y0 + lineIndex * lineHeight + lyricEntryLineOffset(entry) * lineHeight;
  var centerY = baseline - lineFontSize * 0.36;
  return (0.5 - clampRange(centerY / h, 0, 1)) * worldH;
}

function lyricRowVirtualIndex(entry, fallbackIndex) {
  entry = entry || {};
  if (entry.translationLine && entry.parentIndex != null && isFinite(Number(entry.parentIndex))) return lyricTranslationVirtualIndex(entry.parentIndex);
  if (entry.lineIndex != null && isFinite(Number(entry.lineIndex))) return lyricPrimaryVirtualIndex(entry.lineIndex);
  if (entry.virtualIndex != null && isFinite(Number(entry.virtualIndex))) return Number(entry.virtualIndex);
  return Number(fallbackIndex) || 0;
}

function lyricLayerVirtualIndex(entry, fallbackIndex, activeLine, usesTrack) {
  entry = entry || {};
  if (!usesTrack) {
    var localActive = activeLine != null && isFinite(Number(activeLine)) ? Number(activeLine) : 0;
    if (entry.translationLine && entry.parentRole === 'current') return localActive + lyricTranslationVisualGapValue();
    return Number(fallbackIndex) || 0;
  }
  return lyricRowVirtualIndex(entry, fallbackIndex);
}

function lyricTrackLineStepWorld(mask, worldH) {
  mask = mask || {};
  var h = Math.max(1, Number(mask.height) || 384);
  var lineHeight = Number(mask.lineHeight) || Number(mask.fontSize) || 128;
  var step = worldH * (lineHeight / h);
  step *= clampRange(1 + (lyricContextSpreadValue() - 1) * 0.32, 0.86, 1.45);
  if (lyricTranslationLayoutActive()) step *= 1.06;
  return clampRange(step, 0.22, 0.94);
}

function lyricTranslationLineStepWorld(mask, worldH) {
  mask = mask || {};
  var h = Math.max(1, Number(mask.height) || 384);
  var lineHeight = Number(mask.lineHeight) || Number(mask.fontSize) || 128;
  var step = worldH * (lineHeight / h);
  if (lyricTranslationLayoutActive()) step *= 1.04;
  return clampRange(step, 0.20, 0.78);
}

function lyricTranslationAnchoredY(entry, fallbackIndex, activeLine, lineStepWorld, translationLineStepWorld, scrollOffset, rowDrift, currentTranslation, usesTrack) {
  entry = entry || {};
  if (!usesTrack) {
    var rowVirtualLocal = entry.virtualIndex != null && isFinite(Number(entry.virtualIndex))
      ? Number(entry.virtualIndex)
      : lyricLayerVirtualIndex(entry, fallbackIndex, activeLine, false);
    var localOffset = scrollOffset == null || !isFinite(Number(scrollOffset)) ? activeLine : Number(scrollOffset);
    var localDelta = rowVirtualLocal - localOffset;
    var localSign = localDelta >= 0 ? 1 : -1;
    var parentDeltaLocal = localDelta - localSign * lyricTranslationVisualGapValue();
    var parentAbsLocal = Math.abs(parentDeltaLocal);
    var parentDriftLocal = currentTranslation ? 0 : ((Number(rowDrift) || 0) * clampRange(0.70 + parentAbsLocal * 0.10, 0.65, 1.20));
    return -parentDeltaLocal * lineStepWorld + parentDriftLocal - localSign * lyricTranslationVisualGapValue() * translationLineStepWorld;
  }
  var parentIndex = entry.parentIndex != null && isFinite(Number(entry.parentIndex))
    ? Number(entry.parentIndex)
    : (entry.lineIndex != null && isFinite(Number(entry.lineIndex)) ? Number(entry.lineIndex) : null);
  var parentVirtual = parentIndex != null ? lyricPrimaryVirtualIndex(parentIndex) : activeLine;
  var rowVirtual = entry.virtualIndex != null && isFinite(Number(entry.virtualIndex))
    ? Number(entry.virtualIndex)
    : lyricLayerVirtualIndex(entry, fallbackIndex, activeLine, true);
  var baseOffset = scrollOffset == null || !isFinite(Number(scrollOffset)) ? activeLine : Number(scrollOffset);
  var parentDelta = parentVirtual - baseOffset;
  var parentAbs = Math.abs(parentDelta);
  var parentDrift = currentTranslation ? 0 : ((Number(rowDrift) || 0) * clampRange(0.70 + parentAbs * 0.10, 0.65, 1.20));
  var sign = rowVirtual >= parentVirtual ? 1 : -1;
  return -parentDelta * lineStepWorld + parentDrift - sign * lyricTranslationVisualGapValue() * translationLineStepWorld;
}

function lyricLineAllowedForDisplayMode(lineIndex, targetLineIndex, mode) {
  if (lineIndex == null || !isFinite(Number(lineIndex))) return true;
  var delta = Math.round(Number(lineIndex) - Number(targetLineIndex || 0));
  var offsets = lyricDisplayOffsetsForMode(mode);
  for (var i = 0; i < offsets.length; i++) {
    if (Math.round(Number(offsets[i]) || 0) === delta) return true;
  }
  return false;
}

function lyricNearestPrimaryLineIndexForVirtual(virtualIndex, fallbackLineIndex) {
  var count = typeof lyricsLines !== 'undefined' && lyricsLines ? lyricsLines.length : 0;
  if (!count || !isFinite(Number(virtualIndex))) return Math.max(0, Math.round(Number(fallbackLineIndex) || 0));
  var value = Number(virtualIndex);
  var low = 0;
  var high = count - 1;
  while (low < high) {
    var middle = Math.floor((low + high) / 2);
    if (lyricPrimaryVirtualIndex(middle) < value) low = middle + 1;
    else high = middle;
  }
  var upper = low;
  var lower = Math.max(0, upper - 1);
  return Math.abs(lyricPrimaryVirtualIndex(lower) - value) <= Math.abs(lyricPrimaryVirtualIndex(upper) - value)
    ? lower
    : upper;
}

function lyricRowVisualDelta(entry, index, activeLine) {
  entry = entry || {};
  var raw = index - activeLine;
  if (entry.virtualIndex != null || entry.lineIndex != null || entry.parentIndex != null) {
    var trackIndex = activeLine != null && isFinite(Number(activeLine)) ? Number(activeLine) : 0;
    raw = lyricRowVirtualIndex(entry, index) - trackIndex;
  }
  if (entry.translationLine && entry.parentRole === 'current' && !(entry.virtualIndex != null || entry.lineIndex != null || entry.parentIndex != null)) {
    var gap = lyricTranslationGapValue();
    return raw >= 0 ? gap : -gap;
  }
  return raw;
}

function lyricRowDepthZ(entry, index, activeLine) {
  var delta = lyricRowVisualDelta(entry, index, activeLine);
  var abs = Math.min(5.5, Math.abs(delta));
  return 0.055 - Math.pow(abs, 1.06) * 0.145;
}

function lyricRowDepthScale(entry, index, activeLine) {
  var abs = Math.min(5.5, Math.abs(lyricRowVisualDelta(entry, index, activeLine)));
  return clampRange(1 - abs * 0.026, 0.84, 1.02);
}

function makeLyricBackfaceReadableMaterial(opts) {
  opts = opts || {};
  var color = opts.color && opts.color.isColor ? opts.color.clone() : new THREE.Color(opts.color == null ? 0xffffff : opts.color);
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: opts.map || null },
      uColor: { value: color },
      uOpacity: { value: opts.opacity == null ? 0 : clampRange(Number(opts.opacity) || 0, 0, 1) }
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'precision highp float;',
      'uniform sampler2D uMap;',
      'uniform vec3 uColor;',
      'uniform float uOpacity;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec2 uv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);',
      '  vec4 tex = texture2D(uMap, uv);',
      '  gl_FragColor = vec4(uColor, tex.a * uOpacity);',
      '}'
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: opts.blending || THREE.NormalBlending
  });
}
function setLyricTextureMaterialOpacity(mat, value) {
  value = clampRange(Number(value) || 0, 0, 1);
  if (mat && mat.uniforms && mat.uniforms.uOpacity) mat.uniforms.uOpacity.value = value;
  else if (mat) mat.opacity = value;
}
function getLyricTextureMaterialOpacity(mat) {
  if (mat && mat.uniforms && mat.uniforms.uOpacity) return Number(mat.uniforms.uOpacity.value) || 0;
  return mat && isFinite(Number(mat.opacity)) ? Number(mat.opacity) : 0;
}
function setLyricTextureMaterialColor(mat, color) {
  if (!mat || !color) return;
  if (mat.uniforms && mat.uniforms.uColor && mat.uniforms.uColor.value && mat.uniforms.uColor.value.copy) mat.uniforms.uColor.value.copy(color);
  else if (mat.color && mat.color.copy) mat.color.copy(color);
}
var lyricReadabilityLightColor = null;
var lyricReadabilityDarkColor = null;
var lyricReadabilityMixColor = null;
function lyricBackgroundAdaptStrengthValue() {
  var fallback = fxDefaults && isFinite(Number(fxDefaults.lyricBackgroundAdapt)) ? Number(fxDefaults.lyricBackgroundAdapt) : 0;
  var value = fx && fx.lyricBackgroundAdapt != null ? Number(fx.lyricBackgroundAdapt) : fallback;
  return clampRange(value, 0, 1);
}
function lyricBackdropAdaptActive() {
  return (!fx || fx.lyricBackdropAdapt !== false) && lyricBackgroundAdaptStrengthValue() > 0.001;
}
function lyricReadabilityColorForBrightBackdrop(strength) {
  if (typeof THREE === 'undefined') return null;
  if (!lyricReadabilityLightColor) lyricReadabilityLightColor = new THREE.Color(0xffffff);
  if (!lyricReadabilityDarkColor) lyricReadabilityDarkColor = new THREE.Color(0x04070c);
  if (!lyricReadabilityMixColor) lyricReadabilityMixColor = new THREE.Color(0xffffff);
  return lyricReadabilityMixColor.copy(lyricReadabilityLightColor).lerp(lyricReadabilityDarkColor, clampRange(strength * 0.92, 0, 0.92));
}

function makeLyricLineMask(entry, baseMask, asActive) {
  entry = entry || {};
  var primaryLine = !entry.translationLine;
  var drawEntry = cloneStageLyricEntryForLayer(entry, {
    role: asActive ? 'current' : (entry.role || 'context'),
    alpha: 1,
    scale: primaryLine ? 1 : (entry.scale || lyricTranslationScaleValue())
  });
  return compactLyricLineMaskTexture(makeLyricMask({
    mode: 'single',
    key: 'line|' + (drawEntry.role || '') + '|' + Math.round((drawEntry.scale || 1) * 1000) + '|' + drawEntry.text,
    activeLine: 0,
    entries: [drawEntry]
  }, {
    fontSize: baseMask && (baseMask.logicalFontSize || baseMask.fontSize),
    lineHeight: baseMask && (baseMask.logicalLineHeight || baseMask.lineHeight)
  }));
}

function lyricTranslationMeshScale(entry) {
  if (!entry || !entry.translationLine) return 1;
  var scale = isFinite(Number(entry.scale)) ? Number(entry.scale) : lyricTranslationScaleValue();
  var defaultScale = fxDefaults && isFinite(Number(fxDefaults.lyricTranslationScale)) ? Number(fxDefaults.lyricTranslationScale) : 0.78;
  var roleBoost = entry.parentRole === 'current' ? 1.08 : 0.92;
  var defaultEntryScale = clampRange(defaultScale * roleBoost, entry.parentRole === 'current' ? 0.70 : 0.50, entry.parentRole === 'current' ? 1.12 : 0.96);
  return clampRange(scale / Math.max(0.01, defaultEntryScale), 0.72, 1.34);
}

function lyricRowLogicalWorldWidth(mask, baseWorldW) {
  mask = mask || {};
  baseWorldW = Math.max(0.1, Number(baseWorldW) || 6.10);
  var logicalWidth = Math.max(1, Number(mask.logicalWidth) || Number(mask.width) || 2048);
  // 2048 is the visual-size baseline used by the original continuous track.
  // A larger logical canvas prevents clipping; it must widen the plane rather
  // than squeeze the same-size glyphs into the old plane.
  return baseWorldW * clampRange(logicalWidth / 2048, 1, 3);
}

function lyricViewportSafeMarginPx(viewportWidth) {
  return clampRange(Math.max(1, Number(viewportWidth) || 1) * 0.045, 42, 92);
}

function lyricViewportFitRatio(viewportWidth, centerX, projectedUnitTextWidth, intendedScale, marginPx) {
  viewportWidth = Math.max(1, Number(viewportWidth) || 1);
  centerX = Number(centerX);
  projectedUnitTextWidth = Math.max(0, Number(projectedUnitTextWidth) || 0);
  intendedScale = Math.max(0.001, Number(intendedScale) || 1);
  marginPx = clampRange(Number(marginPx) || lyricViewportSafeMarginPx(viewportWidth), 0, viewportWidth * 0.25);
  if (!isFinite(centerX) || projectedUnitTextWidth <= 0.001) return 1;
  var leftSpace = Math.max(0, centerX - marginPx);
  var rightSpace = Math.max(0, viewportWidth - marginPx - centerX);
  // The lyric stays centred on its authored world position, so the shorter
  // side is the real limit. This deliberately does not force every long line
  // to one fixed width: a centred row may use nearly the entire viewport,
  // while an intentionally offset row respects the smaller free side.
  var availableWidth = Math.max(1, Math.min(leftSpace, rightSpace) * 2);
  var intendedWidth = projectedUnitTextWidth * intendedScale;
  if (intendedWidth <= availableWidth) return 1;
  return clampRange(availableWidth / intendedWidth, 0.22, 1);
}

var lyricViewportFitLeft = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
var lyricViewportFitRight = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;

function lyricRowLiveViewportScale(row, intendedScale) {
  if (!row || !row.mesh || !row.lineMask || !lyricViewportFitLeft || !lyricViewportFitRight || typeof camera === 'undefined' || !camera) return 1;
  var documentWidth = typeof document !== 'undefined' && document.documentElement
    ? Number(document.documentElement.clientWidth) || 0
    : 0;
  var viewportWidth = typeof window !== 'undefined'
    ? Math.max(1, Number(window.innerWidth) || documentWidth || 1)
    : Math.max(1, documentWidth || 1);
  if (viewportWidth <= 1) return 1;
  var currentScale = Math.max(0.001, Math.abs(Number(row.mesh.scale && row.mesh.scale.x) || 1));
  var maskWidth = Math.max(1, Number(row.lineMask.width) || 1);
  var textWidth = Math.max(1, Number(row.lineMask.activeTextWidth) || Number(row.lineMask.textWidth) || maskWidth);
  var localTextWidth = Math.max(0.001, Number(row.lineWorldW) || 0.001) * clampRange(textWidth / maskWidth, 0.02, 1);
  try {
    row.mesh.updateWorldMatrix(true, false);
    lyricViewportFitLeft.set(-localTextWidth * 0.5, 0, 0);
    lyricViewportFitRight.set(localTextWidth * 0.5, 0, 0);
    row.mesh.localToWorld(lyricViewportFitLeft);
    row.mesh.localToWorld(lyricViewportFitRight);
    lyricViewportFitLeft.project(camera);
    lyricViewportFitRight.project(camera);
  } catch (error) {
    return 1;
  }
  if (!isFinite(lyricViewportFitLeft.x) || !isFinite(lyricViewportFitRight.x)) return 1;
  var leftPx = (lyricViewportFitLeft.x + 1) * viewportWidth * 0.5;
  var rightPx = (lyricViewportFitRight.x + 1) * viewportWidth * 0.5;
  var centerX = (leftPx + rightPx) * 0.5;
  var currentProjectedWidth = Math.abs(rightPx - leftPx);
  var projectedUnitTextWidth = currentProjectedWidth / currentScale;
  var safeMargin = lyricViewportSafeMarginPx(viewportWidth);
  var ratio = lyricViewportFitRatio(
    viewportWidth,
    centerX,
    projectedUnitTextWidth,
    intendedScale,
    safeMargin
  );
  row.viewportFitScale = ratio;
  row.viewportFitAvailableLeft = Math.max(0, centerX - safeMargin);
  row.viewportFitAvailableRight = Math.max(0, viewportWidth - safeMargin - centerX);
  return ratio;
}

function makeLyricRowGlowMesh(row, pal, worldW, preparedGlowTexture) {
  if (!row || !row.lineMask) return null;
  pal = pal || {};
  worldW = Math.max(0.1, Number(worldW) || 6.10);
  var lineMask = row.lineMask;
  var lineWorldH = Math.max(0.05, Number(row.lineWorldH) || worldW * ((lineMask.height || 1) / Math.max(1, lineMask.width || 1)));
  var lineTextWorldW = worldW * ((lineMask.activeTextWidth || lineMask.textWidth || lineMask.width) / Math.max(1, lineMask.width || 1));
  lineTextWorldW = clampRange(lineTextWorldW, worldW * 0.10, worldW * 1.00);
  var glowRaster = lyricGlowRasterMetrics(lineMask);
  var rowGlowTex = preparedGlowTexture || makeLyricGlowTexture(row.text || '', glowRaster.fontSize, glowRaster.textWidth, lineMask.lines, glowRaster.lineHeight, lineMask.fitScaleX, lineMask.entries, lineMask.activeLine, null, glowRaster.scale);
  var rowGlowMeta = rowGlowTex.userData || {};
  var rowGlowTextPx = Math.max(1, rowGlowMeta.textWidth || lineMask.activeTextWidth || lineMask.textWidth || lineMask.width || 1);
  var rowGlowTextureRatio = Math.max(1, (rowGlowMeta.width || rowGlowTextPx) / rowGlowTextPx);
  var rowGlowPad = lineWorldH * (row.isTranslation ? 0.42 : 0.62);
  var rowGlowWorldW = clampRange(
    Math.max(
      lineTextWorldW + rowGlowPad,
      lineTextWorldW * Math.max(rowGlowTextureRatio, row.isTranslation ? 1.04 : 1.08)
    ),
    lineTextWorldW + rowGlowPad * 0.62,
    worldW * (row.isTranslation ? 1.00 : 1.08)
  );
  // Preserve the texture's real aspect ratio.  A fixed 0.12 floor makes a
  // very wide lyric glow plane much too tall, so maximum strength turns long
  // lines into a thick scalloped band while short lines remain correct.
  var rowGlowAspect = Math.max(0.001, (rowGlowMeta.height || lineMask.height || 1) / Math.max(1, rowGlowMeta.width || lineMask.width || 1));
  var rowGlowWorldH = clampRange(rowGlowWorldW * rowGlowAspect, lineWorldH * (row.isTranslation ? 0.56 : 0.66), lineWorldH * (row.isTranslation ? 1.12 : 1.36));
  var glowMat = makeLyricBackfaceReadableMaterial({
    map: rowGlowTex,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    color: lyricRowGlowThreeColor(pal, !!row.isTranslation)
  });
  var glowGeo = new THREE.PlaneGeometry(rowGlowWorldW, rowGlowWorldH, 1, 1);
  var glow = new THREE.Mesh(glowGeo, glowMat);
  glow.renderOrder = row.isTranslation ? 42.98 : 42.48;
  glow.position.set(row.baseX || 0, row.baseY || 0, (row.baseZ || 0) - 0.030);
  glow.scale.setScalar(row.baseScale || 1);
  return { glow: glow, glowMat: glowMat };
}

function beginLyricRowLayerGroupBuild(payload, mask, worldW, worldH, pal, motionProfile) {
  payload = normalizeStageLyricPayload(payload);
  var root = new THREE.Group();
  root.renderOrder = 43;
  var contextGroup = new THREE.Group();
  var readabilityGroup = new THREE.Group();
  var rows = [];
  var usesTrack = !!(payload && payload.mode !== 'single' && Array.isArray(payload.trackEntries) && payload.trackEntries.length && payload.trackIndex != null && isFinite(Number(payload.trackIndex)));
  var activeLineIndex = usesTrack ? Number(payload.trackIndex) : (payload ? payload.activeLine : 0);
  var activeLine = usesTrack ? lyricPrimaryVirtualIndex(activeLineIndex) : activeLineIndex;
  var entries = usesTrack ? payload.trackEntries : (payload && payload.entries || []);
  var lineStepWorld = lyricTrackLineStepWorld(mask, worldH);
  var translationLineStepWorld = lyricTranslationLineStepWorld(mask, worldH);
  var displayLineCount = lyricDisplayLineCountForMode(payload && payload.mode);
  var visibleRadius = Math.max(0.85, displayLineCount * 0.50 * lyricPrimarySlotStepValue());
  var textOnly = !!(payload && payload.trackTextOnly);
  var activeMesh = null;
  var activeMat = null;
  var activeWorldH = 0.72;
  var activeTargetLineIndex = activeLineIndex;
  var readabilityPhaseCount = typeof LYRIC_READABILITY_BUILD_PHASES === 'number' ? LYRIC_READABILITY_BUILD_PHASES : 3;
  var glowPhaseCount = typeof LYRIC_GLOW_BUILD_PHASES === 'number' ? LYRIC_GLOW_BUILD_PHASES : 6;
  var totalPhases = 0;
  for (var pi = 0; pi < entries.length; pi++) {
    var phaseEntry = entries[pi] || {};
    var phaseHasGlow = !phaseEntry.translationLine || phaseEntry.parentRole === 'current' || usesTrack;
    totalPhases += textOnly ? 1 : (1 + readabilityPhaseCount + (phaseHasGlow ? glowPhaseCount : 1));
  }
  root.add(contextGroup);
  root.add(readabilityGroup);
  return {
    payload: payload,
    mask: mask,
    worldW: worldW,
    worldH: worldH,
    pal: pal,
    motionProfile: motionProfile,
    root: root,
    contextGroup: contextGroup,
    readabilityGroup: readabilityGroup,
    rows: rows,
    usesTrack: usesTrack,
    activeLineIndex: activeLineIndex,
    activeLine: activeLine,
    entries: entries,
    lineStepWorld: lineStepWorld,
    translationLineStepWorld: translationLineStepWorld,
    visibleRadius: visibleRadius,
    textOnly: textOnly,
    activeMesh: activeMesh,
    activeMat: activeMat,
    activeWorldH: activeWorldH,
    activeTargetLineIndex: activeTargetLineIndex,
    cursor: 0,
    totalPhases: totalPhases,
    completedPhases: 0,
    pendingRow: null,
    pendingPhase: 'line',
    lastPhase: '',
    done: entries.length === 0
  };
}

function beginLyricRowLayerBuildEntry(state) {
  if (!state || state.done) return false;
  var i = state.cursor;
  if (i >= state.entries.length) {
    state.done = true;
    return false;
  }
  var entry = state.entries[i] || {};
  var virtualIndex = lyricLayerVirtualIndex(entry, i, state.activeLine, state.usesTrack);
  var delta = virtualIndex - state.activeLine;
  var entryLineIndex = entry.lineIndex != null && isFinite(Number(entry.lineIndex)) ? Number(entry.lineIndex) : null;
  var isActive = !entry.translationLine && (state.usesTrack ? entryLineIndex === state.activeLineIndex : Math.abs(delta) < 0.001);
  var lineMask = makeLyricLineMask(entry, state.mask, isActive);
  var lineWorldW = lyricRowLogicalWorldWidth(lineMask, state.worldW);
  var lineWorldH = lineWorldW * (lineMask.height / lineMask.width);
  var lineY = -delta * state.lineStepWorld;
  if (entry.translationLine) {
    var translationLayoutEntry = !state.usesTrack
      ? cloneStageLyricEntryForLayer(entry, { virtualIndex: virtualIndex })
      : entry;
    lineY = lyricTranslationAnchoredY(translationLayoutEntry, i, state.activeLine, state.lineStepWorld, state.translationLineStepWorld, state.activeLine, 0, Math.abs(delta) < 0.001, state.usesTrack);
  }
  var lineAbs = Math.min(5.5, Math.abs(delta));
  var lineZ = 0.055 - Math.pow(lineAbs, 1.06) * 0.145;
  var lineScale = clampRange(1 - lineAbs * 0.026, 0.84, 1.02);
  var fontScale = lyricTranslationMeshScale(entry);
  if (entry.translationLine) lineScale *= fontScale;
  var lineGeo = new THREE.PlaneGeometry(lineWorldW, lineWorldH, 1, 1);
  var material;
  if (!entry.translationLine) {
    material = makeLyricShaderMaterial(lineMask, state.pal, state.motionProfile);
    material.uniforms.uOpacity.value = 0;
    if (material.uniforms.uActiveMix) material.uniforms.uActiveMix.value = isActive ? 1 : 0;
  } else {
    material = makeLyricBackfaceReadableMaterial({
      map: lineMask.texture,
      opacity: 0,
      color: entry.translationLine
        ? lyricThreeColor(state.pal.highlight || state.pal.primary, '#eaf6ff', 0.42)
        : lyricThreeColor(state.pal.primary || state.pal.secondary, '#d6f8ff', 0.34)
    });
  }
  var mesh = new THREE.Mesh(lineGeo, material);
  mesh.renderOrder = isActive ? 43.4 : (42.6 - lineAbs * 0.015);
  mesh.position.set(0, lineY, lineZ);
  mesh.scale.setScalar(lineScale);
  mesh.visible = false;
  if (isActive) state.root.add(mesh);
  else state.contextGroup.add(mesh);

  var targetAlpha = entry.alpha == null ? 1 : clampRange(Number(entry.alpha), 0, 1);
  if (isActive) targetAlpha = 1;
  state.pendingRow = {
    mesh: mesh,
    mat: material,
    readability: null,
    readabilityMat: null,
    glow: null,
    glowMat: null,
    readabilityBuild: null,
    glowBuild: null,
    lineMask: lineMask,
    baseLineTexture: lineMask.texture,
    qualityTexture: null,
    qualityPendingTexture: null,
    qualityTier: 1,
    qualityPendingTier: 0,
    qualityRasterKey: '',
    qualityPendingKey: '',
    qualityQueuedKey: '',
    qualityBytes: 0,
    qualityPendingBytes: 0,
    qualityGeneration: 0,
    qualityLastUsedAt: 0,
    qualityHotUntil: 0,
    qualityWanted: false,
    qualityFallbackUntil: 0,
    qualitySelectionFrame: 0,
    qualityProjectedPoolBytes: 0,
    qualityProjectedTier: 0,
    lineWorldW: lineWorldW,
    lineWorldH: lineWorldH,
    text: entry.text || '',
    isActive: isActive,
    isPrimary: !entry.translationLine,
    isTranslation: !!entry.translationLine,
    targetAlpha: targetAlpha,
    baseY: lineY,
    baseZ: lineZ,
    baseScale: lineScale,
    viewportFitScale: 1,
    fontScale: fontScale,
    virtualIndex: virtualIndex,
    lineIndex: entryLineIndex,
    parentIndex: entry.parentIndex != null && isFinite(Number(entry.parentIndex)) ? Number(entry.parentIndex) : undefined,
    parentRole: entry.parentRole || '',
    delta: delta,
    renderWindowActive: false,
    renderRevealAt: 0,
    renderLineUploaded: false,
    renderReadabilityUploaded: false,
    renderGlowUploaded: false
  };
  state.pendingPhase = state.textOnly ? 'complete' : 'readability';
  state.lastPhase = 'row-line';
  state.completedPhases += 1;
  if (state.textOnly) {
    state.rows.push(state.pendingRow);
    if (isActive) {
      state.activeMesh = mesh;
      state.activeMat = material;
      state.activeWorldH = lineWorldH;
      if (entryLineIndex != null) state.activeTargetLineIndex = entryLineIndex;
    }
    state.cursor += 1;
    state.pendingRow = null;
    state.pendingPhase = 'line';
    state.done = state.cursor >= state.entries.length;
  }
  return true;
}

function appendLyricRowReadabilityLayer(state) {
  var row = state && state.pendingRow;
  if (!row || state.pendingPhase !== 'readability') return false;
  if (!row.readabilityBuild) row.readabilityBuild = beginLyricReadabilityTextureBuild(row.lineMask);
  var readabilityDone = stepLyricReadabilityTextureBuild(row.readabilityBuild);
  state.lastPhase = 'row-readability-' + (row.readabilityBuild.lastPhase || 'step');
  state.completedPhases += 1;
  if (!readabilityDone) return true;
  var readabilityTex = finishLyricReadabilityTextureBuild(row.readabilityBuild);
  var readabilityMat = makeLyricBackfaceReadableMaterial({
    map: readabilityTex,
    opacity: 0,
    color: 0xffffff
  });
  var readability = new THREE.Mesh(new THREE.PlaneGeometry(row.lineWorldW || state.worldW, row.lineWorldH, 1, 1), readabilityMat);
  readability.renderOrder = row.mesh.renderOrder - 0.05;
  readability.position.set(0, row.baseY, row.baseZ - 0.012);
  readability.scale.setScalar(row.baseScale);
  readability.visible = false;
  state.readabilityGroup.add(readability);
  row.readability = readability;
  row.readabilityMat = readabilityMat;
  row.readabilityBuild = null;
  state.pendingPhase = 'glow';
  return true;
}

function finishLyricRowLayerBuildEntry(state) {
  var row = state && state.pendingRow;
  if (!row || state.pendingPhase !== 'glow') return false;
  var glow = null;
  var glowMat = null;
  var shouldCreateRowGlow = !row.isTranslation || row.parentRole === 'current' || state.usesTrack;
  if (shouldCreateRowGlow) {
    if (!row.glowBuild) {
      var glowRaster = lyricGlowRasterMetrics(row.lineMask);
      row.glowBuild = beginLyricGlowTextureBuild(row.text || '', glowRaster.fontSize, glowRaster.textWidth, row.lineMask.lines, glowRaster.lineHeight, row.lineMask.fitScaleX, row.lineMask.entries, row.lineMask.activeLine, null, glowRaster.scale);
    }
    var glowDone = stepLyricGlowTextureBuild(row.glowBuild);
    state.lastPhase = 'row-glow-' + (row.glowBuild.lastPhase || 'step');
    state.completedPhases += 1;
    if (!glowDone) return true;
    var preparedGlowTexture = finishLyricGlowTextureBuild(row.glowBuild);
    var rowGlow = makeLyricRowGlowMesh({
      text: row.text,
      lineMask: row.lineMask,
      lineWorldH: row.lineWorldH,
      isTranslation: row.isTranslation,
      baseY: row.baseY,
      baseZ: row.baseZ,
      baseScale: row.baseScale
    }, state.pal, row.lineWorldW || state.worldW, preparedGlowTexture);
    if (rowGlow) {
      glow = rowGlow.glow;
      glowMat = rowGlow.glowMat;
      glow.visible = false;
      state.readabilityGroup.add(glow);
    }
    row.glowBuild = null;
  } else {
    state.lastPhase = 'row-glow-skip';
    state.completedPhases += 1;
  }
  row.glow = glow;
  row.glowMat = glowMat;
  state.rows.push(row);
  if (row.isActive) {
    state.activeMesh = row.mesh;
    state.activeMat = row.mat;
    state.activeWorldH = row.lineWorldH;
    if (row.lineIndex != null) state.activeTargetLineIndex = row.lineIndex;
  }
  state.cursor += 1;
  state.pendingRow = null;
  state.pendingPhase = 'line';
  state.done = state.cursor >= state.entries.length;
  return true;
}

function appendLyricRowLayerBuildPhase(state) {
  if (!state || state.done) return false;
  if (!state.pendingRow) return beginLyricRowLayerBuildEntry(state);
  if (state.pendingPhase === 'readability') return appendLyricRowReadabilityLayer(state);
  return finishLyricRowLayerBuildEntry(state);
}

function appendLyricRowLayerBuildEntry(state) {
  if (!state || state.done) return false;
  var startCursor = state.cursor;
  while (!state.done && state.cursor === startCursor) appendLyricRowLayerBuildPhase(state);
  return state.cursor > startCursor;
}

function stepLyricRowLayerGroupBuild(state, maxPhases, budgetMs) {
  if (!state || state.done) return true;
  var limit = Math.max(1, Number(maxPhases) || 1);
  var budget = Number(budgetMs);
  if (!isFinite(budget) || budget <= 0) budget = Infinity;
  var startedAt = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  var completed = 0;
  while (!state.done && completed < limit) {
    appendLyricRowLayerBuildPhase(state);
    completed += 1;
    if (completed > 0 && budget !== Infinity) {
      var now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      if (now - startedAt >= budget) break;
    }
  }
  return !!state.done;
}

function finishLyricRowLayerGroupBuild(state) {
  if (!state) return null;
  return {
    group: state.root,
    contextGroup: state.contextGroup,
    readabilityGroup: state.readabilityGroup,
    rows: state.rows,
    activeMesh: state.activeMesh,
    activeMat: state.activeMat,
    activeWorldH: state.activeWorldH,
    usesTrack: state.usesTrack,
    displayMode: state.payload && state.payload.mode,
    trackKey: state.payload && state.payload.trackKey || '',
    trackStart: state.payload && state.payload.trackStart,
    trackEnd: state.payload && state.payload.trackEnd,
    trackLightweight: !!(state.payload && state.payload.trackLightweight),
    trackTextOnly: !!(state.payload && state.payload.trackTextOnly),
    trackTargetIndex: state.activeLine,
    trackTargetLineIndex: state.activeTargetLineIndex,
    trackTargetVirtualIndex: state.activeLine,
    trackVisibleRadius: state.visibleRadius,
    lineStepWorld: state.lineStepWorld,
    translationLineStepWorld: state.translationLineStepWorld
  };
}

function releaseLyricRowLayerBuildCanvas(build) {
  if (!build) return;
  if (build.texture && build.texture.dispose) build.texture.dispose();
  build.texture = null;
  if (build.canvas) {
    build.canvas.width = 1;
    build.canvas.height = 1;
  }
  build.ctx = null;
  build.canvas = null;
  build.sourceMask = null;
  build.mask = null;
  build.entries = null;
  build.lines = null;
  build.drawLines = null;
}

function cancelLyricRowLayerGroupBuild(state) {
  if (!state) return;
  var pendingRow = state.pendingRow;
  if (pendingRow) {
    releaseLyricRowLayerBuildCanvas(pendingRow.readabilityBuild);
    releaseLyricRowLayerBuildCanvas(pendingRow.glowBuild);
    pendingRow.readabilityBuild = null;
    pendingRow.glowBuild = null;
  }
  if (state.root) disposeLyricMesh(state.root);
  state.pendingRow = null;
  state.entries = null;
  state.rows = null;
  state.root = null;
  state.contextGroup = null;
  state.readabilityGroup = null;
  state.done = true;
}

function makeLyricRowLayerGroup(payload, mask, worldW, worldH, pal, motionProfile) {
  var state = beginLyricRowLayerGroupBuild(payload, mask, worldW, worldH, pal, motionProfile);
  while (!stepLyricRowLayerGroupBuild(state, 1024, Infinity)) { /* synchronous compatibility path */ }
  return finishLyricRowLayerGroupBuild(state);
}

var lyricRenderUploadFrameBudget = { frame: 0, remaining: 1, consumed: 0, maxConsumed: 0 };

var lyricQualityState = {
  queue: [],
  timer: 0,
  idle: 0,
  generation: 1,
  residents: [],
  bytes: 0,
  lastBuildMs: 0,
  frameCandidates: [],
  frameCommits: [],
  selectionFrame: 0,
  deferFinalize: false,
  transitionBudgetUntil: 0,
  transitionBaseBytes: 0
};

function lyricQualityNowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function lyricQualityDisposeTexture(texture) {
  if (!texture) return;
  if (typeof disposeOwnedLyricTexture === 'function') disposeOwnedLyricTexture(texture);
  else if (!texture.userData || !texture.userData.__mineradioDisposed) {
    texture.userData = texture.userData || {};
    texture.userData.__mineradioDisposed = true;
    if (texture.dispose) texture.dispose();
  }
  if (texture.image && texture.image.tagName === 'CANVAS') {
    texture.image.width = 1;
    texture.image.height = 1;
  }
}

function lyricQualityResidentIndex(row) {
  return lyricQualityState.residents.indexOf(row);
}

function lyricQualityRememberRow(row) {
  if (row && lyricQualityResidentIndex(row) < 0) lyricQualityState.residents.push(row);
}

function lyricQualityForgetRow(row) {
  var index = lyricQualityResidentIndex(row);
  if (index >= 0) lyricQualityState.residents.splice(index, 1);
}

function lyricQualityOwnerActive(data, row) {
  return !!(
    data && data.__mineradioLyricQualityDisposed !== true &&
    Array.isArray(data.rowLayers) && (!row || data.rowLayers.indexOf(row) >= 0)
  );
}

function lyricQualityHasPendingTexture() {
  for (var i = 0; i < lyricQualityState.residents.length; i++) {
    if (lyricQualityState.residents[i] && lyricQualityState.residents[i].qualityPendingTexture) return true;
  }
  return false;
}

function lyricQualityCurrentMap(row) {
  return row && row.mat && row.mat.uniforms && row.mat.uniforms.uMap
    ? row.mat.uniforms.uMap.value
    : (row && row.mat ? row.mat.map : null);
}

function setLyricRowTextureMap(row, texture) {
  if (!row || !row.mat || !texture) return false;
  if (row.mat.uniforms && row.mat.uniforms.uMap) row.mat.uniforms.uMap.value = texture;
  else row.mat.map = texture;
  return true;
}

function lyricQualityRecount() {
  var bytes = 0;
  for (var i = lyricQualityState.residents.length - 1; i >= 0; i--) {
    var row = lyricQualityState.residents[i];
    if (!row || (!row.qualityTexture && !row.qualityPendingTexture)) {
      lyricQualityState.residents.splice(i, 1);
      continue;
    }
    bytes += Math.max(0, Number(row.qualityBytes) || 0) + Math.max(0, Number(row.qualityPendingBytes) || 0);
  }
  lyricQualityState.bytes = bytes;
  return bytes;
}

function updateLyricQualityStats(tier) {
  lyricQualityRecount();
  if (typeof window === 'undefined') return;
  var pending = 0;
  var targetWidth = 0;
  for (var i = 0; i < lyricQualityState.residents.length; i++) {
    var row = lyricQualityState.residents[i];
    if (row && row.qualityPendingTexture) pending += 1;
    var texture = row && (row.qualityPendingTexture || row.qualityTexture);
    if (texture && texture.image) targetWidth = Math.max(targetWidth, Number(texture.image.width) || 0);
  }
  window.__mineradioLyricQualityStats = {
    tier: clampRange(Math.round(Number(tier) || lyricTextureClarityScale()), 1, 4),
    bytes: lyricQualityState.bytes,
    budget: lyricQualityPoolBudgetBytes(tier || lyricTextureClarityScale()),
    rows: lyricQualityState.residents.length,
    pending: pending + lyricQualityState.queue.length,
    targetW: targetWidth,
    lastBuildMs: Math.round(lyricQualityState.lastBuildMs * 100) / 100
  };
}

function releaseLyricRowQuality(row, restoreBase) {
  if (!row) return;
  row.qualityGeneration = (Number(row.qualityGeneration) || 0) + 1;
  row.qualityQueuedKey = '';
  row.qualityPendingKey = '';
  if (restoreBase !== false && row.baseLineTexture && lyricQualityCurrentMap(row) !== row.baseLineTexture) {
    setLyricRowTextureMap(row, row.baseLineTexture);
  }
  var qualityTexture = row.qualityTexture;
  var pendingTexture = row.qualityPendingTexture;
  row.qualityTexture = null;
  row.qualityPendingTexture = null;
  row.qualityTier = 1;
  row.qualityPendingTier = 0;
  row.qualityRasterKey = '';
  row.qualityBytes = 0;
  row.qualityPendingBytes = 0;
  row.qualityWanted = false;
  row.qualityFallbackUntil = 0;
  row.qualitySelectionFrame = 0;
  row.qualityProjectedPoolBytes = 0;
  row.qualityProjectedTier = 0;
  lyricQualityForgetRow(row);
  if (qualityTexture && qualityTexture !== row.baseLineTexture) lyricQualityDisposeTexture(qualityTexture);
  if (pendingTexture && pendingTexture !== row.baseLineTexture && pendingTexture !== qualityTexture) lyricQualityDisposeTexture(pendingTexture);
  lyricQualityRecount();
}

function discardLyricRowPendingQuality(row) {
  if (!row) return;
  var pendingTexture = row.qualityPendingTexture;
  row.qualityPendingTexture = null;
  row.qualityPendingTier = 0;
  row.qualityPendingKey = '';
  row.qualityPendingBytes = 0;
  if (pendingTexture && pendingTexture !== row.baseLineTexture && pendingTexture !== row.qualityTexture) lyricQualityDisposeTexture(pendingTexture);
}

function invalidateLyricQualityTextures(reason, options) {
  options = options || {};
  var releaseCommitted = options.release === true || /clear-stage-lyrics|hard-release/i.test(String(reason || ''));
  lyricQualityState.generation += 1;
  if (lyricQualityState.timer) {
    clearTimeout(lyricQualityState.timer);
    lyricQualityState.timer = 0;
  }
  if (lyricQualityState.idle) {
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(lyricQualityState.idle);
    lyricQualityState.idle = 0;
  }
  for (var queuedIndex = 0; queuedIndex < lyricQualityState.queue.length; queuedIndex++) {
    var queuedRow = lyricQualityState.queue[queuedIndex] && lyricQualityState.queue[queuedIndex].row;
    if (!queuedRow) continue;
    queuedRow.qualityGeneration = (Number(queuedRow.qualityGeneration) || 0) + 1;
    queuedRow.qualityQueuedKey = '';
    queuedRow.qualityWanted = false;
  }
  lyricQualityState.queue.length = 0;
  var rows = lyricQualityState.residents.slice();
  var fallbackHotUntil = lyricQualityNowMs() + 3200;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row) continue;
    if (releaseCommitted) {
      releaseLyricRowQuality(row, true);
      continue;
    }
    // Keep the currently displayed quality texture as a visual fallback.
    // The new tier replaces it atomically after its own upload budget turn,
    // so changing quality or starting a track crossfade never flashes 1x.
    row.qualityGeneration = (Number(row.qualityGeneration) || 0) + 1;
    row.qualityQueuedKey = '';
    row.qualityWanted = !!row.qualityTexture;
    row.qualityHotUntil = Math.max(Number(row.qualityHotUntil) || 0, fallbackHotUntil);
    row.qualityFallbackUntil = Math.max(Number(row.qualityFallbackUntil) || 0, fallbackHotUntil);
    discardLyricRowPendingQuality(row);
    if (!row.qualityTexture) lyricQualityForgetRow(row);
  }
  lyricQualityRecount();
  if (releaseCommitted) {
    lyricQualityState.transitionBudgetUntil = 0;
    lyricQualityState.transitionBaseBytes = 0;
  } else {
    lyricQualityState.transitionBudgetUntil = fallbackHotUntil;
    lyricQualityState.transitionBaseBytes = lyricQualityState.bytes;
  }
  updateLyricQualityStats(lyricTextureClarityScale());
}

function lyricQualityInputPending() {
  var scheduling = typeof navigator !== 'undefined' && navigator.scheduling;
  return !!(scheduling && typeof scheduling.isInputPending === 'function' && scheduling.isInputPending());
}

function lyricQualityEffectiveBudgetBytes(tier, oneReplacementBytes) {
  var budget = lyricQualityPoolBudgetBytes(tier);
  var now = lyricQualityNowMs();
  if (Number(lyricQualityState.transitionBudgetUntil) > now) {
    budget = Math.max(budget, Math.max(0, Number(lyricQualityState.transitionBaseBytes) || 0) + Math.max(0, Number(oneReplacementBytes) || 0));
  } else if (lyricQualityState.transitionBudgetUntil) {
    lyricQualityState.transitionBudgetUntil = 0;
    lyricQualityState.transitionBaseBytes = 0;
  }
  return budget;
}

function lyricQualityEffectiveMaxRows() {
  return lyricQualityMaxResidentRows() + (Number(lyricQualityState.transitionBudgetUntil) > lyricQualityNowMs() ? 1 : 0);
}

function lyricQualityEnsureCapacity(extraBytes, pinnedRow, tier) {
  var budget = lyricQualityEffectiveBudgetBytes(tier, extraBytes);
  var maxRows = lyricQualityEffectiveMaxRows();
  lyricQualityRecount();
  if (!budget || extraBytes > budget) return false;
  // A quality build keeps the committed texture alive until the next upload
  // turn.  Permit that one atomic replacement even when an old 4x pool is
  // temporarily larger than the new 2x/3x pool, but never let a second
  // pending texture accumulate behind it.
  if (lyricQualityHasPendingTexture()) return false;
  var now = lyricQualityNowMs();
  var pinnedResident = lyricQualityResidentIndex(pinnedRow) >= 0;
  var atomicReplacement = !!(
    pinnedResident && pinnedRow && pinnedRow.qualityTexture &&
    Number(pinnedRow.qualitySelectionFrame) === lyricQualityState.selectionFrame &&
    Number(pinnedRow.qualityProjectedTier) === Number(tier) &&
    Number(pinnedRow.qualityProjectedPoolBytes) > 0
  );
  var candidates = lyricQualityState.residents.filter(function (row) {
    return row && row !== pinnedRow && row.qualityWanted !== true && Number(row.qualityFallbackUntil) <= now;
  });
  candidates.sort(function (a, b) {
    return (Number(a.qualityLastUsedAt) || 0) - (Number(b.qualityLastUsedAt) || 0);
  });
  while ((lyricQualityState.bytes + extraBytes > budget || (!pinnedResident && lyricQualityState.residents.length >= maxRows)) && candidates.length) {
    releaseLyricRowQuality(candidates.shift(), true);
  }
  lyricQualityRecount();
  if (atomicReplacement) {
    return pinnedResident && Number(pinnedRow.qualityProjectedPoolBytes) <= budget;
  }
  return lyricQualityState.bytes + extraBytes <= budget && (pinnedResident || lyricQualityState.residents.length < maxRows);
}

function scheduleLyricQualityBuild(delay) {
  if (lyricQualityState.timer || lyricQualityState.idle || !lyricQualityState.queue.length) return;
  if (delay > 0) {
    lyricQualityState.timer = setTimeout(function () {
      lyricQualityState.timer = 0;
      scheduleLyricQualityBuild(0);
    }, delay);
    return;
  }
  var run = function (deadline) {
    lyricQualityState.idle = 0;
    if (!lyricQualityState.queue.length) return;
    if ((typeof isProgressDragPreviewActive === 'function' && isProgressDragPreviewActive()) || lyricQualityInputPending()) {
      scheduleLyricQualityBuild(72);
      return;
    }
    if (deadline && !deadline.didTimeout && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() < 5) {
      scheduleLyricQualityBuild(24);
      return;
    }
    lyricQualityState.queue.sort(function (a, b) { return a.priority - b.priority; });
    var job = lyricQualityState.queue.shift();
    var row = job && job.row;
    var now = lyricQualityNowMs();
    if (!row || job.globalGeneration !== lyricQualityState.generation || job.rowGeneration !== row.qualityGeneration || row.qualityQueuedKey !== job.key || row.qualityWanted !== true || Number(row.qualityHotUntil) <= now || !lyricQualityOwnerActive(job.data, row)) {
      if (row && row.qualityQueuedKey === (job && job.key)) row.qualityQueuedKey = '';
      scheduleLyricQualityBuild(0);
      return;
    }
    row.qualityQueuedKey = '';
    // Capacity is checked before the expensive canvas render. Hot rows are
    // never evicted merely to satisfy another hot row; when two lyric roots
    // briefly overlap, the newcomer waits instead of causing build/dispose
    // oscillation every frame.
    if (!lyricQualityEnsureCapacity(job.bytes, row, job.tier)) {
      scheduleLyricQualityBuild(0);
      return;
    }
    var startedAt = lyricQualityNowMs();
    var built = makeLyricQualityTexture(row.lineMask, job.tier);
    lyricQualityState.lastBuildMs = lyricQualityNowMs() - startedAt;
    if (!built || job.globalGeneration !== lyricQualityState.generation || job.rowGeneration !== row.qualityGeneration || row.qualityWanted !== true || Number(row.qualityHotUntil) <= lyricQualityNowMs() || !lyricQualityOwnerActive(job.data, row)) {
      if (built && built.texture) lyricQualityDisposeTexture(built.texture);
      scheduleLyricQualityBuild(0);
      return;
    }
    if (!lyricQualityEnsureCapacity(built.bytes, row, job.tier)) {
      lyricQualityDisposeTexture(built.texture);
      scheduleLyricQualityBuild(48);
      return;
    }
    if (row.qualityPendingTexture && row.qualityPendingTexture !== row.qualityTexture) lyricQualityDisposeTexture(row.qualityPendingTexture);
    row.qualityPendingTexture = built.texture;
    row.qualityPendingTier = built.tier;
    row.qualityPendingKey = built.key;
    row.qualityPendingBytes = built.bytes;
    row.qualityLastUsedAt = lyricQualityNowMs();
    lyricQualityRememberRow(row);
    updateLyricQualityStats(job.tier);
    scheduleLyricQualityBuild(0);
  };
  if (typeof requestIdleCallback === 'function') {
    lyricQualityState.idle = requestIdleCallback(run, { timeout: 180 });
  } else {
    lyricQualityState.timer = setTimeout(function () {
      lyricQualityState.timer = 0;
      run({ didTimeout: true, timeRemaining: function () { return 8; } });
    }, 18);
  }
}

function queueLyricRowQuality(data, row, tier, priority) {
  if (!lyricQualityOwnerActive(data, row) || !row.lineMask || tier <= 1 || row.qualityWanted !== true || Number(row.qualityHotUntil) <= lyricQualityNowMs()) return;
  var target = lyricQualityTargetMetrics(row.lineMask, tier);
  if (!target) return;
  var key = target.tier + 'x|' + target.width + 'x' + target.height + '|' + (Number(row.lineMask.stoneSeed) || 0);
  if ((row.qualityTexture && row.qualityTier === tier && row.qualityRasterKey === key) || (row.qualityPendingTexture && row.qualityPendingTier === tier && row.qualityPendingKey === key) || row.qualityQueuedKey === key) return;
  row.qualityGeneration = (Number(row.qualityGeneration) || 0) + 1;
  row.qualityQueuedKey = key;
  lyricQualityState.queue.push({
    data: data,
    row: row,
    tier: tier,
    key: key,
    priority: Number(priority) || 50,
    bytes: target.bytes,
    rowGeneration: row.qualityGeneration,
    globalGeneration: lyricQualityState.generation
  });
  scheduleLyricQualityBuild(0);
}

function pruneLyricQualityQueue(now) {
  now = Number(now) || lyricQualityNowMs();
  if (!lyricQualityState.queue.length) return;
  lyricQualityState.queue = lyricQualityState.queue.filter(function (job) {
    var row = job && job.row;
    var valid = !!(row && job.globalGeneration === lyricQualityState.generation && job.rowGeneration === row.qualityGeneration && row.qualityQueuedKey === job.key && row.qualityWanted === true && Number(row.qualityHotUntil) > now && lyricQualityOwnerActive(job.data, row));
    if (!valid && row && row.qualityQueuedKey === (job && job.key)) row.qualityQueuedKey = '';
    return valid;
  });
}

function disposeLyricQualityOwner(data) {
  if (!data) return;
  data.__mineradioLyricQualityDisposed = true;
  var rows = Array.isArray(data.rowLayers) ? data.rowLayers.slice() : [];
  lyricQualityState.frameCandidates = lyricQualityState.frameCandidates.filter(function (candidate) {
    return candidate && candidate.data !== data && rows.indexOf(candidate.row) < 0;
  });
  lyricQualityState.frameCommits = lyricQualityState.frameCommits.filter(function (candidate) {
    return candidate && candidate.data !== data && rows.indexOf(candidate.row) < 0;
  });
  lyricQualityState.queue = lyricQualityState.queue.filter(function (job) {
    var remove = !!(job && (job.data === data || rows.indexOf(job.row) >= 0));
    if (remove && job.row && job.row.qualityQueuedKey === job.key) job.row.qualityQueuedKey = '';
    return !remove;
  });
  for (var i = 0; i < rows.length; i++) releaseLyricRowQuality(rows[i], true);
  pruneLyricQualityQueue(lyricQualityNowMs());
  updateLyricQualityStats(lyricTextureClarityScale());
}

function commitLyricRowQuality(row) {
  if (!row || lyricQualityState.deferFinalize || row.qualityWanted !== true) return false;
  if (row.qualityPendingTexture) {
    var previous = row.qualityTexture;
    row.qualityTexture = row.qualityPendingTexture;
    row.qualityTier = row.qualityPendingTier;
    row.qualityRasterKey = row.qualityPendingKey;
    row.qualityBytes = row.qualityPendingBytes;
    row.qualityPendingTexture = null;
    row.qualityPendingTier = 0;
    row.qualityPendingKey = '';
    row.qualityPendingBytes = 0;
    setLyricRowTextureMap(row, row.qualityTexture);
    row.qualityFallbackUntil = 0;
    if (previous && previous !== row.qualityTexture && previous !== row.baseLineTexture) lyricQualityDisposeTexture(previous);
  } else if (row.qualityTexture) {
    setLyricRowTextureMap(row, row.qualityTexture);
  } else return false;
  row.qualityLastUsedAt = lyricQualityNowMs();
  lyricQualityRememberRow(row);
  lyricQualityRecount();
  return true;
}

function beginLyricQualitySelectionFrame(deferFinalize) {
  lyricQualityState.selectionFrame += 1;
  lyricQualityState.frameCandidates.length = 0;
  lyricQualityState.frameCommits.length = 0;
  lyricQualityState.deferFinalize = deferFinalize === true;
  for (var residentIndex = 0; residentIndex < lyricQualityState.residents.length; residentIndex++) {
    var residentRow = lyricQualityState.residents[residentIndex];
    if (residentRow) residentRow.qualityWanted = false;
  }
  for (var queueIndex = 0; queueIndex < lyricQualityState.queue.length; queueIndex++) {
    var queuedRow = lyricQualityState.queue[queueIndex] && lyricQualityState.queue[queueIndex].row;
    if (queuedRow) queuedRow.qualityWanted = false;
  }
}

function registerLyricQualityCandidates(data, candidates, tier, rootPriority, buildDeferred) {
  if (!lyricQualityOwnerActive(data) || !Array.isArray(candidates) || !candidates.length || tier <= 1) return;
  rootPriority = Number(rootPriority) || 0;
  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i];
    if (!candidate || !candidate.row) continue;
    lyricQualityState.frameCandidates.push({
      data: data,
      row: candidate.row,
      tier: tier,
      priority: rootPriority + (Number(candidate.priority) || 50),
      hotMs: Number(candidate.hotMs) || 620,
      buildDeferred: buildDeferred === true
    });
  }
}

function registerLyricQualityCommitCandidate(data, row, priority) {
  if (!lyricQualityOwnerActive(data, row) || !row || (!row.qualityPendingTexture && (!row.qualityTexture || lyricQualityCurrentMap(row) === row.qualityTexture))) return;
  lyricQualityState.frameCommits.push({
    data: data,
    row: row,
    priority: Number(priority) || 50
  });
}

function commitDeferredLyricQualityRows() {
  if (!lyricQualityState.frameCommits.length) return false;
  var commits = lyricQualityState.frameCommits.slice().sort(function (a, b) { return a.priority - b.priority; });
  var seen = [];
  for (var i = 0; i < commits.length; i++) {
    var candidate = commits[i];
    var row = candidate && candidate.row;
    if (!row || seen.indexOf(row) >= 0 || !lyricQualityOwnerActive(candidate.data, row)) continue;
    seen.push(row);
    if (row.qualityWanted !== true) continue;
    if (!row.qualityPendingTexture && (!row.qualityTexture || lyricQualityCurrentMap(row) === row.qualityTexture)) continue;
    if (!consumeLyricRenderUploadFrameBudget()) return false;
    return commitLyricRowQuality(row);
  }
  return false;
}

function lyricQualityCandidateTarget(candidate) {
  if (!candidate || !candidate.row || !candidate.row.lineMask) return null;
  var target = lyricQualityTargetMetrics(candidate.row.lineMask, candidate.tier);
  if (!target) return null;
  return {
    metrics: target,
    key: target.tier + 'x|' + target.width + 'x' + target.height + '|' + (Number(candidate.row.lineMask.stoneSeed) || 0)
  };
}

function lyricQualityRowMatchesTarget(row, targetInfo) {
  if (!row || !targetInfo) return false;
  var tier = targetInfo.metrics.tier;
  var key = targetInfo.key;
  return !!(
    (row.qualityTexture && row.qualityTier === tier && row.qualityRasterKey === key) ||
    (row.qualityPendingTexture && row.qualityPendingTier === tier && row.qualityPendingKey === key)
  );
}

function finalizeLyricQualitySelectionFrame() {
  lyricQualityState.deferFinalize = false;
  var tier = lyricTextureClarityScale();
  var now = lyricQualityNowMs();
  if (tier <= 1) {
    var baseRows = lyricQualityState.residents.slice();
    for (var baseIndex = 0; baseIndex < baseRows.length; baseIndex++) releaseLyricRowQuality(baseRows[baseIndex], true);
    pruneLyricQualityQueue(now);
    updateLyricQualityStats(tier);
    return;
  }
  var sorted = lyricQualityState.frameCandidates.slice().sort(function (a, b) { return a.priority - b.priority; });
  var candidates = [];
  var candidateRows = [];
  for (var sortedIndex = 0; sortedIndex < sorted.length; sortedIndex++) {
    var sortedCandidate = sorted[sortedIndex];
    if (!sortedCandidate || !lyricQualityOwnerActive(sortedCandidate.data, sortedCandidate.row) || candidateRows.indexOf(sortedCandidate.row) >= 0) continue;
    var targetInfo = lyricQualityCandidateTarget(sortedCandidate);
    if (!targetInfo) continue;
    sortedCandidate.targetInfo = targetInfo;
    candidates.push(sortedCandidate);
    candidateRows.push(sortedCandidate.row);
  }
  var maxRows = lyricQualityEffectiveMaxRows();
  var desiredRows = [];
  var desiredRowProjectedBytes = [];
  var desiredProjectedBytes = 0;
  var largestSelectionItem = 0;
  function rememberDesired(row, projectedBytes) {
    if (!row || desiredRows.indexOf(row) >= 0 || desiredRows.length >= maxRows) return false;
    desiredRows.push(row);
    var safeProjectedBytes = Math.max(0, Number(projectedBytes) || 0);
    desiredRowProjectedBytes.push(safeProjectedBytes);
    desiredProjectedBytes += safeProjectedBytes;
    return true;
  }
  var fallbackRows = lyricQualityState.residents.filter(function (row) {
    return row && (row.qualityTexture || row.qualityPendingTexture) && Number(row.qualityFallbackUntil) > now;
  }).sort(function (a, b) {
    return (Number(b.qualityLastUsedAt) || 0) - (Number(a.qualityLastUsedAt) || 0);
  });
  for (var fallbackIndex = 0; fallbackIndex < fallbackRows.length; fallbackIndex++) {
    var fallbackRow = fallbackRows[fallbackIndex];
    rememberDesired(fallbackRow, Math.max(0, Number(fallbackRow.qualityBytes) || 0) + Math.max(0, Number(fallbackRow.qualityPendingBytes) || 0));
  }
  // Select the current root first, then its nearest rows, using both the row
  // count and byte pool. Existing low-priority textures never get to reserve
  // the whole pool ahead of a newly active line merely because they already
  // happen to be resident.
  for (var selectionIndex = 0; selectionIndex < candidates.length; selectionIndex++) {
    var selectionCandidate = candidates[selectionIndex];
    if (desiredRows.indexOf(selectionCandidate.row) >= 0) continue;
    if (desiredRows.length >= maxRows) break;
    var selectionBytes = selectionCandidate.targetInfo.metrics.bytes;
    var nextLargestSelectionItem = Math.max(largestSelectionItem, selectionBytes);
    if (desiredProjectedBytes + selectionBytes > lyricQualityEffectiveBudgetBytes(tier, nextLargestSelectionItem)) continue;
    if (rememberDesired(selectionCandidate.row, selectionBytes)) largestSelectionItem = nextLargestSelectionItem;
  }
  var residentRows = lyricQualityState.residents.slice();
  for (var releaseIndex = 0; releaseIndex < residentRows.length; releaseIndex++) {
    var releaseRow = residentRows[releaseIndex];
    if (desiredRows.indexOf(releaseRow) < 0) releaseLyricRowQuality(releaseRow, true);
  }
  lyricQualityRecount();
  var buildCandidates = [];
  for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
    var candidate = candidates[candidateIndex];
    var row = candidate.row;
    if (desiredRows.indexOf(row) < 0) continue;
    row.qualityWanted = true;
    row.qualityHotUntil = Math.max(Number(row.qualityHotUntil) || 0, now + candidate.hotMs);
    row.qualityLastUsedAt = now;
    var targetBytes = candidate.targetInfo.metrics.bytes;
    var desiredRowIndex = desiredRows.indexOf(row);
    var selectedProjectedBytes = desiredRowIndex >= 0 ? desiredRowProjectedBytes[desiredRowIndex] : targetBytes;
    var replacementProjectedPoolBytes = Math.max(0, desiredProjectedBytes - selectedProjectedBytes + targetBytes);
    row.qualitySelectionFrame = lyricQualityState.selectionFrame;
    row.qualityProjectedPoolBytes = replacementProjectedPoolBytes;
    row.qualityProjectedTier = tier;
    if (lyricQualityRowMatchesTarget(row, candidate.targetInfo)) continue;
    if (replacementProjectedPoolBytes > lyricQualityEffectiveBudgetBytes(tier, targetBytes)) continue;
    if (!candidate.buildDeferred) buildCandidates.push(candidate);
  }
  for (var desiredIndex = 0; desiredIndex < desiredRows.length; desiredIndex++) {
    var desiredRow = desiredRows[desiredIndex];
    if (!desiredRow) continue;
    desiredRow.qualityWanted = true;
    if (Number(desiredRow.qualityFallbackUntil) > now) desiredRow.qualityHotUntil = Math.max(Number(desiredRow.qualityHotUntil) || 0, Number(desiredRow.qualityFallbackUntil));
  }
  for (var buildIndex = 0; buildIndex < buildCandidates.length; buildIndex++) {
    var buildCandidate = buildCandidates[buildIndex];
    queueLyricRowQuality(buildCandidate.data, buildCandidate.row, buildCandidate.tier, buildCandidate.priority);
  }
  pruneLyricQualityQueue(now);
  commitDeferredLyricQualityRows();
  updateLyricQualityStats(tier);
}

function resetLyricRenderUploadFrameBudget(deferQualityFinalize) {
  lyricRenderUploadFrameBudget.frame += 1;
  lyricRenderUploadFrameBudget.remaining = 1;
  lyricRenderUploadFrameBudget.consumed = 0;
  beginLyricQualitySelectionFrame(deferQualityFinalize);
  if (typeof window !== 'undefined') {
    window.__mineradioLyricUploadBudgetStats = {
      frame: lyricRenderUploadFrameBudget.frame,
      consumed: 0,
      remaining: 1,
      maxConsumed: lyricRenderUploadFrameBudget.maxConsumed
    };
  }
}

function consumeLyricRenderUploadFrameBudget() {
  if (lyricRenderUploadFrameBudget.remaining <= 0) return false;
  lyricRenderUploadFrameBudget.remaining -= 1;
  lyricRenderUploadFrameBudget.consumed += 1;
  lyricRenderUploadFrameBudget.maxConsumed = Math.max(lyricRenderUploadFrameBudget.maxConsumed, lyricRenderUploadFrameBudget.consumed);
  if (typeof window !== 'undefined') {
    window.__mineradioLyricUploadBudgetStats = {
      frame: lyricRenderUploadFrameBudget.frame,
      consumed: lyricRenderUploadFrameBudget.consumed,
      remaining: lyricRenderUploadFrameBudget.remaining,
      maxConsumed: lyricRenderUploadFrameBudget.maxConsumed
    };
  }
  return true;
}

function updateLyricRowLayers(data, opts) {
  if (!data || !data.rowLayers || !data.rowLayers.length) return;
  opts = opts || {};
  var opacity = clampRange(Number(opts.opacity) || 0, 0, 1);
  var readability = clampRange(Number(opts.readability) || 0.58, 0, 1);
  var contextIntro = opts.contextIntro == null ? 1 : clampRange(Number(opts.contextIntro) || 0, 0, 1);
  var shownProgress = clampRange(Number(opts.shownProgress) || 0, 0, 1);
  var contextDrift = Number(opts.contextDrift) || 0;
  var style = opts.style || 'glass';
  var t = Number(opts.time) || 0;
  var seed = Number(opts.seed) || 0;
  var renderBase = opts.renderBase == null ? 43 : Number(opts.renderBase);
  if (!isFinite(renderBase)) renderBase = 43;
  if (data.rowLayerGroup) data.rowLayerGroup.renderOrder = renderBase;
  if (data.contextGroup) data.contextGroup.renderOrder = renderBase;
  if (data.readabilityGroup) data.readabilityGroup.renderOrder = renderBase;
  var translationMode = normalizeLyricTranslationMode(fx && fx.lyricTranslationMode);
  var displayMode = normalizeLyricDisplayMode(data.displayMode || (fx && fx.lyricDisplayMode));
  var singleLineStaticSwap = displayMode === 'single' && !data.usesTrack;
  var currentTranslationOpacity = lyricTranslationOpacityValue();
  var previewMotionLock = opts.previewMotionLock === true;
  var motionBlend = previewMotionLock ? 0 : clampRange(opts.motionBlend == null ? 1 : Number(opts.motionBlend) || 0, 0, 1);
  var jitterX = (Number(opts.jitterX) || 0) * motionBlend;
  var jitterY = (Number(opts.jitterY) || 0) * motionBlend;
  var verticalFloatOn = !previewMotionLock && motionBlend > 0.001 && (typeof lyricVerticalFloatEnabled === 'function' ? lyricVerticalFloatEnabled() : true);
  var baseEase = opts.ease == null ? 0.16 : clampRange(Number(opts.ease) || 0.16, 0.04, 1);
  var frameDelta = Number(opts.deltaTime);
  var frameScale = isFinite(frameDelta) && frameDelta > 0 ? clampRange(frameDelta * 60, 0.25, 3) : 1;
  // Preserve the 60 Hz feel while keeping the same motion duration when a
  // low-spec machine briefly renders at 30/45 Hz.
  var ease = 1 - Math.pow(1 - baseEase, frameScale);
  var pendingPayload = data.trackPersistent && data.trackPendingPayload ? data.trackPendingPayload : null;
  var pendingTargetLineIndex = pendingPayload && pendingPayload.trackIndex != null && isFinite(Number(pendingPayload.trackIndex))
    ? Number(pendingPayload.trackIndex)
    : null;
  // Loading may postpone the material/progress commit, but it must not
  // postpone the motion target.  Feeding every preview target into the same
  // track is what preserves the private build's continuous two-stage scroll.
  var targetLineIndex = pendingTargetLineIndex != null
    ? pendingTargetLineIndex
    : (opts.targetLineIndex != null && isFinite(Number(opts.targetLineIndex))
      ? Number(opts.targetLineIndex)
      : (isFinite(Number(data.trackTargetLineIndex)) ? Number(data.trackTargetLineIndex) : 0));
  var targetIndex = pendingTargetLineIndex != null
    ? lyricPrimaryVirtualIndex(targetLineIndex)
    : (opts.targetVirtualIndex != null && isFinite(Number(opts.targetVirtualIndex))
      ? Number(opts.targetVirtualIndex)
      : (isFinite(Number(data.trackTargetVirtualIndex)) ? Number(data.trackTargetVirtualIndex) : lyricPrimaryVirtualIndex(targetLineIndex)));
  var baseTrackEase = opts.trackEase == null ? clampRange(baseEase * 1.16, 0.08, 0.34) : clampRange(Number(opts.trackEase) || 0.18, 0.04, 0.60);
  var trackEase = 1 - Math.pow(1 - baseTrackEase, frameScale);
  var nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  var trackTargetJustCommitted = !!(data.trackPersistent && isFinite(Number(data.trackTargetCommittedAt)) && nowMs - Number(data.trackTargetCommittedAt) <= 34);
  var initialTextRevealPending = !!(data.usesTrack && data.renderInitialTextReady !== true);
  var textureEffectsAllowed = !initialTextRevealPending;
  var persistentTrackTransparentPrewarm = !!(data.usesTrack && data.trackPersistent && !initialTextRevealPending);
  var visibleRadiusForSnap = Math.max(1.2, Number(data.trackVisibleRadius) || 3);
  var currentScrollOffset = Number(data.trackScrollOffset);
  // Progress preview only suppresses decorative drift.  It must never turn
  // the shared lyric track into an integer, per-line snap.  Once the track is
  // primed, keep the same two-stage easing used by normal playback even when
  // the pointer moves a long distance.
  var persistentPrimedTrack = !!(data.trackPersistent && data.trackScrollPrimed);
  var continuousTrackSlotStep = 1;
  if (data.usesTrack && persistentPrimedTrack) {
    var trackLineCount = typeof lyricsLines !== 'undefined' && lyricsLines ? lyricsLines.length : 0;
    var neighborLineIndex = targetLineIndex < Math.max(0, trackLineCount - 1)
      ? targetLineIndex + 1
      : Math.max(0, targetLineIndex - 1);
    continuousTrackSlotStep = Math.abs(lyricPrimaryVirtualIndex(neighborLineIndex) - lyricPrimaryVirtualIndex(targetLineIndex));
    if (!isFinite(continuousTrackSlotStep) || continuousTrackSlotStep < 0.25) continuousTrackSlotStep = 1;
  }
  var needsScrollSnap = !isFinite(currentScrollOffset) || (!persistentPrimedTrack && !previewMotionLock && (
    (isFinite(Number(data.trackScrollSnapUntil)) && nowMs <= Number(data.trackScrollSnapUntil)) ||
    Math.abs(targetIndex - currentScrollOffset) > Math.max(3.2, visibleRadiusForSnap * 1.85)
  ));
  if (needsScrollSnap) {
    data.trackScrollOffset = targetIndex;
    data.trackScrollPrimed = true;
  } else {
    var trackStep = (targetIndex - data.trackScrollOffset) * trackEase;
    if (data.usesTrack && persistentPrimedTrack) {
      // Bound the shared phase, not individual meshes: no rendered frame may
      // skip across a complete primary lyric row, while normal adjacent-line
      // easing keeps exactly the same timing as before.
      var continuousTrackMaxRowsPerFrame = 0.68;
      var continuousTrackMaxStep = continuousTrackSlotStep * continuousTrackMaxRowsPerFrame;
      trackStep = clampRange(trackStep, -continuousTrackMaxStep, continuousTrackMaxStep);
    }
    data.trackScrollOffset += trackStep;
  }
  var scrollOffset = data.trackScrollOffset;
  var lineStepWorld = clampRange(Number(data.lineWorldStep) || 0.38, 0.20, 0.94);
  var translationLineStepWorld = clampRange(Number(data.translationLineStepWorld) || lineStepWorld, 0.20, 0.78);
  var displayedTrackOffset = typeof stageLyricResidentDisplayedScrollOffset === 'function'
    ? stageLyricResidentDisplayedScrollOffset(data, scrollOffset)
    : scrollOffset;
  var previewTrackCorridor = !!(
    previewMotionLock && data.usesTrack && data.trackPersistent &&
    isFinite(Number(displayedTrackOffset)) && Math.abs(targetIndex - Number(displayedTrackOffset)) > 0.20
  );
  var presentationLineIndex = previewTrackCorridor
    ? lyricNearestPrimaryLineIndexForVirtual(displayedTrackOffset, targetLineIndex)
    : targetLineIndex;
  var presentationIndex = previewTrackCorridor ? lyricPrimaryVirtualIndex(presentationLineIndex) : targetIndex;
  var visibilityScrollOffset = previewTrackCorridor ? Number(displayedTrackOffset) : scrollOffset;
  data.trackPreviewCorridorActive = previewTrackCorridor;
  data.trackPresentationLineIndex = presentationLineIndex;
  var rowDrift = previewMotionLock ? 0 : (0.5 - shownProgress) * contextDrift * motionBlend;
  var rowGlow = clampRange(Number(opts.rowGlow) || 0, 0, 1);
  var rowGlowBeat = clampRange(Number(opts.rowGlowBeat) || 0, 0, 1.5);
  var backdropAdapt = lyricBackdropAdaptActive() ? lyricBackgroundAdaptStrengthValue() : 0;
  var readabilityBackdropColor = backdropAdapt > 0.001 ? lyricReadabilityColorForBrightBackdrop(backdropAdapt) : null;
  var activeRow = null;
  var renderRevealCandidates = [];
  var lyricQualityTier = lyricTextureClarityScale();
  var contextHighQualityEnabled = !fx || fx.lyricContextHighQuality !== false;
  var qualityBuildDeferred = typeof isProgressDragPreviewActive === 'function' && isProgressDragPreviewActive();
  var lyricQualityCandidates = [];
  var revealOffsets = lyricDisplayOffsetsForMode(displayMode);
  var revealPrewarmMinOffset = 0;
  var revealPrewarmMaxOffset = 0;
  for (var offsetIndex = 0; offsetIndex < revealOffsets.length; offsetIndex++) {
    var revealOffset = Math.round(Number(revealOffsets[offsetIndex]) || 0);
    revealPrewarmMinOffset = Math.min(revealPrewarmMinOffset, revealOffset);
    revealPrewarmMaxOffset = Math.max(revealPrewarmMaxOffset, revealOffset);
  }
  for (var i = 0; i < data.rowLayers.length; i++) {
    var row = data.rowLayers[i];
    var liveDelta = (row.virtualIndex != null && isFinite(Number(row.virtualIndex)) ? Number(row.virtualIndex) : i) - scrollOffset;
    var targetDelta = (row.virtualIndex != null && isFinite(Number(row.virtualIndex)) ? Number(row.virtualIndex) : i) - presentationIndex;
    var abs = Math.abs(liveDelta);
    var targetAbs = Math.abs(targetDelta);
    var visibilityAbs = Math.abs((row.virtualIndex != null && isFinite(Number(row.virtualIndex)) ? Number(row.virtualIndex) : i) - visibilityScrollOffset);
    var rowLineIndex = row.lineIndex != null && isFinite(Number(row.lineIndex)) ? Number(row.lineIndex) : null;
    var isActive = !!row.isPrimary && (rowLineIndex != null ? rowLineIndex === presentationLineIndex : targetAbs < 0.015);
    row.delta = liveDelta;
    row.isActive = isActive;
    if (isActive) activeRow = row;
    var translationFocus = 0;
    var contextAlpha = row.isTranslation
      ? clampRange(row.targetAlpha * (1 - Math.max(0, targetAbs - 0.65) * 0.12), 0.08, 0.62)
      : clampRange(row.targetAlpha * (1 - Math.max(0, targetAbs - 0.25) * 0.070), 0.16, 0.92);
    var parentIndex = null;
    var parentDistance = Infinity;
    var currentTranslation = false;
    var singleLineTranslationSwap = false;
    var rowWindowLineIndex = rowLineIndex;
    if (row.isTranslation) {
      parentIndex = row.parentIndex != null && isFinite(Number(row.parentIndex))
        ? Number(row.parentIndex)
        : (row.virtualIndex != null ? Number(row.virtualIndex) - lyricTranslationVisualGapValue() : presentationLineIndex);
      rowWindowLineIndex = parentIndex;
      parentDistance = Math.abs(parentIndex - presentationLineIndex);
      currentTranslation = parentDistance < 0.001;
      var parentFade = clampRange((0.82 - parentDistance) / 0.34, 0, 1);
      parentFade = parentFade * parentFade * (3 - 2 * parentFade);
      if (translationMode === 'dual') {
        var currentParent = Math.abs(parentIndex - presentationLineIndex) < 0.001;
        var nextParent = Math.abs(parentIndex - (presentationLineIndex + 1)) < 0.001;
        parentFade = currentParent ? 1 : (nextParent ? 0.56 : 0);
      }
      if (translationMode !== 'multi') {
        translationFocus = parentFade;
        contextAlpha = clampRange(currentTranslationOpacity * parentFade, 0, currentTranslationOpacity);
      } else {
        translationFocus = parentFade;
        var contextTranslationAlpha = clampRange(row.targetAlpha * (1 - Math.max(0, parentDistance - 0.35) * 0.16), 0.08, 0.58);
        contextAlpha = clampRange(
          contextTranslationAlpha * (1 - parentFade) + currentTranslationOpacity * parentFade,
          0.08,
          Math.max(0.58, currentTranslationOpacity)
        );
      }
      if (data.usesTrack && parentIndex != null && isFinite(Number(parentIndex))) {
        var parentVirtualForVisibility = lyricPrimaryVirtualIndex(parentIndex);
        visibilityAbs = Math.abs(parentVirtualForVisibility - visibilityScrollOffset);
      } else if (currentTranslation || row.parentRole === 'current') {
        visibilityAbs = 0;
      }
      singleLineTranslationSwap = singleLineStaticSwap && (currentTranslation || row.parentRole === 'current');
    }
    var lineWindowAllowed = lyricLineAllowedForDisplayMode(rowWindowLineIndex, presentationLineIndex, displayMode);
    var rowLineOffset = rowWindowLineIndex != null && isFinite(Number(rowWindowLineIndex))
      ? Math.round(Number(rowWindowLineIndex) - presentationLineIndex)
      : 0;
    var lineUploadPrewarm = !!(
      data.usesTrack && !initialTextRevealPending && !lineWindowAllowed &&
      rowWindowLineIndex != null && isFinite(Number(rowWindowLineIndex)) &&
      rowLineOffset >= revealPrewarmMinOffset - 1 && rowLineOffset <= revealPrewarmMaxOffset + 1
    );
    var pendingWindowAllowed = pendingTargetLineIndex != null && lyricLineAllowedForDisplayMode(rowWindowLineIndex, pendingTargetLineIndex, displayMode);
    if (!lineWindowAllowed) {
      contextAlpha = 0;
      translationFocus = 0;
    }
    var motionAnchor = isActive || currentTranslation;
    var rowIntro = motionAnchor ? 1 : contextIntro;
    var visibleRadius = Math.max(0.85, Number(data.trackVisibleRadius) || 3);
    var visibleFade = lineWindowAllowed ? (motionAnchor ? 1 : clampRange((visibleRadius + 1.10 - visibilityAbs) / 1.10, 0, 1)) : 0;
    visibleFade = visibleFade * visibleFade * (3 - 2 * visibleFade);
    var renderWindowActive = !!(lineWindowAllowed && (motionAnchor || visibleFade > 0.002));
    if (renderWindowActive && !row.renderWindowActive) {
      var revealLane = Math.min(5, Math.max(0, Math.round(visibilityAbs)));
      row.renderWindowActive = true;
      row.renderRevealAt = nowMs + (motionAnchor || row.renderLineUploaded ? 0 : 10 + revealLane * 14) + (row.renderLineUploaded ? 0 : (row.isTranslation ? 8 : 0));
    } else if (!renderWindowActive && row.renderWindowActive) {
      row.renderWindowActive = false;
      row.renderRevealAt = 0;
    }
    var rowHighQualityAllowed = contextHighQualityEnabled || isActive || currentTranslation;
    if (lyricQualityTier <= 1 || !rowHighQualityAllowed) {
      if (row.qualityTexture || row.qualityPendingTexture || row.qualityQueuedKey) releaseLyricRowQuality(row, true);
    } else if (!initialTextRevealPending && (renderWindowActive || lineUploadPrewarm || pendingWindowAllowed)) {
      var qualityPriority = isActive ? 10 : (currentTranslation ? 11 : (row.isTranslation ? 22 : (lineUploadPrewarm ? 34 : 24 + Math.min(8, visibilityAbs))));
      lyricQualityCandidates.push({
        row: row,
        priority: qualityPriority,
        hotMs: renderWindowActive ? 1100 : 620
      });
    }
    var rowRevealAt = Number(row.renderRevealAt) || nowMs;
    var lineLayerVisible = renderWindowActive && (initialTextRevealPending || nowMs >= rowRevealAt);
    var readabilityLayerVisible = textureEffectsAllowed && lineLayerVisible && readability > 0.001 && nowMs >= rowRevealAt + 18;
    var existingGlowOpacity = row.glowMat ? getLyricTextureMaterialOpacity(row.glowMat) : 0;
    var glowLayerWanted = rowGlow > 0.001 || rowGlowBeat > 0.001 || existingGlowOpacity > 0.004;
    var glowLayerVisible = textureEffectsAllowed && lineLayerVisible && glowLayerWanted && nowMs >= rowRevealAt + 40;
    var anchorRevealPriority = isActive ? 0 : (currentTranslation ? 1 : null);
    var contextRevealPriority = 20 + Math.min(8, visibilityAbs) * 6 + (row.isTranslation ? 1 : 0);
    if (row.mesh) {
      row.mesh.visible = lineLayerVisible && !!row.renderLineUploaded;
      if ((lineLayerVisible || lineUploadPrewarm) && !row.renderLineUploaded) {
        var lineRevealPriority = lineUploadPrewarm
          ? 80 + Math.abs(rowLineOffset) + (row.isTranslation ? 1 : 0)
          : (anchorRevealPriority == null ? contextRevealPriority : anchorRevealPriority);
        renderRevealCandidates.push({ row: row, mesh: row.mesh, flag: 'renderLineUploaded', priority: lineRevealPriority });
      }
      if (row.renderLineUploaded && renderWindowActive && (row.qualityPendingTexture || (row.qualityTexture && lyricQualityCurrentMap(row) !== row.qualityTexture))) {
        renderRevealCandidates.push({ row: row, quality: true, priority: 50 + (isActive ? 0 : (currentTranslation ? 1 : Math.min(8, visibilityAbs))) });
      }
    }
    if (row.readability) {
      row.readability.visible = readabilityLayerVisible && !!row.renderReadabilityUploaded;
      if (readabilityLayerVisible && !row.renderReadabilityUploaded) {
        renderRevealCandidates.push({ row: row, mesh: row.readability, flag: 'renderReadabilityUploaded', priority: 100 + (anchorRevealPriority == null ? contextRevealPriority : anchorRevealPriority) });
      }
    }
    if (row.glow) {
      row.glow.visible = glowLayerVisible && !!row.renderGlowUploaded;
      if (glowLayerVisible && !row.renderGlowUploaded) {
        renderRevealCandidates.push({ row: row, mesh: row.glow, flag: 'renderGlowUploaded', priority: 200 + (anchorRevealPriority == null ? contextRevealPriority : anchorRevealPriority) });
      }
    }
    if (pendingWindowAllowed) {
      var pendingDistance = Math.abs(Number(rowWindowLineIndex) - pendingTargetLineIndex);
      var pendingPriority = pendingDistance * 4 + (row.isTranslation ? 1 : 0);
      if (row.mesh && !row.renderLineUploaded) {
        renderRevealCandidates.push({ row: row, mesh: row.mesh, flag: 'renderLineUploaded', priority: 4 + pendingPriority, transparentPrewarm: true });
      } else if (row.readability && !row.renderReadabilityUploaded) {
        renderRevealCandidates.push({ row: row, mesh: row.readability, flag: 'renderReadabilityUploaded', priority: 104 + pendingPriority, transparentPrewarm: true });
      } else if (row.glow && !row.renderGlowUploaded) {
        renderRevealCandidates.push({ row: row, mesh: row.glow, flag: 'renderGlowUploaded', priority: 204 + pendingPriority, transparentPrewarm: true });
      }
    }
    if (persistentTrackTransparentPrewarm) {
      var trackPrewarmOrder = Math.max(0, rowLineIndex == null ? i : Math.round(rowLineIndex)) * 2 + (row.isTranslation ? 1 : 0);
      if (row.mesh && !row.renderLineUploaded) {
        renderRevealCandidates.push({ row: row, mesh: row.mesh, flag: 'renderLineUploaded', priority: 300 + trackPrewarmOrder * 0.01, transparentPrewarm: true });
      } else if (row.readability && !row.renderReadabilityUploaded) {
        renderRevealCandidates.push({ row: row, mesh: row.readability, flag: 'renderReadabilityUploaded', priority: 400 + trackPrewarmOrder * 0.01, transparentPrewarm: true });
      } else if (row.glow && !row.renderGlowUploaded) {
        renderRevealCandidates.push({ row: row, mesh: row.glow, flag: 'renderGlowUploaded', priority: 500 + trackPrewarmOrder * 0.01, transparentPrewarm: true });
      }
    }
    var target = opacity * (isActive ? 1 : contextAlpha) * rowIntro * visibleFade;
    var depthFade = motionAnchor ? 1 : clampRange(1 - visibilityAbs * 0.055, 0.54, 1) * visibleFade;
    var yTarget = -liveDelta * lineStepWorld + (motionAnchor ? 0 : rowDrift * clampRange(0.70 + abs * 0.10, 0.65, 1.20));
    if (row.isTranslation) {
      yTarget = singleLineTranslationSwap && isFinite(Number(row.baseY))
        ? Number(row.baseY)
        : lyricTranslationAnchoredY(row, i, presentationIndex, lineStepWorld, translationLineStepWorld, scrollOffset, rowDrift, currentTranslation, !!data.usesTrack);
    }
    var zBase = 0.055 - Math.pow(Math.min(5.5, visibilityAbs), 1.06) * 0.145;
    var zTarget = zBase - (motionAnchor ? 0 : Math.abs(rowDrift) * 0.18) + (row.isTranslation ? translationFocus * 0.065 : 0);
    // Keep the focused lyric at its authored size even while the scroll
    // offset is still easing toward the newly committed line.
    var scaleDistance = motionAnchor ? 0 : visibilityAbs;
    var baseScale = clampRange(1 - Math.min(5.5, scaleDistance) * 0.026, 0.84, 1.02);
    if (row.isTranslation) baseScale *= clampRange(Number(row.fontScale) || 1, 0.72, 1.34);
    if (singleLineTranslationSwap) {
      if (isFinite(Number(row.baseZ))) zTarget = Number(row.baseZ);
      if (isFinite(Number(row.baseScale))) baseScale = Number(row.baseScale);
    } else {
      if (row.isTranslation) baseScale *= 1.00 + translationFocus * 0.16;
    }
    if ((row.isPrimary || row.isTranslation) && renderWindowActive && (!fx || fx.lyricLiveViewportFit !== false)) {
      baseScale *= lyricRowLiveViewportScale(row, baseScale);
    } else if (row.viewportFitScale !== 1) {
      row.viewportFitScale = 1;
    }
    var stableMotionIndex = row.virtualIndex != null && isFinite(Number(row.virtualIndex))
      ? Number(row.virtualIndex)
      : (rowLineIndex != null ? rowLineIndex : i);
    var scaleTarget = baseScale * (motionAnchor || !verticalFloatOn ? 1 : (1 + Math.sin(t * 0.68 + seed + stableMotionIndex * 0.71) * (style === 'float' ? 0.012 : 0.004) * motionBlend));
    var translationGlowFocus = row.isTranslation ? translationFocus : 0;
    if (row.mesh) {
      row.mesh.position.x += ((isActive ? jitterX : (currentTranslation ? jitterX * 0.82 : jitterX * 0.28)) - row.mesh.position.x) * (opts.glitchPulse ? 0.48 : 0.13);
      var rowYTarget = yTarget + (verticalFloatOn ? (isActive ? jitterY : (currentTranslation ? jitterY * 0.78 : jitterY * 0.24)) : 0);
      var rowYStep = (rowYTarget - row.mesh.position.y) * ease;
      if (data.usesTrack && persistentPrimedTrack) {
        var continuousRowMaxRowsPerFrame = 0.66;
        var continuousRowMaxStepWorld = continuousTrackSlotStep * lineStepWorld * continuousRowMaxRowsPerFrame;
        rowYStep = clampRange(rowYStep, -continuousRowMaxStepWorld, continuousRowMaxStepWorld);
      }
      row.mesh.position.y += rowYStep;
      row.mesh.position.z += (zTarget - row.mesh.position.z) * ease;
      row.mesh.scale.setScalar(row.mesh.scale.x + (scaleTarget - row.mesh.scale.x) * ease);
      row.mesh.renderOrder = isActive ? (renderBase + 0.40) : (row.isTranslation ? (renderBase + 0.05 + (currentTranslation ? 0.34 : translationFocus * 0.30)) : (renderBase - 0.40 - Math.min(5.5, abs) * 0.015));
    }
    if (row.mat && row.mat.uniforms) {
      if (row.mat.uniforms.uOpacity) {
        var lineOpacityTarget = data.usesTrack && (initialTextRevealPending || !lineLayerVisible || !row.renderLineUploaded) ? 0 : target * depthFade;
        if (initialTextRevealPending) row.mat.uniforms.uOpacity.value = 0;
        else {
          row.mat.uniforms.uOpacity.value += (lineOpacityTarget - row.mat.uniforms.uOpacity.value) * ease;
          if (trackTargetJustCommitted && lineOpacityTarget > 0.001 && row.renderLineUploaded && row.mat.uniforms.uOpacity.value < 0.004) {
            row.mat.uniforms.uOpacity.value = Math.min(lineOpacityTarget, 0.004);
          }
        }
      }
      if (row.mat.uniforms.uProgress) row.mat.uniforms.uProgress.value = isActive ? shownProgress : 0;
      if (row.mat.uniforms.uActiveMix) {
        var activeMixTarget = isActive ? 1 : 0;
        row.mat.uniforms.uActiveMix.value += (activeMixTarget - row.mat.uniforms.uActiveMix.value) * (isActive ? 0.34 : 0.62);
        if (!isActive && row.mat.uniforms.uActiveMix.value < 0.015) row.mat.uniforms.uActiveMix.value = 0;
      }
      if (row.mat.uniforms.uSolar && !isActive) {
        row.mat.uniforms.uSolar.value += (0 - row.mat.uniforms.uSolar.value) * 0.48;
        if (row.mat.uniforms.uSolar.value < 0.003) row.mat.uniforms.uSolar.value = 0;
      }
      if (row.mat.uniforms.uGlitchBurst && opts.glitchPulse) row.mat.uniforms.uGlitchBurst.value = isActive ? opts.glitchPulse : opts.glitchPulse * 0.35;
    } else if (row.mat) {
      var fallbackLineOpacityTarget = data.usesTrack && (initialTextRevealPending || !lineLayerVisible || !row.renderLineUploaded) ? 0 : target * depthFade;
      if (initialTextRevealPending) row.mat.opacity = 0;
      else {
        row.mat.opacity += (fallbackLineOpacityTarget - row.mat.opacity) * ease;
        if (trackTargetJustCommitted && fallbackLineOpacityTarget > 0.001 && row.renderLineUploaded && row.mat.opacity < 0.004) {
          row.mat.opacity = Math.min(fallbackLineOpacityTarget, 0.004);
        }
      }
    }
    if (row.readability) {
      row.readability.position.x += ((isActive ? jitterX * 0.46 : (currentTranslation ? jitterX * 0.40 : jitterX * 0.16)) - row.readability.position.x) * (opts.glitchPulse ? 0.42 : 0.12);
      if (data.usesTrack && persistentPrimedTrack && row.mesh) row.readability.position.y = row.mesh.position.y;
      else row.readability.position.y += (yTarget + (verticalFloatOn ? (isActive ? jitterY * 0.40 : (currentTranslation ? jitterY * 0.34 : jitterY * 0.12)) : 0) - row.readability.position.y) * ease;
      row.readability.position.z += (zTarget - 0.012 - row.readability.position.z) * ease;
      row.readability.scale.setScalar(row.readability.scale.x + (scaleTarget - row.readability.scale.x) * ease);
      row.readability.renderOrder = row.mesh ? row.mesh.renderOrder - 0.04 : (row.isTranslation ? renderBase : renderBase - 0.45);
    }
    if (row.readabilityMat) {
      var readabilityMix = row.isTranslation ? (0.46 + translationFocus * 0.18) : (isActive ? 0.74 : 0.52);
      if (backdropAdapt > 0.001) {
        readabilityMix = Math.max(readabilityMix, row.isTranslation
          ? (0.54 + backdropAdapt * 0.10)
          : (0.60 + backdropAdapt * 0.12));
      }
      if (readabilityBackdropColor) setLyricTextureMaterialColor(row.readabilityMat, readabilityBackdropColor);
      else if (lyricReadabilityLightColor) setLyricTextureMaterialColor(row.readabilityMat, lyricReadabilityLightColor);
      var readabilityBoost = 1 + backdropAdapt * (row.isTranslation ? 0.66 : 0.78);
      var readabilityOpacity = getLyricTextureMaterialOpacity(row.readabilityMat);
      var readabilityOpacityTarget = !data.usesTrack || (readabilityLayerVisible && row.renderReadabilityUploaded)
        ? target * readability * readabilityMix * readabilityBoost * depthFade
        : 0;
      setLyricTextureMaterialOpacity(row.readabilityMat, initialTextRevealPending ? 0 : readabilityOpacity + (readabilityOpacityTarget - readabilityOpacity) * ease);
    }
    if (row.glow) {
      var glowJitterX = isActive ? jitterX : (currentTranslation ? jitterX * 0.72 : (translationGlowFocus > 0.001 ? jitterX * 0.34 * translationGlowFocus : 0));
      var glowJitterY = verticalFloatOn ? (isActive ? jitterY * 0.92 : (currentTranslation ? jitterY * 0.64 : (translationGlowFocus > 0.001 ? jitterY * 0.30 * translationGlowFocus : 0))) : 0;
      var glowEase = motionAnchor ? Math.max(ease, 0.46) : Math.max(ease, 0.22);
      var glowTargetX = row.mesh ? row.mesh.position.x : glowJitterX;
      var glowTargetY = row.mesh ? row.mesh.position.y : (yTarget + glowJitterY);
      var glowTargetZ = row.mesh ? (row.mesh.position.z - 0.030) : (zTarget - 0.030);
      var glowTargetScale = row.mesh ? row.mesh.scale.x : scaleTarget;
      var glowLockedToText = !!row.mesh && (isActive || currentTranslation || translationGlowFocus > 0.001);
      if ((data.usesTrack && persistentPrimedTrack) || previewMotionLock || glowLockedToText) {
        row.glow.position.set(glowTargetX, glowTargetY, glowTargetZ);
        row.glow.scale.setScalar(glowTargetScale);
      } else {
        row.glow.position.x += (glowTargetX - row.glow.position.x) * (opts.glitchPulse ? 0.52 : Math.max(glowEase, 0.26));
        row.glow.position.y += (glowTargetY - row.glow.position.y) * glowEase;
        row.glow.position.z += (glowTargetZ - row.glow.position.z) * glowEase;
        row.glow.scale.setScalar(row.glow.scale.x + (glowTargetScale - row.glow.scale.x) * glowEase);
      }
      row.glow.renderOrder = row.isTranslation ? (renderBase - 0.02) : (renderBase - 0.52);
    }
    if (row.glowMat) {
      var glowOpacityTarget = isActive
        ? target * rowGlow * (1 + rowGlowBeat * 0.46) * depthFade
        : (row.isTranslation ? target * rowGlow * (currentTranslation ? (0.46 + rowGlowBeat * 0.08) : (0.30 + rowGlowBeat * 0.06) * translationGlowFocus) * depthFade : 0);
      if (backdropAdapt > 0.001) glowOpacityTarget *= (1 - backdropAdapt * 0.30);
      if (data.usesTrack && (!glowLayerVisible || !row.renderGlowUploaded)) glowOpacityTarget = 0;
      var glowOpacity = getLyricTextureMaterialOpacity(row.glowMat);
      var nextGlowOpacity = glowOpacity + (glowOpacityTarget - glowOpacity) * (glowOpacityTarget > glowOpacity ? 0.20 : 0.34);
      if (!isActive && nextGlowOpacity < 0.004) nextGlowOpacity = 0;
      setLyricTextureMaterialOpacity(row.glowMat, initialTextRevealPending ? 0 : nextGlowOpacity);
    }
  }
  registerLyricQualityCandidates(data, lyricQualityCandidates, lyricQualityTier, opts.qualityRootPriority, qualityBuildDeferred);
  var deferQualityCommit = lyricQualityState.deferFinalize;
  if (deferQualityCommit && renderRevealCandidates.length) {
    for (var deferredRevealIndex = 0; deferredRevealIndex < renderRevealCandidates.length; deferredRevealIndex++) {
      var deferredReveal = renderRevealCandidates[deferredRevealIndex];
      if (!deferredReveal || !deferredReveal.quality) continue;
      registerLyricQualityCommitCandidate(data, deferredReveal.row, (Number(opts.qualityRootPriority) || 0) + deferredReveal.priority);
    }
  }
  if (deferQualityCommit && lyricQualityCandidates.length) {
    for (var deferredPrewarmIndex = 0; deferredPrewarmIndex < lyricQualityCandidates.length; deferredPrewarmIndex++) {
      var deferredPrewarm = lyricQualityCandidates[deferredPrewarmIndex];
      if (!deferredPrewarm || !deferredPrewarm.row || !deferredPrewarm.row.renderLineUploaded || !deferredPrewarm.row.qualityPendingTexture) continue;
      registerLyricQualityCommitCandidate(data, deferredPrewarm.row, (Number(opts.qualityRootPriority) || 0) + 240 + deferredPrewarm.priority);
    }
  }
  if (!deferQualityCommit) finalizeLyricQualitySelectionFrame();
  if (renderRevealCandidates.length) {
    renderRevealCandidates.sort(function (a, b) { return a.priority - b.priority; });
    for (var revealIndex = 0; revealIndex < renderRevealCandidates.length; revealIndex++) {
      var reveal = renderRevealCandidates[revealIndex];
      if (reveal.quality && deferQualityCommit) continue;
      if (!consumeLyricRenderUploadFrameBudget()) break;
      if (reveal.quality) {
        commitLyricRowQuality(reveal.row);
        continue;
      }
      reveal.row[reveal.flag] = true;
      reveal.mesh.visible = true;
    }
  }
  updateLyricQualityStats(lyricQualityTier);
  if (initialTextRevealPending) {
    var initialTextRows = 0;
    var initialTextRowsReady = true;
    for (var readyIndex = 0; readyIndex < data.rowLayers.length; readyIndex++) {
      var readyRow = data.rowLayers[readyIndex];
      if (!readyRow || !readyRow.mesh || !readyRow.renderWindowActive) continue;
      initialTextRows += 1;
      if (!readyRow.renderLineUploaded) initialTextRowsReady = false;
    }
    if (initialTextRows > 0 && initialTextRowsReady) {
      data.renderInitialTextReady = true;
      data.renderInitialTextReadyAt = nowMs;
      if (!opts.initialRevealReflow) {
        var revealOpts = {};
        for (var revealOptKey in opts) revealOpts[revealOptKey] = opts[revealOptKey];
        revealOpts.initialRevealReflow = true;
        updateLyricRowLayers(data, revealOpts);
        return;
      }
    }
  }
  if (activeRow && activeRow.mat && activeRow.mat.uniforms) {
    data.textMat = activeRow.mat;
    data.activeRowMesh = activeRow.mesh;
  }
}
