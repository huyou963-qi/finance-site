import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import {
  listConstituentsByIndustry,
  resolveIndustryParam,
  resolveSectorParam,
} from "@/lib/equity/equitySecurities";
import { BENCHMARK_ETF, getSectorDef } from "@/lib/equity/gicsCatalog";
import { getIndustryStyle } from "@/lib/equity/gicsIndustryCatalog";
import {
  computeSymbolReturns,
  fetchIndustryReturns,
} from "@/lib/equity/industryReturns";
import { getDailyClosesDbFirst } from "@/lib/equity/equityPriceStore";
import { parseReturnRange } from "@/lib/equity/returnRangeParams";

type Ctx = { params: Promise<{ sector: string; industry: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { sector: sectorRaw, industry: industryRaw } = await ctx.params;
    const sector = resolveSectorParam(sectorRaw);
    if (!sector) {
      return NextResponse.json({ error: "未知行业" }, { status: 404 });
    }
    const industry = resolveIndustryParam(sector, industryRaw);
    if (!industry) {
      return NextResponse.json({ error: "未知 Industry" }, { status: 404 });
    }

    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const constituents = await listConstituentsByIndustry(sector, industry.code, { limit });
    const def = getSectorDef(sector);

    const fromDate = req.nextUrl.searchParams.get("from")?.trim() || null;
    const toDate = req.nextUrl.searchParams.get("to")?.trim() || null;

    let basket = null;
    let memberReturns: Record<string, { absoluteReturn: number | null; excessVsSpy: number | null }> =
      {};

    if (fromDate && toDate) {
      const range = parseReturnRange(fromDate, toDate);
      if ("error" in range) {
        return NextResponse.json({ error: range.error }, { status: 400 });
      }

      const symbols = constituents.map((c) => c.symbol);
      basket = await fetchIndustryReturns(symbols, range.fromSec, range.toSec, industry.code);

      const { closes } = await getDailyClosesDbFirst([...symbols, BENCHMARK_ETF]);
      const rows = computeSymbolReturns(
        closes,
        symbols,
        range.fromSec,
        range.toSec,
        basket.spyReturn,
      );
      memberReturns = Object.fromEntries(
        rows.map((r) => [
          r.symbol,
          { absoluteReturn: r.absoluteReturn, excessVsSpy: r.excessVsSpy },
        ]),
      );
    }

    return NextResponse.json({
      sector,
      nameZh: def.nameZh,
      industry: {
        code: industry.code,
        nameEn: industry.nameEn,
        industryGroup: industry.industryGroup,
        style: getIndustryStyle(industry.code),
      },
      range: fromDate && toDate ? { from: fromDate, to: toDate } : null,
      basket,
      constituents: constituents.map((c) => ({
        ...c,
        returns: memberReturns[c.symbol] ?? null,
      })),
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
