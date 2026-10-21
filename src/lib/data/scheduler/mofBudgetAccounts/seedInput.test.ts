import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { loadBudgetSeedInput } from "../../../../../scripts/data-worker/mof-budget-accounts-seed-input";

test("definitions-only reads evidence without invoking official fetch or returning history", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mof-budget-seed-"));
  const path = join(dir, "availability.json");
  const entries = [{ key: "national_capital_revenue", lastYear: 2025, lastValue: 8546.39, tableLatestYear: 2025 }];
  try {
    await writeFile(path, JSON.stringify({ sourceUrl: "https://yss.mof.gov.cn/", capturedAt: "2026-10-21T00:00:00Z", entries }));
    const input = await loadBudgetSeedInput({ definitionsOnly: true, writeCatalog: false, snapshotPath: path, sourceUrl: "https://yss.mof.gov.cn/", loadLive: async () => { throw new Error("offline seed must never fetch"); } });
    assert.deepEqual(input.entries, entries);
    assert.equal(input.history, null);
    assert.equal(input.capturedAt, "2026-10-21T00:00:00Z");
  } finally { await unlink(path); await rmdir(dir); }
});

test("live catalog snapshot contains latest availability evidence and excludes observations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mof-budget-live-"));
  const path = join(dir, "availability.json");
  const entries = [{ key: "national_capital_revenue", lastYear: 2025, lastValue: 8546.39, tableLatestYear: 2025 }];
  const history = new Map([[entries[0].key, [{ obsDate: new Date("2025-01-01"), value: 8546.39 }]]]);
  try {
    const live = await loadBudgetSeedInput({ definitionsOnly: false, writeCatalog: true, snapshotPath: path, sourceUrl: "https://yss.mof.gov.cn/", loadLive: async () => ({ entries, history }) });
    assert.equal(live.history, history);
    const offline = await loadBudgetSeedInput({ definitionsOnly: true, writeCatalog: false, snapshotPath: path, sourceUrl: "https://yss.mof.gov.cn/", loadLive: async () => { throw new Error("no fetch"); } });
    assert.deepEqual(offline, { entries, history: null, capturedAt: live.capturedAt });
  } finally { await unlink(path); await rmdir(dir); }
});

test("fast deployment seeds annual definitions offline; normal apply retains live onboarding", () => {
  const plan = (extra: string[]) => execFileSync(process.execPath, ["--import", "tsx", "scripts/data-worker/apply-all.ts", "--dry-run", "--only=mof-budget-accounts", ...extra], { cwd: process.cwd(), encoding: "utf8" });
  assert.match(plan(["--skip-backfill"]), /--catalog=mof-budget-accounts --definitions-only/);
  const normal = plan([]);
  assert.match(normal, /--catalog=mof-budget-accounts/);
  assert.doesNotMatch(normal, /--definitions-only/);
});

test("fiscal repair is an explicit full maintenance step, scoped by only and excluded from fast deploy", () => {
  const plan = (extra: string[]) => execFileSync(process.execPath, ["--import", "tsx", "scripts/data-worker/apply-all.ts", "--dry-run", ...extra], { cwd: process.cwd(), encoding: "utf8" });
  const full = plan(["--only=mof-fiscal"]);
  assert.match(full, /• mof-fiscal-history\s+npm run data:sync-mof-fiscal/);
  assert.match(full, /• mof-fiscal-period-repair\s+npm run data:repair-mof-fiscal-periods -- --apply/);
  assert.ok(full.indexOf("seed:mof-fiscal") < full.indexOf("mof-fiscal-history"));
  assert.ok(full.indexOf("mof-fiscal-history") < full.indexOf("mof-fiscal-period-repair"));
  assert.ok(full.indexOf("mof-fiscal-period-repair") < full.indexOf("verify:mof-fiscal"));
  assert.doesNotMatch(plan(["--only=mof-fiscal", "--skip-backfill"]), /data:sync-mof-fiscal|data:repair-mof-fiscal-periods/);
  assert.doesNotMatch(plan(["--only=mof-budget-accounts"]), /data:sync-mof-fiscal|data:repair-mof-fiscal-periods/);
});
