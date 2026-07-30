import fs from "node:fs"
import { spawn } from "node:child_process"
import {
  SpawnProviderChild,
  SafeProcessRunner
} from "./processRunner"
import { answerSecretNames } from "./environment"
import { makeFakeExecutable } from "./testSupport"

describe("provider process boundary", () => {
  it("constrains provider child processes", async () => {
    const safe = makeFakeExecutable(
      "safe-provider",
      `process.stdout.write(JSON.stringify({
        secrets: ${JSON.stringify(answerSecretNames())}.filter(name => process.env[name] !== undefined),
        marker: process.env.SAFE_MARKER
      }) + "\\n")`,
      "1.0.0"
    )
    const flood = makeFakeExecutable(
      "flood-provider",
      `process.stdout.write("x".repeat(100000)); setInterval(() => {}, 1000)`,
      "1.0.0"
    )
    const stubborn = makeFakeExecutable(
      "stubborn-provider",
      `process.on("SIGTERM", () => {}); process.stdout.write("ready\\n"); setInterval(() => {}, 1000)`,
      "1.0.0"
    )
    const invocations: Array<{
      executable: string
      shell: unknown
      signals: Array<NodeJS.Signals | number>
    }> = []
    const spawnRecorder: SpawnProviderChild = (executable, args, options) => {
      const child = spawn(executable, [...args], options) as ReturnType<
        SpawnProviderChild
      >
      const signals: Array<NodeJS.Signals | number> = []
      const originalKill = child.kill.bind(child)
      child.kill = ((signal?: NodeJS.Signals | number) => {
        if (signal !== undefined) signals.push(signal)
        return originalKill(signal)
      }) as typeof child.kill
      invocations.push({ executable, shell: options.shell, signals })
      return child
    }
    const runner = new SafeProcessRunner(spawnRecorder)
    const environment = {
      ...process.env,
      SAFE_MARKER: "preserved",
      OPENAI_API_KEY: "must-not-reach-child",
      ANTHROPIC_AUTH_TOKEN: "must-not-reach-child"
    }

    try {
      await expect(
        runner.run({
          executable: "relative-provider",
          args: [],
          timeoutMs: 100,
          terminateGraceMs: 20,
          maximumOutputBytes: 100,
          maximumLineBytes: 100
        })
      ).rejects.toThrow(/absolute path/)

      const safeResult = await runner.run({
        executable: safe.executable,
        args: [],
        environment,
        timeoutMs: 1_000,
        terminateGraceMs: 20,
        maximumOutputBytes: 10_000,
        maximumLineBytes: 10_000
      })
      expect(JSON.parse(safeResult.stdoutLines[0])).toEqual({
        secrets: [],
        marker: "preserved"
      })

      const floodResult = await runner.run({
        executable: flood.executable,
        args: [],
        timeoutMs: 1_000,
        terminateGraceMs: 20,
        maximumOutputBytes: 1_000,
        maximumLineBytes: 1_000
      })
      expect(floodResult.failure).toBe("output-limit")

      const timeoutResult = await runner.run({
        executable: stubborn.executable,
        args: [],
        timeoutMs: 1_000,
        terminateGraceMs: 20,
        maximumOutputBytes: 1_000,
        maximumLineBytes: 1_000
      })
      expect(timeoutResult.failure).toBe("timeout")
      expect(invocations.at(-1)?.signals).toEqual(["SIGTERM", "SIGKILL"])
      expect(invocations.every((invocation) => invocation.shell === false)).toBe(
        true
      )
      expect(invocations.every((invocation) => invocation.executable.startsWith("/"))).toBe(true)
    } finally {
      fs.rmSync(safe.directory, { recursive: true })
      fs.rmSync(flood.directory, { recursive: true })
      fs.rmSync(stubborn.directory, { recursive: true })
    }
  })
})
