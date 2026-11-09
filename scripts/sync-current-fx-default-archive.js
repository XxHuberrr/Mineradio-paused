#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appRoot = path.resolve(__dirname, '..');
const defaultsPath = path.join(appRoot, 'public', 'js', 'modules', '00-state', '04-fx-defaults.js');
const archivePath = path.join(appRoot, 'public', 'default-user-fx-archive.json');
const sourceArgIndex = process.argv.indexOf('--source');
const sourcePath = sourceArgIndex >= 0 && process.argv[sourceArgIndex + 1]
  ? path.resolve(process.argv[sourceArgIndex + 1])
  : path.join(process.env.APPDATA || '', 'Mineradio', 'current-fx-autosave.json');
const shouldWrite = process.argv.includes('--write');

function readFxDefaults() {
  const text = fs.readFileSync(defaultsPath, 'utf8');
  const marker = 'var fxDefaults = ';
  const start = text.indexOf(marker);
  const end = text.indexOf('\n};', start);
  if (start < 0 || end < 0) throw new Error('Unable to locate fxDefaults object.');
  return vm.runInNewContext(`(${text.slice(start + marker.length, end + 2)})`, Object.create(null));
}

const current = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const defaults = readFxDefaults();
const keys = Object.keys(defaults);
const missing = keys.filter(key => !Object.prototype.hasOwnProperty.call(current, key));
const mismatched = keys.filter(key => JSON.stringify(defaults[key]) !== JSON.stringify(current[key]));
if (missing.length || mismatched.length) {
  throw new Error(`Runtime defaults are not synchronized with the captured settings. Missing: ${missing.join(', ') || 'none'}; mismatched: ${mismatched.join(', ') || 'none'}.`);
}

const snapshot = { visualPresetSchema: current.visualPresetSchema || 'skull-preset-v2' };
for (const key of keys) snapshot[key] = current[key];
const timestamp = Number(current.autosavedAt) || Date.now();
const archive = {
  type: 'mineradio-user-fx-archive',
  schema: 1,
  exportedAt: timestamp,
  name: '默认测试',
  savedAt: timestamp,
  snapshot
};
const output = `${JSON.stringify(archive, null, 2)}\n`;

if (!shouldWrite) {
  console.log(`[DRY RUN] ${keys.length} settings match ${sourcePath}. Add --write to refresh ${archivePath}.`);
  process.exit(0);
}

fs.writeFileSync(archivePath, output, 'utf8');
console.log(`[OK] Wrote ${keys.length} captured settings to ${archivePath}.`);
