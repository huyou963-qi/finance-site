import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { optionalDate, optionalNumber, optionalText, requireOwnedInvestmentCase, requiredText } from "@/lib/investments";

function catalystData(body: Record<string, unknown>) {
  const affectedAssets = Array.isArray(body.affectedAssets) ? body.affectedAssets.filter((v): v is string => typeof v === "string").map((v) => v.trim().toUpperCase()).filter(Boolean).slice(0, 30) : undefined;
  return {
    title: body.title === undefined ? undefined : requiredText(body.title, "Catalyst 名称", 200),
    direction: typeof body.direction === "string" ? body.direction.slice(0, 16) : undefined,
    probability: optionalNumber(body.probability, { min: 0, max: 100 }),
    impact: typeof body.impact === "string" ? body.impact.slice(0, 16) : undefined,
    status: typeof body.status === "string" ? body.status.slice(0, 20) : undefined,
    windowStart: optionalDate(body.windowStart, true), windowEnd: optionalDate(body.windowEnd, true),
    affectedAssets, transmission: optionalText(body.transmission), invalidation: optionalText(body.invalidation),
    actualOutcome: optionalText(body.actualOutcome), notes: optionalText(body.notes),
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserByRequest(req); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const id = (await params).id; await requireOwnedInvestmentCase(user.id, id);
    const body = (await req.json()) as Record<string, unknown>;
    const row = await prisma.investmentCatalyst.create({ data: { caseId: id, ...catalystData(body), title: requiredText(body.title, "Catalyst 名称", 200) } });
    return NextResponse.json({ catalyst: row }, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "保存失败" }, { status: 400 }); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserByRequest(req); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const id = (await params).id; await requireOwnedInvestmentCase(user.id, id);
    const body = (await req.json()) as Record<string, unknown>;
    const catalystId = requiredText(body.catalystId, "Catalyst ID", 64);
    const owned = await prisma.investmentCatalyst.findFirst({ where: { id: catalystId, caseId: id } });
    if (!owned) throw new Error("Catalyst 不存在");
    const row = await prisma.investmentCatalyst.update({ where: { id: catalystId }, data: catalystData(body) });
    return NextResponse.json({ catalyst: row });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "更新失败" }, { status: 400 }); }
}
