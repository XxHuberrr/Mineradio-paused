/**
 * @fileoverview 运行时配置工具
 *
 * 处理命令行参数解析和运行时环境变量配置，包括：
 * - 命令行参数解析（--key=value 格式）
 * - CLI 参数覆盖环境变量（proxy、platform、port 等）
 * - 代理地址解析与缓存
 *
 * @module runtime
 * @requires url - URL 解析（用于代理地址解析）
 */

const { URL } = require('url');

/**
 * 缓存的代理地址原始字符串（用于避免重复解析）
 * @type {string | undefined}
 */
let cachedProxyRaw;

/**
 * 缓存的代理配置对象（AxiosProxyConfig 格式）
 * @type {import('axios').AxiosProxyConfig | null}
 */
let cachedProxy;

/**
 * 解析命令行参数
 *
 * 仅解析 `--key=value` 格式的参数，忽略其他格式。
 * 解析规则：
 * - 必须以 `--` 开头
 * - 必须包含 `=` 分隔符
 * - key 和 value 均不能为空
 *
 * @param {string[]} [args] - 参数数组，默认使用 process.argv.slice(2)
 * @returns {Record<string, string>} 解析后的键值对对象
 *
 * @example
 * // 命令行: node app.js --proxy=http://127.0.0.1:8080 --platform=lite
 * parseCliArgs() // => { proxy: 'http://127.0.0.1:8080', platform: 'lite' }
 */
function parseCliArgs(args) {
  const source = Array.isArray(args) ? args : process.argv.slice(2);
  return source.reduce((acc, rawArg) => {
    if (typeof rawArg !== 'string') {
      return acc;
    }
    const arg = rawArg.trim();
    // 必须以 -- 开头
    if (!arg.startsWith('--')) {
      return acc;
    }
    const eqIndex = arg.indexOf('=');
    // = 必须在 -- 之后且不在末尾（确保 key 和 value 都存在）
    if (eqIndex <= 2 || eqIndex === arg.length - 1) {
      return acc;
    }
    const key = arg.slice(2, eqIndex).trim();
    const value = arg.slice(eqIndex + 1).trim();
    if (!key || !value) return acc;
    acc[key] = value;
    return acc;
  }, {});
}

/**
 * 应用命令行参数覆盖环境变量
 *
 * 支持的 CLI 参数：
 * - --proxy: 设置 KUGOU_API_PROXY（代理地址）
 * - --platform: 设置 platform（平台类型，如 "lite"）
 * - --guid: 设置 KUGOU_API_GUID（设备 GUID）
 * - --dev: 设置 KUGOU_API_DEV（开发设备标识）
 * - --mac: 设置 KUGOU_API_MAC（设备 MAC 地址）
 * - --port: 设置 PORT（服务器端口，需为正整数）
 *
 * @param {string[]} [args] - 参数数组，默认使用 process.argv.slice(2)
 */
function applyCliOverrides(args) {
  const parsed = parseCliArgs(args);

  if (parsed.proxy) {
    process.env.KUGOU_API_PROXY = parsed.proxy;
  }

  if (parsed.platform) {
    process.env.platform = parsed.platform;
  }

  if (parsed.guid) {
    process.env.KUGOU_API_GUID = parsed.guid;
  }

  if (parsed.dev) {
    process.env.KUGOU_API_DEV = parsed.dev;
  }

  if (parsed.mac) {
    process.env.KUGOU_API_MAC = parsed.mac;
  }

  if (parsed.port) {
    const port = Number(parsed.port);
    if (!Number.isNaN(port) && port > 0) {
      process.env.PORT = String(port);
    } else {
      console.warn(`[cli] Invalid port value "${parsed.port}", fallback to default.`);
    }
  }
}

/**
 * 解析代理配置
 *
 * 从环境变量 KUGOU_API_PROXY 读取代理地址，解析为 Axios 兼容的代理配置对象。
 * 支持 HTTP/HTTPS 协议，支持带认证信息的代理（user:password@host:port）。
 *
 * 解析结果会被缓存，避免每次请求都重复解析。
 * 当环境变量值未变化时直接返回缓存结果。
 *
 * @returns {import('axios').AxiosProxyConfig | null} 代理配置对象，无代理时返回 null
 *
 * @example
 * // KUGOU_API_PROXY=http://user:pass@127.0.0.1:8080
 * resolveProxy()
 * // => { protocol: 'http', host: '127.0.0.1', port: 8080, auth: { username: 'user', password: 'pass' } }
 */
function resolveProxy() {
  const rawProxyEnv = typeof process.env.KUGOU_API_PROXY === 'string' ? process.env.KUGOU_API_PROXY.trim() : undefined;
  const rawProxy = rawProxyEnv && rawProxyEnv.length > 0 ? rawProxyEnv : undefined;

  // 无代理配置，清空缓存
  if (!rawProxy) {
    cachedProxyRaw = undefined;
    cachedProxy = null;
    return null;
  }

  // 缓存命中，直接返回
  if (cachedProxyRaw === rawProxy) {
    return cachedProxy;
  }

  // 缓存未命中，重新解析
  cachedProxyRaw = rawProxy;
  try {
    const parsed = new URL(rawProxy);

    // 仅支持 HTTP/HTTPS 代理协议
    if (!/^https?:$/.test(parsed.protocol)) {
      console.warn(`[proxy] Unsupported proxy protocol: ${parsed.protocol}`);
      cachedProxy = null;
      return null;
    }

    // 构建 Axios 代理配置
    const proxyConfig = {
      protocol: parsed.protocol.replace(':', ''), // 去掉末尾的冒号
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80, // 默认端口
    };

    // 如果代理地址包含认证信息
    if (parsed.username || parsed.password) {
      proxyConfig.auth = {
        username: parsed.username,
        password: parsed.password,
      };
    }

    cachedProxy = proxyConfig;
    console.info(`[proxy] Using proxy ${parsed.protocol}//${parsed.host}`);
  } catch (error) {
    console.warn(`[proxy] Failed to parse proxy address "${rawProxy}": ${error.message}`);
    cachedProxy = null;
  }

  return cachedProxy;
}

module.exports = { applyCliOverrides, parseCliArgs, resolveProxy };
