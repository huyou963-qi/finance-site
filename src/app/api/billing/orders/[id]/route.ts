import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserByRequest } from "@/lib/auth";
import { reconcileOrder } from "@/lib/billing/zpayService";
import { serializeOrder } from "@/lib/billing/orders";
import { paymentErrorResponse, requirePaymentOrigin } from "@/lib/billing/http";
import { PaymentError } from "@/lib/billing/zpay";
type Context = { params: Promise<{ id: string }> };
async function owned(req: NextRequest, ctx: Context) {
  const user = await getUserByRequest(req);
  if (!user) throw new PaymentError("UNAUTHORIZED", 401);
  const { id } = await ctx.params;
  const order = await prisma.paymentOrder.findFirst({ where: { id, userId: user.id } });
  if (!order) throw new PaymentError("ORDER_NOT_FOUND", 404);
  return order;
}
export async function GET(req: NextRequest, ctx: Context) {
  try { return NextResponse.json({ order: serializeOrder(await owned(req, ctx)) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return paymentErrorResponse(e); }
}
export async function POST(req: NextRequest, ctx: Context) {
  try {
    requirePaymentOrigin(req);
    const order = await owned(req, ctx);
    const updated = order.channel === "zpay" ? await reconcileOrder(order.id, "user") : order;
    return NextResponse.json({ order: serializeOrder(updated) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return paymentErrorResponse(e); }
}
