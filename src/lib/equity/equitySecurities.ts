import { prisma } from "@/lib/prisma";
import {
  GICS_SECTOR_DEFS,
  type GicsSector,
  getSectorDef,
  isGicsSector,
  normalizeGicsSector,
  sectorFromSlug,
  sectorSlug,
} from "@/lib/equity/gicsCatalog";
import { styleForSector, type StyleBucketId } from "@/lib/equity/styleBuckets";

export const SP500_INDEX_CODE = "SP500";

export type SectorSummary = {
  sector: GicsSector;
  slug: string;
  nameZh: string;
  etf: string;
  style: StyleBucketId;
  constituentCount: number;
};

export type ConstituentRow = {
  symbol: string;
  name: string;
  gicsSector: GicsSector;
  gicsIndustry: string | null;
  gicsSubIndustry: string | null;
  marketCap: number | null;
  marketCapAsOf: string | null;
  cik: string | null;
};

function dateOnlyIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

export function resolveSectorParam(raw: string): GicsSector | null {
  const decoded = decodeURIComponent(raw).trim();
  if (isGicsSector(decoded)) return decoded;
  return sectorFromSlug(decoded) ?? normalizeGicsSector(decoded);
}

export async function listSectorSummaries(): Promise<SectorSummary[]> {
  const grouped = await prisma.equitySecurity.groupBy({
    by: ["gicsSector"],
    _count: { _all: true },
  });
  const countMap = new Map(
    grouped.map((g) => [g.gicsSector, g._count._all] as const),
  );

  return GICS_SECTOR_DEFS.map((def) => ({
    sector: def.sector,
    slug: sectorSlug(def.sector),
    nameZh: def.nameZh,
    etf: def.etf,
    style: styleForSector(def.sector),
    constituentCount: countMap.get(def.sector) ?? 0,
  }));
}

export async function listConstituentsBySector(
  sector: GicsSector,
  opts?: { limit?: number },
): Promise<ConstituentRow[]> {
  const limit = opts?.limit && opts.limit > 0 ? Math.min(opts.limit, 600) : 600;
  const rows = await prisma.equitySecurity.findMany({
    where: { gicsSector: sector },
    orderBy: [{ marketCap: "desc" }, { symbol: "asc" }],
    take: limit,
  });
  return rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    gicsSector: (isGicsSector(r.gicsSector)
      ? r.gicsSector
      : normalizeGicsSector(r.gicsSector) ?? sector) as GicsSector,
    gicsIndustry: r.gicsIndustry,
    gicsSubIndustry: r.gicsSubIndustry,
    marketCap: r.marketCap,
    marketCapAsOf: dateOnlyIso(r.marketCapAsOf),
    cik: r.cik,
  }));
}

export async function getLatestSp500AsOf(): Promise<string | null> {
  const row = await prisma.indexConstituent.findFirst({
    where: { indexCode: SP500_INDEX_CODE },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  return dateOnlyIso(row?.asOfDate ?? null);
}

export { getSectorDef };
