import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, it } from "vitest"
import { EncryptedRecordRepository } from "./repositories"
import { StoragePaths } from "./paths"
import { PromptTemplateRepository } from "../prompts"
import { createPromptDraft } from "../../src/features/prompts"
import type { PromptStoredRecord } from "../../src/features/prompts"

it("migrates encrypts and isolates invalid templates", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ic-m08-"))
  const key = Buffer.alloc(32, 0x58)
  try {
    const records = new EncryptedRecordRepository<PromptStoredRecord | object>(
      new StoragePaths(root),
      { get: async () => Buffer.from(key) },
      undefined,
      "templates"
    )
    const repository = new PromptTemplateRepository(records, () => "2026-07-31T10:00:00.000Z")
    const marker = "PRIVATE_TEMPLATE_MARKER_7123"
    const draft = createPromptDraft({
      id: "user:private-template",
      mode: "behavioral",
      name: "Private template",
      instructions: `Prefer verified facts. ${marker}`,
      source: "manual-edit",
      updatedAt: "2026-07-31T10:00:00.000Z"
    })
    await repository.apply(repository.review(draft))
    await repository.select("behavioral", draft.candidate.id)
    await records.put("newer", { schemaVersion: 2, recordType: "template", marker: "NEWER_SECRET" })
    await records.put("malformed", { schemaVersion: 1, recordType: "template", marker: "MALFORMED_SECRET" })

    const catalog = await repository.catalog()
    expect(catalog.templates.some((value) => value.id === draft.candidate.id)).toBe(true)
    expect(catalog.templates.filter((value) => value.kind === "built-in")).toHaveLength(3)
    expect(catalog.quarantine).toEqual(expect.arrayContaining([
      { recordId: "newer", reason: "newer-version" },
      { recordId: "malformed", reason: "malformed" }
    ]))
    expect(await records.get("newer")).toMatchObject({ schemaVersion: 2 })
    const bytes = fs.readdirSync(path.join(root, "templates"))
      .map((file) => fs.readFileSync(path.join(root, "templates", file)))
      .reduce((all, value) => Buffer.concat([all, value]), Buffer.alloc(0))
    for (const plaintext of [marker, "PRIVATE_TEMPLATE_MARKER", "user:private-template", "NEWER_SECRET", "MALFORMED_SECRET"]) {
      expect(bytes.includes(Buffer.from(plaintext))).toBe(false)
    }
  } finally {
    key.fill(0)
    fs.rmSync(root, { recursive: true, force: true })
  }
})
