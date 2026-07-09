import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { aggregateAllSectorFundamentals } from "@/lib/equity/fundamentalsAgg";

export async function GET() {
  try {
    const sectors = await aggregateAllSectorFundamentals();
    return NextResponse.json({ sectors });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
