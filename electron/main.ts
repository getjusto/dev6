import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const isDev = !app.isPackaged
let updateState = 'idle'

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

function callDev5(command: string): unknown {
  const servicesPath = getServicesPath()
  const output = execSync(`./dev5 ${command} --json`, {
    cwd: servicesPath,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  })
  return JSON.parse(output)
}

function sendUpdateState(status: string, detail?: string) {
  updateState = status

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('updates:status', { status, detail })
  }
}

function createMainWindow() {
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

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
    window.webContents.openDevTools({ mode: 'detach' })
  } else {
    void window.loadFile(path.join(appPath, 'dist/index.html'))
  }

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
    sendUpdateState('checking', 'Checking S3 for a new macOS build.')
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
