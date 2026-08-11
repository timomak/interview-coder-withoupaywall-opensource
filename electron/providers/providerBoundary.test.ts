import fs from "node:fs"
import path from "node:path"
import { isProviderId, PROVIDER_IDS } from "../../src/shared/provider"
import { diagnoseProvider } from "./diagnostics"
import {
  ProcessRequest,
  ProcessResult,
  SafeProcessRunner
} from "./processRunner"

class DiagnosticRunner extends SafeProcessRunner {
  constructor(
    private readonly version: string,
    private readonly authentication: readonly string[]
  ) {
    super()
  }

  override async run(request: ProcessRequest): Promise<ProcessResult> {
    return {
      stdoutLines: request.args.includes("--version")
        ? [this.version]
        : this.authentication,
      stderr: "",
      exitCode: 0,
      signal: null
    }
  }
}

describe("provider boundary", () => {
  it("rejects legacy providers and entitlement surfaces", () => {
    expect(PROVIDER_IDS).toEqual(["claude-code", "codex"])
    for (const legacy of ["openai", "anthropic", "gemini", "api-key"]) {
      expect(isProviderId(legacy)).toBe(false)
    }

    const ownedUi = [
      "src/components/Settings/SettingsDialog.tsx",
      "src/components/WelcomeScreen.tsx",
      "src/_pages/SubscribePage.tsx"
    ]
      .map((file) => fs.readFileSync(path.resolve(file), "utf8"))
      .join("\n")
    expect(ownedUi).not.toMatch(/API key|credits|quota|paywall|portal/i)
  })

  it("accepts only explicit first-party subscription authentication", async () => {
    const claudeApiCredential = await diagnoseProvider(
      "claude-code",
      "/unused/claude",
      new DiagnosticRunner("2.1.220 (Claude Code)", [
        JSON.stringify({
          loggedIn: true,
          authMethod: "api-key",
          apiProvider: "firstParty",
          subscriptionType: "pro"
        })
      ])
    )
    const codexApiCredential = await diagnoseProvider(
      "codex",
      "/unused/codex",
      new DiagnosticRunner("codex-cli 0.144.5", [
        "Logged in using an API key"
      ])
    )
    const claudeSubscription = await diagnoseProvider(
      "claude-code",
      "/unused/claude",
      new DiagnosticRunner(
        "2.1.220 (Claude Code)",
        JSON.stringify(
          {
            loggedIn: true,
            authMethod: "claude.ai",
            apiProvider: "firstParty",
            subscriptionType: "pro"
          },
          null,
          2
        ).split("\n")
      )
    )
    const claudeTrailingOutput = await diagnoseProvider(
      "claude-code",
      "/unused/claude",
      new DiagnosticRunner("2.1.220 (Claude Code)", [
        JSON.stringify({
          loggedIn: true,
          authMethod: "claude.ai",
          apiProvider: "firstParty",
          subscriptionType: "pro"
        }),
        "unexpected trailing output"
      ])
    )
    const codexSubscription = await diagnoseProvider(
      "codex",
      "/unused/codex",
      new DiagnosticRunner("codex-cli 0.144.5", [
        "Logged in using ChatGPT"
      ])
    )

    expect(claudeApiCredential.authenticated).toBe(false)
    expect(codexApiCredential.authenticated).toBe(false)
    expect(claudeSubscription.authenticated).toBe(true)
    expect(claudeTrailingOutput.authenticated).toBe(false)
    expect(codexSubscription.authenticated).toBe(true)
  })
})
