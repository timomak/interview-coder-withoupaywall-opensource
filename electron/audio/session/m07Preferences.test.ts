import { describe, expect, it } from "vitest"
import {
  EncryptedRecordRepository,
  InstallationKeyService,
  StoragePaths
} from "../../storage"
import {
  DETERMINISTIC_INSTALLATION_KEY,
  DeterministicFakeKeyProtector,
  readTree,
  withTempDirectory
} from "../../storage/testHelpers.cjs"
import { DEFAULT_AUDIO_PREFERENCES } from "../../../src/shared/audio"
import {
  AudioPreferencesRepository,
  type M07AudioPreferencesRecord
} from "./AudioPreferencesRepository"

describe("M-07 encrypted audio preferences", () => {
  it("defaults capture and Apple Speech off and persists no plaintext index", async () => {
    await withTempDirectory(async (root: string) => {
      const paths = new StoragePaths(root)
      const keys = new InstallationKeyService(
        paths,
        new DeterministicFakeKeyProtector(),
        undefined,
        () => Buffer.from(DETERMINISTIC_INSTALLATION_KEY)
      )
      const repository = new AudioPreferencesRepository(
        new EncryptedRecordRepository<M07AudioPreferencesRecord>(
          paths,
          keys,
          undefined,
          "audio"
        ),
        () => "2026-07-31T10:00:00Z"
      )

      expect(await repository.load()).toEqual(DEFAULT_AUDIO_PREFERENCES)
      const saved = await repository.save({
        ...DEFAULT_AUDIO_PREFERENCES,
        appleSpeechEnabled: true
      })
      expect(saved.appleSpeechEnabled).toBe(true)
      expect((await repository.load()).sourceDefaults).toEqual({
        microphone: false,
        system: false
      })

      for (const [, bytes] of await readTree(root)) {
        expect(bytes.includes(Buffer.from("appleSpeechEnabled"))).toBe(false)
        expect(bytes.includes(Buffer.from("transcriptRetention"))).toBe(false)
      }
    })
  })
})
