# P00-V2-CAP-A02

This bundle is the narrow atomic upgrade from the installed, independently
approved P00-V2-CAP-A01 controller. It corrects the fail-closed run-directory
ancestor traversal defect without changing P00-R9, the P01 candidate, PR #155,
any product requirement, or any prior evidence. The fresh v1-to-v2 path remains
testable for recovery, but the live handoff accepts only the exact installed
A01 identity.

## Security contract

- The installed v1 controller and sudoers rule remain unavailable until a
  separately reviewed one-shot administrator transaction replaces them.
- The persistent authorization principal is the exact local user
  `thirdfacedev` (UID 501), not `%admin` or another group.
- Sudoers authorizes only two exact root-owned executables with the explicit
  empty argument string `""`. No wildcard arguments are accepted.
- Each executable consumes one closed JSON request from a fixed request slot.
  The request owner must be UID 501, it must be a regular single-link mode-0400
  file without an extended ACL, and descriptor identity must remain unchanged
  across the read.
- `tools/write-request.py` is the sole reviewed user-side request constructor;
  it emits canonical closed-schema JSON atomically and supplies a fresh replay
  nonce. It never invokes sudo or either privileged executable.
- The controller is data-driven by the root-owned closed capability registry.
  It accepts exactly phases P01-P12 and has no P01-only admission branch.
- Before arming, every `npm run` target in the immutable phase plan and every
  transitively invoked `npm run` target must match its root-owned exact
  package-script mapping. Every mapped pre/post lifecycle hook is closed. Only
  sealed `test:*` runner targets receive the per-execution authentication
  secret; qualification commands receive no secret.
- Every dynamically created `runs/<commit>/<phase>/<run>` ancestor is enforced
  as root-owned traverse-only mode `0711`. Evidence files remain root-only;
  UID 499 can resolve its cwd but cannot list or read evidence directories.
- npm uses the installed immutable `config/npmrc`, never a candidate or
  nonexistent toolchain configuration path.
- Installation uses one independently approved expected-install manifest for
  source, staged, and final installed bytes. Missing, extra, linked, writable,
  ACL-bearing, or hash-mismatched members fail before authorization.
- The v1 sudoers rule is removed before the v2 rule is activated. Rollback
  never restores the quarantined wildcard rule.
- An A01-to-A02 upgrade verifies the exact installed A01 manifest and metadata,
  removes A01 authorization first, stages and verifies A02, retains A01
  metadata, and swaps the controller atomically. Failure restores the exact A01
  payload for forensics but deliberately leaves authorization absent.
- A reviewed revoker is installed with the capability. Revocation removes
  authorization first, establishes a fail-closed revocation marker, validates
  exact installed identity, rejects active controller processes or held phase
  locks, retains evidence, removes only the enumerated roots, proves the
  command paths are gone, and is idempotent.

## Artifact lifecycle

1. `build.sh` verifies the pinned legacy controller source hash, renders the
   generic controller, compiles it, assembles the complete payload (including
   the pinned Node/npm closure), emits an exact expected-install manifest, and
   produces a deterministic compressed payload archive covered by the release
   envelope.
2. `tests/run.sh` performs only non-privileged validation in disposable roots.
   It never calls sudo, npm, the candidate, or the installed helper.
3. The controller-owned ledger commit plus `release-envelope.json` freezes the
   source revision, payload inventory, expected manifest, tests, and hashes.
4. Exactly one independent HIGH-risk reviewer assesses that immutable commit.
5. Only an approved review may produce the one-shot administrator handoff.

`build/admin-handoff.txt` is command text, not an executable script. Its
literal `sudo zsh -c` transaction copies only the closed envelope member set
into a new root-owned staging directory, checks the installer, both verifier
programs, release envelope, and payload archive against literal reviewed
hashes, then runs only those root-owned verified copies. Invoking the mutable
text file itself is prohibited; the approved command must be passed literally.

## Current boundary

Artifact construction and tests are non-privileged. The installed A01
controller remains fail-closed; nothing in this directory authorizes an A02
administrator upgrade until the immutable artifact passes independent
HIGH-risk review.
