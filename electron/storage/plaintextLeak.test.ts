import { expect, it } from "vitest";
import { InstallationKeyService } from "./keyService";
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

it("finds no sensitive fixture bytes at rest", async () => {
  await withTempDirectory(async (root) => {
    const paths = new StoragePaths(root);
    const keys = new InstallationKeyService(
      paths,
      new DeterministicFakeKeyProtector(),
      undefined,
      () => Buffer.from(DETERMINISTIC_INSTALLATION_KEY),
    );
    const records = new EncryptedRecordRepository<Record<string, string>>(
      paths,
      keys,
    );
    const blobs = new EncryptedBlobRepository(paths, keys);
    const markers = [
      "TRANSCRIPT::how do mutexes work?",
      "PROMPT::private interview instruction",
      "DIAGRAM::secret dependency graph",
      "PROFILE::candidate private biography",
      "INDEX-TERM::distributed-systems",
    ];
    await records.put("fixture-record", {
      transcript: markers[0],
      prompt: markers[1],
      diagram: markers[2],
      profile: markers[3],
      searchTerm: markers[4],
    });
    const screenshot = Buffer.from("SCREENSHOT::private pixels", "utf8");
    await blobs.put(
      { id: "screenshot-fixture", contentType: "image/png" },
      screenshot,
    );
    expect(await records.search("distributed-systems")).toHaveLength(1);

    const atRest = await readTree(root);
    const forbidden = [
      ...markers.map((marker) => Buffer.from(marker)),
      screenshot,
      Buffer.from(screenshot.toString("base64")),
      Buffer.from(screenshot.toString("hex")),
      DETERMINISTIC_INSTALLATION_KEY,
      Buffer.from(DETERMINISTIC_INSTALLATION_KEY.toString("base64")),
      Buffer.from(DETERMINISTIC_INSTALLATION_KEY.toString("hex")),
    ];
    for (const [name, bytes] of atRest) {
      for (const needle of forbidden) {
        expect(bytes.includes(needle), `${name} leaked ${needle.toString()}`).toBe(
          false,
        );
      }
    }
  });
});
