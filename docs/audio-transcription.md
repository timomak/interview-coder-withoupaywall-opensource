# Audio capture and transcription

InterviewCopilot treats voice as an explicit, session-scoped input. Starting or
resuming an interview never opens an audio device: microphone and system audio
both begin off, and only a visible Record or source action may activate them.
Hiding or collapsing the HUD does not change capture state.

## Architecture and source state

The renderer sends validated audio commands to the Electron main process. The
main process owns one audio session state machine, a source-separated native
helper, the local transcription adapter, optional Apple Speech fallback, and
the bridge into the existing interview conversation. Native messages carry a
source identifier and monotonic timestamps so microphone and system audio are
never silently mixed.

| Current state | Master Record | Microphone control | System-audio control |
| --- | --- | --- | --- |
| Both off or paused | Starts or resumes both | Starts microphone only | Starts system audio only |
| One active | Starts or resumes both | Toggles microphone only | Toggles system audio only |
| Both active | Pauses both | Pauses microphone only | Pauses system audio only |

Reset stops capture, reaps helper/sidecar processes, removes temporary buffers,
and returns both sources to off. A recovered session also resumes with capture
off. Source activation is never restored from preferences or an archived
session.

## Permissions and recovery

Permissions are requested in context, when the user first activates the
corresponding source. A denial or helper error disables only that source;
screenshots, typed input, and the other audio source remain available. The UI
offers **Open System Settings** and **Retry**. InterviewCopilot never retries a
permission prompt without that explicit action.

System audio uses the supported macOS ScreenCaptureKit path. Microphone capture
uses AVAudioEngine. The helper protocol rejects unknown commands, oversized
frames, invalid clocks, and mismatched source identifiers before audio reaches
transcription.

## Local and remote transcription

Local transcription is the default. The selected `whisper.cpp` engine, model,
license, size, provenance, and platform hashes are pinned in the committed
audio resource manifest. Startup validates the exact bytes before the local
adapter can run. A missing or mismatched binary/model disables local
transcription; it does not silently fall back or download replacement bytes.

Apple Speech is the only optional remote transcription path. It is disabled by
default and requires an explicit Audio-setting opt-in. When active, the HUD and
Audio settings visibly say **Remote**. A local failure never enables it
automatically. Apple Speech is a transcription adapter only and has no access
to answer-generation commands.

## Temporary data and retention

Raw frames are written only when the native adapter requires a bounded
temporary file. Every such file is created with owner-only mode `0600`, stays
inside the audio temporary root, and is removed after finalization, failure,
cancellation, Reset, or startup crash cleanup. The encrypted blob repository
also rejects `audio/*`, `application/x-raw-audio`, and the `raw-audio`
retention class as a defense in depth.

Raw audio must never appear in:

- encrypted session archives;
- diagnostics or diagnostic exports;
- stdout/stderr or application logs;
- pending interview artifacts;
- model/provider requests.

Only finalized transcript text may cross into the interview session.

## Attribution, correction, and questions

System-audio segments default to **Interviewer** and microphone segments to
**You**. Provider-assisted diarization may refine labels from finalized text,
but uncertain attribution stays visibly uncertain. A correction updates the
typed active-session segment and the eventual encrypted archive projection.

Diarization and question detection reuse the one selected persistent provider
conversation. They receive finalized transcript text and source/timestamp
metadata only—never raw audio—and cannot create a second hidden conversation.
A detected question becomes an editable pending candidate. It performs zero
answer-provider calls until the user explicitly chooses Solve, Design, Coach,
or Submit.

## Visible and accessible state

The audio surface exposes Microphone off, Listening, Speech detected,
Transcribing, Question detected, Preparing answer, Ready, and Audio or
permission error. Every state has text or an accessible name; color is never
the only signal. The restrained waveform has a text equivalent, stops when
capture is inactive, and respects reduced-motion preferences.

## Verification and rollback

Committed fixtures use synthetic marker speech only and record their source
text, license, format, duration, byte size, and SHA-256. Offline qualification
denies network access and runs the actual pinned local engine/model. Separate
fixtures preserve microphone and system clocks and source IDs end to end.

Rollback stops and reaps audio processes, removes known temporary buffers, and
removes packaged engine/model resources. Encrypted session records remain;
older code ignores transcript fields it cannot render. Rollback never restores
source activation, Apple consent, or raw audio.
