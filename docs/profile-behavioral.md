# Candidate context and Behavioral mode

M-06 stores the canonical candidate dossier, claim provenance, named
opportunities, active selection, and synthetic drafts only through the
encrypted record repository. Search is an in-memory projection and writes no
plaintext index. Markdown imports become sanitized review drafts; they never
overwrite a reviewed dossier or execute HTML, links, or embedded instructions.
Export requires an explicit absolute destination and refuses overwrite.
Reviewed dossier revisions and guided-conversation messages remain encrypted
and resumable; replacing a dossier retains the prior revision in encrypted
history.

An opportunity selection is snapshotted at Start. Behavioral receives the
reviewed dossier and that opportunity. System Design receives only applicable
professional context. Coding receives neither.

Behavioral answers use one fact object for concise talking points, STAR,
Evidence, Follow-ups, and optional Full Answer. Verified and user-edited
stories can reference only dossier-backed claims; missing metrics stay
qualitative. Synthetic stories are disabled by default. Opt-in content is
persisted only after successful provider completion and labeled
`synthetic-draft` in every view and reuse.
The live mode deliberately has no Practice score, feedback, or coaching review.
