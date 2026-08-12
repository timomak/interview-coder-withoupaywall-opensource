import { useEffect } from "react"
import type { InterviewSession } from "../../shared/interview"

interface LocalShellShortcutOptions {
  readonly lifecycle: InterviewSession["lifecycle"]
  readonly onSettings: () => void
  readonly onHotKeys: () => void
  readonly onStart: () => void
  readonly onQuit: () => void
}

export function useLocalShellShortcuts({
  lifecycle,
  onSettings,
  onHotKeys,
  onStart,
  onQuit
}: LocalShellShortcutOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        !event.ctrlKey ||
        !event.shiftKey ||
        event.metaKey ||
        event.altKey
      ) return

      if (event.key === ",") {
        event.preventDefault()
        onSettings()
      } else if (event.key === "/") {
        event.preventDefault()
        onHotKeys()
      } else if (event.key === "Enter" && lifecycle === "idle") {
        event.preventDefault()
        onStart()
      } else if (event.key.toLowerCase() === "q") {
        event.preventDefault()
        onQuit()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [lifecycle, onHotKeys, onQuit, onSettings, onStart])
}
