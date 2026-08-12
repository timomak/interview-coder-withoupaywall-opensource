import { useEffect } from "react"

interface PointerRegionsProps {
  readonly forceInteractive?: boolean
}

export function PointerRegions({
  forceInteractive = false
}: PointerRegionsProps) {
  useEffect(() => {
    if (forceInteractive) {
      void window.electronAPI.setWindowPointerEvents(false, false)
      return () => {
        void window.electronAPI.setWindowPointerEvents(false, false)
      }
    }

    let ignoring = false
    const route = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const interactive = Boolean(target?.closest("[data-interactive]"))
      const nextIgnoring = !interactive
      if (nextIgnoring === ignoring) return
      ignoring = nextIgnoring
      void window.electronAPI.setWindowPointerEvents(nextIgnoring, true)
    }
    document.addEventListener("pointerover", route, true)
    return () => {
      document.removeEventListener("pointerover", route, true)
      void window.electronAPI.setWindowPointerEvents(false, false)
    }
  }, [forceInteractive])

  return null
}
