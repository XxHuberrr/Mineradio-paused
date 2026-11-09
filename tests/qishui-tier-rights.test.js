'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const qishui = require('../qishui-api');

const api = qishui._test;

function membership(level, expiresAt) {
  const isSvip = level === 'svip';
  const isVip = isSvip || level === 'vip';
  return {
    membershipKnown: level !== 'unknown',
    membershipStatus: level,
    vipType: isVip ? 1 : 0,
    vipLevel: level,
    isVip,
    isSvip,
    vipLabel: isSvip ? 'SVIP' : (isVip ? 'VIP' : '无VIP'),
    expiresAt: Number(expiresAt) || 0,
  };
}

test.beforeEach(() => {
  api.clearQishuiRuntimeCaches();
});

test('VIP may use lossless but cannot use Hi-Res reserved for explicit SVIP', () => {
  const vip = membership('vip');
  const svip = membership('svip');
  const lossless = {
    url: 'https://media.example/lossless.flac',
    quality: 'lossless',
    format: 'flac',
    bitrate: 999000,
  };
  const hires = {
    url: 'https://media.example/hires.flac',
    quality: 'hi_res',
    format: 'flac',
    bitrate: 1800000,
  };

  assert.equal(api.qishuiStreamRequiredTier(lossless), 'vip');
  assert.equal(api.qishuiStreamRequiredTier(hires), 'svip');
  assert.equal(api.qishuiStreamAllowedForMembership(lossless, vip), true);
  assert.equal(api.qishuiStreamAllowedForMembership(hires, vip), false);
  assert.equal(api.qishuiStreamAllowedForMembership(hires, svip), true);
});

test('unknown membership never grants a premium stream', () => {
  const unknown = membership('unknown');
  const standard = {
    url: 'https://media.example/standard.m4a',
    quality: 'standard',
    format: 'm4a',
    bitrate: 128000,
  };
  const lossless = {
    url: 'https://media.example/lossless.flac',
    quality: 'lossless',
    format: 'flac',
    bitrate: 999000,
  };

  assert.equal(api.qishuiMembershipTier(unknown), 'unknown');
  assert.equal(api.qishuiStreamAllowedForMembership(standard, unknown), true);
  assert.equal(api.qishuiStreamAllowedForMembership(lossless, unknown), false);
  assert.equal(api.qishuiRequiredTierAllowed('svip', unknown), false);
});

test('SVIP-only track flags are normalized and gated independently from VIP', () => {
  const restriction = api.qishuiTrackPlaybackRestriction({
    track: {
      only_svip_playable: true,
      svip_required: 1,
    },
  });

  assert.equal(restriction.vipRequired, true);
  assert.equal(restriction.svipRequired, true);
  assert.equal(restriction.requiredTier, 'svip');
  assert.equal(api.qishuiRequiredTierAllowed(restriction.requiredTier, membership('vip')), false);
  assert.equal(api.qishuiRequiredTierAllowed(restriction.requiredTier, membership('svip')), true);
});

test('VIP and SVIP expiry fields are evaluated independently', () => {
  const now = Date.now();
  const vipExpiresAt = now + 60 * 60 * 1000;
  const svipExpiresAt = now + 2 * 60 * 60 * 1000;

  const activeVipWithExpiredSvip = api.qishuiMembershipFromData({
    is_vip: true,
    vip_type: 1,
    vip_end_time: Math.floor(vipExpiresAt / 1000),
    is_svip: false,
    svip_type: 0,
    svip_end_time: Math.floor((now - 60 * 1000) / 1000),
  });
  assert.equal(activeVipWithExpiredSvip.membershipKnown, true);
  assert.equal(activeVipWithExpiredSvip.isVip, true);
  assert.equal(activeVipWithExpiredSvip.isSvip, false);
  assert.equal(activeVipWithExpiredSvip.vipLevel, 'vip');
  assert(activeVipWithExpiredSvip.expiresAt > now);

  const activeVipWithZeroSvipExpiry = api.qishuiMembershipFromData({
    is_vip: true,
    vip_type: 1,
    vip_end_time: Math.floor(vipExpiresAt / 1000),
    is_svip: false,
    svip_type: 0,
    svip_end_time: 0,
  });
  assert.equal(activeVipWithZeroSvipExpiry.isVip, true);
  assert.equal(activeVipWithZeroSvipExpiry.isSvip, false);
  assert.equal(activeVipWithZeroSvipExpiry.vipLevel, 'vip');

  const activeSvipWithExpiredVip = api.qishuiMembershipFromData({
    is_vip: false,
    vip_type: 0,
    vip_end_time: Math.floor((now - 60 * 1000) / 1000),
    is_svip: true,
    svip_type: 1,
    svip_end_time: Math.floor(svipExpiresAt / 1000),
  });
  assert.equal(activeSvipWithExpiredVip.membershipKnown, true);
  assert.equal(activeSvipWithExpiredVip.isVip, true, 'SVIP must imply the base VIP entitlement');
  assert.equal(activeSvipWithExpiredVip.isSvip, true);
  assert.equal(activeSvipWithExpiredVip.vipLevel, 'svip');
  assert(activeSvipWithExpiredVip.expiresAt > now);
});

test('a same-cookie official positive survives only a short immediate outage', () => {
  const now = 1_000_000;
  const key = 'membership|fixture-positive';
  const positive = api.qishuiApplyMembershipObservation(
    key,
    membership('vip', now + 60_000),
    now
  );
  const retained = api.qishuiApplyMembershipObservation(
    key,
    api.qishuiUnknownMembership('temporary outage'),
    now + 1000
  );
  const afterGrace = api.qishuiApplyMembershipObservation(
    key,
    api.qishuiUnknownMembership('still unavailable'),
    now + 21_000
  );

  assert.equal(positive.isVip, true);
  assert.equal(retained.membershipKnown, true);
  assert.equal(retained.isVip, true);
  assert.equal(retained.retainedOfficialPositive, true);
  assert.equal(afterGrace.membershipKnown, false);
  assert.equal(afterGrace.reason, 'membership_unknown');
});

test('unknown without positive history is not converted to an ordinary account', () => {
  const unknown = api.qishuiApplyMembershipObservation(
    'membership|fixture-no-history',
    api.qishuiUnknownMembership('offline'),
    2_000_000
  );

  assert.equal(unknown.membershipKnown, false);
  assert.equal(unknown.membershipStatus, 'unknown');
  assert.equal(unknown.vipLevel, 'unknown');
  assert.equal(unknown.reason, 'membership_unknown');
  assert.equal(api.qishuiMembershipCacheTtlMs(unknown, 2_000_000), 1);
});

test('an official positive is never retained beyond its expiry', () => {
  const now = 3_000_000;
  const expiresAt = now + 3000;
  const key = 'membership|fixture-expiry';
  api.qishuiApplyMembershipObservation(key, membership('svip', expiresAt), now);

  const beforeExpiry = api.qishuiApplyMembershipObservation(
    key,
    api.qishuiUnknownMembership('temporary outage'),
    now + 1000
  );
  const afterExpiry = api.qishuiApplyMembershipObservation(
    key,
    api.qishuiUnknownMembership('temporary outage'),
    expiresAt
  );

  assert.equal(beforeExpiry.isSvip, true);
  assert.equal(afterExpiry.membershipKnown, false);
  assert.equal(afterExpiry.isVip, false);
  assert.equal(afterExpiry.isSvip, false);
  assert.equal(afterExpiry.reason, 'membership_unknown');
});
