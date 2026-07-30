import {
  mkdtemp,
  readFile,
  readdir,
  rm
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { ProviderSession } from "../providers"
import type { ProviderSelection } from "../../src/shared/provider"
import type {
  ResetArchive,
  StartSnapshot
} from "../../src/shared/interview"
import {
  EncryptedRecordRepository,
  StoragePaths
} from "../storage"
import {
  InterviewOrchestrator,
  type ProviderConversationFactory
} from "./InterviewOrchestrator"
import {
  ActiveSessionRepository,
  type M04ActiveSnapshot
} from "./sessionRepository"
import {
  FakeProviderFactory,
  TEST_SNAPSHOT,
  createTestOrchestrator,
  currentActive,
  deterministicIds
} from "./testSupport"

async function withTempDirectory<T>(
  run: (root: string) => Promise<T>
): Promise<T> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ic-b04-recovery-"))
  try {
    return await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function readTree(root: string): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>()
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(target)
      if (entry.isFile()) {
        result.set(path.relative(root, target), await readFile(target))
      }
    }
  }
  await visit(root)
  return result
}

const selection: ProviderSelection = {
  provider: "codex",
  model: "gpt-5.4",
  responseMode: "fast",
  effort: "low"
}

class PendingCancellationFactory implements ProviderConversationFactory {
  readonly prompts: string[] = []
  readonly nativeConversations = new Set<string>()
  private startedResolve!: () => void
  readonly started = new Promise<void>((resolve) => {
    this.startedResolve = resolve
  })

  create(
    _snapshot: StartSnapshot,
    requestedConversationId: string
  ): ProviderSession {
    this.nativeConversations.add(requestedConversationId)
    return this.session(requestedConversationId)
  }

  resume(_snapshot: StartSnapshot, conversationId: string): ProviderSession {
    if (!this.nativeConversations.has(conversationId)) {
      throw new Error("Unknown native conversation")
    }
    return this.session(conversationId)
  }

  private session(conversationId: string): ProviderSession {
    return {
      selection,
      conversationId: () => conversationId,
      runTurn: async (prompt, signal, onEvent) => {
        this.prompts.push(prompt)
        const started = { type: "started" as const, sequence: 1 }
        await onEvent?.(started)
        this.startedResolve()
        await new Promise<void>((resolve) => {
          if (signal?.aborted) {
            resolve()
            return
          }
          signal?.addEventListener("abort", () => resolve(), { once: true })
        })
        return { selection, events: [started] }
      }
    }
  }
}

describe("encrypted crash recovery", () => {
  it("restores one encrypted provider conversation with capture off", async () => {
    const first = createTestOrchestrator()
    await first.orchestrator.start(TEST_SNAPSHOT)
    const saved = first.records.values.get("active-interview-session")
    expect(saved?.providerConversation.id).toMatch(/^test-opaque-id-/)
    expect(saved?.providerConversation.mode).toBe("create")
    expect(saved?.delivery.cursor.seeded).toBe(false)
    const savedConversationId = saved?.providerConversation.id
    if (!savedConversationId) throw new Error("Expected saved conversation ID")

    const second = createTestOrchestrator(
      new FakeProviderFactory(new Set([savedConversationId])),
      first.records
    )
    expect(await second.orchestrator.inspectRecovery()).toMatchObject({
      available: true,
      captureActive: false
    })
    expect(second.providerFactory.conversationIds).toEqual([])
    await second.orchestrator.resume()
    expect(second.orchestrator.current()).toMatchObject({
      lifecycle: "active",
      captureActive: false
    })
    expect(second.providerFactory.conversationIds).toEqual([
      savedConversationId
    ])
    const plaintextSurfaces = JSON.stringify({
      config: TEST_SNAPSHOT,
      index: Object.keys(Object.fromEntries(first.records.values)),
      log: [],
      providerDirectory: []
    })
    expect(plaintextSurfaces).not.toContain(
      String(saved?.providerConversation.id)
    )
  })

  it("retries the exact pending delivery after failure and crash", async () => {
    const firstFactory = new FakeProviderFactory()
    firstFactory.queued.push({
      selection: {
        provider: "codex",
        model: "gpt-5.4",
        responseMode: "fast",
        effort: "low"
      },
      events: [
        {
          type: "error",
          sequence: 1,
          code: "PROCESS_FAILED",
          message: "transient failure",
          recoverable: true
        }
      ]
    })
    const first = createTestOrchestrator(firstFactory)
    await first.orchestrator.start(TEST_SNAPSHOT)
    await expect(
      first.orchestrator.submit("chat", "first attempt")
    ).rejects.toThrow("transient failure")
    const failedSnapshot = first.records.values.get(
      "active-interview-session"
    )
    expect(failedSnapshot?.delivery.pending).toBeDefined()
    expect(failedSnapshot?.delivery.cursor.seeded).toBe(false)
    const firstContext = JSON.parse(firstFactory.prompts[0]).context

    const conversationId = failedSnapshot?.providerConversation.id
    expect(conversationId).toBeDefined()
    const resumedFactory = new FakeProviderFactory(
      new Set([conversationId as string])
    )
    resumedFactory.queued.push(
      {
        selection: {
          provider: "codex",
          model: "gpt-5.4",
          responseMode: "fast",
          effort: "low"
        },
        events: [
          { type: "text-delta", sequence: 1, text: "accepted retry" },
          { type: "completed", sequence: 2 }
        ]
      },
      {
        selection: {
          provider: "codex",
          model: "gpt-5.4",
          responseMode: "fast",
          effort: "low"
        },
        events: [
          { type: "text-delta", sequence: 1, text: "delta turn" },
          { type: "completed", sequence: 2 }
        ]
      }
    )
    const resumed = createTestOrchestrator(resumedFactory, first.records)
    await resumed.orchestrator.inspectRecovery()
    await resumed.orchestrator.resume()
    await resumed.orchestrator.submit("chat", "retry after crash")
    expect(JSON.parse(resumedFactory.prompts[0]).context).toEqual(firstContext)
    const acceptedDelivery = resumed.records.values.get(
      "active-interview-session"
    )?.delivery
    expect(acceptedDelivery).toMatchObject({
      cursor: { seeded: true }
    })
    expect(acceptedDelivery).not.toHaveProperty("pending")

    await resumed.orchestrator.submit("chat", "next turn")
    expect(JSON.parse(resumedFactory.prompts[1]).context).toEqual({
      kind: "delta",
      items: [],
      evidence: []
    })
  })

  it("retains and replays byte-exact pending context after cancellation", async () => {
    await withTempDirectory(async (fixtureRoot) => {
      const paths = new StoragePaths(fixtureRoot)
      const keys = {
        get: async () => Buffer.alloc(32, 0xb4)
      }
      const encryptedRecords = new EncryptedRecordRepository<
        M04ActiveSnapshot | ResetArchive
      >(paths, keys, undefined, "b04-cancel-replay")
      const repository = new ActiveSessionRepository(encryptedRecords)
      let tick = 0
      const buildOrchestrator = (
        providerFactory: ProviderConversationFactory
      ) =>
        new InterviewOrchestrator({
          providerFactory,
          repository,
          id: deterministicIds(),
          now: () =>
            `2026-07-30T13:00:${String(tick++).padStart(2, "0")}Z`
        })

      const cancellingFactory = new PendingCancellationFactory()
      const first = buildOrchestrator(cancellingFactory)
      await first.command({ type: "start", snapshot: TEST_SNAPSHOT })
      const submission = first.command({
        type: "submit",
        route: "mode-action",
        input: "cancel after durable prepare",
        sectionIds: ["answer"]
      })
      await cancellingFactory.started

      const requestId = currentActive(first.current()).requests[0].id
      const beforeCancel = await repository.load()
      const pendingBeforeCancel = beforeCancel?.delivery.pending
      expect(pendingBeforeCancel).toBeDefined()
      expect(beforeCancel?.delivery.cursor.seeded).toBe(false)
      const pendingBytes = JSON.stringify(pendingBeforeCancel?.packet)
      const firstProviderContext = JSON.stringify(
        JSON.parse(cancellingFactory.prompts[0]).context
      )
      expect(firstProviderContext).toBe(pendingBytes)

      const persistedFiles = await readTree(fixtureRoot)
      expect(
        [...persistedFiles.keys()].some((file) => file.endsWith(".enc"))
      ).toBe(true)
      for (const bytes of persistedFiles.values()) {
        expect(bytes.includes(Buffer.from(pendingBytes))).toBe(false)
        expect(
          bytes.includes(Buffer.from(Buffer.from(pendingBytes).toString("base64")))
        ).toBe(false)
        expect(
          bytes.includes(Buffer.from(Buffer.from(pendingBytes).toString("hex")))
        ).toBe(false)
      }

      const cancellation = first.command({
        type: "cancel",
        requestId
      })
      expect(await submission).toMatchObject({ ok: true })
      expect(await cancellation).toMatchObject({ ok: true })
      const cancelled = await repository.load()
      expect(JSON.stringify(cancelled?.delivery.pending?.packet)).toBe(
        pendingBytes
      )
      expect(cancelled?.delivery.pending?.attemptId).toBe(
        pendingBeforeCancel?.attemptId
      )
      expect(cancelled?.delivery.cursor.seeded).toBe(false)

      const conversationId = cancelled?.providerConversation.id
      if (!conversationId) throw new Error("Expected persisted conversation")
      const resumedFactory = new FakeProviderFactory(
        new Set([conversationId])
      )
      resumedFactory.queued.push({
        selection,
        events: [
          {
            type: "typed-payload",
            sequence: 1,
            payload: {
              kind: "structured",
              sections: [{ id: "answer", body: "accepted after cancellation" }]
            }
          },
          { type: "completed", sequence: 2 }
        ]
      })
      const resumed = buildOrchestrator(resumedFactory)
      await resumed.inspectRecovery()
      await resumed.resume()
      await resumed.continue(requestId)

      expect(
        JSON.stringify(JSON.parse(resumedFactory.prompts[0]).context)
      ).toBe(pendingBytes)
      const accepted = await repository.load()
      expect(accepted?.delivery.cursor).toEqual(
        pendingBeforeCancel?.cursorAfter
      )
      expect(accepted?.delivery).not.toHaveProperty("pending")
    })
  })
})
