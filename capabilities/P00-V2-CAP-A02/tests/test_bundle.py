#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import tempfile
import unittest


BUNDLE = pathlib.Path(__file__).resolve().parents[1]
A01_BUNDLE = BUNDLE.parent / "P00-V2-CAP-A01"
BUILD = BUNDLE / "build"
MANIFEST_TOOL = BUNDLE / "tools/manifest.py"
ENVELOPE_TOOL = BUNDLE / "tools/envelope.py"
LEGACY_ROOT = pathlib.Path(
    "/Users/Shared/InterviewCopilot/verification-controller/v1"
)
LEGACY_SUDOERS = pathlib.Path(
    "/Users/thirdfacedev/.codex/orchestration/TimoCodes-evidence/"
    "P01-controller-P00-R9/src/sudoers"
)
PHASES = [f"P{number:02d}" for number in range(1, 13)]


def run(
    *arguments: str | os.PathLike[str],
    env: dict[str, str] | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(argument) for argument in arguments],
        check=check,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make_writable(root: pathlib.Path) -> None:
    if not root.exists():
        return
    for path in [root, *root.rglob("*")]:
        try:
            path.chmod(stat.S_IMODE(path.lstat().st_mode) | 0o700)
        except FileNotFoundError:
            pass


class CapabilityBundleTests(unittest.TestCase):
    maxDiff = None

    @classmethod
    def setUpClass(cls) -> None:
        for required in [
            BUILD / "controller",
            BUILD / "Controller.swift",
            BUILD / "payload",
            BUILD / "payload.tar.gz",
            BUILD / "expected-install-manifest.json",
            BUILD / "legacy-v1-observed-manifest.json",
            BUILD / "release-envelope.json",
        ]:
            if not required.exists():
                raise AssertionError(f"build output is absent: {required}")
        run(
            "/usr/bin/python3",
            ENVELOPE_TOOL,
            "verify",
            BUNDLE,
            BUILD / "release-envelope.json",
        )

    def test_registry_is_closed_and_covers_p01_through_p12(self) -> None:
        registry = json.loads((BUNDLE / "config/capability-registry.json").read_text())
        self.assertEqual(
            set(registry),
            {
                "schemaVersion",
                "projectKey",
                "controllerVersion",
                "approvedPacket",
                "canonicalRemote",
                "principal",
                "executionIdentity",
                "operations",
                "roles",
                "phases",
                "fixedPaths",
                "requestLimits",
            },
        )
        self.assertEqual(registry["principal"], {"user": "thirdfacedev", "uid": 501})
        self.assertEqual(registry["operations"], ["arm", "verify"])
        self.assertEqual([phase["id"] for phase in registry["phases"]], PHASES)
        self.assertEqual(len({phase["plan"] for phase in registry["phases"]}), 12)

    def test_request_schema_is_closed_and_phase_generic(self) -> None:
        schema = json.loads((BUNDLE / "config/request-schema.json").read_text())
        self.assertEqual(len(schema["oneOf"]), 2)
        for branch in schema["oneOf"]:
            self.assertFalse(branch["additionalProperties"])
            self.assertEqual(branch["properties"]["phase"]["enum"], PHASES)
            self.assertEqual(
                branch["properties"]["projectKey"]["const"], "InterviewCopilot"
            )
            self.assertEqual(
                branch["properties"]["approvedPacketSha"]["const"],
                "02ee6ddec78d6e4ea9e2de3c0303ffd6bc9f45bf",
            )

    def test_sudoers_binds_one_principal_and_empty_arguments(self) -> None:
        lines = (BUNDLE / "config/sudoers").read_text().splitlines()
        self.assertEqual(len(lines), 2)
        for line in lines:
            self.assertTrue(line.startswith("thirdfacedev ALL=(root) NOPASSWD: "))
            self.assertTrue(line.endswith(' ""'))
            self.assertNotIn("%admin", line)
            self.assertNotIn("*", line)
        run("/usr/sbin/visudo", "-cf", BUNDLE / "config/sudoers")

    def test_rendered_controller_has_no_p01_only_admission(self) -> None:
        source = (BUILD / "Controller.swift").read_text()
        forbidden = [
            'options["phase"] == "P01"',
            "refs/controller/P01",
            "P01-local.lock",
            "CONTROLLER phase=P01",
            "ARMED phase=P01",
        ]
        for text in forbidden:
            self.assertNotIn(text, source)
        self.assertIn("phaseIDs.contains(phase)", source)
        self.assertIn("arguments.isEmpty", source)
        self.assertIn("readCapabilityRequest", source)
        self.assertIn("requestOwnerUID: uid_t = 501", source)
        self.assertIn("expected-install-manifest.json", source)
        self.assertNotIn("controller-install.json", source)
        self.assertIn("_ = try installedPreflight()", source)
        self.assertIn("enforcePhaseDependencies", source)
        self.assertIn("controllerRoot)/receipts", source)
        self.assertIn("let traversableRunAncestors =", source)
        self.assertIn("chmod(path, 0o711)", source)
        self.assertIn('"merge-base", "--is-ancestor"', source)
        self.assertIn("phaseDependencies[id] == dependencies", source)
        self.assertIn("errno != ENOENT", source)
        self.assertNotIn('"package.json": "', source)
        self.assertNotIn('"package-lock.json": "', source)
        self.assertNotIn('"tests/policy/', source)
        self.assertIn('"scripts/verification/plans/P12.json"', source)
        for phase in PHASES:
            self.assertIn(f'"{phase}"', source)

    def test_run_ancestor_traversal_boundary_is_real(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            root = pathlib.Path(temporary_text)
            ancestor = root / "runs"
            leaf = ancestor / "commit/P01/run"
            leaf.mkdir(parents=True)
            for path in [ancestor / "commit", ancestor / "commit/P01", leaf]:
                path.chmod(0o711)
            ancestor.chmod(0o000)
            with self.assertRaises(PermissionError):
                subprocess.run(
                    ["/bin/pwd"],
                    cwd=leaf,
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
            ancestor.chmod(0o711)
            result = subprocess.run(
                ["/bin/pwd"],
                cwd=leaf,
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            self.assertEqual(result.returncode, 0)
            self.assertEqual(
                stat.S_IMODE(ancestor.stat().st_mode), 0o711
            )

    def test_script_policy_npmrc_and_authentication_boundary_are_closed(self) -> None:
        source = (BUILD / "Controller.swift").read_text()
        targets = {
            "build",
            "build:runtime",
            "clean",
            "lint",
            "package:mac",
            "qualify:meet",
            "test:audio-native",
            "test:audio-retention",
            "test:behavioral-fixtures",
            "test:coding-fixtures",
            "test:e2e-macos",
            "test:electron-shell",
            "test:history-roundtrip",
            "test:legacy",
            "test:p01",
            "test:p02",
            "test:p03",
            "test:p04",
            "test:p05",
            "test:p06",
            "test:p07",
            "test:p08",
            "test:p09",
            "test:p10",
            "test:p11",
            "test:p12",
            "test:plaintext-scan",
            "test:prompt-adversarial",
            "test:staff-live-corpus",
            "test:system-design-fixtures",
            "test:unit",
            "typecheck",
            "verify:diagnostics",
            "verify:mac-package",
            "verify:package-inventory",
            "verify:policy",
            "verify:release",
            "verify:test-manifest",
        }
        policy_block = source[
            source.index("let approvedPackageScripts:")
            : source.index("let approvedInputDigests:")
        ]
        observed = set(re.findall(r'^    "([^"]+)": "', policy_block, re.MULTILINE))
        self.assertEqual(observed, targets)
        self.assertIn("actualScript == expectedScript", source)
        self.assertIn("while let target = pendingScriptTargets.popLast()", source)
        self.assertIn(
            "transitive package script policy is absent for", source
        )
        self.assertIn("let mappedLifecycle = approvedPackageScripts.keys.flatMap", source)
        self.assertIn("genericLifecycle + phaseLifecycle + mappedLifecycle", source)
        self.assertIn(
            '"npm_config_userconfig": "\\(installRoot)/config/npmrc"', source
        )
        self.assertNotIn(
            '"npm_config_userconfig": "\\(installRoot)/toolchain/npmrc"', source
        )
        self.assertIn("let receivesAuthenticationSecret =", source)
        self.assertIn('planned[2].hasPrefix("test:")', source)
        self.assertIn('planned[2].hasPrefix("qualify:")', source)
        self.assertIn(
            'counts = ["passed": 1, "failed": 0, "skipped": 0]', source
        )
        self.assertLess(
            source.index("let receivesAuthenticationSecret ="),
            source.index('"authenticationKey": authenticationKey'),
        )

        policy = {
            match.group(1): match.group(2)
            for match in re.finditer(
                r'^    "([^"]+)": "([^"]*)",?$',
                policy_block,
                re.MULTILINE,
            )
        }
        def transitive_closure(roots: set[str]) -> set[str]:
            pending = list(roots)
            observed_targets: set[str] = set()
            while pending:
                target = pending.pop()
                if target in observed_targets:
                    continue
                self.assertIn(target, policy)
                observed_targets.add(target)
                pending.extend(
                    re.findall(r"\bnpm run ([A-Za-z0-9:_-]+)", policy[target])
                )
            return observed_targets

        self.assertEqual(
            transitive_closure({"build"}),
            {
                "build",
                "build:runtime",
                "clean",
                "verify:package-inventory",
            },
        )
        self.assertEqual(
            transitive_closure({"package:mac"}),
            {
                "package:mac",
                "build",
                "build:runtime",
                "clean",
                "verify:package-inventory",
            },
        )
        redirected = dict(policy)
        redirected["verify:policy"] = "node /tmp/forged-result.mjs"
        self.assertNotEqual(
            redirected["verify:policy"], policy["verify:policy"]
        )

    def test_compiled_wrapper_rejects_arguments_before_sudo(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            wrapper = pathlib.Path(temporary_text) / "arm-phase"
            wrapper.symlink_to(BUILD / "payload/bin/arm-phase")
            result = run(wrapper, "unexpected", check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("accept no command arguments", result.stderr)

    def test_admin_handoff_bootstraps_only_root_owned_verified_code(self) -> None:
        command = (BUILD / "admin-handoff.txt").read_text()
        envelope = json.loads((BUILD / "release-envelope.json").read_text())
        self.assertTrue(command.startswith("/usr/bin/sudo /bin/zsh -c "))
        self.assertIn("verification-controller-bootstrap", command)
        for relative in [
            "source/install.sh",
            "tools/envelope.py",
            "tools/manifest.py",
            "build/release-envelope.json",
            "build/payload.tar.gz",
        ]:
            self.assertIn(relative, command)
            self.assertIn(sha256(BUNDLE / relative), command)
        self.assertIn(
            sha256(BUILD / "release-envelope.json"),
            command,
        )
        self.assertIn("envelopeVerifier", envelope["members"])
        self.assertIn("manifestVerifier", envelope["members"])
        self.assertIn("upgradeStateVerifier", envelope["members"])

    def test_request_writer_is_closed_atomic_and_negative(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            root = pathlib.Path(temporary_text) / "requests"
            root.mkdir(mode=0o700)
            writer = BUNDLE / "tools/write-request.py"
            head = "1" * 40
            result = run(
                "/usr/bin/python3",
                writer,
                "arm",
                "P01",
                "--pr",
                "155",
                "--expected-head",
                head,
                "--test-request-root",
                root,
            )
            self.assertEqual(result.returncode, 0)
            request = root / "arm.json"
            self.assertEqual(stat.S_IMODE(request.stat().st_mode), 0o400)
            document = json.loads(request.read_text())
            self.assertEqual(
                set(document),
                {
                    "approvedPacketSha",
                    "expectedHead",
                    "nonce",
                    "operation",
                    "phase",
                    "prNumber",
                    "projectKey",
                    "role",
                    "schemaVersion",
                },
            )
            self.assertEqual(document["expectedHead"], head)
            bad = run(
                "/usr/bin/python3",
                writer,
                "verify",
                "P01",
                "--pr",
                "155",
                "--test-request-root",
                root,
                check=False,
            )
            self.assertNotEqual(bad.returncode, 0)

    def test_native_self_test_is_exact(self) -> None:
        report = json.loads((BUILD / "native-self-test.json").read_text())
        self.assertEqual(len(report["cases"]), 2)
        self.assertTrue(all(case["result"] == "PASS" for case in report["cases"]))
        self.assertEqual(report["negativeControl"]["rawExits"], [7, 0])
        self.assertEqual(report["negativeControl"]["aggregateExit"], 1)

    def test_complete_payload_manifest_and_envelope(self) -> None:
        run(
            "/usr/bin/python3",
            MANIFEST_TOOL,
            "verify",
            BUILD / "payload",
            BUILD / "expected-install-manifest.json",
            "--allow-source-provenance",
        )
        envelope = json.loads((BUILD / "release-envelope.json").read_text())
        self.assertEqual(envelope["artifactId"], "P00-V2-CAP-A02")
        self.assertEqual(
            envelope["members"]["expectedInstallManifest"]["sha256"],
            sha256(BUILD / "expected-install-manifest.json"),
        )
        self.assertEqual(
            envelope["members"]["legacyV1ObservedManifest"]["sha256"],
            sha256(BUILD / "legacy-v1-observed-manifest.json"),
        )
        self.assertEqual(
            envelope["members"]["payloadArchive"]["sha256"],
            sha256(BUILD / "payload.tar.gz"),
        )
        self.assertTrue((BUILD / "payload/libexec/quiesce.py").is_file())
        self.assertTrue((BUILD / "payload/libexec/upgrade-state.py").is_file())

    def test_quiescence_rejects_held_phase_lock(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            root = pathlib.Path(temporary_text)
            controller_root = root / "controller"
            install_root = root / "v2"
            locks = controller_root / "locks"
            locks.mkdir(parents=True)
            lock = locks / "P01-local.lock"
            holder = subprocess.Popen(
                [
                    "/usr/bin/python3",
                    "-c",
                    (
                        "import fcntl, os, sys;"
                        "fd=os.open(sys.argv[1],os.O_RDWR|os.O_CREAT,0o600);"
                        "fcntl.flock(fd,fcntl.LOCK_EX);"
                        "print('ready',flush=True);"
                        "sys.stdin.read()"
                    ),
                    str(lock),
                ],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            try:
                self.assertEqual(holder.stdout.readline().strip(), "ready")
                blocked = run(
                    "/usr/bin/python3",
                    BUNDLE / "tools/quiesce.py",
                    controller_root,
                    install_root,
                    check=False,
                )
                self.assertNotEqual(blocked.returncode, 0)
                self.assertIn("active controller lock", blocked.stderr)
            finally:
                assert holder.stdin is not None
                holder.stdin.close()
                holder.wait(timeout=5)
                assert holder.stdout is not None
                assert holder.stderr is not None
                holder.stdout.close()
                holder.stderr.close()
            released = run(
                "/usr/bin/python3",
                BUNDLE / "tools/quiesce.py",
                controller_root,
                install_root,
                check=False,
            )
            self.assertEqual(released.returncode, 0, released.stderr)
            core = install_root / "libexec/verify-phase-core"
            core.parent.mkdir(parents=True)
            core.write_text("#!/bin/sh\n/bin/sleep 30\n")
            core.chmod(0o555)
            active = subprocess.Popen(
                [str(core)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            try:
                detected = run(
                    "/usr/bin/python3",
                    BUNDLE / "tools/quiesce.py",
                    controller_root,
                    install_root,
                    check=False,
                )
                self.assertNotEqual(detected.returncode, 0)
                self.assertIn("active controller process", detected.stderr)
            finally:
                active.terminate()
                active.wait(timeout=5)
            revoker = (BUNDLE / "source/revoke.sh").read_text()
            self.assertLess(
                revoker.index('if [[ -e "$sudoers_target" ]]'),
                revoker.index(
                    '/usr/bin/python3 "$quiesce_tool" "$controller_root"'
                ),
            )

    def test_manifest_rejects_byte_extra_mode_link_xattr_and_acl_mutations(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary) / "root"
            root.mkdir(mode=0o755)
            file = root / "member"
            file.write_text("trusted\n")
            file.chmod(0o444)
            root.chmod(0o555)
            manifest = pathlib.Path(temporary) / "manifest.json"
            run(
                "/usr/bin/python3",
                MANIFEST_TOOL,
                "generate",
                root,
                manifest,
                "--allow-source-provenance",
            )
            run(
                "/usr/bin/python3",
                MANIFEST_TOOL,
                "verify",
                root,
                manifest,
                "--allow-source-provenance",
            )

            file.chmod(0o644)
            file.write_text("changed\n")
            file.chmod(0o444)
            self.assertNotEqual(
                run(
                    "/usr/bin/python3",
                    MANIFEST_TOOL,
                    "verify",
                    root,
                    manifest,
                    "--allow-source-provenance",
                    check=False,
                ).returncode,
                0,
            )
            file.chmod(0o644)
            file.write_text("trusted\n")
            file.chmod(0o444)

            root.chmod(0o755)
            extra = root / "extra"
            extra.write_text("extra\n")
            extra.chmod(0o444)
            root.chmod(0o555)
            self.assertNotEqual(
                run(
                    "/usr/bin/python3",
                    MANIFEST_TOOL,
                    "verify",
                    root,
                    manifest,
                    "--allow-source-provenance",
                    check=False,
                ).returncode,
                0,
            )
            root.chmod(0o755)
            extra.unlink()
            root.chmod(0o555)

            file.chmod(0o644)
            self.assertNotEqual(
                run(
                    "/usr/bin/python3",
                    MANIFEST_TOOL,
                    "verify",
                    root,
                    manifest,
                    "--allow-source-provenance",
                    check=False,
                ).returncode,
                0,
            )
            file.chmod(0o444)

            root.chmod(0o755)
            link = root / "link"
            link.symlink_to("member")
            root.chmod(0o555)
            self.assertNotEqual(
                run(
                    "/usr/bin/python3",
                    MANIFEST_TOOL,
                    "verify",
                    root,
                    manifest,
                    "--allow-source-provenance",
                    check=False,
                ).returncode,
                0,
            )
            root.chmod(0o755)
            link.unlink()
            root.chmod(0o555)

            file.chmod(0o644)
            run("/usr/bin/xattr", "-w", "dev.timofey.test", "1", file)
            file.chmod(0o444)
            self.assertNotEqual(
                run(
                    "/usr/bin/python3",
                    MANIFEST_TOOL,
                    "verify",
                    root,
                    manifest,
                    "--allow-source-provenance",
                    check=False,
                ).returncode,
                0,
            )
            file.chmod(0o644)
            run("/usr/bin/xattr", "-d", "dev.timofey.test", file)
            file.chmod(0o444)

            acl = run(
                "/bin/chmod",
                "+a",
                f"{os.environ['USER']} allow write",
                file,
                check=False,
            )
            if acl.returncode == 0:
                self.assertNotEqual(
                    run(
                        "/usr/bin/python3",
                        MANIFEST_TOOL,
                        "verify",
                        root,
                        manifest,
                        "--allow-source-provenance",
                        check=False,
                    ).returncode,
                    0,
                )
                run("/bin/chmod", "-N", file)

    def prepare_legacy_root(self, temporary: pathlib.Path) -> pathlib.Path:
        test_root = temporary / "system"
        v1 = (
            test_root
            / "Users/Shared/InterviewCopilot/verification-controller/v1"
        )
        v1.parent.mkdir(parents=True)
        run("/usr/bin/ditto", LEGACY_ROOT, v1)
        sudoers = (
            test_root
            / "etc/sudoers.d/interviewcopilot-verification-controller"
        )
        sudoers.parent.mkdir(parents=True)
        shutil.copyfile(LEGACY_SUDOERS, sudoers)
        sudoers.chmod(0o440)
        return test_root

    def install(self, test_root: pathlib.Path, **extra: str) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment["P00_V2_TEST_ROOT"] = str(test_root)
        environment["P00_V2_TEST_ALLOW_FRESH_INSTALL"] = "1"
        environment.update(extra)
        return run(
            "/bin/zsh",
            BUNDLE / "source/install.sh",
            BUNDLE,
            sha256(BUILD / "release-envelope.json"),
            env=environment,
            check=False,
        )

    def install_a01(self, test_root: pathlib.Path) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment["P00_V2_TEST_ROOT"] = str(test_root)
        result = run(
            "/bin/zsh",
            A01_BUNDLE / "source/install.sh",
            A01_BUNDLE,
            sha256(A01_BUNDLE / "build/release-envelope.json"),
            env=environment,
            check=False,
        )
        if result.returncode == 0:
            metadata = (
                test_root
                / "Users/Shared/InterviewCopilot/verification-controller/metadata/"
                "P00-V2-CAP-A01"
            )
            make_writable(metadata)
            run(
                "/usr/bin/xattr",
                "-cr",
                metadata,
            )
            for member in metadata.iterdir():
                member.chmod(0o444)
            metadata.chmod(0o755)
            sudoers = (
                test_root
                / "etc/sudoers.d/interviewcopilot-verification-controller"
            )
            sudoers.chmod(0o600)
            run(
                "/usr/bin/xattr",
                "-cr",
                sudoers,
            )
            sudoers.chmod(0o440)
        return result

    def test_atomic_upgrade_from_exact_a01_preserves_state(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                installed_a01 = self.install_a01(test_root)
                self.assertEqual(installed_a01.returncode, 0, installed_a01.stderr)
                controller = (
                    test_root
                    / "Users/Shared/InterviewCopilot/verification-controller"
                )
                state_marker = controller / "anchors/preserved-state"
                state_marker.parent.mkdir(exist_ok=True)
                state_marker.write_text("preserve\n")
                request_root = controller / "requests/501"
                run(
                    "/usr/bin/python3",
                    BUNDLE / "tools/write-request.py",
                    "arm",
                    "P01",
                    "--pr",
                    "155",
                    "--expected-head",
                    "1" * 40,
                    "--test-request-root",
                    request_root,
                )
                run(
                    "/usr/bin/python3",
                    BUNDLE / "tools/write-request.py",
                    "verify",
                    "P01",
                    "--test-request-root",
                    request_root,
                )
                request_facts = {
                    path.name: (
                        sha256(path),
                        path.stat().st_uid,
                        stat.S_IMODE(path.stat().st_mode),
                    )
                    for path in request_root.iterdir()
                }
                historical_run = (
                    controller
                    / "runs"
                    / ("1" * 40)
                    / "P01"
                    / ("2" * 32)
                )
                historical_repo = historical_run / "repo"
                historical_repo.mkdir(parents=True)
                historical_file = historical_repo / "package.json"
                historical_file.write_text('{"preserved":true}\n')
                for path in [
                    historical_run.parent.parent,
                    historical_run.parent,
                    historical_run,
                    historical_repo,
                ]:
                    path.chmod(0o755)
                historical_file.chmod(0o644)
                upgraded = self.install(test_root)
                self.assertEqual(upgraded.returncode, 0, upgraded.stderr)
                self.assertTrue(state_marker.is_file())
                self.assertEqual(state_marker.read_text(), "preserve\n")
                self.assertTrue(
                    (controller / "metadata/P00-V2-CAP-A01").is_dir()
                )
                self.assertTrue(
                    (controller / "metadata/P00-V2-CAP-A02").is_dir()
                )
                self.assertEqual(
                    stat.S_IMODE((controller / "runs").stat().st_mode), 0o711
                )
                for path in [
                    historical_run.parent.parent,
                    historical_run.parent,
                    historical_run,
                ]:
                    self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o711)
                self.assertEqual(
                    stat.S_IMODE(historical_repo.stat().st_mode), 0o700
                )
                self.assertEqual(
                    stat.S_IMODE(historical_file.stat().st_mode), 0o600
                )
                self.assertEqual(
                    historical_file.read_text(), '{"preserved":true}\n'
                )
                self.assertEqual(
                    {
                        path.name: (
                            sha256(path),
                            path.stat().st_uid,
                            stat.S_IMODE(path.stat().st_mode),
                        )
                        for path in request_root.iterdir()
                    },
                    request_facts,
                )
                self.assertFalse(
                    any(controller.glob(".v2-before-P00-V2-CAP-A02.*"))
                )
                rendered = (
                    controller / "v2/libexec/verify-phase-core"
                ).read_bytes()
                self.assertEqual(
                    hashlib.sha256(rendered).hexdigest(),
                    sha256(BUILD / "controller"),
                )
            finally:
                make_writable(temporary)

    def test_upgrade_failure_restores_exact_a01_without_authorization(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                installed_a01 = self.install_a01(test_root)
                self.assertEqual(installed_a01.returncode, 0, installed_a01.stderr)
                controller = (
                    test_root
                    / "Users/Shared/InterviewCopilot/verification-controller"
                )
                old_controller_sha = sha256(
                    controller / "v2/libexec/verify-phase-core"
                )
                failed = self.install(
                    test_root,
                    P00_V2_TEST_FAIL_AFTER_NEW_AUTHORIZATION="1",
                )
                self.assertNotEqual(failed.returncode, 0)
                self.assertFalse(
                    (
                        test_root
                        / "etc/sudoers.d/interviewcopilot-verification-controller"
                    ).exists()
                )
                self.assertEqual(
                    sha256(controller / "v2/libexec/verify-phase-core"),
                    old_controller_sha,
                )
                self.assertTrue(
                    (controller / "metadata/P00-V2-CAP-A01").is_dir()
                )
                self.assertFalse(
                    (controller / "metadata/P00-V2-CAP-A02").exists()
                )
                self.assertFalse(
                    any(controller.glob(".v2-before-P00-V2-CAP-A02.*"))
                )
            finally:
                make_writable(temporary)

    def test_upgrade_rejects_incomplete_a01_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                installed_a01 = self.install_a01(test_root)
                self.assertEqual(installed_a01.returncode, 0, installed_a01.stderr)
                controller = (
                    test_root
                    / "Users/Shared/InterviewCopilot/verification-controller"
                )
                sudoers = (
                    test_root
                    / "etc/sudoers.d/interviewcopilot-verification-controller"
                )
                sudoers.chmod(0o600)
                wrong_mode = self.install(test_root)
                self.assertNotEqual(wrong_mode.returncode, 0)
                self.assertIn("filesystem contract disagreement", wrong_mode.stderr)
                sudoers.chmod(0o440)
                sudoers.unlink()
                metadata = controller / "metadata/P00-V2-CAP-A01"
                (metadata / "installed-self-test.json").unlink()
                (metadata / "legacy-v1-observed-manifest.json").unlink()
                incomplete = self.install(test_root)
                self.assertNotEqual(incomplete.returncode, 0)
                self.assertFalse((controller / "metadata/P00-V2-CAP-A02").exists())
                self.assertEqual(
                    sha256(controller / "v2/libexec/verify-phase-core"),
                    sha256(A01_BUNDLE / "build/controller"),
                )
            finally:
                make_writable(temporary)

    def test_upgrade_rejects_held_a01_phase_lock(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                installed_a01 = self.install_a01(test_root)
                self.assertEqual(installed_a01.returncode, 0, installed_a01.stderr)
                controller = (
                    test_root
                    / "Users/Shared/InterviewCopilot/verification-controller"
                )
                lock = controller / "locks/P01-local.lock"
                holder = subprocess.Popen(
                    [
                        "/usr/bin/python3",
                        "-c",
                        (
                            "import fcntl,os,sys;"
                            "fd=os.open(sys.argv[1],os.O_RDWR|os.O_CREAT,0o600);"
                            "fcntl.flock(fd,fcntl.LOCK_EX);"
                            "print('ready',flush=True);sys.stdin.read()"
                        ),
                        str(lock),
                    ],
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                try:
                    self.assertEqual(holder.stdout.readline().strip(), "ready")
                    blocked = self.install(test_root)
                finally:
                    assert holder.stdin is not None
                    holder.stdin.close()
                    holder.wait(timeout=5)
                    assert holder.stdout is not None
                    assert holder.stderr is not None
                    holder.stdout.close()
                    holder.stderr.close()
                self.assertNotEqual(blocked.returncode, 0)
                self.assertIn("quiescence admission failed", blocked.stderr)
                self.assertFalse(
                    (
                        test_root
                        / "etc/sudoers.d/interviewcopilot-verification-controller"
                    ).exists()
                )
                self.assertEqual(
                    sha256(controller / "v2/libexec/verify-phase-core"),
                    sha256(A01_BUNDLE / "build/controller"),
                )
                self.assertFalse((controller / "metadata/P00-V2-CAP-A02").exists())
            finally:
                make_writable(temporary)

    def test_fresh_v1_path_requires_explicit_test_fixture_flag(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            environment = os.environ.copy()
            environment["P00_V2_TEST_ROOT"] = str(test_root)
            rejected = run(
                "/bin/zsh",
                BUNDLE / "source/install.sh",
                BUNDLE,
                sha256(BUILD / "release-envelope.json"),
                env=environment,
                check=False,
            )
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn(
                "A02 requires the exact installed A01 capability",
                rejected.stderr,
            )
            self.assertFalse(
                (
                    test_root
                    / "Users/Shared/InterviewCopilot/verification-controller/v2"
                ).exists()
            )

    def test_install_revoke_cleanup_and_idempotence(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                installed = self.install(test_root)
                self.assertEqual(installed.returncode, 0, installed.stderr)
                sudoers = (
                    test_root
                    / "etc/sudoers.d/interviewcopilot-verification-controller"
                )
                self.assertEqual(sudoers.read_bytes(), (BUNDLE / "config/sudoers").read_bytes())
                self.assertTrue(
                    (
                        test_root
                        / "Users/Shared/InterviewCopilot/verification-controller/v1"
                    ).is_dir()
                )
                rerun = self.install(test_root)
                self.assertNotEqual(rerun.returncode, 0)

                installed_revoker = (
                    test_root
                    / "Users/Shared/InterviewCopilot/verification-controller/"
                    "v2/libexec/revoke-controller"
                )
                environment = os.environ.copy()
                environment["P00_V2_TEST_ROOT"] = str(test_root)
                revoked = run(
                    "/bin/zsh",
                    installed_revoker,
                    env=environment,
                    check=False,
                )
                self.assertEqual(revoked.returncode, 0, revoked.stderr)
                self.assertFalse(sudoers.exists())
                controller = (
                    test_root
                    / "Users/Shared/InterviewCopilot/verification-controller"
                )
                self.assertFalse((controller / "v1").exists())
                self.assertFalse((controller / "v2").exists())
                retention = (
                    test_root
                    / "Users/Shared/InterviewCopilot/revocation-receipts/"
                    "P00-V2-CAP-A02-evidence"
                )
                self.assertTrue((retention / "state/metadata.tar.gz").is_file())
                self.assertTrue((retention / "retention-index.tsv").is_file())
                rows = dict(
                    line.split("\t", 1)
                    for line in (retention / "retention-index.tsv")
                    .read_text()
                    .splitlines()[1:]
                )
                self.assertEqual(
                    rows["metadata"],
                    sha256(retention / "state/metadata.tar.gz"),
                )
                tombstone = (
                    test_root
                    / "Users/Shared/InterviewCopilot/revocation-receipts/"
                    "revoke-controller"
                )
                second = run(
                    "/bin/zsh", tombstone, env=environment, check=False
                )
                self.assertEqual(second.returncode, 0, second.stderr)
            finally:
                make_writable(temporary)

    def test_install_rollback_never_restores_legacy_authorization(self) -> None:
        for variable in [
            "P00_V2_TEST_FAIL_AFTER_AUTH_REMOVAL",
            "P00_V2_TEST_FAIL_AFTER_NEW_AUTHORIZATION",
        ]:
            with self.subTest(variable=variable), tempfile.TemporaryDirectory() as temporary_text:
                temporary = pathlib.Path(temporary_text)
                test_root = self.prepare_legacy_root(temporary)
                try:
                    result = self.install(test_root, **{variable: "1"})
                    self.assertNotEqual(result.returncode, 0)
                    sudoers = (
                        test_root
                        / "etc/sudoers.d/interviewcopilot-verification-controller"
                    )
                    self.assertFalse(sudoers.exists())
                    self.assertFalse(
                        (
                            test_root
                            / "Users/Shared/InterviewCopilot/verification-controller/v2"
                        ).exists()
                    )
                    self.assertTrue(
                        (
                            test_root
                            / "Users/Shared/InterviewCopilot/verification-controller/v1"
                        ).is_dir()
                    )
                finally:
                    make_writable(temporary)

    def test_revocation_mismatch_removes_authorization_and_preserves_forensics(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                installed = self.install(test_root)
                self.assertEqual(installed.returncode, 0, installed.stderr)
                controller = (
                    test_root
                    / "Users/Shared/InterviewCopilot/verification-controller"
                )
                target = controller / "v2/config/npmrc"
                target.chmod(0o644)
                target.write_text("tampered=true\n")
                target.chmod(0o444)
                environment = os.environ.copy()
                environment["P00_V2_TEST_ROOT"] = str(test_root)
                result = run(
                    "/bin/zsh",
                    controller / "v2/libexec/revoke-controller",
                    env=environment,
                    check=False,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(
                    (
                        test_root
                        / "etc/sudoers.d/interviewcopilot-verification-controller"
                    ).exists()
                )
                self.assertTrue((controller / "v2").exists())
                self.assertTrue((controller / "v1").exists())
            finally:
                make_writable(temporary)

    def test_revocation_metadata_drift_removes_authorization_first(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                installed = self.install(test_root)
                self.assertEqual(installed.returncode, 0, installed.stderr)
                controller = (
                    test_root
                    / "Users/Shared/InterviewCopilot/verification-controller"
                )
                metadata = controller / "metadata/P00-V2-CAP-A02"
                make_writable(metadata)
                (metadata / "approved-envelope.sha256").unlink()
                environment = os.environ.copy()
                environment["P00_V2_TEST_ROOT"] = str(test_root)
                result = run(
                    "/bin/zsh",
                    controller / "v2/libexec/revoke-controller",
                    env=environment,
                    check=False,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(
                    (
                        test_root
                        / "etc/sudoers.d/interviewcopilot-verification-controller"
                    ).exists()
                )
                self.assertTrue((controller / "v2").exists())
                self.assertTrue((controller / "v1").exists())
            finally:
                make_writable(temporary)

    def test_revocation_sudoers_drift_is_removed_and_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                installed = self.install(test_root)
                self.assertEqual(installed.returncode, 0, installed.stderr)
                sudoers = (
                    test_root
                    / "etc/sudoers.d/interviewcopilot-verification-controller"
                )
                sudoers.chmod(0o640)
                sudoers.write_text("tampered authorization\n")
                sudoers.chmod(0o440)
                controller = (
                    test_root
                    / "Users/Shared/InterviewCopilot/verification-controller"
                )
                environment = os.environ.copy()
                environment["P00_V2_TEST_ROOT"] = str(test_root)
                result = run(
                    "/bin/zsh",
                    controller / "v2/libexec/revoke-controller",
                    env=environment,
                    check=False,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(sudoers.exists())
                preserved = list(
                    (
                        test_root
                        / "Users/Shared/InterviewCopilot/revocation-receipts"
                    ).glob("P00-V2-CAP-A02-sudoers.removed.*")
                )
                self.assertEqual(len(preserved), 1)
                self.assertEqual(
                    preserved[0].read_text(), "tampered authorization\n"
                )
                self.assertTrue((controller / "v2").exists())
            finally:
                make_writable(temporary)


if __name__ == "__main__":
    unittest.main(verbosity=2)
