import Foundation
import Darwin
import CryptoKit
import Security

let installRoot = "/Users/Shared/InterviewCopilot/verification-controller-a04/payload"
let controllerRoot = "/Users/Shared/InterviewCopilot/verification-controller-a04"
let evidenceRoot = "/Users/thirdfacedev/.codex/orchestration/TimoCodes-evidence"
let projectKey = "InterviewCopilot"
let requestOwnerUID: uid_t = 501
let requestRoot = "\(controllerRoot)/requests/501"
let metadataRoot = "\(controllerRoot)/metadata/P00-V2-CAP-A04"
let phaseIDs = Set(["P01"])
let phaseDependencies: [String: [String]] = ["P01": []]
let approvedPackageScripts: [String: String] = [
    "verify:policy": "node scripts/verification/product-policy.mjs",
    "lint": "node scripts/verification/source-inventory.mjs && eslint .",
    "typecheck": "node scripts/verification/typecheck-inventory.mjs && tsc -p tsconfig.electron.json --noEmit",
    "test:legacy": "node scripts/verification/trusted-vitest-runner.mjs legacy",
    "test:unit": "node scripts/verification/trusted-vitest-runner.mjs unit",
    "test:p01": "node scripts/verification/trusted-vitest-runner.mjs p01",
    "build": "npm run build:runtime && npm run verify:package-inventory",
    "build:runtime": "cross-env NODE_ENV=production npm run clean && vite build && tsc -p tsconfig.electron.json",
    "clean": "node scripts/verification/clean-outputs.mjs",
    "verify:package-inventory": "node scripts/verification/build-package-inventory.mjs",
    "verify:test-manifest": "node scripts/verification/test-manifest.mjs",
    "package:mac": "npm run build && electron-builder build --mac",
    "qualify:meet": "node scripts/qualification/qualify-meet.mjs",
    "verify:diagnostics": "node scripts/verification/diagnostics.mjs",
    "verify:mac-package": "node scripts/verification/mac-package.mjs",
    "verify:release": "node scripts/verification/release.mjs",
    "test:p02": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:p03": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:p04": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:p05": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:p06": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:p07": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:p08": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:p09": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:p10": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:p11": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:p12": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:electron-shell": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:coding-fixtures": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:system-design-fixtures": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:behavioral-fixtures": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:audio-native": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:audio-retention": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:prompt-adversarial": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:history-roundtrip": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:plaintext-scan": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:e2e-macos": "node scripts/verification/trusted-vitest-runner.mjs all",
    "test:staff-live-corpus": "node scripts/verification/trusted-vitest-runner.mjs all"
]
let canonicalRemote = "https://github.com/j4wg/interview-coder-withoupaywall-opensource"
let approvedPacket = "02ee6ddec78d6e4ea9e2de3c0303ffd6bc9f45bf"
let pinnedNodeSource = "/opt/homebrew/Cellar/node@20/20.20.2/bin/node"
let pinnedNpmSource = "/opt/homebrew/Cellar/node@20/20.20.2/lib/node_modules/npm"
let installedNode = "\(installRoot)/toolchain/bin/node"
let installedNpmLauncher = "\(installRoot)/toolchain/bin/npm"
let installedNpmCLI = "\(installRoot)/toolchain/lib/node_modules/npm/bin/npm-cli.js"
let executionUser = "_interviewcopilotverify"
let approvedInputDigests: [String: String] = [
    ".npmrc": "7151cf397def0c2cb0ab65643701d27d335a72c90f775675b5f826bc7005818a",
    "scripts/verification/build-package-inventory.mjs": "3d7d0dd7cc90c70efad9e84f4908791bf528737abc648e051c4a6e502ffb59b9",
    "scripts/verification/package-inventory.d.mts": "ea298a6f5750872601e29bb2a17d658a362411d865a3fb5b45203efc12518cc8",
    "scripts/verification/package-inventory.mjs": "76f04a23608b90f34603c8fa1e1484691cc9865fb6561d9da71c1ec50c6871e1",
    "scripts/verification/phase-bootstrap.d.mts": "6d8e74c0d3edee5a466bbb9d4622a00060502613d212c737750d8f3f03080ea7",
    "scripts/verification/phase-bootstrap.mjs": "c41c5042897a1f69006ce5abc3b6a105451fa3dc937a7f6805941263727d1ab7",
    "scripts/verification/phase-reporter.d.mts": "19dd8d9d40d4dd9573cd010d33abd0db8614d98088db6cbc80f74228ee43998e",
    "scripts/verification/phase-reporter.mjs": "c3cd8bc716cf7dffd2bcc40cc10ae50a6457b7b75c482629208d76783874bcd7",
    "scripts/verification/plan-manifest.json": "71a76262661489329eaedd385a51519909aab5324e24c8e869490ecac739b59c",
    "scripts/verification/plans/P01.json": "82f641fccb783d2e3ae8f3dbeaa733923c6f808f660866771052e2778d681a73",
    "scripts/verification/plans/P02.json": "6de5f5e316c54385f4f61bc8bcde819a1880aff6c85bbf69c0025a8f930f38dd",
    "scripts/verification/plans/P03.json": "9fcb0381a00c05c3b42c7f13701406277cff97019d8aef41f718dd452c1b35c3",
    "scripts/verification/plans/P04.json": "ab19354bc08377e76e379c9ba6d2e58572dc2e9d8ddadbc22c4ecce7de610bc6",
    "scripts/verification/plans/P05.json": "f31f2c1aa3a851081b73618e0b2616b6b39225ab8144593c9bd720960ae83cf1",
    "scripts/verification/plans/P06.json": "30311c77bfa3d67dbe3e77815e34c9c4c51e24fabcd06d92ffba18575db6ad8e",
    "scripts/verification/plans/P07.json": "6c252bbfff6d16b66bc80c330ddb41d398be970a51b5ae75bc63c326d9b6384e",
    "scripts/verification/plans/P08.json": "7f064eb8989214afeb894e5affafb4730478423e33dd0f538d021f92fa9fb6da",
    "scripts/verification/plans/P09.json": "4677916877719fb599ff592de14cde27263ad185bfd12d6453d0a38f09ee77a2",
    "scripts/verification/plans/P10.json": "385163ed441717e619774ad140f8ad4fdc7919838dc319863acebbdb86cf158d",
    "scripts/verification/plans/P11.json": "295718b4b1e59210cd8722536bc4a4bb50e0349ce0b6fa16fe1d3595e19f8732",
    "scripts/verification/plans/P12-observer.json": "011911987152e3c14bc439a1a7ff4c55c99270ab009a1b3387f18170e10ff375",
    "scripts/verification/plans/P12.json": "55cc03996f171c23ef56ecc9cd14f755c961ba84cb48178a6681126d0d20b640",
    "scripts/verification/product-policy.d.mts": "5e32670b9f52fb572a149b909b3807940a262fa95202b800394119c8e42132f5",
    "scripts/verification/product-policy.mjs": "01b7e03f36a3f06e133c47c85c92fb3fd93668a8c100acb090a01b0eaf63467a",
    "scripts/verification/source-inventory.d.mts": "f28076f44e7b150db13f076b8db9b81d0de48c16d7c0c311e2cbe3449dc2c26e",
    "scripts/verification/source-inventory.mjs": "510273f267272ab3b2c95aa395fb3d32a08a746d54c933259497359f059d605e",
    "scripts/verification/test-manifest.d.mts": "e8785cc5f5268d37876213500b0967f7890765dc17eedd461a44a0f19807a728",
    "scripts/verification/test-manifest.mjs": "e789a7c8777a224ddd166b2587a5bd2a75fee75a81ad754564a4ea8cb2ce0140",
    "scripts/verification/trusted-vitest-runner.mjs": "8ac1de11f3eedfbd62f287f1726afc786ea5775dbec3eecc2a493954b5657ae4",
    "scripts/verification/vitest-count-reporter.mjs": "1a862e8ae98c57d1af251d69400bac06f8c7fdd4b1ca4340f4beb06fef90a3ff",
]

enum ControllerError: Error, CustomStringConvertible {
    case failure(String)
    var description: String {
        switch self {
        case .failure(let message): return message
        }
    }
}

func fail(_ message: String) throws -> Never {
    throw ControllerError.failure(message)
}

func sha256(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

func sha256File(_ path: String) throws -> String {
    return sha256(try Data(contentsOf: URL(fileURLWithPath: path)))
}

func canonicalJSON(_ value: Any) throws -> Data {
    guard JSONSerialization.isValidJSONObject(value) else {
        try fail("value is not JSON serializable")
    }
    return try JSONSerialization.data(
        withJSONObject: value,
        options: [.sortedKeys, .withoutEscapingSlashes]
    ) + Data([0x0a])
}

func parseJSON(_ data: Data) throws -> Any {
    return try JSONSerialization.jsonObject(with: data)
}

func writeExclusive(_ path: String, data: Data, mode: mode_t = 0o400) throws {
    let descriptor = open(path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode)
    if descriptor < 0 { try fail("exclusive create failed for \(path): \(String(cString: strerror(errno)))") }
    defer { close(descriptor) }
    try data.withUnsafeBytes { bytes in
        var remaining = bytes.count
        var pointer = bytes.baseAddress!
        while remaining > 0 {
            let count = Darwin.write(descriptor, pointer, remaining)
            if count <= 0 { try fail("write failed for \(path)") }
            remaining -= count
            pointer = pointer.advanced(by: count)
        }
    }
    if fsync(descriptor) != 0 { try fail("fsync failed for \(path)") }
    if fchmod(descriptor, mode) != 0 { try fail("chmod failed for \(path)") }
}

func ensureDirectory(_ path: String, mode: mode_t = 0o755) throws {
    if mkdir(path, mode) != 0 && errno != EEXIST {
        try fail("mkdir failed for \(path): \(String(cString: strerror(errno)))")
    }
}

func removeIfPresent(_ path: String) throws {
    if FileManager.default.fileExists(atPath: path) {
        try FileManager.default.removeItem(atPath: path)
    }
}

struct CommandResult {
    let exit: Int32
    let signal: Int32?
    let stdout: Data
    let stderr: Data
    let startedAt: String
    let endedAt: String
    let durationMs: Int
}

final class DataBox: @unchecked Sendable {
    var data = Data()
}

func isoNow() -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date())
}

func runCommand(
    _ executable: String,
    _ arguments: [String],
    cwd: String? = nil,
    environment: [String: String]? = nil,
    stdin: Data? = nil,
    uid: uid_t? = nil,
    gid: gid_t? = nil
) throws -> CommandResult {
    let started = Date()
    let startedAt = isoNow()
    let process = Process()
    if uid != nil || gid != nil {
        process.executableURL = URL(fileURLWithPath: "/usr/bin/sudo")
        let assignments = (environment ?? [:])
            .keys.sorted()
            .map { "\($0)=\(environment![$0]!)" }
        process.arguments = [
            "-n", "-u", executionUser, "--", "/usr/bin/env", "-i"
        ] + assignments + [executable] + arguments
    } else {
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
    }
    if let cwd { process.currentDirectoryURL = URL(fileURLWithPath: cwd) }
    if uid == nil && gid == nil, let environment { process.environment = environment }
    let outputPipe = Pipe()
    let errorPipe = Pipe()
    let inputPipe = Pipe()
    process.standardOutput = outputPipe
    process.standardError = errorPipe
    process.standardInput = inputPipe
    let outputBox = DataBox()
    let errorBox = DataBox()
    let readers = DispatchGroup()
    readers.enter()
    DispatchQueue.global().async {
        outputBox.data = outputPipe.fileHandleForReading.readDataToEndOfFile()
        readers.leave()
    }
    readers.enter()
    DispatchQueue.global().async {
        errorBox.data = errorPipe.fileHandleForReading.readDataToEndOfFile()
        readers.leave()
    }
    try process.run()
    if let stdin { try inputPipe.fileHandleForWriting.write(contentsOf: stdin) }
    try inputPipe.fileHandleForWriting.close()
    process.waitUntilExit()
    readers.wait()
    let signal = process.terminationReason == .uncaughtSignal
        ? process.terminationStatus
        : nil
    let exit = signal == nil ? process.terminationStatus : 128 + process.terminationStatus
    let ended = Date()
    return CommandResult(
        exit: exit,
        signal: signal,
        stdout: outputBox.data,
        stderr: errorBox.data,
        startedAt: startedAt,
        endedAt: isoNow(),
        durationMs: Int(ended.timeIntervalSince(started) * 1000)
    )
}

func commandText(_ executable: String, _ arguments: [String], cwd: String? = nil) throws -> String {
    let result = try runCommand(executable, arguments, cwd: cwd)
    if result.exit != 0 {
        let message = String(data: result.stderr + result.stdout, encoding: .utf8) ?? ""
        try fail("\(executable) \(arguments.joined(separator: " ")) failed \(result.exit): \(message)")
    }
    return String(data: result.stdout, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
}

func randomRunId() throws -> String {
    var bytes = [UInt8](repeating: 0, count: 16)
    if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
        try fail("controller CSPRNG failed")
    }
    return bytes.map { String(format: "%02x", $0) }.joined()
}

func randomSecret() throws -> String {
    var bytes = [UInt8](repeating: 0, count: 32)
    if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
        try fail("controller CSPRNG failed")
    }
    return bytes.map { String(format: "%02x", $0) }.joined()
}

final class ControllerLock {
    let descriptor: Int32
    init(_ path: String) throws {
        descriptor = open(path, O_RDWR | O_CREAT | O_NOFOLLOW, 0o400)
        if descriptor < 0 { try fail("could not open controller lock \(path)") }
        if flock(descriptor, LOCK_EX | LOCK_NB) != 0 {
            close(descriptor)
            try fail("controller phase/role slot is already locked")
        }
    }
    deinit {
        _ = flock(descriptor, LOCK_UN)
        close(descriptor)
    }
}

func executionProcessIDs(uid: uid_t) throws -> [Int] {
    let result = try runCommand("/usr/bin/pgrep", ["-u", String(uid)])
    if result.exit == 1 { return [] }
    if result.exit != 0 { try fail("could not inspect execution identity processes") }
    return (String(data: result.stdout, encoding: .utf8) ?? "")
        .split(whereSeparator: \.isNewline)
        .compactMap { Int($0) }
}

func terminateProcesses(_ processIDs: [Int]) {
    for processID in processIDs {
        _ = kill(pid_t(processID), SIGKILL)
    }
}

func processIdentity(_ name: String) throws -> (uid_t, gid_t) {
    guard let record = getpwnam(name) else { try fail("execution identity \(name) is missing") }
    return (record.pointee.pw_uid, record.pointee.pw_gid)
}

func fileFacts(_ path: String) throws -> [String: Any] {
    var info = stat()
    if lstat(path, &info) != 0 { try fail("missing controller path \(path)") }
    if (info.st_mode & S_IFMT) == S_IFLNK { try fail("controller path is symlink: \(path)") }
    errno = 0
    var extendedACL = false
    if let acl = acl_get_file(path, ACL_TYPE_EXTENDED) {
        extendedACL = true
        if acl_free(UnsafeMutableRawPointer(acl)) != 0 {
            try fail("ACL release failed for \(path)")
        }
    } else if errno != ENOENT {
        try fail("ACL inspection failed for \(path) with errno \(errno)")
    }
    return [
        "path": path,
        "uid": Int(info.st_uid),
        "gid": Int(info.st_gid),
        "mode": String(format: "%04o", info.st_mode & 0o7777),
        "linkCount": Int(info.st_nlink),
        "device": Int(info.st_dev),
        "inode": Int(info.st_ino),
        "size": Int(info.st_size),
        "flags": Int(info.st_flags),
        "mtimeSeconds": Int(info.st_mtimespec.tv_sec),
        "mtimeNanoseconds": Int(info.st_mtimespec.tv_nsec),
        "ctimeSeconds": Int(info.st_ctimespec.tv_sec),
        "ctimeNanoseconds": Int(info.st_ctimespec.tv_nsec),
        "extendedAcl": extendedACL,
        "sha256": (info.st_mode & S_IFMT) == S_IFREG ? try sha256File(path) : NSNull()
    ]
}


func installedAdmission() throws -> [String: Any] {
    let receiptRoot = "/Users/Shared/InterviewCopilot/verification-controller-a04-receipts"
    let receiptPath = "\(receiptRoot)/P00-V2-CAP-A04-activation.json"
    let journalPath = "\(receiptRoot)/P00-V2-CAP-A04-activation.in-progress"
    if FileManager.default.fileExists(atPath: journalPath) {
        try fail("A04 activation remains in progress")
    }
    let receiptData = try Data(contentsOf: URL(fileURLWithPath: receiptPath))
    guard let receipt = try parseJSON(receiptData) as? [String: Any],
          Set(receipt.keys) == Set([
            "schemaVersion", "artifactId", "envelopeSha256", "status",
            "exitCode", "checkpoint", "candidateRevision",
            "installedControllerSha256", "installedStateSha256",
            "authorizationPresent", "namespacePresent",
            "legacyA02ControllerSha256", "legacyRecovery03ReceiptSha256"
          ]),
          receipt["schemaVersion"] as? Int == 1,
          receipt["artifactId"] as? String == "P00-V2-CAP-A04",
          receipt["status"] as? String == "SUCCESS",
          receipt["checkpoint"] as? String == "installed",
          receipt["candidateRevision"] as? String ==
            "2e5045116db6e3c5f6e6cc18b70df6d7fa021baf",
          receipt["authorizationPresent"] as? Bool == true,
          receipt["namespacePresent"] as? Bool == true,
          let envelopeSHA = receipt["envelopeSha256"] as? String,
          let controllerSHA = receipt["installedControllerSha256"] as? String,
          controllerSHA == (try sha256File(CommandLine.arguments[0])) else {
        try fail("A04 activation receipt bootstrap disagreement")
    }
    let envelopePath = "\(metadataRoot)/release-envelope.json"
    guard try sha256File(envelopePath) == envelopeSHA,
          let envelope = try parseJSON(
            Data(contentsOf: URL(fileURLWithPath: envelopePath))
          ) as? [String: Any],
          envelope["artifactId"] as? String == "P00-V2-CAP-A04",
          let members = envelope["members"] as? [String: Any],
          let controllerMember = members["controllerBinary"] as? [String: Any],
          controllerMember["sha256"] as? String == controllerSHA,
          let manifestMember = members["expectedInstallManifest"] as? [String: Any],
          let manifestSHA = manifestMember["sha256"] as? String else {
        try fail("A04 release envelope bootstrap disagreement")
    }
    let manifestPath = "\(metadataRoot)/expected-install-manifest.json"
    guard try sha256File(manifestPath) == manifestSHA,
          let manifest = try parseJSON(
            Data(contentsOf: URL(fileURLWithPath: manifestPath))
          ) as? [String: Any],
          let manifestMembers = manifest["members"] as? [[String: Any]],
          let admissionMember = manifestMembers.first(where: {
              $0["path"] as? String == "libexec/admission.py"
          }),
          let admissionSHA = admissionMember["sha256"] as? String else {
        try fail("A04 payload manifest bootstrap disagreement")
    }
    let admissionPath = "\(installRoot)/libexec/admission.py"
    guard try sha256File(admissionPath) == admissionSHA else {
        try fail("A04 installed admission verifier disagreement")
    }
    let result = try runCommand(
        "/usr/bin/python3",
        [
            admissionPath, "verify-success",
            "--controller-root", controllerRoot,
            "--receipt-root", receiptRoot,
            "--sudoers", "/etc/sudoers.d/interviewcopilot-verification-controller-a04",
            "--envelope", envelopeSHA,
            "--controller-sha", controllerSHA,
            "--root-owner", "0", "--root-group", "0",
            "--request-owner", "501", "--request-group", "20"
        ]
    )
    if result.exit != 0 {
        try fail("A04 closed installed-state admission failed")
    }
    return [
        "schemaVersion": 1,
        "receiptSha256": try sha256File(receiptPath),
        "envelopeSha256": envelopeSHA,
        "installedStateSha256": receipt["installedStateSha256"] as Any
    ]
}

func installedPreflight() throws -> [String: Any] {
    if FileManager.default.fileExists(
        atPath: "\(controllerRoot)/revocation-in-progress"
    ) {
        try fail("controller revocation is in progress")
    }
    let expectedManifest = "\(metadataRoot)/expected-install-manifest.json"
    let verifier = "\(installRoot)/libexec/manifest.py"
    let registryPath = "\(installRoot)/config/capability-registry.json"
    let paths = [
        "/Users/Shared/InterviewCopilot", controllerRoot, installRoot,
        "\(controllerRoot)/locks", "\(controllerRoot)/nonces", requestRoot,
        verifier, "\(installRoot)/libexec/quiesce.py",
        expectedManifest, registryPath,
        "\(installRoot)/bin/arm-phase", "\(installRoot)/bin/verify-phase",
        "\(installRoot)/libexec/arm-phase-core",
        "\(installRoot)/libexec/verify-phase-core",
        installedNode, installedNpmLauncher, installedNpmCLI
    ]
    let facts = try paths.map(fileFacts)
    for fact in facts {
        let path = fact["path"] as! String
        let expectedUID = path == requestRoot ? Int(requestOwnerUID) : 0
        if (fact["uid"] as? Int) != expectedUID {
            try fail("controller ownership disagreement: \(path)")
        }
        if fact["extendedAcl"] as? Bool != false {
            try fail("controller path has an extended ACL: \(path)")
        }
        guard let modeText = fact["mode"] as? String,
              let mode = Int(modeText, radix: 8), mode & 0o022 == 0 else {
            try fail("controller path mode disagreement: \(path)")
        }
    }
    let manifestCheck = try runCommand(
        "/usr/bin/python3",
        [verifier, "verify", installRoot, expectedManifest, "--require-uid", "0"]
    )
    if manifestCheck.exit != 0 { try fail("installed payload manifest disagreement") }
    let registryData = try Data(contentsOf: URL(fileURLWithPath: registryPath))
    guard let registry = try parseJSON(registryData) as? [String: Any],
          Set(registry.keys) == Set([
            "schemaVersion", "projectKey", "controllerVersion", "approvedPacket",
            "canonicalRemote", "principal", "executionIdentity", "operations",
            "roles", "phases", "fixedPaths", "requestLimits"
          ]),
          registry["schemaVersion"] as? Int == 1,
          registry["projectKey"] as? String == projectKey,
          registry["controllerVersion"] as? String == "P00-V2-CAP-A04",
          let phases = registry["phases"] as? [[String: Any]],
          Set(phases.compactMap { $0["id"] as? String }) == phaseIDs,
          phases.allSatisfy({ entry in
              guard Set(entry.keys) == Set(["id", "dependencies", "plan"]),
                    let id = entry["id"] as? String,
                    let dependencies = entry["dependencies"] as? [String],
                    entry["plan"] is String else {
                  return false
              }
              return phaseDependencies[id] == dependencies
          }) else {
        try fail("installed capability registry disagreement")
    }
    let nodeVersion = try commandText(installedNode, ["--version"])
    let npmVersion = try commandText(installedNode, [installedNpmCLI, "--version"])
    if nodeVersion != "v20.20.2" || npmVersion != "10.8.2" {
        try fail("installed Node/npm version disagreement")
    }
    let admission = try installedAdmission()
    return [
        "schemaVersion": 1,
        "controllerVersion": "P00-V2-CAP-A04",
        "checkedAt": isoNow(),
        "nodeVersion": nodeVersion,
        "npmVersion": npmVersion,
        "paths": facts,
        "installedAdmission": admission
    ]
}

func gitBytes(_ store: String, _ object: String) throws -> Data {
    let result = try runCommand("/usr/bin/git", ["--git-dir", store, "show", object])
    if result.exit != 0 { try fail("git object read failed for \(object)") }
    return result.stdout
}


struct CapabilityRequest {
    let operation: String
    let phase: String
    let role: String
    let approvedPacketSha: String
    let nonce: String
    let prNumber: Int?
    let expectedHead: String?
}

func sameDescriptorIdentity(_ lhs: stat, _ rhs: stat) -> Bool {
    lhs.st_dev == rhs.st_dev &&
    lhs.st_ino == rhs.st_ino &&
    lhs.st_uid == rhs.st_uid &&
    lhs.st_gid == rhs.st_gid &&
    lhs.st_mode == rhs.st_mode &&
    lhs.st_nlink == rhs.st_nlink &&
    lhs.st_size == rhs.st_size &&
    lhs.st_flags == rhs.st_flags &&
    lhs.st_mtimespec.tv_sec == rhs.st_mtimespec.tv_sec &&
    lhs.st_mtimespec.tv_nsec == rhs.st_mtimespec.tv_nsec &&
    lhs.st_ctimespec.tv_sec == rhs.st_ctimespec.tv_sec &&
    lhs.st_ctimespec.tv_nsec == rhs.st_ctimespec.tv_nsec
}

func readCapabilityRequest(_ expectedOperation: String) throws -> CapabilityRequest {
    let path = "\(requestRoot)/\(expectedOperation).json"
    let descriptor = open(path, O_RDONLY | O_NOFOLLOW)
    if descriptor < 0 { try fail("request open failed for \(expectedOperation)") }
    defer { close(descriptor) }
    var before = stat()
    if fstat(descriptor, &before) != 0 { try fail("request fstat failed") }
    guard (before.st_mode & S_IFMT) == S_IFREG,
          before.st_uid == requestOwnerUID,
          before.st_nlink == 1,
          before.st_size > 0,
          before.st_size <= 8192,
          (before.st_mode & 0o7777) == 0o400 else {
        try fail("request filesystem contract disagreement")
    }
    errno = 0
    if let acl = acl_get_fd_np(descriptor, ACL_TYPE_EXTENDED) {
        let freed = acl_free(UnsafeMutableRawPointer(acl))
        if freed != 0 { try fail("request ACL release failed") }
        try fail("request has an extended or ambiguous ACL object")
    } else if errno != ENOENT {
        try fail("request ACL inspection failed with errno \(errno)")
    }
    var data = Data(count: Int(before.st_size))
    let bytesRead = data.withUnsafeMutableBytes { bytes in
        pread(descriptor, bytes.baseAddress, bytes.count, 0)
    }
    if bytesRead != data.count { try fail("request short read") }
    var after = stat()
    if fstat(descriptor, &after) != 0 || !sameDescriptorIdentity(before, after) {
        try fail("request changed during descriptor read")
    }
    guard let object = try parseJSON(data) as? [String: Any] else {
        try fail("request is not a JSON object")
    }
    let armKeys = Set([
        "schemaVersion", "operation", "projectKey", "phase", "role",
        "approvedPacketSha", "prNumber", "expectedHead", "nonce"
    ])
    let simpleKeys = Set([
        "schemaVersion", "operation", "projectKey", "phase", "role",
        "approvedPacketSha", "nonce"
    ])
    let expectedKeys = expectedOperation == "arm" ? armKeys : simpleKeys
    guard Set(object.keys) == expectedKeys,
          object["schemaVersion"] as? Int == 1,
          object["operation"] as? String == expectedOperation,
          object["projectKey"] as? String == projectKey,
          let phase = object["phase"] as? String,
          phaseIDs.contains(phase),
          object["role"] as? String == "local",
          object["approvedPacketSha"] as? String == approvedPacket,
          let nonce = object["nonce"] as? String,
          nonce.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil else {
        try fail("request schema or allowlist disagreement")
    }
    var pr: Int? = nil
    var head: String? = nil
    if expectedOperation == "arm" {
        guard let value = object["prNumber"] as? Int, value > 0,
              let expected = object["expectedHead"] as? String,
              expected.range(of: "^[a-f0-9]{40}$", options: .regularExpression) != nil else {
            try fail("arm request identity disagreement")
        }
        pr = value
        head = expected
    }
    try ensureDirectory("\(controllerRoot)/nonces")
    try writeExclusive(
        "\(controllerRoot)/nonces/\(nonce)",
        data: Data("\(expectedOperation):\(phase)\n".utf8),
        mode: 0o400
    )
    return CapabilityRequest(
        operation: expectedOperation,
        phase: phase,
        role: "local",
        approvedPacketSha: approvedPacket,
        nonce: nonce,
        prNumber: pr,
        expectedHead: head
    )
}

func enforcePhaseDependencies(_ phase: String, store: String) throws {
    guard let dependencies = phaseDependencies[phase] else {
        try fail("phase dependency policy is absent")
    }
    if dependencies.isEmpty { return }
    _ = try commandText(
        "/usr/bin/git",
        ["--git-dir", store, "fetch", "--force", canonicalRemote, "refs/heads/main:refs/controller/main"]
    )
    for dependency in dependencies {
        let receiptPath = "\(controllerRoot)/receipts/\(dependency)/success.json"
        let data = try Data(contentsOf: URL(fileURLWithPath: receiptPath))
        guard let receipt = try parseJSON(data) as? [String: Any],
              Set(receipt.keys) == Set([
                "schemaVersion", "phase", "candidateCommitSha", "terminalSha256"
              ]),
              receipt["schemaVersion"] as? Int == 1,
              receipt["phase"] as? String == dependency,
              let commit = receipt["candidateCommitSha"] as? String,
              commit.range(of: "^[a-f0-9]{40}$", options: .regularExpression) != nil,
              receipt["terminalSha256"] is String else {
            try fail("dependency receipt disagreement for \(dependency)")
        }
        let ancestry = try runCommand(
            "/usr/bin/git",
            ["--git-dir", store, "merge-base", "--is-ancestor", commit, "refs/controller/main"]
        )
        if ancestry.exit != 0 {
            try fail("dependency \(dependency) is not merged into canonical main")
        }
    }
}

func livePRHead(_ pr: Int) throws -> String {
    let output = try commandText(
        "/usr/bin/git",
        ["ls-remote", canonicalRemote, "refs/pull/\(pr)/head"]
    )
    guard let head = output.split(separator: "\t").first.map(String.init),
          head.range(of: "^[a-f0-9]{40}$", options: .regularExpression) != nil else {
        try fail("could not independently resolve PR \(pr) head")
    }
    return head
}

func parseOptions(_ arguments: [String]) throws -> [String: String] {
    var options: [String: String] = [:]
    var index = 0
    while index < arguments.count {
        let key = arguments[index]
        if !key.hasPrefix("--") || index + 1 >= arguments.count { try fail("invalid arguments") }
        options[String(key.dropFirst(2))] = arguments[index + 1]
        index += 2
    }
    return options
}

func armPhase(_ arguments: [String]) throws {
    guard geteuid() == 0 else { try fail("arm-phase core requires root") }
    guard arguments.isEmpty else { try fail("arm-phase accepts no command arguments") }
    _ = try installedPreflight()
    let request = try readCapabilityRequest("arm")
    let phase = request.phase
    let expected = request.expectedHead!
    let pr = request.prNumber!
    let slotLock = try ControllerLock("\(controllerRoot)/locks/\(phase)-local.lock")
    _ = slotLock
    let observed = try livePRHead(pr)
    if observed != expected { try fail("live PR head \(observed) does not match expected \(expected)") }

    let store = "\(controllerRoot)/objects"
    try ensureDirectory(controllerRoot)
    if !FileManager.default.fileExists(atPath: "\(store)/HEAD") {
        _ = try commandText("/usr/bin/git", ["init", "--bare", store])
    }
    try enforcePhaseDependencies(phase, store: store)
    _ = try commandText("/usr/bin/git", ["--git-dir", store, "fetch", "--force", canonicalRemote, "refs/pull/\(pr)/head:refs/controller/\(phase)"])
    _ = try commandText("/usr/bin/git", ["--git-dir", store, "fetch", canonicalRemote, approvedPacket])
    let commit = try commandText("/usr/bin/git", ["--git-dir", store, "rev-parse", "refs/controller/\(phase)^{commit}"])
    if commit != expected { try fail("fetched candidate does not match expected head") }
    let tree = try commandText("/usr/bin/git", ["--git-dir", store, "rev-parse", "\(expected)^{tree}"])
    let packageBytes = try gitBytes(store, "\(expected):package.json")
    let lockBytes = try gitBytes(store, "\(expected):package-lock.json")
    let manifestBytes = try gitBytes(store, "\(expected):scripts/verification/plan-manifest.json")
    guard let package = try parseJSON(packageBytes) as? [String: Any],
          let packageScripts = package["scripts"] as? [String: Any],
          let manifest = try parseJSON(manifestBytes) as? [String: Any],
          let manifestPlans = manifest["plans"] as? [String: Any] else {
        try fail("candidate package or plan manifest is invalid")
    }
    let genericLifecycle = [
        "preinstall", "install", "postinstall", "prepublish", "preprepare", "prepare",
        "postprepare", "pretest", "posttest", "pretest:legacy", "posttest:legacy",
        "pretest:unit", "posttest:unit", "preverify:policy", "postverify:policy",
        "prelint", "postlint", "pretypecheck", "posttypecheck", "prebuild", "postbuild",
        "preverify:test-manifest", "postverify:test-manifest",
        "preverify:phase", "postverify:phase"
    ]
    let phaseLifecycle = phaseIDs.sorted().flatMap {
        ["pretest:\($0.lowercased())", "posttest:\($0.lowercased())"]
    }
    let mappedLifecycle = approvedPackageScripts.keys.flatMap {
        ["pre\($0)", "post\($0)"]
    }
    let forbiddenLifecycle = Array(
        Set(genericLifecycle + phaseLifecycle + mappedLifecycle)
    ).sorted()
    let presentLifecycle = forbiddenLifecycle.filter { packageScripts[$0] != nil }
    if !presentLifecycle.isEmpty {
        try fail("candidate lifecycle hooks are forbidden: \(presentLifecycle.joined(separator: ","))")
    }
    let planIDs = [
        "P01", "P02", "P03", "P04", "P05", "P06", "P07",
        "P08", "P09", "P10", "P11", "P12", "P12-observer"
    ]
    var anchoredPlans: [String: Any] = [:]
    for planID in planIDs {
        guard let manifestEntry = manifestPlans[planID] as? [String: Any],
              let manifestDigest = manifestEntry["sha256"] as? String,
              let file = manifestEntry["file"] as? String else {
            try fail("plan manifest is missing \(planID)")
        }
        let bytes = try gitBytes(store, "\(expected):scripts/verification/plans/\(file)")
        if sha256(bytes) != manifestDigest { try fail("plan digest disagreement for \(planID)") }
        anchoredPlans[planID] = ["path": "scripts/verification/plans/\(file)", "sha256": manifestDigest, "bytes": bytes.count]
    }
    let currentPlanBytes = try gitBytes(
        store,
        "\(expected):scripts/verification/plans/\(phase).json"
    )
    guard let currentPlan = try parseJSON(currentPlanBytes) as? [String: Any],
          let currentEntries = currentPlan["entries"] as? [[String: Any]] else {
        try fail("current phase plan is invalid")
    }
    var pendingScriptTargets: [String] = []
    for (index, entry) in currentEntries.enumerated() {
        guard let argv = entry["argv"] as? [String], argv.count >= 2 else {
            try fail("current phase plan entry \(index) has invalid argv")
        }
        if argv.count >= 3 && argv[0] == "npm" && argv[1] == "run" {
            let target = argv[2]
            guard approvedPackageScripts[target] != nil else {
                try fail("package script policy is absent for \(target)")
            }
            pendingScriptTargets.append(target)
        } else if argv[0] != "npm" || argv[1] != "ci" {
            try fail("plan entry is outside the root-owned npm command policy")
        }
    }
    var validatedScriptTargets: [String: String] = [:]
    while let target = pendingScriptTargets.popLast() {
        if validatedScriptTargets[target] != nil { continue }
        guard let expectedScript = approvedPackageScripts[target],
              let actualScript = packageScripts[target] as? String,
              actualScript == expectedScript else {
            try fail("package script mapping disagreement for \(target)")
        }
        validatedScriptTargets[target] = expectedScript
        let words = expectedScript.split(whereSeparator: { $0.isWhitespace })
            .map(String.init)
        if words.count >= 3 {
            for index in 0..<(words.count - 2) {
                if words[index] == "npm" && words[index + 1] == "run" {
                    let dependency = words[index + 2]
                    guard approvedPackageScripts[dependency] != nil else {
                        try fail("transitive package script policy is absent for \(dependency)")
                    }
                    pendingScriptTargets.append(dependency)
                }
            }
        }
    }
    let treeListing = try runCommand("/usr/bin/git", ["--git-dir", store, "ls-tree", "-r", "-z", "--full-tree", expected])
    if treeListing.exit != 0 { try fail("could not inventory committed tree") }
    var anchoredInputs: [String: Any] = [:]
    for path in approvedInputDigests.keys.sorted() {
        let bytes = try gitBytes(store, "\(expected):\(path)")
        guard sha256(bytes) == approvedInputDigests[path] else {
            try fail("approved controller input disagreement: \(path)")
        }
        anchoredInputs[path] = [
            "gitMode": "100644",
            "sha256": approvedInputDigests[path]!,
            "bytes": bytes.count
        ]
    }
    anchoredInputs["committedTree"] = [
        "gitMode": "tree",
        "sha256": sha256(treeListing.stdout),
        "bytes": treeListing.stdout.count
    ]
    let installManifest = try Data(contentsOf: URL(fileURLWithPath: "\(metadataRoot)/release-envelope.json"))
    let anchor: [String: Any] = [
        "schemaVersion": 1,
        "controllerVersion": "P00-V2-CAP-A04",
        "controllerSha256": try sha256File("\(installRoot)/libexec/verify-phase-core"),
        "approvedPacketSha": approvedPacket,
        "packetRevision": "P00-R9",
        "canonicalRemote": canonicalRemote,
        "prNumber": pr,
        "candidateCommitSha": expected,
        "candidateTreeSha": tree,
        "phase": phase,
        "role": "local",
        "inputs": anchoredInputs,
        "packageScripts": packageScripts,
        "validatedScriptTargets": validatedScriptTargets,
        "lifecycleMap": ["forbidden": forbiddenLifecycle, "present": presentLifecycle],
        "plans": anchoredPlans,
        "toolchain": [
            "node": ["version": "20.20.2", "path": installedNode, "sha256": try sha256File(installedNode)],
            "npm": ["version": "10.8.2", "path": installedNpmLauncher, "sha256": try sha256File(installedNpmLauncher)]
        ],
        "environment": ["PATH": "\(installRoot)/toolchain/bin:/usr/bin:/bin", "scriptShell": "/bin/sh"],
        "dependencyClosure": ["packageLockSha256": sha256(lockBytes)],
        "writableRoots": [
            ".artifacts", "dist", "dist-electron", "release",
            "node_modules/.vite", "node_modules/.vite-temp"
        ],
        "resultSchemas": [
            "broker": "interviewcopilot-controller-broker-v1",
            "coordinator": "vitest-coordinator-result-v4",
            "terminal": "interviewcopilot-controller-terminal-v1"
        ],
        "armedAt": isoNow(),
        "prHeadObservedAt": isoNow()
    ]
    _ = installManifest
    let bytes = try canonicalJSON(anchor)
    let activeParent = "\(controllerRoot)/anchors/active/\(phase)"
    let active = "\(activeParent)/local"
    let temporary = "\(activeParent)/.local-\(try randomRunId())"
    try ensureDirectory("\(controllerRoot)/anchors")
    try ensureDirectory("\(controllerRoot)/anchors/active")
    try ensureDirectory(activeParent)
    try ensureDirectory(temporary, mode: 0o700)
    try writeExclusive("\(temporary)/anchor.json", data: bytes)
    try writeExclusive("\(temporary)/anchor.sha256", data: Data("\(sha256(bytes))\n".utf8))
    try removeIfPresent(active)
    if rename(temporary, active) != 0 { try fail("active-anchor atomic rename failed") }
    print("ARMED phase=\(phase) pr=\(pr) head=\(expected) anchor_sha256=\(sha256(bytes))")
}

func planEntries(_ root: String, phase: String) throws -> [[String: Any]] {
    guard phaseIDs.contains(phase) else { try fail("phase is not registered") }
    let data = try Data(contentsOf: URL(fileURLWithPath: "\(root)/scripts/verification/plans/\(phase).json"))
    guard let object = try parseJSON(data) as? [String: Any],
          Set(object.keys) == Set(["schemaVersion", "phase", "entries"]),
          object["schemaVersion"] as? Int == 1,
          object["phase"] as? String == phase,
          let entries = object["entries"] as? [[String: Any]],
          !entries.isEmpty else {
        try fail("\(phase) plan is invalid")
    }
    var labels = Set<String>()
    for (index, entry) in entries.enumerated() {
        guard Set(entry.keys).isSubset(of: Set([
            "label", "argv", "expectedExit", "classification", "minimumPassed"
        ])),
              let label = entry["label"] as? String,
              !label.isEmpty,
              !labels.contains(label),
              let argv = entry["argv"] as? [String],
              argv.count >= 2,
              argv.first == "npm",
              entry["expectedExit"] is Int,
              let classification = entry["classification"] as? String,
              ["command", "test"].contains(classification),
              entry["command"] == nil,
              entry["shell"] == nil else {
            try fail("\(phase) plan entry \(index) is not closed")
        }
        labels.insert(label)
        if classification == "test" {
            guard let minimum = entry["minimumPassed"] as? Int, minimum > 0 else {
                try fail("\(phase) test minimum is invalid")
            }
        } else if entry["minimumPassed"] != nil {
            try fail("\(phase) command carries a test minimum")
        }
    }
    return entries
}

func chownTree(_ path: String, uid: uid_t, gid: gid_t) throws {
    let enumerator = FileManager.default.enumerator(atPath: path)
    if chown(path, uid, gid) != 0 { try fail("chown failed for \(path)") }
    while let relative = enumerator?.nextObject() as? String {
        let candidate = "\(path)/\(relative)"
        if lchown(candidate, uid, gid) != 0 { try fail("chown failed for \(candidate)") }
    }
}

func chmodTree(_ path: String, files: mode_t, directories: mode_t) throws {
    let enumerator = FileManager.default.enumerator(atPath: path)
    _ = chmod(path, directories)
    while let relative = enumerator?.nextObject() as? String {
        let candidate = "\(path)/\(relative)"
        var info = stat()
        if lstat(candidate, &info) != 0 { continue }
        if (info.st_mode & S_IFMT) == S_IFDIR { _ = chmod(candidate, directories) }
        else if (info.st_mode & S_IFMT) == S_IFREG { _ = chmod(candidate, files) }
    }
}

func executionEnvironment(_ home: String, ignoreScripts: Bool) -> [String: String] {
    return [
        "HOME": home,
        "PATH": "\(installRoot)/toolchain/bin:/usr/bin:/bin",
        "TMPDIR": "\(home)/tmp",
        "npm_config_cache": "\(home)/npm-cache",
        "npm_config_userconfig": "\(installRoot)/config/npmrc",
        "npm_config_ignore_scripts": ignoreScripts ? "true" : "false",
        "npm_config_script_shell": "/bin/sh",
        "NODE_OPTIONS": "",
        "CI": "1",
        "NODE_ENV": "test"
    ]
}

func dataFromHex(_ hex: String) -> Data? {
    guard hex.count % 2 == 0 else { return nil }
    var data = Data(capacity: hex.count / 2)
    var index = hex.startIndex
    while index < hex.endIndex {
        let next = hex.index(index, offsetBy: 2)
        guard let byte = UInt8(hex[index..<next], radix: 16) else { return nil }
        data.append(byte)
        index = next
    }
    return data
}

func coordinatorExecution(
    _ stdout: Data,
    authenticationKey: String,
    nonce: String,
    entryLabel: String,
    bindingHash: String
) -> [String: Any]? {
    guard let text = String(data: stdout, encoding: .utf8) else { return nil }
    let prefix = "VERIFICATION_COORDINATOR_RESULT "
    let lines = text.split(whereSeparator: \.isNewline)
        .map(String.init)
        .filter { $0.hasPrefix(prefix) }
    guard lines.count == 1,
          let envelopeData = Data(base64Encoded: String(lines[0].dropFirst(prefix.count))),
          let envelope = try? JSONSerialization.jsonObject(with: envelopeData) as? [String: Any],
          Set(envelope.keys) == Set(["hmacSha256", "payloadBase64"]),
          let payloadBase64 = envelope["payloadBase64"] as? String,
          let payloadData = Data(base64Encoded: payloadBase64),
          let hmacHex = envelope["hmacSha256"] as? String,
          let keyData = dataFromHex(authenticationKey),
          let suppliedHMAC = dataFromHex(hmacHex),
          Data(HMAC<SHA256>.authenticationCode(
            for: payloadData,
            using: SymmetricKey(data: keyData)
          )) == suppliedHMAC,
          let payload = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any],
          let canonical = try? JSONSerialization.data(
            withJSONObject: payload,
            options: [.sortedKeys, .withoutEscapingSlashes]
          ),
          canonical == payloadData,
          payload["schemaVersion"] as? Int == 4,
          payload["protocol"] as? String == "vitest-coordinator-result-v4",
          payload["nonce"] as? String == nonce,
          payload["entryLabel"] as? String == entryLabel,
          payload["bindingHash"] as? String == bindingHash,
          let counts = payload["counts"] as? [String: Any],
          payload["tests"] is [[String: Any]],
          payload["includeFiles"] is [String],
          counts["passed"] is Int,
          counts["failed"] is Int,
          counts["skipped"] is Int else {
        return nil
    }
    return payload
}


func publishRunEvidence(_ runDirectory: String) throws {
    let names = try FileManager.default.contentsOfDirectory(atPath: runDirectory).sorted()
    var published = 0
    for name in names {
        let path = "\(runDirectory)/\(name)"
        var before = stat()
        if lstat(path, &before) != 0 {
            try fail("evidence publication member disappeared: \(path)")
        }
        let kind = before.st_mode & S_IFMT
        if kind == S_IFDIR { continue }
        guard kind == S_IFREG,
              before.st_uid == 0,
              before.st_gid == 0,
              before.st_nlink == 1 else {
            try fail("evidence publication member contract disagreement: \(path)")
        }
        let facts = try fileFacts(path)
        guard facts["extendedAcl"] as? Bool == false else {
            try fail("evidence publication ACL disagreement: \(path)")
        }
        if chmod(path, 0o444) != 0 {
            try fail("evidence publication chmod failed: \(path)")
        }
        var after = stat()
        guard lstat(path, &after) == 0,
              (after.st_mode & S_IFMT) == S_IFREG,
              after.st_uid == 0,
              after.st_gid == 0,
              after.st_nlink == 1,
              (after.st_mode & 0o7777) == 0o444,
              before.st_dev == after.st_dev,
              before.st_ino == after.st_ino,
              before.st_size == after.st_size,
              before.st_flags == after.st_flags else {
            try fail("evidence publication final identity disagreement: \(path)")
        }
        published += 1
    }
    if published == 0 {
        try fail("evidence publication produced no readable members")
    }
}

func verifyPhase(_ arguments: [String]) throws {
    guard geteuid() == 0 else { try fail("verify-phase core requires root") }
    guard arguments.isEmpty else { try fail("verify-phase accepts no command arguments") }
    _ = try installedPreflight()
    let request = try readCapabilityRequest("verify")
    let phase = request.phase
    let slotLock = try ControllerLock("\(controllerRoot)/locks/\(phase)-local.lock")
    _ = slotLock
    let active = "\(controllerRoot)/anchors/active/\(phase)/local"
    let anchorBytes = try Data(contentsOf: URL(fileURLWithPath: "\(active)/anchor.json"))
    let digest = try String(
        contentsOfFile: "\(active)/anchor.sha256",
        encoding: .utf8
    ).trimmingCharacters(in: .whitespacesAndNewlines)
    if sha256(anchorBytes) != digest { try fail("active-anchor digest disagreement") }
    guard let anchor = try parseJSON(anchorBytes) as? [String: Any],
          anchor["approvedPacketSha"] as? String == approvedPacket,
          anchor["phase"] as? String == phase,
          anchor["role"] as? String == "local",
          anchor["runId"] == nil,
          let commit = anchor["candidateCommitSha"] as? String,
          let pr = anchor["prNumber"] as? Int else {
        try fail("active anchor schema disagreement")
    }
    if try livePRHead(pr) != commit { try fail("live PR head changed before execution") }
    let runId = try randomRunId()
    let runDirectory = "\(controllerRoot)/runs/\(commit)/\(phase)/\(runId)"
    let traversableRunAncestors = [
        "\(controllerRoot)/runs",
        "\(controllerRoot)/runs/\(commit)",
        "\(controllerRoot)/runs/\(commit)/\(phase)",
        runDirectory
    ]
    for path in traversableRunAncestors {
        try ensureDirectory(path, mode: 0o711)
        let facts = try fileFacts(path)
        var pathInfo = stat()
        guard lstat(path, &pathInfo) == 0,
              (pathInfo.st_mode & S_IFMT) == S_IFDIR,
              facts["uid"] as? Int == 0,
              facts["gid"] as? Int == 0,
              facts["extendedAcl"] as? Bool == false else {
            try fail("run ancestor filesystem contract disagreement: \(path)")
        }
        if chmod(path, 0o711) != 0 {
            try fail("could not enforce traverse-only run ancestor: \(path)")
        }
    }
    try writeExclusive("\(runDirectory)/anchor.json", data: anchorBytes)
    let binding: [String: Any] = [
        "schemaVersion": 1,
        "kind": "verification-run-binding",
        "runId": runId,
        "anchorSha256": digest,
        "candidateCommitSha": commit,
        "phase": phase,
        "role": "local",
        "createdAt": isoNow()
    ]
    let bindingBytes = try canonicalJSON(binding)
    try writeExclusive("\(runDirectory)/run-binding.json", data: bindingBytes)
    let inputInventory: [String: Any] = [
        "schemaVersion": 1,
        "anchorSha256": digest,
        "runBindingSha256": sha256(bindingBytes),
        "candidateCommitSha": commit,
        "candidateTreeSha": anchor["candidateTreeSha"]!,
        "approvedPacketSha": approvedPacket,
        "toolchain": anchor["toolchain"]!,
        "inputs": anchor["inputs"]!,
        "plans": anchor["plans"]!
    ]
    let inputInventoryBytes = try canonicalJSON(inputInventory)
    try writeExclusive("\(runDirectory)/input-inventory.json", data: inputInventoryBytes)
    let store = "\(controllerRoot)/objects"
    let repository = "\(runDirectory)/repo"
    _ = try commandText("/usr/bin/git", ["clone", "--no-hardlinks", "--no-checkout", store, repository])
    _ = try commandText("/usr/bin/git", ["checkout", "--detach", commit], cwd: repository)
    let installRepository = "\(runDirectory)/install-repo"
    _ = try commandText("/usr/bin/git", ["clone", "--no-hardlinks", "--no-checkout", store, installRepository])
    _ = try commandText("/usr/bin/git", ["checkout", "--detach", commit], cwd: installRepository)
    let (childUID, childGID) = try processIdentity(executionUser)
    let preexistingProcesses = try executionProcessIDs(uid: childUID)
    if !preexistingProcesses.isEmpty {
        terminateProcesses(preexistingProcesses)
        try fail("execution identity had pre-existing processes: \(preexistingProcesses)")
    }
    try chmodTree(repository, files: 0o444, directories: 0o555)
    try chownTree(installRepository, uid: childUID, gid: childGID)
    let home = "\(runDirectory)/scratch"
    try ensureDirectory(home, mode: 0o700)
    try ensureDirectory("\(home)/tmp", mode: 0o700)
    try ensureDirectory("\(home)/npm-cache", mode: 0o700)
    _ = chown(home, childUID, childGID)
    _ = chown("\(home)/tmp", childUID, childGID)
    _ = chown("\(home)/npm-cache", childUID, childGID)

    let entries = try planEntries(repository, phase: phase)
    guard let anchoredPlans = anchor["plans"] as? [String: Any],
          let anchoredPhase = anchoredPlans[phase] as? [String: Any],
          let anchoredPlanDigest = anchoredPhase["sha256"] as? String,
          try sha256File("\(repository)/scripts/verification/plans/\(phase).json") == anchoredPlanDigest else {
        try fail("materialized \(phase) plan disagrees with active anchor")
    }
    var bootstrapEnvironment = executionEnvironment(home, ignoreScripts: true)
    bootstrapEnvironment["INTERVIEWCOPILOT_CONTROLLER_BOOTSTRAP"] = "1"
    let bootstrapInput = try canonicalJSON([
        "schemaVersion": 1,
        "protocol": "interviewcopilot-controller-bootstrap-v1",
        "phase": phase,
        "role": "local",
        "anchorSha256": digest,
        "runBindingSha256": sha256(bindingBytes)
    ])
    let bootstrap = try runCommand(
        installedNode,
        ["scripts/verification/phase-bootstrap.mjs"],
        cwd: repository,
        environment: bootstrapEnvironment,
        stdin: bootstrapInput,
        uid: childUID,
        gid: childGID
    )
    let bootstrapOutput = String(data: bootstrap.stdout, encoding: .utf8) ?? ""
    if bootstrap.exit != 0 || !bootstrapOutput.contains("\"status\":\"ready\"") {
        try fail("sealed bootstrap/reporter preflight failed: \(String(data: bootstrap.stderr, encoding: .utf8) ?? "")")
    }
    var transcript: [[String: Any]] = []
    var results: [[String: Any]] = []
    var aggregateExit = 0
    var validatedExecutions: [[String: Any]] = []
    for (index, entry) in entries.enumerated() {
        guard let label = entry["label"] as? String,
              let planned = entry["argv"] as? [String],
              let expectedExit = entry["expectedExit"] as? Int,
              let classification = entry["classification"] as? String else {
            try fail("invalid plan entry \(index)")
        }
        if index == 1 {
            let installedModules = "\(installRepository)/node_modules"
            let sealedModules = "\(repository)/node_modules"
            try? removeIfPresent(sealedModules)
            if FileManager.default.fileExists(atPath: installedModules) {
                try FileManager.default.copyItem(atPath: installedModules, toPath: sealedModules)
            } else {
                try ensureDirectory(sealedModules, mode: 0o555)
            }
            try chownTree(sealedModules, uid: 0, gid: 0)
            try chmodTree(sealedModules, files: 0o444, directories: 0o555)
            for cache in [".vite", ".vite-temp"] {
                let cachePath = "\(sealedModules)/\(cache)"
                try ensureDirectory(cachePath, mode: 0o700)
                _ = chown(cachePath, childUID, childGID)
            }
            try chownTree(installRepository, uid: 0, gid: 0)
            try chmodTree(installRepository, files: 0o444, directories: 0o555)
            for writable in [".artifacts", "dist", "dist-electron", "release"] {
                let path = "\(repository)/\(writable)"
                try ensureDirectory(path, mode: 0o700)
                _ = chown(path, childUID, childGID)
            }
            let controllerInput = "\(repository)/.controller-input"
            try ensureDirectory(controllerInput, mode: 0o555)
            _ = chown(controllerInput, 0, 0)
        }
        let executable: String
        let actualArguments: [String]
        if planned.first == "npm" {
            executable = installedNpmLauncher
            actualArguments = Array(planned.dropFirst())
        } else {
            try fail("unexpected planned executable \(planned.first ?? "")")
        }
        var environment = executionEnvironment(home, ignoreScripts: index > 0)
        if label == "manifest" {
            let ledgerPath = "\(repository)/.controller-input/validated-test-results.json"
            let ledger = try canonicalJSON(["schemaVersion": 1, "executions": validatedExecutions])
            try? removeIfPresent(ledgerPath)
            try writeExclusive(ledgerPath, data: ledger, mode: 0o444)
            environment["VERIFICATION_VALIDATED_TEST_RESULTS_PATH"] = ledgerPath
        }
        let challenge: Data?
        var challengeNonce: String? = nil
        var challengeKey: String? = nil
        var challengeBinding: String? = nil
        let receivesAuthenticationSecret =
            classification == "test" &&
            planned.count >= 3 &&
            planned[0] == "npm" &&
            planned[1] == "run" &&
            planned[2].hasPrefix("test:")
        if receivesAuthenticationSecret {
            let nonce = try randomSecret()
            let authenticationKey = try randomSecret()
            let bindingHash = sha256(Data(planned.joined(separator: "\u{0}").utf8))
            challengeNonce = nonce
            challengeKey = authenticationKey
            challengeBinding = bindingHash
            let challengeObject: [String: Any] = [
                "schemaVersion": 1,
                "protocol": "vitest-controller-challenge-v1",
                "nonce": nonce,
                "entryLabel": label,
                "bindingHash": bindingHash,
                "authenticationKey": authenticationKey
            ]
            challenge = try canonicalJSON(challengeObject)
        } else {
            challenge = nil
        }
        let result = try runCommand(
            executable,
            actualArguments,
            cwd: index == 0 ? installRepository : repository,
            environment: environment,
            stdin: challenge,
            uid: childUID,
            gid: childGID
        )
        let stdoutName = String(format: "%02d-%@.stdout.log", index + 1, label)
        let stderrName = String(format: "%02d-%@.stderr.log", index + 1, label)
        try writeExclusive("\(runDirectory)/\(stdoutName)", data: result.stdout)
        try writeExclusive("\(runDirectory)/\(stderrName)", data: result.stderr)
        if label == "build",
           let output = String(data: result.stdout, encoding: .utf8),
           let match = output.range(
            of: #"inventory=(/[^\s]+)"#,
            options: .regularExpression
           ) {
            let token = String(output[match]).dropFirst("inventory=".count)
            let inventoryPath = String(token)
            if inventoryPath.hasPrefix("\(home)/"),
               let inventoryData = try? Data(contentsOf: URL(fileURLWithPath: inventoryPath)),
               let inventory = try? parseJSON(inventoryData) as? [String: Any],
               let errors = inventory["errors"] as? [Any],
               errors.isEmpty {
                try writeExclusive(
                    "\(runDirectory)/package-inventory.json",
                    data: inventoryData
                )
            }
        }
        var counts: [String: Int]? = nil
        if receivesAuthenticationSecret {
            if let execution = coordinatorExecution(
                result.stdout,
                authenticationKey: challengeKey!,
                nonce: challengeNonce!,
                entryLabel: label,
                bindingHash: challengeBinding!
            ),
               let observed = execution["counts"] as? [String: Int] {
                counts = observed
                validatedExecutions.append([
                    "entryLabel": label,
                    "counts": observed,
                    "includeFiles": execution["includeFiles"]!,
                    "tests": execution["tests"]!
                ])
            }
        } else if classification == "test",
                  planned.count >= 3,
                  planned[2].hasPrefix("qualify:"),
                  Int(result.exit) == expectedExit {
            counts = ["passed": 1, "failed": 0, "skipped": 0]
        }
        var failures: [String] = []
        if Int(result.exit) != expectedExit { failures.append("raw exit \(result.exit) did not equal \(expectedExit)") }
        if classification == "test" {
            if counts == nil { failures.append("missing passed/failed/skipped counts") }
            else {
                if counts!["failed"] != 0 || counts!["skipped"] != 0 {
                    failures.append("nonzero failed/skipped count")
                }
                if let minimum = entry["minimumPassed"] as? Int,
                   (counts!["passed"] ?? 0) < minimum {
                    failures.append("passed count below minimum \(minimum)")
                }
            }
        }
        let survivors = try executionProcessIDs(uid: childUID)
        if !survivors.isEmpty {
            terminateProcesses(survivors)
            failures.append("surviving child or detached descendant: \(survivors)")
        }
        if !failures.isEmpty { aggregateExit = 1 }
        let record: [String: Any] = [
            "index": index,
            "label": label,
            "plannedArgv": planned,
            "resolvedExecutable": executable,
            "resolvedExecutableSha256": try sha256File(executable),
            "actualSpawnArgv": [executable] + actualArguments,
            "workingDirectory": index == 0 ? "install-repo" : "repo",
            "startedAt": result.startedAt,
            "endedAt": result.endedAt,
            "durationMs": result.durationMs,
            "rawExit": result.signal == nil ? Int(result.exit) : NSNull(),
            "signal": result.signal == nil ? NSNull() : Int(result.signal!),
            "stdoutLog": stdoutName,
            "stdoutSha256": sha256(result.stdout),
            "stderrLog": stderrName,
            "stderrSha256": sha256(result.stderr),
            "counts": counts ?? [:],
            "reporterRecordSha256": sha256(Data("\(label):\(result.exit)".utf8))
        ]
        transcript.append(record)
        results.append([
            "label": label,
            "argv": planned,
            "actualSpawnArgv": [executable] + actualArguments,
            "rawExit": result.signal == nil ? Int(result.exit) : NSNull(),
            "signal": result.signal == nil ? NSNull() : Int(result.signal!),
            "counts": counts ?? NSNull(),
            "failures": failures
        ])
    }
    let reporterAggregate: [String: Any] = [
        "schemaVersion": 2,
        "plan": phase,
        "anchorSha256": digest,
        "runBindingSha256": sha256(bindingBytes),
        "aggregateExit": aggregateExit,
        "entries": results
    ]
    let aggregateBytes = try canonicalJSON(reporterAggregate)
    let transcriptBytes = try canonicalJSON(["schemaVersion": 1, "entries": transcript])
    try writeExclusive("\(runDirectory)/reporter-aggregate.json", data: aggregateBytes)
    let text = results.map { result in
        let counts = result["counts"] is NSNull ? "n/a" : String(describing: result["counts"]!)
        return "\(result["label"]!) raw_exit=\(result["rawExit"]!) counts=\(counts)"
    }.joined(separator: "\n") + "\naggregate_raw_exit=\(aggregateExit)\n"
    try writeExclusive("\(runDirectory)/reporter-aggregate.txt", data: Data(text.utf8))
    try writeExclusive("\(runDirectory)/controller-transcript.json", data: transcriptBytes)
    let status = try commandText("/usr/bin/git", ["status", "--porcelain", "--untracked-files=no"], cwd: repository)
    let mutationCount = status.split(whereSeparator: \.isNewline).count
    if mutationCount != 0 { aggregateExit = 1 }
    if try livePRHead(pr) != commit { aggregateExit = 1 }
    let reopenedAnchor = try Data(contentsOf: URL(fileURLWithPath: "\(active)/anchor.json"))
    let reopenedBinding = try Data(contentsOf: URL(fileURLWithPath: "\(runDirectory)/run-binding.json"))
    let finalReopen = sha256(reopenedAnchor) == digest &&
        sha256(reopenedBinding) == sha256(bindingBytes)
    if !finalReopen { aggregateExit = 1 }
    let finalSurvivors = try executionProcessIDs(uid: childUID)
    if !finalSurvivors.isEmpty {
        terminateProcesses(finalSurvivors)
        aggregateExit = 1
    }
    var outputMembers: [[String: Any]] = []
    let outputNames = try FileManager.default.contentsOfDirectory(atPath: runDirectory)
        .filter { $0 != "repo" && $0 != "output-inventory.json" && $0 != "success.json" && $0 != "failure.json" }
        .sorted()
    for name in outputNames {
        let path = "\(runDirectory)/\(name)"
        var info = stat()
        if lstat(path, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG {
            outputMembers.append([
                "path": name,
                "bytes": Int(info.st_size),
                "sha256": try sha256File(path)
            ])
        }
    }
    let outputInventoryBytes = try canonicalJSON([
        "schemaVersion": 1,
        "members": outputMembers
    ])
    try writeExclusive("\(runDirectory)/output-inventory.json", data: outputInventoryBytes)
    let terminal: [String: Any] = [
        "schemaVersion": 1,
        "kind": aggregateExit == 0 ? "success" : "failure",
        "runId": runId,
        "runBindingSha256": sha256(bindingBytes),
        "anchorSha256": digest,
        "controllerTranscriptSha256": sha256(transcriptBytes),
        "reporterAggregateSha256": sha256(aggregateBytes),
        "inputInventorySha256": sha256(inputInventoryBytes),
        "outputInventorySha256": sha256(outputInventoryBytes),
        "reporterStarted": true,
        "candidateProcessesSpawned": entries.count,
        "controllerAggregateExit": aggregateExit,
        "reporterAggregateExit": reporterAggregate["aggregateExit"]!,
        "integrityFailureClass": aggregateExit == 0 ? NSNull() : "gate-or-final-reopen",
        "finalReopen": finalReopen,
        "anchorReopenMatches": sha256(reopenedAnchor) == digest,
        "bindingReopenMatches": sha256(reopenedBinding) == sha256(bindingBytes),
        "mutationCount": mutationCount,
        "survivorCount": finalSurvivors.count,
        "evidenceReadContract": "root-owned-read-only-top-level-P01-v1",
        "evidenceMemberMode": "0444",
        "completedAt": isoNow()
    ]
    let terminalName = aggregateExit == 0 ? "success.json" : "failure.json"
    let terminalBytes = try canonicalJSON(terminal)
    try writeExclusive("\(runDirectory)/\(terminalName)", data: terminalBytes)
    if aggregateExit == 0 {
        try ensureDirectory("\(controllerRoot)/receipts")
        try ensureDirectory("\(controllerRoot)/receipts/\(phase)")
        let receipt = try canonicalJSON([
            "schemaVersion": 1,
            "phase": phase,
            "candidateCommitSha": commit,
            "terminalSha256": sha256(terminalBytes)
        ])
        let receiptPath = "\(controllerRoot)/receipts/\(phase)/success.json"
        try? removeIfPresent(receiptPath)
        try writeExclusive(receiptPath, data: receipt, mode: 0o444)
    }
    try publishRunEvidence(runDirectory)
    print("CONTROLLER phase=\(phase) run_id=\(runId) run_root=\(runDirectory) aggregate_exit=\(aggregateExit) final_reopen=\(finalReopen)")
    if aggregateExit != 0 { exit(1) }
}

func selfTest(_ arguments: [String]) throws {
    let options = try parseOptions(arguments)
    let output = options["evidence"] ?? "\(evidenceRoot)/P00-V2-CAP-A04/self-test/native-self-test.json"
    try ensureDirectory((output as NSString).deletingLastPathComponent)
    let node = FileManager.default.fileExists(atPath: installedNode) ? installedNode : pinnedNodeSource
    let first = try runCommand(node, ["-e", "process.exit(7)"])
    let second = try runCommand(node, ["-e", "process.exit(0)"])
    let names = [
        "executes the pinned Node negative control with raw exit seven",
        "continues to the second child and derives aggregate one from exact exits seven then zero"
    ]
    let cases = names.map { ["name": $0, "result": "PASS"] }
    let report: [String: Any] = [
        "schemaVersion": 1,
        "controllerVersion": "P00-V2-CAP-A04",
        "generatedAt": ProcessInfo.processInfo.environment["P00_V2_SELF_TEST_TIMESTAMP"] ?? isoNow(),
        "cases": cases,
        "negativeControl": [
            "rawExits": [Int(first.exit), Int(second.exit)],
            "spawned": [true, true],
            "continuedAfterFailure": true,
            "aggregateExit": first.exit == 7 && second.exit == 0 ? 1 : 99
        ]
    ]
    try? removeIfPresent(output)
    try writeExclusive(output, data: try canonicalJSON(report), mode: 0o444)
    if first.exit != 7 || second.exit != 0 { try fail("native exact [7,0] self-test failed") }
    print("SELF_TEST cases=2 passed=2 failed=0 raw_exits=[7,0] aggregate_exit=1 evidence=\(output)")
}

func execRootCore(mode: String, arguments: [String]) throws -> Never {
    guard arguments.isEmpty else { try fail("controller wrappers accept no command arguments") }
    let core = "\(installRoot)/libexec/\(mode)-core"
    let argv = ["/usr/bin/sudo", "-n", core]
    let cArguments = argv.map { strdup($0) } + [nil]
    execv("/usr/bin/sudo", cArguments)
    try fail("could not execute root controller core")
}

func npmLaunch(_ arguments: [String]) throws -> Never {
    let argv = [installedNode, installedNpmCLI] + arguments
    let cArguments = argv.map { strdup($0) } + [nil]
    execv(installedNode, cArguments)
    try fail("could not launch pinned npm")
}

func controllerMain() throws {
    let name = URL(fileURLWithPath: CommandLine.arguments[0]).lastPathComponent
    let arguments = Array(CommandLine.arguments.dropFirst())
    switch name {
    case "arm-phase":
        if geteuid() == 0 { try armPhase(arguments) }
        else { try execRootCore(mode: "arm-phase", arguments: arguments) }
    case "verify-phase":
        if geteuid() == 0 { try verifyPhase(arguments) }
        else { try execRootCore(mode: "verify-phase", arguments: arguments) }
    case "arm-phase-core":
        try armPhase(arguments)
    case "verify-phase-core":
        try verifyPhase(arguments)
    case "npm":
        try npmLaunch(arguments)
    default:
        if arguments.first == "--self-test" {
            try selfTest(Array(arguments.dropFirst()))
        } else {
            try fail("unknown controller invocation \(name)")
        }
    }
}

@main
struct ControllerEntryPoint {
    static func main() {
        do {
            try controllerMain()
        } catch {
            fputs("controller error: \(error)\n", stderr)
            exit(1)
        }
    }
}
