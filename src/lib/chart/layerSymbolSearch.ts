import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";

export async function searchLayerSymbols(query: string, signal?: AbortSignal): Promise<SymbolSearchItem[]> {
  const response = await fetch(`/api/data/symbol-search?q=${encodeURIComponent(query)}`, { signal: signal ?? AbortSignal.timeout(15_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "搜索暂不可用，请稍后重试");
  return data.results ?? [];
}

/** Never substitute a fuzzy match for the requested ticker. */
export async function requireExactLayerSymbols(symbols: string[]) {
  await Promise.all([...new Set(symbols)].map(async (symbol) => {
    const results = await searchLayerSymbols(symbol);
    if (!results.some((item) => item.symbol.toUpperCase() === symbol.toUpperCase())) {
      throw new Error(`未找到资产：${symbol}，请搜索并选择完整代码`);
    }
  }));
}

