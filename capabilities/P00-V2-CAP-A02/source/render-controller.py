#!/usr/bin/env python3
"""Render the generic v2 controller from the hash-pinned P00-R9 v1 source."""

from __future__ import annotations

import hashlib
import pathlib
import sys

BASE_SHA256 = "42fd20cae6dd517a4f3fffabf1c24a38b16abdb5f4d0132c463a429271e17e77"


def fail(message: str) -> None:
    raise SystemExit(message)


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        fail(f"{label}: expected exactly one match, found {count}")
    return source.replace(old, new, 1)


def main() -> None:
    if len(sys.argv) != 3:
        fail("usage: render-controller.py LEGACY_CONTROLLER OUTPUT")
    legacy = pathlib.Path(sys.argv[1])
    output = pathlib.Path(sys.argv[2])
    raw = legacy.read_bytes()
    actual = hashlib.sha256(raw).hexdigest()
    if actual != BASE_SHA256:
        fail(f"legacy controller hash mismatch: expected {BASE_SHA256}, got {actual}")
    source = raw.decode("utf-8")

    source = replace_once(
        source,
        'let installRoot = "/Users/Shared/InterviewCopilot/verification-controller/v1"\n'
        'let controllerRoot = "/Users/Shared/InterviewCopilot/verification-controller"\n'
        'let evidenceRoot = "/Users/thirdfacedev/.codex/orchestration/TimoCodes-evidence/P01-controller-P00-R9"',
        'let installRoot = "/Users/Shared/InterviewCopilot/verification-controller/v2"\n'
        'let controllerRoot = "/Users/Shared/InterviewCopilot/verification-controller"\n'
        'let evidenceRoot = "/Users/thirdfacedev/.codex/orchestration/TimoCodes-evidence"\n'
        'let projectKey = "InterviewCopilot"\n'
        'let requestOwnerUID: uid_t = 501\n'
        'let requestRoot = "\\(controllerRoot)/requests/501"\n'
        'let metadataRoot = "\\(controllerRoot)/metadata/P00-V2-CAP-A02"\n'
        'let phaseIDs = Set(["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11", "P12"])\n'
        'let phaseDependencies: [String: [String]] = [\n'
        '    "P01": [], "P02": ["P01"], "P03": ["P01"],\n'
        '    "P04": ["P02", "P03"], "P05": ["P04"],\n'
        '    "P06": ["P05"], "P07": ["P05"], "P08": ["P05"], "P09": ["P05"],\n'
        '    "P10": ["P06", "P07", "P08"],\n'
        '    "P11": ["P06", "P07", "P08", "P09", "P10"], "P12": ["P11"]\n'
        ']\n'
        'let approvedPackageScripts: [String: String] = [\n'
        '    "verify:policy": "node scripts/verification/product-policy.mjs",\n'
        '    "lint": "node scripts/verification/source-inventory.mjs && eslint .",\n'
        '    "typecheck": "node scripts/verification/typecheck-inventory.mjs && tsc -p tsconfig.electron.json --noEmit",\n'
        '    "test:legacy": "node scripts/verification/trusted-vitest-runner.mjs legacy",\n'
        '    "test:unit": "node scripts/verification/trusted-vitest-runner.mjs unit",\n'
        '    "test:p01": "node scripts/verification/trusted-vitest-runner.mjs p01",\n'
        '    "build": "npm run build:runtime && npm run verify:package-inventory",\n'
        '    "build:runtime": "cross-env NODE_ENV=production npm run clean && vite build && tsc -p tsconfig.electron.json",\n'
        '    "clean": "node scripts/verification/clean-outputs.mjs",\n'
        '    "verify:package-inventory": "node scripts/verification/build-package-inventory.mjs",\n'
        '    "verify:test-manifest": "node scripts/verification/test-manifest.mjs",\n'
        '    "package:mac": "npm run build && electron-builder build --mac",\n'
        '    "qualify:meet": "node scripts/qualification/qualify-meet.mjs",\n'
        '    "verify:diagnostics": "node scripts/verification/diagnostics.mjs",\n'
        '    "verify:mac-package": "node scripts/verification/mac-package.mjs",\n'
        '    "verify:release": "node scripts/verification/release.mjs",\n'
        '    "test:p02": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:p03": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:p04": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:p05": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:p06": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:p07": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:p08": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:p09": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:p10": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:p11": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:p12": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:electron-shell": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:coding-fixtures": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:system-design-fixtures": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:behavioral-fixtures": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:audio-native": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:audio-retention": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:prompt-adversarial": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:history-roundtrip": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:plaintext-scan": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:e2e-macos": "node scripts/verification/trusted-vitest-runner.mjs all",\n'
        '    "test:staff-live-corpus": "node scripts/verification/trusted-vitest-runner.mjs all"\n'
        ']',
        "v2 constants",
    )
    source = source.replace('"P00-R9-v1"', '"P00-V2-CAP-A02"')

    control_plane_digests = {
        ".npmrc": "7151cf397def0c2cb0ab65643701d27d335a72c90f775675b5f826bc7005818a",
        "scripts/verification/phase-bootstrap.d.mts": "6d8e74c0d3edee5a466bbb9d4622a00060502613d212c737750d8f3f03080ea7",
        "scripts/verification/phase-bootstrap.mjs": "c41c5042897a1f69006ce5abc3b6a105451fa3dc937a7f6805941263727d1ab7",
        "scripts/verification/phase-reporter.d.mts": "19dd8d9d40d4dd9573cd010d33abd0db8614d98088db6cbc80f74228ee43998e",
        "scripts/verification/phase-reporter.mjs": "572b7068aaef665c2b2243d487b3a31019c025a17376ec41338fddd191fb7bb8",
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
        "scripts/verification/plans/P12.json": "55cc03996f171c23ef56ecc9cd14f755c961ba84cb48178a6681126d0d20b640",
        "scripts/verification/plans/P12-observer.json": "011911987152e3c14bc439a1a7ff4c55c99270ab009a1b3387f18170e10ff375",
        "scripts/verification/product-policy.d.mts": "5e32670b9f52fb572a149b909b3807940a262fa95202b800394119c8e42132f5",
        "scripts/verification/product-policy.mjs": "01b7e03f36a3f06e133c47c85c92fb3fd93668a8c100acb090a01b0eaf63467a",
        "scripts/verification/source-inventory.d.mts": "f28076f44e7b150db13f076b8db9b81d0de48c16d7c0c311e2cbe3449dc2c26e",
        "scripts/verification/source-inventory.mjs": "510273f267272ab3b2c95aa395fb3d32a08a746d54c933259497359f059d605e",
        "scripts/verification/test-manifest.d.mts": "e8785cc5f5268d37876213500b0967f7890765dc17eedd461a44a0f19807a728",
        "scripts/verification/test-manifest.mjs": "e789a7c8777a224ddd166b2587a5bd2a75fee75a81ad754564a4ea8cb2ce0140",
        "scripts/verification/trusted-vitest-runner.mjs": "8ac1de11f3eedfbd62f287f1726afc786ea5775dbec3eecc2a493954b5657ae4",
        "scripts/verification/vitest-count-reporter.mjs": "1a862e8ae98c57d1af251d69400bac06f8c7fdd4b1ca4340f4beb06fef90a3ff",
        "scripts/verification/build-package-inventory.mjs": "3d7d0dd7cc90c70efad9e84f4908791bf528737abc648e051c4a6e502ffb59b9",
        "scripts/verification/package-inventory.d.mts": "ea298a6f5750872601e29bb2a17d658a362411d865a3fb5b45203efc12518cc8",
        "scripts/verification/package-inventory.mjs": "76f04a23608b90f34603c8fa1e1484691cc9865fb6561d9da71c1ec50c6871e1",
    }
    digest_start = source.index("let approvedInputDigests:")
    digest_end = source.index("\n]\n\nenum ControllerError", digest_start) + 2
    digest_lines = ["let approvedInputDigests: [String: String] = ["]
    digest_lines.extend(
        f'    "{path}": "{digest}",'
        for path, digest in sorted(control_plane_digests.items())
    )
    digest_lines.append("]")
    source = source[:digest_start] + "\n".join(digest_lines) + source[digest_end:]
    source = replace_once(
        source,
        '''    var extendedACL = false
    if let acl = acl_get_file(path, ACL_TYPE_EXTENDED) {
        var entry: acl_entry_t?
        extendedACL = acl_get_entry(acl, Int32(ACL_FIRST_ENTRY.rawValue), &entry) == 0
        acl_free(UnsafeMutableRawPointer(acl))
    }''',
        '''    errno = 0
    var extendedACL = false
    if let acl = acl_get_file(path, ACL_TYPE_EXTENDED) {
        extendedACL = true
        if acl_free(UnsafeMutableRawPointer(acl)) != 0 {
            try fail("ACL release failed for \\(path)")
        }
    } else if errno != ENOENT {
        try fail("ACL inspection failed for \\(path) with errno \\(errno)")
    }''',
        "fail-closed path ACL inspection",
    )

    preflight_start = source.index("func installedPreflight()")
    preflight_end = source.index("\nfunc gitBytes(", preflight_start)
    generic_preflight = r'''func installedPreflight() throws -> [String: Any] {
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
          registry["controllerVersion"] as? String == "P00-V2-CAP-A02",
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
    return [
        "schemaVersion": 1,
        "controllerVersion": "P00-V2-CAP-A02",
        "checkedAt": isoNow(),
        "nodeVersion": nodeVersion,
        "npmVersion": npmVersion,
        "paths": facts
    ]
}
'''
    source = source[:preflight_start] + generic_preflight + source[preflight_end:]

    request_code = r'''
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

'''
    source = replace_once(
        source,
        "func livePRHead(_ pr: Int) throws -> String {",
        request_code + "func livePRHead(_ pr: Int) throws -> String {",
        "request reader injection",
    )

    old_arm_header = '''func armPhase(_ arguments: [String]) throws {
    guard geteuid() == 0 else { try fail("arm-phase core requires root") }
    _ = try installedPreflight()
    let slotLock = try ControllerLock("\\(controllerRoot)/locks/P01-local.lock")
    _ = slotLock
    let options = try parseOptions(arguments)
    guard options["phase"] == "P01",
          options["approved-packet"] == approvedPacket,
          let expected = options["expected-head"],
          expected.range(of: "^[a-f0-9]{40}$", options: .regularExpression) != nil,
          let prText = options["pr"], let pr = Int(prText) else {
        try fail("arm-phase requires P01, PR, exact head, and P00-R9")
    }
'''
    new_arm_header = '''func armPhase(_ arguments: [String]) throws {
    guard geteuid() == 0 else { try fail("arm-phase core requires root") }
    guard arguments.isEmpty else { try fail("arm-phase accepts no command arguments") }
    _ = try installedPreflight()
    let request = try readCapabilityRequest("arm")
    let phase = request.phase
    let expected = request.expectedHead!
    let pr = request.prNumber!
    let slotLock = try ControllerLock("\\(controllerRoot)/locks/\\(phase)-local.lock")
    _ = slotLock
'''
    source = replace_once(source, old_arm_header, new_arm_header, "arm admission")
    source = source.replace(
        '"refs/pull/\\(pr)/head:refs/controller/P01"',
        '"refs/pull/\\(pr)/head:refs/controller/\\(phase)"',
    )
    source = source.replace(
        '"refs/controller/P01^{commit}"',
        '"refs/controller/\\(phase)^{commit}"',
    )
    source = replace_once(
        source,
        '''    if !FileManager.default.fileExists(atPath: "\\(store)/HEAD") {
        _ = try commandText("/usr/bin/git", ["init", "--bare", store])
    }''',
        '''    if !FileManager.default.fileExists(atPath: "\\(store)/HEAD") {
        _ = try commandText("/usr/bin/git", ["init", "--bare", store])
    }
    try enforcePhaseDependencies(phase, store: store)''',
        "phase dependency enforcement",
    )
    source = source.replace('"phase": "P01"', '"phase": phase')
    source = source.replace(
        'let activeParent = "\\(controllerRoot)/anchors/active/P01"',
        'let activeParent = "\\(controllerRoot)/anchors/active/\\(phase)"',
    )
    source = source.replace(
        'print("ARMED phase=P01 pr=\\(pr) head=\\(expected) anchor_sha256=\\(sha256(bytes))")',
        'print("ARMED phase=\\(phase) pr=\\(pr) head=\\(expected) anchor_sha256=\\(sha256(bytes))")',
    )
    source = source.replace(
        'let installManifest = try Data(contentsOf: URL(fileURLWithPath: "\\(installRoot)/controller-install.json"))',
        'let installManifest = try Data(contentsOf: URL(fileURLWithPath: "\\(metadataRoot)/release-envelope.json"))',
    )
    source = replace_once(
        source,
        '''    let forbiddenLifecycle = [
        "preinstall", "install", "postinstall", "prepublish", "preprepare", "prepare",
        "postprepare", "pretest", "posttest", "pretest:legacy", "posttest:legacy",
        "pretest:unit", "posttest:unit", "pretest:p01", "posttest:p01",
        "preverify:policy", "postverify:policy", "prelint", "postlint",
        "pretypecheck", "posttypecheck", "prebuild", "postbuild",
        "preverify:test-manifest", "postverify:test-manifest",
        "preverify:phase", "postverify:phase"
    ]''',
        '''    let genericLifecycle = [
        "preinstall", "install", "postinstall", "prepublish", "preprepare", "prepare",
        "postprepare", "pretest", "posttest", "pretest:legacy", "posttest:legacy",
        "pretest:unit", "posttest:unit", "preverify:policy", "postverify:policy",
        "prelint", "postlint", "pretypecheck", "posttypecheck", "prebuild", "postbuild",
        "preverify:test-manifest", "postverify:test-manifest",
        "preverify:phase", "postverify:phase"
    ]
    let phaseLifecycle = phaseIDs.sorted().flatMap {
        ["pretest:\\($0.lowercased())", "posttest:\\($0.lowercased())"]
    }
    let mappedLifecycle = approvedPackageScripts.keys.flatMap {
        ["pre\\($0)", "post\\($0)"]
    }
    let forbiddenLifecycle = Array(
        Set(genericLifecycle + phaseLifecycle + mappedLifecycle)
    ).sorted()''',
        "generic lifecycle denylist",
    )
    source = replace_once(
        source,
        '''    let treeListing = try runCommand("/usr/bin/git", ["--git-dir", store, "ls-tree", "-r", "-z", "--full-tree", expected])''',
        '''    let currentPlanBytes = try gitBytes(
        store,
        "\\(expected):scripts/verification/plans/\\(phase).json"
    )
    guard let currentPlan = try parseJSON(currentPlanBytes) as? [String: Any],
          let currentEntries = currentPlan["entries"] as? [[String: Any]] else {
        try fail("current phase plan is invalid")
    }
    var pendingScriptTargets: [String] = []
    for (index, entry) in currentEntries.enumerated() {
        guard let argv = entry["argv"] as? [String], argv.count >= 2 else {
            try fail("current phase plan entry \\(index) has invalid argv")
        }
        if argv.count >= 3 && argv[0] == "npm" && argv[1] == "run" {
            let target = argv[2]
            guard approvedPackageScripts[target] != nil else {
                try fail("package script policy is absent for \\(target)")
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
            try fail("package script mapping disagreement for \\(target)")
        }
        validatedScriptTargets[target] = expectedScript
        let words = expectedScript.split(whereSeparator: { $0.isWhitespace })
            .map(String.init)
        if words.count >= 3 {
            for index in 0..<(words.count - 2) {
                if words[index] == "npm" && words[index + 1] == "run" {
                    let dependency = words[index + 2]
                    guard approvedPackageScripts[dependency] != nil else {
                        try fail("transitive package script policy is absent for \\(dependency)")
                    }
                    pendingScriptTargets.append(dependency)
                }
            }
        }
    }
    let treeListing = try runCommand("/usr/bin/git", ["--git-dir", store, "ls-tree", "-r", "-z", "--full-tree", expected])''',
        "exact package script policy",
    )
    source = replace_once(
        source,
        '''        "packageScripts": packageScripts,''',
        '''        "packageScripts": packageScripts,
        "validatedScriptTargets": validatedScriptTargets,''',
        "anchored exact package script policy",
    )

    plan_start = source.index("func planEntries(")
    plan_end = source.index("\nfunc chownTree(", plan_start)
    generic_plan = r'''func planEntries(_ root: String, phase: String) throws -> [[String: Any]] {
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
'''
    source = source[:plan_start] + generic_plan + source[plan_end:]
    source = replace_once(
        source,
        '"npm_config_userconfig": "\\(installRoot)/toolchain/npmrc"',
        '"npm_config_userconfig": "\\(installRoot)/config/npmrc"',
        "installed npmrc path",
    )
    source = replace_once(
        source,
        '''        let challenge: Data?
        var challengeNonce: String? = nil
        var challengeKey: String? = nil
        var challengeBinding: String? = nil
        if classification == "test" {''',
        '''        let challenge: Data?
        var challengeNonce: String? = nil
        var challengeKey: String? = nil
        var challengeBinding: String? = nil
        let receivesAuthenticationSecret =
            classification == "test" &&
            planned.count >= 3 &&
            planned[0] == "npm" &&
            planned[1] == "run" &&
            planned[2].hasPrefix("test:")
        if receivesAuthenticationSecret {''',
        "limit authentication secret to sealed test runner",
    )
    source = replace_once(
        source,
        '''        var counts: [String: Int]? = nil
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
        }''',
        '''        var counts: [String: Int]? = nil
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
        }''',
        "non-secret qualification accounting",
    )

    old_verify_header = '''func verifyPhase(_ arguments: [String]) throws {
    guard geteuid() == 0 else { try fail("verify-phase core requires root") }
    if arguments == ["--preflight"] {
        let result = try installedPreflight()
        print(String(data: try canonicalJSON(result), encoding: .utf8)!)
        return
    }
    let options = try parseOptions(arguments)
    guard options["phase"] == "P01", options.count == 1 else {
        try fail("verify-phase requires only --phase P01")
    }
    let slotLock = try ControllerLock("\\(controllerRoot)/locks/P01-local.lock")
    _ = slotLock
    let active = "\\(controllerRoot)/anchors/active/P01/local"
'''
    new_verify_header = '''func verifyPhase(_ arguments: [String]) throws {
    guard geteuid() == 0 else { try fail("verify-phase core requires root") }
    guard arguments.isEmpty else { try fail("verify-phase accepts no command arguments") }
    _ = try installedPreflight()
    let request = try readCapabilityRequest("verify")
    let phase = request.phase
    let slotLock = try ControllerLock("\\(controllerRoot)/locks/\\(phase)-local.lock")
    _ = slotLock
    let active = "\\(controllerRoot)/anchors/active/\\(phase)/local"
'''
    source = replace_once(source, old_verify_header, new_verify_header, "verify admission")
    source = replace_once(
        source,
        '''    try ensureDirectory("\\(controllerRoot)/runs")
    try ensureDirectory("\\(controllerRoot)/runs/\\(commit)")
    try ensureDirectory("\\(controllerRoot)/runs/\\(commit)/P01")
    try ensureDirectory(runDirectory, mode: 0o711)''',
        '''    let traversableRunAncestors = [
        "\\(controllerRoot)/runs",
        "\\(controllerRoot)/runs/\\(commit)",
        "\\(controllerRoot)/runs/\\(commit)/\\(phase)",
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
            try fail("run ancestor filesystem contract disagreement: \\(path)")
        }
        if chmod(path, 0o711) != 0 {
            try fail("could not enforce traverse-only run ancestor: \\(path)")
        }
    }''',
        "traversable run ancestors",
    )
    source = source.replace(
        'anchor["phase"] as? String == "P01"',
        'anchor["phase"] as? String == phase',
    )
    source = source.replace(
        'let runDirectory = "\\(controllerRoot)/runs/\\(commit)/P01/\\(runId)"',
        'let runDirectory = "\\(controllerRoot)/runs/\\(commit)/\\(phase)/\\(runId)"',
    )
    source = source.replace(
        'try ensureDirectory("\\(controllerRoot)/runs/\\(commit)/P01")',
        'try ensureDirectory("\\(controllerRoot)/runs/\\(commit)/\\(phase)")',
    )
    source = source.replace(
        "let entries = try planEntries(repository)",
        "let entries = try planEntries(repository, phase: phase)",
    )
    old_plan_anchor = '''guard let anchoredPlans = anchor["plans"] as? [String: Any],
          let anchoredP01 = anchoredPlans["P01"] as? [String: Any],
          let anchoredPlanDigest = anchoredP01["sha256"] as? String,
          try sha256File("\\(repository)/scripts/verification/plans/P01.json") == anchoredPlanDigest else {
        try fail("materialized P01 plan disagrees with active anchor")
    }'''
    new_plan_anchor = '''guard let anchoredPlans = anchor["plans"] as? [String: Any],
          let anchoredPhase = anchoredPlans[phase] as? [String: Any],
          let anchoredPlanDigest = anchoredPhase["sha256"] as? String,
          try sha256File("\\(repository)/scripts/verification/plans/\\(phase).json") == anchoredPlanDigest else {
        try fail("materialized \\(phase) plan disagrees with active anchor")
    }'''
    source = replace_once(source, old_plan_anchor, new_plan_anchor, "generic plan anchor")
    source = source.replace('"plan": "P01"', '"plan": phase')
    source = source.replace(
        'print("CONTROLLER phase=P01 run_id=\\(runId) run_root=\\(runDirectory) aggregate_exit=\\(aggregateExit) final_reopen=\\(finalReopen)")',
        'print("CONTROLLER phase=\\(phase) run_id=\\(runId) run_root=\\(runDirectory) aggregate_exit=\\(aggregateExit) final_reopen=\\(finalReopen)")',
    )
    source = replace_once(
        source,
        '''    let terminalBytes = try canonicalJSON(terminal)
    try writeExclusive("\\(runDirectory)/\\(terminalName)", data: terminalBytes)
    print("CONTROLLER phase=\\(phase) run_id=\\(runId) run_root=\\(runDirectory) aggregate_exit=\\(aggregateExit) final_reopen=\\(finalReopen)")''',
        '''    let terminalBytes = try canonicalJSON(terminal)
    try writeExclusive("\\(runDirectory)/\\(terminalName)", data: terminalBytes)
    if aggregateExit == 0 {
        try ensureDirectory("\\(controllerRoot)/receipts")
        try ensureDirectory("\\(controllerRoot)/receipts/\\(phase)")
        let receipt = try canonicalJSON([
            "schemaVersion": 1,
            "phase": phase,
            "candidateCommitSha": commit,
            "terminalSha256": sha256(terminalBytes)
        ])
        let receiptPath = "\\(controllerRoot)/receipts/\\(phase)/success.json"
        try? removeIfPresent(receiptPath)
        try writeExclusive(receiptPath, data: receipt, mode: 0o444)
    }
    print("CONTROLLER phase=\\(phase) run_id=\\(runId) run_root=\\(runDirectory) aggregate_exit=\\(aggregateExit) final_reopen=\\(finalReopen)")''',
        "dependency success receipt",
    )

    old_exec = '''func execRootCore(mode: String, arguments: [String]) throws -> Never {
    let core = "\\(installRoot)/libexec/\\(mode)-core"
    let argv = ["/usr/bin/sudo", "-n", core] + arguments
'''
    new_exec = '''func execRootCore(mode: String, arguments: [String]) throws -> Never {
    guard arguments.isEmpty else { try fail("controller wrappers accept no command arguments") }
    let core = "\\(installRoot)/libexec/\\(mode)-core"
    let argv = ["/usr/bin/sudo", "-n", core]
'''
    source = replace_once(source, old_exec, new_exec, "no-argument sudo wrapper")

    source = source.replace(
        'let output = options["evidence"] ?? "\\(evidenceRoot)/self-test/native-self-test.json"',
        'let output = options["evidence"] ?? "\\(evidenceRoot)/P00-V2-CAP-A02/self-test/native-self-test.json"',
    )
    self_test_start = source.index("    let names = [", source.index("func selfTest("))
    self_test_end = source.index("    let cases =", self_test_start)
    source = (
        source[:self_test_start]
        + '''    let names = [
        "executes the pinned Node negative control with raw exit seven",
        "continues to the second child and derives aggregate one from exact exits seven then zero"
    ]
'''
        + source[self_test_end:]
    )
    source = source.replace(
        'print("SELF_TEST cases=13 passed=13 failed=0 raw_exits=[7,0] aggregate_exit=1 evidence=\\(output)")',
        'print("SELF_TEST cases=2 passed=2 failed=0 raw_exits=[7,0] aggregate_exit=1 evidence=\\(output)")',
    )
    source = source.replace(
        '"generatedAt": isoNow(),',
        '"generatedAt": ProcessInfo.processInfo.environment["P00_V2_SELF_TEST_TIMESTAMP"] ?? isoNow(),',
    )
    source = source.replace('"cases": cases,', '"cases": cases,')

    if 'options["phase"] == "P01"' in source or "refs/controller/P01" in source:
        fail("render left a P01-only admission or ref")
    if "P01-local.lock" in source:
        fail("render left a P01-only lock")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(source, encoding="utf-8")


if __name__ == "__main__":
    main()
