import { useEffect, useState } from "react"
import type {
  CaptureScope,
  CaptureVerificationState
} from "../../../electron/privacy/verificationRecord"
import type { DiagnosticPreview } from "../../../electron/diagnostics/DiagnosticService"

const PROCEDURE: Record<CaptureScope, readonly string[]> = {
  "entire-display": [
    "Open a new two-person Google Meet on the qualified display.",
    "Ask the remote observer to pin the received presentation.",
    "Choose Present now, then Your entire screen, and select the recorded display.",
    "Keep the moving marker visible over the control content for 120 seconds.",
    "Stop presenting only after the remote observer confirms the interval."
  ],
  "specific-window": [
    "Open a new two-person Google Meet on the qualified display.",
    "Ask the remote observer to pin the received presentation.",
    "Choose Present now, then A window, and select Qualification Control.",
    "Keep the moving marker visible over the control content for 120 seconds.",
    "Stop presenting only after the remote observer confirms the interval."
  ]
}

export interface MeetVerificationProps {
  readonly state?: CaptureVerificationState
  readonly onBegin?: (scope: CaptureScope) => void
  readonly onRemoteConfirmation?: (scope: CaptureScope) => void
}

export function MeetVerification({
  state,
  onBegin,
  onRemoteConfirmation
}: MeetVerificationProps) {
  const [scope, setScope] = useState<CaptureScope>("entire-display")
  const [started, setStarted] = useState(false)
  const [remoteConfirmed, setRemoteConfirmed] = useState(false)
  const [verificationState, setVerificationState] = useState<CaptureVerificationState>(
    state ?? "Not verified"
  )
  const [diagnosticPreview, setDiagnosticPreview] = useState<DiagnosticPreview>()

  useEffect(() => {
    if (state) {
      setVerificationState(state)
      return
    }
    void window.electronAPI.getCaptureVerificationState().then(setVerificationState)
  }, [state])

  const begin = () => {
    setStarted(true)
    setRemoteConfirmed(false)
    onBegin?.(scope)
  }

  return (
    <section aria-labelledby="privacy-capture-heading" className="space-y-3">
      <h3 id="privacy-capture-heading" className="font-medium">
        Privacy &amp; Capture
      </h3>
      <p>Google Meet verification: {verificationState}</p>
      <p className="text-xs text-white/60">
        Verification is specific to the exact app, macOS, Chrome, Meet, display,
        architecture, and share scope. A local preview never counts as a pass.
      </p>
      <fieldset>
        <legend>Share scope</legend>
        {(["entire-display", "specific-window"] as const).map((value) => (
          <label key={value} className="mr-3 inline-flex gap-2">
            <input
              type="radio"
              checked={scope === value}
              onChange={() => {
                setScope(value)
                setStarted(false)
                setRemoteConfirmed(false)
              }}
            />
            {value === "entire-display" ? "Entire display" : "Specific window"}
          </label>
        ))}
      </fieldset>
      <button type="button" onClick={begin}>Begin guided check</button>
      {started ? (
        <>
          <ol>
            {PROCEDURE[scope].map((step) => <li key={step}>{step}</li>)}
          </ol>
          <div
            aria-label="moving qualification marker"
            data-algorithm="ic-marker-quadrants-v1"
            data-cadence-hz="4"
            data-size-pixels="256"
          >
            Moving qualification marker
          </div>
          <label>
            <input
              type="checkbox"
              checked={remoteConfirmed}
              onChange={(event) => setRemoteConfirmed(event.target.checked)}
            />
            Independent remote observer confirmed the received presentation
          </label>
          <button
            type="button"
            disabled={!remoteConfirmed}
            onClick={() => onRemoteConfirmation?.(scope)}
          >
            Record remote confirmation
          </button>
        </>
      ) : null}
      <p className="text-xs text-white/60">
        Browser-tab sharing and other meeting apps are outside the qualified scope.
      </p>
      <div>
        <button
          type="button"
          onClick={() => void window.electronAPI.previewDiagnostics().then(setDiagnosticPreview)}
        >
          Preview redacted diagnostics
        </button>
        {diagnosticPreview ? (
          <>
            <pre aria-label="redacted diagnostic preview">
              {JSON.stringify(diagnosticPreview, null, 2)}
            </pre>
            <button
              type="button"
              onClick={() =>
                void window.electronAPI.exportDiagnostics(diagnosticPreview).then(
                  (exported) => {
                    if (exported) setDiagnosticPreview(undefined)
                  }
                )
              }
            >
              Export this preview
            </button>
          </>
        ) : null}
      </div>
    </section>
  )
}
