import { contextBridge, ipcRenderer } from 'electron'

type UpdateStatusPayload = {
  status: string
  detail?: string
}

type TerminalSessionSummaryPayload = {
  id: string
  title: string
  terminalTitle: string | null
  appKind: 'terminal' | 'codex' | 'claude'
  appIconDataUrl: string | null
  cwd: string
  shell: string
  createdAt: number
  status: 'running' | 'exited'
  pid: number | null
  exitCode: number | null
  signal: number | null
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
  listLocalBranches: () => ipcRenderer.invoke('git:list-local-branches'),
  listPendingPushCommits: () => ipcRenderer.invoke('git:list-pending-push-commits'),
  getWorkingTreeChanges: () => ipcRenderer.invoke('git:get-working-tree-changes'),
  stageWorkingTreeFile: (filePath: string) => ipcRenderer.invoke('git:stage-working-tree-file', filePath),
  unstageWorkingTreeFile: (filePath: string) => ipcRenderer.invoke('git:unstage-working-tree-file', filePath),
  commitWorkingTree: (message: string) => ipcRenderer.invoke('git:commit-working-tree', message),
  generateCommitMessage: () => ipcRenderer.invoke('git:generate-commit-message'),
  discardWorkingTreeFile: (filePath: string) => ipcRenderer.invoke('git:discard-working-tree-file', filePath),
  runPrimaryBranchAction: () => ipcRenderer.invoke('git:run-primary-branch-action'),
  switchBranch: (branchName: string) => ipcRenderer.invoke('git:switch-branch', branchName),
  createAndSwitchBranch: (branchName: string) =>
    ipcRenderer.invoke('git:create-and-switch-branch', branchName),
  listTerminalSessions: () => ipcRenderer.invoke('terminals:list'),
  createTerminalSession: (options?: { cwd?: string }) => ipcRenderer.invoke('terminals:create', options),
  closeTerminalSession: (sessionId: string) => ipcRenderer.invoke('terminals:close', sessionId),
  getTerminalSessionSnapshot: (sessionId: string) => ipcRenderer.invoke('terminals:snapshot', sessionId),
  writeTerminalSession: (sessionId: string, data: string) =>
    ipcRenderer.send('terminals:write', sessionId, data),
  resizeTerminalSession: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.send('terminals:resize', sessionId, cols, rows),
  onTerminalSessionData: (
    callback: (payload: { sessionId: string; sequence: number; data: string }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { sessionId: string; sequence: number; data: string },
    ) => {
      callback(payload)
    }

    ipcRenderer.on('terminals:data', listener)

    return () => {
      ipcRenderer.removeListener('terminals:data', listener)
    }
  },
  onTerminalSessionsChanged: (callback: (sessions: TerminalSessionSummaryPayload[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, sessions: TerminalSessionSummaryPayload[]) => {
      callback(sessions)
    }

    ipcRenderer.on('terminals:sessions-changed', listener)

    return () => {
      ipcRenderer.removeListener('terminals:sessions-changed', listener)
    }
  },
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
