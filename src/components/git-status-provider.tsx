import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { GitStatusContext, WORKING_TREE_CHANGED_EVENT } from '@/lib/git-status-context'

const GIT_STATUS_REFRESH_MS = 5000

export function GitStatusProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<GitWorkingTreeSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshSnapshot = useCallback(async () => {
    const nextSnapshot = await window.desktop.getWorkingTreeChanges()
    setSnapshot(nextSnapshot)
    setIsLoading(false)
    return nextSnapshot
  }, [])

  useEffect(() => {
    let cancelled = false

    void refreshSnapshot().catch(() => {
      if (!cancelled) {
        setIsLoading(false)
      }
    })

    const intervalId = window.setInterval(() => {
      void refreshSnapshot().catch(() => {})
    }, GIT_STATUS_REFRESH_MS)

    const handleWorkingTreeChanged = () => {
      void refreshSnapshot().catch(() => {})
    }

    window.addEventListener(WORKING_TREE_CHANGED_EVENT, handleWorkingTreeChanged)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener(WORKING_TREE_CHANGED_EVENT, handleWorkingTreeChanged)
    }
  }, [refreshSnapshot])

  const value = useMemo(
    () => ({
      snapshot,
      isLoading,
      refreshSnapshot,
    }),
    [isLoading, refreshSnapshot, snapshot],
  )

  return <GitStatusContext.Provider value={value}>{children}</GitStatusContext.Provider>
}
