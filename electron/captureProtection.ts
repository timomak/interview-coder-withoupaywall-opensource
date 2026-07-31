// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- the strict checkJs inventory validates this exact CJS module.
import runtimeShell from "./window/runtimeShell.cjs"

export interface CaptureProtectedWindow {
  setContentProtection(enabled: boolean): void
}

export function applyCaptureProtection(window: CaptureProtectedWindow): void {
  runtimeShell.applyCaptureProtection(window)
}

export function createCaptureProtectedWindow<T extends CaptureProtectedWindow>(
  createWindow: () => T
): T {
  return runtimeShell.createCaptureProtectedWindow(createWindow)
}

export function revealCaptureProtectedWindow<
  T extends CaptureProtectedWindow
>(window: T, reveal: (protectedWindow: T) => void): void {
  runtimeShell.revealCaptureProtectedWindow(window, reveal)
}

export interface PointerRoutedWindow {
  setIgnoreMouseEvents(
    ignore: boolean,
    options?: { readonly forward: boolean }
  ): void
}

export function applyPointerRouting(
  window: PointerRoutedWindow,
  ignore: boolean,
  forward: boolean
): void {
  runtimeShell.applyPointerRouting(window, ignore, forward)
}
