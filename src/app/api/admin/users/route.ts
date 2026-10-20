import { NextRequest, NextResponse } from "next/server";
import { registerUser, verifyAdminCredentials } from "@/lib/auth";
import { listAdminUsers } from "@/lib/auth/adminUsers";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAdminPermission } from "@/lib/auth/requireAdmin";
import { isStaffRole, type Role } from "@/lib/auth/types";

export async function GET(req: NextRequest) {
  try {
    await requireAdminPermission(req, "users:read");
    return NextResponse.json(await listAdminUsers(req.nextUrl.searchParams));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    const code = msg.includes("未登录") ? 401 : msg.includes("权限") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status: code });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      username?: string;
      password?: string;
      email?: string;
      phone?: string;
      role?: Role;
      plan?: "standard" | "pro";
      adminPassword?: string;
      adminTotpCode?: string;
      reason?: string;
    };
    if (!body.reason?.trim()) throw new Error("请填写创建原因");
    if (body.reason.trim().length > 500) throw new Error("创建原因不能超过 500 字");
    const actor = await requireAdminPermission(req, "users:write");
    await verifyAdminCredentials(actor.id, body.adminPassword ?? "", body.adminTotpCode ?? "");
    const user = await prisma.$transaction(async (tx) => {
      const created = await registerUser(
        body.username ?? "",
        body.password ?? "",
        body.role && isStaffRole(body.role) ? body.role : "user",
        body.email ?? "",
        body.phone ?? "",
        undefined,
        body.plan === "pro" ? "pro" : "standard",
        tx,
      );
      await tx.adminUserAudit.create({ data: {
        actorId: actor.id, actorUsername: actor.username, targetUserId: created.id,
        targetUsername: created.username, action: "create", reason: body.reason!.trim(),
        after: { email: created.email, phone: created.phone, role: created.role, plan: created.plan, status: "active" },
      } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    const code = msg.includes("未登录") ? 401 : msg.includes("权限") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
