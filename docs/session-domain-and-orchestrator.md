# Interview session domain and orchestrator

P04 makes the main-process `InterviewOrchestrator` and the pure
`reduceInterviewSession` function the only InterviewSession authority. The
renderer receives immutable state snapshots over typed IPC; it never owns a
provider process, conversation, reducer, or persistence path.

## Lifecycle and event contract

```text
Idle -- Start(sequence 1) --> Active -- Reset --> Idle + encrypted archive
                              |
                              +-- context/evidence/request/section/chat events
```

Every active-session event contains a session ID, event ID, monotonically
increasing sequence, and timestamp. The reducer accepts only the exact next
sequence for the active session. It returns the original state object for a
duplicate event ID, stale sequence, future sequence, cross-session event, or
invalid transition. `Start` is accepted only from Idle and `Reset` is the sole
terminal transition. Preferences and reusable record IDs survive Reset.

Start locks mode, provider, model, response mode, language, and applicable
context. Later configuration changes apply to a future session. The Coding
snapshot and every Coding context packet remove profile and opportunity items,
which prevents personal-context bytes from reaching the provider even when an
upstream caller supplies them accidentally.

The renderer boundary accepts only the closed `InterviewCommand` union:
Start, stage/select evidence, submit, cancel, Continue, Reset, and Resume.
Malformed objects and unknown fields/routes are rejected before the
orchestrator sees them.

## Context synchronization

The first provider turn sends one ordered seed. Later turns send only items
whose revision is newer than the revision already sent and evidence that has
not already crossed the provider boundary.

| Order | Source | Coding | System design / Behavioral |
|---|---|---:|---:|
| 1 | Instructions | included | included |
| 2 | Transcript | included | included |
| 3 | Screenshot | included | included |
| 4 | Profile | excluded | included |
| 5 | Opportunity | excluded | included |

The visible status is derived, not guessed:

- `New context`: no synchronization has started.
- `Updating`: a provider context turn is in progress.
- `Full context`: the latest update succeeded.
- `Context issue`: the latest update failed, with detail available.

A provider-reported compaction does not change `Full context` to a loss state.
Compaction reason and time appear only in detail. Detail also shows the locked
provider/model/mode, last successful update, exact per-category counts,
personal-context included/Coding-excluded state, and provider-reported usage.
It never claims that original tokens remain verbatim.

## Evidence and response stability

Finalized transcripts and screenshots are staged selected. Deselecting an item
keeps it local; submitting marks it accepted and prevents a retry from sending
it again. An empty submission is rejected. When submitted evidence conflicts,
screenshot evidence is authoritative. Without a screenshot, transcript
evidence is primary.

A structured request declares stable section IDs and order before output
arrives. Section deltas append to partial output; a completed section cannot be
replaced. Independent completion therefore never reorders the visible answer.
Cancel aborts the current child turn but retains partial and completed bytes
and the native provider conversation. Continue uses the original request ID
and names only unfinished section IDs.

Curated mode actions, typed chat, and clarification all call the one
`ProviderSession` created at Start/Resume. Structured, mode-valid payloads
update typed sections. Ordinary clarification becomes a compact exchange and
leaves the curated answer byte-for-byte unchanged. There is no chat-only
driver, child, session, or thread.

Generation is always best effort. The policy has no numeric confidence or
blocking review state. It records only consequential assumptions and suggests
a clarification only when the frozen impact fixture says the missing answer
can materially alter the result. A correction is an ordered context delta on
the same conversation and must return exactly the frozen affected-section set;
the reducer changes only those IDs.

## Reset, cancellation, and M-04 recovery

M-04 schema version 1 stores the active session and opaque native provider
conversation ID in one P03 AES-256-GCM record. The active record type is
`application/vnd.interviewcopilot.m04+json`. The ID is never placed in config,
an index, a log, renderer state, or a provider-owned application file. P02
receives it only in memory when P04 creates or explicitly resumes its
`ProviderSession`.

Each accepted event writes an encrypted capture-off snapshot. On relaunch the
main process may report that recovery is available, but it does not construct
the provider session until the user chooses Resume. Resume reopens the same
conversation and keeps capture off. Reset aborts active work, applies the sole
terminal reducer event, writes an encrypted archive-ready record, removes the
active record, drops the provider binding, and clears active artifacts. A
Reset chosen at the recovery prompt archives the recovered snapshot without
resuming it.

Forward M-04 versions are rejected. There is no lossy downgrade. Rollback keeps
the encrypted v1 record readable by the current build; withdrawing P04 restores
the admitted code revision without converting the encrypted record to
plaintext.

## Failure modes prevented

- Exact sequence/session/event checks stop retries and late streams from
  corrupting another interview.
- Main-process ownership prevents renderer or provider code from maintaining a
  second session authority.
- Context filtering at snapshot and send time prevents Coding profile or
  opportunity leakage.
- Stable section IDs and completion guards prevent partial output from
  replacing finished content.
- Encrypted capture-off recovery prevents silent capture restart and plaintext
  provider-ID disclosure.
- Correction impact validation prevents a narrow correction from rewriting
  unrelated answer sections.
