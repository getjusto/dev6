import { useContext } from 'react'

import { ServicesStatusContext } from '@/lib/services-status-context'

export function useServicesStatus() {
  const context = useContext(ServicesStatusContext)

  if (!context) {
    throw new Error('useServicesStatus must be used inside ServicesStatusProvider')
  }

  return context
}
