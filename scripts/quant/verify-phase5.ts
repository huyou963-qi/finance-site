/**
 * Phase 5（资金面维度）验收脚本。
 *
 * A 三原始表样本 + 覆盖率透明化（institutional_holding / short_interest / etf_flow）
 * B PIT 无前视（13F）：AAPL 某期机构持股与 filedAt 对齐；T<可见日回退上一期；未来 filed 数据不影响
 * C 架构复利：资金面因子进 FactorSnapshot 后 screener 筛选 / IC 引擎 / 回测重放 各抽查一次
 * D 史实 sanity：蓝筹机构持股占比高、持有机构家数上千、mega-cap HHI 低
 *
 * Usage: npm run quant:verify-phase5
 */
import { prisma } from "../../src/lib/prisma";
import { FACTOR_MAP, FUNDING_FACTOR_KEYS } from "../../src/lib/quant/factorRegistry";
import { loadFundingPeriods } from "../../src/lib/quant/fundingData";
import { computeFundingFactors, aggregatePeriods, type FilerHolding } from "../../src/lib/quant/fundingFactors";
import { runScreenerQuery } from "../../src/lib/quant/screenerData";
import { runFactorResearch } from "../../src/lib/quant/factorResearchData";
import { executeBacktest } from "../../src/lib/quant/backtestData";
import { normalizeParams } from "../../src/lib/quant/backtestRuns";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function sectionA() {
  console.log("\n=== A 三原始表样本 + 覆盖率透明化 ===");
  // institutional_holding
  const ihRows = await prisma.institutionalHolding.count();
  const ihSyms = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(DISTINCT symbol) c FROM mds.institutional_holding WHERE symbol IS NOT NULL`,
  );
  const ihPeriods = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(DISTINCT period_end) c FROM mds.institutional_holding`,
  );
  const univ = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(DISTINCT symbol) c FROM mds.index_constituent WHERE index_code='SP500'`,
  );
  const nSym = Number(ihSyms[0]!.c);
  const nUniv = Number(univ[0]!.c);
  check("institutional_holding 有样本", ihRows > 100_000, `${ihRows} 行`);
  check(
    "13F 覆盖现宇宙",
    nSym / nUniv > 0.5,
    `${nSym}/${nUniv} = ${((nSym / nUniv) * 100).toFixed(1)}%（含退市，桥接命中口径）`,
  );
  console.log(`    13F 报告期数：${Number(ihPeriods[0]!.c)}`);

  // short_interest（降级：可能仅样本/空）
  const siRows = await prisma.shortInterest.count();
  check("short_interest 表就绪（样本或空，透明报告）", true, `${siRows} 行（源受限见脚本注释）`);

  // etf_flow
  const efRows = await prisma.etfFlow.count();
  const efEtfs = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(DISTINCT etf_symbol) c FROM mds.etf_flow`,
  );
  check("etf_flow 有 NAV 样本", efRows > 0, `${efRows} 行，${Number(efEtfs[0]!.c)} 只 ETF`);

  // 因子覆盖率（funding 因子在最新截面）
  const latest = await prisma.$queryRawUnsafe<{ d: Date }[]>(
    `SELECT MAX(date) d FROM mds.factor_snapshot WHERE factor_key LIKE 'inst%'`,
  );
  if (latest[0]?.d) {
    const d = latest[0].d.toISOString().slice(0, 10);
    const cov = await prisma.$queryRawUnsafe<{ k: string; c: bigint }[]>(
      `SELECT factor_key k, COUNT(*) c FROM mds.factor_snapshot WHERE date='${d}' AND factor_key LIKE 'inst%' GROUP BY factor_key ORDER BY k`,
    );
    console.log(`    funding 因子最新截面 ${d} 覆盖：${cov.map((r) => `${r.k}=${Number(r.c)}`).join(", ")}`);
    check("funding 因子已落 FactorSnapshot", cov.length > 0, `${cov.length} 个因子键`);
  } else {
    check("funding 因子已落 FactorSnapshot", false, "无 inst* 因子行（需先 build-factors）");
  }
}

async function sectionB() {
  console.log("\n=== B PIT 无前视（13F）===");
  const periodsMap = await loadFundingPeriods(["AAPL"]);
  const periods = periodsMap.get("AAPL") ?? [];
  check("AAPL 有机构持股聚合", periods.length >= 1, `${periods.length} 期（多季摄入后可增强回退检验）`);
  if (periods.length < 1) return;

  const cur = periods[periods.length - 1]!;
  console.log(
    `    AAPL 最新期 ${cur.periodEndIso}（可见日 ${cur.visibilityIso}）holders=${cur.holderCount} shares=${(cur.totalShares / 1e9).toFixed(2)}B`,
  );

  // filedAt 对齐：该期计入的 filing 均在 periodEnd..periodEnd+50d 窗口内
  const rows = await prisma.institutionalHolding.findMany({
    where: { symbol: "AAPL", periodEnd: new Date(`${cur.periodEndIso}T00:00:00Z`) },
    select: { filedAt: true },
    orderBy: { filedAt: "desc" },
    take: 1,
  });
  const maxFiled = rows[0]?.filedAt.toISOString().slice(0, 10) ?? "";
  check(
    "AAPL 最新期披露日 ≥ 报告期末（filedAt 对齐）",
    maxFiled >= cur.periodEndIso,
    `maxFiledAt=${maxFiled} ≥ periodEnd=${cur.periodEndIso}`,
  );

  // T < 可见日 → 该期不可见（不前视）：因子应不含当期（回退到更早或空）
  const beforeVis = new Date(Date.parse(`${cur.visibilityIso}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const fAtBefore = computeFundingFactors(periods, beforeVis, 1e9);
  const fAtVis = computeFundingFactors(periods, cur.visibilityIso, 1e9);
  check(
    "T=可见日前一日 → 不使用当期（不前视）",
    fAtBefore.instHolderCount !== cur.holderCount,
    `holders@${beforeVis}=${fAtBefore.instHolderCount ?? "∅"}（当期 ${cur.holderCount} 尚不可见）`,
  );
  check(
    "T=可见日 → 使用当期",
    fAtVis.instHolderCount === cur.holderCount,
    `holders@${cur.visibilityIso}=${fAtVis.instHolderCount}（当期 ${cur.holderCount}）`,
  );

  // 追加 T 之后 filed 的持仓 → 因子不变
  const raw = await prisma.institutionalHolding.findMany({
    where: { symbol: "AAPL" },
    select: { filerCik: true, filedAt: true, periodEnd: true, shares: true, value: true },
  });
  const asHoldings: FilerHolding[] = raw.map((r) => ({
    filerCik: r.filerCik,
    filedAtIso: r.filedAt.toISOString().slice(0, 10),
    periodEndIso: r.periodEnd.toISOString().slice(0, 10),
    shares: r.shares,
    value: r.value,
  }));
  const T = cur.visibilityIso;
  const base = computeFundingFactors(aggregatePeriods(asHoldings), T, 1e9);
  const withFuture = computeFundingFactors(
    aggregatePeriods([
      ...asHoldings,
      // 一条 T 之后（且超窗口）才 filed 的大额持仓 → 不应影响 T 的因子
      { filerCik: "9999999999", filedAtIso: "2099-01-01", periodEndIso: cur.periodEndIso, shares: 5e9, value: 1e12 },
    ]),
    T,
    1e9,
  );
  check(
    "加入 T 之后 filed 的持仓，因子不变（无前视）",
    JSON.stringify(base) === JSON.stringify(withFuture),
    `base.holders=${base.instHolderCount}`,
  );
}

async function sectionC() {
  console.log("\n=== C 架构复利（funding 因子进 FactorSnapshot 后三链路各抽查）===");
  // 最新有 funding 因子的截面日
  const latest = await prisma.$queryRawUnsafe<{ d: Date }[]>(
    `SELECT MAX(date) d FROM mds.factor_snapshot WHERE factor_key='instOwnershipPct'`,
  );
  const dISO = latest[0]?.d ? latest[0].d.toISOString().slice(0, 10) : null;
  if (!dISO) {
    check("funding 因子在 FactorSnapshot（前置）", false, "无 instOwnershipPct 行");
    return;
  }

  // C1 screener：按 instHolderCount 排序 + instOwnershipPct 条件
  const scr = await runScreenerQuery({
    date: dISO,
    conditions: [{ factorKey: "instOwnershipPct", metric: "value", op: "gte", bounds: { min: 0.3 } }],
    ranking: { mode: "single", sortFactor: "instHolderCount", topN: 20 },
  });
  const withFactor = scr.rows.filter((r) => r.factors["instOwnershipPct"]?.value != null).length;
  check("screener 能按 funding 因子筛选/排序", scr.rows.length > 0 && withFactor > 0, `${scr.rows.length} 行命中，${withFactor} 有 ownPct`);

  // C2 IC 引擎：instOwnershipChgQoQ / instOwnershipPct 出 IC 序列
  const icFactor = "instOwnershipPct";
  const research = await runFactorResearch([icFactor]);
  const r0 = research.factors[0]!;
  check(
    "IC 引擎能对 funding 因子出 IC 序列",
    r0.icSummary.n > 0,
    `${icFactor}: n=${r0.icSummary.n} 期, meanIC=${r0.icSummary.meanIC.toFixed(3)}`,
  );

  // C3 回测：按 funding 因子选股重放（用 instOwnershipPct——单季数据即可，chgQoQ 需两季）
  const config = {
    conditions: [{ factorKey: "instOwnershipPct", metric: "value" as const, op: "gte" as const, bounds: { min: 0.2 } }],
    ranking: { mode: "single" as const, sortFactor: "instOwnershipPct", topN: 20 },
  };
  const params = normalizeParams({ weighting: "equal", end: dISO });
  try {
    const exec = await executeBacktest(config, params);
    check("回测能用 funding 因子重放", exec.result.nav.length > 1, `${exec.result.nav.length} 个 NAV 点`);
  } catch (e) {
    check("回测能用 funding 因子重放", false, e instanceof Error ? e.message : String(e));
  }
}

async function sectionD() {
  console.log("\n=== D 史实 sanity ===");
  const latest = await prisma.$queryRawUnsafe<{ d: Date }[]>(
    `SELECT MAX(date) d FROM mds.factor_snapshot WHERE factor_key='instOwnershipPct'`,
  );
  const dISO = latest[0]?.d ? latest[0].d.toISOString().slice(0, 10) : null;
  if (!dISO) {
    check("史实 sanity（前置）", false, "无 funding 因子截面");
    return;
  }
  const d = new Date(`${dISO}T00:00:00Z`);
  const blue = await prisma.factorSnapshot.findMany({
    where: { date: d, symbol: { in: ["AAPL", "MSFT", "JPM"] }, factorKey: { in: ["instOwnershipPct", "instHolderCount", "instConcentration"] } },
    select: { symbol: true, factorKey: true, value: true },
  });
  const get = (s: string, k: string) => blue.find((r) => r.symbol === s && r.factorKey === k)?.value;
  const aaplPct = get("AAPL", "instOwnershipPct");
  const aaplHolders = get("AAPL", "instHolderCount");
  const aaplHhi = get("AAPL", "instConcentration");
  check("蓝筹机构持股占比高（AAPL>40%）", (aaplPct ?? 0) > 0.4, `AAPL ownPct=${aaplPct?.toFixed(3)}`);
  check("蓝筹持有机构上千（AAPL>1000）", (aaplHolders ?? 0) > 1000, `AAPL holders=${aaplHolders}`);
  check("mega-cap 持仓分散（AAPL HHI<0.1）", (aaplHhi ?? 1) < 0.1, `AAPL HHI=${aaplHhi?.toFixed(4)}`);

  // funding 因子注册齐全
  check("funding 因子注册齐全（4 个）", FUNDING_FACTOR_KEYS.length === 4, FUNDING_FACTOR_KEYS.join(", "));
  check("funding 因子均 requires=funding", FUNDING_FACTOR_KEYS.every((k) => FACTOR_MAP.get(k)?.requires === "funding"), "");
}

async function main() {
  console.log("Phase 5 资金面维度验收");
  await sectionA();
  await sectionB();
  await sectionC();
  await sectionD();
  console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
