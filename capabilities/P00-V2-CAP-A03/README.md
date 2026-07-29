# P00-V2-CAP-A03

This bundle is the narrow bounded recovery from the exact installed
P00-V2-CAP-A02 controller for InterviewCopilot IC-M00/P01. It changes no
product scope, P00-R9 requirement, prior evidence byte, deployment boundary, or
legacy v1 authorization.

## Recovery contract

- Live installation requires the exact installed A02 payload, metadata,
  manifest, release envelope, self-test, and principal-bound sudoers identity.
- The installed v1 payload must remain exact and unauthorized. A03 never invokes
  it, never restores its historical rule, and its revoker preserves v1 in
  quarantine.
- A03 admits only P01. Its root-owned closed registry and request schema reject
  P02-P12 even though unchanged plan digests remain pinned as inert source
  inputs.
- Persistent authorization remains bound to `thirdfacedev` (UID 501) and only
  the two exact root-owned empty-argument arm/verify commands. There are no
  wildcard or group-principal forms.
- A03 renders from the exact reviewed A02 controller source. It adds `size`,
  flags, modification time, and change time to native file facts, and includes
  flags in descriptor-stability comparisons.
- The P01 reporter digest is pinned to the bounded-remediation candidate that
  compares observed device, inode, size, flags, modification time, and change
  time with their anchored expected values.
- A03 publishes only top-level P01 run evidence as root-owned, single-link,
  non-ACL, mode-0444 regular files below traverse-only run ancestors. Candidate
  repository, dependency, scratch, and nested working directories remain
  root-only. The terminal records the evidence-read contract.
- Existing P01 run state admits exactly the A02-created root identity and
  execution identity (live `0:0` and `499:499`). Commit/phase/run ancestors and
  top-level evidence must remain root-owned; nested candidate install/scratch
  trees may be execution-owned. Links, special files, unsafe modes, ACLs, and a
  third owner identity fail before mutation. Root-owned evidence bytes are
  preserved and normalized to the read-only contract.
- Source, staged, and final installed bytes are checked against one exact
  independently approved manifest before authorization.
- Installation removes A02 authorization first, holds every phase lock after
  proving no A02 controller process is active, swaps the payload atomically,
  validates installed metadata and bytes, runs the native self-test, and adds
  A03 authorization last. Failure restores exact A02 payload bytes but leaves
  authorization absent.
- The installed revoker removes authorization first, validates the exact A03
  and v1 identities, rejects active work, retains evidence, removes only A03
  command/state roots, proves A03 command paths are absent, and preserves the
  exact quarantined v1 payload and immutable capability metadata.

## Gate ordering

1. Build and test this bundle without sudo or any installed helper.
2. Commit the exact A03 artifact and exact P01 candidate.
3. Run one independent HIGH-risk complete finding batch against those immutable
   revisions.
4. Apply at most one consolidated correction and exact delta review.
5. Only after approval, present one literal administrator transaction whose
   member hashes are embedded in `build/admin-handoff.txt`.
6. After the user completes that transaction, create fresh P01 requests and run
   the single final authoritative suite.

`build/admin-handoff.txt` is command text, not an executable. It copies only the
closed envelope member set into a new root-owned staging directory, verifies
literal reviewed hashes, and invokes only those root-owned verified copies.

## Current boundary

Artifact construction, isolated candidate remediation, tests, and independent
review are non-privileged. Nothing in this directory authorizes installation
until the immutable A03 transaction receives independent approval and the user
performs the visible one-shot administrator action.
