/**
 * @fileoverview 通用工具函数库
 *
 * 提供酷狗音乐 API 项目中常用的工具函数，包括：
 * - 随机字符串/数字生成
 * - Cookie 解析与格式化
 * - KRC 歌词解码（XOR 解密 + zlib 解压）
 * - 设备 MID 计算（基于 MD5 的大整数转换）
 * - GUID 生成（UUID v4 格式）
 * - WebGL 指纹哈希生成（浏览器/Node 双环境支持）
 *
 * @module util
 * @requires pako - zlib 解压库（用于 KRC 歌词解码）
 * @requires crypto-js - 加密库（用于 MID 计算中的 MD5 哈希）
 * @requires big-integer - 大整数库（用于 MID 的进制转换）
 */

const pako = require('pako');
const CryptoJS = require('crypto-js');
const bigInt = require('big-integer');

/**
 * 生成随机字符串（大写字母 + 数字）
 *
 * 字符池: 1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ（36个字符）
 * 每次从字符池中随机选取一个字符，拼接为指定长度的字符串。
 *
 * @param {number} [len=16] - 字符串长度，默认 16
 * @returns {string} 随机字符串
 *
 * @example
 * randomString(8) // => "A3B7K9X2"
 */
const randomString = (len = 16) => {
  const keyString = '1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const _key = [];
  const keyStringArr = keyString.split('');
  for (let i = 0; i < len; i += 1) {
    const ceil = Math.ceil((keyStringArr.length - 1) * Math.random());
    const _tmp = keyStringArr[ceil];
    _key.push(_tmp);
  }

  return _key.join('');
};

/**
 * 生成随机数字字符串
 *
 * 字符池: 1234567890（10个数字字符）
 * 每次从字符池中随机选取一个数字字符，拼接为指定长度的字符串。
 *
 * @param {number} [len=16] - 字符串长度，默认 16
 * @returns {string} 随机数字字符串
 *
 * @example
 * randomNumber(6) // => "384729"
 */
const randomNumber = (len = 16) => {
  const keyString = '1234567890';
  const _key = [];
  const keyStringArr = keyString.split('');
  for (let i = 0; i < len; i += 1) {
    const ceil = Math.ceil((keyStringArr.length - 1) * Math.random());
    const _tmp = keyStringArr[ceil];
    _key.push(_tmp);
  }

  return _key.join('');
};

/**
 * 格式化 Cookie 字符串
 *
 * 移除 Cookie 中的非数据字段（Domain、path、expires、HttpOnly），
 * 仅保留有效的键值对数据。
 *
 * @param {string} cookie - 原始 Cookie 字符串
 * @returns {string} 格式化后的 Cookie 字符串
 *
 * @example
 * parseCookieString('token=abc; Domain=.kugou.com; path=/; HttpOnly')
 * // => 'token=abc'
 */
const parseCookieString = (cookie) => {
  const t = cookie.replace(/\s*(Domain|domain|path|expires)=[^(;|$)]+;*/g, '');
  return t.replace(/;HttpOnly/g, '');
};

/**
 * Cookie 字符串转 JSON 对象
 *
 * 将 Cookie 字符串按 `;` 分割，每个键值对按 `=` 分割为 key 和 value。
 *
 * @param {string} cookie - Cookie 字符串
 * @returns {Object} Cookie 键值对对象
 *
 * @example
 * cookieToJson('token=abc; userid=123')
 * // => { token: 'abc', userid: '123' }
 */
const cookieToJson = (cookie) => {
  if (!cookie) return {};
  let cookieArr = cookie.split(';');
  let obj = {};
  cookieArr.forEach((i) => {
    let arr = i.split('=');
    obj[arr[0]] = arr[1];
  });
  return obj;
};

/**
 * KRC 歌词解码
 *
 * 酷狗 KRC 歌词文件的解码流程：
 * 1. 跳过前 4 字节（文件头标识）
 * 2. 剩余字节与固定密钥进行 XOR 异或解密
 * 3. 使用 pako（zlib）解压得到明文歌词
 *
 * XOR 密钥（16字节循环使用）:
 * [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105]
 *
 * @param {string | Uint8Array | Buffer} val - 加密的歌词数据
 *   - string: Base64 编码的歌词数据
 *   - Uint8Array: 原始字节数组
 *   - Buffer: Node.js Buffer
 * @returns {string} 解码后的明文歌词，解码失败返回空字符串
 */
const decodeLyrics = (val) => {
  let bytes = null;
  if (val instanceof Uint8Array) bytes = val;
  if (Buffer.isBuffer(val)) bytes = new Uint8Array(val);
  if (typeof val === 'string') bytes = new Uint8Array(Buffer.from(val, 'base64'));
  if (bytes === null) return '';

  // XOR 解密密钥（16字节，循环使用）
  const enKey = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];
  const krcBytes = bytes.slice(4); // 跳过前 4 字节文件头
  const len = krcBytes.byteLength;

  // XOR 异或解密
  for (let index = 0; index < len; index += 1) {
    krcBytes[index] = krcBytes[index] ^ enKey[index % enKey.length];
  }

  // zlib 解压
  try {
    const inflate = pako.inflate(krcBytes);
    return Buffer.from(inflate).toString('utf8');
  } catch {
    return '';
  }
};

/**
 * 计算设备 MID
 *
 * 将输入字符串（通常是 GUID）进行 MD5 哈希，然后将哈希值作为 16 进制大整数
 * 转换为 10 进制字符串表示。
 *
 * 算法：
 * 1. 对输入字符串取 MD5 哈希（32位hex）
 * 2. 将 hex 字符串视为 16 进制数
 * 3. 逐位累加: sum += digit * 16^(position)
 * 4. 返回十进制字符串
 *
 * @param {string} str - 输入字符串（通常为设备 GUID）
 * @returns {string} MID 的十进制字符串表示
 *
 * @example
 * calculateMid('550e8400-e29b-41d4-a716-446655440000')
 * // => "123456789012345678901234567890"
 */
const calculateMid = (str) => {
  let bigInteger = bigInt(0);
  const bigInteger2 = bigInt(16); // 进制基数
  const digest = CryptoJS.MD5(str).toString(CryptoJS.enc.Hex); // MD5 哈希
  const length = digest.length;
  for (let i = 0; i < length; i += 1) {
    const charValue = bigInt(parseInt(digest.charAt(i), 16));      // 当前位的值
    const powerValue = bigInteger2.pow(length - 1 - i);             // 16 的幂次
    bigInteger = bigInteger.add(charValue.multiply(powerValue));    // 累加
  }
  return bigInteger.toString();
};

/**
 * 生成随机 GUID（UUID v4 格式）
 *
 * 格式: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * - 第三段以 4 开头（UUID v4 标识）
 * - 第四段以 8/9/a/b 开头（UUID v4 变体标识）
 *
 * @returns {string} UUID v4 格式的 GUID 字符串
 *
 * @example
 * getGuid() // => "550e8400-e29b-41d4-a716-446655440000"
 */
const getGuid = () => {
  const e = () => {
    return ((65536 * (1 + Math.random())) | 0).toString(16).substring(1);
  };

  return `${e()}${e()}-${e()}-${e()}-${e()}-${e()}${e()}${e()}`;
};

/**
 * 生成 WebGL 指纹哈希值
 *
 * WebGL 指纹是浏览器指纹的重要组成部分，通过以下信息生成唯一哈希：
 *
 * 浏览器环境：
 * 1. 编译顶点/片段着色器，创建 WebGL 程序
 * 2. 绘制一个三角形并读取像素数据
 * 3. 获取显卡厂商、渲染器名称、WebGL 版本等元数据
 * 4. 使用 FNV-1a 64-bit 哈希算法对像素数据 + 元数据进行哈希
 *
 * Node 环境或 WebGL 不可用时：
 * 生成随机 uint64 作为模拟指纹
 *
 * @returns {string} WebGL 指纹的十进制字符串表示
 */
const generateWebGLHash = () => {
  // 浏览器环境：通过 canvas 获取真实的 WebGL 渲染器信息
  if (typeof document !== 'undefined') {
    try {
      const c = document.createElement('canvas');
      c.width = 200;
      c.height = 50;
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (gl) {
        // --- 编译着色器（和 WASM 中的逻辑一致）---
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, 'attribute vec4 position;void main(){gl_Position=position;}');
        gl.compileShader(vs);
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, 'void main(){gl_FragColor=vec4(1.0,1.0,1.0,1.0);}');
        gl.compileShader(fs);
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        gl.useProgram(prog);

        // --- 绘制一个三角形 ---
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1]), gl.STATIC_DRAW);
        const pos = gl.getAttribLocation(prog, 'position');
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
        gl.viewport(0, 0, 200, 50);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // --- 读取渲染结果并哈希 ---
        const pixels = new Uint8Array(200 * 50 * 4);
        gl.readPixels(0, 0, 200, 50, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        // 同时加入元数据（显卡厂商、渲染器名称、WebGL 版本）
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : '';
        const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
        const version = gl.getParameter(gl.VERSION);

        // FNV-1a 64-bit 哈希算法
        let h = BigInt('14695981039346656037'); // FNV offset basis
        const prime = BigInt('1099511628211');   // FNV prime

        // 哈希像素数据
        for (let i = 0; i < pixels.length; i++) {
          h = ((h ^ BigInt(pixels[i])) * prime) & BigInt('0xFFFFFFFFFFFFFFFF');
        }
        // 哈希元数据
        const meta = vendor + '|' + renderer + '|' + version;
        for (let i = 0; i < meta.length; i++) {
          h = ((h ^ BigInt(meta.charCodeAt(i))) * prime) & BigInt('0xFFFFFFFFFFFFFFFF');
        }
        return h.toString();
      }
    } catch (e) {}
  }
  // Node 环境或 WebGL 不可用：生成随机 uint64 作为模拟指纹
  const hi = Math.floor(Math.random() * 0xffffffff);
  const lo = Math.floor(Math.random() * 0xffffffff);
  return (BigInt(hi) * BigInt(0x100000000) + BigInt(lo)).toString();
};

module.exports = {
  decodeLyrics,
  cookieToJson,
  parseCookieString,
  randomString,
  randomNumber,
  calculateMid,
  getGuid,
  generateWebGLHash,
};
