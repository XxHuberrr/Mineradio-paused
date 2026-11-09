'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { Readable } = require('stream');

const WALLPAPER_ENGINE_SCHEME = 'mineradio-wallpaper';
const WALLPAPER_ENGINE_APP_ID = '431960';
const CONFIG_FILE = 'wallpaper-engine-library.json';
const MAX_PROJECT_JSON_BYTES = 1024 * 1024;
const CACHE_TTL_MS = 30 * 1000;
const MAX_MANUAL_SCAN_DIRS = 4000;
const SCENE_PACKAGE_EXTENSIONS = new Set(['.pkg', '.pak']);
const AUDIO_PROPERTY_HINT = /(?:\bvolume\b|\bmute(?:d)?\b|\bsilent\b|\baudio\s*(?:volume|level|gain|enable|enabled|toggle)\b|\bmusic\s*(?:volume|level|gain|size|enable|enabled|toggle)\b|\bsound\s*(?:volume|level|gain|enable|enabled|toggle)\b|音量|静音|无声|音乐(?:大小|音量|开关)|声音(?:大小|音量|开关)|音效(?:大小|音量|开关))/i;
const AUDIO_PROPERTY_KEY = /^(?:volume|dbvolume|musicvolume|music_volume|audiovolume|audio_volume|soundvolume|sound_volume|bgmvolume|bgm_volume|muteaudio|audiomute|mutemusic|musicmute|music|audio|sound|bgm)$/i;
const AUDIO_STANDALONE_LABEL = /^(?:(?:background\s*(?:audio|music|sound)|背景(?:音频|音乐|声音))|(?:audio|music|sound|bgm|音频|音乐|声音)(?:[\s,，、/_-]*(?:audio|music|sound|bgm|音频|音乐|声音|\d+))*)$/i;
const AUDIO_VISUAL_HINT = /(?:visuali[sz](?:er|ation)|\bbars?\b|\bring\b|\bpulse\b|\bthreshold\b|\bsensitiv(?:e|ity)\b|\bintensity\b|\bcolou?r\b|\bopacity\b|\btransparen(?:cy|t)\b|\bbounce\b|\bflicker\b|\balbum\b|\binformation\b|\bresponse\b|\breactive\b|\bfrequency\b|\bspectrum\b|\bwave\b|\bnote\b|可视|频谱|跳动|闪烁|响应|颜色|透明|专辑|封面|信息)/i;
const AUDIO_DECIBEL_HINT = /(?:\bdb\b|decibel|分贝)/i;
const AUDIO_OFF_OPTION_HINT = /(?:\bnone\b|\boff\b|\bmute(?:d)?\b|\bsilent\b|\bdisable(?:d)?\b|关闭|静音|无声|不要音乐|无音乐)/i;
const MUTE_PROPERTY_HINT = /(?:\bmute(?:d)?\b|\bsilent\b|静音|无声)/i;
const AUDIO_MUTE_PROPERTY_KEYS = new Set(['muteaudio', 'audiomute', 'mutemusic', 'musicmute']);
const AUDIO_DECIBEL_PROPERTY_KEYS = new Set(['dbvolume']);
const AUDIO_ENABLE_PROPERTY_KEYS = new Set([
  'audioenable', 'audioenabled',
  'musicenable', 'musicenabled',
  'soundenable', 'soundenabled',
  'bgmenable', 'bgmenabled',
]);
const SAFE_PROPERTY_KEY = /^[a-z0-9_.-]{1,128}$/i;
const BLOCKED_PROPERTY_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_SCENE_PROPERTIES = 256;
const MAX_PROPERTY_OPTIONS = 64;

const IMAGE_MIME = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
]);
const VIDEO_MIME = new Map([
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.m4v', 'video/mp4'],
  ['.mov', 'video/quicktime'],
]);
const SAFE_MIME = new Map([...IMAGE_MIME, ...VIDEO_MIME]);

function registerWallpaperEngineScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{
    scheme: WALLPAPER_ENGINE_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  }]);
}

function normalizeAbsolutePath(value) {
  const raw = String(value || '').trim().replace(/^"|"$/g, '');
  if (!raw) return '';
  try { return path.resolve(raw); } catch (_) { return ''; }
}

function pathKey(value) {
  return normalizeAbsolutePath(value).replace(/[\\/]+$/, '').toLowerCase();
}

function opaqueId(value) {
  return crypto.createHash('sha256').update(pathKey(value)).digest('hex').slice(0, 24);
}

function sanitizeText(value, fallback) {
  const text = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return text || String(fallback || 'Wallpaper Engine');
}

function sanitizePropertyLabel(value, fallback) {
  return sanitizeText(String(value || '')
    .replace(/<[^>]{0,512}>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, ' '), fallback);
}

function normalizeScenePropertyValue(value, maximumLength = 512) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maximumLength);
  }
  return null;
}

function analyzeSceneProperties(project) {
  const muteProperties = Object.create(null);
  muteProperties.volume = 0;
  const descriptors = [];
  const properties = project && project.general && project.general.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return {
      properties: descriptors,
      muteProperties: { ...muteProperties },
      propertyCount: 0,
      audioPropertyCount: 0,
      mutedAudioPropertyCount: 0,
    };
  }
  let audioPropertyCount = 0;
  let mutedAudioPropertyCount = 0;
  for (const [rawKey, rawProperty] of Object.entries(properties)) {
    if (descriptors.length >= MAX_SCENE_PROPERTIES) break;
    const key = String(rawKey || '').trim();
    const property = rawProperty && typeof rawProperty === 'object' && !Array.isArray(rawProperty)
      ? rawProperty
      : null;
    if (!property || !SAFE_PROPERTY_KEY.test(key) || BLOCKED_PROPERTY_KEYS.has(key.toLowerCase())) continue;
    const type = String(property.type || '').trim().toLowerCase();
    const label = sanitizePropertyLabel(property.text, key);
    const hint = key + ' ' + label;
    const normalizedKey = key.replace(/[_.-]/g, '').toLowerCase();
    const exactAudioKey = AUDIO_PROPERTY_KEY.test(key);
    const explicitAudioControl = AUDIO_PROPERTY_HINT.test(hint)
      || AUDIO_MUTE_PROPERTY_KEYS.has(normalizedKey)
      || AUDIO_DECIBEL_PROPERTY_KEYS.has(normalizedKey)
      || AUDIO_ENABLE_PROPERTY_KEYS.has(normalizedKey);
    const visualOnly = AUDIO_VISUAL_HINT.test(hint) && !explicitAudioControl;
    const audioProperty = !visualOnly && (
      exactAudioKey
      || explicitAudioControl
      || AUDIO_STANDALONE_LABEL.test(label)
    );
    const options = Array.isArray(property.options)
      ? property.options.slice(0, MAX_PROPERTY_OPTIONS).map((option, index) => {
        const source = option && typeof option === 'object' && !Array.isArray(option) ? option : {};
        return {
          label: sanitizePropertyLabel(source.label, '选项 ' + (index + 1)),
          value: normalizeScenePropertyValue(source.value, 256),
        };
      }).filter((option) => option.value !== null)
      : [];
    const descriptor = {
      key,
      label,
      type: type.replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'unknown',
      value: normalizeScenePropertyValue(property.value),
      audio: audioProperty,
      autoMuted: false,
    };
    const minimum = Number(property.min);
    const maximum = Number(property.max);
    const step = Number(property.step);
    if (Number.isFinite(minimum)) descriptor.min = minimum;
    if (Number.isFinite(maximum)) descriptor.max = maximum;
    if (Number.isFinite(step) && step > 0) descriptor.step = step;
    if (options.length) descriptor.options = options;
    if (audioProperty) {
      audioPropertyCount += 1;
      let muteValue;
      if (type === 'bool' || typeof property.value === 'boolean') {
        muteValue = AUDIO_MUTE_PROPERTY_KEYS.has(normalizedKey) || MUTE_PROPERTY_HINT.test(hint);
      } else if (type === 'slider' || typeof property.value === 'number') {
        if (AUDIO_DECIBEL_PROPERTY_KEYS.has(normalizedKey)
          || AUDIO_DECIBEL_HINT.test(hint)
          || (Number.isFinite(minimum) && minimum < 0 && Number.isFinite(maximum) && maximum <= 0)) {
          muteValue = Number.isFinite(minimum) ? minimum : -60;
        } else if ((!Number.isFinite(minimum) || minimum <= 0) && (!Number.isFinite(maximum) || maximum >= 0)) {
          muteValue = 0;
        } else if (Number.isFinite(minimum)) {
          muteValue = minimum;
        }
      } else if (type === 'combo' && options.length) {
        const offOption = options.find((option) => AUDIO_OFF_OPTION_HINT.test(option.label))
          || (exactAudioKey ? options.find((option) => String(option.value) === '0') : null);
        if (offOption) muteValue = offOption.value;
      }
      if (muteValue !== undefined && muteValue !== null) {
        muteProperties[key] = muteValue;
        descriptor.autoMuted = true;
        descriptor.muteValue = muteValue;
        mutedAudioPropertyCount += 1;
      }
    }
    descriptors.push(descriptor);
  }
  return {
    properties: descriptors,
    muteProperties: { ...muteProperties },
    propertyCount: descriptors.length,
    audioPropertyCount,
    mutedAudioPropertyCount,
  };
}

function deriveSceneMuteProperties(project) {
  return analyzeSceneProperties(project).muteProperties;
}

function deriveWorkshopId(project, projectRoot, sourceKind = '') {
  const directCandidates = [
    project && project.workshopid,
    project && project.workshopId,
    project && project.publishedfileid,
    project && project.publishedFileId,
  ];
  for (const candidate of directCandidates) {
    const value = String(candidate || '').trim();
    if (/^\d{5,32}$/.test(value)) return value;
  }
  const urlCandidates = [
    project && project.workshopurl,
    project && project.workshopUrl,
    project && project.url,
  ];
  for (const candidate of urlCandidates) {
    const match = /(?:[?&]id=|\/filedetails\/?)(\d{5,32})/i.exec(String(candidate || ''));
    if (match) return match[1];
  }
  const directoryId = path.basename(String(projectRoot || ''));
  return sourceKind === 'workshop' && /^\d{5,32}$/.test(directoryId) ? directoryId : '';
}

async function statSafe(target) {
  try { return await fs.promises.stat(target); } catch (_) { return null; }
}

async function isDirectory(target) {
  const stat = await statSafe(target);
  return !!(stat && stat.isDirectory());
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

async function resolveProjectFile(projectRoot, value, allowedMime) {
  const raw = String(value || '').trim().replace(/\//g, path.sep);
  if (!raw || raw.includes('\0') || path.isAbsolute(raw) || /^[a-z]:/i.test(raw) || raw.includes(':')) return '';
  const lexicalRoot = path.resolve(projectRoot);
  const lexicalTarget = path.resolve(lexicalRoot, raw);
  if (!isInside(lexicalRoot, lexicalTarget)) return '';
  const ext = path.extname(lexicalTarget).toLowerCase();
  if (!allowedMime.has(ext)) return '';
  try {
    const [realRoot, realTarget] = await Promise.all([
      fs.promises.realpath(lexicalRoot),
      fs.promises.realpath(lexicalTarget),
    ]);
    if (!isInside(realRoot, realTarget)) return '';
    const stat = await fs.promises.stat(realTarget);
    return stat.isFile() ? realTarget : '';
  } catch (_) {
    return '';
  }
}

async function firstProjectFile(projectRoot, values, allowedMime) {
  for (const value of values) {
    const target = await resolveProjectFile(projectRoot, value, allowedMime);
    if (target) return target;
  }
  return '';
}

async function validateScenePackage(file) {
  if (!file || !SCENE_PACKAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) return '';
  try {
    const handle = await fs.promises.open(file, 'r');
    try {
      const header = Buffer.alloc(12);
      const result = await handle.read(header, 0, header.length, 0);
      const signatureAtStart = header.subarray(0, 8).toString('ascii');
      const signatureAfterLength = header.subarray(4, 12).toString('ascii');
      return result.bytesRead === header.length && (/^PKGV\d{4}$/.test(signatureAtStart) || /^PKGV\d{4}$/.test(signatureAfterLength)) ? file : '';
    } finally {
      await handle.close();
    }
  } catch (_) {
    return '';
  }
}

function execFileText(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { encoding: 'utf8', windowsHide: true, timeout: 2500, maxBuffer: 256 * 1024 }, (error, stdout) => {
      resolve(error ? '' : String(stdout || ''));
    });
  });
}

async function windowsSteamRegistryRoots() {
  if (process.platform !== 'win32') return [];
  const queries = [
    ['HKCU\\Software\\Valve\\Steam', 'SteamPath'],
    ['HKCU\\Software\\Valve\\Steam', 'SteamExe'],
    ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'],
    ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath'],
  ];
  const roots = new Set();
  for (const [key, value] of queries) {
    const output = await execFileText('reg.exe', ['query', key, '/v', value]);
    const match = output.match(new RegExp(`${value}\\s+REG_\\w+\\s+(.+)$`, 'mi'));
    if (!match) continue;
    let found = normalizeAbsolutePath(match[1].replace(/\//g, path.sep));
    if (/steam\.exe$/i.test(found)) found = path.dirname(found);
    if (found) roots.add(found);
  }
  return [...roots];
}

async function readSteamLibraryFolders(steamRoot) {
  const roots = new Set([normalizeAbsolutePath(steamRoot)]);
  const files = [
    path.join(steamRoot, 'steamapps', 'libraryfolders.vdf'),
    path.join(steamRoot, 'config', 'libraryfolders.vdf'),
  ];
  for (const file of files) {
    try {
      const text = (await fs.promises.readFile(file, 'utf8')).replace(/^\uFEFF/, '');
      for (const match of text.matchAll(/"path"\s+"([^"]+)"/gi)) {
        const found = normalizeAbsolutePath(match[1].replace(/\\\\/g, '\\'));
        if (found) roots.add(found);
      }
      for (const match of text.matchAll(/"\d+"\s+"([a-z]:\\{1,2}[^"]+)"/gi)) {
        const found = normalizeAbsolutePath(match[1].replace(/\\\\/g, '\\'));
        if (found) roots.add(found);
      }
    } catch (_) { }
  }
  return [...roots];
}

async function discoverSteamLibraries() {
  const candidates = new Set([
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Steam'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Steam'),
    process.env.ProgramW6432 && path.join(process.env.ProgramW6432, 'Steam'),
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    'D:\\Steam',
    'D:\\SteamLibrary',
    'E:\\Steam',
    'E:\\SteamLibrary',
    'F:\\Steam',
    'F:\\SteamLibrary',
  ].filter(Boolean).map(normalizeAbsolutePath));
  (await windowsSteamRegistryRoots()).forEach((root) => candidates.add(root));

  const libraries = new Set();
  for (const candidate of candidates) {
    if (!candidate || !await isDirectory(candidate)) continue;
    for (const library of await readSteamLibraryFolders(candidate)) {
      if (await isDirectory(library)) libraries.add(normalizeAbsolutePath(library));
    }
  }
  return [...libraries];
}

function knownWallpaperContainers(root) {
  return [
    path.join(root, 'steamapps', 'workshop', 'content', WALLPAPER_ENGINE_APP_ID),
    path.join(root, 'steamapps', 'common', 'wallpaper_engine', 'projects', 'myprojects'),
  ];
}

async function directProjectDirectories(container) {
  const output = [];
  let entries = [];
  try { entries = await fs.promises.readdir(container, { withFileTypes: true }); } catch (_) { return output; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectRoot = path.join(container, entry.name);
    if (await statSafe(path.join(projectRoot, 'project.json'))) output.push(projectRoot);
  }
  return output;
}

async function manualProjectDirectories(root) {
  root = normalizeAbsolutePath(root);
  if (!root || !await isDirectory(root)) return [];
  if (await statSafe(path.join(root, 'project.json'))) return [root];

  const known = [];
  for (const container of knownWallpaperContainers(root)) {
    if (await isDirectory(container)) known.push(...await directProjectDirectories(container));
  }
  if (known.length) return known;

  const output = [];
  const queue = [{ dir: root, depth: 0 }];
  let visited = 0;
  while (queue.length && visited < MAX_MANUAL_SCAN_DIRS) {
    const current = queue.shift();
    let entries = [];
    try { entries = await fs.promises.readdir(current.dir, { withFileTypes: true }); } catch (_) { continue; }
    visited += entries.length;
    for (const entry of entries) {
      if (!entry.isDirectory() || /^\./.test(entry.name) || /^(?:node_modules|cache|temp|tmp)$/i.test(entry.name)) continue;
      const child = path.join(current.dir, entry.name);
      if (await statSafe(path.join(child, 'project.json'))) {
        output.push(child);
      } else if (current.depth < 2) {
        queue.push({ dir: child, depth: current.depth + 1 });
      }
      if (visited >= MAX_MANUAL_SCAN_DIRS) break;
    }
  }
  return output;
}

async function readProjectManifest(projectRoot) {
  const file = path.join(projectRoot, 'project.json');
  const stat = await statSafe(file);
  if (!stat || !stat.isFile() || stat.size <= 0 || stat.size > MAX_PROJECT_JSON_BYTES) return null;
  try {
    const [rawText, realRoot, realFile] = await Promise.all([
      fs.promises.readFile(file, 'utf8'),
      fs.promises.realpath(projectRoot),
      fs.promises.realpath(file),
    ]);
    if (!isInside(realRoot, realFile)) return null;
    const raw = rawText.replace(/^\uFEFF/, '');
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? { value, stat, file: realFile } : null;
  } catch (_) {
    return null;
  }
}

async function indexProject(projectRoot, source, scenePackageOverride = '') {
  const manifest = await readProjectManifest(projectRoot);
  if (!manifest) return null;
  const project = manifest.value;
  const projectType = String(project.type || '').trim().toLowerCase();
  const directExt = path.extname(String(project.file || '')).toLowerCase();
  const inferredMedia = VIDEO_MIME.has(directExt) ? 'video' : (IMAGE_MIME.has(directExt) ? 'image' : '');
  const allowDirectMedia = projectType === 'video' || projectType === 'image' || (!projectType && !!inferredMedia);
  const media = allowDirectMedia
    ? await firstProjectFile(projectRoot, [project.file], SAFE_MIME)
    : '';
  const overrideRelative = scenePackageOverride
    ? path.relative(projectRoot, scenePackageOverride)
    : '';
  const scenePackageCandidate = projectType === 'scene'
    ? await firstProjectFile(projectRoot, [
      overrideRelative,
      SCENE_PACKAGE_EXTENSIONS.has(directExt) ? project.file : '',
      'scene.pkg',
      'scene.pak',
    ], SCENE_PACKAGE_EXTENSIONS)
    : '';
  const scenePackage = await validateScenePackage(scenePackageCandidate);
  const preview = await firstProjectFile(projectRoot, [
    project.preview,
    project.cover,
    project.poster,
    'preview.jpg',
    'preview.jpeg',
    'preview.png',
    'preview.webp',
    'preview.gif',
    'cover.jpg',
    'cover.png',
    'cover.webp',
    'cover.gif',
  ], IMAGE_MIME);
  if (!media && !preview && !scenePackage) return null;

  const id = opaqueId(projectRoot);
  const mediaExt = path.extname(media).toLowerCase();
  const previewExt = path.extname(preview).toLowerCase();
  const mediaType = VIDEO_MIME.has(mediaExt) ? 'video' : (IMAGE_MIME.has(mediaExt) ? 'image' : '');
  const safeProjectType = projectType || (mediaType ? mediaType : 'unknown');
  const enginePlayable = !!scenePackage;
  const previewOnly = !media && !enginePlayable;
  const propertyAnalysis = projectType === 'scene' ? analyzeSceneProperties(project) : {
    propertyCount: 0,
    audioPropertyCount: 0,
    mutedAudioPropertyCount: 0,
  };
  const workshopId = deriveWorkshopId(project, projectRoot, source.kind);
  return {
    item: {
      id,
      title: sanitizeText(project.title, path.basename(projectRoot)),
      projectType: safeProjectType,
      mediaType,
      mediaAnimated: mediaExt === '.gif',
      playable: !!media,
      enginePlayable,
      previewOnly,
      hasPreview: !!preview,
      previewAnimated: previewExt === '.gif',
      source: source.kind,
      sourceLabel: source.label,
      workshopId,
      propertyCount: propertyAnalysis.propertyCount,
      audioPropertyCount: propertyAnalysis.audioPropertyCount,
      mutedAudioPropertyCount: propertyAnalysis.mutedAudioPropertyCount,
      updatedAt: Math.round(Number(manifest.stat.mtimeMs) || 0),
      safetyMode: media ? 'direct-media' : (enginePlayable ? 'native-engine' : 'preview-only'),
    },
    record: {
      id,
      projectRoot: await fs.promises.realpath(projectRoot),
      projectFile: manifest.file,
      media,
      preview,
      scenePackage,
      workshopId,
    },
  };
}

function mimeForPath(file) {
  return SAFE_MIME.get(path.extname(file).toLowerCase()) || 'application/octet-stream';
}

function parseByteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(value || '').trim());
  if (!match) return null;
  if (!match[1] && !match[2]) return { invalid: true };
  let start;
  let end;
  if (!match[1] && match[2]) {
    const suffix = Math.max(0, Number(match[2]) || 0);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Math.max(0, Number(match[1]) || 0);
    end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return { invalid: true };
  return { start, end };
}

class WallpaperEngineLibrary {
  constructor(options = {}) {
    this.userDataPath = normalizeAbsolutePath(options.userDataPath || process.cwd());
    this.configPath = normalizeAbsolutePath(options.configPath || path.join(this.userDataPath, CONFIG_FILE));
    this.autoDiscover = options.autoDiscover !== false;
    const config = this.readConfig();
    this.manualRoots = config.manualRoots;
    this.manualProjectFiles = config.manualProjectFiles;
    this.index = new Map();
    this.mediaToken = crypto.randomBytes(24).toString('hex');
    this.snapshot = null;
    this.scanPromise = null;
    this.queuedForceScan = null;
    this.protocolInstalled = false;
    this.disposed = false;
    this.generation = 0;
  }

  readConfig() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      const manualRoots = Array.isArray(raw && raw.manualRoots)
        ? raw.manualRoots.map(normalizeAbsolutePath).filter(Boolean).slice(0, 32)
        : [];
      const manualProjectFiles = Array.isArray(raw && raw.manualProjectFiles)
        ? raw.manualProjectFiles.map(normalizeAbsolutePath).filter(Boolean).slice(0, 64)
        : [];
      return {
        version: 2,
        manualRoots: [...new Set(manualRoots)],
        manualProjectFiles: [...new Set(manualProjectFiles)],
      };
    } catch (_) {
      return { version: 2, manualRoots: [], manualProjectFiles: [] };
    }
  }

  async saveConfig() {
    await fs.promises.mkdir(path.dirname(this.configPath), { recursive: true });
    const temp = this.configPath + '.tmp';
    await fs.promises.writeFile(temp, JSON.stringify({
      version: 2,
      manualRoots: this.manualRoots,
      manualProjectFiles: this.manualProjectFiles,
    }, null, 2), 'utf8');
    await fs.promises.rename(temp, this.configPath).catch(async () => {
      await fs.promises.copyFile(temp, this.configPath);
      await fs.promises.unlink(temp).catch(() => {});
    });
  }

  manualRootSummary() {
    return this.manualRoots.map((root) => ({
      id: opaqueId(root),
      name: path.basename(root) || path.parse(root).root || '导入目录',
    }));
  }

  async addManualRoot(root) {
    root = normalizeAbsolutePath(root);
    if (!root || !await isDirectory(root)) throw new Error('请选择存在的 Wallpaper Engine 项目目录');
    const projectDirs = await manualProjectDirectories(root);
    if (!projectDirs.length) throw new Error('所选目录中没有识别到 project.json');
    if (!this.manualRoots.some((value) => pathKey(value) === pathKey(root))) {
      this.manualRoots.push(root);
      this.manualRoots = this.manualRoots.slice(-32);
      await this.saveConfig();
    }
    return this.list({ force: true });
  }

  async addManualProjectFile(file) {
    file = normalizeAbsolutePath(file);
    const stat = file ? await statSafe(file) : null;
    if (!stat || !stat.isFile()) throw new Error('请选择存在的 Wallpaper Engine 项目文件');
    if (path.basename(file).toLowerCase() === 'project.json') {
      return this.addManualRoot(path.dirname(file));
    }
    if (!SCENE_PACKAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) {
      throw new Error('请选择 project.json 或 Wallpaper Engine 场景包（.pkg/.pak）');
    }
    const scenePackage = await validateScenePackage(file);
    if (!scenePackage) {
      throw new Error('所选文件不是有效的 Wallpaper Engine PKGV 场景包；普通游戏或 Chromium .pak 无法运行');
    }
    const projectRoot = path.dirname(scenePackage);
    const manifest = await readProjectManifest(projectRoot);
    if (!manifest || String(manifest.value.type || '').trim().toLowerCase() !== 'scene') {
      throw new Error('场景包同目录缺少有效的 Scene project.json');
    }
    if (!this.manualRoots.some((value) => pathKey(value) === pathKey(projectRoot))) {
      this.manualRoots.push(projectRoot);
      this.manualRoots = this.manualRoots.slice(-32);
    }
    if (!this.manualProjectFiles.some((value) => pathKey(value) === pathKey(scenePackage))) {
      this.manualProjectFiles.push(scenePackage);
      this.manualProjectFiles = this.manualProjectFiles.slice(-64);
    }
    await this.saveConfig();
    return this.list({ force: true });
  }

  async removeManualRoot(id) {
    const removedRoots = this.manualRoots.filter((root) => opaqueId(root) === String(id || ''));
    const beforeRoots = this.manualRoots.length;
    const beforeFiles = this.manualProjectFiles.length;
    this.manualRoots = this.manualRoots.filter((root) => !removedRoots.includes(root));
    this.manualProjectFiles = this.manualProjectFiles.filter((file) => (
      !removedRoots.some((root) => isInside(path.resolve(root), path.resolve(file)))
    ));
    if (this.manualRoots.length !== beforeRoots || this.manualProjectFiles.length !== beforeFiles) await this.saveConfig();
    return this.list({ force: true });
  }

  async discoverSources() {
    const output = [];
    const seen = new Set();
    if (this.autoDiscover) {
      for (const library of await discoverSteamLibraries()) {
        for (const container of knownWallpaperContainers(library)) {
          if (!await isDirectory(container)) continue;
          const key = pathKey(container);
          if (seen.has(key)) continue;
          seen.add(key);
          output.push({ root: container, kind: /workshop[\\/]content/i.test(container) ? 'workshop' : 'local', label: /workshop[\\/]content/i.test(container) ? 'Steam 创意工坊' : 'Wallpaper Engine 本地项目', direct: true });
        }
      }
    }
    for (const root of this.manualRoots) {
      const key = pathKey(root);
      if (seen.has(key) || !await isDirectory(root)) continue;
      seen.add(key);
      output.push({ root, kind: 'imported', label: '手动导入', direct: false });
    }
    return output;
  }

  async performScan() {
    const startedAt = Date.now();
    const generation = ++this.generation;
    const sources = await this.discoverSources();
    const manualPackageByRoot = new Map();
    for (const file of this.manualProjectFiles) {
      manualPackageByRoot.set(pathKey(path.dirname(file)), file);
    }
    const projectSources = new Map();
    for (const source of sources) {
      const projects = source.direct ? await directProjectDirectories(source.root) : await manualProjectDirectories(source.root);
      for (const projectRoot of projects) {
        const key = pathKey(projectRoot);
        if (!projectSources.has(key)) projectSources.set(key, { projectRoot, source });
      }
    }

    const projects = [];
    const nextIndex = new Map();
    for (const value of projectSources.values()) {
      if (this.disposed || generation !== this.generation) break;
      let indexed = null;
      try {
        indexed = await indexProject(
          value.projectRoot,
          value.source,
          manualPackageByRoot.get(pathKey(value.projectRoot)) || ''
        );
      } catch (_) { continue; }
      if (!indexed || nextIndex.has(indexed.item.id)) continue;
      projects.push(indexed.item);
      nextIndex.set(indexed.item.id, indexed.record);
    }
    projects.sort((a, b) => Number(b.playable) - Number(a.playable) || Number(b.enginePlayable) - Number(a.enginePlayable) || a.title.localeCompare(b.title, 'zh-CN'));
    if (!this.disposed && generation === this.generation) this.index = nextIndex;
    const snapshot = {
      ok: true,
      projects,
      count: projects.length,
      dynamicCount: projects.filter((item) => item.playable && item.mediaType === 'video').length,
      enginePlayableCount: projects.filter((item) => item.enginePlayable).length,
      previewOnlyCount: projects.filter((item) => item.previewOnly).length,
      sourceCount: sources.length,
      manualRoots: this.manualRootSummary(),
      scannedAt: Date.now(),
      elapsedMs: Date.now() - startedAt,
      mediaToken: this.mediaToken,
    };
    if (!this.disposed && generation === this.generation) this.snapshot = snapshot;
    return snapshot;
  }

  async list(options = {}) {
    if (this.disposed) throw new Error('Wallpaper Engine library is closed');
    const force = options && options.force === true;
    if (!force && this.snapshot && Date.now() - this.snapshot.scannedAt < CACHE_TTL_MS) return this.snapshot;
    if (this.scanPromise) {
      if (!force) return this.scanPromise;
      if (this.queuedForceScan) return this.queuedForceScan;
      const active = this.scanPromise;
      const queued = active.catch(() => null).then(() => this.performScan());
      const tracked = queued.finally(() => {
        if (this.scanPromise === tracked) this.scanPromise = null;
        if (this.queuedForceScan === tracked) this.queuedForceScan = null;
      });
      this.queuedForceScan = tracked;
      this.scanPromise = tracked;
      return tracked;
    }
    const scan = this.performScan();
    const tracked = scan.finally(() => { if (this.scanPromise === tracked) this.scanPromise = null; });
    this.scanPromise = tracked;
    return tracked;
  }

  async validatedRecordFile(record, kind) {
    const target = kind === 'media' ? record.media : record.preview;
    if (!target) return '';
    try {
      const [realRoot, realTarget] = await Promise.all([
        fs.promises.realpath(record.projectRoot),
        fs.promises.realpath(target),
      ]);
      if (!isInside(realRoot, realTarget) || !SAFE_MIME.has(path.extname(realTarget).toLowerCase())) return '';
      const stat = await fs.promises.stat(realTarget);
      return stat.isFile() ? realTarget : '';
    } catch (_) {
      return '';
    }
  }

  async getNativeSceneTarget(id) {
    id = String(id || '').toLowerCase();
    if (!/^[a-f0-9]{24}$/.test(id)) throw new Error('WALLPAPER_SCENE_ID_INVALID');
    if (!this.snapshot && !this.scanPromise) await this.list({ force: false });
    const record = this.index.get(id);
    if (!record || !record.scenePackage) throw new Error('WALLPAPER_SCENE_NOT_FOUND');
    const target = await resolveProjectFile(record.projectRoot, path.relative(record.projectRoot, record.scenePackage), SCENE_PACKAGE_EXTENSIONS);
    const scenePackage = await validateScenePackage(target);
    if (!scenePackage) throw new Error('WALLPAPER_SCENE_PACKAGE_INVALID');
    const manifest = await readProjectManifest(record.projectRoot);
    if (!manifest || String(manifest.value.type || '').trim().toLowerCase() !== 'scene') {
      throw new Error('WALLPAPER_SCENE_MANIFEST_INVALID');
    }
    const propertyAnalysis = analyzeSceneProperties(manifest.value);
    return {
      id,
      projectFile: manifest.file,
      scenePackage,
      muteProperties: propertyAnalysis.muteProperties,
      propertyCount: propertyAnalysis.propertyCount,
      audioPropertyCount: propertyAnalysis.audioPropertyCount,
      mutedAudioPropertyCount: propertyAnalysis.mutedAudioPropertyCount,
    };
  }

  async getProjectDetails(id) {
    id = String(id || '').toLowerCase();
    if (!/^[a-f0-9]{24}$/.test(id)) throw new Error('WALLPAPER_PROJECT_ID_INVALID');
    if (!this.snapshot && !this.scanPromise) await this.list({ force: false });
    const record = this.index.get(id);
    if (!record) throw new Error('WALLPAPER_PROJECT_NOT_FOUND');
    const manifest = await readProjectManifest(record.projectRoot);
    if (!manifest) throw new Error('WALLPAPER_PROJECT_MANIFEST_INVALID');
    const project = manifest.value;
    const propertyAnalysis = analyzeSceneProperties(project);
    const workshopId = record.workshopId || deriveWorkshopId(project, record.projectRoot);
    return {
      ok: true,
      id,
      title: sanitizeText(project.title, path.basename(record.projectRoot)),
      projectType: String(project.type || 'unknown').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'unknown',
      workshopId,
      propertyCount: propertyAnalysis.propertyCount,
      audioPropertyCount: propertyAnalysis.audioPropertyCount,
      mutedAudioPropertyCount: propertyAnalysis.mutedAudioPropertyCount,
      properties: propertyAnalysis.properties,
    };
  }

  async mediaResponse(request) {
    const method = String(request && request.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { 'Allow': 'GET, HEAD', 'X-Content-Type-Options': 'nosniff' },
      });
    }
    if (!this.snapshot && !this.scanPromise) await this.list({ force: false });
    let url;
    let id;
    try {
      url = new URL(request.url);
      id = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    } catch (_) {
      return new Response('Not found', { status: 404, headers: { 'X-Content-Type-Options': 'nosniff' } });
    }
    const kind = url.hostname === 'media' ? 'media' : (url.hostname === 'preview' ? 'preview' : '');
    if (url.searchParams.get('token') !== this.mediaToken) {
      return new Response('Not found', { status: 404, headers: { 'X-Content-Type-Options': 'nosniff' } });
    }
    if (!/^[a-f0-9]{24}$/i.test(id)) return new Response('Not found', { status: 404, headers: { 'X-Content-Type-Options': 'nosniff' } });
    id = id.toLowerCase();
    const record = kind && this.index.get(id);
    if (!record) return new Response('Not found', { status: 404, headers: { 'X-Content-Type-Options': 'nosniff' } });
    const target = await this.validatedRecordFile(record, kind);
    if (!target) return new Response('Not found', { status: 404, headers: { 'X-Content-Type-Options': 'nosniff' } });
    let stat;
    try { stat = await fs.promises.stat(target); } catch (_) {
      return new Response('Not found', { status: 404, headers: { 'X-Content-Type-Options': 'nosniff' } });
    }
    const size = Number(stat.size) || 0;
    const rangeHeader = request.headers && request.headers.get ? request.headers.get('range') : '';
    const range = rangeHeader ? parseByteRange(rangeHeader, size) : null;
    if (range && range.invalid) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'X-Content-Type-Options': 'nosniff' } });
    }
    const start = range ? range.start : 0;
    const end = range ? range.end : Math.max(0, size - 1);
    const headers = {
      'Content-Type': mimeForPath(target),
      'Content-Length': String(size ? end - start + 1 : 0),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=300',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    };
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    if (method === 'HEAD' || !size) {
      return new Response(null, { status: range ? 206 : 200, headers });
    }
    const stream = fs.createReadStream(target, { start, end });
    return new Response(Readable.toWeb(stream), { status: range ? 206 : 200, headers });
  }

  async installProtocol(protocol) {
    if (this.protocolInstalled) return;
    await protocol.handle(WALLPAPER_ENGINE_SCHEME, (request) => this.mediaResponse(request));
    this.protocolInstalled = true;
  }

  dispose() {
    this.disposed = true;
    this.generation += 1;
    this.index.clear();
    this.mediaToken = '';
    this.snapshot = null;
  }
}

module.exports = {
  WALLPAPER_ENGINE_SCHEME,
  WallpaperEngineLibrary,
  discoverSteamLibraries,
  registerWallpaperEngineScheme,
  parseByteRange,
  analyzeSceneProperties,
  deriveSceneMuteProperties,
};
