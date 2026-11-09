'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const musicProfile = require('../music-profile');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const profileClient = fs.readFileSync(
  path.join(root, 'public', 'js', 'modules', '05-playback', '02a-music-profile.js'),
  'utf8',
);
const queueModule = fs.readFileSync(
  path.join(root, 'public', 'js', 'modules', '05-playback', '10a-music-profile-queue.js'),
  'utf8',
);

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

function mapNeteaseSong(raw) {
  const context = { Date, Number };
  vm.runInNewContext([
    sourceFunction(server, 'mapArtists'),
    sourceFunction(server, 'mapSongRecord'),
  ].join('\n'), context, { filename: 'netease-mapper.js' });
  return context.mapSongRecord(raw);
}

function neteaseSong(id, publishTime, albumField = 'al') {
  return {
    id,
    name: `Official song ${id}`,
    ar: [{ id: 9, name: 'Official artist' }],
    [albumField]: {
      id: 7,
      name: 'Official album',
      picUrl: 'https://p3.music.126.net/cover.jpg',
      publishTime,
    },
    dt: 200000,
  };
}

test('NetEase mapper accepts only trusted millisecond release dates', () => {
  const releaseMs = Date.UTC(2018, 0, 1);
  const currentYear = new Date().getUTCFullYear();
  assert.equal(mapNeteaseSong(neteaseSong(1, releaseMs)).releaseDate, '2018-01-01');
  assert.equal(mapNeteaseSong(neteaseSong(2, releaseMs, 'album')).releaseDate, '2018-01-01');
  assert.equal(mapNeteaseSong(neteaseSong(3, Date.UTC(1900, 0, 1))).releaseDate, '1900-01-01');
  assert.equal(
    mapNeteaseSong(neteaseSong(4, Date.UTC(currentYear + 1, 11, 31))).releaseDate,
    `${currentYear + 1}-12-31`,
  );

  const untrustedPublishTimes = [
    releaseMs / 1000,
    true,
    String(releaseMs),
    NaN,
    Infinity,
    -Infinity,
    8640000000000000,
    null,
    { valueOf: () => releaseMs },
    undefined,
    Date.UTC(1899, 11, 31),
    Date.UTC(currentYear + 2, 0, 1),
  ];
  untrustedPublishTimes.forEach((publishTime, index) => {
    assert.equal(
      mapNeteaseSong(neteaseSong(10 + index, publishTime)).releaseDate,
      undefined,
      `publishTime ${String(publishTime)} must not become a release date`,
    );
  });
});

function profileRendererContext(view) {
  const context = {
    Array,
    Math,
    Number,
    Object,
    Promise,
    String,
    isFinite,
    musicProfileView: view,
    queueItemKey(song) { return `${song.provider}:${song.id}`; },
  };
  vm.runInNewContext([
    sourceFunction(profileClient, 'musicProfileSongId'),
    sourceFunction(profileClient, 'musicProfileValues'),
    sourceFunction(profileClient, 'musicProfileEra'),
    sourceFunction(profileClient, 'musicProfileMetadata'),
    sourceFunction(profileClient, 'musicProfileSongPayload'),
    sourceFunction(profileClient, 'scoreMusicProfileQueueSong'),
  ].join('\n'), context, { filename: 'music-profile-client.js' });
  return context;
}

test('official NetEase album publishTime reaches profile evidence and reorders the queue tail', (t) => {
  const mapped = Array.from({ length: 5 }, (_, index) => mapNeteaseSong(neteaseSong(
    100 + index,
    Date.UTC(2018, index, 1),
  )));
  assert.equal(mapped[0].releaseDate, '2018-01-01');
  assert.equal(mapNeteaseSong(neteaseSong(999, 'not-a-date')).releaseDate, undefined);

  const state = musicProfile.createMusicProfileState();
  musicProfile.setMusicProfileEnabled(state, true);
  musicProfile.setMusicProfileRecommendationMode(state, true);
  mapped.forEach((song, index) => {
    assert.equal(musicProfile.applyMusicProfileEvent(state, {
      id: `netease-favorite-${song.id}`,
      kind: 'favorite',
      at: index + 1,
      song,
    }), true);
  });

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-netease-profile-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'profile.json');
  musicProfile.saveMusicProfile(file, state);
  const view = musicProfile.getMusicProfileView(musicProfile.loadMusicProfile(file), Date.now());
  assert.equal(view.ready, true);
  assert.equal(view.tags.find((tag) => tag.key === 'era:2010s').weight, 200);

  const renderer = profileRendererContext(view);
  const older = mapNeteaseSong(neteaseSong(201, Date.UTC(1998, 0, 1)));
  const newer = mapNeteaseSong(neteaseSong(202, Date.UTC(2018, 0, 1)));
  assert.equal(renderer.scoreMusicProfileQueueSong(older), 0);
  assert.equal(renderer.scoreMusicProfileQueueSong(newer), 200);

  const protectedSongs = Array.from({ length: 6 }, (_, index) => mapNeteaseSong(neteaseSong(
    index + 1,
    Date.UTC(1990 + index, 0, 1),
  )));
  const context = {
    Array,
    Math,
    Number,
    Object,
    musicProfileView: view,
    currentIdx: 0,
    playQueue: protectedSongs.concat([older, newer]),
    scoreMusicProfileQueueSong: renderer.scoreMusicProfileQueueSong,
    safeRenderQueuePanel() {},
    safeShelfRebuild() {},
    saveLastPlaybackSnapshot() {},
  };
  vm.runInNewContext(queueModule, context, { filename: 'music-profile-queue.js' });
  assert.equal(context.applyMusicProfileQueueOrder('netase-official-metadata'), true);
  assert.deepEqual(context.playQueue.slice(0, 6).map((song) => song.id), protectedSongs.map((song) => song.id));
  assert.deepEqual(context.playQueue.slice(6).map((song) => song.id), [newer.id, older.id]);
});
