import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { username?: string; password?: string };
    const { cookie, user } = await loginUser(body.username ?? "", body.password ?? "");
    const res = NextResponse.json({ user });
    res.headers.append("Set-Cookie", cookie);
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
