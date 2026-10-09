import type { SymbolSearchItem } from "./symbolSearchTypes";
import { normalizeTickerSymbol } from "./tickerSymbolNormalize";

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
