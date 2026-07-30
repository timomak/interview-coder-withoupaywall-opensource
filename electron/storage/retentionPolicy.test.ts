import { expect, it } from "vitest";
import { InstallationKeyService } from "./keyService";
import { StoragePaths } from "./paths";
import { EncryptedBlobRepository } from "./repositories";
import {
  DETERMINISTIC_INSTALLATION_KEY,
  DeterministicFakeKeyProtector,
  readTree,
  withTempDirectory,
} from "./testHelpers.cjs";

it("refuses raw audio persistence", async () => {
  await withTempDirectory(async (root) => {
    const marker = Buffer.from("RAW-AUDIO::must-never-persist");
    const paths = new StoragePaths(root);
    const keys = new InstallationKeyService(
      paths,
      new DeterministicFakeKeyProtector(),
      undefined,
      () => Buffer.from(DETERMINISTIC_INSTALLATION_KEY),
    );
    const blobs = new EncryptedBlobRepository(paths, keys);
    await expect(
      blobs.put(
        {
          id: "raw-audio-fixture",
          contentType: "audio/pcm",
          retentionClass: "raw-audio",
        },
        marker,
      ),
    ).rejects.toMatchObject({ code: "RAW_AUDIO_REJECTED" });
    await expect(
      blobs.put(
        { id: "disguised-audio", contentType: "application/x-raw-audio" },
        marker,
      ),
    ).rejects.toMatchObject({ code: "RAW_AUDIO_REJECTED" });
    for (const bytes of (await readTree(root)).values()) {
      expect(bytes.includes(marker)).toBe(false);
    }
  });
});
