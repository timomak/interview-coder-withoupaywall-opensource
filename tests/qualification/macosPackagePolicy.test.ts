import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  INHERITED_ENTITLEMENTS,
  PARENT_ENTITLEMENTS,
  verifyMacPackagePolicy
} from "../../electron/qualification/packagePolicy"
import {
  deriveCodesignIdentity,
  deriveNotarizationTicketIdentity
} from "../../scripts/qualification/verify-mac-package.mjs"

const root = path.resolve(__dirname, "../..")

describe("macOS release package policy", () => {
  it("rejects any macOS entitlement allowlist mismatch", () => {
    expect(verifyMacPackagePolicy(root)).toMatchObject({
      platform: "mac",
      architectures: ["x64", "arm64"],
      target: "dmg"
    })
    expect(() =>
      verifyMacPackagePolicy(root, {
        parent: PARENT_ENTITLEMENTS,
        nested: [INHERITED_ENTITLEMENTS]
      })
    ).not.toThrow()
    expect(() =>
      verifyMacPackagePolicy(root, {
        parent: { ...PARENT_ENTITLEMENTS, "com.apple.security.get-task-allow": true },
        nested: [INHERITED_ENTITLEMENTS]
      })
    ).toThrow("Signed parent entitlement allowlist mismatch")
    expect(() =>
      verifyMacPackagePolicy(root, {
        parent: PARENT_ENTITLEMENTS,
        nested: [
          { ...INHERITED_ENTITLEMENTS, "com.apple.security.device.audio-input": true }
        ]
      })
    ).toThrow("Signed nested executable 1 entitlement allowlist mismatch")
  })

  it("derives signed package identity from macOS tool evidence rather than the statement", () => {
    const leaf = Buffer.from("leaf Developer ID certificate bytes")
    expect(deriveCodesignIdentity(
      "Executable=/Volumes/InterviewCopilot.app/Contents/MacOS/InterviewCopilot\nTeamIdentifier=ABCDEFGHIJ\n",
      leaf
    )).toEqual({
      signingTeamId: "ABCDEFGHIJ",
      signingCertificateSha256: "58f786644107745de424e455e745aa4932f273812723e50414e6aea6daca3d58"
    })
    expect(() => deriveCodesignIdentity("TeamIdentifier=not-a-team\n", leaf)).toThrow("independently derived")

    const ticket = Buffer.from("stapled Apple notarization ticket bytes")
    expect(deriveNotarizationTicketIdentity(
      "Downloaded ticket has been stored at file:///private/tmp/notary.ticket.\nThe validate action worked!\n",
      (target) => {
        expect(target).toBe("/private/tmp/notary.ticket")
        return ticket
      }
    )).toBe("c2051c6b6453c058408bc96b9a050ea22019e93b1a853b725c988d8bcf5db37d")
    expect(() => deriveNotarizationTicketIdentity("The validate action worked!\n")).toThrow("independently located")
  })
})
