import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import {
  listConstituentsByIndustry,
  listIndustrySummaries,
  resolveIndustryParam,
  resolveSectorParam,
} from "@/lib/equity/equitySecurities";
import { getSectorDef } from "@/lib/equity/gicsCatalog";
import { fetchIndustryReturnsBatch } from "@/lib/equity/industryReturns";
import { parseReturnRange } from "@/lib/equity/returnRangeParams";

type Ctx = { params: Promise<{ sector: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { sector: raw } = await ctx.params;
    const sector = resolveSectorParam(raw);
    if (!sector) {
      return NextResponse.json({ error: "未知行业" }, { status: 404 });
    }

    const industries = await listIndustrySummaries(sector);
    const def = getSectorDef(sector);

    const fromDate = req.nextUrl.searchParams.get("from")?.trim() || null;
    const toDate = req.nextUrl.searchParams.get("to")?.trim() || null;

    let returnsByCode: Record<
      string,
      {
        equalWeightReturn: number | null;
        excessVsSpy: number | null;
        coverage: number;
      }
    > | null = null;

    if (fromDate && toDate) {
      const range = parseReturnRange(fromDate, toDate);
      if ("error" in range) {
        return NextResponse.json({ error: range.error }, { status: 400 });
      }

      const withMembers = await Promise.all(
        industries
          .filter((i) => i.constituentCount > 0)
          .map(async (ind) => ({
            industryCode: ind.code,
            symbols: (
              await listConstituentsByIndustry(sector, ind.code, { limit: 600 })
            ).map((c) => c.symbol),
          })),
      );

      const batch = await fetchIndustryReturnsBatch(
        withMembers,
        range.fromSec,
        range.toSec,
      );
      returnsByCode = Object.fromEntries(
        batch.map((r) => [
          r.industryCode,
          {
            equalWeightReturn: r.equalWeightReturn,
            excessVsSpy: r.excessVsSpy,
            coverage: r.coverage,
          },
        ]),
      );
    }

    return NextResponse.json({
      sector,
      nameZh: def.nameZh,
      etf: def.etf,
      range: fromDate && toDate ? { from: fromDate, to: toDate } : null,
      industries: industries.map((ind) => ({
        ...ind,
        returns: returnsByCode?.[ind.code] ?? null,
      })),
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
