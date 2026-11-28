import type { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getUserByRequest,
  getUserAccessRecord,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chargeMemberUsage } from "@/lib/billing/memberUsage";
import { isPaidProActive, userCanAccessProFeatures } from "@/lib/billing/access";
import { consumeBacktestCredit } from "@/lib/billing/orders";

export async function requireProUser(req: NextRequest) {
  const me = await getUserByRequest(req);
  if (!me) {
    const err = new Error("请先登录");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  const access = await getUserAccessRecord(me.id);
  if (!access || !userCanAccessProFeatures(access)) {
    const err = new Error("需要 Pro 会员或试用期内访问，请前往定价页升级");
    (err as Error & { status?: number; code?: string }).status = 403;
    (err as Error & { code?: string }).code = "NEEDS_PRO";
    throw err;
  }
  return access;
}

export function proErrorResponse(e: unknown): {
  body: { error: string; code?: string };
  status: number;
} {
  const msg = e instanceof Error ? e.message : "未知错误";
  const status =
    (e as { status?: number }).status ??
    (msg.includes("请先登录") ? 401 : msg.includes("Pro") || msg.includes("积分") ? 403 : 400);
  const code = (e as { code?: string }).code;
  return { body: { error: msg, ...(code ? { code } : {}) }, status };
}

/** Queue the job and charge its usage in the same transaction. */
export async function createBacktestWithAccess<T>(
  userId: string,
  create: (tx: Prisma.TransactionClient, userId: string) => Promise<T>,
): Promise<{ run: T; usedCredit: boolean }> {
  return prisma.$transaction(async tx => {
    const access = await getUserAccessRecord(userId, tx);
    if (!access) throw Object.assign(new Error("请先登录"), { status: 401 });

    const metered = access.role !== "admin" && isPaidProActive(access);
    if (metered) {
      const { charged } = await chargeMemberUsage(tx, access.id, 1);
      if (charged) return { run: await create(tx, access.id), usedCredit: false };
    } else if (userCanAccessProFeatures(access)) {
      return { run: await create(tx, access.id), usedCredit: false };
    }

    if (access.creditBalance > 0 && await consumeBacktestCredit(tx, access.id)) {
      return { run: await create(tx, access.id), usedCredit: true };
    }
    if (metered) {
      throw Object.assign(new Error("本月会员额度已用完，下月重置"), { status: 429, code: "MEMBER_QUOTA_EXCEEDED" });
    }
    throw Object.assign(new Error("回测需要有效的 Pro 会员"), { status: 403, code: "NEEDS_PRO" });
  });
}

export function needsProJson(message?: string) {
  return NextResponse.json(
    {
      error: message ?? "需要 Pro 会员或试用期内访问，请前往定价页升级",
      code: "NEEDS_PRO",
      pricingPath: "/pricing",
    },
    { status: 403 },
  );
}
