import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()

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
