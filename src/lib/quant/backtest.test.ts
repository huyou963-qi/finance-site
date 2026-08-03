import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRebalanceCalendar,
  computeMetrics,
  computeRegimeCoverage,
  isValidRegimeFilterKey,
  regimeAllowed,
  dayToIso,
  isoToDay,
  normalizeScoreWeights,
  runBacktest,
  strategyDataFloor,
  type BacktestDataset,
  type BacktestParams,
  type RebalanceSelection,
  type SymbolPrices,
} from "./backtest";
import type { ScreenerConfig } from "./screener";
import { FACTOR_MAP } from "./factorRegistry";

// ────────────────────────────────────────────────────────── 测试工具

const D0 = isoToDay("2024-01-01");

/** 从 D0+offset 起的连续整日序列（回测引擎不关心周末，日历任意） */
function series(offset: number, closes: number[]): SymbolPrices {
  return { days: closes.map((_, i) => D0 + offset + i), closes };
}

function dataset(
  prices: Record<string, SymbolPrices>,
  opts: { calendarDays?: number; bench?: SymbolPrices | null } = {},
): BacktestDataset {
  const n = opts.calendarDays ?? Math.max(...Object.values(prices).map((p) => p.days.length));
  const calendar = Array.from({ length: n }, (_, i) => D0 + i);
  return {
    calendar,
    prices: new Map(Object.entries(prices)),
    bench: opts.bench === undefined ? null : opts.bench,
  };
}

function sel(dayOffset: number, symbols: (string | { symbol: string; marketCap?: number | null; score?: number | null })[]): RebalanceSelection {
  return {
    date: dayToIso(D0 + dayOffset),
    rows: symbols.map((s) =>
      typeof s === "string"
        ? { symbol: s, marketCap: null, score: null }
        : { symbol: s.symbol, marketCap: s.marketCap ?? null, score: s.score ?? null },
    ),
  };
}

function params(partial: Partial<BacktestParams> = {}): BacktestParams {
  return { weighting: "equal", execution: "nextClose", costBps: 0, ...partial };
}

function cfg(partial: Partial<ScreenerConfig> = {}): ScreenerConfig {
  return { conditions: [], ranking: { mode: "single" }, ...partial };
}

// ────────────────────────────────────────────────────────── 调仓日历

describe("buildRebalanceCalendar", () => {
  it("dedupes to the last date of each natural month", () => {
    const out = buildRebalanceCalendar([
      "2026-05-29",
      "2026-06-30",
      "2026-07-09",
      "2026-07-10",
      "2026-07-13",
    ]);
    assert.deepEqual(out, ["2026-05-29", "2026-06-30", "2026-07-13"]);
  });

  it("clips by start/end", () => {
    const out = buildRebalanceCalendar(
      ["2020-01-31", "2020-02-28", "2020-03-31", "2020-04-30"],
      { start: "2020-02-01", end: "2020-03-31" },
    );
    assert.deepEqual(out, ["2020-02-28", "2020-03-31"]);
  });

  it("quarterly 每 3 个月取一期，首期与月频一致", () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      `2020-${String(i + 1).padStart(2, "0")}-28`,
    );
    const out = buildRebalanceCalendar(months, { frequency: "quarterly" });
    assert.deepEqual(out, ["2020-01-28", "2020-04-28", "2020-07-28", "2020-10-28"]);
  });

  it("抽稀发生在裁剪之后（相位跟随 start，两次回测可比）", () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      `2020-${String(i + 1).padStart(2, "0")}-28`,
    );
    const out = buildRebalanceCalendar(months, { start: "2020-02-01", frequency: "quarterly" });
    assert.equal(out[0], "2020-02-28");
    assert.deepEqual(out, ["2020-02-28", "2020-05-28", "2020-08-28", "2020-11-28"]);
  });

  it("semiannual / annual 步长正确", () => {
    const months = Array.from({ length: 24 }, (_, i) => {
      const y = 2020 + Math.floor(i / 12);
      const m = (i % 12) + 1;
      return `${y}-${String(m).padStart(2, "0")}-28`;
    });
    assert.equal(buildRebalanceCalendar(months, { frequency: "semiannual" }).length, 4);
    assert.deepEqual(buildRebalanceCalendar(months, { frequency: "annual" }), [
      "2020-01-28",
      "2021-01-28",
    ]);
  });
});

describe("strategyDataFloor", () => {
  it("technical-only strategy starts at 2000", () => {
    const config = cfg({
      conditions: [{ factorKey: "mom12_1", metric: "zscore", op: "gte", bounds: { min: 0 } }],
      ranking: { mode: "single", sortFactor: "mom12_1", topN: 50 },
    });
    assert.equal(strategyDataFloor(config, "equal"), "2000-01-01");
  });

  // 断言「下限 = 注册表 startYear」这个机制本身，而非某个年份字面量
  // （深历史回填会下调 startYear，写死年份的断言只会变成噪音）
  it("fundamental factor raises floor to its startYear", () => {
    const config = cfg({
      conditions: [{ factorKey: "roeTtm", metric: "zscore", op: "gte", bounds: { min: 0.5 } }],
    });
    assert.equal(strategyDataFloor(config, "equal"), `${FACTOR_MAP.get("roeTtm")!.startYear}-01-01`);
  });

  it("mcap weighting / minMarketCap imply logMarketCap floor", () => {
    const floor = `${FACTOR_MAP.get("logMarketCap")!.startYear}-01-01`;
    assert.equal(strategyDataFloor(cfg(), "mcap"), floor);
    assert.equal(strategyDataFloor(cfg({ universe: { minMarketCap: 1e9 } }), "equal"), floor);
  });
});

// ────────────────────────────────────────────────────────── 权重

describe("normalizeScoreWeights", () => {
  it("all-positive scores are proportional", () => {
    assert.deepEqual(normalizeScoreWeights([3, 1]), [0.75, 0.25]);
  });

  it("negative scores are shifted, order-preserving, sum to 1", () => {
    const w = normalizeScoreWeights([2, 0, -2]);
    assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    assert.ok(w[0]! > w[1]! && w[1]! > w[2]!);
    assert.ok(w[2]! > 0); // 最差者仍有正权重
  });

  it("identical scores fall back to equal weights", () => {
    assert.deepEqual(normalizeScoreWeights([-1, -1]), [0.5, 0.5]);
  });
});

// ────────────────────────────────────────────────────────── 引擎核心

describe("runBacktest", () => {
  it("single-stock buy-and-hold NAV equals adjClose ratio bitwise (identity a)", () => {
    const closes = [100, 101.5, 99.2, 103.7, 108.1, 107.3, 111.9, 110.4];
    const ds = dataset({ A: series(0, closes) });
    // 两个调仓期都选同一只：零交易守卫应保持持仓不重建
    const res = runBacktest(ds, [sel(0, ["A"]), sel(4, ["A"])], params());
    // nextClose：信号日 offset0 → 执行日 offset1，入场价 closes[1]
    const entry = closes[1]!;
    assert.equal(res.nav.length, 7);
    res.nav.forEach((p, i) => {
      const px = closes[i + 1]!;
      const expected = px === entry ? 1 : px / entry;
      assert.equal(p.nav, expected, `day ${p.date}`);
    });
    assert.equal(res.periods[1]!.turnover, 0);
    assert.equal(res.positions[1]!.exitReason, "endOfBacktest");
    assert.equal(res.positions[0]!.exitReason, "carried");
  });

  it("is bitwise reproducible (identity e)", () => {
    const ds = dataset({
      A: series(0, [10, 11, 9, 12, 13, 12.5]),
      B: series(0, [20, 19, 21, 22, 20, 23]),
    });
    const sels = [sel(0, ["A", "B"]), sel(3, ["B"])];
    const p = params({ costBps: 10 });
    const r1 = runBacktest(ds, sels, p);
    const r2 = runBacktest(ds, sels, p);
    assert.deepEqual(r1, r2);
  });

  it("equal weighting splits NAV in half and drifts buy-and-hold", () => {
    const ds = dataset({
      A: series(0, [100, 100, 200, 200]), // 执行日后翻倍
      B: series(0, [50, 50, 50, 50]),
    });
    const res = runBacktest(ds, [sel(0, ["A", "B"])], params());
    // 执行日 NAV=1（各 0.5）；A 翻倍后 NAV = 0.5×2 + 0.5×1 = 1.5
    assert.equal(res.nav[0]!.nav, 1);
    assert.equal(res.nav[1]!.nav, 1.5);
    assert.deepEqual(res.positions.map((p) => p.weight), [0.5, 0.5]);
  });

  it("mcap weighting is proportional; null mcap dropped and counted", () => {
    const ds = dataset({
      A: series(0, [10, 10, 10]),
      B: series(0, [10, 10, 10]),
      C: series(0, [10, 10, 10]),
    });
    const res = runBacktest(
      ds,
      [sel(0, [{ symbol: "A", marketCap: 300 }, { symbol: "B", marketCap: 100 }, { symbol: "C" }])],
      params({ weighting: "mcap" }),
    );
    assert.equal(res.periods[0]!.droppedNoWeight, 1);
    assert.deepEqual(res.positions.map((p) => [p.symbol, p.weight]), [["A", 0.75], ["B", 0.25]]);
  });

  it("score weighting uses normalized composite scores", () => {
    const ds = dataset({ A: series(0, [10, 10]), B: series(0, [10, 10]) }, { calendarDays: 2 });
    const res = runBacktest(
      ds,
      [sel(0, [{ symbol: "A", score: 3 }, { symbol: "B", score: 1 }])],
      params({ weighting: "score" }),
    );
    assert.deepEqual(res.positions.map((p) => p.weight), [0.75, 0.25]);
  });

  it("charges cost on double-sided traded notional (full switch = 2x)", () => {
    const flat = [10, 10, 10, 10, 10, 10];
    const ds = dataset({ A: series(0, flat), B: series(0, flat) });
    const res = runBacktest(ds, [sel(0, ["A"]), sel(2, ["B"])], params({ costBps: 100 })); // 1%
    // 首期：全买入 turnover=1，cost=1%
    assert.equal(res.periods[0]!.turnover, 1);
    assert.ok(Math.abs(res.nav[0]!.nav - 0.99) < 1e-12);
    // 换仓期：卖 A 买 B 双边 turnover=2，cost=2%×0.99
    assert.equal(res.periods[1]!.turnover, 2);
    const expected = 0.99 * (1 - 0.02);
    assert.ok(Math.abs(res.nav[2]!.nav - expected) < 1e-12);
    assert.equal(res.positions[0]!.exitReason, "sold");
  });

  it("liquidates terminated price series to cash without sell cost (rule b)", () => {
    const ds = dataset(
      {
        A: series(0, [10, 10, 20]), // 执行日(1)后翻倍，随后序列终止（>7 天陈旧）
        B: series(0, Array(15).fill(5) as number[]),
      },
      { calendarDays: 15 },
    );
    const res = runBacktest(ds, [sel(0, ["A", "B"]), sel(11, ["B"])], params({ costBps: 100 }));
    const p2 = res.periods[1]!;
    assert.equal(p2.liquidated, 1);
    // 调仓前 NAV：A 冻结在 0.495×2=0.99，B 0.495；navPre=1.485
    // A 转现金不计卖出成本；买入 B 差额 = 0.99 → cost = 0.0099
    assert.ok(Math.abs(p2.cost - 0.99 * 0.01) < 1e-12);
    assert.ok(Math.abs(p2.turnover - 0.99 / 1.485) < 1e-12);
    const aRow = res.positions.find((r) => r.symbol === "A")!;
    assert.equal(aRow.exitReason, "liquidated");
  });

  it("skips selected symbols without usable price and renormalizes (rule c)", () => {
    const ds = dataset({ A: series(0, [10, 10, 12]) }, { calendarDays: 3 });
    const res = runBacktest(ds, [sel(0, ["A", "GHOST"])], params());
    assert.equal(res.periods[0]!.noPriceSkipped, 1);
    assert.deepEqual(res.positions.map((p) => [p.symbol, p.weight]), [["A", 1]]);
    assert.equal(res.nav[1]!.nav, 12 / 10);
  });

  it("nextClose executes at T+1 close, sameClose at close on/before T", () => {
    const closes = [10, 20, 40, 40];
    const ds = dataset({ A: series(0, closes) });
    const next = runBacktest(ds, [sel(1, ["A"])], params({ execution: "nextClose" }));
    assert.equal(next.periods[0]!.execDate, dayToIso(D0 + 2)); // 入场 40
    assert.equal(next.nav[next.nav.length - 1]!.nav, 1);
    const same = runBacktest(ds, [sel(1, ["A"])], params({ execution: "sameClose" }));
    assert.equal(same.periods[0]!.execDate, dayToIso(D0 + 1)); // 入场 20
    assert.equal(same.nav[same.nav.length - 1]!.nav, 2);
  });

  it("tracks benchmark NAV aligned to the same start", () => {
    const bench = series(0, [100, 100, 110, 121]);
    const ds = dataset({ A: series(0, [10, 10, 10, 10]) }, { bench });
    const res = runBacktest(ds, [sel(0, ["A"])], params());
    assert.equal(res.nav[0]!.benchNav, 1);
    assert.ok(Math.abs(res.nav[2]!.benchNav! - 1.21) < 1e-12);
  });

  it("empty selection moves the portfolio to cash", () => {
    const ds = dataset({ A: series(0, [10, 10, 20, 40, 40]) });
    const res = runBacktest(ds, [sel(0, ["A"]), sel(2, [])], params());
    // 第二期清仓：exec 于 offset3（A=40，NAV=4），此后 NAV 不再变动
    assert.equal(res.nav[3]!.nav, 4);
    assert.equal(res.nav[res.nav.length - 1]!.nav, 4);
    assert.equal(res.periods[1]!.held, 0);
  });
});

// ────────────────────────────────────────────────────────── 指标

describe("computeMetrics", () => {
  it("computes CAGR / drawdown / monthly win rate on a constructed series", () => {
    // 一年翻倍：2024-01-01 → 2024-12-31（365 个自然日间隔）
    const navPts = [
      { date: "2024-01-01", nav: 1, benchNav: 1 },
      { date: "2024-01-31", nav: 1.2, benchNav: 1.1 },
      { date: "2024-02-29", nav: 0.9, benchNav: 1.0 },
      { date: "2024-03-31", nav: 1.5, benchNav: 1.2 },
      { date: "2024-12-31", nav: 2, benchNav: 1.5 },
    ];
    const m = computeMetrics(navPts, 6);
    // CAGR：365 天翻倍 ≈ 2^(365.25/365)−1
    assert.ok(Math.abs(m.cagr - (Math.pow(2, 365.25 / 365) - 1)) < 1e-9);
    // 最大回撤 = 0.9/1.2 − 1 = −0.25
    assert.ok(Math.abs(m.maxDrawdown - (0.9 / 1.2 - 1)) < 1e-12);
    assert.equal(m.monthlyCount, 4);
    // 月度 vs 基准：1月赢(20%>10%)、2月输(−25%<−9%)、3月赢、12月赢 → 3/4
    assert.equal(m.monthlyWinRate, 0.75);
    // 平均年换手 = 6/2 / (365/365.25)
    assert.ok(Math.abs(m.avgAnnualTurnover - 3 / (365 / 365.25)) < 1e-9);
    assert.ok(m.calmar != null && m.calmar > 0);
  });

  it("degenerates gracefully on short series", () => {
    const m = computeMetrics([{ date: "2024-01-01", nav: 1, benchNav: null }], 0);
    assert.equal(m.cagr, 0);
    assert.equal(m.monthlyWinRate, null);
  });

  it("策略与基准逐日同步 → 跟踪误差 0、IR=null、累计超额 0", () => {
    const navPts = [
      { date: "2024-01-01", nav: 1, benchNav: 2 },
      { date: "2024-01-02", nav: 1.1, benchNav: 2.2 },
      { date: "2024-01-03", nav: 1.32, benchNav: 2.64 },
      { date: "2024-01-04", nav: 1.188, benchNav: 2.376 },
    ];
    const m = computeMetrics(navPts, 0);
    assert.ok(m.trackingError != null && m.trackingError < 1e-12);
    assert.equal(m.informationRatio, null);
    assert.ok(m.cumulativeExcess != null && Math.abs(m.cumulativeExcess) < 1e-12);
  });

  it("超额恒定（TE 只剩浮点噪声）时 IR 记 null，不产出 1e15 的假值", () => {
    // 策略每日 +2%，基准每日 +1%（超额恒定 → TE=0）
    const steady = Array.from({ length: 10 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, "0")}`,
      nav: Math.pow(1.02, i),
      benchNav: Math.pow(1.01, i),
    }));
    const ms = computeMetrics(steady, 0);
    assert.equal(ms.informationRatio, null);
    assert.ok(ms.cumulativeExcess != null && ms.cumulativeExcess > 0);

    // 加入扰动：超额均值仍为正，IR 应为正的有限数
    const noisy = steady.map((p, i) => ({ ...p, nav: p.nav * (i % 2 === 0 ? 1.001 : 0.999) }));
    const mn = computeMetrics(noisy, 0);
    assert.ok(mn.trackingError != null && mn.trackingError > 0);
    assert.ok(mn.informationRatio != null && Number.isFinite(mn.informationRatio));
    assert.ok(mn.informationRatio > 0);
  });

  it("无基准 → 跟踪误差/IR/累计超额均为 null", () => {
    const m = computeMetrics(
      [
        { date: "2024-01-01", nav: 1, benchNav: null },
        { date: "2024-01-02", nav: 1.1, benchNav: null },
        { date: "2024-01-03", nav: 1.2, benchNav: null },
      ],
      0,
    );
    assert.equal(m.trackingError, null);
    assert.equal(m.informationRatio, null);
    assert.equal(m.cumulativeExcess, null);
  });
});

describe("regimeFilter — regime 条件化持仓（WS4）", () => {
  // 两个标的：AA 每日 +（涨），BB 恒定。价格 20 天。
  const prices = {
    AA: series(0, Array.from({ length: 20 }, (_, i) => 100 * Math.pow(1.05, i))),
    BB: series(0, Array.from({ length: 20 }, () => 100)),
  };

  it("regime ∉ 过滤集 → 该期清仓持现金（NAV 不随标的波动）", () => {
    const ds = dataset(prices, { calendarDays: 20 });
    // 首个调仓 day1（信号 day0）regime=contraction 被拦；后续无调仓
    const selections: RebalanceSelection[] = [
      { ...sel(0, ["AA"]), regime: "contraction" },
    ];
    const res = runBacktest(ds, selections, params({ regimeFilter: ["recovery", "overheat"] }));
    // 全程持现金 → NAV 恒 1
    assert.ok(res.nav.every((p) => Math.abs(p.nav - 1) < 1e-12));
    assert.equal(res.periods[0]!.regimeBlocked, true);
    assert.equal(res.periods[0]!.held, 0);
  });

  it("regime ∈ 过滤集 → 正常建仓", () => {
    const ds = dataset(prices, { calendarDays: 20 });
    const selections: RebalanceSelection[] = [
      { ...sel(0, ["AA"]), regime: "recovery" },
    ];
    const res = runBacktest(ds, selections, params({ regimeFilter: ["recovery", "overheat"] }));
    assert.equal(res.periods[0]!.regimeBlocked, false);
    assert.equal(res.periods[0]!.held, 1);
    // 末值 NAV = AA 从入场（day1=105）到末日（day19）的比值
    const last = res.nav[res.nav.length - 1]!;
    assert.ok(last.nav > 1);
  });

  it("无 regimeFilter → 忽略 regime，全程持仓", () => {
    const ds = dataset(prices, { calendarDays: 20 });
    const selections: RebalanceSelection[] = [
      { ...sel(0, ["AA"]), regime: "contraction" },
    ];
    const res = runBacktest(ds, selections, params());
    assert.equal(res.periods[0]!.regimeBlocked, false);
    assert.equal(res.periods[0]!.held, 1);
  });

  it("regime=null（未落库）且启用过滤 → 保守清仓", () => {
    const ds = dataset(prices, { calendarDays: 20 });
    const selections: RebalanceSelection[] = [{ ...sel(0, ["AA"]), regime: null }];
    const res = runBacktest(ds, selections, params({ regimeFilter: ["recovery"] }));
    assert.equal(res.periods[0]!.regimeBlocked, true);
  });

  it("默认 exposure：命中=1，拦截=0（与二元开关行为一致）", () => {
    const ds = dataset(prices, { calendarDays: 20 });
    const hit = runBacktest(ds, [{ ...sel(0, ["AA"]), regime: "recovery" }], params({ regimeFilter: ["recovery"] }));
    assert.equal(hit.periods[0]!.exposure, 1);
    const miss = runBacktest(ds, [{ ...sel(0, ["AA"]), regime: "contraction" }], params({ regimeFilter: ["recovery"] }));
    assert.equal(miss.periods[0]!.exposure, 0);
  });
});

describe("regimeBlockedExposure — 连续仓位缩放", () => {
  // AA 每日 ×1.05；拦截期半仓 → NAV 涨幅应恰为满仓涨幅的一半（线性，单期无再平衡）
  const prices = {
    AA: series(0, Array.from({ length: 10 }, (_, i) => 100 * Math.pow(1.05, i))),
  };

  it("拦截期按比例减仓而非清仓，剩余为现金", () => {
    const ds = dataset(prices, { calendarDays: 10 });
    const selections: RebalanceSelection[] = [{ ...sel(0, ["AA"]), regime: "contraction" }];
    const res = runBacktest(
      ds,
      selections,
      params({ regimeFilter: ["recovery"], regimeBlockedExposure: 0.5 }),
    );
    assert.equal(res.periods[0]!.regimeBlocked, true);
    assert.equal(res.periods[0]!.exposure, 0.5);
    assert.equal(res.periods[0]!.held, 1);
    // 入场 day1（px=105），末日 day9（px=105×1.05^8）；半仓 → NAV = 0.5 + 0.5×比值
    const ratio = Math.pow(1.05, 8);
    const expected = 0.5 + 0.5 * ratio;
    assert.ok(Math.abs(res.nav[res.nav.length - 1]!.nav - expected) < 1e-9);
    // 持仓权重记的是实际 NAV 权重
    assert.ok(Math.abs(res.positions[0]!.weight - 0.5) < 1e-12);
  });

  it("exposure=1 时拦截等于不拦截（连续参数的边界退化）", () => {
    const ds = dataset(prices, { calendarDays: 10 });
    const blocked = runBacktest(
      ds,
      [{ ...sel(0, ["AA"]), regime: "contraction" }],
      params({ regimeFilter: ["recovery"], regimeBlockedExposure: 1 }),
    );
    const unfiltered = runBacktest(ds, [{ ...sel(0, ["AA"]), regime: "contraction" }], params());
    assert.equal(
      blocked.nav[blocked.nav.length - 1]!.nav,
      unfiltered.nav[unfiltered.nav.length - 1]!.nav,
    );
  });

  it("越界比例被拒绝", () => {
    const ds = dataset(prices, { calendarDays: 10 });
    assert.throws(
      () => runBacktest(ds, [sel(0, ["AA"])], params({ regimeBlockedExposure: 1.5 })),
      /regimeBlockedExposure/,
    );
  });
});

describe("computeRegimeCoverage", () => {
  const p = (regime: string | null, recession: number | null) => ({ regime, recession });

  it("按象限计数，并把 NBER 衰退期单列", () => {
    const cov = computeRegimeCoverage([
      p("contraction", 0), p("contraction", 0), p("contraction", 1),
      p("overheat", 0), p("recovery", 0),
    ]);
    assert.equal(cov.total, 5);
    assert.equal(cov.byQuadrant["contraction"], 3);
    assert.equal(cov.byQuadrant["overheat"], 1);
    assert.equal(cov.byQuadrant["recovery"], 1);
    assert.equal(cov.byQuadrant["stagflation"], 0);
    // 3 个 contraction 期里只有 1 个是真衰退——这正是要单列的原因
    assert.equal(cov.recessionPeriods, 1);
  });

  it("衰退样本不足时置 recessionThin（实测 2013+ 仅 2 个衰退月）", () => {
    const many = Array.from({ length: 160 }, () => p("overheat", 0));
    const cov = computeRegimeCoverage([...many, p("contraction", 1), p("contraction", 1)]);
    assert.equal(cov.recessionPeriods, 2);
    assert.equal(cov.recessionThin, true);
    // 足量衰退期则不告警
    const rich = Array.from({ length: 8 }, () => p("contraction", 1));
    assert.equal(computeRegimeCoverage([...many, ...rich]).recessionThin, false);
  });

  it("样本稀薄的象限进 thinQuadrants；regime/recession 未知分别计数", () => {
    const cov = computeRegimeCoverage([
      ...Array.from({ length: 20 }, () => p("overheat", 0)),
      p("recovery", 0),
      p(null, null),
      p(null, -1),
    ]);
    assert.equal(cov.unknown, 2);
    assert.equal(cov.recessionUnknown, 2); // null 与 -1 都算未知
    assert.ok(!cov.thinQuadrants.includes("overheat")); // 20 期 ≥ 12
    assert.ok(cov.thinQuadrants.includes("recovery")); // 1 期 < 12
    assert.ok(cov.thinQuadrants.includes("stagflation")); // 0 期
  });
});

describe("regimeFilter 组合键（象限-方向）", () => {
  it("isValidRegimeFilterKey 接受象限与象限-方向，拒绝其它", () => {
    assert.equal(isValidRegimeFilterKey("stagflation"), true);
    assert.equal(isValidRegimeFilterKey("stagflation-falling"), true);
    assert.equal(isValidRegimeFilterKey("overheat-rising"), true);
    assert.equal(isValidRegimeFilterKey("bogus"), false);
    assert.equal(isValidRegimeFilterKey("stagflation-sideways"), false);
    assert.equal(isValidRegimeFilterKey("stagflation-falling-x"), false);
  });

  it("纯象限键匹配整个象限；方向键只匹配该方向", () => {
    const quadOnly = new Set(["stagflation"]);
    assert.equal(regimeAllowed(quadOnly, "stagflation", "rising"), true);
    assert.equal(regimeAllowed(quadOnly, "stagflation", "falling"), true);
    assert.equal(regimeAllowed(quadOnly, "overheat", "rising"), false);

    const dirKey = new Set(["stagflation-rising"]);
    assert.equal(regimeAllowed(dirKey, "stagflation", "rising"), true);
    assert.equal(regimeAllowed(dirKey, "stagflation", "falling"), false); // 真滞胀被拦
  });

  it("「躲增长降的滞胀」= 列出其余三象限 + stagflation-rising", () => {
    const f = new Set(["recovery", "overheat", "contraction", "stagflation-rising"]);
    assert.equal(regimeAllowed(f, "stagflation", "falling"), false); // 唯一被拦的
    assert.equal(regimeAllowed(f, "stagflation", "rising"), true);
    assert.equal(regimeAllowed(f, "contraction", "falling"), true);
    assert.equal(regimeAllowed(f, "recovery", null), true);
  });

  it("regime 未知一律拦截；方向未知时只能被纯象限键放行", () => {
    assert.equal(regimeAllowed(new Set(["stagflation"]), null, "rising"), false);
    assert.equal(regimeAllowed(new Set(["stagflation-rising"]), "stagflation", null), false);
    assert.equal(regimeAllowed(new Set(["stagflation"]), "stagflation", null), true);
    assert.equal(regimeAllowed(null, "anything", null), true); // 无过滤
  });
});

describe("regimeFilter 的 dalio: 前缀键", () => {
  it("isValidRegimeFilterKey 接受 dalio: 前缀的四个象限", () => {
    for (const q of ["reflation", "goldilocks", "stagflation", "deflation"]) {
      assert.equal(isValidRegimeFilterKey(`dalio:${q}`), true);
    }
    assert.equal(isValidRegimeFilterKey("dalio:bogus"), false);
    assert.equal(isValidRegimeFilterKey("dalio:"), false);
  });

  it("dalio 键按 dalioRegime 匹配，与水平口径键互不干扰", () => {
    const dalioOnly = new Set(["dalio:reflation"]);
    // 水平口径是 stagflation、Dalio 是 reflation（2020 疫后场景）→ dalio 键放行
    assert.equal(regimeAllowed(dalioOnly, "stagflation", "rising", "reflation"), true);
    // 水平口径同为 stagflation 但 Dalio 是真滞胀 → 拦截
    assert.equal(regimeAllowed(dalioOnly, "stagflation", "falling", "stagflation"), false);
  });

  it("同名 stagflation 不串味：水平键不会误放行 Dalio 真滞胀", () => {
    // 只列水平口径 contraction；某期水平=contraction 但 Dalio=stagflation → 仍放行（按水平键）
    assert.equal(regimeAllowed(new Set(["contraction"]), "contraction", "falling", "stagflation"), true);
    // 只列 dalio:stagflation；某期水平=stagflation 但 Dalio=reflation → 拦截
    assert.equal(regimeAllowed(new Set(["dalio:stagflation"]), "stagflation", "rising", "reflation"), false);
  });

  it("三类键可混用于同一 filter，取或", () => {
    const mixed = new Set(["recovery", "overheat-rising", "dalio:goldilocks"]);
    assert.equal(regimeAllowed(mixed, "recovery", "falling", "deflation"), true);      // 象限键
    assert.equal(regimeAllowed(mixed, "overheat", "rising", "deflation"), true);       // 象限-方向键
    assert.equal(regimeAllowed(mixed, "contraction", "rising", "goldilocks"), true);   // dalio 键
    assert.equal(regimeAllowed(mixed, "contraction", "falling", "deflation"), false);  // 都不中
  });

  it("dalioRegime 未知时 dalio 键不放行", () => {
    assert.equal(regimeAllowed(new Set(["dalio:reflation"]), "stagflation", "rising", null), false);
    assert.equal(regimeAllowed(new Set(["dalio:reflation"]), "stagflation", "rising"), false);
  });
});
