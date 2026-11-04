import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { checkFeatureAccess } from "@/lib/access/featureAccess";
import { getUsGdpNowcast, toPublicUsGdpPayload } from "@/lib/forecast/usGdp/service";

export const dynamic = "force-dynamic";

/** 美国 GDP nowcast 载荷（与 /forecast/us-gdp 页面同源）。非管理员响应不含方程、系数和输入。 */
export async function GET() {
  try {
    const gate = await checkFeatureAccess("forecast-us-gdp");
    if (gate.state !== "allowed") {
      return NextResponse.json({ error: "无权访问", code: gate.state }, { status: 403 });
    }
    const payload = await getUsGdpNowcast();
    const body = gate.viewer.role === "admin" ? payload : toPublicUsGdpPayload(payload);
    return NextResponse.json(body, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    const { msg, status } = apiErrorResponse(error);
    return NextResponse.json({ error: msg, code: "US_GDP_NOWCAST_FAILED" }, { status });
  }
}
