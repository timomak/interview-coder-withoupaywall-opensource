# P00-V2-CAP-A03-RECOVERY-02

Fresh one-shot sealed recovery transaction for the exact InterviewCopilot state
left after the expired RECOVERY-01 administrator process exited:

- exact P00-V2-CAP-A02 payload remains installed;
- A02 and legacy v1 have no sudoers authorization;
- P00-V2-CAP-A03 is absent;
- candidate `2e5045116db6e3c5f6e6cc18b70df6d7fa021baf` is unchanged; and
- one preserved historical P01 checkout contains package-manager symlinks that
  the exact A03 run-state validator correctly refuses to normalize.

The transaction does not delete or rewrite that historical checkout. Before
publishing any transient authorization it atomically moves only the exact
known `node_modules` subtree into an artifact-specific quarantine on the same
filesystem, records hashes and metadata for every member, and audits every
remaining run-state member with the exact sealed A03 validator.

On any failure, transient authorization is removed first and the dependency
tree is atomically restored with its recorded facts verified. On success, the
tree remains quarantined for later evidence-led cleanup. Both outcomes write a
sanitized immutable receipt, making the artifact one-shot. The unchanged A03
installer remains responsible for its own atomic payload rollback and final
empty-argument authorization.

Legacy v1 remains quarantined, unauthorized, and never invoked. The expired
RECOVERY-01 handoff is neither referenced nor reused.
