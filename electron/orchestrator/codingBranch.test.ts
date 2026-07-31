import { describe, expect, it } from "vitest"
import { createCodingBranch, newCodingQuestion } from "./codingBranch"

describe("Coding question branches", () => {
  it("isolates new question within one interview", () => {
    const first = createCodingBranch("q1", "two sum", "t1", [
      { id: "transcript-1", kind: "transcript", finalizedAt: "t1", content: "hello", selected: false, submitted: true },
      { id: "screenshot-1", kind: "screenshot", finalizedAt: "t1", content: "image", selected: true, submitted: false }
    ])
    const second = createCodingBranch("q2", "lru cache", "t2", [])
    const next = newCodingQuestion(
      {
        current: first,
        prior: [],
        chronology: ["interview-start"],
        transcriptArtifactIds: ["transcript-1"]
      },
      second,
      "t2"
    )
    expect(next.current).toEqual(second)
    expect(next.prior[0]).toMatchObject({ id: "q1", closedAt: "t2" })
    expect(next.chronology).toEqual(["interview-start", "q1", "q2"])
    expect(next.transcriptArtifactIds).toEqual(["transcript-1"])
    expect(next.current.screenshotArtifactIds).toEqual([])
  })
})
