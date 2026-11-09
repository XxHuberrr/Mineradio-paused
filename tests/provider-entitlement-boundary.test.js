'use strict';

const assert = require('assert');
const https = require('https');
const { EventEmitter } = require('events');
const kugou = require('../kugou-api');
const qishui = require('../qishui-api');

function requireTestFunction(runtime, name, provider) {
  const fn = runtime && runtime._test && runtime._test[name];
  assert.strictEqual(
    typeof fn,
    'function',
    `${provider} must expose _test.${name} for entitlement boundary regression coverage`
  );
  return fn;
}

function assertNoMembership(value, label) {
  assert(value && typeof value === 'object', `${label} must return a membership object`);
  assert.strictEqual(value.isVip, false, `${label} must not infer VIP`);
  assert.strictEqual(value.isSvip, false, `${label} must not infer SVIP`);
  assert.strictEqual(value.vipLevel, 'none', `${label} must keep vipLevel=none`);
  assert.strictEqual(Number(value.vipType || 0), 0, `${label} must keep vipType=0`);
}

function assertVipMembership(value, label) {
  assert(value && typeof value === 'object', `${label} must return a membership object`);
  assert.strictEqual(value.isVip, true, `${label} must recognize explicit VIP`);
  assert.notStrictEqual(value.vipLevel, 'none', `${label} must expose a positive VIP level`);
}

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
          const body = typeof result.body === 'string' ? result.body : JSON.stringify(result.body || {});
          response.emit('data', Buffer.from(body));
          response.emit('end');
        });
      }).catch(error => request.emit('error', error));
    };
    return request;
  };
  return Promise.resolve().then(task).finally(() => {
    https.request = original;
  });
}

function isKugouMembershipEndpoint(pathname) {
  return [
    '/v1/get_union_vip',
    '/v1/vipuser_sub',
    '/kugouvip/v2/batch_union_vipinfo',
    '/kugouvip/v1/batch_union_vipinfo',
    '/mobile/vipinfo',
  ].includes(String(pathname || ''));
}

function isKugouWebRoleInfoEndpoint(pathname) {
  return String(pathname || '') === '/recharge/roleinfo';
}

function unknownKugouWebRoleInfo() {
  return { body: { errno: 105, error_code: 20017 } };
}

function qishuiTrackPayload(id, requiresVip, mediaUrl) {
  return {
    data: {
      user_membership: {
        is_vip: false,
        is_svip: false,
        vip_type: 0,
        vip_level: 0,
        member_level: 0,
      },
      track: {
        id,
        duration_ms: 180000,
        is_vip: requiresVip,
        need_vip: requiresVip,
        only_vip_playable: requiresVip,
        fee: requiresVip ? 1 : 0,
        privilege: requiresVip ? 10 : 0,
        audio_info: {
          play_info_list: [{
            main_play_url: mediaUrl,
            duration: 180,
            format: 'm4a',
            bitrate: 128000,
          }],
        },
      },
    },
  };
}

function testKugouMembershipNormalization() {
  const normalize = requireTestFunction(kugou, 'normalizeKugouVipPayloadV2', 'Kugou');
  const extractAuth = requireTestFunction(kugou, 'extractKugouAuth', 'Kugou');

  [
    {
      data: {
        is_vip: false,
        is_svip: false,
        vip_type: 0,
        svip_type: 0,
        vip_status: 0,
        member_type: 0,
      },
    },
    {
      data: {
        vip: {},
        svip: {},
        member: {},
        membership: {},
        vip_status: {},
      },
    },
  ].forEach((fixture, index) => {
    assertNoMembership(normalize(fixture, {}), `Kugou false/field-only fixture ${index + 1}`);
  });

  assertVipMembership(
    normalize({ data: { is_vip: true } }, {}),
    'Kugou explicit is_vip=true'
  );
  assertVipMembership(
    normalize({ data: { vip_level: 1 } }, {}),
    'Kugou explicit vip_level=1'
  );

  const zeroSvipCookie = extractAuth('userid=7; token=t; svip=0; isVIP=0');
  assertNoMembership(zeroSvipCookie, 'Kugou svip=0 cookie');
  assert.strictEqual(
    zeroSvipCookie.membershipKnown,
    true,
    'Kugou explicit zero cookie fields should be known non-member evidence'
  );

  const staleCookieFallback = extractAuth('userid=7; token=t; vip_type=1');
  const explicitApiOrdinary = normalize({
    data: { userid: '7', is_vip: false, vip_type: 0, is_svip: false, svip_type: 0 },
  }, staleCookieFallback);
  assertNoMembership(explicitApiOrdinary, 'Kugou API ordinary state overriding stale cookie VIP');
  assert.strictEqual(
    explicitApiOrdinary.membershipSource,
    'kugou-vip-api',
    'Kugou official membership state must take precedence over cookie fallback'
  );

  const unknownApiShape = normalize({ status: 1, data: {} }, staleCookieFallback);
  assertNoMembership(unknownApiShape, 'Kugou unknown API state must not confirm a cookie VIP hint');
  assert.strictEqual(unknownApiShape.membershipKnown, false);
  assert.strictEqual(unknownApiShape.membershipHintLevel, 'vip');
  assert.strictEqual(
    unknownApiShape.membershipSource,
    'kugou-cookie-hint',
    'Kugou unknown API data may expose only a pending cookie hint'
  );
}

function testKugouPlaybackBoundaries() {
  const requiresVip = requireTestFunction(kugou, 'kugouPlaybackParamsRequireVip', 'Kugou');
  const cacheScope = requireTestFunction(kugou, 'kugouPlaybackCacheScope', 'Kugou');
  const effectiveQuality = requireTestFunction(kugou, 'kugouEffectiveQuality', 'Kugou');
  const membershipRights = requireTestFunction(kugou, 'kugouMembershipRights', 'Kugou');
  const activeExpiry = Date.now() + 60 * 60 * 1000;

  assert.strictEqual(requiresVip({
    vipRequired: false,
    needVip: 0,
    onlyVipPlayable: 'false',
    fee: 0,
    privilege: 0,
  }), false, 'Kugou false/zero playback flags must stay free');
  assert.strictEqual(requiresVip({ vipRequired: true }), true, 'Kugou vipRequired=true must require VIP');
  assert.strictEqual(requiresVip({ fee: 1 }), true, 'Kugou fee=1 must require VIP');
  assert.strictEqual(requiresVip({ privilege: 9 }), true, 'Kugou privilege>=9 must require VIP');

  const accountA = { userid: '10001', token: 'fixture-token-A', playbackReady: true };
  const accountARepeat = { userid: '10001', token: 'fixture-token-A', playbackReady: true };
  const accountB = { userid: '10002', token: 'fixture-token-B', playbackReady: true };
  const accountAReauthorized = { userid: '10001', token: 'fixture-token-C', playbackReady: true };
  const scopeA = cacheScope(accountA);
  assert(scopeA, 'Kugou authenticated cache scope must not be empty');
  assert.strictEqual(scopeA, cacheScope(accountARepeat), 'Kugou cache scope must be stable for one session');
  assert.notStrictEqual(scopeA, cacheScope(accountB), 'Kugou cache scope must separate users');
  assert.notStrictEqual(scopeA, cacheScope(accountAReauthorized), 'Kugou cache scope must separate refreshed tokens');
  assert(!scopeA.includes(accountA.token), 'Kugou cache scope must not expose the raw token');

  assert.strictEqual(effectiveQuality('hires', { isVip: false, isSvip: false }), 'standard');
  assert.strictEqual(effectiveQuality('hires', {
    membershipKnown: true,
    membershipVerified: true,
    playbackReady: true,
    isVip: true,
    isSvip: false,
    expiresAt: activeExpiry,
  }), 'lossless');
  assert.strictEqual(effectiveQuality('hires', {
    membershipKnown: true,
    membershipVerified: true,
    playbackReady: true,
    isVip: true,
    isSvip: true,
    expiresAt: activeExpiry,
  }), 'hires');
  assert.strictEqual(
    membershipRights({
      membershipKnown: true,
      membershipVerified: true,
      playbackReady: true,
      isVip: true,
      isSvip: false,
      expiresAt: activeExpiry,
    }).maxQuality,
    'lossless',
    'Kugou VIP must not silently receive SVIP-only Hi-Res rights'
  );
  assert.strictEqual(
    membershipRights({
      membershipKnown: true,
      membershipVerified: true,
      playbackReady: true,
      isVip: true,
      isSvip: true,
      expiresAt: activeExpiry,
    }).maxQuality,
    'hires',
    'Kugou SVIP must retain its higher quality tier'
  );
}

async function testKugouWebRoleInfoFlow() {
  const cookie = [
    'userid=72001',
    'KuGoo=KugooID%3D72001%26NickName%3DWebOnly%26Pic%3Dhttps%253A%252F%252Favatar.example%252Fkugou.png',
  ].join('; ');
  const paths = [];
  await withHttpsMock(({ url, options }) => {
    const parsed = new URL(url);
    paths.push(parsed.pathname);
    assert.strictEqual(
      parsed.hostname,
      'vip.kugou.com',
      'web-only Kugou membership must use the official VIP host'
    );
    assert.strictEqual(
      parsed.pathname,
      '/recharge/roleinfo',
      'web-only Kugou membership must use the official roleinfo endpoint'
    );
    assert(
      String(options.headers && (options.headers.Cookie || options.headers.cookie) || '').includes('userid=72001'),
      'official roleinfo request must carry the current Kugou cookie'
    );
    assert.strictEqual(
      String(options.headers && (
        options.headers['X-Requested-With'] ||
        options.headers['x-requested-with']
      ) || ''),
      'XMLHttpRequest',
      'official roleinfo request must identify itself as an XMLHttpRequest'
    );
    return {
      body: {
        status: 1,
        data: {
          role: 1,
          producttype: 1,
          rawVipEndTime: '2099-12-31 23:59:59',
        },
      },
    };
  }, async () => {
    const status = await kugou.getKugouLoginInfo(cookie);
    assert.strictEqual(status.loggedIn, true, 'a web cookie session must remain logged in');
    assert.strictEqual(status.playbackReady, false, 'a web-only session must not pretend to have a playback token');
    assert.strictEqual(status.isVip, true, 'official roleinfo may display the verified VIP badge');
    assert.strictEqual(status.vipLevel, 'vip', 'role 1 must display the VIP tier');
    assert.strictEqual(status.membershipKnown, true, 'official roleinfo must produce a known membership state');
    assert.strictEqual(status.membershipVerified, true, 'official roleinfo must verify displayed membership');
    assert.strictEqual(
      status.membershipSource,
      'kugou-web-roleinfo',
      'official roleinfo must remain source-labelled'
    );
    assert.strictEqual(
      status.membershipRights.canPlayVipTracks,
      false,
      'a web-only badge must not grant playback without a playback token'
    );
    assert.strictEqual(
      status.membershipRights.maxQuality,
      'standard',
      'a web-only badge must not grant paid audio quality'
    );
  });
  assert.deepStrictEqual(paths, ['/recharge/roleinfo'], 'known web membership must short-circuit gateway probes');
}

async function testKugouSessionCacheInvalidation() {
  const cookie = [
    'userid=72002',
    'token=roleinfo-cache-token',
    'kg_mid=roleinfo-cache-mid',
    'KuGoo=KugooID%3D72002%26NickName%3DCacheUser%26Pic%3Dhttps%253A%252F%252Favatar.example%252Fcache.png',
  ].join('; ');
  let roleInfoRequests = 0;
  kugou.clearKugouSessionCaches();
  await withHttpsMock(({ url }) => {
    const parsed = new URL(url);
    if (!isKugouWebRoleInfoEndpoint(parsed.pathname)) {
      throw new Error('Unexpected request while checking Kugou membership cache: ' + parsed.pathname);
    }
    roleInfoRequests += 1;
    return {
      body: {
        status: 1,
        data: { role: 1, rawVipEndTime: '2099-12-31 23:59:59' },
      },
    };
  }, async () => {
    assert.strictEqual((await kugou.getKugouLoginInfo(cookie)).isVip, true);
    assert.strictEqual((await kugou.getKugouLoginInfo(cookie)).isVip, true);
    assert.strictEqual(roleInfoRequests, 1, 'one session should reuse its bounded roleinfo cache');
    kugou.clearKugouSessionCaches();
    assert.strictEqual((await kugou.getKugouLoginInfo(cookie)).isVip, true);
  });
  assert.strictEqual(
    roleInfoRequests,
    2,
    'clearing or replacing the Kugou session must force a fresh official membership probe'
  );
}

async function testKugouPlaybackEntitlementBoundary() {
  const ordinaryCookie = 'userid=71001; token=ordinary-fixture-token; kg_mid=ordinary-mid';
  let ordinaryPlaybackRequests = 0;
  await withHttpsMock(({ url }) => {
    const parsed = new URL(url);
    if (isKugouWebRoleInfoEndpoint(parsed.pathname)) return unknownKugouWebRoleInfo();
    if (isKugouMembershipEndpoint(parsed.pathname)) {
      return { body: { status: 1, data: { userid: '71001', is_vip: false, vip_type: 0, is_svip: false, svip_type: 0 } } };
    }
    ordinaryPlaybackRequests += 1;
    throw new Error('ordinary member-track request reached playback upstream: ' + parsed.pathname);
  }, async () => {
    const result = await kugou.handleKugouSongUrl({
      hash: 'ordinary-vip-track-hash',
      vipRequired: true,
      privilege: 10,
      fee: 1,
      quality: 'lossless',
    }, ordinaryCookie);
    assert.strictEqual(result.playable, false, 'ordinary Kugou account must not play a member track');
    assert.strictEqual(result.reason, 'vip_required', 'ordinary Kugou member track must return vip_required');
    assert.strictEqual(result.url || '', '', 'ordinary Kugou member response must not expose a URL');
    assert.strictEqual(result.vipLevel, 'none', 'ordinary Kugou account must stay non-VIP');
  });
  assert.strictEqual(ordinaryPlaybackRequests, 0, 'ordinary member track must be blocked before URL resolution');

  const freeCookie = 'userid=71002; token=free-fixture-token; kg_mid=free-mid';
  let freeQuality = '';
  let freePart = '';
  await withHttpsMock(({ url }) => {
    const parsed = new URL(url);
    if (isKugouWebRoleInfoEndpoint(parsed.pathname)) return unknownKugouWebRoleInfo();
    if (isKugouMembershipEndpoint(parsed.pathname)) {
      return { body: { status: 1, data: { userid: '71002', is_vip: false, vip_type: 0 } } };
    }
    if (parsed.pathname === '/v5/url') {
      freeQuality = parsed.searchParams.get('quality') || '';
      freePart = parsed.searchParams.get('IsFreePart') || '';
      return { body: { status: 1, url: 'https://media.example/kugou-free-standard.mp3' } };
    }
    throw new Error('Unexpected Kugou free-track request: ' + parsed.pathname);
  }, async () => {
    const result = await kugou.handleKugouSongUrl({
      hash: 'ordinary-free-track-hash',
      quality: 'lossless',
      vipRequired: false,
      privilege: 0,
      fee: 0,
    }, freeCookie);
    assert.strictEqual(result.playable, true, 'ordinary Kugou account must still play free tracks');
    assert.strictEqual(result.level, 'standard', 'ordinary Kugou account must be limited to standard quality');
    assert.strictEqual(result.qualityDowngraded, true, 'ordinary premium request must report a quality downgrade');
    assert.strictEqual(result.vipLevel, 'none', 'free-track playback must not promote account membership');
  });
  assert.strictEqual(freeQuality, '128', 'ordinary Kugou H5 playback must request standard quality');
  assert.strictEqual(freePart, '1', 'ordinary Kugou H5 playback must request the free-part entitlement mode');

  const vipCookie = 'userid=71003; token=vip-fixture-token; kg_mid=vip-mid';
  let vipQuality = '';
  let vipFreePart = '';
  await withHttpsMock(({ url }) => {
    const parsed = new URL(url);
    if (isKugouWebRoleInfoEndpoint(parsed.pathname)) return unknownKugouWebRoleInfo();
    if (parsed.pathname === '/v1/get_union_vip') {
      return { body: { status: 1, data: { userid: '71003', is_vip: true, vip_type: 1, vip_end_time: 4102444800 } } };
    }
    if (parsed.pathname === '/v5/url') {
      vipQuality = parsed.searchParams.get('quality') || '';
      vipFreePart = parsed.searchParams.get('IsFreePart') || '';
      return { body: { status: 1, url: 'https://media.example/kugou-vip-lossless.flac' } };
    }
    throw new Error('Unexpected Kugou VIP-track request: ' + parsed.pathname);
  }, async () => {
    const result = await kugou.handleKugouSongUrl({
      hash: 'verified-vip-track-hash',
      sqHash: 'verified-vip-lossless-hash',
      quality: 'lossless',
      vipRequired: true,
      privilege: 10,
      fee: 1,
    }, vipCookie);
    assert.strictEqual(result.playable, true, 'verified Kugou VIP must retain member-track playback');
    assert.strictEqual(result.level, 'lossless', 'verified Kugou VIP must retain requested premium quality');
    assert.strictEqual(result.isVip, true, 'verified Kugou VIP must remain VIP');
    assert.strictEqual(result.vipLevel, 'vip', 'verified Kugou VIP level must be preserved');
  });
  assert.strictEqual(vipQuality, 'flac', 'verified Kugou VIP must retain the requested lossless quality');
  assert.strictEqual(vipFreePart, '0', 'verified Kugou VIP may request the full entitlement mode');

  const musicPackageCookie = 'userid=71006; token=music-package-token; kg_mid=music-package-mid';
  let musicPackageFreePart = '';
  await withHttpsMock(({ url }) => {
    const parsed = new URL(url);
    if (isKugouWebRoleInfoEndpoint(parsed.pathname)) {
      return {
        body: {
          status: 1,
          data: {
            role: 31,
            musicEndTime: '2099-12-31 23:59:59',
          },
        },
      };
    }
    if (parsed.pathname === '/v5/url') {
      musicPackageFreePart = parsed.searchParams.get('IsFreePart') || '';
      return { body: { status: 1, url: 'https://media.example/kugou-music-package.mp3' } };
    }
    throw new Error('Unexpected Kugou music-package request: ' + parsed.pathname);
  }, async () => {
    const result = await kugou.handleKugouSongUrl({
      hash: 'music-package-track-hash',
      quality: 'standard',
      vipRequired: true,
      privilege: 10,
      fee: 1,
    }, musicPackageCookie);
    assert.strictEqual(result.playable, true, 'a verified music package may ask the official URL endpoint for a covered track');
    assert.strictEqual(result.vipLevel, 'none', 'a music package must not be mislabeled as Kugou VIP');
    assert.strictEqual(result.hasMusicPackage, true, 'the independent music-package identity must be preserved');
    assert.strictEqual(result.level, 'standard', 'a music package must not silently receive VIP lossless quality');
  });
  assert.strictEqual(musicPackageFreePart, '0', 'a verified music package may request the full covered-song response');

  const fallbackCookie = 'userid=71004; token=fallback-vip-token; kg_mid=fallback-vip-mid; KuGoo=KugooID%3D71004%26NickName%3DVIP';
  const membershipPaths = [];
  await withHttpsMock(({ url }) => {
    const parsed = new URL(url);
    membershipPaths.push(parsed.pathname);
    if (isKugouWebRoleInfoEndpoint(parsed.pathname)) return unknownKugouWebRoleInfo();
    if (parsed.pathname === '/v1/get_union_vip') {
      return { body: { status: 1, data: {} } };
    }
    if (parsed.pathname === '/v1/vipuser_sub') {
      return {
        body: {
          status: 1,
          data: { userid: '71004', is_vip: true, vip_type: 1, vip_end_time: 4102444800 },
        },
      };
    }
    return { body: { status: 1, data: {} } };
  }, async () => {
    const status = await kugou.getKugouLoginInfo(fallbackCookie);
    assert.strictEqual(status.isVip, true, 'Kugou must keep probing after an unknown first VIP endpoint');
    assert.strictEqual(status.membershipSource, 'kugou-vip-api', 'later official VIP evidence must be authoritative');
  });
  const membershipProbePaths = membershipPaths.filter(pathname =>
    isKugouWebRoleInfoEndpoint(pathname) || isKugouMembershipEndpoint(pathname)
  );
  assert.strictEqual(
    membershipProbePaths[0],
    '/recharge/roleinfo',
    'Kugou must probe the official web roleinfo endpoint before gateway fallbacks'
  );
  assert(membershipPaths.includes('/v1/get_union_vip'), 'Kugou must try the primary VIP endpoint');
  assert(membershipPaths.includes('/v1/vipuser_sub'), 'Kugou must continue after an unknown primary response');

  const primaryNegativeCookie = 'userid=71005; token=primary-negative-vip-token; kg_mid=primary-negative-vip-mid; KuGoo=KugooID%3D71005%26NickName%3DVIP';
  const primaryNegativePaths = [];
  await withHttpsMock(({ url }) => {
    const parsed = new URL(url);
    primaryNegativePaths.push(parsed.pathname);
    if (isKugouWebRoleInfoEndpoint(parsed.pathname)) return unknownKugouWebRoleInfo();
    if (parsed.pathname === '/v1/get_union_vip') {
      return { body: { status: 1, data: { userid: '71005', is_vip: false, vip_type: 0 } } };
    }
    if (parsed.pathname === '/kugouvip/v2/batch_union_vipinfo') {
      return {
        body: {
          status: 1,
          data: { userid: '71005', is_vip: true, vip_type: 1, vip_end_time: 4102444800 },
        },
      };
    }
    return { body: { status: 1, data: {} } };
  }, async () => {
    const status = await kugou.getKugouLoginInfo(primaryNegativeCookie);
    assert.strictEqual(status.isVip, true, 'one stale ordinary endpoint must not hide a later verified Kugou VIP result');
    assert.strictEqual(status.membershipVerified, true, 'later official VIP evidence must remain verified');
    assert.strictEqual(status.membershipRights.maxQuality, 'lossless', 'Kugou VIP and SVIP quality rights must remain distinct');
  });
  assert(primaryNegativePaths.includes('/kugouvip/v2/batch_union_vipinfo'), 'Kugou must continue after a primary ordinary response');
}

function testQishuiMembershipNormalization() {
  const membershipFromData = requireTestFunction(qishui, 'qishuiMembershipFromData', 'Qishui');
  const trackRequiresVip = requireTestFunction(qishui, 'qishuiTrackRequiresVip', 'Qishui');

  [
    {
      is_vip: false,
      is_svip: false,
      vip_type: 0,
      svip_type: 0,
      vip_level: 0,
      member_level: 0,
    },
    {
      vip: {},
      svip: {},
      member: {},
      membership: {},
      vip_status: {},
    },
  ].forEach((fixture, index) => {
    assertNoMembership(membershipFromData(fixture), `Qishui false/field-only fixture ${index + 1}`);
  });

  assertVipMembership(
    membershipFromData({ is_vip: true }),
    'Qishui explicit is_vip=true'
  );
  assertVipMembership(
    membershipFromData({ member_level: 1 }),
    'Qishui explicit member_level=1'
  );

  assert.strictEqual(trackRequiresVip({
    is_vip: false,
    need_vip: false,
    only_vip_playable: false,
    fee: 0,
    privilege: 0,
  }), false, 'Qishui false/zero track flags must stay free');
  assert.strictEqual(trackRequiresVip({ is_vip: true }), true, 'Qishui is_vip=true must require VIP');
  assert.strictEqual(trackRequiresVip({ need_vip: 1 }), true, 'Qishui need_vip=1 must require VIP');
  assert.strictEqual(trackRequiresVip({ fee: 1 }), true, 'Qishui fee=1 must require VIP');
}

async function testQishuiPlaybackEntitlementBoundary() {
  const cookie = 'sessionid=fixture-session; sid_tt=fixture-sid; uid_tt=fixture-user';
  const restrictedUrl = 'https://media.example/restricted-member-track.m4a?secret=must-not-leak';
  let restrictedRequests = 0;

  await withHttpsMock(({ url, options }) => {
    const parsed = new URL(url);
    assert.strictEqual(parsed.hostname, 'api.qishui.com', 'VIP-track test must not contact an unexpected host');
    assert.strictEqual(parsed.pathname, '/luna/pc/track_v2', 'VIP-track test must only use track_v2');
    assert.strictEqual(options.method, 'POST', 'VIP-track test should resolve the primary POST fixture');
    restrictedRequests += 1;
    return {
      body: qishuiTrackPayload('entitlement-vip-track', true, restrictedUrl),
    };
  }, async () => {
    const result = await qishui.handleQishuiSongUrl({
      id: 'entitlement-vip-track',
      vipRequired: true,
      fee: 1,
      privilege: 10,
    }, cookie);
    const category = result && (
      result.reason ||
      result.category ||
      (result.restriction && (result.restriction.category || result.restriction.reason))
    );
    assert.strictEqual(category, 'vip_required', 'ordinary Qishui account must receive vip_required');
    assert.strictEqual(result.playable, false, 'ordinary Qishui account must not play a VIP track');
    assert.strictEqual(result.url || '', '', 'ordinary Qishui account response must not expose a VIP media URL');
    assert(!JSON.stringify(result).includes(restrictedUrl), 'VIP media URL must not leak through diagnostics or nested fields');
  });
  assert.strictEqual(restrictedRequests, 1, 'VIP-track guard must not retry through a URL-leaking fallback');

  const freeUrl = 'https://media.example/free-track.m4a?fixture=1';
  let freeRequests = 0;
  await withHttpsMock(({ url, options }) => {
    const parsed = new URL(url);
    assert.strictEqual(parsed.hostname, 'api.qishui.com', 'free-track test must not contact an unexpected host');
    assert.strictEqual(parsed.pathname, '/luna/pc/track_v2', 'free-track test must only use track_v2');
    assert.strictEqual(options.method, 'POST', 'free-track test should resolve the primary POST fixture');
    freeRequests += 1;
    return {
      body: qishuiTrackPayload('entitlement-free-track', false, freeUrl),
    };
  }, async () => {
    const result = await qishui.handleQishuiSongUrl({
      id: 'entitlement-free-track',
      vipRequired: false,
      fee: 0,
      privilege: 0,
    }, cookie);
    assert.strictEqual(result.playable, true, 'ordinary Qishui account must still play a free track');
    assert.strictEqual(result.url, freeUrl, 'free Qishui track must retain its resolved media URL');
    assert.notStrictEqual(result.reason, 'vip_required', 'free Qishui track must not be mislabeled as VIP-only');
  });
  assert.strictEqual(freeRequests, 1, 'free-track playback should resolve in one primary request');
}

async function main() {
  testKugouMembershipNormalization();
  testKugouPlaybackBoundaries();
  await testKugouWebRoleInfoFlow();
  await testKugouSessionCacheInvalidation();
  await testKugouPlaybackEntitlementBoundary();
  testQishuiMembershipNormalization();
  await testQishuiPlaybackEntitlementBoundary();
  console.log('[OK] Provider entitlement boundaries reject false VIP signals and protect restricted URLs.');
}

main().catch(error => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
