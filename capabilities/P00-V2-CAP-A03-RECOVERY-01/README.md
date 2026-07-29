# P00-V2-CAP-A03-RECOVERY-01

One-shot sealed recovery transaction for the exact InterviewCopilot state in
which the reviewed P00-V2-CAP-A03 installation rolled back to exact A02 payload
bytes while intentionally leaving the A02 sudoers authorization absent.

This artifact does not define a new verification capability. It:

1. admits only the exact root-owned A02 payload and metadata with the exact
   A02 authorization absent;
2. installs the exact reviewed A02 empty-argument sudoers rule transiently
   inside the same root transaction;
3. invokes the unchanged, independently approved A03 installer and envelope;
4. removes authorization again on every failed path; and
5. commits only after the exact A03 installed manifest and authorization pass.

The stale A03 handoff is not invoked. Legacy v1 remains quarantined and is never
authorized or executed.
