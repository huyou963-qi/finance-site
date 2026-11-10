/** 「股票数据」页的系统股票池：标普 500 与 GICS 11 个一级行业（成分按市值降序） */

import { prisma } from "@/lib/prisma";
import { SP500_INDEX_CODE } from "@/lib/equity/equitySecurities";
import { GICS_SECTOR_DEFS, isGicsSector } from "@/lib/equity/gicsCatalog";

export type PoolSummary = { id: string; label: string; count: number };
export type PoolMember = { symbol: string; name: string };

const SECTOR_PREFIX = "sector:";

export async function listSystemPools(): Promise<PoolSummary[]> {
  const latest = await prisma.indexConstituent.findFirst({
    where: { indexCode: SP500_INDEX_CODE },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  const [spCount, sectorCounts] = await Promise.all([
    latest ? prisma.indexConstituent.count({ where: { indexCode: SP500_INDEX_CODE, asOfDate: latest.asOfDate } }) : 0,
    prisma.equitySecurity.groupBy({ by: ["gicsSector"], where: { gicsSector: { not: null } }, _count: { _all: true } }),
  ]);
  const countBy = new Map(sectorCounts.map((r) => [r.gicsSector, r._count._all]));
  return [
    ...(spCount ? [{ id: "sp500", label: "标普 500", count: spCount }] : []),
    ...GICS_SECTOR_DEFS.map((d) => ({ id: `${SECTOR_PREFIX}${d.sector}`, label: `GICS · ${d.nameZh}`, count: countBy.get(d.sector) ?? 0 }))
      .filter((p) => p.count > 0),
  ];
}

export async function loadPoolMembers(id: string): Promise<PoolMember[] | null> {
  if (id === "sp500") {
    const latest = await prisma.indexConstituent.findFirst({
      where: { indexCode: SP500_INDEX_CODE },
      orderBy: { asOfDate: "desc" },
      select: { asOfDate: true },
    });
    if (!latest) return [];
    const members = await prisma.indexConstituent.findMany({
      where: { indexCode: SP500_INDEX_CODE, asOfDate: latest.asOfDate },
      select: { symbol: true },
    });
    const secs = await prisma.equitySecurity.findMany({
      where: { symbol: { in: members.map((m) => m.symbol) } },
      select: { symbol: true, name: true, marketCap: true },
    });
    const bySymbol = new Map(secs.map((s) => [s.symbol, s]));
    return members
      .map((m) => ({ symbol: m.symbol.replace(".", "-"), name: bySymbol.get(m.symbol)?.name ?? m.symbol, cap: bySymbol.get(m.symbol)?.marketCap ?? -1 }))
      .sort((a, b) => b.cap - a.cap || a.symbol.localeCompare(b.symbol))
      .map(({ symbol, name }) => ({ symbol, name }));
  }
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
