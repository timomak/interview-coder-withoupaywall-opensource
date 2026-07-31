import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("Quiet Signal accessibility", () => {
  it("enforces Quiet Signal accessibility and silence invariants", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/index.css"), "utf8")
    const shell = fs.readFileSync(
      path.join(process.cwd(), "src/features/shell/CommandRail.tsx"),
      "utf8"
    )

    expect(css).toContain("--quiet-signal: #6ee7c1")
    expect(css).toContain("--quiet-system-design: #a78bfa")
    expect(css).toContain("--quiet-behavioral: #f4c76b")
    expect(css).toContain("font-size: 12px")
    expect(css).toContain("@media (prefers-reduced-motion: reduce)")
    expect(css).not.toMatch(/linear-gradient|radial-gradient/)
    expect(shell).toContain('aria-label="Live interview controls"')
    expect(shell).not.toMatch(/\b(?:Audio|speechSynthesis|vibrate)\s*\(/)
  })
})
