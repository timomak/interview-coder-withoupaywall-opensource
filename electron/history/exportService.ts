import { createHash, randomBytes } from "node:crypto"
import {
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rm
} from "node:fs/promises"
import path from "node:path"
import type {
  HistoryArchiveV1,
  HistoryExportReceipt,
  HistoryExportRequest
} from "../../src/features/history/types"

export type ExportBoundary = "staged" | "backup-renamed" | "accepted"

function safeAssetName(id: string): string {
  return `${createHash("sha256").update(id).digest("hex")}.png`
}

function redact(value: unknown, key = ""): unknown {
  if (/raw[-_ ]?audio|password|authorization|api[-_]?key|access[-_]?token/i.test(key)) {
    return undefined
  }
  if (Array.isArray(value)) return value.map((item) => redact(item)).filter((item) => item !== undefined)
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([childKey, item]) => [childKey, redact(item, childKey)] as const)
        .filter(([, item]) => item !== undefined)
    )
  }
  return value
}

async function assertDestination(destination: string): Promise<void> {
  if (
    !path.isAbsolute(destination) ||
    destination.includes("\0") ||
    path.normalize(destination) !== destination
  ) throw new Error("Export destination must be an explicit normalized absolute path")
  const parent = path.dirname(destination)
  const parentInfo = await lstat(parent)
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) {
    throw new Error("Export destination parent must be a regular directory")
  }
  if (typeof process.getuid === "function" && parentInfo.uid !== process.getuid()) {
    throw new Error("Export destination is owned by another user")
  }
  const existing = await lstat(destination).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (existing?.isSymbolicLink()) throw new Error("Export destination cannot be a symbolic link")
  if (existing && typeof process.getuid === "function" && existing.uid !== process.getuid()) {
    throw new Error("Export destination is owned by another user")
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r")
  try { await handle.sync() } finally { await handle.close() }
}

async function writeFileSynced(target: string, bytes: string | Buffer): Promise<void> {
  const handle = await open(target, "wx", 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

function markdown(archive: HistoryArchiveV1): string {
  const transcript = archive.session.audio.segments
    .filter((segment) => segment.state === "final")
    .map((segment) => `- **${segment.speaker.label}:** ${segment.text}`)
  const sections = archive.session.sections.map(
    (section) => `## ${section.id}\n\n${section.body}`
  )
  const exchanges = archive.session.compactExchanges.map(
    (exchange) => `## Follow-up\n\n**Question:** ${exchange.prompt}\n\n${exchange.answer}`
  )
  const assets = archive.screenshots.map(
    (shot) => `![Screenshot](assets/${safeAssetName(shot.id)})`
  )
  return [
    `# ${archive.mode} interview`,
    `- Started: ${archive.startedAt}`,
    `- Completed: ${archive.sealedAt}`,
    `- Provider: ${archive.provider}`,
    `- Model: ${archive.model}`,
    "## Transcript",
    ...transcript,
    ...sections,
    ...exchanges,
    "## Screenshots",
    ...assets,
    ""
  ].join("\n")
}

export class HistoryExportService {
  constructor(
    private readonly checkpoint?: (boundary: ExportBoundary) => void | Promise<void>
  ) {}

  async export(
    archive: HistoryArchiveV1,
    request: HistoryExportRequest
  ): Promise<HistoryExportReceipt> {
    if (
      request.sessionId !== archive.sessionId ||
      request.disclosureAccepted !== true ||
      !["json", "markdown"].includes(request.format)
    ) throw new Error("Plaintext export requires explicit disclosure and one session")
    await assertDestination(request.destination)
    const existing = await lstat(request.destination).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    if (existing && !request.overwriteConfirmed) {
      throw new Error("Export destination already exists; overwrite is not confirmed")
    }
    const token = randomBytes(8).toString("hex")
    const staging = path.join(
      path.dirname(request.destination),
      `.${path.basename(request.destination)}.partial-${token}`
    )
    const backup = `${staging}.backup`
    let backupCreated = false
    let accepted = false
    const files: string[] = []
    try {
      if (request.format === "json") {
        const document = redact({
          schemaVersion: 1,
          migration: "M-09",
          recordType: "history-export",
          archive
        })
        await writeFileSynced(staging, `${JSON.stringify(document, null, 2)}\n`)
        files.push(path.basename(request.destination))
      } else {
        await mkdir(staging, { mode: 0o700 })
        await writeFileSynced(path.join(staging, "session.md"), markdown(archive))
        files.push("session.md")
        if (archive.screenshots.length > 0) {
          const assets = path.join(staging, "assets")
          await mkdir(assets, { mode: 0o700 })
          for (const screenshot of archive.screenshots) {
            const bytes = Buffer.from(screenshot.dataUrl.slice(screenshot.dataUrl.indexOf(",") + 1), "base64")
            try {
              const name = safeAssetName(screenshot.id)
              await writeFileSynced(path.join(assets, name), bytes)
              files.push(`assets/${name}`)
            } finally {
              bytes.fill(0)
            }
          }
          await syncDirectory(assets)
        }
        await syncDirectory(staging)
      }
      await this.checkpoint?.("staged")
      if (existing) {
        await rename(request.destination, backup)
        backupCreated = true
        await this.checkpoint?.("backup-renamed")
      }
      await rename(staging, request.destination)
      await syncDirectory(path.dirname(request.destination))
      accepted = true
      await this.checkpoint?.("accepted")
      if (backupCreated) await rm(backup, { recursive: true, force: true })
      return {
        schemaVersion: 1,
        sessionId: archive.sessionId,
        format: request.format,
        destination: request.destination,
        files
      }
    } catch (error) {
      if (accepted) await rm(request.destination, { recursive: true, force: true }).catch(() => undefined)
      await rm(staging, { recursive: true, force: true }).catch(() => undefined)
      if (backupCreated) await rename(backup, request.destination).catch(() => undefined)
      throw error
    } finally {
      if (!backupCreated) await rm(backup, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

export async function exportedFiles(destination: string): Promise<readonly string[]> {
  const info = await lstat(destination)
  if (info.isFile()) return [path.basename(destination)]
  const result: string[] = []
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(target)
      else result.push(path.relative(destination, target))
    }
  }
  await visit(destination)
  return result.sort()
}
