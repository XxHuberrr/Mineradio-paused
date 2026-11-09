'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { extractKugouAuth } = require('../kugou-api');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');
const openSource = main.slice(
  main.indexOf('async function openKugouMusicLoginWindow('),
  main.indexOf('async function clearKugouMusicLoginSession('),
);

function loginHarness(initialCookie) {
  const state = { cookie: initialCookie, clearCount: 0, windows: [], intervals: new Set() };
  const cookieSession = {
    async clearStorageData(options) {
      assert.ok(options.storages.includes('cookies'));
      state.clearCount += 1;
      state.cookie = '';
    },
  };
  class LoginWindow extends EventEmitter {
    constructor(options) {
      super();
      assert.equal(options.webPreferences.partition, 'synthetic-kugou-partition');
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.executeJavaScript = async () => {};
      this.destroyed = false;
      state.windows.push(this);
    }
    async loadURL(url) { this.url = url; }
    isDestroyed() { return this.destroyed; }
    show() {}
    close() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.emit('closed');
    }
  }
  const context = vm.createContext({
    session: { fromPartition: (partition) => {
      assert.equal(partition, 'synthetic-kugou-partition');
      return cookieSession;
    } },
    readKugouLoginCookieHeader: async () => state.cookie,
    kugouCookieHasPlayback: (cookie) => extractKugouAuth(cookie).playbackReady,
    kugouCookieHasLogin: (cookie) => extractKugouAuth(cookie).loggedIn,
    BrowserWindow: LoginWindow,
    KUGOU_LOGIN_PARTITION: 'synthetic-kugou-partition',
    KUGOU_LOGIN_URL: 'https://www.kugou.com/',
    KUGOU_LOGIN_WARMUP_URL: 'https://www.kugou.com/newuc/user/uc/type=edit',
    APP_ICON_ICO: '',
    console,
    setInterval: (callback) => { state.intervals.add(callback); return callback; },
    clearInterval: (callback) => state.intervals.delete(callback),
    setTimeout,
  });
  vm.runInContext(openSource, context);
  return { state, open: context.openKugouMusicLoginWindow };
}

test('Kugou ordinary login keeps a reusable session without clearing storage', async () => {
  const harness = loginHarness('userid=123456; token=synthetic-existing-token');
  const result = await harness.open(null);
  assert.equal(result.ok, true);
  assert.equal(result.reused, true);
  assert.equal(harness.state.clearCount, 0);
  assert.equal(harness.state.windows.length, 0);
});

test('Kugou explicit re-login discards a revoked token before reuse and completes with a fresh session', async () => {
  const harness = loginHarness('userid=123456; token=synthetic-revoked-token');
  const completion = harness.open(null, { forceReauth: true });
  await new Promise(setImmediate);
  assert.equal(harness.state.clearCount, 1);
  assert.equal(harness.state.cookie, '');
  assert.equal(harness.state.windows.length, 1);
  const window = harness.state.windows[0];
  assert.equal(window.url, 'https://www.kugou.com/');
  harness.state.cookie = 'userid=123456; token=synthetic-fresh-token';
  window.webContents.emit('did-finish-load');
  const result = await completion;
  assert.equal(result.ok, true);
  assert.equal(result.reused, undefined);
  assert.equal(result.cookie, harness.state.cookie);
  assert.equal(window.isDestroyed(), true);
  assert.equal(harness.state.intervals.size, 0);
});

test('Kugou only literal true requests storage clearing', async () => {
  for (const options of [null, {}, { forceReauth: false }, { forceReauth: 'true' }]) {
    const harness = loginHarness('userid=123456; token=synthetic-existing-token');
    const result = await harness.open(null, options);
    assert.equal(result.reused, true);
    assert.equal(harness.state.clearCount, 0);
  }
});

test('Kugou cancelled re-login never returns the discarded session', async () => {
  const harness = loginHarness('userid=123456; token=synthetic-revoked-token');
  const completion = harness.open(null, { forceReauth: true });
  await new Promise(setImmediate);
  harness.state.windows[0].close();
  const result = await completion;
  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.cookie, undefined);
  assert.equal(harness.state.intervals.size, 0);
});

test('Kugou renderer re-login options reach the main handler and retain the login gate', async () => {
  let desktopApi;
  let handler;
  let unlocked = true;
  const owner = {};
  const calls = [];
  const handlerSource = main.slice(
    main.indexOf("ipcMain.handle('kugou-music-open-login'"),
    main.indexOf("ipcMain.handle('kugou-music-clear-login'"),
  );
  vm.runInNewContext(handlerSource, {
    ipcMain: { handle: (_channel, callback) => { handler = callback; } },
    loginEasterEggGate: { isUnlocked: () => unlocked },
    loginEasterEggLockedResult: () => ({ ok: false, error: 'LOCKED' }),
    getSenderWindow: () => owner,
    openKugouMusicLoginWindow: async (receivedOwner, options) => {
      assert.equal(receivedOwner, owner);
      calls.push(options);
      return { ok: true };
    },
  });
  vm.runInNewContext(fs.readFileSync(path.join(root, 'desktop/preload.js'), 'utf8'), {
    require: () => ({
      contextBridge: { exposeInMainWorld: (_name, value) => { desktopApi = value; } },
      ipcRenderer: { invoke: (channel, options) => {
        assert.equal(channel, 'kugou-music-open-login');
        return handler({}, options);
      } },
    }),
    window: { addEventListener() {} },
  });
  await desktopApi.openKugouMusicLogin({ forceReauth: true });
  assert.equal(calls[0].forceReauth, true);
  await desktopApi.openKugouMusicLogin();
  assert.equal(calls[1].forceReauth, undefined);
  unlocked = false;
  const result = await desktopApi.openKugouMusicLogin({ forceReauth: true });
  assert.equal(result.error, 'LOCKED');
  assert.equal(calls.length, 2);
});
