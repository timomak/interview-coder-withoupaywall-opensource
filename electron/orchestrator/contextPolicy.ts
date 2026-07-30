import {
  ActiveInterviewSession,
  ContextCategory,
  ContextItem,
  EvidenceArtifact
} from "../../src/shared/interview"

export interface ContextPacket {
  readonly kind: "seed" | "delta"
  readonly items: readonly ContextItem[]
  readonly evidence: readonly Pick<
    EvidenceArtifact,
    "id" | "kind" | "content"
  >[]
}

export interface DeliveryCursor {
  readonly seeded: boolean
  readonly itemRevisions: Readonly<Record<string, number>>
  readonly evidenceIds: readonly string[]
}

export interface PendingContextDelivery {
  readonly attemptId: string
  readonly packet: ContextPacket
  readonly cursorAfter: DeliveryCursor
}

export interface DeliveryState {
  readonly cursor: DeliveryCursor
  readonly pending?: PendingContextDelivery
}

const CATEGORY_ORDER: Readonly<Record<ContextCategory, number>> = {
  instructions: 0,
  transcript: 1,
  screenshot: 2,
  profile: 3,
  opportunity: 4
}

function applicable(
  session: ActiveInterviewSession,
  items: readonly ContextItem[]
): readonly ContextItem[] {
  if (session.snapshot.mode !== "coding") return items
  return items.filter(
    (item) => item.category !== "profile" && item.category !== "opportunity"
  )
}

export function emptyDeliveryState(): DeliveryState {
  return {
    cursor: {
      seeded: false,
      itemRevisions: {},
      evidenceIds: []
    }
  }
}

function packetFor(
  session: ActiveInterviewSession,
  cursor: DeliveryCursor,
  currentContext: readonly ContextItem[]
): { packet: ContextPacket; cursorAfter: DeliveryCursor } {
  const items = applicable(session, currentContext)
    .filter(
      (item) =>
        !cursor.seeded ||
        (cursor.itemRevisions[item.id] ?? -1) < item.revision
    )
    .map((item, inputOrder) => ({ item, inputOrder }))
    .sort(
      (left, right) =>
        CATEGORY_ORDER[left.item.category] -
          CATEGORY_ORDER[right.item.category] ||
        left.inputOrder - right.inputOrder
    )
    .map(({ item }) => item)
  const deliveredEvidence = new Set(cursor.evidenceIds)
  const evidence = session.artifacts
    .filter(
      (artifact) => artifact.submitted && !deliveredEvidence.has(artifact.id)
    )
    .map(({ id, kind, content }) => ({ id, kind, content }))
  return {
    packet: {
      kind: cursor.seeded ? "delta" : "seed",
      items,
      evidence
    },
    cursorAfter: {
      seeded: true,
      itemRevisions: {
        ...cursor.itemRevisions,
        ...Object.fromEntries(items.map((item) => [item.id, item.revision]))
      },
      evidenceIds: [
        ...cursor.evidenceIds,
        ...evidence
          .map((artifact) => artifact.id)
          .filter((id) => !deliveredEvidence.has(id))
      ]
    }
  }
}

export class OrderedContextPolicy {
  private state: DeliveryState

  constructor(state: DeliveryState = emptyDeliveryState()) {
    this.state = structuredClone(state)
  }

  prepare(
    session: ActiveInterviewSession,
    attemptId: string,
    currentContext: readonly ContextItem[] = session.snapshot.context
  ): PendingContextDelivery {
    if (this.state.pending) return structuredClone(this.state.pending)
    const prepared = packetFor(session, this.state.cursor, currentContext)
    const pending = {
      attemptId,
      packet: prepared.packet,
      cursorAfter: prepared.cursorAfter
    }
    this.state = { ...this.state, pending }
    return structuredClone(pending)
  }

  commit(attemptId: string): void {
    if (!this.state.pending || this.state.pending.attemptId !== attemptId) {
      throw new Error("Context delivery attempt is not current")
    }
    this.state = { cursor: this.state.pending.cursorAfter }
  }

  snapshot(): DeliveryState {
    return structuredClone(this.state)
  }
}

export function serializeContextPacket(packet: ContextPacket): string {
  return JSON.stringify(packet)
}
