import { useEffect, useState } from 'react'
import { FolderOpen, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [servicesPath, setServicesPath] = useState<string | null>(null)
  const [preferredEditor, setPreferredEditor] = useState<'zed' | 'vscode' | 'cursor'>('zed')
  const [availableEditors, setAvailableEditors] = useState<Array<'zed' | 'vscode' | 'cursor'>>([])

  useEffect(() => {
    Promise.all([window.desktop.getSettings(), window.desktop.getAvailableEditors()]).then(
      async ([settings, editors]) => {
        setServicesPath(settings.servicesPath ?? null)
        setAvailableEditors(editors)

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
