'use strict';

/**
 * 花再 Halo PixelBar 歌词/灯光同步模块（集成进 Mineradio 主进程）
 *
 * 设备：EDIFIER 花再 Halo PixelBar
 *   USB VID 0x2D99 / PID 0xA106
 *   控制 HID 接口 usage page 0xFF14 / usage 1
 *   包长度固定 64 字节
 *
 * 协议来源：
 *   - 文字包（v1，已验证）：HaloLyricSync / HaloPixelToolBox
 *      帧: 2E AA EC E8 + 颜色(1) + 长度(2 LE) + 文本长度(1) + UTF-8 + 校验和(1)
 *      校验和: acc=128; for b: acc += b+2; acc%256 （仅对文本字节）
 *   - 增强指令（v2，实测）：Seraph310/halo-pixelbar-mcp PROTOCOL_NOTES
 *      帧: 2E AA ED <cmd> <len-hi> <len-lo> <payload> <checksum>
 *      校验和: 从 AA 字节起求和 mod 256
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

const VENDOR_ID = 0x2D99;
const PRODUCT_ID = 0xA106;
const USAGE_PAGE = 0xFF14;
const USAGE = 1;
const PACKET_LENGTH = 64;

// 文本颜色（v1 第5字节）
const TEXT_COLORS = { white: 0, red: 1, green: 2, blue: 3, yellow: 4, cyan: 5, magenta: 6 };

// 对齐（v2 0xEF 01 包末字节）
const ALIGN = { left: 0, center: 1, right: 2, justify: 3 };

// 内置场景分类（UI 模式 0xEF 02 包）
const SCENE_CATEGORY = {
  clock: 0, game: 1, work: 2, reading: 3, cats: 4, dogs: 5, memes: 6, cyber: 7, waves: 8,
};
// 频谱样式 1-4（traceless929/PixelBar 抓包验证）
const SPECTRUM_STYLE = { bar: 1, wave: 2, symmetric: 3, dense: 4 };

// 氛围灯特效
const AMBIENT_EFFECT = {
  breathing: 1, tide: 2, static: 3, ripple: 4, flow: 5, dynamic: 6,
};

const DEFAULT_CONFIG = {
  enabled: true,
  textColor: 'white',
  align: 'center',
  dynamicScroll: false,
  ambientEnabled: false,
  beatReactive: false,
  followCover: false,
  ambientBrightness: 'high', // low=20, medium=40, high=60
  idleScene: 'none',
  volumeSync: false,
  maxCharsPerLine: 32,
  defaultColor: { r: 102, g: 175, b: 255 }, // #66AFFF
};

function loadConfig(configPath) {
  try {
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return Object.assign({}, DEFAULT_CONFIG, raw);
    }
  } catch (e) {
    console.warn('[HaloSync] 读取配置失败，使用默认:', e.message);
  }
  return Object.assign({}, DEFAULT_CONFIG);
}

function saveConfig(configPath, cfg) {
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.warn('[HaloSync] 保存配置失败:', e.message);
  }
}

// ---------------------------------------------------------------------------
// 协议构建（纯函数，可单元测试）
// ---------------------------------------------------------------------------

function checksumV1(textBytes) {
  let acc = 128;
  for (const b of textBytes) acc += b + 2;
  return acc % 256;
}

function checksumV2(packetBeforeChecksum) {
  // 从 AA 字节（索引 1）起求和
  let sum = 0;
  for (let i = 1; i < packetBeforeChecksum.length; i++) sum += packetBeforeChecksum[i];
  return sum % 256;
}

function pad64(buf) {
  if (buf.length >= PACKET_LENGTH) return buf.slice(0, PACKET_LENGTH);
  const out = Buffer.alloc(PACKET_LENGTH, 0);
  buf.copy(out, 0);
  return out;
}

// 文字包（v1）。颜色为预设枚举 0-6。
function buildTextPacket(text, colorByte, maxChars) {
  const color = (typeof colorByte === 'number') ? colorByte : 0;
  let s = String(text == null ? '' : text);
  // 按显示宽度截断（CJK 占 2），同时不超过 64 字节包的文本容量（约 54 字节）
  while ((displayWidth(s) > (maxChars || 32) || Buffer.byteLength(s, 'utf-8') > 54) && s.length) s = s.slice(0, -1);
  const textBytes = Buffer.from(s, 'utf-8');
  const totalLen = 1 + textBytes.length + 1; // 文本长度(1)+文本(N)+校验和(1)
  const pkt = Buffer.alloc(5 + 2 + 1 + textBytes.length + 1);
  pkt[0] = 0x2E; pkt[1] = 0xAA; pkt[2] = 0xEC; pkt[3] = 0xE8;
  pkt[4] = color & 0xFF;
  pkt.writeUInt16LE(totalLen, 5);
  pkt[7] = textBytes.length & 0xFF;
  textBytes.copy(pkt, 8);
  pkt[8 + textBytes.length] = checksumV1(textBytes);
  return pad64(pkt);
}

// v2 通用帧：2E AA ED <cmd> <len-hi> <len-lo> <payload> <checksum>
function buildFrameV2(cmd, payloadBytes) {
  const payload = Buffer.from(payloadBytes);
  const head = Buffer.from([0x2E, 0xAA, 0xED, cmd, (payload.length >> 8) & 0xFF, payload.length & 0xFF]);
  const before = Buffer.concat([head, payload]);
  const pkt = Buffer.concat([before, Buffer.from([checksumV2(before)])]);
  return pad64(pkt);
}

function buildAmbientPacket(effect, r, g, b, brightness, speed) {
  // cmd 0x6B, payload: 13 <effect> <R> <G> <B> <brightness> <speed>
  return buildFrameV2(0x6B, Buffer.from([0x13, effect & 0xFF, r & 0xFF, g & 0xFF, b & 0xFF, brightness & 0xFF, speed & 0xFF]));
}

function buildVolumePacket(level) {
  // cmd 0x67, payload: <target>  (0-16)
  return buildFrameV2(0x67, Buffer.from([level & 0xFF]));
}

function buildScreenColorPacket(r, g, b) {
  // cmd 0xEF, payload: 03 R G B 00 00 FF FF FF
  return buildFrameV2(0xEF, Buffer.from([0x03, r & 0xFF, g & 0xFF, b & 0xFF, 0x00, 0x00, 0xFF, 0xFF, 0xFF]));
}

function buildAlignPacket(alignByte, r, g, b) {
  // cmd 0xEF, payload: 01 R G B 00 02 00 <align> FF
  return buildFrameV2(0xEF, Buffer.from([0x01, r & 0xFF, g & 0xFF, b & 0xFF, 0x00, 0x02, 0x00, alignByte & 0xFF, 0xFF]));
}

function buildDynamicTextPacket(r, g, b) {
  // cmd 0xEF, payload: 01 R G B 00 02 01 01 FF  (动态右到左滚动)
  return buildFrameV2(0xEF, Buffer.from([0x01, r & 0xFF, g & 0xFF, b & 0xFF, 0x00, 0x02, 0x01, 0x01, 0xFF]));
}

// UI 模式包（已验证：HaloLyricSync build_ui_model / HaloPixelToolBox ConvertUIModel 抓包）
// 2E AA EC EF 00 09 02 F0 B4 C8 00 01 <category> FF FF <chk> 00
// 颜色固定 F0 B4 C8（与官方 TempoHub 一致，规避改字体色导致设备复位 0x3E5）。
// 校验和：自 AA 字节（索引1）起求和 mod 256（即 checksumV2）。尾随 0x00。
function buildScenePacket(category, template, r, g, b) {
  const payload = Buffer.from([0x02, 0xF0, 0xB4, 0xC8, 0x00, 0x01, category & 0xFF, 0xFF, 0xFF]);
  const before = Buffer.from([0x2E, 0xAA, 0xEC, 0xEF, 0x00, 0x09, ...payload]);
  const chk = checksumV2(before);
  const pkt = Buffer.concat([before, Buffer.from([chk, 0x00])]);
  return pad64(pkt);
}

// 频谱样式包（已抓包验证：traceless929/PixelBar README）
// 2E AA EC EF 00 09 01 C0 FF F2 00 01 08 <style 0~3> FF <cs_lo> <cs_hi>
// 校验和=(0x0040 + 8 + styleIndex) & 0xFFFF（小端）。style 1..4 -> styleIndex 0..3。
function buildSpectrumPacket(style) {
  const styleIndex = (((Number(style) | 0) - 1) & 0xFF); // 0..3
  const head = Buffer.from([0x2E, 0xAA, 0xEC, 0xEF, 0x00, 0x09, 0x01, 0xC0, 0xFF, 0xF2, 0x00, 0x01, 0x08]);
  const pkt = Buffer.alloc(17);
  head.copy(pkt, 0);
  pkt[13] = styleIndex & 0xFF;
  pkt[14] = 0xFF;
  const checksum = (0x0040 + 8 + styleIndex) & 0xFFFF;
  pkt[15] = checksum & 0xFF;
  pkt[16] = (checksum >> 8) & 0xFF;
  return pad64(pkt);
}

// 时钟/图案包（已验证格式：traceless929/PixelBar 对 TempoHub 的抓包）
// 2E AA EC EF 00 09 01 F0 B4 C8 00 01 <idx_hi> <idx_lo> FF <cs_lo> <cs_hi>
// style 1..11 -> index=style-1；校验和=(0xFFFB+index)&0xFFFF（小端）。
// 固定 F0 B4 C8（避免改色导致设备复位）。
function buildClockPacket(style, r, g, b) {
  const index = (((Number(style) || 1) - 1) & 0xFF); // 0..10
  const head = Buffer.from([0x2E, 0xAA, 0xEC, 0xEF, 0x00, 0x09, 0x01, 0xF0, 0xB4, 0xC8, 0x00, 0x01]);
  const pkt = Buffer.alloc(17);
  head.copy(pkt, 0);
  pkt[12] = (index >> 8) & 0xFF; // idx_hi
  pkt[13] = index & 0xFF;         // idx_lo
  pkt[14] = 0xFF;
  const checksum = (0xFFFB + index) & 0xFFFF;
  pkt[15] = checksum & 0xFF;
  pkt[16] = (checksum >> 8) & 0xFF;
  return pad64(pkt);
}

// 同步短延时（毫秒），用于满足设备连发间隔
function syncSleep(ms) {
  try {
    const sab = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(sab, 0, 0, ms);
  } catch (e) { /* 不支持时忽略 */ }
}

function displayWidth(str) {
  let w = 0;
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    if (code > 0x2E80 && code < 0xFFA0) w += 2; // CJK 近似
    else w += 1;
  }
  return w;
}

// ---------------------------------------------------------------------------
// HID 通信
// ---------------------------------------------------------------------------

class HaloSync {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = configPath ? loadConfig(configPath) : Object.assign({}, DEFAULT_CONFIG);
    this.device = null;
    this.connected = false;
    this.simulated = false;
    this.hid = null;
    this.playing = false;
    this.lastLine = null;
    this.songTextUntil = 0;
    this.lastAmbientAt = 0;
    this.featureFails = {};
    this.featureDisabled = {};
    this.baseColor = this.config.defaultColor;
    this.manualHold = false; // 手动特效保持：启用时抑制歌词/律动/音量/封面色自动下发，留住特效
    this._tryLoadHid();
  }

  _tryLoadHid() {
    const isElectron = !!(process.versions && process.versions.electron);
    if (!isElectron) {
      try {
        this.hid = require('node-hid');
        // node-hid 新版（3.x）默认用 hidapi；Windows 上切到原生 HID 驱动，
        // 以 64 字节整包（首字节即报告 ID 0x2E）直写，与设备协议一致。
        if (this.hid && typeof this.hid.setDriverType === 'function') {
          try { this.hid.setDriverType('windows'); } catch (e) { /* 忽略 */ }
        }
        return;
      } catch (e) {
        this.hid = null;
        console.warn('[HaloSync] 无法加载 node-hid，尝试派生 HID 子进程:', e.message);
      }
    } else {
      // Electron 里 node-hid 可能加载到其内置/预编译版本，但实测写入会抛
      // 0x000003E5 (I/O 错误)。改用独立 Node 子进程（系统 Node 的可用预编译
      // node-hid），绕过该问题。
      console.warn('[HaloSync] 运行于 Electron，改用独立 Node 子进程写入 HID（规避 Electron 内置 node-hid 写入异常）');
    }
    // Electron，或本地加载失败：派生子进程承担 HID 写入
    this.hid = null;
    this._initRemote();
    if (!this.remote) {
      this.simulated = true;
      console.warn('[HaloSync] 未启动 HID 子进程，进入模拟模式');
    }
  }

  _initRemote() {
    try {
      // 开发期可用 HALO_NODE_BIN 指定系统 node 调试；打包环境无系统 node，
      // 则改用 Electron 自身二进制并以 ELECTRON_RUN_AS_NODE 纯 Node 模式运行子进程，
      // node-hid 为 NAPI 预编译（ABI 无关，Electron 直接可用），免去终端用户安装 Node。
      const useSystemNode = !!process.env.HALO_NODE_BIN;
      const nodeBin = process.env.HALO_NODE_BIN || process.execPath;
      const childEnv = Object.assign({}, process.env);
      if (!useSystemNode) childEnv.ELECTRON_RUN_AS_NODE = '1';
      const script = path.join(__dirname, 'halo-hid-server.js');
      const child = spawn(nodeBin, [script], {
        cwd: path.resolve(__dirname, '..'),
        env: childEnv,
        stdio: ['pipe', 'pipe', 'inherit'],
      });
      const rl = readline.createInterface({ input: child.stdout });
      this.remote = { child, rl, pending: new Map(), nextId: 1 };
      rl.on('line', (line) => this._onRemoteLine(line));
      child.on('exit', (code) => {
        this.remote = null;
        this.connected = false;
        console.warn('[HaloSync] HID 子进程已退出', code);
      });
      child.on('error', (e) => {
        this.remote = null;
        this.simulated = true;
        console.warn('[HaloSync] HID 子进程启动失败，转模拟:', e.message);
      });
      this._remoteRequest('ping', {}).catch(() => {});
    } catch (e) {
      this.remote = null;
      this.simulated = true;
      console.warn('[HaloSync] 无法启动 HID 子进程，进入模拟模式:', e.message);
    }
  }

  _onRemoteLine(line) {
    let msg;
    try { msg = JSON.parse(line); } catch (e) { return; }
    if (msg.event === 'status') {
      const wasConnected = this.connected;
      this.connected = !!msg.connected;
      if (msg.device) this.device = msg.device;
      // 设备掉线（重置/重插）后自动重试连接，无需手动重连
      if (!this.connected && this.remote && !this._reconnectTimer) {
        this._reconnectTimer = setTimeout(() => {
          this._reconnectTimer = null;
          this.connect().catch(() => {});
        }, 1500);
      }
      return;
    }
    if (msg.event === 'ready') return;
    if (msg.id != null && this.remote && this.remote.pending.has(msg.id)) {
      const { resolve, reject } = this.remote.pending.get(msg.id);
      this.remote.pending.delete(msg.id);
      if (msg.ok) resolve(msg.result || {});
      else reject(new Error(msg.error || 'remote error'));
    }
  }

  _remoteRequest(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.remote || !this.remote.child || this.remote.child.exitCode != null) {
        reject(new Error('no remote'));
        return;
      }
      const id = this.remote.nextId++;
      this.remote.pending.set(id, { resolve, reject });
      try {
        this.remote.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
      } catch (e) {
        this.remote.pending.delete(id);
        reject(e);
        return;
      }
      setTimeout(() => {
        if (this.remote && this.remote.pending.has(id)) {
          this.remote.pending.delete(id);
          reject(new Error('remote timeout'));
        }
      }, 5000);
    });
  }

  _remoteSend(method, params) {
    if (!this.remote || !this.remote.child || this.remote.child.exitCode != null) return;
    try {
      this.remote.child.stdin.write(JSON.stringify({ method, params }) + '\n');
    } catch (e) { /* ignore */ }
  }

  _enumerate() {
    if (!this.hid) return [];
    const fn = this.hid.enumerate || this.hid.devices;
    try {
      const list = (typeof fn === 'function') ? fn.call(this.hid) : (fn || []);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  setConfig(patch) {
    this.config = Object.assign({}, this.config, patch || {});
    if (this.configPath) saveConfig(this.configPath, this.config);
    // 用户重新开启某特性时，清除其安全降级禁用标记
    const FEATURE_OF = { ambientEnabled: 'ambient', beatReactive: 'ambient', followCover: 'screen', volumeSync: 'volume', idleScene: 'clock' };
    Object.keys(patch || {}).forEach((k) => {
      if (FEATURE_OF[k] && patch[k]) this.featureDisabled[FEATURE_OF[k]] = false;
    });
    if (this.config.followCover) this._applyScreenColor(this.baseColor);
    return this.config;
  }

  getConfig() {
    return Object.assign({}, this.config);
  }

  listDevices() {
    if (this.remote) {
      return this._remoteRequest('list', {})
        .then((r) => (r && r.devices ? r.devices : []))
        .catch(() => []);
    }
    if (!this.hid) return [];
    try {
      return this._enumerate().map((d) => ({
        vendorId: d.vendorId, productId: d.productId,
        usagePage: d.usagePage, usage: d.usage,
        product: d.product, path: d.path,
      }));
    } catch (e) {
      return [];
    }
  }

  findDevice() {
    if (!this.hid) return null;
    const devices = this._enumerate();
    for (const d of devices) {
      if (d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID) {
        if (d.usagePage === USAGE_PAGE && d.usage === USAGE) return d;
      }
    }
    // 回退：只按 VID/PID 匹配（部分平台枚举不带 usage）
    for (const d of devices) {
      if (d.vendorId === VENDOR_ID && d.productId === PRODUCT_ID) return d;
    }
    return null;
  }

  async connect() {
    if (!this.config.enabled) return false;
    if (this.connected) return true;
    if (this.remote) {
      try {
        const r = await this._remoteRequest('connect', {});
        this.connected = !!(r && r.ok);
        if (this.connected) {
          this.simulated = false;
          // 仅当需要屏色/动态滚动时才发 v2 屏色包；最小化阶段默认不发，避免设备重置
          if (this.config.followCover || this.config.dynamicScroll) {
            this._applyScreenColor(this.baseColor);
          }
        }
        return this.connected;
      } catch (e) {
        console.warn('[HaloSync] 远程连接失败:', e.message);
        return false;
      }
    }
    if (!this.hid) {
      this.connected = true;
      this.simulated = true;
      console.log('[HaloSync] 模拟模式已连接（无 HID 设备）');
      return true;
    }
    const info = this.findDevice();
    if (!info) {
      console.warn('[HaloSync] 未找到 Halo PixelBar 设备');
      return false;
    }
    try {
      const dev = new this.hid.HID(info.path);
      dev.setNonBlocking(1);
      this.device = dev;
      this.connected = true;
      console.log('[HaloSync] 已连接 Halo PixelBar');
      this._applyScreenColor(this.baseColor);
      return true;
    } catch (e) {
      console.warn('[HaloSync] 连接失败:', e.message);
      return false;
    }
  }

  disconnect() {
    if (this.remote) {
      this._remoteSend('disconnect', {});
      this.connected = false;
      this.device = null;
      return;
    }
    if (this.device) {
      try { this.device.close(); } catch (e) { /* ignore */ }
    }
    this.device = null;
    this.connected = false;
  }

  // 退出时把音响恢复到时钟界面（用户指定）。
  // 尝试两种时钟指令格式以兼容不同固件版本
  restoreInitialState() {
    if (!this.connected) return;
    try {
      const rgb = this.config.defaultColor || { r: 200, g: 200, b: 200 };
      this._send(buildClockPacket(1, rgb.r, rgb.g, rgb.b));
      this._send(buildScenePacket(0, 0, rgb.r, rgb.g, rgb.b));
    } catch (e) { /* ignore */ }
  }

  dispose() {
    try { this.restoreInitialState(); } catch (e) { /* ignore */ }
    try { this.disconnect(); } catch (e) { /* ignore */ }
    // 延迟 kill，确保清屏包已被子进程刷出，且避免子进程残留占用设备
    if (this.remote && this.remote.child) {
      const child = this.remote.child;
      this.remote = null;
      try { setTimeout(() => { try { child.kill(); } catch (e) { /* ignore */ } }, 350); } catch (e) { /* ignore */ }
    }
  }

  _send(packet) {
    if (!this.connected) return false;
    if (this.remote) {
      this._remoteSend('raw', { hex: packet.toString('hex') });
      return true;
    }
    if (this.simulated) {
      console.log('[HaloSync][模拟] 发送:', packet.slice(0, 16).toString('hex') + '...');
      return true;
    }
    if (!this.device) return false;
    try {
      const res = this.device.write(packet);
      if (res < 0) throw new Error('写入返回 ' + res);
      return true;
    } catch (e) {
      console.warn('[HaloSync] 写入异常，尝试重开设备:', e.message);
      if (this._reopenLocal() && this.device) {
        try {
          const res2 = this.device.write(packet);
          if (res2 >= 0) return true;
        } catch (e2) { /* ignore */ }
      }
      this.connected = false;
      return false;
    }
  }

  _reopenLocal() {
    try { if (this.device) this.device.close(); } catch (e) { /* ignore */ }
    this.device = null;
    const info = this.findDevice();
    if (!info) return false;
    try {
      const dev = new this.hid.HID(info.path);
      dev.setNonBlocking(1);
      this.device = dev;
      return true;
    } catch (e) {
      this.device = null;
      return false;
    }
  }

  // ---- 对外能力 ----

  sendText(text) {
    // 该设备文字仅接受白色字节(0)；任何非零颜色字节都会触发固件重置(0x3E5)并掉线。
    // 故强制白色，颜色选择器已移除。
    return this._recordSend('text', buildTextPacket(text, 0, this.config.maxCharsPerLine));
  }

  // ---- 安全降级：某特性连续写入失败则临时禁用，保证歌词始终可用 ----
  _recordSend(feature, packet) {
    if (feature !== 'text' && this.featureDisabled[feature]) return false;
    const ok = this._send(packet);
    if (ok) this._featureOk(feature); else this._featureFail(feature);
    return ok;
  }
  _featureFail(feature) {
    if (feature === 'text' || this.featureDisabled[feature]) return;
    this.featureFails[feature] = (this.featureFails[feature] || 0) + 1;
    if (this.featureFails[feature] >= 3) {
      this.featureDisabled[feature] = true;
      console.warn('[HaloSync] 特性「' + feature + '」连续写入失败，已临时禁用以防设备重置；可在面板重新开启。');
    }
  }
  _featureOk(feature) {
    if (this.featureFails[feature] > 0) this.featureFails[feature]--;
  }

  // 氛围灯需连发 3 次，间隔 ~30ms（实测）
  sendAmbient(effect, rgb, brightness, speed) {
    if (!this.config.ambientEnabled) return false;
    const pkt = buildAmbientPacket(
      effect, rgb.r, rgb.g, rgb.b,
      brightness, Math.max(1, Math.min(10, speed))
    );
    let ok = true;
    for (let i = 0; i < 3; i++) {
      ok = this._recordSend('ambient', pkt) && ok;
      if (i < 2 && !this.simulated) syncSleep(30);
    }
    return ok;
  }

  sendVolume(level0to16) {
    if (!this.config.volumeSync) return false;
    const lvl = Math.max(0, Math.min(16, Math.round(level0to16)));
    return this._recordSend('volume', buildVolumePacket(lvl));
  }

  _applyScreenColor(rgb) {
    this._recordSend('screen', buildScreenColorPacket(rgb.r, rgb.g, rgb.b));
    if (this.config.dynamicScroll) this._send(buildDynamicTextPacket(rgb.r, rgb.g, rgb.b));
    else this._send(buildAlignPacket(ALIGN[this.config.align] != null ? ALIGN[this.config.align] : 1, rgb.r, rgb.g, rgb.b));
  }

  _applyCoverLight(rgb) {
    // 用封面色做静态纯色氛围灯（高亮度），给灯带明显染色（与节拍氛围灯不冲突，节拍开启会覆盖）
    const pkt = buildAmbientPacket(AMBIENT_EFFECT.static, rgb.r & 0xFF, rgb.g & 0xFF, rgb.b & 0xFF, 60, 5);
    let ok = true;
    for (let i = 0; i < 3; i++) {
      ok = this._send(pkt) && ok;
      if (i < 2 && !this.simulated) syncSleep(30);
    }
    return ok;
  }

  sendScene(categoryName) {
    const cat = SCENE_CATEGORY[categoryName] != null ? SCENE_CATEGORY[categoryName] : 0;
    const rgb = this.baseColor;
    return this._recordSend('scene', buildScenePacket(cat, 0, rgb.r, rgb.g, rgb.b));
  }

  sendClock() {
    const rgb = this.baseColor;
    return this._recordSend('clock', buildClockPacket(1, rgb.r, rgb.g, rgb.b));
  }

  // ---- 手动特效（花活儿）----
  // 触发任何手动特效即进入"保持"模式，抑制后续的歌词/律动/音量/封面色自动下发，
  // 以免下一帧把特效覆盖掉。调用 exitManualMode（恢复歌词同步）退出。

  setManualHold(on) {
    this.manualHold = !!on;
    if (!this.manualHold && !this.playing) {
      // 退出保持且当前暂停：按配置恢复时钟显示
      if (this.config.idleScene && this.config.idleScene !== 'none') this.sendClock();
    }
  }

  sendTheme(name) {
    if (!this.config.enabled || !this.connected) return false;
    if (SCENE_CATEGORY[name] == null) return false;
    this.manualHold = true;
    return this.sendScene(name);
  }

  sendSpectrum(style) {
    if (!this.config.enabled || !this.connected) return false;
    const s = Number(style) | 0;
    if (s < 1 || s > 4) return false;
    this.manualHold = true;
    return this._recordSend('spectrum', buildSpectrumPacket(s));
  }

  sendClockStyle(style) {
    if (!this.config.enabled || !this.connected) return false;
    const s = Number(style) | 0;
    if (s < 1 || s > 11) return false;
    this.manualHold = true;
    return this._recordSend('clock', buildClockPacket(s));
  }

  clearDisplay() {
    return this.sendText(' ');
  }

  // ---- 事件入口（由 main.js 的 IPC 调用） ----

  setEnabled(enabled) {
    this.config.enabled = !!enabled;
    if (this.configPath) saveConfig(this.configPath, this.config);
    if (enabled) this.connect();
    else this.disconnect();
    return this.config.enabled;
  }

  onLyric(text) {
    if (this.manualHold) return;
    if (!this.config.enabled || !this.playing) return;
    if (Date.now() < this.songTextUntil) return; // 切歌信息展示中
    const t = String(text || '').trim();
    if (!t) return;
    if (t === this.lastLine) return;
    this.lastLine = t;
    this.sendText(t);
  }

  onSong(name, artist) {
    if (this.manualHold) return;
    if (!this.config.enabled) return;
    const info = `🎵 ${name || '未知'} - ${artist || ''}`.replace(/\s+$/, '');
    this.songTextUntil = Date.now() + 3000;
    this.lastLine = null;
    this.sendText(info);
  }

  onPlayState(playing) {
    if (!this.config.enabled) return;
    this.playing = !!playing;
    if (!this.playing) {
      if (!this.manualHold && this.config.idleScene && this.config.idleScene !== 'none') this.sendClock();
    } else {
      this.lastLine = null;
    }
  }

  onVolume01(v) {
    if (this.manualHold) return;
    if (!this.config.enabled || !this.config.volumeSync) return;
    this.sendVolume((Number(v) || 0) * 16);
  }

  onCoverColor(rgb) {
    if (this.manualHold) return;
    if (!rgb) return;
    const nr = rgb.r & 0xFF, ng = rgb.g & 0xFF, nb = rgb.b & 0xFF;
    // 相近色不去重重发，降低 0xEF 屏色包频率，避免设备被刷爆而重置
    if (this._lastScreen &&
        Math.abs(this._lastScreen.r - nr) < 6 &&
        Math.abs(this._lastScreen.g - ng) < 6 &&
        Math.abs(this._lastScreen.b - nb) < 6) return;
    this._lastScreen = { r: nr, g: ng, b: nb };
    this.baseColor = { r: nr, g: ng, b: nb };
    if (this.config.followCover) {
      this._applyScreenColor(this.baseColor);
    }
  }

  onAudioFrame(energy, beat, brightness) {
    if (this.manualHold) return;
    if (!this.config.enabled || !this.config.beatReactive || !this.config.ambientEnabled) return;
    if (!this.playing) return;
    const now = Date.now();
    if (now - this.lastAmbientAt < 120) return; // 节流
    this.lastAmbientAt = now;
    const e = Math.max(0, Math.min(1, Number(energy) || 0));
    const b = Math.max(0, Math.min(1, Number(beat) || 0));
    // 能量→亮度/速度；强拍→切换更明显的特效
    const brightMap = { low: 20, medium: 40, high: 60 };
    const brightnessVal = brightMap[this.config.ambientBrightness] || 60;
    const speed = Math.max(1, Math.min(10, Math.round(2 + e * 6 + b * 2)));
    const effect = b > 0.6 ? AMBIENT_EFFECT.flow : (e > 0.5 ? AMBIENT_EFFECT.breathing : AMBIENT_EFFECT.tide);
    this.sendAmbient(effect, this._energyColor(e, b), brightnessVal, speed);
  }

  // 用能量/亮度把封面色往冷暖偏移，制造律动
  _energyColor(e, b) {
    const base = this.baseColor;
    const lift = Math.round(e * 60);
    return {
      r: Math.min(255, base.r + lift),
      g: Math.min(255, base.g + Math.round(lift * 0.5)),
      b: Math.min(255, base.b + Math.round(b * 40)),
    };
  }
}

module.exports = {
  HaloSync,
  VENDOR_ID, PRODUCT_ID, USAGE_PAGE, USAGE,
  buildTextPacket, buildFrameV2, buildAmbientPacket, buildVolumePacket,
  buildScreenColorPacket, buildAlignPacket, buildDynamicTextPacket,
  buildScenePacket, buildSpectrumPacket, buildClockPacket, checksumV1, checksumV2, displayWidth,
  DEFAULT_CONFIG, SPECTRUM_STYLE, SCENE_CATEGORY,
};
