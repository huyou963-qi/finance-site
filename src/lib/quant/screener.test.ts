import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  marketCapOf,
  pivotFactorRows,
  referencedFactorKeys,
  runScreener,
  validateScreenerConfig,
  type FactorLongRow,
  type ScreenerConfig,
  type ScreenerInputRow,
} from "./screener";

/** 造宽行：factors 传 { key: value } 或 { key: {value,zscore,sectorZscore} } */
function row(
  symbol: string,
  factors: Record<string, number | { value?: number | null; zscore?: number | null; sectorZscore?: number | null }>,
  meta: { name?: string; sector?: string | null } = {},
): ScreenerInputRow {
  const out: ScreenerInputRow = {
    symbol,
    name: meta.name ?? symbol,
    sector: meta.sector === undefined ? "Information Technology" : meta.sector,
    factors: {},
  };
  for (const [k, v] of Object.entries(factors)) {
    if (typeof v === "number") {
      out.factors[k] = { value: v, zscore: v, sectorZscore: v };
    } else {
      out.factors[k] = {
        value: v.value ?? null,
        zscore: v.zscore ?? null,
        sectorZscore: v.sectorZscore ?? null,
      };
    }
  }
  return out;
}

function cfg(partial: Partial<ScreenerConfig>): ScreenerConfig {
  return {
    conditions: [],
    ranking: { mode: "single" },
    ...partial,
  };
}

describe("validateScreenerConfig", () => {
  it("rejects unknown factor / metric / op and bad bounds", () => {
    assert.throws(() => validateScreenerConfig(cfg({ conditions: [{ factorKey: "nope", metric: "value", op: "gte", bounds: { min: 0 } }] })), /未知因子/);
    assert.throws(() => validateScreenerConfig(cfg({ conditions: [{ factorKey: "roeTtm", metric: "value", op: "gte", bounds: {} }] })), /需要 bounds\.min/);
    assert.throws(() => validateScreenerConfig(cfg({ conditions: [{ factorKey: "roeTtm", metric: "value", op: "between", bounds: { min: 2, max: 1 } }] })), /min 不能大于 max/);
    assert.throws(() => validateScreenerConfig(cfg({ ranking: { mode: "composite", weights: [] } })), /非空 weights/);
    assert.throws(() => validateScreenerConfig(cfg({ ranking: { mode: "single", topN: 0 } })), /topN/);
    assert.throws(() => validateScreenerConfig(cfg({ date: "2023/06/30" })), /YYYY-MM-DD/);
    // 合法配置不抛
    validateScreenerConfig(cfg({
      date: "2023-06-30",
      conditions: [{ factorKey: "roeTtm", metric: "zscore", op: "between", bounds: { min: 0, max: 2 } }],
      ranking: { mode: "composite", weights: [{ factorKey: "roeTtm", weight: 1 }], topN: 10 },
    }));
  });
});

describe("pivotFactorRows", () => {
  it("pivots long rows into per-symbol wide rows with meta", () => {
    const long: FactorLongRow[] = [
      { symbol: "AAPL", factorKey: "roeTtm", value: 1.5, zscore: 2, sectorZscore: 1 },
      { symbol: "AAPL", factorKey: "ret1m", value: 0.05, zscore: 0.3, sectorZscore: null },
      { symbol: "MSFT", factorKey: "roeTtm", value: 0.4, zscore: 0.9, sectorZscore: 0.5 },
    ];
    const meta = new Map([
      ["AAPL", { name: "Apple", sector: "Information Technology" }],
    ]);
    const rows = pivotFactorRows(long, meta);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.symbol, "AAPL");
    assert.equal(rows[0]!.name, "Apple");
    assert.equal(rows[0]!.factors["ret1m"]!.value, 0.05);
    // meta 缺失的 symbol 名称/行业为 null
    assert.equal(rows[1]!.name, null);
    assert.equal(rows[1]!.sector, null);
  });
});

describe("runScreener 过滤", () => {
  const rows = [
    row("AAA", { roeTtm: { value: 0.3, zscore: 1.2 } }),
    row("BBB", { roeTtm: { value: 0.1, zscore: -0.5 } }),
    row("CCC", { roeTtm: { value: null, zscore: null } }),
    row("DDD", {}),
  ];

  it("gte on zscore keeps matches; null rows dropped and counted", () => {
    const res = runScreener(rows, cfg({
      conditions: [{ factorKey: "roeTtm", metric: "zscore", op: "gte", bounds: { min: 0 } }],
    }));
    assert.deepEqual(res.rows.map((r) => r.symbol), ["AAA"]);
    assert.equal(res.stats.universeTotal, 4);
    assert.equal(res.stats.droppedNull, 2); // CCC（value null）+ DDD（无该因子行）
    assert.equal(res.stats.excludedByNull["roeTtm"], 2);
    assert.equal(res.stats.filteredOut, 1); // BBB
    assert.equal(res.stats.matched, 1);
  });

  it("between is a closed interval", () => {
    const res = runScreener(rows, cfg({
      conditions: [{ factorKey: "roeTtm", metric: "value", op: "between", bounds: { min: 0.1, max: 0.3 } }],
    }));
    // 边界值 0.1 / 0.3 都应包含
    assert.deepEqual(res.rows.map((r) => r.symbol).sort(), ["AAA", "BBB"]);
  });

  it("sector universe filter excludes other/null sectors and counts them", () => {
    const mixed = [
      row("AAA", { ret1m: 0.1 }, { sector: "Energy" }),
      row("BBB", { ret1m: 0.2 }),
      row("CCC", { ret1m: 0.3 }, { sector: null }),
    ];
    const res = runScreener(mixed, cfg({
      universe: { sectors: ["Energy"] },
      conditions: [{ factorKey: "ret1m", metric: "value", op: "gte", bounds: { min: 0 } }],
    }));
    assert.deepEqual(res.rows.map((r) => r.symbol), ["AAA"]);
    assert.equal(res.stats.excludedBySector, 2);
  });

  it("minMarketCap filters via exp(logMarketCap) and drops null marketCap", () => {
    const mixed = [
      row("BIG", { logMarketCap: Math.log(5e9), ret1m: 0.1 }),
      row("SML", { logMarketCap: Math.log(1e9), ret1m: 0.2 }),
      row("NON", { ret1m: 0.3 }),
    ];
    assert.ok(Math.abs(marketCapOf(mixed[0]!)! - 5e9) < 1);
    const res = runScreener(mixed, cfg({
      universe: { minMarketCap: 2e9 },
      conditions: [{ factorKey: "ret1m", metric: "value", op: "gte", bounds: { min: 0 } }],
    }));
    assert.deepEqual(res.rows.map((r) => r.symbol), ["BIG"]);
    assert.equal(res.stats.excludedByMarketCap, 2);
    assert.ok(Math.abs(res.rows[0]!.marketCap! - 5e9) < 1);
  });
});

describe("runScreener 排序与打分", () => {
  it("single mode sorts descending when higherIsBetter", () => {
    const rows = [
      row("AAA", { roeTtm: { value: 0.1 } }),
      row("BBB", { roeTtm: { value: 0.3 } }),
      row("CCC", { roeTtm: { value: 0.2 } }),
    ];
    const res = runScreener(rows, cfg({
      ranking: { mode: "single", sortFactor: "roeTtm" },
    }));
    assert.deepEqual(res.rows.map((r) => r.symbol), ["BBB", "CCC", "AAA"]);
    assert.equal(res.rows[0]!.score, null);
  });

  it("single mode flips direction for lower-is-better factors (vol60d)", () => {
    const rows = [
      row("HIV", { vol60d: { value: 0.6 } }),
      row("LOV", { vol60d: { value: 0.2 } }),
      row("MID", { vol60d: { value: 0.4 } }),
    ];
    const res = runScreener(rows, cfg({
      ranking: { mode: "single", sortFactor: "vol60d" },
    }));
    // 波动越低越好 → 升序
    assert.deepEqual(res.rows.map((r) => r.symbol), ["LOV", "MID", "HIV"]);
  });

  it("composite score = Σ weight×zscore×direction, with direction flip", () => {
    // debtToAssets 是 higherIsBetter=false：z 越低贡献越正
    const rows = [
      row("GOOD", { roeTtm: { value: 1, zscore: 1 }, debtToAssets: { value: 0.2, zscore: -1 } }),
      row("BAD", { roeTtm: { value: 0, zscore: -1 }, debtToAssets: { value: 0.8, zscore: 1 } }),
    ];
    const res = runScreener(rows, cfg({
      ranking: {
        mode: "composite",
        weights: [
          { factorKey: "roeTtm", weight: 2 },
          { factorKey: "debtToAssets", weight: 1 },
        ],
      },
    }));
    assert.deepEqual(res.rows.map((r) => r.symbol), ["GOOD", "BAD"]);
    assert.equal(res.rows[0]!.score, 2 * 1 + 1 * (-1) * -1); // = 3
    assert.equal(res.rows[1]!.score, -3);
  });

  it("composite mode drops rows missing any weighted zscore and counts them", () => {
    const rows = [
      row("FULL", { roeTtm: { value: 1, zscore: 1 }, ret1m: { value: 0.1, zscore: 0.5 } }),
      row("PART", { roeTtm: { value: 1, zscore: 1 }, ret1m: { value: 0.1, zscore: null } }),
    ];
    const res = runScreener(rows, cfg({
      ranking: {
        mode: "composite",
        weights: [
          { factorKey: "roeTtm", weight: 1 },
          { factorKey: "ret1m", weight: 1 },
        ],
      },
    }));
    assert.deepEqual(res.rows.map((r) => r.symbol), ["FULL"]);
    assert.equal(res.stats.excludedByNull["ret1m"], 1);
    assert.equal(res.stats.droppedNull, 1);
  });

  it("topN truncates after sorting; stats keep full matched count", () => {
    const rows = [
      row("AAA", { ret1m: { value: 0.1 } }),
      row("BBB", { ret1m: { value: 0.3 } }),
      row("CCC", { ret1m: { value: 0.2 } }),
    ];
    const res = runScreener(rows, cfg({
      ranking: { mode: "single", sortFactor: "ret1m", topN: 2 },
    }));
    assert.deepEqual(res.rows.map((r) => r.symbol), ["BBB", "CCC"]);
    assert.equal(res.stats.matched, 3);
    assert.equal(res.stats.returned, 2);
  });
});

describe("runScreener percentile", () => {
  it("computes percentile over the post-universe cross-section with ties averaged", () => {
    const rows = [
      row("P00", { ret1m: { value: 0.0 } }),
      row("P50A", { ret1m: { value: 0.5 } }),
      row("P50B", { ret1m: { value: 0.5 } }),
      row("P100", { ret1m: { value: 1.0 } }),
      row("PNULL", { ret1m: { value: null } }),
    ];
    const res = runScreener(rows, cfg({
      conditions: [{ factorKey: "ret1m", metric: "percentile", op: "gte", bounds: { min: 0.5 } }],
    }));
    // 分位（4 个有效值）：0 → 0，两个 0.5 并列 → (1+2)/2/3 = 0.5，1.0 → 1
    assert.deepEqual(res.rows.map((r) => r.symbol).sort(), ["P100", "P50A", "P50B"]);
    const p = new Map(res.rows.map((r) => [r.symbol, r.factors["ret1m"]!.percentile]));
    assert.equal(p.get("P100"), 1);
    assert.equal(p.get("P50A"), 0.5);
    // null 值行剔除并计数
    assert.equal(res.stats.excludedByNull["ret1m"], 1);
  });

  it("percentile boundary: gte 0 keeps the minimum, lte 1 keeps the maximum", () => {
    const rows = [
      row("LO", { ret1m: { value: -0.5 } }),
      row("HI", { ret1m: { value: 0.5 } }),
    ];
    const keepAll = runScreener(rows, cfg({
      conditions: [{ factorKey: "ret1m", metric: "percentile", op: "between", bounds: { min: 0, max: 1 } }],
    }));
    assert.equal(keepAll.rows.length, 2);
  });
});

describe("referencedFactorKeys / 输出裁剪", () => {
  it("collects keys from conditions + sortFactor + weights, output limited to them", () => {
    const config = cfg({
      conditions: [{ factorKey: "roeTtm", metric: "zscore", op: "gte", bounds: { min: 0 } }],
      ranking: { mode: "composite", weights: [{ factorKey: "ret1m", weight: 1 }] },
    });
    assert.deepEqual(referencedFactorKeys(config).sort(), ["ret1m", "roeTtm"]);
    const rows = [
      row("AAA", { roeTtm: { value: 1, zscore: 1 }, ret1m: { value: 0.1, zscore: 0.2 }, vol60d: { value: 0.3, zscore: 0 } }),
    ];
    const res = runScreener(rows, config);
    assert.deepEqual(Object.keys(res.rows[0]!.factors).sort(), ["ret1m", "roeTtm"]);
  });
});
