import type { ResponseSection } from "../../shared/interview"
import { CODING_INTENT_LABELS, type CodingIntent } from "./types"
import { CodePanel } from "./CodePanel"

const CAPTURE_INTENTS = ["analyze", "generate-code"] as const

export interface CodingWorkspaceProps {
  readonly intent: CodingIntent
  readonly sections: readonly ResponseSection[]
  readonly onIntentChange: (intent: CodingIntent) => void
  readonly onCodeAction: (
    action: "copy" | "regenerate" | "explain"
  ) => void
}

export function CodingWorkspace({
  intent,
  sections,
  onIntentChange,
  onCodeAction
}: CodingWorkspaceProps) {
  const section = (id: string) =>
    [...sections]
      .reverse()
      .find(
        (candidate) =>
          candidate.id === id || candidate.id.startsWith(`${id}-`)
      )

  return (
    <section className="quiet-coding-workspace" aria-label="Coding workspace">
      <div className="quiet-coding-toolbar" role="group" aria-label="Coding intent">
        {CAPTURE_INTENTS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            data-interactive
            aria-pressed={intent === candidate}
            onClick={() => onIntentChange(candidate)}
          >
            {CODING_INTENT_LABELS[candidate]}
          </button>
        ))}
      </div>
      {section("answer") ? (
        <article aria-label="Answer">
          <h2>Answer</h2>
          <p>{section("answer")?.body}</p>
        </article>
      ) : null}
      {section("plan") ? (
        <article aria-label="Plan">
          <h2>Plan</h2>
          <p>{section("plan")?.body}</p>
        </article>
      ) : null}
      {section("code") ? (
        <CodePanel code={section("code")?.body ?? ""} onAction={onCodeAction} />
      ) : null}
      {section("explain") ? (
        <article aria-label="Explain">
          <h2>Explain</h2>
          <p>{section("explain")?.body}</p>
        </article>
      ) : null}
      {sections
        .filter((candidate) => candidate.id.startsWith("fix-"))
        .map((candidate) => (
          <article key={candidate.id} aria-label={`Fix ${candidate.id.slice(4)}`}>
            <h2>Fix {candidate.id.slice(4)}</h2>
            <p>{candidate.body}</p>
          </article>
        ))}
    </section>
  )
}
