import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addMonthsUtc,
  stableHash,
  summarizeForecastHorizon,
} from "./sectorRegimeLiveLedger";

test("月度到期日保留月末语义", () => {
  assert.equal(addMonthsUtc(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10), "2026-02-28");
  assert.equal(addMonthsUtc(new Date("2024-01-31T00:00:00Z"), 1).toISOString().slice(0, 10), "2024-02-29");
});

test("信号哈希不受对象键顺序影响", () => {
  assert.equal(stableHash({ b: 2, a: { d: 4, c: 3 } }), stableHash({ a: { c: 3, d: 4 }, b: 2 }));
  assert.notEqual(stableHash({ a: 1 }), stableHash({ a: 2 }));
});

test("未全部到期不提前计算 IC，全部结算后计算排序统计", () => {
  const base = Array.from({ length: 11 }, (_, index) => ({
    horizonMonths: 3,
    targetDate: new Date("2026-11-14T00:00:00Z"),
    sector: `sector-${index + 1}`,
    etf: `XL${index}`,
    rank: index + 1,
    score: 11 - index,
    modelId: "regimeFundamental",
    selectionPassed: true,
    excessReturn: index === 10 ? null : (10 - index) / 100,
    evaluatedAt: index === 10 ? null : new Date("2026-11-15T00:00:00Z"),
  }));
  const partial = summarizeForecastHorizon(base)!;
  assert.equal(partial.status, "partial");
  assert.equal(partial.meanIc, null);

  const scored = summarizeForecastHorizon(base.map((row, index) => ({
    ...row,
    excessReturn: (10 - index) / 100,
    evaluatedAt: new Date("2026-11-15T00:00:00Z"),
  })))!;
  assert.equal(scored.status, "scored");
  assert.equal(scored.meanIc, 1);
  assert.equal(scored.top3HitRate, 1);
  assert.ok((scored.topBottomSpread ?? 0) > 0);
});
