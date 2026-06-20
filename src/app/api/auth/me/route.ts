import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest, getUserProfile, updateUserAccount } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getUserByRequest(req);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const profile = await getUserProfile(user.id);
  return NextResponse.json({ user: profile });
}

export async function PATCH(req: NextRequest) {
  try {
    const me = await getUserByRequest(req);
    if (!me) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = (await req.json()) as {
      email?: string;
      phone?: string;
      password?: string;
      currentPassword?: string;
    };
    const user = await updateUserAccount(
      me.id,
      {
        email: body.email,
        phone: body.phone,
        password: body.password,
      },
      { currentPassword: body.currentPassword },
    );
    return NextResponse.json({ user });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
