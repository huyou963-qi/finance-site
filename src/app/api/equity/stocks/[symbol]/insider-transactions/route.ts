import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { loadStockContext } from "@/lib/equity/stockDetail";
import { loadInsiderTransactions } from "@/lib/equity/insiderTransactions";

type Ctx = { params: Promise<{ symbol: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { symbol: symbolRaw } = await ctx.params;
    const stock = await loadStockContext(symbolRaw);
    if (!stock) {
      return NextResponse.json({ error: "未知标的" }, { status: 404 });
    }

    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;

    const result = await loadInsiderTransactions(stock.symbol, { limit });

    return NextResponse.json({ symbol: stock.symbol, ...result });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
