import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission, adminErrorResponse } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma";
import { reconcileOrder } from "@/lib/billing/zpayService";
import { requirePaymentOrigin, paymentErrorResponse } from "@/lib/billing/http";
import { PaymentError } from "@/lib/billing/zpay";
type Context = { params: Promise<{ id: string }> };
async function requireOrderAdmin(req: NextRequest) {
  try { await requireAdminPermission(req, "orders:write"); }
  catch (e) {
    const { status } = adminErrorResponse(e);
    if (status === 401) throw new PaymentError("UNAUTHORIZED", 401);
    if (status === 403) throw new PaymentError("FORBIDDEN", 403);
    throw e;
  }
}
export async function GET(req: NextRequest, ctx: Context) {
  try {
    await requireOrderAdmin(req);
    const { id } = await ctx.params;
    const events = await prisma.paymentEvent.findMany({ where: { orderId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
    return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return paymentErrorResponse(e); }
}
export async function POST(req: NextRequest, ctx: Context) {
  try {
    requirePaymentOrigin(req);
    await requireOrderAdmin(req);
    const { id } = await ctx.params;
    // This does not override payment evidence: it always queries the gateway.
    await reconcileOrder(id, "admin");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return paymentErrorResponse(e); }
}
