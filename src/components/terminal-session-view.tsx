import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

function readTerminalTheme() {
  const styles = getComputedStyle(document.documentElement)
  const background = styles.getPropertyValue('--background').trim() || '#111111'
  const foreground = styles.getPropertyValue('--foreground').trim() || '#f5f5f5'

  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: styles.getPropertyValue('--accent').trim() || '#444444',
  }
}

export function TerminalSessionView({
  sessionId,
  appKind,
  active = true,
}: {
  sessionId: string
  appKind: TerminalSessionSummary['appKind']
  active?: boolean
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const appKindRef = useRef(appKind)
  const activeRef = useRef(active)
  const syncSizeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    appKindRef.current = appKind
  }, [appKind])

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    const terminal = new Terminal({
      allowTransparency: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'SF Mono, Menlo, Monaco, Consolas, monospace',
      fontSize: 12.5,
      lineHeight: 1.25,
      scrollback: 10000,
      theme: readTerminalTheme(),
    })
    terminalRef.current = terminal
    const fitAddon = new FitAddon()
    const pendingEvents: TerminalSessionDataEvent[] = []
    let disposed = false
    let hasHydrated = false
    let lastSequence = 0
    const readClipboardText = async () => {
      if (typeof window.desktop.readClipboardText === 'function') {
        return window.desktop.readClipboardText()
      }

      return navigator.clipboard.readText()
    }

    const writeClipboardText = async (text: string) => {
      if (typeof window.desktop.writeClipboardText === 'function') {
        window.desktop.writeClipboardText(text)
        return
      }

      await navigator.clipboard.writeText(text)
    }

    const pasteFromClipboard = () => {
      if (appKindRef.current === 'claude') {
        window.desktop.writeTerminalSession(sessionId, '\u0016')
        return
      }

      void readClipboardText()
        .then((text) => {
          if (text) {
            window.desktop.writeTerminalSession(sessionId, text)
          }
        })
        .catch(() => {
          // Ignore clipboard access failures.
        })
    }

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') {
        return true
      }

      event.stopPropagation()

      const key = event.key.toLowerCase()
      const isPrimaryModifier = event.metaKey || event.ctrlKey

      if (isPrimaryModifier && !event.altKey && key === 'k') {
        event.preventDefault()
        terminal.clear()
        window.desktop.writeTerminalSession(sessionId, '\u000c')
        return false
      }

      if (event.metaKey && !event.ctrlKey && !event.altKey && (key === 'backspace' || key === 'delete')) {
        event.preventDefault()
        window.desktop.writeTerminalSession(sessionId, '\u0015')
        return false
      }

      if (
        appKindRef.current !== 'terminal' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.shiftKey &&
        key === 'enter'
      ) {
        event.preventDefault()
        window.desktop.writeTerminalSession(sessionId, '\n')
        return false
      }

      if (event.metaKey && !event.ctrlKey && !event.altKey && key === 'a') {
        event.preventDefault()
        terminal.selectAll()
        return false
      }

      if (event.metaKey && !event.ctrlKey && !event.altKey && key === 'c') {
        const selection = terminal.getSelection()
        if (selection) {
          event.preventDefault()
          void writeClipboardText(selection).catch(() => {
            // Ignore clipboard access failures.
          })
          return false
        }
      }

      if (event.metaKey && !event.ctrlKey && !event.altKey && key === 'v') {
        event.preventDefault()
        pasteFromClipboard()
        return false
      }

      return true
    })

    terminal.loadAddon(fitAddon)
    terminal.open(viewport)

    const handlePaste = (event: ClipboardEvent) => {
      const sessionAppKind = appKindRef.current

      if (sessionAppKind === 'claude') {
        event.preventDefault()
        window.desktop.writeTerminalSession(sessionId, '\u0016')
        return
      }

      const text = event.clipboardData?.getData('text/plain') ?? ''
      if (!text) {
        return
      }

      event.preventDefault()
      window.desktop.writeTerminalSession(sessionId, text)
    }

    viewport.addEventListener('paste', handlePaste)

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (!active || event.defaultPrevented) {
        return
      }

      if (!event.metaKey || event.ctrlKey || event.altKey || event.key.toLowerCase() !== 'v') {
        return
      }

      const eventTarget = event.target
      if (!(eventTarget instanceof Node) || !viewport.contains(eventTarget)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      pasteFromClipboard()
    }

    window.addEventListener('keydown', handleWindowKeyDown, { capture: true })

    const unsubscribeCommandPaste =
      typeof window.desktop.onCommandPaste === 'function'
        ? window.desktop.onCommandPaste(() => {
            if (!activeRef.current) {
              return
            }

            const activeElement = document.activeElement
            if (activeElement instanceof Node && viewport.contains(activeElement)) {
              pasteFromClipboard()
            }
          })
        : () => {}

    const hasVisibleViewportSize = () => {
      const { width, height } = viewport.getBoundingClientRect()
      return width > 0 && height > 0
    }

    const syncSize = () => {
      if (disposed || !hasVisibleViewportSize()) {
        return false
      }

      fitAddon.fit()

      if (terminal.cols > 0 && terminal.rows > 0) {
        window.desktop.resizeTerminalSession(sessionId, terminal.cols, terminal.rows)
      }

      return true
    }

    const scheduleSyncSize = (attempts = 1) => {
      let remainingAttempts = attempts

      const run = () => {
        if (disposed) {
          return
        }

        const didSync = syncSize()
        remainingAttempts -= 1

        if (!didSync && remainingAttempts > 0) {
          window.setTimeout(run, 16)
          return
        }

        if (didSync && remainingAttempts > 0) {
          window.setTimeout(run, 32)
        }
      }

      requestAnimationFrame(run)
    }
    syncSizeRef.current = () => {
      scheduleSyncSize(6)
    }

    const applyEvent = (event: TerminalSessionDataEvent) => {
      if (event.sequence <= lastSequence) {
        return
      }

      lastSequence = event.sequence
      terminal.write(event.data)
    }

    const unsubscribeData = window.desktop.onTerminalSessionData((event) => {
      if (event.sessionId !== sessionId) {
        return
      }

      if (!hasHydrated) {
        pendingEvents.push(event)
        return
      }

      applyEvent(event)
    })

    const terminalDataDisposable = terminal.onData((data) => {
      window.desktop.writeTerminalSession(sessionId, data)
    })

    const terminalBinaryDisposable = terminal.onBinary((data) => {
      window.desktop.writeTerminalSession(sessionId, data)
    })

    const terminalResizeDisposable = terminal.onResize(({ cols, rows }) => {
      if (cols > 0 && rows > 0) {
        window.desktop.resizeTerminalSession(sessionId, cols, rows)
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      scheduleSyncSize(2)
    })
    resizeObserver.observe(viewport)

    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = readTerminalTheme()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })

    void window.desktop
      .getTerminalSessionSnapshot(sessionId)
      .then((snapshot) => {
        if (disposed) {
          return
        }

        terminal.clear()
        terminal.write(snapshot.buffer)
        lastSequence = snapshot.sequence
        hasHydrated = true

        pendingEvents
          .sort((left, right) => left.sequence - right.sequence)
          .forEach(applyEvent)

        scheduleSyncSize(6)
      })
      .catch(() => {
        if (!disposed) {
          terminal.writeln('\r\n[Terminal session unavailable]')
        }
      })

    return () => {
      disposed = true
      terminalRef.current = null
      syncSizeRef.current = null
      viewport.removeEventListener('paste', handlePaste)
      window.removeEventListener('keydown', handleWindowKeyDown, { capture: true })
      unsubscribeCommandPaste()
      resizeObserver.disconnect()
      themeObserver.disconnect()
      terminalDataDisposable.dispose()
      terminalBinaryDisposable.dispose()
      terminalResizeDisposable.dispose()
      unsubscribeData()
      terminal.dispose()
    }
  }, [sessionId])

  useEffect(() => {
    if (active) {
      syncSizeRef.current?.()
      requestAnimationFrame(() => {
        syncSizeRef.current?.()
      })
      terminalRef.current?.scrollToBottom()
      terminalRef.current?.focus()
    }
  }, [active])

  return (
    <div
      data-terminal-root="true"
      className="flex size-full min-h-0 min-w-0 overflow-hidden bg-background"
      onMouseDown={() => {
        terminalRef.current?.focus()
      }}
    >
      <div ref={viewportRef} className="size-full min-h-0 min-w-0" />
    </div>
  )
}
