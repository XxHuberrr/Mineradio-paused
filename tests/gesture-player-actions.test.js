'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const appRoot = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(appRoot, rel), 'utf8');
const gesture = read('public/js/modules/10-shell/00-gesture-control.js');
const defaults = read('public/js/modules/00-state/04-fx-defaults.js');
const persistence = read('public/js/modules/02-visual/04-visual-settings-persistence.js');
const archive = read('public/js/modules/07-fx/00-preset-archive-data.js');
const panel = read('public/js/modules/07-fx/05-fx-panel-performance.js');
const workspace = read('public/js/modules/07-fx/09-console-workspace.js');
const html = read('public/index.html');
const packaged = JSON.parse(read('public/default-user-fx-archive.json')).snapshot;

for (const name of ['play', 'like', 'lyrics', 'volume', 'next', 'previous']) {
  assert.match(gesture, new RegExp("action === '" + name + "'|return '" + name + "'"));
}
assert.match(gesture, /Math\.abs\(dx\) < Math\.abs\(dy\) \* 1\.65/);
assert.match(gesture, /desktop-software-locked/);
assert.match(gesture, /progressDragState/);
assert.match(gesture, /modal-mask\.show/);
assert.match(gesture, /gestureActionState\.cooldownUntil/);
assert.match(gesture, /gestureInferenceBusy/);
assert.match(gesture, /gestureHands && gestureHands\.close/);
assert.match(gesture, /function gestureHostVisible\(\)/);
assert.match(gesture, /desktopRuntimeState\.embedded === true/);
assert.match(gesture, /gestureHands\.send[\s\S]{0,420}catch \(error\)/);
assert.match(gesture, /resumeSavedGestureControl/);
assert.match(gesture, /performanceQuality === 'eco'/);
assert.doesNotMatch(gesture, /GetCursorPos|SetCursorPos|SendInput|ShowCursor|SetSystemCursor/);

for (const [key, value] of Object.entries({
  gesturePlayerActions: true,
  gestureHandOverlay: true,
  gestureSensitivity: 'balanced'
})) {
  assert.match(defaults, new RegExp(key + ":\\s*" + (typeof value === 'string' ? "'" + value + "'" : value)));
  assert.ok(key in packaged);
  assert.equal(packaged[key], value);
  assert.match(persistence, new RegExp(key));
  assert.match(archive, new RegExp(key));
}
assert.match(archive, /'coverBackdropAdapt',\s*'gesturePlayerActions',\s*'gestureHandOverlay',\s*'gestureSensitivity'/);
assert.match(html, /id="gesture-settings-card"/);
assert.match(html, /id="t-gesturePlayerActions"/);
assert.match(html, /id="t-gestureHandOverlay"/);
assert.match(html, /id="gesture-sensitivity-seg"/);
assert.match(panel, /applyGestureSettingsUi/);
assert.match(workspace, /gesture-settings-card/);

console.log('OK gesture-player-actions');
