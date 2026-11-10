import { NextRequest, NextResponse } from "next/server";
import { proErrorResponse, requireProUser } from "@/lib/auth/requirePro";
import { requireSameOrigin, sameOriginErrorResponse } from "@/lib/http/sameOrigin";
import { parseColumns, parseSymbols, StockDataRequestError } from "@/lib/equity/stockData/request";
import { queryStockData } from "@/lib/equity/stockData/query";

const headers = { "Cache-Control": "private, no-store" };

/** POST /api/equity/stock-data/query  { symbols: string[], columns: ColumnSpec[] }（Pro 专属） */
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
  } catch (e) {
    const err = sameOriginErrorResponse(e);
    return NextResponse.json({ error: err?.error ?? "请求来源不正确" }, { status: err?.status ?? 403, headers });
  }
  try {
    await requireProUser(req);
  } catch (e) {
    const { body, status } = proErrorResponse(e);
    return NextResponse.json(body, { status, headers });
  }
  let body: { symbols?: unknown; columns?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400, headers });
  }
  try {
    const { symbols, ignored } = parseSymbols(body?.symbols);
    const columns = parseColumns(body?.columns);
    const result = symbols.length
      ? await queryStockData(symbols, columns, ignored)
      : { rows: [], ignored, generatedAt: new Date().toISOString() };
    return NextResponse.json(result, { headers });
  } catch (e) {
    if (e instanceof StockDataRequestError) return NextResponse.json({ error: e.message }, { status: 400, headers });
    console.error("[stock-data] query failed", e);
    return NextResponse.json({ error: "取数失败，请稍后重试" }, { status: 500, headers });
  }
}
