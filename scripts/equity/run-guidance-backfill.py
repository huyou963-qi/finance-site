"""One-shot durable backfill + strict audit. Uses locally bundled worker/verifier, never deploys the app."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", required=True)
    parser.add_argument("--verifier", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--through", required=True)
    parser.add_argument("--attempts", type=int, default=3)
    args = parser.parse_args()
    if not 1 <= args.attempts <= 5:
        parser.error("attempts must be 1-5")
    report = Path(args.report).resolve()
    report.parent.mkdir(parents=True, exist_ok=True)
    state = {"status": "running", "through": args.through, "pid": os.getpid(),
             "workerSha256": hashlib.sha256(Path(args.worker).read_bytes()).hexdigest(),
             "verifierSha256": hashlib.sha256(Path(args.verifier).read_bytes()).hexdigest()}

    def write_state(status):
        state.update(status=status, updatedAt=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        target = Path(str(report) + ".completion.json")
        temp = target.with_suffix(".tmp")
        temp.write_text(json.dumps(state, indent=2), encoding="utf-8")
        temp.replace(target)

    node = os.environ.get("GUIDANCE_NODE_BINARY", "node")
    prefix = [node, "--max-old-space-size=384", "-r", "dotenv/config"]
    for attempt in range(1, args.attempts + 1):
        state["attempt"] = attempt
        write_state("running")
        scan_offset = report.stat().st_size if report.exists() else 0
        scan_tail = ""
        heartbeat = time.monotonic()
        worker = subprocess.Popen(prefix + [args.worker, "--all-covered", "--discover", "--fetch-missing", "--apply",
                                  "--concurrency=" + ("3" if attempt == 1 else "1"), "--through=" + args.through,
                                  "--report=" + str(report)])
        state["workerPid"] = worker.pid
        write_state("running")
        while worker.poll() is None:
            if report.exists():
                with report.open("r", encoding="utf-8") as receipts:
                    receipts.seek(scan_offset)
                    new_receipts = receipts.read()
                    scan_offset = receipts.tell()
                text = scan_tail + new_receipts
                if "SEC HTTP 403" in text:
                    worker.terminate()
                    state["workerExit"] = worker.wait()
                    write_state("blocked_access")
                    return 1
                scan_tail = text[-32:]
            free = shutil.disk_usage(report.parent).free
            if free < 3 * 1024**3:
                worker.terminate()
                state["workerExit"] = worker.wait()
                state["freeBytes"] = free
                write_state("blocked_disk")
                return 1
            if time.monotonic() - heartbeat >= 60:
                write_state("running")
                heartbeat = time.monotonic()
            time.sleep(5)
        state["workerExit"] = worker.wait()
        audit_file = str(report) + ".audit.json"
        audit = subprocess.run(prefix + [args.verifier, "--strict", "--through=" + args.through,
                                        "--discovery-report=" + str(report), "--report=" + audit_file])
        state["auditExit"] = audit.returncode
        if audit.returncode == 0 and Path(audit_file).is_file():
            result = json.loads(Path(audit_file).read_text(encoding="utf-8"))
            if result.get("pending") == 0 and result.get("discoveryVerified") is True and result.get("missingCik") == []:
                state["audit"] = result
                write_state("complete")
                return 0
        # An access denial is not treated as a transient error or bypassed by changing identity.
        if report.exists() and "SEC HTTP 403" in report.read_text(encoding="utf-8"):
            write_state("blocked_access")
            return 1
        write_state("retrying" if attempt < args.attempts else "failed")
        if attempt < args.attempts:
            time.sleep(60)
    return 1


if __name__ == "__main__":
    sys.exit(main())
