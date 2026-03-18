import { Routes, Route } from 'react-router-dom'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import SettingsPage from '@/pages/settings'

function Page() {
  return (
    <>
      <div className="drag-region h-[52px] shrink-0" />
      <div className="flex-1 overflow-auto p-4" />
    </>
  )
}

function App() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Routes>
          <Route path="/" element={<Page />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
