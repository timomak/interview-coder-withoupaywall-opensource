import { useEffect, useState } from "react"
import type { CaptureScope, CaptureVerificationState } from "../../../electron/privacy/verificationRecord"
import type { LiveProcedureSession } from "../../../electron/qualification/liveProcedure"
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
  readonly begin?: (scope: CaptureScope) => Promise<LiveProcedureSession>
  readonly sample?: (markerFrame: number, controlFrame: number) => Promise<void>
  readonly acknowledge?: (receipt: { pairingChallenge: string; observerId: string; receivedPresentation: true }) => Promise<void>
  readonly complete?: () => Promise<unknown>
}

export function MeetVerification({ state, begin, sample, acknowledge, complete }: MeetVerificationProps) {
  const [scope, setScope] = useState<CaptureScope>("entire-display")
  const [session, setSession] = useState<LiveProcedureSession>()
  const [frame, setFrame] = useState(0)
  const [remaining, setRemaining] = useState(120)
  const [observerId, setObserverId] = useState("")
  const [observerChallenge, setObserverChallenge] = useState("")
  const [observerConfirmed, setObserverConfirmed] = useState(false)
  const [verificationState, setVerificationState] = useState<CaptureVerificationState>(state ?? "Not verified")
  const [diagnosticPreview, setDiagnosticPreview] = useState<DiagnosticPreview>()

  useEffect(() => {
    if (state) setVerificationState(state)
    else void window.electronAPI.getCaptureVerificationState().then(setVerificationState)
  }, [state])

  useEffect(() => {
    if (!session) return
    const started = Date.now()
    let markerFrame = 0
    const timer = window.setInterval(() => {
      const next = markerFrame++
      setFrame(next)
      setRemaining(Math.max(0, 120 - Math.floor((Date.now() - started) / 1000)))
      void (sample ?? window.electronAPI.sampleMeetQualification)(next, Math.floor(next / 2))
    }, 250)
    return () => window.clearInterval(timer)
  }, [sample, session])

  const start = async () => {
    const active = await (begin ?? window.electronAPI.beginMeetQualification)(scope)
    setSession(active)
    setFrame(0)
    setRemaining(120)
    setObserverConfirmed(false)
  }

  const confirmObserver = async () => {
    if (!session) return
    await (acknowledge ?? window.electronAPI.acknowledgeMeetObserver)({
      pairingChallenge: observerChallenge,
      observerId,
      receivedPresentation: true
    })
    setObserverConfirmed(true)
  }

  const colors = ["#FF00FF", "#00FFFF", "#A6FF00", "#000000"]
  const positions = ["top-left", "top-right", "bottom-right", "bottom-left"]
  const markerPosition = positions[Math.floor(frame / 60) % positions.length]

  return (
    <section aria-labelledby="privacy-capture-heading" className="space-y-3">
      <h3 id="privacy-capture-heading" className="font-medium">Privacy &amp; Capture</h3>
      <p>Google Meet verification: {verificationState}</p>
      <p className="text-xs text-white/60">Verification is specific to the exact app, macOS, Chrome, Meet, display, architecture, and share scope. A local preview never counts as a pass.</p>
      <fieldset>
        <legend>Share scope</legend>
        {(["entire-display", "specific-window"] as const).map((value) => (
          <label key={value} className="mr-3 inline-flex gap-2">
            <input type="radio" checked={scope === value} disabled={Boolean(session)} onChange={() => setScope(value)} />
            {value === "entire-display" ? "Entire display" : "Specific window"}
          </label>
        ))}
      </fieldset>
      <button type="button" disabled={Boolean(session)} onClick={() => void start()}>Begin guided check</button>
      {session ? (
        <>
          <ol>{PROCEDURE[scope].map((step) => <li key={step}>{step}</li>)}</ol>
          <p>Continuous observation remaining: {remaining} seconds</p>
          <code aria-label="one-time remote pairing challenge">{session.pairingChallenge}</code>
          <div aria-label="Qualification Control" data-seed={session.seed} data-cadence-hz="2" data-grid-size="8">
            Qualification Control — frame {Math.floor(frame / 2)} — 8 × 8 checker
          </div>
          <div
            aria-label="moving qualification marker"
            data-algorithm="ic-marker-quadrants-v1"
            data-cadence-hz="4"
            data-size-pixels="256"
            data-position={markerPosition}
            style={{ width: 256, height: 256, backgroundColor: colors[frame % colors.length] }}
          >{session.seed.slice(0, 12)} / {frame}</div>
          <label>Remote observer identity<input value={observerId} onChange={(event) => setObserverId(event.target.value)} /></label>
          <label>Returned one-time challenge<input value={observerChallenge} onChange={(event) => setObserverChallenge(event.target.value)} /></label>
          <button type="button" onClick={() => void confirmObserver()}>Validate remote observer receipt</button>
          <button
            type="button"
            disabled={!observerConfirmed || remaining !== 0}
            onClick={() => void (complete ?? window.electronAPI.completeMeetQualification)()}
          >Finalize immutable raw collection</button>
        </>
      ) : null}
      <p className="text-xs text-white/60">Browser-tab sharing and other meeting apps are outside the qualified scope.</p>
      <div>
        <button type="button" onClick={() => void window.electronAPI.previewDiagnostics().then(setDiagnosticPreview)}>Preview redacted diagnostics</button>
        {diagnosticPreview ? (
          <>
            <pre aria-label="redacted diagnostic preview">{JSON.stringify(diagnosticPreview, null, 2)}</pre>
            <button type="button" onClick={() => void window.electronAPI.exportDiagnostics(diagnosticPreview).then((exported) => { if (exported) setDiagnosticPreview(undefined) })}>Export this preview</button>
          </>
        ) : null}
      </div>
    </section>
  )
}
