import crypto from "node:crypto"
import process from "node:process"
import { startVitest } from "vitest/node"
import VerificationCountReporter from "./vitest-count-reporter.mjs"
import { canonicalJson } from "./phase-reporter.mjs"

/** @type {Record<string, string[]>} */
const SUITES = {
  all: [],
  legacy: ["renderer/src/App.test.tsx"],
  unit: [],
  p01: [
    "tests/policy",
    "electron/captureProtection.test.ts",
    "electron/windowOpenPolicy.test.ts"
  ],
  p02: [
    "electron/config/configMigration.test.ts",
    "electron/providers/conversationIdBoundary.test.ts",
    "electron/providers/eventNormalization.contract.test.ts",
    "electron/providers/noFallback.contract.test.ts",
    "electron/providers/persistence.contract.test.ts",
    "electron/providers/processSafety.test.ts",
    "electron/providers/providerBoundary.test.ts",
    "electron/providers/selectionSnapshot.test.ts",
    "src/features/onboarding/ProviderSetup.test.tsx"
  ],
  p03: [
    "electron/ScreenshotHelper.test.ts",
    "electron/storage/atomicity.test.ts",
    "electron/storage/envelopeCrypto.test.ts",
    "electron/storage/keyLifecycle.test.ts",
    "electron/storage/pathSafety.test.ts",
    "electron/storage/plaintextLeak.test.ts",
    "electron/storage/plaintextMigration.test.ts",
    "electron/storage/recovery.test.ts",
    "electron/storage/retentionPolicy.test.ts"
  ],
  p04: [
    "src/domain/interview/sessionLifecycle.test.ts",
    "src/domain/interview/sessionReducer.property.test.ts",
    "electron/orchestrator/contextPolicy.test.ts",
    "electron/orchestrator/pendingArtifacts.test.ts",
    "electron/orchestrator/evidenceAuthority.test.ts",
    "src/domain/interview/contextStatus.test.ts",
    "electron/orchestrator/progressiveSections.test.ts",
    "electron/orchestrator/cancelContinue.test.ts",
    "electron/orchestrator/resetSemantics.test.ts",
    "electron/orchestrator/crashRecovery.test.ts",
    "src/domain/interview/contextDetail.test.ts",
    "electron/orchestrator/sharedConversation.test.ts",
    "electron/orchestrator/responseRouting.test.ts",
    "electron/orchestrator/bestEffortClarification.test.ts",
    "electron/orchestrator/correctionRevision.test.ts"
  ],
  p05: [
    "electron/window/windowVisibility.test.ts",
    "electron/window/composerVisibility.test.ts",
    "electron/window/captureProtection.integration.test.ts",
    "electron/window/displayGeometry.test.ts",
    "electron/config/shellPreferencesMigration.test.ts",
    "electron/shortcuts/shortcutRegistry.test.ts",
    "electron/capture/primaryDisplayCapture.test.ts",
    "src/features/shell/CommandRail.test.tsx",
    "src/features/shell/CompactComposer.test.tsx",
    "src/features/shell/pointerRegions.test.tsx",
    "src/features/shell/accessibility.test.tsx",
    "src/features/shell/navigationShortcuts.test.tsx"
  ],
  "electron-shell": [
    "electron/window/windowVisibility.test.ts",
    "electron/window/composerVisibility.test.ts",
    "electron/window/captureProtection.integration.test.ts",
    "electron/window/displayGeometry.test.ts",
    "electron/shortcuts/shortcutRegistry.test.ts",
    "electron/capture/primaryDisplayCapture.test.ts"
  ]
}
const RESULT_PREFIX = "VERIFICATION_COORDINATOR_RESULT "

async function readControllerChallenge() {
  if (process.stdin.isTTY) return null
  let bytes = ""
  for await (const chunk of process.stdin) {
    bytes += chunk.toString("utf8")
    if (Buffer.byteLength(bytes) > 16_384) {
      throw new Error("controller challenge is oversized")
    }
  }
  if (bytes.trim() === "") return null
  const lines = bytes.trimEnd().split("\n")
  if (lines.length !== 1) throw new Error("controller challenge must be one record")
  const challenge = JSON.parse(lines[0])
  if (
    challenge?.schemaVersion !== 1 ||
    challenge?.protocol !== "vitest-controller-challenge-v1" ||
    typeof challenge?.nonce !== "string" ||
    !/^[a-f0-9]{64}$/.test(challenge.nonce) ||
    typeof challenge?.entryLabel !== "string" ||
    typeof challenge?.bindingHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(challenge.bindingHash) ||
    typeof challenge?.authenticationKey !== "string" ||
    !/^[a-f0-9]{64}$/.test(challenge.authenticationKey)
  ) {
    throw new Error("controller challenge is invalid")
  }
  return challenge
}

/**
 * @param {{nonce: string, entryLabel: string, bindingHash: string, authenticationKey: string}} challenge
 * @param {Record<string, unknown>} record
 */
function authenticatedEnvelope(challenge, record) {
  const payload = {
    ...record,
    schemaVersion: 4,
    protocol: "vitest-coordinator-result-v4",
    nonce: challenge.nonce,
    entryLabel: challenge.entryLabel,
    bindingHash: challenge.bindingHash
  }
  const serialized = canonicalJson(payload)
  return {
    payloadBase64: Buffer.from(serialized).toString("base64"),
    hmacSha256: crypto
      .createHmac("sha256", challenge.authenticationKey)
      .update(serialized)
      .digest("hex")
  }
}

async function main() {
  const [suiteName, ...extraArguments] = process.argv.slice(2)
  if (!(suiteName in SUITES)) throw new Error(`unknown trusted test suite: ${suiteName}`)
  if (
    extraArguments.some(
      (argument) => argument !== "--reporter=verbose"
    )
  ) {
    throw new Error(`unsupported trusted test argument: ${extraArguments.join(" ")}`)
  }

  for (const key of Object.keys(process.env)) {
    if (key.startsWith("VERIFICATION_")) delete process.env[key]
  }
  const challenge = await readControllerChallenge()
  let evidenceRecords = 0
  const reporter = new VerificationCountReporter((record) => {
    evidenceRecords += 1
    if (evidenceRecords !== 1) {
      throw new Error("trusted reporter produced duplicate evidence")
    }
    if (challenge) {
      const envelope = authenticatedEnvelope(challenge, record)
      process.stdout.write(
        `\n${RESULT_PREFIX}${Buffer.from(JSON.stringify(envelope)).toString("base64")}\n`
      )
    }
  })

  await startVitest(
    "test",
    SUITES[suiteName],
    {
      config: "vitest.config.ts",
      run: true,
      pool: "forks",
      reporters: ["verbose", reporter]
    }
  )
  if (evidenceRecords !== 1) {
    throw new Error("trusted reporter did not produce exactly one evidence record")
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
