import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import {
  loadMacroChartPrefsForUser,
  saveMacroChartPrefsForUser,
} from "@/lib/data/macroChartPrefs";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const prefs = await loadMacroChartPrefsForUser(user.id);
    return NextResponse.json({ prefs });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = (await req.json()) as { prefs?: unknown };
    const prefs = await saveMacroChartPrefsForUser(user.id, body.prefs);
    return NextResponse.json({ prefs });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

