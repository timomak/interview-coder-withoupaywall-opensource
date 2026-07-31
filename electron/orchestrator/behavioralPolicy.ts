import type { ActiveInterviewSession } from "../../src/shared/interview"
import { BEHAVIORAL_SECTIONS } from "../../src/features/behavioral/types"

export function buildBehavioralRequest(
  session: ActiveInterviewSession,
  requestId: string,
  input: string,
  sectionIds: readonly string[] = BEHAVIORAL_SECTIONS,
  syntheticEnabled = session.snapshot.context.some(
    (item) => item.id === "synthetic-story-policy"
  )
) {
  return {
    route: "behavioral" as const,
    requestId,
    sectionIds,
    input,
    context: session.snapshot.context.filter(
      (item) =>
        item.category === "instructions" ||
        item.category === "transcript" ||
        item.category === "profile" ||
        item.category === "opportunity"
    ),
    synthetic: {
      enabled: syntheticEnabled,
      requiredLabel: "synthetic-draft"
    },
    contract: {
      oneFactObject: true,
      absentMetricRemainsQualitative: true,
      unsupportedRealStory: "honest-absence",
      practiceFeedback: false,
      tools: [] as const
    }
  }
}
