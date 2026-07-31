import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  INHERITED_ENTITLEMENTS,
  PARENT_ENTITLEMENTS,
  verifyMacPackagePolicy
} from "../../electron/qualification/packagePolicy"

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
})
