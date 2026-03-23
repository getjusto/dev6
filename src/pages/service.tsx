import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Loader2, Play, Square } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ansiToSegments } from '@/lib/ansi'
import {
  getPendingServiceStatus,
  SERVICE_TOGGLE_LOADING_MS,
  type ServiceToggleAction,
  waitForDuration,
} from '@/lib/service-toggle'

type LogLineRender = {
  element: React.JSX.Element
  matchCount: number
}

function countMatches(text: string, query: string) {
  if (!query) return 0

  let count = 0
  let startIndex = 0
  const haystack = text.toLocaleLowerCase()

  while (true) {
    const nextIndex = haystack.indexOf(query, startIndex)
    if (nextIndex === -1) break

    count += 1
    startIndex = nextIndex + query.length
  }

  return count
}

function renderHighlightedSegment(
  text: string,
  className: string,
  query: string,
  lineIndex: number,
  matchIndexRef: { current: number },
  activeMatchIndex: number,
  matchRefs: React.MutableRefObject<(HTMLSpanElement | null)[]>,
) {
  if (!query) {
    return (
      <span className={className}>
        {text}
      </span>
    )
  }

  const nodes: React.JSX.Element[] = []
  const haystack = text.toLocaleLowerCase()
  let cursor = 0
  let localIndex = 0

  while (cursor < text.length) {
    const nextIndex = haystack.indexOf(query, cursor)

    if (nextIndex === -1) {
      const trailingText = text.slice(cursor)
      if (trailingText.length > 0) {
        nodes.push(
          <span key={`${lineIndex}-plain-${localIndex}`} className={className}>
            {trailingText}
          </span>,
        )
      }
      break
    }

    if (nextIndex > cursor) {
      nodes.push(
        <span key={`${lineIndex}-plain-${localIndex}`} className={className}>
          {text.slice(cursor, nextIndex)}
        </span>,
      )
      localIndex += 1
    }

    const matchedText = text.slice(nextIndex, nextIndex + query.length)
    const globalMatchIndex = matchIndexRef.current
    matchIndexRef.current += 1

    nodes.push(
      <span
        key={`${lineIndex}-match-${globalMatchIndex}`}
        ref={(node) => {
          matchRefs.current[globalMatchIndex] = node
        }}
        className={[
          className,
          'rounded',
          globalMatchIndex === activeMatchIndex
            ? 'bg-amber-300/80 ring-1 ring-amber-600/60 dark:bg-amber-400/50'
            : 'bg-yellow-200/70 dark:bg-yellow-500/35',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {matchedText}
      </span>,
    )

    cursor = nextIndex + query.length
    localIndex += 1
  }

  return nodes
}

function renderLogLine(
  line: string,
  lineIndex: number,
  query: string,
  activeMatchIndex: number,
  matchIndexRef: { current: number },
  matchRefs: React.MutableRefObject<(HTMLSpanElement | null)[]>,
): LogLineRender {
  const segments = ansiToSegments(line)
  const plainText = segments.map((segment) => segment.text).join('')
  const matchCount = countMatches(plainText, query)

  return {
    matchCount,
    element: (
      <div key={`${lineIndex}-${plainText}`} className="w-full min-w-0">
        {segments.map((segment, segmentIndex) => (
          <span key={`${lineIndex}-${segmentIndex}`}>
            {renderHighlightedSegment(
              segment.text,
              segment.className,
              query,
              lineIndex * 1000 + segmentIndex,
              matchIndexRef,
              activeMatchIndex,
              matchRefs,
            )}
          </span>
        ))}
      </div>
    ),
  }
}

export default function ServicePage() {
  const { serviceName } = useParams()
  const [service, setService] = useState<Dev5ServiceStatus | null>(null)
  const [logs, setLogs] = useState('')
  const [query, setQuery] = useState('')
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [isLoadingLogs, setIsLoadingLogs] = useState(true)
  const [isToggling, setIsToggling] = useState(false)
  const [pendingToggleAction, setPendingToggleAction] = useState<ServiceToggleAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isRefreshingRef = useRef(false)
  const isMountedRef = useRef(true)
  const refreshVersionRef = useRef(0)
  const logViewportRef = useRef<HTMLDivElement | null>(null)
  const shouldFollowRef = useRef(true)
  const matchRefs = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  function updateBottomState(viewport: HTMLDivElement) {
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    const nextIsAtBottom = distanceFromBottom <= 24
    shouldFollowRef.current = nextIsAtBottom
    setIsAtBottom(nextIsAtBottom)
  }

  async function refreshServiceStatus(currentServiceName: string, refreshVersion: number) {
    if (!currentServiceName) return

    const nextServices = await window.desktop.getServicesStatus()
    if (refreshVersion !== refreshVersionRef.current) {
      return
    }

    const nextService =
      nextServices.find((entry) => entry.service_name === currentServiceName) ?? null
    setService(nextService)
  }

  async function refreshLogs(showLoading: boolean) {
    if (!serviceName || isRefreshingRef.current) {
      return
    }

    const currentServiceName = serviceName
    const refreshVersion = refreshVersionRef.current
    isRefreshingRef.current = true

    if (showLoading) {
      setIsLoadingLogs(true)
    }

    try {
      const viewport = logViewportRef.current
      if (viewport) {
        updateBottomState(viewport)
      }

      const [nextLogs] = await Promise.all([
        window.desktop.getServiceLogs(currentServiceName, 5000),
        refreshServiceStatus(currentServiceName, refreshVersion),
      ])

      if (refreshVersion !== refreshVersionRef.current) {
        return
      }

      setLogs(nextLogs)
      setError(null)
    } catch (loadError) {
      if (refreshVersion !== refreshVersionRef.current) {
        return
      }

      setError(loadError instanceof Error ? loadError.message : 'Could not load logs.')
    } finally {
      if (refreshVersion === refreshVersionRef.current) {
        isRefreshingRef.current = false
        setIsLoadingLogs(false)
      }
    }
  }

  useEffect(() => {
    refreshVersionRef.current += 1
    isRefreshingRef.current = false
    shouldFollowRef.current = true
    setIsAtBottom(true)
    setIsLoadingLogs(true)
    setIsToggling(false)
    setPendingToggleAction(null)
    setError(null)
    setService(null)
    setLogs('')
    void refreshLogs(true)

    const intervalId = window.setInterval(() => {
      void refreshLogs(false)
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [serviceName])

  const displayedServiceStatus = pendingToggleAction
    ? getPendingServiceStatus(pendingToggleAction)
    : service?.status

  useEffect(() => {
    if (shouldFollowRef.current && logViewportRef.current) {
      logViewportRef.current.scrollTop = logViewportRef.current.scrollHeight
      setIsAtBottom(true)
    }
  }, [logs, query])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchIndexRef = { current: 0 }
  matchRefs.current = []
  const lineRenders = logs.split(/\r?\n/).map((line, index) =>
    renderLogLine(
      line,
      index,
      normalizedQuery,
      activeMatchIndex,
      matchIndexRef,
      matchRefs,
    ),
  )
  const totalMatches = lineRenders.reduce((sum, line) => sum + line.matchCount, 0)
  const renderedLines = lineRenders.map((line) => line.element)

  useEffect(() => {
    if (totalMatches === 0) {
      setActiveMatchIndex(0)
      return
    }

    if (activeMatchIndex >= totalMatches) {
      setActiveMatchIndex(totalMatches - 1)
    }
  }, [activeMatchIndex, totalMatches])

  useEffect(() => {
    if (!normalizedQuery || totalMatches === 0) {
      return
    }

    const activeNode = matchRefs.current[activeMatchIndex]
    activeNode?.scrollIntoView({ block: 'center' })
  }, [activeMatchIndex, normalizedQuery, logs])

  async function handleToggle() {
    if (!serviceName || !service || pendingToggleAction) return

    const nextAction: ServiceToggleAction = service.status === 'on' ? 'stop' : 'start'
    const refreshVersion = refreshVersionRef.current
    const minimumDelay = waitForDuration(SERVICE_TOGGLE_LOADING_MS)
    let toggleError: unknown = null

    setError(null)
    setIsToggling(true)
    setPendingToggleAction(nextAction)

    try {
      if (service.status === 'on') {
        await window.desktop.stopService(serviceName)
      } else {
        await window.desktop.startService(serviceName)
      }
    } catch (error) {
      toggleError = error
    }

    await minimumDelay

    if (!isMountedRef.current || refreshVersion !== refreshVersionRef.current) {
      return
    }

    await refreshLogs(false)

    if (!isMountedRef.current || refreshVersion !== refreshVersionRef.current) {
      return
    }

    if (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Could not change service state.')
    }

    setPendingToggleAction(null)
    setIsToggling(false)
  }

  function handleNextMatch() {
    if (totalMatches === 0) return
    setActiveMatchIndex((current) => (current + 1) % totalMatches)
  }

  function handlePreviousMatch() {
    if (totalMatches === 0) return
    setActiveMatchIndex((current) => (current - 1 + totalMatches) % totalMatches)
  }

  return (
    <>
      <div className="drag-region absolute inset-x-0 top-0 z-10 h-[32px] shrink-0" />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b px-6 py-4">
          <div className="flex min-w-0 items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{serviceName}</h1>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <Button
                variant={displayedServiceStatus === 'on' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => void handleToggle()}
                disabled={!service || isToggling}
              >
                {isToggling ? (
                  <Loader2 className="animate-spin" />
                ) : displayedServiceStatus === 'on' ? (
                  <Square />
                ) : (
                  <Play />
                )}
                {isToggling
                  ? pendingToggleAction === 'stop'
                    ? 'Stopping…'
                    : 'Starting…'
                  : displayedServiceStatus === 'on'
                    ? 'Stop'
                    : 'Start'}
              </Button>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search logs"
                className="max-w-sm"
              />
              <div className="shrink-0 text-xs text-muted-foreground">
                {normalizedQuery ? `${totalMatches === 0 ? 0 : activeMatchIndex + 1}/${totalMatches}` : '0/0'}
              </div>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={handlePreviousMatch}
                disabled={totalMatches === 0}
              >
                <ChevronUp />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={handleNextMatch}
                disabled={totalMatches === 0}
              >
                <ChevronDown />
              </Button>
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            ref={logViewportRef}
            className={`h-full min-h-0 min-w-0 overflow-y-auto overflow-x-hidden font-mono text-[12px] leading-5 ${
              displayedServiceStatus === 'off' ? 'opacity-50' : ''
            }`}
            onScroll={(event) => {
              updateBottomState(event.currentTarget)
            }}
          >
            {error ? (
              <div className="border-b px-6 py-2 text-sm text-destructive">{error}</div>
            ) : null}
            <div className="min-w-0 px-6 py-4">
              {isLoadingLogs ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading logs…
                </div>
              ) : renderedLines.length > 0 ? (
                <pre className="w-full min-w-0 whitespace-pre-wrap break-all text-inherit">
                  {renderedLines}
                </pre>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {query.trim() ? 'No log lines match your search.' : 'No logs available.'}
                </div>
              )}
            </div>
          </div>

          {!isAtBottom && !isLoadingLogs ? (
            <Button
              type="button"
              size="sm"
              className="absolute right-6 bottom-6 z-10 shadow-lg"
              onClick={() => {
                const viewport = logViewportRef.current
                if (!viewport) return

                viewport.scrollTo({
                  top: viewport.scrollHeight,
                  behavior: 'smooth',
                })
                shouldFollowRef.current = true
                setIsAtBottom(true)
              }}
            >
              <ChevronDown />
              Jump to latest
            </Button>
          ) : null}
        </div>
      </div>
    </>
  )
}
