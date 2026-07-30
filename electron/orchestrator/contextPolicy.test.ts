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
    const seedAttempt = policy.prepare(session, "seed-attempt")
    expect(policy.prepare(session, "ignored-retry")).toEqual(seedAttempt)
    policy.commit("seed-attempt")
    const deltaAttempt = policy.prepare(session, "delta-attempt", [
      ...session.snapshot.context,
      { id: "transcript", category: "transcript", revision: 1, content: "new" }
    ])
    const seed = seedAttempt.packet
    const delta = deltaAttempt.packet
    expect(seed.kind).toBe("seed")
    expect(seed.items.map((item) => item.id)).toEqual(["instructions"])
    expect(delta).toMatchObject({
      kind: "delta",
      items: [{ id: "transcript", content: "new" }]
    })
    expect(serializeContextPacket(seed)).not.toMatch(
      /PROFILE_BYTES|OPPORTUNITY_BYTES/
    )
    expect(policy.snapshot().pending?.attemptId).toBe("delta-attempt")
  })

  it("replays the byte-exact pending packet until accepted completion", () => {
    const session = startedSession()
    const firstProcess = new OrderedContextPolicy()
    const failed = firstProcess.prepare(session, "attempt-before-crash")
    const encryptedSnapshot = firstProcess.snapshot()

    const afterCrash = new OrderedContextPolicy(encryptedSnapshot)
    const retried = afterCrash.prepare(session, "ignored-new-attempt")
    expect(serializeContextPacket(retried.packet)).toBe(
      serializeContextPacket(failed.packet)
    )
    expect(retried.attemptId).toBe("attempt-before-crash")
    expect(afterCrash.snapshot().cursor.seeded).toBe(false)

    afterCrash.commit(retried.attemptId)
    const delta = afterCrash.prepare(session, "accepted-next-turn")
    expect(delta.packet).toEqual({ kind: "delta", items: [], evidence: [] })
  })
})
