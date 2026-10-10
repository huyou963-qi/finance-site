import type { SymbolSearchItem } from "./symbolSearchTypes";
import { normalizeTickerSymbol } from "./tickerSymbolNormalize";

export type WatchlistStock = SymbolSearchItem & { groupId?: string | null };
export type WatchlistGroup = { id: string; name: string };
export type WatchlistData = { stocks: WatchlistStock[]; groups: WatchlistGroup[] };
export type WatchlistGroupChange = { action: "createGroup" | "renameGroup" | "deleteGroup" | "moveStock"; groupId?: string | null; name?: string; symbol?: string };

export function applyWatchlistGroupChange(state: WatchlistData, change: WatchlistGroupChange): WatchlistData {
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
    return { groups: state.groups.filter((item) => item.id !== groupId), stocks: state.stocks.map((stock) => stock.groupId === groupId ? { ...stock, groupId: null } : stock) };
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
