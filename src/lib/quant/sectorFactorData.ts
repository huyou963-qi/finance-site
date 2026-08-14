import { prisma } from "@/lib/prisma";

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function iso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export type SectorFactorAggregateRow = {
  sector: string;
  date: Date;
  factorKey: string;
  median: number;
  p25: number;
  p75: number;
  coverage: number;
  sampleCount: number;
};

/** 行业因子截面日期的统一 as-of 解析，供量化与行业研究共同使用。 */
export async function resolveSectorFactorDate(boundary?: string | null): Promise<string | null> {
  const row = await prisma.factorSectorSnapshot.findFirst({
    where: boundary ? { date: { lte: utcDate(boundary) } } : {},
    orderBy: { date: "desc" },
    select: { date: true },
  });
  return row ? iso(row.date) : null;
}

/** 行业因子长表的统一批量读取入口；不在行业专题模块重复 Prisma 查询口径。 */
export async function loadSectorFactorAggregates(options: {
  dates: readonly string[];
  factorKeys: readonly string[];
  sectors?: readonly string[];
}): Promise<SectorFactorAggregateRow[]> {
  if (options.dates.length === 0 || options.factorKeys.length === 0) return [];
  return prisma.factorSectorSnapshot.findMany({
    where: {
      date: { in: [...new Set(options.dates)].map(utcDate) },
      factorKey: { in: [...new Set(options.factorKeys)] },
      ...(options.sectors?.length
        ? { sector: { in: [...new Set(options.sectors)] } }
        : {}),
    },
    select: {
      sector: true,
      date: true,
      factorKey: true,
      median: true,
      p25: true,
      p75: true,
      coverage: true,
      sampleCount: true,
    },
    orderBy: [{ date: "asc" }, { sector: "asc" }, { factorKey: "asc" }],
  });
}
