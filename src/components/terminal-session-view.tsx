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
  active = true,
}: {
  sessionId: string
  active?: boolean
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)

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

      if (event.metaKey && !event.ctrlKey && !event.altKey && key === 'a') {
        event.preventDefault()
        terminal.selectAll()
        return false
      }

      if (event.metaKey && !event.ctrlKey && !event.altKey && key === 'c') {
        const selection = terminal.getSelection()
        if (selection) {
          event.preventDefault()
          void navigator.clipboard.writeText(selection)
          return false
        }
      }

      if (event.metaKey && !event.ctrlKey && !event.altKey && key === 'v') {
        event.preventDefault()
        void navigator.clipboard.readText().then((text) => {
          if (text) {
            window.desktop.writeTerminalSession(sessionId, text)
          }
        })
        return false
      }

      return true
    })

    terminal.loadAddon(fitAddon)
    terminal.open(viewport)

    const syncSize = () => {
      requestAnimationFrame(() => {
        if (disposed) {
          return
        }

        fitAddon.fit()

        if (terminal.cols > 0 && terminal.rows > 0) {
          window.desktop.resizeTerminalSession(sessionId, terminal.cols, terminal.rows)
        }
      })
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
      syncSize()
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

        syncSize()
      })
      .catch(() => {
        if (!disposed) {
          terminal.writeln('\r\n[Terminal session unavailable]')
        }
      })

    return () => {
      disposed = true
      terminalRef.current = null
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
