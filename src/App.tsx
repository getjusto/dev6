import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AppSidebar } from '@/components/app-sidebar'
import { GitStatusProvider } from '@/components/git-status-provider'
import { TerminalSessionsProvider } from '@/components/terminal-sessions-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useTerminalSessions } from '@/hooks/use-terminal-sessions'
import BranchPage from '@/pages/branch'
import ServicePage from '@/pages/service'
import SettingsPage from '@/pages/settings'
import TerminalsPage from '@/pages/terminals'
import WelcomePage from '@/pages/welcome'

function AppShell() {
  const navigate = useNavigate()
  const { sessions } = useTerminalSessions()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return
      }

      const digit = Number(event.key)
      if (!Number.isInteger(digit) || digit < 1 || digit > 9) {
        return
      }

      event.preventDefault()

      if (digit === 1) {
        navigate('/branch')
        return
      }

      const session = sessions[digit - 2]
      if (!session) {
        return
      }

      navigate(`/terminals/${session.id}`)
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [navigate, sessions])

  return (
    <SidebarProvider className="h-screen overflow-hidden">
      <AppSidebar />
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/branch" replace />} />
          <Route path="/branch" element={<BranchPage />} />
          <Route path="/services/:serviceName" element={<ServicePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/terminals" element={<TerminalsPage />} />
          <Route path="/terminals/:terminalId" element={<TerminalsPage />} />
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
    <TerminalSessionsProvider>
      <GitStatusProvider>
        <AppShell />
      </GitStatusProvider>
    </TerminalSessionsProvider>
  )
}

export default App
