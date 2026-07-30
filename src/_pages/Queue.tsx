import type { IdleInterviewSession } from "../shared/interview"

export default function Queue({
  session
}: {
  readonly session: IdleInterviewSession
}) {
  return (
    <section>
      <h1>Start interview</h1>
      <p>{session.reusableRecordIds.length} reusable context records available.</p>
    </section>
  )
}
