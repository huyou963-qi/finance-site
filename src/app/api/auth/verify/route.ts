import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { token?: string };
    const user = await verifyRegistrationToken(body.token ?? "");
    return NextResponse.json({
      ok: true,
      user: { username: user.username, email: user.email, phone: user.phone },
      message: "邮箱确认成功，账号已激活，请登录",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
