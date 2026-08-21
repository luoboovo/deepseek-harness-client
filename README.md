<p align="center">
  <img src="./docs/images/readme-banner.png" alt="DeepSeek Harness 桌面客户端角色横幅" width="100%">
</p>

<h1 align="center">DeepSeek Harness 桌面客户端</h1>

<p align="center">
  一个面向 Windows 的现代桌面外壳：双击启动、窗口内直接使用 DeepSeek Harness，并让手机同步访问同一批会话数据。
</p>

<p align="center">
  <img alt="平台 Windows 10/11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?logo=windows11&logoColor=white">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white">
  <img alt="Node.js LTS" src="https://img.shields.io/badge/Node.js-LTS-339933?logo=nodedotjs&logoColor=white">
  <img alt="版本 1.3.1" src="https://img.shields.io/badge/version-1.3.1-20B486">
</p>

<p align="center">
  <a href="https://github.com/luoboovo/deepseek-harness-client/releases"><strong>下载 Windows 客户端</strong></a>
  ·
  <a href="./USAGE.md"><strong>查看完整操作指南</strong></a>
  ·
  <a href="./CHANGELOG.md"><strong>更新日志</strong></a>
</p>

> [!NOTE]
> Windows 客户端仍需安装 Node.js LTS，并在后台运行 `npx @deepseek-ai/dsh web`。Android 客户端连接这台电脑上的同一个 Harness 服务，会话、消息、任务和工作区数据来自同一后端，不传输电脑画面。

## 界面预览

DeepSeek Harness 会直接嵌入客户端窗口，无需跳转到系统浏览器。顶部状态栏用于查看服务状态、重启服务、打开日志以及管理窗口。

![DeepSeek Harness 客户端主界面](./docs/images/client-main.png)

运行日志以侧边面板呈现；点击标题栏的日志按钮打开，再点击面板右上角红色 `×` 即可关闭。

![DeepSeek Harness 客户端运行日志](./docs/images/client-logs.png)

## 功能亮点

- **窗口内直接使用**：通过 Electron `<webview>` 加载本机 `http://127.0.0.1:3080`。
- **小鲸鱼余额挂件内置**：客户端自带 DeepSeek 余额小鲸鱼挂件的渲染资源（脚本/图片/音效），通过本机 3089 端口提供，并在页面加载后自动注入。即使 DSH web profile 没有安装 `dsh-whale-widget` 插件，桌面窗口右下角也能显示小鲸鱼；余额数据优先走 DSH 服务端插件路由，插件缺失时鲸鱼本体仍可用并提示「获取失败」。
- **自动启动服务**：启动客户端后检查 Node.js、npx 与端口状态，并按需启动 Harness。
- **进程妥善回收**：从托盘退出时，关闭由客户端创建的 npx/Node.js 进程树。
- **托盘后台运行**：关闭主窗口时隐藏到系统托盘，避免误停正在执行的任务。
- **清晰状态反馈**：提供启动、就绪、超时和异常状态，并保留最近的运行日志。
- **环境容错**：缺少 Node.js 或 npx 时显示错误提示和下载入口。
- **兼容现有服务**：如果 3080 端口已经运行 Harness，直接连接，不重复启动，也不会在退出时终止该外部进程。
- **手机同步 Harness 数据**：移动端直接连接电脑上的 Harness API，会话、消息和任务更新来自同一数据源。
- **移动端专用布局**：会话侧栏使用覆盖式抽屉，正文与输入栏适配窄屏、安全区和软键盘高度。
- **应用内扫码配对**：Android 连接页可直接扫描桌面二维码，也保留地址与配对码手动连接。

## 快速开始

1. 安装 [Node.js LTS](https://nodejs.org/zh-cn/download)，并保留安装程序中添加到 `PATH` 的默认选项。
2. 从 [Releases](https://github.com/luoboovo/deepseek-harness-client/releases) 下载最新的 EXE。
3. 双击运行 `DeepSeekHarnessModern-Setup-1.3.1.exe`，等待顶部状态变为“DeepSeek Harness 已就绪”。

首次运行时，npx 可能需要联网下载 `@deepseek-ai/dsh`，所需时间会比后续启动更长。当前构建未进行商业代码签名，Windows SmartScreen 可能显示“未知发布者”；请确认文件来自本仓库 Releases 或由你自行构建。

完整的窗口操作、托盘退出、端口检查和故障排查步骤见 [操作指南](./USAGE.md)。

## Android 手机数据同步

1. 电脑端点击标题栏的手机图标，打开“手机数据同步”。
2. 保持“允许手机连接”开启。
3. 安装并打开 `DeepSeekHarnessMobile-1.3.1.apk`，点击“扫描电脑二维码”扫描桌面面板中的二维码。
4. 也可以手动输入优先显示的 `192.168.x.x` 地址与 8 位配对码，或在手机浏览器打开配对页。

手机和电脑是两个独立界面，但连接同一个 Harness 后端。选择会话、页面滚动和输入焦点可以各自保持；会话列表、消息内容、任务状态以及在同一会话中提交的操作会同步。点击手机输入框会直接调用系统输入法。

> [!WARNING]
> 局域网桥使用 HTTP 和配对码保护，不是端到端加密。仅在可信的家庭或办公局域网中开启；不用时可在桌面面板关闭，或点击换码使旧手机失效。

## 工作流程

```mermaid
flowchart LR
    A["双击客户端"] --> B["检查 Node.js 与 npx"]
    B --> C["检查 3080 端口"]
    C -->|"已有 Harness"| F["加载本机 WebView"]
    C -->|"端口空闲"| D["启动 npx dsh web"]
    D --> E["等待服务就绪"]
    E --> F
    F --> G["托盘驻留与进程管理"]
    F --> H["3081 手机数据同步"]
    H --> I["扫码配对并连接同一 Harness API"]
```

## 从源码运行

```powershell
git clone https://github.com/luoboovo/deepseek-harness-client.git
cd deepseek-harness-client
npm install
npm start
```

## 构建应用

构建免安装版：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-portable.ps1
```

构建安装版：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-installer.ps1
```

构建 Android APK：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-android.ps1
```

构建产物位于 `release` 目录：

- `DeepSeekHarnessModern-Setup-1.3.1.exe`：Windows 安装版。
- `DeepSeekHarnessModern-Portable-1.3.1.exe`：Windows 免安装版。
- `DeepSeekHarnessMobile-1.3.1.apk`：Android 客户端。

## 故障排查

<p align="center">
  <img src="./docs/images/mascot-troubleshooting.png" alt="角色正在排查客户端故障" width="720">
</p>

| 现象 | 优先检查 |
| --- | --- |
| 提示缺少 Node.js 或 npx | 在新 PowerShell 中运行 `node --version` 与 `npx --version` |
| 一直显示正在启动 | 打开日志面板，检查首次下载、网络或代理错误 |
| 3080 端口被占用 | 运行 `netstat -ano \| findstr :3080` 查找对应 PID |
| 手机无法连接电脑 | 确认两端在同一局域网，并允许 Windows 防火墙的“专用网络”访问 |
| 手机连接后没有会话数据或添加工作区时报 `crypto.randomUUID` | 将电脑客户端和 Android 客户端同时升级到 1.3.1，然后重新扫码连接 |
| 配对码无效 | 在电脑端重新查看或更换配对码，再回到 Android 连接页 |
| 页面空白或加载失败 | 重启服务，并确认 `127.0.0.1:3080` 正在监听 |
| 点击关闭后仍在运行 | 这是托盘模式；右键托盘图标并选择“退出” |

更完整的命令与处理方法见 [USAGE.md 的常见问题部分](./USAGE.md#9-常见问题)。

## 项目结构

```text
deepseek-harness-client/
├─ assets/        程序与托盘图标
├─ android-app/   原生 Android WebView 客户端
├─ docs/images/   README、指南截图与角色插图
├─ scripts/       Windows 构建脚本
├─ src/           Electron 主进程、局域网数据代理、移动适配与桌面界面代码
│  ├─ whale/          小鲸鱼挂件内置资源（widget.js、鲸鱼图、音效）
│  └─ whale-server.js 小鲸鱼内置资源本机服务（默认 3089 端口，可用 DSH_WHALE_PORT 覆盖）
├─ package.json   项目与打包配置
├─ README.md      项目主页
└─ USAGE.md       完整操作指南
```

## 说明

本项目是 DeepSeek Harness 的非官方桌面包装客户端。DeepSeek Harness 及相关名称归其各自权利人所有。
