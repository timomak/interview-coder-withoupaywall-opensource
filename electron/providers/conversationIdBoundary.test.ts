import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { migrateLegacyConfig } from "../config"
import { ProviderRuntime } from "./runtime"
import {
  CODEX_SUCCESS_BODY,
  RecordingProcessRunner,
  makeFakeExecutable
} from "./testSupport"

function allFileBytes(root: string): string {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(root, entry.name)
      return entry.isDirectory() ? [allFileBytes(target)] : [fs.readFileSync(target, "utf8")]
    })
    .join("\n")
}

describe("opaque provider ID boundary", () => {
  it("prohibits plaintext provider conversation persistence", async () => {
    const opaqueId = "thread-opaque-fixture-do-not-persist-9f31"
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ic-p02-id-scan-"))
    const configDirectory = path.join(root, "config")
    const providerDirectory = path.join(root, "provider-state")
    const logDirectory = path.join(root, "logs")
    fs.mkdirSync(configDirectory)
    fs.mkdirSync(providerDirectory)
    fs.mkdirSync(logDirectory)
    const configPath = path.join(configDirectory, "config.json")
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        apiKey: "legacy-secret-that-is-also-removed",
        conversationId: opaqueId,
        language: "python",
        opacity: 1
      })
    )
    migrateLegacyConfig(configPath)

    const codex = makeFakeExecutable(
      "codex",
      CODEX_SUCCESS_BODY,
      "codex-cli 0.144.5"
    )
    const claude = makeFakeExecutable(
      "claude",
      `process.stdout.write(JSON.stringify({type:"result",usage:{},stop_reason:"end_turn"}) + "\\n")`,
      "2.1.220 (Claude Code)"
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
          provider: "codex",
          model: "gpt-5.3-codex",
          responseMode: "fast",
          requestedConversationId: opaqueId
        })
        .runTurn("one in-memory turn")
      expect(result.events.at(-1)?.type).toBe("completed")
      expect(JSON.stringify(runner.requests)).toContain(opaqueId)

      expect(allFileBytes(root)).not.toContain(opaqueId)
      expect(allFileBytes(providerDirectory)).toBe("")
      expect(allFileBytes(logDirectory)).toBe("")
      expect(fs.readFileSync(configPath, "utf8")).not.toMatch(
        /conversation|session|thread/i
      )
    } finally {
      fs.rmSync(root, { recursive: true })
      fs.rmSync(codex.directory, { recursive: true })
      fs.rmSync(claude.directory, { recursive: true })
    }
  })
})
