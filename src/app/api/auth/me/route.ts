import { NextRequest, NextResponse } from "next/server";
import { requestSignupChannel } from "@/i18n/requestChannel";
import { localizeServerMessage, requestLocale } from "@/i18n/serverMessages";
import { getUserByRequest, getUserProfile, updateUserAccount } from "@/lib/auth";
import { requireSameOrigin, sameOriginErrorResponse } from "@/lib/http/sameOrigin";

export async function GET(req: NextRequest) {
  const user = await getUserByRequest(req);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const profile = await getUserProfile(user.id);
  return NextResponse.json({ user: profile });
}

export async function PATCH(req: NextRequest) {
  const t = (message: string) => localizeServerMessage(message, requestLocale(req));
  try {
    requireSameOrigin(req);
    const me = await getUserByRequest(req);
    if (!me) return NextResponse.json({ error: t("请先登录") }, { status: 401 });
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
      { currentPassword: body.currentPassword, channel: await requestSignupChannel(req) },
    );
    return NextResponse.json({ user });
  } catch (e) {
    const originErr = sameOriginErrorResponse(e);
    if (originErr) return NextResponse.json({ error: t(originErr.error) }, { status: originErr.status });
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: t(message) }, { status: 400 });
  }
}
