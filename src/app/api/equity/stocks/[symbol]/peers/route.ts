import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { loadStockContext } from "@/lib/equity/stockDetail";
import { loadStockPeers } from "@/lib/equity/stockPeers";
export type { PeerRow } from "@/lib/equity/stockPeers";

type Ctx = { params: Promise<{ symbol: string }> };

/**
 * 同 Industry 成分逐行对比（Bloomberg RV 风格）。
 * 市值 = 最新收盘 × 最新季股本（价格 db-first，行业页已为成分落过日线），
 * 股本缺失时退回主档缓存市值。
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { symbol: symbolRaw } = await ctx.params;
    const stock = await loadStockContext(symbolRaw);
    if (!stock) {
      return NextResponse.json({ error: "未知标的" }, { status: 404 });
    }
    return NextResponse.json(await loadStockPeers(stock));
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
