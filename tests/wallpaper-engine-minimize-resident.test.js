'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const appRoot = path.resolve(__dirname, '..');
const mainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
const libraryText = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '07-fx', '03-wallpaper-engine-library.js'), 'utf8');

assert.match(mainText, /let\s+wallpaperEngineHostVisibilityResidentMinimized\s*=\s*false;/);
assert.match(mainText, /\^minimi\[sz\]e/);
assert.match(mainText, /captureMode\s*===\s*'dwm-thumbnail'[\s\S]{0,160}dwmSurfaceReady\s*===\s*true/);
assert.match(mainText, /preserved:\s*true/);
assert.match(mainText, /phase:\s*'resident'/);
assert.match(mainText, /forceVisibleHost:\s*true/);
assert.match(mainText, /syncWallpaperEngineDesktopIconLayering\(`resident-\$\{reason \|\| 'visible'\}`\)/);
assert.doesNotMatch(
  mainText,
  /wallpaperEngineHostVisibilityResidentMinimized\s*=\s*true[\s\S]{0,500}stopWallpaperEngineRuntimeForRenderer/,
  'resident minimize path must not stop the native WE runtime'
);
assert.match(libraryText, /if\s*\(phase\s*===\s*'resident'\)/);
assert.match(libraryText, /scheduleWallpaperEngineGlassSamplerCapture\(residentSessionId,\s*wallpaperEngineLayerToken,\s*0\)/);
assert.doesNotMatch(
  libraryText,
  /if\s*\(phase\s*===\s*'resident'\)[\s\S]{0,700}startWallpaperEngineNativeBackground/,
  'resident restore must not restart the native Scene'
);

console.log('OK wallpaper-engine-minimize-resident');
