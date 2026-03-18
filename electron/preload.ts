import { contextBridge, ipcRenderer } from 'electron'

type UpdateStatusPayload = {
  status: string
  detail?: string
}

contextBridge.exposeInMainWorld('desktop', {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getUpdateStatus: () => ipcRenderer.invoke('updates:get-status'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateStatus: (callback: (payload: UpdateStatusPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: UpdateStatusPayload) => {
      callback(payload)
    }

    ipcRenderer.on('updates:status', listener)

    return () => {
      ipcRenderer.removeListener('updates:status', listener)
    }
  },
})
