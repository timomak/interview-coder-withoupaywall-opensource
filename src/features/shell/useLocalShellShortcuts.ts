import { useEffect } from "react"
import type { InterviewSession } from "../../shared/interview"

interface LocalShellShortcutOptions {
  readonly lifecycle: InterviewSession["lifecycle"]
  readonly onSettings: () => void
  readonly onHotKeys: () => void
  readonly onStart: () => void
}

export function useLocalShellShortcuts({
  lifecycle,
  onSettings,
  onHotKeys,
  onStart
}: LocalShellShortcutOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === ",") {
        event.preventDefault()
        onSettings()
      } else if (event.key === "/") {
        event.preventDefault()
        onHotKeys()
      } else if (event.key === "Enter" && lifecycle === "idle") {
        event.preventDefault()
        onStart()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [lifecycle, onHotKeys, onSettings, onStart])
}
