import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adjustDailyBars,
  computeSplitFactors,
  parsePriceAdjustmentMode,
  type RawDailyBar,
  type SplitEvent,
} from "./priceAdjustment";

const DAY = 86400;
/** 2024-06-05 UTC 零点 */
const D = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000);

function bar(
  date: string,
  close: number,
  adjClose: number,
  volume: number | null = 1000,
): RawDailyBar {
  return {
    time: D(date),
    open: close * 0.99,
    high: close * 1.02,
    low: close * 0.98,
    close,
    adjClose,
    volume,
  };
}

describe("priceAdjustment/parseMode", () => {
  it("defaults to forward and accepts aliases", () => {
    assert.equal(parsePriceAdjustmentMode(null), "forward");
    assert.equal(parsePriceAdjustmentMode("前复权"), "forward");
    assert.equal(parsePriceAdjustmentMode("BACKWARD"), "backward");
    assert.equal(parsePriceAdjustmentMode("后复权"), "backward");
    assert.equal(parsePriceAdjustmentMode("raw"), "none");
    assert.equal(parsePriceAdjustmentMode("不复权"), "none");
    assert.equal(parsePriceAdjustmentMode("garbage"), "forward");
  });
});

describe("priceAdjustment/computeSplitFactors", () => {
  it("returns all ones when no splits", () => {
    const bars = [bar("2024-06-05", 100, 100), bar("2024-06-06", 101, 101)];
    assert.deepEqual(computeSplitFactors(bars, []), [1, 1]);
  });

  it("excludes the split on its own ex-date (bar already post-split)", () => {
    const bars = [
      bar("2024-06-07", 120, 120), // 拆股前一日 → 名义价 ×10
      bar("2024-06-10", 121, 121), // 除权生效日 → 已是拆后刻度 ×1
      bar("2024-06-11", 122, 122),
    ];
    const splits: SplitEvent[] = [{ exDate: "2024-06-10", ratio: 10 }];
    assert.deepEqual(computeSplitFactors(bars, splits), [10, 1, 1]);
  });

  it("compounds multiple splits (NVDA 4:1 then 10:1)", () => {
    const bars = [
      bar("2021-07-19", 800, 800), // 两次拆股都在其后 → 40
      bar("2021-07-20", 200, 200), // 4:1 生效日 → 仅后续 10:1 → 10
      bar("2024-06-10", 121, 121), // 10:1 生效日 → 1
    ];
    const splits: SplitEvent[] = [
      { exDate: "2021-07-20", ratio: 4 },
      { exDate: "2024-06-10", ratio: 10 },
    ];
    assert.deepEqual(computeSplitFactors(bars, splits), [40, 10, 1]);
  });
});

describe("priceAdjustment/adjustDailyBars", () => {
  // NVDA 实测口径：2024-06-07 Yahoo close=120.89（已拆股调整），拆股 10:1 于 06-10 生效
  const nvdaSplits: SplitEvent[] = [{ exDate: "2024-06-10", ratio: 10 }];
  const nvda: RawDailyBar[] = [
    bar("2024-06-07", 120.89, 120.82, 5000),
    bar("2024-06-10", 121.79, 121.72, 6000),
  ];

  it("none = 名义成交价：拆股前还原为 ~1208.9", () => {
    const out = adjustDailyBars(nvda, nvdaSplits, "none");
    assert.ok(Math.abs(out[0]!.close - 1208.9) < 1e-6);
    // 除权当日不再乘
    assert.ok(Math.abs(out[1]!.close - 121.79) < 1e-6);
    // 成交量还原为名义股数（拆前股数少 10 倍）
    assert.ok(Math.abs(out[0]!.volume! - 500) < 1e-9);
    assert.ok(Math.abs(out[1]!.volume! - 6000) < 1e-9);
  });

  it("forward = 前复权：close 等于 adjClose，末根不变", () => {
    const out = adjustDailyBars(nvda, nvdaSplits, "forward");
    assert.ok(Math.abs(out[0]!.close - 120.82) < 1e-9);
    assert.ok(Math.abs(out[1]!.close - 121.72) < 1e-9);
  });

  it("forward 保持单根 OHLC 相对形态", () => {
    const out = adjustDailyBars(nvda, nvdaSplits, "forward");
    const src = nvda[0]!;
    const k = out[0]!.close / src.close;
    assert.ok(Math.abs(out[0]!.high! - src.high! * k) < 1e-9);
    assert.ok(Math.abs(out[0]!.low! - src.low! * k) < 1e-9);
  });

  it("backward = 后复权：首根等于其名义价", () => {
    const out = adjustDailyBars(nvda, nvdaSplits, "backward");
    // 首根名义价 = close × S_0 = 120.89 × 10
    assert.ok(Math.abs(out[0]!.close - 1208.9) < 1e-6);
    // 后续按总收益放大：P_1 = 名义_0 × adj_1/adj_0
    const expected = 1208.9 * (121.72 / 120.82);
    assert.ok(Math.abs(out[1]!.close - expected) < 1e-6);
  });

  it("forward 与 backward 只差一个常数（同一条总收益曲线）", () => {
    const f = adjustDailyBars(nvda, nvdaSplits, "forward");
    const b = adjustDailyBars(nvda, nvdaSplits, "backward");
    const k0 = b[0]!.close / f[0]!.close;
    const k1 = b[1]!.close / f[1]!.close;
    assert.ok(Math.abs(k0 - k1) < 1e-9);
  });

  it("分红股：不复权保留除息跳空，前复权抹平", () => {
    // 无拆股；除息日 adjClose 与 close 出现比例差
    const bars: RawDailyBar[] = [
      bar("2025-02-07", 100, 99), // T=0.99
      bar("2025-02-10", 100, 100), // 除息后 T=1
    ];
    const none = adjustDailyBars(bars, [], "none");
    assert.equal(none[0]!.close, 100); // 名义价原样
    assert.equal(none[1]!.close, 100);

    const fwd = adjustDailyBars(bars, [], "forward");
    assert.ok(Math.abs(fwd[0]!.close - 99) < 1e-9); // 历史价下调，消除除息缺口
    assert.ok(Math.abs(fwd[1]!.close - 100) < 1e-9);
  });

  it("空序列与 null OHLC 安全", () => {
    assert.deepEqual(adjustDailyBars([], [], "forward"), []);
    const b: RawDailyBar[] = [
      { time: D("2025-01-02"), open: null, high: null, low: null, close: 10, adjClose: 10, volume: null },
    ];
    const out = adjustDailyBars(b, [], "none");
    assert.equal(out[0]!.open, null);
    assert.equal(out[0]!.volume, null);
    assert.equal(out[0]!.close, 10);
  });

  it("close<=0 时退化为不缩放，不产生 NaN", () => {
    const b: RawDailyBar[] = [bar("2025-01-02", 0, 0, 1)];
    for (const mode of ["forward", "backward", "none"] as const) {
      const out = adjustDailyBars(b, [], mode);
      assert.ok(Number.isFinite(out[0]!.close));
    }
  });

  it("拆股因子按日对齐，忽略 bar 时间戳的盘中偏移", () => {
    // Yahoo 日线时间戳是开盘时刻（非零点），拆股比对须按 UTC 日
    const intraday: RawDailyBar[] = [
      { ...bar("2024-06-07", 120.89, 120.82), time: D("2024-06-07") + 13 * 3600 + 30 * 60 },
      { ...bar("2024-06-10", 121.79, 121.72), time: D("2024-06-10") + 13 * 3600 + 30 * 60 },
    ];
    assert.deepEqual(computeSplitFactors(intraday, nvdaSplits), [10, 1]);
    void DAY;
  });
});
