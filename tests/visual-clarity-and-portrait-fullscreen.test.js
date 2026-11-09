'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('translation lyrics share high clarity sampling and global bright-background avoidance', () => {
  const textures = read('public/js/modules/02-visual/10-lyrics-mask-textures.js');
  const rows = read('public/js/modules/02-visual/12-lyrics-row-layers.js');
  assert.match(textures, /function configureLyricTextureSampling\(/);
  assert.match(textures, /THREE\.LinearMipmapLinearFilter/);
  assert.match(textures, /profile && profile\.lowSpec \? 4/);
  assert.match(rows, /currentTranslation \? 11 : \(row\.isTranslation \? 22/);
  assert.match(rows, /readabilityMix = Math\.max\(readabilityMix, row\.isTranslation/);
  assert.match(rows, /readabilityBoost = 1 \+ backdropAdapt \* \(row\.isTranslation \? 0\.66 : 0\.78\)/);
});

test('cover particles share bright-background avoidance', () => {
  const particles = read('public/js/modules/02-visual/00-pointer-cover-particles.js');
  const uniforms = read('public/js/modules/07-fx/04-preset-grid-uniforms.js');
  assert.match(particles, /uBackdropAdapt: \{ value: 0\.72 \}/);
  assert.match(particles, /brightAvoid = smoothstep\(0\.48, 0\.84, outLum\)/);
  assert.match(uniforms, /uniforms\.uBackdropAdapt\.value/);
});

test('portrait fullscreen targets the display under the window center', () => {
  const main = read('desktop/main.js');
  assert.match(main, /screen\.getDisplayNearestPoint\(\{/);
  assert.match(main, /windowFullscreenDisplayId = display \? display\.id : null/);
  assert.match(main, /win\.setBounds\(\{[\s\S]{0,220}targetBounds\.height/);
  assert.match(main, /applyWindowedBounds\(win, targetDisplay\)/);
});

test('Wallpaper Engine controls persist and use the existing DWM surface', () => {
  const renderer = read('public/js/modules/07-fx/03-wallpaper-engine-library.js');
  const preload = read('desktop/preload.js');
  const main = read('desktop/main.js');
  assert.match(renderer, /visualOpacity:/);
  assert.match(renderer, /setWallpaperEngineVisualSetting\(/);
  assert.match(preload, /updateWallpaperEngineVisualSettings/);
  assert.match(main, /mineradio-wallpaper-engine-visual-settings/);
});
