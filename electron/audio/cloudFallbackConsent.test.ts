import { expect, it } from "vitest"
import { MemoryRecordRepository } from "../orchestrator/testSupport"
import {
  AudioPreferencesRepository,
  type M07AudioPreferencesRecord
} from "./session/AudioPreferencesRepository"

it("requires explicit Apple transcription consent", async () => {
  const repository = new AudioPreferencesRepository(
    new MemoryRecordRepository<M07AudioPreferencesRecord>()
  )

  expect(await repository.load()).toMatchObject({
    appleSpeechEnabled: false,
    sourceDefaults: { microphone: false, system: false }
  })

  expect(
    await repository.save({
      schemaVersion: 1,
      appleSpeechEnabled: true,
      sourceDefaults: { microphone: false, system: false },
      transcriptRetention: true
    })
  ).toMatchObject({
    appleSpeechEnabled: true,
    sourceDefaults: { microphone: false, system: false }
  })
})
