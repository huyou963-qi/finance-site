import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission, adminErrorResponse } from "@/lib/auth/requireAdmin";
import { verifyAdminCredentials } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requirePaymentOrigin } from "@/lib/billing/http";
import { billingConfigSchema } from "@/lib/billing/config";
import { readBillingConfig } from "@/lib/billing/configStore";
import { serializable } from "@/lib/billing/fulfillment";
import { isPaymentError } from "@/lib/billing/zpay";
const schema = z.object({ action: z.enum(["save", "publish", "stop"]), revision: z.number().int().nonnegative(), config: billingConfigSchema, reason: z.string().trim().min(1).max(500), adminPassword: z.string().min(1).max(256), adminTotpCode: z.string().regex(/^\d{6}$/) }).strict();
export async function GET(req: NextRequest) {
  try {
    await requireAdminPermission(req, "membership:write");
    const config = await readBillingConfig();
    const history = await prisma.billingConfigurationAudit.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, actorUsername: true, action: true, reason: true, createdAt: true } });
    return NextResponse.json({ ...config, history }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { const error = adminErrorResponse(e); return NextResponse.json({ error: error.message }, { status: error.status }); }
}
export async function PUT(req: NextRequest) {
  try {
    requirePaymentOrigin(req);
    const admin = await requireAdminPermission(req, "membership:write");
    const text = await req.text();
    if (text.length > 10000) return NextResponse.json({ error: "配置过大" }, { status: 400 });
    let json; try { json = JSON.parse(text); } catch { return NextResponse.json({ error: "配置格式无效" }, { status: 400 }); }
    const parsed = schema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "配置无效" }, { status: 400 });
    const input = parsed.data;
    try { await verifyAdminCredentials(admin.id, input.adminPassword, input.adminTotpCode); }
    catch { return NextResponse.json({ error: "管理员密码或动态码验证失败，请检查后重试。" }, { status: 403 }); }
    const result = await serializable(async tx => {
      const before = await readBillingConfig(tx);
      if (before.revision !== input.revision) return null;
      const live = input.action === "publish" ? input.config : input.action === "stop" ? { ...before.live, campaign: { ...before.live.campaign, enabled: false } } : before.live;
      const draft = input.action === "stop" ? { ...before.draft, campaign: { ...before.draft.campaign, enabled: false } } : input.config;
      const data = { revision: before.revision + 1, draft, live };
      await tx.billingConfiguration.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
      await tx.billingConfigurationAudit.create({ data: { actorId: admin.id, actorUsername: admin.username, action: input.action, reason: input.reason, before, after: data } });
      return data;
    });
    if (!result) return NextResponse.json({ error: "配置已被其他管理员更新，请重新载入后操作。" }, { status: 409 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const error = adminErrorResponse(e);
    const status = isPaymentError(e) ? e.status : error.status;
    return NextResponse.json({ error: status === 401 || status === 403 ? "无权限或管理员凭据验证失败" : status === 400 ? "请求无效" : "配置保存失败，请检查凭据或稍后重试" }, { status });
  }
}
