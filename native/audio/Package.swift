// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "InterviewCopilotAudio",
  platforms: [.macOS(.v13)],
  products: [
    .library(name: "InterviewCopilotAudioBoundary", targets: ["InterviewCopilotAudioBoundary"]),
    .executable(name: "interviewcopilot-audio-helper", targets: ["InterviewCopilotAudioHelper"]),
  ],
  targets: [
    .target(
      name: "InterviewCopilotAudioBoundary",
      linkerSettings: [
        .linkedFramework("AVFoundation"),
        .linkedFramework("CoreMedia"),
        .linkedFramework("ScreenCaptureKit"),
      ]
    ),
    .executableTarget(
      name: "InterviewCopilotAudioHelper",
      dependencies: ["InterviewCopilotAudioBoundary"]
    ),
    .testTarget(
      name: "InterviewCopilotAudioBoundaryTests",
      dependencies: ["InterviewCopilotAudioBoundary"]
    ),
  ]
)
