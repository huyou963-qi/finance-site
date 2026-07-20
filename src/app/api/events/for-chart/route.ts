import { NextRequest, NextResponse } from "next/server";
import type { EventImportance } from "@prisma/client";
import { loadChartPanelEvents } from "@/lib/data/chartEventMarkers";

function parseCsv(param: string | null): string[] {
  if (!param?.trim()) return [];
  return param
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
    const minImportance = sp.get("minImportance") as EventImportance | null;
    const result = await loadChartPanelEvents({
      symbol,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      expand: sp.get("expand") ?? undefined,
      mode: sp.get("mode") ?? undefined,
      scopeMode: sp.get("scopeMode") ?? sp.get("mode") ?? undefined,
      assets: parseCsv(sp.get("assets")),
      industries: parseCsv(sp.get("industries")),
      countries: parseCsv(sp.get("countries")),
      types: parseCsv(sp.get("types")),
      minImportance: minImportance || undefined,
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
