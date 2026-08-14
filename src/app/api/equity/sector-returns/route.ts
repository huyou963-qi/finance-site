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

    // DB helper 按“最近 N 根”读取，因此历史区间必须覆盖 from → 今天，而不能只按
    // from → to 的区间宽度估算。否则 2000 年的一年窗口会错误地拿到最近一年的 K 线。
    // 9,000 根足以覆盖 1998 年末上市的 Sector SPDR 全历史。
    const historyBars = rangeMeta
      ? Math.min(
          9_000,
          Math.max(
            320,
            Math.ceil((Date.now() - Date.parse(rangeMeta.from)) / 86400000 * 0.74) + 40,
          ),
        )
      : 320;
    const [{ closes, source }, summaries] = await Promise.all([
      fetchSectorEtfClosesWithMeta(historyBars),
      listSectorSummaries(),
    ]);

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
        nav[def.etf] = normalizeNav(closes[def.etf] ?? [], fromSec).filter(
          (p) => toSec == null || p.time <= toSec,
        );
      }
      nav[BENCHMARK_ETF] = normalizeNav(closes[BENCHMARK_ETF] ?? [], fromSec).filter(
        (p) => toSec == null || p.time <= toSec,
      );
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
