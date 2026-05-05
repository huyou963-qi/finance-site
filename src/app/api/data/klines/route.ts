import { NextRequest, NextResponse } from "next/server";
import { fetchBinanceSpotKlines } from "@/lib/data/binance";
import { fetchIbkrKlines } from "@/lib/data/ibkrKlines";
import { fetchMassiveKlines } from "@/lib/data/massiveKlines";
import { fetchYahooKlines } from "@/lib/data/yahooKlines";

/**
 * GET /api/data/klines?source=binance&symbol=BTCUSDT&interval=1d&limit=300
 * GET /api/data/klines?source=yahoo&symbol=AAPL&interval=1d&limit=300
 * GET /api/data/klines?source=massive&symbol=AAPL&interval=1d&limit=300  （需 MASSIVE_API_KEY）
 * GET /api/data/klines?source=ibkr&symbol=AAPL&interval=1d&limit=300  （TWS/IB Gateway 或 IBKR_BRIDGE_URL）
 */
export async function GET(req: NextRequest) {
  const source = (req.nextUrl.searchParams.get("source") ?? "binance").toLowerCase();
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "";
  const defaultSymbol = source === "binance" ? "BTCUSDT" : "AAPL";
  const sym = symbol.trim() || defaultSymbol;
  const interval = req.nextUrl.searchParams.get("interval") ?? "1d";
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "300");

  try {
    if (source === "yahoo") {
      const key = process.env.MASSIVE_API_KEY?.trim();
      if (key) {
        try {
          const payload = await fetchMassiveKlines(sym, interval, limit);
          return NextResponse.json({
            ...payload,
            attribution: `${payload.attribution ?? ""}（接口参数 source=yahoo，已优先使用 Massive）`,
          });
        } catch {
          /* 再试 Yahoo */
        }
      }
      const payload = await fetchYahooKlines(sym, interval, limit);
      return NextResponse.json(payload);
    }
    if (source === "massive") {
      const payload = await fetchMassiveKlines(sym, interval, limit);
      return NextResponse.json(payload);
    }
    if (source === "binance") {
      const payload = await fetchBinanceSpotKlines(sym, interval, limit);
      return NextResponse.json(payload);
    }
    if (source === "ibkr") {
      const payload = await fetchIbkrKlines(sym, interval, limit);
      return NextResponse.json(payload);
    }
    return NextResponse.json(
      {
        error: `未知 source：${source}（支持 binance、yahoo、massive、ibkr）`,
      },
      { status: 400 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    const clientError =
      message.includes("无效") ||
      message.includes("必须为之一") ||
      message.includes("未配置") ||
      message.includes("unexpected");
    return NextResponse.json(
      { error: message },
      { status: clientError ? 400 : 502 },
    );
  }
}
