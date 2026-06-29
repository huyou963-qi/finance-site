import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildCotReportFromDb } from "@/lib/data/cot/buildCotReport";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await buildCotReportFromDb(prisma);
    return NextResponse.json(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
