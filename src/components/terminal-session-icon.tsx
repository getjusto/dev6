import { useEffect, useState } from 'react'
import { SquareTerminal } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TerminalSessionIcon({
  appKind,
  appIconDataUrl,
  className,
}: {
  appKind: TerminalSessionSummary['appKind']
  appIconDataUrl: string | null
  className?: string
}) {
  const resolvedClassName = cn('size-4 shrink-0 rounded-[4px] object-contain', className)
  const [didImageFail, setDidImageFail] = useState(false)

  useEffect(() => {
    setDidImageFail(false)
  }, [appIconDataUrl])

  if (appIconDataUrl && !didImageFail) {
    return (
      <img
        src={appIconDataUrl}
        alt=""
        className={resolvedClassName}
        draggable={false}
        onError={() => setDidImageFail(true)}
      />
    )
  }

  if (appKind === 'codex' || appKind === 'claude') {
    return null
  }

  return <SquareTerminal className={resolvedClassName} />
}
