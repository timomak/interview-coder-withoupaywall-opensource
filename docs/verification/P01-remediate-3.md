# P01 review-3 remediation dispositions

Reviewed implementation SHA:
`cff6a38cffbad8d8d09cfb25981851eaf0e6e39c`.
Required phase base: `main@9dcb4b2d39607273a8528a24657cdb4f5bfc3412`.
Approved packet: P00-R7 at
`494e518f62d636e6af4e455ba615596d95b4d06b`.

## `P01-R1-B03` — independent test-evidence trust root

The former `phase-reporter.mjs` held both the expected hashes and the code that
consumed them. A candidate could therefore replace the trusted Vitest wrapper
with a manifest-derived all-pass forger and update the adjacent hash table in
the same change.

The remediation uses this acyclic trust graph:

```text
externally reviewed exact package verify:phase command
  ├── SHA-256(small bootstrap bytes)
  └── SHA-256(plan-manifest bytes)
        └── SHA-256(P01 plan bytes)
              ├── SHA-256(small bootstrap bytes)
              └── complete downstream test-evidence anchor
```

The package command uses only Node built-ins to read and validate the bootstrap
and plan-manifest bytes before loading any repository module. It executes the
already-validated bootstrap buffer through a data URL. The bootstrap validates
the manifest, every plan, the closed P01 anchor schema, exact package boundary
scripts and forbidden lifecycle hooks, the reporter, wrapper, Vitest config,
count reporter, source inventory, test-manifest validator and frozen manifest,
lockfile, setup input, and installed Vitest entry bytes. It then executes the
already-validated reporter and source-inventory buffers. Installed Vitest bytes
are allowed to be absent before the first `npm ci`, but are mandatory and
revalidated immediately before and after every test child.

There is no self-hash fixed point: the bootstrap contains no expected digest;
P01 hashes the bootstrap and downstream files but not P01 or the manifest; the
manifest hashes P01; and the exact package command hashes only the bootstrap
and manifest. Updating a validator and expected value now necessarily changes
the independently visible package root contract. That root is intentionally
review-critical; no set of candidate-controlled files can make a root change
invisible.

The reporter no longer defines trusted scripts, file hashes, outer arguments,
or Vitest identity. It only consumes the deep-frozen bootstrap context. The
literal frozen `npm run test:* -- --reporter=verbose` argv still spawns without
a shell. Test children receive no writable result path, endpoint, nonce, key,
binding, or challenge in environment or argv. The stdin-only coordinator
challenge and exactly one bounded HMAC-authenticated result remain required.

The hostile regression creates the concrete manifest-forging wrapper, updates
the former colocated reporter hash pattern, synthesizes current anchor values,
and updates P01 plus the manifest. The unchanged external package root rejects
the manifest before reporter import or evidence creation. Separate mutations
cover bootstrap, plan, anchor, manifest, scripts, hooks, reporter, wrapper,
config, count reporter, inventory, validator, frozen manifest, lock, and
installed runner bytes, including joint/current-value mutations.

## Injected raw-exit proof

The injected failure is now a command-class reporter-aggregation probe. Its
first exact Node child actually spawns and exits `7`; the later child actually
spawns and exits `0`; both planned argv arrays equal the recorded
`actualSpawnArgv`; and the aggregate exits `1`. This narrow test-only path does
not weaken canonical test execution: arbitrary test-class argv is still
rejected before spawn unless it is bound to an anchored npm test script and
exact outer argv.

## Preserved review-2 closures and scope

- `P01-R1-B01` lifecycle ordering and focused tests are unchanged.
- `P01-R1-B02` canonical inventory/parity behavior and focused tests are
  unchanged.
- `P01-R1-B04` strict JS/TS coverage behavior and focused tests are unchanged.
- `P01-R1-B05` scope/dataflow privacy analysis and focused tests are unchanged.
- `P01-R1-B06` fresh-package/outer-allowlist behavior and focused tests are
  unchanged.
- Every P01–P12 and P12-observer entry label, argv, classification, expected
  exit, minimum count, and order remains identical to review-3. P02–P12 and
  P12-observer plan bytes are unchanged. P01 adds only the authorized trust
  anchor; the manifest changes only P01's digest.
- `renderer/src/App.test.tsx`, `applyCaptureProtection`, InterviewCopilot
  identity, AGPL-3.0-or-later licensing, product behavior, privacy policy,
  workflows, production, P00, and the orchestration ledger are unchanged.

Final SHA, exact implementation and detached aggregate evidence, injected
artifact hashes, hostile dispositions, package inventory, PR identity, and
hosted checks are recorded on draft PR #155 after the final clean rerun. This
document is a remediation disposition only; it is not approval. Fresh
read-only `P01/review-4` must recheck all six stable findings and this trust
root at the exact final SHA.
