import { expect, it } from "vitest"
import {
  emptyDeliveryState
} from "../orchestrator/contextPolicy"
import {
  ActiveSessionRepository,
  type M04ActiveSnapshot
} from "../orchestrator/sessionRepository"
import {
  startedSession
} from "../orchestrator/testSupport"
import { reduceInterviewSession } from "../../src/domain/interview"
import { defaultSpeaker } from "../../src/shared/audio"
import { InstallationKeyService } from "./keyService"
import { StoragePaths } from "./paths"
import { EncryptedRecordRepository } from "./repositories"
import {
  DETERMINISTIC_INSTALLATION_KEY,
  DeterministicFakeKeyProtector,
  readTree,
  withTempDirectory
} from "./testHelpers.cjs"

it("encrypts M-07 transcript text and recovers every source off", async () => {
  await withTempDirectory(async (root: string) => {
    const paths = new StoragePaths(root)
    const keys = new InstallationKeyService(
      paths,
      new DeterministicFakeKeyProtector(),
      undefined,
      () => Buffer.from(DETERMINISTIC_INSTALLATION_KEY)
    )
    const repository = new ActiveSessionRepository(
      new EncryptedRecordRepository<M04ActiveSnapshot>(paths, keys)
    )
    const initial = startedSession()
    const transcriptMarker = "TRANSCRIPT::private queue design question"
    const reduced = reduceInterviewSession(
      initial,
      {
        type: "audio-transcript-upserted",
        eventId: "event-audio-final",
        sessionId: initial.sessionId,
        sequence: initial.sequence + 1,
        at: "2026-07-31T10:00:01Z",
        segment: {
          schemaVersion: 1,
          id: "segment-private",
          source: "system",
          state: "final",
          text: transcriptMarker,
          startedAt: "2026-07-31T10:00:00Z",
          finalizedAt: "2026-07-31T10:00:01Z",
          revision: 1,
          speaker: defaultSpeaker("system")
        }
      }
    )
    expect(reduced.accepted).toBe(true)
    if (reduced.state.lifecycle !== "active") {
      throw new Error("fixture session is not active")
    }
    await repository.save(
      reduced.state,
      { mode: "resume", id: "provider-conversation-private" },
      emptyDeliveryState(),
      "2026-07-31T10:00:02Z"
    )

    for (const [, bytes] of await readTree(root)) {
      expect(bytes.includes(Buffer.from(transcriptMarker))).toBe(false)
      expect(bytes.includes(Buffer.from("segment-private"))).toBe(false)
    }
    const recovered = await repository.load()
    expect(recovered?.session.audio.segments[0]?.text).toBe(transcriptMarker)
    expect(recovered?.session.audio.sources).toMatchObject({
      microphone: { phase: "off", intent: "off" },
      system: { phase: "off", intent: "off" }
    })
  })
})
