import { NextRequest, NextResponse } from "next/server";
import { clearCookie, getSessionToken, logoutByToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const token = getSessionToken(req);
  if (token) {
    await logoutByToken(token);
  }
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", clearCookie());
  return res;
}
