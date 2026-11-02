import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { amountForProduct, CREDIT_PACK_CREDITS, periodForProduct, type ProductType } from "./pricing";
import { grantOrderEntitlement, serializable } from "./fulfillment";
import { checkoutMethods, PaymentError, queryZpay, signedCheckout, validateGatewayOrder, verifyZpay, moneyInCents, zpayConfig, type GatewayOrder, type PaymentMethod } from "./zpay";

export async function checkoutForUser(userId: string, input: { orderId?: string; productType?: ProductType; method?: PaymentMethod; idempotencyKey?: string }, returnOrigin?: string) {
  if (input.orderId !== undefined && (typeof input.orderId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(input.orderId))) throw new PaymentError("INVALID_REQUEST");
  const config = zpayConfig();
  if (returnOrigin && ![config.baseUrl, ...(process.env.BILLING_ALLOWED_ORIGINS ?? "").split(",").map(v => v.trim())].includes(returnOrigin)) throw new PaymentError("INVALID_ORIGIN", 403);
  if (!checkoutMethods().length) throw new PaymentError("CHANNEL_UNAVAILABLE", 503);
  let order;
  if (input.orderId) {
    order = await prisma.paymentOrder.findFirst({ where: { id: input.orderId, userId, channel: "zpay" } });
    if (!order) throw new PaymentError("ORDER_NOT_FOUND", 404);
  } else {
    if (!input.productType || !["pro_month", "pro_year", "credits"].includes(input.productType)) throw new PaymentError("INVALID_PRODUCT");
    if (!input.method || !config.methods.includes(input.method)) throw new PaymentError("CHANNEL_UNAVAILABLE", 503);
    if (typeof input.idempotencyKey !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(input.idempotencyKey)) throw new PaymentError("INVALID_REQUEST");
    const { productType, method, idempotencyKey } = input;
    try {
      order = await serializable(async tx => {
        const prior = await tx.paymentOrder.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: idempotencyKey! } } });
        if (prior) return prior;
        const unpaid = await tx.paymentOrder.findFirst({ where: { userId, channel: "zpay", merchantId: config.pid, productType, paymentMethod: method, status: "pending", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
        // Different keys cannot alias an existing request: resume that order explicitly by ID.
        if (unpaid) throw new PaymentError("UNPAID_ORDER_EXISTS", 409);
        const recent = await tx.paymentOrder.count({ where: { userId, channel: "zpay", createdAt: { gte: new Date(Date.now() - 3600000) } } });
        if (recent >= 10) throw new PaymentError("TOO_MANY_ORDERS", 429);
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        if (user.status !== "active") throw new PaymentError("ACCOUNT_REVIEW", 409);
        if (productType !== "credits" && user.plan === "pro" && user.planExpiresAt === null) throw new PaymentError("PERMANENT_PRO", 409);
        return tx.paymentOrder.create({ data: {
          orderNo: `${Date.now()}${String(randomInt(1e9)).padStart(9, "0")}${String(randomInt(1e9)).padStart(9, "0")}`,
          userId, productType, period: periodForProduct(productType), amountCny: amountForProduct(productType),
          credits: productType === "credits" ? CREDIT_PACK_CREDITS : 0, channel: "zpay", paymentMethod: method,
          merchantId: config.pid, idempotencyKey, expiresAt: new Date(Date.now() + 30 * 60000), nextCheckAt: new Date(Date.now() + 60000),
          events: { create: { kind: "checkout_created", source: "user", code: "OK", details: { amountCny: amountForProduct(productType), method } } },
        } });
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") throw e;
      order = await prisma.paymentOrder.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: idempotencyKey! } } });
      if (!order) throw new PaymentError("RETRY_REQUEST", 409);
    }
    if (order.productType !== productType || order.paymentMethod !== method || order.channel !== "zpay") throw new PaymentError("IDEMPOTENCY_CONFLICT", 409);
  }
  if (order.merchantId !== config.pid || !config.methods.includes(order.paymentMethod as PaymentMethod)) throw new PaymentError("CHANNEL_UNAVAILABLE", 503);
  if (order.status !== "pending" || !order.expiresAt || order.expiresAt <= new Date()) throw new PaymentError("ORDER_NOT_PAYABLE", 409);
  return { order, checkout: signedCheckout(order, config, returnOrigin) };
}

/** A verified success owns its gateway transaction uniquely. Funds and entitlement commit atomically. */
export async function fulfillVerifiedOrder(orderId: string, data: GatewayOrder, source: string, expectedTradeNo?: string) {
  return serializable(async tx => {
    const order = await tx.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.channel !== "zpay") throw new PaymentError("ORDER_MISMATCH", 409);
    validateGatewayOrder(data, order, expectedTradeNo);
    if (order.status === "paid" && order.fulfilledAt) return order;
    if (!["pending", "expired", "review"].includes(order.status)) throw new PaymentError("ORDER_REVIEW", 409);
    const now = new Date();
    const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
    if (user.status !== "active") {
      const reviewed = await tx.paymentOrder.update({ where: { id: orderId }, data: { status: "review", paidAt: order.paidAt ?? now, providerTradeNo: data.trade_no, externalId: data.trade_no, lastErrorCode: "ACCOUNT_REVIEW", nextCheckAt: order.createdAt.getTime() + 7 * 86400000 > now.getTime() ? new Date(now.getTime() + 3600000) : null } });
      await tx.paymentEvent.create({ data: { orderId, kind: "payment_review", source, code: "ACCOUNT_REVIEW" } });
      return reviewed;
    }
    const evidence = await grantOrderEntitlement(tx, order, now);
    const paid = await tx.paymentOrder.update({ where: { id: orderId }, data: { status: "paid", paidAt: order.paidAt ?? now, fulfilledAt: now, providerTradeNo: data.trade_no, externalId: data.trade_no, confirmedBy: "zpay-verified", lastErrorCode: null, nextCheckAt: null } });
    await tx.paymentEvent.create({ data: { orderId, kind: "entitlement_granted", source, code: "OK", details: { tradeNo: data.trade_no, amountCny: order.amountCny, late: Boolean(order.expiresAt && order.expiresAt < now), ...evidence } } });
    return paid;
  });
}

/** DB timestamp claim bounds gateway traffic across browsers, cron and app processes. */
export async function reconcileOrder(orderId: string, source: "user" | "notify" | "worker" | "admin", expectedTradeNo?: string) {
  const config = zpayConfig();
  const order = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (order.channel !== "zpay" || order.merchantId !== config.pid) throw new PaymentError("ORDER_MISMATCH", 409);
  if (order.status === "paid" && order.fulfilledAt) {
    if (expectedTradeNo && order.providerTradeNo !== expectedTradeNo) throw new PaymentError("TRADE_MISMATCH", 409);
    return order;
  }
  const now = new Date();
  const claim = await prisma.paymentOrder.updateMany({ where: { id: orderId, status: { in: ["pending", "expired", "review"] },
    OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - (source === "notify" ? 5000 : 30000)) } }],
    ...(source === "worker" ? { nextCheckAt: { lte: now } } : {}),
  }, data: { lastCheckedAt: now, checkAttempts: { increment: 1 }, nextCheckAt: new Date(now.getTime() + 60000) } });
  if (!claim.count) {
    if (source === "notify") throw new PaymentError("RETRY_REQUEST", 503);
    return prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
  }
  let code = "OK";
  try {
    const data = await queryZpay(order.orderNo, config);
    validateGatewayOrder(data, order, expectedTradeNo);
    return await fulfillVerifiedOrder(orderId, data, source, expectedTradeNo);
  } catch (e) {
    code = e instanceof PaymentError ? e.code : e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" ? "TRADE_REUSED" : "INTERNAL_ERROR";
    const terminal = ["ORDER_MISMATCH", "TRADE_MISMATCH", "TRADE_REUSED", "INVALID_AMOUNT", "INVALID_TRADE"].includes(code);
    // Never overwrite a concurrently successful settlement.
    const retryWindow = order.createdAt.getTime() + 7 * 86400000 > now.getTime();
    const retryAt = retryWindow ? new Date(now.getTime() + Math.min(3600000, 60000 * 2 ** Math.min(order.checkAttempts, 6))) : null;
    await prisma.$transaction(async tx => {
      const result = await tx.paymentOrder.updateMany({ where: { id: orderId, fulfilledAt: null, lastCheckedAt: now }, data: {
        lastErrorCode: code === "NOT_PAID" ? null : code, nextCheckAt: terminal ? null : retryAt,
        ...(terminal ? { status: "review" } : order.status === "pending" && order.expiresAt && order.expiresAt < now ? { status: "expired" } : {}),
      } });
      if (result.count) await tx.paymentEvent.create({ data: { orderId, kind: "gateway_checked", source, code } });
    });
    if (source === "notify") throw new PaymentError(code, code === "NOT_PAID" ? 503 : terminal ? 409 : 503);
    return prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
  }
}

export async function handleZpayNotification(fields: Record<string, string>) {
  const config = zpayConfig();
  if (!verifyZpay(fields, config.key) || fields.pid !== config.pid) throw new PaymentError("INVALID_SIGNATURE", 400);
  const order = await prisma.paymentOrder.findUnique({ where: { orderNo: fields.out_trade_no } });
  if (!order || order.channel !== "zpay" || order.merchantId !== fields.pid) throw new PaymentError("ORDER_NOT_FOUND", 404);
  let matches = false;
  try { matches = fields.trade_status === "TRADE_SUCCESS" && fields.type === order.paymentMethod && moneyInCents(fields.money) === order.amountCny * 100; } catch { /* classified as mismatch */ }
  if (!matches) {
    // At most one event per order/code: signed anomalous notifications remain reviewable without replay growth.
    await serializable(async tx => {
      const prior = await tx.paymentEvent.findFirst({ where: { orderId: order.id, kind: "notification_rejected", code: "ORDER_MISMATCH" } });
      if (!prior) await tx.paymentEvent.create({ data: { orderId: order.id, kind: "notification_rejected", source: "notify", code: "ORDER_MISMATCH" } });
    });
    throw new PaymentError("ORDER_MISMATCH", 409);
  }
  // The callback is a hint: verify directly with the gateway before granting anything.
  return reconcileOrder(order.id, "notify", fields.trade_no);
}

export async function reconcileDueOrders(limit = 25) {
  const rows = await prisma.paymentOrder.findMany({ where: { channel: "zpay", status: { in: ["pending", "expired", "review"] }, nextCheckAt: { lte: new Date() } }, orderBy: { nextCheckAt: "asc" }, take: Math.min(100, Math.max(1, limit)), select: { id: true } });
  const results: { id: string; status: string; code: string }[] = [];
  for (const row of rows) {
    try { const result = await reconcileOrder(row.id, "worker"); results.push({ id: row.id, status: result.status, code: result.lastErrorCode ?? "OK" }); }
    catch { results.push({ id: row.id, status: "error", code: "CHECK_FAILED" }); }
  }
  return results;
}
