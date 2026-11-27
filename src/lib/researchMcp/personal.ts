import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { MarketError } from "@/lib/market/schema";
import { addMarketWatchlistItems, listMarketWatchlist } from "@/lib/data/marketWatchlistStore";
import { normalizeUsTicker } from "@/lib/equity/stockData/request";
import { listStockDataTemplates, getStockDataTemplate } from "@/lib/equity/stockData/templateStore";
import { loadMacroChartPrefsForUser } from "@/lib/data/macroChartPrefs";
import { toStrategyRow } from "@/lib/quant/screenerStrategies";

const marketsUrl = () => absoluteUrl("/markets");
export const stockDataUrl = () => absoluteUrl("/equity/data");

export async function getMyWatchlist(userId: string, groupId: string | null | undefined, offset: number, limit: number) {
  const { stocks, groups, tabOrder } = await listMarketWatchlist(userId, 2000);
  if (groupId && !groups.some(group => group.id === groupId)) throw new MarketError("GROUP_NOT_FOUND", "未找到你自己的自选分组");
  const filtered = groupId === undefined ? stocks : stocks.filter(stock => stock.groupId === groupId);
  const next = offset + limit;
  const groupById = new Map(groups.map(group => [group.id, group]));
  return {
    stocks: filtered.slice(offset, next),
    groups: tabOrder.flatMap(id => {
      const group = groupById.get(id);
      return group ? [group] : [];
    }).slice(0, 100),
    groupsTruncated: groups.length > 100,
    nextOffset: next < filtered.length ? next : null, total: filtered.length, websiteUrl: marketsUrl(),
  };
}

export async function addMyWatchlistStocks(userId: string, symbols: string[], groupId: string | null) {
  const normalized = [...new Set(symbols.map(symbol => normalizeUsTicker(symbol)))];
  if (normalized.some(symbol => !symbol)) throw new MarketError("INVALID_INPUT", "请提供有效的美股代码");
  const aliases = (symbol: string) => [symbol, symbol.replace("-", ".")];
  const rows = await prisma.equitySecurity.findMany({
    where: { symbol: { in: (normalized as string[]).flatMap(aliases) } },
    select: { symbol: true, name: true },
  });
  const bySymbol = new Map(rows.map(row => [row.symbol, row]));
  const missing: string[] = [];
  const stocks = (normalized as string[]).flatMap(symbol => {
    const row = aliases(symbol).map(key => bySymbol.get(key)).find(Boolean);
    if (!row) { missing.push(symbol); return []; }
    return [{ symbol: row.symbol, name: row.name.slice(0, 200), exchange: "" }];
  });
  if (missing.length) throw new MarketError("NOT_FOUND", `站内未找到 ${missing.join("、")}，请先使用证券搜索`);
  return { results: await addMarketWatchlistItems(userId, stocks, groupId), groupId, websiteUrl: marketsUrl() };
}

export async function listMyTemplates(userId: string) {
  const templates = await listStockDataTemplates(userId);
  return {
    templates: templates.map(t => ({ id: t.id, name: t.name, columnCount: t.columns.length,
      symbolCount: t.symbols?.length ?? 0, updatedAt: t.updatedAt })),
    websiteUrl: stockDataUrl(),
  };
}

export async function getMyTemplate(userId: string, id: string) {
  const template = await getStockDataTemplate(userId, id);
  if (!template) throw new MarketError("NOT_FOUND", "未找到你自己的股票数据模板");
  const queryColumns = template.columns.filter(c => c.indicatorId !== "sec.exchange").map(c => {
    const { scale: _scale, ...queryParams } = c.params;
    return { indicatorId: c.indicatorId, params: queryParams };
  });
  return { template, queryColumns, websiteUrl: stockDataUrl() };
}

export async function getMyMacroTemplates(userId: string, id?: string) {
  const prefs = await loadMacroChartPrefsForUser(userId);
  const templates = (prefs?.templates ?? []).filter(template => !template.builtIn);
  const websiteUrl = absoluteUrl("/macro");
  if (!id) {
    return {
      templates: templates.map(template => ({
        id: template.id, name: template.name, folderId: template.folderId ?? null,
        chartCount: template.layoutMode, indicatorCount: template.selectedKeys.length,
      })),
      folders: prefs?.templateFolders?.filter(folder => folder.scope === "user").map(({ id, name }) => ({ id, name })) ?? [],
      websiteUrl,
    };
  }
  const template = templates.find(item => item.id === id);
  if (!template) throw new MarketError("NOT_FOUND", "未找到属于你的宏观模板");
  const allKeys = [...new Set([...template.selectedKeys, ...(template.derivedCalcs ?? []).map(calc => `calc:${calc.id}`)])];
  const keys = allKeys.slice(0, 100);
  const derived = (template.derivedCalcs ?? []).filter(calc => keys.includes(`calc:${calc.id}`));
  const inputs = [...new Set([...keys, ...derived.flatMap(calc => [calc.leftKey, calc.rightKey])])];
  const directIds = inputs.map(key => key.split("::")[0]!).filter(key => /^(fred:|mds:)/.test(key));
  return {
    template: {
      id: template.id, name: template.name, description: template.description?.slice(0, 1500) ?? null,
      charts: Array.from({ length: template.layoutMode }, (_, slot) => ({
        slot, title: template.displayConfig?.slotTitles?.[slot] ?? null,
        indicatorKeys: keys.filter(key => template.slotAssignment[key] === slot),
      })),
      seriesTransforms: Object.fromEntries(Object.entries(template.seriesCalcConfigMap ?? {}).filter(([key]) => inputs.includes(key))),
      derivedSeries: derived,
    },
    truncated: allKeys.length > keys.length,
    queryMacroIndicatorIds: [...new Set(directIds)],
    websiteUrl,
  };
}

export async function getMyScreenerStrategies(userId: string, input: { id?: string; offset: number; limit: number }) {
  const websiteUrl = absoluteUrl("/quant/screener");
  if (input.id) {
    const row = await prisma.strategyDefinition.findFirst({ where: { id: input.id, userId } });
    if (!row) throw new MarketError("NOT_FOUND", "未找到属于你的选股策略");
    return { strategy: toStrategyRow(row), websiteUrl };
  }
  const { offset, limit } = input;
  const rows = await prisma.strategyDefinition.findMany({
    where: { userId }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: offset, take: limit + 1,
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });
  return {
    strategies: rows.slice(0, limit).map(row => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })),
    nextOffset: rows.length > limit ? offset + limit : null,
    websiteUrl,
  };
}
