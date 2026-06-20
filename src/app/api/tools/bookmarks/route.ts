import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import {
  loadBookmarkStateForUser,
  saveBookmarkStateForUser,
} from "@/lib/data/userBookmarks";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const state = await loadBookmarkStateForUser(user.id);
    return NextResponse.json({ state });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = (await req.json()) as { state?: unknown };
    const state = await saveBookmarkStateForUser(user.id, body?.state);
    return NextResponse.json({ state });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
