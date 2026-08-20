/**
 * Preload for the progress window — exposes a sandbox-safe listener for
 * status updates pushed from the main process.
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('progressAPI', {
  onSet: (cb) => {
    ipcRenderer.on('progress:set', (_event, data) => cb(data))
  },
})
