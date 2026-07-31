import { canonicalJson, sha256, type ManifestEntry } from "./protocol"

export class QualificationCollector {
  private readonly files = new Map<string, Buffer>()
  private readonly frozen = new Map<string, string>()
  private finalized = false

  create(path: string, bytes: Buffer | string): void {
    if (this.finalized) throw new Error("Qualification run is already finalized")
    if (!/^[a-z0-9][a-z0-9./-]*$/.test(path) || path.includes("..") || path.startsWith("/")) {
      throw new Error("Qualification path is invalid")
    }
    if (this.files.has(path)) throw new Error(`Second write rejected: ${path}`)
    this.files.set(path, Buffer.isBuffer(bytes) ? Buffer.from(bytes) : Buffer.from(bytes))
  }

  freeze(path: string): void {
    const bytes = this.files.get(path)
    if (!bytes) throw new Error(`Cannot freeze absent member: ${path}`)
    this.frozen.set(path, sha256(bytes))
  }

  assertFrozen(): void {
    for (const [path, digest] of this.frozen) {
      const bytes = this.files.get(path)
      if (!bytes || sha256(bytes) !== digest) {
        throw new Error(`Frozen qualification member changed: ${path}`)
      }
    }
  }

  manifest(kind: "evidence" | "bundle", paths: readonly string[]): Buffer {
    this.assertFrozen()
    const entries: ManifestEntry[] = paths.map((path) => {
      const bytes = this.files.get(path)
      if (!bytes || !this.frozen.has(path)) throw new Error(`Manifest member is not frozen: ${path}`)
      return { path, bytes: String(bytes.length), sha256: sha256(bytes) }
    })
    return Buffer.from(canonicalJson({ schemaVersion: 1, kind, algorithm: "sha256", entries }))
  }

  finish(): ReadonlyMap<string, Buffer> {
    this.assertFrozen()
    this.finalized = true
    return new Map([...this.files].map(([path, bytes]) => [path, Buffer.from(bytes)]))
  }

  // Test-only fault boundary: models a hostile write through a retained descriptor.
  simulateMutation(path: string, bytes: Buffer): void {
    this.files.set(path, Buffer.from(bytes))
  }
}
