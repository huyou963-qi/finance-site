#!/usr/bin/env bash
# Cloud Agent install: Node deps + materialize HK SSH key + .env.local (tunnel DB URL).
# Does NOT run prisma migrate against Hong Kong (dev writes are explicit later).
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
echo "install_root=$ROOT"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  nvm install 20 >/dev/null
  nvm alias default 20 >/dev/null
  nvm use 20 >/dev/null
  NODE20="$(nvm which 20 2>/dev/null || true)"
  if [[ -n "$NODE20" ]]; then
    sudo ln -sfn "$NODE20" /usr/local/bin/node
    sudo ln -sfn "$(dirname "$NODE20")/npm" /usr/local/bin/npm
    sudo ln -sfn "$(dirname "$NODE20")/npx" /usr/local/bin/npx
  fi
fi

python3 - <<'PY'
import os, pathlib, re
ssh_dir = pathlib.Path.home() / ".ssh"
ssh_dir.mkdir(mode=0o700, exist_ok=True)
key_path = ssh_dir / "hk_gekkotech_ed25519"
raw = os.environ.get("HK_SSH_PRIVATE_KEY", "").strip()
if raw:
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
    print("ssh_key=materialized")
elif key_path.exists():
    print("ssh_key=existing")
else:
    print("ssh_key=missing")
PY

if command -v psql >/dev/null 2>&1; then
  sudo service postgresql start || true
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL' >/dev/null || true
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'finance') THEN
    CREATE ROLE finance LOGIN PASSWORD 'postgres';
  END IF;
END
$$;
SELECT 'CREATE DATABASE finance OWNER finance'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'finance')\gexec
SQL
fi

python3 - <<'PY'
import os, re, subprocess
from pathlib import Path
from urllib.parse import quote

hk_host = os.environ.get("HK_SSH_HOST") or "8.218.16.70"
hk_user = os.environ.get("HK_SSH_USER") or "root"
hk_port = os.environ.get("HK_SSH_PORT") or "22"
key_path = os.path.expanduser(os.environ.get("HK_SSH_KEY_PATH") or "~/.ssh/hk_gekkotech_ed25519")
local_port = os.environ.get("HK_PG_LOCAL_PORT") or "15432"

vals = {}
for k in [
    "FRED_API_KEY", "FMP_API_KEY", "ADMIN_USERNAME", "ADMIN_PASSWORD",
    "ADMIN_MFA_ENCRYPTION_KEY", "WEEKLY_REPORT_INGEST_TOKEN", "SEC_EDGAR_USER_AGENT",
    "NON_PRO_FEATURE_RESTRICTIONS_ENABLED", "DATABASE_URL",
]:
    v = os.environ.get(k)
    if v:
        # Secrets UI may store "NAME=value" as the value.
        if v.startswith(k + "="):
            v = v[len(k) + 1 :]
        vals[k] = v


# Prefer live Hong Kong .env.local when SSH works (ignore possibly stale/mangled secrets).
if Path(key_path).exists():
    out = subprocess.check_output(
        [
            "ssh", "-i", key_path, "-p", str(hk_port),
            "-o", "BatchMode=yes", "-o", "ConnectTimeout=20",
            "-o", "StrictHostKeyChecking=accept-new",
            f"{hk_user}@{hk_host}",
            "grep -E '^(DATABASE_URL|FRED_API_KEY|FMP_API_KEY|ADMIN_USERNAME|ADMIN_PASSWORD|ADMIN_MFA_ENCRYPTION_KEY|WEEKLY_REPORT_INGEST_TOKEN|SEC_EDGAR_USER_AGENT|NON_PRO_FEATURE_RESTRICTIONS_ENABLED)=' /opt/finance-site/.env.local",
        ],
        text=True,
        timeout=45,
    )
    for line in out.splitlines():
        line = line.strip()
        if "=" not in line or line.startswith("#"):
            continue
        k, v = line.split("=", 1)
        if k in {
            "DATABASE_URL", "FRED_API_KEY", "FMP_API_KEY", "ADMIN_USERNAME",
            "ADMIN_PASSWORD", "ADMIN_MFA_ENCRYPTION_KEY", "WEEKLY_REPORT_INGEST_TOKEN",
            "SEC_EDGAR_USER_AGENT", "NON_PRO_FEATURE_RESTRICTIONS_ENABLED",
        }:
            vals[k] = v
    print("hk_env=fetched")

db_url = (vals.get("DATABASE_URL") or "").strip().strip('"').strip("'")
if db_url and Path(key_path).exists():
    # Drop query/fragment; passwords may contain URL-encoded chars.
    db_url = db_url.split("?", 1)[0].split("#", 1)[0]
    m = re.match(
        r"^(postgres(?:ql)?)://([^:/?#]+):([^@/?#]*)@([^:/?#]+)(?::(\d+))?(/[^?]*)?$",
        db_url,
    )
    if not m:
        raise SystemExit(
            f"DATABASE_URL_unparseable len={len(db_url)} prefix={db_url[:12]!r}"
        )
    scheme, user, pw, _host, _port, path = m.groups()
    path = path or "/finance"
    auth = quote(user, safe="")
    if pw:
        auth += ":" + quote(pw, safe="")
    vals["DATABASE_URL"] = f"{scheme}://{auth}@127.0.0.1:{local_port}{path}"
    print(f"database_url=tunnel:{local_port}")
elif not db_url:
    vals["DATABASE_URL"] = "postgresql://finance:postgres@127.0.0.1:5432/finance"
    print("database_url=local_fallback")

vals.setdefault("APP_BASE_URL", "http://localhost:3000")
vals.setdefault("ADMIN_USERNAME", "admin")
vals.setdefault("NON_PRO_FEATURE_RESTRICTIONS_ENABLED", "true")
order = [
    "DATABASE_URL", "FRED_API_KEY", "FMP_API_KEY", "APP_BASE_URL",
    "ADMIN_USERNAME", "ADMIN_PASSWORD", "ADMIN_MFA_ENCRYPTION_KEY",
    "WEEKLY_REPORT_INGEST_TOKEN", "SEC_EDGAR_USER_AGENT",
    "NON_PRO_FEATURE_RESTRICTIONS_ENABLED",
]
text = "\n".join(f"{k}={vals[k]}" for k in order if k in vals and str(vals[k]).strip() != "") + "\n"
Path(".env.local").write_text(text)
os.chmod(".env.local", 0o600)
# Mirror for /workspace when build uses /agent/repos/...
ws = Path("/workspace")
if ws.is_dir() and Path(".env.local").resolve() != (ws / ".env.local"):
    (ws / ".env.local").write_text(text)
    os.chmod(ws / ".env.local", 0o600)
print("env_local=written keys=" + ",".join(k for k in order if k in vals and str(vals[k]).strip() != ""))
if not vals["DATABASE_URL"].startswith(("postgres://", "postgresql://")):
    raise SystemExit("DATABASE_URL missing scheme after rewrite")
PY

npm ci
echo "cloud-agent-install done"
