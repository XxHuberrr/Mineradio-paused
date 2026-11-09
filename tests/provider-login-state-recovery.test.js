'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');

function renderer() {
  const saved = new Map();
  const notices = [];
  const context = vm.createContext({
    console: { warn() {} },
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    document: { getElementById: () => null },
    PROVIDER_VIP_AUDIT_STORE_KEY: 'audit',
    apiJson: async () => { throw new Error('network unavailable'); },
    showToast: value => notices.push(value),
    escHtml: String,
    kugouLoginStatus: { provider: 'kugou', loggedIn: true, userId: 'fixture-kg', vipLevel: 'svip', isVip: true, isSvip: true, membershipVerified: true, playbackReady: true },
    qishuiLoginStatus: { provider: 'qishui', loggedIn: true, webSession: true, configured: true, userId: 'fixture-qs', vipLevel: 'vip', isVip: true, membershipKnown: true, capabilities: { playableUrl: true } },
    kugouLoginWasLoggedIn: true, qishuiLoginWasLoggedIn: true,
    kugouPlaylists: [], qishuiPlaylists: [], userPlaylists: [{ provider: 'qishui' }],
    playlistCatalogRevision: 0, homeDiscoverState: {}, activeAccountProvider: 'qishui',
  });
  for (const file of ['01-login-modal-utils.js', '02-login-status.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'public/js/modules/08-account', file), 'utf8'), context);
  }
  context.notices = notices;
  return context;
}

test('catalogue credentials cannot become a Qishui account or playback authorization', () => {
  const ctx = renderer();
  const result = ctx.normalizeQishuiLoginStatus({ configured: true, tokenConfigured: true, loggedIn: false, capabilities: { search: true } });
  assert.equal(result.loggedIn, false);
  assert.equal(result.configured, true);
  assert.equal(result.searchReady, true);
  assert.equal(result.playbackKeyReady, false);
});

test('API timeout remains active while a response body is stalled', async () => {
  const source = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/00-api-quality-output.js'), 'utf8');
  const end = source.indexOf('\nfunction escHtml');
  let fireTimeout;
  let timerCleared = false;
  const context = vm.createContext({
    window: { AbortController }, AbortController,
    setTimeout: callback => { fireTimeout = callback; return 1; },
    clearTimeout: () => { timerCleared = true; },
    fetch: async (_, options) => ({ json: () => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted body')));
    }) }),
  });
  vm.runInContext(source.slice(0, end), context);
  const result = context.apiJson('/api/kugou/song/url', { timeoutMs: 20000 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(timerCleared, false, 'headers alone must not cancel the body deadline');
  fireTimeout();
  await assert.rejects(result, /aborted body/);
  assert.equal(timerCleared, true);
});

test('temporary provider errors retain account identity without claiming current authorization', async () => {
  const ctx = renderer();
  const kg = await ctx.refreshKugouLoginStatus();
  const qs = await ctx.refreshQishuiLoginStatus();
  for (const status of [kg, qs]) {
    assert.equal(status.loggedIn, true);
    assert.equal(status.stale, true);
    assert.equal(status.membershipStale, true);
    assert.equal(status.playbackKeyReady, false);
    assert.match(ctx.providerVipBadge(status.provider, status, '', true), /待同步/);
  }
  assert.equal(kg.membershipVerified, false);
  assert.equal(kg.playbackReady, false);
  assert.equal(ctx.notices.length, 0);
});

test('JSON error responses are also treated as temporary status failures', async () => {
  const ctx = renderer();
  ctx.apiJson = async () => ({ loggedIn: false, error: 'UPSTREAM_TIMEOUT' });
  assert.equal((await ctx.refreshKugouLoginStatus()).stale, true);
  assert.equal((await ctx.refreshQishuiLoginStatus()).stale, true);
});

test('officially expired Qishui session clears account and asks for a new scan', async () => {
  const ctx = renderer();
  ctx.apiJson = async () => ({ provider: 'qishui', configured: true, loggedIn: false, webSession: false, reauthRequired: true, error: 'QISHUI_SESSION_EXPIRED' });
  const status = await ctx.refreshQishuiLoginStatus();
  assert.equal(status.loggedIn, false);
  assert.equal(status.playbackKeyReady, false);
  assert.equal(ctx.userPlaylists.length, 0);
  assert.match(ctx.notices[0], /重新扫码/);
});

test('unknown membership does not overwrite verified audit history as a normal account', () => {
  const ctx = renderer();
  ctx.auditProviderVipState('qishui', ctx.qishuiLoginStatus);
  const original = ctx.localStorage.getItem('audit');
  ctx.auditProviderVipState('qishui', { loggedIn: true, membershipKnown: false, vipLevel: 'none' });
  assert.equal(ctx.localStorage.getItem('audit'), original);
  assert.equal(ctx.notices.length, 0);
});

test('the shared badge retains QQ pending and verified ordinary account states', () => {
  const ctx = renderer();
  assert.match(ctx.providerVipBadge('qq', { loggedIn: true, membershipKnown: false }, '', true), /待同步/);
  const ordinary = ctx.providerVipBadge('qq', { loggedIn: true, membershipKnown: true, playbackKeyReady: true, vipLevel: 'none' }, '', true);
  assert.match(ordinary, /普通/);
  assert.doesNotMatch(ordinary, /待同步/);
});

async function qrRoute(data, status = { loggedIn: true, webSession: true }) {
  const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const start = source.indexOf("  if (pn === '/api/qishui/login/check')");
  const end = source.indexOf("  if (pn === '/api/qishui/status'", start);
  assert(start > 0 && end > start);
  let response;
  let saved = 0;
  const context = vm.createContext({
    pn: '/api/qishui/login/check', url: new URL('http://localhost/api/qishui/login/check?token=fixture-token'), res: {},
    qishuiQrLogin: { checkQrConnect: async () => ({ data }), getStatus: () => ({ loggedIn: true }), getCookie: () => 'sessionid=fixture' },
    qishuiCookieHasLogin: () => true,
    saveQishuiCookie: () => { saved++; },
    handleQishuiStatus: async () => status,
    sendJSON: (_, value) => { response = value; },
    console: { error() {} },
  });
  await vm.runInContext('(async () => {' + source.slice(start, end) + '})()', context);
  return { response, saved };
}

test('an old saved cookie cannot confirm a waiting or expired QR attempt', async () => {
  for (const data of [{ status: 'new', error_code: 0 }, { error_code: 2 }, { status: '3', error_code: 0 }]) {
    const result = await qrRoute(data);
    assert.equal(result.response.loggedIn, false);
    assert.notEqual(result.response.status, 'confirmed');
    assert.equal(result.saved, 0);
  }
});

test('only a newly confirmed and valid QR session is saved', async () => {
  const data = { status: '3', error_code: 0, confirmed: true };
  const valid = await qrRoute(data);
  assert.equal(valid.response.status, 'confirmed');
  assert.equal(valid.saved, 1);
  const expired = await qrRoute(data, { loggedIn: false, webSession: false, reauthRequired: true });
  assert.equal(expired.response.status, 'reauth_required');
  assert.equal(expired.response.loggedIn, false);
  assert.equal(expired.saved, 0);
  const pending = await qrRoute(data, { loggedIn: false, webSession: false, stale: true });
  assert.equal(pending.response.status, 'verifying');
  assert.equal(pending.saved, 0);
});

test('a rejected fresh session stops the QR poll and displays a rescan action', async () => {
  const source = fs.readFileSync(path.join(root, 'public/js/modules/08-account/03-login-modal-flows.js'), 'utf8');
  const element = {};
  let stopped = false;
  const context = vm.createContext({
    console, qishuiQrPollGeneration: 1, loginProvider: 'qishui', qrKey: 'fixture-token', qishuiQrPollBusy: false,
    document: { getElementById: () => element },
    apiJson: async () => ({ loggedIn: false, reauthRequired: true, status: 'reauth_required' }),
  });
  vm.runInContext(source, context);
  context.stopQrPoll = () => { stopped = true; context.qishuiQrPollGeneration++; };
  context.scheduleQishuiQrPoll = generation => {
    assert.notEqual(generation, context.qishuiQrPollGeneration, 'the completed QR generation must not schedule another request');
  };
  await context.pollQishuiQr(1);
  assert.equal(stopped, true);
  assert.match(element.textContent, /重新扫码/);
  assert.equal(element.className, 'fail');
});
