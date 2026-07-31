import type { BehavioralFactView, BehavioralStory } from "./types"
import { fullAnswerFacts } from "./facts"

export interface BehavioralWorkspaceProps {
  readonly view?: BehavioralFactView
  readonly story?: BehavioralStory
  readonly fullAnswer: boolean
  readonly onFullAnswerChange: (enabled: boolean) => void
}

export function BehavioralWorkspace({
  view,
  story,
  fullAnswer,
  onFullAnswerChange
}: BehavioralWorkspaceProps) {
  if (!view || !story) return <p>Choose a factual story to begin.</p>
  return (
    <section aria-label="Behavioral answer">
      {view.synthetic ? <strong>Synthetic draft</strong> : null}
      <article aria-label="Talking points">
        <h2>Answer</h2>
        <ul>{view.talkingPoints.map((point) => <li key={point}>{point}</li>)}</ul>
      </article>
      <article aria-label="STAR">
        <h2>STAR</h2>
        <p>{Object.values(view.star).flat().join(" ")}</p>
      </article>
      <article aria-label="Evidence">
        <h2>Evidence</h2>
        <p>{view.evidenceClaimIds.join(", ")}</p>
      </article>
      <article aria-label="Follow-ups">
        <h2>Follow-ups</h2>
        <p>{view.followUps.join(" ")}</p>
      </article>
      <button type="button" onClick={() => onFullAnswerChange(!fullAnswer)}>
        {fullAnswer ? "Hide Full Answer" : "Show Full Answer"}
      </button>
      {fullAnswer ? (
        <article aria-label="Full Answer">
          {fullAnswerFacts(view, story).join(" ")}
        </article>
      ) : null}
    </section>
  )
}
