import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateInvestmentAiReview } from "@/lib/investmentAiReview";
import { getInvestmentCaseDetail, optionalDate, requiredText } from "@/lib/investments";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserByRequest(req); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const id = (await params).id; const investmentCase = await getInvestmentCaseDetail(user.id, id);
    const body = (await req.json()) as Record<string, unknown>;
    const mode = body.mode === "manual" ? "manual" : "ai";
    const dataCutoff = optionalDate(body.dataCutoff) ?? new Date();
    if (mode === "manual") {
      const review = await prisma.investmentReview.create({ data: { caseId: id, authorKind: "USER", title: requiredText(body.title, "复盘标题", 200), bodyMarkdown: requiredText(body.bodyMarkdown, "复盘内容", 100_000), dataCutoff } });
      return NextResponse.json({ review }, { status: 201 });
    }
    const ai = await generateInvestmentAiReview({ dataCutoff: dataCutoff.toISOString(), case: investmentCase });
    const review = await prisma.investmentReview.create({ data: { caseId: id, authorKind: "AI", title: `${investmentCase.symbol} AI 复盘`, bodyMarkdown: ai.bodyMarkdown, dataCutoff, model: ai.model, promptVersion: "investment-review-v1", inputHash: ai.inputHash } });
    return NextResponse.json({ review }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "复盘生成失败";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
