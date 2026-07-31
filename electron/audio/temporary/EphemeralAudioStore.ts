import { randomUUID } from "node:crypto"
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  rm
} from "node:fs/promises"
import path from "node:path"
import type { FileHandle } from "node:fs/promises"
import { constants } from "node:fs"
import type { AudioSource } from "../native/protocol"

const FILE_PATTERN = /^ic-audio-v1-(microphone|system)-[a-f0-9-]+\.f32le$/

export interface EphemeralAudioStoreOptions {
  readonly maximumFileBytes?: number
  readonly maximumTotalBytes?: number
  readonly id?: () => string
}

export interface EphemeralAudioDescriptor {
  readonly id: string
  readonly source: AudioSource
  readonly path: string
  readonly bytes: number
}

interface OpenAudioFile {
  readonly descriptor: Omit<EphemeralAudioDescriptor, "bytes">
  readonly handle: FileHandle
  bytes: number
}

export class EphemeralAudioStore {
  private readonly maximumFileBytes: number
  private readonly maximumTotalBytes: number
  private readonly id: () => string
  private readonly openFiles = new Map<string, OpenAudioFile>()
  private totalBytes = 0

  constructor(
    private readonly root: string,
    options: EphemeralAudioStoreOptions = {}
  ) {
    if (!path.isAbsolute(root)) {
      throw new Error("Ephemeral audio root must be absolute")
    }
    this.maximumFileBytes = options.maximumFileBytes ?? 32 * 1024 * 1024
    this.maximumTotalBytes = options.maximumTotalBytes ?? 64 * 1024 * 1024
    this.id = options.id ?? randomUUID
    if (
      !Number.isSafeInteger(this.maximumFileBytes) ||
      this.maximumFileBytes <= 0 ||
      !Number.isSafeInteger(this.maximumTotalBytes) ||
      this.maximumTotalBytes < this.maximumFileBytes
    ) {
      throw new Error("Ephemeral audio bounds are invalid")
    }
  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const metadata = await lstat(this.root)
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("Ephemeral audio root must be a regular directory")
    }
    if (
      typeof process.getuid === "function" &&
      metadata.uid !== process.getuid()
    ) {
      throw new Error("Ephemeral audio root is owned by another user")
    }
    await chmod(this.root, 0o700)
    await this.removeKnownStaleFiles()
  }

  async create(source: AudioSource): Promise<string> {
    const id = this.id()
    if (!/^[a-f0-9-]{8,128}$/i.test(id)) {
      throw new Error("Ephemeral audio identifier is invalid")
    }
    const target = path.join(this.root, `ic-audio-v1-${source}-${id}.f32le`)
    const handle = await open(
      target,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600
    )
    await handle.chmod(0o600)
    this.openFiles.set(id, {
      descriptor: { id, source, path: target },
      handle,
      bytes: 0
    })
    return id
  }

  async append(id: string, chunk: Buffer): Promise<void> {
    const file = this.openFiles.get(id)
    if (!file) throw new Error("Ephemeral audio file is not open")
    if (chunk.length === 0) return
    const nextFileBytes = file.bytes + chunk.length
    const nextTotalBytes = this.totalBytes + chunk.length
    if (
      nextFileBytes > this.maximumFileBytes ||
      nextTotalBytes > this.maximumTotalBytes
    ) {
      chunk.fill(0)
      await this.remove(id)
      throw new Error("Ephemeral audio buffer exceeded its bound")
    }
    try {
      await file.handle.writeFile(chunk)
      file.bytes = nextFileBytes
      this.totalBytes = nextTotalBytes
    } finally {
      chunk.fill(0)
    }
  }

  async finalize(id: string): Promise<EphemeralAudioDescriptor> {
    const file = this.openFiles.get(id)
    if (!file) throw new Error("Ephemeral audio file is not open")
    await file.handle.sync()
    await file.handle.close()
    this.openFiles.delete(id)
    const metadata = await lstat(file.descriptor.path)
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      (metadata.mode & 0o777) !== 0o600 ||
      metadata.size !== file.bytes
    ) {
      await rm(file.descriptor.path, { force: true })
      this.totalBytes -= file.bytes
      throw new Error("Ephemeral audio file failed its ownership boundary")
    }
    return { ...file.descriptor, bytes: file.bytes }
  }

  async remove(id: string): Promise<void> {
    const file = this.openFiles.get(id)
    if (file) {
      this.openFiles.delete(id)
      await file.handle.close().catch(() => undefined)
      this.totalBytes -= file.bytes
      await rm(file.descriptor.path, { force: true })
      return
    }
    const name = (await readdir(this.root)).find((candidate) =>
      candidate.endsWith(`-${id}.f32le`)
    )
    if (!name || !FILE_PATTERN.test(name)) return
    const target = path.join(this.root, name)
    const metadata = await lstat(target)
    if (metadata.isFile() && !metadata.isSymbolicLink()) {
      this.totalBytes = Math.max(0, this.totalBytes - metadata.size)
      await rm(target, { force: true })
    }
  }

  async cleanupAll(): Promise<void> {
    const ids = [...this.openFiles.keys()]
    for (const id of ids) await this.remove(id)
    await this.removeKnownStaleFiles()
    this.totalBytes = 0
  }

  private async removeKnownStaleFiles(): Promise<void> {
    for (const name of await readdir(this.root)) {
      if (!FILE_PATTERN.test(name)) continue
      const target = path.join(this.root, name)
      const metadata = await lstat(target)
      if (metadata.isFile() && !metadata.isSymbolicLink()) {
        await rm(target, { force: true })
      }
    }
  }
}
