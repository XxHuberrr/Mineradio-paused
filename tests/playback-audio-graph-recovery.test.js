'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.join(
  __dirname,
  '..',
  'public',
  'js',
  'modules',
  '05-playback',
  '08-audio-graph-controls.js',
);

function extractFunction(sourceText, functionName) {
  const start = sourceText.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `missing ${functionName} in audio graph module`);
  const bodyStart = sourceText.indexOf('{', start);
  assert.notEqual(bodyStart, -1, `missing body for ${functionName}`);

  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    const next = sourceText[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return sourceText.slice(start, index + 1);
    }
  }
  assert.fail(`unterminated function ${functionName}`);
}

function makeNode(context, kind) {
  return {
    context,
    kind,
    connections: [],
    disconnectCount: 0,
    connect(target) { this.connections.push(target); },
    disconnect() { this.disconnectCount += 1; },
  };
}

function makeHarness(options = {}) {
  const timers = [];
  const calls = {
    audioConstruct: 0,
    captureStream: 0,
    createMediaElementSource: 0,
    createMediaStreamSource: 0,
    pause: 0,
    replace: 0,
    replaceReasons: [],
  };
  function makeAudio(overrides = {}) {
    return {
      src: '',
      currentSrc: '',
      currentTime: 0,
      duration: 0,
      readyState: 0,
      paused: true,
      ended: false,
      preload: 'auto',
      playbackRate: 1,
      onended: null,
      onloadedmetadata: null,
      pause() {
        calls.pause += 1;
        this.paused = true;
      },
      captureStream() {
        calls.captureStream += 1;
        return { id: `capture-${calls.captureStream}` };
      },
      addEventListener() {},
      ...overrides,
    };
  }
  const initialEndedHandler = function initialEndedHandler() {};
  const initialMetadataHandler = function initialMetadataHandler() {};
  const audio = makeAudio({
    src: 'https://local.invalid/audio?id=queue-alpha',
    currentSrc: 'https://local.invalid/audio?id=queue-alpha',
    currentTime: 0.5,
    duration: 180,
    readyState: options.readyState == null ? 4 : Number(options.readyState),
    paused: false,
    onended: initialEndedHandler,
    onloadedmetadata: initialMetadataHandler,
    __mineradioQueueItemKey: 'queue-alpha',
  });
  const mediaElementBindings = new WeakSet();
  const audioContext = {
    state: 'running',
    destination: makeNode(null, 'destination'),
    createMediaElementSource(media) {
      calls.createMediaElementSource += 1;
      if (mediaElementBindings.has(media)) {
        throw new Error('HTMLMediaElement was wrapped more than once');
      }
      mediaElementBindings.add(media);
      return makeNode(audioContext, 'media-element');
    },
    createMediaStreamSource(stream) {
      calls.createMediaStreamSource += 1;
      assert.ok(stream && stream.id, 'capture stream was not forwarded to AudioContext');
      if (options.failFirstCapture && calls.createMediaStreamSource === 1) {
        throw new Error('capture audio track is not ready yet');
      }
      return makeNode(audioContext, 'capture');
    },
    createAnalyser() {
      const node = makeNode(audioContext, 'analyser');
      node.getByteTimeDomainData = (target) => target.fill(128);
      node.getByteFrequencyData = (target) => target.fill(0);
      return node;
    },
    createGain() {
      const node = makeNode(audioContext, 'gain');
      node.gain = { value: 1 };
      return node;
    },
  };
  audioContext.destination.context = audioContext;

  const sourceText = fs.readFileSync(modulePath, 'utf8');
  const functionNames = [
    'audioGraphHealthy',
    'disconnectAudioGraphNodes',
    'replaceAudioElementForGraphRecovery',
    'resetPlaybackAudioGraphForSourceSwitch',
    'initAudio',
    'readPlaybackAnalyserSignal',
    'rebuildPlaybackGraphWithCapture',
    'schedulePlaybackAnalyserRecovery',
  ];
  const executableSource = [
    ...functionNames.map((name) => extractFunction(sourceText, name)),
    'var playbackAnalyserRecoverySerial = 0;',
  ].join('\n\n');

  const context = vm.createContext({
    audio,
    audioReady: false,
    audioCtx: null,
    source: null,
    audioSourceMedia: null,
    analyser: null,
    beatAnalyser: null,
    gainNode: null,
    analysisSinkNode: null,
    FFT_SIZE: 2048,
    BEAT_FFT_SIZE: 512,
    frequencyData: new Uint8Array(1024),
    beatFrequencyData: new Uint8Array(256),
    beatTimeDomainData: new Uint8Array(512),
    timeDomainData: new Uint8Array(2048),
    trackSwitchToken: 41,
    window: {
      AudioContext: function FakeAudioContext() { return audioContext; },
      webkitAudioContext: null,
    },
    Audio: function ReplacementAudio() {
      calls.audioConstruct += 1;
      if (!options.allowReplacement) {
        throw new Error('Audio element replacement is forbidden during this graph recovery test');
      }
      return makeAudio();
    },
    applyVolumeToAudio() {},
    applyAudioOutputDevice() {},
    bindPlaybackProgressEvents() {},
    resetRealtimeBeatEngine() {},
    ensurePlaybackAudioGraph() { return Promise.resolve(true); },
    console: { log() {}, warn() {}, error() {} },
    setTimeout(callback, delay) {
      const entry = { callback, delay, cancelled: false };
      timers.push(entry);
      return entry;
    },
    clearTimeout(entry) {
      if (entry) entry.cancelled = true;
    },
    isFinite,
    Uint8Array,
    Math,
    Number,
    Promise,
  });
  vm.runInContext(executableSource, context, { filename: modulePath });

  const originalReplace = context.replaceAudioElementForGraphRecovery;
  context.replaceAudioElementForGraphRecovery = function observedReplacement(reason, opts) {
    calls.replace += 1;
    calls.replaceReasons.push(reason || '');
    return originalReplace(reason, opts);
  };

  function runNextTimer(currentTime) {
    const entry = timers
      .filter((candidate) => !candidate.cancelled && !candidate.ran)
      .sort((left, right) => left.delay - right.delay)[0];
    assert.ok(entry, 'expected a queued analyser-recovery timer');
    entry.ran = true;
    audio.currentTime = currentTime;
    entry.callback();
  }

  return { context, audio, calls, runNextTimer };
}

function testCaptureTrackSwitchCreatesFreshAudioLifetime() {
  const { context, audio, calls } = makeHarness({ allowReplacement: true });
  const originalAudio = audio;
  const oldSrc = audio.src;
  const oldEndedHandler = audio.onended;
  const oldMetadataHandler = audio.onloadedmetadata;

  assert.equal(context.initAudio(), true);
  assert.equal(context.source.__mineradioUsesCapture, false);
  assert.equal(audio.__mineradioMediaSourceBound, true);
  assert.equal(calls.createMediaElementSource, 1);

  context.disconnectAudioGraphNodes(false);
  context.source = context.audioCtx.createMediaStreamSource(audio.captureStream());
  context.source.__mineradioUsesCapture = true;
  context.audioSourceMedia = audio;
  context.audioReady = true;
  assert.equal(context.source.__mineradioUsesCapture, true, 'test did not establish the legacy capture-backed state');
  assert.equal(calls.createMediaStreamSource, 1);
  assert.strictEqual(context.audio, originalAudio, 'capture recovery replaced the Audio element');
  assert.equal(audio.__mineradioMediaSourceBound, true, 'lifetime MediaElementSource marker was cleared');

  context.resetPlaybackAudioGraphForSourceSwitch('test-capture-track-switch');
  const freshAudio = context.audio;

  assert.notStrictEqual(freshAudio, originalAudio, 'capture-backed track switch reused the frozen Audio lifetime');
  assert.equal(calls.replace, 1, 'capture-backed track switch did not perform one controlled replacement');
  assert.deepEqual(calls.replaceReasons, ['test-capture-track-switch']);
  assert.equal(calls.audioConstruct, 1);
  assert.equal(calls.pause, 1, 'old capture-backed media must be paused exactly once');
  assert.equal(originalAudio.paused, true);
  assert.equal(originalAudio.src, oldSrc, 'replacement unexpectedly rewrote the old media URL');
  assert.strictEqual(originalAudio.onended, oldEndedHandler);
  assert.strictEqual(originalAudio.onloadedmetadata, oldMetadataHandler);
  assert.equal(freshAudio.__mineradioQueueItemKey, 'queue-alpha', 'fresh Audio lost queue identity');
  assert.equal(freshAudio.src, '', 'fresh Audio inherited the old track URL');
  assert.equal(freshAudio.currentSrc, '', 'fresh Audio inherited the old currentSrc');
  assert.equal(freshAudio.onended, null, 'fresh Audio inherited the old ended handler');
  assert.equal(freshAudio.onloadedmetadata, null, 'fresh Audio inherited the old metadata handler');

  freshAudio.readyState = 4;
  assert.equal(context.initAudio(), true);
  assert.equal(context.source.__mineradioUsesCapture, false, 'fresh Audio did not establish MediaElementSource');
  assert.equal(calls.createMediaElementSource, 2, 'fresh Audio did not get its own lifetime MediaElementSource');
  assert.equal(calls.createMediaStreamSource, 1, 'fresh Audio unexpectedly retained the old capture graph');
  assert.equal(calls.replace, 1, 'fresh Audio init fell into media-source-rebind replacement');
  assert.equal(calls.pause, 1, 'fresh Audio init paused media again');
  assert.strictEqual(context.audio, freshAudio);
  assert.equal(freshAudio.__mineradioMediaSourceBound, true);
  assert.equal(freshAudio.__mineradioQueueItemKey, 'queue-alpha');
}

function testFrozenClockDoesNotTriggerCaptureRebuild() {
  const { context, calls, runNextTimer } = makeHarness();
  assert.equal(context.initAudio(), true);
  context.schedulePlaybackAnalyserRecovery('test-frozen-clock');

  runNextTimer(0.66);
  runNextTimer(0.66);
  runNextTimer(0.66);

  assert.equal(calls.createMediaStreamSource, 0, 'one advance followed by a frozen media clock rebuilt capture');
  assert.equal(context.source.__mineradioUsesCapture, false);
}

function testTwoAdvancingSilentSamplesTriggerCaptureRebuild() {
  const { context, audio, calls, runNextTimer } = makeHarness();
  assert.equal(context.initAudio(), true);
  const lifetimeMediaSource = context.source;
  const pausedBeforeRecovery = audio.paused;
  context.schedulePlaybackAnalyserRecovery('test-advancing-silence');

  runNextTimer(0.66);
  assert.strictEqual(context.source, lifetimeMediaSource, 'one silent sample replaced the lifetime media source');
  runNextTimer(0.82);

  assert.strictEqual(context.source, lifetimeMediaSource, 'silent analyser recovery replaced the lifetime MediaElementSource');
  assert.equal(context.source.__mineradioUsesCapture, false, 'bound media was incorrectly moved to captureStream');
  assert.equal(calls.createMediaElementSource, 1, 'silent analyser recovery rebound MediaElementSource');
  assert.equal(calls.createMediaStreamSource, 0, 'silent analyser recovery created a capture source for bound media');
  assert.equal(calls.captureStream, 0, 'silent analyser recovery called captureStream for bound media');
  assert.equal(calls.replace, 0, 'silent analyser recovery replaced the media element');
  assert.equal(calls.pause, 0, 'silent analyser recovery paused playback');
  assert.equal(audio.currentTime, 0.82, 'silent analyser recovery rewound or froze the media clock');
  assert.equal(audio.paused, pausedBeforeRecovery, 'silent analyser recovery changed paused state');
}

function testTransientCaptureSourceFailureRetainsForcedCaptureRetry() {
  const { context, audio, calls } = makeHarness({ failFirstCapture: true });
  const originalAudio = audio;
  audio.__mineradioForceCaptureSource = true;

  assert.equal(
    context.initAudio(),
    false,
    'transient createMediaStreamSource failure must be reported without replacing media',
  );
  assert.equal(audio.__mineradioForceCaptureSource, true, 'failed capture attempt consumed the forced-capture retry');
  assert.equal(calls.createMediaElementSource, 0, 'failed fresh capture attempt unexpectedly bound MediaElementSource');
  assert.equal(calls.replace, 0);
  assert.equal(calls.pause, 0);
  assert.strictEqual(context.audio, originalAudio);

  assert.equal(context.initAudio(), true, 'second capture attempt did not recover after the track became ready');
  assert.equal(context.source.__mineradioUsesCapture, true);
  assert.equal(calls.createMediaStreamSource, 2);
  assert.equal(calls.createMediaElementSource, 0, 'fresh capture retry fell back to MediaElementSource');
  assert.equal(calls.replace, 0, 'capture retry replaced the Audio element');
  assert.equal(calls.pause, 0, 'capture retry paused the Audio element');
  assert.strictEqual(context.audio, originalAudio);
  assert.equal(!!audio.__mineradioMediaSourceBound, false);
  assert.equal(audio.__mineradioQueueItemKey, 'queue-alpha');
}

function testForcedCaptureWaitsForMediaReadyState() {
  const { context, audio, calls } = makeHarness({ readyState: 0 });
  const originalAudio = audio;
  audio.__mineradioForceCaptureSource = true;

  assert.equal(context.initAudio(), false, 'force-capture init must wait while media has no decoded data');
  assert.equal(calls.captureStream, 0, 'captureStream was called before media reached HAVE_CURRENT_DATA');
  assert.equal(calls.createMediaStreamSource, 0, 'MediaStreamSource was created before media became ready');
  assert.equal(calls.createMediaElementSource, 0, 'ready-state wait fell back to a forbidden MediaElementSource rebind');
  assert.equal(calls.replace, 0, 'ready-state wait replaced the Audio element');
  assert.equal(calls.pause, 0, 'ready-state wait paused the Audio element');
  assert.equal(audio.__mineradioForceCaptureSource, true, 'ready-state wait consumed the forced-capture marker');
  assert.strictEqual(context.audio, originalAudio);

  audio.readyState = 4;
  assert.equal(context.initAudio(), true, 'force-capture init did not recover after media became ready');
  assert.equal(calls.captureStream, 1);
  assert.equal(calls.createMediaStreamSource, 1);
  assert.equal(calls.createMediaElementSource, 0);
  assert.equal(context.source.__mineradioUsesCapture, true);
  assert.equal(calls.replace, 0);
  assert.equal(calls.pause, 0);
  assert.strictEqual(context.audio, originalAudio);
  assert.equal(!!audio.__mineradioMediaSourceBound, false);
  assert.equal(audio.__mineradioQueueItemKey, 'queue-alpha');
}

testCaptureTrackSwitchCreatesFreshAudioLifetime();
testFrozenClockDoesNotTriggerCaptureRebuild();
testTwoAdvancingSilentSamplesTriggerCaptureRebuild();
testTransientCaptureSourceFailureRetainsForcedCaptureRetry();
testForcedCaptureWaitsForMediaReadyState();
console.log('OK playback-audio-graph-recovery');
