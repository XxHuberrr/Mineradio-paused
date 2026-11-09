'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const libraryText = fs.readFileSync(
  path.join(appRoot, 'public', 'js', 'modules', '07-fx', '03-wallpaper-engine-library.js'),
  'utf8'
);

function sourceBlock(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle);
  assert(start >= 0, `missing source block: ${startNeedle}`);
  const end = text.indexOf(endNeedle, start + startNeedle.length);
  assert(end > start, `missing source block terminator: ${endNeedle}`);
  return text.slice(start, end);
}

const captureBlock = sourceBlock(
  libraryText,
  'async function openWallpaperEngineCaptureStream(sessionId, fps, sourceId, options)',
  'window.__mineradioPrepareWallpaperEngineCapture = async function'
);

assert.match(
  captureBlock,
  /sourceIdOnly: options\.sourceIdOnly === true/,
  'capture diagnostics must record source-id-only mode'
);
assert.match(
  captureBlock,
  /if \(options\.sourceIdOnly === true\)[\s\S]{0,180}DISPLAY_MEDIA_FALLBACK_DISABLED/,
  'source-id-only mode must explicitly disable display-media fallback'
);
assert.match(
  captureBlock,
  /if \(options\.sourceIdOnly !== true && typeof navigator\.mediaDevices\.getDisplayMedia === 'function'\)/,
  'getDisplayMedia may only run outside source-id-only mode'
);

const scenePrepareBlock = sourceBlock(
  libraryText,
  'window.__mineradioPrepareWallpaperEngineCapture = async function',
  'window.__mineradioPrepareWallpaperEngineGlassCapture = async function'
);
assert.match(
  scenePrepareBlock,
  /openWallpaperEngineCaptureStream\(sessionId, fps, sourceId, \{\s*sourceIdOnly: true,\s*purpose: 'scene'\s*\}\)/,
  'WE scene pak preparation must not fall back to getDisplayMedia on Windows 10'
);
assert.doesNotMatch(
  scenePrepareBlock,
  /getDisplayMedia/,
  'scene preparation must not directly request display-media capture'
);

const glassPrepareBlock = sourceBlock(
  libraryText,
  'window.__mineradioPrepareWallpaperEngineGlassCapture = async function',
  'window.__mineradioPrepareWallpaperEngineHostBoundsChange = function'
);
assert.match(
  glassPrepareBlock,
  /sourceIdOnly: true/,
  'WE glass sampler must also use exact source-id capture only'
);

console.log('[OK] Wallpaper Engine pak capture avoids Win10 display-capture yellow border fallback.');
