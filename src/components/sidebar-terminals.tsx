import type { MouseEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { TerminalSessionIcon } from '@/components/terminal-session-icon'
import { useTerminalSessions } from '@/hooks/use-terminal-sessions'
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

function getTerminalPathLabel(cwd: string) {
  const segments = cwd.split('/').filter(Boolean)
  return segments.at(-1) ?? cwd
}

export function SidebarTerminals({
  onCreateTerminal,
}: {
  onCreateTerminal: () => Promise<void>
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const { sessions, isLoading, closeSession } = useTerminalSessions()

  async function handleCloseSession(event: MouseEvent<HTMLButtonElement>, sessionId: string) {
    event.preventDefault()
    event.stopPropagation()

    const remainingSessions = sessions.filter((session) => session.id !== sessionId)
    const isActiveSession = location.pathname === `/terminals/${sessionId}`

    await closeSession(sessionId)

    if (isActiveSession) {
      navigate(remainingSessions[0] ? `/terminals/${remainingSessions[0].id}` : '/terminals')
    }
  }

  return (
    <SidebarGroup className="px-2 pt-1">
      <SidebarGroupLabel>Terminal</SidebarGroupLabel>
      <SidebarGroupAction
        aria-label="New terminal"
        title="New terminal"
        onClick={() => void onCreateTerminal()}
      >
        <Plus />
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu className="pb-2">
          {isLoading ? (
            <div className="px-2 py-1 text-xs text-muted-foreground">
              Loading terminals…
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-2 py-1 text-xs text-muted-foreground">
              No open sessions.
            </div>
          ) : (
            sessions.map((session) => (
              <SidebarMenuItem key={session.id}>
                <SidebarMenuButton
                  asChild
                  data-active={location.pathname === `/terminals/${session.id}`}
                >
                  <Link to={`/terminals/${session.id}`}>
                    <TerminalSessionIcon
                      appKind={session.appKind}
                      appIconDataUrl={session.appIconDataUrl}
                      className="size-4 shrink-0 rounded-[4px]"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {session.title}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {getTerminalPathLabel(session.cwd)}
                    </span>
                  </Link>
                </SidebarMenuButton>
                <SidebarMenuAction
                  aria-label={`Close ${session.title}`}
                  onClick={(event) => void handleCloseSession(event, session.id)}
                >
                  <X />
                </SidebarMenuAction>
              </SidebarMenuItem>
            ))
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
