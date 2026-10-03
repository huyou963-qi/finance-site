import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Actor = { id: string; username: string; role: string };

function validateReason(reason: unknown): string {
  const value = typeof reason === "string" ? reason.trim() : "";
  if (!value || value.length > 500) throw new Error("请填写不超过 500 字的操作原因");
  return value;
}

export async function changeMembership(userId: string, actor: Actor, input: {
  action: "set" | "extend" | "revoke";
  expiresOn?: string;
  days?: number;
  reason?: string;
}) {
  const reason = validateReason(input.reason);
  if (!["set", "extend", "revoke"].includes(input.action)) throw new Error("操作类型不正确");
  const now = new Date();
  let setExpiry: Date | null = null;
  if (input.action === "set") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn ?? "")) throw new Error("请填写到期日期");
    setExpiry = new Date(`${input.expiresOn}T23:59:59.999+08:00`);
    if (Number.isNaN(setExpiry.getTime()) || new Date(setExpiry.getTime() + 8 * 3600000).toISOString().slice(0, 10) !== input.expiresOn || setExpiry <= now) throw new Error("到期日期必须是晚于今天的有效日期");
    if (setExpiry.getTime() > now.getTime() + 5 * 366 * 86400000) throw new Error("到期日期不能超过五年");
  }
  if (input.action === "extend" && (!Number.isInteger(input.days) || input.days! < 1 || input.days! > 365)) throw new Error("延长天数须为 1–365");
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.status === "closed") throw new Error("用户不存在或已关闭");
    if (actor.role !== "admin" && user.role !== "user") throw new Error("不能操作后台人员的权益");
    const before = { plan: user.plan, planExpiresAt: user.planExpiresAt?.toISOString() ?? null, trialEndsAt: user.trialEndsAt?.toISOString() ?? null };
    let expiresAt = setExpiry;
    if (input.action === "extend") {
      if (user.plan === "pro" && !user.planExpiresAt) throw new Error("永久 Pro 无法按天延长，请设置明确到期日");
      const base = user.plan === "pro" && user.planExpiresAt && user.planExpiresAt > now ? user.planExpiresAt : now;
      expiresAt = new Date(base.getTime() + input.days! * 86400000);
    }
    const after = await tx.user.update({ where: { id: userId }, data: input.action === "revoke"
      ? { plan: "standard", planExpiresAt: null }
      : { plan: "pro", planExpiresAt: expiresAt, trialEndsAt: null } });
    await tx.adminUserAudit.create({ data: {
      actorId: actor.id, actorUsername: actor.username, targetUserId: userId, targetUsername: user.username,
      action: `membership-${input.action}`, reason, before,
      after: { plan: after.plan, planExpiresAt: after.planExpiresAt?.toISOString() ?? null, trialEndsAt: after.trialEndsAt?.toISOString() ?? null },
    } });
    return { plan: after.plan, planExpiresAt: after.planExpiresAt?.toISOString() ?? null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function adjustCredits(userId: string, actor: Actor, input: { delta?: number; reason?: string }) {
  const reason = validateReason(input.reason);
  const delta = input.delta;
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta!) > 10000) throw new Error("单次积分调整须为 -10000 至 10000 的非零整数");
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.status === "closed") throw new Error("用户不存在或已关闭");
    if (actor.role !== "admin" && user.role !== "user") throw new Error("不能操作后台人员的积分");
    const updated = await tx.user.update({ where: { id: userId }, data: { creditBalance: { increment: delta! } } });
    const balanceAfter = updated.creditBalance;
    if (balanceAfter < 0) throw new Error("积分余额不能为负数");
    await tx.creditLedgerEntry.create({ data: { userId, reason: "admin_adjust", delta: delta!, balanceAfter, note: `${actor.username}: ${reason}`.slice(0, 256) } });
    await tx.adminUserAudit.create({ data: { actorId: actor.id, actorUsername: actor.username, targetUserId: userId,
      targetUsername: user.username, action: "credit-adjust", reason, before: { creditBalance: balanceAfter - delta! }, after: { creditBalance: balanceAfter, delta } } });
    return { creditBalance: balanceAfter };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
