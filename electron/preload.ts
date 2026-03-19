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

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: async (patch: Record<string, unknown>) => {
    await ipcRenderer.invoke('settings:set', patch)
    ;(globalThis as unknown as EventTarget).dispatchEvent(
      new CustomEvent('desktop:settings-changed', { detail: patch }),
    )
  },
  getServicesStatus: () => ipcRenderer.invoke('dev5:status'),
  startService: (serviceName: string) => ipcRenderer.invoke('dev5:start-service', serviceName),
  stopService: (serviceName: string) => ipcRenderer.invoke('dev5:stop-service', serviceName),
  stopAllServices: () => ipcRenderer.invoke('dev5:stop-all'),
  getServiceLogs: (serviceName: string, lineCount?: number) =>
    ipcRenderer.invoke('dev5:logs', serviceName, lineCount),
  getCurrentBranch: () => ipcRenderer.invoke('git:get-current-branch'),
  openServicesInEditor: (editor?: 'zed' | 'vscode' | 'cursor') =>
    ipcRenderer.invoke('services:open-editor', editor),
  getEditorInfo: (editor?: 'zed' | 'vscode' | 'cursor') =>
    ipcRenderer.invoke('services:get-editor-info', editor),
  getAvailableEditors: () => ipcRenderer.invoke('services:get-available-editors'),

  // Services folder
  selectFolder: () => ipcRenderer.invoke('services:select-folder'),
  validateServicesFolder: (folderPath: string) =>
    ipcRenderer.invoke('services:validate-folder', folderPath),
})
