import { useState } from "react"
import type { ResponseSection } from "../../shared/interview"
import { BEHAVIORAL_SECTIONS } from "./types"
import type { BehavioralFactView, BehavioralStory } from "./types"
import { fullAnswerFacts } from "./facts"

function factObject(body: string | undefined): {
  readonly story: BehavioralStory
  readonly view: BehavioralFactView
} | null {
  if (!body) return null
  try {
    const value = JSON.parse(body) as Record<string, unknown>
    return value.format === "behavioral-fact-view-v1" &&
      typeof value.story === "object" &&
      typeof value.view === "object"
      ? (value as unknown as {
          readonly story: BehavioralStory
          readonly view: BehavioralFactView
        })
      : null
  } catch {
    return null
  }
}

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
  const facts = factObject(selected[0]?.body)
  const synthetic = facts?.story.status === "synthetic-draft"
  const bodies = facts
    ? [
        facts.view.talkingPoints.join("\n"),
        [
          `Situation: ${facts.view.star.situation.join(" ")}`,
          `Task: ${facts.view.star.task.join(" ")}`,
          `Action: ${facts.view.star.action.join(" ")}`,
          `Result: ${facts.view.star.result.join(" ")}`
        ].join("\n"),
        facts.view.evidenceClaimIds.join(", "),
        facts.view.followUps.join("\n")
      ]
    : selected.map((section) => section?.body ?? "Preparing…")
  return (
    <section aria-label="Behavioral live response">
      {synthetic ? <strong>Synthetic draft</strong> : null}
      {BEHAVIORAL_SECTIONS.map((id, index) => (
        <article key={id} aria-label={id}>
          <h2>{id}</h2>
          <p>{bodies[index]}</p>
        </article>
      ))}
      <button type="button" onClick={() => setFullAnswer((value) => !value)}>
        {fullAnswer ? "Hide Full Answer" : "Show Full Answer"}
      </button>
      {fullAnswer ? (
        <article aria-label="Full Answer">
          {facts
            ? fullAnswerFacts(facts.view, facts.story).join(" ")
            : selected
                .filter(
                  (section): section is ResponseSection => Boolean(section)
                )
                .map((section) => section.body)
                .join(" ")}
        </article>
      ) : null}
    </section>
  )
}
