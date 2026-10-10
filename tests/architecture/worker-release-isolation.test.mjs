import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
const root = resolve(import.meta.dirname, "../..");
test("deployment waits before changing shared dependencies and cannot cancel a live deploy", () => {
  const deploy = readFileSync(resolve(root, ".github/workflows/deploy.yml"), "utf8");
  assert.ok(deploy.indexOf("flock -w 1800 8") < deploy.indexOf("rm -rf .next node_modules"));
  assert.match(deploy, /flock -w 1800 9/);
  assert.match(deploy, /cancel-in-progress: false/);
});
test("worker dependencies belong to a preserved release and lock failure cannot fall back", () => {
  const sync = readFileSync(resolve(root, "scripts/ops/sync-cron-checkout.sh"), "utf8");
  assert.match(sync, /rsync -a "\$SRC_PATH\/node_modules\/" "\$RELEASE_PATH\/node_modules\/"/);
  assert.match(sync, /mv -Tf .*"\$JP_PATH"/);
  assert.match(sync, /mv "\$JP_PATH" "\$LEGACY_PATH"/);
  assert.doesNotMatch(sync, /不带锁重试|ln -s "\$SRC_PATH\/node_modules"/);
});
test("Linux: switching releases preserves the legacy checkout and isolates dependencies", {
  skip: process.platform !== "linux",
}, () => {
  const fixture = mkdtempSync(resolve(tmpdir(), "finance-worker-isolation-test-"));
  const source = resolve(fixture, "source");
  const target = resolve(fixture, "worker");
  try {
    for (const d of ["src", "scripts", "prisma", "data", "node_modules/tsx", "node_modules/@prisma/client"]) {
      mkdirSync(resolve(source, d), { recursive: true });
    }
    mkdirSync(resolve(target, ".data"), { recursive: true });
    writeFileSync(resolve(source, ".env.local"), "");
    writeFileSync(resolve(source, "src/version"), "one");
    writeFileSync(resolve(target, "uncommitted"), "preserve");
    symlinkSync(resolve(source, ".env.local"), resolve(target, ".env.local"));
    for (const p of ["tsx", "@prisma/client"]) writeFileSync(resolve(source, "node_modules", p, "index.js"), "module.exports = {};\n");
    const script = resolve(root, "scripts/ops/sync-cron-checkout.sh");
    const env = { ...process.env, SYNC_CRON_CHECKOUT_LOCKED: "1" };
    execFileSync("sh", [script, source, target], { env });
    const first = realpathSync(target);
    assert.notEqual(realpathSync(resolve(target, "node_modules")), realpathSync(resolve(source, "node_modules")));
    const legacy = resolve(realpathSync(resolve(target, ".data")), "..");
    assert.equal(readFileSync(resolve(legacy, "uncommitted"), "utf8"), "preserve");
    writeFileSync(resolve(source, "src/version"), "two");
    execFileSync("sh", [script, source, target], { env });
    assert.notEqual(realpathSync(target), first);
    assert.equal(readFileSync(resolve(first, "src/version"), "utf8"), "one");
    assert.equal(readFileSync(resolve(target, "src/version"), "utf8"), "two");
    assert.equal(statSync(resolve(first, "node_modules/tsx/index.js")).ino,
      statSync(resolve(target, "node_modules/tsx/index.js")).ino);
    writeFileSync(resolve(source, "node_modules/tsx/index.js"), "module.exports = { version: 2 };\n");
    execFileSync("sh", [script, source, target], { env });
    assert.notEqual(statSync(resolve(first, "node_modules/tsx/index.js")).ino,
      statSync(resolve(target, "node_modules/tsx/index.js")).ino);
    assert.equal(readFileSync(resolve(first, "node_modules/tsx/index.js"), "utf8"), "module.exports = {};\n");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
