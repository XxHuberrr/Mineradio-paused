function normalizeStageLyricText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}
function normalizeStageLyricEntry(entry, fallbackRole) {
  if (typeof entry === 'string') entry = { text: entry };
  entry = entry || {};
  var text = normalizeStageLyricText(entry.text);
  if (!text) return null;
  var role = /^(current|prev|next|context|translation)$/.test(String(entry.role || '')) ? entry.role : (fallbackRole || 'context');
  var alpha = entry.alpha == null ? (role === 'current' ? 1 : 0.42) : clampRange(Number(entry.alpha), 0, 1);
  var scale = entry.scale == null ? (role === 'current' ? 1 : (role === 'translation' ? 0.48 : 0.86)) : clampRange(Number(entry.scale), 0.30, 1.08);
  var out = { text: text, role: role, alpha: alpha, scale: scale };
  var weightValue = Number(entry.weight);
  var lineOffsetValue = Number(entry.lineOffset);
  if (entry.weight != null && isFinite(weightValue)) out.weight = clampRange(weightValue, 500, 900);
  if (entry.lineOffset != null && isFinite(lineOffsetValue)) out.lineOffset = clampRange(lineOffsetValue, -0.58, 0.20);
  if (entry.translation) out.translation = normalizeLyricTranslationText(entry.translation);
  if (entry.translationLine) out.translationLine = true;
  if (entry.parentRole) out.parentRole = entry.parentRole;
  if (entry.parentIndex != null && isFinite(Number(entry.parentIndex))) out.parentIndex = Number(entry.parentIndex);
  if (entry.lineIndex != null && isFinite(Number(entry.lineIndex))) out.lineIndex = Number(entry.lineIndex);
  if (entry.virtualIndex != null && isFinite(Number(entry.virtualIndex))) out.virtualIndex = Number(entry.virtualIndex);
  return out;
}
function lyricEntryWeight(entry) {
  var weight = entry && entry.weight != null ? Number(entry.weight) : NaN;
  if (isFinite(weight)) return clampRange(weight, 500, 900);
  return lyricFontWeightValue();
}
function lyricEntryLineOffset(entry) {
  if (!entry || entry.lineOffset == null) return 0;
  return clampRange(Number(entry.lineOffset) || 0, -0.58, 0.20);
}
function normalizeStageLyricPayload(input) {
  var entries = [];
  var mode = normalizeLyricDisplayMode(fx && fx.lyricDisplayMode);
  var activeLine = 0;
  var key = '';
  var contextLayer = false;
  var activeLayer = false;
  var trackIndex = null;
  var trackKey = '';
  var trackEntries = null;
  var trackStart = null;
  var trackEnd = null;
  var trackLightweight = false;
  var trackTextOnly = false;
  if (input && typeof input === 'object' && Array.isArray(input.entries)) {
    mode = normalizeLyricDisplayMode(input.mode || mode);
    activeLine = Math.max(0, Number(input.activeLine) || 0);
    contextLayer = input.contextLayer === true;
    activeLayer = input.activeLayer === true;
    trackLightweight = input.trackLightweight === true;
    trackTextOnly = input.trackTextOnly === true;
    if (input.trackIndex != null && isFinite(Number(input.trackIndex))) trackIndex = Number(input.trackIndex);
    trackKey = input.trackKey || '';
    if (input.trackStart != null && isFinite(Number(input.trackStart))) trackStart = Number(input.trackStart);
    if (input.trackEnd != null && isFinite(Number(input.trackEnd))) trackEnd = Number(input.trackEnd);
    for (var i = 0; i < input.entries.length; i++) {
      var entry = normalizeStageLyricEntry(input.entries[i], i === activeLine ? 'current' : 'context');
      if (entry) entries.push(entry);
    }
    if (Array.isArray(input.trackEntries) && input.trackEntries.length) {
      trackEntries = [];
      for (var ti = 0; ti < input.trackEntries.length; ti++) {
        var trackEntry = normalizeStageLyricEntry(input.trackEntries[ti], 'context');
        if (trackEntry) trackEntries.push(trackEntry);
      }
      if (!trackEntries.length) trackEntries = null;
    }
    activeLine = Math.max(0, Math.min(entries.length - 1, activeLine));
    key = input.key || '';
  } else {
    var text = normalizeStageLyricText(input);
    if (text) entries.push({ text: text, role: 'current', alpha: 1, scale: 1 });
  }
  if (!entries.length) return null;
  var active = entries[activeLine] || entries[0];
  if (!key) key = mode + '|' + activeLine + '|' + entries.map(function (entry) { return entry.role + ':' + entry.text; }).join('\n');
  return {
    mode: mode,
    key: key,
    entries: entries,
    activeLine: activeLine,
    contextLayer: contextLayer,
    activeLayer: activeLayer,
    trackIndex: trackIndex,
    trackKey: trackKey,
    trackEntries: trackEntries,
    trackStart: trackStart,
    trackEnd: trackEnd,
    trackLightweight: trackLightweight,
    trackTextOnly: trackTextOnly,
    text: active && active.text || entries[0].text,
    combinedText: entries.map(function (entry) { return entry.text; }).join(' / ')
  };
}

function cloneStageLyricEntryForLayer(entry, overrides) {
  entry = entry || {};
  var copy = {
    text: entry.text,
    role: entry.role,
    alpha: entry.alpha,
    scale: entry.scale,
    weight: entry.weight,
    lineOffset: entry.lineOffset,
    translation: entry.translation,
    translationLine: entry.translationLine,
    parentRole: entry.parentRole,
    parentIndex: entry.parentIndex,
    lineIndex: entry.lineIndex,
    virtualIndex: entry.virtualIndex
  };
  overrides = overrides || {};
  for (var key in overrides) copy[key] = overrides[key];
  return copy;
}

function activeStageLyricPayload(payload) {
  payload = normalizeStageLyricPayload(payload);
  if (!payload) return null;
  var active = payload.entries[payload.activeLine] || payload.entries[0];
  if (!active) return null;
  var entries = [];
  if (payload.entries.length > 1) {
    for (var i = 0; i < payload.entries.length; i++) {
      var entry = payload.entries[i];
      entries.push(cloneStageLyricEntryForLayer(entry, {
        role: i === payload.activeLine ? 'current' : (entry.role || 'context'),
        alpha: i === payload.activeLine ? 1 : 0,
        scale: i === payload.activeLine ? 1 : (entry.scale || 0.86)
      }));
    }
  } else {
    entries = [cloneStageLyricEntryForLayer(active, { role: 'current', alpha: 1, scale: 1 })];
  }
  return {
    mode: payload.mode,
    key: payload.key + '|active',
    activeLine: payload.entries.length > 1 ? payload.activeLine : 0,
    activeLayer: true,
    entries: entries
  };
}

function rowBaseStageLyricPayload(payload) {
  payload = normalizeStageLyricPayload(payload);
  if (!payload || !payload.entries || !payload.entries.length) return null;
  var active = payload.entries[payload.activeLine] || payload.entries[0];
  if (active && active.translationLine) {
    for (var i = payload.activeLine - 1; i >= 0; i--) {
      if (payload.entries[i] && !payload.entries[i].translationLine) {
        active = payload.entries[i];
        break;
      }
    }
  }
  if (!active || active.translationLine) {
    for (var j = 0; j < payload.entries.length; j++) {
      if (payload.entries[j] && !payload.entries[j].translationLine) {
        active = payload.entries[j];
        break;
      }
    }
  }
  if (!active) return null;
  return {
    mode: 'single',
    key: (payload.key || '') + '|row-base',
    activeLine: 0,
    entries: [cloneStageLyricEntryForLayer(active, {
      role: 'current',
      alpha: 1,
      scale: 1,
      lineOffset: 0,
      translationLine: false,
      parentRole: '',
      parentIndex: undefined,
      virtualIndex: 0
    })]
  };
}

function contextStageLyricPayload(payload) {
  payload = normalizeStageLyricPayload(payload);
  if (!payload || !payload.entries || payload.entries.length < 2) return null;
  var entries = [];
  var hasContext = false;
  for (var i = 0; i < payload.entries.length; i++) {
    var entry = payload.entries[i];
    if (i === payload.activeLine) {
      entries.push(cloneStageLyricEntryForLayer(entry, { alpha: 0 }));
      continue;
    }
    hasContext = true;
    if (entry.translationLine) {
      entries.push(cloneStageLyricEntryForLayer(entry, {
        alpha: clampRange(entry.alpha == null ? lyricContextOpacityValue() * 0.58 : entry.alpha, 0, 0.72),
        scale: clampRange(entry.scale == null ? lyricTranslationScaleValue() * 0.88 : entry.scale, 0.42, 1.12),
        weight: entry.weight == null ? 650 : entry.weight,
        lineOffset: entry.lineOffset == null ? -0.20 : entry.lineOffset
      }));
      continue;
    }
    entries.push(cloneStageLyricEntryForLayer(entry, {
      alpha: clampRange(entry.alpha == null ? lyricContextOpacityValue() : entry.alpha, 0, 1),
      scale: clampRange(entry.scale == null ? 0.86 : entry.scale, 0.72, 0.98)
    }));
  }
  if (!hasContext) return null;
  return {
    mode: payload.mode,
    key: payload.key + '|context',
    activeLine: payload.activeLine,
    contextLayer: true,
    entries: entries
  };
}
