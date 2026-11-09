'use strict';

var FX_CONSOLE_TABS = [
  { key: 'home', label: '常用' },
  { key: 'interface', label: '界面' },
  { key: 'lyrics', label: '歌词' },
  { key: 'motion', label: '动效' },
  { key: 'shelf', label: '歌单架' },
  { key: 'system', label: '系统' }
];

function fxConsoleItem(ref, title, aliases, history) {
  return {
    ref: ref,
    title: title,
    aliases: aliases || '',
    history: history !== false
  };
}

var FX_CONSOLE_LAYOUT = [
  {
    key: 'home',
    groups: [
      { key: 'presets', title: '视觉预设', hint: '先选整体风格，再进入细节调整', open: true, items: [
        fxConsoleItem('preset-grid', '视觉预设', '风格 场景 Emily 安魂 音域 星河 唱片 星球 滚筒 虚空 月蚀圣环 雨幕霓虹 折光蝶群 深海绽放 Eclipse Halo Neon Drizzle Prism Flock Abyssal Bloom')
      ] },
      { key: 'archives', title: '用户存档', hint: '保存、应用和分享整套视觉参数', items: [
        fxConsoleItem('user-archive-grid', '用户存档', '方案 快照 预设码 应用 回退')
      ] },
      { key: 'reset', title: '恢复与整理', hint: '恢复全部默认参数', items: [
        fxConsoleItem({ selector: '.fx-actions' }, '恢复默认', '重置 全部默认')
      ] }
    ]
  },
  {
    key: 'interface',
    groups: [
      { key: 'background', title: '背景媒体', hint: '颜色、封面、图片、视频与 Wallpaper Engine', open: true, items: [
        fxConsoleItem('bg-color-picker', '背景颜色', '纯色 封面取色'),
        fxConsoleItem('bg-media-preview', '背景媒体', '封面 图片 视频 上传 裁切 清除', false),
        fxConsoleItem('wallpaper-engine-value', 'Wallpaper Engine', '壁纸库 识别 导入 恢复原背景', false),
        fxConsoleItem('fx-bgopacity', '背景透明度', '背景强度'),
        fxConsoleItem('fx-bgcropx', '裁切左右', '背景水平 位置'),
        fxConsoleItem('fx-bgcropy', '裁切上下', '背景垂直 位置'),
        fxConsoleItem('fx-bgzoom', '裁切缩放', '背景放大 缩小')
      ] },
      { key: 'colors', title: '界面配色', hint: '界面高亮、视觉主色与图标颜色', items: [
        fxConsoleItem('ui-accent-picker', '界面高亮', '主题色 强调色'),
        fxConsoleItem('visual-tint-picker', '视觉主色', '粒子主色 封面取色'),
        fxConsoleItem('home-accent-picker', 'Home 填充', '主页颜色'),
        fxConsoleItem('home-icon-picker', '主页图标', 'Home 图标颜色'),
        fxConsoleItem('visual-icon-picker', '视觉图标', '控制台图标颜色')
      ] },
      { key: 'glass', title: '玻璃与左栏', hint: '窗口玻璃质感和歌单栏唤出手感', items: [
        fxConsoleItem('fx-windowbgopacity', '窗口背景透明', '窗口透明度'),
        fxConsoleItem('fx-bgglassopacity', '毛玻璃透明', '玻璃 背景模糊'),
        fxConsoleItem('fx-glassaberration', '控制台玻璃色差', 'RGB 色散 玻璃质感'),
        fxConsoleItem('fx-playlistblur', '左栏雾面', '歌单栏 模糊'),
        fxConsoleItem('fx-playlistdensity', '左栏遮挡', '歌单栏 密度 透明'),
        fxConsoleItem('fx-playlistopen', '左栏唤出', '打开速度 秒数'),
        fxConsoleItem('fx-playlistclose', '左栏收起', '关闭速度 秒数')
      ] }
    ]
  },
  {
    key: 'lyrics',
    groups: [
      { key: 'display', title: '显示与翻译', hint: '歌词来源、行数和双语译文', open: true, items: [
        fxConsoleItem('lyric-source-seg', '歌词来源', '原词 自定义歌词', false),
        fxConsoleItem('lyric-display-mode-seg', '歌词行数', '单行 双行 三行 沉浸 自定义'),
        fxConsoleItem('fx-lyriccustomlines', '显示行数', '自定义歌词行数'),
        fxConsoleItem('lyric-translation-mode-seg', '双语翻译', '译文 当前 双行 多行 关闭'),
        fxConsoleItem('fx-lyrictranslationgap', '译文间距', '翻译距离'),
        fxConsoleItem('fx-lyrictranslationscale', '译文字号', '翻译大小'),
        fxConsoleItem('fx-lyrictranslationopacity', '译文透明', '翻译透明度')
      ] },
      { key: 'colors', title: '颜色与光效', hint: '文字、高亮、溢光和亮底可读性', items: [
        fxConsoleItem('lyric-color-grid', '歌词颜色', '文字颜色 封面取色'),
        fxConsoleItem('lyric-color-picker', '歌词自定义颜色', '文字色轮'),
        fxConsoleItem('lyric-highlight-picker', '跟唱高亮', '高亮颜色 逐字'),
        fxConsoleItem('lyric-glow-picker', '歌词溢光颜色', '辉光 光晕 颜色'),
        fxConsoleItem({ selector: '.lyric-glow-effect-row' }, '歌词溢光开关', '后层溢光 跟随鼓点'),
        fxConsoleItem('fx-lyricglow', '溢光强度', '歌词辉光 强度'),
        fxConsoleItem('fx-lyricbgadapt', '亮底避光', '亮背景 可读性 自动压光'),
        fxConsoleItem('t-lyricGlow', '歌词溢光', '后层辉光 开关'),
        fxConsoleItem('t-lyricGlowBeat', '鼓点溢光', '歌词辉光 跟随节拍'),
        fxConsoleItem('t-lyricGlowParticles', '歌词光粒', '歌词粒子 光点')
      ] },
      { key: 'type', title: '字体与排版', hint: '字体、字重、大小、位置和角度', items: [
        fxConsoleItem('lyric-texture-quality-seg', '歌词清晰度', '分辨率 纹理 1x 2x 3x 4x 标清 高清 超清 极致 低配 显存 放大 清楚'),
        fxConsoleItem('lyric-font-grid', '歌词字体', '黑体 宋体 楷宋 Serif Gothic 等宽 上传字体'),
        fxConsoleItem('fx-lyricspacing', '字间距', '文字间距'),
        fxConsoleItem('fx-lyriclineheight', '行距', '歌词行间距'),
        fxConsoleItem('fx-lyricweight', '字重', '粗细'),
        fxConsoleItem('fx-lyricscale', '歌词大小', '字号 缩放'),
        fxConsoleItem('fx-lyricx', '左右位置', '歌词水平'),
        fxConsoleItem('fx-lyricy', '上下位置', '歌词垂直 高度'),
        fxConsoleItem('fx-lyricz', '前后景深', '歌词远近 Z'),
        fxConsoleItem('fx-lyrictiltx', '上下旋转', '歌词俯仰'),
        fxConsoleItem('fx-lyrictilty', '左右旋转', '歌词侧旋')
      ] },
      { key: 'motion', title: '歌词动画', hint: '滚动手感、上下文层次与故障效果', items: [
        fxConsoleItem('lyric-motion-style-seg', '歌词动画', '漂浮 柔滑 玻璃 线光 故障'),
        fxConsoleItem('lyric-glitch-controls', '故障细节', '故障强度 切片 色散 触发速度 抖动 鼓点'),
        fxConsoleItem('fx-lyriccontextopacity', '上下句清晰', '上下文透明度'),
        fxConsoleItem('fx-lyriccontextspread', '上下句间距', '上下文距离'),
        fxConsoleItem('fx-lyricedgefade', '边缘渐隐', '歌词边缘淡出'),
        fxConsoleItem('fx-lyricmotionsoftness', '动画柔顺', '歌词滚动 丝滑 缓动'),
        fxConsoleItem('t-lyricVerticalFloat', '歌词上下浮动', '漂浮 垂直'),
        fxConsoleItem('t-lyricCameraLock', '歌词镜头绑定', '跟随镜头 锁定'),
        fxConsoleItem('t-lyricPauseHold', '暂停保留歌词', '暂停不隐藏')
      ] },
      { key: 'desktop', title: '桌面歌词', hint: '桌面层开关、位置、透明度和帧数', items: [
        fxConsoleItem('t-desktopLyrics', '桌面歌词', '全屏置顶歌词'),
        fxConsoleItem('t-desktopLyricsClickThrough', '桌面歌词锁定', '鼠标穿透 防误触'),
        fxConsoleItem('t-desktopLyricsCinema', '桌面歌词电影震动', '桌面歌词 鼓点'),
        fxConsoleItem('t-desktopLyricsHighlight', '桌面歌词高亮跟随', '桌面逐字高亮'),
        fxConsoleItem('fx-desktoplyricssize', '桌面歌词大小', '桌面字号'),
        fxConsoleItem('fx-desktoplyricsopacity', '桌面歌词透明度', '桌面歌词透明'),
        fxConsoleItem('fx-desktoplyricsy', '桌面歌词高度', '桌面位置'),
        fxConsoleItem('desktop-lyrics-fps-seg', '桌面歌词帧率', '24 30 60 120 无上限 FPS')
      ] }
    ]
  },
  {
    key: 'motion',
    groups: [
      { key: 'base', title: '基础画面', hint: '整体律动、景深、封面和电影镜头', open: true, items: [
        fxConsoleItem('fx-intensity', '律动强度', '音乐响应 节奏'),
        fxConsoleItem('fx-depth', '画面景深', '立体感 深度'),
        fxConsoleItem('fx-coverres', '封面清晰度', '粒子数量 分辨率'),
        fxConsoleItem('fx-cineshake', '电影镜头', '镜头晃动 强度'),
        fxConsoleItem('t-cinema', '电影镜头开关', '动态镜头')
      ] },
      { key: 'particles', title: '粒子与光影', hint: '粒子尺寸、运动、扭曲和溢光', items: [
        fxConsoleItem('t-float', '浮空粒子层', '漂浮粒子'),
        fxConsoleItem('t-bloom', '粒子溢光', '粒子光晕'),
        fxConsoleItem('t-edge', '轮廓高亮', '边缘光'),
        fxConsoleItem('t-backgroundStarRiver', '背景星河', '星空 粒子背景'),
        fxConsoleItem('fx-point', '粒子尺寸', '点大小'),
        fxConsoleItem('fx-speed', '运动速度', '粒子流速'),
        fxConsoleItem('fx-twist', '粒子扭曲', '旋转 扭曲'),
        fxConsoleItem('fx-color', '色彩张力', '粒子颜色 饱和'),
        fxConsoleItem('fx-bloom', '光晕强度', '溢光 bloom'),
        fxConsoleItem('fx-scatter', '离散感', '粒子散开'),
        fxConsoleItem('fx-bgfade', '背景压暗', '背景压缩 暗度')
      ] },
      { key: 'sonic-terrain', title: '音域地形', hint: '地面形态、颜色和空间位置', items: [
        fxConsoleItem('fx-sonicamp', '地面起伏', '音域振幅'),
        fxConsoleItem('fx-sonicspeed', '起伏速度', '地形运动'),
        fxConsoleItem('fx-sonicdensity', '地形密度', '网格密度'),
        fxConsoleItem('fx-sonicrange', '地面范围', '地形大小'),
        fxConsoleItem('fx-soniclower', '歌词避让', '地形降低'),
        fxConsoleItem('fx-sonicdepth', '地面远近', '地形景深'),
        fxConsoleItem('fx-sonicautorotate', '地形自转', '旋转速度'),
        fxConsoleItem('sonic-ground-base-picker', '地形暗部', '音域底色'),
        fxConsoleItem('sonic-ground-cool-picker', '冷色峰值', '音域冷色'),
        fxConsoleItem('sonic-ground-warm-picker', '暖色峰值', '音域暖色'),
        fxConsoleItem('sonic-ground-accent-picker', '涟漪高光', '音域强调色'),
        fxConsoleItem('fx-sonicglow', '音域光强', '地形辉光')
      ] },
      { key: 'sonic-audio', title: '频谱响应', hint: 'Kick 检测、频段范围和各段权重', items: [
        fxConsoleItem('t-sonicAudioMonitorEnabled', '实时频谱', '音频分析 频谱开关'),
        fxConsoleItem('t-sonicAudioAutoTrack', 'Kick 自动', '鼓点自动追踪'),
        fxConsoleItem('sonic-audio-monitor-toggle', '频谱面板', '音频监视器'),
        fxConsoleItem('fx-sonicaudiosensitivity', 'Kick 灵敏', '鼓点灵敏度'),
        fxConsoleItem('fx-sonicaudiobandstart', '范围起点', '频谱起点'),
        fxConsoleItem('fx-sonicaudiobandend', '范围终点', '频谱终点'),
        fxConsoleItem('fx-sonicaudiothreshold', '触发阈值', '频谱门限'),
        fxConsoleItem('fx-sonicaudiopulse', '触发力度', '频谱脉冲'),
        fxConsoleItem('fx-sonicsubbass', '中心低频', 'Sub Bass'),
        fxConsoleItem('fx-sonicbass', '低频重量', 'Bass'),
        fxConsoleItem('fx-soniclowmid', '慢波流动', 'Low Mid'),
        fxConsoleItem('fx-sonicmid', '方向流', 'Mid'),
        fxConsoleItem('fx-sonichighmid', '尖峰', 'High Mid'),
        fxConsoleItem('fx-sonicpresence', '闪光触发', 'Presence'),
        fxConsoleItem('fx-sonicbrilliance', '边缘微闪', 'Brilliance'),
        fxConsoleItem('fx-sonicair', '空气颗粒', 'Air 高频')
      ] },
      { key: 'sonic-blocks', title: '音域方块', hint: '浮空方块的数量、尺寸和速度', items: [
        fxConsoleItem('t-sonicGroundFloatingEnabled', '浮空方块', '音域方块开关'),
        fxConsoleItem('fx-sonicfloatcount', '方块数量', '浮空数量'),
        fxConsoleItem('fx-sonicfloatintensity', '方块强度', '浮空强度'),
        fxConsoleItem('fx-sonicfloatmin', '方块小值', '最小尺寸'),
        fxConsoleItem('fx-sonicfloatmax', '方块大值', '最大尺寸'),
        fxConsoleItem('fx-sonicfloatspeed', '方块速度', '浮空速度')
      ] },
      { key: 'sonic-we', title: '音域回响 · WE', hint: 'Wallpaper Engine 派生地形的响应与配色', items: [
        fxConsoleItem('fx-sonicwegain', '输入压制', 'WE 输入增益'),
        fxConsoleItem('fx-sonicweaudio', '音频响应', 'WE 音频强度'),
        fxConsoleItem('fx-sonicwerange', '响应范围', 'WE 范围'),
        fxConsoleItem('fx-sonicwepeak', '中心高光', 'WE 峰值'),
        fxConsoleItem('sonic-workshop-cover-picker', 'WE 主题基色', '主题 封面取色'),
        fxConsoleItem('sonic-workshop-base-picker', '地形底色', 'WE 底色'),
        fxConsoleItem('sonic-workshop-warm-picker', '暖色主体', 'WE 暖色'),
        fxConsoleItem('sonic-workshop-cool-picker', '上层高光', 'WE 冷色'),
        fxConsoleItem('sonic-workshop-ripple-picker', '波纹亮区', 'WE 波纹'),
        fxConsoleItem('sonic-workshop-peak-picker', '峰值高光', 'WE 高光'),
        fxConsoleItem('sonic-workshop-theme-seg', 'WE 主题', '珊瑚 深海 冰蓝 翠绿 极简')
      ] }
    ]
  },
  {
    key: 'shelf',
    groups: [
      { key: 'display', title: '显示方式', hint: '模式、镜头、常驻状态和内容来源', open: true, items: [
        fxConsoleItem('shelf-seg', '3D 歌单架', '关闭 侧栏 舞台'),
        fxConsoleItem('shelf-camera-seg', '歌单架镜头', '动态镜头 静态镜头'),
        fxConsoleItem('shelf-presence-seg', '歌单架显示', '自动隐藏 常驻'),
        fxConsoleItem('t-shelfShowPodcasts', '显示播客歌单', '3D 播客'),
        fxConsoleItem('t-shelfMergeCollections', '合并收藏歌单', '我的歌单 收藏 连续滚动')
      ] },
      { key: 'look', title: '外观与位置', hint: '歌单架颜色、大小、位置和透明度', items: [
        fxConsoleItem('shelf-accent-picker', '歌单架颜色', '3D 强调色'),
        fxConsoleItem('fx-shelfsize', '歌单架大小', '3D 缩放'),
        fxConsoleItem('fx-shelfx', '左右位置', '歌单架水平'),
        fxConsoleItem('fx-shelfy', '上下位置', '歌单架垂直'),
        fxConsoleItem('fx-shelfz', '前后景深', '歌单架远近'),
        fxConsoleItem('fx-shelfangle', '侧向角度', '歌单架旋转'),
        fxConsoleItem('fx-shelfopacity', '整体透明度', '歌单架透明'),
        fxConsoleItem('fx-shelfbgalpha', '背景透明度', '歌单架背景')
      ] },
      { key: 'detail-position', title: '详情页位置', hint: '详情页位置、比例、角度与行距', items: [
        fxConsoleItem('fx-shelfdetailx', '详情左右', '详情页水平'),
        fxConsoleItem('fx-shelfdetaily', '详情上下', '详情页垂直'),
        fxConsoleItem('fx-shelfdetailz', '详情前后', '详情页景深'),
        fxConsoleItem('fx-shelfdetailscale', '详情大小', '详情页缩放'),
        fxConsoleItem('fx-shelfdetailanglex', '详情俯仰', '详情页上下角度'),
        fxConsoleItem('fx-shelfdetailangley', '详情侧旋', '详情页左右角度'),
        fxConsoleItem('fx-shelfdetailrowgap', '详情行间距', '歌曲行距')
      ] },
      { key: 'detail-motion', title: '详情页动画', hint: '展开、关闭和歌曲行入场手感', items: [
        fxConsoleItem('fx-shelfdetailopen', '展开秒数', '详情打开速度'),
        fxConsoleItem('fx-shelfdetailclose', '关闭秒数', '详情关闭速度'),
        fxConsoleItem('fx-shelfdetailrowtime', '行入场秒数', '歌曲行动画'),
        fxConsoleItem('fx-shelfdetailintro', '展开位移', '详情入场位移'),
        fxConsoleItem('fx-shelfdetailparallax', '悬浮视差', '详情视差')
      ] },
      { key: 'summon', title: '唤出动画', hint: '歌单架整体唤出、收起和镜头速度', items: [
        fxConsoleItem('fx-shelfsummonopen', '唤出秒数', '歌单架打开速度'),
        fxConsoleItem('fx-shelfsummonclose', '收起秒数', '歌单架关闭速度'),
        fxConsoleItem('fx-shelfsummonslide', '唤出位移', '歌单架滑入'),
        fxConsoleItem('fx-shelfsummonstagger', '卡片错层', '卡片延迟'),
        fxConsoleItem('fx-shelfsummonscale', '唤出缩放', '卡片缩放'),
        fxConsoleItem('fx-shelfsummonparallax', '唤出视差', '卡片视差'),
        fxConsoleItem('fx-shelfcamenter', '镜头进入速度', '歌单镜头进入'),
        fxConsoleItem('fx-shelfcamexit', '镜头离开速度', '歌单镜头退出')
      ] },
      { key: 'camera', title: '摄像头交互', hint: '摄像头手势触碰开关', items: [
        fxConsoleItem('cam-seg', '摄像头交互', '关闭 手势触碰'),
        fxConsoleItem('gesture-settings-card', '播放手势', '播放 暂停 上一首 下一首 音量 喜欢 歌词 手部光迹 灵敏度')
      ] }
    ]
  },
  {
    key: 'system',
    groups: [
      { key: 'startup', title: '启动与退出', hint: '关闭窗口行为和恢复播放方式', open: true, items: [
        fxConsoleItem('close-behavior-seg', '关闭窗口', '直接退出 后台托盘'),
        fxConsoleItem('t-startupAutoplay', '启动自动播放', '打开软件继续播放'),
        fxConsoleItem('t-startupFastSkip', '秒启动跳过启动页', '快速启动'),
        fxConsoleItem('startup-resume-mode-seg', '恢复播放位置', '按上次进度 重播整首')
      ] },
      { key: 'output', title: '播放输出', hint: '音频输出设备和路由面板', items: [
        fxConsoleItem('audio-output-panel', '播放输出设备', '声卡 耳机 扬声器 路由', false)
      ] },
      { key: 'performance', title: '性能与后台', hint: '画质档位、后台渲染和直播保持', items: [
        fxConsoleItem('performance-quality-seg', '画质档位', '低配 中 高 超高 渲染质量'),
        fxConsoleItem('foreground-fps-seg', '前台帧率上限', 'FPS 跟随屏幕 垂直同步 VSync 高刷 节能 45 60 75 90 120'),
        fxConsoleItem('t-lyricLiveViewportFit', '歌词实时边界', '逐帧 投影 长歌词 屏幕余量 性能'),
        fxConsoleItem('t-lyricContextHighQuality', '上下句高清纹理', '歌词 高清 预热 GPU 显存'),
        fxConsoleItem('t-lyricBackdropAdapt', '全局歌词避光', '歌词 亮底 可读性 动态'),
        fxConsoleItem('t-coverBackdropAdapt', '封面粒子避光', '粒子 亮底 GPU 着色器'),
        fxConsoleItem('performance-background-seg', '后台渲染策略', '自动优化 保持运行 停止释放'),
        fxConsoleItem('t-liveBackgroundKeep', '直播后台保持', '最小化继续渲染')
      ] },
      { key: 'memory', title: '内存管理', hint: '播放器压缩、系统释放范围和阈值', items: [
        fxConsoleItem('memory-status-chip', '系统内存状态', 'Mem Reduct 占用', false),
        fxConsoleItem('memory-status-sub', '内存说明', '工作集 待机页', false),
        fxConsoleItem('t-memoryAutoTrimApp', '自动压缩播放器', '内存 压缩 Electron'),
        fxConsoleItem('t-memoryAutoTrimOnBackground', '后台触发压缩', '最小化内存'),
        fxConsoleItem('t-memoryAutoSystemTrim', '系统级定时释放', 'Mem Reduct 自动'),
        fxConsoleItem('t-memorySystemAutoElevate', '需要时请求管理员', 'UAC 提权'),
        fxConsoleItem('memory-mask-seg', '系统释放范围', '工作集 修改页 待机页'),
        fxConsoleItem('fx-memory-interval', '定时释放', '分钟 间隔'),
        fxConsoleItem('fx-memory-threshold', '占用阈值', '内存百分比'),
        fxConsoleItem({ selector: '.memory-action-row' }, '手动内存操作', '压缩播放器 系统释放 提权释放', false)
      ] },
      { key: 'cache', title: '缓存与存储', hint: '统一缓存目录、占用和各类路径', items: [
        fxConsoleItem('cache-storage-panel', '本地缓存', '缓存路径 缓存目录 占用 歌词 封面 音频 更新', false)
      ] },
      { key: 'experimental', title: '实验功能', hint: '尚未开放或需要谨慎使用的能力', items: [
        fxConsoleItem('t-wallpaperMode', '完整桌面模式', '完整 Mineradio 进入桌面层 Ctrl Shift M 切换操作层 本次启动有效', false)
      ] }
    ]
  }
];

var fxConsoleRegistry = [];
var fxConsoleGroups = {};

function fxConsoleResolveBlock(ref) {
  var el = null;
  if (typeof ref === 'string') el = document.getElementById(ref);
  else if (ref && ref.element) el = ref.element;
  else if (ref && ref.selector) el = document.querySelector('#fx-panel ' + ref.selector) || document.querySelector(ref.selector);
  if (!el) return null;
  var selector = '.fx-slider,.lyric-color-row,.lyric-color-grid,.fx-seg,.preset-grid,.user-archive-grid,.fx-font-grid,.fx-toggle,.lyric-glitch-controls,.lyric-glow-effect-row,.sonic-audio-monitor,.audio-output-section,.cache-storage-panel,.memory-status-chip,.memory-status-sub,.memory-action-row,.fx-actions';
  if (el.matches && el.matches(selector)) return el;
  return el.closest ? (el.closest(selector) || el) : el;
}

function fxConsoleMakeToolbar(panel) {
  var toolbar = document.createElement('div');
  toolbar.className = 'fx-console-toolbar';
  toolbar.id = 'fx-console-toolbar';
  toolbar.innerHTML =
    '<div class="fx-console-search-row" role="search">' +
    '<span class="fx-console-search-icon" aria-hidden="true">⌕</span>' +
    '<input id="fx-console-search" class="fx-console-search" type="search" autocomplete="off" spellcheck="false" aria-label="搜索视觉控制台功能" aria-controls="fx-console-search-results" aria-expanded="false" placeholder="搜索功能，如：粒子、缓存、歌词">' +
    '<button id="fx-console-undo" class="fx-console-tool-btn" type="button" disabled aria-label="撤销上一步设置" title="撤销上一步设置">↶<span>撤销</span></button>' +
    '<button id="fx-console-history-toggle" class="fx-console-tool-btn" type="button" aria-label="最近操作" aria-controls="fx-console-history" aria-haspopup="true" aria-expanded="false" title="最近操作">◷<span>历史</span></button>' +
    '</div>' +
    '<div id="fx-console-search-results" class="fx-console-popover fx-console-search-results" hidden></div>' +
    '<div id="fx-panel-tabs" class="fx-panel-tabs" role="tablist" aria-label="视觉控制台分类"></div>' +
    '<div id="fx-console-history" class="fx-console-popover fx-console-history-popover" hidden></div>';
  var tabs = toolbar.querySelector('#fx-panel-tabs');
  FX_CONSOLE_TABS.forEach(function (meta) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'fx-console-tab-' + meta.key;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('data-fx-tab', meta.key);
    btn.setAttribute('aria-controls', 'fx-console-page-' + meta.key);
    btn.setAttribute('aria-selected', 'false');
    btn.setAttribute('tabindex', '-1');
    btn.textContent = meta.label;
    tabs.appendChild(btn);
  });
  panel.appendChild(toolbar);
  return toolbar;
}

function fxConsoleMakeGroup(page, tabMeta, groupMeta) {
  var fold = document.createElement('section');
  fold.className = 'fx-fold fx-console-group' + (groupMeta.open ? ' open' : '');
  fold.setAttribute('data-fx-console-group', groupMeta.key);
  fold.setAttribute('data-fx-console-tab', tabMeta.key);
  var groupId = 'fx-console-' + tabMeta.key + '-' + groupMeta.key;
  var head = document.createElement('button');
  head.type = 'button';
  head.id = groupId + '-head';
  head.className = 'fx-fold-head fx-console-group-head';
  head.setAttribute('aria-expanded', groupMeta.open ? 'true' : 'false');
  head.setAttribute('aria-controls', groupId + '-body');
  var title = document.createElement('span');
  title.className = 'fx-fold-title';
  var strong = document.createElement('strong');
  strong.textContent = groupMeta.title;
  var small = document.createElement('small');
  small.textContent = groupMeta.hint || '';
  title.appendChild(strong);
  title.appendChild(small);
  var arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.textContent = '▶';
  head.appendChild(title);
  head.appendChild(arrow);
  var body = document.createElement('div');
  body.id = groupId + '-body';
  body.className = 'fx-fold-body fx-console-group-body';
  fold.setAttribute('aria-labelledby', head.id);
  head.addEventListener('click', function () {
    var open = !fold.classList.contains('open');
    fold.classList.toggle('open', open);
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (typeof repositionFxFloatingPanels === 'function') repositionFxFloatingPanels();
  });
  fold.appendChild(head);
  fold.appendChild(body);
  page.appendChild(fold);
  fxConsoleGroups[tabMeta.key + ':' + groupMeta.key] = fold;
  return body;
}

function fxConsoleAppendItem(body, tabMeta, groupMeta, item, state) {
  var node = fxConsoleResolveBlock(item.ref);
  if (!node) {
    console.warn('[FxConsole] control missing:', item.title, item.ref);
    return;
  }
  var existing = null;
  for (var i = 0; i < fxConsoleRegistry.length; i++) {
    if (fxConsoleRegistry[i].element === node) { existing = fxConsoleRegistry[i]; break; }
  }
  if (existing) {
    existing.aliases += ' ' + item.aliases;
    return;
  }
  if (node.classList.contains('fx-toggle')) {
    if (!state.toggleGrid) {
      state.toggleGrid = document.createElement('div');
      state.toggleGrid.className = 'fx-toggle-grid fx-console-toggle-grid';
      body.appendChild(state.toggleGrid);
    }
    state.toggleGrid.appendChild(node);
  } else {
    state.toggleGrid = null;
    body.appendChild(node);
  }
  var entry = {
    id: 'fx-console-entry-' + (fxConsoleRegistry.length + 1),
    title: item.title,
    aliases: item.aliases || '',
    tab: tabMeta.key,
    tabLabel: tabMeta.label,
    group: groupMeta.key,
    groupLabel: groupMeta.title,
    history: item.history !== false,
    element: node
  };
  node.setAttribute('data-fx-console-entry', entry.id);
  node.setAttribute('data-fx-console-tab', entry.tab);
  node.setAttribute('data-fx-console-group', entry.group);
  node.setAttribute('data-fx-console-title', entry.title);
  node.setAttribute('data-fx-console-history', entry.history ? 'on' : 'off');
  fxConsoleRegistry.push(entry);
}

function fxConsoleFindUnclassifiedControls(roots) {
  var blockSelector = '.fx-slider,.lyric-color-row,.lyric-color-grid,.fx-seg,.preset-grid,.user-archive-grid,.fx-font-grid,.fx-toggle,.lyric-glitch-controls,.lyric-glow-effect-row,.sonic-audio-monitor,.audio-output-section,.cache-storage-panel,.memory-status-chip,.memory-status-sub,.memory-action-row,.fx-actions';
  var blocks = [];
  roots.forEach(function (root) {
    if (!root || !root.isConnected) return;
    if (root.matches && root.matches('input:not([type="hidden"]),select,textarea,button') && !root.closest('[data-fx-console-entry],.fx-console-toolbar,.fx-fold-head,.fx-advanced-head')) {
      blocks.push(root);
    }
    root.querySelectorAll('input:not([type="hidden"]),select,textarea,button').forEach(function (control) {
      if (control.closest('.fx-console-toolbar') || control.closest('[data-fx-console-entry]')) return;
      if (control.closest('.fx-fold-head,.fx-advanced-head')) return;
      var block = control.matches && control.matches(blockSelector) ? control : (control.closest ? control.closest(blockSelector) : null);
      if (!block) block = control;
      if (blocks.indexOf(block) < 0) blocks.push(block);
    });
  });
  return blocks;
}

function organizeFxConsoleWorkspace() {
  var panel = document.getElementById('fx-panel');
  if (!panel) return;
  if (panel._fxConsoleWorkspaceOrganized) {
    setFxPanelTab(fxPanelTab);
    return;
  }
  var head = panel.querySelector('.fx-head');
  var oldRoots = Array.prototype.slice.call(panel.children).filter(function (node) { return node !== head; });
  fxConsoleRegistry = [];
  fxConsoleGroups = {};
  var oldTabs = document.getElementById('fx-panel-tabs');
  if (oldTabs && oldTabs.parentNode) oldTabs.parentNode.removeChild(oldTabs);
  var toolbar = fxConsoleMakeToolbar(panel);
  var pages = {};
  FX_CONSOLE_TABS.forEach(function (meta) {
    var page = document.createElement('div');
    page.id = 'fx-console-page-' + meta.key;
    page.className = 'fx-tab-page';
    page.setAttribute('data-fx-page', meta.key);
    page.setAttribute('role', 'tabpanel');
    page.setAttribute('aria-labelledby', 'fx-console-tab-' + meta.key);
    page.setAttribute('aria-hidden', 'true');
    panel.appendChild(page);
    pages[meta.key] = page;
  });
  FX_CONSOLE_LAYOUT.forEach(function (tabLayout) {
    var tabMeta = null;
    FX_CONSOLE_TABS.some(function (meta) {
      if (meta.key === tabLayout.key) { tabMeta = meta; return true; }
      return false;
    });
    if (!tabMeta || !pages[tabMeta.key]) return;
    tabLayout.groups.forEach(function (groupMeta) {
      var body = fxConsoleMakeGroup(pages[tabMeta.key], tabMeta, groupMeta);
      var state = { toggleGrid: null };
      groupMeta.items.forEach(function (item) {
        fxConsoleAppendItem(body, tabMeta, groupMeta, item, state);
      });
    });
  });
  var residual = fxConsoleFindUnclassifiedControls(oldRoots);
  if (residual.length) {
    var fallbackMeta = { key: 'other', title: '其他设置', hint: '尚未归入明确分类的兼容项' };
    var fallbackBody = fxConsoleMakeGroup(pages.system, { key: 'system', label: '系统' }, fallbackMeta);
    residual.forEach(function (node, index) {
      fxConsoleAppendItem(fallbackBody, { key: 'system', label: '系统' }, fallbackMeta, {
        ref: { element: node },
        title: String(node.textContent || '兼容设置').trim().slice(0, 40) || '兼容设置',
        aliases: '其他 兼容',
        history: true
      }, { toggleGrid: null });
    });
    console.warn('[FxConsole] residual controls:', residual.length);
  }
  oldRoots.forEach(function (node) {
    if (node && node.isConnected && node.parentNode === panel && node !== toolbar && !node.classList.contains('fx-tab-page')) node.remove();
  });
  toolbar.querySelector('#fx-panel-tabs').addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-fx-tab]') : null;
    if (!btn) return;
    setFxPanelTab(btn.getAttribute('data-fx-tab'));
    if (typeof closeFxConsolePopovers === 'function') closeFxConsolePopovers();
  });
  toolbar.querySelector('#fx-panel-tabs').addEventListener('keydown', function (e) {
    if (!/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) return;
    var buttons = Array.prototype.slice.call(toolbar.querySelectorAll('[data-fx-tab]'));
    var current = buttons.indexOf(document.activeElement);
    if (current < 0) return;
    e.preventDefault();
    var next = e.key === 'Home' ? 0 : (e.key === 'End' ? buttons.length - 1 : (current + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length);
    buttons[next].focus();
    setFxPanelTab(buttons[next].getAttribute('data-fx-tab'));
  });
  panel._fxConsoleWorkspaceOrganized = true;
  panel.setAttribute('data-console-layout', 'task-first-v2');
  setFxPanelTab(fxPanelTab);
}

function fxConsoleEntryForElement(element) {
  var node = element && element.closest ? element.closest('[data-fx-console-entry]') : null;
  if (!node) return null;
  var id = node.getAttribute('data-fx-console-entry');
  for (var i = 0; i < fxConsoleRegistry.length; i++) {
    if (fxConsoleRegistry[i].id === id) return fxConsoleRegistry[i];
  }
  return null;
}

function fxConsoleNormalizeSearch(value) {
  return String(value || '').toLowerCase().replace(/[\s\-_./]+/g, '');
}

function fxConsoleCurrentValue(entry) {
  if (!entry || !entry.element) return '';
  var el = entry.element;
  var range = el.matches && el.matches('input[type="range"]') ? el : el.querySelector && el.querySelector('input[type="range"]');
  if (range) {
    var output = range.parentElement && range.parentElement.querySelector('output');
    return output && output.textContent ? output.textContent : range.value;
  }
  var color = el.matches && el.matches('input[type="color"]') ? el : el.querySelector && el.querySelector('input[type="color"]');
  if (color) return String(color.value || '').toUpperCase();
  if (el.classList && el.classList.contains('fx-toggle')) return el.classList.contains('on') ? '已开启' : '已关闭';
  var active = el.querySelector && el.querySelector('.active');
  if (active && active.textContent) return active.textContent.trim();
  return '';
}

function closeFxConsolePopovers() {
  var results = document.getElementById('fx-console-search-results');
  var history = document.getElementById('fx-console-history');
  var historyBtn = document.getElementById('fx-console-history-toggle');
  var search = document.getElementById('fx-console-search');
  if (results) results.hidden = true;
  if (history) history.hidden = true;
  if (historyBtn) historyBtn.setAttribute('aria-expanded', 'false');
  if (search) search.setAttribute('aria-expanded', 'false');
}

var fxConsoleSearchHitDelayTimer = 0;
var fxConsoleSearchHitClearTimer = 0;
function fxConsoleFocusEntry(entry) {
  if (!entry || !entry.element) return;
  setFxPanelTab(entry.tab);
  var group = fxConsoleGroups[entry.tab + ':' + entry.group];
  if (group) {
    group.classList.add('open');
    var head = group.querySelector('.fx-console-group-head');
    if (head) head.setAttribute('aria-expanded', 'true');
  }
  closeFxConsolePopovers();
  requestAnimationFrame(function () {
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    entry.element.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    var focusTarget = entry.element.matches && entry.element.matches('input,button,select,textarea,[tabindex]')
      ? entry.element
      : (entry.element.querySelector && entry.element.querySelector('input:not([type="hidden"]),button,select,textarea,[tabindex]'));
    if (!focusTarget && group) focusTarget = group.querySelector('.fx-console-group-head');
    if (focusTarget && focusTarget.focus) focusTarget.focus({ preventScroll: true });
    if (fxConsoleSearchHitDelayTimer) clearTimeout(fxConsoleSearchHitDelayTimer);
    if (fxConsoleSearchHitClearTimer) clearTimeout(fxConsoleSearchHitClearTimer);
    document.querySelectorAll('#fx-panel .fx-search-hit').forEach(function (node) { node.classList.remove('fx-search-hit'); });
    fxConsoleSearchHitDelayTimer = setTimeout(function () {
      fxConsoleSearchHitDelayTimer = 0;
      if (!entry.element || !entry.element.isConnected) return;
      entry.element.classList.remove('fx-search-hit');
      void entry.element.offsetWidth;
      entry.element.classList.add('fx-search-hit');
      fxConsoleSearchHitClearTimer = setTimeout(function () {
        fxConsoleSearchHitClearTimer = 0;
        if (entry.element) entry.element.classList.remove('fx-search-hit');
      }, reduceMotion ? 1100 : 1650);
    }, reduceMotion ? 0 : 220);
  });
}

function renderFxConsoleSearchResults(query) {
  var results = document.getElementById('fx-console-search-results');
  var history = document.getElementById('fx-console-history');
  var historyBtn = document.getElementById('fx-console-history-toggle');
  var search = document.getElementById('fx-console-search');
  if (!results) return;
  var needle = fxConsoleNormalizeSearch(query);
  results.innerHTML = '';
  if (!needle) {
    results.hidden = true;
    if (search) search.setAttribute('aria-expanded', 'false');
    return;
  }
  if (history) history.hidden = true;
  if (historyBtn) historyBtn.setAttribute('aria-expanded', 'false');
  var matches = fxConsoleRegistry.filter(function (entry) {
    var text = [entry.title, entry.aliases, entry.tabLabel, entry.groupLabel, entry.element && entry.element.textContent].join(' ');
    return fxConsoleNormalizeSearch(text).indexOf(needle) >= 0;
  }).slice(0, 18);
  if (!matches.length) {
    var empty = document.createElement('div');
    empty.className = 'fx-console-empty';
    empty.textContent = '没有找到“' + String(query || '').trim().slice(0, 30) + '”';
    results.appendChild(empty);
  } else {
    matches.forEach(function (entry) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fx-console-search-result';
      var main = document.createElement('span');
      main.className = 'fx-console-result-main';
      var title = document.createElement('strong');
      title.textContent = entry.title;
      var crumb = document.createElement('small');
      crumb.className = 'fx-console-breadcrumb';
      crumb.textContent = entry.tabLabel + ' › ' + entry.groupLabel;
      main.appendChild(title);
      main.appendChild(crumb);
      var value = document.createElement('b');
      value.textContent = fxConsoleCurrentValue(entry);
      btn.appendChild(main);
      btn.appendChild(value);
      btn.addEventListener('click', function () { fxConsoleFocusEntry(entry); });
      results.appendChild(btn);
    });
  }
  results.hidden = false;
  if (search) search.setAttribute('aria-expanded', 'true');
}

var fxConsoleHistory = [];
var fxConsoleHistoryTxn = null;
var fxConsoleHistoryApplying = false;
var FX_CONSOLE_HISTORY_LIMIT = 40;

function captureFxConsoleState() {
  var snapshot = null;
  if (typeof captureFxArchiveSnapshot === 'function') snapshot = captureFxArchiveSnapshot();
  if (!snapshot) {
    var raw = { visualPresetSchema: typeof VISUAL_PRESET_SCHEMA !== 'undefined' ? VISUAL_PRESET_SCHEMA : 2 };
    Object.keys(fx || {}).forEach(function (key) { raw[key] = fx[key]; });
    snapshot = typeof normalizeFxArchiveSnapshot === 'function' ? normalizeFxArchiveSnapshot(raw) : Object.assign({}, raw);
  }
  return {
    fx: snapshot || {},
    closeBehavior: typeof closeBehaviorPreference !== 'undefined' ? closeBehaviorPreference : null,
    startupResumeMode: typeof startupResumeModePreference !== 'undefined' ? startupResumeModePreference : null,
    startupAutoplay: typeof startupAutoplayPreference !== 'undefined' ? !!startupAutoplayPreference : null,
    startupFastSkip: typeof startupFastSkipPreference !== 'undefined' ? !!startupFastSkipPreference : null
  };
}

var FX_CONSOLE_PREF_KEYS = ['closeBehavior', 'startupResumeMode', 'startupAutoplay', 'startupFastSkip'];
var FX_CONSOLE_EXCLUDED_FX_KEYS = { backgroundAlbumCover: true };

function fxConsoleValueEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fxConsoleChangedKeys(before, after) {
  var changed = { fx: [], prefs: [] };
  var keys = {};
  Object.keys(before && before.fx || {}).forEach(function (key) { keys[key] = true; });
  Object.keys(after && after.fx || {}).forEach(function (key) { keys[key] = true; });
  Object.keys(keys).forEach(function (key) {
    if (!FX_CONSOLE_EXCLUDED_FX_KEYS[key] && !fxConsoleValueEqual(before.fx[key], after.fx[key])) changed.fx.push(key);
  });
  FX_CONSOLE_PREF_KEYS.forEach(function (key) {
    if (!fxConsoleValueEqual(before && before[key], after && after[key])) changed.prefs.push(key);
  });
  return changed;
}

function fxConsoleChangesEmpty(changes) {
  return !changes || (!changes.fx.length && !changes.prefs.length);
}

function fxConsoleStateEqual(a, b) {
  if (!a || !b) return false;
  return fxConsoleChangesEmpty(fxConsoleChangedKeys(a, b));
}

function fxConsoleFormatHistoryValue(value) {
  if (value === true) return '开启';
  if (value === false) return '关闭';
  if (typeof value === 'number') return Math.abs(value - Math.round(value)) < 0.0001 ? String(Math.round(value)) : String(Math.round(value * 100) / 100);
  if (value == null) return '无';
  return String(value);
}

function fxConsoleHistoryDetail(before, after, changes) {
  var changed = [];
  changes = changes || fxConsoleChangedKeys(before, after);
  changes.fx.forEach(function (key) {
    changed.push([before.fx[key], after.fx[key]]);
  });
  changes.prefs.forEach(function (key) {
    changed.push([before[key], after[key]]);
  });
  if (!changed.length) return '';
  if (changed.length > 1) return changed.length + ' 项参数';
  return fxConsoleFormatHistoryValue(changed[0][0]) + ' → ' + fxConsoleFormatHistoryValue(changed[0][1]);
}

function fxConsoleHistoryControlLabel(entry, target) {
  var label = entry ? entry.title : '视觉设置';
  var button = target && target.closest ? target.closest('button') : null;
  if (button && button.textContent && !button.classList.contains('fx-reset-one')) {
    var text = button.textContent.replace(/\s+/g, ' ').trim();
    if (text && text !== label && text.length < 22) label += ' · ' + text;
  }
  return label;
}

function pushFxConsoleHistory(label, controlKey, before, after, mergeable, adapter) {
  var changes = fxConsoleChangedKeys(before, after);
  if (fxConsoleHistoryApplying || fxConsoleChangesEmpty(changes)) return;
  var now = Date.now();
  var last = fxConsoleHistory[fxConsoleHistory.length - 1];
  if (mergeable && last && last.controlKey === controlKey && now - last.time < 650) {
    last.after = after;
    last.changes = fxConsoleChangedKeys(last.before, last.after);
    last.time = now;
    last.detail = fxConsoleHistoryDetail(last.before, last.after, last.changes);
    if (adapter) {
      last.adapter = last.adapter || adapter;
      last.adapter.afterValue = adapter.afterValue;
    }
    if (fxConsoleChangesEmpty(last.changes)) fxConsoleHistory.pop();
  } else {
    fxConsoleHistory.push({
      label: label,
      controlKey: controlKey,
      before: before,
      after: after,
      changes: changes,
      adapter: adapter || null,
      time: now,
      detail: fxConsoleHistoryDetail(before, after, changes)
    });
    if (fxConsoleHistory.length > FX_CONSOLE_HISTORY_LIMIT) fxConsoleHistory.shift();
  }
  renderFxConsoleHistory();
}

function fxConsoleMergeChanges(records) {
  var merged = { fx: [], prefs: [] };
  var fxSeen = {};
  var prefSeen = {};
  (records || []).forEach(function (record) {
    var changes = record && record.changes || fxConsoleChangedKeys(record.before, record.after);
    changes.fx.forEach(function (key) { if (!fxSeen[key]) { fxSeen[key] = true; merged.fx.push(key); } });
    changes.prefs.forEach(function (key) { if (!prefSeen[key]) { prefSeen[key] = true; merged.prefs.push(key); } });
  });
  return merged;
}

function fxConsoleStateMatchesChanges(current, target, changes) {
  if (!current || !target) return false;
  for (var i = 0; i < changes.fx.length; i++) {
    var fxKey = changes.fx[i];
    if (!fxConsoleValueEqual(current.fx[fxKey], target.fx[fxKey])) return false;
  }
  for (var j = 0; j < changes.prefs.length; j++) {
    var prefKey = changes.prefs[j];
    if (!fxConsoleValueEqual(current[prefKey], target[prefKey])) return false;
  }
  return true;
}

function fxConsoleTryApplyInputAdapter(record, targetState, changes) {
  var adapter = record && record.adapter;
  if (!adapter || adapter.kind !== 'input' || changes.prefs.length) return false;
  var control = document.getElementById(adapter.controlId);
  if (!control || !control.matches('input[type="range"],input[type="color"]')) return false;
  control.value = adapter.beforeValue;
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
  return fxConsoleStateMatchesChanges(captureFxConsoleState(), targetState, changes);
}

function fxConsoleApplyPreferences(state, changes) {
  if (changes.prefs.indexOf('closeBehavior') >= 0 && state.closeBehavior != null && typeof setCloseBehaviorPreference === 'function') {
    setCloseBehaviorPreference(state.closeBehavior, { toast: false });
  }
  if (changes.prefs.indexOf('startupResumeMode') >= 0 && state.startupResumeMode != null && typeof setStartupResumeModePreference === 'function') {
    setStartupResumeModePreference(state.startupResumeMode, { toast: false });
  }
  if (changes.prefs.indexOf('startupAutoplay') >= 0 && state.startupAutoplay != null && typeof startupAutoplayPreference !== 'undefined' && startupAutoplayPreference !== state.startupAutoplay && typeof toggleStartupAutoplay === 'function') {
    toggleStartupAutoplay();
  }
  if (changes.prefs.indexOf('startupFastSkip') >= 0 && state.startupFastSkip != null && typeof startupFastSkipPreference !== 'undefined' && startupFastSkipPreference !== state.startupFastSkip && typeof toggleStartupFastSkip === 'function') {
    toggleStartupFastSkip();
  }
}

function fxConsoleApplyState(state, label, records, allowAdapter) {
  if (!state || fxConsoleHistoryApplying) return false;
  records = records || [];
  var changes = fxConsoleMergeChanges(records);
  if (fxConsoleChangesEmpty(changes)) return false;
  fxConsoleHistoryApplying = true;
  try {
    var applied = allowAdapter && records.length === 1 && fxConsoleTryApplyInputAdapter(records[0], state, changes);
    if (!applied && changes.fx.length) {
      var current = captureFxConsoleState();
      var merged = Object.assign({}, current.fx);
      changes.fx.forEach(function (key) { merged[key] = state.fx[key]; });
      if (typeof applyFxArchiveSnapshot !== 'function' || !applyFxArchiveSnapshot(merged)) throw new Error('视觉状态恢复失败');
    }
    fxConsoleApplyPreferences(state, changes);
    if (typeof configureMemoryReductFromFx === 'function') configureMemoryReductFromFx('history-undo', false);
    if (typeof saveLyricLayout === 'function') saveLyricLayout({ user: true, reason: 'consoleHistoryUndo' });
    if (typeof showToast === 'function') showToast('已回退：' + label);
    return true;
  } catch (error) {
    console.error('[FxConsole] history rollback failed', error);
    if (typeof showToast === 'function') showToast('回退失败，请重试');
    return false;
  } finally {
    setTimeout(function () {
      fxConsoleHistoryApplying = false;
      renderFxConsoleHistory();
    }, 0);
  }
}

function undoFxConsoleHistory() {
  if (!fxConsoleHistory.length || fxConsoleHistoryApplying) return;
  var record = fxConsoleHistory[fxConsoleHistory.length - 1];
  if (!fxConsoleApplyState(record.before, record.label, [record], true)) return;
  fxConsoleHistory.pop();
  renderFxConsoleHistory();
}

function rollbackFxConsoleHistoryTo(index) {
  index = Math.max(0, Math.min(fxConsoleHistory.length - 1, Number(index) || 0));
  var record = fxConsoleHistory[index];
  var records = fxConsoleHistory.slice(index);
  if (!record || !fxConsoleApplyState(record.before, record.label, records, false)) return;
  fxConsoleHistory.length = index;
  renderFxConsoleHistory();
}

function renderFxConsoleHistory() {
  var undo = document.getElementById('fx-console-undo');
  var pop = document.getElementById('fx-console-history');
  if (undo) undo.disabled = !fxConsoleHistory.length || fxConsoleHistoryApplying;
  if (!pop) return;
  pop.innerHTML = '';
  var head = document.createElement('div');
  head.className = 'fx-console-popover-head';
  head.innerHTML = '<strong>最近操作</strong><small>当前会话 · 最多 40 条</small>';
  pop.appendChild(head);
  if (!fxConsoleHistory.length) {
    var empty = document.createElement('div');
    empty.className = 'fx-console-empty';
    empty.textContent = '调整设置后会在这里留下可回退记录';
    pop.appendChild(empty);
    return;
  }
  for (var i = fxConsoleHistory.length - 1; i >= 0; i--) {
    (function (index) {
      var record = fxConsoleHistory[index];
      var row = document.createElement('div');
      row.className = 'fx-console-history-item';
      var text = document.createElement('span');
      var title = document.createElement('strong');
      title.textContent = record.label;
      var meta = document.createElement('small');
      var d = new Date(record.time);
      meta.textContent = [String(d.getHours()).padStart(2, '0'), String(d.getMinutes()).padStart(2, '0'), String(d.getSeconds()).padStart(2, '0')].join(':') + (record.detail ? ' · ' + record.detail : '');
      text.appendChild(title);
      text.appendChild(meta);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = index === fxConsoleHistory.length - 1 ? '撤销' : '撤销至此项前';
      btn.addEventListener('click', function () {
        if (index === fxConsoleHistory.length - 1) undoFxConsoleHistory();
        else rollbackFxConsoleHistoryTo(index);
      });
      row.appendChild(text);
      row.appendChild(btn);
      pop.appendChild(row);
    })(i);
  }
}

function fxConsoleClickIsReversible(target, entry) {
  if (!target || !entry || !entry.history) return false;
  if (target.closest('.fx-console-toolbar,.fx-console-group-head')) return false;
  if (target.matches('input[type="range"],input[type="color"]')) return false;
  if (target.closest('#audio-output-panel,#cache-storage-panel,.memory-action-row,.bg-media-row,.wallpaper-engine-row')) return false;
  var archive = target.closest('#user-archive-grid');
  if (archive) {
    var archiveBtn = target.closest('button');
    return !!(archiveBtn && archiveBtn.textContent.trim() === '应用');
  }
  return !!target.closest('button,.fx-toggle,.fx-seg,.lyric-color-row,.fx-font-grid,.preset-card,.fx-actions');
}

function fxConsoleBeginRangeTxn(target) {
  if (fxConsoleHistoryApplying || !target) return;
  var entry = fxConsoleEntryForElement(target);
  if (!entry || !entry.history) return;
  var input = target.matches && target.matches('input[type="range"],input[type="color"]') ? target : target.closest('input[type="range"],input[type="color"]');
  if (!input) return;
  if (fxConsoleHistoryTxn && fxConsoleHistoryTxn.control === input) return;
  fxConsoleHistoryTxn = {
    control: input,
    entry: entry,
    before: captureFxConsoleState(),
    beforeValue: input.value,
    label: entry.title,
    key: input.id || entry.id
  };
}

function fxConsoleCommitRangeTxn(target) {
  if (!fxConsoleHistoryTxn || fxConsoleHistoryApplying) return;
  if (target && fxConsoleHistoryTxn.control !== target && !(target.closest && target.closest('#color-lab-pop'))) return;
  var txn = fxConsoleHistoryTxn;
  fxConsoleHistoryTxn = null;
  pushFxConsoleHistory(txn.label, txn.key, txn.before, captureFxConsoleState(), true, {
    kind: 'input',
    controlId: txn.control.id,
    beforeValue: txn.beforeValue,
    afterValue: txn.control.value
  });
}

function fxConsoleRegisterHotkeySearchEntry() {
  var hotkey = document.getElementById('hotkey-settings-btn');
  if (!hotkey || hotkey.getAttribute('data-fx-console-entry')) return;
  var entry = {
    id: 'fx-console-entry-' + (fxConsoleRegistry.length + 1),
    title: '热键设置',
    aliases: '快捷键 局内热键 全局热键 键盘',
    tab: 'system',
    tabLabel: '系统',
    group: 'startup',
    groupLabel: '启动与退出',
    history: false,
    element: hotkey
  };
  hotkey.setAttribute('data-fx-console-entry', entry.id);
  hotkey.setAttribute('data-fx-console-history', 'off');
  fxConsoleRegistry.push(entry);
}

function initFxConsoleSearchAndHistory() {
  var panel = document.getElementById('fx-panel');
  var search = document.getElementById('fx-console-search');
  if (!panel || !search || panel._fxConsoleSearchHistoryBound) return;
  panel._fxConsoleSearchHistoryBound = true;
  fxConsoleRegisterHotkeySearchEntry();
  search.addEventListener('input', function () { renderFxConsoleSearchResults(search.value); });
  search.addEventListener('focus', function () { if (search.value) renderFxConsoleSearchResults(search.value); });
  search.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      search.value = '';
      renderFxConsoleSearchResults('');
      search.blur();
    } else if (e.key === 'Enter') {
      var first = document.querySelector('#fx-console-search-results .fx-console-search-result');
      if (first) { e.preventDefault(); first.click(); }
    }
  });
  var undo = document.getElementById('fx-console-undo');
  if (undo) undo.addEventListener('click', undoFxConsoleHistory);
  var historyBtn = document.getElementById('fx-console-history-toggle');
  var historyPop = document.getElementById('fx-console-history');
  if (historyBtn && historyPop) historyBtn.addEventListener('click', function () {
    var open = historyPop.hidden;
    closeFxConsolePopovers();
    historyPop.hidden = !open;
    historyBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  panel.addEventListener('pointerdown', function (e) {
    if (e.target && e.target.matches && e.target.matches('input[type="range"],input[type="color"]')) fxConsoleBeginRangeTxn(e.target);
  }, true);
  panel.addEventListener('focusin', function (e) {
    if (e.target && e.target.matches && e.target.matches('input[type="range"],input[type="color"]')) fxConsoleBeginRangeTxn(e.target);
  }, true);
  panel.addEventListener('keydown', function (e) {
    if (e.target && e.target.matches && e.target.matches('input[type="range"]')) fxConsoleBeginRangeTxn(e.target);
  }, true);
  panel.addEventListener('change', function (e) {
    if (!e.target || !e.target.matches || !e.target.matches('input[type="range"],input[type="color"]')) return;
    queueMicrotask(function () { fxConsoleCommitRangeTxn(e.target); });
  }, true);
  panel.addEventListener('focusout', function (e) {
    if (!fxConsoleHistoryTxn || fxConsoleHistoryTxn.control !== e.target) return;
    queueMicrotask(function () { fxConsoleCommitRangeTxn(e.target); });
  }, true);
  panel.addEventListener('click', function (e) {
    if (fxConsoleHistoryApplying) return;
    var entry = fxConsoleEntryForElement(e.target);
    if (!fxConsoleClickIsReversible(e.target, entry)) return;
    var before = captureFxConsoleState();
    var label = fxConsoleHistoryControlLabel(entry, e.target);
    var key = entry.id + ':' + label;
    // The console listens in capture phase, while many controls still use
    // inline/bubble click handlers. Defer to the next task so the target
    // handler has committed its value before the "after" snapshot is read.
    setTimeout(function () {
      pushFxConsoleHistory(label, key, before, captureFxConsoleState(), false);
    }, 0);
  }, true);
  document.addEventListener('pointerdown', function (e) {
    if (!e.target || !e.target.closest || !e.target.closest('#color-lab-pop')) return;
    if (!fxConsoleHistoryTxn && typeof colorLabState !== 'undefined' && colorLabState && colorLabState.picker) fxConsoleBeginRangeTxn(colorLabState.picker);
  }, true);
  document.addEventListener('pointerup', function (e) {
    if (!fxConsoleHistoryTxn) return;
    if (e.target && e.target.closest && e.target.closest('#color-lab-pop button')) return;
    var colorTxn = fxConsoleHistoryTxn.control.matches('input[type="color"]');
    if (colorTxn && (!e.target || !e.target.closest || !e.target.closest('#color-lab-pop'))) return;
    queueMicrotask(function () { fxConsoleCommitRangeTxn(colorTxn ? e.target : null); });
  }, true);
  document.addEventListener('pointercancel', function () {
    if (fxConsoleHistoryTxn) queueMicrotask(function () { fxConsoleCommitRangeTxn(null); });
  }, true);
  document.addEventListener('click', function (e) {
    if (!fxConsoleHistoryTxn || !e.target || !e.target.closest || !e.target.closest('#color-lab-pop')) return;
    queueMicrotask(function () { fxConsoleCommitRangeTxn(e.target); });
  }, true);
  document.addEventListener('change', function (e) {
    if (!fxConsoleHistoryTxn || !e.target || !e.target.closest || !e.target.closest('#color-lab-pop')) return;
    queueMicrotask(function () { fxConsoleCommitRangeTxn(e.target); });
  }, true);
  document.addEventListener('pointerdown', function (e) {
    if (!e.target || !e.target.closest || e.target.closest('#fx-console-toolbar,#color-lab-pop')) return;
    closeFxConsolePopovers();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var results = document.getElementById('fx-console-search-results');
    var history = document.getElementById('fx-console-history');
    if ((!results || results.hidden) && (!history || history.hidden)) return;
    closeFxConsolePopovers();
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.fx-console-popover')) search.focus();
  }, true);
  window.addEventListener('blur', function () {
    if (fxConsoleHistoryTxn) fxConsoleCommitRangeTxn(null);
  });
  renderFxConsoleHistory();
}

window.undoFxConsoleHistory = undoFxConsoleHistory;
window.rollbackFxConsoleHistoryTo = rollbackFxConsoleHistoryTo;
