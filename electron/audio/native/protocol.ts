export const AUDIO_HELPER_PROTOCOL_VERSION = 1 as const

export const AUDIO_SOURCES = ["microphone", "system"] as const
export type AudioSource = (typeof AUDIO_SOURCES)[number]

export type AudioHelperCommand =
  | {
      readonly protocolVersion: typeof AUDIO_HELPER_PROTOCOL_VERSION
      readonly type: "start"
      readonly source: AudioSource
    }
  | {
      readonly protocolVersion: typeof AUDIO_HELPER_PROTOCOL_VERSION
      readonly type: "pause" | "stop"
      readonly source: AudioSource
    }
  | {
      readonly protocolVersion: typeof AUDIO_HELPER_PROTOCOL_VERSION
      readonly type: "shutdown"
    }

export type AudioHelperEvent =
  | {
      readonly protocolVersion: typeof AUDIO_HELPER_PROTOCOL_VERSION
      readonly type: "ready"
    }
  | {
      readonly protocolVersion: typeof AUDIO_HELPER_PROTOCOL_VERSION
      readonly type: "started"
      readonly source: AudioSource
      readonly sampleRate: number
      readonly channels: number
      readonly sampleFormat: "f32le"
    }
  | {
      readonly protocolVersion: typeof AUDIO_HELPER_PROTOCOL_VERSION
      readonly type: "paused" | "stopped"
      readonly source: AudioSource
    }
  | {
      readonly protocolVersion: typeof AUDIO_HELPER_PROTOCOL_VERSION
      readonly type: "permission-denied" | "error"
      readonly source: AudioSource
      readonly code: string
    }
  | {
      readonly protocolVersion: typeof AUDIO_HELPER_PROTOCOL_VERSION
      readonly type: "shutdown-complete"
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isSource(value: unknown): value is AudioSource {
  return (
    typeof value === "string" &&
    AUDIO_SOURCES.includes(value as AudioSource)
  )
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[]
): boolean {
  const keys = new Set(allowed)
  return Object.keys(value).every((key) => keys.has(key))
}

export function parseAudioHelperEvent(line: string): AudioHelperEvent {
  if (Buffer.byteLength(line, "utf8") > 16_384) {
    throw new Error("Native audio helper event is oversized")
  }
  const parsed: unknown = JSON.parse(line)
  if (
    !isRecord(parsed) ||
    parsed.protocolVersion !== AUDIO_HELPER_PROTOCOL_VERSION ||
    typeof parsed.type !== "string"
  ) {
    throw new Error("Native audio helper event is malformed")
  }
  switch (parsed.type) {
    case "ready":
    case "shutdown-complete":
      if (!hasOnlyKeys(parsed, ["protocolVersion", "type"])) break
      return parsed as AudioHelperEvent
    case "paused":
    case "stopped":
      if (
        !hasOnlyKeys(parsed, ["protocolVersion", "type", "source"]) ||
        !isSource(parsed.source)
      ) {
        break
      }
      return parsed as AudioHelperEvent
    case "started":
      if (
        !hasOnlyKeys(parsed, [
          "protocolVersion",
          "type",
          "source",
          "sampleRate",
          "channels",
          "sampleFormat"
        ]) ||
        !isSource(parsed.source) ||
        !Number.isSafeInteger(parsed.sampleRate) ||
        Number(parsed.sampleRate) < 8_000 ||
        Number(parsed.sampleRate) > 192_000 ||
        !Number.isSafeInteger(parsed.channels) ||
        Number(parsed.channels) < 1 ||
        Number(parsed.channels) > 8 ||
        parsed.sampleFormat !== "f32le"
      ) {
        break
      }
      return parsed as AudioHelperEvent
    case "permission-denied":
    case "error":
      if (
        !hasOnlyKeys(parsed, [
          "protocolVersion",
          "type",
          "source",
          "code"
        ]) ||
        !isSource(parsed.source) ||
        typeof parsed.code !== "string" ||
        !/^[A-Z0-9_]{1,64}$/.test(parsed.code)
      ) {
        break
      }
      return parsed as AudioHelperEvent
  }
  throw new Error("Native audio helper event is malformed")
}

export function encodeAudioHelperCommand(command: AudioHelperCommand): string {
  return `${JSON.stringify(command)}\n`
}
