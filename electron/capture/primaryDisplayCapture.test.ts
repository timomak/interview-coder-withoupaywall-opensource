import { describe, expect, it, vi } from "vitest"
import { ScreenshotHelper } from "../ScreenshotHelper"
import type { BlobDescriptor, BlobRepository } from "../storage"

class MemoryBlobs implements BlobRepository {
  readonly values = new Map<string, Buffer>()

  async put(descriptor: BlobDescriptor, bytes: Buffer): Promise<void> {
    this.values.set(descriptor.id, Buffer.from(bytes))
  }

  async get(descriptor: BlobDescriptor): Promise<Buffer | undefined> {
    return this.values.get(descriptor.id)
  }

  async remove(id: string): Promise<void> {
    this.values.delete(id)
  }

  async clearAll(): Promise<void> {
    this.values.clear()
  }
}

describe("primary-display capture", () => {
  it("captures primary display and preserves visibility", async () => {
    const displayIds: Array<number | undefined> = []
    const hidden = vi.fn()
    const restore = vi.fn()
    const helper = new ScreenshotHelper(new MemoryBlobs(), {
      capture: async (displayId) => {
        displayIds.push(displayId)
        return Buffer.from("primary-display-png")
      },
      primaryDisplayId: () => 731,
      id: () => "capture-one",
      hideDelayMs: 0,
      showDelayMs: 0
    })

    await helper.takeScreenshot(hidden, restore)

    expect(displayIds).toEqual([731])
    expect(hidden).toHaveBeenCalledOnce()
    expect(restore).toHaveBeenCalledOnce()
    expect(helper.getScreenshotQueue()).toEqual(["capture-one"])
  })
})
