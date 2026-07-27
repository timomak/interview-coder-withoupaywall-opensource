import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  isShippedSource,
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
    expect(
      [
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
    ).toEqual(
      expect.arrayContaining([
        "analytics initialization entry point: analytics.ts",
        "device fingerprinting entry point: device.ts",
        "automatic crash upload entry point: crash.ts",
        "environment-secret logging entry point: secrets.ts"
      ])
    )
  })

  it("P01-R1-B05 rejects syntax-aware privacy bypasses without inert-text false positives", () => {
    expect(
      scanDependencyNames({
        dependencies: {
          "@sentry/electron": "1.0.0",
          "@fingerprintjs/fingerprintjs": "1.0.0",
          "node-machine-id": "1.0.0",
          "plausible-tracker": "1.0.0",
          rollbar: "1.0.0"
        }
      })
    ).toHaveLength(5)

    const violations = [
      scanSourceText(
        "analytics.ts",
        "const tracker = posthog; tracker.capture('opened')"
      ),
      scanSourceText(
        "device.ts",
        "const aliasedMachineIdentifier = machineId; aliasedMachineIdentifier()"
      ),
      scanSourceText(
        "device-import.ts",
        "import { machineId as identifier } from 'node-machine-id'; identifier()"
      ),
      scanSourceText(
        "plausible.cjs",
        "const plausible = require('plausible-tracker'); plausible()"
      ),
      scanSourceText(
        "rollbar.ts",
        "import RollbarClient from 'rollbar'; new RollbarClient()"
      ),
      scanSourceText(
        "crash.ts",
        "import { crashReporter as reporter } from 'electron'; reporter.start()"
      ),
      scanSourceText(
        "secrets.ts",
        "const environment = process['env']; console.info(environment.PROVIDER_API_KEY)"
      )
    ].flat()

    expect(violations).toEqual(
      expect.arrayContaining([
        "analytics initialization entry point: analytics.ts",
        "device fingerprinting entry point: device.ts",
        "forbidden analytics/crash/fingerprint import entry point: device-import.ts",
        "forbidden analytics/crash/fingerprint import entry point: plausible.cjs",
        "forbidden analytics/crash/fingerprint import entry point: rollbar.ts",
        "automatic crash upload entry point: crash.ts",
        "environment-secret logging entry point: secrets.ts"
      ])
    )

    expect(
      scanSourceText(
        "harmless.ts",
        [
          "// posthog.capture(); crashReporter.start();",
          "const documentation = \"process.env and node-machine-id are forbidden\"",
          "console.log(\"process['env'] is configuration syntax\")"
        ].join("\n")
      )
    ).toEqual([])
    expect(isShippedSource("src/tests/runtime.ts")).toBe(true)
    expect(isShippedSource("src/features/runtime.test.ts")).toBe(false)
  })
})
