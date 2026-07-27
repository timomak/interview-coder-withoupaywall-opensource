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
      ),
      scanSourceText(
        "review-call.ts",
        "analytics.capture.call(analytics, 'opened')"
      ),
      scanSourceText(
        "review-secret-call.ts",
        "console.log.call(console, process.env.PROVIDER_API_KEY)"
      ),
      scanSourceText(
        "review-reassignment.ts",
        "let environment = {}; environment = process['env']; const payload = { key: environment.PROVIDER_API_KEY }; logger.warn(`${payload.key}`)"
      ),
      scanSourceText(
        "esm.mts",
        "import tracker from 'posthog-js'; const send = tracker.capture.bind(tracker); send('opened')"
      ),
      scanSourceText(
        "cjs.cjs",
        "const { capture } = require('analytics'); capture?.('opened')"
      ),
      scanSourceText(
        "dynamic.mjs",
        "const tracker = await import('posthog-js'); tracker['capture']?.apply(tracker, ['opened'])"
      ),
      scanSourceText(
        "payload.jsx",
        "const { PROVIDER_API_KEY: key } = process.env; const first = { key }; const second = { ...first }; console.info(`secret=${second.key}`)"
      ),
      scanSourceText(
        "branch.cts",
        "let value = {}; if (enabled) value = process.env; else value = {}; console.error(value.PROVIDER_API_KEY)"
      ),
      scanSourceText(
        "destructure.tsx",
        "let key; ({ PROVIDER_API_KEY: key } = process.env); logger.debug({ key })"
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
        "environment-secret logging entry point: secrets.ts",
        "analytics initialization entry point: review-call.ts",
        "environment-secret logging entry point: review-secret-call.ts",
        "environment-secret logging entry point: review-reassignment.ts",
        "analytics initialization entry point: esm.mts",
        "analytics initialization entry point: cjs.cjs",
        "analytics initialization entry point: dynamic.mjs",
        "environment-secret logging entry point: payload.jsx",
        "environment-secret logging entry point: branch.cts",
        "environment-secret logging entry point: destructure.tsx"
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
    expect(
      scanSourceText(
        "type-only.ts",
        [
          "import type * as Sentry from '@sentry/electron'",
          "function local(posthog: { capture(value: string): void }) {",
          "  posthog.capture('local only')",
          "}",
          "local({ capture() {} })"
        ].join("\n")
      )
    ).toEqual([])
    expect(
      scanSourceText(
        "shadowed.js",
        [
          "const process = { env: { PROVIDER_API_KEY: 'inert' } }",
          "const console = { log() {} }",
          "const require = () => ({ capture() {} })",
          "const posthog = require('posthog-js')",
          "console.log(process.env.PROVIDER_API_KEY)",
          "posthog.capture('local')"
        ].join("\n")
      )
    ).toEqual([])
    for (const extension of [
      "js",
      "mjs",
      "cjs",
      "jsx",
      "ts",
      "mts",
      "cts",
      "tsx"
    ]) {
      expect(
        scanSourceText(
          `inert.${extension}`,
          [
            "// analytics.capture.call(analytics, 'comment')",
            "const documentation = \"console.log(process.env.SECRET)\""
          ].join("\n")
        )
      ).toEqual([])
    }
    expect(scanSourceText("broken.ts", "const = ;")).toContain(
      "unparseable shipped source: broken.ts"
    )
    expect(isShippedSource("src/tests/runtime.ts")).toBe(true)
    expect(isShippedSource("src/features/runtime.test.ts")).toBe(false)
  })
})
