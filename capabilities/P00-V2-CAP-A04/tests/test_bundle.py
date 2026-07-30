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
LIVE_LEGACY_CONTROLLER = pathlib.Path(
    "/Users/Shared/InterviewCopilot/verification-controller/v2/libexec/verify-phase-core"
)
LIVE_LEGACY_RECEIPT = pathlib.Path(
    "/Users/Shared/InterviewCopilot/verification-controller/recovery-receipts/"
    "P00-V2-CAP-A03-RECOVERY-03.json"
)
CANDIDATE = "2e5045116db6e3c5f6e6cc18b70df6d7fa021baf"


def run(*arguments: object, env: dict[str, str] | None = None, check: bool = True):
    return subprocess.run(
        [str(value) for value in arguments],
        env=env,
        check=check,
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
        for path in [
            BUILD / "controller",
            BUILD / "Controller.swift",
            BUILD / "payload.tar.gz",
            BUILD / "expected-install-manifest.json",
            BUILD / "release-envelope.json",
            BUILD / "admin-handoff.txt",
        ]:
            if not path.is_file():
                raise AssertionError(f"build output absent: {path}")
        run(
            "/usr/bin/python3", BUNDLE / "tools/envelope.py", "verify",
            BUNDLE, BUILD / "release-envelope.json",
        )

    def fixture(self, root: pathlib.Path) -> tuple[dict[str, tuple], dict[str, str]]:
        legacy = root / "Users/Shared/InterviewCopilot/verification-controller"
        controller = legacy / "v2/libexec/verify-phase-core"
        receipt = legacy / "recovery-receipts/P00-V2-CAP-A03-RECOVERY-03.json"
        controller.parent.mkdir(parents=True)
        receipt.parent.mkdir(parents=True)
        shutil.copyfile(LIVE_LEGACY_CONTROLLER, controller)
        shutil.copyfile(LIVE_LEGACY_RECEIPT, receipt)
        history = legacy / "runs/historical"
        history.mkdir(parents=True)
        outside = legacy / "outside-esbuild"
        outside.write_bytes(b"historical bytes\n")
        hardlink = history / "two-link-esbuild"
        os.link(outside, hardlink)
        symlink = history / "archived-symlink"
        symlink.symlink_to("../../outside-esbuild")
        paths = [legacy, controller, receipt, history, outside, hardlink, symlink]
        facts = {
            str(path.relative_to(root)): (
                path.lstat().st_dev, path.lstat().st_ino, path.lstat().st_uid,
                path.lstat().st_gid, path.lstat().st_mode, path.lstat().st_nlink,
                path.lstat().st_size, path.lstat().st_mtime_ns,
                os.readlink(path) if path.is_symlink() else None,
            )
            for path in paths
        }
        hashes = {
            str(path.relative_to(root)): sha256(path)
            for path in [controller, receipt, outside, hardlink]
        }
        return facts, hashes

    def assert_fixture_unchanged(
        self, root: pathlib.Path, facts: dict[str, tuple], hashes: dict[str, str]
    ) -> None:
        for relative, expected in facts.items():
            path = root / relative
            info = path.lstat()
            observed = (
                info.st_dev, info.st_ino, info.st_uid, info.st_gid, info.st_mode,
                info.st_nlink, info.st_size, info.st_mtime_ns,
                os.readlink(path) if path.is_symlink() else None,
            )
            self.assertEqual(observed, expected, relative)
        for relative, expected in hashes.items():
            self.assertEqual(sha256(root / relative), expected, relative)

    def invoke_install(
        self, root: pathlib.Path, extra: dict[str, str] | None = None
    ):
        env = dict(os.environ)
        env["P00_V2_TEST_ROOT"] = str(root)
        env.update(extra or {})
        return run(
            BUNDLE / "source/install.sh", BUNDLE,
            sha256(BUILD / "release-envelope.json"), env=env, check=False,
        )

    def admission(
        self,
        root: pathlib.Path,
        operation: str,
        sudoers: pathlib.Path | None = None,
        check: bool = False,
    ):
        controller_root = (
            root / "Users/Shared/InterviewCopilot/verification-controller-a04"
        )
        receipt_root = (
            root / "Users/Shared/InterviewCopilot/"
            "verification-controller-a04-receipts"
        )
        target = sudoers or (
            root / "etc/sudoers.d/interviewcopilot-verification-controller-a04"
        )
        return run(
            "/usr/bin/python3",
            BUNDLE / "tools/admission.py",
            operation,
            "--controller-root", controller_root,
            "--receipt-root", receipt_root,
            "--sudoers", target,
            "--envelope", sha256(BUILD / "release-envelope.json"),
            "--controller-sha", sha256(BUILD / "controller"),
            "--root-owner", str(os.geteuid()),
            "--root-group", str(os.getegid()),
            "--request-owner", str(os.geteuid()),
            "--request-group", str(os.getegid()),
            "--allow-provenance",
            check=check,
        )

    def receipt_verify(self, root: pathlib.Path, check: bool = False):
        receipt = (
            root / "Users/Shared/InterviewCopilot/"
            "verification-controller-a04-receipts/P00-V2-CAP-A04-activation.json"
        )
        return run(
            "/usr/bin/python3", BUNDLE / "tools/receipt.py", "verify",
            receipt, sha256(BUILD / "release-envelope.json"),
            "--expected-controller-sha", sha256(BUILD / "controller"),
            "--owner", str(os.geteuid()), "--group", str(os.getegid()),
            "--allow-provenance", check=check,
        )

    def test_identity_registry_sudoers_and_controller_are_narrow(self) -> None:
        registry = json.loads((BUNDLE / "config/capability-registry.json").read_text())
        self.assertEqual(registry["controllerVersion"], "P00-V2-CAP-A04")
        self.assertEqual([entry["id"] for entry in registry["phases"]], ["P01"])
        self.assertEqual(
            registry["fixedPaths"]["controllerRoot"],
            "/Users/Shared/InterviewCopilot/verification-controller-a04",
        )
        sudoers = (BUNDLE / "config/sudoers").read_text().splitlines()
        self.assertEqual(len(sudoers), 2)
        for line in sudoers:
            self.assertTrue(line.startswith("thirdfacedev ALL=(root) NOPASSWD: "))
            self.assertTrue(line.endswith(' ""'))
            self.assertNotIn("%admin", line)
            self.assertNotIn("*", line)
            self.assertIn("verification-controller-a04/payload/libexec/", line)
        run("/usr/sbin/visudo", "-cf", BUNDLE / "config/sudoers")
        source = (BUILD / "Controller.swift").read_text()
        self.assertIn('let phaseIDs = Set(["P01"])', source)
        self.assertIn("P00-V2-CAP-A04", source)
        self.assertIn("verification-controller-a04/payload", source)
        self.assertNotIn("P00-V2-CAP-A03", source)
        self.assertNotIn("verification-controller/v2", source)
        self.assertIn(
            '"scripts/verification/plans/P01.json": '
            '"82f641fccb783d2e3ae8f3dbeaa733923c6f808f660866771052e2778d681a73"',
            source,
        )

    def test_envelope_is_closed_and_has_no_migration_tool(self) -> None:
        envelope = json.loads((BUILD / "release-envelope.json").read_text())
        self.assertEqual(envelope["artifactId"], "P00-V2-CAP-A04")
        self.assertEqual(
            set(envelope["members"]),
            {
                "activationJournalTool", "activationReceiptTool",
                "controllerBinary", "envelopeVerifier",
                "expectedInstallManifest", "installer", "manifestVerifier",
                "installedStateAdmissionTool", "nativeSelfTest",
                "payloadArchive", "quiescenceVerifier",
                "registry", "renderedController", "requestSchema",
                "requestWriter", "revokerSource", "sudoers",
            },
        )
        serialized = json.dumps(envelope)
        self.assertNotIn("upgradeState", serialized)
        self.assertNotIn("legacyV1ObservedManifest", serialized)

    def test_installer_never_enumerates_or_mutates_legacy_runs(self) -> None:
        source = (BUNDLE / "source/install.sh").read_text()
        forbidden = [
            'find "$legacy_root"', 'rglob', 'legacy_root/runs', 'controller_root/runs',
            'chmod "$legacy_root"', 'chown "$legacy_root"', 'rm -rf "$legacy_root"',
            "normalize-runs", "upgrade_state",
        ]
        for text in forbidden:
            self.assertNotIn(text, source)
        self.assertIn("legacy_controller=", source)
        self.assertIn("legacy_recovery_receipt=", source)

    def test_success_idempotence_and_revocation_preserve_history(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            facts, hashes = self.fixture(root)
            installed = self.invoke_install(root)
            self.assertEqual(installed.returncode, 0, installed.stderr)
            controller_root = (
                root / "Users/Shared/InterviewCopilot/verification-controller-a04"
            )
            sudoers = (
                root / "etc/sudoers.d/interviewcopilot-verification-controller-a04"
            )
            receipt = (
                root / "Users/Shared/InterviewCopilot/"
                "verification-controller-a04-receipts/P00-V2-CAP-A04-activation.json"
            )
            self.assertTrue(controller_root.is_dir())
            self.assertTrue(sudoers.is_file())
            document = json.loads(receipt.read_text())
            self.assertEqual(document["status"], "SUCCESS")
            self.assertEqual(document["candidateRevision"], CANDIDATE)
            state = (
                root / "Users/Shared/InterviewCopilot/"
                "verification-controller-a04-receipts/"
                "P00-V2-CAP-A04-installed-state.json"
            )
            self.assertEqual(document["installedStateSha256"], sha256(state))
            self.assertEqual(stat.S_IMODE(receipt.stat().st_mode), 0o444)
            self.assertEqual(receipt.stat().st_nlink, 1)
            self.assert_fixture_unchanged(root, facts, hashes)
            again = self.invoke_install(root)
            self.assertEqual(again.returncode, 0, again.stderr)
            env = dict(os.environ, P00_V2_TEST_ROOT=str(root))
            revoked = run(
                controller_root / "payload/libexec/revoke-controller",
                env=env, check=False,
            )
            self.assertEqual(revoked.returncode, 0, revoked.stderr)
            self.assertFalse(controller_root.exists())
            self.assertFalse(sudoers.exists())
            self.assertTrue(receipt.exists())
            retained = (
                root / "Users/Shared/InterviewCopilot/"
                "verification-controller-a04-retained/P00-V2-CAP-A04/"
                "retention-index.tsv"
            )
            self.assertIn(f"activationReceipt\t{sha256(receipt)}", retained.read_text())
            self.assertIn(f"installedState\t{sha256(state)}", retained.read_text())
            self.assert_fixture_unchanged(root, facts, hashes)

    def test_post_authorization_failure_rolls_back_and_is_terminal(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            facts, hashes = self.fixture(root)
            failed = self.invoke_install(root, {"P00_V2_TEST_FAIL_AFTER_AUTH": "1"})
            self.assertEqual(failed.returncode, 91, failed.stderr)
            base = root / "Users/Shared/InterviewCopilot"
            self.assertFalse(
                (base / "verification-controller-a04").exists(), failed.stderr
            )
            self.assertFalse(
                (root / "etc/sudoers.d/interviewcopilot-verification-controller-a04").exists()
            )
            receipt = (
                base / "verification-controller-a04-receipts/"
                "P00-V2-CAP-A04-activation.json"
            )
            self.assertEqual(json.loads(receipt.read_text())["status"], "FAILURE")
            replay = self.invoke_install(root)
            self.assertNotEqual(replay.returncode, 0)
            self.assert_fixture_unchanged(root, facts, hashes)

    def test_hard_interruption_replay_rolls_back_and_closes_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            facts, hashes = self.fixture(root)
            stopped = self.invoke_install(
                root, {"P00_V2_TEST_HARD_STOP_AFTER_AUTH": "1"}
            )
            self.assertEqual(stopped.returncode, 92, stopped.stderr)
            self.assertTrue(
                (root / "Users/Shared/InterviewCopilot/"
                 "verification-controller-a04-receipts/"
                 "P00-V2-CAP-A04-activation.in-progress").exists()
            )
            self.assertTrue(
                (root / "etc/sudoers.d/interviewcopilot-verification-controller-a04").exists()
            )
            self.assertNotEqual(
                self.admission(root, "verify-success").returncode, 0,
                "authorization must be unusable while the journal exists",
            )
            replay = self.invoke_install(root)
            self.assertEqual(replay.returncode, 92, replay.stderr)
            base = root / "Users/Shared/InterviewCopilot"
            self.assertFalse(
                (base / "verification-controller-a04").exists(), replay.stderr
            )
            self.assertFalse(
                (root / "etc/sudoers.d/interviewcopilot-verification-controller-a04").exists()
            )
            receipt = (
                base / "verification-controller-a04-receipts/"
                "P00-V2-CAP-A04-activation.json"
            )
            self.assertEqual(json.loads(receipt.read_text())["status"], "FAILURE")
            self.assert_fixture_unchanged(root, facts, hashes)

    def test_hard_interruption_before_authorization_replays_to_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            facts, hashes = self.fixture(root)
            stopped = self.invoke_install(
                root, {"P00_V2_TEST_HARD_STOP_BEFORE_AUTH": "1"}
            )
            self.assertEqual(stopped.returncode, 90, stopped.stderr)
            self.assertFalse(
                (root / "etc/sudoers.d/interviewcopilot-verification-controller-a04").exists()
            )
            self.assertNotEqual(self.admission(root, "verify-success").returncode, 0)
            replay = self.invoke_install(root)
            self.assertEqual(replay.returncode, 92, replay.stderr)
            receipt = (
                root / "Users/Shared/InterviewCopilot/"
                "verification-controller-a04-receipts/P00-V2-CAP-A04-activation.json"
            )
            self.assertEqual(json.loads(receipt.read_text())["status"], "FAILURE")
            self.assert_fixture_unchanged(root, facts, hashes)

    def test_success_receipt_crash_replays_commit_and_keeps_core_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            facts, hashes = self.fixture(root)
            stopped = self.invoke_install(
                root, {"P00_V2_TEST_HARD_STOP_AFTER_SUCCESS_RECEIPT": "1"}
            )
            self.assertEqual(stopped.returncode, 93, stopped.stderr)
            receipt_root = (
                root / "Users/Shared/InterviewCopilot/"
                "verification-controller-a04-receipts"
            )
            self.assertTrue(
                (receipt_root / "P00-V2-CAP-A04-activation.in-progress").exists()
            )
            self.assertEqual(
                json.loads(
                    (receipt_root / "P00-V2-CAP-A04-activation.json").read_text()
                )["status"],
                "SUCCESS",
            )
            self.assertNotEqual(self.admission(root, "verify-success").returncode, 0)
            self.assertEqual(
                self.admission(root, "verify-committing").returncode, 0
            )
            replay = self.invoke_install(root)
            self.assertEqual(replay.returncode, 0, replay.stderr)
            self.assertFalse(
                (receipt_root / "P00-V2-CAP-A04-activation.in-progress").exists()
            )
            self.assertEqual(self.admission(root, "verify-success").returncode, 0)
            self.assert_fixture_unchanged(root, facts, hashes)

    def test_failure_publication_error_retains_durable_journal(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            facts, hashes = self.fixture(root)
            failed = self.invoke_install(
                root,
                {
                    "P00_V2_TEST_FAIL_AFTER_AUTH": "1",
                    "P00_V2_TEST_FAIL_FAILURE_PUBLICATION": "1",
                },
            )
            self.assertEqual(failed.returncode, 91, failed.stderr)
            receipt_root = (
                root / "Users/Shared/InterviewCopilot/"
                "verification-controller-a04-receipts"
            )
            self.assertTrue(
                (receipt_root / "P00-V2-CAP-A04-activation.in-progress").exists()
            )
            self.assertFalse(
                (receipt_root / "P00-V2-CAP-A04-activation.json").exists()
            )
            self.assertFalse(
                (root / "etc/sudoers.d/interviewcopilot-verification-controller-a04").exists()
            )
            replay = self.invoke_install(root)
            self.assertEqual(replay.returncode, 92, replay.stderr)
            self.assertFalse(
                (receipt_root / "P00-V2-CAP-A04-activation.in-progress").exists()
            )
            self.assertEqual(
                json.loads(
                    (receipt_root / "P00-V2-CAP-A04-activation.json").read_text()
                )["status"],
                "FAILURE",
            )
            self.assert_fixture_unchanged(root, facts, hashes)

    def test_success_publication_error_rolls_back_to_terminal_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            facts, hashes = self.fixture(root)
            failed = self.invoke_install(
                root, {"P00_V2_TEST_FAIL_SUCCESS_PUBLICATION": "1"}
            )
            self.assertEqual(failed.returncode, 93, failed.stderr)
            base = root / "Users/Shared/InterviewCopilot"
            self.assertFalse(
                (base / "verification-controller-a04").exists(), failed.stderr
            )
            self.assertFalse(
                (root / "etc/sudoers.d/interviewcopilot-verification-controller-a04").exists()
            )
            receipt = (
                base / "verification-controller-a04-receipts/"
                "P00-V2-CAP-A04-activation.json"
            )
            self.assertEqual(json.loads(receipt.read_text())["status"], "FAILURE")
            self.assert_fixture_unchanged(root, facts, hashes)

    def test_preexisting_namespace_and_authorization_fail_closed(self) -> None:
        for member in ("namespace", "authorization"):
            with self.subTest(member=member), tempfile.TemporaryDirectory() as temporary:
                root = pathlib.Path(temporary)
                facts, hashes = self.fixture(root)
                if member == "namespace":
                    (root / "Users/Shared/InterviewCopilot/verification-controller-a04").mkdir()
                else:
                    target = (
                        root / "etc/sudoers.d/interviewcopilot-verification-controller-a04"
                    )
                    target.parent.mkdir(parents=True)
                    target.write_text("unknown\n")
                result = self.invoke_install(root)
                self.assertEqual(result.returncode, 73, result.stderr)
                self.assert_fixture_unchanged(root, facts, hashes)

    def test_request_writer_and_handoff_have_exact_boundaries(self) -> None:
        writer = (BUNDLE / "tools/write-request.py").read_text()
        self.assertIn('PHASES = {"P01"}', writer)
        self.assertIn("verification-controller-a04/requests/501", writer)
        handoff = (BUILD / "admin-handoff.txt").read_text()
        self.assertEqual(handoff.count("/usr/bin/sudo "), 1)
        self.assertIn("verification-controller-a04-bootstrap", handoff)
        self.assertNotIn("verification-controller-bootstrap/", handoff)
        self.assertNotIn("RECOVERY-0", handoff)
        self.assertNotIn("verification-controller/v1", handoff)
        source = (BUILD / "Controller.swift").read_text()
        self.assertEqual(source.count("_ = try installedPreflight()"), 2)
        self.assertIn("let admission = try installedAdmission()", source)
        self.assertIn("A04 activation remains in progress", source)
        self.assertIn('"installedStateSha256"', source)

    def test_metadata_receipt_root_schema_and_state_drift_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            self.fixture(root)
            installed = self.invoke_install(root)
            self.assertEqual(installed.returncode, 0, installed.stderr)
            controller_root = (
                root / "Users/Shared/InterviewCopilot/verification-controller-a04"
            )
            metadata = controller_root / "metadata/P00-V2-CAP-A04"
            receipt_root = (
                root / "Users/Shared/InterviewCopilot/"
                "verification-controller-a04-receipts"
            )
            receipt = receipt_root / "P00-V2-CAP-A04-activation.json"

            for name in [
                "expected-install-manifest.json",
                "release-envelope.json",
                "approved-envelope.sha256",
                "installed-self-test.json",
            ]:
                path = metadata / name
                original = path.read_bytes()
                path.chmod(0o644)
                path.write_bytes(original + b" ")
                path.chmod(0o444)
                self.assertNotEqual(
                    self.admission(root, "verify-success").returncode, 0, name
                )
                path.chmod(0o644)
                path.write_bytes(original)
                path.chmod(0o444)

            for path, mode in [
                (controller_root, 0o755),
                (controller_root / "metadata", 0o555),
                (metadata, 0o555),
                (controller_root / "requests/501", 0o700),
            ]:
                path.chmod(mode | 0o020)
                self.assertNotEqual(
                    self.admission(root, "verify-success").returncode, 0,
                    str(path),
                )
                path.chmod(mode)

            metadata.chmod(0o755)
            subprocess.run(
                ["/usr/bin/xattr", "-w", "test.a04-drift", "1", str(metadata)],
                check=True,
            )
            metadata.chmod(0o555)
            self.assertNotEqual(self.admission(root, "verify-success").returncode, 0)
            metadata.chmod(0o755)
            subprocess.run(
                ["/usr/bin/xattr", "-d", "test.a04-drift", str(metadata)],
                check=True,
            )
            metadata.chmod(0o555)
            subprocess.run(
                ["/bin/chmod", "+a", "everyone deny write", str(metadata)],
                check=True,
            )
            self.assertNotEqual(self.admission(root, "verify-success").returncode, 0)
            subprocess.run(["/bin/chmod", "-N", str(metadata)], check=True)

            original_receipt = json.loads(receipt.read_text())
            cases: list[tuple[str, dict[str, object]]] = []
            boolean_drift = dict(original_receipt)
            boolean_drift["authorizationPresent"] = 1
            cases.append(("boolean", boolean_drift))
            checkpoint_drift = dict(original_receipt)
            checkpoint_drift["checkpoint"] = "other"
            cases.append(("checkpoint", checkpoint_drift))
            controller_drift = dict(original_receipt)
            controller_drift["installedControllerSha256"] = "0" * 64
            cases.append(("controller", controller_drift))
            state_drift = dict(original_receipt)
            state_drift["installedStateSha256"] = "0" * 64
            cases.append(("state-binding", state_drift))
            extra = dict(original_receipt)
            extra["unexpected"] = True
            cases.append(("extra-field", extra))
            for label, document in cases:
                receipt.chmod(0o644)
                receipt.write_text(
                    json.dumps(document, sort_keys=True, separators=(",", ":")) + "\n"
                )
                receipt.chmod(0o444)
                if label == "state-binding":
                    self.assertEqual(self.receipt_verify(root).returncode, 0)
                    self.assertNotEqual(
                        self.admission(root, "verify-success").returncode, 0
                    )
                else:
                    self.assertNotEqual(self.receipt_verify(root).returncode, 0)
            receipt.chmod(0o644)
            receipt.write_text(
                json.dumps(
                    original_receipt, sort_keys=True, separators=(",", ":")
                ) + "\n"
            )
            receipt.chmod(0o444)
            self.assertEqual(self.receipt_verify(root).returncode, 0)

            receipt_root.chmod(0o721)
            self.assertNotEqual(self.receipt_verify(root).returncode, 0)
            receipt_root.chmod(0o711)
            receipt_root.chmod(0o731)
            subprocess.run(
                ["/usr/bin/xattr", "-w", "test.a04-root-drift", "1", str(receipt_root)],
                check=True,
            )
            receipt_root.chmod(0o711)
            self.assertNotEqual(self.receipt_verify(root).returncode, 0)
            receipt_root.chmod(0o731)
            subprocess.run(
                ["/usr/bin/xattr", "-d", "test.a04-root-drift", str(receipt_root)],
                check=True,
            )
            receipt_root.chmod(0o711)
            outside_link = root / "receipt-hardlink"
            os.link(receipt, outside_link)
            self.assertNotEqual(self.receipt_verify(root).returncode, 0)
            outside_link.unlink()
            self.assertNotEqual(
                run(
                    "/usr/bin/python3", BUNDLE / "tools/receipt.py", "verify",
                    receipt, sha256(BUILD / "release-envelope.json"),
                    "--expected-controller-sha", sha256(BUILD / "controller"),
                    "--owner", "0", "--group", str(os.getegid()),
                    "--allow-provenance", check=False,
                ).returncode,
                0,
            )
            self.assertEqual(self.admission(root, "verify-success").returncode, 0)

    def test_revocation_drift_removes_authorization_and_preserves_state(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            self.fixture(root)
            installed = self.invoke_install(root)
            self.assertEqual(installed.returncode, 0, installed.stderr)
            controller_root = (
                root / "Users/Shared/InterviewCopilot/verification-controller-a04"
            )
            drifted = controller_root / "payload/config/request-schema.json"
            drifted.chmod(0o644)
            drifted.write_text("{}\n")
            env = dict(os.environ, P00_V2_TEST_ROOT=str(root))
            revoked = run(
                controller_root / "payload/libexec/revoke-controller",
                env=env, check=False,
            )
            self.assertNotEqual(revoked.returncode, 0)
            self.assertTrue(controller_root.exists())
            self.assertFalse(
                (root / "etc/sudoers.d/interviewcopilot-verification-controller-a04").exists()
            )


if __name__ == "__main__":
    unittest.main()
