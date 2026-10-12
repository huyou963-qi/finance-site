import { NextRequest, NextResponse } from "next/server";
import { parseWatchlistSymbol } from "@/lib/data/marketWatchlist";
import { fetchMarketQuote } from "@/lib/data/marketQuoteProvider";
import type { MarketQuote } from "@/lib/data/marketQuote";

export async function GET(req: NextRequest) {
  let symbols: string[];
  try {
    const raw = req.nextUrl.searchParams.get("symbols") ?? "";
    if (!raw || raw.length > 2000) throw new Error("请提供标的代码");
    symbols = [...new Set(raw.split(",").map(parseWatchlistSymbol))];
    if (symbols.length > 30) throw new Error("一次最多查询 30 个标的");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "标的代码无效" }, { status: 400 });
  }
  const quotes: Record<string, MarketQuote | null> = {};
  let cursor = 0;
  // 限制上游并发；单个标的失败不阻断其他行情。
  await Promise.all(Array.from({ length: Math.min(4, symbols.length) }, async () => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor++]!;
      try { quotes[symbol] = await fetchMarketQuote(symbol); }
      catch { quotes[symbol] = null; }
    }
  }));
  return NextResponse.json({ quotes }, { headers: { "Cache-Control": "no-store" } });
}
