import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { canonicalJson, parseCanonicalJson, sha256, type ManifestEntry } from "./protocol"

interface TouchRecord {
  readonly schemaVersion: 1
  readonly path: string
  readonly bytes: string
  readonly sha256: string
}

function syncDirectory(directory: string): void {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY)
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}

function exclusiveWrite(target: string, bytes: Buffer, mode = 0o600): void {
  const fd = fs.openSync(target, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, mode)
  try {
    let offset = 0
    while (offset < bytes.length) offset += fs.writeSync(fd, bytes, offset)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  syncDirectory(path.dirname(target))
}

export class QualificationCollector {
  private readonly runRoot: string
  private readonly stateRoot: string
  private readonly touchRoot: string
  private readonly frozenRoot: string

  constructor(runRoot: string) {
    this.runRoot = path.resolve(runRoot)
    this.stateRoot = `${this.runRoot}.collector-state`
    this.touchRoot = path.join(this.stateRoot, "first-touch")
    this.frozenRoot = path.join(this.stateRoot, "frozen")
    for (const directory of [this.runRoot, this.stateRoot, this.touchRoot, this.frozenRoot]) {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
      const stat = fs.lstatSync(directory)
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Collector directory is unsafe")
    }
  }

  private resolveMember(relative: string): string {
    if (!/^[a-z0-9][a-z0-9./-]*$/.test(relative) || relative.includes("..") || path.isAbsolute(relative)) {
      throw new Error("Qualification path is invalid")
    }
    const target = path.resolve(this.runRoot, relative)
    if (!target.startsWith(`${this.runRoot}${path.sep}`)) throw new Error("Qualification path escapes run root")
    const parent = path.dirname(target)
    fs.mkdirSync(parent, { recursive: true, mode: 0o700 })
    let cursor = parent
    while (cursor.startsWith(this.runRoot)) {
      const stat = fs.lstatSync(cursor)
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Qualification path crosses an unsafe directory")
      if (cursor === this.runRoot) break
      cursor = path.dirname(cursor)
    }
    return target
  }

  private touchPath(relative: string): string {
    return path.join(this.touchRoot, crypto.createHash("sha256").update(relative).digest("hex"))
  }

  reserveForRecovery(relative: string, value: Buffer | string): void {
    if (fs.existsSync(path.join(this.stateRoot, "finalized.json"))) throw new Error("Qualification run is already finalized")
    const bytes = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value)
    this.resolveMember(relative)
    const record: TouchRecord = { schemaVersion: 1, path: relative, bytes: String(bytes.length), sha256: sha256(bytes) }
    exclusiveWrite(this.touchPath(relative), Buffer.from(canonicalJson(record)))
  }

  private expectedTouch(relative: string, bytes: Buffer): TouchRecord {
    const touch = this.touchPath(relative)
    if (!fs.existsSync(touch)) throw new Error(`Missing first-touch reservation: ${relative}`)
    const record = parseCanonicalJson(fs.readFileSync(touch)) as TouchRecord
    if (
      record.schemaVersion !== 1 || record.path !== relative ||
      record.bytes !== String(bytes.length) || record.sha256 !== sha256(bytes)
    ) throw new Error(`Recovery bytes disagree with first touch: ${relative}`)
    return record
  }

  recover(relative: string, value: Buffer | string): void {
    const bytes = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value)
    const target = this.resolveMember(relative)
    this.expectedTouch(relative, bytes)
    if (!fs.existsSync(target)) exclusiveWrite(target, bytes)
    const installed = fs.readFileSync(target)
    if (!installed.equals(bytes)) throw new Error(`Recovered member bytes disagree: ${relative}`)
  }

  create(relative: string, value: Buffer | string): void {
    const bytes = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value)
    if (fs.existsSync(this.touchPath(relative))) throw new Error(`Second write rejected: ${relative}`)
    this.reserveForRecovery(relative, bytes)
    this.recover(relative, bytes)
  }

  freeze(relative: string): void {
    const bytes = fs.readFileSync(this.resolveMember(relative))
    this.expectedTouch(relative, bytes)
    const record = { schemaVersion: 1, path: relative, bytes: String(bytes.length), sha256: sha256(bytes) }
    exclusiveWrite(path.join(this.frozenRoot, crypto.createHash("sha256").update(relative).digest("hex")), Buffer.from(canonicalJson(record)))
  }

  assertFrozen(): void {
    for (const name of fs.readdirSync(this.frozenRoot)) {
      const record = parseCanonicalJson(fs.readFileSync(path.join(this.frozenRoot, name))) as TouchRecord
      const target = this.resolveMember(record.path)
      const bytes = fs.readFileSync(target)
      if (String(bytes.length) !== record.bytes || sha256(bytes) !== record.sha256) {
        throw new Error(`Frozen qualification member changed: ${record.path}`)
      }
    }
  }

  manifest(kind: "evidence" | "bundle", paths: readonly string[]): Buffer {
    this.assertFrozen()
    const entries: ManifestEntry[] = paths.map((relative) => {
      const bytes = fs.readFileSync(this.resolveMember(relative))
      const frozen = path.join(this.frozenRoot, crypto.createHash("sha256").update(relative).digest("hex"))
      if (!fs.existsSync(frozen)) throw new Error(`Manifest member is not frozen: ${relative}`)
      return { path: relative, bytes: String(bytes.length), sha256: sha256(bytes) }
    })
    return Buffer.from(canonicalJson({ schemaVersion: 1, kind, algorithm: "sha256", entries }))
  }

  finish(paths: readonly string[]): ReadonlyMap<string, Buffer> {
    this.assertFrozen()
    const members = new Map<string, Buffer>()
    for (const relative of paths) {
      const target = this.resolveMember(relative)
      const bytes = fs.readFileSync(target)
      members.set(relative, bytes)
      fs.chmodSync(target, 0o400)
    }
    exclusiveWrite(
      path.join(this.stateRoot, "finalized.json"),
      Buffer.from(canonicalJson({
        schemaVersion: 1,
        kind: "qualification-finalization",
        members: paths.map((relative) => ({ path: relative, sha256: sha256(members.get(relative)!) }))
      })),
      0o400
    )
    const directories: string[] = []
    const visit = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          const child = path.join(directory, entry.name)
          visit(child)
          directories.push(child)
        }
      }
    }
    visit(this.runRoot)
    for (const directory of directories) fs.chmodSync(directory, 0o500)
    fs.chmodSync(this.runRoot, 0o500)
    return members
  }
}
