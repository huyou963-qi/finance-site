import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { asJson, optionalText, requireOwnedInvestmentCase } from "@/lib/investments";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const id = (await params).id;
    await requireOwnedInvestmentCase(user.id, id);
    const body = (await req.json()) as { content?: unknown; note?: unknown };
    if (!body.content || typeof body.content !== "object") throw new Error("研究内容不能为空");
    const latest = await prisma.investmentResearchVersion.findFirst({ where: { caseId: id }, orderBy: { version: "desc" }, select: { version: true } });
    const version = await prisma.investmentResearchVersion.create({ data: {
      caseId: id, version: (latest?.version ?? 0) + 1,
      content: asJson(body.content, {}), note: optionalText(body.note, 256),
    }});
    return NextResponse.json({ version }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存失败" }, { status: 400 });
  }
}
