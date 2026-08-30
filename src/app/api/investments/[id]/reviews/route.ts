import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { optionalDate, optionalText, requireOwnedInvestmentCase, requiredText } from "@/lib/investments";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserByRequest(req); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const id = (await params).id; await requireOwnedInvestmentCase(user.id, id);
    const body = (await req.json()) as Record<string, unknown>;
    const dataCutoff = optionalDate(body.dataCutoff) ?? new Date();
    const externalAi = body.mode !== "manual";
    const review = await prisma.investmentReview.create({ data: {
      caseId: id,
      authorKind: externalAi ? "EXTERNAL_AI" : "USER",
      title: requiredText(body.title, "复盘标题", 200),
      bodyMarkdown: requiredText(body.bodyMarkdown, "复盘内容", 100_000),
      dataCutoff,
      model: externalAi ? optionalText(body.sourceName, 64) : null,
      promptVersion: externalAi ? "external-skill-v1" : null,
    } });
    return NextResponse.json({ review }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "复盘保存失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
