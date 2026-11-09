# Music Profile Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不修改用户保存歌单的前提下，为 Mineradio 增加默认关闭、完全本地、可解释的音乐画像，并在推荐模式开启时只重排当前临时队列中第六首及以后未被用户手动调整的歌曲。

**Architecture:** 新建一个零依赖的 Node 模块，负责画像 JSON 的安全读写、事件到标签的聚合、冷启动、标签降权与恢复，以及队列歌曲的纯排序得分。`server.js` 将它挂到 Electron `userData` 路径和本地 HTTP API；前端模块只报告播放事实、渲染画像状态并把已计算的队列排序应用到临时 `playQueue`。不获取或猜测缺失元数据：现有歌曲对象未提供可信字段时，显示“数据不足”。

**Tech Stack:** Node.js 标准库（`fs`、`path`）、现有 Node HTTP 服务、Electron、原生浏览器 JavaScript、`node:test`、现有 `scripts/quick-check.js`。

## Final implementation notes

- DJ 曲目只信任显式字段（`profileMetadata.isDj === true` 或 `song.isDj === true`）；手动切歌达到 50% 时按有效长时收听处理。
- 冷启动恢复播放队列后会重新应用画像队列排序；播放快照保留 `releaseDate` 与 `profileMetadata`。
- 首页画像卡片区分零标签、正向标签和负向标签；负向标签显示为“少放/负向证据”，不提供“减少”按钮。
- 后台播放/收藏画像上报失败保持静默；用户主动点击启用、清空、标签偏好或推荐模式失败时显示反馈。
- 标签降权在 30 天内五首不同歌曲的正向证据后恢复到正常权重，写入 `recoveredAt` / `recoveryEvidenceSongs`，并在窗口过期后保持恢复终态。
- Electron GUI 已完成手工验收；已知独立基线仍是本地音乐库 FLAC 标签读取测试失败，与本地音乐画像无文件交集。

## Global Constraints

- 只实施设计文档的第一阶段；自动删歌、跨平台补歌、外部新歌搜索和完整证据链不在本计划内。
- 不添加依赖、Python 进程、独立服务、数据库或网络元数据猜测。
- 画像文件放在 Electron `userData`，通过 `MINERADIO_MUSIC_PROFILE_FILE` 注入；开发环境的默认路径仅用于本机调试。
- 未启用画像时绝不写入播放事件；画像文件不含 Cookie、播放 URL、歌词、封面或账号凭证。
- 只有可信的 `profileMetadata` 与已有明确的 `releaseDate` 字段可生成标签；歌名、歌手名和歌词不得参与推断。
- 普通音乐以播放进度 `>= 0.80` 为正向完播；长 DJ 曲目以 `>= 0.50` 为正向长时收听；播客和本地音乐不进入画像。
- 冷启动门槛为五首不同歌曲；切歌、收藏、完播初始权重固定为 `-50`、`+40`、`+10`。
- 推荐模式绝不写回保存歌单；从当前歌曲之后的第六首开始重排，前五首和用户手动拖动过的队列项保持不变。
- 每个任务先写能失败的测试，确认失败原因正确后才写生产代码；每个任务完成后单独提交。

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `music-profile.js` | 唯一画像域模块：状态读写、原子持久化、元数据白名单、事件聚合、标签视图和队列评分。 |
| `server.js` | 注入画像文件路径，维护内存状态，提供仅本机画像 API。 |
| `desktop/main.js` | 将画像 JSON 设为稳定 `userData` 路径。 |
| `public/js/modules/05-playback/02a-music-profile.js` | 前端 API 客户端、画像 UI 状态、播放和收藏事实报告。 |
| `public/js/modules/05-playback/10a-music-profile-queue.js` | 临时队列的保护窗口、手动拖动锁定和稳定重排。 |
| `public/js/modules/05-playback/02-listen-stats.js` | 在一次会话结束时报告事实，不改变既有平台 scrobble。 |
| `public/js/modules/05-playback/06-track-detail-lyrics-actions.js` | 仅在收藏请求成功后报告一次收藏事实。 |
| `public/js/modules/05-playback/10-queue-actions.js` | 将用户拖动标记写到当前队列项。 |
| `public/js/modules/05-playback/14-player-controls.js` | 增加独立于顺序/随机/单曲循环的推荐模式控制。 |
| `public/js/modules/05-playback/03a-home-dashboard.js` | 渲染首页音乐画像卡片并与播放器开关同步。 |
| `public/js/index-loader.js` | 在依赖它们的播放模块之前按顺序加载两个新模块。 |
| `public/index.html` | 增加画像卡片、播放器推荐模式按钮和可访问标签。 |
| `public/css/index.css` | 只添加首页与播放器局部样式及焦点样式。 |
| `tests/music-profile.test.js` | 域模块、存储、冷启动、标签、降权恢复和评分单元测试。 |
| `tests/music-profile-server.test.js` | 服务器路径、API 和播放上报隔离的回归测试。 |
| `tests/music-profile-ui.test.js` | 模块加载顺序、DOM 锚点、双开关与队列保护策略的静态/VM 测试。 |

## Task 1: 画像域模块与持久化

**Files:**
- Create: `music-profile.js`
- Test: `tests/music-profile.test.js`

**Interfaces:**
- Produces: `createMusicProfileState()`, `loadMusicProfile(filePath)`, `saveMusicProfile(filePath, state)`, `applyMusicProfileEvent(state, event)`, `setMusicProfileEnabled(state, enabled)`, `setMusicProfileRecommendationMode(state, enabled)`, `setMusicProfileTagReduced(state, tagKey, reduced)`, `clearMusicProfile(state)`, `getMusicProfileView(state, now)`, `scoreMusicProfileSong(view, song)`.
- Consumes: plain song/event objects only; no HTTP, Electron or global browser state.

- [ ] **Step 1: Write the failing domain tests**

Create `tests/music-profile.test.js` with Node’s built-in test runner. Cover the public behavior below; import `../music-profile` before the module exists so the test fails with `MODULE_NOT_FOUND`.

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const profile = require('../music-profile');

const song = { provider: 'netease', id: '1', type: 'song', durationMs: 200000,
  profileMetadata: { styles: ['pop', 'electronic'], languages: ['zh'], releaseDate: '2018-01-01' } };

test('profile is disabled and empty by default', () => {
  assert.deepEqual(profile.getMusicProfileView(profile.createMusicProfileState(), Date.now()).tags, []);
});

test('disabled profile ignores events and enabled profile splits multi-value evidence', () => {
  const state = profile.createMusicProfileState();
  profile.applyMusicProfileEvent(state, { id: 'ignored', kind: 'favorite', song, at: 1 });
  assert.equal(state.events.length, 0);
  profile.setMusicProfileEnabled(state, true);
  profile.applyMusicProfileEvent(state, { id: 'fav-1', kind: 'favorite', song, at: 1 });
  const tags = profile.getMusicProfileView(state, Date.now()).tags;
  assert.equal(tags.find(tag => tag.key === 'style:pop').weight, 20);
  assert.equal(tags.find(tag => tag.key === 'style:electronic').weight, 20);
  assert.equal(tags.find(tag => tag.key === 'language:zh').weight, 40);
  assert.equal(tags.find(tag => tag.key === 'era:2010s').weight, 40);
});
```

Add tests for all of these exact cases:

- duplicate event `id` is idempotent;
- metadata without trusted fields adds no tag;
- a normal song at 80% produces a `+10` completion contribution while 79% does not;
- a song flagged `isDj: true` at 50% produces `+10`, while 49% does not;
- a podcast or local song produces no event;
- early manual skip at 15% produces `-50`, while a later skip does not;
- fewer than five distinct `songKey` values leaves `ready` false;
- reduced tag is down-weighted, then begins restoration only after five different positive songs for the tag in the last 30 days;
- `clearMusicProfile()` disables both profile and recommendation mode and removes all events/preferences;
- a malformed JSON file returns an empty state; a save/load round trip keeps no unapproved song fields.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test tests/music-profile.test.js
```

Expected: FAIL because `../music-profile` does not exist. Do not proceed if it fails for a syntax error in the test.

- [ ] **Step 3: Implement the minimal domain module**

Create `music-profile.js` with only Node standard-library imports. Use this state shape and function contracts:

```js
const MUSIC_PROFILE_VERSION = 1;
const MUSIC_PROFILE_EVENT_LIMIT = 500;

function createMusicProfileState() {
  return { version: MUSIC_PROFILE_VERSION, enabled: false, recommendationMode: false,
    events: [], reducedTags: {} };
}

function normalizeProfileMetadata(song) {
  const data = song && song.profileMetadata && typeof song.profileMetadata === 'object'
    ? song.profileMetadata : {};
  return {
    styles: normalizeAllowedValues(data.styles, 'style'),
    languages: normalizeAllowedValues(data.languages, 'language'),
    eras: normalizeReleaseDate(data.releaseDate || song.releaseDate),
    isDj: data.isDj === true,
  };
}
```

Rules the implementation must enforce:

- `normalizeAllowedValues` accepts only arrays/strings already supplied by a trusted source mapper, trims, lowercases, de-duplicates, and never inspects `song.name`, `song.artist`, lyrics or cover.
- `normalizeReleaseDate` converts only a valid four-digit year/date into decade values such as `2010s`; otherwise returns `[]`.
- `applyMusicProfileEvent` ignores disabled, duplicate, local and podcast inputs; stores only `id`, `songKey`, `at`, `kind`, `progress`, and normalized dimensions; truncates to the latest 500 events.
- contribution comes from event kind: `favorite=40`, `early-skip=-50`, `listen=10` only when the normal/DJ threshold passes. Split each dimension’s contribution equally across its values.
- `getMusicProfileView` returns `{ enabled, recommendationMode, ready, remainingSongs, tags, recoveredTags }`; `remainingSongs` is `max(0, 5 - distinctSongCount)`.
- a reduced tag keeps its history but has a lower effective score. Five distinct positive songs in the preceding 30 days must increase its effective score toward normal and add an entry to `recoveredTags` explaining the recovery.
- `loadMusicProfile` validates objects field-by-field and falls back to `createMusicProfileState`; `saveMusicProfile` writes `filePath + '.tmp-' + process.pid` then renames it.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --test tests/music-profile.test.js
```

Expected: PASS. Then run `node --check music-profile.js`.

- [ ] **Step 5: Commit the domain module**

```powershell
git add music-profile.js tests/music-profile.test.js
git commit -m "feat: add local music profile engine"
```

## Task 2: Server-owned profile state and local API

**Files:**
- Modify: `desktop/main.js: configureLocalServerEnvironment`
- Modify: `server.js: environment constants, request router, listen reporting helpers`
- Test: `tests/music-profile-server.test.js`

**Interfaces:**
- Consumes: Task 1 exports and `MINERADIO_MUSIC_PROFILE_FILE`.
- Produces: `GET /api/music-profile`, `POST /api/music-profile/enable`, `POST /api/music-profile/recommendation-mode`, `POST /api/music-profile/clear`, `POST /api/music-profile/tag-preference`, `POST /api/music-profile/event`.

- [ ] **Step 1: Write the failing server contract test**

Create `tests/music-profile-server.test.js` using the project’s established static contract style. Read `server.js` and `desktop/main.js`, then assert all routes and the environment path are present before implementation:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');

test('music profile stays under Electron userData and has only local state routes', () => {
  assert.match(main, /MINERADIO_MUSIC_PROFILE_FILE\s*=\s*path\.join\(STABLE_USER_DATA_PATH, 'music-profile\.json'\)/);
  for (const route of ['/api/music-profile', '/api/music-profile/enable', '/api/music-profile/recommendation-mode', '/api/music-profile/clear', '/api/music-profile/tag-preference', '/api/music-profile/event']) {
    assert.ok(server.includes(route), `missing ${route}`);
  }
  assert.match(server, /require\('\.\/music-profile'\)/);
});
```

Also assert that the `/api/listen/report` handler still calls `handlePlatformListenReport(body)` unchanged and that image/profile failures are caught separately from platform scrobble failures.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test tests/music-profile-server.test.js
```

Expected: FAIL with the missing `MINERADIO_MUSIC_PROFILE_FILE` assertion.

- [ ] **Step 3: Add server state and routes without changing platform sync semantics**

In `desktop/main.js`, append one environment value inside `configureLocalServerEnvironment`:

```js
process.env.MINERADIO_MUSIC_PROFILE_FILE = path.join(STABLE_USER_DATA_PATH, 'music-profile.json');
```

At the top of `server.js`, import the Task 1 module and create the cached state:

```js
const musicProfile = require('./music-profile');
const MUSIC_PROFILE_FILE = process.env.MINERADIO_MUSIC_PROFILE_FILE
  || path.join(__dirname, 'data', 'music-profile.json');
let musicProfileState = musicProfile.loadMusicProfile(MUSIC_PROFILE_FILE);

function persistMusicProfile() {
  musicProfile.saveMusicProfile(MUSIC_PROFILE_FILE, musicProfileState);
}
```

Route rules:

- `GET /api/music-profile` returns `musicProfile.getMusicProfileView(musicProfileState, Date.now())`.
- `POST /enable` accepts only `{ enabled: boolean }`; disabling must also disable recommendation mode.
- `POST /recommendation-mode` accepts only `{ enabled: boolean }`; enabling is stored even before readiness, while `ready=false` prevents frontend reordering.
- `POST /clear` replaces state with `clearMusicProfile(musicProfileState)` and persists it.
- `POST /tag-preference` accepts a validated `key` and `{ reduced: boolean }`; no arbitrary numeric weights from clients.
- `POST /event` accepts only the event fields Task 1 preserves. Validate length and numeric bounds before calling `applyMusicProfileEvent`; save only if it changed state.

Every route must return `{ ok: true, profile: getMusicProfileView(...) }` on success and `{ ok: false, error: '...' }` with status 400/405 for invalid input/method. Wrap profile persistence in its own `try/catch`; it must never change the existing `/api/listen/report` response or prevent a platform scrobble.

- [ ] **Step 4: Run the focused server test and verify GREEN**

Run:

```powershell
node --test tests/music-profile-server.test.js
node --check server.js
node --check desktop/main.js
```

Expected: all PASS with no route or syntax errors.

- [ ] **Step 5: Commit server integration**

```powershell
git add desktop/main.js server.js tests/music-profile-server.test.js
git commit -m "feat: persist local music profile state"
```

## Task 3: Report only playback facts and successful favorites

**Files:**
- Create: `public/js/modules/05-playback/02a-music-profile.js`
- Modify: `public/js/modules/05-playback/02-listen-stats.js: finalizeListenSession`
- Modify: `public/js/modules/05-playback/06-track-detail-lyrics-actions.js: toggleLikeSong`
- Modify: `public/js/index-loader.js: modulePaths`
- Test: `tests/music-profile-ui.test.js`

**Interfaces:**
- Consumes: server routes from Task 2; existing `listenSession`, `currentCoverSong`, `queueItemKey`, `audio`, and `toggleLikeSong` success result.
- Produces: `loadMusicProfile()`, `setMusicProfileEnabled(enabled)`, `setMusicProfileRecommendationMode(enabled)`, `clearMusicProfile()`, `setMusicProfileTagReduced(key, reduced)`, `reportMusicProfileSession(session, completed, userSkip)`, `reportMusicProfileFavorite(song)`, `scoreMusicProfileQueueSong(song)` and a global current `musicProfileView`.

- [ ] **Step 1: Write the failing frontend contract test**

In `tests/music-profile-ui.test.js`, assert the loader adds the new profile module immediately after `02-listen-stats.js`; then assert the profile client reports one session and favorites only after a successful action:

```js
test('music profile client loads after listen statistics and reports facts without platform credentials', () => {
  assert.match(loader, /02-listen-stats\.js',[\s\S]*02a-music-profile\.js'/);
  assert.match(profileClient, /fetch\('\/api\/music-profile\/event'/);
  assert.doesNotMatch(profileClient, /cookie|authorization|playbackUrl|lyric/i);
  assert.match(listenStats, /reportMusicProfileSession\(session, completed/);
  assert.match(actions, /await apiJson\([\s\S]*reportMusicProfileFavorite\(song\)/);
});
```

Also assert the module rejects `song.type === 'local'` and `song.type === 'podcast'`, and that its event payload uses `queueItemKey(song)`, `duration`, `listenMs`, `completed`, and `userSkip` rather than title-derived labels.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test tests/music-profile-ui.test.js
```

Expected: FAIL because `02a-music-profile.js` and its loader entry are missing.

- [ ] **Step 3: Implement the minimal client and event hooks**

Create `02a-music-profile.js`. It must:

- keep `musicProfileView` in memory and refresh it through `GET /api/music-profile`;
- send JSON only to the Task 2 routes using `apiJson`/`fetch` with a short timeout and swallowed reporting failure;
- create event IDs from session ID plus event kind so retries are idempotent;
- build song payloads from stable provider IDs, provider, type, duration, optional `releaseDate`, and optional `profileMetadata`; never use title/artist to infer tags;
- reject local and podcast events before performing a request;
- implement `scoreMusicProfileQueueSong(song)` from the API-returned effective tag weights, returning `0` when the profile is disabled/not ready or the song has no trusted matching dimensions;
- dispatch `window.dispatchEvent(new CustomEvent('mineradio-music-profile-change', { detail: musicProfileView }))` after each successful state-changing response so both UI surfaces stay synchronized.

In `finalizeListenSession`, call `reportMusicProfileSession(session, completed, false)` before the existing platform `reportListenSession` call. Preserve the existing effective-session behavior for platform scrobble; profile reporting may send a short session only when it can be an early user skip.

In `nextTrack(userInitiated)`, before changing `currentIdx`, call the profile reporter with `userSkip=true` when the action is user-initiated. Do not report automatic track-end progression as a skip. Change `finalizeListenSession` only as needed to pass the explicit `userSkip` fact once and avoid double reports.

In `toggleLikeSong`, call `reportMusicProfileFavorite(song)` only after the existing like endpoint returns success and only when the new liked state is true. Unliking must not generate a negative image event.

Append the new module path directly after `02-listen-stats.js` in `public/js/index-loader.js` so it is available to later playback modules.

- [ ] **Step 4: Run the focused test and parser checks**

Run:

```powershell
node --test tests/music-profile-ui.test.js
node --check public/js/modules/05-playback/02a-music-profile.js
node --check public/js/modules/05-playback/02-listen-stats.js
node --check public/js/modules/05-playback/06-track-detail-lyrics-actions.js
```

Expected: PASS. Confirm that no new request includes credential fields.

- [ ] **Step 5: Commit playback fact reporting**

```powershell
git add public/js/index-loader.js public/js/modules/05-playback/02a-music-profile.js public/js/modules/05-playback/02-listen-stats.js public/js/modules/05-playback/06-track-detail-lyrics-actions.js tests/music-profile-ui.test.js
git commit -m "feat: record local music profile events"
```

## Task 4: Image card, synchronized controls, and protected queue reorder

**Files:**
- Create: `public/js/modules/05-playback/10a-music-profile-queue.js`
- Modify: `public/js/modules/05-playback/10-queue-actions.js: moveQueueIndex`
- Modify: `public/js/modules/05-playback/14-player-controls.js`
- Modify: `public/js/modules/05-playback/03a-home-dashboard.js`
- Modify: `public/js/index-loader.js`
- Modify: `public/index.html`
- Modify: `public/css/index.css`
- Modify: `tests/music-profile-ui.test.js`

**Interfaces:**
- Consumes: `musicProfileView`, `scoreMusicProfileQueueSong(song)` from Task 3, existing `playQueue`, `currentIdx`, `safeRenderQueuePanel`, `safeShelfRebuild`, `saveLastPlaybackSnapshot`, `moveQueueIndex`.
- Produces: `applyMusicProfileQueueOrder(reason)`, `markMusicProfileManualQueueItem(song)`, `renderHomeMusicProfileCard(profile)`, `syncMusicProfileRecommendationControls(profile)`.

- [ ] **Step 1: Extend tests with an executable queue-policy VM test**

Add a VM-based test to `tests/music-profile-ui.test.js`. Load `10a-music-profile-queue.js` into a sandbox containing a ten-song queue, `currentIdx: 0`, a ready/enabled profile and a deterministic `musicProfileScoreSong(song)`.

```js
test('profile queue reorder protects five upcoming songs and locked items', () => {
  const queue = Array.from({ length: 10 }, (_, index) => ({ id: String(index), score: 10 - index }));
  queue[7].__musicProfileManualOrder = true;
  const sandbox = makeQueueSandbox(queue, 0);
  sandbox.applyMusicProfileQueueOrder('test');
  assert.deepEqual(sandbox.playQueue.slice(0, 6).map(song => song.id), ['0', '1', '2', '3', '4', '5']);
  assert.equal(sandbox.playQueue[7].id, '7');
  assert.ok(sandbox.renderCalls > 0);
});
```

Add tests that verify:

- no reorder occurs when `ready` or `recommendationMode` is false;
- `currentIdx + 6` is the first adjustable index, including when current index is nonzero;
- queues with fewer than six future positions are unchanged;
- manually moved items receive `__musicProfileManualOrder === true`;
- the homepage card, player button, `mineradio-music-profile-change` listener and accessible button labels are present in source;
- the first-phase code has no removal, external search or queue append call.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test tests/music-profile-ui.test.js
```

Expected: FAIL because the queue module and music-profile UI anchors are absent.

- [ ] **Step 3: Implement queue policy before UI decoration**

Create `10a-music-profile-queue.js`, loaded after `10-queue-actions.js`. Implement this exact policy:

```js
function firstMusicProfileAdjustableIndex() {
  return Math.max(0, Number(currentIdx) || 0) + 6;
}

function applyMusicProfileQueueOrder(reason) {
  if (!musicProfileView || !musicProfileView.enabled || !musicProfileView.recommendationMode || !musicProfileView.ready) return false;
  const start = firstMusicProfileAdjustableIndex();
  if (!Array.isArray(playQueue) || start >= playQueue.length) return false;
  // Preserve every locked index. Stable-sort only unlocked songs by descending profile score.
}
```

Use a stable sort decorated with original index. Keep each `song.__musicProfileManualOrder` at the same queue index; fill only unlocked positions with scored unlocked songs. Call `safeRenderQueuePanel`, `safeShelfRebuild`, and `saveLastPlaybackSnapshot(true, 'music-profile-reorder')` only when order changed. Never call `removeFromQueue`, `queueSong`, a search endpoint, or a playlist write API.

In `moveQueueIndex`, set `item.__musicProfileManualOrder = true` before insertion. Add this property to `playbackRestoreSongSnapshot` so a restored current queue preserves the user’s explicit ordering.

Call `applyMusicProfileQueueOrder('profile-enabled')` after recommendation mode becomes ready/enabled and `applyMusicProfileQueueOrder('early-user-skip')` after an early manual skip event has been accepted. Do not alter the existing `playMode` values (`loop`, `shuffle`, `single`); recommendation mode is separate.

- [ ] **Step 4: Implement the two synchronized UI surfaces**

In `public/index.html`, add:

- a compact homepage card next to the existing `home-listen-card` with `id="home-music-profile"` and an initially empty render target;
- a new `button#recommendation-mode-btn` next to the existing `#play-mode-btn`, with `type="button"`, `aria-pressed="false"`, and no inline state duplication.

In `03a-home-dashboard.js`, render four states from `musicProfileView`: disabled enable call-to-action, learning progress (`还需 N 首不同歌曲`), ready profile tags with evidence counts/data-insufficient dimensions, and ready recommendation state with a concise reason. Each tag must offer “减少此类推荐”; expose clear-profile action only after confirmation.

In `14-player-controls.js`, bind the player button to the shared `setMusicProfileRecommendationMode` client function; update its `aria-pressed`, title and visible state from `musicProfileView`. In both files, listen for `mineradio-music-profile-change` and rerender without maintaining separate booleans.

Add only scoped CSS under `#empty-home .home-music-profile-*` and `#recommendation-mode-btn`; include `:focus-visible`, a clear enabled/disabled distinction, and no global button selector changes.

- [ ] **Step 5: Run focused UI and syntax verification**

Run:

```powershell
node --test tests/music-profile-ui.test.js
node --check public/js/modules/05-playback/10a-music-profile-queue.js
node --check public/js/modules/05-playback/10-queue-actions.js
node --check public/js/modules/05-playback/14-player-controls.js
node --check public/js/modules/05-playback/03a-home-dashboard.js
node scripts/quick-check.js
```

Expected: all checks PASS; quick check must parse the combined renderer script with both new modules.

- [ ] **Step 6: Commit UI and queue behavior**

```powershell
git add public/index.html public/css/index.css public/js/index-loader.js public/js/modules/05-playback/03a-home-dashboard.js public/js/modules/05-playback/10-queue-actions.js public/js/modules/05-playback/10a-music-profile-queue.js public/js/modules/05-playback/14-player-controls.js public/js/modules/05-playback/09-queue-snapshot-autoplay.js tests/music-profile-ui.test.js
git commit -m "feat: add profile-guided queue mode"
```

## Task 5: Full regression, manual proof, and PR-ready documentation

**Files:**
- Modify: `README.md` only if the existing feature list needs one concise local-privacy entry.
- Test: `tests/music-profile.test.js`, `tests/music-profile-server.test.js`, `tests/music-profile-ui.test.js`, full static suite.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified first-stage behavior and concise contributor-facing usage notes.

- [ ] **Step 1: Write failing end-to-end contract assertions before final documentation**

Extend `tests/music-profile-ui.test.js` to require the exact first-stage boundaries in loaded source:

```js
test('first stage cannot delete, append, search, or persist into user playlists', () => {
  const sources = [profileClient, queuePolicy, dashboardScript].join('\n');
  assert.doesNotMatch(sources, /removeFromQueue\s*\(/);
  assert.doesNotMatch(sources, /queueSong(?:Next)?\s*\(/);
  assert.doesNotMatch(sources, /\/api\/(?:search|playlist\/add-song|playlist\/create)/);
  assert.match(queuePolicy, /currentIdx[^\n]{0,80}\+\s*6/);
});
```

Add a server test asserting `MUSIC_PROFILE_FILE` is inside `STABLE_USER_DATA_PATH` when Electron configures the process and that no profile state object includes `cookie`, `url`, `lyric`, or `cover` keys.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test tests/music-profile.test.js tests/music-profile-server.test.js tests/music-profile-ui.test.js
```

Expected: FAIL until the final code honors all documented boundaries.

- [ ] **Step 3: Make only boundary-preserving fixes and add concise documentation**

Fix production code rather than weakening tests. If `README.md` lacks a suitable feature list entry, add one bullet stating: “本地音乐画像默认关闭；开启后仅在本机分析播放行为，并可随时清除。” Do not document second-stage deletion, automatic refill or external discovery as shipped behavior.

- [ ] **Step 4: Run complete automated verification**

Run:

```powershell
node --test tests/music-profile.test.js tests/music-profile-server.test.js tests/music-profile-ui.test.js
node scripts/quick-check.js
git diff --check
git status --short --branch
```

Expected: all PASS, no syntax errors, no whitespace errors, and only intended files modified.

- [ ] **Step 5: Perform the manual Electron smoke test**

Run:

```powershell
npm install
npm start
```

Verify manually in this exact order:

1. First launch shows a disabled profile and does not create a profile event until the user clicks enable.
2. Enabling shows the learning count; playing fewer than five distinct online music tracks does not reorder the queue.
3. Trigger a successful favorite and a normal completed listen with known `profileMetadata`; the image card shows only supplied dimensions and shows data-insufficient for the rest.
4. Enable recommendation mode from the homepage, then confirm the player control immediately reflects the same state.
5. Build a queue with at least seven songs, manually drag one post-protection song, trigger an early manual skip, and confirm the next five songs plus the dragged song retain their positions while only eligible later songs reorder.
6. Close recommendation mode and confirm the current queue order remains unchanged; clear the profile and confirm it disables recommendation mode and removes the local profile file contents without affecting accounts, cookies or playlists.

- [ ] **Step 6: Commit verification/documentation changes**

```powershell
git add README.md tests/music-profile.test.js tests/music-profile-server.test.js tests/music-profile-ui.test.js
git commit -m "test: verify music profile boundaries"
```

If `README.md` was not changed, omit it from `git add`. Do not create an empty commit.

## Plan self-review

- Spec coverage: Tasks 1–2 cover local storage, enabled state, privacy, tags, cold start, reductions and recovery. Task 3 covers truthful playback/favorite facts and preserves platform sync. Task 4 covers both UI switches, short explanations, data-insufficient UI, front-five/manual protections and temporary-queue-only sorting. Task 5 covers first-stage exclusion of deletion/refill/search, full verification and manual proof.
- Explicit non-goals: no task invokes delete, append, external search, user playlist writes, Cookie reads, metadata guessing, podcast profiling, local-song profiling or second-stage evidence expansion.
- Interface consistency: Task 1 exports `getMusicProfileView` and `scoreMusicProfileSong`; Task 2 returns the view; Task 3 exposes `scoreMusicProfileQueueSong(song)` based only on that view; Task 4 calls that renderer helper. The only persistent file path is `MINERADIO_MUSIC_PROFILE_FILE`.
- Metadata limitation: current source mappers reliably expose only some optional release dates and do not expose a cross-provider trusted style/language field. The plan therefore fails closed and visibly reports data insufficiency until a separate, source-verified metadata contribution is designed and reviewed.
