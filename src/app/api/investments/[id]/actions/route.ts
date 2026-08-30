import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ACTION_TYPES, optionalDate, optionalNumber, optionalText, requireOwnedInvestmentCase, requiredText } from "@/lib/investments";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserByRequest(req); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const id = (await params).id; const investmentCase = await requireOwnedInvestmentCase(user.id, id);
    const body = (await req.json()) as Record<string, unknown>;
    const actionType = requiredText(body.actionType, "动作类型", 24).toUpperCase();
    if (!ACTION_TYPES.includes(actionType as never)) throw new Error("动作类型无效");
    const quantity = optionalNumber(body.quantity, { min: 0 });
    const price = optionalNumber(body.price, { min: 0 });
    if (["BUY", "ADD", "TRIM", "SELL"].includes(actionType) && (quantity == null || price == null)) throw new Error("交易动作必须填写数量和成交价");
    const occurredAt = optionalDate(body.occurredAt) ?? new Date();
    const row = await prisma.investmentAction.create({ data: {
      caseId: id, actionType, occurredAt, quantity, price,
      fee: optionalNumber(body.fee, { min: 0 }), positionWeightPct: optionalNumber(body.positionWeightPct, { min: 0, max: 100 }),
      reasonCode: optionalText(body.reasonCode, 40), thesisImpact: optionalText(body.thesisImpact, 16),
      planMatched: typeof body.planMatched === "boolean" ? body.planMatched : null, note: optionalText(body.note),
    }});
    const status = actionType === "SELL" ? "closed" : ["BUY", "ADD", "TRIM"].includes(actionType) && investmentCase.status !== "closed" ? "holding" : undefined;
    if (status) await prisma.investmentCase.update({ where: { id }, data: { status, closedAt: status === "closed" ? occurredAt : null } });
    return NextResponse.json({ action: row }, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "记录失败" }, { status: 400 }); }
}
