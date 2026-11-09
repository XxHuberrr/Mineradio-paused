/**
 * @fileoverview API 响应缓存中间件
 *
 * 来源: 基于 [Binaryify/NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) 修改
 *
 * 本模块提供 Express 中间件级别的 API 响应缓存功能，支持：
 * - 内存缓存（默认）和 Redis 缓存（可选）
 * - 按时间字符串（如 "2 minutes"、"1 hour"）设置缓存过期
 * - 按分组管理缓存条目，支持批量清除
 * - 自定义缓存条件（状态码过滤、请求/响应 toggle 函数）
 * - 缓存命中率统计（可选，用于性能监控）
 * - ETag/304 协商缓存支持
 * - JSONP 请求的 URL 去参处理
 *
 * 使用示例：
 *   const cache = require('./apicache').middleware;
 *   app.use(cache('2 minutes', (req, res) => res.statusCode === 200));
 *
 * @module apicache
 * @requires url - URL 解析（用于 JSONP 模式下去除查询参数）
 * @requires ./memory-cache - 内存缓存实现
 */

const url = require('url');
const MemoryCache = require('./memory-cache');

/**
 * 时间单位到毫秒的转换表
 * 用于解析人类可读的时间字符串（如 "2 minutes"、"1 hour"）
 * @type {Object.<string, number>}
 */
const t = {
  ms: 1,                    // 毫秒
  second: 1000,             // 秒 → 1000ms
  minute: 60000,            // 分钟 → 60000ms
  hour: 3600000,            // 小时 → 3600000ms
  day: 3600000 * 24,        // 天 → 86400000ms
  week: 3600000 * 24 * 7,   // 周 → 604800000ms
  month: 3600000 * 24 * 30, // 月（30天）→ 2592000000ms
};

/**
 * 所有 ApiCache 实例的全局注册表
 * 用于跟踪和管理多个缓存实例
 * @type {Array<ApiCache>}
 */
const instances = [];

/**
 * 创建严格相等匹配函数
 * @param {string} a - 要匹配的值
 * @returns {function(string): boolean} 匹配函数
 */
const matches = function (a) {
  return function (b) {
    return a === b;
  };
};

/**
 * 创建不匹配函数（matches 的反函数）
 * @param {string} a - 要排除的值
 * @returns {function(string): boolean} 不匹配函数
 */
const doesntMatch = function (a) {
  return function (b) {
    return !matches(a)(b);
  };
};

/**
 * 格式化持续时间为人类可读的日志字符串
 * 超过 1000ms 显示为秒（如 "1.23sec"），否则显示为毫秒（如 "456ms"）
 * 输出带黄色 ANSI 转义码
 *
 * @param {number} d - 持续时间（毫秒）
 * @param {string} [prefix] - 可选的前缀文本
 * @returns {string} 带颜色的日志字符串
 */
const logDuration = function (d, prefix) {
  const str = d > 1000 ? `${(d / 1000).toFixed(2)}sec` : `${d}ms`;
  return `\x1B[33m- ${prefix ? `${prefix} ` : ''}${str}\x1B[0m`;
};

/**
 * 安全地获取响应头对象
 * 兼容不同版本的 Express/Node.js
 * @param {Object} res - Express 响应对象
 * @returns {Object} 响应头键值对
 */
function getSafeHeaders(res) {
  return res.getHeaders ? res.getHeaders() : res._headers;
}

/**
 * ApiCache 缓存中间件构造函数
 *
 * 每个实例维护独立的：
 * - 内存缓存（MemoryCache）
 * - 全局配置选项
 * - 缓存索引（all + groups）
 * - 定时器集合（用于自动过期清除）
 * - 性能统计数组
 *
 * @constructor
 */
function ApiCache() {
  const memCache = new MemoryCache();

  /**
   * 全局配置选项
   * @type {Object}
   */
  const globalOptions = {
    debug: false,                // 是否开启调试日志
    defaultDuration: 3600000,    // 默认缓存时长（1小时，毫秒）
    enabled: true,               // 是否启用缓存
    appendKey: [],               // 自定义缓存键追加字段（数组或函数）
    jsonp: false,                // 是否为 JSONP 请求（启用后会去除 URL 中的查询参数）
    redisClient: false,          // Redis 客户端实例（false 表示使用内存缓存）
    headerBlacklist: [],         // 不缓存的响应头黑名单
    statusCodes: {
      include: [],               // 仅缓存这些状态码（空数组表示不限制）
      exclude: [],               // 排除这些状态码
    },
    events: {
      expire: undefined,         // 缓存过期时的回调函数
    },
    headers: {},                 // 强制覆盖的响应头（如 'cache-control': 'no-cache'）
    trackPerformance: false,     // 是否跟踪缓存命中率（会增加内存消耗）
  };

  const middlewareOptions = [];  // 所有中间件的选项注册表
  const instance = this;
  let index = null;              // 缓存索引：{ all: [key...], groups: { groupName: [key...] } }
  const timers = {};             // 自动过期定时器集合 { key: setTimeout ID }
  const performanceArray = [];   // 缓存命中率统计数组

  // 将当前实例注册到全局实例列表
  instances.push(this);
  this.id = instances.length;

  /**
   * 调试日志输出函数
   * 仅在 debug 模式或环境变量 DEBUG 包含 'apicache' 时输出
   * @param {...*} args - 日志参数
   */
  function debug(a, b, c, d) {
    const arr = ['\x1B[36m[apicache]\x1B[0m', a, b, c, d].filter((arg) => {
      return arg !== undefined;
    });
    const debugEnv = process.env.DEBUG && process.env.DEBUG.split(',').includes('apicache');

    return (globalOptions.debug || debugEnv) && console.log.apply(null, arr);
  }

  /**
   * 判断响应是否应该被缓存
   *
   * 判断逻辑：
   * 1. 响应对象必须存在
   * 2. 如果提供了 toggle 函数，toggle 必须返回 true
   * 3. 响应状态码不在 exclude 列表中
   * 4. 响应状态码在 include 列表中（如果 include 非空）
   *
   * @param {Object} request - Express 请求对象
   * @param {Object} response - Express 响应对象
   * @param {function} [toggle] - 可选的缓存条件函数 (req, res) => boolean
   * @returns {boolean} 是否应该缓存
   */
  function shouldCacheResponse(request, response, toggle) {
    const opt = globalOptions;
    const codes = opt.statusCodes;

    if (!response) {
      return false;
    }

    // 自定义 toggle 函数判断
    if (toggle && !toggle(request, response)) {
      return false;
    }

    // 状态码排除列表
    if (codes.exclude && codes.exclude.length && codes.exclude.includes(response.statusCode)) {
      return false;
    }
    // 状态码包含列表（白名单模式）
    if (codes.include && codes.include.length && codes.include.includes(response.statusCode)) {
      return false;
    }

    return true;
  }

  /**
   * 将缓存键添加到索引中
   *
   * 索引结构：
   * - index.all: 所有缓存键的数组（用于全量清除）
   * - index.groups: 按分组名索引的缓存键数组（用于按组清除）
   *
   * @param {string} key - 缓存键
   * @param {Object} req - Express 请求对象（req.apicacheGroup 可指定分组名）
   */
  function addIndexEntries(key, req) {
    const groupName = req.apicacheGroup;

    if (groupName) {
      debug(`group detected "${groupName}"`);
      // 将键添加到分组索引（unshift 添加到数组头部）
      const group = (index.groups[groupName] = index.groups[groupName] || []);
      group.unshift(key);
    }

    // 将键添加到全局索引
    index.all.unshift(key);
  }

  /**
   * 过滤掉黑名单中的响应头
   * @param {Object} headers - 原始响应头
   * @returns {Object} 过滤后的响应头
   */
  function filterBlacklistedHeaders(headers) {
    return Object.keys(headers)
      .filter((key) => {
        return !globalOptions.headerBlacklist.includes(key);
      })
      .reduce((acc, header) => {
        acc[header] = headers[header];
        return acc;
      }, {});
  }

  /**
   * 创建缓存对象
   *
   * @param {number} status - HTTP 状态码
   * @param {Object} headers - 响应头
   * @param {string|Buffer} data - 响应体数据
   * @param {string} encoding - 编码方式
   * @returns {Object} 缓存对象
   */
  function createCacheObject(status, headers, data, encoding) {
    return {
      status,
      headers: filterBlacklistedHeaders(headers), // 过滤黑名单头
      data,
      encoding,
      timestamp: new Date().getTime() / 1000, // Unix 时间戳（秒），用于计算剩余 max-age
    };
  }

  /**
   * 将响应数据存入缓存
   *
   * 支持两种存储后端：
   * - Redis: 使用 hset 存储，expire 设置过期
   * - 内存: 使用 MemoryCache 存储
   *
   * 同时设置自动清除定时器（setTimeout 最大值限制为 2147483647ms ≈ 24.8 天）
   *
   * @param {string} key - 缓存键
   * @param {Object} value - 缓存对象
   * @param {number} duration - 缓存时长（毫秒）
   */
  function cacheResponse(key, value, duration) {
    const redis = globalOptions.redisClient;
    const expireCallback = globalOptions.events.expire;

    if (redis && redis.connected) {
      // Redis 存储
      try {
        redis.hset(key, 'response', JSON.stringify(value));
        redis.hset(key, 'duration', duration);
        redis.expire(key, duration / 1000, expireCallback || (() => {}));
      } catch (err) {
        debug('[apicache] error in redis.hset()');
      }
    } else {
      // 内存存储
      memCache.add(key, value, duration, expireCallback);
    }

    // 设置自动清除定时器（限制最大值防止 setTimeout 溢出）
    timers[key] = setTimeout(() => {
      instance.clear(key, true);
    }, Math.min(duration, 2147483647));
  }

  /**
   * 累积响应内容到 res._apicache.content
   *
   * Express 的 res.write() 可能被多次调用，每次传递部分内容。
   * 此函数将所有部分内容累积起来，用于最终缓存完整的响应。
   *
   * 支持三种内容类型：
   * - string: 字符串拼接
   * - Buffer: Buffer.concat 拼接
   * - 其他: 直接赋值（如 JSON 对象）
   *
   * @param {Object} res - Express 响应对象
   * @param {string|Buffer} content - 本次写入的内容
   */
  function accumulateContent(res, content) {
    if (content) {
      if (typeof content == 'string') {
        // 字符串拼接
        res._apicache.content = (res._apicache.content || '') + content;
      } else if (Buffer.isBuffer(content)) {
        let oldContent = res._apicache.content;

        // 将旧的字符串内容转为 Buffer
        if (typeof oldContent === 'string') {
          oldContent = !Buffer.from ? new Buffer(oldContent) : Buffer.from(oldContent);
        }

        if (!oldContent) {
          oldContent = !Buffer.alloc ? Buffer.alloc(0) : Buffer.alloc(0);
        }

        // Buffer 拼接
        res._apicache.content = Buffer.concat([oldContent, content], oldContent.length + content.length);
      } else {
        // 其他类型直接赋值
        res._apicache.content = content;
      }
    }
  }

  /**
   * 使响应变得可缓存（Monkey-patch res 的方法）
   *
   * 通过劫持 res.writeHead、res.write、res.end 三个方法，
   * 在响应完成时自动将内容存入缓存。
   *
   * 流程：
   * 1. 保存原始方法引用到 res._apicache
   * 2. 应用全局响应头覆盖
   * 3. 重写 res.writeHead: 添加 cache-control 头，保存响应头快照
   * 4. 重写 res.write: 累积部分内容
   * 5. 重写 res.end: 判断是否缓存，创建缓存对象并存储
   *
   * @param {Object} req - Express 请求对象
   * @param {Object} res - Express 响应对象
   * @param {function} next - Express next 函数
   * @param {string} key - 缓存键
   * @param {number} duration - 缓存时长（毫秒）
   * @param {string} strDuration - 原始时长字符串（用于日志）
   * @param {function} [toggle] - 缓存条件函数
   */
  function makeResponseCacheable(req, res, next, key, duration, strDuration, toggle) {
    // 保存原始方法引用，用于后续调用
    res._apicache = {
      write: res.write,
      writeHead: res.writeHead,
      end: res.end,
      cacheable: true,
      content: undefined,
    };

    // 应用全局响应头覆盖
    Object.keys(globalOptions.headers).forEach((name) => {
      res.setHeader(name, globalOptions.headers[name]);
    });

    // 重写 res.writeHead：添加 cache-control 头并保存响应头快照
    res.writeHead = function () {
      if (!globalOptions.headers['cache-control']) {
        if (shouldCacheResponse(req, res, toggle)) {
          // 可缓存：设置 max-age
          res.setHeader('cache-control', `max-age=${(duration / 1000).toFixed(0)}`);
        } else {
          // 不可缓存：禁止缓存
          res.setHeader('cache-control', 'no-cache, no-store, must-revalidate');
        }
      }

      // 保存响应头快照（在 writeHead 被调用后，headers 已确定）
      res._apicache.headers = Object.assign({}, getSafeHeaders(res));
      return res._apicache.writeHead.apply(this, arguments);
    };

    // 重写 res.write：累积部分内容
    res.write = function (content) {
      accumulateContent(res, content);
      return res._apicache.write.apply(this, arguments);
    };

    // 重写 res.end：判断是否缓存，创建缓存对象并存储
    res.end = function (content, encoding) {
      if (shouldCacheResponse(req, res, toggle)) {
        accumulateContent(res, content);

        if (res._apicache.cacheable && res._apicache.content) {
          // 添加到缓存索引
          addIndexEntries(key, req);
          const headers = res._apicache.headers || getSafeHeaders(res);
          // 创建缓存对象并存储
          const cacheObject = createCacheObject(res.statusCode, headers, res._apicache.content, encoding);
          cacheResponse(key, cacheObject, duration);

          // 调试日志
          const elapsed = new Date() - req.apicacheTimer;
          debug(`adding cache entry for "${key}" @ ${strDuration}`, logDuration(elapsed));
          debug('_apicache.headers: ', res._apicache.headers);
          debug('res.getHeaders(): ', getSafeHeaders(res));
          debug('cacheObject: ', cacheObject);
        }
      }

      // 调用原始 res.end
      return res._apicache.end.apply(this, arguments);
    };

    next();
  }

  /**
   * 发送缓存的响应
   *
   * 处理逻辑：
   * 1. 检查 toggle 函数是否允许返回缓存
   * 2. 合并响应头，正确递减 max-age（减去已过去的时间）
   * 3. 反序列化 Buffer 数据
   * 4. 检查 ETag/If-None-Match，满足条件返回 304
   * 5. 返回完整的缓存响应
   *
   * @param {Object} request - Express 请求对象
   * @param {Object} response - Express 响应对象
   * @param {Object} cacheObject - 缓存对象
   * @param {function} [toggle] - 缓存条件函数
   * @param {function} next - Express next 函数
   * @param {number} duration - 缓存时长（毫秒）
   */
  function sendCachedResponse(request, response, cacheObject, toggle, next, duration) {
    if (toggle && !toggle(request, response)) {
      return next();
    }

    const headers = getSafeHeaders(response);

    // 合并缓存的响应头，并正确递减 max-age
    Object.assign(headers, filterBlacklistedHeaders(cacheObject.headers || {}), {
      // max-age = 原始时长 - 已过去的时间，最小为 0
      'cache-control': `max-age=${Math.max(0, (duration / 1000 - (new Date().getTime() / 1000 - cacheObject.timestamp)).toFixed(0))}`,
    });

    // 反序列化 Buffer 数据（JSON 序列化后的 Buffer 会变成 { type: 'Buffer', data: [...] } 格式）
    let data = cacheObject.data;
    if (data && data.type === 'Buffer') {
      data = typeof data.data === 'number' ? new Buffer.alloc(data.data) : new Buffer.from(data.data);
    }

    // ETag 协商缓存：如果请求的 If-None-Match 与缓存的 ETag 匹配，返回 304
    const cachedEtag = cacheObject.headers.etag;
    const requestEtag = request.headers['if-none-match'];

    if (requestEtag && cachedEtag === requestEtag) {
      response.writeHead(304, headers);
      return response.end();
    }

    // 返回缓存的响应
    response.writeHead(cacheObject.status || 200, headers);

    return response.end(data, cacheObject.encoding);
  }

  /**
   * 同步全局选项到所有中间件实例
   * 将 globalOptions 合并到每个中间件的 opt 中，并应用各自的 localOptions
   */
  function syncOptions() {
    for (const i in middlewareOptions) {
      Object.assign(middlewareOptions[i].options, globalOptions, middlewareOptions[i].localOptions);
    }
  }

  /**
   * 清除缓存
   *
   * 支持三种清除模式：
   * 1. 按分组名清除: target 为分组名，清除该分组下的所有缓存
   * 2. 按缓存键清除: target 为具体的缓存键
   * 3. 全部清除: target 为空，清除所有缓存
   *
   * @param {string} [target] - 分组名或缓存键，为空则清除全部
   * @param {boolean} [isAutomatic] - 是否为自动过期清除（用于日志区分）
   * @returns {Object} 当前缓存索引
   */
  this.clear = function (target, isAutomatic) {
    const group = index.groups[target];
    const redis = globalOptions.redisClient;

    if (group) {
      // 模式1: 按分组名清除
      debug(`clearing group "${target}"`);

      group.forEach((key) => {
        debug(`clearing cached entry for "${key}"`);
        clearTimeout(timers[key]);
        delete timers[key];
        if (!globalOptions.redisClient) {
          memCache.delete(key);
        } else {
          try {
            redis.del(key);
          } catch (err) {
            console.log(`[apicache] error in redis.del("${key}")`);
          }
        }
        index.all = index.all.filter(doesntMatch(key));
      });

      delete index.groups[target];
    } else if (target) {
      // 模式2: 按缓存键清除
      debug(`clearing ${isAutomatic ? 'expired' : 'cached'} entry for "${target}"`);
      clearTimeout(timers[target]);
      delete timers[target];

      if (!redis) {
        memCache.delete(target);
      } else {
        try {
          redis.del(target);
        } catch (err) {
          console.log(`[apicache] error in redis.del("${target}")`);
        }
      }

      // 从全局索引中移除
      index.all = index.all.filter(doesntMatch(target));

      // 从所有分组中移除，并清理空分组
      Object.keys(index.groups).forEach((groupName) => {
        index.groups[groupName] = index.groups[groupName].filter(doesntMatch(target));

        if (!index.groups[groupName].length) {
          delete index.groups[groupName];
        }
      });
    } else {
      // 模式3: 全部清除
      debug('clearing entire index');

      if (!redis) {
        memCache.clear();
      } else {
        // 逐个清除 Redis 键（避免误删非 apicache 的条目）
        index.all.forEach((key) => {
          clearTimeout(timers[key]);
          delete timers[key];
          try {
            redis.del(key);
          } catch (err) {
            console.log(`[apicache] error in redis.del("${key}")`);
          }
        });
      }
      this.resetIndex();
    }

    return this.getIndex();
  };

  /**
   * 解析时长字符串为毫秒数
   *
   * 支持的格式：
   * - 数字: 直接返回（毫秒）
   * - 字符串: "2 minutes"、"1 hour"、"30 seconds"、"500ms"
   *   - 数字部分支持小数点（如 "1.5 hours"）
   *   - 单位支持复数（自动去掉末尾的 s）
   *   - "m" 会被解析为 "ms"（毫秒缩写）
   *
   * @param {number|string} duration - 时长（数字或字符串）
   * @param {number} defaultDuration - 默认时长（解析失败时使用）
   * @returns {number} 时长（毫秒）
   */
  function parseDuration(duration, defaultDuration) {
    if (typeof duration === 'number') {
      return duration;
    }

    if (typeof duration === 'string') {
      const split = duration.match(/^([\d\.,]+)\s?(\w+)$/);

      if (split.length === 3) {
        const len = Number.parseFloat(split[1]);
        let unit = split[2].replace(/s$/i, '').toLowerCase();
        if (unit === 'm') {
          unit = 'ms';
        }

        return (len || 1) * (t[unit] || 0);
      }
    }

    return defaultDuration;
  }

  /**
   * 获取时长（公开方法）
   * @param {number|string} duration - 时长
   * @returns {number} 解析后的毫秒数
   */
  this.getDuration = function (duration) {
    return parseDuration(duration, globalOptions.defaultDuration);
  };

  /**
   * 获取缓存性能统计（命中率）
   *
   * 可用于创建性能监控接口：
   * app.get('/api/cache/performance', (req, res) => {
   *    res.json(apicache.getPerformance())
   * })
   *
   * @returns {Array<Object>} 每个中间件的性能报告数组
   */
  this.getPerformance = function () {
    return performanceArray.map((p) => {
      return p.report();
    });
  };

  /**
   * 获取缓存索引
   * @param {string} [group] - 可选的分组名，不传则返回完整索引
   * @returns {Object} 缓存索引
   */
  this.getIndex = function (group) {
    if (group) {
      return index.groups[group];
    } else {
      return index;
    }
  };

  /**
   * 创建缓存中间件
   *
   * 这是主要的公开 API，返回一个 Express 中间件函数。
   * 中间件会拦截请求，检查缓存，命中则直接返回缓存响应，未命中则继续处理并缓存响应。
   *
   * @param {string|number} strDuration - 缓存时长（如 "2 minutes" 或 120000）
   * @param {function} [middlewareToggle] - 中间件级别的缓存条件函数 (req, res) => boolean
   * @param {Object} [localOptions] - 本中间件的局部配置（覆盖全局配置）
   * @returns {function} Express 中间件函数
   */
  this.middleware = function cache(strDuration, middlewareToggle, localOptions) {
    const duration = instance.getDuration(strDuration);
    const opt = {};

    // 注册中间件选项
    middlewareOptions.push({
      options: opt,
    });

    /**
     * 更新或获取中间件选项
     * @param {Object} [localOptions] - 局部配置
     * @returns {Object} 当前中间件的配置
     */
    const options = function (localOptions) {
      if (localOptions) {
        middlewareOptions.find((middleware) => {
          return middleware.options === opt;
        }).localOptions = localOptions;
      }

      syncOptions();

      return opt;
    };

    options(localOptions);

    /**
     * 空操作的性能统计类（不跟踪性能时使用）
     * 所有方法都是空函数，避免条件判断开销
     */
    function NOOPCachePerformance() {
      this.report = this.hit = this.miss = function () {}; // noop;
    }

    /**
     * 缓存命中率统计类
     *
     * 使用位压缩技术高效存储历史命中/未命中记录：
     * - 每个 Uint8Array 元素存储 4 条记录
     * - 每条记录占 2 bit: 00=无记录, 01=命中, 10=未命中
     * - 支持 4 个时间窗口: 最近 100/1000/10000/100000 次请求
     */
    function CachePerformance() {
      /**
       * 最近 100 次请求的命中记录（位压缩存储）
       * @type {Uint8Array}
       */
      this.hitsLast100 = new Uint8Array(100 / 4); // each hit is 2 bits

      /**
       * 最近 1000 次请求的命中记录
       * @type {Uint8Array}
       */
      this.hitsLast1000 = new Uint8Array(1000 / 4); // each hit is 2 bits

      /**
       * 最近 10000 次请求的命中记录
       * @type {Uint8Array}
       */
      this.hitsLast10000 = new Uint8Array(10000 / 4); // each hit is 2 bits

      /**
       * 最近 100000 次请求的命中记录
       * @type {Uint8Array}
       */
      this.hitsLast100000 = new Uint8Array(100000 / 4); // each hit is 2 bits

      /**
       * 总请求次数（自服务器启动以来）
       * @type {number}
       */
      this.callCount = 0;

      /**
       * 总命中次数
       * @type {number}
       */
      this.hitCount = 0;

      /**
       * 最后一次缓存命中的键（用于识别对应路由）
       * @type {string|null}
       */
      this.lastCacheHit = null;

      /**
       * 最后一次缓存未命中的键
       * @type {string|null}
       */
      this.lastCacheMiss = null;

      /**
       * 生成性能统计报告
       * @returns {Object} 包含各项统计指标的报告对象
       */
      this.report = function () {
        return {
          lastCacheHit: this.lastCacheHit,
          lastCacheMiss: this.lastCacheMiss,
          callCount: this.callCount,
          hitCount: this.hitCount,
          missCount: this.callCount - this.hitCount,
          hitRate: this.callCount == 0 ? null : this.hitCount / this.callCount,
          hitRateLast100: this.hitRate(this.hitsLast100),
          hitRateLast1000: this.hitRate(this.hitsLast1000),
          hitRateLast10000: this.hitRate(this.hitsLast10000),
          hitRateLast100000: this.hitRate(this.hitsLast100000),
        };
      };

      /**
       * 从位压缩数组中计算命中率
       *
       * 遍历每个字节的 4 个 2-bit 记录：
       * - 01 (1) = 命中
       * - 10 (2) = 未命中
       * - 00 (0) = 无记录（忽略）
       *
       * @param {Uint8Array} array - 位压缩的命中记录数组
       * @returns {number|null} 命中率（0~1），无记录时返回 null
       */
      this.hitRate = function (array) {
        let hits = 0;
        let misses = 0;
        for (let i = 0; i < array.length; i++) {
          let n8 = array[i];
          for (j = 0; j < 4; j++) {
            switch (n8 & 3) {
              case 1:
                hits++;
                break;
              case 2:
                misses++;
                break;
            }
            n8 >>= 2;
          }
        }
        const total = hits + misses;
        if (total == 0) {
          return null;
        }
        return hits / total;
      };

      /**
       * 在位压缩数组中记录一次命中或未命中
       *
       * 编码规则（每个 2-bit 记录）：
       * - 00: 无记录
       * - 01: 命中
       * - 10: 未命中
       *
       * @param {Uint8Array} array - 位压缩数组
       * @param {boolean} hit - true=命中, false=未命中
       */
      this.recordHitInArray = function (array, hit) {
        const arrayIndex = ~~(this.callCount / 4) % array.length;   // 数组索引
        const bitOffset = (this.callCount % 4) * 2;                  // 位偏移（每 2 bit 一条记录）
        const clearMask = ~(3 << bitOffset);                         // 清除掩码
        const record = (hit ? 1 : 2) << bitOffset;                   // 编码记录
        array[arrayIndex] = (array[arrayIndex] & clearMask) | record;
      };

      /**
       * 记录一次命中/未命中到所有时间窗口的数组
       * @param {boolean} hit - true=命中, false=未命中
       */
      this.recordHit = function (hit) {
        this.recordHitInArray(this.hitsLast100, hit);
        this.recordHitInArray(this.hitsLast1000, hit);
        this.recordHitInArray(this.hitsLast10000, hit);
        this.recordHitInArray(this.hitsLast100000, hit);
        if (hit) {
          this.hitCount++;
        }
        this.callCount++;
      };

      /**
       * 记录一次缓存命中
       * @param {string} key - 命中的缓存键
       */
      this.hit = function (key) {
        this.recordHit(true);
        this.lastCacheHit = key;
      };

      /**
       * 记录一次缓存未命中
       * @param {string} key - 未命中的缓存键
       */
      this.miss = function (key) {
        this.recordHit(false);
        this.lastCacheMiss = key;
      };
    }

    // 根据配置决定使用真实的性能统计还是空操作
    const perf = globalOptions.trackPerformance ? new CachePerformance() : new NOOPCachePerformance();

    performanceArray.push(perf);

    /**
     * 核心缓存中间件函数
     *
     * 请求处理流程：
     * 1. 检查缓存是否启用、是否有 bypass 头
     * 2. 生成缓存键（hostname + URL + appendKey）
     * 3. 尝试从内存缓存获取 → 命中则直接返回
     * 4. 尝试从 Redis 获取 → 命中则直接返回
     * 5. 未命中 → 劫持 res 方法，等待响应完成后缓存
     */
    const cache = function (req, res, next) {
      /**
       * 跳过缓存，直接进入下一个中间件
       */
      function bypass() {
        debug('bypass detected, skipping cache.');
        return next();
      }

      // 初始跳过检查
      if (!opt.enabled) {
        return bypass();
      }
      // 通过请求头强制跳过缓存
      if (req.headers['x-apicache-bypass'] || req.headers['x-apicache-force-fetch']) {
        return bypass();
      }

      // 记录请求开始时间（用于计算耗时）
      req.apicacheTimer = new Date();

      // 生成缓存键: hostname + URL
      // Express 4.x 中 req.url 可能是路由相对路径，使用 originalUrl 获取完整路径
      let key = req.hostname + (req.originalUrl || req.url);
      // JSONP 模式：去除查询参数（避免不同的 callback 参数产生不同的缓存键）
      if (opt.jsonp) {
        key = url.parse(key).pathname;
      }

      // 追加自定义缓存键（支持函数或属性路径数组）
      if (typeof opt.appendKey === 'function') {
        key += `$$appendKey=${opt.appendKey(req, res)}`;
      } else if (opt.appendKey.length > 0) {
        let appendKey = req;

        for (let i = 0; i < opt.appendKey.length; i++) {
          appendKey = appendKey[opt.appendKey[i]];
        }
        key += `$$appendKey=${appendKey}`;
      }

      // 尝试从缓存获取
      const redis = opt.redisClient;
      const cached = !redis ? memCache.getValue(key) : null;

      // 内存缓存命中
      if (cached) {
        const elapsed = new Date() - req.apicacheTimer;
        debug('sending cached (memory-cache) version of', key, logDuration(elapsed));

        perf.hit(key);
        return sendCachedResponse(req, res, cached, middlewareToggle, next, duration);
      }

      // Redis 缓存命中
      if (redis && redis.connected) {
        try {
          redis.hgetall(key, (err, obj) => {
            if (!err && obj && obj.response) {
              const elapsed = new Date() - req.apicacheTimer;
              debug('sending cached (redis) version of', key, logDuration(elapsed));

              perf.hit(key);
              return sendCachedResponse(req, res, JSON.parse(obj.response), middlewareToggle, next, duration);
            } else {
              // Redis 未命中，进入缓存写入流程
              perf.miss(key);
              return makeResponseCacheable(req, res, next, key, duration, strDuration, middlewareToggle);
            }
          });
        } catch (err) {
          // Redis 出错时降级为未命中
          perf.miss(key);
          return makeResponseCacheable(req, res, next, key, duration, strDuration, middlewareToggle);
        }
      } else {
        // 无 Redis，内存也未命中，进入缓存写入流程
        perf.miss(key);
        return makeResponseCacheable(req, res, next, key, duration, strDuration, middlewareToggle);
      }
    };

    // 暴露 options 函数，允许运行时修改配置
    cache.options = options;

    return cache;
  };

  /**
   * 设置或获取全局配置选项
   *
   * @param {Object} [options] - 配置对象，不传则返回当前配置
   * @returns {ApiCache|Object} 传入 options 时返回 this（支持链式调用），否则返回当前配置
   */
  this.options = function (options) {
    if (options) {
      Object.assign(globalOptions, options);
      syncOptions();

      if ('defaultDuration' in options) {
        // 将默认时长转换为毫秒数
        globalOptions.defaultDuration = parseDuration(globalOptions.defaultDuration, 3600000);
      }

      if (globalOptions.trackPerformance) {
        debug('WARNING: using trackPerformance flag can cause high memory usage!');
      }

      return this;
    } else {
      return globalOptions;
    }
  };

  /**
   * 重置缓存索引（清空所有索引记录）
   */
  this.resetIndex = function () {
    index = {
      all: [],      // 所有缓存键
      groups: {},   // 分组索引 { groupName: [key...] }
    };
  };

  /**
   * 创建新的 ApiCache 实例（可选配置）
   * @param {Object} [config] - 初始配置
   * @returns {ApiCache} 新实例
   */
  this.newInstance = function (config) {
    const instance = new ApiCache();

    if (config) {
      instance.options(config);
    }

    return instance;
  };

  /**
   * 克隆当前实例（复制配置）
   * @returns {ApiCache} 克隆的实例
   */
  this.clone = function () {
    return this.newInstance(this.options());
  };

  // 初始化缓存索引
  this.resetIndex();
}

// 导出单例实例（整个应用共享一个缓存管理器）
module.exports = new ApiCache();
