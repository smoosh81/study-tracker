const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  version: () => ipcRenderer.invoke('app:version'),
  notes: () => ipcRenderer.invoke('app:notes'),
  social: (op, args) => ipcRenderer.invoke('social', op, args),
  backupBeforeUpgrade: (data, fromVersion) => ipcRenderer.invoke('data:backupBeforeUpgrade', { data, fromVersion }),
  saveSync: (data) => ipcRenderer.sendSync('data:saveSync', data),
  exportFile: (opts) => ipcRenderer.invoke('file:export', opts),
  importFile: () => ipcRenderer.invoke('file:import'),
  setTitleBar: (color, symbol) => ipcRenderer.send('theme:titlebar', { color, symbol }),
  openMini: () => ipcRenderer.send('mini:open'),
  closeMini: () => ipcRenderer.send('mini:close'),
  sendMiniState: (s) => ipcRenderer.send('mini:state', s),
  miniCommand: (c) => ipcRenderer.send('mini:command', c),
  miniResize: (w, h) => ipcRenderer.send('mini:resize', { w, h }),
  miniCorner: () => ipcRenderer.send('mini:corner'),
  on: (channel, fn) => {
    const ok = ['mini:state', 'mini:command', 'mini:closed', 'update:state'];
    if (ok.includes(channel)) ipcRenderer.on(channel, (_e, ...args) => fn(...args));
  },
  updateState: () => ipcRenderer.invoke('update:state'),
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  restartToUpdate: () => ipcRenderer.invoke('update:restart'),
  trimMemory: () => { try { webFrame.clearCache(); } catch (e) {} },
  platform: process.platform,
});
