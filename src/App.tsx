import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppSidebar } from '@/components/app-sidebar'
import { TerminalSessionsProvider } from '@/components/terminal-sessions-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import ServicePage from '@/pages/service'
import SettingsPage from '@/pages/settings'
import TerminalsPage from '@/pages/terminals'
import WelcomePage from '@/pages/welcome'

function Page() {
  return (
    <>
      <div className="drag-region h-[52px] shrink-0" />
      <div className="flex-1 overflow-auto p-4" />
    </>
  )
}

function App() {
  const [ready, setReady] = useState<boolean | null>(null)

  useEffect(() => {
    window.desktop.getSettings().then((s) => {
      setReady(!!s.servicesPath)
    })
  }, [])

  // Loading
  if (ready === null) return null

  // No services path configured
  if (!ready) {
    return <WelcomePage onComplete={() => setReady(true)} />
  }

  return (
    <TerminalSessionsProvider>
      <SidebarProvider className="h-screen overflow-hidden">
        <AppSidebar />
        <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
          <Routes>
            <Route path="/" element={<Page />} />
            <Route path="/services/:serviceName" element={<ServicePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/terminals" element={<TerminalsPage />} />
            <Route path="/terminals/:terminalId" element={<TerminalsPage />} />
          </Routes>
        </SidebarInset>
      </SidebarProvider>
    </TerminalSessionsProvider>
  )
}

export default App
