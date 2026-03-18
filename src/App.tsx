import { ArrowRight, Download, RefreshCw, Rocket, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

type AppInfo = Awaited<ReturnType<typeof window.desktop.getAppInfo>>
type UpdateState = Awaited<ReturnType<typeof window.desktop.getUpdateStatus>>

const updateActions: Record<string, { label: string; action?: 'check' | 'download' | 'install' }> = {
  idle: { label: 'Check for updates', action: 'check' },
  checking: { label: 'Checking...' },
  available: { label: 'Download update', action: 'download' },
  downloading: { label: 'Downloading...' },
  downloaded: { label: 'Install update', action: 'install' },
  error: { label: 'Retry check', action: 'check' },
  'dev-mode': { label: 'Package app for updates' },
}

function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState>({
    status: 'idle',
  })

  useEffect(() => {
    void window.desktop.getAppInfo().then(setAppInfo)
    void window.desktop.getUpdateStatus().then(setUpdateState)

    const unsubscribe = window.desktop.onUpdateStatus((payload: UpdateState) => {
      setUpdateState(payload)
    })

    return unsubscribe
  }, [])

  async function handleUpdateAction() {
    const action = updateActions[updateState.status]?.action

    if (action === 'check') {
      await window.desktop.checkForUpdates()
    }

    if (action === 'download') {
      await window.desktop.downloadUpdate()
    }

    if (action === 'install') {
      await window.desktop.installUpdate()
    }
  }

  const cta = updateActions[updateState.status] ?? updateActions.idle

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(187,247,208,0.14),_transparent_30%),linear-gradient(180deg,_#0d100f_0%,_#090909_100%)] px-6 py-8 text-stone-100">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col rounded-[32px] border border-white/10 bg-white/5 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <header className="flex items-center justify-between border-b border-white/10 px-8 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-200/70">getjusto</p>
            <h1 className="mt-2 text-2xl font-semibold">dev6 macOS shell</h1>
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-stone-300">
            {appInfo?.platform ?? 'darwin'} / {appInfo?.arch ?? 'arm64'}
          </div>
        </header>

        <section className="grid flex-1 gap-6 p-8 lg:grid-cols-[1.5fr_0.9fr]">
          <div className="flex flex-col justify-between rounded-[28px] border border-white/10 bg-stone-950/65 p-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-emerald-100">
                <Rocket className="size-3.5" />
                Private desktop base
              </div>
              <h2 className="mt-6 max-w-3xl text-5xl font-semibold leading-tight text-balance">
                Electron on the outside, React and shadcn on the inside.
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-300">
                This starter is trimmed for a private macOS app with a signed release path, S3-hosted artifacts, and
                a renderer that stays close to normal Vite development.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <FeatureCard
                icon={<ShieldCheck className="size-5" />}
                title="Private release path"
                body="Built for signed and notarized mac releases published outside the public GitHub updater flow."
              />
              <FeatureCard
                icon={<RefreshCw className="size-5" />}
                title="Updater skeleton"
                body="Electron main process is already wired for update checks, downloads, and installs."
              />
              <FeatureCard
                icon={<Download className="size-5" />}
                title="S3 publish config"
                body="electron-builder is configured for a mac-only target with S3 publish settings driven by env vars."
              />
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <section className="rounded-[28px] border border-white/10 bg-white/6 p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-stone-400">Build</p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <div>
                  <h3 className="text-3xl font-semibold">{appInfo?.version ?? '0.1.0'}</h3>
                  <p className="mt-2 text-sm text-stone-400">
                    {appInfo?.isPackaged ? 'Packaged binary' : 'Development runtime'}
                  </p>
                </div>
                <div className="rounded-2xl bg-emerald-200 px-3 py-2 text-sm font-medium text-emerald-950">
                  macOS only
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/6 p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-stone-400">Updates</p>
              <h3 className="mt-3 text-2xl font-semibold capitalize">{updateState.status.replace('-', ' ')}</h3>
              <p className="mt-3 min-h-12 text-sm leading-6 text-stone-300">
                {updateState.detail ?? 'This window receives status changes directly from the Electron main process.'}
              </p>
              <div className="mt-6 flex gap-3">
                <Button onClick={() => void handleUpdateAction()} disabled={!cta.action && updateState.status !== 'error'}>
                  {cta.label}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.open('https://www.electron.build/auto-update.html', '_blank', 'noopener,noreferrer')}
                >
                  Update docs
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-[#111413] p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-stone-400">Next</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-300">
                <li>Set `DEV6_S3_BUCKET` and `DEV6_S3_REGION` before publishing.</li>
                <li>Add Apple signing and notarization secrets in CI before shipping outside local builds.</li>
                <li>Decide whether your private update feed uses bucket access, signed URLs, or a protected proxy.</li>
              </ul>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
      <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-3 text-emerald-100">{icon}</div>
      <h3 className="mt-4 text-lg font-medium">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-stone-400">{body}</p>
    </div>
  )
}

export default App
