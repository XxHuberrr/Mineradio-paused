'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const serverFile = path.join(root, 'server.js');
const desktopMainFile = path.join(root, 'desktop', 'main.js');

function assertNoProfileSensitiveKeys(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(/^(cookie|url|lyric|cover)$/i.test(key), false, `unexpected profile key: ${key}`);
    assertNoProfileSensitiveKeys(child);
  }
}

function extractFunctionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const openingBrace = source.indexOf('{', start);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }
  assert.fail(`unterminated function ${name}`);
}

test('Electron configures the music profile path before loading the local server', () => {
  const desktopMain = fs.readFileSync(desktopMainFile, 'utf8');
  const configureBody = extractFunctionBody(desktopMain, 'configureLocalServerEnvironment');
  assert.match(
    configureBody,
    /process\.env\.MINERADIO_MUSIC_PROFILE_FILE\s*=\s*path\.join\(STABLE_USER_DATA_PATH,\s*'music-profile\.json'\)/,
  );

  const ensureBody = extractFunctionBody(desktopMain, 'ensureLocalServerStarted');
  const configureIndex = ensureBody.indexOf('configureLocalServerEnvironment(port)');
  const requireServerIndex = ensureBody.indexOf('localServer = require(serverModulePath)');
  assert.ok(configureIndex >= 0, 'startup must configure local server environment');
  assert.ok(requireServerIndex >= 0, 'startup must load server.js');
  assert.ok(configureIndex < requireServerIndex, 'profile path must be configured before loading server.js');
});

function reservePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const { port } = listener.address();
      listener.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function request(port, method, route, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1', port, path: route, method,
      headers: payload ? {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      } : {},
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.once('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForServer(port, child) {
  const deadline = Date.now() + 5000;
  return new Promise((resolve, reject) => {
    const retry = async () => {
      if (child.exitCode !== null) {
        reject(new Error(`server exited before listening: ${child.stderrOutput}`));
        return;
      }
      try {
        if ((await request(port, 'GET', '/api/music-profile')).status === 200) {
          resolve();
          return;
        }
      } catch (_) {}
      if (Date.now() >= deadline) {
        reject(new Error(`server did not listen: ${child.stderrOutput}`));
        return;
      }
      setTimeout(retry, 30);
    };
    retry();
  });
}

async function startServer(profileFile, failProfileWrite = false) {
  const port = await reservePort();
  const bootstrap = `
    const Module = require('node:module');
    const fs = require('node:fs');
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (request === 'NeteaseCloudMusicApi') return {};
      if (request === 'electron') return {
        app: { isReady: () => true, whenReady: async () => {} },
        BrowserWindow: function BrowserWindow() {},
        session: { fromPartition: () => ({}) },
      };
      if (request === 'qrcode') return { toDataURL: async () => '' };
      return originalLoad.apply(this, arguments);
    };
    if (process.env.MUSIC_PROFILE_TEST_FAIL_WRITE === '1') {
      const originalRenameSync = fs.renameSync;
      fs.renameSync = function(source, target) {
        if (String(target) === process.env.MINERADIO_MUSIC_PROFILE_FILE) {
          const error = new Error('forced music profile write failure');
          error.code = 'EACCES';
          throw error;
        }
        return originalRenameSync.apply(this, arguments);
      };
    }
    require(${JSON.stringify(serverFile)});
  `;
  const child = spawn(process.execPath, ['-e', bootstrap], {
    cwd: root,
    env: Object.assign({}, process.env, {
      HOST: '127.0.0.1',
      PORT: String(port),
      MINERADIO_MUSIC_PROFILE_FILE: profileFile,
      MUSIC_PROFILE_TEST_FAIL_WRITE: failProfileWrite ? '1' : '0',
    }),
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderrOutput = '';
  child.stderr.on('data', (chunk) => { child.stderrOutput += chunk; });
  await waitForServer(port, child);
  return { child, port };
}

function stopServer(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill();
  });
}

function profileEvent(id) {
  return {
    id,
    kind: 'favorite',
    progress: 1,
    at: Date.now(),
    song: {
      provider: 'netease',
      id: '42',
      type: 'music',
      profileMetadata: { styles: ['rock'], languages: ['zh'] },
    },
  };
}

test('music profile HTTP API enforces methods, validation, and persisted state', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-profile-http-'));
  const profileFile = path.join(tempDir, 'music-profile.json');
  let running;
  try {
    running = await startServer(profileFile);
    let response = await request(running.port, 'GET', '/api/music-profile');
    assert.equal(response.status, 200);
    assert.deepEqual(response.json.profile, {
      enabled: false, recommendationMode: false, ready: false, remainingSongs: 5, tags: [], recoveredTags: [],
    });

    response = await request(running.port, 'POST', '/api/music-profile');
    assert.equal(response.status, 405);
    assert.equal(response.json.error, 'METHOD_NOT_ALLOWED');
    response = await request(running.port, 'POST', '/api/music-profile/enable', { enabled: 'true' });
    assert.equal(response.status, 400);
    response = await request(running.port, 'POST', '/api/music-profile/enable', { enabled: true, extra: true });
    assert.equal(response.status, 400);
    response = await request(running.port, 'POST', '/api/music-profile/enable', { enabled: true });
    assert.equal(response.status, 200);
    assert.equal(response.json.profile.enabled, true);

    response = await request(running.port, 'POST', '/api/music-profile/recommendation-mode', { enabled: 1 });
    assert.equal(response.status, 400);
    response = await request(running.port, 'POST', '/api/music-profile/recommendation-mode', { enabled: true });
    assert.equal(response.status, 200);
    assert.equal(response.json.profile.recommendationMode, true);
    response = await request(running.port, 'POST', '/api/music-profile/event', Object.assign(profileEvent('bad-progress'), { progress: 1.01 }));
    assert.equal(response.status, 400);
    for (const key of ['cookie', 'url', 'lyric', 'cover']) {
      const rejectedEvent = profileEvent(`sensitive-${key}`);
      rejectedEvent.song[key] = 'secret-value';
      response = await request(running.port, 'POST', '/api/music-profile/event', rejectedEvent);
      assert.equal(response.status, 400, `event with ${key} must be rejected`);
      assert.equal(JSON.parse(fs.readFileSync(profileFile, 'utf8')).events.length, 0);
    }
    response = await request(running.port, 'POST', '/api/music-profile/event', profileEvent('saved-event'));
    assert.equal(response.status, 200);
    assert.equal(response.json.profile.remainingSongs, 4);
    const persistedProfile = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
    assert.equal(persistedProfile.events.length, 1);
    assertNoProfileSensitiveKeys(persistedProfile);
    response = await request(running.port, 'POST', '/api/music-profile/tag-preference', { key: 'invalid', reduced: true });
    assert.equal(response.status, 400);
    response = await request(running.port, 'POST', '/api/music-profile/tag-preference', { key: 'style:rock', reduced: true });
    assert.equal(response.status, 200);
    assert.equal(response.json.profile.tags.find((tag) => tag.key === 'style:rock').reduced, true);
    assert.ok(JSON.parse(fs.readFileSync(profileFile, 'utf8')).reducedTags['style:rock']);
    response = await request(running.port, 'POST', '/api/music-profile/enable', { enabled: false });
    assert.equal(response.status, 200);
    assert.equal(response.json.profile.enabled, false);
    assert.equal(response.json.profile.recommendationMode, false);
    assert.equal(JSON.parse(fs.readFileSync(profileFile, 'utf8')).recommendationMode, false);
    response = await request(running.port, 'POST', '/api/music-profile/clear', {});
    assert.equal(response.status, 200);
    assert.deepEqual(response.json.profile, {
      enabled: false, recommendationMode: false, ready: false, remainingSongs: 5, tags: [], recoveredTags: [],
    });
    assert.deepEqual(JSON.parse(fs.readFileSync(profileFile, 'utf8')), {
      version: 1, enabled: false, recommendationMode: false, events: [], reducedTags: {},
    });
    await stopServer(running.child);
    running = null;

    running = await startServer(profileFile);
    response = await request(running.port, 'GET', '/api/music-profile');
    assert.equal(response.status, 200);
    assert.equal(response.json.profile.enabled, false);
    assert.equal(response.json.profile.recommendationMode, false);
    assert.equal(response.json.profile.remainingSongs, 5);
  } finally {
    if (running) await stopServer(running.child);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('music profile tag recovery persists its permanent terminal state', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-profile-recovery-'));
  const profileFile = path.join(tempDir, 'music-profile.json');
  let running;
  try {
    running = await startServer(profileFile);
    let response = await request(running.port, 'POST', '/api/music-profile/enable', { enabled: true });
    assert.equal(response.status, 200);
    response = await request(running.port, 'POST', '/api/music-profile/tag-preference', { key: 'style:rock', reduced: true });
    assert.equal(response.status, 200);

    for (let index = 0; index < 5; index += 1) {
      response = await request(running.port, 'POST', '/api/music-profile/event', {
        ...profileEvent(`recovery-${index}`),
        at: Date.now() + 1000 + index,
        song: {
          provider: 'netease',
          id: `recovery-${index}`,
          type: 'music',
          profileMetadata: { styles: ['rock'], languages: ['zh'] },
        },
      });
      assert.equal(response.status, 200);
    }

    const recovered = response.json.profile.tags.find((tag) => tag.key === 'style:rock');
    assert.equal(recovered.reduced, false);
    assert.ok(response.json.profile.recoveredTags.some((tag) => tag.key === 'style:rock'));
    const storedPreference = JSON.parse(fs.readFileSync(profileFile, 'utf8')).reducedTags['style:rock'];
    assert.equal(typeof storedPreference.recoveredAt, 'number');
    assert.equal(storedPreference.recoveryEvidenceSongs, 5);
  } finally {
    if (running) await stopServer(running.child);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('profile write failures do not report or retain unpersisted event changes', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-profile-write-failure-'));
  const profileFile = path.join(tempDir, 'music-profile.json');
  fs.writeFileSync(profileFile, JSON.stringify({
    version: 1, enabled: true, recommendationMode: false, events: [], reducedTags: {},
  }), 'utf8');
  let running;
  try {
    running = await startServer(profileFile);
    const saved = await request(running.port, 'POST', '/api/music-profile/event', profileEvent('already-persisted'));
    assert.equal(saved.status, 200);
    await stopServer(running.child);
    running = null;
    const beforeIdempotentRetry = fs.readFileSync(profileFile, 'utf8');

    running = await startServer(profileFile, true);
    const idempotent = await request(running.port, 'POST', '/api/music-profile/event', profileEvent('already-persisted'));
    assert.equal(idempotent.status, 200);
    assert.equal(idempotent.json.profile.remainingSongs, 4);
    assert.equal(fs.readFileSync(profileFile, 'utf8'), beforeIdempotentRetry);
    const failed = await request(running.port, 'POST', '/api/music-profile/event', profileEvent('retry-after-write-failure'));
    assert.equal(failed.status, 500);
    const afterFailure = await request(running.port, 'GET', '/api/music-profile');
    assert.equal(afterFailure.status, 200);
    assert.equal(afterFailure.json.profile.remainingSongs, 4);
    const listenResponse = await request(running.port, 'POST', '/api/listen/report', {});
    assert.equal(listenResponse.status, 200);
    assert.equal(listenResponse.json.accepted, false);
    await stopServer(running.child);
    running = null;

    running = await startServer(profileFile);
    const retry = await request(running.port, 'POST', '/api/music-profile/event', profileEvent('retry-after-write-failure'));
    assert.equal(retry.status, 200);
    assert.equal(retry.json.profile.remainingSongs, 4);
    await stopServer(running.child);
    running = null;
    assert.deepEqual(JSON.parse(fs.readFileSync(profileFile, 'utf8')).events.map((event) => event.id), ['already-persisted', 'retry-after-write-failure']);
  } finally {
    if (running) await stopServer(running.child);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
