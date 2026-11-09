'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { WallpaperEngineRuntime, nativeDwmThumbnailSurfaceScript } = require('../desktop/wallpaper-engine-runtime');

test('idle Wallpaper Engine runtime disposes as a verified clean state', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-we-idle-dispose-'));
  try {
    const runtime = new WallpaperEngineRuntime({
      nativeTempPath: tempRoot,
      desktopCapturer: null,
      useDesktopShellBroker: false,
      nativeSleep: async () => {},
    });
    const result = await runtime.dispose();
    assert.deepEqual(result, {
      ok: true,
      stopped: true,
      active: false,
      sessionId: '',
      reason: '',
    });
    assert.equal(runtime.active, null);
    assert.equal(runtime.pending, null);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('single DWM surface accepts bounded visual settings without another native layer', () => {
  const writes = [];
  const runtime = new WallpaperEngineRuntime({
    desktopCapturer: null,
    useDesktopShellBroker: false,
    nativeSleep: async () => {},
  });
  runtime.active = {
    sessionId: '1234567890abcdef12345678',
    dwmSurfaceReady: true,
    dwmSurfaceProcess: {
      stdin: {
        destroyed: false,
        writableEnded: false,
        write(value) { writes.push(value); },
      },
    },
  };
  assert.equal(runtime.updateDwmVisualSettings(runtime.active.sessionId, {
    opacity: 0.62,
    positionX: 0.25,
    positionY: -0.4,
    scale: 1.22,
  }), true);
  assert.deepEqual(writes, ['V|158|250000|-400000|1220000\n']);
  assert.equal(runtime.active.dwmVisualOpacity, 0.62);
  assert.equal(runtime.active.dwmVisualScale, 1.22);

  const helper = nativeDwmThumbnailSurfaceScript();
  assert.match(helper, /command\.StartsWith\("V\|"/);
  assert.match(helper, /properties\.opacity = \(byte\)visualOpacity/);
  assert.doesNotMatch(helper, /Mineradio WE Glass Refraction/);
});
