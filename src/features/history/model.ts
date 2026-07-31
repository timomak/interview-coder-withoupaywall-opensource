import type { ResetArchive } from "../../shared/interview"
import {
  HISTORY_MIGRATION,
  HISTORY_SCHEMA_VERSION,
  type HistoryArchiveV1,
  type HistorySummaryV1
} from "./types"

const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/

export function projectHistoryArchive(archive: ResetArchive): HistoryArchiveV1 {
  if (
    archive.session.lifecycle !== "active" ||
    archive.session.captureActive !== false ||
    !Number.isFinite(Date.parse(archive.sealedAt))
  ) {
    throw new Error("History source archive is invalid")
  }
  const screenshots = archive.session.artifacts
    .filter((artifact) => artifact.kind === "screenshot")
    .map((artifact) => {
      const match = PNG_DATA_URL.exec(artifact.content)
      if (!match) throw new Error("Archived screenshot is not a PNG")
      const bytes = Buffer.from(match[1], "base64")
      if (bytes.length === 0) {
        bytes.fill(0)
        throw new Error("Archived screenshot is empty")
      }
      bytes.fill(0)
      return {
        id: artifact.id,
        contentType: "image/png" as const,
        dataUrl: artifact.content
      }
    })
  const sourceSession = archive.session
  const session = {
    schemaVersion: sourceSession.schemaVersion,
    lifecycle: sourceSession.lifecycle,
    sessionId: sourceSession.sessionId,
    sequence: sourceSession.sequence,
    seenEventIds: structuredClone(sourceSession.seenEventIds),
    startedAt: sourceSession.startedAt,
    preferences: structuredClone(sourceSession.preferences),
    reusableRecordIds: structuredClone(sourceSession.reusableRecordIds),
    snapshot: structuredClone(sourceSession.snapshot),
    contextPhase: sourceSession.contextPhase,
    ...(sourceSession.contextIssue === undefined ? {} : { contextIssue: sourceSession.contextIssue }),
    ...(sourceSession.lastSuccessfulContextUpdate === undefined
      ? {}
      : { lastSuccessfulContextUpdate: sourceSession.lastSuccessfulContextUpdate }),
    ...(sourceSession.providerUsage === undefined
      ? {}
      : { providerUsage: structuredClone(sourceSession.providerUsage) }),
    ...(sourceSession.providerCompaction === undefined
      ? {}
      : { providerCompaction: structuredClone(sourceSession.providerCompaction) }),
    artifacts: sourceSession.artifacts
      .filter((artifact) => artifact.kind === "transcript" || artifact.kind === "screenshot")
      .map((artifact) => ({
        id: artifact.id,
        kind: artifact.kind,
        finalizedAt: artifact.finalizedAt,
        content: artifact.content,
        selected: artifact.selected,
        submitted: artifact.submitted,
        ...(artifact.codingBranchId === undefined ? {} : { codingBranchId: artifact.codingBranchId })
      })),
    acceptedArtifactIds: structuredClone(sourceSession.acceptedArtifactIds),
    sections: structuredClone(sourceSession.sections),
    requests: structuredClone(sourceSession.requests),
    compactExchanges: structuredClone(sourceSession.compactExchanges),
    captureActive: sourceSession.captureActive,
    audio: {
      schemaVersion: sourceSession.audio.schemaVersion,
      ...(sourceSession.audio.sessionId === undefined ? {} : { sessionId: sourceSession.audio.sessionId }),
      status: sourceSession.audio.status,
      sources: structuredClone(sourceSession.audio.sources),
      segments: structuredClone(sourceSession.audio.segments),
      ...(sourceSession.audio.pendingQuestion === undefined
        ? {}
        : { pendingQuestion: structuredClone(sourceSession.audio.pendingQuestion) }),
      transcriptionPath: sourceSession.audio.transcriptionPath
    },
    ...(sourceSession.codingQuestions === undefined
      ? {}
      : { codingQuestions: structuredClone(sourceSession.codingQuestions) })
  }
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    migration: HISTORY_MIGRATION,
    recordType: "archive-projection",
    sessionId: archive.session.sessionId,
    startedAt: archive.session.startedAt,
    sealedAt: archive.sealedAt,
    mode: archive.session.snapshot.mode,
    provider: archive.session.snapshot.provider,
    model: archive.session.snapshot.model,
    responseMode: archive.session.snapshot.responseMode,
    language: archive.session.snapshot.language,
    session,
    screenshots,
    source: { sealedAt: archive.sealedAt, session },
    extensions: {}
  }
}
export function summarizeHistory(value: HistoryArchiveV1): HistorySummaryV1 {
  const question =
    value.session.audio.pendingQuestion?.text ??
    value.session.codingQuestions?.branches.at(-1)?.question ??
    value.session.compactExchanges.at(-1)?.prompt ??
    `${value.mode} interview`
  const searchText = [
    value.mode,
    value.provider,
    value.model,
    value.language,
    value.session.snapshot.template?.name ?? "",
    ...value.session.snapshot.context.map((item) => item.content),
    ...value.session.audio.segments.map((segment) => segment.text),
    ...value.session.sections.map((section) => section.body),
    ...value.session.compactExchanges.flatMap((exchange) => [
      exchange.prompt,
      exchange.answer
    ]),
    ...value.session.codingQuestions?.branches.map((branch) => branch.question) ?? []
  ]
    .join("\n")
    .normalize("NFC")
    .toLocaleLowerCase("en-US")
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    migration: HISTORY_MIGRATION,
    recordType: "summary",
    sessionId: value.sessionId,
    startedAt: value.startedAt,
    sealedAt: value.sealedAt,
    mode: value.mode,
    provider: value.provider,
    model: value.model,
    title: question.slice(0, 160),
    searchText
  }
}

export function isHistoryArchive(value: unknown): value is HistoryArchiveV1 {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Partial<HistoryArchiveV1>
  return (
    candidate.schemaVersion === HISTORY_SCHEMA_VERSION &&
    candidate.migration === HISTORY_MIGRATION &&
    candidate.recordType === "archive-projection" &&
    typeof candidate.sessionId === "string" &&
    candidate.session?.lifecycle === "active" &&
    candidate.session.captureActive === false &&
    Array.isArray(candidate.screenshots)
  )
}
