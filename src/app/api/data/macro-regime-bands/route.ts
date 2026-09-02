import { NextResponse } from "next/server";
import { listMacroRegimeBands } from "@/lib/data/macroRegimeProjection";

export async function GET() {
  try {
    return NextResponse.json({ bands: await listMacroRegimeBands() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "无法读取 Regime 色带" },
      { status: 502 },
    );
  }
}
