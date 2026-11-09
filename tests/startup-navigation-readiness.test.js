const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const MAIN_PATH = path.join(__dirname, '..', 'desktop', 'main.js');
const mainSource = fs.readFileSync(MAIN_PATH, 'utf8');

function sourceBetween(startMarker, endMarker) {
  const start = mainSource.indexOf(startMarker);
  assert(start >= 0, `Missing source marker: ${startMarker}`);
  const end = mainSource.indexOf(endMarker, start + startMarker.length);
  assert(end > start, `Missing source marker after ${startMarker}: ${endMarker}`);
  return mainSource.slice(start, end).trim();
}

const urlMatchSource = sourceBetween(
  'function startupNavigationUrlMatches(actualUrl, expectedUrl)',
  '\nfunction createTrustedMainDocumentReadySignal(win, expectedUrl)'
);
const readySignalSource = sourceBetween(
  'function createTrustedMainDocumentReadySignal(win, expectedUrl)',
  '\nfunction recoverMainWindowAfterRendererGone('
);
const loadWithRetrySource = sourceBetween(
  'async function loadMainWindowWithRetry(win)',
  '\nasync function createWindowOnce()'
);

function isTrustedMainDocumentUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === '31381';
  } catch (_) {
    return false;
  }
}

function createReadySignalFactory() {
  return new Function(
    'URL',
    'isTrustedMainDocumentUrl',
    `${urlMatchSource}\n${readySignalSource}\nreturn createTrustedMainDocumentReadySignal;`
  )(URL, isTrustedMainDocumentUrl);
}

function fastStartupTimeout(promise, _timeoutMs, label, onTimeout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { if (typeof onTimeout === 'function') onTimeout(); } catch (_) { }
      const error = new Error(`${label || 'startup operation'} timed out in test`);
      error.code = 'MINERADIO_STARTUP_TIMEOUT';
      reject(error);
    }, 20);
    Promise.resolve(promise).then((value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

function createLoadWithRetryHarness(env = {}) {
  const states = [];
  const processStub = { env: { ...env } };
  const loadMainWindowWithRetry = new Function(
    'URL',
    'isTrustedMainDocumentUrl',
    'mainServerPort',
    'process',
    'writeStartupState',
    'STARTUP_NAVIGATION_TIMEOUT_MS',
    'withStartupTimeout',
    'startupDelay',
    'startupErrorText',
    `${urlMatchSource}\n${readySignalSource}\n${loadWithRetrySource}\nreturn loadMainWindowWithRetry;`
  )(
    URL,
    isTrustedMainDocumentUrl,
    31381,
    processStub,
    (phase, details) => states.push({ phase, details }),
    15000,
    fastStartupTimeout,
    () => Promise.resolve(),
    error => String(error && error.message || error || 'UNKNOWN_ERROR')
  );
  return { loadMainWindowWithRetry, states };
}

function createFakeWindow(onLoad) {
  const webContents = new EventEmitter();
  let currentUrl = '';
  let stopCalls = 0;
  let loadCalls = 0;
  webContents.isDestroyed = () => false;
  webContents.getURL = () => currentUrl;
  webContents.stop = () => { stopCalls += 1; };
  const win = {
    webContents,
    isDestroyed: () => false,
    loadURL(targetUrl) {
      loadCalls += 1;
      return onLoad({
        targetUrl,
        loadCalls,
        webContents,
        setCurrentUrl(value) { currentUrl = value; },
      });
    },
  };
  return {
    win,
    webContents,
    stopCalls: () => stopCalls,
    loadCalls: () => loadCalls,
  };
}

function assertReadyListenersRemoved(webContents) {
  ['did-navigate', 'dom-ready', 'did-finish-load'].forEach(eventName => {
    assert.strictEqual(
      webContents.listenerCount(eventName),
      0,
      `${eventName} readiness listener must be removed after the attempt settles`
    );
  });
}

async function testTrustedReadySignalRequiresTheExpectedDocument() {
  const createSignal = createReadySignalFactory();
  const webContents = new EventEmitter();
  let currentUrl = 'https://example.invalid/';
  webContents.isDestroyed = () => false;
  webContents.getURL = () => currentUrl;
  const win = { webContents, isDestroyed: () => false };
  const expectedUrl = 'http://127.0.0.1:31381/?startupAttempt=1&startupAt=1';
  const signal = createSignal(win, expectedUrl);

  webContents.emit('did-navigate', {}, 'http://127.0.0.1:31381/?startupAttempt=2&startupAt=2', 200);
  assert.strictEqual(signal.isReady(), false, 'a different trusted navigation must not satisfy this attempt');
  currentUrl = expectedUrl;
  webContents.emit('dom-ready');
  const result = await signal.promise;
  assert.strictEqual(result.url, expectedUrl);
  assert.strictEqual(result.phase, 'dom-ready');
  assert.deepStrictEqual(
    { url: win.__mineradioTrustedMainDocumentReady.url, phase: win.__mineradioTrustedMainDocumentReady.phase },
    { url: expectedUrl, phase: 'dom-ready' }
  );
  signal.cancel();
  assertReadyListenersRemoved(webContents);
}

async function testStalledLoadPromiseAcceptsTrustedDomReady() {
  const harness = createLoadWithRetryHarness({ MINERADIO_STARTUP_TEST_STALL_LOAD_PROMISE: '1' });
  const fake = createFakeWindow(({ targetUrl, webContents, setCurrentUrl }) => {
    setCurrentUrl(targetUrl);
    setTimeout(() => webContents.emit('dom-ready'), 2);
    // The QA switch deliberately ignores this resolved promise. Readiness must
    // therefore come from the trusted main document signal.
    return Promise.resolve();
  });

  const result = await harness.loadMainWindowWithRetry(fake.win);
  assert.match(result, /^http:\/\/127\.0\.0\.1:31381\/\?startupAttempt=1&startupAt=\d+$/);
  assert.strictEqual(fake.loadCalls(), 1, 'trusted DOM readiness must finish on the first navigation attempt');
  assert.strictEqual(fake.stopCalls(), 0, 'a visible trusted document must never be stopped because loadURL stayed pending');
  assert(
    harness.states.some(entry => entry.phase === 'navigation-ready' && entry.details.navigationReadyPhase === 'dom-ready'),
    'startup diagnostics must record that DOM readiness won the race'
  );
  assert(!harness.states.some(entry => entry.phase === 'navigation-retry'));
  assertReadyListenersRemoved(fake.webContents);
}

async function testTrulyUnreadyDocumentStillRetriesAndFails() {
  const harness = createLoadWithRetryHarness({ MINERADIO_STARTUP_TEST_STALL_LOAD_PROMISE: '1' });
  const fake = createFakeWindow(() => Promise.resolve());

  await assert.rejects(
    harness.loadMainWindowWithRetry(fake.win),
    error => error && error.code === 'MINERADIO_STARTUP_TIMEOUT'
  );
  assert.strictEqual(fake.loadCalls(), 2, 'a document with no trusted ready signal must use the bounded retry');
  assert(fake.stopCalls() >= 2, 'only genuinely unready attempts may be stopped');
  assert.strictEqual(
    harness.states.filter(entry => entry.phase === 'navigation-retry').length,
    2,
    'both genuinely unready attempts must be recorded as retries'
  );
  assert(!harness.states.some(entry => entry.phase === 'navigation-ready'));
  assertReadyListenersRemoved(fake.webContents);
}

function testSourceContractKeepsTimeoutFailOpenNarrow() {
  assert.match(loadWithRetrySource, /Promise\.race\(\[observedLoadPromise, readySignal\.promise\]\)/);
  assert.match(loadWithRetrySource, /if \(readySignal\.isReady\(\)\) return;[\s\S]{0,100}win\.webContents\.stop\(\)/);
  assert.match(loadWithRetrySource, /MINERADIO_STARTUP_TIMEOUT[\s\S]{0,100}readySignal\.isReady\(\)/);
  assert.match(loadWithRetrySource, /finally \{[\s\S]{0,100}readySignal\.cancel\(\)/);
  assert.match(loadWithRetrySource, /MINERADIO_STARTUP_TEST_STALL_LOAD_PROMISE/);
}

async function main() {
  testSourceContractKeepsTimeoutFailOpenNarrow();
  await testTrustedReadySignalRequiresTheExpectedDocument();
  await testStalledLoadPromiseAcceptsTrustedDomReady();
  await testTrulyUnreadyDocumentStillRetriesAndFails();
  console.log('[OK] startup navigation accepts a trusted ready document without killing it, while truly unready loads still retry and fail');
}

main().catch(error => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
