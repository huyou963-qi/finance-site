import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { asJson, optionalDate, optionalNumber, optionalText, requireOwnedInvestmentCase } from "@/lib/investments";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserByRequest(req); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const id = (await params).id; await requireOwnedInvestmentCase(user.id, id);
    const body = (await req.json()) as Record<string, unknown>;
    const data = {
      direction: typeof body.direction === "string" ? body.direction.slice(0, 12) : "long",
      entryLow: optionalNumber(body.entryLow, { min: 0 }), entryHigh: optionalNumber(body.entryHigh, { min: 0 }),
      stopPrice: optionalNumber(body.stopPrice, { min: 0 }), target1: optionalNumber(body.target1, { min: 0 }),
      target2: optionalNumber(body.target2, { min: 0 }), target3: optionalNumber(body.target3, { min: 0 }),
      targetWeightPct: optionalNumber(body.targetWeightPct, { min: 0, max: 100 }), riskPct: optionalNumber(body.riskPct, { min: 0, max: 100 }),
      timeStop: optionalDate(body.timeStop, true), thesis: optionalText(body.thesis), notes: optionalText(body.notes),
      invalidation: body.invalidation === undefined ? undefined : asJson(body.invalidation, []),
      gateResults: body.gateResults === undefined ? undefined : asJson(body.gateResults, {}),
      confirmedAt: body.confirmed ? new Date() : undefined,
    };
    const row = await prisma.investmentTradePlan.upsert({ where: { caseId: id }, create: { caseId: id, ...data }, update: data });
    return NextResponse.json({ tradePlan: row });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "保存失败" }, { status: 400 }); }
}
