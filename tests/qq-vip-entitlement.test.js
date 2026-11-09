'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const qqVip = require('../qq-vip-api');

const ROOT = path.join(__dirname, '..');

function activeVipPayload(uin, expiresAt) {
  return {
    code: 0,
    req_1: {
      code: 0,
      data: {
        uin_map: {
          [String(uin)]: {
            vip_info: {
              is_vip: true,
              vip_type: 1,
              end_time: Math.floor(expiresAt / 1000),
            },
          },
        },
      },
    },
  };
}

function ordinaryPayload(uin) {
  return {
    code: 0,
    req_1: {
      code: 0,
      data: {
        uin_map: {
          [String(uin)]: {
            vip_info: {
              is_vip: false,
              vip_type: 0,
            },
          },
        },
      },
    },
  };
}

function testStrictMembershipNormalization() {
  const now = Date.now();
  const unknown = qqVip.normalizeQQVipPayload({ code: 0, data: {} });
  assert.strictEqual(unknown.decision, 'unknown');
  assert.strictEqual(unknown.resolved, false, 'empty response must not become an ordinary account');

  const textOnly = qqVip.normalizeQQVipPayload({
    code: 0,
    data: { vip_info: { label: 'VIP', title: 'Green Diamond' } },
  });
  assert.strictEqual(textOnly.decision, 'unknown', 'VIP-looking labels alone must not promote an account');

  const ordinary = qqVip.normalizeQQVipPayload(ordinaryPayload('10001'));
  assert.strictEqual(ordinary.decision, 'negative');
  assert.strictEqual(ordinary.isVip, false, 'explicit ordinary account must remain ordinary');

  const ordinaryWithFutureToken = qqVip.normalizeQQVipPayload({
    data: {
      vip_info: {
        is_vip: false,
        vip_type: 0,
        tokenEndTime: Math.floor((now + 24 * 60 * 60 * 1000) / 1000),
        accessTokenExpireTime: Math.floor((now + 24 * 60 * 60 * 1000) / 1000),
      },
    },
  });
  assert.strictEqual(ordinaryWithFutureToken.decision, 'negative');
  assert.strictEqual(ordinaryWithFutureToken.isVip, false, 'unrelated future token expiry must not reverse vipType:0');

  const expiryOnly = qqVip.normalizeQQVipPayload({
    data: { vip_info: { end_time: Math.floor((now + 60 * 60 * 1000) / 1000) } },
  });
  assert.strictEqual(expiryOnly.decision, 'unknown', 'membership expiry without a paired membership field is not positive evidence');

  const active = qqVip.normalizeQQVipPayload(activeVipPayload('10001', now + 60 * 60 * 1000));
  assert.strictEqual(active.decision, 'positive');
  assert.strictEqual(active.isVip, true, 'unexpired official VIP evidence must be retained');
  assert(active.expiresAt > now, 'active VIP must retain its expiration boundary');

  const liveVipQueryV2 = qqVip.normalizeQQVipPayload({
    code: 0,
    req_1: {
      code: 0,
      data: {
        infoMap: {
          10001: {
            iVipFlag: 1,
            iNewVip: 1,
            iSuperVip: 1,
            iNewSuperVip: 1,
            superEndTime: new Date(now + 60 * 60 * 1000).toISOString(),
            AdVipFlag: 0,
            HugeVip: 0,
          },
        },
      },
    },
  }, {}, { now, expectedUin: '10001' });
  assert.strictEqual(liveVipQueryV2.decision, 'positive', 'current VipQueryServer_V2 legacy flags must be recognized');
  assert.strictEqual(liveVipQueryV2.isVip, true);
  assert.strictEqual(liveVipQueryV2.isSvip, true, 'iSuperVip/iNewSuperVip must retain the QQ SVIP tier');
  assert.strictEqual(liveVipQueryV2.vipLevel, 'svip');
  assert(liveVipQueryV2.expiresAt > now, 'superEndTime must bound the active QQ SVIP entitlement');

  const expired = qqVip.normalizeQQVipPayload(activeVipPayload('10001', now - 60 * 1000));
  assert.strictEqual(expired.decision, 'negative');
  assert.strictEqual(expired.isVip, false, 'expired membership must not remain active');

  const vipExpiresAt = now + 60 * 60 * 1000;
  const svipExpiresAt = now - 60 * 1000;
  const activeVipExpiredSvip = qqVip.normalizeQQVipPayload({
    code: 0,
    data: {
      membership_info: {
        vip_status: 1,
        vip_type: 1,
        vip_end_time: Math.floor(vipExpiresAt / 1000),
        svip_status: 1,
        svip_type: 2,
        svip_end_time: Math.floor(svipExpiresAt / 1000),
      },
    },
  }, {}, { now });
  assert.strictEqual(activeVipExpiredSvip.decision, 'positive');
  assert.strictEqual(activeVipExpiredSvip.isVip, true, 'active regular VIP must survive an expired SVIP tier');
  assert.strictEqual(activeVipExpiredSvip.isSvip, false, 'expired SVIP must not promote an otherwise active VIP account');
  assert.strictEqual(activeVipExpiredSvip.vipLevel, 'vip');
  assert(activeVipExpiredSvip.expiresAt > now, 'effective expiry must follow the still-active regular VIP tier');
  assert.strictEqual(
    qqVip.qqVipEntitlementRights(activeVipExpiredSvip).canPlaySvipTracks,
    false,
    'an expired SVIP tier must not retain SVIP playback rights'
  );
  const statusOnlyTierSplit = qqVip.normalizeQQVipPayload({
    membership_info: {
      vip_status: 1,
      vip_end_time: Math.floor(vipExpiresAt / 1000),
      svip_status: 1,
      svip_end_time: Math.floor(svipExpiresAt / 1000),
    },
  }, {}, { now });
  assert.strictEqual(statusOnlyTierSplit.vipLevel, 'vip', 'tier-specific status fields must honor their own expiry');

  const svipOnlyNegative = qqVip.normalizeQQVipPayload({
    code: 0,
    data: { svip_info: { is_svip: false, svip_type: 0 } },
  });
  assert.strictEqual(
    svipOnlyNegative.decision,
    'unknown',
    'not owning SVIP alone does not prove that the account lacks regular VIP'
  );
}

async function testAllProbeAggregationAndNegativeQuorum() {
  const uin = '10002';
  const probes = [
    { source: 'first', responseKey: 'req_1', uin },
    { source: 'second', responseKey: 'req_1', uin },
    { source: 'third', responseKey: 'req_1', uin },
  ];
  const responses = [
    ordinaryPayload(uin),
    { code: 0, req_1: { code: 0, data: {} } },
    activeVipPayload(uin, Date.now() + 60 * 60 * 1000),
  ];
  let calls = 0;
  const resolved = await qqVip.resolveQQVipFromProbes(probes, async () => responses[calls++]);
  assert.strictEqual(calls, 3, 'all QQ VIP mirrors must be checked');
  assert.strictEqual(resolved.isVip, true, 'a later explicit positive must win over an earlier ordinary response');
  assert.strictEqual(resolved.vipSource, 'third');

  const defaultZeroShell = await qqVip.resolveQQVipFromProbes(
    [{ source: 'zero-shell', responseKey: 'req_1', uin }],
    async () => ({ code: 1000, req_1: { code: 1000 }, vip: 0 })
  );
  assert.strictEqual(defaultZeroShell.decision, 'unknown', 'failed/default zero shell must not downgrade membership');

  const unattributedSingleNegative = await qqVip.resolveQQVipFromProbes(
    [{ source: 'single', responseKey: 'req_1', uin }],
    async () => ({ code: 0, req_1: { code: 0, data: { vip_info: { is_vip: false, vip_type: 0 } } } })
  );
  assert.strictEqual(
    unattributedSingleNegative.decision,
    'unknown',
    'one unattributed replicated zero response must not be authoritative'
  );

  const unmatchedZeroShells = await qqVip.resolveQQVipFromProbes(
    [
      { source: 'zero-a', responseKey: 'req_1', uin },
      { source: 'zero-b', responseKey: 'req_1', uin },
    ],
    async () => ({ code: 0, req_1: { code: 0, data: { vip_info: { is_vip: false, vip_type: 0 } } } })
  );
  assert.strictEqual(
    unmatchedZeroShells.decision,
    'unknown',
    'even repeated default zero shells must remain unknown when no entitlement subtree belongs to the current UIN'
  );

  const otherAccountPositive = await qqVip.resolveQQVipFromProbes(
    [{ source: 'other-user', responseKey: 'req_1', uin }],
    async () => activeVipPayload('99999', Date.now() + 60 * 60 * 1000)
  );
  assert.strictEqual(
    otherAccountPositive.decision,
    'unknown',
    'positive membership for another UIN must never promote the current account'
  );

  let mixedCalls = 0;
  const matchedPositiveWithTimeouts = await qqVip.resolveQQVipFromProbes(
    [
      { source: 'matched-positive', responseKey: 'req_1', uin },
      { source: 'zero-shell', responseKey: 'req_1', uin },
      { source: 'timeout', responseKey: 'req_1', uin },
    ],
    async () => {
      mixedCalls += 1;
      if (mixedCalls === 1) return activeVipPayload(uin, Date.now() + 60 * 60 * 1000);
      if (mixedCalls === 2) return { code: 0, req_1: { code: 0, data: { vip: 0 } } };
      throw new Error('timeout');
    }
  );
  assert.strictEqual(matchedPositiveWithTimeouts.isVip, true, 'one current-UIN positive must survive zero shells and timeouts');

  const attributedNegative = await qqVip.resolveQQVipFromProbes(
    [{ source: 'attributed', responseKey: 'req_1', uin }],
    async () => ordinaryPayload(uin)
  );
  assert.strictEqual(attributedNegative.decision, 'negative', 'a successful response tied to the current UIN may confirm ordinary membership');
  assert.strictEqual(attributedNegative.authoritativeNegative, true);

  let incompleteCalls = 0;
  const incompleteNegative = await qqVip.resolveQQVipFromProbes(probes, async () => {
    incompleteCalls += 1;
    if (incompleteCalls === 1) return ordinaryPayload(uin);
    if (incompleteCalls === 2) return { code: 0, req_1: { code: 0, data: {} } };
    throw new Error('timeout');
  });
  assert.strictEqual(incompleteNegative.decision, 'unknown', 'one matched negative among three probes is not a quorum');
  assert.strictEqual(incompleteNegative.authoritativeNegative, false);
  assert.strictEqual(incompleteNegative.probeIncomplete, true);

  let quorumCalls = 0;
  const authoritativeNegative = await qqVip.resolveQQVipFromProbes(probes, async () => {
    quorumCalls += 1;
    if (quorumCalls <= 2) return ordinaryPayload(uin);
    throw new Error('timeout');
  });
  assert.strictEqual(authoritativeNegative.decision, 'negative');
  assert.strictEqual(authoritativeNegative.authoritativeNegative, true, 'two current-UIN negatives form the production quorum');
  assert.strictEqual(authoritativeNegative.negativeProbeCount, 2);
  assert.strictEqual(authoritativeNegative.negativeQuorum, 2);
}

function testSessionScopedCacheFingerprintAndExpiry() {
  const cookieA = { login_type: '1', qm_keyst: 'ticket-A' };
  const cookieB = { login_type: '1', qm_keyst: 'ticket-B' };
  const keyA = qqVip.qqVipSessionCacheKey('10003', 'ticket-A', cookieA);
  assert.strictEqual(keyA, qqVip.qqVipSessionCacheKey('10003', 'ticket-A', cookieA));
  assert.notStrictEqual(keyA, qqVip.qqVipSessionCacheKey('10003', 'ticket-B', cookieB));
  assert.notStrictEqual(keyA, qqVip.qqVipSessionCacheKey('10004', 'ticket-A', cookieA));
  assert(!keyA.includes('ticket-A'), 'cache key must not expose a raw QQ ticket');

  const now = Date.now();
  const ttl = qqVip.qqVipCacheTtlMs({
    resolved: true,
    membershipKnown: true,
    isVip: true,
    expiresAt: now + 2500,
  }, { now, positiveTtlMs: 120000 });
  assert(ttl > 0 && ttl <= 2500, 'positive cache must not outlive entitlement expiry');
  assert.strictEqual(
    qqVip.qqVipCacheTtlMs({ resolved: false, membershipKnown: false }, { now }),
    0,
    'unknown membership must not be cached as ordinary'
  );
}

function testStalePositiveProtectionAndRights() {
  const now = Date.now();
  const cachedVip = qqVip.normalizeQQVipPayload(activeVipPayload('10003', now + 60 * 60 * 1000));
  const ordinary = qqVip.normalizeQQVipPayload(ordinaryPayload('10003'));
  const cachedEntry = {
    value: cachedVip,
    expiresAt: now - 1,
    staleUntil: now + 5 * 60 * 1000,
  };
  const incomplete = {
    ...ordinary,
    resolved: false,
    decision: 'unknown',
    probeIncomplete: true,
  };
  const preserved = qqVip.preserveQQVipStalePositive(cachedEntry, incomplete, { now });
  assert.strictEqual(preserved.isVip, true, 'an incomplete refresh may retain a bounded stale positive');
  assert.strictEqual(preserved.membershipStale, true, 'preserved VIP must be visibly marked stale');
  assert.strictEqual(preserved.vipSource, 'qq-vip-cache-stale-positive');
  const staleRights = qqVip.qqVipEntitlementRights(preserved);
  assert.strictEqual(staleRights.verified, false, 'stale evidence is never a verified entitlement');
  assert.strictEqual(staleRights.canPlayVipTracks, false, 'stale evidence must not grant VIP playback rights');
  assert.strictEqual(staleRights.maxQuality, 'standard');

  const authoritativeOrdinary = {
    ...ordinary,
    authoritativeNegative: true,
    negativeProbeCount: 2,
    negativeQuorum: 2,
    probeIncomplete: false,
  };
  const downgraded = qqVip.preserveQQVipStalePositive(cachedEntry, authoritativeOrdinary, { now });
  assert.strictEqual(downgraded.isVip, false, 'an authoritative current-account negative quorum must downgrade immediately');
  assert.strictEqual(downgraded.authoritativeNegative, true);
  assert.strictEqual(
    qqVip.preserveQQVipStalePositive(cachedEntry, ordinary, { now }).isVip,
    false,
    'a complete resolved negative must never be hidden behind stale-positive retention'
  );

  const afterGrace = qqVip.preserveQQVipStalePositive(cachedEntry, incomplete, {
    now: cachedEntry.staleUntil + 1,
  });
  assert.strictEqual(afterGrace.decision, 'unknown', 'stale positive protection must end after its bounded grace period');

  const svipRights = qqVip.qqVipEntitlementRights({
    membershipKnown: true,
    vipLevel: 'svip',
    isVip: true,
    isSvip: true,
  });
  assert.strictEqual(svipRights.canPlaySvipTracks, true);
  assert.strictEqual(svipRights.maxQuality, 'hires');
}

async function testTransientFrontendFailureKeepsLastKnownGood() {
  const source = fs.readFileSync(path.join(ROOT, 'public/js/modules/08-account/02-login-status.js'), 'utf8');
  const normalizeStart = source.indexOf('function normalizeQQLoginStatus');
  const normalizeEnd = source.indexOf('\nfunction qqMembershipLabel', normalizeStart);
  const refreshStart = source.indexOf('async function refreshQQLoginStatus');
  const refreshEnd = source.indexOf('\nfunction refreshQQVipStatusNow', refreshStart);
  assert(normalizeStart >= 0 && normalizeEnd > normalizeStart && refreshStart >= 0 && refreshEnd > refreshStart);

  const context = {
    console: { warn() {} },
    qqLoginStatus: {
      provider: 'qq',
      loggedIn: true,
      userId: '10005',
      nickname: 'Verified VIP',
      vipType: 1,
      vipLevel: 'vip',
      isVip: true,
      isSvip: false,
      membershipKnown: true,
      playbackKeyReady: true,
    },
    qqLoginWasLoggedIn: true,
    qqPlaylists: [],
    userPlaylists: [],
    playlistCatalogRevision: 0,
    homeDiscoverState: {},
    activeAccountProvider: 'qq',
    apiJson: async () => { throw new Error('temporary network failure'); },
    auditProviderVipState() {},
    showToast() {},
    loadHomeDiscover() {},
    refreshUserPlaylists() {},
    hasPlatformLogin() { return true; },
    firstLoggedProvider() { return 'qq'; },
    renderUserBtn() {},
  };
  vm.createContext(context);
  vm.runInContext(source.slice(normalizeStart, normalizeEnd) + '\n' + source.slice(refreshStart, refreshEnd), context);
  const status = await context.refreshQQLoginStatus({});
  assert.strictEqual(status.loggedIn, true, 'transient refresh failure must keep the current account');
  assert.strictEqual(status.isVip, true, 'transient refresh failure must keep last-known verified VIP');
  assert.strictEqual(status.membershipKnown, true);
  assert.strictEqual(status.stale, true, 'preserved status must be marked stale');
  assert.strictEqual(status.membershipStale, true);
}

function testDesktopReauthCookieSelectionAndBudgets() {
  const mainSource = fs.readFileSync(path.join(ROOT, 'desktop/main.js'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(ROOT, 'desktop/preload.js'), 'utf8');
  const loginSource = fs.readFileSync(path.join(ROOT, 'public/js/modules/08-account/03-login-modal-flows.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const playbackSource = fs.readFileSync(path.join(ROOT, 'public/js/modules/05-playback/13-playback-start-audio.js'), 'utf8');
  const prefetchSource = fs.readFileSync(path.join(ROOT, 'public/js/modules/03-beat/00-tempo-worker-cache-prefetch.js'), 'utf8');
  const accountSource = fs.readFileSync(path.join(ROOT, 'public/js/modules/08-account/02-login-status.js'), 'utf8');

  assert(/openQQMusicLoginWindow\(owner, options\)/.test(mainSource));
  assert(
    /const initialCookie = await readQQLoginCookieHeader\(cookieSession\);[\s\S]{0,220}qqCookieHasPlaybackLogin\(initialCookie\)[\s\S]{0,260}options\.forceReauth[\s\S]{0,180}clearStorageData/.test(mainSource),
    'an already-complete QQ playback partition must be recovered before force reauthorization clears partial state'
  );
  assert(/ipcRenderer\.invoke\('qq-music-open-login', options \|\| \{\}\)/.test(preloadSource));
  assert(
    /forceReauth:\s*!!\(qqLoginStatus && qqLoginStatus\.authorizationIncomplete && qqLoginStatus\.playbackKeyReady === false\)/.test(loginSource),
    'QQ reauthorization must not clear a valid partition merely because the account is logged in'
  );
  assert(
    !/forceReauth:\s*!!\(qqLoginStatus && qqLoginStatus\.loggedIn\)/.test(loginSource),
    'loggedIn alone must never force-clear the official QQ login partition'
  );
  assert(
    /qqLoginStatus\.authorizationIncomplete[\s\S]{0,100}qqLoginStatus\.playbackKeyReady === false/.test(loginSource),
    'the login panel must distinguish missing playback authorization from membership refresh'
  );
  assert(
    /qqNeedsAuthRefresh \? openQQWebLogin : \(qqLoginStatus\.loggedIn \? refreshQr : openQQWebLogin\)/.test(loginSource),
    'membership refresh must use the status probe instead of reopening and clearing OAuth'
  );
  assert(
    /function isTrustedQQLoginUrl[\s\S]{0,700}tencent\.com/.test(mainSource) &&
      /action:\s*'allow'[\s\S]{0,500}partition:\s*QQ_LOGIN_PARTITION/.test(mainSource),
    'trusted QQ/Tencent OAuth popups must stay in independent windows on the persistent QQ partition'
  );
  assert(
    !/loginWindow\.loadURL\('https:\/\/y\.qq\.com\/n\/ryqq\/player'\)/.test(mainSource),
    'the OAuth login window must never be overwritten by the player warmup'
  );
  assert(
    /warmupWindow\.loadURL\('https:\/\/y\.qq\.com\/n\/ryqq\/player'\)/.test(mainSource),
    'the optional player warmup must run in a separate hidden window'
  );
  assert(
    /playbackFinalizePending[\s\S]{0,700}setTimeout\(resolveDelay,\s*450\)[\s\S]{0,300}finalizedCookie/.test(mainSource),
    'QQ login completion must keep the callback alive briefly for the final official cookie burst'
  );
  assert(
    /const showLoginWindow = \(\) =>[\s\S]{0,260}loginWindow\.show\(\)/.test(mainSource) &&
      /loginWindow\.webContents\.on\('did-finish-load'[\s\S]{0,180}showLoginWindow\(\)/.test(mainSource) &&
      /showWatchdog = setTimeout\(showLoginWindow,\s*2500\)/.test(mainSource),
    'the official QQ login window must have load and watchdog visibility fallbacks'
  );
  assert(
    /const QQ_LOGIN_FALLBACK_URL = 'https:\/\/y\.qq\.com\/'/.test(mainSource) &&
      /const loadQQOfficialLoginEntry = async \(\) =>[\s\S]{0,700}cookieSession\.clearCache\(\)[\s\S]{0,420}QQ_LOGIN_FALLBACK_URL/.test(mainSource),
    'HTTP/2 failures on the QQ profile route must retry through the official QQ homepage'
  );
  assert(
    /function qqLoginCompletionFromCookie[\s\S]{0,500}QQ_PLAYBACK_AUTH_INCOMPLETE/.test(mainSource) &&
      /resolve\(qqLoginCompletionFromCookie\(cookie\)\)/.test(mainSource),
    'closing with only a generic QQ web session must fail without returning a cookie for persistence'
  );
  assert(
    /async function fetchQQVipStatus[\s\S]{0,220}const musicKey = qqCookiePlaybackKey\(cookieObj\)/.test(serverSource),
    'VIP probes must authenticate only with a strict QQ Music playback key'
  );
  assert(
    /async function handleQQSongUrl[\s\S]{0,500}const playbackKey = qqCookiePlaybackKey\(cookieObj\);\s*const musicKey = playbackKey;/.test(serverSource),
    'vkey requests must never submit p_skey as authst'
  );
  assert(
    /function qqCookieUin[\s\S]{0,180}!!obj\.wxopenid[\s\S]{0,180}obj\.wxuin/.test(serverSource) &&
      /function normalizeQQCookieInput[\s\S]{0,180}obj\.wxopenid[\s\S]{0,100}obj\.uin = obj\.wxuin/.test(serverSource),
    'a current WeChat QQ Music session must not be paired with a stale QQ uin'
  );
  assert(
    /if \(!qqCookieUin\(obj\) \|\| !qqCookiePlaybackKey\(obj\)\)/.test(serverSource),
    'the server must refuse to persist a partial QQ web-only cookie'
  );

  const loginHelperStart = mainSource.indexOf('function parseCookieHeader');
  const loginHelperEnd = mainSource.indexOf('\nfunction neteaseCookieHasLogin', loginHelperStart);
  const loginHelperContext = { URL };
  vm.createContext(loginHelperContext);
  vm.runInContext(mainSource.slice(loginHelperStart, loginHelperEnd), loginHelperContext);
  const partialResult = loginHelperContext.qqLoginCompletionFromCookie('uin=10001; p_skey=web-only');
  assert.strictEqual(partialResult.ok, false);
  assert.strictEqual(partialResult.partial, true);
  assert.strictEqual(partialResult.error, 'QQ_PLAYBACK_AUTH_INCOMPLETE');
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(partialResult, 'cookie'),
    false,
    'a web-only QQ session must never be returned to the renderer for persistence'
  );
  const playbackResult = loginHelperContext.qqLoginCompletionFromCookie('uin=10001; qm_keyst=playback-ticket');
  assert.strictEqual(playbackResult.ok, true);
  assert.strictEqual(playbackResult.cookie, 'uin=10001; qm_keyst=playback-ticket');
  const wechatPlaybackResult = loginHelperContext.qqLoginCompletionFromCookie(
    'uin=10001; wxuin=20002; wxopenid=wx-open-id; qm_keyst=wechat-playback-ticket'
  );
  assert.strictEqual(wechatPlaybackResult.ok, true);
  assert.strictEqual(
    loginHelperContext.qqCookieHasPlaybackLogin('uin=10001; wxuin=20002; wxopenid=wx-open-id; qm_keyst=wechat-playback-ticket'),
    true,
    'wxopenid must select the current WeChat UIN even when an old QQ uin cookie remains'
  );
  assert.strictEqual(loginHelperContext.isTrustedQQLoginUrl('https://graph.qq.com/oauth2.0/show'), true);
  assert.strictEqual(loginHelperContext.isTrustedQQLoginUrl('https://connect.tencent.com/oauth'), true);
  assert.strictEqual(loginHelperContext.isTrustedQQLoginUrl('https://open.weixin.qq.com/connect/qrconnect'), true);
  assert.strictEqual(loginHelperContext.isTrustedQQLoginUrl('https://qq.com.attacker.invalid/oauth'), false);
  assert.strictEqual(loginHelperContext.isTrustedQQLoginUrl('http://graph.qq.com/oauth2.0/show'), false);
  assert(
    /function qqLoginNeedsAuthorizationRefresh[\s\S]{0,260}playbackKeyReady === false[\s\S]{0,160}function qqMembershipNeedsSync[\s\S]{0,220}membershipKnown !== true/.test(accountSource),
    'playback authorization and membership refresh must remain separate states'
  );

  const cookieStart = mainSource.indexOf('function cookieIsExpired');
  const cookieEnd = mainSource.indexOf('\nasync function readQQLoginCookieHeader', cookieStart);
  const cookieContext = {
    Date,
    Map,
    QQ_LOGIN_COOKIE_PRIORITY: ['uin', 'qm_keyst'],
    isQQCookieDomain(domain) {
      return String(domain || '').replace(/^\./, '').toLowerCase().endsWith('qq.com');
    },
  };
  vm.createContext(cookieContext);
  vm.runInContext(mainSource.slice(cookieStart, cookieEnd), cookieContext);
  const future = Date.now() / 1000 + 3600;
  const past = Date.now() / 1000 - 60;
  const header = cookieContext.buildCookieHeader([
    { name: 'uin', value: 'old-parent', domain: '.qq.com', path: '/', expirationDate: future },
    { name: 'uin', value: 'preferred-y', domain: 'y.qq.com', path: '/', expirationDate: future },
    { name: 'qm_keyst', value: 'expired-key', domain: 'y.qq.com', path: '/', expirationDate: past },
    { name: 'qm_keyst', value: 'valid-key', domain: '.qq.com', path: '/', expirationDate: future },
  ]);
  assert(header.includes('uin=preferred-y'), 'QQ cookie selection must prefer the official y.qq.com scope');
  assert(header.includes('qm_keyst=valid-key'), 'QQ cookie selection must retain a valid playback key');
  assert(!header.includes('expired-key'), 'expired QQ cookies must be excluded');

  assert(/const QQ_VKEY_REQUEST_TIMEOUT_MS = 6000/.test(serverSource));
  assert(/const QQ_AUDIO_PROBE_TOTAL_MS = 6200/.test(serverSource));
  const vkeyBudget = Number((serverSource.match(/QQ_VKEY_REQUEST_TIMEOUT_MS\s*=\s*(\d+)/) || [])[1]);
  const audioProbeBudget = Number((serverSource.match(/QQ_AUDIO_PROBE_TOTAL_MS\s*=\s*(\d+)/) || [])[1]);
  assert(
    vkeyBudget + audioProbeBudget < 15000,
    'the complete QQ URL handler deadline must finish before the renderer 15s request deadline'
  );
  assert((playbackSource.match(/timeoutMs: 15000/g) || []).length >= 2);
  assert(/timeoutMs: 15000/.test(prefetchSource));

  assert(!/vipEvidence:\s*playbackVipEvidence/.test(serverSource));
  assert(!/member-track-playback/.test(serverSource));
  assert(/function qqPlaybackShowsMemberAccess[\s\S]{0,260}return false;/.test(accountSource));
  assert(!/writeQQPlaybackVipEvidence\(Object\.assign\(\{\}, merged/.test(accountSource));

  const fallbackSource = fs.readFileSync(path.join(ROOT, 'public/js/modules/05-playback/11-provider-fallback.js'), 'utf8');
  assert(/membershipUnknown[\s\S]{0,700}!membershipUnknown/.test(fallbackSource));
  assert(/会员待同步/.test(fallbackSource), 'unknown QQ membership must not be rendered as an ordinary account');
  assert(/membershipUnknown[\s\S]{0,500}vipSyncState:\s*authIncomplete/.test(serverSource));
  assert(
    /preserveQQVipStalePositive\(cached,\s*value/.test(serverSource),
    'server refresh may protect a recent same-session verified VIP only while refreshed evidence is incomplete'
  );
  assert(
    /membershipRights:\s*qqVipEntitlementRights\(normalized\)/.test(serverSource),
    'QQ login status must expose explicit VIP/SVIP rights'
  );
  assert(
    /profilePositive\s*&&\s*!vip\.isVip\s*&&\s*vip\.authoritativeNegative\s*!==\s*true/.test(serverSource),
    'an authoritative current-account negative quorum must override stale profile VIP data'
  );
}

function testPackagingIncludesQQVipModule() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const files = pkg && pkg.build && pkg.build.files || [];
  assert(files.includes('*-api.js'), 'Electron package must include provider API modules');
  assert(/-api\.js$/.test(path.basename(require.resolve('../qq-vip-api'))));
}

async function main() {
  testStrictMembershipNormalization();
  await testAllProbeAggregationAndNegativeQuorum();
  testSessionScopedCacheFingerprintAndExpiry();
  testStalePositiveProtectionAndRights();
  await testTransientFrontendFailureKeepsLastKnownGood();
  testDesktopReauthCookieSelectionAndBudgets();
  testPackagingIncludesQQVipModule();
  console.log('[OK] QQ VIP entitlement regression tests passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
