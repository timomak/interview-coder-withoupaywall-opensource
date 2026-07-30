import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { InstallationKeyService } from "./keyService";
import {
  EnvelopeSchemaV1Migration,
  PlaintextArtifactMigration,
} from "./migrations";
import type { MigrationBoundary, MigrationOccurrence } from "./migrations";
import { StoragePaths } from "./paths";
import {
  EncryptedBlobRepository,
  EncryptedRecordRepository,
} from "./repositories";
import {
  DETERMINISTIC_INSTALLATION_KEY,
  DeterministicFakeKeyProtector,
  readTree,
  withTempDirectory,
} from "./testHelpers.cjs";

it("journals verifies and resumes legacy artifact migration", async () => {
  await withTempDirectory(async (fixtureRoot) => {
    const legacy = path.join(fixtureRoot, "legacy");
    const storage = path.join(fixtureRoot, "storage");
    await mkdir(path.join(legacy, "screenshots"), { recursive: true });
    const marker = "M02::plaintext screenshot marker";
    await writeFile(path.join(legacy, "screenshots", "one.png"), marker);

    const paths = new StoragePaths(storage);
    const keys = new InstallationKeyService(
      paths,
      new DeterministicFakeKeyProtector(),
      undefined,
      () => Buffer.from(DETERMINISTIC_INSTALLATION_KEY),
    );
    const blobs = new EncryptedBlobRepository(paths, keys);
    const artifact = {
      relativePath: path.join("screenshots", "one.png"),
      id: "legacy-screenshot-one",
      contentType: "image/png",
    };
    const interrupted = new PlaintextArtifactMigration(
      legacy,
      paths,
      keys,
      blobs,
      undefined,
      (_migration, _source, stage) => {
        if (stage === "quarantined") throw new Error("simulated interruption");
      },
    );
    await expect(interrupted.run([artifact])).rejects.toMatchObject({
      code: "MIGRATION_FAILED",
    });
    await expect(stat(path.join(legacy, artifact.relativePath))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect((await blobs.get(artifact))?.toString()).toBe(marker);

    const resumed = new PlaintextArtifactMigration(
      legacy,
      paths,
      keys,
      blobs,
    );
    await resumed.run([artifact]);
    await resumed.run([artifact]);
    expect((await blobs.get(artifact))?.toString()).toBe(marker);
    for (const bytes of (await readTree(storage)).values()) {
      expect(bytes.includes(Buffer.from(marker))).toBe(false);
    }

    // A second interrupted migration proves rollback is rename-only and is
    // available only while the explicit quarantine still exists.
    const rollbackLegacy = path.join(fixtureRoot, "rollback-legacy");
    const rollbackStorage = path.join(fixtureRoot, "rollback-storage");
    await mkdir(rollbackLegacy);
    await writeFile(path.join(rollbackLegacy, "cache.bin"), "rollback-marker");
    const rollbackPaths = new StoragePaths(rollbackStorage);
    const rollbackKeys = new InstallationKeyService(
      rollbackPaths,
      new DeterministicFakeKeyProtector(),
      undefined,
      () => Buffer.from(DETERMINISTIC_INSTALLATION_KEY),
    );
    const rollbackBlobs = new EncryptedBlobRepository(
      rollbackPaths,
      rollbackKeys,
    );
    const rollbackArtifact = {
      relativePath: "cache.bin",
      id: "rollback-cache",
      contentType: "application/octet-stream",
    };
    const rollbackMigration = new PlaintextArtifactMigration(
      rollbackLegacy,
      rollbackPaths,
      rollbackKeys,
      rollbackBlobs,
      undefined,
      (_migration, _source, stage) => {
        if (stage === "quarantined") throw new Error("stop for rollback");
      },
    );
    await expect(rollbackMigration.run([rollbackArtifact])).rejects.toBeDefined();
    await rollbackMigration.rollback();
    expect(await readFile(path.join(rollbackLegacy, "cache.bin"), "utf8")).toBe(
      "rollback-marker",
    );
    expect(await rollbackBlobs.get(rollbackArtifact)).toBeUndefined();

    // M-03 authenticates/decrypts a legacy encrypted adapter in memory,
    // reopens v1, journals replay, and retains rollback until verification.
    const v0Root = path.join(fixtureRoot, "v0");
    await mkdir(v0Root);
    const v0Bytes = Buffer.from("authenticated-v0-envelope");
    await writeFile(path.join(v0Root, "record.v0"), v0Bytes);
    const records = new EncryptedRecordRepository<{ migrated: string }>(
      paths,
      keys,
      undefined,
      "m03-records",
    );
    const m03Item = {
      relativePath: "record.v0",
      id: "m03-record",
      recordType: "application/x-session+json",
      decrypt: async (bytes: Buffer) => {
        expect(bytes.equals(v0Bytes)).toBe(true);
        return { migrated: "yes" };
      },
    };
    const m03Interrupted = new EnvelopeSchemaV1Migration(
      v0Root,
      paths,
      keys,
      records,
      undefined,
      (_migration, _source, stage) => {
        if (stage === "quarantined") throw new Error("stop M-03 for rollback");
      },
    );
    await expect(m03Interrupted.run([m03Item])).rejects.toBeDefined();
    await m03Interrupted.rollback();
    expect(await readFile(path.join(v0Root, "record.v0"))).toEqual(v0Bytes);
    expect(await records.get("m03-record", m03Item.recordType)).toBeUndefined();
  });
});

const CRASH_BOUNDARIES = new Set<MigrationBoundary>([
  "before-journal-write",
  "after-journal-write",
  "before-target-write",
  "after-target-write",
  "before-quarantine-rename",
  "after-quarantine-rename",
  "before-quarantine-delete",
  "after-quarantine-delete",
  "before-restore-rename",
  "after-restore-rename",
  "before-target-delete",
  "after-target-delete",
]);

interface OccurrenceTarget {
  readonly boundary: MigrationBoundary;
  readonly occurrence: number;
  readonly id: string;
}

function observe(
  reached: OccurrenceTarget[],
  boundary: MigrationBoundary,
  occurrence: MigrationOccurrence,
  target?: OccurrenceTarget,
): void {
  if (!CRASH_BOUNDARIES.has(boundary)) return;
  reached.push(occurrence);
  if (target?.id === occurrence.id) {
    throw new Error(`simulated crash at ${occurrence.id}`);
  }
}

function assertOccurrenceMatrix(
  reached: readonly OccurrenceTarget[],
  journalSaves: number,
  filesystemBoundaries: readonly MigrationBoundary[],
): void {
  expect(reached.length).toBeGreaterThan(0);
  expect(new Set(reached.map((item) => item.id)).size).toBe(reached.length);
  expect(
    reached.filter((item) => item.boundary === "before-journal-write"),
  ).toHaveLength(journalSaves);
  expect(
    reached.filter((item) => item.boundary === "after-journal-write"),
  ).toHaveLength(journalSaves);
  for (const boundary of filesystemBoundaries) {
    expect(
      reached.filter((item) => item.boundary === boundary),
      boundary,
    ).toHaveLength(1);
  }
  expect(new Set(reached.map((item) => item.boundary))).toEqual(
    new Set([
      "before-journal-write",
      "after-journal-write",
      ...filesystemBoundaries,
    ]),
  );
}

async function m02Forward(target?: OccurrenceTarget): Promise<OccurrenceTarget[]> {
  const reached: OccurrenceTarget[] = [];
  await withTempDirectory(async (fixtureRoot) => {
    const legacy = path.join(fixtureRoot, "legacy");
    const storage = path.join(fixtureRoot, "storage");
    const marker = "M02::occurrence-forward-marker";
    await mkdir(legacy, { recursive: true });
    await writeFile(path.join(legacy, "artifact.bin"), marker);
    const paths = new StoragePaths(storage);
    const keys = new InstallationKeyService(
      paths,
      new DeterministicFakeKeyProtector(),
      undefined,
      () => Buffer.from(DETERMINISTIC_INSTALLATION_KEY),
    );
    const blobs = new EncryptedBlobRepository(paths, keys);
    const artifact = {
      relativePath: "artifact.bin",
      id: "m02-occurrence-forward",
      contentType: "application/octet-stream",
    };
    const migration = new PlaintextArtifactMigration(
      legacy,
      paths,
      keys,
      blobs,
      undefined,
      (_migration, _source, boundary, occurrence) =>
        observe(reached, boundary, occurrence, target),
    );
    if (!target) {
      await migration.run([artifact]);
      return;
    }
    await expect(migration.run([artifact])).rejects.toBeDefined();
    expect(reached.at(-1)?.id).toBe(target.id);
    const sourceReadable = await readFile(
      path.join(legacy, "artifact.bin"),
    ).then(
      (bytes) => bytes.toString("utf8") === marker,
      () => false,
    );
    const targetReadable = await blobs.get(artifact).then((bytes) => {
      const matches = bytes?.toString("utf8") === marker;
      bytes?.fill(0);
      return matches;
    });
    const quarantineReadable = [...(await readTree(storage)).values()].some(
      (bytes) => bytes.includes(Buffer.from(marker)),
    );
    expect(sourceReadable || targetReadable || quarantineReadable).toBe(true);
    await new PlaintextArtifactMigration(legacy, paths, keys, blobs).run([
      artifact,
    ]);
    expect((await blobs.get(artifact))?.toString("utf8")).toBe(marker);
  });
  return reached;
}

async function m02Rollback(target?: OccurrenceTarget): Promise<OccurrenceTarget[]> {
  const reached: OccurrenceTarget[] = [];
  await withTempDirectory(async (fixtureRoot) => {
    const legacy = path.join(fixtureRoot, "legacy");
    const storage = path.join(fixtureRoot, "storage");
    const marker = "M02::occurrence-rollback-marker";
    await mkdir(legacy, { recursive: true });
    await writeFile(path.join(legacy, "artifact.bin"), marker);
    const paths = new StoragePaths(storage);
    const keys = new InstallationKeyService(
      paths,
      new DeterministicFakeKeyProtector(),
      undefined,
      () => Buffer.from(DETERMINISTIC_INSTALLATION_KEY),
    );
    const blobs = new EncryptedBlobRepository(paths, keys);
    const artifact = {
      relativePath: "artifact.bin",
      id: "m02-occurrence-rollback",
      contentType: "application/octet-stream",
    };
    const prepare = new PlaintextArtifactMigration(
      legacy,
      paths,
      keys,
      blobs,
      undefined,
      (_migration, _source, boundary) => {
        if (boundary === "quarantined") throw new Error("prepare rollback");
      },
    );
    await expect(prepare.run([artifact])).rejects.toBeDefined();
    const rollback = new PlaintextArtifactMigration(
      legacy,
      paths,
      keys,
      blobs,
      undefined,
      (_migration, _source, boundary, occurrence) =>
        observe(reached, boundary, occurrence, target),
    );
    if (!target) {
      await rollback.rollback();
      return;
    }
    await expect(rollback.rollback()).rejects.toBeDefined();
    expect(reached.at(-1)?.id).toBe(target.id);
    const sourceReadable = await readFile(
      path.join(legacy, "artifact.bin"),
    ).then(
      (bytes) => bytes.toString("utf8") === marker,
      () => false,
    );
    const targetReadable = await blobs.get(artifact).then((bytes) => {
      const matches = bytes?.toString("utf8") === marker;
      bytes?.fill(0);
      return matches;
    });
    const quarantineReadable = [...(await readTree(storage)).values()].some(
      (bytes) => bytes.includes(Buffer.from(marker)),
    );
    expect(sourceReadable || targetReadable || quarantineReadable).toBe(true);
    await new PlaintextArtifactMigration(
      legacy,
      paths,
      keys,
      blobs,
    ).rollback();
    expect(await readFile(path.join(legacy, "artifact.bin"), "utf8")).toBe(
      marker,
    );
    expect(await blobs.get(artifact)).toBeUndefined();
  });
  return reached;
}

async function m03Flow(
  operation: "forward" | "rollback",
  target?: OccurrenceTarget,
): Promise<OccurrenceTarget[]> {
  const reached: OccurrenceTarget[] = [];
  await withTempDirectory(async (fixtureRoot) => {
    const legacy = path.join(fixtureRoot, "legacy");
    const storage = path.join(fixtureRoot, "storage");
    const legacyBytes = Buffer.from(`M03::occurrence-${operation}-marker`);
    await mkdir(legacy, { recursive: true });
    await writeFile(path.join(legacy, "record.v0"), legacyBytes);
    const paths = new StoragePaths(storage);
    const keys = new InstallationKeyService(
      paths,
      new DeterministicFakeKeyProtector(),
      undefined,
      () => Buffer.from(DETERMINISTIC_INSTALLATION_KEY),
    );
    const records = new EncryptedRecordRepository<{ migrated: string }>(
      paths,
      keys,
      undefined,
      `m03-occurrence-${operation}`,
    );
    const item = {
      relativePath: "record.v0",
      id: `m03-occurrence-${operation}`,
      recordType: "application/x-session+json",
      decrypt: async (bytes: Buffer) => {
        expect(bytes).toEqual(legacyBytes);
        return { migrated: operation };
      },
    };
    if (operation === "rollback") {
      const prepare = new EnvelopeSchemaV1Migration(
        legacy,
        paths,
        keys,
        records,
        undefined,
        (_migration, _source, boundary) => {
          if (boundary === "quarantined") throw new Error("prepare rollback");
        },
      );
      await expect(prepare.run([item])).rejects.toBeDefined();
    }
    const migration = new EnvelopeSchemaV1Migration(
      legacy,
      paths,
      keys,
      records,
      undefined,
      (_migration, _source, boundary, occurrence) =>
        observe(reached, boundary, occurrence, target),
    );
    const execute = () =>
      operation === "forward" ? migration.run([item]) : migration.rollback([item]);
    if (!target) {
      await execute();
      return;
    }
    await expect(execute()).rejects.toBeDefined();
    expect(reached.at(-1)?.id).toBe(target.id);
    const sourceReadable = await readFile(
      path.join(legacy, "record.v0"),
    ).then(
      (bytes) => bytes.equals(legacyBytes),
      () => false,
    );
    const targetReadable =
      (await records.get(item.id, item.recordType))?.migrated === operation;
    const quarantineReadable = [...(await readTree(storage)).values()].some(
      (bytes) => bytes.includes(legacyBytes),
    );
    expect(sourceReadable || targetReadable || quarantineReadable).toBe(true);
    const replay = new EnvelopeSchemaV1Migration(
      legacy,
      paths,
      keys,
      records,
    );
    if (operation === "forward") {
      await replay.run([item]);
      expect(await records.get(item.id, item.recordType)).toEqual({
        migrated: operation,
      });
    } else {
      await replay.rollback([item]);
      expect(await readFile(path.join(legacy, "record.v0"))).toEqual(
        legacyBytes,
      );
      expect(await records.get(item.id, item.recordType)).toBeUndefined();
    }
  });
  return reached;
}

it("reconciles every write-ahead filesystem boundary after a crash", async () => {
  const expected = await m02Forward();
  assertOccurrenceMatrix(expected, 8, [
    "before-target-write",
    "after-target-write",
    "before-quarantine-rename",
    "after-quarantine-rename",
    "before-quarantine-delete",
    "after-quarantine-delete",
  ]);
  for (const occurrence of expected) await m02Forward(occurrence);
}, 60_000);

it("restores and verifies the prior copy before rollback target deletion", async () => {
  const expected = await m02Rollback();
  assertOccurrenceMatrix(expected, 3, [
    "before-restore-rename",
    "after-restore-rename",
    "before-target-delete",
    "after-target-delete",
  ]);
  for (const occurrence of expected) await m02Rollback(occurrence);
}, 60_000);

it("reconciles M-03 filesystem boundaries after a crash", async () => {
  for (const operation of ["forward", "rollback"] as const) {
    const expected = await m03Flow(operation);
    assertOccurrenceMatrix(
      expected,
      operation === "forward" ? 7 : 3,
      operation === "forward"
        ? [
            "before-target-write",
            "after-target-write",
            "before-quarantine-rename",
            "after-quarantine-rename",
            "before-quarantine-delete",
            "after-quarantine-delete",
          ]
        : [
            "before-restore-rename",
            "after-restore-rename",
            "before-target-delete",
            "after-target-delete",
          ],
    );
    for (const occurrence of expected) {
      await m03Flow(operation, occurrence);
    }
  }
}, 60_000);
