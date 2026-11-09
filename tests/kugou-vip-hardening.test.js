'use strict';

const assert = require('assert');
const kugou = require('../kugou-api');

const {
  extractKugouAuth,
  normalizeKugouVipPayloadV2,
  kugouMembershipRights,
  kugouEffectiveQuality,
  kugouVipCacheKey,
  stabilizeKugouVipProbe,
  kugouMembershipTime,
  normalizeKugouWebRoleInfoPayload,
} = kugou._test;

function testCookieVipIsOnlyAPendingHint() {
  const auth = extractKugouAuth(
    'userid=9001; token=token-for-9001; kg_mid=mid-9001; kg_dfid=dfid-9001; vip_type=1'
  );
  const membership = normalizeKugouVipPayloadV2({ __kugouMembershipUnknown: true }, auth);
  const rights = kugouMembershipRights(membership);

  assert.strictEqual(membership.isVip, false, 'cookie VIP cannot become an account VIP without official verification');
  assert.strictEqual(membership.membershipKnown, false, 'cookie fields cannot finalize account membership');
  assert.strictEqual(membership.membershipHintLevel, 'vip', 'the UI may retain a pending VIP hint');
  assert.strictEqual(membership.membershipVerified, false, 'cookie VIP is not official verification');
  assert.strictEqual(rights.level, 'none', 'unverified hints must not render as confirmed VIP');
  assert.strictEqual(rights.canPlayVipTracks, false, 'unverified cookie VIP cannot unlock VIP playback');
  assert.strictEqual(rights.canPlaySvipTracks, false, 'unverified cookie VIP cannot unlock SVIP playback');
  assert.strictEqual(rights.maxQuality, 'standard', 'unverified cookie VIP cannot unlock paid quality');
  assert.strictEqual(
    kugouMembershipRights({
      membershipVerified: true,
      isVip: true,
      vipLevel: 'vip',
    }).canPlayVipTracks,
    false,
    'missing playback readiness must fail closed'
  );
  assert.strictEqual(
    kugouEffectiveQuality('hires', membership),
    'standard',
    'quality selection must follow verified rights'
  );
}

function testVipCacheUsesTheCompleteIdentity() {
  const common = { userid: '9001', mid: 'mid-9001', dfid: 'dfid-9001' };
  const tokenA = 'prefix-A-with-the-same-tail-1234567890';
  const tokenB = 'prefix-B-with-the-same-tail-1234567890';

  assert.notStrictEqual(
    kugouVipCacheKey({ ...common, token: tokenA }),
    kugouVipCacheKey({ ...common, token: tokenB }),
    'tokens with the same final characters must not share VIP cache entries'
  );
  assert.notStrictEqual(
    kugouVipCacheKey({ ...common, token: tokenA }),
    kugouVipCacheKey({ ...common, token: tokenA, mid: 'other-mid' }),
    'MID changes must isolate VIP cache entries'
  );
  assert.match(
    kugouVipCacheKey({ ...common, token: tokenA }),
    /^vip\|[a-f0-9]{64}$/,
    'VIP cache key must be a full SHA-256 identity digest'
  );
}

function testBatchResponsesStayInsideTheRequestedAccount() {
  const membership = normalizeKugouVipPayloadV2({
    data: {
      9001: { is_vip: false, vip_type: 0, is_svip: false, svip_type: 0 },
      9002: { is_vip: true, vip_type: 1, vip_end_time: 4102444800 },
    },
  }, { userid: '9001' });
  assert.strictEqual(membership.membershipVerified, true);
  assert.strictEqual(membership.isVip, false, 'another map-keyed account must not promote the requested account');

  const activeWithExpiredHistory = normalizeKugouVipPayloadV2({
    data: {
      userid: '9001',
      current: { vip_type: 1 },
      history: { vip_type: 1, vip_end_time: 946684800 },
    },
  }, { userid: '9001' });
  assert.strictEqual(
    activeWithExpiredHistory.isVip,
    true,
    'an independent expired history record must not cancel a current active entitlement record'
  );
}

function testWebRoleInfoIsSourceScopedAndExpiryAware() {
  const webPayload = data => ({
    __kugouMembershipOrigin: 'kugou-web-roleinfo',
    data,
  });
  const futureExpiry = '2099-12-31 23:59:59';

  [
    { role: 1, level: 'vip' },
    { role: 2, level: 'vip' },
    { role: 6, level: 'svip' },
    { role: 11, level: 'svip' },
    { role: 13, level: 'svip' },
  ].forEach(({ role, level }) => {
    const membership = normalizeKugouVipPayloadV2(webPayload({
      role,
      producttype: 1,
      rawVipEndTime: futureExpiry,
    }), {});
    assert.strictEqual(membership.membershipKnown, true, `web role ${role} must be authoritative`);
    assert.strictEqual(membership.membershipVerified, true, `web role ${role} must be verified`);
    assert.strictEqual(membership.vipLevel, level, `web role ${role} must map to ${level}`);
    assert.strictEqual(membership.isVip, true, `web role ${role} must expose VIP identity`);
    assert.strictEqual(
      membership.isSvip,
      level === 'svip',
      `web role ${role} must preserve the VIP/SVIP distinction`
    );
    assert(
      Number(membership.expiresAt) > Date.now(),
      `web role ${role} must parse rawVipEndTime as a future expiry`
    );
  });

  [31, 33].forEach(role => {
    const membership = normalizeKugouVipPayloadV2(webPayload({
      role,
      producttype: 1,
      vip_type: 1,
      is_vip: true,
      rawVipEndTime: futureExpiry,
    }), {});
    assert.strictEqual(membership.membershipKnown, true, `music-package role ${role} must be known`);
    assert.strictEqual(membership.isVip, false, `music-package role ${role} must not become Kugou VIP`);
    assert.strictEqual(membership.isSvip, false, `music-package role ${role} must not become Kugou SVIP`);
    assert.strictEqual(membership.vipLevel, 'none', `music-package role ${role} must keep a non-VIP badge`);
    assert.strictEqual(
      kugouMembershipRights(membership).canPlayVipTracks,
      false,
      `music-package role ${role} must not unlock generic VIP playback`
    );
  });

  const ordinary = normalizeKugouVipPayloadV2(webPayload({
    role: 0,
    producttype: 0,
    usertype: 0,
    userytype: 0,
    ytype: 0,
  }), {});
  assert.strictEqual(ordinary.membershipKnown, true, 'an explicit web ordinary response must be known');
  assert.strictEqual(ordinary.isVip, false, 'an explicit web ordinary response must stay ordinary');

  const expired = normalizeKugouVipPayloadV2(webPayload({
    role: 1,
    producttype: 1,
    rawVipEndTime: '2000-01-01 00:00:00',
  }), {});
  assert.strictEqual(expired.membershipKnown, true, 'an expired web role remains an authoritative result');
  assert.strictEqual(expired.isVip, false, 'an expired rawVipEndTime must not authorize VIP');
  assert.strictEqual(
    kugouMembershipRights(expired).canPlayVipTracks,
    false,
    'an expired web role must not unlock paid playback'
  );

  const invalidExpiry = normalizeKugouVipPayloadV2(webPayload({
    role: 1,
    rawVipEndTime: 'not-a-date',
  }), {});
  assert.strictEqual(invalidExpiry.membershipKnown, true, 'an invalid expiry remains an authoritative response');
  assert.strictEqual(invalidExpiry.isVip, false, 'an invalid explicit expiry must fail closed');

  const timestampExpiry = normalizeKugouVipPayloadV2(webPayload({
    role: 2,
    rawVipEndTime: 4102444800,
  }), {});
  assert.strictEqual(timestampExpiry.isVip, true, 'a future Unix timestamp must remain supported');
  assert.strictEqual(timestampExpiry.expiresAt, 4102444800000, 'Unix seconds must normalize to milliseconds');
  assert.strictEqual(kugouMembershipTime('2099-12-31'), Date.parse('2099-12-31'));
  assert.strictEqual(kugouMembershipTime('invalid'), 0);

  const failedRoleInfo = normalizeKugouWebRoleInfoPayload({
    status: 0,
    role: 13,
    rawVipEndTime: futureExpiry,
  }, {});
  assert.strictEqual(
    normalizeKugouVipPayloadV2(failedRoleInfo, {}).membershipKnown,
    false,
    'a failed roleinfo response must not authorize a role even if it contains stale fields'
  );

  const otherAccount = normalizeKugouWebRoleInfoPayload({
    status: 1,
    data: {
      userid: '999002',
      role: 13,
      rawVipEndTime: futureExpiry,
    },
  }, { userid: '999001' });
  assert.strictEqual(
    normalizeKugouVipPayloadV2(otherAccount, { userid: '999001' }).membershipKnown,
    false,
    'roleinfo data for another account must not enter the current account state'
  );

  const untrustedRole = normalizeKugouVipPayloadV2({
    data: { role: 13, producttype: 1 },
  }, {});
  assert.strictEqual(
    untrustedRole.membershipKnown,
    false,
    'role fields from non-roleinfo endpoints must not become membership evidence'
  );
  assert.strictEqual(untrustedRole.isVip, false, 'an untrusted role field must not promote the account');
}

function testRecentOfficialPositiveSurvivesOnlyUnknownProbes() {
  const now = Date.now();
  const auth = { userid: '9010', token: 'verified-token', mid: 'verified-mid', dfid: 'verified-dfid' };
  const key = kugouVipCacheKey(auth);
  const verified = {
    data: {
      userid: '9010',
      is_vip: true,
      vip_type: 1,
      vip_end_time: Math.floor((now + 60 * 60 * 1000) / 1000),
    },
  };
  stabilizeKugouVipProbe(key, verified, auth, now);
  const stale = stabilizeKugouVipProbe(key, { __kugouMembershipUnknown: true }, auth, now + 1000);
  const staleMembership = normalizeKugouVipPayloadV2(stale, auth);
  assert.strictEqual(staleMembership.membershipStale, true);
  assert.strictEqual(staleMembership.vipLevel, 'vip', 'stale official identity may retain the VIP badge');
  assert.strictEqual(staleMembership.membershipVerified, false, 'stale identity is no longer current verification');
  assert.strictEqual(
    kugouMembershipRights(staleMembership).canPlayVipTracks,
    false,
    'stale official VIP identity must not authorize paid playback'
  );
  assert.strictEqual(
    kugouMembershipRights(staleMembership).maxQuality,
    'standard',
    'stale official VIP identity must not authorize paid quality'
  );
  assert.strictEqual(
    kugouEffectiveQuality('lossless', staleMembership),
    'standard',
    'stale official VIP identity must downgrade requested quality'
  );

  const ordinary = stabilizeKugouVipProbe(key, {
    data: { userid: '9010', is_vip: false, vip_type: 0, is_svip: false, svip_type: 0 },
  }, auth, now + 2000);
  assert.strictEqual(normalizeKugouVipPayloadV2(ordinary, auth).isVip, false);
  const afterOrdinary = stabilizeKugouVipProbe(key, { __kugouMembershipUnknown: true }, auth, now + 3000);
  assert.strictEqual(
    kugouMembershipRights(normalizeKugouVipPayloadV2(afterOrdinary, auth)).canPlayVipTracks,
    false,
    'an authoritative ordinary result must clear stale positive playback rights'
  );
}

function testStaleSvipNeverAuthorizesAndMissingExpiryIsNotRetained() {
  const now = Date.now();
  const svipAuth = { userid: '9011', token: 'svip-token', mid: 'svip-mid', dfid: 'svip-dfid' };
  const svipKey = kugouVipCacheKey(svipAuth);
  stabilizeKugouVipProbe(svipKey, {
    data: {
      userid: '9011',
      is_vip: true,
      vip_type: 1,
      is_svip: true,
      svip_type: 1,
      vip_end_time: Math.floor((now + 60 * 60 * 1000) / 1000),
      svip_end_time: Math.floor((now + 60 * 60 * 1000) / 1000),
    },
  }, svipAuth, now);
  const staleSvip = normalizeKugouVipPayloadV2(
    stabilizeKugouVipProbe(svipKey, { __kugouMembershipUnknown: true }, svipAuth, now + 1000),
    svipAuth
  );
  const staleSvipRights = kugouMembershipRights(staleSvip);
  assert.strictEqual(staleSvip.vipLevel, 'svip', 'stale official identity may retain the SVIP badge');
  assert.strictEqual(staleSvipRights.canPlayVipTracks, false, 'stale SVIP cannot authorize VIP playback');
  assert.strictEqual(staleSvipRights.canPlaySvipTracks, false, 'stale SVIP cannot authorize SVIP playback');
  assert.strictEqual(staleSvipRights.maxQuality, 'standard', 'stale SVIP cannot authorize Hi-Res quality');

  const noExpiryAuth = {
    userid: '9012',
    token: 'missing-expiry-token',
    mid: 'missing-expiry-mid',
    dfid: 'missing-expiry-dfid',
  };
  const noExpiryKey = kugouVipCacheKey(noExpiryAuth);
  const noExpiryPayload = {
    data: { userid: '9012', is_vip: true, vip_type: 1 },
  };
  const noExpiryMembership = normalizeKugouVipPayloadV2(
    stabilizeKugouVipProbe(noExpiryKey, noExpiryPayload, noExpiryAuth, now),
    noExpiryAuth
  );
  assert.strictEqual(noExpiryMembership.vipLevel, 'vip', 'fresh official VIP evidence remains visible without an expiry field');
  assert.strictEqual(
    kugouMembershipRights(Object.assign({}, noExpiryMembership, {
      playbackReady: true,
    })).canPlayVipTracks,
    true,
    'a fresh account-scoped official VIP response must authorize playback even when that endpoint omits expiry'
  );
  const unknownAfterNoExpiry = normalizeKugouVipPayloadV2(
    stabilizeKugouVipProbe(
      noExpiryKey,
      { __kugouMembershipUnknown: true },
      noExpiryAuth,
      now + 1000
    ),
    noExpiryAuth
  );
  assert.strictEqual(
    unknownAfterNoExpiry.membershipStale,
    false,
    'a positive without expiry must not be retained as stale official evidence'
  );
  assert.strictEqual(
    kugouMembershipRights(unknownAfterNoExpiry).canPlayVipTracks,
    false,
    'unknown probes must not revive a no-expiry positive'
  );
}

testCookieVipIsOnlyAPendingHint();
testVipCacheUsesTheCompleteIdentity();
testBatchResponsesStayInsideTheRequestedAccount();
testWebRoleInfoIsSourceScopedAndExpiryAware();
testRecentOfficialPositiveSurvivesOnlyUnknownProbes();
testStaleSvipNeverAuthorizesAndMissingExpiryIsNotRetained();

console.log('[OK] Kugou VIP hardening: web roles are source-scoped, expiry-aware, and cannot overgrant music-package accounts.');
