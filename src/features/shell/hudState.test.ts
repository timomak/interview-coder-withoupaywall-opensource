import { describe, expect, it } from "vitest"
import { deriveHudState, deriveStartupHudState } from "../../shared/shell"

describe("HUD state selection", () => {
  it("expands required staged evidence controls beyond the compact bar", () => {
    const base = {
      settingsOpen: false,
      workspaceExpanded: false,
      composerOpen: false,
      hotKeysOpen: false,
      sectionCount: 0,
      artifactCount: 0
    }
    expect(deriveHudState(base)).toBe("compact-bar")
    expect(deriveHudState({ ...base, artifactCount: 1 })).toBe(
      "compact-answer"
    )
    expect(deriveHudState({ ...base, settingsOpen: true })).toBe("expanded")
  })

  it("opens first-run provider setup in the expanded window", () => {
    expect(deriveStartupHudState({})).toBe("expanded")
    expect(
      deriveStartupHudState({ provider: "codex", model: "gpt-5.4" })
    ).toBe("compact-bar")
  })
})
