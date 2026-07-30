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

The encrypted M-04 snapshot stores a committed delivery cursor and at most one
pending packet. Preparing a turn writes the pending packet before provider I/O.
Only an accepted completion commits its cursor; failure, cancellation, or a
crash reuses the exact pending packet and attempt ID. This prevents evidence
from being skipped after an uncertain delivery and prevents accepted evidence
from being duplicated on the following turn.

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
Each provider line is normalized, reduced, and encrypted before the next line
callback proceeds. Cancel aborts the current child turn but retains already
persisted partial and completed bytes and the native provider conversation.
Continue uses the original request ID and names only unfinished section IDs.

Curated mode actions, typed chat, and clarification all call the one
`ProviderSession` created at Start/Resume. Structured, mode-valid payloads
update typed sections. Ordinary clarification becomes a compact exchange and
leaves the curated answer byte-for-byte unchanged. There is no chat-only
driver, child, session, or thread.

Generation is always best effort. The policy has no numeric confidence or
blocking review state. Mode-specific frozen fixtures derive missing fields from
the actual prompt, locked context, and submitted artifacts. The policy records
only consequential assumptions and suggests a clarification only when the
fixture says the missing answer can materially alter the result. A correction
is an ordered context delta on the same conversation and must return exactly
the frozen affected-section set; the reducer changes only those IDs.

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

Commands, provider turns, and record writes share one main-process queue.
Cancel and Reset synchronously abort the relevant child before their queued
transition; every turn also carries a generation token, so late callbacks
cannot publish into a newer lifecycle. Reset waits for cancellation to settle
and for the encrypted archive write to succeed before publishing Idle.

The production composition root restores one screenshot queue and maps global
capture, submit, exclude-last, Reset, movement, visibility, opacity, zoom, and
quit shortcuts to typed actions. The screenshot helper owns capture mechanics
only; it cannot change renderer views or session state. Reset clears captured
files only after the typed Reset succeeds, preventing UI shortcuts from
becoming a second session authority.

Forward M-04 versions are rejected. There is no lossy downgrade. Rollback keeps
the encrypted v1 record readable by the current build; withdrawing P04 restores
the admitted code revision without converting the encrypted record to
plaintext.

## Failure modes prevented

- Exact sequence/session/event checks stop retries and late streams from
  corrupting another interview.
- Serialized commands and generation checks stop overlapping writes and stale
  provider callbacks from crossing Reset.
- Main-process ownership prevents renderer or provider code from maintaining a
  second session authority.
- Write-ahead delivery state prevents both skipped and duplicated context after
  failure, cancellation, or crash.
- Context filtering at snapshot and send time prevents Coding profile or
  opportunity leakage.
- Stable section IDs and completion guards prevent partial output from
  replacing finished content.
- Encrypted capture-off recovery prevents silent capture restart and plaintext
  provider-ID disclosure.
- Correction impact validation prevents a narrow correction from rewriting
  unrelated answer sections.
