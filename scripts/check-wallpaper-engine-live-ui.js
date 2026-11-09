#!/usr/bin/env node
'use strict';

const assert = require('assert');

const port = Number(process.argv[2] || 9231);

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
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
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
      userGesture: true
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Renderer evaluation failed');
    }
    return response.result?.value;
  }

  await call('Runtime.enable');
  const result = await evaluate(`(async () => {
    const waitFor = async (predicate, timeoutMs = 15000) => {
      const deadline = performance.now() + timeoutMs;
      while (performance.now() < deadline) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return false;
    };
    const originalState = () => ({
      fxBackgroundMedia: JSON.stringify(window.fx && fx.backgroundMedia || null),
      customImageSrc: document.getElementById('custom-bg-img')?.getAttribute('src') || '',
      customVideoSrc: document.getElementById('custom-bg-video')?.getAttribute('src') || ''
    });
    const before = originalState();
    const openButton = document.querySelector('button[onclick="openWallpaperEngineLibrary()"]');
    if (!openButton) throw new Error('Wallpaper Engine entry button is missing');
    openButton.click();
    const scanned = await waitFor(() => !wallpaperEngineLibraryBusy && wallpaperEngineProjects.length > 0);
    const modal = document.getElementById('wallpaper-engine-modal');
    const modalOpenedBeforeApply = !!(modal && modal.classList.contains('show'));
    const cards = Array.from(document.querySelectorAll('.wallpaper-engine-card[data-wallpaper-id]'));
    await waitFor(() => document.querySelectorAll('.wallpaper-engine-card-preview[src]').length > 0, 2000);
    const previewImages = Array.from(document.querySelectorAll('.wallpaper-engine-card-preview'));
    const lazyLoadedPreviews = previewImages.filter((image) => image.hasAttribute('src')).length;
    const loadedPreviewIndices = previewImages.map((image, index) => image.hasAttribute('src') ? index : -1).filter((index) => index >= 0);
    const gridRect = document.getElementById('wallpaper-engine-grid').getBoundingClientRect();
    const gridElement = document.getElementById('wallpaper-engine-grid');
    const gridMetrics = {
      clientHeight: document.getElementById('wallpaper-engine-grid').clientHeight,
      scrollHeight: document.getElementById('wallpaper-engine-grid').scrollHeight,
      top: Math.round(gridRect.top),
      bottom: Math.round(gridRect.bottom),
      firstLoaded: loadedPreviewIndices[0],
      lastLoaded: loadedPreviewIndices[loadedPreviewIndices.length - 1]
    };
    gridElement.scrollTop = gridElement.scrollHeight;
    gridElement.dispatchEvent(new Event('scroll'));
    if (typeof loadWallpaperEnginePreviewsNearViewport === 'function') loadWallpaperEnginePreviewsNearViewport();
    await waitFor(() => previewImages[previewImages.length - 1]?.hasAttribute('src'), 3000);
    const bottomPreviewLoaded = !!previewImages[previewImages.length - 1]?.hasAttribute('src');
    gridElement.scrollTop = 0;
    const keyboardSelectionBefore = wallpaperEngineSelection.id;
    const firstActionButton = document.querySelector('.wallpaper-engine-card [data-wallpaper-action]');
    if (firstActionButton) firstActionButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const keyboardActionScoped = wallpaperEngineSelection.id === keyboardSelectionBefore && modal.classList.contains('show');
    const firstPlayable = cards.find((card) => {
      const item = wallpaperEngineProjectById(card.dataset.wallpaperId);
      return item && item.playable;
    }) || cards[0];
    if (!firstPlayable) throw new Error('No importable Wallpaper Engine card was rendered');
    firstPlayable.click();
    const selected = await waitFor(() => wallpaperEngineSelection.active === true, 3000);
    const layerReady = await waitFor(() => document.body.classList.contains('wallpaper-engine-active') || !!wallpaperEngineRuntimeError, 15000);
    const applied = {
      selectedId: wallpaperEngineSelection.id,
      selectedTitle: wallpaperEngineSelection.title,
      selectionActive: wallpaperEngineSelection.active,
      bodyActive: document.body.classList.contains('wallpaper-engine-active'),
      runtimeError: wallpaperEngineRuntimeError,
      imageSrc: document.getElementById('wallpaper-engine-image')?.getAttribute('src') || '',
      videoSrc: document.getElementById('wallpaper-engine-video')?.getAttribute('src') || '',
      originalLayerPresent: !!document.getElementById('custom-bg')
    };
    const customVideo = document.getElementById('custom-bg-video');
    const savedBackgroundMedia = fx.backgroundMedia;
    const savedCustomPlay = customVideo.play;
    const originalVideoSrcBeforeApply = customVideo.getAttribute('src') || '';
    let hiddenOriginalPlayCalls = 0;
    customVideo.play = function () { hiddenOriginalPlayCalls += 1; return Promise.resolve(); };
    fx.backgroundMedia = { type: 'video', src: 'data:video/mp4;base64,AA==' };
    applyCustomBackground();
    const hiddenOriginalGuard = {
      playCalls: hiddenOriginalPlayCalls,
      sourceUnchanged: (customVideo.getAttribute('src') || '') === originalVideoSrcBeforeApply,
      wallpaperStillActive: document.body.classList.contains('wallpaper-engine-active')
    };
    fx.backgroundMedia = savedBackgroundMedia;
    customVideo.play = savedCustomPlay;
    document.getElementById('wallpaper-engine-restore-btn')?.click();
    await waitFor(() => !wallpaperEngineSelection.active && !document.body.classList.contains('wallpaper-engine-active'), 3000);
    await new Promise((resolve) => setTimeout(resolve, 500));
    openButton.click();
    await waitFor(() => modal && modal.classList.contains('show'), 1000);
    const previewOnlyCard = Array.from(document.querySelectorAll('.wallpaper-engine-card[data-wallpaper-id]')).find((card) => {
      const item = wallpaperEngineProjectById(card.dataset.wallpaperId);
      return item && item.previewOnly && item.hasPreview;
    });
    if (!previewOnlyCard) throw new Error('No preview-only Wallpaper Engine project was rendered');
    previewOnlyCard.click();
    const previewLayerReady = await waitFor(() => document.body.classList.contains('wallpaper-engine-active') || !!wallpaperEngineRuntimeError, 10000);
    const previewApplied = {
      projectType: wallpaperEngineSelection.projectType,
      kind: wallpaperEngineSelection.kind,
      mediaType: wallpaperEngineSelection.mediaType,
      bodyActive: document.body.classList.contains('wallpaper-engine-active'),
      runtimeError: wallpaperEngineRuntimeError,
      imageSrc: document.getElementById('wallpaper-engine-image')?.getAttribute('src') || '',
      videoSrc: document.getElementById('wallpaper-engine-video')?.getAttribute('src') || ''
    };
    document.getElementById('wallpaper-engine-restore-btn')?.click();
    await waitFor(() => !wallpaperEngineSelection.active && !document.body.classList.contains('wallpaper-engine-active'), 3000);
    await new Promise((resolve) => setTimeout(resolve, 500));
    openButton.click();
    await waitFor(() => modal && modal.classList.contains('show'), 1000);
    const savedProjects = wallpaperEngineProjects;
    const seedProject = savedProjects[0];
    wallpaperEngineProjects = Array.from({ length: 960 }, (_, index) => ({
      ...seedProject,
      id: (index + 1).toString(16).padStart(24, '0'),
      title: 'Large library fixture ' + (index + 1),
      playable: false,
      previewOnly: true,
      hasPreview: false,
      previewAnimated: false
    }));
    renderWallpaperEngineLibrary();
    const largeLibraryInitialCards = document.querySelectorAll('.wallpaper-engine-card[data-wallpaper-id]').length;
    const largeLibraryTotal = wallpaperEngineProjects.length;
    gridElement.scrollTop = gridElement.scrollHeight;
    gridElement.dispatchEvent(new Event('scroll'));
    await waitFor(() => document.querySelectorAll('.wallpaper-engine-card[data-wallpaper-id]').length > largeLibraryInitialCards, 2000);
    const largeLibraryExtendedCards = document.querySelectorAll('.wallpaper-engine-card[data-wallpaper-id]').length;
    wallpaperEngineProjects = savedProjects;
    renderWallpaperEngineLibrary();
    closeWallpaperEngineLibrary();
    return {
      readyState: document.readyState,
      hasDesktopApi: !!(window.desktopWindow && desktopWindow.listWallpaperEngineProjects),
      hasIndependentLayer: !!document.getElementById('wallpaper-engine-layer'),
      hasOriginalLayer: !!document.getElementById('custom-bg'),
      modalOpened: modalOpenedBeforeApply,
      scanned,
      projectCount: wallpaperEngineProjects.length,
      snapshotCount: wallpaperEngineLibrarySnapshot && wallpaperEngineLibrarySnapshot.count,
      dynamicCount: wallpaperEngineLibrarySnapshot && wallpaperEngineLibrarySnapshot.dynamicCount,
      previewOnlyCount: wallpaperEngineLibrarySnapshot && wallpaperEngineLibrarySnapshot.previewOnlyCount,
      status: document.getElementById('wallpaper-engine-library-status')?.textContent || '',
      cardCount: cards.length,
      previewCount: previewImages.length,
      lazyLoadedPreviews,
      gridMetrics,
      bottomPreviewLoaded,
      keyboardActionScoped,
      selected,
      layerReady,
      applied,
      hiddenOriginalGuard,
      previewLayerReady,
      previewApplied,
      largeLibrary: {
        total: largeLibraryTotal,
        initialCards: largeLibraryInitialCards,
        extendedCards: largeLibraryExtendedCards
      },
      restored: {
        selectionActive: wallpaperEngineSelection.active,
        bodyActive: document.body.classList.contains('wallpaper-engine-active'),
        originalState: originalState()
      },
      before
    };
  })()`);

  socket.close();
  assert.strictEqual(result.readyState, 'complete');
  assert.strictEqual(result.hasDesktopApi, true);
  assert.strictEqual(result.hasIndependentLayer, true);
  assert.strictEqual(result.hasOriginalLayer, true);
  assert.strictEqual(result.modalOpened, true);
  assert.strictEqual(result.scanned, true);
  assert(result.projectCount > 0);
  assert.strictEqual(result.projectCount, result.snapshotCount);
  assert.strictEqual(result.cardCount, result.projectCount);
  assert(result.gridMetrics.scrollHeight > result.gridMetrics.clientHeight * 3, 'Wallpaper library must keep its full scroll range');
  assert(result.lazyLoadedPreviews < result.previewCount, `Wallpaper previews must load lazily, not all at once (${result.lazyLoadedPreviews}/${result.previewCount})`);
  assert.strictEqual(result.bottomPreviewLoaded, true, 'Wallpaper library must lazy-load previews after scrolling to the end');
  assert.strictEqual(result.keyboardActionScoped, true);
  assert.strictEqual(result.selected, true);
  assert.strictEqual(result.layerReady, true);
  assert.strictEqual(result.applied.selectionActive, true);
  assert.strictEqual(result.applied.bodyActive, true, result.applied.runtimeError || 'Wallpaper Engine layer did not become ready');
  assert.strictEqual(result.applied.originalLayerPresent, true);
  assert(/^mineradio-wallpaper:\/\//.test(result.applied.imageSrc || result.applied.videoSrc));
  assert(/[?&]token=[a-f0-9]{48}/.test(result.applied.imageSrc || result.applied.videoSrc));
  assert.strictEqual(result.hiddenOriginalGuard.playCalls, 0);
  assert.strictEqual(result.hiddenOriginalGuard.sourceUnchanged, true);
  assert.strictEqual(result.hiddenOriginalGuard.wallpaperStillActive, true);
  assert.strictEqual(result.previewLayerReady, true);
  assert.strictEqual(result.previewApplied.kind, 'preview');
  assert.strictEqual(result.previewApplied.mediaType, 'image');
  assert.strictEqual(result.previewApplied.bodyActive, true, result.previewApplied.runtimeError || 'Preview-only layer did not become ready');
  assert(/^mineradio-wallpaper:\/\/preview\//.test(result.previewApplied.imageSrc));
  assert(/[?&]token=[a-f0-9]{48}/.test(result.previewApplied.imageSrc));
  assert.strictEqual(result.previewApplied.videoSrc, '');
  assert.strictEqual(result.largeLibrary.total, 960);
  assert(result.largeLibrary.initialCards < result.largeLibrary.total, 'Very large wallpaper libraries must be rendered in batches');
  assert(result.largeLibrary.extendedCards > result.largeLibrary.initialCards, 'Scrolling near the end must append the next wallpaper batch');
  assert.strictEqual(result.restored.selectionActive, false);
  assert.strictEqual(result.restored.bodyActive, false);
  assert.deepStrictEqual(result.restored.originalState, result.before);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
