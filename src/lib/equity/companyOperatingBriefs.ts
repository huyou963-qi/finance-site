import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const MONTH_RE = /^\d{4}-\d{2}$/;
const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} 必填`);
  }
  return value.trim();
}

export type CompanyOperatingBriefMeta = {
  symbol: string;
  periodMonth: string;
  title: string;
  gicsSector: string;
  gicsIndustry: string;
  generatedAt: string;
  summaryOneLiner: string;
  disclosureCoverage: unknown;
  managementTone?: string;
  toneConfidence?: string;
  cik?: string;
};

export function parseCompanyOperatingBriefMeta(raw: unknown): CompanyOperatingBriefMeta {
  if (!raw || typeof raw !== "object") throw new Error("meta 须为 JSON 对象");
  const m = raw as Record<string, unknown>;
  const symbol = asString(m.symbol, "meta.symbol").toUpperCase();
  if (!SYMBOL_RE.test(symbol)) throw new Error("meta.symbol 格式无效");
  const periodMonth = asString(m.periodMonth, "meta.periodMonth");
  if (!MONTH_RE.test(periodMonth)) throw new Error("meta.periodMonth 须为 YYYY-MM");
  return {
    symbol,
    periodMonth,
    title: asString(m.title, "meta.title"),
    gicsSector: asString(m.gicsSector, "meta.gicsSector"),
    gicsIndustry: asString(m.gicsIndustry, "meta.gicsIndustry"),
    generatedAt: asString(m.generatedAt, "meta.generatedAt"),
    summaryOneLiner: asString(m.summaryOneLiner, "meta.summaryOneLiner"),
    disclosureCoverage: m.disclosureCoverage ?? { hasNewDisclosure: false, sources: [] },
    managementTone: typeof m.managementTone === "string" ? m.managementTone : undefined,
    toneConfidence: typeof m.toneConfidence === "string" ? m.toneConfidence : undefined,
    cik: typeof m.cik === "string" ? m.cik : undefined,
  };
}

export async function upsertCompanyOperatingBrief(input: {
  meta: CompanyOperatingBriefMeta;
  bodyMarkdown: string;
  analysis?: unknown;
}) {
  const metaJson = {
    ...input.meta,
    ...(input.analysis != null ? { analysis: input.analysis } : {}),
  } as Prisma.InputJsonValue;

  const existing = await prisma.companyOperatingBrief.findUnique({
    where: {
      symbol_periodMonth: {
        symbol: input.meta.symbol,
        periodMonth: input.meta.periodMonth,
      },
    },
  });

  if (existing) {
    const report = await prisma.companyOperatingBrief.update({
      where: { id: existing.id },
      data: {
        meta: metaJson,
        bodyMarkdown: input.bodyMarkdown,
      },
    });
    return { report, created: false };
  }

  const report = await prisma.companyOperatingBrief.create({
    data: {
      symbol: input.meta.symbol,
      periodMonth: input.meta.periodMonth,
      meta: metaJson,
      bodyMarkdown: input.bodyMarkdown,
    },
  });
  return { report, created: true };
}

export async function listCompanyOperatingBriefs(opts: {
  sector?: string;
  symbol?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  let symbolFilter: string[] | undefined;
  if (opts.sector) {
    const secs = await prisma.equitySecurity.findMany({
      where: { gicsSector: opts.sector },
      select: { symbol: true },
    });
    symbolFilter = secs.map((s) => s.symbol);
  }

  const where = {
    ...(opts.symbol ? { symbol: opts.symbol.toUpperCase() } : {}),
    ...(symbolFilter ? { symbol: { in: symbolFilter } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.companyOperatingBrief.count({ where }),
    prisma.companyOperatingBrief.findMany({
      where,
      orderBy: [{ periodMonth: "desc" }, { symbol: "asc" }],
      take: limit,
      skip: offset,
    }),
  ]);

  return {
    total,
    briefs: rows.map((r) => ({
      id: r.id,
      symbol: r.symbol,
      periodMonth: r.periodMonth,
      meta: r.meta,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}

export async function getCompanyOperatingBrief(id: string) {
  const row = await prisma.companyOperatingBrief.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    symbol: row.symbol,
    periodMonth: row.periodMonth,
    meta: row.meta,
    bodyMarkdown: row.bodyMarkdown,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
