/**
 * @fileoverview 工具模块统一导出入口
 *
 * 本文件是 util 目录的索引模块，负责：
 * 1. 从各子模块导入所有工具函数和常量
 * 2. 根据当前平台（标准版/概念版 lite）选择对应的配置值
 * 3. 统一导出供 API 模块使用
 *
 * API 模块（module/ 目录下的文件）通过 `require('../util')` 引用本文件，
 * 即可获得所有需要的工具函数和配置常量。
 *
 * @module util/index
 */

// ========== 配置常量 ==========
const { apiver, appid, wx_appid, wx_lite_appid, wx_secret, wx_lite_secret, srcappid, clientver, liteAppid, liteClientver } = require('./config.json');

// ========== 加密函数 ==========
const {
  cryptoAesDecrypt,     // AES 解密
  cryptoAesEncrypt,     // AES 加密
  cryptoMd5,            // MD5 哈希
  cryptoRSAEncrypt,     // RSA 加密
  cryptoSha1,           // SHA1 哈希
  rsaEncrypt2,          // RSA 加密 v2（用于 register_dev 等接口）
  playlistAesEncrypt,   // 歌单 AES 加密
  playlistAesDecrypt,   // 歌单 AES 解密
  publicLiteRasKey,     // 概念版 RSA 公钥
  publicRasKey,         // 标准版 RSA 公钥
} = require('./crypto');

// ========== 请求函数 ==========
const { createRequest } = require('./request');

// ========== 签名函数 ==========
const { signKey, signParams, signParamsKey, signCloudKey, signatureAndroidParams, signatureRegisterParams, signatureWebParams } = require('./helper');

// ========== 工具函数 ==========
const { randomString, decodeLyrics, parseCookieString, cookieToJson, randomNumber, calculateMid } = require('./util');

// ========== 平台判断 ==========
// 根据环境变量 platform 判断当前是否为概念版（lite）
const isLite = process.env.platform === 'lite';
// 根据平台选择对应的 appid 和 clientver
const useAppid = isLite ? liteAppid : appid;
const useClientver = isLite ? liteClientver : clientver;

/**
 * 统一导出所有工具函数和配置常量
 *
 * API 模块通过 `const { xxx } = require('../util')` 按需引入。
 */
module.exports = {
  // --- 配置常量 ---
  apiver,                       // API 版本号
  appid: useAppid,              // 应用 ID（根据平台自动选择）
  // liteAppid,                  // 概念版应用 ID（注释掉，不对外暴露）
  // liteClientver,              // 概念版客户端版本号（注释掉，不对外暴露）
  wx_appid,                     // 微信小程序应用 ID
  wx_lite_appid,                // 微信概念版小程序应用 ID
  wx_secret,                    // 微信小程序密钥
  wx_lite_secret,               // 微信概念版小程序密钥
  srcappid,                     // 来源应用 ID
  clientver: useClientver,      // 客户端版本号（根据平台自动选择）
  isLite,                       // 是否为概念版

  // --- 加密函数 ---
  cryptoAesDecrypt,             // AES 解密
  cryptoAesEncrypt,             // AES 加密
  cryptoMd5,                    // MD5 哈希
  cryptoRSAEncrypt,             // RSA 加密
  cryptoSha1,                   // SHA1 哈希
  rsaEncrypt2,                  // RSA 加密 v2
  playlistAesEncrypt,           // 歌单 AES 加密
  playlistAesDecrypt,           // 歌单 AES 解密

  // --- 请求函数 ---
  createRequest,                // 创建 HTTP 请求

  // --- 签名函数 ---
  signKey,                      // 请求密钥签名
  signParams,                   // 通用 sign 签名
  signParamsKey,                // 参数密钥签名
  signCloudKey,                 // 云盘接口密钥签名
  signatureAndroidParams,       // Android 版 signature 签名
  signatureRegisterParams,      // 设备注册 signature 签名
  signatureWebParams,           // Web 版 signature 签名

  // --- 工具函数 ---
  randomString,                 // 随机字符串生成
  decodeLyrics,                 // KRC 歌词解码
  parseCookieString,            // Cookie 字符串格式化
  cookieToJson,                 // Cookie 字符串转 JSON
  publicLiteRasKey,             // 概念版 RSA 公钥
  publicRasKey,                 // 标准版 RSA 公钥
  randomNumber,                 // 随机数字字符串生成
  calculateMid                  // 设备 MID 计算
};
