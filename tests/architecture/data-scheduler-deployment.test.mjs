import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("production deployment installs the recurring macro data scheduler", () => {
  const deploy = read(".github/workflows/deploy.yml");
  const cron = read("scripts/ops/finance-site-data-scheduler.cron");

  assert.match(
    deploy,
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
  assert.match(sync, /rsync -a "\$SRC_PATH\/node_modules\/" "\$RELEASE_PATH\/node_modules\/"/);
  assert.match(sync, /mv -Tf .*"\$JP_PATH"/);
  assert.match(sync, /mv "\$JP_PATH" "\$LEGACY_PATH"/);
  assert.match(sync, /RELEASE_ROOT\/runtime-data/);
  assert.doesNotMatch(sync, /不带锁重试|ln -s "\$SRC_PATH\/node_modules"/);
  assert.ok(deploy.indexOf("flock -w 1800 8") < deploy.indexOf("rm -rf .next node_modules"));
  assert.match(deploy, /cancel-in-progress: false/);
});

test("deploy prunes old worker releases after sync; prune keeps active and runtime-data", () => {
  const deploy = read(".github/workflows/deploy.yml");
  const prune = read("scripts/ops/prune-worker-releases.sh");
  assert.match(deploy, /prune-worker-releases\.sh --apply --keep 5/);
  assert.ok(
    deploy.indexOf("sync-cron-checkout.sh") < deploy.indexOf("prune-worker-releases.sh"),
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
  assert.match(desktop, /\["最新观测", row\.updatedAt\]/);
  assert.match(mobile, /`观测 \$\{row\.updatedAt\}`/);
});
