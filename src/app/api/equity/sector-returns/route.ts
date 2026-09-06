import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import {
  fetchMacroAssetCloses,
  fetchSectorEtfClosesWithMeta,
} from "@/lib/equity/fetchSectorEtfCloses";
import {
  computeSectorReturns,
  computeSectorReturnsForRange,
  dateToUtcSec,
  normalizeNav,
  RETURN_WINDOWS,
  stageWindowReturn,
  type ClosePoint,
  type ReturnWindowId,
  windowStartSec,
} from "@/lib/equity/sectorReturns";
import { BENCHMARK_ETF, GICS_SECTOR_DEFS } from "@/lib/equity/gicsCatalog";
import { listSectorSummaries } from "@/lib/equity/equitySecurities";
import { MACRO_ASSET_CLASSES } from "@/lib/equity/macroAssetClasses";
import { SECTOR_HISTORICAL_PERIODS } from "@/lib/equity/sectorHistoricalPeriods";
import { STYLE_BUCKETS } from "@/lib/equity/styleBuckets";

/** ClosePoint → 阶段窗口收益的通用点位 */
function toStagePoints(points: readonly ClosePoint[] | undefined) {
  return (points ?? []).map((p) => ({ time: p.time, value: p.close }));
}

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
    const includeAssets = sp.get("assets") === "1";
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
    const [{ closes, source }, summaries, assetResult] = await Promise.all([
      fetchSectorEtfClosesWithMeta(historyBars),
      listSectorSummaries(),
      includeAssets ? fetchMacroAssetCloses(historyBars) : Promise.resolve(null),
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

    // 阶段窗口的右边界统一钉在 SPY 最后一根日线上：既让「至今」阶段随行情推进，
    // 又让服务端的大类资产与浏览器端的行业用同一个窗口，超额才可比。
    const spyLastSec = closes[BENCHMARK_ETF]?.at(-1)?.time ?? null;
    let assetStages: Record<string, Record<string, number | null>> | undefined;
    if (assetResult) {
      const stagePoints = new Map(
        MACRO_ASSET_CLASSES.map((asset) => [
          asset.id,
          toStagePoints(assetResult.closes[asset.symbol]),
        ]),
      );
      assetStages = {};
      for (const period of SECTOR_HISTORICAL_PERIODS) {
        const stageFrom = dateToUtcSec(period.start);
        const stageTo = endOfUtcDaySec(period.end);
        if (stageFrom == null || stageTo == null) continue;
        const effectiveTo = spyLastSec == null ? stageTo : Math.min(stageTo, spyLastSec);
        const row: Record<string, number | null> = {};
        for (const asset of MACRO_ASSET_CLASSES) {
          row[asset.id] = stageWindowReturn(
            stagePoints.get(asset.id),
            stageFrom,
            effectiveTo,
          );
        }
        assetStages[period.id] = row;
      }
    }

    return NextResponse.json({
      window: rangeMeta ? null : windowId,
      range: rangeMeta,
      /** 最新可得交易日（UTC 秒）：阶段窗口右边界，浏览器端须用同一值 */
      latestSec: spyLastSec,
      assetStages,
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
