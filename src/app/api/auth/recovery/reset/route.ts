import { NextRequest, NextResponse } from "next/server";
import { localizeServerMessage, requestLocale } from "@/i18n/serverMessages";
import { resetPasswordWithToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const t = (message: string) => localizeServerMessage(message, requestLocale(req));
  try {
    const body = (await req.json()) as { token?: string; password?: string };
    await resetPasswordWithToken(body.token ?? "", body.password ?? "");
    return NextResponse.json({ ok: true, message: t("密码已重置，请使用新密码登录") });
  } catch (error) {
    const message = error instanceof Error ? error.message : "重置失败";
    return NextResponse.json({ error: t(message) }, { status: 400 });
  }
}
