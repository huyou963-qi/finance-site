/**
 * Phase 4 验收（因子研究 + 宏观联动）。npm run quant:verify-phase4。
 *
 * 覆盖：
 *  A 史实对照——mom12_1 IC（2009/2020 反转月显著负、胜率 >50%）、earningsYield 2022 价值回归正。
 *  B regime 分类器——2001/2008/2020 衰退核心落「衰退式」且 recession=1；增长下覆盖全部衰退月；USREC 一致率。
 *  C 无前视——某 T 的 regime 用「截断到 ≤T obs」重算不变。
 *  D regime 条件化回测——仅非衰退式持有动量的回撤 < 无条件（含 2008/2020 段）。
 * IC 引擎纯函数单测在 test:quant（factorResearch.test.ts / macroRegime.test.ts）。
 */
import { runFactorResearch } from "../../src/lib/quant/factorResearchData";
import { listResearchGrid } from "../../src/lib/quant/factorResearchData";
import {
  DEFAULT_REGIME_THRESHOLDS,
  classifyRegimeAt,
  computeRegimeSeries,
  deriveRegimeArrays,
  loadRegimeSeries,
  type MonthlySeries,
} from "../../src/lib/quant/macroRegime";
import { executeBacktest } from "../../src/lib/quant/backtestData";
import type { ScreenerConfig } from "../../src/lib/quant/screener";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}${detail ? `  ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? `  ${detail}` : ""}`);
  }
}
const pct = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(2)}%`);

async function sectionA() {
  console.log("\nA 史实对照（因子 IC）");
  const rep = await runFactorResearch(["mom12_1", "earningsYield"], {});
  const mom = rep.factors.find((f) => f.factorKey === "mom12_1")!;
  const ey = rep.factors.find((f) => f.factorKey === "earningsYield")!;

  const icOf = (f: typeof mom, ym: string) =>
    f.periods.find((p) => p.date.slice(0, 7) === ym)?.ic ?? null;

  check("mom12_1 有 IC 覆盖 ≥ 250 期", mom.icSummary.n >= 250, `n=${mom.icSummary.n}`);
  check("mom12_1 IC 胜率 > 50%（多数月为正）", mom.icSummary.hitRate > 0.5, pct(mom.icSummary.hitRate));
  const rev0903 = icOf(mom, "2009-03");
  check("mom12_1 2009-03 反转月 IC 显著为负", rev0903 != null && rev0903 < -0.2, `IC=${rev0903?.toFixed(3)}`);
  const rev2011 = icOf(mom, "2020-11");
  check("mom12_1 2020-11 反转月 IC 为负（疫苗价值轮动）", rev2011 != null && rev2011 < 0, `IC=${rev2011?.toFixed(3)}`);
  // 年度：2009 动量崩溃为负
  const y2009 = mom.periods.filter((p) => p.date.slice(0, 4) === "2009" && p.ic != null);
  const y2009Mean = y2009.reduce((s, p) => s + p.ic!, 0) / Math.max(1, y2009.length);
  check("mom12_1 2009 年均 IC 为负（动量崩溃）", y2009Mean < 0, pct(y2009Mean));

  // earningsYield 只有 2021+（基本面数据下限），2022 价值回归应为正
  const y2022 = ey.periods.filter((p) => p.date.slice(0, 4) === "2022" && p.ic != null);
  const y2022Mean = y2022.length ? y2022.reduce((s, p) => s + p.ic!, 0) / y2022.length : null;
  check("earningsYield 2022 年均 IC 为正（价值回归）", y2022Mean != null && y2022Mean > 0, pct(y2022Mean));
  check(
    "earningsYield 行业中性后 IC 幅度下降（行业暴露有贡献）",
    Math.abs(ey.neutralizedIcSummary.meanIC) < Math.abs(ey.icSummary.meanIC),
    `raw=${ey.icSummary.meanIC.toFixed(4)} neutral=${ey.neutralizedIcSummary.meanIC.toFixed(4)}`,
  );
}

async function sectionB() {
  console.log("\nB regime 分类器");
  const grid = await listResearchGrid({});
  const pts = await computeRegimeSeries(grid);
  const rec = pts.filter((p) => p.recession === 1);
  check("网格覆盖 NBER 衰退月 ≥ 24", rec.length >= 24, `n=${rec.length}`);
  const growthBelow = rec.every((p) => p.growthState === "below");
  check("全部衰退月增长维为「下」", growthBelow, `${rec.filter((p) => p.growthState === "below").length}/${rec.length}`);
  const contractionShare = rec.filter((p) => p.regime === "contraction").length / rec.length;
  check("衰退月多数落「衰退式」象限（≥60%）", contractionShare >= 0.6, pct(contractionShare));

  // 三次衰退核心月各自到达衰退式
  const coreReaches = (yms: string[]) =>
    yms.some((ym) => {
      const p = pts.find((x) => x.date.slice(0, 7) === ym);
      return p?.regime === "contraction" && p.recession === 1;
    });
  check("2001 衰退核心到达衰退式", coreReaches(["2001-10", "2001-11"]));
  check("2008 衰退核心到达衰退式", coreReaches(["2008-10", "2008-11", "2009-02"]));
  check("2020 衰退核心到达衰退式", coreReaches(["2020-04", "2020-05"]));

  // 增长维转负领先/同步：以「增长下」为预警，覆盖全部衰退月（sensitivity=1）
  const sens = rec.filter((p) => p.growthState === "below").length / rec.length;
  check("增长下 对 NBER 衰退敏感度 = 100%", sens === 1, pct(sens));
}

/** 截断 MonthlySeries 到 obsDate ≤ cutoffIso（去掉未来月，验无前视） */
function truncateSeries(s: MonthlySeries, cutoffIso: string): MonthlySeries {
  const keep = s.months
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m <= cutoffIso)
    .map(({ i }) => i);
  return {
    code: s.code,
    months: keep.map((i) => s.months[i]!),
    values: keep.map((i) => s.values[i]!),
    releaseDay: keep.map((i) => s.releaseDay[i]!),
    lagDays: s.lagDays,
  };
}

async function sectionC() {
  console.log("\nC 无前视（as-of 隔离）");
  const s = await loadRegimeSeries();
  const th = DEFAULT_REGIME_THRESHOLDS;
  const derivedFull = deriveRegimeArrays(s, th);

  for (const T of ["2008-06-30", "2015-12-31", "2020-02-29"]) {
    const full = classifyRegimeAt(T, s, derivedFull, th);
    // 截断到 obsDate ≤ T（去掉 T 之后才出现的月），as-of 已只用可见月，结果应不变
    const truncated = {
      indpro: truncateSeries(s.indpro, T),
      payems: truncateSeries(s.payems, T),
      ism: truncateSeries(s.ism, T),
      cpi: truncateSeries(s.cpi, T),
      pce: truncateSeries(s.pce, T),
      usrec: truncateSeries(s.usrec, T),
    };
    const derivedT = deriveRegimeArrays(truncated, th);
    const cut = classifyRegimeAt(T, truncated, derivedT, th);
    const same =
      full.growthState === cut.growthState &&
      full.inflationState === cut.inflationState &&
      full.regime === cut.regime;
    check(`T=${T} 截断未来数据后 regime 不变`, same, `full=${full.regime} cut=${cut.regime}`);
  }
}

async function sectionD() {
  console.log("\nD regime 条件化回测（回撤对照，2005–2021 含 2008/2020）");
  const cfg: ScreenerConfig = {
    conditions: [],
    ranking: { mode: "single", sortFactor: "mom12_1", topN: 50 },
  };
  const base = { start: "2005-01-01", end: "2021-12-31", weighting: "equal" as const, execution: "nextClose" as const, costBps: 10 };
  const uncond = await executeBacktest(cfg, { ...base, regimeFilter: null });
  const cond = await executeBacktest(cfg, {
    ...base,
    regimeFilter: ["recovery", "overheat", "stagflation"],
  });
  const um = uncond.result.metrics;
  const cm = cond.result.metrics;
  const blocked = cond.result.periods.filter((p) => p.regimeBlocked).length;
  check(
    "仅非衰退式持有：回撤更小（|MDD| 下降）",
    Math.abs(cm.maxDrawdown) < Math.abs(um.maxDrawdown),
    `无条件 ${pct(um.maxDrawdown)} → 条件化 ${pct(cm.maxDrawdown)}`,
  );
  check("条件化确有清仓期（regime 门生效）", blocked > 0, `blocked=${blocked}`);
  console.log(
    `    对照：无条件 CAGR ${pct(um.cagr)}/Sharpe ${um.sharpe.toFixed(2)}｜条件化 CAGR ${pct(cm.cagr)}/Sharpe ${cm.sharpe.toFixed(2)}`,
  );
}

async function main() {
  console.log("Phase 4 验收（因子研究 + 宏观联动）");
  await sectionA();
  await sectionB();
  await sectionC();
  await sectionD();
  console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n[verify-phase4] 异常：", e instanceof Error ? e.stack : e);
    process.exit(1);
  });
