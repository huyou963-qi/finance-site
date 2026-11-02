import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { checkoutForUser } from "@/lib/billing/zpayService";
import { paymentErrorResponse, paymentJson, requirePaymentOrigin } from "@/lib/billing/http";
import { serializeOrder } from "@/lib/billing/orders";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    requirePaymentOrigin(req);
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const input = await paymentJson(req);
    const result = await checkoutForUser(user.id, input, req.headers.get("origin")!);
    return NextResponse.json({ order: serializeOrder(result.order), checkout: result.checkout }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return paymentErrorResponse(e); }
}
