import { NextRequest, NextResponse } from "next/server";
import { parseFredSeriesQuery, parseSeriesQuery } from "@/lib/data/macroCatalog";
import {
  getFredCatalogCached,
  parseUnifiedSeriesQueryWithAllowlist,
} from "@/lib/data/fredCatalog";
import { fetchFredSeriesMultiple } from "@/lib/data/fred";
import { fetchUnifiedMacro } from "@/lib/data/unifiedMacro";
import { fetchWorldBankSeries } from "@/lib/data/worldbank";
import { fetchMdsMacroFromRequest } from "@/lib/data/mdsMacro";

/**
 * GET /api/data/macro?source=worldbank&series=US:FP.CPI.TOTL.ZG,CN:NY.GDP.MKTP.KD.ZG
 * GET /api/data/macro?source=fred&series=CPIAUCSL,UNRATE,FEDFUNDS
 * GET /api/data/macro?source=unified&series=fred:GDPC1,fred:CPIAUCSL
 * GET /api/data/macro?source=mds&instruments=<uuid>[,uuid...]  本地 mds.MacroObservation
 */
export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get("source") ?? "worldbank";

  try {
    if (source === "mds") {
      const instruments = req.nextUrl.searchParams.get("instruments");
      const payload = await fetchMdsMacroFromRequest(instruments);
      return NextResponse.json(payload);
    }

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
      const { allowlist } = await getFredCatalogCached();
      const keys = parseUnifiedSeriesQueryWithAllowlist(raw, allowlist);
      const payload = await fetchUnifiedMacro(keys, allowlist);
      return NextResponse.json(payload);
    }

    return NextResponse.json(
      { error: `未知 source：${source}（支持 worldbank、fred、unified、mds）` },
      { status: 400 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
