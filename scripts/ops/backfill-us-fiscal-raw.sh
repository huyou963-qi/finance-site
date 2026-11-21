#!/usr/bin/env bash
# Run one dataset in an isolated, bounded service. Does not enable subscriptions.
set -euo pipefail
dataset="${1:-}"
case "$dataset" in mspd|auctions) ;; *) echo 'Usage: backfill-us-fiscal-raw.sh mspd|auctions [YYYY-MM-DD]' >&2; exit 2;; esac
release="$(readlink -f /opt/finance-site)"
case "$release" in /opt/finance-site-releases/release-*) ;; *) echo 'Unexpected release path' >&2; exit 1;; esac
args=("--dataset=$dataset")
if [[ -n "${2:-}" ]]; then args+=("--from=$2"); fi
systemd-run --unit="finance-fiscal-backfill-$dataset" \
  --working-directory="$release" \
  --property=MemoryHigh=384M --property=MemoryMax=512M --property=MemorySwapMax=0 \
  --property=CPUQuota=25% --property=Nice=10 --property=IOWeight=10 \
  --property=MemoryAccounting=yes --property=CPUAccounting=yes \
  --property=TasksMax=64 --property=RuntimeMaxSec=1800 \
  --property=OOMPolicy=kill --property=KillMode=control-group \
  /usr/bin/flock -w 120 /tmp/finance-data-worker.lock \
  /usr/bin/env NODE_OPTIONS=--max-old-space-size=256 \
  "$release/node_modules/.bin/tsx" scripts/data-worker/backfill-us-fiscal-raw.ts "${args[@]}"
