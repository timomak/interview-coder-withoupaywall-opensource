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

export class OrderedContextPolicy {
  private seeded = false
  private readonly sentRevisions = new Map<string, number>()
  private readonly sentEvidence = new Set<string>()

  next(
    session: ActiveInterviewSession,
    currentContext: readonly ContextItem[] = session.snapshot.context
  ): ContextPacket {
    const items = applicable(session, currentContext)
      .filter(
        (item) =>
          !this.seeded ||
          (this.sentRevisions.get(item.id) ?? -1) < item.revision
      )
      .map((item, inputOrder) => ({ item, inputOrder }))
      .sort(
        (left, right) =>
          CATEGORY_ORDER[left.item.category] -
            CATEGORY_ORDER[right.item.category] ||
          left.inputOrder - right.inputOrder
      )
      .map(({ item }) => item)
    const evidence = session.artifacts
      .filter(
        (artifact) =>
          artifact.submitted && !this.sentEvidence.has(artifact.id)
      )
      .map(({ id, kind, content }) => ({ id, kind, content }))

    const kind = this.seeded ? "delta" : "seed"
    for (const item of items) this.sentRevisions.set(item.id, item.revision)
    for (const artifact of evidence) this.sentEvidence.add(artifact.id)
    this.seeded = true
    return { kind, items, evidence }
  }
}

export function serializeContextPacket(packet: ContextPacket): string {
  return JSON.stringify(packet)
}
