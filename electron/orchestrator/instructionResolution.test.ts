import { expect, it } from "vitest"
import { resolvePromptInstructions } from "../../src/features/prompts"
import type { PromptResolutionContender } from "../../src/features/prompts"

it("resolves and records conflicts deterministically", () => {
  const contenders: PromptResolutionContender[] = [
    {
      id: "user-old",
      revision: 1,
      topic: "detail",
      relevance: 8,
      specificity: 9,
      observedAt: "2026-07-30T10:00:00.000Z",
      provenance: "user",
      applicableModes: ["coding"],
      directive: "SECRET_OLD"
    },
    {
      id: "user-new",
      revision: 2,
      topic: "detail",
      relevance: 8,
      specificity: 9,
      observedAt: "2026-07-31T10:00:00.000Z",
      provenance: "user",
      applicableModes: ["coding"],
      directive: "SECRET_WINNER"
    },
    {
      id: "wrong-mode",
      revision: 9,
      topic: "detail",
      relevance: 100,
      specificity: 100,
      observedAt: "2026-07-31T11:00:00.000Z",
      provenance: "system",
      applicableModes: ["behavioral"],
      directive: "WRONG_MODE"
    }
  ]
  const forward = resolvePromptInstructions("coding", contenders, "2026-07-31T12:00:00.000Z")
  const reversed = resolvePromptInstructions("coding", [...contenders].reverse(), "2026-07-31T12:00:00.000Z")
  expect(forward).toEqual(reversed)
  expect(forward.instructions).toEqual(["SECRET_WINNER"])
  expect(forward.record.decisions[0]).toMatchObject({
    winnerId: "user-new",
    contenderIds: ["user-new", "user-old"]
  })
  expect(JSON.stringify(forward.record)).not.toContain("SECRET_")
  expect(JSON.stringify(forward.record)).not.toContain("WRONG_MODE")
})
