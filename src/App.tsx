import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppSidebar } from '@/components/app-sidebar'
import { ServicesStatusProvider } from '@/components/services-status-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useServicesStatus } from '@/hooks/use-services-status'
import ServicePage from '@/pages/service'
import SettingsPage from '@/pages/settings'
import WelcomePage from '@/pages/welcome'

function ServicesIndexRoute() {
  const { services } = useServicesStatus()
  const firstService = services[0]?.service_name

  if (firstService) {
    return <Navigate to={`/services/${encodeURIComponent(firstService)}`} replace />
  }

  return <ServicePage />
}

function AppShell() {
  return (
    <SidebarProvider className="h-screen overflow-hidden">
      <AppSidebar />
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/services" replace />} />
          <Route path="/services" element={<ServicesIndexRoute />} />
          <Route path="/services/:serviceName" element={<ServicePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/services" replace />} />
        </Routes>
      </SidebarInset>
    </SidebarProvider>
  )
}

function App() {
  const [ready, setReady] = useState<boolean | null>(null)

  useEffect(() => {
    window.desktop.getSettings().then((s) => {
      setReady(!!s.servicesPath)
    })
  }, [])

  if (ready === null) return null

  if (!ready) {
    return <WelcomePage onComplete={() => setReady(true)} />
  }

  return (
    <ServicesStatusProvider>
      <AppShell />
    </ServicesStatusProvider>
  )
}

export default App
