/**
 * @fileoverview 酷狗音乐 API 请求签名工具
 *
 * 本模块提供多种签名算法，用于对 API 请求参数进行加密签名，
 * 确保请求的合法性和防篡改。酷狗服务端会验证这些签名。
 *
 * 签名类型：
 * - signatureWebParams: Web 版 API 请求签名
 * - signatureAndroidParams: Android 版 API 请求签名（支持标准版/概念版 lite）
 * - signatureRegisterParams: 设备注册接口签名
 * - signParams: 通用 sign 签名
 * - signKey: 请求密钥签名（区分平台）
 * - signCloudKey: 云盘接口密钥签名
 * - signParamsKey: 参数密钥签名（区分平台）
 *
 * 所有签名算法均基于 MD5 哈希，通过将盐值（salt）+ 参数拼接后取 MD5 实现。
 *
 * @module helper
 * @requires ./crypto - MD5 加密函数
 * @requires ./config.json - 平台配置（appid、clientver 等）
 */

const CryptoJS = require('crypto-js');
const { cryptoMd5, wordArrayFromBuffer } = require('./crypto');
const { appid: useAppid, liteAppid, clientver: useClientver, liteClientver } = require('./config.json');

/**
 * Web 版 API 请求 signature 签名
 *
 * 签名算法：
 * 1. 将所有参数按 key=value 格式拼接
 * 2. 对参数字符串按字母顺序排序
 * 3. 拼接为: 盐值 + 排序后的参数串 + 盐值
 * 4. 对整体取 MD5 哈希
 *
 * @param {Object} params - 请求参数键值对
 * @returns {string} MD5 签名字符串（32位小写hex）
 */
const signatureWebParams = (params) => {
  const str = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt'; // Web 版签名盐值
  const paramsString = Object.keys(params)
    .map((key) => `${key}=${params[key]}`)
    .sort()    // 按 key 字母排序
    .join(''); // 拼接为连续字符串
  return cryptoMd5(`${str}${paramsString}${str}`);
};

/**
 * Android 版 API 请求 signature 签名
 *
 * 与 Web 版的区别：
 * - 盐值不同，且区分标准版和概念版（lite）
 * - 支持附加请求体数据（data 参数）到签名中
 * - 参数值为对象时会先 JSON.stringify
 *
 * @param {Object} params - 请求参数键值对
 * @param {string} [data] - 可选的请求体数据（如 POST body）
 * @returns {string} MD5 签名字符串
 */
const signatureAndroidParams = (params, data) => {
  const isLite = process.env.platform === 'lite';
  const str = isLite ? 'LnT6xpN3khm36zse0QzvmgTZ3waWdRSA' : `OIlwieks28dk2k092lksi2UIkp`;
  const paramsString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${typeof params[key] === 'object' ? JSON.stringify(params[key]) : params[key]}`)
    .join('');

  if (Buffer.isBuffer(data)) {
    const hasher = CryptoJS.algo.MD5.create();
    hasher.update(CryptoJS.enc.Utf8.parse(str));
    hasher.update(CryptoJS.enc.Utf8.parse(paramsString));
    hasher.update(wordArrayFromBuffer(data));
    hasher.update(CryptoJS.enc.Utf8.parse(str));
    return hasher.finalize().toString(CryptoJS.enc.Hex);
  }

  return cryptoMd5(`${str}${paramsString}${data || ''}${str}`);
};

/**
 * 设备注册接口（register_dev）signature 签名
 *
 * 签名算法：
 * 1. 提取所有参数的值（忽略 key）
 * 2. 对值按字母排序
 * 3. 拼接为: "1014" + 排序后的值串 + "1014"
 * 4. 对整体取 MD5 哈希
 *
 * @param {Object} params - 请求参数键值对
 * @returns {string} MD5 签名字符串
 */
const signatureRegisterParams = (params) => {
  const paramsString = Object.keys(params)
    .map((key) => params[key]) // 只取值，忽略 key
    .sort()
    .join('');
  return cryptoMd5(`1014${paramsString}1014`); // 盐值为 "1014"
};

/**
 * 通用 sign 签名
 *
 * 签名算法：
 * 1. 参数按 key 排序
 * 2. 每个参数拼接为 key+value（无等号）
 * 3. 拼接为: 排序后的参数串 + 请求体数据 + 盐值
 * 4. 对整体取 MD5 哈希
 *
 * @param {Object} params - 请求参数键值对
 * @param {string} [data] - 可选的请求体数据
 * @returns {string} MD5 签名字符串
 */
const signParams = (params, data) => {
  const str = 'R6snCXJgbCaj9WFRJKefTMIFp0ey6Gza'; // 签名盐值
  const paramsString = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`) // key+value 无等号
    .join('');
  return cryptoMd5(`${paramsString}${data || ''}${str}`);
};

/**
 * 请求密钥签名（signKey）
 *
 * 用于生成请求的 signKey 参数，区分标准版和概念版。
 * 签名算法：MD5(hash + 盐值 + appid + mid + userid)
 *
 * @param {string} hash - 请求哈希值
 * @param {string} mid - 设备 MID 标识
 * @param {(string|number)} [userid] - 用户 ID，默认 0
 * @param {(string|number)} [appid] - 应用 ID，默认使用配置文件中的值
 * @returns {string} MD5 签名字符串
 */
const signKey = (hash, mid, userid, appid) => {
  const isLite = process.env.platform === 'lite';
  // 标准版和概念版使用不同的盐值
  const str = isLite ? '185672dd44712f60bb1736df5a377e82' : '57ae12eb6890223e355ccfcb74edf70d';
  return cryptoMd5(`${hash}${str}${appid || useAppid}${mid}${userid || 0}`);
};

/**
 * 云盘接口密钥签名（signCloudKey）
 *
 * 用于云盘相关接口的签名验证。
 * 签名算法：MD5("musicclound" + hash + pid + 盐值)
 *
 * @param {string} hash - 请求哈希值
 * @param {string} pid - 云盘资源 PID
 * @returns {string} MD5 签名字符串
 */
const signCloudKey = (hash, pid) => {
  const str = 'ebd1ac3134c880bda6a2194537843caa0162e2e7'; // 云盘签名盐值
  return cryptoMd5(`musicclound${hash}${pid}${str}`);
};

/**
 * 参数密钥签名（signParamsKey）
 *
 * 用于生成 sign 参数，区分标准版和概念版。
 * 签名算法：MD5(appid + 盐值 + clientver + data)
 *
 * @param {string|number} data - 签名数据（通常为请求哈希或时间戳）
 * @param {(string|number)} [appid] - 应用 ID，默认使用配置文件中的值
 * @param {(string|number)} [clientver] - 客户端版本号，默认使用配置文件中的值
 * @returns {string} MD5 签名字符串
 */
const signParamsKey = (data, appid, clientver) => {
  const isLite = process.env.platform === 'lite';
  // 标准版和概念版使用不同的盐值
  const str = isLite ? 'LnT6xpN3khm36zse0QzvmgTZ3waWdRSA' : 'OIlwieks28dk2k092lksi2UIkp';

  // 根据平台选择默认的 appid
  appid = appid || (isLite ? liteAppid : useAppid);
  // 根据平台选择默认的 clientver
  clientver = clientver || (isLite ? liteClientver : useClientver);

  return cryptoMd5(`${appid}${str}${clientver}${data}`);
};

module.exports = {
  signKey,
  signParams,
  signParamsKey,
  signCloudKey,
  signatureAndroidParams,
  signatureRegisterParams,
  signatureWebParams,
};
