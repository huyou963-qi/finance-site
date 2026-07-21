import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { deleteRun, getRunDetail } from "@/lib/quant/backtestRuns";

/**
 * run 详情（轮询）。?status=1 只回状态（省去大表读取）；否则 done 时附完整曲线/持仓。
 * 归属：run.userId 非空时须匹配当前用户。
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ runId: string }> }) {
  try {
    const user = await getUserByRequest(req);
    const { runId } = await ctx.params;
    const statusOnly = req.nextUrl.searchParams.get("status") === "1";
    const detail = await getRunDetail(runId, user?.id ?? null, !statusOnly);
    if (!detail) return NextResponse.json({ error: "回测不存在" }, { status: 404 });
    return NextResponse.json({ run: detail });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ runId: string }> }) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const { runId } = await ctx.params;
    const ok = await deleteRun(runId, user.id);
    if (!ok) return NextResponse.json({ error: "回测不存在" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
