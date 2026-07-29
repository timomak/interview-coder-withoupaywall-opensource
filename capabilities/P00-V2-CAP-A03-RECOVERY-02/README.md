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
filesystem, records content, ownership, modes, xattrs, and ACL facts for the
root and every descendant, and audits every remaining run-state member with
the exact sealed A03 validator.

A root-owned, fsync-backed state journal precedes every relocation,
authorization, child-transition, and receipt boundary. A replay removes the
dedicated authorization first. It then restores exact A02 and the dependency
tree, or finalizes an already exact A03 commit. A verified outer A02 payload
snapshot and run-metadata snapshot cover interruption around the unchanged
A03 child installer.

On an orderly pre-commit failure, transient authorization is removed first and
the dependency tree is atomically restored with its recorded facts verified.
On success, the tree, exact A02 rollback snapshot, and metadata snapshot remain
quarantined for later evidence-led cleanup. Terminal outcomes write a
sanitized immutable receipt; interrupted nonterminal outcomes retain the
journal for deterministic replay. The unchanged A03 installer remains
responsible for its own complete installed-byte, native-self-test,
quiescence, rollback, and final empty-argument authorization checks.

Legacy v1 remains quarantined, unauthorized, and never invoked. The expired
RECOVERY-01 handoff is neither referenced nor reused.
