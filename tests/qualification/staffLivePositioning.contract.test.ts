import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const fixturePath = path.resolve(
  __dirname,
  "../fixtures/qualification/staff-live-corpus.v1.json"
)

describe("Staff+ Live-first release positioning", () => {
  it("enforces the frozen Live-first Staff-plus corpus", () => {
    const bytes = fs.readFileSync(fixturePath)
    const fixture = JSON.parse(bytes.toString("utf8")) as {
      schemaVersion: number
      corpusId: string
      promptPolicy: Record<string, unknown>
      cases: Array<{
        id: string
        mode: string
        providerEvents: Array<{ sectionId: string; text: string }>
        expectedAffectedSectionIds: string[]
        forbiddenFields: string[]
        assertions: string[]
      }>
    }
    expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe(
      "c1909ccbfc64babeadfb1c45f3566abef5ed188df921f9b942b6aaf7aa8262ba"
    )
    expect(fixture.schemaVersion).toBe(1)
    expect(fixture.cases.map((item) => item.id)).toEqual([
      "SL-CODING-01",
      "SL-SYSTEM-01",
      "SL-BEHAVIORAL-01"
    ])
    expect(fixture.promptPolicy).toMatchObject({
      audience: "Senior/Staff+",
      shell: "Live",
      practice: false,
      postAnswerScore: false
    })
    for (const item of fixture.cases) {
      expect(item.providerEvents.length).toBeGreaterThanOrEqual(4)
      expect(new Set(item.providerEvents.map((event) => event.sectionId)).size).toBe(
        item.providerEvents.length
      )
      expect(item.forbiddenFields).toEqual([
        "practiceScore",
        "practiceFeedback",
        "postAnswerScore"
      ])
      expect(item.assertions.length).toBeGreaterThanOrEqual(7)
      expect(JSON.stringify(item)).not.toMatch(/practiceScore\s*:/)
    }
    const coding = fixture.cases[0]
    expect(coding.assertions).toEqual(
      expect.arrayContaining([
        "ambiguity",
        "trade-off",
        "time-complexity",
        "space-complexity",
        "production-failure",
        "testing",
        "maintainability"
      ])
    )
    const system = fixture.cases[1]
    expect(system.providerEvents.map((event) => event.sectionId)).toEqual([
      "requirements",
      "estimates",
      "architecture",
      "reliability",
      "operations"
    ])
    expect(system.providerEvents[1].text.match(/\d[\d,]*\s(?:jobs\/s|GB\/day)/g)).toHaveLength(3)
    const behavioral = fixture.cases[2]
    expect(behavioral.providerEvents.map((event) => event.text).join(" ")).toContain(
      "three teams"
    )
    expect(behavioral.providerEvents.map((event) => event.text).join(" ")).not.toContain(
      "four teams"
    )
  })
})
