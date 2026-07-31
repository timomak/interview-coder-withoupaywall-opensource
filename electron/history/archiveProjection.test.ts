import { expect, it } from "vitest"
import type { ResetArchive } from "../../src/shared/interview"
import { projectHistoryArchive } from "../../src/features/history"
import { historyFixture } from "./testSupport"

it("projects complete session and excludes audio", () => {
  const original = historyFixture()
  const screenshotArtifacts = Array.from({ length: 12 }, (_, index) => ({
    id: `screenshot:${index}`,
    kind: "screenshot" as const,
    finalizedAt: `2026-07-31T10:02:${String(index).padStart(2, "0")}.000Z`,
    content: `data:image/png;base64,${Buffer.from(`PNG_FIXTURE_${index}`).toString("base64")}`,
    selected: true,
    submitted: true
  }))
  const source = {
    ...original,
    session: {
      ...original.session,
      artifacts: [original.session.artifacts[0], ...screenshotArtifacts],
      audio: {
        ...original.session.audio,
        rawAudio: "RAW_BINARY_SENTINEL",
        diagnostics: { deviceToken: "AUDIO_DIAGNOSTIC_SENTINEL" },
        segments: original.session.audio.segments.map((segment) => ({
          ...segment,
          text: `${segment.text}; ordinary discussion says raw audio and passwordless`
        }))
      }
    }
  } as ResetArchive & {
    session: ResetArchive["session"] & {
      audio: ResetArchive["session"]["audio"] & {
        rawAudio: string
        diagnostics: { deviceToken: string }
      }
    }
  }
  const projection = projectHistoryArchive(source)
  expect(projection).toMatchObject({
    migration: "M-09",
    mode: "system-design",
    provider: "codex",
    model: "gpt-5.4",
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
  expect(projection.screenshots).toHaveLength(12)
  expect(projection.session.audio.segments[0].text).toContain("raw audio and passwordless")
  expect(JSON.stringify(projection)).not.toMatch(/RAW_BINARY_SENTINEL|AUDIO_DIAGNOSTIC_SENTINEL/)
})
