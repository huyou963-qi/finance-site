import { NextRequest, NextResponse } from "next/server";
import { clearCookie, getSessionToken, logoutByToken } from "@/lib/auth";
import { requireSameOrigin, sameOriginErrorResponse } from "@/lib/http/sameOrigin";

export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
  } catch (e) {
    const originErr = sameOriginErrorResponse(e);
    if (originErr) return NextResponse.json({ error: originErr.error }, { status: originErr.status });
    throw e;
  }
  const token = getSessionToken(req);
  if (token) {
    await logoutByToken(token);
  }
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", clearCookie());
  return res;
}
