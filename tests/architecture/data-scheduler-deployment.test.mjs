import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("production deployment installs the recurring macro data scheduler", () => {
  const deploy = read(".github/workflows/deploy.yml");
  const release = read("scripts/ops/deploy-release.sh");
  const cron = read("scripts/ops/finance-site-data-scheduler.cron");

  assert.match(deploy, /deploy-release\.sh/);
  assert.match(
    release,
    /install -m 0644 scripts\/ops\/finance-site-data-scheduler\.cron \/etc\/cron\.d\/finance-site-data-scheduler/,
  );
  assert.match(cron, /\*\/5 \* \* \* \* root .*npm run data:worker/);
  assert.match(cron, /2 \* \* \* \* root .*npm run data:sync-calendar/);
  assert.match(cron, /\/tmp\/finance-data-worker\.lock/);
  assert.match(cron, /\/tmp\/finance-sync-calendar\.lock/);
  assert.match(cron, /FINANCE_SITE_DATA_PATH=\/opt\/finance-site-jp-data/);
});

test("scheduler uses independent releases and deployment waits before replacing shared files", () => {
  const sync = read("scripts/ops/sync-cron-checkout.sh");
  const deploy = read(".github/workflows/deploy.yml");
  const release = read("scripts/ops/deploy-release.sh");
  assert.match(sync, /rsync -a "\$SRC_PATH\/node_modules\/" "\$RELEASE_PATH\/node_modules\/"/);
  assert.match(sync, /mv -Tf .*"\$JP_PATH"/);
  assert.match(sync, /mv "\$JP_PATH" "\$LEGACY_PATH"/);
  assert.match(sync, /RELEASE_ROOT\/runtime-data/);
  assert.doesNotMatch(sync, /不带锁重试|ln -s "\$SRC_PATH\/node_modules"/);
  assert.match(deploy, /cancel-in-progress: false/);
  assert.match(release, /sh scripts\/ops\/sync-cron-checkout\.sh/);
  assert.ok(
    release.indexOf("flock -w 1800 8")
      < release.indexOf('sh scripts/ops/sync-cron-checkout.sh "$RELEASE_PATH"'),
  );
});

test("zero-downtime deploy uses alternate port, health gate, and nginx upstream cutover", () => {
  const release = read("scripts/ops/deploy-release.sh");
  const health = read("src/app/api/health/route.ts");
  assert.match(release, /NEW_PORT=3001/);
  assert.match(release, /finance_site_app/);
  assert.match(release, /\/api\/health/);
  assert.match(release, /deploy_smoke/);
  assert.match(release, /rollback_to_previous/);
  assert.match(health, /prisma\.\$queryRaw/);
  assert.match(health, /ok:\s*true/);
});

test("deploy prunes old worker releases after sync; prune keeps active and runtime-data", () => {
  // Zero-downtime path: prune runs inside deploy-release.sh after sync-cron-checkout,
  // not inline in deploy.yml (which only invokes deploy-release.sh).
  const release = read("scripts/ops/deploy-release.sh");
  const prune = read("scripts/ops/prune-worker-releases.sh");
  assert.match(release, /prune-worker-releases\.sh --apply --keep 5/);
  assert.match(release, /export PRUNE_WORKER_RELEASES_LOCKED=1/);
  assert.ok(
    release.indexOf("PRUNE_WORKER_RELEASES_LOCKED=1")
      < release.indexOf("prune-worker-releases.sh --apply"),
    "must skip nested flock while deploy already holds worker/calendar locks",
  );
  assert.ok(
    release.indexOf("sync-cron-checkout.sh") < release.indexOf("prune-worker-releases.sh"),
    "prune must run after the new release is activated",
  );
  assert.match(prune, /APPLY=0/);
  assert.match(prune, /--apply\) APPLY=1/);
  assert.match(prune, /runtime-data/);
  assert.match(prune, /拒绝删除 active/);
  assert.match(prune, /拒绝删除 runtime-data/);
  assert.ok(
    prune.indexOf("find \"$RELEASE_ROOT\" -mindepth 1 -maxdepth 1 -type d -name 'release-*' -printf '%T@")
      < prune.lastIndexOf("migrate_runtime_data"),
    "mtime snapshot must precede migrate/retarget so ln -sfn cannot scramble keep order",
  );
});

test("macro selected lists show the actual latest observation on desktop and mobile", () => {
  const route = read("src/app/api/data/instruments/route.ts");
  const macro = read("src/app/macro/MacroSection.tsx");
  const desktop = read("src/components/SelectedIndicatorsList.tsx");
  const mobile = read("src/components/macro/mobile/MacroMobileSelectedPanel.tsx");

  assert.match(route, /macroPoints:\s*\{/);
  assert.match(route, /latestObsDate: macroPoints\[0\]\?\.obsDate/);
  assert.match(macro, /typeof item\.latestObsDate === "string"/);
  // 文案经 tr() 按界面语言显示（中文站原样）
  assert.match(desktop, /\[tr\("最新观测"\), row\.updatedAt\]/);
  assert.match(mobile, /tr\("观测 \{updatedAt\}", \{ updatedAt: row\.updatedAt \}\)/);
});
