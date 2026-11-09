function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value) * factor) / factor;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, toNumber(value)));
}

function textOf(candidate) {
  return String(candidate && candidate.text || '').trim();
}

function normalizedText(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}'\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(value) {
  return normalizedText(value).split(/\s+/).filter(Boolean);
}

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'i',
  "i'm",
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'the',
  'to',
  'we',
  'you',
]);

function contentTokens(value) {
  return tokens(value).filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function includesAny(value, patterns) {
  const text = normalizedText(value);
  return patterns.some((pattern) => text.includes(pattern));
}

function isClosedOutgoingPhrase(value) {
  const text = normalizedText(value);
  if (!text) return false;
  return includesAny(text, [
    "what's going on",
    'whats going on',
    'what is going on',
    'boss bitch',
  ]);
}

function scoreExitSuitability(exit) {
  if (!exit) return 0;
  const text = textOf(exit);
  let score = exit.type === 'outro' ? 0.74 : 0.64;
  if (exit.type === 'release') score += 0.08;
  if (!text) score += 0.04;
  if (toNumber(exit.energyAfter) < toNumber(exit.energyBefore)) score += 0.07;
  if (isClosedOutgoingPhrase(text)) score = Math.min(score, 0.36);
  return round(clamp01(score));
}

function scoreEntryPromise(entry) {
  if (!entry) return 0;
  let score = entry.confidence || 0.5;
  if (entry.type === 'pre-section') score += 0.16;
  if (entry.type === 'chorus' || entry.type === 'hook') score += 0.12;
  if (entry.resolvesTo && (entry.resolvesTo.type === 'chorus' || entry.resolvesTo.type === 'hook')) score += 0.12;
  if (textOf(entry)) score += 0.04;
  return round(clamp01(score));
}

function scorePairCompatibility(exit, entry) {
  if (!exit || !entry) return 0.35;
  const exitLow = toNumber(exit.lowDensity, toNumber(exit.energyAfter, NaN));
  const entryLow = toNumber(entry.lowDensity, toNumber(entry.energyAfter, NaN));
  const exitEnergy = toNumber(exit.energyAfter, NaN);
  const entryEnergy = toNumber(entry.energyAfter, NaN);
  const lowDiff = Number.isFinite(exitLow) && Number.isFinite(entryLow) ? Math.abs(exitLow - entryLow) : 0.18;
  const energyDiff = Number.isFinite(exitEnergy) && Number.isFinite(entryEnergy) ? Math.abs(exitEnergy - entryEnergy) : lowDiff;
  return round(clamp01(1 - (lowDiff * 1.4) - (energyDiff * 0.8)));
}

function scoreLyricHandoff(exit, entry) {
  const exitText = textOf(exit);
  const entryText = textOf(entry);
  if (!exitText || !entryText) return 0;
  const exitContent = new Set(contentTokens(exitText));
  const entryContent = new Set(contentTokens(entryText));
  const shared = Array.from(exitContent).filter((token) => entryContent.has(token));
  let score = shared.length ? Math.min(0.78, 0.48 + shared.length * 0.16) : 0;

  const directionalExit = includesAny(exitText, ['break through', 'through', 'help me', 'rise', 'above', 'away', 'out']);
  const pickupEntry = includesAny(entryText, ['take me to', 'take me', 'to the', 'into', 'come with', 'go to']);
  if (directionalExit && pickupEntry) score = Math.max(score, 0.84);

  return round(clamp01(score));
}

function scoreDirectionality(exit, entry) {
  if (!exit || !entry) return 0.5;
  const delta = toNumber(entry.energyAfter) - toNumber(exit.energyAfter);
  if (delta > 0.18) return 0.46;
  if (delta > 0.04) return 0.72;
  if (delta < -0.16) return 0.42;
  return 0.68;
}

function scoreStyleCompatibility(value) {
  if (value == null) return null;
  return round(clamp01(value));
}

function profileForTitle(title) {
  const text = normalizedText(title);
  const profiles = [
    { patterns: ['avicii'], families: ['electronic', 'dance'], moods: ['uplifting', 'anthemic'] },
    { patterns: ['bingo players'], families: ['electronic', 'dance'], moods: ['uplifting'] },
    { patterns: ['odesza'], families: ['electronic', 'cinematic'], moods: ['uplifting', 'warm'] },
    { patterns: ['apashe'], families: ['electronic', 'cinematic'], moods: ['dark', 'theatrical'] },
    { patterns: ['acdc', 'highway to hell'], families: ['rock'], moods: ['raw', 'anthemic'] },
    { patterns: ['nirvana'], families: ['rock'], moods: ['grunge', 'dark'] },
    { patterns: ['marilyn manson', 'sweet dreams'], families: ['rock'], moods: ['gothic', 'dark'] },
    { patterns: ['glass animals', 'heat waves'], families: ['alt-pop', 'electronic'], moods: ['warm', 'melodic'] },
    { patterns: ['flume', 'never be like you'], families: ['electronic', 'alt-pop'], moods: ['warm', 'future'] },
    { patterns: ['lorde'], families: ['alt-pop'], moods: ['melancholic'] },
    { patterns: ['snakehips'], families: ['electronic', 'pop'], moods: ['warm'] },
    { patterns: ['2hollis'], families: ['electronic', 'hyperpop'], moods: ['bright'] },
    { patterns: ['doja', 'cardi', 'lizzo', 'lil wayne', 'drake', 'kanye', 'connor price'], families: ['rap'], moods: ['rhythmic'] },
  ];
  return profiles.find((profile) => profile.patterns.some((pattern) => text.includes(pattern))) || null;
}

function setOverlap(a, b) {
  const bSet = new Set(b || []);
  return (a || []).filter((item) => bSet.has(item));
}

function hasTag(profile, tag) {
  return Boolean(profile && (
    (profile.families || []).includes(tag)
    || (profile.moods || []).includes(tag)
  ));
}

function titleOfAnalysis(analysis) {
  const track = analysis && analysis.track || {};
  return [track.artist, track.title].filter(Boolean).join(' ');
}

function inferStyleCompatibility(fromAnalysis, toAnalysis) {
  const from = profileForTitle(titleOfAnalysis(fromAnalysis));
  const to = profileForTitle(titleOfAnalysis(toAnalysis));
  if (!from || !to) return null;

  const familyOverlap = setOverlap(from.families, to.families).length;
  const moodOverlap = setOverlap(from.moods, to.moods).length;
  let score = 0.5;
  score += familyOverlap ? Math.min(0.3, familyOverlap * 0.16) : -0.04;
  score += moodOverlap ? Math.min(0.18, moodOverlap * 0.12) : 0;

  const upliftingIntoDark = hasTag(from, 'uplifting') && (hasTag(to, 'dark') || hasTag(to, 'gothic'));
  const rawRockJump = hasTag(from, 'electronic') && hasTag(to, 'rock') && !familyOverlap;
  const gothicJump = hasTag(to, 'gothic') && !moodOverlap;
  if (upliftingIntoDark) score -= 0.18;
  if (rawRockJump) score -= 0.08;
  if (gothicJump) score -= 0.06;

  return round(clamp01(score));
}

function recipeFor(ctx) {
  if (ctx.lyricHandoff >= 0.75) return 'lyric-handoff';
  if (!ctx.hasExitText && ctx.hasEntryText && ctx.exitIsOutro && ctx.exitLateEnough && ctx.entryPromise >= 0.75) {
    return 'instrumental-outro-to-vocal-hook';
  }
  if (ctx.entry && ctx.entry.type === 'pre-section') return 'outro-to-chorus';
  return 'section-jump';
}

function classifyTier(score, recipe, dimensions, risks) {
  if ((risks || []).includes('closed outgoing phrase')) return 'reject';
  if (score < 0.55) return 'reject';
  if (score < 0.7) return 'weak';
  if ((risks || []).includes('style bridge mismatch')) return 'usable_but_not_magic';
  const magicRecipe = recipe === 'lyric-handoff' || recipe === 'instrumental-outro-to-vocal-hook';
  if (
    magicRecipe
    && dimensions.pairCompatibility >= 0.8
    && dimensions.entryPromise >= 0.75
    && dimensions.directionality >= 0.6
  ) {
    return 'magic';
  }
  if (score < 0.84) return 'usable_but_not_magic';
  return 'usable';
}

function evaluateTransitionPair(opts = {}) {
  const exit = opts.exit || null;
  const entry = opts.entry || null;
  const fromDuration = toNumber(opts.fromDuration);
  const dimensions = {
    pairCompatibility: scorePairCompatibility(exit, entry),
    exitSuitability: scoreExitSuitability(exit),
    entryPromise: scoreEntryPromise(entry),
    lyricHandoff: scoreLyricHandoff(exit, entry),
    directionality: scoreDirectionality(exit, entry),
  };
  const styleCompatibility = scoreStyleCompatibility(opts.styleCompatibility);
  if (styleCompatibility != null) dimensions.styleCompatibility = styleCompatibility;
  const ctx = {
    entry,
    lyricHandoff: dimensions.lyricHandoff,
    entryPromise: dimensions.entryPromise,
    hasExitText: Boolean(textOf(exit)),
    hasEntryText: Boolean(textOf(entry)),
    exitIsOutro: exit && (exit.type === 'outro' || exit.type === 'release'),
    exitLateEnough: !fromDuration || (exit && toNumber(exit.time) / fromDuration >= 0.89),
  };
  const recipe = recipeFor(ctx);
  const reasons = [];
  const risks = [];
  if (dimensions.lyricHandoff >= 0.75) reasons.push('lyric handoff');
  if (recipe === 'instrumental-outro-to-vocal-hook') reasons.push('instrumental outro to vocal hook');
  if (dimensions.pairCompatibility >= 0.8) reasons.push('stable energy handoff');
  if (isClosedOutgoingPhrase(textOf(exit))) risks.push('closed outgoing phrase');
  if (dimensions.directionality < 0.5) risks.push('directionality mismatch');
  if (styleCompatibility != null && styleCompatibility < 0.62) risks.push('style bridge mismatch');

  const recipeBonus = recipe === 'lyric-handoff'
    ? 0.1
    : (recipe === 'instrumental-outro-to-vocal-hook' ? 0.18 : 0);
  const score = round(clamp01(
    dimensions.exitSuitability * 0.25
    + dimensions.entryPromise * 0.25
    + dimensions.pairCompatibility * 0.2
    + dimensions.lyricHandoff * 0.2
    + dimensions.directionality * 0.1
    + recipeBonus,
  ));
  const tier = classifyTier(score, recipe, dimensions, risks);

  return {
    recipe,
    score,
    tier,
    dimensions,
    reasons,
    risks,
  };
}

module.exports = {
  evaluateTransitionPair,
  inferStyleCompatibility,
  isClosedOutgoingPhrase,
};
