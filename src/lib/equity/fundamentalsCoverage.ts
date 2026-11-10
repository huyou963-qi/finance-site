import type { PrismaClient } from "@prisma/client";

/**
 * Symbols the daily SEC batch covers: filing index, Company Facts download, quarterly snapshot and
 * vintages. Other securities in equity_security are not refreshed daily; their stock page still
 * backfills filings once on first visit.
 *
 * Coverage = already has quarterly fundamentals ∪ GICS-classified (S&P 500 master) ∪ latest
 * constituents of each tracked index, including the self-built US_TOP3000 public-float ranking
 * (fundamentalsUniverse.ts). A new list joins by loading it into index_constituent; no code change here.
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
