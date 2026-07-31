import { describe, expect, it } from "vitest"
import { ComposerVisibilityController } from "./composerVisibility"

describe("compact composer visibility", () => {
  it("restores the exact hidden or visible origin on close", () => {
    const controller = new ComposerVisibilityController()

    expect(controller.open(false)).toEqual({ reveal: true })
    expect(controller.open(true)).toEqual({ reveal: false })
    expect(controller.close()).toEqual({ hide: true })

    expect(controller.open(true)).toEqual({ reveal: false })
    expect(controller.close()).toEqual({ hide: false })
  })
})
