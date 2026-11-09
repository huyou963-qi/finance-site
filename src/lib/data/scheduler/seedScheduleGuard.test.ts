import assert from "node:assert/strict";
import test from "node:test";
import { findDelayedProbeSchedules, type SubscriptionScheduleSnapshot } from "./seedScheduleGuard";

const probe = { type: "probe_interval", intervalHours: 72 };
const d = (iso: string) => new Date(iso);

test("seed 把到期（或将到期）的探测往后推时恢复原时间", () => {
  const before: SubscriptionScheduleSnapshot[] = [
    { id: "due", nextRunAt: d("2026-09-03T08:00:00Z"), releaseRule: probe, enabled: true },
    { id: "soon", nextRunAt: d("2026-09-22T00:00:00Z"), releaseRule: probe, enabled: true },
  ];
  const after: SubscriptionScheduleSnapshot[] = [
    { id: "due", nextRunAt: d("2026-09-24T11:13:00Z"), releaseRule: probe, enabled: true },
    { id: "soon", nextRunAt: d("2026-09-24T11:13:00Z"), releaseRule: probe, enabled: true },
  ];
  assert.deepEqual(
    findDelayedProbeSchedules(before, after).map((r) => [r.id, r.restoreTo?.toISOString()]),
    [
      ["due", "2026-09-03T08:00:00.000Z"],
      ["soon", "2026-09-22T00:00:00.000Z"],
    ],
  );
});

test("之前为 null（立即到期）被写成未来时间，恢复为 null", () => {
  const before: SubscriptionScheduleSnapshot[] = [{ id: "a", nextRunAt: null, releaseRule: probe, enabled: true }];
  const after: SubscriptionScheduleSnapshot[] = [{ id: "a", nextRunAt: d("2026-09-24T00:00:00Z"), releaseRule: probe, enabled: true }];
  assert.deepEqual(findDelayedProbeSchedules(before, after).map((r) => [r.id, r.restoreTo]), [["a", null]]);
});

test("不动：提前了、新建的、规则变了、启用状态变了、日历型规则", () => {
  const cal = { type: "economic_calendar", packageId: "us.bls.cpi" };
  const before: SubscriptionScheduleSnapshot[] = [
    { id: "earlier", nextRunAt: d("2026-09-30T00:00:00Z"), releaseRule: probe, enabled: true },
    { id: "ruleChanged", nextRunAt: d("2026-09-03T00:00:00Z"), releaseRule: probe, enabled: true },
    { id: "reEnabled", nextRunAt: d("2026-09-03T00:00:00Z"), releaseRule: probe, enabled: false },
    { id: "calendar", nextRunAt: d("2026-09-03T00:00:00Z"), releaseRule: cal, enabled: true },
  ];
  const after: SubscriptionScheduleSnapshot[] = [
    { id: "earlier", nextRunAt: d("2026-09-24T00:00:00Z"), releaseRule: probe, enabled: true },
    { id: "ruleChanged", nextRunAt: d("2026-09-24T00:00:00Z"), releaseRule: { type: "probe_interval", intervalHours: 24 }, enabled: true },
    { id: "reEnabled", nextRunAt: d("2026-09-24T00:00:00Z"), releaseRule: probe, enabled: true },
    { id: "calendar", nextRunAt: d("2026-10-15T00:00:00Z"), releaseRule: cal, enabled: true },
    { id: "new", nextRunAt: d("2026-09-24T00:00:00Z"), releaseRule: probe, enabled: true },
  ];
  assert.deepEqual(findDelayedProbeSchedules(before, after), []);
});

test("发布包成员被 seed 推到每月兜底时恢复（2026-11-09 中国 PPI）", () => {
  const cal = { type: "economic_calendar", fallback: { type: "monthly_day", day: 10 } };
  const before: SubscriptionScheduleSnapshot[] = [
    { id: "ppi", nextRunAt: d("2026-11-09T01:33:00Z"), releaseRule: cal, enabled: true, releasePackageId: "cn.nbs.ppi" },
    { id: "moved", nextRunAt: d("2026-11-09T01:33:00Z"), releaseRule: cal, enabled: true, releasePackageId: "cn.nbs.ppi" },
    { id: "standalone", nextRunAt: d("2026-11-09T01:33:00Z"), releaseRule: cal, enabled: true, releasePackageId: null },
  ];
  const after: SubscriptionScheduleSnapshot[] = [
    { id: "ppi", nextRunAt: d("2026-11-10T08:00:00Z"), releaseRule: { ...cal, releaseDelayMinutes: 3 }, enabled: true, releasePackageId: "cn.nbs.ppi" },
    { id: "moved", nextRunAt: d("2026-11-10T08:00:00Z"), releaseRule: cal, enabled: true, releasePackageId: "cn.nbs.cpi" },
    { id: "standalone", nextRunAt: d("2026-11-10T08:00:00Z"), releaseRule: cal, enabled: true, releasePackageId: null },
  ];
  assert.deepEqual(
    findDelayedProbeSchedules(before, after).map((r) => [r.id, r.restoreTo?.toISOString()]),
    [["ppi", "2026-11-09T01:33:00.000Z"]],
  );
});
