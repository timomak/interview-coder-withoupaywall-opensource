import { randomBytes } from "node:crypto";
import { open, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  decryptEnvelope,
  encryptEnvelope,
  EnvelopeKind,
  EnvelopeMetadata,
  parseEnvelope,
  serializeEnvelope,
} from "./envelope";
import { StorageError, asStorageError } from "./errors";
import {
  assertNoCaseFoldedDuplicates,
  AtomicFileWriter,
  opaqueFileName,
  StoragePaths,
} from "./paths";

export interface InstallationKeyProvider {
  get(): Promise<Buffer>;
}

export interface RecordRepository<T extends object> {
  put(id: string, record: T, recordType?: string): Promise<void>;
  get(id: string, recordType?: string): Promise<T | undefined>;
  remove(id: string): Promise<void>;
  all(): Promise<RepositoryScanResult<T>>;
  search(query: string): Promise<ReadonlyArray<{ id: string; value: T }>>;
}

export interface BlobDescriptor {
  readonly id: string;
  readonly contentType: string;
  readonly retentionClass?: "artifact" | "cache" | "raw-audio";
}

export interface BlobRepository {
  put(descriptor: BlobDescriptor, bytes: Buffer): Promise<void>;
  get(descriptor: BlobDescriptor): Promise<Buffer | undefined>;
  remove(id: string): Promise<void>;
}

export interface RepositoryIssue {
  readonly file: string;
  readonly error: StorageError;
}

export interface RepositoryScanResult<T> {
  readonly records: ReadonlyArray<{ id: string; value: T }>;
  readonly issues: ReadonlyArray<RepositoryIssue>;
}

function rejectRawAudio(descriptor: BlobDescriptor): void {
  const type = descriptor.contentType.trim().toLocaleLowerCase("en-US");
  if (
    descriptor.retentionClass === "raw-audio" ||
    type === "application/x-raw-audio" ||
    type.startsWith("audio/")
  ) {
    throw new StorageError(
      "RAW_AUDIO_REJECTED",
      "Raw audio retention is prohibited by the encrypted-storage policy.",
    );
  }
}

class EnvelopeStore {
  constructor(
    private readonly paths: StoragePaths,
    private readonly keys: InstallationKeyProvider,
    private readonly writer: AtomicFileWriter,
  ) {}

  async put(
    directory: string,
    metadata: EnvelopeMetadata,
    plaintext: Buffer,
  ): Promise<void> {
    const key = await this.keys.get();
    let serialized: Buffer | undefined;
    try {
      const envelope = encryptEnvelope(key, metadata, plaintext);
      serialized = serializeEnvelope(envelope);
      await this.writer.write(
        path.join(directory, opaqueFileName(metadata.kind, metadata.id)),
        serialized,
      );
    } finally {
      key.fill(0);
      serialized?.fill(0);
    }
  }

  async get(
    directory: string,
    expected: EnvelopeMetadata,
  ): Promise<Buffer | undefined> {
    const relative = path.join(
      directory,
      opaqueFileName(expected.kind, expected.id),
    );
    let bytes: Buffer;
    try {
      bytes = await readFile(await this.paths.checkedFile(relative));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    const key = await this.keys.get();
    try {
      return decryptEnvelope(key, parseEnvelope(bytes), expected);
    } finally {
      bytes.fill(0);
      key.fill(0);
    }
  }

  async scan(directory: string, kind: EnvelopeKind): Promise<RepositoryScanResult<Buffer>> {
    const target = await this.paths.directory(directory);
    await assertNoCaseFoldedDuplicates(target);
    const records: Array<{ id: string; value: Buffer }> = [];
    const issues: RepositoryIssue[] = [];
    for (const name of (await readdir(target)).sort()) {
      if (!name.endsWith(".enc")) continue;
      const relative = path.join(directory, name);
      let bytes: Buffer | undefined;
      let key: Buffer | undefined;
      try {
        bytes = await readFile(await this.paths.checkedFile(relative));
        const envelope = parseEnvelope(bytes);
        if (envelope.kind !== kind) {
          throw new StorageError(
            "ENVELOPE_METADATA_MISMATCH",
            "Envelope kind does not match its repository.",
            { recovery: "repair-one-record" },
          );
        }
        if (opaqueFileName(kind, envelope.id) !== name) {
          throw new StorageError(
            "ENVELOPE_METADATA_MISMATCH",
            "Envelope identifier does not match its opaque file name.",
            { recovery: "repair-one-record" },
          );
        }
        key = await this.keys.get();
        records.push({
          id: envelope.id,
          value: decryptEnvelope(key, envelope),
        });
      } catch (error) {
        issues.push({
          file: name,
          error: asStorageError(
            error,
            "ENVELOPE_CORRUPT",
            "An isolated encrypted record is corrupt.",
            "repair-one-record",
          ),
        });
      } finally {
        bytes?.fill(0);
        key?.fill(0);
      }
    }
    return { records, issues };
  }

  async remove(directory: string, kind: EnvelopeKind, id: string): Promise<void> {
    const relative = path.join(directory, opaqueFileName(kind, id));
    let target: string;
    try {
      target = await this.paths.checkedFile(relative);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    await bestEffortSecureDelete(target);
  }
}

export class EncryptedRecordRepository<T extends object>
  implements RecordRepository<T>
{
  private readonly store: EnvelopeStore;

  constructor(
    paths: StoragePaths,
    keys: InstallationKeyProvider,
    writer: AtomicFileWriter = new AtomicFileWriter(paths),
    private readonly directory = "records",
  ) {
    this.store = new EnvelopeStore(paths, keys, writer);
  }

  async put(
    id: string,
    record: T,
    recordType = "application/json",
  ): Promise<void> {
    const plaintext = Buffer.from(JSON.stringify(record), "utf8");
    try {
      await this.store.put(this.directory, {
        kind: "record",
        id,
        contentType: recordType,
      }, plaintext);
    } finally {
      plaintext.fill(0);
    }
  }

  async get(id: string, recordType = "application/json"): Promise<T | undefined> {
    const plaintext = await this.store.get(this.directory, {
      kind: "record",
      id,
      contentType: recordType,
    });
    if (!plaintext) return undefined;
    try {
      return JSON.parse(plaintext.toString("utf8")) as T;
    } catch (error) {
      throw new StorageError("ENVELOPE_CORRUPT", "Decrypted record is not valid JSON.", {
        cause: error,
        recovery: "repair-one-record",
      });
    } finally {
      plaintext.fill(0);
    }
  }

  remove(id: string): Promise<void> {
    return this.store.remove(this.directory, "record", id);
  }

  async all(): Promise<RepositoryScanResult<T>> {
    const scan = await this.store.scan(this.directory, "record");
    const records: Array<{ id: string; value: T }> = [];
    const issues = [...scan.issues];
    for (const item of scan.records) {
      try {
        records.push({
          id: item.id,
          value: JSON.parse(item.value.toString("utf8")) as T,
        });
      } catch (error) {
        issues.push({
          file: opaqueFileName("record", item.id),
          error: new StorageError(
            "ENVELOPE_CORRUPT",
            "Decrypted record is not valid JSON.",
            { cause: error, recovery: "repair-one-record" },
          ),
        });
      } finally {
        item.value.fill(0);
      }
    }
    return { records, issues };
  }

  async search(query: string): Promise<ReadonlyArray<{ id: string; value: T }>> {
    const normalized = query.normalize("NFC").toLocaleLowerCase("en-US");
    if (normalized.length === 0) return [];
    const scan = await this.all();
    // The projection exists only for this call and is never written to disk.
    return scan.records.filter(({ value }) =>
      JSON.stringify(value)
        .normalize("NFC")
        .toLocaleLowerCase("en-US")
        .includes(normalized),
    );
  }
}

export class EncryptedBlobRepository implements BlobRepository {
  private readonly store: EnvelopeStore;

  constructor(
    paths: StoragePaths,
    keys: InstallationKeyProvider,
    writer: AtomicFileWriter = new AtomicFileWriter(paths),
    private readonly directory = "blobs",
  ) {
    this.store = new EnvelopeStore(paths, keys, writer);
  }

  async put(descriptor: BlobDescriptor, bytes: Buffer): Promise<void> {
    rejectRawAudio(descriptor);
    await this.store.put(this.directory, {
      kind: "blob",
      id: descriptor.id,
      contentType: descriptor.contentType,
    }, bytes);
  }

  async get(descriptor: BlobDescriptor): Promise<Buffer | undefined> {
    rejectRawAudio(descriptor);
    return this.store.get(this.directory, {
      kind: "blob",
      id: descriptor.id,
      contentType: descriptor.contentType,
    });
  }

  remove(id: string): Promise<void> {
    return this.store.remove(this.directory, "blob", id);
  }
}

export async function bestEffortSecureDelete(target: string): Promise<void> {
  try {
    const size = (await stat(target)).size;
    const handle = await open(target, "r+");
    try {
      let remaining = size;
      let position = 0;
      while (remaining > 0) {
        const chunk = randomBytes(Math.min(remaining, 64 * 1024));
        await handle.write(chunk, 0, chunk.length, position);
        chunk.fill(0);
        position += chunk.length;
        remaining -= chunk.length;
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
  } finally {
    await rm(target, { force: true });
  }
}
