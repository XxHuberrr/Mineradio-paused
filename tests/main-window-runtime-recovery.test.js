'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const mainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
const runtimeText = fs.readFileSync(path.join(appRoot, 'desktop', 'wallpaper-engine-runtime.js'), 'utf8');
const htmlText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
const desktopShellText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '10-shell', '04-desktop-overlay-fullscreen.js'), 'utf8');

function sourceBlock(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle);
  assert(start >= 0, `missing source block: ${startNeedle}`);
  const end = text.indexOf(endNeedle, start + startNeedle.length);
  assert(end > start, `missing source block terminator: ${endNeedle}`);
  return text.slice(start, end);
}

function testLoginWishTitle() {
  assert.match(
    htmlText,
    /<h1>\s*心愿是\s*<\/h1>/,
    'login easter-egg panel title must stay as 心愿是'
  );
  assert.doesNotMatch(
    htmlText,
    /<h1>\s*我希望\s*<\/h1>/,
    'old title 我希望 must not return'
  );
}

function testWallpaperEngineElevationBroker() {
  assert.doesNotMatch(
    mainText,
    /WALLPAPER_ENGINE_HOST_ELEVATED/,
    'main process must not block Wallpaper Engine only because Mineradio is elevated'
  );
  [
    /function controlBrokerScript/,
    /GetShellWindow\(\)/,
    /GetIntegrityRid\(explorerToken\)/,
    /PROC_THREAD_ATTRIBUTE_PARENT_PROCESS/,
    /CreateProcessW\(/,
    /Wallpaper Engine child is not medium integrity/,
    /async _spawnControlViaDesktopShell/,
    /const elevated = this\.useDesktopShellBroker && await this\._hostIsElevated\(\)/,
    /if \(elevated\)\s*\{\s*return this\._spawnControlViaDesktopShell\(executable, args\)/,
  ].forEach(pattern => assert.match(
    runtimeText,
    pattern,
    `Wallpaper Engine Explorer integrity broker contract missing: ${pattern}`
  ));
}

function testRendererGoneDelayedRecovery() {
  const recoveryBlock = sourceBlock(
    mainText,
    'function recoverMainWindowAfterRendererGone(win, details = {}, cleanupPromise = null)',
    'async function loadMainWindowWithRetry(win)'
  );
  assert.match(recoveryBlock, /await startupDelay\(\d+\)/, 'renderer recovery must be delayed outside the gone callback');
  assert.match(recoveryBlock, /await ensureLocalServerStarted\(\)/, 'recovery must ensure local server is ready');
  assert.match(recoveryBlock, /await loadMainWindowWithRetry\(win\)/, 'recovery must reload the main page');
  assert.match(recoveryBlock, /mainWindowRendererRecoveryPromise/, 'only one renderer recovery task may run at once');
  assert.match(recoveryBlock, /reserveMainWindowRendererRecoveryAttempt\(\)/, 'renderer recovery must be rate limited');
  assert.match(
    recoveryBlock,
    /if \(cleanupPromise\) await Promise\.resolve\(cleanupPromise\)[\s\S]{0,260}await loadMainWindowWithRetry\(win\)/,
    'renderer reload must wait for WE and desktop cleanup'
  );
  assert.match(recoveryBlock, /const keepIntentionallyHidden = win\.__mineradioIntentionalHide === true/, 'recovery must snapshot tray hide state');
  assert.match(
    recoveryBlock,
    /win\.__mineradioIntentionalHide = keepIntentionallyHidden;\s*if \(!keepIntentionallyHidden\) showMainWindowSafely\(win, `renderer-recovered-\$\{attempt\}`\);\s*else sendWindowState\(win\)/,
    'renderer recovery must not foreground the tray-hidden window'
  );

  const goneBlock = sourceBlock(
    mainText,
    "win.webContents.on('render-process-gone'",
    "win.on('unresponsive'"
  );
  assert.match(goneBlock, /startupCompleted/, 'startup and runtime renderer exits must be separated');
  assert.match(goneBlock, /const cleanupPromise = Promise\.allSettled\(\[/, 'renderer exit must combine WE and desktop cleanup');
  assert.match(goneBlock, /setTimeout\(\(\) => recoverMainWindowAfterRendererGone\(win, details, cleanupPromise\), 0\)/, 'navigation must not run synchronously in render-process-gone');
  assert.match(goneBlock, /details\.reason[\s\S]{0,120}clean-exit/, 'clean renderer exits must not trigger recovery');
}

function testWindowVisibilityAndSystemWakeGuards() {
  const visibilityBlock = sourceBlock(
    mainText,
    'function shouldRestoreUnexpectedMainWindowVisibility(win)',
    'function reserveMainWindowRendererRecoveryAttempt()'
  );
  assert.match(visibilityBlock, /startupCompleted/, 'runtime visibility guard must wait for startup completion');
  assert.match(visibilityBlock, /win\.__mineradioIntentionalHide === true/, 'tray intentional hide must be skipped');
  assert.match(visibilityBlock, /win\.__mineradioExpectedVisible === false/, 'explicitly hidden windows must not be restored');
  assert.match(visibilityBlock, /fullDesktopModeHostVisibilityTransitionDepth > 0/, 'desktop embedding transitions must be skipped');
  assert.match(visibilityBlock, /fullDesktopModeRuntime\.getStatus\('main-window-visibility-guard'\)\.enabled === true/, 'desktop mode must not be pulled back above Explorer');
  assert.match(visibilityBlock, /function shouldRestoreUnexpectedMainWindowMinimize\(win\)/, 'unexpected minimize must have a dedicated guard');
  assert.match(visibilityBlock, /win\.__mineradioIntentionalMinimize === true/, 'explicit user minimize must remain minimized');
  assert.match(visibilityBlock, /fullDesktopModeRuntime\.getStatus\('main-window-minimize-guard'\)\.enabled === true/, 'desktop embedding must not be disturbed by minimize recovery');
  assert.match(visibilityBlock, /return win\.isMinimized\(\)/, 'only an actually minimized window may enter minimize recovery');
  assert.match(visibilityBlock, /restoreUnexpectedMainWindowMinimize\(win, reason\)/, 'the visibility watchdog must recover unexplained minimize state');
  assert.match(visibilityBlock, /win\.isVisible\(\)/, 'visible windows must not be shown again');
  assert.match(visibilityBlock, /setInterval\([\s\S]{0,180}restoreUnexpectedMainWindowVisibility\(win, 'visibility-watchdog'\)/, 'main window visibility must have a low-frequency watchdog');
  assert.match(visibilityBlock, /function shouldRestoreUnexpectedFullscreenVisibility\(win\)/, 'fullscreen-specific guard must remain available');
  assert.match(visibilityBlock, /!win\.isFullScreen\(\)/, 'fullscreen-specific guard must only restore fullscreen windows');
  assert.match(visibilityBlock, /restoreUnexpectedFullscreenVisibility\(win, reason\)/, 'main guard must reuse fullscreen recovery when applicable');

  assert.match(mainText, /win\.__mineradioIntentionalHide = true;[\s\S]{0,140}markMainWindowExpectedVisible\(win, false, 'tray-hide'\)[\s\S]{0,180}win\.hide\(\)/, 'tray hide must be marked intentional and not expected visible before hide');
  assert.match(mainText, /win\.on\('show'[\s\S]{0,180}win\.__mineradioIntentionalHide = false[\s\S]{0,140}markMainWindowExpectedVisible\(win, true, 'show'\)/, 'show must clear intentional hide and restore expected visibility');
  assert.match(mainText, /win\.on\('hide'[\s\S]{0,320}restoreUnexpectedMainWindowVisibility\(win, 'hide-event'\)/, 'unexpected hide must schedule a short delayed restore');
  assert.match(mainText, /ipcMain\.handle\('desktop-window-minimize'[\s\S]{0,320}armMainWindowMinimizeIntent\(win, 'renderer-window-control'\)[\s\S]{0,100}win\?\.minimize\(\)/, 'the visible minimize control must arm explicit user intent before minimizing');
  assert.match(mainText, /hookWindowMessage\(WINDOWS_WM_SYSCOMMAND[\s\S]{0,220}WINDOWS_SC_MINIMIZE[\s\S]{0,140}native-system-command/, 'native taskbar and system-menu minimize commands must be treated as intentional');
  const minimizeEventBlock = sourceBlock(mainText, "win.on('minimize'", "win.on('restore'");
  assert.match(minimizeEventBlock, /consumeMainWindowMinimizeIntent\(win\)/, 'minimize events must classify explicit user intent');
  assert.match(minimizeEventBlock, /if \(minimizeIntent\.intentional\)/, 'intentional minimize must keep the normal background path');
  assert.match(minimizeEventBlock, /restoreUnexpectedMainWindowMinimize\(win, 'minimize-event'\)/, 'unexplained minimize events must schedule bounded recovery');
  assert.match(mainText, /win\.on\('restore'[\s\S]{0,220}clearMainWindowMinimizeIntent\(win\)/, 'restoring the window must clear stale minimize intent');
  const rendererMinimizeBlock = sourceBlock(desktopShellText, 'function animateDesktopWindowMinimize(api, activationEvent)', 'function animateDesktopWindowRestore()');
  assert.match(rendererMinimizeBlock, /activationEvent\.isTrusted !== true/, 'renderer minimize must require a real title-bar activation');
  assert.match(desktopShellText, /action === 'minimize'\) animateDesktopWindowMinimize\(api, e\)/, 'the trusted click event must be passed into minimize validation');
  assert.match(mainText, /startupCompleted = true;[\s\S]{0,120}startMainWindowVisibilityGuard\(win\)/, 'main guard must start after successful navigation');
  assert.match(mainText, /win\.on\('closed'[\s\S]{0,160}clearMainWindowVisibilityGuard\(\)/, 'main guard must stop on window close');
  assert.match(mainText, /win\.on\('enter-full-screen'[\s\S]{0,220}startMainWindowFullscreenVisibilityGuard\(win\)/, 'enter fullscreen must start fullscreen guard');
  assert.match(mainText, /win\.on\('leave-full-screen'[\s\S]{0,180}clearMainWindowFullscreenVisibilityGuard\(\)/, 'leave fullscreen must stop fullscreen guard');
  assert.match(mainText, /const\s+\{[^}]*\bpowerMonitor\b[^}]*\}\s*=\s*require\('electron'\)/, 'main process must import powerMonitor');
  assert.match(mainText, /powerMonitor\.on\('resume',[\s\S]{0,140}restoreUnexpectedMainWindowVisibility\(mainWindow, 'system-resume'\)/, 'system resume must check main window visibility');
  assert.match(mainText, /powerMonitor\.on\('unlock-screen',[\s\S]{0,160}restoreUnexpectedMainWindowVisibility\(mainWindow, 'screen-unlock'\)/, 'screen unlock must check main window visibility');
}

testLoginWishTitle();
testWallpaperEngineElevationBroker();
testRendererGoneDelayedRecovery();
testWindowVisibilityAndSystemWakeGuards();

console.log('[OK] Main-window runtime recovery preserves intentional minimize and restores unexpected window loss.');
