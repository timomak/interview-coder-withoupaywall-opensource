import { ProviderEvent } from "../../src/shared/provider"
import { sanitizeProviderText } from "./sanitize"

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : {}
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function parseLines(lines: readonly string[]): unknown[] {
  return lines.flatMap((line) => {
    try {
      return [JSON.parse(line) as unknown]
    } catch {
      return []
    }
  })
}

function jsonPayload(value: unknown): unknown | undefined {
  if (typeof value !== "string") return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    return typeof parsed === "object" && parsed !== null
      ? parsed
      : undefined
  } catch {
    return undefined
  }
}

export function normalizeClaudeEvents(
  lines: readonly string[],
  sensitiveValues: readonly string[]
): ProviderEvent[] {
  const events: ProviderEvent[] = []
  let sequence = 0
  for (const raw of parseLines(lines)) {
    const item = record(raw)
    const type = item.type
    const subtype = item.subtype
    if (type === "assistant") {
      const message = record(item.message)
      const content = Array.isArray(message.content) ? message.content : []
      if (content.some((block) => record(block).type === "tool_use")) {
        throw new Error("Claude attempted a disabled tool")
      }
    }
    if (type === "system" && subtype === "init") {
      events.push({ type: "started", sequence: sequence++ })
    } else if (type === "stream_event") {
      const streamEvent = record(item.event)
      const delta = record(streamEvent.delta)
      const contentBlock = record(streamEvent.content_block)
      if (
        streamEvent.type === "content_block_start" &&
        contentBlock.type === "tool_use"
      ) {
        throw new Error("Claude attempted a disabled tool")
      }
      if (delta.type === "text_delta" && typeof delta.text === "string") {
        events.push({
          type: "text-delta",
          sequence: sequence++,
          text: delta.text
        })
      }
    } else if (type === "structured_output") {
      events.push({
        type: "typed-payload",
        sequence: sequence++,
        payload: item.payload
      })
    } else if (type === "compact_boundary") {
      events.push({
        type: "compaction",
        sequence: sequence++,
        reason: typeof item.reason === "string" ? item.reason : "provider"
      })
    } else if (type === "result") {
      if (item.structured_output !== undefined) {
        events.push({
          type: "typed-payload",
          sequence: sequence++,
          payload: item.structured_output
        })
      }
      const usage = record(item.usage)
      events.push({
        type: "usage",
        sequence: sequence++,
        inputTokens: finiteNumber(usage.input_tokens),
        outputTokens: finiteNumber(usage.output_tokens)
      })
      if (item.is_error === true) {
        events.push({
          type: "error",
          sequence: sequence++,
          code: "PROCESS_FAILED",
          message: sanitizeProviderText(
            typeof item.result === "string" ? item.result : "Provider failed",
            sensitiveValues
          ),
          recoverable: true
        })
      } else {
        events.push({
          type: "stopped",
          sequence: sequence++,
          reason:
            typeof item.stop_reason === "string" ? item.stop_reason : "end_turn"
        })
        events.push({ type: "completed", sequence: sequence++ })
      }
    }
  }
  return events
}

export function normalizeCodexEvents(
  lines: readonly string[],
  sensitiveValues: readonly string[]
): ProviderEvent[] {
  const events: ProviderEvent[] = []
  let sequence = 0
  for (const raw of parseLines(lines)) {
    const message = record(raw)
    const params = record(message.params)
    const method = message.method
    if (message.error !== undefined) {
      const error = record(message.error)
      events.push({
        type: "error",
        sequence: sequence++,
        code: "PROCESS_FAILED",
        message: sanitizeProviderText(
          typeof error.message === "string" ? error.message : "Provider failed",
          sensitiveValues
        ),
        recoverable: true
      })
    } else if (method === "turn/started") {
      events.push({ type: "started", sequence: sequence++ })
    } else if (method === "item/agentMessage/delta") {
      if (typeof params.delta === "string") {
        events.push({
          type: "text-delta",
          sequence: sequence++,
          text: params.delta
        })
      }
    } else if (method === "item/started" || method === "item/completed") {
      const completed = record(params.item)
      const completedType =
        typeof completed.type === "string"
          ? completed.type.replace(/_/g, "").toLowerCase()
          : ""
      if (
        ["commandexecution", "filechange", "mcptoolcall", "websearch"].includes(
          completedType
        )
      ) {
        throw new Error("Codex attempted a disallowed tool")
      }
      if (method === "item/completed" && completed.type === "structured_output") {
        events.push({
          type: "typed-payload",
          sequence: sequence++,
          payload: completed.value
        })
      } else if (method === "item/completed" && completedType === "agentmessage") {
        const payload = jsonPayload(completed.text)
        if (payload !== undefined) {
          events.push({
            type: "typed-payload",
            sequence: sequence++,
            payload
          })
        }
      }
    } else if (method === "thread/compacted") {
      events.push({
        type: "compaction",
        sequence: sequence++,
        reason: "provider"
      })
    } else if (method === "thread/tokenUsage/updated") {
      const usage = record(params.tokenUsage)
      events.push({
        type: "usage",
        sequence: sequence++,
        inputTokens: finiteNumber(usage.inputTokens),
        outputTokens: finiteNumber(usage.outputTokens)
      })
    } else if (method === "turn/completed") {
      const turn = record(params.turn)
      events.push({
        type: "stopped",
        sequence: sequence++,
        reason: typeof turn.status === "string" ? turn.status : "completed"
      })
      events.push({ type: "completed", sequence: sequence++ })
    }
  }
  return events
}
