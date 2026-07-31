import { describe, expect, it } from "vitest"
import { personalContextForMode } from "./personalContextRouting"

const context = [
  { id: "profile-architecture", category: "profile" as const, revision: 1, content: "Led system reliability work" },
  { id: "profile-personal", category: "profile" as const, revision: 1, content: "Favorite hiking story" },
  { id: "opportunity", category: "opportunity" as const, revision: 1, content: "Staff API role" }
]

describe("personal context routing", () => {
  it("routes personal context only to approved modes", () => {
    expect(JSON.stringify(personalContextForMode("coding", context))).not.toMatch(
      /hiking|Staff API|reliability/
    )
    expect(personalContextForMode("behavioral", context)).toEqual(context)
    const design = personalContextForMode("system-design", context)
    expect(design.map((item) => item.id)).toEqual([
      "profile-architecture",
      "profile-personal",
      "opportunity"
    ])
  })
})
