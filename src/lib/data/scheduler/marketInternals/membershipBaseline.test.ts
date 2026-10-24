import assert from "node:assert/strict";
import { test } from "node:test";
import { isConfirmedMembershipDate, validateCorroboration } from "./membershipBaseline";

const members = Array.from({ length: 503 }, (_, i) => `T${i}`);
test("当日独立持仓必须与核验基线完全一致，周末允许最近交易日", () => {
  assert.doesNotThrow(() => validateCorroboration(members, [...members].reverse(), "2026-10-16", "2026-10-17"));
  assert.throws(() => validateCorroboration(members, members.slice(1), "2026-10-16", "2026-10-17"), /不一致/);
  assert.throws(() => validateCorroboration(members, [...members.slice(1), "NEW"], "2026-10-16", "2026-10-17"), /不一致/);
  assert.throws(() => validateCorroboration(members, [...members, members[0]], "2026-10-16", "2026-10-17"), /规模异常/);
});
test("过期/未来持仓不能延长旧名单", () => {
  assert.throws(() => validateCorroboration(members, members, "2026-10-10", "2026-10-17"), /过期/);
  assert.throws(() => validateCorroboration(members, members, "2026-10-18", "2026-10-17"), /未来/);
});
test("只确认基线以内及独立持仓当天，不把端点相同推断成中间日期无变更", () => {
  assert.equal(isConfirmedMembershipDate("2026-10-16", "2026-10-17", "2026-10-23"), true);
  assert.equal(isConfirmedMembershipDate("2026-10-20", "2026-10-17", "2026-10-23"), false);
  assert.equal(isConfirmedMembershipDate("2026-10-23", "2026-10-17", "2026-10-23"), true);
  assert.equal(isConfirmedMembershipDate("2026-10-24", "2026-10-17", "2026-10-23"), false);
});


test("核验日持久保存，绑定基线哈希并隔离新旧名单", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { recordMembershipConfirmation } = await import("./membershipBaseline");
  const root = await mkdtemp(join(tmpdir(), "membership-proof-"));
  const baseline = { version: 1 as const, html: "fixture", anchor: "2026-10-16", source: "fixture", fetchedAt: "2026-10-16", sha256: "fixture-a" };
  try {
    await recordMembershipConfirmation(baseline, "2026-10-19", root);
    assert.deepEqual(await recordMembershipConfirmation(baseline, "2026-10-21", root), ["2026-10-19", "2026-10-21"]);
    assert.deepEqual(await recordMembershipConfirmation({ ...baseline, sha256: "fixture-b" }, "2026-10-22", root), ["2026-10-22"]);
  } finally { await rm(root, { recursive: true }); }
});
