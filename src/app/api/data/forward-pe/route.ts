import { NextRequest, NextResponse } from "next/server";
import { fetchForwardEpsFromFmp } from "@/lib/data/fmpForwardPe";

/**
 * GET /api/data/forward-pe?symbol=AAPL
 * 返回 Forward EPS 时间轴，客户端与 K 线对齐算 Forward PE。
 */
export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").trim();
  if (!symbol) {
    return NextResponse.json({ error: "缺少 symbol" }, { status: 400 });
  }
  if (!/^[A-Za-z][A-Za-z0-9.-]{0,11}$/.test(symbol)) {
    return NextResponse.json(
      { error: "symbol 仅支持常见美股代码（如 AAPL）" },
      { status: 400 },
    );
  }
  try {
    const payload = await fetchForwardEpsFromFmp(symbol);
    return NextResponse.json({
      symbol: payload.symbol,
      timeline: payload.timeline,
      attribution: payload.attribution,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    const client =
      message.includes("缺少") ||
      message.includes("未返回") ||
      message.includes("无效");
    return NextResponse.json({ error: message }, { status: client ? 400 : 502 });
  }
}
