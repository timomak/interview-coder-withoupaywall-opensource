import { describe, expect, it } from "vitest"
import {
  createDossierDraft,
  reviewDossier,
  validateCanonicalDossier
} from "./markdown"

const source = `# Candidate
## Summary
- Staff engineer
## Skills
- TypeScript
## Experience
- Built distributed systems
## Stories
- Led a safe migration`

describe("candidate dossier", () => {
  it("builds reviews and edits canonical Markdown", () => {
    const imported = createDossierDraft(source, "resume-import")
    expect(validateCanonicalDossier(imported.markdown)).toEqual([])
    expect(imported.claims.every((claim) => claim.provenance === "resume-import")).toBe(true)
    const reviewed = reviewDossier(imported)
    const edited = createDossierDraft(
      `${reviewed.markdown}\n- Mentored two engineers`,
      "manual-edit",
      reviewed
    )
    expect(reviewed.status).toBe("reviewed")
    expect(edited).toMatchObject({ revision: 2, status: "draft" })
    expect(edited.claims.at(-1)?.provenance).toBe("manual-edit")
  })
})
