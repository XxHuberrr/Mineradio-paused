# Third-party ports

## Cuefield AutoMix transition planner/runtime

- Upstream: `SLYysl/cuefield-mineradio`
- Reference revision: `c16f05a0bc731a49da7d42c135337fcac58f6dba`
- License: GNU GPL v3 (`GPL-3.0`)
- Port refresh date: 2026-08-01

Mineradio integrates the upstream cache-only transition planner, structure and
boundary evidence, recipe routing, preparation de-duplication, bounded bridge
and source-loop helpers, and advanced B-deck timeline actions. The runtime is
adapted to Mineradio's modular script loader, provider-aware beat-map cache,
existing AudioContext ownership transfer, finite source fallback, and the
already approved album-gapless crossmix path.

AutoMix remains opt-in and stops while disabled, paused, manually seeking, or
when album-gapless owns the next deck. Unsupported WebAudio actions degrade to
the volume-only/equal-power path instead of blocking normal queue advance. The
upstream optional remote-feedback service, monolithic Mineradio UI, private
audio URLs, account credentials, and raw local beat-map data are not included
or transmitted; ratings remain in the current user's local data directory.

## Mineradio-LX-Music desktop/home reference

- Upstream: `ww085213/Mineradio-LX-Music`
- Initial reference revision: `82826df814c32853d99697c0ee60f749a2fcad79`
- Homepage refresh revision: `812e2dc2e18bbc263e61dbd0206cb765e003d6e9`
- License: GNU GPL v3 (`GPL-3.0-only`)
- Port dates: 2026-07-18 (initial), 2026-07-19 (homepage refresh)

Mineradio's full desktop mode adapts the upstream idea of moving the existing
Electron main-window HWND between the Windows WorkerW desktop layer and an
interactive top-level window. The native attach/detach code in this project was
rewritten around the optimized edition's fail-closed WorkerW discovery, DPI
conversion, structured acknowledgements, serialized lifecycle, and cleanup
requirements.

The home dashboard adapts the upstream information hierarchy (continue,
library, daily recommendations, recent playback, today's listening, next up,
discovery, and radio entry points). Its data adapters use this project's current
multi-provider discovery, playlist, search, playback queue, and listen-history
state. Upstream LX-only server routes and the legacy standalone wallpaper
overlay were not copied.

The 2026-07-19 refresh additionally adapts the three-song "For You" strip,
stable cover-image swaps, in-place quick-card updates, daily-review hover
feedback, and compact-height scrolling/settings behavior. These features remain
implemented against Mineradio's existing provider, weather-radio, local-library,
queue, and playback modules rather than the upstream LX/local-only data model.

The combined application remains distributed under the repository's GNU GPL v3
license. Preserve this notice and the corresponding source when redistributing
modified builds.

## Qishui Passport Web QR authentication

- Upstream: `Wx2yZx/Mineradio-Qishui-QR-Login`
- Reference revision: `aaadaab7d011714f94fbe45b382ba8dcc7cf17b9`
- Declared license: `GPL-3.0-only`
- Port date: 2026-07-30

Mineradio ports only the official Passport Web QR authentication boundary:
an isolated hidden Electron security host, the Qishui web signing bootstrap,
QR creation and polling, account-session cookie persistence, and the official
second-verification UI when the service requests it. The upstream whole-project
installer was not run, and no application files were wholesale replaced.

The QR bridge feeds the authenticated cookie into Mineradio's existing
`qishui-api.js` provider. Search, playlists, likes, comments, entitlement checks,
and audio playback remain Mineradio implementations. Legacy token/manual-cookie
login controls and local SodaMusic cookie discovery are not exposed by the
current login UI.

The web security runtime resources under `qishui-auth-v6/` are retained
byte-for-byte for protocol compatibility and remain the property of their
respective rights holders. They are loaded only inside the isolated authentication
partition for the user's own official login session.

## 花再 Halo PixelBar HID 驱动（node-hid）

- 模块：`node-hid@^3.4.0`（见 `package.json` 的 `dependencies`）
- 用途：通过 USB HID 控制花再 Halo PixelBar 音响（歌词/时钟/频谱/主题）。
- 协议来源：开源逆向 `HaloLyricSync` / `HaloPixelToolBox` / `traceless929/PixelBar`，
  实现见 `desktop/halo-lyric-sync.js` 与 `desktop/halo-hid-server.js`。
- 许可证：MIT（node-hid 本身）；本项目集成代码沿用仓库 GPL-3.0。

### 它是什么 / 是不是 C++ / 是不是编译好的

node-hid 的底层是 **C 语言库 `hidapi`**（Windows 上调用系统 `hid.dll`）。
运行时真正加载的是已编译的原生共享库：

```
node_modules/node-hid/prebuilds/HID-win32-x64/node-napi-v4.node   ≈ 404 KB
```

该 `.node` 是**提前编译好的二进制**（Windows 下本质是个 DLL 改后缀），不是源码。
它用 **NAPI**（Node 稳定 ABI）构建，因此同一个编译产物在 Node.js 和 Electron 里都能直接
`require`，**无需针对不同 Electron 版本重新编译**。node_modules 里那一大堆 `.c`/`.h` 源码与
mac/linux/arm 平台的预编译只是备用/源码重编用途，Windows x64 运行时只用上面那个 404KB 文件。

### 打包时必须包含吗？

**是，每次打包都会包含，且不能省。** 因它是 `dependencies`，electron-builder 会像普通 npm
依赖一样自动把它打进 `resources/app/node_modules/node-hid`，程序运行时要靠它跟音响通信。
但打包过程**只是复制已编译二进制**，没有任何 C++ 编译步骤。

### 体积

- 运行时实际占用（win x64）：约 **0.4 MB**（仅 `node-napi-v4.node` + 薄 JS 壳）。
- node_modules 内整包约 5.4 MB，含 C 源码、测试用例，以及 macOS/Linux/arm 等其它平台的
  预编译（Windows x64 用不到，可忽略或裁剪，不影响功能）。

### 关键打包配置（不要改动，否则打包会失败）

- `package.json` → `build.npmRebuild: false`
  electron-builder 默认会在打包时尝试"重编译"原生模块；对 NAPI 预编译模块这会误触发
  源码编译并因缺少 Visual Studio C++ 工具链而失败。设为 `false` 即跳过，直接复用预编译。
- `node-hid` 放在 `dependencies`（非 `optionalDependencies`），保证打包必含。
- 构建机只需能 `npm install` 拿到 NAPI 预编译即可，**不需要 VS C++ 工具链、不需要联网下载
  额外预编译**（预编译已随 npm 包发布）。
- `"asar": false`（本仓库已设置）：原生 `.node` 以真实文件存在，`require` 正常；若将来改回
  `asar: true`，必须加 `"asarUnpack": ["node_modules/node-hid/**"]`。

### 运行架构（为何用子进程）

`desktop/halo-lyric-sync.js` 在 Electron 下不直接 `require('node-hid')`，而是
`spawn` 一个子进程 `halo-hid-server.js` 承担 HID 写入（stdin/stdout 换行 JSON 协议）。
子进程启动方式：

```js
const nodeBin = process.env.HALO_NODE_BIN || process.execPath; // 打包时用 Electron 自身
if (!process.env.HALO_NODE_BIN) childEnv.ELECTRON_RUN_AS_NODE = '1'; // 纯 Node 模式，不加载窗口
```

- 开发期：`HALO_NODE_BIN=node` 可用系统 Node 调试。
- 打包后：无系统 Node，改用 `Mineradio.exe` 自身（`ELECTRON_RUN_AS_NODE`）运行子进程，
  `require` 到的是随包打入、已编译好的 NAPI `node-hid`，**终端用户无需安装任何驱动或 Node**。

### 验证打包结果

打完后确认安装目录下存在：

```
resources/app/node_modules/node-hid/prebuilds/HID-win32-x64/node-napi-v4.node
```

并在纯净机器（无 Node、无 VS）上打开设置面板 → 花再音响同步 → "检测并连接设备"，
应显示"已连接设备"。
