import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { queryEventsByContext } from "@/lib/data/marketEvents";

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
    const date = sp.get("date");
    if (!date) {
      return NextResponse.json({ error: "缺少 date 参数" }, { status: 400 });
    }
    const events = await queryEventsByContext({
      date,
      lookbackDays: sp.get("lookback") ? Number(sp.get("lookback")) : undefined,
      lookaheadDays: sp.get("lookahead") ? Number(sp.get("lookahead")) : undefined,
      countries: parseCsv(sp.get("countries")),
      industries: parseCsv(sp.get("industries")),
      assets: parseCsv(sp.get("assets")),
      macroKeys: parseCsv(sp.get("macroKeys")),
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json({ events, date });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
