'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
const throttling = main.slice(main.indexOf('function setMainWindowBackgroundThrottling('), main.indexOf('function suspendWallpaperEngineForHiddenHost('));
const sendState = main.slice(main.indexOf('function sendWindowState('), main.indexOf('function sendGlobalHotkeyAction('));

function harness() {
  let throttled = true;
  const writes = [];
  const state = { isVisible: true, isMinimized: false, isDesktopEmbedded: false };
  const runtime = { active: true, captureMode: 'dwm-thumbnail' };
  const win = {
    isDestroyed: () => false,
    isVisible: () => state.isVisible,
    isMinimized: () => state.isMinimized,
    webContents: {
      isDestroyed: () => false,
      getBackgroundThrottling: () => throttled,
      setBackgroundThrottling(value) { throttled = value; writes.push(value); },
      send() {},
    },
  };
  const context = vm.createContext({
    wallpaperEngineRuntime: { getStatus: () => runtime },
    fullDesktopModeRuntime: { getStatus: () => ({ enabled: state.isDesktopEmbedded }) },
    MAIN_WINDOW_BACKGROUND_THROTTLING: true,
    wallpaperEngineHostVisibilityResumePending: true,
    wallpaperEngineHostVisibilityResumeTimer: null,
    getWindowState: () => state,
    clearTimeout() {},
  });
  vm.runInContext(throttling + sendState, context);
  return { context, win, state, runtime, writes, throttled: () => throttled };
}

test('visible native Wallpaper stays painting after capture and resume finish', () => {
  const h = harness();
  h.context.finishWallpaperEngineVisibleHostResume(h.win);
  assert.equal(h.throttled(), false, 'native wallpaper must not let Chromium hide the visible lyrics layer');
  h.context.sendWindowState(h.win);
  assert.equal(h.throttled(), false);
  assert.deepEqual(h.writes, [false], 'unchanged state must not toggle compositor visibility again');
});

test('minimize and restore change throttling without restarting the native Wallpaper', () => {
  const h = harness();
  h.context.wallpaperEngineHostVisibilityResumePending = false;
  h.context.sendWindowState(h.win);
  assert.equal(h.throttled(), false);
  h.state.isMinimized = true;
  h.state.isVisible = false;
  h.context.sendWindowState(h.win);
  assert.equal(h.throttled(), true);
  h.state.isMinimized = false;
  h.state.isVisible = true;
  h.context.sendWindowState(h.win);
  assert.equal(h.throttled(), false);
  assert.equal(h.runtime.active, true);
});

test('stopping native Wallpaper restores the ordinary window policy', () => {
  const h = harness();
  h.context.wallpaperEngineHostVisibilityResumePending = false;
  h.context.sendWindowState(h.win);
  assert.equal(h.throttled(), false);
  h.runtime.active = false;
  h.context.sendWindowState(h.win);
  assert.equal(h.throttled(), true);
  h.runtime.active = true;
  h.runtime.captureMode = 'video';
  h.context.sendWindowState(h.win);
  assert.equal(h.throttled(), true);
  h.state.isDesktopEmbedded = true;
  h.context.sendWindowState(h.win);
  assert.equal(h.throttled(), false, 'desktop embedding keeps its existing rendering policy');
});

test('a destroyed renderer is not notified during Wallpaper cleanup', () => {
  const h = harness();
  h.win.webContents.isDestroyed = () => true;
  h.win.webContents.send = () => { throw new Error('renderer was destroyed'); };
  assert.doesNotThrow(() => h.context.sendWindowState(h.win));
});
