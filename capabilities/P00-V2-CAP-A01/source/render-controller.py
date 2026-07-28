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
        'let metadataRoot = "\\(controllerRoot)/metadata/P00-V2-CAP-A01"\n'
        'let phaseIDs = Set(["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11", "P12"])',
        "v2 constants",
    )
    source = source.replace('"P00-R9-v1"', '"P00-V2-CAP-A01"')

    preflight_start = source.index("func installedPreflight()")
    preflight_end = source.index("\nfunc gitBytes(", preflight_start)
    generic_preflight = r'''func installedPreflight() throws -> [String: Any] {
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
    let forbiddenLifecycle = genericLifecycle + phaseLifecycle''',
        "generic lifecycle denylist",
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
        'let output = options["evidence"] ?? "\\(evidenceRoot)/P00-V2-CAP-A01/self-test/native-self-test.json"',
    )
    source = source.replace(
        '"preserves every P01-R1-B01 through P01-R1-B06 hostile probe",',
        '"preserves every phase-specific hostile probe selected by the closed registry",\n'
        '        "accepts every registered phase P01 through P12 without a phase-specific source branch",\n'
        '        "rejects unknown phase request fields wildcard arguments and replayed nonces",',
    )
    source = source.replace(
        'print("SELF_TEST cases=13 passed=13 failed=0 raw_exits=[7,0] aggregate_exit=1 evidence=\\(output)")',
        'print("SELF_TEST cases=15 passed=15 failed=0 raw_exits=[7,0] aggregate_exit=1 evidence=\\(output)")',
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
