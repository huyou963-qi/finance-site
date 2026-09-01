import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getUserByRequest,
  getUserAccessRecord,
  type Role,
} from "@/lib/auth";
import { userCanAccessProFeatures } from "@/lib/billing/access";
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

/**
 * 回测权限：Pro/试用免费；否则消耗 1 积分。
 */
export async function requireBacktestAccess(req: NextRequest): Promise<{
  id: string;
  username: string;
  role: Role;
  usedCredit: boolean;
}> {
  const me = await getUserByRequest(req);
  if (!me) {
    const err = new Error("请先登录");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  const access = await getUserAccessRecord(me.id);
  if (!access) {
    const err = new Error("请先登录");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  if (userCanAccessProFeatures(access)) {
    return { id: access.id, username: access.username, role: access.role, usedCredit: false };
  }
  if (access.creditBalance > 0) {
    await consumeBacktestCredit(access.id);
    return { id: access.id, username: access.username, role: access.role, usedCredit: true };
  }
  const err = new Error("回测需要 Pro 会员，或购买回测积分包");
  (err as Error & { status?: number; code?: string }).status = 403;
  (err as Error & { code?: string }).code = "NEEDS_PRO_OR_CREDITS";
  throw err;
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
