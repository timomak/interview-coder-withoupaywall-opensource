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
