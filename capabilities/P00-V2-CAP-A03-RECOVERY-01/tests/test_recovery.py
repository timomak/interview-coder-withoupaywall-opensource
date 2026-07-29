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
CAPABILITY_ROOT = BUNDLE.parent
A02 = CAPABILITY_ROOT / "P00-V2-CAP-A02"
A03 = CAPABILITY_ROOT / "P00-V2-CAP-A03"
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
            test_root
            / "etc/sudoers.d/interviewcopilot-verification-controller"
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
            test_root
            / "etc/sudoers.d/interviewcopilot-verification-controller"
        )
        sudoers.chmod(0o600)
        run("/usr/bin/xattr", "-cr", sudoers)
        sudoers.chmod(0o440)

    def make_unauthorized_a02(self, test_root: pathlib.Path) -> None:
        self.install_a02(test_root)
        (
            test_root
            / "etc/sudoers.d/interviewcopilot-verification-controller"
        ).unlink()

    def stage_bundle(self, test_root: pathlib.Path) -> pathlib.Path:
        envelope_path = BUNDLE / "build/release-envelope.json"
        envelope = json.loads(envelope_path.read_text())
        envelope_sha = sha256(envelope_path)
        stage = (
            test_root
            / "Users/Shared/InterviewCopilot/verification-controller-bootstrap"
            / envelope_sha
        )
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

    def test_envelope_and_handoff_are_closed(self) -> None:
        envelope = json.loads((BUNDLE / "build/release-envelope.json").read_text())
        self.assertEqual(envelope["artifactId"], "P00-V2-CAP-A03-RECOVERY-01")
        self.assertEqual(envelope["predecessor"]["authorization"], "ABSENT")
        self.assertEqual(envelope["target"]["capability"], "P00-V2-CAP-A03")
        self.assertIn("vendor/a03/source/install.sh", envelope["members"])
        self.assertIn("vendor/a02/config/sudoers", envelope["members"])
        handoff = (BUNDLE / "build/admin-handoff.txt").read_text()
        self.assertEqual(handoff.count("/usr/bin/sudo "), 1)
        self.assertIn('[[ ! -e "/etc/sudoers.d/', handoff)
        self.assertIn("trap cleanup EXIT", handoff)
        self.assertLess(handoff.index("trap cleanup EXIT"), handoff.index("/bin/mkdir -p"))
        self.assertIn("stage_created=0", handoff)
        self.assertNotIn("%admin", handoff)
        self.assertNotIn(" *", handoff)
        self.assertNotIn("P00-V2-CAP-A03/build/admin-handoff.txt", handoff)

    def test_recovers_exact_unauthorized_a02_to_exact_a03(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                self.make_unauthorized_a02(test_root)
                controller = (
                    test_root
                    / "Users/Shared/InterviewCopilot/verification-controller"
                )
                state = controller / "anchors/preserved-state"
                state.parent.mkdir(exist_ok=True)
                state.write_text("preserve\n")
                result = self.recover(test_root)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("recovered exact unauthorized A02", result.stdout)
                self.assertEqual(
                    sha256(controller / "v2/libexec/verify-phase-core"),
                    sha256(A03 / "build/controller"),
                )
                self.assertEqual(state.read_text(), "preserve\n")
                sudoers = (
                    test_root
                    / "etc/sudoers.d/interviewcopilot-verification-controller"
                )
                self.assertEqual(sha256(sudoers), sha256(A03 / "config/sudoers"))
                self.assertTrue(
                    (controller / "metadata/P00-V2-CAP-A03").is_dir()
                )
                self.assertFalse(
                    any(
                        (
                            test_root
                            / "Users/Shared/InterviewCopilot/"
                            "verification-controller-bootstrap"
                        ).iterdir()
                    )
                )
            finally:
                make_writable(temporary)

    def test_pretransition_failure_removes_transient_authorization(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                self.make_unauthorized_a02(test_root)
                result = self.recover(
                    test_root, P00_V2_RECOVERY_TEST_FAIL_BEFORE_A03="1"
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(
                    (
                        test_root
                        / "etc/sudoers.d/interviewcopilot-verification-controller"
                    ).exists()
                )
                controller = (
                    test_root
                    / "Users/Shared/InterviewCopilot/verification-controller"
                )
                self.assertEqual(
                    sha256(controller / "v2/libexec/verify-phase-core"),
                    sha256(A02 / "build/controller"),
                )
                retry = self.recover(test_root)
                self.assertEqual(retry.returncode, 0, retry.stderr)
            finally:
                make_writable(temporary)

    def test_child_rollback_is_retryable_from_unauthorized_a02(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                self.make_unauthorized_a02(test_root)
                failed = self.recover(
                    test_root, P00_V2_TEST_FAIL_AFTER_NEW_AUTHORIZATION="1"
                )
                self.assertNotEqual(failed.returncode, 0)
                sudoers = (
                    test_root
                    / "etc/sudoers.d/interviewcopilot-verification-controller"
                )
                self.assertFalse(sudoers.exists())
                controller = (
                    test_root
                    / "Users/Shared/InterviewCopilot/verification-controller"
                )
                self.assertEqual(
                    sha256(controller / "v2/libexec/verify-phase-core"),
                    sha256(A02 / "build/controller"),
                )
                retry = self.recover(test_root)
                self.assertEqual(retry.returncode, 0, retry.stderr)
            finally:
                make_writable(temporary)

    def test_tampered_predecessor_is_rejected_without_authorization(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_text:
            temporary = pathlib.Path(temporary_text)
            test_root = self.prepare_legacy_root(temporary)
            try:
                self.make_unauthorized_a02(test_root)
                controller = (
                    test_root
                    / "Users/Shared/InterviewCopilot/verification-controller"
                )
                target = controller / "v2/config/npmrc"
                target.chmod(0o644)
                target.write_text("tampered\n")
                target.chmod(0o444)
                rejected = self.recover(test_root)
                self.assertNotEqual(rejected.returncode, 0)
                self.assertFalse(
                    (
                        test_root
                        / "etc/sudoers.d/interviewcopilot-verification-controller"
                    ).exists()
                )
                self.assertFalse(
                    (controller / "metadata/P00-V2-CAP-A03").exists()
                )
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
                sudoers = (
                    test_root
                    / "etc/sudoers.d/interviewcopilot-verification-controller"
                )
                expected = sha256(sudoers)
                second = self.recover(test_root)
                self.assertNotEqual(second.returncode, 0)
                self.assertTrue(sudoers.is_file())
                self.assertEqual(sha256(sudoers), expected)
            finally:
                make_writable(temporary)


if __name__ == "__main__":
    unittest.main()
