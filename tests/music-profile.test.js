'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const profile = require('../music-profile');

function song(id, metadata = {}) {
  return {
    provider: 'netease',
    id,
    type: 'song',
    durationMs: 200000,
    profileMetadata: {
      styles: ['pop', 'electronic'],
      languages: ['zh'],
      releaseDate: '2018-01-01',
      ...metadata,
    },
  };
}

function enabledState() {
  const state = profile.createMusicProfileState();
  profile.setMusicProfileEnabled(state, true);
  return state;
}

function tagWeight(state, key, now = Date.now()) {
  return profile.getMusicProfileView(state, now).tags.find((tag) => tag.key === key)?.weight || 0;
}

test('profile is disabled and empty by default', () => {
  const state = profile.createMusicProfileState();
  const view = profile.getMusicProfileView(state, Date.now());

  assert.deepEqual(view.tags, []);
  assert.equal(view.enabled, false);
  assert.equal(view.recommendationMode, false);
  assert.equal(view.ready, false);
  assert.equal(view.remainingSongs, 5);
});

test('disabled profile ignores events and enabled profile splits multi-value evidence', () => {
  const state = profile.createMusicProfileState();
  profile.applyMusicProfileEvent(state, { id: 'ignored', kind: 'favorite', song: song('1'), at: 1 });
  assert.equal(state.events.length, 0);

  profile.setMusicProfileEnabled(state, true);
  profile.applyMusicProfileEvent(state, { id: 'fav-1', kind: 'favorite', song: song('1'), at: 1 });
  const tags = profile.getMusicProfileView(state, Date.now()).tags;

  assert.equal(tags.find((tag) => tag.key === 'style:pop').weight, 20);
  assert.equal(tags.find((tag) => tag.key === 'style:electronic').weight, 20);
  assert.equal(tags.find((tag) => tag.key === 'language:zh').weight, 40);
  assert.equal(tags.find((tag) => tag.key === 'era:2010s').weight, 40);
});

test('profile tags expose distinct contributing song evidence counts', () => {
  const state = enabledState();
  profile.applyMusicProfileEvent(state, {
    id: 'favorite-first',
    kind: 'favorite',
    song: song('first', { styles: ['pop'], languages: ['zh'] }),
    at: 1,
  });
  profile.applyMusicProfileEvent(state, {
    id: 'listen-first',
    kind: 'listen',
    progress: 0.8,
    song: song('first', { styles: ['pop'], languages: ['zh'] }),
    at: 2,
  });
  profile.applyMusicProfileEvent(state, {
    id: 'favorite-second',
    kind: 'favorite',
    song: song('second', { styles: ['pop'], languages: ['en'] }),
    at: 3,
  });

  const tags = profile.getMusicProfileView(state, Date.now()).tags;
  assert.equal(tags.find((tag) => tag.key === 'style:pop').evidenceSongs, 2);
  assert.equal(tags.find((tag) => tag.key === 'language:zh').evidenceSongs, 1);
  assert.equal(tags.find((tag) => tag.key === 'language:en').evidenceSongs, 1);
});

test('duplicate event ids are idempotent', () => {
  const state = enabledState();
  const event = { id: 'once', kind: 'favorite', song: song('1'), at: 1 };

  assert.equal(profile.applyMusicProfileEvent(state, event), true);
  assert.equal(profile.applyMusicProfileEvent(state, event), false);
  assert.equal(state.events.length, 1);
  assert.equal(tagWeight(state, 'language:zh'), 40);
});

test('metadata without trusted fields adds no tags', () => {
  const state = enabledState();
  profile.applyMusicProfileEvent(state, {
    id: 'untrusted',
    kind: 'favorite',
    at: 1,
    song: {
      provider: 'netease',
      id: 'unsafe',
      type: 'song',
      name: 'Pop Song',
      artist: 'Chinese Artist',
      lyric: 'electronic',
      cover: 'https://example.test/pop.jpg',
    },
  });

  assert.equal(state.events.length, 1);
  assert.deepEqual(profile.getMusicProfileView(state, Date.now()).tags, []);
});

test('normal listening requires at least 80 percent progress', () => {
  const state = enabledState();
  profile.applyMusicProfileEvent(state, { id: 'listen-79', kind: 'listen', song: song('79'), progress: 0.79, at: 1 });
  profile.applyMusicProfileEvent(state, { id: 'listen-80', kind: 'listen', song: song('80'), progress: 0.8, at: 2 });

  assert.equal(tagWeight(state, 'language:zh'), 10);
});

test('DJ listening requires at least 50 percent progress', () => {
  const state = enabledState();
  profile.applyMusicProfileEvent(state, { id: 'dj-49', kind: 'listen', song: song('49', { isDj: true }), progress: 0.49, at: 1 });
  profile.applyMusicProfileEvent(state, { id: 'dj-50', kind: 'listen', song: song('50', { isDj: true }), progress: 0.5, at: 2 });

  assert.equal(tagWeight(state, 'language:zh'), 10);
});

test('podcast and local songs never create profile events', () => {
  const state = enabledState();
  profile.applyMusicProfileEvent(state, { id: 'podcast', kind: 'favorite', song: { ...song('podcast'), type: 'podcast' }, at: 1 });
  profile.applyMusicProfileEvent(state, { id: 'local', kind: 'favorite', song: { ...song('local'), type: 'local' }, at: 2 });

  assert.equal(state.events.length, 0);
});

test('only an early manual skip contributes negative evidence', () => {
  const state = enabledState();
  profile.applyMusicProfileEvent(state, { id: 'early', kind: 'skip', manual: true, song: song('early'), progress: 0.15, at: 1 });
  profile.applyMusicProfileEvent(state, { id: 'late', kind: 'skip', manual: true, song: song('late'), progress: 0.16, at: 2 });
  profile.applyMusicProfileEvent(state, { id: 'automatic', kind: 'skip', manual: false, song: song('automatic'), progress: 0.1, at: 3 });

  assert.equal(tagWeight(state, 'language:zh'), -50);
});

test('five distinct songs are required before a profile is ready', () => {
  const state = enabledState();
  for (let index = 0; index < 4; index += 1) {
    profile.applyMusicProfileEvent(state, { id: `song-${index}`, kind: 'favorite', song: song(String(index)), at: index + 1 });
  }

  const view = profile.getMusicProfileView(state, Date.now());
  assert.equal(view.ready, false);
  assert.equal(view.remainingSongs, 1);
});

test('reduced tags recover only after five recent distinct positive songs', () => {
  const now = Date.now() + 10000;
  const state = enabledState();
  profile.applyMusicProfileEvent(state, { id: 'baseline', kind: 'favorite', song: song('baseline'), at: now - 20000 });
  const normalWeight = tagWeight(state, 'language:zh', now);
  profile.setMusicProfileTagReduced(state, 'language:zh', true);
  const reducedWeight = tagWeight(state, 'language:zh', now);

  for (let index = 0; index < 4; index += 1) {
    profile.applyMusicProfileEvent(state, {
      id: `positive-${index}`,
      kind: 'favorite',
      song: song(`positive-${index}`),
      at: now - (4 - index) * 1000,
    });
  }
  const beforeRecovery = profile.getMusicProfileView(state, now);
  profile.applyMusicProfileEvent(state, {
    id: 'positive-4',
    kind: 'favorite',
    song: song('positive-4'),
    at: now,
  });
  const afterRecovery = profile.getMusicProfileView(state, now);
  const afterWindow = profile.getMusicProfileView(state, now + 31 * 24 * 60 * 60 * 1000);

  assert.ok(reducedWeight < normalWeight);
  assert.ok(beforeRecovery.tags.find((tag) => tag.key === 'language:zh').weight < afterRecovery.tags.find((tag) => tag.key === 'language:zh').weight);
  assert.equal(afterRecovery.tags.find((tag) => tag.key === 'language:zh').weight, normalWeight + 200);
  assert.equal(afterRecovery.tags.find((tag) => tag.key === 'language:zh').reduced, false);
  assert.ok(afterRecovery.recoveredTags.some((tag) => tag.key === 'language:zh'));
  assert.equal(state.reducedTags['language:zh'].recoveredAt, now);
  assert.equal(afterWindow.tags.find((tag) => tag.key === 'language:zh').reduced, false);
});

test('reducing a negative tag makes its ranking score lower', () => {
  const state = enabledState();
  profile.applyMusicProfileEvent(state, {
    id: 'early-skip',
    kind: 'skip',
    manual: true,
    song: song('early-skip'),
    progress: 0.1,
    at: 1,
  });
  const normalWeight = tagWeight(state, 'language:zh');

  profile.setMusicProfileTagReduced(state, 'language:zh', true);
  const reducedWeight = tagWeight(state, 'language:zh');

  assert.ok(reducedWeight < normalWeight);
});

test('recovery evidence ignores expired and future positive events', () => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const state = enabledState();
  state.reducedTags['language:zh'] = { reducedAt: now - 40 * day };

  for (let index = 0; index < 5; index += 1) {
    profile.applyMusicProfileEvent(state, {
      id: `expired-${index}`,
      kind: 'favorite',
      song: song(`expired-${index}`),
      at: now - 31 * day + index,
    });
    profile.applyMusicProfileEvent(state, {
      id: `future-${index}`,
      kind: 'favorite',
      song: song(`future-${index}`),
      at: now + day + index,
    });
  }

  const view = profile.getMusicProfileView(state, now);
  assert.equal(view.recoveredTags.some((tag) => tag.key === 'language:zh'), false);
});

test('clearing a profile disables it, recommendation mode, events, and preferences', () => {
  const state = enabledState();
  profile.setMusicProfileRecommendationMode(state, true);
  profile.setMusicProfileTagReduced(state, 'language:zh', true);
  profile.applyMusicProfileEvent(state, { id: 'favorite', kind: 'favorite', song: song('1'), at: 1 });

  const cleared = profile.clearMusicProfile(state);
  assert.equal(cleared.enabled, false);
  assert.equal(cleared.recommendationMode, false);
  assert.deepEqual(cleared.events, []);
  assert.deepEqual(cleared.reducedTags, {});
});

test('malformed files reset safely and persistence keeps only approved event fields', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-music-profile-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'music-profile.json');
  fs.writeFileSync(filePath, '{not valid JSON', 'utf8');
  assert.deepEqual(profile.loadMusicProfile(filePath), profile.createMusicProfileState());

  const state = enabledState();
  profile.setMusicProfileRecommendationMode(state, true);
  profile.applyMusicProfileEvent(state, { id: 'stored', kind: 'favorite', song: song('stored'), at: 1 });
  state.events[0].song = { playbackUrl: 'secret', lyric: 'private' };
  state.events[0].unexpected = 'discard me';
  profile.saveMusicProfile(filePath, state);

  const restored = profile.loadMusicProfile(filePath);
  assert.deepEqual(Object.keys(restored.events[0]).sort(), ['at', 'dimensions', 'id', 'kind', 'progress', 'songKey']);
  assert.equal(Object.hasOwn(restored.events[0], 'song'), false);
  assert.equal(Object.hasOwn(restored.events[0], 'unexpected'), false);
});
