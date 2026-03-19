import * as React from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Settings, Square } from 'lucide-react'

import { SidebarServices } from '@/components/sidebar-services'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

function editorLabel(editor: 'zed' | 'vscode' | 'cursor') {
  switch (editor) {
    case 'vscode':
      return 'VS Code'
    case 'cursor':
      return 'Cursor'
    default:
      return 'Zed'
  }
}

function editorIconPath(editor: 'zed' | 'vscode' | 'cursor') {
  switch (editor) {
    case 'vscode':
      return '/editor-icons/vscode.png'
    case 'cursor':
      return '/editor-icons/cursor.png'
    default:
      return '/editor-icons/zed.png'
  }
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [branchName, setBranchName] = React.useState('Dev6')
  const [isOpeningEditor, setIsOpeningEditor] = React.useState(false)
  const [isStoppingAll, setIsStoppingAll] = React.useState(false)
  const [preferredEditor, setPreferredEditor] = React.useState<'zed' | 'vscode' | 'cursor'>('zed')
  const [availableEditors, setAvailableEditors] = React.useState<Array<'zed' | 'vscode' | 'cursor'>>([])

  React.useEffect(() => {
    let cancelled = false

    async function loadSidebarState(nextEditor?: 'zed' | 'vscode' | 'cursor') {
      const [branch, settings, editors] = await Promise.all([
        window.desktop.getCurrentBranch(),
        window.desktop.getSettings(),
        window.desktop.getAvailableEditors(),
      ])

      if (cancelled) return

      if (branch) {
        setBranchName(branch)
      }

      setAvailableEditors(editors)

      const fallbackEditor = editors[0] ?? 'zed'
      const resolvedEditor =
        (nextEditor && editors.includes(nextEditor) ? nextEditor : null) ??
        (settings.preferredEditor && editors.includes(settings.preferredEditor)
          ? settings.preferredEditor
          : fallbackEditor)
      setPreferredEditor(resolvedEditor)
    }

    void loadSidebarState()

    const handleSettingsChanged = (event: Event) => {
      const detail = (event as CustomEvent<Partial<AppSettings>>).detail
      const nextEditor = detail.preferredEditor
      if (nextEditor) {
        void loadSidebarState(nextEditor)
      }
    }

    window.addEventListener('desktop:settings-changed', handleSettingsChanged)

    return () => {
      cancelled = true
      window.removeEventListener('desktop:settings-changed', handleSettingsChanged)
    }
  }, [])

  async function handleOpenEditor() {
    try {
      setIsOpeningEditor(true)
      await window.desktop.openServicesInEditor(preferredEditor)
    } finally {
      setIsOpeningEditor(false)
    }
  }

  async function handleStopAllServices() {
    try {
      setIsStoppingAll(true)
      await window.desktop.stopAllServices()
    } finally {
      setIsStoppingAll(false)
    }
  }

  return (
    <Sidebar
      variant="inset"
      collapsible="none"
      className="min-h-0 w-72 min-w-72 max-w-72 overflow-hidden"
      style={{ '--sidebar-width': '18rem' } as React.CSSProperties}
      {...props}
    >
      <SidebarHeader className="drag-region pt-[38px]">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <img
                  src="/iso-dark.svg"
                  alt="Justo"
                  className="size-8 dark:hidden"
                />
                <img
                  src="/iso-white.svg"
                  alt="Justo"
                  className="hidden size-8 dark:block"
                />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Justo</span>
                  <span className="truncate text-xs">{branchName}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="min-h-0 overflow-auto">
        <SidebarServices />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {availableEditors.length > 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => void handleOpenEditor()} disabled={isOpeningEditor}>
                <img
                  src={editorIconPath(preferredEditor)}
                  alt={editorLabel(preferredEditor)}
                  className="size-4 rounded-[4px]"
                />
                <span>{`Open ${editorLabel(preferredEditor)}`}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => void handleStopAllServices()} disabled={isStoppingAll}>
              {isStoppingAll ? <Loader2 className="animate-spin" /> : <Square />}
              <span>Stop all</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/settings">
                <Settings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
