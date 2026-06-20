import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest, listUsers, registerUser } from "@/lib/auth";

async function requireAdmin(req: NextRequest) {
  const me = await getUserByRequest(req);
  if (!me) throw new Error("未登录");
  if (me.role !== "admin") throw new Error("无管理员权限");
  return me;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const users = await listUsers();
    return NextResponse.json({ users });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    const code = msg.includes("未登录") ? 401 : 403;
    return NextResponse.json({ error: msg }, { status: code });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json()) as {
      username?: string;
      password?: string;
      email?: string;
      phone?: string;
      role?: "admin" | "user";
      plan?: "standard" | "pro";
    };
    const user = await registerUser(
      body.username ?? "",
      body.password ?? "",
      body.role === "admin" ? "admin" : "user",
      body.email ?? "",
      body.phone ?? "",
      undefined,
      body.plan === "pro" ? "pro" : "standard",
    );
    return NextResponse.json({ user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    const code = msg.includes("未登录") ? 401 : msg.includes("权限") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
