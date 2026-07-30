import fs from "node:fs"
import {
  CLAUDE_SUCCESS_BODY,
  CODEX_SUCCESS_BODY,
  RecordingProcessRunner,
  makeFakeExecutable
} from "./testSupport"
import { ProviderRuntime } from "./runtime"

describe("provider conversation continuity", () => {
  it("resumes caller-owned conversations after process restart", async () => {
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
    const fixtures = [
      {
        provider: "claude-code" as const,
        model: "sonnet",
        id: "11111111-1111-4111-8111-111111111111",
        expected: "claude-answer"
      },
      {
        provider: "codex" as const,
        model: "gpt-5.3-codex",
        id: "thread-memory-only-42",
        expected: "codex-answer"
      }
    ]

    try {
      for (const fixture of fixtures) {
        const runner = new RecordingProcessRunner()
        const options = {
          executables: {
            "claude-code": claude.executable,
            codex: codex.executable
          },
          processRunner: runner
        }
        const first = new ProviderRuntime(options)
          .startSession({
            mode: "create",
            provider: fixture.provider,
            model: fixture.model,
            responseMode: "fast",
            requestedConversationId: fixture.id
          })
        const firstTurn = await first.runTurn("turn one")
        const createdId = first.conversationId()
        expect(createdId).toBeDefined()
        const restarted = new ProviderRuntime(options).startSession({
          mode: "resume",
          provider: fixture.provider,
          model: fixture.model,
          responseMode: "fast",
          conversationId: createdId!
        })
        const secondTurn = await restarted.runTurn("turn two")
        expect(firstTurn.events).toContainEqual(
          expect.objectContaining({ type: "text-delta", text: fixture.expected })
        )
        expect(secondTurn.events).toContainEqual(
          expect.objectContaining({ type: "text-delta", text: fixture.expected })
        )
        const turnRequests = runner.requests.filter(
          (request) => !request.args.includes("--version")
        )
        const transport =
          fixture.provider === "claude-code"
            ? turnRequests.flatMap((request) => request.args)
            : turnRequests.flatMap((request) => request.stdinLines ?? [])
        expect(turnRequests).toHaveLength(2)
        const requestsContainingConversationId = turnRequests.filter(
          (request) =>
            [...request.args, ...(request.stdinLines ?? [])].some((value) =>
              value.includes(
                fixture.provider === "claude-code" ? fixture.id : createdId!
              )
            )
        )
        expect(requestsContainingConversationId).toHaveLength(
          fixture.provider === "claude-code" ? 2 : 1
        )
        expect(
          transport.some((value) =>
            value.includes(
              fixture.provider === "claude-code" ? fixture.id : createdId!
            )
          )
        ).toBe(true)
        if (fixture.provider === "claude-code") {
          expect(turnRequests[0].args).toContain("--session-id")
          expect(turnRequests[0].args).not.toContain("--resume")
          expect(turnRequests[1].args).toContain("--resume")
        } else {
          expect(turnRequests[0].stdinLines).toEqual(
            expect.arrayContaining([
              expect.stringContaining('"method":"thread/start"')
            ])
          )
          expect(turnRequests[1].stdinLines).toEqual(
            expect.arrayContaining([
              expect.stringContaining('"method":"thread/resume"')
            ])
          )
        }

        const nonexistent = new ProviderRuntime(options).startSession({
          mode: "resume",
          provider: fixture.provider,
          model: fixture.model,
          responseMode: "fast",
          conversationId:
            fixture.provider === "claude-code"
              ? "99999999-9999-4999-8999-999999999999"
              : "019f-codex-thread-missing"
        })
        const rejected = await nonexistent.runTurn("must reject")
        expect(rejected.events).toContainEqual(
          expect.objectContaining({ type: "error" })
        )
      }
    } finally {
      fs.rmSync(claude.directory, { recursive: true })
      fs.rmSync(codex.directory, { recursive: true })
    }
  }, 15_000)
})
