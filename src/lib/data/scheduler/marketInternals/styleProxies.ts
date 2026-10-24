import { DAILY_STYLE_PROXIES } from "./catalog";
import type { DailyValues } from "./client";
import { roundPercent } from "./compute";

export type ProxyPrice = { symbol: string; date: string; adjClose: number };
/** 仅比较相邻市场交易日的总收益；停牌/缺价不跨日、不填零。 */
export function computeDailyStyleProxies(calendar: readonly string[], prices: readonly ProxyPrice[]): DailyValues[] {
  const bySymbol = new Map<string, Map<string, number>>();
  for (const row of prices) {
    if (!Number.isFinite(row.adjClose) || row.adjClose <= 0) continue;
    const values = bySymbol.get(row.symbol) ?? new Map<string, number>();
    values.set(row.date, row.adjClose);
    bySymbol.set(row.symbol, values);
  }
  return calendar.slice(1).map((date, i) => {
    const previous = calendar[i];
    const values: Record<string, number | null> = {};
    for (const row of DAILY_STYLE_PROXIES) {
      const a = bySymbol.get(row.long)?.get(date), b = bySymbol.get(row.long)?.get(previous);
      const c = bySymbol.get(row.short)?.get(date), d = bySymbol.get(row.short)?.get(previous);
      values[row.key] = a && b && c && d ? roundPercent(100 * (a / b - c / d)) : null;
    }
    return { date, values };
  });
}
