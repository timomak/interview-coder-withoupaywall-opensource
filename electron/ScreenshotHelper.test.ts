import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { EncryptedBlobRepository, StoragePaths } from "./storage"

const TEST_KEY = Buffer.from(
  Array.from({ length: 32 }, (_, index) => index + 1)
)

async function withTempDirectory<T>(
  run: (root: string) => Promise<T>
): Promise<T> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ic-screenshot-"))
  try {
    return await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function readTree(root: string): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>()
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(target)
      if (entry.isFile()) {
        result.set(path.relative(root, target), await readFile(target))
      }
    }
  }
  await visit(root)
  return result
}

describe("encrypted screenshot queue", () => {
  it("captures previews retains and deletes without plaintext PNG persistence", async () => {
    await withTempDirectory(async (fixtureRoot) => {
      const userData = path.join(fixtureRoot, "userData")
      const temporary = path.join(fixtureRoot, "temp")
      await mkdir(temporary, { recursive: true })
      const paths = new StoragePaths(path.join(userData, "encrypted"))
      const keys = { get: async () => Buffer.from(TEST_KEY) }
      const blobs = new EncryptedBlobRepository(paths, keys)
      const marker = Buffer.from(
        "PNG::IC-M01-REC-01::distinctive-plaintext-marker",
        "utf8"
      )
      const capturedBuffers: Buffer[] = []
      let sequence = 0
      const helper = new ScreenshotHelper(blobs, {
        capture: async () => {
          const bytes = Buffer.from(marker)
          capturedBuffers.push(bytes)
          return bytes
        },
        id: () => `opaque-capture-${++sequence}`,
        hideDelayMs: 0,
        showDelayMs: 0,
        maximumScreenshots: 2
      })
      const visibility: string[] = []

      const firstId = await helper.takeScreenshot(
        () => visibility.push("hidden"),
        () => visibility.push("shown")
      )
      expect(firstId).toBe("opaque-capture-1")
      expect(visibility).toEqual(["hidden", "shown"])
      expect(helper.getScreenshotQueue()).toEqual([firstId])
      expect(await helper.getImagePreview(firstId)).toBe(
        `data:image/png;base64,${marker.toString("base64")}`
      )
      expect(capturedBuffers[0].every((byte) => byte === 0)).toBe(true)
      const reopened = await blobs.get({
        id: firstId,
        contentType: "image/png",
        retentionClass: "artifact"
      })
      expect(reopened).toEqual(marker)
      reopened?.fill(0)

      const raw = marker
      const base64 = Buffer.from(marker.toString("base64"), "utf8")
      const hex = Buffer.from(marker.toString("hex"), "utf8")
      const encryptedTree = await readTree(userData)
      expect(
        [...encryptedTree.keys()].some((file) => file.endsWith(".enc"))
      ).toBe(true)
      for (const [file, bytes] of encryptedTree) {
        expect(file.endsWith(".png")).toBe(false)
        expect(bytes.includes(raw)).toBe(false)
        expect(bytes.includes(base64)).toBe(false)
        expect(bytes.includes(hex)).toBe(false)
      }
      expect((await readTree(temporary)).size).toBe(0)

      const secondId = await helper.takeScreenshot(() => {}, () => {})
      const thirdId = await helper.takeScreenshot(() => {}, () => {})
      expect(helper.getScreenshotQueue()).toEqual([secondId, thirdId])
      expect(
        await blobs.get({
          id: firstId,
          contentType: "image/png",
          retentionClass: "artifact"
        })
      ).toBeUndefined()
      expect(await helper.deleteScreenshot(secondId)).toEqual({ success: true })
      expect(helper.getScreenshotQueue()).toEqual([thirdId])
      await helper.clearQueues()
      expect(helper.getScreenshotQueue()).toEqual([])
      expect(
        await blobs.get({
          id: thirdId,
          contentType: "image/png",
          retentionClass: "artifact"
        })
      ).toBeUndefined()

      for (const [file, bytes] of await readTree(userData)) {
        expect(file.endsWith(".png")).toBe(false)
        expect(bytes.includes(raw)).toBe(false)
        expect(bytes.includes(base64)).toBe(false)
        expect(bytes.includes(hex)).toBe(false)
      }
    })
  })

  it("uses the Windows in-memory fallback without a filename", async () => {
    await withTempDirectory(async (fixtureRoot) => {
      const paths = new StoragePaths(path.join(fixtureRoot, "encrypted"))
      const keys = { get: async () => Buffer.from(TEST_KEY) }
      const blobs = new EncryptedBlobRepository(paths, keys)
      const marker = Buffer.from("PNG::WINDOWS::IN-MEMORY", "utf8")
      const fallback = vi.fn(async () => Buffer.from(marker))
      const helper = new ScreenshotHelper(blobs, {
        platform: "win32",
        capture: async () => {
          throw new Error("primary in-memory capture unavailable")
        },
        captureWindowsFallback: fallback,
        id: () => "opaque-windows-capture",
        hideDelayMs: 0,
        showDelayMs: 0
      })

      const id = await helper.takeScreenshot(() => {}, () => {})
      expect(id).toBe("opaque-windows-capture")
      expect(fallback).toHaveBeenCalledOnce()
      expect(await helper.getImagePreview(id)).toBe(
        `data:image/png;base64,${marker.toString("base64")}`
      )
    })
  })

  it("clears retained encrypted screenshots after restart without queue rehydration", async () => {
    await withTempDirectory(async (fixtureRoot) => {
      const paths = new StoragePaths(path.join(fixtureRoot, "encrypted"))
      const keys = { get: async () => Buffer.from(TEST_KEY) }
      const blobs = new EncryptedBlobRepository(
        paths,
        keys,
        undefined,
        "screenshots"
      )
      const beforeRestart = new ScreenshotHelper(blobs, {
        capture: async () => Buffer.from("PNG::RESTART::RESET", "utf8"),
        id: () => "opaque-retained-capture",
        hideDelayMs: 0,
        showDelayMs: 0
      })
      const screenshotId = await beforeRestart.takeScreenshot(() => {}, () => {})
      expect(
        await blobs.get({
          id: screenshotId,
          contentType: "image/png",
          retentionClass: "artifact"
        })
      ).toBeDefined()

      const afterRestart = new ScreenshotHelper(blobs, {
        capture: async () => Buffer.alloc(0),
        hideDelayMs: 0,
        showDelayMs: 0
      })
      expect(afterRestart.getScreenshotQueue()).toEqual([])
      await afterRestart.clearQueues()
      expect(
        await blobs.get({
          id: screenshotId,
          contentType: "image/png",
          retentionClass: "artifact"
        })
      ).toBeUndefined()
    })
  })
})
