import { NextRequest, NextResponse } from "next/server";
import { handleZpayNotification } from "@/lib/billing/zpayService";
import { parseNotification, isPaymentError } from "@/lib/billing/zpay";
export const runtime = "nodejs";
/** Gateway only. Browser return never goes through an entitlement-writing route. */
export async function GET(req: NextRequest) {
  try {
    await handleZpayNotification(parseNotification(req.nextUrl.searchParams));
    return new NextResponse("success", { headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" } });
  } catch (e) {
    // Never leak gateway URLs, credentials, raw callback/payer data or exception text.
    return new NextResponse("fail", { status: isPaymentError(e) ? e.status : 503, headers: { "Cache-Control": "no-store" } });
  }
}
