import assert from "node:assert/strict";
import { test } from "node:test";
import { floorBarIndexForTime, isoDateToUnixSec } from "./pageSyncChannel";

const iso = (s: string) => isoDateToUnixSec(s)!;

test("isoDateToUnixSec: UTC midnight seconds", () => {
  assert.equal(isoDateToUnixSec("1970-01-01"), 0);
  assert.equal(isoDateToUnixSec("2026-03-18"), Date.UTC(2026, 2, 18) / 1000);
  assert.equal(isoDateToUnixSec("2026-03-18T12:00:00"), Date.UTC(2026, 2, 18) / 1000);
  assert.equal(isoDateToUnixSec(null), null);
  assert.equal(isoDateToUnixSec("not-a-date"), null);
});

test("floor to week start: mid-week daily date snaps to that week's Monday bar", () => {
  // 周频柱起始于周一：3/2、3/9、3/16、3/23（2026）
  const weeks = ["2026-03-02", "2026-03-09", "2026-03-16", "2026-03-23"].map(iso);
  // 目标 3/18（周三）→ 应落到 3/16（本周周一），而不是最近的 3/23
  const idx = floorBarIndexForTime(weeks, iso("2026-03-18"));
  assert.equal(weeks[idx], iso("2026-03-16"));
});

test("floor to month start: late-in-month daily date snaps to month-start bar (not next month)", () => {
  // 月频柱起始于月初
  const months = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"].map(iso);
  // 目标 3/28 → 3/1（当月），最近邻会误选 4/1，floor 必须选 3/1
  const idx = floorBarIndexForTime(months, iso("2026-03-28"));
  assert.equal(months[idx], iso("2026-03-01"));
});

test("exact match returns that bar", () => {
  const days = ["2026-03-16", "2026-03-17", "2026-03-18"].map(iso);
  const idx = floorBarIndexForTime(days, iso("2026-03-17"));
  assert.equal(days[idx], iso("2026-03-17"));
});

test("target before all bars falls back to first bar", () => {
  const months = ["2026-03-01", "2026-04-01"].map(iso);
  const idx = floorBarIndexForTime(months, iso("2026-01-15"));
  assert.equal(idx, 0);
});

test("empty bar list returns -1", () => {
  assert.equal(floorBarIndexForTime([], iso("2026-03-18")), -1);
});
