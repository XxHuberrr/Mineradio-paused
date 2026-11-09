/**
 * @fileoverview KuGouMusicApi 程序化 API 入口模块
 *
 * 本模块是项目的编程式调用入口（区别于 index.js 的 HTTP 服务入口），
 * 负责：
 * 1. 扫描 `module/` 目录下所有 API 模块文件并动态加载
 * 2. 为每个模块创建统一的包装函数，自动处理 Cookie 格式转换
 * 3. 将所有 API 函数与服务器工具、请求工具合并后统一导出
 *
 * 导出结构为扁平对象，模块文件名（去 .js 后缀）即为 API 函数名。
 * 例如：`module/search.js` → `api.search(params)`
 *
 * @module app
 * @requires node:fs
 * @requires path
 * @requires ./util - 工具函数（cookieToJson 等）
 * @requires ./server - 服务器管理（startService、getModulesDefinitions）
 * @requires ./util/request - 底层 HTTP 请求工具（createRequest）
 *
 * @example
 * // 作为库使用（编程式调用，不启动 HTTP 服务）
 * const api = require('./app');
 *
 * // 手机登录
 * const loginRes = await api.login_cellphone({
 *   mobile: '13800138000',
 *   code: '123456'
 * });
 *
 * // 搜索音乐（携带认证 Cookie）
 * const searchRes = await api.search({
 *   keywords: '海阔天空',
 *   cookie: `token=${loginRes.body.token};userid=${loginRes.body.userid}`
 * });
 */

const fs = require('node:fs');
const path = require('path');
const { cookieToJson } = require('./util');

/**
 * 动态注册的 API 函数集合
 *
 * 键为模块文件名（去 .js 后缀），值为对应的包装函数。
 * 例如：`{ search: [Function], login_cellphone: [Function], ... }`
 *
 * @type {Record<string, (data?: Record<string, any>) => Promise<any>>}
 */
let obj = {};

/**
 * ============================================================
 * 动态扫描并加载 module/ 目录下的所有 API 模块
 * ============================================================
 *
 * 扫描流程：
 * 1. 使用 `fs.readdirSync` 同步读取 `module/` 目录下所有文件
 * 2. 对文件列表进行倒序排列（与 server.js 中的路由注册顺序保持一致）
 * 3. 过滤出以 `.js` 结尾的文件
 * 4. 对每个模块文件：
 *    a. 通过 `require` 加载模块，获取模块处理函数
 *    b. 从文件名提取 API 函数名（去掉 `.js` 后缀，如 `search.js` → `search`）
 *    c. 创建包装函数并注册到 `obj` 对象中
 *
 * 每个包装函数的作用：
 * - 将调用者传入的 cookie 字符串自动转换为 JSON 对象
 * - 合并调用参数与默认 cookie
 * - 调用原始模块处理函数，同时注入请求工厂函数（lazy 加载 createRequest）
 */
fs.readdirSync(path.join(__dirname, 'module'))
  .reverse()
  .forEach((file) => {
    // 跳过非 .js 文件（如 .json、.map、目录等）
    if (!file.endsWith('.js')) return;

    // 加载模块，获取其导出的处理函数
    let fileModule = require(path.join(__dirname, 'module', file));

    // 提取 API 函数名：取文件名中第一个 `.` 之前的部分
    // 例如：`search.js` → `search`，`login_cellphone.js` → `login_cellphone`
    let fn = file.split('.').shift() || '';

    /**
     * 为当前模块创建包装函数
     *
     * @param {Record<string, any>} [data={}] - 调用者传入的请求参数
     * @returns {Promise<any>} 模块处理函数的返回结果
     */
    obj[fn] = (data = {}) => {
      // 自动将 cookie 字符串转换为 JSON 对象
      // 调用者可以传入 cookie 字符串（如 "token=xxx;userid=xxx"）或对象格式
      if (typeof data.cookie === 'string') data.cookie = cookieToJson(data.cookie);

      // 调用原始模块处理函数，传入两个参数：
      // 1. 合并后的参数对象（确保 cookie 始终为对象格式，默认为空对象）
      // 2. 请求工厂函数：延迟加载 createRequest，避免循环依赖
      return fileModule({ ...data, cookie: data.cookie ? data.cookie : {} }, (...args) => {
        // 延迟加载：仅在实际需要发起请求时才 require createRequest
        // 这样可以避免模块加载阶段的循环依赖问题
        const { createRequest } = require('./util/request');
        return createRequest(...args);
      });
    };
  });

/**
 * ============================================================
 * 统一导出
 * ============================================================
 *
 * 最终导出一个扁平对象，包含三部分内容：
 *
 * 1. `...require('./server')` — 服务器管理工具
 *    - `startService()`: 启动 HTTP 服务
 *    - `getModulesDefinitions()`: 动态扫描模块定义
 *
 * 2. `...require('./util/request')` — 底层请求工具
 *    - `createRequest()`: 创建 HTTP 请求
 *
 * 3. `...obj` — 所有 API 模块函数
 *    - 每个 module/*.js 文件对应一个同名函数
 *    - 如 `search`、`login_cellphone`、`song_url` 等
 *
 * @type {Record<string, any> & import("./server")}
 */
module.exports = { ...require('./server'), ...require('./util/request'), ...obj };
