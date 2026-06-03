#!/usr/bin/env node
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
let expectedToken = null

function parseArgs(argv) {
  const args = new Map()

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (!arg.startsWith('--')) {
      continue
    }

    args.set(arg.slice(2), argv[index + 1])
    index += 1
  }

  return args
}

function assertNormalSystemContext() {
  try {
    os.uptime()
  } catch (error) {
    console.error(
      [
        'dev6 command helper must be started from a normal Terminal session.',
        'This process is restricted and child commands would inherit the restriction.',
        error instanceof Error ? error.message : String(error),
      ].join('\n'),
    )
    process.exit(1)
  }
}

async function writeJSONFile(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.tmp`
  await fs.promises.writeFile(tempPath, JSON.stringify(value), { encoding: 'utf-8', mode: 0o600 })
  await fs.promises.rename(tempPath, filePath)
}

async function runCommand(request) {
  if (expectedToken && request?.token !== expectedToken) {
    return {
      id: typeof request?.id === 'string' ? request.id : '',
      exitCode: 1,
      stderr: 'Invalid command helper token.',
    }
  }

  if (
    !request ||
    typeof request.id !== 'string' ||
    typeof request.command !== 'string' ||
    typeof request.cwd !== 'string'
  ) {
    return {
      id: typeof request?.id === 'string' ? request.id : '',
      exitCode: 1,
      stderr: 'Invalid command helper request.',
    }
  }

  const shellPath = process.env.SHELL || '/bin/zsh'
  const maxBuffer =
    typeof request.maxBuffer === 'number' && Number.isFinite(request.maxBuffer)
      ? request.maxBuffer
      : 10 * 1024 * 1024

  try {
    const { stdout, stderr } = await execFileAsync(shellPath, ['-lc', request.command], {
      cwd: request.cwd,
      encoding: 'utf-8',
      env: process.env,
      maxBuffer,
    })

    return {
      id: request.id,
      stdout,
      stderr,
      exitCode: 0,
    }
  } catch (error) {
    return {
      id: request.id,
      stdout: typeof error?.stdout === 'string' ? error.stdout : '',
      stderr: typeof error?.stderr === 'string' ? error.stderr : error?.message ?? String(error),
      exitCode: typeof error?.code === 'number' ? error.code : 1,
      error: error?.message ?? String(error),
    }
  }
}

async function main() {
  assertNormalSystemContext()

  const args = parseArgs(process.argv.slice(2))
  const helperDir =
    args.get('dir') ||
    path.join(os.homedir(), 'Library', 'Application Support', 'dev6', 'command-helper')
  const heartbeatPath = path.join(helperDir, 'heartbeat.json')
  const processing = new Set()

  expectedToken = args.get('token') || null

  await fs.promises.mkdir(helperDir, { recursive: true, mode: 0o700 })
  await fs.promises.chmod(helperDir, 0o700)

  async function writeHeartbeat() {
    await writeJSONFile(heartbeatPath, {
      pid: process.pid,
      updatedAt: Date.now(),
    })
  }

  async function processRequest(requestFileName) {
    if (processing.has(requestFileName)) {
      return
    }

    processing.add(requestFileName)

    const requestPath = path.join(helperDir, requestFileName)

    try {
      const request = JSON.parse(await fs.promises.readFile(requestPath, 'utf-8'))
      const response = await runCommand(request)
      const responsePath = path.join(helperDir, `response-${request.id}.json`)
      await writeJSONFile(responsePath, response)
      await fs.promises.rm(requestPath, { force: true })
    } catch (error) {
      const fallbackId = requestFileName.replace(/^request-/, '').replace(/\.json$/, '')
      await writeJSONFile(path.join(helperDir, `response-${fallbackId}.json`), {
        id: fallbackId,
        exitCode: 1,
        stderr: error instanceof Error ? error.message : String(error),
      })
    } finally {
      processing.delete(requestFileName)
    }
  }

  async function scanRequests() {
    const fileNames = await fs.promises.readdir(helperDir)

    await Promise.all(
      fileNames.map(async (fileName) => {
        if (!fileName.startsWith('request-') || !fileName.endsWith('.json')) {
          return
        }

        await processRequest(fileName)
      }),
    )
  }

  await writeHeartbeat()
  const heartbeatInterval = setInterval(() => {
    void writeHeartbeat().catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
    })
  }, 1000)
  const scanInterval = setInterval(() => {
    void scanRequests().catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
    })
  }, 250)

  fs.watch(helperDir, () => {
    void scanRequests().catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
    })
  })

  console.log(`dev6 command helper watching ${helperDir}`)

  function shutdown() {
    clearInterval(heartbeatInterval)
    clearInterval(scanInterval)

    void fs.promises
      .rm(heartbeatPath, { force: true })
      .finally(() => {
        process.exit(0)
      })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
