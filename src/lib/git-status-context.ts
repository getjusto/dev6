import { createContext } from 'react'

export const WORKING_TREE_CHANGED_EVENT = 'desktop:working-tree-changed'

export type GitStatusContextValue = {
  snapshot: GitWorkingTreeSnapshot | null
  isLoading: boolean
  refreshSnapshot: () => Promise<GitWorkingTreeSnapshot>
}

export const GitStatusContext = createContext<GitStatusContextValue | null>(null)
