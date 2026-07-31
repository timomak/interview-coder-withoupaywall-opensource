const { app, BrowserWindow, screen } = require("electron")

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
  const window = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: { sandbox: true }
  })
  window.setContentProtection(true)
  window.setBounds(bounds)
  window.setIgnoreMouseEvents(true, { forward: true })
  window.setIgnoreMouseEvents(false)
  await window.loadURL(
    "data:text/html,<main data-interactive>runtime-shell-probe</main>"
  )
  window.showInactive()
  const actualBounds = window.getBounds()
  const result = {
    visible: window.isVisible(),
    contentProtectionApplied: true,
    pointerRoutingApplied: true,
    primaryDisplayId: String(display.id),
    displayMatched:
      String(screen.getDisplayMatching(actualBounds).id) === String(display.id),
    bounds: actualBounds
  }
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
