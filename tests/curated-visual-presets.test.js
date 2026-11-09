'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const appRoot = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(appRoot, rel), 'utf8');
const core = read('public/js/modules/00-state/00-core-stores.js');
const data = read('public/js/modules/07-fx/00-preset-archive-data.js');
const shader = read('public/js/modules/02-visual/00-pointer-cover-particles.js');
const orbit = read('public/js/modules/01-scene/01-orbit-free-camera.js');
const grid = read('public/js/modules/07-fx/04-preset-grid-uniforms.js');
const css = read('public/css/index.css');
const mainLoop = read('public/js/modules/11-main-loop.js');

assert.match(core, /MAX_VISUAL_PRESET_INDEX = 12/);
assert.match(core, /SONIC_PRESET_INDEX = 7/);
assert.match(core, /SONIC_WORKSHOP_PRESET_INDEX = 8/);
assert.match(data, /presetDisplayOrder = \[0, 9, 10, 11, 12, 6, 7, 8, 5, 4, 2, 1, 3\]/);
for (const [id, cn, en] of [
  [9, '月蚀圣环', 'ECLIPSE HALO'],
  [10, '雨幕霓虹', 'NEON DRIZZLE'],
  [11, '折光蝶群', 'PRISM FLOCK'],
  [12, '深海绽放', 'ABYSSAL BLOOM']
]) {
  assert.ok(data.includes(cn));
  assert.ok(data.includes(en));
  assert.match(orbit, new RegExp('p === ' + id));
  assert.match(shader, new RegExp('Number\\(fx\\.preset\\) === ' + id));
}
assert.match(shader, /else if \(uPreset < 8\.5\)/);
assert.match(shader, /Preset 9: ECLIPSE HALO/);
assert.match(shader, /Preset 10: NEON DRIZZLE/);
assert.match(shader, /Preset 11: PRISM FLOCK/);
assert.match(shader, /Preset 12: ABYSSAL BLOOM/);
assert.match(grid, /preset-card-premium/);
assert.match(css, /\.preset-card\.preset-card-premium/);
assert.match(mainLoop, /authoredParticles = fx\.preset >= 9 && fx\.preset <= 12/);
assert.doesNotMatch(shader + grid + data, /Mineradio WE Glass Refraction|#mineradio-control-glass-filter/);

console.log('OK curated-visual-presets');
