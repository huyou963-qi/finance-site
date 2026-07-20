/**
 * Phase 1 因子库验收（WS5）。
 *
 * A. 样本核对：20 样本股 × 2 月末，用**独立内联公式**（不 import factorCompute 的
 *    计算函数）从原始日线/PIT 截面重算每个因子，与 factor_snapshot 落库值对比。
 *    样本含拆股股（NVDA/AAPL）与财年错位股（AAPL/MU）。
 * B. 无前视：取全量 Q 快照（不带 PIT 过滤），显式剔除 firstReportedAt 空/大于 T 的行后
 *    重算基本面因子，与装配层结果一致；并断言装配层结果内 max(firstReportedAt) ≤ T。
 * C. 覆盖率报表：技术面 2000 起 ≥95%（有价格宇宙内）、基本面 2021 起 ≥90%；
 *    退市无价格股单列。
 * D. 增量与全量一致性：抽一个月快照 → 重跑 --month → 逐行对比不变。
 * E. 行业聚合抽查：factor_sector_snapshot 与按 sector 现算的中位数/四分位一致。
 *
 * Usage: npm run quant:verify-factors [-- --skip-incremental]
 */
import { execSync } from "node:child_process";
import { prisma } from "../../src/lib/prisma";
import { SP500_INDEX_CODE } from "../../src/lib/equity/equitySecurities";
import {
  buildPitCrossSection,
  loadClosesAsOf,
  type PitEquityRow,
  type PitQuarterRow,
} from "../../src/lib/quant/pitCrossSection";
import { computeFundamentalFactors } from "../../src/lib/quant/factorCompute";
import { FACTOR_MAP, FUNDAMENTAL_FACTOR_KEYS } from "../../src/lib/quant/factorRegistry";

const SAMPLE_SYMBOLS = [
  "AAPL", "MSFT", "NVDA", "MU", "JPM", "XOM", "PG", "KO", "WMT", "HD",
  "CAT", "BA", "GE", "PFE", "JNJ", "META", "GOOGL", "AMZN", "TSLA", "NFLX",
];
const SAMPLE_DATES = ["2023-06-30", "2025-12-31"];
const DAY_MS = 86_400_000;
const DAY_SEC = 86_400;
const REL_TOL = 1e-8;

let pass = 0;
let fail = 0;
function check(ok: boolean, label: string, detail = "") {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  ✗ FAIL ${label} ${detail}`);
  }
}
function close2(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  return Math.abs(a - b) / scale < REL_TOL;
}

// ────────────────────────── A 用：独立内联重算 ──────────────────────────

type BarRow = { date: Date; close: number; adjClose: number; volume: number | null };

function manualTech(bars: BarRow[], t: string): Record<string, number | null> {
  // 独立清洗：close>0 保留；adjClose 非正回退 close
  const rows = bars
    .filter((b) => Number.isFinite(b.close) && b.close > 0)
    .map((b) => ({
      sec: Math.floor(b.date.getTime() / 1000 / DAY_SEC) * DAY_SEC,
      adj: Number.isFinite(b.adjClose) && b.adjClose > 0 ? b.adjClose : b.close,
      raw: b.close,
      vol: b.volume,
    }));
  const tSec = Math.floor(Date.parse(`${t}T00:00:00Z`) / 1000);
  let i = -1;
  for (let k = rows.length - 1; k >= 0; k--) {
    if (rows[k]!.sec <= tSec) {
      i = k;
      break;
    }
  }
  const out: Record<string, number | null> = {};
  if (i < 0 || tSec - rows[i]!.sec > 7 * DAY_SEC) return out;
  const adj = (k: number) => rows[k]!.adj;

  const ret = (n: number) => (i - n >= 0 ? adj(i) / adj(i - n) - 1 : null);
  out.ret1m = ret(21);
  out.ret3m = ret(63);
  out.ret6m = ret(126);
  out.ret12m = ret(252);
  out.mom12_1 = i - 252 >= 0 ? adj(i - 21) / adj(i - 252) - 1 : null;
  if (i - 251 >= 0) {
    let hi = 0;
    for (let k = i - 251; k <= i; k++) hi = Math.max(hi, adj(k));
    out.dist52wHigh = adj(i) / hi - 1;
    let peak = -Infinity;
    let mdd = 0;
    for (let k = i - 251; k <= i; k++) {
      peak = Math.max(peak, adj(k));
      mdd = Math.min(mdd, adj(k) / peak - 1);
    }
    out.maxDrawdown12m = mdd;
  }
  if (i >= 60) {
    const rets: number[] = [];
    for (let k = i - 59; k <= i; k++) rets.push(Math.log(adj(k) / adj(k - 1)));
    const m = rets.reduce((a, b) => a + b, 0) / rets.length;
    const v = rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1);
    out.vol60d = Math.sqrt(v) * Math.sqrt(252);
  }
  const volsIn = (n: number) =>
    rows.slice(Math.max(0, i - n + 1), i + 1).map((r) => r.vol).filter(
      (v): v is number => v != null && Number.isFinite(v) && v >= 0,
    );
  const v20 = volsIn(20);
  const v120 = volsIn(120);
  if (v20.length >= 15 && v120.length >= 90) {
    const m20 = v20.reduce((a, b) => a + b, 0) / v20.length;
    const m120 = v120.reduce((a, b) => a + b, 0) / v120.length;
    out.volTrend20_120 = m20 / m120 - 1;
  }
  const dv = rows
    .slice(Math.max(0, i - 19), i + 1)
    .filter((r) => r.vol != null && Number.isFinite(r.vol) && r.vol! > 0)
    .map((r) => r.raw * r.vol!);
  out._advol20 = dv.length >= 15 ? dv.reduce((a, b) => a + b, 0) / dv.length : null;
  return out;
}

function manualBeta(
  bars: BarRow[],
  benchBars: BarRow[],
  t: string,
): number | null {
  const mkRets = (bs: BarRow[]) => {
    const rows = bs.filter((b) => b.close > 0);
    const m = new Map<number, number>();
    for (let k = 1; k < rows.length; k++) {
      const a0 = rows[k - 1]!.adjClose > 0 ? rows[k - 1]!.adjClose : rows[k - 1]!.close;
      const a1 = rows[k]!.adjClose > 0 ? rows[k]!.adjClose : rows[k]!.close;
      m.set(Math.floor(rows[k]!.date.getTime() / 1000 / DAY_SEC) * DAY_SEC, Math.log(a1 / a0));
    }
    return { m, rows };
  };
  const stock = mkRets(bars);
  const bench = mkRets(benchBars).m;
  const tSec = Math.floor(Date.parse(`${t}T00:00:00Z`) / 1000);
  const idx = stock.rows
    .map((r, k) => ({ sec: Math.floor(r.date.getTime() / 1000 / DAY_SEC) * DAY_SEC, k }))
    .filter((p) => p.sec <= tSec);
  if (!idx.length) return null;
  const i = idx[idx.length - 1]!.k;
  if (tSec - idx[idx.length - 1]!.sec > 7 * DAY_SEC || i - 251 < 1) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = Math.max(1, i - 251); k <= i; k++) {
    const sec = Math.floor(stock.rows[k]!.date.getTime() / 1000 / DAY_SEC) * DAY_SEC;
    const mb = bench.get(sec);
    const mr = stock.m.get(sec);
    if (mb == null || mr == null) continue;
    xs.push(mb);
    ys.push(mr);
  }
  if (xs.length < 200) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let cov = 0;
  let vx = 0;
  for (let k = 0; k < xs.length; k++) {
    cov += (xs[k]! - mx) * (ys[k]! - my);
    vx += (xs[k]! - mx) ** 2;
  }
  return vx > 0 ? cov / vx : null;
}

function yearAgo(qs: PitQuarterRow[], of: PitQuarterRow): PitQuarterRow | null {
  const ofMs = Date.parse(`${of.fiscalDate}T00:00:00Z`);
  for (let k = qs.length - 1; k >= 0; k--) {
    const gap = (ofMs - Date.parse(`${qs[k]!.fiscalDate}T00:00:00Z`)) / DAY_MS;
    if (gap >= 330 && gap <= 400) return qs[k]!;
    if (gap > 400) break;
  }
  return null;
}

function manualFundamental(row: PitEquityRow, t: string): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const qs = row.quarters;
  const latest = row.latestQuarter;
  if (!latest) return out;
  // 陈旧守卫：最新可见季距 T > 200 天不出基本面因子（与库口径一致）
  if ((Date.parse(`${t}T00:00:00Z`) - Date.parse(`${latest.fiscalDate}T00:00:00Z`)) / DAY_MS > 200) {
    return out;
  }
  const mcap = row.marketCap;

  // TTM：最近 4 季，跨度 240–300 天
  let ttm: { rev: number | null; ni: number | null; ocf: number | null; fcf: number | null; div: number } | null = null;
  if (qs.length >= 4) {
    const last4 = qs.slice(-4);
    const span =
      (Date.parse(`${last4[3]!.fiscalDate}T00:00:00Z`) - Date.parse(`${last4[0]!.fiscalDate}T00:00:00Z`)) / DAY_MS;
    if (span >= 240 && span <= 300) {
      const sum = (sel: (q: PitQuarterRow) => number | null) => {
        let acc = 0;
        for (const q of last4) {
          const v = sel(q);
          if (v == null || !Number.isFinite(v)) return null;
          acc += v;
        }
        return acc;
      };
      const ocf = sum((q) => q.ocf);
      const capex = sum((q) => q.capex);
      ttm = {
        rev: sum((q) => q.revenue),
        ni: sum((q) => q.netIncome),
        ocf,
        fcf: ocf != null && capex != null ? ocf - capex : null,
        div: last4.reduce((a, q) => a + (q.dividendsPaid ?? 0), 0),
      };
    }
  }

  if (mcap != null && mcap > 0) {
    out.earningsYield = ttm?.ni != null ? ttm.ni / mcap : null;
    out.bookYield = latest.equity != null ? latest.equity / mcap : null;
    out.salesYield = ttm?.rev != null ? ttm.rev / mcap : null;
    out.fcfYield = ttm?.fcf != null ? ttm.fcf / mcap : null;
    out.dividendYield = ttm ? Math.abs(ttm.div) / mcap : null;
    const ev = mcap + (latest.longTermDebt ?? 0) - (latest.cash ?? 0);
    out.ocfToEv = ttm?.ocf != null && ev > 0 ? ttm.ocf / ev : null;
    out.logMarketCap = Math.log(mcap);
  }

  const prev4Raw = qs.length >= 5 ? qs[qs.length - 5]! : null;
  const prev4 =
    prev4Raw != null &&
    (() => {
      const gap =
        (Date.parse(`${latest.fiscalDate}T00:00:00Z`) - Date.parse(`${prev4Raw.fiscalDate}T00:00:00Z`)) / DAY_MS;
      return gap >= 330 && gap <= 400;
    })()
      ? prev4Raw
      : null;
  const avgOf = (a: number | null, b: number | null) => (a == null ? null : b == null ? a : (a + b) / 2);
  const avgEq = avgOf(latest.equity, prev4?.equity ?? null);
  out.roeTtm = ttm?.ni != null && avgEq != null && avgEq > 0 ? ttm.ni / avgEq : null;
  out.grossMargin = latest.grossMargin;
  out.opMargin = latest.opMargin;
  out.ocfToNetIncome = ttm?.ocf != null && ttm.ni != null && ttm.ni > 0 ? ttm.ocf / ttm.ni : null;
  out.debtToAssets =
    latest.totalLiabilities != null && latest.totalAssets != null && latest.totalAssets !== 0
      ? latest.totalLiabilities / latest.totalAssets
      : null;
  const avgAssets = avgOf(latest.totalAssets, prev4?.totalAssets ?? null);
  out.accrualsToAssets =
    ttm?.ni != null && ttm.ocf != null && avgAssets != null && avgAssets > 0
      ? (ttm.ni - ttm.ocf) / avgAssets
      : null;

  const revYoY = (of: PitQuarterRow): number | null => {
    const prev = yearAgo(qs, of);
    return prev && of.revenue != null && prev.revenue != null && prev.revenue > 0
      ? of.revenue / prev.revenue - 1
      : null;
  };
  out.revenueYoY = revYoY(latest);
  const prevYearQ = yearAgo(qs, latest);
  out.epsYoY =
    latest.eps != null && prevYearQ?.eps != null && prevYearQ.eps > 0
      ? latest.eps / prevYearQ.eps - 1
      : null;
  if (qs.length >= 2) {
    const prevQ = qs[qs.length - 2]!;
    const gap =
      (Date.parse(`${latest.fiscalDate}T00:00:00Z`) - Date.parse(`${prevQ.fiscalDate}T00:00:00Z`)) / DAY_MS;
    if (gap >= 45 && gap <= 130) {
      const a = out.revenueYoY;
      const b = revYoY(prevQ);
      out.revenueAccel = a != null && b != null ? a - b : null;
    }
  }
  return out;
}

// ────────────────────────── 各部分 ──────────────────────────

async function partA() {
  console.log("\n== A. 样本核对（20 股 × 2 月末，独立公式重算） ==");
  const benchBars = await prisma.equityDailyBar.findMany({
    where: { symbol: "SPY" },
    orderBy: { date: "asc" },
    select: { date: true, close: true, adjClose: true, volume: true },
  });
  for (const t of SAMPLE_DATES) {
    const cs = await buildPitCrossSection(t);
    const dbRows = await prisma.factorSnapshot.findMany({
      where: { symbol: { in: SAMPLE_SYMBOLS }, date: new Date(`${t}T00:00:00.000Z`) },
      select: { symbol: true, factorKey: true, value: true },
    });
    const db = new Map<string, Map<string, number>>();
    for (const r of dbRows) {
      (db.get(r.symbol) ?? db.set(r.symbol, new Map()).get(r.symbol)!).set(r.factorKey, r.value);
    }
    for (const sym of SAMPLE_SYMBOLS) {
      const bars = await prisma.equityDailyBar.findMany({
        where: { symbol: sym },
        orderBy: { date: "asc" },
        select: { date: true, close: true, adjClose: true, volume: true },
      });
      const expected: Record<string, number | null> = { ...manualTech(bars, t) };
      expected.beta252d = manualBeta(bars, benchBars, t);
      const csRow = cs.rows.find((r) => r.symbol === sym);
      if (csRow) Object.assign(expected, manualFundamental(csRow, t));
      const advol = expected._advol20;
      delete expected._advol20;
      if (advol != null && csRow?.marketCap != null && csRow.marketCap > 0) {
        expected.turnover20d = advol / csRow.marketCap;
      }

      const got = db.get(sym) ?? new Map<string, number>();
      let mismatches = 0;
      for (const [key, exp] of Object.entries(expected)) {
        if (!FACTOR_MAP.has(key)) continue;
        const act = got.get(key) ?? null;
        if (exp == null) {
          if (act != null) {
            mismatches++;
            console.log(`  ✗ ${t} ${sym} ${key}: 期望缺失但库内=${act}`);
          }
          continue;
        }
        if (!close2(exp, act)) {
          mismatches++;
          console.log(`  ✗ ${t} ${sym} ${key}: 手算=${exp} 库内=${act ?? "缺失"}`);
        }
      }
      check(mismatches === 0, `A ${t} ${sym}`, `${mismatches} 项不符`);
    }
    console.log(`  ${t}: 样本核对完成`);
  }
}

async function partB() {
  console.log("\n== B. 无前视测试 ==");
  for (const t of SAMPLE_DATES) {
    const tDate = new Date(`${t}T00:00:00.000Z`);
    const cs = await buildPitCrossSection(t);

    // 断言：装配层结果内无 firstReportedAt > T 的行
    let leaked = 0;
    for (const row of cs.rows) {
      for (const q of row.quarters) if (q.firstReportedAt > t) leaked++;
    }
    check(leaked === 0, `B ${t} 装配层可见性`, `${leaked} 行 firstReportedAt > T`);

    // 全量取样本股 Q 快照（无 PIT 过滤）→ 显式剔除未披露行 → 重算与装配层一致
    for (const sym of SAMPLE_SYMBOLS) {
      const all = await prisma.equityFundamentalSnapshot.findMany({
        where: { symbol: sym, periodType: "Q" },
        orderBy: { fiscalDate: "asc" },
      });
      const visible = all.filter(
        (r) => r.fiscalDate != null && r.firstReportedAt != null && r.firstReportedAt <= tDate,
      );
      const csRow = cs.rows.find((r) => r.symbol === sym);
      if (!csRow) continue;
      check(
        visible.length === csRow.quarters.length &&
          visible.every((r, k) => r.period === csRow.quarters[k]!.period),
        `B ${t} ${sym} 可见季度集合`,
        `显式剔除=${visible.length} 装配层=${csRow.quarters.length}`,
      );

      // 用显式剔除后的行独立装配再算因子，应与装配层输出一致
      const closes = await loadClosesAsOf([sym], t);
      const quarters: PitQuarterRow[] = visible.map((r) => ({
        period: r.period,
        fiscalDate: r.fiscalDate!.toISOString().slice(0, 10),
        revenue: r.revenue,
        netIncome: r.netIncome,
        eps: r.eps,
        ocf: r.ocf,
        capex: r.capex,
        dividendsPaid: r.dividendsPaid,
        totalAssets: r.totalAssets,
        totalLiabilities: r.totalLiabilities,
        equity: r.equity,
        longTermDebt: r.longTermDebt,
        cash: r.cash,
        sharesOutstanding: r.sharesOutstanding,
        grossMargin: r.grossMargin,
        opMargin: r.opMargin,
        revenueYoY: r.revenueYoY,
        epsYoY: r.epsYoY,
        firstReportedAt: r.firstReportedAt!.toISOString().slice(0, 10),
      }));
      let shares: number | null = null;
      for (let k = quarters.length - 1; k >= 0; k--) {
        if (quarters[k]!.sharesOutstanding != null && quarters[k]!.sharesOutstanding! > 0) {
          shares = quarters[k]!.sharesOutstanding!;
          break;
        }
      }
      const c = closes.get(sym);
      const fresh = c != null && (tDate.getTime() - Date.parse(`${c.date}T00:00:00Z`)) / DAY_MS <= 7;
      const closeV = fresh ? c!.close : null;
      const alt: PitEquityRow = {
        symbol: sym,
        quarters,
        latestQuarter: quarters.length ? quarters[quarters.length - 1]! : null,
        close: closeV,
        closeDate: fresh ? c!.date : null,
        sharesCurrent: shares,
        marketCap: closeV != null && shares != null ? closeV * shares : null,
      };
      const a = computeFundamentalFactors(alt, t);
      const b = computeFundamentalFactors(csRow, t);
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      let diff = 0;
      for (const k of keys) if (!close2(a[k] ?? null, b[k] ?? null)) diff++;
      check(diff === 0, `B ${t} ${sym} 剔除重算一致`, `${diff} 项不符`);
    }
  }
}

async function partC() {
  console.log("\n== C. 覆盖率报表 ==");
  const universeRows = await prisma.indexConstituent.groupBy({
    by: ["asOfDate"],
    where: { indexCode: SP500_INDEX_CODE },
    _count: { symbol: true },
  });
  const universeCount = new Map(
    universeRows.map((r) => [r.asOfDate.toISOString().slice(0, 10), r._count.symbol]),
  );

  // 「T 时点有价格」口径：coverage 区间覆盖 [T−7d, T]。Yahoo 对老退市股历史不完整，
  // 有价起点晚于 T 或退市早于 T 的都归入当月无价格桶（单列，不计因子覆盖率分母）。
  const covRows = await prisma.equityPriceCoverage.findMany({
    where: { firstDate: { not: null } },
    select: { symbol: true, firstDate: true, lastDate: true },
  });
  const covBySymbol = new Map(covRows.map((r) => [r.symbol, r]));
  const members = await prisma.indexConstituent.findMany({
    where: { indexCode: SP500_INDEX_CODE },
    select: { asOfDate: true, symbol: true },
  });
  const pricedUniverse = new Map<string, number>();
  const unpricedUniverse = new Map<string, number>();
  for (const m of members) {
    const d = m.asOfDate.toISOString().slice(0, 10);
    const cov = covBySymbol.get(m.symbol);
    const pricedAt =
      cov != null &&
      cov.firstDate! <= m.asOfDate &&
      cov.lastDate != null &&
      (m.asOfDate.getTime() - cov.lastDate.getTime()) / DAY_MS <= 7;
    if (pricedAt) pricedUniverse.set(d, (pricedUniverse.get(d) ?? 0) + 1);
    else unpricedUniverse.set(d, (unpricedUniverse.get(d) ?? 0) + 1);
  }

  const techCounts = await prisma.factorSnapshot.groupBy({
    by: ["date"],
    where: { factorKey: "ret1m" },
    _count: { symbol: true },
  });
  const techCount = new Map(
    techCounts.map((r) => [r.date.toISOString().slice(0, 10), r._count.symbol]),
  );
  // 基本面：有任一基本面因子的 symbol 数
  const fundRows = await prisma.$queryRaw<{ date: Date; n: bigint }[]>`
    SELECT date, COUNT(DISTINCT symbol) AS n
    FROM mds.factor_snapshot
    WHERE factor_key = ANY(${FUNDAMENTAL_FACTOR_KEYS})
    GROUP BY date
  `;
  const fundCount = new Map(fundRows.map((r) => [r.date.toISOString().slice(0, 10), Number(r.n)]));

  const dates = [...universeCount.keys()].sort();
  const byYear = new Map<string, { tech: number[]; fund: number[]; unpriced: number[] }>();
  let techBad = 0;
  let fundBad = 0;
  for (const d of dates) {
    const y = d.slice(0, 4);
    const g = byYear.get(y) ?? byYear.set(y, { tech: [], fund: [], unpriced: [] }).get(y)!;
    const priced = pricedUniverse.get(d) ?? 0;
    if (priced > 0) {
      const tc = (techCount.get(d) ?? 0) / priced;
      g.tech.push(tc);
      if (d >= "2000-01-01" && tc < 0.95) techBad++;
      if (d >= "2021-01-01") {
        const fc = (fundCount.get(d) ?? 0) / priced;
        g.fund.push(fc);
        if (fc < 0.9) fundBad++;
      }
    }
    g.unpriced.push(unpricedUniverse.get(d) ?? 0);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  console.log("  年份  技术面均值  技术面最低  基本面均值  宇宙内无价格股均值");
  for (const [y, g] of [...byYear.entries()].sort()) {
    const f = (x: number | null) => (x == null ? "   -  " : (x * 100).toFixed(1).padStart(5) + "%");
    console.log(
      `  ${y}  ${f(avg(g.tech))}     ${f(g.tech.length ? Math.min(...g.tech) : null)}     ${f(avg(g.fund))}     ${avg(g.unpriced)?.toFixed(1)}`,
    );
  }
  check(techBad === 0, "C 技术面覆盖 ≥95%（2000 起，有价格宇宙）", `${techBad} 个月不达标`);
  check(fundBad === 0, "C 基本面覆盖 ≥90%（2021 起，有价格宇宙）", `${fundBad} 个月不达标`);
  const delistedNoPrice = await prisma.equityDelisting.count({
    where: { priceStatus: { in: ["not_found", "no_data"] } },
  });
  console.log(`  退市无价格股（delisting 表 not_found/no_data）：${delistedNoPrice} 只（单列，不计覆盖率分母）`);
}

async function partD() {
  console.log("\n== D. 增量（--month）与全量结果一致性 ==");
  const M = "2024-03";
  const dDate = new Date("2024-03-28T00:00:00.000Z");
  // 全量构建产物快照
  const beforeRows = await prisma.factorSnapshot.findMany({
    where: { date: { gte: new Date("2024-03-01T00:00:00.000Z"), lt: new Date("2024-04-01T00:00:00.000Z") } },
    select: { symbol: true, date: true, factorKey: true, value: true, zscore: true, sectorZscore: true },
  });
  check(beforeRows.length > 0, "D 全量产物存在", `month=${M}`);
  const key = (r: (typeof beforeRows)[number]) =>
    `${r.symbol}|${r.date.toISOString().slice(0, 10)}|${r.factorKey}`;
  const before = new Map(beforeRows.map((r) => [key(r), r]));

  console.log(`  重跑 quant:build-factors --month=${M} …`);
  execSync(`npx tsx scripts/quant/build-factors.ts --month=${M}`, { stdio: "pipe" });

  const afterRows = await prisma.factorSnapshot.findMany({
    where: { date: { gte: new Date("2024-03-01T00:00:00.000Z"), lt: new Date("2024-04-01T00:00:00.000Z") } },
    select: { symbol: true, date: true, factorKey: true, value: true, zscore: true, sectorZscore: true },
  });
  let diff = 0;
  check(afterRows.length === beforeRows.length, "D 行数一致", `${beforeRows.length} → ${afterRows.length}`);
  for (const r of afterRows) {
    const b = before.get(key(r));
    if (!b || !close2(b.value, r.value) || !close2(b.zscore, r.zscore) || !close2(b.sectorZscore, r.sectorZscore)) {
      diff++;
      if (diff <= 5) console.log(`  ✗ ${key(r)}: ${b?.value}/${b?.zscore} → ${r.value}/${r.zscore}`);
    }
  }
  check(diff === 0, "D 逐行值一致", `${diff} 行不同`);
  void dDate;
}

async function partE() {
  console.log("\n== E. 行业聚合抽查 ==");
  const secRows = await prisma.equitySecurity.findMany({
    where: { gicsSector: { not: null } },
    select: { symbol: true, gicsSector: true },
  });
  const sectorBySymbol = new Map(secRows.map((r) => [r.symbol, r.gicsSector!]));
  const cases: [string, string, string][] = [
    ["2023-06-30", "Information Technology", "earningsYield"],
    ["2023-06-30", "Financials", "roeTtm"],
    ["2010-06-30", "Energy", "ret12m"],
    ["2025-12-31", "Health Care", "vol60d"],
  ];
  const quantile = (sorted: number[], q: number) => {
    if (sorted.length === 1) return sorted[0]!;
    const pos = q * (sorted.length - 1);
    const lo = Math.floor(pos);
    return sorted[lo]! + (sorted[Math.ceil(pos)]! - sorted[lo]!) * (pos - lo);
  };
  for (const [d, sector, fk] of cases) {
    const dDate = new Date(`${d}T00:00:00.000Z`);
    const [snapRows, aggRow] = await Promise.all([
      prisma.factorSnapshot.findMany({
        where: { date: dDate, factorKey: fk },
        select: { symbol: true, value: true },
      }),
      prisma.factorSectorSnapshot.findFirst({
        where: { date: dDate, sector, factorKey: fk },
      }),
    ]);
    const xs = snapRows
      .filter((r) => sectorBySymbol.get(r.symbol) === sector)
      .map((r) => r.value)
      .sort((a, b) => a - b);
    if (!aggRow) {
      check(false, `E ${d} ${sector} ${fk}`, "聚合行缺失");
      continue;
    }
    check(
      xs.length === aggRow.sampleCount &&
        close2(quantile(xs, 0.5), aggRow.median) &&
        close2(quantile(xs, 0.25), aggRow.p25) &&
        close2(quantile(xs, 0.75), aggRow.p75),
      `E ${d} ${sector} ${fk}`,
      `n=${xs.length}/${aggRow.sampleCount} med=${quantile(xs, 0.5)}/${aggRow.median}`,
    );
  }
}

async function main() {
  await partA();
  await partB();
  await partC();
  if (!process.argv.includes("--skip-incremental")) await partD();
  await partE();
  console.log(`\n=== 验收结果：PASS ${pass} / FAIL ${fail} ===`);
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
