import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminErrorResponse } from "@/lib/auth/requireAdmin";
import { activatePaidOrder, listAllOrders } from "@/lib/billing/orders";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const orders = await listAllOrders({ status: status || undefined, limit: 200 });
    return NextResponse.json({ orders });
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const body = (await req.json()) as { orderId?: string; orderNo?: string };
    let orderId = body.orderId?.trim();
    if (!orderId && body.orderNo?.trim()) {
      const row = await prisma.paymentOrder.findUnique({
        where: { orderNo: body.orderNo.trim().toUpperCase() },
      });
      if (!row) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
      orderId = row.id;
    }
    if (!orderId) return NextResponse.json({ error: "缺少 orderId 或 orderNo" }, { status: 400 });
    const order = await activatePaidOrder(orderId, admin.username);
    return NextResponse.json({ order });
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    const msg = e instanceof Error ? e.message : message;
    const st =
      msg.includes("过期") || msg.includes("不存在") || msg.includes("状态")
        ? 400
        : status;
    return NextResponse.json({ error: msg }, { status: st });
  }
}
