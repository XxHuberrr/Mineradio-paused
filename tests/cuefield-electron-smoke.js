const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const electron = path.join(appRoot, 'node_modules', 'electron', 'dist', 'electron.exe');

if (!fs.existsSync(electron)) {
  console.log('[SKIP] Electron executable not installed.');
  process.exit(0);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-cuefield-electron-'));
const qaScript = path.join(tempDir, 'cuefield-qa.js');
const preload = path.join(tempDir, 'cuefield-preload.js');

fs.writeFileSync(preload, `
try {
  window.localStorage.setItem('mineradio-startup-fast-skip-v1', 'true');
  window.localStorage.removeItem('mineradio-cuefield-automix-v1');
} catch (_) {}
`, 'utf8');

fs.writeFileSync(qaScript, `
const path = require('path');
const { app, BrowserWindow } = require('electron');

const appRoot = process.env.MINERADIO_QA_APP_ROOT;
const preload = process.env.MINERADIO_QA_PRELOAD;

function finish(code, payload) {
  console.log('MINERADIO_CUEFIELD_QA:' + JSON.stringify(payload));
  setTimeout(() => app.exit(code), 60);
}

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

app.whenReady().then(async () => {
  const logs = [];
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      backgroundThrottling: false,
      offscreen: true,
      preload,
    },
  });

  win.webContents.on('console-message', (_event, details) => {
    logs.push(String(details && details.message || '').slice(0, 320));
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    finish(1, { ok: false, reason: 'render-process-gone', details, logs: logs.slice(-12) });
  });

  await win.loadFile(path.join(appRoot, 'public', 'index.html'));
  const deadline = Date.now() + 10000;
  let result = null;
  while (Date.now() < deadline) {
    result = await win.webContents.executeJavaScript(` + "`" + `(() => {
      const button = document.getElementById('cuefield-automix-btn');
      const checks = {
        core: !!(window.CuefieldAutoMix && typeof window.CuefieldAutoMix.createCuefieldAutoMix === 'function'),
        timeline: !!(window.CuefieldTimelineExecutor && typeof window.CuefieldTimelineExecutor.buildCuefieldTimelineExecution === 'function'),
        bridge: !!(window.CuefieldBridgeEngine && typeof window.CuefieldBridgeEngine.createCuefieldBridgeEngine === 'function'),
        sourceLoop: !!(window.CuefieldSourceLoop && typeof window.CuefieldSourceLoop.createCuefieldSourceLoop === 'function'),
        integration: typeof window.toggleCuefieldAutoMix === 'function',
        button: !!button,
        defaultOff: !!button && button.getAttribute('aria-pressed') === 'false',
      };
      return { ready: Object.values(checks).every(Boolean), checks };
    })()` + "`" + `, true);
    if (result && result.ready) break;
    await new Promise(resolve => setTimeout(resolve, 120));
  }

  const failedLogs = logs.filter(line => /(?:Cuefield|SyntaxError|ReferenceError)/i.test(line));
  const ok = !!(result && result.ready) && !failedLogs.some(line => /(?:SyntaxError|ReferenceError)/i.test(line));
  finish(ok ? 0 : 1, { ok, result, failedLogs, logs: logs.slice(-12) });
}).catch(error => finish(1, { ok: false, error: String(error && error.stack || error) }));
`, 'utf8');

try {
  const result = spawnSync(electron, [qaScript], {
    cwd: appRoot,
    env: {
      ...process.env,
      MINERADIO_QA_APP_ROOT: appRoot,
      MINERADIO_QA_PRELOAD: preload,
    },
    encoding: 'utf8',
    timeout: 30000,
  });
  const stdout = String(result.stdout || '');
  const match = stdout.match(/MINERADIO_CUEFIELD_QA:(\{.*\})/);
  const payload = match ? JSON.parse(match[1]) : null;
  if (result.error || result.status !== 0 || !payload || payload.ok !== true) {
    process.stdout.write(stdout);
    process.stderr.write(result.stderr || '');
    throw result.error || new Error(`Cuefield Electron smoke failed with exit code ${result.status}`);
  }
  console.log('[OK] Cuefield Electron runtime modules loaded in order and remain default-off.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
