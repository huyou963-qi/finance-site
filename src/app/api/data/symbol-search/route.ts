import { NextRequest, NextResponse } from "next/server";
import { searchUsEquitySymbols } from "@/lib/equity/usEquitySearch";
import { symbolSearchErrorForUser } from "@/lib/data/symbolSearchUserMessage";
import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";

export type { SymbolSearchItem };

/**
 * GET /api/data/symbol-search?q=aapl
 * 全美股联想：SEC company_tickers（免密钥）+ 常用 ETF 兜底。
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) {
    return NextResponse.json({ results: [] as SymbolSearchItem[] });
  }

  try {
    const results = await searchUsEquitySymbols(q, 20);
    return NextResponse.json({ results });
  } catch (e) {
    const hint = e instanceof Error ? e.message : String(e ?? "搜索失败");
    return NextResponse.json(
      { error: symbolSearchErrorForUser(hint), results: [] as SymbolSearchItem[] },
      { status: 502 },
    );
  }
}
