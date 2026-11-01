import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, loadFeatureAccessPolicy } from "@/lib/access/featureAccess";
import { resolveFeatureAccess } from "@/lib/access/featureCatalog";
import { GICS_SECTOR_DEFS } from "@/lib/equity/gicsCatalog";
import { industryFinancialResponse, loadIndustryFinancials } from "@/lib/equity/industryFinancialsStore";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const etf = (params.get("etf") ?? "XLK").toUpperCase();
  const quarters = Number(params.get("quarters") ?? 20);
  const membership = params.get("membership") ?? "current";
  const period = params.get("period");
  if (!GICS_SECTOR_DEFS.some(row => row.etf === etf) || ![12, 20, 40].includes(quarters) ||
      !["current", "historical"].includes(membership) || (period != null && !/^\d{4}Q[1-4]$/.test(period))) {
    return NextResponse.json({ error: "请选择有效的行业 ETF、历史区间与报告期" }, { status: 400 });
  }
  try {
    const [policy, viewer] = await Promise.all([loadFeatureAccessPolicy(), getViewerFromRequest(req)]);
    const access = resolveFeatureAccess(policy, "equity-industries", viewer);
    if (access !== "allowed") return NextResponse.json({ error: "当前账号无权访问美股行业", state: access }, { status: 403 });
    const data = await loadIndustryFinancials({ etf, quarters: quarters as 12 | 20 | 40, membership: membership as "current" | "historical" });
    const response = industryFinancialResponse(data, period);
    if (!response) return NextResponse.json({ error: "报告期不在所选历史区间内" }, { status: 400 });
    return NextResponse.json(response, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[industry-financials]", error);
    return NextResponse.json({ error: "行业财务暂时无法读取，请稍后重试" }, { status: 503 });
  }
}
