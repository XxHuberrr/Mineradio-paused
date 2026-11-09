const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const appRoot = path.resolve(__dirname, '..');
const mainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
const preloadText = fs.readFileSync(path.join(appRoot, 'desktop', 'preload.js'), 'utf8');

test('desktop update bridge opens only bounded HTTPS pages from the trusted main document', () => {
  assert.match(mainText, /ipcMain\.handle\('mineradio-open-update-page', async \(event, value\) =>/);
  assert.match(mainText, /if \(!isTrustedMainWindowIpc\(event\)\) return \{ ok: false, error: 'UNTRUSTED_SENDER' \}/);
  assert.match(mainText, /target\.length > 2048/);
  assert.match(mainText, /parsed\.protocol !== 'https:'/);
  assert.match(mainText, /await shell\.openExternal\(parsed\.href\)/);
  assert.match(preloadText, /openUpdatePage: \(url\) => ipcRenderer\.invoke\('mineradio-open-update-page', String\(url \|\| ''\)\)/);
});

test('local update installer and update-cache bridges are absent', () => {
  const bridgeText = mainText + '\n' + preloadText;
  assert.doesNotMatch(bridgeText, /mineradio-open-update-installer/);
  assert.doesNotMatch(bridgeText, /openUpdateInstaller/);
  assert.doesNotMatch(mainText, /getUpdateDownloadDir/);
  assert.doesNotMatch(mainText, /MINERADIO_UPDATE_DIR/);
  assert.doesNotMatch(mainText, /shell\.openPath\(/);
});
