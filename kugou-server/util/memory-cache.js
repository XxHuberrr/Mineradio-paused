/**
 * @fileoverview 基于内存的缓存实现
 *
 * 提供简单的键值对缓存，支持：
 * - 按时间自动过期（通过 setTimeout 实现）
 * - 过期回调通知
 * - 批量清除
 *
 * 作为 apicache 的底层存储引擎使用。
 *
 * @module memory-cache
 */

/**
 * MemoryCache 构造函数
 *
 * 初始化空的缓存存储和计数器。
 * @constructor
 */
function MemoryCache() {
  this.cache = {}; // 缓存数据存储 { key: { value, expire, timeout } }
  this.size = 0;   // 当前缓存条目数
}

/**
 * 添加缓存条目
 *
 * @param {string} key - 缓存键
 * @param {*} value - 缓存值（任意类型）
 * @param {number} time - 过期时间（毫秒）
 * @param {function} [timeoutCallback] - 过期时的回调函数 (value, key) => void
 * @returns {Object} 创建的缓存条目 { value, expire, timeout }
 */
MemoryCache.prototype.add = function (key, value, time, timeoutCallback) {
  const old = this.cache[key];
  const instance = this;

  const entry = {
    value,                        // 缓存的值
    expire: time + Date.now(),    // 过期时间戳（毫秒）
    timeout: setTimeout(function () {
      // 自动过期：删除条目并触发回调
      instance.delete(key);
      return timeoutCallback && typeof timeoutCallback === 'function' && timeoutCallback(value, key);
    }, time),
  };

  this.cache[key] = entry;
  this.size = Object.keys(this.cache).length;

  return entry;
};

/**
 * 删除缓存条目
 *
 * @param {string} key - 缓存键
 * @returns {null} 始终返回 null
 */
MemoryCache.prototype.delete = function (key) {
  const entry = this.cache[key];
  if (entry) clearTimeout(entry.timeout); // 清除自动过期定时器

  delete this.cache[key];

  this.size = Object.keys(this.cache).length;

  return null;
};

/**
 * 获取缓存条目（包含元数据）
 *
 * @param {string} key - 缓存键
 * @returns {Object|undefined} 缓存条目 { value, expire, timeout }，不存在返回 undefined
 */
MemoryCache.prototype.get = function (key) {
  return this.cache[key];
};

/**
 * 获取缓存的值（仅返回 value 部分）
 *
 * @param {string} key - 缓存键
 * @returns {*} 缓存的值，不存在返回 undefined
 */
MemoryCache.prototype.getValue = function (key) {
  const entry = this.get(key);

  return entry && entry.value;
};

/**
 * 清除所有缓存条目
 *
 * 遍历所有键并逐个删除（会清除对应的定时器）。
 * @returns {true} 始终返回 true
 */
MemoryCache.prototype.clear = function () {
  Object.keys(this.cache).forEach(function (key) {
    this.delete(key);
  }, this);

  return true;
};

module.exports = MemoryCache;
