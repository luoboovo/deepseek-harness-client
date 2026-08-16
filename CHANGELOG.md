# 更新日志

本文件记录 DeepSeek Harness 桌面客户端的重要功能、兼容性修复和升级说明。

## 1.3.1 - 2026-08-16

这是一次针对 Android 数据同步和工作区操作的兼容性修复版本。建议电脑端与 Android 客户端一起升级，并在升级后重新扫码配对。

### 问题根因

局域网移动端通过普通 HTTP 连接电脑。部分 Android System WebView 在这种环境下提供 `crypto.getRandomValues()`，但不提供 `crypto.randomUUID()`。DeepSeek Harness 使用 UUID 生成 RPC 请求 ID，因此缺少该 API 时不只是“添加工作区”失败，读取会话、消息和任务状态的请求也可能在发送前中断。

典型表现：

- 手机端可以连接电脑，但会话或工作区数据为空。
- 点击“添加工作区”弹出“无法打开文件夹”。
- 错误详情显示 `crypto.randomUUID is not a function`。

### 已修复

- 新增 Android WebView UUID v4 兼容层。
- 兼容脚本在 Harness 主模块之前执行，确保首个 RPC 请求即可正常生成 ID。
- 优先使用 WebView 原生 `crypto.getRandomValues()` 生成随机字节。
- 为缺少完整 Web Crypto 的极旧 WebView 提供仅用于客户端 RPC 关联 ID 的后备方案。
- 保留 Harness 原有的电脑端目录浏览流程；手机添加工作区时浏览和选择的是电脑上的目录。
- 更新 Android `versionCode` 为 `5`，版本号更新为 `1.3.1`。
- 更新 README 和操作指南中的下载名称、升级步骤与故障排查说明。

### 验证结果

- UUID 兼容层在有 `getRandomValues`、无 Web Crypto 和已有 `randomUUID` 三种环境下通过自动测试。
- 验证兼容脚本在 Harness ES 模块之前注入。
- 通过局域网代理读取到电脑端已有工作区、会话和完整消息记录。
- 点击“添加工作区”不再出现 UUID 异常。
- Windows NSIS 安装包构建成功，并确认 ASAR 内包含兼容脚本。
- Android Release APK 构建成功，完整 `lintRelease` 通过。
- APK 的 v2、v3 签名验证通过。

### 升级方法

1. 退出旧版电脑客户端，包括系统托盘中的后台进程。
2. 安装 `DeepSeekHarnessModern-Setup-1.3.1.exe`。
3. 在手机上安装 `DeepSeekHarnessMobile-1.3.1.apk`，允许覆盖旧版本。
4. 启动电脑客户端，等待 Harness 显示“已就绪”。
5. 打开手机同步面板，使用 Android 客户端重新扫描二维码。

### 已知限制

- 手机与电脑必须可以通过同一局域网互相访问。
- 局域网同步使用 HTTP 与配对码 Cookie，不是端到端加密，只应在可信网络中开启。
- 手机端同步 Harness 数据与操作结果，不传输电脑画面，也不远程控制 Windows 桌面。
- Android 应用内扫码依赖 Google Play 服务；不可用时仍可手动填写地址和配对码。

## 1.3.0 - 2026-08-16

### 新增

- 新增局域网数据同步桥，默认监听电脑的 `3081` 端口。
- 手机端与电脑端连接同一个 Harness 后端，共享工作区、会话、消息和任务状态。
- 新增 8 位配对码、认证 Cookie、换码和主动断开旧连接。
- 新增桌面二维码连接面板，同时提供 Android 深链接和浏览器移动链接。
- 新增原生 Android WebView 客户端，支持应用内扫描二维码和手动连接。
- 新增针对手机窄屏的侧栏抽屉、会话正文和输入区域布局。
- 适配刘海屏安全区、底部手势区域和系统软键盘高度。
- 手机输入框可直接调用 Android 系统输入法。
- 新增 Android APK 自动构建、zipalign 与发布签名流程。

### 改进

- 局域网代理统一转发 Harness HTTP、API 和 WebSocket 数据。
- 修正代理请求的 Origin，使 Harness 接受来自手机同步地址的 API 请求。
- 优先展示常见的 `192.168.x.x`、`10.x.x.x` 和私有 `172.16-31.x.x` 地址。
- 文档补充手机连接、防火墙、端口和安全说明。

### 安全说明

- 未配对的 HTTP 和 WebSocket 请求会被拒绝。
- 更换配对码会断开当前移动连接，并使旧配对信息失效。
- 手机同步功能可以在电脑端随时关闭。

## 1.0.0 - 2026-08-15

### 初始版本

- 使用 Electron 提供现代 Windows 桌面窗口。
- 自动检查 Node.js 与 npx 环境。
- 自动运行 `npx @deepseek-ai/dsh web` 并在窗口内嵌入 Harness。
- 支持系统托盘后台运行、服务重启和运行日志面板。
- 退出客户端时清理本客户端启动的 Node.js/npx 进程树。
- 检测到外部 Harness 服务时直接连接，不重复启动或误杀外部进程。
- 提供 Windows 安装版与免安装版构建脚本。
