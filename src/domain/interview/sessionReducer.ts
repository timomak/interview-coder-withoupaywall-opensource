import {
  ActiveInterviewSession,
  EvidenceArtifact,
  IdleInterviewSession,
  InterviewSession,
  InterviewSessionEvent,
  ResponseRequest,
  ResponseSection
} from "../../shared/interview"

export type RejectionReason =
  | "duplicate-event"
  | "stale-event"
  | "out-of-order-event"
  | "cross-session-event"
  | "invalid-transition"

export interface ReducerResult {
  readonly state: InterviewSession
  readonly accepted: boolean
  readonly reason?: RejectionReason
}

export function createIdleInterviewSession(
  preferences: Readonly<Record<string, string>> = {},
  reusableRecordIds: readonly string[] = []
): IdleInterviewSession {
  return {
    schemaVersion: 1,
    lifecycle: "idle",
    preferences: { ...preferences },
    reusableRecordIds: [...reusableRecordIds]
  }
}

function reject(
  state: InterviewSession,
  reason: RejectionReason
): ReducerResult {
  return { state, accepted: false, reason }
}

function validateEnvelope(
  state: ActiveInterviewSession,
  event: InterviewSessionEvent
): RejectionReason | undefined {
  if (event.sessionId !== state.sessionId) return "cross-session-event"
  if (state.seenEventIds.includes(event.eventId)) return "duplicate-event"
  if (event.sequence <= state.sequence) return "stale-event"
  if (event.sequence !== state.sequence + 1) return "out-of-order-event"
  if (event.type === "start") return "invalid-transition"
  return undefined
}

function advance<T extends ActiveInterviewSession>(
  state: T,
  event: InterviewSessionEvent,
  update: Partial<ActiveInterviewSession>
): ActiveInterviewSession {
  return {
    ...state,
    ...update,
    sequence: event.sequence,
    seenEventIds: [...state.seenEventIds, event.eventId]
  }
}

function updateArtifact(
  artifacts: readonly EvidenceArtifact[],
  artifactId: string,
  update: Partial<EvidenceArtifact>
): readonly EvidenceArtifact[] {
  return artifacts.map((artifact) =>
    artifact.id === artifactId ? { ...artifact, ...update } : artifact
  )
}

function updateRequestCompletion(
  requests: readonly ResponseRequest[],
  sections: readonly ResponseSection[],
  requestId: string
): readonly ResponseRequest[] {
  return requests.map((request) => {
    if (request.id !== requestId) return request
    const completed = request.sectionIds.every((sectionId) =>
      sections.some(
        (section) => section.id === sectionId && section.state === "complete"
      )
    )
    return completed === request.completed ? request : { ...request, completed }
  })
}

function activeReduction(
  state: ActiveInterviewSession,
  event: InterviewSessionEvent
): ReducerResult {
  const envelopeError = validateEnvelope(state, event)
  if (envelopeError) return reject(state, envelopeError)

  switch (event.type) {
    case "context-update-started":
      return {
        accepted: true,
        state: advance(state, event, {
          contextPhase: "updating",
          contextIssue: undefined
        })
      }
    case "context-update-succeeded":
      return {
        accepted: true,
        state: advance(state, event, {
          contextPhase: "full",
          contextIssue: undefined,
          lastSuccessfulContextUpdate: event.at,
          providerUsage: event.usage ?? state.providerUsage,
          providerCompaction: event.compaction ?? state.providerCompaction
        })
      }
    case "context-update-failed":
      return {
        accepted: true,
        state: advance(state, event, {
          contextPhase: "issue",
          contextIssue: event.detail
        })
      }
    case "artifact-staged": {
      if (state.artifacts.some((artifact) => artifact.id === event.artifact.id)) {
        return reject(state, "invalid-transition")
      }
      return {
        accepted: true,
        state: advance(state, event, {
          artifacts: [
            ...state.artifacts,
            { ...event.artifact, selected: true, submitted: false }
          ]
        })
      }
    }
    case "artifact-selection-changed": {
      const artifact = state.artifacts.find(
        (candidate) => candidate.id === event.artifactId
      )
      if (!artifact || artifact.submitted) {
        return reject(state, "invalid-transition")
      }
      return {
        accepted: true,
        state: advance(state, event, {
          artifacts: updateArtifact(state.artifacts, event.artifactId, {
            selected: event.selected
          })
        })
      }
    }
    case "artifacts-submitted": {
      const uniqueIds = [...new Set(event.artifactIds)]
      if (
        uniqueIds.length === 0 ||
        uniqueIds.length !== event.artifactIds.length ||
        uniqueIds.some((artifactId) => {
          const artifact = state.artifacts.find(
            (candidate) => candidate.id === artifactId
          )
          return !artifact || !artifact.selected || artifact.submitted
        })
      ) {
        return reject(state, "invalid-transition")
      }
      const acceptedArtifactIds = [
        ...state.acceptedArtifactIds,
        ...uniqueIds.filter(
          (artifactId) => !state.acceptedArtifactIds.includes(artifactId)
        )
      ]
      return {
        accepted: true,
        state: advance(state, event, {
          acceptedArtifactIds,
          artifacts: state.artifacts.map((artifact) =>
            uniqueIds.includes(artifact.id)
              ? { ...artifact, selected: false, submitted: true }
              : artifact
          )
        })
      }
    }
    case "request-started": {
      const sectionIds = [...new Set(event.sectionIds)]
      if (
        !event.requestId ||
        sectionIds.length === 0 ||
        sectionIds.length !== event.sectionIds.length ||
        state.requests.some((request) => request.id === event.requestId)
      ) {
        return reject(state, "invalid-transition")
      }
      const existing = new Set(state.sections.map((section) => section.id))
      if (sectionIds.some((sectionId) => existing.has(sectionId))) {
        return reject(state, "invalid-transition")
      }
      const offset = state.sections.length
      return {
        accepted: true,
        state: advance(state, event, {
          requests: [
            ...state.requests,
            {
              id: event.requestId,
              sectionIds,
              cancelled: false,
              completed: false
            }
          ],
          sections: [
            ...state.sections,
            ...sectionIds.map((id, index) => ({
              id,
              order: offset + index,
              body: "",
              state: "partial" as const
            }))
          ]
        })
      }
    }
    case "section-delta": {
      const request = state.requests.find(
        (candidate) => candidate.id === event.requestId
      )
      const section = state.sections.find(
        (candidate) => candidate.id === event.sectionId
      )
      if (
        !request ||
        request.cancelled ||
        !request.sectionIds.includes(event.sectionId) ||
        !section ||
        section.state === "complete" ||
        event.delta.length === 0
      ) {
        return reject(state, "invalid-transition")
      }
      const sections = state.sections.map((candidate) =>
        candidate.id === event.sectionId
          ? {
              ...candidate,
              body: `${candidate.body}${event.delta}`,
              state: event.complete ? ("complete" as const) : candidate.state
            }
          : candidate
      )
      return {
        accepted: true,
        state: advance(state, event, {
          sections,
          requests: updateRequestCompletion(
            state.requests,
            sections,
            event.requestId
          )
        })
      }
    }
    case "request-cancelled": {
      const request = state.requests.find(
        (candidate) => candidate.id === event.requestId
      )
      if (!request || request.cancelled || request.completed) {
        return reject(state, "invalid-transition")
      }
      return {
        accepted: true,
        state: advance(state, event, {
          requests: state.requests.map((candidate) =>
            candidate.id === event.requestId
              ? { ...candidate, cancelled: true }
              : candidate
          )
        })
      }
    }
    case "request-continued": {
      const request = state.requests.find(
        (candidate) => candidate.id === event.requestId
      )
      if (!request || !request.cancelled || request.completed) {
        return reject(state, "invalid-transition")
      }
      const unfinished = request.sectionIds.filter(
        (sectionId) =>
          state.sections.find((section) => section.id === sectionId)?.state !==
          "complete"
      )
      if (
        unfinished.length !== event.unfinishedSectionIds.length ||
        unfinished.some(
          (sectionId, index) => event.unfinishedSectionIds[index] !== sectionId
        )
      ) {
        return reject(state, "invalid-transition")
      }
      return {
        accepted: true,
        state: advance(state, event, {
          requests: state.requests.map((candidate) =>
            candidate.id === event.requestId
              ? { ...candidate, cancelled: false }
              : candidate
          )
        })
      }
    }
    case "compact-exchange-added":
      if (
        state.compactExchanges.some(
          (exchange) => exchange.id === event.exchange.id
        )
      ) {
        return reject(state, "invalid-transition")
      }
      return {
        accepted: true,
        state: advance(state, event, {
          compactExchanges: [...state.compactExchanges, event.exchange]
        })
      }
    case "sections-corrected": {
      const changed = [...new Set(event.changedSectionIds)]
      if (
        changed.length === 0 ||
        changed.length !== event.changedSectionIds.length ||
        changed.some(
          (sectionId) =>
            !state.sections.some((section) => section.id === sectionId) ||
            typeof event.replacements[sectionId] !== "string"
        ) ||
        Object.keys(event.replacements).some(
          (sectionId) => !changed.includes(sectionId)
        )
      ) {
        return reject(state, "invalid-transition")
      }
      return {
        accepted: true,
        state: advance(state, event, {
          sections: state.sections.map((section) =>
            changed.includes(section.id)
              ? { ...section, body: event.replacements[section.id] }
              : section
          )
        })
      }
    }
    case "capture-state-changed":
      return {
        accepted: true,
        state: advance(state, event, { captureActive: event.active })
      }
    case "reset": {
      const archivedSession = advance(state, event, {
        captureActive: false
      })
      return {
        accepted: true,
        state: {
          schemaVersion: 1,
          lifecycle: "idle",
          preferences: state.preferences,
          reusableRecordIds: state.reusableRecordIds,
          lastArchive: {
            sealedAt: event.at,
            session: archivedSession
          }
        }
      }
    }
    case "start":
      return reject(state, "invalid-transition")
    default: {
      const exhaustive: never = event
      return exhaustive
    }
  }
}

export function reduceInterviewSession(
  state: InterviewSession,
  event: InterviewSessionEvent
): ReducerResult {
  if (state.lifecycle === "active") return activeReduction(state, event)
  if (event.type !== "start") return reject(state, "invalid-transition")
  if (event.sequence !== 1) {
    return reject(
      state,
      event.sequence < 1 ? "stale-event" : "out-of-order-event"
    )
  }
  const context =
    event.snapshot.mode === "coding"
      ? event.snapshot.context.filter(
          (item) =>
            item.category !== "profile" && item.category !== "opportunity"
        )
      : [...event.snapshot.context]
  return {
    accepted: true,
    state: {
      schemaVersion: 1,
      lifecycle: "active",
      sessionId: event.sessionId,
      sequence: 1,
      seenEventIds: [event.eventId],
      startedAt: event.at,
      preferences: state.preferences,
      reusableRecordIds: state.reusableRecordIds,
      snapshot: {
        ...event.snapshot,
        context: context.map((item) => ({ ...item }))
      },
      contextPhase: "new",
      artifacts: [],
      acceptedArtifactIds: [],
      sections: [],
      requests: [],
      compactExchanges: [],
      captureActive: false
    }
  }
}
