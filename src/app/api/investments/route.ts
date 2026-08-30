import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVESTMENT_STATUSES, INVESTMENT_STYLES, listInvestmentCases, optionalDate, optionalText, parseSymbol, requiredText } from "@/lib/investments";

export async function GET(req: NextRequest) {
  const user = await getUserByRequest(req);
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  return NextResponse.json({ cases: await listInvestmentCases(user.id) });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = (await req.json()) as Record<string, unknown>;
    const style = typeof body.style === "string" && INVESTMENT_STYLES.includes(body.style as never) ? body.style : "long_term";
    const status = typeof body.status === "string" && INVESTMENT_STATUSES.includes(body.status as never) ? body.status : "research";
    const row = await prisma.investmentCase.create({ data: {
      userId: user.id,
      symbol: parseSymbol(body.symbol),
      title: requiredText(body.title, "案例名称", 160),
      style,
      status,
      horizon: optionalText(body.horizon, 80),
      coreThesis: optionalText(body.coreThesis),
      nextReviewAt: optionalDate(body.nextReviewAt),
    }});
    return NextResponse.json({ case: row }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "创建失败" }, { status: 400 });
  }
}
