'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
const dashboardScript = fs.readFileSync(
  path.join(appRoot, 'public', 'js', 'modules', '05-playback', '03a-home-dashboard.js'),
  'utf8',
);
const indexCss = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');

function hasClassTag(source, tagName, className) {
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  return Array.from(source.matchAll(tagPattern)).some((match) => {
    const classAttribute = match[0].match(/\bclass=["']([^"']*)["']/i);
    return classAttribute && classAttribute[1].split(/\s+/).includes(className);
  });
}

function hasIdAndClassTag(source, tagName, id, className) {
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const idPattern = new RegExp(`\\bid=["']${id}["']`, 'i');
  return Array.from(source.matchAll(tagPattern)).some((match) => {
    const classAttribute = match[0].match(/\bclass=["']([^"']*)["']/i);
    return idPattern.test(match[0])
      && classAttribute
      && classAttribute[1].split(/\s+/).includes(className);
  });
}

function cssRuleSelectors(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  const ruleStart = /([^{}]+)\{/g;
  let match;
  while ((match = ruleStart.exec(withoutComments))) {
    const header = match[1].trim();
    if (!header || header.startsWith('@')) continue;
    header.split(',').map((part) => part.trim()).filter(Boolean).forEach((part) => selectors.push(part));
  }
  return selectors;
}

function isHomeScopedSelector(selector) {
  if (selector.includes('#empty-home')) return true;
  return /body(?:\.[\w-]+)*\.[\w-]*home[\w-]*(?:\.[\w-]+)*(?:\s|>|\+|~)/i.test(selector);
}

function namedFunctionSource(source, name) {
  const declaration = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  if (!declaration) return '';
  const bodyStart = source.indexOf('{', declaration.index + declaration[0].length);
  if (bodyStart < 0) return '';

  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(declaration.index, index + 1);
    }
  }
  return '';
}

test('new home discovery strip is present in the homepage DOM', () => {
  assert.equal(
    hasClassTag(indexHtml, 'section', 'home-discovery-strip'),
    true,
    'expected a section.home-discovery-strip on the Mineradio homepage',
  );
  assert.equal(
    hasIdAndClassTag(indexHtml, 'div', 'home-discovery-list', 'home-discovery-list'),
    true,
    'expected #home-discovery-list.home-discovery-list as the discovery render target',
  );
});

test('dashboard selects local discovery candidates and keeps cover swaps stable', () => {
  const candidateSelector = namedFunctionSource(dashboardScript, 'homeDashboardDiscoverySongs');
  assert.ok(candidateSelector, 'expected homeDashboardDiscoverySongs()');
  assert.match(candidateSelector, /homeDiscoverState\s*&&[\s\S]{0,180}?homeDiscoverState\.songs/);
  assert.match(candidateSelector, /homeDashboardLocalSongs\s*\(\s*\)/);
  assert.match(
    candidateSelector,
    /(?:Math\.min\s*\(\s*3\b|\.slice\s*\(\s*0\s*,\s*3\s*\)|picked\.length\s*<\s*3\b)/,
    'candidate selection should stay bounded to three homepage songs',
  );

  const stableCoverUpdate = namedFunctionSource(dashboardScript, 'homeDashboardSetStableBackgroundImage');
  assert.ok(stableCoverUpdate, 'expected homeDashboardSetStableBackgroundImage()');
  assert.match(stableCoverUpdate, /new\s+Image\s*\(\s*\)/, 'stable cover updates should preload an image');
  assert.match(
    stableCoverUpdate,
    /if\s*\([^)]*(?:requested|Requested)[^)]*===\s*[^)]*\)\s*return/i,
    'stable cover updates should ignore duplicate requested sources',
  );
  const stableCoverCalls = dashboardScript.match(/homeDashboardSetStableBackgroundImage\s*\(/g) || [];
  assert.ok(stableCoverCalls.length >= 3, 'stable cover helper should be used by more than one homepage surface');
});

test('discovery song playback uses the existing Mineradio queue path', () => {
  assert.ok(
    namedFunctionSource(dashboardScript, 'renderHomeDashboardDiscovery'),
    'expected renderHomeDashboardDiscovery()',
  );
  const discoveryPlayback = namedFunctionSource(dashboardScript, 'playHomeDashboardDiscoverySong');
  assert.ok(discoveryPlayback, 'expected playHomeDashboardDiscoverySong()');
  assert.match(
    discoveryPlayback,
    /playQueue\s*=\s*[\w.]+\.map\s*\(\s*(?:cloneSong|function\s*\([^)]*\)\s*\{\s*return\s+cloneSong\s*\([^)]*\)\s*;?\s*\})\s*\)/,
  );
  assert.match(discoveryPlayback, /currentIdx\s*=/);
  assert.match(discoveryPlayback, /playQueueAt\s*\(\s*currentIdx\b/);
  assert.match(discoveryPlayback, /type\s*:\s*['"]home-discovery['"]/);
});

test('homepage update does not import LX-only data paths', () => {
  for (const forbidden of ['/api/daily-hot', '/api/lx-source/search', 'heartbeatPlaylist', 'lxMirror']) {
    assert.equal(
      dashboardScript.includes(forbidden),
      false,
      `03a-home-dashboard.js must not depend on ${forbidden}`,
    );
  }
});

test('discovery CSS stays scoped to the homepage surface', () => {
  const discoverySelectors = cssRuleSelectors(indexCss).filter((selector) => selector.includes('.home-discovery-'));
  assert.ok(discoverySelectors.length > 0, 'expected CSS rules for the homepage discovery strip');

  for (const requiredClass of [
    '.home-discovery-strip',
    '.home-discovery-list',
    '.home-discovery-song',
    '.home-discovery-cover',
  ]) {
    assert.ok(
      discoverySelectors.some((selector) => selector.includes(requiredClass)),
      `expected a scoped CSS rule for ${requiredClass}`,
    );
  }

  const unscopedSelectors = discoverySelectors.filter((selector) => !isHomeScopedSelector(selector));
  assert.deepEqual(
    unscopedSelectors,
    [],
    `discovery rules leaked outside the homepage: ${unscopedSelectors.join(', ')}`,
  );
});
