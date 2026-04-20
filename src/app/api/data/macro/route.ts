import { NextRequest, NextResponse } from "next/server";
import {
  parseFredSeriesQuery,
  parseSeriesQuery,
  parseUnifiedSeriesQuery,
} from "@/lib/data/macroCatalog";
import { fetchFredSeriesMultiple } from "@/lib/data/fred";
import { fetchUnifiedMacro } from "@/lib/data/unifiedMacro";
import { fetchWorldBankSeries } from "@/lib/data/worldbank";

/**
 * GET /api/data/macro?source=worldbank&series=US:FP.CPI.TOTL.ZG,CN:NY.GDP.MKTP.KD.ZG
 * GET /api/data/macro?source=fred&series=CPIAUCSL,UNRATE,FEDFUNDS
 * GET /api/data/macro?source=unified&series=wb:US:FP.CPI.TOTL.ZG,fred:UNRATE
 */
export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get("source") ?? "worldbank";

  try {
    if (source === "fred") {
      const raw = req.nextUrl.searchParams.get("series");
      const ids = parseFredSeriesQuery(raw);
      const payload = await fetchFredSeriesMultiple(ids);
      return NextResponse.json(payload);
    }

    if (source === "worldbank") {
      const wbParam = req.nextUrl.searchParams.get("series");
      const selections = parseSeriesQuery(wbParam);
      const payload = await fetchWorldBankSeries(selections);
      return NextResponse.json(payload);
    }

    if (source === "unified") {
      const raw = req.nextUrl.searchParams.get("series");
      const keys = parseUnifiedSeriesQuery(raw);
      const payload = await fetchUnifiedMacro(keys);
      return NextResponse.json(payload);
    }

    return NextResponse.json(
      { error: `未知 source：${source}（支持 worldbank、fred、unified）` },
      { status: 400 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
