'use strict';

const assert = require('assert');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { EventEmitter } = require('events');
const qishui = require('../qishui-api');

function withHttpsMock(handler, task) {
  const original = https.request;
  https.request = function mockedRequest(targetUrl, options, callback) {
    const request = new EventEmitter();
    const chunks = [];
    request.write = chunk => chunks.push(Buffer.from(String(chunk)));
    request.setTimeout = () => request;
    request.destroy = error => process.nextTick(() => request.emit('error', error || new Error('destroyed')));
    request.end = () => {
      Promise.resolve(handler({
        url: String(targetUrl),
        options: options || {},
        body: Buffer.concat(chunks).toString('utf8'),
      })).then(result => {
        result = result || {};
        const response = new EventEmitter();
        response.statusCode = Number(result.statusCode || 200);
        response.headers = result.headers || {};
        callback(response);
        process.nextTick(() => {
          response.emit('data', Buffer.from(typeof result.body === 'string' ? result.body : JSON.stringify(result.body || {})));
          response.emit('end');
        });
      }).catch(error => request.emit('error', error));
    };
    return request;
  };
  return Promise.resolve().then(task).finally(() => { https.request = original; });
}

function pcSearchTrack(id, name) {
  return {
    entity: {
      track_wrapper: {
        track: {
          base_info: { id, name, duration_ms: 180000 },
          related_info: {
            artist_links: [{ id: 'artist-fixture', name: '测试歌手' }],
          },
        },
      },
    },
  };
}

async function testPcSearchAndPublicFallback() {
  const cookie = 'sessionid=fixture-session; sid_tt=fixture-sid; uid_tt=fixture-user';
  await withHttpsMock(({ url, options }) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'api.qishui.com' && parsed.pathname === '/luna/pc/search/track') {
      assert.strictEqual(options.method || 'GET', 'GET');
      assert.strictEqual(parsed.searchParams.get('q'), '本地搜索测试');
      assert.strictEqual(parsed.searchParams.get('cursor'), '0');
      assert(/sessionid=fixture-session/.test(String(options.headers && options.headers.Cookie || '')));
      return {
        body: {
          data: {
            result_groups: [{ data: [pcSearchTrack('pc-search-1', '本地搜索测试')] }],
            has_more: false,
          },
        },
      };
    }
    throw new Error('Unexpected request: ' + parsed.hostname + parsed.pathname);
  }, async () => {
    const result = await qishui.handleQishuiSearch('本地搜索测试', 8, cookie, 0);
    assert.strictEqual(result.source, 'qishui-pc-search');
    assert.strictEqual(result.webSession, true);
    assert.strictEqual(result.songs.length, 1);
    assert.strictEqual(result.songs[0].id, 'pc-search-1');
    assert.strictEqual(result.songs[0].playbackMode, 'direct-url');
  });

  await withHttpsMock(({ url }) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'api.qishui.com' && parsed.pathname === '/luna/pc/search/track') {
      return { statusCode: 503, body: { message: 'fixture failure' } };
    }
    if (parsed.hostname === 'api-vehicle.volcengine.com' && parsed.pathname === '/v2/search/type') {
      return {
        body: {
          data: {
            list: [{
              item_id: 'public-fallback-1',
              title: '本地失败回退测试',
              author_info: { id: 'artist-fixture', name: '测试歌手' },
            }],
          },
        },
      };
    }
    throw new Error('Unexpected request: ' + parsed.hostname + parsed.pathname);
  }, async () => {
    const result = await qishui.handleQishuiSearch('本地失败回退测试', 8, cookie, 0);
    assert.strictEqual(result.publicCatalog, true);
    assert.strictEqual(result.songs[0].id, 'public-fallback-1');
    assert(result.pcSearchError, 'PC search failure must be retained as diagnostic context');
  });
}

async function testTrackV2GetFallbackAndBitratePriority() {
  const cookie = 'sessionid=fixture-session; sid_tt=fixture-sid';
  const requests = [];
  await withHttpsMock(({ url, options }) => {
    const parsed = new URL(url);
    if (parsed.hostname !== 'api.qishui.com' || parsed.pathname !== '/luna/pc/track_v2') {
      throw new Error('Unexpected request: ' + parsed.hostname + parsed.pathname);
    }
    const method = options.method || 'GET';
    requests.push(method);
    if (method === 'POST') return { statusCode: 503, body: { message: 'fixture POST failure' } };
    assert.strictEqual(parsed.searchParams.get('track_id'), 'track-get-fallback');
    return {
      body: {
        data: {
          track: {
            id: 'track-get-fallback',
            duration_ms: 180000,
            bit_rates: [{
              playable_url: 'https://media.example/audio.m4a?br=128000',
              size: 2880000,
              format: 'm4a',
            }],
          },
        },
      },
    };
  }, async () => {
    const result = await qishui.handleQishuiSongUrl({ id: 'track-get-fallback' }, cookie);
    assert.deepStrictEqual(requests, ['POST', 'GET']);
    assert.strictEqual(result.playable, true);
    assert.strictEqual(result.url, 'https://media.example/audio.m4a?br=128000');
    assert.strictEqual(result.br, 128000);
    assert.strictEqual(result.level, 'standard');
  });

  await withHttpsMock(({ url, options }) => {
    const parsed = new URL(url);
    if (parsed.hostname !== 'api.qishui.com' || parsed.pathname !== '/luna/pc/track_v2') {
      throw new Error('Unexpected request: ' + parsed.hostname + parsed.pathname);
    }
    assert.strictEqual(options.method, 'POST');
    return {
      body: {
        data: {
          track: {
            id: 'track-priority',
            duration_ms: 180000,
            audio_info: {
              play_info_list: [{
                main_play_url: 'https://media.example/primary.m4a?br=128000',
                duration: 180,
                format: 'm4a',
              }],
            },
            bit_rates: [{
              playable_url: 'https://media.example/fallback.flac?br=999000',
              duration: 180,
              format: 'flac',
            }],
          },
        },
      },
    };
  }, async () => {
    const result = await qishui.handleQishuiSongUrl({ id: 'track-priority' }, cookie);
    assert.strictEqual(result.url, 'https://media.example/primary.m4a?br=128000', 'bit_rates playable_url must remain a last-resort source');
  });
}

async function testLyricFallbackAndConversion() {
  const converted = qishui._test.qishuiConvertLyric(
    '[1000,2000]<0,500,0>世<500,500,0>界\n[4000,1000]<0,1000,0>和平'
  );
  assert.strictEqual(converted.lyric, '[00:01.00]世界\n[00:04.00]和平');
  assert.strictEqual(converted.yrc, '[1000,2000](1000,500,0)世(1500,500,0)界\n[4000,1000](4000,1000,0)和平');

  await withHttpsMock(({ url }) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'beta-luna.douyin.com') {
      return {
        body: {
          data: {
            track: {
              lyric: { content: '[2000,1200]<0,600,0>汽<600,600,0>水' },
            },
          },
        },
      };
    }
    throw new Error('Unexpected request: ' + parsed.hostname + parsed.pathname);
  }, async () => {
    const result = await qishui.handleQishuiLyric('lyric-beta-fixture');
    assert.strictEqual(result.source, 'qishui-beta-seo-track');
    assert.strictEqual(result.lyric, '[00:02.00]汽水');
    assert.strictEqual(result.yrc, '[2000,1200](2000,600,0)汽(2600,600,0)水');
  });

  await withHttpsMock(({ url, options }) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'beta-luna.douyin.com') return { body: { data: {} } };
    if (parsed.hostname === 'api.qishui.com' && parsed.pathname === '/luna/pc/track_v2') {
      assert.strictEqual(options.method || 'GET', 'GET');
      return {
        body: {
          data: {
            track: {
              lyric_info: {
                lyric_entity: { content: '[3000,1000]<0,1000,0>回退歌词' },
              },
            },
          },
        },
      };
    }
    throw new Error('Unexpected request: ' + parsed.hostname + parsed.pathname);
  }, async () => {
    const result = await qishui.handleQishuiLyric('lyric-track-fixture', 'sessionid=fixture-session');
    assert.strictEqual(result.source, 'qishui-pc-track-v2');
    assert.strictEqual(result.lyric, '[00:03.00]回退歌词');
    assert.strictEqual(result.yrc, '[3000,1000](3000,1000,0)回退歌词');
  });
}

async function testPcAccountWritesAndComments() {
  const cookie = 'sessionid=fixture-session; sid_tt=fixture-sid; uid_tt=fixture-user';
  await withHttpsMock(({ url }) => {
    const parsed = new URL(url);
    if (parsed.hostname !== 'api.qishui.com') throw new Error('Unexpected host: ' + parsed.hostname);
    if (parsed.pathname === '/luna/pc/me') {
      return { body: { data: { my_info: { id: 'fixture-user', nickname: '测试用户' } } } };
    }
    if (parsed.pathname === '/luna/pc/me/collection/mixed') {
      return { body: { data: { media_resources: [pcSearchTrack('liked-fixture', '已喜欢歌曲')] } } };
    }
    if (parsed.pathname === '/luna/pc/user/playlist' || parsed.pathname === '/luna/pc/me/recently-played-media') {
      return { body: { status_code: 0 } };
    }
    throw new Error('Unexpected request: ' + parsed.pathname);
  }, async () => {
    const checked = await qishui.handleQishuiCheckTracksLiked(['liked-fixture', 'unknown-fixture'], cookie);
    assert.strictEqual(checked.liked['liked-fixture'], true);
    assert.strictEqual(checked.liked['unknown-fixture'], false);
    assert.strictEqual(checked.complete, false, 'a bounded library page must not pretend to be a complete like index');
  });

  const writes = [];
  await withHttpsMock(({ url, options, body }) => {
    const parsed = new URL(url);
    if (parsed.hostname !== 'api.qishui.com') throw new Error('Unexpected host: ' + parsed.hostname);
    const method = options.method || 'GET';
    const parsedBody = body ? JSON.parse(body) : null;
    writes.push({ path: parsed.pathname, method, body: parsedBody });
    if (parsed.pathname === '/luna/pc/comments' && method === 'GET') {
      assert.strictEqual(parsed.searchParams.get('group_id'), 'comment-track');
      assert.strictEqual(parsed.searchParams.get('group_type'), '0');
      assert.strictEqual(parsed.searchParams.get('count'), '12');
      return {
        body: {
          comments: [{
            id: 'comment-fixture',
            text: '评论内容',
            like_count: 7,
            create_time: 1700000000,
            user: { id: 'comment-user', nickname: '评论用户', avatar_url: 'https://image.example/avatar.jpg' },
          }],
          total: 1,
          next_cursor: 'next-fixture',
          has_more: true,
        },
      };
    }
    if (parsed.pathname === '/luna/pc/comments/create') {
      return {
        body: {
          status_code: 0,
          data: {
            comment: {
              id: 'created-comment',
              text: '新评论',
              user: { id: 'fixture-user', nickname: '测试用户' },
            },
          },
        },
      };
    }
    return { body: { status_code: 0 } };
  }, async () => {
    assert.strictEqual((await qishui.handleQishuiSetTrackLiked('track-like', true, cookie)).liked, true);
    assert.strictEqual((await qishui.handleQishuiSetTrackLiked('track-like', false, cookie)).liked, false);
    assert.strictEqual((await qishui.handleQishuiSetPlaylistCollected('playlist-one', true, cookie)).collected, true);
    assert.strictEqual((await qishui.handleQishuiSetPlaylistCollected('playlist-one', false, cookie)).collected, false);
    assert.strictEqual((await qishui.handleQishuiPlaylistAddSong('playlist-one', { providerSongId: 'playlist-track' }, cookie)).success, true);
    assert.strictEqual((await qishui.handleQishuiSetAlbumCollected('album-one', true, cookie)).collected, true);
    assert.strictEqual((await qishui.handleQishuiSetAlbumCollected('album-one', false, cookie)).collected, false);
    assert.strictEqual((await qishui.handleQishuiReportRecentlyPlayed('recent-track', cookie)).reported, true);
    const comments = await qishui.handleQishuiComments('comment-track', { count: 12, cursor: '' }, cookie);
    assert.strictEqual(comments.comments.length, 1);
    assert.strictEqual(comments.comments[0].content, '评论内容');
    assert.strictEqual(comments.comments[0].likedCount, 7);
    assert.strictEqual(comments.comments[0].time, 1700000000000);
    assert.strictEqual(comments.nextCursor, 'next-fixture');
    const created = await qishui.handleQishuiCreateComment('comment-track', '新评论', cookie);
    assert.strictEqual(created.created, true);
    assert.strictEqual(created.comment.content, '新评论');
  });

  const writeByPath = new Map(writes.filter(item => item.method === 'POST').map(item => [item.path, item.body]));
  assert.deepStrictEqual(writeByPath.get('/luna/pc/me/collection/media'), {
    media: [{ type: 'track', id: 'track-like' }],
    scene: '',
  });
  assert.deepStrictEqual(writeByPath.get('/luna/pc/me/collection/media/delete'), {
    media: [{ type: 'track', id: 'track-like' }],
    scene: '',
  });
  assert.deepStrictEqual(writeByPath.get('/luna/pc/me/collection/playlist'), { playlist_ids: ['playlist-one'] });
  assert.deepStrictEqual(writeByPath.get('/luna/pc/me/collection/playlist/delete'), { playlist_ids: ['playlist-one'] });
  assert.deepStrictEqual(writeByPath.get('/luna/pc/me/playlist/media/append'), {
    playlist_id: 'playlist-one',
    media: [{ id: 'playlist-track', type: 'track' }],
  });
  assert.deepStrictEqual(writeByPath.get('/luna/pc/me/collection/album'), { album_ids: ['album-one'] });
  assert.deepStrictEqual(writeByPath.get('/luna/pc/me/collection/album/delete'), { album_ids: ['album-one'] });
  assert.deepStrictEqual(writeByPath.get('/luna/pc/me/recently-played-media'), {
    media: [{ type: 'track', id: 'recent-track' }],
  });
  assert.deepStrictEqual(writeByPath.get('/luna/pc/comments/create'), {
    group_id: 'comment-track',
    text: '新评论',
    group_type: 0,
  });
}

async function run() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'qishui-api.js'), 'utf8');
  assert(source.includes("'/api/luna/v1/platform/feed/related-media/'"));
  assert(source.includes("'/api/luna/v1/platform/feed/song-tab/'"));
  await testPcSearchAndPublicFallback();
  await testTrackV2GetFallbackAndBitratePriority();
  await testLyricFallbackAndConversion();
  await testPcAccountWritesAndComments();
  console.log('[OK] Qishui local PC search, playback fallback, lyrics, collections, recent-play, and comments verified.');
}

run().catch(error => {
  console.error(error && error.stack || error);
  process.exit(1);
});
