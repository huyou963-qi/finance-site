import type { PrismaClient } from "@prisma/client";

/**
 * Symbols whose financial statements the daily batch keeps current (Company Facts download,
 * quarterly snapshot and vintages). Every other security in equity_security still has its
 * filings indexed for the event timeline, but never triggers the per-company financial downloads.
 *
 * Coverage = already has quarterly fundamentals ∪ GICS-classified (S&P 500 master) ∪ latest
 * constituents of each tracked index. A new index (e.g. Russell 2000) joins by loading its
 * constituents into index_constituent; no code change here.
 */
export async function loadFundamentalsCoverage(db: PrismaClient): Promise<Set<string>> {
  const [withFundamentals, classified, latestByIndex] = await Promise.all([
    db.equityFundamentalSnapshot.groupBy({ by: ["symbol"], where: { periodType: "Q" } }),
    db.equitySecurity.findMany({ where: { gicsSector: { not: null } }, select: { symbol: true } }),
    db.indexConstituent.groupBy({ by: ["indexCode"], _max: { asOfDate: true } }),
  ]);
  const constituents = latestByIndex.length ? await db.indexConstituent.findMany({
    where: { OR: latestByIndex.flatMap(row => row._max.asOfDate ? [{ indexCode: row.indexCode, asOfDate: row._max.asOfDate }] : []) },
    select: { symbol: true },
  }) : [];
  return new Set([...withFundamentals, ...classified, ...constituents].map(row => row.symbol.toUpperCase()));
}
