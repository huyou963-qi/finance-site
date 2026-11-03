import { Prisma, type PaymentOrder } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addBillingPeriod } from "./pricing";
import { PaymentError } from "./zpay";

export async function serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: "Serializable", maxWait: 5000, timeout: 5000 }); }
    catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2034" || attempt >= 4) throw e;
      await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}

/** Caller claims the order and records evidence in this same transaction. */
export async function grantOrderEntitlement(tx: Prisma.TransactionClient, order: PaymentOrder, now: Date) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
  if (user.status !== "active") throw new PaymentError("ACCOUNT_REVIEW", 409);
  const before = { plan: user.plan, expiresAt: user.planExpiresAt?.toISOString() ?? null, credits: user.creditBalance };
  if (order.productType === "credits") {
    if (order.credits <= 0) throw new PaymentError("INVALID_PRODUCT", 409);
    const updated = await tx.user.update({ where: { id: user.id }, data: { creditBalance: { increment: order.credits } } });
    await tx.creditLedgerEntry.create({ data: { userId: user.id, reason: "purchase", delta: order.credits, balanceAfter: updated.creditBalance, orderId: order.id } });
    return { before, after: { ...before, credits: updated.creditBalance } };
  }
  if (!((order.productType === "pro_month" && order.period === "month") || (order.productType === "pro_year" && order.period === "year") || (order.productType === "pro_quarter" && order.period === "quarter"))) throw new PaymentError("INVALID_PRODUCT", 409);
  // Permanent Pro remains permanent; unused trial days are preserved on first purchase.
  let expiresAt: Date | null = null;
  if (!(user.plan === "pro" && user.planExpiresAt === null)) {
    const base = new Date(Math.max(now.getTime(), user.plan === "pro" ? user.planExpiresAt?.getTime() ?? 0 : 0, user.trialEndsAt?.getTime() ?? 0));
    expiresAt = addBillingPeriod(base, order.period as "month" | "quarter" | "year");
  }
  await tx.user.update({ where: { id: user.id }, data: { plan: "pro", planExpiresAt: expiresAt, trialEndsAt: null } });
  return { before, after: { plan: "pro", expiresAt: expiresAt?.toISOString() ?? null, credits: user.creditBalance } };
}
