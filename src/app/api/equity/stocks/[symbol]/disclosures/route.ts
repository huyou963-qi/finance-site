import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { loadStockContext } from "@/lib/equity/stockDetail";
import { loadStockDisclosures } from "@/lib/equity/stockDisclosures";

export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  try {
    const { symbol } = await ctx.params;
    const stock = await loadStockContext(symbol);
    if (!stock) return NextResponse.json({ error: "未知标的" }, { status: 404 });
    return NextResponse.json(await loadStockDisclosures(stock.symbol, stock.cik), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const { msg, status } = apiErrorResponse(error);
    return NextResponse.json({ error: msg }, { status });
  }
}
