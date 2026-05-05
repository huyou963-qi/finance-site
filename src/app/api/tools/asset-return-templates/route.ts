import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import {
  loadTemplateStateForUser,
  saveTemplateStateForUser,
} from "@/lib/data/assetReturnTemplates";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const state = await loadTemplateStateForUser(user.id);
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
    const body = await req.json();
    const state = await saveTemplateStateForUser(user.id, body?.state);
    return NextResponse.json({ state });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

