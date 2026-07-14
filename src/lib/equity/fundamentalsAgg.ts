/**
 * 行业财报聚合：中位数 + 覆盖率。
 */

import { prisma } from "@/lib/prisma";
import type { GicsSector } from "@/lib/equity/gicsCatalog";
import { GICS_SECTOR_DEFS, getSectorDef } from "@/lib/equity/gicsCatalog";
import { getLatestClosesDbOnly } from "@/lib/equity/equityPriceStore";
import { computeTtm, type QuarterFundamentalRow } from "@/lib/equity/ttm";

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export type FundamentalPeriodType = "FY" | "Q";

export type SectorFundamentalsAgg = {
  sector: GicsSector;
  nameZh: string;
  /** 实际使用的口径：Q（最新季 YoY/利润率 + TTM PE）或 FY（年报，Q 无数据时的回退） */
  basis: FundamentalPeriodType;
  sampleCount: number;
  universeCount: number;
  coveragePct: number;
  revenueYoYMedian: number | null;
  epsYoYMedian: number | null;
  grossMarginMedian: number | null;
  opMarginMedian: number | null;
  peMedian: number | null;
  members: {
    symbol: string;
    revenueYoY: number | null;
    epsYoY: number | null;
    pe: number | null;
    grossMargin: number | null;
    opMargin: number | null;
    period: string | null;
  }[];
};

type MemberRow = SectorFundamentalsAgg["members"][number];

function finalizeAgg(
  sector: GicsSector,
  basis: FundamentalPeriodType,
  universeCount: number,
  members: MemberRow[],
): SectorFundamentalsAgg {
  const pick = (sel: (m: MemberRow) => number | null) =>
    median(members.map(sel).filter((v): v is number => v != null && Number.isFinite(v)));
  const def = getSectorDef(sector);
  return {
    sector,
    nameZh: def.nameZh,
    basis,
    sampleCount: members.length,
    universeCount,
    coveragePct: universeCount ? members.length / universeCount : 0,
    revenueYoYMedian: pick((m) => m.revenueYoY),
    epsYoYMedian: pick((m) => m.epsYoY),
    grossMarginMedian: pick((m) => m.grossMargin),
    opMarginMedian: pick((m) => m.opMargin),
    peMedian: pick((m) => m.pe),
    members: members.sort((a, b) => a.symbol.localeCompare(b.symbol)),
  };
}

/**
 * 行业基本面聚合。默认季度口径（Bloomberg 惯例）：最新季 YoY/利润率 + TTM PE
 * （现价×股本 / TTM 净利，价格只读库不触发回补）；该 sector 无任何季度快照时回退 FY。
 */
export async function aggregateSectorFundamentals(
  sector: GicsSector,
  periodType: FundamentalPeriodType = "Q",
): Promise<SectorFundamentalsAgg> {
  const securities = await prisma.equitySecurity.findMany({
    where: { gicsSector: sector },
    select: { symbol: true, marketCap: true },
  });
  const symbols = securities.map((s) => s.symbol);
  const universeCount = symbols.length;
  if (!symbols.length) return finalizeAgg(sector, periodType, 0, []);

  if (periodType === "Q") {
    const snaps = await prisma.equityFundamentalSnapshot.findMany({
      where: {
        symbol: { in: symbols },
        periodType: "Q",
        // 550 天 ≈ 6 个财季窗口：足够 TTM，又剔除停更股
        asOf: { gte: new Date(Date.now() - 550 * 86_400_000) },
      },
      orderBy: { asOf: "asc" },
    });

    if (snaps.length) {
      const rowsBySymbol = new Map<string, typeof snaps>();
      for (const s of snaps) {
        const arr = rowsBySymbol.get(s.symbol);
        if (arr) arr.push(s);
        else rowsBySymbol.set(s.symbol, [s]);
      }
      const closes = await getLatestClosesDbOnly([...rowsBySymbol.keys()]);
      const cachedMcap = new Map(securities.map((s) => [s.symbol, s.marketCap]));

      const members: MemberRow[] = [];
      for (const [sym, rows] of rowsBySymbol) {
        const latest = rows[rows.length - 1]!;
        const ttmRows: QuarterFundamentalRow[] = rows.map((r) => ({
          period: r.period,
          fiscalDate: (r.fiscalDate ?? r.asOf).toISOString().slice(0, 10),
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
        }));
        const ttm = computeTtm(ttmRows);
        const close = closes.get(sym) ?? null;
        const mcap =
          close != null && latest.sharesOutstanding != null && latest.sharesOutstanding > 0
            ? close * latest.sharesOutstanding
            : (cachedMcap.get(sym) ?? null);
        members.push({
          symbol: sym,
          revenueYoY: latest.revenueYoY,
          epsYoY: latest.epsYoY,
          pe:
            mcap != null && ttm?.netIncome != null && ttm.netIncome > 0
              ? mcap / ttm.netIncome
              : null,
          grossMargin: latest.grossMargin,
          opMargin: latest.opMargin,
          period: latest.period,
        });
      }
      return finalizeAgg(sector, "Q", universeCount, members);
    }
    // Q 无数据（如生产尚未跑季度同步）→ 回退 FY，保证表不空
  }

  const snaps = await prisma.equityFundamentalSnapshot.findMany({
    where: { symbol: { in: symbols }, periodType: "FY" },
    orderBy: [{ asOf: "desc" }],
  });
  const latestBySymbol = new Map<string, (typeof snaps)[number]>();
  for (const row of snaps) {
    if (latestBySymbol.has(row.symbol)) continue;
    latestBySymbol.set(row.symbol, row);
  }
  const members: MemberRow[] = [...latestBySymbol.values()].map((r) => ({
    symbol: r.symbol,
    revenueYoY: r.revenueYoY,
    epsYoY: r.epsYoY,
    pe: r.pe,
    grossMargin: r.grossMargin,
    opMargin: r.opMargin,
    period: r.period,
  }));
  return finalizeAgg(sector, "FY", universeCount, members);
}

export async function aggregateAllSectorFundamentals(): Promise<
  Omit<SectorFundamentalsAgg, "members">[]
> {
  const out: Omit<SectorFundamentalsAgg, "members">[] = [];
  for (const def of GICS_SECTOR_DEFS) {
    const full = await aggregateSectorFundamentals(def.sector);
    const { members: _m, ...rest } = full;
    out.push(rest);
  }
  return out;
}

export type PeerQuarterMedians = {
  sampleCount: number;
  revenueYoYMedian: number | null;
  grossMarginMedian: number | null;
  opMarginMedian: number | null;
  netMarginMedian: number | null;
};

/** 同侪（industry 成分）最新一季中位数，供个股基本面页横向对比 */
export async function aggregatePeerQuarterMedians(symbols: string[]): Promise<PeerQuarterMedians> {
  if (!symbols.length) {
    return {
      sampleCount: 0,
      revenueYoYMedian: null,
      grossMarginMedian: null,
      opMarginMedian: null,
      netMarginMedian: null,
    };
  }
  const rows = await prisma.equityFundamentalSnapshot.findMany({
    where: { symbol: { in: symbols }, periodType: "Q" },
    orderBy: [{ asOf: "desc" }],
    distinct: ["symbol"],
    select: {
      symbol: true,
      revenueYoY: true,
      grossMargin: true,
      opMargin: true,
      netIncome: true,
      revenue: true,
    },
  });

  const finite = (xs: (number | null)[]) =>
    xs.filter((v): v is number => v != null && Number.isFinite(v));

  return {
    sampleCount: rows.length,
    revenueYoYMedian: median(finite(rows.map((r) => r.revenueYoY))),
    grossMarginMedian: median(finite(rows.map((r) => r.grossMargin))),
    opMarginMedian: median(finite(rows.map((r) => r.opMargin))),
    netMarginMedian: median(
      finite(
        rows.map((r) =>
          r.netIncome != null && r.revenue != null && r.revenue !== 0
            ? r.netIncome / r.revenue
            : null,
        ),
      ),
    ),
  };
}
