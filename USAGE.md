# DeepSeek Harness 桌面客户端操作指南

本文档适用于 `deepseek-harness-client` 的 Windows 版本，包含客户端使用、源码运行、打包和常见问题排查。

## 1. 客户端简介

客户端会在后台执行以下命令：

```powershell
npx @deepseek-ai/dsh web
```

DeepSeek Harness 启动后会监听本机 `http://127.0.0.1:3080`。客户端使用 Electron `<webview>` 在自己的窗口中显示该页面，不会把主界面跳转到系统浏览器。

主要功能：

- 双击客户端后自动检查并启动 DeepSeek Harness。
- 在桌面客户端内部显示 Harness 页面。
- 显示启动状态和实时运行日志。
- 支持重启后台服务。
- 关闭窗口时隐藏到系统托盘，避免误关后台进程。
- 从托盘退出时关闭本客户端启动的 Node.js/npx 进程树。
- 未安装 Node.js 或 npx 时显示错误提示和下载入口。
- 检测到 3080 端口已有服务时直接连接，不重复启动进程。

## 2. 系统要求

- Windows 10 或 Windows 11，64 位系统。
- Node.js LTS，安装包需包含 npm 和 npx。
- 首次启动时需要连接网络，以便 npx 下载或更新 `@deepseek-ai/dsh`。
- 本机 3080 端口可用，或该端口已经运行 DeepSeek Harness。

Node.js 下载地址：

<https://nodejs.org/zh-cn/download>

安装 Node.js 时建议保留“添加到 PATH”相关默认选项。安装结束后重新打开 PowerShell，再执行：

```powershell
node --version
npx --version
```

两条命令都能输出版本号，说明运行环境已准备好。

## 3. 普通用户使用方法

### 3.1 免安装版

1. 下载 `DeepSeekHarnessModern-1.0.0.exe`。
2. 确认电脑已安装 Node.js LTS。
3. 双击 EXE，等待状态栏显示“DeepSeek Harness 已启动”或“已就绪”。
4. 首次运行时 npx 可能需要下载依赖，等待时间会比后续启动更长。

免安装版可以放到任意有写入权限的目录中运行。

### 3.2 安装版

1. 双击 NSIS 安装包。
2. 根据向导选择安装目录。
3. 从桌面快捷方式或开始菜单打开 `DeepSeek Harness`。

当前构建未进行商业代码签名。Windows SmartScreen 可能显示未知发布者提示，请只运行从可信来源获取或自行构建的文件。

## 4. 窗口与托盘操作

标题栏右侧按钮：

- `↻`：重启 DeepSeek Harness。
- `☰`：打开或收起运行日志。
- `−`：最小化窗口。
- `□`：最大化或还原窗口。
- `×`：隐藏到系统托盘，不会彻底退出程序。

日志面板：

- “清空”只清除当前窗口内显示的日志，不会停止服务。
- 红色 `×` 用于关闭日志面板。

系统托盘菜单：

- “打开窗口”：重新显示客户端。
- “重启 DeepSeek Harness”：重启客户端管理的后台服务。
- “退出”：彻底退出客户端，并关闭本客户端启动的 npx/Node.js 子进程。

注意：如果客户端启动前 3080 端口已经有服务，客户端会将它视为外部服务。退出客户端时不会杀掉这个外部进程。

## 5. 查看运行日志

点击标题栏的 `☰` 按钮打开日志面板。正常启动时一般可以看到：

```text
$ npx @deepseek-ai/dsh web
dsh web: http://127.0.0.1:3080
```

遇到启动失败、启动超时或页面空白时，先查看日志末尾的错误信息。常见关键词包括：

- `EADDRINUSE`：3080 端口被其他程序占用。
- `not recognized` 或“不是内部或外部命令”：Node.js/npx 未安装或 PATH 未生效。
- 网络或下载错误：npx 无法下载 `@deepseek-ai/dsh`。
- `code: 1`：后台命令异常退出，需要结合前面的日志判断原因。

## 6. 从源码运行

打开 PowerShell，进入项目目录：

```powershell
cd C:\path\to\deepseek-harness-client
```

安装依赖：

```powershell
npm install
```

启动开发版客户端：

```powershell
npm start
```

开发版与打包版使用相同的启动流程，都会检查 Node.js/npx、检查 3080 端口，并在需要时运行 DeepSeek Harness。

## 7. 打包 Windows 程序

所有打包产物默认生成在 `release` 目录。构建脚本会创建独立缓存目录，并配置 Electron 国内镜像。

### 7.1 打包免安装版

在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-portable.ps1
```

输出文件：

```text
release\DeepSeekHarnessModern-1.0.0.exe
```

### 7.2 打包安装版

执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-installer.ps1
```

安装包使用 NSIS，支持选择安装目录，并创建桌面和开始菜单快捷方式。

### 7.3 同时打包两种版本

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run dist:all
```

可用的 npm 命令：

```text
npm start            启动开发版
npm run dist         打包免安装版
npm run dist:installer  打包安装版
npm run dist:all     同时打包免安装版和安装版
```

## 8. 3080 端口排查

在 PowerShell 或命令提示符中执行：

```powershell
netstat -ano | findstr :3080
```

该命令用于查找正在使用 3080 端口的连接或监听进程。示例：

```text
TCP    127.0.0.1:3080    0.0.0.0:0    LISTENING    12345
```

最后一列 `12345` 是进程 PID。查看这个 PID 对应的程序：

```powershell
tasklist | findstr 12345
```

确认该进程可以关闭后，再执行：

```powershell
taskkill /PID 12345 /T /F
```

不要关闭不认识的系统进程。如果 3080 端口运行的正是可用的 DeepSeek Harness，可以直接打开客户端，客户端会连接现有服务。

关闭客户端后仍怀疑端口被占用，可以再次运行 `netstat` 命令确认。

## 9. 常见问题

### 提示缺少 Node.js 或 npx

安装 Node.js LTS 后彻底退出客户端，再重新打开。如果已经安装，确认 `node --version` 和 `npx --version` 能在新打开的 PowerShell 中运行。

### 一直显示“正在启动”或“启动超时”

首次启动可能正在下载依赖。打开日志面板查看下载或网络错误，也可以在 PowerShell 中手动测试：

```powershell
npx --yes @deepseek-ai/dsh web
```

手动命令启动成功后按 `Ctrl+C` 停止，再重新打开客户端。

### 显示“3080 端口被占用”

使用第 8 节的 `netstat` 和 `tasklist` 命令确认占用者。如果是残留 Node.js 进程，在确认 PID 后使用 `taskkill` 关闭。

### 客户端页面空白或加载失败

1. 点击标题栏的重启按钮。
2. 打开运行日志，确认后台命令没有退出。
3. 用 `netstat -ano | findstr :3080` 检查端口是否监听。
4. 暂时关闭代理或检查防火墙是否阻止本机回环连接。

### 点击窗口关闭按钮后程序还在运行

这是预期行为。窗口右上角 `×` 会隐藏到托盘。需要彻底退出时，右键系统托盘中的客户端图标，然后点击“退出”。

### 为什么目标电脑仍要安装 Node.js

当前 EXE 只打包桌面外壳，没有内置 Node.js 环境和 `@deepseek-ai/dsh`。Harness 仍通过系统中的 npx 启动。

## 10. 数据与安全说明

- 客户端只把 Harness 主界面加载自 `127.0.0.1:3080`。
- 非本地链接会交给系统浏览器打开，不会在 Harness WebView 中继续跳转。
- 客户端日志最多在内存中保留最近 300 条，不会由本项目主动上传。
- Electron 页面启用了上下文隔离，渲染页面不能直接访问 Node.js API。
- 首次运行及后续更新可能由 npx 从 npm 下载 `@deepseek-ai/dsh`。

## 11. 项目结构

```text
deepseek-harness-client/
├─ assets/
│  └─ app.ico                 程序及托盘图标
├─ scripts/
│  ├─ build-installer.ps1     安装版构建脚本
│  └─ build-portable.ps1      免安装版构建脚本
├─ src/
│  ├─ main.js                 主进程、后台服务、托盘和窗口管理
│  ├─ preload.js              安全 IPC 接口
│  ├─ renderer.html           客户端界面结构
│  ├─ renderer.css            界面样式
│  └─ renderer.js             界面交互和状态展示
├─ package.json               项目和打包配置
├─ README.md                  项目简介
└─ USAGE.md                   本操作指南
```

## 12. 完整卸载

免安装版：

1. 从系统托盘菜单点击“退出”。
2. 确认 3080 端口不再被本客户端启动的进程占用。
3. 删除客户端 EXE。

安装版：

1. 从系统托盘菜单点击“退出”。
2. 打开 Windows“设置 > 应用 > 已安装的应用”。
3. 找到 `DeepSeek Harness` 并卸载。

卸载桌面客户端不会自动卸载系统中的 Node.js。
