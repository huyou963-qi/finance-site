/** 「股票数据」页的系统股票池：标普 500、公众流通市值前 3000 与 GICS 11 个一级行业（成分按市值降序） */

import { prisma } from "@/lib/prisma";
import { SP500_INDEX_CODE } from "@/lib/equity/equitySecurities";
import { TOP_UNIVERSE_INDEX_CODE } from "@/lib/equity/fundamentalsUniverse";
import { GICS_SECTOR_DEFS, isGicsSector } from "@/lib/equity/gicsCatalog";

export type PoolSummary = { id: string; label: string; count: number };
export type PoolMember = { symbol: string; name: string };

const SECTOR_PREFIX = "sector:";

async function latestIndexAsOf(indexCode: string) {
  return prisma.indexConstituent.findFirst({
    where: { indexCode },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
}

async function loadIndexMembers(indexCode: string): Promise<PoolMember[]> {
  const latest = await latestIndexAsOf(indexCode);
  if (!latest) return [];
  const members = await prisma.indexConstituent.findMany({
    where: { indexCode, asOfDate: latest.asOfDate },
    select: { symbol: true },
  });
  const secs = await prisma.equitySecurity.findMany({
    where: { symbol: { in: members.map((m) => m.symbol) } },
    select: { symbol: true, name: true, marketCap: true },
  });
  const bySymbol = new Map(secs.map((s) => [s.symbol, s]));
  return members
    .map((m) => ({
      symbol: m.symbol.replace(".", "-"),
      name: bySymbol.get(m.symbol)?.name ?? m.symbol,
      cap: bySymbol.get(m.symbol)?.marketCap ?? -1,
    }))
    .sort((a, b) => b.cap - a.cap || a.symbol.localeCompare(b.symbol))
    .map(({ symbol, name }) => ({ symbol, name }));
}

export async function listSystemPools(): Promise<PoolSummary[]> {
  const [spLatest, topLatest, sectorCounts] = await Promise.all([
    latestIndexAsOf(SP500_INDEX_CODE),
    latestIndexAsOf(TOP_UNIVERSE_INDEX_CODE),
    prisma.equitySecurity.groupBy({ by: ["gicsSector"], where: { gicsSector: { not: null } }, _count: { _all: true } }),
  ]);
  const [spCount, topCount] = await Promise.all([
    spLatest ? prisma.indexConstituent.count({ where: { indexCode: SP500_INDEX_CODE, asOfDate: spLatest.asOfDate } }) : 0,
    topLatest ? prisma.indexConstituent.count({ where: { indexCode: TOP_UNIVERSE_INDEX_CODE, asOfDate: topLatest.asOfDate } }) : 0,
  ]);
  const countBy = new Map(sectorCounts.map((r) => [r.gicsSector, r._count._all]));
  return [
    ...(spCount ? [{ id: "sp500", label: "标普 500", count: spCount }] : []),
    ...(topCount ? [{ id: "us-top3000", label: "美股公众流通市值前 3000", count: topCount }] : []),
    ...GICS_SECTOR_DEFS.map((d) => ({ id: `${SECTOR_PREFIX}${d.sector}`, label: `GICS · ${d.nameZh}`, count: countBy.get(d.sector) ?? 0 }))
      .filter((p) => p.count > 0),
  ];
}

export async function loadPoolMembers(id: string): Promise<PoolMember[] | null> {
  if (id === "sp500") return loadIndexMembers(SP500_INDEX_CODE);
  if (id === "us-top3000") return loadIndexMembers(TOP_UNIVERSE_INDEX_CODE);
  if (id.startsWith(SECTOR_PREFIX)) {
    const sector = id.slice(SECTOR_PREFIX.length);
    if (!isGicsSector(sector)) return null;
    const rows = await prisma.equitySecurity.findMany({
      where: { gicsSector: sector },
      orderBy: [{ marketCap: "desc" }, { symbol: "asc" }],
      select: { symbol: true, name: true },
    });
    return rows.map((r) => ({ symbol: r.symbol.replace(".", "-"), name: r.name }));
  }
  return null;
}
