#!/usr/bin/env bash
# Cloud Agent start: HK Postgres SSH tunnel + Next.js dev server.
set -euo pipefail

if [[ -f package.json ]]; then
  ROOT="$PWD"
elif [[ -f /workspace/package.json ]]; then
  ROOT=/workspace
elif [[ -f /agent/repos/finance-site/package.json ]]; then
  ROOT=/agent/repos/finance-site
else
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fi
cd "$ROOT"
echo "start_root=$ROOT"

KEY_PATH="${HK_SSH_KEY_PATH:-$HOME/.ssh/hk_gekkotech_ed25519}"
HK_HOST="${HK_SSH_HOST:-8.218.16.70}"
HK_USER="${HK_SSH_USER:-root}"
HK_PORT="${HK_SSH_PORT:-22}"
LOCAL_PG_PORT="${HK_PG_LOCAL_PORT:-15432}"

python3 - <<'PY'
import os, pathlib, re
raw = os.environ.get("HK_SSH_PRIVATE_KEY", "").strip()
if not raw:
    raise SystemExit(0)
key_path = pathlib.Path(os.path.expanduser(os.environ.get("HK_SSH_KEY_PATH", "~/.ssh/hk_gekkotech_ed25519")))
key_path.parent.mkdir(mode=0o700, exist_ok=True)
key = raw.replace("\\n", "\n")
if key.count("\n") < 5 and "BEGIN OPENSSH PRIVATE KEY" in key:
    m = re.match(
        r"-----BEGIN OPENSSH PRIVATE KEY-----\s*(.*?)\s*-----END OPENSSH PRIVATE KEY-----",
        key,
        re.S,
    )
    if not m:
        raise SystemExit("HK_SSH_PRIVATE_KEY unusable")
    body = "".join(m.group(1).split())
    lines = ["-----BEGIN OPENSSH PRIVATE KEY-----"]
    for i in range(0, len(body), 70):
        lines.append(body[i : i + 70])
    lines.append("-----END OPENSSH PRIVATE KEY-----")
    key = "\n".join(lines) + "\n"
elif not key.endswith("\n"):
    key += "\n"
key_path.write_text(key)
key_path.chmod(0o600)
print("ssh_key=materialized_on_start")
PY

python3 - <<PY
import os, socket, subprocess, time
port = int(os.environ.get("HK_PG_LOCAL_PORT") or "15432")
key = os.path.expanduser(os.environ.get("HK_SSH_KEY_PATH") or "~/.ssh/hk_gekkotech_ed25519")
user = os.environ.get("HK_SSH_USER") or "root"
host = os.environ.get("HK_SSH_HOST") or "8.218.16.70"
ssh_port = os.environ.get("HK_SSH_PORT") or "22"

def up():
    s = socket.socket(); s.settimeout(0.5)
    try:
        s.connect(("127.0.0.1", port)); return True
    except Exception:
        return False

if os.path.exists(key) and not up():
    subprocess.Popen([
        "ssh", "-i", key, "-p", str(ssh_port),
        "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes",
        "-o", "ServerAliveInterval=30", "-o", "StrictHostKeyChecking=accept-new",
        "-N", "-L", f"{port}:127.0.0.1:5432", f"{user}@{host}",
    ])
    for _ in range(40):
        if up():
            break
        time.sleep(0.5)
print("tunnel", "up" if up() else "down")
PY

if command -v psql >/dev/null 2>&1; then
  sudo service postgresql start || true
fi

if [[ ! -f .env.local ]]; then
  echo "missing .env.local — run install first" >&2
  exit 1
fi

# Secrets UI sometimes stores "DATABASE_URL=postgresql://..." as the value.
if [[ "${DATABASE_URL:-}" == DATABASE_URL=* ]]; then
  export DATABASE_URL="${DATABASE_URL#DATABASE_URL=}"
fi
# Prefer .env.local (tunnel URL) when process env is missing/malformed.
if [[ -z "${DATABASE_URL:-}" || "${DATABASE_URL}" != postgres* ]]; then
  unset DATABASE_URL || true
fi

exec npm run dev -- --hostname 0.0.0.0 --port 3000
