import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { ServicesStatusContext } from '@/lib/services-status-context'

function sortServices(services: Dev5ServiceStatus[]) {
  return [...services].sort((left, right) => left.dir_name.localeCompare(right.dir_name))
}

export function ServicesStatusProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<Dev5ServiceStatus[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    void window.desktop
      .getServicesStatus()
      .then((nextServices) => {
        if (!isActive) {
          return
        }

        setServices(sortServices(nextServices))
        setError(null)
      })
      .catch((loadError) => {
        if (!isActive) {
          return
        }

        setError(loadError instanceof Error ? loadError.message : 'Could not load services.')
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false)
        }
      })

    const unsubscribeServices = window.desktop.onServicesStatusChanged((nextServices) => {
      setServices(sortServices(nextServices))
      setError(null)
      setIsLoading(false)
    })

    return () => {
      isActive = false
      unsubscribeServices()
    }
  }, [])

  const value = useMemo(
    () => ({
      services,
      isLoading,
      error,
    }),
    [error, isLoading, services],
  )

  return (
    <ServicesStatusContext.Provider value={value}>
      {children}
    </ServicesStatusContext.Provider>
  )
}
