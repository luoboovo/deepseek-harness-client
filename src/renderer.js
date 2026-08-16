const api = window.deepseekClient;

const statusPill = document.getElementById('statusPill');
const statusTitle = document.getElementById('statusTitle');
const loadingView = document.getElementById('loadingView');
const loadingTitle = document.getElementById('loadingTitle');
const loadingDetail = document.getElementById('loadingDetail');
const harnessView = document.getElementById('harnessView');
const logPanel = document.getElementById('logPanel');
const logOutput = document.getElementById('logOutput');
const syncPanel = document.getElementById('syncPanel');
const syncHeaderStatus = document.getElementById('syncHeaderStatus');
const lanEnabledToggle = document.getElementById('lanEnabledToggle');
const lanAddressList = document.getElementById('lanAddressList');
const pairingCode = document.getElementById('pairingCode');
const lanPort = document.getElementById('lanPort');
const lanClientCount = document.getElementById('lanClientCount');
const syncError = document.getElementById('syncError');
const pairQr = document.getElementById('pairQr');
const qrPlaceholder = document.getElementById('qrPlaceholder');
const pairLink = document.getElementById('pairLink');

const restartButton = document.getElementById('restartButton');
const retryButton = document.getElementById('retryButton');
const nodeButton = document.getElementById('nodeButton');
const logButton = document.getElementById('logButton');
const syncButton = document.getElementById('syncButton');
const clearLogButton = document.getElementById('clearLogButton');
const closeLogButton = document.getElementById('closeLogButton');
const minimizeButton = document.getElementById('minimizeButton');
const maximizeButton = document.getElementById('maximizeButton');
const closeButton = document.getElementById('closeButton');
const closeSyncButton = document.getElementById('closeSyncButton');
const rotateCodeButton = document.getElementById('rotateCodeButton');
const copyCodeButton = document.getElementById('copyCodeButton');
const copyPairLinkButton = document.getElementById('copyPairLinkButton');

let currentUrl = null;
let lanState = null;
let qrRequestId = 0;

function setStatus(status) {
  if (!status) return;
  statusPill.classList.remove('ready', 'error', 'pending');
  statusPill.classList.add(status.tone || 'pending');
  statusTitle.textContent = status.title || '正在准备';
  loadingTitle.textContent = status.title || '正在准备';
  loadingDetail.textContent = status.detail || '';

  if (status.tone === 'error') {
    loadingView.classList.remove('hidden');
    harnessView.classList.remove('visible');
  }
}

function setReady(payload) {
  currentUrl = payload?.url || null;
  if (!currentUrl) {
    harnessView.classList.remove('visible');
    loadingView.classList.remove('hidden');
    return;
  }

  if (harnessView.getAttribute('src') !== currentUrl) {
    harnessView.setAttribute('src', currentUrl);
  }
  harnessView.classList.add('visible');
  loadingView.classList.add('hidden');
}

function appendLog(line) {
  logOutput.textContent += String(line);
  logOutput.scrollTop = logOutput.scrollHeight;
}

function toggleLogs() {
  const open = !logPanel.classList.contains('open');
  if (open) closeSync();
  logPanel.classList.toggle('open', open);
  logPanel.setAttribute('aria-hidden', String(!open));
}

function closeLogs() {
  logPanel.classList.remove('open');
  logPanel.setAttribute('aria-hidden', 'true');
}

function toggleSync() {
  const open = !syncPanel.classList.contains('open');
  if (open) closeLogs();
  syncPanel.classList.toggle('open', open);
  syncPanel.setAttribute('aria-hidden', String(!open));
}

function closeSync() {
  syncPanel.classList.remove('open');
  syncPanel.setAttribute('aria-hidden', 'true');
}

function copyWithFeedback(value, button) {
  if (!value) return;
  api.copyLanText(value).then(() => {
    const previous = button.textContent;
    button.textContent = '已复制';
    window.setTimeout(() => {
      button.textContent = previous;
    }, 1200);
  });
}

async function updatePairingQr(state) {
  const requestId = ++qrRequestId;
  const firstAddress = Array.isArray(state.addresses) ? state.addresses[0] : null;
  const url = state.status === 'ready' ? firstAddress?.pairUrl : null;
  pairLink.textContent = url || '尚未生成链接';
  copyPairLinkButton.disabled = !url;
  if (!url) {
    pairQr.hidden = true;
    pairQr.removeAttribute('src');
    qrPlaceholder.hidden = false;
    qrPlaceholder.textContent = state.status === 'error' ? '二维码生成失败' : '开启后生成二维码';
    return;
  }

  qrPlaceholder.hidden = false;
  qrPlaceholder.textContent = '正在生成';
  pairQr.hidden = true;
  const dataUrl = await api.createLanQr(url);
  if (requestId !== qrRequestId) return;
  if (!dataUrl) {
    qrPlaceholder.textContent = '二维码生成失败';
    return;
  }
  pairQr.src = dataUrl;
  pairQr.hidden = false;
  qrPlaceholder.hidden = true;
}

function setLanState(state) {
  if (!state) return;
  lanState = state;
  lanEnabledToggle.checked = Boolean(state.enabled);
  lanEnabledToggle.disabled = state.status === 'starting';
  pairingCode.textContent = state.pairingCode || '--------';
  lanPort.textContent = String(state.port || 3081);
  const mobileClients = Number(state.mobileClients) || 0;
  lanClientCount.textContent = `${mobileClients} 个活动连接`;
  syncError.hidden = !state.error;
  syncError.textContent = state.error || '';

  const statusLabels = {
    ready: mobileClients > 0 ? '手机端数据已同步' : '已开启，等待手机连接',
    starting: '正在开启',
    disabled: '已关闭',
    error: '启动失败'
  };
  syncHeaderStatus.textContent = statusLabels[state.status] || '正在检查网络';
  updatePairingQr(state);

  lanAddressList.replaceChildren();
  const addresses = Array.isArray(state.addresses) ? state.addresses : [];
  if (addresses.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'address-empty';
    empty.textContent = '未检测到可用的局域网地址';
    lanAddressList.append(empty);
    return;
  }

  addresses.forEach(({ address, endpoint }) => {
    const row = document.createElement('div');
    row.className = 'address-row';
    const value = document.createElement('code');
    value.textContent = address;
    const copyButton = document.createElement('button');
    copyButton.className = 'copy-command';
    copyButton.textContent = '复制';
    copyButton.addEventListener('click', () => copyWithFeedback(address, copyButton));
    row.append(value, copyButton);
    lanAddressList.append(row);
  });
}

restartButton.addEventListener('click', () => api.restart());
retryButton.addEventListener('click', () => api.restart());
nodeButton.addEventListener('click', () => api.openNodeDownload());
logButton.addEventListener('click', toggleLogs);
syncButton.addEventListener('click', toggleSync);
closeLogButton.addEventListener('click', closeLogs);
closeSyncButton.addEventListener('click', closeSync);
lanEnabledToggle.addEventListener('change', () => api.setLanEnabled(lanEnabledToggle.checked));
rotateCodeButton.addEventListener('click', () => api.rotateLanCode().then(setLanState));
copyCodeButton.addEventListener('click', () => copyWithFeedback(lanState?.pairingCode, copyCodeButton));
copyPairLinkButton.addEventListener('click', () => {
  const firstAddress = Array.isArray(lanState?.addresses) ? lanState.addresses[0] : null;
  copyWithFeedback(firstAddress?.pairUrl, copyPairLinkButton);
});
clearLogButton.addEventListener('click', () => {
  logOutput.textContent = '';
});
minimizeButton.addEventListener('click', () => api.minimize());
maximizeButton.addEventListener('click', () => api.maximize());
closeButton.addEventListener('click', () => api.hideToTray());

harnessView.addEventListener('did-start-loading', () => {
  statusTitle.textContent = '正在载入界面';
});

harnessView.addEventListener('did-finish-load', () => {
  statusTitle.textContent = 'DeepSeek Harness 已就绪';
});

harnessView.addEventListener('did-fail-load', (event) => {
  if (event.errorCode === -3) return;
  loadingView.classList.remove('hidden');
  loadingTitle.textContent = '界面载入失败';
  loadingDetail.textContent = `${event.errorDescription || '无法载入'}：${currentUrl || ''}`;
});

api.onStatus(setStatus);
api.onReady(setReady);
api.onLog(appendLog);
api.onLogHistory((logs) => {
  logOutput.textContent = Array.isArray(logs) ? logs.join('') : '';
  logOutput.scrollTop = logOutput.scrollHeight;
});
api.onLanState(setLanState);

api.getState().then((state) => {
  setStatus(state.status);
  if (Array.isArray(state.logs)) {
    logOutput.textContent = state.logs.join('');
  }
  setReady(state.ready);
  setLanState(state.lan);
});
