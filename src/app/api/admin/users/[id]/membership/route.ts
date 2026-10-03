import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCredentials } from "@/lib/auth";
import { requireAdminPermission } from "@/lib/auth/requireAdmin";
import { adjustCredits, changeMembership } from "@/lib/auth/adminMembership";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminPermission(req, "membership:write");
    const { id } = await ctx.params;
    const body = (await req.json()) as { kind?: string; action?: "set" | "extend" | "revoke"; expiresOn?: string; days?: number; delta?: number; reason?: string; adminPassword?: string; adminTotpCode?: string };
    await verifyAdminCredentials(actor.id, body.adminPassword ?? "", body.adminTotpCode ?? "");
    if (body.kind === "credits") return NextResponse.json(await adjustCredits(id, actor, body));
    if (body.kind === "membership" && body.action) return NextResponse.json(await changeMembership(id, actor, { ...body, action: body.action }));
    throw new Error("操作类型不正确");
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败";
    return NextResponse.json({ error: message }, { status: message.includes("未登录") ? 401 : message.includes("权限") ? 403 : 400 });
  }
}
