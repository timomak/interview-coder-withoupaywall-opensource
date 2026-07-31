import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { AppleSpeechTranscriber } from "./AppleSpeechTranscriber"
import { sha256File } from "./artifactManifest"

const roots: string[] = []

async function fixtureAdapter(
  output: string
): Promise<{ readonly executable: string; readonly wave: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "ic-apple-speech-"))
  roots.push(root)
  const executable = path.join(root, "apple-speech-fixture")
  const wave = path.join(root, "segment.wav")
  await writeFile(
    executable,
    [
      "#!/bin/sh",
      'test "$1" = "--file"',
      'test "$2" = "' + wave + '"',
      "printf '%s\\n' '" + output.replaceAll("'", "'\\''") + "'"
    ].join("\n"),
    { mode: 0o700 }
  )
  await chmod(executable, 0o700)
  await writeFile(wave, Buffer.from("RIFF fixture"), { mode: 0o600 })
  return { executable, wave }
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("Apple Speech native adapter boundary", () => {
  it("accepts only the reviewed bounded JSON result", async () => {
    const fixture = await fixtureAdapter(
      '{"schemaVersion":1,"text":"How would you partition the queue?"}'
    )
    const transcriber = new AppleSpeechTranscriber({
      executable: fixture.executable,
      expectedSha256: await sha256File(fixture.executable)
    })

    await expect(transcriber.transcribe(fixture.wave)).resolves.toBe(
      "How would you partition the queue?"
    )
  })

  it("rejects unreviewed result fields and modified adapter bytes", async () => {
    const fixture = await fixtureAdapter(
      '{"schemaVersion":1,"text":"question","answer":"forbidden"}'
    )
    const expectedSha256 = await sha256File(fixture.executable)
    const transcriber = new AppleSpeechTranscriber({
      executable: fixture.executable,
      expectedSha256
    })
    await expect(transcriber.transcribe(fixture.wave)).rejects.toThrow(
      "invalid result"
    )

    await writeFile(fixture.executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 })
    await expect(transcriber.transcribe(fixture.wave)).rejects.toThrow(
      "checksum"
    )
  })
})
