import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { execFile, execSync, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import * as pty from '@homebridge/node-pty-prebuilt-multiarch'

const isDev = !app.isPackaged
let updateState = 'idle'
const execFileAsync = promisify(execFile)
let commandEnvPromise: Promise<NodeJS.ProcessEnv> | null = null
let mainWindow: BrowserWindow | null = null
const MAX_TERMINAL_BUFFER_CHARS = 2_000_000
const LOG_TAIL_CHUNK_BYTES = 64 * 1024
const TERMINAL_CWD_REFRESH_MS = 2000
const GIT_FETCH_THROTTLE_MS = 60_000
const GIT_COMMAND_TIMEOUT_MS = 15_000
const EDITOR_APP_NAMES = {
  zed: 'Zed',
  vscode: 'Visual Studio Code',
  cursor: 'Cursor',
} as const
type TerminalSessionStatus = 'running' | 'exited'
type TerminalSessionAppKind = 'terminal' | 'codex' | 'claude'
type GitWorkingTreeFileStatus =
  | 'added'
  | 'changed'
  | 'conflicted'
  | 'copied'
  | 'deleted'
  | 'modified'
  | 'renamed'
  | 'untracked'
type GitBranchSyncAction = 'none' | 'pull' | 'push'
type GitBranchRecord = {
  name: string
  current: boolean
}
type GitPendingPushCommitRecord = {
  hash: string
  shortHash: string
  subject: string
  authorName: string
  committedAt: string
}
type GitBranchSyncState = {
  action: GitBranchSyncAction
  ahead: number
  behind: number
  hasUpstream: boolean
  upstream: string | null
}
type GitWorkingTreeFileRecord = {
  path: string
  previousPath: string | null
  indexStatus: string
  workingTreeStatus: string
  status: GitWorkingTreeFileStatus
  additions: number
  deletions: number
  diff: string
}
type GitWorkingTreeSnapshot = {
  branch: string | null
  repositoryPath: string
  additions: number
  deletions: number
  sync: GitBranchSyncState
  files: GitWorkingTreeFileRecord[]
}
type GeneratedCommitMessage = {
  subject: string
  body: string
}
type ClaudeStructuredOutputResult<T> = {
  is_error?: boolean
  result?: string
  structured_output?: T
}

type TerminalSessionRecord = {
  id: string
  title: string
  baseTitle: string
  terminalTitle: string | null
  appKind: TerminalSessionAppKind
  appIconDataUrl: string | null
  cwd: string
  shell: string
  createdAt: number
  status: TerminalSessionStatus
  pid: number | null
  sequence: number
  buffer: string
  exitCode: number | null
  signal: number | null
  ptyProcess: pty.IPty | null
}

const terminalSessions = new Map<string, TerminalSessionRecord>()
const terminalAppIconCache = new Map<TerminalSessionAppKind, string | null>()
let terminalLabelCounter = 0
let terminalCwdInterval: NodeJS.Timeout | null = null
let gitFetchPromise: Promise<void> | null = null
let gitServicesQueue: Promise<void> = Promise.resolve()
let lastGitFetchAttemptAt = 0
const EDITOR_APP_BUNDLES = {
  zed: 'Zed.app',
  vscode: 'Visual Studio Code.app',
  cursor: 'Cursor.app',
} as const
const EDITOR_ICON_NAMES = {
  zed: ['Zed.icns', 'Document.icns'],
  vscode: ['Code.icns', 'Visual Studio Code.icns'],
  cursor: ['Cursor.icns'],
} as const
const TERMINAL_APP_BUNDLES = {
  codex: 'Codex.app',
  claude: 'Claude.app',
} as const
const TERMINAL_TITLE_PATTERN = /\u001B\](?:0|2);([\s\S]*?)(?:\u0007|\u001B\\)/g
const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
const GENERATED_COMMIT_MESSAGE_JSON_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    subject: {
      type: 'string',
      description:
        'Plain-text Spanish git commit subject in a single line. Do not use markdown, quotes, or backticks.',
    },
    body: {
      type: 'string',
      description:
        'Plain-text Spanish git commit body. Use an empty string when a body is unnecessary. Do not use markdown, quotes, or backticks.',
    },
  },
  required: ['subject', 'body'],
  additionalProperties: false,
})

// --- Settings persistence ---
const settingsPath = path.join(app.getPath('userData'), 'settings.json')

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  } catch {
    return {}
  }
}

function writeSettings(patch: Record<string, unknown>) {
  const current = readSettings()
  fs.writeFileSync(settingsPath, JSON.stringify({ ...current, ...patch }, null, 2))
}

function getServicesPath(): string {
  const settings = readSettings()
  const p = settings.servicesPath as string | undefined
  if (!p) throw new Error('servicesPath not configured')
  return p
}

function getServiceLogPath(serviceName: string): string {
  if (!serviceName || serviceName.includes('/') || serviceName.includes('\\')) {
    throw new Error('Invalid service name.')
  }

  return path.join(getServicesPath(), '.local', 'logs', `${serviceName}.log`)
}

async function readLastLinesFromFile(filePath: string, lineCount: number): Promise<string | null> {
  if (lineCount <= 0) {
    return ''
  }

  let fileHandle: fs.promises.FileHandle | null = null

  try {
    fileHandle = await fs.promises.open(filePath, 'r')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  }

  try {
    const { size } = await fileHandle.stat()
    if (size <= 0) {
      return ''
    }

    let position = size
    let newlineCount = 0
    const chunks: Buffer[] = []

    while (position > 0 && newlineCount <= lineCount) {
      const bytesToRead = Math.min(LOG_TAIL_CHUNK_BYTES, position)
      position -= bytesToRead

      const buffer = Buffer.allocUnsafe(bytesToRead)
      const { bytesRead } = await fileHandle.read(buffer, 0, bytesToRead, position)
      const chunk = buffer.subarray(0, bytesRead)
      chunks.unshift(chunk)

      for (let index = 0; index < bytesRead; index += 1) {
        if (chunk[index] === 0x0a) {
          newlineCount += 1
        }
      }
    }

    const text = Buffer.concat(chunks).toString('utf-8')
    const endsWithNewline = text.endsWith('\n')
    const lines = text.split(/\r?\n/)

    if (endsWithNewline) {
      lines.pop()
    }

    const tail = lines.slice(-lineCount).join('\n')

    if (!tail) {
      return endsWithNewline ? '\n' : ''
    }

    return endsWithNewline ? `${tail}\n` : tail
  } finally {
    await fileHandle.close()
  }
}

function withMacPathFallback(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const home = env.HOME ?? app.getPath('home')
  const pathEntries = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    path.join(home, 'Library/pnpm'),
    path.join(home, '.local/bin'),
    path.join(home, '.cargo/bin'),
    path.join(home, '.bun/bin'),
  ]

  if (env.PATH) {
    pathEntries.push(...env.PATH.split(':'))
  }

  return {
    ...env,
    PATH: [...new Set(pathEntries.filter(Boolean))].join(':'),
  }
}

async function loadCommandEnv(): Promise<NodeJS.ProcessEnv> {
  const baseEnv = withMacPathFallback({ ...process.env })
  const shellPath = baseEnv.SHELL || '/bin/zsh'
  const sentinel = '__DEV6_ENV_START__'

  try {
    const { stdout } = await execFileAsync(
      shellPath,
      ['-ilc', `printf '${sentinel}\\0'; env -0`],
      {
        encoding: 'utf-8',
        env: baseEnv,
        maxBuffer: 5 * 1024 * 1024,
      },
    )

    const envStart = stdout.indexOf(`${sentinel}\u0000`)
    if (envStart === -1) {
      return baseEnv
    }

    const shellEnv = stdout
      .slice(envStart + sentinel.length + 1)
      .split('\u0000')
      .filter(Boolean)
      .reduce<NodeJS.ProcessEnv>((acc, entry) => {
        const separatorIndex = entry.indexOf('=')
        if (separatorIndex === -1) {
          return acc
        }
        const key = entry.slice(0, separatorIndex)
        const value = entry.slice(separatorIndex + 1)
        acc[key] = value
        return acc
      }, {})

    return withMacPathFallback({
      ...baseEnv,
      ...shellEnv,
    })
  } catch {
    return baseEnv
  }
}

async function getCommandEnv(): Promise<NodeJS.ProcessEnv> {
  if (!commandEnvPromise) {
    commandEnvPromise = loadCommandEnv()
  }

  return commandEnvPromise
}

async function openServicesInEditor(editor: keyof typeof EDITOR_APP_NAMES) {
  const servicesPath = getServicesPath()
  const appName = EDITOR_APP_NAMES[editor] ?? EDITOR_APP_NAMES.zed

  await execFileAsync('open', ['-a', appName, servicesPath], {
    encoding: 'utf-8',
  })
}

async function openServicesFileInEditor(filePath: string, editor?: keyof typeof EDITOR_APP_NAMES) {
  const servicesPath = getServicesPath()
  const resolvedFilePath = resolveRepositoryFilePath(servicesPath, filePath)
  const configuredEditor = readSettings().preferredEditor
  const selectedEditor =
    editor ??
    (configuredEditor === 'zed' || configuredEditor === 'vscode' || configuredEditor === 'cursor'
      ? configuredEditor
      : 'zed')
  const appName = EDITOR_APP_NAMES[selectedEditor] ?? EDITOR_APP_NAMES.zed

  await execFileAsync('open', ['-a', appName, resolvedFilePath], {
    encoding: 'utf-8',
  })
}

async function findEditorAppPath(
  editor: keyof typeof EDITOR_APP_NAMES,
): Promise<string | null> {
  const bundleName = EDITOR_APP_BUNDLES[editor] ?? EDITOR_APP_BUNDLES.zed
  return findAppBundlePath(bundleName)
}

async function findAppBundlePath(bundleName: string): Promise<string | null> {
  const directCandidates = [
    path.join('/Applications', bundleName),
    path.join(app.getPath('home'), 'Applications', bundleName),
  ]

  for (const candidate of directCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  try {
    const { stdout } = await execFileAsync('mdfind', [`kMDItemFSName == "${bundleName}"c`], {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
    })

    const resolvedPath = stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.endsWith(bundleName))

    return resolvedPath ?? null
  } catch {
    return null
  }
}

async function getAppBundleIconDataUrl(bundlePath: string): Promise<string | null> {
  try {
    const icon = await app.getFileIcon(bundlePath, { size: 'normal' })
    return icon.isEmpty() ? null : icon.toDataURL()
  } catch {
    return null
  }
}

async function getTerminalAppIconDataUrl(appKind: TerminalSessionAppKind): Promise<string | null> {
  if (appKind === 'terminal' || appKind === 'codex' || appKind === 'claude') {
    return null
  }

  if (terminalAppIconCache.has(appKind)) {
    return terminalAppIconCache.get(appKind) ?? null
  }

  const bundleName = TERMINAL_APP_BUNDLES[appKind]
  const bundlePath = bundleName ? await findAppBundlePath(bundleName) : null
  const iconDataUrl = bundlePath ? await getAppBundleIconDataUrl(bundlePath) : null
  terminalAppIconCache.set(appKind, iconDataUrl)
  return iconDataUrl
}

function extractTerminalTitle(data: string): string | null {
  let nextTitle: string | null = null

  for (const match of data.matchAll(TERMINAL_TITLE_PATTERN)) {
    const resolvedTitle = match[1]?.trim()
    if (resolvedTitle) {
      nextTitle = resolvedTitle
    }
  }

  return nextTitle
}

async function getEditorInfo(editor: keyof typeof EDITOR_APP_NAMES) {
  const label = EDITOR_APP_NAMES[editor] ?? EDITOR_APP_NAMES.zed
  const editorPath = await findEditorAppPath(editor)

  if (!editorPath) {
    return { label, iconDataUrl: null }
  }

  try {
    const resourcesPath = path.join(editorPath, 'Contents', 'Resources')
    const iconCandidates = EDITOR_ICON_NAMES[editor] ?? []
    const explicitIconPath = iconCandidates
      .map((iconName) => path.join(resourcesPath, iconName))
      .find((iconPath) => fs.existsSync(iconPath))

    if (explicitIconPath?.endsWith('.icns')) {
      const iconSetDir = path.join(
        os.tmpdir(),
        `dev6-${editor}-iconset`,
      )

      try {
        fs.rmSync(iconSetDir, { recursive: true, force: true })
      } catch {
        // noop
      }

      await execFileAsync('iconutil', ['-c', 'iconset', explicitIconPath, '-o', iconSetDir], {
        encoding: 'utf-8',
      })

      const pngCandidates = [
        'icon_32x32@2x.png',
        'icon_128x128.png',
        'icon_32x32.png',
        'icon_16x16@2x.png',
      ]
      const resolvedPngPath = pngCandidates
        .map((iconName) => path.join(iconSetDir, iconName))
        .find((iconPath) => fs.existsSync(iconPath))

      if (resolvedPngPath) {
        const iconBuffer = fs.readFileSync(resolvedPngPath)
        return {
          label,
          iconDataUrl: `data:image/png;base64,${iconBuffer.toString('base64')}`,
        }
      }
    }

    const icon = explicitIconPath
      ? nativeImage.createFromPath(explicitIconPath)
      : await app.getFileIcon(editorPath, { size: 'normal' })

    return { label, iconDataUrl: icon.isEmpty() ? null : icon.toDataURL() }
  } catch {
    return { label, iconDataUrl: null }
  }
}

async function getAvailableEditors() {
  const editors = (Object.keys(EDITOR_APP_NAMES) as Array<keyof typeof EDITOR_APP_NAMES>)
  const results = await Promise.all(
    editors.map(async (editor) => {
      const editorPath = await findEditorAppPath(editor)
      return editorPath ? editor : null
    }),
  )

  return results.filter((editor): editor is keyof typeof EDITOR_APP_NAMES => editor !== null)
}

function getTerminalSummary(session: TerminalSessionRecord) {
  return {
    id: session.id,
    title: session.terminalTitle || session.title,
    terminalTitle: session.terminalTitle,
    appKind: session.appKind,
    appIconDataUrl: session.appIconDataUrl,
    cwd: session.cwd,
    shell: session.shell,
    createdAt: session.createdAt,
    status: session.status,
    pid: session.pid,
    exitCode: session.exitCode,
    signal: session.signal,
  }
}

function listTerminalSessions() {
  return [...terminalSessions.values()]
    .sort((left, right) => left.createdAt - right.createdAt)
    .map(getTerminalSummary)
}

function sendTerminalSessionsChanged() {
  const sessions = listTerminalSessions()

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('terminals:sessions-changed', sessions)
  }
}

function sendTerminalData(sessionId: string, sequence: number, data: string) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('terminals:data', { sessionId, sequence, data })
  }
}

function appendTerminalBuffer(buffer: string, chunk: string) {
  if (buffer.length + chunk.length <= MAX_TERMINAL_BUFFER_CHARS) {
    return buffer + chunk
  }

  const nextBuffer = buffer + chunk
  const trimIndex = nextBuffer.length - MAX_TERMINAL_BUFFER_CHARS
  const newlineIndex = nextBuffer.indexOf('\n', trimIndex)

  return nextBuffer.slice(newlineIndex === -1 ? trimIndex : newlineIndex + 1)
}

function getShellLaunchArgs(shellPath: string) {
  const shellName = path.basename(shellPath)

  if (shellName === 'zsh' || shellName === 'bash') {
    return ['-il']
  }

  return ['-i']
}

function getDefaultTerminalCwd() {
  try {
    return getServicesPath()
  } catch {
    return app.getPath('home')
  }
}

function resolveTerminalCwd(candidate?: string) {
  const nextCwd = candidate && fs.existsSync(candidate) ? candidate : getDefaultTerminalCwd()

  try {
    const stat = fs.statSync(nextCwd)
    return stat.isDirectory() ? nextCwd : getDefaultTerminalCwd()
  } catch {
    return getDefaultTerminalCwd()
  }
}

async function resolveProcessCwd(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('lsof', ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'], {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
    })
    const cwdLine = stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('n'))

    return cwdLine ? cwdLine.slice(1) : null
  } catch {
    return null
  }
}

type ProcessSnapshot = {
  pid: number
  ppid: number
  command: string
  args: string
}

async function listProcesses(): Promise<ProcessSnapshot[]> {
  try {
    const { stdout } = await execFileAsync('ps', ['-ax', '-o', 'pid=,ppid=,comm=,args='], {
      encoding: 'utf-8',
      maxBuffer: 4 * 1024 * 1024,
    })

    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/)
        if (!match) {
          return null
        }

        return {
          pid: Number(match[1]),
          ppid: Number(match[2]),
          command: match[3],
          args: match[4] ?? '',
        }
      })
      .filter((entry): entry is ProcessSnapshot => entry !== null)
  } catch {
    return []
  }
}

function getTerminalPresentationForProcess(session: TerminalSessionRecord, processes: ProcessSnapshot[]) {
  if (typeof session.pid !== 'number') {
    return { title: session.baseTitle, appKind: 'terminal' as TerminalSessionAppKind }
  }

  const descendants: ProcessSnapshot[] = []
  const queue = [session.pid]

  while (queue.length > 0) {
    const parentPid = queue.shift()!
    for (const process of processes) {
      if (process.ppid !== parentPid) {
        continue
      }

      descendants.push(process)
      queue.push(process.pid)
    }
  }

  const match = [...descendants]
    .reverse()
    .find((process) => {
      const haystack = `${process.command} ${process.args}`.toLowerCase()
      return haystack.includes('codex') || haystack.includes('claude')
    })

  if (!match) {
    return { title: session.baseTitle, appKind: 'terminal' as TerminalSessionAppKind }
  }

  const haystack = `${match.command} ${match.args}`.toLowerCase()
  if (haystack.includes('codex')) {
    return { title: 'Codex', appKind: 'codex' as TerminalSessionAppKind }
  }

  if (haystack.includes('claude')) {
    return { title: 'Claude', appKind: 'claude' as TerminalSessionAppKind }
  }

  return { title: session.baseTitle, appKind: 'terminal' as TerminalSessionAppKind }
}

async function refreshTerminalMetadata() {
  const runningSessions = [...terminalSessions.values()].filter(
    (session) => session.status === 'running' && typeof session.pid === 'number',
  )

  if (runningSessions.length === 0) {
    return
  }

  let hasChanges = false
  const processes = await listProcesses()
  const cwdResults = await Promise.all(
    runningSessions.map(async (session) => {
      const cwd = await resolveProcessCwd(session.pid!)
      const presentation = getTerminalPresentationForProcess(session, processes)
      const appIconDataUrl = await getTerminalAppIconDataUrl(presentation.appKind)
      return { session, cwd, presentation, appIconDataUrl }
    }),
  )

  for (const result of cwdResults) {
    if (result.cwd && result.cwd !== result.session.cwd) {
      result.session.cwd = result.cwd
      hasChanges = true
    }

    if (result.presentation.title !== result.session.title) {
      result.session.title = result.presentation.title
      hasChanges = true
    }

    if (result.presentation.appKind !== result.session.appKind) {
      result.session.appKind = result.presentation.appKind
      hasChanges = true
    }

    if (result.appIconDataUrl !== result.session.appIconDataUrl) {
      result.session.appIconDataUrl = result.appIconDataUrl
      hasChanges = true
    }
  }

  if (hasChanges) {
    sendTerminalSessionsChanged()
  }
}

function stopTerminalCwdWatcher() {
  if (terminalCwdInterval) {
    clearInterval(terminalCwdInterval)
    terminalCwdInterval = null
  }
}

function ensureTerminalCwdWatcher() {
  const hasRunningSessions = [...terminalSessions.values()].some(
    (session) => session.status === 'running',
  )
  if (!hasRunningSessions) {
    stopTerminalCwdWatcher()
    return
  }

  if (!terminalCwdInterval) {
    terminalCwdInterval = setInterval(() => {
      void refreshTerminalMetadata()
    }, TERMINAL_CWD_REFRESH_MS)
  }
}

function disposeTerminalSession(session: TerminalSessionRecord) {
  if (session.ptyProcess) {
    try {
      session.ptyProcess.kill()
    } catch {
      // noop
    }
    session.ptyProcess = null
  }
}

function disposeAllTerminalSessions() {
  for (const session of terminalSessions.values()) {
    disposeTerminalSession(session)
  }

  terminalSessions.clear()
  stopTerminalCwdWatcher()
}

async function createTerminalSession(
  initialCwd?: string,
  backgroundAppearance: 'dark' | 'light' = 'dark',
) {
  const env = await getCommandEnv()
  const shellPath = env.SHELL || '/bin/zsh'
  const cwd = resolveTerminalCwd(initialCwd)
  const sessionId = `term_${crypto.randomUUID()}`
  const colorFgBg = backgroundAppearance === 'dark' ? '15;0' : '0;15'
  const ptyProcess = pty.spawn(shellPath, getShellLaunchArgs(shellPath), {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: {
      ...env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      COLORFGBG: colorFgBg,
      TERM_PROGRAM: 'dev6',
      TERM_PROGRAM_VERSION: app.getVersion(),
      TERM_PROGRAM_BACKGROUND: backgroundAppearance,
    },
  })

  const session: TerminalSessionRecord = {
    id: sessionId,
    title: `Terminal ${++terminalLabelCounter}`,
    baseTitle: `Terminal ${terminalLabelCounter}`,
    terminalTitle: null,
    appKind: 'terminal',
    appIconDataUrl: null,
    cwd,
    shell: shellPath,
    createdAt: Date.now(),
    status: 'running',
    pid: ptyProcess.pid,
    sequence: 0,
    buffer: '',
    exitCode: null,
    signal: null,
    ptyProcess,
  }

  terminalSessions.set(sessionId, session)

  ptyProcess.onData((data) => {
    const currentSession = terminalSessions.get(sessionId)
    if (!currentSession) {
      return
    }

    currentSession.buffer = appendTerminalBuffer(currentSession.buffer, data)
    currentSession.sequence += 1
    sendTerminalData(sessionId, currentSession.sequence, data)

    const terminalTitle = extractTerminalTitle(data)
    if (terminalTitle && terminalTitle !== currentSession.terminalTitle) {
      currentSession.terminalTitle = terminalTitle
      sendTerminalSessionsChanged()
    }
  })

  ptyProcess.onExit(({ exitCode, signal }) => {
    const currentSession = terminalSessions.get(sessionId)
    if (!currentSession) {
      return
    }

    currentSession.status = 'exited'
    currentSession.exitCode = exitCode
    currentSession.signal = signal ?? null
    currentSession.pid = null
    currentSession.ptyProcess = null
    ensureTerminalCwdWatcher()
    sendTerminalSessionsChanged()
  })

  ensureTerminalCwdWatcher()
  sendTerminalSessionsChanged()
  void refreshTerminalMetadata()

  return getTerminalSummary(session)
}

function closeTerminalSession(sessionId: string) {
  const session = terminalSessions.get(sessionId)
  if (!session) {
    return
  }

  terminalSessions.delete(sessionId)
  disposeTerminalSession(session)
  ensureTerminalCwdWatcher()
  sendTerminalSessionsChanged()
}

function getTerminalSessionSnapshot(sessionId: string) {
  const session = terminalSessions.get(sessionId)
  if (!session) {
    throw new Error('Terminal session not found.')
  }

  return {
    sequence: session.sequence,
    buffer: session.buffer,
    session: getTerminalSummary(session),
  }
}

function writeTerminalSession(sessionId: string, data: string) {
  const session = terminalSessions.get(sessionId)
  if (!session || !session.ptyProcess) {
    throw new Error('Terminal session is not running.')
  }

  session.ptyProcess.write(data)
}

function resizeTerminalSession(sessionId: string, cols: number, rows: number) {
  const session = terminalSessions.get(sessionId)
  if (!session || !session.ptyProcess || cols <= 0 || rows <= 0) {
    return
  }

  session.ptyProcess.resize(cols, rows)
}

async function callDev5(...args: string[]): Promise<unknown> {
  const servicesPath = getServicesPath()
  const env = await getCommandEnv()
  const { stdout } = await execFileAsync('yarn', ['--silent', 'dev5', ...args, '--json'], {
    cwd: servicesPath,
    encoding: 'utf-8',
    env,
    maxBuffer: 10 * 1024 * 1024,
  })
  return JSON.parse(stdout)
}

async function readDev5Logs(serviceName: string, lineCount: number): Promise<string> {
  const fileLogs = await readLastLinesFromFile(getServiceLogPath(serviceName), lineCount)
  if (fileLogs !== null) {
    return fileLogs
  }

  const servicesPath = getServicesPath()
  const env = await getCommandEnv()
  const { stdout } = await execFileAsync(
    'yarn',
    ['--silent', 'dev5', 'logs', serviceName, '-n', String(lineCount)],
    {
      cwd: servicesPath,
      encoding: 'utf-8',
      env,
      maxBuffer: 10 * 1024 * 1024,
    },
  )

  return stdout
}

async function stopAllServices(): Promise<unknown> {
  const services = await callDev5('status')

  if (!Array.isArray(services)) {
    throw new Error('Could not resolve services to stop.')
  }

  const serviceNames = services
    .map((service) =>
      typeof service === 'object' &&
      service !== null &&
      'service_name' in service &&
      typeof service.service_name === 'string'
        ? service.service_name
        : null,
    )
    .filter((serviceName): serviceName is string => Boolean(serviceName))

  if (serviceNames.length === 0) {
    return { ok: true, stopped: [] }
  }

  return callDev5('stop', serviceNames.join(','))
}

async function getCurrentServicesBranch(): Promise<string | null> {
  try {
    const branch = (await runReadOnlyGitInServices(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    return branch.length > 0 ? branch : null
  } catch {
    return null
  }
}

function enqueueGitServicesCommand<T>(run: () => Promise<T>) {
  const nextRun = gitServicesQueue.then(run, run)
  gitServicesQueue = nextRun.then(
    () => undefined,
    () => undefined,
  )

  return nextRun
}

async function execGitInServices(
  args: string[],
  options?: { encoding?: BufferEncoding },
): Promise<string> {
  const servicesPath = getServicesPath()
  const env = await getCommandEnv()
  const { stdout } = await execFileAsync('git', args, {
    cwd: servicesPath,
    env,
    encoding: options?.encoding ?? 'utf-8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: GIT_COMMAND_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  })

  return stdout
}

async function runGitInServices(
  args: string[],
  options?: { encoding?: BufferEncoding },
): Promise<string> {
  return enqueueGitServicesCommand(() => execGitInServices(args, options))
}

async function runReadOnlyGitInServices(
  args: string[],
  options?: { encoding?: BufferEncoding },
): Promise<string> {
  return execGitInServices(args, options)
}

function getCommandFailureMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback
  }

  const stdout =
    'stdout' in error && typeof error.stdout === 'string' ? error.stdout.trim() : ''
  const stderr =
    'stderr' in error && typeof error.stderr === 'string' ? error.stderr.trim() : ''

  return stderr || stdout || error.message || fallback
}

function parseGitBranchRecords(output: string): GitBranchRecord[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [headMarker, name] = line.split('\u0000')

      return {
        name: name?.trim() ?? '',
        current: headMarker === '*',
      }
    })
    .filter((branch): branch is GitBranchRecord => branch.name.length > 0)
    .sort((left, right) => {
      if (left.current !== right.current) {
        return left.current ? -1 : 1
      }

      return left.name.localeCompare(right.name)
    })
}

function parsePendingPushCommits(output: string): GitPendingPushCommitRecord[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, subject, authorName, committedAt] = line.split('\u0000')

      return {
        hash: hash?.trim() ?? '',
        shortHash: shortHash?.trim() ?? '',
        subject: subject?.trim() ?? '',
        authorName: authorName?.trim() ?? '',
        committedAt: committedAt?.trim() ?? '',
      }
    })
    .filter((commit): commit is GitPendingPushCommitRecord => commit.hash.length > 0)
}

function getGitBranchSyncAction(ahead: number, behind: number): GitBranchSyncAction {
  if (behind > 0) {
    return 'pull'
  }

  if (ahead > 0) {
    return 'push'
  }

  return 'none'
}

function parseGitBranchSyncState(output: string): GitBranchSyncState {
  let upstream: string | null = null
  let ahead = 0
  let behind = 0

  for (const line of output.split('\n')) {
    if (line.startsWith('# branch.upstream ')) {
      upstream = line.slice('# branch.upstream '.length).trim() || null
      continue
    }

    if (!line.startsWith('# branch.ab ')) {
      continue
    }

    const match = line.match(/^# branch\.ab \+(\d+) -(\d+)$/)
    if (!match) {
      continue
    }

    ahead = Number.parseInt(match[1] ?? '0', 10)
    behind = Number.parseInt(match[2] ?? '0', 10)
  }

  return {
    action: getGitBranchSyncAction(ahead, behind),
    ahead,
    behind,
    hasUpstream: upstream !== null,
    upstream,
  }
}

async function refreshGitTrackingRefs(force = false) {
  const now = Date.now()

  if (!force && now - lastGitFetchAttemptAt < GIT_FETCH_THROTTLE_MS) {
    return
  }

  if (gitFetchPromise) {
    return gitFetchPromise
  }

  lastGitFetchAttemptAt = now
  gitFetchPromise = runGitInServices(['fetch', '--quiet', '--prune'])
    .then(() => undefined)
    .finally(() => {
      gitFetchPromise = null
      lastGitFetchAttemptAt = Date.now()
    })

  return gitFetchPromise
}

async function getGitBranchSyncState(options?: { refreshRemote?: boolean }) {
  try {
    await refreshGitTrackingRefs(Boolean(options?.refreshRemote))
  } catch {
    // Fall back to the last known tracking refs when fetch fails.
  }

  const statusOutput = await runReadOnlyGitInServices(['status', '--porcelain=v2', '--branch'])
  return parseGitBranchSyncState(statusOutput)
}

async function listLocalGitBranches() {
  const output = await runReadOnlyGitInServices([
    'for-each-ref',
    '--format=%(HEAD)%00%(refname:short)',
    'refs/heads',
  ])

  return parseGitBranchRecords(output)
}

async function switchGitBranch(branchName: string, options?: { create?: boolean }) {
  const nextBranchName = branchName.trim()

  if (!nextBranchName) {
    throw new Error('Branch name is required.')
  }

  const existingBranches = await listLocalGitBranches()
  const currentBranch = existingBranches.find((branch) => branch.current)?.name ?? null

  if (!options?.create && currentBranch === nextBranchName) {
    return { ok: true, branch: nextBranchName }
  }

  try {
    await runGitInServices(['check-ref-format', '--branch', nextBranchName])
  } catch (error) {
    throw new Error(getCommandFailureMessage(error, 'Invalid branch name.'))
  }

  const commandArgs = options?.create
    ? ['switch', '--quiet', '-c', nextBranchName]
    : ['switch', '--quiet', nextBranchName]

  try {
    await runGitInServices(commandArgs)
  } catch {
    try {
      const mergeArgs = options?.create
        ? ['switch', '--quiet', '--merge', '-c', nextBranchName]
        : ['switch', '--quiet', '--merge', nextBranchName]
      await runGitInServices(mergeArgs)
    } catch (mergeError) {
      throw new Error(
        getCommandFailureMessage(
          mergeError,
          options?.create
            ? 'Could not create and switch branch.'
            : 'Could not switch branch.',
        ),
      )
    }
  }

  return { ok: true, branch: nextBranchName }
}

async function listPendingPushCommits() {
  const syncState = await getGitBranchSyncState()

  if (!syncState.hasUpstream || !syncState.upstream || syncState.ahead === 0) {
    return []
  }

  const output = await runReadOnlyGitInServices([
    'log',
    '--format=%H%x00%h%x00%s%x00%an%x00%cI',
    `${syncState.upstream}..HEAD`,
  ])

  return parsePendingPushCommits(output)
}

function getGitWorkingTreeStatus(
  indexStatus: string,
  workingTreeStatus: string,
  previousPath: string | null,
): GitWorkingTreeFileStatus {
  if (indexStatus === '?' && workingTreeStatus === '?') {
    return 'untracked'
  }

  if (indexStatus === 'U' || workingTreeStatus === 'U') {
    return 'conflicted'
  }

  if (indexStatus === 'R' || workingTreeStatus === 'R' || previousPath) {
    return 'renamed'
  }

  if (indexStatus === 'C' || workingTreeStatus === 'C') {
    return 'copied'
  }

  if (indexStatus === 'A') {
    return 'added'
  }

  if (indexStatus === 'D' || workingTreeStatus === 'D') {
    return 'deleted'
  }

  if (indexStatus === 'M' || workingTreeStatus === 'M') {
    return 'modified'
  }

  return 'changed'
}

function parseGitStatusEntries(output: string) {
  const entries = output.split('\u0000').filter(Boolean)
  const files: Array<{
    path: string
    previousPath: string | null
    indexStatus: string
    workingTreeStatus: string
  }> = []

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry.length < 3) {
      continue
    }

    const indexStatus = entry[0] ?? ' '
    const workingTreeStatus = entry[1] ?? ' '
    let path = entry.slice(3)
    let previousPath: string | null = null

    if (
      indexStatus === 'R' ||
      workingTreeStatus === 'R' ||
      indexStatus === 'C' ||
      workingTreeStatus === 'C'
    ) {
      previousPath = path
      path = entries[index + 1] ?? path
      index += 1
    }

    files.push({
      path,
      previousPath,
      indexStatus,
      workingTreeStatus,
    })
  }

  return files
}

function buildUntrackedFileDiff(repositoryPath: string, filePath: string): string {
  const absolutePath = path.join(repositoryPath, filePath)
  const stats = fs.statSync(absolutePath)
  const mode = stats.mode & 0o111 ? '100755' : '100644'
  const fileBuffer = fs.readFileSync(absolutePath)

  if (fileBuffer.includes(0)) {
    return [
      `diff --git a/${filePath} b/${filePath}`,
      `new file mode ${mode}`,
      'Binary file not shown.',
    ].join('\n')
  }

  const fileText = fileBuffer.toString('utf-8')
  const lines = fileText === '' ? [] : fileText.split('\n')
  const lastLineHasNewline = fileText.endsWith('\n')
  const effectiveLines = lastLineHasNewline ? lines.slice(0, -1) : lines
  const diffLines = [
    `diff --git a/${filePath} b/${filePath}`,
    `new file mode ${mode}`,
    '--- /dev/null',
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${effectiveLines.length} @@`,
    ...effectiveLines.map((line) => `+${line}`),
  ]

  if (!lastLineHasNewline) {
    diffLines.push('\\ No newline at end of file')
  }

  return diffLines.join('\n')
}

async function getGitDiffBaseRef(): Promise<string> {
  try {
    await runGitInServices(['rev-parse', '--verify', 'HEAD'])
    return 'HEAD'
  } catch {
    return EMPTY_TREE_HASH
  }
}

function countDiffLines(diff: string) {
  let additions = 0
  let deletions = 0

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      continue
    }

    if (line.startsWith('+')) {
      additions += 1
      continue
    }

    if (line.startsWith('-')) {
      deletions += 1
    }
  }

  return { additions, deletions }
}

function resolveRepositoryFilePath(repositoryPath: string, filePath: string) {
  const resolvedPath = path.resolve(repositoryPath, filePath)
  const relativePath = path.relative(repositoryPath, resolvedPath)

  if (path.isAbsolute(filePath) || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Invalid repository file path.')
  }

  return resolvedPath
}

async function discardWorkingTreeFile(filePath: string) {
  const repositoryPath = getServicesPath()
  const resolvedFilePath = resolveRepositoryFilePath(repositoryPath, filePath)
  const [statusOutput, diffBaseRef] = await Promise.all([
    runGitInServices(['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    getGitDiffBaseRef(),
  ])

  const statusEntry = parseGitStatusEntries(statusOutput).find((entry) => entry.path === filePath)

  if (!statusEntry) {
    return { ok: true }
  }

  const status = getGitWorkingTreeStatus(
    statusEntry.indexStatus,
    statusEntry.workingTreeStatus,
    statusEntry.previousPath,
  )

  if (status === 'untracked') {
    fs.rmSync(resolvedFilePath, { recursive: true, force: true })
    return { ok: true }
  }

  try {
    await runGitInServices(['restore', '--source', diffBaseRef, '--staged', '--worktree', '--', filePath])
  } catch {
    try {
      await runGitInServices(['restore', '--source', diffBaseRef, '--worktree', '--', filePath])
      await runGitInServices(['restore', '--staged', '--', filePath])
    } catch {
      await runGitInServices(['checkout', '--', filePath])
    }
  }

  return { ok: true }
}

async function stageWorkingTreeFile(filePath: string) {
  const repositoryPath = getServicesPath()
  resolveRepositoryFilePath(repositoryPath, filePath)
  await runGitInServices(['add', '-A', '--', filePath])
  return { ok: true }
}

async function unstageWorkingTreeFile(filePath: string) {
  const repositoryPath = getServicesPath()
  resolveRepositoryFilePath(repositoryPath, filePath)

  try {
    await runGitInServices(['restore', '--staged', '--', filePath])
  } catch {
    try {
      await runGitInServices(['reset', 'HEAD', '--', filePath])
    } catch {
      await runGitInServices(['rm', '--cached', '-r', '--ignore-unmatch', '--', filePath])
    }
  }

  return { ok: true }
}

async function commitWorkingTree(message: string) {
  const commitMessage = message.trim()

  if (!commitMessage) {
    throw new Error('Commit message is required.')
  }

  const tempFilePath = path.join(os.tmpdir(), `dev6-commit-${crypto.randomUUID()}.txt`)

  try {
    fs.writeFileSync(tempFilePath, commitMessage, 'utf-8')
    await runGitInServices(['commit', '-F', tempFilePath])
  } finally {
    try {
      fs.rmSync(tempFilePath, { force: true })
    } catch {
      // noop
    }
  }

  return { ok: true }
}

function isGeneratedCommitMessage(value: unknown): value is GeneratedCommitMessage {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>

  return typeof record.subject === 'string' && typeof record.body === 'string'
}

function normalizeGeneratedCommitMessageField(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/`+/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
}

function formatGeneratedCommitMessage(message: GeneratedCommitMessage) {
  const subject = normalizeGeneratedCommitMessageField(message.subject).replace(/\s+/g, ' ')
  const body = normalizeGeneratedCommitMessageField(message.body)

  if (!subject) {
    throw new Error('Claude returned an empty commit subject.')
  }

  return body ? `${subject}\n\n${body}` : subject
}

async function runPrimaryGitBranchAction() {
  const syncState = await getGitBranchSyncState({ refreshRemote: true })

  if (syncState.action === 'pull') {
    try {
      await runGitInServices(['pull', '--rebase=false', 'origin', '--prune'])
    } catch (error) {
      throw new Error(getCommandFailureMessage(error, 'Could not pull branch changes.'))
    }

    return { ok: true, action: 'pull' as const }
  }

  if (syncState.action === 'push') {
    try {
      await runGitInServices(['push'])
    } catch (error) {
      throw new Error(getCommandFailureMessage(error, 'Could not push branch changes.'))
    }

    return { ok: true, action: 'push' as const }
  }

  return { ok: true, action: 'none' as const }
}

async function generateCommitMessage() {
  const servicesPath = getServicesPath()
  const env = await getCommandEnv()
  const stagedFiles = await runGitInServices(['diff', '--cached', '--name-only'])

  if (!stagedFiles.trim()) {
    throw new Error('There are no staged changes to summarize.')
  }

  const stagedDiff = await runGitInServices(['diff', '--cached', '--no-ext-diff', '--binary', '--unified=3'])
  const prompt = [
    'Generate a concise git commit message for the staged changes only.',
    'Write the commit message in Spanish.',
    'Respond using the provided JSON schema.',
    'Do not include markdown, quotes, or backticks in either field.',
    'Prefer a short subject line. Use an empty body unless extra context materially helps.',
    '',
    'Staged files:',
    stagedFiles.trim(),
    '',
    'Staged diff:',
    stagedDiff.trim(),
  ].join('\n')

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      'claude',
      [
        '--print',
        '--output-format',
        'json',
        '--json-schema',
        GENERATED_COMMIT_MESSAGE_JSON_SCHEMA,
        '--settings',
        '.claude/settings.json',
        '--tools',
        '',
      ],
      {
        cwd: servicesPath,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    let output = ''
    let errorOutput = ''

    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')

    child.stdout.on('data', (chunk: string) => {
      output += chunk
    })

    child.stderr.on('data', (chunk: string) => {
      errorOutput += chunk
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve(output)
        return
      }

      reject(new Error(errorOutput.trim() || `Claude exited with code ${code ?? 1}.`))
    })

    child.stdin.write(prompt)
    child.stdin.end()
  })

  let parsedOutput: ClaudeStructuredOutputResult<unknown>

  try {
    parsedOutput = JSON.parse(stdout) as ClaudeStructuredOutputResult<unknown>
  } catch {
    throw new Error('Claude returned invalid JSON for the commit message.')
  }

  if (parsedOutput.is_error) {
    throw new Error(parsedOutput.result?.trim() || 'Claude failed to generate the commit message.')
  }

  if (!isGeneratedCommitMessage(parsedOutput.structured_output)) {
    throw new Error('Claude returned an invalid structured commit message.')
  }

  return { message: formatGeneratedCommitMessage(parsedOutput.structured_output) }
}

async function getWorkingTreeChanges(): Promise<GitWorkingTreeSnapshot> {
  const repositoryPath = getServicesPath()
  const [branch, statusOutput, diffBaseRef, sync] = await Promise.all([
    getCurrentServicesBranch(),
    runGitInServices(['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    getGitDiffBaseRef(),
    getGitBranchSyncState(),
  ])

  const statusEntries = parseGitStatusEntries(statusOutput)
  const files = await Promise.all(
    statusEntries.map(async ({ path: filePath, previousPath, indexStatus, workingTreeStatus }) => {
      const status = getGitWorkingTreeStatus(indexStatus, workingTreeStatus, previousPath)
      let diff = ''

      if (status === 'untracked') {
        diff = buildUntrackedFileDiff(repositoryPath, filePath)
      } else {
        try {
          diff = await runGitInServices([
            'diff',
            '--no-ext-diff',
            '--binary',
            diffBaseRef,
            '--',
            filePath,
          ])
        } catch {
          try {
            diff = await runGitInServices(['diff', '--no-ext-diff', '--binary', '--', filePath])
          } catch {
            diff = `diff --git a/${filePath} b/${filePath}\nFile is in a conflicted state.`
          }
        }
      }

      const { additions, deletions } = countDiffLines(diff)

      return {
        path: filePath,
        previousPath,
        indexStatus,
        workingTreeStatus,
        status,
        additions,
        deletions,
        diff,
      }
    }),
  )

  files.sort((left, right) => left.path.localeCompare(right.path))
  const totals = files.reduce(
    (summary, file) => ({
      additions: summary.additions + file.additions,
      deletions: summary.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  )

  return {
    branch,
    repositoryPath,
    additions: totals.additions,
    deletions: totals.deletions,
    sync,
    files,
  }
}

function sendUpdateState(status: string, detail?: string) {
  updateState = status

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('updates:status', { status, detail })
  }
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }

  const appPath = app.getAppPath()

  const window = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1120,
    minHeight: 720,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#fafafa',
    webPreferences: {
      preload: path.join(appPath, 'dist-electron/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      input.meta &&
      !input.control &&
      !input.alt &&
      input.key.toLowerCase() === 'v'
    ) {
      event.preventDefault()
      window.webContents.send('app:command-paste')
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
    window.webContents.openDevTools({ mode: 'detach' })
  } else {
    void window.loadFile(path.join(appPath, 'dist/index.html'))
  }

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  mainWindow = window
  return window
}

function setupUpdater() {
  if (isDev) {
    sendUpdateState('dev-mode', 'Auto-update is disabled in development.')
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    sendUpdateState('checking', 'Checking GitHub Releases for a new macOS build.')
  })

  autoUpdater.on('update-available', (info) => {
    sendUpdateState('available', `Version ${info.version} is ready to download.`)
  })

  autoUpdater.on('update-not-available', () => {
    sendUpdateState('idle', 'This build is already current.')
  })

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateState(
      'downloading',
      `${Math.round(progress.percent)}% downloaded at ${Math.round(progress.bytesPerSecond / 1024)} KB/s.`,
    )
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateState('downloaded', `Version ${info.version} is ready to install.`)
  })

  autoUpdater.on('error', (error) => {
    sendUpdateState('error', error == null ? 'Unknown updater error.' : error.message)
  })

  // Check on startup, but keep downloads user-driven.
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((error: unknown) => {
      sendUpdateState('error', error instanceof Error ? error.message : 'Could not check for updates.')
    })
  }, 3000)
}

app.whenReady().then(() => {
  createMainWindow()
  setupUpdater()

  ipcMain.handle('app:get-info', () => ({
    appName: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
  }))

  ipcMain.handle('updates:get-status', () => ({
    status: updateState,
  }))

  ipcMain.handle('updates:check', async () => {
    if (isDev) {
      sendUpdateState('dev-mode', 'Build the signed app to exercise updates.')
      return { ok: false, skipped: true }
    }

    await autoUpdater.checkForUpdates()
    return { ok: true }
  })

  ipcMain.handle('updates:download', async () => {
    if (isDev) {
      return { ok: false, skipped: true }
    }

    await autoUpdater.downloadUpdate()
    return { ok: true }
  })

  ipcMain.handle('updates:install', () => {
    if (!isDev) {
      autoUpdater.quitAndInstall()
    }
  })

  // --- Settings ---
  ipcMain.handle('settings:get', () => readSettings())
  ipcMain.handle('settings:set', (_event, patch: Record<string, unknown>) => {
    writeSettings(patch)
  })

  ipcMain.handle('dev5:status', async () => {
    return callDev5('status')
  })

  ipcMain.handle('dev5:start-service', async (_event, serviceName: string) => {
    return callDev5('start', serviceName)
  })

  ipcMain.handle('dev5:stop-service', async (_event, serviceName: string) => {
    return callDev5('stop', serviceName)
  })

  ipcMain.handle('dev5:stop-all', async () => {
    return stopAllServices()
  })

  ipcMain.handle('dev5:logs', async (_event, serviceName: string, lineCount = 5000) => {
    return readDev5Logs(serviceName, lineCount)
  })

  ipcMain.handle('terminals:list', async () => {
    return listTerminalSessions()
  })

  ipcMain.handle(
    'terminals:create',
    async (_event, options?: { cwd?: string; backgroundAppearance?: 'dark' | 'light' }) => {
      return createTerminalSession(options?.cwd, options?.backgroundAppearance ?? 'dark')
    },
  )

  ipcMain.handle('terminals:close', async (_event, sessionId: string) => {
    closeTerminalSession(sessionId)
    return { ok: true }
  })

  ipcMain.handle('terminals:snapshot', async (_event, sessionId: string) => {
    return getTerminalSessionSnapshot(sessionId)
  })

  ipcMain.on('terminals:write', (_event, sessionId: string, data: string) => {
    writeTerminalSession(sessionId, data)
  })

  ipcMain.on('terminals:resize', (_event, sessionId: string, cols: number, rows: number) => {
    resizeTerminalSession(sessionId, cols, rows)
  })

  ipcMain.handle(
    'services:open-editor',
    async (_event, editor: keyof typeof EDITOR_APP_NAMES = 'zed') => {
      await openServicesInEditor(editor)
      return { ok: true }
    },
  )

  ipcMain.handle(
    'services:open-file-in-editor',
    async (_event, filePath: string, editor?: keyof typeof EDITOR_APP_NAMES) => {
      await openServicesFileInEditor(filePath, editor)
      return { ok: true }
    },
  )

  ipcMain.handle(
    'services:get-editor-info',
    async (_event, editor: keyof typeof EDITOR_APP_NAMES = 'zed') => {
      return getEditorInfo(editor)
    },
  )

  ipcMain.handle('services:get-available-editors', async () => {
    return getAvailableEditors()
  })

  ipcMain.handle('git:get-current-branch', async () => {
    return getCurrentServicesBranch()
  })

  ipcMain.handle('git:list-local-branches', async () => {
    return listLocalGitBranches()
  })

  ipcMain.handle('git:list-pending-push-commits', async () => {
    return listPendingPushCommits()
  })

  ipcMain.handle('git:get-working-tree-changes', async () => {
    return getWorkingTreeChanges()
  })

  ipcMain.handle('git:stage-working-tree-file', async (_event, filePath: string) => {
    return stageWorkingTreeFile(filePath)
  })

  ipcMain.handle('git:unstage-working-tree-file', async (_event, filePath: string) => {
    return unstageWorkingTreeFile(filePath)
  })

  ipcMain.handle('git:commit-working-tree', async (_event, message: string) => {
    return commitWorkingTree(message)
  })

  ipcMain.handle('git:generate-commit-message', async () => {
    return generateCommitMessage()
  })

  ipcMain.handle('git:discard-working-tree-file', async (_event, filePath: string) => {
    return discardWorkingTreeFile(filePath)
  })

  ipcMain.handle('git:run-primary-branch-action', async () => {
    return runPrimaryGitBranchAction()
  })

  ipcMain.handle('git:switch-branch', async (_event, branchName: string) => {
    return switchGitBranch(branchName)
  })

  ipcMain.handle('git:create-and-switch-branch', async (_event, branchName: string) => {
    return switchGitBranch(branchName, { create: true })
  })

  // --- Services folder ---
  ipcMain.handle('services:select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      message: 'Select the justo-services repository folder',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('services:validate-folder', (_event, folderPath: string) => {
    try {
      if (!fs.existsSync(folderPath)) {
        return { valid: false, error: 'Directory does not exist.' }
      }

      if (!fs.existsSync(path.join(folderPath, '.git'))) {
        return { valid: false, error: 'Not a git repository.' }
      }

      const remotes = execSync('git remote -v', { cwd: folderPath, encoding: 'utf-8' })
      if (!remotes.includes('getjusto/justo-services')) {
        return { valid: false, error: 'Not the getjusto/justo-services repository.' }
      }

      return { valid: true }
    } catch {
      return { valid: false, error: 'Could not validate the folder.' }
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  disposeAllTerminalSessions()
})
