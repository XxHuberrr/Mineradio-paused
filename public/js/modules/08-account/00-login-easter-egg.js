var LOGIN_EASTER_EGG_BROWSER_PREVIEW_KEY = 'mineradio-login-easter-egg-browser-preview-v1';
var loginEasterEggStatusPromise = null;
var loginEasterEggState = {
  ready: false,
  unlocked: false,
  clickCount: 0,
  revealed: false,
  attempts: 0,
  prefixLocked: false,
  composing: false,
  validating: false,
  cinematicActive: false,
  cinematicReady: false,
  achievementTimer: null,
  focusRetryTimers: [],
  focusRequestId: 0
};

function loginEasterEggEyeMarkup(compact) {
  return '<span class="login-easter-eyes' + (compact ? ' compact' : '') + '" aria-hidden="true">' +
    '<i class="login-easter-eye login-easter-eye-big"></i>' +
    '<i class="login-easter-eye login-easter-eye-small"></i>' +
    '</span>';
}

function loginEasterEggBrowserPreviewUnlocked() {
  try { return localStorage.getItem(LOGIN_EASTER_EGG_BROWSER_PREVIEW_KEY) === '1'; } catch (_) { return false; }
}

async function ensureLoginEasterEggStatus(force) {
  if (!force && loginEasterEggState.ready) return loginEasterEggState.unlocked;
  if (!force && loginEasterEggStatusPromise) return loginEasterEggStatusPromise;
  loginEasterEggStatusPromise = (async function () {
    var api = window.desktopWindow;
    var status = null;
    if (api && typeof api.getLoginEasterEggStatus === 'function') {
      try { status = await api.getLoginEasterEggStatus(); } catch (_) { status = null; }
    } else {
      status = { ok: true, unlocked: loginEasterEggBrowserPreviewUnlocked(), browserPreview: true };
    }
    loginEasterEggState.ready = true;
    loginEasterEggState.unlocked = !!(status && status.ok && status.unlocked);
    return loginEasterEggState.unlocked;
  })().finally(function () { loginEasterEggStatusPromise = null; });
  return loginEasterEggStatusPromise;
}

function loginEasterEggAllowsStartupGuide() {
  return loginEasterEggState.ready && loginEasterEggState.unlocked;
}

function setLoginEasterEggMode(locked) {
  var modal = document.getElementById('login-modal');
  if (!modal) return;
  modal.classList.toggle('login-easter-egg-locked', !!locked);
  var gate = document.getElementById('login-easter-egg-gate');
  if (gate) gate.setAttribute('aria-hidden', locked ? 'false' : 'true');
}

function bindLoginEasterEggGate() {
  var input = document.getElementById('login-easter-egg-input');
  var shell = input && input.closest ? input.closest('.login-easter-input-shell') : null;
  if (!input || input.__loginEasterEggBound) return;
  input.__loginEasterEggBound = true;
  input.addEventListener('compositionstart', function () {
    clearLoginEasterEggFocusRetries();
    loginEasterEggState.composing = true;
  });
  input.addEventListener('compositionend', function (event) {
    loginEasterEggState.composing = false;
    handleLoginEasterEggInput(event);
  });
  input.addEventListener('beforeinput', function (event) {
    clearLoginEasterEggFocusRetries();
    if (!loginEasterEggState.prefixLocked || !/^delete/.test(String(event.inputType || ''))) return;
    if ((input.selectionStart || 0) <= 2 && (input.selectionEnd || 0) <= 2) event.preventDefault();
  });
  input.addEventListener('input', handleLoginEasterEggInput);
  input.addEventListener('keydown', function (event) {
    clearLoginEasterEggFocusRetries();
    if (event.isComposing || loginEasterEggState.composing || event.keyCode === 229) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      validateLoginEasterEggValue();
    }
  });
  if (shell) {
    shell.addEventListener('pointerdown', function () {
      clearLoginEasterEggFocusRetries();
      window.requestAnimationFrame(function () { focusLoginEasterEggInput('wish-pointerdown-frame'); });
    });
    shell.addEventListener('click', function () { focusLoginEasterEggInput('wish-click'); });
  }
  var cinematic = document.getElementById('login-easter-unlock-cinematic');
  if (cinematic && !cinematic.__loginEasterEggBound) {
    cinematic.__loginEasterEggBound = true;
    cinematic.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      dismissLoginEasterEggCinematic();
    });
  }
}

async function prepareLoginEasterEggGate() {
  bindLoginEasterEggGate();
  var unlocked = await ensureLoginEasterEggStatus(false);
  setLoginEasterEggMode(!unlocked);
  if (!unlocked) {
    restoreLoginEasterEggInputSurface(false);
    window.setTimeout(function () {
      if (loginEasterEggState.revealed || loginEasterEggState.cinematicActive) return;
      var trigger = document.getElementById('login-easter-eye-trigger');
      if (trigger) trigger.focus({ preventScroll: true });
    }, 220);
  }
  return unlocked;
}

function replayLoginEasterEggClass(node, className) {
  if (!node) return;
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

function handleLoginEasterEggTap() {
  if (loginEasterEggState.revealed) {
    focusLoginEasterEggInput();
    return;
  }
  loginEasterEggState.clickCount = Math.min(5, loginEasterEggState.clickCount + 1);
  var trigger = document.getElementById('login-easter-eye-trigger');
  var hint = document.getElementById('login-easter-hint');
  if (trigger) {
    trigger.style.setProperty('--egg-tap-strength', String(loginEasterEggState.clickCount));
    replayLoginEasterEggClass(trigger, 'tap-feedback');
  }
  var hints = [
    '',
    '它好像看了你一眼',
    '再点几下',
    '它开始有点紧张了',
    '还差一下',
    ''
  ];
  if (hint) hint.textContent = hints[loginEasterEggState.clickCount] || '';
  if (loginEasterEggState.clickCount >= 5) revealLoginEasterEggWish();
}

function revealLoginEasterEggWish() {
  loginEasterEggState.revealed = true;
  restoreLoginEasterEggInputSurface(false);
  var gate = document.getElementById('login-easter-egg-gate');
  if (gate) gate.classList.add('is-revealed');
  scheduleLoginEasterEggInputFocus();
}

function clearLoginEasterEggFocusRetries() {
  var timers = loginEasterEggState.focusRetryTimers || [];
  timers.forEach(function (timer) { window.clearTimeout(timer); });
  loginEasterEggState.focusRetryTimers = [];
  loginEasterEggState.focusRequestId = (Number(loginEasterEggState.focusRequestId) || 0) + 1;
}

function requestLoginEasterEggKeyboardFocus(reason) {
  var api = window.desktopWindow;
  if (!api || typeof api.requestDesktopKeyboardFocus !== 'function') return Promise.resolve({ ok: true, browserPreview: true });
  try {
    return Promise.resolve(api.requestDesktopKeyboardFocus(
      'login-easter-egg-' + String(reason || 'input').slice(0, 48)
    )).catch(function () {
      return { ok: false, error: 'KEYBOARD_FOCUS_REQUEST_FAILED' };
    });
  } catch (_) {
    return Promise.resolve({ ok: false, error: 'KEYBOARD_FOCUS_REQUEST_FAILED' });
  }
}

function scheduleLoginEasterEggInputFocus() {
  clearLoginEasterEggFocusRetries();
  [0, 180, 920, 1480].forEach(function (delay) {
    loginEasterEggState.focusRetryTimers.push(window.setTimeout(function () {
      focusLoginEasterEggInput('reveal-' + delay);
    }, delay));
  });
}

function restoreLoginEasterEggInputSurface(clearValue) {
  var input = document.getElementById('login-easter-egg-input');
  if (!input) return null;
  input.disabled = false;
  input.readOnly = false;
  input.tabIndex = 0;
  input.removeAttribute('disabled');
  input.removeAttribute('readonly');
  input.removeAttribute('inert');
  input.removeAttribute('aria-disabled');
  input.style.removeProperty('pointer-events');
  var shell = input.closest ? input.closest('.login-easter-input-shell') : null;
  var wish = document.getElementById('login-easter-egg-wish');
  [shell, wish].forEach(function (node) {
    if (!node) return;
    node.removeAttribute('inert');
    node.removeAttribute('aria-disabled');
  });
  if (clearValue) input.value = '';
  return input;
}

function focusLoginEasterEggInput(reason) {
  var input = restoreLoginEasterEggInputSurface(false);
  if (!input || !loginEasterEggState.revealed || loginEasterEggState.composing) return;
  clearLoginEasterEggFocusRetries();
  if (document.activeElement === input && document.hasFocus()) {
    return;
  }
  if (document.hasFocus()) {
    input.focus({ preventScroll: true });
    try {
      var end = input.value.length;
      input.setSelectionRange(end, end);
    } catch (_) { }
    return;
  }
  var requestId = (Number(loginEasterEggState.focusRequestId) || 0) + 1;
  loginEasterEggState.focusRequestId = requestId;
  function applyInputFocus() {
    if (requestId !== loginEasterEggState.focusRequestId ||
        !loginEasterEggState.revealed ||
        loginEasterEggState.cinematicActive ||
        loginEasterEggState.composing) return;
    input.focus({ preventScroll: true });
    try {
      var end = input.value.length;
      input.setSelectionRange(end, end);
    } catch (_) { }
  }
  requestLoginEasterEggKeyboardFocus(reason || 'focus').then(function () {
    applyInputFocus();
    window.requestAnimationFrame(applyInputFocus);
  });
}

function normalizeLoginEasterEggCharacters(value) {
  return Array.from(String(value || '').replace(/\s+/g, '')).slice(0, 4);
}

function loginEasterEggVisibleValue(inputType) {
  var input = document.getElementById('login-easter-egg-input');
  var chars = normalizeLoginEasterEggCharacters(input ? input.value : '');
  if (!loginEasterEggState.prefixLocked) return chars.join('');
  var suffix;
  if (chars[0] === '世' && chars[1] === '界') suffix = chars.slice(2, 4);
  else if (/^delete/.test(String(inputType || '')) && chars.length < 2) suffix = [];
  else suffix = chars.slice(-2);
  return '世界' + suffix.join('');
}

function renderLoginEasterEggCells(value) {
  var chars = Array.from(String(value || ''));
  var cells = document.querySelectorAll('#login-easter-egg-cells .login-easter-cell');
  for (var i = 0; i < cells.length; i++) {
    cells[i].textContent = chars[i] || '';
    cells[i].classList.toggle('filled', !!chars[i]);
    cells[i].classList.toggle('fixed', loginEasterEggState.prefixLocked && i < 2);
  }
}

function handleLoginEasterEggInput(event) {
  if (loginEasterEggState.composing || loginEasterEggState.validating) return;
  var input = document.getElementById('login-easter-egg-input');
  if (!input) return;
  var value = loginEasterEggVisibleValue(event && event.inputType);
  input.value = value;
  renderLoginEasterEggCells(value);
  if (Array.from(value).length === 4) validateLoginEasterEggValue();
}

function setLoginEasterEggStatus(message, mode) {
  var status = document.getElementById('login-easter-status');
  if (!status) return;
  status.textContent = message || '';
  status.dataset.mode = mode || '';
}

function resetLoginEasterEggInputAfterError() {
  var input = document.getElementById('login-easter-egg-input');
  if (!input) return;
  input.value = loginEasterEggState.prefixLocked ? '世界' : '';
  renderLoginEasterEggCells(input.value);
  loginEasterEggState.validating = false;
  focusLoginEasterEggInput();
}

async function requestLoginEasterEggUnlock(value) {
  var api = window.desktopWindow;
  if (api && typeof api.unlockLoginEasterEgg === 'function') {
    return api.unlockLoginEasterEgg(value);
  }
  var previewPassword = ['世', '界', '和', '平'].join('');
  if (value !== previewPassword) return { ok: false, unlocked: false, error: 'LOGIN_EASTER_EGG_INVALID' };
  try { localStorage.setItem(LOGIN_EASTER_EGG_BROWSER_PREVIEW_KEY, '1'); } catch (_) { }
  return { ok: true, unlocked: true, browserPreview: true };
}

async function requestLoginEasterEggReplayReset() {
  var api = window.desktopWindow;
  if (api && typeof api.resetLoginEasterEgg === 'function') {
    return api.resetLoginEasterEgg();
  }
  try { localStorage.removeItem(LOGIN_EASTER_EGG_BROWSER_PREVIEW_KEY); } catch (_) { }
  return { ok: true, unlocked: false, resetComplete: true, replayReset: true, browserPreview: true };
}

function resetLoginEasterEggUiForReplay() {
  clearLoginEasterEggFocusRetries();
  if (loginEasterEggState.achievementTimer) window.clearTimeout(loginEasterEggState.achievementTimer);
  loginEasterEggStatusPromise = null;
  loginEasterEggState.ready = true;
  loginEasterEggState.unlocked = false;
  loginEasterEggState.clickCount = 0;
  loginEasterEggState.revealed = false;
  loginEasterEggState.attempts = 0;
  loginEasterEggState.prefixLocked = false;
  loginEasterEggState.composing = false;
  loginEasterEggState.validating = false;
  loginEasterEggState.cinematicActive = false;
  loginEasterEggState.cinematicReady = false;
  loginEasterEggState.achievementTimer = null;
  loginEasterEggState.focusRetryTimers = [];
  loginEasterEggState.focusRequestId = (Number(loginEasterEggState.focusRequestId) || 0) + 1;
  try { localStorage.removeItem(LOGIN_EASTER_EGG_BROWSER_PREVIEW_KEY); } catch (_) { }
  var active = document.activeElement;
  if (active && typeof active.blur === 'function') {
    try { active.blur(); } catch (_) { }
  }
  var input = restoreLoginEasterEggInputSurface(true);
  renderLoginEasterEggCells('');
  setLoginEasterEggStatus('', '');
  var gate = document.getElementById('login-easter-egg-gate');
  if (gate) gate.classList.remove('is-revealed');
  var trigger = document.getElementById('login-easter-eye-trigger');
  if (trigger) {
    trigger.classList.remove('tap-feedback');
    trigger.style.removeProperty('--egg-tap-strength');
  }
  var hint = document.getElementById('login-easter-hint');
  if (hint) hint.textContent = '';
  var modal = document.getElementById('login-modal');
  if (modal) modal.classList.remove('login-easter-egg-unlocking');
  var cinematic = document.getElementById('login-easter-unlock-cinematic');
  if (cinematic) {
    cinematic.classList.remove('is-mounted', 'is-positioned', 'is-extracting', 'is-ready', 'is-dismissing');
    cinematic.setAttribute('aria-hidden', 'true');
    cinematic.setAttribute('tabindex', '-1');
  }
  var toast = document.getElementById('login-easter-achievement');
  if (toast) toast.classList.remove('show');
  setLoginEasterEggMode(true);
  bindLoginEasterEggGate();
}

async function validateLoginEasterEggValue() {
  if (loginEasterEggState.validating || loginEasterEggState.composing) return;
  var input = document.getElementById('login-easter-egg-input');
  if (!input) return;
  var value = loginEasterEggVisibleValue('');
  if (Array.from(value).length !== 4) return;
  loginEasterEggState.validating = true;
  var result;
  try { result = await requestLoginEasterEggUnlock(value); }
  catch (error) { result = { ok: false, error: String(error && error.message || error) }; }
  if (result && result.ok && result.unlocked) {
    playLoginEasterEggUnlockCinematic();
    return;
  }
  if (result && result.error === 'LOGIN_EASTER_EGG_RESET_INCOMPLETE') {
    setLoginEasterEggStatus('登录凭据清理未完成，请重启后再试', 'error');
    loginEasterEggState.validating = false;
    return;
  }
  if (result && result.error === 'LOGIN_EASTER_EGG_STATE_WRITE_FAILED') {
    setLoginEasterEggStatus('无法保存解锁状态，请释放系统盘空间后重试', 'error');
    loginEasterEggState.validating = false;
    return;
  }
  loginEasterEggState.attempts += 1;
  if (loginEasterEggState.attempts === 3) {
    loginEasterEggState.prefixLocked = true;
    setLoginEasterEggStatus('前两个字，已经替你想好了', 'hint');
  } else {
    setLoginEasterEggStatus(loginEasterEggState.attempts < 3 ? '愿望不太对' : '再想想后两个字', 'error');
  }
  replayLoginEasterEggClass(document.getElementById('login-easter-egg-wish'), 'error-shake');
  window.setTimeout(resetLoginEasterEggInputAfterError, 430);
}

function prepareLoginEasterEggPixelPhrase(phrase) {
  if (!phrase) return;
  Array.prototype.slice.call(phrase.children).forEach(function (charNode) {
    if (!charNode || charNode.querySelector('canvas')) return;
    var glyph = String(charNode.textContent || '').trim().slice(0, 1);
    if (!glyph) return;
    var canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 20;
    canvas.className = 'login-easter-pixel-glyph';
    var ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, 20, 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 18px SimSun, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 10, 10.5);
    var pixels = ctx.getImageData(0, 0, 20, 20);
    for (var i = 0; i < pixels.data.length; i += 4) {
      var solid = pixels.data[i + 3] >= 92;
      pixels.data[i] = 255;
      pixels.data[i + 1] = 255;
      pixels.data[i + 2] = 255;
      pixels.data[i + 3] = solid ? 255 : 0;
    }
    ctx.putImageData(pixels, 0, 0);
    charNode.textContent = '';
    charNode.dataset.pixelGlyph = glyph;
    charNode.appendChild(canvas);
  });
}

function playLoginEasterEggUnlockCinematic() {
  clearLoginEasterEggFocusRetries();
  loginEasterEggState.ready = true;
  loginEasterEggState.unlocked = true;
  loginEasterEggState.validating = false;
  loginEasterEggState.cinematicActive = true;
  loginEasterEggState.cinematicReady = false;
  setLoginEasterEggStatus('愿望已收到', 'success');
  var modal = document.getElementById('login-modal');
  var cinematic = document.getElementById('login-easter-unlock-cinematic');
  var phrase = document.getElementById('login-easter-unlock-phrase');
  prepareLoginEasterEggPixelPhrase(phrase);
  var sourceCells = Array.prototype.slice.call(document.querySelectorAll('#login-easter-egg-cells .login-easter-cell'));
  var phraseChars = phrase ? Array.prototype.slice.call(phrase.querySelectorAll('span')) : [];
  if (!cinematic || sourceCells.length !== 4 || phraseChars.length !== 4) {
    completeLoginEasterEggUnlock();
    return;
  }
  cinematic.classList.remove('is-positioned', 'is-extracting', 'is-ready', 'is-dismissing');
  cinematic.classList.add('is-mounted');
  cinematic.setAttribute('aria-hidden', 'false');
  cinematic.setAttribute('tabindex', '0');
  phraseChars.forEach(function (charNode) {
    charNode.style.removeProperty('--extract-x');
    charNode.style.removeProperty('--extract-y');
  });
  window.requestAnimationFrame(function () {
    phraseChars.forEach(function (charNode, index) {
      var sourceRect = sourceCells[index].getBoundingClientRect();
      var targetRect = charNode.getBoundingClientRect();
      var fromX = sourceRect.left + sourceRect.width / 2 - (targetRect.left + targetRect.width / 2);
      var fromY = sourceRect.top + sourceRect.height / 2 - (targetRect.top + targetRect.height / 2);
      charNode.style.setProperty('--extract-x', fromX.toFixed(2) + 'px');
      charNode.style.setProperty('--extract-y', fromY.toFixed(2) + 'px');
    });
    cinematic.classList.add('is-positioned');
    void cinematic.offsetWidth;
    window.requestAnimationFrame(function () {
      cinematic.classList.add('is-extracting');
      window.setTimeout(function () {
        if (modal) modal.classList.add('login-easter-egg-unlocking');
      }, 520);
      window.setTimeout(function () {
        if (!loginEasterEggState.cinematicActive) return;
        loginEasterEggState.cinematicReady = true;
        cinematic.classList.add('is-ready');
        try { cinematic.focus({ preventScroll: true }); } catch (_) { }
      }, 2700);
    });
  });
}

function dismissLoginEasterEggCinematic() {
  if (!loginEasterEggState.cinematicActive || !loginEasterEggState.cinematicReady) return;
  loginEasterEggState.cinematicReady = false;
  var cinematic = document.getElementById('login-easter-unlock-cinematic');
  if (cinematic) cinematic.classList.add('is-dismissing');
  window.setTimeout(completeLoginEasterEggUnlock, 1250);
}

function completeLoginEasterEggUnlock() {
  loginEasterEggState.cinematicActive = false;
  loginEasterEggState.cinematicReady = false;
  var modal = document.getElementById('login-modal');
  var cinematic = document.getElementById('login-easter-unlock-cinematic');
  if (cinematic) {
    cinematic.classList.remove('is-mounted', 'is-positioned', 'is-extracting', 'is-ready', 'is-dismissing');
    cinematic.setAttribute('aria-hidden', 'true');
    cinematic.setAttribute('tabindex', '-1');
  }
  setLoginEasterEggMode(false);
  if (modal) modal.classList.remove('login-easter-egg-unlocking');
  if (typeof resumeLoginModalAfterGate === 'function') resumeLoginModalAfterGate();
  showLoginEasterEggAchievement();
}

function playLoginEasterEggAchievementChime() {
  var ctx = typeof ensureUiSfxContext === 'function' ? ensureUiSfxContext() : null;
  if (!ctx) return;
  try {
    var t = ctx.currentTime + 0.015;
    var master = ctx.createGain();
    var volume = Math.max(0, Math.min(1, typeof targetVolume === 'number' ? targetVolume : 0.72));
    master.gain.setValueAtTime(0.0001, t);
    master.gain.linearRampToValueAtTime(0.12 * (0.32 + volume * 0.68), t + 0.018);
    master.gain.exponentialRampToValueAtTime(0.0001, t + 1.22);
    master.connect(ctx.destination);

    [
      [1046.50, 0.00, 0.46],
      [1318.51, 0.10, 0.50],
      [1567.98, 0.21, 0.58],
      [2093.00, 0.36, 0.82],
    ].forEach(function (note, index) {
      var start = t + note[1];
      var end = start + note[2];
      var osc = ctx.createOscillator();
      var overtone = ctx.createOscillator();
      var gain = ctx.createGain();
      var overtoneGain = ctx.createGain();
      osc.type = 'sine';
      overtone.type = index === 3 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(note[0], start);
      overtone.frequency.setValueAtTime(note[0] * 2.01, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(index === 3 ? 0.68 : 0.52, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      overtoneGain.gain.setValueAtTime(0.0001, start);
      overtoneGain.gain.linearRampToValueAtTime(index === 3 ? 0.16 : 0.11, start + 0.004);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, Math.min(end, start + 0.28));
      osc.connect(gain);
      overtone.connect(overtoneGain);
      gain.connect(master);
      overtoneGain.connect(master);
      osc.start(start);
      overtone.start(start);
      osc.stop(end + 0.02);
      overtone.stop(end + 0.02);
    });
    window.setTimeout(function () {
      try { master.disconnect(); } catch (_) { }
    }, 1450);
  } catch (error) {
    console.warn('Login achievement chime failed:', error);
  }
}

function showLoginEasterEggAchievement() {
  var toast = document.getElementById('login-easter-achievement');
  if (!toast) return;
  if (loginEasterEggState.achievementTimer) window.clearTimeout(loginEasterEggState.achievementTimer);
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');
  playLoginEasterEggAchievementChime();
  loginEasterEggState.achievementTimer = window.setTimeout(function () {
    toast.classList.remove('show');
    loginEasterEggState.achievementTimer = null;
  }, 5200);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { ensureLoginEasterEggStatus(false); }, { once: true });
  } else {
    ensureLoginEasterEggStatus(false);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeLoginEasterEggCharacters: normalizeLoginEasterEggCharacters };
}
