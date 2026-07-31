import { writeFile } from "node:fs/promises"

const FORBIDDEN_KEYS = new Set([
  "transcript",
  "audio",
  "screenshots",
  "prompts",
  "responses",
  "profile",
  "opportunity",
  "credentials",
  "tokens",
  "deviceId",
  "deviceIds"
])
const SECRET_VALUE = /(?:sk-|api[_-]?key|bearer\s+|oauth|token[=:])/i

export interface DiagnosticPreview {
  readonly schemaVersion: 1
  readonly generatedAt: string
  readonly redacted: true
  readonly localOnly: true
  readonly values: Readonly<Record<string, unknown>>
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue)
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) continue
      output[key] = redactValue(child)
    }
    return output
  }
  if (typeof value === "string" && SECRET_VALUE.test(value)) return "[redacted]"
  return value
}

export class DiagnosticService {
  private previewDigest?: string

  constructor(
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly write: (destination: string, bytes: string) => Promise<void> =
      (destination, bytes) => writeFile(destination, bytes, { mode: 0o600 })
  ) {}

  preview(input: Readonly<Record<string, unknown>>): DiagnosticPreview {
    const preview = {
      schemaVersion: 1 as const,
      generatedAt: this.now(),
      redacted: true as const,
      localOnly: true as const,
      values: redactValue(input) as Readonly<Record<string, unknown>>
    }
    this.previewDigest = JSON.stringify(preview)
    return preview
  }

  async export(destination: string, preview: DiagnosticPreview): Promise<void> {
    if (JSON.stringify(preview) !== this.previewDigest) {
      throw new Error("Diagnostic export requires the exact displayed preview")
    }
    if (!destination.trim()) throw new Error("Diagnostic export path is required")
    await this.write(destination, `${JSON.stringify(preview, null, 2)}\n`)
    this.previewDigest = undefined
  }
}
