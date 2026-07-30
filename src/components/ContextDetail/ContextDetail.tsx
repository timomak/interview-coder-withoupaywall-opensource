import { selectContextDetail } from "../../domain/interview"
import type { ActiveInterviewSession } from "../../shared/interview"

export function ContextDetail({
  session
}: {
  readonly session: ActiveInterviewSession
}) {
  const detail = selectContextDetail(session)
  return (
    <details className="mt-4 rounded border border-white/10 p-3">
      <summary>{detail.label}</summary>
      <dl className="mt-2 grid grid-cols-2 gap-1 text-sm text-white/70">
        <dt>Provider / model</dt>
        <dd>{detail.provider} / {detail.model}</dd>
        <dt>Mode</dt>
        <dd>{detail.mode}</dd>
        <dt>Last synchronized</dt>
        <dd>{detail.lastSuccessfulUpdate ?? "Not yet"}</dd>
        <dt>Personal context</dt>
        <dd>{detail.personalContext}</dd>
        {Object.entries(detail.sourceCounts).map(([category, count]) => (
          <div className="contents" key={category}>
            <dt>{category}</dt>
            <dd>{count}</dd>
          </div>
        ))}
        {detail.usage ? (
          <>
            <dt>Provider-reported usage</dt>
            <dd>
              {detail.usage.inputTokens} in / {detail.usage.outputTokens} out
            </dd>
          </>
        ) : null}
        {detail.compaction ? (
          <>
            <dt>Provider-reported compaction</dt>
            <dd>{detail.compaction.reason}</dd>
          </>
        ) : null}
      </dl>
    </details>
  )
}
