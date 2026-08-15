const { contextBridge, ipcRenderer } = require('electron');

function listen(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('deepseekClient', {
  getState: () => ipcRenderer.invoke('harness:get-state'),
  restart: () => ipcRenderer.invoke('harness:restart'),
  openNodeDownload: () => ipcRenderer.invoke('harness:open-node-download'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  hideToTray: () => ipcRenderer.invoke('window:hide-to-tray'),
  quit: () => ipcRenderer.invoke('app:quit'),
  onStatus: (callback) => listen('harness-status', callback),
  onReady: (callback) => listen('harness-ready', callback),
  onLog: (callback) => listen('harness-log', callback),
  onLogHistory: (callback) => listen('harness-log-history', callback)
});
