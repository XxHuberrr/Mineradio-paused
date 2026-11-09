# CLAUDE.md

> KuGouMusicApi 项目指南 — 酷狗音乐 NodeJS 版 API

## 项目概述

本项目是酷狗音乐的非官方 NodeJS API 服务，通过伪造请求头和调用官方 API 实现酷狗音乐的全部功能。支持两种运行模式：HTTP 服务模式（Express）和编程式调用模式（作为库引入）。

- **作者**: Lines（基于 MakcRe 的项目）
- **版本**: 1.5.1
- **Node 要求**: >= 12
- **License**: MIT

## 技术栈

- **运行时**: Node.js
- **HTTP 框架**: Express 4.x
- **HTTP 客户端**: Axios
- **加密库**: crypto-js（AES/MD5）、node-forge（RSA）
- **压缩库**: pako（zlib 解压，用于 KRC 歌词解码）
- **大整数库**: big-integer（用于 MID 计算）
- **开发工具**: nodemon、prettier、esbuild、pkg

## 项目结构

```
KuGouMusicApi/
├── app.js                  # CLI 入口（shebang），调用 server.startService()
├── index.js                # 开发入口，require('./app')
├── main.js                 # 编程式 API 入口（作为库使用时）
├── server.js               # Express 服务器核心（CORS、Cookie、路由注册）
├── module/                 # API 模块目录（约 160 个接口）
│   ├── search.js           # 搜索
│   ├── login.js            # 登录
│   ├── login_cellphone.js  # 手机登录
│   ├── song_url.js         # 歌曲 URL
│   ├── playlist_detail.js  # 歌单详情
│   └── ...                 # 其他接口
├── util/                   # 工具库
│   ├── index.js            # 统一导出入口
│   ├── config.json         # 平台配置（appid、clientver 等）
│   ├── crypto.js           # 加密函数（AES、RSA、MD5、SHA1）
│   ├── helper.js           # 签名函数（signature、sign、signKey）
│   ├── request.js          # HTTP 请求封装（签名、代理、响应处理）
│   ├── util.js             # 通用工具（随机数、Cookie、歌词解码、MID、WebGL 指纹）
│   ├── runtime.js          # 运行时配置（CLI 参数、代理解析）
│   ├── generate_simulate.js # 行为指纹模拟生成（AES+RSA 加密）
│   ├── apicache.js         # API 响应缓存中间件
│   └── memory-cache.js     # 内存缓存实现
├── public/                 # 前端页面
│   ├── index.html          # 接口文档首页
│   ├── login_captcha.html  # 登录页（依赖 WASM）
│   ├── login_captcha_simulate.html  # 登录页（纯 JS 模拟，不依赖 WASM）
│   ├── sid_edt_generator.html       # SID/EDT 生成工具页
│   └── verify-pkg/         # WASM 验证码包
├── docs/                   # 接口文档
├── .env.example            # 环境变量配置示例
├── Dockerfile              # Docker 部署配置
├── vercel.json             # Vercel 部署配置
└── package.json
```

## 核心架构

### 请求流程

```
客户端请求 → Express 中间件（CORS → Cookie 解析 → 平台标识注入 → 缓存）
  → 路由处理器（参数合并 → Cookie 格式化 → Authorization 头解析）
  → API 模块函数（构建请求参数 → 生成签名 → 调用 createRequest）
  → createRequest（注入设备标识 → 签名 → 代理 → 发送请求 → 响应处理）
  → 酷狗服务器
```

### 签名机制

所有 API 请求都需要签名验证，支持三种签名类型：
- **Android 签名**（默认）: `MD5(盐值 + 排序参数 + 请求体 + 盐值)`
- **Web 签名**: `MD5(盐值 + 排序参数 + 盐值)`
- **Register 签名**: `MD5("1014" + 排序值 + "1014")`

区分标准版和概念版（lite），使用不同的盐值和 appid。

### 行为指纹（SID/EDT）

酷狗服务端会检测请求的行为指纹，需要生成模拟数据：
- **SID**: RSA-OAEP 加密的 AES 密钥（Base64）
- **EDT**: AES-128-CBC 加密的行为数据（Base64）
- 行为数据包括：鼠标轨迹（贝塞尔曲线）、滚动事件、窗口事件、WebGL 指纹

### 双平台支持

通过 `.env` 中的 `platform` 环境变量切换：
- **标准版**（默认）: `appid=1005`, `clientver=20489`
- **概念版 lite**: `appid=3116`, `clientver=11440`

## 常用命令

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 生产模式
npm start

# 自定义端口
PORT=4000 npm run dev

# 使用代理
KUGOU_API_PROXY=http://127.0.0.1:7890 npm run dev

# CLI 参数方式设置代理
node app.js --proxy=http://127.0.0.1:7890 --platform=lite
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `platform` | 平台类型：`lite`（概念版）或空（标准版） | 空 |
| `PORT` | 服务端口 | 3000 |
| `HOST` | 监听地址 | 空（所有地址） |
| `KUGOU_API_PROXY` | HTTP 代理地址 | 空 |
| `KUGOU_API_GUID` | 设备 GUID（建议 UUID v4） | 自动生成 |
| `KUGOU_API_DEV` | 开发设备标识（10位大写字符串） | 自动生成 |
| `KUGOU_API_MAC` | 设备 MAC 地址 | 02:00:00:00:00:00 |
| `KUGOU_API_WEBGL` | WebGL 指纹哈希 | 自动生成随机值 |

## 开发规范

### 添加新接口

1. 在 `module/` 目录下创建新的 `.js` 文件
2. 文件名即为路由路径（`_` 替换为 `/`），如 `user_detail.js` → `/user/detail`
3. 模块导出一个函数：`(params, useAxios) => Promise`
   - `params`: 合并后的请求参数（含 cookie、query、body）
   - `useAxios`: 请求工厂函数，调用 `createRequest` 发送请求

```javascript
// module/example.js
module.exports = (params, useAxios) => {
  return new Promise((resolve, reject) => {
    useAxios({
      baseURL: 'https://gateway.kugou.com',
      url: '/v1/example',
      method: 'GET',
      params: { keyword: params.keyword },
      cookie: params.cookie,
    }).then(resolve).catch(reject);
  });
};
```

### 签名选择

- 大多数接口使用 `android` 签名（默认）
- Web 相关接口使用 `web` 签名
- 设备注册接口使用 `register` 签名

### Cookie 传递

Cookie 通过以下方式传递：
- URL 查询参数: `?cookie=token%3Dxxx%3Buserid%3Dxxx`
- 请求体: `{ cookie: "token=xxx;userid=xxx" }`
- Authorization 头: `Authorization: token=xxx;userid=xxx`

服务端会自动将 Cookie 字符串转换为 JSON 对象并合并。

## 代码风格

- 使用 Prettier 格式化（配置见 `.prettierrc.json`）
- 2 空格缩进
- 单引号
- 无分号（Prettier 默认）

## 部署

- **Docker**: 使用项目根目录的 `Dockerfile`
- **Vercel**: 使用 `vercel.json` 配置
- **pkg 打包**: `npm run pkgwin` / `npm run pkglinux` / `npm run pkgmacos`
- **esbuild 打包**: `npm run pkgjs`
