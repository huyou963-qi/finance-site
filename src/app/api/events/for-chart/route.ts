import { NextRequest, NextResponse } from "next/server";
import { loadChartPanelEvents } from "@/lib/data/chartEventMarkers";
import type { EventListContextMode } from "@/lib/chart/eventPanelListFilters";

function parseMode(raw: string | null): EventListContextMode | undefined {
  if (raw === "chart" || raw === "range" || raw === "symbol") return raw;
  return undefined;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const symbol = sp.get("symbol")?.trim();
    if (!symbol) {
      return NextResponse.json({ error: "缺少 symbol" }, { status: 400 });
    }
    const includeSec = sp.get("includeSec");
    const includeMarket = sp.get("includeMarket");
    const result = await loadChartPanelEvents({
      symbol,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      expand: sp.get("expand") ?? undefined,
      mode: parseMode(sp.get("mode")),
      includeSec: includeSec === null ? undefined : includeSec !== "0",
      includeMarket: includeMarket === null ? undefined : includeMarket !== "0",
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
