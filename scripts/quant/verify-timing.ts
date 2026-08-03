/**
 * regime 择时对照验收：把「择时是否真有能力」与「只是降低了暴露」分开。
 *
 * 核心方法——**等平均暴露对照组**。regime 择时会在部分月份空仓/减仓，因而必然降低
 * 波动与回撤；若拿它和满仓策略比夏普，赢面里混着「单纯少拿风险」的成分，得不出
 * 「择时有没有能力」的结论。本脚本构造三条曲线：
 *
 *   A 基线    ：同一策略，不择时，全程满仓
 *   B 择时    ：同一策略 + regime 过滤（未命中期按 --exposure 减仓）
 *   C 对照    ：不择时，但**恒定**持有 w̄ 的仓位（w̄ = B 的实际平均暴露），其余吃现金利息
 *
 * B 与 C 的平均市场暴露相同、现金收益口径相同，唯一差别是「什么时候在场」。
 * 只有 B 显著优于 C，才是择时能力；B 优于 A 但不优于 C，说明降暴露就能复制。
 *
 * 两个易错口径本脚本都已处理：
 *   ① 夏普必须用**超额**（减现金利率）。rf=0 会把持现金当成零波动的免费收益，
 *      系统性抬高低仓位策略的夏普——这会直接把结论做反。
 *   ② 现金利率取真实短端利率（FRED DGS3MO/TB3MS/DTB3/FEDFUNDS，取先找到者）。
 *      找不到时退回 0 并**大声告警**：该退化偏向于让择时显得更好。
 *
 * 已知局限：FRED 宏观序列是**最新修订值**而非当时的实时初值，regime 在历史转折点
 * （尤其 2008）会比当年真能拿到的更准，故 GFC 段的择时表现天然偏乐观。
 *
 * Usage:
 *   npm run quant:verify-timing
 *   npm run quant:verify-timing -- --allow=dalio:goldilocks,dalio:reflation --exposure=0.5
 *   npm run quant:verify-timing -- --factor=earningsYield --top=50 --start=2005-01-01
 */
import { prisma } from "../../src/lib/prisma";
import { isoToDay, type BacktestParams } from "../../src/lib/quant/backtest";
import { executeBacktest } from "../../src/lib/quant/backtestData";
import { probabilisticSharpe, returnMoments } from "../../src/lib/quant/robustness";
import type { ScreenerConfig } from "../../src/lib/quant/screener";

const TRADING_DAYS = 252;
/** 现金利率候选（年化百分数），按优先级取第一个有数据的 */
const CASH_RATE_SERIES = ["DGS3MO", "DTB3", "TB3MS", "FEDFUNDS"];

function argOf(name: string): string | null {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

// ────────────────────────────────────────────────────────── 现金利率

/**
 * 逐日现金收益率（复利口径）。序列是年化百分数的稀疏观测，按「≤当日最近一次观测」
 * 前向填充——利率是存量状态，前向填充不引入前视。
 */
async function loadDailyCashReturns(
  navDates: readonly string[],
): Promise<{ series: number[]; sourceId: string | null }> {
  for (const fredId of CASH_RATE_SERIES) {
    const instrument = await prisma.instrument.findUnique({
      where: { fredSeriesId: fredId },
      select: { id: true },
    });
    if (!instrument) continue;
    const obs = await prisma.macroObservation.findMany({
      where: { instrumentId: instrument.id },
      select: { obsDate: true, value: true },
      orderBy: { obsDate: "asc" },
    });
    if (obs.length === 0) continue;
    const days = obs.map((o) => Math.floor(o.obsDate.getTime() / 86_400_000));
    const vals = obs.map((o) => o.value);
    const out: number[] = [];
    let cursor = 0;
    let lastAnnualPct = vals[0]!;
    for (const iso of navDates) {
      const d = isoToDay(iso);
      while (cursor < days.length && days[cursor]! <= d) {
        lastAnnualPct = vals[cursor]!;
        cursor++;
      }
      const annual = lastAnnualPct / 100;
      out.push(annual > -1 ? Math.pow(1 + annual, 1 / TRADING_DAYS) - 1 : 0);
    }
    return { series: out, sourceId: fredId };
  }
  return { series: navDates.map(() => 0), sourceId: null };
}

// ────────────────────────────────────────────────────────── 指标

type Perf = {
  cagr: number;
  vol: number;
  maxDrawdown: number;
  /** 超额夏普（年化）：日超额（减现金）均值×252 / 年化波动 */
  excessSharpe: number;
  /** 每期（日）超额夏普，PSR 用 */
  perPeriodExcessSharpe: number;
  skew: number;
  kurtosis: number;
  n: number;
};

function perfOf(rets: readonly number[], cashRets: readonly number[], years: number): Perf {
  const excess = rets.map((r, i) => r - (cashRets[i] ?? 0));
  const m = returnMoments(excess);
  const total = rets.reduce((acc, r) => acc * (1 + r), 1);
  const volRets = returnMoments(rets);
  return {
    cagr: years > 0 ? Math.pow(total, 1 / years) - 1 : 0,
    vol: volRets.std * Math.sqrt(TRADING_DAYS),
    maxDrawdown: maxDrawdownOf(rets),
    excessSharpe: m.sharpe * Math.sqrt(TRADING_DAYS),
    perPeriodExcessSharpe: m.sharpe,
    skew: m.skew,
    kurtosis: m.kurtosis,
    n: m.n,
  };
}

function maxDrawdownOf(rets: readonly number[]): number {
  let nav = 1;
  let peak = 1;
  let mdd = 0;
  for (const r of rets) {
    nav *= 1 + r;
    if (nav > peak) peak = nav;
    const dd = nav / peak - 1;
    if (dd < mdd) mdd = dd;
  }
  return mdd;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

function row(label: string, p: Perf, extra = ""): string {
  return (
    label.padEnd(26) +
    pct(p.cagr).padStart(9) +
    pct(p.vol).padStart(9) +
    pct(p.maxDrawdown).padStart(10) +
    p.excessSharpe.toFixed(3).padStart(10) +
    (extra ? `  ${extra}` : "")
  );
}

// ────────────────────────────────────────────────────────── 主流程

async function main() {
  const factor = argOf("factor") ?? "mom12_1";
  const top = Number(argOf("top") ?? 50);
  const start = argOf("start");
  const end = argOf("end");
  const blockedExposure = Number(argOf("exposure") ?? 0);
  const allow = (argOf("allow") ?? "dalio:goldilocks,dalio:reflation")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const config: ScreenerConfig = {
    conditions: [],
    ranking: { mode: "single", sortFactor: factor, topN: top },
  };
  const baseParams: BacktestParams = {
    start: start ?? null,
    end: end ?? null,
    weighting: "equal",
    execution: "nextClose",
    costBps: 10,
  };

  console.log("regime 择时对照验收（等平均暴露对照组）\n");
  console.log(`策略：${factor} top${top} 等权，成本 10bp 单边`);
  console.log(`允许持仓的 regime：${allow.join(", ")}｜未命中仓位 ${(blockedExposure * 100).toFixed(0)}%\n`);

  console.log("  跑 A 基线（不择时）…");
  const runA = await executeBacktest(config, baseParams);
  console.log("  跑 B 择时…");
  const runB = await executeBacktest(config, {
    ...baseParams,
    regimeFilter: allow,
    regimeBlockedExposure: blockedExposure,
  });

  // 两次回测同 config 同区间 → nav 日历应一致；不一致则按日期对齐取交集
  const navA = new Map(runA.result.nav.map((p) => [p.date, p.nav]));
  const dates = runB.result.nav.map((p) => p.date).filter((d) => navA.has(d));
  if (dates.length < 30) {
    throw new Error(`A/B 可对齐的交易日过少（${dates.length}），无法比较`);
  }

  const retsA: number[] = [];
  const retsB: number[] = [];
  const navBmap = new Map(runB.result.nav.map((p) => [p.date, p.nav]));
  for (let i = 1; i < dates.length; i++) {
    retsA.push(navA.get(dates[i]!)! / navA.get(dates[i - 1]!)! - 1);
    retsB.push(navBmap.get(dates[i]!)! / navBmap.get(dates[i - 1]!)! - 1);
  }

  const { series: cashAll, sourceId } = await loadDailyCashReturns(dates);
  const cashRets = cashAll.slice(1);
  if (!sourceId) {
    console.log(
      "\n  ⚠ 未找到短端利率序列（DGS3MO/DTB3/TB3MS/FEDFUNDS），现金收益按 0 计。\n" +
        "    这会高估所有低仓位策略的夏普，本次结论偏向于让择时显得更好，仅供参考。\n",
    );
  } else {
    console.log(`\n  现金利率来源：FRED ${sourceId}\n`);
  }

  // B 的实际平均暴露：按交易日加权（不是按调仓期数——各期长度不同）
  const execDays = runB.result.periods.map((p) => ({
    day: isoToDay(p.execDate),
    exposure: p.exposure,
  }));
  let expIdx = -1;
  let exposureSum = 0;
  for (let i = 1; i < dates.length; i++) {
    const d = isoToDay(dates[i]!);
    while (expIdx + 1 < execDays.length && execDays[expIdx + 1]!.day <= d) expIdx++;
    exposureSum += expIdx >= 0 ? execDays[expIdx]!.exposure : 0;
  }
  const avgExposure = exposureSum / retsB.length;

  // C 对照：恒定 avgExposure 仓位 + 现金
  const retsC = retsA.map((r, i) => avgExposure * r + (1 - avgExposure) * (cashRets[i] ?? 0));

  const years = (isoToDay(dates[dates.length - 1]!) - isoToDay(dates[0]!)) / 365.25;
  const perfA = perfOf(retsA, cashRets, years);
  const perfB = perfOf(retsB, cashRets, years);
  const perfC = perfOf(retsC, cashRets, years);

  console.log(`区间 ${dates[0]} → ${dates[dates.length - 1]}（${years.toFixed(1)} 年，${retsB.length} 个交易日）`);
  console.log(`B 的平均市场暴露 w̄ = ${(avgExposure * 100).toFixed(1)}%\n`);

  console.log(
    "".padEnd(26) + "CAGR".padStart(9) + "波动".padStart(9) + "最大回撤".padStart(10) + "超额夏普".padStart(10),
  );
  console.log("─".repeat(66));
  console.log(row("A 基线（满仓不择时）", perfA));
  console.log(row("B regime 择时", perfB));
  console.log(row(`C 对照（恒定 ${(avgExposure * 100).toFixed(0)}% 仓位）`, perfC));
  console.log("─".repeat(66));

  // 关键检验：B 的超额夏普是否显著高于 C（同平均暴露）
  const psrVsControl = probabilisticSharpe(
    perfB.perPeriodExcessSharpe,
    perfB.n,
    perfB.skew,
    perfB.kurtosis,
    perfC.perPeriodExcessSharpe,
  );
  const psrVsBase = probabilisticSharpe(
    perfB.perPeriodExcessSharpe,
    perfB.n,
    perfB.skew,
    perfB.kurtosis,
    perfA.perPeriodExcessSharpe,
  );

  console.log("\n判定：");
  console.log(
    `  B vs A（满仓基线）  超额夏普差 ${(perfB.excessSharpe - perfA.excessSharpe).toFixed(3)}` +
      `｜PSR ${(psrVsBase * 100).toFixed(1)}%`,
  );
  console.log(
    `  B vs C（等暴露对照）超额夏普差 ${(perfB.excessSharpe - perfC.excessSharpe).toFixed(3)}` +
      `｜PSR ${(psrVsControl * 100).toFixed(1)}%   ← 这一行才是择时能力`,
  );
  console.log(
    `  回撤改善：A ${pct(perfA.maxDrawdown)} → B ${pct(perfB.maxDrawdown)}` +
      `（等暴露对照 C 已能做到 ${pct(perfC.maxDrawdown)}）`,
  );

  // 夏普与回撤要分开判：回撤是路径依赖的，「在对的时候不在场」可以显著改善回撤，
  // 却完全不体现在夏普上（夏普只看收益分布的一二阶矩，不看顺序）。
  const skilled = psrVsControl >= 0.95;
  const ddEdge = perfC.maxDrawdown - perfB.maxDrawdown; // >0 表示 B 回撤更浅
  const ddMaterial = ddEdge > 0.03;

  console.log("\n结论：");
  console.log(
    `  · 风险调整收益：${
      skilled
        ? "B 显著优于等暴露对照 → 存在择时 alpha（注意 FRED 修订值对 GFC 段的乐观偏差）"
        : "B 未显著优于等暴露对照 → 就夏普而言，择时没有提供降暴露之外的收益"
    }`,
  );
  console.log(
    `  · 回撤路径：${
      ddMaterial
        ? `B 比等暴露对照浅 ${(ddEdge * 100).toFixed(1)} 个百分点 → 择时确实「躲开了对的时段」，` +
          "这是夏普看不出来的收益（回撤依赖顺序，夏普不依赖）"
        : "B 与等暴露对照的回撤相当 → 回撤改善可由恒定低仓位复制"
    }`,
  );
  if (!skilled && !ddMaterial) {
    console.log(
      "  · 取舍：若目标只是控制回撤，直接降低常数仓位更简单、参数更少、更不易过拟合。",
    );
  } else if (!skilled && ddMaterial) {
    console.log(
      "  · 取舍：择时值得保留，但理由是回撤而非夏普。若能承受路径波动，" +
        "恒定低仓位可用更少参数拿到同等风险调整收益。",
    );
  }

  await prisma.$disconnect();
}

void main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
