/**
 * @fileoverview 酷狗音乐 API HTTP 请求封装
 *
 * 本模块是所有 API 请求的底层发送函数，负责：
 * 1. 构建请求参数（注入默认设备标识、时间戳等）
 * 2. 根据加密类型生成请求签名（signature/sign）
 * 3. 配置请求头（User-Agent、设备信息、IP 等）
 * 4. 发送 HTTP 请求（通过 axios）
 * 5. 处理响应（解析 Cookie、SSA 验证码、错误处理）
 * 6. 在需要二次验证时自动生成模拟行为指纹（sid/edt）
 *
 * 所有 API 模块（module/ 目录）通过 `useAxios(config)` 调用本函数发送请求。
 *
 * @module request
 * @requires axios - HTTP 客户端
 * @requires ./helper - 签名函数
 * @requires ./util - 工具函数（parseCookieString）
 * @requires ./config.json - 平台配置
 * @requires ./runtime - 代理配置解析
 * @requires ./generate_simulate - 行为指纹模拟生成
 */

const axios = require('axios');
const { signKey, signatureAndroidParams, signatureRegisterParams, signatureWebParams } = require('./helper');
const { parseCookieString } = require('./util');
const { appid, clientver, liteAppid, liteClientver } = require('./config.json');
const { resolveProxy } = require('./runtime');
const { generateSimulate } = require('./generate_simulate');

/**
 * @typedef {Object} UseAxiosResponse
 * @description API 请求的统一响应格式
 * @property {number} status - HTTP 状态码（200=成功，502=失败）
 * @property {any} body - 响应体（JSON 对象或原始数据）
 * @property {string[]} cookie - 响应中的 Set-Cookie 数组（已格式化）
 * @property {Record<string, string>} [headers] - 响应头（如 ssa-code）
 */

/**
 * 创建并发送 API 请求
 *
 * 完整流程：
 * 1. 从 cookie 中提取设备标识（dfid、mid、uuid、token、userid）
 * 2. 构建默认请求参数（dfid、mid、uuid、appid、clientver、clienttime）
 * 3. 根据 encryptType 生成签名（signature）
 * 4. 配置请求头（User-Agent、设备信息、IP 透传）
 * 5. 配置代理（如果设置了 KUGOU_API_PROXY 环境变量）
 * 6. 发送请求并处理响应
 * 7. 如果需要二次验证（SSA），自动生成模拟行为指纹
 *
 * @param {Object} options - 请求配置
 * @param {'get'|'GET'|'post'|'POST'} options.method - HTTP 请求方法
 * @param {string} options.url - 请求路径（如 "/v1/search"）
 * @param {string} [options.baseURL] - 基础 URL（默认 "https://gateway.kugou.com"）
 * @param {Record<string, any>} [options.params] - URL 查询参数
 * @param {Record<string, any>} [options.data] - 请求体（POST 数据）
 * @param {Record<string, string|number>} [options.headers] - 自定义请求头
 * @param {'android'|'web'|'register'} options.encryptType - 签名加密方式
 * @param {Object} options.cookie - 请求 Cookie 对象
 * @param {boolean} [options.encryptKey] - 是否生成 signKey
 * @param {boolean} [options.clearDefaultParams] - 是否清除默认参数
 * @param {boolean} [options.notSignature] - 是否跳过签名
 * @param {string} [options.ip] - 客户端 IP
 * @param {string} [options.realIP] - 真实 IP（优先级高于 ip）
 * @returns {Promise<UseAxiosResponse>} 统一格式的响应对象
 */
const createRequest = (options) => {
  return new Promise(async (resolve, reject) => {
    const isLite = process.env.platform === 'lite';

    // ========== 从 Cookie 中提取设备标识 ==========
    const dfid = options?.cookie?.dfid || '-';            // 设备指纹 ID（register_dev 接口返回）
    const mid = `${options?.cookie?.KUGOU_API_MID}`;      // 设备 MID（server.js 通过 calculateMid 生成）
    const uuid = '-';                                     // 设备 UUID（当前固定为 '-'）
    const token = options?.cookie?.token || '';            // 用户登录令牌
    const userid = options?.cookie?.userid || 0;           // 用户 ID
    const clienttime = Math.floor(Date.now() / 1000);     // 当前时间戳（秒）
    const ip = options?.realIP || options?.ip || '';       // 客户端 IP（用于 IP 透传）
    const webglHash = options?.cookie?.KUGOU_API_WEBGL;   // WebGL 指纹哈希

    // ========== 构建请求头 ==========
    // kg-rc / kg-thash / kg-rec / kg-rf: 酷狗内部标识头，用于服务端识别请求来源
    const headers = { dfid, clienttime, mid, 'kg-rc': '1', 'kg-thash': '5d816a0', 'kg-rec': 1, 'kg-rf': 'B9EDA08A64250DEFFBCADDEE00F8F25F' };

    // IP 透传：将客户端真实 IP 通过 X-Real-IP / X-Forwarded-For 传递给酷狗服务端
    if (ip) {
      headers['X-Real-IP'] = ip;
      headers['X-Forwarded-For'] = ip;
    }

    // ========== 构建默认请求参数 ==========
    // 这些参数会自动注入到每个请求中，模拟真实客户端行为
    const defaultParams = {
      dfid,                                           // 设备指纹 ID
      mid,                                            // 设备 MID
      uuid,                                           // 设备 UUID
      appid: isLite ? liteAppid : appid,              // 应用 ID（根据平台选择）
      clientver: isLite ? liteClientver : clientver,  // 客户端版本号（根据平台选择）
      clienttime,                                     // 请求时间戳（秒）
    };

    // 如果有登录令牌和用户 ID，也加入默认参数
    if (token) defaultParams['token'] = token;
    if (userid && userid !== 0) defaultParams['userid'] = userid;

    // 合并默认参数和自定义参数（clearDefaultParams 为 true 时仅使用自定义参数）
    const params = options?.clearDefaultParams ? options?.params || {} : Object.assign({}, defaultParams, options?.params || {});

    // 同步 clienttime 到请求头
    headers['clienttime'] = params.clienttime;

    // ========== 生成 signKey（可选） ==========
    // 某些接口需要额外的 key 参数作为签名验证
    if (options?.encryptKey) {
      params['key'] = signKey(params['hash'], params['mid'], params['userid'], params['appid']);
    }

    // ========== 序列化请求体 ==========
    const data = Buffer.isBuffer(options?.data) ? options.data : typeof options?.data === 'object' ? JSON.stringify(options.data) : options?.data || '';

    // ========== 生成请求签名 ==========
    // 根据 encryptType 选择不同的签名算法
    // - android: Android 版签名（默认，最常用）
    // - web: Web 版签名
    // - register: 设备注册签名
    if (!params['signature'] && !options.notSignature) {
      switch (options?.encryptType) {
        case 'register':
          params['signature'] = signatureRegisterParams(params);
          break;
        case 'web':
          params['signature'] = signatureWebParams(params);
          break;
        case 'android':
        default:
          params['signature'] = signatureAndroidParams(params, data);
          break;
      }
    }

    // ========== 配置请求选项 ==========
    options['params'] = params;
    options['baseURL'] = options?.baseURL || 'https://gateway.kugou.com'; // 默认网关地址
    options['headers'] = Object.assign({ 'User-Agent': 'Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi' }, options?.headers || {}, {
      dfid,
      clienttime: params.clienttime,
      mid,
    });

    const requestOptions = {
      params,
      data: options?.data,
      method: options.method,
      baseURL: options?.baseURL,
      url: options.url,
      headers: Object.assign({}, options?.headers || {}, headers),
      withCredentials: true,               // 携带 Cookie
      responseType: options.responseType,  // 响应类型（如 'arraybuffer'）
    };

    // ========== 代理配置 ==========
    // 如果设置了 KUGOU_API_PROXY 环境变量，使用代理发送请求
    const proxyConfig = resolveProxy();
    if (proxyConfig) {
      requestOptions.proxy = proxyConfig;
    }

    if (options.data) requestOptions.data = options.data;
    if (params) requestOptions.params = params;

    // ========== CDN 接口特殊处理 ==========
    // openapicdn 基础 URL 的接口需要将参数拼接到 URL 中
    if (options.baseURL?.includes('openapicdn')) {
      const url = requestOptions.url;
      const _params = Object.keys(params)
        .map((key) => `${key}=${params[key]}`)
        .join('&');
      requestOptions.url = `${url}?${_params}`;
      requestOptions.params = {};
    }

    // ========== 发送请求 ==========
    const answer = { status: 500, body: {}, cookie: [], headers: {} };
    try {
      const response = await axios(requestOptions);

      let ssaCode = '';

      const body = response.data;

      // 解析响应中的 Set-Cookie（格式化为干净的 key=value 字符串）
      answer.cookie = (response.headers['set-cookie'] || []).map((x) => parseCookieString(x));

      // ========== SSA 验证码处理 ==========
      // ssa-code 响应头表示需要进行二次安全验证（如滑块验证码、短信验证码）
      if (response.headers['ssa-code'] || response.headers['SSA-CODE']) {
        const _ssaCode = response.headers['ssa-code'] || response.headers['SSA-CODE'];
        answer.headers['ssa-code'] = _ssaCode;
        ssaCode = _ssaCode;
      }

      // 解析响应体为 JSON
      try {
        answer.body = JSON.parse(body.toString());
      } catch (error) {
        answer.body = body;
      }

      // ========== 响应状态判断 ==========
      if (response.data.status === 0 || (response.data?.error_code && response.data.error_code !== 0)) {
        // 请求失败：status=0 或 error_code 非 0
        answer.status = 502;

        // 如果有 SSA 验证码，生成模拟行为指纹（sid/edt）附加到响应中
        // 客户端拿到 sid/edt 后可以用于后续的验证请求
        if (ssaCode) {
          const { edt, sid } = generateSimulate(mid, userid, dfid, webglHash);
          if (edt) answer.body.edt = edt;
          if (sid) answer.body.sid = sid;
          answer.body.ssaCode = ssaCode;
        }
        reject(answer);
      } else {
        // 请求成功
        answer.status = 200;

        // 同样在成功时附加 SSA 验证码信息（某些接口成功时也需要二次验证）
        if (ssaCode) {
          const { edt, sid } = generateSimulate(mid, userid, dfid, webglHash);
          if (edt) answer.body.edt = edt;
          if (sid) answer.body.sid = sid;
          answer.body.ssaCode = ssaCode;
        }
        resolve(answer);
      }
    } catch (e) {
      // 网络错误或请求异常
      answer.status = 502;
      answer.body = { status: 0, msg: e };
      reject(answer);
    }
  });
};

module.exports = { createRequest };
