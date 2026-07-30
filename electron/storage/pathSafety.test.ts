import {
  chmod,
  mkdir,
  open,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { InstallationKeyService } from "./keyService";
import {
  FILE_MODE,
  isOwnerOnly,
  opaqueFileName,
  StoragePaths,
} from "./paths";
import { EncryptedRecordRepository } from "./repositories";
import {
  DETERMINISTIC_INSTALLATION_KEY,
  DeterministicFakeKeyProtector,
  withTempDirectory,
} from "./testHelpers.cjs";

it("confines encrypted storage and file modes", async () => {
  await withTempDirectory(async (fixtureRoot) => {
    const root = path.join(fixtureRoot, "store");
    const paths = new StoragePaths(root);
    const keys = new InstallationKeyService(
      paths,
      new DeterministicFakeKeyProtector(),
      undefined,
      () => Buffer.from(DETERMINISTIC_INSTALLATION_KEY),
    );
    const records = new EncryptedRecordRepository<{ value: string }>(paths, keys);
    await records.put("case-sensitive-ID", { value: "upper" });
    await records.put("case-sensitive-id", { value: "lower" });
    expect(await records.get("case-sensitive-ID")).toEqual({ value: "upper" });
    expect(await records.get("case-sensitive-id")).toEqual({ value: "lower" });

    const recordDirectory = path.join(root, "records");
    const keyFile = path.join(root, "key", "installation-key.protected");
    for (const target of [root, recordDirectory, keyFile]) {
      expect(await isOwnerOnly(target), target).toBe(true);
    }
    expect((await readFile(keyFile)).byteLength).toBeGreaterThan(32);

    expect(() => opaqueFileName("record", "../escape")).toThrowError();
    expect(() => paths.resolve("../escape")).toThrowError();

    const outside = path.join(fixtureRoot, "outside");
    await writeFile(outside, "outside", { mode: FILE_MODE });
    const linkedId = "linked-record";
    await symlink(
      outside,
      path.join(recordDirectory, opaqueFileName("record", linkedId)),
    );
    await expect(records.get(linkedId)).rejects.toMatchObject({
      code: "PATH_SYMLINK_REJECTED",
    });
    await expect(
      records.put(linkedId, { value: "must-not-escape" }),
    ).rejects.toMatchObject({ code: "PATH_SYMLINK_REJECTED" });
    expect(await readFile(outside, "utf8")).toBe("outside");

    // This probes the actual macOS volume. Opaque lowercase hashes make record
    // paths collision-free regardless of whether the volume folds case.
    const probeUpper = path.join(fixtureRoot, "CaseProbe");
    const probeLower = path.join(fixtureRoot, "caseprobe");
    const probe = await open(probeUpper, "wx", FILE_MODE);
    await probe.close();
    let caseInsensitive = false;
    try {
      const second = await open(probeLower, "wx", FILE_MODE);
      await second.close();
    } catch (error) {
      caseInsensitive = (error as NodeJS.ErrnoException).code === "EEXIST";
    }
    if (process.platform === "darwin") {
      expect(caseInsensitive, "authoritative P03 volume must fold filename case").toBe(
        true,
      );
    }

    await chmod(recordDirectory, 0o755);
    expect(await isOwnerOnly(recordDirectory)).toBe(false);
    await paths.directory("records");
    expect(await isOwnerOnly(recordDirectory)).toBe(true);

    const unsafeRoot = path.join(fixtureRoot, "unsafe-link");
    await mkdir(path.join(fixtureRoot, "real-root"));
    await symlink(path.join(fixtureRoot, "real-root"), unsafeRoot);
    await expect(new StoragePaths(unsafeRoot).initialize()).rejects.toMatchObject({
      code: "PATH_SYMLINK_REJECTED",
    });
  });
});
