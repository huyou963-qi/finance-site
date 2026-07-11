import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { listConstituentsByIndustry, resolveSectorParam } from "@/lib/equity/equitySecurities";
import { getIndustryByCode } from "@/lib/equity/gicsIndustryCatalog";
import { fetchIndustryReturns } from "@/lib/equity/industryReturns";
import { parseReturnRange } from "@/lib/equity/returnRangeParams";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const industryCode = sp.get("industryCode")?.trim() || sp.get("code")?.trim();
    const fromDate = sp.get("from")?.trim() || null;
    const toDate = sp.get("to")?.trim() || null;

    if (!industryCode || !/^\d{6}$/.test(industryCode)) {
      return NextResponse.json({ error: "industryCode 须为 6 位 GICS 代码" }, { status: 400 });
    }

    const industry = getIndustryByCode(industryCode);
    if (!industry) {
      return NextResponse.json({ error: "未知 Industry" }, { status: 404 });
    }

    const range = parseReturnRange(fromDate, toDate);
    if ("error" in range) {
      return NextResponse.json({ error: range.error }, { status: 400 });
    }

    const sectorParam = sp.get("sector");
    const sector = sectorParam ? resolveSectorParam(sectorParam) : industry.sector;
    if (!sector || sector !== industry.sector) {
      return NextResponse.json({ error: "sector 与 industryCode 不匹配" }, { status: 400 });
    }

    const constituents = await listConstituentsByIndustry(sector, industry.code, { limit: 600 });
    const symbols = constituents.map((c) => c.symbol);
    const basket = await fetchIndustryReturns(symbols, range.fromSec, range.toSec, industry.code);

    return NextResponse.json({
      sector,
      industry: {
        code: industry.code,
        nameEn: industry.nameEn,
      },
      range: { from: range.from, to: range.to },
      basket,
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
