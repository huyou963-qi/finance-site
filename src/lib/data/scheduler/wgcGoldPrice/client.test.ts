import assert from "node:assert/strict";
import test from "node:test";
import { parseWgcGoldPrice, wgcWindows, WGC_MAX_WINDOW_DAYS } from "./client";

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

test("wgcWindows 每段不超过上限且首尾相接覆盖全区间", () => {
  const day = 86_400_000;
  const start = Date.UTC(1970, 0, 1);
  const end = Date.UTC(2026, 8, 21);
  const w = wgcWindows(start, end);
  assert.equal(w[0]![0], start);
  assert.equal(w[w.length - 1]![1], end);
  for (let i = 0; i < w.length; i++) {
    assert.ok(w[i]![1] - w[i]![0] < WGC_MAX_WINDOW_DAYS * day);
    if (i > 0) assert.equal(w[i]![0], w[i - 1]![1] + 1);
  }
});
