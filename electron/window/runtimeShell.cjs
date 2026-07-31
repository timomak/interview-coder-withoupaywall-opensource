/**
 * Production shell primitives shared by the Electron main process and the
 * packaged runtime probe. Keeping these calls in one module prevents the probe
 * from accidentally certifying a synthetic implementation.
 */

/**
 * @param {{ setContentProtection(enabled: boolean): void }} window
 */
function applyCaptureProtection(window) {
  window.setContentProtection(true)
}

/**
 * @template {{ setContentProtection(enabled: boolean): void }} T
 * @param {() => T} createWindow
 * @returns {T}
 */
function createCaptureProtectedWindow(createWindow) {
  const window = createWindow()
  applyCaptureProtection(window)
  return window
}

/**
 * @template {{ setContentProtection(enabled: boolean): void }} T
 * @param {T} window
 * @param {(protectedWindow: T) => void} reveal
 */
function revealCaptureProtectedWindow(window, reveal) {
  applyCaptureProtection(window)
  reveal(window)
}

/**
 * @param {{ setIgnoreMouseEvents(ignore: boolean, options?: { forward: boolean }): void }} window
 * @param {boolean} ignore
 * @param {boolean} forward
 */
function applyPointerRouting(window, ignore, forward) {
  window.setIgnoreMouseEvents(ignore, { forward })
}

module.exports = {
  applyCaptureProtection,
  applyPointerRouting,
  createCaptureProtectedWindow,
  revealCaptureProtectedWindow
}
