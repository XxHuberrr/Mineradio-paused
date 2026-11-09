'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  FullDesktopModeRuntime,
  desktopWindowCoexistAttachScript,
  desktopWindowDetachScript,
} = require('../desktop/full-desktop-mode-runtime');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class FakeWebContents {
  constructor(owner) {
    this.owner = owner;
    this.backgroundThrottling = true;
    this.focused = false;
  }

  setBackgroundThrottling(value) {
    this.backgroundThrottling = !!value;
    this.owner.calls.push(['setBackgroundThrottling', !!value]);
  }

  getBackgroundThrottling() {
    return this.backgroundThrottling;
  }

  focus() {
    this.focused = true;
    this.owner.calls.push(['webContents.focus']);
  }

  blur() {
    this.focused = false;
    this.owner.calls.push(['webContents.blur']);
  }

  isFocused() {
    return this.focused;
  }
}

class FakeBrowserWindow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.id = options.id || 17;
    this.destroyed = false;
    this.bounds = { ...(options.bounds || { x: 120, y: 90, width: 1180, height: 720 }) };
    this.normalBounds = { ...this.bounds };
    this.minimumSize = [960, 540];
    this.maximized = !!options.maximized;
    this.fullScreen = !!options.fullScreen;
    this.minimized = false;
    this.visible = true;
    this.focused = true;
    this.resizable = true;
    this.movable = true;
    this.focusable = true;
    this.skipTaskbar = false;
    this.shadowEnabled = options.hasShadow !== false;
    this.ignoreMouse = false;
    this.shape = [];
    this.calls = [];
    this.webContents = new FakeWebContents(this);
  }

  isDestroyed() { return this.destroyed; }
  isMaximized() { return this.maximized; }
  isFullScreen() { return this.fullScreen; }
  isMinimized() { return this.minimized; }
  isVisible() { return this.visible; }
  isFocused() { return this.focused; }
  hasShadow() { return this.shadowEnabled; }
  getBounds() { return { ...this.bounds }; }
  getNormalBounds() { return { ...this.normalBounds }; }
  getMinimumSize() { return this.minimumSize.slice(); }

  getNativeWindowHandle() {
    const handle = Buffer.alloc(8);
    handle.writeBigUInt64LE(424242n, 0);
    return handle;
  }

  setBounds(bounds) {
    this.bounds = { ...bounds };
    if (!this.maximized && !this.fullScreen) this.normalBounds = { ...bounds };
    this.calls.push(['setBounds', { ...bounds }]);
  }

  setMinimumSize(width, height) {
    this.minimumSize = [Number(width), Number(height)];
    this.calls.push(['setMinimumSize', Number(width), Number(height)]);
  }

  setResizable(value) { this.resizable = !!value; this.calls.push(['setResizable', !!value]); }
  setMovable(value) { this.movable = !!value; this.calls.push(['setMovable', !!value]); }
  setFocusable(value) { this.focusable = !!value; this.calls.push(['setFocusable', !!value]); }
  setSkipTaskbar(value) { this.skipTaskbar = !!value; this.calls.push(['setSkipTaskbar', !!value]); }
  setHasShadow(value) { this.shadowEnabled = !!value; this.calls.push(['setHasShadow', !!value]); }

  setIgnoreMouseEvents(value, options) {
    this.ignoreMouse = !!value;
    this.calls.push(['setIgnoreMouseEvents', !!value, options]);
  }

  setShape(rects) {
    this.shape = Array.isArray(rects) ? rects.map((rect) => ({ ...rect })) : [];
    this.calls.push(['setShape', this.shape.map((rect) => ({ ...rect }))]);
  }

  setFullScreen(value) {
    this.fullScreen = !!value;
    this.calls.push(['setFullScreen', !!value]);
  }

  maximize() { this.maximized = true; this.calls.push(['maximize']); }
  unmaximize() { this.maximized = false; this.calls.push(['unmaximize']); }
  restore() { this.minimized = false; this.calls.push(['restore']); }
  show() { this.visible = true; this.calls.push(['show']); }
  showInactive() { this.visible = true; this.focused = false; this.calls.push(['showInactive']); }
  hide() { this.visible = false; this.calls.push(['hide']); }
  focus() { this.focused = true; this.calls.push(['focus']); }
  blur() { this.focused = false; this.webContents.focused = false; this.calls.push(['blur']); }
  moveTop() { this.calls.push(['moveTop']); }
}

function makeRuntime(options = {}) {
  const calls = {
    attach: [],
    coexist: [],
    detach: [],
    probe: [],
    watcherStart: [],
    watcherStop: [],
    iconVisibility: [],
    beforePassive: [],
    status: [],
  };
  const screen = options.screen || {
    getPrimaryDisplay: () => ({
      id: 7,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      scaleFactor: 1,
    }),
    getDisplayMatching: () => ({
      id: 7,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      scaleFactor: 1,
    }),
    dipToScreenRect: (_win, bounds) => ({ ...bounds }),
  };

  const runtime = new FullDesktopModeRuntime({
    screen,
    platform: 'win32',
    nativeTempPath: 'D:\\MineradioCache\\native-helper-temp',
    requestReconcile: typeof options.requestReconcile === 'function'
      ? options.requestReconcile
      : null,
    beforePassive: async (input) => {
      calls.beforePassive.push(input);
      if (typeof options.beforePassive === 'function') {
        return options.beforePassive(input, calls.beforePassive.length);
      }
      return { ok: true };
    },
    attachNative: async (input) => {
      calls.attach.push(input);
      if (typeof options.attachNative === 'function') return options.attachNative(input, calls.attach.length);
      return {
        ok: true,
        targetWindowId: String(input && input.hwnd || '424242'),
        parentWindowId: '9001',
        parentClassName: 'WorkerW',
      };
    },
    attachCoexistNative: async (input) => {
      calls.coexist.push(input);
      if (typeof options.attachCoexistNative === 'function') {
        return options.attachCoexistNative(input, calls.coexist.length);
      }
      return {
        ok: true,
        coexist: true,
        targetWindowId: String(input && input.hwnd || '424242'),
        parentWindowId: '8200',
        parentClassName: 'SHELLDLL_DefView',
        topLevelHostWindowId: '8100',
        desktopViewWindowId: '8200',
        desktopListWindowId: '8300',
        child: true,
        popup: false,
      };
    },
    detachNative: async (input) => {
      calls.detach.push(input);
      if (typeof options.detachNative === 'function') return options.detachNative(input, calls.detach.length);
      return { ok: true, targetWindowId: String(input && input.hwnd || '424242') };
    },
    probeDesktopIcons: async (input) => {
      calls.probe.push(input);
      if (typeof options.probeDesktopIcons === 'function') return options.probeDesktopIcons(input, calls.probe.length);
      return {
        ok: true,
        iconHostWindowId: '8200',
        listViewWindowId: '8300',
        topLevelHostWindowId: '8100',
        physicalPixels: true,
        icons: [{ x: 8, y: 8, width: 86, height: 92 }],
      };
    },
    startDesktopIconWatcher: (input) => {
      calls.watcherStart.push(input);
      let running = true;
      let layout = {
        ok: true,
        watcher: true,
        nativeLayerApplied: true,
        nativeBackgroundKeyApplied: true,
        compositionMode: 'layered-color-key',
        desktopIconsVisible: true,
        iconsVisible: true,
        controlSequence: 0,
        shieldWindowId: '0',
        iconHostWindowId: '8200',
        listViewWindowId: '8300',
        topLevelHostWindowId: '8100',
        physicalPixels: true,
        icons: [{ x: 8, y: 8, width: 86, height: 92 }],
      };
      const watcher = {
        ready: Promise.resolve(layout),
        getLastLayout: () => layout,
        setIconsVisible: async (visible) => {
          const nextVisible = visible !== false;
          calls.iconVisibility.push(nextVisible);
          layout = {
            ...layout,
            desktopIconsVisible: nextVisible,
            iconsVisible: nextVisible,
            controlSequence: layout.controlSequence + 1,
          };
          return layout;
        },
        ensureOrder: async () => {
          layout = { ...layout, controlSequence: layout.controlSequence + 1 };
          return layout;
        },
        stop: async () => {
          if (running) calls.watcherStop.push(true);
          running = false;
          return { ok: true, code: 0, restored: true };
        },
        isRunning: () => running,
      };
      if (typeof options.startDesktopIconWatcher === 'function') {
        return options.startDesktopIconWatcher(input, calls.watcherStart.length, watcher);
      }
      return watcher;
    },
    onStatus: (status) => calls.status.push(status),
    logger: { log() {}, warn() {}, error() {} },
  });
  return { runtime, calls };
}

test('enable defaults to a fully interactive Mineradio desktop', async () => {
  const win = new FakeBrowserWindow();
  const { runtime, calls } = makeRuntime();

  const result = await runtime.enable(win, { reason: 'test-enable' });
  const status = runtime.getStatus('test-enable-result');

  assert.equal(result.ok, true);
  assert.equal(status.enabled, true);
  assert.equal(status.active, true);
  assert.equal(status.interactive, true);
  assert.equal(status.coexisting, true);
  assert.equal(status.iconShapeActive, true);
  assert.equal(status.iconLayerMode, 'explorer-layered-colorkey');
  assert.equal(status.iconCount, 1);
  assert.equal(status.desktopIconsVisible, true);
  assert.equal(status.softwareInteractionLocked, false);
  assert.equal(status.ignoreMouseEvents, false);
  assert.equal(status.iconInteractionLocked, false);
  assert.deepEqual(status.pointerRoute, { overSoftwareUi: false, overDesktopControls: false });
  assert.equal(status.nativeWindowId, '424242');
  assert.equal(status.attaching, false);
  assert.deepEqual(status.workArea, { x: 0, y: 0, width: 1920, height: 1040 });
  assert.deepEqual(status.safeInsets, { top: 0, right: 0, bottom: 40, left: 0 });
  assert.deepEqual(runtime.attachment.workArea, status.workArea);
  assert.deepEqual(runtime.attachment.safeInsets, status.safeInsets);
  assert.equal(runtime.isEnabled(), true);
  assert.equal(runtime.isInteractive(), true);
  assert.equal(win.ignoreMouse, false);
  assert.equal(win.focusable, true);
  assert.equal(win.focused, false);
  assert.equal(win.webContents.backgroundThrottling, false);
  assert.equal(win.shadowEnabled, false, 'desktop child must not retain a top-level native shadow');
  assert.equal(calls.attach.length, 0, 'interactive enable must not enter the passive wallpaper WorkerW');
  assert.equal(calls.coexist.length, 1, 'interactive enable must attach the complete Mineradio surface below the real desktop icons');
  assert.equal(calls.detach.length, 0, 'initial top-level window must not make an unnecessary detach round trip');
  assert.equal(win.calls.some((call) => call[0] === 'hide'), true, 'coexistence attach must stay hidden until native color-key ACK');
  assert.equal(win.calls.some((call) => call[0] === 'focus'), false, 'interactive desktop must not steal focus');
  const routeCall = win.calls.filter((call) => call[0] === 'setIgnoreMouseEvents').at(-1);
  assert.deepEqual(routeCall, ['setIgnoreMouseEvents', false, undefined]);
  assert.deepEqual(win.shape, [], 'continuous Mineradio surface must not contain desktop icon holes');
});

test('toggling to passive mode attaches the same main window to WorkerW', async () => {
  const win = new FakeBrowserWindow();
  const { runtime, calls } = makeRuntime();
  await runtime.enable(win, { interactive: true, reason: 'test-interactive' });
  const attachCountBefore = calls.attach.length;
  const detachCountBefore = calls.detach.length;

  const result = await runtime.toggleInteractive('test-passive');
  const status = runtime.getStatus('test-passive-result');

  assert.equal(result.ok, true);
  assert.equal(status.enabled, true);
  assert.equal(status.interactive, false);
  assert.equal(status.attaching, false);
  assert.equal(calls.attach.length, attachCountBefore + 1);
  assert.equal(calls.detach.length, detachCountBefore + 1,
    'DefView coexist child was not normalized to top-level before passive WorkerW attach');
  assert.equal(win.ignoreMouse, true);
  assert.equal(win.focusable, false);
  assert.equal(win.webContents.backgroundThrottling, false);
  const ignoreCall = win.calls.filter((call) => call[0] === 'setIgnoreMouseEvents' && call[1] === true).at(-1);
  assert.equal(ignoreCall && ignoreCall[2], undefined, 'passive mode must not enable forwarded synthetic pointer events');
  assert.equal(status.parentClassName, 'WorkerW');
});

test('passive preparation is serialized before hiding or attaching the main window', async () => {
  const win = new FakeBrowserWindow();
  const prepared = deferred();
  const { runtime, calls } = makeRuntime({
    beforePassive: async () => prepared.promise,
  });
  await runtime.enable(win, { interactive: true, reason: 'prepare-order-enable' });
  const hideCountBefore = win.calls.filter((call) => call[0] === 'hide').length;

  const transition = runtime.setInteractive(false, 'prepare-order-passive');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.beforePassive.length, 1);
  assert.equal(calls.attach.length, 0, 'WorkerW attach ran before preview/session preparation settled');
  assert.equal(win.visible, true, 'the interactive window was hidden before preparation settled');
  assert.equal(win.calls.filter((call) => call[0] === 'hide').length, hideCountBefore);

  prepared.resolve({ ok: true, preview: true, stopped: true });
  const result = await transition;
  assert.equal(result.ok, true);
  assert.equal(result.interactive, false);
  assert.equal(calls.attach.length, 1);
  assert.equal(win.ignoreMouse, true);
});

test('passive preparation failure leaves the full Mineradio window interactive', async () => {
  const win = new FakeBrowserWindow();
  const { runtime, calls } = makeRuntime({
    beforePassive: async () => ({ ok: false, error: 'SYNTHETIC_PREVIEW_PREPARE_FAILURE' }),
  });
  await runtime.enable(win, { interactive: true, reason: 'prepare-failure-enable' });
  const hideCountBefore = win.calls.filter((call) => call[0] === 'hide').length;

  const result = await runtime.setInteractive(false, 'prepare-failure-passive');
  const status = runtime.getStatus('prepare-failure-result');

  assert.equal(result.ok, false);
  assert.match(String(result.error), /SYNTHETIC_PREVIEW_PREPARE_FAILURE/);
  assert.equal(status.enabled, true);
  assert.equal(status.interactive, true);
  assert.equal(status.phase, 'interactive');
  assert.equal(calls.attach.length, 0, 'failed preparation must not enter WorkerW');
  assert.equal(win.calls.filter((call) => call[0] === 'hide').length, hideCountBefore);
  assert.equal(win.visible, true);
  assert.equal(win.ignoreMouse, false);
  assert.equal(win.focusable, true);
});

test('dispose during passive preparation prevents a late WorkerW attach', async () => {
  const win = new FakeBrowserWindow();
  const prepared = deferred();
  const { runtime, calls } = makeRuntime({
    beforePassive: async () => prepared.promise,
  });
  await runtime.enable(win, { interactive: true, reason: 'prepare-dispose-enable' });

  const transition = runtime.setInteractive(false, 'prepare-dispose-passive');
  await new Promise((resolve) => setImmediate(resolve));
  const disposing = runtime.dispose('prepare-dispose');
  prepared.resolve({ ok: true, preview: true, stopped: true });
  const [transitionResult, disposeResult] = await Promise.all([transition, disposing]);

  assert.equal(transitionResult.ok, false);
  assert.match(String(transitionResult.error), /FULL_DESKTOP_PASSIVE_PREPARE_SUPERSEDED/);
  assert.equal(disposeResult.ok, true);
  assert.equal(runtime.getStatus('prepare-dispose-result').enabled, false);
  assert.equal(calls.attach.length, 0, 'dispose allowed a prepared transition to attach after cancellation');
  assert.equal(win.visible, true);
  assert.equal(win.ignoreMouse, false);
});

test('disable detaches and restores the exact pre-desktop window state', async () => {
  const originalBounds = { x: 144, y: 88, width: 1260, height: 760 };
  const win = new FakeBrowserWindow({ bounds: originalBounds });
  const { runtime, calls } = makeRuntime();
  await runtime.enable(win, { interactive: true, reason: 'test-restore-enable' });
  await runtime.setInteractive(false, 'test-restore-passive');
  const detachCountBefore = calls.detach.length;

  const result = await runtime.disable('test-disable');
  const status = runtime.getStatus('test-disable-result');

  assert.equal(result.ok, true);
  assert.equal(status.enabled, false);
  assert.equal(status.active, false);
  assert.equal(status.interactive, false);
  assert.ok(calls.detach.length > detachCountBefore, 'disable must detach a passive WorkerW child before restoring');
  assert.deepEqual(win.getBounds(), originalBounds);
  assert.equal(win.resizable, true);
  assert.equal(win.movable, true);
  assert.equal(win.focusable, true);
  assert.equal(win.ignoreMouse, false);
  assert.equal(win.webContents.backgroundThrottling, true);
  assert.equal(win.shadowEnabled, true, 'normal-window native shadow was not restored');
});

test('software lock passes normal areas through while the controller remains an unlock island', async () => {
  const win = new FakeBrowserWindow();
  const { runtime } = makeRuntime();
  await runtime.enable(win, { interactive: true, reason: 'software-lock-enable' });

  const before = runtime.getStatus('software-lock-before');
  assert.deepEqual(before.iconRevealRects, [{ x: 8, y: 8, width: 86, height: 92 }]);
  assert.deepEqual(win.shape, []);
  assert.equal(win.ignoreMouse, false);

  const overSoftware = runtime.updatePointerRoute({
    overSoftwareUi: true,
    overDesktopControls: false,
  });
  assert.equal(overSoftware.ignoreMouseEvents, false);
  assert.equal(win.ignoreMouse, false);

  const locked = await runtime.setSoftwareInteractionLocked(true, 'software-lock-on');
  assert.equal(locked.ok, true);
  assert.equal(locked.locked, true);
  assert.equal(locked.error, '');
  assert.equal(locked.status.ignoreMouseEvents, true);
  assert.equal(win.ignoreMouse, true, 'locked software areas must pass input through to Explorer');
  const lockedRouteCall = win.calls.filter((call) => call[0] === 'setIgnoreMouseEvents').at(-1);
  assert.deepEqual(lockedRouteCall, ['setIgnoreMouseEvents', true, { forward: true }],
    'locked mode must keep forwarded pointer movement for the recovery corridor');

  const overControls = runtime.updatePointerRoute({
    overSoftwareUi: true,
    overDesktopControls: true,
  });
  assert.equal(overControls.ignoreMouseEvents, false);
  assert.equal(win.ignoreMouse, false, 'the same top-right controller must stay clickable while locked');
  assert.equal(runtime.interactiveBindingHealthy(), true);

  runtime.updatePointerRoute({ overSoftwareUi: false, overDesktopControls: false });
  assert.equal(win.ignoreMouse, true, 'leaving the controller must restore locked desktop pass-through');
  assert.equal(runtime.interactiveBindingHealthy(), true);

  runtime.updatePointerRoute({ overSoftwareUi: false, overDesktopControls: true });
  assert.equal(win.ignoreMouse, false, 'entering the recovery corridor must make unlock reachable again');

  const unlocked = await runtime.setIconInteractionLocked(false, 'legacy-icon-lock-off');
  assert.equal(unlocked.ok, true);
  assert.equal(unlocked.locked, false);
  const unlockedStatus = runtime.getStatus('software-lock-off-status');
  assert.equal(unlockedStatus.softwareInteractionLocked, false);
  assert.equal(unlockedStatus.ignoreMouseEvents, false);
  assert.equal(unlockedStatus.iconInteractionLocked, false);
  assert.equal(win.ignoreMouse, false, 'unlock from the controller must immediately restore natural Mineradio input');
  runtime.updatePointerRoute({ overSoftwareUi: true, overDesktopControls: false });
  assert.equal(win.ignoreMouse, false, 'unlocked software UI must receive natural pointer input');
  assert.deepEqual(win.shape, []);
});

test('trusted desktop pointer focus restores web contents without raising the DefView child window', async () => {
  const win = new FakeBrowserWindow();
  const { runtime } = makeRuntime();
  await runtime.enable(win, { interactive: true, reason: 'keyboard-focus-enable' });

  const result = runtime.requestKeyboardFocus('trusted-pointerdown');
  assert.equal(result.ok, true);
  assert.equal(result.focused, true);
  assert.equal(win.webContents.isFocused(), true);
  assert.equal(win.focused, false, 'web-content focus must not activate or raise the DefView child HWND');
  assert.equal(win.calls.some((call) => call[0] === 'focus'), false,
    'keyboard restoration must not call BrowserWindow.focus()');
  assert.equal(win.calls.some((call) => call[0] === 'moveTop'), false,
    'keyboard restoration must not call BrowserWindow.moveTop()');
});

test('software lock blurs keyboard focus and rejects focus requests until unlocked', async () => {
  const win = new FakeBrowserWindow();
  const { runtime } = makeRuntime();
  await runtime.enable(win, { interactive: true, reason: 'keyboard-lock-enable' });
  assert.equal(runtime.requestKeyboardFocus('keyboard-before-lock').ok, true);
  assert.equal(win.webContents.isFocused(), true);

  const locked = await runtime.setSoftwareInteractionLocked(true, 'keyboard-lock-on');
  assert.equal(locked.ok, true);
  assert.equal(win.webContents.isFocused(), false);
  assert.equal(win.focusable, false);
  assert.equal(win.calls.some((call) => call[0] === 'blur'), true);
  const rejected = runtime.requestKeyboardFocus('keyboard-while-locked');
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, 'DESKTOP_SOFTWARE_LOCKED');

  await runtime.setSoftwareInteractionLocked(false, 'keyboard-lock-off');
  assert.equal(win.focusable, true);
  assert.equal(runtime.requestKeyboardFocus('keyboard-after-unlock').ok, true);
  assert.equal(win.webContents.isFocused(), true);
});

test('keyboard focus requests are rejected outside interactive coexistence mode', async () => {
  const win = new FakeBrowserWindow();
  const { runtime } = makeRuntime();
  const disabled = runtime.requestKeyboardFocus('keyboard-disabled');
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error, 'DESKTOP_KEYBOARD_FOCUS_INACTIVE');

  await runtime.enable(win, { interactive: false, reason: 'keyboard-passive-enable' });
  const passive = runtime.requestKeyboardFocus('keyboard-passive');
  assert.equal(passive.ok, false);
  assert.equal(passive.error, 'DESKTOP_KEYBOARD_FOCUS_INACTIVE');
  assert.equal(win.webContents.isFocused(), false);
});

test('software lock is rejected while inactive and disable always restores normal window input', async () => {
  const win = new FakeBrowserWindow();
  const { runtime } = makeRuntime();

  const inactive = await runtime.setSoftwareInteractionLocked(true, 'software-lock-inactive');
  assert.equal(inactive.ok, false);
  assert.equal(inactive.error, 'DESKTOP_SOFTWARE_LOCK_INACTIVE');
  assert.equal(inactive.softwareInteractionLocked, false);

  await runtime.enable(win, { interactive: true, reason: 'software-lock-cleanup-enable' });
  runtime.updatePointerRoute({ overSoftwareUi: false, overDesktopControls: false });
  const locked = await runtime.setSoftwareInteractionLocked(true, 'software-lock-cleanup-on');
  assert.equal(locked.ok, true);
  assert.equal(win.ignoreMouse, true);

  const disabled = await runtime.disable('software-lock-cleanup-disable');
  assert.equal(disabled.ok, true);
  assert.equal(win.ignoreMouse, false);
  assert.equal(runtime.getStatus('software-lock-cleanup-status').softwareInteractionLocked, false);
});

test('desktop icon visibility uses the watcher and confirmed stop restores visible state', async () => {
  const win = new FakeBrowserWindow();
  const { runtime, calls } = makeRuntime();
  await runtime.enable(win, { interactive: true, reason: 'icons-visible-enable' });

  assert.deepEqual(calls.iconVisibility, [], 'entering must preserve Explorer\'s original visible state');
  const hidden = await runtime.setDesktopIconsVisible(false, 'icons-hidden');
  assert.equal(hidden.ok, true);
  assert.equal(hidden.desktopIconsVisible, false);
  assert.equal(runtime.getStatus('icons-hidden-status').desktopIconsVisible, false);
  assert.deepEqual(calls.iconVisibility, [false]);

  const disabled = await runtime.disable('icons-hidden-disable');
  assert.equal(disabled.ok, true);
  assert.equal(calls.watcherStop.length, 1);
  assert.equal(runtime.getStatus('icons-restored-after-stop').desktopIconsVisible, true);
});

test('unchanged desktop icon visibility is reasserted through the native watcher', async () => {
  const win = new FakeBrowserWindow();
  const { runtime, calls } = makeRuntime();
  await runtime.enable(win, { interactive: true, reason: 'icons-reassert-enable' });

  const shown = await runtime.setDesktopIconsVisible(true, 'icons-reassert-visible');
  assert.equal(shown.ok, true);
  assert.equal(shown.desktopIconsVisible, true);
  assert.deepEqual(calls.iconVisibility, [true],
    'an unchanged renderer flag skipped the native Explorer visibility reassertion');
});

test('desktop icon visibility failure rolls software state back to the acknowledged value', async () => {
  const win = new FakeBrowserWindow();
  let failNextHide = false;
  const { runtime, calls } = makeRuntime({
    startDesktopIconWatcher: (_input, _count, watcher) => ({
      ...watcher,
      setIconsVisible: async (visible) => {
        if (visible === false && failNextHide) {
          failNextHide = false;
          throw new Error('SYNTHETIC_ICON_VISIBILITY_FAILURE');
        }
        return watcher.setIconsVisible(visible);
      },
    }),
  });
  await runtime.enable(win, { interactive: true, reason: 'icons-rollback-enable' });
  failNextHide = true;

  const failed = await runtime.setDesktopIconsVisible(false, 'icons-rollback-failed');
  assert.equal(failed.ok, false);
  assert.match(failed.error, /SYNTHETIC_ICON_VISIBILITY_FAILURE/);
  assert.equal(failed.desktopIconsVisible, true);
  assert.equal(runtime.getStatus('icons-rollback-status').desktopIconsVisible, true);
  assert.deepEqual(calls.iconVisibility, [true], 'watcher was not restored to the previous visibility');
});

test('desktop mode adopts an initially hidden Explorer icon state without forcing it visible', async () => {
  const win = new FakeBrowserWindow();
  let restoredInitialVisibility = null;
  const { runtime, calls } = makeRuntime({
    startDesktopIconWatcher: (_input, _count, watcher) => {
      let running = true;
      const hiddenLayout = {
        ...watcher.getLastLayout(),
        desktopIconsVisible: false,
        iconsVisible: false,
      };
      return {
        ...watcher,
        ready: Promise.resolve(hiddenLayout),
        getLastLayout: () => hiddenLayout,
        ensureOrder: async () => hiddenLayout,
        stop: async () => {
          if (running) calls.watcherStop.push(true);
          running = false;
          restoredInitialVisibility = false;
          return { ok: true, code: 0, restored: true };
        },
        isRunning: () => running,
      };
    },
  });

  const enabled = await runtime.enable(win, { interactive: true, reason: 'icons-initially-hidden-enable' });
  assert.equal(enabled.ok, true);
  assert.equal(enabled.status.desktopIconsVisible, false);
  assert.deepEqual(calls.iconVisibility, [], 'entering forced a hidden Explorer desktop visible');

  const disabled = await runtime.disable('icons-initially-hidden-disable');
  assert.equal(disabled.ok, true);
  assert.equal(restoredInitialVisibility, false);
  assert.equal(calls.watcherStop.length, 1);
});

test('rapid interaction changes are serialized and finish disabled', async () => {
  const win = new FakeBrowserWindow();
  const firstAttach = deferred();
  let nativeInFlight = 0;
  let maxNativeInFlight = 0;
  const enterNative = () => {
    nativeInFlight += 1;
    maxNativeInFlight = Math.max(maxNativeInFlight, nativeInFlight);
  };
  const leaveNative = () => { nativeInFlight -= 1; };
  const { runtime } = makeRuntime({
    attachNative: async (_input, count) => {
      enterNative();
      try {
        if (count === 1) await firstAttach.promise;
        return { ok: true, targetWindowId: '424242', parentWindowId: '9001', parentClassName: 'WorkerW' };
      } finally {
        leaveNative();
      }
    },
    detachNative: async () => {
      enterNative();
      try {
        await Promise.resolve();
        return { ok: true, targetWindowId: '424242' };
      } finally {
        leaveNative();
      }
    },
  });

  const enabling = runtime.enable(win, { interactive: false, reason: 'rapid-enable' });
  const interactive = runtime.setInteractive(true, 'rapid-interactive');
  const passive = runtime.setInteractive(false, 'rapid-passive');
  const disabling = runtime.disable('rapid-disable');
  firstAttach.resolve();
  await Promise.allSettled([enabling, interactive, passive, disabling]);

  const status = runtime.getStatus('rapid-final');
  assert.equal(status.enabled, false);
  assert.equal(status.active, false);
  assert.equal(status.interactive, false);
  assert.equal(maxNativeInFlight, 1, 'native attach/detach operations overlapped');
  assert.equal(win.ignoreMouse, false);
  assert.equal(win.focusable, true);
});

test('native attach failure fails closed and restores the normal window', async () => {
  const originalBounds = { x: 80, y: 60, width: 1200, height: 740 };
  const win = new FakeBrowserWindow({ bounds: originalBounds });
  const { runtime } = makeRuntime({
    attachNative: async () => {
      throw new Error('SYNTHETIC_ATTACH_FAILURE');
    },
  });

  let result;
  try {
    result = await runtime.enable(win, { interactive: false, reason: 'test-fail-closed' });
  } catch (error) {
    result = { ok: false, error: String(error && error.message || error) };
  }
  const status = runtime.getStatus('test-fail-closed-result');

  assert.equal(result.ok, false);
  assert.equal(status.enabled, false);
  assert.equal(status.active, false);
  assert.equal(status.interactive, false);
  assert.match(String(result.error || status.lastError), /SYNTHETIC_ATTACH_FAILURE/);
  assert.deepEqual(win.getBounds(), originalBounds);
  assert.equal(win.ignoreMouse, false);
  assert.equal(win.focusable, true);
  assert.equal(win.webContents.backgroundThrottling, true);
});

test('coexist attach places the complete Mineradio surface below SysListView without mouse synthesis', () => {
  const script = desktopWindowCoexistAttachScript({
    hwnd: '424242',
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
  });
  assert.match(script, /SHELLDLL_DefView/);
  assert.match(script, /SysListView32/);
  assert.match(script, /SetParent\(\$target, \$defView\)/);
  assert.match(script, /SetWindowPos\(\$target, \[IntPtr\]::new\(1\)[\s\S]*0x0030/);
  assert.doesNotMatch(script, /SetWindowPos\(\$target, \[IntPtr\]::Zero[\s\S]*0x0030/);
  assert.doesNotMatch(script, /GetCursorPos|SetCursorPos|SendInput|SetWindowsHookEx|WM_MOUSEMOVE/);
});

test('legacy BrowserWindow shape is cleared before reparenting and never mutated after coexist attach', async () => {
  const win = new FakeBrowserWindow();
  let attached = false;
  let postAttachShapeCalls = 0;
  const originalSetShape = win.setShape.bind(win);
  win.setShape = (shape) => {
    if (attached) postAttachShapeCalls += 1;
    return originalSetShape(shape);
  };
  const { runtime } = makeRuntime({
    attachCoexistNative: async (input) => {
      attached = true;
      return {
        ok: true,
        coexist: true,
        targetWindowId: String(input.hwnd),
        parentWindowId: '8200',
        parentClassName: 'SHELLDLL_DefView',
        topLevelHostWindowId: '8100',
        desktopViewWindowId: '8200',
        desktopListWindowId: '8300',
        child: true,
        popup: false,
      };
    },
  });

  const enabled = await runtime.enable(win, { interactive: true, reason: 'shape-before-parent' });
  assert.equal(enabled.ok, true);
  const passive = await runtime.setInteractive(false, 'shape-passive');
  assert.equal(passive.ok, true);
  const interactive = await runtime.setInteractive(true, 'shape-interactive-again');
  assert.equal(interactive.ok, true);
  const disabled = await runtime.disable('shape-disabled');
  assert.equal(disabled.ok, true);
  assert.equal(postAttachShapeCalls, 0,
    'Electron setShape mutated the HWND after its first coexistence attach');
  assert.deepEqual(win.shape, []);
});

test('native detach validates parent only after converting WS_CHILD to WS_POPUP', () => {
  const script = desktopWindowDetachScript({
    hwnd: '424242',
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
  });
  const styleWrite = script.indexOf('SetWindowLongPtr($target, $GWL_STYLE');
  const parentValidation = script.indexOf('if ($parent -ne [IntPtr]::Zero)');
  assert.ok(styleWrite >= 0, 'detach script must convert the native window style');
  assert.ok(parentValidation > styleWrite, 'parent validation ran before WS_CHILD was cleared');
});

test('partial detach failure is strictly recovered to a known WorkerW passive state', async () => {
  const win = new FakeBrowserWindow();
  const { runtime, calls } = makeRuntime({
    detachNative: async (_input, count) => {
      if (count === 1) throw new Error('SYNTHETIC_PARTIAL_DETACH_FAILURE');
      return { ok: true, targetWindowId: '424242', parentWindowId: '0', child: false, popup: true };
    },
  });

  await runtime.enable(win, { interactive: false, reason: 'partial-detach-enable' });
  const result = await runtime.setInteractive(true, 'partial-detach-interactive');
  const status = runtime.getStatus('partial-detach-result');

  assert.equal(result.ok, false);
  assert.equal(result.recovered, 'passive');
  assert.equal(status.enabled, true);
  assert.equal(status.interactive, false);
  assert.equal(status.embedded, true);
  assert.equal(status.parentClassName, 'WorkerW');
  assert.equal(status.phase, 'passive');
  assert.equal(calls.attach.length, 2, 'detach failure did not perform a strict WorkerW reattach');
  assert.equal(win.visible, true);
  assert.equal(win.ignoreMouse, true);
  assert.equal(win.focusable, false);
});

test('failed detach recovery hides the window and never reports a stale passive attachment', async () => {
  const win = new FakeBrowserWindow();
  const { runtime, calls } = makeRuntime({
    attachNative: async (input, count) => {
      if (count > 1) throw new Error('SYNTHETIC_WORKERW_RECOVERY_FAILURE');
      return {
        ok: true,
        targetWindowId: String(input.hwnd),
        parentWindowId: '9001',
        parentClassName: 'WorkerW',
      };
    },
    detachNative: async () => {
      throw new Error('SYNTHETIC_DETACH_FAILURE');
    },
  });

  await runtime.enable(win, { interactive: false, reason: 'unknown-state-enable' });
  const result = await runtime.setInteractive(true, 'unknown-state-interactive');
  const status = runtime.getStatus('unknown-state-result');

  assert.equal(result.ok, false);
  assert.equal(result.recovered, 'hidden-unknown');
  assert.equal(result.nativeStateKnown, false);
  assert.equal(status.enabled, true, 'runtime must retain cleanup ownership of an uncertain HWND');
  assert.equal(status.interactive, false);
  assert.equal(status.embedded, false, 'stale WorkerW acknowledgement was reported after recovery failed');
  assert.equal(status.nativeStateKnown, false);
  assert.equal(status.parentWindowId, '');
  assert.equal(status.phase, 'error-unknown-native-state');
  assert.equal(win.visible, false, 'unknown native state must remain hidden instead of covering the desktop');
  assert.equal(win.ignoreMouse, true);
  assert.equal(calls.attach.length, 2);
  assert.equal(calls.detach.length, 2, 'fail-closed path did not attempt a final strict top-level restore');
});

test('failed WorkerW recovery falls back to a verified disabled top-level window when possible', async () => {
  const originalBounds = { x: 132, y: 84, width: 1210, height: 730 };
  const win = new FakeBrowserWindow({ bounds: originalBounds });
  const { runtime, calls } = makeRuntime({
    attachNative: async (input, count) => {
      if (count > 1) throw new Error('SYNTHETIC_WORKERW_RECOVERY_FAILURE');
      return {
        ok: true,
        targetWindowId: String(input.hwnd),
        parentWindowId: '9001',
        parentClassName: 'WorkerW',
      };
    },
    detachNative: async (_input, count) => {
      if (count === 1) throw new Error('SYNTHETIC_PARTIAL_DETACH_FAILURE');
      return {
        ok: true,
        targetWindowId: '424242',
        parentWindowId: '0',
        child: false,
        popup: true,
      };
    },
  });

  await runtime.enable(win, { interactive: false, reason: 'verified-fallback-enable' });
  const result = await runtime.setInteractive(true, 'verified-fallback-interactive');
  const status = runtime.getStatus('verified-fallback-result');

  assert.equal(result.ok, false);
  assert.equal(result.recovered, 'disabled');
  assert.equal(status.enabled, false);
  assert.equal(status.active, false);
  assert.equal(status.embedded, false);
  assert.equal(status.nativeStateKnown, true);
  assert.equal(status.phase, 'disabled');
  assert.deepEqual(win.getBounds(), originalBounds);
  assert.equal(win.visible, true);
  assert.equal(win.ignoreMouse, false);
  assert.equal(win.focusable, true);
  assert.equal(calls.attach.length, 2);
  assert.equal(calls.detach.length, 2);
});

test('removing the saved display rebases normal-window restore bounds onto an available display', async () => {
  const primary = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  };
  const secondary = {
    id: 2,
    bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
    workArea: { x: 1920, y: 0, width: 1920, height: 1040 },
  };
  let displays = [primary, secondary];
  const screen = {
    getAllDisplays: () => displays.slice(),
    getPrimaryDisplay: () => displays[0],
    getDisplayMatching: (bounds) => {
      const centerX = Number(bounds && bounds.x || 0) + Number(bounds && bounds.width || 1) / 2;
      return displays.find((display) => centerX >= display.bounds.x
        && centerX < display.bounds.x + display.bounds.width) || displays[0];
    },
    dipToScreenRect: (_win, bounds) => ({ ...bounds }),
  };
  const originalBounds = { x: 2160, y: 110, width: 1180, height: 720 };
  const win = new FakeBrowserWindow({ bounds: originalBounds });
  const { runtime } = makeRuntime({ screen });

  await runtime.enable(win, { interactive: true, reason: 'display-removal-enable' });
  displays = [primary];
  const reconciled = await runtime.reconcile('display-removed');
  assert.equal(reconciled.ok, true);
  const disabled = await runtime.disable('display-removal-disable');
  assert.equal(disabled.ok, true);

  const restored = win.getBounds();
  assert.deepEqual(restored, { x: 370, y: 160, width: 1180, height: 720 });
  assert.ok(restored.x >= primary.workArea.x
    && restored.x + restored.width <= primary.workArea.x + primary.workArea.width);
  assert.ok(restored.y >= primary.workArea.y
    && restored.y + restored.height <= primary.workArea.y + primary.workArea.height);
  assert.notDeepEqual(restored, originalBounds, 'window was restored to the disconnected display');
});

test('dispose invalidates queued interaction work before final cleanup', async () => {
  const win = new FakeBrowserWindow();
  const firstAttach = deferred();
  const { runtime, calls } = makeRuntime({
    attachNative: async (input, count) => {
      if (count === 1) await firstAttach.promise;
      return {
        ok: true,
        targetWindowId: String(input.hwnd),
        parentWindowId: '9001',
        parentClassName: 'WorkerW',
      };
    },
  });

  const enabling = runtime.enable(win, { interactive: false, reason: 'dispose-enable' });
  const queuedInteractive = runtime.setInteractive(true, 'dispose-queued-interactive');
  const disposing = runtime.dispose('dispose-test');
  firstAttach.resolve();
  await Promise.allSettled([enabling, queuedInteractive, disposing]);

  const status = runtime.getStatus('dispose-final');
  assert.equal(status.enabled, false);
  assert.equal(status.active, false);
  assert.equal(runtime.disposed, true);
  assert.equal(calls.attach.length, 0, 'dispose did not invalidate queued native attach work');
});

test('unconfirmed native-layer stop keeps the same watcher and cannot be bypassed by a second stop', async () => {
  const win = new FakeBrowserWindow();
  let callbacks = null;
  let watcher = null;
  let stopCalls = 0;
  const { runtime } = makeRuntime({
    startDesktopIconWatcher: (input, _count, baseWatcher) => {
      callbacks = input;
      watcher = {
        ...baseWatcher,
        stop: async () => {
          stopCalls += 1;
          return {
            ok: false,
            restored: false,
            error: 'DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED',
          };
        },
      };
      return watcher;
    },
  });

  await runtime.enable(win, { interactive: true, reason: 'restore-gate-enable' });
  await assert.rejects(runtime.stopIconShapeWatcher(), /DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED/);
  assert.equal(runtime.iconShapeWatcher, watcher);
  assert.equal(runtime.getStatus('first-stop-failed').nativeStateKnown, false);
  await assert.rejects(runtime.stopIconShapeWatcher(), /DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED/);
  assert.equal(runtime.iconShapeWatcher, watcher);
  assert.equal(stopCalls, 2, 'second stop silently bypassed the unconfirmed guard');
  callbacks.onExit({ code: 0, signal: '', restored: true });
  const restoredLate = runtime.getStatus('restored-late');
  assert.equal(restoredLate.nativeStateKnown, true);
  assert.equal(restoredLate.iconLayerRestoreUnconfirmed, false);
  assert.equal(restoredLate.phase, 'interactive');
  assert.equal(restoredLate.lastError, '');
  assert.equal(runtime.iconShapeWatcher, null);
});

test('restore-unconfirmed watcher exit taints native state and blocks a clean disable report', async () => {
  const win = new FakeBrowserWindow();
  let callbacks = null;
  let watcher = null;
  const { runtime, calls } = makeRuntime({
    startDesktopIconWatcher: (input, _count, baseWatcher) => {
      callbacks = input;
      watcher = {
        ...baseWatcher,
        stop: async () => ({
          ok: false,
          restored: false,
          error: 'DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED',
        }),
      };
      return watcher;
    },
  });

  await runtime.enable(win, { interactive: true, reason: 'unconfirmed-exit-enable' });
  assert.equal((await runtime.setDesktopIconsVisible(false, 'unconfirmed-icons-hidden')).ok, true);
  callbacks.onExit({ code: 1, signal: '', restored: false });

  const tainted = runtime.getStatus('unconfirmed-exit');
  assert.equal(tainted.nativeStateKnown, false);
  assert.equal(tainted.iconLayerRestoreUnconfirmed, true);
  assert.equal(tainted.desktopIconsVisible, false, 'unconfirmed exit falsely claimed Explorer icons were restored');
  assert.equal(tainted.phase, 'error-unknown-native-state');
  assert.equal(runtime.iconShapeWatcher, watcher);
  const disabled = await runtime.disable('unconfirmed-exit-disable');
  assert.equal(disabled.ok, false);
  assert.match(disabled.error, /DESKTOP_ICON_LAYER_RESTORE_UNCONFIRMED/);
  assert.equal(runtime.getStatus('disable-blocked').enabled, true);
  assert.equal(runtime.getStatus('disable-blocked').nativeStateKnown, false);
  assert.equal(calls.detach.length, 0, 'disable detached after native restoration became unknown');
});

test('host-change rebind waits for a restored terminal ACK and restore failure cancels it', async () => {
  const failedReasons = [];
  let failedCallbacks = null;
  const failed = makeRuntime({
    requestReconcile: (reason) => {
      failedReasons.push(reason);
      return Promise.resolve({ ok: true });
    },
    startDesktopIconWatcher: (input, _count, watcher) => {
      failedCallbacks = input;
      return watcher;
    },
  });
  await failed.runtime.enable(new FakeBrowserWindow(), { interactive: true, reason: 'host-failed-enable' });
  failedCallbacks.onLayout({
    ok: true,
    nativeLayerApplied: true,
    nativeBackgroundKeyApplied: true,
    compositionMode: 'layered-color-key',
    topLevelHostWindowId: '9999',
    listViewWindowId: '8300',
    icons: [],
  });
  failedCallbacks.onError(new Error('DESKTOP_ICON_HOST_CHANGED'));
  await new Promise((resolve) => setTimeout(resolve, 230));
  assert.deepEqual(failedReasons, [], 'host error rebound before terminal restoration ACK');
  failedCallbacks.onExit({ code: 1, signal: '', restored: false });
  await new Promise((resolve) => setTimeout(resolve, 230));
  assert.deepEqual(failedReasons, [], 'restore-unconfirmed host exit still rebound');
  assert.equal(failed.runtime.getStatus('host-failed').nativeStateKnown, false);

  const restoredReasons = [];
  let restoredCallbacks = null;
  const restored = makeRuntime({
    requestReconcile: (reason) => {
      restoredReasons.push(reason);
      return Promise.resolve({ ok: true });
    },
    startDesktopIconWatcher: (input, _count, watcher) => {
      restoredCallbacks = input;
      return watcher;
    },
  });
  await restored.runtime.enable(new FakeBrowserWindow(), { interactive: true, reason: 'host-restored-enable' });
  restoredCallbacks.onError(new Error('DESKTOP_ICON_HOST_CHANGED'));
  restoredCallbacks.onExit({ code: 1, signal: '', restored: true });
  await new Promise((resolve) => setTimeout(resolve, 230));
  assert.deepEqual(restoredReasons, ['desktop-icon-host-changed']);
  assert.equal(restored.runtime.getStatus('host-restored').nativeStateKnown, true);
});

test('unexpected watcher exit with confirmed restoration queues recovery without hiding Mineradio', async () => {
  const win = new FakeBrowserWindow();
  const reconcileReasons = [];
  let callbacks = null;
  const { runtime } = makeRuntime({
    requestReconcile: (reason) => {
      reconcileReasons.push(reason);
      return Promise.resolve({ ok: true });
    },
    startDesktopIconWatcher: (input, _count, watcher) => {
      callbacks = input;
      return watcher;
    },
  });

  await runtime.enable(win, { interactive: true, reason: 'unexpected-exit-enable' });
  assert.equal((await runtime.setDesktopIconsVisible(false, 'unexpected-exit-icons-hidden')).ok, true);
  callbacks.onExit({ code: 1, signal: '', restored: true });
  await new Promise((resolve) => setTimeout(resolve, 230));

  const status = runtime.getStatus('unexpected-exit');
  assert.deepEqual(reconcileReasons, ['desktop-icon-watcher-restarted']);
  assert.equal(status.nativeStateKnown, true);
  assert.equal(status.iconLayerRestoreUnconfirmed, false);
  assert.equal(status.desktopIconsVisible, false);
  assert.equal(status.phase, 'recovering-icon-layer');
  assert.equal(status.lastError, 'DESKTOP_ICON_WATCHER_EXITED');
  assert.equal(runtime.iconShapeWatcher, null);
  assert.equal(win.visible, true);
});

test('repeated unexpected watcher exits open a recovery circuit instead of flickering forever', async () => {
  const win = new FakeBrowserWindow();
  const watcherCallbacks = [];
  const { runtime, calls } = makeRuntime({
    startDesktopIconWatcher: (input, _count, watcher) => {
      watcherCallbacks.push(input);
      return watcher;
    },
  });

  await runtime.enable(win, { interactive: true, reason: 'watcher-circuit-enable' });
  watcherCallbacks[0].onExit({ code: 1, signal: '', restored: true });
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.ok(watcherCallbacks.length >= 2, 'first watcher exit did not perform the bounded repair pass');

  watcherCallbacks[1].onExit({ code: 1, signal: '', restored: true });
  await new Promise((resolve) => setTimeout(resolve, 80));

  const status = runtime.getStatus('watcher-circuit-result');
  assert.equal(status.enabled, false);
  assert.equal(status.interactive, false);
  assert.equal(status.lastError, 'DESKTOP_ICON_RECOVERY_CIRCUIT_OPEN');
  assert.equal(win.visible, true, 'circuit fallback must restore the ordinary Mineradio window');
  assert.equal(calls.status.some((entry) => /circuit-open/.test(entry.reason)), true);
});

test('setInteractive true repairs a stale enabled interactive state instead of returning unchanged', async () => {
  const win = new FakeBrowserWindow();
  const { runtime, calls } = makeRuntime();
  await runtime.enable(win, { interactive: true, reason: 'repair-enable' });
  await runtime.stopIconShapeWatcher();
  runtime.clearExitedIconLayerState({ preserveDesktopIconsVisible: true, preserveShields: true });
  runtime.phase = 'error-icon-layer-stopped';
  win.hide();
  const coexistBefore = calls.coexist.length;

  const repaired = await runtime.setInteractive(true, 'repair-interactive');
  const status = runtime.getStatus('repair-result');
  assert.equal(repaired.ok, true);
  assert.equal(status.phase, 'interactive');
  assert.equal(status.iconShapeActive, true);
  assert.equal(status.ignoreMouseEvents, false);
  assert.equal(win.visible, true);
  assert.ok(calls.coexist.length > coexistBefore, 'stale interactive state did not rebind the native icon host');
});

test('stale setInteractive after disable does not poison the disabled phase', async () => {
  const win = new FakeBrowserWindow();
  const { runtime } = makeRuntime();
  await runtime.enable(win, { interactive: true, reason: 'stale-enable' });
  await runtime.disable('stale-disable');
  const result = await runtime.setInteractive(true, 'stale-focus');
  const status = runtime.getStatus('stale-result');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'FULL_DESKTOP_NOT_ENABLED');
  assert.equal(status.enabled, false);
  assert.equal(status.phase, 'disabled');
  assert.equal(status.lastError, '');
});
