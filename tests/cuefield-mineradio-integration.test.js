const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('loads Cuefield helpers before the Mineradio integration module', () => {
  const loader = read('public/js/index-loader.js');
  const automix = loader.indexOf('16-cuefield-automix-core.js');
  const timeline = loader.indexOf('17-cuefield-timeline-executor.js');
  const bridge = loader.indexOf('17a-cuefield-bridge-engine.js');
  const loop = loader.indexOf('17b-cuefield-source-loop.js');
  const integration = loader.indexOf('18-cuefield-automix-integration.js');
  assert.equal(automix < timeline && timeline < bridge && bridge < loop && loop < integration, true);
});

test('keeps album gapless priority and provides bounded advanced timeline fallbacks', () => {
  const source = read('public/js/modules/05-playback/18-cuefield-automix-integration.js');
  assert.match(source, /cuefieldAutoMixBlockedByAlbumGapless/);
  assert.match(source, /album-gapless-priority/);
  assert.match(source, /cuefieldApplyGraphEcho/);
  assert.match(source, /cuefieldApplyGraphDuck/);
  assert.match(source, /curve === 'equal-power-out'[\s\S]{0,100}target \+ \(start - target\) \* shaped/);
  assert.match(source, /at \+ attack \+ hold \+ release/);
  assert.match(source, /source-loop-unavailable/);
  assert.match(source, /b-deck-graph-unavailable/);
  assert.match(source, /cuefieldRecentRecipes = cuefieldRecentRecipes\.slice\(-2\)/);
});

test('passes only cache keys, lyric evidence and bounded transition hints to the local route', () => {
  const server = read('server.js');
  const route = server.slice(server.indexOf("if (pn === '/api/cuefield/transition')"), server.indexOf("if (pn === '/api/cuefield/feedback')"));
  assert.match(route, /recentRecipes/);
  assert.match(route, /minimumListenUntil/);
  assert.match(route, /enableLiveEndCrossfadeFallback/);
  assert.doesNotMatch(route, /cookie|audioUrl|accessToken/i);
});
