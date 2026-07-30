import { useEffect, useMemo, useState, type RefObject } from "react"
import {
  DEFAULT_SHORTCUT_BINDINGS,
  SHORTCUT_ACTIONS,
  shortcutConflicts,
  type ShortcutAction,
  type ShortcutBindings
} from "../../shared/shell"

const LABELS: Readonly<Record<ShortcutAction, string>> = {
  visibility: "Show or hide",
  record: "Record",
  screenshot: "Screenshot",
  debug: "Debug current code",
  composer: "Open agent composer",
  submit: "Submit",
  "move-left": "Move window left",
  "move-right": "Move window right",
  "move-up": "Move window up",
  "move-down": "Move window down",
  "section-previous": "Previous answer section",
  "section-next": "Next answer section",
  "section-scroll-up": "Scroll answer up",
  "section-scroll-down": "Scroll answer down",
  reset: "Reset interview"
}

export interface HotKeysPanelProps {
  readonly returnFocusTo: RefObject<HTMLButtonElement>
  readonly onClose: () => void
}

export function HotKeysPanel({
  returnFocusTo,
  onClose
}: HotKeysPanelProps) {
  const [bindings, setBindings] = useState<ShortcutBindings>(
    DEFAULT_SHORTCUT_BINDINGS
  )
  const [status, setStatus] = useState("")
  const conflicts = useMemo(() => shortcutConflicts(bindings), [bindings])

  useEffect(() => {
    void window.electronAPI.getShortcutBindings().then(setBindings)
    return () => returnFocusTo.current?.focus()
  }, [returnFocusTo])

  const save = async () => {
    try {
      const result = await window.electronAPI.updateShortcutBindings(bindings)
      setBindings(result.bindings)
      setStatus(
        result.ok
          ? "Shortcuts saved."
          : result.rejectedAccelerator
            ? `${result.rejectedAccelerator} is already used by the system.`
            : "Resolve shortcut conflicts before saving."
      )
    } catch {
      setBindings(await window.electronAPI.getShortcutBindings())
      setStatus("Shortcuts were not changed because preferences could not be saved.")
    }
  }

  const reset = async () => {
    try {
      const result = await window.electronAPI.resetShortcutBindings()
      setBindings(result.bindings)
      setStatus(
        result.ok ? "Default shortcuts restored." : "Defaults unavailable."
      )
    } catch {
      setBindings(await window.electronAPI.getShortcutBindings())
      setStatus("Defaults were not restored because preferences could not be saved.")
    }
  }

  return (
    <aside className="quiet-popover quiet-hotkeys" data-interactive aria-label="HotKeys">
      <div className="quiet-popover-heading">
        <h2>HotKeys</h2>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      {SHORTCUT_ACTIONS.map((action) => (
        <label key={action}>
          <span>{LABELS[action]}</span>
          <input
            value={bindings[action]}
            aria-invalid={Object.values(conflicts).some((actions) =>
              actions.includes(action)
            )}
            onChange={(event) =>
              setBindings({ ...bindings, [action]: event.target.value })
            }
          />
        </label>
      ))}
      {Object.keys(conflicts).length > 0 ? (
        <p className="quiet-error" role="alert">
          Each shortcut must be unique.
        </p>
      ) : null}
      <div className="quiet-composer-actions">
        <button
          className="quiet-primary"
          type="button"
          disabled={Object.keys(conflicts).length > 0}
          onClick={() => void save()}
        >
          Save
        </button>
        <button type="button" onClick={() => void reset()}>
          Reset all
        </button>
      </div>
      <p className="quiet-status" role="status">{status}</p>
    </aside>
  )
}
