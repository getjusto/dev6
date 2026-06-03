import { contextBridge, ipcRenderer } from 'electron'

type UpdateStatusPayload = {
  status: string
  detail?: string
}

type Dev5ServiceStatusPayload = {
  dir_name: string
  service_name: string
  port: number | null
  desired_state?: 'on' | 'off' | null
  status: 'on' | 'off' | 'error' | 'loadingOn' | 'loadingOff'
  managed: boolean
  pid: number | null
  port_open: boolean
  http_status_code: number | null
  http_error: string | null
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
  onServicesStatusChanged: (callback: (services: Dev5ServiceStatusPayload[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, services: Dev5ServiceStatusPayload[]) => {
      callback(services)
    }

    ipcRenderer.on('dev5:status-changed', listener)

    return () => {
      ipcRenderer.removeListener('dev5:status-changed', listener)
    }
  },
  startService: (serviceName: string) => ipcRenderer.invoke('dev5:start-service', serviceName),
  stopService: (serviceName: string) => ipcRenderer.invoke('dev5:stop-service', serviceName),
  restartService: (serviceName: string) => ipcRenderer.invoke('dev5:restart-service', serviceName),
  stopAllServices: () => ipcRenderer.invoke('dev5:stop-all'),
  getServiceLogs: (serviceName: string, lineCount?: number) =>
    ipcRenderer.invoke('dev5:logs', serviceName, lineCount),
  openServicesInEditor: (editor?: 'zed' | 'vscode' | 'cursor') =>
    ipcRenderer.invoke('services:open-editor', editor),
  openServicesFileInEditor: (filePath: string, editor?: 'zed' | 'vscode' | 'cursor') =>
    ipcRenderer.invoke('services:open-file-in-editor', filePath, editor),
  getEditorInfo: (editor?: 'zed' | 'vscode' | 'cursor') =>
    ipcRenderer.invoke('services:get-editor-info', editor),
  getAvailableEditors: () => ipcRenderer.invoke('services:get-available-editors'),

  // Services folder
  selectFolder: () => ipcRenderer.invoke('services:select-folder'),
  validateServicesFolder: (folderPath: string) =>
    ipcRenderer.invoke('services:validate-folder', folderPath),
})
