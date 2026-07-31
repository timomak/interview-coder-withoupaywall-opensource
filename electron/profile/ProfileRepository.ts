import fs from "node:fs/promises"
import path from "node:path"
import type { RecordRepository } from "../storage"
import {
  isProfileBundle,
  type ProfileBundle
} from "../../src/features/profile/types"
import {
  sanitizeProfileMarkdown,
  validateCanonicalDossier
} from "../../src/features/profile/markdown"

const PROFILE_RECORD_ID = "candidate-profile-bundle-v1"

export class ProfileRepository {
  constructor(
    private readonly records: RecordRepository<ProfileBundle>
  ) {}

  async load(): Promise<ProfileBundle> {
    return (
      (await this.records.get(
        PROFILE_RECORD_ID,
        "application/vnd.interviewcopilot.profile+json"
      )) ?? {
        schemaVersion: 1,
        opportunities: []
      }
    )
  }

  async save(bundle: ProfileBundle): Promise<void> {
    if (!isProfileBundle(bundle)) {
      throw new Error("Unsupported profile bundle")
    }
    if (
      bundle.dossier &&
      (validateCanonicalDossier(bundle.dossier.markdown).length > 0 ||
        sanitizeProfileMarkdown(bundle.dossier.markdown) !==
          bundle.dossier.markdown)
    ) {
      throw new Error("Candidate dossier is not canonical")
    }
    if (
      bundle.opportunities.some(
        (opportunity) =>
          sanitizeProfileMarkdown(opportunity.markdown) !==
          opportunity.markdown
      )
    ) {
      throw new Error("Opportunity Markdown is unsafe")
    }
    if (
      bundle.activeOpportunityId &&
      !bundle.opportunities.some(
        (opportunity) => opportunity.id === bundle.activeOpportunityId
      )
    ) {
      throw new Error("Active opportunity is missing")
    }
    await this.records.put(
      PROFILE_RECORD_ID,
      bundle,
      "application/vnd.interviewcopilot.profile+json"
    )
  }

  async exportDossier(destination: string): Promise<void> {
    if (!path.isAbsolute(destination)) {
      throw new Error("Profile export requires an explicit absolute destination")
    }
    const bundle = await this.load()
    if (!bundle.dossier) throw new Error("No candidate dossier is available")
    const handle = await fs.open(destination, "wx", 0o600)
    try {
      await handle.writeFile(`${bundle.dossier.markdown}\n`, "utf8")
      await handle.sync()
    } finally {
      await handle.close()
    }
  }
}
