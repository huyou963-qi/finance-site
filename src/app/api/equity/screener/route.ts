import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import type { ScreenerConfig } from "@/lib/quant/screener";
import { listFactorDates, runScreenerQuery } from "@/lib/quant/screenerData";

/** 截面元信息：可选期列表（与 equity 读 API 一致，公开） */
export async function GET(_req: NextRequest) {
  try {
    const dates = await listFactorDates();
    return NextResponse.json({
      dates,
      latest: dates.length ? dates[dates.length - 1] : null,
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}

/** 执行选股查询；body = ScreenerConfig（校验在引擎内） */
export async function POST(req: NextRequest) {
  try {
    const config = (await req.json()) as ScreenerConfig;
    const result = await runScreenerQuery(config);
    return NextResponse.json(result);
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
