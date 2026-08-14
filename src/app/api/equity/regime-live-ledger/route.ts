import { NextResponse } from "next/server";
import { getSectorRegimeLiveLedger } from "@/lib/equity/sectorRegimeLiveLedger";

export async function GET() {
  try {
    return NextResponse.json(await getSectorRegimeLiveLedger(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[regime-live-ledger]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "真实前瞻账本加载失败" },
      { status: 500 },
    );
  }
}
