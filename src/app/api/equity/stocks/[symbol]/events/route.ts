import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { loadStockContext } from "@/lib/equity/stockDetail";
import { loadStockEvents, type StockEventType } from "@/lib/equity/stockEvents";

type Ctx = { params: Promise<{ symbol: string }> };

const VALID_TYPES = new Set<StockEventType>(["earnings", "annual", "8k", "split"]);

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { symbol: symbolRaw } = await ctx.params;
    const stock = await loadStockContext(symbolRaw);
    if (!stock) {
      return NextResponse.json({ error: "未知标的" }, { status: 404 });
    }

    const typesRaw = req.nextUrl.searchParams.get("types");
    const types = typesRaw
      ? (typesRaw
          .split(",")
          .map((s) => s.trim())
          .filter((s): s is StockEventType => VALID_TYPES.has(s as StockEventType)) ?? null)
      : null;
    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;

    const events = await loadStockEvents(stock.symbol, {
      cik: stock.cik,
      types: types?.length ? types : null,
      limit,
    });

    return NextResponse.json({ symbol: stock.symbol, events });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
