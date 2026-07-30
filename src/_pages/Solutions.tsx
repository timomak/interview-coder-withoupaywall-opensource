import type { ActiveInterviewSession } from "../shared/interview"

export default function Solutions({
  session
}: {
  readonly session: ActiveInterviewSession
}) {
  return (
    <section>
      {session.sections.map((section) => (
        <article key={section.id}>
          <h2>{section.id}</h2>
          <pre>{section.body}</pre>
        </article>
      ))}
    </section>
  )
}
