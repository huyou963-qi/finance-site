import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeSectorReturns,
  normalizeNav,
  simpleReturn,
  windowStartSec,
} from "./sectorReturns";

describe("sectorReturns", () => {
  it("simpleReturn computes last/first - 1", () => {
    const pts = [
      { time: 100, close: 100 },
      { time: 200, close: 110 },
    ];
    assert.ok(Math.abs((simpleReturn(pts, 0) ?? 0) - 0.1) < 1e-9);
  });

  it("normalizeNav starts at 100", () => {
    const nav = normalizeNav(
      [
        { time: 10, close: 50 },
        { time: 20, close: 55 },
      ],
      0,
    );
    assert.equal(nav[0]!.value, 100);
    assert.ok(Math.abs(nav[1]!.value - 110) < 1e-9);
  });

  it("windowStartSec YTD is Jan 1 UTC", () => {
    const now = Date.UTC(2026, 6, 9) / 1000;
    const start = windowStartSec("YTD", now);
    assert.equal(start, Date.UTC(2026, 0, 1) / 1000);
  });

  it("simpleReturn with toSec uses range endpoints", () => {
    const pts = [
      { time: 100, close: 100 },
      { time: 200, close: 110 },
      { time: 300, close: 120 },
    ];
    const r = simpleReturn(pts, 100, 200);
    assert.ok(r != null && Math.abs(r - 0.1) < 1e-9);
  });

  it("computeSectorReturns aggregates styles", () => {
    const mk = (start: number, end: number) => [
      { time: 1, close: start },
      { time: 1_000_000, close: end },
    ];
    const closes: Record<string, { time: number; close: number }[]> = {
      SPY: mk(100, 110),
      XLK: mk(100, 120),
      XLC: mk(100, 115),
      XLE: mk(100, 105),
      XLB: mk(100, 105),
      XLI: mk(100, 105),
      XLF: mk(100, 105),
      XLY: mk(100, 105),
      XLRE: mk(100, 105),
      XLP: mk(100, 102),
      XLV: mk(100, 102),
      XLU: mk(100, 102),
    };
    const { sectors, styles, spyReturn } = computeSectorReturns(closes, "3M");
    assert.ok(spyReturn != null && Math.abs(spyReturn - 0.1) < 1e-9);
    const itk = sectors.find((s) => s.sector === "Information Technology");
    assert.ok(itk?.absoluteReturn != null && Math.abs(itk.absoluteReturn - 0.2) < 1e-9);
    const growth = styles.find((s) => s.id === "growth");
    assert.ok(growth?.equalWeightReturn != null);
  });
});
