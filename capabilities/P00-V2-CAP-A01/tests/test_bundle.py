#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import shutil
import stat
import subprocess
import tempfile
import unittest


BUNDLE = pathlib.Path(__file__).resolve().parents[1]
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
        for phase in PHASES:
            self.assertIn(f'"{phase}"', source)

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
        self.assertEqual(len(report["cases"]), 15)
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
        self.assertEqual(envelope["artifactId"], "P00-V2-CAP-A01")
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
        environment.update(extra)
        return run(
            "/bin/zsh",
            BUNDLE / "source/install.sh",
            BUNDLE,
            sha256(BUILD / "release-envelope.json"),
            env=environment,
            check=False,
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
