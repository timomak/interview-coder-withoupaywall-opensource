import { randomUUID } from "node:crypto"
import type { ProviderSession } from "../providers"
import type { ProviderEvent } from "../../src/shared/provider"
import {
  ActiveInterviewSession,
  CommandResult,
  EvidenceArtifact,
  InterviewCommand,
  InterviewSession,
  InterviewSessionEvent,
  RecoveryChoice,
  StartSnapshot
} from "../../src/shared/interview"
import {
  createIdleInterviewSession,
  reduceInterviewSession
} from "../../src/domain/interview"
import { OrderedContextPolicy, serializeContextPacket } from "./contextPolicy"
import { resolveEvidenceAuthority } from "./evidence"
import {
  applyCorrection,
  bestEffortDecision,
  parseProviderPayload
} from "./responseRouting"
import { ActiveSessionRepository, M04ActiveSnapshot } from "./sessionRepository"

export interface ProviderConversationFactory {
  create(
    snapshot: StartSnapshot,
    opaqueProviderConversationId: string
  ): ProviderSession
}

export interface InterviewOrchestratorOptions {
  readonly providerFactory: ProviderConversationFactory
  readonly repository: ActiveSessionRepository
  readonly now?: () => string
  readonly id?: () => string
  readonly onState?: (state: InterviewSession) => void
}

interface ActiveRuntime {
  provider: ProviderSession
  opaqueProviderConversationId: string
  contextPolicy: OrderedContextPolicy
}

type EventBody = InterviewSessionEvent extends infer Event
  ? Event extends InterviewSessionEvent
    ? Omit<Event, "eventId" | "sessionId" | "sequence" | "at">
    : never
  : never

function active(state: InterviewSession): ActiveInterviewSession {
  if (state.lifecycle !== "active") throw new Error("No interview is active")
  return state
}

function providerText(events: readonly ProviderEvent[]): string {
  return events
    .filter(
      (event): event is Extract<ProviderEvent, { type: "text-delta" }> =>
        event.type === "text-delta"
    )
    .map((event) => event.text)
    .join("")
}

function providerFailure(events: readonly ProviderEvent[]): string | undefined {
  return events.find(
    (event): event is Extract<ProviderEvent, { type: "error" }> =>
      event.type === "error"
  )?.message
}

export class InterviewOrchestrator {
  private state: InterviewSession = createIdleInterviewSession()
  private runtime?: ActiveRuntime
  private recovery?: M04ActiveSnapshot
  private readonly controllers = new Map<string, AbortController>()
  private readonly now: () => string
  private readonly id: () => string

  constructor(private readonly options: InterviewOrchestratorOptions) {
    this.now = options.now ?? (() => new Date().toISOString())
    this.id = options.id ?? randomUUID
  }

  current(): InterviewSession {
    return this.state
  }

  async inspectRecovery(): Promise<RecoveryChoice> {
    this.recovery = await this.options.repository.load()
    return {
      available: this.recovery !== undefined,
      sessionId: this.recovery?.session.sessionId,
      captureActive: false
    }
  }

  async command(command: InterviewCommand): Promise<CommandResult> {
    try {
      switch (command.type) {
        case "start":
          await this.start(command.snapshot)
          break
        case "stage-artifact":
          await this.stageArtifact(command.artifact)
          break
        case "select-artifact":
          await this.selectArtifact(
            command.artifactId,
            command.selected
          )
          break
        case "submit":
          await this.submit(
            command.route,
            command.input,
            command.sectionIds
          )
          break
        case "cancel":
          await this.cancel(command.requestId)
          break
        case "continue":
          await this.continue(command.requestId)
          break
        case "reset":
          await this.reset()
          break
        case "resume":
          await this.resume()
          break
        default: {
          const exhaustive: never = command
          return exhaustive
        }
      }
      return { ok: true, state: this.state }
    } catch (error) {
      return {
        ok: false,
        state: this.state,
        error: error instanceof Error ? error.message : "Interview command failed"
      }
    }
  }

  async start(snapshot: StartSnapshot): Promise<void> {
    if (this.state.lifecycle !== "idle") {
      throw new Error("Reset the active interview before starting another")
    }
    const sessionId = this.id()
    const conversationId = this.id()
    const result = reduceInterviewSession(this.state, {
      type: "start",
      eventId: this.id(),
      sessionId,
      sequence: 1,
      at: this.now(),
      snapshot
    })
    if (!result.accepted || result.state.lifecycle !== "active") {
      throw new Error("Start transition was rejected")
    }
    this.state = result.state
    this.runtime = {
      provider: this.options.providerFactory.create(
        result.state.snapshot,
        conversationId
      ),
      opaqueProviderConversationId: conversationId,
      contextPolicy: new OrderedContextPolicy()
    }
    await this.persist()
    this.publish()
  }

  async stageArtifact(
    artifact: Omit<EvidenceArtifact, "selected" | "submitted">
  ): Promise<void> {
    await this.dispatch({ type: "artifact-staged", artifact })
  }

  async selectArtifact(artifactId: string, selected: boolean): Promise<void> {
    await this.dispatch({
      type: "artifact-selection-changed",
      artifactId,
      selected
    })
  }

  async submit(
    route: Extract<InterviewCommand, { type: "submit" }>["route"],
    input: string,
    requestedSectionIds?: readonly string[]
  ): Promise<void> {
    const session = active(this.state)
    const pending = session.artifacts
      .filter((artifact) => artifact.selected && !artifact.submitted)
      .map((artifact) => artifact.id)
    if (input.trim().length === 0 && pending.length === 0) {
      throw new Error("Empty submission is not allowed")
    }
    if (pending.length > 0) {
      await this.dispatch({
        type: "artifacts-submitted",
        artifactIds: pending
      })
    }
    if (route === "chat" || route === "clarification") {
      await this.runCompactTurn(route, input)
      return
    }
    const sectionIds =
      requestedSectionIds && requestedSectionIds.length > 0
        ? [...requestedSectionIds]
        : route === "correction"
          ? active(this.state).sections.map((section) => section.id)
          : ["answer"]
    const requestId = this.id()
    if (route !== "correction") {
      await this.dispatch({
        type: "request-started",
        requestId,
        sectionIds
      })
    }
    await this.runStructuredTurn(requestId, route, input, sectionIds)
  }

  async cancel(requestId: string): Promise<void> {
    this.controllers.get(requestId)?.abort()
    await this.dispatch({ type: "request-cancelled", requestId })
  }

  async continue(requestId: string): Promise<void> {
    const session = active(this.state)
    const request = session.requests.find(
      (candidate) => candidate.id === requestId
    )
    if (!request) throw new Error("Unknown request")
    const unfinished = request.sectionIds.filter(
      (sectionId) =>
        session.sections.find((section) => section.id === sectionId)?.state !==
        "complete"
    )
    await this.dispatch({
      type: "request-continued",
      requestId,
      unfinishedSectionIds: unfinished
    })
    await this.runStructuredTurn(
      requestId,
      "mode-action",
      "Continue unfinished sections",
      unfinished
    )
  }

  async reset(): Promise<void> {
    if (this.state.lifecycle !== "active") {
      if (this.recovery) {
        await this.options.repository.archive({
          sealedAt: this.now(),
          session: { ...this.recovery.session, captureActive: false }
        })
        this.recovery = undefined
      }
      return
    }
    for (const controller of this.controllers.values()) controller.abort()
    this.controllers.clear()
    await this.dispatch({ type: "reset" }, false)
    const resetState: InterviewSession = this.current()
    if (resetState.lifecycle !== "idle" || !resetState.lastArchive) {
      throw new Error("Reset did not produce an archive")
    }
    await this.options.repository.archive(resetState.lastArchive)
    this.runtime = undefined
    this.recovery = undefined
    this.publish()
  }

  async resume(): Promise<void> {
    const snapshot = this.recovery ?? (await this.options.repository.load())
    if (!snapshot) throw new Error("No recoverable interview exists")
    this.state = {
      ...snapshot.session,
      captureActive: false
    }
    const policy = new OrderedContextPolicy()
    policy.next(this.state)
    this.runtime = {
      provider: this.options.providerFactory.create(
        this.state.snapshot,
        snapshot.opaqueProviderConversationId
      ),
      opaqueProviderConversationId: snapshot.opaqueProviderConversationId,
      contextPolicy: policy
    }
    this.recovery = undefined
    await this.persist()
    this.publish()
  }

  private async runCompactTurn(
    route: "chat" | "clarification",
    input: string
  ): Promise<void> {
    const runtime = this.requireRuntime()
    await this.contextStarted()
    const packet = runtime.contextPolicy.next(active(this.state))
    const result = await runtime.provider.runTurn(
      JSON.stringify({
        route,
        input,
        context: JSON.parse(serializeContextPacket(packet)),
        response: "compact"
      })
    )
    const failure = providerFailure(result.events)
    if (failure) {
      await this.contextFailed(failure)
      throw new Error(failure)
    }
    await this.contextSucceeded(result.events)
    await this.dispatch({
      type: "compact-exchange-added",
      exchange: {
        id: this.id(),
        prompt: input,
        answer: providerText(result.events)
      }
    })
  }

  private async runStructuredTurn(
    requestId: string,
    route: "mode-action" | "correction",
    input: string,
    sectionIds: readonly string[]
  ): Promise<void> {
    const runtime = this.requireRuntime()
    const controller = new AbortController()
    this.controllers.set(requestId, controller)
    await this.contextStarted()
    const sessionBefore = active(this.state)
    const packet = runtime.contextPolicy.next(sessionBefore)
    const bestEffort = bestEffortDecision([], [], {})
    try {
      const result = await runtime.provider.runTurn(
        JSON.stringify({
          route,
          requestId,
          sectionIds,
          input,
          context: JSON.parse(serializeContextPacket(packet)),
          evidenceAuthority: resolveEvidenceAuthority(
            sessionBefore.artifacts
          ).authority,
          bestEffort
        }),
        controller.signal
      )
      const failure = providerFailure(result.events)
      if (failure) {
        if (controller.signal.aborted) return
        await this.contextFailed(failure)
        throw new Error(failure)
      }
      await this.contextSucceeded(result.events)
      const payloads = result.events
        .filter(
          (event): event is Extract<ProviderEvent, { type: "typed-payload" }> =>
            event.type === "typed-payload"
        )
        .map((event) => parseProviderPayload(event.payload))
        .filter((payload) => payload !== null)
      if (route === "correction") {
        const correction = payloads.find(
          (payload) => payload.kind === "correction"
        )
        if (!correction) throw new Error("Provider correction payload is invalid")
        if (
          correction.sections.length !== sectionIds.length ||
          sectionIds.some(
            (sectionId, index) =>
              correction.sections[index]?.id !== sectionId
          )
        ) {
          throw new Error(
            "Provider correction impact does not match the frozen section set"
          )
        }
        const replacements = Object.fromEntries(
          correction.sections.map((section) => [section.id, section.body])
        )
        const current = active(this.state)
        const impact = applyCorrection(
          current.sections,
          replacements,
          correction.sections.map((section) => section.id)
        )
        await this.dispatch({
          type: "sections-corrected",
          replacements: Object.fromEntries(
            impact.changedSectionIds.map((id) => [id, replacements[id]])
          ),
          changedSectionIds: impact.changedSectionIds
        })
        return
      }
      const structured = payloads.find(
        (payload) => payload.kind === "structured"
      )
      if (structured) {
        for (const section of structured.sections) {
          if (!sectionIds.includes(section.id)) {
            throw new Error("Provider returned an undeclared section")
          }
          await this.dispatch({
            type: "section-delta",
            requestId,
            sectionId: section.id,
            delta: section.body,
            complete: true
          })
        }
      } else {
        const text = providerText(result.events)
        if (!sectionIds[0] || text.length === 0) {
          throw new Error("Provider response did not contain usable output")
        }
        await this.dispatch({
          type: "section-delta",
          requestId,
          sectionId: sectionIds[0],
          delta: text,
          complete: true
        })
      }
    } finally {
      this.controllers.delete(requestId)
    }
  }

  private async contextStarted(): Promise<void> {
    await this.dispatch({ type: "context-update-started" })
  }

  private async contextSucceeded(events: readonly ProviderEvent[]): Promise<void> {
    const usage = events
      .filter(
        (event): event is Extract<ProviderEvent, { type: "usage" }> =>
          event.type === "usage"
      )
      .at(-1)
    const compaction = events
      .filter(
        (event): event is Extract<ProviderEvent, { type: "compaction" }> =>
          event.type === "compaction"
      )
      .at(-1)
    await this.dispatch({
      type: "context-update-succeeded",
      usage:
        usage === undefined
          ? undefined
          : {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens
            },
      compaction:
        compaction === undefined
          ? undefined
          : { reason: compaction.reason, reportedAt: this.now() }
    })
  }

  private async contextFailed(detail: string): Promise<void> {
    await this.dispatch({ type: "context-update-failed", detail })
  }

  private requireRuntime(): ActiveRuntime {
    if (!this.runtime) throw new Error("No provider conversation is active")
    return this.runtime
  }

  private async dispatch(
    body: EventBody,
    persist = true
  ): Promise<void> {
    const session = active(this.state)
    const event = {
      ...body,
      eventId: this.id(),
      sessionId: session.sessionId,
      sequence: session.sequence + 1,
      at: this.now()
    } as InterviewSessionEvent
    const result = reduceInterviewSession(this.state, event)
    if (!result.accepted) {
      throw new Error(`Interview transition rejected: ${result.reason}`)
    }
    this.state = result.state
    if (persist && this.state.lifecycle === "active") await this.persist()
    this.publish()
  }

  private async persist(): Promise<void> {
    const runtime = this.requireRuntime()
    await this.options.repository.save(
      active(this.state),
      runtime.opaqueProviderConversationId,
      this.now()
    )
  }

  private publish(): void {
    this.options.onState?.(this.state)
  }
}
