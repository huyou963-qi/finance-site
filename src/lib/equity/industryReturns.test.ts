import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeEqualWeightBasketReturn,
  computeSymbolReturns,
} from "./industryReturns";
import type { ClosePoint } from "./sectorReturns";

function pts(start: number, end: number, days = 5): ClosePoint[] {
  const out: ClosePoint[] = [];
  for (let i = 0; i < days; i++) {
    const t = 1_700_000_000 + i * 86400;
    const close = start + ((end - start) * i) / (days - 1);
    out.push({ time: t, close });
  }
  return out;
}

describe("industryReturns", () => {
  it("computes equal-weight basket return", () => {
    const closes = {
      A: pts(100, 110),
      B: pts(200, 180),
      SPY: pts(400, 420),
    };
    const from = closes.A[0]!.time;
    const to = closes.A[closes.A.length - 1]!.time;
    const basket = computeEqualWeightBasketReturn(closes, ["A", "B"], from, to, closes.SPY);
    assert.ok(basket.equalWeightReturn != null);
    assert.ok(Math.abs(basket.equalWeightReturn! - 0) < 0.02);
    assert.ok(basket.excessVsSpy != null);
    assert.equal(basket.memberCount, 2);
  });

  it("computes per-symbol excess vs spy", () => {
    const closes = { A: pts(100, 120), SPY: pts(100, 110) };
    const from = closes.A[0]!.time;
    const to = closes.A[closes.A.length - 1]!.time;
    const rows = computeSymbolReturns(closes, ["A"], from, to, 0.1);
    assert.equal(rows.length, 1);
    assert.ok(rows[0]!.absoluteReturn != null);
    assert.ok(rows[0]!.excessVsSpy != null);
  });
});
