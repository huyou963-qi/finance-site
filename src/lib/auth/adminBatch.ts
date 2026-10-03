import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildAdminUserWhere } from "@/lib/auth/adminUsers";

type BatchInput = { filters: Record<string, string>; action: "add" | "remove"; tag: string };
type Actor = { id: string; username: string; role: string };

function validated(input: BatchInput) {
  const tag = input.tag?.trim();
  if (!tag || tag.length > 32 || !/^[\p{L}\p{N}_-]+$/u.test(tag)) throw new Error("标签须为 1–32 位汉字、字母、数字、下划线或连字符");
  if (input.action !== "add" && input.action !== "remove") throw new Error("操作类型不正确");
  const params = new URLSearchParams(input.filters);
  return { tag, where: buildAdminUserWhere(params) };
}

function sign(payload: string): string {
  const key = process.env.ADMIN_MFA_ENCRYPTION_KEY;
  if (!key) throw new Error("管理员安全密钥未配置");
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

export async function previewBatch(actor: Actor, input: BatchInput) {
  const { tag, where } = validated(input);
  const users = await prisma.user.findMany({ where, select: { id: true, username: true, role: true }, orderBy: { id: "asc" }, take: 501 });
  if (users.length > 500) throw new Error("单次最多处理 500 位用户，请缩小筛选范围");
  if (actor.role !== "admin" && users.some((user) => user.role !== "user")) throw new Error("不能批量修改后台人员标签");
  const payload = JSON.stringify({ actorId: actor.id, action: input.action, tag, ids: users.map((user) => user.id), expires: Date.now() + 5 * 60_000 });
  return { count: users.length, sample: users.slice(0, 10).map((user) => user.username), token: `${Buffer.from(payload).toString("base64url")}.${sign(payload)}` };
}

export async function commitBatch(actor: Actor, input: BatchInput, token: string, reason: string) {
  const { tag, where } = validated(input);
  const why = reason.trim();
  if (!why || why.length > 500) throw new Error("请填写不超过 500 字的操作原因");
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new Error("预览已失效，请重新预览");
  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("预览已失效，请重新预览");
  const preview = JSON.parse(payload) as { actorId: string; action: string; tag: string; ids: string[]; expires: number };
  if (preview.actorId !== actor.id || preview.action !== input.action || preview.tag !== tag || preview.expires < Date.now()) throw new Error("预览已失效，请重新预览");
  return prisma.$transaction(async (tx) => {
    const users = await tx.user.findMany({ where, select: { id: true, username: true, role: true, tags: true }, orderBy: { id: "asc" }, take: 501 });
    if (users.length > 500 || users.map((user) => user.id).join("|") !== preview.ids.join("|")) throw new Error("筛选结果已变化，请重新预览");
    if (actor.role !== "admin" && users.some((user) => user.role !== "user")) throw new Error("不能批量修改后台人员标签");
    for (const user of users) {
      const tags = input.action === "add" ? [...new Set([...user.tags, tag])] : user.tags.filter((value) => value !== tag);
      if (tags.join("|") === user.tags.join("|")) continue;
      await tx.user.update({ where: { id: user.id }, data: { tags } });
      await tx.adminUserAudit.create({ data: { actorId: actor.id, actorUsername: actor.username, targetUserId: user.id, targetUsername: user.username,
        action: input.action === "add" ? "tag-add" : "tag-remove", reason: why, before: { tags: user.tags }, after: { tags } } });
    }
    return { matched: users.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
