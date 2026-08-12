import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("deferred release scope", () => {
  it("keeps deferred surfaces out of launch", () => {
    const root = path.resolve(__dirname, "../..")
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
    expect(Object.keys(pkg.build)).not.toEqual(expect.arrayContaining(["win", "linux"]))
    expect(Object.keys(pkg.scripts)).not.toEqual(expect.arrayContaining(["package-win", "package-linux"]))
    const privacy = fs.readFileSync(
      path.join(root, "src/features/privacy/MeetVerification.tsx"),
      "utf8"
    )
    expect(privacy).not.toContain("Practice score")
    expect(privacy).not.toContain("Test My Setup")
    expect(privacy).not.toContain("Zoom qualification")
    expect(privacy).not.toContain("Teams qualification")
    expect(privacy).toContain("outside the qualified scope")
  })
})
