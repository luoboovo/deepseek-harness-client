const api = window.deepseekClient;

const statusPill = document.getElementById('statusPill');
const statusTitle = document.getElementById('statusTitle');
const loadingView = document.getElementById('loadingView');
const loadingTitle = document.getElementById('loadingTitle');
const loadingDetail = document.getElementById('loadingDetail');
const harnessView = document.getElementById('harnessView');
const logPanel = document.getElementById('logPanel');
const logOutput = document.getElementById('logOutput');

const restartButton = document.getElementById('restartButton');
const retryButton = document.getElementById('retryButton');
const nodeButton = document.getElementById('nodeButton');
const logButton = document.getElementById('logButton');
const clearLogButton = document.getElementById('clearLogButton');
const closeLogButton = document.getElementById('closeLogButton');
const minimizeButton = document.getElementById('minimizeButton');
const maximizeButton = document.getElementById('maximizeButton');
const closeButton = document.getElementById('closeButton');

let currentUrl = null;

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
  logPanel.classList.toggle('open', open);
  logPanel.setAttribute('aria-hidden', String(!open));
}

function closeLogs() {
  logPanel.classList.remove('open');
  logPanel.setAttribute('aria-hidden', 'true');
}

restartButton.addEventListener('click', () => api.restart());
retryButton.addEventListener('click', () => api.restart());
nodeButton.addEventListener('click', () => api.openNodeDownload());
logButton.addEventListener('click', toggleLogs);
closeLogButton.addEventListener('click', closeLogs);
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

api.getState().then((state) => {
  setStatus(state.status);
  if (Array.isArray(state.logs)) {
    logOutput.textContent = state.logs.join('');
  }
  setReady(state.ready);
});
