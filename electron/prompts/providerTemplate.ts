import type { ActiveInterviewSession } from "../../src/shared/interview"

export function providerTemplateEnvelope(session: ActiveInterviewSession) {
  const template = session.snapshot.template
  if (!template) return undefined
  return {
    role: "untrusted-user-template" as const,
    mode: template.mode,
    modeSchema: template.modeSchema,
    instructions: template.instructions,
    resolution: template.resolution,
    protectedAuthority: {
      modeLocked: true,
      responseSchemaLocked: true,
      providerModelEffortLocked: true,
      noFallback: true,
      tools: [] as const,
      contextRoutingLocked: true,
      screenshotAuthorityLocked: true,
      factualSyntheticBoundaryLocked: true
    }
  }
}
