import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest, updateUserAccount } from "@/lib/auth";

async function requireAdmin(req: NextRequest) {
  const me = await getUserByRequest(req);
  if (!me) throw new Error("未登录");
  if (me.role !== "admin") throw new Error("无管理员权限");
  return me;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      email?: string;
      phone?: string;
      password?: string;
      role?: "admin" | "user";
      plan?: "standard" | "pro";
    };
    const user = await updateUserAccount(
      id,
      {
        email: body.email,
        phone: body.phone,
        password: body.password,
        role: body.role,
        plan: body.plan,
      },
      { byAdmin: true },
    );
    return NextResponse.json({ user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    const code = msg.includes("未登录") ? 401 : msg.includes("权限") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
