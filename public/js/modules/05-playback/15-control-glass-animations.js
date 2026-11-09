var controlGlassState = {
  key: '',
  searchBoxKey: '',
  searchPillKey: '',
  accountPillKey: '',
  dwmGeometryKey: '',
  dwmGeometryLastAt: 0,
  dwmGeometryTimer: 0,
  dwmGeometryAnimationToken: 0
};
var CONTROL_GLASS_BASE_SHIFT_X = -90;
var CONTROL_GLASS_CHROMA_MAX_SPREAD = 22;
function normalizeControlGlassChromaticOffset(value) {
  var n = Number(value);
  if (!isFinite(n)) n = fxDefaults.controlGlassChromaticOffset;
  return clampRange(n, 30, 140);
}
function formatGlassFilterNumber(value) {
  var n = Math.round((Number(value) || 0) * 100) / 100;
  if (Math.abs(n) < 0.005) n = 0;
  return String(n);
}
function setControlGlassChannelOffset(filter, result, dx, dy) {
  var node = filter && filter.querySelector ? filter.querySelector('feOffset[result="' + result + '"]') : null;
  if (!node) return;
  node.setAttribute('dx', formatGlassFilterNumber(dx));
  node.setAttribute('dy', formatGlassFilterNumber(dy));
}
function applyControlGlassChromaticOffsetToFilter(filter, baseShiftX, maxSpread, verticalFactor) {
  if (!filter || !fx) return;
  var chroma = fx.controlGlassChromaticOffset / 140;
  var spread = maxSpread * chroma;
  var verticalSpread = spread * (verticalFactor == null ? 0.08 : verticalFactor);
  setControlGlassChannelOffset(filter, 'dispRedShifted', baseShiftX - spread, -verticalSpread);
  setControlGlassChannelOffset(filter, 'dispGreenShifted', baseShiftX, 0);
  setControlGlassChannelOffset(filter, 'dispBlueShifted', baseShiftX + spread, verticalSpread);
}
function applyControlGlassChromaticOffset() {
  if (!fx) return;
  fx.controlGlassChromaticOffset = normalizeControlGlassChromaticOffset(fx.controlGlassChromaticOffset);
  applyControlGlassChromaticOffsetToFilter(
    document.getElementById('mineradio-control-glass-filter'),
    CONTROL_GLASS_BASE_SHIFT_X,
    CONTROL_GLASS_CHROMA_MAX_SPREAD,
    0.08
  );
}
function supportsControlGlassSvgFilter() {
  try {
    var ua = navigator.userAgent || '';
    if ((/Safari/.test(ua) && !/Chrome/.test(ua)) || /Firefox/.test(ua)) return false;
    var div = document.createElement('div');
    div.style.backdropFilter = 'url(#mineradio-control-glass-filter)';
    return div.style.backdropFilter !== '';
  } catch (e) {
    return false;
  }
}
function generateControlGlassDisplacementMap(width, height, radius) {
  width = Math.max(240, Math.round(width || 400));
  height = Math.max(48, Math.round(height || 92));
  radius = Math.max(12, Math.round(radius || 50));
  var borderWidth = 0.07;
  var edge = Math.min(width, height) * (borderWidth * 0.5);
  var innerW = Math.max(1, width - edge * 2);
  var innerH = Math.max(1, height - edge * 2);
  var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<linearGradient id="glass-red" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient>' +
    '<linearGradient id="glass-blue" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient>' +
    '</defs>' +
    '<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="black"/>' +
    '<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="' + radius + '" fill="url(#glass-red)"/>' +
    '<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="' + radius + '" fill="url(#glass-blue)" style="mix-blend-mode:difference"/>' +
    '<rect x="' + edge.toFixed(2) + '" y="' + edge.toFixed(2) + '" width="' + innerW.toFixed(2) + '" height="' + innerH.toFixed(2) + '" rx="' + radius + '" fill="hsl(0 0% 50% / 1)" style="filter:blur(11px)"/>' +
    '</svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
function generateAccountPillGlassDisplacementMap(width, height, radius, minWidth, minHeight) {
  minWidth = Math.max(1, Math.round(minWidth || 180));
  minHeight = Math.max(1, Math.round(minHeight || 44));
  width = Math.max(minWidth, Math.round(width || 220));
  height = Math.max(minHeight, Math.round(height || 44));
  radius = Math.max(20, Math.round(radius || height / 2));
  var edge = Math.min(width, height) * 0.09;
  var innerW = Math.max(1, width - edge * 2);
  var innerH = Math.max(1, height - edge * 2);
  var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<linearGradient id="account-x" x1="0%" y1="0%" x2="100%" y2="0%">' +
    '<stop offset="0%" stop-color="rgb(112,128,128)"/>' +
    '<stop offset="13%" stop-color="rgb(150,128,128)"/>' +
    '<stop offset="42%" stop-color="rgb(128,128,128)"/>' +
    '<stop offset="72%" stop-color="rgb(120,128,128)"/>' +
    '<stop offset="100%" stop-color="rgb(144,128,128)"/>' +
    '</linearGradient>' +
    '<filter id="account-soft" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>' +
    '</defs>' +
    '<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="rgb(128,128,128)"/>' +
    '<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="' + radius + '" fill="url(#account-x)" filter="url(#account-soft)" opacity=".82"/>' +
    '<rect x="' + edge.toFixed(2) + '" y="' + edge.toFixed(2) + '" width="' + innerW.toFixed(2) + '" height="' + innerH.toFixed(2) + '" rx="' + Math.max(1, radius - edge).toFixed(2) + '" fill="rgb(128,128,128)" opacity=".36"/>' +
    '</svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
function generateSearchBoxGlassDisplacementMap(width, height, radius) {
  return generateControlGlassDisplacementMap(width, height, radius);
}
function generateSearchPillGlassDisplacementMap(width, height, radius) {
  return generateControlGlassDisplacementMap(width, height, radius);
}
function glassImageHasHref(img) {
  if (!img) return false;
  var href = img.getAttribute('href') || '';
  try { href = href || img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || ''; } catch (e) { }
  return !!href;
}
function setSearchGlassReady(ready) {
  var on = !!ready;
  document.documentElement.classList.toggle('search-glass-ready', on);
  if (on) document.documentElement.classList.remove('search-glass-priming', 'search-glass-fallback');
  var area = document.getElementById('search-area');
  if (area) {
    area.classList.toggle('search-glass-ready', on);
    if (on) area.classList.remove('search-glass-priming', 'search-glass-fallback');
  }
}
function setSearchGlassPriming(priming) {
  var on = !!priming;
  document.documentElement.classList.toggle('search-glass-priming', on);
  var area = document.getElementById('search-area');
  if (area) area.classList.toggle('search-glass-priming', on);
}
function setSearchGlassFallback(fallback) {
  var on = !!fallback;
  document.documentElement.classList.toggle('search-glass-fallback', on);
  var area = document.getElementById('search-area');
  if (area) area.classList.toggle('search-glass-fallback', on);
}
function queueSearchGlassReadyAfterPaint(force) {
  if (!glassImageHasHref(document.getElementById('search-box-glass-map'))) {
    controlGlassState.searchReadyToken = (controlGlassState.searchReadyToken || 0) + 1;
    setSearchGlassReady(false);
    setSearchGlassPriming(false);
    return false;
  }
  if (!force && document.documentElement.classList.contains('search-glass-ready')) return true;
  if (document.documentElement.classList.contains('search-glass-priming')) return false;
  var token = (controlGlassState.searchReadyToken || 0) + 1;
  controlGlassState.searchReadyToken = token;
  setSearchGlassFallback(false);
  setSearchGlassReady(false);
  setSearchGlassPriming(true);
  var frames = 3;
  function waitFrame() {
    if (controlGlassState.searchReadyToken !== token) return;
    if (!glassImageHasHref(document.getElementById('search-box-glass-map'))) {
      setSearchGlassReady(false);
      setSearchGlassPriming(false);
      return;
    }
    frames -= 1;
    if (frames <= 0) {
      setSearchGlassReady(true);
      return;
    }
    requestAnimationFrame(waitFrame);
  }
  requestAnimationFrame(waitFrame);
  return false;
}
function syncSearchGlassReadyState(waitForPaint, forcePaint) {
  var ready = glassImageHasHref(document.getElementById('search-box-glass-map'));
  if (ready && waitForPaint) return queueSearchGlassReadyAfterPaint(forcePaint);
  if (!ready) setSearchGlassPriming(false);
  setSearchGlassReady(ready);
  return ready;
}
function updateGlassDisplacementMapForElement(el, img, stateKey, generator) {
  if (!el || !img) return false;
  var rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  var radius = parseFloat(getComputedStyle(el).borderRadius) || 24;
  var key = Math.round(rect.width) + 'x' + Math.round(rect.height) + ':' + Math.round(radius);
  if (key === controlGlassState[stateKey] && glassImageHasHref(img)) return true;
  controlGlassState[stateKey] = key;
  var href = (generator || generateControlGlassDisplacementMap)(rect.width, rect.height, radius);
  img.setAttribute('href', href);
  try { img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href); } catch (e) { }
  return true;
}
function updateControlGlassDisplacementMap() {
  return updateGlassDisplacementMapForElement(
    document.getElementById('bottom-bar'),
    document.getElementById('control-glass-map'),
    'key'
  );
}

function syncWallpaperEngineGlassSamplerGeometry(rect, radius, visible, active) {
  var sampler = document.getElementById('wallpaper-engine-glass-sampler');
  if (!sampler || !rect) return false;
  var valid = active === true && rect.width >= 2 && rect.height >= 2;
  sampler.classList.toggle('bar-visible', valid && visible === true);
  if (!valid) return false;
  sampler.style.left = rect.left.toFixed(3) + 'px';
  sampler.style.top = rect.top.toFixed(3) + 'px';
  sampler.style.width = rect.width.toFixed(3) + 'px';
  sampler.style.height = rect.height.toFixed(3) + 'px';
  sampler.style.setProperty('--wallpaper-engine-glass-radius', Math.max(0, radius).toFixed(3) + 'px');
  var video = document.getElementById('wallpaper-engine-glass-sampler-video');
  if (video) {
    video.style.left = (-rect.left).toFixed(3) + 'px';
    video.style.top = (-rect.top).toFixed(3) + 'px';
    video.style.width = Math.max(2, window.innerWidth).toFixed(3) + 'px';
    video.style.height = Math.max(2, window.innerHeight).toFixed(3) + 'px';
  }
  return true;
}

function syncWallpaperEngineControlGlassSurface(force) {
  var api = window.desktopWindow;
  var bar = document.getElementById('bottom-bar');
  var sessionId = typeof wallpaperEngineNativeSessionId !== 'undefined'
    ? String(wallpaperEngineNativeSessionId || '') : '';
  if (!bar || !api || typeof api.updateWallpaperEngineGlassSurface !== 'function'
    || !/^[a-f0-9]{24}$/i.test(sessionId)) return false;
  var now = performance.now();
  if (!force && now - controlGlassState.dwmGeometryLastAt < 30) {
    if (!controlGlassState.dwmGeometryTimer) {
      controlGlassState.dwmGeometryTimer = setTimeout(function () {
        controlGlassState.dwmGeometryTimer = 0;
        syncWallpaperEngineControlGlassSurface(true);
      }, 32);
    }
    return false;
  }
  var rect = bar.getBoundingClientRect();
  var style = getComputedStyle(bar);
  var dwmMode = document.body.classList.contains('wallpaper-engine-dwm-active');
  var visible = dwmMode
    && bar.classList.contains('visible')
    && !bar.classList.contains('soft-hidden')
    && !document.body.classList.contains('home-controls-locked')
    && style.display !== 'none'
    && style.visibility !== 'hidden'
    && Number(style.opacity || 0) > 0.01
    && rect.right > 0 && rect.bottom > 0
    && rect.left < window.innerWidth && rect.top < window.innerHeight;
  var radius = parseFloat(style.borderRadius) || Math.min(rect.height / 2, 50);
  var surfaceActive = dwmMode
    && style.display !== 'none'
    && rect.width >= 2 && rect.height >= 2
    && rect.right > 0 && rect.bottom > 0
    && rect.left < window.innerWidth && rect.top < window.innerHeight;
  syncWallpaperEngineGlassSamplerGeometry(rect, radius, visible, surfaceActive);
  var geometryKey = [
    sessionId,
    surfaceActive ? 1 : 0,
    Math.round(rect.left * 10),
    Math.round(rect.top * 10),
    Math.round(rect.width * 10),
    Math.round(rect.height * 10),
    Math.round(radius * 10),
    Math.round(window.innerWidth * 10),
    Math.round(window.innerHeight * 10)
  ].join(':');
  if (!force && geometryKey === controlGlassState.dwmGeometryKey) return true;
  controlGlassState.dwmGeometryKey = geometryKey;
  controlGlassState.dwmGeometryLastAt = now;
  api.updateWallpaperEngineGlassSurface({
    sessionId: sessionId,
    active: surfaceActive,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    radius: radius,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  });
  return true;
}

function animateWallpaperEngineControlGlassSurface(duration) {
  var token = ++controlGlassState.dwmGeometryAnimationToken;
  var deadline = performance.now() + Math.max(0, Number(duration) || 0);
  function tick() {
    if (token !== controlGlassState.dwmGeometryAnimationToken) return;
    syncWallpaperEngineControlGlassSurface(false);
    if (performance.now() < deadline) requestAnimationFrame(tick);
    else syncWallpaperEngineControlGlassSurface(true);
  }
  requestAnimationFrame(tick);
}
function updateSearchBoxGlassDisplacementMap() {
  var img = document.getElementById('search-box-glass-map');
  var previousKey = controlGlassState.searchBoxKey;
  var hadHref = glassImageHasHref(img);
  var ready = updateGlassDisplacementMapForElement(
    document.getElementById('search-box'),
    img,
    'searchBoxKey',
    generateSearchBoxGlassDisplacementMap
  );
  var changed = ready && (controlGlassState.searchBoxKey !== previousKey || !hadHref);
  if (ready && document.documentElement.classList.contains('search-glass-priming')) return ready;
  syncSearchGlassReadyState(changed, changed);
  return ready;
}
function updateSearchPillGlassDisplacementMap() {
  var img = document.getElementById('search-pill-glass-map');
  if (!img) return false;
  var nodes = Array.prototype.slice.call(document.querySelectorAll('.search-mode-tabs button,.search-history-chip'));
  var maxW = 0, maxH = 0, maxRadius = 14;
  nodes.forEach(function (el) {
    if (!el) return;
    var rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    maxW = Math.max(maxW, rect.width);
    maxH = Math.max(maxH, rect.height);
    maxRadius = Math.max(maxRadius, parseFloat(getComputedStyle(el).borderRadius) || Math.round(rect.height / 2) || 14);
  });
  if (maxW < 2 || maxH < 2) {
    maxW = 96;
    maxH = 32;
    maxRadius = 14;
  }
  var width = Math.max(96, Math.round(maxW));
  var height = Math.max(32, Math.round(maxH));
  var radius = Math.max(12, Math.min(Math.round(maxRadius), Math.round(height / 2) + 10));
  var key = width + 'x' + height + ':' + radius;
  if (key === controlGlassState.searchPillKey && glassImageHasHref(img)) return true;
  controlGlassState.searchPillKey = key;
  var href = generateSearchPillGlassDisplacementMap(width, height, radius);
  img.setAttribute('href', href);
  try { img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href); } catch (e) { }
  return true;
}
function updateAccountPillGlassDisplacementMap() {
  var img = document.getElementById('account-pill-glass-map');
  if (!img) return;
  var nodes = Array.prototype.slice.call(document.querySelectorAll('.top-account-pill'));
  if (!nodes.length) return;
  var maxW = 0, maxH = 0, maxRadius = 24;
  nodes.forEach(function (el) {
    if (!el || el.offsetParent === null) return;
    var rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    maxW = Math.max(maxW, rect.width);
    maxH = Math.max(maxH, rect.height);
    maxRadius = Math.max(maxRadius, parseFloat(getComputedStyle(el).borderRadius) || Math.round(rect.height / 2) || 24);
  });
  if (maxW < 2 || maxH < 2) return;
  var width = Math.max(180, Math.round(maxW));
  var height = Math.max(44, Math.round(maxH));
  var radius = Math.max(20, Math.min(Math.round(maxRadius), Math.round(height / 2) + 8));
  var key = width + 'x' + height + ':' + radius;
  if (key === controlGlassState.accountPillKey) return;
  controlGlassState.accountPillKey = key;
  var href = generateAccountPillGlassDisplacementMap(width, height, radius);
  img.setAttribute('href', href);
  try { img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href); } catch (e) { }
}
function prepareSearchGlassBeforePeek() {
  if (!document.documentElement.classList.contains('control-glass-svg-ok')) return true;
  setSearchGlassFallback(false);
  var ready = updateSearchBoxGlassDisplacementMap();
  updateSearchPillGlassDisplacementMap();
  if (!ready || !glassImageHasHref(document.getElementById('search-box-glass-map'))) {
    setSearchGlassPriming(false);
    setSearchGlassFallback(true);
    return true;
  }
  if (document.documentElement.classList.contains('search-glass-ready')) return true;
  return syncSearchGlassReadyState(true, false);
}
function initControlGlassSurface() {
  if (supportsControlGlassSvgFilter()) document.documentElement.classList.add('control-glass-svg-ok');
  applyControlGlassChromaticOffset();
  updateControlGlassDisplacementMap();
  prepareSearchGlassBeforePeek();
  requestAnimationFrame(prepareSearchGlassBeforePeek);
  setTimeout(prepareSearchGlassBeforePeek, 140);
  updateAccountPillGlassDisplacementMap();
  var bar = document.getElementById('bottom-bar');
  var searchBox = document.getElementById('search-box');
  var searchTabs = document.getElementById('search-mode-tabs');
  var searchResults = document.getElementById('search-results');
  var userBtn = document.getElementById('user-btn');
  if (window.ResizeObserver && (bar || searchBox || searchTabs || searchResults || userBtn)) {
    var ro = new ResizeObserver(function () {
      requestAnimationFrame(updateControlGlassDisplacementMap);
      requestAnimationFrame(syncWallpaperEngineControlGlassSurface);
      requestAnimationFrame(updateSearchBoxGlassDisplacementMap);
      requestAnimationFrame(updateSearchPillGlassDisplacementMap);
      requestAnimationFrame(updateAccountPillGlassDisplacementMap);
    });
    if (bar) ro.observe(bar);
    if (searchBox) ro.observe(searchBox);
    if (searchTabs) ro.observe(searchTabs);
    if (searchResults) ro.observe(searchResults);
    if (userBtn) ro.observe(userBtn);
  }
  if (window.MutationObserver && bar) {
    var barObserver = new MutationObserver(function () {
      animateWallpaperEngineControlGlassSurface(520);
    });
    barObserver.observe(bar, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  if (window.MutationObserver && (searchTabs || searchResults || userBtn)) {
    var mo = new MutationObserver(function () {
      requestAnimationFrame(updateSearchPillGlassDisplacementMap);
      requestAnimationFrame(updateAccountPillGlassDisplacementMap);
    });
    if (searchTabs) mo.observe(searchTabs, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    if (searchResults) mo.observe(searchResults, { childList: true, subtree: true });
    if (userBtn) mo.observe(userBtn, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  window.addEventListener('resize', function () {
    requestAnimationFrame(updateControlGlassDisplacementMap);
    animateWallpaperEngineControlGlassSurface(520);
    requestAnimationFrame(updateSearchBoxGlassDisplacementMap);
    requestAnimationFrame(updateSearchPillGlassDisplacementMap);
    requestAnimationFrame(updateAccountPillGlassDisplacementMap);
  });
  if (bar) {
    bar.addEventListener('transitionrun', function () {
      animateWallpaperEngineControlGlassSurface(520);
    });
    bar.addEventListener('transitionend', function () {
      syncWallpaperEngineControlGlassSurface(true);
    });
  }
}

function bindPlayerControlAnimations() {
  if (!window.gsap) return;
  document.querySelectorAll('#bottom-bar .ctrl-btn').forEach(function (btn) {
    if (!btn || btn.dataset.controlAnimBound === '1') return;
    btn.dataset.controlAnimBound = '1';
    var isPlay = btn.id === 'play-btn';
    var iconTarget = btn.querySelector('svg,.lyrics-word-icon,#quality-btn-label');
    function canAnimate() {
      return !btn.disabled && !btn.classList.contains('busy');
    }
    function hoverIn(e) {
      if (!canAnimate() || (e && e.pointerType === 'touch')) return;
      window.gsap.to(btn, { y: -2, scale: isPlay ? 1.07 : 1.08, duration: 0.20, ease: 'power2.out', overwrite: 'auto' });
      if (iconTarget) window.gsap.to(iconTarget, { scale: isPlay ? 1.08 : 1.10, duration: 0.22, ease: 'power2.out', overwrite: 'auto' });
    }
    function hoverOut() {
      window.gsap.to(btn, { y: 0, scale: 1, rotate: 0, duration: 0.26, ease: 'power2.out', overwrite: 'auto' });
      if (iconTarget) window.gsap.to(iconTarget, { scale: 1, rotate: 0, duration: 0.22, ease: 'power2.out', overwrite: 'auto' });
    }
    function pressDown() {
      if (!canAnimate()) return;
      window.gsap.to(btn, { y: 0, scale: isPlay ? 0.91 : 0.90, duration: 0.10, ease: 'power2.out', overwrite: 'auto' });
      if (iconTarget) window.gsap.to(iconTarget, { scale: 0.88, duration: 0.10, ease: 'power2.out', overwrite: 'auto' });
    }
    function release(e) {
      if (!canAnimate()) return;
      var hovered = e && e.pointerType !== 'touch' && btn.matches(':hover');
      window.gsap.to(btn, { y: hovered ? -2 : 0, scale: hovered ? (isPlay ? 1.07 : 1.08) : 1, duration: 0.24, ease: 'back.out(1.9)', overwrite: 'auto' });
      if (iconTarget) window.gsap.to(iconTarget, { scale: hovered ? 1.06 : 1, duration: 0.22, ease: 'back.out(1.8)', overwrite: 'auto' });
    }
    function clickPulse() {
      if (!canAnimate() || btn.id === 'play-mode-btn') return;
      var pulseSize = isPlay ? 18 : 10;
      var pulseColor = isPlay ? 'rgba(255,63,85,.34)' : 'rgba(255,255,255,.22)';
      window.gsap.killTweensOf(btn, 'boxShadow');
      window.gsap.fromTo(btn,
        { boxShadow: '0 0 0 0 ' + pulseColor },
        { boxShadow: '0 0 0 ' + pulseSize + 'px rgba(255,63,85,0)', duration: isPlay ? 0.58 : 0.42, ease: 'sine.out', overwrite: false, onComplete: function () { window.gsap.set(btn, { clearProps: 'boxShadow' }); } }
      );
      if (iconTarget) window.gsap.fromTo(iconTarget, { rotate: isPlay ? 0 : -5 }, { rotate: 0, duration: 0.34, ease: 'elastic.out(1,0.55)', overwrite: 'auto' });
    }
    btn.addEventListener('pointerenter', hoverIn);
    btn.addEventListener('pointerleave', hoverOut);
    btn.addEventListener('pointercancel', hoverOut);
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('pointerdown', pressDown);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('click', clickPulse);
    btn.addEventListener('focus', function () { hoverIn(); });
    btn.addEventListener('blur', hoverOut);
  });
}

function clearPlayerControlFocusState(reason) {
  try {
    document.querySelectorAll('#bottom-bar .ctrl-btn').forEach(function (btn) {
      if (!btn) return;
      if (document.activeElement === btn) btn.blur();
      btn.classList.remove('focus-visible');
      if (window.gsap) {
        window.gsap.killTweensOf(btn);
        window.gsap.set(btn, { y: 0, scale: 1, rotate: 0, clearProps: 'boxShadow' });
        var iconTarget = btn.querySelector('svg,.lyrics-word-icon,#quality-btn-label');
        if (iconTarget) {
          window.gsap.killTweensOf(iconTarget);
          window.gsap.set(iconTarget, { scale: 1, rotate: 0 });
        }
      } else {
        btn.style.transform = '';
        btn.style.boxShadow = '';
      }
    });
  } catch (e) {
    console.warn('[ControlFocusClear]', reason || 'unknown', e);
  }
}

// ============================================================
//  歌词
