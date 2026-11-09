function markAppPerf(name) {
  try {
    var value = performance.now();
    appPerfMarks.push({ name: name, value: Math.round(value) });
    if (performance && performance.mark) performance.mark('mineradio:' + name);
    if (appPerfMarks.length <= 16) console.debug('[MineradioPerf]', name, Math.round(value) + 'ms');
  } catch (e) { }
}
markAppPerf('script-start');
function installStartupLongTaskObserver() {
  try {
    if (!('PerformanceObserver' in window)) return;
    var observer = new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (entry) {
        if (entry.startTime > 15000) return;
        console.debug('[MineradioPerf] longtask', Math.round(entry.startTime) + 'ms', Math.round(entry.duration) + 'ms');
      });
    });
    observer.observe({ entryTypes: ['longtask'] });
    setTimeout(function () { try { observer.disconnect(); } catch (e) { } }, 16000);
  } catch (e) { }
}
installStartupLongTaskObserver();
var queueViewTab = readPlaylistPanelTabPreference(), playMode = 'loop', miniQueueOpen = false;
var miniQueueRenderSeq = 0, queueRenderSeq = 0, playlistRenderSeq = 0;
var queuePanelDirty = false;
var PLAYLIST_LAZY_BATCH_SIZE = 48;
var QUEUE_PANEL_BATCH_SIZE = PLAYLIST_LAZY_BATCH_SIZE;
var QUEUE_VIRTUAL_ROW_STEP = 62;
var QUEUE_VIRTUAL_OVERSCAN = 8;
var queuePanelRenderLimit = QUEUE_PANEL_BATCH_SIZE;
var queuePanelRenderKey = '';
var queuePanelVirtualState = { start: -1, end: -1, miniStart: -1, miniEnd: -1, raf: 0 };
var miniQueueLazyBound = false;
var PLAYLIST_PANEL_BATCH_SIZE = PLAYLIST_LAZY_BATCH_SIZE;
var PLAYLIST_CATALOG_FIRST_PAGE_SIZE = PLAYLIST_LAZY_BATCH_SIZE;
var PLAYLIST_CATALOG_BACKGROUND_PAGE_SIZE = 200;
var PLAYLIST_CARD_VIRTUAL_OVERSCAN_PX = 760;
var playlistPanelRenderLimit = PLAYLIST_PANEL_BATCH_SIZE;
var playlistPanelLazyBound = false;
var PLAYLIST_DETAIL_INITIAL_RENDER = PLAYLIST_LAZY_BATCH_SIZE;
var PLAYLIST_DETAIL_BATCH_SIZE = PLAYLIST_LAZY_BATCH_SIZE;
var PLAYLIST_DETAIL_ROW_STEP = 56;
var PLAYLIST_DETAIL_VIRTUAL_OVERSCAN = 7;
var PLAYLIST_DETAIL_OUTER_CHROME_HEIGHT = 142;
var PLAYLIST_DETAIL_OUTER_FOOTER_HEIGHT = 44;
var PLAYLIST_QUEUE_INITIAL_BATCH_SIZE = 96;
var PLAYLIST_QUEUE_BACKGROUND_BATCH_SIZE = 160;
var PLAYLIST_QUEUE_PLAYBACK_AHEAD_THRESHOLD = 96;
var playlistCatalogSyncState = { token: 0, loading: false, timer: 0, providers: {}, error: '' };
var playlistCatalogRevision = 0;
var smoothWheelScrollBound = false;
var coverProcessToken = 0, aiDepthPipeline = null, aiDepthReady = false, aiDepthBusy = false, aiDepthFailUntil = 0;
var coverDepthCache = Object.create(null), coverDepthCacheKeys = [];
var aiDepthLastRunAt = 0, aiDepthMinGapMs = 18000;
var updatePreviewState = {
  visible: false,
  open: false,
  status: 'idle',
  progress: 0,
  currentVersion: '2.2.0',
  version: '2.2.0',
  configured: false,
  preview: false,
  updateAvailable: false,
  releaseUrl: '',
  externalUrl: '',
  downloadPageUrl: '',
  downloadPages: [],
  selectedDownloadPageIndex: 0,
  errorReason: '',
  message: '',
  hero: '当前版本已是最新。',
  notes: [
    '请以本次发布公告中的最新网盘链接为准',
    '改善音乐接口、歌单加载和连续播放体验'
  ]
};
