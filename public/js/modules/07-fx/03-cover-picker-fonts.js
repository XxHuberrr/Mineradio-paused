var coverColorPickerState = { target: 'visualTint', canvas: null };
function currentCoverPickerCanvas() {
  if (coverPickerCanvas && coverPickerCanvas.getContext) return coverPickerCanvas;
  if (coverTex && coverTex.image && coverTex.image.getContext) return coverTex.image;
  return null;
}
function coverPickerSwatchColors() {
  var pal = stageLyrics.coverPalette || stageLyrics.palette || {};
  var list = [pal.primary, pal.secondary, pal.highlight, fx.visualTintColor, fx.uiAccentColor, fx.homeAccentColor]
    .map(function (c) { return normalizeHexColor(c || '', ''); })
    .filter(function (c) { return /^#[0-9a-f]{6}$/i.test(c); });
  var seen = {};
  return list.filter(function (c) {
    if (seen[c]) return false;
    seen[c] = true;
    return true;
  }).slice(0, 5);
}
function setCoverPickerPreview(hex) {
  var preview = document.getElementById('cover-color-preview');
  if (preview) preview.style.setProperty('--picked', normalizeHexColor(hex || '#9db8cf'));
}
function renderCoverPickerSwatches() {
  var wrap = document.getElementById('cover-color-swatches');
  if (!wrap) return;
  var colors = coverPickerSwatchColors();
  wrap.innerHTML = colors.map(function (c) {
    return '<button type="button" style="--c:' + c + '" title="' + c.toUpperCase() + '" onclick="applyCoverPickerColor(\'' + c + '\')"></button>';
  }).join('');
}
function openCoverColorPicker(target) {
  target = target || 'visualTint';
  var pop = document.getElementById('cover-color-pop');
  var art = document.getElementById('cover-color-art');
  var hint = document.getElementById('cover-color-hint');
  if (pop && pop.classList.contains('show') && coverColorPickerState.target === target) {
    closeCoverColorPicker();
    return;
  }
  var cv = currentCoverPickerCanvas();
  coverColorPickerState.target = target;
  coverColorPickerState.canvas = cv;
  if (!pop || !art) return;
  if (!cv) {
    setVisualTintAuto();
    closeCoverColorPicker();
    showToast('暂无封面，已切换为自动封面取色');
    return;
  }
  var imgSrc = '';
  try { imgSrc = cv.toDataURL('image/jpeg', 0.84); } catch (e) { }
  if (!imgSrc && currentCoverSource && currentCoverSource.src) imgSrc = currentCoverSource.src;
  art.style.backgroundImage = imgSrc ? 'url("' + cssImageUrl(imgSrc) + '")' : '';
  setCoverPickerPreview(fx.visualTintColor || (stageLyrics.coverPalette && stageLyrics.coverPalette.primary) || '#9db8cf');
  renderCoverPickerSwatches();
  if (hint) hint.textContent = '点击专辑封面任意位置取色，或使用下方推荐色。';
  pop.classList.add('show');
  placeFxFloatingPanel(pop, document.getElementById('visual-tint-auto-btn') || document.getElementById('visual-tint-picker') || art, { gap: 12, pad: 14 });
}
function closeCoverColorPicker() {
  var pop = document.getElementById('cover-color-pop');
  if (pop) pop.classList.remove('show');
  hideCoverColorLoupe();
}
function applyCoverPickerColor(hex) {
  hex = normalizeHexColor(hex || '#9db8cf');
  setCoverPickerPreview(hex);
  if (coverColorPickerState.target === 'visualTint') {
    setVisualTintCustom(hex, true);
    showToast('视觉主色: ' + hex.toUpperCase());
  }
  closeCoverColorPicker();
}
function moveCoverColorLoupe(e) {
  var cv = coverColorPickerState.canvas || currentCoverPickerCanvas();
  var loupe = document.getElementById('cover-color-loupe');
  var art = document.getElementById('cover-color-art');
  if (!cv || !loupe || !art) return;
  var rect = art.getBoundingClientRect();
  var x = clampRange((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  var y = clampRange((e.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
  var imgSrc = '';
  try { imgSrc = cv.toDataURL('image/jpeg', 0.84); } catch (err) { }
  if (imgSrc) {
    loupe.style.backgroundImage = 'url("' + cssImageUrl(imgSrc) + '")';
    loupe.style.backgroundSize = '680% 680%';
    loupe.style.backgroundPosition = (x * 100).toFixed(2) + '% ' + (y * 100).toFixed(2) + '%';
  }
  loupe.style.left = Math.min(window.innerWidth - 128, e.clientX + 18) + 'px';
  loupe.style.top = Math.min(window.innerHeight - 128, e.clientY + 18) + 'px';
  loupe.classList.add('show');
}
function hideCoverColorLoupe() {
  var loupe = document.getElementById('cover-color-loupe');
  if (loupe) loupe.classList.remove('show');
}
function pickCoverColorFromArt(e) {
  var cv = coverColorPickerState.canvas || currentCoverPickerCanvas();
  if (!cv || !cv.getContext) return;
  var rect = e.currentTarget.getBoundingClientRect();
  var x = clampRange((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
  var y = clampRange((e.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
  var sx = Math.max(0, Math.min(cv.width - 1, Math.floor(x * cv.width)));
  var sy = Math.max(0, Math.min(cv.height - 1, Math.floor(y * cv.height)));
  try {
    var data = cv.getContext('2d').getImageData(sx, sy, 1, 1).data;
    applyCoverPickerColor(rgbToHexColor(data[0], data[1], data[2]));
  } catch (err) {
    showToast('封面取色不可用，已保留自动取色');
    setVisualTintAuto();
    closeCoverColorPicker();
  }
}
function updateLyricFontControls() {
  renderCustomLyricFontButtons();
  document.querySelectorAll('#lyric-font-grid button').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.font === normalizeLyricFontKey(fx.lyricFont));
  });
}
function setLyricFont(key) {
  fx.lyricFont = normalizeLyricFontKey(key);
  var customFont = customLyricFontRecordForKey(fx.lyricFont);
  if (customFont) {
    registerCustomLyricFont(customFont).then(function (ok) {
      if (ok && normalizeLyricFontKey(fx.lyricFont) === customLyricFontKey(customFont.id)) {
        refreshCurrentLyricStyle();
        pushDesktopLyricsState(true);
      }
    });
  }
  updateLyricFontControls();
  refreshCurrentLyricStyle();
  saveLyricLayout({ user: true, reason: 'lyricFont' });
  pushDesktopLyricsState(true);
  showToast('歌词字体已切换');
}
function renderCustomLyricFontButtons() {
  var grid = document.getElementById('lyric-font-grid');
  if (!grid) return;
  grid.querySelectorAll('button[data-custom-font="1"]').forEach(function (btn) { btn.remove(); });
  var uploadBtn = grid.querySelector('.font-upload-btn');
  (customLyricFonts || []).forEach(function (font) {
    var key = customLyricFontKey(font && font.id);
    if (!key) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.font = key;
    btn.dataset.customFont = '1';
    btn.title = font.name + ' / 点右侧小叉删除';
    btn.style.fontFamily = lyricFontStackForKey(key);
    btn.innerHTML = '<span>' + escHtml(font.name) + '</span><span class="font-remove" title="删除字体" onclick="removeCustomLyricFont(event,\'' + font.id + '\')">×</span>';
    btn.onclick = function () { setLyricFont(key); };
    if (uploadBtn) grid.insertBefore(btn, uploadBtn);
    else grid.appendChild(btn);
  });
}
function triggerLyricFontUpload() {
  var input = document.getElementById('lyric-font-input');
  if (input) input.click();
}
function isSupportedLyricFontFile(file) {
  if (!file) return false;
  var name = String(file.name || '').toLowerCase();
  return /\.(ttf|otf|woff|woff2)$/.test(name) || /^font\/(ttf|otf|woff2?)$/i.test(file.type || '');
}
function readFileAsDataUrl(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(String(reader.result || '')); };
    reader.onerror = function () { reject(reader.error || new Error('FONT_READ_FAILED')); };
    reader.readAsDataURL(file);
  });
}
async function handleLyricFontFiles(files) {
  files = Array.from(files || []);
  var file = files.find(isSupportedLyricFontFile);
  if (!file) {
    showToast('没有找到可用字体文件');
    return;
  }
  if (file.size > CUSTOM_LYRIC_FONT_MAX_BYTES) {
    showToast('字体文件太大，建议小于 3.6MB');
    return;
  }
  try {
    var dataUrl = await readFileAsDataUrl(file);
    var id = ('f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).replace(/[^a-z0-9]/gi, '').slice(0, 24);
    var record = normalizeCustomLyricFontRecord({
      id: id,
      name: normalizeCustomLyricFontName(file.name),
      family: 'MineradioCustomLyricFont-' + id,
      dataUrl: dataUrl,
      size: file.size,
      savedAt: Date.now()
    });
    if (!record) {
      showToast('字体文件读取失败');
      return;
    }
    var loaded = await registerCustomLyricFont(record);
    if (!loaded) {
      showToast('字体加载失败，请换一个字体文件');
      return;
    }
    customLyricFonts = [record].concat((customLyricFonts || []).filter(function (item) {
      return item && item.id !== record.id && item.name !== record.name;
    })).slice(0, CUSTOM_LYRIC_FONT_MAX_COUNT);
    var saved = saveCustomLyricFonts();
    updateLyricFontControls();
    setLyricFont(customLyricFontKey(record.id));
    showToast(saved ? '歌词字体已上传' : '字体已临时加载，文件过大无法保存');
  } catch (e) {
    console.warn('[LyricFont] upload failed', e);
    showToast('字体上传失败');
  }
}
function removeCustomLyricFont(event, id) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  id = String(id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 32);
  if (!id) return;
  var key = customLyricFontKey(id);
  customLyricFonts = (customLyricFonts || []).filter(function (font) { return font && font.id !== id; });
  if (normalizeLyricFontKey(fx.lyricFont) === key || fx.lyricFont === key) fx.lyricFont = 'sans';
  saveCustomLyricFonts();
  updateLyricFontControls();
  refreshCurrentLyricStyle();
  saveLyricLayout({ user: true, reason: 'lyricFontRemove' });
  pushDesktopLyricsState(true);
  showToast('已删除上传字体');
}
function currentLyricPaletteSource() {
  return fx.lyricColorMode === 'custom'
    ? lyricPaletteFromHex(fx.lyricColor)
    : (stageLyrics.coverPalette || stageLyrics.palette);
}
function applyLyricPaletteLive(reason) {
  if (typeof setStageLyricPalette === 'function') {
    setStageLyricPalette(currentLyricPaletteSource(), { immediate: true, durationMs: 1, reason: reason || 'live' });
  }
}
function setLyricGlowLinked(linked, openPicker) {
  fx.lyricGlowLinked = linked !== false;
  if (!fx.lyricGlowLinked) fx.lyricGlowColor = normalizeHexColor(fx.lyricGlowColor || fx.lyricHighlightColor || '#9db8cf');
  applyLyricPaletteLive('lyricGlowLinked');
  updateLyricGlowControls();
  saveLyricLayout({ syncDisk: true, user: true, reason: 'lyricGlowLinked' });
  if (openPicker) {
    setTimeout(function () {
      var picker = document.getElementById('lyric-glow-picker');
      if (picker) picker.click();
    }, 0);
  }
}
function toggleLyricGlowLink(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  setLyricGlowLinked(fx.lyricGlowLinked === false);
}
function handleLyricGlowRowClick(e) {
  if (fx.lyricGlowLinked !== false) {
    if (e && e.preventDefault) e.preventDefault();
    setLyricGlowLinked(false, true);
  }
}
function setLyricGlowCustom(color, silent) {
  fx.lyricGlowLinked = false;
  fx.lyricGlowColor = normalizeHexColor(color || '#9db8cf');
  applyLyricPaletteLive('lyricGlowColor');
  updateLyricGlowControls();
  saveLyricLayout({ syncDisk: true, user: true, reason: 'lyricGlowColor' });
  pushDesktopLyricsState(true);
  if (!silent) showToast('溢光颜色: ' + fx.lyricGlowColor.toUpperCase());
}
function setLyricColorAuto() {
  fx.lyricColorMode = 'auto';
  setStageLyricPalette(stageLyrics.coverPalette || stageLyrics.palette, { immediate: true, durationMs: 1, reason: 'lyricColorAuto' });
  updateLyricColorControls();
  updateLyricHighlightControls();
  updateLyricGlowControls();
  saveLyricLayout({ syncDisk: true, user: true, reason: 'lyricColorAuto' });
  pushDesktopLyricsState(true);
  showToast('歌词颜色: 封面取色');
}
function setLyricColorCustom(color, silent) {
  fx.lyricColorMode = 'custom';
  fx.lyricColor = normalizeHexColor(color);
  setStageLyricPalette(lyricPaletteFromHex(fx.lyricColor), { immediate: true, durationMs: 1, reason: 'lyricColorCustom' });
  updateLyricColorControls();
  updateLyricHighlightControls();
  updateLyricGlowControls();
  saveLyricLayout({ syncDisk: true, user: true, reason: 'lyricColorCustom' });
  pushDesktopLyricsState(true);
  if (!silent) showToast('歌词颜色: ' + fx.lyricColor.toUpperCase());
}
function setLyricColorPreset(i) {
  var p = lyricColorPresets[i];
  if (!p) return;
  setLyricColorCustom(p.color);
}
function setLyricHighlightAuto() {
  fx.lyricHighlightMode = 'auto';
  applyLyricPaletteLive('lyricHighlightAuto');
  updateLyricHighlightControls();
  updateLyricGlowControls();
  saveLyricLayout({ syncDisk: true, user: true, reason: 'lyricHighlightAuto' });
  pushDesktopLyricsState(true);
  showToast('高亮颜色: 跟随歌词');
}
function setLyricHighlightCustom(color, silent) {
  fx.lyricHighlightMode = 'custom';
  fx.lyricHighlightColor = normalizeHexColor(color);
  applyLyricPaletteLive('lyricHighlightCustom');
  updateLyricHighlightControls();
  updateLyricGlowControls();
  saveLyricLayout({ syncDisk: true, user: true, reason: 'lyricHighlightCustom' });
  pushDesktopLyricsState(true);
  if (!silent) showToast('高亮颜色: ' + fx.lyricHighlightColor.toUpperCase());
}
