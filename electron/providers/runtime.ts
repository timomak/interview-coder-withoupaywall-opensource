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

export interface StartProviderSession {
  provider: ProviderId
  model: string
  responseMode: ResponseMode
  conversationId: string
}

export interface ProviderSession {
  readonly selection: Readonly<ProviderSelection>
  runTurn(prompt: string, signal?: AbortSignal): Promise<ProviderTurnResult>
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
    assertOpaqueId(request.conversationId)
    const selection = createSelection(
      request.provider,
      request.model,
      request.responseMode
    )
    const executable = this.configuration.executables[selection.provider]
    const conversationId = request.conversationId

    return Object.freeze({
      selection,
      runTurn: (prompt: string, signal?: AbortSignal) =>
        this.runTurn(executable, selection, conversationId, prompt, signal)
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
    conversationId: string,
    prompt: string,
    signal?: AbortSignal
  ): Promise<ProviderTurnResult> {
    await this.verifyVersion(executable, selection, conversationId, signal)
    const request =
      selection.provider === "claude-code"
        ? this.claudeRequest(selection, conversationId, prompt, signal)
        : this.codexRequest(selection, conversationId, prompt, signal)
    const result = await this.runner.run(request)
    const processError = errorFromProcess(result)
    let events: ProviderEvent[]
    if (processError) {
      events = [processError]
    } else {
      try {
        events =
          selection.provider === "claude-code"
            ? normalizeClaudeEvents(result.stdoutLines, [conversationId])
            : normalizeCodexEvents(result.stdoutLines, [conversationId])
      } catch {
        events = [
          {
            type: "error",
            sequence: 0,
            code: "PROTOCOL_ERROR",
            message: "Provider emitted an unsupported protocol event",
            recoverable: true
          }
        ]
      }
    }

    if (events.length === 0) {
      events.push({
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
    conversationId: string,
    prompt: string,
    signal?: AbortSignal
  ) {
    return {
      executable: this.configuration.executables["claude-code"],
      args: [
        "--print",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--resume",
        conversationId,
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
      sensitiveValues: [conversationId],
      ...this.options
    }
  }

  private codexRequest(
    selection: Readonly<ProviderSelection>,
    conversationId: string,
    prompt: string,
    signal?: AbortSignal
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
      {
        id: 2,
        method: "thread/resume",
        params: { threadId: conversationId }
      },
      {
        id: 3,
        method: "turn/start",
        params: {
          threadId: conversationId,
          input: [{ type: "text", text: prompt }],
          model: selection.model,
          effort: selection.effort,
          approvalPolicy: "never",
          sandboxPolicy: { type: "readOnly" }
        }
      }
    ]
    return {
      executable: this.configuration.executables.codex,
      args: ["app-server", "--stdio", "--strict-config"],
      stdinLines: messages.map((message) => JSON.stringify(message)),
      signal,
      sensitiveValues: [conversationId],
      ...this.options
    }
  }
}
