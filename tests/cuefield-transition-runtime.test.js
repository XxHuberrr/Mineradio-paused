const assert = require('node:assert/strict');
const test = require('node:test');

const { createCuefieldAutoMix } = require('../public/js/modules/05-playback/16-cuefield-automix-core');
const {
  buildCuefieldTimelineExecution,
  buildEqualPowerCurve,
} = require('../public/js/modules/05-playback/17-cuefield-timeline-executor');
const { buildBridgeEventPlan } = require('../public/js/modules/05-playback/17a-cuefield-bridge-engine');
const { createCuefieldSourceLoop } = require('../public/js/modules/05-playback/17b-cuefield-source-loop');
const { planCuefieldTransitionFromCache } = require('../cuefield/mineradio-bridge');

function executablePlan() {
  return {
    ok: true,
    chosen: {
      evaluation: { tier: 'usable', score: 0.82, risks: [] },
      transitionRecipe: 'safety-long-blend',
      mixStart: 72,
      handoffAt: 80,
      protectedUntil: 40,
      entry: { time: 4 },
      timeline: [
        { t: 0, deck: 'B', op: 'play', at: 4, volume: 0 },
        { t: 0, deck: 'B', op: 'volume', value: 1, duration: 8000, curve: 'equal-power-in' },
        { t: 0, deck: 'A', op: 'volume', value: 0, duration: 8000, curve: 'equal-power-out' },
        { t: 8, deck: 'B', op: 'handoff' },
      ],
    },
  };
}

test('deduplicates one in-flight pair preparation and rejects a changed queue target', async () => {
  let planCalls = 0;
  const runtime = createCuefieldAutoMix({
    allowSafetyFallback: true,
    getKey: (song) => song.key,
    ensureBeatMap: async () => true,
    planTransition: async () => { planCalls += 1; return executablePlan(); },
    prepareAudioUrl: async () => ({ proxyUrl: 'https://example.invalid/audio' }),
  });
  runtime.setEnabled(true);
  const context = {
    token: 7,
    currentIndex: 0,
    nextIndex: 1,
    currentSong: { key: 'a' },
    nextSong: { key: 'b' },
  };
  const first = runtime.prepare(context);
  const duplicate = runtime.prepare(context);
  assert.strictEqual(first, duplicate);
  const result = await first;
  assert.equal(result.status, 'ready');
  assert.equal(planCalls, 1);
  assert.equal(runtime.shouldTrigger({ token: 7, currentIndex: 0, currentTime: 80, nextKey: 'changed' }), false);
  assert.equal(runtime.shouldTrigger({ token: 7, currentIndex: 0, currentTime: 72, nextKey: 'b' }), true);
});

test('normalizes advanced Cuefield actions without collapsing filter frequency', () => {
  const execution = buildCuefieldTimelineExecution({
    targetVolume: 0.8,
    timeline: [
      { t: -4, deck: 'B', op: 'play', at: 2, volume: 0 },
      { t: -4, deck: 'B', op: 'filter', type: 'highpass', value: 650, duration: 1200 },
      { t: -3, deck: 'B', op: 'echo', bpm: 128, delayBeats: 0.5, feedback: 0.28, wet: 0.18 },
      { t: -2, deck: 'B', op: 'spectrum', low: 0.4, mid: 0.8, high: 1 },
      { t: -1, deck: 'B', op: 'rate', value: 1.03 },
      { t: 0, deck: 'B', op: 'handoff' },
    ],
  });
  assert.equal(execution.actions.find((action) => action.op === 'filter').value, 650);
  assert.equal(execution.requiresBGraph, true);
  assert.equal(execution.actions.find((action) => action.op === 'rate').value, 1.03);
  const incoming = buildEqualPowerCurve('in', 9);
  const outgoing = buildEqualPowerCurve('out', 9);
  assert.equal(Math.abs(incoming[4] ** 2 + outgoing[4] ** 2 - 1) < 0.02, true);
});

test('keeps bridge synthesis and source-loop runtime bounded', () => {
  const bridge = buildBridgeEventPlan({ template: 'drum-build', bars: 16, bpmFrom: 96, bpmTo: 132 });
  assert.equal(bridge.events.length <= 512, true);
  assert.equal(bridge.duration <= 64, true);
  let now = 0;
  let interval = null;
  const media = { currentTime: 8, duration: 120, paused: false };
  const loop = createCuefieldSourceLoop({ now: () => now, setInterval: (fn) => { interval = fn; return 1; }, clearInterval: () => {} });
  assert.equal(loop.apply({ startAt: 8, loopSeconds: 1, slip: true }, media, 'pair'), true);
  media.currentTime = 9.1;
  interval();
  assert.equal(media.currentTime, 8);
  now = 1200;
  loop.stop('handoff', true);
  assert.equal(media.currentTime, 9.2);
});

function compressedMap(duration) {
  const gridStep = 0.5;
  const cameraBeats = [];
  for (let index = 0, time = 0; time < duration; index += 1, time += gridStep) {
    const downbeat = index % 16 === 0;
    cameraBeats.push([time, downbeat ? 0.78 : 0.42, 0.9, downbeat ? 0.7 : 0.35, 0.4, 0.38, 0.3, downbeat ? 1 : 0, downbeat ? 7 : 0, 0.4, 0.3, gridStep]);
  }
  return {
    duration,
    gridStep,
    cameraBeats,
    edgeEvidence: { audibleStart: 0.2, audibleEnd: duration - 0.4, containerEnd: duration, confidence: 0.86 },
  };
}

test('plans a cache-only transition with an executable handoff timeline', () => {
  const cache = {
    a: { key: 'a', meta: { title: 'A' }, map: compressedMap(128) },
    b: { key: 'b', meta: { title: 'B' }, map: compressedMap(112) },
  };
  const result = planCuefieldTransitionFromCache({
    fromKey: 'a',
    toKey: 'b',
    fromLrc: '[00:16.00]one\n[00:32.00]two\n[01:04.00]one',
    toLrc: '[00:08.00]three\n[00:24.00]four\n[00:56.00]three',
    enableLiveEndCrossfadeFallback: true,
    readBeatMapCache: (key) => cache[key],
  });
  assert.equal(!!result.chosen, true);
  assert.equal(Array.isArray(result.chosen.timeline), true);
  assert.equal(result.chosen.timeline.some((action) => action.op === 'handoff'), true);
});

