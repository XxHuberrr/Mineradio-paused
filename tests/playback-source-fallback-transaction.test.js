const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appRoot = path.resolve(__dirname, '..');
const fallbackPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '11-provider-fallback.js');
const startPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '13-playback-start-audio.js');
const controlsPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '14-player-controls.js');
const progressPath = path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '04-progress-seek.js');
const fallbackText = fs.readFileSync(fallbackPath, 'utf8');
const startText = fs.readFileSync(startPath, 'utf8');
const controlsText = fs.readFileSync(controlsPath, 'utf8');
const progressText = fs.readFileSync(progressPath, 'utf8');

function createMedia() {
  return {
    src: 'https://old.invalid/audio',
    paused: false,
    ended: false,
    onended: function () {},
    __mineradioQueueItemKey: 'old',
    pause() { this.paused = true; },
    removeAttribute(name) { if (name === 'src') this.src = ''; },
    load() {},
  };
}

function createSandbox(queue, statusOverrides) {
  const notices = [];
  const statuses = Object.assign({
    netease: { loggedIn: true },
    qq: { loggedIn: false, playbackKeyReady: false },
    kugou: { loggedIn: false, playbackKeyReady: false },
  }, statusOverrides || {});
  const sandbox = {
    console,
    Promise,
    Date,
    Object,
    Array,
    Math,
    Number,
    String,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(fn) { fn(); },
    normalizePlaybackProvider(provider) {
      return ['qq', 'kugou', 'qishui', 'spotify'].includes(provider) ? provider : 'netease';
    },
    songProviderKey(song) { return song && song.provider || 'netease'; },
    platformStatus(provider) { return statuses[provider] || { loggedIn: false }; },
    accountProviderOrder() { return ['netease', 'qq', 'kugou']; },
    providerVipLevel() { return 'none'; },
    queueItemKey(song) { return (song && song.provider || '') + ':' + (song && (song.id || song.mid) || ''); },
    hydrateCustomCover(song) { return song; },
    sourceCandidateRejectReason() { return ''; },
    cloneSong(song) { return Object.assign({}, song); },
    normalizePlaybackQuality(value) { return value || 'hires'; },
    normalizePlaybackQualityForProvider(value) { return value || 'hires'; },
    getProviderPlaybackQuality() { return 'hires'; },
    playbackQualityLabel(value) { return value; },
    markPlaybackQualityRuntimeCap() {},
    pendingPlaybackResumeAt: 0,
    playQueue: queue,
    currentIdx: 0,
    trackSwitchToken: 1,
    audio: createMedia(),
    audioFadeSerial: 0,
    playToggleBusy: true,
    playing: true,
    miniQueueOpen: false,
    playbackResumeRecovery: { serial: 3, pending: false, timerIds: [] },
    hideLoading() {},
    forcePlaybackControlsInteractive() {},
    clearAudioFadeTimers() {},
    clearAlbumGaplessPreload() { sandbox.albumGaplessClears = (sandbox.albumGaplessClears || 0) + 1; },
    resetCuefieldAutoMix() { sandbox.cuefieldClears = (sandbox.cuefieldClears || 0) + 1; },
    clearPlaybackResumeWatchdogs() { sandbox.watchdogClears = (sandbox.watchdogClears || 0) + 1; },
    setPlayIcon(value) { sandbox.iconPlaying = value; },
    syncPlaybackStateFromAudioEvent() {},
    safeRenderQueuePanel() {},
    safeShelfRebuild() {},
    updateControlTrackInfo() {},
    showToast() {},
    showSourceFallbackNotice(title, body) { notices.push({ title, body }); },
    document: { getElementById() { return null; }, body: { appendChild() {} } },
    apiJson: async function () { return { songs: [] }; },
    resolveAlbumGaplessPlaybackData: async function () { return null; },
    playQueueAt: async function () { return false; },
    notices,
  };
  vm.runInNewContext(fallbackText, sandbox, { filename: fallbackPath });
  sandbox.showSourceFallbackNotice = function (title, body) { notices.push({ title, body }); };
  return sandbox;
}

async function testFiniteQueueRecovery() {
  const queue = Array.from({ length: 20 }, (_, index) => ({
    provider: 'netease',
    id: 'song-' + index,
    name: 'Song ' + index,
    artist: 'Artist ' + index,
  }));
  const sandbox = createSandbox(queue);
  let childCalls = 0;
  let recovery = null;
  sandbox.playQueueAt = async function (idx, opts) {
    childCalls++;
    recovery = recovery || opts.sourceFallbackRecovery;
    sandbox.currentIdx = idx;
    sandbox.trackSwitchToken++;
    return sandbox.tryAutoPlaybackFallback(
      sandbox.playQueue[idx],
      { category: 'url_unavailable' },
      idx,
      sandbox.trackSwitchToken,
      opts
    );
  };
  const result = await sandbox.tryAutoPlaybackFallback(queue[0], { category: 'url_unavailable' }, 0, 1, {});
  assert.strictEqual(result, false);
  assert.strictEqual(childCalls, 2, 'recovery may advance at most two queue entries');
  assert(recovery && recovery.terminal, 'the finite recovery transaction must settle');
  assert.strictEqual(recovery.queueAdvances, 2);
  assert.strictEqual(sandbox.activeSourceFallbackRecovery, null);
  assert.strictEqual(sandbox.audio.src, '');
  assert.strictEqual(sandbox.audio.onended, null);
  assert.strictEqual(sandbox.playbackResumeRecovery.serial, 4, 'terminal state invalidates late media watchdogs');
  assert.strictEqual(sandbox.notices.filter(item => item.title === '当前没有可用音源').length, 1);
}

async function testDuplicateSongProviderDeduplication() {
  const source = { provider: 'netease', id: 'source-a', name: 'Same Song', artist: 'Same Artist' };
  const duplicate = { provider: 'netease', id: 'source-b', name: 'Same Song', artist: 'Same Artist' };
  const sandbox = createSandbox([source, duplicate], {
    qq: { loggedIn: true, playbackKeyReady: true },
  });
  let searchCalls = 0;
  let childCalls = 0;
  sandbox.apiJson = async function () {
    searchCalls++;
    return {
      songs: [{ provider: 'qq', id: 'qq-a', mid: 'qq-a', name: source.name, artist: source.artist }],
    };
  };
  sandbox.resolveAlbumGaplessPlaybackData = async function () {
    return { url: 'https://candidate.invalid/audio' };
  };
  sandbox.playQueueAt = async function () {
    childCalls++;
    sandbox.trackSwitchToken++;
    return false;
  };
  const result = await sandbox.tryAutoPlaybackFallback(source, { category: 'url_unavailable' }, 0, 1, {});
  assert.strictEqual(result, false);
  assert.strictEqual(searchCalls, 1, 'the same song/provider pair must be searched once');
  assert.strictEqual(childCalls, 1);
  assert.strictEqual(sandbox.playQueue[0].provider, 'netease', 'failed provisional source must roll back');
  assert.strictEqual(sandbox.playQueue[1], duplicate, 'duplicate queue item must not be scanned again');
}

async function testLateAsyncCannotReviveTerminal() {
  const source = { provider: 'netease', id: 'late-a', name: 'Late Song', artist: 'Late Artist' };
  const sandbox = createSandbox([source], {
    qq: { loggedIn: true, playbackKeyReady: true },
  });
  let resolveSearch;
  let childCalls = 0;
  sandbox.apiJson = function () {
    return new Promise(resolve => { resolveSearch = resolve; });
  };
  sandbox.playQueueAt = async function () {
    childCalls++;
    return true;
  };
  const pending = sandbox.tryAutoPlaybackFallback(source, { category: 'url_unavailable' }, 0, 1, {});
  await Promise.resolve();
  const recovery = sandbox.activeSourceFallbackRecovery;
  assert(recovery, 'recovery must exist while provider search is pending');
  const settled = sandbox.settleSourceFallbackTerminal(0, 1, 'stop', { sourceFallbackRecovery: recovery });
  assert.strictEqual(settled, false);
  const secondSettle = sandbox.settleSourceFallbackTerminal(0, 1, 'duplicate', { sourceFallbackRecovery: recovery });
  assert.strictEqual(secondSettle, false);
  resolveSearch({
    songs: [{ provider: 'qq', id: 'late-qq', mid: 'late-qq', name: source.name, artist: source.artist }],
  });
  const result = await pending;
  assert.strictEqual(result, false);
  assert.strictEqual(childCalls, 0, 'late search completion must not start playback');
  assert.strictEqual(sandbox.playQueue[0], source);
  assert.strictEqual(sandbox.notices.filter(item => item.title === '当前没有可用音源').length, 1);
}

async function testDeadlineAndManualSupersession() {
  const source = { provider: 'netease', id: 'deadline-a', name: 'Deadline Song', artist: 'Deadline Artist' };
  const sandbox = createSandbox([source], {
    qq: { loggedIn: true, playbackKeyReady: true },
  });
  let resolveSearch;
  let childCalls = 0;
  sandbox.apiJson = function () {
    return new Promise(resolve => { resolveSearch = resolve; });
  };
  sandbox.playQueueAt = async function () {
    childCalls++;
    return true;
  };
  const pending = sandbox.tryAutoPlaybackFallback(source, { category: 'url_unavailable' }, 0, 1, {});
  await Promise.resolve();
  const recovery = sandbox.activeSourceFallbackRecovery;
  recovery.deadlineAt = Date.now() - 1;
  resolveSearch({ songs: [] });
  assert.strictEqual(await pending, false);
  assert.strictEqual(childCalls, 0);
  assert.strictEqual(recovery.terminal, true, 'expired recovery must settle once');

  sandbox.audio = createMedia();
  sandbox.currentIdx = 0;
  sandbox.trackSwitchToken = 2;
  const superseded = sandbox.ensureSourceFallbackRecovery({}, source, 0, 2);
  assert.strictEqual(sandbox.beginSourceFallbackPlaybackInvocation({ manual: true }), true);
  assert.strictEqual(superseded.cancelled, true, 'manual root playback must cancel the old transaction');
  assert.strictEqual(
    sandbox.settleSourceFallbackTerminal(0, 2, 'stale', { sourceFallbackRecovery: superseded }),
    false
  );
  assert.notStrictEqual(sandbox.audio.src, '', 'a cancelled late transaction must not clear the new root media');
}

function testStaticRecoveryWiring() {
  assert(/beginSourceFallbackPlaybackInvocation\(opts\)/.test(startText));
  assert(/completeSourceFallbackRecovery\(sourceFallbackRecoveryFromOptions\(opts\)\)/.test(startText));
  assert(/catchRecovery \? sourceFallbackRecoveryFailureOptions\(opts\)/.test(startText));
  assert(/setupRecovery \? sourceFallbackRecoveryFailureOptions\(opts\)/.test(startText));
  assert(/freshUrlAttemptCount\) \|\| 0\) >= 1/.test(controlsText));
  assert(/sourceFallbackRecovery:\s*recovery/.test(controlsText));
  assert(/if \(recovered === true\) return true/.test(controlsText));
  assert(/clearPlaybackResumeWatchdogs\(\)/.test(fallbackText));
  assert(/playbackResumeRecovery\.serial =/.test(fallbackText));
  assert(/audio\.__mineradioTrackSwitchToken = token/.test(startText));
  assert(/audioEl !== audio/.test(progressText));
  assert(/__mineradioTrackSwitchToken\) !== Number\(trackSwitchToken\)/.test(progressText));
  assert(/playbackMediaMatchesCurrentQueueItem\(audioEl\)/.test(progressText));
  assert(/ownerQueueItemKey:\s*String\(audioEl\.__mineradioQueueItemKey/.test(progressText));
  assert(/function playbackStallRecoveryOwnerStillCurrent/.test(controlsText));
  assert((controlsText.match(/playbackStallRecoveryOwnerStillCurrent\(/g) || []).length >= 4);
  assert(/recoverySerial !== playbackResumeRecovery\.serial/.test(controlsText));
  assert(/clearPlaybackResumeWatchdogs\(\);\s*playbackResumeRecovery\.serial =/.test(controlsText));
  assert(/\['play', 'playing', 'pause'[\s\S]{0,500}audioEl !== audio/.test(progressText));
  assert(/\['error', 'stalled'\][\s\S]{0,700}schedulePlaybackStallRecovery/.test(progressText));
  assert((startText.match(/else setTimeout\(nextTrack, 0\)/g) || []).length >= 2, 'normal ended playback must still advance');
  const nextTrackBlock = controlsText.slice(
    controlsText.indexOf('function nextTrack'),
    controlsText.indexOf('function prevTrack')
  );
  assert(/playQueueAt\(currentIdx, opts\)/.test(nextTrackBlock));
  assert(!/sourceFallbackRecovery/.test(nextTrackBlock), 'natural ended next starts a fresh playback root');
}

async function run() {
  await testFiniteQueueRecovery();
  await testDuplicateSongProviderDeduplication();
  await testLateAsyncCannotReviveTerminal();
  await testDeadlineAndManualSupersession();
  testStaticRecoveryWiring();
  console.log('OK playback-source-fallback-transaction');
}

run().catch(error => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
