const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');

// 小鲸鱼挂件内置资源服务。
// 客户端把挂件的渲染资源（脚本/图片/音效）打进安装包，并在这个本机端口上提供，
// 这样即使 DSH web profile 没有安装 dsh-whale-widget 插件，桌面窗口里也能显示小鲸鱼。
// 余额/用量/尺寸配置（/dsh-whale/balance.json、/dsh-whale/size.json）仍由 DSH 服务提供，
// 插件缺失时挂件会优雅降级显示提示，而鲸鱼本体与交互始终可用。

const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg'
};

const ROUTES = {
  '/dsh-whale/widget.js': ['widget.js'],
  '/dsh-whale/image.png': ['DSniang1.png'],
  // press/release 各支持两套音效：?set=duck -> 小黄鸭，?set=fx1 -> 音效1
  '/dsh-whale/sound/press.mp3': ['Ya1.mp3', 'D1.mp3'],
  '/dsh-whale/sound/release.mp3': ['Ya2.mp3', 'D2.mp3']
};

function soundSetFromUrl(url) {
  try {
    const query = String(url || '').split('?')[1] || '';
    const match = /(?:^|&)set=([^&]+)/.exec(query);
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

function createWhaleServer({ port = 3089, assetsDir, onLog = () => {} }) {
  let server = null;

  function sendAsset(response, requestUrl) {
    const route = ROUTES[requestUrl.pathname];
    if (!route) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not Found');
      return;
    }
    let file = route[0];
    if (route.length > 1) {
      const set = soundSetFromUrl(requestUrl.search);
      file = set === 'fx1' ? route[1] : route[0];
    }
    const fullPath = path.join(assetsDir, file);
    try {
      const content = fs.readFileSync(fullPath);
      response.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      });
      response.end(content);
    } catch (error) {
      onLog(`小鲸鱼资源读取失败（${file}）：${error.message}\n`);
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('whale asset unavailable');
    }
  }

  function handleRequest(request, response) {
    let requestUrl;
    try {
      requestUrl = new URL(request.url || '/', 'http://whale.local');
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Method Not Allowed');
      return;
    }
    if (ROUTES[requestUrl.pathname]) {
      sendAsset(response, requestUrl);
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not Found');
  }

  async function start() {
    if (server?.listening) return;
    server = http.createServer(handleRequest);
    await new Promise((resolve, reject) => {
      const handleError = (error) => reject(error);
      server.once('error', handleError);
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', handleError);
        onLog(`小鲸鱼内置资源服务已启动：http://127.0.0.1:${port}\n`);
        resolve();
      });
    });
  }

  async function shutdown() {
    if (!server) return;
    await new Promise((resolve) => server.close(() => resolve()));
    server = null;
  }

  return { start, shutdown, port };
}

module.exports = { createWhaleServer };
