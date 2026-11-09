const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { BuiltInPlaylistLibrary } = require('../desktop/built-in-playlist-library');

test('built-in playlists persist mixed-provider songs without changing their source', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-built-in-playlists-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const library = new BuiltInPlaylistLibrary({ userDataPath: root });

  const created = await library.create('跨平台收藏');
  const id = created.playlist.id;
  assert.match(id, /^[a-f0-9]{24}$/);

  await library.addTrack(id, { provider: 'netease', id: 1001, name: '网易云歌曲', artist: 'A', cover: 'https://example.com/ne.jpg' });
  await library.addTrack(id, { provider: 'qq', id: 'qq-1', mid: '003QQMID', mediaMid: '004MEDIA', name: 'QQ 歌曲', artist: 'B' });
  await library.addTrack(id, { provider: 'kugou', id: 'kg-1', hash: 'ABCDEF', albumAudioId: '900', name: '酷狗歌曲', artist: 'C' });
  await library.addTrack(id, { provider: 'qishui', id: 'qs-1', providerSongId: 'qs-1', name: '汽水歌曲', artist: 'D' });
  await library.addTrack(id, { provider: 'local', id: 'local:0123456789abcdef01234567', localFileId: '0123456789abcdef01234567', localKey: '0123456789abcdef01234567', localUrl: 'mineradio-local://audio/0123456789abcdef01234567?cap=test', name: '本地歌曲', artist: 'E' });

  const duplicate = await library.addTrack(id, { provider: 'qq', mid: '003QQMID', name: '同一首 QQ 歌曲', artist: 'B' });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.playlist.trackCount, 5);

  const firstPage = library.page(id, { offset: 0, limit: 3 });
  assert.deepEqual(firstPage.tracks.map((track) => track.provider), ['netease', 'qq', 'kugou']);
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.total, 5);
  assert.equal(firstPage.tracks[1].mid, '003QQMID');
  assert.equal(firstPage.tracks[2].hash, 'ABCDEF');

  const restored = new BuiltInPlaylistLibrary({ userDataPath: root });
  const restoredPage = restored.page(id, { offset: 3, limit: 10 });
  assert.deepEqual(restoredPage.tracks.map((track) => track.provider), ['qishui', 'local']);
  assert.equal(restored.listSync().playlists[0].cover, 'https://example.com/ne.jpg');

  await restored.rename(id, '常听合集');
  await restored.reorderTrack(id, 4, 0);
  assert.equal(restored.page(id, { limit: 1 }).tracks[0].provider, 'local');
  await restored.removeTrack(id, 0);
  assert.equal(restored.page(id, { limit: 20 }).total, 4);

  await assert.rejects(
    () => restored.addTrack(id, { provider: 'spotify', spotifyId: 'blocked', id: 'blocked', name: '已移除平台' }),
    /BUILT_IN_PLAYLIST_TRACK_INVALID/
  );
  await restored.delete(id);
  assert.equal(restored.listSync().count, 0);
});

test('Electron and renderer wiring exposes built-in playlists in collection, panel, queue and shelf', () => {
  const appRoot = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(appRoot, 'desktop', 'preload.js'), 'utf8');
  const loader = fs.readFileSync(path.join(appRoot, 'public', 'js', 'index-loader.js'), 'utf8');
  const builtInRenderer = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '00-built-in-playlists.js'), 'utf8');
  const panel = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '02-playlist-detail.js'), 'utf8');
  const loaders = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '06-lyrics', '03-podcast-playlist-loaders.js'), 'utf8');
  const collect = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '06-track-detail-lyrics-actions.js'), 'utf8');
  const shelf = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '04-shelf', '01-manager-core.js'), 'utf8');
  const shelfContent = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '04-shelf', '03-content-list-manager.js'), 'utf8');

  assert.match(main, /new BuiltInPlaylistLibrary\(\{ userDataPath: STABLE_USER_DATA_PATH \}\)/);
  assert.match(main, /mineradio-built-in-playlist-add-track/);
  assert.match(preload, /listBuiltInPlaylists/);
  assert.match(preload, /addBuiltInPlaylistTrack/);
  assert.match(loader, /06-lyrics\/00-built-in-playlists\.js/);
  assert.match(builtInRenderer, /function addTrackToBuiltInPlaylist/);
  assert.match(panel, /Mineradio 内置歌单/);
  assert.match(panel, /fetchPlaylistTracksPage/);
  assert.match(loaders, /mineradio:/);
  assert.match(collect, /可混合全部平台/);
  assert.doesNotMatch(collect, /function openCollectModal\(song\)[\s\S]{0,240}ensureLoggedInForAction/);
  assert.match(shelf, /provider === 'mineradio'/);
  assert.match(shelfContent, /builtInPlaylistTracksPage/);
});
