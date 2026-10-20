import { eastmoneySymbolFromSuggestion } from "./eastmoneySymbols";
import type { SymbolSearchItem } from "./symbolSearchTypes";

const cache = new Map<string, { at: number; items: SymbolSearchItem[] }>();

export async function searchEastmoneySymbols(query: string, limit = 20): Promise<SymbolSearchItem[]> {
  const input = query.trim().replace(/^(SH|SZ|BJ|HK)(?=\d)/i, "").replace(/\.(SH|SZ|BJ|HK)$/i, "");
  if (!input || input.length > 80) return [];
  const saved = cache.get(input);
  if (saved && Date.now() - saved.at < 300_000) return saved.items.slice(0, limit);
  const url = new URL("https://searchapi.eastmoney.com/api/suggest/get");
  url.search = new URLSearchParams({ input, type: "14", count: "20" }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(6000), cache: "no-store" });
  if (!response.ok) throw new Error("东方财富搜索暂不可用，可直接输入完整代码");
  const body = await response.json() as {
    QuotationCodeTable?: { Data?: { Code: string; QuoteID: string; Name: string; SecurityTypeName?: string }[] };
  };
  const items: SymbolSearchItem[] = [];
  for (const row of body.QuotationCodeTable?.Data ?? []) {
    const symbol = eastmoneySymbolFromSuggestion(row.Code, row.QuoteID, row.SecurityTypeName);
    if (!symbol || items.some(item => item.symbol === symbol)) continue;
    items.push({ symbol, name: row.Name, type: row.SecurityTypeName,
      exchange: symbol.endsWith(".HK") ? "香港" : symbol.endsWith(".SH") ? "上海" : symbol.endsWith(".BJ") ? "北京" : symbol === "XAUUSD" ? "现货黄金" : "深圳" });
  }
  if (cache.size >= 200) cache.delete(cache.keys().next().value!);
  cache.set(input, { at: Date.now(), items });
  return items.slice(0, limit);
}
