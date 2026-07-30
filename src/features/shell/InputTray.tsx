import type { EvidenceArtifact } from "../../shared/interview"

export interface InputTrayProps {
  readonly artifacts: readonly EvidenceArtifact[]
  readonly onSelectionChange: (artifactId: string, selected: boolean) => void
}

export function InputTray({
  artifacts,
  onSelectionChange
}: InputTrayProps) {
  const pending = artifacts.filter((artifact) => !artifact.submitted)
  const screenshots = pending.filter((artifact) => artifact.kind === "screenshot")
  const transcript = [...pending]
    .reverse()
    .find((artifact) => artifact.kind === "transcript")

  if (pending.length === 0) return null

  return (
    <details className="quiet-input-tray" data-interactive>
      <summary>
        Camera {screenshots.length}
        {transcript ? <span>{transcript.content}</span> : null}
      </summary>
      <div className="quiet-artifacts" aria-label="Pending interview evidence">
        {pending.map((artifact) => (
          <label key={artifact.id} className="quiet-artifact">
            <input
              type="checkbox"
              checked={artifact.selected}
              onChange={(event) =>
                onSelectionChange(artifact.id, event.target.checked)
              }
            />
            <span>{artifact.kind === "screenshot" ? "Screenshot" : artifact.content}</span>
          </label>
        ))}
      </div>
    </details>
  )
}
