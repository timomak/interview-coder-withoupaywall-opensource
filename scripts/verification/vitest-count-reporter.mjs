import fs from "node:fs"
import path from "node:path"

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
    process.stdout.write(`\nVERIFICATION_COUNTS ${JSON.stringify(counts)}\n`)

    const resultsDirectory = process.env.VERIFICATION_TEST_RESULTS_DIR
    const entryLabel = process.env.VERIFICATION_ENTRY_LABEL
    if (resultsDirectory && entryLabel) {
      fs.mkdirSync(resultsDirectory, { recursive: true })
      fs.writeFileSync(
        path.join(resultsDirectory, `${entryLabel}.json`),
        `${JSON.stringify(
          {
            schemaVersion: 1,
            entryLabel,
            counts,
            tests
          },
          null,
          2
        )}\n`,
        { flag: "wx" }
      )
    }
  }
}
