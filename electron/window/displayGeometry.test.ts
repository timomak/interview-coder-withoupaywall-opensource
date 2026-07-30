import { describe, expect, it } from "vitest"
import {
  DisplayGeometryStore,
  clampWindowBounds,
  nearestDisplay
} from "./displayGeometry"

const displays = [
  { id: "left", workArea: { x: -1200, y: 0, width: 1200, height: 900 } },
  { id: "primary", workArea: { x: 0, y: 24, width: 1440, height: 876 } }
] as const

describe("display geometry", () => {
  it("restores snaps and clamps each window state", () => {
    const store = new DisplayGeometryStore()
    store.remember("left", "compact-bar", {
      x: -1800,
      y: -400,
      width: 520,
      height: 44
    })

    expect(
      store.restore(
        "left",
        "compact-bar",
        { x: 0, y: 24, width: 520, height: 44 },
        displays
      )
    ).toEqual({ x: -1200, y: 0, width: 520, height: 44 })
    expect(
      clampWindowBounds(
        { x: 1400, y: 880, width: 760, height: 600 },
        displays[1].workArea
      )
    ).toEqual({ x: 680, y: 300, width: 760, height: 600 })
  })

  it("falls back to the nearest available display after disconnect", () => {
    expect(
      nearestDisplay(
        { x: -900, y: 100, width: 520, height: 44 },
        [displays[1]]
      ).id
    ).toBe("primary")
  })
})
