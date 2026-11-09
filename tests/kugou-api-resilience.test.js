'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const kugou = require('../kugou-api');

function withRequests(handler, task) {
  const original = https.request;
  const calls = [];
  kugou.clearKugouSessionCaches();
  https.request = (target, options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => request;
    request.write = () => {};
    request.destroy = error => process.nextTick(() => request.emit('error', error));
    request.end = () => {
      const call = { url: new URL(target), options };
      calls.push(call);
      Promise.resolve().then(() => handler(call)).then(result => {
        const response = new EventEmitter();
        response.statusCode = result.statusCode || 200;
        response.headers = {};
        callback(response);
        process.nextTick(() => {
          response.emit('data', Buffer.from(typeof result.body === 'string' ? result.body : JSON.stringify(result.body)));
          response.emit('end');
        });
      }).catch(error => request.emit('error', error));
    };
    return request;
  };
  return Promise.resolve().then(() => task(calls)).finally(() => {
    https.request = original;
    kugou.clearKugouSessionCaches();
  });
}

const memberCookie = 'userid=123; token=fixture-token; kg_mid=fixture-mid; kg_dfid=fixture-dfid';
function membershipResponse() {
  return { body: { role: 13, rawVipEndTime: '2099-12-31 23:59:59' } };
}
function songResponse(extra) {
  return { body: { status: 1, err_code: 0, data: { play_url: 'https://audio.kugou.test/full.mp3', bitrate: 128, is_free_part: 0, ...extra } } };
}

test('current official songinfo route includes the H5 signature and stable web UUID', async () => {
  await withRequests(({ url }) => {
    assert.equal(url.hostname, 'wwwapi.kugou.com');
    assert.equal(url.pathname, '/play/songinfo');
    const params = Object.fromEntries(url.searchParams);
    const signature = params.signature;
    delete params.signature;
    const salt = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt';
    const expected = crypto.createHash('md5').update(salt + Object.keys(params).sort().map(key => key + '=' + params[key]).join('') + salt).digest('hex');
    assert.equal(signature, expected);
    assert.equal(params.uuid, params.mid);
    assert.equal(params.album_audio_id, '42');
    assert.equal(params.platid, '4');
    return songResponse();
  }, async calls => {
    const result = await kugou.handleKugouSongUrl({ hash: 'free-song', albumAudioId: '42' }, '');
    assert.equal(result.playable, true);
    assert.equal(result.trial, false);
    assert.equal(result.playbackSource, 'web');
    assert.equal(calls.length, 1);
  });
});

test('transport and non-JSON failures reach the official retry host instead of breaking fallback', async () => {
  await withRequests(({ url }) => {
    if (url.pathname === '/recharge/roleinfo') return membershipResponse();
    if (url.hostname === 'wwwapi.kugou.com') return { body: '<html>temporarily unavailable</html>' };
    if (url.hostname === 'wwwapiretry.kugou.com') return songResponse();
    throw new Error('ECONNRESET');
  }, async calls => {
    const result = await kugou.handleKugouSongUrl({ hash: 'member-fallback-song', fee: 1 }, memberCookie);
    assert.equal(result.playable, true);
    assert.equal(result.trial, false);
    assert(calls.some(call => call.url.hostname === 'wwwapiretry.kugou.com'));
    assert(calls.every(call => call.url.protocol === 'https:'), 'session credentials must use HTTPS');
  });
});

test('official previews stay marked as previews in both fresh and cached responses', async () => {
  await withRequests(({ url }) => {
    if (url.pathname === '/recharge/roleinfo') return membershipResponse();
    if (url.pathname === '/play/songinfo') return songResponse({ is_free_part: 1 });
    return { body: { status: 0, error_code: 20018 } };
  }, async calls => {
    const params = { hash: 'preview-song', fee: 1 };
    const first = await kugou.handleKugouSongUrl(params, memberCookie);
    const count = calls.length;
    const cached = await kugou.handleKugouSongUrl(params, memberCookie);
    assert.equal(first.playable, true);
    assert.equal(first.trial, true);
    assert.equal(cached.trial, true);
    assert.equal(calls.length, count);
  });
});

test('a full authorized fallback can replace a preview without relabeling preview audio', async () => {
  await withRequests(({ url }) => {
    if (url.pathname === '/recharge/roleinfo') return membershipResponse();
    if (url.pathname === '/play/songinfo') return songResponse({ is_free_part: 1 });
    if (url.pathname === '/app/i/getSongInfo.php') return { body: { status: 1, url: 'https://audio.kugou.test/full-mobile.mp3', is_free_part: 0 } };
    return { body: { status: 0 } };
  }, async () => {
    const result = await kugou.handleKugouSongUrl({ hash: 'full-fallback-song', fee: 1 }, memberCookie);
    assert.equal(result.url, 'https://audio.kugou.test/full-mobile.mp3');
    assert.equal(result.trial, false);
  });
});

test('URL arrays select one valid address and failed gateway payloads cannot authorize audio', async () => {
  assert.equal(kugou._test.pickKugouPlayUrl({ data: { url: ['', 'javascript:bad', 'https://audio.kugou.test/a.mp3', 'https://audio.kugou.test/b.mp3'] } }), 'https://audio.kugou.test/a.mp3');
  assert.equal(kugou._test.pickKugouPlayUrl({ data: { url: [], play_backup_url: ['https://audio.kugou.test/backup.mp3'] } }), 'https://audio.kugou.test/backup.mp3');
  await withRequests(({ url }) => {
    if (url.pathname === '/recharge/roleinfo') return membershipResponse();
    if (url.pathname === '/play/songinfo') return { body: { status: 0, err_code: 30022 } };
    return { body: { status: 0, url: ['https://audio.kugou.test/denied.mp3'] } };
  }, async () => {
    const result = await kugou.handleKugouSongUrl({ hash: 'client-only-song', fee: 1 }, memberCookie);
    assert.equal(result.url, '');
    assert.equal(result.playable, false);
    assert.equal(result.reason, 'client_only');
  });
});

test('upstream errors are distinct from non-membership and official security challenges are preserved', async () => {
  await withRequests(() => ({ body: { status: 0, error_code: 20018 } }), async () => {
    const result = await kugou.handleKugouSongUrl({ hash: 'unavailable-song' }, '');
    assert.equal(result.reason, 'url_unavailable');
  });
  await withRequests(({ url }) => ({ body: { status: 0, err_code: url.pathname === '/play/songinfo' ? 30020 : 0 } }), async () => {
    const result = await kugou.handleKugouSongUrl({ hash: 'challenge-song' }, '');
    assert.equal(result.reason, 'verification_required');
  });
});

test('unknown or stale membership waits for verification without claiming non-membership or requesting paid audio', async () => {
  for (const stale of [false, true]) {
    await withRequests(() => ({ body: { status: 1, data: {} } }), async calls => {
      if (stale) {
        const auth = kugou.extractKugouAuth(memberCookie);
        kugou._test.stabilizeKugouVipProbe(kugou._test.kugouVipCacheKey(auth), {
          data: { userid: auth.userid, is_vip: true, vip_end_time: Math.floor(Date.now() / 1000) + 3600 },
        }, auth);
      }
      const result = await kugou.handleKugouSongUrl({ hash: 'pending-member-song', fee: 1 }, memberCookie);
      assert.equal(result.reason, 'membership_unknown');
      assert.equal(result.playable, false);
      assert.equal(result.url, '');
      assert.equal(result.membershipStale, stale);
      assert(!calls.some(call => ['/v5/url', '/play/songinfo', '/app/i/getSongInfo.php'].includes(call.url.pathname)));
    });
  }
});

test('search failures are rejected and not cached as an empty successful search', async () => {
  await withRequests(() => ({ body: { status: 0, error_code: 500 } }), async calls => {
    await assert.rejects(kugou.handleKugouSearch('fixture search', 3, '', 0), { code: 'KUGOU_SEARCH_UNAVAILABLE' });
    await assert.rejects(kugou.handleKugouSearch('fixture search', 3, '', 0), { code: 'KUGOU_SEARCH_UNAVAILABLE' });
    assert.equal(calls.length, 2);
  });
});

test('search offsets cross page boundaries without returning preceding tracks', async () => {
  await withRequests(({ url }) => {
    const page = Number(url.searchParams.get('page'));
    const size = Number(url.searchParams.get('pagesize'));
    return { body: { status: 1, data: { lists: Array.from({ length: size }, (_, index) => ({ FileHash: 'hash-' + ((page - 1) * size + index), SongName: 'song-' + ((page - 1) * size + index) })) } } };
  }, async calls => {
    const result = await kugou.handleKugouSearch('page test', 3, '', 2);
    assert.deepEqual(result.map(song => song.hash), ['hash-2', 'hash-3', 'hash-4']);
    assert.deepEqual(calls.map(call => call.url.searchParams.get('page')), ['1', '2']);
  });
});

test('Cookie object helpers preserve login identity and lyrics decode official base64 content', async () => {
  const cookie = { userid: '123', token: 'fixture-token' };
  assert.equal(kugou.kugouCookieUserId(cookie), '123');
  assert.equal(kugou.kugouCookieHasLogin(cookie), true);
  assert.equal(kugou.kugouCookieHasPlayback(cookie), true);
  await withRequests(({ url }) => url.pathname === '/search'
    ? { body: { candidates: [{ id: 'lyric-id', accesskey: 'fixture-access' }] } }
    : { body: { content: Buffer.from('[00:01.00]测试歌词').toString('base64') } }, async () => {
    const result = await kugou.handleKugouLyric('lyric-hash', '42', 180);
    assert.equal(result.lyric, '[00:01.00]测试歌词');
  });
});

test('personal-library failures retain an explicit upstream code and are retried instead of cached as empty', async () => {
  let count = 0;
  await withRequests(({ options }) => {
    assert.equal(options.headers['Content-Type'], 'application/json');
    return ++count === 1
      ? { body: { status: 0, error_code: 20017 } }
      : { body: { status: 1, data: { info: { self: [{ listid: '5', name: 'fixture list' }] } } } };
  }, async calls => {
    const failed = await kugou.handleKugouUserPlaylists(memberCookie);
    assert.equal(failed.libraryReady, false);
    assert.equal(failed.upstreamCode, 20017);
    assert.equal(failed.error, 'KUGOU_GATEWAY_FAILED');
    const recovered = await kugou.handleKugouUserPlaylists(memberCookie);
    assert.equal(recovered.libraryReady, true);
    assert.equal(recovered.playlists.length, 1);
    assert.equal(calls.length, 2);
  });
});

test('malformed personal-library and track payloads cannot become successful cached empty libraries', async () => {
  await withRequests(() => ({ body: { status: 1, data: {} } }), async calls => {
    const library = await kugou.handleKugouUserPlaylists(memberCookie);
    assert.equal(library.libraryReady, false);
    assert.equal(library.error, 'KUGOU_PLAYLIST_RESPONSE_INVALID');
    for (let attempt = 0; attempt < 2; attempt++) {
      const tracks = await kugou.handleKugouPlaylistTracks('5', memberCookie);
      assert.equal(tracks.error, 'KUGOU_PLAYLIST_TRACKS_RESPONSE_INVALID');
    }
    assert.equal(calls.length, 3);
  });
});
