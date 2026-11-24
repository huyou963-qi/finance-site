import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { day, MarketError } from "@/lib/market/schema";
import { loadStockDisclosures, loadStockInsiderFilings } from "@/lib/equity/stockDisclosures";
import { loadManagementGuidance } from "@/lib/equity/managementGuidanceStore";
import { normalizeUsTicker } from "@/lib/equity/stockData/request";
import { GICS_SECTOR_DEFS, GICS_SECTORS } from "@/lib/equity/gicsCatalog";
import { loadIndustryFinancials, industryFinancialResponse } from "@/lib/equity/industryFinancialsStore";
import { FACTOR_DEFS, FACTOR_MAP } from "@/lib/quant/factorRegistry";
import { runScreenerQuery } from "@/lib/quant/screenerData";
import { validateScreenerConfig, type ScreenerConfig } from "@/lib/quant/screener";

const symbolInput = z.string().trim().max(24).refine(value => normalizeUsTicker(value) !== null, "美股代码无效");
export const stockEvidence = z.object({ symbol: symbolInput }).strict();
export const insiderFilingInput = stockEvidence.extend({ limit: z.number().int().min(1).max(20).default(10) });

async function security(raw: string) {
  const symbol = normalizeUsTicker(raw)!;
  const row = await prisma.equitySecurity.findFirst({
    where: { symbol: { in: [symbol, symbol.replace("-", ".")] } },
    orderBy: { symbol: "asc" }, select: { symbol: true, cik: true },
  });
  if (!row) throw new MarketError("NOT_FOUND", "未在站内证券目录找到该标的，请先搜索证券");
  return row;
}

function safeFilingUrl(value: string | null) {
  return value?.startsWith("https://www.sec.gov/Archives/") ? value : null;
}

export async function getStockDisclosures(symbol: string) {
  const row = await security(symbol);
  const data = await loadStockDisclosures(row.symbol, row.cik);
  return {
    symbol: row.symbol,
    announcements: data.announcements.map(item => ({
      accession: item.accession, form: item.form, date: item.date, isEarnings: item.isEarnings, sourceUrl: safeFilingUrl(item.url),
      attachments: item.attachments.slice(0, 3).map(a => ({
        label: a.filename, sourceUrl: a.url,
      })),
    })),
    latestFinancialFiling: data.financial ? {
      form: data.financial.form, date: data.financial.date, sourceUrl: safeFilingUrl(data.financial.url),
    } : null,
    websiteUrl: absoluteUrl(`/equity/stocks/${encodeURIComponent(row.symbol)}`),
  };
}

export async function getStockGuidance(symbol: string) {
  const row = await security(symbol);
  const data = await loadManagementGuidance(row.symbol, row.cik, { maxFilings: 24, includeDelivery: false });
  const guidance = data.series.map(s => s.latest).sort((a, b) => b.disclosedOn.localeCompare(a.disclosedOn));
  return {
    symbol: row.symbol, asOf: data.asOf, coverage: data.coverage,
    truncated: data.coverage.truncated || guidance.length > 20,
    guidance: guidance.slice(0, 20).map(g => ({
      metric: g.metric, basis: g.basis, target: g.target, value: g.value, status: g.status,
      disclosedOn: g.disclosedOn, dateBasis: g.dateBasis, sourceUrl: safeFilingUrl(g.sourceUrl),
      evidence: g.evidence.slice(0, 500),
    })),
    websiteUrl: absoluteUrl(`/equity/stocks/${encodeURIComponent(row.symbol)}`),
  };
}

export async function getStockInsiderFilings(symbol: string, limit: number) {
  const row = await security(symbol);
  const result = await loadStockInsiderFilings(row.symbol, row.cik, limit);
  return {
    symbol: row.symbol, truncated: result.truncated,
    filings: result.filings.map(({ url, ...filing }) => ({ ...filing, sourceUrl: safeFilingUrl(url) })),
    coverageNote: "Form 4 及其修订的申报引用，申报本身不代表公开市场买卖。",
    websiteUrl: absoluteUrl("/equity/ownership"),
  };
}

export const industryComparison = z.object({
  etfs: z.array(z.enum(GICS_SECTOR_DEFS.map(row => row.etf))).min(1).max(3),
  basis: z.enum(["Q", "TTM"]).default("TTM"),
  membership: z.enum(["current", "historical"]).default("current"),
  periods: z.number().int().min(1).max(12).default(4),
}).strict();

export async function compareIndustries(input: z.output<typeof industryComparison>) {
  const industries = [];
  for (const etf of new Set(input.etfs)) {
    const data = await loadIndustryFinancials({ etf, quarters: 12, membership: input.membership }, { bounded: true });
    const result = industryFinancialResponse(data)!;
    industries.push({
      etf: result.etf, name: result.nameZh, holdingsDate: result.holdingsDate, holdingsStale: result.holdingsStale,
      sourceUpdatedAt: result.sourceUpdatedAt,
      history: result.history.slice(-input.periods).map(row => row[input.basis]),
    });
  }
  return {
    industries, financialBasis: input.basis, membership: input.membership,
    units: { monetary: "USD", marginsAndGrowth: "fraction", weightCoverage: "fraction" },
    websiteUrl: absoluteUrl("/equity/industries"),
  };
}

export function listScreenerFactors() {
  return { factors: FACTOR_DEFS.map(({ key, nameZh, nameEn, category, higherIsBetter }) => ({
    key, name: nameZh, nameEn, category, higherIsBetter,
  })), sectors: GICS_SECTORS };
}

export const screenStocks = z.object({
  date: day.optional().describe("未指定时使用站内最新选股截面；指定时取不晚于该日期的最近截面。"),
  sectors: z.array(z.enum(GICS_SECTORS)).max(4).optional(),
  minMarketCap: z.number().nonnegative().optional(),
  conditions: z.array(z.object({
    factorKey: z.string().max(64),
    metric: z.enum(["value", "zscore", "sectorZscore", "percentile"]),
    op: z.enum(["gte", "lte", "between"]),
    bounds: z.object({ min: z.number().optional(), max: z.number().optional() }).strict(),
  }).strict()).max(5).default([]),
  sortFactor: z.string().max(64).describe("从 list_screener_factors 取得；按因子的既有优先方向排序。"),
  topN: z.number().int().min(1).max(30).default(10),
}).strict();

export function prepareScreener(input: z.output<typeof screenStocks>) {
  const config: ScreenerConfig = {
    date: input.date, universe: { sectors: input.sectors, minMarketCap: input.minMarketCap },
    conditions: input.conditions, ranking: { mode: "single", sortFactor: input.sortFactor, topN: input.topN },
  };
  if (!FACTOR_MAP.has(input.sortFactor)) throw new MarketError("INVALID_INPUT", "排序因子不存在，请先查看因子目录");
  try { validateScreenerConfig(config); } catch {
    throw new MarketError("INVALID_INPUT", "请核对因子、比较符和上下界");
  }
  return {
    cost: 8 + input.conditions.length,
    run: async () => {
      const data = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '8000'`;
        return runScreenerQuery(config, tx, 100000);
      }, { maxWait: 2000, timeout: 15000 });
      return { date: data.date, rows: data.rows, stats: data.stats,
        coverageNote: "使用该期站内因子截面。行业分类为当前口径，结果会报告缺失因子造成的剔除。",
        websiteUrl: absoluteUrl("/quant/screener") };
    },
  };
}
