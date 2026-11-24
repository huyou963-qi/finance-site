import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { MarketError } from "@/lib/market/schema";
import { addMarketWatchlistItems, listMarketWatchlist } from "@/lib/data/marketWatchlistStore";
import { normalizeUsTicker } from "@/lib/equity/stockData/request";
import { listStockDataTemplates, getStockDataTemplate } from "@/lib/equity/stockData/templateStore";

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
