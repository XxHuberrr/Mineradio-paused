'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const mainText = fs.readFileSync(path.join(appRoot, 'desktop', 'main.js'), 'utf8');
const quickCheckText = fs.readFileSync(path.join(appRoot, 'scripts', 'quick-check.js'), 'utf8');

test('startup QA isolates its disposable userData away from the real profile', () => {
  assert.match(mainText, /MINERADIO_STARTUP_QA_USER_DATA/);
  assert.match(mainText, /MINERADIO_STARTUP_QA_HIDDEN !== '1'/);
  assert.match(mainText, /path\.isAbsolute\(value\)/);
  assert.match(mainText, /STARTUP_QA_USER_DATA_PATH \|\| path\.join\(app\.getPath\('appData'\), APP_NAME\)/);
  assert.match(quickCheckText, /path\.join\(process\.env\.TEMP \|\| appData, 'mineradio-startup-qa'\)/);
  assert.match(quickCheckText, /MINERADIO_STARTUP_QA_USER_DATA:\s*qaUserData/);
  assert.match(quickCheckText, /removeOwnedStartupQaDirectory\(qaUserData, qaUserDataParent, runtimeName\)/);
});
