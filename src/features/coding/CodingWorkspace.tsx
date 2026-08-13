import type { ResponseSection } from "../../shared/interview"
import { CodePanel } from "./CodePanel"

export interface CodingWorkspaceProps {
  readonly sections: readonly ResponseSection[]
  readonly onCodeAction: (
    action: "copy" | "regenerate" | "explain"
  ) => void
}

export function CodingWorkspace({
  sections,
  onCodeAction
}: CodingWorkspaceProps) {
  // Latest section with content wins so an in-flight request's empty
  // placeholder sections never blank out the previous answer.
  const section = (id: string) =>
    [...sections]
      .reverse()
      .find(
        (candidate) =>
          (candidate.id === id || candidate.id.startsWith(`${id}-`)) &&
          candidate.body.length > 0
      )

  return (
    <section className="quiet-coding-workspace" aria-label="Coding workspace">
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
        .filter(
          (candidate) =>
            candidate.id.startsWith("fix-") && candidate.body.length > 0
        )
        .map((candidate) => (
          <article key={candidate.id} aria-label={`Fix ${candidate.id.slice(4)}`}>
            <h2>Fix {candidate.id.slice(4)}</h2>
            <p>{candidate.body}</p>
          </article>
        ))}
    </section>
  )
}
