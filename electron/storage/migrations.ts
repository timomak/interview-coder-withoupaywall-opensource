import { createHash, timingSafeEqual } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
} from "node:fs/promises";
import path from "node:path";
import {
  decryptEnvelope,
  encryptEnvelope,
  parseEnvelope,
  serializeEnvelope,
} from "./envelope";
import { StorageError, asStorageError } from "./errors";
import {
  AtomicFileWriter,
  DIRECTORY_MODE,
  FILE_MODE,
  opaqueFileName,
  StoragePaths,
} from "./paths";
import {
  bestEffortSecureDelete,
  BlobDescriptor,
  BlobRepository,
  InstallationKeyProvider,
  RecordRepository,
} from "./repositories";

export type MigrationId = "M-02" | "M-03";
export type MigrationStage =
  | "pending"
  | "target-write-intent"
  | "encrypted"
  | "verified"
  | "quarantine-intent"
  | "quarantined"
  | "delete-intent"
  | "complete"
  | "rollback-restore-intent"
  | "rollback-delete-intent"
  | "rolled-back";

export type MigrationBoundary =
  | MigrationStage
  | "before-journal-write"
  | "after-journal-write"
  | "before-target-write"
  | "after-target-write"
  | "before-quarantine-rename"
  | "after-quarantine-rename"
  | "before-quarantine-delete"
  | "after-quarantine-delete"
  | "before-restore-rename"
  | "after-restore-rename"
  | "before-target-delete"
  | "after-target-delete";

interface JournalEntry {
  readonly source: string;
  readonly targetId: string;
  readonly contentType: string;
  sourceSha256?: string;
  stage: MigrationStage;
}

interface MigrationJournal {
  readonly migration: MigrationId;
  readonly version: 1;
  readonly entries: JournalEntry[];
}

export type MigrationCheckpoint = (
  migration: MigrationId,
  source: string,
  boundary: MigrationBoundary,
) => void | Promise<void>;

const MIGRATION_STAGES = new Set<MigrationStage>([
  "pending",
  "target-write-intent",
  "encrypted",
  "verified",
  "quarantine-intent",
  "quarantined",
  "delete-intent",
  "complete",
  "rollback-restore-intent",
  "rollback-delete-intent",
  "rolled-back",
]);

class EncryptedMigrationJournal {
  constructor(
    private readonly migration: MigrationId,
    private readonly paths: StoragePaths,
    private readonly keys: InstallationKeyProvider,
    private readonly writer: AtomicFileWriter,
  ) {}

  private get relativePath(): string {
    return path.join("migrations", `${this.migration.toLocaleLowerCase("en-US")}.enc`);
  }

  async load(): Promise<MigrationJournal | undefined> {
    let bytes: Buffer;
    try {
      bytes = await readFile(await this.paths.checkedFile(this.relativePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    const key = await this.keys.get();
    let plaintext: Buffer | undefined;
    try {
      plaintext = decryptEnvelope(key, parseEnvelope(bytes), {
        kind: "journal",
        id: this.migration,
        contentType: "application/x-interview-copilot-migration-journal+json",
      });
      const journal = JSON.parse(plaintext.toString("utf8")) as MigrationJournal;
      if (
        journal.migration !== this.migration ||
        journal.version !== 1 ||
        !Array.isArray(journal.entries) ||
        journal.entries.some(
          (entry) =>
            typeof entry.source !== "string" ||
            typeof entry.targetId !== "string" ||
            typeof entry.contentType !== "string" ||
            !MIGRATION_STAGES.has(entry.stage),
        )
      ) {
        throw new StorageError("MIGRATION_FAILED", "Invalid encrypted migration journal.", {
          recovery: "inspect-migration",
        });
      }
      return journal;
    } finally {
      bytes.fill(0);
      plaintext?.fill(0);
      key.fill(0);
    }
  }

  async save(journal: MigrationJournal): Promise<void> {
    const plaintext = Buffer.from(JSON.stringify(journal), "utf8");
    const key = await this.keys.get();
    let serialized: Buffer | undefined;
    try {
      serialized = serializeEnvelope(
        encryptEnvelope(
          key,
          {
            kind: "journal",
            id: this.migration,
            contentType: "application/x-interview-copilot-migration-journal+json",
          },
          plaintext,
        ),
      );
      await this.writer.write(this.relativePath, serialized);
    } finally {
      plaintext.fill(0);
      serialized?.fill(0);
      key.fill(0);
    }
  }
}

async function legacyTarget(root: string, relativePath: string): Promise<string> {
  if (
    path.isAbsolute(relativePath) ||
    path.normalize(relativePath) !== relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`)
  ) {
    throw new StorageError("PATH_OUTSIDE_ROOT", "Legacy migration path escapes its root.");
  }
  const canonicalRoot = await realpath(root);
  const target = path.resolve(canonicalRoot, relativePath);
  const relative = path.relative(canonicalRoot, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new StorageError("PATH_OUTSIDE_ROOT", "Legacy migration path escapes its root.");
  }
  return target;
}

async function canonicalLegacyFile(root: string, relativePath: string): Promise<string> {
  const target = await legacyTarget(root, relativePath);
  const canonicalRoot = await realpath(root);
  let current = canonicalRoot;
  for (const segment of relativePath.split(path.sep)) {
    current = path.join(current, segment);
    const info = await lstat(current);
    if (info.isSymbolicLink()) {
      throw new StorageError(
        "PATH_SYMLINK_REJECTED",
        "Legacy migration refuses symbolic links.",
      );
    }
  }
  return target;
}

async function exists(target: string): Promise<boolean> {
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new StorageError(
        "PATH_SYMLINK_REJECTED",
        "Migration boundary must remain a regular file.",
      );
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function hashMatches(bytes: Buffer, expected: string): boolean {
  const actual = Buffer.from(sha256(bytes), "hex");
  const wanted = Buffer.from(expected, "hex");
  try {
    return actual.length === wanted.length && timingSafeEqual(actual, wanted);
  } finally {
    actual.fill(0);
    wanted.fill(0);
  }
}

abstract class JournaledMigration {
  protected constructor(
    protected readonly migration: MigrationId,
    protected readonly journal: EncryptedMigrationJournal,
    protected readonly checkpoint?: MigrationCheckpoint,
  ) {}

  protected async save(
    journal: MigrationJournal,
    source: string,
    stage?: MigrationStage,
  ): Promise<void> {
    await this.checkpoint?.(this.migration, source, "before-journal-write");
    await this.journal.save(journal);
    await this.checkpoint?.(this.migration, source, "after-journal-write");
    if (stage) await this.checkpoint?.(this.migration, source, stage);
  }

  protected async transition(
    entry: JournalEntry,
    stage: MigrationStage,
    journal: MigrationJournal,
  ): Promise<void> {
    entry.stage = stage;
    await this.save(journal, entry.source, stage);
  }

  protected boundary(source: string, boundary: MigrationBoundary): Promise<void> {
    return Promise.resolve(this.checkpoint?.(this.migration, source, boundary));
  }
}

export interface LegacyArtifact {
  readonly relativePath: string;
  readonly id: string;
  readonly contentType: string;
  readonly retentionClass?: BlobDescriptor["retentionClass"];
}

/**
 * M-02 moves legacy plaintext screenshot/temp/cache artifacts to authenticated
 * blobs. Every destructive boundary is preceded by an encrypted intent, and
 * replay reconciles source/quarantine/target presence before continuing.
 */
export class PlaintextArtifactMigration extends JournaledMigration {
  private readonly encryptedJournal: EncryptedMigrationJournal;

  constructor(
    private readonly legacyRoot: string,
    private readonly paths: StoragePaths,
    keys: InstallationKeyProvider,
    private readonly blobs: BlobRepository,
    writer: AtomicFileWriter = new AtomicFileWriter(paths),
    checkpoint?: MigrationCheckpoint,
  ) {
    const journal = new EncryptedMigrationJournal("M-02", paths, keys, writer);
    super("M-02", journal, checkpoint);
    this.encryptedJournal = journal;
  }

  async run(artifacts: readonly LegacyArtifact[]): Promise<MigrationJournal> {
    await this.paths.directory(path.join("migrations", "rollback", "m-02"));
    let journal = await this.encryptedJournal.load();
    if (!journal) {
      journal = {
        migration: "M-02",
        version: 1,
        entries: artifacts.map((artifact) => ({
          source: artifact.relativePath,
          targetId: artifact.id,
          contentType: artifact.contentType,
          stage: "pending",
        })),
      };
      await this.save(journal, "*");
    } else {
      this.assertInputs(journal, artifacts);
    }
    for (let index = 0; index < journal.entries.length; index += 1) {
      const entry = journal.entries[index];
      const artifact = artifacts[index];
      if (
        artifact.retentionClass === "raw-audio" ||
        artifact.contentType.toLocaleLowerCase("en-US").startsWith("audio/")
      ) {
        throw new StorageError("RAW_AUDIO_REJECTED", "M-02 refuses to migrate raw audio.");
      }
      if (
        entry.stage === "rollback-restore-intent" ||
        entry.stage === "rollback-delete-intent"
      ) {
        await this.rollbackEntry(entry, artifact, journal);
      } else if (entry.stage !== "complete" && entry.stage !== "rolled-back") {
        await this.advance(entry, artifact, journal);
      }
    }
    return journal;
  }

  async rollback(): Promise<void> {
    const journal = await this.encryptedJournal.load();
    if (!journal) return;
    if (journal.entries.some((entry) => entry.stage === "complete")) {
      throw new StorageError(
        "MIGRATION_ROLLBACK_UNAVAILABLE",
        "M-02 rollback quarantine has already been securely deleted.",
        { recovery: "inspect-migration" },
      );
    }
    for (let index = journal.entries.length - 1; index >= 0; index -= 1) {
      const entry = journal.entries[index];
      if (entry.stage === "rolled-back") continue;
      const artifact: LegacyArtifact = {
        relativePath: entry.source,
        id: entry.targetId,
        contentType: entry.contentType,
      };
      await this.rollbackEntry(entry, artifact, journal);
    }
  }

  private assertInputs(
    journal: MigrationJournal,
    artifacts: readonly LegacyArtifact[],
  ): void {
    const requested = artifacts.map((item) => [
      item.relativePath,
      item.id,
      item.contentType,
    ]);
    const recorded = journal.entries.map((item) => [
      item.source,
      item.targetId,
      item.contentType,
    ]);
    if (JSON.stringify(requested) !== JSON.stringify(recorded)) {
      throw new StorageError(
        "MIGRATION_FAILED",
        "M-02 replay input differs from the encrypted journal.",
        { recovery: "inspect-migration" },
      );
    }
  }

  private async advance(
    entry: JournalEntry,
    artifact: LegacyArtifact,
    journal: MigrationJournal,
  ): Promise<void> {
    try {
      if (entry.stage === "pending") {
        const source = await canonicalLegacyFile(this.legacyRoot, entry.source);
        const plaintext = await readFile(source);
        try {
          entry.sourceSha256 = sha256(plaintext);
        } finally {
          plaintext.fill(0);
        }
        await this.transition(entry, "target-write-intent", journal);
      }
      if (entry.stage === "target-write-intent") {
        const source = await canonicalLegacyFile(this.legacyRoot, entry.source);
        const plaintext = await readFile(source);
        let reopened: Buffer | undefined;
        try {
          if (!entry.sourceSha256 || !hashMatches(plaintext, entry.sourceSha256)) {
            throw new StorageError(
              "MIGRATION_FAILED",
              "M-02 source changed before encrypted target reconciliation.",
              { recovery: "inspect-migration" },
            );
          }
          reopened = await this.blobs.get(artifact);
          if (!entry.sourceSha256 || !reopened || !hashMatches(reopened, entry.sourceSha256)) {
            await this.boundary(entry.source, "before-target-write");
            await this.blobs.put(artifact, plaintext);
            await this.boundary(entry.source, "after-target-write");
          }
        } finally {
          plaintext.fill(0);
          reopened?.fill(0);
        }
        await this.transition(entry, "encrypted", journal);
      }
      if (entry.stage === "encrypted") {
        await this.verifyPair(entry, artifact, false);
        await this.transition(entry, "verified", journal);
      }
      if (entry.stage === "verified") {
        await this.transition(entry, "quarantine-intent", journal);
      }
      if (entry.stage === "quarantine-intent") {
        await this.reconcileQuarantine(entry);
        await this.transition(entry, "quarantined", journal);
      }
      if (entry.stage === "quarantined") {
        await this.verifyPair(entry, artifact, true);
        await this.transition(entry, "delete-intent", journal);
      }
      if (entry.stage === "delete-intent") {
        const quarantine = this.quarantinePath(entry);
        if (await exists(quarantine)) {
          await this.verifyPair(entry, artifact, true);
          await this.boundary(entry.source, "before-quarantine-delete");
          await bestEffortSecureDelete(quarantine);
          await this.boundary(entry.source, "after-quarantine-delete");
        } else {
          await this.verifyTarget(entry, artifact);
        }
        await this.transition(entry, "complete", journal);
      }
    } catch (error) {
      throw asStorageError(
        error,
        "MIGRATION_FAILED",
        `M-02 stopped safely at ${entry.stage}; replay will reconcile file presence.`,
        "inspect-migration",
      );
    }
  }

  private async rollbackEntry(
    entry: JournalEntry,
    artifact: LegacyArtifact,
    journal: MigrationJournal,
  ): Promise<void> {
    if (!entry.sourceSha256) {
      const source = await canonicalLegacyFile(this.legacyRoot, entry.source);
      const bytes = await readFile(source);
      try {
        entry.sourceSha256 = sha256(bytes);
      } finally {
        bytes.fill(0);
      }
      await this.save(journal, entry.source);
    }
    if (entry.stage !== "rollback-restore-intent" &&
        entry.stage !== "rollback-delete-intent") {
      await this.transition(entry, "rollback-restore-intent", journal);
    }
    const source = await legacyTarget(this.legacyRoot, entry.source);
    const quarantine = this.quarantinePath(entry);
    if (entry.stage === "rollback-restore-intent") {
      const sourceExists = await exists(source);
      const quarantineExists = await exists(quarantine);
      if (!sourceExists && quarantineExists) {
        await mkdir(path.dirname(source), { recursive: true, mode: DIRECTORY_MODE });
        await this.boundary(entry.source, "before-restore-rename");
        await rename(quarantine, source);
        await this.boundary(entry.source, "after-restore-rename");
        await chmod(source, FILE_MODE);
      } else if (!sourceExists) {
        throw new StorageError(
          "MIGRATION_FAILED",
          "M-02 rollback has no prior copy to restore.",
          { recovery: "inspect-migration" },
        );
      } else if (quarantineExists) {
        throw new StorageError(
          "MIGRATION_FAILED",
          "M-02 rollback found ambiguous prior copies.",
          { recovery: "inspect-migration" },
        );
      }
      await this.verifySource(entry);
      await this.transition(entry, "rollback-delete-intent", journal);
    }
    await this.verifySource(entry);
    await this.boundary(entry.source, "before-target-delete");
    await this.blobs.remove(artifact.id);
    await this.boundary(entry.source, "after-target-delete");
    await this.transition(entry, "rolled-back", journal);
  }

  private async reconcileQuarantine(entry: JournalEntry): Promise<void> {
    const source = await legacyTarget(this.legacyRoot, entry.source);
    const quarantine = this.quarantinePath(entry);
    const sourceExists = await exists(source);
    const quarantineExists = await exists(quarantine);
    if (sourceExists && !quarantineExists) {
      await this.verifySource(entry);
      await this.boundary(entry.source, "before-quarantine-rename");
      await rename(source, quarantine);
      await this.boundary(entry.source, "after-quarantine-rename");
      await chmod(quarantine, FILE_MODE);
      return;
    }
    if (!sourceExists && quarantineExists) return;
    throw new StorageError(
      "MIGRATION_FAILED",
      "M-02 quarantine intent found ambiguous file presence.",
      { recovery: "inspect-migration" },
    );
  }

  private async verifySource(entry: JournalEntry): Promise<void> {
    const source = await canonicalLegacyFile(this.legacyRoot, entry.source);
    const bytes = await readFile(source);
    try {
      if (!entry.sourceSha256 || !hashMatches(bytes, entry.sourceSha256)) {
        throw new StorageError(
          "MIGRATION_FAILED",
          "M-02 restored source failed verification.",
          { recovery: "inspect-migration" },
        );
      }
    } finally {
      bytes.fill(0);
    }
  }

  private async verifyTarget(
    entry: JournalEntry,
    artifact: LegacyArtifact,
  ): Promise<void> {
    const reopened = await this.blobs.get(artifact);
    try {
      if (!reopened || !entry.sourceSha256 || !hashMatches(reopened, entry.sourceSha256)) {
        throw new StorageError(
          "MIGRATION_FAILED",
          "M-02 encrypted target failed verification.",
          { recovery: "inspect-migration" },
        );
      }
    } finally {
      reopened?.fill(0);
    }
  }

  private async verifyPair(
    entry: JournalEntry,
    artifact: LegacyArtifact,
    quarantined: boolean,
  ): Promise<void> {
    const source = quarantined
      ? this.quarantinePath(entry)
      : await canonicalLegacyFile(this.legacyRoot, entry.source);
    const plaintext = await readFile(source);
    try {
      if (!entry.sourceSha256 || !hashMatches(plaintext, entry.sourceSha256)) {
        throw new StorageError(
          "MIGRATION_FAILED",
          "M-02 prior copy changed during migration.",
          { recovery: "inspect-migration" },
        );
      }
      await this.verifyTarget(entry, artifact);
    } finally {
      plaintext.fill(0);
    }
  }

  private quarantinePath(entry: JournalEntry): string {
    return this.paths.resolve(
      path.join(
        "migrations",
        "rollback",
        "m-02",
        opaqueFileName(
          "blob",
          `${encodeURIComponent(entry.source)}:${entry.targetId}`,
        ).replace(/\.enc$/, ".rollback"),
      ),
    );
  }
}

export interface LegacyEnvelopeV0<T extends object> {
  readonly relativePath: string;
  readonly id: string;
  readonly recordType: string;
  readonly decrypt: (encryptedV0: Buffer) => Promise<T>;
}

/**
 * M-03 upgrades authenticated legacy envelopes to schema v1 using the same
 * write-ahead intent and presence-reconciliation rules as M-02.
 */
export class EnvelopeSchemaV1Migration<T extends object> extends JournaledMigration {
  private readonly encryptedJournal: EncryptedMigrationJournal;
  private readonly adapters = new Map<string, LegacyEnvelopeV0<T>>();

  constructor(
    private readonly legacyRoot: string,
    private readonly paths: StoragePaths,
    keys: InstallationKeyProvider,
    private readonly records: RecordRepository<T>,
    writer: AtomicFileWriter = new AtomicFileWriter(paths),
    checkpoint?: MigrationCheckpoint,
  ) {
    const journal = new EncryptedMigrationJournal("M-03", paths, keys, writer);
    super("M-03", journal, checkpoint);
    this.encryptedJournal = journal;
  }

  async run(items: readonly LegacyEnvelopeV0<T>[]): Promise<void> {
    for (const item of items) this.adapters.set(item.id, item);
    await this.paths.directory(path.join("migrations", "rollback", "m-03"));
    let journal = await this.encryptedJournal.load();
    if (!journal) {
      journal = {
        migration: "M-03",
        version: 1,
        entries: items.map((item) => ({
          source: item.relativePath,
          targetId: item.id,
          contentType: item.recordType,
          stage: "pending",
        })),
      };
      await this.save(journal, "*");
    }
    this.assertInputs(journal, items);
    for (let index = 0; index < items.length; index += 1) {
      const entry = journal.entries[index];
      const item = items[index];
      if (
        entry.stage === "rollback-restore-intent" ||
        entry.stage === "rollback-delete-intent"
      ) {
        await this.rollbackEntry(entry, item, journal);
      } else if (entry.stage !== "complete" && entry.stage !== "rolled-back") {
        await this.advance(entry, item, journal);
      }
    }
  }

  async rollback(items: readonly LegacyEnvelopeV0<T>[] = []): Promise<void> {
    for (const item of items) this.adapters.set(item.id, item);
    const journal = await this.encryptedJournal.load();
    if (!journal) return;
    if (journal.entries.some((entry) => entry.stage === "complete")) {
      throw new StorageError(
        "MIGRATION_ROLLBACK_UNAVAILABLE",
        "M-03 rollback quarantine has already been securely deleted.",
        { recovery: "inspect-migration" },
      );
    }
    for (const entry of [...journal.entries].reverse()) {
      if (entry.stage === "rolled-back") continue;
      const item = this.adapters.get(entry.targetId);
      if (!item) {
        throw new StorageError(
          "MIGRATION_FAILED",
          "M-03 rollback replay requires the authenticated legacy adapter.",
          { recovery: "inspect-migration" },
        );
      }
      await this.rollbackEntry(entry, item, journal);
    }
  }

  private assertInputs(
    journal: MigrationJournal,
    items: readonly LegacyEnvelopeV0<T>[],
  ): void {
    if (
      journal.entries.length !== items.length ||
      journal.entries.some(
        (entry, index) =>
          entry.source !== items[index]?.relativePath ||
          entry.targetId !== items[index]?.id ||
          entry.contentType !== items[index]?.recordType,
      )
    ) {
      throw new StorageError("MIGRATION_FAILED", "M-03 replay input changed.", {
        recovery: "inspect-migration",
      });
    }
  }

  private async advance(
    entry: JournalEntry,
    item: LegacyEnvelopeV0<T>,
    journal: MigrationJournal,
  ): Promise<void> {
    try {
      if (entry.stage === "pending") {
        const source = await canonicalLegacyFile(this.legacyRoot, entry.source);
        const encryptedV0 = await readFile(source);
        try {
          entry.sourceSha256 = sha256(encryptedV0);
        } finally {
          encryptedV0.fill(0);
        }
        await this.transition(entry, "target-write-intent", journal);
      }
      if (entry.stage === "target-write-intent") {
        const value = await this.readLegacyValue(entry, item, false);
        const reopened = await this.records.get(item.id, item.recordType);
        if (JSON.stringify(reopened) !== JSON.stringify(value)) {
          await this.boundary(entry.source, "before-target-write");
          await this.records.put(item.id, value, item.recordType);
          await this.boundary(entry.source, "after-target-write");
        }
        await this.verifyRecord(item, value);
        await this.transition(entry, "verified", journal);
      }
      if (entry.stage === "verified") {
        await this.transition(entry, "quarantine-intent", journal);
      }
      if (entry.stage === "quarantine-intent") {
        await this.reconcileQuarantine(entry, item);
        await this.transition(entry, "quarantined", journal);
      }
      if (entry.stage === "quarantined") {
        const value = await this.readLegacyValue(entry, item, true);
        await this.verifyRecord(item, value);
        await this.transition(entry, "delete-intent", journal);
      }
      if (entry.stage === "delete-intent") {
        const quarantine = this.quarantinePath(entry);
        if (await exists(quarantine)) {
          const value = await this.readLegacyValue(entry, item, true);
          await this.verifyRecord(item, value);
          await this.boundary(entry.source, "before-quarantine-delete");
          await bestEffortSecureDelete(quarantine);
          await this.boundary(entry.source, "after-quarantine-delete");
        } else {
          const reopened = await this.records.get(item.id, item.recordType);
          if (reopened === undefined) {
            throw new StorageError(
              "MIGRATION_FAILED",
              "M-03 target disappeared after quarantine deletion.",
              { recovery: "inspect-migration" },
            );
          }
        }
        await this.transition(entry, "complete", journal);
      }
    } catch (error) {
      throw asStorageError(
        error,
        "MIGRATION_FAILED",
        `M-03 stopped safely at ${entry.stage}; replay will reconcile file presence.`,
        "inspect-migration",
      );
    }
  }

  private async rollbackEntry(
    entry: JournalEntry,
    item: LegacyEnvelopeV0<T>,
    journal: MigrationJournal,
  ): Promise<void> {
    if (!entry.sourceSha256) {
      const source = await canonicalLegacyFile(this.legacyRoot, entry.source);
      const bytes = await readFile(source);
      try {
        entry.sourceSha256 = sha256(bytes);
      } finally {
        bytes.fill(0);
      }
      await this.save(journal, entry.source);
    }
    if (entry.stage !== "rollback-restore-intent" &&
        entry.stage !== "rollback-delete-intent") {
      await this.transition(entry, "rollback-restore-intent", journal);
    }
    const source = await legacyTarget(this.legacyRoot, entry.source);
    const quarantine = this.quarantinePath(entry);
    if (entry.stage === "rollback-restore-intent") {
      const sourceExists = await exists(source);
      const quarantineExists = await exists(quarantine);
      if (!sourceExists && quarantineExists) {
        await mkdir(path.dirname(source), { recursive: true, mode: DIRECTORY_MODE });
        await this.boundary(entry.source, "before-restore-rename");
        await rename(quarantine, source);
        await this.boundary(entry.source, "after-restore-rename");
        await chmod(source, FILE_MODE);
      } else if (!sourceExists) {
        throw new StorageError(
          "MIGRATION_FAILED",
          "M-03 rollback has no prior copy to restore.",
          { recovery: "inspect-migration" },
        );
      } else if (quarantineExists) {
        throw new StorageError(
          "MIGRATION_FAILED",
          "M-03 rollback found ambiguous prior copies.",
          { recovery: "inspect-migration" },
        );
      }
      await this.readLegacyValue(entry, item, false);
      await this.transition(entry, "rollback-delete-intent", journal);
    }
    await this.readLegacyValue(entry, item, false);
    await this.boundary(entry.source, "before-target-delete");
    await this.records.remove(item.id);
    await this.boundary(entry.source, "after-target-delete");
    await this.transition(entry, "rolled-back", journal);
  }

  private async reconcileQuarantine(
    entry: JournalEntry,
    item: LegacyEnvelopeV0<T>,
  ): Promise<void> {
    const source = await legacyTarget(this.legacyRoot, entry.source);
    const quarantine = this.quarantinePath(entry);
    const sourceExists = await exists(source);
    const quarantineExists = await exists(quarantine);
    if (sourceExists && !quarantineExists) {
      const value = await this.readLegacyValue(entry, item, false);
      await this.verifyRecord(item, value);
      await this.boundary(entry.source, "before-quarantine-rename");
      await rename(source, quarantine);
      await this.boundary(entry.source, "after-quarantine-rename");
      await chmod(quarantine, FILE_MODE);
      return;
    }
    if (!sourceExists && quarantineExists) return;
    throw new StorageError(
      "MIGRATION_FAILED",
      "M-03 quarantine intent found ambiguous file presence.",
      { recovery: "inspect-migration" },
    );
  }

  private async readLegacyValue(
    entry: JournalEntry,
    item: LegacyEnvelopeV0<T>,
    quarantined: boolean,
  ): Promise<T> {
    const source = quarantined
      ? this.quarantinePath(entry)
      : await canonicalLegacyFile(this.legacyRoot, entry.source);
    const bytes = await readFile(source);
    try {
      if (!entry.sourceSha256 || !hashMatches(bytes, entry.sourceSha256)) {
        throw new StorageError(
          "MIGRATION_FAILED",
          "M-03 prior copy failed authenticated hash verification.",
          { recovery: "inspect-migration" },
        );
      }
      return await item.decrypt(bytes);
    } finally {
      bytes.fill(0);
    }
  }

  private async verifyRecord(item: LegacyEnvelopeV0<T>, value: T): Promise<void> {
    const reopened = await this.records.get(item.id, item.recordType);
    if (JSON.stringify(reopened) !== JSON.stringify(value)) {
      throw new StorageError(
        "MIGRATION_FAILED",
        "M-03 v1 reopen verification failed.",
        { recovery: "inspect-migration" },
      );
    }
  }

  private quarantinePath(entry: JournalEntry): string {
    return this.paths.resolve(
      path.join(
        "migrations",
        "rollback",
        "m-03",
        opaqueFileName(
          "record",
          `${encodeURIComponent(entry.source)}:${entry.targetId}`,
        ).replace(/\.enc$/, ".rollback"),
      ),
    );
  }
}
