import { expect, it } from "vitest"
import {
  createCipheriv,
  createDecipheriv,
  createHash
} from "node:crypto"
import {
  mkdtemp,
  readFile,
  readdir,
  rm
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
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
const WRAPPING_KEY = createHash("sha256")
  .update("InterviewCopilot P09 deterministic test-only protector")
  .digest()
const WRAPPING_NONCE = Buffer.alloc(12, 0x6b)
const DETERMINISTIC_INSTALLATION_KEY = Buffer.from(
  Array.from({ length: 32 }, (_, index) => index + 1)
)

class DeterministicFakeKeyProtector {
  async protect(key: Buffer): Promise<Buffer> {
    const cipher = createCipheriv(
      "aes-256-gcm",
      WRAPPING_KEY,
      WRAPPING_NONCE
    )
    cipher.setAAD(Buffer.from("p09-test-installation-key"))
    return Buffer.concat([
      cipher.update(key),
      cipher.final(),
      cipher.getAuthTag()
    ])
  }

  async unprotect(protectedKey: Buffer): Promise<Buffer> {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      WRAPPING_KEY,
      WRAPPING_NONCE
    )
    decipher.setAAD(Buffer.from("p09-test-installation-key"))
    decipher.setAuthTag(protectedKey.subarray(protectedKey.length - 16))
    return Buffer.concat([
      decipher.update(protectedKey.subarray(0, protectedKey.length - 16)),
      decipher.final()
    ])
  }
}

async function withTempDirectory<T>(
  run: (root: string) => Promise<T>
): Promise<T> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ic-p09-"))
  try {
    return await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function readTree(root: string): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>()
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(target)
      } else if (entry.isFile()) {
        result.set(path.relative(root, target), await readFile(target))
      }
    }
  }
  await visit(root)
  return result
}

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
