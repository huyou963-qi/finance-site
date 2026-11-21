import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("fast deployments register fiscal definitions without downloading historical data", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/data-worker/apply-all.ts", "--dry-run", "--only=fiscal", "--skip-backfill", "--skip-migrate", "--skip-equity"], { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /seed:fiscal[^\r\n]*--catalog=fiscal --definitions-only/);
  assert.doesNotMatch(result.stdout, /npm run data:sync-fiscal/);
});
