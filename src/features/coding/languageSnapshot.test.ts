import { describe, expect, it } from "vitest"
import {
  CODING_LANGUAGES,
  normalizeCodingLanguage,
  snapshotCodingLanguage
} from "./language"

describe("Coding language snapshot", () => {
  it("normalizes and locks the complete language catalog", () => {
    expect(snapshotCodingLanguage("python")).toBe("python3")
    expect(snapshotCodingLanguage("golang")).toBe("go")
    expect(normalizeCodingLanguage("js").id).toBe("typescript")
    expect(
      CODING_LANGUAGES.filter((language) => language.quality === "first-class")
    ).toHaveLength(6)
    expect(
      CODING_LANGUAGES.filter((language) => language.quality === "best-effort")
    ).toHaveLength(6)
    expect(
      CODING_LANGUAGES
        .filter((language) => language.quality === "best-effort")
        .every((language) => language.label.includes("best effort"))
    ).toBe(true)
  })
})
