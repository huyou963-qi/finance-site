import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { MarketError } from "@/lib/market/schema";

const accountConcurrency = 2;
const callsPerMinute = 20;
const minuteMs = 60_000;
const leaseMs = 5 * minuteMs;

function positiveInt(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
const monthlyLimit = () => positiveInt(process.env.RESEARCH_MCP_MONTHLY_POINTS, 1000);
const globalConcurrency = () => positiveInt(process.env.RESEARCH_MCP_GLOBAL_CONCURRENCY, 4);

function billingPeriod(now: Date) {
  const year = now.getUTCFullYear(), month = now.getUTCMonth();
  return { start: new Date(Date.UTC(year, month, 1)), resetAt: new Date(Date.UTC(year, month + 1, 1)) };
}

export async function getResearchUsage(userId: string) {
  const { start, resetAt } = billingPeriod(new Date());
  const row = await prisma.researchMcpUsage.findUnique({ where: { userId_month: { userId, month: start } } });
  const limit = monthlyLimit(), used = row?.used ?? 0;
  return { used, limit, remaining: Math.max(0, limit - used), resetAt, accountConcurrency, callsPerMinute };
}

async function reserve(userId: string, cost: number) {
  return prisma.$transaction(async tx => {
    // Serialize admission across PM2 processes, then release the lock before running the tool.
    const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(183661, 1) AS locked`;
    if (!lock?.locked) throw new MarketError("BUSY", "服务繁忙，请稍后重试");
    const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const cutoff = new Date(now.getTime() - minuteMs);
    await tx.researchMcpCall.deleteMany({ where: { startedAt: { lt: cutoff }, leaseUntil: { lte: now } } });

    const recent = await tx.researchMcpCall.count({ where: { userId, startedAt: { gte: cutoff } } });
    if (recent >= callsPerMinute) throw new MarketError("RATE_LIMITED", "调用过于频繁，请稍后重试");
    const active = await tx.researchMcpCall.groupBy({ by: ["userId"], where: { leaseUntil: { gt: now } }, _count: { _all: true } });
    if ((active.find(row => row.userId === userId)?._count._all ?? 0) >= accountConcurrency) {
      throw new MarketError("ACCOUNT_BUSY", "当前账号有查询正在运行，请稍后重试");
    }
    if (active.reduce((count, row) => count + row._count._all, 0) >= globalConcurrency()) {
      throw new MarketError("BUSY", "服务繁忙，请稍后重试");
    }

    if (cost > 0) {
      const { start, resetAt } = billingPeriod(now);
      const where = { userId_month: { userId, month: start } };
      const row = await tx.researchMcpUsage.findUnique({ where });
      if ((row?.used ?? 0) + cost > monthlyLimit()) {
        throw new MarketError("QUOTA_EXCEEDED", `本期额度不足，下次重置 ${resetAt.toISOString()}`);
      }
      await tx.researchMcpUsage.upsert({ where, create: { userId, month: start, used: cost }, update: { used: { increment: cost } } });
    }

    const id = randomUUID();
    await tx.researchMcpCall.create({ data: { id, userId, startedAt: now, leaseUntil: new Date(now.getTime() + leaseMs) } });
    return id;
  }, { timeout: 3000, maxWait: 1000 });
}

export async function withResearchBudget<T>(userId: string, cost: number, run: () => Promise<T>): Promise<T> {
  const id = await reserve(userId, cost);
  try {
    return await run();
  } finally {
    await prisma.researchMcpCall.updateMany({ where: { id }, data: { leaseUntil: new Date(0) } })
      .catch(error => console.error("[research-mcp] lease release failed", error));
  }
}
