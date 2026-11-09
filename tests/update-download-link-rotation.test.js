'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(root, 'public/js/modules/08-account/00-update-preview.js'), 'utf8');
const releaseUrl = 'https://example.invalid/releases/v2.2.0';
const oldUrl = 'https://example.invalid/retired-download';
const pages = [
  { label: '新线路一', url: 'https://example.invalid/current-first' },
  { label: '新线路二', url: 'https://example.invalid/current-second' },
];
const notice = '本次更新已更换分发地址，请使用新版链接；旧分享入口不再维护。';

function serverHarness() {
  const context = vm.createContext({
    URL, AbortController, setTimeout, clearTimeout,
    APP_VERSION: '2.1.0', UPDATE_FALLBACK_NOTES: ['发现新版本'],
    UPDATE_CONFIG: { configured: true, provider: 'github', owner: 'fixture', repo: 'fixture' },
  });
  const start = serverSource.indexOf('function normalizeVersion(');
  const end = serverSource.indexOf('async function readUpdateManifest(', start);
  assert(start >= 0 && end > start);
  vm.runInContext(serverSource.slice(start, end), context);
  const fetchStart = serverSource.indexOf('async function fetchLatestUpdateInfo(');
  const fetchEnd = serverSource.indexOf('function readRequestBody(', fetchStart);
  assert(fetchStart >= 0 && fetchEnd > fetchStart);
  vm.runInContext(serverSource.slice(fetchStart, fetchEnd), context);
  return context;
}

function rendererHarness() {
  const nodes = {
    'update-list': { innerHTML: '' },
    'update-hero-main': { textContent: '' },
    'update-footnote': { textContent: '' },
  };
  const opened = [];
  const context = vm.createContext({
    URL,
    updatePreviewState: { currentVersion: '2.1.0', selectedDownloadPageIndex: 0 },
    document: {
      getElementById: id => nodes[id] || null,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    window: { desktopWindow: { openUpdatePage: async url => { opened.push(url); return { ok: true }; } } },
    escHtml: text => String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    showToast() {},
    setTimeout: () => 1,
  });
  vm.runInContext(uiSource, context);
  return { context, nodes, opened };
}

test('the latest Release body supplies two new pages and the announcement without stale visible links', async () => {
  const server = serverHarness();
  const body = [
    '## 更新内容',
    '- ' + notice,
    '- 修复音乐接口与播放稳定性。',
    ...pages.map(page => '<!-- mineradio-download-page: ' + page.label + '|' + page.url + ' -->'),
    '网盘：' + oldUrl,
  ].join('\n');
  server.fetch = async () => ({ ok: true, json: async () => ({ tag_name: 'v2.2.0', html_url: releaseUrl, body }) });
  const result = await server.fetchLatestUpdateInfo();
  assert.equal(result.updateAvailable, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.release.downloadPages)), pages);
  assert.equal(result.release.externalUrl, pages[0].url);
  assert.equal(result.release.summary, notice);
  assert.equal(result.release.notes[0], notice);
  assert.equal(result.release.notes.includes('更新内容'), false);
  assert.equal(result.release.asset, null);
  assert.equal(result.release.patch, null);
});

test('explicit manifest pages replace legacy URL aliases instead of appending a retired third source', () => {
  const server = serverHarness();
  const result = server.normalizeManifestUpdateInfo({
    latestVersion: '2.2.0', externalUrl: oldUrl,
    release: { htmlUrl: releaseUrl, downloadPages: pages, externalUrl: oldUrl, downloadPageUrl: oldUrl },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.release.downloadPages)), pages);
  assert.equal(result.release.externalUrl, pages[0].url);
  assert.equal(result.release.downloadPageUrl, pages[0].url);
});

test('an explicitly empty or unsafe list retires legacy sources while old single-page manifests remain compatible', () => {
  const server = serverHarness();
  for (const downloadPages of [[], [{ url: 'http://example.invalid/unsafe' }]]) {
    const result = server.normalizeManifestUpdateInfo({
      latestVersion: '2.2.0', release: { htmlUrl: releaseUrl, downloadPages, externalUrl: oldUrl },
    });
    assert.equal(result.release.downloadPages.length, 0);
    assert.equal(result.release.externalUrl, '');
    assert.equal(result.release.downloadPageUrl, releaseUrl);
  }
  const legacy = server.normalizeManifestUpdateInfo({ latestVersion: '2.2.0', release: { externalUrl: oldUrl } });
  assert.equal(legacy.release.downloadPages.length, 1);
  assert.equal(legacy.release.downloadPageUrl, oldUrl);
});

test('renderer replaces three old sources with two latest sources and opens only the selected new page', async () => {
  const { context, nodes, opened } = rendererHarness();
  context.applyLatestUpdateInfo({ updateAvailable: true, release: {
    htmlUrl: releaseUrl, downloadPages: [0, 1, 2].map(index => ({ url: oldUrl + '/' + index })), notes: ['旧公告'],
  } });
  context.updatePreviewState.selectedDownloadPageIndex = 2;
  context.applyLatestUpdateInfo({ latestVersion: '2.2.0', updateAvailable: true, release: {
    htmlUrl: releaseUrl, downloadPages: pages, externalUrl: oldUrl, downloadPageUrl: oldUrl,
    summary: notice, notes: [notice],
  } });
  assert.equal(context.currentUpdateDownloadPages().length, 2);
  assert.equal(context.updatePreviewState.selectedDownloadPageIndex, 0);
  assert.equal(context.currentUpdatePageUrl(), pages[0].url);
  assert.equal(context.currentUpdatePageUrl(1), pages[1].url);
  assert.equal(context.updatePreviewState.externalUrl, pages[0].url);
  assert.equal(context.updatePreviewState.downloadPageUrl, pages[0].url);
  assert.equal(nodes['update-hero-main'].textContent, notice);
  assert.match(nodes['update-list'].innerHTML, /本次更新已更换分发地址/);
  assert.doesNotMatch(nodes['update-list'].innerHTML, /旧公告/);
  assert.match(nodes['update-footnote'].textContent, /旧收藏链接可能不是最新版/);
  await context.openUpdateDownloadSource(1);
  assert.deepEqual(opened, [pages[1].url]);
});

test('renderer clears retired sources and previous notes when the next payload omits the announcement', () => {
  const { context, nodes } = rendererHarness();
  context.applyLatestUpdateInfo({ updateAvailable: true, release: { downloadPages: pages, notes: ['旧公告'] } });
  context.applyLatestUpdateInfo({ updateAvailable: true, release: {
    htmlUrl: releaseUrl, downloadPages: [], externalUrl: oldUrl, downloadPageUrl: oldUrl,
  } });
  assert.equal(context.currentUpdateDownloadPages().length, 0);
  assert.equal(context.currentUpdatePageUrl(), releaseUrl);
  assert.equal(context.updatePreviewState.externalUrl, '');
  assert.equal(context.updatePreviewState.notes.length, 0);
  assert.doesNotMatch(nodes['update-list'].innerHTML, /旧公告/);
});

test('renderer preserves the legacy single-page response when no explicit list is supplied', () => {
  const { context } = rendererHarness();
  context.applyLatestUpdateInfo({ updateAvailable: true, release: { htmlUrl: releaseUrl, externalUrl: oldUrl } });
  assert.equal(context.currentUpdateDownloadPages().length, 1);
  assert.equal(context.currentUpdatePageUrl(), oldUrl);
});
