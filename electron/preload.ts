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

type AgentThreadPayload = {
  id: string
  title: string
  sessionTitle: string | null
  agentKind: 'codex' | 'claude'
  launchCommand: string
  cwd: string
  settings: {
    model: string | null
    reasoningEffort: string | null
    mode: string | null
  }
  sessionId: string | null
  createdAt: number
  updatedAt: number
  status: 'draft' | 'connecting' | 'ready' | 'running' | 'error' | 'disconnected'
  errorMessage: string | null
  agentName: string | null
  agentVersion: string | null
  availableCommands: Array<{
    name: string
    description: string | null
    inputHint: string | null
  }>
  pendingPermission: {
    toolCallId: string
    title: string
    kind: string | null
    status: string | null
    locations: string[]
    rawInput: string | null
    options: Array<{
      optionId: string
      name: string
      kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'
    }>
  } | null
  items: Array<Record<string, unknown>>
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
  listAgentThreads: () => ipcRenderer.invoke('agents:list'),
  listAgentOptions: (agentKind: 'codex' | 'claude') => ipcRenderer.invoke('agents:options', agentKind),
  createAgentThread: (agentKind: 'codex' | 'claude') =>
    ipcRenderer.invoke('agents:create', agentKind),
  updateAgentThread: (
    threadId: string,
    patch: Partial<{
      title: string
      settings: Partial<{
        model: string | null
        reasoningEffort: string | null
        mode: string | null
      }>
    }>,
  ) => ipcRenderer.invoke('agents:update', threadId, patch),
  deleteAgentThread: (threadId: string) => ipcRenderer.invoke('agents:delete', threadId),
  connectAgentThread: (threadId: string) => ipcRenderer.invoke('agents:connect', threadId),
  disconnectAgentThread: (threadId: string) => ipcRenderer.invoke('agents:disconnect', threadId),
  sendAgentPrompt: (
    threadId: string,
    prompt: {
      text: string
      images: Array<{
        mimeType: string
        dataUrl: string
      }>
    },
  ) =>
    ipcRenderer.invoke('agents:send-prompt', threadId, prompt),
  cancelAgentPrompt: (threadId: string) => ipcRenderer.invoke('agents:cancel', threadId),
  resolveAgentPermission: (threadId: string, optionId: string | null) =>
    ipcRenderer.invoke('agents:resolve-permission', threadId, optionId),
  onAgentThreadsChanged: (callback: (threads: AgentThreadPayload[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, threads: AgentThreadPayload[]) => {
      callback(threads)
    }

    ipcRenderer.on('agents:threads-changed', listener)

    return () => {
      ipcRenderer.removeListener('agents:threads-changed', listener)
    }
  },
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
