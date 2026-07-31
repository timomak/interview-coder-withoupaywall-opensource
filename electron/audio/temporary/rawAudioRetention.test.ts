import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { EphemeralAudioStore } from "./EphemeralAudioStore"

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) {
    const store = new EphemeralAudioStore(root)
    await store.initialize()
    await store.cleanupAll()
  }
})

describe("ephemeral raw-audio retention boundary", () => {
  it("uses mode 0600 and removes success Reset and crash leftovers", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ic-audio-retention-"))
    roots.push(root)
    const store = new EphemeralAudioStore(root, {
      id: () => "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    })
    await store.initialize()
    const id = await store.create("microphone")
    const marker = Buffer.from("SYNTHETIC-RAW-AUDIO-MARKER")
    await store.append(id, marker)
    expect(marker.every((byte) => byte === 0)).toBe(true)
    const descriptor = await store.finalize(id)
    expect((await stat(descriptor.path)).mode & 0o777).toBe(0o600)
    expect(await readFile(descriptor.path, "utf8")).toBe(
      "SYNTHETIC-RAW-AUDIO-MARKER"
    )
    await store.cleanupAll()
    expect(await readdir(root)).toEqual([])

    const stale = path.join(
      root,
      "ic-audio-v1-system-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.f32le"
    )
    await writeFile(stale, "CRASH-LEFTOVER", { mode: 0o600 })
    const restarted = new EphemeralAudioStore(root)
    await restarted.initialize()
    expect(await readdir(root)).toEqual([])
  })

  it("deletes the active file when a bounded append is exceeded", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ic-audio-bounds-"))
    roots.push(root)
    const store = new EphemeralAudioStore(root, {
      maximumFileBytes: 4,
      maximumTotalBytes: 4,
      id: () => "cccccccc-cccc-cccc-cccc-cccccccccccc"
    })
    await store.initialize()
    const id = await store.create("system")
    const oversized = Buffer.alloc(5, 7)
    await expect(store.append(id, oversized)).rejects.toThrow("exceeded")
    expect(oversized.every((byte) => byte === 0)).toBe(true)
    expect(await readdir(root)).toEqual([])
  })
})
