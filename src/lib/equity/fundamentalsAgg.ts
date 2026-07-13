/**
 * 行业财报聚合：中位数 + 覆盖率。
 */

import { prisma } from "@/lib/prisma";
import type { GicsSector } from "@/lib/equity/gicsCatalog";
import { GICS_SECTOR_DEFS, getSectorDef } from "@/lib/equity/gicsCatalog";

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

export async function aggregateSectorFundamentals(
  sector: GicsSector,
  periodType: FundamentalPeriodType = "FY",
): Promise<SectorFundamentalsAgg> {
  const securities = await prisma.equitySecurity.findMany({
    where: { gicsSector: sector },
    select: { symbol: true },
  });
  const symbols = securities.map((s) => s.symbol);
  const universeCount = symbols.length;

  const snaps = symbols.length
    ? await prisma.equityFundamentalSnapshot.findMany({
        where: { symbol: { in: symbols }, periodType },
        orderBy: [{ asOf: "desc" }],
      })
    : [];

  // 每只股票取最新一条（非 TTM 优先季度，若仅有 TTM 也可用）
  const latestBySymbol = new Map<string, (typeof snaps)[number]>();
  for (const row of snaps) {
    if (latestBySymbol.has(row.symbol)) continue;
    latestBySymbol.set(row.symbol, row);
  }

  const members = [...latestBySymbol.values()].map((r) => ({
    symbol: r.symbol,
    revenueYoY: r.revenueYoY,
    epsYoY: r.epsYoY,
    pe: r.pe,
    grossMargin: r.grossMargin,
    opMargin: r.opMargin,
    period: r.period,
  }));

  const pick = (sel: (m: (typeof members)[number]) => number | null) =>
    median(members.map(sel).filter((v): v is number => v != null && Number.isFinite(v)));

  const sampleCount = members.length;
  const def = getSectorDef(sector);

  return {
    sector,
    nameZh: def.nameZh,
    sampleCount,
    universeCount,
    coveragePct: universeCount ? sampleCount / universeCount : 0,
    revenueYoYMedian: pick((m) => m.revenueYoY),
    epsYoYMedian: pick((m) => m.epsYoY),
    grossMarginMedian: pick((m) => m.grossMargin),
    opMarginMedian: pick((m) => m.opMargin),
    peMedian: pick((m) => m.pe),
    members: members.sort((a, b) => a.symbol.localeCompare(b.symbol)),
  };
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
