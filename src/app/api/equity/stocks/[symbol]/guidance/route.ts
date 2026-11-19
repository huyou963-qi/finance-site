import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, loadFeatureAccessPolicy } from "@/lib/access/featureAccess";
import { resolveFeatureAccess } from "@/lib/access/featureCatalog";
import { loadStockContext } from "@/lib/equity/stockDetail";
import { loadManagementGuidance } from "@/lib/equity/managementGuidanceStore";

export async function GET(req: NextRequest, ctx: { params: Promise<{ symbol: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const [policy, viewer] = await Promise.all([loadFeatureAccessPolicy(), getViewerFromRequest(req)]);
    // The stock detail page uses the same markets gate.
    const state = resolveFeatureAccess(policy, "markets", viewer);
    if (state !== "allowed") return NextResponse.json({ error: state === "hidden" ? "功能开发中" : "当前账户暂不可访问" }, { status: state === "hidden" ? 404 : 403, headers });
    const stock = await loadStockContext((await ctx.params).symbol);
    if (!stock) return NextResponse.json({ error: "未知标的" }, { status: 404, headers });
    return NextResponse.json(await loadManagementGuidance(stock.symbol, stock.cik), { headers });
  } catch (error) {
    console.error("[management guidance]", error);
    return NextResponse.json({ error: "管理层指引暂时无法加载" }, { status: 500, headers });
  }
}
