'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function identifier(name, value, fallback, maxLength) {
  const text = String(value == null || value === '' ? fallback : value).trim();
  if (!text || text.length > maxLength || !IDENTIFIER.test(text)) {
    const error = new Error(`INVALID_CUEFIELD_VERSION_IDENTIFIER:${name}`);
    error.code = 'INVALID_CUEFIELD_VERSION_IDENTIFIER';
    throw error;
  }
  return text;
}

function cuefieldSourceFiles(root) {
  const files = [];
  const addTree = (directory) => {
    if (!fs.existsSync(directory)) return;
    fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
      .forEach((entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) addTree(entryPath);
        else if (entry.isFile() && entry.name.endsWith('.js')) files.push(entryPath);
      });
  };

  addTree(path.join(root, 'cuefield'));
  const server = path.join(root, 'server.js');
  if (fs.existsSync(server)) files.push(server);
  const publicDir = path.join(root, 'public');
  const index = path.join(publicDir, 'index.html');
  if (fs.existsSync(index)) files.push(index);
  if (fs.existsSync(publicDir)) {
    fs.readdirSync(publicDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^cuefield-.*\.js$/.test(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name))
      .forEach((entry) => files.push(path.join(publicDir, entry.name)));
  }
  return [...new Set(files)].sort();
}

function sourceFingerprint(root) {
  const hash = crypto.createHash('sha256');
  cuefieldSourceFiles(root).forEach((file) => {
    hash.update(path.relative(root, file).split(path.sep).join('/'));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  });
  return hash.digest('hex').slice(0, 16);
}

function variantBuildSha(baseSha, variantId) {
  if (variantId === 'current') return baseSha;
  return crypto.createHash('sha256').update(`${baseSha}\0${variantId}`).digest('hex').slice(0, 16);
}

function buildCuefieldVersion({ root, appVersion, env = process.env } = {}) {
  const sourceRoot = path.resolve(root || path.join(__dirname, '..'));
  const variantId = identifier('variantId', env.CUEFIELD_VARIANT_ID, 'current', 48);
  const configuredSha = env.CUEFIELD_BUILD_SHA
    ? identifier('buildSha', env.CUEFIELD_BUILD_SHA, '', 40)
    : sourceFingerprint(sourceRoot);
  const normalizedAppVersion = String(appVersion || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '-');

  return Object.freeze({
    buildSha: variantBuildSha(configuredSha, variantId),
    plannerVersion: identifier('plannerVersion', env.CUEFIELD_PLANNER_VERSION, 'cuefield-planner-v1', 48),
    runtimeVersion: identifier('runtimeVersion', env.CUEFIELD_RUNTIME_VERSION, `mineradio-${normalizedAppVersion}`, 48),
    capabilityLevel: identifier('capabilityLevel', env.CUEFIELD_CAPABILITY_LEVEL, 'whole-track-baseline', 40),
    stemAnalyzer: env.CUEFIELD_STEM_ANALYZER
      ? identifier('stemAnalyzer', env.CUEFIELD_STEM_ANALYZER, '', 40)
      : '',
    stemModelVersion: env.CUEFIELD_STEM_MODEL_VERSION
      ? identifier('stemModelVersion', env.CUEFIELD_STEM_MODEL_VERSION, '', 64)
      : '',
    auditionCohort: identifier('auditionCohort', env.CUEFIELD_AUDITION_COHORT, 'live', 48),
    variantId,
  });
}

module.exports = {
  buildCuefieldVersion,
  cuefieldSourceFiles,
};

