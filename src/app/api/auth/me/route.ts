import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getUserByRequest(req);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}
