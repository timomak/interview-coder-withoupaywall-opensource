import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { StorageError } from "./errors";
import {
  ElectronSafeStorageKeyProtector,
  InstallationKeyService,
} from "./keyService";
import { StoragePaths } from "./paths";
import {
  DETERMINISTIC_INSTALLATION_KEY,
  DeterministicFakeKeyProtector,
  withTempDirectory,
} from "./testHelpers.cjs";

it("creates protects and reopens one installation key", async () => {
  await withTempDirectory(async (root) => {
    const paths = new StoragePaths(root);
    let generated = 0;
    const first = new InstallationKeyService(
      paths,
      new DeterministicFakeKeyProtector(),
      undefined,
      () => {
        generated += 1;
        return Buffer.from(DETERMINISTIC_INSTALLATION_KEY);
      },
    );
    const key = await first.get();
    expect(key.equals(DETERMINISTIC_INSTALLATION_KEY)).toBe(true);
    key.fill(0);
    const protectedBytes = await readFile(
      path.join(root, "key", "installation-key.protected"),
    );
    expect(protectedBytes.includes(DETERMINISTIC_INSTALLATION_KEY)).toBe(false);

    const restarted = new InstallationKeyService(
      new StoragePaths(root),
      new DeterministicFakeKeyProtector(),
      undefined,
      () => {
        throw new Error("restart must not generate a second key");
      },
    );
    const reopened = await restarted.get();
    expect(reopened.equals(DETERMINISTIC_INSTALLATION_KEY)).toBe(true);
    expect(generated).toBe(1);
    reopened.fill(0);

    let safeStorageEncryptions = 0;
    const availableBoundary = new ElectronSafeStorageKeyProtector(
      {
        isEncryptionAvailable: () => true,
        encryptString: (plaintext) => {
          safeStorageEncryptions += 1;
          return Buffer.from([...plaintext].reverse().join(""), "utf8");
        },
        decryptString: (ciphertext) =>
          [...ciphertext.toString("utf8")].reverse().join(""),
      },
      "darwin",
    );
    const productionBoundaryKey = Buffer.from(DETERMINISTIC_INSTALLATION_KEY);
    const wrapped = await availableBoundary.protect(productionBoundaryKey);
    const boundaryReopened = await availableBoundary.unprotect(wrapped);
    expect(boundaryReopened.equals(productionBoundaryKey)).toBe(true);
    expect(safeStorageEncryptions).toBe(1);
    productionBoundaryKey.fill(0);
    boundaryReopened.fill(0);
    wrapped.fill(0);

    const boundary = new ElectronSafeStorageKeyProtector(
      {
        isEncryptionAvailable: () => false,
        encryptString: () => Buffer.alloc(0),
        decryptString: () => "",
      },
      "darwin",
    );
    await expect(boundary.protect(Buffer.alloc(32))).rejects.toMatchObject<
      Partial<StorageError>
    >({ code: "KEYCHAIN_LOCKED" });
  });
});
