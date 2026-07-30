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
bytes. A closed external installed-state manifest binds every installed
payload and metadata member, exact filesystem facts, the exact sudoers bytes,
and the terminal receipt. Authorization remains unusable until that manifest
and a SUCCESS receipt are durably published and the transaction journal is
removed. Both privileged cores repeat that admission check before doing work.

A root-owned external journal closes every hard-crash gap. Replay removes A04
authorization first unless an exact durable SUCCESS state can be completed;
otherwise it deletes only the fresh namespace, proves the two exact legacy
identities unchanged, and publishes a terminal FAILURE receipt. SUCCESS and
FAILURE receipts live outside the rollback namespace, use a closed canonical
schema, and are single-link `0444` files. Receipt or journal publication
failure retains the journal so the next exact replay can finish safely.

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
