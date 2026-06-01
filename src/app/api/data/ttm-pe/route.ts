import { NextRequest, NextResponse } from "next/server";
import { buildTtmPePayload } from "@/lib/data/fmpTtmPe";

/**
 * GET /api/data/ttm-pe?symbol=AAPL
 * 返回 TTM EPS 时间轴（供客户端与 K 线对齐）及可选说明。
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
    const payload = await buildTtmPePayload(symbol);
    return NextResponse.json({
      symbol: payload.symbol,
      ttmTimeline: payload.ttmTimeline,
      quarterlyPe: payload.quarterlyPe ?? [],
      attribution: payload.attribution,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    const client =
      message.includes("缺少") ||
      message.includes("未返回") ||
      message.includes("不足");
    return NextResponse.json({ error: message }, { status: client ? 400 : 502 });
  }
}
