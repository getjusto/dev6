import { createContext } from 'react'

export type CreateTerminalSessionOptions = {
  cwd?: string
  backgroundAppearance?: 'dark' | 'light'
}

export type TerminalSessionsContextValue = {
  sessions: TerminalSessionSummary[]
  isLoading: boolean
  createSession: (options?: CreateTerminalSessionOptions) => Promise<TerminalSessionSummary>
  closeSession: (sessionId: string) => Promise<void>
  refreshSessions: () => Promise<void>
}

export const TerminalSessionsContext = createContext<TerminalSessionsContextValue | null>(null)
