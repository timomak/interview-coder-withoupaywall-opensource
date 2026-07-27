# P01 review-2 remediation dispositions

Reviewed implementation SHA: `119a30232565b8dca56932d7e749bb2d351b04f1`.
Required phase base: `main@9dcb4b2d39607273a8528a24657cdb4f5bfc3412`.
Approved packet: P00-R7 at
`494e518f62d636e6af4e455ba615596d95b4d06b`.

- `P01-R1-B01` — `electron/main.ts` now installs the deny handler as the
  first executable statement after capture-protected construction.
  `electron/windowOpenPolicy.test.ts` parses `createWindow`, requires that
  exact next-statement order, and proves a reordered fixture fails.
- `P01-R1-B02` — `source-inventory.mjs` independently compares Git index
  modes/paths with a non-following filesystem `lstat` walk. It rejects
  untracked executable candidates, missing tracked candidates, symlinks,
  case collisions, dot-directory candidates, and noncanonical
  extension/test-suffix casing. Vitest receives the exact canonical test
  paths. The reporter, manifest gate, and full-unit ledger independently
  prove include/inventory/manifest/execution parity.
- `P01-R1-B03` — every frozen plan entry still actually spawns its exact
  `npm run test:*` argv. Exact package scripts and absent lifecycle hooks,
  the wrapper, reporter, config, inventory, Vitest lock
  version/resolution/integrity, and installed runner entry bytes are checked
  before and after each spawn. The controller passes a one-use challenge
  through stdin; the anchored wrapper consumes it before creating forked
  Vitest workers. No result path, nonce, key, binding, or endpoint is placed
  in env or argv. One HMAC-authenticated coordinator record is accepted;
  missing, malformed, duplicate, replayed, stale, swapped, synthesized, or
  extra records fail. Aggregate evidence records both planned and actual
  spawn argv and the npm process identity.
- `P01-R1-B04` — the root gate has `allowJs`, `checkJs`, and `strict`
  enabled, with canonical-inventory coverage assertions and the retained
  Electron strict pass. Staged negative repositories prove JSDoc assignment
  mismatches fail in root JS/JSX, renderer JSX, qualification CJS, and
  verification MJS alongside strict TS/MTS/CTS coverage. No suppression or
  product/gate exclusion was added.
- `P01-R1-B05` — the shipped-source scan is bound to the canonical
  inventory and now uses lexical scopes plus conservative assignment/value
  flow. It normalizes call/apply/bind and optional/computed access; follows
  destructuring, aliases, reassignment, objects, spreads, and templates;
  recognizes ESM/CJS/dynamic imports and logger sinks; and distinguishes
  runtime dangerous bindings from local shadows and type-only imports.
  Parse errors fail closed.
- `P01-R1-B06` — each package check creates a unique empty builder output
  and inventories that exact app. Every outer file/symlink has path, type,
  size, and hash/target evidence and must match the case-insensitive,
  path-specific Electron application allowlist. Unexpected outer resources,
  unpacked files, extraFiles/extraResources, raw source, maps, tests,
  verification content, and environment files fail. A real hostile build
  injects raw TS through `extraResources` and returns nonzero.

## `.env` disposition

`.env` and every `.env.*` variant are forbidden from the application bundle.
The former `extraResources` rule was inert in a clean checkout and has been
removed. Provider credentials are stored by `ConfigHelper` in Electron's
per-user `config.json`; updater `GH_TOKEN`, when used, remains a launch-time
process environment input. Neither is sourced from a packaged `.env`.
`dotenv` runtime/dependency behavior was otherwise left unchanged. A fresh
clean package succeeds without an `.env` resource.

## Self-review

- Trust boundary: npm argv is executed literally; test processes receive no
  controller authentication material; coordinator output is authenticated,
  bounded, single-record, and related to the raw child exit.
- Inventory: Git and filesystem observations are separate, exclusions are
  exact generated/dependency components, symlinks are not followed, and
  supported suffix detection is case-insensitive but canonical spelling is
  required.
- Typed behavior: strict JS probes exercise every reproduced JS family/root;
  fixes are typed declarations/value corrections, not suppressions.
- Privacy: the analysis is deliberately bounded to the acceptance sinks and
  sources, merges composed values conservatively, and keeps inert
  type/comment/string/shadow fixtures clean.
- Packaging: no stale `release` discovery remains; the exact freshly built
  application is inspected and `.env` is never shipped.
- Scope: plan files, the plan manifest, inherited renderer test bytes,
  identity/license, capture-protection primitive, product behavior, workflows,
  production, the orchestration ledger, and P00 were not changed.

Final SHA, worktree and detached aggregate paths/hashes, independent hostile
probe results, PR identity, and hosted checks are recorded in draft PR #155
after the final clean rerun. This document is a remediation disposition only;
it is not approval. A fresh read-only `P01/review-3` is mandatory.
