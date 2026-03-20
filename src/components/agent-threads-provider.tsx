import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { AgentThreadsContext, type UpdateAgentThreadOptions } from '@/lib/agent-threads-context'

export function AgentThreadsProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<AgentThread[]>([])
  const [isLoading, setIsLoading] = useState(true)

  async function refreshThreads() {
    const nextThreads = await window.desktop.listAgentThreads()
    setThreads(nextThreads)
    setIsLoading(false)
  }

  async function createThread(agentKind: 'codex' | 'claude') {
    return window.desktop.createAgentThread(agentKind)
  }

  async function updateThread(threadId: string, patch: UpdateAgentThreadOptions) {
    return window.desktop.updateAgentThread(threadId, patch)
  }

  async function deleteThread(threadId: string) {
    await window.desktop.deleteAgentThread(threadId)
  }

  async function connectThread(threadId: string) {
    return window.desktop.connectAgentThread(threadId)
  }

  async function disconnectThread(threadId: string) {
    await window.desktop.disconnectAgentThread(threadId)
  }

  async function sendPrompt(threadId: string, prompt: AgentPromptInput) {
    return window.desktop.sendAgentPrompt(threadId, prompt)
  }

  async function cancelPrompt(threadId: string) {
    await window.desktop.cancelAgentPrompt(threadId)
  }

  async function resolvePermission(threadId: string, optionId: string | null) {
    await window.desktop.resolveAgentPermission(threadId, optionId)
  }

  useEffect(() => {
    let isActive = true

    void window.desktop.listAgentThreads().then((nextThreads) => {
      if (!isActive) {
        return
      }

      setThreads(nextThreads)
      setIsLoading(false)
    })

    const unsubscribeThreads = window.desktop.onAgentThreadsChanged((nextThreads) => {
      setThreads(nextThreads)
      setIsLoading(false)
    })

    return () => {
      isActive = false
      unsubscribeThreads()
    }
  }, [])

  const value = useMemo(
    () => ({
      threads,
      isLoading,
      createThread,
      updateThread,
      deleteThread,
      connectThread,
      disconnectThread,
      sendPrompt,
      cancelPrompt,
      resolvePermission,
      refreshThreads,
    }),
    [isLoading, threads],
  )

  return <AgentThreadsContext.Provider value={value}>{children}</AgentThreadsContext.Provider>
}
