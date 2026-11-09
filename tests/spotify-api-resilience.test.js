'use strict';

const assert = require('assert');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

function withHttpsMock(handler, task) {
  const original = https.request;
  https.request = function mockedRequest(targetUrl, options, callback) {
    const request = new EventEmitter();
    const chunks = [];
    request.write = chunk => chunks.push(Buffer.from(String(chunk)));
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
        const send = () => {
          if (result.body != null) response.emit('data', Buffer.from(typeof result.body === 'string' ? result.body : JSON.stringify(result.body)));
          response.emit('end');
        };
        if (result.delayMs) setTimeout(send, result.delayMs);
        else process.nextTick(send);
      }).catch(error => request.emit('error', error));
    };
    return request;
  };
  return Promise.resolve().then(task).finally(() => { https.request = original; });
}

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-spotify-resilience-'));
  const configFile = path.join(root, '.spotify-credentials.json');
  const tokenFile = path.join(root, '.spotify-token.json');
  process.env.SPOTIFY_CONFIG_FILE = configFile;
  process.env.SPOTIFY_TOKEN_FILE = tokenFile;
  const validClientId = '0123456789abcdef0123456789abcdef';
  process.env.SPOTIFY_CLIENT_ID = validClientId;
  delete process.env.SPOTIFY_CLIENT_SECRET;

  const spotify = require('../spotify-api');
  const runtime = spotify._test;
  try {
    assert.throws(
      () => spotify.saveSpotifyConfig({ clientId: 'not a client id' }),
      error => error && error.code === 'SPOTIFY_CLIENT_ID_INVALID'
    );
    assert.throws(
      () => spotify.saveSpotifyConfig({ clientId: validClientId, redirectUri: 'https://localhost/callback' }),
      error => error && error.code === 'SPOTIFY_REDIRECT_URI_INVALID'
    );
    spotify.saveSpotifyConfig({ clientId: validClientId, clientSecret: 'must-not-be-stored' });
    const savedConfig = JSON.parse(fs.readFileSync(configFile, 'utf8')).spotify;
    assert.strictEqual(savedConfig.clientId, validClientId);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(savedConfig, 'clientSecret'), false, 'desktop PKCE config must not persist a Client Secret');
    assert(savedConfig.scopes.includes('user-read-private'), 'desktop PKCE must request the profile scope used for product/account verification');

    runtime.resetSpotifyRuntimeStateForTests();
    spotify.saveSpotifyOAuthToken({
      access_token: 'expired-access',
      refresh_token: 'refresh-one',
      expiresAt: Date.now() - 1000,
      newAuthorization: true,
    });
    let refreshCalls = 0;
    await withHttpsMock(({ url, body }) => {
      assert(url.includes('/api/token'));
      assert(body.includes('grant_type=refresh_token'));
      refreshCalls += 1;
      return { delayMs: 30, body: { access_token: 'refreshed-once', expires_in: 3600 } };
    }, async () => {
      const tokens = await Promise.all(Array.from({ length: 12 }, () => runtime.getSpotifyUserAccessToken()));
      assert(tokens.every(token => token === 'refreshed-once'));
    });
    assert.strictEqual(refreshCalls, 1, 'concurrent expiry checks must share one refresh request');
    assert.strictEqual(runtime.readStoredSpotifyToken().refreshToken, 'refresh-one', 'refresh response without rotation must preserve the previous refresh token');

    runtime.resetSpotifyRuntimeStateForTests();
    spotify.saveSpotifyOAuthToken({ access_token: 'old-access', refresh_token: 'refresh-two', expires_in: 3600, newAuthorization: true });
    let apiCalls = 0;
    let retryRefreshCalls = 0;
    await withHttpsMock(({ url, options }) => {
      if (url.includes('/api/token')) {
        retryRefreshCalls += 1;
        return { body: { access_token: 'new-access', expires_in: 3600 } };
      }
      apiCalls += 1;
      if (apiCalls === 1) return { statusCode: 401, body: { error: { status: 401, message: 'expired' } } };
      assert.strictEqual(options.headers.Authorization, 'Bearer new-access');
      return { body: { id: 'spotify-user', display_name: 'Alice' } };
    }, async () => {
      const profile = await runtime.spotifyUserGet('/me', {});
      assert.strictEqual(profile.display_name, 'Alice');
    });
    assert.strictEqual(apiCalls, 2, '401 must retry the API request exactly once');
    assert.strictEqual(retryRefreshCalls, 1, '401 retry must force exactly one token refresh');

    runtime.resetSpotifyRuntimeStateForTests();
    spotify.saveSpotifyOAuthToken({ access_token: 'expired-again', refresh_token: 'invalid-refresh', expiresAt: Date.now() - 1000, newAuthorization: true });
    await withHttpsMock(() => ({ statusCode: 400, body: { error: 'invalid_grant', error_description: 'Refresh token expired' } }), async () => {
      await assert.rejects(runtime.getSpotifyUserAccessToken(), error => error && error.code === 'SPOTIFY_REAUTH_REQUIRED' && error.reauthRequired === true);
    });
    assert.strictEqual(fs.existsSync(tokenFile), false, 'invalid_grant must clear the unusable token file');

    runtime.resetSpotifyRuntimeStateForTests();
    spotify.saveSpotifyOAuthToken({ access_token: 'rate-access', expires_in: 3600, newAuthorization: true });
    let rateCalls = 0;
    await withHttpsMock(() => {
      rateCalls += 1;
      if (rateCalls === 1) return { statusCode: 429, headers: { 'retry-after': '0.01' }, body: { error: { status: 429, message: 'slow down' } } };
      return { body: { tracks: { items: [] } } };
    }, () => runtime.spotifyGet('/search', { q: 'test', type: 'track' }, { preferUser: true }));
    assert.strictEqual(rateCalls, 2, 'short Retry-After must be honored with one bounded retry');

    runtime.resetSpotifyRuntimeStateForTests();
    spotify.saveSpotifyOAuthToken({ access_token: 'transient-access', expires_in: 3600, newAuthorization: true });
    let transientCalls = 0;
    await withHttpsMock(() => {
      transientCalls += 1;
      if (transientCalls === 1) return { statusCode: 503, body: { error: { status: 503, message: 'temporary' } } };
      return { body: { id: 'ok' } };
    }, () => runtime.spotifyGet('/me', {}, { preferUser: true }));
    assert.strictEqual(transientCalls, 2, 'temporary 5xx failures must receive a bounded retry');

    runtime.resetSpotifyRuntimeStateForTests();
    spotify.saveSpotifyOAuthToken({
      access_token: 'diagnostic-access',
      expires_in: 3600,
      scope: 'user-read-private user-library-read playlist-read-private',
      newAuthorization: true,
    });
    await withHttpsMock(({ url }) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/me')) return { body: { id: 'diagnostic-user', display_name: 'Diagnostic User', product: 'premium' } };
      if (parsed.pathname.endsWith('/me/tracks')) return { body: { items: [], total: 0 } };
      if (parsed.pathname.endsWith('/me/playlists')) return { body: { items: [], total: 0 } };
      throw new Error('Unexpected Spotify diagnostics URL: ' + url);
    }, async () => {
      const diagnostics = await spotify.handleSpotifySetupDiagnostics();
      assert.strictEqual(diagnostics.ready, true);
      assert.strictEqual(diagnostics.nickname, 'Diagnostic User');
      assert.strictEqual(diagnostics.product, 'premium');
      assert(diagnostics.checks.every(check => check.ok), 'all setup diagnostics should pass with profile, scopes, library, and playlists available');
    });

    runtime.resetSpotifyRuntimeStateForTests();
    spotify.saveSpotifyOAuthToken({
      access_token: 'search-page-access',
      expires_in: 3600,
      scope: 'user-top-read user-library-read',
      newAuthorization: true,
    });
    const spotifyTrack = (id, name) => ({
      id,
      name,
      uri: 'spotify:track:' + id,
      duration_ms: 180000,
      artists: [{ id: 'artist-' + id, name: 'Artist ' + id }],
      album: { id: 'album-' + id, name: 'Album ' + id, images: [] },
    });
    await withHttpsMock(({ url }) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/search')) {
        assert.strictEqual(parsed.searchParams.get('offset'), '10');
        return {
          body: {
            tracks: {
              items: [spotifyTrack('page-10', 'Page Ten'), spotifyTrack('page-11', 'Page Eleven')],
              total: 12,
              next: null,
            },
          },
        };
      }
      if (parsed.pathname.endsWith('/me/top/tracks')) {
        return { body: { items: [spotifyTrack('top-1', 'Top One')], total: 1, next: null } };
      }
      throw new Error('Unexpected Spotify URL: ' + url);
    }, async () => {
      const searchPage = await spotify.handleSpotifySearch('page test', 2, 10);
      assert.strictEqual(searchPage.offset, 10);
      assert.strictEqual(searchPage.nextOffset, 12);
      assert.deepStrictEqual(searchPage.songs.map(song => song.id), ['page-10', 'page-11']);
      const recommendations = await spotify.handleSpotifyRecommendations(5);
      assert.strictEqual(recommendations.mode, 'personal-top');
      assert.strictEqual(recommendations.provenance, 'spotify-web-api');
      assert.deepStrictEqual(recommendations.songs.map(song => song.id), ['top-1']);
    });

    runtime.resetSpotifyRuntimeStateForTests();
    spotify.saveSpotifyOAuthToken({
      access_token: 'write-access',
      expires_in: 3600,
      scope: 'user-library-read user-library-modify playlist-modify-private playlist-modify-public',
      newAuthorization: true,
    });
    await withHttpsMock(({ url, options, body }) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/me/library/contains')) {
        assert.strictEqual(parsed.searchParams.get('uris'), 'spotify:track:track-1,spotify:track:track-2');
        return { body: [true, false] };
      }
      if (parsed.pathname.endsWith('/me/library')) {
        assert.strictEqual(options.method, 'PUT');
        assert.strictEqual(parsed.searchParams.get('uris'), 'spotify:track:track-2');
        return { body: '' };
      }
      if (parsed.pathname.endsWith('/playlists/playlist-1/items')) {
        assert.strictEqual(options.method, 'POST');
        assert.deepStrictEqual(JSON.parse(body), { uris: ['spotify:track:track-2'] });
        return { statusCode: 201, body: { snapshot_id: 'snapshot-1' } };
      }
      if (parsed.pathname.endsWith('/me') && options.method === 'GET') {
        return { body: { id: 'owner-1', display_name: 'Owner' } };
      }
      if (parsed.pathname.endsWith('/me/playlists')) {
        assert.strictEqual(options.method, 'POST');
        assert.strictEqual(JSON.parse(body).public, false);
        return { statusCode: 201, body: { id: 'playlist-new', name: 'New List', owner: { id: 'owner-1' }, items: { total: 0 } } };
      }
      throw new Error('Unexpected Spotify write URL: ' + url);
    }, async () => {
      const checked = await spotify.handleSpotifyLibraryCheck('track', ['track-1', 'track-2']);
      assert.deepStrictEqual(checked.liked, { 'track-1': true, 'track-2': false });
      const saved = await spotify.handleSpotifyLibrarySet('track', { spotifyId: 'track-2' }, true);
      assert.strictEqual(saved.success, true);
      const added = await spotify.handleSpotifyPlaylistAddSong('playlist-1', { spotifyId: 'track-2' });
      assert.strictEqual(added.snapshotId, 'snapshot-1');
      const created = await spotify.handleSpotifyCreatePlaylist('New List', { public: false });
      assert.strictEqual(created.playlist.id, 'playlist-new');
    });

    assert.strictEqual(runtime.normalizeSpotifyProfile({ id: 'numeric-or-id-only' }).nickname, 'Spotify');
    assert.strictEqual(runtime.normalizeSpotifyProfile({ id: 'user-id', account_id: 'stable-account', display_name: '平台昵称' }).nickname, '平台昵称');
    assert.strictEqual(runtime.normalizeSpotifyProfile({ id: 'user-id', account_id: 'stable-account', display_name: '平台昵称' }).accountId, 'stable-account');
    console.log('[OK] Spotify token recovery, pagination, nickname mapping, official library writes, and playlist writes verified.');
  } finally {
    runtime.resetSpotifyRuntimeStateForTests();
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env.SPOTIFY_CONFIG_FILE;
    delete process.env.SPOTIFY_TOKEN_FILE;
    delete process.env.SPOTIFY_CLIENT_ID;
  }
}

run().catch(error => {
  console.error(error && error.stack || error);
  process.exit(1);
});
