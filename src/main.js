const { app, BrowserWindow, Menu, Tray, clipboard, dialog, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const QRCode = require('qrcode');
const { createLanBridge } = require('./lan-bridge');

const APP_NAME = 'DeepSeek Harness';
const HOST = '127.0.0.1';
const PORT = 3080;
const HARNESS_URL = `http://${HOST}:${PORT}`;
const NODE_DOWNLOAD_URL = 'https://nodejs.org/zh-cn/download';
const COMMAND_LABEL = 'npx @deepseek-ai/dsh web';
const LAN_PORT = Number(process.env.DSH_LAN_PORT) || 3081;

let mainWindow = null;
let tray = null;
let dshProcess = null;
let externalServer = false;
let isQuitting = false;
let startInProgress = false;
let readyUrl = null;
let lanBridge = null;
let lastStatus = {
  tone: 'pending',
  title: '正在准备',
  detail: '客户端正在初始化 DeepSeek Harness。'
};
const logBuffer = [];

function assetPath(...segments) {
  return path.join(__dirname, '..', ...segments);
}

function pushLog(line) {
  const text = String(line);
  logBuffer.push(text);
  while (logBuffer.length > 300) logBuffer.shift();
  send('harness-log', text);
}

function setStatus(tone, title, detail = '') {
  lastStatus = { tone, title, detail };
  send('harness-status', lastStatus);
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function initializeLanBridge() {
  lanBridge = createLanBridge({
    target: HARNESS_URL,
    port: LAN_PORT,
    settingsPath: path.join(app.getPath('userData'), 'lan-settings.json'),
    onLog: pushLog,
    onStateChange: (state) => send('lan-state', state)
  });
  if (lanBridge.isEnabled()) lanBridge.start();
}

function findExecutable(names) {
  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  if (process.platform === 'win32') {
    const programFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
      .filter(Boolean)
      .map((dir) => path.join(dir, 'nodejs'));
    pathEntries.unshift(...programFiles);
  }

  for (const dir of pathEntries) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch {
        // Keep searching other PATH entries.
      }
    }
  }
  return null;
}

function hasNodeRuntime() {
  return {
    node: findExecutable(process.platform === 'win32' ? ['node.exe', 'node.cmd', 'node'] : ['node']),
    npx: findExecutable(process.platform === 'win32' ? ['npx.cmd', 'npx.exe', 'npx'] : ['npx'])
  };
}

function isPortOpen() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: HOST, port: PORT, timeout: 450 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForHarness(timeoutMs = 150000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen()) return true;
    if (dshProcess && dshProcess.exitCode !== null) return false;
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  return false;
}

async function showNodeMissingDialog(missingParts) {
  setStatus('error', '缺少 Node.js / npx', '请先安装 Node.js LTS，然后重新打开客户端。');
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'error',
    title: '缺少运行环境',
    message: `没有找到 ${missingParts.join('、')}`,
    detail: 'DeepSeek Harness 需要通过 npx 启动。请安装 Node.js LTS，安装完成后重新打开这个客户端。',
    buttons: ['打开下载页面', '关闭'],
    defaultId: 0,
    cancelId: 1
  });
  if (result.response === 0) {
    shell.openExternal(NODE_DOWNLOAD_URL);
  }
}

function spawnNpx(npxPath) {
  const env = {
    ...process.env,
    npm_config_yes: 'true',
    NO_COLOR: '1'
  };

  if (process.platform === 'win32') {
    const comspec = process.env.ComSpec || 'cmd.exe';
    return spawn(comspec, ['/d', '/c', 'call', npxPath, '--yes', '@deepseek-ai/dsh', 'web'], {
      cwd: app.getPath('userData'),
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }

  return spawn(npxPath, ['--yes', '@deepseek-ai/dsh', 'web'], {
    cwd: app.getPath('userData'),
    env,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function startHarness() {
  if (startInProgress) return;
  if (dshProcess && dshProcess.exitCode === null) {
    setStatus('ready', 'DeepSeek Harness 已在运行', HARNESS_URL);
    sendReady();
    return;
  }

  startInProgress = true;
  readyUrl = null;
  send('harness-ready', null);
  setStatus('pending', '正在检查运行环境', COMMAND_LABEL);

  const runtime = hasNodeRuntime();
  const missing = [];
  if (!runtime.node) missing.push('Node.js');
  if (!runtime.npx) missing.push('npx');
  if (missing.length > 0) {
    startInProgress = false;
    await showNodeMissingDialog(missing);
    return;
  }

  if (await isPortOpen()) {
    externalServer = true;
    readyUrl = HARNESS_URL;
    pushLog(`检测到 ${HARNESS_URL} 已有服务，直接载入客户端窗口。\n`);
    setStatus('ready', '已连接到现有 DeepSeek Harness', HARNESS_URL);
    sendReady();
    startInProgress = false;
    return;
  }

  externalServer = false;
  setStatus('pending', '正在启动 DeepSeek Harness', COMMAND_LABEL);
  pushLog(`$ ${COMMAND_LABEL}\n`);

  try {
    dshProcess = spawnNpx(runtime.npx);
  } catch (error) {
    setStatus('error', '启动失败', error.message);
    pushLog(`启动失败：${error.stack || error.message}\n`);
    startInProgress = false;
    return;
  }

  dshProcess.stdout.on('data', (chunk) => pushLog(chunk.toString()));
  dshProcess.stderr.on('data', (chunk) => pushLog(chunk.toString()));
  dshProcess.once('exit', (code, signal) => {
    const message = `\nDeepSeek Harness 已退出，代码：${code ?? 'null'}，信号：${signal ?? 'null'}\n`;
    pushLog(message);
    if (!isQuitting && !readyUrl) {
      const recent = logBuffer.slice(-40).join('');
      if (recent.includes('EADDRINUSE') || recent.includes('address already in use')) {
        setStatus('error', '3080 端口被占用', '请关闭占用端口的程序后点击重启。');
      } else {
        setStatus('error', 'DeepSeek Harness 启动失败', '请查看日志获取更多信息。');
      }
    }
  });

  const ok = await waitForHarness();
  if (ok) {
    readyUrl = HARNESS_URL;
    setStatus('ready', 'DeepSeek Harness 已启动', HARNESS_URL);
    sendReady();
  } else if (dshProcess && dshProcess.exitCode !== null) {
    setStatus('error', 'DeepSeek Harness 启动失败', '后台进程已经退出，请查看右侧运行日志。');
  } else if (!isQuitting) {
    setStatus('error', '启动超时', 'DeepSeek Harness 没有在预期时间内响应。');
  }
  startInProgress = false;
}

function sendReady() {
  send('harness-ready', readyUrl ? { url: readyUrl } : null);
}

async function stopHarness() {
  if (!dshProcess || dshProcess.exitCode !== null) {
    dshProcess = null;
    return;
  }

  const pid = dshProcess.pid;
  pushLog('正在关闭后台 DeepSeek Harness 进程...\n');

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      });
      killer.once('exit', resolve);
      killer.once('error', resolve);
    });
  } else {
    dshProcess.kill('SIGTERM');
  }

  dshProcess = null;
}

async function restartHarness() {
  setStatus('pending', '正在重启', '正在关闭旧进程并重新启动 DeepSeek Harness。');
  readyUrl = null;
  send('harness-ready', null);
  if (!externalServer) await stopHarness();
  externalServer = false;
  await new Promise((resolve) => setTimeout(resolve, 650));
  startHarness();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    frame: false,
    show: false,
    backgroundColor: '#f6f8fc',
    icon: assetPath('assets', 'app.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.once('did-finish-load', () => {
    send('harness-status', lastStatus);
    send('harness-log-history', logBuffer);
    sendReady();
    send('lan-state', lanBridge?.getState() || null);
    startHarness();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hideToTray();
    }
  });
}

function createTray() {
  if (tray) return;
  tray = new Tray(assetPath('assets', 'app.ico'));
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开窗口', click: showWindow },
    { label: '重启 DeepSeek Harness', click: restartHarness },
    { type: 'separator' },
    { label: '退出', click: quitApp }
  ]));
  tray.on('click', showWindow);
}

function hideToTray() {
  createTray();
  if (mainWindow) mainWindow.hide();
}

function showWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

async function quitApp() {
  isQuitting = true;
  if (lanBridge?.isEnabled()) await lanBridge.shutdown();
  if (!externalServer) await stopHarness();
  if (tray) tray.destroy();
  app.quit();
}

function wireIpc() {
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:hide-to-tray', () => hideToTray());
  ipcMain.handle('app:quit', () => quitApp());
  ipcMain.handle('harness:restart', () => restartHarness());
  ipcMain.handle('harness:open-node-download', () => shell.openExternal(NODE_DOWNLOAD_URL));
  ipcMain.handle('harness:get-state', () => ({
    status: lastStatus,
    logs: logBuffer,
    ready: readyUrl ? { url: readyUrl } : null,
    lan: lanBridge?.getState() || null
  }));
  ipcMain.handle('lan:set-enabled', (_event, enabled) => (
    enabled ? lanBridge?.start() : lanBridge?.stop()
  ));
  ipcMain.handle('lan:rotate-code', async () => {
    if (!lanBridge) return null;
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: '更换配对码',
      message: '确定要更换局域网配对码吗？',
      detail: '已连接的手机会断开，需要使用新配对码重新连接。',
      buttons: ['更换', '取消'],
      defaultId: 1,
      cancelId: 1
    });
    return result.response === 0 ? lanBridge.rotatePairingCode() : lanBridge.getState();
  });
  ipcMain.handle('lan:copy-text', (_event, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });
  ipcMain.handle('lan:create-qr', async (_event, pairUrl) => {
    const allowedUrls = (lanBridge?.getState().addresses || []).map(({ pairUrl: value }) => value);
    if (!allowedUrls.includes(pairUrl)) return null;
    return QRCode.toDataURL(pairUrl, {
      width: 256,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#172033', light: '#FFFFFF' }
    });
  });
}

function isLocalHarnessUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === HOST && String(parsed.port || '80') === String(PORT);
  } catch {
    return false;
  }
}

function secureWebviews() {
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview' && typeof contents.setBackgroundThrottling === 'function') {
      contents.setBackgroundThrottling(false);
    }

    contents.setWindowOpenHandler(({ url }) => {
      if (isLocalHarnessUrl(url)) return { action: 'allow' };
      shell.openExternal(url);
      return { action: 'deny' };
    });

    contents.on('will-navigate', (event, url) => {
      if (contents.getType() === 'webview' && !isLocalHarnessUrl(url)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });
  });
}

const allowMultipleInstances = process.env.DSH_ALLOW_MULTIPLE === '1';
const gotLock = allowMultipleInstances || app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  if (!allowMultipleInstances) app.on('second-instance', showWindow);
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    wireIpc();
    secureWebviews();
    initializeLanBridge();
    createMainWindow();
    createTray();
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', (event) => {
  if (!isQuitting) event.preventDefault();
});
