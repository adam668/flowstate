import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // IPC handlers will be registered here by other tasks
})
