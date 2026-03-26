import * as React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Loader2, Settings, Square } from 'lucide-react'

import { SidebarServices } from '@/components/sidebar-services'
import { SidebarTerminals } from '@/components/sidebar-terminals'
import isoDarkUrl from '@/assets/iso-dark.svg'
import isoWhiteUrl from '@/assets/iso-white.svg'
import cursorIconUrl from '@/assets/editor-icons/cursor.png'
import vscodeIconUrl from '@/assets/editor-icons/vscode.png'
import zedIconUrl from '@/assets/editor-icons/zed.png'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const GIT_SUMMARY_REFRESH_MS = 5000
const WORKING_TREE_CHANGED_EVENT = 'desktop:working-tree-changed'

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
      return vscodeIconUrl
    case 'cursor':
      return cursorIconUrl
    default:
      return zedIconUrl
  }
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation()
  const navigate = useNavigate()
  const [branchName, setBranchName] = React.useState('Dev6')
  const [gitSummary, setGitSummary] = React.useState({ additions: 0, deletions: 0 })
  const [isOpeningEditor, setIsOpeningEditor] = React.useState(false)
  const [isStoppingAll, setIsStoppingAll] = React.useState(false)
  const [preferredEditor, setPreferredEditor] = React.useState<'zed' | 'vscode' | 'cursor'>('zed')
  const [availableEditors, setAvailableEditors] = React.useState<Array<'zed' | 'vscode' | 'cursor'>>([])

  React.useEffect(() => {
    let cancelled = false

    async function refreshGitSummary() {
      const snapshot = await window.desktop.getWorkingTreeChanges()

      if (cancelled) return

      if (snapshot.branch) {
        setBranchName(snapshot.branch)
      }

      setGitSummary({
        additions: snapshot.additions,
        deletions: snapshot.deletions,
      })
    }

    async function loadSidebarState(nextEditor?: 'zed' | 'vscode' | 'cursor') {
      const [snapshot, settings, editors] = await Promise.all([
        window.desktop.getWorkingTreeChanges(),
        window.desktop.getSettings(),
        window.desktop.getAvailableEditors(),
      ])

      if (cancelled) return

      if (snapshot.branch) {
        setBranchName(snapshot.branch)
      }

      setGitSummary({
        additions: snapshot.additions,
        deletions: snapshot.deletions,
      })
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
    const intervalId = window.setInterval(() => {
      void refreshGitSummary()
    }, GIT_SUMMARY_REFRESH_MS)

    const handleSettingsChanged = (event: Event) => {
      const detail = (event as CustomEvent<Partial<AppSettings>>).detail
      const nextEditor = detail.preferredEditor
      if (nextEditor) {
        void loadSidebarState(nextEditor)
      }
    }

    const handleWorkingTreeChanged = () => {
      void refreshGitSummary()
    }

    window.addEventListener('desktop:settings-changed', handleSettingsChanged)
    window.addEventListener(WORKING_TREE_CHANGED_EVENT, handleWorkingTreeChanged)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener('desktop:settings-changed', handleSettingsChanged)
      window.removeEventListener(WORKING_TREE_CHANGED_EVENT, handleWorkingTreeChanged)
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

  async function handleCreateTerminal() {
    const session = await window.desktop.createTerminalSession({
      backgroundAppearance: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    })
    navigate(`/terminals/${session.id}`)
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
            <SidebarMenuButton
              size="lg"
              asChild
              data-active={location.pathname === '/' || location.pathname === '/branch'}
            >
              <Link to="/branch">
                <img
                  src={isoDarkUrl}
                  alt="Justo"
                  className="size-8 dark:hidden"
                />
                <img
                  src={isoWhiteUrl}
                  alt="Justo"
                  className="hidden size-8 dark:block"
                />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Justo</span>
                  <span className="truncate text-xs">{branchName}</span>
                </div>
                {gitSummary.additions > 0 || gitSummary.deletions > 0 ? (
                  <div className="ml-auto flex shrink-0 items-center gap-2 font-mono text-[11px]">
                    {gitSummary.additions > 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        +{gitSummary.additions}
                      </span>
                    ) : null}
                    {gitSummary.deletions > 0 ? (
                      <span className="text-rose-600 dark:text-rose-400">
                        -{gitSummary.deletions}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="min-h-0 overflow-auto">
        <SidebarTerminals onCreateTerminal={handleCreateTerminal} />
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
