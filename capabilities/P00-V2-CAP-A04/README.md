# P00-V2-CAP-A04

A04 is the fresh-namespace, P01-only verification capability for
InterviewCopilot IC-M00. It preserves every legacy controller and historical
evidence byte as unauthorized read-only state.

## Boundary

- A04 installs only below
  `/Users/Shared/InterviewCopilot/verification-controller-a04`.
- Its only sudoers file is
  `/etc/sudoers.d/interviewcopilot-verification-controller-a04`.
- Only user `thirdfacedev` (UID 501) may invoke the exact empty-argument
  `arm-phase-core` and `verify-phase-core` paths.
- The capability admits only P01, P00-R9, PR 155, and the frozen candidate.
- Legacy A02 and the terminal RECOVERY-03 receipt are checked only at their
  known exact paths. No legacy run directory is listed, imported, normalized,
  relocated, or mutated.

## Transaction and recovery

The installer verifies source, staged, installed, metadata, and authorization
bytes. Authorization is published last. A root-owned external journal closes
the hard-crash gap; replay removes A04 authorization first, deletes only the
fresh namespace, proves the two exact legacy identities unchanged, and
publishes a terminal FAILURE receipt. SUCCESS and FAILURE receipts live
outside the rollback namespace, are canonical single-link `0444` files, and
make the artifact terminal and replay-safe.

The revoker removes A04 authorization before trusting installed bytes,
quiesces only A04, retains A04 evidence and metadata plus the activation
receipt digest, removes only the A04 controller root, and leaves every legacy
path untouched. Drift removes authorization and preserves forensic state.

## Gate order

1. Build and run all disposable non-privileged tests.
2. Freeze the exact artifact revision and hashes.
3. Obtain the independent pre-activation HIGH-risk review.
4. Present the one-shot administrator handoff.
5. After activation, run the single authoritative P01 suite and the complete
   exact-candidate/evidence review before protected integration.

Do not invoke the administrator handoff before step 3 is approved.
