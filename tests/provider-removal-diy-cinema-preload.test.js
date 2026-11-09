const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

test('removed provider has no user-facing or callable login surface', () => {
  const index = read('public', 'index.html');
  const search = read('public', 'js', 'modules', '05-playback', '07-search.js');
  const accounts = read('public', 'js', 'modules', '08-account', '01-login-modal-utils.js');
  const startup = read('public', 'js', 'modules', '10-shell', '05-startup-bindings.js');
  const main = read('desktop', 'main.js');
  const preload = read('desktop', 'preload.js');
  const server = read('server.js');

  assert.doesNotMatch(index, /search-mode-spotify|login-provider-spotify|user-provider-spotify|account-add-spotify|spotify-setup-wizard/);
  assert.doesNotMatch(search, /MUSIC_SEARCH_PROVIDER_ORDER\s*=\s*\[[^\]]*spotify/);
  assert.doesNotMatch(accounts, /ACCOUNT_PROVIDER_KEYS\s*=\s*\[[^\]]*spotify/);
  assert.doesNotMatch(startup, /refreshSpotifyLoginStatus\(\)|startSpotifyLoginStatusAutoRefresh\(\)/);
  assert.doesNotMatch(main + preload, /spotify-music-(?:open-login|verify-setup|clear-login)/);
  assert.match(server, /PROVIDER_REMOVED/);
  assert.match(server, /pn\.indexOf\('\/api\/spotify\/'\) === 0/);
});

test('fullscreen DIY control follows the bottom-most visible account pill', () => {
  const source = read('public', 'js', 'modules', '00-state', '02-preferences-ui-modes.js');
  assert.match(source, /querySelectorAll\('\.top-account-pill'\)/);
  assert.match(source, /bounds\.bottom = Math\.max\(bounds\.bottom, rect\.bottom\)/);
  assert.match(source, /top = rect\.bottom \+ gap/);
  assert.match(source, /new ResizeObserver\(scheduleFullscreenDiyLayout\)/);
  assert.match(source, /new MutationObserver\(scheduleFullscreenDiyLayout\)/);
});

test('full-track cinematic analysis waits for playback and retries bounded failures', () => {
  const source = read('public', 'js', 'modules', '03-beat', '00-tempo-worker-cache-prefetch.js');
  assert.match(source, /function queueCurrentTrackAnalysis\(delay\)/);
  assert.match(source, /if \(!audio \|\| audio\.paused\) \{\s*queueCurrentTrackAnalysis\(620\)/);
  assert.match(source, /analysisAttempts\+\+/);
  assert.match(source, /analysisAttempts < 3/);
  assert.match(source, /smoothBeatMapHandoff\(songId, map, token, song \|\| null\)/);
  assert.match(source, /skipMusicTempo: beatAnalysisConfig\.skipMusicTempoWhilePlaying && !audio\.paused/);
});
