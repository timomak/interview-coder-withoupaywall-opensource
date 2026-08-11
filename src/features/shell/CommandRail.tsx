import type { RefObject } from "react"
import type { InterviewMode, InterviewSession } from "../../shared/interview"
import type { ShortcutBindings } from "../../shared/shell"

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
  readonly onSettings: () => void
  readonly onReset: () => void
  readonly onWorkspace: () => void
  readonly shortcuts: ShortcutBindings
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
  onSettings,
  onReset,
  onWorkspace,
  shortcuts,
  hotKeysButtonRef,
  contextLabel,
  canSubmit,
  recordLabel = "Record",
  recordPressed = false,
  recordDisabled = false,
  recordDescription = "Start or resume microphone and system audio"
}: CommandRailProps) {
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
          <label className="quiet-prompt-select" data-interactive>
            <span aria-hidden="true">Prompt</span>
            <select
              aria-label="System prompt"
              value={mode}
              onChange={(event) => onModeChange(event.target.value as InterviewMode)}
            >
              {MODES.map((candidate) => (
                <option key={candidate.value} value={candidate.value}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>
          <button
            ref={hotKeysButtonRef}
            type="button"
            data-interactive
            onClick={onHotKeys}
          >
            HotKeys <ShortcutChip label="?" />
          </button>
          <button type="button" data-interactive onClick={onSettings}>
            Settings <ShortcutChip label="⌘," />
          </button>
          <button className="quiet-primary" type="button" data-interactive onClick={onStart}>
            <span aria-hidden="true">Start</span>
            <span className="sr-only">Start interview</span>
            <ShortcutChip label="↵" />
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
            {recordLabel} <ShortcutChip binding={shortcuts.record} />
          </button>
          <button type="button" data-interactive onClick={onScreenshot}>
            Screenshot <ShortcutChip binding={shortcuts.screenshot} />
          </button>
          <button type="button" data-interactive onClick={onChat}>
            Chat <ShortcutChip binding={shortcuts.composer} />
          </button>
          <button
            className="quiet-primary"
            type="button"
            data-interactive
            disabled={!canSubmit}
            onClick={onSubmit}
          >
            Submit <ShortcutChip binding={shortcuts.submit} />
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
            HotKeys <ShortcutChip label="?" />
          </button>
          <button type="button" data-interactive onClick={onSettings}>
            Settings <ShortcutChip label="⌘," />
          </button>
          <details data-interactive>
            <summary>More</summary>
            <button type="button" data-interactive onClick={onWorkspace}>
              Workspace
            </button>
            <button className="quiet-danger" type="button" data-interactive onClick={onReset}>
              Reset <ShortcutChip binding={shortcuts.reset} />
            </button>
          </details>
        </nav>
      )}
    </header>
  )
}

function ShortcutChip({
  binding,
  label
}: Readonly<{ binding?: string; label?: string }>) {
  const value = label ?? formatShortcut(binding ?? "")
  return <span className="quiet-shortcut-chip" aria-hidden="true">{value}</span>
}

function formatShortcut(binding: string): string {
  const keys: Readonly<Record<string, string>> = {
    control: "⌃",
    shift: "⇧",
    option: "⌥",
    alt: "⌥",
    command: "⌘",
    meta: "⌘",
    enter: "↵",
    backspace: "⌫",
    left: "←",
    right: "→",
    up: "↑",
    down: "↓"
  }
  return binding
    .split("+")
    .map((part) => keys[part.trim().toLowerCase()] ?? part.trim().toUpperCase())
    .join("")
}
