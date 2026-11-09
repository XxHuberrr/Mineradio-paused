# Mineradio 2.2.0 发布流程

## 发布边界

- 正式版本：`2.2.0`
- Git tag：`v2.2.0`
- Release 标题：`Mineradio 2.2.0`
- 安装包：`Mineradio-2.2.0-Setup.exe`
- 仅从当前可信源码完整构建，不复用旧安装包或旧 `dist/`。
- 正式 Release 不混入 Mineradio_Beat 产物。
- GitHub Release 附带完整安装包 `Mineradio-2.2.0-Setup.exe` 和最小版本说明 `latest.yml`。后者供旧版主检测失败时的备用线路使用；不上传 blockmap 或补丁。
- `2.0.3+` 客户端不得从 Release assets 识别或下载安装包，软件内更新仍只读取正文中的网盘线路。
- Release 正文使用两条 `mineradio-download-page` 隐藏标记提供本次下载入口，保留百度云链接中的提取码参数。

## 网盘分发

本次下载入口已更换，请使用以下新网盘链接，并更新旧收藏。通过公告中的网盘入口下载，也是在支持 Mineradio 的持续更新。

- 夸克盘：[下载 Mineradio 2.2.0](https://pan.quark.cn/s/4b124d3e81d3)
- 百度云：[下载 Mineradio 2.2.0](https://pan.baidu.com/s/17CwpHUza67w_Grgc3s5nOw?pwd=SJHP)（提取码 `SJHP`）

<!-- mineradio-download-page: 夸克盘|https://pan.quark.cn/s/4b124d3e81d3 -->
<!-- mineradio-download-page: 百度云|https://pan.baidu.com/s/17CwpHUza67w_Grgc3s5nOw?pwd=SJHP -->

## 公开更新说明

- 本次下载入口已更换，请使用公告中的新网盘链接，并更新旧收藏。
- 修复音乐接口的登录、账号识别与播放稳定性问题。
- 改善歌单加载、搜索分页，以及网络异常后的恢复。
- 新增粒子预设与更多手势操作，改善日常播放体验。

## 发布资产

GitHub Release 上传 `dist/Mineradio-2.2.0-Setup.exe` 和 `docs/update/latest.yml`。版本说明仅包含 `version/releaseDate`，不得使用带安装包下载字段的构建工具清单。构建生成的 blockmap、安装清单与校验记录仍只用于本地验收。

2.1.0 的备用检测和入口限制见 [更新公告与旧版兼容](docs/UPDATE_DELIVERY.md)。每次发布都要同步版本说明；缺失会使主接口访问失败的旧客户端无法发现更新。

安装包 SHA-256：`8fd318283bab2fe98190f7b879ede423dd8274a0aeec8d321570b8d022d4f989`。

## 发布前检查

- 运行完整回归检查与 Electron 启动检查。
- 构建并检查 `win-unpacked/resources/app` 内容，核对正式版本、资源完整性和源码一致性。
- 验证安装包启动、退出、重启和用户数据恢复。
- 确认仓库与安装包不包含 Cookie、Token、凭据、缓存或本机日志。
- 核对安装包 SHA-256，以及公告、README 和软件更新入口中的两条新网盘链接。
