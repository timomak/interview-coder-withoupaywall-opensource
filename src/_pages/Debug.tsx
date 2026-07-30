import type { ActiveInterviewSession } from "../shared/interview"

export default function Debug({
  session
}: {
  readonly session: ActiveInterviewSession
}) {
  return (
    <section>
      <h1>Session diagnostics</h1>
      <p>Sequence {session.sequence}</p>
      <p>{session.requests.length} provider requests</p>
    </section>
  )
}
