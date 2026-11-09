'use strict';

// ============================================================
//  Global State
// ============================================================
var audio = null, audioCtx = null, source = null, audioSourceMedia = null, analyser = null, beatAnalyser = null, gainNode = null, analysisSinkNode = null, audioReady = false;
var uiSfxCtx = null, lastShelfSelectSfxAt = 0;
var FFT_SIZE = 2048;
var frequencyData = new Uint8Array(FFT_SIZE / 2);
var timeDomainData = new Uint8Array(FFT_SIZE);
var BEAT_FFT_SIZE = 2048;
var beatFrequencyData = new Uint8Array(BEAT_FFT_SIZE / 2);
var beatTimeDomainData = new Uint8Array(BEAT_FFT_SIZE);
var bass = 0, mid = 0, treble = 0, audioEnergy = 0, beatPulse = 0, prevEnergy = 0;
var lyricSunEnergy = 0, lyricSunTarget = 0, lyricSunHold = 0, lyricSunAvg = 0, lyricSunPeak = 0.55;
var smoothBass = 0, smoothMid = 0, smoothTreb = 0, smoothEnergy = 0;
var bassPeak = 0.12, midPeak = 0.10, treblePeak = 0.08, energyPeak = 0.10;
var beatOnsetFlag = false;        // beat 上升沿瞬时标志,每帧消费一次
var lastStrongDrop = 0;           // 用于 burst 预设的强 drop 时刻

var lyricsLines = [], lyricsTranslationLines = [], lyricsVisible = false, lyricsHasNativeKaraoke = false, lyricsTimingSource = 'none', lyricsTranslationSource = 'none';
var playlist = [], playQueue = [], currentIdx = -1, playing = false, playToggleBusy = false;
var searchMode = 'song', podcastResults = [], podcastPrograms = [], podcastCurrentRadio = null;
var loginStatus = { loggedIn: false, vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, vipLabel: '无VIP' };
var qqLoginStatus = { provider: 'qq', loggedIn: false, preview: false, nickname: 'QQ 音乐', userId: '', avatar: '', vipType: 0, vipLevel: 'none', isVip: false, isSvip: false };
var kugouLoginStatus = { provider: 'kugou', loggedIn: false, preview: false, nickname: '酷狗音乐', userId: '', avatar: '', vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, playbackKeyReady: false };
var qishuiLoginStatus = { provider: 'qishui', loggedIn: false, configured: false, preview: false, nickname: '汽水音乐', userId: '', avatar: '', vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, playbackKeyReady: false, playbackMode: 'recommend-match' };
var qqLoginAutoRefreshTimer = null;
var qqLoginStatusLastForcedAt = 0;
var kugouLoginAutoRefreshTimer = null;
var qishuiLoginAutoRefreshTimer = null;
var spotifyLoginStatus = { provider: 'spotify', loggedIn: false, configured: false, oauthConfigured: false, oauthMissing: [], preview: false, nickname: 'Spotify', userId: '', avatar: '', product: '', vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, playbackKeyReady: false, playbackMode: 'recommend-match' };
var spotifyLoginAutoRefreshTimer = null;
var qqLoginWasLoggedIn = false;
var kugouLoginWasLoggedIn = false;
var qishuiLoginWasLoggedIn = false;
var spotifyLoginWasLoggedIn = false;
var loginProvider = 'netease';
var activeAccountProvider = 'netease';
var dualAccountMode = false;
var qqCookieBusy = false;
var kugouCookieBusy = false;
var qishuiTokenBusy = false;
var qishuiOAuthBusy = false;
var spotifyConfigBusy = false;
var spotifyOAuthBusy = false;
var neteaseWebLoginBusy = false;
var qqWebLoginBusy = false;
var kugouWebLoginBusy = false;
var neteaseManualCookieOpen = false;
var qqManualCookieOpen = false;
var kugouManualCookieOpen = false;
var qishuiManualCookieOpen = false;
var loginStatusChecked = false, loginStatusCheckFailed = false;
var qrPollTimer = null, qrKey = null;
var qishuiQrPollBusy = false, qishuiQrPollGeneration = 0;
var volumeTween = null, trackSwitchToken = 0;
var audioFadeTimer = null, audioElementFadeFrame = 0, audioFadeSerial = 0;
var playbackResumeRecovery = { serial: 0, pending: false, lastAttemptAt: 0, lastReason: '', pausedAt: 0, pausedSongKey: '', pausedSrc: '', pausedPosition: 0, timerIds: [] };
var albumGaplessState = { enabled: false, defaultEnabled: true, albumKey: '', disabledAlbumKey: '', context: null, preload: null, serial: 0, monitorTimer: 0, handoff: false };
var PLAYBACK_RESUME_STALL_DELAYS = [1600, 3600];
var PLAYBACK_RESUME_LONG_PAUSE_MS = 8 * 60 * 1000;
var PLAYBACK_RESUME_LONG_PAUSE_PROVIDER_MS = { qishui: 3 * 60 * 1000, qq: 8 * 60 * 1000, kugou: 8 * 60 * 1000, netease: 12 * 60 * 1000 };
var AUDIO_FADE_STORE_KEY = 'mineradio-audio-fade-v1';
var AUDIO_FADE_MIN_MS = 0;
var AUDIO_FADE_MAX_MS = 3000;
var audioFadePreference = readAudioFadePreference();
var AUDIO_FADE_IN_MS = audioFadePreference.fadeInMs;
var AUDIO_FADE_OUT_MS = audioFadePreference.fadeOutMs;
var AUDIO_SILENCE_GAIN = 0.0001;
var audioFadeEnvelope = 1;
var userPlaylists = [], builtInPlaylists = [], neteasePlaylists = [], qqPlaylists = [], kugouPlaylists = [], qishuiPlaylists = [], spotifyPlaylists = [], myPodcastCollections = [], myPodcastItems = {}, playlistCoverCache = {};
var builtInPlaylistLoadPromise = null;
var queueHydrationState = {
  token: 0,
  active: false,
  loading: false,
  provider: '',
  playlistId: '',
  sourceId: '',
  title: '',
  total: 0,
  nextOffset: 0,
  hasMore: false,
  loaded: 0,
  error: '',
  promise: null,
  timer: 0,
  queueRef: null,
  warmPagesRemaining: 0,
  pausedForBuffer: false
};
var CUSTOM_COVER_STORE_KEY = 'mineradio-custom-covers';
var CUSTOM_LYRIC_STORE_KEY = 'mineradio-custom-lyrics-v1';
var CUSTOM_LYRIC_PREF_STORE_KEY = 'mineradio-custom-lyric-prefs-v1';
var CUSTOM_LYRIC_FONT_STORE_KEY = 'mineradio-custom-lyric-fonts-v1';
var CUSTOM_LYRIC_FONT_MAX_COUNT = 6;
var CUSTOM_LYRIC_FONT_MAX_BYTES = 3.6 * 1024 * 1024;
var LYRIC_LAYOUT_STORE_KEY = 'mineradio-lyric-layout-v1';
var CURRENT_FX_AUTOSAVE_STORE_KEY = 'mineradio-current-fx-autosave-v1';
var CURRENT_FX_AUTOSAVE_SCHEMA = 'current-fx-autosave-v2';
var VISUAL_PRESET_SCHEMA = 'skull-preset-v2';
var MAX_VISUAL_PRESET_INDEX = 12;
var SONIC_PRESET_INDEX = 7;
var SONIC_WORKSHOP_PRESET_INDEX = 8;
var PLAYBACK_QUALITY_STORE_KEY = 'mineradio-playback-quality-v1';
var AUDIO_OUTPUT_DEVICE_STORE_KEY = 'mineradio-audio-output-device-v1';
var AUDIO_OUTPUT_MIRROR_STORE_KEY = 'mineradio-audio-output-mirror-v1';
var AUDIO_INPUT_BRIDGE_STORE_KEY = 'mineradio-audio-input-bridge-v1';
var PROVIDER_VIP_AUDIT_STORE_KEY = 'mineradio-provider-vip-audit-v1';
var QQ_PLAYBACK_VIP_EVIDENCE_STORE_KEY = 'mineradio-qq-playback-vip-evidence-v1';
var LOGIN_COOKIE_EXPORT_STORE_KEY = 'mineradio-login-cookie-export-v1';
var PLAYBACK_QUALITY_DEFAULTS = { netease: 'hires', qq: 'lossless', kugou: 'lossless', qishui: 'standard', spotify: 'standard' };
var PLAYBACK_QUALITY_OPTIONS = {
  netease: [
    { key: 'jymaster', title: '超清母带', sub: 'SVIP / 最高规格', svip: true },
    { key: 'hires', title: '高清臻音', sub: '默认 / 细节优先' },
    { key: 'lossless', title: '无损 SQ', sub: 'FLAC 优先' },
    { key: 'exhigh', title: '极高 HQ', sub: '320kbps' },
    { key: 'standard', title: '标准', sub: '128kbps' }
  ],
  qq: [
    { key: 'hires', title: 'Hi-Res FLAC', sub: 'QQ 高解析 / 优先尝试' },
    { key: 'lossless', title: '无损 FLAC', sub: 'QQ SQ / 稳定优先' },
    { key: 'exhigh', title: '320k MP3', sub: 'QQ 高品质' },
    { key: 'standard', title: '128k MP3', sub: '兼容优先' }
  ],
  kugou: [
    { key: 'hires', title: 'Hi-Res / 臻品', sub: '酷狗高解析 / 优先尝试' },
    { key: 'lossless', title: '无损 FLAC', sub: '酷狗 SQ / 稳定优先' },
    { key: 'exhigh', title: '320k MP3', sub: '酷狗高品质' },
    { key: 'standard', title: '128k MP3', sub: '兼容优先' }
  ],
  qishui: [
    { key: 'standard', title: '汽水匹配源', sub: 'QS 推荐 / 播放自动换源' }
  ],
  spotify: [
    { key: 'standard', title: 'Spotify 匹配源', sub: 'SP 搜索 / 播放自动换源' }
  ]
};
var UPLOAD_TIP_STORE_KEY = 'mineradio-upload-tip-seen';
var DIY_MODE_STORE_KEY = 'mineradio-diy-player-mode-v1';
var PLAYLIST_PANEL_PIN_STORE_KEY = 'mineradio-playlist-panel-pinned-v1';
var PLAYLIST_PANEL_TAB_STORE_KEY = 'mineradio-playlist-panel-tab-v1';
var USER_CAPSULE_AUTO_HIDE_STORE_KEY = 'mineradio-user-capsule-auto-hide-v1';
var FX_FAB_AUTO_HIDE_STORE_KEY = 'mineradio-fx-fab-auto-hide-v1';
var CONTROLS_AUTO_HIDE_STORE_KEY = 'mineradio-controls-auto-hide-v1';
var FREE_CAMERA_STORE_KEY = 'mineradio-free-camera-v1';
var HOTKEY_SETTINGS_STORE_KEY = 'mineradio-hotkey-settings-v1';
var VISUAL_GUIDE_SEEN_STORE_KEY = 'mineradio-visual-guide-seen-v2';
var CLOSE_BEHAVIOR_STORE_KEY = 'mineradio-close-behavior-v1';
var LAST_PLAYBACK_STORE_KEY = 'mineradio-last-playback-v1';
var STARTUP_AUTOPLAY_STORE_KEY = 'mineradio-startup-autoplay-v1';
var STARTUP_FAST_SKIP_STORE_KEY = 'mineradio-startup-fast-skip-v1';
var STARTUP_RESUME_MODE_STORE_KEY = 'mineradio-startup-resume-mode-v1';
var LOCAL_BEATMAP_STORE_KEY = 'mineradio-local-beatmaps-v1';
var LOCAL_BEAT_PREF_STORE_KEY = 'mineradio-local-beatmap-prefs-v1';
var LOCAL_BEAT_COMBOS = ['', 'downbeat', 'push', 'drop', 'rebound', 'accent'];
var HOTKEY_ACTIONS = [
  { key: 'togglePlay', label: '播放 / 暂停', category: '播放', local: 'Space', global: 'Ctrl+Alt+Space' },
  { key: 'prevTrack', label: '上一首', category: '播放', local: 'ArrowLeft', global: 'Ctrl+Alt+ArrowLeft' },
  { key: 'nextTrack', label: '下一首', category: '播放', local: 'ArrowRight', global: 'Ctrl+Alt+ArrowRight' },
  { key: 'volumeUp', label: '音量增加', category: '音量', local: 'ArrowUp', global: 'Ctrl+Alt+ArrowUp' },
  { key: 'volumeDown', label: '音量降低', category: '音量', local: 'ArrowDown', global: 'Ctrl+Alt+ArrowDown' },
  { key: 'toggleFullscreen', label: '全屏', category: '窗口', local: 'KeyF', global: 'Ctrl+Alt+KeyF' },
  { key: 'toggleDesktopInteraction', label: '切换完整桌面模式', category: '窗口', local: '', global: 'Ctrl+Shift+KeyM' },
  { key: 'toggleDesktopLyrics', label: '桌面歌词', category: '歌词', local: 'Alt+KeyL', global: 'Ctrl+Alt+KeyL' }
];
var hotkeyCaptureState = null;
var hotkeyGlobalStatus = {};
var diyPlayerMode = readDiyModePreference();
var customCoverMap = readCustomCoverMap();
var customLyricMap = readCustomLyricMap();
var customLyricPrefs = readCustomLyricPrefs();
var customLyricFonts = readCustomLyricFonts();
registerSavedCustomLyricFonts();
var localBeatMapCache = readLocalBeatMapCache();
var localBeatMapPrefs = readLocalBeatPrefs();
var playbackQualityPrefs = readPlaybackQualityPreference();
var playbackQuality = getProviderPlaybackQuality('netease');
var audioOutputDeviceId = readAudioOutputDevicePreference();
var audioOutputDevices = [];
var audioInputDevices = [];
var audioOutputMirrorDeviceIds = readAudioOutputMirrorPreference();
var audioInputBridgeState = readAudioInputBridgePreference();
var audioOutputMirrorElements = {};
var audioOutputMirrorRuntime = {};
var audioOutputMirrorSyncTimer = 0;
var playbackQualityRuntimeCaps = {};
var coverCropState = null, coverCropBound = false;
var currentLocalSong = null;
var persistentLocalLibraryTracks = [];
var lyricSourceMode = 'original';
var originalLyricsState = { lines: [], hasNativeKaraoke: false, timingSource: 'none', translationLines: [], translationSource: 'none' };
var localBeatAnalysis = { song: null, audioUrl: '', mode: 'mr', active: false, token: 0 };
var likedSongMap = {}, likeBusyMap = {}, likeStatusToken = 0;
var collectTargetSong = null, collectBusy = false;
var uploadTipTimer = null, uploadTipAttempts = 0;
var visualGuideActive = false, visualGuideStep = 0, visualGuideResizeBound = false;
var visualGuideState = { bottomWasVisible: false, searchWasPeek: false, manual: false };
var emptyHomeActive = false;
var homeForcedOpen = false;
var homeSuppressed = false;
var homeDiscoverState = { loading: false, loaded: false, loggedIn: false, mode: 'starter', songs: [], playlists: [], podcasts: [], error: '', updatedAt: 0 };
var homeDiscoverToken = 0;
var homeVisualPresetActive = false;
var homeVisualPrevPreset = 0;
var HOME_LISTEN_STATS_KEY = 'mineradio-listen-stats-v1';
var activeRadioContext = null;
var listenStatsState = loadListenStatsState();
var listenSession = null;
var appPerfMarks = [];
