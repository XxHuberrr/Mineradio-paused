const { app, BrowserWindow, ipcMain, shell, screen, session, globalShortcut, dialog, Tray, Menu, protocol, desktopCapturer, powerMonitor } = require('electron');
const net = require('net');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const systemMemory = require('./system-memory');
const {
  WallpaperEngineLibrary,
  registerWallpaperEngineScheme,
} = require('./wallpaper-engine-library');
const {
  LocalMusicLibrary,
  registerLocalMusicScheme,
} = require('./local-music-library');
const { BuiltInPlaylistLibrary } = require('./built-in-playlist-library');
const { WallpaperEngineRuntime } = require('./wallpaper-engine-runtime');
const { FullDesktopModeRuntime } = require('./full-desktop-mode-runtime');
const {
  LoginEasterEggGate,
  LOGIN_EASTER_EGG_GATE_VERSION,
  LOGIN_EASTER_EGG_STATE_FILE,
} = require('./login-easter-egg-gate');
const { extractKugouAuth } = require('../kugou-api');
const { qishuiCookieHasLogin } = require('../qishui-api');
const { clearSpotifyToken } = require('../spotify-api');

registerWallpaperEngineScheme(protocol);
registerLocalMusicScheme(protocol);

let mainWindow = null;
let localServer = null;
let mainServerPort = 0;
let desktopLyricsWindow = null;
let desktopLyricsState = {};
let desktopLyricsUserBounds = null;
let desktopLyricsProgrammaticMove = false;
let desktopLyricsPointerCapture = false;
let desktopLyricsMouseIgnored = null;
let desktopLyricsMousePoller = null;
let desktopLyricsMousePollerBuffer = '';
let desktopLyricsHotBounds = null;
let desktopLyricsLastMiddleAt = 0;
let htmlFullscreenActive = false;
let windowFullscreenActive = false;
let windowFullscreenDisplayId = null;
let mainWindowStateTimer = null;
let appMemoryTrimTimer = null;
let appMemoryTrimInFlight = false;
let lastAppMemoryTrimAt = 0;
let lastAppMemoryTrimReason = '';
let memoryAutoTimer = null;
let memoryAutoState = {
  appTrimEnabled: true,
  backgroundTrimEnabled: true,
  enabled: false,
  mask: systemMemory.MEMORY_MASK_DEFAULT,
  intervalMin: 30,
  thresholdPercent: 78,
  autoElevate: false,
  lastRunAt: 0,
  lastReason: '',
  lastResult: null,
  lastError: '',
};
let closeBehavior = 'exit';
let appQuitting = false;
let appQuitCleanupPromise = null;
let appQuitCleanupComplete = false;
let mainWindowCloseFlushArmed = false;
let tray = null;
let startupCompleted = false;
let startupErrorReported = false;
let localServerStartPromise = null;
let mainWindowCreatePromise = null;
let mainWindowRendererRecoveryPromise = null;
let mainWindowRendererRecoveryAttempts = [];
let mainWindowVisibilityTimer = null;
let mainWindowFullscreenVisibilityTimer = null;
let mainWindowMinimizeRecoveryTimer = null;
let startupState = { pid: process.pid, startedAt: Date.now(), phase: 'module-loaded', events: [] };
const registeredGlobalHotkeys = new Map();
let fullDesktopEscapeRegistered = false;
let fullDesktopEscapeExitPending = false;
let fullDesktopEscapeSuspendedBinding = null;
let fullDesktopEnableOperation = 0;
let fullDesktopEnablePending = false;

const WINDOWED_ASPECT = 16 / 9;
const WINDOWED_SCALE = 3 / 4;
const WINDOWED_MARGIN = 32;
const MIN_WINDOWED_WIDTH = 960;
const MIN_WINDOWED_HEIGHT = 540;
const APP_PACKAGE_INFO = (() => {
  try {
    return require('../package.json');
  } catch (_) {
    return {};
  }
})();
const APP_METADATA = APP_PACKAGE_INFO.mineradio || {};
const APP_NAME = process.env.MINERADIO_RUNTIME_NAME || APP_METADATA.runtimeName || APP_PACKAGE_INFO.productName || 'Mineradio';
const APP_USER_MODEL_ID = process.env.MINERADIO_APP_USER_MODEL_ID || APP_METADATA.appUserModelId || (APP_PACKAGE_INFO.build && APP_PACKAGE_INFO.build.appId) || 'com.mineradio.desktop';
const APP_ICON_ICO = path.join(__dirname, '..', 'build', 'icon.ico');
const CURRENT_FX_AUTOSAVE_FILE = 'current-fx-autosave.json';
const CURRENT_FX_AUTOSAVE_MAX_BYTES = 12 * 1024 * 1024;
const STARTUP_ERROR_LOG_FILE = 'startup-error.log';
const STARTUP_STATE_FILE = 'startup-state.json';
const STARTUP_SERVER_TIMEOUT_MS = 10000;
const STARTUP_HTTP_TIMEOUT_MS = 8000;
const STARTUP_NAVIGATION_TIMEOUT_MS = 15000;
const STARTUP_SHOW_WATCHDOG_MS = 3500;
const RENDERER_RECOVERY_WINDOW_MS = 2 * 60 * 1000;
const RENDERER_RECOVERY_MAX_ATTEMPTS = 3;
const MAIN_WINDOW_VISIBILITY_CHECK_MS = 5000;
const MAIN_WINDOW_HIDE_RECOVERY_DELAY_MS = 900;
const MAIN_WINDOW_MINIMIZE_RECOVERY_DELAY_MS = 1200;
const MAIN_WINDOW_MINIMIZE_INTENT_TTL_MS = 3000;
const FULLSCREEN_VISIBILITY_CHECK_MS = 5000;
const WINDOWS_WM_SYSCOMMAND = 0x0112;
const WINDOWS_SC_MINIMIZE = 0xF020;
const CACHE_SETTINGS_FILE = 'cache-settings.json';
const LYRIC_CACHE_VERSION = 1;
const LYRIC_CACHE_MAX_BYTES = 96 * 1024 * 1024;
const LYRIC_CACHE_ENTRY_MAX_BYTES = 1024 * 1024;
const NETEASE_LOGIN_PARTITION = 'persist:mineradio-netease-login';
const NETEASE_LOGIN_URL = 'https://music.163.com/#/login';
const QQ_LOGIN_PARTITION = 'persist:mineradio-qqmusic-login';
const QQ_LOGIN_URL = 'https://y.qq.com/n/ryqq/profile';
const QQ_LOGIN_FALLBACK_URL = 'https://y.qq.com/';
const KUGOU_LOGIN_PARTITION = 'persist:mineradio-kugou-login';
const KUGOU_LOGIN_URL = 'https://www.kugou.com/';
const KUGOU_LOGIN_WARMUP_URL = 'https://www.kugou.com/newuc/user/uc/type=edit';
const SPOTIFY_LOGIN_PARTITION = 'persist:mineradio-spotify-login';
const SPOTIFY_OAUTH_TIMEOUT_MS = 3 * 60 * 1000;

// Keep app-owned settings and provider credentials independent from the
// user-selectable Chromium cache. app.setName() must run before the first
// derived path lookup or Electron can recompute userData below the cache root.
app.setName(APP_NAME);
const STARTUP_QA_USER_DATA_PATH = (() => {
  const value = String(process.env.MINERADIO_STARTUP_QA_USER_DATA || '').trim();
  if (process.env.MINERADIO_STARTUP_QA_HIDDEN !== '1' || !value || !path.isAbsolute(value)) return '';
  return path.resolve(value);
})();
const STABLE_USER_DATA_PATH = STARTUP_QA_USER_DATA_PATH || path.join(app.getPath('appData'), APP_NAME);
fs.mkdirSync(STABLE_USER_DATA_PATH, { recursive: true });
app.setPath('userData', STABLE_USER_DATA_PATH);
const INITIAL_CACHE_SETTINGS = ensureCacheDirectories(readCacheSettings());
const loginEasterEggGate = new LoginEasterEggGate({
  userDataPath: STABLE_USER_DATA_PATH,
  credentialRoots: () => [
    chromiumSessionDataPath(cacheSettings || INITIAL_CACHE_SETTINGS),
    (() => { try { return app.getPath('sessionData'); } catch (_) { return ''; } })(),
    path.join(__dirname, '..'),
  ],
});
const NATIVE_HELPER_TEMP_PATH = INITIAL_CACHE_SETTINGS.nativePath;
fs.mkdirSync(NATIVE_HELPER_TEMP_PATH, { recursive: true });
process.env.MINERADIO_NATIVE_TEMP_DIR = NATIVE_HELPER_TEMP_PATH;
systemMemory.setNativeTempPath(NATIVE_HELPER_TEMP_PATH);
const localMusicLibrary = new LocalMusicLibrary({ userDataPath: STABLE_USER_DATA_PATH });
const builtInPlaylistLibrary = new BuiltInPlaylistLibrary({ userDataPath: STABLE_USER_DATA_PATH });
const localMusicImportCapabilities = new Map();
const wallpaperEngineLibrary = new WallpaperEngineLibrary({ userDataPath: STABLE_USER_DATA_PATH });
const wallpaperEngineRuntime = new WallpaperEngineRuntime({
  library: wallpaperEngineLibrary,
  desktopCapturer,
  hostElevationProbe: systemMemory.probeProcessElevation,
  nativeTempPath: NATIVE_HELPER_TEMP_PATH,
});
const fullDesktopModeRuntime = new FullDesktopModeRuntime({
  screen,
  platform: process.platform,
  execFileImpl: execFile,
  nativeTempPath: NATIVE_HELPER_TEMP_PATH,
  beforePassive: ({ win, reason }) => prepareWallpaperEngineProjectPreviewBeforeDesktopEmbedding(win, reason),
  requestReconcile: (reason) => reconcileFullDesktopMode(reason),
  onStatus: (status) => broadcastDesktopWallpaperStatus(status),
});
let wallpaperEngineCaptureSourceId = '';
let wallpaperEngineCaptureGrant = null;
let gestureCameraPermissionGrant = null;
let wallpaperEngineCaptureOperation = 0;
let wallpaperEngineCapturePreparationOperation = 0;
let wallpaperEngineGlassCaptureOperation = 0;
let wallpaperEngineHostBoundsRestartTimer = null;
let wallpaperEngineHostBoundsRestartPending = false;
let wallpaperEngineHostBoundsStopPromise = null;
let wallpaperEngineHostBoundsOperation = 0;
let wallpaperEngineHostBoundsFollowupReason = '';
let wallpaperEngineHostVisibilitySuspended = false;
let wallpaperEngineHostVisibilityResumePending = false;
let wallpaperEngineHostVisibilityResumeTimer = null;
let wallpaperEngineHostVisibilityOperation = 0;
let wallpaperEngineHostVisibilityStopPromise = null;
let wallpaperEngineHostVisibilityResidentMinimized = false;
let fullDesktopModeHostVisibilityTransitionDepth = 0;
let wallpaperEngineDesktopIconLayeringQueue = Promise.resolve(true);
const WALLPAPER_ENGINE_CAPTURE_GRANT_MS = 12000;
const WALLPAPER_ENGINE_CAPTURE_PREPARE_TIMEOUT_MS = 9000;
// Windows Graphics Capture may still be releasing the previous exact HWND for
// a few hundred milliseconds after its MediaStreamTrack stops. A short bounded
// cooldown avoids turning that normal teardown window into NotReadableError.
const WALLPAPER_ENGINE_CAPTURE_RETRY_DELAY_MS = 720;
const WALLPAPER_ENGINE_MAX_CAPTURE_FPS = 240;
const WALLPAPER_ENGINE_HOST_RESUME_TIMEOUT_MS = 30000;
const GESTURE_CAMERA_PERMISSION_GRANT_MS = 45000;
const MAIN_WINDOW_BACKGROUND_THROTTLING = process.env.MINERADIO_KEEP_BACKGROUND_RENDERING === '1' ? false : true;

function wallpaperEngineTargetFps(display, requestedFps) {
  const displayFrequency = Math.max(24, Math.min(
    WALLPAPER_ENGINE_MAX_CAPTURE_FPS,
    Math.round(Number(display && display.displayFrequency) || 60)
  ));
  const requested = Number(requestedFps);
  if (!Number.isFinite(requested) || requested <= 0) return displayFrequency;
  return Math.max(24, Math.min(displayFrequency, WALLPAPER_ENGINE_MAX_CAPTURE_FPS, Math.round(requested)));
}

function wallpaperEngineHostCornerRadius(win) {
  if (!win || win.isDestroyed() || win.isMaximized() || win.isFullScreen()
    || windowFullscreenActive || htmlFullscreenActive) return 0;
  const bounds = win.getContentBounds();
  const display = screen.getDisplayMatching(bounds);
  const scaleFactor = Math.max(1, Number(display && display.scaleFactor) || 1);
  return Math.max(0, Math.round(34 * scaleFactor));
}

function wallpaperEnginePhysicalContentBounds(win, fallback = {}) {
  const bounds = win && !win.isDestroyed()
    ? win.getContentBounds()
    : {
      x: Number(fallback.x) || 0,
      y: Number(fallback.y) || 0,
      width: Number(fallback.width) || 1280,
      height: Number(fallback.height) || 720,
    };
  const display = screen.getDisplayMatching(bounds);
  const scaleFactor = Math.max(1, Number(display && display.scaleFactor) || 1);
  if (win && !win.isDestroyed() && typeof screen.dipToScreenRect === 'function') {
    try {
      const physicalRect = screen.dipToScreenRect(win, bounds);
      if (physicalRect && Number(physicalRect.width) > 0 && Number(physicalRect.height) > 0) {
        return {
          bounds,
          display,
          scaleFactor,
          x: Math.round(Number(physicalRect.x) || 0),
          y: Math.round(Number(physicalRect.y) || 0),
          width: Math.max(1, Math.round(Number(physicalRect.width) || 1)),
          height: Math.max(1, Math.round(Number(physicalRect.height) || 1)),
        };
      }
    } catch (_) { }
  }
  const dipOrigin = { x: Number(bounds.x) || 0, y: Number(bounds.y) || 0 };
  const dipEnd = {
    x: dipOrigin.x + Math.max(1, Number(bounds.width) || Number(fallback.width) || 1280),
    y: dipOrigin.y + Math.max(1, Number(bounds.height) || Number(fallback.height) || 720),
  };
  const physicalOrigin = typeof screen.dipToScreenPoint === 'function'
    ? screen.dipToScreenPoint(dipOrigin)
    : { x: Math.round(dipOrigin.x * scaleFactor), y: Math.round(dipOrigin.y * scaleFactor) };
  const physicalEnd = typeof screen.dipToScreenPoint === 'function'
    ? screen.dipToScreenPoint(dipEnd)
    : { x: Math.round(dipEnd.x * scaleFactor), y: Math.round(dipEnd.y * scaleFactor) };
  return {
    bounds,
    display,
    scaleFactor,
    x: Number.isFinite(Number(physicalOrigin.x)) ? Number(physicalOrigin.x) : 0,
    y: Number.isFinite(Number(physicalOrigin.y)) ? Number(physicalOrigin.y) : 0,
    width: Math.max(1, Math.abs(Math.round(Number(physicalEnd.x) - Number(physicalOrigin.x))) || Math.round((Number(bounds.width) || 1280) * scaleFactor)),
    height: Math.max(1, Math.abs(Math.round(Number(physicalEnd.y) - Number(physicalOrigin.y))) || Math.round((Number(bounds.height) || 720) * scaleFactor)),
  };
}

function cacheSettingsConfigPath() {
  return path.join(app.getPath('userData'), CACHE_SETTINGS_FILE);
}

function defaultCacheRootPath() {
  const dDrive = 'D:\\';
  return fs.existsSync(dDrive)
    ? path.join(dDrive, 'MineradioCache')
    : path.join(app.getPath('userData'), 'cache');
}

function normalizeCacheRootPath(value) {
  const fallback = defaultCacheRootPath();
  const candidate = String(value || '').trim();
  if (!candidate) return fallback;
  try {
    return path.resolve(candidate);
  } catch (_) {
    return fallback;
  }
}

function normalizeCacheSettings(value) {
  const rootPath = normalizeCacheRootPath(value && value.rootPath);
  return {
    version: 1,
    rootPath,
    lyricsPath: path.join(rootPath, 'lyrics'),
    chromiumPath: path.join(rootPath, 'chromium'),
    beatmapsPath: path.join(rootPath, 'beatmaps'),
    nativePath: path.join(rootPath, 'native-helper-temp'),
  };
}

function chromiumSessionDataPath(settings) {
  const chromiumRoot = settings && settings.chromiumPath
    ? settings.chromiumPath
    : normalizeCacheSettings(null).chromiumPath;
  return path.join(chromiumRoot, APP_NAME);
}

function readCacheSettings() {
  try {
    const file = cacheSettingsConfigPath();
    const parsed = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    return normalizeCacheSettings(parsed);
  } catch (error) {
    console.warn('[CacheSettings] read failed:', error.message);
    return normalizeCacheSettings(null);
  }
}

function writeCacheSettings(settings) {
  const normalized = normalizeCacheSettings(settings);
  const file = cacheSettingsConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tempFile = `${file}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(normalized, null, 2), 'utf8');
  fs.renameSync(tempFile, file);
  return normalized;
}

function ensureCacheDirectories(settings) {
  const normalized = normalizeCacheSettings(settings);
  try {
    fs.mkdirSync(normalized.lyricsPath, { recursive: true });
    fs.mkdirSync(normalized.chromiumPath, { recursive: true });
    fs.mkdirSync(chromiumSessionDataPath(normalized), { recursive: true });
    fs.mkdirSync(normalized.beatmapsPath, { recursive: true });
    fs.mkdirSync(normalized.nativePath, { recursive: true });
    return normalized;
  } catch (error) {
    // A removed, sleeping, or temporarily inaccessible custom drive must not
    // prevent Electron from reaching app.ready and showing a window. Keep the
    // saved preference intact and use a stable per-run fallback under userData.
    const fallback = normalizeCacheSettings({ rootPath: path.join(STABLE_USER_DATA_PATH, 'cache-fallback') });
    console.warn('[CacheSettings] cache root unavailable, using startup fallback:', error.message);
    fs.mkdirSync(fallback.lyricsPath, { recursive: true });
    fs.mkdirSync(fallback.chromiumPath, { recursive: true });
    fs.mkdirSync(chromiumSessionDataPath(fallback), { recursive: true });
    fs.mkdirSync(fallback.beatmapsPath, { recursive: true });
    fs.mkdirSync(fallback.nativePath, { recursive: true });
    return fallback;
  }
}

async function directoryUsageBytes(directory) {
  let total = 0;
  async function walk(current) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch (_) {
      return;
    }
    await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) return walk(entryPath);
        if (entry.isFile()) {
          const stat = await fs.promises.stat(entryPath);
          total += Math.max(0, Number(stat.size) || 0);
        }
      } catch (_) { }
    }));
  }
  await walk(directory);
  return total;
}

async function cacheSettingsSnapshot() {
  const settings = normalizeCacheSettings(cacheSettings);
  const currentChromiumPath = app.getPath('sessionData');
  const desiredChromiumPath = chromiumSessionDataPath(settings);
  const activeBeatmapsPath = process.env.MINERADIO_BEAT_CACHE_DIR || settings.beatmapsPath;
  const activeNativePath = NATIVE_HELPER_TEMP_PATH;
  const wallpaperEnginePath = path.join(settings.nativePath, 'wallpaper-engine-muted-package-cache');
  const activeWallpaperEnginePath = path.join(activeNativePath, 'wallpaper-engine-muted-package-cache');
  const [lyricsBytes, chromiumBytes, beatmapsBytes, wallpaperEngineBytes, userDataBytes] = await Promise.all([
    directoryUsageBytes(settings.lyricsPath),
    directoryUsageBytes(currentChromiumPath),
    directoryUsageBytes(activeBeatmapsPath),
    directoryUsageBytes(activeWallpaperEnginePath),
    directoryUsageBytes(app.getPath('userData')),
  ]);
  const chromiumRestartRequired = path.resolve(desiredChromiumPath) !== path.resolve(currentChromiumPath);
  const beatmapsRestartRequired = path.resolve(settings.beatmapsPath) !== path.resolve(activeBeatmapsPath);
  const nativeRestartRequired = path.resolve(settings.nativePath) !== path.resolve(activeNativePath);
  return {
    ok: true,
    settings: {
      rootPath: settings.rootPath,
      lyricsPath: settings.lyricsPath,
      chromiumPath: settings.chromiumPath,
      activeChromiumPath: currentChromiumPath,
      beatmapsPath: settings.beatmapsPath,
      activeBeatmapsPath,
      nativePath: settings.nativePath,
      activeNativePath,
      wallpaperEnginePath,
      activeWallpaperEnginePath,
      userDataPath: app.getPath('userData'),
      restartRequired: chromiumRestartRequired || beatmapsRestartRequired || nativeRestartRequired,
    },
    usage: {
      lyricsBytes,
      chromiumBytes,
      beatmapsBytes,
      wallpaperEngineBytes,
      userDataBytes,
      totalManagedBytes: lyricsBytes + chromiumBytes + beatmapsBytes + wallpaperEngineBytes,
    },
  };
}

function lyricCacheFilePath(key) {
  const digest = crypto.createHash('sha256').update(String(key || '')).digest('hex');
  return path.join(cacheSettings.lyricsPath, `${digest}.json`);
}

async function pruneLyricCache() {
  let entries = [];
  try {
    entries = await fs.promises.readdir(cacheSettings.lyricsPath, { withFileTypes: true });
  } catch (_) {
    return;
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^[a-f0-9]{64}\.json$/i.test(entry.name)) continue;
    const file = path.join(cacheSettings.lyricsPath, entry.name);
    try {
      const stat = await fs.promises.stat(file);
      files.push({ file, size: Math.max(0, Number(stat.size) || 0), time: Number(stat.mtimeMs) || 0 });
    } catch (_) { }
  }
  let total = files.reduce((sum, item) => sum + item.size, 0);
  files.sort((a, b) => a.time - b.time);
  for (const item of files) {
    if (total <= LYRIC_CACHE_MAX_BYTES) break;
    try {
      await fs.promises.unlink(item.file);
      total -= item.size;
    } catch (_) { }
  }
}

let cacheSettings = INITIAL_CACHE_SETTINGS;
try {
  // `sessionData` owns Chromium cookies/storage/cache. `userData` stays on the
  // stable roaming path so changing the cache directory never logs accounts out.
  app.setPath('cache', cacheSettings.chromiumPath);
  app.setPath('sessionData', chromiumSessionDataPath(cacheSettings));
  app.setPath('userData', STABLE_USER_DATA_PATH);
} catch (error) {
  console.warn('[CacheSettings] Chromium cache path fallback:', error.message);
}

const CHROMIUM_SAFE_PERFORMANCE_SWITCHES = [
  ['autoplay-policy', 'no-user-gesture-required'],
  ['enable-gpu-rasterization'],
  ['enable-oop-rasterization'],
  ['enable-zero-copy'],
  ['enable-accelerated-2d-canvas'],
  ['use-angle', 'd3d11'],
];
const CHROMIUM_OPT_IN_PERFORMANCE_SWITCHES = [
  ['ignore-gpu-blocklist', null, 'MINERADIO_IGNORE_GPU_BLOCKLIST'],
  ['force_high_performance_gpu', null, 'MINERADIO_FORCE_HIGH_PERFORMANCE_GPU'],
  ['disable-background-timer-throttling', null, 'MINERADIO_KEEP_BACKGROUND_RENDERING'],
  ['disable-renderer-backgrounding', null, 'MINERADIO_KEEP_BACKGROUND_RENDERING'],
  ['disable-backgrounding-occluded-windows', null, 'MINERADIO_KEEP_BACKGROUND_RENDERING'],
];
function appendChromiumSwitch(name, value) {
  if (value == null) app.commandLine.appendSwitch(name);
  else app.commandLine.appendSwitch(name, value);
}
for (const [name, value] of CHROMIUM_SAFE_PERFORMANCE_SWITCHES) appendChromiumSwitch(name, value);
for (const [name, value, envName] of CHROMIUM_OPT_IN_PERFORMANCE_SWITCHES) {
  if (process.env[envName] === '1') appendChromiumSwitch(name, value);
}
const gotSingleInstanceLock = app.requestSingleInstanceLock();

const QQ_LOGIN_COOKIE_PRIORITY = [
  'uin',
  'qqmusic_uin',
  'wxuin',
  'login_type',
  'qm_keyst',
  'qqmusic_key',
  'p_skey',
  'skey',
  'psrf_qqopenid',
  'psrf_qqunionid',
  'psrf_qqaccess_token',
  'psrf_qqrefresh_token',
  'wxopenid',
  'wxunionid',
  'wxrefresh_token',
  'wxskey',
  'p_uin',
  'ptcz',
  'RK',
];
const NETEASE_LOGIN_COOKIE_PRIORITY = [
  'MUSIC_U',
  '__csrf',
  'NMTID',
  'MUSIC_A',
  '__remember_me',
  '_ntes_nuid',
  '_ntes_nnid',
  'WEVNSM',
  'WNMCID',
  'JSESSIONID-WYYY',
];
const KUGOU_LOGIN_COOKIE_PRIORITY = [
  'KuGoo',
  'token',
  'userid',
  'KugooID',
  'kugouID',
  'UserId',
  'kg_mid',
  'kg_dfid',
  'Kugou',
  'NickName',
];
function findOpenPort(startPort) {
  return new Promise((resolve, reject) => {
    function tryPort(port) {
      const tester = net.createServer();

      tester.once('error', (err) => {
        if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
          tryPort(port + 1);
          return;
        }
        reject(err);
      });

      tester.once('listening', () => {
        tester.close(() => resolve(port));
      });

      tester.listen(port, '127.0.0.1');
    }

    tryPort(startPort);
  });
}

function startupDelay(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(delayMs) || 0)));
}

function withStartupTimeout(promise, timeoutMs, label, onTimeout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { if (typeof onTimeout === 'function') onTimeout(); } catch (_) {}
      const error = new Error(`${label || 'startup operation'} timed out after ${timeoutMs}ms`);
      error.code = 'MINERADIO_STARTUP_TIMEOUT';
      reject(error);
    }, Math.max(1000, Number(timeoutMs) || 1000));
    Promise.resolve(promise).then((value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitForServer(server, timeoutMs = STARTUP_SERVER_TIMEOUT_MS) {
  if (!server || server.listening) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      server.removeListener('listening', onListening);
      server.removeListener('error', onError);
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onListening = () => finish();
    const onError = (error) => finish(error);
    const timer = setTimeout(() => {
      const error = new Error(`waitForServer timed out after ${timeoutMs}ms`);
      error.code = 'MINERADIO_SERVER_TIMEOUT';
      finish(error);
    }, Math.max(1000, Number(timeoutMs) || STARTUP_SERVER_TIMEOUT_MS));
    server.once('listening', onListening);
    server.once('error', onError);
  });
}

function waitForLocalHttpReady(port, timeoutMs = STARTUP_HTTP_TIMEOUT_MS) {
  const deadline = Date.now() + Math.max(1500, Number(timeoutMs) || STARTUP_HTTP_TIMEOUT_MS);
  return new Promise((resolve, reject) => {
    let settled = false;
    let activeRequest = null;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (activeRequest) {
        try { activeRequest.destroy(); } catch (_) {}
        activeRequest = null;
      }
      if (error) reject(error);
      else resolve();
    };
    const probe = () => {
      if (settled) return;
      if (Date.now() >= deadline) {
        const error = new Error(`local HTTP server did not become ready within ${timeoutMs}ms`);
        error.code = 'MINERADIO_HTTP_TIMEOUT';
        finish(error);
        return;
      }
      activeRequest = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1200 }, (response) => {
        response.resume();
        activeRequest = null;
        if (response.statusCode >= 200 && response.statusCode < 500) {
          finish();
          return;
        }
        setTimeout(probe, 160);
      });
      activeRequest.once('timeout', () => activeRequest && activeRequest.destroy(new Error('HTTP probe timeout')));
      activeRequest.once('error', () => {
        activeRequest = null;
        setTimeout(probe, 160);
      });
    };
    probe();
  });
}

function getCurrentFxAutosavePath() {
  return path.join(app.getPath('userData'), CURRENT_FX_AUTOSAVE_FILE);
}

function readCurrentFxAutosaveFile() {
  try {
    const file = getCurrentFxAutosavePath();
    if (!fs.existsSync(file)) return null;
    const stat = fs.statSync(file);
    if (!stat || stat.size <= 0 || stat.size > CURRENT_FX_AUTOSAVE_MAX_BYTES) return null;
    const raw = fs.readFileSync(file, 'utf8');
    const payload = JSON.parse(raw);
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch (e) {
    console.warn('[FxAutosave] read skipped:', e.message);
    return null;
  }
}

function writeCurrentFxAutosaveFile(payload) {
  try {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, error: 'INVALID_AUTOSAVE_PAYLOAD' };
    }
    const text = JSON.stringify(payload);
    if (Buffer.byteLength(text, 'utf8') > CURRENT_FX_AUTOSAVE_MAX_BYTES) {
      return { ok: false, error: 'AUTOSAVE_PAYLOAD_TOO_LARGE' };
    }
    const file = getCurrentFxAutosavePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, file);
    return { ok: true };
  } catch (e) {
    console.warn('[FxAutosave] write failed:', e.message);
    return { ok: false, error: e.message || 'AUTOSAVE_WRITE_FAILED' };
  }
}

function flushMainWindowFxAutosave(reason) {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
    return Promise.resolve({ ok: false, skipped: true, reason: 'no-window' });
  }
  const safeReason = String(reason || 'main-close').replace(/[^a-z0-9:_-]/gi, '').slice(0, 48) || 'main-close';
  const script = `
    (function () {
      try {
        if (typeof flushLyricLayoutSave === 'function') {
          flushLyricLayoutSave('${safeReason}');
          return { ok: true };
        }
        return { ok: false, missing: true };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e || '') };
      }
    })()
  `;
  return Promise.race([
    mainWindow.webContents.executeJavaScript(script, true),
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), 800)),
  ]).catch((e) => ({ ok: false, error: e.message || String(e) }));
}

const LOCAL_APP_PERMISSION_ALLOWLIST = new Set(['speaker-selection', 'pointerLock', 'pointer-lock']);

function isLocalAppUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return u.protocol === 'http:' && u.hostname === '127.0.0.1' && Number(u.port || 0) === Number(mainServerPort || 0);
  } catch (e) {
    return false;
  }
}

function isTrustedMainDocumentUrl(value) {
  try {
    const u = new URL(String(value || ''));
    if (!isLocalAppUrl(u.href)) return false;
    const pathname = path.posix.normalize(u.pathname || '/');
    return pathname === '/' || pathname === '/index.html';
  } catch (_) {
    return false;
  }
}

function isTrustedMainWindowIpc(event) {
  try {
    if (!event || !event.sender || !mainWindow || mainWindow.isDestroyed()) return false;
    if (event.sender !== mainWindow.webContents || event.sender.isDestroyed()) return false;
    if (event.senderFrame && event.senderFrame.parent) return false;
    const sourceUrl = event.senderFrame && event.senderFrame.url || event.sender.getURL();
    return isTrustedMainDocumentUrl(sourceUrl);
  } catch (_) {
    return false;
  }
}

function clearGestureCameraPermissionGrant() {
  gestureCameraPermissionGrant = null;
}

function createGestureCameraPermissionGrant(event) {
  if (!isTrustedMainWindowIpc(event)) return null;
  const sourceUrl = event.senderFrame && event.senderFrame.url || event.sender.getURL();
  gestureCameraPermissionGrant = {
    webContentsId: event.sender.id,
    origin: sourceUrl,
    expiresAt: Date.now() + GESTURE_CAMERA_PERMISSION_GRANT_MS,
  };
  return gestureCameraPermissionGrant;
}

function isTrustedGestureCameraMediaPermission(webContents, origin, details) {
  const grant = gestureCameraPermissionGrant;
  if (!grant || Date.now() > grant.expiresAt) {
    clearGestureCameraPermissionGrant();
    return false;
  }
  try {
    if (!webContents || webContents.isDestroyed() || webContents.id !== grant.webContentsId) return false;
    if (!mainWindow || mainWindow.isDestroyed() || webContents !== mainWindow.webContents) return false;
    if (!isTrustedMainDocumentUrl(origin) || !isTrustedMainDocumentUrl(grant.origin)) return false;
    if (details && details.isMainFrame === false) return false;
    const mediaType = String(details && details.mediaType || '').toLowerCase();
    const mediaTypes = details && Array.isArray(details.mediaTypes)
      ? details.mediaTypes.map((value) => String(value || '').toLowerCase()).filter(Boolean)
      : [];
    if (mediaType.includes('audio') || mediaTypes.some((value) => value.includes('audio'))) return false;
    if (mediaType && !mediaType.includes('video')) return false;
    if (mediaTypes.length && !mediaTypes.every((value) => value.includes('video'))) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function isTrustedWallpaperEngineIpc(event) {
  return isTrustedMainWindowIpc(event);
}

function broadcastDesktopWallpaperStatus(status) {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('mineradio-wallpaper-runtime-state', {
    ...(status || fullDesktopModeRuntime.getStatus('broadcast')),
    recoveryTrayAvailable: !!tray,
    escapeShortcutRegistered: fullDesktopEscapeRegistered === true,
  });
  if (tray) createOrUpdateTray();
}

function wallpaperEngineProvidesDesktopBackdrop() {
  const status = wallpaperEngineRuntime.getStatus();
  return !!(status && status.active === true
    && status.captureMode === 'dwm-thumbnail'
    && status.dwmSurfaceReady === true
    && status.dwmSurfaceActive === true
    && Number(status.dwmSurfaceWindowId) > 0);
}

function clearWallpaperEngineCaptureGrant(sessionId = '') {
  const expectedSessionId = String(sessionId || '');
  if (expectedSessionId && !wallpaperEngineCaptureGrant) return false;
  if (expectedSessionId && wallpaperEngineCaptureGrant.sessionId !== expectedSessionId) return false;
  if (!wallpaperEngineCaptureGrant) return false;
  if (wallpaperEngineCaptureGrant && wallpaperEngineCapturePreparationOperation === wallpaperEngineCaptureGrant.operation) {
    wallpaperEngineCapturePreparationOperation = 0;
  }
  wallpaperEngineCaptureGrant = null;
  wallpaperEngineCaptureSourceId = '';
  return true;
}

function createWallpaperEngineCaptureGrant(result, operation, options = {}) {
  const sessionId = String(result && result.sessionId || '');
  const sourceId = String(result && result.sourceId || '');
  if (!/^[a-f0-9]{24}$/i.test(sessionId) || !sourceId) {
    clearWallpaperEngineCaptureGrant();
    return null;
  }
  wallpaperEngineCaptureSourceId = sourceId;
  wallpaperEngineCaptureGrant = {
    sessionId,
    sourceId,
    operation: Number(operation) || 0,
    kind: options.kind === 'dwm-glass' ? 'dwm-glass' : 'scene',
    captureSource: options.captureSource || null,
    expiresAt: Date.now() + WALLPAPER_ENGINE_CAPTURE_GRANT_MS,
    requestStarted: false,
  };
  return wallpaperEngineCaptureGrant;
}

function getWallpaperEngineCaptureGrant() {
  const grant = wallpaperEngineCaptureGrant;
  if (!grant) return null;
  const active = wallpaperEngineRuntime.getStatus();
  if (Date.now() > grant.expiresAt || !active || !active.active || active.sessionId !== grant.sessionId) {
    clearWallpaperEngineCaptureGrant(grant.sessionId);
    return null;
  }
  return grant;
}

function isTransientWallpaperEngineCaptureError(value) {
  return /NotReadableError|WALLPAPER_ENGINE_REFRESH_SUPERSEDED|WALLPAPER_CAPTURE_FAILED|WALLPAPER_CAPTURE_PREPARED_STREAM_MISSING/i
    .test(String(value || ''));
}

function resetWallpaperEngineCaptureGrantForRetry(grant) {
  if (!grant || wallpaperEngineCaptureGrant !== grant) return false;
  const active = wallpaperEngineRuntime.getStatus();
  if (!active || !active.active || active.sessionId !== grant.sessionId) return false;
  grant.requestStarted = false;
  grant.expiresAt = Date.now() + WALLPAPER_ENGINE_CAPTURE_GRANT_MS;
  return true;
}

function isTrustedWallpaperEngineDisplayCapturePermission(webContents, origin, details) {
  try {
    if (!webContents || !mainWindow || mainWindow.isDestroyed() || webContents !== mainWindow.webContents || webContents.isDestroyed()) return false;
    if (!isLocalAppUrl(origin)) return false;
    if (details && details.isMainFrame === false) return false;
    const grant = getWallpaperEngineCaptureGrant();
    return !!grant && wallpaperEngineCaptureSourceId === grant.sourceId;
  } catch (_) {
    return false;
  }
}

function isTrustedWallpaperEnginePreparationMediaPermission(webContents, origin, details) {
  const grant = getWallpaperEngineCaptureGrant();
  if (!grant || wallpaperEngineCapturePreparationOperation !== grant.operation) return false;
  const mediaType = String(details && details.mediaType || '').toLowerCase();
  const mediaTypes = details && Array.isArray(details.mediaTypes)
    ? details.mediaTypes.map((value) => String(value || '').toLowerCase()).filter(Boolean)
    : [];
  if (mediaType.includes('audio') || mediaTypes.some((value) => value.includes('audio'))) return false;
  if (mediaType && !mediaType.includes('video')) return false;
  if (mediaTypes.length && !mediaTypes.every((value) => value.includes('video'))) return false;
  return isTrustedWallpaperEngineDisplayCapturePermission(webContents, origin, details);
}

async function prepareWallpaperEngineRendererCapture(sessionId, fps) {
  if (!mainWindow || mainWindow.isDestroyed() || !/^[a-f0-9]{24}$/i.test(String(sessionId || ''))) {
    return { ok: false, error: 'WALLPAPER_CAPTURE_RENDERER_UNAVAILABLE' };
  }
  const safeSessionId = String(sessionId);
  const safeFps = Math.max(24, Math.min(WALLPAPER_ENGINE_MAX_CAPTURE_FPS, Number(fps) || 60));
  const grant = getWallpaperEngineCaptureGrant();
  if (!grant || grant.sessionId !== safeSessionId) return { ok: false, error: 'WALLPAPER_CAPTURE_GRANT_MISSING' };
  const safeSourceId = /^window:\d+:\d+$/.test(String(grant.sourceId || '')) ? String(grant.sourceId) : '';
  if (!safeSourceId) return { ok: false, error: 'WALLPAPER_CAPTURE_SOURCE_INVALID' };
  const script = `(() => {
    const prepare = window.__mineradioPrepareWallpaperEngineCapture;
    if (typeof prepare !== 'function') return { ok: false, error: 'WALLPAPER_CAPTURE_PREPARE_HANDLER_MISSING' };
    return Promise.resolve(prepare(${JSON.stringify(safeSessionId)}, ${safeFps}, ${JSON.stringify(safeSourceId)}))
      .then((value) => value && typeof value === 'object' ? value : { ok: false, error: 'WALLPAPER_CAPTURE_PREPARE_RESULT_INVALID' })
      .catch((error) => ({ ok: false, error: String(error && (error.message || error.name) || error || 'WALLPAPER_CAPTURE_PREPARE_FAILED').slice(0, 500) }));
  })()`;
  let timeout;
  try {
    wallpaperEngineCapturePreparationOperation = grant.operation;
    const result = await Promise.race([
      mainWindow.webContents.executeJavaScript(script, true),
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve({ ok: false, error: 'WALLPAPER_CAPTURE_PREPARE_TIMEOUT' }), WALLPAPER_ENGINE_CAPTURE_PREPARE_TIMEOUT_MS);
      }),
    ]);
    return result && typeof result === 'object'
      ? { ok: result.ok === true, error: String(result.error || '').slice(0, 500) }
      : { ok: false, error: 'WALLPAPER_CAPTURE_PREPARE_RESULT_INVALID' };
  } catch (error) {
    return { ok: false, error: String(error && (error.message || error.name) || error || 'WALLPAPER_CAPTURE_PREPARE_FAILED').slice(0, 500) };
  } finally {
    if (wallpaperEngineCapturePreparationOperation === grant.operation) wallpaperEngineCapturePreparationOperation = 0;
    if (timeout) clearTimeout(timeout);
  }
}

async function prepareWallpaperEngineRendererGlassCapture(sessionId, fps, sourceId) {
  if (!mainWindow || mainWindow.isDestroyed() || !/^[a-f0-9]{24}$/i.test(String(sessionId || ''))) {
    return { ok: false, error: 'WALLPAPER_GLASS_CAPTURE_RENDERER_UNAVAILABLE' };
  }
  const safeSessionId = String(sessionId);
  const safeFps = Math.max(24, Math.min(60, Number(fps) || 60));
  const safeSourceId = /^window:\d+:\d+$/.test(String(sourceId || '')) ? String(sourceId) : '';
  const grant = getWallpaperEngineCaptureGrant();
  if (!grant || grant.kind !== 'dwm-glass' || grant.sessionId !== safeSessionId
    || grant.sourceId !== safeSourceId) {
    return { ok: false, error: 'WALLPAPER_GLASS_CAPTURE_GRANT_MISSING' };
  }
  const script = `(() => {
    const prepare = window.__mineradioPrepareWallpaperEngineGlassCapture;
    if (typeof prepare !== 'function') return { ok: false, error: 'WALLPAPER_GLASS_CAPTURE_PREPARE_HANDLER_MISSING' };
    return Promise.resolve(prepare(${JSON.stringify(safeSessionId)}, ${safeFps}, ${JSON.stringify(safeSourceId)}))
      .then((value) => value && typeof value === 'object' ? value : { ok: false, error: 'WALLPAPER_GLASS_CAPTURE_PREPARE_RESULT_INVALID' })
      .catch((error) => ({ ok: false, error: String(error && (error.message || error.name) || error || 'WALLPAPER_GLASS_CAPTURE_PREPARE_FAILED').slice(0, 500) }));
  })()`;
  let timeout;
  try {
    wallpaperEngineCapturePreparationOperation = grant.operation;
    const result = await Promise.race([
      mainWindow.webContents.executeJavaScript(script, true),
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve({ ok: false, error: 'WALLPAPER_GLASS_CAPTURE_PREPARE_TIMEOUT' }), WALLPAPER_ENGINE_CAPTURE_PREPARE_TIMEOUT_MS);
      }),
    ]);
    return result && typeof result === 'object'
      ? { ok: result.ok === true, error: String(result.error || '').slice(0, 500) }
      : { ok: false, error: 'WALLPAPER_GLASS_CAPTURE_PREPARE_RESULT_INVALID' };
  } catch (error) {
    return { ok: false, error: String(error && (error.message || error.name) || error || 'WALLPAPER_GLASS_CAPTURE_PREPARE_FAILED').slice(0, 500) };
  } finally {
    if (wallpaperEngineCapturePreparationOperation === grant.operation) wallpaperEngineCapturePreparationOperation = 0;
    if (timeout) clearTimeout(timeout);
  }
}

async function prepareWallpaperEngineRendererHostBoundsFrame(sessionId, reason = 'bounds-changed') {
  if (!mainWindow || mainWindow.isDestroyed() || !/^[a-f0-9]{24}$/i.test(String(sessionId || ''))) {
    return { ok: false, frozen: false, error: 'WALLPAPER_BOUNDS_FREEZE_RENDERER_UNAVAILABLE' };
  }
  const safeSessionId = String(sessionId);
  const safeReason = String(reason || 'bounds-changed').slice(0, 80);
  const script = `(() => {
    const prepare = window.__mineradioPrepareWallpaperEngineHostBoundsChange;
    if (typeof prepare !== 'function') return { ok: false, frozen: false, error: 'WALLPAPER_BOUNDS_FREEZE_HANDLER_MISSING' };
    try {
      const value = prepare(${JSON.stringify(safeSessionId)}, ${JSON.stringify(safeReason)});
      return value && typeof value === 'object'
        ? value
        : { ok: false, frozen: false, error: 'WALLPAPER_BOUNDS_FREEZE_RESULT_INVALID' };
    } catch (error) {
      return { ok: false, frozen: false, error: String(error && (error.message || error.name) || error || 'WALLPAPER_BOUNDS_FREEZE_FAILED').slice(0, 500) };
    }
  })()`;
  try {
    // Do not race executeJavaScript with a timeout. A timed-out renderer script
    // cannot be cancelled and may run later, freeze the new frame, and clear the
    // live capture after main has already abandoned the restart. This promise is
    // asynchronous and does not block Electron's main loop; renderer teardown
    // rejects it during crash/navigation cleanup.
    const result = await mainWindow.webContents.executeJavaScript(script, true);
    return result && typeof result === 'object'
      ? { ok: result.ok === true, frozen: result.frozen === true, error: String(result.error || '').slice(0, 500) }
      : { ok: false, frozen: false, error: 'WALLPAPER_BOUNDS_FREEZE_RESULT_INVALID' };
  } catch (error) {
    return { ok: false, frozen: false, error: String(error && (error.message || error.name) || error || 'WALLPAPER_BOUNDS_FREEZE_FAILED').slice(0, 500) };
  }
}

async function prepareWallpaperEngineRendererDesktopPreview(sessionId, reason = 'full-desktop-passive') {
  const safeSessionId = String(sessionId || '');
  const safeReason = String(reason || 'full-desktop-passive').slice(0, 80);
  if (!mainWindow || mainWindow.isDestroyed()
    || (safeSessionId && !/^[a-f0-9]{24}$/i.test(safeSessionId))) {
    return { ok: false, preview: false, error: 'WALLPAPER_DESKTOP_PREVIEW_RENDERER_UNAVAILABLE' };
  }
  const script = `(() => {
    const prepare = window.__mineradioPrepareWallpaperEngineDesktopPreview;
    if (typeof prepare !== 'function') {
      return { ok: false, preview: false, error: 'WALLPAPER_DESKTOP_PREVIEW_HANDLER_MISSING' };
    }
    return Promise.resolve(prepare(${JSON.stringify(safeSessionId)}, ${JSON.stringify(safeReason)}))
      .then((value) => value && typeof value === 'object'
        ? value
        : { ok: false, preview: false, error: 'WALLPAPER_DESKTOP_PREVIEW_RESULT_INVALID' })
      .catch((error) => ({
        ok: false,
        preview: false,
        error: String(error && (error.message || error.name) || error || 'WALLPAPER_DESKTOP_PREVIEW_FAILED').slice(0, 500)
      }));
  })()`;
  try {
    const result = await mainWindow.webContents.executeJavaScript(script, true);
    return result && typeof result === 'object'
      ? {
        ok: result.ok === true,
        preview: result.preview === true,
        selectedEngine: result.selectedEngine === true,
        skipped: result.skipped === true,
        error: String(result.error || '').slice(0, 500),
      }
      : { ok: false, preview: false, error: 'WALLPAPER_DESKTOP_PREVIEW_RESULT_INVALID' };
  } catch (error) {
    return {
      ok: false,
      preview: false,
      error: String(error && (error.message || error.name) || error || 'WALLPAPER_DESKTOP_PREVIEW_FAILED').slice(0, 500),
    };
  }
}

function waitForWallpaperEngineHelperExit(child, timeoutMs = 2200) {
  if (!child || child.exitCode !== null || child.signalCode != null) return Promise.resolve(true);
  if (typeof child.once !== 'function') return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (typeof child.removeListener === 'function') {
        child.removeListener('exit', onExit);
        child.removeListener('close', onExit);
      }
      resolve(exited === true);
    };
    const onExit = () => finish(true);
    child.once('exit', onExit);
    child.once('close', onExit);
    timer = setTimeout(() => finish(false), Math.max(600, Number(timeoutMs) || 2200));
  });
}

async function prepareWallpaperEngineProjectPreviewBeforeDesktopEmbedding(win, reason = 'full-desktop-passive') {
  if (!win || win.isDestroyed() || appQuitting) {
    return { ok: false, error: 'FULL_DESKTOP_WALLPAPER_ENGINE_HOST_UNAVAILABLE' };
  }
  if (!ensureFullDesktopModeRecoveryTray()) {
    return { ok: false, error: 'FULL_DESKTOP_RECOVERY_TRAY_UNAVAILABLE' };
  }
  if (wallpaperEngineRuntime.pending) {
    return { ok: false, error: 'WALLPAPER_ENGINE_DESKTOP_TRANSITION_BUSY' };
  }

  const activeSession = wallpaperEngineRuntime.active || null;
  const sessionId = String(activeSession && activeSession.sessionId || '');
  if (activeSession && !/^[a-f0-9]{24}$/i.test(sessionId)) {
    return { ok: false, error: 'WALLPAPER_ENGINE_DESKTOP_SESSION_INVALID' };
  }

  wallpaperEngineHostVisibilitySuspended = true;
  wallpaperEngineHostVisibilityOperation += 1;
  finishWallpaperEngineVisibleHostResume(win);
  cancelWallpaperEngineHostBoundsRestart();
  wallpaperEngineCaptureOperation += 1;
  clearWallpaperEngineCaptureGrant();

  const prepared = await prepareWallpaperEngineRendererDesktopPreview(sessionId, reason);
  if (!prepared || prepared.ok !== true) {
    return {
      ok: false,
      error: String(prepared && prepared.error || 'WALLPAPER_DESKTOP_PREVIEW_UNAVAILABLE'),
    };
  }

  if (wallpaperEngineRuntime.pending
    || (activeSession && wallpaperEngineRuntime.active !== activeSession)
    || (!activeSession && wallpaperEngineRuntime.active)) {
    return { ok: false, error: 'WALLPAPER_ENGINE_DESKTOP_TRANSITION_BUSY' };
  }
  if (!activeSession) {
    return {
      ok: true,
      stopped: false,
      preview: prepared.preview === true,
      selectedEngine: prepared.selectedEngine === true,
    };
  }

  const helperProcess = activeSession.dwmSurfaceProcess || null;
  const helperExit = waitForWallpaperEngineHelperExit(helperProcess);
  const stopPromise = wallpaperEngineRuntime.stop(sessionId);
  wallpaperEngineHostVisibilityStopPromise = stopPromise;
  let stopped;
  try {
    stopped = await stopPromise;
  } catch (error) {
    return {
      ok: false,
      error: String(error && (error.message || error.name) || error || 'FULL_DESKTOP_WALLPAPER_ENGINE_SUSPEND_FAILED'),
    };
  }
  const helperExited = await helperExit;
  if (!stopped || stopped.stopped !== true
    || wallpaperEngineRuntime.active != null
    || wallpaperEngineRuntime.pending != null) {
    return {
      ok: false,
      error: String(stopped && stopped.reason || 'FULL_DESKTOP_WALLPAPER_ENGINE_SUSPEND_FAILED'),
    };
  }
  if (helperProcess && helperExited !== true) {
    return { ok: false, error: 'FULL_DESKTOP_WALLPAPER_ENGINE_HELPER_EXIT_TIMEOUT' };
  }
  return {
    ok: true,
    stopped: true,
    preview: prepared.preview === true,
    selectedEngine: prepared.selectedEngine === true,
  };
}

function cancelWallpaperEngineHostBoundsRestart() {
  if (wallpaperEngineHostBoundsRestartTimer) {
    clearTimeout(wallpaperEngineHostBoundsRestartTimer);
    wallpaperEngineHostBoundsRestartTimer = null;
  }
  wallpaperEngineHostBoundsRestartPending = false;
  wallpaperEngineHostBoundsStopPromise = null;
  wallpaperEngineHostBoundsFollowupReason = '';
  wallpaperEngineHostBoundsOperation += 1;
}

function stopWallpaperEngineRuntimeForRenderer(reason = '') {
  wallpaperEngineCaptureOperation += 1;
  cancelWallpaperEngineHostBoundsRestart();
  clearWallpaperEngineCaptureGrant();
  return wallpaperEngineRuntime.stop().catch((error) => {
    console.warn('[Wallpaper Engine] renderer cleanup failed:', reason || 'renderer-reset', error && error.message || error);
    return { ok: false, stopped: false, error: String(error && (error.message || error.name) || error || 'WALLPAPER_ENGINE_STOP_FAILED') };
  });
}

function setMainWindowBackgroundThrottling(win, enabled) {
  if (!win || win.isDestroyed() || !win.webContents || win.webContents.isDestroyed()) return;
  try {
    win.webContents.setBackgroundThrottling(enabled === true);
  } catch (_) { }
}

function finishWallpaperEngineVisibleHostResume(win) {
  wallpaperEngineHostVisibilityResumePending = false;
  if (wallpaperEngineHostVisibilityResumeTimer) {
    clearTimeout(wallpaperEngineHostVisibilityResumeTimer);
    wallpaperEngineHostVisibilityResumeTimer = null;
  }
  const desktopMode = fullDesktopModeRuntime.getStatus('wallpaper-engine-resume-finished');
  setMainWindowBackgroundThrottling(win, desktopMode.enabled === true ? false : MAIN_WINDOW_BACKGROUND_THROTTLING);
}

function suspendWallpaperEngineForHiddenHost(win, reason = 'hidden') {
  if (!win || win.isDestroyed()) return Promise.resolve({ ok: true, stopped: false });
  const normalizedReason = String(reason || 'hidden').toLowerCase();
  const runtimeStatus = wallpaperEngineRuntime.getStatus();
  if (/^minimi[sz]e(?:d)?$/.test(normalizedReason)
    && runtimeStatus
    && runtimeStatus.active === true
    && runtimeStatus.captureMode === 'dwm-thumbnail'
    && runtimeStatus.dwmSurfaceReady === true) {
    // The DWM helper is an independent native surface and can remain resident
    // while Chromium is minimized. Stopping it here discards Scene state and
    // forces a visible reload on restore.
    wallpaperEngineHostVisibilityResidentMinimized = true;
    finishWallpaperEngineVisibleHostResume(win);
    cancelWallpaperEngineHostBoundsRestart();
    return Promise.resolve({
      ok: true,
      stopped: false,
      preserved: true,
      sessionId: String(runtimeStatus.sessionId || ''),
    });
  }
  wallpaperEngineHostVisibilityResidentMinimized = false;
  if (wallpaperEngineHostVisibilitySuspended) {
    return wallpaperEngineHostVisibilityStopPromise || Promise.resolve({ ok: true, stopped: true });
  }
  wallpaperEngineHostVisibilitySuspended = true;
  wallpaperEngineHostVisibilityOperation += 1;
  finishWallpaperEngineVisibleHostResume(win);
  cancelWallpaperEngineHostBoundsRestart();
  try {
    win.webContents.send('mineradio-wallpaper-engine-host-bounds-changed', {
      phase: 'prepare',
      reason: String(reason || 'hidden'),
    });
  } catch (_) { }
  wallpaperEngineHostVisibilityStopPromise = stopWallpaperEngineRuntimeForRenderer(`host-${reason || 'hidden'}`);
  return wallpaperEngineHostVisibilityStopPromise;
}

function resumeWallpaperEngineForVisibleHost(win, reason = 'visible') {
  const desktopMode = fullDesktopModeRuntime.getStatus('wallpaper-engine-visible-host');
  if (appQuitting || (desktopMode.enabled === true
    && (desktopMode.interactive !== true || desktopMode.phase !== 'interactive'))) return;
  if (!wallpaperEngineHostVisibilitySuspended) {
    if (!wallpaperEngineHostVisibilityResidentMinimized) return;
    wallpaperEngineHostVisibilityResidentMinimized = false;
    const residentStatus = wallpaperEngineRuntime.getStatus();
    if (!residentStatus || residentStatus.active !== true || residentStatus.captureMode !== 'dwm-thumbnail') return;
    setMainWindowBackgroundThrottling(win, false);
    syncWallpaperEngineDesktopIconLayering(`resident-${reason || 'visible'}`).catch(() => false);
    const notifyResident = () => {
      if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
      try {
        win.webContents.send('mineradio-wallpaper-engine-host-bounds-changed', {
          phase: 'resident',
          reason: String(reason || 'visible'),
          sessionId: String(residentStatus.sessionId || ''),
          forceVisibleHost: true,
        });
      } catch (_) { }
    };
    setTimeout(notifyResident, 80);
    setTimeout(notifyResident, 420);
    setTimeout(() => finishWallpaperEngineVisibleHostResume(win), 900);
    return;
  }
  wallpaperEngineHostVisibilitySuspended = false;
  wallpaperEngineHostVisibilityResumePending = true;
  const visibilityOperation = ++wallpaperEngineHostVisibilityOperation;
  const forceVisibleHost = /^full-desktop-/i.test(String(reason || ''));
  // Electron's background-throttling switch also controls Page Visibility.
  // Temporarily disabling it makes a newly shown tray/minimized window visible
  // to Chromium before we ask the renderer to create the WE capture stream.
  setMainWindowBackgroundThrottling(win, false);
  if (wallpaperEngineHostVisibilityResumeTimer) clearTimeout(wallpaperEngineHostVisibilityResumeTimer);
  wallpaperEngineHostVisibilityResumeTimer = setTimeout(() => {
    finishWallpaperEngineVisibleHostResume(win);
  }, WALLPAPER_ENGINE_HOST_RESUME_TIMEOUT_MS);
  const notifyRestart = () => {
    if (wallpaperEngineHostVisibilityOperation !== visibilityOperation
      || wallpaperEngineHostVisibilitySuspended
      || !win
      || win.isDestroyed()
      || !win.isVisible()
      || win.isMinimized()) return;
    try {
      win.webContents.send('mineradio-wallpaper-engine-host-bounds-changed', {
        phase: 'restart',
        reason: String(reason || 'visible'),
        forceVisibleHost,
      });
    } catch (_) { }
  };
  const stopped = wallpaperEngineHostVisibilityStopPromise;
  Promise.resolve(stopped).catch(() => null).finally(() => {
    if (wallpaperEngineHostVisibilityStopPromise === stopped) wallpaperEngineHostVisibilityStopPromise = null;
    if (wallpaperEngineHostVisibilityOperation !== visibilityOperation || wallpaperEngineHostVisibilitySuspended) return;
    setTimeout(notifyRestart, 80);
    setTimeout(notifyRestart, 420);
    setTimeout(notifyRestart, 1100);
  });
}

function fullDesktopIconLayeringDesired(reason = '') {
  const status = fullDesktopModeRuntime.getStatus(reason || 'dwm-icon-layering');
  return status.enabled === true
    && status.interactive === true
    && status.coexisting === true
    && status.iconShapeActive === true;
}

function isEscapeAccelerator(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'escape' || normalized === 'esc';
}

function requestFullDesktopEscapeExit(reason = 'escape-key') {
  const status = fullDesktopModeRuntime.getStatus(`${reason}-request`);
  if (fullDesktopEscapeExitPending
    || (status.enabled !== true && fullDesktopEnablePending !== true)) return false;
  fullDesktopEscapeExitPending = true;
  fullDesktopEnableOperation += 1;
  fullDesktopEnablePending = false;
  const exitOperation = status.enabled === true
    ? disableFullDesktopMode(reason)
    : syncWallpaperEngineDesktopIconLayering(`${reason}-cancelled-enable`, false).then(() => ({
      ok: true,
      enabled: false,
      cancelled: true,
    }));
  Promise.resolve(exitOperation).catch((error) => {
    console.warn('[FullDesktopMode] Escape exit failed:', error && error.message || error);
  }).finally(() => {
    fullDesktopEscapeExitPending = false;
    syncFullDesktopEscapeShortcut(`${reason}-settled`);
  });
  return true;
}

function registerFullDesktopEscapeShortcut() {
  if (fullDesktopEscapeRegistered) return true;
  for (const [accelerator, action] of registeredGlobalHotkeys.entries()) {
    if (!isEscapeAccelerator(accelerator)) continue;
    try { globalShortcut.unregister(accelerator); } catch (_) { }
    registeredGlobalHotkeys.delete(accelerator);
    fullDesktopEscapeSuspendedBinding = { accelerator, action };
    break;
  }
  let registered = false;
  try {
    registered = globalShortcut.register('Escape', () => requestFullDesktopEscapeExit('escape-key'));
  } catch (_) {
    registered = false;
  }
  fullDesktopEscapeRegistered = registered === true;
  if (!fullDesktopEscapeRegistered && fullDesktopEscapeSuspendedBinding) {
    const suspended = fullDesktopEscapeSuspendedBinding;
    fullDesktopEscapeSuspendedBinding = null;
    try {
      if (globalShortcut.register(suspended.accelerator, () => sendGlobalHotkeyAction(suspended.action))) {
        registeredGlobalHotkeys.set(suspended.accelerator, suspended.action);
      }
    } catch (_) { }
  }
  return fullDesktopEscapeRegistered;
}

function unregisterFullDesktopEscapeShortcut() {
  if (fullDesktopEscapeRegistered) {
    try { globalShortcut.unregister('Escape'); } catch (_) { }
  }
  fullDesktopEscapeRegistered = false;
  if (fullDesktopEscapeSuspendedBinding) {
    const suspended = fullDesktopEscapeSuspendedBinding;
    fullDesktopEscapeSuspendedBinding = null;
    try {
      if (globalShortcut.register(suspended.accelerator, () => sendGlobalHotkeyAction(suspended.action))) {
        registeredGlobalHotkeys.set(suspended.accelerator, suspended.action);
      }
    } catch (_) { }
  }
}

function syncFullDesktopEscapeShortcut(reason = 'desktop-state') {
  const status = fullDesktopModeRuntime.getStatus(reason);
  if (status.enabled === true || fullDesktopEnablePending === true) registerFullDesktopEscapeShortcut();
  else unregisterFullDesktopEscapeShortcut();
}

function syncWallpaperEngineDesktopIconLayering(reason = 'desktop-state', desiredOverride) {
  const operation = async () => {
    const desired = typeof desiredOverride === 'boolean'
      ? desiredOverride
      : fullDesktopIconLayeringDesired(`${reason}-queued`);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const active = wallpaperEngineRuntime.getStatus();
      if (!active || active.active !== true || !active.sessionId
        || active.captureMode !== 'dwm-thumbnail') return true;
      try {
        const updated = await wallpaperEngineRuntime.updateDwmDesktopIconLayering(active.sessionId, desired);
        if (updated === true) return true;
      } catch (error) {
        console.warn('[FullDesktopMode] DWM desktop-icon layering sync failed:', reason, error && error.message || error);
      }
      if (attempt < 3) await startupDelay(70 + attempt * 55);
    }
    console.warn('[FullDesktopMode] DWM desktop-icon layering was not acknowledged:', reason, desired);
    return false;
  };
  wallpaperEngineDesktopIconLayeringQueue = wallpaperEngineDesktopIconLayeringQueue.then(operation, operation);
  return wallpaperEngineDesktopIconLayeringQueue;
}

function syncWallpaperEngineWithFullDesktopMode(win, reason = 'desktop-state') {
  if (!win || win.isDestroyed()) return;
  const desktopMode = fullDesktopModeRuntime.getStatus(reason);
  // Passive WorkerW mode keeps the selected project's static preview and no
  // native WE session. Returning to the top-level interactive host restarts the
  // same saved engine selection through the existing renderer lifecycle.
  if (!appQuitting && (desktopMode.enabled !== true || desktopMode.interactive === true)) {
    resumeWallpaperEngineForVisibleHost(win, `full-desktop-${reason}`);
  }
  if (tray) createOrUpdateTray();
  sendWindowState(win);
}

async function enableFullDesktopMode(win, options = {}) {
  const enableOperation = ++fullDesktopEnableOperation;
  fullDesktopEnablePending = true;
  registerFullDesktopEscapeShortcut();
  // The same main HWND becomes a transparent child above Explorer's real icon view.
  // Hide/show events during that native handoff belong to this transition and
  // must not suspend the already-running Wallpaper Engine session.
  fullDesktopModeHostVisibilityTransitionDepth += 1;
  try {
    if (!options || options.interactive !== false) {
      // Put the unique DWM base below Explorer before the host HWND becomes a
      // child of the icon WorkerW. The host stays hidden until its shape lands.
      await syncWallpaperEngineDesktopIconLayering('enable-coexist-preflight', true);
    }
    if (enableOperation !== fullDesktopEnableOperation || fullDesktopEnablePending !== true) {
      return { ok: false, enabled: false, cancelled: true, error: 'FULL_DESKTOP_ENABLE_CANCELLED' };
    }
    return await fullDesktopModeRuntime.enable(win, options);
  } finally {
    if (enableOperation === fullDesktopEnableOperation) fullDesktopEnablePending = false;
    await syncWallpaperEngineDesktopIconLayering('enable-settled').catch(() => false);
    fullDesktopModeHostVisibilityTransitionDepth = Math.max(0, fullDesktopModeHostVisibilityTransitionDepth - 1);
    syncWallpaperEngineWithFullDesktopMode(win, 'enable-settled');
    if (fullDesktopModeRuntime.getStatus('enable-settled-cleanup').enabled !== true) {
      releaseFullDesktopModeRecoveryTray();
    }
    syncFullDesktopEscapeShortcut('enable-settled-escape');
  }
}

async function setFullDesktopModeInteractive(value, reason = 'interaction-changed') {
  fullDesktopModeHostVisibilityTransitionDepth += 1;
  try {
    if (value === true) await syncWallpaperEngineDesktopIconLayering(`${reason}-coexist-preflight`, true);
    return await fullDesktopModeRuntime.setInteractive(value, reason);
  } finally {
    await syncWallpaperEngineDesktopIconLayering(`${reason}-settled`).catch(() => false);
    fullDesktopModeHostVisibilityTransitionDepth = Math.max(0, fullDesktopModeHostVisibilityTransitionDepth - 1);
    syncWallpaperEngineWithFullDesktopMode(mainWindow, `${reason}-settled`);
    if (fullDesktopModeRuntime.getStatus(`${reason}-cleanup`).enabled !== true) {
      releaseFullDesktopModeRecoveryTray();
    }
    syncFullDesktopEscapeShortcut(`${reason}-escape`);
  }
}

async function toggleFullDesktopModeInteraction(reason = 'interaction-toggled') {
  fullDesktopModeHostVisibilityTransitionDepth += 1;
  try {
    const before = fullDesktopModeRuntime.getStatus(`${reason}-before`);
    if (before.interactive !== true) await syncWallpaperEngineDesktopIconLayering(`${reason}-coexist-preflight`, true);
    return await fullDesktopModeRuntime.toggleInteractive(reason);
  } finally {
    await syncWallpaperEngineDesktopIconLayering(`${reason}-settled`).catch(() => false);
    fullDesktopModeHostVisibilityTransitionDepth = Math.max(0, fullDesktopModeHostVisibilityTransitionDepth - 1);
    syncWallpaperEngineWithFullDesktopMode(mainWindow, `${reason}-settled`);
    if (fullDesktopModeRuntime.getStatus(`${reason}-cleanup`).enabled !== true) {
      releaseFullDesktopModeRecoveryTray();
    }
    syncFullDesktopEscapeShortcut(`${reason}-escape`);
  }
}

async function disableFullDesktopMode(reason = 'disabled') {
  fullDesktopEnableOperation += 1;
  fullDesktopEnablePending = false;
  fullDesktopModeHostVisibilityTransitionDepth += 1;
  try {
    return await fullDesktopModeRuntime.disable(reason);
  } finally {
    // Keep icon layering active until the host is detached back to a verified
    // top-level HWND; only then restore the ordinary host/surface/source chain.
    await syncWallpaperEngineDesktopIconLayering(`${reason}-settled`).catch(() => false);
    fullDesktopModeHostVisibilityTransitionDepth = Math.max(0, fullDesktopModeHostVisibilityTransitionDepth - 1);
    syncWallpaperEngineWithFullDesktopMode(mainWindow, `${reason}-settled`);
    if (fullDesktopModeRuntime.getStatus(`${reason}-cleanup`).enabled !== true) {
      releaseFullDesktopModeRecoveryTray();
    }
    syncFullDesktopEscapeShortcut(`${reason}-escape`);
  }
}

async function reconcileFullDesktopMode(reason = 'display-change') {
  fullDesktopModeHostVisibilityTransitionDepth += 1;
  try {
    return await fullDesktopModeRuntime.reconcile(reason);
  } finally {
    await syncWallpaperEngineDesktopIconLayering(`${reason}-settled`).catch(() => false);
    fullDesktopModeHostVisibilityTransitionDepth = Math.max(0, fullDesktopModeHostVisibilityTransitionDepth - 1);
    syncWallpaperEngineWithFullDesktopMode(mainWindow, `${reason}-settled`);
    if (fullDesktopModeRuntime.getStatus(`${reason}-cleanup`).enabled !== true) {
      releaseFullDesktopModeRecoveryTray();
    }
    syncFullDesktopEscapeShortcut(`${reason}-escape`);
  }
}

function scheduleWallpaperEngineHostBoundsRestart(win, reason = 'bounds-changed') {
  if (!win || win.isDestroyed()) return;
  const status = wallpaperEngineRuntime.getStatus();
  // The DWM surface helper follows the authoritative host HWND and resizes the
  // source in place. Restarting the Scene here would discard native parallax
  // state and reintroduce the old capture-only lifecycle on every drag.
  if (status && status.active === true && status.captureMode === 'dwm-thumbnail') return;
  if (!wallpaperEngineHostBoundsRestartPending && (!status || status.active !== true)) return;
  let job = wallpaperEngineHostBoundsStopPromise;
  if (job && job.started === true) {
    // A second movement after the settled restart began is handled once the new
    // capture ACK arrives. Continuous native dragging never reaches this branch
    // because the real debounce below is reset on every move/resize event.
    wallpaperEngineHostBoundsFollowupReason = String(reason || 'bounds-changed').slice(0, 80);
    return;
  }
  if (!job) {
    wallpaperEngineHostBoundsRestartPending = true;
    job = {
      boundsOperation: ++wallpaperEngineHostBoundsOperation,
      captureOperation: 0,
      sessionId: String(status && status.sessionId || ''),
      reason: String(reason || 'bounds-changed').slice(0, 80),
      started: false,
      promise: null,
    };
    wallpaperEngineHostBoundsStopPromise = job;
  } else {
    job.reason = String(reason || job.reason || 'bounds-changed').slice(0, 80);
  }
  if (wallpaperEngineHostBoundsRestartTimer) clearTimeout(wallpaperEngineHostBoundsRestartTimer);
  wallpaperEngineHostBoundsRestartTimer = setTimeout(() => {
    wallpaperEngineHostBoundsRestartTimer = null;
    if (wallpaperEngineHostBoundsStopPromise !== job || job.started === true) return;
    const currentBeforePrepare = wallpaperEngineRuntime.getStatus();
    if (!currentBeforePrepare || currentBeforePrepare.active !== true
      || String(currentBeforePrepare.sessionId || '') !== job.sessionId) {
      wallpaperEngineHostBoundsStopPromise = null;
      wallpaperEngineHostBoundsRestartPending = false;
      return;
    }
    job.started = true;
    job.captureOperation = ++wallpaperEngineCaptureOperation;
    clearWallpaperEngineCaptureGrant();
    job.promise = prepareWallpaperEngineRendererHostBoundsFrame(job.sessionId, job.reason)
      .then(async (prepared) => {
        const current = wallpaperEngineRuntime.getStatus();
        const stale = wallpaperEngineHostBoundsStopPromise !== job
          || wallpaperEngineHostBoundsOperation !== job.boundsOperation
          || wallpaperEngineCaptureOperation !== job.captureOperation
          || wallpaperEngineHostVisibilitySuspended
          || win.isDestroyed()
          || !current
          || current.active !== true
          || String(current.sessionId || '') !== job.sessionId;
        if (stale) {
          return {
            ok: false,
            stale: true,
            frozen: !!(prepared && prepared.frozen === true),
            stopped: false,
          };
        }
        // Never tear down the live source unless the renderer preserved a real
        // frame. Once frozen, however, always release the renderer by starting a
        // fresh session even if the old native HWND refuses its first close.
        if (!prepared || prepared.ok !== true || prepared.frozen !== true) {
          return {
            ok: false,
            frozen: false,
            stopped: false,
            error: String(prepared && prepared.error || 'WALLPAPER_BOUNDS_FREEZE_UNAVAILABLE'),
          };
        }
        try {
          const stopped = await wallpaperEngineRuntime.stop(job.sessionId);
          return { ok: true, frozen: true, stopped: !!(stopped && stopped.stopped), result: stopped };
        } catch (error) {
          return {
            ok: false,
            frozen: true,
            stopped: false,
            error: String(error && (error.message || error.name) || error || 'WALLPAPER_BOUNDS_RUNTIME_STOP_FAILED'),
          };
        }
    });
    Promise.resolve(job.promise).then((result) => {
      const ownsCurrentJob = wallpaperEngineHostBoundsStopPromise === job;
      const operationCurrent = wallpaperEngineHostBoundsOperation === job.boundsOperation
        && wallpaperEngineCaptureOperation === job.captureOperation;
      if (ownsCurrentJob) {
        wallpaperEngineHostBoundsStopPromise = null;
        wallpaperEngineHostBoundsRestartPending = false;
      }
      if (!result || result.frozen !== true) return;
      // A renderer freeze can complete after another operation cancelled and
      // detached this job. The freeze itself is not cancellable, so its late
      // completion must still receive a visible-host recovery signal; otherwise
      // the renderer can remain permanently stuck on the preserved frame.
      const recoveryOnly = !ownsCurrentJob || !operationCurrent || result.stale === true;
      setTimeout(() => {
        if (wallpaperEngineHostVisibilitySuspended
          || win.isDestroyed()
          || !win.isVisible()
          || win.isMinimized()) return;
        if (!recoveryOnly && (wallpaperEngineHostBoundsOperation !== job.boundsOperation
          || wallpaperEngineCaptureOperation !== job.captureOperation)) return;
        try {
          win.webContents.send('mineradio-wallpaper-engine-host-bounds-changed', {
            phase: 'restart',
            reason: recoveryOnly ? 'bounds-stale-recovery' : job.reason,
            forceVisibleHost: true,
          });
        } catch (_) { }
      }, 90);
    }).catch(() => {
      if (wallpaperEngineHostBoundsStopPromise === job) {
        wallpaperEngineHostBoundsStopPromise = null;
        wallpaperEngineHostBoundsRestartPending = false;
      }
    });
  }, 260);
}

function configureLocalAppPermissions() {
  const ses = session.defaultSession;
  if (!ses || ses._mineradioPermissionsConfigured) return;
  ses._mineradioPermissionsConfigured = true;
  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const origin = requestingOrigin || (details && details.requestingUrl) || (webContents && webContents.getURL && webContents.getURL()) || '';
    if (permission === 'display-capture') return isTrustedWallpaperEngineDisplayCapturePermission(webContents, origin, details);
    if (permission === 'media') return isTrustedWallpaperEnginePreparationMediaPermission(webContents, origin, details)
      || isTrustedGestureCameraMediaPermission(webContents, origin, details);
    return LOCAL_APP_PERMISSION_ALLOWLIST.has(permission) && isLocalAppUrl(origin);
  });
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = (details && (details.requestingUrl || details.securityOrigin)) || (webContents && webContents.getURL && webContents.getURL()) || '';
    if (permission === 'display-capture') {
      callback(isTrustedWallpaperEngineDisplayCapturePermission(webContents, origin, details));
      return;
    }
    if (permission === 'media') {
      callback(isTrustedWallpaperEnginePreparationMediaPermission(webContents, origin, details)
        || isTrustedGestureCameraMediaPermission(webContents, origin, details));
      return;
    }
    callback(LOCAL_APP_PERMISSION_ALLOWLIST.has(permission) && isLocalAppUrl(origin));
  });
  ses.setDisplayMediaRequestHandler((request, callback) => {
    let replied = false;
    const reply = (value) => {
      if (replied) return;
      replied = true;
      callback(value || {});
    };
    Promise.resolve().then(async () => {
      const frame = request && request.frame;
      const trustedFrame = !!(frame
        && mainWindow
        && !mainWindow.isDestroyed()
        && frame === mainWindow.webContents.mainFrame
        && !frame.parent
        && isLocalAppUrl(request.securityOrigin));
      const grant = getWallpaperEngineCaptureGrant();
      if (!trustedFrame || !request.videoRequested || request.audioRequested || !grant || grant.requestStarted) {
        reply({});
        return;
      }
      grant.requestStarted = true;
      if (grant.kind === 'dwm-glass') {
        const current = wallpaperEngineRuntime.getStatus();
        const source = grant.captureSource;
        const sourceMatch = /^window:(\d+):\d+$/.exec(String(source && source.id || ''));
        if (wallpaperEngineCaptureGrant !== grant
          || !current
          || current.active !== true
          || current.sessionId !== grant.sessionId
          || current.dwmGlassSurfaceReady !== true
          || current.dwmGlassSurfaceActive !== true
          || !sourceMatch
          || Number(sourceMatch[1]) !== Number(current.dwmGlassSurfaceWindowId)
          || String(source && source.name || '') !== 'Mineradio WE DWM Surface') {
          reply({});
          return;
        }
        reply({ video: source });
        return;
      }
      let refreshed = typeof wallpaperEngineRuntime.refreshActiveSource === 'function'
        ? await wallpaperEngineRuntime.refreshActiveSource(grant.sessionId, {
          timeoutMs: 1600,
          pollIntervalMs: 80,
          includeSource: true,
        })
        : wallpaperEngineRuntime.getStatus();
      let source = refreshed && refreshed.captureSource;
      if (wallpaperEngineCaptureGrant !== grant
        || !refreshed
        || refreshed.sessionId !== grant.sessionId
        || !refreshed.sourceId
        || !source
        || String(source.id || '') !== String(refreshed.sourceId)) {
        reply({});
        return;
      }
      if (refreshed.sourceWindowAligned !== true || String(refreshed.sourceId) !== String(grant.sourceId || '')) {
        await wallpaperEngineRuntime.embedActiveWindow(grant.sessionId, {
          hostWindowId: nativeWindowHandleDecimal(mainWindow),
          hostExecutable: process.execPath,
          cornerRadius: wallpaperEngineHostCornerRadius(mainWindow),
          desktopIconLayering: fullDesktopIconLayeringDesired('wallpaper-engine-source-refresh'),
        });
        refreshed = await wallpaperEngineRuntime.refreshActiveSource(grant.sessionId, {
          timeoutMs: 1600,
          pollIntervalMs: 80,
          includeSource: true,
        });
        source = refreshed && refreshed.captureSource;
      }
      if (wallpaperEngineCaptureGrant !== grant
        || !refreshed
        || refreshed.sessionId !== grant.sessionId
        || refreshed.sourceWindowAligned !== true
        || !source
        || String(source.id || '') !== String(refreshed.sourceId || '')) {
        reply({});
        return;
      }
      grant.sourceId = String(refreshed.sourceId);
      wallpaperEngineCaptureSourceId = grant.sourceId;
      reply({ video: source });
    }).catch(() => reply({}));
  }, { useSystemPicker: false });
}

function sendWindowState(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('desktop-window-state', getWindowState(win));
}

function sendGlobalHotkeyAction(action) {
  if (!mainWindow || mainWindow.isDestroyed() || !action) return;
  mainWindow.webContents.send('mineradio-global-hotkey', { action });
}

function unregisterMineradioGlobalHotkeys() {
  for (const accelerator of registeredGlobalHotkeys.keys()) {
    try { globalShortcut.unregister(accelerator); } catch (e) {}
  }
  registeredGlobalHotkeys.clear();
}

function configureMineradioGlobalHotkeys(bindings = []) {
  unregisterMineradioGlobalHotkeys();
  const results = [];
  const seen = new Set();
  for (const item of Array.isArray(bindings) ? bindings : []) {
    const action = item && String(item.action || '').trim();
    const accelerator = item && String(item.accelerator || '').trim();
    if (!action || !accelerator || seen.has(accelerator)) continue;
    seen.add(accelerator);
    let registered = false;
    try {
      registered = globalShortcut.register(accelerator, () => sendGlobalHotkeyAction(action));
    } catch (error) {
      registered = false;
    }
    if (registered) {
      registeredGlobalHotkeys.set(accelerator, action);
      results.push({ action, accelerator, ok: true });
    } else {
      results.push({
        action,
        accelerator,
        ok: false,
        conflict: {
          sourceName: '系统 / 其他软件',
          sourceIcon: 'warning',
          reason: '该组合键已被占用或被系统保留',
        },
      });
    }
  }
  return { ok: true, results };
}

function scheduleWindowStateSend(win, delay = 80) {
  if (!win || win.isDestroyed()) return;
  if (mainWindowStateTimer) clearTimeout(mainWindowStateTimer);
  mainWindowStateTimer = setTimeout(() => {
    mainWindowStateTimer = null;
    sendWindowState(win);
  }, delay);
}

function rectsOverlapOnY(a, b) {
  if (!a || !b) return false;
  const aTop = Number(a.y) || 0;
  const bTop = Number(b.y) || 0;
  const aBottom = aTop + (Number(a.height) || 0);
  const bBottom = bTop + (Number(b.height) || 0);
  return aBottom > bTop && bBottom > aTop;
}

function getDisplayState(win) {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const display = win && !win.isDestroyed()
    ? screen.getDisplayMatching(win.getBounds())
    : primary;
  const bounds = display && display.bounds ? display.bounds : primary.bounds;
  const displayId = display && display.id;
  const primaryId = primary && primary.id;
  const edgeTolerance = 2;
  const hasDisplayOnLeft = displays.some((candidate) => {
    if (!candidate || candidate.id === displayId || !candidate.bounds) return false;
    return rectsOverlapOnY(bounds, candidate.bounds)
      && Math.abs((candidate.bounds.x + candidate.bounds.width) - bounds.x) <= edgeTolerance;
  });
  const hasDisplayOnRight = displays.some((candidate) => {
    if (!candidate || candidate.id === displayId || !candidate.bounds) return false;
    return rectsOverlapOnY(bounds, candidate.bounds)
      && Math.abs((bounds.x + bounds.width) - candidate.bounds.x) <= edgeTolerance;
  });
  return {
    displayId,
    primaryDisplayId: primaryId,
    isPrimaryDisplay: !!(display && primary && display.id === primary.id),
    hasDisplayOnLeft,
    hasDisplayOnRight,
    displayBounds: bounds ? {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    } : null,
  };
}

function getWindowState(win) {
  if (!win || win.isDestroyed()) return {
    isMaximized: false,
    isNativeFullScreen: false,
    isHtmlFullScreen: false,
    isWindowFullScreen: false,
    isFullScreen: false,
    isMinimized: false,
    isVisible: false,
    isFocused: false,
    isDesktopEmbedded: false,
    isDesktopInteractive: false,
    isDesktopIconCoexisting: false,
    isPrimaryDisplay: true,
    hasDisplayOnLeft: false,
    hasDisplayOnRight: false,
    displayBounds: null,
  };
  const desktopMode = fullDesktopModeRuntime.getStatus('window-state');
  return {
    isMaximized: win.isMaximized(),
    isNativeFullScreen: win.isFullScreen(),
    isHtmlFullScreen: htmlFullscreenActive,
    isWindowFullScreen: windowFullscreenActive,
    isFullScreen: win.isFullScreen() || htmlFullscreenActive || windowFullscreenActive,
    isMinimized: win.isMinimized(),
    isVisible: win.isVisible(),
    isFocused: win.isFocused(),
    isDesktopEmbedded: desktopMode.enabled === true,
    isDesktopInteractive: desktopMode.interactive === true,
    isDesktopIconCoexisting: desktopMode.coexisting === true && desktopMode.iconShapeActive === true,
    ...getDisplayState(win),
  };
}

function setMainWindowFullscreenResizeGuard(win, fullscreen) {
  if (!win || win.isDestroyed()) return;
  const shouldResize = !fullscreen;
  try {
    if (typeof win.isResizable === 'function' && win.isResizable() === shouldResize) return;
    win.setResizable(shouldResize);
  } catch (e) {
    console.warn('[WindowResizeGuard]', fullscreen ? 'fullscreen-lock' : 'windowed-restore', e.message || e);
  }
}

function getSenderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

async function getGpuDiagnostics() {
  const status = (() => {
    try { return app.getGPUFeatureStatus(); } catch (e) { return { error: e.message || String(e) }; }
  })();
  let basicInfo = null;
  try {
    basicInfo = await app.getGPUInfo('basic');
  } catch (e) {
    basicInfo = { error: e.message || String(e) };
  }
  return {
    status,
    basicInfo,
    switches: {
      safeGpuRasterization: true,
      ignoreGpuBlocklist: process.env.MINERADIO_IGNORE_GPU_BLOCKLIST === '1',
      forceHighPerformanceGpu: process.env.MINERADIO_FORCE_HIGH_PERFORMANCE_GPU === '1',
      keepBackgroundRendering: process.env.MINERADIO_KEEP_BACKGROUND_RENDERING === '1',
      angle: 'd3d11',
    },
  };
}

function collectAppTrimPids() {
  const pids = new Set([process.pid]);
  function addWindowProcess(win) {
    if (!win || win.isDestroyed()) return;
    try {
      const pid = win.webContents && win.webContents.getOSProcessId && win.webContents.getOSProcessId();
      if (pid) pids.add(pid);
    } catch (e) {}
  }
  addWindowProcess(mainWindow);
  try {
    app.getAppMetrics().forEach((row) => {
      if (row && Number.isFinite(Number(row.pid))) pids.add(Math.round(Number(row.pid)));
    });
  } catch (e) {}
  return Array.from(pids);
}

function isMainWindowForegroundVisible() {
  try {
    return !!(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized());
  } catch (e) {
    return false;
  }
}

async function trimAppMemoryNow(reason) {
  if (appMemoryTrimInFlight) {
    return { ok: false, skipped: true, reason: 'in-flight' };
  }
  const trimReason = String(reason || 'manual');
  if (isMainWindowForegroundVisible() && trimReason !== 'manual-force') {
    return { ok: false, skipped: true, reason: 'foreground-visible' };
  }
  appMemoryTrimInFlight = true;
  lastAppMemoryTrimAt = Date.now();
  lastAppMemoryTrimReason = trimReason;
  try {
    const before = systemMemory.getMemorySnapshot();
    const trim = await systemMemory.trimAppWorkingSets(collectAppTrimPids());
    const after = systemMemory.getMemorySnapshot();
    return { ok: true, reason: lastAppMemoryTrimReason, before, trim, after };
  } catch (e) {
    return { ok: false, reason: lastAppMemoryTrimReason, error: e.message || 'APP_MEMORY_TRIM_FAILED', snapshot: systemMemory.getMemorySnapshot() };
  } finally {
    appMemoryTrimInFlight = false;
  }
}

function scheduleAppMemoryTrim(reason, delay = 9000) {
  if (process.platform !== 'win32') return;
  if (memoryAutoState.appTrimEnabled === false || memoryAutoState.backgroundTrimEnabled === false) return;
  if (Date.now() - lastAppMemoryTrimAt < 120000) return;
  if (appMemoryTrimTimer) clearTimeout(appMemoryTrimTimer);
  appMemoryTrimTimer = setTimeout(() => {
    appMemoryTrimTimer = null;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isMinimized() && mainWindow.isVisible()) return;
    trimAppMemoryNow(reason).catch(() => {});
  }, Math.max(4000, delay));
}

function normalizeMemoryAutoState(payload = {}) {
  const systemEnabled = systemMemory.SYSTEM_PURGE_AVAILABLE === true && systemMemory.SYSTEM_PURGE_ENABLED === true;
  return {
    appTrimEnabled: payload.appTrimEnabled !== false,
    backgroundTrimEnabled: payload.backgroundTrimEnabled !== false,
    enabled: systemEnabled && payload.enabled === true,
    mask: systemMemory.normalizeMask(payload.mask != null ? payload.mask : memoryAutoState.mask),
    intervalMin: Math.max(5, Math.min(180, Math.round(Number(payload.intervalMin != null ? payload.intervalMin : memoryAutoState.intervalMin) || 30))),
    thresholdPercent: Math.max(0, Math.min(100, Math.round(Number(payload.thresholdPercent != null ? payload.thresholdPercent : memoryAutoState.thresholdPercent) || 0))),
    autoElevate: payload.autoElevate === true,
    lastRunAt: memoryAutoState.lastRunAt || 0,
    lastReason: memoryAutoState.lastReason || '',
    lastResult: memoryAutoState.lastResult || null,
    lastError: '',
  };
}

function stopMemoryAutoTimer() {
  if (memoryAutoTimer) {
    clearInterval(memoryAutoTimer);
    memoryAutoTimer = null;
  }
}

function syncMemoryAutoTimer() {
  stopMemoryAutoTimer();
  if (!memoryAutoState.enabled) return;
  memoryAutoTimer = setInterval(() => {
    runMemoryAutoTick('timer').catch(() => {});
  }, Math.max(5, memoryAutoState.intervalMin) * 60000);
}

async function runMemoryAutoTick(reason = 'auto') {
  if (!memoryAutoState.enabled) return { ok: false, skipped: true, reason: 'disabled', state: memoryAutoState };
  if (isMainWindowForegroundVisible()) {
    memoryAutoState.lastRunAt = Date.now();
    memoryAutoState.lastReason = reason + ':foreground-visible';
    memoryAutoState.lastResult = { ok: true, skipped: true, reason: 'foreground-visible' };
    return { ok: true, skipped: true, reason: 'foreground-visible', state: memoryAutoState };
  }
  const snapshot = await systemMemory.getMemorySnapshotExtended();
  const threshold = Number(memoryAutoState.thresholdPercent) || 0;
  if (threshold > 0 && snapshot && snapshot.usedPercent < threshold) {
    memoryAutoState.lastRunAt = Date.now();
    memoryAutoState.lastReason = reason + ':below-threshold';
    memoryAutoState.lastResult = { ok: true, skipped: true, usedPercent: snapshot.usedPercent, thresholdPercent: threshold };
    return { ok: true, skipped: true, snapshot, state: memoryAutoState };
  }
  memoryAutoState.lastRunAt = Date.now();
  memoryAutoState.lastReason = reason;
  try {
    const result = await systemMemory.purgeSystemMemorySmart(memoryAutoState.mask, {
      autoElevate: memoryAutoState.autoElevate === true,
    });
    memoryAutoState.lastResult = result;
    memoryAutoState.lastError = '';
    return { ok: true, result, snapshot: await systemMemory.getMemorySnapshotExtended(), state: memoryAutoState };
  } catch (e) {
    memoryAutoState.lastError = e.message || 'MEMORY_AUTO_FAILED';
    memoryAutoState.lastResult = { ok: false, error: memoryAutoState.lastError };
    return { ok: false, error: memoryAutoState.lastError, snapshot: systemMemory.getMemorySnapshot(), state: memoryAutoState };
  }
}

function normalizeCloseBehavior(value) {
  return value === 'tray' ? 'tray' : 'exit';
}

function resetMainWindowZoom(win = mainWindow) {
  if (!win || win.isDestroyed()) return;
  try { win.webContents.setZoomFactor(1); } catch (e) {}
  try {
    const result = win.webContents.setVisualZoomLevelLimits(1, 1);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch (e) {}
}

function isZoomShortcutInput(input) {
  if (!input || input.type !== 'keyDown' || !(input.control || input.meta)) return false;
  const key = String(input.key || '').toLowerCase();
  const code = String(input.code || '');
  return key === '+' || key === '=' || key === '-' || key === '_' || key === '0'
    || code === 'Equal' || code === 'Minus' || code === 'NumpadAdd'
    || code === 'NumpadSubtract' || code === 'Digit0' || code === 'Numpad0';
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.__mineradioIntentionalHide = false;
  markMainWindowExpectedVisible(mainWindow, true, 'focus-main-window');
  const desktopMode = fullDesktopModeRuntime.getStatus('focus-main-window');
  if (desktopMode.enabled === true) {
    setFullDesktopModeInteractive(true, 'focus-main-window').catch((error) => {
      console.warn('[FullDesktopMode] focus failed:', error && error.message || error);
    });
    return true;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  resetMainWindowZoom();
  mainWindow.focus();
  sendWindowState(mainWindow);
  return true;
}

function createOrUpdateTray() {
  if (process.platform !== 'win32' && process.platform !== 'linux') return;
  if (!tray) {
    try {
      tray = new Tray(APP_ICON_ICO);
      tray.setToolTip(APP_NAME);
      tray.on('click', () => focusMainWindow());
      tray.on('double-click', () => focusMainWindow());
    } catch (e) {
      console.warn('Tray init failed:', e.message);
      tray = null;
      return;
    }
  }
  const desktopMode = fullDesktopModeRuntime.getStatus('tray-menu');
  const menu = Menu.buildFromTemplate([
    { label: `显示 ${APP_NAME}`, click: () => focusMainWindow() },
    {
      label: '退出完整桌面模式',
      visible: desktopMode.enabled === true,
      click: () => disableFullDesktopMode('tray-exit-desktop-mode').catch((error) => {
        console.warn('[FullDesktopMode] tray exit failed:', error && error.message || error);
      }),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        appQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function ensureFullDesktopModeRecoveryTray() {
  if (tray) {
    createOrUpdateTray();
    return true;
  }
  createOrUpdateTray();
  if (!tray) return false;
  return true;
}

function releaseFullDesktopModeRecoveryTray() {
  if (fullDesktopModeRuntime.getStatus('release-recovery-tray').enabled === true) return false;
  if (closeBehavior === 'tray') {
    if (tray) createOrUpdateTray();
    return false;
  }
  if (tray) {
    try { tray.destroy(); } catch (_) {}
    tray = null;
  }
  return true;
}

function startupErrorText(error) {
  if (!error) return 'UNKNOWN_ERROR';
  if (typeof error === 'string') return error;
  return String(error.stack || error.message || error);
}

function resolveStartupErrorCode(context, error) {
  const text = `${context || ''}\n${startupErrorText(error)}`;
  if (/EADDRINUSE|address already in use|listen EADDRINUSE|端口/i.test(text)) return 'MR-BOOT-SERVER-PORT';
  if (/waitForServer|server|ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(text)) return 'MR-BOOT-SERVER-START';
  if (/loadURL|ERR_FAILED|ERR_ABORTED|navigation|did-fail-load/i.test(text)) return 'MR-BOOT-WINDOW-LOAD';
  if (/ReferenceError|TypeError|is not defined|Cannot read/i.test(text)) return 'MR-BOOT-MAIN-RUNTIME';
  if (/EPERM|EACCES|access is denied|permission/i.test(text)) return 'MR-BOOT-PERMISSION';
  if (/gpu|angle|d3d|webgl/i.test(text)) return 'MR-BOOT-GPU';
  if (/second/i.test(context || '')) return 'MR-BOOT-SECOND-INSTANCE';
  if (/activate/i.test(context || '')) return 'MR-BOOT-ACTIVATE';
  return 'MR-BOOT-MAIN';
}

function startupErrorLogPath() {
  try {
    return path.join(app.getPath('userData'), STARTUP_ERROR_LOG_FILE);
  } catch (_) {
    return path.join(__dirname, '..', STARTUP_ERROR_LOG_FILE);
  }
}

function writeStartupState(phase, detail = {}) {
  try {
    const now = Date.now();
    startupState = {
      ...startupState,
      ...detail,
      pid: process.pid,
      phase: String(phase || 'unknown'),
      updatedAt: now,
      events: (startupState.events || []).concat({ phase: String(phase || 'unknown'), at: now, ...detail }).slice(-32),
    };
    const file = path.join(app.getPath('userData'), STARTUP_STATE_FILE);
    const tempFile = `${file}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tempFile, JSON.stringify(startupState, null, 2), 'utf8');
    fs.renameSync(tempFile, file);
    return true;
  } catch (error) {
    console.warn('[StartupState] write skipped:', error.message);
    return false;
  }
}

function writeStartupErrorLog(context, code, error) {
  const file = startupErrorLogPath();
  const detail = startupErrorText(error);
  const reportId = crypto.createHash('sha1')
    .update(`${Date.now()}:${code}:${context}:${detail}`)
    .digest('hex')
    .slice(0, 10)
    .toUpperCase();
  const payload = [
    '============================================================',
    `time=${new Date().toISOString()}`,
    `reportId=${reportId}`,
    `code=${code}`,
    `context=${context || 'unknown'}`,
    `app=${APP_NAME}`,
    `version=${APP_PACKAGE_INFO.version || ''}`,
    `platform=${process.platform}`,
    `arch=${process.arch}`,
    `pid=${process.pid}`,
    `userData=${(() => { try { return app.getPath('userData'); } catch (_) { return ''; } })()}`,
    '',
    detail,
    '',
  ].join('\n');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, payload, 'utf8');
  } catch (e) {
    console.warn('[StartupError] log write failed:', e.message);
  }
  return { file, reportId };
}

function startupStageLabel(context) {
  const value = String(context || '').toLowerCase();
  if (value.includes('second')) return '重复启动/唤醒已有窗口';
  if (value.includes('activate')) return '系统激活/恢复窗口';
  if (value.includes('server')) return '本地服务启动';
  if (value.includes('load')) return '主窗口加载';
  return '主窗口创建';
}

function buildStartupErrorMessage(context, code, logInfo, error) {
  const detail = startupErrorText(error);
  const reason = String((error && error.message) || error || '未知错误').split(/\r?\n/)[0].slice(0, 360);
  return [
    `错误代码：${code}`,
    `报告编号：${logInfo.reportId}`,
    `启动阶段：${startupStageLabel(context)}`,
    `简短原因：${reason || '未知错误'}`,
    '',
    '请把错误代码和报告编号发给开发者。',
    `日志文件：${logInfo.file}`,
    '',
    '详细信息：',
    detail.slice(0, 1400),
  ].join('\n');
}

function reportWindowCreationFailure(context, error) {
  const code = resolveStartupErrorCode(context, error);
  const logInfo = writeStartupErrorLog(context, code, error);
  writeStartupState('failed', { context: String(context || ''), code, error: startupErrorText(error).slice(0, 1200) });
  console.error(`[${code}] ${context} window creation failed:`, error);
  if (!startupErrorReported) {
    startupErrorReported = true;
    try {
      // Keep this literal visible for startup dialog regression checks:
      // dialog.showErrorBox('Mineradio 启动失败'
      dialog.showErrorBox(`Mineradio 启动失败 (${code})`, buildStartupErrorMessage(context, code, logInfo, error));
    } catch (_) {}
  }
  if (!startupCompleted) {
    // Never leave an invisible BrowserWindow holding the single-instance lock.
    // The previous behavior kept a failed show:false window alive forever.
    const failedWindow = mainWindow;
    mainWindow = null;
    if (failedWindow && !failedWindow.isDestroyed()) {
      try { failedWindow.destroy(); } catch (_) {}
    }
    setImmediate(() => app.quit());
  }
}

function bindStartupFailureHandlers() {
  process.on('uncaughtException', (error) => {
    if (startupCompleted) {
      console.error('[UncaughtException]', error);
      return;
    }
    reportWindowCreationFailure('Uncaught exception', error);
  });
  process.on('unhandledRejection', (reason) => {
    if (startupCompleted) {
      console.error('[UnhandledRejection]', reason);
      return;
    }
    reportWindowCreationFailure('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)));
  });
}

bindStartupFailureHandlers();

function shouldEnsureDesktopShortcut() {
  if (process.platform !== 'win32') return false;
  if (process.env.MINERADIO_NO_DESKTOP_SHORTCUT === '1') return false;
  return app.isPackaged || process.env.MINERADIO_CREATE_DESKTOP_SHORTCUT === '1';
}

function ensureDesktopShortcut() {
  if (!shouldEnsureDesktopShortcut()) return { ok: false, skipped: true };
  try {
    const shortcutPath = path.join(app.getPath('desktop'), `${APP_NAME}.lnk`);
    const target = process.execPath;
    const shortcut = {
      target,
      cwd: path.dirname(target),
      args: '',
      description: `${APP_NAME} desktop music player`,
      icon: fs.existsSync(APP_ICON_ICO) ? APP_ICON_ICO : target,
      iconIndex: 0,
      appUserModelId: APP_USER_MODEL_ID,
    };

    if (fs.existsSync(shortcutPath) && shell.readShortcutLink) {
      try {
        const existing = shell.readShortcutLink(shortcutPath);
        if (existing && path.resolve(existing.target || '') === path.resolve(target) && String(existing.args || '') === '') {
          return { ok: true, path: shortcutPath, existing: true };
        }
      } catch (_) {}
      shell.writeShortcutLink(shortcutPath, 'replace', shortcut);
    } else {
      shell.writeShortcutLink(shortcutPath, 'create', shortcut);
    }
    return { ok: true, path: shortcutPath, created: true };
  } catch (e) {
    console.warn('Desktop shortcut creation skipped:', e.message);
    return { ok: false, error: e.message || 'DESKTOP_SHORTCUT_FAILED' };
  }
}

function parseCookieHeader(cookieText) {
  const out = {};
  String(cookieText || '').split(';').forEach((part) => {
    const raw = String(part || '').trim();
    if (!raw) return;
    const idx = raw.indexOf('=');
    if (idx <= 0) return;
    out[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
  });
  return out;
}

function qqCookieHasLogin(cookieText) {
  const obj = parseCookieHeader(cookieText);
  const isWechat = !!obj.wxopenid || Number(obj.login_type) === 2;
  const rawUin = isWechat
    ? (obj.wxuin || obj.uin || obj.p_uin || '')
    : (obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin || '');
  const uin = String(rawUin).replace(/\D/g, '');
  const musicKey = obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.p_skey || obj.skey ||
    obj.psrf_qqaccess_token || obj.psrf_qqrefresh_token || obj.wxrefresh_token || obj.wxskey || '';
  return !!(uin && musicKey);
}

function qqCookieHasPlaybackLogin(cookieText) {
  const obj = parseCookieHeader(cookieText);
  const isWechat = !!obj.wxopenid || Number(obj.login_type) === 2;
  const rawUin = isWechat
    ? (obj.wxuin || obj.uin || obj.p_uin || '')
    : (obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin || '');
  const uin = String(rawUin).replace(/\D/g, '');
  const playbackKey = obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || '';
  return !!(uin && playbackKey);
}

function isTrustedQQLoginUrl(targetUrl) {
  try {
    const parsed = new URL(String(targetUrl || ''));
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    return [
      'qq.com',
      'tencent.com',
      'qqmusic.com',
      'gtimg.com',
      'qpic.cn',
      'weixin.qq.com',
    ].some(domain => hostname === domain || hostname.endsWith('.' + domain));
  } catch (_) {
    return false;
  }
}

function qqLoginCompletionFromCookie(cookieText) {
  if (qqCookieHasPlaybackLogin(cookieText)) {
    return { ok: true, cookie: cookieText };
  }
  if (qqCookieHasLogin(cookieText)) {
    return {
      ok: false,
      partial: true,
      error: 'QQ_PLAYBACK_AUTH_INCOMPLETE',
      message: 'QQ 账号验证已完成，但 QQ 音乐播放授权尚未生成，请在官方登录窗口完成授权后再关闭',
    };
  }
  return { ok: false, cancelled: true, message: 'QQ 登录窗口已关闭' };
}

function neteaseCookieHasLogin(cookieText) {
  const obj = parseCookieHeader(cookieText);
  return !!obj.MUSIC_U;
}

function isQQCookieDomain(domain) {
  const normalized = String(domain || '').replace(/^\./, '').toLowerCase();
  return normalized === 'qq.com' || normalized.endsWith('.qq.com') || normalized.endsWith('qqmusic.qq.com');
}

function isNeteaseCookieDomain(domain) {
  const normalized = String(domain || '').replace(/^\./, '').toLowerCase();
  return normalized === '163.com' || normalized.endsWith('.163.com') ||
    normalized === 'music.163.com' || normalized.endsWith('.music.163.com') ||
    normalized === 'netease.com' || normalized.endsWith('.netease.com');
}

function isKugouCookieDomain(domain) {
  const normalized = String(domain || '').replace(/^\./, '').toLowerCase();
  return normalized === 'kugou.com' || normalized.endsWith('.kugou.com');
}

function kugouCookieHasLogin(cookieText) {
  return extractKugouAuth(cookieText).loggedIn;
}

function kugouCookieHasPlayback(cookieText) {
  return extractKugouAuth(cookieText).playbackReady;
}

function cookieIsExpired(cookie, nowSeconds) {
  const expires = Number(cookie && cookie.expirationDate);
  return Number.isFinite(expires) && expires > 0 && expires <= nowSeconds;
}

function qqLoginCookieCandidateScore(cookie) {
  const domain = String(cookie && cookie.domain || '').replace(/^\./, '').toLowerCase();
  const pathName = String(cookie && cookie.path || '/');
  let score = 0;
  if (domain === 'y.qq.com' || domain.endsWith('.y.qq.com')) score += 400;
  else if (domain === 'qqmusic.qq.com' || domain.endsWith('.qqmusic.qq.com')) score += 360;
  else if (domain === 'qq.com') score += 240;
  else if (domain.endsWith('.qq.com')) score += 160;
  if (pathName === '/') score += 40;
  if (cookie && cookie.secure) score += 10;
  if (cookie && cookie.hostOnly) score += 5;
  const expires = Number(cookie && cookie.expirationDate);
  if (Number.isFinite(expires) && expires > Date.now() / 1000) score += Math.min(20, Math.floor((expires - Date.now() / 1000) / 86400));
  return score;
}

function buildCookieHeaderFor(cookies, isAllowedDomain, priority, candidateScore) {
  const picked = new Map();
  const nowSeconds = Date.now() / 1000;
  (cookies || []).forEach((cookie) => {
    if (!cookie || !cookie.name || !isAllowedDomain(cookie.domain) || cookieIsExpired(cookie, nowSeconds)) return;
    const score = typeof candidateScore === 'function' ? Number(candidateScore(cookie)) || 0 : 0;
    const previous = picked.get(cookie.name);
    const expirationDate = Number(cookie.expirationDate) || 0;
    const tieKey = [cookie.domain || '', cookie.path || '', cookie.value || ''].join('\n');
    if (
      !previous ||
      score > previous.score ||
      (score === previous.score && expirationDate > previous.expirationDate) ||
      (score === previous.score && expirationDate === previous.expirationDate && tieKey > previous.tieKey)
    ) {
      picked.set(cookie.name, { value: cookie.value || '', score, expirationDate, tieKey });
    }
  });

  const ordered = [];
  (priority || []).forEach((name) => {
    if (picked.has(name)) {
      ordered.push([name, picked.get(name).value]);
      picked.delete(name);
    }
  });
  picked.forEach((entry, name) => ordered.push([name, entry.value]));

  return ordered
    .filter(([name, value]) => name && value != null && String(value) !== '')
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function buildCookieHeader(cookies) {
  return buildCookieHeaderFor(cookies, isQQCookieDomain, QQ_LOGIN_COOKIE_PRIORITY, qqLoginCookieCandidateScore);
}

async function readQQLoginCookieHeader(cookieSession) {
  const cookies = await cookieSession.cookies.get({});
  return buildCookieHeader(cookies);
}

async function readNeteaseLoginCookieHeader(cookieSession) {
  const cookies = await cookieSession.cookies.get({});
  return buildCookieHeaderFor(cookies, isNeteaseCookieDomain, NETEASE_LOGIN_COOKIE_PRIORITY);
}

async function readKugouLoginCookieHeader(cookieSession) {
  const cookies = await cookieSession.cookies.get({});
  return buildCookieHeaderFor(cookies, isKugouCookieDomain, KUGOU_LOGIN_COOKIE_PRIORITY);
}

async function openNeteaseMusicLoginWindow(owner) {
  const cookieSession = session.fromPartition(NETEASE_LOGIN_PARTITION);
  const initialCookie = await readNeteaseLoginCookieHeader(cookieSession);
  if (neteaseCookieHasLogin(initialCookie)) return { ok: true, cookie: initialCookie, reused: true };

  return new Promise((resolve) => {
    let settled = false;
    let pollTimer = null;

    const loginWindow = new BrowserWindow({
      width: 940,
      height: 760,
      minWidth: 780,
      minHeight: 580,
      parent: owner && !owner.isDestroyed() ? owner : undefined,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      title: '网易云音乐登录',
      backgroundColor: '#111111',
      icon: APP_ICON_ICO,
      webPreferences: {
        partition: NETEASE_LOGIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close();
      }
      resolve(result);
    };

    const checkCookies = async () => {
      try {
        const cookie = await readNeteaseLoginCookieHeader(cookieSession);
        if (neteaseCookieHasLogin(cookie)) {
          finish({ ok: true, cookie });
        }
      } catch (e) {
        console.warn('Netease login cookie check failed:', e.message);
      }
    };

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\/([^/]+\.)?(163|music\.163|netease)\.com/i.test(url)) {
        loginWindow.loadURL(url).catch((e) => console.warn('Netease login popup navigation failed:', e.message));
      } else if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url).catch(() => {});
      }
      return { action: 'deny' };
    });

    loginWindow.webContents.on('did-finish-load', () => {
      checkCookies();
      loginWindow.webContents.executeJavaScript(`
        setTimeout(() => {
          const docs = [document];
          document.querySelectorAll('iframe').forEach((frame) => {
            try { if (frame.contentDocument) docs.push(frame.contentDocument); } catch (_) {}
          });
          for (const doc of docs) {
            const nodes = Array.from(doc.querySelectorAll('a, button, span, div'));
            const loginNode = nodes.find((node) => {
              const text = (node.textContent || '').trim();
              if (!/登录|立即登录/.test(text)) return false;
              const rect = node.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
            if (loginNode) { loginNode.click(); return true; }
          }
          return false;
        }, 900);
      `, true).catch(() => {});
    });

    loginWindow.on('ready-to-show', () => loginWindow.show());
    loginWindow.on('closed', async () => {
      if (settled) return;
      if (pollTimer) clearInterval(pollTimer);
      try {
        const cookie = await readNeteaseLoginCookieHeader(cookieSession);
        resolve(neteaseCookieHasLogin(cookie)
          ? { ok: true, cookie }
          : { ok: false, cancelled: true, message: '网易云登录窗口已关闭' });
      } catch (e) {
        resolve({ ok: false, error: e.message || '网易云登录窗口已关闭' });
      }
    });

    pollTimer = setInterval(checkCookies, 1200);
    loginWindow.loadURL(NETEASE_LOGIN_URL).catch((e) => finish({ ok: false, error: e.message }));
  });
}

async function openQQMusicLoginWindow(owner, options) {
  options = options || {};
  const cookieSession = session.fromPartition(QQ_LOGIN_PARTITION);
  const initialCookie = await readQQLoginCookieHeader(cookieSession);
  if (qqCookieHasPlaybackLogin(initialCookie)) {
    return { ok: true, cookie: initialCookie, reused: true, recovered: !!options.forceReauth };
  }
  if (options.forceReauth) {
    await cookieSession.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    let pollTimer = null;
    let warmupTimer = null;
    let warmupWindow = null;
    let playbackFinalizePending = false;
    let showWatchdog = null;
    const popupWindows = new Set();

    const loginWindow = new BrowserWindow({
      width: 900,
      height: 720,
      minWidth: 760,
      minHeight: 560,
      parent: owner && !owner.isDestroyed() ? owner : undefined,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      title: 'QQ 音乐登录',
      backgroundColor: '#111111',
      icon: APP_ICON_ICO,
      webPreferences: {
        partition: QQ_LOGIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const closeAuxiliaryWindows = () => {
      if (showWatchdog) {
        clearTimeout(showWatchdog);
        showWatchdog = null;
      }
      if (warmupTimer) {
        clearTimeout(warmupTimer);
        warmupTimer = null;
      }
      const windows = Array.from(popupWindows);
      popupWindows.clear();
      if (warmupWindow) windows.push(warmupWindow);
      warmupWindow = null;
      windows.forEach((win) => {
        try {
          if (win && !win.isDestroyed()) win.close();
        } catch (_) {}
      });
    };

    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      closeAuxiliaryWindows();
      try { await cookieSession.flushStorageData(); } catch (_) {}
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close();
      }
      resolve(result);
    };

    const showLoginWindow = () => {
      if (settled || !loginWindow || loginWindow.isDestroyed() || loginWindow.isVisible()) return;
      loginWindow.show();
      loginWindow.focus();
    };

    const loadQQOfficialLoginEntry = async () => {
      try {
        await loginWindow.loadURL(QQ_LOGIN_URL);
      } catch (firstError) {
        const message = String(firstError && firstError.message || firstError || '');
        if (/HTTP2|PROTOCOL_ERROR|ERR_FAILED/i.test(message)) {
          try { await cookieSession.clearCache(); } catch (_) {}
        }
        console.warn('QQ profile login entry failed, retrying official homepage:', message);
        await loginWindow.loadURL(QQ_LOGIN_FALLBACK_URL);
      }
    };

    const schedulePlaybackWarmup = () => {
      if (settled || warmupTimer || warmupWindow) return;
      // Give the official OAuth callback enough time to exchange the generic
      // QQ web session for qm_keyst/qqmusic_key. The fallback player page runs
      // in a separate hidden WebContents so it can never replace that callback.
      warmupTimer = setTimeout(() => {
        warmupTimer = null;
        if (settled || !loginWindow || loginWindow.isDestroyed()) return;
        warmupWindow = new BrowserWindow({
          width: 720,
          height: 520,
          parent: loginWindow,
          modal: false,
          show: false,
          autoHideMenuBar: true,
          backgroundColor: '#111111',
          icon: APP_ICON_ICO,
          webPreferences: {
            partition: QQ_LOGIN_PARTITION,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });
        warmupWindow.on('closed', () => {
          warmupWindow = null;
        });
        warmupWindow.webContents.on('did-finish-load', checkCookies);
        warmupWindow.loadURL('https://y.qq.com/n/ryqq/player')
          .catch((e) => console.warn('QQ login warmup navigation failed:', e.message));
      }, 5000);
    };

    const checkCookies = async () => {
      try {
        const cookie = await readQQLoginCookieHeader(cookieSession);
        if (qqCookieHasPlaybackLogin(cookie)) {
          if (playbackFinalizePending) return;
          playbackFinalizePending = true;
          // QQ writes the playback ticket and profile/refresh cookies in a
          // short burst. Keep the official callback alive for one final read.
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 450));
          const finalizedCookie = await readQQLoginCookieHeader(cookieSession);
          await finish({
            ok: true,
            cookie: qqCookieHasPlaybackLogin(finalizedCookie) ? finalizedCookie : cookie,
          });
        } else if (qqCookieHasLogin(cookie)) {
          schedulePlaybackWarmup();
        }
      } catch (e) {
        if (!settled) playbackFinalizePending = false;
        console.warn('QQ login cookie check failed:', e.message);
      }
    };

    const installQQLoginWindowHandlers = (win, isRoot) => {
      if (!win || win.isDestroyed()) return;
      win.webContents.setWindowOpenHandler(({ url }) => {
        if (isTrustedQQLoginUrl(url)) {
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              width: 760,
              height: 640,
              parent: loginWindow,
              modal: false,
              show: true,
              autoHideMenuBar: true,
              backgroundColor: '#111111',
              icon: APP_ICON_ICO,
              webPreferences: {
                partition: QQ_LOGIN_PARTITION,
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
              },
            },
          };
        }
        if (/^https?:\/\//i.test(String(url || ''))) {
          shell.openExternal(url).catch(() => {});
        }
        return { action: 'deny' };
      });
      win.webContents.on('did-create-window', (child) => {
        popupWindows.add(child);
        child.on('closed', () => popupWindows.delete(child));
        installQQLoginWindowHandlers(child, false);
      });
      if (!isRoot) win.webContents.on('did-finish-load', checkCookies);
    };
    installQQLoginWindowHandlers(loginWindow, true);

    loginWindow.webContents.on('did-finish-load', () => {
      checkCookies();
      showLoginWindow();
      loginWindow.webContents.executeJavaScript(`
        setTimeout(() => {
          const nodes = Array.from(document.querySelectorAll('a, button, span, div'));
          const loginNode = nodes.find((node) => {
            const text = (node.textContent || '').trim();
            if (!/登录|登陆/.test(text)) return false;
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          if (loginNode) loginNode.click();
        }, 700);
      `, true).catch(() => {});
    });

    loginWindow.on('ready-to-show', showLoginWindow);
    loginWindow.on('closed', async () => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      closeAuxiliaryWindows();
      try {
        const cookie = await readQQLoginCookieHeader(cookieSession);
        try { await cookieSession.flushStorageData(); } catch (_) {}
        resolve(qqLoginCompletionFromCookie(cookie));
      } catch (e) {
        resolve({ ok: false, error: e.message || 'QQ 登录窗口已关闭' });
      }
    });

    pollTimer = setInterval(checkCookies, 1200);
    showWatchdog = setTimeout(showLoginWindow, 2500);
    loadQQOfficialLoginEntry().catch((e) => finish({ ok: false, error: e.message }));
  });
}

async function clearQQMusicLoginSession() {
  const cookieSession = session.fromPartition(QQ_LOGIN_PARTITION);
  await cookieSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
  });
  return { ok: true };
}

async function openKugouMusicLoginWindow(owner, options) {
  options = options && typeof options === 'object' ? options : {};
  const cookieSession = session.fromPartition(KUGOU_LOGIN_PARTITION);
  // Explicit re-login must discard the revoked session before considering reuse.
  // Cookie presence alone cannot establish whether the server still accepts it.
  if (options.forceReauth === true) {
    await cookieSession.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
    });
  }
  const initialCookie = await readKugouLoginCookieHeader(cookieSession);
  if (kugouCookieHasPlayback(initialCookie)) return { ok: true, cookie: initialCookie, reused: true };

  return new Promise((resolve) => {
    let settled = false;
    let pollTimer = null;
    let warmupStarted = false;

    const loginWindow = new BrowserWindow({
      width: 900,
      height: 720,
      minWidth: 760,
      minHeight: 560,
      parent: owner && !owner.isDestroyed() ? owner : undefined,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      title: '酷狗音乐登录',
      backgroundColor: '#111111',
      icon: APP_ICON_ICO,
      webPreferences: {
        partition: KUGOU_LOGIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
      resolve(result);
    };

    const checkCookies = async () => {
      try {
        const cookie = await readKugouLoginCookieHeader(cookieSession);
        if (kugouCookieHasPlayback(cookie)) {
          finish({ ok: true, cookie });
        } else if (kugouCookieHasLogin(cookie) && !warmupStarted) {
          warmupStarted = true;
          setTimeout(() => {
            if (!settled && loginWindow && !loginWindow.isDestroyed()) {
              loginWindow.loadURL(KUGOU_LOGIN_WARMUP_URL).catch((e) => console.warn('Kugou login warmup navigation failed:', e.message));
            }
          }, 900);
        }
      } catch (e) {
        console.warn('Kugou login cookie check failed:', e.message);
      }
    };

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        loginWindow.loadURL(url).catch((e) => console.warn('Kugou login popup navigation failed:', e.message));
      } else {
        shell.openExternal(url).catch(() => {});
      }
      return { action: 'deny' };
    });

    loginWindow.webContents.on('did-finish-load', () => {
      checkCookies();
      loginWindow.webContents.executeJavaScript(`
        setTimeout(() => {
          const nodes = Array.from(document.querySelectorAll('a, button, span, div'));
          const loginNode = nodes.find((node) => {
            const text = (node.textContent || '').trim();
            if (!/登录|登陆/.test(text)) return false;
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          if (loginNode) loginNode.click();
        }, 700);
      `, true).catch(() => {});
    });

    loginWindow.on('ready-to-show', () => loginWindow.show());
    loginWindow.on('closed', async () => {
      if (settled) return;
      if (pollTimer) clearInterval(pollTimer);
      try {
        const cookie = await readKugouLoginCookieHeader(cookieSession);
        resolve(kugouCookieHasPlayback(cookie)
          ? { ok: true, cookie }
          : (kugouCookieHasLogin(cookie)
            ? { ok: true, cookie, partial: true, message: '酷狗账号已登录，但播放 token 不完整，请稍后在播放器内重试登录' }
            : { ok: false, cancelled: true, message: '酷狗登录窗口已关闭' }));
      } catch (e) {
        resolve({ ok: false, error: e.message || '酷狗登录窗口已关闭' });
      }
    });

    pollTimer = setInterval(checkCookies, 1200);
    loginWindow.loadURL(KUGOU_LOGIN_URL).catch((e) => finish({ ok: false, error: e.message }));
  });
}

async function clearKugouMusicLoginSession() {
  const cookieSession = session.fromPartition(KUGOU_LOGIN_PARTITION);
  await cookieSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
  });
  return { ok: true };
}

async function clearNeteaseMusicLoginSession() {
  const cookieSession = session.fromPartition(NETEASE_LOGIN_PARTITION);
  await cookieSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
  });
  return { ok: true };
}

async function clearQishuiMusicLoginSession() {
  const qishuiQrLogin = require('../qishui-qr-login');
  await qishuiQrLogin.clear();
  for (const filePath of [process.env.QISHUI_COOKIE_FILE, process.env.QISHUI_TOKEN_FILE]) {
    if (!filePath) continue;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, '', 'utf8');
    } catch (error) {
      console.warn('[QishuiQrLogin] credential file clear failed:', error && error.message || error);
      throw error;
    }
  }
  return { ok: true };
}

function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createSpotifyPkcePair() {
  const codeVerifier = base64Url(crypto.randomBytes(48));
  const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

function spotifyOAuthRedirectMatches(targetUrl, redirectUri) {
  try {
    const target = new URL(String(targetUrl || ''));
    const redirect = new URL(String(redirectUri || ''));
    const normalizePath = (value) => (value || '/').replace(/\/+$/, '') || '/';
    return target.protocol === redirect.protocol &&
      target.host === redirect.host &&
      normalizePath(target.pathname) === normalizePath(redirect.pathname);
  } catch (e) {
    return false;
  }
}

function spotifyOAuthResultHtml(ok, message) {
  const escaped = String(message || '').replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
  return [
    '<!doctype html><meta charset="utf-8">',
    '<title>Spotify Login</title>',
    '<style>',
    'html,body{margin:0;height:100%;background:#101414;color:#f3fff6;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
    'body{display:grid;place-items:center;}',
    'main{max-width:520px;padding:30px;text-align:center;}',
    '.brand{font-size:12px;letter-spacing:.24em;color:#1ed760;font-weight:900;margin-bottom:14px;}',
    'h1{font-size:26px;margin:0 0 12px;font-weight:850;}',
    'p{margin:0 auto;color:rgba(243,255,246,.72);line-height:1.7;font-size:14px;}',
    '</style>',
    '<main><div class="brand">SPOTIFY</div><h1>' + (ok ? '授权完成' : '授权失败') + '</h1><p>' + escaped + '</p></main>',
  ].join('');
}

function startSpotifyOAuthCallbackServer(redirectUri, onCallback) {
  return new Promise((resolve, reject) => {
    let redirect = null;
    try {
      redirect = new URL(String(redirectUri || ''));
    } catch (e) {
      reject(Object.assign(new Error('SPOTIFY_REDIRECT_URI_INVALID'), { code: 'SPOTIFY_REDIRECT_URI_INVALID' }));
      return;
    }
    const redirectHost = String(redirect.hostname || '').toLowerCase();
    if (redirect.protocol !== 'http:' || (redirectHost !== '127.0.0.1' && redirectHost !== '::1' && redirectHost !== '[::1]')) {
      reject(Object.assign(new Error('SPOTIFY_REDIRECT_URI_MUST_BE_HTTP_LOCALHOST'), { code: 'SPOTIFY_REDIRECT_URI_MUST_BE_HTTP_LOCALHOST' }));
      return;
    }
    const port = Number(redirect.port || 80);
    const host = redirect.hostname || '127.0.0.1';
    const normalizePath = (value) => (value || '/').replace(/\/+$/, '') || '/';
    const expectedPath = normalizePath(redirect.pathname);
    const callbackServer = http.createServer(async (req, res) => {
      let current = null;
      try {
        current = new URL(req.url || '/', redirect.origin);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad callback URL');
        return;
      }
      if (normalizePath(current.pathname) !== expectedPath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
      try {
        const result = await onCallback(current);
        const ok = !!(result && result.ok);
        res.writeHead(ok ? 200 : 500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(spotifyOAuthResultHtml(ok, (result && (result.message || result.error)) || (ok ? '可以回到 Mineradio。' : '请回到 Mineradio 重新尝试。')));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(spotifyOAuthResultHtml(false, e && e.message || 'SPOTIFY_OAUTH_CALLBACK_FAILED'));
      }
    });
    callbackServer.once('error', (err) => {
      const code = err && err.code === 'EADDRINUSE' ? 'SPOTIFY_CALLBACK_PORT_BUSY' : (err && err.code || 'SPOTIFY_CALLBACK_SERVER_FAILED');
      reject(Object.assign(new Error(code), { code, cause: err }));
    });
    callbackServer.listen(port, host, () => {
      resolve({
        server: callbackServer,
        close: () => {
          try { callbackServer.close(); } catch (_) {}
        },
      });
    });
  });
}

async function verifySpotifyOAuthCallbackEndpoint() {
  const config = getSpotifyOAuthConfig();
  if (!config.configured) {
    return {
      ok: false,
      provider: 'spotify',
      error: 'SPOTIFY_OAUTH_NOT_CONFIGURED',
      missing: config.missing || [],
      redirectUri: config.redirectUri,
      message: !config.clientIdValid
        ? 'Client ID 格式不正确，请重新复制。'
        : '请先保存 Spotify Client ID。',
    };
  }
  let callbackServer = null;
  try {
    callbackServer = await startSpotifyOAuthCallbackServer(config.redirectUri, async () => ({
      ok: false,
      error: 'SPOTIFY_PREFLIGHT_ONLY',
      message: '当前仅执行本机回调检测。',
    }));
    return {
      ok: true,
      provider: 'spotify',
      redirectUri: config.redirectUri,
      callbackReady: true,
      message: '本机回调端口可用。请确认 Spotify Dashboard 中保存了完全相同的地址。',
    };
  } catch (error) {
    const code = error && (error.code || error.message) || 'SPOTIFY_CALLBACK_SERVER_FAILED';
    return {
      ok: false,
      provider: 'spotify',
      error: code,
      redirectUri: config.redirectUri,
      callbackReady: false,
      message: code === 'SPOTIFY_CALLBACK_PORT_BUSY'
        ? '本机 43879 端口被其他程序占用，请关闭占用程序后重试。'
        : '本机回调检测失败：' + code,
    };
  } finally {
    if (callbackServer && typeof callbackServer.close === 'function') callbackServer.close();
  }
}

async function openSpotifyMusicLoginWindow(owner) {
  const config = getSpotifyOAuthConfig();
  if (!config.configured) {
    return {
      ok: false,
      provider: 'spotify',
      error: 'SPOTIFY_OAUTH_NOT_CONFIGURED',
      missing: config.missing,
      redirectUri: config.redirectUri,
      message: 'Spotify 登录需要先配置 SPOTIFY_CLIENT_ID，并在 Spotify Developer Dashboard 登记本地回调地址 ' + config.redirectUri,
    };
  }

  const oauthState = crypto.randomBytes(16).toString('hex');
  const pkce = createSpotifyPkcePair();
  let authUrl = '';
  try {
    authUrl = buildSpotifyOAuthAuthorizeUrl({
      state: oauthState,
      codeChallenge: pkce.codeChallenge,
      redirectUri: config.redirectUri,
      scope: config.scope,
    });
  } catch (e) {
    return {
      ok: false,
      provider: 'spotify',
      error: e.code || e.message,
      missing: e.missing || config.missing,
      message: e.message || 'Spotify 授权地址生成失败',
    };
  }

  return new Promise(async (resolve) => {
    let settled = false;
    let exchangeStarted = false;
    let callbackServer = null;
    let oauthTimeout = null;

    const finish = (result) => {
      if (settled) return result;
      settled = true;
      if (oauthTimeout) clearTimeout(oauthTimeout);
      if (callbackServer && typeof callbackServer.close === 'function') callbackServer.close();
      resolve(result);
      return result;
    };

    const exchangeFromRedirect = async (targetUrl, event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (exchangeStarted) return { ok: true, provider: 'spotify', message: 'Spotify 授权正在处理。' };
      exchangeStarted = true;
      let parsed = null;
      try {
        parsed = targetUrl instanceof URL ? targetUrl : new URL(String(targetUrl || ''));
      } catch (e) {
        return finish({ ok: false, provider: 'spotify', error: 'SPOTIFY_OAUTH_BAD_REDIRECT', message: e.message });
      }
      const returnedState = parsed.searchParams.get('state') || '';
      if (returnedState !== oauthState) {
        return finish({ ok: false, provider: 'spotify', error: 'SPOTIFY_OAUTH_STATE_MISMATCH', message: 'Spotify 授权状态校验失败，请重新登录。' });
      }
      const oauthError = parsed.searchParams.get('error') || '';
      if (oauthError) {
        return finish({
          ok: false,
          provider: 'spotify',
          error: oauthError,
          message: parsed.searchParams.get('error_description') || 'Spotify 授权已取消或失败。',
        });
      }
      const code = parsed.searchParams.get('code') || '';
      if (!code) {
        return finish({ ok: false, provider: 'spotify', error: 'SPOTIFY_OAUTH_CODE_MISSING', message: 'Spotify 回调没有返回 code。' });
      }
      try {
        const info = await exchangeSpotifyOAuthCode({
          code,
          codeVerifier: pkce.codeVerifier,
          redirectUri: config.redirectUri,
        });
        return finish(Object.assign({ ok: true, provider: 'spotify', opened: true }, info || {}, {
          redirectUri: config.redirectUri,
          message: 'Spotify 登录成功，会员状态、歌单和 Liked Songs 已可同步。',
        }));
      } catch (e) {
        return finish({
          ok: false,
          provider: 'spotify',
          error: e.code || e.message || 'SPOTIFY_OAUTH_EXCHANGE_FAILED',
          message: e.message || 'Spotify token 换取失败。',
          missing: e.missing || [],
        });
      }
    };

    try {
      callbackServer = await startSpotifyOAuthCallbackServer(config.redirectUri, exchangeFromRedirect);
    } catch (e) {
      resolve({
        ok: false,
        provider: 'spotify',
        error: e.code || e.message || 'SPOTIFY_CALLBACK_SERVER_FAILED',
        redirectUri: config.redirectUri,
        message: (e.code || e.message) === 'SPOTIFY_CALLBACK_PORT_BUSY'
          ? 'Spotify 本地回调端口被占用，请关闭占用 43879 端口的程序后重试。'
          : 'Spotify 本地回调端口启动失败：' + (e.message || e.code || ''),
      });
      return;
    }

    oauthTimeout = setTimeout(() => {
      finish({
        ok: false,
        provider: 'spotify',
        error: 'SPOTIFY_OAUTH_TIMEOUT',
        redirectUri: config.redirectUri,
        message: '三分钟内没有收到 Spotify 回调。请确认 Dashboard 回调地址完全一致、App 所有者为 Premium，且当前账号已加入 Users Management。',
      });
    }, SPOTIFY_OAUTH_TIMEOUT_MS);

    try {
      await shell.openExternal(authUrl);
    } catch (error) {
      finish({
        ok: false,
        provider: 'spotify',
        error: error && error.message || 'SPOTIFY_AUTH_BROWSER_OPEN_FAILED',
        redirectUri: config.redirectUri,
        message: '无法打开系统浏览器，请检查 Windows 默认浏览器设置。',
      });
    }
  });
}

async function clearSpotifyMusicLoginSession() {
  const cookieSession = session.fromPartition(SPOTIFY_LOGIN_PARTITION);
  await cookieSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
  });
  clearSpotifyToken();
  return { ok: true, provider: 'spotify' };
}

function loginEasterEggLockedResult() {
  return {
    ok: false,
    unlocked: false,
    error: 'LOGIN_EASTER_EGG_LOCKED',
    message: '请先完成登录彩蛋解锁。',
  };
}

async function initializeLoginEasterEggGate() {
  const status = await loginEasterEggGate.initialize(() => clearAllProviderLoginState('startup-gate'));
  if (status.resetPerformed) {
    console.log('[LoginEasterEgg] first-run login credentials reset', {
      gateVersion: LOGIN_EASTER_EGG_GATE_VERSION,
      ok: status.resetComplete,
      error: status.error || '',
    });
  }
  return status;
}

async function clearAllProviderLoginState(reason) {
  if (localServer && typeof localServer.clearAllLoginCredentials === 'function') {
    const result = localServer.clearAllLoginCredentials(reason || 'login-reset');
    if (!result || result.ok !== true) {
      throw new Error(result && result.error || 'LOCAL_SERVER_LOGIN_STATE_CLEAR_FAILED');
    }
  }
  const results = await Promise.allSettled([
    clearNeteaseMusicLoginSession(),
    clearQQMusicLoginSession(),
    clearKugouMusicLoginSession(),
    clearQishuiMusicLoginSession(),
    clearSpotifyMusicLoginSession(),
  ]);
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
  return { ok: true };
}

function getWindowDisplay(win) {
  if (win && !win.isDestroyed()) {
    try {
      const bounds = win.getBounds();
      if (screen && typeof screen.getDisplayNearestPoint === 'function') {
        return screen.getDisplayNearestPoint({
          x: Math.round(bounds.x + bounds.width / 2),
          y: Math.round(bounds.y + bounds.height / 2),
        });
      }
      return screen.getDisplayMatching(bounds);
    } catch (e) {
      return screen.getPrimaryDisplay();
    }
  }
  return screen.getPrimaryDisplay();
}

function getFullscreenTargetDisplay(win) {
  const displays = screen.getAllDisplays();
  const remembered = displays.find((display) => String(display.id) === String(windowFullscreenDisplayId));
  return remembered || getWindowDisplay(win);
}

function getDisplayArea(display) {
  return (display && (display.workArea || display.bounds)) || screen.getPrimaryDisplay().workArea;
}

function isPortraitDisplayArea(area) {
  return !!(area && area.height > area.width * 1.12);
}

function getAdaptiveWindowMinimumSize(display) {
  const area = getDisplayArea(display);
  const portrait = isPortraitDisplayArea(area);
  const margin = Math.min(WINDOWED_MARGIN, Math.max(8, Math.round(Math.min(area.width, area.height) * 0.04)));
  const availableWidth = Math.max(360, area.width - margin);
  const availableHeight = Math.max(360, area.height - margin);
  return {
    width: Math.round(Math.max(360, Math.min(portrait ? 540 : MIN_WINDOWED_WIDTH, availableWidth))),
    height: Math.round(Math.max(360, Math.min(portrait ? 720 : MIN_WINDOWED_HEIGHT, availableHeight))),
  };
}

function updateMainWindowMinimumSize(win) {
  if (!win || win.isDestroyed()) return;
  const minimum = getAdaptiveWindowMinimumSize(getWindowDisplay(win));
  win.setMinimumSize(minimum.width, minimum.height);
}

function clampBoundsToDisplayArea(bounds, display) {
  const area = getDisplayArea(display);
  const minimum = getAdaptiveWindowMinimumSize(display);
  let width = Math.round(Math.min(Math.max(Number(bounds && bounds.width) || minimum.width, minimum.width), area.width));
  let height = Math.round(Math.min(Math.max(Number(bounds && bounds.height) || minimum.height, minimum.height), area.height));
  width = Math.max(1, Math.min(width, area.width));
  height = Math.max(1, Math.min(height, area.height));
  const maxX = area.x + area.width - width;
  const maxY = area.y + area.height - height;
  const rawX = Number(bounds && bounds.x);
  const rawY = Number(bounds && bounds.y);
  const x = Math.round(Math.max(area.x, Math.min(Number.isFinite(rawX) ? rawX : area.x, maxX)));
  const y = Math.round(Math.max(area.y, Math.min(Number.isFinite(rawY) ? rawY : area.y, maxY)));
  return { x, y, width, height };
}

function ensureMainWindowInsideDisplay(win) {
  if (!win || win.isDestroyed() || win.isFullScreen()) return;
  const display = getWindowDisplay(win);
  updateMainWindowMinimumSize(win);
  const current = win.getBounds();
  const next = clampBoundsToDisplayArea(current, display);
  if (next.x !== current.x || next.y !== current.y || next.width !== current.width || next.height !== current.height) {
    win.setBounds(next, false);
  }
}

function getWindowedBounds(win, displayOverride = null) {
  const display = displayOverride || getWindowDisplay(win);
  const area = getDisplayArea(display);
  const basis = display.bounds || area;
  const portrait = isPortraitDisplayArea(area);
  const margin = Math.min(WINDOWED_MARGIN, Math.max(12, Math.round(Math.min(area.width, area.height) * 0.04)));
  const maxWidth = Math.max(360, area.width - margin);
  const maxHeight = Math.max(360, area.height - margin);
  const minimum = getAdaptiveWindowMinimumSize(display);
  const aspect = portrait ? Math.max(0.52, Math.min(0.82, area.width / Math.max(1, area.height))) : WINDOWED_ASPECT;

  let width;
  let height;

  if (portrait) {
    width = Math.min(maxWidth, Math.round(area.width * 0.92));
    height = Math.round(width / aspect);
    const desiredHeight = Math.min(maxHeight, Math.round(area.height * 0.88));
    if (height > desiredHeight) {
      height = desiredHeight;
      width = Math.round(height * aspect);
    }
  } else {
    width = Math.round(basis.width * WINDOWED_SCALE);
    height = Math.round(width / WINDOWED_ASPECT);
    const scaledHeight = Math.round(basis.height * WINDOWED_SCALE);
    if (height > scaledHeight) {
      height = scaledHeight;
      width = Math.round(height * WINDOWED_ASPECT);
    }
  }

  if (width < minimum.width && maxWidth >= minimum.width) {
    width = minimum.width;
    if (!portrait) height = Math.round(width / WINDOWED_ASPECT);
  }
  if (height < minimum.height && maxHeight >= minimum.height) {
    height = minimum.height;
    if (!portrait) width = Math.round(height * WINDOWED_ASPECT);
  }

  if (width > maxWidth) {
    width = maxWidth;
    if (!portrait) height = Math.round(width / WINDOWED_ASPECT);
  }
  if (height > maxHeight) {
    height = maxHeight;
    if (!portrait) width = Math.round(height * WINDOWED_ASPECT);
  }

  width = Math.round(Math.max(1, Math.min(width, maxWidth)));
  height = Math.round(Math.max(1, Math.min(height, maxHeight)));

  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
  };
}

function applyWindowedBounds(win, displayOverride = null) {
  if (!win || win.isDestroyed()) return;
  setMainWindowFullscreenResizeGuard(win, false);
  if (win.isMaximized()) win.unmaximize();
  updateMainWindowMinimumSize(win);
  win.setBounds(getWindowedBounds(win, displayOverride), false);
  sendWindowState(win);
}

function exitFullscreenToWindow(win) {
  if (!win || win.isDestroyed()) return;
  windowFullscreenActive = false;

  if (!win.isFullScreen()) {
    applyWindowedBounds(win);
    return;
  }

  setMainWindowFullscreenResizeGuard(win, false);
  win.setFullScreen(false);
  // The authoritative leave-full-screen event below restores windowed bounds.
  // Keeping a second delayed apply here creates a move/resize storm and can
  // trigger two native WE rebuilds for one user action.
}

function toggleFullscreen(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isFullScreen() || windowFullscreenActive) {
    exitFullscreenToWindow(win);
    return;
  }
  const display = getWindowDisplay(win);
  const targetBounds = display && display.bounds;
  windowFullscreenDisplayId = display ? display.id : null;
  windowFullscreenActive = true;
  updateMainWindowMinimumSize(win);
  if (targetBounds && targetBounds.width > 0 && targetBounds.height > 0) {
    win.setBounds({
      x: Math.round(targetBounds.x),
      y: Math.round(targetBounds.y),
      width: Math.round(targetBounds.width),
      height: Math.round(targetBounds.height),
    }, false);
  } else {
    ensureMainWindowInsideDisplay(win);
  }
  setMainWindowFullscreenResizeGuard(win, true);
  win.setFullScreen(true);
  sendWindowState(win);
}

function overlayUrl(page) {
  const port = mainServerPort || process.env.PORT || 3000;
  return `http://127.0.0.1:${port}/${page}`;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function desktopLyricsDefaultBounds(payload = desktopLyricsState) {
  const display = desktopLyricsUserBounds
    ? screen.getDisplayMatching(desktopLyricsUserBounds)
    : screen.getPrimaryDisplay();
  const bounds = display.bounds;
  const yRatio = clampNumber(payload.y, 0.08, 0.92, 0.76);
  const width = Math.round(Math.min(Math.max(880, bounds.width * 0.72), bounds.width - 96));
  const height = Math.round(Math.min(Math.max(340, bounds.height * 0.38), 560, bounds.height - 96));
  return {
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: Math.round(bounds.y + bounds.height * yRatio - height / 2),
    width,
    height,
  };
}

function constrainDesktopLyricsBounds(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const area = display.bounds;
  const next = {
    ...bounds,
    width: Math.round(Math.min(Math.max(320, bounds.width), area.width)),
    height: Math.round(Math.min(Math.max(180, bounds.height), area.height)),
  };
  const maxX = area.x + Math.max(0, area.width - next.width);
  const maxY = area.y + Math.max(0, area.height - next.height);
  next.x = Math.round(clampNumber(next.x, area.x, maxX, area.x));
  next.y = Math.round(clampNumber(next.y, area.y, maxY, area.y));
  return next;
}

function setDesktopLyricsBounds(bounds) {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  const nextBounds = constrainDesktopLyricsBounds(bounds);
  const currentBounds = desktopLyricsWindow.getBounds();
  if (
    currentBounds.x === nextBounds.x
    && currentBounds.y === nextBounds.y
    && currentBounds.width === nextBounds.width
    && currentBounds.height === nextBounds.height
  ) {
    return;
  }
  desktopLyricsProgrammaticMove = true;
  desktopLyricsWindow.setBounds(nextBounds, false);
  setTimeout(() => {
    desktopLyricsProgrammaticMove = false;
  }, 120);
}

function rememberDesktopLyricsBounds() {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed() || desktopLyricsProgrammaticMove) return;
  desktopLyricsUserBounds = desktopLyricsWindow.getBounds();
}

function applyDesktopLyricsMouseBehavior() {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  const locked = desktopLyricsState.clickThrough !== false;
  const shouldIgnore = locked || !desktopLyricsPointerCapture;
  if (desktopLyricsMouseIgnored === shouldIgnore) return;
  desktopLyricsMouseIgnored = shouldIgnore;
  desktopLyricsWindow.setIgnoreMouseEvents(shouldIgnore, { forward: true });
}

function desktopLyricsHotBoundsOnScreen() {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return null;
  const winBounds = desktopLyricsWindow.getBounds();
  const rel = desktopLyricsHotBounds;
  if (!rel) return winBounds;
  return {
    x: winBounds.x + rel.left,
    y: winBounds.y + rel.top,
    width: Math.max(1, rel.right - rel.left),
    height: Math.max(1, rel.bottom - rel.top),
  };
}

function pointInBounds(point, bounds) {
  if (!point || !bounds) return false;
  return point.x >= bounds.x
    && point.x <= bounds.x + bounds.width
    && point.y >= bounds.y
    && point.y <= bounds.y + bounds.height;
}

function handleDesktopLyricsGlobalMiddleClick() {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  if (!desktopLyricsState.enabled) return;
  const now = Date.now();
  if (now - desktopLyricsLastMiddleAt < 260) return;
  const point = screen.getCursorScreenPoint();
  if (!pointInBounds(point, desktopLyricsHotBoundsOnScreen())) return;
  desktopLyricsLastMiddleAt = now;
  const nextLocked = desktopLyricsState.clickThrough === false;
  desktopLyricsState = { ...desktopLyricsState, clickThrough: nextLocked };
  desktopLyricsPointerCapture = !nextLocked;
  applyDesktopLyricsMouseBehavior();
  broadcastDesktopLyricsLockState();
}

function startDesktopLyricsMousePoller() {
  if (process.platform !== 'win32' || desktopLyricsMousePoller) return;
  const script = `
$ErrorActionPreference = "SilentlyContinue"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MineradioMousePoll {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
}
"@
$prev = $false
while ($true) {
  $down = (([MineradioMousePoll]::GetAsyncKeyState(4) -band 0x8000) -ne 0)
  if ($down -and -not $prev) {
    [Console]::Out.WriteLine("MMB")
    [Console]::Out.Flush()
  }
  $prev = $down
  Start-Sleep -Milliseconds 24
}
`;
  try {
    desktopLyricsMousePoller = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    desktopLyricsMousePoller.stdout.on('data', (chunk) => {
      desktopLyricsMousePollerBuffer += chunk.toString('utf8');
      const lines = desktopLyricsMousePollerBuffer.split(/\r?\n/);
      desktopLyricsMousePollerBuffer = lines.pop() || '';
      lines.forEach((line) => {
        if (line.trim() === 'MMB') handleDesktopLyricsGlobalMiddleClick();
      });
    });
    desktopLyricsMousePoller.on('exit', () => {
      desktopLyricsMousePoller = null;
      desktopLyricsMousePollerBuffer = '';
    });
    desktopLyricsMousePoller.on('error', () => {
      desktopLyricsMousePoller = null;
      desktopLyricsMousePollerBuffer = '';
    });
  } catch (e) {
    desktopLyricsMousePoller = null;
    desktopLyricsMousePollerBuffer = '';
  }
}

function stopDesktopLyricsMousePoller() {
  if (!desktopLyricsMousePoller) return;
  try {
    desktopLyricsMousePoller.kill();
  } catch (e) {}
  desktopLyricsMousePoller = null;
  desktopLyricsMousePollerBuffer = '';
}

function broadcastDesktopLyricsLockState() {
  const locked = desktopLyricsState.clickThrough !== false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mineradio-desktop-lyrics-lock-state', { locked });
  }
  sendDesktopLyricsState();
}

function broadcastDesktopLyricsEnabledState(enabled) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mineradio-desktop-lyrics-enabled-state', { enabled: !!enabled });
  }
}

function positionDesktopLyricsWindow(payload = desktopLyricsState, options = {}) {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  const shouldUseManualBounds = desktopLyricsUserBounds && !options.force;
  setDesktopLyricsBounds(shouldUseManualBounds ? desktopLyricsUserBounds : desktopLyricsDefaultBounds(payload));
  if (typeof desktopLyricsWindow.setOpacity === 'function') {
    desktopLyricsWindow.setOpacity(clampNumber(payload.opacity, 0.28, 1, 0.92));
  }
}

function sendDesktopLyricsState() {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
  desktopLyricsWindow.webContents.send('mineradio-desktop-lyrics-state', desktopLyricsState);
}

function createDesktopLyricsWindow(payload = {}) {
  const previousY = desktopLyricsState.y;
  const previousOpacity = desktopLyricsState.opacity;
  desktopLyricsState = { ...desktopLyricsState, ...payload, enabled: true };
  const hasY = Object.prototype.hasOwnProperty.call(payload || {}, 'y');
  const nextY = clampNumber(desktopLyricsState.y, 0.08, 0.92, 0.76);
  const yChanged = hasY && Number.isFinite(Number(previousY)) && Math.abs(nextY - clampNumber(previousY, 0.08, 0.92, 0.76)) > 0.001;
  const opacityChanged = Object.prototype.hasOwnProperty.call(payload || {}, 'opacity')
    && Math.abs(clampNumber(desktopLyricsState.opacity, 0.28, 1, 0.92) - clampNumber(previousOpacity, 0.28, 1, 0.92)) > 0.001;
  if (yChanged) desktopLyricsUserBounds = null;
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
    if (yChanged) {
      positionDesktopLyricsWindow(desktopLyricsState, { force: yChanged });
    } else if (opacityChanged && typeof desktopLyricsWindow.setOpacity === 'function') {
      desktopLyricsWindow.setOpacity(clampNumber(desktopLyricsState.opacity, 0.28, 1, 0.92));
    }
    applyDesktopLyricsMouseBehavior();
    sendDesktopLyricsState();
    return desktopLyricsWindow;
  }

  desktopLyricsWindow = new BrowserWindow({
    width: 920,
    height: 190,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    focusable: false,
    skipTaskbar: true,
    show: false,
    title: 'Mineradio Desktop Lyrics',
    webPreferences: {
      preload: path.join(__dirname, 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  try {
    desktopLyricsWindow.setAlwaysOnTop(true, 'screen-saver');
    desktopLyricsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (e) {
    console.warn('Desktop lyrics topmost setup skipped:', e.message);
  }
  startDesktopLyricsMousePoller();
  applyDesktopLyricsMouseBehavior();
  positionDesktopLyricsWindow(desktopLyricsState, { force: yChanged || !desktopLyricsUserBounds });
  desktopLyricsWindow.once('ready-to-show', () => {
    if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return;
    desktopLyricsWindow.showInactive();
    sendDesktopLyricsState();
  });
  desktopLyricsWindow.webContents.once('did-finish-load', sendDesktopLyricsState);
  desktopLyricsWindow.on('closed', () => {
    desktopLyricsWindow = null;
    desktopLyricsMouseIgnored = null;
  });
  desktopLyricsWindow.on('moved', rememberDesktopLyricsBounds);
  desktopLyricsWindow.loadURL(overlayUrl('desktop-lyrics.html')).catch((e) => console.warn('Desktop lyrics load failed:', e.message));
  return desktopLyricsWindow;
}

function closeDesktopLyricsWindow() {
  desktopLyricsState = { ...desktopLyricsState, enabled: false };
  desktopLyricsPointerCapture = false;
  desktopLyricsMouseIgnored = null;
  desktopLyricsHotBounds = null;
  stopDesktopLyricsMousePoller();
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
    sendDesktopLyricsState();
    desktopLyricsWindow.close();
  }
  desktopLyricsWindow = null;
  broadcastDesktopLyricsEnabledState(false);
}

function nativeWindowHandleDecimal(win) {
  const handle = win.getNativeWindowHandle();
  if (process.arch === 'x64') return handle.readBigUInt64LE(0).toString();
  return String(handle.readUInt32LE(0));
}

function hookExplorerRestartForFullDesktop(win) {
  if (process.platform !== 'win32' || !win || win.isDestroyed() || typeof win.hookWindowMessage !== 'function') return;
  if (win.__mineradioTaskbarCreatedHookPending || win.__mineradioTaskbarCreatedMessageId) return;
  win.__mineradioTaskbarCreatedHookPending = true;
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class MineradioShellMessage {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern uint RegisterWindowMessage(string messageName);
}
"@
[MineradioShellMessage]::RegisterWindowMessage("TaskbarCreated")
`;
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    windowsHide: true,
    timeout: 5000,
    env: { ...process.env, TEMP: NATIVE_HELPER_TEMP_PATH, TMP: NATIVE_HELPER_TEMP_PATH },
  }, (error, stdout) => {
    win.__mineradioTaskbarCreatedHookPending = false;
    if (error || win.isDestroyed()) return;
    const messageId = Number.parseInt(String(stdout || '').trim(), 10);
    if (!Number.isInteger(messageId) || messageId <= 0) return;
    try {
      win.hookWindowMessage(messageId, () => {
        setTimeout(() => {
          reconcileFullDesktopMode('explorer-restarted').catch((reconcileError) => {
            console.warn('[FullDesktopMode] Explorer restart reconcile failed:', reconcileError && reconcileError.message || reconcileError);
          });
        }, 650);
      });
      win.__mineradioTaskbarCreatedMessageId = messageId;
    } catch (hookError) {
      console.warn('[FullDesktopMode] Explorer restart hook failed:', hookError && hookError.message || hookError);
    }
  });
}

function windowMessageUnsignedValue(value) {
  if (typeof value === 'number') return value >>> 0;
  if (!Buffer.isBuffer(value) || value.length < 4) return 0;
  try { return value.readUInt32LE(0); } catch (_) { return 0; }
}

function armMainWindowMinimizeIntent(win, reason) {
  if (!win || win.isDestroyed()) return;
  win.__mineradioMinimizeIntentUntil = Date.now() + MAIN_WINDOW_MINIMIZE_INTENT_TTL_MS;
  win.__mineradioMinimizeIntentReason = String(reason || 'user');
}

function consumeMainWindowMinimizeIntent(win) {
  if (!win || win.isDestroyed()) return { intentional: false, reason: '' };
  const intentional = Number(win.__mineradioMinimizeIntentUntil || 0) >= Date.now();
  const reason = intentional ? String(win.__mineradioMinimizeIntentReason || 'user') : '';
  win.__mineradioMinimizeIntentUntil = 0;
  win.__mineradioMinimizeIntentReason = '';
  win.__mineradioIntentionalMinimize = intentional;
  win.__mineradioIntentionalMinimizeReason = reason;
  return { intentional, reason };
}

function clearMainWindowMinimizeIntent(win) {
  if (!win || win.isDestroyed()) return;
  win.__mineradioMinimizeIntentUntil = 0;
  win.__mineradioMinimizeIntentReason = '';
  win.__mineradioIntentionalMinimize = false;
  win.__mineradioIntentionalMinimizeReason = '';
}

function hookMainWindowMinimizeIntent(win) {
  if (process.platform !== 'win32' || !win || win.isDestroyed() || typeof win.hookWindowMessage !== 'function') return;
  if (win.__mineradioSystemCommandIntentHooked) return;
  try {
    win.hookWindowMessage(WINDOWS_WM_SYSCOMMAND, (wParam) => {
      const command = windowMessageUnsignedValue(wParam) & 0xFFF0;
      if (command === WINDOWS_SC_MINIMIZE) armMainWindowMinimizeIntent(win, 'native-system-command');
    });
    win.__mineradioSystemCommandIntentHooked = true;
  } catch (error) {
    console.warn('[WindowMinimize] native intent hook unavailable:', error && error.message || error);
  }
}

function positionWallpaperWindow(reason = 'display-change') {
  reconcileFullDesktopMode(reason).catch((error) => {
    console.warn('[FullDesktopMode] display reconcile failed:', error && error.message || error);
  });
}

async function createWallpaperWindow(payload = {}) {
  const result = await enableFullDesktopMode(mainWindow, {
    interactive: true,
    reason: String(payload && payload.reason || 'renderer-enabled'),
  });
  if (result && result.ok === true && result.enabled === true) {
    const backdrop = {
      ok: true,
      enabled: true,
      active: true,
      kind: wallpaperEngineProvidesDesktopBackdrop() ? 'wallpaper-engine-dwm' : 'system-desktop',
    };
    return { ...result, backdropReady: true, backdrop };
  }
  return result;
}

async function closeWallpaperWindow(reason = 'disabled') {
  return disableFullDesktopMode(reason);
}

function closeOverlayWindows(reason = 'overlay-close') {
  closeDesktopLyricsWindow();
  return closeWallpaperWindow(reason).catch((error) => {
    console.warn('[FullDesktopMode] close failed:', error && error.message || error);
  });
}

ipcMain.handle('desktop-window-minimize', async (event) => {
  const win = getSenderWindow(event);
  if (win === mainWindow && fullDesktopModeRuntime.getStatus('window-minimize').enabled === true) {
    return setFullDesktopModeInteractive(false, 'window-minimize');
  }
  if (win === mainWindow) armMainWindowMinimizeIntent(win, 'renderer-window-control');
  win?.minimize();
  return getWindowState(win);
});

ipcMain.handle('desktop-window-restore', async (event) => {
  const win = getSenderWindow(event);
  if (!win || win.isDestroyed()) return null;
  if (win === mainWindow) clearMainWindowMinimizeIntent(win);
  if (win === mainWindow && fullDesktopModeRuntime.getStatus('window-restore').enabled === true) {
    await setFullDesktopModeInteractive(true, 'window-restore');
    return getWindowState(win);
  }
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  try { win.moveTop(); } catch (_) { }
  try { win.focus(); } catch (_) { }
  sendWindowState(win);
  return getWindowState(win);
});

ipcMain.handle('desktop-window-toggle-maximize', (event) => {
  const win = getSenderWindow(event);
  if (win === mainWindow && fullDesktopModeRuntime.getStatus('window-toggle-maximize').enabled === true) {
    return getWindowState(win);
  }
  toggleFullscreen(win);
  return getWindowState(win);
});

ipcMain.handle('desktop-window-toggle-fullscreen', (event) => {
  const win = getSenderWindow(event);
  if (win === mainWindow && fullDesktopModeRuntime.getStatus('window-toggle-fullscreen').enabled === true) {
    return getWindowState(win);
  }
  toggleFullscreen(win);
  return getWindowState(win);
});

ipcMain.handle('desktop-window-exit-fullscreen-windowed', (event) => {
  const win = getSenderWindow(event);
  if (win === mainWindow && fullDesktopModeRuntime.getStatus('window-exit-fullscreen').enabled === true) {
    return getWindowState(win);
  }
  exitFullscreenToWindow(win);
  return getWindowState(win);
});

ipcMain.handle('desktop-window-get-state', (event) => {
  return getWindowState(getSenderWindow(event));
});

ipcMain.on('mineradio-full-desktop-icon-shields', (event, payload = {}) => {
  if (!isTrustedMainWindowIpc(event)) return;
  const rects = payload && payload.enabled === true && payload.interactive === true
    ? payload.rects
    : [];
  fullDesktopModeRuntime.updateIconShields(
    Array.isArray(rects) ? rects : [],
    payload && payload.viewport && typeof payload.viewport === 'object' ? payload.viewport : {}
  );
});

ipcMain.handle('mineradio-full-desktop-set-icons-visible', async (event, visible) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, error: 'DESKTOP_MODE_UNTRUSTED_SENDER' };
  return fullDesktopModeRuntime.setDesktopIconsVisible(visible !== false, 'renderer-icons-visible');
});

ipcMain.handle('mineradio-full-desktop-set-software-lock', async (event, locked) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, error: 'DESKTOP_MODE_UNTRUSTED_SENDER' };
  return fullDesktopModeRuntime.setSoftwareInteractionLocked(locked === true, 'renderer-software-lock');
});

const ordinaryWindowImeFocusRepairs = new WeakMap();

ipcMain.handle('mineradio-full-desktop-request-keyboard-focus', async (event, reason) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, error: 'UNTRUSTED_KEYBOARD_FOCUS_REQUEST' };
  const focusResult = fullDesktopModeRuntime.requestKeyboardFocus(
    `renderer-${String(reason || 'pointerdown').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 64)}`
  );
  if (focusResult && focusResult.ok) return focusResult;
  const desktopStatus = fullDesktopModeRuntime.getStatus('renderer-keyboard-focus-fallback');
  if (desktopStatus && desktopStatus.enabled) {
    return { ok: false, focused: false, error: 'DESKTOP_KEYBOARD_FOCUS_INACTIVE', status: desktopStatus };
  }
  const win = getSenderWindow(event);
  const webContents = win && !win.isDestroyed() ? win.webContents : null;
  if (!webContents || webContents.isDestroyed() || typeof webContents.focus !== 'function') {
    return { ok: false, focused: false, error: 'KEYBOARD_FOCUS_WINDOW_UNAVAILABLE' };
  }
  const pendingRepair = ordinaryWindowImeFocusRepairs.get(webContents);
  if (pendingRepair) return pendingRepair;
  // Native confirm/logout can leave Chromium's editable surface unfocused in the
  // ordinary top-level window while isFocused() still reports true. Rebuild the
  // renderer focus boundary once so Windows TSF/IME attaches to the next focused
  // input. This branch is forbidden while the HWND is attached to Explorer.
  const repair = (async () => {
    if (typeof webContents.blur === 'function') webContents.blur();
    if (typeof win.setFocusable === 'function') win.setFocusable(true);
    if (typeof win.restore === 'function' && typeof win.isMinimized === 'function' && win.isMinimized()) win.restore();
    if (typeof win.focus === 'function') win.focus();
    await new Promise(resolve => setTimeout(resolve, 0));
    webContents.focus();
    return {
      ok: true,
      focused: typeof webContents.isFocused !== 'function' || webContents.isFocused(),
      mode: 'ordinary-window-ime-refresh',
    };
  })();
  ordinaryWindowImeFocusRepairs.set(webContents, repair);
  try {
    return await repair;
  } finally {
    if (ordinaryWindowImeFocusRepairs.get(webContents) === repair) {
      ordinaryWindowImeFocusRepairs.delete(webContents);
    }
  }
});

ipcMain.on('mineradio-full-desktop-pointer-route', (event, payload = {}) => {
  if (!isTrustedMainWindowIpc(event)) return;
  fullDesktopModeRuntime.updatePointerRoute({
    overSoftwareUi: payload && payload.overSoftwareUi === true,
    overDesktopControls: payload && payload.overDesktopControls === true,
  }, 'renderer-pointer-route');
});

ipcMain.handle('mineradio-get-gpu-diagnostics', () => {
  return getGpuDiagnostics();
});

ipcMain.handle('mineradio-memory-get-snapshot', async () => {
  try {
    return {
      ok: true,
      snapshot: await systemMemory.getMemorySnapshotExtended(),
      elevated: false,
      systemPurgeAvailable: systemMemory.SYSTEM_PURGE_AVAILABLE === true,
      systemPurgeEnabled: systemMemory.SYSTEM_PURGE_ENABLED === true,
      appMetrics: systemMemory.getMemorySnapshot().process,
      auto: memoryAutoState,
      lastTrimAt: lastAppMemoryTrimAt,
      lastTrimReason: lastAppMemoryTrimReason,
    };
  } catch (e) {
    return { ok: false, error: e.message || 'MEMORY_SNAPSHOT_FAILED', snapshot: systemMemory.getMemorySnapshot(), auto: memoryAutoState };
  }
});

ipcMain.handle('mineradio-memory-configure-auto', async (_event, payload = {}) => {
  memoryAutoState = normalizeMemoryAutoState(payload);
  syncMemoryAutoTimer();
  if (memoryAutoState.enabled && payload.runNow === true && !isMainWindowForegroundVisible()) {
    await runMemoryAutoTick('configure');
  }
  return {
    ok: true,
    state: memoryAutoState,
    systemPurgeAvailable: systemMemory.SYSTEM_PURGE_AVAILABLE === true,
    systemPurgeEnabled: systemMemory.SYSTEM_PURGE_ENABLED === true,
  };
});

ipcMain.handle('mineradio-memory-trim-app', async (_event, payload = {}) => {
  return trimAppMemoryNow(payload.reason || 'renderer');
});

ipcMain.handle('mineradio-memory-purge-system', async (_event, payload = {}) => {
  const mask = systemMemory.normalizeMask(payload && payload.mask);
  const autoElevate = payload && payload.autoElevate === true;
  try {
    if (isMainWindowForegroundVisible()) {
      return {
        ok: true,
        result: { ok: false, skipped: true, reason: 'foreground-visible', message: 'System memory purge is skipped while Mineradio is visible.' },
        snapshot: systemMemory.getMemorySnapshot(),
        elevated: false,
        systemPurgeAvailable: systemMemory.SYSTEM_PURGE_AVAILABLE === true,
        systemPurgeEnabled: systemMemory.SYSTEM_PURGE_ENABLED === true,
      };
    }
    const elevatedBefore = await systemMemory.isProcessElevated();
    const result = await systemMemory.purgeSystemMemorySmart(mask, { autoElevate, manual: true });
    return {
      ok: true,
      result,
      snapshot: await systemMemory.getMemorySnapshotExtended(),
      elevated: elevatedBefore || await systemMemory.isProcessElevated(),
      systemPurgeAvailable: systemMemory.SYSTEM_PURGE_AVAILABLE === true,
      systemPurgeEnabled: systemMemory.SYSTEM_PURGE_ENABLED === true,
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message || 'SYSTEM_MEMORY_PURGE_FAILED',
      snapshot: systemMemory.getMemorySnapshot(),
      elevated: false,
      systemPurgeAvailable: systemMemory.SYSTEM_PURGE_AVAILABLE === true,
      systemPurgeEnabled: systemMemory.SYSTEM_PURGE_ENABLED === true,
    };
  }
});

ipcMain.handle('mineradio-cache-get-settings', async () => {
  try {
    return await cacheSettingsSnapshot();
  } catch (error) {
    return { ok: false, error: error.message || 'CACHE_SETTINGS_READ_FAILED' };
  }
});

ipcMain.handle('mineradio-cache-choose-directory', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择 Mineradio 缓存目录',
    defaultPath: cacheSettings.rootPath,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths || !result.filePaths[0]) return { ok: true, canceled: true };
  return { ok: true, canceled: false, rootPath: normalizeCacheRootPath(result.filePaths[0]) };
});

ipcMain.handle('mineradio-cache-set-settings', async (_event, payload = {}) => {
  try {
    const nextRoot = normalizeCacheRootPath(payload.rootPath);
    fs.mkdirSync(nextRoot, { recursive: true });
    fs.accessSync(nextRoot, fs.constants.W_OK);
    cacheSettings = ensureCacheDirectories(writeCacheSettings({ rootPath: nextRoot }));
    const snapshot = await cacheSettingsSnapshot();
    snapshot.restartRequired = snapshot.settings.restartRequired;
    return snapshot;
  } catch (error) {
    return { ok: false, error: error.message || 'CACHE_SETTINGS_WRITE_FAILED' };
  }
});

ipcMain.handle('mineradio-wallpaper-engine-list', async (event, payload = {}) => {
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, projects: [], count: 0, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    const snapshot = await wallpaperEngineLibrary.list({ force: payload && payload.force === true });
    const runtime = await wallpaperEngineRuntime.probe(payload && payload.force === true);
    return { ...snapshot, runtime };
  } catch (error) {
    return { ok: false, projects: [], count: 0, error: error.message || 'WALLPAPER_ENGINE_SCAN_FAILED' };
  }
});

ipcMain.handle('mineradio-wallpaper-engine-project-details', async (event, id) => {
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    return await wallpaperEngineLibrary.getProjectDetails(String(id || ''));
  } catch (error) {
    return { ok: false, error: error.message || 'WALLPAPER_ENGINE_PROJECT_DETAILS_FAILED' };
  }
});

ipcMain.handle('mineradio-wallpaper-engine-open-project-details', async (event, payload = {}) => {
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    const details = await wallpaperEngineLibrary.getProjectDetails(String(payload && payload.id || ''));
    const workshopId = String(details && details.workshopId || '');
    if (!/^\d{5,32}$/.test(workshopId)) {
      return { ok: false, error: 'WALLPAPER_ENGINE_WORKSHOP_DETAILS_UNAVAILABLE' };
    }
    const target = payload && payload.target === 'workshop' ? 'workshop' : 'we';
    let revealError = '';
    if (target === 'we') {
      try {
        await wallpaperEngineRuntime.revealWorkshop(workshopId);
        return { ok: true, opened: 'wallpaper-engine', workshopId };
      } catch (error) {
        revealError = error && (error.code || error.message) || 'WALLPAPER_ENGINE_REVEAL_FAILED';
      }
    }
    const steamUri = 'steam://url/CommunityFilePage/' + workshopId;
    try {
      await shell.openExternal(steamUri);
      return { ok: true, opened: 'steam-workshop', workshopId, fallback: target === 'we', revealError };
    } catch (_) {
      const webUrl = 'https://steamcommunity.com/sharedfiles/filedetails/?id=' + workshopId;
      await shell.openExternal(webUrl);
      return { ok: true, opened: 'web-workshop', workshopId, fallback: target === 'we', revealError };
    }
  } catch (error) {
    return { ok: false, error: error.message || 'WALLPAPER_ENGINE_OPEN_PROJECT_DETAILS_FAILED' };
  }
});

ipcMain.handle('mineradio-wallpaper-engine-choose-directory', async (event) => {
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, canceled: false, projects: [], count: 0, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    const options = {
      title: '识别并导入 Wallpaper Engine 项目',
      buttonLabel: '识别此目录',
      properties: ['openDirectory'],
    };
    const result = mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths || !result.filePaths[0]) return { ok: true, canceled: true };
    const snapshot = await wallpaperEngineLibrary.addManualRoot(result.filePaths[0]);
    const runtime = await wallpaperEngineRuntime.probe(false);
    return { ...snapshot, runtime, canceled: false };
  } catch (error) {
    return { ok: false, canceled: false, projects: [], count: 0, error: error.message || 'WALLPAPER_ENGINE_IMPORT_FAILED' };
  }
});

ipcMain.handle('mineradio-wallpaper-engine-choose-project-file', async (event) => {
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, canceled: false, projects: [], count: 0, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    const options = {
      title: '选择 Wallpaper Engine 的 project.json 或场景包（.pkg/.pak）',
      buttonLabel: '导入此项目',
      properties: ['openFile'],
      filters: [
        { name: 'Wallpaper Engine 项目', extensions: ['pkg', 'pak', 'json'] },
      ],
    };
    const result = mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths || !result.filePaths[0]) return { ok: true, canceled: true };
    const selected = path.resolve(result.filePaths[0]);
    const snapshot = await wallpaperEngineLibrary.addManualProjectFile(selected);
    const runtime = await wallpaperEngineRuntime.probe(false);
    return { ...snapshot, runtime, canceled: false };
  } catch (error) {
    return { ok: false, canceled: false, projects: [], count: 0, error: error.message || 'WALLPAPER_ENGINE_IMPORT_PROJECT_FAILED' };
  }
});

ipcMain.handle('mineradio-wallpaper-engine-remove-directory', async (event, rootId) => {
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, projects: [], count: 0, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    const snapshot = await wallpaperEngineLibrary.removeManualRoot(rootId);
    const runtime = await wallpaperEngineRuntime.probe(false);
    return { ...snapshot, runtime };
  } catch (error) {
    return { ok: false, projects: [], count: 0, error: error.message || 'WALLPAPER_ENGINE_REMOVE_ROOT_FAILED' };
  }
});

ipcMain.handle('mineradio-wallpaper-engine-runtime-status', async (event, payload = {}) => {
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, available: false, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    const probe = await wallpaperEngineRuntime.probe(payload && payload.force === true);
    return { ...probe, ...wallpaperEngineRuntime.getStatus(), pending: wallpaperEngineRuntime.pending != null };
  } catch (error) {
    return { ok: false, available: false, error: error.message || 'WALLPAPER_ENGINE_RUNTIME_PROBE_FAILED' };
  }
});

ipcMain.handle('mineradio-wallpaper-engine-start-scene', async (event, payload = {}) => {
  let operation = 0;
  let startedSessionId = '';
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    operation = ++wallpaperEngineCaptureOperation;
    const desktopMode = fullDesktopModeRuntime.getStatus('wallpaper-engine-start-scene');
    if (wallpaperEngineHostVisibilitySuspended
      || (desktopMode.enabled === true
        && (desktopMode.interactive !== true || desktopMode.phase !== 'interactive'))) {
      return { ok: false, error: 'WALLPAPER_ENGINE_HOST_SUSPENDED' };
    }
    const physicalBounds = wallpaperEnginePhysicalContentBounds(mainWindow, payload);
    const display = physicalBounds.display;
    const targetFps = wallpaperEngineTargetFps(display, payload.fps);
    const hostCornerRadius = wallpaperEngineHostCornerRadius(mainWindow);
    const result = await wallpaperEngineRuntime.start(String(payload.id || ''), {
      // The native scene follows the authoritative BrowserWindow content rect;
      // renderer innerWidth/innerHeight can be stale during a DPI transition.
      width: Math.max(640, Math.min(7680, physicalBounds.width)),
      height: Math.max(360, Math.min(4320, physicalBounds.height)),
      fps: targetFps,
      x: physicalBounds.x,
      y: physicalBounds.y,
    });
    startedSessionId = String(result && result.sessionId || '');
    if (operation !== wallpaperEngineCaptureOperation) {
      await wallpaperEngineRuntime.stop(startedSessionId).catch(() => {});
      return { ok: false, error: 'WALLPAPER_ENGINE_START_SUPERSEDED', sessionId: startedSessionId };
    }
    let embedded;
    try {
      embedded = await wallpaperEngineRuntime.embedActiveWindow(startedSessionId, {
        hostWindowId: nativeWindowHandleDecimal(mainWindow),
        hostExecutable: process.execPath,
        cornerRadius: hostCornerRadius,
        desktopIconLayering: fullDesktopIconLayeringDesired('wallpaper-engine-embed'),
      });
    } catch (embeddingError) {
      clearWallpaperEngineCaptureGrant(startedSessionId);
      await wallpaperEngineRuntime.stop(startedSessionId).catch(() => {});
      return {
        ok: false,
        error: embeddingError && (embeddingError.code || embeddingError.message) || 'WALLPAPER_ENGINE_WINDOW_ISOLATION_FAILED',
        capturePrepared: false,
        sessionId: startedSessionId,
      };
    }
    if (operation !== wallpaperEngineCaptureOperation) {
      await wallpaperEngineRuntime.stop(startedSessionId).catch(() => {});
      return { ok: false, error: 'WALLPAPER_ENGINE_START_SUPERSEDED', sessionId: startedSessionId };
    }
    // Adaptive pixel calibration can relaunch the WE pop-out and replace its
    // HWND/sourceId. Build the one-shot grant only after embedding has settled
    // so the renderer never captures the stale pre-calibration window.
    const grant = createWallpaperEngineCaptureGrant({ ...result, ...embedded }, operation);
    if (!grant) {
      await wallpaperEngineRuntime.stop(startedSessionId).catch(() => {});
      return { ok: false, error: 'WALLPAPER_ENGINE_CAPTURE_UNAVAILABLE', sessionId: startedSessionId };
    }
    const embeddedDesktop = fullDesktopModeRuntime.getStatus('wallpaper-engine-embed-finished');
    if (mainWindow && !mainWindow.isDestroyed() && embeddedDesktop.enabled !== true) {
      try { mainWindow.moveTop(); } catch (_) { }
      try { mainWindow.focus(); } catch (_) { }
    } else if (embeddedDesktop.enabled === true && embeddedDesktop.interactive === true) {
      fullDesktopModeRuntime.ensureIconLayerOrder().catch((error) => {
        console.warn('[FullDesktopMode] WE coexistence z-order refresh failed:', error && error.message || error);
      });
    }
    if (operation !== wallpaperEngineCaptureOperation) {
      clearWallpaperEngineCaptureGrant(grant.sessionId);
      await wallpaperEngineRuntime.stop(grant.sessionId).catch(() => {});
      return { ok: false, error: 'WALLPAPER_ENGINE_START_SUPERSEDED', sessionId: grant.sessionId };
    }
    // Native Scene mode is composed by DWM, not captured as a Chromium video.
    // The renderer keeps this one-shot grant only for the readiness ACK; the
    // runtime starts a click-through live surface underneath the transparent
    // BrowserWindow and leaves the exact WE source aligned behind it.
    return { ...result, ...embedded, capturePrepared: true, captureMode: 'dwm-thumbnail' };
  } catch (error) {
    if (startedSessionId) {
      clearWallpaperEngineCaptureGrant(startedSessionId);
      await wallpaperEngineRuntime.stop(startedSessionId).catch(() => {});
    } else if (wallpaperEngineCaptureGrant && wallpaperEngineCaptureGrant.operation === operation) {
      clearWallpaperEngineCaptureGrant();
    }
    return { ok: false, error: error.code || error.message || 'WALLPAPER_ENGINE_SCENE_START_FAILED', sessionId: startedSessionId };
  }
});

ipcMain.handle('mineradio-wallpaper-engine-capture-result', async (event, payload = {}) => {
  if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
  const sessionId = String(payload && payload.sessionId || '');
  if (!/^[a-f0-9]{24}$/i.test(sessionId)) return { ok: false, error: 'WALLPAPER_ENGINE_SESSION_INVALID' };
  const matched = clearWallpaperEngineCaptureGrant(sessionId);
  let confirmed = false;
  if (matched && payload && payload.ok === true && typeof wallpaperEngineRuntime.confirmCaptureReady === 'function') {
    confirmed = await wallpaperEngineRuntime.confirmCaptureReady(sessionId).catch(() => false);
  }
  if (matched && !confirmed) {
    wallpaperEngineHostBoundsFollowupReason = '';
    await wallpaperEngineRuntime.stop(sessionId).catch(() => {});
  }
  if (matched && confirmed && wallpaperEngineHostVisibilityResumePending) {
    finishWallpaperEngineVisibleHostResume(mainWindow);
  }
  if (matched && confirmed && wallpaperEngineHostBoundsFollowupReason) {
    const followupReason = wallpaperEngineHostBoundsFollowupReason;
    wallpaperEngineHostBoundsFollowupReason = '';
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible() || mainWindow.isMinimized()) return;
      scheduleWallpaperEngineHostBoundsRestart(mainWindow, followupReason);
    }, 90);
  }
  if (matched && confirmed) {
    syncWallpaperEngineDesktopIconLayering('wallpaper-engine-capture-ready').catch(() => {});
  }
  return {
    ok: matched && confirmed,
    accepted: matched,
    captureReady: confirmed,
    error: matched && !confirmed ? 'WALLPAPER_ENGINE_DWM_SURFACE_FAILED' : '',
  };
});

ipcMain.handle('mineradio-wallpaper-engine-prepare-glass-capture', async (event, payload = {}) => {
  if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
  const sessionId = String(payload && payload.sessionId || '');
  if (!/^[a-f0-9]{24}$/i.test(sessionId)) return { ok: false, error: 'WALLPAPER_ENGINE_SESSION_INVALID' };
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible() || mainWindow.isMinimized()
    || wallpaperEngineHostVisibilitySuspended) {
    return { ok: false, error: 'WALLPAPER_GLASS_CAPTURE_HOST_HIDDEN' };
  }
  const captureOperation = wallpaperEngineCaptureOperation;
  const glassOperation = ++wallpaperEngineGlassCaptureOperation;
  try {
    const status = wallpaperEngineRuntime.getStatus();
    if (!status || status.active !== true || status.sessionId !== sessionId
      || status.captureMode !== 'dwm-thumbnail'
      || status.dwmGlassSurfaceReady !== true || status.dwmGlassSurfaceActive !== true) {
      return { ok: false, error: 'WALLPAPER_ENGINE_DWM_GLASS_SURFACE_UNAVAILABLE' };
    }
    const source = await wallpaperEngineRuntime.getDwmGlassCaptureSource(sessionId, {
      timeoutMs: 1800,
      pollIntervalMs: 60,
    });
    if (captureOperation !== wallpaperEngineCaptureOperation
      || glassOperation !== wallpaperEngineGlassCaptureOperation) {
      return { ok: false, error: 'WALLPAPER_ENGINE_START_SUPERSEDED' };
    }
    if (wallpaperEngineCaptureGrant && wallpaperEngineCaptureGrant.kind !== 'dwm-glass') {
      return { ok: false, error: 'WALLPAPER_GLASS_CAPTURE_GRANT_BUSY' };
    }
    clearWallpaperEngineCaptureGrant();
    const grant = createWallpaperEngineCaptureGrant({ sessionId, sourceId: source.id }, glassOperation, {
      kind: 'dwm-glass',
      captureSource: source,
    });
    if (!grant) return { ok: false, error: 'WALLPAPER_GLASS_CAPTURE_SOURCE_INVALID' };
    const prepared = await prepareWallpaperEngineRendererGlassCapture(sessionId, payload && payload.fps, source.id);
    const current = wallpaperEngineRuntime.getStatus();
    if (captureOperation !== wallpaperEngineCaptureOperation
      || glassOperation !== wallpaperEngineGlassCaptureOperation
      || !current || current.active !== true || current.sessionId !== sessionId) {
      return { ok: false, error: 'WALLPAPER_ENGINE_START_SUPERSEDED' };
    }
    return {
      ok: !!(prepared && prepared.ok === true),
      capturePrepared: !!(prepared && prepared.ok === true),
      captureMode: 'dwm-glass-svg-sampler',
      error: String(prepared && prepared.error || ''),
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error && (error.code || error.message || error.name) || error || 'WALLPAPER_GLASS_CAPTURE_PREPARE_FAILED').slice(0, 500),
    };
  } finally {
    if (wallpaperEngineCaptureGrant
      && wallpaperEngineCaptureGrant.kind === 'dwm-glass'
      && wallpaperEngineCaptureGrant.operation === glassOperation) {
      clearWallpaperEngineCaptureGrant(sessionId);
    }
  }
});

ipcMain.handle('mineradio-wallpaper-engine-activate-dwm-surface', async (event, payload = {}) => {
  if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
  const sessionId = String(payload && payload.sessionId || '');
  if (!/^[a-f0-9]{24}$/i.test(sessionId)) return { ok: false, error: 'WALLPAPER_ENGINE_SESSION_INVALID' };
  try {
    const result = await wallpaperEngineRuntime.activateDwmSurface(sessionId);
    return {
      ok: !!(result && result.dwmSurfaceActive === true),
      active: !!(result && result.dwmSurfaceActive === true),
      captureMode: 'dwm-thumbnail',
      error: result && result.dwmSurfaceActive === true ? '' : 'WALLPAPER_ENGINE_DWM_SURFACE_FAILED',
    };
  } catch (error) {
    return { ok: false, active: false, error: String(error && (error.code || error.message) || error || 'WALLPAPER_ENGINE_DWM_SURFACE_FAILED') };
  }
});

ipcMain.on('mineradio-wallpaper-engine-glass-surface', (event, payload = {}) => {
  if (!isTrustedWallpaperEngineIpc(event) || typeof wallpaperEngineRuntime.updateGlassSurface !== 'function') return;
  const sessionId = String(payload && payload.sessionId || '');
  if (!/^[a-f0-9]{24}$/i.test(sessionId)) return;
  if (payload.active === true && (!mainWindow
    || mainWindow.isDestroyed()
    || !mainWindow.isVisible()
    || mainWindow.isMinimized()
    || wallpaperEngineHostVisibilitySuspended)) return;
  try { wallpaperEngineRuntime.updateGlassSurface(sessionId, payload); } catch (_) { }
});

ipcMain.on('mineradio-wallpaper-engine-visual-settings', (event, payload = {}) => {
  if (!isTrustedWallpaperEngineIpc(event) || typeof wallpaperEngineRuntime.updateDwmVisualSettings !== 'function') return;
  const sessionId = String(payload && payload.sessionId || '');
  if (!/^[a-f0-9]{24}$/i.test(sessionId)) return;
  const opacity = Number(payload.opacity);
  const positionX = Number(payload.positionX);
  const positionY = Number(payload.positionY);
  const scale = Number(payload.scale);
  if (![opacity, positionX, positionY, scale].every(Number.isFinite)) return;
  wallpaperEngineRuntime.updateDwmVisualSettings(sessionId, { opacity, positionX, positionY, scale });
});

ipcMain.on('mineradio-wallpaper-engine-pointer-activity', (event, payload = {}) => {
  if (!isTrustedWallpaperEngineIpc(event)
    || !mainWindow
    || mainWindow.isDestroyed()
    || !mainWindow.isVisible()
    || mainWindow.isMinimized()
    || wallpaperEngineHostVisibilitySuspended) return;
  const sessionId = String(payload && payload.sessionId || '');
  if (!/^[a-f0-9]{24}$/i.test(sessionId)) return;
  const rawXUnit = payload && payload.xUnit;
  const rawYUnit = payload && payload.yUnit;
  const xUnit = Math.round(rawXUnit);
  const yUnit = Math.round(rawYUnit);
  if (typeof rawXUnit !== 'number' || typeof rawYUnit !== 'number'
    || !Number.isFinite(xUnit) || !Number.isFinite(yUnit)
    || xUnit < 0 || xUnit > 65535 || yUnit < 0 || yUnit > 65535) return;
  const status = wallpaperEngineRuntime.getStatus();
  if (!status
    || status.active !== true
    || status.sourceWindowParked !== true
    || String(status.sessionId || '') !== sessionId
    || typeof wallpaperEngineRuntime.noteHostPointerActivity !== 'function') return;
  try {
    wallpaperEngineRuntime.noteHostPointerActivity({ sessionId, xUnit, yUnit });
  } catch (_) { }
});

ipcMain.handle('mineradio-wallpaper-engine-stop-scene', async (event, payload = {}) => {
  try {
    if (!isTrustedWallpaperEngineIpc(event)) return { ok: false, error: 'WALLPAPER_ENGINE_UNTRUSTED_CALLER' };
    const sessionId = String(payload.sessionId || '');
    const stopAll = payload && payload.all === true || !sessionId;
    // Invalidate pending preparation before awaiting the old source shutdown.
    // Otherwise a new start can begin during the close wait and then be
    // incorrectly superseded when this stop handler resumes.
    if (stopAll) {
      wallpaperEngineCaptureOperation += 1;
      cancelWallpaperEngineHostBoundsRestart();
      clearWallpaperEngineCaptureGrant();
    }
    const result = await wallpaperEngineRuntime.stop(stopAll ? '' : sessionId);
    const current = wallpaperEngineRuntime.getStatus();
    if (!stopAll && (!current.active || (wallpaperEngineCaptureGrant && wallpaperEngineCaptureGrant.sessionId === sessionId))) {
      clearWallpaperEngineCaptureGrant(sessionId);
    }
    return result;
  } catch (error) {
    return { ok: false, error: error.code || error.message || 'WALLPAPER_ENGINE_SCENE_STOP_FAILED' };
  }
});

ipcMain.handle('mineradio-local-library-list', async (event) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, count: 0, tracks: [], error: 'UNTRUSTED_SENDER' };
  try {
    return await localMusicLibrary.listTracks();
  } catch (error) {
    return { ok: false, count: 0, tracks: [], error: error.message || 'LOCAL_LIBRARY_READ_FAILED' };
  }
});

ipcMain.handle('mineradio-built-in-playlists-list', async (event) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, count: 0, playlists: [], error: 'UNTRUSTED_SENDER' };
  return builtInPlaylistLibrary.listSync();
});

ipcMain.handle('mineradio-built-in-playlist-page', async (event, id, options = {}) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, playlist: null, tracks: [], error: 'UNTRUSTED_SENDER' };
  return builtInPlaylistLibrary.page(id, options);
});

function builtInPlaylistMutationError(error) {
  return { ok: false, error: error && (error.code || error.message) || 'BUILT_IN_PLAYLIST_MUTATION_FAILED' };
}

ipcMain.handle('mineradio-built-in-playlist-create', async (event, name) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, error: 'UNTRUSTED_SENDER' };
  try { return await builtInPlaylistLibrary.create(name); } catch (error) { return builtInPlaylistMutationError(error); }
});

ipcMain.handle('mineradio-built-in-playlist-rename', async (event, id, name) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, error: 'UNTRUSTED_SENDER' };
  try { return await builtInPlaylistLibrary.rename(id, name); } catch (error) { return builtInPlaylistMutationError(error); }
});

ipcMain.handle('mineradio-built-in-playlist-delete', async (event, id) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, error: 'UNTRUSTED_SENDER' };
  try { return await builtInPlaylistLibrary.delete(id); } catch (error) { return builtInPlaylistMutationError(error); }
});

ipcMain.handle('mineradio-built-in-playlist-add-track', async (event, id, track) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, error: 'UNTRUSTED_SENDER' };
  try { return await builtInPlaylistLibrary.addTrack(id, track); } catch (error) { return builtInPlaylistMutationError(error); }
});

ipcMain.handle('mineradio-built-in-playlist-remove-track', async (event, id, index) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, error: 'UNTRUSTED_SENDER' };
  try { return await builtInPlaylistLibrary.removeTrack(id, index); } catch (error) { return builtInPlaylistMutationError(error); }
});

ipcMain.handle('mineradio-built-in-playlist-reorder-track', async (event, id, fromIndex, toIndex) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, error: 'UNTRUSTED_SENDER' };
  try { return await builtInPlaylistLibrary.reorderTrack(id, fromIndex, toIndex); } catch (error) { return builtInPlaylistMutationError(error); }
});

ipcMain.handle('mineradio-local-library-lyric', async (event, localFileId) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, lyric: '', lyricSource: '', error: 'UNTRUSTED_SENDER' };
  try {
    return localMusicLibrary.lyricForTrack(localFileId);
  } catch (error) {
    return { ok: false, lyric: '', lyricSource: '', error: error.message || 'LOCAL_LYRIC_READ_FAILED' };
  }
});

function pruneLocalMusicImportCapabilities() {
  const now = Date.now();
  for (const [token, capability] of localMusicImportCapabilities) {
    if (!capability || capability.expiresAt <= now) localMusicImportCapabilities.delete(token);
  }
  while (localMusicImportCapabilities.size > 8) {
    const oldest = localMusicImportCapabilities.keys().next().value;
    if (!oldest) break;
    localMusicImportCapabilities.delete(oldest);
  }
}

ipcMain.handle('mineradio-local-library-authorize', async (event, payload = {}) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, count: 0, error: 'UNTRUSTED_SENDER' };
  const files = [];
  const seen = new Set();
  for (const item of (Array.isArray(payload && payload.files) ? payload.files : []).slice(0, 50000)) {
    const requestedPath = String(item && item.path || '').trim();
    if (!requestedPath || /^[\\/]{2}/.test(requestedPath) || !path.isAbsolute(requestedPath)) continue;
    if (!/\.(mp3|flac|wav|ogg|m4a|aac|opus)$/i.test(requestedPath)) continue;
    let filePath = '';
    try {
      filePath = fs.realpathSync.native ? fs.realpathSync.native(requestedPath) : fs.realpathSync(requestedPath);
      if (/^[\\/]{2}/.test(filePath) || !fs.statSync(filePath).isFile()) continue;
    } catch (_) {
      continue;
    }
    const identity = process.platform === 'win32' ? filePath.toLowerCase() : filePath;
    if (seen.has(identity)) continue;
    seen.add(identity);
    files.push({
      path: filePath,
      relativePath: String(item && item.relativePath || path.basename(filePath)).replace(/\0/g, '').slice(0, 2000),
    });
  }
  if (!files.length) return { ok: false, count: 0, error: 'NO_AUTHORIZED_LOCAL_AUDIO' };
  pruneLocalMusicImportCapabilities();
  const token = crypto.randomBytes(24).toString('hex');
  localMusicImportCapabilities.set(token, {
    senderId: event.sender.id,
    files,
    expiresAt: Date.now() + 3 * 60 * 1000,
  });
  return { ok: true, count: files.length, token };
});

ipcMain.handle('mineradio-local-library-import', async (event, payload = {}) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, count: 0, tracks: [], error: 'UNTRUSTED_SENDER' };
  pruneLocalMusicImportCapabilities();
  const token = String(payload && payload.token || '').trim().toLowerCase();
  const capability = /^[a-f0-9]{48}$/.test(token) ? localMusicImportCapabilities.get(token) : null;
  if (!capability || capability.senderId !== event.sender.id || capability.expiresAt <= Date.now()) {
    return { ok: false, count: 0, tracks: [], error: 'LOCAL_IMPORT_CAPABILITY_INVALID' };
  }
  localMusicImportCapabilities.delete(token);
  try {
    return await localMusicLibrary.importFiles(capability.files, { replace: false });
  } catch (error) {
    return { ok: false, count: 0, tracks: [], error: error.code || error.message || 'LOCAL_LIBRARY_IMPORT_FAILED' };
  }
});

ipcMain.handle('mineradio-cache-read-lyric', async (_event, key) => {
  try {
    const file = lyricCacheFilePath(key);
    if (!fs.existsSync(file)) return { ok: true, hit: false };
    const stat = await fs.promises.stat(file);
    if (!stat || stat.size <= 0 || stat.size > LYRIC_CACHE_ENTRY_MAX_BYTES) return { ok: true, hit: false };
    const record = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    if (!record || record.version !== LYRIC_CACHE_VERSION || !record.payload || typeof record.payload !== 'object') return { ok: true, hit: false };
    fs.promises.utimes(file, new Date(), new Date()).catch(() => {});
    return { ok: true, hit: true, payload: record.payload, cachedAt: record.cachedAt || 0 };
  } catch (error) {
    return { ok: false, hit: false, error: error.message || 'LYRIC_CACHE_READ_FAILED' };
  }
});

ipcMain.handle('mineradio-cache-write-lyric', async (_event, key, payload) => {
  try {
    if (!key || !payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, error: 'INVALID_LYRIC_CACHE_PAYLOAD' };
    const record = { version: LYRIC_CACHE_VERSION, cachedAt: Date.now(), payload };
    const text = JSON.stringify(record);
    if (Buffer.byteLength(text, 'utf8') > LYRIC_CACHE_ENTRY_MAX_BYTES) return { ok: false, error: 'LYRIC_CACHE_ENTRY_TOO_LARGE' };
    await fs.promises.mkdir(cacheSettings.lyricsPath, { recursive: true });
    const file = lyricCacheFilePath(key);
    const temporary = `${file}.tmp`;
    await fs.promises.writeFile(temporary, text, 'utf8');
    await fs.promises.rename(temporary, file);
    pruneLyricCache().catch(() => {});
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || 'LYRIC_CACHE_WRITE_FAILED' };
  }
});

ipcMain.handle('desktop-window-close', (event, behavior) => {
  const win = getSenderWindow(event);
  if (behavior) closeBehavior = normalizeCloseBehavior(behavior);
  win?.close();
});

ipcMain.handle('desktop-window-get-close-behavior', () => {
  return { behavior: closeBehavior };
});

ipcMain.handle('desktop-window-set-close-behavior', (_event, behavior) => {
  closeBehavior = normalizeCloseBehavior(behavior);
  if (closeBehavior === 'tray') createOrUpdateTray();
  else if (fullDesktopModeRuntime.getStatus('close-behavior-changed').enabled !== true) {
    releaseFullDesktopModeRecoveryTray();
  }
  return { ok: true, behavior: closeBehavior };
});

ipcMain.handle('mineradio-hotkeys-configure-global', (_event, bindings) => {
  return configureMineradioGlobalHotkeys(bindings);
});

function loginCookieExportMeta(provider) {
  const key = String(provider || '').toLowerCase();
  const userData = app.getPath('userData');
  const entries = {
    netease: { label: '网易云音乐', files: [process.env.COOKIE_FILE, path.join(userData, '.cookie')] },
    qq: { label: 'QQ音乐', files: [process.env.QQ_COOKIE_FILE, path.join(userData, '.qq-cookie')] },
    kugou: { label: '酷狗音乐', files: [process.env.KUGOU_COOKIE_FILE, path.join(userData, '.kugou-cookie')] },
    qishui: { label: '汽水音乐', files: [process.env.QISHUI_COOKIE_FILE, path.join(userData, '.qishui-cookie'), process.env.QISHUI_TOKEN_FILE, path.join(userData, '.qishui-token')] },
    spotify: { label: 'Spotify', files: [process.env.SPOTIFY_TOKEN_FILE, path.join(userData, '.spotify-token.json')] },
  };
  return entries[key] || null;
}

ipcMain.handle('mineradio-export-login-cookie', async (_event, provider) => {
  try {
    const meta = loginCookieExportMeta(provider);
    if (!meta) return { ok: false, error: 'UNKNOWN_PROVIDER', message: '未知平台，无法导出登录 cookie' };
    const source = (meta.files || []).filter(Boolean).find((file) => {
      try { return fs.existsSync(file) && fs.statSync(file).isFile() && fs.readFileSync(file, 'utf8').trim(); } catch (_) { return false; }
    });
    if (!source) return { ok: false, error: 'COOKIE_NOT_FOUND', message: `${meta.label} 当前没有可导出的登录 cookie` };
    const text = fs.readFileSync(source, 'utf8');
    const safeName = String(`${meta.label}_登录cookie.txt`).replace(/[\\/:*?"<>|]+/g, '-');
    const filePath = path.join(app.getPath('desktop'), safeName);
    fs.writeFileSync(filePath, text, 'utf8');
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, error: e.message || 'EXPORT_LOGIN_COOKIE_FAILED' };
  }
});

ipcMain.handle('mineradio-export-json-file', async (event, payload = {}) => {
  try {
    const owner = getSenderWindow(event);
    const defaultName = String(payload.defaultName || 'mineradio-export.json').replace(/[\\/:*?"<>|]+/g, '-');
    const result = await dialog.showSaveDialog(owner, {
      title: '导出 Mineradio 存档',
      defaultPath: defaultName.toLowerCase().endsWith('.json') ? defaultName : `${defaultName}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    const text = typeof payload.text === 'string' ? payload.text : JSON.stringify(payload.data || {}, null, 2);
    fs.writeFileSync(result.filePath, text, 'utf8');
    return { ok: true, filePath: result.filePath };
  } catch (e) {
    return { ok: false, error: e.message || 'EXPORT_FAILED' };
  }
});

ipcMain.handle('mineradio-import-json-file', async (event) => {
  try {
    const owner = getSenderWindow(event);
    const result = await dialog.showOpenDialog(owner, {
      title: '导入 Mineradio 存档',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths || !result.filePaths[0]) return { ok: false, canceled: true };
    const filePath = result.filePaths[0];
    const text = fs.readFileSync(filePath, 'utf8');
    return { ok: true, filePath, text };
  } catch (e) {
    return { ok: false, error: e.message || 'IMPORT_FAILED' };
  }
});

ipcMain.on('mineradio-current-fx-autosave-read-sync', (event) => {
  event.returnValue = { ok: true, payload: readCurrentFxAutosaveFile() };
});

ipcMain.on('mineradio-current-fx-autosave-save-sync', (event, payload) => {
  event.returnValue = writeCurrentFxAutosaveFile(payload || {});
});

ipcMain.handle('mineradio-current-fx-autosave-save', async (_event, payload = {}) => {
  return writeCurrentFxAutosaveFile(payload || {});
});

ipcMain.handle('mineradio-login-easter-egg-status', async (event) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, error: 'UNTRUSTED_SENDER', unlocked: false };
  return loginEasterEggGate.publicStatus();
});

ipcMain.handle('mineradio-login-easter-egg-unlock', async (event, value) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, error: 'UNTRUSTED_SENDER', unlocked: false };
  return loginEasterEggGate.unlock(value);
});

ipcMain.handle('mineradio-login-easter-egg-reset', async (event) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, error: 'UNTRUSTED_SENDER', unlocked: false };
  return loginEasterEggGate.resetForReplay(() => clearAllProviderLoginState('renderer-replay-reset'));
});

ipcMain.handle('netease-music-open-login', async (event) => {
  if (!loginEasterEggGate.isUnlocked()) return loginEasterEggLockedResult();
  return openNeteaseMusicLoginWindow(getSenderWindow(event));
});

ipcMain.handle('netease-music-clear-login', async () => {
  return clearNeteaseMusicLoginSession();
});

ipcMain.handle('qq-music-open-login', async (event, options) => {
  if (!loginEasterEggGate.isUnlocked()) return loginEasterEggLockedResult();
  return openQQMusicLoginWindow(getSenderWindow(event), options || {});
});

ipcMain.handle('qq-music-clear-login', async () => {
  return clearQQMusicLoginSession();
});

ipcMain.handle('kugou-music-open-login', async (event, options) => {
  if (!loginEasterEggGate.isUnlocked()) return loginEasterEggLockedResult();
  return openKugouMusicLoginWindow(getSenderWindow(event), options || {});
});

ipcMain.handle('kugou-music-clear-login', async () => {
  return clearKugouMusicLoginSession();
});

ipcMain.handle('qishui-music-clear-login', async () => {
  return clearQishuiMusicLoginSession();
});

ipcMain.handle('mineradio-open-update-page', async (event, value) => {
  try {
    if (!isTrustedMainWindowIpc(event)) return { ok: false, error: 'UNTRUSTED_SENDER' };
    const target = String(value || '').trim();
    if (!target || target.length > 2048) return { ok: false, error: 'INVALID_UPDATE_URL' };
    const parsed = new URL(target);
    if (parsed.protocol !== 'https:') return { ok: false, error: 'INVALID_UPDATE_URL' };
    await shell.openExternal(parsed.href);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'OPEN_UPDATE_PAGE_FAILED' };
  }
});

ipcMain.handle('mineradio-restart-app', async () => {
  try {
    app.relaunch();
    app.exit(0);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'RESTART_FAILED' };
  }
});

ipcMain.handle('mineradio-desktop-lyrics-set-enabled', async (_event, enabled, payload) => {
  try {
    if (enabled) {
      createDesktopLyricsWindow(payload || {});
      broadcastDesktopLyricsEnabledState(true);
    } else {
      closeDesktopLyricsWindow();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_FAILED' };
  }
});

ipcMain.handle('mineradio-desktop-lyrics-update', async (_event, payload) => {
  try {
    const nextState = { ...desktopLyricsState, ...(payload || {}) };
    if (nextState.enabled) {
      createDesktopLyricsWindow(payload || {});
    } else if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
      desktopLyricsState = nextState;
      sendDesktopLyricsState();
    } else {
      desktopLyricsState = nextState;
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_UPDATE_FAILED' };
  }
});

ipcMain.handle('mineradio-desktop-lyrics-set-dragging', async () => {
  return { ok: true };
});

ipcMain.handle('mineradio-desktop-lyrics-set-pointer-capture', async (_event, active) => {
  try {
    desktopLyricsPointerCapture = !!active;
    applyDesktopLyricsMouseBehavior();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_POINTER_FAILED' };
  }
});

ipcMain.handle('mineradio-desktop-lyrics-set-hot-bounds', async (_event, bounds) => {
  try {
    const left = clampNumber(bounds && bounds.left, -2000, 4000, 0);
    const top = clampNumber(bounds && bounds.top, -2000, 4000, 0);
    const right = clampNumber(bounds && bounds.right, left + 1, 6000, left + 1);
    const bottom = clampNumber(bounds && bounds.bottom, top + 1, 6000, top + 1);
    desktopLyricsHotBounds = { left, top, right, bottom };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_HOT_BOUNDS_FAILED' };
  }
});

ipcMain.handle('mineradio-desktop-lyrics-set-lock-state', async (_event, locked) => {
  try {
    desktopLyricsState = { ...desktopLyricsState, clickThrough: !!locked };
    if (desktopLyricsState.clickThrough !== false) desktopLyricsPointerCapture = false;
    applyDesktopLyricsMouseBehavior();
    broadcastDesktopLyricsLockState();
    return { ok: true, locked: desktopLyricsState.clickThrough !== false };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_LOCK_FAILED' };
  }
});

ipcMain.handle('mineradio-desktop-lyrics-move-by', async (_event, dx, dy) => {
  try {
    if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return { ok: false, error: 'NO_DESKTOP_LYRICS_WINDOW' };
    if (desktopLyricsState.clickThrough !== false) return { ok: false, error: 'DESKTOP_LYRICS_LOCKED' };
    const bounds = desktopLyricsWindow.getBounds();
    const next = {
      ...bounds,
      x: Math.round(bounds.x + clampNumber(dx, -160, 160, 0)),
      y: Math.round(bounds.y + clampNumber(dy, -160, 160, 0)),
    };
    desktopLyricsWindow.setBounds(next, false);
    desktopLyricsUserBounds = desktopLyricsWindow.getBounds();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'DESKTOP_LYRICS_MOVE_FAILED' };
  }
});

ipcMain.handle('mineradio-wallpaper-set-enabled', async (event, enabled, payload) => {
  try {
    if (!isTrustedMainWindowIpc(event)) return { ok: false, enabled: false, error: 'WALLPAPER_UNTRUSTED_SENDER' };
    if (enabled) return await createWallpaperWindow(payload || {});
    return await closeWallpaperWindow('renderer-disabled');
  } catch (e) {
    return { ok: false, enabled: false, error: e.message || 'WALLPAPER_FAILED', status: fullDesktopModeRuntime.getStatus('ipc-failed') };
  }
});

ipcMain.handle('mineradio-gesture-camera-request-permission', async (event) => {
  const grant = createGestureCameraPermissionGrant(event);
  if (!grant) return { ok: false, error: 'GESTURE_CAMERA_UNTRUSTED_SENDER' };
  return { ok: true, expiresAt: grant.expiresAt };
});

ipcMain.handle('mineradio-wallpaper-update', async (event) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, enabled: false, error: 'WALLPAPER_UNTRUSTED_SENDER' };
  const status = {
    ...fullDesktopModeRuntime.getStatus('renderer-update'),
    recoveryTrayAvailable: !!tray,
    escapeShortcutRegistered: fullDesktopEscapeRegistered === true,
  };
  return { ok: true, enabled: status.enabled === true, interactive: status.interactive === true, status };
});

ipcMain.handle('mineradio-wallpaper-get-status', async (event) => {
  if (!isTrustedMainWindowIpc(event)) return { ok: false, enabled: false, error: 'WALLPAPER_UNTRUSTED_SENDER' };
  return {
    ok: true,
    status: {
      ...fullDesktopModeRuntime.getStatus('renderer-query'),
      recoveryTrayAvailable: !!tray,
      escapeShortcutRegistered: fullDesktopEscapeRegistered === true,
    },
  };
});

function configureLocalServerEnvironment(port) {
  process.env.HOST = '127.0.0.1';
  process.env.PORT = String(port);
  process.env.MINERADIO_BEAT_CACHE_DIR = cacheSettings.beatmapsPath;
  process.env.CUEFIELD_FEEDBACK_FILE = path.join(STABLE_USER_DATA_PATH, 'cuefield-feedback.jsonl');
  process.env.COOKIE_FILE = path.join(STABLE_USER_DATA_PATH, '.cookie');
  process.env.QQ_COOKIE_FILE = path.join(STABLE_USER_DATA_PATH, '.qq-cookie');
  process.env.KUGOU_COOKIE_FILE = path.join(STABLE_USER_DATA_PATH, '.kugou-cookie');
  process.env.QISHUI_COOKIE_FILE = path.join(STABLE_USER_DATA_PATH, '.qishui-cookie');
  process.env.QISHUI_TOKEN_FILE = path.join(STABLE_USER_DATA_PATH, '.qishui-token');
  process.env.QISHUI_QR_CONFIG_FILE = path.join(STABLE_USER_DATA_PATH, '.qishui-qr-login.json');
  process.env.MINERADIO_LISTEN_SYNC_FILE = path.join(STABLE_USER_DATA_PATH, 'listen-sync-journal.json');
  process.env.MINERADIO_MUSIC_PROFILE_FILE = path.join(STABLE_USER_DATA_PATH, 'music-profile.json');
  process.env.MINERADIO_LOGIN_EASTER_EGG_GATE_FILE = path.join(STABLE_USER_DATA_PATH, LOGIN_EASTER_EGG_STATE_FILE);
  process.env.MINERADIO_LOGIN_EASTER_EGG_GATE_VERSION = LOGIN_EASTER_EGG_GATE_VERSION;
  if (!process.env.QISHUI_OAUTH_CONFIG_FILE) {
    process.env.QISHUI_OAUTH_CONFIG_FILE = path.join(STABLE_USER_DATA_PATH, '.qishui-oauth.json');
  }
  process.env.SPOTIFY_TOKEN_FILE = path.join(STABLE_USER_DATA_PATH, '.spotify-token.json');
  if (!process.env.SPOTIFY_CONFIG_FILE && !process.env.MINERADIO_SPOTIFY_CONFIG_FILE) {
    process.env.SPOTIFY_CONFIG_FILE = path.join(STABLE_USER_DATA_PATH, '.spotify-credentials.json');
  }
}

const APP_OWNED_MIGRATION_FILES = [
  '.cookie',
  '.qq-cookie',
  '.kugou-cookie',
  '.qishui-cookie',
  '.qishui-token',
  '.qishui-oauth.json',
  '.qishui-qr-identity.json',
  '.qishui-qr-login.json',
  '.spotify-token.json',
  '.spotify-credentials.json',
  'current-fx-autosave.json',
  'desktop-behavior.json',
  'cuefield-feedback.jsonl',
];

function appOwnedMigrationFileValid(name, file) {
  try {
    if (!file || !fs.existsSync(file)) return false;
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 16 * 1024 * 1024) return false;
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim();
    if (!text) return false;
    if (name === '.cookie') return neteaseCookieHasLogin(text);
    if (name === '.qq-cookie') return qqCookieHasLogin(text);
    if (name === '.kugou-cookie') return kugouCookieHasLogin(text);
    if (name === '.qishui-cookie') return qishuiCookieHasLogin(text);
    if (name === '.qishui-token') return text.length >= 10;
    if (name === 'cuefield-feedback.jsonl') {
      return text.split(/\r?\n/).filter(Boolean).every(line => {
        try { return !!JSON.parse(line); } catch (_) { return false; }
      });
    }
    if (/\.json$/i.test(name)) return !!JSON.parse(text);
    return true;
  } catch (_) {
    return false;
  }
}

function migrateMisplacedAppOwnedFiles() {
  const sources = [];
  const addSource = (value) => {
    if (!value) return;
    const resolved = path.resolve(value);
    if (resolved === path.resolve(STABLE_USER_DATA_PATH) || sources.includes(resolved)) return;
    sources.push(resolved);
  };
  try { addSource(app.getPath('sessionData')); } catch (_) {}
  addSource(chromiumSessionDataPath(cacheSettings));

  fs.mkdirSync(STABLE_USER_DATA_PATH, { recursive: true });
  APP_OWNED_MIGRATION_FILES.forEach((name) => {
    const target = path.join(STABLE_USER_DATA_PATH, name);
    let best = appOwnedMigrationFileValid(name, target)
      ? { file: target, mtimeMs: fs.statSync(target).mtimeMs }
      : null;
    sources.forEach((sourceDir) => {
      const candidate = path.join(sourceDir, name);
      if (!appOwnedMigrationFileValid(name, candidate)) return;
      const mtimeMs = fs.statSync(candidate).mtimeMs;
      if (!best || mtimeMs > best.mtimeMs) best = { file: candidate, mtimeMs };
    });
    if (!best || path.resolve(best.file) === path.resolve(target)) return;
    try {
      fs.copyFileSync(best.file, target);
      fs.utimesSync(target, new Date(), new Date(best.mtimeMs));
      console.log('[UserDataMigration] restored', name);
    } catch (error) {
      console.warn('[UserDataMigration] skipped', name, error.message);
    }
  });
}

function removeDeprecatedKugouVipEvidenceFiles() {
  const fileName = '.kugou-vip-evidence.json';
  const candidates = [
    { label: 'stable-user-data', file: path.join(STABLE_USER_DATA_PATH, fileName) },
    { label: 'legacy-resource-dir', file: path.join(__dirname, '..', fileName) },
  ];
  const removed = [];
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate.file)) continue;
      fs.unlinkSync(candidate.file);
      removed.push(candidate.label);
    } catch (error) {
      console.warn('[UserDataMigration] deprecated Kugou VIP evidence cleanup skipped', candidate.label, error.message);
    }
  }
  if (removed.length) {
    console.log('[UserDataMigration] removed deprecated Kugou VIP evidence', removed.join(','));
  }
}

function migrateLegacyAuthStorage() {
  removeDeprecatedKugouVipEvidenceFiles();
  migrateMisplacedAppOwnedFiles();
  try {
    const legacyNeteaseCookie = path.join(__dirname, '..', '.cookie');
    if (fs.existsSync(legacyNeteaseCookie)) {
      if (!fs.existsSync(process.env.COOKIE_FILE)) {
        fs.copyFileSync(legacyNeteaseCookie, process.env.COOKIE_FILE);
      }
      fs.unlinkSync(legacyNeteaseCookie);
    }
  } catch (e) {
    console.warn('Netease cookie migration skipped:', e.message);
  }
  try {
    const legacyQQCookie = path.join(__dirname, '..', '.qq-cookie');
    if (fs.existsSync(legacyQQCookie)) {
      if (!fs.existsSync(process.env.QQ_COOKIE_FILE)) {
        fs.copyFileSync(legacyQQCookie, process.env.QQ_COOKIE_FILE);
      }
      fs.unlinkSync(legacyQQCookie);
    }
  } catch (e) {
    console.warn('QQ cookie migration skipped:', e.message);
  }
  try {
    const legacyKugouCookie = path.join(__dirname, '..', '.kugou-cookie');
    if (fs.existsSync(legacyKugouCookie)) {
      if (!fs.existsSync(process.env.KUGOU_COOKIE_FILE)) {
        fs.copyFileSync(legacyKugouCookie, process.env.KUGOU_COOKIE_FILE);
      }
      fs.unlinkSync(legacyKugouCookie);
    }
  } catch (e) {
    console.warn('Kugou cookie migration skipped:', e.message);
  }
  try {
    const legacyQishuiCookie = path.join(__dirname, '..', '.qishui-cookie');
    if (fs.existsSync(legacyQishuiCookie)) {
      if (!fs.existsSync(process.env.QISHUI_COOKIE_FILE)) {
        fs.copyFileSync(legacyQishuiCookie, process.env.QISHUI_COOKIE_FILE);
      }
      fs.unlinkSync(legacyQishuiCookie);
    }
  } catch (e) {
    console.warn('Qishui cookie migration skipped:', e.message);
  }
  try {
    const legacyQishuiToken = path.join(__dirname, '..', '.qishui-token');
    if (fs.existsSync(legacyQishuiToken)) {
      if (!fs.existsSync(process.env.QISHUI_TOKEN_FILE)) {
        fs.copyFileSync(legacyQishuiToken, process.env.QISHUI_TOKEN_FILE);
      }
      fs.unlinkSync(legacyQishuiToken);
    }
  } catch (e) {
    console.warn('Qishui token migration skipped:', e.message);
  }
  try {
    const qishuiOAuthTarget = process.env.QISHUI_OAUTH_CONFIG_FILE;
    const legacyQishuiOAuthFiles = [
      path.join(__dirname, '..', '.qishui-oauth.json'),
      path.join(__dirname, '..', 'qishui-oauth.json'),
    ];
    for (const legacyQishuiOAuth of legacyQishuiOAuthFiles) {
      if (qishuiOAuthTarget && fs.existsSync(legacyQishuiOAuth) && !fs.existsSync(qishuiOAuthTarget)) {
        fs.copyFileSync(legacyQishuiOAuth, qishuiOAuthTarget);
        break;
      }
    }
  } catch (e) {
    console.warn('Qishui OAuth config migration skipped:', e.message);
  }
  try {
    const legacySpotifyToken = path.join(__dirname, '..', '.spotify-token.json');
    if (fs.existsSync(legacySpotifyToken)) {
      if (!fs.existsSync(process.env.SPOTIFY_TOKEN_FILE)) {
        fs.copyFileSync(legacySpotifyToken, process.env.SPOTIFY_TOKEN_FILE);
      }
      fs.unlinkSync(legacySpotifyToken);
    }
  } catch (e) {
    console.warn('Spotify token migration skipped:', e.message);
  }
  try {
    const spotifyConfigTarget = process.env.SPOTIFY_CONFIG_FILE;
    const legacySpotifyConfigFiles = [
      path.join(__dirname, '..', '.spotify-credentials.json'),
      path.join(__dirname, '..', 'spotify-credentials.json'),
    ];
    for (const legacySpotifyConfig of legacySpotifyConfigFiles) {
      if (spotifyConfigTarget && fs.existsSync(legacySpotifyConfig) && !fs.existsSync(spotifyConfigTarget)) {
        fs.copyFileSync(legacySpotifyConfig, spotifyConfigTarget);
        break;
      }
    }
  } catch (e) {
    console.warn('Spotify config migration skipped:', e.message);
  }
}

async function ensureLocalServerStarted() {
  if (localServer && localServer.listening) return localServer;
  if (localServerStartPromise) return localServerStartPromise;
  localServerStartPromise = (async () => {
    const injectedDelay = Math.max(0, Math.min(15000, Number(process.env.MINERADIO_STARTUP_TEST_SERVER_DELAY_MS) || 0));
    if (injectedDelay) await startupDelay(injectedDelay);
    const port = await withStartupTimeout(findOpenPort(3000), 5000, 'findOpenPort');
    mainServerPort = port;
    configureLocalAppPermissions();
    configureLocalServerEnvironment(port);
    migrateLegacyAuthStorage();
    await initializeLoginEasterEggGate();

    const serverModulePath = path.join(__dirname, '..', 'server.js');
    try { delete require.cache[require.resolve(serverModulePath)]; } catch (_) {}
    localServer = require(serverModulePath);
    await waitForServer(localServer, STARTUP_SERVER_TIMEOUT_MS);
    await waitForLocalHttpReady(port, STARTUP_HTTP_TIMEOUT_MS);
    writeStartupState('server-ready', { serverReadyAt: Date.now(), port });
    return localServer;
  })().catch((error) => {
    if (localServer && localServer.close) {
      try { localServer.close(); } catch (_) {}
    }
    localServer = null;
    mainServerPort = 0;
    throw error;
  }).finally(() => {
    localServerStartPromise = null;
  });
  return localServerStartPromise;
}

function showMainWindowSafely(win, reason) {
  if (!win || win.isDestroyed()) return false;
  // A renderer may be reloaded while the user intentionally keeps Mineradio
  // in the tray. Runtime recovery must never turn that reload into a surprise
  // foreground window.
  if (startupCompleted && win.__mineradioIntentionalHide === true) return false;
  markMainWindowExpectedVisible(win, true, reason || 'show-safe');
  if (win.__mineradioStartupShowTimer) {
    clearTimeout(win.__mineradioStartupShowTimer);
    win.__mineradioStartupShowTimer = null;
  }
  ensureMainWindowInsideDisplay(win);
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  resetMainWindowZoom(win);
  sendWindowState(win);
  if (!startupState.windowVisibleAt) {
    writeStartupState('window-visible', { windowVisibleAt: Date.now(), visibleReason: String(reason || '') });
  }
  if (reason) console.log('[StartupWindow] visible:', reason);
  return true;
}

function markMainWindowExpectedVisible(win, expected, reason) {
  if (!win || win.isDestroyed()) return;
  win.__mineradioExpectedVisible = expected === true;
  win.__mineradioExpectedVisibleReason = String(reason || '');
}

function clearMainWindowVisibilityGuard() {
  if (mainWindowVisibilityTimer) clearInterval(mainWindowVisibilityTimer);
  mainWindowVisibilityTimer = null;
  if (mainWindowMinimizeRecoveryTimer) clearTimeout(mainWindowMinimizeRecoveryTimer);
  mainWindowMinimizeRecoveryTimer = null;
}

function clearMainWindowFullscreenVisibilityGuard() {
  if (mainWindowFullscreenVisibilityTimer) clearInterval(mainWindowFullscreenVisibilityTimer);
  mainWindowFullscreenVisibilityTimer = null;
}

function shouldRestoreUnexpectedMainWindowVisibility(win) {
  if (!win || win.isDestroyed() || appQuitting || !startupCompleted) return false;
  if (win.__mineradioIntentionalHide === true || win.__mineradioExpectedVisible === false) return false;
  if (fullDesktopModeHostVisibilityTransitionDepth > 0 || fullDesktopModeRuntime.getStatus('main-window-visibility-guard').enabled === true) return false;
  if (win.isMinimized() || win.isVisible()) return false;
  return true;
}

function shouldRestoreUnexpectedMainWindowMinimize(win) {
  if (!win || win.isDestroyed() || appQuitting || !startupCompleted) return false;
  if (win.__mineradioIntentionalHide === true || win.__mineradioExpectedVisible === false) return false;
  if (win.__mineradioIntentionalMinimize === true) return false;
  if (fullDesktopModeHostVisibilityTransitionDepth > 0 || fullDesktopModeRuntime.getStatus('main-window-minimize-guard').enabled === true) return false;
  return win.isMinimized();
}

function shouldRestoreUnexpectedFullscreenVisibility(win) {
  if (!win || win.isDestroyed() || appQuitting || win.__mineradioIntentionalHide === true) return false;
  if (fullDesktopModeHostVisibilityTransitionDepth > 0 || fullDesktopModeRuntime.getStatus('fullscreen-visibility-guard').enabled === true) return false;
  if (!win.isFullScreen() || win.isMinimized() || win.isVisible()) return false;
  return true;
}

function restoreHiddenMainWindow(win, reason, scope) {
  console.warn(`[WindowRecovery] restoring unexpectedly hidden ${scope} window:`, reason);
  markMainWindowExpectedVisible(win, true, `visibility-recovered-${reason}`);
  win.__mineradioIntentionalHide = false;
  ensureMainWindowInsideDisplay(win);
  try { win.showInactive(); } catch (_) { try { win.show(); } catch (_) { } }
  resetMainWindowZoom(win);
  if (fullDesktopModeHostVisibilityTransitionDepth <= 0) {
    resumeWallpaperEngineForVisibleHost(win, `visibility-recovered-${reason}`);
  }
  sendWindowState(win);
  return true;
}

function restoreUnexpectedMainWindowMinimize(win, reason = 'minimize-visibility-guard') {
  if (!shouldRestoreUnexpectedMainWindowMinimize(win)) return false;
  console.warn('[WindowRecovery] restoring unexpectedly minimized main window:', reason);
  clearMainWindowMinimizeIntent(win);
  markMainWindowExpectedVisible(win, true, `minimize-recovered-${reason}`);
  win.__mineradioIntentionalHide = false;
  writeStartupState('window-minimize-recovered', {
    minimizeRecoveryAt: Date.now(),
    minimizeRecoveryReason: String(reason || ''),
  });
  ensureMainWindowInsideDisplay(win);
  try { win.restore(); } catch (_) { }
  if (!win.isVisible()) {
    try { win.showInactive(); } catch (_) { try { win.show(); } catch (_) { } }
  }
  resetMainWindowZoom(win);
  if (fullDesktopModeHostVisibilityTransitionDepth <= 0) {
    resumeWallpaperEngineForVisibleHost(win, `minimize-recovered-${reason}`);
  }
  sendWindowState(win);
  return true;
}

function restoreUnexpectedFullscreenVisibility(win, reason = 'fullscreen-visibility-guard') {
  if (!shouldRestoreUnexpectedFullscreenVisibility(win)) return false;
  return restoreHiddenMainWindow(win, reason, 'fullscreen');
}

function restoreUnexpectedMainWindowVisibility(win, reason = 'main-window-visibility-guard') {
  if (shouldRestoreUnexpectedMainWindowMinimize(win)) {
    return restoreUnexpectedMainWindowMinimize(win, reason);
  }
  if (shouldRestoreUnexpectedFullscreenVisibility(win)) {
    return restoreUnexpectedFullscreenVisibility(win, reason);
  }
  if (!shouldRestoreUnexpectedMainWindowVisibility(win)) return false;
  return restoreHiddenMainWindow(win, reason, 'main');
}

function startMainWindowVisibilityGuard(win) {
  clearMainWindowVisibilityGuard();
  if (!win || win.isDestroyed()) return;
  mainWindowVisibilityTimer = setInterval(() => {
    restoreUnexpectedMainWindowVisibility(win, 'visibility-watchdog');
  }, MAIN_WINDOW_VISIBILITY_CHECK_MS);
  if (typeof mainWindowVisibilityTimer.unref === 'function') mainWindowVisibilityTimer.unref();
}

function startMainWindowFullscreenVisibilityGuard(win) {
  clearMainWindowFullscreenVisibilityGuard();
  if (!win || win.isDestroyed()) return;
  mainWindowFullscreenVisibilityTimer = setInterval(() => {
    restoreUnexpectedFullscreenVisibility(win, 'fullscreen-watchdog');
  }, FULLSCREEN_VISIBILITY_CHECK_MS);
  if (typeof mainWindowFullscreenVisibilityTimer.unref === 'function') mainWindowFullscreenVisibilityTimer.unref();
}

function reserveMainWindowRendererRecoveryAttempt() {
  const now = Date.now();
  mainWindowRendererRecoveryAttempts = mainWindowRendererRecoveryAttempts.filter(at => now - at < RENDERER_RECOVERY_WINDOW_MS);
  if (mainWindowRendererRecoveryAttempts.length >= RENDERER_RECOVERY_MAX_ATTEMPTS) return 0;
  mainWindowRendererRecoveryAttempts.push(now);
  return mainWindowRendererRecoveryAttempts.length;
}

function startupNavigationUrlMatches(actualUrl, expectedUrl) {
  try {
    return new URL(String(actualUrl || '')).href === new URL(String(expectedUrl || '')).href;
  } catch (_) {
    return false;
  }
}

function createTrustedMainDocumentReadySignal(win, expectedUrl) {
  const webContents = win && win.webContents;
  let ready = false;
  let readyUrl = '';
  let readyPhase = '';
  let rejectedHttpResponse = false;
  let resolveReady;
  const promise = new Promise((resolve) => { resolveReady = resolve; });
  const markReady = (phase, eventUrl = '', httpResponseCode = 200) => {
    if (ready || !webContents || webContents.isDestroyed()) return;
    const candidateUrl = String(eventUrl || webContents.getURL() || '');
    if (!isTrustedMainDocumentUrl(candidateUrl)
      || !startupNavigationUrlMatches(candidateUrl, expectedUrl)) return;
    if (Number(httpResponseCode) >= 400) {
      rejectedHttpResponse = true;
      return;
    }
    if (rejectedHttpResponse) return;
    ready = true;
    readyUrl = candidateUrl;
    readyPhase = String(phase || 'trusted-main-document');
    if (win && !win.isDestroyed()) {
      win.__mineradioTrustedMainDocumentReady = {
        url: readyUrl,
        phase: readyPhase,
        at: Date.now(),
      };
    }
    resolveReady({ url: readyUrl, phase: readyPhase });
  };
  const onDidNavigate = (_event, url, httpResponseCode) => markReady('did-navigate', url, httpResponseCode);
  const onDomReady = () => markReady('dom-ready');
  const onDidFinishLoad = () => markReady('did-finish-load');
  webContents.on('did-navigate', onDidNavigate);
  webContents.on('dom-ready', onDomReady);
  webContents.on('did-finish-load', onDidFinishLoad);
  return {
    promise,
    isReady: () => ready,
    url: () => readyUrl,
    phase: () => readyPhase,
    cancel: () => {
      if (!webContents || webContents.isDestroyed()) return;
      webContents.removeListener('did-navigate', onDidNavigate);
      webContents.removeListener('dom-ready', onDomReady);
      webContents.removeListener('did-finish-load', onDidFinishLoad);
    },
  };
}

function recoverMainWindowAfterRendererGone(win, details = {}, cleanupPromise = null) {
  if (!win || win.isDestroyed() || win !== mainWindow || appQuitting) return Promise.resolve(false);
  if (String(details.reason || '') === 'clean-exit') return Promise.resolve(false);
  if (mainWindowRendererRecoveryPromise) return mainWindowRendererRecoveryPromise;
  const attempt = reserveMainWindowRendererRecoveryAttempt();
  if (!attempt) {
    const error = new Error('renderer recovery limit reached');
    const log = writeStartupErrorLog('Runtime renderer recovery', 'MR-RUNTIME-RENDERER-LOOP', error);
    dialog.showErrorBox('Mineradio 显示恢复失败', `前台界面连续异常退出，已停止自动重载。\n日志：${log.file}`);
    return Promise.resolve(false);
  }
  const keepFullscreen = win.isFullScreen() || windowFullscreenActive;
  const keepIntentionallyHidden = win.__mineradioIntentionalHide === true;
  mainWindowRendererRecoveryPromise = (async () => {
    // Do not navigate synchronously from render-process-gone. Chromium may
    // still be finalizing the dead renderer during the event callback.
    await startupDelay(320);
    if (appQuitting || win.isDestroyed() || win !== mainWindow) return false;
    if (cleanupPromise) await Promise.resolve(cleanupPromise);
    if (appQuitting || win.isDestroyed() || win !== mainWindow) return false;
    await ensureLocalServerStarted();
    await loadMainWindowWithRetry(win);
    if (keepFullscreen && !win.isFullScreen()) {
      windowFullscreenActive = true;
      setMainWindowFullscreenResizeGuard(win, true);
      win.setFullScreen(true);
    }
    win.__mineradioIntentionalHide = keepIntentionallyHidden;
    if (!keepIntentionallyHidden) showMainWindowSafely(win, `renderer-recovered-${attempt}`);
    else sendWindowState(win);
    writeStartupState('renderer-recovered', {
      rendererRecoveredAt: Date.now(),
      rendererRecoveryAttempt: attempt,
      rendererGoneReason: String(details.reason || 'unknown'),
    });
    return true;
  })().catch((error) => {
    const log = writeStartupErrorLog('Runtime renderer recovery', 'MR-RUNTIME-RENDERER-LOAD', error);
    console.error('[WindowRecovery] renderer reload failed:', error && error.message || error);
    if (!appQuitting && !win.isDestroyed()) {
      if (!keepIntentionallyHidden) {
        try { win.show(); } catch (_) { }
      }
      if (attempt >= RENDERER_RECOVERY_MAX_ATTEMPTS) {
        dialog.showErrorBox('Mineradio 显示恢复失败', `前台界面无法重新加载。\n日志：${log.file}`);
      }
    }
    return false;
  }).finally(() => {
    mainWindowRendererRecoveryPromise = null;
  });
  return mainWindowRendererRecoveryPromise;
}

async function loadMainWindowWithRetry(win) {
  const port = mainServerPort || process.env.PORT || 3000;
  const baseUrl = `http://127.0.0.1:${port}`;
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (!win || win.isDestroyed()) throw new Error('Main BrowserWindow was destroyed before navigation');
    const targetUrl = `${baseUrl}/?startupAttempt=${attempt}&startupAt=${Date.now()}`;
    const readySignal = createTrustedMainDocumentReadySignal(win, targetUrl);
    try {
      writeStartupState('navigation-attempt', { navigationAttempt: attempt, navigationAt: Date.now(), targetUrl });
      if (attempt === 1 && process.env.MINERADIO_STARTUP_TEST_FAIL_FIRST_NAV === '1') {
        const injected = new Error('Injected first navigation failure for startup QA');
        injected.code = 'MINERADIO_STARTUP_QA_INJECTED';
        throw injected;
      }
      if (!win.isDestroyed()) win.__mineradioTrustedMainDocumentReady = null;
      const loadPromise = win.loadURL(targetUrl);
      const stallObservedLoadPromise = process.env.MINERADIO_STARTUP_TEST_STALL_LOAD_PROMISE === '1';
      if (stallObservedLoadPromise) loadPromise.catch(() => {});
      const observedLoadPromise = stallObservedLoadPromise ? new Promise(() => {}) : loadPromise;
      await withStartupTimeout(
        Promise.race([observedLoadPromise, readySignal.promise]),
        STARTUP_NAVIGATION_TIMEOUT_MS,
        `loadURL attempt ${attempt}`,
        () => {
          if (readySignal.isReady()) return;
          try { win.webContents.stop(); } catch (_) {}
        },
      );
      writeStartupState('navigation-ready', {
        navigationAttempt: attempt,
        navigationReadyAt: Date.now(),
        navigationReadyPhase: readySignal.phase() || 'load-url',
        targetUrl,
      });
      return targetUrl;
    } catch (error) {
      if (error && error.code === 'MINERADIO_STARTUP_TIMEOUT' && readySignal.isReady()) {
        const recoveredUrl = readySignal.url() || targetUrl;
        writeStartupState('navigation-ready-recovered', {
          navigationAttempt: attempt,
          navigationReadyAt: Date.now(),
          navigationReadyPhase: readySignal.phase() || 'trusted-current-document',
          targetUrl: recoveredUrl,
        });
        return recoveredUrl;
      }
      lastError = error;
      writeStartupState('navigation-retry', { navigationAttempt: attempt, retryAt: Date.now(), lastNavigationError: String(error && error.message || error) });
      console.warn(`[StartupWindow] navigation attempt ${attempt} failed:`, error.message || error);
      try { win.webContents.stop(); } catch (_) {}
      if (attempt < 2) await startupDelay(500);
    } finally {
      readySignal.cancel();
    }
  }
  const error = new Error(`loadURL failed after retry: ${startupErrorText(lastError)}`);
  error.code = (lastError && lastError.code) || 'MINERADIO_NAVIGATION_FAILED';
  throw error;
}

async function createWindowOnce() {
  htmlFullscreenActive = false;
  windowFullscreenActive = false;
  startupCompleted = false;
  startupState = {
    pid: process.pid,
    runtimeName: APP_NAME,
    startedAt: Date.now(),
    phase: 'window-create-start',
    events: [],
  };

  const initialBounds = getWindowedBounds();
  const initialMinimum = getAdaptiveWindowMinimumSize(screen.getPrimaryDisplay());
  const win = new BrowserWindow({
    ...initialBounds,
    minWidth: initialMinimum.width,
    minHeight: initialMinimum.height,
    show: false,
    frame: false,
    fullscreen: false,
    resizable: true,
    transparent: true,
    opacity: process.env.MINERADIO_STARTUP_QA_HIDDEN === '1' ? 0 : 1,
    backgroundColor: '#00000000',
    hasShadow: true,
    autoHideMenuBar: true,
    title: APP_NAME,
    icon: APP_ICON_ICO,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: MAIN_WINDOW_BACKGROUND_THROTTLING,
    },
  });
  mainWindow = win;
  hookExplorerRestartForFullDesktop(win);
  hookMainWindowMinimizeIntent(win);
  writeStartupState('window-created', { windowCreatedAt: Date.now() });

  win.__mineradioStartupShowTimer = setTimeout(() => {
    showMainWindowSafely(win, 'watchdog');
  }, STARTUP_SHOW_WATCHDOG_MS);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isTrustedMainDocumentUrl(url)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(String(url || ''))) shell.openExternal(url).catch(() => {});
  });
  win.webContents.on('did-start-navigation', (_event, url, isInPlace, isMainFrame) => {
    if (!isMainFrame || isInPlace || !isTrustedMainDocumentUrl(url)) return;
    win.__mineradioTrustedMainDocumentReady = null;
    stopWallpaperEngineRuntimeForRenderer('main-frame-navigation');
    closeWallpaperWindow('main-frame-navigation').catch(() => {});
  });
  win.webContents.once('destroyed', () => {
    stopWallpaperEngineRuntimeForRenderer('webcontents-destroyed');
    closeWallpaperWindow('webcontents-destroyed').catch(() => {});
  });

  win.webContents.on('did-finish-load', () => {
    showMainWindowSafely(win, 'did-finish-load');
  });
  win.webContents.on('dom-ready', () => {
    showMainWindowSafely(win, 'dom-ready');
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    console.warn('[StartupWindow] did-fail-load:', errorCode, errorDescription, validatedURL || '');
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    const cleanupPromise = Promise.allSettled([
      stopWallpaperEngineRuntimeForRenderer(`render-process-gone:${details && details.reason || 'unknown'}`),
      closeWallpaperWindow(`main-renderer-gone:${details && details.reason || 'unknown'}`),
    ]);
    const error = new Error(`renderer process gone: ${details && details.reason || 'unknown'} exitCode=${details && details.exitCode}`);
    console.error('[StartupWindow]', error.message);
    writeStartupErrorLog(
      startupCompleted ? 'Runtime renderer process gone' : 'Renderer process gone',
      startupCompleted ? 'MR-RUNTIME-RENDERER-GONE' : 'MR-BOOT-GPU',
      error
    );
    if (startupCompleted && String(details && details.reason || '') !== 'clean-exit') {
      setTimeout(() => recoverMainWindowAfterRendererGone(win, details, cleanupPromise), 0);
    }
  });
  win.on('unresponsive', () => {
    console.warn('[StartupWindow] main window became unresponsive', { startupCompleted });
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (isZoomShortcutInput(input)) {
      event.preventDefault();
      resetMainWindowZoom(win);
      return;
    }
    if (input.type === 'keyDown' && (input.key === 'Escape' || input.code === 'Escape')
      && fullDesktopModeRuntime.getStatus('escape-key-input').enabled === true) {
      event.preventDefault();
      requestFullDesktopEscapeExit('escape-key');
      return;
    }
    if (input.type === 'keyDown' && (input.key === 'Escape' || input.code === 'Escape') && win.isFullScreen()) {
      event.preventDefault();
      exitFullscreenToWindow(win);
    }
  });

  win.once('ready-to-show', () => showMainWindowSafely(win, 'ready-to-show'));
  win.on('maximize', () => sendWindowState(win));
  win.on('unmaximize', () => sendWindowState(win));
  win.on('minimize', () => {
    const minimizeIntent = consumeMainWindowMinimizeIntent(win);
    writeStartupState('window-minimized', {
      windowMinimizedAt: Date.now(),
      windowMinimizeIntentional: minimizeIntent.intentional,
      windowMinimizeReason: minimizeIntent.reason || 'unexpected',
    });
    sendWindowState(win);
    if (fullDesktopModeHostVisibilityTransitionDepth <= 0) suspendWallpaperEngineForHiddenHost(win, 'minimize');
    if (minimizeIntent.intentional) {
      scheduleAppMemoryTrim('minimize', 1600);
      return;
    }
    if (mainWindowMinimizeRecoveryTimer) clearTimeout(mainWindowMinimizeRecoveryTimer);
    mainWindowMinimizeRecoveryTimer = setTimeout(() => {
      mainWindowMinimizeRecoveryTimer = null;
      restoreUnexpectedMainWindowMinimize(win, 'minimize-event');
    }, MAIN_WINDOW_MINIMIZE_RECOVERY_DELAY_MS);
  });
  win.on('restore', () => {
    if (mainWindowMinimizeRecoveryTimer) clearTimeout(mainWindowMinimizeRecoveryTimer);
    mainWindowMinimizeRecoveryTimer = null;
    clearMainWindowMinimizeIntent(win);
    win.__mineradioIntentionalHide = false;
    markMainWindowExpectedVisible(win, true, 'restore');
    sendWindowState(win);
    if (fullDesktopModeHostVisibilityTransitionDepth <= 0) resumeWallpaperEngineForVisibleHost(win, 'restore');
  });
  win.on('show', () => {
    win.__mineradioIntentionalHide = false;
    markMainWindowExpectedVisible(win, true, 'show');
    if (fullDesktopModeHostVisibilityTransitionDepth > 0) return;
    sendWindowState(win);
    resumeWallpaperEngineForVisibleHost(win, 'show');
  });
  win.on('hide', () => {
    if (fullDesktopModeHostVisibilityTransitionDepth > 0) return;
    sendWindowState(win);
    suspendWallpaperEngineForHiddenHost(win, 'hide');
    if (win.__mineradioIntentionalHide !== true && win.__mineradioExpectedVisible !== false && !win.isMinimized()) {
      setTimeout(() => restoreUnexpectedMainWindowVisibility(win, 'hide-event'), MAIN_WINDOW_HIDE_RECOVERY_DELAY_MS);
    }
    scheduleAppMemoryTrim('hide', 2200);
  });
  win.on('focus', () => sendWindowState(win));
  win.on('blur', () => sendWindowState(win));
  win.on('move', () => {
    updateMainWindowMinimumSize(win);
    scheduleWindowStateSend(win);
    scheduleWallpaperEngineHostBoundsRestart(win, 'move');
  });
  win.on('resize', () => {
    updateMainWindowMinimumSize(win);
    scheduleWindowStateSend(win);
    scheduleWallpaperEngineHostBoundsRestart(win, 'resize');
  });
  win.on('close', (event) => {
    const desktopMode = fullDesktopModeRuntime.getStatus('main-window-close');
    if (desktopMode.enabled === true) {
      event.preventDefault();
      if (win.__mineradioDesktopModeCloseArmed) return;
      win.__mineradioDesktopModeCloseArmed = true;
      disableFullDesktopMode('main-window-close').then((result) => {
        if (result && result.ok === true) {
          if (!win.isDestroyed()) win.close();
          return;
        }
        win.__mineradioDesktopModeCloseArmed = false;
        console.warn(
          '[FullDesktopMode] close detach incomplete; keeping main window open:',
          result && (result.error || result.status && result.status.lastError) || 'unknown'
        );
        if (!win.isDestroyed()) {
          if (!win.isVisible()) win.show();
          sendWindowState(win);
        }
      }).catch((error) => {
        win.__mineradioDesktopModeCloseArmed = false;
        console.warn('[FullDesktopMode] close detach failed; keeping main window open:', error && error.message || error);
        if (!win.isDestroyed()) {
          if (!win.isVisible()) win.show();
          sendWindowState(win);
        }
      });
      return;
    }
    if (!appQuitting && closeBehavior === 'tray') {
      event.preventDefault();
      win.__mineradioDesktopModeCloseArmed = false;
      createOrUpdateTray();
      win.__mineradioIntentionalHide = true;
      markMainWindowExpectedVisible(win, false, 'tray-hide');
      flushMainWindowFxAutosave('tray-hide').finally(() => {
        if (win.isDestroyed()) return;
        win.hide();
        sendWindowState(win);
        scheduleAppMemoryTrim('tray-hide', 2200);
      });
      return;
    }
    if (!mainWindowCloseFlushArmed) {
      event.preventDefault();
      mainWindowCloseFlushArmed = true;
      flushMainWindowFxAutosave('main-close').finally(() => {
        if (win.isDestroyed()) return;
        win.close();
      });
    }
  });
  win.on('closed', () => {
    mainWindowCloseFlushArmed = false;
    clearMainWindowVisibilityGuard();
    clearMainWindowFullscreenVisibilityGuard();
    mainWindowRendererRecoveryPromise = null;
    mainWindowRendererRecoveryAttempts = [];
    win.__mineradioDesktopModeCloseArmed = false;
    if (win.__mineradioStartupShowTimer) {
      clearTimeout(win.__mineradioStartupShowTimer);
      win.__mineradioStartupShowTimer = null;
    }
    if (mainWindowStateTimer) {
      clearTimeout(mainWindowStateTimer);
      mainWindowStateTimer = null;
    }
    if (appMemoryTrimTimer) {
      clearTimeout(appMemoryTrimTimer);
      appMemoryTrimTimer = null;
    }
    cancelWallpaperEngineHostBoundsRestart();
    fullDesktopModeHostVisibilityTransitionDepth = 0;
    wallpaperEngineHostVisibilitySuspended = false;
    wallpaperEngineHostVisibilityOperation += 1;
    wallpaperEngineHostVisibilityStopPromise = null;
    finishWallpaperEngineVisibleHostResume(win);
    if (mainWindow === win) {
      closeOverlayWindows('main-window-closed');
      mainWindow = null;
    }
  });
  win.on('enter-full-screen', () => {
    windowFullscreenActive = true;
    setMainWindowFullscreenResizeGuard(win, true);
    sendWindowState(win);
    startMainWindowFullscreenVisibilityGuard(win);
    // Some Windows builds coalesce the final resize event during native
    // fullscreen. Re-arm the settled debounce from the authoritative event.
    setTimeout(() => scheduleWallpaperEngineHostBoundsRestart(win, 'enter-full-screen'), 40);
  });
  win.on('leave-full-screen', () => {
    windowFullscreenActive = false;
    setMainWindowFullscreenResizeGuard(win, false);
    clearMainWindowFullscreenVisibilityGuard();
    setTimeout(() => {
      const targetDisplay = getFullscreenTargetDisplay(win);
      applyWindowedBounds(win, targetDisplay);
      windowFullscreenDisplayId = null;
      scheduleWallpaperEngineHostBoundsRestart(win, 'leave-full-screen');
    }, 50);
  });
  win.on('enter-html-full-screen', () => {
    htmlFullscreenActive = true;
    setMainWindowFullscreenResizeGuard(win, true);
    sendWindowState(win);
    setTimeout(() => scheduleWallpaperEngineHostBoundsRestart(win, 'enter-html-full-screen'), 40);
  });
  win.on('leave-html-full-screen', () => {
    htmlFullscreenActive = false;
    setMainWindowFullscreenResizeGuard(win, false);
    setTimeout(() => {
      applyWindowedBounds(win);
      scheduleWallpaperEngineHostBoundsRestart(win, 'leave-html-full-screen');
    }, 50);
  });

  const startupShell = path.join(__dirname, 'startup.html');
  if (fs.existsSync(startupShell)) {
    win.loadFile(startupShell).catch((error) => {
      if (!/ERR_ABORTED|ERR_FAILED/i.test(String(error && error.message || error))) {
        console.warn('[StartupWindow] startup shell skipped:', error.message || error);
      }
    });
  }

  await ensureLocalServerStarted();
  await loadMainWindowWithRetry(win);
  if (win.isDestroyed()) throw new Error('Main BrowserWindow was destroyed after navigation');
  startupCompleted = true;
  startMainWindowVisibilityGuard(win);
  showMainWindowSafely(win, 'navigation-complete');
  writeStartupState('ready', { readyAt: Date.now(), port: mainServerPort || Number(process.env.PORT) || 3000 });
  const qaExitMs = Math.max(0, Math.min(10000, Number(process.env.MINERADIO_STARTUP_QA_EXIT_MS) || 0));
  if (qaExitMs) {
    setTimeout(() => {
      appQuitting = true;
      app.quit();
    }, qaExitMs);
  }
  return win;
}

function createWindow() {
  if (mainWindowCreatePromise) return mainWindowCreatePromise;
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindowSafely(mainWindow, startupCompleted ? 'reuse' : 'startup-in-progress');
    if (startupCompleted) startMainWindowVisibilityGuard(mainWindow);
    return Promise.resolve(mainWindow);
  }
  mainWindowCreatePromise = createWindowOnce().finally(() => {
    mainWindowCreatePromise = null;
  });
  return mainWindowCreatePromise;
}

if (process.platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID);

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  writeStartupState('module-loaded', {
    runtimeName: APP_NAME,
    userData: STABLE_USER_DATA_PATH,
    sessionData: (() => { try { return app.getPath('sessionData'); } catch (_) { return ''; } })(),
  });
  app.on('second-instance', () => {
    if (startupCompleted && focusMainWindow()) return;
    app.whenReady()
      .then(() => createWindow())
      .then(() => focusMainWindow())
      .catch((e) => reportWindowCreationFailure('Second instance', e));
  });

  app.whenReady().then(async () => {
    try {
      await localMusicLibrary.installProtocol(protocol);
    } catch (error) {
      console.warn('[LocalMusic] media protocol unavailable:', error && error.message || error);
    }
    try {
      await wallpaperEngineLibrary.installProtocol(protocol);
    } catch (error) {
      console.warn('[Wallpaper Engine] local media protocol unavailable:', error && error.message || error);
    }
    const handleDisplayLayoutChanged = (_event, _display, changedMetrics) => {
      positionDesktopLyricsWindow();
      positionWallpaperWindow(Array.isArray(changedMetrics) ? 'display-metrics-changed' : 'display-layout-changed');
      if (fullDesktopModeRuntime.getStatus('display-layout-clamp').enabled !== true) {
        ensureMainWindowInsideDisplay(mainWindow);
      }
      scheduleWindowStateSend(mainWindow);
      scheduleWallpaperEngineHostBoundsRestart(
        mainWindow,
        Array.isArray(changedMetrics) ? 'display-metrics-changed' : 'display-layout-changed'
      );
    };
    screen.on('display-metrics-changed', handleDisplayLayoutChanged);
    screen.on('display-added', handleDisplayLayoutChanged);
    screen.on('display-removed', handleDisplayLayoutChanged);
    powerMonitor.on('resume', () => restoreUnexpectedMainWindowVisibility(mainWindow, 'system-resume'));
    powerMonitor.on('unlock-screen', () => restoreUnexpectedMainWindowVisibility(mainWindow, 'screen-unlock'));
    await createWindow();
  }).catch((e) => reportWindowCreationFailure('Main', e));

  app.on('activate', () => {
    if (startupCompleted && focusMainWindow()) return;
    createWindow()
      .then(() => focusMainWindow())
      .catch((e) => reportWindowCreationFailure('Activate', e));
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', (event) => {
    appQuitting = true;
    if (appQuitCleanupComplete) return;
    event.preventDefault();
    if (appQuitCleanupPromise) return;
    clearWallpaperEngineCaptureGrant();
    wallpaperEngineLibrary.dispose();
    stopMemoryAutoTimer();
    unregisterFullDesktopEscapeShortcut();
    unregisterMineradioGlobalHotkeys();
    closeDesktopLyricsWindow();
    if (localServer && localServer.close) localServer.close();
    if (tray) {
      try { tray.destroy(); } catch (e) {}
      tray = null;
    }
    const quitMainWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    const forceDestroyQuitMainWindow = (reason, detail) => {
      console.error(`[FullDesktopMode] ${reason}; destroying the exact main window as the HWND cleanup fallback.`, detail || '');
      if (!quitMainWindow || quitMainWindow.isDestroyed()) {
        console.warn('[FullDesktopMode] main window HWND fallback was already unavailable.');
        return;
      }
      try {
        quitMainWindow.destroy();
        console.warn('[FullDesktopMode] main window destroyed after incomplete desktop-mode cleanup.');
      } catch (destroyError) {
        console.error('[FullDesktopMode] main window HWND fallback destroy failed:', destroyError && destroyError.message || destroyError);
      }
    };
    const disposeFullDesktopModeWithGuard = async () => {
      let fullDesktopCleanupTimeout = null;
      let timedOut = false;
      const timeoutResult = new Promise((resolve) => {
        fullDesktopCleanupTimeout = setTimeout(() => {
          timedOut = true;
          resolve({ ok: false, error: 'FULL_DESKTOP_DISPOSE_TIMEOUT' });
        }, 7000);
      });
      let result = null;
      try {
        result = await Promise.race([
          fullDesktopModeRuntime.dispose('app-before-quit'),
          timeoutResult,
        ]);
      } catch (error) {
        if (fullDesktopCleanupTimeout) clearTimeout(fullDesktopCleanupTimeout);
        forceDestroyQuitMainWindow('dispose failed', error && error.message || error);
        return;
      }
      if (fullDesktopCleanupTimeout) clearTimeout(fullDesktopCleanupTimeout);
      if (!result || result.ok !== true) {
        const detail = result && (result.error || result.status && result.status.lastError) || 'unknown';
        forceDestroyQuitMainWindow(timedOut ? 'dispose timed out after 7000ms' : 'dispose incomplete', detail);
      }
    };
    let cleanupTimeout = null;
    const fullDesktopAndWallpaperEngineCleanup = (async () => {
      // A passive desktop host must become a verified top-level HWND before
      // its exact WE source/DWM companion is disposed. Running these in
      // parallel can race the native detach acknowledgement.
      await disposeFullDesktopModeWithGuard();
      await wallpaperEngineRuntime.dispose().then((result) => {
        if (result && result.ok === false) {
          console.warn('[Wallpaper Engine] dispose incomplete:', result.reason || 'WALLPAPER_ENGINE_WINDOW_CLOSE_FAILED');
        }
      }).catch((error) => {
        console.warn('[Wallpaper Engine] dispose failed:', error && error.message || error);
      });
    })();
    const runtimeCleanup = fullDesktopAndWallpaperEngineCleanup;
    const timeoutCleanup = new Promise((resolve) => {
      cleanupTimeout = setTimeout(() => {
        console.warn('[Shutdown] runtime cleanup exceeded 15000ms; continuing bounded application exit.');
        resolve();
      }, 15000);
    });
    appQuitCleanupPromise = Promise.race([runtimeCleanup, timeoutCleanup]).finally(() => {
      if (cleanupTimeout) clearTimeout(cleanupTimeout);
      appQuitCleanupComplete = true;
      app.quit();
    });
  });
}
