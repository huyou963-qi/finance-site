import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { searchMarketIndicators, type describeIndicator } from "@/lib/market/indicators";
import { calculateMarketSeries } from "@/lib/market/calculate";
import { queryMarketData } from "@/lib/market/data";
import { getChart, renderChartData, searchCharts } from "@/lib/market/charts";
import { calculateMarketSchema, day, getChartSchema, MarketError, queryMarketSchema, searchChartsSchema, searchIndicatorsSchema } from "@/lib/market/schema";
import { INDICATORS, getIndicator } from "@/lib/equity/stockData/indicatorRegistry";
import { filterIndicators } from "@/lib/equity/stockData/indicatorSearch";
import { parseColumns, parseSymbols, StockDataRequestError } from "@/lib/equity/stockData/request";
import { planMarketData, queryStockData } from "@/lib/equity/stockData/query";
import { MAX_COLUMNS, MAX_SYMBOLS, RANGE_PRESETS } from "@/lib/equity/stockData/types";
import { parseTemplateInput, MAX_TEMPLATE_NAME } from "@/lib/equity/stockData/templates";
import { saveStockDataTemplate, TemplateStoreError } from "@/lib/equity/stockData/templateStore";
import { WatchlistStoreError } from "@/lib/data/marketWatchlistStore";
import {
  addMyWatchlistStocks, getMyMacroTemplates, getMyScreenerStrategies, getMyTemplate, getMyWatchlist, listMyTemplates, stockDataUrl,
} from "./personal";
import { personalReadScope, personalWriteScope, researchScope, researchScopeChallenge, workspaceReadScope, type ResearchScope, type ResearchFeature, type ResearchPrincipal } from "./oauth";
import { getResearchUsage, ResearchBudgetError, withResearchBudget } from "./usage";
import { fiscalAlignmentInput, prepareFiscalAlignment } from "./quarterAlignment";
import {
  prepareStockChart, prepareStockEventPackChart, prepareStockEventReturns, prepareStockPeers,
  stockChartInput, stockEventPackChartInput, stockEventReturnsInput, stockPeersInput,
} from "./stockMarket";
import {
  compareIndustries, getStockDisclosures, getStockGuidance, getStockInsiderFilings, industryComparison,
  disclosureArchiveInput, getStockDisclosureArchive, insiderFilingInput, listScreenerFactors, prepareQuarterlyFinancials,
  ownershipMonitorInput, prepareOwnershipMonitor, prepareScreener, quarterlyFinancialsInput, screenStocks, stockEvidence,
} from "./equity";
import { contentFeatures, getResearchContent, searchResearchContent, type ResearchContent } from "./content";
import { forecastFeatures, getForecastSummary } from "./forecasts";
import {
  factorResearchInput, getMyQuantReport, listMyQuantReports, prepareFactorResearch, prepareRegime, quantReportFeatures,
  quantReportPage, quantReportSection, regimeInput, validateQuantReportSection, type QuantReportKind,
} from "./quant";

const search = z.object({
  query: z.string().trim().min(1).max(100),
  limit: z.number().int().min(1).max(20).default(10),
}).strict();
const year = z.number().int().min(1990).max(2100);
const params = z.object({
  period: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("latestFY") }).strict(),
    z.object({ kind: z.literal("latestQ") }).strict(),
    z.object({ kind: z.literal("FY"), year }).strict(),
    z.object({ kind: z.literal("FQ"), year, q: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) }).strict(),
  ]).optional(),
  basis: z.enum(["single", "ttm"]).optional(),
  asOf: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("latest") }).strict(),
    z.object({ kind: z.literal("date"), date: day }).strict(),
  ]).optional(),
  range: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("preset"), preset: z.enum(RANGE_PRESETS) }).strict(),
    z.object({ kind: z.literal("custom"), from: day, to: day }).strict(),
  ]).optional(),
  adjust: z.enum(["forward", "none"]).optional(),
}).strict();

const stockColumn = z.object({
  indicatorId: z.string().max(80),
  params: params.optional(),
}).strict();

const stockQuery = z.object({
  symbols: z.array(z.string().max(24)).min(1).max(10),
  columns: z.array(stockColumn).min(1).max(20),
}).strict();

const groupId = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).nullable();
const watchlistLookup = z.object({
  groupId: groupId.optional().describe("省略为全部自选，null 为未分组，字符串为自己的分组 ID。"),
  offset: z.number().int().min(0).max(2000).default(0),
  limit: z.number().int().min(1).max(50).default(25),
}).strict();
const watchlistWrite = z.object({
  symbols: z.array(z.string().trim().min(1).max(24)).min(1).max(10),
  groupId: groupId.default(null).describe("目标分组 ID，省略或 null 为未分组。"),
}).strict();
const templateWrite = z.object({
  name: z.string().trim().min(1).max(MAX_TEMPLATE_NAME),
  columns: z.array(stockColumn).min(1).max(MAX_COLUMNS),
  symbols: z.array(z.string().trim().min(1).max(24)).max(MAX_SYMBOLS).optional(),
}).strict();

function supportedStockIndicator(id: string) {
  const def = getIndicator(id);
  // Exchange needs an external directory on a cache miss.
  return def && id !== "sec.exchange" ? def : undefined;
}

function prepareStockQuery(input: z.infer<typeof stockQuery>) {
  const { symbols, ignored } = parseSymbols(input.symbols);
  if (!symbols.length || ignored.length) throw new MarketError("INVALID_INPUT", "请提供有效的美股或 ETF 代码");
  const columns = parseColumns(input.columns.map((column, i) => {
    if (!supportedStockIndicator(column.indicatorId)) throw new MarketError("INVALID_INPUT", "指标不可用，请先搜索股票指标");
    return { ...column, key: `c${i + 1}` };
  }));
  const today = new Date().toISOString().slice(0, 10);
  const plan = planMarketData(columns, today);
  const days = plan?.windows.reduce((total, w) => total + Math.max(1, (Date.parse(w.to) - Date.parse(w.from)) / 86_400_000 + 1), 0) ?? 0;
  const dates = (plan?.pitDates.length ?? 0) + (plan?.insiderDates.length ?? 0);
  if (days > 4000 || dates > 4) throw new MarketError("RANGE_TOO_LARGE", "请缩短行情查询区间或减少不同的截止日");
  const cost = 1 + Math.ceil(symbols.length * (columns.length + days / 90 + dates * 4) / 10);
  return { symbols, columns, cost };
}

function publicMacro(i: ReturnType<typeof describeIndicator>) {
  return {
    indicatorId: i.indicatorId, name: i.name, nameEn: i.nameEn, frequency: i.frequency,
    unit: i.unit, currency: i.currency, instrumentType: i.instrumentType, location: i.location,
    lastUpdatedAt: i.lastUpdatedAt, websiteUrl: absoluteUrl("/macro"),
  };
}

function result(payload: Record<string, unknown>, isError = false, image?: Buffer) {
  const text = JSON.stringify(payload);
  const chartLink = image && typeof payload.imageUrl === "string" && typeof payload.imageFilename === "string"
    ? [{ type: "resource_link" as const, uri: payload.imageUrl, name: payload.imageFilename, mimeType: "image/png", size: image.byteLength }]
    : [];
  const eventPackLink = typeof payload.eventPackDownloadUrl === "string" && typeof payload.eventPackFilename === "string"
    ? [{ type: "resource_link" as const, uri: payload.eventPackDownloadUrl, name: payload.eventPackFilename, mimeType: "application/json" }]
    : [];
  return { isError, content: [
    { type: "text" as const, text },
    ...(image ? [{ type: "image" as const, data: image.toString("base64"), mimeType: "image/png" }] : []),
    ...chartLink,
    ...eventPackLink,
  ], structuredContent: JSON.parse(text) };
}

export function createResearchMcpServer(user: ResearchPrincipal) {
  const server = new McpServer({ name: "gekkotech-research", version: "1.2.0" });
  const descriptors: Record<string, unknown>[] = [];

  function register<S extends z.ZodObject>(name: string, description: string, schema: S, feature: ResearchFeature | undefined,
    prepare: (input: z.output<S>) => { cost: number; run: () => Promise<Record<string, unknown> & { image?: Buffer }> },
    scope: ResearchScope = researchScope) {
    if (feature && !user.enabledFeatures.includes(feature)) return;
    const write = scope === personalWriteScope;
    const annotations = { readOnlyHint: !write, destructiveHint: false, idempotentHint: write, openWorldHint: false };
    const requiredScopes = scope === researchScope ? [researchScope] : [researchScope, scope];
    const securitySchemes = [{ type: "oauth2", scopes: requiredScopes }];
    const meta = { securitySchemes };
    descriptors.push({ name, description, inputSchema: z.toJSONSchema(schema, { io: "input" }), annotations, securitySchemes, _meta: meta });
    server.registerTool(name, { description, inputSchema: schema as z.ZodObject, annotations, _meta: meta }, async (args: Record<string, unknown>) => {
      if (!user.scopes.includes(scope)) {
        return {
          ...result({ success: false, error: { code: "insufficient_scope", message: "请在 AI 客户端连接设置中授权此权限" } }, true),
          _meta: { "mcp/www_authenticate": [researchScopeChallenge(scope)] },
        };
      }
      try {
        const input = schema.parse(args);
        const job = prepare(input);
        const { image, ...payload } = await withResearchBudget(user.id, job.cost, job.run);
        return result(payload, false, image);
      } catch (error) {
        if (error instanceof ResearchBudgetError) {
          return result({ success: false, error: { code: error.code, message: error.message, ...error.details } }, true);
        }
        if (error instanceof MarketError || error instanceof WatchlistStoreError || error instanceof TemplateStoreError) {
          return result({ success: false, error: { code: error.code, message: error.message } }, true);
        }
        if (error instanceof StockDataRequestError || error instanceof z.ZodError) {
          const code = "INVALID_INPUT";
          const message = error instanceof z.ZodError ? "工具参数无效，请核对日期和查询范围" : error.message;
          return result({ success: false, error: { code, message } }, true);
        }
        console.error("[research-mcp] tool failed", name, error);
        return result({ success: false, error: { code: "INTERNAL_ERROR", message: "查询暂时不可用" } }, true);
      }
    });
  }

  register("get_usage", "查看当前账号的 AI 查询积分、重置时间和限流。", z.object({}).strict(), undefined,
    () => ({ cost: 0, run: () => getResearchUsage(user.id) }));

  register("search_market_indicators", "搜索宏观指标。返回查询所需的指标 ID、频率、单位和覆盖范围。", searchIndicatorsSchema, "macro",
    input => ({ cost: 1, run: async () => {
      const data = await searchMarketIndicators({ ...input, limit: Math.min(input.limit, 10) });
      return { truncated: data.truncated, indicators: data.indicators.map(i => ({
          ...publicMacro(i), basis: i.basis, availableFrom: i.availableFrom, availableTo: i.availableTo, observations: i.observations,
      })) };
    } }));

  register("query_macro_data", "按指标 ID 查询原生频率的宏观时间序列。可指定历史可见截止时间；按 nextCursor 翻页。", queryMarketSchema, "macro",
    input => ({
      cost: 1 + input.indicatorIds.length * (1 + Math.ceil((Date.parse(input.endDate) - Date.parse(input.startDate)) / (5 * 365 * 86_400_000)) + Number(Boolean(input.dataCutoff))),
      run: async () => {
        const data = await queryMarketData(input);
        return { ...data, series: data.series.map(s => ({ ...s, indicator: publicMacro(s.indicator) })) };
      },
    }));

  register("calculate_macro_series", "计算价差、比值、变化、均值、同比环比、分位数和相关性。按同日对齐并检查单位与口径。", calculateMarketSchema, "macro",
    input => ({
      cost: 4 + Number(Boolean(input.rightIndicatorId)) + Math.ceil(Math.max(0, Date.parse(input.endDate) - Date.parse(input.startDate)) / (5 * 365 * 86_400_000)),
      run: async () => {
        const data = await calculateMarketSeries(input);
        return { ...data, inputs: data.inputs.map(i => ({ ...publicMacro(i), revisionFingerprint: i.revisionFingerprint })) };
      },
    }));

  register("search_system_charts", "搜索系统图表并返回站内查看链接。", searchChartsSchema, "macro",
    input => ({ cost: 1, run: async () => {
      const data = await searchCharts(input, { includeIndicatorCoverage: false });
      return { truncated: data.truncated, charts: data.charts.map(c => ({
        chartId: c.chartId, title: c.title, chartType: c.chartType, supportsData: c.supportsData,
        websiteUrl: c.supportsInteraction ? c.previewUrl : absoluteUrl("/macro"),
      })) };
    } }));

  register("get_system_chart_data", "按 search_system_charts 返回的图表 ID，读取站内系统宏观图表的变换后序列、单位、日期和来源。仅支持目录中 supportsData 的图表。", getChartSchema.extend({
    startDate: day, endDate: day, dataCutoff: z.string().datetime({ offset: true }).optional(),
  }), "macro", input => {
    const days = (Date.parse(input.endDate) - Date.parse(input.startDate)) / 86_400_000;
    if (days < 0 || days > 30 * 366 || (input.dataCutoff && Date.parse(input.dataCutoff) > Date.now())) {
      throw new MarketError("INVALID_INPUT", "图表日期区间须按升序且不超过 30 年，可见截止时间不能在未来");
    }
    return { cost: 5 + Math.ceil(days / 366) + Number(Boolean(input.dataCutoff)), run: async () => {
      const chart = await getChart({ chartId: input.chartId });
      const data = await renderChartData(chart, input.startDate, input.endDate, input.dataCutoff, { includeYearOverYearLookback: true });
      return {
        chartId: data.chartId, title: data.title, dates: data.categories, series: data.series.map(({ name, unit, data }) => ({ name, unit, values: data })),
        sources: data.sources.map(publicMacro), revisionFingerprints: data.revisionFingerprints,
        dataCutoff: data.dataCutoff, displayedStartDate: data.displayStartDate, displayedEndDate: data.displayEndDate,
        lastUpdatedAt: data.lastUpdatedAt, retrievedAt: data.retrievedAt,
        coverageNote: "同比计算会读取所需的上年数据。不同序列按实际日期对齐，缺口按图表既有配置处理。",
        websiteUrl: absoluteUrl(chart.page),
      };
    } };
  });

  register("search_securities", "从站内证券目录按美股代码或公司名称搜索。", search, "equity-stock-data",
    input => ({ cost: 1, run: async () => {
      const rows = await prisma.equitySecurity.findMany({
        where: { OR: [{ symbol: { startsWith: input.query.toUpperCase() } }, { name: { contains: input.query, mode: "insensitive" } }] },
        orderBy: { symbol: "asc" }, take: input.limit + 1,
        select: { symbol: true, name: true, gicsSector: true, gicsIndustry: true },
      });
      return { truncated: rows.length > input.limit, securities: rows.slice(0, input.limit) };
    } }));

  register("search_stock_indicators", "查找股票数据指标 ID、单位和适用参数，例如营收、ROE、TTM 市盈率或 RSI。", search, "equity-stock-data",
    input => ({ cost: 1, run: async () => {
      const found = filterIndicators(INDICATORS, input.query).filter(d => supportedStockIndicator(d.id));
      return { truncated: found.length > input.limit, indicators: found.slice(0, input.limit).map(d => {
        const { id, label, path, unit, params } = d;
        return { id, label, path, unit, params };
      }) };
    } }));

  register("query_stock_data", "查询最多 10 只股票、20 列指标。财报按公司财年选择；估值和收益可指定截止日或区间。缺失时返回状态。", stockQuery, "equity-stock-data",
    input => {
      const { symbols, columns, cost } = prepareStockQuery(input);
      return { cost, run: async () => {
        const data = await queryStockData(symbols, columns, [], { dbOnly: true });
        return {
          rows: data.rows, generatedAt: data.generatedAt, unavailableSymbols: data.ignored,
          columns: columns.map(({ key, indicatorId, params }) => {
            const def = getIndicator(indicatorId)!;
            return { key, indicatorId, label: def.label, unit: def.unit, params };
          }),
          websiteUrl: absoluteUrl("/equity/data"),
          valueNote: "pct 使用比例值，0.15 代表 15%；金额与股数使用未缩放原值。",
          historicalNote: "指定财报期返回站内已知值，可能包含后续修订。历史估值按已有披露日期过滤，不能保证完整的历史版本。",
        };
      } };
    });

  register("query_stock_quarterly_financials", "按实际财季末日期范围一次读取一只美股多项单季财务报表指标。包含财季末和缺失状态。", quarterlyFinancialsInput, "equity-stock-data",
    prepareQuarterlyFinancials);
  if (user.enabledFeatures.includes("macro")) {
    register("compare_stock_macro_quarters", "将原生周频或月频宏观指标对齐到公司实际财季，返回同比或水平、宏观领先期、配对数和相关系数。", fiscalAlignmentInput, "equity-stock-data",
      prepareFiscalAlignment);
  }
  register("get_stock_disclosures", "查看一只美股近期公告及最新财报申报。返回可用于查询归档的公告编号和附件名称。", stockEvidence, "markets",
    ({ symbol }) => ({ cost: 2, run: () => getStockDisclosures(symbol) }));
  register("get_stock_disclosure_archive", "按证券、公告编号和附件名称读取站内归档的公告文字。使用 nextOffset 翻页；缺少归档时明确返回状态。", disclosureArchiveInput, "markets",
    input => ({ cost: 2, run: () => getStockDisclosureArchive(input) }));
  register("compare_stock_peers", "自动查找一只美股的站内同业，比较最新估值、利润率和指定期间的前复权收益，并返回相对同业及 SPY 的表现。", stockPeersInput, "markets",
    prepareStockPeers);
  register("get_stock_event_returns", "按财报业绩公告、申报、8-K 或拆股事件比较后续交易日的前复权收益，返回公告来源、窗口及相对同业和 SPY 的表现。", stockEventReturnsInput, "markets",
    prepareStockEventReturns);
  register("render_stock_chart_png", "用站内行情绘制一只美股指定区间的 K 线和成交量 PNG，可叠加财报业绩公告标记。支持日、周、月和复权选择。使用返回的 imageUrl 展示原图，并将 downloadUrl 提供给用户下载。链接 24 小时内有效。", stockChartInput, "markets",
    prepareStockChart);
  register("render_stock_event_pack_chart", "把外部 AI 已查证的公开事件直接叠加到站内美股 K 线并生成 PNG 和行情页可导入的 v2 事件 JSON，用户无需操作行情页。先用客户端搜索核实事件与日期，提供原始公开来源，不确定的事件放入 skipped。工具在服务端临时预览事件包，按编号标注并返回编号对应事件及未上图原因；用 imageUrl 展示 PNG、downloadUrl 下载 PNG、eventPackDownloadUrl 下载事件包，链接 24 小时内有效。", stockEventPackChartInput, "markets",
    prepareStockEventPackChart);
  register("get_stock_guidance", "读取近期公司已披露的管理层指引、目标报告期、口径和原文证据。", stockEvidence, "markets",
    ({ symbol }) => ({ cost: 5, run: () => getStockGuidance(symbol) }));
  register("get_stock_insider_filings", "获取一只股票的近期 Form 4 内部人申报引用。", insiderFilingInput, "equity-ownership",
    ({ symbol, limit }) => ({ cost: 2, run: () => getStockInsiderFilings(symbol, limit) }));
  register("get_stock_ownership_monitor", "读取一只美股已核实的内部人买卖和近 90 日净卖出统计；section=plans 可分页读取已核实的 10b5-1 计划。", ownershipMonitorInput, "equity-ownership",
    prepareOwnershipMonitor);

  register("compare_industries", "比较最多三个美股板块 ETF 的成分财务汇总。返回现金流、利润、增速和样本覆盖率；可选当前成分或历史持仓。", industryComparison, "equity-industries",
    input => ({ cost: 4 + new Set(input.etfs).size * (input.membership === "historical" ? 14 : 8), run: () => compareIndustries(input) }));

  register("list_screener_factors", "列出选股可用因子、板块和默认排序方向。", z.object({}).strict(), "quant-screener",
    () => ({ cost: 1, run: async () => listScreenerFactors() }));
  register("screen_stocks", "在一个已入库的美股因子截面上筛选。最多 5 个条件、1 个排序因子和 30 条结果。", screenStocks, "quant-screener",
    prepareScreener);
  register("get_macro_regime", "读取站内当前增长与通胀环境和市场定价摘要；提供起止日期时读取已保存的月度环境记录。", regimeInput, "quant-regime",
    prepareRegime);
  register("get_factor_research_summary", "使用站内历史截面研究最多 4 个因子的 IC、分层收益、IC 衰减、宏观环境分组和因子相关性。", factorResearchInput, "quant-factor-research",
    prepareFactorResearch);

  const reportKinds = (Object.keys(quantReportFeatures) as QuantReportKind[])
    .filter(kind => user.enabledFeatures.includes(quantReportFeatures[kind]));
  if (reportKinds.length) {
    const kind = z.enum(reportKinds);
    register("list_my_quant_reports", "分页列出你自己已完成的回测或稳健性报告，返回报告 ID。", z.object({ kind, ...quantReportPage }).strict(), undefined,
      input => ({ cost: 1, run: () => listMyQuantReports(user.id, input.kind, input.offset, input.limit) }), workspaceReadScope);
    register("get_my_quant_report", "读取你自己已完成的量化报告。回测支持净值及调仓时的宏观状态；稳健性报告支持参数扫描或分段详情及已保存的净值。", z.object({
      kind, id: z.uuid(), section: quantReportSection.default("summary"), ...quantReportPage,
    }).strict(), undefined, input => {
      validateQuantReportSection(input.kind, input.section);
      return { cost: 2, run: () => getMyQuantReport(user.id, input.kind, input.id, input.section, input.offset, input.limit) };
    }, workspaceReadScope);
  }

  const contentKinds = (Object.keys(contentFeatures) as ResearchContent[])
    .filter(kind => user.enabledFeatures.includes(contentFeatures[kind]));
  if (contentKinds.length) {
    const kind = z.enum(contentKinds);
    const contentSearch = search.extend({ kind, offset: z.number().int().min(0).max(100).default(0) });
    const contentGet = z.object({ kind, id: z.string().min(1).max(120), offset: z.number().int().min(0).max(1_000_000).default(0) }).strict();
    register("search_research", "按类型检索已发布专题文章、周报或公开市场事件，返回可供读取的 ID。", contentSearch, undefined,
      input => ({ cost: 2, run: () => searchResearchContent(input.kind, input.query, input.limit, input.offset) }));
    register("get_research", "按搜索返回的类型和 ID 读取正文或事件内容。按 nextOffset 翻页。", contentGet, undefined,
      input => ({ cost: 2, run: () => getResearchContent(input.kind, input.id, input.offset) }));
  }

  const forecasts = (Object.keys(forecastFeatures) as (keyof typeof forecastFeatures)[])
    .filter(key => user.enabledFeatures.includes(forecastFeatures[key]));
  if (forecasts.length) {
    const forecastInput = z.object({ forecast: z.enum(forecasts) }).strict();
    register("get_forecast_summary", "读取已开放的美国宏观预测摘要，包括目标期、预测值、区间和数据日期。", forecastInput, undefined,
      ({ forecast }) => ({ cost: 6, run: () => getForecastSummary(forecast) }));
  }

  register("get_my_watchlist", "分页读取你自己的自选股和分组，供后续股票数据查询。", watchlistLookup, "markets",
    input => ({ cost: 1, run: () => getMyWatchlist(user.id, input.groupId, input.offset, input.limit) }), personalReadScope);
  register("list_my_stock_templates", "列出你自己保存的股票数据模板。", z.object({}).strict(), "equity-stock-data",
    () => ({ cost: 1, run: () => listMyTemplates(user.id) }), personalReadScope);
  register("get_my_stock_template", "读取自己的股票数据模板、股票列表和可用于取数的列参数。", z.object({ id: z.string().min(1).max(64) }).strict(), "equity-stock-data",
    ({ id }) => ({ cost: 1, run: () => getMyTemplate(user.id, id) }), personalReadScope);
  register("get_my_macro_templates", "列出你自己的宏观模板；提供模板 ID 时返回图表分组、指标和计算配置。", z.object({
    id: z.string().min(1).max(128).optional(),
  }).strict(), "macro", ({ id }) => ({ cost: 1, run: () => getMyMacroTemplates(user.id, id) }), workspaceReadScope);
  register("get_my_screener_strategies", "分页列出你自己已保存的选股策略；提供策略 ID 时返回该策略的筛选条件和排序配置。", z.object({
    id: z.uuid().optional(), ...quantReportPage,
  }).strict(), "quant-screener", input => ({ cost: 1, run: () => getMyScreenerStrategies(user.id, input) }), workspaceReadScope);

  register("add_to_my_watchlist", "仅在用户明确要求时，将最多 10 只站内美股加入其自选分组。已有标的保留原分组。", watchlistWrite, "markets",
    input => ({ cost: 2, run: () => addMyWatchlistStocks(user.id, input.symbols, input.groupId) }), personalWriteScope);
  register("save_my_stock_template", "仅在用户明确要求时另存新的股票数据模板。同名内容冲突时须换名。", templateWrite, "equity-stock-data",
    input => {
      if (input.symbols?.length && parseSymbols(input.symbols).ignored.length) {
        throw new StockDataRequestError("股票代码格式不正确");
      }
      const template = parseTemplateInput({ ...input, columns: input.columns.map((column, i) => ({ ...column, key: `c${i + 1}` })) });
      return { cost: 2, run: async () => {
        const { created, template: saved } = await saveStockDataTemplate(user.id, template, "create-only");
        return { created, template: saved, websiteUrl: stockDataUrl() };
      } };
    }, personalWriteScope);

  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: descriptors }));
  return server;
}
