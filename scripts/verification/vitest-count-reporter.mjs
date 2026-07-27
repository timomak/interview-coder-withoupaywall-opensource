import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const VITEST_VERSION = require("vitest/package.json").version

/**
 * @param {import("@vitest/runner").Task} task
 * @param {string} filePath
 * @param {string[]} ancestors
 * @param {Array<{file: string, name: string, fullName: string, state: "pass" | "fail" | "skip"}>} tests
 */
function collectTests(task, filePath, ancestors, tests) {
  if (task.type === "test") {
    const state =
      task.mode === "skip" || task.mode === "todo"
        ? "skip"
        : task.result?.state === "pass"
          ? "pass"
          : task.result?.state === "skip"
            ? "skip"
            : "fail"
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
  for (const child of "tasks" in task ? task.tasks : []) {
    collectTests(child, filePath, nextAncestors, tests)
  }
}

export default class VerificationCountReporter {
  /**
   * @param {(record: Record<string, unknown>) => void} [emitEvidence]
   */
  constructor(emitEvidence = () => undefined) {
    this.emitEvidence = emitEvidence
    /** @type {string[]} */
    this.includeFiles = []
  }

  /** @param {import("vitest").Vitest} context */
  onInit(context) {
    this.includeFiles = [...context.config.include].sort()
  }

  /** @param {import("@vitest/runner").File[]} [files] */
  onFinished(files = []) {
    /** @type {Array<{file: string, name: string, fullName: string, state: "pass" | "fail" | "skip"}>} */
    const tests = []
    for (const file of files) {
      const filePath = path
        .relative(process.cwd(), file.filepath ?? file.name ?? "unknown")
        .split(path.sep)
        .join("/")
      collectTests(file, filePath, [], tests)
    }

    const counts = {
      passed: tests.filter((test) => test.state === "pass").length,
      failed: tests.filter((test) => test.state === "fail").length,
      skipped: tests.filter((test) => test.state === "skip").length
    }
    this.emitEvidence({
      schemaVersion: 3,
      protocol: "vitest-coordinator-result-v3",
      runner: {
        name: "vitest",
        version: VITEST_VERSION
      },
      reporter: {
        name: "verification-count-reporter",
        version: 3
      },
      includeFiles: this.includeFiles,
      counts,
      tests: tests.map((test) => ({
        ...test,
        fileSha256: crypto
          .createHash("sha256")
          .update(fs.readFileSync(path.resolve(process.cwd(), test.file)))
          .digest("hex")
      }))
    })

    process.stdout.write(
      `\nVerification reporter observed ${counts.passed} passed, ` +
        `${counts.failed} failed, ${counts.skipped} skipped.\n`
    )
  }
}
