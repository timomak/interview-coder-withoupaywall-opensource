import { expect, it } from "vitest"
import {
  createPromptDraft,
  validatePromptTemplate
} from "./model"

it("limits templates to three protected core modes", () => {
  const valid = createPromptDraft({
    id: "user:behavioral-one",
    mode: "behavioral",
    name: "Behavioral one",
    instructions: "Keep the answer concise and evidence-led.",
    source: "manual-edit",
    updatedAt: "2026-07-31T10:00:00.000Z"
  })
  expect(valid.candidate.modeSchema).toBe("behavioral-response-v1")
  expect(() =>
    createPromptDraft({
      id: "user:custom-mode",
      mode: "practice" as never,
      name: "Custom mode",
      instructions: "Do something else.",
      source: "manual-edit",
      updatedAt: "2026-07-31T10:00:00.000Z"
    })
  ).toThrow("malformed")
  expect(() =>
    validatePromptTemplate({
      ...valid.candidate,
      modeSchema: "coding-response-v1"
    })
  ).toThrow("malformed")
})
