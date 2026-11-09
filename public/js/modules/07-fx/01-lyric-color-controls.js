function buildLyricColorControls() {
  var grid = document.getElementById('lyric-color-grid');
  if (!grid) return;
  var html = '<button class="lyric-swatch auto" type="button" data-auto="1" onclick="setLyricColorAuto()" title="封面取色">AUTO</button>';
  html += lyricColorPresets.map(function (p, i) {
    return '<button class="lyric-swatch" type="button" data-color="' + p.color + '" onclick="setLyricColorPreset(' + i + ')" title="' + escHtml(p.name) + '" style="--swatch:' + p.color + '"></button>';
  }).join('');
  grid.innerHTML = html;
}
function lyricControlPalette() {
  var source = fx.lyricColorMode === 'custom'
    ? lyricPaletteFromHex(fx.lyricColor)
    : ((stageLyrics && (stageLyrics.coverPalette || stageLyrics.palette)) || null);
  return typeof effectiveLyricPalette === 'function' ? effectiveLyricPalette(source) : (source || {});
}
function updateLyricColorControls() {
  var picker = document.getElementById('lyric-color-picker');
  var value = document.getElementById('lyric-color-value');
  var autoBtn = document.getElementById('lyric-auto-btn');
  var color = normalizeHexColor(fx.lyricColor);
  var pal = lyricControlPalette();
  var tone = fx.lyricColorMode === 'custom'
    ? color
    : lyricPaletteColorToHex(pal.primary || pal.secondary || color, '#a9b8c8', 0.38);
  if (picker) picker.value = tone;
  if (value) value.textContent = fx.lyricColorMode === 'custom' ? color.toUpperCase() : '封面取色';
  if (autoBtn) autoBtn.classList.toggle('active', fx.lyricColorMode !== 'custom');
  document.querySelectorAll('.lyric-swatch').forEach(function (btn) {
    var isAuto = btn.dataset.auto === '1';
    var isColor = normalizeHexColor(btn.dataset.color || '') === color;
    btn.classList.toggle('active', isAuto ? fx.lyricColorMode !== 'custom' : (fx.lyricColorMode === 'custom' && isColor));
  });
}
function updateLyricHighlightControls() {
  var picker = document.getElementById('lyric-highlight-picker');
  var value = document.getElementById('lyric-highlight-value');
  var autoBtn = document.getElementById('lyric-highlight-auto-btn');
  var color = normalizeHexColor(fx.lyricHighlightColor);
  var pal = lyricControlPalette();
  var tone = fx.lyricHighlightMode === 'custom'
    ? color
    : lyricPaletteColorToHex(pal.highlight || pal.primary || color, '#fff0b8', 0.48);
  if (picker) picker.value = tone;
  if (value) value.textContent = fx.lyricHighlightMode === 'custom' ? color.toUpperCase() : '跟随歌词';
  if (autoBtn) autoBtn.classList.toggle('active', fx.lyricHighlightMode !== 'custom');
}
function lyricPaletteColorToHex(value, fallback, minLum) {
  if (typeof lyricThreeColor === 'function') {
    try {
      var c = lyricThreeColor(value, fallback || '#9db8cf', minLum == null ? 0.36 : minLum);
      if (c && c.getHexString) return '#' + c.getHexString();
    } catch (e) { }
  }
  return normalizeHexColor(value || fallback || '#9db8cf', fallback || '#9db8cf');
}
function lyricGlowControlTone() {
  var pal = lyricControlPalette();
  var glow = fx.lyricGlowLinked === false
    ? fx.lyricGlowColor
    : (pal.glowColor || pal.secondary || pal.highlight || pal.primary || fx.lyricGlowColor);
  return lyricPaletteColorToHex(glow, '#9db8cf', fx.lyricGlowLinked === false ? 0.36 : 0.40);
}
function updateLyricGlowControls() {
  var row = document.getElementById('lyric-glow-row');
  var picker = document.getElementById('lyric-glow-picker');
  var value = document.getElementById('lyric-glow-value');
  var linkBtn = document.getElementById('lyric-glow-link-btn');
  var glowEnableBtn = document.getElementById('lyric-glow-enable-btn');
  var glowBeatBtn = document.getElementById('lyric-glow-beat-btn');
  var linked = fx.lyricGlowLinked !== false;
  var color = normalizeHexColor(fx.lyricGlowColor || '#9db8cf');
  var tone = lyricGlowControlTone();
  if (picker) picker.value = linked ? tone : color;
  if (row) {
    row.classList.toggle('linked', linked);
    row.style.setProperty('--lyric-glow-color', tone);
  }
  if (picker) picker.style.setProperty('--lyric-glow-color', tone);
  if (value) {
    value.textContent = linked ? '跟随高亮' : color.toUpperCase();
    value.style.setProperty('--lyric-glow-color', tone);
  }
  if (linkBtn) {
    linkBtn.classList.toggle('active', linked);
    linkBtn.style.setProperty('--lyric-glow-color', tone);
    linkBtn.textContent = linked ? '链接' : '独立';
    linkBtn.title = linked ? '点击后单独设置溢光颜色' : '点击后让溢光跟随高亮';
  }
  [glowEnableBtn, glowBeatBtn].forEach(function (btn) {
    if (btn) btn.style.setProperty('--lyric-glow-color', tone);
  });
  if (glowEnableBtn) {
    glowEnableBtn.classList.toggle('active', !!fx.lyricGlow);
    glowEnableBtn.title = fx.lyricGlow ? '关闭歌词背后的溢光层' : '开启歌词背后的溢光层';
  }
  if (glowBeatBtn) {
    glowBeatBtn.classList.toggle('active', !!fx.lyricGlowBeat);
    glowBeatBtn.title = fx.lyricGlowBeat ? '后层溢光正在跟随鼓点' : '让后层溢光跟随鼓点';
  }
}
