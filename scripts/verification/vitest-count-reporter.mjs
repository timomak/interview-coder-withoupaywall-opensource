import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const VITEST_VERSION = require("vitest/package.json").version

function collectTests(task, filePath, ancestors, tests) {
  if (task.type === "test") {
    const state =
      task.mode === "skip" || task.mode === "todo"
        ? "skip"
        : task.result?.state ?? "fail"
    tests.push({
      file: filePath,
      name: task.name,
      fullName: [...ancestors, task.name].join(" > "),
      state
    })
    return
  }

  const nextAncestors =
    task.type === "suite" && task.name ? [...ancestors, task.name] : ancestors
  for (const child of task.tasks ?? []) {
    collectTests(child, filePath, nextAncestors, tests)
  }
}

export default class VerificationCountReporter {
  onFinished(files = []) {
    const tests = []
    for (const file of files) {
      const filePath = path.relative(
        process.cwd(),
        file.filepath ?? file.name ?? "unknown"
      )
      collectTests(file, filePath, [], tests)
    }

    const counts = {
      passed: tests.filter((test) => test.state === "pass").length,
      failed: tests.filter((test) => test.state === "fail").length,
      skipped: tests.filter((test) => test.state === "skip").length
    }

    const resultPath = process.env.VERIFICATION_RESULT_PATH
    const entryLabel = process.env.VERIFICATION_ENTRY_LABEL
    const nonce = process.env.VERIFICATION_RESULT_NONCE
    const bindingHash = process.env.VERIFICATION_RUNNER_BINDING_SHA256
    const channelValues = [resultPath, entryLabel, nonce, bindingHash]
    const populatedChannelValues = channelValues.filter(Boolean).length
    if (populatedChannelValues !== 0 && populatedChannelValues !== 4) {
      throw new Error("incomplete verification result channel")
    }

    if (resultPath && entryLabel && nonce && bindingHash) {
      fs.mkdirSync(path.dirname(resultPath), { recursive: true })
      fs.writeFileSync(
        resultPath,
        `${JSON.stringify(
          {
            schemaVersion: 2,
            protocol: "vitest-result-v2",
            nonce,
            entryLabel,
            bindingHash,
            runner: {
              name: "vitest",
              version: VITEST_VERSION
            },
            reporter: {
              name: "verification-count-reporter",
              version: 2
            },
            counts,
            tests: tests.map((test) => ({
              ...test,
              fileSha256: crypto
                .createHash("sha256")
                .update(fs.readFileSync(path.resolve(process.cwd(), test.file)))
                .digest("hex")
            }))
          },
          null,
          2
        )}\n`,
        { flag: "wx" }
      )
    }

    process.stdout.write(
      `\nVerification reporter observed ${counts.passed} passed, ` +
        `${counts.failed} failed, ${counts.skipped} skipped.\n`
    )
  }
}
