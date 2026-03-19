import { useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  TerminalSessionsContext,
  type CreateTerminalSessionOptions,
} from '@/lib/terminal-sessions-context'

export function TerminalSessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<TerminalSessionSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)

  async function refreshSessions() {
    const nextSessions = await window.desktop.listTerminalSessions()
    setSessions(nextSessions)
    setIsLoading(false)
  }

  async function createSession(options?: CreateTerminalSessionOptions) {
    return window.desktop.createTerminalSession(options)
  }

  async function closeSession(sessionId: string) {
    await window.desktop.closeTerminalSession(sessionId)
  }

  useEffect(() => {
    let isActive = true

    void window.desktop.listTerminalSessions().then((nextSessions) => {
      if (!isActive) {
        return
      }

      setSessions(nextSessions)
      setIsLoading(false)
    })

    const unsubscribe = window.desktop.onTerminalSessionsChanged((nextSessions) => {
      setSessions(nextSessions)
      setIsLoading(false)
    })

    return () => {
      isActive = false
      unsubscribe()
    }
  }, [])

  const value = useMemo(
    () => ({
      sessions,
      isLoading,
      createSession,
      closeSession,
      refreshSessions,
    }),
    [isLoading, sessions],
  )

  return (
    <TerminalSessionsContext.Provider value={value}>
      {children}
    </TerminalSessionsContext.Provider>
  )
}
