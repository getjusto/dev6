import { createContext } from 'react'

export type UpdateAgentThreadOptions = Partial<{
  title: string
  settings: Partial<{
    model: string | null
    reasoningEffort: string | null
    mode: string | null
  }>
}>

export type AgentThreadsContextValue = {
  threads: AgentThread[]
  isLoading: boolean
  createThread: (agentKind: 'codex' | 'claude') => Promise<AgentThread>
  updateThread: (threadId: string, patch: UpdateAgentThreadOptions) => Promise<AgentThread>
  deleteThread: (threadId: string) => Promise<void>
  connectThread: (threadId: string) => Promise<AgentThread>
  disconnectThread: (threadId: string) => Promise<void>
  sendPrompt: (threadId: string, prompt: AgentPromptInput) => Promise<AgentThread>
  cancelPrompt: (threadId: string) => Promise<void>
  resolvePermission: (threadId: string, optionId: string | null) => Promise<void>
  refreshThreads: () => Promise<void>
}

export const AgentThreadsContext = createContext<AgentThreadsContextValue | null>(null)
