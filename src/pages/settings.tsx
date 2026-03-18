import { useEffect, useState } from 'react'
import { FolderOpen, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [servicesPath, setServicesPath] = useState<string | null>(null)

  useEffect(() => {
    window.desktop.getSettings().then((s) => {
      setServicesPath(s.servicesPath ?? null)
    })
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
        </div>
      </div>
    </>
  )
}
