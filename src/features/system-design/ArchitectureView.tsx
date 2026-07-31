import { useMemo, useState } from "react"
import { architectureText, validateArchitectureGraph } from "./architectureSchema"
import type { ArchitectureGraph } from "./types"

export interface ArchitectureViewProps {
  readonly graph: ArchitectureGraph
  readonly onRegenerate: () => void
}

export function ArchitectureView({
  graph,
  onRegenerate
}: ArchitectureViewProps) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState(0)
  const errors = useMemo(() => validateArchitectureGraph(graph), [graph])
  if (errors.length > 0) {
    return <p role="alert">Architecture unavailable: {errors.join("; ")}</p>
  }
  return (
    <article aria-label="Architecture diagram">
      <div role="toolbar" aria-label="Architecture interactions">
        <button type="button">Inspect</button>
        <button type="button" onClick={() => setZoom((value) => Math.min(2, value + 0.1))}>Zoom in</button>
        <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}>Zoom out</button>
        <button type="button" onClick={() => setPan((value) => value + 1)}>Pan</button>
        <button type="button" onClick={onRegenerate}>Regenerate</button>
      </div>
      <div data-zoom={zoom.toFixed(1)} data-pan={pan}>
        <pre aria-label="Accessible architecture">{architectureText(graph)}</pre>
      </div>
    </article>
  )
}
