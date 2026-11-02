import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission, adminErrorResponse } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma";
import { reconcileOrder } from "@/lib/billing/zpayService";
import { requirePaymentOrigin, paymentErrorResponse } from "@/lib/billing/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, ctx: Context) {
  try {
    await requireAdminPermission(req, "orders:write");
    const { id } = await ctx.params;
    const events = await prisma.paymentEvent.findMany({ where: { orderId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
    return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { const err = adminErrorResponse(e); return NextResponse.json({ error: err.message }, { status: err.status }); }
}
export async function POST(req: NextRequest, ctx: Context) {
  try {
    requirePaymentOrigin(req);
    await requireAdminPermission(req, "orders:write");
    const { id } = await ctx.params;
    // This does not override payment evidence: it always queries the gateway.
    await reconcileOrder(id, "admin");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return paymentErrorResponse(e); }
}
