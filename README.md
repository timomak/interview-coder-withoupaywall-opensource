# InterviewCopilot

InterviewCopilot is an AGPL-licensed, Live-first macOS desktop application for
Senior and Staff+ technical interviews. The current codebase includes an Electron application and
an inherited Create React App renderer retained for regression coverage.

## Supported development runtime

Development requires Node.js major version 20. Authoritative verification uses
the controller-installed Node.js 20.20.2/npm 10.8.2 closure.

```bash
nvm install 20
nvm use 20
node -e 'if (Number(process.versions.node.split(".")[0]) !== 20) process.exit(1)'
npm ci
```

The lockfile is authoritative. Use `npm ci` for clean setup; do not substitute
`npm install` in verification evidence.

## Authoritative local gate

P01 and subsequent phases use the administrator-installed native controller as
the only acceptance gate. After an administrator independently arms the exact
live PR head, the fixed invocation is:

```bash
/Users/Shared/InterviewCopilot/verification-controller/v1/bin/verify-phase --phase P01
```

The controller selects the armed candidate, materializes it read-only, brokers
the frozen argv plan with its pinned toolchain, preserves exact raw exits and
counts, continues after a failed child, seals evidence, checks for surviving
processes, and performs a final anchor/binding reopen. Candidate package
scripts, repository wrappers, author paths, and hosted CI are not acceptance
authority.

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

Each controller invocation creates a fresh sealed run below its root-owned run
registry. It contains:

- `reporter-aggregate.json`, the machine-readable report;
- `reporter-aggregate.txt`, the human-readable report;
- `controller-transcript.json`, the brokered spawn transcript;
- `run-binding.json`, the closed per-run binding;
- exactly one terminal `success.json` or `failure.json`;
- one numbered raw child log per exact argv command; and
- nonce-bound machine-readable Vitest execution records and the parent-built
  validated ledger used by the immutable test manifest; and
- the actual packaged-app/asar inventory produced by the build child.

The controller transcript retains the planned argv, resolved executable,
actual child argv, expected and raw child exit, signal, UTC start/end,
duration, log identity, and passed/failed/skipped counts.
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
links are delegated to the operating system instead. This unit protection does not prove capture privacy.
The release supports a claim only for an exact macOS,
architecture, Chrome, Google Meet, display, package, and sharing-scope tuple that
passed the documented two-device remote qualification. A changed tuple shows
**Retest required**. Browser-tab sharing and other meeting applications are not
qualified.

Diagnostics are local-only, redact interview content and credentials, show a
preview, and export only after a manual choice. Nothing is transmitted
automatically. See [release qualification](docs/macos-release/RELEASE.md).

The production build packages an unsigned application directory and inspects
its actual `app.asar`. Only compiled renderer/Electron output, runtime
dependencies, and package metadata may be present; raw project source,
test/spec files, verification scripts, and source maps are rejected. Existing
explicit runtime resources remain outside the asar.

Configuration, screenshots, transcripts, and History are encrypted at rest and
may still contain sensitive information after decryption. Do not attach secrets,
configuration files, screenshots, or raw interview content to bug reports.

## License

InterviewCopilot is licensed under
`AGPL-3.0-or-later`. See [LICENSE](LICENSE) and
[LICENSE-SHORT](LICENSE-SHORT). Contributors must preserve the same license and
source-availability obligations.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the clean setup, required local
checks, test-manifest rules, and privacy expectations.
