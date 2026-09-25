import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { checkFeatureAccess } from "@/lib/access/featureAccess";
import { getUsNfpNowcast } from "@/lib/forecast/usNfp/service";

export const dynamic = "force-dynamic";

/** 美国非农 nowcast 载荷（与 /forecast/us-nfp 页面同源，权限同该功能页） */
export async function GET() {
  try {
    const gate = await checkFeatureAccess("forecast-us-nfp");
    if (gate.state !== "allowed") {
      return NextResponse.json({ error: "无权访问", code: gate.state }, { status: 403 });
    }
    const payload = await getUsNfpNowcast();
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    const { msg, status } = apiErrorResponse(error);
    return NextResponse.json({ error: msg, code: "US_NFP_NOWCAST_FAILED" }, { status });
  }
}
