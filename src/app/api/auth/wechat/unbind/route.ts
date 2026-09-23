import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest, getUserProfile, unbindWechatFromUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const me = await getUserByRequest(req);
    if (!me) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    await unbindWechatFromUser(me.id);
    return NextResponse.json({ user: await getUserProfile(me.id) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
