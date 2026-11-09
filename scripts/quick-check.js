const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const runElectron = process.argv.includes('--electron') || process.argv.includes('--full');
const forbiddenPattern = /\b(fsr|dlss|native-fg|framegen)\b|frame generation/i;

function rel(file) {
  return path.relative(appRoot, file).replace(/\\/g, '/');
}

function logStep(name) {
  console.log(`\n== ${name} ==`);
}

function fail(message) {
  throw new Error(message);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'dist-internal-beta', 'vendor'].includes(entry.name)) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function jsCheckFiles() {
  const files = [];
  const addIfExists = file => {
    if (fs.existsSync(file)) files.push(file);
  };

  walk(path.join(appRoot, 'public', 'js', 'modules')).forEach(file => {
    if (file.endsWith('.js')) files.push(file);
  });
  addIfExists(path.join(appRoot, 'public', 'js', 'index-loader.js'));
  walk(path.join(appRoot, 'desktop')).forEach(file => {
    if (file.endsWith('.js')) files.push(file);
  });
  addIfExists(path.join(appRoot, 'server.js'));
  addIfExists(path.join(appRoot, 'qq-vip-api.js'));
  addIfExists(path.join(appRoot, 'dj-analyzer.js'));
  walk(path.join(appRoot, 'cuefield')).forEach(file => {
    if (file.endsWith('.js')) files.push(file);
  });

  return [...new Set(files)].sort();
}

function runNodeSyntaxCheck(files) {
  logStep('Node syntax check');
  let checked = 0;
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: appRoot,
      encoding: 'utf8'
    });
    if (result.status !== 0) {
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      fail(`node --check failed: ${rel(file)}`);
    }
    checked += 1;
  }
  console.log(`[OK] Checked ${checked} JavaScript files.`);
}

function runPlaybackAudioGraphRegressionCheck() {
  logStep('Playback audio graph track-switch regression');
  const testFile = path.join(appRoot, 'tests', 'playback-audio-graph-recovery.test.js');
  const result = spawnSync(process.execPath, [testFile], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`playback audio graph regression failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runPlaybackSourceFallbackTransactionCheck() {
  logStep('Playback source fallback finite transaction regression');
  const testFile = path.join(appRoot, 'tests', 'playback-source-fallback-transaction.test.js');
  const result = spawnSync(process.execPath, [testFile], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`playback source fallback transaction regression failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runPlaybackSingleRepeatLoopRegressionCheck() {
  logStep('Playback single-repeat loop regression');
  const testFile = path.join(appRoot, 'tests', 'playback-single-repeat-loop.test.js');
  const result = spawnSync(process.execPath, [testFile], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`playback single-repeat loop regression failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runLocalMusicLibraryRegressionCheck() {
  logStep('Persistent local FLAC library regression');
  const testFile = path.join(appRoot, 'tests', 'local-music-library-persistence.test.js');
  const result = spawnSync(process.execPath, ['--test', testFile], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`persistent local FLAC library regression failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runBuiltInPlaylistRegressionCheck() {
  logStep('Persistent cross-provider built-in playlist regression');
  const testFile = path.join(appRoot, 'tests', 'built-in-playlist-library.test.js');
  const result = spawnSync(process.execPath, ['--test', testFile], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`built-in playlist regression failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runWallpaperEngineIdleDisposeRegressionCheck() {
  logStep('Wallpaper Engine idle-dispose regression');
  const testFile = path.join(appRoot, 'tests', 'wallpaper-engine-idle-dispose.test.js');
  const result = spawnSync(process.execPath, [testFile], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`Wallpaper Engine idle-dispose regression failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runWallpaperEngineMinimizeResidentRegressionCheck() {
  logStep('Wallpaper Engine minimize resident regression');
  const testFile = path.join(appRoot, 'tests', 'wallpaper-engine-minimize-resident.test.js');
  const result = spawnSync(process.execPath, [testFile], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`Wallpaper Engine minimize resident regression failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runWallpaperEngineWin10YellowBorderRegressionCheck() {
  logStep('Wallpaper Engine Win10 yellow-border regression');
  const testFile = path.join(appRoot, 'tests', 'wallpaper-engine-win10-yellow-border.test.js');
  const result = spawnSync(process.execPath, [testFile], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`Wallpaper Engine Win10 yellow-border regression failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runGestureCameraPermissionRegressionCheck() {
  logStep('Gesture camera permission regression');
  const testFile = path.join(appRoot, 'tests', 'gesture-camera-permission.test.js');
  const result = spawnSync(process.execPath, [testFile], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`gesture camera permission regression failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runGesturePlayerActionsRegressionCheck() {
  logStep('Gesture player actions regression');
  const testFile = path.join(appRoot, 'tests', 'gesture-player-actions.test.js');
  const result = spawnSync(process.execPath, [testFile], { cwd: appRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`gesture player actions regression failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runGestureRuntimeLifecycleRegressionCheck() {
  logStep('Gesture camera runtime lifecycle regression');
  const testFile = path.join(appRoot, 'tests', 'gesture-runtime-lifecycle.test.js');
  const result = spawnSync(process.execPath, [testFile], { cwd: appRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`gesture camera runtime lifecycle regression failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runCuratedVisualPresetsRegressionCheck() {
  logStep('Curated visual presets regression');
  const testFile = path.join(appRoot, 'tests', 'curated-visual-presets.test.js');
  const result = spawnSync(process.execPath, [testFile], { cwd: appRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`curated visual presets regression failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runVisualClarityAndPortraitFullscreenRegressionCheck() {
  logStep('Lyric clarity, WE visual controls, and portrait fullscreen regression');
  const testFile = path.join(appRoot, 'tests', 'visual-clarity-and-portrait-fullscreen.test.js');
  const result = spawnSync(process.execPath, ['--test', testFile], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`visual clarity and portrait fullscreen regression failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runQQVipEntitlementRegressionCheck() {
  logStep('QQ/Kugou provider entitlement regression');
  const testFiles = [
    path.join(appRoot, 'tests', 'qq-vip-entitlement.test.js'),
    path.join(appRoot, 'tests', 'kugou-vip-hardening.test.js'),
    path.join(appRoot, 'tests', 'kugou-login-bridge.test.js'),
    path.join(appRoot, 'tests', 'kugou-api-resilience.test.js'),
    path.join(appRoot, 'tests', 'provider-login-state-recovery.test.js'),
    path.join(appRoot, 'tests', 'provider-entitlement-boundary.test.js'),
  ];
  const result = spawnSync(process.execPath, ['--test'].concat(testFiles), {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail('QQ/Kugou provider entitlement regression failed');
  }
  process.stdout.write(result.stdout || '');
}

function runLoginEasterEggGateRegressionCheck() {
  logStep('Login easter egg one-time gate and IME focus regression');
  const testFiles = [
    path.join(appRoot, 'tests', 'login-easter-egg-gate.test.js'),
    path.join(appRoot, 'tests', 'login-easter-egg-ime-focus.test.js'),
  ];
  const result = spawnSync(process.execPath, ['--test'].concat(testFiles), {
    cwd: appRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`login easter egg gate/IME regression failed: ${testFiles.map(rel).join(', ')}`);
  }
  process.stdout.write(result.stdout || '');
}

function runSpotifyApiResilienceRegressionCheck() {
  logStep('Spotify API resilience regression');
  const testFile = path.join(appRoot, 'tests', 'spotify-api-resilience.test.js');
  const result = spawnSync(process.execPath, [testFile], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`Spotify API resilience regression failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runProviderRemovalDiyCinemaRegressionCheck() {
  logStep('Provider removal, fullscreen DIY, and cinematic preload regression');
  const testFile = path.join(appRoot, 'tests', 'provider-removal-diy-cinema-preload.test.js');
  const result = spawnSync(process.execPath, ['--test', testFile], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`provider removal/DIY/cinematic regression failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runVisualPerformanceControlsRegressionCheck() {
  logStep('Visual performance controls regression');
  const testFile = path.join(appRoot, 'tests', 'visual-performance-controls.test.js');
  const result = spawnSync(process.execPath, ['--test', testFile], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`visual performance controls regression failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runPlatformAccountSyncGuardCheck() {
  logStep('Platform account action and listen-sync guard');
  const testFile = path.join(appRoot, 'tests', 'platform-account-sync-guard.test.js');
  const result = spawnSync(process.execPath, [testFile], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail(`platform account/listen-sync guard failed: ${rel(testFile)}`);
  }
  process.stdout.write(result.stdout || '');
}

function runHomeDailyRecommendationRegressionCheck() {
  logStep('Complete daily recommendation data and bounded rendering regression');
  const testFiles = [
    path.join(appRoot, 'tests', 'home-daily-recommendations-backend.test.js'),
    path.join(appRoot, 'tests', 'home-daily-recommendation-virtualization.test.js'),
  ];
  const result = spawnSync(process.execPath, ['--test'].concat(testFiles), {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail('complete daily recommendation regression failed');
  }
  process.stdout.write(result.stdout || '');
}

function runQishuiProviderDistributionRegressionCheck() {
  logStep('Qishui provider distribution, entitlement, and signed Passport QR regression');
  const testFiles = [
    path.join(appRoot, 'tests', 'qishui-provider-distribution.test.js'),
    path.join(appRoot, 'tests', 'qishui-passport-qr-login.test.js'),
    path.join(appRoot, 'tests', 'qishui-session-recovery.test.js'),
    path.join(appRoot, 'tests', 'qishui-entitlement-cache.test.js'),
    path.join(appRoot, 'tests', 'qishui-tier-rights.test.js'),
  ];
  const result = spawnSync(process.execPath, ['--test'].concat(testFiles), {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    fail('Qishui provider distribution/entitlement/QR regression failed');
  }
  process.stdout.write(result.stdout || '');
}

function parseCombinedIndexModules() {
  logStep('Combined index module parse');
  const publicDir = path.join(appRoot, 'public');
  const loaderPath = path.join(publicDir, 'js', 'index-loader.js');
  const loader = fs.readFileSync(loaderPath, 'utf8');
  const match = loader.match(/const modulePaths = \[([\s\S]*?)\];/);
  if (!match) fail('modulePaths not found in public/js/index-loader.js');
  const modulePaths = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  const combined = modulePaths
    .map(modulePath => fs.readFileSync(path.join(publicDir, modulePath), 'utf8'))
    .join('\n');
  new Function(combined);
  console.log(`[OK] Combined classic script parses. Modules: ${modulePaths.length}.`);
}

function scanForbiddenMarkers() {
  logStep('Forbidden FSR/DLSS/native FG scan');
  const scanTargets = [
    path.join(appRoot, 'public', 'js'),
    path.join(appRoot, 'desktop'),
    path.join(appRoot, 'server.js'),
    path.join(appRoot, 'dj-analyzer.js'),
    path.join(appRoot, 'cuefield')
  ];
  const files = [];
  for (const target of scanTargets) {
    if (!fs.existsSync(target)) continue;
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      walk(target).forEach(file => {
        if (/\.(js|json|html|css)$/i.test(file)) files.push(file);
      });
    } else {
      files.push(target);
    }
  }

  const hits = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (forbiddenPattern.test(text)) hits.push(rel(file));
  }
  if (hits.length) fail(`Forbidden markers found:\n${hits.join('\n')}`);
  console.log(`[OK] No FSR/DLSS/native FG markers in ${files.length} scanned files.`);
}

function checkMainWindowChrome() {
  logStep('Main window chrome guard');
  const mainPath = path.join(appRoot, 'desktop', 'main.js');
  const text = fs.readFileSync(mainPath, 'utf8');
  const mainWindowIndex = Math.max(
    text.indexOf('mainWindow = new BrowserWindow({'),
    text.indexOf('const win = new BrowserWindow({'),
  );
  if (mainWindowIndex < 0) fail('main BrowserWindow definition not found in desktop/main.js');
  const snippet = text.slice(mainWindowIndex, mainWindowIndex + 900);
  if (!/frame:\s*false/.test(snippet)) fail('main window is not configured as frame:false');
  if (!/transparent:\s*true/.test(snippet)) fail('main window is not configured as transparent:true');
  console.log('[OK] Main player window still uses frame:false and transparent:true.');
}

function checkBackgroundTransparencyControlsGuard() {
  logStep('Background transparency controls guard');
  const htmlText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const rendererText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '01-scene', '00-renderer-quality.js'), 'utf8');
  const defaultsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '04-fx-defaults.js'), 'utf8');
  const persistenceText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '04-visual-settings-persistence.js'), 'utf8');
  const backgroundText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '02-accent-background-controls.js'), 'utf8');
  const panelText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '05-fx-panel-performance.js'), 'utf8');
  const bindingText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '07-bindings-shelf-immersive.js'), 'utf8');
  const archiveText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '00-preset-archive-data.js'), 'utf8');
  if (!/id="fx-windowbgopacity"/.test(htmlText) || !/id="fx-bgglassopacity"/.test(htmlText) || !/id="bg-album-toggle-btn"/.test(htmlText) || !/id="bg-media-crop-btn"/.test(htmlText) || !/id="background-crop-modal"/.test(htmlText) || !/id="fx-bgcropx"/.test(htmlText) || !/id="fx-bgcropy"/.test(htmlText) || !/id="fx-bgzoom"/.test(htmlText)) {
    fail('background transparency/media/crop controls are missing from the appearance panel');
  }
  if (!/alpha:\s*true/.test(rendererText) || !/setClearColor\(0x000000,\s*0\)/.test(rendererText)) {
    fail('WebGL renderer must keep a transparent clear buffer for window background opacity');
  }
  if (!/windowBackgroundOpacity:\s*1/.test(defaultsText) || !/backgroundGlassOpacity:\s*0/.test(defaultsText) || !/backgroundAlbumCover:\s*false/.test(defaultsText) || !/backgroundMediaCropX:\s*50/.test(defaultsText) || !/backgroundMediaZoom:\s*1/.test(defaultsText)) {
    fail('background transparency defaults must preserve the current opaque look');
  }
  if (!/rgba\(var\(--custom-bg-color-rgb/.test(cssText) || !/custom-bg-glass-active/.test(cssText) || !/custom-background-album-cover/.test(cssText) || !/background-crop-stage/.test(cssText) || !/body\.custom-background-override #album-bg/.test(cssText) || !/--custom-bg-position-x/.test(cssText) || !/backdrop-filter:\s*blur\(var\(--custom-bg-glass-blur/.test(cssText)) {
    fail('background layer must expose base alpha and gated glass blur CSS variables');
  }
  if (!/windowBackgroundOpacity/.test(backgroundText) || !/backgroundGlassOpacity/.test(backgroundText) || !/backgroundAlbumCover/.test(backgroundText) || !/customBackgroundActiveMedia/.test(backgroundText) || !/customBackgroundAlbumCoverSource/.test(backgroundText) || !/openCustomBackgroundCropModal/.test(backgroundText) || !/applyCustomBackgroundCropVars/.test(backgroundText) || !/--custom-bg-base-opacity/.test(backgroundText) || !/--custom-bg-glass-blur/.test(backgroundText)) {
    fail('background controls must apply window and glass opacity at runtime');
  }
  if (!/windowBackgroundOpacity/.test(persistenceText) || !/backgroundGlassOpacity/.test(persistenceText) || !/backgroundAlbumCover/.test(persistenceText) || !/backgroundMediaCrop: \['backgroundMediaCropX', 'backgroundMediaCropY', 'backgroundMediaZoom'\]/.test(persistenceText) || !/windowBackgroundOpacity: \['windowBackgroundOpacity'\]/.test(persistenceText)) {
    fail('background transparency controls must be persisted with scoped autosave keys');
  }
  if (!/fx-windowbgopacity/.test(panelText) || !/fx-bgglassopacity/.test(panelText) || !/fx-bgcropx/.test(panelText) || !/fx-bgzoom/.test(panelText) || !/updateCustomBackgroundControls\(\)/.test(panelText)) {
    fail('background transparency controls must sync panel values and reset immediately');
  }
  if (!/fx-windowbgopacity/.test(bindingText) || !/backgroundGlassOpacity/.test(bindingText) || !/backgroundMediaCropX/.test(bindingText) || !/backgroundMediaZoom/.test(bindingText)) {
    fail('background transparency sliders must be bound to runtime fx values');
  }
  if (!/windowBackgroundOpacity/.test(archiveText) || !/backgroundGlassOpacity/.test(archiveText) || !/backgroundAlbumCover/.test(archiveText) || !/backgroundMediaZoom/.test(archiveText)) {
    fail('background transparency controls must be included in user preset archives');
  }
  console.log('[OK] Background window opacity and gated glass opacity controls are wired through UI, CSS, runtime, persistence, and archives.');
}

function checkWallpaperEngineImportGuard() {
  logStep('Wallpaper Engine additive import guard');
  const htmlText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const rendererPath = path.join(appRoot, 'public', 'js', 'modules', '07-fx', '03-wallpaper-engine-library.js');
  const rendererText = fs.readFileSync(rendererPath, 'utf8');
  const controlGlassText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '15-control-glass-animations.js'), 'utf8');
  const mainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
  const preloadText = fs.readFileSync(path.join(appRoot, 'desktop', 'preload.js'), 'utf8');
  const libraryText = fs.readFileSync(path.join(appRoot, 'desktop', 'wallpaper-engine-library.js'), 'utf8');
  const runtimeText = fs.readFileSync(path.join(appRoot, 'desktop', 'wallpaper-engine-runtime.js'), 'utf8');
  const systemMemoryText = fs.readFileSync(path.join(appRoot, 'desktop', 'system-memory.js'), 'utf8');
  const lifecycleText = fs.readFileSync(path.join(appRoot, 'scripts', 'check-wallpaper-engine-lifecycle.js'), 'utf8');
  if (!/id="custom-bg"/.test(htmlText) || !/id="bg-image-value"/.test(htmlText) || !/id="wallpaper-engine-layer"/.test(htmlText) || !/id="wallpaper-engine-modal"/.test(htmlText)) {
    fail('Wallpaper Engine import must be additive and keep the original background-media controls');
  }
  if (!/body\.wallpaper-engine-active #custom-bg/.test(cssText) || !/#wallpaper-engine-layer\.ready/.test(cssText)
    || !/body\.wallpaper-engine-dwm-active #wallpaper-engine-layer/.test(cssText)) {
    fail('Wallpaper Engine layer must crossfade independently above the preserved original background');
  }
  if (/setCustomBackgroundMedia\s*\(/.test(rendererText) || /fx\.backgroundMedia\s*=/.test(rendererText)) {
    fail('Wallpaper Engine import must never overwrite fx.backgroundMedia');
  }
  if (!/restoreOriginalBackgroundAfterWallpaperEngine/.test(rendererText) || !/visibilitychange/.test(rendererText) || !/IntersectionObserver/.test(rendererText) || !/WALLPAPER_ENGINE_RENDER_BATCH/.test(rendererText) || !/items\.slice\(0, wallpaperEngineRenderLimit\)/.test(rendererText)) {
    fail('Wallpaper Engine renderer must restore the original background, pause when hidden, lazy-load previews, and batch very large libraries');
  }
  if (!/img\[data-animated="1"\]/.test(rendererText) || !/event\.target !== card/.test(rendererText) || !/scheduleWallpaperEngineLibraryRender/.test(rendererText)) {
    fail('Wallpaper Engine modal must unload animated previews, keep keyboard actions scoped, and debounce search rendering');
  }
  if (!/wallpaper-engine-active/.test(fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '02-accent-background-controls.js'), 'utf8'))) {
    fail('The preserved original background video must stay paused while the Wallpaper Engine layer is active');
  }
  if (!/mineradio-wallpaper-engine-list/.test(mainText) || !/mineradio-wallpaper-engine-project-details/.test(mainText) || !/mineradio-wallpaper-engine-open-project-details/.test(mainText) || !/mineradio-wallpaper-engine-start-scene/.test(mainText) || !/mineradio-wallpaper-engine-capture-result/.test(mainText) || !/mineradio-wallpaper-engine-glass-surface/.test(mainText) || !/mineradio-wallpaper-engine-prepare-glass-capture/.test(mainText) || !/installProtocol\(protocol\)/.test(mainText) || !/listWallpaperEngineProjects/.test(preloadText) || !/getWallpaperEngineProjectDetails/.test(preloadText) || !/openWallpaperEngineProjectDetails/.test(preloadText) || !/startWallpaperEngineScene/.test(preloadText) || !/reportWallpaperEngineCaptureResult/.test(preloadText) || !/prepareWallpaperEngineGlassCapture/.test(preloadText) || !/updateWallpaperEngineGlassSurface/.test(preloadText) || !/stopWallpaperEngineScene/.test(preloadText) || !/isTrustedWallpaperEngineIpc/.test(mainText) || !/function isTrustedMainDocumentUrl/.test(mainText) || !/pathname === '\/' \|\| pathname === '\/index\.html'/.test(mainText)) {
    fail('Wallpaper Engine scan/import IPC and restricted media protocol are not fully wired');
  }
  if (!/wallpaperEnginePlayWasInterrupted/.test(rendererText) || !/WALLPAPER_ENGINE_SWITCH_FADE_MS/.test(rendererText)) {
    fail('Wallpaper Engine playback interruption and wallpaper-to-wallpaper crossfade guards are missing');
  }
  if (!/projectType === 'video'/.test(libraryText) || !/validateScenePackage/.test(libraryText) || !/PKGV\\d\{4\}/.test(libraryText) || !/addManualProjectFile/.test(libraryText) || !/enginePlayable/.test(libraryText) || !/resolveProjectFile/.test(libraryText) || !/fs\.promises\.realpath/.test(libraryText) || !/X-Content-Type-Options/.test(libraryText) || !/mediaToken/.test(libraryText) || !/wallpaperEngineMediaToken/.test(rendererText)) {
    fail('Wallpaper Engine library must strictly gate project types and contain real paths');
  }
  if (/spawn\s*\(|shell\.open|wallpaper64/i.test(libraryText)) {
    fail('Wallpaper Engine import must not execute imported applications or modify the Windows wallpaper');
  }
  if (!/Get-AuthenticodeSignature/.test(runtimeText) || !/Skutta Software/.test(runtimeText) || !/engineProcessProbe/.test(runtimeText) || /onSourceMiss/.test(runtimeText) || !/projectFile/.test(runtimeText) || !/'openWallpaper'/.test(runtimeText) || !/'-playInWindow'/.test(runtimeText) || !/'closeWallpaper'/.test(runtimeText) || !/'-location'/.test(runtimeText) || !/shell:\s*false/.test(runtimeText) || !/desktopCapturer/.test(runtimeText) || !/controlBrokerScript/.test(runtimeText) || !/GetShellWindow/.test(runtimeText) || !/GetIntegrityRid/.test(runtimeText) || !/PROC_THREAD_ATTRIBUTE_PARENT_PROCESS/.test(runtimeText) || !/CreateProcessW/.test(runtimeText) || !/hostElevationProbe/.test(runtimeText) || !/MINERADIO_WE_CONTROL_TARGET/.test(runtimeText) || !/MINERADIO_WE_CONTROL_COMMAND_LINE/.test(runtimeText) || !/hostElevationProbe:\s*systemMemory\.probeProcessElevation/.test(mainText) || /WALLPAPER_ENGINE_HOST_ELEVATED/.test(mainText)) {
    fail('Wallpaper Engine Scene runtime must use the signed official engine, route elevated hosts through the Explorer medium-integrity broker, and retain the captured window source');
  }
  const dwmSurfaceBlock = runtimeText.slice(
    runtimeText.indexOf('function nativeDwmThumbnailSurfaceScript'),
    runtimeText.indexOf('function quoteWindowsArgument')
  );
  const captureReadyBlock = runtimeText.slice(
    runtimeText.indexOf('async confirmCaptureReady'),
    runtimeText.indexOf('_openControlArgs')
  );
  if (!/nativeWindowControlScript/.test(runtimeText) || !/GetWindowThreadProcessId/.test(runtimeText)
    || !/Capture window title mismatch/.test(runtimeText) || !/Window process mismatch/.test(runtimeText)
    || !/SetThreadDpiAwarenessContext/.test(runtimeText) || !/new IntPtr\(-4\)/.test(runtimeText)
    || !/const int tolerance = 2/.test(runtimeText)
    || !/bool aligned = !\(Math\.Abs\(sourceRect\.Left - hostRect\.Left\)/.test(runtimeText)
    || !/_relaunchSessionWindow/.test(runtimeText) || !/correctedWidth/.test(runtimeText)
    || !/embedding\.aligned !== true/.test(runtimeText) || !/PostMessageW\(hWnd, WM_CLOSE/.test(runtimeText)
    || !/closeWait\.ElapsedMilliseconds < 1800/.test(runtimeText)
    || !/closeResult\.closed = !IsWindow\(hWnd\)/.test(runtimeText)
    || !/nativeDwmThumbnailSurfaceScript/.test(runtimeText)
    || !/DwmRegisterThumbnail/.test(dwmSurfaceBlock)
    || !/DwmUpdateThumbnailProperties/.test(dwmSurfaceBlock)
    || !/SetWindowPos\(Handle, surfaceInsertAfter/.test(dwmSurfaceBlock)
    || !/hostRoot != hostWindow && hostRoot != iconHost/.test(dwmSurfaceBlock)
    || !/SetWindowPos\(sourceWindow, Handle/.test(dwmSurfaceBlock)
    || !/_startSessionDwmSurface/.test(captureReadyBlock)
    || /parkActiveWindow|_startSessionPointerRelay/.test(captureReadyBlock)
    || !/captureMode:\s*'dwm-thumbnail'/.test(mainText + runtimeText)
    || !/if \(status && status\.active === true && status\.captureMode === 'dwm-thumbnail'\) return/.test(mainText)
    || /\bSetParent\b|SetWindowLong|SW_HIDE|DwmSetWindowAttribute/.test(dwmSurfaceBlock)) {
    fail('Wallpaper Engine source must stay pixel-aligned behind a validated DWM live surface without capture parking or synthetic input');
  }
  if (!/analyzeSceneProperties/.test(libraryText) || !/getProjectDetails/.test(libraryText)
    || !/muteProperties:\s*propertyAnalysis\.muteProperties/.test(libraryText)
    || !/'applyProperties'/.test(runtimeText)
    || !/RAW~\(\$\{JSON\.stringify\(properties\)\}\)~END/.test(runtimeText)
    || !/windowsVerbatimArguments:\s*!!verbatimArgs/.test(runtimeText)
    || !/cwd:\s*path\.dirname\(executable\)/.test(runtimeText)
    || /['"]mute['"]/.test(runtimeText)
    || !/openWallpaperEngineProjectDetails/.test(rendererText)
    || !/wallpaper-engine-details-drawer/.test(htmlText)
    || !/audioMuted/.test(runtimeText)) {
    fail('Wallpaper Engine Scene audio must stay location-scoped and silent without a global Wallpaper Engine mute');
  }
  const rendererDwmStartBlock = rendererText.slice(
    rendererText.indexOf("if (result.captureMode === 'dwm-thumbnail')"),
    rendererText.indexOf('var stream = takeWallpaperEnginePreparedCaptureStream')
  );
  if (!/stopWallpaperEngineCaptureStream\(false\)/.test(rendererDwmStartBlock)
    || !/wallpaperEngineCaptureMode = 'dwm-thumbnail'/.test(rendererDwmStartBlock)
    || !/wallpaperEngineLayerReady\('dwm'/.test(rendererDwmStartBlock)
    || /srcObject\s*=/.test(rendererDwmStartBlock)
    || /wallpaper-engine-cursor-proxy/.test(htmlText + cssText + rendererText)
    || /\b(?:GetCursorPos|ScreenToClient|SetCursorPos|SendInput|ShowCursor|SetSystemCursor|SetWindowsHookEx)\b/.test(dwmSurfaceBlock + mainText + preloadText)) {
    fail('Wallpaper Engine DWM mode must avoid Chromium capture and preserve the one real Windows cursor');
  }
  if (!/DwmRegisterThumbnail/.test(dwmSurfaceBlock)
    || /DwmQueryThumbnailSourceSize/.test(dwmSurfaceBlock)
    || /GlassRefractionSurface/.test(dwmSurfaceBlock)
    || /Mineradio WE Glass Refraction/.test(dwmSurfaceBlock)
    || /DWM_TNP_RECTSOURCE/.test(dwmSurfaceBlock)
    || /command\.StartsWith\("G\|"/.test(dwmSurfaceBlock)
    || /WS_EX_TRANSPARENT|WS_EX_NOACTIVATE/.test(dwmSurfaceBlock)
    || /const double zoom|1\.105/.test(dwmSurfaceBlock)
    || dwmSurfaceBlock.indexOf('taskbar.DeleteTab(Handle)') < dwmSurfaceBlock.indexOf('void ActivateThumbnail()')
    || !/session\.dwmGlassSurfaceWindowId = session\.dwmSurfaceWindowId/.test(runtimeText)
    || !/single-dwm-svg-sampler/.test(runtimeText)
    || !/updateGlassSurface/.test(runtimeText)
    || !/getDwmGlassCaptureSource/.test(runtimeText)
    || !/source\.name \|\| ''\) === 'Mineradio WE DWM Surface'/.test(runtimeText)
    || !/mineradio-wallpaper-engine-glass-surface/.test(mainText)
    || !/kind: 'dwm-glass'/.test(mainText)
    || !/prepareWallpaperEngineRendererGlassCapture/.test(mainText)
    || !/__mineradioPrepareWallpaperEngineGlassCapture/.test(rendererText)
    || !/trustedCursorFreeSurface: true/.test(rendererText)
    || !/wallpaper-engine-glass-sampler/.test(htmlText + cssText)
    || !/wallpaper-engine-glass-sampler-ready/.test(rendererText + cssText)
    || !/waitForWallpaperEngineGlassSamplerPixelChange/.test(rendererText)
    || !/meanAbsoluteRgbFromPriming/.test(rendererText)
    || !/syncWallpaperEngineControlGlassSurface/.test(controlGlassText)
    || !/getBoundingClientRect\(\)/.test(controlGlassText)
    || !/animateWallpaperEngineControlGlassSurface/.test(controlGlassText)
    || !/kind === 'dwm'/.test(rendererText)) {
    fail('Wallpaper Engine DWM mode must feed a cursor-free 1:1 sampler through the existing SVG control-console glass');
  }
  if (!/scheduleWallpaperEngineHostBoundsRestart/.test(mainText) || !/suspendWallpaperEngineForHiddenHost/.test(mainText) || !/resumeWallpaperEngineForVisibleHost/.test(mainText) || !/win\.on\('move'[\s\S]{0,220}scheduleWallpaperEngineHostBoundsRestart\(win, 'move'\)/.test(mainText) || !/win\.on\('resize'[\s\S]{0,220}scheduleWallpaperEngineHostBoundsRestart\(win, 'resize'\)/.test(mainText) || !/scheduleWallpaperEngineHostBoundsRestart\([\s\S]{0,180}display-metrics-changed/.test(mainText) || !/phase:\s*'prepare'/.test(mainText) || !/phase:\s*'restart'/.test(mainText) || !/mineradio-wallpaper-engine-host-bounds-changed/.test(mainText) || !/onWallpaperEngineHostBoundsChanged/.test(preloadText) || !/handleWallpaperEngineHostBoundsChange/.test(rendererText) || !/wallpaperEngineHostBoundsPreparing/.test(rendererText) || !/restartWallpaperEngineAfterHostBoundsChange/.test(rendererText) || !/status\.captureMode === 'dwm-thumbnail'\) return/.test(mainText) || !/followTimer\.Interval = 60/.test(dwmSurfaceBlock) || !/FollowHost\(\)/.test(dwmSurfaceBlock)) {
    fail('Wallpaper Engine DWM surfaces must follow move/resize in place while the legacy capture fallback remains restart-safe');
  }
  const wallpaperHostRestartBlock = rendererText.slice(
    rendererText.indexOf('function restartWallpaperEngineAfterHostBoundsChange'),
    rendererText.indexOf('function handleWallpaperEngineHostBoundsChange')
  );
  const wallpaperPageHideHandler = rendererText.match(/window\.addEventListener\('pagehide', function \(\) \{([\s\S]*?)\n\s*\}\);/);
  if (!/function wallpaperEngineUsesDesktopHostLifecycle/.test(rendererText) || !/function wallpaperEngineNativeHostUnavailable/.test(rendererText) || !/document\.hidden && !\(payload && payload\.forceVisibleHost === true\)/.test(rendererText) || !/setMainWindowBackgroundThrottling\(win, false\)/.test(mainText) || !/matched && confirmed && wallpaperEngineHostVisibilityResumePending/.test(mainText) || !/wallpaperEngineHostRecoveryInFlight/.test(rendererText) || !/if \(wallpaperEngineUsesDesktopHostLifecycle\(\)\) \{[\s\S]{0,260}!document\.hidden[\s\S]{0,180}restartWallpaperEngineAfterHostBoundsChange\(\)[\s\S]{0,100}return;/.test(rendererText) || wallpaperHostRestartBlock.includes('stopWallpaperEngineNativeSession()') || !wallpaperPageHideHandler || wallpaperPageHideHandler[1].includes('stopWallpaperEngineNativeSession()')) {
    fail('Wallpaper Engine desktop Scene visibility must be owned by the main-process prepare/restart lifecycle without renderer stop-all races');
  }
  const wallpaperBoundsPrepareBlock = mainText.slice(
    mainText.indexOf('async function prepareWallpaperEngineRendererHostBoundsFrame'),
    mainText.indexOf('function stopWallpaperEngineRuntimeForRenderer')
  );
  const wallpaperBoundsScheduleBlock = mainText.slice(
    mainText.indexOf('function scheduleWallpaperEngineHostBoundsRestart'),
    mainText.indexOf('function configureLocalAppPermissions')
  );
  const wallpaperCaptureResultBlock = mainText.slice(
    mainText.indexOf("ipcMain.handle('mineradio-wallpaper-engine-capture-result'"),
    mainText.indexOf("ipcMain.handle('mineradio-wallpaper-engine-stop-scene'")
  );
  const boundsTimerIndex = wallpaperBoundsScheduleBlock.indexOf('wallpaperEngineHostBoundsRestartTimer = setTimeout');
  const boundsPrepareIndex = wallpaperBoundsScheduleBlock.indexOf('prepareWallpaperEngineRendererHostBoundsFrame');
  if (!wallpaperBoundsPrepareBlock.includes('await mainWindow.webContents.executeJavaScript(script, true)')
    || wallpaperBoundsPrepareBlock.includes('Promise.race(')
    || /WALLPAPER_ENGINE_BOUNDS_FREEZE_TIMEOUT_MS/.test(mainText)) {
    fail('Wallpaper Engine bounds freeze must await its renderer result without an uncancellable timeout race');
  }
  if (!/if \(wallpaperEngineHostBoundsRestartTimer\) clearTimeout\(wallpaperEngineHostBoundsRestartTimer\)/.test(wallpaperBoundsScheduleBlock)
    || boundsTimerIndex < 0
    || boundsPrepareIndex <= boundsTimerIndex
    || !/job\.started = true/.test(wallpaperBoundsScheduleBlock)
    || !/\}, 260\);/.test(wallpaperBoundsScheduleBlock)) {
    fail('Wallpaper Engine host movement must use a true resettable settled debounce before freezing or stopping the live source');
  }
  if (!/let wallpaperEngineHostBoundsFollowupReason = ''/.test(mainText)
    || !/job && job\.started === true[\s\S]{0,320}wallpaperEngineHostBoundsFollowupReason =/.test(wallpaperBoundsScheduleBlock)
    || !/wallpaperEngineHostBoundsFollowupReason[\s\S]{0,320}scheduleWallpaperEngineHostBoundsRestart\(mainWindow, followupReason\)/.test(wallpaperCaptureResultBlock)) {
    fail('Wallpaper Engine bounds changes arriving during a restart must be replayed after the capture acknowledgement');
  }
  if (!/if \(expectedSessionId && !wallpaperEngineCaptureGrant\) return false/.test(mainText)
    || !/confirmed = await wallpaperEngineRuntime\.confirmCaptureReady/.test(wallpaperCaptureResultBlock)
    || !/captureReady:\s*confirmed/.test(wallpaperCaptureResultBlock)
    || !/stale:\s*true,[\s\S]{0,160}frozen:\s*!!\(prepared && prepared\.frozen === true\)/.test(wallpaperBoundsScheduleBlock)
    || !/bounds-stale-recovery/.test(wallpaperBoundsScheduleBlock)
    || !/const ownsCurrentJob = wallpaperEngineHostBoundsStopPromise === job/.test(wallpaperBoundsScheduleBlock)
    || !/const recoveryOnly = !ownsCurrentJob \|\| !operationCurrent/.test(wallpaperBoundsScheduleBlock)) {
    fail('Wallpaper Engine late capture acknowledgements and stale frozen bounds jobs must recover without reviving an old session');
  }
  if (!/win\.on\('enter-full-screen'[\s\S]{0,420}scheduleWallpaperEngineHostBoundsRestart\(win, 'enter-full-screen'\)/.test(mainText)
    || !/win\.on\('leave-full-screen'[\s\S]{0,420}scheduleWallpaperEngineHostBoundsRestart\(win, 'leave-full-screen'\)/.test(mainText)
    || !/win\.on\('enter-html-full-screen'[\s\S]{0,420}scheduleWallpaperEngineHostBoundsRestart\(win, 'enter-html-full-screen'\)/.test(mainText)
    || !/win\.on\('leave-html-full-screen'[\s\S]{0,420}scheduleWallpaperEngineHostBoundsRestart\(win, 'leave-html-full-screen'\)/.test(mainText)
    || !/forceVisibleHost:\s*true/.test(wallpaperBoundsScheduleBlock)) {
    fail('Wallpaper Engine native and HTML fullscreen transitions must explicitly re-arm the authoritative bounds restart');
  }
  const wallpaperFreezeFrameBlock = rendererText.slice(
    rendererText.indexOf('function captureWallpaperEngineFreezeFrame'),
    rendererText.indexOf('function clearWallpaperEngineFreezeFrame')
  );
  if (!/var freezeScale = Math\.min\(1, 3840 \/ Math\.max\(1, video\.videoWidth\), 2160 \/ Math\.max\(1, video\.videoHeight\)\)/.test(wallpaperFreezeFrameBlock)
    || !/video\.videoWidth \* freezeScale/.test(wallpaperFreezeFrameBlock)
    || !/video\.videoHeight \* freezeScale/.test(wallpaperFreezeFrameBlock)) {
    fail('Wallpaper Engine freeze frames must use one uniform scale so ultrawide sources keep their aspect ratio');
  }
  if (!wallpaperPageHideHandler
    || !/typeof wallpaperEngineHostBoundsUnsubscribe === 'function'[\s\S]{0,180}wallpaperEngineHostBoundsUnsubscribe\(\)[\s\S]{0,180}wallpaperEngineHostBoundsUnsubscribe = null/.test(wallpaperPageHideHandler[1])) {
    fail('Wallpaper Engine host-bounds IPC listeners must be unsubscribed during page teardown');
  }
  if (!/if \(wallpaperEngineSelection\.mediaType === 'video'\)[\s\S]{0,600}if \(document\.hidden\)[\s\S]{0,180}video\.pause\(\)[\s\S]{0,360}requestWallpaperEngineVideoPlayback/.test(rendererText) || !/var animatedImage[\s\S]{0,360}if \(document\.hidden\)[\s\S]{0,180}clearWallpaperEngineLayerMedia\(0\)[\s\S]{0,180}applyWallpaperEngineBackground\(item, true\)/.test(rendererText)) {
    fail('Wallpaper Engine media videos and animated previews must retain their hidden pause/unload and visible resume behavior');
  }
  if (!/MINERADIO_NATIVE_TEMP_DIR/.test(systemMemoryText) || !/setNativeTempPath/.test(systemMemoryText) || !/TEMP:\s*ensureNativeTempPath\(\)/.test(systemMemoryText) || !/NATIVE_HELPER_TEMP_PATH/.test(mainText) || !/nativeTempPath:\s*NATIVE_HELPER_TEMP_PATH/.test(mainText) || !/TEMP:\s*this\.nativeTempPath/.test(runtimeText)) {
    fail('PowerShell Add-Type helpers must use the app-owned stable native temp directory');
  }
  if (/MINERADIO_WE_QA_CLEANUP/.test(mainText) || /taskkill\.exe[\s\S]{0,120}wallpaper(?:32|64)/i.test(mainText) || /x:\s*-16000[\s\S]{0,80}y:\s*-16000/.test(mainText) || !/width:\s*Math\.max\(640,[\s\S]{0,220}physicalBounds\.width[\s\S]{0,220}x:\s*physicalBounds\.x,[\s\S]{0,80}y:\s*physicalBounds\.y/.test(mainText)) {
    fail('Wallpaper Engine release code must launch at the host pixel origin without QA cleanup or fixed offscreen coordinates');
  }
  if (!/capturePrepared:\s*true,\s*captureMode:\s*'dwm-thumbnail'/.test(mainText)
    || !/reportWallpaperEngineCaptureResult\(sessionId, true\)/.test(rendererDwmStartBlock)
    || !/dwmAcknowledgement\.captureReady !== true/.test(rendererDwmStartBlock)
    || !/confirmCaptureReady/.test(mainText + runtimeText)
    || !/dwmSurfaceReady !== true/.test(captureReadyBlock)
    || !/activateDwmSurface/.test(mainText + runtimeText)
    || !/activateWallpaperEngineDwmSurface/.test(preloadText + rendererText)) {
    fail('Wallpaper Engine Scene projects must prime the cursor-free sampler before activating the live DWM thumbnail');
  }
  const permissionAllowlist = mainText.match(/const LOCAL_APP_PERMISSION_ALLOWLIST\s*=\s*new Set\(\[([^\]]*)\]\)/);
  if (!/\^window:\\d\+:\\d\+\$/.test(runtimeText) || !/wallpaperEngineCaptureGrant/.test(mainText)
    || !/wallpaperEngineCaptureOperation/.test(mainText) || !/refreshActiveSource/.test(mainText)
    || !/sourceWindowAligned !== true/.test(mainText) || !/stopWallpaperEngineRuntimeForRenderer/.test(mainText)
    || !/payload\.all === true/.test(mainText) || !permissionAllowlist || /['"]media['"]/.test(permissionAllowlist[1])) {
    fail('Wallpaper Engine DWM readiness must stay bound to the exact source/session without broad media permission');
  }
  if (!/appQuitCleanupPromise/.test(mainText) || !/event\.preventDefault\(\)/.test(mainText) || !/Promise\.race\(\[runtimeCleanup, timeoutCleanup\]\)/.test(mainText)) {
    fail('Wallpaper Engine shutdown must wait briefly for the Mineradio-owned source window to close');
  }
  if (!/if \(stopAll\) \{[\s\S]{0,220}wallpaperEngineCaptureOperation \+= 1;[\s\S]{0,220}clearWallpaperEngineCaptureGrant\(\);[\s\S]{0,220}\}\s*const result = await wallpaperEngineRuntime\.stop/.test(mainText)) {
    fail('Wallpaper Engine global stop must invalidate capture operations before awaiting source shutdown');
  }
  if (!/function wallpaperEngineNativeStartIsCurrent[\s\S]{0,320}!wallpaperEngineNativeHostUnavailable\(\)/.test(rendererText) || !/cancelWallpaperEngineSwitchTimer\(\);[\s\S]{0,180}\+\+wallpaperEngineLayerToken;[\s\S]{0,180}stopWallpaperEngineNativeSession\(\)/.test(rendererText) || !/matchesPending/.test(runtimeText) || !/matchesActive/.test(runtimeText)) {
    fail('Wallpaper Engine hidden/switch races must invalidate delayed starts and stop both active and pending sessions');
  }
  const fixtureResult = spawnSync(process.execPath, [path.join(appRoot, 'scripts', 'check-wallpaper-engine-library.js')], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (fixtureResult.status !== 0) {
    process.stdout.write(fixtureResult.stdout || '');
    process.stderr.write(fixtureResult.stderr || '');
    fail('Wallpaper Engine fixture/path/range checks failed');
  }
  const runtimeFixtureResult = spawnSync(process.execPath, [path.join(appRoot, 'scripts', 'check-wallpaper-engine-runtime.js')], {
    cwd: appRoot,
    encoding: 'utf8'
  });
  if (runtimeFixtureResult.status !== 0) {
    process.stdout.write(runtimeFixtureResult.stdout || '');
    process.stderr.write(runtimeFixtureResult.stderr || '');
    fail('Wallpaper Engine signed runtime/session/capture checks failed');
  }
  console.log('[OK] Independent layer, native Scene runtime, opaque IPC IDs, path containment, safe previews, Range streaming, and original-background restore are guarded.');
}

function checkDesktopWallpaperModeGuard() {
  logStep('Desktop wallpaper mode guard');
  const fullDesktopRuntimePath = path.join(appRoot, 'desktop', 'full-desktop-mode-runtime.js');
  const iconShapeRuntimePath = path.join(appRoot, 'desktop', 'desktop-icon-shape-runtime.js');
  const nativeIconLayerRuntimePath = path.join(appRoot, 'desktop', 'desktop-native-icon-layer-runtime.js');
  const wallpaperEngineRuntimePath = path.join(appRoot, 'desktop', 'wallpaper-engine-runtime.js');
  const mainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
  const preloadText = fs.readFileSync(path.join(appRoot, 'desktop', 'preload.js'), 'utf8');
  const fullDesktopRuntimeText = fs.readFileSync(fullDesktopRuntimePath, 'utf8');
  const iconShapeRuntimeText = fs.readFileSync(iconShapeRuntimePath, 'utf8');
  const nativeIconLayerRuntimeText = fs.readFileSync(nativeIconLayerRuntimePath, 'utf8');
  const wallpaperEngineRuntimeText = fs.readFileSync(wallpaperEngineRuntimePath, 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  const htmlText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const wallpaperToggleTag = htmlText.match(/<[^>]*\bid=["']t-wallpaperMode["'][^>]*>/i);
  const defaultsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '04-fx-defaults.js'), 'utf8');
  const layoutText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '06-fx-runtime-layout.js'), 'utf8');
  const persistenceText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '04-visual-settings-persistence.js'), 'utf8');
  const panelText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '05-fx-panel-performance.js'), 'utf8');
  const bindingText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '07-bindings-shelf-immersive.js'), 'utf8');
  const archiveText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '00-preset-archive-data.js'), 'utf8');
  const shellText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '10-shell', '04-desktop-overlay-fullscreen.js'), 'utf8');
  const splashText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '10-shell', '03-splash.js'), 'utf8');
  const bottomControlsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '01-scene', '04-bottom-controls-cursor.js'), 'utf8');
  const isolatedDesktopText = [
    fullDesktopRuntimeText,
    iconShapeRuntimeText,
    nativeIconLayerRuntimeText,
    shellText,
  ].join('\n');
  const createWallpaperWindowStart = mainText.indexOf('async function createWallpaperWindow');
  const closeWallpaperWindowStart = mainText.indexOf('async function closeWallpaperWindow');
  const createWallpaperWindowBlock = createWallpaperWindowStart >= 0
    && closeWallpaperWindowStart > createWallpaperWindowStart
    ? mainText.slice(createWallpaperWindowStart, closeWallpaperWindowStart)
    : '';

  const removedLegacyCanvasFiles = [
    path.join(appRoot, 'desktop', 'wallpaper-preload.js'),
    path.join(appRoot, 'public', 'wallpaper.html'),
  ];
  for (const file of removedLegacyCanvasFiles) {
    if (fs.existsSync(file)) {
      fail(`removed legacy Canvas wallpaper asset must stay out of the app and package: ${rel(file)}`);
    }
  }
  const packagedFiles = packageJson.build && Array.isArray(packageJson.build.files)
    ? packageJson.build.files
    : [];
  if (!packagedFiles.includes('!desktop/wallpaper-preload.js')
    || !packagedFiles.includes('!public/wallpaper.html')) {
    fail('electron-builder must explicitly exclude the removed legacy Canvas wallpaper assets');
  }

  const forbiddenLegacyBackdropMarkers = [
    'DesktopWallpaperRuntime',
    'desktopWallpaperRuntime',
    'desktopWallpaperBackdrop',
    'queueDesktopWallpaperBackdrop',
    'disposeDesktopWallpaperBackdrop',
    'syncDesktopWallpaperBackdropHealth',
    'wallpaper-mode-runtime',
    'wallpaper-preload.js',
    'wallpaper.html',
  ];
  for (const marker of forbiddenLegacyBackdropMarkers) {
    if (mainText.includes(marker)) {
      fail(`full desktop mode must not load or revive the removed legacy WorkerW canvas backdrop: ${marker}`);
    }
  }
  if ((mainText.match(/new WallpaperEngineRuntime/g) || []).length !== 1
    || !/single-dwm-svg-sampler/.test(wallpaperEngineRuntimeText)
    || /Mineradio WE Glass Refraction/.test(wallpaperEngineRuntimeText)
    || !/captureMode:\s*'dwm-thumbnail'/.test(mainText + wallpaperEngineRuntimeText)
    || !/new FullDesktopModeRuntime/.test(mainText)) {
    fail('full desktop mode must use one existing Wallpaper Engine DWM base, or reveal the normal system desktop when no WE scene is active');
  }
  if (!createWallpaperWindowBlock
    || !/enableFullDesktopMode\(mainWindow/.test(createWallpaperWindowBlock)
    || /DesktopWallpaperRuntime|desktopWallpaperRuntime|wallpaper\.html|wallpaper-preload\.js|WALLPAPER_BACKDROP/.test(createWallpaperWindowBlock)) {
    fail('entering full desktop mode must expose the complete Mineradio HUD without creating or requiring a legacy fallback wallpaper');
  }
  if (!/mineradio-wallpaper-set-enabled/.test(mainText)
    || !/mineradio-wallpaper-get-status/.test(mainText)
    || !/isTrustedMainWindowIpc/.test(mainText)
    || !/getWallpaperModeStatus/.test(preloadText)
    || !/onWallpaperModeState/.test(preloadText)) {
    fail('full desktop mode must use the trusted, status-reporting main-process lifecycle');
  }
  if (!/new FullDesktopModeRuntime/.test(mainText)
    || !/mineradio-full-desktop-icon-shields/.test(mainText + preloadText)
    || !/attachDesktopWindowForCoexistence/.test(fullDesktopRuntimeText)
    || !/SHELLDLL_DefView/.test(fullDesktopRuntimeText + iconShapeRuntimeText)
    || !/SysListView32/.test(fullDesktopRuntimeText + iconShapeRuntimeText)
    || !/setShape/.test(fullDesktopRuntimeText + iconShapeRuntimeText)
    || !/LVM_GETITEMRECT/.test(iconShapeRuntimeText)
    || !/visibleParts = new int\[\] \{ 1, 2 \}/.test(iconShapeRuntimeText)
    || !/SetWinEventHook/.test(nativeIconLayerRuntimeText)
    || !/layered-color-key/.test(nativeIconLayerRuntimeText)
    || !/KeepMainAtBottom\(\)/.test(nativeIconLayerRuntimeText)
    || !/SnapshotOriginalListViewVisibility\(\)/.test(nativeIconLayerRuntimeText)
    || !/RestoreOriginalListViewVisibility\(\)/.test(nativeIconLayerRuntimeText)
    || !/SnapshotOriginalListViewTransparency\(\)/.test(nativeIconLayerRuntimeText)
    || !/RestoreCurrentListViewTransparency\(\)/.test(nativeIconLayerRuntimeText)
    || !/SnapshotOriginalListViewBackground\(\)/.test(nativeIconLayerRuntimeText)
    || !/ApplyListViewBackgroundKey\(\)/.test(nativeIconLayerRuntimeText)
    || !/RestoreCurrentListViewBackground\(\)/.test(nativeIconLayerRuntimeText)
    || !/SendMessageTimeout/.test(nativeIconLayerRuntimeText)
    || !/SMTO_ABORTIFHUNG/.test(nativeIconLayerRuntimeText)
    || !/SetLayeredWindowAttributes\(_listView, DESKTOP_LAYER_COLOR_KEY, 255, LWA_COLORKEY\)/.test(nativeIconLayerRuntimeText)
    || !/nativeBackgroundKeyApplied/.test(nativeIconLayerRuntimeText + fullDesktopRuntimeText)
    || !/conhost\.exe/.test(nativeIconLayerRuntimeText)
    || !/--headless/.test(nativeIconLayerRuntimeText)
    || !/-NonInteractive/.test(nativeIconLayerRuntimeText)
    || !/EmitTerminal\(restored, terminalCode\)/.test(nativeIconLayerRuntimeText)
    || /SetWindowRgn\(_listView/.test(nativeIconLayerRuntimeText)
    || /EnableWindow/.test(nativeIconLayerRuntimeText)
    || !/paddingDip:\s*0/.test(fullDesktopRuntimeText)
    || !/rounding:\s*'inward'/.test(fullDesktopRuntimeText)
    || !/setHasShadow/.test(fullDesktopRuntimeText)
    || !/updateDwmDesktopIconLayering/.test(mainText)
    || !/desktop-icon-watcher-restarted/.test(fullDesktopRuntimeText)
    || !/phase = 'recovering-icon-layer'/.test(fullDesktopRuntimeText)
    || !/interactiveBindingHealthy\(\)/.test(fullDesktopRuntimeText)
    || !/reconcileInteractiveInternal\(/.test(fullDesktopRuntimeText)
    || !/embeddedDesktop\.enabled !== true[\s\S]{0,180}mainWindow\.moveTop\(\)[\s\S]{0,180}mainWindow\.focus\(\)/.test(mainText)
    || !/embeddedDesktop\.enabled === true && embeddedDesktop\.interactive === true[\s\S]{0,180}ensureIconLayerOrder\(\)/.test(mainText)
    || (mainText.match(/fullDesktopModeHostVisibilityTransitionDepth <= 0\) (?:suspend|resume)WallpaperEngineFor/g) || []).length < 2
    || !/consecutiveFollowFailures >= 8/.test(wallpaperEngineRuntimeText)
    || !/session\.dwmSurfaceDesktopIconLayering = enabled;[\s\S]{0,180}session\.dwmSurfaceReady !== true/.test(wallpaperEngineRuntimeText)
    || /GetCursorPos|SetCursorPos|SendInput|SetWindowsHookEx|WM_MOUSEMOVE|EnableWindow/.test(fullDesktopRuntimeText + iconShapeRuntimeText + nativeIconLayerRuntimeText)) {
    fail('full desktop coexistence must preserve the visible Mineradio HUD, survive native watcher/DWM retries, and remain below the exactly restored Explorer icon plane');
  }
  if (!/id="desktop-mode-control-dock"/.test(htmlText)
    || !/id="desktop-software-lock-toggle"/.test(htmlText)
    || !/id="desktop-icons-visible-toggle"/.test(htmlText)
    || !/desktop-wallpaper-mode\.desktop-wallpaper-interactive #desktop-mode-control-dock/.test(cssText)
    || !/desktop-mode-control-peek #desktop-mode-control-dock/.test(cssText)
    || !/setDesktopSoftwareLocked/.test(preloadText + shellText)
    || !/setDesktopIconsVisible/.test(preloadText + shellText)
    || !/requestDesktopKeyboardFocus/.test(preloadText + shellText)
    || !/updateDesktopPointerRoute/.test(preloadText + shellText)
    || !/mineradio-full-desktop-set-software-lock/.test(mainText)
    || !/mineradio-full-desktop-set-icons-visible/.test(mainText)
    || !/mineradio-full-desktop-request-keyboard-focus/.test(mainText)
    || !/mineradio-full-desktop-pointer-route/.test(mainText)
    || !/applyInteractivePointerRoute[\s\S]{0,900}softwareInteractionLocked === true[\s\S]{0,180}overDesktopControls !== true/.test(fullDesktopRuntimeText)
    || !/setIgnoreMouseEvents', null, true, \{ forward: true \}/.test(fullDesktopRuntimeText)
    || !/setSoftwareInteractionLocked\(/.test(fullDesktopRuntimeText)
    || !/requestKeyboardFocus\(/.test(fullDesktopRuntimeText)
    || !/safeCall\(webContents, 'focus'/.test(fullDesktopRuntimeText)
    || /requestKeyboardFocus[\s\S]{0,1800}safeCall\(win, '(?:focus|show|moveTop)'/.test(fullDesktopRuntimeText)
    || !/setDesktopIconsVisible/.test(fullDesktopRuntimeText)
    || !/overRevealEdge/.test(shellText)
    || !/document\.addEventListener\('pointerdown'[\s\S]{0,220}!desktopModeControlDockState\.open \|\| dock\.contains\(event\.target\)[\s\S]{0,220}setDesktopModeControlsOpen\(false\)/.test(shellText)
    || !/event && event\.isTrusted[\s\S]{0,100}requestDesktopKeyboardFocus\('pointerdown'\)/.test(shellText)
    || /pointState\.overHotspot\) setDesktopModeControlsOpen\(true\)/.test(shellText)
    || !/desktopUsesLayeredExplorerColorkey/.test(shellText)
    || !/revealDesktopWallpaperUiOnActivation/.test(shellText)
    || !/desktopWallpaperUiActivationState/.test(shellText)
    || !/ensureDesktopWallpaperFunctionalUi/.test(shellText)
    || !/releaseDesktopWallpaperStartupVisibilityGate/.test(shellText)
    || !/document\.documentElement\.classList\.remove\('startup-fast-skip-preload'\)/.test(splashText)
    || /releaseStartupFastSkipPreload\(\)[\s\S]{0,260}requestAnimationFrame\(function \(\) \{[\s\S]{0,180}startup-fast-skip-preload/.test(splashText)
    || !/setImmersiveMode\(false\)/.test(shellText)
    || !/holdBottomControlsVisible\(4200\)/.test(shellText)
    || !/desktopWallpaperKeepsPlayerConsoleVisible/.test(bottomControlsText)
    || !/desktop-wallpaper-hud-prime/.test(shellText)
    || !/desktop-wallpaper-hud-prime\.desktop-wallpaper-mode\.desktop-wallpaper-interactive #bottom-bar,[\s\S]{0,220}desktop-wallpaper-hud-prime\.desktop-wallpaper-mode\.desktop-wallpaper-interactive #empty-home[\s\S]{0,100}transition:\s*none\s*!important/.test(cssText)
    || !/desktop-wallpaper-mode\.desktop-wallpaper-interactive\.empty-home-active #empty-home[\s\S]{0,220}opacity:\s*1\s*!important/.test(cssText)
    || !/desktop-wallpaper-mode\.desktop-wallpaper-interactive:not\(\.empty-home-active\):not\(\.home-controls-locked\) #bottom-bar\.visible:not\(\.soft-hidden\)[\s\S]{0,240}opacity:\s*\.91\s*!important/.test(cssText)
    || !/desktop-wallpaper-mode #bottom-handle/.test(cssText)
    || !/--desktop-safe-bottom/.test(cssText)
    || /desktop-explorer-overlay/.test(shellText + cssText)
    || /desktop-explorer-layered-colorkey[^\{]*\{[\s\S]{0,700}(?:#custom-bg|#album-bg|#wallpaper-engine-layer)[\s\S]{0,300}(?:opacity:\s*0|visibility:\s*hidden)/.test(cssText)
    || !/clearDesktopIconRevealMask\(\)/.test(shellText)
    || !/document\.addEventListener\('mousemove'/.test(shellText)
    || !/setTimeout/.test(shellText)
    || !/globalShortcut\.register\('Escape'/.test(mainText)
    || !/requestFullDesktopEscapeExit\('escape-key'\)/.test(mainText)) {
    fail('full desktop mode must keep a recoverable software lock, click-outside closing, an auto-hidden desktop controller, and a direct Escape exit path');
  }
  if (!/wallpaperFps:\s*60/.test(defaultsText)
    || !/var DEVELOPMENT_LOCKED_FX = \{\}/.test(layoutText)
    || !/normalizeWallpaperFps/.test(persistenceText + panelText + bindingText + shellText)
    || (persistenceText.match(/wallpaperMode:\s*false/g) || []).length < 2
    || !/wallpaperFps:\s*normalizeWallpaperFps\(raw\.wallpaperFps\)/.test(persistenceText)
    || !/wallpaperFps:\s*normalizeWallpaperFps\(fx\.wallpaperFps\)/.test(persistenceText)
    || !/id="wallpaper-fps-seg"/.test(htmlText)
    || !['24', '30', '60'].every((value) => htmlText.includes(`data-wallpaper-fps="${value}"`))
    || !wallpaperToggleTag
    || /\bdev-locked\b/i.test(wallpaperToggleTag[0])
    || /id="fx-wallpaperopacity"[^>]*disabled/.test(htmlText)
    || !/toggleWallpaperModeFromUi/.test(bindingText)
    || !/onWallpaperModeState/.test(preloadText + shellText)
    || !/getWallpaperModeStatus/.test(preloadText + shellText)
    || !/frameRate:\s*normalizeWallpaperFps\(fx\.wallpaperFps\)/.test(shellText)
    || /wallpaperMode/.test(archiveText)) {
    fail('experimental wallpaper UI must persist only opacity/FPS, restart disabled, and follow main-process runtime authority');
  }
  const forbiddenCursorPaths = [
    'getCursorScreenPoint',
    'GetCursorPos',
    'SetCursorPos',
    'SendInput',
    'ShowCursor',
    'SetSystemCursor',
    'SetWindowsHookEx',
    'WM_MOUSEMOVE',
    'wallpaper-engine-cursor-proxy',
    'reportWallpaperEnginePointerActivity',
    'SPI_SETDESKWALLPAPER',
    'taskkill',
    'Stop-Process',
    'wallpaper64',
  ];
  for (const marker of forbiddenCursorPaths) {
    if (isolatedDesktopText.includes(marker)) fail(`full desktop mode must not take over or poll the Windows cursor: ${marker}`);
  }
  if (/\b(?:GetCursorPos|SetCursorPos|SendInput|ShowCursor|SetSystemCursor|SetWindowsHookEx|WM_MOUSEMOVE)\b/.test(isolatedDesktopText)) {
    fail('full desktop mode must preserve the real Windows cursor and must not synthesize pointer input');
  }
  const shutdownBlock = mainText.slice(mainText.indexOf("app.on('before-quit'"));
  if (!/fullDesktopModeRuntime\.dispose\('app-before-quit'\)/.test(shutdownBlock)
    || !/await disposeFullDesktopModeWithGuard\(\);[\s\S]{0,900}await wallpaperEngineRuntime\.dispose\(\)/.test(shutdownBlock)
    || !/WALLPAPER_ENGINE_WINDOW_CLOSE_FAILED/.test(shutdownBlock)
    || /DesktopWallpaper|desktopWallpaper|wallpaper-mode-runtime|wallpaper\.html/.test(shutdownBlock)) {
    fail('shutdown must detach the complete Mineradio HUD before disposing the single WE DWM chain, with no legacy backdrop cleanup path');
  }

  const coexistFixtureResult = spawnSync(process.execPath, [
    '--test',
    path.join(appRoot, 'tests', 'desktop-icon-shape-runtime.test.js'),
    path.join(appRoot, 'tests', 'full-desktop-mode-runtime.test.js'),
  ], { cwd: appRoot, encoding: 'utf8' });
  if (coexistFixtureResult.status !== 0) {
    process.stdout.write(coexistFixtureResult.stdout || '');
    process.stderr.write(coexistFixtureResult.stderr || '');
    fail('full desktop icon-coexistence fixture failed');
  }
  console.log('[OK] Legacy canvas backdrop is forbidden; the complete Mineradio HUD, recoverable software lock, desktop-icon switch, click-outside close, Escape exit, native watcher recovery, single WE DWM layering, and ordered cleanup are guarded.');
}

function checkDesktopWindowAdaptationGuard() {
  logStep('Desktop window adaptation guard');
  const mainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
  const shellText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '10-shell', '04-desktop-overlay-fullscreen.js'), 'utf8');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  if (!/function getAdaptiveWindowMinimumSize/.test(mainText) || !/function isPortraitDisplayArea/.test(mainText)) {
    fail('main window must adapt minimum size and windowed bounds for portrait displays');
  }
  if (!/screen\.getDisplayNearestPoint\(\{/.test(mainText)
    || !/windowFullscreenDisplayId = display \? display\.id : null/.test(mainText)
    || !/win\.setBounds\(\{[\s\S]{0,260}targetBounds\.height[\s\S]{0,180}win\.setFullScreen\(true\)/.test(mainText)) {
    fail('desktop fullscreen must target the display under the window center before entering fullscreen');
  }
  if (!/screen\.on\('display-metrics-changed', handleDisplayLayoutChanged\)/.test(mainText) || !/screen\.on\('display-removed', handleDisplayLayoutChanged\)/.test(mainText)) {
    fail('desktop window must react to display metric and monitor topology changes');
  }
  if (!/function animateDesktopWindowMinimize/.test(shellText) || !/function animateDesktopWindowRestore/.test(shellText) || !/desktopWindowReducedMotion/.test(shellText)) {
    fail('desktop shell must animate minimize/restore while respecting reduced motion');
  }
  if (!/desktop-window-minimizing/.test(cssText) || !/desktop-window-restoring/.test(cssText) || !/prefers-reduced-motion:\s*reduce/.test(cssText)) {
    fail('desktop shell CSS must include minimize/restore animation and reduced-motion fallback');
  }
  console.log('[OK] Desktop shell adapts portrait displays and window minimize/restore animation.');
}

function checkLyricLayoutRangeGuard() {
  logStep('Lyric layout range guard');
  const htmlText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const persistenceText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '04-visual-settings-persistence.js'), 'utf8');
  const archiveText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '00-preset-archive-data.js'), 'utf8');
  const bindingText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '07-bindings-shelf-immersive.js'), 'utf8');
  const stageText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '14-stage-lyrics-rendering.js'), 'utf8');
  const rangeChecks = [
    [htmlText, /id="fx-lyricx"[^>]+min="-4\.0"[^>]+max="4\.0"/, 'lyric x slider range'],
    [htmlText, /id="fx-lyricy"[^>]+min="-2\.4"[^>]+max="2\.7"/, 'lyric y slider range'],
    [htmlText, /id="fx-lyricz"[^>]+min="-3\.2"[^>]+max="3\.2"/, 'lyric z slider range'],
    [htmlText, /id="fx-lyrictiltx"[^>]+min="-84"[^>]+max="84"/, 'lyric tilt x slider range'],
    [htmlText, /id="fx-lyrictilty"[^>]+min="-84"[^>]+max="84"/, 'lyric tilt y slider range'],
    [persistenceText, /lyricOffsetX: layoutNumber\(raw\.lyricOffsetX, 0, -4\.0, 4\.0\)/, 'autosave read x range'],
    [persistenceText, /lyricTiltY: layoutNumber\(fx\.lyricTiltY, 0, -84, 84\)/, 'autosave write tilt y range'],
    [archiveText, /lyricOffsetZ: archiveNumber\(raw, 'lyricOffsetZ', fxDefaults\.lyricOffsetZ, -3\.2, 3\.2\)/, 'archive z range'],
    [bindingText, /lyricOffsetX'\) fx\.lyricOffsetX = clampRange\(fx\.lyricOffsetX, -4\.0, 4\.0\)/, 'runtime x clamp'],
    [bindingText, /lyricTiltX' \|\| pair\[1\] === 'lyricTiltY'\) fx\[pair\[1\]\] = Math\.round\(clampRange\(fx\[pair\[1\]\], -84, 84\)\)/, 'runtime tilt clamp'],
    [stageText, /var layoutY = clampRange\(Number\(fx\.lyricOffsetY\) \|\| 0, -2\.4, 2\.7\)/, 'render y range'],
    [stageText, /var layoutTiltY = clampRange\(Number\(fx\.lyricTiltY\) \|\| 0, -84, 84\)/, 'render tilt y range']
  ];
  for (const [text, pattern, label] of rangeChecks) {
    if (!pattern.test(text)) fail(`expanded lyric layout range missing: ${label}`);
  }
  console.log('[OK] Lyric layout position/depth/angle ranges stay expanded through UI, runtime, autosave, and archives.');
}

function checkPointerLockPermission() {
  logStep('Free camera pointer-lock guard');
  const mainPath = path.join(appRoot, 'desktop', 'main.js');
  const mainText = fs.readFileSync(mainPath, 'utf8');
  const freeCameraPath = path.join(appRoot, 'public', 'js', 'modules', '01-scene', '01-orbit-free-camera.js');
  const pointerPath = path.join(appRoot, 'public', 'js', 'modules', '02-visual', '00-pointer-cover-particles.js');
  const freeCameraText = fs.readFileSync(freeCameraPath, 'utf8');
  const pointerText = fs.readFileSync(pointerPath, 'utf8');
  if (!/LOCAL_APP_PERMISSION_ALLOWLIST[\s\S]{0,180}pointerLock/.test(mainText)) {
    fail('pointerLock permission is missing from desktop/main.js local app allowlist');
  }
  if (/rawInputBlocked/.test(freeCameraText) || /unadjustedMovement/.test(freeCameraText)) {
    fail('free camera pointer lock must use plain requestPointerLock; raw input requests can break local Electron lock acquisition');
  }
  if (!/var lockResult = el\.requestPointerLock\(\)/.test(freeCameraText)) {
    fail('free camera pointer lock must request plain pointer lock directly');
  }
  if (!/freeCameraPointerLockActive/.test(pointerText) || !/requestFreeCameraPointerLock\('mousemove'\)/.test(pointerText)) {
    fail('free camera mouse move path must keep requesting pointer lock before using mouse deltas');
  }
  console.log('[OK] Local app pointerLock permission and plain lock request are guarded.');
}

function checkProgressSeekDragGuard() {
  logStep('Progress drag seek guard');
  const progressPath = path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '04-progress-seek.js');
  const stagePath = path.join(appRoot, 'public', 'js', 'modules', '02-visual', '14-stage-lyrics-rendering.js');
  const mainLoopPath = path.join(appRoot, 'public', 'js', 'modules', '11-main-loop.js');
  const rendererQualityPath = path.join(appRoot, 'public', 'js', 'modules', '01-scene', '00-renderer-quality.js');
  const text = fs.readFileSync(progressPath, 'utf8');
  const stageText = fs.readFileSync(stagePath, 'utf8');
  const mainLoopText = fs.readFileSync(mainLoopPath, 'utf8');
  const rendererQualityText = fs.readFileSync(rendererQualityPath, 'utf8');
  if (!/previewProgressPointer/.test(text) || !/commitProgressSeek/.test(text) || !/waitForProgressSeekReady/.test(text)) {
    fail('progress drag must preview during drag and commit seek once on release');
  }
  if (!/isProgressDragPreviewActive/.test(text) || !/getProgressDragPreviewSeconds/.test(text)) {
    fail('progress drag must expose preview time for lyrics and beat visuals');
  }
  if (!/stageLyricProgressPreviewActive/.test(stageText) || !/stageLyricPlaybackSeconds/.test(stageText) || !/getProgressDragPreviewSeconds/.test(stageText)) {
    fail('stage lyrics must follow progress drag preview time without seeking audio on every pointermove');
  }
  const previewTickBody = (text.match(/function scheduleProgressLyricPreviewTick\(\)\s*\{([\s\S]*?)\n\}/) || [])[1] || '';
  if (!/scheduleProgressLyricPreviewTick/.test(text) || !/markRenderInteraction\('progress-drag'/.test(text) || !/wakeMainLoopFromBackground/.test(previewTickBody) || /tickLyricsParticles\(\)/.test(previewTickBody) || !/mainFrameGates\.lyricsParticles/.test(mainLoopText) || !/tickLyricsParticles\(\)/.test(mainLoopText)) {
    fail('progress drag must keep one main-loop-owned lyric tick per display frame');
  }
  if (!/function shouldSkipFixedRenderCadenceFrame/.test(mainLoopText) || !/state\.phase[\s\S]{0,300}elapsedMs \* fps \/ 1000/.test(mainLoopText) || !/fps >= displayHz \* 0\.98/.test(mainLoopText) || !/fixedForegroundFps/.test(rendererQualityText) || !/fixedForegroundFps == null \|\| fixedForegroundFps === 0/.test(rendererQualityText)) {
    fail('fixed foreground FPS must use phase accumulation and must not be bypassed by repeated drag interaction wakeups');
  }
  if (/renderProgressPreview\(preview\.time, preview\.duration\);\s*syncBeatMapPlaybackCursor/.test(text)) {
    fail('raw pointermove must not rescan the full beat map during lyric preview');
  }
  if (!/previewHoldUntil/.test(text) || !/previewClockRunning/.test(text) || !/getProgressPreviewClockSeconds/.test(text)) {
    fail('progress drag release must keep one continuous preview clock through seek settle');
  }
  if (!/beginProgressPreviewHold\(serial,\s*2800,\s*!!resumeAfterSeek,\s*media,\s*mediaSrc,\s*targetTime\)/.test(text) || !/finishProgressPreviewHold\(serial,\s*96\)/.test(text)) {
    fail('progress drag release must retain the preview clock across slow seek and lyric-window settlement');
  }
  if (!/function progressSeekTargetReached/.test(text) || !/!progressSeekMediaStillCurrent/.test(text) || !/media\.seeking/.test(text) || !/waitForProgressSeekReady\(media,\s*targetTime,\s*serial/.test(text)) {
    fail('progress seek completion must verify media identity, seek state, serial, and actual target time');
  }
  if (!/function progressSeekPreviewVisualReady/.test(text) || !/stageLyricProgressSeekVisualReady/.test(text + stageText) || !/previewAudioSettled && progressSeekPreviewVisualReady\(\)/.test(text)) {
    fail('progress preview must not hand its clock back before the final lyric window is visually committed');
  }
  if (!/primeProgressSeekPlayback\(media,\s*mediaSrc,\s*serial\)/.test(text) || !/resumePlaySerial/.test(text)) {
    fail('progress drag release must pre-start playback while muted instead of waiting for a second visual/audio handoff');
  }
  if (!/isProgressDragPreviewActive\(\)\s*&&\s*progressDragState\.previewDuration[\s\S]{0,120}renderProgressPreview\(getProgressPreviewClockSeconds\(\),\s*progressDragState\.previewDuration\)/.test(text)) {
    fail('progress UI must follow the same preview clock during release hold');
  }
  if (!/progressBar\.addEventListener\('pointermove'[\s\S]{0,180}queueProgressPointerPreview/.test(text) || !/function queueProgressPointerPreview[\s\S]{0,650}previewProgressPointer/.test(text)) {
    fail('progress pointermove must coalesce and update preview instead of committing audio currentTime');
  }
  if (/progressBar\.addEventListener\('pointermove'[\s\S]{0,220}currentTime\s*=/.test(text)) {
    fail('progress pointermove must not write audio.currentTime while dragging');
  }
  if (!/setAudioOutputGainImmediate\(0\)/.test(text) || !/resumeAfterSeek/.test(text) || !/attemptAudioPlay\(\{ manual: true, silent: true, fade: true \}\)/.test(text)) {
    fail('progress seek must mute during drag and resume with a fade after release');
  }
  if (!/!audio\.paused && !audio\.ended && playing/.test(text) || !/if \(!resumeAfterSeek\)[\s\S]{0,260}media\.pause\(\)/.test(text)) {
    fail('progress seek must only resume audio when it was actually playing before drag');
  }
  const commitStart = text.indexOf('function commitProgressSeek');
  const commitIdentityGuard = text.indexOf('if (!progressSeekMediaStillCurrent(media, mediaSrc))', commitStart);
  const commitMute = text.indexOf('setAudioOutputGainImmediate(0)', commitStart);
  if (!/function progressSeekMediaStillCurrent\(media, mediaSrc\)/.test(text) || commitStart < 0 || commitIdentityGuard < commitStart || commitMute < 0 || commitIdentityGuard > commitMute || /if \(!progressSeekMediaStillCurrent\(media, mediaSrc\)\) \{[\s\S]{0,120}restorePlaybackGain\(\)/.test(text) || !/progressSeekMediaStillCurrent\(dragMedia, dragMediaSrc\)[^\n]*restorePlaybackGain/.test(text)) {
    fail('stale progress drags must never mute or restore gain on a newly switched audio element');
  }
  console.log('[OK] Progress drag previews visually and commits audio seek on release.');
}

function checkLyricBackfaceMaterialGuard() {
  logStep('Lyric backface readability guard');
  const rowText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '12-lyrics-row-layers.js'), 'utf8');
  if (!/makeLyricBackfaceReadableMaterial/.test(rowText) || !/gl_FrontFacing\s*\?\s*vUv\s*:\s*vec2\(1\.0 - vUv\.x, vUv\.y\)/.test(rowText)) {
    fail('row lyric translation/readability/glow materials must flip UV on backfaces like the primary lyric shader');
  }
  if (!/readabilityMat = makeLyricBackfaceReadableMaterial/.test(rowText) || !/glowMat = makeLyricBackfaceReadableMaterial/.test(rowText)) {
    fail('lyric row readability and glow layers must use backface-readable materials');
  }
  console.log('[OK] Lyric translation/readability/glow layers stay readable from the back side.');
}

function checkLyricScrollPerformanceGuard() {
  logStep('Lyric scroll performance guard');
  const rowText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '12-lyrics-row-layers.js'), 'utf8');
  const displayModeText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '08-lyrics-display-modes.js'), 'utf8');
  const paletteText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '07-lyrics-palette-text-utils.js'), 'utf8');
  const shaderText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '11-lyrics-shaders.js'), 'utf8');
  const payloadText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '09-lyrics-payloads.js'), 'utf8');
  const starRiverText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '03-lyrics-star-river.js'), 'utf8');
  const fontText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '05-lyrics-fonts-texture.js'), 'utf8');
  const maskText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '10-lyrics-mask-textures.js'), 'utf8');
  const meshText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '13-lyrics-mesh-build.js'), 'utf8');
  const stageText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '14-stage-lyrics-rendering.js'), 'utf8');
  const lyricText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '00-lyrics-fetch-parse.js'), 'utf8');
  const lyricColorText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '01-lyric-color-controls.js'), 'utf8');
  const lyricColorSetterText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '03-cover-picker-fonts.js'), 'utf8');
  const fxBindText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '07-bindings-shelf-immersive.js'), 'utf8');
  const fxPanelText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '05-fx-panel-performance.js'), 'utf8');
  const playbackText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '13-playback-start-audio.js'), 'utf8');
  const lyricActionsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '06-track-detail-lyrics-actions.js'), 'utf8');
  const controlsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '14-player-controls.js'), 'utf8');
  const switchText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '12-playback-switch-core.js'), 'utf8');
  const schedulerText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '10-frame-scheduler.js'), 'utf8');
  const previewRowLockBindings = (stageText.match(/previewMotionLock: previewMotionLock/g) || []).length;
  if (/lazyGlow/.test(rowText) || /highLineGlowBudget/.test(rowText)) {
    fail('lyric row glow must not be lazily created while scrolling; runtime canvas texture creation causes stutter');
  }
  if (/cropLyricGlowGeometryUv|lyricRowGlowCropFrame|rowGlowCrop|glowCrop/.test(rowText + meshText)) {
    fail('lyric glow must not crop away the texture feathering; hard UV crops cause visible square glow edges');
  }
  const independentGlowRasterBindings = (rowText.match(/lyricGlowRasterMetrics\(/g) || []).length;
  if (
    !/function lyricGlowTextureWidthBudget/.test(maskText) ||
    !/function lyricGlowRasterMetrics/.test(maskText) ||
    !/logicalActiveTextWidth/.test(maskText) ||
    !/minimumRasterFont/.test(maskText) ||
    !/rasterScale:\s*state\.pixelScale/.test(maskText) ||
    !/fontSize:\s*state\.fontSize/.test(maskText) ||
    independentGlowRasterBindings < 2 ||
    !/makeLyricGlowTexture\([\s\S]{0,360}glowRaster\.fontSize[\s\S]{0,360}glowRaster\.scale\)/.test(rowText) ||
    !/beginLyricGlowTextureBuild\([\s\S]{0,360}glowRaster\.fontSize[\s\S]{0,360}glowRaster\.scale\)/.test(rowText) ||
    /(?:make|begin)LyricGlowTexture(?:Build)?\([\s\S]{0,360}lineMask\.rasterScale/.test(rowText) ||
    /rowGlowAspect\s*=\s*Math\.max\(0\.12/.test(rowText) ||
    !/rowGlowTextureRatio/.test(rowText)
  ) {
    fail('row lyric glow must use its own logical-width raster budget and preserve the true long-line texture aspect ratio');
  }
  if (!/makeLyricGlowTexture\([\s\S]{0,260}activeMask\.activeLine,\s*null\)/.test(meshText) || /glowMeta\.matchMask \?/.test(meshText)) {
    fail('single-line lyric glow fallback must use the same standalone feathered texture path');
  }
  if (!/glowLockedToText/.test(rowText) || !/row\.glow\.position\.set\(glowTargetX, glowTargetY, glowTargetZ\)/.test(rowText)) {
    fail('active row lyric glow must stay locked to the text mesh while multi-line lyrics scroll');
  }
  if (/lyricBottomControlOcclusionFade/.test(rowText)) {
    fail('bottom controller glass lyric reflections are intentional and must not be masked away');
  }
  if (!/function lyricRowGlowThreeColor/.test(paletteText) || !/function lyricBeatGlowThreeColor/.test(paletteText) || !/lyricMultiLineGlowDetached/.test(paletteText) || !/lyricRowGlowThreeColor\(pal, !!row\.isTranslation\)/.test(rowText) || !/uGlowColor: \{ value: lyricStageGlowThreeColor/.test(shaderText) || !/uSolarColor: \{ value: lyricBeatGlowThreeColor/.test(shaderText)) {
    fail('multi-line lyric glow and beat bloom must follow the independent glow color instead of lyric text color changes');
  }
  if (!/rowGlow \* \(1 \+ rowGlowBeat \* 0\.46\)/.test(rowText) || !/glowTargetScale = row\.mesh \? row\.mesh\.scale\.x : scaleTarget/.test(rowText) || !/var lyricBeatGlow = fx\.lyricGlowBeat \? stageLyrics\.beatGlow : 0/.test(stageText)) {
    fail('the lyric back glow layer must pulse through opacity while staying locked to the text transform');
  }
  if (!/setLyricSparkColor\(data, lyricBeatGlowThreeColor/.test(paletteText) || !/data\.sunMat\.color\.copy\(lyricBeatGlowThreeColor/.test(paletteText) || !/stageLyricPrewarm\.mesh/.test(paletteText) || !/function setLyricMaterialColor/.test(paletteText) || !/row\.glowMat\) setLyricMaterialColor\(row\.glowMat, lyricRowGlowThreeColor/.test(paletteText) || !/if \(ru\.uColor\) ru\.uColor\.value\.copy/.test(paletteText)) {
    fail('lyric glow color changes must immediately repaint active, outgoing, and prewarmed lyric glow materials');
  }
  if (!/function lyricControlPalette/.test(lyricColorText) || !/picker\) picker\.value = tone/.test(lyricColorText) || !/picker\) picker\.value = linked \? tone : color/.test(lyricColorText) || !/setStageLyricPalette\(lyricPaletteFromHex\(fx\.lyricColor\), \{ immediate: true/.test(lyricColorSetterText)) {
    fail('lyric color controls must display the live palette and repaint lyrics immediately while dragging colors');
  }
  if (!/function lyricHighImpactTextHsl/.test(paletteText) || !/minS:\s*0\.90/.test(paletteText) || !/sampledBright/.test(paletteText) || /primary:\s*'#064b5b'/.test(paletteText)) {
    fail('cover-based lyric text color must stay high-brightness/high-saturation instead of darkening bright cover samples');
  }
  if (!/function lyricCoverLooksMonochrome/.test(paletteText) || !/avgChroma/.test(paletteText) || !/colorfulRatio/.test(paletteText) || !/best\.chroma/.test(paletteText) || /lyricTextPaletteFromHsl\(hsl, avgL, Math\.max\(0, best\.score\)\)/.test(paletteText)) {
    fail('monochrome cover lyric sampling must use real chroma statistics instead of boosting brightness scores into vivid colors');
  }
  if (!/function lyricBackdropAdaptActive\(\)\s*\{[\s\S]{0,180}fx\.lyricBackdropAdapt !== false[\s\S]{0,90}lyricBackgroundAdaptStrengthValue\(\) > 0\.001;/.test(rowText) || /preset === 7 \|\| preset === 8/.test(rowText) || !/setFxPanelControlsHidden\(\['fx-lyricbgadapt-row', 'fx-lyricbgadapt'\], false\)/.test(fxPanelText)) {
    fail('lyric bright-backdrop avoidance must stay global while honoring its performance toggle');
  }
  if (!/color: lyricBeatGlowThreeColor\(pal/.test(meshText) || !/color: lyricStageGlowThreeColor\(pal/.test(meshText) || !/uColor: \{ value: lyricBeatGlowThreeColor\(pal/.test(meshText)) {
    fail('lyric sun, texture glow, and beat particles must initialize from the glow palette instead of the text highlight color');
  }
  if (!/fx && fx\.lyricGlowLinked !== false \? 'glow-linked' : 'glow-detached'/.test(stageText) || !/stageLyricColorSignature\(pal\.glowColor\)/.test(stageText)) {
    fail('stage lyric prewarm cache key must include glow link mode and resolved glow color');
  }
  if (!/newIdx === stageLyrics\.currentIdx && stageLyrics\.current && stageLyrics\.currentPayload/.test(stageText)) {
    fail('stage lyrics must reuse the current payload while the active lyric index is unchanged');
  }
  if (!/function scheduleStageLyricPrewarmForIndex/.test(stageText) || !/stageLyricPrewarm\.targetIndex/.test(stageText)) {
    fail('stage lyric prewarm must support explicit target indexes without timer churn');
  }
  if (!/function stageLyricLightPrewarmReason/.test(stageText) || !/var lightweight = stageLyricLightPrewarmReason\(reason\)/.test(stageText) || !/lightweightTrack: lightweight/.test(stageText) || !/options\.lightweightTrack/.test(stageText)) {
    fail('intro and lyric-toggle prewarm must use lightweight track windows before the first real lyric line takes over');
  }
  if (!/setLyricTrackTarget\(stageLyricPrewarm\.mesh, payload\)/.test(stageText) || !/targetLineIndex >= Number\(data\.trackStart\)/.test(stageText)) {
    fail('stage lyric prewarm meshes must be reusable for any target line inside the prewarmed page');
  }
  if (!/function stageLyricCurrentUsesPersistentTrack/.test(stageText) || !/function initializeStageLyricPersistentTrack/.test(stageText) || !/data\.trackPersistent = true/.test(stageText) || !/data\.trackStart = 0/.test(stageText) || !/data\.trackEnd = lyricsLines\.length - 1/.test(stageText) || !/stageLyrics\.current = mesh;[\s\S]{0,100}initializeStageLyricPersistentTrack\(mesh, payload\)/.test(stageText)) {
    fail('the first multi-line lyric mesh must become the persistent whole-song track root instead of being replaced by a later full mesh');
  }
  if (!/lightPageSize/.test(stageText) || !/lightOverlap/.test(stageText) || !/lightStep/.test(stageText)) {
    fail('lightweight lyric first paint must keep its bounded overlapping window before the full-song mesh is ready');
  }
  if (!/function lyricBufferedTrackWindow\(index, mode\) \{[\s\S]{0,560}return \{ start: 0, end: last \};/.test(stageText) || /function lyricBufferedTrackWindow\(index, mode\) \{[\s\S]{0,620}var pageSize/.test(stageText) || !/var windowInfo = lyricBufferedTrackWindow\(index, mode\);/.test(stageText)) {
    fail('the logical multi-line lyric descriptor track must cover the whole song without page-dependent scroll coordinates');
  }
  if (!/function stableStageLyricRowMaskLayout/.test(meshText) || !/preparedMasks\.rowBaseMask \|\| makeLyricMask\(rowBasePayload \|\| activePayload \|\| payload \|\| text, rowBaseLayout\)/.test(meshText) || !/state\.rowBaseMask = makeLyricMask\(state\.rowBasePayload \|\| state\.activePayload \|\| state\.payload \|\| state\.text, rowBaseLayout\)/.test(meshText)) {
    fail('lyric row base masks must use a stable font layout so long lyrics do not resize while dragging');
  }
  if (!/function scheduleLyricTrackBoundaryPrewarm/.test(meshText) || !/data\.trackPersistent && typeof ensureStageLyricPersistentTrackRows/.test(meshText) || !/ensureStageLyricPersistentTrackRows\(stageLyrics && stageLyrics\.current, targetLineIndex/.test(meshText)) {
    fail('persistent lyric tracks must extend resident rows inside the same root instead of prewarming a replacement page');
  }
  if (!/function shouldSnapLyricTrackScroll/.test(meshText) || !/function snapLyricTrackScroll/.test(meshText) || !/trackScrollSnapUntil/.test(rowText + meshText + stageText) || !/needsScrollSnap/.test(rowText)) {
    fail('multi-line lyric track reuse must snap invalid first-frame scroll offsets so rows do not compress until pause/play');
  }
  if (
    !/var snapTrackScroll = shouldSnapLyricTrackScroll/.test(meshText) ||
    !/data\.trackPersistent && data\.trackScrollPrimed[\s\S]{0,260}snapTrackScroll = false/.test(meshText) ||
    /var snapTrackScroll = previewMotionLock \|\| shouldSnapLyricTrackScroll/.test(meshText) ||
    !/var previewMotionLock = stageLyricProgressPreviewActive\(\)/.test(stageText) ||
    !/progressPreviewHoldY/.test(stageText) ||
    previewRowLockBindings < 2 ||
    !/function stageLyricResidentDisplayedScrollOffset/.test(stageText) ||
    !/var displayedScrollOffset = stageLyricResidentDisplayedScrollOffset/.test(stageText) ||
    !/primeStageLyricResidentRowTransform\(data, row, transformSnapshot\)/.test(stageText) ||
    !/function stageLyricPersistentNextTextRunwayRange/.test(stageText) ||
    !/persistent-track-full-text-runway/.test(stageText) ||
    !/var previewMotionLock = opts\.previewMotionLock === true/.test(rowText) ||
    !/var pendingPayload = data\.trackPersistent && data\.trackPendingPayload/.test(rowText) ||
    !/var targetLineIndex = pendingTargetLineIndex != null/.test(rowText) ||
    !/var continuousTrackMaxRowsPerFrame = 0\.68/.test(rowText) ||
    !/trackStep = clampRange\(trackStep, -continuousTrackMaxStep, continuousTrackMaxStep\)/.test(rowText) ||
    !/function lyricNearestPrimaryLineIndexForVirtual/.test(rowText) ||
    !/var presentationLineIndex = previewTrackCorridor/.test(rowText) ||
    !/data\.trackPresentationLineIndex = presentationLineIndex/.test(rowText) ||
    /if \(previewMotionLock\) \{[\s\S]{0,140}data\.trackScrollOffset = targetIndex/.test(rowText) ||
    /if \(previewMotionLock\) \{[\s\S]{0,180}row\.mesh\.position\.set/.test(rowText) ||
    !/var continuousRowMaxRowsPerFrame = 0\.66/.test(rowText) ||
    !/rowYStep = clampRange\(rowYStep, -continuousRowMaxStepWorld, continuousRowMaxStepWorld\)/.test(rowText) ||
    !/row\.mesh\.position\.y \+= rowYStep/.test(rowText)
  ) {
    fail('progress dragging must keep the shared lyric track easing continuously while only decorative motion is locked');
  }
  if (!/function stageLyricUsesSingleLineSwap/.test(stageText) || !/mode === 'single' && !data\.usesTrack/.test(stageText) || !/if \(singleLineSwap\) \{[\s\S]{0,220}mesh\.position\.z -= dt \* 0\.26/.test(stageText) || !/if \(!singleLineSwap\) group\.position\.y \+= enterDir \* lineWorldStep/.test(meshText)) {
    fail('single-line lyrics must keep the old GitHub fade/float swap instead of inheriting multi-line scroll offsets');
  }
  if (!/function stageLyricPayloadIsSingleLine/.test(stageText) || !/function stageLyricSingleLineTrackStub/.test(stageText) || !/if \(stageLyricPayloadIsSingleLine\(payload\)\) return false;/.test(stageText) || !/singleLineBoundaryNoSyncBuild/.test(stageText) || !/var singleLineDemand = stageLyricPayloadIsSingleLine\(payload\)/.test(stageText) || !/var delay = singleLineDemand \? 0 : 16/.test(stageText)) {
    fail('single-line lyrics must stay on the cheap swap mesh path and prewarm boundary meshes instead of building on the switching frame');
  }
  if (!/if \(mode === 'single'\) \{[\s\S]{0,160}stageLyricSingleLineTrackStub\(index\)/.test(stageText) || !/trackKey: '',[\s\S]{0,140}trackEntries: singleTrack\.entries/.test(stageText) || !/function stageLyricMultiLineWarmupLoad\(\) \{[\s\S]{0,120}return mode !== 'single';/.test(stageText)) {
    fail('single-line lyric payloads must bypass buffered trackEntries even when translations are enabled');
  }
  if (!/var singleLineStartX = singleLineSwap \? 0 : \(Math\.random\(\) - 0\.5\) \* 0\.045/.test(meshText) || !/var singleLineStartX = singleLineSwap \? 0 : \(Math\.random\(\) - 0\.5\) \* 0\.045/.test(stageText) || !/if \(singleLineSwap\) \{[\s\S]{0,220}mesh\.position\.y \+= \(\(0\.18 \+ \(verticalFloatOn \?/.test(stageText)) {
    fail('single-line lyric sentence endings must avoid random lateral jumps and hard visual stops');
  }
  if (!/var stageLyricSingleLinePrewarm = \{ items: \{\}, order: \[\], max: 10 \};/.test(stageText) || !/var stageLyricTrackSwitchBootstrapUntil = 0;/.test(stageText) || !/function scheduleStageLyricSingleLineNextPrewarm/.test(stageText) || !/stageLyricSingleLineNextPrewarmReady\(currentIndex\)/.test(stageText) || !/function stageLyricSingleLineIndexPrewarmReady[\s\S]{0,420}stageLyricSingleLinePrewarmCanServePayload\(payload\)[\s\S]{0,220}stageLyricPrewarmCanServePayload\(payload\)/.test(stageText) || !/function stageLyricSingleLineWarmupPending[\s\S]{0,520}stageLyricSingleLineIndexPrewarmReady\(singleLineIndex\)/.test(stageText.replace(/function stageLyricWarmupPending/, 'function stageLyricSingleLineWarmupPending')) || !/function stageLyricSingleLineUpcomingIndexes/.test(stageText) || !/function stageLyricSingleLinePrewarmDelay/.test(stageText) || !/function scheduleStageLyricSingleLineBootstrapPrewarm/.test(stageText) || !/function scheduleStageLyricSingleLineCachePrewarm/.test(stageText) || !/takeStageLyricSingleLinePrewarmMesh\(payload\) \|\| takeStageLyricPrewarmMesh\(payload\)/.test(stageText) || !/stageLyricSingleLineUpcomingIndexes\(currentIndex, 6\)/.test(stageText) || !/stageLyricTrackSwitchBootstrapUntil = stageLyricNowMs\(\) \+ 4800/.test(stageText) || !/return 0;[\s\S]{0,260}var idx = -1;/.test(stageText) || !/stageLyricSingleLineBootstrapIndex\(\)/.test(stageText) || !/scheduleStageLyricSingleLineBootstrapPrewarm\(prewarmReason, restoreWarmup \? 24 : 44\)/.test(lyricText) || /if \(stageLyricSingleLineNextPrewarmReady\(currentIndex\)\) return true;/.test(stageText) || !/single-line-lookahead-/.test(stageText) || !/markRenderInteraction\('lyric-swap', 360\)/.test(stageText) || !/scheduleStageLyricSingleLineNextPrewarm\(newIdx, lyricT/.test(stageText)) {
    fail('single-line lyrics with translations must prewarm the next sentence mesh before the switching frame');
  }
  if (!/var primeAmount = singleLinePayload \? 0 : \(Math\.abs\(lineStep\) > 0 \? 0\.34 : 0\.24\)/.test(stageText)) {
    fail('single-line lyrics must fade in from zero like the GitHub baseline instead of popping in pre-brightened');
  }
  if (!/visibilityAbs = Math\.abs\(parentVirtualForVisibility - visibilityScrollOffset\)/.test(rowText) || !/visibleRadius \+ 1\.10 - visibilityAbs/.test(rowText)) {
    fail('translation row visibility must be calculated from its bound primary lyric row');
  }
  if (!/singleLineStaticSwap = displayMode === 'single' && !data\.usesTrack/.test(rowText) || !/singleLineTranslationSwap && isFinite\(Number\(row\.baseY\)\)/.test(rowText) || !/baseScale = Number\(row\.baseScale\)/.test(rowText) || !/cloneStageLyricEntryForLayer\(entry,\s*\{\s*virtualIndex:\s*virtualIndex\s*\}\)/.test(rowText)) {
    fail('single-line translation rows must share the primary single-line swap instead of sliding up from their own anchor');
  }
  if (!/lyricLineHasTranslationAt\(n \+ 1\)/.test(displayModeText)) {
    fail('translation-aware lyric spacing must reserve room before a translated next line enters');
  }
  if (/trackScrollPayloadKey/.test(meshText) || !/function lyricTrackScrollWindowKey/.test(meshText) || !/return payload\.trackKey;/.test(meshText) || !/data\.trackScrollWindowKey !== payloadWindowKey/.test(meshText)) {
    fail('multi-line lyric scrolling identity must stay bound to the song/style track instead of resident window bounds');
  }
  if (!/function requestStageLyricWarmup/.test(stageText) || !/function stageLyricWarmupPending/.test(stageText) || !/scheduleStageLyricPrewarmForIndex\(0, 'intro-first-line'/.test(stageText)) {
    fail('stage lyrics must warm up before the first real lyric line replaces the intro title');
  }
  if (!/function buildStageLyricPlaybackPayload/.test(stageText) || !/buildStageLyricDisplayPayload\(index, \{ lightweightTrack: true \}\)/.test(stageText) || !/stageLyricPrewarmCanServePayload\(lightweightPayload\)/.test(stageText)) {
    fail('the first real lyric line must be allowed to take over the lightweight prewarm mesh without rebuilding a full multi-line track');
  }
  if (!/shouldStartLightweight/.test(stageText) || !/currentIsLightweight/.test(stageText) || !/stageLyricMeshCanServePayload\(stageLyrics\.current, lightweightPayload\)/.test(stageText)) {
    fail('songs that enter lyrics immediately must still use a bounded first paint before that root begins resident-row streaming');
  }
  if (!/function scheduleStageLyricFullTrackWarmup/.test(stageText) || !/stageLyricFullTrackWarmupTargetAt/.test(stageText) || !/scheduleStageLyricFullTrackWarmup\(restoreWarmup \? 'track-ready-fast' : 'lyrics-ready-preload', restoreWarmup \? 120 : 24\)/.test(lyricText)) {
    fail('lyrics must schedule full-track warmup as soon as a lyric response is parsed');
  }
  if (!/function requestStageLyricRestoreWarmup/.test(stageText) || !/function scheduleStageLyricRestorePrewarm/.test(stageText) || !/var restoreWarmup = typeof stageLyricRestoreWarmupSeconds === 'function'/.test(lyricText) || !/requestStageLyricRestoreWarmup\(restoreResumeAt, token, 'startup-restore'\)/.test(playbackText)) {
    fail('startup resume lyrics must prewarm around the restored playback time instead of rebuilding uneven chunks from the first line');
  }
  if (!/function clearStageLyricFullTrackWarmup/.test(stageText) || /function disposeStageLyricPrewarmMesh\(\)\s*\{[\s\S]{0,220}stageLyricFullTrackWarmupTimer/.test(stageText)) {
    fail('disposing a lightweight prewarm mesh must not cancel the pending full-track lyric warmup');
  }
  if (!/clampRange\(Number\(data\.lineWorldStep\) \|\| 0\.38, 0\.20, 0\.94\)/.test(stageText) || !/clampRange\(Number\(data\.lineWorldStep\) \|\| lyricMotion\.slide, 0\.20, 0\.94\)/.test(stageText) || !/clampRange\(Number\(data\.lineWorldStep\) \|\| 0\.38, 0\.20, 0\.94\)/.test(rowText)) {
    fail('multi-line lyric reuse and row-layer scrolling must keep the same line spacing clamp as mesh construction');
  }
  if (!/function lyricsAreFallbackTitleOnly/.test(lyricText) || !/var fallbackTitleOnly = lyricsAreFallbackTitleOnly\(lyricsLines\)/.test(lyricText) || !/if \(!fallbackTitleOnly && typeof scheduleStageLyricFullTrackWarmup === 'function'\)/.test(lyricText)) {
    fail('track-title fallback lyrics must not schedule a full multi-line track warmup before real lyrics arrive');
  }
  if (!/function resetLyricsForTrackSwitch/.test(lyricText) || !/function scheduleTrackSwitchFallbackLyrics/.test(lyricText) || !/multiLineDelay/.test(lyricText) || !/scheduleTrackSwitchFallbackLyrics\(song, token, 1500\)/.test(playbackText) || !/cancelPendingTrackFallbackLyrics\(\)/.test(lyricText)) {
    fail('track switches must delay title fallback lyrics so real lyrics do not trigger a double load');
  }
  if (!/var trackLightweight = false/.test(payloadText) || !/trackLightweight = input\.trackLightweight === true/.test(payloadText) || !/trackLightweight: trackLightweight/.test(payloadText)) {
    fail('stage lyric payload normalization must preserve lightweight track windows for stutter-free multi-line first paint');
  }
  if (!/var earlyLyricFetchStarted = false/.test(playbackText) || !/function startTrackLyricFetch/.test(playbackText) || !/if \(!earlyLyricFetchStarted\) fetchLyric\(song, token\)/.test(playbackText)) {
    fail('track switches must start lyric fetching in parallel with audio URL loading and avoid duplicate fetches');
  }
  if (/scheduleStageLyricPrewarm\('renderLyrics', 32\)[\s\S]{0,180}clearStageLyrics\(\)/.test(lyricText)) {
    fail('renderLyrics must not cancel its own lightweight stage lyric prewarm');
  }
  if (!/stageLyricFullTrackWarmupDelay/.test(stageText) || !/requestIdleCallback/.test(stageText) || !/lightweight-upgrade/.test(stageText)) {
    fail('multi-line full-track lyric warmup must be delayed, prefer idle time, and upgrade lightweight pages without repeated line-end postponement');
  }
  if (!/function stageLyricTextLoadInfo/.test(stageText) || !/function stageLyricPreferLightweightTrack/.test(stageText) || !/function stageLyricShouldSkipFullTrackWarmup/.test(stageText) || !/stageLyricPreferLightweightTrack\(\)\) return false;[\s\S]{0,120}return false;/.test(stageText) || !/if \(stageLyricShouldSkipFullTrackWarmup\(reason\)\) return false;/.test(stageText)) {
    fail('dense lyrics must use lightweight first paint only, then allow full-track warmup for steady scrolling');
  }
  if (!/requestStageLyricWarmup\('toggleLyricsPanel'/.test(lyricText) || !/scheduleStageLyricPrewarm\('toggleLyricsPanel', 48\)/.test(lyricText) || !/scheduleStageLyricFullTrackWarmup\('track-ready', 220\)/.test(lyricText)) {
    fail('manual lyric toggle must defer initial rendering and prewarm instead of building the full lyric mesh on the click frame');
  }
  if (!/requestStageLyricWarmup\('setParticleLyricsSilently'/.test(fxBindText) || !/scheduleStageLyricPrewarm\('setParticleLyricsSilently', 48\)/.test(fxBindText) || !/scheduleStageLyricFullTrackWarmup\('track-ready', 220\)/.test(fxBindText)) {
    fail('silent lyric activation must also use the warmup/prewarm path');
  }
  if (!/function scheduleQueueLyricPrefetch/.test(lyricText) || !/async function runQueueLyricPrefetch/.test(lyricText) || !/if \(audio && audio\.paused\) return false;/.test(lyricText) || /\/api\/(?:song\/url|qq\/song\/url|kugou\/song\/url|qishui\/song\/url|spotify\/song\/url)/.test(lyricText) || !/scheduleQueueLyricPrefetch\(idx, 2400\)/.test(playbackText)) {
    fail('queue lyric prefetch must stay isolated from audio URL switching and only run after playback is stable');
  }
  if (!/function shouldDeferStageLyricSyncBuild/.test(stageText) || !/showStageLine\(displayPayload, false, \{ noSyncBuild: true \}\)/.test(stageText)) {
    fail('long lyric page switches must not synchronously build a new mesh on the animation tick');
  }
  if (!/var singleLineBoundaryNoSyncBuild = options\.noSyncBuild && singleLinePayload && !redrawOnly && stageLyrics\.current;/.test(stageText) || !/if \(singleLineBoundaryNoSyncBuild\) \{[\s\S]{0,100}requestStageLyricDemandPrewarm\(payload\);[\s\S]{0,80}return false;[\s\S]{0,40}\}/.test(stageText)) {
    fail('single-line lyric sentence switches must not synchronously build a new mesh on the animation tick');
  }
  if (!/var lightweightFallback = buildStageLyricDisplayPayload\(newIdx, \{ lightweightTrack: true \}\)/.test(stageText) || !/displayPayload = lightweightFallback/.test(stageText)) {
    fail('long lyric page switches must fall back to a lightweight window when the full track page is not ready');
  }
  if (!/var track = options\.lightweightTrack\s*\? buildStageLyricMeshTrackEntries\(index, mode, options\)\s*:\s*buildStageLyricTrackEntries\(index, mode\)/.test(stageText)) {
    fail('triple and multi-line lyrics must use the full-song track cache after the lightweight first-paint path');
  }
  if (!/var multiLineLoad = stageLyricMultiLineWarmupLoad\(\)/.test(stageText) || !/if \(payload\.trackLightweight\) return false;/.test(stageText) || !/if \(!multiLineLoad && lyricsLines\.length < 24\) return false;/.test(stageText) || !/if \(options\.noSyncBuild\) \{[\s\S]{0,100}requestStageLyricDemandPrewarm\(payload\);[\s\S]{0,60}return false;/.test(stageText) || /allowLightweightSyncBuild/.test(stageText)) {
    fail('multi-line lyrics must defer both lightweight and full mesh builds off the animation tick');
  }
  if (!/function beginLyricRowLayerGroupBuild/.test(rowText) || !/function appendLyricRowLayerBuildPhase/.test(rowText) || !/function stepLyricRowLayerGroupBuild/.test(rowText) || !/function beginCooperativeLyricMeshBuild/.test(meshText) || !/function stepCooperativeLyricMeshBuild/.test(meshText) || !/stepCooperativeLyricMeshBuild\(job\.state, 1, 4\.2\)/.test(stageText) || !/stageLyricPrewarm\.workTimer/.test(stageText)) {
    fail('multi-line lyric meshes must be built cooperatively in bounded row sub-phases');
  }
  if (!/function beginLyricReadabilityTextureBuild/.test(maskText) || !/function stepLyricReadabilityTextureBuild/.test(maskText) || !/LYRIC_READABILITY_BUILD_PHASES = 4/.test(maskText) || !/function beginLyricGlowTextureBuild/.test(maskText) || !/function stepLyricGlowTextureBuild/.test(maskText) || !/LYRIC_GLOW_BUILD_PHASES = 12/.test(maskText) || !/row-readability-/.test(rowText) || !/row-glow-/.test(rowText)) {
    fail('lyric readability and glow textures must remain split into cooperative drawing sub-phases');
  }
  if (!/function beginLyricMaskLayoutMetricsBuild/.test(maskText) || !/function stepLyricMaskLayoutMetricsBuild/.test(maskText) || !/function finishLyricMaskLayoutMetricsBuild/.test(maskText) || !/beginLyricMaskLayoutMetricsBuild\(payload \|\| text\)/.test(meshText) || !/stepLyricMaskLayoutMetricsBuild\(state\.layoutState, 1\)/.test(meshText) || !/function lyricRowLayerBundleActiveMask/.test(meshText) || !/lyricRowLayerBundleActiveMask\(preparedRowLayerBundle\)/.test(meshText)) {
    fail('cooperative multi-line lyrics must measure layout without drawing an unused full-window texture and reuse the active row mask');
  }
  if (!/function lyricTextureClarityScale/.test(maskText) || !/lyricTextureClarity/.test(maskText + stageText) || !/function lyricRowTextureWidthBudget/.test(maskText) || !/function compactLyricLineMaskTexture/.test(maskText) || !/renderer\.domElement\.width/.test(maskText) || !/profile && profile\.lowSpec/.test(maskText) || !/mask\.rasterScale/.test(maskText) || !/compactLyricLineMaskTexture\(makeLyricMask/.test(rowText) || !/var glowRaster = lyricGlowRasterMetrics\(row\.lineMask\);[\s\S]{0,420}beginLyricGlowTextureBuild\([\s\S]{0,360}null,\s*glowRaster\.scale\);/.test(rowText) || !/pixelScale/.test(maskText)) {
    fail('row lyric textures must scale to the physical render width and preserve glow/readability proportions');
  }
  if (!/var lyricTextMeasureCache/.test(fontText) || !/function lyricMeasuredCharacterWidth/.test(fontText) || !/fontKerning/.test(fontText) || !/probeSpacing = 0\.001/.test(fontText) || !/function scheduleLyricTextMeasureWarmup/.test(fontText) || !/requestIdleCallback/.test(fontText) || !/layoutMeasureBaseSize:\s*128/.test(maskText) || !/layoutBaseWidthCache/.test(maskText) || !/function measureWidestAtSize/.test(maskText) || !/estimatedFont/.test(maskText)) {
    fail('lyric font fitting must keep bounded character-width caching and coarse-to-exact size selection');
  }
  if (!/function scheduleStageLyricCooperativeWork/.test(stageText) || !/stageLyricPrewarm\.workRaf/.test(stageText) || !/requestAnimationFrame\(function \(\)/.test(stageText) || !/function stageLyricShouldYieldToPendingInput/.test(stageText) || !/isInputPending/.test(stageText)) {
    fail('lyric cooperative work must run after a rendered frame and yield to pending continuous input');
  }
  if (!/var stageLyricResidentBuild = \{ job: null, timer: 0, raf: 0, token: 0 \}/.test(stageText) || !/function startStageLyricResidentBuild/.test(stageText) || !/function ensureStageLyricPersistentTrackRows/.test(stageText) || !/function mergeStageLyricResidentBundle/.test(stageText) || !/function trimStageLyricPersistentTrackRows/.test(stageText) || !/stageLyrics\.current !== job\.mesh/.test(stageText)) {
    fail('multi-line lyrics must stream bounded resident rows into one persistent root with a single cancellable build job');
  }
  if (!/function stageLyricPersistentTargetRowsReady/.test(stageText) || !/function stageLyricPersistentTargetEffectsReady/.test(stageText) || !/function commitStageLyricPersistentPendingTarget/.test(stageText) || !/pending target committed before upload/.test(fs.readFileSync(__filename, 'utf8')) || !/d\.trackPendingProgress =/.test(meshText) || !/pendingWindowAllowed/.test(rowText)) {
    fail('seek targets must stay pending until every visible primary and translation text row is resident and uploaded');
  }
  if (!/function cancelLyricRowLayerGroupBuild/.test(rowText) || !/releaseLyricRowLayerBuildCanvas/.test(rowText) || !/function scheduleStageLyricResidentDemand/.test(stageText) || !/stageLyricProgressPreviewActive\(\)/.test(stageText) || !/coalescedOptions\.urgent = false/.test(stageText) || !/trackTextOnly/.test(rowText + stageText) || !/stageLyricShouldYieldToPendingInput\(\) && !job\.interactive && !job\.textOnly/.test(stageText) || !/lyricCustomLineCount = 10/.test(fs.readFileSync(__filename, 'utf8'))) {
    fail('continuous seek previews must coalesce demand while letting the final text-only window make bounded progress through pending input');
  }
  if (!/stageLyricTrackGeneration \+= 1/.test(stageText) || !/songKey,\s*stageLyricTrackGeneration/.test(stageText)) {
    fail('lyric track identity must change when refreshed lyrics alter a middle line');
  }
  if (!/function refreshStageLyricDisplayMode\(\) \{\s*refreshCurrentLyricStyle\(\);\s*\}/.test(lyricActionsText) || !/buildStageLyricDisplayPayload\(stageLyrics\.currentIdx, \{ lightweightTrack: true \}\)/.test(stageText)) {
    fail('lyric display mode changes must rebuild from a lightweight payload instead of synchronously constructing the whole song');
  }
  if (/renderer\.initTexture/.test(maskText + rowText + meshText + stageText)) {
    fail('lyric texture prewarm must not force synchronous GPU uploads with renderer.initTexture');
  }
  if (!/var lyricDisposeQueue = \[\]/.test(starRiverText) || !/function flushLyricDisposeQueue/.test(starRiverText) || !/processed < 12/.test(starRiverText)) {
    fail('lyric mesh disposal must stay split into bounded background chunks');
  }
  if (!/mesh\.visible = false/.test(rowText) || !/readability\.visible = false/.test(rowText) || !/renderRevealAt/.test(rowText) || !/renderLineUploaded/.test(rowText) || !/renderReadabilityUploaded/.test(rowText) || !/renderGlowUploaded/.test(rowText) || !/var renderRevealCandidates = \[\]/.test(rowText) || !/renderRevealCandidates\.sort/.test(rowText) || !/function resetLyricRenderUploadFrameBudget/.test(rowText) || !/function consumeLyricRenderUploadFrameBudget/.test(rowText) || !/if \(!consumeLyricRenderUploadFrameBudget\(\)\) break/.test(rowText) || !/resetLyricRenderUploadFrameBudget\(true\)/.test(stageText) || !/__mineradioLyricUploadBudgetStats/.test(rowText) || !/row\.mesh\.visible = lineLayerVisible/.test(rowText) || !/row\.glow\.visible = glowLayerVisible/.test(rowText)) {
    fail('all lyric meshes in a rendered frame must share one texture-upload token instead of each receiving a local budget');
  }
  if (!/var persistentTrackTransparentPrewarm =/.test(rowText) || !/data\.trackPersistent/.test(rowText) || !/transparentPrewarm: true/.test(rowText) || !/priority: 300 \+ trackPrewarmOrder/.test(rowText) || !/priority: 400 \+ trackPrewarmOrder/.test(rowText) || !/priority: 500 \+ trackPrewarmOrder/.test(rowText)) {
    fail('resident rows in the persistent lyric root must prewarm text, readability, and glow transparently before entering view');
  }
  if (!/function stageLyricPersistentLineEffectsResident/.test(stageText) || !/persistent-track-visible-effects/.test(stageText) || !/textOnly: true/.test(stageText) || !/maxOffset \+ \(interactivePreview \? 10 : 24\)/.test(stageText) || !/existingRow\.readability = row\.readability/.test(stageText) || !/existingRow\.glow = row\.glow/.test(stageText)) {
    fail('persistent lyrics must build a long text-only runway first and enrich only the visible rows with effects');
  }
  if (!/mask\.logicalFontSize/.test(maskText) || !/mask\.logicalWidth/.test(maskText) || !/function lyricRowLogicalWorldWidth/.test(rowText) || !/baseMask\.logicalFontSize \|\| baseMask\.fontSize/.test(rowText) || !/layoutMask\.logicalFontSize/.test(stageText) || !/var scaleDistance = motionAnchor \? 0 : visibilityAbs/.test(rowText) || !/stableMotionIndex/.test(rowText)) {
    fail('resident lyric raster compaction and wide canvases must preserve a stable logical font size and active-row scale');
  }
  if (!/function lyricViewportFitRatio/.test(rowText) || !/function lyricRowLiveViewportScale/.test(rowText) || !/Math\.min\(leftSpace, rightSpace\) \* 2/.test(rowText) || !/row\.mesh\.localToWorld\(lyricViewportFitLeft\)/.test(rowText) || !/lyricViewportFitLeft\.project\(camera\)/.test(rowText) || !/renderWindowActive && \(!fx \|\| fx\.lyricLiveViewportFit !== false\)/.test(rowText) || !/baseScale \*= lyricRowLiveViewportScale\(row, baseScale\)/.test(rowText) || /lyricLongLineDefaultScale|longLineScale|1380\s*\//.test(rowText)) {
    fail('when enabled, original and translated long lyrics must fit the live left/right viewport space without fixed-width hard compression');
  }
  if (!/var frameScale =/.test(rowText) || !/1 - Math\.pow\(1 - baseTrackEase, frameScale\)/.test(rowText) || !/deltaTime: dt/.test(stageText)) {
    fail('lyric scroll easing must keep the same timing across display frame rates');
  }
  if (/stageLyricBeginPreparedTrackTexturePrewarm|stageLyricPreparedTrackTextReady|warmPreparedStageLyricTrackTextures|full-track-textures-ready/.test(stageText) || !/data\.trackPendingPayload = payload/.test(meshText) || !/ensureStageLyricPersistentTrackRows\(mesh, targetLineIndex/.test(meshText) || !/return true;[\s\S]{0,120}data\.trackPendingPayload = null/.test(meshText)) {
    fail('same-song lyric demand must stay on the persistent root and must not wait for a later whole-track takeover');
  }
  if (!/renderInitialTextReady/.test(rowText + meshText) || !/initialTextRowsReady/.test(rowText) || !/initialTextRevealPending \? 0/.test(rowText) || !/lineUploadPrewarm/.test(rowText) || !/revealPrewarmMaxOffset \+ 1/.test(rowText) || !/motionAnchor \|\| row\.renderLineUploaded \? 0/.test(rowText) || !/priority: 100 \+/.test(rowText) || !/priority: 200 \+/.test(rowText)) {
    fail('multi-line lyric rows must upload all visible text before revealing readability or glow layers as one coherent block');
  }
  if (!/function stageLyricShouldHoldOutgoingForReveal/.test(stageText) || !/lyricRevealSuccessor/.test(stageText) || !/stageLyricTrackRevealReady\(revealSuccessor\)/.test(stageText) || !/if \(holdingForLyricReveal\) return true/.test(stageText)) {
    fail('same-track lyric page and lightweight/full handoffs must retain the outgoing lyrics until the incoming text block is ready');
  }
  if (/track-demand\|track-boundary-next\|track-boundary-prev/.test(stageText) || !/trackLightweight/.test(stageText + rowText + meshText)) {
    fail('long lyric boundary/demand prewarm must use full track windows and distinguish light/full meshes');
  }
  if (!/if \(!payload\.trackLightweight && data\.trackLightweight\) return false;/.test(stageText) || !/if \(!data\.trackPersistent && !payload\.trackLightweight && data\.trackLightweight\) return false;/.test(meshText)) {
    fail('only the persistent track root may reuse its bounded bootstrap mesh for later same-song lines');
  }
  if (!/function lyricTranslationMeshScale/.test(rowText) || !/fontScale: fontScale/.test(rowText) || !/scale: primaryLine \? 1 : \(entry\.scale \|\| lyricTranslationScaleValue\(\)\)/.test(rowText)) {
    fail('translation font-size control must affect translation row texture scale and mesh scale');
  }
  if (!/rowGlowPad/.test(rowText) || /glowTargetScale = row\.mesh \? row\.mesh\.scale\.x \* \(1\.0 \+ rowGlowBeat/.test(rowText)) {
    fail('row lyric glow must feather outside the text while staying locked to the lyric mesh scale during beat pulses');
  }
  if (!/function lyricKaraokeWordRanges/.test(stageText) || !/lyricMeasureTextAtSize\(ctx, text\.slice\(0, c0\)/.test(stageText) || !/mesh\.userData\.nativeKaraokeProgress/.test(stageText) || !/updateLyricMeshProgress\(stageLyrics\.current, progress, \{ nativeKaraoke: lyricLineHasNativeKaraoke\(curLine\) \}\)/.test(stageText)) {
    fail('native YRC karaoke highlight must follow word timing and measured word width without smoothed line-level lag');
  }
  if (!/function retireCurrentStageLyricForIdle/.test(stageText) || !/pausedWithTrack/.test(stageText) || !/if \(pausedWithTrack\) \{[\s\S]{0,360}return;[\s\S]{0,120}retireCurrentStageLyricForIdle\(\)/.test(stageText)) {
    fail('paused playback must keep the current lyric mesh instead of retiring it after a few seconds');
  }
  if (!/function resetFrameGate/.test(schedulerText) || !/function markStageLyricsPlaybackResume/.test(stageText) || !/resetFrameGate\(mainFrameGates\.lyricsParticles/.test(stageText) || !/markStageLyricsPlaybackResume\(reason \|\| 'playback-started'\)/.test(controlsText) || !/markStageLyricsPlaybackResume\(reason\)/.test(switchText)) {
    fail('lyric playback resume must clear frame-gate backlog and reuse the smooth paused lyric state');
  }
  const resumeStart = stageText.indexOf('function markStageLyricsPlaybackResume(reason)');
  const resumeEnd = stageText.indexOf('function tickLyricsParticles', resumeStart);
  const resumeBody = resumeStart >= 0 && resumeEnd > resumeStart ? stageText.slice(resumeStart, resumeEnd) : '';
  if (
    !/function stageLyricCurrentCanResumeWithoutWarmup/.test(stageText) ||
    !/function stageLyricCurrentUsesLightweightTrack/.test(stageText) ||
    !/stageLyricResumeWarmupLastAt/.test(stageText) ||
    !/stageLyricResumeUpgradeDeferUntil/.test(stageText) ||
    !/Number\(stageLyricResumeUpgradeDeferUntil\)/.test(stageText) ||
    !/canResumeWithoutWarmup[\s\S]{0,180}resetStageLyricResumeFrameGates\(\);[\s\S]{0,80}return;/.test(resumeBody) ||
    !/requestStageLyricLightweightUpgrade\(reason, 520\)/.test(resumeBody) ||
    /upgradeCurrentStageLyricFromPreparedTrack/.test(resumeBody)
  ) {
    fail('pause/resume must reuse the current lyric mesh and defer heavy lyric upgrades off the input frame');
  }
  if (
    !/function canResumePausedAudioFast/.test(controlsText) ||
    !/function resumePausedAudioFast/.test(controlsText) ||
    !/function schedulePausedAudioResumeMaintenance/.test(controlsText) ||
    !/var fastResume = await resumePausedAudioFast\(opts\);[\s\S]{0,80}if \(fastResume === true\) return true;[\s\S]{0,140}if \(!audioGraphHealthy\(\)\) initAudio\(\);/.test(controlsText) ||
    !/restorePlaybackGain\(\);[\s\S]{0,120}await awaitMediaPlayWithTimeout\(media, media\.play\(\), token\);/.test(controlsText) ||
    !/setTimeout\(async function \(\) \{[\s\S]{0,240}ensurePlaybackAudioGraph\(\(reason \|\| 'manual-resume-fast'\) \+ '-deferred-graph'\)/.test(controlsText)
  ) {
    fail('space/button pause resume must use a fast paused-audio path and defer graph maintenance off the input frame');
  }
  console.log('[OK] Lyric scrolling keeps one persistent whole-song text runway, bounded effect layers, realtime continuous drag, and warm lyric activation.');
}

function checkPersistentCacheStorageGuard() {
  logStep('Persistent cache storage guard');
  const mainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
  const preloadText = fs.readFileSync(path.join(appRoot, 'desktop', 'preload.js'), 'utf8');
  const lyricText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '00-lyrics-fetch-parse.js'), 'utf8');
  const loaderText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'index-loader.js'), 'utf8');
  const cacheUiText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '08-cache-storage-settings.js'), 'utf8');
  const htmlText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const setNameAt = mainText.indexOf('app.setName(APP_NAME)');
  const firstUserDataLookupAt = mainText.indexOf("app.getPath('appData')");
  if (!/const CACHE_SETTINGS_FILE/.test(mainText) || !/const LYRIC_CACHE_MAX_BYTES = 96 \* 1024 \* 1024/.test(mainText) || !/function defaultCacheRootPath\(\)/.test(mainText) || !/path\.join\(dDrive, 'MineradioCache'\)/.test(mainText) || setNameAt < 0 || firstUserDataLookupAt < 0 || setNameAt > firstUserDataLookupAt || !/const STABLE_USER_DATA_PATH = STARTUP_QA_USER_DATA_PATH \|\| path\.join\(app\.getPath\('appData'\), APP_NAME\)/.test(mainText) || !/app\.setPath\('userData', STABLE_USER_DATA_PATH\)/.test(mainText) || !/app\.setPath\('sessionData', chromiumSessionDataPath\(cacheSettings\)\)/.test(mainText) || !/const currentChromiumPath = app\.getPath\('sessionData'\)/.test(mainText) || !/MINERADIO_BEAT_CACHE_DIR = cacheSettings\.beatmapsPath/.test(mainText) || !/nativePath:\s*path\.join\(rootPath, 'native-helper-temp'\)/.test(mainText) || !/const NATIVE_HELPER_TEMP_PATH = INITIAL_CACHE_SETTINGS\.nativePath/.test(mainText) || !/activeWallpaperEnginePath/.test(mainText) || !/wallpaperEngineBytes/.test(mainText)) {
    fail('desktop cache settings must keep app-owned userData stable and route Chromium sessionData plus beatmaps to the configurable cache root');
  }
  if (!/function migrateMisplacedAppOwnedFiles\(\)/.test(mainText) || !/APP_OWNED_MIGRATION_FILES/.test(mainText) || !/process\.env\.QISHUI_COOKIE_FILE = path\.join\(STABLE_USER_DATA_PATH, '\.qishui-cookie'\)/.test(mainText) || !/process\.env\.SPOTIFY_TOKEN_FILE = path\.join\(STABLE_USER_DATA_PATH, '\.spotify-token\.json'\)/.test(mainText)) {
    fail('provider credentials must migrate out of the old Chromium cache path and remain under stable userData');
  }
  if (!/mineradio-cache-get-settings/.test(mainText) || !/mineradio-cache-set-settings/.test(mainText) || !/mineradio-cache-read-lyric/.test(mainText) || !/mineradio-cache-write-lyric/.test(mainText) || !/crypto\.createHash\('sha256'\)/.test(mainText) || !/pruneLyricCache/.test(mainText)) {
    fail('desktop cache storage must expose configurable paths and bounded hashed lyric persistence');
  }
  if (!/getCacheSettings:/.test(preloadText) || !/setCacheSettings:/.test(preloadText) || !/readLyricCache:/.test(preloadText) || !/writeLyricCache:/.test(preloadText)) {
    fail('renderer cache controls must be exposed through the desktop preload bridge');
  }
  const playbackStartText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '13-playback-start-audio.js'), 'utf8');
  if (!/function persistentLyricCacheKey/.test(lyricText) || !/await readPersistentLyricCache\(song\)/.test(lyricText) || !/refreshPersistentLyricCache\(song\)/.test(lyricText) || !/writePersistentLyricCache\(song, mergedResponse\)/.test(lyricText) || !/function scheduleQueueLyricPrefetch/.test(lyricText) || !/function runQueueLyricPrefetch/.test(lyricText) || !/scheduleQueueLyricPrefetch\(idx, 2400\)/.test(playbackStartText)) {
    fail('lyrics must read persistent cache before network fetch, refresh it without blocking playback, and prefetch the next queue lyric');
  }
  if (!/07-fx\/08-cache-storage-settings\.js/.test(loaderText) || !/cache-storage-panel/.test(htmlText) || !/cache-storage-lyrics-size/.test(htmlText) || !/cache-storage-chromium-size/.test(htmlText) || !/cache-storage-beatmaps-size/.test(htmlText) || !/cache-storage-wallpaper-size/.test(htmlText) || !/cache-storage-userdata-size/.test(htmlText) || !/cache-storage-beatmaps-path/.test(cacheUiText) || !/cache-storage-wallpaper-path/.test(cacheUiText) || !/function chooseMineradioCacheRoot/.test(cacheUiText) || !/function refreshMineradioCacheSettings/.test(cacheUiText) || !/\.cache-storage-panel/.test(cssText) || /cache-storage-updates-(?:path|size)/.test(htmlText + cacheUiText)) {
    fail('advanced settings must show configurable cache paths and their current usage');
  }
  console.log('[OK] Persistent lyric and application cache paths are configurable and report current usage.');
}

function checkExternalUpdatePageBridgeGuard() {
  logStep('External update page bridge guard');
  const regression = spawnSync(process.execPath, ['--test',
    path.join(appRoot, 'tests', 'update-external-only.test.js'),
    path.join(appRoot, 'tests', 'update-download-link-rotation.test.js')
  ], { cwd: appRoot, encoding: 'utf8' });
  if (regression.status !== 0) {
    process.stdout.write(regression.stdout || '');
    process.stderr.write(regression.stderr || '');
    fail('external update link rotation regression failed');
  }
  process.stdout.write(regression.stdout || '');
  const mainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
  const preloadText = fs.readFileSync(path.join(appRoot, 'desktop', 'preload.js'), 'utf8');
  const serverText = fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8');
  const updateUiText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '00-update-preview.js'), 'utf8');
  const bridgeText = mainText + '\n' + preloadText;
  if (
    !/ipcMain\.handle\('mineradio-open-update-page', async \(event, value\) =>/.test(mainText)
    || !/isTrustedMainWindowIpc\(event\)/.test(mainText)
    || !/target\.length > 2048/.test(mainText)
    || !/parsed\.protocol !== 'https:'/.test(mainText)
    || !/await shell\.openExternal\(parsed\.href\)/.test(mainText)
    || !/openUpdatePage: \(url\) => ipcRenderer\.invoke\('mineradio-open-update-page'/.test(preloadText)
  ) {
    fail('desktop update bridge must open only bounded HTTPS pages from the trusted main document');
  }
  if (/mineradio-open-update-installer|openUpdateInstaller|getUpdateDownloadDir|MINERADIO_UPDATE_DIR/.test(bridgeText)) {
    fail('desktop update bridge must not expose the removed local installer or update-cache path');
  }
  if (
    !/mineradio-download-page/.test(serverText)
    || !/extractReleaseDownloadPages/.test(serverText)
    || !/downloadPages/.test(serverText)
    || !/error:\s*'UPDATE_EXTERNAL_ONLY'/.test(serverText)
    || !/openUpdateDownloadSource/.test(updateUiText)
    || !/update-download-source/.test(updateUiText)
    || !/desktopWindow\.openUpdatePage\(target\)/.test(updateUiText)
    || !/软件不会在本地下载或应用补丁/.test(updateUiText)
  ) {
    fail('updates must resolve to an external download page and keep legacy local routes disabled');
  }
  if (
    /startUpdateDownloadJob|startUpdatePatchJob|updateDownloadJobs|UPDATE_DOWNLOAD_DIR|pickPatchAsset/.test(serverText)
    || /\/api\/update\/(?:download|patch)|openUpdateInstaller|快速补丁/.test(updateUiText)
  ) {
    fail('local installer download and quick-patch workers must remain removed');
  }
  console.log('[OK] Updates use a trusted HTTPS-only external-page bridge with no local installer path.');
}

function checkLyricTranslationCompletenessGuard() {
  logStep('Netease lyric translation guard');
  const serverText = fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8');
  const lyricText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '00-lyrics-fetch-parse.js'), 'utf8');
  if (!/lyricBodyHasTranslation/.test(serverText) || !/mergeLyricBodies/.test(serverText) || !/ytlrc/.test(serverText)) {
    fail('server /api/lyric must merge legacy lyric translations and return ytlrc');
  }
  if (!/buildLyricTranslationPayload/.test(lyricText) || !/response\.ytlrc/.test(lyricText) || !/translationMatch/.test(lyricText) || !/lyricTranslationTextFromAliases/.test(lyricText) || !/source\.trans/.test(lyricText) || !/hasInterleavedText/.test(lyricText)) {
    fail('frontend lyric parser must merge tlyric/trans/ytlrc and keep order fallback metadata');
  }
  if (!/isLyricCreditLineText/.test(lyricText) || !/orderedPrimaryIndexes/.test(lyricText)) {
    fail('frontend lyric parser must skip singer/credit lines when attaching translated lyrics');
  }
  if (!/function scheduleNeteaseLyricTranslationFallback/.test(lyricText) || !/function findNeteaseLyricFallbackCandidate/.test(lyricText) || !/songProviderKey\(song\) === 'netease'/.test(lyricText) || !/requestIdleCallback/.test(lyricText) || !/mergeInlineLyricResponseForSong/.test(lyricText)) {
    fail('non-Netease providers must asynchronously reuse the Netease translation merge path without blocking primary lyric paint');
  }
  console.log('[OK] Netease tlyric/ytlrc translation merge is guarded.');
}

function checkLyricVerticalFloatToggleGuard() {
  logStep('Lyric vertical float toggle guard');
  const htmlText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const defaultsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '04-fx-defaults.js'), 'utf8');
  const persistenceText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '04-visual-settings-persistence.js'), 'utf8');
  const archiveText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '00-preset-archive-data.js'), 'utf8');
  const panelText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '05-fx-panel-performance.js'), 'utf8');
  const bindingText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '07-bindings-shelf-immersive.js'), 'utf8');
  const stageText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '14-stage-lyrics-rendering.js'), 'utf8');
  const rowText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '12-lyrics-row-layers.js'), 'utf8');
  if (!/lyricVerticalFloat:\s*true/.test(defaultsText) || !/id="t-lyricVerticalFloat"/.test(htmlText) || !/toggleFx\('lyricVerticalFloat'\)/.test(htmlText)) {
    fail('lyric vertical float toggle must exist in defaults and UI');
  }
  if (!/lyricVerticalFloat: raw\.lyricVerticalFloat !== false/.test(persistenceText) || !/lyricVerticalFloat: fx\.lyricVerticalFloat !== false/.test(persistenceText) || !/'lyricVerticalFloat'/.test(archiveText)) {
    fail('lyric vertical float toggle must persist through autosave and preset archive');
  }
  if (!/t-lyricVerticalFloat/.test(panelText) || !/key === 'lyricVerticalFloat'/.test(bindingText) || !/歌词上下浮动已/.test(bindingText)) {
    fail('lyric vertical float toggle must sync panel state and show toggle feedback');
  }
  if (!/function lyricVerticalFloatEnabled/.test(stageText) || !/var lyricFloatAmp = verticalFloatOn \?/.test(stageText) || !/style === 'float' && verticalFloatOn/.test(stageText)) {
    fail('stage lyric renderer must gate vertical float/breathing on the toggle');
  }
  if (!/var previewMotionLock = opts\.previewMotionLock === true/.test(rowText) || !/var verticalFloatOn = !previewMotionLock/.test(rowText) || !/motionAnchor \|\| !verticalFloatOn/.test(rowText) || !/var rowDrift = previewMotionLock \? 0 :/.test(rowText) || !/verticalFloatOn \? \(isActive \? jitterY/.test(rowText)) {
    fail('row lyric layers must also stop vertical jitter when the toggle is off');
  }
  console.log('[OK] Lyric vertical float toggle is wired through UI, persistence, archive, and render layers.');
}

function checkQishuiProviderGuard() {
  logStep('Qishui provider guard');
  const qishuiText = fs.readFileSync(path.join(appRoot, 'qishui-api.js'), 'utf8');
  const serverText = fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const coreStoreText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '00-core-stores.js'), 'utf8');
  const playlistShellText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '01-playlist-panel-shell.js'), 'utf8');
  const playlistDetailText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '02-playlist-detail.js'), 'utf8');
  const playlistLoadText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '03-podcast-playlist-loaders.js'), 'utf8');
  const shelfCoreText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '04-shelf', '01-manager-core.js'), 'utf8');
  const shelfContentText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '04-shelf', '03-content-list-manager.js'), 'utf8');
  const homeText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '03-home-discover-weather.js'), 'utf8');
  const qishuiLoginText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '03-login-modal-flows.js'), 'utf8');
  const qishuiStatusText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '02-login-status.js'), 'utf8');
  const accountLogoutText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '04-user-modal-logout.js'), 'utf8');
  const desktopMainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
  const desktopPreloadText = fs.readFileSync(path.join(appRoot, 'desktop', 'preload.js'), 'utf8');
  const qishuiPassportText = fs.readFileSync(path.join(appRoot, 'qishui-auth-v6.js'), 'utf8');
  const qishuiQrBridgeText = fs.readFileSync(path.join(appRoot, 'qishui-qr-login.js'), 'utf8');
  const indexText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  if (!/QISHUI_PUBLIC_SEARCH_URL/.test(qishuiText) || !/api-vehicle\.volcengine\.com\/v2\/search\/type/.test(qishuiText) || !/function handleQishuiPublicSearch/.test(qishuiText)) {
    fail('Qishui must keep a public search fallback so the provider is usable before OAuth credentials are bundled');
  }
  if (!/QISHUI_PUBLIC_CONTENTS_URL/.test(qishuiText) || !/api-vehicle\.volcengine\.com\/v2\/custom\/contents/.test(qishuiText) || !/function fetchQishuiPublicDetail/.test(qishuiText)) {
    fail('Qishui lyric/detail fallback must stay available for public search results');
  }
  if (/vsaa\.cn|QISHUI_VIP_PROXY|music\.qishui\.vip/.test(qishuiText)) {
    fail('Qishui playback must not depend on third-party VIP/proxy endpoints');
  }
  if (!/search: tokenConfigured \|\| webSession \|\| QISHUI_PUBLIC_ENABLED/.test(qishuiText) || !/loggedIn: webSession/.test(qishuiText) || !/请使用抖音 App 扫描 Mineradio 中的汽水官方二维码/.test(qishuiText)) {
    fail('Qishui status must keep public catalogue readiness separate from an authenticated Passport Web session');
  }
  const oldQishuiCredentialPrompt = new RegExp('当前版本还没有内置' + '抖音开放平台应用凭证');
  if (!/function qishuiPublicSearchReady/.test(qishuiLoginText) || !/function openQishuiPublicSearch/.test(qishuiLoginText) || !/refreshBtn\.onclick = isQishui \? openQishuiWebLogin :/.test(qishuiLoginText) || oldQishuiCredentialPrompt.test(qishuiLoginText)) {
    fail('Qishui login modal must retain public search separately from official Passport QR authentication');
  }
  if (!/searchReady/.test(qishuiStatusText) || !/capabilities\.search/.test(qishuiStatusText)) {
    fail('Qishui frontend status must expose public search readiness separately from OAuth login');
  }
  if (!/require\('\.\/qishui-qr-login'\)/.test(serverText) || !/\/api\/qishui\/login\/qrcode/.test(serverText) || !/\/api\/qishui\/login\/check/.test(serverText) || /pn === '\/api\/qishui\/login\/(?:token|cookie)'/.test(serverText)) {
    fail('Qishui login server must expose only the signed Passport QR create/check boundary');
  }
  if (!/persist:mineradio-qishui-auth-v6/.test(qishuiPassportText) || !/a_bogus/.test(qishuiPassportText) || !/check_qrconnect/.test(qishuiPassportText) || !/secondVerify/.test(qishuiPassportText) || !/createQishuiQrLoginBridge/.test(qishuiQrBridgeText)) {
    fail('Qishui Passport QR must retain the isolated signing runtime, a_bogus validation, polling, persistence, and MFA bridge');
  }
  if (!/pollQishuiQr/.test(qishuiLoginText) || !/请使用抖音 App 扫码并确认登录/.test(qishuiLoginText) || /读取本机汽水|本机会话|Token 导入|submitQishuiTokenLogin|openQishuiMusicLogin/.test(qishuiLoginText)) {
    fail('Qishui login UI must use only the official in-panel QR flow');
  }
  if (/ipcMain\.handle\('qishui-music-open-login'/.test(desktopMainText) || /openQishuiMusicLogin/.test(desktopPreloadText) || !/await qishuiQrLogin\.clear\(\)/.test(desktopMainText)) {
    fail('Qishui desktop bridge must remove the old login-window IPC and await Passport partition cleanup');
  }
  if (!/汽水音乐已扫码登录/.test(accountLogoutText) || !/按账号权益播放/.test(accountLogoutText) || /本机汽水会话|OpenAPI token/.test(accountLogoutText)) {
    fail('Qishui account status must describe the official QR session without exposing legacy import modes');
  }
  if (!/官方扫码 \/ 抖音确认/.test(indexText) || /本地会话 \/ PC 客户端/.test(indexText)) {
    fail('Qishui login node must identify the official QR flow');
  }
  if (!/\/luna\/pc\/me/.test(qishuiText) || !/\/luna\/pc\/user\/playlist/.test(qishuiText) || !/\/luna\/pc\/playlist\/detail/.test(qishuiText) || !/function qishuiPcAppParams/.test(qishuiText) || !/pcApp: true/.test(qishuiText) || !/count: Math\.min\(100/.test(qishuiText) || /\/luna\/pc\/playlist\/detail[\s\S]{0,260}cnt:/.test(qishuiText)) {
    fail('Qishui playlist sync must use PC app APIs with user playlist, count/next_cursor, and LunaPC headers');
  }
  if (!/function qishuiImageUrl/.test(qishuiText) || !/~c5_375x375\.jpg/.test(qishuiText) || !/~c5_300x300\.jpg/.test(qishuiText) || !/directPlayable: true/.test(qishuiText)) {
    fail('Qishui playlist tracks must build full urls+uri covers and mark PC-session tracks as directly playable');
  }
  if (!/\/luna\/pc\/track_v2/.test(qishuiText) || !/function fetchQishuiPcTrackV2/.test(qishuiText) || !/function resolveQishuiDownloadInfo/.test(qishuiText) || !/play_info_list/.test(qishuiText) || !/url_player_info/.test(qishuiText) || !/video_model/.test(qishuiText)) {
    fail('Qishui playback must resolve PC track_v2 audio from play_info_list, url_player_info, or video_model');
  }
  const qishuiSongRouteStart = serverText.indexOf("if (pn === '/api/qishui/song/url')");
  const qishuiSongRouteEnd = serverText.indexOf("if (pn === '/api/qishui/lyric')", qishuiSongRouteStart);
  const qishuiSongRouteText = serverText.slice(qishuiSongRouteStart, qishuiSongRouteEnd);
  if (qishuiSongRouteStart < 0 || qishuiSongRouteEnd <= qishuiSongRouteStart ||
      !/handleQishuiSongUrl\(\{/.test(qishuiSongRouteText) ||
      !/quality: url\.searchParams\.get\('quality'\)/.test(qishuiSongRouteText) ||
      !/\}, qishuiCookie\)/.test(qishuiSongRouteText)) {
    fail('server.js must pass the saved Qishui cookie into /api/qishui/song/url');
  }
  if (!/TrackDecryptor/.test(serverText) || !/qishui-audio-decryptor/.test(serverText) || !/function getQishuiDecryptedAudio/.test(serverText) || !/audioUrl\.includes\('#auth='\)/.test(serverText) || !/sendAudioBuffer/.test(serverText)) {
    fail('Qishui encrypted #auth audio must be decrypted by /api/audio with Range support');
  }
  if (!/function handleQishuiUserPlaylists/.test(qishuiText) || !/function handleQishuiPlaylistTracks/.test(qishuiText) || !/QISHUI_VIRTUAL_FEED_PLAYLIST_ID/.test(qishuiText) || !/userPlaylists: configured/.test(qishuiText)) {
    fail('Qishui must expose a login-backed virtual playlist for the normal playlist/shelf pipeline');
  }
  const webLibraryStart = qishuiText.indexOf('async function fetchQishuiWebLibrary');
  const webLibraryEnd = qishuiText.indexOf('\nasync function handleQishuiStatus', webLibraryStart);
  const webLibraryText = qishuiText.slice(webLibraryStart, webLibraryEnd);
  if (webLibraryStart < 0 || webLibraryEnd <= webLibraryStart || !/if \(\/created\|collection\|collect\/i\.test\(label\)\)/.test(webLibraryText) || !/extractQishuiPlaylistCards\(json\)/.test(webLibraryText)) {
    fail('Qishui library sync must only extract playlist cards from created/collection responses, never profile or recent-track payloads');
  }
  if (!/async function handleQishuiSearch\(keywords, limit, cookieText, offset\)/.test(qishuiText) || !/handleQishuiStatus\(cookieText\)/.test(qishuiText) || !/qishuiCookieFingerprint\(cookieText\)/.test(qishuiText) || !/handleQishuiSearch\(kw, limit, qishuiCookie, offset\)/.test(serverText)) {
    fail('Qishui search status and cache keys must use the saved web-session cookie');
  }
  if (!/function fetchQishuiWebLibraryFeedFallback/.test(qishuiText) || !/qishui-web-library-fallback/.test(qishuiText) || !/fetchQishuiWebPlaylistTracks\(pl\.id/.test(qishuiText)) {
    fail('Qishui web feed must fall back to liked/recent/playlist detail when the upstream feed endpoint returns 404');
  }
  if (!/function handleQishuiStatus/.test(qishuiText) || !/my_info/.test(qishuiText) || !/profileReady/.test(qishuiText) || !/handleQishuiStatus\(qishuiCookie\)/.test(serverText)) {
    fail('Qishui status must read the real PC account profile from /luna/pc/me my_info');
  }
  if (!/likedCard\.trackCount/.test(qishuiText) || !/likedCard\.cover/.test(qishuiText) || !/profile\.nickname/.test(qishuiText)) {
    fail('Qishui liked playlist must keep the real liked-card cover/count and account creator while deferring detail loading');
  }
  if (!/\/api\/qishui\/user\/playlists/.test(serverText) || !/\/api\/qishui\/playlist\/tracks/.test(serverText)) {
    fail('server.js must route Qishui user playlists and playlist track detail endpoints');
  }
  if (!/qishuiPlaylists/.test(coreStoreText) || !/if \(provider === 'qishui'\) return '\/api\/qishui\/user\/playlists'/.test(playlistShellText) || !/builtInPlaylists\.concat\(neteasePlaylists, qqPlaylists, kugouPlaylists, qishuiPlaylists, spotifyPlaylists\)/.test(playlistShellText)) {
    fail('playlist panel refresh must merge Qishui playlists with the other providers');
  }
  if (!/normalizePlaylistProvider/.test(playlistDetailText) || !/\/api\/qishui\/playlist\/tracks/.test(playlistDetailText) || !/qishui:' \+ id/.test(playlistDetailText) || !/汽水音乐歌单/.test(playlistDetailText)) {
    fail('playlist panel detail must open and play Qishui playlists via the Qishui endpoint');
  }
  if (!/function playlistQueueSource/.test(playlistLoadText) || !/raw\.indexOf\('qishui:'\)/.test(playlistLoadText) || !/playlistTracksEndpoint\(source\.provider/.test(playlistLoadText)) {
    fail('whole-playlist queue loading must support qishui: playlist ids');
  }
  if (!/provider === 'qishui'/.test(shelfCoreText) || !/qishui:'/.test(shelfCoreText) || !/\/api\/qishui\/playlist\/tracks/.test(shelfContentText)) {
    fail('3D shelf must display and drill into Qishui playlists through the Qishui endpoint');
  }
  if (!/网易云 \/ QQ \/ 酷狗 \/ 汽水/.test(homeText) || !/hasAnyPlatformLogin\(\)/.test(homeText) || /网易云 \/ QQ 音乐/.test(homeText)) {
    fail('Home discover must acknowledge Qishui/Kugou login playlists instead of only Netease/QQ');
  }
  if (!/lyric-glow-enable-btn/.test(indexText) || !/lyric-glow-beat-btn/.test(indexText)) {
    fail('Lyric glow back-layer controls must stay visible in the lyric appearance panel');
  }
  console.log('[OK] Qishui search/lyric fallback stays usable without third-party playback proxy.');
}

async function checkSpotifyProviderGuard() {
  logStep('Spotify provider guard');
  const spotifyPath = path.join(appRoot, 'spotify-api.js');
  if (!fs.existsSync(spotifyPath)) fail('spotify-api.js must exist as a backend-only Spotify Web API bridge');
  const spotifyText = fs.readFileSync(spotifyPath, 'utf8');
  const serverText = fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8');
  const indexText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const coreStoreText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '00-core-stores.js'), 'utf8');
  const qualityText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '00-api-quality-output.js'), 'utf8');
  const searchText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '07-search.js'), 'utf8');
  const playbackText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '13-playback-start-audio.js'), 'utf8');
  const fallbackText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '11-provider-fallback.js'), 'utf8');
  const lyricText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '00-lyrics-fetch-parse.js'), 'utf8');
  const playlistShellText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '01-playlist-panel-shell.js'), 'utf8');
  const playlistDetailText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '02-playlist-detail.js'), 'utf8');
  const playlistLoadText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '03-podcast-playlist-loaders.js'), 'utf8');
  const shelfCoreText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '04-shelf', '01-manager-core.js'), 'utf8');
  const shelfContentText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '04-shelf', '03-content-list-manager.js'), 'utf8');
  const loginStatusText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '02-login-status.js'), 'utf8');
  const loginFlowText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '03-login-modal-flows.js'), 'utf8');
  const userModalText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '04-user-modal-logout.js'), 'utf8');
  const desktopMainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
  const desktopPreloadText = fs.readFileSync(path.join(appRoot, 'desktop', 'preload.js'), 'utf8');
  const queueText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '09-queue-snapshot-autoplay.js'), 'utf8');
  const packageText = fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8');
  const internalBuilderText = fs.readFileSync(path.join(appRoot, 'electron-builder.internal-beta.json'), 'utf8');
  const gitignoreText = fs.readFileSync(path.join(appRoot, '.gitignore'), 'utf8');
  if (!/SPOTIFY_SEARCH_LIMIT_MAX\s*=\s*10/.test(spotifyText) || !/client_credentials/.test(spotifyText) || !/SPOTIFY_CLIENT_ID/.test(spotifyText) || !/SPOTIFY_CLIENT_SECRET/.test(spotifyText) || !/cleanPath/.test(spotifyText)) {
    fail('Spotify bridge must use backend client credentials and keep the official search limit guard');
  }
  if (!/playbackMode:\s*'recommend-match'/.test(spotifyText) || !/provider_limited/.test(spotifyText) || !/handleSpotifySongUrl/.test(spotifyText) || !/handleSpotifyLyric/.test(spotifyText)) {
    fail('Spotify must stay a metadata/search match source, not a fake direct audio provider');
  }
  if (!/require\('\.\/spotify-api'\)/.test(serverText) || !/\/api\/spotify\/status/.test(serverText) || !/\/api\/spotify\/config/.test(serverText) || !/\/api\/spotify\/setup\/diagnostics/.test(serverText) || !/\/api\/spotify\/search/.test(serverText) || !/\/api\/spotify\/song\/url/.test(serverText) || !/\/api\/spotify\/lyric/.test(serverText)) {
    fail('server.js must route Spotify status/config/setup diagnostics/search/song-url/lyric through the backend bridge');
  }
  if (!/search-mode-spotify/.test(indexText) || !/tag-source\.spotify/.test(cssText) || !/spotify-source/.test(cssText)) {
    fail('Spotify search tab and source badges must be visible in the UI');
  }
  if (!/PLAYBACK_QUALITY_DEFAULTS[\s\S]*spotify:\s*'standard'/.test(coreStoreText) || !/spotify:\s*\[[\s\S]*Spotify/.test(coreStoreText)) {
    fail('Spotify must be represented as a standard match-source quality option');
  }
  if (!/provider === 'spotify'/.test(qualityText) || !/Spotify/.test(qualityText) || !/return 'SP'/.test(qualityText)) {
    fail('playback quality UI must label Spotify as a match source');
  }
  if (!/search-mode-spotify/.test(searchText) || !/songProviderKey\(song\)[\s\S]*spotify/.test(searchText) || !/\/api\/spotify\/search/.test(searchText) || !/mergeSongSearchResults\(neteaseSongs, qqSongs, kugouSongs, qishuiSongs, spotifySongs/.test(searchText)) {
    fail('frontend search must include Spotify in tabs, source tags, provider search, and All merge');
  }
  if (!/\/api\/spotify\/song\/url/.test(playbackText) || !/isSpotifyPlayback/.test(playbackText) || !/provider_limited/.test(fallbackText)) {
    fail('Spotify playback must flow through provider_limited auto source fallback');
  }
  if (!/\/api\/spotify\/lyric/.test(lyricText)) {
    fail('Spotify lyric endpoint must return a safe empty lyric response for the shared lyric pipeline');
  }
  if (!/spotifyId/.test(queueText) || !/spotifyUri/.test(queueText) || !/spotifyUrl/.test(queueText)) {
    fail('Spotify queue snapshots must preserve provider ids and uri fields');
  }
  if (!/getSpotifyOAuthConfig/.test(spotifyText) || !/saveSpotifyConfig/.test(spotifyText) || !/buildSpotifyOAuthAuthorizeUrl/.test(spotifyText) || !/exchangeSpotifyOAuthCode/.test(spotifyText) || !/handleSpotifyStatus/.test(spotifyText) || !/handleSpotifyUserPlaylists/.test(spotifyText) || !/handleSpotifyPlaylistTracks/.test(spotifyText)) {
    fail('Spotify bridge must expose OAuth status plus playlist and liked-track handlers');
  }
  if (!/user-read-private/.test(spotifyText) || !/user-library-read/.test(spotifyText) || !/playlist-read-private/.test(spotifyText) || !/SPOTIFY_LIKED_PLAYLIST_ID/.test(spotifyText) || !/\/me\/tracks/.test(spotifyText) || !/\/me\/playlists/.test(spotifyText) || !/\/me/.test(spotifyText)) {
    fail('Spotify OAuth must request profile, private playlists, and Liked Songs scopes/endpoints');
  }
  if (!/Number\(item\.items && item\.items\.total\) \|\| Number\(item\.tracks && item\.tracks\.total\)/.test(spotifyText) || !/\/playlists\/['"]? \+ encodeURIComponent\(playlistId\) \+ ['"]?\/items/.test(spotifyText) || !/entry && \(entry\.item \|\| entry\.track\)/.test(spotifyText) || !/item\.type !== 'track'/.test(spotifyText) || !/Math\.min\(SPOTIFY_PLAYLIST_PAGE_LIMIT, Number\(opts\.limit\)/.test(spotifyText) || !/SPOTIFY_PLAYLIST_ITEMS_RESTRICTED/.test(spotifyText) || !/SPOTIFY_PLAYLIST_SCOPE_REQUIRED/.test(spotifyText)) {
    fail('Spotify playlist sync must use the 2026 /items response, keep legacy item compatibility, cap pages at 50, and explain owner/collaborator restrictions');
  }
  if (/spotifyUserGet\('\/playlists\/' \+ encodeURIComponent\(playlistId\) \+ '\/tracks'/.test(spotifyText)) {
    fail('Spotify playlist detail must not call the removed /playlists/{id}/tracks endpoint');
  }
  const mapPlaylistStart = spotifyText.indexOf('function mapSpotifyPlaylist');
  const mapPlaylistEnd = spotifyText.indexOf('\nasync function buildSpotifyLikedPlaylistCard', mapPlaylistStart);
  const mapPlaylistSandbox = {
    normalizeText: value => String(value || '').trim(),
    spotifyImage: images => Array.isArray(images) && images[0] && images[0].url || '',
    Number,
  };
  vm.runInNewContext(spotifyText.slice(mapPlaylistStart, mapPlaylistEnd), mapPlaylistSandbox, { filename: 'spotify-playlist-map.js' });
  const mappedPlaylist = mapPlaylistSandbox.mapSpotifyPlaylist({
    id: 'owned-playlist',
    name: 'Owned',
    owner: { id: 'listener' },
    items: { total: 321 },
    tracks: { total: 0 },
  }, { id: 'listener' });
  if (!mappedPlaylist || mappedPlaylist.trackCount !== 321 || mappedPlaylist.subscribed) {
    fail('Spotify playlist cards must read items.total and preserve owned-playlist classification');
  }
  const detailStart = spotifyText.indexOf('async function handleSpotifyPlaylistTracks');
  const detailEnd = spotifyText.indexOf('\nasync function handleSpotifyAlbumDetail', detailStart);
  let requestedPath = '';
  let requestedParams = null;
  let responseItem = { item: { id: 'new-track', name: 'New Track' } };
  const detailSandbox = {
    normalizeText: value => String(value || '').trim(),
    handleSpotifyStatus: async () => ({ loggedIn: true, market: 'US' }),
    spotifyUserGet: async (requestPath, params) => {
      requestedPath = requestPath;
      requestedParams = params;
      return { items: [responseItem], total: 1, next: null };
    },
    mapSpotifyTrack: track => track ? { id: track.id, name: track.name } : null,
    spotifyErrorDetails: error => ({ error: error && error.message || 'FAILED', message: '' }),
    readStoredSpotifyToken: () => ({ scope: 'playlist-read-private playlist-read-collaborative' }),
    normalizeScopes: value => String(value || '').split(/\s+/).filter(Boolean),
    SPOTIFY_PLAYLIST_PAGE_LIMIT: 50,
    SPOTIFY_LIKED_PLAYLIST_ID: 'spotify-liked',
    DEFAULT_SPOTIFY_MARKET: 'US',
    Math,
    Number,
    Object,
    encodeURIComponent,
  };
  vm.runInNewContext(spotifyText.slice(detailStart, detailEnd), detailSandbox, { filename: 'spotify-playlist-items.js' });
  let detail = await detailSandbox.handleSpotifyPlaylistTracks('owned-playlist', { limit: 96, offset: 0 });
  if (requestedPath !== '/playlists/owned-playlist/items' || !requestedParams || requestedParams.limit !== 50 || !detail.tracks[0] || detail.tracks[0].id !== 'new-track') {
    fail('Spotify playlist detail must request /items with a 50-row page and map entry.item');
  }
  responseItem = { track: { id: 'legacy-track', name: 'Legacy Track' } };
  detail = await detailSandbox.handleSpotifyPlaylistTracks('legacy-playlist', { limit: 1, offset: 0 });
  if (!detail.tracks[0] || detail.tracks[0].id !== 'legacy-track') {
    fail('Spotify playlist detail must retain compatibility with legacy entry.track payloads');
  }
  if (!/\/api\/spotify\/logout/.test(serverText) || !/\/api\/spotify\/user\/playlists/.test(serverText) || !/\/api\/spotify\/playlist\/tracks/.test(serverText)) {
    fail('server.js must route Spotify logout, user playlists, and playlist track detail endpoints');
  }
  if (!/SPOTIFY_LOGIN_PARTITION/.test(desktopMainText) || !/openSpotifyMusicLoginWindow/.test(desktopMainText) || !/verifySpotifyOAuthCallbackEndpoint/.test(desktopMainText) || !/spotify-music-open-login/.test(desktopMainText) || !/spotify-music-verify-setup/.test(desktopMainText) || !/shell\.openExternal\(authUrl\)/.test(desktopMainText) || !/SPOTIFY_OAUTH_TIMEOUT_MS/.test(desktopMainText) || !/SPOTIFY_TOKEN_FILE/.test(desktopMainText) || !/127\.0\.0\.1:43879\/callback/.test(spotifyText + desktopMainText)) {
    fail('desktop main must provide system-browser PKCE, a verified loopback callback, bounded timeout, and userData token storage');
  }
  if (!/openSpotifyMusicLogin/.test(desktopPreloadText) || !/verifySpotifyMusicSetup/.test(desktopPreloadText) || !/clearSpotifyMusicLogin/.test(desktopPreloadText)) {
    fail('desktop preload must expose Spotify login, callback verification, and clear-login IPC bridges');
  }
  if (!/login-provider-spotify/.test(indexText) || !/user-provider-spotify/.test(indexText) || !/account-add-spotify/.test(indexText) || !/account-source-dot\.spotify/.test(cssText) || !/account-provider-chip\.spotify/.test(cssText)) {
    fail('Spotify login and account tabs must be visible in the UI');
  }
  if (!/spotifyLoginStatus/.test(coreStoreText) || !/spotifyPlaylists/.test(coreStoreText) || !/refreshSpotifyLoginStatus/.test(loginStatusText) || !/openSpotifyWebLogin/.test(loginFlowText) || !/clearSpotifyMusicLogin/.test(userModalText)) {
    fail('frontend account state must include Spotify status, OAuth flow, playlists, and logout');
  }
  if (!/tokenFileExists/.test(spotifyText) || !/credentialsFileExists/.test(spotifyText) || !/localConfigMissing/.test(spotifyText) || !/fs\.existsSync/.test(spotifyText)) {
    fail('Spotify status must distinguish configured paths from real local token/credential files');
  }
  if (!/localConfigMissing/.test(loginStatusText) || !/tokenFileExists/.test(loginStatusText) || !/credentialsFileExists/.test(loginStatusText) || !/submitSpotifyConfigLogin/.test(loginFlowText) || !/saveSpotifySetupClientId/.test(loginFlowText) || !/\/api\/spotify\/config/.test(loginFlowText)) {
    fail('Spotify frontend status must surface missing local OAuth config/token and provide validated Client ID save + OAuth flow');
  }
  if (!/SPOTIFY_DEVELOPER_DASHBOARD_URL/.test(loginFlowText) || !/openSpotifyDeveloperDashboard/.test(loginFlowText) || !/copySpotifyRedirectUri/.test(loginFlowText) || !/verifySpotifySetupCallback/.test(loginFlowText) || !/runSpotifySetupDiagnostics/.test(loginFlowText) || !/spotify-setup-step-1/.test(indexText) || !/spotify-setup-step-4/.test(indexText) || !/spotify-setup-wizard/.test(cssText) || !/spotify-setup-steps/.test(cssText)) {
    fail('Spotify onboarding must provide a spacious four-step wizard with per-step local and API verification');
  }
  if (!/loginRefreshRequestSeq/.test(loginFlowText) || !/isLoginRefreshCurrent/.test(loginFlowText)) {
    fail('login modal provider switching must guard stale async status and QR writes');
  }
  if (!/\/api\/spotify\/user\/playlists/.test(playlistShellText) || !/spotifyPlaylists/.test(playlistShellText) || !/\/api\/spotify\/playlist\/tracks/.test(playlistDetailText) || !/spotify:' \+ id/.test(playlistDetailText) || !/Spotify 歌单/.test(playlistDetailText)) {
    fail('playlist panel must merge and open Spotify playlists');
  }
  if (!/spotifyErrorDetails/.test(spotifyText) || !/playlistPanelNoticeHtml/.test(playlistDetailText) || !/playlistCardPriority/.test(playlistDetailText) || !/spotify-liked/.test(playlistDetailText) || !/prioritizePlaylistGroupItems/.test(playlistDetailText) || !/showToast\(r && \(r\.message \|\| r\.error\) \|\| '歌单为空'\)/.test(playlistLoadText)) {
    fail('Spotify playlists must keep liked songs visible and surface API errors instead of pretending details are empty');
  }
  if (!/function playlistQueueSource/.test(playlistLoadText) || !/raw\.indexOf\('spotify:'\)/.test(playlistLoadText) || !/playlistTracksEndpoint\(source\.provider/.test(playlistLoadText)) {
    fail('whole-playlist queue loading must support spotify: playlist ids');
  }
  if (!/provider === 'spotify'/.test(shelfCoreText) || !/spotify:/.test(shelfCoreText) || !/\/api\/spotify\/playlist\/tracks/.test(shelfContentText)) {
    fail('3D shelf must display and drill into Spotify playlists through the Spotify endpoint');
  }
  if (!/"\*-api\.js"/.test(packageText) || !/"\*-api\.js"/.test(internalBuilderText)) {
    fail('official and internal-beta package file lists must include root provider API modules');
  }
  if (!/\.spotify-credentials\.json/.test(gitignoreText) || !/spotify-credentials\.json/.test(gitignoreText) || !/\.spotify-token\.json/.test(gitignoreText) || !/spotify-token\.json/.test(gitignoreText)) {
    fail('Spotify local credential files must stay ignored by git');
  }
  console.log('[OK] Spotify Web API match source is guarded across backend, UI, playback fallback, lyrics, and packaging.');
}

function checkSpotifyRemovalGuard() {
  logStep('Removed provider surface guard');
  const indexText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const searchText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '07-search.js'), 'utf8');
  const accountText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '01-login-modal-utils.js'), 'utf8');
  const startupText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '10-shell', '05-startup-bindings.js'), 'utf8');
  const serverText = fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8');
  const mainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
  const preloadText = fs.readFileSync(path.join(appRoot, 'desktop', 'preload.js'), 'utf8');
  if (/search-mode-spotify|login-provider-spotify|user-provider-spotify|account-add-spotify|spotify-setup-wizard/.test(indexText)) {
    fail('removed provider must not expose search, login, account, or setup UI');
  }
  if (/MUSIC_SEARCH_PROVIDER_ORDER\s*=\s*\[[^\]]*spotify/.test(searchText) || /ACCOUNT_PROVIDER_KEYS\s*=\s*\[[^\]]*spotify/.test(accountText)) {
    fail('removed provider must not participate in search or account capsule ordering');
  }
  if (/refreshSpotifyLoginStatus\(\)|startSpotifyLoginStatusAutoRefresh\(\)/.test(startupText)) {
    fail('startup must not request removed provider status');
  }
  if (!/PROVIDER_REMOVED/.test(serverText) || !/pn\.indexOf\('\/api\/spotify\/'\) === 0/.test(serverText)) {
    fail('removed provider HTTP routes must terminate with an explicit 404 guard');
  }
  if (/spotify-music-(?:open-login|verify-setup|clear-login)/.test(mainText + '\n' + preloadText)) {
    fail('desktop bridge must not expose removed provider login IPC');
  }
  console.log('[OK] Removed provider has no searchable, login, account-capsule, startup, HTTP, or desktop IPC surface.');
}

function checkPlaybackControlBadgesGuard() {
  logStep('Playback control source/VIP badge guard');
  const indexText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const searchText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '07-search.js'), 'utf8');
  const controlText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '15-ripples-cover-depth.js'), 'utf8');
  const playbackText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '13-playback-start-audio.js'), 'utf8');
  const qualityText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '00-api-quality-output.js'), 'utf8');
  const fallbackText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '11-provider-fallback.js'), 'utf8');
  const switchCoreText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '12-playback-switch-core.js'), 'utf8');
  const lyricFetchText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '00-lyrics-fetch-parse.js'), 'utf8');
  const beatPrefetchText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '03-beat', '00-tempo-worker-cache-prefetch.js'), 'utf8');
  const coreStoreText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '00-core-stores.js'), 'utf8');
  const glassText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '15-control-glass-animations.js'), 'utf8');
  const loginStatusText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '02-login-status.js'), 'utf8');
  const accountUtilsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '01-login-modal-utils.js'), 'utf8');
  const sourceSwitcherGlassOk =
    /\.control-source-switcher::before/.test(cssText) &&
    /html\.control-glass-svg-ok\s+\.control-source-switcher\s*\{[\s\S]{0,180}var\(--saved-panel-glass-filter\)/.test(cssText);
  const sourceSwitcherUsesSharedSvgMap =
    /html\.control-glass-svg-ok[\s\S]{0,1400}\.control-source-switcher,[\s\S]{0,360}var\(--saved-panel-glass-svg-filter\)/.test(cssText) ||
    /html\.control-glass-svg-ok[\s\S]{0,1400}\.control-source-switcher\s*\{[\s\S]{0,240}var\(--saved-panel-glass-svg-filter\)/.test(cssText);
  const sourceSwitcherOriginalMatchOk =
    /SOURCE_SWITCH_BLOCKED_ARTIST_TOKENS\s*=\s*\['asablue'\]/.test(searchText) &&
    /SOURCE_SWITCH_STRICT_ARTIST_ALIASES/.test(searchText) &&
    /function sourceCandidateRejectReason/.test(searchText) &&
    /function findControlSourceMatchResult/.test(searchText) &&
    /function controlSourceIssueLabel/.test(searchText) &&
    /sourceCandidateRejectReason\(song, list\[i\], target\)/.test(fallbackText) &&
    /sourceCandidateRejectReason\(song, candidate, 'netease'\)/.test(lyricFetchText);
  if (!/control-title-text/.test(indexText) || !/control-title-badges/.test(indexText)) {
    fail('bottom player title must reserve inline spans for source and VIP badges');
  }
  const qualityControlCount = (indexText.match(/id="quality-control"/g) || []).length;
  const qualityChipInlineOk =
    qualityControlCount === 1 &&
    /id="control-title"[\s\S]{0,260}id="control-title-badges"[\s\S]{0,260}id="quality-control"\s+class="quality-control control-quality-chip"/.test(indexText) &&
    /\.control-quality-chip\s*\{[\s\S]{0,120}height:\s*15px/.test(cssText) &&
    /#quality-btn\.quality-pill\s*\{[\s\S]{0,220}height:\s*15px[\s\S]{0,120}font-size:\s*8px/.test(cssText) &&
    !/body\.diy-mode\s+#quality-control\s*\{[\s\S]{0,80}display:\s*none\s*!important/.test(cssText);
  if (!qualityChipInlineOk) {
    fail('bottom player quality selector must stay as a compact title-side chip and remain visible in windowed DIY mode');
  }
  if (!/function songRequiresVip/.test(searchText) || !/function songVipTagHtml/.test(searchText) || !/only_vip_playable/.test(searchText)) {
    fail('song VIP detection must cover provider fee, trial, only-vip, and playback restriction metadata');
  }
  if (!/control-title-badges/.test(controlText) || !/songSourceTagHtml\(song, \{ switcher: true \}\)/.test(controlText) || !/songVipTagHtml\(song\)/.test(controlText)) {
    fail('bottom player controls must render the active provider and VIP badges beside the title');
  }
  if (!/song\.resolvedPlaybackProvider/.test(playbackText) || !/song\.vipRequired/.test(playbackText) || !/updateControlTrackInfo\(song\)/.test(playbackText)) {
    fail('playback URL resolution must refresh bottom control badges with provider/VIP state');
  }
  if (!/function playbackRestrictionNotice/.test(fallbackText) || !/function playbackRestrictionCategory/.test(fallbackText) || !/当前平台没有会员状态/.test(fallbackText) || !/showSourceFallbackNotice\(notice\.title, notice\.body\)/.test(fallbackText) || !/function playbackFailureNoticeFromError/.test(switchCoreText)) {
    fail('playback failure notices must distinguish membership, login authorization, provider-limited, copyright, and generic no-url causes');
  }
  if (!/playbackQualityRuntimeCaps/.test(coreStoreText) || !/function markPlaybackQualityRuntimeCap/.test(qualityText) || !/cap-locked/.test(qualityText + cssText) || !/playbackQualityCapValue\(song, playbackProvider\)/.test(playbackText) || !/markPlaybackQualityRuntimeCap\(song, playbackProvider, data\.level/.test(playbackText) || !/markPlaybackQualityRuntimeCap\(song, 'qq', nextQuality/.test(fallbackText) || /qqPlaybackQualityCeiling/.test(coreStoreText + playbackText + fallbackText + beatPrefetchText)) {
    fail('playback quality fallback must be tracked per current song and disable unsupported higher choices without a global QQ ceiling');
  }
  if (!/\.control-title-badges/.test(cssText) || !/\.control-title-text/.test(cssText)) {
    fail('bottom player source/VIP badges must have constrained responsive CSS');
  }
  if (!/control-source-chip/.test(searchText) || !/function toggleControlSourceSwitcher/.test(searchText) || !/function switchCurrentSongSource/.test(searchText) || !/findControlSourceMatch/.test(searchText) || !/resumeAt: currentResumeSeconds\(0\)/.test(searchText) || !/\.control-source-switcher/.test(cssText) || !sourceSwitcherGlassOk || sourceSwitcherUsesSharedSvgMap) {
    fail('bottom player source badge must expand into a glass source switcher without reusing the shared SVG map that cuts the right edge');
  }
  if (!sourceSwitcherOriginalMatchOk) {
    fail('source switching and lyric fallback must reject blacklisted cover/derivative candidates and show no-official-source states');
  }
  if (!/quality-switch-preserve-lyrics/.test(playbackText) || !/visual-prep-skip/.test(playbackText) || !/if \(!qualitySwitch\) \{[\s\S]{0,120}safeRenderQueuePanel\('play-queue-at'\)/.test(playbackText) || !/if \(!qualitySwitch\) lyricSunEnergy = 0/.test(playbackText)) {
    fail('quality switching must preserve lyric and visual state instead of running the full track-switch rendering path');
  }
  const accountPillGlassSurfaceOk =
    /\.top-account-pill::before/.test(cssText) &&
    /\.top-account-pill\s*>\s*\*/.test(cssText) &&
    /html\.control-glass-svg-ok\s+\.top-account-pill::before\s*\{[\s\S]*?url\(#mineradio-account-pill-glass-filter\)/.test(cssText);
  const accountPillDirectSvgFilter =
    /html\.control-glass-svg-ok\s+\.top-account-pill\s*\{[\s\S]*?url\(#mineradio-account-pill-glass-filter\)/.test(cssText) ||
    /html\.control-glass-svg-ok\s+\.top-account-pill,/.test(cssText);
  const lastAccountContainerOverride = cssText.lastIndexOf('#user-btn.multi-account,');
  const lastTopRightIconRule = cssText.lastIndexOf('#top-right .icon-btn');
  const accountContainerGlassDisabledOk =
    lastAccountContainerOverride > lastTopRightIconRule &&
    /#user-btn\.multi-account[\s\S]{0,320}background:\s*transparent\s*!important[\s\S]{0,160}box-shadow:\s*none\s*!important[\s\S]{0,160}backdrop-filter:\s*none\s*!important[\s\S]{0,120}-webkit-backdrop-filter:\s*none\s*!important[\s\S]{0,120}transition:\s*none\s*!important/.test(cssText.slice(lastAccountContainerOverride));
  const accountFilterText = (indexText.match(/<filter id="mineradio-account-pill-glass-filter"[\s\S]*?<\/filter>/) || [''])[0];
  const accountPillSimpleRefractionOk =
    /<feDisplacementMap[\s\S]*?scale="28"[\s\S]*?xChannelSelector="R"[\s\S]*?yChannelSelector="G"/.test(accountFilterText) &&
    !/feOffset|feColorMatrix|feBlend|dispRed|dispGreen|dispBlue/.test(accountFilterText);
  const accountPillDedicatedMapOk =
    /function generateAccountPillGlassDisplacementMap/.test(glassText) &&
    /account-x/.test(glassText) &&
    /rgb\(128,128,128\)/.test(glassText) &&
    /controlGlassState\.accountPillKey[\s\S]{0,360}generateAccountPillGlassDisplacementMap\(width, height, radius\)/.test(glassText);
  const accountPillVerticalStackOk =
    /account-pill-stack/.test(loginStatusText) &&
    /#top-right\.account-pill-stack[\s\S]{0,100}align-items:\s*flex-start/.test(cssText) &&
    /#user-btn\.multi-account\.external-account-pills[\s\S]{0,220}flex-direction:\s*column[\s\S]{0,160}align-items:\s*flex-end/.test(cssText) &&
    /#user-btn\.multi-account\.external-account-pills \.top-account-pill[\s\S]{0,120}width:\s*190px/.test(cssText) &&
    /#user-btn\.multi-account\.external-account-pills \.top-account-name[\s\S]{0,120}max-width:\s*118px/.test(cssText) &&
    /e\.clientY\s*<\s*rect\.top\s*\+\s*rect\.height\s*\/\s*2/.test(accountUtilsText) &&
    !/e\.clientX\s*<\s*rect\.left\s*\+\s*rect\.width\s*\/\s*2/.test(accountUtilsText);
  if (!/mineradio-account-pill-glass-filter/.test(indexText) || !/account-pill-glass-map/.test(indexText) || !/url\(#mineradio-account-pill-glass-filter\)/.test(cssText) || !/overflow:\s*hidden/.test(cssText) || !accountPillGlassSurfaceOk || accountPillDirectSvgFilter || !accountContainerGlassDisabledOk || !accountPillSimpleRefractionOk || !accountPillDedicatedMapOk || !accountPillVerticalStackOk || !/function updateAccountPillGlassDisplacementMap/.test(glassText) || !/accountPillKey/.test(glassText) || !/querySelectorAll\('\.top-account-pill'\)/.test(glassText) || !/requestAnimationFrame\(updateAccountPillGlassDisplacementMap\)/.test(loginStatusText)) {
    fail('top account VIP capsules must use a dedicated glass map/filter and refresh it after account rendering');
  }
  console.log('[OK] Bottom player title shows source and VIP badges without stretching the control bar.');
}

async function checkProviderFallbackTerminalStateGuard() {
  logStep('Provider fallback transaction and terminal-state guard');
  const fallbackText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '11-provider-fallback.js'), 'utf8');
  const playbackText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '13-playback-start-audio.js'), 'utf8');
  const beatPrefetchText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '03-beat', '00-tempo-worker-cache-prefetch.js'), 'utf8');
  const controlsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '14-player-controls.js'), 'utf8');
  const serverText = fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8');
  if (!/function sourceFallbackProviderReady/.test(fallbackText) || !/status\.playbackKeyReady === true/.test(fallbackText) || !/function alternatePlaybackProviders/.test(fallbackText) || /if \(provider === 'netease'\) return 'qq'/.test(fallbackText)) {
    fail('automatic fallback must only select logged-in direct providers with complete playback authorization');
  }
  if (!/SOURCE_FALLBACK_SEARCH_TIMEOUT_MS\s*=\s*6500/.test(fallbackText) || !/apiJson\(url, \{ timeoutMs: SOURCE_FALLBACK_SEARCH_TIMEOUT_MS \}\)/.test(fallbackText) || !/SOURCE_FALLBACK_RECOVERY_TIMEOUT_MS\s*=\s*20000/.test(fallbackText) || !/function awaitSourceFallbackBudget/.test(fallbackText) || (playbackText.match(/timeoutMs:\s*9000/g) || []).length < 2 || (playbackText.match(/timeoutMs:\s*14000/g) || []).length < 2 || (playbackText.match(/timeoutMs:\s*15000/g) || []).length < 4 || (playbackText.match(/timeoutMs:\s*20000/g) || []).length < 2) {
    fail('fallback search, normal source resolution, and gapless source resolution must all be time-bounded');
  }
  if (!/alternateData[\s\S]{0,220}!alternateData\.url[\s\S]{0,320}playQueue\[idx\] = committedCandidate/.test(fallbackText) || !/fallbackStarted === true[\s\S]{0,180}已自动切换音源/.test(fallbackText) || !/function restoreSourceFallbackQueueItem/.test(fallbackText)) {
    fail('fallback candidates must be URL-probed before provisional commit and only announce success after audible playback');
  }
  if (!/async function skipFailedQueueItem/.test(fallbackText) || !/skipShuffleOrder:\s*true/.test(fallbackText) || !/return nextStarted === true/.test(fallbackText) || !/function settleSourceFallbackTerminal/.test(fallbackText) || !/audio\.removeAttribute\('src'\)/.test(fallbackText) || !/audio\.__mineradioQueueItemKey = ''/.test(fallbackText)) {
    fail('failed fallback must await the next track or settle one terminal state with no stale audio owner');
  }
  if (!/opts\.preResolvedPlaybackData/.test(playbackText) || !/fallbackResult !== null/.test(playbackText) || /if \(isQQPlayback && await retryQQPlaybackWithCompatibleQuality\(song, idx, token, retryPlaybackOpts, data, requestedQuality\)\)/.test(playbackText)) {
    fail('normal playback must consume a preflighted fallback URL and must not recursively retry QQ qualities after an empty URL response');
  }
  if (!/AUDIO_PLAY_REQUEST_TIMEOUT_MS\s*=\s*9000/.test(controlsText) || !/function awaitMediaPlayWithTimeout/.test(controlsText) || (controlsText.match(/awaitMediaPlayWithTimeout\(/g) || []).length < 5 || !/function playbackMediaMatchesCurrentQueueItem/.test(controlsText)) {
    fail('media.play promises must be time-bounded and manual resume must reject stale audio ownership');
  }
  if (!/function probePlaybackAudioUrl/.test(serverText) || !/AUDIO_URL_PROBE_BYTES\s*=\s*8192/.test(serverText) || !/function audioProbeMagic/.test(serverText) || !/audioProxyHeadersFor\(audioUrl, 'bytes=0-'/.test(serverText) || !/&& !!magic/.test(serverText) || !/function probeQQAudioUrl/.test(serverText) || !/probe\.ok/.test(serverText) || !/function readStreamChunkWithTimeout/.test(serverText) || !/fetchWithTimeout\(audioUrl, \{ headers: hdr \}, 9000\)/.test(serverText)) {
    fail('provider URL resolution and the audio proxy must verify real upstream bytes with bounded connection and stream waits');
  }
  const magicStart = serverText.indexOf('function audioProbeMagic');
  const magicEnd = serverText.indexOf('async function probePlaybackAudioUrl', magicStart);
  const magicSandbox = { Buffer };
  vm.runInNewContext(serverText.slice(magicStart, magicEnd), magicSandbox, { filename: 'audio-probe-magic.js' });
  if (magicSandbox.audioProbeMagic(Buffer.from('ID3\u0004\u0000\u0000', 'binary')) !== 'mp3-id3' || magicSandbox.audioProbeMagic(Buffer.from('fLaC0000', 'ascii')) !== 'flac' || magicSandbox.audioProbeMagic(Buffer.alloc(1024, 0x41)) !== '') {
    fail('audio byte probe must accept known media headers and reject MIME-only garbage bytes');
  }
  const neteaseMatchNoticePos = playbackText.indexOf('data.sourceMatch && !song.neteaseSourceMatchNotified');
  const networkPlaybackFailurePos = playbackText.lastIndexOf('if (!playbackStarted)');
  const serverBudget = Number((serverText.match(/NETEASE_SONG_URL_TOTAL_BUDGET_MS\s*=\s*(\d+)/) || [])[1] || 0);
  const playbackBudget = 14000;
  if (
    !/function neteasePlaybackMatchQuery/.test(playbackText)
    || (playbackText.match(/neteasePlaybackMatchQuery\(song\)/g) || []).length < 2
    || !/song\.resolvedNeteaseId\s*=/.test(playbackText)
    || !/data && data\.sourceMatch/.test(playbackText)
    || neteaseMatchNoticePos < 0
    || neteaseMatchNoticePos < networkPlaybackFailurePos
    || !/async function retryNeteaseSourceMatchPlayback/.test(playbackText)
    || !/excludeIds: triedIds, skipDirect: true/.test(playbackText)
    || !/matchedPlaybackFallback = await tryAutoPlaybackFallback/.test(playbackText)
    || !/neteasePlaybackMatchQuery\(song\)/.test(beatPrefetchText)
    || !/timeoutMs:\s*14000/.test(beatPrefetchText)
    || !/async function findNeteaseSameTrackCandidates/.test(serverText)
    || !/cloudsearch\(\{ keywords: query, type: 1, limit: 16, cookie: userCookie \}\)/.test(serverText)
    || !/song_detail\(\{ ids: \[\.\.\.new Set\(detailIds\)\]\.join\(','\), cookie: userCookie \}\)/.test(serverText)
    || !/sourceVersions\.join\('\|'\) !== candidateVersions\.join\('\|'\)/.test(serverText)
    || !/function neteaseSourceMatchArtistSetEqual/.test(serverText)
    || !/function mergeNeteaseSourceMatchSong/.test(serverText)
    || !/fingerprintMatches/.test(serverText)
    || !/async function resolveNeteaseSameTrackPlayback/.test(serverText)
    || !/source: 'netease-same-track'/.test(serverText)
    || !/netease_same_recording/.test(serverText)
    || !/netease_official_alternate/.test(serverText)
    || !/netease_same_track_metadata/.test(serverText)
    || !/noCopyrightRcmd/.test(serverText)
    || !/sourceMatchTriedIds/.test(serverText)
    || !/getPlaybackLoginInfo/.test(serverText)
    || serverBudget <= 0
    || serverBudget + 800 >= playbackBudget
    || !/handleSongUrl\(sid, loginInfo, quality, matchHints\)/.test(serverText)
  ) {
    fail('Netease unavailable tracks must exhaust bounded same-track candidates while preserving the original queue item');
  }
  const matchQueryStart = playbackText.indexOf('function neteasePlaybackMatchQuery');
  const matchQueryEnd = playbackText.indexOf('function clearNeteaseSourceMatchMetadata', matchQueryStart);
  const matchQuerySandbox = { Array, String, encodeURIComponent };
  vm.runInNewContext(playbackText.slice(matchQueryStart, matchQueryEnd), matchQuerySandbox, { filename: 'netease-playback-match-query.js' });
  const querySong = { id: 'song-1', name: 'Fossils', artist: 'acloudyskye' };
  const noOptsQuery = new URLSearchParams(matchQuerySandbox.neteasePlaybackMatchQuery(querySong).replace(/^&/, ''));
  const arrayOptsQuery = new URLSearchParams(matchQuerySandbox.neteasePlaybackMatchQuery(querySong, { excludeIds: ['candidate-a', 'candidate-b'] }).replace(/^&/, ''));
  const stringOptsQuery = new URLSearchParams(matchQuerySandbox.neteasePlaybackMatchQuery(querySong, { excludeIds: 'candidate-c,candidate-d' }).replace(/^&/, ''));
  const sparseQuery = new URLSearchParams(matchQuerySandbox.neteasePlaybackMatchQuery({ id: 'sparse-song' }).replace(/^&/, ''));
  if (
    noOptsQuery.get('excludeIds') !== ''
    || arrayOptsQuery.get('excludeIds') !== 'candidate-a,candidate-b'
    || stringOptsQuery.get('excludeIds') !== 'candidate-c,candidate-d'
    || sparseQuery.get('artist') !== ''
    || sparseQuery.get('artistIds') !== ''
    || sparseQuery.get('artistNames') !== ''
    || sparseQuery.get('excludeIds') !== ''
  ) {
    fail('Netease playback match query must safely normalize missing, array, and string excludeIds values');
  }
  if (/apis\.netstart\.cn|\/simi\/song|simi_song/.test([serverText, playbackText, fallbackText].join('\n'))) {
    fail('production playback must not depend on the public documentation host or use unrelated Netease recommendation results');
  }
  const handleSongUrlStart = serverText.indexOf('async function handleSongUrl');
  const handleSongUrlEnd = serverText.indexOf('\n}', handleSongUrlStart);
  const handleSongUrlText = serverText.slice(handleSongUrlStart, handleSongUrlEnd);
  const directResolvePos = handleSongUrlText.indexOf('resolveNeteaseDirectSongUrl');
  const directReturnPos = handleSongUrlText.indexOf('if (direct && direct.url && !direct.trial) return direct');
  const sameTrackResolvePos = handleSongUrlText.indexOf('resolveNeteaseSameTrackPlayback');
  if (directResolvePos < 0 || directReturnPos <= directResolvePos || sameTrackResolvePos <= directReturnPos) {
    fail('Netease direct playback must return before same-track search, and same-track search must finish before cross-provider fallback');
  }
  const matcherStart = serverText.indexOf('function neteaseSourceMatchText');
  const matcherEnd = serverText.indexOf('function neteaseSourceMatchCacheKey', matcherStart);
  if (matcherStart < 0 || matcherEnd <= matcherStart) fail('Netease same-recording matcher source is incomplete');
  const matcherSandbox = {};
  vm.runInNewContext(serverText.slice(matcherStart, matcherEnd), matcherSandbox, { filename: 'netease-source-match-helpers.js' });
  const matchSource = {
    id: 441102546,
    name: 'I Was King',
    dt: 238826,
    ar: [{ id: 20878, name: 'ONE OK ROCK' }],
    h: { br: 320000, size: 9555636, sr: 44100 },
    m: { br: 192000, size: 5733399, sr: 44100 },
    l: { br: 128000, size: 3822280, sr: 44100 },
  };
  const exactDuplicate = {
    id: 1931495429,
    name: 'I Was King',
    dt: 238826,
    ar: [{ id: 20878, name: 'ONE OK ROCK' }],
    h: { br: 320000, size: 9555636, sr: 44100 },
    m: { br: 192000, size: 5733399, sr: 44100 },
    l: { br: 128000, size: 3822280, sr: 44100 },
    __privilege: { pl: 320000, plLevel: 'exhigh' },
  };
  const liveVersion = Object.assign({}, exactDuplicate, { id: 9991, name: 'I Was King (Live)' });
  const wrongArtist = Object.assign({}, exactDuplicate, { id: 9992, ar: [{ id: 1, name: 'Someone Else' }] });
  const collaborationSource = { id: 2001, name: 'Same Song', dt: 200000, ar: [{ id: 11, name: 'A' }, { id: 12, name: 'B' }] };
  const partialCollaboration = { id: 2002, name: 'Same Song', dt: 200180, ar: [{ id: 11, name: 'A' }, { id: 13, name: 'C' }] };
  const taylorSource = { id: 3001, name: 'Love Story', dt: 235000, ar: [{ id: 44266, name: 'Taylor Swift' }] };
  const taylorVersion = { id: 3002, name: "Love Story (Taylor's Version)", dt: 235200, ar: [{ id: 44266, name: 'Taylor Swift' }] };
  const metadataReencode = { id: 3003, name: 'Love Story', dt: 235213, ar: [{ id: 44266, name: 'Taylor Swift' }] };
  const popMix = { id: 3004, name: 'Love Story (Pop Mix)', dt: 235400, ar: [{ id: 44266, name: 'Taylor Swift' }] };
  const officialAlternate = { id: 3005, name: 'Love Story', dt: 236067, ar: [{ id: 44266, name: 'Taylor Swift' }], __officialSourceMatch: true };
  const unofficialLongDrift = Object.assign({}, officialAlternate, { id: 3006, __officialSourceMatch: false });
  if (
    matcherSandbox.neteaseSourceMatchFingerprintCount(matchSource, exactDuplicate) < 3
    || matcherSandbox.neteaseSourceMatchCandidateScore(matchSource, exactDuplicate) <= 0
    || matcherSandbox.neteaseSourceMatchCandidateScore(matchSource, liveVersion) !== -1
    || matcherSandbox.neteaseSourceMatchCandidateScore(matchSource, wrongArtist) !== -1
    || matcherSandbox.neteaseSourceMatchCandidateScore(collaborationSource, partialCollaboration) !== -1
    || matcherSandbox.neteaseSourceMatchCandidateScore(taylorSource, taylorVersion) !== -1
    || matcherSandbox.neteaseSourceMatchCandidateScore(taylorSource, metadataReencode) <= 0
    || matcherSandbox.neteaseSourceMatchCandidateScore(taylorSource, popMix) !== -1
    || matcherSandbox.neteaseSourceMatchCandidateScore(taylorSource, officialAlternate) <= 0
    || matcherSandbox.neteaseSourceMatchCandidateScore(taylorSource, unofficialLongDrift) !== -1
  ) {
    fail('Netease matching must accept exact/re-encoded tracks and reject live, re-recorded, wrong-artist, or partial-collaboration candidates');
  }
  const mergeStart = serverText.indexOf('function neteaseSourceMatchHintArtists');
  const mergeEnd = serverText.indexOf('async function findNeteaseSameTrackCandidates', mergeStart);
  vm.runInNewContext(serverText.slice(mergeStart, mergeEnd), matcherSandbox, { filename: 'netease-source-match-merge.js' });
  const mergedGraySong = matcherSandbox.mergeNeteaseSourceMatchSong(
    { id: 4001, name: '', ar: [], al: {}, dt: 238826 },
    { id: 4001, name: 'I Was King', ar: [{ id: 20878, name: 'ONE OK ROCK' }], al: { name: 'Ambitions' }, dt: 238826 },
    { artistIds: '20878', artistNames: 'ONE OK ROCK', album: 'Ambitions' }
  );
  if (mergedGraySong.name !== 'I Was King' || !mergedGraySong.ar.length || mergedGraySong.ar[0].id !== 20878 || mergedGraySong.al.name !== 'Ambitions') {
    fail('gray Netease song details must be hydrated from search results and frontend metadata');
  }
  const applyStart = playbackText.indexOf('function clearNeteaseSourceMatchMetadata');
  const applyEnd = playbackText.indexOf('function neteaseSourceMatchTriedIds', applyStart);
  const applySandbox = { Number };
  vm.runInNewContext(playbackText.slice(applyStart, applyEnd), applySandbox, { filename: 'netease-source-match-metadata.js' });
  const originalQueueSong = { provider: 'netease', id: 'original-1', name: 'Original', artist: 'Artist', album: 'Album', cover: 'cover.jpg' };
  const originalIdentity = JSON.stringify(originalQueueSong);
  applySandbox.applyNeteaseSourceMatchMetadata(originalQueueSong, { sourceMatch: true, resolvedNeteaseId: 'playable-2', source: 'netease-same-track', matchKind: 'netease_same_recording', matchedSong: { album: 'Other Release' } });
  if (originalQueueSong.id !== 'original-1' || originalQueueSong.provider !== 'netease' || originalQueueSong.name !== 'Original' || originalQueueSong.artist !== 'Artist' || originalQueueSong.album !== 'Album' || originalQueueSong.cover !== 'cover.jpg' || originalQueueSong.resolvedNeteaseId !== 'playable-2' || originalIdentity === JSON.stringify(originalQueueSong)) {
    fail('Netease source-match metadata must annotate playback without replacing original queue identity, cover, lyrics context, or album');
  }
  const retryStart = playbackText.indexOf('function neteaseSourceMatchTriedIds');
  const retryEnd = playbackText.indexOf('async function resolveAlbumGaplessPlaybackData', retryStart);
  const retrySandbox = {
    Array,
    Object,
    Math,
    Number,
    String,
    console,
    encodeURIComponent,
    trackSwitchToken: 7,
    neteasePlaybackMatchQuery(song, opts) {
      retrySandbox.matchQuery = { song, opts };
      return '&excludeIds=' + encodeURIComponent((opts.excludeIds || []).join(',')) + '&skipDirect=1';
    },
    async apiJson(url) {
      retrySandbox.retryUrl = url;
      return { sourceMatch: true, url: 'https://candidate-b.invalid/audio', resolvedNeteaseId: 'candidate-b', sourceMatchTriedIds: ['candidate-a', 'candidate-b'] };
    },
    async playQueueAt(idx, opts) {
      retrySandbox.trackSwitchToken += 1;
      retrySandbox.retryPlayback = { idx, opts };
      return true;
    },
  };
  vm.runInNewContext(playbackText.slice(retryStart, retryEnd), retrySandbox, { filename: 'netease-source-match-retry.js' });
  const retrySong = { provider: 'netease', id: 'original-1', name: 'Original', artist: 'Artist' };
  const retryResult = await retrySandbox.retryNeteaseSourceMatchPlayback(retrySong, { sourceMatch: true, resolvedNeteaseId: 'candidate-a', sourceMatchTriedIds: ['candidate-a'] }, 0, 7, {}, 'standard');
  if (retryResult !== true || retrySong.id !== 'original-1' || !retrySandbox.matchQuery || retrySandbox.matchQuery.opts.excludeIds[0] !== 'candidate-a' || !retrySandbox.matchQuery.opts.skipDirect || !retrySandbox.retryPlayback || retrySandbox.retryPlayback.opts.preResolvedPlaybackData.resolvedNeteaseId !== 'candidate-b') {
    fail('failed browser decode must exclude the first Netease candidate, retry the next candidate, and keep the original queue identity');
  }

  const status = {
    netease: { loggedIn: true },
    qq: { loggedIn: false, playbackKeyReady: false },
    kugou: { loggedIn: false, playbackKeyReady: false },
  };
  const notices = [];
  const sourceSong = { provider: 'netease', id: 'ne-1', name: 'I Was King', artist: 'ONE OK ROCK' };
  const media = {
    src: 'https://old.invalid/audio',
    paused: false,
    ended: true,
    pause() { this.paused = true; },
    removeAttribute(name) { if (name === 'src') this.src = ''; },
    load() {},
  };
  const sandbox = {
    console,
    Promise,
    Date,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(fn) { fn(); },
    normalizePlaybackProvider(provider) { return ['qq', 'kugou', 'qishui', 'spotify'].includes(provider) ? provider : 'netease'; },
    songProviderKey(song) { return song && song.provider || 'netease'; },
    platformStatus(provider) { return status[provider] || { loggedIn: false }; },
    accountProviderOrder() { return ['netease', 'qq', 'kugou', 'qishui', 'spotify']; },
    providerVipLevel() { return 'none'; },
    queueItemKey(song) { return (song && song.provider || '') + ':' + (song && (song.id || song.mid) || ''); },
    hydrateCustomCover(song) { return song; },
    sourceCandidateRejectReason() { return ''; },
    cloneSong(song) { return Object.assign({}, song); },
    normalizePlaybackQuality(value) { return value || 'hires'; },
    normalizePlaybackQualityForProvider(value) { return value || 'hires'; },
    getProviderPlaybackQuality() { return 'hires'; },
    playbackQualityLabel(value) { return value; },
    markPlaybackQualityRuntimeCap() {},
    pendingPlaybackResumeAt: 0,
    playQueue: [sourceSong],
    currentIdx: 0,
    trackSwitchToken: 1,
    audio: media,
    audioFadeSerial: 0,
    playToggleBusy: true,
    playing: true,
    miniQueueOpen: false,
    hideLoading() { sandbox.loadingHidden = true; },
    forcePlaybackControlsInteractive() { sandbox.controlsReleased = true; },
    clearAudioFadeTimers() {},
    setPlayIcon(value) { sandbox.iconPlaying = value; },
    syncPlaybackStateFromAudioEvent() {},
    safeRenderQueuePanel() {},
    safeShelfRebuild() {},
    updateControlTrackInfo() {},
    showToast() {},
    showSourceFallbackNotice(title, body) { notices.push({ title, body }); },
    document: { getElementById() { return null; }, body: { appendChild() {} } },
    apiJson: async function () { sandbox.searchCalls += 1; return { songs: [] }; },
    resolveAlbumGaplessPlaybackData: async function () { return { url: 'https://candidate.invalid/audio' }; },
    playQueueAt: async function () { sandbox.childPlayCalls += 1; sandbox.trackSwitchToken += 1; return false; },
    searchCalls: 0,
    childPlayCalls: 0,
  };
  vm.runInNewContext(fallbackText, sandbox, { filename: '11-provider-fallback.js' });
  sandbox.showSourceFallbackNotice = function (title, body) { notices.push({ title, body }); };
  const noTargetProviders = sandbox.alternatePlaybackProviders(sourceSong);
  if (noTargetProviders.length !== 0) fail('Netease-only login must not silently select logged-out QQ or Kugou');
  const noTargetResult = await sandbox.tryAutoPlaybackFallback(sourceSong, { category: 'url_unavailable' }, 0, 1, {});
  if (noTargetResult !== false || sandbox.searchCalls !== 0 || sandbox.childPlayCalls !== 0 || sandbox.playQueue[0].provider !== 'netease' || media.src !== '' || sandbox.playing !== false || sandbox.playToggleBusy !== false || !sandbox.loadingHidden || !sandbox.controlsReleased) {
    fail('Netease-only fallback must terminate without search, queue mutation, stale audio, or locked controls');
  }

  status.qq = { loggedIn: true, playbackKeyReady: true };
  sandbox.playQueue = [sourceSong];
  sandbox.currentIdx = 0;
  sandbox.trackSwitchToken = 10;
  sandbox.audio = Object.assign({}, media, { src: 'https://old.invalid/audio', paused: false, ended: true });
  sandbox.playToggleBusy = true;
  sandbox.playing = true;
  sandbox.searchCalls = 0;
  sandbox.childPlayCalls = 0;
  notices.length = 0;
  sandbox.apiJson = async function () {
    sandbox.searchCalls += 1;
    return { songs: [{ provider: 'qq', id: 'qq-1', mid: 'qq-1', name: sourceSong.name, artist: sourceSong.artist }] };
  };
  const failedCandidateResult = await sandbox.tryAutoPlaybackFallback(sourceSong, { category: 'url_unavailable' }, 0, 10, {});
  if (failedCandidateResult !== false || sandbox.playQueue[0].provider !== 'netease' || sandbox.childPlayCalls !== 1 || notices.some(item => item.title === '已自动切换音源')) {
    fail('a probed candidate whose media start fails must roll back the original source and never announce success');
  }
  delete sourceSong._lastPlaybackFailAt;
  sandbox.playQueue = [sourceSong, { provider: 'netease', id: 'ne-2', name: 'Next' }];
  sandbox.trackSwitchToken = 20;
  const skippedPlaybackOpts = [];
  sandbox.playQueueAt = async function (idx, opts) {
    skippedPlaybackOpts.push({ idx, opts });
    return true;
  };
  const defaultSkipResult = await sandbox.skipFailedQueueItem(0, 20, '', { silent: true });
  delete sourceSong._lastPlaybackFailAt;
  const preservedSkipResult = await sandbox.skipFailedQueueItem(0, 20, '', { silent: true, playbackOpts: { startupAutoplay: true, fallbackDepth: 0 } });
  if (
    defaultSkipResult !== true
    || preservedSkipResult !== true
    || skippedPlaybackOpts.length !== 2
    || skippedPlaybackOpts[0].opts.fallbackDepth !== 0
    || skippedPlaybackOpts[0].opts.skipShuffleOrder !== true
    || skippedPlaybackOpts[1].opts.startupAutoplay !== true
    || skippedPlaybackOpts[1].opts.fallbackDepth !== 0
    || skippedPlaybackOpts[1].opts.skipShuffleOrder !== true
  ) {
    fail('failed queue items must advance without reshuffling while preserving the caller playback options');
  }
  if (
    !/SOURCE_FALLBACK_MAX_QUEUE_ADVANCES\s*=\s*2/.test(fallbackText)
    || !/SOURCE_FALLBACK_MAX_PROVIDER_ATTEMPTS\s*=\s*4/.test(fallbackText)
    || !/recovery\.visitedSongKeys/.test(fallbackText)
    || !/recovery\.attemptedProviderKeys/.test(fallbackText)
    || !/beginSourceFallbackPlaybackInvocation\(opts\)/.test(playbackText)
    || !/clearPlaybackResumeWatchdogs\(\)/.test(fallbackText)
  ) {
    fail('automatic recovery must use one finite transaction with queue/provider dedupe and watchdog invalidation');
  }
  console.log('[OK] Provider fallback respects active credentials, commits after playback, and reaches a clean terminal state.');
}

function checkSearchGlassEntranceGuard() {
  logStep('Search glass entrance guard');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const indexText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const glassText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '15-control-glass-animations.js'), 'utf8');
  const searchText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '07-search.js'), 'utf8');
  const peekText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '10-shell', '02-peek-panels-upload.js'), 'utf8');
  const searchPillDirectSvg = /html\.control-glass-svg-ok\s+\.search-mode-tabs button,[ \t]*\r?\nhtml\.control-glass-svg-ok\s+\.search-history-chip\s*\{[\s\S]{0,260}backdrop-filter:\s*url\(#mineradio-search-pill-glass-filter\)\s+saturate\(1\)\s*!important[\s\S]{0,220}-webkit-backdrop-filter:\s*url\(#mineradio-search-pill-glass-filter\)\s+saturate\(1\)\s*!important/.test(cssText);
  const searchAreaKeepsGlassComposited =
    /#search-area\s*\{[\s\S]{0,120}top:\s*-76px[\s\S]{0,220}transition:\s*top\s+\.45s[\s\S]{0,120}opacity\s+\.35s/.test(cssText) &&
    /#search-area\.peek\s*\{[\s\S]{0,80}top:\s*24px[\s\S]{0,80}opacity:\s*1[\s\S]{0,80}pointer-events:\s*auto/.test(cssText) &&
    !/Search entrance mirrors the bottom player reveal|#search-box\s*>\s*\*/.test(cssText);
  const searchBoxUsesSavedRgbGlassSurface =
    /#search-box\s*\{[\s\S]{0,90}overflow:\s*visible[\s\S]{0,60}isolation:\s*isolate/.test(cssText) &&
    /#search-box::before\s*\{[\s\S]{0,90}content:\s*none\s*!important/.test(cssText) &&
    /#search-box\s*\{[\s\S]{0,220}background:\s*transparent\s*!important[\s\S]{0,220}box-shadow:\s*none\s*!important[\s\S]{0,220}backdrop-filter:\s*none\s*!important[\s\S]{0,160}-webkit-backdrop-filter:\s*none\s*!important/.test(cssText) &&
    /#search-area\.peek\s+#search-box\s*\{[\s\S]{0,220}background:\s*var\(--saved-panel-glass-bg\)\s*!important[\s\S]{0,220}box-shadow:\s*var\(--saved-panel-glass-shadow\)\s*!important[\s\S]{0,220}backdrop-filter:\s*var\(--saved-panel-glass-filter\)\s*!important/.test(cssText) &&
    /html\.control-glass-svg-ok\s+#search-area\.peek\s+#search-box\s*\{[\s\S]{0,180}backdrop-filter:\s*url\(#mineradio-search-box-glass-filter\)\s+saturate\(1\)\s*!important[\s\S]{0,180}-webkit-backdrop-filter:\s*url\(#mineradio-search-box-glass-filter\)\s+saturate\(1\)\s*!important/.test(cssText) &&
    /html\.control-glass-svg-ok\s+#search-box::before\s*\{[\s\S]{0,90}content:\s*none\s*!important/.test(cssText) &&
    /#search-box\s+#search-icon,[ \t]*\r?\n#search-box\s+#search-input\s*\{[\s\S]{0,80}position:\s*relative[\s\S]{0,80}z-index:\s*1/.test(cssText) &&
    !/html\.control-glass-svg-ok\s+#search-box::before\s*\{[\s\S]{0,260}url\(#mineradio-search-box-glass-filter\)/.test(cssText) &&
    !/#search-area\s+#search-box\s*\{[\s\S]{0,260}background:\s*var\(--glass-bg\)\s*!important/.test(cssText);
  const searchPillUsesSavedRgbGlassSurface =
    /html\.control-glass-svg-ok\s+\.search-mode-tabs button,[ \t]*\r?\nhtml\.control-glass-svg-ok\s+\.search-history-chip\s*\{[\s\S]{0,180}background:\s*var\(--saved-button-glass-bg\)\s*!important[\s\S]{0,180}border-color:\s*transparent\s*!important[\s\S]{0,180}box-shadow:\s*var\(--saved-button-glass-shadow\)\s*!important[\s\S]{0,220}url\(#mineradio-search-pill-glass-filter\)/.test(cssText);
  const searchTabsRailStaysTransparent =
    /#search-area\s+\.search-mode-tabs,[ \t]*\r?\nhtml\.control-glass-svg-ok\s+#search-area\s+\.search-mode-tabs\s*\{[\s\S]{0,160}background:\s*transparent\s*!important[\s\S]{0,160}border-color:\s*transparent\s*!important[\s\S]{0,160}box-shadow:\s*none\s*!important[\s\S]{0,160}backdrop-filter:\s*none\s*!important[\s\S]{0,160}-webkit-backdrop-filter:\s*none\s*!important/.test(cssText);
  const searchHistoryFrostedSurfaceOk =
    /function setSearchHistorySurface\(on\)\s*\{[\s\S]{0,120}classList\.toggle\('search-history-surface',\s*!!on\)/.test(searchText) &&
    /function renderSearchHistory\(\)\s*\{[\s\S]{0,900}setSearchHistorySurface\(true\)/.test(searchText) &&
    /function renderSongSearchResults\(songs\)\s*\{[\s\S]{0,120}setSearchHistorySurface\(false\)/.test(searchText) &&
    /#search-results\.search-history-surface,[ \t]*\r?\nhtml\.control-glass-svg-ok\s+#search-results\.search-history-surface\s*\{[\s\S]{0,320}background:\s*linear-gradient\([\s\S]{0,180}!important[\s\S]{0,220}backdrop-filter:\s*blur\(34px\)\s+saturate\(1\.34\)\s+brightness\(1\.08\)\s*!important/.test(cssText) &&
    !/#search-results\.search-history-surface[\s\S]{0,260}background:\s*rgba\(0,\s*0,\s*0,\s*\.90\)/.test(cssText);
  const searchResultsFrostedSurfaceOk =
    /#search-results\.show:not\(\.search-history-surface\),[ \t]*\r?\nhtml\.control-glass-svg-ok\s+#search-results\.show:not\(\.search-history-surface\)\s*\{[\s\S]{0,320}background:\s*linear-gradient\([\s\S]{0,180}!important[\s\S]{0,220}backdrop-filter:\s*blur\(34px\)\s+saturate\(1\.34\)\s+brightness\(1\.08\)\s*!important/.test(cssText) &&
    /#search-results\.show:not\(\.search-history-surface\)\s+\.search-result\s*\{[\s\S]{0,180}background:\s*rgba\(255,\s*255,\s*255,\s*\.026\)\s*!important/.test(cssText);
  const searchProviderCapabilityFilterOk =
    /function searchProviderCanSearch\(provider\)/.test(searchText) &&
    /function activeSearchProvidersForMode\(mode\)\s*\{[\s\S]{0,260}MUSIC_SEARCH_PROVIDER_ORDER\.filter\(searchProviderCanSearch\)/.test(searchText) &&
    /function searchProviderLoginNotice\(mode\)/.test(searchText) &&
    /Promise\.allSettled\(fetchProviders\.map\(function\s*\(provider\)/.test(searchText) &&
    /function loadNextMusicSearchPage\(expectedKey\)/.test(searchText) &&
    /new IntersectionObserver/.test(searchText) &&
    /mergeSongSearchResults\(neteaseSongs,\s*qqSongs,\s*kugouSongs,\s*qishuiSongs,\s*spotifySongs/.test(searchText);
  const searchFusionRankingOk =
    /function searchPopularityScore\(song,\s*sourceIndex\)/.test(searchText) &&
    /function searchCanonicalSongKey\(song\)/.test(searchText) &&
    /氛围\|浴室\|节奏版\|进行曲/.test(searchText) &&
    /var providerSeen = \{\};[\s\S]{0,80}var canonicalSeen = \{\};/.test(searchText) &&
    /score \+= searchPopularityScore\(song,\s*sourceIndex\)/.test(searchText);
  const searchHistorySharedAcrossTabsOk =
    /SEARCH_HISTORY_STORE_VERSION\s*=\s*3/.test(searchText) &&
    /return \{ version: SEARCH_HISTORY_STORE_VERSION, items: \[\] \}/.test(searchText) &&
    /function readSearchHistory\(\)\s*\{[\s\S]{0,120}\.items\.slice\(\)/.test(searchText) &&
    /function runSearchHistory\(q\)/.test(searchText) &&
    /function doPodcastSearch\(q\)[\s\S]{0,700}rememberSearchQuery\(q\)/.test(searchText) &&
    /if \(!renderSearchHistory\(\) && searchMode === 'podcast'\) loadPodcastHot\(\)/.test(searchText) &&
    !/data-history-mode/.test(searchText);
  const searchBoxFilterText = (indexText.match(/<filter id="mineradio-search-box-glass-filter"[\s\S]*?<\/filter>/) || [''])[0];
  const searchPillFilterText = (indexText.match(/<filter id="mineradio-search-pill-glass-filter"[\s\S]*?<\/filter>/) || [''])[0];
  const searchBoxSourceMergeCount = (searchBoxFilterText.match(/<feMergeNode in="SourceGraphic"/g) || []).length;
  const searchPillSourceMergeCount = (searchPillFilterText.match(/<feMergeNode in="SourceGraphic"/g) || []).length;
  const searchBoxFilterMatchesSavedRgbGlass =
    /css\/index\.css\?v=20260716-we-continuity-vsync/.test(indexText) &&
    /x="-24%"\s+y="-34%"\s+width="158%"/.test(searchBoxFilterText) &&
    /height="168%"/.test(searchBoxFilterText) &&
    /id="search-box-glass-map"\s+x="-10%"\s+y="-4%"\s+width="120%"\s+height="108%"/.test(searchBoxFilterText) &&
    searchBoxSourceMergeCount === 3 &&
    /scale="180"[\s\S]{0,120}xChannelSelector="R"[\s\S]{0,120}yChannelSelector="B"/.test(searchBoxFilterText) &&
    /<feOffset in="dispRed" dx="-90" dy="0" result="dispRedShifted"/.test(searchBoxFilterText) &&
    /scale="170"[\s\S]{0,120}xChannelSelector="R"[\s\S]{0,120}yChannelSelector="B"/.test(searchBoxFilterText) &&
    /scale="160"[\s\S]{0,120}xChannelSelector="R"[\s\S]{0,120}yChannelSelector="B"/.test(searchBoxFilterText) &&
    /<feBlend in="rg" in2="blue" mode="screen" result="output"/.test(searchBoxFilterText) &&
    /<feGaussianBlur in="output" stdDeviation="0\.5"/.test(searchBoxFilterText) &&
    /x="-48%"\s+y="-68%"/.test(searchPillFilterText) &&
    /width="210%"\s+height="236%"/.test(searchPillFilterText) &&
    /id="search-pill-glass-map"\s+x="-24%"\s+y="-14%"\s+width="148%"\s+height="128%"/.test(searchPillFilterText) &&
    searchPillSourceMergeCount === 3 &&
    /scale="118"[\s\S]{0,120}xChannelSelector="R"[\s\S]{0,120}yChannelSelector="B"/.test(searchPillFilterText) &&
    /<feOffset in="dispRed" dx="-34" dy="0" result="dispRedShifted"/.test(searchPillFilterText) &&
    /scale="108"[\s\S]{0,120}xChannelSelector="R"[\s\S]{0,120}yChannelSelector="B"/.test(searchPillFilterText) &&
    /scale="100"[\s\S]{0,120}xChannelSelector="R"[\s\S]{0,120}yChannelSelector="B"/.test(searchPillFilterText) &&
    /<feGaussianBlur in="output" stdDeviation="0\.35"/.test(searchPillFilterText) &&
    !/searchChromaNoise|searchChromaTint|chromaticOutput/.test(searchBoxFilterText) &&
    !/searchPillChromaNoise|searchPillChromaTint|chromaticPillOutput/.test(searchPillFilterText) &&
    !/result="refracted"|xChannelSelector="G"/.test(searchBoxFilterText) &&
    !/result="refracted"|xChannelSelector="G"/.test(searchPillFilterText);
  const searchPillSvgOk = searchPillDirectSvg && searchPillUsesSavedRgbGlassSurface;
  const chromaticOffsetFunctionText = (glassText.match(/function applyControlGlassChromaticOffset\(\)\s*\{[\s\S]*?\n\}/) || [''])[0];
  const searchGlassUsesSavedRgbMapOk =
    /function generateAccountPillGlassDisplacementMap\(width,\s*height,\s*radius,\s*minWidth,\s*minHeight\)/.test(glassText) &&
    !/SEARCH_BOX_GLASS_CHROMA|SEARCH_PILL_GLASS_CHROMA/.test(glassText) &&
    !/mineradio-search-box-glass-filter|mineradio-search-pill-glass-filter/.test(chromaticOffsetFunctionText) &&
    /function generateSearchBoxGlassDisplacementMap/.test(glassText) &&
    /generateControlGlassDisplacementMap\(width,\s*height,\s*radius\)/.test(glassText) &&
    /function generateSearchPillGlassDisplacementMap/.test(glassText) &&
    /updateGlassDisplacementMapForElement\([\s\S]{0,260}generateSearchBoxGlassDisplacementMap/.test(glassText) &&
    /generateSearchPillGlassDisplacementMap\(width,\s*height,\s*radius\)/.test(glassText) &&
    !/generateSearchBoxGlassDisplacementMap[\s\S]{0,140}generateAccountPillGlassDisplacementMap/.test(glassText);
  const searchGlassPrewarmOk =
    /function glassImageHasHref/.test(glassText) &&
    /function queueSearchGlassReadyAfterPaint/.test(glassText) &&
    /setSearchGlassPriming\(true\)/.test(glassText) &&
    /var frames = 3/.test(glassText) &&
    /function syncSearchGlassReadyState/.test(glassText) &&
    /classList\.toggle\('search-glass-ready', on\)/.test(glassText) &&
    /classList\.toggle\('search-glass-priming', on\)/.test(glassText) &&
    /classList\.toggle\('search-glass-fallback', on\)/.test(glassText) &&
    /function prepareSearchGlassBeforePeek/.test(glassText) &&
    /requestAnimationFrame\(prepareSearchGlassBeforePeek\)/.test(glassText) &&
    /setTimeout\(prepareSearchGlassBeforePeek,\s*140\)/.test(glassText) &&
    /syncSearchGlassReadyState\(true,\s*false\)/.test(glassText) &&
    /syncSearchGlassReadyState\(changed,\s*changed\)/.test(glassText);
  const setPeekPreparesBeforeShow =
    (() => {
      const start = peekText.indexOf('function setPeek(el, on, key)');
      const end = peekText.indexOf('function uploadTipWasSeen');
      const setPeekBody = start >= 0 && end > start ? peekText.slice(start, end) : '';
      return /prepareSearchGlassBeforePeek/.test(setPeekBody) &&
        /scheduleSearchPeekAfterGlassReady\(el\)/.test(setPeekBody) &&
        setPeekBody.indexOf('prepareSearchGlassBeforePeek') < setPeekBody.indexOf("el.classList.add('peek')");
    })() &&
    /function scheduleSearchPeekAfterGlassReady\(el\)/.test(peekText) &&
    /function isSearchGlassReadyForReveal\(\)/.test(peekText) &&
    /function isSearchPeekRevealPending\(\)/.test(peekText) &&
    /key === 'search' && typeof prepareSearchGlassBeforePeek === 'function'/.test(peekText) &&
    /var searchGlassReady = prepareSearchGlassBeforePeek\(\)/.test(peekText) &&
    /if \(!searchGlassReady\)\s*\{[\s\S]*?scheduleSearchPeekAfterGlassReady\(el\)[\s\S]*?return;[\s\S]*?\}/.test(peekText) &&
    /\(saOn \|\| isSearchPeekRevealPending\(\)\) && !emptyHomeActive/.test(peekText);
  if (!searchHistorySharedAcrossTabsOk) {
    fail('search history must stay shared across All, provider, and Podcast tabs');
  }
  if (!searchPillDirectSvg || !searchAreaKeepsGlassComposited || !searchBoxUsesSavedRgbGlassSurface || !searchTabsRailStaysTransparent || !searchHistoryFrostedSurfaceOk || !searchResultsFrostedSurfaceOk || !searchProviderCapabilityFilterOk || !searchFusionRankingOk || !searchBoxFilterMatchesSavedRgbGlass || !searchPillSvgOk || !searchGlassUsesSavedRgbMapOk || !searchGlassPrewarmOk || !setPeekPreparesBeforeShow) {
    fail('search glass must use the saved RGB SVG surface and reveal only by opacity/transform');
  }
  console.log('[OK] Search glass uses the saved RGB SVG surface and is composited before the search panel appears.');
}

function checkProviderEntitlementBoundaryGuard() {
  logStep('Provider entitlement boundary guard');
  const kugouText = fs.readFileSync(path.join(appRoot, 'kugou-api.js'), 'utf8');
  const qishuiText = fs.readFileSync(path.join(appRoot, 'qishui-api.js'), 'utf8');
  const serverText = fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8');
  const mainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
  const loginText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '02-login-status.js'), 'utf8');
  const userModalText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '04-user-modal-logout.js'), 'utf8');
  const playbackText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '13-playback-start-audio.js'), 'utf8');
  if (/rememberKugouPlaybackVipEvidence|mergeKugouPlaybackVipEvidence|premium-quality-playback|member-track-playback/.test(kugouText)) {
    fail('Kugou playback success must never be promoted into account membership evidence');
  }
  if (!/function normalizeKugouVipPayloadV2/.test(kugouText) ||
      /\/vip\|member\|music_pack\//.test(kugouText) ||
      /const vipText = Object\.keys/.test(kugouText) ||
      !/const apiMembershipKnown = apiStates\.length > 0/.test(kugouText) ||
      !/membershipVerified:\s*apiMembershipKnown/.test(kugouText) ||
      !/const isWebRolePayload = membershipOrigin === 'kugou-web-roleinfo'/.test(kugouText) ||
      !/const freshMembershipSource = isWebRolePayload \? 'kugou-web-roleinfo' : 'kugou-vip-api'/.test(kugouText) ||
      !/membershipSource:\s*apiMembershipKnown[\s\S]*?freshMembershipSource[\s\S]*?'kugou-cookie-hint'/.test(kugouText)) {
    fail('Kugou membership must come from account-scoped API entitlement records; cookies may only provide a non-authoritative hint');
  }
  if (!/function kugouPlaybackCacheScope/.test(kugouText) ||
      !/kugouPlaybackCacheScope\(auth, membership\)/.test(kugouText) ||
      !/function kugouVipCacheKey/.test(kugouText) ||
      !/crypto\.createHash\('sha256'\)\.update\(identity\)\.digest\('hex'\)/.test(kugouText) ||
      !/rights\.canPlaySvipTracks[\s\S]{0,180}rights\.canPlayVipTracks[\s\S]{0,180}rights\.canPlayMusicPackageTracks/.test(kugouText)) {
    fail('Kugou membership and URL resolution caches must be isolated by the full account identity and verified entitlement tier');
  }
  if (!/kugouPlaybackParamsRequireVip\(params\)/.test(kugouText) ||
      !/const canAttemptMemberTrack = membershipRights\.canPlayVipTracks[\s\S]{0,100}membershipRights\.canPlayMusicPackageTracks/.test(kugouText) ||
      !/memberTrack && !canAttemptMemberTrack/.test(kugouText) ||
      !/function kugouMembershipRights/.test(kugouText) ||
      !/function kugouEffectiveQuality/.test(kugouText) ||
      !/if \(!rights\.canPlayVipTracks\) return 'standard'/.test(kugouText)) {
    fail('Kugou member tracks and premium qualities must be denied or downgraded for ordinary accounts');
  }
  if (!/api\/kugou\/song\/url/.test(serverText) || !/api\/qishui\/song\/url/.test(serverText) ||
      !/onlyVipPlayable/.test(serverText) || !/privilege/.test(serverText) || !/fee/.test(serverText) ||
      !/qqPlaybackEvidenceQuery\(song\) \+ qualityParam/.test(playbackText)) {
    fail('Kugou and Qishui playback requests must carry track entitlement hints through the server boundary');
  }
  if (!/function qishuiMembershipFromData/.test(qishuiText) ||
      !/function qishuiTrackRequiresVip/.test(qishuiText) ||
      !/function qishuiStreamRequiredTier/.test(qishuiText) ||
      !/function qishuiRequiredTierAllowed/.test(qishuiText) ||
      !/QISHUI_TRACK_SVIP_KEYS/.test(qishuiText) ||
      !/function qishuiApplyMembershipObservation/.test(qishuiText) ||
      !/membership_unknown/.test(qishuiText) ||
      !/vip_required/.test(qishuiText)) {
    fail('Qishui must strictly separate account membership from track-level VIP/SVIP restrictions and retain only bounded official evidence');
  }
  if (!/verifiedMembership/.test(loginText) ||
      !/membershipSource === 'kugou-vip-api'/.test(loginText) ||
      !/applyKugouPlaybackStatusEvidence\(data\)/.test(playbackText)) {
    fail('Kugou playback responses may update badges only when they carry verified membership API state');
  }
  if (!/\.kugou-vip-evidence\.json/.test(mainText) || !/unlink/.test(mainText)) {
    fail('Startup migration must delete deprecated persisted Kugou playback evidence for existing users');
  }
  if (!/kgVipLevel === 'svip'/.test(userModalText) || !/酷狗 SVIP 会员/.test(userModalText)) {
    fail('Kugou account modal must distinguish SVIP from normal VIP');
  }
  console.log('[OK] Provider account membership and per-track playback entitlement remain separated.');
}

function checkQQVipStatusSyncGuard() {
  logStep('QQ VIP status refresh guard');
  const serverText = fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8');
  const vipModuleText = fs.readFileSync(path.join(appRoot, 'qq-vip-api.js'), 'utf8');
  const mainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
  const preloadText = fs.readFileSync(path.join(appRoot, 'desktop', 'preload.js'), 'utf8');
  const loginStatusText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '02-login-status.js'), 'utf8');
  const loginFlowText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '03-login-modal-flows.js'), 'utf8');
  const accountUtilsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '01-login-modal-utils.js'), 'utf8');
  const userModalText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '04-user-modal-logout.js'), 'utf8');
  const playbackText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '13-playback-start-audio.js'), 'utf8');
  const startupText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '10-shell', '05-startup-bindings.js'), 'utf8');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');

  if (!/function fetchQQVipStatus/.test(serverText) || !/SRFVipQuery_V2/.test(serverText) || !/QQ_VIP_INFO_CACHE_TTL_MS/.test(serverText) || !/forceVip/.test(serverText) || !/vipCheckedAt/.test(serverText)) {
    fail('QQ login status must include an explicit forceable VIP probe instead of relying only on profile fields');
  }
  if (!/function refreshQQConfiguredCookieStore/.test(serverText) || /function getQQLoginInfo[\s\S]{0,220}refreshConfiguredCookieStores\(true\)/.test(serverText)) {
    fail('QQ force refresh must only reload QQ cookies and must not refresh Qishui/Kugou/Netease stores');
  }
  if (!/function normalizeQQVipPayload/.test(serverText) || !/qqVipObjectLooksExpired/.test(serverText) || !/vipProbeAvailable/.test(serverText) ||
      !/decision:\s*'unknown'/.test(vipModuleText) || !/resolveQQVipFromProbes/.test(vipModuleText)) {
    fail('QQ VIP status must normalize active, expired, VIP, and SVIP signals before exposing badges');
  }
  if (!/Promise\.allSettled\(probes\.map/.test(vipModuleText) ||
      !/qqVipSessionCacheKey/.test(serverText) ||
      /qqVipInfoCache\.get\(uin\)/.test(serverText)) {
    fail('QQ VIP probes must all settle and cache results by the current account session fingerprint');
  }
  if (/vipEvidence:\s*playbackVipEvidence/.test(serverText) || /member-track-playback/.test(serverText) ||
      !/function qqPlaybackShowsMemberAccess[\s\S]{0,260}return false;/.test(loginStatusText)) {
    fail('QQ song hints and successful playback must not be promoted into persistent account VIP evidence');
  }
  if (!/function refreshQQVipStatusNow/.test(loginStatusText) || !/function qqLoginNeedsAuthorizationRefresh/.test(loginStatusText) || !/function qqMembershipNeedsSync/.test(loginStatusText) || !/forceVip=1/.test(loginStatusText) || !/window\.addEventListener\('focus'/.test(loginStatusText) || !/visibilitychange/.test(loginStatusText)) {
    fail('QQ frontend must force VIP refresh on manual refresh and foreground return');
  }
  if (!/membershipKnown !== true/.test(loginStatusText) ||
      !/Object\.assign\(\{\}, qqLoginStatus,[\s\S]{0,180}membershipStale:\s*true/.test(loginStatusText) ||
      /mergeQQPlaybackVipEvidence\(Object\.assign/.test(loginStatusText)) {
    fail('QQ frontend must keep last-known-good membership on transient failures and show unknown membership as pending');
  }
  if (!/openQQMusicLoginWindow\(owner, options\)/.test(mainText) ||
      !/const initialCookie = await readQQLoginCookieHeader\(cookieSession\);[\s\S]{0,220}qqCookieHasPlaybackLogin\(initialCookie\)[\s\S]{0,260}options\.forceReauth/.test(mainText) ||
      !/options\.forceReauth[\s\S]{0,180}clearStorageData/.test(mainText) ||
      !/openQQMusicLogin:\s*\(options\)/.test(preloadText) ||
      !/forceReauth:\s*!!\(qqLoginStatus && qqLoginStatus\.authorizationIncomplete && qqLoginStatus\.playbackKeyReady === false\)/.test(loginFlowText) ||
      /forceReauth:\s*!!\(qqLoginStatus && qqLoginStatus\.loggedIn\)/.test(loginFlowText)) {
    fail('QQ reauthorization must only clear an explicitly incomplete playback session, never every logged-in session');
  }
  if (!/function isTrustedQQLoginUrl/.test(mainText) ||
      !/action:\s*'allow'[\s\S]{0,500}partition:\s*QQ_LOGIN_PARTITION/.test(mainText) ||
      !/playbackFinalizePending[\s\S]{0,700}setTimeout\(resolveDelay,\s*450\)/.test(mainText) ||
      !/const showLoginWindow = \(\) =>[\s\S]{0,260}loginWindow\.show\(\)/.test(mainText) ||
      !/showWatchdog = setTimeout\(showLoginWindow,\s*2500\)/.test(mainText) ||
      !/const loadQQOfficialLoginEntry = async \(\) =>[\s\S]{0,700}cookieSession\.clearCache\(\)[\s\S]{0,420}QQ_LOGIN_FALLBACK_URL/.test(mainText) ||
      /loginWindow\.loadURL\('https:\/\/y\.qq\.com\/n\/ryqq\/player'\)/.test(mainText) ||
      !/function qqLoginCompletionFromCookie[\s\S]{0,500}QQ_PLAYBACK_AUTH_INCOMPLETE/.test(mainText) ||
      !/resolve\(qqLoginCompletionFromCookie\(cookie\)\)/.test(mainText)) {
    fail('QQ OAuth must stay in its official window, keep trusted popups on one partition, and reject web-only partial sessions');
  }
  if (!/async function fetchQQVipStatus[\s\S]{0,220}const musicKey = qqCookiePlaybackKey\(cookieObj\)/.test(serverText) ||
      !/async function handleQQSongUrl[\s\S]{0,500}const playbackKey = qqCookiePlaybackKey\(cookieObj\);\s*const musicKey = playbackKey;/.test(serverText) ||
      !/if \(!qqCookieUin\(obj\) \|\| !qqCookiePlaybackKey\(obj\)\)/.test(serverText) ||
      !/function qqCookieUin[\s\S]{0,180}!!obj\.wxopenid[\s\S]{0,180}obj\.wxuin/.test(serverText)) {
    fail('QQ VIP and vkey requests must use a strict QQ Music playback key and must not persist p_skey-only sessions');
  }
  if (!/cookieIsExpired/.test(mainText) || !/qqLoginCookieCandidateScore/.test(mainText) ||
      !/QQ_VKEY_REQUEST_TIMEOUT_MS = 6000/.test(serverText) ||
      !/QQ_AUDIO_PROBE_TOTAL_MS = 6200/.test(serverText) ||
      (playbackText.match(/timeoutMs: 15000/g) || []).length < 2) {
    fail('QQ cookie selection and end-to-end playback timeout budgets must be deterministic and aligned');
  }
  if (!/providerVipAuditSameUser/.test(loginStatusText) || !/已同步/.test(loginStatusText)) {
    fail('provider VIP audit must detect normal-to-VIP sync as well as VIP loss');
  }
  if (!/qqLoginStatusText/.test(loginFlowText) || !/qqNeedsMembershipSync/.test(loginFlowText) || !/同步会员/.test(loginFlowText) || !/重新打开官方窗口同步会员/.test(loginFlowText) ||
      !/qqNeedsAuthRefresh \? openQQWebLogin : \(qqLoginStatus\.loggedIn \? refreshQr : openQQWebLogin\)/.test(loginFlowText) ||
      /qqNeedsAuthRefresh \|\| qqNeedsMembershipSync/.test(loginFlowText)) {
    fail('QQ login panel must reauthorize only missing playback credentials and use the forceVip status probe for membership sync');
  }
  if (!/pendingSync = providerMembershipNeedsSync\(provider, status\)/.test(accountUtilsText) || !/qqMembershipNeedsSync\(status\)/.test(accountUtilsText) || !/待同步/.test(accountUtilsText) || !/\.top-account-vip\.pending/.test(cssText)) {
    fail('QQ top account badge must show pending sync instead of ordinary account when membership auth is stale');
  }
  if (!/refreshQQLoginStatus\(\{ forceVip: true, reason: 'startup' \}\)/.test(startupText)) {
    fail('startup must force a QQ VIP status recheck so renewed memberships sync immediately');
  }
  if (!/QQ SVIP 会员/.test(userModalText) || !/QQ 会员待同步/.test(userModalText) || !/refreshQQVipStatusNow\('account-modal'\)/.test(userModalText)) {
    fail('account modal must distinguish QQ SVIP and refresh QQ membership when opened');
  }
  console.log('[OK] QQ membership status can be force-refreshed after renewals.');
}

async function checkProviderAuthCookiePathGuard() {
  logStep('Provider auth cookie path guard');
  const serverText = fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8');
  const mainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
  const qqLoginText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '03-login-modal-flows.js'), 'utf8');
  const accountUtilsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '01-login-modal-utils.js'), 'utf8');
  const playlistLoadText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '03-podcast-playlist-loaders.js'), 'utf8');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');

  if (!/function getCookieFile\(\)/.test(serverText) || !/function getQQCookieFile\(\)/.test(serverText) || !/function getKugouCookieFile\(\)/.test(serverText) || !/function getQishuiCookieFile\(\)/.test(serverText)) {
    fail('provider cookie files must be resolved lazily after Electron sets userData env paths');
  }
  if (/const\s+(COOKIE_FILE|QQ_COOKIE_FILE|KUGOU_COOKIE_FILE|QISHUI_COOKIE_FILE)\s*=\s*process\.env\./.test(serverText)) {
    fail('server.js must not capture provider cookie env paths in startup constants');
  }
  if (!/configuredCookieStores/.test(serverText) || !/refreshConfiguredCookieStores\(false\)/.test(serverText) || !/saveConfiguredCookieStore/.test(serverText)) {
    fail('server.js must refresh and save provider cookie stores through the configured userData paths');
  }
  if (!/function ensureLocalServerStarted\(\)/.test(mainText) || !/function configureLocalServerEnvironment\(port\)/.test(mainText) || !/delete require\.cache\[require\.resolve\(serverModulePath\)\]/.test(mainText)) {
    fail('Electron main must configure auth storage env paths before requiring server.js');
  }
  if (!/async function loadMainWindowWithRetry\(win\)/.test(mainText) || !/const port = mainServerPort \|\| process\.env\.PORT \|\| 3000/.test(mainText) || !/win\.loadURL\(targetUrl\)/.test(mainText)) {
    fail('Main window navigation must use the configured server port through the bounded retry path');
  }
  if (!/function reportWindowCreationFailure\(context, error\)/.test(mainText) || !/dialog\.showErrorBox\('Mineradio 启动失败'/.test(mainText)) {
    fail('Main window startup failures must be surfaced instead of leaving a headless server process');
  }
  if (!/function resolveStartupErrorCode\(context, error\)/.test(mainText) || !/STARTUP_ERROR_LOG_FILE/.test(mainText) || !/MR-BOOT-SERVER-PORT/.test(mainText) || !/MR-BOOT-WINDOW-LOAD/.test(mainText) || !/startup-error\.log/.test(mainText)) {
    fail('Startup failure dialog must include stable MR-BOOT error codes and write startup-error.log');
  }
  if (!/process\.on\('uncaughtException'/.test(mainText) || !/process\.on\('unhandledRejection'/.test(mainText) || !/startupCompleted = true/.test(mainText)) {
    fail('Startup error code window must also cover uncaught startup failures before the main window finishes loading');
  }
  if (/await\s+(?:mainWindow|win)\.webContents\.session\.clearCache\(\)/.test(mainText)) {
    fail('Startup must not block first navigation on Chromium cache clearing');
  }
  if (!/let mainWindowCreatePromise = null/.test(mainText) || !/let localServerStartPromise = null/.test(mainText) || !/if \(mainWindowCreatePromise\) return mainWindowCreatePromise/.test(mainText) || !/if \(localServerStartPromise\) return localServerStartPromise/.test(mainText)) {
    fail('Server and BrowserWindow startup must each have a single in-flight promise');
  }
  if (!/STARTUP_SHOW_WATCHDOG_MS/.test(mainText) || !/function showMainWindowSafely\(win, reason\)/.test(mainText) || !/did-finish-load[\s\S]{0,160}showMainWindowSafely\(win/.test(mainText) || !/ready-to-show[\s\S]{0,120}showMainWindowSafely\(win/.test(mainText)) {
    fail('Main window must have ready-to-show, did-finish-load, and watchdog visibility fallbacks');
  }
  if (!/function createTrustedMainDocumentReadySignal\(win, expectedUrl\)/.test(mainText)
    || !/isTrustedMainDocumentUrl\(candidateUrl\)/.test(mainText)
    || !/Promise\.race\(\[observedLoadPromise, readySignal\.promise\]\)/.test(mainText)
    || !/if \(readySignal\.isReady\(\)\) return;[\s\S]{0,100}webContents\.stop\(\)/.test(mainText)
    || !/finally \{[\s\S]{0,80}readySignal\.cancel\(\)/.test(mainText)
    || !/removeListener\('did-navigate'/.test(mainText)
    || !/for \(let attempt = 1; attempt <= 2; attempt \+= 1\)/.test(mainText)
    || !/did-fail-load/.test(mainText)
    || !/render-process-gone/.test(mainText)
    || !/unresponsive/.test(mainText)) {
    fail('Main window navigation must accept a trusted committed document, clean up readiness listeners, retry once, and preserve real failure signals');
  }
  if (!/const failedWindow = mainWindow/.test(mainText) || !/failedWindow\.destroy\(\)/.test(mainText) || !/setImmediate\(\(\) => app\.quit\(\)\)/.test(mainText)) {
    fail('Startup failure must destroy the hidden BrowserWindow and release the single-instance lock');
  }
  if (!/if \(mainWindow === win\)[\s\S]{0,120}mainWindow = null/.test(mainText) || !/win\.on\('closed'/.test(mainText)) {
    fail('BrowserWindow event closures must only clear the same local window instance');
  }
  if (!fs.existsSync(path.join(appRoot, 'desktop', 'startup.html')) || !/win\.loadFile\(startupShell\)/.test(mainText)) {
    fail('A lightweight packaged startup shell must remain available while the local server is preparing');
  }
  const singleInstanceBranch = mainText.indexOf('if (!gotSingleInstanceLock)');
  const startupStateCall = "writeStartupState('module-loaded'";
  if (singleInstanceBranch < 0 || mainText.slice(0, singleInstanceBranch).includes(startupStateCall) || !mainText.slice(singleInstanceBranch).includes(startupStateCall)) {
    fail('Secondary instances must quit before they can overwrite the primary startup-state.json');
  }
  if (!/function qqLoginCompletionFromCookie[\s\S]{0,420}partial:\s*true[\s\S]{0,160}QQ_PLAYBACK_AUTH_INCOMPLETE/.test(mainText) ||
      !/resolve\(qqLoginCompletionFromCookie\(cookie\)\)/.test(mainText) ||
      /partial:\s*true,\s*cookie/.test(mainText)) {
    fail('QQ login must report a web-only session as incomplete without returning its cookie for persistence');
  }
  if (/resolve\(neteaseCookieHasLogin\(cookie\)[\s\S]{0,140}!qqCookieHasPlaybackLogin/.test(mainText)) {
    fail('Netease login must not reuse QQ playback authorization checks');
  }
  if (!/if \(!qqPlaybackReady\)/.test(qqLoginText) || !/播放授权未完成/.test(qqLoginText)) {
    fail('QQ frontend login flow must not close as a full success when playback authorization is incomplete');
  }
  if (!/Buffer\.from\(raw,\s*'hex'\)\.toString\('utf8'\)/.test(serverText) || !/QQ_LIKED_PLAYLIST_ID/.test(serverText) || !/fetchQQLikedPlaylistPage/.test(serverText) || !/music\.srfDissInfo\.DissInfo/.test(serverText) || !/method: 'CgiGetDiss'/.test(serverText) || !/song_begin: offset/.test(serverText) || !/song_num: limit/.test(serverText) || !/rawTracks\.map\(mapQQPlaylistTrack\)/.test(serverText) || !/songlist_size/.test(serverText) || !/const upstreamTotal/.test(serverText) || !/firstTrack && firstTrack\.cover/.test(serverText) || !/getCachedQQLikedPlaylistCover/.test(serverText) || !/handleQQLikedPlaylistTracks/.test(serverText) || !/QQ_LIKED_AUTH_MESSAGE/.test(serverText)) {
    fail('QQ profile hex nicknames and the CgiGetDiss liked-playlist paging/first-cover flow must stay supported');
  }
  if (/fcg_musiclist_getmyfav|fetchQQLikedPlaylistMap/.test(serverText)) {
    fail('QQ liked playlist must not regress to the retired fcg_musiclist_getmyfav endpoint or N+1 song-detail map');
  }
  if (!/created\.concat\(collected\)\.filter\(pl => !isQQFavoritePlaylist\(pl\)\)/.test(serverText) || !/base\.unshift\(likedCard\)/.test(serverText)) {
    fail('QQ user playlists must replace any raw liked card with the enriched first-track-cover card');
  }
  const favoriteStart = serverText.indexOf('function isQQLikedPlaylistId');
  const favoriteEnd = serverText.indexOf('\nfunction isQzoneBackgroundPlaylist', favoriteStart);
  const favoriteSandbox = { QQ_LIKED_PLAYLIST_ID: 'liked', QQ_LIKED_DIRID: 201, String, Number };
  vm.runInNewContext(serverText.slice(favoriteStart, favoriteEnd), favoriteSandbox, { filename: 'qq-liked-recognition.js' });
  if (!favoriteSandbox.isQQFavoritePlaylist({ id: 'ordinary', dirid: 201, name: 'anything' }) || !favoriteSandbox.isQQFavoritePlaylist({ id: 'ordinary', dirid: 0, name: '我的喜欢' }) || favoriteSandbox.isQQFavoritePlaylist({ id: 'rock', dirid: 99, name: '我喜欢的摇滚' })) {
    fail('QQ liked-card recognition must accept the official dirid/exact name without deleting ordinary user playlists that merely contain liked wording');
  }
  const likedPageStart = serverText.indexOf('async function fetchQQLikedPlaylistPage');
  const likedPageEnd = serverText.indexOf('\nfunction buildQQLikedPlaylistCard', likedPageStart);
  let qqPayload = null;
  let qqResponse = {
    req_0: {
      code: 0,
      data: {
        songlist: [
          { id: 'first', name: 'First', cover: 'album-cover' },
          { id: 'unavailable', name: '', mid: '' },
          { id: 'second', name: 'Second' },
        ],
        songlist_size: 3,
        total_song_num: 457,
        hasmore: 1,
        dirinfo: { dir_name: 'liked' },
      },
    },
  };
  const likedPageSandbox = {
    QQ_LIKED_DIRID: 201,
    qqMusicRequest: async payload => {
      qqPayload = payload;
      return qqResponse;
    },
    mapQQPlaylistTrack: track => track,
    Math,
    Number,
    parseInt,
    Error,
  };
  vm.runInNewContext(serverText.slice(likedPageStart, likedPageEnd), likedPageSandbox, { filename: 'qq-liked-page.js' });
  const likedPage = await likedPageSandbox.fetchQQLikedPlaylistPage({ limit: 48, offset: 96 });
  if (!qqPayload || qqPayload.req_0.module !== 'music.srfDissInfo.DissInfo' || qqPayload.req_0.method !== 'CgiGetDiss' || qqPayload.req_0.param.dirid !== 201 || qqPayload.req_0.param.song_begin !== 96 || qqPayload.req_0.param.song_num !== 48 || likedPage.total !== 457 || likedPage.tracks.length !== 2 || likedPage.pageSpan !== 3 || likedPage.nextOffset !== 99 || !likedPage.hasMore) {
    fail('QQ liked playlist must preserve exact CgiGetDiss paging and total/next-offset semantics');
  }
  qqResponse = { code: 0 };
  let missingBlockRejected = false;
  try {
    await likedPageSandbox.fetchQQLikedPlaylistPage({ limit: 48, offset: 0 });
  } catch (error) {
    missingBlockRejected = error && error.code === 'QQ_LIKED_SYNC_FAILED';
  }
  qqResponse = { code: 0, req_0: { code: 10004, data: { code: -100008 } } };
  let authFailureClassified = false;
  try {
    await likedPageSandbox.fetchQQLikedPlaylistPage({ limit: 48, offset: 0 });
  } catch (error) {
    authFailureClassified = error && error.code === 'QQ_LIKED_REQUIRES_PLAYBACK_LOGIN';
  }
  if (!missingBlockRejected || !authFailureClassified) {
    fail('QQ liked sync must reject incomplete musicu responses and classify expired playback authorization explicitly');
  }
  qqResponse = {
    req_0: {
      code: 0,
      data: { songlist: [], songlist_size: 0, total_song_num: 457, hasmore: 0 },
    },
  };
  const beyondEndPage = await likedPageSandbox.fetchQQLikedPlaylistPage({ limit: 48, offset: 480 });
  if (beyondEndPage.total !== 457 || beyondEndPage.nextOffset !== 480 || beyondEndPage.hasMore) {
    fail('QQ liked sync must preserve upstream total on an empty beyond-end page');
  }
  const likedCardStart = serverText.indexOf('function buildQQLikedPlaylistCard');
  const likedCardEnd = serverText.indexOf('\nasync function getQQLikedPlaylistCard', likedCardStart);
  const likedCoverCacheStart = serverText.indexOf('const qqLikedPlaylistCoverByUser');
  const likedCoverCacheEnd = serverText.indexOf('\nfunction isQQLikedPlaylistId', likedCoverCacheStart);
  const likedCardSandbox = {
    QQ_LIKED_PLAYLIST_ID: 'qq-liked',
    QQ_LIKED_DIRID: 201,
    QQ_LIKED_PLAYLIST_NAME: 'Liked',
    QQ_LIKED_PLAYLIST_COVER: 'fallback-cover',
    Map,
    String,
    Math,
    Number,
  };
  vm.runInNewContext(serverText.slice(likedCoverCacheStart, likedCoverCacheEnd) + '\n' + serverText.slice(likedCardStart, likedCardEnd), likedCardSandbox, { filename: 'qq-liked-card.js' });
  const likedInfo = { userId: 'listener-1', nickname: 'Listener' };
  const firstPageForCard = { tracks: [{ id: 'first', name: 'First', cover: 'album-cover' }], total: 457, offset: 0 };
  const likedCard = likedCardSandbox.buildQQLikedPlaylistCard(likedInfo, firstPageForCard, '');
  const secondPageCard = likedCardSandbox.buildQQLikedPlaylistCard(likedInfo, { tracks: [{ id: 'page-49', name: 'Page 49', cover: 'page-2-cover' }], total: 457, offset: 48 }, '');
  const emptiedCard = likedCardSandbox.buildQQLikedPlaylistCard(likedInfo, { tracks: [], total: 0, offset: 0 }, '');
  if (!likedCard || likedCard.cover !== 'album-cover' || likedCard.trackCount !== 457 || secondPageCard.cover !== 'album-cover' || emptiedCard.cover !== 'fallback-cover') {
    fail('QQ liked playlist card must keep the first album cover stable across pages and clear it when the playlist becomes empty');
  }
  if (!/var liked = isLikedPlaylistContext\(id, title, r && r\.playlist\)/.test(playlistLoadText) || !/if \(liked\) markSongsLiked\(playQueue, true\)/.test(playlistLoadText) || !/if \(state\.liked\) markSongsLiked\(pageTracks, true\)/.test(playlistLoadText)) {
    fail('QQ/Spotify virtual liked playlists must mark loaded queue tracks as liked');
  }
  if (!/data-login-provider-sort/.test(qqLoginText) || !/login-provider-sort-handle/.test(qqLoginText) || !/closest\('\[data-login-provider-sort\]'\)/.test(qqLoginText) || !/closest\('\.flow-port\.out'\)/.test(qqLoginText)) {
    fail('login workflow must split provider sorting onto a left drag handle and keep wiring on the right flow port');
  }
  const loginProviderExternalSwitchOk =
    /function handleLoginProviderExternalSwitchEvent\(e,\s*provider\)/.test(qqLoginText) &&
    /externalSwitch\.setAttribute\('role',\s*'switch'\)/.test(qqLoginText) &&
    /externalSwitch\.setAttribute\('aria-checked'/.test(qqLoginText) &&
    /login-provider-external-label">展示/.test(qqLoginText) &&
    /externalSwitch\.addEventListener\('click'[\s\S]{0,180}handleLoginProviderExternalSwitchEvent/.test(qqLoginText) &&
    !/function selectLoginProviderNode\(provider\)\s*\{[\s\S]{0,260}toggleAccountProviderExternal\(provider\)/.test(qqLoginText) &&
    /\.login-provider-external-switch\s*\{[\s\S]{0,220}width:\s*56px[\s\S]{0,360}pointer-events:\s*auto/.test(cssText) &&
    /\.login-provider-external-label\s*\{/.test(cssText) &&
    /button\.external-on \.login-provider-external-switch i\s*\{[\s\S]{0,80}left:\s*38px/.test(cssText);
  if (!loginProviderExternalSwitchOk) {
    fail('login provider capsules must show a real on/off switch for external top-pill visibility');
  }
  if (/Math\.abs\(dy\)\s*>\s*Math\.abs\(dx\)[\s\S]{0,80}\?\s*'sort'\s*:\s*'wire'/.test(qqLoginText) || /mode\s*===\s*'wire'/.test(qqLoginText)) {
    fail('login workflow must not guess sort vs wire from drag direction');
  }
  if (!/function scheduleLoginWorkflowEdges/.test(qqLoginText) || !/scheduleLoginWorkflowEdges\('open'\)/.test(qqLoginText) || !/scheduleLoginWorkflowEdges\('node-ui'\)/.test(qqLoginText) || !/scheduleLoginWorkflowEdges\('resize'\)/.test(qqLoginText)) {
    fail('login workflow edges must be rescheduled after modal open, UI layout changes, and resize to avoid offset lines');
  }
  if (!/function captureAccountProviderRects/.test(accountUtilsText) || !/function animateAccountProviderReorder/.test(accountUtilsText) || !/provider-reorder-moving/.test(accountUtilsText) || !/return order\.filter\(function \(provider\) \{ return selected\.indexOf\(provider\) >= 0; \}\);/.test(accountUtilsText)) {
    fail('provider capsule order must use FLIP animation and external pills must follow the explicit highlighted list');
  }
  if (!/\.login-provider-sort-handle/.test(cssText) || !/grid-template-columns:\s*18px\s+35px\s+minmax\(0,\s*1fr\)\s+auto/.test(cssText) || !/\.top-account-pill\.provider-reorder-moving/.test(cssText)) {
    fail('provider capsule sorting must expose a left drag handle and animated reorder styles');
  }
  console.log('[OK] Provider auth cookies stay on userData paths and QQ partial login is explicit.');
}

function checkPlaybackResumeRecoveryGuard() {
  logStep('Long-pause playback resume recovery guard');
  const coreStoreText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '00-core-stores.js'), 'utf8');
  const controlsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '14-player-controls.js'), 'utf8');
  const playbackText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '13-playback-start-audio.js'), 'utf8');
  const progressText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '04-progress-seek.js'), 'utf8');
  if (!/playbackResumeRecovery/.test(coreStoreText) || !/pausedAt/.test(coreStoreText) || !/PLAYBACK_RESUME_STALL_DELAYS/.test(coreStoreText) || !/PLAYBACK_RESUME_LONG_PAUSE_MS/.test(coreStoreText) || !/PLAYBACK_RESUME_LONG_PAUSE_PROVIDER_MS/.test(coreStoreText)) {
    fail('global playback resume recovery state must be defined');
  }
  if (!/function recoverCurrentTrackPlaybackFromFreshUrl/.test(controlsText) || !/playQueueAt\(currentIdx,[\s\S]{0,260}resumeRecovery: true/.test(controlsText)) {
    fail('long-pause recovery must refresh the current provider URL and resume from the old position');
  }
  if (!/function updatePlaybackResumePauseMarker/.test(controlsText) || !/function playbackResumePausedLongEnough/.test(controlsText) || !/recoverCurrentTrackPlaybackFromFreshUrl\('long-pause-stale-source'/.test(controlsText) || !/updatePlaybackResumePauseMarker\(reason\)/.test(fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '12-playback-switch-core.js'), 'utf8'))) {
    fail('manual resume after a long pause must refresh stale provider URLs before trying the old audio src');
  }
  if (!/function schedulePlaybackStallRecovery/.test(controlsText) || !/ensureAudiblePlaybackGain\('resume-stall-before-refresh'\)/.test(controlsText) || !/recoverCurrentTrackPlaybackFromFreshUrl\('play-rejected'/.test(controlsText)) {
    fail('playback resume recovery must cover rejected play() and stalled media after WebAudio checks');
  }
  if (!/function trackSwitchStallRecoveryAllowed/.test(controlsText) || !/playbackResumeProvider\(song\) === 'qishui'/.test(controlsText) || !/\(opts\.trackSwitch \|\| opts\.manual \|\| opts\.fastResume\)/.test(controlsText) || !/function nudgeQishuiTrackStart/.test(controlsText) || !/qishui-track-start-stalled/.test(controlsText) || /if \(opts\.trackSwitch && !opts\.resumeRecovery\) return;/.test(controlsText)) {
    fail('Qishui auto-next start stalls must be watched, nudged, and refreshed instead of skipping track-switch recovery');
  }
  if (
    !/resumeRecovery: !!opts\.resumeRecovery/.test(playbackText)
    || !/audioEl !== audio/.test(progressText)
    || !/__mineradioTrackSwitchToken\) !== Number\(trackSwitchToken\)/.test(progressText)
    || !/playbackMediaMatchesCurrentQueueItem\(audioEl\)/.test(progressText)
    || !/schedulePlaybackStallRecovery\(name,[\s\S]{0,260}ownerQueueItemKey/.test(progressText)
    || !/function playbackStallRecoveryOwnerStillCurrent/.test(controlsText)
  ) {
    fail('track-start and media error/stalled events must feed the shared resume recovery path');
  }
  console.log('[OK] Long-pause resume recovery refreshes expired provider URLs across providers.');
}

function checkAudioOutputWorkflowPanelGuard() {
  logStep('Audio output workflow panel guard');
  const indexText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const qualityText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '00-api-quality-output.js'), 'utf8');
  const modalUtilsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '08-account', '01-login-modal-utils.js'), 'utf8');
  if (!/id="audio-output-workflow-modal"/.test(indexText) || !/id="audio-output-workflow-body"/.test(indexText) || !/openAudioOutputWorkflowPanel\(\)/.test(indexText)) {
    fail('audio output workflow must have a dedicated derivative modal entry instead of only the compact settings panel');
  }
  if (!/function openAudioOutputWorkflowPanel/.test(qualityText) || !/function closeAudioOutputWorkflowPanel/.test(qualityText) || !/renderAudioRouteWorkflowEdgesForRoot/.test(qualityText) || !/document\.querySelectorAll\('\.audio-route-graph'\)/.test(qualityText) || !/audio-output-summary-card/.test(qualityText) || !/audio-route-board-head/.test(qualityText) || !/route-board-title/.test(qualityText) || !/route-lane-state/.test(qualityText) || !/audio-source-meter/.test(qualityText) || !/sortedRouteItems/.test(qualityText) || !/audioOutputMirrorRuntime/.test(qualityText) || !/audioOutputMirrorStatusText/.test(qualityText) || !/实验镜像监听/.test(qualityText) || !/不是系统级多输出/.test(qualityText)) {
    fail('audio output workflow must render compact settings summary and full modal route graph');
  }
  if (!/audio-output-workflow-modal/.test(cssText) || !/audio-output-workflow-modal \.audio-route-graph[\s\S]{0,320}grid-template-areas: "source board" "status board"/.test(cssText) || !/audio-route-board/.test(cssText) || !/route-board-badges/.test(cssText) || !/route-lane-state/.test(cssText) || !/audio-source-meter/.test(cssText) || !/audio-route-node\.pending/.test(cssText) || !/audio-route-node\.warning/.test(cssText) || !/audio-output-workflow-modal \.workflow-link-layer[\s\S]{0,120}display: none/.test(cssText) || !/audio-output-summary-card/.test(cssText)) {
    fail('audio output workflow modal must expose a Loopback-style patch bay board instead of a three-column device table');
  }
  if (!/\['audio-output-workflow-modal', closeAudioOutputWorkflowPanel\]/.test(modalUtilsText)) {
    fail('audio output workflow modal must close through the shared backdrop modal handler');
  }
  console.log('[OK] Audio output workflow opens as a dedicated wiring panel and leaves settings compact.');
}

function checkVolumeWheelStepGuard() {
  logStep('Volume wheel step guard');
  const audioText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '08-audio-graph-controls.js'), 'utf8');
  if (!/function adjustVolumeByWheel/.test(audioText) || !/var step = 0\.01;/.test(audioText)) {
    fail('volume control mouse wheel must adjust exactly 1 percent per wheel event');
  }
  console.log('[OK] Volume wheel step is 1%.');
}

function checkNonCurrentAudioPrefetchGuard() {
  logStep('Non-current audio prefetch guard');
  const beatPrefetchText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '03-beat', '00-tempo-worker-cache-prefetch.js'), 'utf8');
  if (!/QUEUE_BEAT_AUDIO_PREFETCH_ENABLED\s*=\s*false/.test(beatPrefetchText)) {
    fail('queue beat prefetch must not request non-current song audio URLs by default');
  }
  if (!/function scheduleQueueBeatPrefetch[\s\S]{0,140}if \(!QUEUE_BEAT_AUDIO_PREFETCH_ENABLED\) return;/.test(beatPrefetchText)) {
    fail('scheduleQueueBeatPrefetch must return before touching non-current audio URL prefetch work');
  }
  if (!/async function runQueueBeatPrefetch[\s\S]{0,120}if \(!QUEUE_BEAT_AUDIO_PREFETCH_ENABLED\) return;/.test(beatPrefetchText)) {
    fail('runQueueBeatPrefetch must also be guarded when an old timer fires');
  }
  console.log('[OK] Non-current audio URL prefetch stays disabled by default.');
}

function checkCuefieldAutoMixGuard() {
  logStep('Cuefield AutoMix integration guard');
  const serverText = fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8');
  const desktopText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
  const loaderText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'index-loader.js'), 'utf8');
  const htmlText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const coreText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '16-cuefield-automix-core.js'), 'utf8');
  const timelineText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '17-cuefield-timeline-executor.js'), 'utf8');
  const integrationText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '18-cuefield-automix-integration.js'), 'utf8');
  const adapterText = fs.readFileSync(path.join(appRoot, 'cuefield', 'adapter-mineradio.js'), 'utf8');
  const bridgeText = fs.readFileSync(path.join(appRoot, 'cuefield', 'mineradio-bridge.js'), 'utf8');
  const recipeText = fs.readFileSync(path.join(appRoot, 'cuefield', 'recipe-planner.js'), 'utf8');
  const beatPrefetchText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '03-beat', '00-tempo-worker-cache-prefetch.js'), 'utf8');
  const coreStoreText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '00-core-stores.js'), 'utf8');
  const beatCameraText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '01-scene', '02-beat-camera-runtime.js'), 'utf8');
  const audioGraphText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '08-audio-graph-controls.js'), 'utf8');
  const playbackText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '13-playback-start-audio.js'), 'utf8');
  const controlsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '14-player-controls.js'), 'utf8');
  const progressText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '04-progress-seek.js'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  const beta = JSON.parse(fs.readFileSync(path.join(appRoot, 'electron-builder.internal-beta.json'), 'utf8'));
  if (!packageJson.build.files.includes('cuefield/**/*') || !(beta.files || []).includes('cuefield/**/*')) {
    fail('Cuefield runtime files must be included in regular and internal-beta packages');
  }
  if (!/16-cuefield-automix-core\.js/.test(loaderText) || !/17-cuefield-timeline-executor\.js/.test(loaderText) || !/18-cuefield-automix-integration\.js/.test(loaderText) || !/id="cuefield-automix-btn"/.test(htmlText) || !/id="cuefield-feedback"/.test(htmlText) || !/#cuefield-automix-btn\.cuefield-automix-on/.test(cssText)) {
    fail('Cuefield AutoMix needs loaded runtime modules, a default-off control, and local feedback UI');
  }
  if (!/var cuefieldAutoMixEnabled = false/.test(integrationText) || !/CUEFIELD_AUTOMIX_STORE_KEY/.test(integrationText) || !/if \(!cuefieldAutoMixEnabled \|\| !audio/.test(integrationText) || !/function toggleCuefieldAutoMix/.test(integrationText)) {
    fail('Cuefield AutoMix must be opt-in and must not prepare while disabled');
  }
  if (!/function createCuefieldAutoMix/.test(coreText) || !/function buildCuefieldTimelineExecution/.test(timelineText) || !/planCuefieldTransitionFromCache/.test(serverText) || !/pn === '\/api\/cuefield\/transition'/.test(serverText) || !/pn === '\/api\/cuefield\/feedback'/.test(serverText)) {
    fail('Cuefield planner, timeline executor, and local server endpoints are incomplete');
  }
  if (!/MINERADIO_BEAT_COMBOS/.test(adapterText) || !/raw\[7\]/.test(adapterText) || !/flags & 1/.test(adapterText) || !/flags & 2/.test(adapterText) || !/flags & 4/.test(adapterText) || /raw\[8\][^\n]{0,80}downbeat|raw\[8\][^\n]{0,80}>=\s*7/.test(adapterText)) {
    fail('Cuefield must decode packed comboIdx and flags independently so ordinary camera/pulse flags cannot become false downbeats');
  }
  if (!/chooseTransitionWindow/.test(bridgeText) || !/buildStructureMap/.test(bridgeText) || !/normalizeRecentRecipes/.test(bridgeText) || !/resolveListeningFloor/.test(bridgeText) || !/safety-long-blend/.test(recipeText) || !/end-of-track-crossfade/.test(bridgeText)) {
    fail('Cuefield must keep structure-aware window selection, recipe cooldown, listening floors, and bounded safety/end-of-track fallbacks');
  }
  if (!/cuefieldLyricTextForSong/.test(integrationText) || !/fromLrc:\s*lyricPair\[0\]/.test(integrationText) || !/toLrc:\s*lyricPair\[1\]/.test(integrationText) || !/allowWeak:\s*false/.test(integrationText) || !/allowSafetyFallback:\s*true/.test(integrationText) || !/allowLiveEndCrossfadeFallback:\s*true/.test(integrationText)) {
    fail('Cuefield must consume the existing lyric cache, reject weak beatmixes, and retain explicit bounded safety fallbacks');
  }
  if (!/var provider = songProviderKey\(song\)/.test(beatPrefetchText) || !/return provider \+ ':' \+ id/.test(beatPrefetchText) || !/resolveAlbumGaplessPlaybackData\(song\)/.test(beatPrefetchText)) {
    fail('Cuefield beatmaps must use provider-aware keys and resolve the same provider playback path as the real player');
  }
  if (!/CUEFIELD_FEEDBACK_FILE/.test(desktopText) || !/appendCuefieldFeedback/.test(serverText) || !/readCuefieldFeedbackStats/.test(serverText) || /feedback-remote|CUEFIELD_FEEDBACK_REMOTE|https?:\/\/.*cuefield/i.test(serverText + integrationText)) {
    fail('Cuefield feedback must remain local and must not wire a remote feedback service');
  }
  if (!/albumGaplessHandoff:\s*true/.test(integrationText) || !/resetCuefieldAutoMix\(opts\.cuefieldAutoMix/.test(playbackText) || !/scheduleCuefieldAutoMixPrepare\(token, idx/.test(playbackText) || !/audio\.onended = function \(\) \{[\s\S]{0,160}cuefieldAutoMixExecuting/.test(playbackText) || !/tickCuefieldAutoMix/.test(progressText) || !/resetCuefieldAutoMix\('manual-seek'\)/.test(progressText)) {
    fail('Cuefield must hand off through the proven player path and reset for manual seeking');
  }
  if (!/function claimCuefieldPreparedAudioForPlayback/.test(integrationText) || !/media === audio[\s\S]{0,100}claimCuefieldPreparedAudioForPlayback\(media\);[\s\S]{0,40}return;/.test(integrationText) || !/audio = opts\.preloadedAudio;[\s\S]{0,180}claimCuefieldPreparedAudioForPlayback\(audio\)/.test(playbackText) || !/preserveExecution:\s*!!opts\.cuefieldAutoMix/.test(playbackText)) {
    fail('Cuefield must transfer preloaded B-deck ownership before preparing another track so it cannot pause active playback');
  }
  if (!/function buildEqualPowerCurve/.test(timelineText) || !/function cuefieldVolumeCurveValue/.test(integrationText) || !/equal-power-in/.test(integrationText) || !/equal-power-out/.test(integrationText) || !/function cuefieldApplyGraphEcho/.test(integrationText) || !/function cuefieldApplyGraphDuck/.test(integrationText) || !/function cuefieldApplyTimelineAction/.test(integrationText) || !/volume-only-fallback/.test(integrationText)) {
    fail('Cuefield must execute equal-power A/B volume curves and safely downgrade advanced graph actions');
  }
  if (!/await cuefieldApplyTimelineAction\(action, pending, nextMedia, context\)/.test(integrationText) || !/handoffDelayMs > elapsedMs[\s\S]{0,120}await cuefieldDelay/.test(integrationText) || !/nextMedia\.paused \|\| nextMedia\.ended/.test(integrationText) || !/var handoffReady = await runCuefieldTimeline\(pending, nextMedia, transitionContext\);[\s\S]{0,150}if \(!handoffReady \|\| !cuefieldTransitionStillCurrent\(pending, transitionContext\)\)/.test(integrationText)) {
    fail('Cuefield ownership handoff must await the cancellable action timeline and a live incoming deck');
  }
  if (!/var cuefieldTransitionGeneration = 0/.test(integrationText) || !/cuefieldTransitionGeneration\+\+;[\s\S]{0,120}clearCuefieldTimelineTimers\(\)/.test(integrationText) || !/function cuefieldDelay\(delayMs, generation\)/.test(integrationText) || !/context\.generation !== cuefieldTransitionGeneration/.test(integrationText) || !/audio !== context\.outgoingMedia/.test(integrationText)) {
    fail('Cuefield reset, seek, and pause must invalidate delayed transitions before they can wake and rewrite current audio gain');
  }
  if (!/var cuefieldMediaFadeTimer = 0/.test(integrationText) || !/cuefieldMediaFadeTimer = setInterval\(function \(\) \{[\s\S]{0,100}applyStep\(\)/.test(integrationText) || !/context\.outgoingMedia && context\.outgoingMedia\.currentTime/.test(integrationText) || !/if \(cuefieldMediaFadeTimer\) clearInterval\(cuefieldMediaFadeTimer\)/.test(integrationText)) {
    fail('Cuefield gain must follow the outgoing media clock and keep a timer watchdog when visual RAF is throttled');
  }
  if (!/function recoverCuefieldAutoMixEndedOutgoing/.test(integrationText) || !/__mineradioCuefieldEndedRecoveryToken/.test(playbackText)) {
    fail('Cuefield must resume ordinary queue advance if its outgoing deck ends before a failed handoff settles');
  }
  if (!/__mineradioPreparedGraphFailed/.test(integrationText) || !/The first element is permanently tied/.test(integrationText)) {
    fail('Cuefield must rebuild a clean fallback media element after a partial WebAudio graph failure');
  }
  if (!/var cuefieldActiveTransitionContext = null/.test(integrationText) || !/shouldRestoreOutgoing[\s\S]{0,520}rampAudioOutputGain\(targetVolume, 120\)/.test(integrationText) || !/async function runCuefieldNormalFallback\(\)/.test(integrationText) || !/audio !== nextMedia && audio !== transitionContext\.outgoingMedia/.test(integrationText)) {
    fail('Cuefield disable/cancel must restore its outgoing deck and pre-adoption handoff failures must use normal playback fallback');
  }
  if (!/function cuefieldAutoMixBlockedByAlbumGapless\(index\)[\s\S]{0,120}albumGaplessQueueCanAdvance\(index\)/.test(integrationText) || !/if \(cuefieldAutoMixBlockedByAlbumGapless\(currentIndex\)\) return false;/.test(integrationText) || !/cuefieldAutoMixBlockedByAlbumGapless\(pending\.currentIndex\)[\s\S]{0,180}album-gapless-priority/.test(integrationText) || !/function startAlbumGaplessMix\(preload, reason, remaining\)[\s\S]{0,360}cuefieldAutoMixExecuting[^\n]*return false;/.test(playbackText)) {
    fail('Cuefield AutoMix and album gapless must stay mutually exclusive so only one prepared B-deck can transition');
  }
  if (!/albumGaplessMixed:\s*true/.test(integrationText) || !/preserveGain:\s*albumGaplessMixed/.test(playbackText) || !/preserveGain:\s*!!opts\.preserveGain/.test(controlsText) || !/else if \(!opts\.preserveGain\) restorePlaybackGain\(\)/.test(controlsText)) {
    fail('Cuefield mixed handoff must preserve the completed incoming gain through the shared playback-start path');
  }
  if (!/CUEFIELD_AUTOMIX_NORMAL_START_SETTLE_MS = 4200/.test(integrationText) || !/CUEFIELD_AUTOMIX_HANDOFF_SETTLE_MS = 5200/.test(integrationText) || !/function cuefieldAutoMixVisualTransitionBusy/.test(integrationText) || !/cuefieldAutoMixVisualTransitionBusy\(\)[\s\S]{0,120}scheduleCuefieldAutoMixPrepare\(token, currentIndex, 900/.test(integrationText) || !/cuefieldAutoMixPostSwitchDelay\(!!opts\.cuefieldAutoMix\)/.test(playbackText)) {
    fail('Cuefield background analysis must wait for cover and particle transition work to settle');
  }
  if (!/function contextStillCurrent\(\)/.test(integrationText) || !/var analysisToken = beatMapToken/.test(integrationText) || !/descriptor = await cuefieldAutoMixAudioDescriptor\(song\);[\s\S]{0,220}analysisToken !== beatMapToken[\s\S]{0,120}cuefieldAutoMixVisualTransitionBusy\(\)/.test(integrationText) || !/analyzeAudioBeats\(descriptor\.proxyUrl, null, analysisToken/.test(integrationText)) {
    fail('Cuefield beat analysis must revalidate track ownership and visual-idle state after resolving the next audio URL');
  }
  if (!/audioSourceMedia = null/.test(coreStoreText) || !/function cuefieldCreatePreparedAudioGraph/.test(integrationText) || !/createMediaElementSource\(media\)/.test(integrationText) || !/__mineradioPreparedAudioGraph/.test(audioGraphText) || !/preparedGraph\.adopted = true/.test(audioGraphText) || !/audioSourceMedia = audio/.test(audioGraphText)) {
    fail('Cuefield must prepare B in the same AudioContext and adopt its existing source/analyser/gain graph without rebinding mid-playback');
  }
  if (!/function resetAudioVisualState\(options\)/.test(beatCameraText) || !/preserveEnvelope/.test(beatCameraText) || !/function resetBeatCameraSync\(t, options\)/.test(beatCameraText) || !/preserveMomentum/.test(beatCameraText) || !/resetAudioVisualState\(\{ preserveEnvelope: albumGaplessMixed \}\)/.test(playbackText) || !/preserveMomentum: albumGaplessMixed/.test(playbackText) || !/syncBeatMapPlaybackCursor\(audio \? audio\.currentTime : 0, albumGaplessMixed\)/.test(playbackText)) {
    fail('mixed handoff must preserve the live particle envelope and camera momentum while aligning the new beat-map cursor');
  }
  if (!/var cuefieldMediaFadeSerial = 0/.test(integrationText) || !/function cancelCuefieldMediaFade/.test(integrationText) || !/function claimCuefieldPreparedAudioForPlayback\(media\)[\s\S]{0,180}cancelCuefieldMediaFade\(\)/.test(integrationText) || !/serial !== cuefieldMediaFadeSerial/.test(integrationText) || !/await applyAudioOutputDevice\(nextMedia\)/.test(integrationText)) {
    fail('Cuefield must cancel the temporary B-deck fade and apply the selected output device before ownership handoff');
  }
  console.log('[OK] Cuefield AutoMix is opt-in, packages with the app, uses local feedback, and reuses safe handoff controls.');
}

function checkAlbumDetailGaplessGuard() {
  logStep('Album detail and explicit gapless guard');
  const htmlText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const detailText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '06-track-detail-lyrics-actions.js'), 'utf8');
  const coreStoreText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '00-core-stores.js'), 'utf8');
  const playbackText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '13-playback-start-audio.js'), 'utf8');
  const controlsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '14-player-controls.js'), 'utf8');
  const snapshotText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '09-queue-snapshot-autoplay.js'), 'utf8');
  const serverText = fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8');
  const spotifyText = fs.readFileSync(path.join(appRoot, 'spotify-api.js'), 'utf8');
  if (!/thumb-cover[\s\S]{0,180}openTrackDetailModal\('album'\)/.test(htmlText) || !/control-cover[\s\S]{0,260}openTrackDetailModal\('album'\)/.test(htmlText)) {
    fail('album detail must be reachable from both current cover entry points');
  }
  if (!/\.detail-action-toggle/.test(cssText) || !/\.control-cover:focus-visible/.test(cssText)) {
    fail('album detail entry and gapless toggle must have visible UI affordances');
  }
  if (!/function albumDetailUrlForSong/.test(detailText) || !/function renderAlbumSongList/.test(detailText) || !/function toggleAlbumGaplessPlayback/.test(detailText) || !/function playAlbumDetailSong/.test(detailText)) {
    fail('track detail module must render album songs, play album queues, and expose the gapless toggle');
  }
  if (!/setAlbumGaplessPlaybackContext\(detailAlbumGaplessEnabled, detailAlbumContext/.test(detailText) || !/__albumGaplessKey/.test(detailText) || !/detailAlbumGaplessEnabled\s*=\s*true/.test(detailText)) {
    fail('album detail playback must tag album queues and pass the gapless context into playback');
  }
  if (!/handleNeteaseAlbumDetail/.test(serverText) || !/pn === '\/api\/album\/detail'/.test(serverText) || !/handleQQAlbumDetail/.test(serverText) || !/pn === '\/api\/qq\/album\/detail'/.test(serverText) || !/pn === '\/api\/spotify\/album\/detail'/.test(serverText)) {
    fail('server.js must expose Netease, QQ, and Spotify album detail endpoints');
  }
  if (!/async function handleSpotifyAlbumDetail/.test(spotifyText) || !/\/albums\/' \+ encodeURIComponent\(id\)/.test(spotifyText)) {
    fail('Spotify bridge must expose album detail tracks as metadata source');
  }
  if (!/albumGaplessState/.test(coreStoreText) || !/defaultEnabled:\s*true/.test(coreStoreText) || !/function albumGaplessDefaultEnabledForContext/.test(playbackText) || !/function setAlbumGaplessPlaybackContext/.test(playbackText) || !/function scheduleAlbumGaplessPreloadForCurrent/.test(playbackText) || !/function resolveAlbumGaplessPlaybackData/.test(playbackText) || !/albumGaplessHandoff/.test(playbackText) || !/playAlbumGaplessNextOnEnded/.test(playbackText)) {
    fail('album gapless playback must keep explicit state, preheat next audio, and use a sequential on-ended fallback');
  }
  if (!/ALBUM_GAPLESS_PREROLL_SECONDS\s*=\s*8\.5/.test(playbackText) || !/ALBUM_GAPLESS_MUTED_PREROLL_SECONDS\s*=\s*1\.05/.test(playbackText) || !/ALBUM_GAPLESS_MIX_SECONDS\s*=\s*0\.72/.test(playbackText) || !/ALBUM_GAPLESS_NEXT_ENTRY_FLOOR\s*=\s*0\.90/.test(playbackText) || !/ALBUM_GAPLESS_NEXT_ATTACK_MS\s*=\s*56/.test(playbackText) || !/ALBUM_GAPLESS_ADOPT_SLEW_MS\s*=\s*180/.test(playbackText) || !/ALBUM_GAPLESS_GAIN_STEP_MS\s*=\s*8/.test(playbackText) || !/ALBUM_GAPLESS_BOUNDARY_RELEASE_SECONDS\s*=\s*ALBUM_GAPLESS_MIX_SECONDS/.test(playbackText) || !/ALBUM_GAPLESS_FAST_SILENCE_HOLD_MS/.test(playbackText) || !/ALBUM_GAPLESS_DIRECT_SILENCE_RMS/.test(playbackText) || !/ALBUM_GAPLESS_RESIDUAL_FREQ_AVG/.test(playbackText) || !/albumGaplessTailFreqData/.test(playbackText) || !/function albumGaplessDirectTailSample/.test(playbackText) || !/function startAlbumGaplessPreroll/.test(playbackText) || !/function startAlbumGaplessMix/.test(playbackText) || !/runAlbumGaplessBalancedCrossfade/.test(playbackText) || !/albumGaplessTailSilenceProbe/.test(playbackText) || !/residualTail/.test(playbackText) || !/!tailProbe\.residualTail/.test(playbackText) || !/tail-direct-silence-crossmix/.test(playbackText) || !/boundary-crossmix-reset/.test(playbackText)) {
    fail('album gapless playback must scan tail waveform energy, skip long silent tails, and use balanced crossmix at the cue point');
  }
  if (!/function albumGaplessEqualPowerGains\(progress, outgoingStart, incomingTarget\)/.test(playbackText) || !/outgoing:\s*clampRange\(\(Number\(outgoingStart\) \|\| 0\) \* Math\.cos\(theta\)/.test(playbackText) || !/incoming:\s*clampRange\(\(Number\(incomingTarget\) \|\| 0\) \* Math\.sin\(theta\)/.test(playbackText) || !/function albumGaplessEqualPowerEntryProgress\(elapsedMs, durationMs\)/.test(playbackText) || !/Math\.asin\(ALBUM_GAPLESS_NEXT_ENTRY_FLOOR\)/.test(playbackText) || !/albumGaplessEqualPowerEntryProgress\(elapsedMs, durationMs\)/.test(playbackText) || !/media\.volume = 0;[\s\S]{0,260}preload\.fadeCompleted = false/.test(playbackText) || /media\.volume\s*=\s*ALBUM_GAPLESS_NEXT_ENTRY_FLOOR/.test(playbackText)) {
    fail('album gapless must keep the 0.90/56ms entry strength inside one paired equal-power curve instead of stacking it over a full-volume outgoing deck');
  }
  if (!/Promise\.resolve\(playResult\)\.then\(function \(\)/.test(playbackText) || !/return runAlbumGaplessBalancedCrossfade\(preload, mixMs\)/.test(playbackText) || !/\.then\(function \(completed\)/.test(playbackText) || !/if \(!completed\)/.test(playbackText) || !/preload\.fadeCompleted[\s\S]{0,900}startAlbumGaplessHandoff/.test(playbackText) || !/preload\.fadeResolve[\s\S]{0,180}resolveFade\(false\)/.test(playbackText)) {
    fail('album gapless must await media play and the completed fade state before ownership handoff, and cancellation must resolve false');
  }
  if (!/function disposeAlbumGaplessPreload\(preload\)/.test(playbackText) || !/await applyAudioOutputDevice\(media\);[\s\S]{0,420}serial !== albumGaplessState\.serial[\s\S]{0,320}disposeAlbumGaplessPreload\(\{ media: media \}\)/.test(playbackText) || !/if \(albumGaplessState\.preload === preload\) clearAlbumGaplessPreload\('album-gapless-mix-stale'\);[\s\S]{0,80}else disposeAlbumGaplessPreload\(preload\)/.test(playbackText)) {
    fail('stale album preload promises must revalidate after await and may only dispose the media object they own');
  }
  if (!/fadeWatchdogTimer = setInterval\(function \(\) \{[\s\S]{0,100}applyStep\(performance\.now\(\)\)/.test(playbackText) || !/function scheduleAlbumGaplessNormalFallback\(\)/.test(playbackText) || !/audio !== preload\.media && audio !== handoffPreviousAudio/.test(playbackText) || !/albumGaplessState\.preload\.mixStarted[\s\S]{0,160}restoreAlbumGaplessOutgoingIfCurrent/.test(playbackText)) {
    fail('album gapless must keep its gain curve alive off-RAF, restore on disable, and fall back whether B was adopted or not');
  }
  if (!/function playbackAttemptStillCurrent\(media, token\)/.test(controlsText) || !/expectedMedia: opts\.expectedMedia \|\| audio/.test(controlsText) || !/expectedToken: opts\.expectedToken == null \? trackSwitchToken/.test(controlsText) || !/expectedMedia: playbackMedia, expectedToken: token/.test(playbackText)) {
    fail('stale play promises must be scoped to the media element and track token that started them');
  }
  if (!/var albumGaplessAdoptedGain = 0/.test(playbackText) || !/albumGaplessAdoptedGain = albumGaplessMixed[\s\S]{0,100}Number\(audio\.volume\)/.test(playbackText) || !/setAudioOutputGainImmediate\(albumGaplessMixed \? albumGaplessAdoptedGain : audioSilentFloor\(\)\)/.test(playbackText) || !/preserveGain:\s*albumGaplessMixed/.test(playbackText) || !/rampAudioOutputGain\(targetVolume, ALBUM_GAPLESS_ADOPT_SLEW_MS\)/.test(playbackText) || !/preserveGain:\s*!!opts\.preserveGain/.test(controlsText) || !/else if \(!opts\.preserveGain\) restorePlaybackGain\(\)/.test(controlsText)) {
    fail('mixed album handoff must adopt, preserve, and gently settle the incoming gain without a restorePlaybackGain jump');
  }
  if (!/preloadedAudio/.test(playbackText) || !/preloadedProxyAudioUrl/.test(playbackText) || !/albumGaplessMixed/.test(playbackText) || !/skipShuffleOrder: true/.test(playbackText) || !/searchAlternatePlatformSong\(nextSong\)/.test(playbackText) || !/playQueue\[preload\.index\] = hydrateCustomCover\(preload\.song\)/.test(playbackText)) {
    fail('album gapless handoff must reuse preheated audio, pre-resolve metadata-source fallback, and force album order instead of shuffle order');
  }
  const coverText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '15-ripples-cover-depth.js'), 'utf8');
  if (!/albumGaplessSameAlbumCover/.test(playbackText) || !/noCoverTransition:\s*sameAlbumCoverSwitch/.test(playbackText) || !/opts\.noCoverTransition/.test(coverText)) {
    fail('same-album same-cover transitions must suppress cover particle/color transition effects');
  }
  if (!/albumMid/.test(snapshotText) || !/albumUri/.test(snapshotText)) {
    fail('playback snapshots must preserve album identifiers for album detail entry after restore');
  }
  console.log('[OK] Album detail opens from covers, loads provider album tracks, and gapless playback is explicit/preheated/sequential.');
}

function checkInternalBetaPackagingGuard() {
  logStep('Internal beta packaging guard');
  const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  const betaConfigPath = path.join(appRoot, 'electron-builder.internal-beta.json');
  if (!pkg.scripts || !/electron-builder\.internal-beta\.json/.test(pkg.scripts['build:win:internal-beta'] || '') || !/--publish never/.test(pkg.scripts['build:win:internal-beta'] || '')) {
    fail('internal beta build must stay on its own electron-builder config and use --publish never');
  }
  if (!fs.existsSync(betaConfigPath)) fail('electron-builder.internal-beta.json is required for isolated gray-test packaging');
  const beta = JSON.parse(fs.readFileSync(betaConfigPath, 'utf8'));
  const meta = beta.extraMetadata || {};
  const mineradio = meta.mineradio || {};
  const update = mineradio.update || {};
  if (meta.version !== '1.1.2' || beta.productName !== 'Mineradio_Beat' || meta.productName !== 'Mineradio_Beat') {
    fail('internal beta package metadata must identify v1.1.2 Mineradio_Beat');
  }
  if (!/dist-internal-beta/.test(beta.directories && beta.directories.output || '') || beta.publish !== null) {
    fail('internal beta output must stay in dist-internal-beta and not configure GitHub publishing');
  }
  if (beta.asar !== true) {
    fail('internal beta package must use asar so source files are not installed as plain resources');
  }
  if ((beta.appId || '') !== 'com.mineradio.beat.internal' || (mineradio.appUserModelId || '') !== 'com.mineradio.beat.internal') {
    fail('internal beta must use an isolated app id/AppUserModelID');
  }
  if (mineradio.runtimeName !== 'Mineradio_Beat' || update.disabled !== true || update.provider !== 'none') {
    fail('internal beta runtime name and update-disable metadata must stay isolated');
  }
  const requiredRuntimeFiles = ['qishui-audio-decryptor/**/*'];
  const packageBuildFiles = pkg.build && Array.isArray(pkg.build.files) ? pkg.build.files : [];
  const betaBuildFiles = Array.isArray(beta.files) ? beta.files : [];
  requiredRuntimeFiles.forEach((entry) => {
    if (!packageBuildFiles.includes(entry) || !betaBuildFiles.includes(entry)) {
      fail(`electron-builder files must include runtime dependency ${entry}`);
    }
  });
  if (!beta.nsis || beta.nsis.include !== 'build/installer-internal-beta.nsh' || !/Mineradio_Beat-v\$\{version\}-灰度内测版/.test(beta.nsis.artifactName || '')) {
    fail('internal beta NSIS config must use the beta wrapper and beta artifact name');
  }
  const wrapperText = fs.readFileSync(path.join(appRoot, 'build', 'installer-internal-beta.nsh'), 'utf8');
  if (!/MINERADIO_INSTALL_DIR_NAME "Mineradio_Beat"/.test(wrapperText) || !/禁止传播/.test(wrapperText) || !/installer\.nsh/.test(wrapperText)) {
    fail('internal beta NSIS wrapper must define Mineradio_Beat and the no-redistribution notice');
  }
  const installerText = fs.readFileSync(path.join(appRoot, 'build', 'installer.nsh'), 'utf8');
  if (!/MINERADIO_INSTALL_DIR_NAME/.test(installerText) || !/MINERADIO_INSTALL_NOTICE/.test(installerText)) {
    fail('shared installer must keep configurable install-folder and notice hooks');
  }
  const mainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
  if (!/APP_PACKAGE_INFO/.test(mainText) || !/runtimeName/.test(mainText) || !/appUserModelId/.test(mainText)) {
    fail('desktop runtime must read beta name/AppUserModelID from package metadata');
  }
  const serverText = fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8');
  if (!/qishui-audio-decryptor\/track-decryptor/.test(serverText)) {
    fail('server qishui decryptor dependency must stay covered by package files');
  }
  if (!/local\.disabled === true/.test(serverText) || !/provider === 'none'/.test(serverText)) {
    fail('server update config must support disabled internal beta update metadata');
  }
  console.log('[OK] Internal beta packaging stays isolated, closed-channel, and non-publishing.');
}

function checkSonicTopographyPresetGuard() {
  logStep('Sonic topography visual preset guard');
  const indexText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  const loaderText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'index-loader.js'), 'utf8');
  const coreText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '00-core-stores.js'), 'utf8');
  const defaultsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '04-fx-defaults.js'), 'utf8');
  const packagedText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '05-packaged-fx-archive.js'), 'utf8');
  const runtimeText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '06-fx-runtime-layout.js'), 'utf8');
  const persistenceText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '04-visual-settings-persistence.js'), 'utf8');
  const pointerText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '00-pointer-cover-particles.js'), 'utf8');
  const gestureText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '10-shell', '00-gesture-control.js'), 'utf8');
  const orbitText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '01-scene', '01-orbit-free-camera.js'), 'utf8');
  const focusCameraText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '01-scene', '03-focus-cinema-camera.js'), 'utf8');
  const beatCameraText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '01-scene', '02-beat-camera-runtime.js'), 'utf8');
  const archiveText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '00-preset-archive-data.js'), 'utf8');
  const presetGridText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '04-preset-grid-uniforms.js'), 'utf8');
  const presetCssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const fxBindText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '07-bindings-shelf-immersive.js'), 'utf8');
  const fxPanelText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '05-fx-panel-performance.js'), 'utf8');
  const mainLoopText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '11-main-loop.js'), 'utf8');
  const sonicText = fs.readFileSync(path.join(appRoot, 'public', 'sonic-topography-preset.js'), 'utf8');
  const sonicWorkshopText = fs.readFileSync(path.join(appRoot, 'public', 'sonic-workshop-preset.js'), 'utf8');
  const sonicWorkshopBridgeText = fs.readFileSync(path.join(appRoot, 'public', 'vendor', 'sonic-workshop', 'mineradio-bridge.html'), 'utf8');
  const paletteText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '07-lyrics-palette-text-utils.js'), 'utf8');
  const accentControlText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '02-accent-background-controls.js'), 'utf8');
  const colorLabText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '06-custom-background-colorlab.js'), 'utf8');
  const keyboardCameraText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '04-shelf', '06-keyboard-camera-events.js'), 'utf8');
  const sonicAudioText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '03-beat', '06-sonic-audio-monitor.js'), 'utf8');
  const defaultArchiveText = fs.readFileSync(path.join(appRoot, 'public', 'default-user-fx-archive.json'), 'utf8');
  const starRiverText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '03-lyrics-star-river.js'), 'utf8');
  const stageLyricsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '14-stage-lyrics-rendering.js'), 'utf8');
  const combinedFxState = defaultsText + packagedText + persistenceText + archiveText + fxBindText + fxPanelText + sonicAudioText + defaultArchiveText;
  const requiredSonicFields = [
    'sonicGroundAmplitude',
    'sonicGroundMotionSpeed',
    'sonicGroundDensity',
    'sonicGroundRange',
    'sonicGroundLower',
    'sonicGroundDepth',
    'sonicGroundAutoRotate',
    'sonicGroundColorMode',
    'sonicGroundBaseColor',
    'sonicGroundCoolColor',
    'sonicGroundWarmColor',
    'sonicGroundAccentColor',
    'sonicGroundGlow',
    'sonicGroundSubBass',
    'sonicGroundBass',
    'sonicGroundLowMid',
    'sonicGroundMid',
    'sonicGroundHighMid',
    'sonicGroundPresence',
    'sonicGroundBrilliance',
    'sonicGroundAir',
    'sonicGroundFloatingEnabled',
    'sonicGroundFloatingIntensity',
    'sonicGroundFloatingMinSize',
    'sonicGroundFloatingMaxSize',
    'sonicGroundFloatingSpeed',
    'sonicGroundFloatingCount',
    'sonicAudioMonitorEnabled',
    'sonicAudioAutoTrack',
    'sonicAudioSensitivity',
    'sonicAudioBandStart',
    'sonicAudioBandEnd',
    'sonicAudioThreshold',
    'sonicAudioPulseStrength',
    'sonicWorkshopInputGain',
    'sonicWorkshopAudioIntensity',
    'sonicWorkshopResponseRange',
    'sonicWorkshopPeakIntensity',
    'sonicWorkshopColorMode',
    'sonicWorkshopTheme',
    'sonicWorkshopCustomColor',
    'sonicWorkshopBaseColorMode',
    'sonicWorkshopBaseColor',
    'sonicWorkshopWarmColorMode',
    'sonicWorkshopWarmColor',
    'sonicWorkshopCoolColorMode',
    'sonicWorkshopCoolColor',
    'sonicWorkshopRippleColorMode',
    'sonicWorkshopRippleColor',
    'sonicWorkshopPeakColorMode',
    'sonicWorkshopPeakColor',
    'cameraViewSaved',
    'cameraViewMode',
    'cameraOrbitTheta',
    'cameraOrbitPhi',
    'cameraOrbitRadius',
    'cameraFreePositionX',
    'cameraFreePositionY',
    'cameraFreePositionZ',
    'cameraFreeYaw',
    'cameraFreePitch',
    'cameraFreeRoll',
    'cameraFreeFov',
    'visualRotationSaved',
    'visualRotationX',
    'visualRotationY'
  ];
  if (!/sonic-topography-preset\.js/.test(loaderText) || !/var INDEX = 7/.test(sonicText) || !/function deriveTerrainGridSettings/.test(sonicText) || !/TERRAIN_BASE_SIZE = 168/.test(sonicText) || !/TERRAIN_MAX_GRID_SIZE = 224/.test(sonicText)) {
    fail('Sonic Topography preset must load as a bounded Mineradio-native port of the latest GitHub visual layer');
  }
  if (/gl_FragCoord\.y\s*>\s*uScreenClipPx/.test(sonicText) || /uScreenClipPx/.test(sonicText) || /screenHeight[\s\S]{0,120}\*\s*0\.50/.test(sonicText)) {
    fail('Sonic Topography terrain must not use a hard half-screen fragment clip');
  }
  if (!/function updateSonicRotation/.test(sonicText) || !/function bindVisualRotation/.test(sonicText) || !/state\.boundRotX/.test(sonicText) || !/state\.boundRotY/.test(sonicText) || !/state\.autoYaw/.test(sonicText) || !/sonicGroundAutoRotate/.test(sonicText) || !/state\.root\.rotation\.x\s*=\s*state\.boundRotX/.test(sonicText) || !/state\.root\.rotation\.y\s*=\s*state\.boundRotY\s*\+\s*state\.autoYaw/.test(sonicText) || !/visualRotationActive/.test(sonicText)) {
    fail('Sonic Topography must bind both X/Y axes to the shared starfield particle rotation');
  }
  if (!/SONIC_ORBIT_BASELINE\s*=\s*\{\s*theta:\s*0\.00,\s*phi:\s*0\.18,\s*radius:\s*8\.4\s*\}/.test(orbitText) || !/function readSonicLyricLookAtTarget/.test(orbitText) || !/SONIC_CAMERA_LYRIC_LOOK_AT/.test(orbitText + focusCameraText) || !/readSonicLyricLookAtTarget\(SONIC_CAMERA_LYRIC_LOOK_AT\)/.test(focusCameraText) || /function applyOrbitPointerDrag/.test(pointerText + orbitText) || /applyOrbitPointerDrag\(dx,\s*dy\)/.test(pointerText) || !/applyParticleSpinDrag\(dx,\s*dy,\s*spinDt\)/.test(pointerText) || !/gestureRotation\.x\s*\+=\s*rx/.test(gestureText) || !/gestureRotation\.y\s*\+=\s*ry/.test(gestureText) || /13\.2;\s*orbit\.userPhi\s*=\s*0\.62/.test(presetGridText)) {
    fail('Sonic Topography drag must rotate the terrain while the camera stays lyric-centered, not high-overhead orbiting the camera');
  }
  if (!/var sonicLyricPreset/.test(stageLyricsText) || !/sonicLyricPreset && !fx\.lyricCameraLock && !wallpaperLyricLock/.test(stageLyricsText) || /sonicLyricCameraBasis/.test(stageLyricsText) || !/setStageLyricViewBasisFromCameraOrQuaternion\(lyricCoverWorldQuat\)/.test(stageLyricsText) || !/stageLyricTargetQuaternion\(lyricCoverWorldQuat,\s*layoutTiltX,\s*layoutTiltY\)/.test(stageLyricsText)) {
    fail('Sonic Topography lyrics must stay bound to the rotatable star-river visual basis instead of the camera');
  }
  if (!/backgroundStarRiver/.test(combinedFxState) || !/id="t-backgroundStarRiver"/.test(indexText) || !/backgroundStarRiverParticles/.test(pointerText) || !/function updateBackgroundStarRiverState/.test(pointerText) || !/fx\.backgroundStarRiver === false/.test(pointerText + fxBindText) || !/presetUsesStarRiverParticles[\s\S]{0,120}SONIC_PRESET_INDEX/.test(mainLoopText) || !/presetStarRiverMuted/.test(mainLoopText) || !/SONIC_PRESET_INDEX[\s\S]{0,100}return 0/.test(pointerText) || /lyricStarRiver/.test(combinedFxState + indexText + fxBindText + pointerText + starRiverText) || !/backgroundGlassOpacity'[\s\S]{0,100}'backgroundStarRiver'/.test(archiveText)) {
    fail('background star river must be a persisted global preset-background switch instead of a lyric effect');
  }
  if (!/visualRotation:\s*particles && particles\.rotation/.test(mainLoopText) || !/visualRotationActive:\s*!!\(orbit && orbit\.rotating\)/.test(mainLoopText)) {
    fail('Sonic Topography must receive the live starfield rotation from the main loop');
  }
  if (!/uSubBass/.test(sonicText) || !/uLowMid/.test(sonicText) || !/uHighMid/.test(sonicText) || !/uGlowIntensity/.test(sonicText) || !/uFogColor/.test(sonicText) || !/1\.0-smoothstep\(55\.0,78\.0,vDistance\)/.test(sonicText) || !/DEFAULT_FLOATING_BLOCK_COUNT = 80/.test(sonicText)) {
    fail('Sonic Topography terrain must use the latest GitHub eight-band terrain shader and floating block layer');
  }
  if (!/RIPPLE_LIFETIME = 4\.8/.test(sonicText) || !/RIPPLE_SOFT_FADE_START = 2\.1/.test(sonicText) || !/lifeFade=1\.0-smoothstep\(2\.10,4\.80,timeSince\)/.test(sonicText) || /\(time - r\.start\) < 2\.4/.test(sonicText)) {
    fail('Sonic Topography ripples must fade out softly instead of hard-clearing mid-decay');
  }
  if (!/new THREE\.BoxGeometry\(settings\.boxWidth,\s*1,\s*settings\.boxWidth\)/.test(sonicText) || !/new THREE\.BoxGeometry\(1,\s*1,\s*1\)/.test(sonicText)) {
    fail('Sonic Topography cells and floating blocks must use the latest density-derived GitHub geometry');
  }
  if (!/function deriveGroundLayoutSettings/.test(sonicText) || !/sonicGroundRange/.test(sonicText) || !/state\.root\.rotation\.x\s*=\s*state\.boundRotX/.test(sonicText) || !/state\.root\.position\.set\(0,\s*layout\.y,\s*layout\.z\)/.test(sonicText) || !/state\.root\.scale\.setScalar\(layout\.scale\)/.test(sonicText)) {
    fail('Sonic Topography must expose a wide, lyric-safe horizontal platter layout inside Mineradio camera space');
  }
  if (!/MAX_VISUAL_PRESET_INDEX = 12/.test(coreText) || !/SONIC_PRESET_INDEX = 7/.test(coreText) || !/SONIC_WORKSHOP_PRESET_INDEX = 8/.test(coreText) || !/MAX_VISUAL_PRESET_INDEX/.test(runtimeText + persistenceText)) {
    fail('Sonic preset 7 and Workshop derivative preset 8 must survive autosave and startup restore clamps');
  }
  if (!/音域回响/.test(archiveText) || !/presetDisplayOrder = \[0, 9, 10, 11, 12, 6, 7, 8/.test(archiveText) || /音域回响[\s\S]{0,120}disabled:\s*true/.test(archiveText)) {
    fail('Sonic Topography must be exposed as the selectable 音域回响 preset');
  }
  if (!archiveText.includes('音域回响 <span class="pc-name-en">Sonic-Topography</span>')
    || !archiveText.includes('作者 <span class="pc-author-ajin">Ajin</span>')
    || !archiveText.includes('音域回响 <span class="pc-name-en">Wallpaper Engine</span>')
    || !archiveText.includes("desc: '作者 CmzYa'")
    || !/var name = p\.nameHtml \|\| p\.name/.test(presetGridText)
    || !/\.preset-card \.pc-name-en[\s\S]{0,260}font-size:\s*9px/.test(presetCssText)
    || !/\.preset-card \.pc-author-ajin[\s\S]{0,100}color:\s*#f59e0b/.test(presetCssText)) {
    fail('Sonic preset cards must preserve their English subtitles and Ajin/CmzYa author credits');
  }
  [
    path.join(appRoot, 'public', 'vendor', 'sonic-workshop', 'assets', 'index-Z-j1MQ-r.js'),
    path.join(appRoot, 'public', 'vendor', 'sonic-workshop', 'assets', 'index-Bhwp8mwk.css'),
    path.join(appRoot, 'public', 'vendor', 'sonic-workshop', 'project.json'),
    path.join(appRoot, 'public', 'vendor', 'sonic-workshop', 'preview.gif')
  ].forEach((vendorFile) => {
    if (!fs.existsSync(vendorFile)) fail('Sonic Workshop derivative preset is missing packaged Wallpaper Engine asset: ' + path.relative(appRoot, vendorFile));
  });
  if (!/sonic-workshop-preset\.js/.test(loaderText) || !/BRIDGE_SRC = 'vendor\/sonic-workshop\/mineradio-bridge\.html'/.test(sonicWorkshopText) || !/MineradioSonicWorkshop\.update/.test(mainLoopText) || !/visual\.sonic-workshop/.test(mainLoopText) || !/MineradioSonicWorkshop\.onPresetChange/.test(presetGridText) || !/workshopPresetActive/.test(mainLoopText)) {
    fail('Sonic Workshop derivative preset must load, fade as preset 8, hide base particles, and update from the main loop');
  }
  if (!/canvasAnchor\.parentNode\.insertBefore\(layer,\s*canvasAnchor\)/.test(sonicWorkshopText) || !/layer\.setAttribute\('inert'/.test(sonicWorkshopText) || !/iframe\.setAttribute\('inert'/.test(sonicWorkshopText) || !/iframe\.style\.pointerEvents\s*=\s*'none'/.test(sonicWorkshopText) || !/#sonic-workshop-layer,\s*#sonic-workshop-layer \*[\s\S]{0,120}pointer-events:\s*none !important/.test(fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8'))) {
    fail('Sonic Workshop iframe layer must remain fully pointer-transparent so player buttons and window controls stay clickable');
  }
  if (!/wallpaperRegisterAudioListener/.test(sonicWorkshopBridgeText) || !/__mineradioApplyAudio/.test(sonicWorkshopBridgeText) || !/__mineradioApplyMedia/.test(sonicWorkshopBridgeText) || !/theme:\s*'coral-mirage'/.test(sonicWorkshopBridgeText) || !/themeCycleInterval:\s*50/.test(sonicWorkshopBridgeText) || !/gridSize:\s*320/.test(sonicWorkshopBridgeText) || !/audioIntensity:\s*1\.15/.test(sonicWorkshopBridgeText) || !/responseRange:\s*1\.3/.test(sonicWorkshopBridgeText) || !/peakColorIntensity:\s*0\.62/.test(sonicWorkshopBridgeText) || !/pulseSensitivity:\s*0\.05/.test(sonicWorkshopBridgeText) || !/pulseCooldown:\s*0/.test(sonicWorkshopBridgeText) || !/meteorSensitivity:\s*0\.3/.test(sonicWorkshopBridgeText) || !/cameraDistance:\s*80/.test(sonicWorkshopBridgeText) || !/autoRotateEnabled:\s*true/.test(sonicWorkshopBridgeText) || !/autoRotateSpeed:\s*7/.test(sonicWorkshopBridgeText) || !/cameraAngleX:\s*150/.test(sonicWorkshopBridgeText) || !/cameraAngleY:\s*30/.test(sonicWorkshopBridgeText) || !/showPlayerController:\s*false/.test(sonicWorkshopBridgeText)) {
    fail('Sonic Workshop bridge must preserve the requested Wallpaper Engine default parameters and receive Mineradio audio/media');
  }
  const sonicWorkshopVendorText = fs.readFileSync(path.join(appRoot, 'public', 'vendor', 'sonic-workshop', 'assets', 'index-Z-j1MQ-r.js'), 'utf8');
  if (!/mineradioCustomTheme/.test(sonicWorkshopBridgeText) || !/mineradioCustomTheme/.test(sonicWorkshopText) || !/function workshopCustomThemeForColor/.test(sonicWorkshopText) || !/function workshopPaletteHexesFromCover/.test(sonicWorkshopText) || !/function workshopCustomThemeForPalette/.test(sonicWorkshopText) || !/function workshopCustomThemeForRegions/.test(sonicWorkshopText) || !/function workshopRegionsFromFx/.test(sonicWorkshopText) || !/function applyWorkshopThemeTransition/.test(sonicWorkshopText) || !/WORKSHOP_THEME_TRANSITION_MS\s*=\s*1280/.test(sonicWorkshopText) || !/function applyThemeTransition/.test(sonicWorkshopBridgeText) || !/THEME_TRANSITION_STEP_MS\s*=\s*33/.test(sonicWorkshopBridgeText) || /scheduleWorkshopThemeTransition\(\);/.test(sonicWorkshopText) || !/__mineradioPaletteHexes/.test(sonicWorkshopText) || !/rawWarm/.test(paletteText + sonicWorkshopText) || !/rawCool/.test(paletteText + sonicWorkshopText) || !/rawAreaPrimary/.test(paletteText + sonicWorkshopText + accentControlText) || !/sonicWorkshopColors/.test(paletteText + sonicWorkshopText) || !/coverSourceKey/.test(paletteText + accentControlText) || !/function ensureSonicWorkshopCoverPaletteForUi/.test(accentControlText) || !/function sonicWorkshopCurrentCoverDomSource/.test(accentControlText) || !/function buildSonicWorkshopUiPaletteFromCanvas/.test(accentControlText) || !/function sonicWorkshopUiPaletteForKey/.test(accentControlText) || !/sonicWorkshopCoverUiSample\.palette/.test(accentControlText) || !/coverPickerCanvas/.test(accentControlText) || !/coverProxySrc/.test(accentControlText) || !/coverColors/.test(paletteText + sonicWorkshopText) || !/sonic-workshop-cool-picker/.test(indexText + fxBindText) || !/sonic-workshop-peak-picker/.test(indexText + fxBindText) || !/setSonicWorkshopRegionColorFromPicker/.test(fxBindText + sonicWorkshopText + accentControlText) || !/function sonicRawPaletteHex/.test(accentControlText) || /function sonicWorkshopCoverHex[\s\S]{0,700}sonicPaletteHex/.test(accentControlText) || !/uCoolCore:\s*cool/.test(sonicWorkshopText) || !/uRippleColor:\s*ripple/.test(sonicWorkshopText) || !/MRt\(We\.mineradioCustomTheme\.value\)/.test(sonicWorkshopVendorText) || !/Be\(function\(Mr\)\{return Mr===0\?1e-6:0\}\)/.test(sonicWorkshopVendorText)) {
    fail('Sonic Workshop cover/custom colors must feed the real vendor terrain theme instead of only recoloring the UI controls');
  }
  if (!/colorLabState\.picker\)\s*colorLabState\.picker\.value\s*=\s*hex/.test(colorLabText) || !/id === 'sonic-workshop-cover-picker'[\s\S]{0,180}\^sonic-workshop-/.test(colorLabText) || !/pointerdown[\s\S]{0,180}updateColorLabFromSv\(e\)/.test(fxBindText) || !/function sonicWorkshopRegionControl\(id\)\s*\{[\s\S]{0,120}typeof id === 'object' && id\.id/.test(accentControlText) || !/function pushSonicWorkshopColorChange/.test(accentControlText) || !/function setSonicWorkshopThemeFromPicker[\s\S]{0,520}SONIC_WORKSHOP_COLOR_CONTROLS\.forEach/.test(accentControlText) || !/pushSonicWorkshopColorChange\(item\.colorKey\)/.test(accentControlText)) {
    fail('Sonic Workshop color lab changes must commit into fx state, UI swatches, saved settings, and the live iframe theme');
  }
  if (!/function isPlaybackSpaceKey/.test(keyboardCameraText) || !/if \(isPlaybackSpaceKey\(e\)\) return;/.test(keyboardCameraText)) {
    fail('Space playback hotkey must not mark render interaction before resume playback');
  }
  if (!/global\.frequencyData/.test(sonicWorkshopText) || /sonicAudioMonitorState/.test(sonicWorkshopText) || /MineradioSonicWorkshop\.update\([\s\S]{0,260}audio:\s*sonicAudioFrame/.test(mainLoopText)) {
    fail('Sonic Workshop derivative must use the local player analyser bridge instead of the original Sonic realtime spectrum frame');
  }
  if (!/WORKSHOP_AUDIO_TARGET_MAX_SAMPLE\s*=\s*0\.52/.test(sonicWorkshopText) || !/WORKSHOP_AUDIO_GAMMA\s*=\s*1\.55/.test(sonicWorkshopText) || !/WORKSHOP_AUDIO_MIN_FLOOR\s*=\s*0\.035/.test(sonicWorkshopText) || !/function workshopAudioFrameStats/.test(sonicWorkshopText) || !/function shapeWorkshopAudioValue/.test(sonicWorkshopText) || !/sonicWorkshopInputGain/.test(sonicWorkshopText) || /Math\.pow\(clamp01\(value\),\s*0\.68\)/.test(sonicWorkshopText) || /1\.05\s*\+\s*energy\s*\*\s*0\.34/.test(sonicWorkshopText)) {
    fail('Sonic Workshop bridge must keep Wallpaper-like dark-field audio shaping instead of overdriving the terrain');
  }
  if (/getUserMedia|getDisplayMedia|desktopCapturer|MediaStream|D:\\\\Steam|workshop\\content/.test(sonicWorkshopText + sonicWorkshopBridgeText)) {
    fail('Sonic Workshop derivative must use packaged assets and Mineradio analyser data instead of runtime capture or the Steam workshop path');
  }
  if (!/fx-sonicamp/.test(indexText) || !/fx-sonicrange/.test(indexText) || !/fx-sonicair/.test(indexText) || !/sonic-ground-base-picker/.test(indexText) || !/fx-sonicfloatcount/.test(indexText) || !/t-sonicGroundFloatingEnabled/.test(indexText) || !/音域地形/.test(indexText) || !/\^fx-sonic/.test(fxPanelText)) {
    fail('visual console must expose layout, color, ground EQ, and floating block controls for 音域回响');
  }
  if (!/fx-sonicaudiobandstart/.test(indexText) || !/sonic-audio-monitor-canvas/.test(indexText) || !/t-sonicAudioAutoTrack/.test(indexText) || !/06-sonic-audio-monitor\.js/.test(loaderText)) {
    fail('visual console must expose the Sonic realtime spectrum range monitor and auto-track controls');
  }
  if (!/function stepSonicAudioMonitor/.test(sonicAudioText) || !/SONIC_AUDIO_BEAT_WINDOWS/.test(sonicAudioText) || !/sonicAudioTrackAutoPulse/.test(sonicAudioText) || !/sonicAudioStepKickEnvelope/.test(sonicAudioText) || !/drawSonicAudioMonitorPanel/.test(sonicAudioText)) {
    fail('Sonic Topography must include the GitHub-derived realtime spectrum, kick envelope, auto-track, and monitor panel module');
  }
  if (!/function sonicAudioHzRangeAverage/.test(sonicAudioText) || !/sonicHzDetailed/.test(sonicAudioText) || !/startHz:\s*46[\s\S]{0,80}endHz:\s*118/.test(sonicAudioText) || !/widthPenalty/.test(sonicAudioText) || !/sampleRate:\s*analysisSampleRate/.test(mainLoopText) || !/fftSize:\s*analysisFftSize/.test(mainLoopText)) {
    fail('Sonic realtime spectrum must use live Hz band analysis for kick windows instead of auto-tracking arbitrary treble bins');
  }
  if (!/SONIC_AUDIO_BASE_BINS\s*=\s*512/.test(sonicAudioText) || !/SONIC_AUDIO_AUTO_TRACK_SCAN_BINS\s*=\s*192/.test(sonicAudioText) || /sonicAudioBandStart[\s\S]{0,90}0,\s*250/.test(combinedFxState) || /sonicAudioBandEnd[\s\S]{0,90}2,\s*256/.test(combinedFxState) || /fx-sonicaudiobandstart[\s\S]{0,90}max="250"/.test(indexText) || /fx-sonicaudiobandend[\s\S]{0,90}max="256"/.test(indexText)) {
    fail('Sonic realtime spectrum must expose the full 512-bin control window across runtime, UI, save, and archive paths');
  }
  if (/getUserMedia|getDisplayMedia|desktopCapturer|MediaStream/.test(sonicAudioText + mainLoopText)) {
    fail('Sonic realtime audio must reuse Mineradio analyser data instead of requesting system or microphone capture');
  }
  if (!/stepSonicAudioMonitor\(frequencyData,\s*audioStepDt/.test(mainLoopText) || !/audio:\s*sonicAudioFrame\s*\|\|/.test(mainLoopText) || !/raw\.sonicDetailed/.test(sonicText)) {
    fail('Sonic Topography must receive detailed realtime audio frames while keeping the legacy bass/mid/treble fallback');
  }
  if (!/function readSonicRealtimeCameraSample/.test(beatCameraText) || !/sonicAudioMonitorState\.frame/.test(beatCameraText) || !/cinemaProfileSample/.test(mainLoopText) || !/sonicAudioFrame && sonicAudioFrame\.sonicDetailed/.test(mainLoopText)) {
    fail('cinematic camera sampling must fuse the Sonic realtime spectrum frame without replacing the original analyser path');
  }
  if (!/function sonicCoverGroundTheme/.test(sonicText) || !/stage\.coverPalette/.test(sonicText) || !/sonicGroundColorMode/.test(sonicText) || !/sonicGroundColorAuto/.test(persistenceText) || !/封面取色/.test(fxBindText + fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '02-accent-background-controls.js'), 'utf8'))) {
    fail('Sonic Topography colors must default to cover-palette sampling and switch to persistent custom colors only after user color selection');
  }
  requiredSonicFields.forEach((field) => {
    if (!combinedFxState.includes(field)) {
      fail(`missing Sonic ground preset field in save/archive/UI path: ${field}`);
    }
  });
  if (!/captureCameraArchiveState/.test(archiveText) || !/applyCameraArchiveState\(data\)/.test(archiveText) || !/applyVisualRotationArchiveState\(data\)/.test(archiveText) || !/isCameraArchiveKey\(key\)/.test(archiveText) || !/cameraViewSaved/.test(archiveText) || !/visualRotationSaved/.test(archiveText) || !/USER_FX_SHARE_KEYS[\s\S]*cameraFreeFov[\s\S]*visualRotationY/.test(archiveText)) {
    fail('user visual archives must save and restore camera plus shared visual rotation state without breaking old MR2 payloads');
  }
  if (!/MineradioSonicTopography\.update/.test(mainLoopText) || !/visual\.sonic-topography/.test(mainLoopText) || !/MineradioSonicTopography\.onPresetChange/.test(presetGridText) || !/MineradioSonicTopography\.pointerRipple/.test(pointerText)) {
    fail('Sonic Topography must update from the main loop, release meshes on preset changes, and support pointer ripples');
  }
  console.log('[OK] 音域回响 preset is selectable, bounded, saved, and driven by existing rhythm envelopes.');
}

function checkLongPressReorderGuard() {
  logStep('Long press playlist/queue reorder guard');
  const queueActionsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '10-queue-actions.js'), 'utf8');
  const panelShellText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '01-playlist-panel-shell.js'), 'utf8');
  const playlistDetailText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '02-playlist-detail.js'), 'utf8');
  const shelfCoreText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '04-shelf', '01-manager-core.js'), 'utf8');
  const shelfInteractionText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '04-shelf', '05-card-interactions.js'), 'utf8');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  if (!/function moveQueueIndex\(/.test(queueActionsText) || !/currentSong/.test(queueActionsText) || !/saveLastPlaybackSnapshot\(true,\s*'queue-reorder'\)/.test(queueActionsText)) {
    fail('queue reorder must preserve the current playing item and persist the queue snapshot');
  }
  if (!/data-queue-index=/.test(panelShellText) || !/function bindLongPressPanelReorder/.test(panelShellText) || !/reorderLongPressMs\s*=\s*520/.test(panelShellText) || !/moveQueueIndex\(panelReorderState\.currentIndex/.test(panelShellText)) {
    fail('left queue panel must expose long-press drag reorder data and bindings');
  }
  if (!/PLAYLIST_REORDER_STORE_KEY/.test(playlistDetailText) || !/function moveUserPlaylistIndex/.test(playlistDetailText) || !/function applyUserPlaylistOrder/.test(playlistDetailText) || !/data-playlist-index=/.test(playlistDetailText)) {
    fail('playlist panel reorder must persist a stable user playlist order');
  }
  if (/function reorderCardTo|shelfPlaylistSourceIndex|reorderCardTo:/.test(shelfCoreText)) {
    fail('3D shelf manager must not expose long-press card reorder hooks');
  }
  if (/shelfLongPressReorderState|shelfLongPressReorder|reorderCardTo/.test(shelfInteractionText)) {
    fail('3D shelf interactions must not bind long-press reorder; it conflicts with shelf card interaction');
  }
  if (!/body\.panel-reordering/.test(cssText) || /body\.shelf-reordering/.test(cssText) || !/\.pl-card\[data-playlist-index\]/.test(cssText)) {
    fail('long-press reorder visual hooks are missing from CSS');
  }
  console.log('[OK] Long-press reorder stays on left playlist/queue panels and is disabled for 3D shelf cards.');
}

function checkPlaylistPanelTriggerGuard() {
  logStep('Playlist panel trigger guard');
  const peekText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '10-shell', '02-peek-panels-upload.js'), 'utf8');
  const panelShellText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '01-playlist-panel-shell.js'), 'utf8');
  const fxDefaultsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '04-fx-defaults.js'), 'utf8');
  const fxRuntimeText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '06-fx-runtime-layout.js'), 'utf8');
  const persistenceText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '02-visual', '04-visual-settings-persistence.js'), 'utf8');
  const fxBindText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '07-bindings-shelf-immersive.js'), 'utf8');
  const archiveText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '00-preset-archive-data.js'), 'utf8');
  const focusCameraText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '01-scene', '03-focus-cinema-camera.js'), 'utf8');
  const desktopMainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const indexText = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
  if (!/PLAYLIST_PANEL_HIDE_DELAY\s*=\s*72/.test(peekText) || /key === 'pl' && isPlaylistPanelInMotion/.test(peekText)) {
    fail('left playlist panel close must start promptly instead of keeping the large hover bridge alive during motion');
  }
  if (!/function isPlaylistPanelOpeningMotion/.test(peekText) || !/!panel\.classList\.contains\('playlist-panel-closing'\)/.test(peekText) || !/function isPlaylistPanelActiveState[\s\S]{0,180}isPlaylistPanelOpeningMotion\(panel\)/.test(peekText)) {
    fail('playlist panel hit testing must treat opening motion as active but exclude closing motion from the trigger area');
  }
  if (!/function isPlaylistFullscreenEdgeMode/.test(peekText) || !/!isPlaylistFullscreenEdgeMode\(\)[\s\S]{0,220}state\.isPrimaryDisplay === false[\s\S]{0,120}state\.hasDisplayOnLeft/.test(peekText)) {
    fail('secondary-display seam guard must be disabled for fullscreen left-edge playlist access');
  }
  if (!/PLAYLIST_PANEL_EDGE_TRIGGER_X\s*=\s*104/.test(peekText) || !/PLAYLIST_PANEL_FULLSCREEN_EDGE_TRIGGER_X\s*=\s*128/.test(peekText) || !/SECONDARY_PLAYLIST_EDGE_DWELL_MS\s*=\s*220/.test(peekText) || !/SECONDARY_PLAYLIST_SEAM_CLOSE_X\s*=\s*6/.test(peekText)) {
    fail('playlist panel edge trigger thresholds must keep the default edge usable while slowing only secondary-display seam entry');
  }
  if (!/PLAYLIST_PANEL_HOME_EDGE_TRIGGER_X\s*=\s*16/.test(peekText) || !/function playlistPanelInitialEdgeTriggerX\(defaultWidth, eventTarget\)/.test(peekText) || !/eventTarget\.closest\('#empty-home'\)/.test(peekText) || !/isPlaylistEdgeTrigger\(ex, ey, H, e\.target\)/.test(peekText)) {
    fail('home must narrow only the unopened playlist edge trigger so its small controls remain reachable');
  }
  if (!/function isPlaylistPanelBottomControlsConflict/.test(peekText) || !/PLAYLIST_PANEL_BOTTOM_LEFT_BLOCK_X/.test(peekText) || !/shouldClosePlaylistPanelFromPointer\(ppOn,\s*ex,\s*ppRect,\s*ey,\s*H\)/.test(peekText)) {
    fail('playlist panel trigger must yield to the bottom player controls at the lower-left edge');
  }
  if (!/PLAYLIST_PANEL_FULLSCREEN_FOCUS_HOLD_X\s*=\s*14/.test(peekText) || !/PLAYLIST_PANEL_FULLSCREEN_EDGE_LEAVE_TOLERANCE_X\s*=\s*-8/.test(peekText) || !/function isPlaylistFullscreenEdgeFocusHold/.test(peekText) || !/return inTrigger \|\| inPanel \|\| isPlaylistFullscreenEdgeFocusHold\(pp,\s*ex,\s*ey,\s*H\)/.test(peekText)) {
    fail('fullscreen left-edge playlist focus must hold the queue camera only at the screen seam while the panel is active');
  }
  if (/isPlaylistPanelActiveState\(pp\) && ex < targetRect\.right/.test(peekText)) {
    fail('playlist panel focus must not return to a wide x-only focus strip after pointer leaves the panel band');
  }
  const shelfHoverText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '04-shelf', '00-layout-hover.js'), 'utf8');
  const shelfPanelSyncText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '04-shelf', '02-rebuild-panel-sync.js'), 'utf8');
  if (!/focusHover\.wantType === type[\s\S]{0,180}type === 'queue' && immediate[\s\S]{0,220}clearTimeout\(focusHover\.exitTimer\)[\s\S]{0,260}activateFocusZone\(type\)/.test(focusCameraText) || /if \(type && focusHover\.exitTimer\)/.test(focusCameraText)) {
    fail('same-type focus reactivation must stay queue-only so 3D shelf focus keeps the previous version feel');
  }
  if (!/function isFullscreenPlaylistQueueFocusLockedAtEdge/.test(peekText) || !/isPlaylistFullscreenEdgeFocusHold\(panel,\s*ex,\s*ey,\s*innerHeight\)/.test(peekText) || !/function clearShelfPreviewOnPointerExit\(e\)/.test(shelfHoverText) || !/keepQueueFocus \? 'queue' : null/.test(shelfHoverText) || !/clearShelfPreviewOnPointerExit\(e\)/.test(shelfPanelSyncText)) {
    fail('fullscreen left-edge playlist focus must survive edge leave events without broadening 3D shelf focus behavior');
  }
  if (!/function setMainWindowFullscreenResizeGuard/.test(desktopMainText) || !/win\.setResizable\(shouldResize\)/.test(desktopMainText) || !/setMainWindowFullscreenResizeGuard\(win,\s*true\)[\s\S]{0,120}win\.setFullScreen\(true\)/.test(desktopMainText) || !/setMainWindowFullscreenResizeGuard\(win,\s*false\)[\s\S]{0,120}win\.setFullScreen\(false\)/.test(desktopMainText) || !/(?:mainWindow|win)\.on\('enter-full-screen'[\s\S]{0,120}setMainWindowFullscreenResizeGuard\((?:mainWindow|win),\s*true\)/.test(desktopMainText) || !/(?:mainWindow|win)\.on\('leave-full-screen'[\s\S]{0,140}setMainWindowFullscreenResizeGuard\((?:mainWindow|win),\s*false\)/.test(desktopMainText)) {
    fail('native fullscreen must disable BrowserWindow resizing so the Windows resize cursor cannot steal the left-edge playlist focus');
  }
  if (!/resetSecondaryPlaylistEdgeGuard\(\)/.test(panelShellText)) {
    fail('playlist panel soft close must clear pending secondary-edge dwell timers');
  }
  if (!/--playlist-panel-open-ms:\s*var\(--mineradio-playlist-panel-open-ms,\s*280ms\)/.test(cssText) || !/--playlist-panel-close-ms:\s*var\(--mineradio-playlist-panel-close-ms,\s*180ms\)/.test(cssText) || !/setPlaylistPanelCssVar\('--mineradio-playlist-panel-open-ms'/.test(fxRuntimeText) || !/setPlaylistPanelCssVar\('--mineradio-playlist-panel-close-ms'/.test(fxRuntimeText)) {
    fail('playlist panel animation durations must be driven by runtime CSS variables, not only static panel defaults');
  }
  if (!/playlistPanelOpenDuration:\s*0\.72/.test(fxDefaultsText) || !/playlistPanelCloseDuration:\s*0\.48/.test(fxDefaultsText)) {
    fail('playlist panel animation defaults must preserve the captured first-launch state');
  }
  const durationRangeText = [fxRuntimeText, persistenceText, fxBindText, archiveText].join('\n');
  if ((durationRangeText.match(/0\.08,\s*0\.72/g) || []).length < 4 || (durationRangeText.match(/0\.06,\s*0\.48/g) || []).length < 4 || !/fx-playlistopen" type="range" min="0\.08" max="0\.72"/.test(indexText) || !/fx-playlistclose" type="range" min="0\.06" max="0\.48"/.test(indexText)) {
    fail('playlist panel animation slider range must match runtime, persistence, and archive clamps');
  }
  console.log('[OK] Playlist panel trigger, secondary-edge, bottom-control, and animation-duration guards are in sync.');
}

function checkShuffleQueueOrderGuard() {
  logStep('Shuffle queue order guard');
  const controlsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '14-player-controls.js'), 'utf8');
  const playbackText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '13-playback-start-audio.js'), 'utf8');
  if (!/function reorderQueueForShufflePlaybackOrder/.test(controlsText) || !/shuffleArrayInPlace/.test(controlsText) || !/playQueue\.length = 0;[\s\S]{0,100}playQueue\.push\(currentSong\)/.test(controlsText)) {
    fail('shuffle mode must reorder the visible queue into current song plus randomized upcoming playback order');
  }
  const reorderBlock = controlsText.slice(controlsText.indexOf('function reorderQueueForShufflePlaybackOrder'), controlsText.indexOf('function nextTrack'));
  if (/playQueue\s*=/.test(reorderBlock)) {
    fail('shuffle reorder must preserve the queue array reference used by progressive playlist hydration');
  }
  if (/playMode === 'shuffle'\)\s*currentIdx\s*=\s*Math\.floor\(Math\.random\(\)\s*\*\s*playQueue\.length\)/.test(controlsText)) {
    fail('shuffle nextTrack must advance through the randomized queue instead of jumping to a hidden random index');
  }
  if (!/playMode === 'shuffle'\)\s*currentIdx = currentIdx < 0 \? 0 : \(currentIdx \+ 1\) % playQueue\.length/.test(controlsText) || !/opts\.skipShuffleOrder = true/.test(controlsText)) {
    fail('shuffle next/previous controls must walk the randomized queue order without reshuffling every button press');
  }
  if (!/playMode === 'shuffle'[\s\S]{0,220}reorderQueueForShufflePlaybackOrder\(idx/.test(playbackText)) {
    fail('playQueueAt must normalize a selected track into the front of the randomized queue while shuffle is enabled');
  }
  if (!/playMode === 'shuffle' && prevMode !== 'shuffle'[\s\S]{0,120}reorderQueueForShufflePlaybackOrder\(currentIdx/.test(controlsText)) {
    fail('entering shuffle mode must immediately reorder the visible queue into playback order');
  }
  console.log('[OK] Shuffle mode keeps the visible queue aligned with the actual playback order.');
}

function electronExecutable() {
  const exe = path.join(appRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  return fs.existsSync(exe) ? exe : null;
}

function runtimeQaScript() {
  return `
const path = require('path');
const { app, BrowserWindow } = require('electron');

const appRoot = process.env.MINERADIO_QA_APP_ROOT;
const qaPreload = process.env.MINERADIO_QA_PRELOAD;
const pagePath = path.join(appRoot, 'public', 'index.html');
const logs = [];

function finish(code, payload) {
  console.log('MINERADIO_QA_RESULT:' + JSON.stringify(payload));
  setTimeout(() => app.exit(code), 80);
}

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    focusable: false,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      backgroundThrottling: false,
      offscreen: true,
      preload: qaPreload
    }
  });

  win.webContents.on('console-message', (_event, details) => {
    logs.push({
      level: details && details.level,
      message: String(details && details.message || '').slice(0, 360)
    });
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    finish(1, { ok: false, reason: 'render-process-gone', details, logs });
  });

  await win.loadFile(pagePath);
  await new Promise(resolve => setTimeout(resolve, 3000));

  const result = await win.webContents.executeJavaScript(\`
    (async () => {
      const failures = [];
      const now = performance.now();
      const displayHz = typeof estimatedDisplayRefreshHz === 'function' ? estimatedDisplayRefreshHz() : 0;
      const fpsBeforeBoost = typeof getAdaptiveRenderFps === 'function' ? getAdaptiveRenderFps(now) : 0;
      if (typeof estimatedDisplayRefreshHz !== 'function') failures.push('estimatedDisplayRefreshHz missing');
      if (typeof selectAdaptiveRenderCadence !== 'function') failures.push('selectAdaptiveRenderCadence missing');
      if (typeof sampleAdaptiveFrameCost !== 'function') failures.push('sampleAdaptiveFrameCost missing');
      if (!(displayHz >= 48 && displayHz <= 240)) failures.push('displayHz outside expected range: ' + displayHz);
      if (!(fpsBeforeBoost >= 45 || fpsBeforeBoost === 0)) failures.push('adaptive fps too low: ' + fpsBeforeBoost);
      if (typeof markRenderInteraction === 'function') markRenderInteraction('quick-check', 1000);
      const fpsAfterBoost = typeof getAdaptiveRenderFps === 'function' ? getAdaptiveRenderFps(performance.now()) : 0;
      if (!(fpsAfterBoost === 0 || fpsAfterBoost >= fpsBeforeBoost || fpsAfterBoost >= 60)) {
        failures.push('interaction boost did not preserve fps: ' + fpsBeforeBoost + ' -> ' + fpsAfterBoost);
      }
      function inspectFixedForegroundFpsCadence() {
        if (typeof shouldSkipFixedRenderCadenceFrame !== 'function' || typeof markRenderInteraction !== 'function') {
          return { ok: false, reason: 'fixed cadence helpers missing' };
        }
        const profiles = [];
        [60, 120, 144].forEach(hz => {
          [45, 60, 75, 90, 120].forEach(target => {
            const state = { key: '', lastCheckAt: 0, phase: 0 };
            const seconds = 8;
            let rendered = 0;
            for (let frame = 1; frame <= hz * seconds; frame++) {
              if (!shouldSkipFixedRenderCadenceFrame(state, frame * 1000 / hz, target, hz, String(target))) rendered += 1;
            }
            const actual = rendered / seconds;
            const expected = Math.min(target, hz);
            profiles.push({ hz, target, actual, expected, ok: Math.abs(actual - expected) <= 1 });
          });
        });
        const oldMode = fx && fx.foregroundFpsMode;
        const oldLastRenderAt = renderPerfState && renderPerfState.lastRenderAt;
        const oldBoostUntil = typeof renderInteractionBoostUntil !== 'undefined' ? renderInteractionBoostUntil : 0;
        const oldReason = typeof renderInteractionReason !== 'undefined' ? renderInteractionReason : '';
        let fixedPreserved = false;
        let vsyncCanWake = false;
        try {
          fx.foregroundFpsMode = '45';
          renderPerfState.lastRenderAt = 1234.5;
          markRenderInteraction('qa-fixed-cadence', 20);
          fixedPreserved = renderPerfState.lastRenderAt === 1234.5;
          fx.foregroundFpsMode = 'vsync';
          renderPerfState.lastRenderAt = 1234.5;
          markRenderInteraction('qa-vsync-wake', 20);
          vsyncCanWake = renderPerfState.lastRenderAt === 0 && getAdaptiveRenderFps(performance.now()) === 0;
        } finally {
          if (fx) fx.foregroundFpsMode = oldMode;
          if (renderPerfState) renderPerfState.lastRenderAt = oldLastRenderAt;
          if (typeof renderInteractionBoostUntil !== 'undefined') renderInteractionBoostUntil = oldBoostUntil;
          if (typeof renderInteractionReason !== 'undefined') renderInteractionReason = oldReason;
          if (typeof resetFixedRenderCadenceState === 'function') resetFixedRenderCadenceState();
        }
        return { ok: profiles.every(profile => profile.ok) && fixedPreserved && vsyncCanWake, profiles, fixedPreserved, vsyncCanWake };
      }
      const fixedFpsCadenceQa = inspectFixedForegroundFpsCadence();
      if (!fixedFpsCadenceQa.ok) failures.push('fixed foreground FPS cadence or VSync wake behavior failed: ' + JSON.stringify(fixedFpsCadenceQa));
      const runtime = typeof window.__mineradioPerfSnapshot === 'function' ? window.__mineradioPerfSnapshot() : null;
      const perf = window.__mineradioPerf && typeof window.__mineradioPerf.snapshot === 'function'
        ? window.__mineradioPerf.snapshot()
        : null;
      if (!runtime || !runtime.viewport) failures.push('runtime viewport snapshot missing');
      if (runtime && runtime.viewport && typeof runtime.viewport.displayHz !== 'number') failures.push('viewport displayHz missing');
      if (runtime && runtime.viewport && !runtime.viewport.adaptiveLoad) failures.push('viewport adaptiveLoad missing');
      if (runtime && runtime.viewport && !(runtime.viewport.adaptiveLoad.avgMs > 0)) failures.push('adaptiveLoad avgMs was not sampled');
      if (!perf || !perf.render) failures.push('perf render snapshot missing');
      const cuefieldButton = document.getElementById('cuefield-automix-btn');
      if (!cuefieldButton) failures.push('Cuefield AutoMix button missing');
      if (cuefieldButton && cuefieldButton.getAttribute('aria-pressed') !== 'false') failures.push('Cuefield AutoMix must default off in a fresh profile');
      if (!window.CuefieldAutoMix || typeof window.CuefieldAutoMix.createCuefieldAutoMix !== 'function') failures.push('Cuefield AutoMix core missing');
      if (!window.CuefieldTimelineExecutor || typeof window.CuefieldTimelineExecutor.buildCuefieldTimelineExecution !== 'function') failures.push('Cuefield timeline executor missing');
      if (typeof toggleCuefieldAutoMix !== 'function' || typeof tickCuefieldAutoMix !== 'function') failures.push('Cuefield renderer integration missing');
      function inspectLyricTextureQualityTiers() {
        if (typeof makeLyricMask !== 'function' || typeof compactLyricLineMaskTexture !== 'function' || typeof makeLyricQualityTexture !== 'function') {
          return { ok: false, reason: 'lyric quality texture builders missing' };
        }
        let mask = null;
        const builtTextures = [];
        try {
          mask = compactLyricLineMaskTexture(makeLyricMask('清晰度验证 High resolution lyric'));
          const rows = [{ tier: 1, width: Number(mask && mask.width) || 0, height: Number(mask && mask.height) || 0 }];
          [2, 3, 4].forEach(tier => {
            const built = makeLyricQualityTexture(mask, tier);
            if (built && built.texture) builtTextures.push(built.texture);
            rows.push({
              tier,
              width: Number(built && built.width) || 0,
              height: Number(built && built.height) || 0,
              bytes: Number(built && built.bytes) || 0,
              markedQuality: !!(built && built.texture && built.texture.userData && built.texture.userData.__mineradioLyricQuality)
            });
          });
          const widths = rows.map(row => row.width);
          const heights = rows.map(row => row.height);
          const monotonic = widths.every((width, index) => index === 0 || width > widths[index - 1]) && heights.every((height, index) => index === 0 || height > heights[index - 1]);
          const boundedActualScale = widths[0] > 0 && widths[1] >= widths[0] * 1.75 && widths[2] >= widths[0] * 2.4 && widths[3] >= widths[0] * 3.0;
          const marked = rows.slice(1).every(row => row.markedQuality && row.bytes > 0);
          return { ok: monotonic && boundedActualScale && marked, rows, monotonic, boundedActualScale, marked };
        } catch (error) {
          return { ok: false, reason: String(error && error.stack || error) };
        } finally {
          builtTextures.forEach(texture => {
            if (typeof lyricQualityDisposeTexture === 'function') lyricQualityDisposeTexture(texture);
            else if (typeof disposeOwnedLyricTexture === 'function') disposeOwnedLyricTexture(texture);
          });
          if (mask && mask.texture && typeof disposeOwnedLyricTexture === 'function') disposeOwnedLyricTexture(mask.texture);
        }
      }
      const lyricTextureQualityQa = inspectLyricTextureQualityTiers();
      if (!lyricTextureQualityQa.ok) failures.push('1x-4x lyric texture quality is not physically increasing: ' + JSON.stringify(lyricTextureQualityQa));
      async function inspectLyricQualityCacheStability() {
        const oldLines = window.lyricsLines;
        const oldTranslations = window.lyricsTranslationLines;
        const oldFx = {
          clarity: fx && fx.lyricTextureClarity,
          display: fx && fx.lyricDisplayMode,
          translation: fx && fx.lyricTranslationMode,
          count: fx && fx.lyricCustomLineCount,
          particles: fx && fx.particleLyrics
        };
        let root = null;
        try {
          invalidateLyricQualityTextures('qa-quality-cache-start', { release: true });
          window.lyricsLines = Array.from({ length: 80 }, (_, index) => ({
            t: index * 2,
            duration: 2,
            text: 'quality cache lyric row ' + index + ' smooth continuous line',
            translation: '清晰度缓存译文 ' + index,
            charCount: 40
          }));
          window.lyricsTranslationLines = window.lyricsLines.map(line => ({ t: line.t, text: line.translation }));
          fx.lyricTextureClarity = 4;
          fx.lyricDisplayMode = 'custom';
          fx.lyricTranslationMode = 'multi';
          fx.lyricCustomLineCount = 10;
          fx.particleLyrics = true;
          if (typeof stageLyricTrackCache !== 'undefined') stageLyricTrackCache = { key: '', entries: null, lineMap: null, start: 0, end: -1 };
          if (typeof lyricPrimaryVirtualPrefixCache !== 'undefined') lyricPrimaryVirtualPrefixCache = { key: '', values: [0] };
          const payload = buildStageLyricDisplayPayload(30, { lightweightTrack: true });
          root = buildLyricMesh(payload);
          const data = root && root.userData && root.userData.lyric;
          if (!data || !Array.isArray(data.rowLayers)) return { ok: false, reason: 'quality cache row layers missing' };
          if (typeof initializeStageLyricPersistentTrack === 'function') initializeStageLyricPersistentTrack(root, payload);
          const target = lyricPrimaryVirtualIndex(30);
          data.trackScrollOffset = target;
          data.trackScrollPrimed = true;
          const updateOptions = {
            opacity: 1,
            readability: 1,
            contextIntro: 1,
            shownProgress: 0.5,
            contextDrift: 0,
            targetLineIndex: 30,
            targetVirtualIndex: target,
            rowGlow: 1,
            renderBase: 260,
            ease: 1,
            trackEase: 1
          };
          function step() {
            resetLyricRenderUploadFrameBudget(true);
            updateLyricRowLayers(data, updateOptions);
            finalizeLyricQualitySelectionFrame();
            data.rowLayers.forEach(row => { if (row) row.renderRevealAt = 0; });
          }
          for (let reveal = 0; reveal < data.rowLayers.length * 3 + 12; reveal++) step();
          for (let settle = 0; settle < 110; settle++) {
            step();
            await new Promise(resolve => setTimeout(resolve, 24));
            if (lyricQualityState.queue.length === 0 && lyricQualityState.residents.length > 0 && !lyricQualityState.residents.some(row => row.qualityPendingTexture)) break;
          }
          function residentIds() {
            return lyricQualityState.residents.map(row => (row.lineIndex + '|' + (row.isTranslation ? 't' : 'p') + '|' + (row.qualityTexture && row.qualityTexture.uuid))).sort();
          }
          const firstIds = residentIds();
          const firstRows = lyricQualityState.residents.length;
          const firstBytes = lyricQualityState.bytes;
          const firstQueue = lyricQualityState.queue.length;
          for (let stable = 0; stable < 30; stable++) {
            step();
            await new Promise(resolve => setTimeout(resolve, 20));
          }
          const stableIds = residentIds();
          const anchor = lyricQualityState.residents.find(row => row.qualityTexture && row.isPrimary) || lyricQualityState.residents[0];
          if (!anchor || !anchor.qualityTexture) return { ok: false, reason: 'quality cache never produced a resident texture' };
          const oldTexture = anchor.qualityTexture;
          const baseTexture = anchor.baseLineTexture;
          fx.lyricTextureClarity = 3;
          invalidateLyricQualityTextures('texture-clarity-change');
          // Simulate a seek/input hold outliving the 3.2s fallback window.
          // The old 4x pool can be larger than the normal 3x budget, yet each
          // visible row still has to replace atomically without a 1x flash.
          const expiredFallbackAt = lyricQualityNowMs() - 1;
          lyricQualityState.transitionBudgetUntil = expiredFallbackAt;
          lyricQualityState.residents.forEach(row => { if (row) row.qualityFallbackUntil = expiredFallbackAt; });
          const startedOverNewBudget = firstBytes > lyricQualityPoolBudgetBytes(3);
          const immediateSame = lyricQualityCurrentMap(anchor) === oldTexture && !oldTexture.userData.__mineradioDisposed;
          let sawBase = false;
          for (let handoff = 0; handoff < 130; handoff++) {
            step();
            if (lyricQualityCurrentMap(anchor) === baseTexture) sawBase = true;
            await new Promise(resolve => setTimeout(resolve, 22));
            if (anchor.qualityTier === 3 && lyricQualityState.queue.length === 0 && !lyricQualityState.residents.some(row => row.qualityPendingTexture || row.qualityTier !== 3)) break;
          }
          const maxRows = lyricQualityMaxResidentRows();
          const stable = JSON.stringify(firstIds) === JSON.stringify(stableIds);
          const withinBounds = firstRows > 0 && firstRows <= maxRows && firstBytes <= lyricQualityPoolBudgetBytes(4) && firstQueue === 0;
          const allTierThree = lyricQualityState.residents.length > 0 && !lyricQualityState.residents.some(row => row.qualityTier !== 3 || row.qualityPendingTexture);
          const handoffOk = startedOverNewBudget && immediateSame && !sawBase && anchor.qualityTier === 3 && allTierThree && oldTexture.userData.__mineradioDisposed && lyricQualityCurrentMap(anchor) === anchor.qualityTexture;
          const newTier = anchor.qualityTier;
          const uploadOk = !window.__mineradioLyricUploadBudgetStats || Number(window.__mineradioLyricUploadBudgetStats.maxConsumed) <= 1;
          resetLyricRenderUploadFrameBudget(true);
          updateLyricRowLayers(data, updateOptions);
          const hadDisposeFrameCandidates = lyricQualityState.frameCandidates.some(candidate => candidate && candidate.data === data);
          disposeLyricMesh(root);
          root = null;
          finalizeLyricQualitySelectionFrame();
          await new Promise(resolve => setTimeout(resolve, 240));
          const disposedRows = Array.isArray(data.rowLayers) ? data.rowLayers : [];
          const noDisposeResurrection = data.__mineradioLyricQualityDisposed === true &&
            !lyricQualityState.frameCandidates.some(candidate => candidate && candidate.data === data) &&
            !lyricQualityState.frameCommits.some(candidate => candidate && candidate.data === data) &&
            !lyricQualityState.queue.some(job => job && job.data === data) &&
            !lyricQualityState.residents.some(row => disposedRows.indexOf(row) >= 0) &&
            !disposedRows.some(row => row && (row.qualityTexture || row.qualityPendingTexture || row.qualityQueuedKey));
          return { ok: stable && withinBounds && handoffOk && uploadOk && hadDisposeFrameCandidates && noDisposeResurrection, stable, withinBounds, handoffOk, uploadOk, startedOverNewBudget, allTierThree, hadDisposeFrameCandidates, noDisposeResurrection, firstRows, maxRows, firstBytes, firstQueue, immediateSame, sawBase, newTier };
        } catch (error) {
          return { ok: false, reason: String(error && error.stack || error) };
        } finally {
          if (root && typeof disposeLyricMesh === 'function') disposeLyricMesh(root);
          invalidateLyricQualityTextures('qa-quality-cache-finish', { release: true });
          window.lyricsLines = oldLines;
          window.lyricsTranslationLines = oldTranslations;
          if (fx) {
            fx.lyricTextureClarity = oldFx.clarity;
            fx.lyricDisplayMode = oldFx.display;
            fx.lyricTranslationMode = oldFx.translation;
            fx.lyricCustomLineCount = oldFx.count;
            fx.particleLyrics = oldFx.particles;
          }
          if (typeof stageLyricTrackCache !== 'undefined') stageLyricTrackCache = { key: '', entries: null, lineMap: null, start: 0, end: -1 };
          if (typeof lyricPrimaryVirtualPrefixCache !== 'undefined') lyricPrimaryVirtualPrefixCache = { key: '', values: [0] };
        }
      }
      const lyricQualityCacheQa = await inspectLyricQualityCacheStability();
      if (!lyricQualityCacheQa.ok) failures.push('visible-row lyric quality cache was not stable, bounded, or no-flash: ' + JSON.stringify(lyricQualityCacheQa));
      function inspectLyricMode(displayMode, translationMode, sampleIndex) {
        if (typeof buildStageLyricDisplayPayload !== 'function' || typeof buildLyricMesh !== 'function') {
          failures.push('stage lyric builders missing');
          return null;
        }
        const oldLines = window.lyricsLines;
        const oldTranslations = window.lyricsTranslationLines;
        const oldFx = {
          particleLyrics: fx && fx.particleLyrics,
          lyricDisplayMode: fx && fx.lyricDisplayMode,
          lyricTranslationMode: fx && fx.lyricTranslationMode
        };
        try {
          sampleIndex = Math.max(1, Math.round(Number(sampleIndex) || 1));
          const lineCount = displayMode === 'single'
            ? Math.max(32, sampleIndex + 4)
            : Math.max(4, sampleIndex + 4);
          window.lyricsLines = Array.from({ length: lineCount }, (_, idx) => {
            const text = idx === sampleIndex
              ? 'current line should glow'
              : (idx === sampleIndex + 1 ? 'next line follows softly' : 'context lyric line ' + idx);
            const translation = idx === sampleIndex
              ? 'current translation stays visible'
              : (idx === sampleIndex + 1 ? 'next translation stays visible' : 'translation line ' + idx);
            return { t: idx * 2, duration: 2, text, translation, charCount: text.length };
          });
          /*
          window.lyricsLines = [
            { t: 0, duration: 2, text: 'before the night opens', translation: '夜色打开以前', charCount: 23 },
            { t: 2, duration: 2, text: 'current line should glow', translation: '当前行应该发光', charCount: 24 },
            { t: 4, duration: 2, text: 'next line follows softly', translation: '下一行轻轻跟随', charCount: 24 },
            { t: 6, duration: 2, text: 'third line keeps moving', translation: '第三行继续移动', charCount: 23 }
          ];
          */
          window.lyricsTranslationLines = window.lyricsLines.map(line => ({ t: line.t, text: line.translation }));
          fx.particleLyrics = true;
          fx.lyricDisplayMode = displayMode;
          fx.lyricTranslationMode = translationMode;
          if (typeof stageLyricTrackCache !== 'undefined') stageLyricTrackCache = { key: '', entries: null, lineMap: null, start: 0, end: -1 };
          if (typeof lyricPrimaryVirtualPrefixCache !== 'undefined') lyricPrimaryVirtualPrefixCache = { key: '', values: [0] };
          const payload = buildStageLyricDisplayPayload(sampleIndex);
          const payloadTranslations = payload && payload.entries
            ? payload.entries.filter(entry => entry && entry.translationLine).length
            : 0;
          const mesh = payload ? buildLyricMesh(payload) : null;
          const rows = mesh && mesh.userData && mesh.userData.lyric && mesh.userData.lyric.rowLayers
            ? mesh.userData.lyric.rowLayers
            : [];
          const data = mesh && mesh.userData && mesh.userData.lyric ? mesh.userData.lyric : null;
          const qaTargetLine = data && data.usesTrack
            ? sampleIndex
            : (data && Number.isFinite(Number(data.trackTargetLineIndex)) ? Number(data.trackTargetLineIndex) : 1);
          const qaTargetVirtual = data && data.usesTrack && typeof lyricPrimaryVirtualIndex === 'function'
            ? lyricPrimaryVirtualIndex(qaTargetLine)
            : (data && Number.isFinite(Number(data.trackTargetVirtualIndex)) ? Number(data.trackTargetVirtualIndex) : 0);
          if (data && typeof updateLyricRowLayers === 'function') {
            data.trackScrollOffset = qaTargetVirtual;
            data.trackScrollPrimed = true;
            const qaLyricUpdateOptions = {
              opacity: 1,
              readability: 1,
              contextIntro: 1,
              shownProgress: 0.5,
              contextDrift: 0,
              targetLineIndex: qaTargetLine,
              targetVirtualIndex: qaTargetVirtual,
              rowGlow: 1,
              renderBase: 260,
              ease: 1,
              trackEase: 1
            };
            const qaRevealPasses = Math.max(2, rows.length + 2);
            for (let qaRevealPass = 0; qaRevealPass < qaRevealPasses; qaRevealPass++) {
              if (typeof resetLyricRenderUploadFrameBudget === 'function') resetLyricRenderUploadFrameBudget();
              updateLyricRowLayers(data, qaLyricUpdateOptions);
            }
            rows.forEach(row => { if (row) row.renderRevealAt = 0; });
            for (let qaVisiblePass = 0; qaVisiblePass < qaRevealPasses; qaVisiblePass++) {
              if (typeof resetLyricRenderUploadFrameBudget === 'function') resetLyricRenderUploadFrameBudget();
              updateLyricRowLayers(data, qaLyricUpdateOptions);
            }
          }
          const translationRows = rows.filter(row => row && row.isTranslation);
          const primaryRows = rows.filter(row => row && row.isPrimary);
          const runawayRows = translationRows.filter(row => row && row.mesh && Math.abs(row.mesh.position.y) > 3.2);
          function rowOpacity(row) {
            const mat = row && row.mat;
            if (mat && mat.uniforms && mat.uniforms.uOpacity) return Number(mat.uniforms.uOpacity.value) || 0;
            return Number(mat && mat.opacity) || 0;
          }
          const currentTranslationRows = translationRows.filter(row => row && Number(row.parentIndex) === qaTargetLine);
          const nextTranslationRows = translationRows.filter(row => row && Number(row.parentIndex) === qaTargetLine + 1);
          const currentTranslationOpacity = currentTranslationRows.reduce((max, row) => Math.max(max, rowOpacity(row)), 0);
          const nextTranslationOpacity = nextTranslationRows.reduce((max, row) => Math.max(max, rowOpacity(row)), 0);
          const currentTranslationYOffset = currentTranslationRows.reduce((max, row) => {
            const y = row && row.mesh ? Number(row.mesh.position.y) : 0;
            const baseY = row && Number.isFinite(Number(row.baseY)) ? Number(row.baseY) : y;
            return Math.max(max, Math.abs(y - baseY));
          }, 0);
          if (mesh && typeof disposeLyricMesh === 'function') disposeLyricMesh(mesh);
          return {
            payloadTranslations,
            meshTranslations: translationRows.length,
            meshPrimaries: primaryRows.length,
            runawayTranslations: runawayRows.length,
            currentTranslationOpacity,
            nextTranslationOpacity,
            currentTranslationYOffset
          };
        } finally {
          window.lyricsLines = oldLines;
          window.lyricsTranslationLines = oldTranslations;
          if (fx) {
            fx.particleLyrics = oldFx.particleLyrics;
            fx.lyricDisplayMode = oldFx.lyricDisplayMode;
            fx.lyricTranslationMode = oldFx.lyricTranslationMode;
          }
          if (typeof stageLyricTrackCache !== 'undefined') stageLyricTrackCache = { key: '', entries: null, lineMap: null, start: 0, end: -1 };
          if (typeof lyricPrimaryVirtualPrefixCache !== 'undefined') lyricPrimaryVirtualPrefixCache = { key: '', values: [0] };
        }
      }
      const lyricQa = {
        singleCurrent: inspectLyricMode('single', 'current', 24),
        singleMulti: inspectLyricMode('single', 'multi', 24),
        dualDual: inspectLyricMode('dual', 'dual', 1),
        dualMulti: inspectLyricMode('dual', 'multi', 1)
      };
      if (!lyricQa.singleCurrent || lyricQa.singleCurrent.meshTranslations < 1 || lyricQa.singleCurrent.runawayTranslations) failures.push('single/current translation row invalid');
      if (!lyricQa.singleMulti || lyricQa.singleMulti.meshTranslations < 1 || lyricQa.singleMulti.runawayTranslations) failures.push('single/multi translation row invalid');
      if (!lyricQa.dualDual || lyricQa.dualDual.meshPrimaries < 2 || lyricQa.dualDual.meshTranslations < 2 || lyricQa.dualDual.runawayTranslations) failures.push('dual/dual translation rows invalid');
      if (!lyricQa.dualMulti || lyricQa.dualMulti.meshPrimaries < 2 || lyricQa.dualMulti.meshTranslations < 2 || lyricQa.dualMulti.runawayTranslations) failures.push('dual/multi translation rows invalid');
      if (!lyricQa.singleCurrent || lyricQa.singleCurrent.currentTranslationOpacity < 0.12) failures.push('single/current translation row not visible after binding update');
      if (!lyricQa.singleMulti || lyricQa.singleMulti.currentTranslationOpacity < 0.12) failures.push('single/multi translation row not visible after binding update');
      if (!lyricQa.singleCurrent || lyricQa.singleCurrent.currentTranslationYOffset > 0.015) failures.push('single/current translation row still slides from its base position');
      if (!lyricQa.singleMulti || lyricQa.singleMulti.currentTranslationYOffset > 0.015) failures.push('single/multi translation row still slides from its base position');
      if (!lyricQa.dualDual || lyricQa.dualDual.nextTranslationOpacity < 0.10) failures.push('dual/dual second translation row not visible after binding update');
      if (!lyricQa.dualMulti || lyricQa.dualMulti.nextTranslationOpacity < 0.10) failures.push('dual/multi second translation row not visible after binding update');
      async function inspectPersistentLyricContinuity() {
        const oldLines = window.lyricsLines;
        const oldTranslations = window.lyricsTranslationLines;
        const oldAudio = audio;
        const oldPlaying = playing;
        const oldFx = {
          particleLyrics: fx && fx.particleLyrics,
          lyricDisplayMode: fx && fx.lyricDisplayMode,
          lyricTranslationMode: fx && fx.lyricTranslationMode,
          lyricCustomLineCount: fx && fx.lyricCustomLineCount,
          lyricGlow: fx && fx.lyricGlow,
          lyricGlowBeat: fx && fx.lyricGlowBeat,
          lyricGlowStrength: fx && fx.lyricGlowStrength,
          lyricBackgroundAdapt: fx && fx.lyricBackgroundAdapt
        };
        const oldStageGlow = {
          beatGlow: stageLyrics && stageLyrics.beatGlow,
          highBloom: stageLyrics && stageLyrics.highBloom
        };
        try {
          if (typeof clearStageLyrics === 'function') clearStageLyrics();
          const qaLongGlowText = 'Yeah, you should be with him, I let you go from time (Uh, yeah)';
          const qaShortGlowText = 'You should stay with him';
          window.lyricsLines = Array.from({ length: 80 }, (_, idx) => {
            const text = idx === 43
              ? qaLongGlowText
              : (idx === 44 ? qaShortGlowText : 'persistent primary lyric ' + idx);
            return {
              t: idx * 1.5,
              duration: 1.5,
              text: text,
              translation: 'persistent translation ' + idx,
              charCount: text.length
            };
          });
          window.lyricsTranslationLines = window.lyricsLines.map(line => ({ t: line.t, text: line.translation }));
          fx.particleLyrics = true;
          fx.lyricDisplayMode = 'custom';
          fx.lyricCustomLineCount = 10;
          fx.lyricTranslationMode = 'multi';
          fx.lyricGlow = true;
          fx.lyricGlowBeat = false;
          fx.lyricGlowStrength = 0.85;
          fx.lyricBackgroundAdapt = 0;
          stageLyrics.beatGlow = 0;
          stageLyrics.highBloom = 0;
          audio = { src: 'qa://persistent-lyrics', currentTime: 0.2, duration: 120, ended: false, paused: false };
          playing = true;
          if (typeof stageLyricTrackCache !== 'undefined') stageLyricTrackCache = { key: '', entries: null, lineMap: null, start: 0, end: -1 };
          if (typeof lyricPrimaryVirtualPrefixCache !== 'undefined') lyricPrimaryVirtualPrefixCache = { key: '', values: [0] };
          if (typeof createLyricsParticles === 'function') createLyricsParticles();
          const initialPayload = buildStageLyricDisplayPayload(0, { lightweightTrack: true });
          const root = buildLyricMesh(initialPayload);
          stageLyrics.group.add(root);
          stageLyrics.current = root;
          stageLyrics.currentIdx = 0;
          stageLyrics.currentPayload = initialPayload;
          stageLyrics.currentDisplayKey = initialPayload.key;
          initializeStageLyricPersistentTrack(root, initialPayload);
          const rootId = root.id;
          const targets = [0, 12, 43, 44, 79];
          let maxResidentPrimary = 0;
          let maxResidentRows = 0;
          let maxSameTrackOutgoing = 0;
          let maxUploadConsumed = 0;
          let maxIndexLag = 0;
          let baselineGlyphWorldH = null;
          let maxGlyphWorldDrift = 0;
          let maxLogicalRowWidth = 0;
          let minActiveScale = Infinity;
          let minimumForwardRunway = Infinity;
          let adjacentTargetsReady = 0;
          let wholeSongResident = false;
          const glowRasterSamples = [];
          function inspectActiveGlowRaster(row, target) {
            const lineMask = row && row.lineMask;
            const glowMap = row && row.glowMat && (
              row.glowMat.map ||
              (row.glowMat.uniforms && row.glowMat.uniforms.uMap && row.glowMat.uniforms.uMap.value)
            );
            const glowImage = glowMap && glowMap.image;
            const glowMeta = glowMap && glowMap.userData || {};
            const textGeometry = row && row.mesh && row.mesh.geometry && row.mesh.geometry.parameters || {};
            const glowGeometry = row && row.glow && row.glow.geometry && row.glow.geometry.parameters || {};
            if (!lineMask || !row.mesh || !row.glow || !glowImage) {
              return { ok: false, target: target, reason: 'active glow raster missing' };
            }
            const textFrameW = Math.max(0.001, Number(textGeometry.width) || Number(row.lineWorldW) || 0) * Math.max(0.001, Number(row.mesh.scale.x) || 0);
            const textFrameH = Math.max(0.001, Number(textGeometry.height) || Number(row.lineWorldH) || 0) * Math.max(0.001, Number(row.mesh.scale.y) || 0);
            const lineRasterW = Math.max(1, Number(lineMask.width) || 1);
            const lineRasterH = Math.max(1, Number(lineMask.height) || 1);
            const textInkW = textFrameW * Math.max(1, Number(lineMask.activeTextWidth) || Number(lineMask.textWidth) || lineRasterW) / lineRasterW;
            const glyphWorldH = textFrameH * Math.max(1, Number(lineMask.fontSize) || 1) / lineRasterH;
            const glowFrameW = Math.max(0.001, Number(glowGeometry.width) || 0) * Math.max(0.001, Number(row.glow.scale.x) || 0);
            const glowFrameH = Math.max(0.001, Number(glowGeometry.height) || 0) * Math.max(0.001, Number(row.glow.scale.y) || 0);
            const glowRasterW = Math.max(1, Number(glowMeta.width) || Number(glowImage.width) || 1);
            const glowRasterH = Math.max(1, Number(glowMeta.height) || Number(glowImage.height) || 1);
            const glowTextRasterW = Math.max(1, Number(glowMeta.textWidth) || glowRasterW);
            const glowInkW = glowFrameW * glowTextRasterW / glowRasterW;
            const glowFontSize = Math.max(0, Number(glowMeta.fontSize) || 0);
            const glowRasterScale = Math.max(0, Number(glowMeta.rasterScale) || 0);
            const lineRasterScale = Math.max(0.0001, Number(lineMask.rasterScale) || 1);
            const lineFontSize = Math.max(0.0001, Number(lineMask.fontSize) || 1);
            const widthAlignment = glowInkW / Math.max(0.001, textInkW);
            const rasterFontGain = glowFontSize / lineFontSize;
            const rasterScaleGain = glowRasterScale / lineRasterScale;
            const textureFrameToGlyph = glowRasterH / Math.max(1, glowFontSize);
            const worldFrameToGlyph = glowFrameH / Math.max(0.001, glyphWorldH);
            const padToGlyph = Math.max(0, glowFrameW - glowInkW) / Math.max(0.002, glyphWorldH * 2);
            const centerError = Math.hypot(
              (Number(row.glow.position.x) || 0) - (Number(row.mesh.position.x) || 0),
              (Number(row.glow.position.y) || 0) - (Number(row.mesh.position.y) || 0)
            ) / Math.max(0.001, glyphWorldH);
            const scaleError = Math.abs((Number(row.glow.scale.x) || 0) - (Number(row.mesh.scale.x) || 0));
            return {
              ok: glowFontSize > 0 && glowRasterScale > 0 && widthAlignment >= 0.90 && widthAlignment <= 1.10 && centerError <= 0.02 && scaleError <= 0.0001,
              target: target,
              text: row.text || '',
              logicalWidth: Number(lineMask.logicalWidth) || lineRasterW,
              lineRasterW: lineRasterW,
              glowRasterW: glowRasterW,
              lineFontSize: lineFontSize,
              glowFontSize: glowFontSize,
              lineRasterScale: lineRasterScale,
              glowRasterScale: glowRasterScale,
              rasterFontGain: rasterFontGain,
              rasterScaleGain: rasterScaleGain,
              widthAlignment: widthAlignment,
              textureFrameToGlyph: textureFrameToGlyph,
              worldFrameToGlyph: worldFrameToGlyph,
              padToGlyph: padToGlyph,
              centerError: centerError,
              scaleError: scaleError
            };
          }
          function relativeGlowMetricDrift(a, b) {
            a = Number(a) || 0;
            b = Number(b) || 0;
            return Math.abs(a - b) / Math.max(0.001, (Math.abs(a) + Math.abs(b)) * 0.5);
          }
          for (const target of targets) {
            audio.currentTime = Math.min(119.2, target * 1.5 + 0.2);
            const beforeTarget = Number(root.userData.lyric.trackTargetLineIndex);
            updateLyricMeshProgress(root, 0.42);
            const beforeProgress = Number(root.userData.lyric.textMat.uniforms.uProgress.value) || 0;
            const payload = buildStageLyricDisplayPayload(target);
            const accepted = setLyricTrackTarget(root, payload);
            if (!accepted) return { ok: false, reason: 'target rejected', target };
            const pendingImmediately = !!root.userData.lyric.trackPendingPayload;
            if (pendingImmediately) {
              updateLyricMeshProgress(root, 0.73);
              const heldProgress = Number(root.userData.lyric.textMat.uniforms.uProgress.value) || 0;
              if (Number(root.userData.lyric.trackTargetLineIndex) !== beforeTarget) return { ok: false, reason: 'pending target committed before upload', target };
              if (Math.abs(heldProgress - beforeProgress) > 0.0001) return { ok: false, reason: 'pending target changed old row progress', target, beforeProgress, heldProgress };
            }
            stageLyrics.currentIdx = target;
            stageLyrics.currentPayload = payload;
            stageLyrics.currentDisplayKey = payload.key;
            const deadline = performance.now() + 7000;
            let activeReady = false;
            while (performance.now() < deadline) {
              updateStageLyrics3D(1 / 60);
              await new Promise(resolve => requestAnimationFrame(resolve));
              const data = root.userData && root.userData.lyric;
              const active = data && data.rowLayers && data.rowLayers.find(row => row && row.isPrimary && Number(row.lineIndex) === target);
              const targetVirtual = lyricPrimaryVirtualIndex(target);
              const trackSettled = !!(data && Math.abs((Number(data.trackScrollOffset) || 0) - targetVirtual) <= 0.045);
              const activeCentered = !!(active && active.mesh && Math.abs(Number(active.mesh.position.y) || 0) <= Math.max(0.012, (Number(data && data.lineWorldStep) || 0.38) * 0.12));
              activeReady = !!(active && active.renderLineUploaded && stageLyricPersistentTargetRowsReady(root, target));
              const uploadStats = window.__mineradioLyricUploadBudgetStats || {};
              maxUploadConsumed = Math.max(maxUploadConsumed, Number(uploadStats.consumed) || 0, Number(uploadStats.maxConsumed) || 0);
              if (activeReady && !data.trackPendingPayload && trackSettled && activeCentered) break;
            }
            const data = root.userData && root.userData.lyric;
            if (!activeReady || !data) return { ok: false, reason: 'target resident timeout', target };
            const commitOffsets = lyricDisplayOffsetsForMode(data.displayMode);
            for (const offset of commitOffsets) {
              const lineIndex = target + Math.round(Number(offset) || 0);
              if (lineIndex < 0 || lineIndex >= window.lyricsLines.length || !lyricLineDisplayTextAt(lineIndex)) continue;
              const expectedRows = data.rowLayers.filter(row => {
                const rowLineIndex = row && row.isTranslation ? Number(row.parentIndex) : Number(row && row.lineIndex);
                return row && row.mesh && rowLineIndex === lineIndex;
              });
              if (!expectedRows.length) return { ok: false, reason: 'commit window row absent', target, lineIndex };
              for (const expectedRow of expectedRows) {
                const rowOpacity = expectedRow.mat && expectedRow.mat.uniforms && expectedRow.mat.uniforms.uOpacity
                  ? Number(expectedRow.mat.uniforms.uOpacity.value) || 0
                  : Number(expectedRow.mat && expectedRow.mat.opacity) || 0;
                if (!expectedRow.mesh.visible || rowOpacity <= 0.001) return { ok: false, reason: 'commit window row not visible', target, lineIndex, translation: !!expectedRow.isTranslation, rowOpacity };
              }
            }
            for (let settle = 0; settle < 12; settle++) {
              updateStageLyrics3D(1 / 60);
              await new Promise(resolve => requestAnimationFrame(resolve));
            }
            const primaryRows = data.rowLayers.filter(row => row && row.isPrimary);
            const translationRows = data.rowLayers.filter(row => row && row.isTranslation);
            const activeRow = primaryRows.find(row => Number(row.lineIndex) === target);
            if (!activeRow || !activeRow.lineMask || !activeRow.mesh) return { ok: false, reason: 'active row missing after settle', target };
            const glyphWorldH = Number(activeRow.lineWorldH) * (Number(activeRow.lineMask.fontSize) || 0) / Math.max(1, Number(activeRow.lineMask.height) || 1);
            maxLogicalRowWidth = Math.max(maxLogicalRowWidth, Number(activeRow.lineMask.logicalWidth) || Number(activeRow.lineMask.width) || 0);
            if (baselineGlyphWorldH == null) baselineGlyphWorldH = glyphWorldH;
            else maxGlyphWorldDrift = Math.max(maxGlyphWorldDrift, Math.abs(glyphWorldH - baselineGlyphWorldH) / Math.max(0.001, baselineGlyphWorldH));
            minActiveScale = Math.min(minActiveScale, Number(activeRow.mesh.scale.x) || 0);
            if (Math.abs(Number(data.persistentMaskLayout && data.persistentMaskLayout.fontSize) - 128) > 0.01) {
              return { ok: false, reason: 'persistent logical font inherited compact raster size', target, layout: data.persistentMaskLayout };
            }
            const visibleEffectsDeadline = performance.now() + 4000;
            while (performance.now() < visibleEffectsDeadline && !stageLyricPersistentTargetEffectsReady(root, target)) {
              updateStageLyrics3D(1 / 60);
              await new Promise(resolve => requestAnimationFrame(resolve));
            }
            if (!stageLyricPersistentTargetEffectsReady(root, target)) return { ok: false, reason: 'visible effects timeout', target };
            if (target === 43 || target === 44) {
              const effectsActiveRow = data.rowLayers.find(row => row && row.isPrimary && Number(row.lineIndex) === target);
              const glowSample = inspectActiveGlowRaster(effectsActiveRow, target);
              if (!glowSample.ok) return { ok: false, reason: 'active glow raster geometry invalid', glowSample: glowSample };
              glowRasterSamples.push(glowSample);
            }
            const visibleTranslations = translationRows.filter(row => lyricLineAllowedForDisplayMode(Number(row.parentIndex), target, data.displayMode));
            if (visibleTranslations.some(row => !row.glow || !row.glowMat)) return { ok: false, reason: 'visible translation row missing glow', target };
            if (target < window.lyricsLines.length - 12) {
              const runwayDeadline = performance.now() + 1800;
              const nextTarget = target + 1;
              while (performance.now() < runwayDeadline && !stageLyricPersistentTargetRowsReady(root, nextTarget)) {
                updateStageLyrics3D(1 / 60);
                await new Promise(resolve => requestAnimationFrame(resolve));
              }
              if (stageLyricPersistentTargetRowsReady(root, nextTarget)) adjacentTargetsReady += 1;
              updateStageLyricPersistentResidentBounds(data);
              minimumForwardRunway = Math.min(minimumForwardRunway, Number(data.trackResidentEnd) - target);
            }
            const rowKeys = data.rowLayers.map(row => stageLyricResidentRowKey(row)).filter(Boolean);
            const uniqueKeys = new Set(rowKeys);
            if (uniqueKeys.size !== rowKeys.length) return { ok: false, reason: 'duplicate resident row', target, rowKeys: rowKeys.length, unique: uniqueKeys.size };
            maxResidentPrimary = Math.max(maxResidentPrimary, primaryRows.length);
            maxResidentRows = Math.max(maxResidentRows, data.rowLayers.length);
            maxIndexLag = Math.max(maxIndexLag, Math.abs(Number(data.trackTargetLineIndex) - target));
            const sameTrackOutgoing = (stageLyrics.outgoing || []).filter(mesh => {
              const outgoingData = mesh && mesh.userData && mesh.userData.lyric;
              return outgoingData && outgoingData.trackKey === data.trackKey;
            }).length;
            maxSameTrackOutgoing = Math.max(maxSameTrackOutgoing, sameTrackOutgoing);
            if (stageLyrics.current !== root || root.id !== rootId) return { ok: false, reason: 'persistent root replaced', target, rootId, currentId: stageLyrics.current && stageLyrics.current.id };
          }
          const wholeTrackDeadline = performance.now() + 7000;
          while (performance.now() < wholeTrackDeadline) {
            updateStageLyrics3D(1 / 60);
            await new Promise(resolve => requestAnimationFrame(resolve));
            const data = root.userData && root.userData.lyric;
            wholeSongResident = !!(
              data && data.trackTextRunwayComplete &&
              Number(data.trackResidentPrimaryCount) === window.lyricsLines.length
            );
            const uploadStats = window.__mineradioLyricUploadBudgetStats || {};
            maxUploadConsumed = Math.max(maxUploadConsumed, Number(uploadStats.consumed) || 0, Number(uploadStats.maxConsumed) || 0);
            if (wholeSongResident) break;
          }
          const finalResidentData = root.userData && root.userData.lyric;
          maxResidentPrimary = Math.max(maxResidentPrimary, Number(finalResidentData && finalResidentData.trackResidentPrimaryCount) || 0);
          maxResidentRows = Math.max(maxResidentRows, Number(finalResidentData && finalResidentData.rowLayers && finalResidentData.rowLayers.length) || 0);
          const trackKeyBeforeRefresh = root.userData.lyric.trackKey;
          window.lyricsLines[40].text += ' refreshed-middle';
          invalidateStageLyricPayloadForNewLyrics('qa-middle-refresh');
          const refreshedPayload = buildStageLyricDisplayPayload(40, { lightweightTrack: true });
          if (!refreshedPayload || refreshedPayload.trackKey === trackKeyBeforeRefresh) {
            return { ok: false, reason: 'middle lyric refresh reused old track identity' };
          }
          const longGlowRaster = glowRasterSamples.find(sample => sample && sample.target === 43);
          const shortGlowRaster = glowRasterSamples.find(sample => sample && sample.target === 44);
          const glowRasterPairOk = !!(
            longGlowRaster && shortGlowRaster &&
            longGlowRaster.rasterFontGain >= 1.15 &&
            longGlowRaster.rasterScaleGain >= 1.15 &&
            relativeGlowMetricDrift(longGlowRaster.textureFrameToGlyph, shortGlowRaster.textureFrameToGlyph) <= 0.15 &&
            relativeGlowMetricDrift(longGlowRaster.worldFrameToGlyph, shortGlowRaster.worldFrameToGlyph) <= 0.18 &&
            relativeGlowMetricDrift(longGlowRaster.padToGlyph, shortGlowRaster.padToGlyph) <= 0.22
          );
          return {
            // Long active/translation rows now fit the real left/right screen
            // corridor. Continuity QA must allow that intentional shrink while
            // still rejecting unreadable collapse below half scale.
            ok: maxSameTrackOutgoing === 0 && maxUploadConsumed <= 1 && maxIndexLag === 0 && wholeSongResident && maxResidentPrimary === window.lyricsLines.length && maxLogicalRowWidth > 2048 && maxGlyphWorldDrift <= 0.035 && minActiveScale >= 0.50 && minimumForwardRunway >= 20 && adjacentTargetsReady >= 3 && glowRasterPairOk,
            rootId,
            maxSameTrackOutgoing,
            maxUploadConsumed,
            maxIndexLag,
            maxResidentPrimary,
            maxResidentRows,
            baselineGlyphWorldH,
            maxGlyphWorldDrift,
            maxLogicalRowWidth,
            minActiveScale,
            minimumForwardRunway,
            adjacentTargetsReady,
            wholeSongResident,
            glowRasterPairOk,
            longGlowRaster,
            shortGlowRaster
          };
        } catch (error) {
          return { ok: false, error: String(error && error.stack || error) };
        } finally {
          if (typeof clearStageLyrics === 'function') clearStageLyrics();
          audio = oldAudio;
          playing = oldPlaying;
          window.lyricsLines = oldLines;
          window.lyricsTranslationLines = oldTranslations;
          if (fx) {
            fx.particleLyrics = oldFx.particleLyrics;
            fx.lyricDisplayMode = oldFx.lyricDisplayMode;
            fx.lyricTranslationMode = oldFx.lyricTranslationMode;
            fx.lyricCustomLineCount = oldFx.lyricCustomLineCount;
            fx.lyricGlow = oldFx.lyricGlow;
            fx.lyricGlowBeat = oldFx.lyricGlowBeat;
            fx.lyricGlowStrength = oldFx.lyricGlowStrength;
            fx.lyricBackgroundAdapt = oldFx.lyricBackgroundAdapt;
          }
          if (stageLyrics) {
            stageLyrics.beatGlow = oldStageGlow.beatGlow;
            stageLyrics.highBloom = oldStageGlow.highBloom;
          }
          if (typeof stageLyricTrackCache !== 'undefined') stageLyricTrackCache = { key: '', entries: null, lineMap: null, start: 0, end: -1 };
          if (typeof lyricPrimaryVirtualPrefixCache !== 'undefined') lyricPrimaryVirtualPrefixCache = { key: '', values: [0] };
        }
      }
      async function inspectProgressDragLyricContinuity() {
        const oldLines = window.lyricsLines;
        const oldTranslations = window.lyricsTranslationLines;
        const oldAudio = audio;
        const oldPlaying = playing;
        const oldUniformTime = uniforms && uniforms.uTime ? Number(uniforms.uTime.value) || 0 : null;
        const oldDragState = typeof progressDragState !== 'undefined' ? Object.assign({}, progressDragState) : null;
        const oldFx = {
          particleLyrics: fx && fx.particleLyrics,
          lyricDisplayMode: fx && fx.lyricDisplayMode,
          lyricTranslationMode: fx && fx.lyricTranslationMode,
          lyricCustomLineCount: fx && fx.lyricCustomLineCount,
          lyricVerticalFloat: fx && fx.lyricVerticalFloat,
          lyricMotionStyle: fx && fx.lyricMotionStyle
        };
        try {
          if (typeof clearStageLyrics === 'function') clearStageLyrics();
          window.lyricsLines = Array.from({ length: 120 }, (_, idx) => ({
            t: idx * 1.5,
            duration: 1.5,
            text: 'drag primary lyric ' + idx,
            translation: 'drag translation ' + idx,
            charCount: 22
          }));
          window.lyricsTranslationLines = window.lyricsLines.map(line => ({ t: line.t, text: line.translation }));
          fx.particleLyrics = true;
          fx.lyricDisplayMode = 'custom';
          fx.lyricCustomLineCount = 10;
          fx.lyricTranslationMode = 'multi';
          fx.lyricVerticalFloat = false;
          fx.lyricMotionStyle = 'smooth';
          const mediaState = { time: 0.2, duration: 180, seeking: false, readyState: 4, paused: true };
          const dragMedia = new EventTarget();
          dragMedia.src = 'qa://progress-drag-lyrics';
          dragMedia.currentSrc = dragMedia.src;
          dragMedia.ended = false;
          Object.defineProperties(dragMedia, {
            currentTime: {
              configurable: true,
              get: () => mediaState.time,
              set: value => {
                const target = Math.max(0, Math.min(mediaState.duration, Number(value) || 0));
                mediaState.seeking = true;
                mediaState.readyState = 1;
                setTimeout(() => {
                  mediaState.time = target;
                  mediaState.seeking = false;
                  mediaState.readyState = 4;
                  dragMedia.dispatchEvent(new Event('seeked'));
                  dragMedia.dispatchEvent(new Event('timeupdate'));
                  dragMedia.dispatchEvent(new Event('canplay'));
                }, 120);
              }
            },
            duration: { configurable: true, get: () => mediaState.duration },
            seeking: { configurable: true, get: () => mediaState.seeking },
            readyState: { configurable: true, get: () => mediaState.readyState },
            paused: { configurable: true, get: () => mediaState.paused }
          });
          dragMedia.pause = () => { mediaState.paused = true; dragMedia.dispatchEvent(new Event('pause')); };
          dragMedia.play = () => { mediaState.paused = false; dragMedia.dispatchEvent(new Event('playing')); return Promise.resolve(); };
          audio = dragMedia;
          playing = false;
          if (typeof stageLyricTrackCache !== 'undefined') stageLyricTrackCache = { key: '', entries: null, lineMap: null, start: 0, end: -1 };
          if (typeof lyricPrimaryVirtualPrefixCache !== 'undefined') lyricPrimaryVirtualPrefixCache = { key: '', values: [0] };
          if (typeof createLyricsParticles === 'function') createLyricsParticles();
          const initialPayload = buildStageLyricDisplayPayload(0, { lightweightTrack: true });
          const root = buildLyricMesh(initialPayload);
          stageLyrics.group.add(root);
          stageLyrics.current = root;
          stageLyrics.currentIdx = 0;
          stageLyrics.currentPayload = initialPayload;
          stageLyrics.currentDisplayKey = initialPayload.key;
          initializeStageLyricPersistentTrack(root, initialPayload);
          const rootId = root.id;
          const bar = document.getElementById('progress-bar');
          if (!bar) return { ok: false, reason: 'progress bar missing' };
          const rect = bar.getBoundingClientRect();
          if (!rect.width) return { ok: false, reason: 'progress bar has no width' };
          const pointerId = 77;
          const dispatchPointer = (type, ratio) => {
            bar.dispatchEvent(new PointerEvent(type, {
              bubbles: true,
              pointerId,
              pointerType: 'mouse',
              button: 0,
              buttons: type === 'pointerup' ? 0 : 1,
              clientX: rect.left + rect.width * ratio,
              clientY: rect.top + rect.height * 0.5
            }));
          };
          const finalTarget = 72;
          const finalRatio = (finalTarget * 1.5 + 0.2) / mediaState.duration;
          let maxResidentPrimaryDuringDrag = 0;
          let maxResidentRowsDuringDrag = 0;
          const sampleResident = () => {
            const residentData = root.userData && root.userData.lyric;
            maxResidentPrimaryDuringDrag = Math.max(maxResidentPrimaryDuringDrag, Number(residentData && residentData.trackResidentPrimaryCount) || 0);
            maxResidentRowsDuringDrag = Math.max(maxResidentRowsDuringDrag, Number(residentData && residentData.rowLayers && residentData.rowLayers.length) || 0);
          };
          const median = values => {
            if (!values.length) return null;
            const sorted = values.slice().sort((a, b) => a - b);
            const middle = Math.floor(sorted.length / 2);
            return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) * 0.5;
          };
          const seenPrimaryRows = new Set();
          let previousVisualOffsetsByKey = new Map();
          let previousContinuousSample = null;
          let continuousSamples = 0;
          let movingFrames = 0;
          let snapFrames = 0;
          let reverseFrames = 0;
          let overshootFrames = 0;
          let maxTrackFollowRatio = 0;
          let maxVisualFollowRatio = 0;
          let maxVisualStep = 0;
          let maxTrackRowsPerFrame = 0;
          let maxVisualRowsPerFrame = 0;
          let maxJoinError = 0;
          const presentationLinesVisited = new Set();
          let previousPresentationLine = null;
          let maxPresentationLineStep = 0;
          let corridorSamples = 0;
          let corridorMissingTextFrames = 0;
          const motionAnomalies = [];
          const sampleContinuousMotion = () => {
            const data = root.userData && root.userData.lyric;
            if (!data || !Array.isArray(data.rowLayers)) return false;
            const lineStepWorld = Math.max(0.001, Number(data.lineWorldStep) || 0.38);
            const primaryRows = data.rowLayers.filter(row => row && row.isPrimary && row.mesh && Number.isFinite(Number(row.virtualIndex)));
            if (!primaryRows.length) return false;
            const visualByRow = primaryRows.map(row => ({
              row,
              key: stageLyricResidentRowKey(row),
              offset: Number(row.virtualIndex) + (Number(row.mesh.position.y) || 0) / lineStepWorld
            })).filter(sample => Number.isFinite(sample.offset));
            const visualOffsetsByKey = new Map(visualByRow.map(sample => [sample.key, sample.offset]));
            const existingOffsets = visualByRow.filter(sample => seenPrimaryRows.has(sample.key)).map(sample => sample.offset);
            const existingMedian = median(existingOffsets);
            if (existingMedian != null) {
              for (const sample of visualByRow) {
                if (!seenPrimaryRows.has(sample.key)) maxJoinError = Math.max(maxJoinError, Math.abs(sample.offset - existingMedian));
              }
            }
            for (const sample of visualByRow) seenPrimaryRows.add(sample.key);
            const visualOffset = median(visualByRow.map(sample => sample.offset));
            const scrollOffset = Number(data.trackScrollOffset);
            const pendingTargetLineIndex = data.trackPendingPayload && Number.isFinite(Number(data.trackPendingPayload.trackIndex))
              ? Number(data.trackPendingPayload.trackIndex)
              : null;
            const targetLineIndex = pendingTargetLineIndex == null ? Number(data.trackTargetLineIndex) : pendingTargetLineIndex;
            const targetVirtualIndex = pendingTargetLineIndex == null && Number.isFinite(Number(data.trackTargetVirtualIndex))
              ? Number(data.trackTargetVirtualIndex)
              : lyricPrimaryVirtualIndex(Number.isFinite(targetLineIndex) ? targetLineIndex : 0);
            const presentationLine = Number(data.trackPresentationLineIndex);
            if (data.trackPreviewCorridorActive && Number.isFinite(presentationLine)) {
              corridorSamples += 1;
              presentationLinesVisited.add(Math.round(presentationLine));
              if (previousPresentationLine != null) maxPresentationLineStep = Math.max(maxPresentationLineStep, Math.abs(presentationLine - previousPresentationLine));
              previousPresentationLine = presentationLine;
              const corridorHasVisibleText = data.rowLayers.some(row => {
                if (!row || !row.isPrimary || !row.mesh || !row.renderLineUploaded || !row.mesh.visible) return false;
                return lyricLineAllowedForDisplayMode(Number(row.lineIndex), presentationLine, data.displayMode);
              });
              if (!corridorHasVisibleText) corridorMissingTextFrames += 1;
            }
            if (!Number.isFinite(scrollOffset) || visualOffset == null || !Number.isFinite(targetVirtualIndex)) return false;
            if (previousContinuousSample) {
              const gap = targetVirtualIndex - previousContinuousSample.scrollOffset;
              const delta = scrollOffset - previousContinuousSample.scrollOffset;
              const lastLineIndex = Math.max(0, window.lyricsLines.length - 1);
              const normalizedTargetLine = Math.max(0, Math.min(lastLineIndex, Math.round(Number(targetLineIndex) || 0)));
              const neighborLineIndex = normalizedTargetLine < lastLineIndex ? normalizedTargetLine + 1 : Math.max(0, normalizedTargetLine - 1);
              const primarySlotStep = Math.max(0.001, Math.abs(lyricPrimaryVirtualIndex(neighborLineIndex) - lyricPrimaryVirtualIndex(normalizedTargetLine)) || 1);
              const renderFrame = Number(window.__mineradioLyricUploadBudgetStats && window.__mineradioLyricUploadBudgetStats.frame) || 0;
              const renderFrameSpan = Math.max(1, renderFrame - Number(previousContinuousSample.renderFrame || 0));
              maxTrackRowsPerFrame = Math.max(maxTrackRowsPerFrame, Math.abs(delta) / primarySlotStep / renderFrameSpan);
              if (Math.abs(gap) > 0.025) {
                const followRatio = Math.abs(delta / gap);
                maxTrackFollowRatio = Math.max(maxTrackFollowRatio, followRatio);
                if (followRatio > 0.72 || (Math.abs(gap) > 0.25 && Math.abs(scrollOffset - targetVirtualIndex) < 0.0001)) {
                  snapFrames += 1;
                  if (motionAnomalies.length < 12) motionAnomalies.push({ type: 'track-snap', gap, delta, followRatio, scrollOffset, targetVirtualIndex });
                }
                const dragDirection = finalTarget >= 0 ? 1 : -1;
                if (delta * dragDirection < -0.0001) {
                  reverseFrames += 1;
                  if (motionAnomalies.length < 12) motionAnomalies.push({ type: 'track-reverse', gap, delta, scrollOffset, targetVirtualIndex });
                }
                const targetHeldStill = Math.abs(targetVirtualIndex - previousContinuousSample.targetVirtualIndex) < 0.0001;
                if (targetHeldStill && (targetVirtualIndex - previousContinuousSample.scrollOffset) * (targetVirtualIndex - scrollOffset) < -0.000001) overshootFrames += 1;
              }
              const visualGap = targetVirtualIndex - previousContinuousSample.visualOffset;
              const stableVisualDeltas = [];
              for (const [key, offset] of visualOffsetsByKey) {
                if (previousVisualOffsetsByKey.has(key)) stableVisualDeltas.push(offset - previousVisualOffsetsByKey.get(key));
              }
              const stableVisualDelta = median(stableVisualDeltas);
              const visualDelta = stableVisualDelta == null ? visualOffset - previousContinuousSample.visualOffset : stableVisualDelta;
              maxVisualStep = Math.max(maxVisualStep, Math.abs(visualDelta));
              maxVisualRowsPerFrame = Math.max(maxVisualRowsPerFrame, Math.abs(visualDelta) / primarySlotStep / renderFrameSpan);
              if (Math.abs(visualGap) > 0.025) {
                maxVisualFollowRatio = Math.max(maxVisualFollowRatio, Math.abs(visualDelta / visualGap));
                const dragDirection = finalTarget >= 0 ? 1 : -1;
                if (visualDelta * dragDirection < -0.0001) {
                  reverseFrames += 1;
                  if (motionAnomalies.length < 12) motionAnomalies.push({ type: 'visual-reverse', visualGap, visualDelta, visualOffset, targetVirtualIndex });
                }
              }
              if (Math.abs(delta) > 0.0005 || Math.abs(visualDelta) > 0.0005) movingFrames += 1;
            }
            previousContinuousSample = {
              scrollOffset,
              visualOffset,
              targetVirtualIndex,
              renderFrame: Number(window.__mineradioLyricUploadBudgetStats && window.__mineradioLyricUploadBudgetStats.frame) || 0
            };
            previousVisualOffsetsByKey = visualOffsetsByKey;
            continuousSamples += 1;
            return true;
          };
          const qaLyricFrame = async () => {
            await new Promise(resolve => requestAnimationFrame(resolve));
          };
          const dragMotionSamples = {
            groupY: [],
            groupScaleY: [],
            rootY: [],
            rootScale: [],
            primaryY: [],
            translationY: [],
            worldPrimaryY: [],
            screenPrimaryY: [],
            screenTranslationY: []
          };
          const primaryWorldPosition = new THREE.Vector3();
          const translationWorldPosition = new THREE.Vector3();
          let maxTrackLockError = 0;
          let maxPrimaryAnchorError = 0;
          let maxEffectYError = 0;
          let unlockedMotionSamples = 0;
          const sampleDragMotion = () => {
            const data = root.userData && root.userData.lyric;
            if (!data || !Array.isArray(data.rowLayers)) return false;
            const primary = data.rowLayers.find(row => row && row.isPrimary && Number(row.lineIndex) === finalTarget && row.mesh);
            const translation = data.rowLayers.find(row => row && row.isTranslation && Number(row.parentIndex) === finalTarget && row.mesh);
            if (!primary || !translation) return false;
            if (camera) camera.updateMatrixWorld(true);
            stageLyrics.group.updateMatrixWorld(true);
            primary.mesh.getWorldPosition(primaryWorldPosition);
            translation.mesh.getWorldPosition(translationWorldPosition);
            dragMotionSamples.groupY.push(Number(stageLyrics.group.position.y) || 0);
            dragMotionSamples.groupScaleY.push(Number(stageLyrics.group.scale.y) || 0);
            dragMotionSamples.rootY.push(Number(root.position.y) || 0);
            dragMotionSamples.rootScale.push(Number(root.scale.x) || 0);
            dragMotionSamples.primaryY.push(Number(primary.mesh.position.y) || 0);
            dragMotionSamples.translationY.push(Number(translation.mesh.position.y) || 0);
            dragMotionSamples.worldPrimaryY.push(Number(primaryWorldPosition.y) || 0);
            dragMotionSamples.screenPrimaryY.push(Number(primaryWorldPosition.clone().project(camera).y) || 0);
            dragMotionSamples.screenTranslationY.push(Number(translationWorldPosition.clone().project(camera).y) || 0);
            if (!root.userData.progressPreviewMotionLocked) unlockedMotionSamples += 1;
            const targetVirtualIndex = lyricPrimaryVirtualIndex(finalTarget);
            maxTrackLockError = Math.max(maxTrackLockError, Math.abs((Number(data.trackScrollOffset) || 0) - targetVirtualIndex));
            maxPrimaryAnchorError = Math.max(maxPrimaryAnchorError, Math.abs(Number(primary.mesh.position.y) || 0));
            if (primary.readability) maxEffectYError = Math.max(maxEffectYError, Math.abs(primary.readability.position.y - primary.mesh.position.y));
            if (primary.glow) maxEffectYError = Math.max(maxEffectYError, Math.abs(primary.glow.position.y - primary.mesh.position.y));
            if (translation.readability) maxEffectYError = Math.max(maxEffectYError, Math.abs(translation.readability.position.y - translation.mesh.position.y));
            if (translation.glow) maxEffectYError = Math.max(maxEffectYError, Math.abs(translation.glow.position.y - translation.mesh.position.y));
            return true;
          };
          const motionSpan = values => values.length ? Math.max(...values) - Math.min(...values) : Infinity;
          dispatchPointer('pointerdown', 0.05);
          const dragRatios = [];
          for (let step = 1; step <= 96; step += 1) dragRatios.push(0.05 + (finalRatio - 0.05) * step / 96);
          for (const ratio of dragRatios) {
            dispatchPointer('pointermove', ratio);
            await qaLyricFrame();
            sampleResident();
            sampleContinuousMotion();
          }
          let dragLockReady = false;
          const dragLockDeadline = performance.now() + 2200;
          while (performance.now() < dragLockDeadline) {
            await qaLyricFrame();
            const lockData = root.userData && root.userData.lyric;
            dragLockReady = !!(
              lockData && !lockData.trackPendingPayload &&
              Number(lockData.trackTargetLineIndex) === finalTarget &&
              stageLyricPersistentTargetRowsReady(root, finalTarget)
            );
            sampleResident();
            sampleContinuousMotion();
            if (dragLockReady) break;
          }
          if (!dragLockReady) return { ok: false, reason: 'drag preview target text timeout' };
          const effectsReadyAtFirstTextCommit = stageLyricPersistentTargetEffectsReady(root, finalTarget);
          let settleErrorIncreases = 0;
          let previousSettleError = Infinity;
          for (let sample = 0; sample < 36; sample += 1) {
            await qaLyricFrame();
            sampleContinuousMotion();
            const settleData = root.userData && root.userData.lyric;
            const settleTargetVirtual = lyricPrimaryVirtualIndex(finalTarget);
            const settleError = Math.abs((Number(settleData && settleData.trackScrollOffset) || 0) - settleTargetVirtual);
            if (settleError > previousSettleError + 0.003) settleErrorIncreases += 1;
            previousSettleError = settleError;
            if (!sampleDragMotion()) return { ok: false, reason: 'drag preview target rows missing during motion sample' };
          }
          const releasedAt = performance.now();
          dispatchPointer('pointerup', finalRatio);
          let previewDroppedBeforeReady = false;
          let maxUploadConsumed = 0;
          let textCommitMs = Infinity;
          let effectsReadyAtTextCommit = effectsReadyAtFirstTextCommit;
          const textDeadline = performance.now() + 2200;
          while (performance.now() < textDeadline) {
            await qaLyricFrame();
            const data = root.userData && root.userData.lyric;
            const textReady = !!(
              data && !data.trackPendingPayload &&
              Number(data.trackTargetLineIndex) === finalTarget &&
              stageLyricPersistentTargetRowsReady(root, finalTarget)
            );
            const preview = typeof getProgressDragPreviewSeconds === 'function' ? getProgressDragPreviewSeconds() : null;
            if (preview == null && !textReady) previewDroppedBeforeReady = true;
            if (preview != null && textReady) sampleDragMotion();
            sampleContinuousMotion();
            const uploadStats = window.__mineradioLyricUploadBudgetStats || {};
            maxUploadConsumed = Math.max(maxUploadConsumed, Number(uploadStats.consumed) || 0, Number(uploadStats.maxConsumed) || 0);
            sampleResident();
            if (textReady) {
              textCommitMs = performance.now() - releasedAt;
              break;
            }
          }
          if (!isFinite(textCommitMs)) return { ok: false, reason: 'drag target text timeout', previewDroppedBeforeReady };
          const dataAtCommit = root.userData && root.userData.lyric;
          const offsets = lyricDisplayOffsetsForMode(dataAtCommit.displayMode);
          for (const offset of offsets) {
            const lineIndex = finalTarget + Math.round(Number(offset) || 0);
            if (lineIndex < 0 || lineIndex >= window.lyricsLines.length) continue;
            const expected = dataAtCommit.rowLayers.filter(row => {
              const rowLineIndex = row && row.isTranslation ? Number(row.parentIndex) : Number(row && row.lineIndex);
              return row && row.mesh && rowLineIndex === lineIndex;
            });
            if (expected.length < 2 || expected.some(row => !row.renderLineUploaded || !row.mesh.visible)) {
              return { ok: false, reason: 'drag committed a partial text window', lineIndex, rows: expected.length };
            }
          }
          let settlementMotionSamples = 0;
          const settlementDeadline = performance.now() + 1800;
          while (performance.now() < settlementDeadline && stageLyricProgressPreviewActive()) {
            await qaLyricFrame();
            if (!stageLyricProgressPreviewActive()) break;
            sampleContinuousMotion();
            if (sampleDragMotion()) settlementMotionSamples += 1;
          }
          const previewReleasedAfterSettlement = !stageLyricProgressPreviewActive();
          const releaseBaselineRootY = Number(root.position.y) || 0;
          const releaseBaselineRootScale = Number(root.scale.x) || 0;
          const releaseBaselineRootRotation = Number(root.rotation.z) || 0;
          const releaseBaselineScreenY = dragMotionSamples.screenPrimaryY.length
            ? dragMotionSamples.screenPrimaryY[dragMotionSamples.screenPrimaryY.length - 1]
            : Infinity;
          await qaLyricFrame();
          const releaseData = root.userData && root.userData.lyric;
          const releasePrimary = releaseData && releaseData.rowLayers && releaseData.rowLayers.find(row => row && row.isPrimary && Number(row.lineIndex) === finalTarget && row.mesh);
          let releaseScreenY = Infinity;
          if (releasePrimary && camera) {
            camera.updateMatrixWorld(true);
            stageLyrics.group.updateMatrixWorld(true);
            releasePrimary.mesh.getWorldPosition(primaryWorldPosition);
            releaseScreenY = Number(primaryWorldPosition.clone().project(camera).y) || 0;
          }
          const releaseRootYDelta = Math.abs((Number(root.position.y) || 0) - releaseBaselineRootY);
          const releaseRootScaleDelta = Math.abs((Number(root.scale.x) || 0) - releaseBaselineRootScale);
          const releaseRootRotationDelta = Math.abs((Number(root.rotation.z) || 0) - releaseBaselineRootRotation);
          const releaseScreenYDelta = Math.abs(releaseScreenY - releaseBaselineScreenY);
          const effectsDeadline = performance.now() + 7000;
          while (performance.now() < effectsDeadline && !stageLyricPersistentTargetEffectsReady(root, finalTarget)) {
            await qaLyricFrame();
            sampleContinuousMotion();
            if (stageLyricProgressPreviewActive()) sampleDragMotion();
            const uploadStats = window.__mineradioLyricUploadBudgetStats || {};
            maxUploadConsumed = Math.max(maxUploadConsumed, Number(uploadStats.consumed) || 0, Number(uploadStats.maxConsumed) || 0);
            sampleResident();
          }
          const effectsReady = stageLyricPersistentTargetEffectsReady(root, finalTarget);
          const data = root.userData && root.userData.lyric;
          const sameTrackOutgoing = (stageLyrics.outgoing || []).filter(mesh => {
            const outgoingData = mesh && mesh.userData && mesh.userData.lyric;
            return outgoingData && outgoingData.trackKey === data.trackKey;
          }).length;
          const groupYDrift = motionSpan(dragMotionSamples.groupY);
          const groupScaleDrift = motionSpan(dragMotionSamples.groupScaleY);
          const rootYDrift = motionSpan(dragMotionSamples.rootY);
          const rootScaleDrift = motionSpan(dragMotionSamples.rootScale);
          const primaryYDrift = motionSpan(dragMotionSamples.primaryY);
          const translationYDrift = motionSpan(dragMotionSamples.translationY);
          const worldPrimaryYDrift = motionSpan(dragMotionSamples.worldPrimaryY);
          const screenPrimaryYDrift = motionSpan(dragMotionSamples.screenPrimaryY);
          const screenTranslationYDrift = motionSpan(dragMotionSamples.screenTranslationY);
          const continuousScrollOk = continuousSamples >= 80 && movingFrames >= 20 &&
            snapFrames === 0 && reverseFrames === 0 && overshootFrames === 0 &&
            maxTrackFollowRatio <= 0.60 && maxVisualFollowRatio <= 0.60 &&
            maxTrackRowsPerFrame <= 0.70 && maxVisualRowsPerFrame <= 0.70 && maxJoinError <= 0.18 &&
            corridorSamples >= 20 && presentationLinesVisited.size >= 20 && maxPresentationLineStep <= 3 && corridorMissingTextFrames === 0 &&
            settleErrorIncreases <= 1 && dragMotionSamples.primaryY.length >= 24 && settlementMotionSamples >= 6 &&
            unlockedMotionSamples === 0 && previewReleasedAfterSettlement &&
            rootYDrift <= 0.0001 && rootScaleDrift <= 0.0001 && maxEffectYError <= 0.05 &&
            releaseRootYDelta <= 0.008 && releaseRootScaleDelta <= 0.008 && releaseRootRotationDelta <= 0.008 && releaseScreenYDelta <= 0.008;
          return {
            ok: !previewDroppedBeforeReady && textCommitMs <= 1400 && effectsReady && continuousScrollOk &&
              stageLyrics.current === root && root.id === rootId && sameTrackOutgoing === 0 &&
              maxUploadConsumed <= 1 && maxResidentPrimaryDuringDrag <= window.lyricsLines.length && Number(data.trackResidentPrimaryCount) <= window.lyricsLines.length,
            rootId,
            finalTarget,
            committedTarget: Number(data.trackTargetLineIndex),
            previewDroppedBeforeReady,
            textCommitMs,
            effectsReadyAtTextCommit,
            effectsReady,
            sameTrackOutgoing,
            maxUploadConsumed,
            maxResidentPrimaryDuringDrag,
            maxResidentRowsDuringDrag,
            residentPrimary: Number(data.trackResidentPrimaryCount) || 0,
            motionSamples: dragMotionSamples.primaryY.length,
            settlementMotionSamples,
            groupYDrift,
            groupScaleDrift,
            rootYDrift,
            rootScaleDrift,
            primaryYDrift,
            translationYDrift,
            worldPrimaryYDrift,
            screenPrimaryYDrift,
            screenTranslationYDrift,
            unlockedMotionSamples,
            previewReleasedAfterSettlement,
            releaseRootYDelta,
            releaseRootScaleDelta,
            releaseRootRotationDelta,
            releaseScreenYDelta,
            maxTrackLockError,
            maxPrimaryAnchorError,
            maxEffectYError,
            continuousScrollOk,
            continuousSamples,
            movingFrames,
            snapFrames,
            reverseFrames,
            overshootFrames,
            maxTrackFollowRatio,
            maxVisualFollowRatio,
            maxVisualStep,
            maxTrackRowsPerFrame,
            maxVisualRowsPerFrame,
            corridorSamples,
            presentationLinesVisited: presentationLinesVisited.size,
            maxPresentationLineStep,
            corridorMissingTextFrames,
            maxJoinError,
            settleErrorIncreases,
            motionAnomalies
          };
        } catch (error) {
          return { ok: false, error: String(error && error.stack || error) };
        } finally {
          if (typeof clearProgressPreviewHold === 'function') clearProgressPreviewHold();
          if (typeof clearStageLyrics === 'function') clearStageLyrics();
          audio = oldAudio;
          playing = oldPlaying;
          window.lyricsLines = oldLines;
          window.lyricsTranslationLines = oldTranslations;
          if (oldDragState && typeof progressDragState !== 'undefined') Object.assign(progressDragState, oldDragState);
          if (oldUniformTime != null && uniforms && uniforms.uTime) uniforms.uTime.value = oldUniformTime;
          if (fx) {
            fx.particleLyrics = oldFx.particleLyrics;
            fx.lyricDisplayMode = oldFx.lyricDisplayMode;
            fx.lyricTranslationMode = oldFx.lyricTranslationMode;
            fx.lyricCustomLineCount = oldFx.lyricCustomLineCount;
            fx.lyricVerticalFloat = oldFx.lyricVerticalFloat;
            fx.lyricMotionStyle = oldFx.lyricMotionStyle;
          }
          if (typeof stageLyricTrackCache !== 'undefined') stageLyricTrackCache = { key: '', entries: null, lineMap: null, start: 0, end: -1 };
          if (typeof lyricPrimaryVirtualPrefixCache !== 'undefined') lyricPrimaryVirtualPrefixCache = { key: '', values: [0] };
        }
      }
      let persistentLyricQa = null;
      let progressDragLyricQa = null;
      async function waitQaFrame() {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      async function inspectSearchGlassEntrance() {
        const area = document.getElementById('search-area');
        const box = document.getElementById('search-box');
        const map = document.getElementById('search-box-glass-map');
        if (!area || !box || !map || typeof setPeek !== 'function') return { ok: false, reason: 'missing search glass nodes' };
        document.documentElement.classList.remove('startup-fast-skip-preload');
        document.body.classList.remove('startup-fast-skip-revealing', 'splash-active', 'immersive-mode');
        area.classList.remove('peek');
        document.documentElement.classList.remove('search-glass-ready', 'search-glass-priming', 'search-glass-fallback');
        map.removeAttribute('href');
        try { map.removeAttributeNS('http://www.w3.org/1999/xlink', 'href'); } catch (e) {}
        if (typeof updateSearchBoxGlassDisplacementMap === 'function') updateSearchBoxGlassDisplacementMap();
        if (typeof updateSearchPillGlassDisplacementMap === 'function') updateSearchPillGlassDisplacementMap();
        if (typeof applyControlGlassChromaticOffset === 'function') applyControlGlassChromaticOffset();
        const readSearchBoxGlassStyle = () => {
          const areaStyle = getComputedStyle(area);
          const boxStyle = getComputedStyle(box);
          const boxGlassStyle = getComputedStyle(box, '::before');
          const tabs = document.querySelector('#search-area .search-mode-tabs');
          const tabsStyle = tabs ? getComputedStyle(tabs) : null;
          const pill = document.querySelector('#search-area .search-mode-tabs button') || document.querySelector('#search-area .search-history-chip');
          const pillStyle = pill ? getComputedStyle(pill) : null;
          const pillGlassStyle = pill ? getComputedStyle(pill, '::before') : null;
          const boxMap = document.getElementById('search-box-glass-map');
          const pillMap = document.getElementById('search-pill-glass-map');
          const boxFilter = document.getElementById('mineradio-search-box-glass-filter');
          const pillFilter = document.getElementById('mineradio-search-pill-glass-filter');
          const readHref = img => {
            if (!img) return '';
            let href = img.getAttribute('href') || '';
            try { href = href || img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || ''; } catch (e) {}
            return href;
          };
          const readOffsetDx = (filter, result) => {
            const node = filter && filter.querySelector ? filter.querySelector('feOffset[result="' + result + '"]') : null;
            return node ? Number(node.getAttribute('dx')) : NaN;
          };
          const decodeHref = href => {
            try { return decodeURIComponent(href || ''); } catch (e) { return String(href || ''); }
          };
          const boxHref = readHref(boxMap);
          const pillHref = readHref(pillMap);
          const boxHrefText = decodeHref(boxHref);
          const pillHrefText = decodeHref(pillHref);
          return {
            opacity: areaStyle.opacity,
            directFilter: boxStyle.backdropFilter || boxStyle.webkitBackdropFilter || '',
            directBackgroundColor: boxStyle.backgroundColor || '',
            directBorderTopColor: boxStyle.borderTopColor || '',
            directBorderTopWidth: boxStyle.borderTopWidth || '',
            directBoxShadow: boxStyle.boxShadow || '',
            glassContent: boxGlassStyle.content || '',
            glassFilter: boxGlassStyle.backdropFilter || boxGlassStyle.webkitBackdropFilter || '',
            glassBackgroundColor: boxGlassStyle.backgroundColor || '',
            glassBorderTopColor: boxGlassStyle.borderTopColor || '',
            glassBorderTopWidth: boxGlassStyle.borderTopWidth || '',
            glassBoxShadow: boxGlassStyle.boxShadow || '',
            tabsFilter: tabsStyle ? (tabsStyle.backdropFilter || tabsStyle.webkitBackdropFilter || '') : '',
            tabsBackgroundColor: tabsStyle ? (tabsStyle.backgroundColor || '') : '',
            tabsBorderTopColor: tabsStyle ? (tabsStyle.borderTopColor || '') : '',
            tabsBoxShadow: tabsStyle ? (tabsStyle.boxShadow || '') : '',
            pillFilter: pillStyle ? (pillStyle.backdropFilter || pillStyle.webkitBackdropFilter || '') : '',
            pillBackgroundColor: pillStyle ? (pillStyle.backgroundColor || '') : '',
            pillBorderTopColor: pillStyle ? (pillStyle.borderTopColor || '') : '',
            pillBorderTopWidth: pillStyle ? (pillStyle.borderTopWidth || '') : '',
            pillBoxShadow: pillStyle ? (pillStyle.boxShadow || '') : '',
            pillGlassContent: pillGlassStyle ? (pillGlassStyle.content || '') : '',
            pillGlassFilter: pillGlassStyle ? (pillGlassStyle.backdropFilter || pillGlassStyle.webkitBackdropFilter || '') : '',
            pillGlassBackgroundColor: pillGlassStyle ? (pillGlassStyle.backgroundColor || '') : '',
            pillGlassBoxShadow: pillGlassStyle ? (pillGlassStyle.boxShadow || '') : '',
            boxMapIsRgb: boxHref.indexOf('glass-red') > -1 || boxHrefText.indexOf('glass-red') > -1,
            pillMapIsRgb: pillHref.indexOf('glass-blue') > -1 || pillHrefText.indexOf('glass-blue') > -1,
            boxRedDx: readOffsetDx(boxFilter, 'dispRedShifted'),
            boxGreenDx: readOffsetDx(boxFilter, 'dispGreenShifted'),
            boxBlueDx: readOffsetDx(boxFilter, 'dispBlueShifted'),
            pillRedDx: readOffsetDx(pillFilter, 'dispRedShifted'),
            pillGreenDx: readOffsetDx(pillFilter, 'dispGreenShifted'),
            pillBlueDx: readOffsetDx(pillFilter, 'dispBlueShifted')
          };
        };
        const searchBoxFilterLooksLikeSavedRgbGlass = value => String(value || '').includes('mineradio-search-box-glass-filter') && String(value || '').includes('saturate(1)');
        const searchPillFilterLooksLikeSavedRgbGlass = value => String(value || '').includes('mineradio-search-pill-glass-filter') && String(value || '').includes('saturate(1)');
        const searchBoxDirectFilterLooksCleared = value => String(value || '') === 'none';
        const searchBoxMapLooksLikeSavedRgbGlass = value =>
          !!(value && value.boxMapIsRgb) &&
          isFinite(value && value.boxRedDx) &&
          isFinite(value && value.boxGreenDx) &&
          isFinite(value && value.boxBlueDx) &&
          Math.abs((value && value.boxRedDx) + 90) <= 0.5 &&
          Math.abs((value && value.boxGreenDx) + 90) <= 0.5 &&
          Math.abs((value && value.boxBlueDx) + 90) <= 0.5;
        const searchBoxHiddenStyleLooksClear = value =>
          String(value && value.glassContent || '') === 'none' &&
          searchBoxDirectFilterLooksCleared(value && value.directFilter) &&
          String(value && value.directBackgroundColor || '').includes('0, 0, 0, 0') &&
          String(value && value.directBoxShadow || '') === 'none' &&
          searchBoxMapLooksLikeSavedRgbGlass(value);
        const searchBoxVisibleStyleLooksLikeSavedRgbGlass = value =>
          String(value && value.glassContent || '') === 'none' &&
          searchBoxFilterLooksLikeSavedRgbGlass(value && value.directFilter) &&
          String(value && value.directBackgroundColor || '').includes('0, 0, 0') &&
          String(value && value.directBoxShadow || '').includes('inset') &&
          searchBoxMapLooksLikeSavedRgbGlass(value);
        const closedStyle = readSearchBoxGlassStyle();
        const closed = {
          peek: area.classList.contains('peek'),
          ready: document.documentElement.classList.contains('search-glass-ready'),
          priming: document.documentElement.classList.contains('search-glass-priming'),
          fallback: document.documentElement.classList.contains('search-glass-fallback'),
          opacity: closedStyle.opacity,
          directFilter: closedStyle.directFilter,
          directBackgroundColor: closedStyle.directBackgroundColor,
          directBorderTopColor: closedStyle.directBorderTopColor,
          directBorderTopWidth: closedStyle.directBorderTopWidth,
          directBoxShadow: closedStyle.directBoxShadow,
          glassContent: closedStyle.glassContent,
          glassFilter: closedStyle.glassFilter,
          glassBackgroundColor: closedStyle.glassBackgroundColor,
          glassBorderTopColor: closedStyle.glassBorderTopColor,
          glassBorderTopWidth: closedStyle.glassBorderTopWidth,
          glassBoxShadow: closedStyle.glassBoxShadow,
          pillFilter: closedStyle.pillFilter,
          pillBackgroundColor: closedStyle.pillBackgroundColor,
          pillBorderTopColor: closedStyle.pillBorderTopColor,
          pillBorderTopWidth: closedStyle.pillBorderTopWidth,
          pillBoxShadow: closedStyle.pillBoxShadow,
          pillGlassContent: closedStyle.pillGlassContent,
          pillGlassFilter: closedStyle.pillGlassFilter,
          pillGlassBackgroundColor: closedStyle.pillGlassBackgroundColor,
          pillGlassBoxShadow: closedStyle.pillGlassBoxShadow,
          tabsFilter: closedStyle.tabsFilter,
          tabsBackgroundColor: closedStyle.tabsBackgroundColor,
          tabsBorderTopColor: closedStyle.tabsBorderTopColor,
          tabsBoxShadow: closedStyle.tabsBoxShadow,
          boxMapIsRgb: closedStyle.boxMapIsRgb,
          pillMapIsRgb: closedStyle.pillMapIsRgb,
          boxRedDx: closedStyle.boxRedDx,
          boxGreenDx: closedStyle.boxGreenDx,
          boxBlueDx: closedStyle.boxBlueDx,
          pillRedDx: closedStyle.pillRedDx,
          pillGreenDx: closedStyle.pillGreenDx,
          pillBlueDx: closedStyle.pillBlueDx
        };
        setPeek(area, true, 'search');
        const immediateStyle = readSearchBoxGlassStyle();
        const immediate = {
          peek: area.classList.contains('peek'),
          ready: document.documentElement.classList.contains('search-glass-ready'),
          priming: document.documentElement.classList.contains('search-glass-priming'),
          fallback: document.documentElement.classList.contains('search-glass-fallback'),
          opacity: immediateStyle.opacity,
          directFilter: immediateStyle.directFilter,
          directBackgroundColor: immediateStyle.directBackgroundColor,
          directBorderTopColor: immediateStyle.directBorderTopColor,
          directBorderTopWidth: immediateStyle.directBorderTopWidth,
          directBoxShadow: immediateStyle.directBoxShadow,
          glassContent: immediateStyle.glassContent,
          glassFilter: immediateStyle.glassFilter,
          glassBackgroundColor: immediateStyle.glassBackgroundColor,
          glassBorderTopColor: immediateStyle.glassBorderTopColor,
          glassBorderTopWidth: immediateStyle.glassBorderTopWidth,
          glassBoxShadow: immediateStyle.glassBoxShadow,
          pillFilter: immediateStyle.pillFilter,
          pillBackgroundColor: immediateStyle.pillBackgroundColor,
          pillBorderTopColor: immediateStyle.pillBorderTopColor,
          pillBorderTopWidth: immediateStyle.pillBorderTopWidth,
          pillBoxShadow: immediateStyle.pillBoxShadow,
          pillGlassContent: immediateStyle.pillGlassContent,
          pillGlassFilter: immediateStyle.pillGlassFilter,
          pillGlassBackgroundColor: immediateStyle.pillGlassBackgroundColor,
          pillGlassBoxShadow: immediateStyle.pillGlassBoxShadow,
          tabsFilter: immediateStyle.tabsFilter,
          tabsBackgroundColor: immediateStyle.tabsBackgroundColor,
          tabsBorderTopColor: immediateStyle.tabsBorderTopColor,
          tabsBoxShadow: immediateStyle.tabsBoxShadow,
          boxMapIsRgb: immediateStyle.boxMapIsRgb,
          pillMapIsRgb: immediateStyle.pillMapIsRgb,
          boxRedDx: immediateStyle.boxRedDx,
          boxGreenDx: immediateStyle.boxGreenDx,
          boxBlueDx: immediateStyle.boxBlueDx,
          pillRedDx: immediateStyle.pillRedDx,
          pillGreenDx: immediateStyle.pillGreenDx,
          pillBlueDx: immediateStyle.pillBlueDx
        };
        // SVG readiness is asynchronous and the visible opacity transition is
        // 350 ms. Four rAFs can sample the entrance near opacity 0 on a fast
        // machine, so wait for the real visible state with a bounded timeout.
        for (let frame = 0; frame < 36; frame += 1) {
          await waitQaFrame();
          const probeStyle = readSearchBoxGlassStyle();
          if (
            area.classList.contains('peek') &&
            document.documentElement.classList.contains('search-glass-ready') &&
            Number(probeStyle.opacity) > 0.45
          ) break;
        }
        const afterPaintStyle = readSearchBoxGlassStyle();
        const afterPaint = {
          peek: area.classList.contains('peek'),
          ready: document.documentElement.classList.contains('search-glass-ready'),
          priming: document.documentElement.classList.contains('search-glass-priming'),
          fallback: document.documentElement.classList.contains('search-glass-fallback'),
          opacity: afterPaintStyle.opacity,
          directFilter: afterPaintStyle.directFilter,
          directBackgroundColor: afterPaintStyle.directBackgroundColor,
          directBorderTopColor: afterPaintStyle.directBorderTopColor,
          directBorderTopWidth: afterPaintStyle.directBorderTopWidth,
          directBoxShadow: afterPaintStyle.directBoxShadow,
          glassContent: afterPaintStyle.glassContent,
          glassFilter: afterPaintStyle.glassFilter,
          glassBackgroundColor: afterPaintStyle.glassBackgroundColor,
          glassBorderTopColor: afterPaintStyle.glassBorderTopColor,
          glassBorderTopWidth: afterPaintStyle.glassBorderTopWidth,
          glassBoxShadow: afterPaintStyle.glassBoxShadow,
          pillFilter: afterPaintStyle.pillFilter,
          pillBackgroundColor: afterPaintStyle.pillBackgroundColor,
          pillBorderTopColor: afterPaintStyle.pillBorderTopColor,
          pillBorderTopWidth: afterPaintStyle.pillBorderTopWidth,
          pillBoxShadow: afterPaintStyle.pillBoxShadow,
          pillGlassContent: afterPaintStyle.pillGlassContent,
          pillGlassFilter: afterPaintStyle.pillGlassFilter,
          pillGlassBackgroundColor: afterPaintStyle.pillGlassBackgroundColor,
          pillGlassBoxShadow: afterPaintStyle.pillGlassBoxShadow,
          tabsFilter: afterPaintStyle.tabsFilter,
          tabsBackgroundColor: afterPaintStyle.tabsBackgroundColor,
          tabsBorderTopColor: afterPaintStyle.tabsBorderTopColor,
          tabsBoxShadow: afterPaintStyle.tabsBoxShadow,
          boxMapIsRgb: afterPaintStyle.boxMapIsRgb,
          pillMapIsRgb: afterPaintStyle.pillMapIsRgb,
          boxRedDx: afterPaintStyle.boxRedDx,
          boxGreenDx: afterPaintStyle.boxGreenDx,
          boxBlueDx: afterPaintStyle.boxBlueDx,
          pillRedDx: afterPaintStyle.pillRedDx,
          pillGreenDx: afterPaintStyle.pillGreenDx,
          pillBlueDx: afterPaintStyle.pillBlueDx
        };
        const checks = {
          closedHidden: !closed.peek && Number(closed.opacity) < 0.01,
          closedFilterOk: searchBoxDirectFilterLooksCleared(closed.directFilter),
          closedBodyOk: searchBoxHiddenStyleLooksClear(closed),
          immediateHeldBackUntilSvgReady: !immediate.peek && immediate.priming && Number(immediate.opacity) < 0.01,
          immediateFilterOk: searchBoxDirectFilterLooksCleared(immediate.directFilter),
          immediateBodyOk: searchBoxHiddenStyleLooksClear(immediate),
          afterPaintPeek: afterPaint.peek,
          afterPaintReady: afterPaint.ready,
          afterPaintVisible: Number(afterPaint.opacity) > 0.45,
          afterPaintFilterOk: searchBoxFilterLooksLikeSavedRgbGlass(afterPaint.directFilter) && String(afterPaint.glassContent || '') === 'none',
          afterPaintBodyOk: searchBoxVisibleStyleLooksLikeSavedRgbGlass(afterPaint),
          searchPillFilterOk: searchPillFilterLooksLikeSavedRgbGlass(afterPaint.pillFilter),
          searchPillBodyOk: String(afterPaint.pillGlassContent || '') === 'none' &&
            (String(afterPaint.pillBackgroundColor || '').includes('0, 0, 0') ||
            String(afterPaint.pillBackgroundColor || '').includes('255, 255, 255')) &&
            String(afterPaint.pillBorderTopWidth || '') !== '0px' &&
            String(afterPaint.pillBoxShadow || '').includes('inset') &&
            !!afterPaint.pillMapIsRgb &&
            isFinite(afterPaint.pillRedDx) &&
            isFinite(afterPaint.pillGreenDx) &&
            isFinite(afterPaint.pillBlueDx) &&
            Math.abs(afterPaint.pillRedDx + 34) <= 0.5 &&
            Math.abs(afterPaint.pillGreenDx + 34) <= 0.5 &&
            Math.abs(afterPaint.pillBlueDx + 34) <= 0.5,
          searchTabsRailOk: String(afterPaint.tabsFilter || '') === 'none' &&
            String(afterPaint.tabsBackgroundColor || '').includes('0, 0, 0, 0') &&
            String(afterPaint.tabsBorderTopColor || '').includes('0, 0, 0, 0') &&
            String(afterPaint.tabsBoxShadow || '') === 'none'
        };
        setPeek(area, false, 'search');
        return {
          ok: checks.closedHidden &&
            checks.closedFilterOk &&
            checks.closedBodyOk &&
            checks.immediateHeldBackUntilSvgReady &&
            checks.immediateFilterOk &&
            checks.immediateBodyOk &&
            checks.afterPaintPeek &&
            checks.afterPaintReady &&
            checks.afterPaintVisible &&
            checks.afterPaintFilterOk &&
            checks.afterPaintBodyOk &&
            checks.searchPillFilterOk &&
            checks.searchPillBodyOk &&
            checks.searchTabsRailOk,
          checks,
          closed,
          immediate,
          afterPaint
        };
      }
      const searchGlassQa = await inspectSearchGlassEntrance();
      if (!searchGlassQa.ok) failures.push('search glass panel lost the saved RGB SVG material during reveal: ' + JSON.stringify(searchGlassQa));
      persistentLyricQa = await inspectPersistentLyricContinuity();
      if (!persistentLyricQa.ok) failures.push('persistent multi-line lyric continuity failed: ' + JSON.stringify(persistentLyricQa));
      progressDragLyricQa = await inspectProgressDragLyricContinuity();
      if (!progressDragLyricQa.ok) failures.push('real progress drag lyric continuity failed: ' + JSON.stringify(progressDragLyricQa));
      async function inspectAudioGraphMediaHandoff() {
        if (audio || audioCtx || source) return { ok: true, skipped: 'renderer already owns an audio graph' };
        const deckA = new Audio();
        const deckB = new Audio();
        try {
          audio = deckA;
          const firstReady = initAudio();
          const sourceA = source;
          const firstBound = audioSourceMedia === deckA;
          audio = deckB;
          resetPlaybackAudioGraphForSourceSwitch('qa-media-element-handoff');
          const detachedOldSource = source === null && audioSourceMedia === null;
          const secondReady = initAudio();
          const rebound = source && source !== sourceA && audioSourceMedia === deckB && audioGraphHealthy();
          return { ok: !!(firstReady && firstBound && detachedOldSource && secondReady && rebound), firstReady, firstBound, detachedOldSource, secondReady, rebound: !!rebound };
        } catch (error) {
          return { ok: false, error: String(error && error.stack || error) };
        } finally {
          disconnectAudioGraphNodes(false);
          audio = null;
          if (audioCtx && audioCtx.state !== 'closed' && audioCtx.close) {
            try { await audioCtx.close(); } catch (error) {}
          }
          audioCtx = null;
        }
      }
      const audioGraphHandoffQa = await inspectAudioGraphMediaHandoff();
      if (!audioGraphHandoffQa.ok) failures.push('audio analyser did not rebind from deck A to adopted deck B: ' + JSON.stringify(audioGraphHandoffQa));
      return {
        ok: failures.length === 0,
        failures,
        displayHz,
        fpsBeforeBoost,
        fpsAfterBoost,
        fixedFpsCadenceQa,
        lyricTextureQualityQa,
        lyricQualityCacheQa,
        lyricQa,
        persistentLyricQa,
        progressDragLyricQa,
        searchGlassQa,
        audioGraphHandoffQa,
        render: perf && perf.render,
        viewport: runtime && runtime.viewport
      };
    })();
  \`);

  finish(result.ok ? 0 : 1, { ok: result.ok, result, logs: logs.slice(-16) });
}).catch(error => {
  finish(1, { ok: false, error: String(error && error.stack || error), logs });
});
`;
}

function runElectronRuntimeCheck() {
  logStep('Electron runtime smoke check');
  const electron = electronExecutable();
  if (!electron) fail('Electron executable not found. Run npm install first.');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-quick-check-'));
  const qaScript = path.join(tempDir, 'qa-renderer-check.js');
  const qaPreload = path.join(tempDir, 'qa-preload.js');
  fs.writeFileSync(qaScript, runtimeQaScript(), 'utf8');
  fs.writeFileSync(qaPreload, `
try {
  window.localStorage.setItem('mineradio-startup-fast-skip-v1', 'true');
  window.localStorage.removeItem('mineradio-cuefield-automix-v1');
} catch (error) {}
`, 'utf8');

  try {
    const result = spawnSync(electron, [qaScript], {
      cwd: appRoot,
      env: { ...process.env, MINERADIO_QA_APP_ROOT: appRoot, MINERADIO_QA_PRELOAD: qaPreload },
      encoding: 'utf8',
      timeout: 45000
    });
    if (result.error) {
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      fail(String(result.error.message || result.error));
    }
    const match = String(result.stdout || '').match(/MINERADIO_QA_RESULT:(\{.*\})/);
    const payload = match ? JSON.parse(match[1]) : null;
    if (result.status !== 0 || !payload || payload.ok !== true) {
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      fail(`Electron runtime smoke check failed. Exit code: ${result.status}`);
    }
    const qa = payload.result || {};
    const render = qa.render || {};
    const searchGlass = qa.searchGlassQa || {};
    const lyricTextureQuality = qa.lyricTextureQualityQa || {};
    const lyricQualityCache = qa.lyricQualityCacheQa || {};
    const fixedFpsCadence = qa.fixedFpsCadenceQa || {};
    const persistentLyrics = qa.persistentLyricQa || {};
    const progressDragLyrics = qa.progressDragLyricQa || {};
    const afterPaint = searchGlass.afterPaint || {};
    console.log('[OK] Electron runtime smoke check passed.');
    console.log(`     displayHz=${Math.round((qa.displayHz || 0) * 10) / 10}, fps=${qa.fpsBeforeBoost}, boost=${qa.fpsAfterBoost}, mode=${render.mode || 'unknown'}`);
    console.log(`     fixedFpsCadence: ${(fixedFpsCadence.profiles || []).map(profile => `${profile.hz}Hz/${profile.target}=${Math.round(profile.actual * 10) / 10}`).join(', ') || 'n/a'}, dragCap=${!!fixedFpsCadence.fixedPreserved}, vsyncWake=${!!fixedFpsCadence.vsyncCanWake}`);
    console.log(`     lyricTextureQuality: ${(lyricTextureQuality.rows || []).map(row => `${row.tier}x=${row.width}x${row.height}`).join(', ') || 'n/a'}`);
    console.log(`     lyricQualityCache: rows=${lyricQualityCache.firstRows || 0}/${lyricQualityCache.maxRows || 0}, bytes=${lyricQualityCache.firstBytes || 0}, stable=${!!lyricQualityCache.stable}, expiredOverBudget=${!!lyricQualityCache.startedOverNewBudget}, noBaseFlash=${lyricQualityCache.sawBase === false}, noDisposeRevive=${!!lyricQualityCache.noDisposeResurrection}, tier=${lyricQualityCache.newTier || 0}`);
    console.log(`     persistentLyrics: root=${persistentLyrics.rootId || 'n/a'}, sameTrackOutgoing=${persistentLyrics.maxSameTrackOutgoing}, upload/frame=${persistentLyrics.maxUploadConsumed}, indexLag=${persistentLyrics.maxIndexLag}, residentPrimary=${persistentLyrics.maxResidentPrimary}, runway=${persistentLyrics.minimumForwardRunway}, logicalWidth=${persistentLyrics.maxLogicalRowWidth}, fontDrift=${Math.round((persistentLyrics.maxGlyphWorldDrift || 0) * 1000) / 10}%, activeScale=${Math.round((persistentLyrics.minActiveScale || 0) * 1000) / 1000}`);
    console.log(`     progressDragLyrics: root=${progressDragLyrics.rootId || 'n/a'}, commit=${Math.round(progressDragLyrics.textCommitMs || 0)}ms, previewGap=${!!progressDragLyrics.previewDroppedBeforeReady}, samples=${progressDragLyrics.continuousSamples || 0}, moving=${progressDragLyrics.movingFrames || 0}, snaps=${progressDragLyrics.snapFrames || 0}, reverse=${progressDragLyrics.reverseFrames || 0}, trackRows/frame=${Math.round((progressDragLyrics.maxTrackRowsPerFrame || 0) * 1000) / 1000}, visualRows/frame=${Math.round((progressDragLyrics.maxVisualRowsPerFrame || 0) * 1000) / 1000}, corridor=${progressDragLyrics.presentationLinesVisited || 0} lines/${progressDragLyrics.corridorMissingTextFrames || 0} blank, join=${Math.round((progressDragLyrics.maxJoinError || 0) * 1000) / 1000}, upload/frame=${progressDragLyrics.maxUploadConsumed}`);
    console.log(`     searchGlass: boxDirect=${afterPaint.directFilter || 'n/a'}, boxBefore=${afterPaint.glassFilter || 'n/a'}, pillDirect=${afterPaint.pillFilter || 'n/a'}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function removeOwnedStartupQaDirectory(target, parent, expectedLeaf) {
  if (!target || !parent || !expectedLeaf) return;
  const resolvedTarget = path.resolve(target);
  const resolvedParent = path.resolve(parent);
  if (path.dirname(resolvedTarget) !== resolvedParent || path.basename(resolvedTarget) !== expectedLeaf) {
    fail(`Refusing to remove unexpected startup QA path: ${resolvedTarget}`);
  }
  fs.rmSync(resolvedTarget, { recursive: true, force: true });
}

function runMainStartupRecoveryCheck() {
  logStep('Real main-entry startup recovery check');
  if (process.platform !== 'win32') {
    console.log('[SKIP] Real main-entry startup recovery check is Windows-specific.');
    return;
  }
  const electron = electronExecutable();
  if (!electron) fail('Electron executable not found. Run npm install first.');
  const appData = process.env.APPDATA;
  if (!appData) fail('APPDATA is required for the real main-entry startup recovery check');
  const runtimeName = `MineradioStartupQA-${process.pid}-${Date.now()}`;
  const qaUserDataParent = path.join(process.env.TEMP || appData, 'mineradio-startup-qa');
  fs.mkdirSync(qaUserDataParent, { recursive: true });
  const qaUserData = path.join(qaUserDataParent, runtimeName);
  const stateFile = path.join(qaUserData, 'startup-state.json');
  const qaSessionData = path.join('D:\\MineradioCache\\chromium', runtimeName);
  try {
    const result = spawnSync(electron, [appRoot], {
      cwd: appRoot,
      env: {
        ...process.env,
        MINERADIO_RUNTIME_NAME: runtimeName,
        MINERADIO_APP_USER_MODEL_ID: 'com.mineradio.startup.qa',
        MINERADIO_NO_DESKTOP_SHORTCUT: '1',
        MINERADIO_STARTUP_QA_USER_DATA: qaUserData,
        MINERADIO_STARTUP_TEST_SERVER_DELAY_MS: '4500',
        MINERADIO_STARTUP_TEST_FAIL_FIRST_NAV: '1',
        MINERADIO_STARTUP_TEST_STALL_LOAD_PROMISE: '1',
        MINERADIO_STARTUP_QA_HIDDEN: '1',
        MINERADIO_STARTUP_QA_EXIT_MS: '700',
      },
      encoding: 'utf8',
      timeout: 40000,
    });
    if (result.error || result.status !== 0 || !fs.existsSync(stateFile)) {
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      fail(`Real main-entry startup QA failed: ${result.error && result.error.message || `exit=${result.status}`}`);
    }
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const events = Array.isArray(state.events) ? state.events : [];
    const firstAt = phase => {
      const event = events.find(item => item && item.phase === phase);
      return event ? Number(event.at) || 0 : 0;
    };
    const windowCreatedAt = firstAt('window-created');
    const windowVisibleAt = firstAt('window-visible');
    const serverReadyAt = firstAt('server-ready');
    const retryAt = firstAt('navigation-retry');
    const navigationReadyAt = firstAt('navigation-ready');
    const readyAt = firstAt('ready');
    const retryEvents = events.filter(item => item && item.phase === 'navigation-retry');
    const navigationAttempts = events.filter(item => item && item.phase === 'navigation-attempt');
    const secondNavigationAt = navigationAttempts[1] ? Number(navigationAttempts[1].at) || 0 : 0;
    const failedAt = firstAt('failed');
    if (
      state.phase !== 'ready'
      || !windowCreatedAt
      || !windowVisibleAt
      || !serverReadyAt
      || !retryAt
      || !navigationReadyAt
      || !readyAt
      || retryEvents.length !== 1
      || navigationAttempts.length !== 2
      || !secondNavigationAt
      || failedAt
      || windowVisibleAt >= serverReadyAt
      || readyAt <= retryAt
      || navigationReadyAt < secondNavigationAt
      || navigationReadyAt - secondNavigationAt >= 15000
      || windowVisibleAt - Number(state.startedAt || 0) > 5000
    ) {
      fail(`Real main-entry startup recovery invariants failed: ${JSON.stringify({ state, windowCreatedAt, windowVisibleAt, serverReadyAt, retryAt, navigationReadyAt, readyAt, secondNavigationAt, failedAt })}`);
    }
    console.log(`[OK] Startup shell visible in ${windowVisibleAt - state.startedAt}ms; injected first navigation failure recovered, stalled loadURL Promise was accepted by trusted navigation readiness in ${navigationReadyAt - secondNavigationAt}ms.`);
  } finally {
    if (fs.existsSync(qaUserData)) removeOwnedStartupQaDirectory(qaUserData, qaUserDataParent, runtimeName);
    const qaSessionParent = path.dirname(qaSessionData);
    if (fs.existsSync(qaSessionData)) removeOwnedStartupQaDirectory(qaSessionData, qaSessionParent, runtimeName);
  }
}

async function checkLargePlaylistVirtualizationGuard() {
  logStep('Large playlist virtualization and progressive queue guard');
  const detailText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '02-playlist-detail.js'), 'utf8');
  const loaderText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '03-podcast-playlist-loaders.js'), 'utf8');
  const shelfText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '04-shelf', '01-manager-core.js'), 'utf8');
  const shelfContentText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '04-shelf', '03-content-list-manager.js'), 'utf8');
  const qishuiText = fs.readFileSync(path.join(appRoot, 'qishui-api.js'), 'utf8');
  const serverText = fs.readFileSync(path.join(appRoot, 'server.js'), 'utf8');
  const cssText = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');

  if (!/fetchNeteaseUserPlaylistsPage/.test(serverText) || !/nextOffset/.test(serverText) || !/hasMore/.test(serverText)) {
    fail('Netease playlist catalog must expose real offset pagination');
  }
  if (!/neteasePlaylistTrackIndexCache/.test(serverText) || !/fetchNeteasePlaylistTrackIndex/.test(serverText) || !/NETEASE_TRACK_STREAM_PAGE_SIZE/.test(serverText)) {
    fail('Netease large-playlist pages must reuse one bounded track-id index instead of reparsing the whole playlist per page');
  }
  if (/targetCount\s*=\s*Math\.min\(240/.test(qishuiText) || !/qishuiWebPlaylistCursorCache/.test(qishuiText)) {
    fail('Qishui playlist pagination must not stop at 240 and must reuse cursor state');
  }
  if (!/function rebindShelfCard/.test(shelfText) || !/function rebindContentRow/.test(shelfContentText)) {
    fail('3D shelf cards and detail rows must reuse their GPU-backed objects');
  }
  const detailScrollerStart = detailText.indexOf('function bindPlaylistPanelDetailScroller');
  const detailScrollerEnd = detailText.indexOf('async function loadMorePlaylistPanelDetailTracks', detailScrollerStart);
  if (detailScrollerStart < 0 || detailScrollerEnd < 0 || /addEventListener\(['"]scroll/.test(detailText.slice(detailScrollerStart, detailScrollerEnd))) {
    fail('expanded playlist detail must share the outer playlist-panel scroll axis');
  }
  if (!/#playlist-panel \.pl-inline-detail[\s\S]*?overflow:\s*visible/.test(cssText) || !/#playlist-panel \.pl-card\.expanded::before/.test(cssText)) {
    fail('continuous expanded playlist detail and its highlighted group styling are missing');
  }
  const detailStickyRules = Array.from(cssText.matchAll(/#playlist-panel\s+\.pl-detail-sticky\s*\{([^}]*)\}/g));
  const detailStickyCss = detailStickyRules.length ? detailStickyRules[detailStickyRules.length - 1][1] : '';
  if (!/\bposition:\s*sticky\b/.test(detailStickyCss) || !/\btop:\s*(?!auto\b)[^;}]+/.test(detailStickyCss) || /\bposition:\s*(?:relative|static)\b|\btop:\s*auto\b/.test(detailStickyCss)) {
    fail('expanded playlist summary must stay sticky on the outer playlist-panel scroll axis');
  }
  const detailListRules = Array.from(cssText.matchAll(/#playlist-panel\s+\.pl-detail-list\s*\{([^}]*)\}/g));
  const detailListCss = detailListRules.length ? detailListRules[detailListRules.length - 1][1] : '';
  if (!/\boverflow:\s*visible\b/.test(detailListCss) || /\boverflow-y:\s*(?:auto|scroll)\b/.test(detailListCss)) {
    fail('expanded playlist tracks must keep the single outer scroll axis');
  }
  const shelfSync = shelfText.slice(shelfText.indexOf('function syncRenderedWindow'), shelfText.indexOf('function rebuild'));
  const contentSync = shelfContentText.slice(shelfContentText.indexOf('function syncRenderedRows'), shelfContentText.indexOf('return {', shelfContentText.indexOf('function syncRenderedRows')));
  if (/disposeRenderedCards\(\);\s*renderedStart\s*=\s*start/.test(shelfSync) || /disposeRows\(\);\s*renderedStart\s*=\s*start/.test(contentSync)) {
    fail('3D virtual windows must not dispose the whole GPU pool while scrolling');
  }

  const queueWindowStart = detailText.indexOf('function queuePanelVirtualWindow');
  const queueWindowEnd = detailText.indexOf('function scheduleQueuePanelVirtualRender', queueWindowStart);
  if (queueWindowStart < 0 || queueWindowEnd < 0) fail('queue virtual window helper missing');
  const queueWindowSandbox = { QUEUE_VIRTUAL_ROW_STEP: 62, QUEUE_VIRTUAL_OVERSCAN: 8, Math, Number };
  vm.runInNewContext(detailText.slice(queueWindowStart, queueWindowEnd), queueWindowSandbox, { filename: 'playlist-queue-window.js' });
  const queueWindow = queueWindowSandbox.queuePanelVirtualWindow(null, { clientHeight: 620, scrollTop: 62 * 9988 }, 10000, true, -1);
  if (queueWindow.end - queueWindow.start > 32 || queueWindow.start < 9950 || queueWindow.end !== 10000) {
    fail(`10k queue virtual window is too large or cannot reach the tail: ${JSON.stringify(queueWindow)}`);
  }

  const detailRowsStart = detailText.indexOf('function playlistPanelDetailRowsHtml');
  const detailRowsEnd = detailText.indexOf('var PLAYLIST_REORDER_STORE_KEY', detailRowsStart);
  if (detailRowsStart < 0 || detailRowsEnd < 0) fail('playlist detail virtual row helper missing');
  const detailRowsSandbox = {
    playlistPanelDetailState: {
      loading: false,
      loadingMore: false,
      tracks: Array.from({ length: 10000 }, (_, index) => ({ id: index, name: 'Track ' + index, artist: 'Artist' })),
      total: 10000,
      hasMore: false,
      error: '',
      message: ''
    },
    PLAYLIST_DETAIL_ROW_STEP: 56,
    PLAYLIST_DETAIL_VIRTUAL_OVERSCAN: 7,
    PLAYLIST_DETAIL_INITIAL_RENDER: 96,
    window: { innerHeight: 900 },
    songCoverSrc: () => '',
    normalizePlaylistProvider: provider => provider === 'mineradio' ? 'mineradio' : (['qq', 'kugou', 'qishui', 'spotify'].includes(provider) ? provider : 'netease'),
    escHtml: value => String(value == null ? '' : value),
    Math,
    Number,
    String
  };
  vm.runInNewContext(detailText.slice(detailRowsStart, detailRowsEnd), detailRowsSandbox, { filename: 'playlist-detail-rows.js' });
  const detailRowsHtml = detailRowsSandbox.playlistPanelDetailRowsHtml({ viewport: 620, scrollTop: 56 * 9988 });
  const detailRowIndexes = Array.from(detailRowsHtml.matchAll(/data-pl-detail-row="(\d+)"/g), match => Number(match[1]));
  const detailSpacerCount = (detailRowsHtml.match(/class="pl-detail-virtual-spacer"/g) || []).length;
  if (detailRowIndexes.length > 26 || detailRowIndexes[detailRowIndexes.length - 1] !== 9999 || detailSpacerCount !== 2) {
    fail(`10k playlist detail virtual window regressed: ${JSON.stringify({ rows: detailRowIndexes.length, last: detailRowIndexes[detailRowIndexes.length - 1], spacers: detailSpacerCount })}`);
  }

  const catalogStart = detailText.indexOf('var playlistPanelVirtualCache');
  const catalogEnd = detailText.indexOf('function playlistCatalogFooterHtml', catalogStart);
  if (catalogStart < 0 || catalogEnd < 0) fail('playlist catalog virtual entry helper missing');
  const catalogSandbox = {
    playlistCatalogRevision: 1,
    userPlaylists: Array.from({ length: 5000 }, (_, index) => ({ provider: 'netease', id: String(index + 1), name: 'Playlist ' + index })),
    playlistPanelDetailState: { key: '', loading: false, tracks: [], total: 0, error: '' },
    normalizePlaylistProvider: provider => ['qq', 'kugou', 'qishui', 'spotify'].includes(provider) ? provider : 'netease',
    playlistCardPriority: () => 1,
    playlistPanelKey: (provider, id) => provider + ':' + id,
    window: { innerHeight: 900 },
    Math,
    Number
  };
  vm.runInNewContext(detailText.slice(catalogStart, catalogEnd), catalogSandbox, { filename: 'playlist-catalog-window.js' });
  const catalogStarted = process.hrtime.bigint();
  const catalog = catalogSandbox.playlistPanelBuildVirtualEntries();
  const catalogMs = Number(process.hrtime.bigint() - catalogStarted) / 1e6;
  const visibleTop = Math.max(0, catalog.totalHeight - 620);
  const catalogWindowStart = catalogSandbox.playlistPanelOffsetIndex(catalog.offsets, Math.max(0, visibleTop - 760));
  const catalogWindowEnd = Math.min(catalog.entries.length, catalogSandbox.playlistPanelOffsetIndex(catalog.offsets, visibleTop + 620 + 760) + 1);
  if (catalog.entries.length !== 5001 || catalogWindowEnd - catalogWindowStart > 72 || catalogWindowEnd !== catalog.entries.length || catalogMs > 120) {
    fail(`5k playlist catalog virtualization missed its scale budget: ${JSON.stringify({ entries: catalog.entries.length, window: catalogWindowEnd - catalogWindowStart, end: catalogWindowEnd, ms: catalogMs })}`);
  }

  const hydrateStart = loaderText.indexOf('function playlistQueueSource');
  const hydrateEnd = loaderText.indexOf('async function loadPlaylistIntoQueueById', hydrateStart);
  if (hydrateStart < 0 || hydrateEnd < 0) fail('progressive playlist queue helper missing');
  const seed = Array.from({ length: 96 }, (_, id) => ({ id, name: 'Track ' + id }));
  const hydrateSandbox = {
    playQueue: seed,
    queueHydrationState: null,
    PLAYLIST_QUEUE_INITIAL_BATCH_SIZE: 96,
    PLAYLIST_QUEUE_BACKGROUND_BATCH_SIZE: 160,
    PLAYLIST_QUEUE_PLAYBACK_AHEAD_THRESHOLD: 96,
    playlistTracksEndpoint: (provider, id, params) => `${provider}:${id}?offset=${params.offset}&limit=${params.limit}`,
    apiJson: async url => {
      const offset = Number((url.match(/offset=(\d+)/) || [])[1]) || 0;
      const limit = Number((url.match(/limit=(\d+)/) || [])[1]) || 0;
      const count = Math.max(0, Math.min(limit, 10000 - offset));
      return {
        tracks: Array.from({ length: count }, (_, index) => ({ id: offset + index, name: 'Track ' + (offset + index) })),
        total: 10000,
        nextOffset: offset + count,
        hasMore: offset + count < 10000
      };
    },
    fetchPlaylistTracksPage: async (provider, id, params) => hydrateSandbox.apiJson(
      hydrateSandbox.playlistTracksEndpoint(provider, id, params)
    ),
    cloneSong: song => Object.assign({}, song),
    markSongsLiked: () => {},
    syncLikeStatusForSongs: () => {},
    safeRenderQueuePanel: () => {},
    scheduleShelfRebuild: () => { hydrateSandbox.shelfRebuilds += 1; },
    shuffleArrayInPlace: rows => rows,
    playMode: 'loop',
    setTimeout: () => { hydrateSandbox.autoSchedules += 1; return hydrateSandbox.autoSchedules; },
    clearTimeout: () => {},
    console,
    Math,
    Number,
    String,
    Array,
    Object,
    Promise,
    autoSchedules: 0,
    shelfRebuilds: 0
  };
  hydrateSandbox.queueHydrationState = {
    token: 7,
    active: true,
    loading: false,
    provider: 'netease',
    playlistId: 'scale-test',
    sourceId: 'scale-test',
    total: 10000,
    nextOffset: 96,
    hasMore: true,
    loaded: 96,
    error: '',
    promise: null,
    timer: 0,
    queueRef: seed,
    liked: false,
    warmPagesRemaining: 1,
    pausedForBuffer: false
  };
  vm.runInNewContext(loaderText.slice(hydrateStart, hydrateEnd), hydrateSandbox, { filename: 'playlist-progressive-queue.js' });
  let pages = 1;
  await hydrateSandbox.hydratePlaylistQueueNextPage('initial-warm-page');
  if (hydrateSandbox.playQueue.length !== 256 || !hydrateSandbox.queueHydrationState.active || hydrateSandbox.autoSchedules !== 0 || hydrateSandbox.shelfRebuilds !== 0) {
    fail(`10k queue must stop after one bounded warm page: ${JSON.stringify({ length: hydrateSandbox.playQueue.length, active: hydrateSandbox.queueHydrationState.active, autoSchedules: hydrateSandbox.autoSchedules, shelfRebuilds: hydrateSandbox.shelfRebuilds })}`);
  }
  while (hydrateSandbox.queueHydrationState.active && pages < 64) {
    await hydrateSandbox.hydratePlaylistQueueNextPage('queue-browse-tail');
    pages += 1;
  }
  const ids = hydrateSandbox.playQueue.map(song => song.id);
  if (ids.length !== 10000 || new Set(ids).size !== 10000 || ids[0] !== 0 || ids[9999] !== 9999 || pages > 63) {
    fail(`10k progressive queue did not complete in order: ${JSON.stringify({ length: ids.length, unique: new Set(ids).size, first: ids[0], last: ids[9999], pages })}`);
  }
  console.log(`[OK] 5k catalog=${catalogMs.toFixed(2)}ms/window ${catalogWindowEnd - catalogWindowStart}; 10k queue=1 warm + ${pages - 1} on-demand pages/window ${queueWindow.end - queueWindow.start}; one outer detail scroll; 3D pools retained.`);
}

function checkFxConsoleWorkspaceGuard() {
  logStep('Visual console workspace guard');
  const workspacePath = path.join(appRoot, 'public', 'js', 'modules', '07-fx', '09-console-workspace.js');
  const panelPath = path.join(appRoot, 'public', 'js', 'modules', '07-fx', '05-fx-panel-performance.js');
  const loaderPath = path.join(appRoot, 'public', 'js', 'index-loader.js');
  const cssPath = path.join(appRoot, 'public', 'css', 'index.css');
  const htmlPath = path.join(appRoot, 'public', 'index.html');
  const defaultsPath = path.join(appRoot, 'public', 'js', 'modules', '00-state', '04-fx-defaults.js');
  const packagedDefaultsPath = path.join(appRoot, 'public', 'js', 'modules', '00-state', '05-packaged-fx-archive.js');
  const persistencePath = path.join(appRoot, 'public', 'js', 'modules', '02-visual', '04-visual-settings-persistence.js');
  const archivePath = path.join(appRoot, 'public', 'js', 'modules', '07-fx', '00-preset-archive-data.js');
  const defaultArchivePath = path.join(appRoot, 'public', 'default-user-fx-archive.json');
  const rowLayersPath = path.join(appRoot, 'public', 'js', 'modules', '02-visual', '12-lyrics-row-layers.js');
  const stageLyricsPath = path.join(appRoot, 'public', 'js', 'modules', '02-visual', '14-stage-lyrics-rendering.js');
  const starRiverPath = path.join(appRoot, 'public', 'js', 'modules', '02-visual', '03-lyrics-star-river.js');
  const maskTexturePath = path.join(appRoot, 'public', 'js', 'modules', '02-visual', '10-lyrics-mask-textures.js');
  const workspace = fs.readFileSync(workspacePath, 'utf8');
  const panel = fs.readFileSync(panelPath, 'utf8');
  const loader = fs.readFileSync(loaderPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const defaults = fs.readFileSync(defaultsPath, 'utf8');
  const packagedDefaults = fs.readFileSync(packagedDefaultsPath, 'utf8');
  const persistence = fs.readFileSync(persistencePath, 'utf8');
  const archive = fs.readFileSync(archivePath, 'utf8');
  const defaultArchive = JSON.parse(fs.readFileSync(defaultArchivePath, 'utf8'));
  const rowLayers = fs.readFileSync(rowLayersPath, 'utf8');
  const stageLyrics = fs.readFileSync(stageLyricsPath, 'utf8');
  const starRiver = fs.readFileSync(starRiverPath, 'utf8');
  const maskTexture = fs.readFileSync(maskTexturePath, 'utf8');
  const labels = ['常用', '界面', '歌词', '动效', '歌单架', '系统'];
  if (!labels.every(label => workspace.includes(`label: '${label}'`))) fail('task-first visual console tabs are incomplete');
  if (!loader.includes("js/modules/07-fx/09-console-workspace.js")) fail('visual console workspace module is not loaded');
  if (!/data-console-layout['"],\s*['"]task-first-v2/.test(workspace) && !/setAttribute\('data-console-layout', 'task-first-v2'\)/.test(workspace)) fail('visual console layout marker is missing');
  if (!/node\.parentNode === panel/.test(workspace)) fail('visual console old-shell cleanup can remove reparented controls');
  if (!/FX_CONSOLE_HISTORY_LIMIT\s*=\s*40/.test(workspace) || !/fxConsoleChangedKeys/.test(workspace)) fail('scoped session history guard is missing');
  if (!/home:\s*1[\s\S]*interface:\s*1[\s\S]*lyrics:\s*1[\s\S]*motion:\s*1[\s\S]*shelf:\s*1[\s\S]*system:\s*1/.test(panel)) fail('visual console tab allow-list is incomplete');
  if (!/\.fx-console-toolbar/.test(css) || !/\.fx-console-group/.test(css) || !/prefers-reduced-motion:reduce/.test(css)) fail('visual console layout or reduced-motion styles are missing');
  if (!/fxConsoleSearchHitDelayTimer/.test(workspace) || !/outline-offset:\s*-2px/.test(css) || !/\.bg-media-actions,[\s\S]{0,160}\.wallpaper-engine-actions/.test(css)) fail('visual console search highlight or background media responsive layout is missing');
  const clarityButtonsReady = ['1', '2', '3', '4'].every(value => html.includes(`data-lyric-texture-clarity="${value}"`));
  const clarityLabelsReady = ['1×', '2×', '3×', '4×', '标清', '高清', '超清', '极致'].every(label => html.includes(label));
  const packagedDefaultsUseRuntimeDefaults = /PACKAGED_DEFAULT_FX_SNAPSHOT\s*=\s*Object\.freeze\(Object\.assign\(\{[\s\S]{0,180}visualPresetSchema:\s*VISUAL_PRESET_SCHEMA[\s\S]{0,120}\},\s*fxDefaults\)\)/.test(packagedDefaults);
  if (!/id="lyric-texture-quality-seg"/.test(html) || !clarityButtonsReady || !clarityLabelsReady || /data-lyric-texture-clarity="1\.(?:25|5)"/.test(html) || !/lyricTextureClarity:\s*1/.test(defaults) || !packagedDefaultsUseRuntimeDefaults || !defaultArchive.snapshot || defaultArchive.snapshot.lyricTextureClarity !== 1 || !/normalizeLyricTextureClarity/.test(persistence + archive + panel) || !/invalidateLyricQualityTextures\('texture-clarity-change'/.test(panel) || /scheduleStageLyricFullTrackWarmup\('texture-clarity-change'/.test(panel) || !/function lyricQualityPoolBudgetBytes/.test(maskTexture) || !/function makeLyricQualityTexture/.test(maskTexture) || !/function queueLyricRowQuality/.test(rowLayers) || !/qualityHotUntil/.test(rowLayers) || !/backgroundStarRiver'\s*,\s*'lyricTextureClarity'\s*,\s*\/\/ Append-only:[\s\S]{0,120}'lyricLiveViewportFit'/.test(archive)) fail('1x-4x visible-row lyric quality, persistence, cache budget, or append-only MR2 archive wiring is incomplete');
  if (!/function finalizeLyricQualitySelectionFrame/.test(rowLayers) || !/frameCandidates/.test(rowLayers) || !/function lyricQualityEffectiveBudgetBytes/.test(rowLayers) || !/qualityFallbackUntil/.test(rowLayers) || !/function pruneLyricQualityQueue/.test(rowLayers) || !/row\.qualityWanted !== true/.test(rowLayers) || !/lyricQualityEnsureCapacity\(job\.bytes[\s\S]{0,900}makeLyricQualityTexture/.test(rowLayers) || !/qualityRootPriority:\s*isCurrent \? 0 : 1000/.test(stageLyrics) || /qualityRetryAfter/.test(rowLayers) || !/fallbackHotUntil/.test(rowLayers) || !/release:\s*next <= 1/.test(panel)) fail('lyric quality global byte-aware selection, stale-job pruning, pre-render capacity check, or no-flash tier handoff is incomplete');
  const qualityCommitBody = rowLayers.slice(rowLayers.indexOf('function commitLyricRowQuality'), rowLayers.indexOf('function beginLyricQualitySelectionFrame'));
  if (!/frameCommits:\s*\[\]/.test(rowLayers) || !/function commitDeferredLyricQualityRows/.test(rowLayers) || !/lyricQualityState\.deferFinalize \|\| row\.qualityWanted !== true/.test(qualityCommitBody) || /discardLyricRowPendingQuality/.test(qualityCommitBody) || !/commitDeferredLyricQualityRows\(\)/.test(rowLayers) || !/function disposeLyricQualityOwner/.test(rowLayers) || !/__mineradioLyricQualityDisposed/.test(rowLayers) || !/disposeLyricQualityOwner\(lyricData\)/.test(starRiver) || !/qualityProjectedPoolBytes/.test(rowLayers) || !/function lyricQualityHasPendingTexture/.test(rowLayers)) fail('lyric quality deferred commit, disposed-owner cancellation, or bounded atomic tier replacement guard is incomplete');
  const fpsModesReady = ['vsync', '45', '60', '75', '90', '120'].every(value => html.includes(`data-foreground-fps="${value}"`));
  if (!fpsModesReady || !/function setForegroundFpsMode/.test(panel) || !/foregroundFpsMode/.test(persistence) || !/foreground-fps-seg/.test(workspace + css) || !/foregroundFpsMode:\s*'vsync'/.test(defaults) || !packagedDefaultsUseRuntimeDefaults) fail('default VSync and optional foreground FPS controls are incomplete');
  console.log('[OK] Six task tabs, explicit grouping, scoped history, safe DOM cleanup, search, and responsive styles are wired.');
}

function checkFirstLaunchDefaultsAndSplashGuard() {
  logStep('First-launch defaults and splash timing guard');
  const defaultsText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '04-fx-defaults.js'), 'utf8');
  const packagedText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '00-state', '05-packaged-fx-archive.js'), 'utf8');
  const archive = JSON.parse(fs.readFileSync(path.join(appRoot, 'public', 'default-user-fx-archive.json'), 'utf8'));
  const splashText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '10-shell', '03-splash.js'), 'utf8');
  const css = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
  const marker = 'var fxDefaults = ';
  const start = defaultsText.indexOf(marker);
  const end = defaultsText.indexOf('\n};', start);
  if (start < 0 || end < 0) fail('fxDefaults object cannot be inspected');
  const defaults = vm.runInNewContext(`(${defaultsText.slice(start + marker.length, end + 2)})`, Object.create(null));
  const snapshot = archive && archive.snapshot;
  const keys = Object.keys(defaults);
  const snapshotKeys = snapshot ? Object.keys(snapshot).filter(key => key !== 'visualPresetSchema') : [];
  const drift = keys.filter(key => !snapshot || JSON.stringify(snapshot[key]) !== JSON.stringify(defaults[key]));
  if (!snapshot || snapshotKeys.length !== keys.length || drift.length) {
    fail(`first-launch runtime and packaged archive defaults drifted: ${drift.join(', ') || 'key-count mismatch'}`);
  }
  const expectedCapturedDefaults = {
    depth: 0.2,
    lyricDisplayMode: 'cinema',
    lyricTranslationMode: 'multi',
    lyricFont: 'sans',
    lyricWeight: 750,
    controlGlassChromaticOffset: 50,
    playlistPanelGlassBlur: 14,
    playlistPanelGlassDensity: 0.55,
    performanceBackground: 'release',
    performanceQuality: 'eco',
    memoryAutoSystemTrim: true,
    memorySystemAutoElevate: true,
    wallpaperFps: 60,
    shelfCameraMode: 'dynamic',
    shelfPresence: 'auto'
  };
  const capturedDrift = Object.keys(expectedCapturedDefaults).filter(key => JSON.stringify(defaults[key]) !== JSON.stringify(expectedCapturedDefaults[key]));
  if (capturedDrift.length || archive.exportedAt !== 1784607916226 || archive.savedAt !== 1784607916226) {
    fail(`captured first-launch settings identity drifted: ${capturedDrift.join(', ') || 'timestamp'}`);
  }
  if (!/PACKAGED_DEFAULT_FX_SNAPSHOT\s*=\s*Object\.freeze\(Object\.assign\(\{[\s\S]{0,180}visualPresetSchema:\s*VISUAL_PRESET_SCHEMA[\s\S]{0,120}\},\s*fxDefaults\)\)/.test(packagedText)) {
    fail('packaged first-launch snapshot must inherit the synchronized runtime defaults');
  }
  if (!/function splashTimelineElapsed\(elapsed\)\s*\{\s*return elapsed;\s*\}/.test(splashText)
    || /elapsed\s*\*\s*3\.32/.test(splashText)
    || !/setTimeout\(markSplashReadyToEnter,\s*650\)/.test(splashText)
    || !/setTimeout\(markSplashReadyToEnter,\s*1500\)/.test(splashText)
    || !/\.splash-word-mine\s*\{[\s\S]{0,160}animation:\s*splash-mine-in 5200ms/.test(css)
    || !/\.splash-word-radio\s*\{[\s\S]{0,420}animation:\s*splash-radio-in 5200ms/.test(css)
    || !/\.splash-word-i::after\s*\{[\s\S]{0,480}animation:\s*splash-i-dot-pop 4200ms/.test(css)
    || !/\.splash-signal-line\s*\{[\s\S]{0,500}animation:\s*splash-signal-line 4200ms/.test(css)
    || !/\.splash-signal-line::after\s*\{[\s\S]{0,420}animation:\s*splash-signal-blip 4200ms/.test(css)
    || !/\.splash-sub\s*\{[\s\S]{0,260}animation:\s*splash-sub-in 4200ms/.test(css)) {
    fail('public-repo splash motion speed and the independent fast click-entry gate must stay decoupled');
  }
  if (!/\.user-archive-toolbar\s*\{[\s\S]{0,220}display:\s*grid;[\s\S]{0,160}grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(css)
    || !/\.user-archive-tools\s*\{[\s\S]{0,180}display:\s*grid;[\s\S]{0,160}grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(css)
    || !/\.user-archive-tools \.fx-mini-btn\s*\{[\s\S]{0,180}width:\s*100%;[\s\S]{0,160}white-space:\s*nowrap/.test(css)) {
    fail('user archive actions must stay in one balanced three-column row');
  }
  console.log(`[OK] ${keys.length} captured defaults match; splash motion is 5.2s/4.2s while entry stays ready at 1.5s/0.65s; archive actions stay in one row.`);
}

async function main() {
  console.log(`App root: ${appRoot}`);
  runNodeSyntaxCheck(jsCheckFiles());
  runPlaybackAudioGraphRegressionCheck();
  runPlaybackSourceFallbackTransactionCheck();
  runPlaybackSingleRepeatLoopRegressionCheck();
  runLocalMusicLibraryRegressionCheck();
  runBuiltInPlaylistRegressionCheck();
  runWallpaperEngineIdleDisposeRegressionCheck();
  runWallpaperEngineMinimizeResidentRegressionCheck();
  runWallpaperEngineWin10YellowBorderRegressionCheck();
  runGestureCameraPermissionRegressionCheck();
  runGesturePlayerActionsRegressionCheck();
  runGestureRuntimeLifecycleRegressionCheck();
  runCuratedVisualPresetsRegressionCheck();
  runVisualClarityAndPortraitFullscreenRegressionCheck();
  runQQVipEntitlementRegressionCheck();
  runLoginEasterEggGateRegressionCheck();
  runQishuiProviderDistributionRegressionCheck();
  runProviderRemovalDiyCinemaRegressionCheck();
  runVisualPerformanceControlsRegressionCheck();
  runPlatformAccountSyncGuardCheck();
  runHomeDailyRecommendationRegressionCheck();
  parseCombinedIndexModules();
  scanForbiddenMarkers();
  checkMainWindowChrome();
  checkBackgroundTransparencyControlsGuard();
  checkWallpaperEngineImportGuard();
  checkDesktopWallpaperModeGuard();
  checkDesktopWindowAdaptationGuard();
  checkLyricLayoutRangeGuard();
  checkPointerLockPermission();
  checkProgressSeekDragGuard();
  checkLyricBackfaceMaterialGuard();
  checkLyricScrollPerformanceGuard();
  checkPersistentCacheStorageGuard();
  checkExternalUpdatePageBridgeGuard();
  checkLyricTranslationCompletenessGuard();
  checkLyricVerticalFloatToggleGuard();
  checkQishuiProviderGuard();
  checkSpotifyRemovalGuard();
  checkPlaybackControlBadgesGuard();
  await checkProviderFallbackTerminalStateGuard();
  checkSearchGlassEntranceGuard();
  checkProviderEntitlementBoundaryGuard();
  checkQQVipStatusSyncGuard();
  await checkProviderAuthCookiePathGuard();
  checkPlaybackResumeRecoveryGuard();
  checkAudioOutputWorkflowPanelGuard();
  checkVolumeWheelStepGuard();
  checkNonCurrentAudioPrefetchGuard();
  checkCuefieldAutoMixGuard();
  checkAlbumDetailGaplessGuard();
  checkInternalBetaPackagingGuard();
  checkSonicTopographyPresetGuard();
  checkLongPressReorderGuard();
  checkPlaylistPanelTriggerGuard();
  checkShuffleQueueOrderGuard();
  await checkLargePlaylistVirtualizationGuard();
  checkFirstLaunchDefaultsAndSplashGuard();
  checkFxConsoleWorkspaceGuard();
  if (runElectron) {
    runElectronRuntimeCheck();
    runMainStartupRecoveryCheck();
  }
  else console.log('\n== Electron runtime smoke check ==\n[SKIP] Fast/static mode. Use quick-check.bat full to enable it.');
}

main().then(function () {
  console.log('\nAll checks passed.');
}).catch(function (error) {
  console.error(`\n[FAIL] ${error.message || error}`);
  process.exit(1);
});
