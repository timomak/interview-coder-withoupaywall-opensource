import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("neutral frictionless usage boundary", () => {
  it("preserves the neutral frictionless tool boundary", () => {
    const root = path.resolve(__dirname, "../..")
    const sources = [
      "src/features/onboarding/ProviderSetup.tsx",
      "src/features/shell/CommandRail.tsx",
      "src/_pages/SubscribedApp.tsx"
    ].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n")
    expect(sources).not.toMatch(/responsibility notice|usage boundary|recurring confirmation|acknowledge acceptable use/i)
    expect(sources).not.toMatch(/consent gate/i)
  })
})
