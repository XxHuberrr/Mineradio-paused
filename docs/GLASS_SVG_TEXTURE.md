# Mineradio SVG Glass Texture

这是用户明确要求保存的播放器 SVG 玻璃质感基线。后续可以修补偏移、缺角、套用范围和响应式问题，但不要随意重写核心质感。

## User Approval

用户已经确认：当前播放器控制台质感要保存，并计划逐步套用到搜索栏、小按钮、部分面板和 3D 歌单架。

用户不接受：

- 普通毛玻璃，没有扭曲质感。
- 中间糊成一团的毛玻璃。
- 大面积白色渐变扫过去的廉价质感。
- 右侧缺一块、整体右偏、上下错位明显。
- 因套用 SVG 导致性能明显下降。

## Core CSS Variables

位置：`public/index.html` 顶部 `:root`。

```css
:root{
  --saved-panel-glass-bg:rgba(0,0,0,.10);
  --saved-panel-glass-filter:blur(12px) saturate(1.8) brightness(1.16);
  --saved-panel-glass-svg-filter:url(#mineradio-control-glass-filter) saturate(1);
  --saved-panel-glass-shadow:inset 0 0 2px 1px rgba(255,255,255,.35),inset 0 0 10px 4px rgba(255,255,255,.15),0 4px 16px rgba(17,17,26,.05),0 8px 24px rgba(17,17,26,.05),0 16px 56px rgba(17,17,26,.05),inset 0 4px 16px rgba(17,17,26,.05),inset 0 8px 24px rgba(17,17,26,.05),inset 0 16px 56px rgba(17,17,26,.05);
  --saved-panel-glass-radius:50px;
  --saved-button-glass-bg:rgba(0,0,0,.10);
  --saved-button-glass-filter:blur(12px) saturate(1.8) brightness(1.16);
  --saved-button-glass-svg-filter:url(#mineradio-control-glass-filter) saturate(1);
  --saved-button-glass-shadow:inset 0 0 2px 1px rgba(255,255,255,.34),inset 0 0 10px 4px rgba(255,255,255,.13),0 10px 30px rgba(0,0,0,.18);
  --saved-button-glass-hover-bg:rgba(255,255,255,.055);
  --saved-button-glass-hover-shadow:inset 0 0 2px 1px rgba(255,255,255,.42),inset 0 0 12px 5px rgba(255,255,255,.17),0 12px 34px rgba(0,0,0,.22),0 0 18px rgba(255,255,255,.06);
}
```

## Bottom Bar Baseline

位置：`public/index.html` 的 `#bottom-bar`。

```css
#bottom-bar{
  border-radius:50px;
  background:rgba(0,0,0,.10);
  border:0;
  backdrop-filter:blur(12px) saturate(1.8) brightness(1.16);
  -webkit-backdrop-filter:blur(12px) saturate(1.8) brightness(1.16);
  box-shadow:inset 0 0 2px 1px rgba(255,255,255,.35),inset 0 0 10px 4px rgba(255,255,255,.15),0 4px 16px rgba(17,17,26,.05),0 8px 24px rgba(17,17,26,.05),0 16px 56px rgba(17,17,26,.05),inset 0 4px 16px rgba(17,17,26,.05),inset 0 8px 24px rgba(17,17,26,.05),inset 0 16px 56px rgba(17,17,26,.05);
}
html.control-glass-svg-ok #bottom-bar{
  background:rgba(0,0,0,.10);
  backdrop-filter:url(#mineradio-control-glass-filter) saturate(1);
  -webkit-backdrop-filter:url(#mineradio-control-glass-filter) saturate(1);
}
#bottom-bar::before{content:none}
#bottom-bar::after{content:none}
```

## SVG Filter Baseline

位置：`public/index.html` 的 `<svg id="control-glass-svg">`。

关键点：

- `color-interpolation-filters="sRGB"`
- 主 filter：`id="mineradio-control-glass-filter"`
- filter 区域：`x="-12%" y="-28%" width="124%" height="156%"`
- RGB 三通道 displacement scale：Red `180`、Green `170`、Blue `160`
- RGB 共同对齐中心：`dx="-90" dy="0"`；`controlGlassChromaticOffset` 只能围绕该中心做 Red/Green/Blue 相对分离，不要再整体平移所有通道；UI 下限为 `30`，这是保留最低可见色差的底线。
- merge 后用 `screen` 混合。
- 最后 `feGaussianBlur stdDeviation="0.5"`。

不要把 RGB 偏移改成正向、不要删三通道色差、不要把 `stdDeviation` 拉大。
色差滑块的当前语义：`30` 为最低可见通道分离，默认值 `90` 保持共同中心 `-90` 并增加适中 RGB 边缘分离，最大值 `140` 只扩大三通道相对距离，不移动整块玻璃。

## Displacement Map Generator

位置：`public/index.html` 的 `generateControlGlassDisplacementMap(width, height, radius)`。

核心参数：

```js
width = Math.max(240, Math.round(width || 400));
height = Math.max(48, Math.round(height || 92));
radius = Math.max(12, Math.round(radius || 50));
var borderWidth = 0.07;
var edge = Math.min(width, height) * (borderWidth * 0.5);
```

核心 SVG：

```js
'<linearGradient id="glass-red" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient>' +
'<linearGradient id="glass-blue" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient>' +
'<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="black"/>' +
'<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="' + radius + '" fill="url(#glass-red)"/>' +
'<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="' + radius + '" fill="url(#glass-blue)" style="mix-blend-mode:difference"/>' +
'<rect x="' + edge.toFixed(2) + '" y="' + edge.toFixed(2) + '" width="' + innerW.toFixed(2) + '" height="' + innerH.toFixed(2) + '" rx="' + radius + '" fill="hsl(0 0% 50% / 1)" style="filter:blur(11px)"/>'
```

## Search Reveal Timing

搜索栏必须像底部播放器控制台一样“带着 SVG 质感一起出现”，不能先显示透明玻璃框，再等动画结束才加载色散。

- `setPeek(..., true, 'search')` 前先调用 `prepareSearchGlassBeforePeek()`。
- 如果搜索栏还处在 `search-glass-priming`，不要立刻添加 `peek`；等 `search-glass-ready` / `search-glass-fallback` 出现，或最多等约 140ms 兜底后再显示。
- `updateSearchBoxGlassDisplacementMap()` 不能在 `search-glass-priming` 期间因为二次调用直接把状态切成 ready，否则会绕过预热帧，造成首帧无 SVG 质感。
- `.search-mode-tabs` 容器不能再盖一层 `rgba(0,0,0,.90)` 的普通 blur 黑底；外层 rail 保持透明，SVG 质感只放在每个 tab 胶囊按钮上。
- quick-check 的 `Search glass entrance guard` 必须验证首帧没有提前 `peek`，下一帧后才带着 `url(#mineradio-search-box-glass-filter)` 出现。

Search reveal surface rule: search must mirror the bottom bar reveal. Hidden `#search-box` stays transparent with `backdrop-filter:none`; visible `#search-area.peek #search-box` carries the saved panel background/shadow and, when SVG is available, directly uses `url(#mineradio-search-box-glass-filter) saturate(1)`. Do not put the search box SVG glass on `#search-box::before`; that creates a separate layer from the reveal state and can make the popup feel like the SVG arrives late.

## Wallpaper Engine Single-Surface Rule

2026-07-18 用户明确否定了额外的“可直接透明”玻璃层。旧方案 `Mineradio WE Glass Refraction`、第二个圆角 DWM 面、`DwmQueryThumbnailSourceSize` 局部取样与 `1.105` 放大/错位全部失效，禁止恢复。

当前唯一允许的实现：

- 原生层只有一个全窗 `Mineradio WE DWM Surface`；精确 WE 源窗仍在它下面保持真实 Windows 鼠标视差。
- `#wallpaper-engine-glass-sampler` 只裁切真实 `#bottom-bar`；内部视频保持完整视口 1:1 对齐，不做缩放镜片或二次折射。
- 采样源 HWND 必须与唯一基础 DWM HWND 相同。运行时兼容字段 `dwmGlassSurfaceWindowId` 只是该 HWND 的别名，不代表第二个窗口。
- 采样流必须在 DWM 缩略图激活前对普通基础 HWND 建立；捕获首帧后再激活同一 HWND 的 DWM 缩略图，并在预热黑帧变成真实壁纸像素后才添加 `wallpaper-engine-glass-sampler-ready`。
- 最终扭曲和 RGB 色散只由既有 `#mineradio-control-glass-filter` 产生。Red `180`、Green `170`、Blue `160`、共同中心 `-90`、`screen` 混合、`stdDeviation=0.5` 等冻结参数不因 WE 接入改变。
- 采样 HWND 本身没有光标画面；不得用读取/隐藏/替换系统光标或 DOM 假光标处理捕获。Scene 停止、切换、隐藏或退出时必须停止该 MediaStream。

验收时同时检查：`Mineradio WE Glass Refraction` 窗口数为 `0`、基础 HWND 与采样源 HWND 相等、采样视频轨为 `live` 且无音频、采样器矩形与控制台矩形一致、最大化/还原后仍对齐。

## Safe Change Rules

- 可以：修复右侧缺块、尺寸缓存、ResizeObserver 更新、特定面板的 SVG map 尺寸。
- 可以：给搜索栏、小按钮等新增独立 filter/map，避免共享同一个大尺寸 map。
- 谨慎：调整 filter 区域、offset、scale。改前截图对比。
- 禁止：把 `controlGlassChromaticOffset` 改回同时设置所有 `feOffset dx` 的整体左右偏移。
- 禁止：整体替换为普通 `blur()` 毛玻璃。
- 禁止：为了性能删除色差或扭曲质感。性能要通过节流、缓存、减少实时重算来做。

## Verification Checklist

在黑底和亮底都看一遍：

- 控制台右侧没有缺块。
- 搜索栏没有右侧缺失、整体右偏或白色廉价渐变。
- 播放器中间不是糊的，仍有水波扭曲和 RGB 色差。
- 鼠标 hover、播放暂停、切歌后没有明显卡顿。
