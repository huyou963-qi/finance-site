import type { Prisma } from "@prisma/client";
import { quoteForOrder } from "./configStore";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "node:crypto";
import { grantOrderEntitlement, serializable } from "./fulfillment";
import { periodForProduct } from "@/lib/billing/pricing";
import type { MembershipProduct } from "./config";

const ORDER_TTL_HOURS = 48;

function randomOrderNo(): string {
  return `FN-${randomBytes(8).toString("hex").toUpperCase()}`;
}

export async function createPaymentOrder(input: {
  userId: string;
  productType: MembershipProduct;
  channel?: string;
  manualNote?: string;
}) {
  const period = periodForProduct(input.productType);
  const expiresAt = new Date(Date.now() + ORDER_TTL_HOURS * 60 * 60 * 1000);

  for (let attempt = 0; attempt < 5; attempt++) {
    const orderNo = randomOrderNo();
    try {
      return await serializable(async tx => {
        const quote = await quoteForOrder(tx, input.userId, input.productType);
        return tx.paymentOrder.create({
          data: {
            orderNo,
            userId: input.userId,
            productType: input.productType,
            period,
            amountCny: quote.amountCents / 100,
            pricingSnapshot: quote,
            status: "pending",
            channel: input.channel ?? "manual",
            manualNote: input.manualNote?.trim() || null,
            expiresAt,
          },
        });
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!msg.includes("Unique") && !msg.includes("unique")) throw e;
    }
  }
  throw new Error("无法生成订单号，请重试");
}

export function serializeOrder(o: {
  pricingSnapshot?: unknown;
  id: string;
  orderNo: string;
  userId: string;
  productType: string;
  period: string | null;
  amountCny: number;
  credits: number;
  status: string;
  channel: string;
  manualNote: string | null;
  externalId: string | null;
  paidAt: Date | null;
  confirmedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  paymentMethod?: string | null;
  fulfilledAt?: Date | null;
  lastErrorCode?: string | null;
  lastCheckedAt?: Date | null;
  checkAttempts?: number;
}) {
  return {
    id: o.id,
    orderNo: o.orderNo,
    userId: o.userId,
    productType: o.productType,
    period: o.period,
    amountCny: o.amountCny,
    pricingSnapshot: o.pricingSnapshot ?? null,
    credits: o.credits,
    status: o.status,
    channel: o.channel,
    manualNote: o.manualNote ?? "",
    externalId: o.externalId ?? "",
    paidAt: o.paidAt ? o.paidAt.toISOString() : "",
    confirmedBy: o.confirmedBy ?? "",
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    expiresAt: o.expiresAt ? o.expiresAt.toISOString() : "",
    paymentMethod: o.paymentMethod ?? "",
    fulfilledAt: o.fulfilledAt?.toISOString() ?? "",
    lastErrorCode: o.lastErrorCode ?? "",
    lastCheckedAt: o.lastCheckedAt?.toISOString() ?? "",
    checkAttempts: o.checkAttempts ?? 0,
  };
}

export async function consumeBacktestCredit(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const updated = await tx.user.updateMany({
    where: { id: userId, creditBalance: { gt: 0 } },
    data: { creditBalance: { decrement: 1 } },
  });
  if (!updated.count) return false;
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { creditBalance: true } });
  await tx.creditLedgerEntry.create({
    data: { userId, reason: "consume_backtest", delta: -1, balanceAfter: user.creditBalance },
  });
  return true;
}

export async function activatePaidOrder(orderId: string, actor: { id: string; username: string }, reason: string) {
  const now = new Date();
  const expired = await prisma.paymentOrder.updateMany({ where: { id: orderId, status: "pending", expiresAt: { lt: now } }, data: { status: "expired" } });
  if (expired.count) throw new Error("订单已过期，请重新下单");
  const updated = await serializable(async (tx) => {
    const order = await tx.paymentOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new Error("订单不存在");
    if (order.channel === "zpay") throw new Error("ZPAY订单须通过平台查单核验，不能人工确认");
    if (order.status === "paid") return order;
    if (order.status !== "pending") throw new Error("订单状态不可确认");
    if (order.expiresAt && order.expiresAt < now) throw new Error("订单已过期，请重新下单");
    const claimed = await tx.paymentOrder.updateMany({ where: { id: orderId, status: "pending" }, data: {
      status: "paid", paidAt: now, fulfilledAt: now, confirmedBy: actor.username, channel: order.channel === "manual" ? "admin" : order.channel,
    } });
    if (claimed.count !== 1) throw new Error("订单已被其他管理员确认");
    const evidence = await grantOrderEntitlement(tx, order, now);
    const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
    await tx.paymentEvent.create({ data: { orderId, kind: "entitlement_granted", source: "admin", code: "OK", details: evidence } });
    await tx.adminUserAudit.create({ data: { actorId: actor.id, actorUsername: actor.username, targetUserId: user.id,
      targetUsername: user.username, action: "order-confirm", reason, before: { orderNo: order.orderNo, status: order.status }, after: { orderNo: order.orderNo, status: "paid" } } });
    return tx.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
  });
  return serializeOrder(updated);
}

export async function listOrdersForUser(userId: string) {
  const rows = await prisma.paymentOrder.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map(serializeOrder);
}

export async function listAllOrders(opts?: { status?: string; limit?: number }) {
  const rows = await prisma.paymentOrder.findMany({
    where: opts?.status ? { status: opts.status } : undefined,
    orderBy: { createdAt: "desc" },
    take: opts?.limit ?? 100,
    include: { user: { select: { username: true, email: true } } },
  });
  return rows.map((o) => ({
    ...serializeOrder(o),
    username: o.user.username,
    email: o.user.email ?? "",
  }));
}

export function paymentInstructions() {
  return {
    wechatHint: process.env.PAYMENT_WECHAT_HINT?.trim() || "请使用微信转账至站长个人收款码",
    alipayHint: process.env.PAYMENT_ALIPAY_HINT?.trim() || "请使用支付宝转账至站长个人收款码",
    transferHint:
      process.env.PAYMENT_TRANSFER_HINT?.trim() ||
      "转账备注务必填写订单号；到账后管理员将尽快开通。",
    wechatQrUrl: process.env.PAYMENT_WECHAT_QR_URL?.trim() || "",
    alipayQrUrl: process.env.PAYMENT_ALIPAY_QR_URL?.trim() || "",
  };
}
