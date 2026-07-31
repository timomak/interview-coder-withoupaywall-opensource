const { desktopCapturer, screen } = require("electron")

/**
 * Captures the requested display without creating a plaintext filesystem
 * artifact. The returned buffer is owned by the caller and must be cleared
 * after encrypted persistence.
 *
 * @param {number | undefined} displayId
 * @returns {Promise<{ bytes: Buffer, displayId: string }>}
 */
async function captureDisplayInMemory(displayId) {
  const display =
    screen.getAllDisplays().find((candidate) => candidate.id === displayId) ??
    screen.getPrimaryDisplay()
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.max(1, Math.round(display.size.width * display.scaleFactor)),
      height: Math.max(1, Math.round(display.size.height * display.scaleFactor))
    }
  })
  const source =
    sources.find((candidate) => Number(candidate.display_id) === display.id) ??
    sources[0]
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error("Electron desktop capture returned no primary-display pixels")
  }
  return {
    bytes: source.thumbnail.toPNG(),
    displayId: String(display.id)
  }
}

module.exports = { captureDisplayInMemory }
