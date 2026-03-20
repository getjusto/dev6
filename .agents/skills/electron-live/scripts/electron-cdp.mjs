#!/usr/bin/env node

import fs from 'node:fs'

const args = process.argv.slice(2)
const command = args[0]

function parseFlags(values) {
  const flags = {
    host: '127.0.0.1',
    port: '9222',
    match: '',
    targetId: '',
  }
  const positional = []

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--host') {
      flags.host = values[index + 1] ?? flags.host
      index += 1
      continue
    }
    if (value === '--port') {
      flags.port = values[index + 1] ?? flags.port
      index += 1
      continue
    }
    if (value === '--match') {
      flags.match = values[index + 1] ?? flags.match
      index += 1
      continue
    }
    if (value === '--target-id') {
      flags.targetId = values[index + 1] ?? flags.targetId
      index += 1
      continue
    }
    positional.push(value)
  }

  return { flags, positional }
}

async function getJson(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

async function listTargets({ host, port }) {
  return getJson(`http://${host}:${port}/json/list`)
}

function selectTarget(targets, { match, targetId }) {
  if (targetId) {
    const exact = targets.find((target) => target.id === targetId)
    if (!exact) {
      throw new Error(`No target found for id ${targetId}`)
    }
    return exact
  }

  const visiblePages = targets.filter((target) => target.type === 'page' && target.title !== 'DevTools')
  const preferred = match
    ? visiblePages.filter((target) => target.title.includes(match) || target.url.includes(match))
    : visiblePages

  if (preferred.length === 0) {
    throw new Error('No matching Electron page target found.')
  }

  return preferred[0]
}

async function withCdp(webSocketDebuggerUrl, fn) {
  const socket = new WebSocket(webSocketDebuggerUrl)
  let nextId = 0
  const pending = new Map()

  const send = (method, params = {}) => {
    const id = ++nextId
    socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
    })
  }

  return new Promise((resolve, reject) => {
    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data)
      if (!payload.id || !pending.has(payload.id)) {
        return
      }
      const { resolve: resolvePending, reject: rejectPending } = pending.get(payload.id)
      pending.delete(payload.id)
      if (payload.error) {
        rejectPending(new Error(payload.error.message))
        return
      }
      resolvePending(payload.result)
    })

    socket.addEventListener('error', (event) => {
      reject(new Error(event.message || 'WebSocket connection failed.'))
    })

    socket.addEventListener('open', async () => {
      try {
        const result = await fn(send)
        socket.close()
        resolve(result)
      } catch (error) {
        socket.close()
        reject(error)
      }
    })
  })
}

async function run() {
  if (!command || ['help', '--help', '-h'].includes(command)) {
    console.log(`Usage:
  electron-cdp.mjs targets [--host 127.0.0.1] [--port 9222] [--match text]
  electron-cdp.mjs inspect [--host 127.0.0.1] [--port 9222] [--match text] [--target-id id]
  electron-cdp.mjs screenshot <output-path> [--host 127.0.0.1] [--port 9222] [--match text] [--target-id id]
  electron-cdp.mjs eval <expression> [--host 127.0.0.1] [--port 9222] [--match text] [--target-id id]`)
    return
  }

  const { flags, positional } = parseFlags(args.slice(1))

  if (command === 'targets') {
    const targets = await listTargets(flags)
    const filtered = flags.match
      ? targets.filter((target) => target.title.includes(flags.match) || target.url.includes(flags.match))
      : targets
    console.log(JSON.stringify(filtered, null, 2))
    return
  }

  const targets = await listTargets(flags)
  const target = selectTarget(targets, flags)

  if (command === 'inspect') {
    const result = await withCdp(target.webSocketDebuggerUrl, async (send) => {
      await send('Page.enable')
      await send('Runtime.enable')
      const response = await send('Runtime.evaluate', {
        expression: `JSON.stringify({
          href: location.href,
          title: document.title,
          bodyText: document.body ? document.body.innerText : '',
          htmlSnippet: document.body ? document.body.innerHTML.slice(0, 2000) : ''
        })`,
        returnByValue: true,
      })
      return JSON.parse(response.result.value)
    })
    console.log(JSON.stringify({ target, ...result }, null, 2))
    return
  }

  if (command === 'screenshot') {
    const outputPath = positional[0]
    if (!outputPath) {
      throw new Error('screenshot requires an output path')
    }
    await withCdp(target.webSocketDebuggerUrl, async (send) => {
      await send('Page.enable')
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(outputPath, Buffer.from(data, 'base64'))
    })
    console.log(outputPath)
    return
  }

  if (command === 'eval') {
    const expression = positional[0]
    if (!expression) {
      throw new Error('eval requires a JavaScript expression')
    }
    const result = await withCdp(target.webSocketDebuggerUrl, async (send) => {
      await send('Runtime.enable')
      const response = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
      })
      return response.result.value
    })
    console.log(
      typeof result === 'string' ? result : JSON.stringify(result, null, 2),
    )
    return
  }

  throw new Error(`Unknown command: ${command}`)
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
