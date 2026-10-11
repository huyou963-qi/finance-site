import { NextRequest, NextResponse } from "next/server";
import { searchUsEquitySymbols } from "@/lib/equity/usEquitySearch";
import { symbolSearchErrorForUser } from "@/lib/data/symbolSearchUserMessage";
import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";
import { searchEastmoneySymbols } from "@/lib/data/eastmoneySearch";

export type { SymbolSearchItem };

/**
 * GET /api/data/symbol-search?q=aapl
 * 美股/商品本地目录 + 东方财富沪深京港联想；代码保留交易所后缀避免歧义。
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) {
    return NextResponse.json({ results: [] as SymbolSearchItem[] });
  }

  try {
    const regionalFirst = /[\u3400-\u9fff]/.test(q) || /^\d|^(SH|SZ|BJ|HK)\d/i.test(q);
    const [us, regional] = await Promise.allSettled([searchUsEquitySymbols(q, 20, !regionalFirst), searchEastmoneySymbols(q, 20)]);
    if (us.status === "rejected" && regional.status === "rejected") throw new Error("搜索暂不可用，可直接输入完整代码");
    const usItems = us.status === "fulfilled" ? us.value : [];
    const regionalItems = regional.status === "fulfilled" ? regional.value : [];
    const goldItems = /黄金|伦敦金|gold|xau/i.test(q) ? usItems.filter(item => item.symbol === "XAUUSD") : [];
    const ordered = [...goldItems, ...(regionalFirst ? [...regionalItems, ...usItems] : [...usItems, ...regionalItems])];
    const results = [...new Map(ordered.map(item => [item.symbol, item])).values()].slice(0, 20);
    return NextResponse.json({ results });
  } catch (e) {
    const hint = e instanceof Error ? e.message : String(e ?? "搜索失败");
    return NextResponse.json(
      { error: symbolSearchErrorForUser(hint), results: [] as SymbolSearchItem[] },
      { status: 502 },
    );
  }
}
