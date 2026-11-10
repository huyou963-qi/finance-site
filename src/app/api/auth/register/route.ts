import { NextRequest, NextResponse } from "next/server";
import { localizeServerMessage, requestLocale } from "@/i18n/serverMessages";
import { requestRegistrationVerification } from "@/lib/auth";
import { buildVerifyUrl, sendRegisterVerifyEmail } from "@/lib/mail";
import { requireSameOrigin, sameOriginErrorResponse } from "@/lib/http/sameOrigin";

export async function POST(req: NextRequest) {
  const t = (message: string) => localizeServerMessage(message, requestLocale(req));
  try {
    requireSameOrigin(req);
    const body = (await req.json()) as {
      username?: string;
      password?: string;
      email?: string;
      phone?: string;
    };
    const pending = await requestRegistrationVerification(
      body.username ?? "",
      body.password ?? "",
      body.email ?? "",
      body.phone ?? "",
    );
    const locale = requestLocale(req);
    const verifyUrl = buildVerifyUrl(pending.token, locale);
    const result = await sendRegisterVerifyEmail(pending.email, verifyUrl, locale);
    return NextResponse.json({
      ok: true,
      email: pending.email,
      message: t(
        result.delivered
          ? "验证邮件已发送，请查收并点击确认链接完成注册"
          : "SMTP 未配置，验证链接已写入 .data/mail-outbox.log",
      ),
    });
  } catch (e) {
    const originErr = sameOriginErrorResponse(e);
    if (originErr) return NextResponse.json({ error: t(originErr.error) }, { status: originErr.status });
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: t(message) }, { status: 400 });
  }
}
