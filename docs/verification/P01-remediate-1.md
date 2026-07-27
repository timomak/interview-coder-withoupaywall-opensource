# P01 review-1 remediation dispositions

Reviewed implementation base:
`b0875221929a23bde5467cafa9d4f9a687c6dc4c`. Required phase base:
`main@9dcb4b2d39607273a8528a24657cdb4f5bfc3412`.

- `P01-R1-B01` — `electron/windowOpenPolicy.ts` denies every renderer-created
  child and delegates only the existing allowlisted HTTP(S) destinations to
  `shell.openExternal`. `electron/windowOpenPolicy.test.ts` proves arbitrary,
  blank, and malformed window-open attempts cannot create an Electron child.
- `P01-R1-B02` — `source-inventory.mjs`, `test-manifest.mjs`, and
  `vitest.config.ts` share repository-wide test discovery with explicit
  generated/dependency exclusions. Executed fixtures cover all eight supported
  extensions under future feature, domain, and qualification roots.
- `P01-R1-B03` — `phase-reporter.mjs` ignores stdout count markers and validates
  a nonce/binding-specific Vitest record against the installed runner,
  reporter protocol, exact manifest tests, source hashes, recomputed counts,
  and raw child exit. The adversarial regression uses a zero-test child that
  prints forged `passed=999` stdout and exits zero.
- `P01-R1-B04` — ESLint and strict TypeScript inventories include JSX/MTS/CTS,
  both renderer trees, and verification/config sources. The regression runs
  the real gates in a temporary repository copy containing invalid probes for
  each reproduced gap.
- `P01-R1-B05` — `product-policy.mjs` uses TypeScript syntax trees and binding
  analysis for package imports/requires, aliases, computed environment access,
  analytics capture, device identifiers, and crash initialization. Positive
  fixtures reproduce every review bypass; comments and inert strings are
  negative fixtures. Shipped-source selection excludes test filenames, not a
  path merely containing `tests`.
- `P01-R1-B06` — the unchanged authoritative `npm run build` argv now produces
  an unsigned Electron app and inventories the actual `app.asar` and bundle.
  Packaging admits compiled output, runtime dependencies, and metadata only;
  raw project/test/verification source and source maps fail, while existing
  explicitly configured non-code runtime resources remain outside the asar.

The final commit, clean detached rerun, aggregate artifacts and hashes, actual
package inventory, and PR/check identity are recorded in draft PR #155. This
document is a remediation disposition only; it is not approval. A fresh
read-only `P01/review-2` remains mandatory.
