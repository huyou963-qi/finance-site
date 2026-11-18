import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("guidance_runner", Path(__file__).with_name("run-guidance-backfill.py"))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class CompletionTests(unittest.TestCase):
    def run_case(self, audit, attempts=1, denial=False, low_disk=False, live_denial=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            worker, verifier, report = root / "worker.cjs", root / "verify.cjs", root / "run.jsonl"
            worker.write_text("worker", encoding="utf-8")
            verifier.write_text("verifier", encoding="utf-8")
            if denial:
                report.write_text('{"error":"SEC HTTP 403"}\n', encoding="utf-8")
            calls = []

            def popen(command):
                calls.append(command)
                if live_denial:
                    report.write_text('{"error":"SEC HTTP 403"}\n', encoding="utf-8")
                return SimpleNamespace(pid=123, wait=lambda: 1, poll=lambda: None if low_disk or live_denial else 1, terminate=lambda: None)

            def verify(command):
                if audit is not None:
                    path = next(x[len("--report="):] for x in command if x.startswith("--report="))
                    Path(path).write_text(json.dumps(audit), encoding="utf-8")
                return SimpleNamespace(returncode=0)

            argv = ["runner", "--worker", str(worker), "--verifier", str(verifier), "--report", str(report),
                    "--through", "2026-11-17", "--attempts", str(attempts)]
            with patch.object(sys, "argv", argv), patch.object(runner.subprocess, "Popen", side_effect=popen), \
                    patch.object(runner.subprocess, "run", side_effect=verify), patch.object(runner.time, "sleep"), \
                    patch.object(runner.shutil, "disk_usage", return_value=SimpleNamespace(free=(1 if low_disk else 99) * 1024**3)):
                code = runner.main()
            result = json.loads(Path(str(report) + ".completion.json").read_text(encoding="utf-8"))
            return code, result, calls

    def test_only_strict_coverage_proof_can_complete(self):
        code, result, _ = self.run_case({"pending": 0, "discoveryVerified": True, "missingCik": []})
        self.assertEqual((code, result["status"]), (0, "complete"))
        for audit in [None, {"pending": 1, "discoveryVerified": True}, {"pending": 0, "discoveryVerified": False},
                      {"pending": 0, "discoveryVerified": True}, {"pending": 0, "discoveryVerified": True, "missingCik": ["MISSING"]}]:
            code, result, _ = self.run_case(audit)
            self.assertEqual((code, result["status"]), (1, "failed"))

    def test_access_denial_stops_and_retries_use_single_worker(self):
        code, result, calls = self.run_case({"pending": 1}, attempts=3, denial=True)
        self.assertEqual((code, result["status"], len(calls)), (1, "blocked_access", 1))
        _, result, calls = self.run_case({"pending": 1}, attempts=2)
        self.assertEqual(result["status"], "failed")
        self.assertIn("--concurrency=3", calls[0])
        self.assertIn("--concurrency=1", calls[1])

    def test_low_disk_does_not_claim_completion(self):
        code, result, _ = self.run_case({"pending": 0, "discoveryVerified": True}, low_disk=True)
        self.assertEqual((code, result["status"]), (1, "blocked_disk"))

    def test_live_denial_stops_before_finishing_the_batch(self):
        code, result, calls = self.run_case({"pending": 1}, attempts=3, live_denial=True)
        self.assertEqual((code, result["status"], len(calls)), (1, "blocked_access", 1))


if __name__ == "__main__":
    unittest.main()
