import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { getMacroRegimeNowcast } from "@/lib/quant/macroRegime";

export async function GET() {
  try {
    const payload = await getMacroRegimeNowcast();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
      },
    });
  } catch (error) {
    const { msg, status } = apiErrorResponse(error);
    return NextResponse.json(
      { error: msg, code: "MACRO_REGIME_NOWCAST_FAILED" },
      { status },
    );
  }
}
