export const PROVIDER_IDS = ["claude-code", "codex"] as const

export type ProviderId = (typeof PROVIDER_IDS)[number]
export type ResponseMode = "fast" | "reasoning"
export type ProviderEffort = "low" | "high"

export interface ProviderSelection {
  provider: ProviderId
  model: string
  responseMode: ResponseMode
  effort: ProviderEffort
}

export interface ProviderCapabilities {
  provider: ProviderId
  protocol: string
  minimumCliVersion: string
  maximumCliVersionExclusive: string
  models: readonly string[]
  responseModes: Readonly<Record<ResponseMode, ProviderEffort | null>>
}

export type ProviderEvent =
  | { type: "started"; sequence: number }
  | { type: "text-delta"; sequence: number; text: string }
  | { type: "typed-payload"; sequence: number; payload: unknown }
  | {
      type: "usage"
      sequence: number
      inputTokens: number
      outputTokens: number
    }
  | { type: "compaction"; sequence: number; reason: string }
  | { type: "stopped"; sequence: number; reason: string }
  | { type: "completed"; sequence: number }
  | {
      type: "error"
      sequence: number
      code:
        | "AUTH_REQUIRED"
        | "CANCELLED"
        | "OUTPUT_LIMIT"
        | "PROCESS_FAILED"
        | "PROTOCOL_ERROR"
        | "TIMEOUT"
        | "UNSUPPORTED_CAPABILITY"
      message: string
      recoverable: boolean
    }

export interface ProviderTurnResult {
  selection: Readonly<ProviderSelection>
  events: readonly ProviderEvent[]
}

export interface ProviderDiagnostics {
  provider: ProviderId
  installed: boolean
  authenticated: boolean
  supported: boolean
  version?: string
  reason?: string
}

export const PROVIDER_DIAGNOSTICS_CHANNEL = "provider:diagnostics" as const
export const PROVIDER_CONFIGURE_CHANNEL = "provider:configure" as const

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && PROVIDER_IDS.includes(value as ProviderId)
}
