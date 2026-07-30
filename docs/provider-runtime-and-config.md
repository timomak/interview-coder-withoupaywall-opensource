# Provider runtime and configuration

InterviewCopilot accepts two answer providers: `claude-code` and `codex`. Both
use an existing CLI subscription. The application does not accept or store
answer-provider keys, perform billing checks, or switch providers after a
failure.

## Supported protocol capabilities

Support is deliberately pinned. A CLI outside these ranges fails before an
answer process starts:

| Provider | Protocol | Supported CLI versions | Models | Response mode mapping |
|---|---|---|---|---|
| Claude Code | `claude-stream-json@1` | `>=2.1.0 <2.2.0` | `sonnet`, `opus`, `haiku` | Fast → `low`; Reasoning → `high` |
| Codex | `codex-app-server-jsonrpc@2` | `>=0.144.0 <0.145.0` | `gpt-5.3-codex`, `gpt-5.4` | Fast → `low`; Reasoning → `high` |

Install one CLI using its provider's official instructions and sign in with
`claude auth` or `codex login`. Onboarding uses installation, version, and
sign-in exit diagnostics only. It suppresses diagnostic output because it can
contain account identifiers. After reconnecting or upgrading a CLI, retry the
provider diagnostic. Unsupported versions require an explicit application
capability update; there is no optimistic protocol fallback.

Provider, model, response mode, and native effort are frozen when an interview
session is created. A setting changed during that session applies only to the
next session. Unsupported model/mode pairs are unavailable and are never
substituted.

## Process boundary

Executables must be absolute and executable. Children are launched with an
argument vector and `shell:false`. Known answer-provider credential overrides
are removed from the inherited environment so a local key cannot silently
change subscription billing. Claude runs with tools and MCP servers disabled.
Codex uses a strict app-server configuration, `approvalPolicy: never`, and a
read-only sandbox; tool protocol events are outside the accepted answer
protocol. Output and line sizes are bounded, every turn has a deadline, and
cancellation sends `SIGTERM` before a bounded `SIGKILL`. Provider stderr is
bounded and sanitized before it becomes a typed error.

The normalized event union covers start, text delta, typed payload, usage,
compaction, stop, completion, and recoverable sanitized error. A selected
provider failure ends the turn. The other executable is never probed or
started.

## Caller-owned conversation IDs

P02 accepts a caller-supplied Claude session ID or Codex thread ID and passes it
to the selected CLI on every turn. The runtime holds that opaque value only in
the caller/session object. Reconstructing the driver or child and supplying the
same value resumes the same provider conversation; P02 does not claim
application-restart recovery.

No P02 configuration, backup, log, recovery record, or provider-state directory
stores the value. P03/P04 later own encrypted application-restart recovery and
will pass the decrypted opaque value back into this API.

## M-01 migration and rollback

M-01 atomically replaces legacy `config.json` with schema version 1, preserves
only language and opacity, and records provider selection only after explicit
setup. It does not copy old keys, provider models, billing state, or any
conversation/session/thread field. The replacement and redacted backup use mode
`0600`; a same-directory temporary file is fsynced and renamed. Repeated runs
validate the versioned file without rewriting either file.

The redacted backup records preserved preferences and removed field names, not
their values. Rollback is an explicit user operation: restore that redacted
shape only after confirmation, then reconfigure a supported provider. Secrets
are never restored automatically.

## W3 legacy-removal inventory

W1 removed legacy behavior from its owned configuration, settings, welcome,
subscribe, and cloud-account bridge targets. W3 must remove or replace these
remaining non-W1-owned integration surfaces before cumulative P02 acceptance:

- `electron/ProcessingHelper.ts`: answer SDK imports/clients, legacy provider
  branches, key checks, billing counters, and provider-specific errors.
- `electron/ipcHandlers.ts`, `electron/preload.ts`, `electron/main.ts`,
  `src/types/electron.d.ts`, and `src/env.d.ts`: key validation/check channels,
  billing events, cloud portal/auth channels, old config shapes, and renderer
  globals.
- `src/App.tsx`, `src/_pages/SubscribedApp.tsx`,
  `src/components/Header/Header.tsx`, `src/components/Queue/QueueCommands.tsx`,
  and `src/components/Solutions/SolutionCommands.tsx`: old initialization,
  cloud sign-out, billing state, key prompts, and legacy settings labels.
- `package.json` and `package-lock.json`: the three answer SDKs, cloud-account
  client, and dependencies used only by removed answer/cloud paths.
- shared verification plans/manifests/policy: enumerate the nine P02 files,
  enforce the cumulative dependency/IPC/string removal scan, and preserve the
  W1 opaque-ID full-filesystem scan.

`electron/windowOpenPolicy.ts` and its test still name the old cloud-account
host as a P01 external-link fixture. Neither W1 nor the frozen W3 mutable set
owns those paths. Before cumulative acceptance, the controller must either
refreeze that exact removal or explicitly classify the P01 fixture as
non-product test policy; no work package should edit it by implication.

W3 integration must not add another provider runtime, provider conversation,
configuration store, or plaintext recovery path.
