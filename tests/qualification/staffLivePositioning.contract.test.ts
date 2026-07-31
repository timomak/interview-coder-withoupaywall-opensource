import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { createTestOrchestrator, currentActive } from "../../electron/orchestrator/testSupport"
import type { ContextItem } from "../../src/shared/interview"

const fixturePath = path.resolve(__dirname, "../fixtures/qualification/staff-live-corpus.v1.json")
const selection = { provider: "codex" as const, model: "gpt-5.4", responseMode: "fast" as const, effort: "low" as const }
const completed = { type: "completed" as const, sequence: 2 }
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex")

describe("Staff+ Live-first release positioning", () => {
  it("enforces the frozen Live-first Staff-plus corpus", async () => {
    const bytes = fs.readFileSync(fixturePath)
    const fixture = JSON.parse(bytes.toString("utf8")) as {
      schemaVersion: number
      corpusId: string
      promptPolicy: Record<string, unknown>
      cases: Array<{
        id: string
        mode: "coding" | "system-design" | "behavioral"
        inputArtifacts: Record<string, unknown>
        providerEvents: Array<{ sectionId: string; text: string }>
        expectedAffectedSectionIds: string[]
        expectedRuntimeAffectedSectionIds: string[]
        forbiddenFields: string[]
        assertions: string[]
      }>
    }
    expect(hash(bytes.toString("utf8"))).toBe("7de69145e6eae6e1c3a63f5b42a66784ac6ceeb004fe1b9f79f4cfaf6b3f9931")
    expect(fixture.schemaVersion).toBe(1)
    expect(fixture.cases.map((item) => item.id)).toEqual(["SL-CODING-01", "SL-SYSTEM-01", "SL-BEHAVIORAL-01"])
    expect(fixture.promptPolicy).toMatchObject({ audience: "Senior/Staff+", shell: "Live", practice: false, postAnswerScore: false })

    for (const item of fixture.cases) {
      const runtime = createTestOrchestrator()
      const context: ContextItem[] = [{ id: "staff-live", category: "instructions", revision: 1, content: "Answer at Senior/Staff+ level in Live mode. No Practice or post-answer scoring." }]
      if (item.mode === "behavioral") context.push({
        id: "dossier", category: "profile", revision: 1,
        content: JSON.stringify({ claims: [{ id: "migration", text: "Led an API migration across four teams", provenance: "verified", sourceRevision: 1 }] })
      })
      await runtime.orchestrator.start({ mode: item.mode, provider: "codex", model: "gpt-5.4", responseMode: "fast", language: "typescript", context })

      let input = String(item.inputArtifacts.question)
      if (item.mode === "coding") {
        runtime.providerFactory.queued.push({ selection, events: [{ type: "typed-payload", sequence: 1, payload: { kind: "structured", sections: [
          { id: "answer", body: item.providerEvents[0].text },
          { id: "plan", body: `- ${item.providerEvents[1].text}\n- Validate failure and concurrency. Time O(1); space O(n). Trade-off: consistency adds one store round trip.` },
          { id: "code", body: "export function allow(tokens: number): boolean { return tokens > 0 }" },
          { id: "explain", body: item.providerEvents.slice(2).map((event) => event.text).join(" ") }
        ] } }, completed] })
        await runtime.orchestrator.submit("mode-action", input, undefined, "generate-code")
      } else if (item.mode === "system-design") {
        const estimates = JSON.stringify([
          { name: "average", expression: "50000000/86400", result: 579, unit: "jobs/s", assumption: "uniform day" },
          { name: "peak", expression: "579*10", result: 5790, unit: "jobs/s", assumption: "10x peak" },
          { name: "storage", expression: "50000000*3000", result: 150000000000, unit: "bytes/day", assumption: "3 KB/job" }
        ])
        const graph = JSON.stringify({ nodes: [
          { id: "client", type: "client", label: "Client", detail: "submitter" },
          { id: "scheduler", type: "service", label: "Scheduler", detail: "leases" }
        ], edges: [{ id: "submit", from: "client", to: "scheduler", label: "submit" }] })
        runtime.providerFactory.queued.push({ selection, events: [{ type: "typed-payload", sequence: 1, payload: { kind: "structured", sections: [
          { id: "clarify", body: item.providerEvents[0].text }, { id: "estimate", body: estimates },
          { id: "architecture", body: graph }, { id: "data-apis", body: item.providerEvents[2].text },
          { id: "deep-dives-trade-offs", body: `${item.providerEvents[3].text} ${item.providerEvents[4].text}` }
        ] } }, completed] })
        await runtime.orchestrator.submit("mode-action", input)
      } else {
        runtime.providerFactory.queued.push({ selection, events: [{ type: "typed-payload", sequence: 1, payload: {
          kind: "behavioral", story: { id: "migration-story", title: "API migration", status: "verified", claims: [{ id: "migration", text: "Led an API migration across four teams", provenance: "verified", sourceRevision: 1 }] }
        } }, completed] })
        await runtime.orchestrator.submit("mode-action", input)
      }

      const before = currentActive(runtime.orchestrator.current())
      const beforeHashes = Object.fromEntries(before.sections.map((section) => [section.id, hash(section.body)]))
      if (item.mode === "system-design") {
        runtime.providerFactory.queued.push({ selection, events: [{ type: "typed-payload", sequence: 1, payload: {
          kind: "system-design-followup", impactedSectionIds: item.expectedRuntimeAffectedSectionIds,
          sections: item.expectedRuntimeAffectedSectionIds.map((id) => ({ id, body: "Regional failover uses fenced lease epochs, quorum closure, and explicit on-call ownership." })),
          whatChanged: ["Deepened regional failure handling only."]
        } }, completed] })
        await runtime.orchestrator.submit("mode-action", String(item.inputArtifacts.followUp))
      } else {
        const replacements = Object.fromEntries(item.expectedRuntimeAffectedSectionIds.map((id) => [id, `${before.sections.find((section) => section.id === id)?.body ?? ""}\nCorrection applied: ${item.id}`]))
        runtime.providerFactory.queued.push({ selection, events: [{ type: "typed-payload", sequence: 1, payload: { kind: "correction", sections: Object.entries(replacements).map(([id, body]) => ({ id, body })) } }, completed] })
        await runtime.orchestrator.submit("correction", String(item.inputArtifacts.correction ?? item.inputArtifacts.followUp), item.expectedRuntimeAffectedSectionIds)
      }
      const after = currentActive(runtime.orchestrator.current())
      const afterHashes = Object.fromEntries(after.sections.map((section) => [section.id, hash(section.body)]))
      for (const section of after.sections) {
        if (item.expectedRuntimeAffectedSectionIds.includes(section.id)) expect(afterHashes[section.id]).not.toBe(beforeHashes[section.id])
        else expect(afterHashes[section.id]).toBe(beforeHashes[section.id])
      }
      expect(runtime.providerFactory.prompts.every((prompt) => !/practiceScore|postAnswerScore/.test(prompt))).toBe(true)
      expect(item.forbiddenFields).toEqual(["practiceScore", "practiceFeedback", "postAnswerScore"])
      expect(item.assertions.length).toBeGreaterThanOrEqual(7)
    }
  })
})
