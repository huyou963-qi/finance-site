import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInvestmentCaseDetail, INVESTMENT_STATUSES, INVESTMENT_STYLES, optionalDate, optionalText, requireOwnedInvestmentCase, requiredText } from "@/lib/investments";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    return NextResponse.json({ case: await getInvestmentCaseDetail(user.id, (await params).id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "加载失败" }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const id = (await params).id;
    await requireOwnedInvestmentCase(user.id, id);
    const body = (await req.json()) as Record<string, unknown>;
    const status = body.status === undefined ? undefined :
      typeof body.status === "string" && INVESTMENT_STATUSES.includes(body.status as never) ? body.status : (() => { throw new Error("案例状态无效"); })();
    const style = body.style === undefined ? undefined :
      typeof body.style === "string" && INVESTMENT_STYLES.includes(body.style as never) ? body.style : (() => { throw new Error("投资风格无效"); })();
    const row = await prisma.investmentCase.update({ where: { id }, data: {
      title: body.title === undefined ? undefined : requiredText(body.title, "案例名称", 160),
      style,
      status,
      horizon: optionalText(body.horizon, 80),
      coreThesis: optionalText(body.coreThesis),
      nextReviewAt: optionalDate(body.nextReviewAt),
      closedAt: status === "closed" ? new Date() : status ? null : undefined,
    }});
    return NextResponse.json({ case: row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "更新失败" }, { status: 400 });
  }
}
