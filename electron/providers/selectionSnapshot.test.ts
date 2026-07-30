import fs from "node:fs"
import {
  CLAUDE_SUCCESS_BODY,
  CODEX_SUCCESS_BODY,
  RecordingProcessRunner,
  makeFakeExecutable
} from "./testSupport"
import { ProviderRuntime } from "./runtime"

describe("selection capabilities", () => {
  it("locks explicit provider model and effort", async () => {
    const claude = makeFakeExecutable(
      "claude",
      CLAUDE_SUCCESS_BODY,
      "2.1.220 (Claude Code)"
    )
    const codex = makeFakeExecutable(
      "codex",
      CODEX_SUCCESS_BODY,
      "codex-cli 0.144.5"
    )
    const runner = new RecordingProcessRunner()
    const runtime = new ProviderRuntime({
      executables: {
        "claude-code": claude.executable,
        codex: codex.executable
      },
      processRunner: runner
    })
    try {
      expect(() =>
        runtime.startSession({
          provider: "codex",
          model: "silently-substituted-model",
          responseMode: "fast",
          conversationId: "thread-selection-1"
        })
      ).toThrow(/does not advertise model/)

      const request = {
        provider: "claude-code" as const,
        model: "sonnet",
        responseMode: "reasoning" as const,
        conversationId: "33333333-3333-4333-8333-333333333333"
      }
      const session = runtime.startSession(request)
      request.model = "opus"
      await session.runTurn("answer")
      expect(session.selection).toEqual({
        provider: "claude-code",
        model: "sonnet",
        responseMode: "reasoning",
        effort: "high"
      })
      expect(Object.isFrozen(session.selection)).toBe(true)
      const turnRequest = runner.requests.at(-1)
      expect(turnRequest?.args).toContain("sonnet")
      expect(turnRequest?.args).toContain("high")
      expect(turnRequest?.args).not.toContain("opus")
    } finally {
      fs.rmSync(claude.directory, { recursive: true })
      fs.rmSync(codex.directory, { recursive: true })
    }
  })
})
