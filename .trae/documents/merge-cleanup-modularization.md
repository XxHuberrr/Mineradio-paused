# Mineradio 合并残留清理与模块化整合计划

## Context(为什么做这件事)

`a69417b Merge remote-tracking branch 'upstream/main'` 把上游 1.1.2 时代的旧单体代码(c85ee65,2026-07)叠加进了用户已完成的模块化架构(d43de56,2026-09,基于上游 2.2.0 release 线 + 用户自己的停更声明等提交)。合并净改动仅 5 个文件,但造成:

- **应用无法启动**:`desktop/main.js` 第 1 行被插入重复的 `const { app, ... } = require('electron')`,与第 2 行原有声明冲突,`node --check` 直接报 SyntaxError;另有 `let tray = null` 重复声明(L36/L75)。
- **前端双份执行**:`public/index.html` 在原有模块加载器(`js/index-loader.js` + `js/modules/` 约 105 个文件)之后,又被塞入上游 24,400 行内联单体 `<script>`(L3992–28415)。它在模块之后执行,顶层 `var audio = null` 等重置模块状态、旧函数覆盖模块新函数、启动序列与 `requestAnimationFrame` 主循环双份运行 → 模块版新功能(歌词翻译、cuefield 自动混音、wallpaper-engine、home-dashboard 等)被旧版覆盖。
- **重复样式**:L113–1941 内联 `<style>` 与 `public/css/index.css` 大量重复(抽样 8 个选择器全部已存在)。

目标:删除上游旧单体残留,保留模块化架构与上游**净增**功能(i18n、托盘行为、补全的 DOM),产出干净可用的模块化软件架构。

## 已确认的关键事实(实施依据)

- 内联脚本所有抽样核心函数(`createFloatLayer`、`createLyricsParticles`、`createBackCoverLayer`、`triggerRipple`、`doSearch`)在 modules 中均已存在且模块版更新。
- 合并带入的上游 i18n:`i18n/zh.js`、`i18n/en.js`(各 1139 行新文件)+ index.html head 的 I18N bootstrap(L17–105)+ body 295 个 `data-i18n` 属性。模块代码不引用 `window.t`,i18n 只作用于静态 DOM,**保留**。
- body(633 个 id)⊇ 用户侧(600 个 id),零丢失;上游新增的 home-* id 被 `modules/05-playback/03-home-discover-weather.js` 引用(合并反而补全了模块所需 DOM)。**body 整体不动**。
- body 内联 onclick 依赖 3 个仅存在于内联脚本的函数,删除前必须移植:
  - `cycleAppLanguage()`(被 L1966 lang-toggle-btn 调用,内联脚本 L25894)
  - `resolveDesktopClose(action)` / `cancelDesktopClose()`(被 L3819–3820 关窗确认弹窗调用,内联脚本 L24646–24664)
- `desktop/main.js` 托盘是**双份平行实现**:用户侧已有完整 `createOrUpdateTray()`(L2164)+ `closeBehavior` 机制(L70/2072/2212/5847,用 `appQuitting`);上游合入的 `ensureTray/destroyTray/showMainWindowFromTray/hideMainWindowToTray`(L2113–2162)+ `isQuitting` 属重复,**删上游版、保留用户版**。
- `desktop/preload.js` 合并干净(+1 行 `minimizeToTray`),不动。

## 实施步骤

### 1. 修复 `desktop/main.js`(可启动性)
- 合并 L1/L2 两行 require 为一行标识符并集:`{ app, BrowserWindow, ipcMain, shell, screen, session, globalShortcut, dialog, Tray, Menu, nativeImage, protocol, desktopCapturer, powerMonitor }`。
- 删除 L75 重复的 `let tray = null;`。
- 删除上游托盘四件套与 `isQuitting`(约 L2113–2162 区域),把 `desktop-window-hide-to-tray` IPC handler(L4009)改为调用用户版:`createOrUpdateTray(); if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();`。
- 检查该 handler 及 close 事件链路无 `ensureTray/isQuitting` 残留引用。
- 验证:`node --check desktop/main.js` 通过;`Select-String 'ensureTray|isQuitting'` 零命中。

### 2. 移植 3 个缺失函数进模块体系
- 新建 `public/js/modules/10-shell/06-i18n-close-confirm.js`:
  - `cycleAppLanguage()`:调用 `window.I18N.toggleLang()` 并同步 `lang-toggle-label` 文本(从内联脚本 L25894 原样移植)。
  - `resolveDesktopClose(action)` / `cancelDesktopClose()`(从 L24646–24664 移植):exit → 走桌面关窗 IPC;minimize → `window.desktopWindow.minimizeToTray()` 并记忆偏好;cancel → 关闭 `close-confirm-modal`(沿用原 gsap 动画)。
- 在 `public/js/index-loader.js` 的 10-shell 段登记新文件。
- 另检查内联脚本中其余被 body onclick 引用的函数名(提取 body 全部 `onclick="NAME(..."` 清单,逐一在 modules 拼接文本中确认有定义),缺失者一并移植。

### 3. 删除前全量安全比对(门禁步骤,不通过不删除)
- 写一次性 Node 脚本(放 `%TEMP%`,不入仓库):
  a. 提取 index.html L3992–28415 的全部顶层 `function NAME(` 与 `var NAME` 声明清单;
  b. 与 `js/modules/` 全部文件拼接文本 diff,输出"仅存在于内联脚本"的清单;
  c. 逐个裁定:是启动/DOM 绑定残渣(随删除自然消失,无碍)还是独有功能(移植进对应模块后再删)。
- 内联 `<style>`(L113–1941)同样比对:提取选择器与规则,与 `public/css/index.css` diff;缺失/有差异的规则追加到 index.css 末尾并注释来源分区。

### 4. 精简 `public/index.html`
- 删除 L3992–28415 内联单体 `<script>` 整段;删除 L113–1941 内联 `<style>`。
- 保留:head 的 i18n 引用与 bootstrap(L17–105)、`js/index-loader.js` 引用、全部 body。
- 验证:`git diff d43de56 -- public/index.html` 应只剩 i18n head + 上游净增 DOM(33 个新 id)。

### 5. 自动化验证
- `node --check` 覆盖:desktop/main.js、desktop/preload.js、server.js、全部 modules(可按 loader 顺序拼接后校验)。
- 运行 `node scripts/quick-check.js`(它按 index-loader 拼接模块做语法校验,并对 index.html 的 body id 有数十条断言,body 不动应全绿);如有 `--full` 再跑 tests/。

### 6. 运行时冒烟测试
- `node server.js` 起本地服务,browser_use 打开 `http://127.0.0.1:<port>`:
  控制台无红色报错 → splash 正常退出 → 首页/空场 → 搜索一首歌并播放 → 歌词显示 → 粒子/封面渲染 → 右侧控制台面板开合 → 点 lang-toggle-btn 切换中英文(静态文案变化)→ 触发关窗确认弹窗。
- 通过后 `npm start`(Electron)复测:窗口启动、托盘最小化/恢复、关窗行为(exit/tray 两态)。

## 风险与备注

- Electron 主窗口经内嵌 HTTP 服务加载页面,同步 XHR loader 无 file:// 限制;直接双击 index.html 打不开属既有行为,非回归。
- 旧单体代码在 git 历史(c85ee65)中完整保留,删除安全可回溯。
- `07-fx/` 下有两个 `03-` 前缀文件(03-cover-picker-fonts / 03-wallpaper-engine-library),仅命名瑕疵、不影响加载顺序;不动。
- 不动:server.js、qishui-api.js、kugou-api.js、qishui-auth-v6/、desktop/wallpaper-engine-runtime.js 等前后端配对文件(已确认配对完好、无重复)。
