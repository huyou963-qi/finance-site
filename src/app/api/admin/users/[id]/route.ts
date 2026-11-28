import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCredentials } from "@/lib/auth";
import {
  getAdminUserDetail, saveAdminUserChanges, updateAdminUser, validateAdminUserChanges, type AdminUserChanges,
} from "@/lib/auth/adminUsers";
import { requireSameOrigin, sameOriginErrorResponse } from "@/lib/http/sameOrigin";
import { requireAdminPermission } from "@/lib/auth/requireAdmin";
import type { Role } from "@/lib/auth/types";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAdminPermission(req, "users:read");
    const { id } = await ctx.params;
    return NextResponse.json(await getAdminUserDetail(id, actor.role));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: msg }, { status: msg === "用户不存在" ? 404 : msg.includes("未登录") ? 401 : 403 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      changes?: AdminUserChanges;
      email?: string;
      phone?: string;
      role?: Role;
      adminPassword?: string;
      adminTotpCode?: string;
      reason?: string;
    };
    if (body.changes !== undefined) {
      requireSameOrigin(req);
      const actor = await requireAdminPermission(req, "membership:write");
      validateAdminUserChanges(actor.role, body.changes);
      await verifyAdminCredentials(actor.id, body.adminPassword ?? "", body.adminTotpCode ?? "");
      const user = await saveAdminUserChanges(id, actor, body.changes, body.reason ?? "");
      return NextResponse.json({ user });
    }
    const actor = await requireAdminPermission(req, "users:write");
    await verifyAdminCredentials(actor.id, body.adminPassword ?? "", body.adminTotpCode ?? "");
    const user = await updateAdminUser(id, actor, {
        email: body.email,
        phone: body.phone,
        role: body.role,
      }, body.reason ?? "");
    return NextResponse.json({ user });
  } catch (e) {
    const origin = sameOriginErrorResponse(e);
    if (origin) return NextResponse.json({ error: origin.error }, { status: origin.status });
    const msg = e instanceof Error ? e.message : "未知错误";
    const code = msg.includes("未登录") ? 401 : msg.includes("权限") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
