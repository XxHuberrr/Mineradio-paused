# 汽水 macOS 完整播放适配

Mac 完整音源请求需要匹配的平台、版本、设备身份及请求签名。沿用
Windows 请求参数可能无法获取完整音源；下游若回退到公开接口，则仅得到
约 30 秒试听。会员标识本身不能保证该音源请求成功。

本适配仅在 macOS 生效，要求：

- 官方汽水音乐 Mac **2.9.1** 安装于 `/Applications` 或 `~/Applications`。
- Mineradio 中已登录拥有对应歌曲播放权益的账号。
- `QISHUI_QR_CONFIG_FILE` 指向已有扫码登录流程保存的设备身份文件。

适配检查官方客户端版本、代码签名与 TeamIdentifier，再通过独立子进程
调用本机官方组件。Cookie 通过 stdin 传递，不写入命令行参数；不分发官方
组件。其他版本、未安装官方客户端、缺少设备身份时沿用原有请求路径。
官方客户端不必运行或登录。签名失败仍交由已有播放错误处理路径报告。

Windows/Linux 在读取 Mac 设备身份或启动 helper 之前返回，保持原请求路径。
会员权限判断保持原样，不把试听片段伪装成完整音源。

验证：`node --test tests/qishui-mac-playback.test.js` 覆盖请求字节、helper
超时与凭据传递、签名头校验、VIP/非 VIP 权益及平台隔离。此前社区 Mac
运行验证中，Love You Down 自然播放超过 45 秒，跳至两分钟后继续播放。
本 PR 在最新上游主线上重新执行自动化测试；尚未重新进行该分支的登录播放、
长期稳定性或 Windows 原生 GUI 验收。不提供新的安装包或更改品牌。

`init` / `generateHttpSignatureHeaders` 调用形式参考
[libmssdk](https://github.com/sodahub-org/libmssdk)（MIT，Copyright (c) 2026
ZephyrCheung）并对照本机官方客户端校验；适配不包含其官方原生二进制。
