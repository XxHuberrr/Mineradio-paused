/**
 * 浏览器端行为指纹生成工具
 *
 * 从 login_captcha_simulate.html 提取的独立模块，提供：
 * - generateWebGLHash(): 生成 WebGL 指纹哈希值
 * - generateEDTData(opts): 生成用户行为指纹数据（用于 sid/edt 加密的 data 字段）
 *
 * 适用于 login_captcha.html 和 login_captcha_simulate.html 共用
 */

(function (root) {
  'use strict';

  /**
   * 生成 [min, max] 范围内的随机整数（包含两端）
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @returns {number} 随机整数
   */
  function ri(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ============================================================
  // 事件记录格式化函数
  // ============================================================

  /**
   * 格式化 type-3 事件（鼠标/触摸移动）
   * @param {number} t - 时间差（毫秒）
   * @param {number} i - 子索引（0 或 1）
   * @param {number} x - 鼠标 X 坐标
   * @param {number} y - 鼠标 Y 坐标
   * @returns {string} 格式: "3,时间差,子索引,X,Y"
   */
  function f3(t, i, x, y) {
    return '3,' + t + ',' + i + ',' + x + ',' + y;
  }

  /**
   * 格式化 type-5 事件（滚动/计时）
   * @param {number} t - 时间差（毫秒）
   * @param {number} i - 事件索引
   * @returns {string} 格式: "5,时间差,事件索引"
   */
  function f5(t, i) {
    return '5,' + t + ',' + i;
  }

  /**
   * 格式化 type-6 事件（窗口事件）
   * @param {number} t - 时间差（毫秒）
   * @param {number} i - 事件索引
   * @param {number} x - 窗口宽度
   * @param {number} y - 窗口高度
   * @returns {string} 格式: "6,时间差,事件索引,宽,高"
   */
  function f6(t, i, x, y) {
    return '6,' + t + ',' + i + ',' + x + ',' + y;
  }

  /**
   * 格式化 type-3 哨兵记录（鼠标事件结束标记）
   * @param {number} sentinel - 哨兵值
   * @param {number} i - 子索引
   * @param {number} x - X 坐标
   * @param {number} y - Y 坐标
   * @returns {string} 格式: "3,SENTINEL,子索引,X,Y"
   */
  function fs3(sentinel, i, x, y) {
    return '3,' + sentinel + ',' + i + ',' + x + ',' + y;
  }

  /**
   * 格式化 type-5 哨兵记录（滚动事件结束标记）
   * @param {number} sentinel - 哨兵值
   * @param {number} i - 事件索引
   * @returns {string} 格式: "5,SENTINEL,事件索引"
   */
  function fs5(sentinel, i) {
    return '5,' + sentinel + ',' + i;
  }

  /**
   * 格式化 type-6 哨兵记录（窗口事件结束标记）
   * @param {number} sentinel - 哨兵值
   * @param {number} i - 事件索引
   * @param {number} x - 窗口宽度
   * @param {number} y - 窗口高度
   * @returns {string} 格式: "6,SENTINEL,事件索引,宽,高"
   */
  function fs6(sentinel, i, x, y) {
    return '6,' + sentinel + ',' + i + ',' + x + ',' + y;
  }

  // ============================================================
  // 贝塞尔曲线鼠标路径生成
  // ============================================================

  /**
   * 用三阶贝塞尔曲线生成模拟真人的鼠标移动路径
   *
   * 真人鼠标轨迹特点:
   * - 不是直线，有弧度和加速减速
   * - 有微小抖动（手抖）
   * - 起步慢、中间快、结束减速
   *
   * @param {number} sx - 起点 X
   * @param {number} sy - 起点 Y
   * @param {number} ex - 终点 X
   * @param {number} ey - 终点 Y
   * @param {number} n - 采样点数
   * @returns {Array<{x:number, y:number}>} 路径点数组
   */
  function bezierPath(sx, sy, ex, ey, n) {
    const c1x = sx + (ex - sx) * 0.3 + ri(-80, 80);
    const c1y = sy + (ey - sy) * 0.2 + ri(-60, 60);
    const c2x = sx + (ex - sx) * 0.7 + ri(-60, 60);
    const c2y = sy + (ey - sy) * 0.8 + ri(-40, 40);

    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;

      const x = u * u * u * sx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex;
      const y = u * u * u * sy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey;

      const jitter = Math.max(0.5, 3 - t * 2.5);
      pts.push({
        x: x + (Math.random() - 0.5) * jitter,
        y: y + (Math.random() - 0.5) * jitter,
      });
    }
    return pts;
  }

  // ============================================================
  // 二进制/hex/Base64 转换工具
  // ============================================================

  /**
   * hex 字符串转 ArrayBuffer
   * @param {string} hex - hex 字符串（如 "6b75676f"）
   * @returns {ArrayBuffer} 对应的二进制缓冲区
   */
  function hex2buf(hex) {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
    return arr.buffer;
  }

  /**
   * ArrayBuffer 转 hex 字符串
   * @param {ArrayBuffer} buf - 二进制缓冲区
   * @returns {string} hex 字符串（每个字节两位，小写）
   */
  function buf2hex(buf) {
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * hex 字符串转 Base64 字符串
   * @param {string} hex - hex 字符串
   * @returns {string} Base64 编码的字符串
   */
  function hexToBase64(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  // ============================================================
  // 加密常量
  // ============================================================

  /**
   * RSA 公钥（SPKI DER 格式的 hex 字符串）
   * 从 WASM 二进制中提取，用于 RSA-OAEP SHA-256 加密 AES 密钥
   * 算法: RSA-2048，公钥指数 65537 (0x10001)
   */
  const RSA_SPKI_HEX =
    '30820122300d06092a864886f70d01010105000382010f003082010a0282010100a16dbe625a3c00b78f4904cfd31045945984387bc10fdb52facec30657ca12edd1cf3bd94da5f526d61b5f8f80554aa3e80473f0833e08a072a8616f6c737f5bae17c4d23eabbcf7e9a8c22f75532765b91bd302262b5cea819b8ab7b83507e1684ab49c2fa1c41590bc26c815f940d88b6b2d46d253bcf56c703f6be8e5426e0e5af63e20a9d3af23894cfb93d7234e5636c9f3004b2b2d83810afda4fa963e6110b46a51e4833d57c29aa3a3da49d29839619b5f78b6f91cc82a1bd9531c6d2707556ea3e50cf956f61e3fc4805ce7a2e0bebe1a225f2716dc1b8f85095544c5b86aecd2d63d1ffb57bd9db675408ab86c56fe05bb645fa05f3eaf1ed61aad0203010001';

  /**
   * AES 初始化向量（固定值）
   * ASCII 解码为 "kugousecurity123"
   * WASM 中硬编码，每次加密都使用相同的 IV
   */
  const AES_IV_HEX = '6b75676f757365637572697479313233';

  // ============================================================
  // 加密流程
  // ============================================================

  /**
   * 完整的 sid 加密流程（纯 JS 实现，不依赖 WASM）
   *
   * 加密方案：
   * 1. 生成随机 AES-128 密钥
   * 2. 用 AES-128-CBC 加密行为指纹明文 → 得到 EDT
   * 3. 用 RSA-OAEP SHA-256 加密 AES 密钥 → 得到 SID
   * 4. 服务端用 RSA 私钥解密 SID 得到 AES 密钥，再用 AES 密钥解密 EDT 得到行为数据
   *
   * @param {string} plaintext - 待加密的明文（行为指纹数据）
   * @returns {Promise<Object>} 包含明文、密钥、密文等所有中间数据
   */
  async function encryptSid(plaintext) {
    const aesKeyRaw = crypto.getRandomValues(new Uint8Array(16));
    const aesKeyHex = buf2hex(aesKeyRaw);

    const aesKey = await crypto.subtle.importKey('raw', aesKeyRaw, { name: 'AES-CBC' }, false, ['encrypt']);

    const ptBuf = new TextEncoder().encode(plaintext);
    const iv = new Uint8Array(hex2buf(AES_IV_HEX));
    const aesCt = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: iv }, aesKey, ptBuf);

    const rsaKey = await crypto.subtle.importKey('spki', hex2buf(RSA_SPKI_HEX), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);

    const rsaCt = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaKey, aesKeyRaw);

    return {
      plaintext,
      aesKeyHex,
      aesIvHex: AES_IV_HEX,
      aesCiphertextHex: buf2hex(aesCt),
      rsaCiphertextHex: buf2hex(rsaCt),
    };
  }

  // ============================================================
  // WebGL 指纹生成
  // ============================================================

  /**
   * 生成 WebGL 指纹哈希值
   *
   * WebGL 指纹是浏览器指纹的重要组成部分，通过获取显卡厂商、渲染器名称、
   * WebGL 版本和支持的扩展列表，生成一个唯一的哈希值。
   *
   * 浏览器环境：通过 canvas 真实渲染获取 WebGL 信息
   * Node 环境或 WebGL 不可用时：生成随机 uint64 模拟值
   *
   * @returns {string} WebGL 指纹的十进制字符串表示
   */
  function generateWebGLHash() {
    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 50;
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          const dbg = gl.getExtension('WEBGL_debug_renderer_info');
          const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : '';
          const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
          const version = gl.getParameter(gl.VERSION);
          const exts = gl.getSupportedExtensions().join(',');
          const s = vendor + '|' + renderer + '|' + version + '|' + exts;
          let hash = BigInt('14695981039346656037');
          const prime = BigInt('1099511628211');
          for (let i = 0; i < s.length; i++) {
            hash = hash ^ BigInt(s.charCodeAt(i));
            hash = (hash * prime) & BigInt('0xFFFFFFFFFFFFFFFF');
          }
          return hash.toString();
        }
      } catch (e) {}
    }
    const hi = Math.floor(Math.random() * 0xffffffff);
    const lo = Math.floor(Math.random() * 0xffffffff);
    return (BigInt(hi) * BigInt(0x100000000) + BigInt(lo)).toString();
  }

  // ============================================================
  // 行为数据生成
  // ============================================================

  /**
   * 生成 sid 中的 data 字段（用户行为指纹数据）
   *
   * 模拟真实用户在页面上的交互行为，包括：
   * - 窗口加载/resize 事件
   * - 页面滚动事件
   * - 鼠标移动轨迹
   *
   * 数据格式: type,value,index[,x,y] 各条目用 : 分隔
   * 事件类型:
   *   3 = 鼠标/触摸移动事件（带 x,y 坐标）
   *   5 = 滚动/计时器事件
   *   6 = 窗口事件（如 resize）
   *
   * @param {Object} opts - 配置项
   * @param {number} opts.startX - 鼠标起点 X 坐标
   * @param {number} opts.startY - 鼠标起点 Y 坐标
   * @param {number} opts.endX - 鼠标终点 X 坐标
   * @param {number} opts.endY - 鼠标终点 Y 坐标
   * @param {number} opts.mousePoints - 鼠标轨迹采样点数
   * @returns {string} 编码后的 data 字段字符串
   */
  function generateEDTData(opts) {
    const { startX, startY, endX, endY, mousePoints } = opts;
    const sentinel = 0xffffffff - Math.floor(Math.random() * 20);
    const entries = [];
    let ts = 0;
    let ei = 0;

    entries.push(f5(0, 0));
    entries.push(fs5(sentinel, 0));
    entries.push(f5(0, 0));
    entries.push(fs5(sentinel, 0));

    ts += ri(5, 20);
    entries.push(f6(ts, ei, 750, 500));
    entries.push(fs6(sentinel, ei, 750, 500));
    ei++;

    for (let i = 0; i < 3; i++) {
      ts += ri(80, 600);
      entries.push(f5(ts, ei));
      entries.push(fs5(sentinel, ei));
      ei++;
    }

    const path = bezierPath(startX, startY, endX, endY, mousePoints);
    let si = 0;
    for (let j = 0; j < path.length; j++) {
      const p = path[j];
      ts += ri(8, 50);
      entries.push(f3(ts, si, Math.round(p.x), Math.round(p.y)));
      entries.push(fs3(sentinel, si, Math.round(p.x), Math.round(p.y)));

      if (j > 0 && j % 12 === 0) {
        ts += ri(20, 60);
        entries.push(f5(ts, ei));
        entries.push(fs5(sentinel, ei));
        ei++;
      }
      si = (si + 1) % 2;
    }

    ts += ri(5, 30);
    entries.push(f3(ts, 1, Math.round(endX + ri(-5, 5)), Math.round(endY + ri(-5, 5))));
    entries.push(fs3(sentinel, 1, Math.round(endX), Math.round(endY)));

    return entries.join(':');
  }

  // ============================================================
  // 导出
  // ============================================================

  const fingerprint = { generateWebGLHash, generateEDTData, encryptSid, hex2buf, buf2hex, hexToBase64, ri };

  // 支持多种模块系统
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = fingerprint;
  } else {
    root.fingerprint = fingerprint;
  }
})(typeof window !== 'undefined' ? window : globalThis);
