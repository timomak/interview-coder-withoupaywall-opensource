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
    message: result.stderr || `Provider process ${result.failure}`,
    recoverable: true
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
        const outcome = await this.runTurn(
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
                input.end()
              } else if (this.codexConversationRejected(line)) {
                input.end()
              }
              for (const event of normalizeCodexEvents([line], [
                conversation.conversationId
              ])) {
                if (event.type === "started" && conversationAnnounced) continue
                await emit(event)
              }
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
    const messages = [
      {
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "InterviewCopilot", version: "1" },
          capabilities: { experimentalApi: false }
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
      ...this.options
    }
  }

  private codexConversationId(line: string): string | undefined {
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      throw new Error("Codex emitted malformed JSON")
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
    const value = JSON.parse(line) as unknown
    if (typeof value !== "object" || value === null) return false
    const message = value as Record<string, unknown>
    return message.id === 2 && message.error !== undefined
  }

  private codexTurnStart(
    selection: Readonly<ProviderSelection>,
    conversationId: string,
    prompt: string
  ) {
    return {
      id: 3,
      method: "turn/start",
      params: {
        threadId: conversationId,
        input: [{ type: "text", text: prompt, text_elements: [] }],
        model: selection.model,
        effort: selection.effort,
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly" }
      }
    }
  }
}
