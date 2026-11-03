import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { billingConfigSchema, defaultBillingConfig, quotePrice } from "./config";
import type { ProductType } from "./pricing";
import { PaymentError } from "./zpay";

export async function readBillingConfig(db: Prisma.TransactionClient = prisma) {
  const row = await db.billingConfiguration.findUnique({ where: { id: "default" } });
  return { revision: row?.revision ?? 0, draft: row ? billingConfigSchema.parse(row.draft) : defaultBillingConfig, live: row ? billingConfigSchema.parse(row.live) : defaultBillingConfig };
}
export async function audienceForUser(db: Prisma.TransactionClient, userId?: string) {
  if (!userId) return { audience: "guest" as const, firstAvailable: false };
  const paid = await db.paymentOrder.findFirst({ where: { userId, productType: { in: ["pro_month", "pro_quarter", "pro_year"] }, paidAt: { not: null } }, select: { id: true } });
  const reserved = await db.paymentOrder.findFirst({ where: { userId, status: "pending", expiresAt: { gt: new Date() }, pricingSnapshot: { path: ["firstPurchaseDiscount"], equals: true } }, select: { id: true } });
  return { audience: paid ? "renew" as const : "new" as const, firstAvailable: !reserved };
}
export async function quoteForOrder(db: Prisma.TransactionClient, userId: string, product: ProductType) {
  const config = await readBillingConfig(db);
  const { audience, firstAvailable } = await audienceForUser(db, userId);
  const quote = quotePrice(config.live, config.revision, product, audience, firstAvailable);
  if (!quote.enabled) throw new PaymentError("PRODUCT_UNAVAILABLE", 409);
  return quote;
}
