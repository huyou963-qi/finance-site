import { NextRequest, NextResponse } from "next/server";
import { requestAdminPasswordReset, verifyAdminCredentials } from "@/lib/auth";
import { requireAdminPermission } from "@/lib/auth/requireAdmin";
import { performAdminUserAction } from "@/lib/auth/adminUsers";
import { buildPasswordResetUrl, sendPasswordResetEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminPermission(req, "users:write");
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      action?: "suspend" | "reactivate" | "close" | "revoke-sessions" | "send-reset-link" | "reset-admin-mfa";
      reason?: string; adminPassword?: string; adminTotpCode?: string;
    };
    if (!body.reason?.trim()) throw new Error("请填写操作原因");
    if (body.reason.trim().length > 500) throw new Error("操作原因不能超过 500 字");
    await verifyAdminCredentials(actor.id, body.adminPassword ?? "", body.adminTotpCode ?? "");
    if (body.action === "send-reset-link") {
      if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        throw new Error("邮件服务未配置，无法发送重置链接");
      }
      const target = await requestAdminPasswordReset(id);
      const delivery = await sendPasswordResetEmail(target.email, buildPasswordResetUrl(target.token));
      if (!delivery.delivered) throw new Error("重置邮件未送达");
      await prisma.adminUserAudit.create({ data: {
        actorId: actor.id, actorUsername: actor.username,
        targetUserId: id, targetUsername: target.username,
        action: "send-reset-link", reason: body.reason.trim(),
      } });
      return NextResponse.json({ ok: true });
    }
    if (body.action !== "suspend" && body.action !== "reactivate" && body.action !== "close" && body.action !== "revoke-sessions" && body.action !== "reset-admin-mfa") {
      throw new Error("操作类型不正确");
    }
    return NextResponse.json(await performAdminUserAction(id, actor, body.action, body.reason));
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
