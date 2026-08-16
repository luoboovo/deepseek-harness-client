const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const httpProxy = require('http-proxy');

const COOKIE_NAME = 'dsh_lan_pair';
const MOBILE_COOKIE_NAME = 'dsh_mobile_ui';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const MAX_INDEX_BYTES = 2 * 1024 * 1024;

const MOBILE_ASSETS = new Map([
  ['/mobile-compat.js', ['mobile-compat.js', 'text/javascript; charset=utf-8']],
  ['/mobile-adapt.css', ['mobile-adapt.css', 'text/css; charset=utf-8']],
  ['/mobile-adapt.js', ['mobile-adapt.js', 'text/javascript; charset=utf-8']]
]);

function injectMobileAssets(source) {
  const compatScript = '    <script src="/mobile-compat.js"></script>';
  const withCompat = /<head(?:\s[^>]*)?>/i.test(source)
    ? source.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}\n${compatScript}`)
    : `${compatScript}\n${source}`;

  return withCompat
    .replace('</head>', '    <link rel="stylesheet" href="/mobile-adapt.css">\n  </head>')
    .replace('</body>', '    <script src="/mobile-adapt.js"></script>\n  </body>');
}

function createPairingCode() {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return code;
}

function isValidCode(value) {
  return typeof value === 'string'
    && value.length === CODE_LENGTH
    && [...value].every((character) => CODE_ALPHABET.includes(character));
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readCookies(header = '') {
  return header.split(';').reduce((cookies, item) => {
    const separator = item.indexOf('=');
    if (separator < 1) return cookies;
    cookies[item.slice(0, separator).trim()] = item.slice(separator + 1).trim();
    return cookies;
  }, {});
}

function getLanAddresses() {
  const addresses = new Set();
  for (const details of Object.values(os.networkInterfaces())) {
    for (const address of details || []) {
      if (address.family !== 'IPv4' || address.internal || address.address.startsWith('169.254.')) continue;
      addresses.add(address.address);
    }
  }

  return [...addresses].sort((left, right) => {
    const priority = (value) => {
      if (value.startsWith('192.168.')) return 0;
      if (value.startsWith('10.')) return 1;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(value)) return 2;
      return 3;
    };
    return priority(left) - priority(right) || left.localeCompare(right);
  });
}

function unauthorizedPage() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>需要配对</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, "Microsoft YaHei UI", sans-serif; }
      * { box-sizing: border-box; }
      body { min-height: 100dvh; margin: 0; display: grid; place-items: center; padding: 20px; background: #f2f5f8; color: #182033; }
      main { width: min(420px, 100%); padding: 28px; border: 1px solid #dce2e9; border-radius: 8px; background: #fff; box-shadow: 0 18px 48px rgba(28, 40, 58, .12); }
      strong { display: block; margin-bottom: 8px; font-size: 20px; }
      p { margin: 0; color: #657184; line-height: 1.6; }
    </style>
  </head>
  <body><main><strong>需要局域网配对</strong><p>请扫描电脑端二维码，或在 Android 客户端填写电脑地址和配对码。</p></main></body>
</html>`;
}

function createLanBridge({ target, port, settingsPath, onLog = () => {}, onStateChange = () => {} }) {
  let server = null;
  let status = 'disabled';
  let error = '';
  const sockets = new Set();
  const proxySockets = new Set();
  const proxy = httpProxy.createProxyServer({
    target,
    changeOrigin: true,
    autoRewrite: true,
    ws: true,
    xfwd: true
  });

  let settings = { enabled: true, pairingCode: createPairingCode() };
  try {
    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    settings.enabled = stored.enabled !== false;
    if (isValidCode(stored.pairingCode)) settings.pairingCode = stored.pairingCode;
  } catch {
    // First run uses generated defaults.
  }

  function persistSettings() {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  }

  function getState() {
    const addresses = getLanAddresses().map((address) => {
      const endpoint = `http://${address}:${port}`;
      return {
        address,
        endpoint,
        pairUrl: `${endpoint}/pair?token=${settings.pairingCode}`,
        mobileUrl: `${endpoint}/?mobile=1&token=${settings.pairingCode}`
      };
    });
    return {
      enabled: settings.enabled,
      status,
      error,
      port,
      pairingCode: settings.pairingCode,
      addresses,
      activeWebSockets: proxySockets.size,
      mobileClients: proxySockets.size
    };
  }

  function emitState() {
    onStateChange(getState());
  }

  function hasValidCookie(request) {
    return safeEqual(readCookies(request.headers.cookie)[COOKIE_NAME], settings.pairingCode);
  }

  function hasValidToken(request) {
    const requestUrl = new URL(request.url || '/', 'http://bridge.local');
    return safeEqual(requestUrl.searchParams.get('token'), settings.pairingCode);
  }

  function isMobileRequest(request, requestUrl) {
    const cookies = readCookies(request.headers.cookie);
    return requestUrl.searchParams.get('mobile') === '1'
      || cookies[MOBILE_COOKIE_NAME] === '1'
      || String(request.headers['user-agent'] || '').includes('DeepSeekHarnessMobile/');
  }

  function authorizeHttp(request, response) {
    const requestUrl = new URL(request.url || '/', 'http://bridge.local');
    const providedCode = requestUrl.searchParams.get('token');
    if (safeEqual(providedCode, settings.pairingCode)) {
      requestUrl.searchParams.delete('token');
      const cookies = [
        `${COOKIE_NAME}=${settings.pairingCode}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`
      ];
      if (isMobileRequest(request, requestUrl)) {
        cookies.push(`${MOBILE_COOKIE_NAME}=1; Path=/; SameSite=Strict; Max-Age=2592000`);
      }
      response.statusCode = 302;
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Set-Cookie', cookies);
      response.setHeader('Location', `${requestUrl.pathname}${requestUrl.search}` || '/');
      response.end();
      return false;
    }
    return hasValidCookie(request);
  }

  function sendAsset(response, filename, contentType) {
    try {
      const content = fs.readFileSync(path.join(__dirname, filename));
      response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
      response.end(content);
    } catch (assetError) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('移动端资源加载失败。');
      onLog(`移动端资源加载失败：${assetError.message}\n`);
    }
  }

  function sendIcon(response) {
    try {
      const content = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.ico'));
      response.writeHead(200, { 'Content-Type': 'image/x-icon', 'Cache-Control': 'public, max-age=86400' });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  }

  function sendPairPage(request, response) {
    const hostHeader = String(request.headers.host || `127.0.0.1:${port}`);
    const requestedHost = hostHeader.replace(/:\d+$/, '');
    const host = net.isIPv4(requestedHost) ? requestedHost : '127.0.0.1';
    const endpoint = `${host}:${port}`;
    const appLink = `deepseekharness://connect?host=${encodeURIComponent(host)}&port=${port}&code=${settings.pairingCode}`;
    const browserLink = `http://${endpoint}/?mobile=1&token=${settings.pairingCode}`;
    try {
      const template = fs.readFileSync(path.join(__dirname, 'mobile-pair.html'), 'utf8');
      const content = template
        .replaceAll('{{APP_LINK}}', appLink.replaceAll('&', '&amp;'))
        .replaceAll('{{BROWSER_LINK}}', browserLink.replaceAll('&', '&amp;'))
        .replaceAll('{{HOST}}', host)
        .replaceAll('{{CODE}}', settings.pairingCode);
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; img-src 'self'; style-src 'unsafe-inline'; script-src 'none'"
      });
      response.end(content);
    } catch (pairError) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('配对页面加载失败。');
      onLog(`配对页面加载失败：${pairError.message}\n`);
    }
  }

  function sendMobileIndex(request, response) {
    const upstreamRequest = http.get(new URL('/', target), {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': request.headers['accept-language'] || 'zh-CN',
        'user-agent': request.headers['user-agent'] || 'DeepSeekHarnessMobile/1.3'
      }
    }, (upstreamResponse) => {
      const chunks = [];
      let received = 0;
      upstreamResponse.on('data', (chunk) => {
        received += chunk.length;
        if (received > MAX_INDEX_BYTES) {
          upstreamRequest.destroy(new Error('Harness 首页响应过大'));
          return;
        }
        chunks.push(chunk);
      });
      upstreamResponse.on('end', () => {
        if (response.writableEnded) return;
        const source = Buffer.concat(chunks).toString('utf8');
        const content = injectMobileAssets(source);
        response.writeHead(upstreamResponse.statusCode || 200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Length': Buffer.byteLength(content)
        });
        response.end(content);
      });
    });
    upstreamRequest.once('error', (indexError) => {
      if (response.writableEnded) return;
      response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('DeepSeek Harness 暂时不可用，请稍后重试。');
      onLog(`移动端首页加载失败：${indexError.message}\n`);
    });
  }

  function handleHttpRequest(request, response) {
    if (!authorizeHttp(request, response)) {
      if (!response.writableEnded) {
        response.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(unauthorizedPage());
      }
      return;
    }

    const requestUrl = new URL(request.url || '/', 'http://bridge.local');
    if (requestUrl.pathname === '/pair' || requestUrl.pathname === '/pair/') {
      sendPairPage(request, response);
      return;
    }
    if (requestUrl.pathname === '/app-icon.ico') {
      sendIcon(response);
      return;
    }
    const asset = MOBILE_ASSETS.get(requestUrl.pathname);
    if (asset) {
      sendAsset(response, asset[0], asset[1]);
      return;
    }
    if (request.method === 'GET' && requestUrl.pathname === '/' && isMobileRequest(request, requestUrl)) {
      sendMobileIndex(request, response);
      return;
    }
    proxy.web(request, response);
  }

  proxy.on('proxyReqWs', (proxyRequest) => {
    proxyRequest.setHeader('origin', target);
  });

  proxy.on('proxyReq', (proxyRequest, request) => {
    if (request.headers.origin) proxyRequest.setHeader('origin', target);
  });

  proxy.on('open', (proxySocket) => {
    proxySockets.add(proxySocket);
    emitState();
    proxySocket.once('close', () => {
      proxySockets.delete(proxySocket);
      emitState();
    });
  });

  proxy.on('error', (proxyError, request, responseOrSocket) => {
    onLog(`局域网同步代理错误：${proxyError.message}\n`);
    if (responseOrSocket && typeof responseOrSocket.writeHead === 'function') {
      if (!responseOrSocket.headersSent) {
        responseOrSocket.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      responseOrSocket.end('DeepSeek Harness 暂时不可用，请稍后重试。');
    } else if (responseOrSocket && typeof responseOrSocket.destroy === 'function') {
      responseOrSocket.destroy();
    }
  });

  async function start() {
    settings.enabled = true;
    persistSettings();
    if (server?.listening) {
      status = 'ready';
      error = '';
      emitState();
      return getState();
    }

    status = 'starting';
    error = '';
    emitState();
    server = http.createServer(handleHttpRequest);

    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });

    server.on('upgrade', (request, socket, head) => {
      if (!hasValidCookie(request) && !hasValidToken(request)) {
        socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        return;
      }
      proxy.ws(request, socket, head);
    });

    try {
      await new Promise((resolve, reject) => {
        const handleError = (listenError) => reject(listenError);
        server.once('error', handleError);
        server.listen(port, '0.0.0.0', () => {
          server.removeListener('error', handleError);
          resolve();
        });
      });
      status = 'ready';
      error = '';
      const endpoints = getState().addresses.map(({ endpoint }) => endpoint).join('、');
      onLog(`手机数据同步已开启：${endpoints || `端口 ${port}`}\n`);
    } catch (listenError) {
      status = 'error';
      error = listenError.code === 'EADDRINUSE'
        ? `${port} 端口已被其他程序占用。`
        : listenError.message;
      onLog(`手机数据同步启动失败：${error}\n`);
      server = null;
    }
    emitState();
    return getState();
  }

  function disconnectClients() {
    for (const socket of proxySockets) socket.destroy();
    proxySockets.clear();
  }

  async function closeServer({ disable }) {
    if (disable) {
      settings.enabled = false;
      persistSettings();
    }
    disconnectClients();
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
      server = null;
    }
    status = 'disabled';
    error = '';
    if (disable) onLog('手机数据同步已关闭。\n');
    emitState();
    return getState();
  }

  async function stop() {
    return closeServer({ disable: true });
  }

  async function shutdown() {
    return closeServer({ disable: false });
  }

  function rotatePairingCode() {
    settings.pairingCode = createPairingCode();
    persistSettings();
    disconnectClients();
    emitState();
    return getState();
  }

  return {
    getState,
    start,
    stop,
    shutdown,
    rotatePairingCode,
    isEnabled: () => settings.enabled
  };
}

module.exports = { createLanBridge, injectMobileAssets };
