import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("release claim policy", () => {
  it("rejects unqualified privacy and platform language", () => {
    const root = path.resolve(__dirname, "../..")
    const shipped = ["README.md", "docs/macos-release/RELEASE.md"]
      .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
      .join("\n")
    expect(shipped).not.toMatch(/\b99%\b|anti-cheat|process-hiding|monitoring-evasion/i)
    expect(shipped).toContain("exact macOS,")
    expect(shipped).toContain("local preview never establishes")
    expect(shipped).toContain("not a security boundary")
    expect(shipped).toContain("Browser-tab sharing")
  })
})
