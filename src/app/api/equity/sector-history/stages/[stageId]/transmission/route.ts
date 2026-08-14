import { NextRequest, NextResponse } from "next/server";
import { sectorFromSlug } from "@/lib/equity/gicsCatalog";
import {
  getSectorStageTransmission,
  isSectorAggregationMode,
  isSectorTransmissionMode,
  SectorStageTransmissionError,
} from "@/lib/equity/sectorStageTransmission";

type Ctx = { params: Promise<{ stageId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const { stageId } = await ctx.params;
    const modeRaw = req.nextUrl.searchParams.get("mode") ?? "asOf";
    const aggregation = req.nextUrl.searchParams.get("aggregation") ?? "median";
    const sector = req.nextUrl.searchParams.get("sector");

    if (!isSectorTransmissionMode(modeRaw)) {
      return NextResponse.json(
        { error: "mode 仅支持 asOf 或 realized", code: "INVALID_MODE" },
        { status: 400 },
      );
    }
    if (!isSectorAggregationMode(aggregation)) {
      return NextResponse.json(
        { error: "aggregation 仅支持 median 或 capWeighted", code: "INVALID_AGGREGATION" },
        { status: 400 },
      );
    }
    if (sector && !sectorFromSlug(sector)) {
      return NextResponse.json(
        { error: "未知行业", code: "INVALID_SECTOR" },
        { status: 400 },
      );
    }

    const payload = await getSectorStageTransmission(stageId, modeRaw, aggregation);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    if (error instanceof SectorStageTransmissionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : "阶段传导数据读取失败";
    return NextResponse.json(
      { error: message, code: "SECTOR_TRANSMISSION_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
