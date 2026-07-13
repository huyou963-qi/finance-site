import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { getQuarterlyFundamentalsDbFirst } from "@/lib/equity/equityFundamentalsStore";
import { getDailyClosesDbFirst } from "@/lib/equity/equityPriceStore";
import { aggregatePeerQuarterMedians } from "@/lib/equity/fundamentalsAgg";
import { aggregateFiscalYears, computeQuarterRatios } from "@/lib/equity/fundamentalRatios";
import { loadStockContext } from "@/lib/equity/stockDetail";
import { computeTtm, computeValuation } from "@/lib/equity/ttm";
import { computeValuationHistory } from "@/lib/equity/valuationHistory";

type Ctx = { params: Promise<{ symbol: string }> };

/** 估值历史带覆盖 ~5.5 年交易日 */
const VALUATION_HISTORY_DAYS = 1400;

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { symbol: symbolRaw } = await ctx.params;
    const stock = await loadStockContext(symbolRaw);
    if (!stock) {
      return NextResponse.json({ error: "未知标的" }, { status: 404 });
    }

    const quartersParam = Number(req.nextUrl.searchParams.get("quarters") ?? 20);
    const quarters = Math.min(Math.max(Number.isFinite(quartersParam) ? quartersParam : 20, 4), 24);

    const rows = await getQuarterlyFundamentalsDbFirst(stock.symbol, {
      quarters,
      lazy: true,
      cik: stock.cik,
    });

    const ratios = computeQuarterRatios(rows);
    const fiscalYears = aggregateFiscalYears(rows);
    const ttm = computeTtm(rows);

    let price: number | null = null;
    let valuationHistory = null;
    if (rows.length) {
      const { closes } = await getDailyClosesDbFirst([stock.symbol], VALUATION_HISTORY_DAYS);
      const pts = closes[stock.symbol] ?? [];
      price = pts.length ? pts[pts.length - 1]!.close : null;
      valuationHistory = computeValuationHistory(
        pts,
        ratios.map((r) => ({ fiscalDate: r.fiscalDate, epsTtm: r.epsTtm, bvps: r.bvps })),
      );
    }

    const latest = rows.length ? rows[rows.length - 1]! : null;
    const valuation = computeValuation(ttm, latest, price, stock.marketCap);

    const peerMedians = await aggregatePeerQuarterMedians(
      stock.peerSymbols.filter((s) => s !== stock.symbol),
    );

    const withDerived = <T extends { revenue: number | null; netIncome: number | null; ocf: number | null; capex: number | null }>(r: T) => ({
      ...r,
      fcf: r.ocf != null && r.capex != null ? r.ocf - r.capex : null,
      netMargin:
        r.netIncome != null && r.revenue != null && r.revenue !== 0
          ? r.netIncome / r.revenue
          : null,
    });

    return NextResponse.json({
      symbol: stock.symbol,
      quarters: rows.map(withDerived),
      fiscalYears: fiscalYears.map(withDerived),
      ratios,
      ttm,
      valuation,
      valuationHistory,
      industry: stock.industry
        ? { nameEn: stock.industry.nameEn, medians: peerMedians }
        : null,
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
