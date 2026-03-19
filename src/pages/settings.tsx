import { useEffect, useState } from 'react'
import { Download, FolderOpen, Loader2, Monitor, Moon, RefreshCw, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [servicesPath, setServicesPath] = useState<string | null>(null)
  const [preferredEditor, setPreferredEditor] = useState<'zed' | 'vscode' | 'cursor'>('zed')
  const [availableEditors, setAvailableEditors] = useState<Array<'zed' | 'vscode' | 'cursor'>>([])
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ status: 'idle' })
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false)
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false)

  useEffect(() => {
    Promise.all([
      window.desktop.getSettings(),
      window.desktop.getAvailableEditors(),
      window.desktop.getAppInfo(),
      window.desktop.getUpdateStatus(),
    ]).then(
      async ([settings, editors, appInfo, currentUpdateStatus]) => {
        setServicesPath(settings.servicesPath ?? null)
        setAvailableEditors(editors)
        setAppVersion(appInfo.version)
        setUpdateStatus(currentUpdateStatus)

        const fallbackEditor = editors[0] ?? 'zed'
        const nextPreferredEditor =
          settings.preferredEditor && editors.includes(settings.preferredEditor)
            ? settings.preferredEditor
            : fallbackEditor

        setPreferredEditor(nextPreferredEditor)

        if (
          editors.length > 0 &&
          settings.preferredEditor !== nextPreferredEditor
        ) {
          await window.desktop.setSettings({ preferredEditor: nextPreferredEditor })
        }
      },
    )

    const unsubscribe = window.desktop.onUpdateStatus((payload) => {
      setUpdateStatus(payload)

      if (payload.status !== 'checking') {
        setIsCheckingUpdates(false)
      }

      if (payload.status !== 'downloading') {
        setIsDownloadingUpdate(false)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  async function handleChangePath() {
    const selected = await window.desktop.selectFolder()
    if (!selected) return

    const result = await window.desktop.validateServicesFolder(selected)
    if (result.valid) {
      await window.desktop.setSettings({ servicesPath: selected })
      setServicesPath(selected)
    }
  }

  async function handleEditorChange(value: string) {
    const nextEditor = value as 'zed' | 'vscode' | 'cursor'
    setPreferredEditor(nextEditor)
    await window.desktop.setSettings({ preferredEditor: nextEditor })
  }

  async function handleCheckForUpdates() {
    try {
      setIsCheckingUpdates(true)
      setUpdateStatus({ status: 'checking', detail: 'Checking for updates…' })
      await window.desktop.checkForUpdates()
    } catch (error) {
      setUpdateStatus({
        status: 'error',
        detail: error instanceof Error ? error.message : 'Could not check for updates.',
      })
      setIsCheckingUpdates(false)
    }
  }

  async function handleDownloadUpdate() {
    try {
      setIsDownloadingUpdate(true)
      await window.desktop.downloadUpdate()
    } catch (error) {
      setUpdateStatus({
        status: 'error',
        detail: error instanceof Error ? error.message : 'Could not download the update.',
      })
      setIsDownloadingUpdate(false)
    }
  }

  function isUpdateBusy() {
    return isCheckingUpdates || isDownloadingUpdate
  }

  return (
    <>
      <div className="drag-region h-[52px] shrink-0" />
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-8">
          <div>
            <h2 className="text-lg font-semibold">Settings</h2>
            <p className="text-sm text-muted-foreground">
              Manage your application preferences.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Software Updates</h3>
              <p className="text-sm text-muted-foreground">
                Check for newer builds published to GitHub Releases.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    Current version{appVersion ? `: ${appVersion}` : ''}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {updateStatus.detail ?? 'No update activity yet.'}
                  </div>
                </div>
                <div className="flex gap-2">
                  {updateStatus.status === 'available' ? (
                    <Button size="sm" onClick={handleDownloadUpdate} disabled={isUpdateBusy()}>
                      {isDownloadingUpdate ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Download className="size-4" />
                      )}
                      Download update
                    </Button>
                  ) : null}
                  {updateStatus.status === 'downloaded' ? (
                    <Button size="sm" onClick={() => void window.desktop.installUpdate()}>
                      Install update
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCheckForUpdates}
                    disabled={isUpdateBusy()}
                  >
                    {isCheckingUpdates ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    Check for updates
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Services Folder</h3>
              <p className="text-sm text-muted-foreground">
                Path to the justo-services repository.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 truncate rounded-lg border bg-muted/50 px-3 py-2 font-mono text-sm">
                {servicesPath ?? '—'}
              </div>
              <Button variant="outline" size="sm" onClick={handleChangePath}>
                <FolderOpen className="size-4" />
                Change
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Appearance</h3>
              <p className="text-sm text-muted-foreground">
                Choose your preferred color scheme.
              </p>
            </div>
            <Tabs value={theme} onValueChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}>
              <TabsList>
                <TabsTrigger value="light">
                  <Sun className="size-4" />
                  Light
                </TabsTrigger>
                <TabsTrigger value="dark">
                  <Moon className="size-4" />
                  Dark
                </TabsTrigger>
                <TabsTrigger value="system">
                  <Monitor className="size-4" />
                  System
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Editor</h3>
              <p className="text-sm text-muted-foreground">
                Choose the app used to open the services folder.
              </p>
            </div>
            {availableEditors.length > 0 ? (
              <Tabs value={preferredEditor} onValueChange={handleEditorChange}>
                <TabsList>
                  {availableEditors.map((editor) => (
                    <TabsTrigger key={editor} value={editor}>
                      {editor === 'vscode' ? 'VS Code' : editor === 'cursor' ? 'Cursor' : 'Zed'}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            ) : (
              <div className="text-sm text-muted-foreground">
                No supported editor app was found on this Mac.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
