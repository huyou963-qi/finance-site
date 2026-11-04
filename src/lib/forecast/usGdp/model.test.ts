import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  addMonths,
  addQuarters,
  errorBand,
  errorStats,
  fitEquation,
  gdpFirstRelease,
  gdpGrowthAsOf,
  indicatorAsOf,
  isCovidQuarter,
  latestGdpQuarter,
  runBacktest,
  type DatasetRow,
  type ModelConfig,
  type RevisionLedger,
} from "./model";

const annualized = (ratio: number) => (Math.pow(ratio, 4) - 1) * 100;

function ledger(rows: Record<string, Array<[string, number]>>): RevisionLedger {
  const out: RevisionLedger = new Map();
  for (const [period, revs] of Object.entries(rows)) {
    out.set(period, revs.map(([at, value]) => ({ at, value })));
  }
  return out;
}

test("GDP growth uses only vintages visible on the as-of date", () => {
  const gdp = ledger({
    "2023-10-01": [["2024-01-25", 99]],
    "2024-01-01": [["2024-04-25", 100], ["2024-07-25", 100.5]],
    "2024-04-01": [["2024-07-25", 101]],
  });
  assert.ok(Math.abs(gdpGrowthAsOf(gdp, "2024-01-01", "2024-04-25") - annualized(100 / 99)) < 1e-9);
  assert.ok(Math.abs(gdpGrowthAsOf(gdp, "2024-01-01", "2024-07-24") - annualized(100 / 99)) < 1e-9);
  assert.ok(Math.abs(gdpGrowthAsOf(gdp, "2024-01-01", "2024-07-25") - annualized(100.5 / 99)) < 1e-9);
  assert.ok(Number.isNaN(gdpGrowthAsOf(gdp, "2024-04-01", "2024-07-24")));
  const first = gdpFirstRelease(gdp, "2024-04-01");
  assert.equal(first?.at, "2024-07-25");
  assert.ok(Math.abs(first!.growth - annualized(101 / 100.5)) < 1e-9);
  assert.equal(latestGdpQuarter(gdp, "2024-07-24"), "2024-01-01");
  assert.equal(latestGdpQuarter(gdp, "2024-07-25"), "2024-04-01");
});

test("monthly indicator ignores vintages published after the as-of date", () => {
  const start = "2015-01-01";
  const rows: Record<string, Array<[string, number]>> = {};
  for (let i = 0; i < 80; i++) {
    const month = addMonths(start, i);
    rows[month] = [[addDays(addMonths(month, 1), 6), 100 * Math.pow(1.002, i)]];
  }
  rows["2021-03-01"] = [[addDays(addMonths("2021-03-01", 1), 6), 250]];
  const series = ledger(rows);
  const q = "2021-01-01";
  const before = indicatorAsOf(series, { key: "A", transform: "growth" }, q, "2021-04-06");
  const after = indicatorAsOf(series, { key: "A", transform: "growth" }, q, "2021-04-07");
  assert.equal(before?.observed, 2);
  assert.equal(after?.observed, 3);
  assert.ok(before && after && before.value !== after.value);

  const hiddenRevision = ledger({
    ...rows,
    "2021-01-01": [[addDays(addMonths("2021-01-01", 1), 6), rows["2021-01-01"]![0]![1]], ["2021-06-01", 1]],
  });
  const unchanged = indicatorAsOf(hiddenRevision, { key: "A", transform: "growth" }, q, "2021-04-07");
  assert.ok(unchanged && Math.abs(unchanged.value - after!.value) < 1e-9);
  assert.equal(indicatorAsOf(series, { key: "A", transform: "nx" }, q, "2021-04-07"), null);
});

function row(i: number, x: number, y: number, quarter = addQuarters("2010-01-01", i)): DatasetRow {
  const releaseAt = addDays(addQuarters(quarter, 1), 27);
  return {
    quarter,
    releaseAt,
    asOf: addDays(releaseAt, -1),
    x: { A: { value: x, observed: 3 }, B: { value: x + (i % 5) - 2, observed: 3 } },
    y,
    prevQ: y,
    mean40: y,
  };
}

const cfg: ModelConfig = {
  equations: [
    { key: "A", inputs: ["A"] },
    { key: "B", inputs: ["B"] },
  ],
  window: 40,
  minTrain: 8,
  weightWindow: 0,
};

test("bridge equation ignores quarters not yet released and later outcomes", () => {
  const rows = Array.from({ length: 24 }, (_, i) => row(i, i, 1 + 2 * i));
  const target = rows[20]!;
  const fit = fitEquation(rows, target, cfg, cfg.equations[0]!)!;
  assert.equal(fit.n, 20);
  assert.ok(Math.abs(fit.coef.A! - 2) < 1e-8);
  assert.ok(Math.abs(fit.intercept - 1) < 1e-8);

  const late = rows.map((r, i) => (i === 10 ? { ...r, releaseAt: "2099-01-01" } : r));
  assert.equal(fitEquation(late, late[20]!, cfg, cfg.equations[0]!)!.n, 19);

  const poisoned = rows.map((r, i) => (i === 23 ? { ...r, y: 999 } : r));
  const fit2 = fitEquation(poisoned, poisoned[20]!, cfg, cfg.equations[0]!)!;
  assert.equal(fit2.intercept, fit.intercept);
  assert.equal(fit2.coef.A, fit.coef.A);
});

test("backtest weights sum to one and covid quarters stay out of the fit", () => {
  const rows = Array.from({ length: 28 }, (_, i) => row(i, i, 1 + 2 * i, addQuarters("2016-01-01", i)));
  const withCovid = rows.map((r) => (isCovidQuarter(r.quarter) ? { ...r, y: 500 } : r));
  const without = withCovid.filter((r) => !isCovidQuarter(r.quarter));
  const target = withCovid.find((r) => r.quarter === "2022-01-01")!;
  const a = fitEquation(withCovid, target, cfg, cfg.equations[0]!)!;
  const b = fitEquation(without, target, cfg, cfg.equations[0]!)!;
  assert.equal(a.n, b.n);
  assert.equal(a.coef.A, b.coef.A);

  const one: ModelConfig = { ...cfg, equations: [cfg.equations[0]!] };
  const points = runBacktest(rows, one, rows[12]!.quarter);
  assert.ok(points.length > 0);
  for (const p of points) assert.ok(Math.abs(p.forecast - p.y) < 1e-6);
  const weighted = runBacktest(rows, { ...cfg, weightWindow: 4 }, rows[16]!.quarter);
  for (const p of weighted) {
    assert.ok(Math.abs(p.parts.reduce((s, part) => s + part.weight, 0) - 1) < 1e-9);
  }
  const stats = errorStats(points.map((p) => p.forecast), points.map((p) => p.y));
  assert.equal(stats.n, points.length);
  assert.ok(stats.mae < 1e-6);
  const band = errorBand(points);
  assert.ok(Number.isFinite(band.lower) && Number.isFinite(band.upper) && band.lower <= band.upper);
});
