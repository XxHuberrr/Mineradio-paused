# KuGouMusic API

酷狗音乐 NodeJS 版 API

[![](https://img.shields.io/badge/Author-MakcRe-blueviolet?style=for-the-badge '作者')](https://github.com/MakcRe)
![](https://img.shields.io/badge/dynamic/json?label=GitHub%20Followers&style=for-the-badge&query=%24.data.totalSubs&url=https%3A%2F%2Fapi.spencerwoo.com%2Fsubstats%2F%3Fsource%3Dgithub%26queryKey%3DMakcRe&labelColor=282c34&color=181717&logo=github&longCache=true '关注数量')
![](https://img.shields.io/github/stars/MakcRe/KuGouMusicApi.svg?style=for-the-badge&label=Star 'Star数量')
![](https://img.shields.io/github/forks/MakcRe/KuGouMusicApi.svg?style=for-the-badge&label=Fork 'Fork数量')
![](https://img.shields.io/github/issues/MakcRe/KuGouMusicApi.svg?style=for-the-badge&label=Issues 'Issues数量')
![](https://img.shields.io/github/contributors/MakcRe/KuGouMusicApi?style=for-the-badge '贡献者')
![](https://img.shields.io/github/repo-size/MakcRe/KuGouMusicApi?style=for-the-badge&label=files&color=cf8ef4&labelColor=373e4dl '文件大小')
![](https://img.shields.io/github/languages/code-size/MakcRe/KuGouMusicApi?color=blueviolet&style=for-the-badge '代码大小')

[//]: # '<br>'

![](https://img.shields.io/github/package-json/v/MakcRe/KuGouMusicApi?longCache=true&style=for-the-badge)
![](https://img.shields.io/badge/Node-12+-green.svg?longCache=true&style=for-the-badge)
![](https://img.shields.io/badge/License-mit-blue.svg?longCache=true&style=for-the-badge)

## 环境要求

需要 NodeJS 12+ 环境

## 工作原理

跨站请求伪造 (CSRF), 伪造请求头 , 调用官方 API

## 功能特性

1. [`登录`](#登录)
2. [`刷新登录`](#刷新登录)
3. [`发送验证码`](#发送验证码)
4. [`dfid 获取`](#dfid-获取)
5. [`获取用户额外信息`](#获取用户额外信息)
6. [`获取用户 vip 信息`](#获取用户-vip-信息)
7. [`获取用户歌单`](#获取用户歌单)
8. [`获取用户云盘`](#获取用户云盘)
9. [`获取用户云盘音乐 URL`](#获取用户云盘音乐-url)
10. [`获取用户收藏的视频`](#获取用户收藏的视频)
11. [`获取用户喜欢的视频`](#获取用户喜欢的视频)
12. [`获取用户关注歌手`](#获取用户关注歌手)
13. [`获取用户听歌历史排行`](#获取用户听歌历史排行)
14. [`获取用户最近听歌历史`](#获取用户最近听歌历史)
15. [`获取继续播放信息（对应手机版首页显示继续播放入口）`](#获取继续播放信息（对应手机版首页显示继续播放入口）)
16. [`收藏歌单/新建歌单`](#收藏歌单新建歌单)
17. [`取消收藏歌单/删除歌单`](#取消收藏歌单删除歌单)
18. [`对歌单添加歌曲`](#对歌单添加歌曲)
19. [`对歌单删除歌曲`](#对歌单删除歌曲)
20. [`新碟上架`](#新碟上架)
21. [`专辑信息`](#专辑信息)
22. [`专辑详情`](#专辑详情)
23. [`专辑音乐列表`](#专辑音乐列表)
24. [`获取音乐 URL`](#获取音乐)
25. [`获取音乐 URL（新版）`](#获取音乐-url新版)
26. [`获取歌曲高潮部分`](#获取歌曲高潮部分)
27. [`搜索`](#搜索)
28. [`默认搜索关键词`](#默认搜索关键词)
29. [`综合搜索`](#综合搜索)
30. [`热搜列表`](#热搜列表)
31. [`搜索建议`](#搜索建议)
32. [`歌词搜索`](#歌词搜索)
33. [`获取歌词`](#获取歌词)
34. [`歌单分类`](#歌单分类)
35. [`歌单`](#歌单)
36. [`主题歌单`](#主题歌单)
37. [`音效歌单`](#音效歌单)
38. [`获取歌单详情`](#获取歌单详情)
39. [`获取歌单所有歌曲`](#获取歌单所有歌曲)
40. [`获取歌单所有歌曲（新版）`](#获取歌单所有歌曲新版)
41. [`相似歌单`](#相似歌单)
42. [`获取主题歌单所有歌曲`](#获取主题歌单所有歌曲)
43. [`获取主题音乐`](#获取主题音乐)
44. [`获取主题音乐详情`](#获取主题音乐详情)
45. [`歌曲推荐`](#歌曲推荐)
46. [`获取歌手和专辑图片`](#获取歌手和专辑图片)
47. [`获取歌手图片`](#获取歌手图片)
48. [`获取音乐相关信息`](#获取音乐相关信息)
49. [`获取更多音乐版本`](#获取更多音乐版本)
50. [`获取音乐伴奏信息`](#获取音乐伴奏信息)
51. [`获取音乐k歌数量`](#获取音乐-k-歌数量)
52. [`获取音乐详情`](#获取音乐详情)
53. [`获取音乐专辑/歌手信息`](#获取音乐专辑/歌手信息)
54. [`私人 FM(对应手机和 pc 端的猜你喜欢)`](#私人-fm对应手机和-pc-端的猜你喜欢)
55. [`banner`](#banner)
56. [`乐库 banner`](#乐库-banner)
57. [`乐库电台`](#乐库电台)
58. [`乐库`](#乐库)
59. [`电台 - 推荐`](#电台-推荐)
60. [`电台`](#电台)
61. [`电台 - 图片`](#电台-图片)
62. [`电台 - 音乐列表`](#电台-音乐列表)
63. [`编辑精选`](#编辑精选)
64. [`编辑精选数据`](#编辑精选数据)
65. [`编辑精选歌单`](#编辑精选歌单)
66. [`编辑精选专区`](#编辑精选专区)
67. [`编辑精选专区详情`](#编辑精选专区详情)
68. [`领取 VIP（需要登陆，该接口为测试接口，仅限概念版使用）`](#领取-vip需要登陆该接口为测试接口仅限概念版使用)
69. [`领取一天 VIP（需要登陆，该接口为测试接口，仅限概念版使用）`](#领取一天-vip需要登陆该接口为测试接口仅限概念版使用)
70. [`获取当月已领取 VIP 天数（需要登陆，该接口为测试接口，仅限概念版使用）`](#获取当月已领取-vip-天数需要登陆该接口为测试接口仅限概念版使用)
71. [`获取已领取 VIP 状态（需要登陆，该接口为测试接口，仅限概念版使用）`](#获取已领取-vip-状态需要登陆该接口为测试接口仅限概念版使用)
72. [`获取歌手列表`](#获取歌手列表)
73. [`获取歌手详情`](#获取歌手详情)
74. [`获取歌手专辑`](#获取歌手专辑)
75. [`获取歌手单曲`](#获取歌手单曲)
76. [`获取歌手 MV`](#获取歌手-MV)
77. [`关注歌手`](#关注歌手)
78. [`取消关注歌手`](#取消关注歌手)
79. [`获取关注歌手新歌`](#获取关注歌手新歌)
80. [`获取视频 url`](#获取视频-ur)
81. [`获取歌曲 MV`](#获取歌曲-MV)
82. [`获取视频相关信息`](#获取视频相关信息)
83. [`获取视频详情`](#获取视频详情)
84. [`新歌速递`](#新歌速递)
85. [`场景音乐列表`](#场景音乐列表)
86. [`场景音乐详情`](#场景音乐详情)
87. [`获取场景音乐讨论区`](#获取场景音乐讨论区)
88. [`获取场景音乐模块 Tag`](#获取场景音乐模块)
89. [`获取场景音乐歌单列表`](#获取场景音乐歌单列表)
90. [`获取场景音乐视频列表`](#获取场景音乐视频列表)
91. [`获取场景音乐音乐列表`](#获取场景音乐音乐列表)
92. [`每日推荐`](#每日推荐)
93. [`历史推荐`](#历史推荐)
94. [`风格推荐`](#风格推荐)
95. [`排行列表`](#排行列表)
96. [`排行榜推荐列表`](#排行榜推荐列表)
97. [`排行榜往期列表`](#排行榜往期列表)
98. [`排行榜信息`](#排行榜信息)
99. [`排行榜歌曲列表`](#排行榜歌曲列表)
100. [`歌曲收藏数`](#歌曲收藏数)
101. [`歌曲评论数`](#歌曲评论数)
102. [`歌曲评论`](#歌曲评论)
103. [`歌曲评论-根据分类返回`](#歌曲评论-根据分类返回)
104. [`歌曲评论-根据热词返回`](#歌曲评论-根据热词返回)
105. [`楼层评论`](#楼层评论)
106. [`歌单评论`](#歌单评论)
107. [`专辑评论`](#专辑评论)
108. [`提交听歌历史`](#提交听歌历史)
109. [`获取服务器时间`](#获取服务器时间)
110. [`刷刷`](#刷刷)
111. [`AI 推荐`](#ai-推荐)
112. [`曲谱 - 获取歌曲曲谱`](#曲谱---获取歌曲曲谱)
113. [`曲谱 - 曲谱排行榜`](#曲谱---曲谱排行榜)
114. [`曲谱 - 曲谱详情`](#曲谱---曲谱详情)
115. [`曲谱 - 曲谱广场`](#曲谱---曲谱广场)
116. [`曲谱 - 曲谱标签`](#曲谱---曲谱标签)
117. [`频道 - 获取用户所有频道`](#频道-获取用户所有频道)
118. [`频道 - 详情`](#频道---详情)
119. [`频道 - 频道安利`](#频道-频道安利)
120. [`频道 - 相似频道`](#频道-相似频道)
121. [`频道 - 订阅`](#频道-订阅)
122. [`频道 - 音乐故事`](#频道-音乐故事)
123. [`频道 - 音乐故事详情`](#频道-音乐故事详情)
124. [`动态 - 最常访问`](#动态-最常访问)
125. [`获取用户公开的音乐`](#获取用户公开的音乐)
126. [`听书 - 每日推荐`](#听书-每日推荐)
127. [`听书 - 排行榜推荐`](#听书-排行榜推荐)
128. [`听书 - VIP 推荐`](#听书-vip-推荐)
129. [`听书 - 每周推荐`](#听书-每周推荐)
130. [`听书 - 专辑详情`](#听书-专辑详情)
131. [`听书 - 专辑音乐列表`](#听书-专辑音乐列表)
132. [`歌曲详情 - 歌曲成绩单`](#歌曲详情-歌曲成绩单)
133. [`歌曲详情 - 歌曲成绩单详情`](#歌曲详情---歌曲成绩单详情)
134. [`听歌识曲`](#听歌识曲)

### 安装

```shell
$ git clone git@github.com:MakcRe/KuGouMusicApi.git
$ cd KuGouMusicApi
$ npm install
```

### 使用接口为概念版

```
$ 复制 .env.example 为 .env，并且把里面的 `platform=''` 改为 `platform=lite`
$ 注意不同版本的平台的 token 是不通用的。
```

### 运行

```shell
$ npm run dev
```

服务器启动默认端口为 3000, 若不想使用 3000 端口 , 可使用以下命令 : Mac/Linux

```shell
$ PORT=4000 npm run dev
```

windows 下使用 git-bash 或者 cmder 等终端执行以下命令 :

```shell
$ set PORT=4000 && npm run dev
```

windows 下使用 PowerShell 终端执行一下命令 :

```shell
$ $Env:PORT=4000; npm run dev
```

服务器启动默认 host 为 localhost,如果需要更改, 可使用以下命令 : Mac/Linux

```shell
$ HOST=127.0.0.1 npm run dev
```

windows 下使用 git-bash 或者 cmder 等终端执行以下命令 :

```shell
$ set HOST=127.0.0.1 && npm run dev
```

## 免责声明

!> 1. 本项目仅供学习使用，请尊重版权，请勿利用此项目从事商业行为及非法用途!

!> 2. 使用本项目的过程中可能会产生版权数据。对于这些版权数据，本项目不拥有它们的所有权。为了避免侵权，使用者务必在 24 小时内清除使用本项目的过程中所产
生的版权数据。

!> 3. 由于使用本项目产生的包括由于本协议或由于使用或无法使用本项目而引起的任何性质的任何直接、间接、特殊、偶然或结果性损害（包括但不限于因商誉损失、停
工、计算机故障或故障引起的损害赔偿，或任何及所有其他商业损害或损失）由使用者负责。

!> 4. **禁止在违反当地法律法规的情况下使用本项目。** 对于使用者在明知或不知当地法律法规不允许的情况下使用本项目所造成的任何违法违规行为由使用者承担，
本项目不承担由此造成的任何直接、间接、特殊、偶然或结果性责任。

!> 5. 音乐平台不易，请尊重版权，支持正版。

!> 6. 本项目仅用于对技术可行性的探索及研究，不接受任何商业（包括但不限于广告等）合作及捐赠。

!> 7. 如果官方音乐平台觉得本项目不妥，可联系本项目更改或移除。

## Vercel 部署

### 操作方法

1. fork 此项目
2. 在 Vercel 官网点击 `New Project`
3. 点击 `Import Git Repository` 并选择你 fork 的此项目并点击 `import`
4. 点击 `PERSONAL ACCOUNT` 的 `select`
5. 直接点 `Continue`
6. 若需要部署版本为概念版（不需要该步骤可以跳过），在 `Environment Variables` 添加 `key` 为 `platform`，`Value (Will Be Encrypted)` 为 `lite` 然后点击
   `Add`
7. `PROJECT NAME`自己填,`FRAMEWORK PRESET` 选 `Other` 然后直接点 `Deploy` 接着等部署完成即可

## 接口文档

### 调用前须知

!> 本项目不提供线上 demo，请不要轻易信任使用他人提供的公开服务，以免发生安全问题,泄露自己的账号和密码

!> 为使用方便,降低门槛, 文档示例接口直接使用了 GET 请求,本项目同时支持 GET/POST 请按实际需求使用 (POST 请求 url 必须添加时间戳,使每次请求 url 不一样,
不然请求会被缓存)

!> 由于接口做了缓存处理 ( 缓存 2 分钟,), 相同的 url 会在两分钟内只向酷狗服务器发一次请求 , 如果遇到不需要缓 存结果的接口 , 可在请求 url 后面加一个时间
戳参数使 url 不同 , 例子 : /personal/fm?timestamp=1691256061923 (请按自己需求改造缓存中间件(app.js)，源码不复杂) 该缓存机制来源
于[Binaryify/NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi)

!> 不要频繁调登录接口,不然可能会被风控,登录状态还存在就不要重复调登录接口

!> 如果是跨域请求 , 请在所有请求带上 xhrFields: { withCredentials: true } (axios 为 withCredentials: true, Fetch API 为 fetch(url, { credentials:
'include' })), 或直接手动传入 cookie。

!> 本项目仅供学习使用,请尊重版权，请勿利用此项目从事商业行为或进行破坏版权行为

!> 文档可能会有缓存 , 如果文档版本和 github 上的版本不一致,请清除缓存再查看

#### 更新记录

26-05-20：更新曲谱相关接口

25-08-17: 手机登录添加支持多用户登录

25-04-05: 添加 `用户云盘`，`用户云盘 url`, `获取用户收藏视频`，`获取用户喜欢视频` 等接口

25-03-28：添加 `领取一天 VIP`, `获取当月已领取 VIP 天数`, `领取一天 VIP`,`获取已领取 VIP 状态`,`获取音乐 URL（新版）` 等接口

25-03-07：更新单曲搜索接口，更新歌词搜索接口。

25-01-16：添加 `获取继续播放信息` 接口，修复部分老歌在概念版无法获取问题

25-01-11：添加 `关注歌手` `取消关注歌手` `获取关注歌手新歌` 接口

24-08-09：添加 获取更多音乐版本 接口。

24-07-22：添加 `歌曲详情` 接口.

24-07-17: 添加 搜索建议 接口。

24-07-14: 添加 频道、听书等多个接口。

24-07-14: 添加 刷刷、AI 推荐 接口，更新 提交听歌历史 接口。

24-06-30: 添加 获取歌手列表 接口

24-06-25: 添加 默认搜索关键词、获取歌曲 MV、提交听歌历史等接口

24-05-30: 添加曲谱接口

24-05-19: 修复设备平台判断问题，添加 获取用户关注歌手 接口

24-05-14: 添加 楼层评论、歌单评论、专辑评论、热搜列表接口。修复 歌单 接口

24-05-14: 添加 歌曲评论、歌曲评论-根据分类返回、歌曲评论-根据热词返回 接口

24-05-12: 添加支持酷狗概念版登录

24-05-07: 修复热门歌单接口

24-01-17: 添加：排行榜列表接口、排行榜推荐列表接口、排行榜往期列表接口、排行榜信息接口、排行榜歌曲列表接口

24-01-12: 更新私人 FM 接口

24-01-07: 添加 每日推荐、历史推荐、 风格推荐 API 接口

23-12-19: 添加场景音乐相关接口

23-12-18: 添加 收藏歌单，取消收藏歌单，对歌单添加歌曲，对歌单删除歌曲 接口

23-11-10: 添加歌手相关 API、添加视频相关 API

23-10-01: 添加领取 vip 接口

23-08-27: 更新音乐 url 获取

23-08-11: 添加电台 api

23-08-06: 添加缓存机制

23-07-19: 更新酷狗二维码登录

23-06-29: 添加 新歌速递、乐库等多个接口

23-06-28: 添加获取歌手图片接口

23-06-25: 添加 每日主题音乐 获取每日主题音乐详情 歌单 等接口

23-06-23: 修复搜索接口

23-06-23: 添加 搜索、获取歌词等接口

23-06-23: 添加 获取音乐 URL 接口

23-06-23: 更新文档

23-06-23: 添加每日歌曲推荐、专辑详情、专辑音乐列表、新碟上架

23-06-22: 添加支持微信登录、开放接口登录

23-06-22: 添加支持 vercel

23-06-22: 密码登录、验证码登录、扫码登录

### 登录

说明：登录有五个接口使用 `encodeURIComponent`对密码编码或者使用 `POST`请求，避免某些特殊字符无法解析,如#(#在 url 中会被识别为 hash,而不是 query)

不要频繁调登录接口,不然可能会被风控,登录状态还存在就不要重复调登录接口, **不同版本的 token 是不通用的**

#### 1.手机登录

**必选参数：**

`mobile`: 手机号码

`code`: 验证码，使用 [`/captcha/sent`](#发送验证码)接口传入手机号获取验证码,调用此接口传入验证码,可使用验证码登录

**可选参数**

`userid`: 用户 id,当用户存在多个账户是时，必须加上需要登录的用户 id

**接口地址：** `/login/cellphone`

**调用例子：** `/login/cellphone?mobile=xxx&code=xxx`

#### 2. 用户名登录(该登录可能需要验证，不推荐使用)

**必选参数：**

`username`: 用户名

`password`: 密码

**接口地址：** `/login`

**调用例子：** `/login?username=xxx&password=yyy`

#### 3. 开放接口登录(目前仅支持微信登录)

说明: 该接口为第三方平台登录，目前仅支持微信登录

**必选参数：**

`code`: 由微信扫码成功后生成

**接口地址：** `/login/openplat`

**调用例子：** `/login/openplat?code=xxx`

#### 4. 二维码登录

说明: 二维码登录涉及到 3 个接口,调用务必带上时间戳,防止缓存

##### 1.二维码 key 生成接口

说明: 调用此接口可生成一个 key

**接口地址：** `/login/qr/key`

##### 2.二维码生成接口

说明: 调用此接口传入上一个接口生成的 key 可生成二维码图片的 base64 和二维码信息,可使用 base64 展示图片,或者使用二维码信息内容自行使用第三方二维码生成
库渲染二维码

**必选参数：**

`key`: ,由第一个接口生成

**可选参数：**

`qrimg`: 传入后会额外返回二维码图片 base64 编码

**接口地址：** `/login/qr/create`

**调用例子：** `/login/qr/create?key=xxx`

##### 2.二维码检测扫码状态接口

说明: 轮询此接口可获取二维码扫码状态,0 为二维码过期，1 为等待扫码，2 为待确认，4 为授权登录成功（4 状态码下会返回 token）

**必选参数：**

`key`: ,由第一个接口生成

**接口地址：** `/login/qr/check`

**调用例子：** `/login/qr/check?key=xxx`

#### 5. 微信登录

说明：微信登录涉及到 2 个接口,调用务必带上时间戳,防止缓存

##### 1. 二维码生成接口

说明：调用此接口可生成微信的 uuid, 包括二维码 Bae64 和 二维码扫描链接, 注: 该接口请求的接口过多, 会出现返回较慢的情况

**接口地址：** `/login/wx/create`

**调用例子：** `/login/wx/create`

##### 2.二维码检测扫码状态接口

说明：轮询此接口可获取二维码扫码状态, 408 为等待扫描，404 为已经扫描，403 为拒绝登录，405 为登录成功，402 为已过期(405 状态下登陆完成口会返回 wx_code,
用于开放登陆 [`/login/openplat`](#_3-开放接口登录目前仅支持微信登录)), 注：该接口有一定延时，不可访问是可以直接到
https://long.open.weixin.qq.com/connect/l/qrconnect?f=json&uuid=xxx 该接口直接请求

**必选参数：**

`uuid`: 由第一个接口生成

**可选参数：**

`timestamp`: 建议传递，否则由于缓存会导致延迟

**接口地址：** `/login/wx/check`

**调用例子：** `/login/wx/check?timestamp=1691256061923&uuid=xxxxxxxxx`

### 刷新登录

说明 : 调用此接口，可刷新登录状态，可以延长 `token` 过期时间

**可选参数：**

`token`: 登录后获取的 token

`userid`: 用户 id

**接口地址：** `/login/token`

**调用例子：** `/login/token` `/login/token?token=xxx&userid=xxx`

### 发送验证码

说明: 调用此接口 ,传入手机号码, 可发送验证码

**必选参数：**

`mobile`: 手机号码

**接口地址：** `/captcha/sent`

**调用例子：** `/captcha/sent?mobile=xxx`

### dfid 获取

**接口地址：** `/register/dev`

**调用例子：** `/register/dev`

### 获取用户额外信息

说明：登陆后调用此接口，可以获取用户额外信息

**接口地址：** `/user/detail`

### 获取用户 vip 信息

说明：登陆后调用此接口，可以获取用户 vip 信息

**接口地址：** `/user/vip/detail`

### 获取用户歌单

说明：登录后调用此接口，可以获取用户的所有创建以及收藏的歌单

**可选参数：**

`page`：页数

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/user/playlist`

**调用例子：** `/user/playlist`

### 获取用户关注歌手

说明：登录后调用此接口，可以获取用户的所有关注的歌手/用户

**接口地址：** `/user/follow`

**调用例子：** `/user/follow`

### 获取关注歌手消息

说明：登录后调用此接口，可以关注的歌手/用户消息

`id`: 需要获取歌手/用户消息的 userid

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/user/follow/message`

**调用例子：** `/user/follow/message`

### 获取用户云盘

说明：登录后调用此接口可以获取用户上传到云盘的音乐（需要登录）

**可选参数**

`page `: 页数

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/user/cloud`

**调用例子：** `/user/cloud`

### 获取用户云盘音乐 URL

说明：登录后调用此接口可以获取用户上传到云盘的音乐 URL，部分可以直接用 `/song/url` 直接获取 URL（需要登录，目前获取到的文件大小都约为 10M 左右）

**必选参数：**

`hash`: 音乐 hash

**可选参数：**

`album_id`: 专辑 id

`name`: 云盘音乐名称

`album_audio_id`：专辑音频 id

**接口地址：** `/user/cloud/url`

**调用例子：** `/user/cloud/url`

### 获取用户收藏的视频

说明：登录后调用此接口可以获取用户收藏的视频（需要登录）

**可选参数**

`page `: 页数

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/user/video/collect`

**调用例子：** `/user/video/collect`

### 获取用户喜欢的视频

说明：登录后调用此接口可以获取用户喜欢的视频（需要登录）

**可选参数**

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/user/video/love`

**调用例子：** `/user/video/love`

### 获取用户听歌历史排行

说明：登录后调用此接口，可以获取用户听歌历史排行

**可选参数：**

`type`：0 为获取最近一周前 120 首歌曲，1：获取全部累计前 120 首歌曲

**接口地址：** `/user/listen`

**调用例子：** `/user/listen`

### 获取用户最近听歌历史

说明：登录后调用此接口，可以近期的听歌历史记录(需要登陆)

**可选参数：**

`bp`: 可以更加上一次返回值传入

**接口地址：** `/user/history`

**调用例子：** `/user/history`

### 获取继续播放信息（对应手机版首页显示继续播放入口）

说明：登录后调用此接口，可以最后设备播放信息(需要登陆)

**可选参数：**

`pagesize`: 每页页数, 默认为 30

**接口地址：** `/lastest/songs/listen`

**调用例子：** `/lastest/songs/listen`

### 收藏歌单/新建歌单

说明 : 调用此接口, 可收藏歌单/新建歌单( 需要登录 ), 收藏成功后建议使用 [`/playlist/tracks/add`](#对歌单添加歌曲) 把原歌单下的歌曲添加到新的歌单

**必选参数：**

name: 歌单名称

list_create_userid: 歌单 list_create_userid

list_create_listid: 歌单 list_create_listid

**可选参数**

`is_pri`: 是否设为隐私，0：公开，1：隐私，仅支持创建歌单时传入

`type`: 1：为收藏歌单，0：创建歌单, 默认为 0

`list_create_gid`：歌单 list_create_gid

**接口地址：** `/playlist/add`

**调用例子：** `/playlist/add?source=1&name=音乐一响%20纯爱登场.&list_create_userid=1782943844&list_create_listid=87`

### 取消收藏歌单/删除歌单

说明 : 调用此接口 , 取消收藏歌单( 需要登录 )

**必选参数：**

listid: 用户歌单 listid

**接口地址：** `/playlist/del`

**接口地址：** `/playlist/del?listid=xxx`

### 对歌单添加歌曲

说明 : 调用此接口 , 可以添加歌曲到歌单 ( 需要登录 )

**必选参数：**

listid: 用户歌单 listid

data: 歌曲数据, 格式为 歌曲名称|歌曲 hash|专辑 id|(mixsongid/album_audio_id)，最少需要 歌曲名称以及歌曲 hash(若返回错误则需要全部参数)， 支持多个，每
个以逗号分隔

**接口地址：** `/playlist/tracks/add`

**调用例子：** `/playlist/tracks/add?listid=1&data=我们应该算爱过吧|8E10D8825DDE03BCABBDE13E5A4150D2`
`/playlist/tracks/add?listid=1&data=我们应该算爱过吧|8E10D8825DDE03BCABBDE13E5A4150D2|67026620|477417208`
`/playlist/tracks/add?listid=1&data=我们应该算爱过吧|8E10D8825DDE03BCABBDE13E5A4150D2,我们应该算爱过吧|5015FC3FAB5B0C245556A1CC3C4DE355`

### 对歌单删除歌曲

说明 : 调用此接口 , 可以删除歌单某首歌曲 ( 需要登录 )

**必选参数：**

listid: 用户歌单 listid

fileids: 歌单中歌曲的 fileid，可多个,用逗号隔开

**接口地址：** `/playlist/tracks/del`

**调用例子：** `/playlist/tracks/del?listid=1&fileids=xx` `/playlist/tracks/del?listid=1&fileids=xx,xx`

### 新碟上架

说明: 调用此接口 , 可获取新碟上架列表, 如需要专辑详细信息需要调用[`album/detail`](#专辑详情), 如需要获取专辑音乐列表需调
用[`album/songs`](#专辑音乐列表)

**可选参数：**

`type `: 1：华语；2：欧美；3：日本；4：韩国；推荐为空，默认为空

`page `: 页数

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/top/album`

**调用例子：** `/top/album`

### 专辑信息

说明: 调用此接口 ,传入专辑 id 可获取专辑相关信息

**必选参数：**

`album_id`: 专辑 id,可以传多个，以逗号分割

**可选参数：**

`fields`: 需要返回的信息，可以传多个，以逗号分割，支持的值有 `trans_param` `special_tag` `authors` `album_name` `publish_date` `cover` `intro`
`publish_company` `type` `album_id` `language_id` `is_publish` `heat` `grade` `quality` `exclusive` `grade_count` `author_name` `sizable_cover`
`language` `category`

**接口地址：** `/album`

**调用例子：** `/album?album_id=xxx`, `/album?album_id=xxx,xxx`, `/album?album_id=xxx&fields=language,authors`

### 专辑详情

说明: 调用此接口 ,传入专辑 id 可获取专辑详情

**必选参数：**

`id`: 专辑 id

**接口地址：** `/album/detail`

**调用例子：** `/album/detail?id=10729818`

### 专辑音乐列表

说明: 调用此接口 ,传入专辑 id 可获取专辑音乐列表

**必选参数：**

`id`: 专辑 id

**可选参数：**

`page `: 页数

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/album/songs`

**调用例子：** `/album/songs?id=10729818`

### 获取音乐 URL

说明: 调用此接口, 传入的音乐 hash, 可以获取对应的音乐的 url, 未登录状态或者非会员可能会返回为空。

⚠️ 注意：因接口问题，目前获取 url 接口数据需要先调用 `/register/dev` 接口获取 dfid，否则会提示 `本次请求需要验证`

**必选参数：**

`hash`: 音乐 hash

**可选参数：**

`album_id`: 专辑 id

`free_part`: 是否返回试听部分（仅部分歌曲）

`album_audio_id`：专辑音频 id

`quality`：获取不同音质的 url

**quality 支持的参数**

`piano`：对应手机端魔法音乐 钢琴，仅部分音乐支持

`acappella`：对应手机端魔法音乐 人声 伴奏，仅部分音乐支持，该模式下返回的音频后缀为 mkv 格式，该文加存在 人声 和 伴奏 两个音轨

`subwoofer`：对应手机端魔法音乐 骨笛，仅部分音乐支持

`ancient`：对应手机端魔法音乐 尤克里里，仅部分音乐支持

`surnay`：对应手机端魔法音乐 唢呐，仅部分音乐支持

`dj`：对应手机端魔法音乐 DJ，仅部分音乐支持

`128`：返回 128 码率 mp3 格式

`320`：返回 320 码率 mp3 格式

`flac`：返回 flac 格式音频

`high`：返回无损格式音频

`viper_atmos`：蝰蛇全景声，仅部分音乐支持

`viper_clear`：蝰蛇超清音质

`viper_tape`：蝰蛇母带，仅部分音乐支持, 该音质需要转码，关于转码相关的技术还不会

`super`：返回 DSD 格式音频，支持的音频少的可伶

**接口地址：** `/song/url`

**调用例子：** `/song/url?hash=xxx`

### 获取音乐 URL（新版）

说明: 调用此接口, 传入的音乐 hash, 可以获取对应的音乐的 url, 未登录状态或者非会员可能会返回为空，该接口会一次性返回支持的音质的音频 url, **但该接口存
在音频加密（目前无法解码），请谨慎使用**

⚠️ 注意：因接口问题，目前获取 url 接口数据需要先调用 `/register/dev` 接口获取 dfid，否则会提示 `本次请求需要验证`

**必选参数：**

`hash`: 音乐 hash

**可选参数：**

`album_audio_id`：专辑音频 id

`free_part`: 是否返回试听部分（仅部分歌曲）

`album_audio_id`：专辑音频 id

**接口地址：** `/song/url/new`

**调用例子：** `/song/url/new?hash=xxx`

### 获取歌曲高潮部分

说明: 调用此接口, 传入的音乐 hash, 可以获取对应的音乐的高潮时间

**必选参数：**

`hash`: 音乐 hash, 可以传多个，以逗号分割

**接口地址：** `/song/climax`

**调用例子：** `/song/climax?hash=xxx`

### 搜索

说明: 调用此接口 , 传入搜索关键词可以搜索该音乐 / mv / 歌单 / 歌词 / 专辑 / 歌手

**必选参数：**

`keywords`: 关键词

**可选参数：**

`page `: 页数

`pagesize `: 每页页数, 默认为 30

`type`: 搜索类型；默认为单曲，special：歌单，lyric：歌词，song：单曲，album：专辑，author：歌手，mv：mv

⚠️ 注意：因接口问题，获取搜索结果需要在 url 后添加`cookie`认证信息或者`Set-cookie`，否则会返回 `error_code: 152`

⚠️ 注意：建议请求在所有搜索接口时添加认证信息防止调用失败！

**接口地址：** `/search`

**调用例子：** `/search?keywords=海阔天空`（错误示例），`/search?keywords=周杰伦&cookie=token=xxxx;userid=xxxx;dfid=xxxx`（必须携带认证信息）

### 默认搜索关键词

说明 : 调用此接口 , 可获取默认搜索关键词

**接口地址：** `/search/default`

### 综合搜索

说明: 调用此接口, 传入搜索关键词可以获得综合搜索，搜索结果同时包含单曲 , 歌手 , 歌单等信息

**必选参数：**

`keywords`: 关键词

**可选参数：**

`page `: 页数

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/search/complex`

**调用例子：** `/search/complex?keywords=海阔天空`

### 热搜列表

说明 : 调用此接口,可获取热门搜索列表

**接口地址：** `/search/hot`

**调用例子：** `/search/hot`

### 搜索建议

说明 : 调用此接口 , 传入搜索关键词可获得搜索建议 , 搜索结果同时包含单曲 , 歌手 , 歌单信息

**可选参数：**

`albumTipCount `: 专辑返回数量

`correctTipCount `: 目前未知，可能是歌单

`mvTipCount `: MV 返回数量

`musicTipCount `: 音乐返回数量

**接口地址：** `/search/suggest`

**调用例子：** `/search/suggest?keywords=海阔天空`

### 歌词搜索

说明: 调用此接口, 可以搜索歌词，该接口需配合 [`/lyric`](#获取歌词) 使用。

**必选参数：**

`keywords`: 关键词，与 hash 二选一

`hash`: 歌曲 hash，与 keyword 二选一

**可选参数：**

`album_audio_id`: 专辑音乐 id,

`duration`：歌曲时间

`man`: 是否返回多个歌词，`yes`：返回多个， `no`：返回一个。 默认为`no`

**接口地址：** `/search/lyric`

**调用例子：** `/search/lyric?keywords=xxx` `/search/lyric?keywords=xxx&hash=xxx`

### 获取歌词

说明 : 调用此接口，可以获取歌词，调用该接口前则需要调用[`/search/lyric`](#歌词搜索) 获取完整参数

**必选参数：**

`id`: 歌词 id, 可以从 [`/search/lyric`](#歌词搜搜) 接口中获取

`accesskey`: 歌词 accesskey, 可以从 [`/search/lyric`](#歌词搜搜) 接口中获取

**可选参数：**

`fmt`: 歌词类型，lrc 为普通歌词，krc 为逐字歌词

`decode`: 是否解码，传入该参数这返回解码后的歌词

**接口地址：** `/lyric`

**调用例子：** `/lyric?id=xxx&accesskey=xxx` `/lyric?id=xxx&accesskey=xxx&fmt=lrc` `/lyric?id=xxx&accesskey=xxx&decode=true`

### 歌单分类

说明 : 调用此接口,可获取歌单分类,包含 category 信息

**接口地址：** `/playlist/tags`

**调用例子：** `/playlist/tags`

### 歌单

说明 : 调用此接口 , 可获取歌单

**必选参数：**

`category_id`: tag，0：推荐，11292：HI-RES，其他可以从 [`/playlist/tags`](#歌单分类) 接口中获取（接口下的 `tag_id` 为 `category_id`的值）

**可选参数：**

`withsong`: 是否返回歌曲列表（不全），0：不返回，1：返回

`withtag`: 是否返回歌单分类，0：不返回，1：返回

**接口地址：** `/top/playlist`

**调用例子：** `/top/playlist?category_id=0`

### 主题歌单

说明 : 调用此接口 , 可获取主题歌单, 通过 [`/theme/playlist/track`](#获取主题歌单所有歌曲) 可以获取主题个单下的歌曲

**接口地址：** `/theme/playlist`

**调用例子：** `/theme/playlist`

### 音效歌单

说明 : 调用此接口 , 可获取音效歌单

**可选参数：**

`page `: 页数

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/playlist/effect`

**调用例子：** `/playlist/effect`

### 获取歌单详情

说明: 调用此接口 , 可获取歌单详细信息

**必选参数：**

`ids`: 歌单中的 `global_collection_id`，可以传多个，用逗号分隔

**接口地址：** `/playlist/detail`

**调用例子：** `/playlist/detail?ids=collection_3_1863870844_4_0` `/playlist/detail?ids=collection_3_1863870844_4_0,collection_3_2093906551_8_0`

### 获取歌单所有歌曲

说明 : 调用此接口，传入对应的歌单 global_collection_id，即可获得对应的所有歌曲

**必选参数：**

`id`: 歌单中的 `global_collection_id`

**可选参数：**

`page `: 页数

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/playlist/track/all`

**调用例子：** `/playlist/track/all?id=collection_3_1863870844_4_0`

### 获取歌单所有歌曲(新版)

说明 : 调用此接口，传入对应的歌单 listid，即可获得对应的所有歌曲, 目前该接口仅支持 用户所创建及收藏的歌单

**必选参数：**

`lisdid`: 歌单中的 `listid`

**可选参数：**

`page `: 页数

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/playlist/track/all/new`

**调用例子：** `/playlist/track/all/new?listid=xxx`

### 相似歌单

说明 : 调用此接口，根据歌单 id 获取相似歌单

**必选参数：**

`ids`：歌单 global_collection_id，支持多个，每个以逗号分隔

**接口地址：** `/playlist/similar`

**调用例子：** `/playlist/similar?ids=collection_1_1341266283_964007_0`
`/playlist/similar?ids=collection_1_1341266283_964007_0,collection_3_1041185112_11_0`

### 获取主题歌单所有歌曲

**必选参数：**

`theme_id`: 主题歌单 id

**接口地址：** `/theme/playlist/track`

**调用例子：** `/theme/playlist/track?theme_id=18`

### 获取主题音乐

说明 : 调用此接口，可以获取主题音乐，调用 [`/theme/music/detail`](#) 可以获取主题音乐详情

**接口地址：** `/theme/music`

**调用例子：** `/theme/music`

### 获取主题音乐详情

说明 : 调用此接口，传入对应的主题 id 可以获取主题音乐详情.

**必选参数：**

`id`: 主题音乐 id

**接口地址：** `/theme/music/detail`

**调用例子：** `/theme/music/detail?id=1002`

### 歌曲推荐

说明 : 调用此接口，可以获取歌曲推荐.

**必选参数：**

`card_id`: 1：对应安卓 精选好歌随心听 || 私人专属好歌，2：对应安卓 经典怀旧金曲，3：对应安卓 热门好歌精选，4：对应安卓 小众宝藏佳作，5：未知，6：对应
vip 专属推荐

**接口地址：** `/top/card`

**调用例子：** `/top/card?card_id=1`

### 歌曲推荐（概念版）

说明 : 调用此接口，可以获取歌曲推荐

**必选参数：**

`card_id`: 3006: VIP 专属推荐，3001: 私人专属好歌，3004: 小众宝藏佳作，3014: 喜欢这首歌的 TA 也喜欢，3101: 概念 er 新推，3005: 潮流尝鲜

**可选参数**

`pagesize`: 每页页数, 默认为 30

**接口地址：** `/top/card`

**调用例子：** `/top/card/youth?card_id=3006`

### 获取歌手和专辑图片

说明 : 调用此接口，可以获取歌手和专辑图片.

**必选参数：**

`hash`: 歌曲 hash, 可以传多个，每个以逗号分开

**可选参数：**

`album_id`: 专辑 id, 可以传多个，每个以逗号分开

`album_audio_id`: 专辑音乐 id, 可以传多个，每个以逗号分开

`count`: 最多返回多少张图片，默认为 5

**接口地址：** `/images`

**调用例子：** `/images?hash=B04ED0F01ABBB62B9D22EC4616ED8AFE`
`/image?hash=B04ED0F01ABBB62B9D22EC4616ED8AFE,55603312694BF99AD6000C2D0D72D368&album_id=,75013431`

### 获取歌手图片

说明 : 调用此接口，可以获取歌手图片.

**必选参数：**

`hash`: 歌曲 hash, 可以传多个，每个以逗号分开

**可选参数：**

`audio_id`: 音乐 id, 可以传多个，每个以逗号分开

`album_audio_id`: 专辑音乐 id, 可以传多个，每个以逗号分开

`filename`: 音乐文件名称, 可以传多个，每个以逗号分开

`count`: 最多返回多少张图片，默认为 5

**接口地址：** `/images/audio`

**调用例子：** `/images/audio?hash=B04ED0F01ABBB62B9D22EC4616ED8AFE`
`/image/audio?hash=B04ED0F01ABBB62B9D22EC4616ED8AFE,55603312694BF99AD6000C2D0D72D368`

### 获取音乐相关信息

说明：调用此接口，可以获取音乐相关信息

**必选参数：**

`hash`: 歌曲 hash, 可以传多个，每个以逗号分开

**接口地址：** `/audio`

**调用例子：** `/audio?hash=B04ED0F01ABBB62B9D22EC4616ED8AFE` `/audio?hash=B04ED0F01ABBB62B9D22EC4616ED8AFE,55603312694BF99AD6000C2D0D72D368`

### 获取更多音乐版本

说明：调用此接口，可以获取更多版本音乐

**必选参数：**

`album_audio_id`：音乐的 mixsongid/album_audio_id

**可选参数：**

`page`： 页码

`pagesize`: 每页页数, 默认为 30

`show_type`：是否返回分类

`sort`：排序，支持 `all`，`hot`，`new`

`type`: 分类

`show_detail`：是否返回详情，否则只返回总数，0：只返回总数，不传或者其他都返回详情

**接口地址：** `/audio/related`

**调用例子：** `/audio/related?album_audio_id=573120919` `/audio/related?album_audio_id=573120919&show_detail=0`

### 获取音乐伴奏信息

说明：调用此接口，可以获取最佳伴奏信息

**必选参数：**

`hash`：音乐 hash

`fileName`: 音乐 fileName

`mixid`: 音乐的 mixsongid/album_audio_id

**接口地址：** `/audio/accompany/matching`

**调用例子：** `/audio/accompany/matching?fileName=希林娜依高 - Shine Brighter (愈加璀璨)&mixId=637735200&hash=6D431B0507587447B3D7345434DC5825`

### 获取音乐 K 歌数量

说明：调用此接口，可以获取音乐 K 歌数量，**参数信息均来自[获取音乐伴奏信息](#获取音乐伴奏信息)**

**必选参数：**

`songId`：音乐 songid, 该字段需要请求 [获取音乐伴奏信息](#获取音乐伴奏信息) 获取

`singerName`：歌手名称，多个以 `、` 隔开，也可以到 [获取音乐伴奏信息](#获取音乐伴奏信息) 中获取

`songHash`：音乐 hash, 该字段需要请求 [获取音乐伴奏信息](#获取音乐伴奏信息) 获取

**接口地址：** `/audio/ktv/total`

**调用例子：** `/audio/ktv/total?songId=43522508&singerName=希林娜依高&songHash=99AE5A7B04FF76550E380C3757D3E273`

### 获取音乐详情

说明：调用此接口，可以获取音乐详情

**必选参数：**

`hash`: 歌曲 hash, 可以传多个，每个以逗号分开

**接口地址：** `/privilege/lite`

**调用例子：** `/privilege/lite?hash=B04ED0F01ABBB62B9D22EC4616ED8AFE`
`/privilege/lite?hash=B04ED0F01ABBB62B9D22EC4616ED8AFE,55603312694BF99AD6000C2D0D72D368`

### 获取音乐专辑/歌手信息

说明：调用此接口，可以获取音乐专辑/歌手信息

**必选参数：**

`album_audio_id`: 专辑音乐 id (album_audio_id/MixSongID 均可以), 可以传多个，每个以逗号分开

**可选参数**

`fields`: 可以传 `album_info` `authors.base` `base` `audio_info`, `authors.ip`, `extra`, `tags`, `tagmap` 每个 field 以逗号分开

**接口地址：** `/krm/audio`

**调用例子：** `/krm/audio?album_audio_id=32155307` `/krm/audio?album_audio_id=32155307&fields=album_info,base,authors.base`

### 私人 FM(对应手机和 pc 端的猜你喜欢)

说明 : 私人 FM

**可选参数：**

`hash`: 音乐 hash, 建议

`songid`: 音乐 songid, 建议

`playtime`: 已播放时间, 建议

`mode`: 获取模式，默认为 normal, normal：发现，small： 小众，peak：30s

`action`: 默认为 play, garbage: 为不喜欢

`song_pool_id`： 手机版的 AI，0：Alpha 根据口味推荐相似歌曲, 1：Beta 根据风格推荐相似歌曲, 2：Gamma

`is_overplay`: 是否已播放完成

`remain_songcnt`: 剩余未播放歌曲数, 默认为 0，大于 4 不返回推荐歌曲，建议

**接口地址：** `/personal/fm`

**调用例子：** `/personal/fm`

### banner

说明 : 调用此接口 , 可获取 banner( 轮播图 ) 数据

**接口地址：** `/pc/diantai`

**调用例子：** `/pc/diantai`

### 乐库 banner

说明 : 调用此接口 , 可获取 乐库 banner( 轮播图 ) 数据

**接口地址：** `/yueku/banner`

**调用例子：** `/yueku/banner`

### 乐库电台

说明 : 调用此接口 , 可获取乐库电台数据

**接口地址：** `/yueku/fm`

**调用例子：** `/yueku/fm`

### 乐库

说明 : 调用此接口 , 可获取手机端乐库数据

**接口地址：** `/yueku`

**调用例子：** `/yueku`

### 电台

说明 : 调用此接口 , 可获取所有电台数据

**接口地址：** `/fm/class`

**调用例子：** `/fm/class`

### 电台 - 推荐

说明 : 调用此接口 , 可获取推荐电台

**接口地址：** `/fm/recommend`

**调用例子：** `/fm/recommend`

### 电台 - 图片

说明 : 调用此接口 , 可获取对应电台的图片

**必选参数：**

`fmid`: fmid，可以传多个，以逗号分割

**接口地址：** `/fm/image`

**调用例子：** `/fm/image?fmid=693` `/fm/image?fmid=693,37`

### 电台 - 音乐列表

说明 : 调用此接口 , 可获取对应电台的音乐列表

**必选参数：**

`fmid`: fmid，可以传多个，以逗号分割

**可选参数：**

`fmtype`: fmtype, 可以传多个，以逗号分割

`fmoffset`: 歌曲偏移，可以传多个，以逗号分割

`fmsize`: 歌曲列表大小，可以传多个，以逗号分割

**接口地址：** `/fm/songs`

**调用例子：** `/fm/image?fmid=693` `/fm/image?fmid=693,37&fmtype=2,2&fmoffset=,5&fmsize5,3`

### 编辑精选

说明 : 调用此接口 , 可获取编辑精选数据

**接口地址：** `/top/ip`

**调用例子：** `/top/ip`

### 编辑精选数据

说明 : 调用此接口 , 可获取编辑对应数据

**必选参数：**

`id`: ip id

**可选参数：**

`type`: 数据类型，audios: 音乐, albums: 专辑, videos: 视频, author_list: 歌手

`page`： 页码

`pagesize`: 每页页数, 默认为 30

**接口地址：** `/ip`

**调用例子：** `/ip?id=87473` `ip?id=87473&type=author_list`

### 编辑精选歌单

说明：调用此接口，可获取编辑精选歌单数据

**必选参数：**

`id`: ip id

**可选参数：**

`page`： 页码

`pagesize`: 每页页数, 默认为 30

**接口地址：** `/ip/playlist`

**调用例子：** `/ip/playlist?id=87473`

### 编辑精选专区

说明：调用此接口，可获取编辑精选专区相关内容，若数据中没有 ip_id，可使用[`/ip/zone/home`](#编辑精选专区详情)来获取数据

**接口地址：** `/ip/zone`

**调用例子：** `/ip/zone`

### 编辑精选专区详情

说明：调用此接口，可获取编辑精选专区详情，若[`/ip/zone`](#编辑精选专区) 数据中没有 ip_id，可使用该接口获取数据

**必选参数：**

`id`: ip id

**接口地址：** `/ip/zone/home`

**调用例子：** `/ip/zone/home?id=329`

### 领取 VIP（需要登陆，该接口为测试接口,仅限概念版使用，该接口目前不可使用）

说明 : 调用此接口 , 每天可领取 1 天 VIP 时长，需要领取 8 次，每次增加 3 小时，该接口来自 KG 概念版，非会员用户需要自行测试是否可用(尽量别频繁调用)

**接口地址：** `/youth/vip`

**调用例子：** `/youth/vip`

### 领取一天 VIP（需要登陆，该接口为测试接口,仅限概念版使用）

说明 : 调用此接口 , 领取概念版 VIP，传入日期可领取改日期一天 VIP，该接口来自 KG 概念版，非会员用户需要自行测试是否可用(尽量别频繁调用)

注意 ⚠️：建议不要领太多天

**必选参数：**

`receive_day`: 领取 VIP 日期，格式为：2026-01-30

**接口地址：** `/youth/day/vip`

**调用例子：** `/youth/day/vip`

### 升级概念版 VIP（需要登录，需要先领取一天 VIP，该接口为测试接口,仅限概念版使用）

说明 : 调用此接口 , 可以升级成畅听 VIP，该接口需要先领取一天 VIP（`/youth/day/vip`），该接口来自 KG 概念版，非会员用户需要自行测试是否可用(尽量别频繁
调用)

**接口地址：** `/youth/day/vip/upgrade`

**调用例子：** `/youth/day/vip/upgrade`

### 获取当月已领取 VIP 天数（需要登陆，该接口为测试接口,仅限概念版使用）

说明 : 调用此接口 ,获取当月已领取 VIP 天数

**接口地址：** `/youth/month/vip/record`

**调用例子：** `/youth/month/vip/record`

### 获取已领取 VIP 状态（需要登陆，该接口为测试接口,仅限概念版使用）

说明 : 调用此接口 ,获取已领取 VIP 状态

**接口地址：** `/youth/union/vip`

**调用例子：** `/youth/union/vip`

### 获取歌手列表

说明 : 调用此接口，可以获取歌手列表.

**可选参数：**

`sextypes`：性别类型，0：全部，1：男，2：女，3：组合

`type`：类型，0：全部，1：华语，2：欧美，3：日韩，4：其他，5：日本，6：韩国

`musician`：音乐人，3：为音乐人,0：默认

`hotsize`：返回热门数量，默认 30

**接口地址：** `/artist/lists`

**调用例子：** `/artist/lists`

### 获取歌手详情

说明 : 调用此接口 , 传入歌手 id, 可获得歌手信息

**必选参数：**

`id`： 歌手 id

**接口地址：** `/artist/detail`

**调用例子：** `/artist/detail?id=6539`

### 获取歌手专辑

说明 : 调用此接口 , 传入歌手 id, 可获得歌手专辑

**必选参数：**

`id`： 歌手 id

**可选参数：**

`page`： 页码

`pagesize`: 每页页数, 默认为 30

`sort`: 排序，hot : 热门, new: 最新

**接口地址：** `/artist/albums`

**调用例子：** `/artist/albums?id=6539`

### 获取歌手单曲

说明 : 调用此接口 , 传入歌手 id, 可获得歌手歌曲

**必选参数：**

`id`： 歌手 id

**可选参数：**

`page`： 页码

`pagesize`: 每页页数, 默认为 30

`sort`: 排序，hot : 热门, new: 最新

**接口地址：** `/artist/audios`

**调用例子：** `/artist/audios?id=6539`

### 获取歌手 MV

说明 : 调用此接口 , 传入歌手 id, 可获得歌手 MV

**必选参数：**

`id`： 歌手 id

**可选参数：**

`page`： 页码

`pagesize`: 每页页数, 默认为 30

`tag`: official: 官方版本，live：现场版本，fan：饭制版本，artist: 歌手发布, all: 获取全部，默认为获取全部

**接口地址：** `/artist/videos`

**调用例子：** `/artist/videos?id=6539`

### 关注歌手

说明：调用此接口, 传入歌手 id, 可以关注该歌手（需要登录）

**必选参数：**

`id`: 歌手 id

**接口地址：** `/artist/follow`

**调用例子：** `/artist/follow?id=6539`

### 取消关注歌手

说明：调用此接口, 传入歌手 id, 可以取消关注该歌手（需要登录）

**必选参数：**

`id`: 歌手 id

**接口地址：** `/artist/unfollow`

**调用例子：** `/artist/unfollow?id=6539`

### 获取关注歌手新歌

说明：调用此接口, 可以获取用户已关注的歌手新歌（需要登录）

**可选参数：**

`last_album_id`: 最后专辑 id

`pagesize`: 每页页数, 默认为 30,

`opt_sort`: 排序，1：时间，2：亲密度，默认为 1(时间)

**接口地址：** `/artist/follow/newsongs`

**调用例子：** `/artist/follow/newsongs`

### 获取视频 url

说明 : 传入的视频的 hash, 可以获取对应的视频的 url

**必选参数：**

`hash`: 视频 hash

**接口地址：** `/video/url`

**调用例子：** `/video/url?hash=3B5EE16299F703AEB0E5C28CB152EDF0`

### 获取歌曲 MV

说明 : 传入 album_audio_id/MixSongID 获取歌曲 相对应的 mv

**必选参数：**

album_audio_id: 专辑音乐 id (album_audio_id/MixSongID 均可以), 可以传多个，每个以逗号分开,

**可选参数：**

fields: 支持多个，每个以逗号分隔，支持的值有：mkv,tags,h264,h265,authors

**接口地址：** `/kmr/audio/mv`

**调用例子：** `/kmr/audio/mv?album_audio_id=32155307` `/kmr/audio/mv?album_audio_id=32155307&fields=mkv,tags`

### 获取视频相关信息

说明 : 传入的视频的 hash, 可以获取对应的视频的相关信息

**必选参数：**

`hash`: 视频 hash，可以传多个，以逗号隔开

**接口地址：** `/video/privilege`

**调用例子：** `/video/privilege?hash=3B5EE16299F703AEB0E5C28CB152EDF0`

### 获取视频详情

说明：调用此接口，可以获取视频详情，可以获取更高清的视频 hash

**必选参数：**

`id`: 视频 id/video id

**接口地址：** `/video/detail`

**调用例子：** `/video/detail?id=11517822`

### 新歌速递

说明：调用此接口，可以获取新歌速递

**接口地址：** `/top/song`

**调用例子：** `/top/song`

### 场景音乐列表

说明：调用此接口，可以场景音乐列表

**接口地址：** `/scene/lists`

**调用例子：** `/scene/lists`

### 场景音乐详情

说明：调用此接口，可以场景音乐详情

**必选参数：**

`id`: 场景音乐 scene_id

**接口地址：** `/scene/module`

**调用例子：** `/scene/module?id=9`

### 获取场景音乐讨论区

说明：调用此接口，可以获取场景音乐讨论区

**必选参数**

`id`: 场景音乐 scene_id

**可选参数：**

`page`： 页码

`pagesize`: 每页页数, 默认为 30

`sort`: 排序，rec: 推荐，hot: 热门，new: 最新, 默认为推荐

**接口地址：** `/scene/list/v2`

**调用例子：** `/scene/list/?id=9`

### 获取场景音乐模块 Tag

说明：调用此接口，可以获取场景模块 Tag

**必选参数**

`id`: 场景音乐 scene_id

`module_id`: 场景音乐 module_id

**可选参数：**

**接口地址：** `/scene/module/info`

**调用例子：** `/scene/module/info?id=9&module_id=83`

### 获取场景音乐歌单列表

说明：调用此接口，可以获取场景音乐歌单列表

**必选参数**

`tag_id`: 场景音乐 tag_id

**可选参数：**

`page`： 页码

`pagesize`: 每页页数, 默认为 30

**接口地址：** `/scene/collection/list`

**调用例子：** `/scene/collection/list?tag_id=42391`

### 获取场景音乐视频列表

说明：调用此接口，可以获取场景音乐视频列表

**必选参数**

`tag_id`: 场景音乐视频 tag_id

**可选参数：**

`page`： 页码

`pagesize`: 每页页数, 默认为 30

**接口地址：** `/scene/video/list`

**调用例子：** `/scene/video/list?tag_id=42399`

### 获取场景音乐音乐列表

说明：调用此接口，可以获取场景音乐音乐列表

**必选参数**

`id`: 场景音乐 scene_id

`module_id`: 场景音乐 module_id

`tag`: 场景音乐 tag_id

**可选参数：**

`page`： 页码

`pagesize`: 每页页数, 默认为 30

**接口地址：** `/scene/audio/list`

**调用例子：** `/scene/audio/list?id=9&module_id=173&tag=42391`

### 每日推荐

说明：调用此接口，可以获取每日推荐列表

**可选参数：**

`platform`：设备类型，默认为 ios,支持 android 和 ios

**接口地址：** `/everyday/recommend`

**调用例子：** `/everyday/recommend`

### 历史推荐

说明：调用此接口，可以获取历史推荐

**可选参数：**

`mode`：当 mode 为 list 时，则返回历史推荐列表，当 mode 为 song 时则返回当前歌曲列表，支持参数为：list 和 song,

`history_name`: 当 mode 为 song 该参数为必选参数。

`date`: 当 mode 为 song 该参数为必选参数。

`platform`：设备类型，默认为 ios,支持 android 和 ios

**接口地址：** `/everyday/history`

**调用例子：** `/everyday/history` `/everyday/history?mode=song&history_name=RT_336d5ebc5436534e61d16e63ddfca327_20240106&date=20240106`

### 风格推荐

说明：调用此接口，可以获取风格推荐

**可选参数：**

`platform`：设备类型，默认为 ios,支持 android 和 ios

`tagids`：支持多个，每个以逗号分隔，该接口下可获取 tag 信息

**接口地址：** `/everyday/style/recommend`

**调用例子：** `/everyday/style/recommend` `/everyday/style/recommend?tagids=S14,S15,S16`

### 排行列表

说明：调用此接口，可以获取排行榜列表

**可选参数：**

`withsong`：是否返回歌曲（部分）

**接口地址：** `/rank/list`

**调用例子：** `/rank/list`

### 排行榜推荐列表

说明：调用此接口，可以获取排行榜推荐列表

**接口地址：** `/rank/top`

**调用例子：** `/rank/top`

### 排行榜往期列表

说明：调用此接口，可以获取排行榜往期列表

**必选参数：**

`rankid`：排行榜 id

**可选参数：**

`rank_cid`：排行榜 cid

**接口地址：** `/rank/vol`

**调用例子：** `/rank/vol?rankid=8888`

### 排行榜信息

说明：调用此接口，可以获取排行榜信息

**必选参数：**

`rankid`：排行榜 id

**可选参数：**

`rank_cid`：排行榜 cid

`album_img`：是否返回专辑图片，1：返回，0：不返回，默认返回

`zone`：排行榜 zone

**接口地址：** `/rank/info`

**调用例子：** `/rank/info?rankid=8888`

### 排行榜歌曲列表

说明：调用此接口，可以获排行榜歌曲列表

**必选参数：**

`rankid`：排行榜 id

**可选参数：**

`rank_cid`：若需要返回往期歌曲列表，则该参数为必填，否则默认返回最新一期，[`/rank/vol`](#排行榜往期列表) 返回值中，`volid` 则为该参数

`page`： 页码

`pagesize`: 每页页数, 默认为 30

**接口地址：** `/rank/audio`

**调用例子：** `/rank/audio?rankid=8888` `/rank/audio?rankid=8888&rank_cid=76442`

### 歌曲收藏数

说明 : 调用此接口 , 传入音乐 mixsongids 参数 , 可获得该音乐的收藏数( 不需要登录 )

**必选参数：**

`mixsongids`：音乐 mixsongid，多个以逗号分隔

**接口地址：** `/favorite/count`

**调用例子：** `/favorite/count?mixsongids=368015985,368015986` `/favorite/count?mixsongids=368015985`

### 歌曲评论数

说明 : 调用此接口 , 传入音乐 hash/special_id 参数 , 可获得该音乐的评论数( 不需要登录 )

**必选参数：**

`hash`：音乐 hash

`special_id`：为 评论下的 special_child_id 字段

**接口地址：** `/comment/count`

**调用例子：** `/comment/count?hash=98eb07ad8eaf74bf56dece55518ad63e` `/comment/count?special_id=20505418`

### 歌曲评论

说明 : 调用此接口 , 传入音乐 mixsongid 参数 , 可获得该音乐的所有评论 ( 不需要登录 )

**必选参数：**

`mixsongid`：音乐 mixsongid

**可选参数：**

`page`： 页码

`pagesize`: 每页页数, 默认为 30

`show_classify`： 是否返回分类列表，0 为不返回，1 为返回

`show_hotword_list`：是否返回热词，0 为不返回，1 为返回

**接口地址：** `/comment/music`

**调用例子：** `/comment/music?mixsongid=302362878`

### 歌曲评论-根据分类返回

说明 : 调用此接口 , 传入音乐 mixsongid 和 type_id 参数 , 可获得该音乐的分类评论 ( 不需要登录 )

**必选参数：**

`mixsongid`：音乐 mixsongid

`type_id`：分类 id

**可选参数：**

`page`： 页码

`pagesize`: 每页页数, 默认为 30

`sort`：排序，1 为正序，2 为倒序

**接口地址：** `/comment/music/classify`

**调用例子：** `/comment/music/classify?mixsongid=302362878&type_id=12`

### 歌曲评论-根据热词返回

说明 : 调用此接口 , 传入音乐 mixsongid 和 hot_word 参数 , 可获得该音乐的热词评论 ( 不需要登录 )

**必选参数：**

`mixsongid`：音乐 mixsongid

`hot_word`：热词

**可选参数：**

`page`： 页码

`pagesize`: 每页页数, 默认为 30

**接口地址：** `/comment/music/hotword`

**调用例子：** `/comment/music/hotword?mixsongid=302362878&hot_word=生活`

### 楼层评论

说明 : 调用此接口 , 传入资源 special_id 和资源类型 tid 和资源 mixsongid 参数, 可获得该资源的歌曲楼层评论

**必选参数：**

`special_id`：为 评论下的 special_child_id 字段

`mixsongid`：为 歌曲的 mixsongid

`tid`：评论 id

**可选参数：**

`page`： 页码

`pagesize`: 每页页数, 默认为 30

**接口地址：** `/comment/floor`

**调用例子：** `/comment/floor?special_id=100285259&mixsongid=302362878&tid=678433417`

### 歌单评论

说明 : 调用此接口 , 传入歌单 id 参数 , 可获得该歌单的所有评论 ( 不需要登录 )

**必选参数：**

`id`：歌单 global_collection_id

**可选参数：**

`page`： 页码

`pagesize`: 每页页数, 默认为 30

`show_classify`： 是否返回分类列表，0 为不返回，1 为返回

`show_hotword_list`：是否返回热词，0 为不返回，1 为返回

**接口地址：** `/comment/playlist`

**调用例子：** `/comment/playlist?id=collection_3_1373407643_366_0`

### 专辑评论

说明 : 调用此接口 , 传入 专辑 id 参数 , 可获得该专辑的所有评论 ( 不需要登录 )

`id`：专辑 id

**可选参数：**

`page`： 页码

`pagesize`: 每页页数, 默认为 30

`show_classify`： 是否返回分类列表，0 为不返回，1 为返回

`show_hotword_list`：是否返回热词，0 为不返回，1 为返回

**接口地址：** `/comment/album`

**调用例子：** `/comment/album?id=collection_3_1373407643_366_0`

### 提交听歌历史

说明：提交听歌历史后，支持在其他设备上查看听歌历史

**必选参数：**

`mxid`： 专辑音乐 id (album_audio_id/MixSongID 均可以)

**可选参数：**

`ot`：当前时间戳, 秒级，不要传入毫秒级，否者会返回错误，或者从 [`获取服务器时间`](#获取服务器时间) 中获取

`pc`: 当前播放次数，更新播放次数，当服务器的值大于传入值时，将维持服务最大值，否则更新

**接口地址：** `/playhistory/upload`

**调用例子：** `/playhistory/upload?mxid=32155307`

### 获取服务器时间

说明：获取服务器时间，返回服务器时间戳

**接口地址：** `/server/now`

**调用例子：** `/server/now`

### 刷刷

说明：获取刷刷视频

**接口地址：** `/brush`

**调用例子：** `/brush`

### AI 推荐

说明：传入 album_audio_id/MixSongID 获取 AI 推荐歌曲

**必选参数：**

`album_audio_id`： 专辑音乐 id (album_audio_id/MixSongID 均可以), 可以传多个，每个以逗号分开,

**接口地址：** `/ai/recommend`

**调用例子：** `/ai/recommend?album_audio_id=274565080` `/ai/recommend?album_audio_id=274565080,68435124`

### 曲谱 - 获取歌曲曲谱

说明 : 调用此接口，传入歌曲 album_audio_id/MixSongID 可获得该歌曲的曲谱，注意：需要自己解析，别问我，我也看不懂

**必选参数：**

`album_audio_id`：音乐的 mixsongid/album_audio_id

**可选参数：**

`instruments`：曲谱类型 默认为 1，1：吉他， 2：尤克里里，3：钢琴，4：简谱

`level`： 等级/难度 默认为 0， 吉他（1: 进阶, 2：基础，0：中级），尤克里里/钢琴（0：基础，1：进阶）,简谱（0：基础）

**接口地址：** `/sheet/song`

**调用例子：** `/sheet/song?album_audio_id=68435136`

### 曲谱 - 曲谱详情

说明 : 调用此接口，传入曲谱 opern_id 可获得该曲谱详情，**注意：需要自己解析，别问我，我也看不懂**

**必选参数：**

`opern_id`：曲谱 id,

**接口地址：** `/sheet/detail`

**调用例子：** `/sheet/detail?id=68435136_1_0`

### 曲谱 - 曲谱排行榜

说明 : 调用此接口，可以获取推荐排行榜

**可选参数：**

`instruments`：曲谱类型 默认为 1，1：吉他， 2：尤克里里，3：钢琴，4：简谱

`level`： 等级/难度 默认为 0， 吉他（1: 进阶, 2：基础，0：中级），尤克里里/钢琴（0：基础，1：进阶）,简谱（0：基础）

`page`：页数

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/sheet/rank`

**调用例子：** `/sheet/rank`

### 曲谱 - 曲谱广场

说明 : 调用此接口，可以获取推荐曲谱

**可选参数：**

`instruments`：曲谱类型 默认为 1，1：吉他， 2：尤克里里，3：钢琴，4：简谱

`level`： 等级/难度 默认为 0， 吉他（1: 进阶, 2：基础，0：中级），尤克里里/钢琴（0：基础，1：进阶）,简谱（0：基础）

`page`：页数

`pagesize `: 每页页数, 默认为 30

`tagid`: 标签, 通过 `/sheet/tags` 获取

**接口地址：** `/sheet/explore`

**调用例子：** `/sheet/explore`

### 曲谱 - 曲谱标签

说明 : 调用此接口，可以获取曲谱标签

**接口地址：** `/sheet/tags`

**调用例子：** `/sheet/tags`

### 频道 - 获取用户所有频道

说明：登录后调用此接口，可以获取用户所有订阅的频道

**可选参数：**

`page`：页数

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/youth/channel/all`

**调用例子：** `/youth/channel/all`

### 频道 - 详情

说明：调用此接口，传入 `global_collection_id / channel_id` 可以获取频道详情

**必选参数：**

`global_collection_id`：频道 id (global_collection_id / channel_id 均可以), 可以传多个，每个以逗号分开,

**接口地址：** `/youth/channel/detail`

**调用例子：** `/youth/channel/detail?global_collection_id=11576464149`

### 频道 - 频道安利

说明：调用此接口，传入 `global_collection_id / channel_id` 可以获取频道安利

**必选参数：**

`global_collection_id`：频道 id (global_collection_id / channel_id 均可以)

**接口地址：** `/youth/channel/amway`

**调用例子：** `/youth/channel/amway?global_collection_id=11576464149`

### 频道 - 相似频道

说明：调用此接口，传入 `global_collection_id / channel_id` 可以获取相似频道

**必选参数：**

`channel_id`：频道 id (global_collection_id / channel_id 均可以)

**接口地址：** `/youth/channel/similar`

**调用例子：** `/youth/channel/similar?channel_id=11576464149`

### 频道 - 订阅

说明：登录后调用此接口， 传入 `global_collection_id / channel_id` 可订阅频道

**必选参数：**

`global_collection_id`：频道 id (global_collection_id / channel_id 均可以)

**可选参数：**

`t`：1 为订阅，0 为取消订阅，不传默认为订阅

**接口地址：** `/youth/channel/sub`

**调用例子：** `/youth/channel/sub?global_collection_id=11576464149` `/youth/channel/sub?global_collection_id=11576464149&t=0`

### 频道 - 音乐故事

说明：调用此接口，传入 `global_collection_id / channel_id` 可以获取音乐故事

**必选参数：**

`global_collection_id`：频道 id (global_collection_id / channel_id 均可以)

**可选参数：**

`page`：页数

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/youth/channel/song`

**调用例子：** `/youth/channel/song?global_collection_id=11576464149`

### 频道 - 音乐故事详情

说明：调用此接口，传入 `global_collection_id / channel_id` 和 `fileid` 可以获取音乐故事详情

**必选参数：**

`global_collection_id`：频道 id (global_collection_id / channel_id 均可以)

`fileid`: 音乐故事 fileid

**接口地址：** `/youth/channel/song/detail`

**调用例子：** `/youth/channel/song/detail?global_collection_id=11576464149&fileid=1720958083456581`

### 动态 - 最常访问

说明：登录后调用此接口，可以获取经常访问的频道和用户

**接口地址：** `/youth/dynamic/recent`

**调用例子：** `/youth/dynamic/recent`

### 获取用户公开的音乐

说明：调用此接口，可以获取用户公开的音乐

**必选参数：**

`userid`：用户 id

**可选参数：**

`page`：页数

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/youth/user/song`

**调用例子：** `/youth/user/song?userid=1354894105`

### 听书 - 每日推荐

**可选参数：**

`page`：页数

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/longaudio/daily/recommend`

**调用例子：** `/longaudio/daily/recommend`

### 听书 - 排行榜推荐

**接口地址：** `/longaudio/rank/recommend`

**调用例子：** `/longaudio/rank/recommend`

### 听书 - VIP 推荐

**接口地址：** `/longaudio/vip/recommend`

**调用例子：** `/longaudio/vip/recommend`

### 听书 - 每周推荐

**接口地址：** `/longaudio/week/recommend`

**调用例子：** `/longaudio/week/recommend`

### 听书 - 专辑详情

**必选参数：**

`album_id`: 专辑 id 可以传多个，每个以逗号分开,

**接口地址：** `/longaudio/album/detail`

**调用例子：** `/longaudio/album/detail?album_id=56655759`

### 听书 - 专辑音乐列表

**必选参数：**

`album_id`: 专辑 id 可以传多个

**接口地址：** `/longaudio/album/audios`

**调用例子：** `/longaudio/album/audios?album_id=56655759`

### 歌曲详情 - 歌曲成绩单

说明：调用此接口，可以获取`歌曲详情`里面的`歌曲成绩单`信息

**必选参数：**

`album_audio_id`： 专辑音乐 id (album_audio_id/MixSongID 均可以),

**接口地址：** `/song/ranking`

**调用例子：** `/song/ranking?album_audio_id=32155307`

### 歌曲详情 - 歌曲成绩单详情

说明：登陆后调用此接口，可以获取更详细的歌曲成绩单信息

**必选参数：**

`album_audio_id`： 专辑音乐 id (album_audio_id/MixSongID 均可以),

**可选参数：**

`page`：页数

`pagesize `: 每页页数, 默认为 30

**接口地址：** `/song/ranking/filter`

**调用例子：** `/song/ranking/filter?album_audio_id=32155307`

### 验证码 - 获取验证码格式

说明：碰到错误码 20028 时，可调用该接口获取验证码的格式。

**必选参数：**

`eventid`：当请求出现错误码为 20028 时，一般会返回

**接口地址：** `/get/verify/info`

**调用例子：** `/get/verify/info?eventid=gz_tx_event_xxx`

### 验证码 - 验证验证码格式

说明：通过验证码后通过该请求验证。（目前仅实现了腾讯验证码，其他的没碰到）

**必选参数：**

`eventid`：当请求出现错误码为 20028 时，一般会返回

`v_type`：`/get/verify/info` 下获取

`verifycode`：通过滑块验证码等获取

`sid`：通过 wasm 获取，具体可查看 `public\login_captcha.html`

`edt`：同上

**接口地址：** `/verify/user/info`

**调用例子：** `/verify/user/info?eventid=gz_tx_event_xxx&v_type=xx&verifycode=xxx&sid=xxx&edt=xxx`

### 听歌识曲

说明：调用此接口，传入 PCM 音频数据（`application/octet-stream`），可识别歌曲信息。**该接口必须使用 POST 请求**

**必选参数：**

`data`：PCM 音频二进制数据（16bit 采样，通过 POST body 以 `application/octet-stream` 格式传入）

**接口地址：** `/audio/match`

**调用例子：** 使用 POST 请求，`Content-Type: application/octet-stream`，body 为 PCM 二进制数据

```javascript
// 前端示例
const res = await fetch('/audio/match', {
  method: 'POST',
  headers: { 'Content-Type': 'application/octet-stream' },
  body: pcmArrayBuffer,
});
```

## License

[The MIT License (MIT)](https://github.com/MakcRe/KuGouMusicApi/blob/main/LICENSE)
