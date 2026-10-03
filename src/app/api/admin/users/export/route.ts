import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCredentials } from "@/lib/auth";
import { requireAdminPermission } from "@/lib/auth/requireAdmin";
import { buildAdminUserWhere } from "@/lib/auth/adminUsers";
import { prisma } from "@/lib/prisma";
import crypto from "node:crypto";

const FILTER_KEYS = ["q", "role", "status", "membership", "tag", "from", "to", "expiresFrom", "expiresTo", "sort"] as const;

function signingKey(): string {
  const key = process.env.ADMIN_MFA_ENCRYPTION_KEY;
  if (!key) throw new Error("管理员安全密钥未配置");
  return key;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

function csvCell(value: string | number | null): string {
  const raw = String(value ?? "");
  const safe = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAdminPermission(req, "users:export");
    const body = (await req.json()) as { mode?: "preview" | "commit"; token?: string; filters?: Record<string, string>; reason?: string; adminPassword?: string; adminTotpCode?: string };
    const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, String(body.filters?.[key] ?? "").slice(0, 100)]));
    const where = buildAdminUserWhere(new URLSearchParams(filters));
    if (body.mode === "preview") {
      const matched = await prisma.user.findMany({ where, take: 5001, orderBy: { id: "asc" }, select: { id: true } });
      if (matched.length > 5000) throw new Error("单次最多导出 5000 位用户，请缩小筛选范围");
      const digest = crypto.createHash("sha256").update(matched.map((user) => user.id).join("|")).digest("hex");
      const payload = JSON.stringify({ actorId: actor.id, filters, count: matched.length, digest, expires: Date.now() + 5 * 60_000 });
      return NextResponse.json({ count: matched.length, token: `${Buffer.from(payload).toString("base64url")}.${sign(payload)}` });
    }
    if (body.mode !== "commit") throw new Error("请先预览导出范围");
    const [encoded, signature] = (body.token ?? "").split(".");
    if (!encoded || !signature) throw new Error("导出预览已失效，请重新预览");
    const payload = Buffer.from(encoded, "base64url").toString("utf8");
    const expected = sign(payload);
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("导出预览已失效，请重新预览");
    const preview = JSON.parse(payload) as { actorId: string; filters: Record<string, string>; count: number; digest: string; expires: number };
    if (preview.actorId !== actor.id || JSON.stringify(preview.filters) !== JSON.stringify(filters) || preview.expires < Date.now()) throw new Error("导出预览已失效，请重新预览");
    const reason = body.reason?.trim() ?? "";
    if (!reason || reason.length > 500) throw new Error("请填写不超过 500 字的导出原因");
    await verifyAdminCredentials(actor.id, body.adminPassword ?? "", body.adminTotpCode ?? "");
    const users = await prisma.user.findMany({ where, take: 5001, orderBy: { createdAt: "desc" },
      select: { id: true, username: true, role: true, tags: true, status: true, plan: true, planExpiresAt: true, trialEndsAt: true, creditBalance: true, createdAt: true, lastLoginAt: true } });
    const digest = crypto.createHash("sha256").update(users.map((user) => user.id).sort().join("|")).digest("hex");
    if (users.length > 5000 || users.length !== preview.count || digest !== preview.digest) throw new Error("筛选结果已变化，请重新预览");
    const header = ["用户ID", "用户名", "角色", "标签", "账号状态", "会员类型", "Pro到期", "试用到期", "积分余额", "注册时间", "最近登录"];
    const rows = users.map((user) => [user.id, user.username, user.role, user.tags.join("|"), user.status, user.plan,
      user.planExpiresAt?.toISOString() ?? "", user.trialEndsAt?.toISOString() ?? "", user.creditBalance, user.createdAt.toISOString(), user.lastLoginAt?.toISOString() ?? ""]);
    await prisma.adminUserAudit.create({ data: { actorId: actor.id, actorUsername: actor.username, targetUserId: "*", targetUsername: "批量导出",
      action: "export", reason, after: { count: users.length, filters, fields: header } } });
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导出失败";
    return NextResponse.json({ error: message }, { status: message.includes("未登录") ? 401 : message.includes("权限") ? 403 : 400 });
  }
}
