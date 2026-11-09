'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const {
  LoginEasterEggGate,
  LOGIN_EASTER_EGG_GATE_VERSION,
  LOGIN_EASTER_EGG_CREDENTIAL_FILES,
} = require('../desktop/login-easter-egg-gate');
const { normalizeLoginEasterEggCharacters } = require('../public/js/modules/08-account/00-login-easter-egg');

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-login-gate-'));
  try {
    const migrationRoot = path.join(root, 'chromium-session');
    fs.mkdirSync(migrationRoot, { recursive: true });
    LOGIN_EASTER_EGG_CREDENTIAL_FILES.forEach((name) => {
      fs.writeFileSync(path.join(root, name), 'legacy-login', 'utf8');
      fs.writeFileSync(path.join(migrationRoot, name), 'displaced-legacy-login', 'utf8');
    });
    fs.writeFileSync(path.join(root, '.spotify-credentials.json'), '{"clientId":"keep"}', 'utf8');
    fs.writeFileSync(path.join(root, '.qishui-oauth.json'), '{"clientId":"keep"}', 'utf8');
    fs.writeFileSync(path.join(root, 'current-fx-autosave.json'), '{"keep":true}', 'utf8');

    let partitionClearCount = 0;
    const gate = new LoginEasterEggGate({ userDataPath: root, credentialRoots: [migrationRoot], now: () => 1234 });
    const first = await gate.initialize(async () => {
      partitionClearCount += 1;
      fs.writeFileSync(path.join(root, '.cookie'), 'runtime-flush', 'utf8');
      fs.writeFileSync(path.join(migrationRoot, '.cookie'), 'runtime-migration-flush', 'utf8');
    });
    assert.strictEqual(first.resetPerformed, true);
    assert.strictEqual(first.resetComplete, true);
    assert.strictEqual(first.unlocked, false);
    assert.strictEqual(partitionClearCount, 1);
    LOGIN_EASTER_EGG_CREDENTIAL_FILES.forEach((name) => {
      assert.strictEqual(fs.existsSync(path.join(root, name)), false, `${name} should be cleared`);
      assert.strictEqual(fs.existsSync(path.join(migrationRoot, name)), false, `${name} migration copy should be cleared`);
    });
    assert.strictEqual(fs.existsSync(path.join(root, '.spotify-credentials.json')), true);
    assert.strictEqual(fs.existsSync(path.join(root, '.qishui-oauth.json')), true);
    assert.strictEqual(fs.existsSync(path.join(root, 'current-fx-autosave.json')), true);

    assert.strictEqual(gate.unlock('世界和气').error, 'LOGIN_EASTER_EGG_INVALID');
    assert.strictEqual(gate.unlock('世界和平').unlocked, true);

    fs.writeFileSync(path.join(root, '.cookie'), 'new-login', 'utf8');
    const reopened = new LoginEasterEggGate({ userDataPath: root, credentialRoots: () => [migrationRoot], now: () => 5678 });
    const second = await reopened.initialize(async () => { partitionClearCount += 1; });
    assert.strictEqual(second.resetPerformed, false);
    assert.strictEqual(second.unlocked, true);
    assert.strictEqual(partitionClearCount, 1);
    assert.strictEqual(fs.readFileSync(path.join(root, '.cookie'), 'utf8'), 'new-login');

    const state = JSON.parse(fs.readFileSync(path.join(root, 'login-easter-egg.json'), 'utf8'));
    assert.strictEqual(state.gateVersion, LOGIN_EASTER_EGG_GATE_VERSION);
    assert.strictEqual(state.cookieResetVersion, LOGIN_EASTER_EGG_GATE_VERSION);
    assert.strictEqual(state.unlocked, true);
    assert.deepStrictEqual(normalizeLoginEasterEggCharacters(' 世 界 和 平 多 '), ['世', '界', '和', '平']);

    LOGIN_EASTER_EGG_CREDENTIAL_FILES.forEach((name) => {
      fs.writeFileSync(path.join(root, name), 'replayed-login', 'utf8');
      fs.writeFileSync(path.join(migrationRoot, name), 'replayed-migration-login', 'utf8');
    });
    const replayReset = await reopened.resetForReplay(async () => {
      partitionClearCount += 1;
      fs.writeFileSync(path.join(root, '.cookie'), 'runtime-replay-flush', 'utf8');
      fs.writeFileSync(path.join(migrationRoot, '.cookie'), 'runtime-replay-migration-flush', 'utf8');
    });
    assert.strictEqual(replayReset.ok, true);
    assert.strictEqual(replayReset.replayReset, true);
    assert.strictEqual(replayReset.resetComplete, true);
    assert.strictEqual(replayReset.unlocked, false);
    assert.strictEqual(partitionClearCount, 2);
    LOGIN_EASTER_EGG_CREDENTIAL_FILES.forEach((name) => {
      assert.strictEqual(fs.existsSync(path.join(root, name)), false, `${name} should be cleared for replay`);
      assert.strictEqual(fs.existsSync(path.join(migrationRoot, name)), false, `${name} migration copy should be cleared for replay`);
    });
    assert.strictEqual(fs.existsSync(path.join(root, '.spotify-credentials.json')), true);
    assert.strictEqual(fs.existsSync(path.join(root, '.qishui-oauth.json')), true);
    fs.writeFileSync(path.join(migrationRoot, '.cookie'), 'stale-cookie-before-locked-restart', 'utf8');
    const lockedRestart = new LoginEasterEggGate({ userDataPath: root, credentialRoots: [migrationRoot], now: () => 9012 });
    const lockedStatus = await lockedRestart.initialize(async () => { partitionClearCount += 1; });
    assert.strictEqual(lockedStatus.resetPerformed, false);
    assert.strictEqual(lockedStatus.unlocked, false);
    assert.strictEqual(partitionClearCount, 3, 'a locked restart must audit sessions again');
    assert.strictEqual(fs.existsSync(path.join(migrationRoot, '.cookie')), false, 'locked restart must remove restored migration credentials');
    assert.strictEqual(lockedRestart.unlock('世界和平').unlocked, true, 'replayed gate should unlock again');

    const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
    assert(main.indexOf('migrateLegacyAuthStorage();') < main.indexOf('await initializeLoginEasterEggGate();'));
    assert(main.indexOf('await initializeLoginEasterEggGate();') < main.indexOf("localServer = require(serverModulePath)"));
    ['netease', 'qq', 'kugou'].forEach((provider) => {
      const marker = `ipcMain.handle('${provider}-music-open-login'`;
      const start = main.indexOf(marker);
      assert(start >= 0, `${provider} login IPC missing`);
      assert(main.slice(start, start + 260).includes('loginEasterEggGate.isUnlocked()'), `${provider} login IPC is not gated`);
    });
    assert(!main.includes("ipcMain.handle('qishui-music-open-login'"), 'Qishui must use the embedded signed QR route, not the legacy login-window IPC');
    assert(main.includes("ipcMain.handle('mineradio-login-easter-egg-reset'"));
    assert(main.includes("loginEasterEggGate.resetForReplay(() => clearAllProviderLoginState('renderer-replay-reset'))"));
    assert(main.includes('credentialRoots: () => ['));
    assert(main.includes("clearAllProviderLoginState('startup-gate')"));

    const preload = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'preload.js'), 'utf8');
    assert(preload.includes("resetLoginEasterEgg: () => ipcRenderer.invoke('mineradio-login-easter-egg-reset')"));

    const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    ['/api/login/cookie', '/api/login/qr/key', '/api/qq/login/cookie', '/api/kugou/login/cookie', '/api/qishui/login/qrcode', '/api/qishui/login/check']
      .forEach((route) => assert(server.includes(`'${route}'`), `${route} gate missing`));
    assert(!server.includes("pn === '/api/qishui/login/token'"), 'legacy Qishui token-login route must stay removed');
    assert(!server.includes("pn === '/api/qishui/login/cookie'"), 'legacy Qishui cookie-login route must stay removed');
    assert(server.includes('function clearAllRuntimeLoginCredentials(reason)'));
    assert(server.includes('server.clearAllLoginCredentials = clearAllRuntimeLoginCredentials'));

    const accountRenderer = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '08-account', '02-login-status.js'), 'utf8');
    const renderStart = accountRenderer.indexOf('function renderUserBtn()');
    const renderEnd = accountRenderer.indexOf('\n}', renderStart) + 2;
    const renderUserButton = accountRenderer.slice(renderStart, renderEnd);
    assert(renderUserButton.includes("btn.classList.add('logged-out', 'login-eye-avatar')"));
    assert(renderUserButton.includes('loginEasterEggEyeMarkup(true)'));
    assert(renderUserButton.includes("btn.classList.add('logged-in', 'multi-account', 'external-account-pills')"));
    assert(renderUserButton.includes('renderTopAccountPill(provider)'), 'logged-in state must restore provider account capsules');

    const accountUtils = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '08-account', '01-login-modal-utils.js'), 'utf8');
    assert(accountUtils.includes('function providerAccountIdentity(provider, status)'));
    assert(accountUtils.includes('status.nickname'));
    assert(accountUtils.includes('status.displayName'));
    assert(accountUtils.includes('accountIds.indexOf(nickname) !== -1'));
    assert(accountUtils.includes("/^\\d{5,}$/.test(nickname)"));
    assert(!/var identity = status\.userId \|\| status\.uid/.test(accountUtils), 'top account capsules must not prioritize numeric account ids');
    const identityStart = accountUtils.indexOf('function providerAccountIdentity(provider, status)');
    const identityEnd = accountUtils.indexOf('\nfunction renderTopAccountPill', identityStart);
    const identitySandbox = {
      platformStatus: () => ({}),
      platformMeta: (provider) => ({
        netease: { label: '网易云音乐', short: 'NE' },
        qq: { label: 'QQ 音乐', short: 'QQ' },
        kugou: { label: '酷狗音乐', short: 'KG' },
        qishui: { label: '汽水音乐', short: 'QS' },
      }[provider] || { label: provider, short: provider }),
    };
    vm.runInNewContext(accountUtils.slice(identityStart, identityEnd) + '\nthis.providerAccountIdentity = providerAccountIdentity;', identitySandbox);
    assert.strictEqual(identitySandbox.providerAccountIdentity('netease', { nickname: '平台昵称', userId: '280213969' }), '平台昵称');
    assert.strictEqual(identitySandbox.providerAccountIdentity('qq', { nickname: 'QQ 123456789', userId: '123456789' }), 'QQ 音乐');
    assert.strictEqual(identitySandbox.providerAccountIdentity('kugou', { nickname: '酷狗 99887766', userId: '99887766' }), '酷狗音乐');

    const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'index.css'), 'utf8');
    assert(/#user-btn\.login-eye-avatar[\s\S]{0,180}width:\s*48px[\s\S]{0,180}border-radius:\s*50%/.test(css));
    assert(css.includes('.login-easter-unlock-cinematic.is-extracting'));
    assert(css.includes('@keyframes login-easter-world-float'));
    assert(css.includes('.login-easter-achievement.show'));
    assert(css.includes('.login-easter-achievement-pixel-eyes'));
    assert(css.includes('.login-easter-achievement-pixel-eye.pixel-eye-big'));
    assert(css.includes('width: min(326px, calc(100vw - 76px))'));
    assert(css.includes('top: 34px'));
    assert(css.includes('right: 38px'));
    assert(css.includes('0 0 0 2px #b7b7b7'));
    assert(css.includes('font-smooth: never'));
    assert(css.includes('.login-easter-pixel-glyph'));
    assert(css.includes('image-rendering: pixelated'));

    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert(html.includes('id="login-easter-unlock-cinematic"'));
    assert(html.includes('id="login-easter-achievement"'));
    assert(html.includes('login-easter-achievement-pixel-eyes'));
    assert(html.includes('id="login-reset-all-btn"'));
    assert(html.includes('onclick="logoutAllAccountsAndResetEasterEgg()"'));
    assert(html.includes('已达成成就'));
    assert(html.includes('世界和平！'));
    assert(!/id="login-easter-egg-input"[^>]*maxlength="4"/.test(html), 'IME composition must not be truncated before Chinese text is committed');

    const easterEggRenderer = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '08-account', '00-login-easter-egg.js'), 'utf8');
    assert(easterEggRenderer.includes('playLoginEasterEggUnlockCinematic()'));
    assert(easterEggRenderer.includes('dismissLoginEasterEggCinematic()'));
    assert(easterEggRenderer.includes('showLoginEasterEggAchievement()'));
    assert(easterEggRenderer.includes('prepareLoginEasterEggPixelPhrase(phrase)'));
    assert(easterEggRenderer.includes("pixels.data[i + 3] >= 92"));
    assert(easterEggRenderer.includes('requestLoginEasterEggReplayReset()'));
    assert(easterEggRenderer.includes('resetLoginEasterEggUiForReplay()'));
    assert(easterEggRenderer.includes("input.addEventListener('compositionstart'"));
    assert(easterEggRenderer.includes('scheduleLoginEasterEggInputFocus()'));
    assert(easterEggRenderer.includes('function restoreLoginEasterEggInputSurface(clearValue)'));
    assert(easterEggRenderer.includes("input.removeAttribute('inert')"));
    assert(easterEggRenderer.includes('restoreLoginEasterEggInputSurface(true)'));
    assert(easterEggRenderer.includes('loginEasterEggState.focusRequestId'));
    assert(easterEggRenderer.includes("requestLoginEasterEggKeyboardFocus(reason || 'focus').then"));
    assert(easterEggRenderer.includes('document.activeElement === input && document.hasFocus()'));
    assert(easterEggRenderer.includes('if (document.hasFocus())'));
    assert(easterEggRenderer.includes('event.isComposing || loginEasterEggState.composing || event.keyCode === 229'));
    assert(!easterEggRenderer.includes("requestLoginEasterEggKeyboardFocus('wish-pointerdown')"));
    assert(/api\.requestDesktopKeyboardFocus\([\s\S]{0,120}'login-easter-egg-'/.test(easterEggRenderer));
    assert(easterEggRenderer.includes('function playLoginEasterEggAchievementChime()'));
    assert(easterEggRenderer.includes('[2093.00, 0.36, 0.82]'));
    assert(easterEggRenderer.includes('playLoginEasterEggAchievementChime();'));

    const logoutRenderer = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '08-account', '04-user-modal-logout.js'), 'utf8');
    assert(logoutRenderer.includes('function logoutAllAccountsAndResetEasterEgg()'));
    assert(!logoutRenderer.includes("apiJson('/api/spotify/logout')"));
    assert(logoutRenderer.includes('resetAllProviderRendererLoginState()'));
    assert(logoutRenderer.includes('resetLoginEasterEggUiForReplay()'));
    assert(logoutRenderer.includes('armLogoutAllAccountsResetConfirmation()'));
    assert(logoutRenderer.includes("button.textContent = '再次点击确认'"));
    assert(!logoutRenderer.includes('window.confirm('));

    const splashRenderer = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '10-shell', '03-splash.js'), 'utf8');
    assert(splashRenderer.includes('function retroChord(frequencies, startAt, dur, peak)'));
    assert(splashRenderer.includes('Am7 -> Fmaj7 -> Cmaj7 -> G6'));
    assert(splashRenderer.includes('[220.00, 261.63, 329.63, 392.00]'));

    const desktopMain = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
    assert(desktopMain.includes("ipcMain.handle('mineradio-full-desktop-request-keyboard-focus'"));
    assert(desktopMain.includes("fullDesktopModeRuntime.getStatus('renderer-keyboard-focus-fallback')"));
    assert(desktopMain.includes('if (desktopStatus && desktopStatus.enabled) {'));
    assert(desktopMain.includes('ordinaryWindowImeFocusRepairs.get(webContents)'));
    assert(desktopMain.includes('ordinaryWindowImeFocusRepairs.set(webContents, repair)'));
    assert(desktopMain.includes('webContents.blur();'));
    assert(desktopMain.includes('win.focus();'));
    assert(desktopMain.includes('webContents.focus();'));
    assert(/requestDesktopKeyboardFocus:[\s\S]{0,120}ipcRenderer\.invoke\(/.test(preload));

    console.log('[OK] Login easter egg gate, one-time reset, account identity, cinematic, achievement, and route guards verified.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
