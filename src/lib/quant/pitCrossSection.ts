/**
 * PIT 截面装配层（Phase 1 WS2，核心）。
 *
 * 给定月末 T（IndexConstituent 快照日），返回该时点「市场实际可见」的横截面：
 * - 宇宙：asOfDate ≤ T 的最近一期 SP500 历史成分（月末粒度，天然对齐）
 * - 每股可见季度序列：periodType=Q 且 firstReportedAt ≤ T（升序，供 computeTtm / computeQuarterRatios）
 * - close(T)：T 日或之前最近收盘（现拆股刻度；超过 staleDays 视为无价，如已退市）
 * - 股本刻度：EquityFundamentalSnapshot.sharesOutstanding / eps 在摄入时已由
 *   scaleFactorsBackward 归一到**最新拆股刻度**（NVDA 2020Q3 存 24.68B 可证），
 *   与 EquityDailyBar.close 的现刻度一致 —— 市值 = close(T) × shares 直乘，
 *   **不得**再乘 computeSplitFactors（会重复 N 倍）。前提：拆股后 sync-fundamentals
 *   已重跑；若基本面同步落后于新拆股，该股刻度会错位（运维口径，文档标注）。
 *
 * 装配逻辑参考 scripts/verify-phase0-pit.ts；无前视性质由 firstReportedAt 过滤天然保证。
 */

import { prisma } from "@/lib/prisma";
import { SP500_INDEX_CODE } from "@/lib/equity/equitySecurities";
import type { QuarterFundamentalRow } from "@/lib/equity/ttm";

/** 季度行：computeTtm 兼容字段 + 因子计算所需扩展列 */
export type PitQuarterRow = QuarterFundamentalRow & {
  grossMargin: number | null;
  opMargin: number | null;
  revenueYoY: number | null;
  epsYoY: number | null;
  firstReportedAt: string;
};

export type PitEquityRow = {
  symbol: string;
  /** firstReportedAt ≤ T 的可见季度，按 fiscalDate 升序 */
  quarters: PitQuarterRow[];
  /** 最新可见季（quarters 末位） */
  latestQuarter: PitQuarterRow | null;
  /** T 日或之前最近收盘（现拆股刻度）；超过 staleDays 无成交则 null */
  close: number | null;
  /** close 实际所在日（YYYY-MM-DD） */
  closeDate: string | null;
  /** 现刻度股本（最新可见季有股本的行；库内已归一到最新拆股刻度） */
  sharesCurrent: number | null;
  /** PIT 市值 = close × sharesCurrent */
  marketCap: number | null;
};

export type PitCrossSection = {
  /** 请求的时点 T（YYYY-MM-DD） */
  t: string;
  /** 实际使用的宇宙快照日（≤ T 的最近月末） */
  universeAsOf: string;
  rows: PitEquityRow[];
};

const DAY_MS = 86_400_000;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** T 之前最近有成分快照的月末日期；无则 null */
export async function resolveUniverseAsOf(t: string): Promise<string | null> {
  const row = await prisma.indexConstituent.findFirst({
    where: { indexCode: SP500_INDEX_CODE, asOfDate: { lte: new Date(`${t}T00:00:00.000Z`) } },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  return row ? iso(row.asOfDate) : null;
}

/** 库内全部月末宇宙快照日（升序），供全量构建枚举月份 */
export async function listUniverseDates(): Promise<string[]> {
  const rows = await prisma.indexConstituent.findMany({
    where: { indexCode: SP500_INDEX_CODE },
    distinct: ["asOfDate"],
    orderBy: { asOfDate: "asc" },
    select: { asOfDate: true },
  });
  return rows.map((r) => iso(r.asOfDate));
}

/** 单查询批量取每 symbol 在 T 日或之前的最近收盘（只读库，不触发远端回补） */
export async function loadClosesAsOf(
  symbols: string[],
  t: string,
): Promise<Map<string, { close: number; date: string }>> {
  if (!symbols.length) return new Map();
  const rows = await prisma.$queryRaw<{ symbol: string; close: number; date: Date }[]>`
    SELECT DISTINCT ON (symbol) symbol, close, date
    FROM mds.equity_daily_bar
    WHERE symbol = ANY(${symbols}) AND date <= ${new Date(`${t}T00:00:00.000Z`)}::date AND close > 0
    ORDER BY symbol, date DESC
  `;
  return new Map(rows.map((r) => [r.symbol, { close: Number(r.close), date: iso(r.date) }]));
}

export type BuildPitCrossSectionOptions = {
  /** close 允许的最大陈旧天数（T − closeDate），默认 7；超过按无价处理（退市股月中停牌等） */
  staleDays?: number;
  /** 预载的 close(T) 表（build 脚本批量场景注入，省去逐月查询）；缺省自查库 */
  closes?: Map<string, { close: number; date: string }>;
};

/**
 * 装配 T 时点 PIT 横截面。T 任意日期均可（宇宙取 ≤T 最近月末快照）；
 * 因子管线按月末调用，此时宇宙快照日 == T。
 */
export async function buildPitCrossSection(
  t: string,
  opts: BuildPitCrossSectionOptions = {},
): Promise<PitCrossSection> {
  const staleDays = opts.staleDays ?? 7;
  const universeAsOf = await resolveUniverseAsOf(t);
  if (!universeAsOf) throw new Error(`T=${t} 之前无 ${SP500_INDEX_CODE} 成分快照`);

  const members = await prisma.indexConstituent.findMany({
    where: { indexCode: SP500_INDEX_CODE, asOfDate: new Date(`${universeAsOf}T00:00:00.000Z`) },
    select: { symbol: true },
  });
  const symbols = members.map((m) => m.symbol).sort();

  const tDate = new Date(`${t}T00:00:00.000Z`);
  const [snaps, closes] = await Promise.all([
    prisma.equityFundamentalSnapshot.findMany({
      where: {
        symbol: { in: symbols },
        periodType: "Q",
        firstReportedAt: { not: null, lte: tDate },
      },
      orderBy: [{ symbol: "asc" }, { fiscalDate: "asc" }],
      select: {
        symbol: true,
        period: true,
        fiscalDate: true,
        firstReportedAt: true,
        revenue: true,
        netIncome: true,
        eps: true,
        ocf: true,
        capex: true,
        dividendsPaid: true,
        totalAssets: true,
        totalLiabilities: true,
        equity: true,
        longTermDebt: true,
        cash: true,
        sharesOutstanding: true,
        grossMargin: true,
        opMargin: true,
        revenueYoY: true,
        epsYoY: true,
      },
    }),
    opts.closes ?? loadClosesAsOf(symbols, t),
  ]);

  const quartersBySymbol = new Map<string, PitQuarterRow[]>();
  for (const s of snaps) {
    if (!s.fiscalDate) continue; // 无财季末日期的行无法参与 TTM 连续性判断，弃用
    const row: PitQuarterRow = {
      period: s.period,
      fiscalDate: iso(s.fiscalDate),
      revenue: s.revenue,
      netIncome: s.netIncome,
      eps: s.eps,
      ocf: s.ocf,
      capex: s.capex,
      dividendsPaid: s.dividendsPaid,
      totalAssets: s.totalAssets,
      totalLiabilities: s.totalLiabilities,
      equity: s.equity,
      longTermDebt: s.longTermDebt,
      cash: s.cash,
      sharesOutstanding: s.sharesOutstanding,
      grossMargin: s.grossMargin,
      opMargin: s.opMargin,
      revenueYoY: s.revenueYoY,
      epsYoY: s.epsYoY,
      firstReportedAt: iso(s.firstReportedAt!),
    };
    const list = quartersBySymbol.get(s.symbol) ?? [];
    list.push(row);
    quartersBySymbol.set(s.symbol, list);
  }

  const tMs = tDate.getTime();
  const rows: PitEquityRow[] = symbols.map((symbol) => {
    const quarters = quartersBySymbol.get(symbol) ?? [];
    const latestQuarter = quarters.length ? quarters[quarters.length - 1]! : null;

    const c = closes.get(symbol) ?? null;
    const fresh =
      c != null && (tMs - Date.parse(`${c.date}T00:00:00Z`)) / DAY_MS <= staleDays;
    const close = fresh ? c!.close : null;

    // 股本：从最新可见季往回找有 sharesOutstanding 的行（库内已是现刻度，直取）
    let sharesCurrent: number | null = null;
    for (let i = quarters.length - 1; i >= 0; i--) {
      const q = quarters[i]!;
      if (q.sharesOutstanding != null && q.sharesOutstanding > 0) {
        sharesCurrent = q.sharesOutstanding;
        break;
      }
    }

    const marketCap =
      close != null && sharesCurrent != null && sharesCurrent > 0
        ? close * sharesCurrent
        : null;

    return {
      symbol,
      quarters,
      latestQuarter,
      close,
      closeDate: fresh ? c!.date : null,
      sharesCurrent,
      marketCap,
    };
  });

  return { t, universeAsOf, rows };
}
