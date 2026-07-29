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
import threading
import time
import unittest


BUNDLE = pathlib.Path(__file__).resolve().parents[1]
CAPABILITY_ROOT = BUNDLE.parent
A02 = CAPABILITY_ROOT / "P00-V2-CAP-A02"
A03 = CAPABILITY_ROOT / "P00-V2-CAP-A03"
ARTIFACT = "P00-V2-CAP-A03-RECOVERY-02"
COMMIT = "1ff0881b9bd59f243146c93b6709be57d58ee17a"
PHASE = "P01"
RUN_ID = "70acd85a0202cc85f65e176a995a248f"
LEGACY_ROOT = pathlib.Path(
    "/Users/Shared/InterviewCopilot/verification-controller/v1"
)
LEGACY_SUDOERS = pathlib.Path(
    "/Users/thirdfacedev/.codex/orchestration/TimoCodes-evidence/"
    "P01-controller-P00-R9/src/sudoers"
)


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
            if not path.is_symlink():
                path.chmod(stat.S_IMODE(path.lstat().st_mode) | 0o700)
        except FileNotFoundError:
            pass


class RecoveryTests(unittest.TestCase):
    maxDiff = None

    @classmethod
    def setUpClass(cls) -> None:
        for path in [
            BUNDLE / "build/release-envelope.json",
            BUNDLE / "build/admin-handoff.txt",
            BUNDLE / "vendor/a02/config/sudoers",
            BUNDLE / "vendor/a03/source/install.sh",
        ]:
            if not path.is_file():
                raise AssertionError(f"missing build output: {path}")
        run(
            "/usr/bin/python3",
            BUNDLE / "tools/envelope.py",
            "verify",
            BUNDLE,
            BUNDLE / "build/release-envelope.json",
        )

    def prepare_legacy_root(self, temporary: pathlib.Path) -> pathlib.Path:
        test_root = temporary / "system"
        v1 = test_root / "Users/Shared/InterviewCopilot/verification-controller/v1"
        v1.parent.mkdir(parents=True)
        run("/usr/bin/ditto", LEGACY_ROOT, v1)
        sudoers = (
            test_root / "etc/sudoers.d/interviewcopilot-verification-controller"
        )
        sudoers.parent.mkdir(parents=True)
        shutil.copyfile(LEGACY_SUDOERS, sudoers)
        sudoers.chmod(0o440)
        return test_root

    def install_a02(self, test_root: pathlib.Path) -> None:
        environment = os.environ.copy()
        environment["P00_V2_TEST_ROOT"] = str(test_root)
        environment["P00_V2_TEST_ALLOW_FRESH_INSTALL"] = "1"
        result = run(
            "/bin/zsh",
            A02 / "source/install.sh",
            A02,
            sha256(A02 / "build/release-envelope.json"),
            env=environment,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        controller = (
            test_root / "Users/Shared/InterviewCopilot/verification-controller"
        )
        metadata = controller / "metadata/P00-V2-CAP-A02"
        make_writable(metadata)
        run("/usr/bin/xattr", "-cr", metadata)
        for member in metadata.iterdir():
            member.chmod(0o444)
        metadata.chmod(0o755)
        sudoers = (
            test_root / "etc/sudoers.d/interviewcopilot-verification-controller"
        )
        sudoers.chmod(0o600)
        run("/usr/bin/xattr", "-cr", sudoers)
        sudoers.chmod(0o440)

    def make_historical_blocker(self, test_root: pathlib.Path) -> pathlib.Path:
        node_modules = self.original_node_modules(test_root)
        binary = node_modules / "vitest/node_modules/esbuild/bin/esbuild"
        binary.parent.mkdir(parents=True)
        binary.write_text("preserved historical package bytes\n")
        binary.chmod(0o644)
        link = node_modules / "vitest/node_modules/.bin/esbuild"
        link.parent.mkdir(parents=True)
        link.symlink_to("../esbuild/bin/esbuild")
        for directory in [
            node_modules.parent,
            node_modules.parent.parent,
            *[path for path in node_modules.rglob("*") if path.is_dir()],
        ]:
            directory.chmod(0o755)
        return node_modules

    def make_unauthorized_a02(self, test_root: pathlib.Path) -> pathlib.Path:
        self.install_a02(test_root)
        (
            test_root / "etc/sudoers.d/interviewcopilot-verification-controller"
        ).unlink()
        return self.make_historical_blocker(test_root)

    def controller(self, test_root: pathlib.Path) -> pathlib.Path:
        return (
            test_root / "Users/Shared/InterviewCopilot/verification-controller"
        )

    def original_node_modules(self, test_root: pathlib.Path) -> pathlib.Path:
        return (
            self.controller(test_root)
            / f"runs/{COMMIT}/{PHASE}/{RUN_ID}/repo/node_modules"
        )

    def quarantined_node_modules(self, test_root: pathlib.Path) -> pathlib.Path:
        return (
            self.controller(test_root)
            / f"quarantine/{ARTIFACT}/{COMMIT}-{PHASE}-{RUN_ID}-repo-node_modules"
        )

    def receipt(self, test_root: pathlib.Path) -> pathlib.Path:
        return self.controller(test_root) / f"recovery-receipts/{ARTIFACT}.json"

    def sudoers(self, test_root: pathlib.Path) -> pathlib.Path:
        return (
            test_root / "etc/sudoers.d/interviewcopilot-verification-controller"
        )

    def stage_bundle(self, test_root: pathlib.Path) -> pathlib.Path:
        envelope_path = BUNDLE / "build/release-envelope.json"
        envelope = json.loads(envelope_path.read_text())
        envelope_sha = sha256(envelope_path)
        stage = (
            test_root
            / "Users/Shared/InterviewCopilot/verification-controller-bootstrap"
            / envelope_sha
        )
        if stage.is_dir():
            return stage
        for relative in [*sorted(envelope["members"]), "build/release-envelope.json"]:
            source = BUNDLE / relative
            target = stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            target.chmod(0o444)
        (stage / "source/recover.sh").chmod(0o555)
        return stage

    def recover(
        self, test_root: pathlib.Path, **extra: str
    ) -> subprocess.CompletedProcess[str]:
        stage = self.stage_bundle(test_root)
        environment = os.environ.copy()
        environment["P00_V2_TEST_ROOT"] = str(test_root)
        environment.update(extra)
        return run(
            "/bin/zsh",
            stage / "source/recover.sh",
            stage,
            sha256(BUNDLE / "build/release-envelope.json"),
            env=environment,
            check=False,
        )

    def assert_failed_and_restored(
        self, test_root: pathlib.Path, result: subprocess.CompletedProcess[str]
    ) -> dict[str, object]:
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.sudoers(test_root).exists())
        self.assertTrue(self.original_node_modules(test_root).is_dir())
        self.assertTrue(
            (self.original_node_modules(test_root) / "vitest/node_modules/.bin/esbuild").is_symlink()
        )
        self.assertFalse(self.quarantined_node_modules(test_root).exists())
        receipt = json.loads(self.receipt(test_root).read_text())
        self.assertEqual(receipt["status"], "FAILURE")
        self.assertEqual(receipt["relocation"], "RESTORED")
        self.assertFalse(receipt["authorizationPresent"])
        self.assertEqual(
            sha256(self.controller(test_root) / "v2/libexec/verify-phase-core"),
            sha256(A02 / "build/controller"),
        )
        return receipt

    def test_envelope_and_handoff_are_closed(self) -> None:
        envelope = json.loads((BUNDLE / "build/release-envelope.json").read_text())
        self.assertEqual(envelope["artifactId"], ARTIFACT)
        self.assertEqual(envelope["predecessor"]["authorization"], "ABSENT")
        self.assertEqual(envelope["target"]["capability"], "P00-V2-CAP-A03")
        self.assertEqual(
            envelope["recoveryState"]["candidateRevision"],
            "2e5045116db6e3c5f6e6cc18b70df6d7fa021baf",
        )
        self.assertIn("tools/run_state.py", envelope["members"])
        self.assertIn("tools/receipt.py", envelope["members"])
        self.assertIn("tools/journal.py", envelope["members"])
        handoff = (BUNDLE / "build/admin-handoff.txt").read_text()
        self.assertEqual(handoff.count("/usr/bin/sudo "), 1)
        self.assertIn(
            '/bin/rm -f "/etc/sudoers.d/interviewcopilot-verification-controller"',
            handoff,
        )
        self.assertIn("trap cleanup EXIT", handoff)
        self.assertLess(handoff.index("trap cleanup EXIT"), handoff.index("/bin/mkdir -p"))
        self.assertLess(
            handoff.index('/bin/rm -f "/etc/sudoers.d/'),
            handoff.index('if [[ -e "$stage" ]]'),
        )
        self.assertNotIn("%admin", handoff)
        self.assertNotIn(" *", handoff)
        self.assertNotIn("P00-V2-CAP-A03/build/admin-handoff.txt", handoff)

    def test_recovers_and_retains_exact_historical_tree_in_quarantine(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                self.make_unauthorized_a02(test_root)
                state = self.controller(test_root) / "anchors/preserved-state"
                state.parent.mkdir(exist_ok=True)
                state.write_text("preserve\n")
                result = self.recover(test_root)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertFalse(self.original_node_modules(test_root).exists())
                quarantined = self.quarantined_node_modules(test_root)
                self.assertTrue(
                    (quarantined / "vitest/node_modules/.bin/esbuild").is_symlink()
                )
                self.assertTrue((quarantined.parent / "relocation.json").is_file())
                self.assertEqual(
                    sha256(self.controller(test_root) / "v2/libexec/verify-phase-core"),
                    sha256(A03 / "build/controller"),
                )
                self.assertEqual(state.read_text(), "preserve\n")
                self.assertEqual(
                    sha256(self.sudoers(test_root)), sha256(A03 / "config/sudoers")
                )
                receipt = json.loads(self.receipt(test_root).read_text())
                self.assertEqual(receipt["status"], "SUCCESS")
                self.assertEqual(receipt["relocation"], "RETAINED_QUARANTINED")
                self.assertTrue(receipt["authorizationPresent"])
                self.assertEqual(
                    receipt["installedControllerSha256"],
                    sha256(A03 / "build/controller"),
                )
                self.assertTrue((quarantined.parent / "a02-rollback").is_dir())
                self.assertTrue(
                    (quarantined.parent / "runs-metadata-before-child.json").is_file()
                )
            finally:
                make_writable(temporary)

    def test_failure_after_relocation_restores_exact_tree(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                self.make_unauthorized_a02(test_root)
                result = self.recover(
                    test_root, P00_V2_RECOVERY_TEST_FAIL_AFTER_RELOCATION="1"
                )
                receipt = self.assert_failed_and_restored(test_root, result)
                self.assertEqual(receipt["checkpoint"], "run_state_relocation")
            finally:
                make_writable(temporary)

    def test_remaining_run_symlink_blocks_before_authorization_and_restores(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                self.make_unauthorized_a02(test_root)
                extra = (
                    self.controller(test_root)
                    / f"runs/{COMMIT}/{PHASE}/{RUN_ID}/repo/extra-link"
                )
                extra.symlink_to("elsewhere")
                result = self.recover(test_root)
                receipt = self.assert_failed_and_restored(test_root, result)
                self.assertEqual(receipt["checkpoint"], "remaining_run_state_audit")
            finally:
                make_writable(temporary)

    def test_rule_write_failure_removes_authorization_and_restores(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                self.make_unauthorized_a02(test_root)
                result = self.recover(
                    test_root, P00_V2_RECOVERY_TEST_FAIL_AFTER_RULE_WRITE="1"
                )
                receipt = self.assert_failed_and_restored(test_root, result)
                self.assertEqual(receipt["checkpoint"], "transient_authorization")
            finally:
                make_writable(temporary)

    def test_child_rollback_restores_a02_and_historical_tree(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                self.make_unauthorized_a02(test_root)
                failed = self.recover(
                    test_root, P00_V2_TEST_FAIL_AFTER_NEW_AUTHORIZATION="1"
                )
                receipt = self.assert_failed_and_restored(test_root, failed)
                self.assertEqual(receipt["checkpoint"], "a03_transition")
                self.assertFalse(
                    (self.controller(test_root) / "metadata/P00-V2-CAP-A03").exists()
                )
            finally:
                make_writable(temporary)

    def test_tampered_predecessor_is_rejected_without_authorization(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                self.make_unauthorized_a02(test_root)
                target = self.controller(test_root) / "v2/config/npmrc"
                target.chmod(0o644)
                target.write_text("tampered\n")
                target.chmod(0o444)
                result = self.recover(test_root)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.sudoers(test_root).exists())
                self.assertTrue(self.original_node_modules(test_root).is_dir())
                self.assertFalse(self.receipt(test_root).exists())
                self.assertFalse(
                    (
                        self.controller(test_root)
                        / f"recovery-journals/{ARTIFACT}.json"
                    ).exists()
                )
            finally:
                make_writable(temporary)

    def test_bad_metadata_never_publishes_authorization(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            stop = threading.Event()
            observed_authorization: list[bool] = []
            observer: threading.Thread | None = None
            try:
                self.make_unauthorized_a02(test_root)
                approval = (
                    self.controller(test_root)
                    / "metadata/P00-V2-CAP-A02/approved-envelope.sha256"
                )
                approval.chmod(0o644)
                approval.write_text("0" * 64 + "\n")
                approval.chmod(0o444)

                def observe() -> None:
                    while not stop.is_set():
                        if self.sudoers(test_root).exists():
                            observed_authorization.append(True)
                        time.sleep(0.001)

                observer = threading.Thread(target=observe)
                observer.start()
                result = self.recover(test_root)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.sudoers(test_root).exists())
                self.assertEqual(observed_authorization, [])
                self.assertTrue(self.original_node_modules(test_root).is_dir())
            finally:
                stop.set()
                if observer is not None:
                    observer.join(timeout=5)
                make_writable(temporary)

    def test_failure_receipt_forbids_retry_of_same_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                self.make_unauthorized_a02(test_root)
                first = self.recover(
                    test_root, P00_V2_RECOVERY_TEST_FAIL_AFTER_RELOCATION="1"
                )
                self.assert_failed_and_restored(test_root, first)
                receipt_before = self.receipt(test_root).read_bytes()
                second = self.recover(test_root)
                self.assertNotEqual(second.returncode, 0)
                self.assertEqual(self.receipt(test_root).read_bytes(), receipt_before)
                self.assertFalse(self.sudoers(test_root).exists())
                self.assertTrue(self.original_node_modules(test_root).is_dir())
            finally:
                make_writable(temporary)

    def test_successful_rerun_rejects_without_removing_a03_authorization(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                self.make_unauthorized_a02(test_root)
                first = self.recover(test_root)
                self.assertEqual(first.returncode, 0, first.stderr)
                expected = sha256(self.sudoers(test_root))
                second = self.recover(test_root)
                self.assertEqual(second.returncode, 0, second.stderr)
                self.assertTrue(self.sudoers(test_root).is_file())
                self.assertEqual(sha256(self.sudoers(test_root)), expected)
            finally:
                make_writable(temporary)

    def test_hard_crash_boundaries_reconcile_before_new_terminal_attempt(self) -> None:
        points = [
            "before-quarantine-mkdir",
            "after-quarantine-mkdir",
            "after-manifest-publish",
            "after-relocation-rename",
            "before-sudoers-publish",
            "after-sudoers-publish",
            "before-child-launch",
        ]
        point_filter = os.environ.get("P00_V2_RECOVERY_TEST_POINT_FILTER")
        if point_filter:
            points = [point_filter]
        for point in points:
            with self.subTest(point=point):
                with tempfile.TemporaryDirectory() as temporary_text:
                    temporary = pathlib.Path(temporary_text)
                    test_root = self.prepare_legacy_root(temporary)
                    try:
                        self.make_unauthorized_a02(test_root)
                        crashed = self.recover(
                            test_root,
                            P00_V2_RECOVERY_TEST_HARD_CRASH_POINT=point,
                        )
                        self.assertNotEqual(crashed.returncode, 0)
                        self.assertFalse(self.receipt(test_root).exists())
                        self.assertTrue(
                            (
                                self.controller(test_root)
                                / f"recovery-journals/{ARTIFACT}.json"
                            ).is_file()
                        )
                        retry = self.recover(
                            test_root,
                            P00_V2_RECOVERY_TEST_FAIL_AFTER_RELOCATION="1",
                        )
                        if not self.original_node_modules(test_root).is_dir():
                            observed = sorted(
                                str(path.relative_to(self.controller(test_root)))
                                for path in self.controller(test_root).rglob("*")
                                if (
                                    ARTIFACT in str(path)
                                    or RUN_ID in str(path)
                                )
                                and len(path.relative_to(self.controller(test_root)).parts)
                                <= 4
                            )
                            self.fail(
                                f"{point} failed to restore node_modules; "
                                f"exit={retry.returncode}; stderr={retry.stderr}; "
                                f"observed={observed}"
                            )
                        self.assert_failed_and_restored(test_root, retry)
                    finally:
                        make_writable(temporary)

    def test_hard_crash_after_child_commit_finalizes_exact_a03(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                self.make_unauthorized_a02(test_root)
                crashed = self.recover(
                    test_root,
                    P00_V2_RECOVERY_TEST_HARD_CRASH_POINT="after-child-commit",
                )
                self.assertNotEqual(crashed.returncode, 0)
                self.assertFalse(self.receipt(test_root).exists())
                self.assertEqual(
                    sha256(self.controller(test_root) / "v2/libexec/verify-phase-core"),
                    sha256(A03 / "build/controller"),
                )
                resumed = self.recover(test_root)
                self.assertEqual(resumed.returncode, 0, resumed.stderr)
                receipt = json.loads(self.receipt(test_root).read_text())
                self.assertEqual(receipt["status"], "SUCCESS")
                self.assertEqual(
                    sha256(self.sudoers(test_root)), sha256(A03 / "config/sudoers")
                )
            finally:
                make_writable(temporary)

    def test_receipt_failure_is_recoverable_without_failure_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                self.make_unauthorized_a02(test_root)
                failed = self.recover(
                    test_root, P00_V2_RECOVERY_TEST_RECEIPT_FAILURE="1"
                )
                self.assertNotEqual(failed.returncode, 0)
                self.assertFalse(self.receipt(test_root).exists())
                self.assertFalse(self.sudoers(test_root).exists())
                self.assertEqual(
                    sha256(self.controller(test_root) / "v2/libexec/verify-phase-core"),
                    sha256(A03 / "build/controller"),
                )
                resumed = self.recover(test_root)
                self.assertEqual(resumed.returncode, 0, resumed.stderr)
                self.assertEqual(
                    json.loads(self.receipt(test_root).read_text())["status"], "SUCCESS"
                )
            finally:
                make_writable(temporary)

    def test_hard_crash_around_receipt_rename_is_recoverable(self) -> None:
        for point in ("before-receipt-rename", "after-receipt-rename"):
            with self.subTest(point=point):
                with tempfile.TemporaryDirectory() as temporary_text:
                    temporary = pathlib.Path(temporary_text)
                    test_root = self.prepare_legacy_root(temporary)
                    try:
                        self.make_unauthorized_a02(test_root)
                        crashed = self.recover(
                            test_root,
                            P00_V2_RECOVERY_TEST_HARD_CRASH_POINT=point,
                        )
                        self.assertNotEqual(crashed.returncode, 0)
                        resumed = self.recover(test_root)
                        self.assertEqual(resumed.returncode, 0, resumed.stderr)
                        receipt = json.loads(self.receipt(test_root).read_text())
                        self.assertEqual(receipt["status"], "SUCCESS")
                        self.assertEqual(
                            sha256(self.sudoers(test_root)),
                            sha256(A03 / "config/sudoers"),
                        )
                    finally:
                        make_writable(temporary)

    def test_root_mode_and_acl_drift_are_detected_by_relocation_facts(self) -> None:
        for drift in ("root-mode", "descendant-acl"):
            with self.subTest(drift=drift):
                with tempfile.TemporaryDirectory() as temporary_text:
                    temporary = pathlib.Path(temporary_text)
                    source = (
                        temporary
                        / f"verification-controller/runs/{COMMIT}/{PHASE}/{RUN_ID}/repo/node_modules"
                    )
                    member = source / "package/file"
                    member.parent.mkdir(parents=True)
                    member.write_text("exact\n")
                    destination = (
                        temporary
                        / f"verification-controller/quarantine/{ARTIFACT}/"
                        f"{COMMIT}-{PHASE}-{RUN_ID}-repo-node_modules"
                    )
                    manifest = destination.parent / "relocation.json"
                    run(
                        "/usr/bin/python3",
                        BUNDLE / "tools/run_state.py",
                        "prepare-relocation",
                        source,
                        destination,
                        manifest,
                    )
                    run(
                        "/usr/bin/python3",
                        BUNDLE / "tools/run_state.py",
                        "move-relocation",
                        source,
                        destination,
                        manifest,
                    )
                    document = json.loads(manifest.read_text())
                    self.assertEqual(
                        document["tree"]["memberCountIncludingRoot"], 3
                    )
                    if drift == "root-mode":
                        destination.chmod(0o700)
                    else:
                        changed = run(
                            "/bin/chmod",
                            "+a",
                            "everyone deny delete",
                            destination / "package",
                            check=False,
                        )
                        self.assertEqual(changed.returncode, 0, changed.stderr)
                    restored = run(
                        "/usr/bin/python3",
                        BUNDLE / "tools/run_state.py",
                        "restore-relocation",
                        source,
                        destination,
                        manifest,
                        check=False,
                    )
                    self.assertNotEqual(restored.returncode, 0)
                    if drift == "root-mode":
                        destination.chmod(0o755)
                    else:
                        run("/bin/chmod", "-N", destination / "package")


if __name__ == "__main__":
    unittest.main()
