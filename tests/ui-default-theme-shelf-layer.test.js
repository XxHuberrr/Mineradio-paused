'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
}

function objectPropertyCall(source, propertyName, functionName) {
  const marker = `${propertyName}: ${functionName}(`;
  const propertyStart = source.indexOf(marker);
  assert.notEqual(propertyStart, -1, `expected ${propertyName} ${functionName}() assignment`);

  const callStart = propertyStart + marker.indexOf(functionName);
  const openingParen = source.indexOf('(', callStart);
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let index = openingParen; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '(') depth += 1;
    if (character === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(callStart, index + 1);
    }
  }
  throw new Error(`unterminated ${propertyName} ${functionName}() assignment`);
}

test('first-launch UI accent defaults and missing-field fallback stay white', () => {
  const defaults = read('public/js/modules/00-state/04-fx-defaults.js');
  const css = read('public/css/index.css');
  const html = read('public/index.html');
  const persistence = read('public/js/modules/02-visual/04-visual-settings-persistence.js');

  assert.match(defaults, /uiAccentColor:\s*'#ffffff'/i);
  assert.match(css, /--fc-accent:\s*#ffffff\s*;/i);
  assert.match(css, /--fc-accent-hov:\s*#ffffff\s*;/i);
  assert.match(css, /--fc-accent-rgb:\s*255\s*,\s*255\s*,\s*255\s*;/i);
  assert.match(html, /id="ui-accent-picker"[^>]*\bvalue="#ffffff"/i);
  assert.match(html, /id="ui-accent-value"[^>]*>#ffffff</i);

  const readAccentExpression = objectPropertyCall(
    persistence,
    'uiAccentColor',
    'normalizeHexColor',
  );
  assert.match(
    readAccentExpression,
    /raw\.uiAccentColor\s*\|\|\s*fxDefaults\.uiAccentColor\s*\|\|\s*'#ffffff'/i,
    'saved user color must remain ahead of the packaged white fallback',
  );

  const loadAccent = vm.runInNewContext(
    `(function (raw, fxDefaults, normalizeHexColor) { return ${readAccentExpression}; })`,
  );
  const normalizeHexColor = (value, fallback) => (
    /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : fallback
  );

  assert.equal(
    loadAccent({}, { uiAccentColor: '#ffffff' }, normalizeHexColor),
    '#ffffff',
    'a missing saved field must use the white packaged default',
  );
  assert.equal(
    loadAccent({ uiAccentColor: '#C05AFF' }, { uiAccentColor: '#ffffff' }, normalizeHexColor),
    '#c05aff',
    'an explicit pre-existing user color must still win',
  );
});

test('persistent shelf stays behind lyrics until selection or detail raises it', () => {
  const shelf = read('public/js/modules/04-shelf/01-manager-core.js');
  const detail = read('public/js/modules/04-shelf/03-content-list-manager.js');
  const lyrics = read('public/js/modules/02-visual/14-stage-lyrics-rendering.js');
  const lyricRows = read('public/js/modules/02-visual/12-lyrics-row-layers.js');

  const lyricLayer = lyrics.match(
    /stageLyricRenderBase\s*=\s*shelfDetailOpen\s*\?\s*(\d+)\s*:\s*(\d+)/,
  );
  const sideLayer = shelf.match(
    /group\.renderOrder\s*=\s*\(contentOpenForLayer\s*\|\|\s*shelfPinnedOpen\s*\|\|\s*liftedCardActive\)\s*\?\s*(\d+)\s*:\s*(\d+)/,
  );
  const stageLayer = shelf.match(
    /group\.renderOrder\s*=\s*\(\(contentList\s*&&\s*contentList\.isOpen\(\)\)\s*\|\|\s*selectedIdx\s*>=\s*0\)\s*\?\s*(\d+)\s*:\s*(\d+)/,
  );
  const detailLayer = detail.match(/group\.renderOrder\s*=\s*(\d+)\s*;/);

  assert.ok(lyricLayer, 'expected the normal/detail lyrics layer split');
  assert.ok(sideLayer, 'expected side shelf to raise only for detail, pin, or lifted selection');
  assert.ok(stageLayer, 'expected stage shelf to raise only for detail or selection');
  assert.ok(detailLayer, 'expected an explicit content-detail layer');
  assert.match(
    shelf,
    /liftedCardActive\s*=\s*passiveAlwaysGroup\s*&&\s*cards\.some\([^]*?pointerSelectionForeground\s*&&\s*c\.selected[^]*?\(c\.floatMix\s*\|\|\s*0\)\s*>\s*0\.025/,
  );
  assert.match(
    shelf,
    /function\s+shelfPointerSelectionForegroundActive\(\)\s*\{[^]*?selectedIdx\s*>=\s*0[^]*?cursor-hidden/,
    'an inactive hidden pointer must stop keeping the passive shelf in front',
  );
  assert.match(
    shelf,
    /var\s+liftTarget\s*=\s*card\.selected\s*&&\s*shelfPointerSelectionForegroundActive\(\)/,
    'card lift must require a live pointer selection, not only a centered index',
  );
  assert.match(lyricRows, /data\.rowLayerGroup\.renderOrder\s*=\s*renderBase/);
  assert.match(lyricRows, /data\.contextGroup\.renderOrder\s*=\s*renderBase/);
  assert.match(lyricRows, /data\.readabilityGroup\.renderOrder\s*=\s*renderBase/);

  const normalLyrics = Number(lyricLayer[2]);
  const sideRaised = Number(sideLayer[1]);
  const sidePassive = Number(sideLayer[2]);
  const stageRaised = Number(stageLayer[1]);
  const stagePassive = Number(stageLayer[2]);
  const detailRaised = Number(detailLayer[1]);

  assert.ok(sidePassive < normalLyrics, 'passive side shelf must render behind lyrics');
  assert.ok(stagePassive < normalLyrics, 'unselected stage shelf must render behind lyrics');
  assert.ok(sideRaised > normalLyrics, 'selected/pinned/detail side shelf must render above lyrics');
  assert.ok(stageRaised > normalLyrics, 'selected/detail stage shelf must render above lyrics');
  assert.ok(detailRaised > normalLyrics, 'opened shelf detail must render above lyrics');
});

test('the removed stage floor reflection cannot regress', () => {
  const shelf = read('public/js/modules/04-shelf/01-manager-core.js');
  assert.doesNotMatch(shelf, /\bfloorMirror\b/);
  assert.doesNotMatch(shelf, /new\s+THREE\.PlaneGeometry\(\s*10\s*,\s*1\.8\s*\)/);
});
