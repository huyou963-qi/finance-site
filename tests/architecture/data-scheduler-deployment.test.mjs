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
  assert.match(health, /prisma\.\$queryRaw/);
  assert.match(health, /ok:\s*true/);
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
