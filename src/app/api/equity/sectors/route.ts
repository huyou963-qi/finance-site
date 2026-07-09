import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import {
  getLatestSp500AsOf,
  listSectorSummaries,
} from "@/lib/equity/equitySecurities";
import { STYLE_BUCKETS } from "@/lib/equity/styleBuckets";

export async function GET(_req: NextRequest) {
  try {
    const [sectors, asOf] = await Promise.all([
      listSectorSummaries(),
      getLatestSp500AsOf(),
    ]);
    return NextResponse.json({
      asOf,
      sectors,
      styles: STYLE_BUCKETS.map((b) => ({
        id: b.id,
        nameZh: b.nameZh,
        sectors: b.sectors,
      })),
    });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
