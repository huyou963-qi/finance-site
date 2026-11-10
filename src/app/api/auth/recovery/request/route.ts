import { NextRequest, NextResponse } from "next/server";
import { localizeServerMessage, requestLocale } from "@/i18n/serverMessages";
import { requestAccountRecovery, type AccountRecoveryKind } from "@/lib/auth";
import {
  buildPasswordResetUrl,
  sendPasswordResetEmail,
  sendUsernameRecoveryEmail,
} from "@/lib/mail";

const GENERIC_MESSAGE = "如果该邮箱已绑定账户，我们会向它发送恢复邮件，请检查收件箱和垃圾邮件。";

export async function POST(req: NextRequest) {
  const t = (message: string) => localizeServerMessage(message, requestLocale(req));
  try {
    const body = (await req.json()) as { email?: string; kind?: AccountRecoveryKind };
    if (body.kind !== "username" && body.kind !== "password") {
      return NextResponse.json({ error: t("找回类型不正确") }, { status: 400 });
    }

    const recovery = await requestAccountRecovery(body.email ?? "", body.kind);
    if (recovery) {
      if (body.kind === "username") {
        await sendUsernameRecoveryEmail(recovery.email, recovery.username, requestLocale(req));
      } else if (recovery.token) {
        const locale = requestLocale(req);
        await sendPasswordResetEmail(recovery.email, buildPasswordResetUrl(recovery.token, locale), locale);
      }
    }

    // 不暴露邮箱是否注册，也不暴露是否因 60 秒冷却而跳过发送。
    return NextResponse.json({ ok: true, message: t(GENERIC_MESSAGE) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "提交失败";
    return NextResponse.json({ error: t(message) }, { status: 400 });
  }
}
