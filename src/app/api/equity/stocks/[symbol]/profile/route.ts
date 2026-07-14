import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { BENCHMARK_ETF } from "@/lib/equity/gicsCatalog";
import { getIndustryStyle } from "@/lib/equity/gicsIndustryCatalog";
import { getDailyClosesDbFirst } from "@/lib/equity/equityPriceStore";
import { RETURN_WINDOWS, windowStartSec } from "@/lib/equity/sectorReturns";
import { loadStockContext } from "@/lib/equity/stockDetail";
import {
  buildEqualWeightNavPoints,
  computeSymbolReturnsVsBaskets,
} from "@/lib/equity/stockRelative";

type Ctx = { params: Promise<{ symbol: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { symbol: symbolRaw } = await ctx.params;
    const stock = await loadStockContext(symbolRaw);
    if (!stock) {
      return NextResponse.json({ error: "未知标的" }, { status: 404 });
    }

    // 未分类成分无 sector ETF
    const sectorEtf = stock.sectorDef?.etf ?? null;
    const symbols = [
      ...new Set(
        [stock.symbol, BENCHMARK_ETF, sectorEtf, ...stock.peerSymbols].filter(
          (s): s is string => !!s,
        ),
      ),
    ];
    const { closes, source } = await getDailyClosesDbFirst(symbols, 320);
    const nowSec = Math.floor(Date.now() / 1000);

    const windows = RETURN_WINDOWS.map((w) => {
      const fromSec = windowStartSec(w.id, nowSec);
      const industryNav =
        stock.industry && stock.peerSymbols.length > 1
          ? buildEqualWeightNavPoints(closes, stock.peerSymbols, fromSec)
          : null;
      const row = computeSymbolReturnsVsBaskets(closes, [stock.symbol], fromSec, nowSec, {
        spyCloses: closes[BENCHMARK_ETF] ?? null,
        sectorEtfCloses: sectorEtf ? closes[sectorEtf] ?? null : null,
        industryNav,
      })[0]!;
      return {
        id: w.id,
        labelZh: w.labelZh,
        absoluteReturn: row.absoluteReturn,
        excessVsSpy: row.excessVsSpy,
        excessVsSectorEtf: row.excessVsSectorEtf,
        excessVsIndustry: row.excessVsIndustry,
      };
    });

    return NextResponse.json({
      security: {
        symbol: stock.symbol,
        name: stock.name,
        cik: stock.cik,
        marketCap: stock.marketCap,
        marketCapAsOf: stock.marketCapAsOf,
        website: stock.website,
        gicsSubIndustry: stock.gicsSubIndustry,
      },
      sector: stock.sectorDef
        ? {
            sector: stock.sector,
            nameZh: stock.sectorDef.nameZh,
            slug: stock.sectorSlug,
            etf: stock.sectorDef.etf,
          }
        : null,
      industry: stock.industry
        ? {
            code: stock.industry.code,
            nameEn: stock.industry.nameEn,
            slug: stock.industrySlug,
            style: getIndustryStyle(stock.industry.code),
            peerCount: stock.peerSymbols.length,
          }
        : null,
      windows,
      priceSource: source,
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
