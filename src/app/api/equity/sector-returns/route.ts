import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { fetchSectorEtfCloses } from "@/lib/equity/fetchSectorEtfCloses";
import {
  computeSectorReturns,
  normalizeNav,
  RETURN_WINDOWS,
  type ReturnWindowId,
  windowStartSec,
} from "@/lib/equity/sectorReturns";
import { BENCHMARK_ETF, GICS_SECTOR_DEFS } from "@/lib/equity/gicsCatalog";
import { listSectorSummaries } from "@/lib/equity/equitySecurities";

function parseWindow(raw: string | null): ReturnWindowId {
  const id = (raw ?? "3M").toUpperCase();
  if (RETURN_WINDOWS.some((w) => w.id === id)) return id as ReturnWindowId;
  return "3M";
}

export async function GET(req: NextRequest) {
  try {
    const windowId = parseWindow(req.nextUrl.searchParams.get("window"));
    const includeNav = req.nextUrl.searchParams.get("nav") === "1";
    const [closes, summaries] = await Promise.all([
      fetchSectorEtfCloses(),
      listSectorSummaries(),
    ]);
    const { sectors, styles, spyReturn } = computeSectorReturns(closes, windowId);
    const countMap = new Map(summaries.map((s) => [s.sector, s.constituentCount]));

    const ranked = [...sectors]
      .map((s) => ({
        ...s,
        nameZh: GICS_SECTOR_DEFS.find((d) => d.sector === s.sector)?.nameZh ?? s.sector,
        constituentCount: countMap.get(s.sector) ?? 0,
      }))
      .sort((a, b) => (b.excessVsSpy ?? -999) - (a.excessVsSpy ?? -999));

    let nav: Record<string, { time: number; value: number }[]> | undefined;
    if (includeNav) {
      const fromSec = windowStartSec(windowId);
      nav = {};
      for (const def of GICS_SECTOR_DEFS) {
        nav[def.etf] = normalizeNav(closes[def.etf] ?? [], fromSec);
      }
      nav[BENCHMARK_ETF] = normalizeNav(closes[BENCHMARK_ETF] ?? [], fromSec);
    }

    return NextResponse.json({
      window: windowId,
      windows: RETURN_WINDOWS,
      spyReturn,
      sectors: ranked,
      styles,
      nav,
      dataCoverage: {
        etfsWithData: Object.entries(closes).filter(([, v]) => v.length >= 2).map(([k]) => k),
        etfsMissing: Object.entries(closes).filter(([, v]) => v.length < 2).map(([k]) => k),
      },
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
