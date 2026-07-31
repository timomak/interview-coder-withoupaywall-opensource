import fs from "node:fs"
import path from "node:path"

export const PARENT_ENTITLEMENTS = Object.freeze({
  "com.apple.security.cs.allow-jit": true,
  "com.apple.security.cs.allow-unsigned-executable-memory": true,
  "com.apple.security.cs.disable-library-validation": true,
  "com.apple.security.device.audio-input": true,
  "com.apple.security.personal-information.speech-recognition": true
})

export const INHERITED_ENTITLEMENTS = Object.freeze({
  "com.apple.security.cs.allow-jit": true,
  "com.apple.security.cs.allow-unsigned-executable-memory": true,
  "com.apple.security.cs.disable-library-validation": true
})

export type EntitlementMap = Readonly<Record<string, boolean>>

export interface PackagePolicyReport {
  readonly platform: "mac"
  readonly architectures: readonly ["x64", "arm64"]
  readonly target: "dmg"
  readonly parentEntitlements: EntitlementMap
  readonly inheritedEntitlements: EntitlementMap
}

export function parseBooleanEntitlements(plist: string): EntitlementMap {
  const body = plist.match(/<dict>([\s\S]*?)<\/dict>/)?.[1]
  if (!body) throw new Error("Entitlements plist must contain one dictionary")
  const result: Record<string, boolean> = {}
  const matcher = /<key>([^<]+)<\/key>\s*<(true|false)\s*\/>/g
  let match: RegExpExecArray | null
  while ((match = matcher.exec(body))) {
    if (match[1] in result) throw new Error(`Duplicate entitlement: ${match[1]}`)
    result[match[1]] = match[2] === "true"
  }
  if (Object.keys(result).length === 0 || body.replace(matcher, "").trim()) {
    throw new Error("Entitlements must contain only boolean key/value pairs")
  }
  return result
}

function exactMap(actual: EntitlementMap, expected: EntitlementMap, role: string) {
  if (JSON.stringify(Object.entries(actual).sort()) !== JSON.stringify(Object.entries(expected).sort())) {
    throw new Error(`${role} entitlement allowlist mismatch`)
  }
}

export function verifyMacPackagePolicy(
  root: string,
  extracted?: {
    readonly parent: EntitlementMap
    readonly nested: readonly EntitlementMap[]
  }
): PackagePolicyReport {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
  const build = pkg.build
  if (
    !build ||
    Object.prototype.hasOwnProperty.call(build, "win") ||
    Object.prototype.hasOwnProperty.call(build, "linux")
  ) {
    throw new Error("Release package policy must be macOS-only")
  }
  if (Object.prototype.hasOwnProperty.call(build, "publish")) {
    throw new Error("Release package policy must not contain an automatic publish target")
  }
  const targets = build.mac?.target
  const expectedTargets = [{ target: "dmg", arch: ["x64", "arm64"] }]
  if (JSON.stringify(targets) !== JSON.stringify(expectedTargets)) {
    throw new Error("Release package policy must emit one arm64/x64 DMG target")
  }
  if (
    build.mac.entitlements !== "build/entitlements.mac.plist" ||
    build.mac.entitlementsInherit !== "build/entitlements.mac.inherit.plist"
  ) {
    throw new Error("Parent and inherited entitlements must use separate plists")
  }
  if (build.mac.hardenedRuntime !== true || build.mac.notarize !== true) {
    throw new Error("Hardened runtime and notarization are mandatory")
  }
  const parent = parseBooleanEntitlements(
    fs.readFileSync(path.join(root, build.mac.entitlements), "utf8")
  )
  const inherited = parseBooleanEntitlements(
    fs.readFileSync(path.join(root, build.mac.entitlementsInherit), "utf8")
  )
  exactMap(parent, PARENT_ENTITLEMENTS, "Parent")
  exactMap(inherited, INHERITED_ENTITLEMENTS, "Inherited")
  if (extracted) {
    exactMap(extracted.parent, PARENT_ENTITLEMENTS, "Signed parent")
    if (extracted.nested.length === 0) {
      throw new Error("Every signed nested executable must be inspected")
    }
    extracted.nested.forEach((item, index) =>
      exactMap(item, INHERITED_ENTITLEMENTS, `Signed nested executable ${index + 1}`)
    )
  }
  return {
    platform: "mac",
    architectures: ["x64", "arm64"],
    target: "dmg",
    parentEntitlements: parent,
    inheritedEntitlements: inherited
  }
}
