import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { BehavioralWorkspace } from "./BehavioralWorkspace"
import { deriveBehavioralView } from "./facts"

describe("Behavioral live-only boundary", () => {
  it("excludes deferred Practice behavior", () => {
    const story = {
      id: "story",
      title: "Launch",
      status: "verified" as const,
      claims: [
        { id: "claim", text: "Led launch.", provenance: "verified" as const, sourceRevision: 1 }
      ]
    }
    render(
      <BehavioralWorkspace
        story={story}
        view={deriveBehavioralView(story)}
        fullAnswer={false}
        onFullAnswerChange={vi.fn()}
      />
    )
    expect(screen.queryByText(/practice|score|feedback|coaching/i)).toBeNull()
    expect(screen.getByRole("button", { name: "Show Full Answer" })).toBeVisible()
  })
})
