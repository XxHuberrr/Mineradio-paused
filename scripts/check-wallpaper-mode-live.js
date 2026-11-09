#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const port = Number(process.argv[2] || 0);
const ensureWallpaperEngine = process.argv.includes('--ensure-we');
const desktopFirst = process.argv.includes('--desktop-first');
assert(Number.isInteger(port) && port > 0,
  'Usage: node scripts/check-wallpaper-mode-live.js <remote-debugging-port> [--ensure-we] [--desktop-first]');
assert(!desktopFirst || ensureWallpaperEngine, '--desktop-first requires --ensure-we');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const waiter = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message || 'CDP request failed'));
      else waiter.resolve(message.result);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CdpClient(socket);
  }

  call(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception && response.exceptionDetails.exception.description
        || response.exceptionDetails.text
        || 'Renderer evaluation failed');
    }
    return response.result && response.result.value;
  }

  close() {
    try { this.socket.close(); } catch (_) { }
  }
}

async function waitForMainTarget(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() <= deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const target = targets.find((item) => item.type === 'page'
        && /127\.0\.0\.1/.test(String(item.url || ''))
        && !/\/wallpaper\.html(?:[?#]|$)/.test(String(item.url || '')));
      if (target && target.webSocketDebuggerUrl) return target;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Mineradio CDP page was not ready: ${lastError && lastError.message || 'no target'}`);
}

function readWindowTree(title) {
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(appRoot, 'scripts', 'check-wallpaper-mode-window-tree.ps1'),
    '-Title',
    String(title || ''),
  ], {
    cwd: appRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Wallpaper window-tree probe failed');
  return JSON.parse(String(result.stdout || '[]').replace(/^\uFEFF/, '').trim() || '[]');
}

function windowByHandle(title, handle) {
  return readWindowTree(title).find((item) => String(item && item.handle || '') === String(handle || '')) || null;
}

async function waitForNativeWindow(title, handle, predicate, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let current = null;
  while (Date.now() <= deadline) {
    current = windowByHandle(title, handle);
    if (current && predicate(current)) return current;
    await sleep(100);
  }
  throw new Error(`HWND did not reach the expected native state: ${JSON.stringify(current)}`);
}

function rectNear(actual, expected, tolerance = 18) {
  if (!actual || !expected) return false;
  return Math.abs(Number(actual.left) - Number(expected.left)) <= tolerance
    && Math.abs(Number(actual.top) - Number(expected.top)) <= tolerance
    && Math.abs(Number(actual.width) - Number(expected.width)) <= tolerance
    && Math.abs(Number(actual.height) - Number(expected.height)) <= tolerance;
}

async function main() {
  assert.strictEqual(process.platform, 'win32', 'Live full desktop mode QA is Windows-only');
  const target = await waitForMainTarget();
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  await client.call('Runtime.enable');

  let nativeWindowId = '';
  let title = 'Mineradio';
  let closeBehaviorBefore = 'exit';
  let activatedWallpaperEngineForQa = false;
  let wallpaperEngineSelectionStoreBeforeQa;
  try {
    const closeBehaviorState = await client.evaluate(`desktopWindow.getCloseBehavior()`);
    closeBehaviorBefore = String(closeBehaviorState && closeBehaviorState.behavior || 'exit');
    await client.evaluate(`desktopWindow.setCloseBehavior('exit')`);
    const reset = await client.evaluate(`(async () => {
      const waitForStatus = async (predicate, timeoutMs = 15000) => {
        const deadline = performance.now() + timeoutMs;
        let status = null;
        while (performance.now() <= deadline) {
          const response = await desktopWindow.getWallpaperModeStatus();
          status = response && response.status || null;
          if (status && predicate(status)) return status;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error('FULL_DESKTOP_STATUS_TIMEOUT:' + JSON.stringify(status));
      };
      fx.wallpaperMode = false;
      updateFxInputs();
      await desktopWindow.setWallpaperMode(false, { reason: 'live-qa-reset' });
      const disabled = await waitForStatus((status) => status.enabled !== true && status.attaching !== true);
      const selectionStoreBeforeQa = localStorage.getItem(WALLPAPER_ENGINE_SELECTION_STORE_KEY);
      const hadSelectedEngine = !!(wallpaperEngineSelection && wallpaperEngineSelection.active
        && wallpaperEngineSelection.kind === 'engine');
      let activatedForQa = false;
      if (!hadSelectedEngine && ${ensureWallpaperEngine && !desktopFirst ? 'true' : 'false'}) {
        await loadWallpaperEngineLibrary(true, false);
        const item = wallpaperEngineProjects.find((project) => project && project.enginePlayable === true);
        if (!item) throw new Error('NO_NATIVE_SCENE_PROJECT');
        activateWallpaperEngineItem(item.id);
        activatedForQa = true;
      }
      const selectedEngine = !!(wallpaperEngineSelection && wallpaperEngineSelection.active
        && wallpaperEngineSelection.kind === 'engine');
      let initialRuntime = typeof desktopWindow.getWallpaperEngineRuntimeStatus === 'function'
        ? await desktopWindow.getWallpaperEngineRuntimeStatus({}) : null;
      if (selectedEngine) {
        const deadline = performance.now() + 30000;
        while (performance.now() <= deadline) {
          initialRuntime = await desktopWindow.getWallpaperEngineRuntimeStatus({});
          const samplerVideo = document.getElementById('wallpaper-engine-glass-sampler-video');
          const samplerTrack = samplerVideo && samplerVideo.srcObject && samplerVideo.srcObject.getVideoTracks()[0];
          if (initialRuntime && initialRuntime.active === true
            && initialRuntime.dwmSurfaceReady === true
            && initialRuntime.dwmGlassSurfaceReady === true
            && document.body.classList.contains('wallpaper-engine-glass-sampler-ready')
            && samplerTrack && samplerTrack.readyState === 'live') break;
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
      }
      const samplerVideo = document.getElementById('wallpaper-engine-glass-sampler-video');
      const samplerTrack = samplerVideo && samplerVideo.srcObject && samplerVideo.srcObject.getVideoTracks()[0];
      return {
        title: document.title,
        disabled,
        selectionStoreBeforeQa,
        activatedForQa,
        selectedEngine,
        selection: {
          active: !!wallpaperEngineSelection.active,
          kind: String(wallpaperEngineSelection.kind || ''),
          id: String(wallpaperEngineSelection.id || ''),
          hasPreview: !!wallpaperEngineSelection.hasPreview,
        },
        runtime: initialRuntime,
        samplerReady: document.body.classList.contains('wallpaper-engine-glass-sampler-ready'),
        samplerTrackState: String(samplerTrack && samplerTrack.readyState || ''),
        ui: {
          fxEnabled: fx.wallpaperMode === true,
          toggleOn: document.getElementById('t-wallpaperMode')?.classList.contains('on') === true,
          bodyEnabled: document.body.classList.contains('desktop-wallpaper-mode'),
          bodyInteractive: document.body.classList.contains('desktop-wallpaper-interactive'),
        }
      };
    })()`);

    title = String(reset.title || 'Mineradio');
    wallpaperEngineSelectionStoreBeforeQa = reset.selectionStoreBeforeQa;
    activatedWallpaperEngineForQa = reset.activatedForQa === true;
    const originalCandidates = readWindowTree(title).filter((item) => item.parentHandle === '0'
      && item.childStyle === false && item.visible === true);
    assert(originalCandidates.length > 0, 'the top-level Mineradio HWND was not found before desktop mode');
    const originalWindow = originalCandidates[0];
    nativeWindowId = String(originalWindow.handle || '');
    assert.deepStrictEqual(reset.ui, {
      fxEnabled: false,
      toggleOn: false,
      bodyEnabled: false,
      bodyInteractive: false,
    });
    if (reset.selectedEngine) {
      assert(reset.runtime && reset.runtime.active === true, 'initial WE selection was not running');
      assert.strictEqual(reset.runtime.dwmSurfaceWindowId, reset.runtime.dwmGlassSurfaceWindowId,
        'initial glass sampler did not alias the unique DWM surface');
      assert.strictEqual(reset.samplerReady, true);
      assert.strictEqual(reset.samplerTrackState, 'live');
    }

    const enabled = await client.evaluate(`(async () => {
      const result = await toggleWallpaperModeFromUi();
      if (!result || result.ok !== true) throw new Error(JSON.stringify(result || { error: 'FULL_DESKTOP_START_FAILED' }));
      const deadline = performance.now() + 15000;
      let status = null;
      while (performance.now() <= deadline) {
        const response = await desktopWindow.getWallpaperModeStatus();
        status = response && response.status || null;
        if (status && status.enabled === true && status.interactive === true
          && status.coexisting === true && status.iconShapeActive === true
          && status.iconLayerMode === 'explorer-layered-colorkey'
          && status.phase === 'interactive' && status.nativeWindowId) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return {
        result,
        status,
        ui: {
          fxEnabled: fx.wallpaperMode === true,
          toggleOn: document.getElementById('t-wallpaperMode')?.classList.contains('on') === true,
          bodyEnabled: document.body.classList.contains('desktop-wallpaper-mode'),
          bodyInteractive: document.body.classList.contains('desktop-wallpaper-interactive'),
        }
      };
    })()`);
    assert.strictEqual(String(enabled.status && enabled.status.nativeWindowId || ''), nativeWindowId);
    assert(Number(enabled.status && enabled.status.iconCount) > 0, 'native Explorer icon geometry was not available to the layered guard');
    assert.deepStrictEqual(enabled.ui, {
      fxEnabled: true,
      toggleOn: true,
      bodyEnabled: true,
      bodyInteractive: true,
    });
    const interactiveCoexistWindow = await waitForNativeWindow(title, nativeWindowId, (item) =>
      item.parentHandle === String(enabled.status && enabled.status.parentWindowId || '')
      && item.parentClassName === 'SHELLDLL_DefView'
      && item.childStyle === true && item.popupStyle === false && item.visible === true);

    let desktopFirstWe = null;
    if (ensureWallpaperEngine && desktopFirst && !reset.selectedEngine) {
      desktopFirstWe = await client.evaluate(`(async () => {
        await loadWallpaperEngineLibrary(true, false);
        const item = wallpaperEngineProjects.find((project) => project && project.enginePlayable === true);
        if (!item) throw new Error('NO_NATIVE_SCENE_PROJECT');
        activateWallpaperEngineItem(item.id);
        const deadline = performance.now() + 30000;
        let runtime = null;
        let desktopStatus = null;
        let track = null;
        while (performance.now() <= deadline) {
          runtime = await desktopWindow.getWallpaperEngineRuntimeStatus({});
          desktopStatus = (await desktopWindow.getWallpaperModeStatus()).status || null;
          const samplerVideo = document.getElementById('wallpaper-engine-glass-sampler-video');
          track = samplerVideo && samplerVideo.srcObject && samplerVideo.srcObject.getVideoTracks()[0];
          if (runtime && runtime.active === true
            && runtime.dwmSurfaceReady === true && runtime.dwmDesktopIconLayering === true
            && desktopStatus && desktopStatus.enabled === true && desktopStatus.interactive === true
            && desktopStatus.ignoreMouseEvents !== true
            && document.body.classList.contains('wallpaper-engine-glass-sampler-ready')
            && track && track.readyState === 'live') break;
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        return {
          activated: true,
          selection: {
            active: !!wallpaperEngineSelection.active,
            kind: String(wallpaperEngineSelection.kind || ''),
            id: String(wallpaperEngineSelection.id || ''),
          },
          runtime,
          desktopStatus,
          samplerReady: document.body.classList.contains('wallpaper-engine-glass-sampler-ready'),
          trackState: String(track && track.readyState || ''),
        };
      })()`);
      activatedWallpaperEngineForQa = true;
      assert(desktopFirstWe.runtime && desktopFirstWe.runtime.active === true,
        `WE did not start after full desktop mode: ${JSON.stringify(desktopFirstWe, null, 2)}`);
      assert.strictEqual(desktopFirstWe.runtime.dwmDesktopIconLayering, true);
      assert.strictEqual(desktopFirstWe.desktopStatus && desktopFirstWe.desktopStatus.enabled, true);
      assert.strictEqual(desktopFirstWe.desktopStatus && desktopFirstWe.desktopStatus.interactive, true);
      assert.strictEqual(desktopFirstWe.desktopStatus && desktopFirstWe.desktopStatus.ignoreMouseEvents, false);
      assert.strictEqual(desktopFirstWe.samplerReady, true);
      assert.strictEqual(desktopFirstWe.trackState, 'live');
      await waitForNativeWindow(title, nativeWindowId, (item) =>
        item.parentHandle === String(enabled.status && enabled.status.parentWindowId || '')
        && item.parentClassName === 'SHELLDLL_DefView'
        && item.childStyle === true && item.popupStyle === false && item.visible === true);
    }
    const expectedWeSelection = reset.selectedEngine
      ? reset.selection
      : (desktopFirstWe && desktopFirstWe.selection || null);

    const stable = await client.evaluate(`(async () => {
      const deadline = performance.now() + 15000;
      let status = null;
      while (performance.now() <= deadline) {
        const response = await desktopWindow.getWallpaperModeStatus();
        status = response && response.status || null;
        if (status && status.enabled === true && status.interactive === true
          && status.coexisting === true && status.iconLayerMode === 'explorer-layered-colorkey'
          && status.softwareInteractionLocked !== true && status.ignoreMouseEvents !== true) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const runtime = await desktopWindow.getWallpaperEngineRuntimeStatus({});
      const glassVideo = document.getElementById('wallpaper-engine-glass-sampler-video');
      const track = glassVideo && glassVideo.srcObject && glassVideo.srcObject.getVideoTracks()[0];
      const softwareLockControl = document.getElementById('desktop-software-lock-toggle');
      return {
        status,
        softwareLockApiAvailable: typeof desktopWindow.setDesktopSoftwareLocked === 'function',
        softwareLockControl: softwareLockControl ? {
          role: softwareLockControl.getAttribute('role'),
          checked: softwareLockControl.getAttribute('aria-checked'),
          disabled: softwareLockControl.disabled === true,
        } : null,
        selection: {
          active: !!wallpaperEngineSelection.active,
          kind: String(wallpaperEngineSelection.kind || ''),
          id: String(wallpaperEngineSelection.id || ''),
        },
        runtime,
        samplerReady: document.body.classList.contains('wallpaper-engine-glass-sampler-ready'),
        trackState: String(track && track.readyState || ''),
        audioTrackCount: wallpaperEngineGlassCaptureStream && wallpaperEngineGlassCaptureStream.getAudioTracks
          ? wallpaperEngineGlassCaptureStream.getAudioTracks().length : 0,
      };
    })()`);
    assert(stable.status && stable.status.enabled === true
      && stable.status.interactive === true
      && stable.status.coexisting === true
      && stable.status.softwareInteractionLocked !== true
      && stable.status.ignoreMouseEvents !== true,
    `full desktop input did not remain interactive: ${JSON.stringify(stable, null, 2)}`);
    assert.strictEqual(stable.softwareLockApiAvailable, true, 'recoverable software-lock preload API is unavailable');
    assert(stable.softwareLockControl
      && stable.softwareLockControl.role === 'switch'
      && stable.softwareLockControl.checked === 'false'
      && stable.softwareLockControl.disabled === false,
    `software-lock control is not available in its initial unlocked state: ${JSON.stringify(stable.softwareLockControl)}`);
    const stableWindow = await waitForNativeWindow(title, nativeWindowId, (item) =>
      item.parentHandle === String(stable.status && stable.status.parentWindowId || '')
      && item.parentClassName === 'SHELLDLL_DefView'
      && item.childStyle === true && item.popupStyle === false && item.visible === true);

    if (expectedWeSelection) {
      assert.deepStrictEqual(stable.selection, {
        active: true,
        kind: 'engine',
        id: expectedWeSelection.id,
      });
      assert(stable.runtime && stable.runtime.active === true, 'WE stopped while full desktop mode was interactive');
      assert.strictEqual(stable.runtime.dwmSurfaceWindowId, stable.runtime.dwmGlassSurfaceWindowId);
      assert.strictEqual(stable.runtime.dwmDesktopIconLayering, true);
      assert.strictEqual(stable.samplerReady, true);
      assert.strictEqual(stable.trackState, 'live');
      assert.strictEqual(stable.audioTrackCount, 0);
    }

    const disabled = await client.evaluate(`(async () => {
      const result = await toggleWallpaperModeFromUi();
      if (!result || result.ok !== true) throw new Error(JSON.stringify(result || { error: 'FULL_DESKTOP_STOP_FAILED' }));
      const deadline = performance.now() + 15000;
      let status = null;
      while (performance.now() <= deadline) {
        const response = await desktopWindow.getWallpaperModeStatus();
        status = response && response.status || null;
        if (status && status.enabled !== true && status.attaching !== true && status.phase === 'disabled') break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return {
        result,
        status,
        ui: {
          fxEnabled: fx.wallpaperMode === true,
          toggleOn: document.getElementById('t-wallpaperMode')?.classList.contains('on') === true,
          bodyEnabled: document.body.classList.contains('desktop-wallpaper-mode'),
          bodyInteractive: document.body.classList.contains('desktop-wallpaper-interactive'),
        }
      };
    })()`);
    assert.deepStrictEqual(disabled.ui, {
      fxEnabled: false,
      toggleOn: false,
      bodyEnabled: false,
      bodyInteractive: false,
    });
    assert.strictEqual(disabled.status && disabled.status.recoveryTrayAvailable, false,
      'temporary recovery tray remained after disabling desktop mode with exit behavior');
    const restoredWindow = await waitForNativeWindow(title, nativeWindowId, (item) => item.parentHandle === '0'
      && item.childStyle === false && item.visible === true);
    assert(rectNear(restoredWindow.rect, originalWindow.rect), 'main window bounds were not restored after desktop mode');
    assert.strictEqual(readWindowTree('Mineradio Desktop Wallpaper').length, 0, 'legacy overlay wallpaper window was created');
    assert.strictEqual(readWindowTree('Mineradio WE Glass Refraction').length, 0, 'forbidden second WE glass window was created');

    console.log(JSON.stringify({
      ok: true,
      nativeWindowId,
      originalWindow,
      interactiveCoexistWindow,
      interactionSafety: {
        status: stable.status,
        nativeWindow: stableWindow,
        softwareLockApiAvailable: stable.softwareLockApiAvailable,
        softwareLockControl: stable.softwareLockControl,
      },
      wallpaperEnginePreserved: expectedWeSelection ? {
        sessionId: stable.runtime.sessionId,
        surfaceWindowId: stable.runtime.dwmSurfaceWindowId,
        glassWindowId: stable.runtime.dwmGlassSurfaceWindowId,
        samplerReady: stable.samplerReady,
        trackState: stable.trackState,
      } : { verified: false },
      desktopFirstWallpaperEngine: desktopFirstWe,
      restoredWindow,
      legacyOverlayWindowCount: 0,
      forbiddenWeGlassWindowCount: 0,
      rendererUiAuthority: {
        started: enabled.ui,
        stopped: disabled.ui,
      },
    }, null, 2));
  } finally {
    try {
      await client.evaluate(`(async () => {
        try {
          fx.wallpaperMode = false;
          updateFxInputs();
          return await applyWallpaperModeState(true);
        } catch (_) { return null; }
      })()`);
    } catch (_) { }
    try {
      await client.evaluate(`desktopWindow.setCloseBehavior(${JSON.stringify(closeBehaviorBefore)})`);
    } catch (_) { }
    if (activatedWallpaperEngineForQa) {
      try {
        await client.evaluate(`(async () => {
          try {
            deactivateWallpaperEngineBackground(true);
            const deadline = performance.now() + 12000;
            while (performance.now() <= deadline) {
              const status = await desktopWindow.getWallpaperEngineRuntimeStatus({});
              if (!status || status.active !== true) break;
              await new Promise((resolve) => setTimeout(resolve, 80));
            }
            const rawSelection = ${JSON.stringify(wallpaperEngineSelectionStoreBeforeQa)};
            if (rawSelection === null) localStorage.removeItem(WALLPAPER_ENGINE_SELECTION_STORE_KEY);
            else localStorage.setItem(WALLPAPER_ENGINE_SELECTION_STORE_KEY, rawSelection);
            wallpaperEngineSelection = readWallpaperEngineSelection();
            updateWallpaperEngineEntryUi();
            renderWallpaperEngineLibrary();
          } catch (_) { }
        })()`);
      } catch (_) { }
    }
    client.close();
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
