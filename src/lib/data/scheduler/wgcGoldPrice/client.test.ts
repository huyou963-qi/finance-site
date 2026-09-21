import assert from "node:assert/strict";
import test from "node:test";
import { parseWgcGoldPrice, wgcWindows, WGC_MAX_WINDOW_DAYS, WGC_MIN_WINDOW_DAYS } from "./client";

test("parseWgcGoldPrice 取对应币种、按日期排序去重、丢弃无效值", () => {
  const json = {
    chartData: {
      asOfDate: "2026-09-18",
      USD: [
        [Date.UTC(2026, 8, 18), 4348.15],
        [Date.UTC(2026, 8, 16), 4328.2],
        [Date.UTC(2026, 8, 17), null],
        [Date.UTC(2026, 8, 17), 0],
        [Date.UTC(2026, 8, 16), 4330],
      ],
    },
  };
  assert.deepEqual(parseWgcGoldPrice(json, "usd"), [
    { date: "2026-09-16", value: 4330 },
    { date: "2026-09-18", value: 4348.15 },
  ]);
});

test("parseWgcGoldPrice 缺币种时报错", () => {
  assert.throws(() => parseWgcGoldPrice({ chartData: { EUR: [] } }, "usd"), /chartData\.USD/);
});

test("parseWgcGoldPrice 丢弃盘中点（短窗口返回的 30 分钟实时价）", () => {
  const json = {
    chartData: {
      USD: [
        [Date.UTC(2026, 8, 18), 4348.15],
        [Date.UTC(2026, 8, 19, 10, 30), 4378.38], // 周六盘中
        [Date.UTC(2026, 8, 21, 10, 50), 4348.58],
      ],
    },
  };
  assert.deepEqual(parseWgcGoldPrice(json, "usd"), [{ date: "2026-09-18", value: 4348.15 }]);
});

test("wgcWindows 每段长度在 [MIN, MAX] 天之间，且无缝覆盖全区间", () => {
  const day = 86_400_000;
  const start = Date.UTC(1970, 0, 1);
  const end = Date.UTC(2026, 8, 22);
  const w = wgcWindows(start, end);
  assert.equal(w[0]![0], start);
  assert.equal(w[w.length - 1]![1], end);
  for (let i = 0; i < w.length; i++) {
    const len = w[i]![1] - w[i]![0];
    assert.ok(len < WGC_MAX_WINDOW_DAYS * day);
    assert.ok(len >= WGC_MIN_WINDOW_DAYS * day, `第 ${i} 段只有 ${len / day} 天，会拿到盘中数据`);
    if (i > 0) assert.ok(w[i]![0] <= w[i - 1]![1] + 1, "段间有缝");
  }
});

test("wgcWindows 增量同步的短区间也会延伸到 MIN 天", () => {
  const day = 86_400_000;
  const end = Date.UTC(2026, 8, 22);
  const w = wgcWindows(end - 5 * day, end);
  assert.equal(w.length, 1);
  assert.equal(w[0]![1] - w[0]![0], WGC_MIN_WINDOW_DAYS * day);
});
