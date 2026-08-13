import {
  ProviderEvent,
  ProviderId,
  ProviderSelection,
  ProviderTurnResult,
  ResponseMode,
  UnsupportedProviderSelectionError,
  assertSupportedCliVersion,
  createSelection
} from "../../src/shared/provider"
import { normalizeClaudeEvents, normalizeCodexEvents } from "./protocols"
import { ProcessResult, SafeProcessRunner } from "./processRunner"

export interface ProviderRuntimeOptions {
  executables: Readonly<Record<ProviderId, string>>
  processRunner?: SafeProcessRunner
  timeoutMs?: number
  terminateGraceMs?: number
  maximumOutputBytes?: number
  maximumLineBytes?: number
}

interface ProviderSessionSelection {
  provider: ProviderId
  model: string
  responseMode: ResponseMode
}

export type StartProviderSession =
  | (ProviderSessionSelection & {
      mode: "create"
      requestedConversationId: string
    })
  | (ProviderSessionSelection & {
      mode: "resume"
      conversationId: string
    })

export type ProviderEventSink = (
  event: ProviderEvent
) => void | Promise<void>

export interface ProviderSession {
  readonly selection: Readonly<ProviderSelection>
  conversationId(): string | undefined
  runTurn(
    prompt: string,
    signal?: AbortSignal,
    onEvent?: ProviderEventSink
  ): Promise<ProviderTurnResult>
}

interface ProviderConversation {
  mode: "create" | "resume"
  conversationId: string
}

interface PreparedCodexPrompt {
  readonly text: string
  readonly imageUrls: readonly string[]
  readonly outputSchema?: Readonly<Record<string, unknown>>
}

const DEFAULTS = {
  timeoutMs: 120_000,
  terminateGraceMs: 1_500,
  maximumOutputBytes: 4 * 1024 * 1024,
  maximumLineBytes: 512 * 1024
} as const

function assertOpaqueId(value: string): void {
  const hasControlCharacter = [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
  if (
    value.length < 8 ||
    value.length > 512 ||
    hasControlCharacter
  ) {
    throw new Error("Caller-owned conversation ID is invalid")
  }
}

function errorFromProcess(
  result: ProcessResult
): Extract<ProviderEvent, { type: "error" }> | null {
  if (result.failure === undefined) return null
  const code = {
    cancelled: "CANCELLED",
    "output-limit": "OUTPUT_LIMIT",
    "process-failed": "PROCESS_FAILED",
    timeout: "TIMEOUT"
  }[result.failure] as Extract<ProviderEvent, { type: "error" }>["code"]
  return {
    type: "error",
    sequence: 0,
    code,
    message: result.stderr
      ? `Provider process ${result.failure}: ${result.stderr}`
      : `Provider process ${result.failure}`,
    recoverable: true
  }
}

function isMissingCodexConversation(
  events: readonly ProviderEvent[]
): boolean {
  return events.some((event) => {
    if (event.type !== "error") return false
    const message = event.message.toLowerCase()
    return (
      message.includes("no rollout found for thread id") ||
      message.includes("unknown thread") ||
      /thread\b.*\bnot found/.test(message)
    )
  })
}

function codingOutputSchema(
  prompt: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> | undefined {
  if (
    prompt.route !== "coding" ||
    !Array.isArray(prompt.sectionIds) ||
    prompt.sectionIds.length === 0 ||
    !prompt.sectionIds.every((sectionId) => typeof sectionId === "string")
  ) {
    return undefined
  }
  const sectionIds = [...new Set(prompt.sectionIds as string[])]
  if (sectionIds.length !== prompt.sectionIds.length) return undefined
  return {
    type: "object",
    additionalProperties: false,
    required: ["kind", "sections"],
    properties: {
      kind: { type: "string", enum: ["structured"] },
      sections: {
        type: "array",
        minItems: sectionIds.length,
        maxItems: sectionIds.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "body"],
          properties: {
            id: { type: "string", enum: sectionIds },
            body: { type: "string" }
          }
        }
      }
    }
  }
}

function prepareCodexPrompt(prompt: string): PreparedCodexPrompt {
  let parsed: unknown
  try {
    parsed = JSON.parse(prompt) as unknown
  } catch {
    return { text: prompt, imageUrls: [] }
  }
  const imageUrls: string[] = []
  const seen = new Map<string, number>()
  const detachImages = (value: unknown): unknown => {
    if (
      typeof value === "string" &&
      /^data:image\/(?:png|jpeg|webp);base64,/i.test(value)
    ) {
      let imageNumber = seen.get(value)
      if (imageNumber === undefined) {
        imageUrls.push(value)
        imageNumber = imageUrls.length
        seen.set(value, imageNumber)
      }
      return `[attached image ${imageNumber}]`
    }
    if (Array.isArray(value)) return value.map(detachImages)
    if (typeof value !== "object" || value === null) return value
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        detachImages(nested)
      ])
    )
  }
  const detached = detachImages(parsed)
  const root =
    typeof detached === "object" && detached !== null && !Array.isArray(detached)
      ? (detached as Readonly<Record<string, unknown>>)
      : undefined
  return {
    text: JSON.stringify(detached),
    imageUrls,
    ...(root ? { outputSchema: codingOutputSchema(root) } : {})
  }
}

export class ProviderRuntime {
  private readonly runner: SafeProcessRunner
  private readonly options: Required<
    Omit<ProviderRuntimeOptions, "executables" | "processRunner">
  >

  constructor(private readonly configuration: ProviderRuntimeOptions) {
    this.runner = configuration.processRunner ?? new SafeProcessRunner()
    this.options = {
      timeoutMs: configuration.timeoutMs ?? DEFAULTS.timeoutMs,
      terminateGraceMs:
        configuration.terminateGraceMs ?? DEFAULTS.terminateGraceMs,
      maximumOutputBytes:
        configuration.maximumOutputBytes ?? DEFAULTS.maximumOutputBytes,
      maximumLineBytes:
        configuration.maximumLineBytes ?? DEFAULTS.maximumLineBytes
    }
  }

  startSession(request: StartProviderSession): ProviderSession {
    const requestedId =
      request.mode === "create"
        ? request.requestedConversationId
        : request.conversationId
    assertOpaqueId(requestedId)
    const selection = createSelection(
      request.provider,
      request.model,
      request.responseMode
    )
    const executable = this.configuration.executables[selection.provider]
    const conversation: ProviderConversation = {
      mode: request.mode,
      conversationId: requestedId
    }
    let acceptedConversationId =
      selection.provider === "claude-code" ? requestedId : undefined

    return Object.freeze({
      selection,
      conversationId: () => acceptedConversationId,
      runTurn: async (
        prompt: string,
        signal?: AbortSignal,
        onEvent?: ProviderEventSink
      ) => {
        const mayNeedCodexConversationRecovery =
          selection.provider === "codex" && conversation.mode === "resume"
        const bufferedResumeEvents: ProviderEvent[] = []
        let resumeAccepted = !mayNeedCodexConversationRecovery
        const forwardEvent: ProviderEventSink = async (event) => {
          if (resumeAccepted) {
            await onEvent?.(event)
            return
          }
          bufferedResumeEvents.push(event)
          if (event.type !== "started") return
          resumeAccepted = true
          for (const buffered of bufferedResumeEvents) {
            await onEvent?.(buffered)
          }
          bufferedResumeEvents.length = 0
        }
        let outcome = await this.runTurn(
          executable,
          selection,
          conversation,
          prompt,
          signal,
          forwardEvent,
          (conversationId) => {
            acceptedConversationId = conversationId
            conversation.conversationId = conversationId
            conversation.mode = "resume"
          }
        )
        if (
          mayNeedCodexConversationRecovery &&
          !signal?.aborted &&
          isMissingCodexConversation(outcome.events)
        ) {
          conversation.mode = "create"
          bufferedResumeEvents.length = 0
          outcome = await this.runTurn(
            executable,
            selection,
            conversation,
            prompt,
            signal,
            onEvent,
            (conversationId) => {
              acceptedConversationId = conversationId
              conversation.conversationId = conversationId
              conversation.mode = "resume"
            }
          )
        } else if (!resumeAccepted) {
          for (const buffered of bufferedResumeEvents) {
            await onEvent?.(buffered)
          }
        }
        if (
          outcome.events.some((event) => event.type === "completed") &&
          !outcome.events.some((event) => event.type === "error")
        ) {
          conversation.mode = "resume"
        }
        return outcome
      }
    })
  }

  private async verifyVersion(
    executable: string,
    selection: Readonly<ProviderSelection>,
    conversationId: string,
    signal?: AbortSignal
  ): Promise<void> {
    const result = await this.runner.run({
      executable,
      args: ["--version"],
      signal,
      sensitiveValues: [conversationId],
      ...this.options
    })
    const failure = errorFromProcess(result)
    if (failure) {
      throw new UnsupportedProviderSelectionError(
        `${selection.provider} CLI capability check failed: ${failure.message}`
      )
    }
    assertSupportedCliVersion(selection.provider, result.stdoutLines.join("\n"))
  }

  private async runTurn(
    executable: string,
    selection: Readonly<ProviderSelection>,
    conversation: ProviderConversation,
    prompt: string,
    signal?: AbortSignal,
    onEvent?: ProviderEventSink,
    onConversationId?: (conversationId: string) => void
  ): Promise<ProviderTurnResult> {
    await this.verifyVersion(
      executable,
      selection,
      conversation.conversationId,
      signal
    )
    const events: ProviderEvent[] = []
    let sequence = 0
    let conversationAnnounced = false
    const emit = async (event: ProviderEvent): Promise<void> => {
      const normalized = { ...event, sequence: sequence++ } as ProviderEvent
      events.push(normalized)
      await onEvent?.(normalized)
    }
    const request =
      selection.provider === "claude-code"
        ? this.claudeRequest(
            selection,
            conversation,
            prompt,
            signal,
            async (line) => {
              for (const event of normalizeClaudeEvents([line], [
                conversation.conversationId
              ])) {
                await emit(event)
              }
            }
          )
        : this.codexRequest(
            selection,
            conversation,
            prompt,
            signal,
            async (line, input) => {
              if (this.codexEchoedUserMessage(line)) return
              const returnedId = this.codexConversationId(line)
              if (returnedId) {
                if (
                  conversation.mode === "resume" &&
                  returnedId !== conversation.conversationId
                ) {
                  throw new Error("Codex resumed an unexpected thread")
                }
                assertOpaqueId(returnedId)
                onConversationId?.(returnedId)
                if (!conversationAnnounced) {
                  conversationAnnounced = true
                  await emit({ type: "started", sequence: 0 })
                }
                input.writeLine(
                  JSON.stringify(
                    this.codexTurnStart(selection, returnedId, prompt)
                  )
                )
              } else if (this.codexConversationRejected(line)) {
                input.end()
              }
              for (const event of normalizeCodexEvents([line], [
                conversation.conversationId
              ])) {
                if (event.type === "started" && conversationAnnounced) continue
                await emit(event)
              }
              if (this.codexTurnFinished(line)) input.end()
            }
          )
    const result = await this.runner.run(request)
    const processError = errorFromProcess(result)
    if (processError) {
      await emit(processError)
    }

    if (events.length === 0) {
      await emit({
        type: "error",
        sequence: 0,
        code: "PROTOCOL_ERROR",
        message: "Provider completed without a supported protocol event",
        recoverable: true
      })
    }
    return Object.freeze({ selection, events: Object.freeze(events) })
  }

  private claudeRequest(
    selection: Readonly<ProviderSelection>,
    conversation: ProviderConversation,
    prompt: string,
    signal: AbortSignal | undefined,
    onStdoutLine: NonNullable<
      Parameters<SafeProcessRunner["run"]>[0]["onStdoutLine"]
    >
  ) {
    const conversationArgument =
      conversation.mode === "create"
        ? ["--session-id", conversation.conversationId]
        : ["--resume", conversation.conversationId]
    return {
      executable: this.configuration.executables["claude-code"],
      args: [
        "--print",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",
        ...conversationArgument,
        "--model",
        selection.model,
        "--effort",
        selection.effort,
        "--tools",
        "",
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--disable-slash-commands",
        "--no-chrome",
        "--permission-mode",
        "dontAsk",
        "--",
        prompt
      ],
      signal,
      sensitiveValues: [conversation.conversationId],
      onStdoutLine,
      ...this.options
    }
  }

  private codexRequest(
    selection: Readonly<ProviderSelection>,
    conversation: ProviderConversation,
    prompt: string,
    signal: AbortSignal | undefined,
    onStdoutLine: NonNullable<
      Parameters<SafeProcessRunner["run"]>[0]["onStdoutLine"]
    >
  ) {
    const imageAwareMaximumLineBytes = Math.min(
      16 * 1024 * 1024,
      Math.max(this.options.maximumLineBytes, prompt.length + 512 * 1024)
    )
    const imageAwareMaximumOutputBytes = Math.min(
      48 * 1024 * 1024,
      Math.max(this.options.maximumOutputBytes, prompt.length * 2 + 2 * 1024 * 1024)
    )
    const messages = [
      {
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "InterviewCopilot", version: "1" },
          capabilities: { experimentalApi: true }
        }
      },
      { method: "initialized", params: {} },
      conversation.mode === "create"
        ? {
            id: 2,
            method: "thread/start",
            params: {
              model: selection.model,
              approvalPolicy: "never",
              sandbox: "read-only",
              ephemeral: false
            }
          }
        : {
            id: 2,
            method: "thread/resume",
            params: {
              threadId: conversation.conversationId,
              excludeTurns: true,
              model: selection.model,
              approvalPolicy: "never",
              sandbox: "read-only"
            }
          }
    ]
    return {
      executable: this.configuration.executables.codex,
      args: ["app-server", "--stdio", "--strict-config"],
      stdinLines: messages.map((message) => JSON.stringify(message)),
      closeStdin: false,
      onStdoutLine,
      signal,
      sensitiveValues: [conversation.conversationId],
      ...this.options,
      maximumLineBytes: imageAwareMaximumLineBytes,
      maximumOutputBytes: imageAwareMaximumOutputBytes,
      retainStdoutLines: false
    }
  }

  private codexEchoedUserMessage(line: string): boolean {
    return (
      (line.startsWith('{"method":"item/started"') ||
        line.startsWith('{"method":"item/completed"')) &&
      line.includes('"type":"userMessage"')
    )
  }

  private codexConversationId(line: string): string | undefined {
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      return undefined
    }
    if (typeof value !== "object" || value === null) return undefined
    const message = value as Record<string, unknown>
    if (message.id !== 2 || typeof message.result !== "object" || !message.result) {
      return undefined
    }
    const thread = (message.result as Record<string, unknown>).thread
    if (typeof thread !== "object" || thread === null) {
      throw new Error("Codex did not return a thread")
    }
    const id = (thread as Record<string, unknown>).id
    if (typeof id !== "string") throw new Error("Codex returned an invalid thread")
    return id
  }

  private codexConversationRejected(line: string): boolean {
    let value: unknown
    try {
      value = JSON.parse(line) as unknown
    } catch {
      return false
    }
    if (typeof value !== "object" || value === null) return false
    const message = value as Record<string, unknown>
    return message.id === 2 && message.error !== undefined
  }

  private codexTurnFinished(line: string): boolean {
    let value: unknown
    try {
      value = JSON.parse(line) as unknown
    } catch {
      return false
    }
    if (typeof value !== "object" || value === null) return false
    const message = value as Record<string, unknown>
    return (
      message.method === "turn/completed" ||
      (message.id === 3 && message.error !== undefined)
    )
  }

  private codexTurnStart(
    selection: Readonly<ProviderSelection>,
    conversationId: string,
    prompt: string
  ) {
    const prepared = prepareCodexPrompt(prompt)
    return {
      id: 3,
      method: "turn/start",
      params: {
        threadId: conversationId,
        input: [
          { type: "text", text: prepared.text, text_elements: [] },
          ...prepared.imageUrls.map((url) => ({ type: "image", url }))
        ],
        model: selection.model,
        effort: selection.effort,
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly" },
        ...(prepared.outputSchema
          ? { outputSchema: prepared.outputSchema }
          : {})
      }
    }
  }
}
