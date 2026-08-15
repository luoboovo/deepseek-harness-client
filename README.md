# DeepSeek Harness 现代桌面客户端

这是 Electron 版本，目标是双击打开一个现代 Windows 桌面窗口，并在窗口内部直接嵌入 DeepSeek Harness，不再跳转系统浏览器。

完整的安装、使用、打包和故障排查说明见 [USAGE.md](./USAGE.md)。

底层启动命令：

```powershell
npx @deepseek-ai/dsh web
```

## 功能

- 双击客户端后自动启动 DeepSeek Harness。
- 使用 Electron `<webview>` 在客户端窗口内部展示 `http://127.0.0.1:3080`。
- 现代轻量外壳 UI：自定义标题栏、状态提示、加载页、日志面板。
- 支持最小化到系统托盘。
- 退出时会杀掉本客户端启动的 `npx` / Node 子进程。
- 如果没有 Node.js / npx，会弹窗并提供 Node.js 下载入口。
- 使用 `assets/app.ico` 作为程序图标。

## 开发运行

先安装 Node.js LTS：

```text
https://nodejs.org/zh-cn/download
```

然后在项目目录运行：

```powershell
npm install
npm start
```

如果 Electron 下载被 GitHub 卡住，可以直接用项目里的脚本，它已经配置好镜像和本地缓存：

```powershell
.\scripts\build-portable.ps1
```

## 打包免安装版

```powershell
.\scripts\build-portable.ps1
```

输出文件在：

```text
release\DeepSeekHarnessModern-1.0.0.exe
```

## 打包安装包

```powershell
.\scripts\build-installer.ps1
```

如果想同时打包免安装版和安装包：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run dist:all
```

目标电脑仍然需要安装 Node.js，因为 DeepSeek Harness 本身通过 `npx` 启动。
