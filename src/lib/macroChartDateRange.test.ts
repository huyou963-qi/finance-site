import assert from "node:assert/strict";
import test from "node:test";
import {
  datesFromRangePct,
  defaultRecentRangePct,
  rangePctFromDates,
} from "@/lib/macroChartDateRange";
import { indicesFromDataZoomPct } from "@/lib/timeRangeSlice";

/** 2016-01-01 … 2025-12-01 月频 */
const monthly = Array.from({ length: 120 }, (_, i) => {
  const y = 2016 + Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
});

test("默认近 3 年：以最后一期为终点向前 3 年", () => {
  const range = defaultRecentRangePct(monthly, 3);
  assert.ok(range);
  assert.deepEqual(datesFromRangePct(monthly, range), { from: "2022-12-01", to: "2025-12-01" });
});

test("季频标签同样按日期取近 3 年", () => {
  const quarterly = Array.from({ length: 24 }, (_, i) => `${2020 + Math.floor(i / 4)}-Q${(i % 4) + 1}`);
  const range = defaultRecentRangePct(quarterly, 3);
  assert.ok(range);
  assert.deepEqual(datesFromRangePct(quarterly, range), { from: "2022-10-01", to: "2025-10-01" });
});

test("时间轴不足 3 年时展示全部", () => {
  const short = monthly.slice(-10);
  const range = defaultRecentRangePct(short, 3);
  assert.ok(range);
  assert.deepEqual(indicesFromDataZoomPct(range.start, range.end, short.length), { i0: 0, i1: 9 });
});

test("日期区间与导航条下标互逆", () => {
  for (const i0 of [0, 1, 5, 37, 118, 119]) {
    for (const i1 of [i0, i0 + 1, 60, 119]) {
      if (i1 < i0 || i1 >= monthly.length) continue;
      const range = rangePctFromDates(monthly, monthly[i0]!, monthly[i1]!);
      assert.ok(range);
      assert.deepEqual(indicesFromDataZoomPct(range.start, range.end, monthly.length), { i0, i1 });
    }
  }
});

test("日期落在类目之间时取区间内首末类目；区间内无数据返回 null", () => {
  const range = rangePctFromDates(monthly, "2020-01-15", "2020-06-20");
  assert.ok(range);
  assert.deepEqual(datesFromRangePct(monthly, range), { from: "2020-02-01", to: "2020-06-01" });
  assert.equal(rangePctFromDates(monthly, "2030-01-01", "2031-01-01"), null);
  assert.equal(rangePctFromDates([], "2020-01-01", "2021-01-01"), null);
});
