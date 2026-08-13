import { normalizeClaudeEvents, normalizeCodexEvents } from "./protocols"

describe("provider event protocol", () => {
  it("normalizes streaming and compaction events", () => {
    const privateId = "thread-private-normalization"
    const claude = normalizeClaudeEvents(
      [
        JSON.stringify({ type: "system", subtype: "init" }),
        JSON.stringify({
          type: "stream_event",
          event: { delta: { type: "text_delta", text: "partial" } }
        }),
        JSON.stringify({ type: "structured_output", payload: { answer: 42 } }),
        JSON.stringify({ type: "compact_boundary", reason: "context-window" }),
        JSON.stringify({
          type: "result",
          usage: { input_tokens: 10, output_tokens: 7 },
          stop_reason: "end_turn"
        })
      ],
      [privateId]
    )
    expect(claude.map((event) => event.type)).toEqual([
      "started",
      "text-delta",
      "typed-payload",
      "compaction",
      "usage",
      "stopped",
      "completed"
    ])

    const codex = normalizeCodexEvents(
      [
        "non-protocol diagnostic output",
        JSON.stringify({ method: "turn/started", params: {} }),
        JSON.stringify({
          method: "item/agentMessage/delta",
          params: { delta: "partial" }
        }),
        JSON.stringify({
          method: "item/completed",
          params: { item: { type: "structured_output", value: { answer: 42 } } }
        }),
        JSON.stringify({
          method: "item/completed",
          params: {
            item: {
              type: "agentMessage",
              text: JSON.stringify({
                kind: "structured",
                sections: [{ id: "answer", body: "current protocol" }]
              })
            }
          }
        }),
        JSON.stringify({ method: "thread/compacted", params: {} }),
        JSON.stringify({
          method: "thread/tokenUsage/updated",
          params: { tokenUsage: { inputTokens: 9, outputTokens: 6 } }
        }),
        JSON.stringify({
          method: "turn/completed",
          params: { turn: { status: "completed" } }
        }),
        JSON.stringify({
          error: {
            message: `Bearer token-secret-12345678 ${privateId} owner@example.com`
          }
        })
      ],
      [privateId]
    )
    expect(codex.map((event) => event.type)).toEqual([
      "started",
      "text-delta",
      "typed-payload",
      "typed-payload",
      "compaction",
      "usage",
      "stopped",
      "completed",
      "error"
    ])
    const error = codex.at(-1)
    expect(error).toEqual(
      expect.objectContaining({
        type: "error",
        message: expect.not.stringMatching(
          /token-secret|thread-private|owner@example/
        )
      })
    )

    expect(() =>
      normalizeClaudeEvents(
        [
          JSON.stringify({
            type: "stream_event",
            event: {
              type: "content_block_start",
              content_block: { type: "tool_use" }
            }
          })
        ],
        []
      )
    ).toThrow(/disabled tool/)
    expect(() =>
      normalizeCodexEvents(
        [
          JSON.stringify({
            method: "item/completed",
            params: { item: { type: "command_execution" } }
          })
        ],
        []
      )
    ).toThrow(/disallowed tool/)
  })
})
