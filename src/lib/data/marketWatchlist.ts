import type { SymbolSearchItem } from "./symbolSearchTypes";
import { normalizeTickerSymbol } from "./tickerSymbolNormalize";

export type WatchlistStock = SymbolSearchItem & { groupId?: string | null };
export type WatchlistGroup = { id: string; name: string };
export type WatchlistData = { stocks: WatchlistStock[]; groups: WatchlistGroup[]; tabOrder?: string[] };
export type WatchlistGroupChange = { action: "createGroup" | "renameGroup" | "deleteGroup" | "moveStock" | "reorderGroups"; groupId?: string | null; name?: string; symbol?: string; order?: string[] };

export function orderWatchlistStocks(stocks: WatchlistStock[], order: unknown): WatchlistStock[] {
  const remaining = new Map(stocks.map(stock => [stock.symbol, stock]));
  const result: WatchlistStock[] = [];
  for (const symbol of Array.isArray(order) ? order : []) {
    const stock = remaining.get(symbol);
    if (stock) { result.push(stock); remaining.delete(symbol); }
  }
  return [...result, ...remaining.values()];
}

export function validateWatchlistStockOrder(stocks: Pick<WatchlistStock, "symbol">[], order: unknown): string[] {
  const symbols = new Set(stocks.map(stock => stock.symbol));
  if (!Array.isArray(order) || order.length !== symbols.size || new Set(order).size !== symbols.size || order.some(symbol => typeof symbol !== "string" || !symbols.has(symbol))) throw new Error("自选股顺序无效或列表已变化，请重新加载");
  return order;
}

/** 分组内排序仅替换这些股票的原有槽位，其他分组的位置保持不变。 */
export function mergeVisibleStockOrder(stocks: WatchlistStock[], visibleOrder: string[]): string[] {
  const selected = new Set(visibleOrder);
  let cursor = 0;
  const order = stocks.map(stock => selected.has(stock.symbol) ? visibleOrder[cursor++]! : stock.symbol);
  return validateWatchlistStockOrder(stocks, order);
}

export function normalizeWatchlistTabOrder(groups: WatchlistGroup[], order: unknown): string[] {
  const available = new Set(["all", "", ...groups.map((group) => group.id)]);
  const result: string[] = [];
  for (const id of Array.isArray(order) ? order : []) {
    if (typeof id === "string" && available.delete(id)) result.push(id);
  }
  return [...result, ...available];
}

export function validateWatchlistTabOrder(groups: WatchlistGroup[], order: unknown): string[] {
  const ids = normalizeWatchlistTabOrder(groups, []);
  if (!Array.isArray(order) || order.length !== ids.length || new Set(order).size !== ids.length || order.some((id) => typeof id !== "string" || !ids.includes(id))) throw new Error("分组顺序无效或分组已变化，请重新加载");
  return order;
}

export function applyWatchlistGroupChange(state: WatchlistData, change: WatchlistGroupChange): WatchlistData {
  if (change.action === "reorderGroups") return { ...state, tabOrder: validateWatchlistTabOrder(state.groups, change.order) };
  const groupId = parseWatchlistGroupId(change.groupId);
  const group = state.groups.find((item) => item.id === groupId);
  if (change.action !== "createGroup" && groupId && !group) throw new Error("分组不存在");
  if (change.action === "createGroup" || change.action === "renameGroup") {
    const name = parseWatchlistGroupName(change.name);
    if (state.groups.some((item) => item.name === name && (change.action === "createGroup" || item.id !== groupId))) throw new Error("组名已存在");
    if (!groupId || (change.action === "renameGroup" && !group)) throw new Error("不能修改默认分组");
    return { ...state, groups: change.action === "createGroup" ? [...state.groups, { id: groupId, name }] : state.groups.map((item) => item.id === groupId ? { ...item, name } : item) };
  }
  if (change.action === "deleteGroup") {
    if (!groupId) throw new Error("不能删除默认分组");
    return { ...state, groups: state.groups.filter((item) => item.id !== groupId), stocks: state.stocks.map((stock) => stock.groupId === groupId ? { ...stock, groupId: null } : stock) };
  }
  const symbol = parseWatchlistSymbol(change.symbol);
  if (!state.stocks.some((stock) => stock.symbol === symbol)) throw new Error("自选股不存在");
  return { ...state, stocks: state.stocks.map((stock) => stock.symbol === symbol ? { ...stock, groupId } : stock) };
}

export function parseWatchlistGroupName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 30) throw new Error("组名需为 1–30 个字符");
  const name = value.trim();
  if (["未分组", "全部"].includes(name)) throw new Error("请使用其他组名");
  return name;
}

export function parseWatchlistGroupId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(value)) throw new Error("分组格式不正确");
  return value;
}

export function parseWatchlistSymbol(value: unknown): string {
  if (typeof value !== "string") throw new Error("标的代码格式不正确");
  const symbol = normalizeTickerSymbol(value);
  if (!/^[A-Z0-9^][A-Z0-9.^=\-_/]{0,63}$/.test(symbol)) throw new Error("标的代码格式不正确");
  return symbol;
}

export function parseWatchlistItem(value: unknown): SymbolSearchItem {
  if (!value || typeof value !== "object") throw new Error("自选股格式不正确");
  const item = value as Record<string, unknown>;
  const symbol = parseWatchlistSymbol(item.symbol);
  if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 200 || typeof item.exchange !== "string" || item.exchange.length > 100) {
    throw new Error("标的名称或交易所格式不正确");
  }
  return { symbol, name: item.name.trim(), exchange: item.exchange.trim() };
}
