import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { fetchSectorEtfClosesWithMeta } from "@/lib/equity/fetchSectorEtfCloses";
import {
  computeSectorReturns,
  computeSectorReturnsForRange,
  dateToUtcSec,
  normalizeNav,
  RETURN_WINDOWS,
  type ReturnWindowId,
  windowStartSec,
} from "@/lib/equity/sectorReturns";
import { BENCHMARK_ETF, GICS_SECTOR_DEFS } from "@/lib/equity/gicsCatalog";
import { listSectorSummaries } from "@/lib/equity/equitySecurities";
import { STYLE_BUCKETS } from "@/lib/equity/styleBuckets";

function parseWindow(raw: string | null): ReturnWindowId {
  const id = (raw ?? "3M").toUpperCase();
  if (RETURN_WINDOWS.some((w) => w.id === id)) return id as ReturnWindowId;
  return "3M";
}

/** 日末 UTC 秒（含当日） */
function endOfUtcDaySec(date: string): number | null {
  const start = dateToUtcSec(date);
  if (start == null) return null;
  return start + 86400 - 1;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const includeNav = sp.get("nav") === "1";
    const fromDate = sp.get("from")?.trim() || null;
    const toDate = sp.get("to")?.trim() || null;
    const windowId = parseWindow(sp.get("window"));

    const [{ closes, source }, summaries] = await Promise.all([
      fetchSectorEtfClosesWithMeta(),
      listSectorSummaries(),
    ]);

    let fromSec: number;
    let toSec: number | undefined;
    let rangeMeta: { from: string; to: string } | null = null;

    if (fromDate && toDate) {
      const f = dateToUtcSec(fromDate);
      const t = endOfUtcDaySec(toDate);
      if (f == null || t == null) {
        return NextResponse.json(
          { error: "from / to 须为 YYYY-MM-DD" },
          { status: 400 },
        );
      }
      if (t < f) {
        return NextResponse.json(
          { error: "截止日期须不早于开始日期" },
          { status: 400 },
        );
      }
      fromSec = f;
      toSec = t;
      rangeMeta = { from: fromDate, to: toDate };
    } else {
      fromSec = windowStartSec(windowId);
    }

    const { sectors, styles, spyReturn } =
      fromDate && toDate
        ? computeSectorReturnsForRange(closes, fromSec, toSec)
        : computeSectorReturns(closes, windowId);

    const countMap = new Map(summaries.map((s) => [s.sector, s.constituentCount]));

    const ranked = [...sectors]
      .map((s) => ({
        ...s,
        nameZh: GICS_SECTOR_DEFS.find((d) => d.sector === s.sector)?.nameZh ?? s.sector,
        constituentCount: countMap.get(s.sector) ?? 0,
      }))
      .sort((a, b) => (b.excessVsSpy ?? -999) - (a.excessVsSpy ?? -999));

    /** 按风格固定列序（成长 → 周期 → 防御） */
    const columns = STYLE_BUCKETS.flatMap((bucket) =>
      bucket.sectors.map((sector) => {
        const def = GICS_SECTOR_DEFS.find((d) => d.sector === sector)!;
        const row = sectors.find((s) => s.sector === sector);
        return {
          sector,
          nameZh: def.nameZh,
          etf: def.etf,
          style: bucket.id,
          styleNameZh: bucket.nameZh,
          absoluteReturn: row?.absoluteReturn ?? null,
          excessVsSpy: row?.excessVsSpy ?? null,
        };
      }),
    );

    let nav: Record<string, { time: number; value: number }[]> | undefined;
    if (includeNav) {
      nav = {};
      for (const def of GICS_SECTOR_DEFS) {
        nav[def.etf] = normalizeNav(closes[def.etf] ?? [], fromSec);
      }
      nav[BENCHMARK_ETF] = normalizeNav(closes[BENCHMARK_ETF] ?? [], fromSec);
    }

    return NextResponse.json({
      window: rangeMeta ? null : windowId,
      range: rangeMeta,
      windows: RETURN_WINDOWS,
      spyReturn,
      sectors: ranked,
      columns,
      styles,
      nav,
      priceSource: source,
      dataCoverage: {
        etfsWithData: Object.entries(closes)
          .filter(([, v]) => v.length >= 2)
          .map(([k]) => k),
        etfsMissing: Object.entries(closes)
          .filter(([, v]) => v.length < 2)
          .map(([k]) => k),
      },
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
