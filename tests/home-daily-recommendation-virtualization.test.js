'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.resolve(__dirname, '..');
const dashboardScript = fs.readFileSync(
  path.join(appRoot, 'public', 'js', 'modules', '05-playback', '03a-home-dashboard.js'),
  'utf8',
);
const homeActionsScript = fs.readFileSync(
  path.join(appRoot, 'public', 'js', 'modules', '05-playback', '04-home-empty-wallpaper.js'),
  'utf8',
);

function namedFunctionSource(source, name) {
  const declaration = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
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

test('daily recommendation modal consumes the full frontend dataset without an eight-song slice', () => {
  const render = namedFunctionSource(dashboardScript, 'renderHomePlatformRecommendations');
  assert.ok(render, 'expected renderHomePlatformRecommendations()');
  assert.match(render, /var songs = Array\.isArray\(homeDiscoverState\.songs\) \? homeDiscoverState\.songs : \[\]/);
  assert.doesNotMatch(render, /homeDiscoverState\.songs\.slice\s*\(\s*0\s*,\s*8\s*\)/);
  assert.match(render, /id="home-platform-daily-grid"/);
  assert.match(render, /renderHomePlatformDailyWindow\s*\(\s*true\s*\)/);
  assert.match(render, /已读取全部/);
  assert.doesNotMatch(render, /热门播客|网易云热门播客|netease-podcast/);
});

test('daily recommendation viewport range exposes every index while keeping each DOM window bounded', () => {
  const rangeSource = namedFunctionSource(dashboardScript, 'homePlatformRecommendationDailyRange');
  assert.ok(rangeSource, 'expected homePlatformRecommendationDailyRange()');
  const context = {
    HOME_PLATFORM_DAILY_ROW_HEIGHT: 84,
    HOME_PLATFORM_DAILY_OVERSCAN_ROWS: 3,
    HOME_PLATFORM_DAILY_MAX_RENDERED_CARDS: 24,
  };
  const range = vm.runInNewContext(`(${rangeSource})`, context);

  const first = range(80, 2, 0, 500, 0);
  assert.equal(first.start, 0);
  assert.ok(first.end - first.start <= 24, 'first DOM window must stay within 24 cards');
  assert.ok(first.bottomRows > 0, 'remaining recommendations should stay represented by a spacer');

  const last = range(80, 2, 100000, 500, 0);
  assert.equal(last.end, 80, 'scrolling to the end must expose the final recommendation');
  assert.ok(last.end - last.start <= 24, 'last DOM window must stay within 24 cards');
  assert.ok(last.start > 0, 'old off-screen cards should leave the DOM');
});

test('virtualized daily cards preserve absolute indexes and full-queue playback', () => {
  const renderWindow = namedFunctionSource(dashboardScript, 'renderHomePlatformDailyWindow');
  assert.ok(renderWindow, 'expected renderHomePlatformDailyWindow()');
  assert.match(renderWindow, /for \(var index = range\.start; index < range\.end; index \+= 1\)/);
  assert.match(renderWindow, /homePlatformRecommendationCard\('netease-song', index, songs\[index\]/);
  assert.match(renderWindow, /homePlatformRecommendationSpacer\(range\.topRows/);
  assert.match(renderWindow, /homePlatformRecommendationSpacer\(range\.bottomRows/);

  const playDaily = namedFunctionSource(homeActionsScript, 'playHomeDaily');
  const playSong = namedFunctionSource(homeActionsScript, 'playHomeSong');
  assert.match(playDaily, /playQueue\s*=\s*homeDiscoverState\.songs\.map\(cloneSong\)/);
  assert.match(playSong, /playQueue\s*=\s*homeDiscoverState\.songs\.map\(cloneSong\)/);
  assert.doesNotMatch(playDaily + playSong, /\.slice\s*\(/);
});

test('daily viewport updates are scroll-driven and animation-frame throttled', () => {
  const bind = namedFunctionSource(dashboardScript, 'bindHomePlatformRecommendationControls');
  const schedule = namedFunctionSource(dashboardScript, 'scheduleHomePlatformDailyWindowRender');
  assert.match(bind, /addEventListener\(\s*'scroll'\s*,\s*scheduleHomePlatformDailyWindowRender/);
  assert.match(bind, /\{\s*passive:\s*true\s*\}/);
  assert.match(schedule, /requestAnimationFrame\s*\(/);
  assert.match(schedule, /renderHomePlatformDailyWindow\s*\(\s*false\s*\)/);
});
