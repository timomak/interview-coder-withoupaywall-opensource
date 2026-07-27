export interface CaptureProtectedWindow {
  setContentProtection(enabled: boolean): void
}

export function applyCaptureProtection(window: CaptureProtectedWindow): void {
  window.setContentProtection(true)
}

export function createCaptureProtectedWindow<T extends CaptureProtectedWindow>(
  createWindow: () => T
): T {
  const window = createWindow()
  applyCaptureProtection(window)
  return window
}

export function revealCaptureProtectedWindow<
  T extends CaptureProtectedWindow
>(window: T, reveal: (protectedWindow: T) => void): void {
  applyCaptureProtection(window)
  reveal(window)
}
