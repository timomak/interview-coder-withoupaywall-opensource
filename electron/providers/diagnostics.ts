import {
  ProviderDiagnostics,
  ProviderId,
  assertSupportedCliVersion
} from "../../src/shared/provider"
import { SafeProcessRunner } from "./processRunner"

function subscriptionAuthentication(
  provider: ProviderId,
  stdoutLines: readonly string[],
  stderr: string
): boolean {
  if (provider === "claude-code") {
    if (stdoutLines.length !== 1) return false
    try {
      const value = JSON.parse(stdoutLines[0]) as Record<string, unknown>
      return (
        value.loggedIn === true &&
        value.authMethod === "claude.ai" &&
        value.apiProvider === "firstParty" &&
        typeof value.subscriptionType === "string" &&
        value.subscriptionType.length > 0
      )
    } catch {
      return false
    }
  }
  return /^Logged in using ChatGPT$/i.test(
    [...stdoutLines, stderr].join("\n").trim()
  )
}

export async function diagnoseProvider(
  provider: ProviderId,
  executable: string,
  runner = new SafeProcessRunner()
): Promise<ProviderDiagnostics> {
  try {
    const versionResult = await runner.run({
      executable,
      args: ["--version"],
      timeoutMs: 5_000,
      terminateGraceMs: 250,
      maximumOutputBytes: 32_000,
      maximumLineBytes: 8_000
    })
    if (versionResult.failure) {
      return {
        provider,
        installed: false,
        authenticated: false,
        supported: false,
        reason: "Executable did not start"
      }
    }
    const version = assertSupportedCliVersion(
      provider,
      versionResult.stdoutLines.join("\n")
    )
    const authArgs =
      provider === "claude-code"
        ? ["auth", "status", "--json"]
        : ["login", "status"]
    const authResult = await runner.run({
      executable,
      args: authArgs,
      timeoutMs: 5_000,
      terminateGraceMs: 250,
      maximumOutputBytes: 32_000,
      maximumLineBytes: 8_000
    })
    const authenticated =
      authResult.failure === undefined &&
      subscriptionAuthentication(
        provider,
        authResult.stdoutLines,
        authResult.stderr
      )
    return {
      provider,
      installed: true,
      authenticated,
      supported: true,
      version,
      reason:
        authenticated
          ? undefined
          : "Sign in with a supported provider subscription and retry"
    }
  } catch {
    return {
      provider,
      installed: false,
      authenticated: false,
      supported: false,
      reason: "Unsupported or unavailable provider CLI"
    }
  }
}
