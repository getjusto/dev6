import { useContext } from 'react'

import { GitStatusContext } from '@/lib/git-status-context'

export function useGitStatus() {
  const context = useContext(GitStatusContext)

  if (!context) {
    throw new Error('useGitStatus must be used within GitStatusProvider.')
  }

  return context
}
