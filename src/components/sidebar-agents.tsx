import type { MouseEvent } from 'react'
import { Bot, Plus, X } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAgentThreads } from '@/hooks/use-agent-threads'
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

function getThreadLabel(thread: AgentThread) {
  return thread.title || thread.sessionTitle || thread.agentName || 'Untitled agent'
}

export function SidebarAgents({
  onCreateThread,
}: {
  onCreateThread: (agentKind: 'codex' | 'claude') => Promise<void>
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const { threads, isLoading, deleteThread } = useAgentThreads()

  async function handleDeleteThread(event: MouseEvent<HTMLButtonElement>, threadId: string) {
    event.preventDefault()
    event.stopPropagation()

    const remainingThreads = threads.filter((thread) => thread.id !== threadId)
    const isActiveThread = location.pathname === `/agents/${threadId}`

    await deleteThread(threadId)

    if (isActiveThread) {
      navigate(remainingThreads[0] ? `/agents/${remainingThreads[0].id}` : '/agents')
    }
  }

  return (
    <SidebarGroup className="px-2 pt-1">
      <SidebarGroupLabel>Agents</SidebarGroupLabel>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarGroupAction aria-label="New agent thread" title="New agent thread">
            <Plus />
          </SidebarGroupAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => void onCreateThread('codex')}>
            Codex
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void onCreateThread('claude')}>
            Claude
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SidebarGroupContent>
        <SidebarMenu className="pb-2">
          {isLoading ? (
            <div className="px-2 py-1 text-xs text-muted-foreground">Loading agent threads…</div>
          ) : threads.length === 0 ? (
            <div className="px-2 py-1 text-xs text-muted-foreground">No agent threads yet.</div>
          ) : (
            threads.map((thread) => (
              <SidebarMenuItem key={thread.id}>
                <SidebarMenuButton
                  asChild
                  data-active={location.pathname === `/agents/${thread.id}`}
                >
                  <Link to={`/agents/${thread.id}`}>
                    <Bot className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{getThreadLabel(thread)}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {thread.status}
                    </span>
                  </Link>
                </SidebarMenuButton>
                <SidebarMenuAction
                  aria-label={`Close ${getThreadLabel(thread)}`}
                  onClick={(event) => void handleDeleteThread(event, thread.id)}
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
