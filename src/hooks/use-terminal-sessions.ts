import { useContext } from 'react'

import { TerminalSessionsContext } from '@/lib/terminal-sessions-context'

export function useTerminalSessions() {
  const context = useContext(TerminalSessionsContext)

  if (!context) {
    throw new Error('useTerminalSessions must be used within TerminalSessionsProvider.')
  }

  return context
}
