import { createContext } from 'react'

export type ServicesStatusContextValue = {
  services: Dev5ServiceStatus[]
  isLoading: boolean
  error: string | null
}

export const ServicesStatusContext = createContext<ServicesStatusContextValue | null>(null)
