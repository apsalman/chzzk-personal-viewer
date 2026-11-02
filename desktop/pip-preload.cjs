const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('miniPlayer', {
  onSource: callback => ipcRenderer.on('pip:source', (_event, config) => callback(config)),
  restore: () => ipcRenderer.send('pip:restore'),
  gesture: (action, kind) => ipcRenderer.send('pip:gesture', action, kind),
  playhead: epoch => ipcRenderer.send('pip:playhead', epoch)
});
