/**
 * @fileoverview KuGouMusic API 服务器核心模块
 *
 * 基于 Express 框架构建的 HTTP 服务，负责：
 * - 动态扫描并加载 `module/` 目录下的所有 API 模块，自动注册路由
 * - 处理 CORS 跨域请求
 * - 解析请求 Cookie 并注入平台标识信息
 * - 提供 2 分钟的响应缓存机制
 * - 统一错误处理与响应返回
 *
 * @module server
 * @requires node:fs
 * @requires node:path
 * @requires express
 * @requires safe-decode-uri-component
 * @requires dotenv
 * @requires ./util/util
 * @requires ./util/crypto
 * @requires ./util/request
 * @requires ./util/apicache
 */

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const decode = require('safe-decode-uri-component');
const { cookieToJson, randomString, getGuid, calculateMid, generateWebGLHash } = require('./util/util');
const { cryptoMd5 } = require('./util/crypto');
const { createRequest } = require('./util/request');
const dotenv = require('dotenv');
const cache = require('./util/apicache').middleware;

/**
 * @typedef {Object} ModuleDefinition
 * @description API 模块的定义结构，由 {@link getModulesDefinitions} 生成
 * @property {string}  [identifier] - 模块标识符，取自文件名（去除 .js 后缀）
 * @property {string}  route        - 该模块对应的 Express 路由路径
 * @property {any}     module       - 模块导出的内容（require 加载时为模块对象，否则为文件路径）
 */

/**
 * @typedef {Object} ExpressExtension
 * @description 对 Express 实例的扩展，附加了 HTTP Server 引用
 * @property {import('http').Server} [server] - 底层 HTTP 服务实例
 */

/**
 * 全局唯一设备标识符（GUID）
 * 对随机生成的 GUID 字符串进行 MD5 哈希，作为默认的设备标识
 * @type {string}
 * @constant
 */
const guid = cryptoMd5(getGuid());

/**
 * 随机生成的 10 位大写字符串，用作默认的开发设备标识（DEV ID）
 * @type {string}
 * @constant
 */
const serverDev = randomString(10).toUpperCase();

/**
 * .env 环境变量配置文件路径
 * 优先从项目根目录加载，如果文件存在则通过 dotenv 读取其中的环境变量
 * @type {string}
 */
const envPath = path.join(process.cwd(), '.env');

if (fs.existsSync(envPath)) {
  // 静默加载 .env 文件中的环境变量到 process.env，quiet 抑制加载日志
  dotenv.config({ path: envPath, quiet: true });
}

/**
 * 动态扫描指定目录，获取所有 API 模块的定义信息
 *
 * 扫描流程：
 * 1. 读取 `modulesPath` 目录下的所有文件
 * 2. 过滤出以 `.js` 结尾且不以 `_` 开头的文件（`_` 前缀的文件视为内部模块，跳过注册）
 * 3. 对文件列表进行倒序排列（与 app.js 中的模块加载顺序保持一致）
 * 4. 根据文件名生成路由路径：默认将文件名中的 `_` 替换为 `/`，如有 `specificRoute` 自定义映射则优先使用
 * 5. 如果 `doRequire` 为 true，则通过 require 加载模块；否则仅返回文件路径
 *
 * @async
 * @param {string} modulesPath - 模块目录的绝对路径（例如 `path.join(__dirname, 'module')`）
 * @param {Record<string, string>} specificRoute - 特定文件名到路由路径的自定义映射表
 *   - key 为文件名（如 `"album_new.js"`），value 为自定义路由（如 `"/album/create"`）
 *   - 未在映射表中的文件将使用默认的路由生成规则
 * @param {boolean} [doRequire=true] - 是否通过 require 加载模块
 *   - `true`：直接 require 模块文件，返回模块导出对象
 *   - `false`：仅返回模块文件的绝对路径字符串
 * @returns {Promise<ModuleDefinition[]>} 模块定义数组，每个元素包含 identifier、route、module
 *
 * @example
 * // 扫描 module 目录并加载所有模块
 * const defs = await getModulesDefinitions(path.join(__dirname, 'module'), {});
 *
 * @example
 * // 自定义部分模块的路由
 * const defs = await getModulesDefinitions(
 *   path.join(__dirname, 'module'),
 *   { "album_new.js": "/album/create" }
 * );
 */
async function getModulesDefinitions(modulesPath, specificRoute, doRequire = true) {
  const files = await fs.promises.readdir(modulesPath);

  /**
   * 根据文件名解析出路由路径
   * 优先使用 specificRoute 中的自定义映射，否则按默认规则生成：
   *   - 去掉 .js 后缀
   *   - 将下划线 _ 替换为斜杠 /
   *   - 加上 / 前缀
   * 例如：`user_detail.js` → `/user/detail`
   * @param {string} fileName - 文件名
   * @returns {string} 路由路径
   */
  const parseRoute = (fileName) =>
    specificRoute && fileName in specificRoute ? specificRoute[fileName] : `/${fileName.replace(/\.(js)$/i, '').replace(/_/g, '/')}`;

  return (
    files
      // 倒序排列，确保模块加载顺序与 app.js 中 readdirSync().reverse() 保持一致
      .reverse()
      // 仅保留 .js 结尾且不以 _ 开头的文件（跳过内部/私有模块）
      .filter((fileName) => fileName.endsWith('.js') && !fileName.startsWith('_'))
      .map((fileName) => {
        // 模块标识符：取文件名的主体部分（去掉 .js 后缀）
        const identifier = fileName.split('.').shift();
        // 生成路由路径
        const route = parseRoute(fileName);
        // 模块文件的完整绝对路径
        const modulePath = path.resolve(modulesPath, fileName);
        // 根据 doRequire 决定是加载模块还是仅返回路径
        const module = doRequire ? require(modulePath) : modulePath;
        return { identifier, route, module };
      })
  );
}

/**
 * 构建并配置 Express 应用实例
 *
 * 该函数完成以下工作：
 * 1. 创建 Express 应用
 * 2. 配置 CORS 跨域中间件（处理 OPTIONS 预检请求）
 * 3. 配置自定义 Cookie 解析中间件
 * 4. 注入平台标识 Cookie（PLATFORM、MID、GUID、DEV、MAC）
 * 5. 配置 JSON / URL-encoded 请求体解析
 * 6. 挂载静态文件服务（public 目录和 docs 目录）
 * 7. 配置 2 分钟的 API 响应缓存
 * 8. 遍历所有模块定义，动态注册 Express 路由处理器
 *    - 每个路由处理器负责：合并请求参数、调用模块函数、处理 Cookie、返回响应
 *
 * @async
 * @param {ModuleDefinition[]} [moduleDefs] - 可选的模块定义数组
 *   - 如果未提供，则自动调用 {@link getModulesDefinitions} 从 `module/` 目录扫描加载
 * @returns {Promise<import('express').Express>} 配置完成的 Express 应用实例
 */
async function consturctServer(moduleDefs) {
  const app = express();

  // 从环境变量读取允许的跨域来源，若未配置则回退到请求头中的 origin 或 '*'
  const { CORS_ALLOW_ORIGIN } = process.env;

  // 启用反向代理信任，确保 req.ip 能正确获取客户端真实 IP（如经过 Nginx 反代）
  app.set('trust proxy', true);

  /**
   * ============================================================
   * CORS 跨域资源共享中间件
   * ============================================================
   *
   * 对非根路径且非静态文件的请求设置 CORS 响应头：
   * - Access-Control-Allow-Credentials: 允许携带凭证（Cookie）
   * - Access-Control-Allow-Origin: 允许的来源域名
   * - Access-Control-Allow-Headers: 允许的请求头
   * - Access-Control-Allow-Methods: 允许的 HTTP 方法
   * - Content-Type: 统一使用 UTF-8 编码的 JSON
   *
   * 对 OPTIONS 预检请求直接返回 204 No Content
   */
  app.use((req, res, next) => {
    if (req.path !== '/' && !req.path.includes('.')) {
      res.set({
        'Access-Control-Allow-Credentials': true,
        'Access-Control-Allow-Origin': CORS_ALLOW_ORIGIN || req.headers.origin || '*',
        'Access-Control-Allow-Headers': 'Authorization,X-Requested-With,Content-Type,Cache-Control',
        'Access-Control-Allow-Methods': 'PUT,POST,GET,DELETE,OPTIONS',
        'Content-Type': 'application/json; charset=utf-8',
      });
    }
    // OPTIONS 预检请求无需继续处理，直接返回 204
    req.method === 'OPTIONS' ? res.status(204).end() : next();
  });

  /**
   * ============================================================
   * Cookie 解析中间件
   * ============================================================
   *
   * 手动解析请求头中的 Cookie 字符串，将其转换为键值对对象并挂载到 req.cookies。
   *
   * 解析规则：
   * - 按 `; ` 或末尾空格分隔多个 cookie 键值对
   * - 每个键值对按第一个 `=` 分割为 key 和 value
   * - key 和 value 均通过 safe-decode-uri-component 解码
   * - 跳过无效的键值对（无 `=` 或 `=` 在末尾）
   */
  app.use((req, _, next) => {
    req.cookies = {};
    (req.headers.cookie || '').split(/;\s+|(?<!\s)\s+$/g).forEach((pair) => {
      const crack = pair.indexOf('=');
      // 跳过无效的 cookie：没有 = 号，或 = 号在最后（无 value）
      if (crack < 1 || crack === pair.length - 1) {
        return;
      }
      req.cookies[decode(pair.slice(0, crack)).trim()] = decode(pair.slice(crack + 1)).trim();
    });
    next();
  });

  /**
   * ============================================================
   * 平台标识 Cookie 注入中间件
   * ============================================================
   *
   * 自动向请求的 Cookie 对象中注入以下平台标识信息（仅在客户端未提供时补充）：
   * - KUGOU_API_PLATFORM: 平台类型（标准版/概念版 lite），来自环境变量 platform
   * - KUGOU_API_MID: 设备 MID，由 GUID 通过 calculateMid 算法生成
   * - KUGOU_API_GUID: 设备全局唯一标识符，优先使用环境变量 KUGOU_API_GUID，否则使用启动时生成的默认值
   * - KUGOU_API_DEV: 开发设备标识符，优先使用环境变量 KUGOU_API_DEV
   * - KUGOU_API_MAC: 设备 MAC 地址，默认为 '02:00:00:00:00:00'
   *
   * 同时通过 Set-Cookie 将这些值写回客户端，方便调试和后续请求自动携带。
   * 根据请求协议（HTTP/HTTPS）决定 Cookie 的安全属性（SameSite=None; Secure）。
   */
  app.use((req, res, next) => {
    const cookies = req.cookies || {};
    const isHttps = req.protocol === 'https';
    // HTTPS 下设置 SameSite=None; Secure 以支持跨站 Cookie 传递
    const cookieSuffix = isHttps ? '; PATH=/; SameSite=None; Secure' : '; PATH=/';

    /**
     * 确保指定的 cookie key 存在，如果不存在则自动写入
     * @param {string} key - Cookie 键名
     * @param {string} value - Cookie 默认值
     */
    const ensureCookie = (key, value) => {
      // 如果客户端已经提供了该 cookie，则跳过不覆盖
      if (Object.prototype.hasOwnProperty.call(cookies, key)) return;
      cookies[key] = String(value);
      res.append('Set-Cookie', `${key}=${cookies[key]}${cookieSuffix}`);
    };

    // 计算设备 MID（基于 GUID 的衍生标识）
    const mid = calculateMid(process.env.KUGOU_API_GUID ?? guid);

    // 依次注入各平台标识 Cookie
    ensureCookie('KUGOU_API_PLATFORM', process.env.platform);
    ensureCookie('KUGOU_API_MID', mid);
    ensureCookie('KUGOU_API_GUID', process.env.KUGOU_API_GUID ?? guid);
    ensureCookie('KUGOU_API_DEV', (process.env.KUGOU_API_DEV ?? serverDev).toUpperCase());
    ensureCookie('KUGOU_API_MAC', (process.env.KUGOU_API_MAC ?? '02:00:00:00:00:00').toUpperCase());
    ensureCookie('KUGOU_API_WEBGL', (process.env.KUGOU_API_WEBGL ?? generateWebGLHash()))

    // 将注入后的 cookies 回写到 req 对象上，供后续中间件和路由处理器使用
    req.cookies = cookies;

    next();
  });

  /**
   * ============================================================
   * 请求体解析中间件
   * ============================================================
   *
   * - express.json(): 解析 Content-Type 为 application/json 的请求体
   * - express.urlencoded(): 解析 Content-Type 为 application/x-www-form-urlencoded 的请求体
   *   - extended: false 使用 querystring 库解析（不支持嵌套对象）
   */
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: false, limit: '5mb' }));
  app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));

  /**
   * ============================================================
   * 静态文件服务
   * ============================================================
   *
   * 将项目根目录下的 `public/` 目录作为静态资源目录，
   * 可用于提供前端页面、图标等静态文件
   */
  app.use(express.static(path.join(__dirname, 'public')));

  /**
   * API 文档静态服务
   *
   * 将 `docs/` 目录挂载到 `/docs` 路径下，
   * 访问 /docs 可查看项目接口文档
   */
  app.use('/docs', express.static(path.join(__dirname, 'docs')));

  /**
   * ============================================================
   * API 响应缓存中间件
   * ============================================================
   /**
    * 使用 apicache 对成功的请求（statusCode === 200）进行 2 分钟的缓存。
    * 相同 URL 在 2 分钟内只会向酷狗服务器发送一次请求。
    *
    * 绕过缓存的方式：在请求 URL 后附加不同的 timestamp 参数，
    * 例如: /personal/fm?timestamp=1691256061923
    *
    * 注意：login_qr_check（扫码状态轮询）必须排除在缓存外——
    * 否则 waiting 状态被缓存后，用户扫码确认也轮询不到最新状态。
    */
   app.use(cache('2 minutes', (req, res) => {
     if (req.originalUrl && req.originalUrl.indexOf('/login/qr/check') >= 0) return false;
     return res.statusCode === 200;
   }));

  /**
   * ============================================================
   * 动态路由注册
   * ============================================================
   *
   * 如果未传入模块定义数组，则自动扫描 module/ 目录加载所有模块。
   * 遍历每个模块定义，为其注册 Express 路由处理器。
   */
  const moduleDefinitions = moduleDefs || (await getModulesDefinitions(path.join(__dirname, 'module'), {}));

  for (const moduleDef of moduleDefinitions) {
    /**
     * 为每个 API 模块注册路由处理器
     *
     * 请求处理流程：
     * 1. 解析并合并 Cookie（支持 query 和 body 中的 cookie 字符串）
     * 2. 合并所有请求参数：query 参数、body 参数、Cookie
     * 3. 提取 Authorization 请求头中的认证信息，合并到 cookie 中
     * 4. 调用模块处理函数，传入合并后的参数和请求工厂函数
     * 5. 处理模块返回的 Cookie（通过 Set-Cookie 写回客户端）
     * 6. 返回模块的响应数据
     * 7. 异常时记录日志并返回错误响应
     */
    app.use(moduleDef.route, async (req, res) => {
      // Step 1: 解析 query 和 body 中的 cookie 字符串为 JSON 对象
      [req.query, req.body].forEach((item) => {
        if (typeof item.cookie === 'string') {
          item.cookie = cookieToJson(decode(item.cookie));
        }
      });

      // Step 2: 从 query 中分离出 cookie 参数和其余参数
      const { cookie, ...params } = req.query;

      // Step 3: 构建统一的 query 对象
      //   - cookie: 合并请求 Cookie 和 query 中传入的 cookie 参数
      //   - params: query 中除 cookie 外的其余参数
      //   - body: 请求体（POST 数据）
      const body = Buffer.isBuffer(req.body) ? { data: req.body } : req.body;
      const query = Object.assign({}, { cookie: Object.assign({}, req.cookies, cookie) }, params, body);

      // Step 4: 如果请求携带了 Authorization 头，将其解析为 Cookie 并合并
      // 这样客户端可以通过 Authorization 头传递认证信息，例如: token=xxx;userid=xxx
      const authHeader = req.headers['authorization'];
      if (authHeader) {
        query.cookie = {
          ...query.cookie,
          ...cookieToJson(authHeader),
        };
      }

      try {
        /**
         * Step 5: 调用模块处理函数
         *
         * 传入两个参数：
         * - query: 合并后的所有请求参数
         * - 请求工厂函数: 接收请求配置，注入客户端 IP 后调用 createRequest 发起实际请求
         *
         * @see createRequest - 底层 HTTP 请求函数
         */
        const moduleResponse = await moduleDef.module(query, (config) => {
          // 获取客户端真实 IP（去除 IPv6-mapped IPv4 前缀）
          let ip = req.ip;
          if (ip.substring(0, 7) === '::ffff:') {
            ip = ip.substring(7);
          }
          config.ip = ip;
          return createRequest(config);
        });

        // 请求成功日志
        console.log('[OK]', decode(req.originalUrl));

        // Step 6: 处理模块返回的 Cookie
        // 将模块设置的 Cookie 通过 Set-Cookie 响应头写回客户端
        const cookies = moduleResponse.cookie;
        if (!query.noCookie) {
          if (Array.isArray(cookies) && cookies.length > 0) {
            if (req.protocol === 'https') {
              // HTTPS 协议下设置 SameSite=None; Secure 以解决 CORS 环境下的 Cookie 传递问题
              res.append(
                'Set-Cookie',
                cookies.map((cookie) => {
                  return `${cookie}; PATH=/; SameSite=None; Secure`;
                })
              );
            } else {
              // HTTP 协议下仅设置 PATH
              res.append(
                'Set-Cookie',
                cookies.map((cookie) => {
                  return `${cookie}; PATH=/`;
                })
              );
            }
          }
        }

        // Step 7: 返回模块的响应（包含 headers、status、body）
        res.header(moduleResponse.headers).status(moduleResponse.status).send(moduleResponse.body);
      } catch (e) {
        // 异常处理：模块内部错误会被封装为包含 status 和 body 的错误对象抛出
        const moduleResponse = e;

        // 错误日志
        console.log('[ERR]', decode(req.originalUrl), {
          status: moduleResponse.status,
          body: moduleResponse.body,
        });

        // 如果错误对象没有 body，返回通用 404 响应
        if (!moduleResponse.body) {
          res.status(404).send({
            code: 404,
            data: null,
            msg: 'Not Found',
          });
          return;
        }

        // 返回模块错误的响应体
        res.header(moduleResponse.headers).status(moduleResponse.status).send(moduleResponse.body);
      }
    });
  }

  return app;
}

/**
 * 启动 KuGouMusic API 服务
 *
 * 完整启动流程：
 * 1. 从环境变量读取端口号（默认 3000）和主机地址（默认空字符串，即监听所有可用地址）
 * 2. 调用 {@link consturctServer} 构建并配置 Express 应用
 * 3. 在指定端口和主机上启动 HTTP 监听
 * 4. 输出启动成功日志
 * 5. 返回扩展后的 Express 实例（附带底层 server 引用）
 *
 * @async
 * @returns {Promise<import('express').Express & ExpressExtension>} 扩展后的 Express 应用实例，
 *   包含 `service` 属性指向底层 HTTP Server
 *
 * @example
 * // 基本用法
 * const app = await startService();
 * // 服务已启动，可通过 app.service 访问底层 HTTP Server
 *
 * @example
 * // 通过环境变量自定义端口和主机
 * // PORT=4000 HOST=127.0.0.1 node index.js
 */
async function startService() {
  // 读取端口号配置，默认为 3000
  const port = Number(process.env.PORT || '3000');
  // 读取主机地址配置，默认为空（监听所有网络接口）
  const host = process.env.HOST || '';

  // 构建 Express 应用（包含所有中间件和路由）
  const app = await consturctServer();

  /** @type {import('express').Express & ExpressExtension} */
  const appExt = app;

  // 启动 HTTP 服务并监听指定端口和主机
  appExt.service = app.listen(port, host, () => {
    console.log(`server running @ http://${host || 'localhost'}:${port}`);
  });

  return appExt;
}

module.exports = { startService, getModulesDefinitions };
