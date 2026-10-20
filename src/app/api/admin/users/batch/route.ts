import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCredentials } from "@/lib/auth";
import { requireAdminPermission } from "@/lib/auth/requireAdmin";
import { commitBatch, previewBatch } from "@/lib/auth/adminBatch";

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAdminPermission(req, "users:batch");
    const body = (await req.json()) as { mode?: string; filters: Record<string, string>; action: "add" | "remove"; tag: string; token?: string; reason?: string; adminPassword?: string; adminTotpCode?: string };
    if (body.mode === "preview") return NextResponse.json(await previewBatch(actor, body));
    if (body.mode !== "commit") throw new Error("操作类型不正确");
    await verifyAdminCredentials(actor.id, body.adminPassword ?? "", body.adminTotpCode ?? "");
    return NextResponse.json(await commitBatch(actor, body, body.token ?? "", body.reason ?? ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败";
    return NextResponse.json({ error: message }, { status: message.includes("未登录") ? 401 : message.includes("权限") ? 403 : 400 });
  }
}
