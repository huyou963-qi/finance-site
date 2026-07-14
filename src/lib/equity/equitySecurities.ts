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
import {
  getIndustryByCode,
  getIndustryStyle,
  industryFromSlug,
  industrySlug,
  listIndustriesBySector,
  type GicsIndustry,
  type IndustryStyleTag,
} from "@/lib/equity/gicsIndustryCatalog";
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
  gicsIndustryGroup: string | null;
  gicsIndustry: string | null;
  gicsSubIndustry: string | null;
  gicsIndustryCode: string | null;
  marketCap: number | null;
  marketCapAsOf: string | null;
  cik: string | null;
};

export type IndustrySummary = {
  code: string;
  slug: string;
  nameEn: string;
  sector: GicsSector;
  industryGroup: string;
  style: IndustryStyleTag;
  constituentCount: number;
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

export function resolveIndustryParam(
  sector: GicsSector,
  raw: string,
): GicsIndustry | null {
  const decoded = decodeURIComponent(raw).trim();
  if (/^\d{6}$/.test(decoded)) {
    const row = getIndustryByCode(decoded);
    return row?.sector === sector ? row : null;
  }
  return industryFromSlug(decoded, sector);
}

function mapConstituentRow(
  r: {
    symbol: string;
    name: string;
    gicsSector: string | null;
    gicsIndustryGroup: string | null;
    gicsIndustry: string | null;
    gicsSubIndustry: string | null;
    gicsIndustryCode: string | null;
    marketCap: number | null;
    marketCapAsOf: Date | null;
    cik: string | null;
  },
  fallbackSector: GicsSector,
): ConstituentRow {
  return {
    symbol: r.symbol,
    name: r.name,
    // 成分查询恒按具体 gicsSector 过滤，故 r.gicsSector 运行时非空；类型放宽后用 fallbackSector 兜底
    gicsSector: (r.gicsSector
      ? (isGicsSector(r.gicsSector) ? r.gicsSector : normalizeGicsSector(r.gicsSector) ?? fallbackSector)
      : fallbackSector) as GicsSector,
    gicsIndustryGroup: r.gicsIndustryGroup,
    gicsIndustry: r.gicsIndustry,
    gicsSubIndustry: r.gicsSubIndustry,
    gicsIndustryCode: r.gicsIndustryCode,
    marketCap: r.marketCap,
    marketCapAsOf: dateOnlyIso(r.marketCapAsOf),
    cik: r.cik,
  };
}

export async function listSectorSummaries(): Promise<SectorSummary[]> {
  // 只统计有 GICS 的成分（标普 500）；全宇宙未分类行（gicsSector=null）不进行业浏览计数
  const grouped = await prisma.equitySecurity.groupBy({
    by: ["gicsSector"],
    where: { gicsSector: { not: null } },
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
  return rows.map((r) => mapConstituentRow(r, sector));
}

export async function listIndustrySummaries(sector: GicsSector): Promise<IndustrySummary[]> {
  const catalog = listIndustriesBySector(sector);
  const grouped = await prisma.equitySecurity.groupBy({
    by: ["gicsIndustryCode"],
    where: { gicsSector: sector, gicsIndustryCode: { not: null } },
    _count: { _all: true },
  });
  const countMap = new Map(
    grouped
      .filter((g) => g.gicsIndustryCode)
      .map((g) => [g.gicsIndustryCode!, g._count._all] as const),
  );

  return catalog.map((ind) => ({
    code: ind.code,
    slug: industrySlug(ind.nameEn),
    nameEn: ind.nameEn,
    sector: ind.sector,
    industryGroup: ind.industryGroup,
    style: getIndustryStyle(ind.code) ?? "cyclical",
    constituentCount: countMap.get(ind.code) ?? 0,
  }));
}

export async function listConstituentsByIndustry(
  sector: GicsSector,
  industryCode: string,
  opts?: { limit?: number },
): Promise<ConstituentRow[]> {
  const limit = opts?.limit && opts.limit > 0 ? Math.min(opts.limit, 600) : 600;
  const rows = await prisma.equitySecurity.findMany({
    where: { gicsSector: sector, gicsIndustryCode: industryCode },
    orderBy: [{ marketCap: "desc" }, { symbol: "asc" }],
    take: limit,
  });
  return rows.map((r) => mapConstituentRow(r, sector));
}

export async function getLatestSp500AsOf(): Promise<string | null> {
  const row = await prisma.indexConstituent.findFirst({
    where: { indexCode: SP500_INDEX_CODE },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  return dateOnlyIso(row?.asOfDate ?? null);
}

export { getSectorDef, industrySlug };
