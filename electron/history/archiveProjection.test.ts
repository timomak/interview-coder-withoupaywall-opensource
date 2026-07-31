import { expect, it } from "vitest"
import { projectHistoryArchive } from "../../src/features/history"
import { historyFixture } from "./testSupport"

it("projects complete session and excludes audio", () => {
  const projection = projectHistoryArchive(historyFixture())
  expect(projection).toMatchObject({
    migration: "M-09",
    mode: "system-design",
    provider: "codex",
    model: "gpt-5.4",
    screenshots: [{ contentType: "image/png" }],
    session: {
      captureActive: false,
      snapshot: { template: { schemaVersion: 1 } },
      audio: { segments: [{ state: "final" }], pendingQuestion: { revision: 1 } },
      sections: expect.arrayContaining([
        expect.objectContaining({ id: "architecture" }),
        expect.objectContaining({ id: "code" }),
        expect.objectContaining({ id: "diagram" }),
        expect.objectContaining({ id: "summary" })
      ]),
      compactExchanges: [{ id: "follow-up-1" }]
    }
  })
  expect(JSON.stringify(projection).toLowerCase()).not.toMatch(/raw[-_ ]?audio|audio\/wav/)
})
