'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(process.env.BEAT_ANALYSIS_TEST_SOURCE || path.join(__dirname,
  '../public/js/modules/03-beat/01-audio-beat-analysis.js'), 'utf8');

async function runAnalysis(options = {}) {
  const events = [];
  const sources = [];
  const warnings = [];
  let bandCount = 0;
  let pendingBands = 0;
  let peakPendingBands = 0;
  let context;
  const sampleRate = 1000;
  const length = 12000;
  const buffer = { sampleRate, length, duration: length / sampleRate };
  class DecodeContext {
    decodeAudioData(_bytes, resolve) { resolve(buffer); }
    close() { return Promise.resolve(); }
  }
  class OfflineContext {
    constructor(channels, frames, rate) {
      assert.equal(channels, 1);
      assert.equal(frames, length);
      assert.equal(rate, sampleRate);
      this.destination = {};
    }
    createBufferSource() {
      const sourceNode = {
        connect() {}, start() {},
        disconnect() { this.disconnected = true; }
      };
      sources.push(sourceNode);
      return sourceNode;
    }
    createBiquadFilter() {
      return { frequency: {}, Q: {}, connect() {}, disconnect() {} };
    }
    async startRendering() {
      const band = ++bandCount;
      events.push('render:' + band);
      if (options.rejectBand === band) throw new Error('test render failure');
      pendingBands++;
      peakPendingBands = Math.max(peakPendingBands, pendingBands);
      if (options.cancelAfterRender === band) context.beatMapToken++;
      return {
        getChannelData() {
          let consumed = false;
          return new Proxy({ length }, {
            get(target, key) {
              if (key === 'length') return target.length;
              if (typeof key !== 'string' || !/^\d+$/.test(key)) return undefined;
              if (!consumed) {
                consumed = true;
                pendingBands--;
                events.push('reduce:' + band);
              }
              const index = Number(key);
              if (options.cancelDuringReduction === band && index === 100) context.beatMapToken++;
              // Repeating pulses exercise onset detection, not just silence.
              return index % 500 < 40 ? 0.5 / band : 0.001;
            }
          });
        }
      };
    }
  }
  context = vm.createContext({
    window: { AudioContext: DecodeContext, OfflineAudioContext: OfflineContext },
    fetch: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }),
    beatMapToken: 1, beatMapBusy: false,
    cinemaAnalysisProfileForSong: () => ({ id: 'default' }),
    showBeatChip() {}, hideBeatChip() {},
    beatAnalysisYieldMs: () => 0,
    yieldToIdle: async () => {
      if (options.cancelBetweenBands && events.includes('reduce:1')) context.beatMapToken++;
    },
    yieldToPaint: async () => {},
    console: { warn: (...args) => warnings.push(args.map(String).join(' ')) },
    Date: { now: () => 1234 }
  });
  vm.runInContext(source, context);
  const result = await context.analyzeAudioBeats('test.wav', null, 1, { skipMusicTempo: true });
  assert.equal(context.beatMapBusy, false, 'analysis must always release its busy flag');
  return { result: result && JSON.parse(JSON.stringify(result)), events, sources, warnings, peakPendingBands };
}

async function main() {
  const normal = await runAnalysis();
  assert.deepEqual(normal.warnings, []);
  assert.ok(normal.result && normal.result.beats.length > 0, 'pulses should produce beats');
  assert.equal(normal.peakPendingBands, 1, 'reduce each full-song PCM band before allocating the next');
  assert.deepEqual(normal.events, [1, 2, 3, 4].flatMap(i => ['render:' + i, 'reduce:' + i]));
  assert.ok(normal.sources.every(node => node.disconnected && node.buffer === null));
  const repeat = await runAnalysis();
  assert.deepEqual(repeat.result, normal.result, 'repeated analysis must preserve deterministic beat output');

  for (const options of [{ cancelAfterRender: 1 }, { cancelDuringReduction: 1 }, { cancelBetweenBands: true }, { rejectBand: 1 }]) {
    const cancelled = await runAnalysis(options);
    assert.equal(cancelled.result, null);
    assert.equal(cancelled.sources.length, 1, 'cancelled/failed analysis must not allocate more bands');
    assert.ok(cancelled.sources.every(node => node.disconnected && node.buffer === null), 'release source even on cancellation/failure');
    assert.equal(cancelled.warnings.length, options.rejectBand ? 1 : 0);
  }
  console.log('[OK] Beat analysis reduces PCM one band at a time and releases cancelled/failed renders.');
}

module.exports = { runAnalysis };
if (require.main === module) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
