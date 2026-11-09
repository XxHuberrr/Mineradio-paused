#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2] || 9333);
const shouldExit = process.argv.includes('--exit');
const glassOff = process.argv.includes('--glass-off');
const glassOn = process.argv.includes('--glass-on');
const retryGlass = process.argv.includes('--retry-glass');
const controlsHide = process.argv.includes('--controls-hide');
const controlsShow = process.argv.includes('--controls-show');
const iconsHide = process.argv.includes('--icons-hide');
const iconsShow = process.argv.includes('--icons-show');
const toggleMaximize = process.argv.includes('--toggle-maximize');
const activateWorkshopArgument = process.argv.find((value) => /^--activate-workshop=\d+$/.test(value));
const activateWorkshopId = activateWorkshopArgument ? activateWorkshopArgument.split('=')[1] : '';
const activateCurrent = process.argv.includes('--activate-current');
const deactivateCurrent = process.argv.includes('--deactivate');
const screenshotArgument = process.argv.find((value) => value.startsWith('--screenshot='));
const screenshotPath = screenshotArgument ? path.resolve(screenshotArgument.slice('--screenshot='.length)) : '';

async function main() {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const target = targets.find((item) => item.type === 'page' && /127\.0\.0\.1/.test(item.url || ''));
  assert(target && target.webSocketDebuggerUrl, 'Mineradio renderer target was not found');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let requestId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data || '{}'));
    if (!message.id || !pending.has(message.id)) return;
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message || 'CDP request failed'));
    else entry.resolve(message.result || {});
  });

  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Renderer evaluation failed');
    }
    return response.result?.value;
  };

  await call('Runtime.enable');
  if (activateWorkshopId || activateCurrent) {
    await evaluate(`(async () => {
      if (window.desktopWindow && typeof desktopWindow.restore === 'function') await desktopWindow.restore();
      await loadWallpaperEngineLibrary(true, false);
      const item = wallpaperEngineProjects.find((project) => project.enginePlayable && (${activateCurrent
        ? 'String(project.id || \'\') === String(wallpaperEngineSelection && wallpaperEngineSelection.id || \'\')'
        : `String(project.workshopId || '') === ${JSON.stringify(activateWorkshopId)}`}));
      if (!item) throw new Error('NO_NATIVE_SCENE_PROJECT');
      activateWallpaperEngineItem(item.id);
      const deadline = performance.now() + 70000;
      while (performance.now() < deadline) {
        const api = wallpaperEngineDesktopApi();
        const runtime = api && typeof api.getWallpaperEngineRuntimeStatus === 'function'
          ? await api.getWallpaperEngineRuntimeStatus({}) : null;
        if (document.body.classList.contains('wallpaper-engine-dwm-active')
          && runtime && runtime.dwmSurfaceReady === true && runtime.dwmGlassSurfaceReady === true) {
          if (typeof setControlsHidden === 'function') setControlsHidden(false);
          if (typeof syncWallpaperEngineControlGlassSurface === 'function') {
            controlGlassState.dwmGeometryKey = '';
            syncWallpaperEngineControlGlassSurface(true);
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { ok: true, id: item.id, title: item.title };
        }
        if (wallpaperEngineRuntimeError) throw new Error(String(wallpaperEngineRuntimeError));
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
      throw new Error('WALLPAPER_ENGINE_DWM_ACTIVATION_TIMEOUT');
    })()`);
  } else if (deactivateCurrent) {
    await evaluate(`(async () => {
      if (typeof deactivateWallpaperEngineBackground === 'function') deactivateWallpaperEngineBackground(true);
      await new Promise((resolve) => setTimeout(resolve, 900));
      return true;
    })()`);
  } else if (toggleMaximize) {
    await evaluate(`(async () => {
      await desktopWindow.toggleMaximize();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return true;
    })()`);
  } else if (iconsHide || iconsShow) {
    await evaluate(`(async () => {
      if (typeof setDesktopIconsVisibility !== 'function') throw new Error('DESKTOP_ICON_CONTROL_UNAVAILABLE');
      const result = await setDesktopIconsVisibility(${iconsShow ? 'true' : 'false'});
      await new Promise((resolve) => setTimeout(resolve, 600));
      return result;
    })()`);
  } else if (controlsHide || controlsShow) {
    await evaluate(`(async () => {
      if (controlsHideTimer) {
        clearTimeout(controlsHideTimer);
        controlsHideTimer = null;
      }
      controlsHovering = ${controlsShow ? 'true' : 'false'};
      setControlsHidden(${controlsHide ? 'true' : 'false'});
      await new Promise((resolve) => setTimeout(resolve, 700));
      controlsHovering = false;
      return true;
    })()`);
  } else if (glassOff) {
    await evaluate(`(async () => {
      const bar = document.getElementById('bottom-bar');
      const rect = bar.getBoundingClientRect();
      const style = getComputedStyle(bar);
      desktopWindow.updateWallpaperEngineGlassSurface({
        sessionId: String(wallpaperEngineNativeSessionId || ''),
        active: false,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        radius: parseFloat(style.borderRadius) || 50,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      return true;
    })()`);
  } else if (glassOn) {
    await evaluate(`(async () => {
      if (typeof syncWallpaperEngineControlGlassSurface === 'function') {
        controlGlassState.dwmGeometryKey = '';
        syncWallpaperEngineControlGlassSurface(true);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      return true;
    })()`);
  } else if (retryGlass) {
    await evaluate(`(async () => {
      stopWallpaperEngineGlassCaptureStream(false);
      if (typeof syncWallpaperEngineControlGlassSurface === 'function') {
        controlGlassState.dwmGeometryKey = '';
        syncWallpaperEngineControlGlassSurface(true);
      }
      scheduleWallpaperEngineGlassSamplerCapture(String(wallpaperEngineNativeSessionId || ''), wallpaperEngineLayerToken, 0);
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return true;
    })()`);
  }
  const state = await evaluate(`(async () => {
    const api = typeof wallpaperEngineDesktopApi === 'function' ? wallpaperEngineDesktopApi() : window.desktopWindow;
    const runtime = api && typeof api.getWallpaperEngineRuntimeStatus === 'function'
      ? await api.getWallpaperEngineRuntimeStatus({})
      : null;
    const desktopState = api && typeof api.getState === 'function'
      ? await api.getState()
      : null;
    const fullDesktopStatus = api && typeof api.getWallpaperModeStatus === 'function'
      ? await api.getWallpaperModeStatus()
      : null;
    const video = document.getElementById('wallpaper-engine-video');
    const layer = document.getElementById('wallpaper-engine-layer');
    const glassSampler = document.getElementById('wallpaper-engine-glass-sampler');
    const glassVideo = document.getElementById('wallpaper-engine-glass-sampler-video');
    const glassTrack = typeof wallpaperEngineGlassCaptureStream !== 'undefined'
      && wallpaperEngineGlassCaptureStream?.getVideoTracks
      ? wallpaperEngineGlassCaptureStream.getVideoTracks()[0] : null;
    const bottomBar = document.getElementById('bottom-bar');
    const bottomHandle = document.getElementById('bottom-handle');
    const emptyHome = document.getElementById('empty-home');
    const elementState = (element) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        classes: Array.from(element.classList),
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity),
        pointerEvents: style.pointerEvents,
        bottom: style.bottom,
        transform: style.transform,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
          width: rect.width, height: rect.height },
      };
    };
    return {
      documentReadyState: document.readyState,
      documentHidden: document.hidden,
      desktopState,
      fullDesktopStatus: fullDesktopStatus && fullDesktopStatus.status
        ? fullDesktopStatus.status : fullDesktopStatus,
      htmlClasses: Array.from(document.documentElement.classList),
      bodyClasses: Array.from(document.body.classList),
      ui: {
        controlsAutoHide: typeof controlsAutoHide !== 'undefined' ? !!controlsAutoHide : null,
        controlsHideTimerActive: typeof controlsHideTimer !== 'undefined' && !!controlsHideTimer,
        controlsRevealHoldRemaining: typeof controlsRevealHoldUntil !== 'undefined'
          ? Math.max(0, Math.round(controlsRevealHoldUntil - performance.now())) : null,
        immersiveMode: typeof immersiveMode !== 'undefined' ? !!immersiveMode : null,
        desktopUiActivationState: typeof desktopWallpaperUiActivationState !== 'undefined'
          ? !!desktopWallpaperUiActivationState : null,
        desktopHudPrime: document.body.classList.contains('desktop-wallpaper-hud-prime'),
        homeControlsLocked: document.body.classList.contains('home-controls-locked'),
        safeInsets: ['top', 'right', 'bottom', 'left'].reduce((value, edge) => {
          value[edge] = getComputedStyle(document.documentElement)
            .getPropertyValue('--desktop-safe-' + edge).trim();
          return value;
        }, {}),
        bottomBar: elementState(bottomBar),
        bottomHandle: elementState(bottomHandle),
        emptyHome: elementState(emptyHome),
      },
      runtimeError: String(window.wallpaperEngineRuntimeError || ''),
      selection: {
        active: !!window.wallpaperEngineSelection?.active,
        kind: String(window.wallpaperEngineSelection?.kind || ''),
        id: String(window.wallpaperEngineSelection?.id || ''),
        title: String(window.wallpaperEngineSelection?.title || ''),
      },
      renderer: {
        sessionId: String(window.wallpaperEngineNativeSessionId || ''),
        captureMode: String(typeof wallpaperEngineCaptureMode !== 'undefined'
          ? wallpaperEngineCaptureMode || '' : ''),
        hostBoundsPreparing: !!window.wallpaperEngineHostBoundsPreparing,
        freezeVisible: !!window.wallpaperEngineFreezeVisible,
        hostRecoveryInFlight: !!window.wallpaperEngineHostRecoveryInFlight,
        usesDesktopHostLifecycle: typeof wallpaperEngineUsesDesktopHostLifecycle === 'function'
          ? wallpaperEngineUsesDesktopHostLifecycle() : false,
        videoHasStream: !!video?.srcObject,
        videoReadyState: Number(video?.readyState || 0),
        layerClasses: layer ? Array.from(layer.classList) : [],
        glassSampler: {
          ready: document.body.classList.contains('wallpaper-engine-glass-sampler-ready'),
          classes: glassSampler ? Array.from(glassSampler.classList) : [],
          rect: glassSampler ? (() => {
            const rect = glassSampler.getBoundingClientRect();
            return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
          })() : null,
          videoHasStream: !!glassVideo?.srcObject,
          videoReadyState: Number(glassVideo?.readyState || 0),
          videoWidth: Number(glassVideo?.videoWidth || 0),
          videoHeight: Number(glassVideo?.videoHeight || 0),
          trackState: String(glassTrack?.readyState || ''),
          trackSettings: glassTrack?.getSettings ? glassTrack.getSettings() : null,
          state: window.__mineradioWallpaperEngineGlassSamplerState || null,
          captureDiagnostics: window.__mineradioWallpaperEngineGlassCaptureDiagnostics || null,
        },
      },
      runtime: runtime ? {
        active: !!runtime.active,
        sessionId: String(runtime.sessionId || ''),
        captureMode: String(runtime.captureMode || ''),
        dwmSurfaceReady: !!runtime.dwmSurfaceReady,
        dwmSurfaceActive: !!runtime.dwmSurfaceActive,
        dwmSurfaceHelperPid: Number(runtime.dwmSurfaceHelperPid || 0),
        dwmSurfaceWindowId: String(runtime.dwmSurfaceWindowId || ''),
        dwmGlassSurfaceReady: !!runtime.dwmGlassSurfaceReady,
        dwmGlassSurfaceActive: !!runtime.dwmGlassSurfaceActive,
        dwmGlassSurfaceWindowId: String(runtime.dwmGlassSurfaceWindowId || ''),
        dwmGlassSurfaceSampleMode: String(runtime.dwmGlassSurfaceSampleMode || ''),
        dwmGlassSurfaceGeometry: runtime.dwmGlassSurfaceGeometry || null,
        sourceProcessId: Number(runtime.sourceProcessId || 0),
        sourceWindowId: String(runtime.sourceWindowId || ''),
        sourceWindowParked: !!runtime.sourceWindowParked,
        sourceWindowAligned: !!runtime.sourceWindowAligned,
        hostWindowRect: runtime.hostWindowRect || null,
        sourceWindowRect: runtime.sourceWindowRect || null,
        audioMuted: !!runtime.audioMuted,
        error: String(runtime.error || ''),
      } : null,
    };
  })()`);
  if (screenshotPath) {
    await call('Page.bringToFront');
    const screenshot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, Buffer.from(String(screenshot.data || ''), 'base64'));
    state.screenshotPath = screenshotPath;
  }
  if (shouldExit) {
    await evaluate(`(() => {
      setTimeout(() => window.desktopWindow && desktopWindow.close('exit'), 60);
      return true;
    })()`);
  }
  socket.close();
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
