import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { StorageError } from "./errors";
import { InstallationKeyService } from "./keyService";
import { opaqueFileName, StoragePaths } from "./paths";
import { recoveryFor } from "./recovery";
import { EncryptedRecordRepository } from "./repositories";
import {
  DETERMINISTIC_INSTALLATION_KEY,
  DeterministicFakeKeyProtector,
  withTempDirectory,
} from "./testHelpers.cjs";

it("preserves data on key and record failures", async () => {
  await withTempDirectory(async (root) => {
    const paths = new StoragePaths(root);
    const keys = new InstallationKeyService(
      paths,
      new DeterministicFakeKeyProtector(),
      undefined,
      () => Buffer.from(DETERMINISTIC_INSTALLATION_KEY),
    );
    const records = new EncryptedRecordRepository<{ value: string }>(paths, keys);
    await records.put("healthy", { value: "keep me" });
    await records.put("corrupt", { value: "isolate me" });
    const keyPath = path.join(root, "key", "installation-key.protected");
    const protectedBefore = await readFile(keyPath);

    const lockedKeys = new InstallationKeyService(
      new StoragePaths(root),
      new DeterministicFakeKeyProtector("locked"),
    );
    const lockedRepository = new EncryptedRecordRepository<{ value: string }>(
      new StoragePaths(root),
      lockedKeys,
    );
    const lockedError = await lockedRepository
      .get("healthy")
      .catch((error: StorageError) => error);
    expect(lockedError).toMatchObject({ code: "KEYCHAIN_LOCKED" });
    expect(recoveryFor(lockedError as StorageError)).toMatchObject({
      kind: "keychain-locked",
      destructive: false,
    });

    const wrongUserKeys = new InstallationKeyService(
      new StoragePaths(root),
      new DeterministicFakeKeyProtector("wrong-user"),
    );
    await expect(
      new EncryptedRecordRepository(new StoragePaths(root), wrongUserKeys).get(
        "healthy",
      ),
    ).rejects.toMatchObject({ code: "KEYCHAIN_ACCESS_DENIED" });
    expect(await readFile(keyPath)).toEqual(protectedBefore);

    const corruptPath = path.join(
      root,
      "records",
      opaqueFileName("record", "corrupt"),
    );
    const corruptBytes = await readFile(corruptPath);
    corruptBytes[Math.floor(corruptBytes.length / 2)] ^= 0xff;
    await writeFile(corruptPath, corruptBytes, { mode: 0o600 });

    const scan = await records.all();
    expect(scan.records).toEqual([
      { id: "healthy", value: { value: "keep me" } },
    ]);
    expect(scan.issues).toHaveLength(1);
    expect(recoveryFor(scan.issues[0].error)).toMatchObject({
      kind: "isolated-record-corruption",
      destructive: false,
    });
    expect(await records.get("healthy")).toEqual({ value: "keep me" });
    expect(await readFile(corruptPath)).toEqual(corruptBytes);
    expect(await readFile(keyPath)).toEqual(protectedBefore);
  });
});
