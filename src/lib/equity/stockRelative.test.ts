import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEqualWeightNavPoints,
  computeRelativeSeries,
  computeSymbolReturnsVsBaskets,
} from "./stockRelative";
import type { ClosePoint } from "./sectorReturns";

const T0 = 1_700_000_000;

function pts(start: number, end: number, days = 5): ClosePoint[] {
  const out: ClosePoint[] = [];
  for (let i = 0; i < days; i++) {
    out.push({ time: T0 + i * 86400, close: start + ((end - start) * i) / (days - 1) });
  }
  return out;
}

describe("stockRelative", () => {
  it("builds equal-weight nav starting at 100", () => {
    const closes = { A: pts(100, 110), B: pts(50, 45) };
    const nav = buildEqualWeightNavPoints(closes, ["A", "B"], T0);
    assert.equal(nav.length, 5);
    assert.ok(Math.abs(nav[0]!.close - 100) < 1e-9);
    // A +10%、B -10% → 等权终值 100
    assert.ok(Math.abs(nav[nav.length - 1]!.close - 100) < 1e-9);
  });

  it("skips symbols without enough data", () => {
    const closes = { A: pts(100, 120), B: [{ time: T0, close: 10 }] };
    const nav = buildEqualWeightNavPoints(closes, ["A", "B"], T0);
    // 只剩 A：终值 = 120
    assert.ok(Math.abs(nav[nav.length - 1]!.close - 120) < 1e-9);
  });

  it("computes RS line vs benchmark on common days", () => {
    const stock = pts(100, 120); // +20%
    const bench = pts(200, 220); // +10%
    const rs = computeRelativeSeries(stock, bench, T0);
    assert.equal(rs.length, 5);
    assert.ok(Math.abs(rs[0]!.value - 100) < 1e-9);
    // 终点 RS = 1.2 / 1.1 * 100
    assert.ok(Math.abs(rs[rs.length - 1]!.value - (1.2 / 1.1) * 100) < 1e-9);
  });

  it("aligns RS on intersection of trading days", () => {
    const stock = pts(100, 120);
    const bench = pts(200, 220).filter((_, i) => i !== 2); // 基准缺一天
    const rs = computeRelativeSeries(stock, bench, T0);
    assert.equal(rs.length, 4);
  });

  it("computes returns vs spy / sector etf / industry nav", () => {
    const closes = { A: pts(100, 120) }; // +20%
    const spy = pts(100, 110); // +10%
    const etf = pts(100, 105); // +5%
    const nav = pts(100, 115); // +15%
    const to = T0 + 4 * 86400;
    const rows = computeSymbolReturnsVsBaskets(closes, ["A"], T0, to, {
      spyCloses: spy,
      sectorEtfCloses: etf,
      industryNav: nav,
    });
    assert.equal(rows.length, 1);
    const r = rows[0]!;
    assert.ok(Math.abs(r.absoluteReturn! - 0.2) < 1e-9);
    assert.ok(Math.abs(r.excessVsSpy! - 0.1) < 1e-9);
    assert.ok(Math.abs(r.excessVsSectorEtf! - 0.15) < 1e-9);
    assert.ok(Math.abs(r.excessVsIndustry! - 0.05) < 1e-9);
  });

  it("returns null excess when benchmark missing", () => {
    const closes = { A: pts(100, 120) };
    const rows = computeSymbolReturnsVsBaskets(closes, ["A"], T0, T0 + 4 * 86400, {});
    assert.equal(rows[0]!.excessVsSpy, null);
    assert.equal(rows[0]!.excessVsIndustry, null);
  });
});
