import { NextRequest, NextResponse } from "next/server";
import { fetchBinanceSpotKlines } from "@/lib/data/binance";

/** GET /api/data/klines?symbol=BTCUSDT&interval=1d&limit=300 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "BTCUSDT";
  const interval = req.nextUrl.searchParams.get("interval") ?? "1d";
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "300");

  try {
    const payload = await fetchBinanceSpotKlines(symbol, interval, limit);
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    const clientError =
      message.includes("无效") ||
      message.includes("必须为之一") ||
      message.includes("unexpected");
    return NextResponse.json(
      { error: message },
      { status: clientError ? 400 : 502 },
    );
  }
}
