import { readdir } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { InstallationKeyService } from "./keyService";
import { AtomicFileWriter, StoragePaths } from "./paths";
import { EncryptedRecordRepository } from "./repositories";
import {
  DETERMINISTIC_INSTALLATION_KEY,
  DeterministicFakeKeyProtector,
  withTempDirectory,
} from "./testHelpers.cjs";

it("survives interruption and disk exhaustion", async () => {
  await withTempDirectory(async (root) => {
    const paths = new StoragePaths(root);
    const keys = new InstallationKeyService(
      paths,
      new DeterministicFakeKeyProtector(),
      undefined,
      () => Buffer.from(DETERMINISTIC_INSTALLATION_KEY),
    );
    const stable = new EncryptedRecordRepository<{ value: string }>(paths, keys);
    await stable.put("atomic-record", { value: "prior" });

    for (const failure of ["written", "before-rename"] as const) {
      const faulting = new EncryptedRecordRepository<{ value: string }>(
        paths,
        keys,
        new AtomicFileWriter(paths, (stage) => {
          if (stage === failure) {
            const error = new Error(
              failure === "written" ? "simulated crash" : "simulated disk full",
            ) as NodeJS.ErrnoException;
            error.code = failure === "written" ? "EINTR" : "ENOSPC";
            throw error;
          }
        }),
      );
      await expect(
        faulting.put("atomic-record", { value: "partial" }),
      ).rejects.toMatchObject({ code: "ATOMIC_WRITE_FAILED" });
      expect(await stable.get("atomic-record")).toEqual({ value: "prior" });
    }

    await stable.put("atomic-record", { value: "new" });
    expect(await stable.get("atomic-record")).toEqual({ value: "new" });
    expect(
      (await readdir(path.join(root, "records"))).some((name) =>
        name.includes(".tmp-"),
      ),
    ).toBe(false);
  });
});
