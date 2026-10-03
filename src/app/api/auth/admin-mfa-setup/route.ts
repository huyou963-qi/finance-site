import { NextRequest, NextResponse } from "next/server";
import { completeAdminMfaSetup } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { setupToken?: string; code?: string };
    const { cookie, user, recoveryCodes } = await completeAdminMfaSetup(body.setupToken ?? "", body.code ?? "");
    const response = NextResponse.json({ user, recoveryCodes });
    response.headers.append("Set-Cookie", cookie);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "设置失败" }, { status: 400 });
  }
}
