'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const musicProfile = require('../music-profile');

const appRoot = path.resolve(__dirname, '..');
const loader = fs.readFileSync(path.join(appRoot, 'public', 'js', 'index-loader.js'), 'utf8');
const listenStats = fs.readFileSync(
  path.join(appRoot, 'public', 'js', 'modules', '05-playback', '02-listen-stats.js'),
  'utf8',
);
const controls = fs.readFileSync(
  path.join(appRoot, 'public', 'js', 'modules', '05-playback', '14-player-controls.js'),
  'utf8',
);
const actions = fs.readFileSync(
  path.join(appRoot, 'public', 'js', 'modules', '05-playback', '06-track-detail-lyrics-actions.js'),
  'utf8',
);
const profileClientPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '02a-music-profile.js');

test('music profile client loads after listen statistics and reports local facts', () => {
  assert.match(loader, /02-listen-stats\.js',[\s\S]*02a-music-profile\.js'/);
  assert.match(loader, /10-queue-actions\.js',[\s\S]*10a-music-profile-queue\.js',[\s\S]*11-provider-fallback\.js'/);

  assert.equal(fs.existsSync(profileClientPath), true, 'expected a music profile client module');
  const profileClient = fs.readFileSync(profileClientPath, 'utf8');
  assert.match(profileClient, /musicProfileRequest\('\/api\/music-profile\/event'/);
  assert.doesNotMatch(profileClient, /cookie|authorization|playbackUrl|lyric/i);
  assert.match(profileClient, /queueItemKey\(song\)/);
  assert.match(profileClient, /duration/);
  assert.match(profileClient, /listenMs/);
  assert.match(profileClient, /completed/);
  assert.match(profileClient, /userSkip/);
  assert.match(profileClient, /song\.type\s*===\s*['"]local['"]/);
  assert.match(profileClient, /song\.type\s*===\s*['"]podcast['"]/);
  assert.doesNotMatch(profileClient, /song\.(?:name|title|artist)\s*(?:\+|\|\||\?)/);
});

test('profile reporting is non-blocking and only records explicit user actions', () => {
  assert.match(listenStats, /reportMusicProfileSession\(session, completed/);
  assert.match(controls, /if\s*\(userInitiated(?:\s*&&[^)]*)?\)[\s\S]{0,260}?finalizeListenSession\(false, true\)/);
  assert.doesNotMatch(controls, /reportMusicProfileSession[\s\S]{0,100}?currentIdx\s*=/);
  assert.match(actions, /await apiJson\([\s\S]{0,500}?reportMusicProfileFavorite\(song\)/);
  assert.match(actions, /likedSongMap\[stateKey\]\s*=\s*r[\s\S]{0,180}?reportMusicProfileFavorite\(song\)/);
});

test('favorite retries keep one event id while distinct favorite actions stay distinct', async () => {
  let now = 1_000;
  const events = [];
  const context = {
    Array,
    Date: { now: () => now },
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    isFinite,
    queueItemKey(song) {
      return `${song.provider}:${song.id}`;
    },
    apiJson(route, options) {
      if (route === '/api/music-profile/event') events.push(JSON.parse(options.body));
      return Promise.resolve({ ok: true, profile: { enabled: false, ready: false, tags: [] } });
    },
  };
  vm.runInNewContext(fs.readFileSync(profileClientPath, 'utf8'), context, { filename: profileClientPath });

  const song = { id: '42', provider: 'netease', duration: 180 };
  await context.reportMusicProfileFavorite(song, 'favorite-action-1');
  now += 5_000;
  await context.reportMusicProfileFavorite(song, 'favorite-action-1');
  await context.reportMusicProfileFavorite(song, 'favorite-action-2');

  assert.deepEqual(events.map((event) => event.id), [
    'favorite:favorite-action-1:netease:42',
    'favorite:favorite-action-1:netease:42',
    'favorite:favorite-action-2:netease:42',
  ]);
});

test('DJ manual skips become listens at the 50 percent threshold', async () => {
  const events = [];
  const context = {
    Array,
    Date: { now: () => 2_000 },
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    isFinite,
    queueItemKey(song) {
      return `${song.provider}:${song.id}`;
    },
    apiJson(route, options) {
      if (route === '/api/music-profile/event') events.push(JSON.parse(options.body));
      return Promise.resolve({ ok: true, profile: { enabled: true, ready: true, tags: [] } });
    },
  };
  vm.runInNewContext(fs.readFileSync(profileClientPath, 'utf8'), context, { filename: profileClientPath });

  await context.reportMusicProfileSession({
    sessionId: 'dj-49',
    listenMs: 49_000,
    song: { id: 'dj-49', provider: 'netease', duration: 100, profileMetadata: { isDj: true } },
  }, false, true);
  await context.reportMusicProfileSession({
    sessionId: 'dj-50',
    listenMs: 50_000,
    song: { id: 'dj-50', provider: 'netease', duration: 100, isDj: true },
  }, false, true);

  assert.deepEqual(events.map((event) => [event.id, event.kind, event.progress, event.song.profileMetadata]), [
    ['dj-49:skip', 'skip', 0.49, { isDj: true }],
    ['dj-50:listen', 'listen', 0.5, { isDj: true }],
  ]);
});

test('interactive profile actions report failures while background events stay silent', async () => {
  const toasts = [];
  const context = {
    Array,
    Date: { now: () => 3_000 },
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    isFinite,
    queueItemKey(song) {
      return `${song.provider}:${song.id}`;
    },
    apiJson() {
      return Promise.reject(new Error('offline'));
    },
    showToast(message) {
      toasts.push(message);
    },
  };
  vm.runInNewContext(fs.readFileSync(profileClientPath, 'utf8'), context, { filename: profileClientPath });

  assert.equal(await context.reportMusicProfileFavorite({ id: '42', provider: 'netease', duration: 180 }), null);
  assert.deepEqual(toasts, []);

  assert.equal(await context.setMusicProfileEnabled(true), null);
  assert.equal(await context.setMusicProfileRecommendationMode(true), null);
  assert.equal(await context.setMusicProfileTagReduced('style:rock', true), null);
  assert.equal(await context.clearMusicProfile(), null);
  assert.equal(toasts.length, 4);
  assert.ok(toasts.every((message) => /画像/.test(message)));
});

const queueProfilePath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '10a-music-profile-queue.js');
const queueActionsPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '10-queue-actions.js');
const snapshotPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '09-queue-snapshot-autoplay.js');
const dashboardPath = path.join(appRoot, 'public', 'js', 'modules', '05-playback', '03a-home-dashboard.js');
const htmlPath = path.join(appRoot, 'public', 'index.html');
const cssPath = path.join(appRoot, 'public', 'css', 'index.css');

function makeQueueSandbox(queue, currentIndex, profile) {
  const sandbox = {
    Array,
    Math,
    Number,
    Object,
    String,
    isFinite,
    playQueue: queue,
    currentIdx: currentIndex,
    musicProfileView: profile || { enabled: true, ready: true, recommendationMode: true },
    renderCalls: 0,
    shelfCalls: 0,
    snapshotCalls: 0,
    safeRenderQueuePanel() { sandbox.renderCalls += 1; },
    safeShelfRebuild() { sandbox.shelfCalls += 1; },
    saveLastPlaybackSnapshot() { sandbox.snapshotCalls += 1; },
    scoreMusicProfileQueueSong(song) { return Number(song.score) || 0; },
  };
  vm.runInNewContext(fs.readFileSync(queueProfilePath, 'utf8'), sandbox, { filename: queueProfilePath });
  return sandbox;
}

test('profile queue reorder protects five upcoming songs and locked items', () => {
  const queue = Array.from({ length: 10 }, (_, index) => ({ id: String(index), score: 10 - index }));
  queue[6].score = 1;
  queue[8].score = 5;
  queue[7].__musicProfileManualOrder = true;
  const sandbox = makeQueueSandbox(queue, 0);

  assert.equal(sandbox.applyMusicProfileQueueOrder('test'), true);
  assert.deepEqual(sandbox.playQueue.slice(0, 6).map((song) => song.id), ['0', '1', '2', '3', '4', '5']);
  assert.equal(sandbox.playQueue[7].id, '7');
  assert.ok(sandbox.renderCalls > 0);
  assert.ok(sandbox.shelfCalls > 0);
  assert.ok(sandbox.snapshotCalls > 0);
});

test('profile queue reorder needs a ready recommendation profile', () => {
  const queue = Array.from({ length: 10 }, (_, index) => ({ id: String(index), score: index }));
  const disabled = makeQueueSandbox(queue.slice(), 0, { enabled: true, ready: false, recommendationMode: true });
  const inactive = makeQueueSandbox(queue.slice(), 0, { enabled: true, ready: true, recommendationMode: false });

  assert.equal(disabled.applyMusicProfileQueueOrder('test'), false);
  assert.equal(inactive.applyMusicProfileQueueOrder('test'), false);
  assert.deepEqual(disabled.playQueue.map((song) => song.id), queue.map((song) => song.id));
  assert.deepEqual(inactive.playQueue.map((song) => song.id), queue.map((song) => song.id));
});

test('profile queue reorder starts six positions after the current song', () => {
  const queue = Array.from({ length: 12 }, (_, index) => ({ id: String(index), score: index }));
  const sandbox = makeQueueSandbox(queue, 2);

  assert.equal(sandbox.applyMusicProfileQueueOrder('test'), true);
  assert.deepEqual(sandbox.playQueue.slice(0, 8).map((song) => song.id), ['0', '1', '2', '3', '4', '5', '6', '7']);
  assert.deepEqual(sandbox.playQueue.slice(8).map((song) => song.id), ['11', '10', '9', '8']);
});

test('profile queue reorder leaves queues without an adjustable position unchanged', () => {
  const queue = Array.from({ length: 6 }, (_, index) => ({ id: String(index), score: index }));
  const sandbox = makeQueueSandbox(queue, 0);

  assert.equal(sandbox.applyMusicProfileQueueOrder('test'), false);
  assert.deepEqual(sandbox.playQueue.map((song) => song.id), queue.map((song) => song.id));
});

test('manual queue moves mark the moved song as protected profile order', () => {
  const source = fs.readFileSync(queueActionsPath, 'utf8');
  assert.match(source, /item\.__musicProfileManualOrder\s*=\s*true[\s\S]{0,120}playQueue\.splice\(toIdx,\s*0,\s*item\)/);
  assert.match(fs.readFileSync(snapshotPath, 'utf8'), /'__musicProfileManualOrder'/);
});

test('playback snapshot restore preserves profile metadata and retriggers queue ordering', () => {
  const snapshot = fs.readFileSync(snapshotPath, 'utf8');
  const profileClient = fs.readFileSync(profileClientPath, 'utf8');
  const restoreSong = sourceFunction(snapshot, 'playbackRestoreSongSnapshot');
  const sandbox = { Array, Object };
  vm.runInNewContext(restoreSong, sandbox, { filename: snapshotPath });

  assert.equal(JSON.stringify(sandbox.playbackRestoreSongSnapshot({
    provider: 'netease',
    id: 'profile-song',
    releaseDate: '2018-01-01',
    profileMetadata: { styles: ['pop'], isDj: true },
  })), JSON.stringify({
    provider: 'netease',
    id: 'profile-song',
    releaseDate: '2018-01-01',
    profileMetadata: { styles: ['pop'], isDj: true },
  }));
  assert.match(snapshot, /mineradio-playback-snapshot-restored/);
  assert.match(profileClient, /mineradio-playback-snapshot-restored/);
});

test('profile UI has synchronized accessible homepage and player controls', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dashboard = fs.readFileSync(dashboardPath, 'utf8');
  const playerControls = controls;
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(html, /id="home-music-profile"/);
  assert.match(html, /id="recommendation-mode-btn"[^>]*type="button"[^>]*aria-pressed="false"/);
  assert.match(dashboard, /function renderHomeMusicProfileCard\(profile\)/);
  assert.match(dashboard, /mineradio-music-profile-change/);
  assert.match(playerControls, /function syncMusicProfileRecommendationControls\(profile\)/);
  assert.match(playerControls, /setMusicProfileRecommendationMode/);
  assert.match(playerControls, /mineradio-music-profile-change/);
  assert.match(css, /#empty-home \.home-music-profile-/);
  assert.match(css, /#recommendation-mode-btn:focus-visible/);
});

function sourceFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  let depth = 0;
  let opened = false;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
      opened = true;
    } else if (source[index] === '}' && opened && --depth === 0) {
      return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
}

function makeProfileEventWindow() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const list = listeners.get(type) || [];
      list.push(listener);
      listeners.set(type, list);
    },
    dispatchEvent(event) {
      (listeners.get(event.type) || []).forEach((listener) => listener(event));
      return true;
    },
  };
}

function makeProfileUiSandbox() {
  const home = {
    dataset: {},
    innerHTML: '',
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    contains() { return true; },
  };
  const player = {
    dataset: {},
    attributes: {},
    classList: { toggle() {} },
    addEventListener() {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
  };
  const window = makeProfileEventWindow();
  const sandbox = {
    Array,
    Math,
    Number,
    Object,
    Promise,
    String,
    window,
    musicProfileView: null,
    escHtml(value) { return String(value); },
    document: {
      getElementById(id) { return id === 'home-music-profile' ? home : (id === 'recommendation-mode-btn' ? player : null); },
    },
  };
  const dashboard = fs.readFileSync(dashboardPath, 'utf8');
  vm.runInNewContext([
    sourceFunction(dashboard, 'homeMusicProfileTagLabel'),
    sourceFunction(dashboard, 'homeMusicProfileEvidenceCount'),
    sourceFunction(dashboard, 'homeMusicProfileRecoveryReason'),
    sourceFunction(dashboard, 'renderHomeMusicProfileCard'),
    sourceFunction(dashboard, 'bindHomeMusicProfileCard'),
  ].join('\n'), sandbox, { filename: dashboardPath });
  vm.runInNewContext([
    sourceFunction(controls, 'syncMusicProfileRecommendationControls'),
    sourceFunction(controls, 'toggleMusicProfileRecommendationMode'),
  ].join('\n'), sandbox, { filename: 'music-profile-player-controls.js' });
  window.addEventListener('mineradio-music-profile-change', (event) => {
    sandbox.musicProfileView = event.detail;
    sandbox.renderHomeMusicProfileCard(event.detail);
    sandbox.syncMusicProfileRecommendationControls(event.detail);
  });
  return { home, player, sandbox, window };
}

function readyProfileFromEngine() {
  const state = musicProfile.createMusicProfileState();
  const now = Date.now();
  musicProfile.setMusicProfileEnabled(state, true);
  musicProfile.setMusicProfileRecommendationMode(state, true);
  state.reducedTags['language:zh'] = { reducedAt: now - 10 };
  for (let index = 0; index < 5; index += 1) {
    musicProfile.applyMusicProfileEvent(state, {
      id: `profile-evidence-${index}`,
      kind: 'favorite',
      at: now - 5 + index,
      song: {
        provider: 'netease',
        id: `profile-evidence-${index}`,
        type: 'song',
        profileMetadata: {
          styles: ['pop'],
          languages: ['zh'],
          releaseDate: '2018-01-01',
        },
      },
    });
  }
  return musicProfile.getMusicProfileView(state, now);
}

test('initial profile load publishes persisted state to renderer and protected queue', async () => {
  const profile = {
    enabled: true,
    ready: true,
    recommendationMode: true,
    tags: [],
    recoveredTags: [],
  };
  const window = makeProfileEventWindow();
  const sandbox = {
    Array,
    CustomEvent: function CustomEvent(type, options) { this.type = type; this.detail = options.detail; },
    Date,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    isFinite,
    window,
    currentIdx: 0,
    playQueue: Array.from({ length: 8 }, (_, index) => ({ id: String(index), score: index })),
    queueItemKey(song) { return `${song.provider}:${song.id}`; },
    safeRenderQueuePanel() {},
    safeShelfRebuild() {},
    saveLastPlaybackSnapshot() {},
    scoreMusicProfileQueueSong(song) { return song.score; },
    apiJson() { return Promise.resolve({ ok: true, profile }); },
  };
  const originalQueue = sandbox.playQueue.slice();
  vm.runInNewContext(fs.readFileSync(queueProfilePath, 'utf8'), sandbox, { filename: queueProfilePath });
  vm.runInNewContext(fs.readFileSync(profileClientPath, 'utf8'), sandbox, { filename: profileClientPath });
  sandbox.scoreMusicProfileQueueSong = (song) => song.score;
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(sandbox.musicProfileView.recommendationMode, true);
  assert.deepEqual(sandbox.playQueue.slice(0, 6).map((song) => song.id), ['0', '1', '2', '3', '4', '5']);
  assert.deepEqual(sandbox.playQueue.slice(6).map((song) => song.id), ['7', '6']);
  assert.equal(sandbox.playQueue.length, originalQueue.length, 'profile reorder must not change queue length');
  assert.equal(new Set(sandbox.playQueue).size, originalQueue.length, 'profile reorder must not duplicate queue objects');
  originalQueue.forEach((song) => {
    assert.ok(sandbox.playQueue.includes(song), 'profile reorder must preserve the queue object multiset');
  });
});

test('homepage recommendation control and evidence render from the shared profile view', async () => {
  const { home, player, sandbox, window } = makeProfileUiSandbox();
  const readyProfile = readyProfileFromEngine();
  let requestedMode = null;
  sandbox.setMusicProfileRecommendationMode = (enabled) => {
    requestedMode = enabled;
    return Promise.resolve({ ...readyProfile, recommendationMode: enabled });
  };
  sandbox.musicProfileView = readyProfile;
  sandbox.renderHomeMusicProfileCard(readyProfile);
  sandbox.bindHomeMusicProfileCard();
  assert.match(home.innerHTML, /data-music-profile-action="recommendation-mode"/);
  assert.match(home.innerHTML, /证据 5 首/);
  assert.match(home.innerHTML, /语言.*zh[\s\S]*5 首不同歌曲的正向行为/);
  assert.equal((home.innerHTML.match(/data-music-profile-action="reduce-tag"/g) || []).length, readyProfile.tags.length);

  const modeButton = {
    getAttribute(name) { return name === 'data-music-profile-action' ? 'recommendation-mode' : ''; },
    closest() { return this; },
  };
  home.listeners.click({ target: modeButton });
  await Promise.resolve();
  assert.equal(requestedMode, false);

  const disabledProfile = { ...readyProfile, recommendationMode: false };
  window.dispatchEvent({ type: 'mineradio-music-profile-change', detail: disabledProfile });
  assert.equal(player.attributes['aria-pressed'], 'false');
  assert.match(home.innerHTML, /data-music-profile-action="recommendation-mode"/);
});

test('homepage profile copy does not overstate empty or negative tags', () => {
  const { home, sandbox } = makeProfileUiSandbox();

  sandbox.renderHomeMusicProfileCard({
    enabled: true,
    ready: true,
    recommendationMode: true,
    tags: [],
    recoveredTags: [],
  });
  assert.match(home.innerHTML, /home-music-profile-empty/);
  assert.doesNotMatch(home.innerHTML, /data-music-profile-status="queue-adjusting"/);

  sandbox.renderHomeMusicProfileCard({
    enabled: true,
    ready: true,
    recommendationMode: true,
    recoveredTags: [],
    tags: [{
      key: 'style:metal',
      dimension: 'style',
      value: 'metal',
      weight: -1,
      rawWeight: -1,
      evidenceSongs: 2,
    }],
  });
  assert.match(home.innerHTML, /home-music-profile-tag-negative/);
  assert.doesNotMatch(home.innerHTML, /data-music-profile-action="reduce-tag"/);
  assert.doesNotMatch(home.innerHTML, /data-music-profile-status="queue-adjusting"/);
});

test('first stage cannot delete, append, search, or persist into user playlists', () => {
  const profileClient = fs.readFileSync(profileClientPath, 'utf8');
  const queuePolicy = fs.readFileSync(queueProfilePath, 'utf8');
  const dashboardScript = fs.readFileSync(dashboardPath, 'utf8');
  const sources = [profileClient, queuePolicy, dashboardScript].join('\n');

  assert.doesNotMatch(sources, /removeFromQueue\s*\(/);
  assert.doesNotMatch(sources, /queueSong(?:Next)?\s*\(/);
  assert.doesNotMatch(
    sources,
    /\/api\/(?:[a-z0-9_-]+\/)*(?:search|playlist\/(?:add-song|create))(?:[/'"`?]|$)/i,
    'profile code must not call direct or provider-prefixed search/playlist-write APIs',
  );
  assert.match(queuePolicy, /currentIdx[^\n]{0,80}\+\s*6/);
});
