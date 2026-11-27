import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { day, MarketError } from "@/lib/market/schema";
import { filingIdentity, loadStockDisclosures, loadStockInsiderFilings, readReleaseAttachments, stockInsiderFilingCoverage } from "@/lib/equity/stockDisclosures";
import { getQuarterlyFundamentalsBatch, type QuarterSnapshotRow } from "@/lib/equity/equityFundamentalsStore";
import { loadManagementGuidance } from "@/lib/equity/managementGuidanceStore";
import { getIndicator } from "@/lib/equity/stockData/indicatorRegistry";
import { normalizeUsTicker } from "@/lib/equity/stockData/request";
import { quarterPositionFromDate, quarterStatementValues, resolveQuarterlyGrossMargin } from "@/lib/equity/stockData/resolve";
import { GICS_SECTOR_DEFS, GICS_SECTORS } from "@/lib/equity/gicsCatalog";
import { loadIndustryFinancials, industryFinancialResponse } from "@/lib/equity/industryFinancialsStore";
import { FACTOR_DEFS, FACTOR_MAP } from "@/lib/quant/factorRegistry";
import { runScreenerQuery } from "@/lib/quant/screenerData";
import { validateScreenerConfig, type ScreenerConfig } from "@/lib/quant/screener";
import { loadOwnershipMonitor } from "@/lib/equity/ownershipMonitor";

const symbolInput = z.string().trim().max(24).refine(value => normalizeUsTicker(value) !== null, "美股代码无效");
export const stockEvidence = z.object({ symbol: symbolInput }).strict();
export const insiderFilingInput = stockEvidence.extend({ limit: z.number().int().min(1).max(20).default(10) });
export const ownershipMonitorInput = stockEvidence.extend({
  asOf: day.optional(),
  from: day.optional().describe("默认截至日前 90 个自然日，最多回看 2 年。"),
  section: z.enum(["transactions", "plans"]).default("transactions"),
  offset: z.number().int().min(0).max(10_000).default(0),
  limit: z.number().int().min(1).max(30).default(15),
});
const maxQuarterHistoryDays = 15 * 366;
export const quarterlyFinancialsInput = stockEvidence.extend({
  startDate: day.describe("按实际财季末筛选，包含起始日期。"),
  endDate: day.describe("包含结束日期，区间最多 15 年。"),
  indicatorIds: z.array(z.string().min(1).max(80)).min(1).max(12)
    .describe("报表指标 ID，例如 fs.revenue、fs.netIncome、fs.costOfRevenue。"),
});
export const disclosureArchiveInput = stockEvidence.extend({
  accession: z.string().trim().regex(/^\d{10}-\d{2}-\d{6}$/).describe("从 get_stock_disclosures 获取的公告编号。"),
  filename: z.string().trim().min(1).max(256).optional().describe("从公告返回的附件名称取得。只有一个附件时可省略。"),
  offset: z.number().int().min(0).max(1_000_000).default(0).describe("下一页使用返回的 nextOffset，保持公告和附件不变。"),
  maxChars: z.number().int().min(1).max(12000).default(8000),
});

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

export function quarterlyStatementFields(ids: string[]) {
  return [...new Set(ids)].map(id => {
    const def = getIndicator(id);
    if (!def || def.source.kind !== "statement") {
      throw new MarketError("INVALID_INPUT", "仅支持股票财务报表指标，请先搜索股票指标");
    }
    return { id, label: def.label, unit: def.unit, line: def.source.line };
  });
}

export function quarterlyValues(quarter: QuarterSnapshotRow, fields: ReturnType<typeof quarterlyStatementFields>) {
  const values = quarterStatementValues(quarter, fields.map(field => field.line));
  const marginIndex = fields.findIndex(field => field.id === "fs.grossMargin");
  const margin = marginIndex >= 0 ? resolveQuarterlyGrossMargin(quarter) : null;
  if (marginIndex >= 0) values[marginIndex] = margin?.value ?? null;
  return { values, grossMarginSource: margin?.source ?? null };
}

export async function loadResearchQuarters(symbol: string, startDate: string, endDate: string) {
  const row = await security(symbol);
  const stored = await getQuarterlyFundamentalsBatch([row.symbol], { periodEndRange: { startDate, endDate } });
  return { symbol: row.symbol, quarters: stored.get(row.symbol) ?? [] };
}

export function prepareQuarterlyFinancials(input: z.output<typeof quarterlyFinancialsInput>) {
  const rangeDays = (Date.parse(input.endDate) - Date.parse(input.startDate)) / 86_400_000;
  if (rangeDays < 0 || rangeDays > maxQuarterHistoryDays) {
    throw new MarketError("INVALID_INPUT", "财季末日期区间必须按时间升序且不超过 15 年");
  }
  const fields = quarterlyStatementFields(input.indicatorIds);
  return {
    cost: 1 + Math.ceil((1 + rangeDays / 90) * fields.length / 10),
    run: async () => {
      const { startDate, endDate } = input;
      const { symbol, quarters: stored } = await loadResearchQuarters(input.symbol, startDate, endDate);
      const columns = fields.map(({ id, label, unit }) => ({ id, label, unit }));
      const quarters = stored.map(quarter => {
        const position = quarter.fiscalQuarter != null && quarter.fiscalQuarter >= 1 && quarter.fiscalQuarter <= 4
          ? quarterPositionFromDate(quarter) : null;
        const { values, grossMarginSource } = quarterlyValues(quarter, fields);
        return {
          periodEnd: quarter.fiscalDate, fiscalYear: position?.year ?? null, fiscalQuarter: position?.q ?? null,
          firstReportedAt: quarter.firstReportedAt,
          values: Object.fromEntries(columns.map(({ id }, i) => [id, values[i]])),
          ...(fields.some(field => field.id === "fs.grossMargin") ? { grossMarginSource } : {}),
          missingIndicatorIds: columns.filter((_, i) => values[i] === null).map(c => c.id),
        };
      });
      return {
        symbol, startDate, endDate, basis: "single_quarter", columns, quarters,
        coverage: { returnedQuarters: quarters.length, firstPeriodEnd: quarters[0]?.periodEnd ?? null, lastPeriodEnd: quarters.at(-1)?.periodEnd ?? null },
        valueNote: "pct 使用比例值，0.15 代表 15%；金额与股数使用未缩放原值。缺失值返回 null；区间仅返回已有财季，历史值可能包含后续修订。",
        ...(fields.some(field => field.id === "fs.grossMargin") ? {
          grossMarginNote: "优先使用已有毛利率。缺失时优先用同季毛利润除以营收，其次用同季营收减营业成本后除以营收。依据不足时返回空值。",
        } : {}),
        websiteUrl: absoluteUrl(`/equity/stocks/${encodeURIComponent(symbol)}`),
      };
    },
  };
}

export async function getStockDisclosureArchive(input: z.output<typeof disclosureArchiveInput>) {
  const row = await security(input.symbol);
  const filing = await prisma.secFiling.findFirst({
    where: { ...filingIdentity(row.symbol, row.cik), accession: input.accession },
    select: { accession: true, form: true, filedAt: true, reportPeriodEnd: true, url: true, items: true, earningsRelease: true },
  });
  if (!filing) throw new MarketError("NOT_FOUND", "未找到属于该证券的公告");
  const attachments = readReleaseAttachments(filing.earningsRelease);
  const info = {
    symbol: row.symbol, accession: filing.accession, form: filing.form,
    filedOn: filing.filedAt.toISOString().slice(0, 10),
    filingReportPeriodEnd: filing.reportPeriodEnd?.toISOString().slice(0, 10) ?? null,
    isEarnings: filing.items?.split(",").some(item => item.trim() === "2.02") ?? false,
    sourceUrl: safeFilingUrl(filing.url), attachments: attachments.map(attachment => ({
      filename: attachment.filename, sourceUrl: attachment.url, hasArchivedText: !!attachment.text.trim(),
    })),
    websiteUrl: absoluteUrl(`/equity/stocks/${encodeURIComponent(row.symbol)}`),
  };
  const attachment = input.filename ? attachments.find(item => item.filename === input.filename)
    : attachments.length === 1 ? attachments[0] : undefined;
  if (input.filename && !attachment) throw new MarketError("NOT_FOUND", "该公告没有此归档附件，请核对附件名称");
  if (!attachment || !attachment.text.trim()) {
    return { ...info, status: !attachment && attachments.length > 1 ? "select_attachment" : "archive_unavailable", nextOffset: null };
  }
  const chars = Array.from(attachment.text);
  if (input.offset > chars.length) throw new MarketError("INVALID_INPUT", "分页位置超出附件归档文字范围");
  const end = Math.min(input.offset + input.maxChars, chars.length);
  return {
    ...info, status: "ok", attachment: { filename: attachment.filename, sourceUrl: attachment.url },
    contentType: "text/plain", text: chars.slice(input.offset, end).join(""),
    offset: input.offset, nextOffset: end < chars.length ? end : null, archivedCharacters: chars.length,
    coverageNote: "返回站内已归档的附件文字，可能仅覆盖原公告的一部分。",
  };
}

export async function getStockDisclosures(symbol: string) {
  const row = await security(symbol);
  const data = await loadStockDisclosures(row.symbol, row.cik);
  return {
    symbol: row.symbol,
    announcements: data.announcements.map(item => ({
      accession: item.accession, form: item.form, date: item.date, isEarnings: item.isEarnings, sourceUrl: safeFilingUrl(item.url),
      attachments: item.attachments.slice(0, 3).map(a => ({
        label: a.filename, filename: a.filename, sourceUrl: a.url,
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

function ownershipResultSummary(section: "transactions" | "plans", matchedCount: number, returnedCount: number, coverageStatus: "complete" | "incomplete" | "unknown") {
  const subject = section === "plans" ? "10b5-1 计划" : "P/S 买卖交易";
  const coverageLabel = { complete: "同步覆盖满足请求区间", incomplete: "覆盖不完整", unknown: "覆盖未确认" }[coverageStatus];
  const result = matchedCount ? `检出 ${matchedCount} 条已核实${subject}，本页 ${returnedCount} 条` : `未检出已核实${subject}`;
  const caveat = coverageStatus !== "complete" ? "；当前结果仅反映站内已核实的记录" : "";
  return { coverageStatus, matchedCount, returnedCount, message: `${coverageLabel}，${result}${caveat}。` };
}

export function prepareOwnershipMonitor(input: z.output<typeof ownershipMonitorInput>) {
  const today = new Date().toISOString().slice(0, 10);
  const asOf = input.asOf ?? today;
  const from = input.from ?? new Date(Date.parse(asOf) - 89 * 86_400_000).toISOString().slice(0, 10);
  const days = (Date.parse(asOf) - Date.parse(from)) / 86_400_000;
  if (asOf > today || from < "1990-01-01" || days < 0 || days > 2 * 366) {
    throw new MarketError("INVALID_INPUT", "请提供有效的历史查询区间，最多回看 2 年");
  }
  return { cost: 8 + Math.ceil(days / 90), run: async () => {
    const stock = await security(input.symbol);
    const [monitor, form4Coverage] = await Promise.all([
      loadOwnershipMonitor(stock.symbol, asOf, from),
      stockInsiderFilingCoverage(stock.symbol, stock.cik, from, asOf),
    ]);
    if (!monitor) throw new MarketError("NOT_FOUND", "站内未找到该标的");
    const coverage = monitor.coverage;
    const form4Gap = input.section === "transactions" && form4Coverage.readable < form4Coverage.indexed;
    const pendingTrades = input.section === "transactions" && monitor.transactions.some(trade => trade.status === "pending");
    const coverageStatus = monitor.truncated || form4Gap || pendingTrades ||
      (coverage && (!coverage.complete || coverage.since > from || coverage.through < asOf))
      ? "incomplete"
      : coverage ? "complete" : "unknown";
    const common = {
      symbol: monitor.symbol, name: monitor.name, asOf, from,
      coverage: monitor.coverage && {
        since: monitor.coverage.since, through: monitor.coverage.through, complete: monitor.coverage.complete,
        checkedAt: monitor.coverage.checkedAt,
      },
      truncated: monitor.truncated,
      form4Coverage: {
        ...form4Coverage,
        note: "按请求区间内的申报日期统计 Form 4/4-A；已结构化申报可能只含非 P/S 变动。计划另依据定期报告，申报数不代表交易或计划笔数。",
      },
      supply: monitor.supply.slice(0, 20).map(row => ({
        security: row.security, sells90: row.sells90, buys90: row.buys90, netSells90: row.netSells90,
        complete90: row.complete90, pending90: row.pending, floatShares: row.floatShares, floatDate: row.floatDate,
        netSellingToFloat90: row.supplyRatio90, sellingToAdv30: row.sellingAdv30, coverageNote: row.reason,
      })),
      supplyTruncated: monitor.supply.length > 20,
      coverageNote: "按截至日已披露资料及当前核实结果重建。P/S 可包括私下成交。计划剩余量为有证据支持的条件性上限。",
      websiteUrl: absoluteUrl(`/equity/ownership?symbol=${encodeURIComponent(stock.symbol)}`),
    };
    const { offset, limit, section } = input;
    if (section === "plans") {
      const plans = monitor.plans.filter(plan => plan.verified && plan.rule10b51 === true &&
        (plan.filedAt >= from || plan.state === "可能执行中" || plan.state === "待执行窗口"))
        .sort((a, b) => b.filedAt.localeCompare(a.filedAt) || a.id.localeCompare(b.id));
      const page = plans.slice(offset, offset + limit);
      return { ...common, section, resultSummary: ownershipResultSummary(section, plans.length, page.length, coverageStatus), plans: page.map(plan => ({
        id: plan.id, owner: plan.ownerName, security: plan.security, status: plan.state,
        disclosedOn: plan.filedAt, adoptedOn: plan.adopted, start: plan.start, end: plan.end, terminatedOn: plan.terminated,
        maximumShares: plan.adjustedMaximum, linkedExecutedShares: plan.linkedExecuted,
        remainingUpperBoundShares: plan.remainingUpperBound, note: plan.calculationNote,
        sourceUrl: safeFilingUrl(plan.sourceUrl),
      })), nextOffset: plans.length > offset + limit ? offset + limit : null };
    }
    const trades = monitor.transactions.filter(trade => trade.status === "included" &&
      ((trade.transactionCode === "P" && trade.acquiredDisposedCode === "A") ||
        (trade.transactionCode === "S" && trade.acquiredDisposedCode === "D")))
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.filedAt.localeCompare(a.filedAt) || a.id.localeCompare(b.id));
    const page = trades.slice(offset, offset + limit);
    return { ...common, section, resultSummary: ownershipResultSummary(section, trades.length, page.length, coverageStatus), transactions: page.map(trade => ({
      accession: trade.accession, security: trade.security, filer: trade.filerName, transactionDate: trade.transactionDate,
      filedOn: trade.filedAt, side: trade.transactionCode === "P" ? "buy" : "sell",
      reportedShares: trade.shares, adjustedShares: trade.adjustedShares, reportedPricePerShare: trade.pricePerShare,
      planStatus: trade.planStatus,
      sourceUrl: /^\d+$/.test(trade.cik) && /^\d{10}-\d{2}-\d{6}$/.test(trade.accession)
        ? `https://www.sec.gov/Archives/edgar/data/${trade.cik.replace(/^0+/, "")}/${trade.accession.replace(/-/g, "")}/` : null,
    })), nextOffset: trades.length > offset + limit ? offset + limit : null };
  } };
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
