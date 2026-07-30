import fs from "node:fs"
import path from "node:path"
import { isProviderId, PROVIDER_IDS } from "../../src/shared/provider"

describe("provider boundary", () => {
  it("rejects legacy providers and entitlement surfaces", () => {
    expect(PROVIDER_IDS).toEqual(["claude-code", "codex"])
    for (const legacy of ["openai", "anthropic", "gemini", "api-key"]) {
      expect(isProviderId(legacy)).toBe(false)
    }

    const ownedUi = [
      "src/components/Settings/SettingsDialog.tsx",
      "src/components/WelcomeScreen.tsx",
      "src/_pages/SubscribePage.tsx"
    ]
      .map((file) => fs.readFileSync(path.resolve(file), "utf8"))
      .join("\n")
    expect(ownedUi).not.toMatch(/API key|credits|quota|paywall|portal/i)
  })
})
