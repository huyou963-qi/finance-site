import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { loadStockContext } from "@/lib/equity/stockDetail";
import { loadStockEvents, type StockEventType } from "@/lib/equity/stockEvents";
import { loadStockDisclosureHealth } from "@/lib/equity/disclosureBatchStore";

type Ctx = { params: Promise<{ symbol: string }> };

const VALID_TYPES = new Set<StockEventType>(["earnings", "annual", "8k", "split", "insider-plan"]);

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

    const details = req.nextUrl.searchParams.get("details") === "1";
    const [events, sync] = await Promise.all([loadStockEvents(stock.symbol, {
      cik: stock.cik,
      types: types?.length ? types : null,
      limit,
      includeDisclosure: details,
    }), details ? loadStockDisclosureHealth(stock.symbol, stock.cik).catch(error => {
      console.warn("读取每日公告更新状态失败", error);
      return { state: "unknown" as const, message: "每日更新状态暂时无法读取，当前列表不能用于判断当天公告是否齐全。", batch: null };
    }) : Promise.resolve(undefined)]);

    return NextResponse.json({ symbol: stock.symbol, events, ...(details ? { sync } : {}) });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
