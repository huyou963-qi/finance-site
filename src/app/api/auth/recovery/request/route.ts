import { NextRequest, NextResponse } from "next/server";
import { requestAccountRecovery, type AccountRecoveryKind } from "@/lib/auth";
import {
  buildPasswordResetUrl,
  sendPasswordResetEmail,
  sendUsernameRecoveryEmail,
} from "@/lib/mail";

const GENERIC_MESSAGE = "如果该邮箱已绑定账户，我们会向它发送恢复邮件，请检查收件箱和垃圾邮件。";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; kind?: AccountRecoveryKind };
    if (body.kind !== "username" && body.kind !== "password") {
      return NextResponse.json({ error: "找回类型不正确" }, { status: 400 });
    }

    const recovery = await requestAccountRecovery(body.email ?? "", body.kind);
    if (recovery) {
      if (body.kind === "username") {
        await sendUsernameRecoveryEmail(recovery.email, recovery.username);
      } else if (recovery.token) {
        await sendPasswordResetEmail(recovery.email, buildPasswordResetUrl(recovery.token));
      }
    }

    // 不暴露邮箱是否注册，也不暴露是否因 60 秒冷却而跳过发送。
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "提交失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
