import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function defaultMemberMonthlyPoints() {
  const value = Number(process.env.RESEARCH_MCP_MONTHLY_POINTS);
  return Number.isSafeInteger(value) && value > 0 ? value : 1000;
}

function billingPeriod(now: Date) {
  const year = now.getUTCFullYear(), month = now.getUTCMonth();
  return { start: new Date(Date.UTC(year, month, 1)), resetAt: new Date(Date.UTC(year, month + 1, 1)) };
}

type QuotaAccount = { researchMcpMonthlyPoints: number | null };
const quotaSelect = { researchMcpMonthlyPoints: true } as const;

function memberUsage(account: QuotaAccount | null, used: number, resetAt: Date) {
  const limit = account?.researchMcpMonthlyPoints ?? defaultMemberMonthlyPoints();
  return { used, limit, remaining: Math.max(0, limit - used), resetAt };
}

export async function getMemberUsage(userId: string, account?: QuotaAccount) {
  const { start, resetAt } = billingPeriod(new Date());
  const [row, quotaAccount] = await Promise.all([
    prisma.researchMcpUsage.findUnique({ where: { userId_month: { userId, month: start } } }),
    account ?? prisma.user.findUnique({ where: { id: userId }, select: quotaSelect }),
  ]);
  return memberUsage(quotaAccount, row?.used ?? 0, resetAt);
}

/** Shared by AI and web jobs. The account lock covers first use and concurrent charges. */
export async function chargeMemberUsage(tx: Prisma.TransactionClient, userId: string, cost: number, now?: Date) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 195673))::text`;
  const { start, resetAt } = billingPeriod(now ?? new Date());
  const where = { userId_month: { userId, month: start } };
  const row = await tx.researchMcpUsage.findUnique({ where });
  const account = await tx.user.findUnique({ where: { id: userId }, select: quotaSelect });
  const usage = memberUsage(account, row?.used ?? 0, resetAt);
  if (cost > usage.remaining) return { charged: false, usage };

  await tx.researchMcpUsage.upsert({
    where, create: { userId, month: start, used: cost }, update: { used: { increment: cost } },
  });
  return { charged: true, usage };
}
