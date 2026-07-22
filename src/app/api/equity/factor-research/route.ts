import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { FACTOR_DEFS } from "@/lib/quant/factorRegistry";
import { runFactorResearch } from "@/lib/quant/factorResearchData";

/** 因子清单（供前端多选）+ regime 是否已构建 */
export async function GET() {
  try {
    return NextResponse.json({
      factors: FACTOR_DEFS.map((d) => ({
        key: d.key,
        nameZh: d.nameZh,
        nameEn: d.nameEn,
        category: d.category,
        higherIsBetter: d.higherIsBetter,
        startYear: d.startYear,
      })),
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}

const MAX_FACTORS = 8;

/** 执行因子研究；body = { factorKeys: string[], start?, end?, quantiles? } */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      factorKeys?: unknown;
      start?: string | null;
      end?: string | null;
      quantiles?: number;
    };
    const keys = Array.isArray(body.factorKeys)
      ? body.factorKeys.filter((k): k is string => typeof k === "string")
      : [];
    if (keys.length === 0) throw new Error("至少选择一个因子");
    if (keys.length > MAX_FACTORS) throw new Error(`一次最多研究 ${MAX_FACTORS} 个因子`);
    const report = await runFactorResearch(keys, {
      start: body.start ?? null,
      end: body.end ?? null,
      quantiles: body.quantiles,
    });
    return NextResponse.json(report);
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
