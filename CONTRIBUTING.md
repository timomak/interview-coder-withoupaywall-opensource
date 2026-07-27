# Contributing to InterviewCopilot

Thank you for contributing. Keep changes narrowly scoped, preserve existing
behavior unless the owning change explicitly says otherwise, and do not include
credentials, screenshots, interview content, or other sensitive data.

## Clean setup

Use Node.js major version 20 and the committed npm lockfile for development:

```bash
nvm install 20
nvm use 20
node -e 'if (Number(process.versions.node.split(".")[0]) !== 20) process.exit(1)'
npm ci
```

Do not relax the engine check or replace `npm ci` with `npm install` in
development. Acceptance does not use the invoking shell's Node/npm; the
installed verification controller pins Node.js 20.20.2 and npm 10.8.2.

## Required local verification

Local controller verification is authoritative. An administrator first arms
the exact live PR head under approved P00-R9, then the only P01 invocation is:

```bash
/Users/Shared/InterviewCopilot/verification-controller/v1/bin/verify-phase --phase P01
```

The command runs the frozen P01 argv plan in order: deterministic install,
policy scan, lint, strict type-check, inherited renderer test, root unit suite,
P01 policy suite, immutable test-manifest validation, and production build.
Every raw child exit must be zero, every test count must have failed=0 and
skipped=0, and the aggregate exit must be zero.

Hosted CI runs an informational unprivileged mirror and is useful review
evidence, but it cannot waive or replace the controller's sealed artifact set.

## Test contract

- Add real tests for behavior or policy changes.
- Do not use skip, todo, `xit`, or `xdescribe` forms.
- Do not remove, rename, or make a manifest test undiscoverable.
- Do not weaken assertions, thresholds, source globs, or parser coverage.
- Add new tests to the manifest without changing existing frozen entries.
- Preserve `renderer/src/App.test.tsx` unchanged.

Vitest discovers test/spec files repository-wide for JavaScript, JSX,
TypeScript, TSX, MJS, CJS, MTS, and CTS, excluding only generated artifacts and
dependencies. The native controller records exact argv commands and raw exits and
requires a nonce-bound runner record whose exact tests, hashes, manifest
membership, and recomputed counts agree. Stdout count markers are not evidence.
It deliberately continues after child failure so later raw results are not
masked.

## Lint and type cleanup

ESLint covers every JavaScript/TypeScript module and JSX family, plus JSON,
Markdown, and CSS with file-specific parsers. Strict TypeScript includes both
renderer trees, Electron, tests, qualification/verification scripts, and root
configuration sources. Only dependencies and generated build, release,
coverage, and verification artifacts are ignored. Do not hide product source
to make lint or strict TypeScript pass. Keep cleanup mechanical and review it
for behavior changes.

## Privacy, telemetry, and capture protection

Do not add analytics SDKs, device identifiers or fingerprinting, product
entitlements, credits, quotas, automatic crash upload, or logging of environment
secrets. Manual diagnostic work must be explicitly scoped and redacted.

Every Electron `BrowserWindow` creation and reveal path must use
`applyCaptureProtection`; the helper only calls `setContentProtection(true)`.
Do not add a false path. Renderer `window.open` requests must never create an
implicit Electron child; approved external HTTP(S) links are opened by the
operating system. Unit coverage of this invariant does not establish external
capture privacy and must not be described as proof that the window is hidden
from a particular capture product.

`npm run build` also creates an unsigned packaged app and inventories its actual
asar. Raw project source, test/spec files, verification scripts, source maps,
and other non-runtime files are forbidden in the production application.

## License

All contributions remain available under `AGPL-3.0-or-later`. Preserve
[LICENSE](LICENSE), source notices, and the package license metadata.
