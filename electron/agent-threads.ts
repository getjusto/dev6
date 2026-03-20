import type { ChildProcessByStdio } from 'node:child_process'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { BrowserWindow } from 'electron'
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
  type Client,
  type ContentBlock,
  type InitializeResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionConfigOption,
  type SessionNotification,
  type ToolCall,
  type ToolCallUpdate,
} from '@agentclientprotocol/sdk'

type AgentThreadStatus =
  | 'draft'
  | 'connecting'
  | 'ready'
  | 'running'
  | 'error'
  | 'disconnected'

type AgentKind = 'codex' | 'claude'

type AgentThreadImageAttachment = {
  id: string
  mimeType: string
  dataUrl: string
}

type AgentThreadMessageItem = {
  id: string
  type: 'message'
  role: 'user' | 'assistant' | 'thought'
  text: string
  attachments: AgentThreadImageAttachment[]
  createdAt: number
}

type AgentThreadToolCallItem = {
  id: string
  type: 'tool_call'
  toolCallId: string
  title: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'unknown'
  kind: string | null
  locations: string[]
  rawInput: string | null
  rawOutput: string | null
  contentSummary: string | null
  updatedAt: number
}

type AgentThreadPlanItem = {
  id: string
  type: 'plan'
  entries: Array<{
    content: string
    priority: 'high' | 'medium' | 'low'
    status: 'pending' | 'in_progress' | 'completed'
  }>
  updatedAt: number
}

type AgentThreadNoticeItem = {
  id: string
  type: 'notice'
  level: 'info' | 'error'
  text: string
  createdAt: number
}

type AgentThreadItem =
  | AgentThreadMessageItem
  | AgentThreadToolCallItem
  | AgentThreadPlanItem
  | AgentThreadNoticeItem

type AgentThreadPermissionRequest = {
  toolCallId: string
  title: string
  kind: string | null
  status: string | null
  locations: string[]
  rawInput: string | null
  options: Array<{
    optionId: string
    name: string
    kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'
  }>
}

type AgentThreadPromptInput = {
  text?: string | null
  images?: Array<{
    mimeType: string
    dataUrl: string
  }> | null
}

export type AgentThreadAvailableCommand = {
  name: string
  description: string | null
  inputHint: string | null
}

export type AgentThreadConfigOption = {
  id: string
  name: string
  description: string | null
  category: string | null
  type: 'select' | 'boolean'
  currentValue: string | boolean
  options: Array<{
    value: string
    name: string
    description: string | null
    group: string | null
    groupName: string | null
  }>
}

export type AgentThreadSettings = {
  model: string | null
  reasoningEffort: string | null
  mode: string | null
}

export type AgentThreadRecord = {
  id: string
  title: string
  sessionTitle: string | null
  agentKind: AgentKind
  launchCommand: string
  cwd: string
  settings: AgentThreadSettings
  sessionId: string | null
  createdAt: number
  updatedAt: number
  status: AgentThreadStatus
  errorMessage: string | null
  agentName: string | null
  agentVersion: string | null
  availableCommands: AgentThreadAvailableCommand[]
  pendingPermission: AgentThreadPermissionRequest | null
  items: AgentThreadItem[]
}

type StoredAgentThreadRecord = Omit<AgentThreadRecord, 'pendingPermission' | 'availableCommands'>

type AgentThreadRuntime = {
  child: ChildProcessByStdio<Writable, Readable, null>
  connection: ClientSideConnection
  initializeResponse: InitializeResponse | null
  promptPromise: Promise<void> | null
  pendingPermission: {
    request: AgentThreadPermissionRequest
    resolve: (response: RequestPermissionResponse) => void
  } | null
  connectPromise: Promise<void>
  closed: boolean
  intentionalClose: boolean
}

type AgentThreadManagerOptions = {
  clientName: string
  clientVersion: string
  getCommandEnv: () => Promise<NodeJS.ProcessEnv>
  getDefaultCwd: () => string
}

const DEV6_HOME_DIR = path.join(os.homedir(), '.dev6')
const DEV6_THREADS_PATH = path.join(DEV6_HOME_DIR, 'agent-threads.json')
const AGENT_COMMANDS: Record<AgentKind, string> = {
  codex: 'npx @zed-industries/codex-acp',
  claude: 'npx @zed-industries/claude-agent-acp',
}
const EMPTY_THREAD_SETTINGS: AgentThreadSettings = {
  model: null,
  reasoningEffort: null,
  mode: null,
}

function isAgentKind(value: unknown): value is AgentKind {
  return value === 'codex' || value === 'claude'
}

function inferAgentKind(value: unknown, launchCommand?: string): AgentKind {
  if (isAgentKind(value)) {
    return value
  }

  if (typeof launchCommand === 'string' && launchCommand.toLowerCase().includes('claude')) {
    return 'claude'
  }

  return 'codex'
}

function getLaunchCommand(agentKind: AgentKind) {
  return AGENT_COMMANDS[agentKind]
}

function normalizeThreadSettings(value: unknown): AgentThreadSettings {
  if (!value || typeof value !== 'object') {
    return { ...EMPTY_THREAD_SETTINGS }
  }

  const settings = value as Record<string, unknown>

  return {
    model: typeof settings.model === 'string' ? settings.model : null,
    reasoningEffort:
      typeof settings.reasoningEffort === 'string'
        ? settings.reasoningEffort
        : typeof settings.reasoning_effort === 'string'
          ? settings.reasoning_effort
          : null,
    mode: typeof settings.mode === 'string' ? settings.mode : null,
  }
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return 'Unknown ACP error.'
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function ensureDirectory(targetPath: string) {
  fs.mkdirSync(targetPath, { recursive: true })
}

function serializeUnknown(value: unknown) {
  if (value == null) {
    return null
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function normalizeConfigOptions(configOptions: SessionConfigOption[]): AgentThreadConfigOption[] {
  return configOptions.map((configOption) => {
    if (configOption.type === 'boolean') {
      return {
        id: configOption.id,
        name: configOption.name,
        description: configOption.description ?? null,
        category: configOption.category ?? null,
        type: 'boolean',
        currentValue: configOption.currentValue,
        options: [],
      }
    }

    return {
      id: configOption.id,
      name: configOption.name,
      description: configOption.description ?? null,
      category: configOption.category ?? null,
      type: 'select',
      currentValue: configOption.currentValue,
      options: configOption.options.flatMap<AgentThreadConfigOption['options'][number]>((option) => {
        if ('group' in option) {
          return option.options.map((groupOption) => ({
            value: groupOption.value,
            name: groupOption.name,
            description: groupOption.description ?? null,
            group: option.group,
            groupName: option.name,
          }))
        }

        return [
          {
            value: option.value,
            name: option.name,
            description: option.description ?? null,
            group: null,
            groupName: null,
          },
        ]
      }),
    }
  })
}

function summarizeToolContent(content: ToolCall['content'] | ToolCallUpdate['content']) {
  if (!content || content.length === 0) {
    return null
  }

  return content
    .map((entry) => {
      if (entry.type === 'content') {
        if (entry.content.type === 'text') {
          return entry.content.text
        }

        return `[${entry.content.type}]`
      }

      if (entry.type === 'diff') {
        return `Diff: ${entry.path}`
      }

      return `Terminal: ${entry.terminalId}`
    })
    .join('\n\n')
}

function normalizeLocations(
  locations: ToolCall['locations'] | ToolCallUpdate['locations'],
): string[] {
  if (!locations || locations.length === 0) {
    return []
  }

  return locations.map((location) =>
    typeof location.line === 'number' ? `${location.path}:${location.line}` : location.path,
  )
}

function normalizePermissionRequest(params: RequestPermissionRequest): AgentThreadPermissionRequest {
  return {
    toolCallId: params.toolCall.toolCallId,
    title: params.toolCall.title ?? 'Permission request',
    kind: params.toolCall.kind ?? null,
    status: params.toolCall.status ?? null,
    locations: normalizeLocations(params.toolCall.locations),
    rawInput: serializeUnknown(params.toolCall.rawInput),
    options: params.options.map((option) => ({
      optionId: option.optionId,
      name: option.name,
      kind: option.kind,
    })),
  }
}

function summarizeContentBlock(content: { content: Record<string, unknown> & { type: string } }) {
  const value = content.content
  if (value.type === 'text') {
    return typeof value.text === 'string' ? value.text : null
  }

  if (value.type === 'resource_link') {
    return typeof value.uri === 'string' ? value.uri : null
  }

  if (value.type === 'resource') {
    const resource = value.resource
    if (resource && typeof resource === 'object' && 'uri' in resource && typeof resource.uri === 'string') {
      return resource.uri
    }

    return '[resource]'
  }

  return `[${value.type}]`
}

function normalizeStoredItem(item: unknown): AgentThreadItem | null {
  if (!item || typeof item !== 'object' || !('type' in item)) {
    return null
  }

  const value = item as Record<string, unknown>
  if (value.type === 'message') {
    if (
      (value.role === 'user' || value.role === 'assistant' || value.role === 'thought') &&
      typeof value.text === 'string'
    ) {
      const attachments = Array.isArray(value.attachments)
        ? value.attachments
            .map((attachment) => {
              if (!attachment || typeof attachment !== 'object') {
                return null
              }

              const nextAttachment = attachment as Record<string, unknown>
              if (
                typeof nextAttachment.mimeType !== 'string' ||
                typeof nextAttachment.dataUrl !== 'string'
              ) {
                return null
              }

              return {
                id:
                  typeof nextAttachment.id === 'string'
                    ? nextAttachment.id
                    : crypto.randomUUID(),
                mimeType: nextAttachment.mimeType,
                dataUrl: nextAttachment.dataUrl,
              }
            })
            .filter(
              (attachment): attachment is AgentThreadImageAttachment => attachment !== null,
            )
        : []

      return {
        id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
        type: 'message',
        role: value.role,
        text: value.text,
        attachments,
        createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
      }
    }
    return null
  }

  if (value.type === 'tool_call' && typeof value.toolCallId === 'string') {
    return {
      id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
      type: 'tool_call',
      toolCallId: value.toolCallId,
      title: typeof value.title === 'string' ? value.title : 'Tool call',
      status:
        value.status === 'pending' ||
        value.status === 'in_progress' ||
        value.status === 'completed' ||
        value.status === 'failed'
          ? value.status
          : 'unknown',
      kind: typeof value.kind === 'string' ? value.kind : null,
      locations: Array.isArray(value.locations)
        ? value.locations.filter((location): location is string => typeof location === 'string')
        : [],
      rawInput: typeof value.rawInput === 'string' ? value.rawInput : null,
      rawOutput: typeof value.rawOutput === 'string' ? value.rawOutput : null,
      contentSummary: typeof value.contentSummary === 'string' ? value.contentSummary : null,
      updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    }
  }

  if (value.type === 'plan' && Array.isArray(value.entries)) {
    return {
      id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
      type: 'plan',
      entries: value.entries
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null
          }

          const nextEntry = entry as Record<string, unknown>
          if (
            typeof nextEntry.content !== 'string' ||
            (nextEntry.priority !== 'high' &&
              nextEntry.priority !== 'medium' &&
              nextEntry.priority !== 'low') ||
            (nextEntry.status !== 'pending' &&
              nextEntry.status !== 'in_progress' &&
              nextEntry.status !== 'completed')
          ) {
            return null
          }

          return {
            content: nextEntry.content,
            priority: nextEntry.priority,
            status: nextEntry.status,
          }
        })
        .filter(
          (
            entry,
          ): entry is {
            content: string
            priority: 'high' | 'medium' | 'low'
            status: 'pending' | 'in_progress' | 'completed'
          } => entry !== null,
        ),
      updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    }
  }

  if (
    value.type === 'notice' &&
    (value.level === 'info' || value.level === 'error') &&
    typeof value.text === 'string'
  ) {
    return {
      id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
      type: 'notice',
      level: value.level,
      text: value.text,
      createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
    }
  }

  return null
}

function normalizeStoredThread(
  value: unknown,
  defaultCwd: () => string,
): AgentThreadRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const thread = value as Record<string, unknown>
  if (typeof thread.id !== 'string') {
    return null
  }

  const cwd =
    typeof thread.cwd === 'string' && path.isAbsolute(thread.cwd) ? thread.cwd : defaultCwd()
  const storedLaunchCommand =
    typeof thread.launchCommand === 'string' ? thread.launchCommand : ''
  const agentKind = inferAgentKind(thread.agentKind, storedLaunchCommand)
  const launchCommand = getLaunchCommand(agentKind)

  return {
    id: thread.id,
    title: typeof thread.title === 'string' ? thread.title : '',
    sessionTitle: typeof thread.sessionTitle === 'string' ? thread.sessionTitle : null,
    agentKind,
    launchCommand,
    cwd,
    settings: normalizeThreadSettings(thread.settings),
    sessionId: typeof thread.sessionId === 'string' ? thread.sessionId : null,
    createdAt: typeof thread.createdAt === 'number' ? thread.createdAt : Date.now(),
    updatedAt: typeof thread.updatedAt === 'number' ? thread.updatedAt : Date.now(),
    status: 'disconnected',
    errorMessage: null,
    agentName: typeof thread.agentName === 'string' ? thread.agentName : null,
    agentVersion: typeof thread.agentVersion === 'string' ? thread.agentVersion : null,
    availableCommands: [],
    pendingPermission: null,
    items: Array.isArray(thread.items)
      ? thread.items
          .map(normalizeStoredItem)
          .filter((item): item is AgentThreadItem => item !== null)
      : [],
  }
}

function normalizePromptInput(prompt: string | AgentThreadPromptInput) {
  if (typeof prompt === 'string') {
    return {
      text: prompt.trim(),
      images: [] as Array<{ mimeType: string; dataUrl: string }>,
    }
  }

  const images = Array.isArray(prompt.images)
    ? prompt.images.filter(
        (image): image is { mimeType: string; dataUrl: string } =>
          Boolean(
            image &&
              typeof image === 'object' &&
              typeof image.mimeType === 'string' &&
              typeof image.dataUrl === 'string',
          ),
      )
    : []

  return {
    text: typeof prompt.text === 'string' ? prompt.text.trim() : '',
    images,
  }
}

function parseImageDataUrl(dataUrl: string, expectedMimeType: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/)
  if (!match) {
    throw new Error('Image paste data is not a valid base64 data URL.')
  }

  const mimeType = match[1]
  const data = match[2]
  if (mimeType !== expectedMimeType) {
    throw new Error(`Image mime type mismatch. Expected ${expectedMimeType}, got ${mimeType}.`)
  }

  return {
    mimeType,
    data,
  }
}

export class AgentThreadManager {
  private readonly options: AgentThreadManagerOptions
  private readonly threads = new Map<string, AgentThreadRecord>()
  private readonly runtimes = new Map<string, AgentThreadRuntime>()
  private readonly optionCache = new Map<AgentKind, AgentThreadConfigOption[]>()
  private persistTimer: NodeJS.Timeout | null = null

  constructor(options: AgentThreadManagerOptions) {
    this.options = options
  }

  listThreads() {
    return cloneValue(
      [...this.threads.values()].sort((left, right) => left.createdAt - right.createdAt),
    )
  }

  async restoreThreads() {
    const restoredThreads = this.readStoredThreads()
    this.threads.clear()

    for (const thread of restoredThreads) {
      this.threads.set(thread.id, thread)
    }

    this.sendThreadsChanged()

    for (const thread of restoredThreads) {
      if (!thread.launchCommand.trim()) {
        continue
      }

      void this.connectThread(thread.id).catch(() => {
        // The thread state already stores the failure.
      })
    }
  }

  createThread(agentKind: AgentKind = 'codex') {
    const threadCount =
      Array.from(this.threads.values()).filter((thread) => thread.agentKind === agentKind).length + 1
    const agentLabel = agentKind === 'claude' ? 'Claude' : 'Codex'
    const now = Date.now()
    const thread: AgentThreadRecord = {
      id: `agent_${crypto.randomUUID()}`,
      title: `${agentLabel} ${threadCount}`,
      sessionTitle: null,
      agentKind,
      launchCommand: getLaunchCommand(agentKind),
      cwd: this.options.getDefaultCwd(),
      settings: { ...EMPTY_THREAD_SETTINGS },
      sessionId: null,
      createdAt: now,
      updatedAt: now,
      status: 'disconnected',
      errorMessage: null,
      agentName: null,
      agentVersion: null,
      availableCommands: [],
      pendingPermission: null,
      items: [],
    }

    this.threads.set(thread.id, thread)
    this.schedulePersist()
    this.sendThreadsChanged()
    return cloneValue(thread)
  }

  async updateThread(
    threadId: string,
    patch: Partial<Pick<AgentThreadRecord, 'title'>> & {
      settings?: Partial<AgentThreadSettings>
    },
  ) {
    this.mutateThread(threadId, (currentThread) => {
      if (typeof patch.title === 'string') {
        currentThread.title = patch.title
      }

      if (patch.settings) {
        const nextSettings = patch.settings as Record<string, unknown>

        currentThread.settings = {
          model:
            typeof nextSettings.model === 'string' || nextSettings.model === null
              ? (nextSettings.model as string | null)
              : currentThread.settings.model,
          reasoningEffort:
            typeof nextSettings.reasoningEffort === 'string' ||
            nextSettings.reasoningEffort === null
              ? (nextSettings.reasoningEffort as string | null)
              : currentThread.settings.reasoningEffort,
          mode:
            typeof nextSettings.mode === 'string' || nextSettings.mode === null
              ? (nextSettings.mode as string | null)
              : currentThread.settings.mode,
        }
      }
    })

    const runtime = this.runtimes.get(threadId)
    const thread = this.getThread(threadId)
    if (runtime && thread.sessionId && patch.settings) {
      await this.applyThreadSettings(threadId, runtime)
    }

    return this.getThreadClone(threadId)
  }

  async listAvailableOptions(agentKind: AgentKind) {
    const cachedOptions = this.optionCache.get(agentKind)
    if (cachedOptions) {
      return cloneValue(cachedOptions)
    }

    const options = await this.inspectAvailableOptions(agentKind)
    this.optionCache.set(agentKind, options)
    return cloneValue(options)
  }

  async deleteThread(threadId: string) {
    await this.disconnectThread(threadId, { closeRemoteSession: true })
    this.threads.delete(threadId)
    this.schedulePersist()
    this.sendThreadsChanged()
    return { ok: true }
  }

  async connectThread(threadId: string) {
    const thread = this.getThread(threadId)
    const existingRuntime = this.runtimes.get(threadId)
    if (existingRuntime) {
      await existingRuntime.connectPromise
      return this.getThreadClone(threadId)
    }

    const env = await this.options.getCommandEnv()
    const shellPath = env.SHELL || '/bin/zsh'
    const child = spawn(shellPath, ['-lc', thread.launchCommand], {
      cwd: thread.cwd,
      env,
      stdio: ['pipe', 'pipe', 'inherit'],
    })

    const stream = ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout),
    )
    const client = this.createClient(threadId)
    const connection = new ClientSideConnection(() => client, stream)
    const runtime: AgentThreadRuntime = {
      child,
      connection,
      initializeResponse: null,
      promptPromise: null,
      pendingPermission: null,
      connectPromise: Promise.resolve(),
      closed: false,
      intentionalClose: false,
    }

    runtime.connectPromise = this.initializeRuntime(threadId, runtime)
    this.runtimes.set(threadId, runtime)

    child.on('exit', (code, signal) => {
      if (runtime.closed || runtime.intentionalClose) {
        return
      }

      const detail =
        typeof code === 'number'
          ? `Agent process exited with code ${code}.`
          : signal
            ? `Agent process exited with signal ${signal}.`
            : 'Agent process exited unexpectedly.'
      this.finalizeRuntime(threadId, runtime, 'error', detail)
    })

    void connection.closed.catch(() => {
      // The state transition is handled by the child exit/finalizer path.
    })

    await runtime.connectPromise
    return this.getThreadClone(threadId)
  }

  async disconnectThread(
    threadId: string,
    options: {
      closeRemoteSession?: boolean
    } = {},
  ) {
    const runtime = this.runtimes.get(threadId)
    if (!runtime) {
      return { ok: true }
    }

    runtime.intentionalClose = true

    if (runtime.pendingPermission) {
      runtime.pendingPermission.resolve({ outcome: { outcome: 'cancelled' } })
      runtime.pendingPermission = null
    }

    const thread = this.threads.get(threadId)
    if (
      options.closeRemoteSession &&
      thread?.sessionId &&
      runtime.initializeResponse?.agentCapabilities?.sessionCapabilities?.close
    ) {
      try {
        await runtime.connection.unstable_closeSession({ sessionId: thread.sessionId })
      } catch {
        // Ignore remote cleanup failures while closing a local tab.
      }
    }

    this.finalizeRuntime(threadId, runtime, 'disconnected')

    try {
      runtime.child.kill()
    } catch {
      // noop
    }

    return { ok: true }
  }

  async sendPrompt(threadId: string, prompt: string | AgentThreadPromptInput) {
    const normalizedPrompt = normalizePromptInput(prompt)
    if (!normalizedPrompt.text && normalizedPrompt.images.length === 0) {
      throw new Error('Prompt cannot be empty.')
    }

    await this.connectThread(threadId)

    const runtime = this.runtimes.get(threadId)
    const thread = this.getThread(threadId)
    if (!runtime || !thread.sessionId) {
      throw new Error('Thread is not connected to an ACP session.')
    }

    if (runtime.promptPromise) {
      throw new Error('This agent thread is already processing a prompt.')
    }

    const promptBlocks: ContentBlock[] = []
    if (normalizedPrompt.text) {
      promptBlocks.push({
        type: 'text',
        text: normalizedPrompt.text,
      })
    }

    const imageAttachments = normalizedPrompt.images.map((image) => {
      const parsedImage = parseImageDataUrl(image.dataUrl, image.mimeType)
      promptBlocks.push({
        type: 'image',
        mimeType: parsedImage.mimeType,
        data: parsedImage.data,
      })

      return {
        id: crypto.randomUUID(),
        mimeType: image.mimeType,
        dataUrl: image.dataUrl,
      }
    })

    const now = Date.now()
    this.mutateThread(threadId, (currentThread) => {
      currentThread.status = 'running'
      currentThread.errorMessage = null
      currentThread.items.push({
        id: crypto.randomUUID(),
        type: 'message',
        role: 'user',
        text: normalizedPrompt.text,
        attachments: imageAttachments,
        createdAt: now,
      })
    })

    runtime.promptPromise = (async () => {
      try {
        const result = await runtime.connection.prompt({
          sessionId: thread.sessionId!,
          prompt: promptBlocks,
        })

        if (result.stopReason !== 'end_turn' && result.stopReason !== 'cancelled') {
          this.appendNotice(
            threadId,
            'info',
            `Turn finished with stop reason "${result.stopReason}".`,
          )
        }
      } catch (error) {
        this.appendNotice(threadId, 'error', toErrorMessage(error))
        this.mutateThread(threadId, (currentThread) => {
          currentThread.status = 'error'
          currentThread.errorMessage = toErrorMessage(error)
        })
        return
      } finally {
        if (runtime.pendingPermission) {
          runtime.pendingPermission.resolve({ outcome: { outcome: 'cancelled' } })
          runtime.pendingPermission = null
        }

        if (this.runtimes.get(threadId) === runtime) {
          runtime.promptPromise = null
          this.mutateThread(threadId, (currentThread) => {
            currentThread.pendingPermission = null
            if (currentThread.status !== 'error') {
              currentThread.status = 'ready'
            }
          })
        }
      }
    })()

    await runtime.promptPromise
    return this.getThreadClone(threadId)
  }

  async cancelPrompt(threadId: string) {
    const runtime = this.runtimes.get(threadId)
    const thread = this.getThread(threadId)
    if (!runtime || !thread.sessionId) {
      return { ok: true }
    }

    if (runtime.pendingPermission) {
      runtime.pendingPermission.resolve({ outcome: { outcome: 'cancelled' } })
      runtime.pendingPermission = null
    }

    this.mutateThread(threadId, (currentThread) => {
      currentThread.pendingPermission = null
    })

    await runtime.connection.cancel({ sessionId: thread.sessionId })
    return { ok: true }
  }

  async resolvePermission(threadId: string, optionId: string | null) {
    const runtime = this.runtimes.get(threadId)
    if (!runtime?.pendingPermission) {
      throw new Error('No pending permission request for this thread.')
    }

    const request = runtime.pendingPermission.request
    if (optionId && !request.options.some((option) => option.optionId === optionId)) {
      throw new Error('Unknown permission option.')
    }

    runtime.pendingPermission.resolve(
      optionId
        ? {
            outcome: {
              outcome: 'selected',
              optionId,
            },
          }
        : {
            outcome: {
              outcome: 'cancelled',
            },
          },
    )
    runtime.pendingPermission = null

    this.mutateThread(threadId, (thread) => {
      thread.pendingPermission = null
    })

    return { ok: true }
  }

  disposeAllThreads() {
    for (const threadId of this.runtimes.keys()) {
      void this.disconnectThread(threadId)
    }

    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }

    this.flushPersist()
  }

  private readStoredThreads() {
    try {
      const raw = fs.readFileSync(DEV6_THREADS_PATH, 'utf-8')
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        return []
      }

      return parsed
        .map((thread) => normalizeStoredThread(thread, this.options.getDefaultCwd))
        .filter((thread): thread is AgentThreadRecord => thread !== null)
    } catch {
      return []
    }
  }

  private flushPersist() {
    const payload: StoredAgentThreadRecord[] = [...this.threads.values()].map((thread) => ({
      id: thread.id,
      title: thread.title,
      sessionTitle: thread.sessionTitle,
      agentKind: thread.agentKind,
      launchCommand: thread.launchCommand,
      cwd: thread.cwd,
      settings: thread.settings,
      sessionId: thread.sessionId,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      status: thread.status,
      errorMessage: thread.errorMessage,
      agentName: thread.agentName,
      agentVersion: thread.agentVersion,
      items: thread.items,
    }))

    ensureDirectory(DEV6_HOME_DIR)
    const nextPath = `${DEV6_THREADS_PATH}.tmp`
    fs.writeFileSync(nextPath, JSON.stringify(payload, null, 2))
    fs.renameSync(nextPath, DEV6_THREADS_PATH)
  }

  private schedulePersist() {
    if (this.persistTimer) {
      return
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.flushPersist()
    }, 150)
  }

  private sendThreadsChanged() {
    const threads = this.listThreads()

    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('agents:threads-changed', threads)
    }
  }

  private getThread(threadId: string) {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error('Agent thread not found.')
    }

    return thread
  }

  private getThreadClone(threadId: string) {
    return cloneValue(this.getThread(threadId))
  }

  private mutateThread(threadId: string, mutate: (thread: AgentThreadRecord) => void) {
    const thread = this.getThread(threadId)
    mutate(thread)
    thread.updatedAt = Date.now()
    this.schedulePersist()
    this.sendThreadsChanged()
  }

  private appendNotice(threadId: string, level: 'info' | 'error', text: string) {
    this.mutateThread(threadId, (thread) => {
      thread.items.push({
        id: crypto.randomUUID(),
        type: 'notice',
        level,
        text,
        createdAt: Date.now(),
      })
    })
  }

  private async initializeRuntime(threadId: string, runtime: AgentThreadRuntime) {
    this.mutateThread(threadId, (thread) => {
      thread.status = 'connecting'
      thread.errorMessage = null
      thread.availableCommands = []
      thread.pendingPermission = null
    })

    try {
      runtime.initializeResponse = await runtime.connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: {
          name: this.options.clientName,
          version: this.options.clientVersion,
        },
        clientCapabilities: {
          fs: {
            readTextFile: true,
            writeTextFile: true,
          },
        },
      })

      this.mutateThread(threadId, (thread) => {
        thread.agentName = runtime.initializeResponse?.agentInfo?.name ?? null
        thread.agentVersion = runtime.initializeResponse?.agentInfo?.version ?? null
      })

      await this.ensureSession(threadId, runtime)

      if (this.runtimes.get(threadId) === runtime) {
        this.mutateThread(threadId, (thread) => {
          thread.status = 'ready'
          thread.errorMessage = null
        })
      }
    } catch (error) {
      this.finalizeRuntime(threadId, runtime, 'error', toErrorMessage(error))
      throw error
    }
  }

  private async ensureSession(threadId: string, runtime: AgentThreadRuntime) {
    const thread = this.getThread(threadId)
    const capabilities = runtime.initializeResponse?.agentCapabilities
    const supportsResume = Boolean(capabilities?.sessionCapabilities?.resume)
    const supportsLoad = Boolean(capabilities?.loadSession)

    if (thread.sessionId && supportsResume) {
      try {
        await runtime.connection.unstable_resumeSession({
          sessionId: thread.sessionId,
          cwd: thread.cwd,
          mcpServers: [],
        })
        await this.applyThreadSettings(threadId, runtime)
        return
      } catch {
        this.appendNotice(
          threadId,
          'info',
          'Could not resume the previous ACP session. Starting a new one.',
        )
      }
    }

    if (thread.sessionId && supportsLoad) {
      try {
        this.mutateThread(threadId, (currentThread) => {
          currentThread.items = []
        })
        await runtime.connection.loadSession({
          sessionId: thread.sessionId,
          cwd: thread.cwd,
          mcpServers: [],
        })
        await this.applyThreadSettings(threadId, runtime)
        return
      } catch {
        this.appendNotice(
          threadId,
          'info',
          'Could not load the previous ACP session. Starting a new one.',
        )
      }
    }

    if (thread.sessionId && !supportsResume && !supportsLoad) {
      this.appendNotice(
        threadId,
        'info',
        'This agent does not advertise session restore support. A fresh session was created.',
      )
    }

    const session = await runtime.connection.newSession({
      cwd: thread.cwd,
      mcpServers: [],
    })

    this.mutateThread(threadId, (currentThread) => {
      currentThread.sessionId = session.sessionId
    })

    await this.applyThreadSettings(threadId, runtime)
  }

  private async inspectAvailableOptions(agentKind: AgentKind) {
    const env = await this.options.getCommandEnv()
    const shellPath = env.SHELL || '/bin/zsh'
    const child = spawn(shellPath, ['-lc', getLaunchCommand(agentKind)], {
      cwd: this.options.getDefaultCwd(),
      env,
      stdio: ['pipe', 'pipe', 'ignore'],
    })

    const stream = ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout),
    )
    const connection = new ClientSideConnection(
      () => ({
        requestPermission: async () => ({ outcome: { outcome: 'cancelled' } }),
        sessionUpdate: async () => {},
        readTextFile: async () => ({ content: '' }),
        writeTextFile: async () => ({}),
      }),
      stream,
    )

    let sessionId: string | null = null

    try {
      await connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: {
          name: this.options.clientName,
          version: this.options.clientVersion,
        },
        clientCapabilities: {
          fs: {
            readTextFile: true,
            writeTextFile: true,
          },
        },
      })

      const session = await connection.newSession({
        cwd: this.options.getDefaultCwd(),
        mcpServers: [],
      })
      sessionId = session.sessionId

      return normalizeConfigOptions(session.configOptions ?? [])
    } finally {
      if (sessionId) {
        await connection.unstable_closeSession({ sessionId }).catch(() => {})
      }

      try {
        child.kill()
      } catch {
        // noop
      }
    }
  }

  private async applyThreadSettings(threadId: string, runtime: AgentThreadRuntime) {
    const thread = this.getThread(threadId)
    if (!thread.sessionId) {
      return
    }

    const entries: Array<[string, string]> = []
    if (thread.settings.model) {
      entries.push(['model', thread.settings.model])
    }

    if (thread.agentKind === 'codex' && thread.settings.reasoningEffort) {
      entries.push(['reasoning_effort', thread.settings.reasoningEffort])
    }

    if (thread.agentKind === 'claude' && thread.settings.mode) {
      entries.push(['mode', thread.settings.mode])
    }

    for (const [configId, value] of entries) {
      try {
        await runtime.connection.setSessionConfigOption({
          sessionId: thread.sessionId,
          configId,
          value,
        })
      } catch (error) {
        this.appendNotice(
          threadId,
          'error',
          `Could not apply ${configId} setting "${value}": ${toErrorMessage(error)}`,
        )
      }
    }
  }

  private createClient(threadId: string): Client {
    return {
      requestPermission: async (params) => {
        const runtime = this.runtimes.get(threadId)
        if (!runtime || runtime.closed) {
          return { outcome: { outcome: 'cancelled' } }
        }

        const request = normalizePermissionRequest(params)
        this.mutateThread(threadId, (thread) => {
          thread.pendingPermission = request
        })

        return new Promise<RequestPermissionResponse>((resolve) => {
          runtime.pendingPermission = {
            request,
            resolve,
          }
        })
      },
      sessionUpdate: async (params) => {
        this.applySessionUpdate(threadId, params)
      },
      readTextFile: async (params) => {
        const content = fs.readFileSync(params.path, 'utf-8')
        if (!params.line && !params.limit) {
          return { content }
        }

        const lines = content.split('\n')
        const startLine = Math.max(1, params.line ?? 1)
        const startIndex = startLine - 1
        const endIndex =
          typeof params.limit === 'number' && params.limit > 0
            ? startIndex + params.limit
            : lines.length

        return {
          content: lines.slice(startIndex, endIndex).join('\n'),
        }
      },
      writeTextFile: async (params) => {
        ensureDirectory(path.dirname(params.path))
        fs.writeFileSync(params.path, params.content, 'utf-8')
        return {}
      },
    }
  }

  private applySessionUpdate(threadId: string, notification: SessionNotification) {
    const update = notification.update
    const updatedAt = Date.now()

    this.mutateThread(threadId, (thread) => {
      switch (update.sessionUpdate) {
        case 'user_message_chunk':
          this.appendMessageChunk(
            thread,
            'user',
            summarizeContentBlock(update) ?? '[content]',
            updatedAt,
          )
          break
        case 'agent_message_chunk':
          this.appendMessageChunk(
            thread,
            'assistant',
            summarizeContentBlock(update) ?? '[content]',
            updatedAt,
          )
          break
        case 'agent_thought_chunk':
          this.appendMessageChunk(
            thread,
            'thought',
            summarizeContentBlock(update) ?? '[content]',
            updatedAt,
          )
          break
        case 'tool_call':
          this.upsertToolCall(thread, update, updatedAt)
          break
        case 'tool_call_update':
          this.upsertToolCall(thread, update, updatedAt)
          break
        case 'plan':
          thread.items.push({
            id: crypto.randomUUID(),
            type: 'plan',
            entries: update.entries.map((entry) => ({
              content: entry.content,
              priority: entry.priority,
              status: entry.status,
            })),
            updatedAt,
          })
          break
        case 'session_info_update':
          if (typeof update.title !== 'undefined') {
            thread.sessionTitle = update.title ?? null
          }
          break
        case 'available_commands_update':
          thread.availableCommands = update.availableCommands.map((command) => ({
            name: command.name,
            description: command.description ?? null,
            inputHint: command.input?.hint ?? null,
          }))
          break
        case 'current_mode_update':
        case 'config_option_update':
        case 'usage_update':
          break
      }
    })
  }

  private appendMessageChunk(
    thread: AgentThreadRecord,
    role: AgentThreadMessageItem['role'],
    text: string,
    createdAt: number,
  ) {
    const lastItem = thread.items.at(-1)
    if (lastItem?.type === 'message' && lastItem.role === role) {
      lastItem.text += text
      return
    }

    thread.items.push({
      id: crypto.randomUUID(),
      type: 'message',
      role,
      text,
      attachments: [],
      createdAt,
    })
  }

  private upsertToolCall(
    thread: AgentThreadRecord,
    update: ToolCall | ToolCallUpdate,
    updatedAt: number,
  ) {
    const existingItem = thread.items.find(
      (item): item is AgentThreadToolCallItem =>
        item.type === 'tool_call' && item.toolCallId === update.toolCallId,
    )

    const nextTitle =
      'title' in update && typeof update.title === 'string' ? update.title : undefined
    const nextStatus =
      typeof update.status === 'string' ? update.status : existingItem?.status ?? 'unknown'
    const nextKind =
      typeof update.kind === 'string' ? update.kind : existingItem?.kind ?? null
    const nextLocations =
      typeof update.locations !== 'undefined'
        ? normalizeLocations(update.locations)
        : existingItem?.locations ?? []
    const nextRawInput =
      typeof update.rawInput !== 'undefined'
        ? serializeUnknown(update.rawInput)
        : existingItem?.rawInput ?? null
    const nextRawOutput =
      typeof update.rawOutput !== 'undefined'
        ? serializeUnknown(update.rawOutput)
        : existingItem?.rawOutput ?? null
    const nextContentSummary =
      typeof update.content !== 'undefined'
        ? summarizeToolContent(update.content)
        : existingItem?.contentSummary ?? null

    if (existingItem) {
      existingItem.title = nextTitle ?? existingItem.title
      existingItem.status = nextStatus
      existingItem.kind = nextKind
      existingItem.locations = nextLocations
      existingItem.rawInput = nextRawInput
      existingItem.rawOutput = nextRawOutput
      existingItem.contentSummary = nextContentSummary
      existingItem.updatedAt = updatedAt
      return
    }

    thread.items.push({
      id: crypto.randomUUID(),
      type: 'tool_call',
      toolCallId: update.toolCallId,
      title: nextTitle ?? 'Tool call',
      status: nextStatus,
      kind: nextKind,
      locations: nextLocations,
      rawInput: nextRawInput,
      rawOutput: nextRawOutput,
      contentSummary: nextContentSummary,
      updatedAt,
    })
  }

  private finalizeRuntime(
    threadId: string,
    runtime: AgentThreadRuntime,
    nextStatus: AgentThreadStatus,
    errorMessage?: string | null,
  ) {
    if (runtime.closed) {
      return
    }

    runtime.closed = true
    this.runtimes.delete(threadId)

    if (runtime.pendingPermission) {
      runtime.pendingPermission.resolve({ outcome: { outcome: 'cancelled' } })
      runtime.pendingPermission = null
    }

    const thread = this.threads.get(threadId)
    if (!thread) {
      return
    }

    this.mutateThread(threadId, (currentThread) => {
      currentThread.pendingPermission = null
      currentThread.status = nextStatus
      currentThread.errorMessage = errorMessage ?? null
    })
  }
}
