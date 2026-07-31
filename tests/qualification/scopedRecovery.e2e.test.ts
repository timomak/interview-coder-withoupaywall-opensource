import { describe, expect, it, vi } from "vitest"
import {
  ScopedRecoveryController,
  type RecoverableCapability
} from "../../electron/qualification/scopedRecovery"

describe("release scoped recovery", () => {
  it("preserves session through every permission/provider failure", async () => {
    const session = { id: "active-session", pendingPacket: "packet-1" }
    const controller = new ScopedRecoveryController(session)
    const capabilities: RecoverableCapability[] = [
      "provider",
      "microphone",
      "system-audio",
      "screen-capture"
    ]
    for (const capability of capabilities) {
      const failed = controller.fail(capability, `${capability} unavailable`)
      expect(failed.session).toBe(session)
      expect(controller.available(capability)).toBe(false)
    }
    expect(controller.available("provider")).toBe(false)
    expect(controller.available("microphone")).toBe(false)

    for (const capability of capabilities) {
      const repair = vi.fn(async () => undefined)
      const retry = vi.fn(async () => undefined)
      const recovered = await controller.recover(capability, repair, retry)
      expect(recovered.session).toBe(session)
      expect(repair).toHaveBeenCalledOnce()
      expect(retry).toHaveBeenCalledOnce()
      expect(controller.available(capability)).toBe(true)
    }
    expect(controller.current()).toEqual({ session, failures: {} })
  })
})
