import { OrderedContextPolicy, serializeContextPacket } from "./contextPolicy"
import { startedSession } from "./testSupport"

describe("ordered context policy", () => {
  it("seeds once sends deltas and excludes coding personal context", () => {
    const session = startedSession({
      mode: "coding",
      provider: "codex",
      model: "gpt-5.4",
      responseMode: "fast",
      language: "typescript",
      context: [
        { id: "profile", category: "profile", revision: 1, content: "PROFILE_BYTES" },
        { id: "instructions", category: "instructions", revision: 1, content: "base" },
        { id: "opportunity", category: "opportunity", revision: 1, content: "OPPORTUNITY_BYTES" }
      ]
    })
    const policy = new OrderedContextPolicy()
    const seed = policy.next(session)
    const delta = policy.next(session, [
      ...session.snapshot.context,
      { id: "transcript", category: "transcript", revision: 1, content: "new" }
    ])
    expect(seed.kind).toBe("seed")
    expect(seed.items.map((item) => item.id)).toEqual(["instructions"])
    expect(delta).toMatchObject({
      kind: "delta",
      items: [{ id: "transcript", content: "new" }]
    })
    expect(serializeContextPacket(seed)).not.toMatch(
      /PROFILE_BYTES|OPPORTUNITY_BYTES/
    )
  })
})
