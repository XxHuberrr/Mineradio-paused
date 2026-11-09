'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const {
  applyDesktopIconShape,
  clearDesktopIconShape,
  computeDesktopShapeRects,
  desktopIconProbeScript,
  desktopIconWatcherScript,
  parseDesktopIconProbeOutput,
  physicalIconRectsToDisplayDip,
  probeDesktopIcons,
  startDesktopIconWatcher,
} = require('../desktop/desktop-icon-shape-runtime');

function area(rects) {
  return rects.reduce((total, rect) => total + rect.width * rect.height, 0);
}

function containsPoint(rects, x, y) {
  return rects.some((rect) => x >= rect.x && x < rect.x + rect.width
    && y >= rect.y && y < rect.y + rect.height);
}

test('empty desktop icon list keeps one full local shape rectangle', () => {
  assert.deepEqual(computeDesktopShapeRects({
    bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
    iconRects: [],
  }), [{ x: 0, y: 0, width: 1920, height: 1080 }]);
});

test('desktop icon grid is cut out while adjacent strips are merged', () => {
  const rects = computeDesktopShapeRects({
    bounds: { x: 0, y: 0, width: 300, height: 220 },
    iconRects: [
      { x: 10, y: 10, width: 60, height: 70 },
      { x: 10, y: 90, width: 60, height: 70 },
      { x: 90, y: 10, width: 60, height: 70 },
      { x: 90, y: 90, width: 60, height: 70 },
    ],
  });

  assert.equal(containsPoint(rects, 20, 20), false);
  assert.equal(containsPoint(rects, 100, 100), false);
  assert.equal(containsPoint(rects, 80, 50), true);
  assert.equal(containsPoint(rects, 200, 100), true);
  assert.equal(area(rects), 300 * 220 - 4 * 60 * 70);
  assert.equal(rects.length, 9, 'grid complement did not merge into maximal adjacent strips');
});

test('physical rectangles map onto a negative-coordinate high-DPI display', () => {
  const converted = physicalIconRectsToDisplayDip([
    { x: -2400, y: 150, width: 150, height: 120 },
    { x: -100, y: 100, width: 200, height: 100 },
  ], {
    physicalBounds: { x: -2560, y: 0, width: 2560, height: 1440 },
    bounds: { x: -1707, y: 0, width: 1707, height: 960 },
  });

  assert.deepEqual(converted, [
    { x: -1601, y: 100, width: 101, height: 80 },
    { x: -67, y: 66, width: 67, height: 68 },
  ]);
});

test('inward high-DPI mapping does not expose an extra Explorer background fringe', () => {
  const converted = physicalIconRectsToDisplayDip([
    { x: 13, y: 13, width: 109, height: 91 },
  ], {
    physicalBounds: { x: 0, y: 0, width: 2400, height: 1350 },
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    paddingDip: 0,
    rounding: 'inward',
  });

  assert.deepEqual(converted, [{ x: 11, y: 11, width: 86, height: 72 }]);
});

test('protected shield restores Mineradio input over an icon hole', () => {
  const rects = computeDesktopShapeRects({
    bounds: { x: -100, y: 20, width: 400, height: 240 },
    iconRects: [{ x: -80, y: 40, width: 80, height: 80 }],
    protectedShields: [{ x: -80, y: 40, width: 80, height: 80 }],
  });

  assert.deepEqual(rects, [{ x: 0, y: 0, width: 400, height: 240 }]);
});

test('shape complexity limit refuses an unsafe partial region', () => {
  assert.throws(() => computeDesktopShapeRects({
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    iconRects: [{ x: 20, y: 20, width: 20, height: 20 }],
    maxRects: 1,
  }), (error) => error && error.code === 'DESKTOP_ICON_SHAPE_TOO_COMPLEX'
    && error.rectCount > error.maxRects);
});

test('native probe is one-shot read-only and frees Explorer memory', () => {
  const script = desktopIconProbeScript();
  assert.match(script, /SHELLDLL_DefView/);
  assert.match(script, /SysListView32/);
  assert.match(script, /LVM_GETITEMRECT/);
  assert.match(script, /visibleParts = new int\[\] \{ 1, 2 \}/, 'probe must cut separate LVIR_ICON and LVIR_LABEL rectangles');
  assert.doesNotMatch(script, /BitConverter\.GetBytes\(0\)/, 'probe must not restore the empty LVIR_BOUNDS cell rectangle');
  assert.match(script, /OpenProcess/);
  assert.match(script, /VirtualAllocEx/);
  assert.match(script, /ReadProcessMemory/);
  assert.match(script, /finally\s*\{/);
  assert.match(script, /VirtualFreeEx\(process, remoteRect/);
  for (const forbidden of ['GetCursorPos', 'SetWindowsHookEx', 'SendInput', 'WM_MOUSEMOVE']) {
    assert.equal(script.includes(forbidden), false, `probe contains forbidden API: ${forbidden}`);
  }
});

test('persistent watcher is Explorer-event-driven and always releases hooks', () => {
  const script = desktopIconWatcherScript({ debounceMs: 135, rebindMs: 2000 });
  assert.match(script, /SetWinEventHook/);
  assert.match(script, /EVENT_OBJECT_LOCATIONCHANGE/);
  assert.match(script, /EVENT_OBJECT_REORDER/);
  assert.match(script, /EVENT_OBJECT_CREATE/);
  assert.match(script, /EVENT_OBJECT_REORDER, IntPtr\.Zero/);
  assert.match(script, /_debounceMs = Math\.Max\(100, Math\.Min\(180, debounceMs\)\)/);
  assert.match(script, /RebindIfNeeded\(false\)/);
  assert.match(script, /key\.Append\(result\.topLevelHostWindowId\)/);
  assert.match(script, /topLevelHost != _topLevelHost/);
  assert.match(script, /_topLevelHost = topLevelHost/);
  assert.match(script, /_rangeHook == IntPtr\.Zero \|\| _locationHook == IntPtr\.Zero/);
  assert.match(script, /finally\s*\{[\s\S]*RemoveHooks\(\)/);
  assert.match(script, /UnhookWinEvent/);
  assert.match(script, /ReadLine\(\)/);
  for (const forbidden of ['GetCursorPos', 'SetWindowsHookEx', 'SendInput', 'WM_MOUSEMOVE']) {
    assert.equal(script.includes(forbidden), false, `watcher contains forbidden API: ${forbidden}`);
  }
});

test('probe parser normalizes physical icon rectangles', () => {
  const parsed = parseDesktopIconProbeOutput(JSON.stringify({
    ok: true,
    iconHostWindowId: '101',
    listViewWindowId: '102',
    topLevelHostWindowId: '100',
    processId: 55,
    physicalPixels: true,
    icons: [{ x: 10.2, y: 20.8, width: 49.1, height: 60.1 }],
  }));
  assert.deepEqual(parsed.icons, [{ x: 10, y: 20, width: 50, height: 61 }]);
  assert.equal(parsed.iconHostWindowId, '101');
  assert.equal(parsed.listViewWindowId, '102');
});

test('exec wrapper invokes hidden PowerShell and parses the probe ack', async () => {
  let invocation = null;
  const result = await probeDesktopIcons({
    nativeTempPath: 'D:\\MineradioCache\\native-helper-temp',
    execFileImpl: (file, args, options, callback) => {
      invocation = { file, args, options };
      callback(null, JSON.stringify({
        ok: true,
        iconHostWindowId: '201',
        listViewWindowId: '202',
        topLevelHostWindowId: '200',
        processId: 99,
        physicalPixels: true,
        icons: [],
      }), '');
      return { kill() {} };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(invocation.file, 'powershell.exe');
  assert.equal(invocation.options.windowsHide, true);
  assert.equal(invocation.options.env.TEMP, 'D:\\MineradioCache\\native-helper-temp');
  assert.match(invocation.args.at(-1), /LVM_GETITEMRECT/);
});

test('apply and clear wrappers only call BrowserWindow.setShape', () => {
  const calls = [];
  const win = { setShape: (rects) => calls.push(rects) };
  const applied = applyDesktopIconShape(win, {
    bounds: { x: 0, y: 0, width: 200, height: 100 },
    iconRects: [{ x: 0, y: 0, width: 40, height: 40 }],
  });
  const cleared = clearDesktopIconShape(win);

  assert.equal(applied.ok, true);
  assert.equal(cleared.ok, true);
  assert.deepEqual(calls.at(-1), []);
});

test('watcher wrapper parses changed layouts and stops through stdin Q', async () => {
  class FakeChild extends EventEmitter {
    constructor() {
      super();
      this.stdout = new PassThrough();
      this.stderr = new PassThrough();
      this.writes = [];
      this.stdin = {
        write: (value) => {
          this.writes.push(value);
          setImmediate(() => this.emit('exit', 0, null));
          return true;
        },
      };
    }

    kill() { this.emit('exit', 0, 'SIGTERM'); }
  }

  const child = new FakeChild();
  let invocation = null;
  let received = null;
  const watcher = startDesktopIconWatcher({
    spawnImpl: (file, args, options) => {
      invocation = { file, args, options };
      return child;
    },
    onLayout: (layout) => { received = layout; },
  });
  child.stdout.write(`${JSON.stringify({
    ok: true,
    watcher: true,
    iconHostWindowId: '301',
    listViewWindowId: '302',
    topLevelHostWindowId: '300',
    processId: 77,
    physicalPixels: true,
    icons: [{ x: 4, y: 5, width: 60, height: 70 }],
  })}\n`);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(invocation.file, 'powershell.exe');
  assert.equal(invocation.options.windowsHide, true);
  assert.equal(received && received.listViewWindowId, '302');
  assert.deepEqual(watcher.getLastLayout().icons, [{ x: 4, y: 5, width: 60, height: 70 }]);
  const stopped = await watcher.stop();
  assert.equal(stopped.ok, true);
  assert.deepEqual(child.writes, ['Q\n']);
  assert.equal(watcher.isRunning(), false);
});

test('watcher spawn error marks it exited and notifies recovery without an exit event', async () => {
  class ErrorOnlyChild extends EventEmitter {
    constructor() {
      super();
      this.stdout = new PassThrough();
      this.stderr = new PassThrough();
      this.stdin = { write() { return true; } };
    }
  }

  const child = new ErrorOnlyChild();
  const errors = [];
  const exits = [];
  const watcher = startDesktopIconWatcher({
    spawnImpl: () => child,
    onError: (error) => errors.push(error),
    onExit: (details) => exits.push(details),
  });
  const failure = new Error('synthetic watcher spawn failure');
  child.emit('error', failure);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(watcher.isRunning(), false);
  assert.deepEqual(errors, [failure]);
  assert.equal(exits.length, 1);
  assert.equal(exits[0].error, failure);
  child.emit('exit', 1, null);
  assert.equal(exits.length, 1, 'a late exit must not trigger duplicate recovery');
  const stopped = await watcher.stop();
  assert.equal(stopped.ok, true);
});
