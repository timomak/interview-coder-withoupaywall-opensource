# Native audio boundary

This Swift package is the macOS-only process boundary for microphone and system
audio. The process has two channels:

- newline-delimited JSON commands/events on stdin/stdout;
- bounded binary PCM frames on file descriptor 3.

Audio bytes never enter JSON, stderr, or application logs. Each binary frame
contains protocol version, source, sequence, monotonic timestamp, and a bounded
payload. The Electron decoder clears frame buffers after the consumer settles.

`CaptureCoordinator` constructs a source only after an explicit `start`
command. Creating or resuming an InterviewCopilot session therefore cannot open
a device or request permission. The real adapters use AVAudioEngine for the
microphone and ScreenCaptureKit for system audio. Swift tests inject source
factories and do not touch devices or permission APIs.

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
real-device permission behavior, diarization accuracy, x86_64 runtime behavior,
or performance on untested hardware.
