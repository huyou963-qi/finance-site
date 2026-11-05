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
    // 不向客户端返回 attribution：商业站不暴露上游数据商与接口细节
    return NextResponse.json({
      symbol: payload.symbol,
      timeline: payload.timeline,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    console.error(`[forward-pe] ${symbol}: ${message}`);
    const empty =
      message.includes("未返回") ||
      message.includes("无效") ||
      message.includes("空");
    return NextResponse.json(
      { error: empty ? "无 Forward EPS" : "Forward PE 暂时无法计算" },
      { status: empty ? 404 : 502 },
    );
  }
}
