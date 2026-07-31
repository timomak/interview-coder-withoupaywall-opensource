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
import {
  HISTORY_MIGRATION,
  MAX_HISTORY_EXPORT_SCREENSHOT_BYTES,
  MAX_HISTORY_EXPORT_SCREENSHOT_TOTAL_BYTES
} from "../../src/features/history/types"
import type { RecordRepository } from "../storage"

const EXPORT_JOURNAL_ID = "history-export-journal-v1"
const EXPORT_JOURNAL_TYPE =
  "application/vnd.interviewcopilot.m09-export-journal+json"

export type ExportBoundary =
  | "intent-saved"
  | "staged"
  | "backup-renamed"
  | "destination-renamed"
  | "accepted"
  | "complete"

interface FileIdentity {
  readonly dev: number
  readonly ino: number
  readonly uid: number
  readonly mode: number
  readonly kind: "file" | "directory"
}

interface DirectoryIdentity extends FileIdentity {
  readonly path: string
  readonly kind: "directory"
}

export interface HistoryExportJournalV1 {
  readonly schemaVersion: 1
  readonly migration: typeof HISTORY_MIGRATION
  readonly operation: "export-history"
  readonly sessionId: string
  readonly format: "markdown" | "json"
  readonly requestedDestination: string
  readonly destination: string
  readonly staging: string
  readonly backup: string
  readonly ancestorChain: readonly DirectoryIdentity[]
  readonly expectedDestination?: FileIdentity
  readonly stagedIdentity?: FileIdentity
  readonly phase:
    | "intent"
    | "staged"
    | "backup-renamed"
    | "destination-renamed"
    | "accepted"
}

function safeAssetName(id: string): string {
  return `${createHash("sha256").update(id).digest("hex")}.png`
}

function identity(info: Awaited<ReturnType<typeof lstat>>): FileIdentity {
  if (!info.isFile() && !info.isDirectory()) {
    throw new Error("Export path must be a regular file or directory")
  }
  return {
    dev: Number(info.dev),
    ino: Number(info.ino),
    uid: Number(info.uid),
    mode: Number(info.mode),
    kind: info.isDirectory() ? "directory" : "file"
  }
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino &&
    left.uid === right.uid && left.mode === right.mode && left.kind === right.kind
}

async function optionalIdentity(target: string): Promise<FileIdentity | undefined> {
  const info = await lstat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (!info) return undefined
  if (info.isSymbolicLink()) throw new Error("Export path cannot be a symbolic link")
  return identity(info)
}

async function directoryChain(canonicalParent: string): Promise<readonly DirectoryIdentity[]> {
  const parsed = path.parse(canonicalParent)
  const relative = canonicalParent.slice(parsed.root.length)
  const segments = relative.split(path.sep).filter(Boolean)
  const targets = [parsed.root]
  for (const segment of segments) targets.push(path.join(targets.at(-1)!, segment))
  const result: DirectoryIdentity[] = []
  for (const target of targets) {
    const info = await lstat(target)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error("Canonical export ancestors must be regular directories")
    }
    result.push({ path: target, ...identity(info), kind: "directory" })
  }
  return result
}

async function assertAncestorChain(chain: readonly DirectoryIdentity[]): Promise<void> {
  for (const expected of chain) {
    const info = await lstat(expected.path)
    if (info.isSymbolicLink() || !info.isDirectory() || !sameIdentity(expected, identity(info))) {
      throw new Error("Export destination ancestor identity changed")
    }
  }
}

async function assertExpectedIdentity(
  target: string,
  expected: FileIdentity | undefined
): Promise<void> {
  const current = await optionalIdentity(target)
  if ((expected === undefined) !== (current === undefined) ||
      (expected && current && !sameIdentity(expected, current))) {
    throw new Error("Export destination identity changed")
  }
}

async function planDestination(destination: string): Promise<{
  destination: string
  ancestorChain: readonly DirectoryIdentity[]
  expectedDestination?: FileIdentity
}> {
  if (!path.isAbsolute(destination) || destination.includes("\0") ||
      path.normalize(destination) !== destination) {
    throw new Error("Export destination must be an explicit normalized absolute path")
  }
  const canonicalParent = path.dirname(destination)
  const ancestorChain = await directoryChain(canonicalParent)
  const parent = ancestorChain.at(-1)!
  if (typeof process.getuid === "function" && parent.uid !== process.getuid()) {
    throw new Error("Export destination parent is owned by another user")
  }
  const canonicalDestination = path.join(canonicalParent, path.basename(destination))
  return {
    destination: canonicalDestination,
    ancestorChain,
    expectedDestination: await optionalIdentity(canonicalDestination)
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

function screenshotBytes(archive: HistoryArchiveV1): readonly Buffer[] {
  const result: Buffer[] = []
  let total = 0
  try {
    for (const screenshot of archive.screenshots) {
      const separator = screenshot.dataUrl.indexOf(",")
      const bytes = Buffer.from(screenshot.dataUrl.slice(separator + 1), "base64")
      if (bytes.length === 0 || bytes.length > MAX_HISTORY_EXPORT_SCREENSHOT_BYTES) {
        bytes.fill(0)
        throw new Error("A screenshot exceeds the plaintext export bound")
      }
      total += bytes.length
      if (total > MAX_HISTORY_EXPORT_SCREENSHOT_TOTAL_BYTES) {
        bytes.fill(0)
        throw new Error("Screenshots exceed the total plaintext export bound")
      }
      result.push(bytes)
    }
    return result
  } catch (error) {
    for (const bytes of result) bytes.fill(0)
    throw error
  }
}

function exportProjection(archive: HistoryArchiveV1) {
  const template = archive.session.snapshot.template
  return {
    schemaVersion: 1 as const,
    migration: HISTORY_MIGRATION,
    recordType: "history-export" as const,
    session: {
      id: archive.sessionId,
      startedAt: archive.startedAt,
      sealedAt: archive.sealedAt,
      mode: archive.mode,
      provider: archive.provider,
      model: archive.model,
      responseMode: archive.responseMode,
      language: archive.language,
      context: archive.session.snapshot.context.map((item) => ({
        id: item.id,
        category: item.category,
        revision: item.revision,
        content: item.content
      })),
      promptTemplate: template ? {
        schemaVersion: template.schemaVersion,
        templateId: template.templateId,
        templateRevision: template.templateRevision,
        mode: template.mode,
        modeSchema: template.modeSchema,
        name: template.name,
        instructions: template.instructions,
        resolution: {
          schemaVersion: template.resolution.schemaVersion,
          mode: template.resolution.mode,
          resolvedAt: template.resolution.resolvedAt,
          decisions: template.resolution.decisions.map((decision) => ({
            topic: decision.topic,
            winnerId: decision.winnerId,
            winnerRevision: decision.winnerRevision,
            contenderIds: [...decision.contenderIds],
            factors: [...decision.factors]
          }))
        }
      } : undefined,
      transcript: archive.session.audio.segments.map((segment) => ({
        id: segment.id,
        source: segment.source,
        state: segment.state,
        text: segment.text,
        startedAt: segment.startedAt,
        finalizedAt: segment.finalizedAt,
        revision: segment.revision,
        speaker: {
          label: segment.speaker.label,
          certainty: segment.speaker.certainty,
          corrected: segment.speaker.corrected
        }
      })),
      pendingQuestion: archive.session.audio.pendingQuestion ? {
        id: archive.session.audio.pendingQuestion.id,
        text: archive.session.audio.pendingQuestion.text,
        segmentIds: [...archive.session.audio.pendingQuestion.segmentIds],
        detectedAt: archive.session.audio.pendingQuestion.detectedAt,
        revision: archive.session.audio.pendingQuestion.revision
      } : undefined,
      evidence: archive.session.artifacts
        .filter((artifact) => artifact.kind === "transcript")
        .map((artifact) => ({
          id: artifact.id,
          kind: artifact.kind,
          finalizedAt: artifact.finalizedAt,
          content: artifact.content,
          selected: artifact.selected,
          submitted: artifact.submitted,
          codingBranchId: artifact.codingBranchId
        })),
      sections: archive.session.sections.map((section) => ({
        id: section.id,
        order: section.order,
        body: section.body,
        state: section.state
      })),
      followUps: archive.session.compactExchanges.map((exchange) => ({
        id: exchange.id,
        prompt: exchange.prompt,
        answer: exchange.answer
      })),
      codingQuestions: archive.session.codingQuestions ? {
        currentBranchId: archive.session.codingQuestions.currentBranchId,
        chronology: [...archive.session.codingQuestions.chronology],
        branches: archive.session.codingQuestions.branches.map((branch) => ({
          id: branch.id,
          question: branch.question,
          startedAt: branch.startedAt,
          closedAt: branch.closedAt,
          sectionIds: [...branch.sectionIds],
          screenshotArtifactIds: [...branch.screenshotArtifactIds]
        }))
      } : undefined,
      screenshots: archive.screenshots.map((screenshot) => ({
        id: screenshot.id,
        contentType: screenshot.contentType,
        dataUrl: screenshot.dataUrl,
        asset: `assets/${safeAssetName(screenshot.id)}`
      }))
    }
  }
}

const SECRET_KEY =
  /api[-_]?key|token|credential|secret|password|passwd|authorization|cookie/i
const SECRET_SHAPE = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}={0,2}\b/i,
  /\b(?:sk|rk)-[A-Za-z0-9_-]{16,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|password|passwd|authorization)\b\s*[:=]\s*\S{8,}/i
] as const

function collectSensitiveValues(
  value: unknown,
  result = new Set<string>(),
  sensitive = false
): ReadonlySet<string> {
  if (typeof value === "string") {
    if (sensitive && value.length >= 4) result.add(value)
    return result
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSensitiveValues(item, result, sensitive)
    return result
  }
  if (!value || typeof value !== "object" || Buffer.isBuffer(value)) return result
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    collectSensitiveValues(child, result, sensitive || SECRET_KEY.test(key))
  }
  return result
}

function assertSecretFreeExport(projection: unknown, archive: HistoryArchiveV1): void {
  const sensitiveValues = collectSensitiveValues(archive)
  const inspect = (value: unknown): void => {
    if (typeof value === "string") {
      if (SECRET_SHAPE.some((pattern) => pattern.test(value)) ||
          [...sensitiveValues].some((secret) => value.includes(secret))) {
        throw new Error("Plaintext export contains a credential or secret value")
      }
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) inspect(item)
      return
    }
    if (!value || typeof value !== "object") return
    for (const child of Object.values(value as Record<string, unknown>)) inspect(child)
  }
  inspect(projection)
}

function markdown(archive: HistoryArchiveV1): string {
  const document = exportProjection(archive).session
  return [
    `# ${document.mode} interview`,
    `- Started: ${document.startedAt}`,
    `- Completed: ${document.sealedAt}`,
    `- Provider: ${document.provider}`,
    `- Model: ${document.model}`,
    "## Context",
    ...document.context.map((item) => `- **${item.category}:** ${item.content}`),
    "## Transcript",
    ...document.transcript.map((segment) => `- **${segment.speaker.label}:** ${segment.text}`),
    ...document.sections.map((section) => `## ${section.id}\n\n${section.body}`),
    ...document.followUps.map((exchange) =>
      `## Follow-up\n\n**Question:** ${exchange.prompt}\n\n${exchange.answer}`
    ),
    "## Screenshots",
    ...document.screenshots.map((screenshot) => `![Screenshot](${screenshot.asset})`),
    ""
  ].join("\n")
}

function validateJournal(value: unknown): HistoryExportJournalV1 {
  if (typeof value !== "object" || value === null) throw new Error("Export journal is malformed")
  const candidate = value as Partial<HistoryExportJournalV1>
  if (candidate.schemaVersion !== 1 || candidate.migration !== HISTORY_MIGRATION ||
      candidate.operation !== "export-history" || typeof candidate.destination !== "string" ||
      typeof candidate.staging !== "string" || typeof candidate.backup !== "string" ||
      !Array.isArray(candidate.ancestorChain) ||
      !["intent", "staged", "backup-renamed", "destination-renamed", "accepted"].includes(String(candidate.phase))) {
    throw new Error("Export journal is malformed")
  }
  return candidate as HistoryExportJournalV1
}

export class HistoryExportService {
  private tail = Promise.resolve()

  constructor(
    private readonly records: RecordRepository<HistoryExportJournalV1>,
    private readonly checkpoint?: (boundary: ExportBoundary) => void | Promise<void>,
    private readonly recoverOnError = true
  ) {}

  export(archive: HistoryArchiveV1, request: HistoryExportRequest): Promise<HistoryExportReceipt> {
    return this.exclusive(() => this.exportUnlocked(archive, request))
  }

  recover(): Promise<void> {
    return this.exclusive(() => this.recoverUnlocked())
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }

  private async persist(journal: HistoryExportJournalV1): Promise<void> {
    await this.records.put(EXPORT_JOURNAL_ID, journal, EXPORT_JOURNAL_TYPE)
  }

  private async recoverUnlocked(): Promise<void> {
    const value = await this.records.get(EXPORT_JOURNAL_ID, EXPORT_JOURNAL_TYPE)
    if (!value) return
    const journal = validateJournal(value)
    await assertAncestorChain(journal.ancestorChain)
    const backupIdentity = await optionalIdentity(journal.backup)
    const destinationIdentity = await optionalIdentity(journal.destination)
    if (journal.phase === "accepted") {
      if (!journal.stagedIdentity || !destinationIdentity ||
          !sameIdentity(journal.stagedIdentity, destinationIdentity)) {
        throw new Error("Accepted export identity is not recoverable")
      }
      if (backupIdentity) {
        if (!journal.expectedDestination || !sameIdentity(journal.expectedDestination, backupIdentity)) {
          throw new Error("Export backup identity changed")
        }
        await rm(journal.backup, { recursive: true })
      }
      await rm(journal.staging, { recursive: true, force: true })
      await this.records.remove(EXPORT_JOURNAL_ID)
      return
    }
    if (destinationIdentity && journal.stagedIdentity &&
        sameIdentity(destinationIdentity, journal.stagedIdentity)) {
      await rm(journal.destination, { recursive: true })
    } else if (journal.phase === "backup-renamed" ||
               journal.phase === "destination-renamed") {
      if (destinationIdentity) throw new Error("Export destination ownership changed during recovery")
    }
    if (backupIdentity) {
      if (!journal.expectedDestination || !sameIdentity(journal.expectedDestination, backupIdentity)) {
        throw new Error("Export backup identity changed")
      }
      await rename(journal.backup, journal.destination)
    } else if (journal.expectedDestination &&
               (journal.phase === "backup-renamed" || journal.phase === "destination-renamed")) {
      throw new Error("Export backup is missing")
    }
    await rm(journal.staging, { recursive: true, force: true })
    await syncDirectory(path.dirname(journal.destination))
    await this.records.remove(EXPORT_JOURNAL_ID)
  }

  private async exportUnlocked(
    archive: HistoryArchiveV1,
    request: HistoryExportRequest
  ): Promise<HistoryExportReceipt> {
    if (request.sessionId !== archive.sessionId || request.disclosureAccepted !== true ||
        !["json", "markdown"].includes(request.format)) {
      throw new Error("Plaintext export requires explicit disclosure and one session")
    }
    await this.recoverUnlocked()
    const plan = await planDestination(request.destination)
    if (plan.expectedDestination && !request.overwriteConfirmed) {
      throw new Error("Export destination already exists; overwrite is not confirmed")
    }
    const projection = exportProjection(archive)
    assertSecretFreeExport(projection, archive)
    const token = randomBytes(16).toString("hex")
    const staging = path.join(path.dirname(plan.destination), `.${path.basename(plan.destination)}.partial-${token}`)
    const backup = `${staging}.backup`
    let journal: HistoryExportJournalV1 = {
      schemaVersion: 1,
      migration: HISTORY_MIGRATION,
      operation: "export-history",
      sessionId: archive.sessionId,
      format: request.format,
      requestedDestination: request.destination,
      destination: plan.destination,
      staging,
      backup,
      ancestorChain: plan.ancestorChain,
      expectedDestination: plan.expectedDestination,
      phase: "intent"
    }
    const buffers = screenshotBytes(archive)
    try {
      await this.persist(journal)
      await this.checkpoint?.("intent-saved")
      const files: string[] = []
      if (request.format === "json") {
        await writeFileSynced(staging, `${JSON.stringify(projection, null, 2)}\n`)
        files.push(path.basename(request.destination))
      } else {
        await mkdir(staging, { mode: 0o700 })
        await writeFileSynced(path.join(staging, "session.md"), markdown(archive))
        files.push("session.md")
        if (buffers.length > 0) {
          const assets = path.join(staging, "assets")
          await mkdir(assets, { mode: 0o700 })
          for (const [index, screenshot] of archive.screenshots.entries()) {
            const name = safeAssetName(screenshot.id)
            await writeFileSynced(path.join(assets, name), buffers[index])
            files.push(`assets/${name}`)
          }
          await syncDirectory(assets)
        }
        await syncDirectory(staging)
      }
      journal = { ...journal, stagedIdentity: await optionalIdentity(staging), phase: "staged" }
      await this.persist(journal)
      await this.checkpoint?.("staged")
      await assertAncestorChain(journal.ancestorChain)
      await assertExpectedIdentity(journal.destination, journal.expectedDestination)
      if (journal.expectedDestination) {
        await rename(journal.destination, journal.backup)
        await syncDirectory(path.dirname(journal.destination))
      }
      journal = { ...journal, phase: "backup-renamed" }
      await this.persist(journal)
      await this.checkpoint?.("backup-renamed")
      await assertAncestorChain(journal.ancestorChain)
      await assertExpectedIdentity(journal.destination, undefined)
      await rename(journal.staging, journal.destination)
      await syncDirectory(path.dirname(journal.destination))
      await assertExpectedIdentity(journal.destination, journal.stagedIdentity)
      journal = { ...journal, phase: "destination-renamed" }
      await this.persist(journal)
      await this.checkpoint?.("destination-renamed")
      await assertAncestorChain(journal.ancestorChain)
      await assertExpectedIdentity(journal.destination, journal.stagedIdentity)
      journal = { ...journal, phase: "accepted" }
      await this.persist(journal)
      await this.checkpoint?.("accepted")
      if (journal.expectedDestination) await rm(journal.backup, { recursive: true })
      await this.records.remove(EXPORT_JOURNAL_ID)
      await syncDirectory(path.dirname(journal.destination))
      await this.checkpoint?.("complete")
      return {
        schemaVersion: 1,
        sessionId: archive.sessionId,
        format: request.format,
        destination: request.destination,
        files
      }
    } catch (error) {
      if (this.recoverOnError) await this.recoverUnlocked()
      throw error
    } finally {
      for (const bytes of buffers) bytes.fill(0)
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
