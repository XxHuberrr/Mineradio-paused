#!/usr/bin/env node
'use strict';

// Unified Node-level test runner — runs all tests/*.test.js and aggregates results.
// Used by ci.yml and package.json "test:ci" script.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TESTS_DIR = path.join(__dirname, '..', 'tests');
const files = fs
  .readdirSync(TESTS_DIR)
  .filter((f) => f.endsWith('.test.js'))
  .sort();

let failed = 0;
let passed = 0;
const start = Date.now();

for (const file of files) {
  const filePath = path.join(TESTS_DIR, file);
  process.stdout.write(`=== ${file} ===\n`);
  const result = spawnSync(process.execPath, [filePath], {
    stdio: 'inherit',
    timeout: 120_000,
  });
  if (result.status !== 0) {
    failed++;
    process.stderr.write(`\nFAIL: ${file} (exit ${result.status})\n`);
  } else {
    passed++;
  }
}

const elapsed = Math.round((Date.now() - start) / 1000);
process.stdout.write(`\n${passed} passed, ${failed} failed, ${files.length} total (${elapsed}s)\n`);

if (failed > 0) {
  process.exit(1);
}
