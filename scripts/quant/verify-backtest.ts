/**
 * 回测引擎验收（Phase 3 WS5）。恒等式优先——(a)(b)(e) 是硬门槛。
 *
 *   (a) 单股 buy-and-hold NAV ≡ adjClose 比值逐位相等
 *   (b) 「永远持有 SPY」策略 ≈ SPY 基准曲线
 *   (c) cost=0 等权组合 NAV ≡ 各股比值的等权均值（权重归一+漂移聚合）
 *   (d) mom12_1 top50 等权 2010–2025 与已知动量史实方向一致（含 2015-16/2020 崩溃段回撤）
 *   (e) 同 config 两次执行逐位可复现
 *   (f) 价格中断清算场景（单测已覆盖，此处复述结论）
 *
 * Usage: npm run quant:verify-backtest
 */
import { prisma } from "../../src/lib/prisma";
import {
  buildRebalanceCalendar,
  isoToDay,
  runBacktest,
  type BacktestDataset,
  type RebalanceSelection,
  type SymbolPrices,
} from "../../src/lib/quant/backtest";
import { executeBacktest, loadPricesColumnar } from "../../src/lib/quant/backtestData";
import { listFactorDates } from "../../src/lib/quant/screenerData";
import type { ScreenerConfig } from "../../src/lib/quant/screener";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✔ ${name}${detail ? `  ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  ✖ ${name}${detail ? `  ${detail}` : ""}`);
  }
}

/** 用真实日线构造单标的序列（epoch 天 + adjClose） */
async function loadOne(symbol: string, fromIso: string, toIso: string): Promise<SymbolPrices> {
  const map = await loadPricesColumnar([symbol], fromIso, toIso);
  const s = map.get(symbol);
  if (!s || s.days.length === 0) throw new Error(`无价格：${symbol}`);
  return s;
}

async function main() {
  console.log("回测引擎验收（Phase 3 WS5）\n");

  // ── (a) 单股 buy-and-hold NAV ≡ adjClose 比值逐位 ────────────────────────────
  console.log("(a) 单股 buy-and-hold NAV ≡ adjClose 比值（逐位）");
  {
    const aapl = await loadOne("AAPL", "2015-01-01", "2020-12-31");
    const dataset: BacktestDataset = { calendar: aapl.days, prices: new Map([["AAPL", aapl]]), bench: null };
    const sigIso = "2015-02-15";
    const sel: RebalanceSelection = { date: sigIso, rows: [{ symbol: "AAPL", marketCap: null, score: null }] };
    const res = runBacktest(dataset, [sel], { weighting: "equal", execution: "nextClose", costBps: 0 });
    // 执行日 = 首个 > sigDay 的交易日；入场价 = 该日 adjClose
    const sigDay = isoToDay(sigIso);
    const execIdx = aapl.days.findIndex((d) => d > sigDay);
    const entry = aapl.closes[execIdx]!;
    let bitwise = res.nav.length === aapl.days.length - execIdx;
    let maxAbs = 0;
    for (let i = 0; i < res.nav.length; i++) {
      const expected = aapl.closes[execIdx + i]! / entry;
      if (res.nav[i]!.nav !== expected) bitwise = false;
      maxAbs = Math.max(maxAbs, Math.abs(res.nav[i]!.nav - expected));
    }
    check("AAPL 单股持有逐位相等", bitwise, `n=${res.nav.length}, maxAbsDiff=${maxAbs.toExponential(2)}`);
  }

  // ── (b) 「永远持有 SPY」策略 ≈ SPY 基准 ──────────────────────────────────────
  console.log("\n(b) 永远持有 SPY ≈ SPY 基准");
  {
    const spy = await loadOne("SPY", "2010-01-01", "2024-12-31");
    const dataset: BacktestDataset = { calendar: spy.days, prices: new Map([["SPY", spy]]), bench: spy };
    // 每月末调仓，始终选 SPY（零交易守卫应保持不动）
    const factorDates = await listFactorDates();
    const rebal = buildRebalanceCalendar(factorDates, { start: "2010-06-01", end: "2024-06-30" });
    const sels: RebalanceSelection[] = rebal.map((d) => ({
      date: d,
      rows: [{ symbol: "SPY", marketCap: null, score: null }],
    }));
    const res = runBacktest(dataset, sels, { weighting: "equal", execution: "nextClose", costBps: 0 });
    let maxAbs = 0;
    for (const p of res.nav) {
      if (p.benchNav != null) maxAbs = Math.max(maxAbs, Math.abs(p.nav - p.benchNav));
    }
    check("NAV 与 SPY 基准逐日一致", maxAbs < 1e-9, `maxAbsDiff=${maxAbs.toExponential(2)}, rebal=${rebal.length}`);
  }

  // ── (c) cost=0 等权组合 NAV ≡ 各股比值等权均值 ───────────────────────────────
  console.log("\n(c) cost=0 等权组合 NAV ≡ 成分比值等权均值（单期）");
  {
    const syms = ["AAPL", "MSFT", "JPM", "XOM", "KO"];
    const series = new Map<string, SymbolPrices>();
    for (const s of syms) series.set(s, await loadOne(s, "2016-01-01", "2018-12-31"));
    // 共同日历取 AAPL（各股同为美股交易日，缺口极少；用交集更稳）
    const common = syms
      .map((s) => new Set(series.get(s)!.days))
      .reduce((acc, set) => new Set([...acc].filter((d) => set.has(d))));
    const calendar = [...common].sort((a, b) => a - b);
    const dataset: BacktestDataset = { calendar, prices: series, bench: null };
    const sigIso = "2016-01-29";
    const sel: RebalanceSelection = {
      date: sigIso,
      rows: syms.map((s) => ({ symbol: s, marketCap: null, score: null })),
    };
    const res = runBacktest(dataset, [sel], { weighting: "equal", execution: "nextClose", costBps: 0 });
    // 独立计算：每股入场价 = 执行日 adjClose；组合 NAV(t)=mean_i(adj_i(t)/entry_i)
    const sigDay = isoToDay(sigIso);
    const execDay = calendar.find((d) => d > sigDay)!;
    const entries = new Map<string, number>();
    for (const s of syms) {
      const ser = series.get(s)!;
      const idx = ser.days.findIndex((d) => d >= execDay);
      entries.set(s, ser.closes[idx]!);
    }
    let maxAbs = 0;
    for (const p of res.nav) {
      const day = isoToDay(p.date);
      let acc = 0;
      for (const s of syms) {
        const ser = series.get(s)!;
        // ≤ day 的最近价（与引擎 priceAt 同口径）
        let idx = -1;
        for (let i = 0; i < ser.days.length; i++) if (ser.days[i]! <= day) idx = i;
        acc += ser.closes[idx]! / entries.get(s)!;
      }
      maxAbs = Math.max(maxAbs, Math.abs(p.nav - acc / syms.length));
    }
    check("等权 NAV ≡ 成分比值均值", maxAbs < 1e-9, `maxAbsDiff=${maxAbs.toExponential(2)}, n=${res.nav.length}`);
  }

  // ── (d) mom12_1 top50 等权 2010–2025 动量史实方向 ────────────────────────────
  console.log("\n(d) mom12_1 top50 等权 2010–2025 动量史实方向");
  {
    const config: ScreenerConfig = {
      conditions: [],
      ranking: { mode: "single", sortFactor: "mom12_1", topN: 50 },
    };
    const exec = await executeBacktest(config, {
      start: "2010-01-01",
      end: "2025-12-31",
      weighting: "equal",
      execution: "nextClose",
      costBps: 10,
    });
    const { metrics, nav } = exec.result;
    // 2020 COVID 段回撤：2020-01-01 → 2020-06-30 窗口内峰谷
    const seg2020 = nav.filter((p) => p.date >= "2020-01-01" && p.date <= "2020-06-30");
    let peak2020 = -Infinity;
    let dd2020 = 0;
    for (const p of seg2020) {
      if (p.nav > peak2020) peak2020 = p.nav;
      dd2020 = Math.min(dd2020, p.nav / peak2020 - 1);
    }
    // 2015-2016 动量崩溃段
    const seg2015 = nav.filter((p) => p.date >= "2015-06-01" && p.date <= "2016-06-30");
    let peak2015 = -Infinity;
    let dd2015 = 0;
    for (const p of seg2015) {
      if (p.nav > peak2015) peak2015 = p.nav;
      dd2015 = Math.min(dd2015, p.nav / peak2015 - 1);
    }
    check("回测非空 + CAGR 有限", nav.length > 1000 && Number.isFinite(metrics.cagr), `n=${nav.length}, CAGR=${(metrics.cagr * 100).toFixed(2)}%`);
    check("全期最大回撤显著（< -20%）", metrics.maxDrawdown < -0.2, `MDD=${(metrics.maxDrawdown * 100).toFixed(1)}%`);
    check("2020 COVID 段回撤 < -15%", dd2020 < -0.15, `dd2020=${(dd2020 * 100).toFixed(1)}%`);
    check("2015-16 动量崩溃段回撤 < -8%", dd2015 < -0.08, `dd2015=${(dd2015 * 100).toFixed(1)}%`);
    console.log(`    指标：CAGR ${(metrics.cagr * 100).toFixed(2)}% ｜ 波动 ${(metrics.vol * 100).toFixed(1)}% ｜ 夏普 ${metrics.sharpe.toFixed(2)} ｜ Calmar ${metrics.calmar?.toFixed(2)} ｜ 基准CAGR ${metrics.benchCagr != null ? (metrics.benchCagr * 100).toFixed(2) + "%" : "—"}`);
  }

  // ── (e) 同 config 两次执行逐位可复现 ────────────────────────────────────────
  console.log("\n(e) 同 config 两次执行逐位可复现");
  {
    const config: ScreenerConfig = {
      conditions: [{ factorKey: "roeTtm", metric: "zscore", op: "gte", bounds: { min: 0.5 } }],
      ranking: { mode: "composite", weights: [{ factorKey: "earningsYield", weight: 1 }, { factorKey: "mom12_1", weight: 1 }], topN: 30 },
    };
    const params = { start: "2021-06-01", end: "2024-12-31", weighting: "score" as const, execution: "nextClose" as const, costBps: 10 };
    const [r1, r2] = [await executeBacktest(config, params), await executeBacktest(config, params)];
    let navMatch = r1.result.nav.length === r2.result.nav.length;
    let maxAbs = 0;
    for (let i = 0; i < r1.result.nav.length && navMatch; i++) {
      if (r1.result.nav[i]!.date !== r2.result.nav[i]!.date || r1.result.nav[i]!.nav !== r2.result.nav[i]!.nav) navMatch = false;
      maxAbs = Math.max(maxAbs, Math.abs(r1.result.nav[i]!.nav - r2.result.nav[i]!.nav));
    }
    const posMatch =
      r1.result.positions.length === r2.result.positions.length &&
      r1.result.positions.every((p, i) => p.symbol === r2.result.positions[i]!.symbol && p.weight === r2.result.positions[i]!.weight);
    check("两次 NAV 逐位相等", navMatch, `n=${r1.result.nav.length}, maxAbsDiff=${maxAbs.toExponential(2)}`);
    check("两次持仓逐行相等", posMatch, `positions=${r1.result.positions.length}`);
  }

  // ── (f) 价格中断清算（单测已覆盖） ─────────────────────────────────────────
  console.log("\n(f) 价格中断清算：单测 backtest.test.ts『liquidates terminated price series』已覆盖（tsx --test 全绿）");

  console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error("\n[verify-backtest] 异常：", e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
