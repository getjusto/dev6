import { useState } from 'react'
import { FolderOpen, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function WelcomePage({ onComplete }: { onComplete: () => void }) {
  const [path, setPath] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSelectFolder() {
    const selected = await window.desktop.selectFolder()
    if (!selected) return

    setPath(selected)
    setStatus('validating')
    setError(null)

    const result = await window.desktop.validateServicesFolder(selected)
    if (result.valid) {
      setStatus('valid')
    } else {
      setStatus('invalid')
      setError(result.error ?? 'Invalid folder.')
    }
  }

  async function handleContinue() {
    if (!path) return
    await window.desktop.setSettings({ servicesPath: path })
    onComplete()
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="drag-region fixed inset-x-0 top-0 h-[52px]" />

      <img src={isoDarkUrl} alt="Justo" className="size-16 dark:hidden" />
      <img src={isoWhiteUrl} alt="Justo" className="hidden size-16 dark:block" />

      <div className="text-center">
        <h1 className="text-2xl font-semibold">Welcome to Dev6</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select the path to your justo-services repository to get started.
        </p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-3">
        <Button variant="outline" className="w-full" onClick={handleSelectFolder}>
          <FolderOpen className="size-4" />
          Select Folder
        </Button>

        {path && (
          <div className="rounded-lg border bg-muted/50 px-3 py-2">
            <p className="truncate text-sm font-mono">{path}</p>
            <div className="mt-1 flex items-center gap-1.5 text-xs">
              {status === 'validating' && (
                <>
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Validating...</span>
                </>
              )}
              {status === 'valid' && (
                <>
                  <CheckCircle2 className="size-3.5 text-green-600" />
                  <span className="text-green-600">Valid justo-services repository</span>
                </>
              )}
              {status === 'invalid' && (
                <>
                  <XCircle className="size-3.5 text-destructive" />
                  <span className="text-destructive">{error}</span>
                </>
              )}
            </div>
          </div>
        )}

        <Button disabled={status !== 'valid'} onClick={handleContinue}>
          Continue
        </Button>
      </div>
    </div>
  )
}
import isoDarkUrl from '@/assets/iso-dark.svg'
import isoWhiteUrl from '@/assets/iso-white.svg'
