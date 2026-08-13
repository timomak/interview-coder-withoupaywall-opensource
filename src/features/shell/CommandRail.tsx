import { useEffect, useRef, type RefObject } from "react"
import appIcon from "../../assets/interviewcopilot-icon.png"
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
  readonly promptMenuOpen: boolean
  readonly onPromptMenuOpenChange: (open: boolean) => void
  readonly moreMenuOpen: boolean
  readonly onMoreMenuOpenChange: (open: boolean) => void
  readonly onStart: () => void
  readonly onRecord: () => void
  readonly onScreenshot: () => void
  readonly onChat: () => void
  readonly onHotKeys: () => void
  readonly onSettings: () => void
  readonly onQuit: () => void
  readonly onReset: () => void
  readonly onWorkspace: () => void
  readonly hotKeysButtonRef?: RefObject<HTMLButtonElement>
  readonly contextLabel: string
  readonly recordLabel?: "Record" | "Pause"
  readonly recordPressed?: boolean
  readonly recordDisabled?: boolean
  readonly recordDescription?: string
}

export function CommandRail({
  session,
  mode,
  onModeChange,
  promptMenuOpen,
  onPromptMenuOpenChange,
  moreMenuOpen,
  onMoreMenuOpenChange,
  onStart,
  onRecord,
  onScreenshot,
  onChat,
  onHotKeys,
  onSettings,
  onQuit,
  onReset,
  onWorkspace,
  hotKeysButtonRef,
  contextLabel,
  recordLabel = "Record",
  recordPressed = false,
  recordDisabled = false,
  recordDescription = "Start or resume microphone and system audio"
}: CommandRailProps) {
  const promptMenu = useRef<HTMLDivElement>(null)
  const selectedMode = MODES.find(({ value }) => value === mode) ?? MODES[0]

  useEffect(() => {
    if (!promptMenuOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !promptMenu.current?.contains(event.target)
      ) {
        onPromptMenuOpenChange(false)
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer, true)
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true)
  }, [onPromptMenuOpenChange, promptMenuOpen])

  return (
    <header className="quiet-rail" data-interactive>
      <div className="quiet-drag-pill" data-drag-root aria-label="Move InterviewCopilot">
        <img
          className="quiet-brand-icon"
          src={appIcon}
          alt="InterviewCopilot"
          draggable={false}
        />
        {session.lifecycle === "active" ? (
          <span className={`quiet-mode quiet-mode-${session.snapshot.mode}`}>
            {MODES.find(({ value }) => value === session.snapshot.mode)?.label}
          </span>
        ) : null}
      </div>

      {session.lifecycle === "idle" ? (
        <>
          <div
            ref={promptMenu}
            className="quiet-prompt-select"
            data-interactive
          >
            <button
              className="quiet-prompt-trigger"
              type="button"
              aria-label={`System prompt: ${selectedMode.label}`}
              aria-haspopup="listbox"
              aria-expanded={promptMenuOpen}
              aria-controls="quiet-system-prompt-menu"
              onClick={() => onPromptMenuOpenChange(!promptMenuOpen)}
              onKeyDown={(event) => {
                if (event.key === "Escape") onPromptMenuOpenChange(false)
              }}
            >
              <span>{selectedMode.label}</span>
              <span aria-hidden="true">⌄</span>
            </button>
            {promptMenuOpen ? (
              <div
                id="quiet-system-prompt-menu"
                className="quiet-prompt-menu"
                role="listbox"
                aria-label="System prompts"
                onKeyDown={(event) => {
                  if (event.key === "Escape") onPromptMenuOpenChange(false)
                }}
              >
                {MODES.map((candidate) => (
                  <button
                    key={candidate.value}
                    type="button"
                    role="option"
                    aria-selected={candidate.value === mode}
                    onClick={() => {
                      onModeChange(candidate.value)
                      onPromptMenuOpenChange(false)
                    }}
                  >
                    <span>{candidate.label}</span>
                    {candidate.value === mode ? (
                      <span aria-hidden="true">✓</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button type="button" data-interactive onClick={onSettings}>
            Settings
          </button>
          <button className="quiet-primary" type="button" data-interactive onClick={onStart}>
            <span aria-hidden="true">Start</span>
            <span className="sr-only">Start interview</span>
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
          <button className="quiet-primary" type="button" data-interactive onClick={onScreenshot}>
            See screen
          </button>
          <button type="button" data-interactive onClick={onChat}>
            Ask
          </button>
          <details
            className="quiet-more"
            data-interactive
            open={moreMenuOpen}
            onToggle={(event) =>
              onMoreMenuOpenChange(event.currentTarget.open)
            }
          >
            <summary aria-label="More session controls">•••</summary>
            <div className="quiet-more-menu">
              <span className="quiet-context" aria-label={`Context: ${contextLabel}`}>
                <span aria-hidden="true">●</span> {contextLabel}
              </span>
              <button type="button" data-interactive onClick={onWorkspace}>
                Workspace
              </button>
              <button
                ref={hotKeysButtonRef}
                type="button"
                data-interactive
                onClick={onHotKeys}
              >
                Keyboard shortcuts
              </button>
              <button type="button" data-interactive onClick={onSettings}>
                Settings
              </button>
              <button className="quiet-danger" type="button" data-interactive onClick={onReset}>
                End session
              </button>
              <button className="quiet-danger" type="button" data-interactive onClick={onQuit}>
                Quit InterviewCopilot
              </button>
            </div>
          </details>
        </nav>
      )}
    </header>
  )
}
