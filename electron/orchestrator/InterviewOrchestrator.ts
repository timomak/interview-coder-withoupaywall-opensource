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
  deriveBestEffortDecision,
  parseProviderPayload
} from "./responseRouting"
import { ActiveSessionRepository, M04ActiveSnapshot } from "./sessionRepository"
import {
  buildCodingProviderRequest,
  parseCodingFixCard,
  validateCodingSections
} from "./codingPolicy"
import {
  applySystemDesignFollowup,
  buildSystemDesignRequest,
  validateSystemDesignSection
} from "./systemDesignPolicy"
import {
  isCodingIntent,
  sectionsForCodingIntent,
  type CodingIntent
} from "../../src/features/coding/types"
import { SYSTEM_DESIGN_SECTIONS } from "../../src/features/system-design/types"
import { BEHAVIORAL_SECTIONS } from "../../src/features/behavioral/types"
import {
  admitBehavioralPayload,
  behavioralFactBody,
  buildBehavioralRequest,
  parseBehavioralProviderPayload
} from "./behavioralPolicy"
import type { BehavioralStory } from "../../src/features/behavioral/types"

export interface ProviderConversationFactory {
  create(
    snapshot: StartSnapshot,
    requestedConversationId: string
  ): ProviderSession
  resume(snapshot: StartSnapshot, conversationId: string): ProviderSession
}

export interface InterviewOrchestratorOptions {
  readonly providerFactory: ProviderConversationFactory
  readonly repository: ActiveSessionRepository
  readonly authorizeStart?: (snapshot: StartSnapshot) => Promise<boolean>
  readonly now?: () => string
  readonly id?: () => string
  readonly onState?: (state: InterviewSession) => void
  readonly saveSyntheticStory?: (story: BehavioralStory) => Promise<void>
}

interface ActiveRuntime {
  provider: ProviderSession
  providerConversation: M04ActiveSnapshot["providerConversation"]
  contextPolicy: OrderedContextPolicy
}

interface ActiveTurn {
  readonly controller: AbortController
  readonly generation: number
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

function acceptedCompletion(events: readonly ProviderEvent[]): boolean {
  return (
    events.some((event) => event.type === "completed") &&
    !events.some((event) => event.type === "error")
  )
}

function availableSectionIds(
  session: ActiveInterviewSession,
  requested: readonly string[]
): readonly string[] {
  const existing = new Set(session.sections.map((section) => section.id))
  if (requested.every((sectionId) => !existing.has(sectionId))) {
    return requested
  }
  let version = 2
  while (true) {
    const versioned = requested.map((sectionId) => `${sectionId}-${version}`)
    if (versioned.every((sectionId) => !existing.has(sectionId))) {
      return versioned
    }
    version += 1
  }
}

function validFixSection(sectionId: string, body: string): boolean {
  if (!/^fix-[1-9]\d*$/.test(sectionId)) return false
  try {
    const card = parseCodingFixCard(JSON.parse(body))
    return card?.version === Number(sectionId.slice("fix-".length))
  } catch {
    return false
  }
}

export class InterviewOrchestrator {
  private state: InterviewSession = createIdleInterviewSession()
  private runtime?: ActiveRuntime
  private recovery?: M04ActiveSnapshot
  private readonly turns = new Map<string, ActiveTurn>()
  private generation = 0
  private commandTail: Promise<void> = Promise.resolve()
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

  command(command: InterviewCommand): Promise<CommandResult> {
    if (command.type === "cancel") {
      this.turns.get(command.requestId)?.controller.abort()
    } else if (command.type === "reset") {
      this.generation += 1
      for (const turn of this.turns.values()) turn.controller.abort()
    }
    const operation = this.commandTail.then(() => this.executeCommand(command))
    this.commandTail = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  private async executeCommand(
    command: InterviewCommand
  ): Promise<CommandResult> {
    try {
      switch (command.type) {
        case "start":
          await this.start(command.snapshot)
          break
        case "stage-artifact":
          await this.stageArtifact(command.artifact)
          break
        case "select-artifact":
          await this.selectArtifact(command.artifactId, command.selected)
          break
        case "submit":
          await this.submit(
            command.route,
            command.input,
            command.sectionIds,
            command.codingIntent,
            command.artifactIds
          )
          break
        case "cancel":
          await this.finishCancel(command.requestId)
          break
        case "continue":
          await this.continue(command.requestId)
          break
        case "reset":
          await this.finishReset()
          break
        case "resume":
          await this.resume()
          break
        case "new-coding-question":
          await this.newCodingQuestion(command.question)
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
    if (
      this.options.authorizeStart &&
      !(await this.options.authorizeStart(snapshot))
    ) {
      throw new Error("Selected provider subscription is not ready")
    }
    const sessionId = this.id()
    const requestedConversationId = this.id()
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
    const runtime: ActiveRuntime = {
      provider: this.options.providerFactory.create(
        result.state.snapshot,
        requestedConversationId
      ),
      providerConversation: {
        mode: "create",
        id: requestedConversationId
      },
      contextPolicy: new OrderedContextPolicy()
    }
    await this.persistState(result.state, runtime)
    this.runtime = runtime
    this.state = result.state
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

  async newCodingQuestion(question: string): Promise<void> {
    const session = active(this.state)
    if (session.snapshot.mode !== "coding" || !session.codingQuestions) {
      throw new Error("New Question is available only in Coding mode")
    }
    const normalizedQuestion = question.trim()
    if (!normalizedQuestion) {
      throw new Error("New Question requires the next problem statement")
    }
    await this.dispatch({
      type: "coding-question-started",
      branchId: this.id(),
      question: normalizedQuestion
    })
  }

  async submit(
    route: Extract<InterviewCommand, { type: "submit" }>["route"],
    input: string,
    requestedSectionIds?: readonly string[],
    codingIntent?: CodingIntent,
    requestedArtifactIds?: readonly string[]
  ): Promise<void> {
    const session = active(this.state)
    if (session.snapshot.mode === "coding" && route === "mode-action") {
      if (!isCodingIntent(codingIntent)) {
        throw new Error("Coding requests require an explicit supported intent")
      }
    } else if (codingIntent !== undefined || requestedArtifactIds !== undefined) {
      throw new Error("Coding-only submission fields crossed a mode boundary")
    }
    const selectedPending = session.artifacts.filter(
      (artifact) => artifact.selected && !artifact.submitted
    )
    const pending = requestedArtifactIds
      ? [...requestedArtifactIds]
      : selectedPending.map((artifact) => artifact.id)
    if (
      new Set(pending).size !== pending.length ||
      pending.some(
        (artifactId) =>
          !selectedPending.some((artifact) => artifact.id === artifactId)
      )
    ) {
      throw new Error("Submission evidence is not selected and pending")
    }
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
    const proposedSectionIds =
      requestedSectionIds && requestedSectionIds.length > 0
        ? [...requestedSectionIds]
        : session.snapshot.mode === "coding" &&
            route === "mode-action" &&
            codingIntent
          ? [...sectionsForCodingIntent(codingIntent)]
        : session.snapshot.mode === "system-design" &&
            route === "mode-action"
          ? [...SYSTEM_DESIGN_SECTIONS]
        : session.snapshot.mode === "behavioral" &&
            route === "mode-action"
          ? [...BEHAVIORAL_SECTIONS]
        : route === "correction"
          ? active(this.state).sections.map((section) => section.id)
          : ["answer"]
    const sectionIds =
      session.snapshot.mode === "coding" && route === "mode-action"
        ? availableSectionIds(session, proposedSectionIds)
        : proposedSectionIds
    if (
      session.snapshot.mode === "system-design" &&
      route === "mode-action" &&
      SYSTEM_DESIGN_SECTIONS.every((sectionId) =>
        session.sections.some(
          (section) =>
            section.id === sectionId &&
            section.state === "complete" &&
            section.body.length > 0
        )
      )
    ) {
      await this.runSystemDesignFollowup(input)
      return
    }
    if (
      session.snapshot.mode === "coding" &&
      route === "mode-action" &&
      session.codingQuestions
    ) {
      const currentBranch = session.codingQuestions.branches.find(
        (branch) => branch.id === session.codingQuestions?.currentBranchId
      )
      if (currentBranch && currentBranch.question.trim().length === 0) {
        await this.dispatch({
          type: "coding-question-defined",
          branchId: currentBranch.id,
          question: input
        })
      }
    }
    const requestId = this.id()
    if (route !== "correction") {
      await this.dispatch({
        type: "request-started",
        requestId,
        sectionIds
      })
    }
    await this.runStructuredTurn(
      requestId,
      route,
      input,
      sectionIds,
      codingIntent,
      requestedArtifactIds
    )
  }

  async cancel(requestId: string): Promise<void> {
    this.turns.get(requestId)?.controller.abort()
    await this.finishCancel(requestId)
  }

  private async finishCancel(requestId: string): Promise<void> {
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
    this.generation += 1
    for (const turn of this.turns.values()) turn.controller.abort()
    await this.finishReset()
  }

  private async finishReset(): Promise<void> {
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
    if (this.turns.size > 0) {
      throw new Error("Provider cancellation has not settled")
    }
    const session = active(this.state)
    const result = reduceInterviewSession(this.state, {
      type: "reset",
      eventId: this.id(),
      sessionId: session.sessionId,
      sequence: session.sequence + 1,
      at: this.now()
    })
    if (
      !result.accepted ||
      result.state.lifecycle !== "idle" ||
      !result.state.lastArchive
    ) {
      throw new Error("Reset did not produce an archive")
    }
    await this.options.repository.archive(result.state.lastArchive)
    this.state = result.state
    this.runtime = undefined
    this.recovery = undefined
    this.publish()
  }

  async resume(): Promise<void> {
    const snapshot = this.recovery ?? (await this.options.repository.load())
    if (!snapshot) throw new Error("No recoverable interview exists")
    const recovered = {
      ...snapshot.session,
      captureActive: false
    } as ActiveInterviewSession
    const provider =
      snapshot.providerConversation.mode === "resume"
        ? this.options.providerFactory.resume(
            recovered.snapshot,
            snapshot.providerConversation.id
          )
        : this.options.providerFactory.create(
            recovered.snapshot,
            snapshot.providerConversation.id
          )
    const runtime: ActiveRuntime = {
      provider,
      providerConversation: structuredClone(snapshot.providerConversation),
      contextPolicy: new OrderedContextPolicy(snapshot.delivery)
    }
    await this.persistState(recovered, runtime)
    this.state = recovered
    this.runtime = runtime
    this.recovery = undefined
    this.publish()
  }

  private async runCompactTurn(
    route: "chat" | "clarification",
    input: string
  ): Promise<void> {
    const runtime = this.requireRuntime()
    const turnId = this.id()
    const turn = this.beginTurn(turnId)
    try {
      const attempt = await this.prepareContext(runtime)
      const result = await runtime.provider.runTurn(
        JSON.stringify({
          route,
          input,
          context: JSON.parse(serializeContextPacket(attempt.packet)),
          response: "compact"
        }),
        turn.controller.signal,
        async () => this.acceptProviderEvent(runtime, turn)
      )
      if (!this.isCurrent(turn)) return
      const failure = providerFailure(result.events)
      if (!acceptedCompletion(result.events)) {
        if (turn.controller.signal.aborted) {
          await this.contextFailed("Provider turn cancelled")
          return
        }
        await this.contextFailed(failure ?? "Provider did not accept the turn")
        throw new Error(failure ?? "Provider did not accept the turn")
      }
      await this.commitContext(runtime, attempt.attemptId, result.events)
      await this.dispatch({
        type: "compact-exchange-added",
        exchange: {
          id: this.id(),
          prompt: input,
          answer: providerText(result.events)
        }
      })
    } finally {
      this.turns.delete(turnId)
    }
  }

  private async runStructuredTurn(
    requestId: string,
    route: "mode-action" | "correction",
    input: string,
    sectionIds: readonly string[],
    codingIntent?: CodingIntent,
    evidenceArtifactIds?: readonly string[]
  ): Promise<void> {
    const runtime = this.requireRuntime()
    const turn = this.beginTurn(requestId)
    const correctionPayloads: ReturnType<typeof parseProviderPayload>[] = []
    let sectionEventObserved = false
    const typedModeSectionIds = new Set<string>()
    let syntheticStoryToSave: BehavioralStory | undefined
    try {
      const attempt = await this.prepareContext(runtime)
      const bestEffort = deriveBestEffortDecision(active(this.state), input)
      const session = active(this.state)
      const request =
        session.snapshot.mode === "coding" && route === "mode-action"
          ? buildCodingProviderRequest({
              session,
              intent: codingIntent,
              requestId,
              input,
              evidenceArtifactIds,
              sectionIds
            })
          : session.snapshot.mode === "system-design" &&
              route === "mode-action"
            ? buildSystemDesignRequest(
                session,
                requestId,
                input,
                bestEffort,
                sectionIds,
                JSON.parse(serializeContextPacket(attempt.packet))
              )
          : session.snapshot.mode === "behavioral" &&
              route === "mode-action"
            ? buildBehavioralRequest(
                session,
                requestId,
                input,
                sectionIds
              )
          : {
              route,
              requestId,
              sectionIds,
              input,
              context: JSON.parse(serializeContextPacket(attempt.packet)),
              evidenceAuthority: resolveEvidenceAuthority(
                session.artifacts
              ).authority,
              bestEffort
            }
      const result = await runtime.provider.runTurn(
        JSON.stringify(request),
        turn.controller.signal,
        async (event) => {
          await this.acceptProviderEvent(runtime, turn)
          if (!this.isCurrent(turn) || turn.controller.signal.aborted) return
          if (
            event.type === "text-delta" &&
            route !== "correction" &&
            !codingIntent &&
            session.snapshot.mode !== "system-design" &&
            session.snapshot.mode !== "behavioral"
          ) {
            const sectionId = sectionIds[0]
            if (sectionId && event.text.length > 0) {
              sectionEventObserved = true
              await this.dispatch({
                type: "section-delta",
                requestId,
                sectionId,
                delta: event.text,
                complete: false
              })
            }
          }
          if (event.type !== "typed-payload") return
          if (
            session.snapshot.mode === "behavioral" &&
            route === "mode-action"
          ) {
            const behavioral = parseBehavioralProviderPayload(event.payload)
            if (!behavioral) {
              throw new Error("Behavioral response must use one fact object")
            }
            const admitted = admitBehavioralPayload(session, behavioral)
            if (admitted.story.status === "synthetic-draft") {
              syntheticStoryToSave = admitted.story
            }
            const body = behavioralFactBody(admitted)
            for (const sectionId of sectionIds) {
              typedModeSectionIds.add(sectionId)
              sectionEventObserved = true
              await this.dispatch({
                type: "section-delta",
                requestId,
                sectionId,
                delta: body,
                complete: true
              })
            }
            return
          }
          const payload = parseProviderPayload(event.payload)
          if (!payload) return
          correctionPayloads.push(payload)
          if (route === "correction" || payload.kind !== "structured") return
          if (codingIntent) {
            const errors = validateCodingSections(
              codingIntent,
              session.snapshot.language,
              payload.sections
            )
            if (errors.length > 0) {
              throw new Error(errors.join("; "))
            }
          }
          if (
            session.snapshot.mode === "system-design" &&
            route === "mode-action"
          ) {
            for (const section of payload.sections) {
              validateSystemDesignSection(section.id, section.body)
            }
          }
          for (const section of payload.sections) {
            if (!sectionIds.includes(section.id)) {
              throw new Error("Provider returned an undeclared section")
            }
            if (section.body.length > 0) {
              if (
                codingIntent === "debug" &&
                !validFixSection(section.id, section.body)
              ) {
                throw new Error("Coding Debug returned an invalid Fix card")
              }
              if (
                codingIntent ||
                (session.snapshot.mode === "system-design" &&
                  route === "mode-action") ||
                (session.snapshot.mode === "behavioral" &&
                  route === "mode-action")
              ) {
                typedModeSectionIds.add(section.id)
              }
              sectionEventObserved = true
              await this.dispatch({
                type: "section-delta",
                requestId,
                sectionId: section.id,
                delta: section.body,
                complete: section.complete !== false
              })
            }
          }
        }
      )
      if (!this.isCurrent(turn)) return
      const failure = providerFailure(result.events)
      if (!acceptedCompletion(result.events)) {
        if (turn.controller.signal.aborted) {
          await this.contextFailed("Provider turn cancelled")
          return
        }
        await this.contextFailed(failure ?? "Provider did not accept the turn")
        throw new Error(failure ?? "Provider did not accept the turn")
      }
      await this.commitContext(runtime, attempt.attemptId, result.events)
      if (syntheticStoryToSave) {
        await this.options.saveSyntheticStory?.(syntheticStoryToSave)
      }
      if (route === "correction") {
        const correction = correctionPayloads.find(
          (payload) => payload?.kind === "correction"
        )
        if (!correction || correction.kind !== "correction") {
          throw new Error("Provider correction payload is invalid")
        }
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
        const impact = applyCorrection(
          active(this.state).sections,
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
      if (!sectionEventObserved) {
        throw new Error("Provider response did not contain usable output")
      }
      if (
        (codingIntent ||
          (session.snapshot.mode === "system-design" &&
            route === "mode-action") ||
          (session.snapshot.mode === "behavioral" &&
            route === "mode-action")) &&
        sectionIds.some((sectionId) => !typedModeSectionIds.has(sectionId))
      ) {
        throw new Error("Mode response did not satisfy its typed section contract")
      }
      const current = active(this.state)
      for (const sectionId of sectionIds) {
        const section = current.sections.find(
          (candidate) => candidate.id === sectionId
        )
        if (section?.state === "partial" && section.body.length > 0) {
          await this.dispatch({
            type: "section-completed",
            requestId,
            sectionId
          })
        }
      }
    } finally {
      this.turns.delete(requestId)
    }
  }

  private async runSystemDesignFollowup(input: string): Promise<void> {
    const runtime = this.requireRuntime()
    const turnId = this.id()
    const turn = this.beginTurn(turnId)
    try {
      const attempt = await this.prepareContext(runtime)
      const session = active(this.state)
      const result = await runtime.provider.runTurn(
        JSON.stringify({
          route: "system-design-followup",
          requestId: turnId,
          input,
          currentSections: session.sections
            .filter((section) =>
              SYSTEM_DESIGN_SECTIONS.includes(
                section.id as (typeof SYSTEM_DESIGN_SECTIONS)[number]
              )
            )
            .map(({ id, body }) => ({ id, body })),
          context: JSON.parse(serializeContextPacket(attempt.packet)),
          contract: {
            changedSectionsOnly: true,
            requireWhatChangedPerSection: true,
            preserveUnaffectedBytes: true,
            tools: [] as const
          }
        }),
        turn.controller.signal,
        async () => this.acceptProviderEvent(runtime, turn)
      )
      if (!this.isCurrent(turn)) return
      const failure = providerFailure(result.events)
      if (!acceptedCompletion(result.events)) {
        await this.contextFailed(
          failure ??
            (turn.controller.signal.aborted
              ? "Provider turn cancelled"
              : "Provider did not accept the turn")
        )
        if (!turn.controller.signal.aborted) {
          throw new Error(failure ?? "Provider did not accept the turn")
        }
        return
      }
      const payload = result.events
        .filter(
          (event): event is Extract<ProviderEvent, { type: "typed-payload" }> =>
            event.type === "typed-payload"
        )
        .map((event) => parseProviderPayload(event.payload))
        .find((candidate) => candidate?.kind === "system-design-followup")
      if (!payload || payload.kind !== "system-design-followup") {
        throw new Error("System Design follow-up payload is invalid")
      }
      if (
        payload.impactedSectionIds.length !== payload.sections.length ||
        payload.impactedSectionIds.length !== payload.whatChanged.length ||
        payload.impactedSectionIds.some(
          (id, index) =>
            payload.sections[index]?.id !== id ||
            !SYSTEM_DESIGN_SECTIONS.includes(
              id as (typeof SYSTEM_DESIGN_SECTIONS)[number]
            )
        )
      ) {
        throw new Error("System Design follow-up impact is incomplete")
      }
      for (const section of payload.sections) {
        validateSystemDesignSection(section.id, section.body)
      }
      const replacements = Object.fromEntries(
        payload.sections.map((section) => [section.id, section.body])
      )
      const impact = applySystemDesignFollowup(
        session.sections,
        payload.impactedSectionIds,
        replacements,
        payload.whatChanged
      )
      const changedSectionIds = payload.impactedSectionIds.filter(
        (id) => impact.before[id] !== impact.after[id]
      )
      if (changedSectionIds.length === 0) {
        throw new Error("System Design follow-up did not change a section")
      }
      await this.commitContext(runtime, attempt.attemptId, result.events)
      await this.dispatch({
        type: "sections-corrected",
        replacements: Object.fromEntries(
          changedSectionIds.map((id) => [id, replacements[id]])
        ),
        changedSectionIds
      })
      await this.dispatch({
        type: "compact-exchange-added",
        exchange: {
          id: this.id(),
          prompt: input,
          answer: `What changed: ${payload.whatChanged.join(" ")}`
        }
      })
    } finally {
      this.turns.delete(turnId)
    }
  }

  private beginTurn(turnId: string): ActiveTurn {
    if (this.turns.has(turnId)) throw new Error("Provider turn is already active")
    const turn = {
      controller: new AbortController(),
      generation: this.generation
    }
    this.turns.set(turnId, turn)
    return turn
  }

  private isCurrent(turn: ActiveTurn): boolean {
    return turn.generation === this.generation
  }

  private async prepareContext(runtime: ActiveRuntime) {
    const attempt = runtime.contextPolicy.prepare(active(this.state), this.id())
    await this.persist()
    await this.contextStarted()
    return attempt
  }

  private async acceptProviderEvent(
    runtime: ActiveRuntime,
    turn: ActiveTurn
  ): Promise<void> {
    if (!this.isCurrent(turn) || turn.controller.signal.aborted) return
    const conversationId = runtime.provider.conversationId()
    if (
      conversationId &&
      (runtime.providerConversation.mode !== "resume" ||
        runtime.providerConversation.id !== conversationId)
    ) {
      runtime.providerConversation = {
        mode: "resume",
        id: conversationId
      }
      await this.persist()
    }
  }

  private async commitContext(
    runtime: ActiveRuntime,
    attemptId: string,
    events: readonly ProviderEvent[]
  ): Promise<void> {
    const before = runtime.contextPolicy.snapshot()
    runtime.contextPolicy.commit(attemptId)
    try {
      await this.contextSucceeded(events)
    } catch (error) {
      runtime.contextPolicy = new OrderedContextPolicy(before)
      throw error
    }
  }

  private async contextStarted(): Promise<void> {
    await this.dispatch({ type: "context-update-started" })
  }

  private async contextSucceeded(
    events: readonly ProviderEvent[]
  ): Promise<void> {
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
    if (persist && result.state.lifecycle === "active") {
      await this.persistState(result.state, this.requireRuntime())
    }
    this.state = result.state
    this.publish()
  }

  private async persist(): Promise<void> {
    await this.persistState(active(this.state), this.requireRuntime())
  }

  private async persistState(
    session: ActiveInterviewSession,
    runtime: ActiveRuntime
  ): Promise<void> {
    await this.options.repository.save(
      session,
      runtime.providerConversation,
      runtime.contextPolicy.snapshot(),
      this.now()
    )
  }

  private publish(): void {
    this.options.onState?.(this.state)
  }
}
