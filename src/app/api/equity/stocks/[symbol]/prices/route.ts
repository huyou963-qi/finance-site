import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { getAdjustedDailyBars } from "@/lib/equity/equityPriceStore";
import { parsePriceAdjustmentMode } from "@/lib/equity/priceAdjustment";
import { utcSecToDate } from "@/lib/equity/sectorReturns";
import { loadStockContext } from "@/lib/equity/stockDetail";

type Ctx = { params: Promise<{ symbol: string }> };

const MAX_DAYS = 20000; // 不设实际上限，全历史可取

/** GET /api/equity/stocks/AAPL/prices?days=320&adjust=forward|backward|none */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { symbol: symbolRaw } = await ctx.params;
    const stock = await loadStockContext(symbolRaw);
    if (!stock) {
      return NextResponse.json({ error: "未知标的" }, { status: 404 });
    }

    const daysRaw = Number(req.nextUrl.searchParams.get("days") ?? 320);
    const days = Math.min(Math.max(Number.isFinite(daysRaw) ? daysRaw : 320, 30), MAX_DAYS);
    const mode = parsePriceAdjustmentMode(req.nextUrl.searchParams.get("adjust"));

    const { bars, source, found } = await getAdjustedDailyBars(stock.symbol, {
      mode,
      limit: days,
    });
    if (!found) {
      return NextResponse.json({ error: "无行情数据" }, { status: 404 });
    }

    return NextResponse.json({
      symbol: stock.symbol,
      adjust: mode,
      bars: bars.map((b) => ({
        date: utcSecToDate(b.time),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      })),
      priceSource: source,
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
