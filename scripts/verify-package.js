#!/usr/bin/env node
'use strict';

// Build artifact integrity checker.
// Used by package-integrity.yml after a Windows build.

const fs = require('node:fs');
const path = require('node:path');

const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const errors = [];

function error(msg) {
  errors.push(msg);
  process.stderr.write(`[ERR] ${msg}\n`);
}

function ok(msg) {
  process.stdout.write(`[OK] ${msg}\n`);
}

function warn(msg) {
  process.stdout.write(`[WARN] ${msg}\n`);
}

function walkDir(dir) {
  const result = [];
  try {
    for (const entry of fs.readdirSync(dir, { recursive: true })) {
      result.push(entry);
    }
  } catch { /* dir missing — handled by caller */ }
  return result;
}

const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  warn('dist/ not found — skip build-artifact checks (run build first)');
} else {
  const unpacked = path.join(distDir, 'win-unpacked');
  if (fs.existsSync(unpacked)) {
    ok('win-unpacked/ present');
    fs.existsSync(path.join(unpacked, 'Mineradio.exe'))
      ? ok('Mineradio.exe present')
      : warn('Mineradio.exe missing from win-unpacked/');
    ok(`expected version: ${PKG.version}`);
  }

  const allFiles = walkDir(distDir);

  const dangerous = [
    '.cookie', '.qq-cookie', '.kugou-cookie', '.qishui-cookie', '.qishui-token',
    '.qishui-oauth.json', '.qishui-qr-identity.json', '.qishui-qr-login.json',
    '.spotify-credentials.json', '.env',
  ];
  for (const bad of dangerous) {
    if (allFiles.some(f => f.endsWith(bad) || f.includes(bad))) {
      error(`Sensitive file found in build: ${bad}`);
    }
  }

  const testFiles = allFiles.filter(f => f.endsWith('.test.js'));
  testFiles.length > 0
    ? error('Test files found in build artifact')
    : ok('No test files in build artifact');

  const sourceMaps = allFiles.filter(f => f.endsWith('.map'));
  if (sourceMaps.length > 0) warn(`Source maps found: ${sourceMaps.length} files`);

  const installers = allFiles.filter(f => f.endsWith('.exe'));
  for (const inst of installers) {
    const basename = path.basename(inst);
    const expected = `Mineradio-${PKG.version}-Setup.exe`;
    basename === expected
      ? ok(`Installer named correctly: ${basename}`)
      : warn(`Installer name: ${basename} (expected: ${expected})`);
  }
}

const secretPatterns = [
  /-----BEGIN RSA PRIVATE KEY-----/,
  /-----BEGIN PRIVATE KEY-----/,
  /ghp_[A-Za-z0-9]{36}/,
  /gho_[A-Za-z0-9]{36}/,
];
for (const dir of ['desktop', 'public']) {
  const full = path.join(__dirname, '..', dir);
  if (!fs.existsSync(full)) continue;
  for (const f of walkDir(full)) {
    const fp = path.join(full, f);
    let content;
    try { content = fs.readFileSync(fp, 'utf8'); } catch { continue; }
    for (const pat of secretPatterns) {
      if (pat.test(content)) error(`Potential secret in source: ${fp}`);
    }
  }
}
ok('Source tree checked for secrets');

if (errors.length > 0) {
  process.stdout.write(`\n${errors.length} error(s), exiting with code 1\n`);
  process.exit(1);
}
process.stdout.write('\nAll checks passed\n');
process.exit(0);
