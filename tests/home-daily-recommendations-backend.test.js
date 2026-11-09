'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');

function namedFunctionSource(text, name) {
  const declaration = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(text);
  if (!declaration) return '';
  const bodyStart = text.indexOf('{', declaration.index + declaration[0].length);
  if (bodyStart < 0) return '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < text.length; index += 1) {
    const character = text[index];
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
      if (depth === 0) return text.slice(declaration.index, index + 1);
    }
  }
  return '';
}

test('daily recommendation mapper preserves every valid upstream song in order', () => {
  const mapperSource = namedFunctionSource(source, 'mapDailyRecommendationSongs');
  assert.ok(mapperSource, 'expected mapDailyRecommendationSongs()');
  const mapper = vm.runInNewContext(`(${mapperSource})`, {
    mapSongRecord(song) {
      return song && song.valid === false ? null : {
        id: song && song.id,
        name: song && song.name,
      };
    },
  });
  const upstream = Array.from({ length: 37 }, (_, index) => ({
    id: String(index + 1),
    name: `daily-${index + 1}`,
  }));
  const mapped = mapper(upstream);
  assert.equal(mapped.length, 37);
  assert.deepEqual(
    Array.from(mapped, song => String(song.id)),
    upstream.map(song => song.id),
  );
});

test('discover home returns the complete mapped daily list without a fixed song cap', () => {
  const discoverSource = namedFunctionSource(source, 'handleDiscoverHome');
  assert.ok(discoverSource, 'expected handleDiscoverHome()');
  assert.match(discoverSource, /dailySongs\s*=\s*mapDailyRecommendationSongs\(raw\)/);
  assert.doesNotMatch(discoverSource, /dailySongs[\s\S]{0,300}\.slice\s*\(\s*0\s*,\s*(?:8|12)\s*\)/);
  assert.match(discoverSource, /dailySongTotal:\s*dailySongs\.length/);
  assert.match(discoverSource, /dailySongsComplete:\s*true/);
});

test('discover home does not request or return recommended podcasts', () => {
  const discoverSource = namedFunctionSource(source, 'handleDiscoverHome');
  assert.doesNotMatch(discoverSource, /\bdj_hot\s*\(/);
  assert.match(discoverSource, /podcasts:\s*\[\]/);
});
