import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { getSectorRegimeForwardStudy } from "@/lib/equity/sectorRegimeForwardStudy";

export async function GET() {
  try {
    const report = await getSectorRegimeForwardStudy();
    return NextResponse.json(report, {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
      },
    });
  } catch (error) {
    const { msg, status } = apiErrorResponse(error);
    return NextResponse.json(
      { error: msg, code: "SECTOR_REGIME_FORWARD_STUDY_FAILED" },
      { status },
    );
  }
}
