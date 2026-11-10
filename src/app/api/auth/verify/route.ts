import { NextRequest, NextResponse } from "next/server";
import { localizeServerMessage, requestLocale } from "@/i18n/serverMessages";
import { verifyRegistrationToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const t = (message: string) => localizeServerMessage(message, requestLocale(req));
  try {
    const body = (await req.json()) as { token?: string };
    const user = await verifyRegistrationToken(body.token ?? "");
    return NextResponse.json({
      ok: true,
      user: { username: user.username, email: user.email, phone: user.phone },
      message: t("邮箱确认成功，账号已激活，请登录"),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: t(message) }, { status: 400 });
  }
}
