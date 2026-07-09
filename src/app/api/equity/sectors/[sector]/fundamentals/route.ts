import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { resolveSectorParam } from "@/lib/equity/equitySecurities";
import { aggregateSectorFundamentals } from "@/lib/equity/fundamentalsAgg";

type Ctx = { params: Promise<{ sector: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { sector: raw } = await ctx.params;
    const sector = resolveSectorParam(raw);
    if (!sector) {
      return NextResponse.json({ error: "未知行业" }, { status: 404 });
    }
    const agg = await aggregateSectorFundamentals(sector);
    return NextResponse.json(agg);
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
