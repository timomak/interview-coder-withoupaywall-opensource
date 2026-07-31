import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { EncryptedRecordRepository } from "./repositories"
import { StoragePaths } from "./paths"
import { ProfileRepository } from "../profile/ProfileRepository"
import type { ProfileBundle } from "../../src/features/profile/types"

describe("profile encrypted storage", () => {
  it("encrypts reusable personal context and indexes", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ic-profile-"))
    const key = Buffer.alloc(32, 0x39)
    try {
      const records = new EncryptedRecordRepository<ProfileBundle>(
        new StoragePaths(directory),
        { get: async () => Buffer.from(key) },
        undefined,
        "profiles"
      )
      const profiles = new ProfileRepository(records)
      const secret = "PRIVATE_CANDIDATE_SEARCH_TERM_9922"
      const bundle: ProfileBundle = {
        schemaVersion: 1,
        dossier: {
          schemaVersion: 1,
          revision: 1,
          markdown: `# Candidate\n## Summary\n- ${secret}\n## Skills\n- TS\n## Experience\n- Work\n## Stories\n- Story`,
          claims: [],
          status: "reviewed"
        },
        opportunities: []
      }
      await profiles.save(bundle)
      expect(await profiles.load()).toEqual(bundle)
      expect(await records.search(secret)).toHaveLength(1)
      const bytes = fs
        .readdirSync(path.join(directory, "profiles"))
        .map((file) => fs.readFileSync(path.join(directory, "profiles", file)))
        .reduce((all, part) => Buffer.concat([all, part]), Buffer.alloc(0))
      expect(bytes.includes(Buffer.from(secret))).toBe(false)
    } finally {
      key.fill(0)
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
