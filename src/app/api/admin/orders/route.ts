import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission, adminErrorResponse } from "@/lib/auth/requireAdmin";
import { activatePaidOrder, listAllOrders } from "@/lib/billing/orders";
import { prisma } from "@/lib/prisma";
import { verifyAdminCredentials } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await requireAdminPermission(req, "orders:write");
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
    const admin = await requireAdminPermission(req, "orders:write");
    const body = (await req.json()) as { orderId?: string; orderNo?: string; reason?: string; adminPassword?: string; adminTotpCode?: string };
    if (!body.reason?.trim() || body.reason.trim().length > 500) throw new Error("请填写不超过 500 字的确认原因");
    await verifyAdminCredentials(admin.id, body.adminPassword ?? "", body.adminTotpCode ?? "");
    let orderId = body.orderId?.trim();
    if (!orderId && body.orderNo?.trim()) {
      const row = await prisma.paymentOrder.findUnique({
        where: { orderNo: body.orderNo.trim().toUpperCase() },
      });
      if (!row) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
      orderId = row.id;
    }
    if (!orderId) return NextResponse.json({ error: "缺少 orderId 或 orderNo" }, { status: 400 });
    const order = await activatePaidOrder(orderId, admin, body.reason.trim());
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
