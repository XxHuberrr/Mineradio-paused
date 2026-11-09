'use strict';

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

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-spotify-setup-'));
const qaScript = path.join(tempDir, 'spotify-setup-qa.js');
const preload = path.join(tempDir, 'spotify-setup-preload.js');

fs.writeFileSync(preload, `
try { window.localStorage.setItem('mineradio-startup-fast-skip-v1', 'true'); } catch (_) {}
`, 'utf8');

fs.writeFileSync(qaScript, `
const path = require('path');
const { app, BrowserWindow } = require('electron');
const appRoot = process.env.MINERADIO_QA_APP_ROOT;
const preload = process.env.MINERADIO_QA_PRELOAD;

function finish(code, payload) {
  console.log('MINERADIO_SPOTIFY_SETUP_QA:' + JSON.stringify(payload));
  setTimeout(() => app.exit(code), 60);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    frame: false,
    transparent: true,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      offscreen: true,
      backgroundThrottling: false,
      preload,
    },
  });
  await win.loadFile(path.join(appRoot, 'public', 'index.html'));
  await new Promise(resolve => setTimeout(resolve, 1800));
  const result = await win.webContents.executeJavaScript(\`
    (() => {
      const modal = document.getElementById('login-modal');
      const panel = document.querySelector('.dual-login-modal');
      const drawer = document.getElementById('login-auth-drawer');
      const wizard = document.getElementById('spotify-setup-wizard');
      if (modal) modal.classList.add('show');
      if (panel) panel.classList.add('spotify-setup-open');
      if (drawer) drawer.classList.add('show', 'spotify-mode');
      if (wizard) wizard.setAttribute('aria-hidden', 'false');
      const cards = Array.from(document.querySelectorAll('.spotify-setup-card'));
      const cardRects = cards.map(card => card.getBoundingClientRect());
      const panelRect = panel && panel.getBoundingClientRect();
      const gridStyle = wizard && getComputedStyle(document.querySelector('.spotify-setup-steps'));
      const checks = {
        fourCards: cards.length === 4,
        ordered: cards.map(card => card.dataset.step).join(',') === '1,2,3,4',
        functions: typeof saveSpotifySetupClientId === 'function' && typeof verifySpotifySetupCallback === 'function' && typeof openSpotifyWebLogin === 'function' && typeof runSpotifySetupDiagnostics === 'function',
        widePanel: !!panelRect && panelRect.width >= 820,
        twoColumn: !!gridStyle && gridStyle.gridTemplateColumns.split(' ').length >= 2,
        readableCards: cardRects.every(rect => rect.width >= 330 && rect.height >= 120),
        noGenericBody: !!drawer && Array.from(drawer.children).filter(node => node.classList.contains('login-auth-body')).every(node => getComputedStyle(node).display === 'none'),
      };
      return { ok: Object.values(checks).every(Boolean), checks, panelWidth: panelRect && panelRect.width, cardRects: cardRects.map(rect => ({ width: rect.width, height: rect.height })) };
    })()
  \`, true);
  finish(result && result.ok ? 0 : 1, result || { ok: false, reason: 'no-result' });
}).catch(error => finish(1, { ok: false, error: String(error && error.stack || error) }));
`, 'utf8');

try {
  const result = spawnSync(electron, [qaScript], {
    cwd: appRoot,
    env: { ...process.env, MINERADIO_QA_APP_ROOT: appRoot, MINERADIO_QA_PRELOAD: preload },
    encoding: 'utf8',
    timeout: 30000,
  });
  const stdout = String(result.stdout || '');
  const match = stdout.match(/MINERADIO_SPOTIFY_SETUP_QA:(\{.*\})/);
  const payload = match ? JSON.parse(match[1]) : null;
  if (result.error || result.status !== 0 || !payload || payload.ok !== true) {
    process.stdout.write(stdout);
    process.stderr.write(result.stderr || '');
    throw result.error || new Error('Spotify setup Electron smoke failed with exit code ' + result.status);
  }
  console.log('[OK] Spotify four-step setup wizard is spacious, ordered, and fully wired in Electron.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
