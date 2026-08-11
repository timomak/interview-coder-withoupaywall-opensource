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

function evaluateAssertion(assertion: string, before: string, after: string): boolean {
  const text = `${before}\n${after}`.toLowerCase()
  const checks: Record<string, () => boolean> = {
    ambiguity: () => /ambiguous|confirm|assum/.test(text),
    "trade-off": () => /trade-off|round trip|consistency/.test(text),
    "time-complexity": () => /time o\(1\)/.test(text),
    "space-complexity": () => /space o\(/.test(text),
    "production-failure": () => /fail closed|store failure|degraded/.test(text),
    testing: () => /test concurrency|clock skew|outage/.test(text),
    maintainability: () => /interface|maintain/.test(text),
    "five-sections": () => ["clarify", "estimate", "architecture", "data-apis", "deep-dives-trade-offs"].every((term) => before.includes(term)),
    "2-4-unit-estimates": () => /jobs\/s/.test(text) && /bytes\/day/.test(text),
    assumptions: () => /assum|unknown cost ceiling/.test(text),
    "vendor-neutral": () => /vendor-neutral/.test(text),
    "regional-failure": () => /region|fenc|quorum/.test(text),
    migration: () => /migrat|dual reads|shadow/.test(text),
    ownership: () => /on-call|ownership/.test(text),
    cost: () => /cost ceiling|storage\/egress\/compute/.test(text),
    "scoped-follow-up-hash": () => true,
    "dossier-only": () => /provenance|verified|sourceRevision/.test(text) && !/revenue[^\n]*[0-9]+%/.test(text),
    leadership: () => /led an api migration/.test(text),
    influence: () => /without direct authority|influence/.test(text),
    "organizational-impact": () => /coordinated rollout|organizational impact/.test(text),
    "unknown-metrics-qualitative": () => /unknown: revenue|does not verify a revenue/.test(text),
    "concise-full-same-facts": () => /three teams/.test(after) && /shared rollout scorecard/.test(after),
    "correction-scoped-hash": () => true
  }
  return checks[assertion]?.() ?? false
}

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
    expect(hash(bytes.toString("utf8"))).toBe("ca033f3ceb245d95b4f0444d1fd7f819672860cd010c3f0da1d16e7d632c338e")
    expect(fixture.schemaVersion).toBe(1)
    expect(fixture.cases.map((item) => item.id)).toEqual(["SL-CODING-01", "SL-SYSTEM-01", "SL-BEHAVIORAL-01"])
    expect(fixture.promptPolicy).toMatchObject({ audience: "Senior/Staff+", shell: "Live", practice: false, postAnswerScore: false })

    for (const item of fixture.cases) {
      const runtime = createTestOrchestrator()
      const consumedProviderEvents = new Set<string>()
      const providerText = (sectionId: string): string => {
        const matches = item.providerEvents.filter((event) => event.sectionId === sectionId)
        expect(matches, `${item.id}/${sectionId} must identify one provider event`).toHaveLength(1)
        expect(consumedProviderEvents.has(sectionId), `${item.id}/${sectionId} provider event reused`).toBe(false)
        consumedProviderEvents.add(sectionId)
        return matches[0]!.text
      }
      const context: ContextItem[] = [{ id: "staff-live", category: "instructions", revision: 1, content: "Answer at Senior/Staff+ level in Live mode. No Practice or post-answer scoring." }]
      if (item.mode === "behavioral") context.push({
        id: "dossier", category: "profile", revision: 1,
        content: JSON.stringify({ claims: [{ id: "migration", text: "Led an API migration across four teams", provenance: "verified", sourceRevision: 1 }] })
      })
      expect(item.expectedAffectedSectionIds).toEqual(
        item.providerEvents.filter((event) => item.expectedAffectedSectionIds.includes(event.sectionId)).map((event) => event.sectionId)
      )
      await runtime.orchestrator.start({ mode: item.mode, provider: "codex", model: "gpt-5.4", responseMode: "fast", language: "typescript", context })

      let input = String(item.inputArtifacts.question)
      if (item.mode === "coding") {
        runtime.providerFactory.queued.push({ selection, events: [{ type: "typed-payload", sequence: 1, payload: { kind: "structured", sections: [
          { id: "answer", body: providerText("ambiguity") },
          { id: "plan", body: `- Trade-off: ${providerText("approach")}\n- ${providerText("complexity")}` },
          { id: "code", body: "export function allow(tokens: number): boolean { return tokens > 0 }" },
          { id: "explain", body: providerText("testing") }
        ] } }, completed] })
        await runtime.orchestrator.submit("mode-action", input, undefined, "generate-code")
      } else if (item.mode === "system-design") {
        const estimateSource = providerText("estimates")
        const estimates = JSON.stringify([
          { name: "average", expression: "50000000/86400", result: 579, unit: "jobs/s", assumption: estimateSource },
          { name: "peak", expression: "579*10", result: 5790, unit: "jobs/s", assumption: estimateSource },
          { name: "storage", expression: "50000000*3000", result: 150000000000, unit: "bytes/day", assumption: estimateSource }
        ])
        const graph = JSON.stringify({ nodes: [
          { id: "client", type: "client", label: "Client", detail: "submitter" },
          { id: "scheduler", type: "service", label: "Scheduler", detail: providerText("architecture") }
        ], edges: [{ id: "submit", from: "client", to: "scheduler", label: "submit" }] })
        runtime.providerFactory.queued.push({ selection, events: [{ type: "typed-payload", sequence: 1, payload: { kind: "structured", sections: [
          { id: "clarify", body: providerText("requirements") }, { id: "estimate", body: estimates },
          { id: "architecture", body: graph }, { id: "data-apis", body: providerText("operations") },
          { id: "deep-dives-trade-offs", body: "Regional failure handling is the next focused follow-up." }
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
        const reliability = providerText("reliability")
        runtime.providerFactory.queued.push({ selection, events: [{ type: "typed-payload", sequence: 1, payload: {
          kind: "system-design-followup", impactedSectionIds: item.expectedRuntimeAffectedSectionIds,
          sections: item.expectedRuntimeAffectedSectionIds.map((id) => ({ id, body: reliability })),
          whatChanged: ["Deepened regional failure handling only."]
        } }, completed] })
        await runtime.orchestrator.submit("mode-action", String(item.inputArtifacts.followUp))
      } else {
        const replacements = item.mode === "behavioral"
          ? {
              answer: providerText("full-answer"),
              star: providerText("talking-points"),
              evidence: providerText("evidence"),
              "follow-ups": providerText("follow-ups")
            }
          : { explain: providerText("failure") }
        runtime.providerFactory.queued.push({ selection, events: [{ type: "typed-payload", sequence: 1, payload: { kind: "correction", sections: Object.entries(replacements).map(([id, body]) => ({ id, body })) } }, completed] })
        await runtime.orchestrator.submit("correction", String(item.inputArtifacts.correction ?? item.inputArtifacts.followUp), item.expectedRuntimeAffectedSectionIds)
      }
      const after = currentActive(runtime.orchestrator.current())
      const afterHashes = Object.fromEntries(after.sections.map((section) => [section.id, hash(section.body)]))
      for (const section of after.sections) {
        if (item.expectedRuntimeAffectedSectionIds.includes(section.id)) expect(afterHashes[section.id]).not.toBe(beforeHashes[section.id])
        else expect(afterHashes[section.id]).toBe(beforeHashes[section.id])
      }
      const beforeText = before.sections.map((section) => `${section.id}\n${section.body}`).join("\n")
      const afterText = after.sections.map((section) => `${section.id}\n${section.body}`).join("\n")
      for (const assertion of item.assertions) {
        expect(evaluateAssertion(assertion, beforeText, afterText), `${item.id}/${assertion}`).toBe(true)
      }
      expect([...consumedProviderEvents].sort()).toEqual(item.providerEvents.map((event) => event.sectionId).sort())
      expect(runtime.providerFactory.queued).toHaveLength(0)
      expect(runtime.providerFactory.prompts.every((prompt) => !/practiceScore|postAnswerScore/.test(prompt))).toBe(true)
      expect(item.forbiddenFields).toEqual(["practiceScore", "practiceFeedback", "postAnswerScore"])
      expect(item.assertions.length).toBeGreaterThanOrEqual(7)
    }
  })
})
