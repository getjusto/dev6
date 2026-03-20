import { useContext } from 'react'

import { AgentThreadsContext } from '@/lib/agent-threads-context'

export function useAgentThreads() {
  const context = useContext(AgentThreadsContext)

  if (!context) {
    throw new Error('useAgentThreads must be used within AgentThreadsProvider.')
  }

  return context
}
