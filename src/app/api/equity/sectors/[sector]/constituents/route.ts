import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import {
  listConstituentsBySector,
  resolveSectorParam,
} from "@/lib/equity/equitySecurities";
import { getSectorDef } from "@/lib/equity/gicsCatalog";
import { styleForSector } from "@/lib/equity/styleBuckets";

type Ctx = { params: Promise<{ sector: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { sector: raw } = await ctx.params;
    const sector = resolveSectorParam(raw);
    if (!sector) {
      return NextResponse.json({ error: "未知行业" }, { status: 404 });
    }
    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const constituents = await listConstituentsBySector(sector, { limit });
    const def = getSectorDef(sector);
    return NextResponse.json({
      sector,
      nameZh: def.nameZh,
      etf: def.etf,
      style: styleForSector(sector),
      constituents,
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
