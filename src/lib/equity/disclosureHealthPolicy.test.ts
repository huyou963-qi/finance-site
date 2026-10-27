import test from "node:test";
import assert from "node:assert/strict";
import type { EquityDisclosureBatch } from "@prisma/client";
import { disclosureHealth } from "./disclosureHealthPolicy";

const cik = "0000320193";
const now = new Date("2026-10-26T14:00:00Z"); // 22:00 Beijing, after daily grace period
function batch(overrides: Partial<EquityDisclosureBatch> = {}): EquityDisclosureBatch {
  return { id: "batch", status: "success", startedAt: new Date("2026-10-26T11:15:00Z"),
    finishedAt: new Date("2026-10-26T12:00:00Z"), fromDay: new Date("2026-10-19"), throughDay: new Date("2026-10-25"),
    symbols: [], coveredCiks: [cik], failedCiks: [], missingIndexes: [], indexed: 2, complete: 2,
    pending: 0, failed: 0, remaining: 0, timingUpdated: 0, error: null, ...overrides };
}

test("no announcements is asserted only for a covered issuer with complete discovery", () => {
  assert.match(disclosureHealth(batch(), cik, 0, now).message, /该日未发现本股已覆盖类型的公告/);
  for (const invalid of [batch({ coveredCiks: [] }), batch({ failedCiks: [cik] }), batch({ missingIndexes: ["2026-10-23"] }), batch({ status: "failed" })]) {
    const health = disclosureHealth(invalid, cik, 0, now);
    assert.doesNotMatch(health.message, /未发现本股/);
    assert.equal(health.batch?.announcementCount, null);
  }
  assert.equal(disclosureHealth(null, cik, 0, now).state, "unknown");
});

test("old successful data, running tasks, interrupted tasks and partial tasks remain distinguishable", () => {
  assert.equal(disclosureHealth(batch({ throughDay: new Date("2026-10-24") }), cik, 0, now).state, "stale");
  assert.equal(disclosureHealth(batch({ status: "running", startedAt: new Date("2026-10-26T13:00Z") }), cik, 0, now).state, "running");
  assert.equal(disclosureHealth(batch({ status: "running" }), cik, 0, now).state, "failed");
  assert.equal(disclosureHealth(batch({ status: "partial", remaining: 4 }), cik, 0, now).state, "partial");
  assert.match(disclosureHealth(batch(), cik, 3, now).message, /3 份已覆盖类型公告/);
});

test("daily freshness deadline accounts for Beijing's 21:15 grace boundary", () => {
  const yesterday = batch({ throughDay: new Date("2026-10-24") });
  assert.equal(disclosureHealth(yesterday, cik, 0, new Date("2026-10-26T13:14Z")).state, "success");
  assert.equal(disclosureHealth(yesterday, cik, 0, new Date("2026-10-26T03:00Z")).state, "success");
  assert.equal(disclosureHealth(batch({ throughDay: new Date("2026-10-23") }), cik, 0, new Date("2026-10-26T03:00Z")).state, "stale");
  assert.equal(disclosureHealth(yesterday, cik, 0, new Date("2026-10-26T13:15Z")).state, "stale");
});
