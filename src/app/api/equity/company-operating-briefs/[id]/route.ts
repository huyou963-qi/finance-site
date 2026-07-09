import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { getCompanyOperatingBrief } from "@/lib/equity/companyOperatingBriefs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const row = await getCompanyOperatingBrief(id);
    if (!row) {
      return NextResponse.json({ error: "不存在" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
