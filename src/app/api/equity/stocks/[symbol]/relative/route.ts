import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { BENCHMARK_ETF } from "@/lib/equity/gicsCatalog";
import { getDailyClosesDbFirst } from "@/lib/equity/equityPriceStore";
import { normalizeNav, utcSecToDate, type ClosePoint } from "@/lib/equity/sectorReturns";
import { parseReturnRange } from "@/lib/equity/returnRangeParams";
import { loadStockContext, tradingDayLimitForRange } from "@/lib/equity/stockDetail";
import {
  buildEqualWeightNavPoints,
  computeSymbolReturnsVsBaskets,
} from "@/lib/equity/stockRelative";

type Ctx = { params: Promise<{ symbol: string }> };

function clip(points: ClosePoint[] | undefined, toSec: number): ClosePoint[] {
  return (points ?? []).filter((p) => p.time <= toSec);
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { symbol: symbolRaw } = await ctx.params;
    const stock = await loadStockContext(symbolRaw);
    if (!stock) {
      return NextResponse.json({ error: "未知标的" }, { status: 404 });
    }

    const sp = req.nextUrl.searchParams;
    const fromDate = sp.get("from")?.trim() || null;
    const toDate = sp.get("to")?.trim() || null;

    let fromSec: number;
    let toSec: number;
    let from: string;
    let to: string;
    if (fromDate || toDate) {
      const range = parseReturnRange(fromDate, toDate);
      if ("error" in range) {
        return NextResponse.json({ error: range.error }, { status: 400 });
      }
      ({ fromSec, toSec, from, to } = range);
    } else {
      const nowSec = Math.floor(Date.now() / 1000);
      toSec = nowSec;
      fromSec = nowSec - 365 * 86400;
      from = utcSecToDate(fromSec);
      to = utcSecToDate(toSec);
    }

    const limit = tradingDayLimitForRange(fromSec);
    const symbols = [
      ...new Set([stock.symbol, BENCHMARK_ETF, stock.sectorDef.etf, ...stock.peerSymbols]),
    ];
    const { closes, source } = await getDailyClosesDbFirst(symbols, limit);

    const clipped: Record<string, ClosePoint[]> = {};
    for (const [sym, pts] of Object.entries(closes)) clipped[sym] = clip(pts, toSec);

    const industryNav =
      stock.industry && stock.peerSymbols.length > 1
        ? buildEqualWeightNavPoints(clipped, stock.peerSymbols, fromSec)
        : null;

    const toValuePoints = (pts: { time: number; value: number }[]) => pts;
    const series = [
      {
        key: "stock",
        name: stock.symbol,
        points: toValuePoints(normalizeNav(clipped[stock.symbol] ?? [], fromSec)),
      },
      industryNav
        ? {
            key: "industry",
            name: `${stock.industry!.nameEn}（等权）`,
            points: industryNav.map((p) => ({ time: p.time, value: p.close })),
          }
        : null,
      {
        key: "sectorEtf",
        name: stock.sectorDef.etf,
        points: toValuePoints(normalizeNav(clipped[stock.sectorDef.etf] ?? [], fromSec)),
      },
      {
        key: "spy",
        name: BENCHMARK_ETF,
        points: toValuePoints(normalizeNav(clipped[BENCHMARK_ETF] ?? [], fromSec)),
      },
    ].filter((s): s is NonNullable<typeof s> => s != null && s.points.length >= 2);

    const returns = computeSymbolReturnsVsBaskets(clipped, [stock.symbol], fromSec, toSec, {
      spyCloses: clipped[BENCHMARK_ETF] ?? null,
      sectorEtfCloses: clipped[stock.sectorDef.etf] ?? null,
      industryNav,
    })[0]!;

    return NextResponse.json({
      symbol: stock.symbol,
      range: { from, to },
      series,
      returns: {
        absoluteReturn: returns.absoluteReturn,
        excessVsSpy: returns.excessVsSpy,
        excessVsSectorEtf: returns.excessVsSectorEtf,
        excessVsIndustry: returns.excessVsIndustry,
      },
      priceSource: source,
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
