import path from "node:path"
import { describe, expect, it } from "vitest"
import { loadAudioArtifactManifest } from "./artifactManifest"

describe("pinned local transcription artifacts", () => {
  it("pins source model licenses checksums and both macOS architectures", async () => {
    const manifest = await loadAudioArtifactManifest(
      path.resolve("resources/audio/audio-artifacts-v1.json")
    )
    expect(manifest.engine).toMatchObject({
      name: "whisper.cpp",
      tag: "v1.8.6",
      commit: "23ee03506a91ac3d3f0071b40e66a430eebdfa1d",
      license: {
        id: "MIT",
        sha256: "94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d"
      }
    })
    expect(manifest.model).toMatchObject({
      repositoryRevision: "5359861c739e955e79d9a303bcbc70fb988958b1",
      bytes: 147_964_211,
      sha256: "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
      license: {
        id: "MIT",
        sha256: "b5d65a59060e68c4ff940e1eddfa6f94b2d68fdf58ed7f4dd57721c997e35e9d"
      }
    })
    expect(manifest.binaries.arm64).toMatchObject({
      qualification: "qualified",
      sha256: "7c0ee3d080d03df6d2dcb5e398b7e83fe7cfae74ce1122e4c55322bbf59b30a6"
    })
    expect(manifest.binaries.x64).toMatchObject({
      qualification: "qualified",
      sha256: "657b0b29bfbf9e4f7947af1938849d4240611aa76d7de1048e1edd547d9f18f5"
    })
  })
})
