import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      identifier?: string;
      username?: string;
      password?: string;
      totpCode?: string;
    };
    const result = await loginUser(
      body.identifier ?? body.username ?? "",
      body.password ?? "",
      body.totpCode ?? "",
    );
    if (result.kind === "mfa-required") return NextResponse.json({ mfaRequired: true });
    if (result.kind === "mfa-setup") {
      return NextResponse.json({ mfaSetup: true, setupToken: result.setupToken, secret: result.secret, uri: result.uri });
    }
    const res = NextResponse.json({ user: result.user });
    res.headers.append("Set-Cookie", result.cookie);
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
