import { NextRequest, NextResponse } from "next/server";
import { resolveChartSymbolProfile } from "@/lib/data/assetEventResolver";
import { deriveEventFilterDraft } from "@/lib/data/chartSymbolProfile";

/** GET /api/events/symbol-profile?symbol=AAPL — 标的画像 + 默认筛选草稿 */
export async function GET(req: NextRequest) {
  try {
    const symbol = req.nextUrl.searchParams.get("symbol")?.trim();
    if (!symbol) {
      return NextResponse.json({ error: "缺少 symbol" }, { status: 400 });
    }
    const profile = await resolveChartSymbolProfile(symbol);
    const draft = deriveEventFilterDraft(profile);
    return NextResponse.json({ profile, draft });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
