import { useState } from "react"
import type { ResponseSection } from "../../shared/interview"
import { BEHAVIORAL_SECTIONS } from "./types"

export function BehavioralResponseWorkspace({
  sections
}: {
  readonly sections: readonly ResponseSection[]
}) {
  const [fullAnswer, setFullAnswer] = useState(false)
  const selected = BEHAVIORAL_SECTIONS.map((id) =>
    [...sections]
      .reverse()
      .find((section) => section.id === id || section.id.startsWith(`${id}-`))
  )
  const synthetic = selected.some((section) =>
    section?.body.includes("synthetic-draft")
  )
  return (
    <section aria-label="Behavioral live response">
      {synthetic ? <strong>Synthetic draft</strong> : null}
      {BEHAVIORAL_SECTIONS.map((id, index) => (
        <article key={id} aria-label={id}>
          <h2>{id}</h2>
          <p>{selected[index]?.body ?? "Preparing…"}</p>
        </article>
      ))}
      <button type="button" onClick={() => setFullAnswer((value) => !value)}>
        {fullAnswer ? "Hide Full Answer" : "Show Full Answer"}
      </button>
      {fullAnswer ? (
        <article aria-label="Full Answer">
          {selected
            .filter((section): section is ResponseSection => Boolean(section))
            .map((section) => section.body)
            .join(" ")}
        </article>
      ) : null}
    </section>
  )
}
