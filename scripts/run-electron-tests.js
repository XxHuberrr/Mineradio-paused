#!/usr/bin/env node
'use strict';

// Electron integration test runner.
// Used by electron-integration.yml when an Electron binary is available (Windows runner).

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.join(__dirname, '..');

function run(file) {
  process.stdout.write(`=== ${path.basename(file)} ===\n`);
  const result = spawnSync(
    process.execPath,
    [file],
    { stdio: 'inherit', timeout: 300_000, env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' } }
  );
  process.stdout.write(`EXIT: ${result.status}\n`);
  return result.status === 0;
}

const TEST_FILE = process.argv[2];
let failed = 0;
let passed = 0;

if (TEST_FILE) {
  const full = path.join(rootDir, 'tests', TEST_FILE);
  if (!fs.existsSync(full)) {
    process.stderr.write(`file not found: ${full}\n`);
    process.exit(1);
  }
  run(full) ? passed++ : failed++;
} else {
  const files = fs.readdirSync(path.join(rootDir, 'tests'))
    .filter(f => f.endsWith('.test.js'))
    .sort();
  for (const file of files) {
    run(path.join(rootDir, 'tests', file)) ? passed++ : failed++;
  }
}

process.stdout.write(`\n${passed} passed, ${failed} failed, ${passed + failed} total\n`);
process.exit(failed > 0 ? 1 : 0);
