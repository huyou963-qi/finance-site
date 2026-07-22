import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { listStoredRegimes } from "@/lib/quant/macroRegime";
import { sectorPerformanceByRegime } from "@/lib/quant/regimeAnalysis";

/**
 * regime 时间序列 + 分 regime 行业表现。
 * query：?start=YYYY-MM-DD&end=YYYY-MM-DD（可选）
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const [regimes, sectorPerformance] = await Promise.all([
      listStoredRegimes({ start, end }),
      sectorPerformanceByRegime({ start, end }),
    ]);
    const current = regimes.length ? regimes[regimes.length - 1]! : null;
    return NextResponse.json({
      regimes,
      sectorPerformance,
      current,
      available: regimes.length > 0,
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
