import { useRef, type RefObject } from "react"
import type { InterviewMode, InterviewSession } from "../../shared/interview"

const MODES: readonly { value: InterviewMode; label: string }[] = [
  { value: "coding", label: "Coding" },
  { value: "system-design", label: "System Design" },
  { value: "behavioral", label: "Behavioral" }
]

export interface CommandRailProps {
  readonly session: InterviewSession
  readonly mode: InterviewMode
  readonly onModeChange: (mode: InterviewMode) => void
  readonly onStart: () => void
  readonly onRecord: () => void
  readonly onScreenshot: () => void
  readonly onChat: () => void
  readonly onSubmit: () => void
  readonly onHotKeys: () => void
  readonly onReset: () => void
  readonly onWorkspace: () => void
  readonly hotKeysButtonRef?: RefObject<HTMLButtonElement>
  readonly contextLabel: string
  readonly canSubmit: boolean
  readonly recordLabel?: "Record" | "Pause"
  readonly recordPressed?: boolean
  readonly recordDisabled?: boolean
  readonly recordDescription?: string
}

export function CommandRail({
  session,
  mode,
  onModeChange,
  onStart,
  onRecord,
  onScreenshot,
  onChat,
  onSubmit,
  onHotKeys,
  onReset,
  onWorkspace,
  hotKeysButtonRef,
  contextLabel,
  canSubmit,
  recordLabel = "Record",
  recordPressed = false,
  recordDisabled = false,
  recordDescription = "Start or resume microphone and system audio"
}: CommandRailProps) {
  const modeButtons = useRef<Array<HTMLButtonElement | null>>([])

  const moveMode = (currentIndex: number, direction: -1 | 1) => {
    const nextIndex = (currentIndex + direction + MODES.length) % MODES.length
    onModeChange(MODES[nextIndex].value)
    modeButtons.current[nextIndex]?.focus()
  }

  return (
    <header className="quiet-rail" data-interactive>
      <div className="quiet-drag-pill" data-drag-root aria-label="Move InterviewCopilot">
        <span className="quiet-brand">InterviewCopilot</span>
        {session.lifecycle === "active" ? (
          <span className={`quiet-mode quiet-mode-${session.snapshot.mode}`}>
            {MODES.find(({ value }) => value === session.snapshot.mode)?.label}
          </span>
        ) : null}
      </div>

      {session.lifecycle === "idle" ? (
        <>
          <div className="quiet-mode-selector" role="radiogroup" aria-label="Interview mode">
            {MODES.map((candidate, index) => (
              <button
                key={candidate.value}
                ref={(button) => {
                  modeButtons.current[index] = button
                }}
                type="button"
                role="radio"
                aria-checked={mode === candidate.value}
                className={`quiet-mode-button quiet-mode-${candidate.value}`}
                data-interactive
                onClick={() => onModeChange(candidate.value)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
                  event.preventDefault()
                  moveMode(index, event.key === "ArrowLeft" ? -1 : 1)
                }}
              >
                {candidate.label}
              </button>
            ))}
          </div>
          <button
            ref={hotKeysButtonRef}
            type="button"
            data-interactive
            onClick={onHotKeys}
          >
            HotKeys
          </button>
          <button className="quiet-primary" type="button" data-interactive onClick={onStart}>
            Start interview
          </button>
        </>
      ) : (
        <nav className="quiet-actions" aria-label="Live interview controls">
          <button
            type="button"
            data-interactive
            aria-pressed={recordPressed}
            title={recordDescription}
            disabled={recordDisabled}
            onClick={onRecord}
          >
            {recordLabel}
          </button>
          <button type="button" data-interactive onClick={onScreenshot}>
            Screenshot
          </button>
          <button type="button" data-interactive onClick={onChat}>
            Chat
          </button>
          <button
            className="quiet-primary"
            type="button"
            data-interactive
            disabled={!canSubmit}
            onClick={onSubmit}
          >
            Submit
          </button>
          <span className="quiet-context" aria-label={`Context: ${contextLabel}`}>
            <span aria-hidden="true">●</span> {contextLabel}
          </span>
          <button
            ref={hotKeysButtonRef}
            type="button"
            data-interactive
            onClick={onHotKeys}
          >
            HotKeys
          </button>
          <details data-interactive>
            <summary>More</summary>
            <button type="button" data-interactive onClick={onWorkspace}>
              Workspace
            </button>
            <button className="quiet-danger" type="button" data-interactive onClick={onReset}>
              Reset
            </button>
          </details>
        </nav>
      )}
    </header>
  )
}
