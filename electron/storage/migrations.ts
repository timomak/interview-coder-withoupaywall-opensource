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
  | "encrypted"
  | "verified"
  | "quarantined"
  | "complete"
  | "rolled-back";

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
  stage: MigrationStage,
) => void | Promise<void>;

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
        !Array.isArray(journal.entries)
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

async function canonicalLegacyFile(root: string, relativePath: string): Promise<string> {
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
  if (
    path.relative(canonicalRoot, target) === ".." ||
    path.relative(canonicalRoot, target).startsWith(`..${path.sep}`)
  ) {
    throw new StorageError("PATH_OUTSIDE_ROOT", "Legacy migration path escapes its root.");
  }
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

export interface LegacyArtifact {
  readonly relativePath: string;
  readonly id: string;
  readonly contentType: string;
  readonly retentionClass?: BlobDescriptor["retentionClass"];
}

/**
 * M-02 moves legacy plaintext screenshot/temp/cache artifacts to authenticated
 * blobs. The only plaintext move is rename into rollback quarantine; no new
 * plaintext copy is created.
 */
export class PlaintextArtifactMigration {
  private readonly journal: EncryptedMigrationJournal;

  constructor(
    private readonly legacyRoot: string,
    private readonly paths: StoragePaths,
    private readonly keys: InstallationKeyProvider,
    private readonly blobs: BlobRepository,
    writer: AtomicFileWriter = new AtomicFileWriter(paths),
    private readonly checkpoint?: MigrationCheckpoint,
  ) {
    this.journal = new EncryptedMigrationJournal("M-02", paths, keys, writer);
  }

  async run(artifacts: readonly LegacyArtifact[]): Promise<MigrationJournal> {
    await this.paths.directory(path.join("migrations", "rollback", "m-02"));
    let journal = await this.journal.load();
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
      await this.journal.save(journal);
    } else {
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

    for (let index = 0; index < journal.entries.length; index += 1) {
      const entry = journal.entries[index];
      const artifact = artifacts[index];
      if (artifact.retentionClass === "raw-audio" ||
          artifact.contentType.toLocaleLowerCase("en-US").startsWith("audio/")) {
        throw new StorageError(
          "RAW_AUDIO_REJECTED",
          "M-02 refuses to migrate raw audio.",
        );
      }
      await this.advance(entry, artifact, journal);
    }
    return journal;
  }

  async rollback(): Promise<void> {
    const journal = await this.journal.load();
    if (!journal) return;
    if (journal.entries.some((entry) => entry.stage === "complete")) {
      throw new StorageError(
        "MIGRATION_ROLLBACK_UNAVAILABLE",
        "M-02 rollback quarantine has already been securely deleted.",
        { recovery: "inspect-migration" },
      );
    }
    for (const entry of [...journal.entries].reverse()) {
      if (entry.stage === "quarantined") {
        const quarantine = this.quarantinePath(entry);
        const source = path.resolve(this.legacyRoot, entry.source);
        await mkdir(path.dirname(source), { recursive: true, mode: DIRECTORY_MODE });
        await this.blobs.remove(entry.targetId);
        await rename(quarantine, source);
      } else if (entry.stage === "encrypted" || entry.stage === "verified") {
        await this.blobs.remove(entry.targetId);
      }
      entry.stage = "rolled-back";
      await this.journal.save(journal);
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
          await this.blobs.put(artifact, plaintext);
        } finally {
          plaintext.fill(0);
        }
        await this.transition(entry, "encrypted", journal);
      }

      if (entry.stage === "encrypted") {
        const source = await canonicalLegacyFile(this.legacyRoot, entry.source);
        const plaintext = await readFile(source);
        const reopened = await this.blobs.get(artifact);
        try {
          if (
            !reopened ||
            !entry.sourceSha256 ||
            !hashMatches(plaintext, entry.sourceSha256) ||
            !hashMatches(reopened, entry.sourceSha256)
          ) {
            throw new StorageError(
              "MIGRATION_FAILED",
              "M-02 decrypt-before-delete verification failed.",
              { recovery: "inspect-migration" },
            );
          }
        } finally {
          plaintext.fill(0);
          reopened?.fill(0);
        }
        await this.transition(entry, "verified", journal);
      }

      if (entry.stage === "verified") {
        const source = await canonicalLegacyFile(this.legacyRoot, entry.source);
        const quarantine = this.quarantinePath(entry);
        await rename(source, quarantine);
        await chmod(quarantine, FILE_MODE);
        await this.transition(entry, "quarantined", journal);
      }

      if (entry.stage === "quarantined") {
        const quarantine = this.quarantinePath(entry);
        const plaintext = await readFile(quarantine);
        const reopened = await this.blobs.get(artifact);
        try {
          if (
            !reopened ||
            !entry.sourceSha256 ||
            !hashMatches(plaintext, entry.sourceSha256) ||
            !hashMatches(reopened, entry.sourceSha256)
          ) {
            throw new StorageError(
              "MIGRATION_FAILED",
              "M-02 final decrypt-before-delete verification failed.",
              { recovery: "inspect-migration" },
            );
          }
        } finally {
          plaintext.fill(0);
          reopened?.fill(0);
        }
        await bestEffortSecureDelete(quarantine);
        await this.transition(entry, "complete", journal);
      }
    } catch (error) {
      throw asStorageError(
        error,
        "MIGRATION_FAILED",
        `M-02 stopped safely at ${entry.stage}; its readable copy was not destroyed.`,
        "inspect-migration",
      );
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

  private async transition(
    entry: JournalEntry,
    stage: MigrationStage,
    journal: MigrationJournal,
  ): Promise<void> {
    entry.stage = stage;
    await this.journal.save(journal);
    await this.checkpoint?.("M-02", entry.source, stage);
  }
}

export interface LegacyEnvelopeV0<T extends object> {
  readonly relativePath: string;
  readonly id: string;
  readonly recordType: string;
  /**
   * Adapter owned by the caller that authenticates and decrypts the old
   * envelope. M-03 never accepts unauthenticated legacy plaintext.
   */
  readonly decrypt: (encryptedV0: Buffer) => Promise<T>;
}

/**
 * M-03 upgrades authenticated legacy envelopes to schema v1. Its journal is
 * encrypted and replay-bound to the same source list. Old encrypted files are
 * retained in rollback quarantine until the v1 record has been reopened.
 */
export class EnvelopeSchemaV1Migration<T extends object> {
  private readonly journal: EncryptedMigrationJournal;

  constructor(
    private readonly legacyRoot: string,
    private readonly paths: StoragePaths,
    keys: InstallationKeyProvider,
    private readonly records: RecordRepository<T>,
    writer: AtomicFileWriter = new AtomicFileWriter(paths),
    private readonly checkpoint?: MigrationCheckpoint,
  ) {
    this.journal = new EncryptedMigrationJournal("M-03", paths, keys, writer);
  }

  async run(items: readonly LegacyEnvelopeV0<T>[]): Promise<void> {
    await this.paths.directory(path.join("migrations", "rollback", "m-03"));
    let journal = await this.journal.load();
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
      await this.journal.save(journal);
    }
    if (journal.entries.length !== items.length) {
      throw new StorageError("MIGRATION_FAILED", "M-03 replay input changed.", {
        recovery: "inspect-migration",
      });
    }
    for (let index = 0; index < items.length; index += 1) {
      const entry = journal.entries[index];
      const item = items[index];
      if (
        entry.source !== item.relativePath ||
        entry.targetId !== item.id ||
        entry.contentType !== item.recordType
      ) {
        throw new StorageError("MIGRATION_FAILED", "M-03 replay input changed.", {
          recovery: "inspect-migration",
        });
      }
      if (entry.stage === "complete" || entry.stage === "rolled-back") continue;
      try {
        await this.advance(entry, item, journal);
      } catch (error) {
        throw asStorageError(
          error,
          "MIGRATION_FAILED",
          `M-03 stopped safely at ${entry.stage}; its readable copy was not destroyed.`,
          "inspect-migration",
        );
      }
    }
  }

  async rollback(): Promise<void> {
    const journal = await this.journal.load();
    if (!journal) return;
    if (journal.entries.some((entry) => entry.stage === "complete")) {
      throw new StorageError(
        "MIGRATION_ROLLBACK_UNAVAILABLE",
        "M-03 rollback quarantine has already been securely deleted.",
        { recovery: "inspect-migration" },
      );
    }
    for (const entry of [...journal.entries].reverse()) {
      if (entry.stage === "quarantined") {
        await this.records.remove(entry.targetId);
        const source = path.resolve(this.legacyRoot, entry.source);
        await mkdir(path.dirname(source), { recursive: true, mode: DIRECTORY_MODE });
        await rename(this.quarantinePath(entry), source);
      } else if (entry.stage === "verified") {
        await this.records.remove(entry.targetId);
      }
      entry.stage = "rolled-back";
      await this.journal.save(journal);
    }
  }

  private async advance(
    entry: JournalEntry,
    item: LegacyEnvelopeV0<T>,
    journal: MigrationJournal,
  ): Promise<void> {
    if (entry.stage === "pending") {
      const source = await canonicalLegacyFile(this.legacyRoot, entry.source);
      const encryptedV0 = await readFile(source);
      try {
        entry.sourceSha256 = sha256(encryptedV0);
        const value = await item.decrypt(encryptedV0);
        await this.records.put(item.id, value, item.recordType);
        const reopened = await this.records.get(item.id, item.recordType);
        if (JSON.stringify(reopened) !== JSON.stringify(value)) {
          throw new StorageError(
            "MIGRATION_FAILED",
            "M-03 v1 reopen verification failed.",
            { recovery: "inspect-migration" },
          );
        }
      } finally {
        encryptedV0.fill(0);
      }
      entry.stage = "verified";
      await this.journal.save(journal);
      await this.checkpoint?.("M-03", entry.source, "verified");
    }

    if (entry.stage === "verified") {
      const source = await canonicalLegacyFile(this.legacyRoot, entry.source);
      const quarantine = this.quarantinePath(entry);
      await rename(source, quarantine);
      await chmod(quarantine, FILE_MODE);
      entry.stage = "quarantined";
      await this.journal.save(journal);
      await this.checkpoint?.("M-03", entry.source, "quarantined");
    }

    if (entry.stage === "quarantined") {
      const quarantine = this.quarantinePath(entry);
      const encryptedV0 = await readFile(quarantine);
      try {
        if (!entry.sourceSha256 || !hashMatches(encryptedV0, entry.sourceSha256)) {
          throw new StorageError(
            "MIGRATION_FAILED",
            "M-03 rollback copy changed before deletion.",
            { recovery: "inspect-migration" },
          );
        }
        const value = await item.decrypt(encryptedV0);
        const reopened = await this.records.get(item.id, item.recordType);
        if (JSON.stringify(reopened) !== JSON.stringify(value)) {
          throw new StorageError(
            "MIGRATION_FAILED",
            "M-03 final decrypt-before-delete verification failed.",
            { recovery: "inspect-migration" },
          );
        }
      } finally {
        encryptedV0.fill(0);
      }
      await bestEffortSecureDelete(quarantine);
      entry.stage = "complete";
      await this.journal.save(journal);
      await this.checkpoint?.("M-03", entry.source, "complete");
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
