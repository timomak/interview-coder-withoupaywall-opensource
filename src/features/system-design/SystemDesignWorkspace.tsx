import type { ResponseSection } from "../../shared/interview"
import { ArchitectureView } from "./ArchitectureView"
import { validateArchitectureGraph } from "./architectureSchema"
import type { ArchitectureGraph } from "./types"
import { SYSTEM_DESIGN_SECTIONS } from "./types"

export interface SystemDesignWorkspaceProps {
  readonly sections: readonly ResponseSection[]
  readonly onRegenerateArchitecture?: () => void
  readonly onDeepenEstimates?: () => void
}

function graphFromBody(body: string): ArchitectureGraph | undefined {
  try {
    const graph = JSON.parse(body) as ArchitectureGraph
    return validateArchitectureGraph(graph).length === 0 ? graph : undefined
  } catch {
    return undefined
  }
}

export function SystemDesignWorkspace({
  sections,
  onRegenerateArchitecture = () => undefined,
  onDeepenEstimates = () => undefined
}: SystemDesignWorkspaceProps) {
  return (
    <section aria-label="System Design workspace">
      {SYSTEM_DESIGN_SECTIONS.map((sectionId) => {
        const section = [...sections]
          .reverse()
          .find(
            (candidate) =>
              candidate.id === sectionId ||
              candidate.id.startsWith(`${sectionId}-`)
          )
        return (
          <article
            key={sectionId}
            aria-label={sectionId}
            aria-busy={section?.state === "partial"}
          >
            <h2>{sectionId}</h2>
            {sectionId === "architecture" &&
            section &&
            graphFromBody(section.body) ? (
              <ArchitectureView
                graph={graphFromBody(section.body)!}
                onRegenerate={onRegenerateArchitecture}
              />
            ) : (
              <p>{section?.body ?? "Preparing…"}</p>
            )}
            {sectionId === "estimate" ? (
              <button type="button" onClick={onDeepenEstimates}>
                Deepen estimates
              </button>
            ) : null}
          </article>
        )
      })}
    </section>
  )
}
