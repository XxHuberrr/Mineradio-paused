'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const appRoot = path.resolve(__dirname, '..');
const playbackPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '13-playback-start-audio.js');
const controlsPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '14-player-controls.js');
const audioGraphPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '08-audio-graph-controls.js');
const cuefieldPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '18-cuefield-automix-integration.js');

const playbackText = fs.readFileSync(playbackPath, 'utf8');
const controlsText = fs.readFileSync(controlsPath, 'utf8');
const audioGraphText = fs.readFileSync(audioGraphPath, 'utf8');
const cuefieldText = fs.readFileSync(cuefieldPath, 'utf8');

function count(text, pattern) {
  return (text.match(pattern) || []).length;
}

assert.match(playbackText, /function\s+syncActiveAudioRepeatMode\s*\(/);
assert.match(playbackText, /function\s+restartSingleRepeatMedia\s*\(/);
assert.ok(count(playbackText, /syncActiveAudioRepeatMode\(audio\);/g) >= 2, 'local and remote playback paths must sync Audio.loop');
assert.equal(
  count(playbackText, /if\s*\(restartSingleRepeatMedia\(this,\s*token,\s*currentIdx,\s*'[^']+'\)\)\s*return;\s*finalizeListenSession\(true\);/g),
  2,
  'both ended handlers must restart single repeat before finalizing or advancing the queue'
);
assert.match(controlsText, /syncActiveAudioRepeatMode\(audio\);/);
assert.match(controlsText, /clearAlbumGaplessPreload\('play-mode-single'\)/);
assert.match(controlsText, /resetCuefieldAutoMix\('play-mode-single'\)/);
assert.match(audioGraphText, /audio\.loop\s*=\s*!!oldAudio\.loop\s*\|\|\s*\(typeof playMode !== 'undefined' && playMode\s*===\s*'single'\);/);
assert.match(
  cuefieldText,
  /playMode\s*===\s*'single'[\s\S]{0,180}restartSingleRepeatMedia\(outgoing,\s*token,\s*index,\s*'cuefield-ended'\)[\s\S]{0,180}return true;[\s\S]{0,180}finalizeListenSession\(true\);/
);

console.log('OK playback-single-repeat-loop');
