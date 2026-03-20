import { useEffect, useState, useRef } from 'react'
import { Bot, ChevronRight, Loader2, Send, ShieldAlert, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAgentThreads } from '@/hooks/use-agent-threads'
import { cn } from '@/lib/utils'

function agentKindLabel(agentKind: AgentThread['agentKind']) {
  return agentKind === 'claude' ? 'Claude' : 'Codex'
}

function configIdToSettingKey(configId: string) {
  switch (configId) {
    case 'model':
      return 'model' as const
    case 'reasoning_effort':
      return 'reasoningEffort' as const
    case 'mode':
      return 'mode' as const
    default:
      return null
  }
}

function getInitialSettingValue(
  settings: AgentThread['settings'],
  option: AgentThreadConfigOption,
) {
  const key = configIdToSettingKey(option.id)
  if (!key || typeof option.currentValue !== 'string') {
    return ''
  }

  return settings[key] ?? option.currentValue
}

function groupAgentOptionValues(option: AgentThreadConfigOption) {
  const groups = new Map<
    string,
    {
      label: string | null
      options: AgentThreadConfigOption['options']
    }
  >()

  for (const valueOption of option.options) {
    const groupKey = valueOption.group ?? '__default__'
    const existingGroup = groups.get(groupKey)
    if (existingGroup) {
      existingGroup.options.push(valueOption)
      continue
    }

    groups.set(groupKey, {
      label: valueOption.groupName,
      options: [valueOption],
    })
  }

  return [...groups.entries()]
}

function getSlashCommandQuery(prompt: string) {
  const trimmedPrompt = prompt.trimStart()
  if (!trimmedPrompt.startsWith('/')) {
    return null
  }

  const firstLine = trimmedPrompt.split('\n', 1)[0] ?? trimmedPrompt
  const match = firstLine.match(/^\/([^\s]*)$/)
  if (!match) {
    return null
  }

  return match[1].toLowerCase()
}

function buildSlashCommandPrompt(command: AgentThreadAvailableCommand) {
  return `/${command.name} `
}

function filterAvailableCommands(commands: AgentThreadAvailableCommand[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return commands
  }

  return commands.filter((command) => {
    const nameMatches = command.name.toLowerCase().includes(normalizedQuery)
    const descriptionMatches = command.description?.toLowerCase().includes(normalizedQuery) ?? false
    return nameMatches || descriptionMatches
  })
}

function MarkdownMessage({ text }: { text: string }) {
  return (
    <div
      className={cn(
        'break-words text-sm leading-7 text-foreground',
        '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
        '[&_code]:rounded [&_code]:bg-muted/50 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]',
        '[&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-semibold',
        '[&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-semibold',
        '[&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold',
        '[&_hr]:my-6 [&_hr]:border-border',
        '[&_li]:ml-5 [&_li]:pl-1',
        '[&_ol]:my-3 [&_ol]:list-decimal',
        '[&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
        '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:bg-muted/40 [&_pre]:p-4',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left',
        '[&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-2',
        '[&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:font-medium',
        '[&_ul]:my-3 [&_ul]:list-disc',
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}

function readClipboardImageItem(item: DataTransferItem) {
  return new Promise<AgentPromptImageInput | null>((resolve, reject) => {
    const file = item.getAsFile()
    if (!file) {
      resolve(null)
      return
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') {
        resolve(null)
        return
      }

      resolve({
        mimeType: file.type || item.type || 'image/png',
        dataUrl: reader.result,
      })
    })
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Could not read pasted image.'))
    })
    reader.readAsDataURL(file)
  })
}

function TranscriptItem({ item }: { item: AgentThreadItem }) {
  if (item.type === 'message') {
    if (item.role === 'assistant') {
      return (
        <div className="w-full">
          <MarkdownMessage text={item.text} />
        </div>
      )
    }

    const hasText = item.text.trim().length > 0

    return (
      <div
        className={cn(
          'flex w-full flex-col gap-2 text-sm',
          item.role === 'user' ? 'items-end' : 'items-start',
        )}
      >
        {hasText ? (
          <div
            className={cn(
              item.role === 'user' &&
                'ml-auto max-w-[85%] rounded-2xl bg-primary px-3 py-2 whitespace-pre-wrap text-primary-foreground',
              item.role === 'thought' &&
                'rounded-2xl border border-dashed border-border bg-muted/40 px-3 py-2 text-muted-foreground whitespace-pre-wrap',
            )}
          >
            {item.text}
          </div>
        ) : null}
        {item.attachments.length > 0 ? (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
            {item.attachments.map((attachment, index) => (
              <img
                key={attachment.id}
                src={attachment.dataUrl}
                alt={`Pasted image ${index + 1}`}
                className="max-h-64 rounded-2xl border bg-muted/20 object-cover"
              />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  if (item.type === 'tool_call') {
    return (
      <Collapsible className="w-full rounded-xl border bg-card/40">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          >
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
            {item.contentSummary ? (
              <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground md:block">
                {item.contentSummary}
              </span>
            ) : null}
            <Badge variant="outline">{item.kind ?? 'tool'}</Badge>
            <Badge variant={item.status === 'failed' ? 'destructive' : 'secondary'}>
              {item.status}
            </Badge>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t px-3 py-3 text-sm">
          <div className="flex flex-col gap-3">
            {item.locations.length > 0 ? (
              <div className="font-mono text-xs text-muted-foreground">
                {item.locations.join('\n')}
              </div>
            ) : null}
            {item.contentSummary ? (
              <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                {item.contentSummary}
              </div>
            ) : null}
            {item.rawInput ? (
              <pre className="overflow-x-auto rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                {item.rawInput}
              </pre>
            ) : null}
            {item.rawOutput ? (
              <pre className="overflow-x-auto rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                {item.rawOutput}
              </pre>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  if (item.type === 'plan') {
    return (
      <div className="rounded-2xl border bg-card/70 p-3 text-sm">
        <div className="mb-2 font-medium">Plan</div>
        <div className="space-y-2">
          {item.entries.map((entry, index) => (
            <div key={`${item.id}:${index}`} className="flex items-start gap-2">
              <Badge variant="outline">{entry.status}</Badge>
              <span className="flex-1">{entry.content}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-2xl border px-3 py-2 text-sm',
        item.level === 'error'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'border-border bg-muted/30 text-muted-foreground',
      )}
    >
      {item.text}
    </div>
  )
}

function AgentThreadView({ thread }: { thread: AgentThread }) {
  const { sendPrompt, resolvePermission, updateThread } = useAgentThreads()
  const [prompt, setPrompt] = useState('')
  const [pendingImages, setPendingImages] = useState<AgentPromptImageInput[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [options, setOptions] = useState<AgentThreadConfigOption[]>([])
  const [draftSettings, setDraftSettings] = useState<AgentThread['settings']>(thread.settings)
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const [isUpdatingOption, setIsUpdatingOption] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const transcriptPaddingBottom =
    thread.pendingPermission || actionError || thread.errorMessage ? 'pb-96' : 'pb-48'
  const slashCommandQuery = getSlashCommandQuery(prompt)
  const matchingCommands =
    slashCommandQuery === null
      ? []
      : filterAvailableCommands(thread.availableCommands, slashCommandQuery)

  useEffect(() => {
    let cancelled = false

    async function loadOptions() {
      try {
        setIsLoadingOptions(true)
        const nextOptions = await window.desktop.listAgentOptions(thread.agentKind)
        if (cancelled) {
          return
        }

        const supportedOptions = nextOptions.filter(
          (option) => option.type === 'select' && configIdToSettingKey(option.id),
        )
        const modelOption = supportedOptions.find((option) => option.id === 'model')
        const reasoningOption = supportedOptions.find((option) => option.id === 'reasoning_effort')
        const modeOption = supportedOptions.find((option) => option.id === 'mode')

        setOptions(supportedOptions)
        setDraftSettings({
          model: modelOption
            ? getInitialSettingValue(thread.settings, modelOption)
            : thread.settings.model,
          reasoningEffort: reasoningOption
            ? getInitialSettingValue(thread.settings, reasoningOption)
            : thread.settings.reasoningEffort,
          mode: modeOption
            ? getInitialSettingValue(thread.settings, modeOption)
            : thread.settings.mode,
        })
      } catch (error) {
        if (!cancelled) {
          setActionError(
            error instanceof Error ? error.message : 'Could not load agent options.',
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoadingOptions(false)
        }
      }
    }

    void loadOptions()

    return () => {
      cancelled = true
    }
  }, [thread.agentKind, thread.id, thread.settings])

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLDivElement>(
      '[data-slot="scroll-area-viewport"]',
    )
    if (!viewport) {
      transcriptEndRef.current?.scrollIntoView({ block: 'end' })
      return
    }

    const frame = requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'auto' })
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [actionError, thread.errorMessage, thread.items, thread.pendingPermission])

  async function handleSendPrompt() {
    const nextPrompt = prompt.trim()
    const nextImages = pendingImages.map((image) => ({ ...image }))
    if (!nextPrompt && nextImages.length === 0) {
      return
    }

    try {
      setActionError(null)
      setPrompt('')
      setPendingImages([])
      await sendPrompt(thread.id, {
        text: nextPrompt,
        images: nextImages,
      })
    } catch (error) {
      setPrompt(nextPrompt)
      setPendingImages(nextImages)
      setActionError(error instanceof Error ? error.message : 'Could not send this prompt.')
    }
  }

  function removePendingImage(index: number) {
    setPendingImages((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  function handleSelectCommand(command: AgentThreadAvailableCommand) {
    setPrompt(buildSlashCommandPrompt(command))
    setActionError(null)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }

  async function handleOptionChange(
    settingKey: keyof AgentThread['settings'],
    value: string,
  ) {
    const nextValue = value || null
    const previousValue = draftSettings[settingKey]

    setDraftSettings((current) => ({
      ...current,
      [settingKey]: nextValue,
    }))

    try {
      setActionError(null)
      setIsUpdatingOption(true)
      await updateThread(thread.id, {
        settings: {
          [settingKey]: nextValue,
        },
      })
    } catch (error) {
      setDraftSettings((current) => ({
        ...current,
        [settingKey]: previousValue,
      }))
      setActionError(error instanceof Error ? error.message : 'Could not update agent options.')
    } finally {
      setIsUpdatingOption(false)
    }
  }

  const canPrompt = thread.status !== 'connecting' && thread.status !== 'running'

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div className="min-h-0 size-full overflow-hidden">
        <ScrollArea ref={scrollAreaRef} className="size-full">
          <div
            className={cn(
              'mx-auto flex min-h-full w-full max-w-4xl flex-col gap-3 px-4 pt-4',
              transcriptPaddingBottom,
            )}
          >
            {thread.items.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-8 text-sm text-muted-foreground">
                Send a prompt to start this {agentKindLabel(thread.agentKind)} thread.
              </div>
            ) : (
              thread.items.map((item) => <TranscriptItem key={item.id} item={item} />)
            )}
            <div ref={transcriptEndRef} />
          </div>
        </ScrollArea>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-4">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
          {actionError || thread.errorMessage ? (
            <div className="pointer-events-auto rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {actionError ?? thread.errorMessage}
            </div>
          ) : null}

          {thread.pendingPermission ? (
            <div className="pointer-events-auto rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 size-5 text-amber-600" />
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <div className="font-medium">{thread.pendingPermission.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {thread.pendingPermission.kind ?? 'tool'} requires approval.
                    </div>
                  </div>
                  {thread.pendingPermission.locations.length > 0 ? (
                    <pre className="overflow-x-auto rounded-xl bg-background/70 p-3 text-xs text-muted-foreground">
                      {thread.pendingPermission.locations.join('\n')}
                    </pre>
                  ) : null}
                  {thread.pendingPermission.rawInput ? (
                    <pre className="overflow-x-auto rounded-xl bg-background/70 p-3 text-xs text-muted-foreground">
                      {thread.pendingPermission.rawInput}
                    </pre>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {thread.pendingPermission.options.map((option) => (
                      <Button
                        key={option.optionId}
                        variant={option.kind.startsWith('reject') ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => void resolvePermission(thread.id, option.optionId)}
                      >
                        {option.name}
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void resolvePermission(thread.id, null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="pointer-events-auto rounded-2xl border bg-background p-3">
            <div className="flex flex-col gap-3">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onPaste={(event) => {
                  const imageItems = [...event.clipboardData.items].filter((item) =>
                    item.type.startsWith('image/'),
                  )
                  if (imageItems.length === 0) {
                    return
                  }

                  event.preventDefault()
                  void (async () => {
                    try {
                      const nextImages = (
                        await Promise.all(imageItems.map((item) => readClipboardImageItem(item)))
                      ).filter((image): image is AgentPromptImageInput => image !== null)

                      if (nextImages.length === 0) {
                        return
                      }

                      setActionError(null)
                      setPendingImages((current) => [...current, ...nextImages])
                    } catch (error) {
                      setActionError(
                        error instanceof Error
                          ? error.message
                          : 'Could not read pasted image.',
                      )
                    }
                  })()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    if ((prompt.trim() || pendingImages.length > 0) && canPrompt) {
                      void handleSendPrompt()
                    }
                  }
                }}
                className="min-h-[92px] w-full resize-none bg-transparent px-1 py-1 text-sm outline-none focus-visible:ring-0"
                placeholder={`Send a prompt to ${agentKindLabel(thread.agentKind)}...`}
              />
              {pendingImages.length > 0 ? (
                <div className="flex flex-wrap gap-2 px-1">
                  {pendingImages.map((image, index) => (
                    <div
                      key={`${image.dataUrl.slice(0, 48)}:${index}`}
                      className="relative overflow-hidden rounded-2xl border bg-muted/20"
                    >
                      <img
                        src={image.dataUrl}
                        alt={`Pending pasted image ${index + 1}`}
                        className="size-24 object-cover"
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition hover:text-foreground"
                        onClick={() => removePendingImage(index)}
                        aria-label={`Remove pasted image ${index + 1}`}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {slashCommandQuery !== null ? (
                <Command shouldFilter={false} className="rounded-2xl border bg-muted/20 p-1">
                  <CommandList className="max-h-56">
                    <CommandEmpty className="px-3 py-4 text-left text-sm text-muted-foreground">
                      No commands or skills match `/{slashCommandQuery}`.
                    </CommandEmpty>
                    <CommandGroup heading="Commands and skills">
                      {matchingCommands.map((command) => (
                        <CommandItem
                          key={command.name}
                          value={command.name}
                          onSelect={() => handleSelectCommand(command)}
                          className="items-start gap-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-xs text-muted-foreground">
                              /{command.name}
                            </div>
                            {command.description ? (
                              <div className="truncate text-sm">{command.description}</div>
                            ) : (
                              <div className="truncate text-sm text-muted-foreground">
                                Run this {agentKindLabel(thread.agentKind)} command.
                              </div>
                            )}
                          </div>
                          {command.inputHint ? (
                            <CommandShortcut className="max-w-52 truncate normal-case tracking-normal">
                              {command.inputHint}
                            </CommandShortcut>
                          ) : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {isLoadingOptions ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      Loading options…
                    </div>
                  ) : (
                    options.map((option) => {
                      const settingKey = configIdToSettingKey(option.id)
                      if (!settingKey) {
                        return null
                      }

                      return (
                        <Select
                          key={option.id}
                          value={draftSettings[settingKey] ?? ''}
                          onValueChange={(value) => void handleOptionChange(settingKey, value)}
                          disabled={isUpdatingOption}
                        >
                          <SelectTrigger size="sm" className="max-w-44">
                            <SelectValue placeholder={option.name} />
                          </SelectTrigger>
                          <SelectContent>
                            {groupAgentOptionValues(option).map(([groupKey, group]) => (
                              <SelectGroup key={`${option.id}:${groupKey}`}>
                                {group.label ? <SelectLabel>{group.label}</SelectLabel> : null}
                                {group.options.map((valueOption) => (
                                  <SelectItem key={valueOption.value} value={valueOption.value}>
                                    {valueOption.name}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                      )
                    })
                  )}
                </div>
                <Button
                  onClick={() => void handleSendPrompt()}
                  disabled={(!prompt.trim() && pendingImages.length === 0) || !canPrompt}
                >
                  <Send className="size-4" />
                  Send
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AgentsPage() {
  const navigate = useNavigate()
  const { threadId } = useParams()
  const { threads, isLoading } = useAgentThreads()
  const activeThread = threadId ? threads.find((thread) => thread.id === threadId) ?? null : null

  useEffect(() => {
    if (isLoading) {
      return
    }

    if (!threadId && threads.length > 0) {
      navigate(`/agents/${threads[0].id}`, { replace: true })
      return
    }

    if (threadId && !activeThread) {
      navigate(threads[0] ? `/agents/${threads[0].id}` : '/agents', { replace: true })
    }
  }, [activeThread, isLoading, navigate, threadId, threads])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      const digit = Number(event.key)
      if (!Number.isInteger(digit) || digit < 1 || digit > 9) {
        return
      }

      const thread = threads[digit - 1]
      if (!thread) {
        return
      }

      event.preventDefault()
      navigate(`/agents/${thread.id}`)
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [navigate, threads])

  if (!isLoading && threads.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <div className="drag-region h-[36px] shrink-0" />
        <div className="flex flex-1 items-center justify-center">
          <div className="max-w-md space-y-4 rounded-3xl border bg-card/80 p-8 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted">
              <Bot className="size-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Agents</h2>
              <p className="text-sm text-muted-foreground">
                Use the sidebar plus button to start a Codex or Claude ACP thread. Sessions are
                restored from `~/.dev6/agent-threads.json`.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
      {activeThread ? (
        <AgentThreadView key={activeThread.id} thread={activeThread} />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed bg-muted/10 p-8 text-sm text-muted-foreground">
          Select a thread from the sidebar.
        </div>
      )}
    </div>
  )
}
