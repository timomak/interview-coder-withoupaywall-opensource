import { describe, expect, it, vi } from "vitest"
import { DiagnosticService } from "./DiagnosticService"

describe("local diagnostics", () => {
  it("previews redacted local-only diagnostic export", async () => {
    const write = vi.fn(async () => undefined)
    const service = new DiagnosticService(
      () => "2026-07-31T12:00:00.000Z",
      write
    )
    const preview = service.preview({
      appVersion: "1.0.19",
      providerState: "ready",
      transcript: "PRIVATE_TRANSCRIPT",
      nested: {
        screenshots: ["PRIVATE_IMAGE"],
        credentials: "PRIVATE_CREDENTIAL",
        harmless: "kept",
        message: "Bearer PRIVATE_TOKEN"
      }
    })
    const serialized = JSON.stringify(preview)
    expect(preview.localOnly).toBe(true)
    expect(preview.redacted).toBe(true)
    expect(serialized).not.toContain("PRIVATE")
    expect(serialized).toContain("kept")
    expect(write).not.toHaveBeenCalled()
    await service.export("/tmp/diagnostics.json", preview)
    expect(write).toHaveBeenCalledOnce()
    await expect(service.export("/tmp/replay.json", preview)).rejects.toThrow(
      "exact displayed preview"
    )
    expect(Object.getOwnPropertyNames(DiagnosticService.prototype)).not.toContain("upload")
  })
})
