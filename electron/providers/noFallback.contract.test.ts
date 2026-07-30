import fs from "node:fs"
import {
  CODEX_SUCCESS_BODY,
  RecordingProcessRunner,
  makeFakeExecutable
} from "./testSupport"
import { ProviderRuntime } from "./runtime"

describe("strict provider selection", () => {
  it("never invokes the unselected provider", async () => {
    const claude = makeFakeExecutable(
      "claude",
      `process.stderr.write("selected provider failed for person@example.com sk-secret-12345678\\n"); process.exit(17)`,
      "2.1.220 (Claude Code)"
    )
    const codex = makeFakeExecutable(
      "codex",
      CODEX_SUCCESS_BODY,
      "codex-cli 0.144.5"
    )
    const runner = new RecordingProcessRunner()
    try {
      const result = await new ProviderRuntime({
        executables: {
          "claude-code": claude.executable,
          codex: codex.executable
        },
        processRunner: runner
      })
        .startSession({
          mode: "create",
          provider: "claude-code",
          model: "sonnet",
          responseMode: "fast",
          requestedConversationId: "22222222-2222-4222-8222-222222222222"
        })
        .runTurn("answer")

      expect(runner.requests.every((request) => request.executable === claude.executable)).toBe(true)
      expect(result.events).toEqual([
        expect.objectContaining({
          type: "error",
          code: "PROCESS_FAILED",
          message: expect.not.stringMatching(/example\.com|sk-secret/)
        })
      ])
    } finally {
      fs.rmSync(claude.directory, { recursive: true })
      fs.rmSync(codex.directory, { recursive: true })
    }
  })
})
