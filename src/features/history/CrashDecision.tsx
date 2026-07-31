import type { RecoveryChoice } from "../../shared/interview"

export function CrashDecision({
  recovery,
  onResume,
  onReset
}: {
  readonly recovery: RecoveryChoice
  readonly onResume: () => void
  readonly onReset: () => void
}) {
  if (!recovery.available) return null
  return (
    <section aria-label="Interview recovery" className="my-4 rounded border border-amber-400/30 p-3">
      <p>Previous interview found. Capture remains off.</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={onResume}>Resume</button>
        <button type="button" onClick={onReset}>Reset</button>
      </div>
    </section>
  )
}
