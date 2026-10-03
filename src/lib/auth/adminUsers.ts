import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { updateUserAccount } from "@/lib/auth";
import { isStaffRole, type Role } from "@/lib/auth/types";

type AdminActor = { id: string; username: string };

function maskEmail(email: string | null): string {
  if (!email) return "—";
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone: string | null): string {
  return phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : "—";
}

function snapshot(user: {
  email: string | null;
  phone: string | null;
  role: string;
  tags: string[];
  plan: string;
  planExpiresAt: Date | null;
  trialEndsAt: Date | null;
  status: string;
  suspensionReason: string | null;
}) {
  return {
    email: user.email,
    phone: user.phone,
    role: user.role,
    tags: user.tags,
    plan: user.plan,
    planExpiresAt: user.planExpiresAt?.toISOString() ?? null,
    trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
    status: user.status,
    suspensionReason: user.suspensionReason,
  };
}

function safeDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("日期格式不正确");
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime()) || new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10) !== value) throw new Error("日期格式不正确");
  return date;
}

export function buildAdminUserWhere(params: URLSearchParams): Prisma.UserWhereInput {
  const query = (params.get("q") ?? "").trim().slice(0, 100);
  const role = params.get("role") ?? "";
  const status = params.get("status") ?? "";
  const membership = params.get("membership") ?? "";
  const from = safeDate(params.get("from"));
  const to = safeDate(params.get("to"));
  const expiresFrom = safeDate(params.get("expiresFrom"));
  const expiresTo = safeDate(params.get("expiresTo"));
  const toExclusive = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000) : undefined;
  const expiresToExclusive = expiresTo ? new Date(expiresTo.getTime() + 24 * 60 * 60 * 1000) : undefined;
  if (from && to && from > to) throw new Error("注册起始日期不能晚于结束日期");
  if (expiresFrom && expiresTo && expiresFrom > expiresTo) throw new Error("到期起始日期不能晚于结束日期");
  const now = new Date();
  const conditions: Prisma.UserWhereInput[] = [];
  if (query) conditions.push({ OR: [
    { id: query },
    { username: { contains: query, mode: "insensitive" } },
    { email: { contains: query, mode: "insensitive" } },
    { phone: { contains: query } },
  ] });
  if (["admin", "admin_support", "admin_membership", "admin_orders", "user"].includes(role)) conditions.push({ role });
  const tag = (params.get("tag") ?? "").trim();
  if (tag) conditions.push({ tags: { has: tag } });
  if (status === "active" || status === "suspended" || status === "closed") conditions.push({ status });
  if (from || to) conditions.push({ createdAt: { gte: from, lt: toExclusive } });
  if (expiresFrom || expiresTo) conditions.push({ planExpiresAt: { gte: expiresFrom, lt: expiresToExclusive } });
  if (membership === "paid") conditions.push({ plan: "pro", OR: [{ planExpiresAt: null }, { planExpiresAt: { gt: now } }] });
  if (membership === "trial") conditions.push({ trialEndsAt: { gt: now }, NOT: { plan: "pro", OR: [{ planExpiresAt: null }, { planExpiresAt: { gt: now } }] } });
  if (membership === "standard") conditions.push({ AND: [
    { OR: [{ plan: "standard" }, { plan: "pro", planExpiresAt: { lte: now } }] },
    { OR: [{ trialEndsAt: null }, { trialEndsAt: { lte: now } }] },
  ] });
  return { AND: conditions };
}

export async function listAdminUsers(params: URLSearchParams) {
  const page = Math.max(1, Math.min(100_000, Math.floor(Number(params.get("page")) || 1)));
  const pageSize = Math.max(10, Math.min(100, Math.floor(Number(params.get("pageSize")) || 25)));
  const where = buildAdminUserWhere(params);
  const orderBy: Prisma.UserOrderByWithRelationInput = params.get("sort") === "oldest"
    ? { createdAt: "asc" }
    : { createdAt: "desc" };
  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where, orderBy, skip: (page - 1) * pageSize, take: pageSize,
      select: {
        id: true, username: true, email: true, phone: true, role: true, tags: true, status: true,
        plan: true, planExpiresAt: true, trialEndsAt: true, creditBalance: true,
        createdAt: true, lastLoginAt: true,
      },
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    users: users.map((user) => ({
      id: user.id,
      username: user.username,
      email: maskEmail(user.email),
      phone: maskPhone(user.phone),
      role: user.role,
      tags: user.tags,
      status: user.status,
      plan: user.plan,
      planExpiresAt: user.planExpiresAt?.toISOString() ?? null,
      trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
      creditBalance: user.creditBalance,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    })),
  };
}

export async function getAdminUserDetail(userId: string, viewerRole: string = "admin") {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, username: true, email: true, phone: true, emailVerifiedAt: true,
      wechatOpenId: true, role: true, tags: true, adminTotpSecret: true, status: true,
      suspendedAt: true, suspensionReason: true, plan: true, planExpiresAt: true,
      trialEndsAt: true, creditBalance: true, createdAt: true, lastLoginAt: true,
    },
  });
  if (!user) throw new Error("用户不存在");
  const [sessionCount, orders, credits, audits, authEvents] = await Promise.all([
    prisma.session.count({ where: { userId, expiresAt: { gt: new Date() } } }),
    prisma.paymentOrder.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.creditLedgerEntry.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.adminUserAudit.findMany({ where: { targetUserId: userId }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.accountAuthEvent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const creditOrderIds = credits.map((entry) => entry.orderId).filter((value): value is string => Boolean(value));
  const creditOrders = creditOrderIds.length ? await prisma.paymentOrder.findMany({ where: { id: { in: creditOrderIds } }, select: { id: true, orderNo: true } }) : [];
  const orderNoById = new Map(creditOrders.map((order) => [order.id, order.orderNo]));
  return {
    user: {
      id: user.id,
      username: user.username,
      email: viewerRole === "admin" ? user.email ?? "" : maskEmail(user.email),
      phone: viewerRole === "admin" ? user.phone ?? "" : maskPhone(user.phone),
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      wechatBound: !!user.wechatOpenId,
      role: user.role,
      tags: user.tags,
      adminMfaEnabled: !!user.adminTotpSecret,
      status: user.status,
      suspendedAt: user.suspendedAt?.toISOString() ?? null,
      suspensionReason: user.suspensionReason,
      plan: user.plan,
      planExpiresAt: user.planExpiresAt?.toISOString() ?? null,
      trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
      creditBalance: user.creditBalance,
      sessionCount,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    },
    orders: orders.map((order) => ({ orderNo: order.orderNo, productType: order.productType, status: order.status, amountCny: order.amountCny, paidAt: order.paidAt?.toISOString() ?? null, confirmedBy: order.confirmedBy, createdAt: order.createdAt.toISOString() })),
    credits: credits.map((entry) => ({ reason: entry.reason, delta: entry.delta, balanceAfter: entry.balanceAfter, orderNo: entry.orderId ? orderNoById.get(entry.orderId) ?? entry.orderId : null, note: entry.note, createdAt: entry.createdAt.toISOString() })),
    audits: audits.map((entry) => ({ action: entry.action, actorUsername: entry.actorUsername, reason: entry.reason, before: viewerRole === "admin" ? entry.before : null, after: viewerRole === "admin" ? entry.after : null, createdAt: entry.createdAt.toISOString() })),
    authEvents: authEvents.map((entry) => ({ kind: entry.kind, createdAt: entry.createdAt.toISOString() })),
  };
}

async function protectAdmin(tx: Prisma.TransactionClient, userId: string, actorId: string) {
  if (userId === actorId) throw new Error("不能停用或撤销自己的管理员权限");
  const count = await tx.user.count({ where: { role: "admin", status: "active" } });
  if (count <= 1) throw new Error("不能停用或撤销最后一个有效管理员");
}

export async function updateAdminUser(
  userId: string,
  actor: AdminActor,
  patch: { email?: string; phone?: string; role?: Role },
  reason: string,
) {
  if (!reason.trim()) throw new Error("请填写修改原因");
  if (reason.trim().length > 500) throw new Error("修改原因不能超过 500 字");
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: userId } });
    if (!before) throw new Error("用户不存在");
    if (before.status === "closed") throw new Error("已关闭账号不能修改");
    if (patch.role === "admin" && !before.passHash) throw new Error("该用户尚未设置密码，不能授予管理员角色");
    if (before.role === "admin" && patch.role && patch.role !== "admin") await protectAdmin(tx, userId, actor.id);
    await updateUserAccount(userId, patch, { byAdmin: true, tx });
    const after = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (before.role !== after.role || before.email !== after.email || before.phone !== after.phone) {
      await tx.session.deleteMany({ where: { userId } });
    }
    if (isStaffRole(before.role) && !isStaffRole(after.role)) {
      await tx.adminMfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.adminMfaChallenge.deleteMany({ where: { userId } });
    }
    await tx.adminUserAudit.create({ data: {
      actorId: actor.id, actorUsername: actor.username, targetUserId: userId,
      targetUsername: before.username, action: "update", reason: reason.trim(),
      before: snapshot(before), after: snapshot(after),
    } });
    return { id: after.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function performAdminUserAction(
  userId: string,
  actor: AdminActor,
  action: "suspend" | "reactivate" | "close" | "revoke-sessions" | "reset-admin-mfa",
  reason: string,
) {
  if (!reason.trim()) throw new Error("请填写操作原因");
  if (reason.trim().length > 500) throw new Error("操作原因不能超过 500 字");
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: userId } });
    if (!before) throw new Error("用户不存在");
    if (before.status === "closed" && action !== "revoke-sessions") throw new Error("账号已关闭，不能执行该操作");
    if (action === "reset-admin-mfa") {
      if (!isStaffRole(before.role)) throw new Error("目标账号不是管理员");
      if (userId === actor.id) throw new Error("不能重置自己的双重验证，请使用一次性恢复码");
    }
    if ((action === "suspend" || action === "close") && before.role === "admin") await protectAdmin(tx, userId, actor.id);
    if (action === "suspend" && before.status !== "active") throw new Error("用户已停用");
    if (action === "reactivate" && before.status !== "suspended") throw new Error("用户未停用");
    if (action === "close" && before.status === "closed") throw new Error("用户已关闭");
    if (action === "suspend") {
      await tx.user.update({ where: { id: userId }, data: { status: "suspended", suspendedAt: new Date(), suspensionReason: reason.trim() } });
    } else if (action === "reactivate") {
      await tx.user.update({ where: { id: userId }, data: { status: "active", suspendedAt: null, suspensionReason: null } });
    } else if (action === "close") {
      await tx.user.update({ where: { id: userId }, data: { status: "closed", suspendedAt: new Date(), suspensionReason: reason.trim() } });
    } else if (action === "reset-admin-mfa") {
      await tx.user.update({ where: { id: userId }, data: { adminTotpSecret: null } });
      await tx.adminMfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.adminMfaChallenge.deleteMany({ where: { userId } });
    }
    if (action === "suspend" || action === "close" || action === "revoke-sessions" || action === "reset-admin-mfa") {
      await tx.session.deleteMany({ where: { userId } });
    }
    const after = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await tx.adminUserAudit.create({ data: {
      actorId: actor.id, actorUsername: actor.username, targetUserId: userId,
      targetUsername: before.username, action, reason: reason.trim(),
      before: snapshot(before), after: snapshot(after),
    } });
    return { id: after.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
