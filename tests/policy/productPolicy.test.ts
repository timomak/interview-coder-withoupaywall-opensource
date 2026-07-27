import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  scanDependencyNames,
  scanProductPolicy,
  scanSourceText,
  validateIdentity
} from "../../scripts/verification/product-policy.mjs"

describe("product policy", () => {
  it("enforces canonical identity and AGPL metadata", () => {
    expect(scanProductPolicy(process.cwd())).toEqual([])

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    )
    const visibleFiles = { "index.html": "<title>InterviewCopilot</title>" }
    expect(
      validateIdentity(
        {
          ...packageJson,
          license: "MIT",
          build: { ...packageJson.build, productName: "Legacy Product" }
        },
        visibleFiles
      )
    ).toEqual(
      expect.arrayContaining([
        "product name must be InterviewCopilot",
        "license must be AGPL-3.0-or-later"
      ])
    )
  })

  it("rejects telemetry crash upload and secret logging entry points", () => {
    expect(
      scanDependencyNames({
        dependencies: {
          "@sentry/electron": "1.0.0",
          "@fingerprintjs/fingerprintjs": "1.0.0"
        }
      })
    ).toHaveLength(2)

    const violations = [
      scanSourceText("analytics.ts", "analytics.track('opened')"),
      scanSourceText("device.ts", "machineIdSync()"),
      scanSourceText(
        "crash.ts",
        "crashReporter.start({ uploadToServer: true })"
      ),
      scanSourceText(
        "secrets.ts",
        "console.log(process.env.PROVIDER_API_KEY)"
      )
    ].flat()

    expect(violations).toEqual(
      expect.arrayContaining([
        "analytics initialization entry point: analytics.ts",
        "device fingerprinting entry point: device.ts",
        "automatic crash upload entry point: crash.ts",
        "environment-secret logging entry point: secrets.ts"
      ])
    )
  })
})
