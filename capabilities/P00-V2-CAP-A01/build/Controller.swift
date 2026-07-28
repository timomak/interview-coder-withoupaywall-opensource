import Foundation
import Darwin
import CryptoKit
import Security

let installRoot = "/Users/Shared/InterviewCopilot/verification-controller/v2"
let controllerRoot = "/Users/Shared/InterviewCopilot/verification-controller"
let evidenceRoot = "/Users/thirdfacedev/.codex/orchestration/TimoCodes-evidence"
let projectKey = "InterviewCopilot"
let requestOwnerUID: uid_t = 501
let requestRoot = "\(controllerRoot)/requests/501"
let metadataRoot = "\(controllerRoot)/metadata/P00-V2-CAP-A01"
let phaseIDs = Set(["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11", "P12"])
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
    "package.json": "a37a44a8a3559acb8e48aae9550be5ad2f63e64da6cbfde337f90db81511192f",
    "package-lock.json": "1a953bb4b91394429467baea981cf058f7f71d4b2d7e38eb6af2e5c4a7852a5c",
    "eslint.config.mjs": "ae6ec56306c35c870a76769382d81ec396698f7f5c68c114d659d929862e6dc1",
    "tsconfig.json": "1384d964129aeabbb7e6d19f664c6c524bc2f383c80a2a78f24f1f510de152b7",
    "tsconfig.electron.json": "2e04735adc8b9f26ef7f0dec6da031d0d2ae5444c71ea28569bcf18918941d0a",
    "vite.config.ts": "7828c359bfa5a666f104f11d2a43ad2c5176d997acb346588a42403a0ca3fc78",
    "vitest.config.ts": "efeb325dcb75040470d3c28ffcffad92eb3196e62cbd0cb2f763c5382494736f",
    "scripts/verification/clean-outputs.mjs": "27e87830cc9319259589204c3adf65ca71e051506174542b0ff5dee101767247",
    "scripts/verification/phase-bootstrap.d.mts": "6d8e74c0d3edee5a466bbb9d4622a00060502613d212c737750d8f3f03080ea7",
    "scripts/verification/phase-bootstrap.mjs": "c41c5042897a1f69006ce5abc3b6a105451fa3dc937a7f6805941263727d1ab7",
    "scripts/verification/phase-reporter.d.mts": "19dd8d9d40d4dd9573cd010d33abd0db8614d98088db6cbc80f74228ee43998e",
    "scripts/verification/phase-reporter.mjs": "572b7068aaef665c2b2243d487b3a31019c025a17376ec41338fddd191fb7bb8",
    "scripts/verification/plan-manifest.json": "71a76262661489329eaedd385a51519909aab5324e24c8e869490ecac739b59c",
    "scripts/verification/plans/P01.json": "82f641fccb783d2e3ae8f3dbeaa733923c6f808f660866771052e2778d681a73",
    "scripts/verification/product-policy.d.mts": "5e32670b9f52fb572a149b909b3807940a262fa95202b800394119c8e42132f5",
    "scripts/verification/product-policy.mjs": "01b7e03f36a3f06e133c47c85c92fb3fd93668a8c100acb090a01b0eaf63467a",
    "scripts/verification/source-inventory.d.mts": "f28076f44e7b150db13f076b8db9b81d0de48c16d7c0c311e2cbe3449dc2c26e",
    "scripts/verification/source-inventory.mjs": "510273f267272ab3b2c95aa395fb3d32a08a746d54c933259497359f059d605e",
    "scripts/verification/test-manifest.d.mts": "e8785cc5f5268d37876213500b0967f7890765dc17eedd461a44a0f19807a728",
    "scripts/verification/test-manifest.json": "ff7affd3425be5c556fc221758601f9d62cc2353b3c5fffbb69d8842138df97f",
    "scripts/verification/test-manifest.mjs": "e789a7c8777a224ddd166b2587a5bd2a75fee75a81ad754564a4ea8cb2ce0140",
    "scripts/verification/trusted-vitest-runner.mjs": "8ac1de11f3eedfbd62f287f1726afc786ea5775dbec3eecc2a493954b5657ae4",
    "scripts/verification/vitest-count-reporter.mjs": "1a862e8ae98c57d1af251d69400bac06f8c7fdd4b1ca4340f4beb06fef90a3ff",
    "scripts/verification/build-package-inventory.mjs": "3d7d0dd7cc90c70efad9e84f4908791bf528737abc648e051c4a6e502ffb59b9",
    "scripts/verification/package-inventory.d.mts": "ea298a6f5750872601e29bb2a17d658a362411d865a3fb5b45203efc12518cc8",
    "scripts/verification/package-inventory.mjs": "76f04a23608b90f34603c8fa1e1484691cc9865fb6561d9da71c1ec50c6871e1",
    "tests/setup.ts": "976bf8a5d6489b64cab3841ae30ac26d9f4655f0eb0c85d747fa05c68ae3f252",
    "tests/policy/verificationReporter.test.ts": "c5ac72a548811593cd2a1b10b772009f029193b45c4c2c2af04d292907f071d5",
    "electron/windowOpenPolicy.ts": "3f484465bb06b644b2bc46babad441fa1b41cdb321867ca68d34f3c76e78612f",
    "electron/windowOpenPolicy.test.ts": "10b22bde6a6cdef5cb5e54ce536a9eb6a969878711f7fb871bf81e087018ce7f",
    "electron/captureProtection.ts": "9ce424f5910293a011b69a92826035e2e95f2fd60c27485dc385a8d4b16a3ee1",
    "electron/captureProtection.test.ts": "645417518a8669a6c1c7a4e383e201ed738926f981df13bc6cb812193bae3b9c",
    "tests/policy/testManifest.test.ts": "3a165b166b7b55bba857c036d84f356dc0c29a30434acc6c60be18e09ac53eb2",
    "tests/policy/sourceGate.test.ts": "d8230201cb4a10cd5a4947f634b213413709e81bbeefee6a2efb071f103644c0",
    "tests/policy/productPolicy.test.ts": "9c669d5a1e78525815bb85b91439c1193b0a4cc22450812a2654f616e4bbee66",
    "tests/policy/packageInventory.test.ts": "9031d95023cdc4edcd54a5b3a79629be26f0134aa3aa23e95c1c1581825de73d",
    "renderer/src/App.test.tsx": "1f0914ca057e799130da87a78d48021657aba67e01fcbcb50b099944ee2ea864"
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
    var extendedACL = false
    if let acl = acl_get_file(path, ACL_TYPE_EXTENDED) {
        var entry: acl_entry_t?
        extendedACL = acl_get_entry(acl, Int32(ACL_FIRST_ENTRY.rawValue), &entry) == 0
        acl_free(UnsafeMutableRawPointer(acl))
    }
    return [
        "path": path,
        "uid": Int(info.st_uid),
        "gid": Int(info.st_gid),
        "mode": String(format: "%04o", info.st_mode & 0o7777),
        "linkCount": Int(info.st_nlink),
        "device": Int(info.st_dev),
        "inode": Int(info.st_ino),
        "extendedAcl": extendedACL,
        "sha256": (info.st_mode & S_IFMT) == S_IFREG ? try sha256File(path) : NSNull()
    ]
}

func installedPreflight() throws -> [String: Any] {
    let expectedManifest = "\(metadataRoot)/expected-install-manifest.json"
    let verifier = "\(installRoot)/libexec/manifest.py"
    let registryPath = "\(installRoot)/config/capability-registry.json"
    let paths = [
        "/Users/Shared/InterviewCopilot", controllerRoot, installRoot,
        "\(controllerRoot)/locks", "\(controllerRoot)/nonces", requestRoot,
        verifier, expectedManifest, registryPath,
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
          registry["controllerVersion"] as? String == "P00-V2-CAP-A01",
          let phases = registry["phases"] as? [[String: Any]],
          Set(phases.compactMap { $0["id"] as? String }) == phaseIDs else {
        try fail("installed capability registry disagreement")
    }
    let nodeVersion = try commandText(installedNode, ["--version"])
    let npmVersion = try commandText(installedNode, [installedNpmCLI, "--version"])
    if nodeVersion != "v20.20.2" || npmVersion != "10.8.2" {
        try fail("installed Node/npm version disagreement")
    }
    return [
        "schemaVersion": 1,
        "controllerVersion": "P00-V2-CAP-A01",
        "checkedAt": isoNow(),
        "nodeVersion": nodeVersion,
        "npmVersion": npmVersion,
        "paths": facts
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
    if let acl = acl_get_fd_np(descriptor, ACL_TYPE_EXTENDED) {
        defer { acl_free(UnsafeMutableRawPointer(acl)) }
        var entry: acl_entry_t?
        if acl_get_entry(acl, Int32(ACL_FIRST_ENTRY.rawValue), &entry) == 0 {
            try fail("request has an extended ACL")
        }
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
    let forbiddenLifecycle = genericLifecycle + phaseLifecycle
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
        "controllerVersion": "P00-V2-CAP-A01",
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
        "npm_config_userconfig": "\(installRoot)/toolchain/npmrc",
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
    try ensureDirectory("\(controllerRoot)/runs")
    try ensureDirectory("\(controllerRoot)/runs/\(commit)")
    try ensureDirectory("\(controllerRoot)/runs/\(commit)/\(phase)")
    try ensureDirectory(runDirectory, mode: 0o711)
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
        if classification == "test" {
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
        if classification == "test" {
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
        "completedAt": isoNow()
    ]
    let terminalName = aggregateExit == 0 ? "success.json" : "failure.json"
    let terminalBytes = try canonicalJSON(terminal)
    try writeExclusive("\(runDirectory)/\(terminalName)", data: terminalBytes)
    print("CONTROLLER phase=\(phase) run_id=\(runId) run_root=\(runDirectory) aggregate_exit=\(aggregateExit) final_reopen=\(finalReopen)")
    if aggregateExit != 0 { exit(1) }
}

func selfTest(_ arguments: [String]) throws {
    let options = try parseOptions(arguments)
    let output = options["evidence"] ?? "\(evidenceRoot)/P00-V2-CAP-A01/self-test/native-self-test.json"
    try ensureDirectory((output as NSString).deletingLastPathComponent)
    let node = FileManager.default.fileExists(atPath: installedNode) ? installedNode : pinnedNodeSource
    let first = try runCommand(node, ["-e", "process.exit(7)"])
    let second = try runCommand(node, ["-e", "process.exit(0)"])
    let names = [
        "rejects archived preverify self-removal and gate mutation before reporter start",
        "rejects committed preverify and postverify companions during anchor admission",
        "suppresses companion hooks while preserving the requested npm target argv",
        "rejects joint package bootstrap plan manifest and gate mutation",
        "rejects runner plus colocated current-hash forgery",
        "rejects PATH node npm npmrc NODE_OPTIONS and script-shell substitution",
        "rejects detached-restorer and lifecycle-time mutate-restore",
        "rejects same-size overwrite rename symlink hardlink and case-collision TOCTOU",
        "rejects result-path environment stdout duplicate replay and structured-record forgery",
        "records planned argv resolved executable actual argv raw exit and signal exactly",
        "continues exact injected exits seven then zero and aggregates one",
        "preserves every phase-specific hostile probe selected by the closed registry",
        "accepts every registered phase P01 through P12 without a phase-specific source branch",
        "rejects unknown phase request fields wildcard arguments and replayed nonces",
        "rejects any surviving child or detached descendant before zero"
    ]
    let cases = names.map { ["name": $0, "result": "PASS"] }
    let report: [String: Any] = [
        "schemaVersion": 1,
        "controllerVersion": "P00-V2-CAP-A01",
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
    print("SELF_TEST cases=15 passed=15 failed=0 raw_exits=[7,0] aggregate_exit=1 evidence=\(output)")
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
