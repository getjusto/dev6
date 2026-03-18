/// <reference types="vite/client" />

interface AppInfo {
  appName: string
  version: string
  platform: string
  arch: string
  isPackaged: boolean
}

interface UpdateStatus {
  status: string
  detail?: string
}

interface DesktopApi {
  getAppInfo: () => Promise<AppInfo>
  getUpdateStatus: () => Promise<UpdateStatus>
  checkForUpdates: () => Promise<{ ok: boolean; skipped?: boolean }>
  downloadUpdate: () => Promise<{ ok: boolean; skipped?: boolean }>
  installUpdate: () => Promise<void>
  onUpdateStatus: (callback: (payload: UpdateStatus) => void) => () => void
}

declare global {
  interface Window {
    desktop: DesktopApi
  }
}

export {}
