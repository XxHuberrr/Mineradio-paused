#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2] || 9231);
const evaluateWithUserGesture = !process.argv.includes('--no-user-gesture');
const switchRace = process.argv.includes('--switch-race');
const moveHost = process.argv.includes('--move-host');
const workshopArgument = process.argv.find((value) => /^--workshop=\d+$/.test(value));
const requestedWorkshopId = workshopArgument ? workshopArgument.slice('--workshop='.length) : '';

async function main() {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const target = targets.find((item) => item.type === 'page' && /127\.0\.0\.1/.test(item.url || ''));
  assert(target && target.webSocketDebuggerUrl, 'Mineradio CDP page target was not found');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const consoleMessages = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.consoleAPICalled') {
      consoleMessages.push({
        type: message.params && message.params.type,
        args: ((message.params && message.params.args) || []).map((item) => item.value || item.description || item.type),
      });
      return;
    }
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  function call(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: evaluateWithUserGesture,
    });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Renderer evaluation failed');
    return response.result?.value;
  }

  await call('Runtime.enable');
  await call('Page.enable');
  const result = await evaluate(`(async () => {
    const waitFor = async (predicate, timeoutMs = 30000) => {
      const deadline = performance.now() + timeoutMs;
      while (performance.now() < deadline) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      return false;
    };
    await loadWallpaperEngineLibrary(true, false);
    const requestedWorkshopId = ${JSON.stringify(requestedWorkshopId)};
    let item = requestedWorkshopId
      ? wallpaperEngineProjects.find((project) => project.enginePlayable && String(project.workshopId || '') === requestedWorkshopId)
      : wallpaperEngineProjects.find((project) => project.enginePlayable);
    if (!item) throw new Error('NO_NATIVE_SCENE_PROJECT');
    activateWallpaperEngineItem(item.id);
    if (${switchRace ? 'true' : 'false'}) {
      activateWallpaperEngineItem(item.id);
    }
    const settled = await waitFor(() => document.body.classList.contains('wallpaper-engine-active') || !!wallpaperEngineRuntimeError, 30000);
    const video = document.getElementById('wallpaper-engine-video');
    if (${moveHost ? 'true' : 'false'}) await new Promise((resolve) => setTimeout(resolve, 26000));
    let frames = 0;
    if (settled && video && video.srcObject && typeof video.requestVideoFrameCallback === 'function') {
      const countFrame = () => {
        frames += 1;
        if (frames < 120 && video.srcObject) video.requestVideoFrameCallback(countFrame);
      };
      video.requestVideoFrameCallback(countFrame);
      await new Promise((resolve) => setTimeout(resolve, ${switchRace ? '3200' : '1400'}));
    }
    let pixels = { span: 0, nonBlack: 0, average: 0 };
    let frameDataUrl = '';
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 54;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let minimum = 255;
      let maximum = 0;
      let total = 0;
      let nonBlack = 0;
      for (let i = 0; i < data.length; i += 4) {
        const value = Math.round(data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722);
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
        total += value;
        if (value > 4) nonBlack += 1;
      }
      pixels = { span: maximum - minimum, nonBlack, average: total / (data.length / 4) };
      frameDataUrl = canvas.toDataURL('image/png');
    }
    const desktopApiDuringPlayback = wallpaperEngineDesktopApi();
    const runtimeDuringPlayback = desktopApiDuringPlayback && typeof desktopApiDuringPlayback.getWallpaperEngineRuntimeStatus === 'function'
      ? await desktopApiDuringPlayback.getWallpaperEngineRuntimeStatus({})
      : null;
    const videoTrack = video && video.srcObject && video.srcObject.getVideoTracks
      ? video.srcObject.getVideoTracks()[0]
      : null;
    const videoTrackSettings = videoTrack && typeof videoTrack.getSettings === 'function' ? videoTrack.getSettings() : {};
    const applied = {
      settled,
      id: item.id,
      title: item.title,
      workshopId: item.workshopId,
      kind: wallpaperEngineSelection.kind,
      active: document.body.classList.contains('wallpaper-engine-active'),
      runtimeError: wallpaperEngineRuntimeError,
      hasStream: !!(video && video.srcObject),
      videoWidth: video ? video.videoWidth : 0,
      videoHeight: video ? video.videoHeight : 0,
      readyState: video ? video.readyState : 0,
      frames,
      pixels,
      frameDataUrl,
      sessionId: wallpaperEngineNativeSessionId,
      captureMode: wallpaperEngineCaptureMode,
      audioTrackCount: video && video.srcObject && video.srcObject.getAudioTracks ? video.srcObject.getAudioTracks().length : -1,
      cursorCapture: videoTrackSettings && videoTrackSettings.cursor,
      runtimeStatus: runtimeDuringPlayback,
    };
    deactivateWallpaperEngineBackground(true);
    await waitFor(() => !wallpaperEngineSelection.active && !document.body.classList.contains('wallpaper-engine-active'), 5000);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const desktopApi = wallpaperEngineDesktopApi();
    const runtimeAfterRestore = desktopApi && typeof desktopApi.getWallpaperEngineRuntimeStatus === 'function'
      ? await desktopApi.getWallpaperEngineRuntimeStatus({})
      : null;
    return {
      projectCount: wallpaperEngineProjects.length,
      switchRace: ${switchRace ? 'true' : 'false'},
      moveHost: ${moveHost ? 'true' : 'false'},
      enginePlayableCount: wallpaperEngineLibrarySnapshot && wallpaperEngineLibrarySnapshot.enginePlayableCount,
      runtime: wallpaperEngineLibrarySnapshot && wallpaperEngineLibrarySnapshot.runtime,
      applied,
      restored: {
        selectionActive: wallpaperEngineSelection.active,
        bodyActive: document.body.classList.contains('wallpaper-engine-active'),
        hasStream: !!(video && video.srcObject),
        sessionId: wallpaperEngineNativeSessionId,
        runtimeActive: runtimeAfterRestore && runtimeAfterRestore.active,
        runtimeSessionId: runtimeAfterRestore && runtimeAfterRestore.sessionId,
      },
    };
  })()`);
  result.consoleMessages = consoleMessages.slice(-20);

  const outputDir = path.join(__dirname, '..', 'output', 'playwright');
  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, 'wallpaper-engine-scene-live-frame.png');
  const frameData = String(result.applied.frameDataUrl || '').replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(screenshotPath, Buffer.from(frameData, 'base64'));
  delete result.applied.frameDataUrl;
  socket.close();

  if (result.applied.kind !== 'engine' || !result.applied.active || !result.applied.hasStream || result.applied.frames < 2) {
    console.error(JSON.stringify({ wallpaperEngineLiveSceneDiagnostic: result }, null, 2));
  }

  assert(result.projectCount > 0);
  assert(result.enginePlayableCount > 0);
  assert(result.runtime && result.runtime.available === true, result.runtime && result.runtime.reason || 'Wallpaper Engine runtime unavailable');
  assert.strictEqual(result.applied.settled, true);
  assert.strictEqual(result.applied.kind, 'engine');
  assert.strictEqual(result.applied.active, true, result.applied.runtimeError || 'native Scene layer did not become active');
  assert.strictEqual(result.applied.hasStream, true);
  assert(result.applied.videoWidth > 0 && result.applied.videoHeight > 0, 'native Scene stream has no video dimensions');
  assert(result.applied.frames >= 2, `native Scene stream did not advance frames (${result.applied.frames})`);
  assert(result.applied.pixels.nonBlack > 200, 'native Scene capture is black or empty');
  assert(/^[a-f0-9]{24}$/.test(result.applied.sessionId), 'native Scene session id is missing');
  assert.strictEqual(result.applied.captureMode, 'main-prepared', 'native Scene did not use the main-process prepared capture path');
  if (requestedWorkshopId) assert.strictEqual(String(result.applied.workshopId || ''), requestedWorkshopId, 'requested workshop Scene was not selected');
  assert.strictEqual(result.applied.audioTrackCount, 0, 'native Scene capture must not contain an audio track');
  assert(result.applied.runtimeStatus && result.applied.runtimeStatus.sourceWindowEmbedded === true, 'Wallpaper Engine source window was not docked directly behind Mineradio');
  assert.strictEqual(result.applied.runtimeStatus.sourceWindowAligned, true, 'Wallpaper Engine source window is not pixel-aligned with Mineradio');
  const sourceRect = result.applied.runtimeStatus.sourceWindowRect;
  const hostRect = result.applied.runtimeStatus.hostWindowRect;
  assert(sourceRect && hostRect, 'Wallpaper Engine source/host bounds are unavailable');
  for (const edge of ['left', 'top', 'right', 'bottom']) {
    assert(Math.abs(Number(sourceRect[edge]) - Number(hostRect[edge])) <= 2, `Wallpaper Engine ${edge} edge is not pixel-aligned`);
  }
  assert(Math.abs(result.applied.videoWidth - result.applied.runtimeStatus.width) <= 2, 'native Scene capture width does not match the Mineradio compositor');
  assert(Math.abs(result.applied.videoHeight - result.applied.runtimeStatus.height) <= 2, 'native Scene capture height does not match the Mineradio compositor');
  if (result.applied.cursorCapture && result.applied.cursorCapture !== 'never') {
    assert.strictEqual(result.applied.runtimeStatus.sourceWindowAligned, true, 'cursor-capturing fallback requires exact source/host alignment');
  }
  assert.strictEqual(result.applied.runtimeStatus.audioMuted, true, 'Wallpaper Engine Scene audio mute was not applied');
  assert.strictEqual(result.restored.selectionActive, false);
  assert.strictEqual(result.restored.bodyActive, false);
  assert.strictEqual(result.restored.hasStream, false);
  assert.strictEqual(result.restored.sessionId, '');
  assert.strictEqual(result.restored.runtimeActive, false);
  assert.strictEqual(result.restored.runtimeSessionId, '');
  console.log(JSON.stringify({ ok: true, screenshotPath, ...result }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
