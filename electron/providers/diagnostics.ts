import {
  ProviderDiagnostics,
  ProviderId,
  assertSupportedCliVersion
} from "../../src/shared/provider"
import { SafeProcessRunner } from "./processRunner"

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
    return {
      provider,
      installed: true,
      authenticated: authResult.failure === undefined,
      supported: true,
      version,
      reason:
        authResult.failure === undefined
          ? undefined
          : "Sign in with the provider CLI and retry"
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
