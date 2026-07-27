# InterviewCopilot

InterviewCopilot is an AGPL-licensed desktop application for technical
interview practice. The current codebase includes an Electron application and
an inherited Create React App renderer retained for regression coverage.

## Supported development runtime

Development and verification require Node.js major version 20. The repository
enforces that requirement during `npm ci` and at the verification entry point.

```bash
nvm install 20
nvm use 20
node -e 'if (Number(process.versions.node.split(".")[0]) !== 20) process.exit(1)'
npm ci
```

The lockfile is authoritative. Use `npm ci` for clean setup; do not substitute
`npm install` in verification evidence.

## Authoritative local gate

P01 and subsequent phases use the local phase reporter as the acceptance gate.
For P01, run exactly:

```bash
npm run verify:phase -- --phase P01 --artifacts .artifacts/verification/P01
```

The reporter validates the frozen argv plan, executes each child without a
shell, continues after a failed child, and exits nonzero if any raw exit,
runner/result identity, test-count requirement, plan hash, or test-manifest
requirement fails. GitHub Actions mirrors this command; hosted CI does not
replace the local result.

For day-to-day feedback, these commands are available:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

`npm test` is a real, repository-wide Vitest run. It includes the unchanged
inherited test at `renderer/src/App.test.tsx` and tests under future product,
domain, and qualification roots; zero-test runs and skipped or todo tests fail
the gate.

## Verification artifacts

Each reporter invocation creates a new numbered directory below the supplied
artifact path. It contains:

- `aggregate.json`, the machine-readable report;
- `aggregate.txt`, the human-readable report;
- one numbered raw child log per exact argv command; and
- nonce-bound machine-readable Vitest execution records and the parent-built
  validated ledger used by the immutable test manifest; and
- the actual packaged-app/asar inventory produced by the build child.

The aggregate reports retain the exact command, expected and raw child exit,
signal, UTC start/end, duration, log path, and passed/failed/skipped counts.
Counts are recomputed from the structured runner record and accepted only when
the runner/reporter identity, exact executed tests, source hashes, manifest
membership, and counts all agree. Child stdout is never count authority.
Missing, forged, zero-test, or ambiguous records fail even when the child exits
zero.

## Privacy and capture-protection policy

InterviewCopilot does not include analytics SDKs, device fingerprinting,
automatic crash-upload initialization, or environment-secret logging entry
points. The P01 policy gate uses dependency and syntax-aware analysis across
every shipped executable source family, including import/require aliases and
computed properties, without treating comments or inert strings as execution.

Electron windows apply `setContentProtection(true)` through one centralized
helper before their first reveal and again before every later reveal.
Renderer-initiated child windows are denied; the existing allowlisted HTTP(S)
links are delegated to the operating system instead. This unit protection does not prove capture privacy. Capture behavior depends on the operating system,
capture application, application version, hardware, and display topology. No
external capture-resistance or undetectability claim is made by the P01 unit
tests. Release claims require separate, explicit qualification.

The production build packages an unsigned application directory and inspects
its actual `app.asar`. Only compiled renderer/Electron output, runtime
dependencies, and package metadata may be present; raw project source,
test/spec files, verification scripts, and source maps are rejected. Existing
explicit runtime resources remain outside the asar.

Configuration and screenshots handled by the existing application may contain
sensitive information. Do not attach secrets, configuration files, screenshots,
or raw interview content to bug reports. P01 adds policy rails but does not add
encrypted persistence; that work belongs to a later phase.

## License

InterviewCopilot is licensed under
`AGPL-3.0-or-later`. See [LICENSE](LICENSE) and
[LICENSE-SHORT](LICENSE-SHORT). Contributors must preserve the same license and
source-availability obligations.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the clean setup, required local
checks, test-manifest rules, and privacy expectations.
