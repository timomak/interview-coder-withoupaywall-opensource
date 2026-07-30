import type { ProviderSession } from "../providers"
import type {
  ProviderEvent,
  ProviderSelection,
  ProviderTurnResult
} from "../../src/shared/provider"
import type {
  RepositoryScanResult,
  RecordRepository
} from "../storage"
import type {
  ActiveInterviewSession,
  InterviewSession,
  StartSnapshot
} from "../../src/shared/interview"
import {
  createIdleInterviewSession,
  reduceInterviewSession
} from "../../src/domain/interview"
import {
  InterviewOrchestrator,
  ProviderConversationFactory
} from "./InterviewOrchestrator"
import {
  ActiveSessionRepository,
  M04ActiveSnapshot
} from "./sessionRepository"

export const TEST_SNAPSHOT: StartSnapshot = {
  mode: "system-design",
  provider: "codex",
  model: "gpt-5.4",
  responseMode: "fast",
  language: "typescript",
  context: [
    {
      id: "instructions",
      category: "instructions",
      revision: 1,
      content: "Answer at Staff level"
    },
    {
      id: "profile",
      category: "profile",
      revision: 1,
      content: "PROFILE_SECRET"
    },
    {
      id: "opportunity",
      category: "opportunity",
      revision: 1,
      content: "OPPORTUNITY_SECRET"
    }
  ]
}

export class MemoryRecordRepository<T extends object>
  implements RecordRepository<T>
{
  readonly values = new Map<string, T>()

  async put(id: string, record: T): Promise<void> {
    this.values.set(id, structuredClone(record))
  }

  async get(id: string): Promise<T | undefined> {
    const value = this.values.get(id)
    return value === undefined ? undefined : structuredClone(value)
  }

  async remove(id: string): Promise<void> {
    this.values.delete(id)
  }

  async all(): Promise<RepositoryScanResult<T>> {
    return {
      records: [...this.values].map(([id, value]) => ({
        id,
        value: structuredClone(value)
      })),
      issues: []
    }
  }

  async search(): Promise<ReadonlyArray<{ id: string; value: T }>> {
    return (await this.all()).records
  }
}

const selection: Readonly<ProviderSelection> = Object.freeze({
  provider: "codex",
  model: "gpt-5.4",
  responseMode: "fast",
  effort: "low"
})

export class FakeProviderFactory implements ProviderConversationFactory {
  readonly conversationIds: string[] = []
  readonly resumeIds: string[] = []
  readonly prompts: string[] = []
  readonly signals: Array<AbortSignal | undefined> = []
  readonly queued: ProviderTurnResult[] = []
  readonly nativeConversations: Set<string>

  constructor(nativeConversations = new Set<string>()) {
    this.nativeConversations = nativeConversations
  }

  create(
    _snapshot: StartSnapshot,
    opaqueProviderConversationId: string
  ): ProviderSession {
    this.conversationIds.push(opaqueProviderConversationId)
    this.nativeConversations.add(opaqueProviderConversationId)
    return this.session(opaqueProviderConversationId)
  }

  resume(
    _snapshot: StartSnapshot,
    opaqueProviderConversationId: string
  ): ProviderSession {
    if (!this.nativeConversations.has(opaqueProviderConversationId)) {
      throw new Error("Cannot resume a nonexistent provider conversation")
    }
    this.conversationIds.push(opaqueProviderConversationId)
    this.resumeIds.push(opaqueProviderConversationId)
    return this.session(opaqueProviderConversationId)
  }

  private session(opaqueProviderConversationId: string): ProviderSession {
    return {
      selection,
      conversationId: () => opaqueProviderConversationId,
      runTurn: async (prompt, signal, onEvent) => {
        this.prompts.push(prompt)
        this.signals.push(signal)
        const result =
          this.queued.shift() ?? {
            selection,
            events: [
              { type: "text-delta", sequence: 1, text: "best effort" },
              { type: "completed", sequence: 2 }
            ]
          }
        for (const event of result.events) {
          await onEvent?.(event as ProviderEvent)
        }
        return result
      }
    }
  }
}

let deterministicIdNamespace = 0

export function deterministicIds(): () => string {
  const namespace = ++deterministicIdNamespace
  let sequence = 0
  return () =>
    `test-opaque-id-${String(namespace).padStart(4, "0")}-${String(
      ++sequence
    ).padStart(4, "0")}`
}

interface TestOrchestratorFixture<T extends ProviderConversationFactory> {
  orchestrator: InterviewOrchestrator
  providerFactory: T
  records: MemoryRecordRepository<M04ActiveSnapshot>
}

function buildTestOrchestrator<T extends ProviderConversationFactory>(
  providerFactory: T,
  records = new MemoryRecordRepository<M04ActiveSnapshot>()
): TestOrchestratorFixture<T> {
  let tick = 0
  const orchestrator = new InterviewOrchestrator({
    providerFactory,
    repository: new ActiveSessionRepository(records),
    id: deterministicIds(),
    now: () => `2026-07-30T12:00:${String(tick++).padStart(2, "0")}Z`
  })
  return { orchestrator, providerFactory, records }
}

export function createTestOrchestrator(
  providerFactory = new FakeProviderFactory(),
  records = new MemoryRecordRepository<M04ActiveSnapshot>()
): TestOrchestratorFixture<FakeProviderFactory> {
  return buildTestOrchestrator(providerFactory, records)
}

export function createTestOrchestratorWithFactory<
  T extends ProviderConversationFactory
>(
  providerFactory: T,
  records = new MemoryRecordRepository<M04ActiveSnapshot>()
): TestOrchestratorFixture<T> {
  return buildTestOrchestrator(providerFactory, records)
}

export function startedSession(
  snapshot: StartSnapshot = TEST_SNAPSHOT
): ActiveInterviewSession {
  const initial = createIdleInterviewSession(
    { language: snapshot.language },
    ["dossier-1"]
  )
  const result = reduceInterviewSession(initial, {
    type: "start",
    eventId: "event-start",
    sessionId: "session-0001",
    sequence: 1,
    at: "2026-07-30T12:00:00Z",
    snapshot
  })
  if (!result.accepted || result.state.lifecycle !== "active") {
    throw new Error("Test session failed to start")
  }
  return result.state
}

type SessionEvent = Parameters<typeof reduceInterviewSession>[1]
type EventBody = SessionEvent extends infer Event
  ? Event extends SessionEvent
    ? Omit<Event, "eventId" | "sessionId" | "sequence" | "at">
    : never
  : never

export function reduceAccepted(
  state: ActiveInterviewSession,
  body: EventBody
): ActiveInterviewSession {
  const result = reduceInterviewSession(state, {
    ...body,
    eventId: `event-${state.sequence + 1}`,
    sessionId: state.sessionId,
    sequence: state.sequence + 1,
    at: `2026-07-30T12:00:${String(state.sequence + 1).padStart(2, "0")}Z`
  } as Parameters<typeof reduceInterviewSession>[1])
  if (!result.accepted || result.state.lifecycle !== "active") {
    throw new Error(`Test event rejected: ${result.reason}`)
  }
  return result.state
}

export function currentActive(state: InterviewSession): ActiveInterviewSession {
  if (state.lifecycle !== "active") throw new Error("Expected active state")
  return state
}
