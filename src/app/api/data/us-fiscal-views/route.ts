import { NextResponse } from "next/server";
import { getUsFiscalViews } from "@/lib/data/usFiscalViewsStore";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  try {
    return NextResponse.json(await getUsFiscalViews(), {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (error) {
    console.error("[us-fiscal-views]", error);
    return NextResponse.json(
      { error: "财政图表暂不可用，请稍后重试" },
      { status: 503 },
    );
  }
}
