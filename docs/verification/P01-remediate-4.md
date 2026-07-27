# P01 remediation cycle 4

Approved controller packet: P00-R9 at
`02ee6ddec78d6e4ea9e2de3c0303ffd6bc9f45bf`.
Required parent:
`b2b35d56d8d396591bdc2e6b7b9193bcde947de5`.

## Acceptance authority

The administrator-installed native controller at
`/Users/Shared/InterviewCopilot/verification-controller/v1` is the only
acceptance authority. It is provisioned and preflighted before any candidate
npm lifecycle instruction. It independently resolves and arms the live PR
head, materializes the anchored commit, brokers the pinned Node.js
20.20.2/npm 10.8.2 closure, records planned/resolved/actual argv and raw
process status, authenticates the framed result payload, seals terminal
evidence, rejects descendants, reopens the anchor and per-run binding, and
rechecks the live PR head before zero.

The repository has no `verify:phase` package script, install lifecycle hook,
injected-failure authority, colocated trust hash, writable evidence endpoint,
or candidate-owned active anchor. `phase-bootstrap.mjs` is only a bounded,
single-record controller preflight; direct invocation fails before any gate is
spawned. `phase-reporter.mjs` has no process-spawn capability.

## Stable findings

- `P01-R1-B01`: implicit Electron children remain denied and allowlisted
  external HTTP(S) links remain delegated to the operating system.
- `P01-R1-B02`: future-root and eight-extension test discovery remains closed,
  with exact manifest membership and execution validation.
- `P01-R1-B03`: candidate acceptance authority is removed. The controller owns
  candidate selection, toolchain/environment, process containment, transcript,
  HMAC-framed result acceptance, exact exits/counts, continuation, terminal
  state, and final reopen.
- `P01-R1-B04`: JSX/MTS/CTS, retained renderer, and verification source
  inventory coverage remains enforced.
- `P01-R1-B05`: syntax-aware privacy AST coverage and inert-text false-positive
  controls remain enforced.
- `P01-R1-B06`: a fresh production package inventory still excludes tests,
  verification files, raw runtime sources, source maps, and forbidden outer
  resources.

The thirteen mandatory hostile probes cover lifecycle companions and
self-removal, shell/wrapper substitution, anchor/plan/manifest mutation,
runner/hash forgery, toolchain/environment substitution, mutate/restore and
filesystem alias races, result-channel forgery/replay, exact broker records,
the exact `[7,0]` continuation negative control, all stable P01 closures, and
surviving descendants.

## Preservation and scope

P02–P12 and P12-observer plan bytes remain unchanged. Only P01's plan bytes and
its digest in `plan-manifest.json` change. The B01/B02/B04/B05/B06 focused
implementation and test files, the inherited CRA test, product behavior,
license, privacy policy, and production-package exclusions remain unchanged.
No production dependency is added.

This document records the implementation boundary; it is not authoritative
verification evidence. Only a sealed native-controller run against the exact
armed PR head can supply that evidence.
