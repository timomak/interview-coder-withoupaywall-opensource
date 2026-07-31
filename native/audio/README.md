# Native audio boundary

This Swift package is the macOS-only process boundary for microphone and system
audio. The process has two channels:

- newline-delimited JSON commands/events on stdin/stdout;
- bounded binary PCM frames on file descriptor 3.

Audio bytes never enter JSON, stderr, or application logs. Each binary frame
contains protocol version, source, sequence, monotonic timestamp, and a bounded
payload. The Electron decoder clears frame buffers after the consumer settles.
The helper keeps each source's frame channel closed until its corresponding
`started` event has been synchronously written, so startup callbacks cannot
overtake the control-plane handshake.

`CaptureCoordinator` constructs a source only after an explicit `start`
command. Creating or resuming an InterviewCopilot session therefore cannot open
a device or request permission. The real adapters use AVAudioEngine for the
microphone and ScreenCaptureKit for system audio. Swift tests inject source
factories and do not touch devices or permission APIs.

## Apple Speech adapter

`interviewcopilot-apple-speech` is the only native remote-transcription path.
It accepts exactly `--file <absolute-wav>`, rejects symlinks, non-owner-only
files, non-WAV inputs, and inputs larger than 32 MiB, then requests macOS Speech
authorization in context. It emits exactly one bounded UTF-8 JSON line on
success (`{"schemaVersion":1,"text":"..."}`) and no diagnostic or audio data
on either output stream. Denial, unavailability, timeout, cancellation, and
recognition failures exit nonzero. The adapter is transcription-only and has no
answer-generation command or persistent storage.

The packaged app Info.plist must merge `build/Info.mac.plist`; those microphone
and Speech usage strings are release metadata, not entitlements. The native
adapter must be launched only after the persisted Apple Speech setting has been
explicitly enabled, and its binary hash must be verified before spawn.

## Local transcription supply chain

`resources/audio/audio-artifacts-v1.json` pins whisper.cpp v1.8.6 at commit
`23ee03506a91ac3d3f0071b40e66a430eebdfa1d` and the `base.en` model at repository
revision `5359861c739e955e79d9a303bcbc70fb988958b1`. Source, model, and
architecture binary hashes are mandatory. The model is intentionally not
committed to Git.

`scripts/build-whisper-artifacts.sh` accepts an empty absolute output directory,
downloads only those pinned inputs, verifies them before extraction/use, and
cross-builds arm64 and x86_64 command-line binaries. Integration packaging owns
copying the qualified binaries/model into the app.

The actual-engine harness requires an external artifact directory containing
the qualified binaries, model, and the two synthetic WAV fixtures described by
`tests/fixtures/audio/synthetic-fixtures-v1.json`:

```sh
node native/audio/harness/verify-local-transcription.mjs \
  /absolute/artifact-root \
  /absolute/repo/resources/audio/audio-artifacts-v1.json \
  /absolute/repo/tests/fixtures/audio/synthetic-fixtures-v1.json
```

It verifies every checksum and runs the actual engine under a
`sandbox-exec` profile that denies network. Synthetic fixtures establish
offline execution and channel-marker preservation only. They do not establish
real-device permission behavior, diarization accuracy, native Intel behavior,
or performance on native Intel hardware. The x64 whisper binary did produce
both expected pinned marker transcripts under Rosetta with network denied.
