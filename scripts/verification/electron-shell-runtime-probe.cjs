const { app, BrowserWindow, screen } = require("electron")
const runtimeShell = require("../../electron/window/runtimeShell.cjs")
const captureRuntime = require(
  "../../electron/capture/inMemoryDesktopCapture.cjs"
)

const PREFIX = "INTERVIEWCOPILOT_ELECTRON_SHELL_PROBE="

async function run() {
  await app.whenReady()
  const display = screen.getPrimaryDisplay()
  const bounds = {
    x: display.workArea.x,
    y: display.workArea.y,
    width: 320,
    height: 80
  }
  /** @type {string[]} */
  const lifecycle = []
  /** @type {Array<{ ignore: boolean, forward: boolean }>} */
  const pointerRouting = []
  const window = runtimeShell.createCaptureProtectedWindow(() => {
    const created = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: { sandbox: true }
    })
    const setContentProtection = created.setContentProtection.bind(created)
    created.setContentProtection = (enabled) => {
      setContentProtection(enabled)
      lifecycle.push(`protect:${enabled}`)
    }
    const setIgnoreMouseEvents = created.setIgnoreMouseEvents.bind(created)
    created.setIgnoreMouseEvents = (ignore, options) => {
      setIgnoreMouseEvents(ignore, options)
      pointerRouting.push({ ignore, forward: options?.forward === true })
    }
    return created
  })
  window.setBounds(bounds)
  runtimeShell.applyPointerRouting(window, true, true)
  runtimeShell.applyPointerRouting(window, false, false)
  await window.loadURL(
    "data:text/html,<main data-interactive>runtime-shell-probe</main>"
  )
  runtimeShell.revealCaptureProtectedWindow(window, (protectedWindow) => {
    protectedWindow.showInactive()
  })
  const capture = await captureRuntime.captureDisplayInMemory(display.id)
  const actualBounds = window.getBounds()
  const result = {
    visible: window.isVisible(),
    contentProtectionApplied:
      lifecycle.length >= 2 &&
      lifecycle.every((entry) => entry === "protect:true"),
    pointerRoutingApplied:
      pointerRouting.length === 2 &&
      pointerRouting[0].ignore === true &&
      pointerRouting[0].forward === true &&
      pointerRouting[1].ignore === false &&
      pointerRouting[1].forward === false,
    primaryDisplayId: String(display.id),
    capturedDisplayId: capture.displayId,
    capturedPng:
      capture.bytes.length > 8 &&
      capture.bytes.subarray(0, 8).equals(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
      ),
    displayMatched:
      String(screen.getDisplayMatching(actualBounds).id) === String(display.id) &&
      capture.displayId === String(display.id),
    bounds: actualBounds
  }
  capture.bytes.fill(0)
  process.stdout.write(`${PREFIX}${JSON.stringify(result)}\n`)
  window.destroy()
  app.quit()
}

run().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`
  )
  app.exit(1)
})
